# -*- coding: utf-8 -*-
"""v1.1.62 上线验收（QA ONLY，一次性脚本，不进门禁链）。

验四件事：
  1) 每个真实入口 /v1/config 的 latest 都指向 1.1.62 / code 1162 / 同一 sha256 / notes 逐字一致；
  2) 每个入口首页都是 v1.1.62 官网（新 QQ、无旧 QQ、邮箱可用、#fresh 亮点区与 FAQ 已同步）；
  3) 三张水墨示意图真实上到线上，且仍含英中双语像素气泡；
  4) /v1/apk 下载回来的字节与本地包逐字节一致。

两个真实入口 = 主域名 https://www.xxmuhelper.top（publish_apk.py 的 BASE）
              + 回滚口 https://xxmu-auth.pages.dev。
裸域 xxmuhelper.top 从来没接入 DNS（tools/check_domain.py 的结论也是「至少一个
域名已可用」，BASE/回滚口都不含裸域），单列一行如实记录，不计入验收。

Cloudflare 的 Email Address Obfuscation 会把主域名首页的 mailto: 与明文邮箱换成
/cdn-cgi/l/email-protection#HEX 与 data-cfemail="HEX"，浏览器加载 CF 脚本后还原。
所以邮箱断言必须会解这个编码（XOR，首字节是 key），否则会把「被保护的正确邮箱」
误判成「没更新」。pages.dev 那侧没开这个 setting，是明文。

CF 边缘会 403 python-urllib 默认 UA，统一伪装成 Android Chrome。
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
LOCAL = open(os.path.join(ROOT, 'apk', 'xxmu-helper-v1.1.62.apk'), 'rb').read()
SHA = hashlib.sha256(LOCAL).hexdigest()
NOTES = open(os.path.join(ROOT, 'apk', 'v1.1.62.notes.txt'), encoding='utf-8').read().strip()
MAIL = '692962849@qq.com'

HOSTS = [
    ('https://www.xxmuhelper.top', '主域名 / BASE'),
    ('https://xxmu-auth.pages.dev', '回滚口 / Pages'),
]
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
    """解 Cloudflare 邮箱混淆：首字节是 XOR key，其余逐字节异或。"""
    try:
        b = bytes.fromhex(h)
        return ''.join(chr(x ^ b[0]) for x in b[1:]) if len(b) > 1 else ''
    except Exception:                                         # noqa: BLE001
        return ''


def contact(html):
    mail_plain = ('mailto:' + MAIL) in html
    mail_cf = any(cf_decode(m.group(1)) == MAIL for m in
                  re.finditer(r'/cdn-cgi/l/email-protection#([0-9a-fA-F]+)', html))
    show_plain = MAIL in html
    show_cf = any(cf_decode(m.group(1)) == MAIL for m in
                  re.finditer(r'data-cfemail="([0-9a-fA-F]+)"', html))
    qq = '>692962849<' in html
    old = html.count('572833261')
    mode = 'plain' if mail_plain else ('cf-email-protection' if mail_cf else 'MISSING')
    ok = qq and old == 0 and (mail_plain or mail_cf) and (show_plain or show_cf)
    return ok, qq, old, mode, show_plain or show_cf


def ink_page(html):
    """官网首页内容/排版是否已同步到 v1.1.62：水墨云图 + 彩蛋 v2 + 本轮 #fresh。"""
    return {
        'id=ink 区块': 'id="ink"' in html,
        '水墨云图标题': '水墨云图' in html,
        '花青云水': '花青云水' in html,
        '像素小伙伴': '像素小伙伴' in html,
        '点一下就出声': '点一下就出声' in html,
        '三张水墨示意图': all(('src="img/shot-%s.svg"' % n) in html
                           for n in ('kb', 'learn', 'water')),
        '示意图标注': '示意图' in html,
        '四关键词仍在': all(w in html for w in
                         ('周次传送带', '磁带门', '波段拨盘', '万象舱')),
        'id=fresh 亮点区': 'id="fresh"' in html,
        '这一版用着更顺手': '这一版 · 用着更顺手' in html,
        '空调房间认得更准': '空调房间现在认得更准' in html,
        '套间AB也选得到': '套间 A / B 也选得到' in html,
        '校园实景留言自动更新': '校园实景和留言板还会自己更新' in html,
        '房间不对就换': '房间不对就换' in html,
        '学号跟教务网对齐': '学号跟教务网对得上了' in html,
        'FAQ不用退出重进': '不用退出重进' in html,
    }


def ink_shots(getter, host):
    """三张水墨 SVG 是否真上到线上：含像素小人英中双语气泡 + 保留 #122A38。"""
    out = {}
    cb = '?cb=%d' % int(time.time())          # 绕开 /img/* 边缘缓存，务必拿到这次部署的字节
    for n in ('kb', 'learn', 'water'):
        body, _ = getter(host + '/img/shot-%s.svg' % n + cb)
        if body is None:
            out['shot-' + n] = False
            continue
        s = body.decode('utf-8', 'replace')
        out['shot-' + n] = ("It's-a me" in s and '是我呀' in s
                            and '#122A38' in s and '#EFE2C8' not in s
                            and s.lstrip().startswith('<svg'))
    return out


print('本地包 : %d 字节  sha256=%s' % (len(LOCAL), SHA))
print('notes  : %d 字' % len(NOTES))
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
            ok = (lv.get('version') == '1.1.62' and lv.get('code') == 1162
                  and lv.get('size') == len(LOCAL) and lv.get('sha256') == SHA)
            print('  /v1/config  version=%s code=%s size=%s sha=%s…  %s'
                  % (lv.get('version'), lv.get('code'), lv.get('size'),
                     str(lv.get('sha256'))[:16], 'PASS' if ok else 'FAIL'))
            if not ok:
                fails.append(host + ' /v1/config latest 不一致')
            lnotes = lv.get('notes') or ''
            n_ok = lnotes.strip() == NOTES
            print('  /v1/config  notes 与本地逐字一致：%s (%d 字)'
                  % ('PASS' if n_ok else 'FAIL', len(lnotes)))
            if not n_ok:
                fails.append(host + ' notes 不一致')
        except Exception as e:                                  # noqa: BLE001
            print('  /v1/config 解析失败：%s' % e)
            fails.append(host + ' /v1/config 解析失败')

    home, _ = get(host + '/')
    if home is None:
        print('  首页不可达')
        fails.append(host + ' 首页不可达')
    else:
        html = home.decode('utf-8', 'replace')
        ok, qq, old, mode, shown = contact(html)
        print('  首页  QQ=%s 旧QQ=%d 邮箱=%s 显示=%s  %s'
              % ('PASS' if qq else 'FAIL', old, mode,
                 'PASS' if shown else 'FAIL', 'PASS' if ok else 'FAIL'))
        if not ok:
            fails.append(host + ' 首页联系方式未更新')

        ink = ink_page(html)
        ink_ok = all(ink.values())
        print('  首页  官网内容/排版同步（含 v1.1.62）：%s  %s'
              % ('/'.join(k for k, v in ink.items() if v) if ink_ok
                 else '缺 ' + '/'.join(k for k, v in ink.items() if not v),
                 'PASS' if ink_ok else 'FAIL'))
        if not ink_ok:
            fails.append(host + ' 官网内容/排版未同步到 v1.1.62')

        shots = ink_shots(get, host)
        shots_ok = all(shots.values())
        print('  三张水墨示意图  %s  %s'
              % ('/'.join(k for k, v in shots.items() if v) if shots_ok
                 else '缺 ' + '/'.join(k for k, v in shots.items() if not v),
                 'PASS' if shots_ok else 'FAIL'))
        if not shots_ok:
            fails.append(host + ' 水墨 SVG 未上到线上')

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

# 裸域如实记录，不进 fails：项目从来只用 www + pages.dev 两个入口
bare, hdr = get('https://xxmuhelper.top/v1/config', timeout=12, tries=1)
print('\n[裸域 xxmuhelper.top]  未接入 DNS（既有部署事实，BASE 与回滚口均不含此域，不计入验收）')
print('  探测：%s' % ('可达' if bare is not None else hdr))

print('\n' + '=' * 78)
if fails:
    print('RESULT: FAIL (%d)' % len(fails))
    for f in fails:
        print('  - ' + f)
    sys.exit(1)
print('RESULT: PASS  两入口 /v1/config、首页、三张示意图、下载链路、v1.1.62 新内容全部一致')
print('  主域名邮箱被 CF Email Obfuscation 保护，解码后为 ' + MAIL + '，浏览器端正常显示。')
