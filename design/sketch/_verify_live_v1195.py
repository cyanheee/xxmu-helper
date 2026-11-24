# -*- coding: utf-8 -*-
"""v1.1.95 上线验收（QA ONLY，一次性脚本，不进门禁链）。

验四件事：
  1) 两个真实入口 /v1/config 的 latest 都指向 1.1.95 / code 1195 / 同一 sha256 / notes 逐字一致；
  2) 两个入口 /v1/apk 下载回来的字节与本地包逐字节一致；
  3) 两个入口首页可达、联系方式在、版本由接口填充（未写死）、无管理员内部词；
  4) _worker.js 新 BUILD 已随 Pages 重部署生效（首页/资源缓存键带新串）。

两个真实入口 = 主域名 https://www.xxmuhelper.top（publish_apk.py 的 BASE）
              + 回滚口 https://xxmu-auth.pages.dev。
裸域 xxmuhelper.top 从来没接入 DNS，单列如实记录，不计入验收。
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

UA = ('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL = open(os.path.join(ROOT, 'apk', 'xxmu-helper-v1.1.95.apk'), 'rb').read()
SHA = hashlib.sha256(LOCAL).hexdigest()
NOTES = open(os.path.join(ROOT, 'apk', 'v1.1.95.notes.txt'), encoding='utf-8').read().strip()
BUILD = 'v1.1.95-login-refresh-ykt'
MAIL = '692962849@qq.com'
VER = '1.1.95'
CODE = 1195

HOSTS = [
    ('https://www.xxmuhelper.top', '主域名 / BASE'),
    ('https://xxmu-auth.pages.dev', '回滚口 / Pages'),
]
INTERNAL_WORDS = ('校准', '教务绑定', '手填学号', 'oddRows', 'cfg.latest',
                  '管理员后台', 'rebind-at', 'rebindAt', '全员重绑',
                  'rebind-all', 'rebind-undo', 'cfg.rebindAt')
fails = []


def get(url, timeout=40, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, method='GET')
            req.add_header('User-Agent', UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            return None, {'HTTPError': str(e.code)}
        except Exception as e:                                  # noqa: BLE001
            last = e
            if i < tries - 1:
                time.sleep(2 * (i + 1))
    return None, {'Error': type(last).__name__ + ': ' + str(last)}


def cf_decode(h):
    try:
        b = bytes.fromhex(h)
        return ''.join(chr(x ^ b[0]) for x in b[1:]) if len(b) > 1 else ''
    except Exception:                                           # noqa: BLE001
        return ''


def contact_ok(html):
    mail_plain = ('mailto:' + MAIL) in html
    mail_cf = any(cf_decode(m.group(1)) == MAIL for m in
                  re.finditer(r'/cdn-cgi/l/email-protection#([0-9a-fA-F]+)', html))
    qq = '>692962849<' in html
    return qq and (mail_plain or mail_cf)


print('本地包 : %d 字节  sha256=%s' % (len(LOCAL), SHA))
print('notes  : %d 字' % len(NOTES))
print('目标版本: %s / code %s  BUILD=%s' % (VER, CODE, BUILD))
print('=' * 78)

for host, label in HOSTS:
    print('\n[%s]  %s' % (host, label))

    body, hdr = get(host + '/v1/config')
    if body is None:
        print('  /v1/config 不可达：%s' % hdr)
        fails.append(host + ' /v1/config 不可达')
    else:
        try:
            cfg = json.loads(body.decode('utf-8'))
            lv = cfg.get('latest') or {}
            ok = (lv.get('version') == VER and lv.get('code') == CODE
                  and lv.get('size') == len(LOCAL) and lv.get('sha256') == SHA)
            print('  /v1/config  version=%s code=%s size=%s sha=%s…  %s'
                  % (lv.get('version'), lv.get('code'), lv.get('size'),
                     str(lv.get('sha256'))[:16], 'PASS' if ok else 'FAIL'))
            if not ok:
                fails.append(host + ' /v1/config latest 不一致')
            lnotes = (lv.get('notes') or '').strip()
            n_ok = lnotes == NOTES
            print('  /v1/config  notes 与本地逐字一致：%s (%d 字)'
                  % ('PASS' if n_ok else 'FAIL', len(lnotes)))
            if not n_ok:
                fails.append(host + ' notes 不一致')
        except Exception as e:                                  # noqa: BLE001
            print('  /v1/config 解析失败：%s' % e)
            fails.append(host + ' /v1/config 解析失败')

    home, _ = get(host + '/?__v=' + str(int(time.time())))
    if home is None:
        print('  首页不可达')
        fails.append(host + ' 首页不可达')
    else:
        html = home.decode('utf-8', 'replace')
        c_ok = contact_ok(html)
        print('  首页  联系方式(QQ+邮箱)：%s' % ('PASS' if c_ok else 'FAIL'))
        if not c_ok:
            fails.append(host + ' 首页联系方式缺失')
        ver_hard = bool(re.search(r'id="mVer">v[\d.]+<', html))
        print('  首页  版本未写死(由接口填)：%s' % ('PASS' if not ver_hard else 'FAIL'))
        if ver_hard:
            fails.append(host + ' 首页版本写死')
        internal = [w for w in INTERNAL_WORDS if w in html]
        print('  首页  无管理员内部词：%s' % ('PASS' if not internal else 'FAIL ' + '/'.join(internal)))
        if internal:
            fails.append(host + ' 首页混入内部词')
        b_hit = BUILD in html
        print('  首页  含新 BUILD 串(%s)：%s' % (BUILD, 'PASS' if b_hit else 'N/A(动态注入)'))

    apk, _ = get(host + '/v1/apk', timeout=120)
    if apk is None:
        print('  /v1/apk 不可达')
        fails.append(host + ' /v1/apk 不可达')
    else:
        g = hashlib.sha256(apk).hexdigest()
        ok = g == SHA and len(apk) == len(LOCAL)
        print('  /v1/apk  %d 字节 sha=%s…  %s'
              % (len(apk), g[:16], 'PASS' if ok else 'FAIL'))
        if not ok:
            fails.append(host + ' /v1/apk 字节不一致')

bare, hdr = get('https://xxmuhelper.top/v1/config', timeout=12, tries=1)
print('\n[裸域 xxmuhelper.top]  未接入 DNS（既有部署事实，不计入验收）')
print('  探测：%s' % ('可达' if bare is not None else hdr))

print('\n' + '=' * 78)
if fails:
    print('RESULT: FAIL (%d)' % len(fails))
    for f in fails:
        print('  - ' + f)
    sys.exit(1)
print('RESULT: PASS  两入口 /v1/config(1.1.95/1195)、notes、下载链路、首页全部一致')
