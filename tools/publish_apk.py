# -*- coding: utf-8 -*-
"""把打好的 APK 直接推进 Cloudflare KV，并把线上 latest 指过去。

为什么不用 Worker 的 /v1/admin/upload：
    那条路由要 X-Admin-Key，而 ADMIN_KEY 是部署时随机生成、只写在
    server/DEPLOY-OUT.txt（本机没有）里的 secret，敲不出来。但 KV 是可以
    用 Cloudflare API Token 直接写的 —— 同一个 AUTH 命名空间，写进去的
    apk:blob / apk:meta / cfg 三个键与 /v1/admin/upload 写下的完全等价
    （键名见 server/worker.js:342-343 与 :435）。

用法：
    python tools/publish_apk.py                      # 用 apk/ 里最新的包
    python tools/publish_apk.py --apk apk/xx.apk --notes "更新说明"
    python tools/publish_apk.py --no-publish         # 只存不切 latest

令牌来源（按顺序）：环境变量 CLOUDFLARE_API_TOKEN → 文件 D:\\_cftoken.txt
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ACCOUNT_ID = 'ebb7ecfd16008b9e3696ad5b4bc930d7'
KV_NAMESPACE = '02669ca1cef04c5e930d4e3bb2d0d780'
# v1.1.17 起是自有域名（2026-11-04 接通，Pages custom domain = active）。
# 注意这里只有「学生实际访问的入口」变了，Worker 本体仍是 xxmu-auth.yg-xxmu.workers.dev，
# 由 Pages 那层薄代理转发。旧地址 xxmu-auth.pages.dev 依然可用，作为回滚口。
BASE = 'https://www.xxmuhelper.top'
API = 'https://api.cloudflare.com/client/v4/accounts/%s/storage/kv/namespaces/%s/values'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APK_DIR = os.path.join(ROOT, 'apk')
MANIFEST = os.path.join(ROOT, 'android', 'AndroidManifest.xml')


def read_token():
    tok = (os.environ.get('CLOUDFLARE_API_TOKEN') or '').strip()
    if tok:
        return tok
    p = r'D:\_cftoken.txt'
    if os.path.exists(p):
        return open(p, encoding='utf-8').read().strip()
    sys.exit('缺少令牌：设置 CLOUDFLARE_API_TOKEN，或写入 D:\\_cftoken.txt')


def _open_retry(req, timeout=60, tries=4):
    """带重试的 urlopen。

    学校这条网到 api.cloudflare.com 的 TLS 握手会间歇性被掐，报
    `EOF occurred in violation of protocol` 或 `handshake operation timed out`，
    而同一个域名用 curl 打又是 0.8 秒就通 —— 不是令牌问题、也不是封禁，
    纯粹是这条链路偶发。以前没重试，一次握手失败就整趟发布中断，
    还得人工判断「到底写进去没有」。改成退避重试 4 次，
    每次间隔 2/4/6 秒；仍然失败才把原始异常抛出去。"""
    last = None
    for i in range(tries):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError:
            raise                      # 4xx/5xx 是明确答复，不该重试
        except Exception as e:         # noqa: BLE001 - 网络层什么都可能抛
            last = e
            if i < tries - 1:
                print('  网络抖动（%s），%.0f 秒后重试…' % (type(e).__name__, 2 * (i + 1)))
                time.sleep(2 * (i + 1))
    raise last


def kv_put(token, key, body, content_type='application/octet-stream'):
    url = (API % (ACCOUNT_ID, KV_NAMESPACE)) + '/' + urllib.parse.quote(key, safe='')
    req = urllib.request.Request(url, data=body, method='PUT')
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Content-Type', content_type)
    try:
        with _open_retry(req, timeout=180) as r:
            out = json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        sys.exit('写 %s 失败：HTTP %s %s' % (key, e.code, e.read().decode('utf-8', 'replace')[:800]))
    if not out.get('success'):
        sys.exit('写 %s 失败：%s' % (key, json.dumps(out, ensure_ascii=False)[:800]))
    return out


def kv_get(token, key, raw=False):
    url = (API % (ACCOUNT_ID, KV_NAMESPACE)) + '/' + urllib.parse.quote(key, safe='')
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', 'Bearer ' + token)
    try:
        with _open_retry(req, timeout=90) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        sys.exit('读 %s 失败：HTTP %s' % (key, e.code))
    # KV 的 REST 接口对「文本值」返回 JSON 编码的字符串；对 arrayBuffer 返回裸字节。
    if raw:
        return body
    try:
        txt = body.decode('utf-8')
    except UnicodeDecodeError:
        return body
    if txt.startswith('"') and txt.endswith('"'):
        try:
            return json.loads(txt)
        except Exception:
            return txt
    return txt


def latest_apk():
    if not os.path.isdir(APK_DIR):
        sys.exit('没有 apk/ 目录')
    cands = [os.path.join(APK_DIR, f) for f in os.listdir(APK_DIR) if f.endswith('.apk')]
    if not cands:
        sys.exit('apk/ 里没有 .apk')
    return max(cands, key=os.path.getmtime)


def manifest_ver(apk_path):
    """从 **APK 自身** 读出真实版本号。

    v1.1.15 修：原来读的是磁盘上的 `android/AndroidManifest.xml`，而不是包里那份。
    两者在「出完包又改了清单」之后就会不一致 —— 比如出完 v1.1.15、
    想把 v1.1.14 的旧包重新发一次（回滚），清单里写着 1.1.15，
    于是 cfg.latest 被记成 1.1.15、而 apk:blob 里是 1.1.14 的字节：
    学生端看到「有新版本」但装上去还是旧版，永远升不完；
    `/v1/apk` 的 `x-apk-ver` 与 `cfg.latest.version` 也对不上。
    这类错误没有任何报错，只能靠事后比对才发现。

    优先用 aapt2 dump badging 读包内清单；aapt2 不在就直接读 ZIP 里的二进制
    AndroidManifest（在 UTF-16 区段里扫版本号不现实），所以退而求其次读磁盘清单
    但**明确打警告**，让调用方知道自己在赌。
    """
    aapt2 = os.environ.get('AAPT2') or ''
    if not aapt2:
        sdk = os.environ.get('ANDROID_HOME') or r'D:\android-sdk'
        cand = os.path.join(sdk, 'build-tools', '33.0.2', 'aapt2.exe')
        aapt2 = cand if os.path.exists(cand) else ''
    if aapt2:
        try:
            out = subprocess.run([aapt2, 'dump', 'badging', apk_path],
                                 capture_output=True, text=True,
                                 encoding='utf-8', errors='replace').stdout
            vn = re.search(r"versionName='([^']+)'", out)
            vc = re.search(r"versionCode='(\d+)'", out)
            if vn and vc:
                return vn.group(1), int(vc.group(1))
            print('  !! aapt2 没读到版本号，退回读磁盘清单（清单可能与包不一致）')
        except Exception as e:                                   # noqa: BLE001
            print('  !! aapt2 执行失败（%s），退回读磁盘清单' % type(e).__name__)
    else:
        print('  !! 找不到 aapt2，退回读磁盘清单（清单可能与包不一致）')

    mani = open(MANIFEST, encoding='utf-8').read()
    vn = re.search(r'versionName="([^"]+)"', mani)
    vc = re.search(r'versionCode="(\d+)"', mani)
    if not vn or not vc:
        sys.exit('解析 AndroidManifest.xml 的 versionCode/versionName 失败')
    print('  !! 用的是磁盘清单的 %s/%s —— 发布旧包时这里会是错的' % (vn.group(1), vc.group(1)))
    return vn.group(1), int(vc.group(1))


def http_open(url, timeout=30):
    """带浏览器 UA 取一次。Cloudflare 边缘会直接 403 掉 python-urllib 的默认 UA，
    所以自检这一步必须伪装成浏览器，否则会以为「发布失败」。"""
    req = urllib.request.Request(url, method='GET')
    req.add_header('User-Agent', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 '
                                 '(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')
    return urllib.request.urlopen(req, timeout=timeout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apk', default='')
    ap.add_argument('--notes', default='')
    ap.add_argument('--notes-file', default='')
    ap.add_argument('--no-publish', action='store_true')
    args = ap.parse_args()

    apk = args.apk or latest_apk()
    if not os.path.exists(apk):
        sys.exit('找不到 APK：' + apk)
    blob = open(apk, 'rb').read()
    if blob[:2] != b'PK':
        sys.exit('这不是 APK：文件头不是 ZIP（PK）')
    if len(blob) < 1024:
        sys.exit('文件太小，不像安装包')

    sha = hashlib.sha256(blob).hexdigest()
    vname, vcode = manifest_ver(apk)

    notes = args.notes
    if args.notes_file:
        notes = open(args.notes_file, encoding='utf-8').read().strip()

    token = read_token()
    print('APK     :', os.path.relpath(apk, ROOT))
    print('version : %s (code %d)' % (vname, vcode))
    print('size    :', len(blob))
    print('sha256  :', sha)

    # 1) 二进制本体
    kv_put(token, 'apk:blob', blob, 'application/octet-stream')
    print('[1/4] apk:blob 已写入')

    # 2) 元信息（与 /v1/admin/upload 写的字段同名）
    meta = {
        'name': os.path.basename(apk),
        'size': len(blob),
        'sha256': sha,
        'ver': vname,
        'code': vcode,
        'at': int(time.time()),
    }
    kv_put(token, 'apk:meta', json.dumps(meta, ensure_ascii=False).encode('utf-8'),
           'application/json; charset=utf-8')
    print('[2/4] apk:meta 已写入')

    # 3) 回读校验本体没被截断
    back = kv_get(token, 'apk:blob', raw=True)
    if back is None:
        sys.exit('回读 apk:blob 为空')
    bsha = hashlib.sha256(back).hexdigest()
    if bsha != sha:
        sys.exit('回读校验失败：线上 %d 字节 %s ≠ 本地 %d 字节 %s'
                 % (len(back), bsha[:16], len(blob), sha[:16]))
    print('[3/4] 回读校验通过（%d 字节，SHA-256 一致）' % len(back))

    # 4) 切 latest
    raw_cfg = kv_get(token, 'cfg')
    if not isinstance(raw_cfg, str):
        sys.exit('读到的 cfg 不是文本，中止（不敢覆盖）')
    cfg = json.loads(raw_cfg)
    old = dict(cfg.get('latest') or {})
    if args.no_publish:
        print('[4/4] --no-publish：cfg 未改动，latest 仍是 %s/%s'
              % (old.get('version'), old.get('code')))
        return 0

    latest = dict(old)
    latest.update({
        'version': vname,
        'code': vcode,
        'url': BASE + '/v1/apk',
        'size': len(blob),
        'sha256': sha,
    })
    if notes:
        latest['notes'] = notes
    cfg['latest'] = latest
    # min.code 保持 0：不强制升级，只在检测到新版本时提示
    kv_put(token, 'cfg', json.dumps(cfg, ensure_ascii=False).encode('utf-8'),
           'application/json; charset=utf-8')
    print('[4/4] cfg.latest 已切到 %s / code %s' % (vname, vcode))

    # 线上自检
    print('\n线上自检：')
    with http_open(BASE + '/v1/config', 30) as r:
        live = json.loads(r.read().decode('utf-8'))
    lv = live.get('latest') or {}
    print('  /v1/config  latest=%s code=%s size=%s sha=%s…'
          % (lv.get('version'), lv.get('code'), lv.get('size'), str(lv.get('sha256'))[:16]))
    with http_open(BASE + '/v1/apk', 180) as r:
        got = r.read()
    gsha = hashlib.sha256(got).hexdigest()
    print('  /v1/apk     %d 字节 sha=%s…' % (len(got), gsha[:16]))
    if gsha != sha:
        print('  !! 下载回来的包和本地不一致')
        return 1
    print('  下载链路一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())
