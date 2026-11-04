# -*- coding: utf-8 -*-
"""更新线上公告（KV 里的 cfg.notice / noticeTitle / noticeAt）。

用法：
    python tools/set_notice.py --title "标题" --body-file notices/xxx.txt
    python tools/set_notice.py --clear

为什么不走 /v1/admin/setcfg：那个接口要 X-Admin-Key，而 ADMIN_KEY 是
tools/deploy_server.ps1 部署时随机生成的，本机那份早就丢了（见 HANDOFF 坑 9）。
Cloudflare API Token 能直接写 KV，效果与管理员接口完全等价。

踩过的两个坑（和 publish_apk.py 里一样）：
  1. 边缘会拦 python-urllib 的默认 UA（403，error code 1010），必须带浏览器 UA；
  2. KV 的 REST 读接口对文本值返回的是「数字数组形式的 JSON 字符串」，
     要先 json.loads 解一层。
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ACCOUNT_ID = 'ebb7ecfd16008b9e3696ad5b4bc930d7'
KV_NAMESPACE = '02669ca1cef04c5e930d4e3bb2d0d780'
BASE = 'https://www.xxmuhelper.top'   # v1.1.17 起用自有域名；旧 pages.dev 仍可用
TOKEN_FILE = r'D:\_cftoken.txt'
UA = ('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def token():
    t = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
    if t:
        return t
    if os.path.exists(TOKEN_FILE):
        return open(TOKEN_FILE, 'r', encoding='utf-8').read().strip()
    sys.exit('找不到 Cloudflare API Token（环境变量 CLOUDFLARE_API_TOKEN 或 ' + TOKEN_FILE + '）')


def kv_url(key):
    return ('https://api.cloudflare.com/client/v4/accounts/%s/storage/kv/namespaces/%s/values/%s'
            % (ACCOUNT_ID, KV_NAMESPACE, urllib.parse.quote(key, safe='')))


def http_open(req, timeout=30, tries=3):
    last = None
    for i in range(tries):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError:
            raise
        except Exception as e:          # 网络层异常重试，HTTP 错误不重试
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def get_cfg(tok):
    req = urllib.request.Request(kv_url('cfg'), headers={'Authorization': 'Bearer ' + tok, 'User-Agent': UA})
    raw = http_open(req).read().decode('utf-8')
    try:
        v = json.loads(raw)
    except Exception:
        v = raw
    if isinstance(v, list):
        v = bytes(v).decode('utf-8')
    if isinstance(v, str):
        v = json.loads(v)
    return v


def put_cfg(tok, cfg):
    body = json.dumps(cfg, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(kv_url('cfg'), data=body, method='PUT', headers={
        'Authorization': 'Bearer ' + tok,
        'User-Agent': UA,
        'Content-Type': 'application/octet-stream',
    })
    http_open(req).read()


def show(cfg):
    print('noticeTitle :', cfg.get('noticeTitle') or '(空)')
    print('noticeAt    :', cfg.get('noticeAt') or 0)
    body = (cfg.get('notice') or '').strip()
    print('notice      :', (body[:120] + '…') if len(body) > 120 else (body or '(空)'))


def main():
    # Windows 控制台默认 GBK，中文标题会显示成乱码（内容没错，只是看不见）。
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument('--title', default='')
    ap.add_argument('--body-file', default='')
    ap.add_argument('--clear', action='store_true')
    ap.add_argument('--show', action='store_true')
    a = ap.parse_args()

    tok = token()
    cfg = get_cfg(tok)
    print('--- 改前 ---')
    show(cfg)

    if a.show:
        return 0

    if a.clear:
        cfg['notice'] = ''
        cfg['noticeTitle'] = ''
        cfg['noticeAt'] = 0
    else:
        if not a.body_file:
            sys.exit('要么 --body-file，要么 --clear，要么 --show')
        p = a.body_file if os.path.isabs(a.body_file) else os.path.join(ROOT, a.body_file)
        body = open(p, 'r', encoding='utf-8').read().strip()
        if not body:
            sys.exit('正文是空的')
        cfg['notice'] = body
        cfg['noticeTitle'] = a.title or '公告'
        cfg['noticeAt'] = int(time.time())

    put_cfg(tok, cfg)
    back = get_cfg(tok)
    print('--- 改后 ---')
    show(back)

    # 边缘缓存 60 秒，等它过期再验一次线上
    print('--- 线上（可能还要等最多 60 秒边缘缓存过期）---')
    req = urllib.request.Request(BASE + '/v1/config', headers={'User-Agent': UA})
    live = json.loads(http_open(req).read().decode('utf-8'))
    print('live noticeAt  :', live.get('noticeAt'))
    print('live title     :', live.get('noticeTitle'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
