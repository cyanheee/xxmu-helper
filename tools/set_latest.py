#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""只切 cfg.latest 到某个已存在的包指纹，不动 apk:blob。

为什么需要它：`publish_apk.py` 是一条龙（写 blob → 写 meta → 回读校验 → 切 latest），
末尾还会用 BASE 做线上自检。当 BASE 指向的域名本机解析不了时，自检那一步会崩，
于是「数据写成功了但进程非零退出」—— 这时候如果重跑一遍完整发布，会白白多传一次
几百 KB 的包；如果不管，就会留下「blob 是旧版、latest 是新版」的错配。

这个脚本只做最后那一步，并且**必须读取 apk/ 里真实的包来填字段**，
不允许手写版本号 —— 手写就是 v1.1.15 那次「cfg 说新版本、下载到旧字节」的根源。
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ACCOUNT_ID = 'ebb7ecfd16008b9e3696ad5b4bc930d7'
KV_NAMESPACE = '02669ca1cef04c5e930d4e3bb2d0d780'
API = ('https://api.cloudflare.com/client/v4/accounts/%s/storage/kv/namespaces/%s/values'
       % (ACCOUNT_ID, KV_NAMESPACE))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = r'D:\_cftoken.txt'


def token():
    with open(TOKEN_FILE, encoding='utf-8') as f:
        return f.read().strip()


def kv_get(tok, key):
    req = urllib.request.Request(API + '/' + key, method='GET')
    req.add_header('Authorization', 'Bearer ' + tok)
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read()
    txt = body.decode('utf-8', 'replace')
    if txt.startswith('"') and txt.endswith('"'):
        try:
            return json.loads(txt)
        except Exception:                                    # noqa: BLE001
            return txt
    return txt


def kv_put(tok, key, body, ctype):
    req = urllib.request.Request(API + '/' + key, data=body, method='PUT')
    req.add_header('Authorization', 'Bearer ' + tok)
    req.add_header('Content-Type', ctype)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def apk_facts(path):
    """从 APK 自身读版本号（不能读磁盘 manifest —— 出完包再改清单会错配）。"""
    sdk = os.environ.get('ANDROID_HOME') or r'D:\android-sdk'
    aapt2 = os.path.join(sdk, 'build-tools', '33.0.2', 'aapt2.exe')
    out = subprocess.run([aapt2, 'dump', 'badging', path],
                         capture_output=True, text=True, encoding='utf-8',
                         errors='replace').stdout
    vn = re.search(r"versionName='([^']+)'", out)
    vc = re.search(r"versionCode='(\d+)'", out)
    if not (vn and vc):
        raise SystemExit('aapt2 读不出 %s 的版本号' % path)
    with open(path, 'rb') as f:
        blob = f.read()
    return {
        'name': os.path.basename(path),
        'size': len(blob),
        'sha256': hashlib.sha256(blob).hexdigest(),
        'ver': vn.group(1),
        'code': int(vc.group(1)),
        'at': int(time.time()),
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit('用法： python tools/set_latest.py apk/xxmu-helper-v1.1.16.apk [--url URL]')
    apk = sys.argv[1]
    if not os.path.isabs(apk):
        apk = os.path.join(ROOT, apk)
    if not os.path.exists(apk):
        raise SystemExit('找不到 ' + apk)

    url = 'https://xxmu-auth.pages.dev/v1/apk'
    if '--url' in sys.argv:
        url = sys.argv[sys.argv.index('--url') + 1]

    facts = apk_facts(apk)
    # v1.1.44：URL 一律补/换成带 ?v=<sha 前缀> 的版本化形式。
    # release_all.py 的兜底会传 --url BASE + '/v1/apk'（无参数），
    # 若不在这里补，就会把旧 URL 写回 cfg，边缘缓存整条失效。
    base_url = url.split('?')[0]
    url = base_url + '?v=' + facts['sha256'][:12]
    print('目标包：', facts['name'])
    print('  版本 %s / code %d / %d 字节' % (facts['ver'], facts['code'], facts['size']))
    print('  sha256 %s' % facts['sha256'])

    tok = token()
    cur = kv_get(tok, 'cfg')
    cfg = json.loads(cur) if isinstance(cur, str) else cur
    old = dict(cfg.get('latest') or {})
    print('当前 latest：%s / code %s' % (old.get('version'), old.get('code')))

    latest = dict(old)
    latest.update({
        'version': facts['ver'],
        'code': facts['code'],
        'url': url,
        'size': facts['size'],
        'sha256': facts['sha256'],
    })
    cfg['latest'] = latest
    kv_put(tok, 'cfg', json.dumps(cfg, ensure_ascii=False).encode('utf-8'),
           'application/json; charset=utf-8')
    print('已切到 %s / code %d' % (facts['ver'], facts['code']))

    # 回读确认（不依赖任何自定义域名，直接用 KV REST）
    back = json.loads(kv_get(tok, 'cfg'))
    lb = back.get('latest') or {}
    ok = (lb.get('version') == facts['ver'] and lb.get('code') == facts['code']
          and lb.get('sha256') == facts['sha256'])
    print('回读校验：%s（%s / %s）' % ('通过' if ok else '不一致', lb.get('version'), lb.get('code')))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
