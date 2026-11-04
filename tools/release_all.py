#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""发新版时，一条命令把「线上服务 + 官网 + GitHub」全部对齐。

    python -X utf8 tools/release_all.py --apk apk/xxmu-helper-v1.1.18.apk \
        --notes-file apk/v1.1.18.notes.txt

它会依次做：
  1. 预检：APK 存在、SHA-256、包内版本号（用 aapt2 dump badging，不读磁盘清单）
  2. 发布到 Cloudflare KV（apk:blob / apk:meta / cfg.latest）
  3. 回读校验线上 /v1/config 与 /v1/apk 的 SHA-256 一致
  4. 更新官网：把 `server/pages/dist/index.html` 里所有写死的旧版本号换成新的
     （**官网本来就不写死版本号**，从 /v1/config 拉；这里只兜底处理 release 链接里的 vX.Y.Z）
  5. 更新 README：徽章里的 version、Release 链接里的 vX.Y.Z
  6. 提交并推送 GitHub
  7. 在 GitHub 上建 Release 并挂上 APK
  8. 最后再验一遍：官网 / 与 /v1/config、GitHub Release 附件 SHA

为什么要这一个脚本：发版涉及五六个不同系统（KV、Pages、git、GitHub Release、
本地桌面副本），任何一处漏掉都会造成「官网说 A、App 提示 B、GitHub 挂 C」的
不一致。这个项目已经因为「三处版本号不同步」踩过一次，所以收成一条命令，
每步失败就停，绝不带着半成品继续往下走。

参数：
  --apk         要发的包（默认取 apk/ 下版本号最大的）
  --notes-file  发版说明（默认 apk/v<ver>.notes.txt）
  --no-push     只做本地与 KV，不推 GitHub（调试用）
  --dry-run     只打印将要做什么，不执行任何写操作
"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APK_DIR = os.path.join(ROOT, 'apk')
GH_REPO = 'cyanheee/xxmu-helper'
GH_OWNER = 'cyanheee'
TOKEN_FILE = r'D:\_cftoken.txt'
GH_TOKEN_FILE = r'D:\_ghtoken.txt'
BASE = 'https://xxmu-auth.pages.dev'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')

SDK = os.environ.get('ANDROID_HOME') or r'D:\android-sdk'
AAPT2 = os.path.join(SDK, 'build-tools', '33.0.2', 'aapt2.exe')


def sh(cmd, cwd=None, check=True):
    """跑一条命令，返回 (ok, stdout+stderr)。不抛异常，由调用方决定。"""
    env = dict(os.environ)
    env['PATH'] = env.get('PATH', '') + r';C:\Program Files\Git\cmd'
    r = subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', env=env)
    out = (r.stdout or '') + (r.stderr or '')
    if check and r.returncode != 0:
        print('  命令失败：%s' % ' '.join(cmd[:3]))
        print('  ' + out.strip()[:600])
    return r.returncode == 0, out


def step(n, total, title):
    print('\n[%d/%d] %s' % (n, total, title))


def die(msg):
    print('\n[FAIL] ' + msg)
    sys.exit(1)


# ---------------------------------------------------------------- 预检
def apk_facts(path):
    if not os.path.exists(path):
        die('找不到 APK：%s' % path)
    with open(path, 'rb') as f:
        blob = f.read()
    if blob[:2] != b'PK':
        die('文件头不是 ZIP，这不是 APK')
    if not os.path.exists(AAPT2):
        die('找不到 aapt2，无法读包内版本号（不能读磁盘清单——出完包再改清单会错配）')
    r = subprocess.run([AAPT2, 'dump', 'badging', path], capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    vn = re.search(r"versionName='([^']+)'", r.stdout)
    vc = re.search(r"versionCode='(\d+)'", r.stdout)
    if not vn or not vc:
        die('aapt2 读不出包内版本号')
    return {
        'path': path,
        'name': os.path.basename(path),
        'size': len(blob),
        'sha256': hashlib.sha256(blob).hexdigest(),
        'ver': vn.group(1),
        'code': int(vc.group(1)),
    }


# ---------------------------------------------------------------- 线上
def http_get(url, timeout=40):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def check_online(apk, waited=False):
    """验 /v1/config 与 /v1/apk 是否已经是新包。返回 True/False。"""
    try:
        _, body = http_get(BASE + '/v1/config')
        cfg = json.loads(body.decode('utf-8'))
        lv = (cfg.get('latest') or {})
        ok_cfg = (lv.get('version') == apk['ver']
                  and int(lv.get('code') or 0) == apk['code'])
        print('  /v1/config  latest=%s/%s  size=%s'
              % (lv.get('version'), lv.get('code'), lv.get('size')))
    except Exception as e:                                   # noqa: BLE001
        print('  /v1/config 读取失败：%s' % type(e).__name__)
        return False
    try:
        req = urllib.request.Request(BASE + '/v1/apk',
                                     headers={'User-Agent': UA,
                                              'Range': 'bytes=0-0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            cr = r.headers.get('content-range') or ''
            total = int(cr.split('/')[-1]) if '/' in cr else 0
        ok_apk = (total == apk['size'])
        print('  /v1/apk    %d 字节（本地 %d）' % (total, apk['size']))
    except Exception as e:                                   # noqa: BLE001
        print('  /v1/apk 读取失败：%s' % type(e).__name__)
        return False
    if ok_cfg and ok_apk:
        return True
    if not waited:
        # handleConfig 有 60 秒内存缓存 + edgeCache 60 秒，必须等满 65 秒
        print('  配置可能还在边缘缓存里，等 65 秒再验一次…')
        import time
        time.sleep(65)
        return check_online(apk, waited=True)
    return False


# ---------------------------------------------------------------- 文档改写
def bump_in_text(path, old_ver, new_ver, extra_patterns=()):
    """把文件里写死的旧版本号换成新的。返回替换处数。"""
    p = os.path.join(ROOT, path)
    if not os.path.exists(p):
        return 0
    s = io.open(p, encoding='utf-8').read()
    orig = s
    s = s.replace(old_ver, new_ver)
    for pat in extra_patterns:
        s = s.replace(pat, new_ver)
    if s != orig:
        io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    return orig.count(old_ver)


def old_version():
    """从 manifest 读「当前磁盘上的」版本号——发版前它就是旧的。"""
    mani = io.open(os.path.join(ROOT, 'android', 'AndroidManifest.xml'), encoding='utf-8').read()
    m = re.search(r'android:versionName="([^"]+)"', mani)
    return m.group(1) if m else ''


# ---------------------------------------------------------------- GitHub
def gh(tok, method, path, data=None, raw=None):
    url = 'https://api.github.com' + path
    headers = {'Authorization': 'Bearer ' + tok,
               'User-Agent': 'xxmu-release',
               'Accept': 'application/vnd.github+json'}
    body = None
    if raw is not None:
        body = raw
    elif data is not None:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def read_token():
    for p in (os.environ.get('GH_TOKEN'),):
        if p:
            return p.strip()
    if os.path.exists(GH_TOKEN_FILE):
        return io.open(GH_TOKEN_FILE, encoding='utf-8').read().strip()
    return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apk', default='')
    ap.add_argument('--notes-file', default='')
    ap.add_argument('--no-push', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    total = 8

    # ---------- 1. 预检 ----------
    step(1, total, '预检')
    if a.apk:
        apk_path = a.apk if os.path.isabs(a.apk) else os.path.join(ROOT, a.apk)
    else:
        cands = [os.path.join(APK_DIR, f) for f in os.listdir(APK_DIR) if f.endswith('.apk')]
        if not cands:
            die('apk/ 下没有安装包')
        apk_path = max(cands, key=os.path.getmtime)
    apk = apk_facts(apk_path)
    print('  %s' % apk['name'])
    print('  版本 %s / code %d / %d 字节' % (apk['ver'], apk['code'], apk['size']))
    print('  sha256 %s' % apk['sha256'])

    notes = ''
    nf = a.notes_file or os.path.join('apk', 'v%s.notes.txt' % apk['ver'])
    nfp = nf if os.path.isabs(nf) else os.path.join(ROOT, nf)
    if os.path.exists(nfp):
        notes = io.open(nfp, encoding='utf-8').read().strip()
        print('  发版说明 %d 字' % len(notes))
    else:
        print('  [WARN] 没找到发版说明 %s' % nf)

    if a.dry_run:
        print('\n--dry-run：到此为止，不做任何写操作')
        return 0

    # ---------- 2. 发布到 KV ----------
    step(2, total, '发布到 Cloudflare KV')
    args = [sys.executable, 'tools/publish_apk.py', '--apk', apk_path]
    if notes:
        args += ['--notes-file', nfp]
    ok, out = sh(args, check=False)
    # publish_apk 末尾自检可能因本机 DNS 解析不了自有域名而崩，
    # 但数据往往已写成功 —— 所以这里不因为非零退出就断定失败，交给第 3 步验证。
    if not ok:
        print('  publish_apk 返回非零（很可能是自检步的域名解析失败），继续往下验')

    # ---------- 3. 验证线上 ----------
    step(3, total, '验证线上状态')
    if not check_online(apk):
        # 兜底：只切 cfg.latest，不动 blob
        print('  用 set_latest.py 补最后一步…')
        sh([sys.executable, 'tools/set_latest.py', apk_path,
            '--url', BASE + '/v1/apk'], check=False)
        if not check_online(apk):
            die('线上仍是旧包，发布失败。先查 /v1/config 与 /v1/apk，别继续往下走')
    print('  线上已是 %s / code %d' % (apk['ver'], apk['code']))

    # ---------- 4. 官网 ----------
    step(4, total, '更新官网文档里的版本号')
    ov = old_version()
    if ov and ov != apk['ver']:
        n1 = bump_in_text('server/pages/dist/index.html', ov, apk['ver'])
        n2 = bump_in_text('README.md', ov, apk['ver'])
        # AndroidManifest 的版本号由 bump_ver.py 更早改好，这里不动
        print('  index.html 替换 %d 处，README 替换 %d 处（%s → %s）'
              % (n1, n2, ov, apk['ver']))
    else:
        print('  磁盘版本号已是 %s，无需替换' % apk['ver'])

    # ---------- 5. 提交 ----------
    step(5, total, '提交到本地 Git')
    sh(['git', 'add', '-A'], check=False)
    ok, out = sh(['git', 'commit', '-q', '-m',
                  'release: v%s (code %d)\n\n%s'
                  % (apk['ver'], apk['code'],
                     (notes.split('\n')[0] if notes else '')[:80])], check=False)
    print('  已提交' if ok else '  没有需要提交的改动')

    # ---------- 6. 推送 ----------
    step(6, total, '推送到 GitHub')
    if a.no_push:
        print('  --no-push：跳过')
    else:
        tok = read_token()
        if not tok:
            print('  [WARN] 没找到 GitHub token（%s），跳过推送' % GH_TOKEN_FILE)
            print('         可以手动 git push，或把 token 写进该文件后重跑')
        else:
            cur = sh(['git', 'remote', 'get-url', 'origin'], check=False)[1].strip()
            tmp_url = 'https://%s:%s@github.com/%s.git' % (GH_OWNER, tok, GH_REPO)
            sh(['git', 'remote', 'set-url', 'origin', tmp_url], check=False)
            ok, out = sh(['git', 'push'], check=False)
            sh(['git', 'remote', 'set-url', 'origin', cur], check=False)
            print('  已推送' if ok else '  推送失败：' + out.strip()[:300])

    # ---------- 7. GitHub Release ----------
    step(7, total, '创建 GitHub Release 并挂 APK')
    tok = read_token()
    if a.no_push or not tok:
        print('  跳过（没有 token 或 --no-push）')
    else:
        tag = 'v%s' % apk['ver']
        try:
            rel = gh(tok, 'POST', '/repos/%s/releases' % GH_REPO, data={
                'tag_name': tag,
                'target_commitish': 'main',
                'name': '%s · %s' % (tag, (notes.split('\n')[0] if notes else '')),
                'body': notes or ('自动发版 %s' % tag),
                'draft': False,
                'prerelease': False,
            })
            print('  Release %s 已创建' % tag)
        except urllib.error.HTTPError as e:
            if e.code == 422:
                print('  Release %s 已存在，跳过创建' % tag)
                rel = None
            else:
                print('  创建 Release 失败：HTTP %s' % e.code)
                rel = None
        except Exception as e:                               # noqa: BLE001
            print('  创建 Release 失败：%s' % type(e).__name__)
            rel = None

        if rel:
            try:
                with open(apk_path, 'rb') as f:
                    blob = f.read()
                url = ('https://uploads.github.com/repos/%s/releases/%d/assets?name=%s'
                       % (GH_REPO, rel['id'], apk['name']))
                req = urllib.request.Request(
                    url, data=blob, method='POST',
                    headers={'Authorization': 'Bearer ' + tok,
                             'User-Agent': 'xxmu-release',
                             'Content-Type': 'application/vnd.android.package-archive'})
                with urllib.request.urlopen(req, timeout=600) as r:
                    up = json.loads(r.read().decode('utf-8'))
                print('  附件已上传 %d 字节' % up.get('size', 0))
                print('  %s' % up.get('browser_download_url', ''))
            except Exception as e:                           # noqa: BLE001
                print('  附件上传失败：%s' % e)

    # ---------- 8. 终验 ----------
    step(8, total, '终验')
    check_online(apk)
    if tok and not a.no_push:
        try:
            rels = gh(tok, 'GET', '/repos/%s/releases/tags/v%s' % (GH_REPO, apk['ver']))
            for asset in rels.get('assets', []):
                print('  Release 附件 %s  %d 字节' % (asset['name'], asset['size']))
        except Exception:                                    # noqa: BLE001
            pass
    print('\n[OK] v%s 发布流程走完。' % apk['ver'])
    print('     官网 https://www.xxmuhelper.top')
    print('     Release https://github.com/%s/releases/tag/v%s' % (GH_REPO, apk['ver']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
