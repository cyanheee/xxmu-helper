# -*- coding: utf-8 -*-
"""v1.1.65 上线验收（QA ONLY，一次性脚本，不进门禁链）。

验四件事：
  1) 每个真实入口 /v1/config 的 latest 都指向 1.1.65 / code 1165 / 同一 sha256 / notes 逐字一致；
  2) 每个入口首页仍是相册翻页版官网（1.1.65 只切 BUILD、全员重绑是管理员侧功能，
     一个字都不进官网；顺带确认水墨云图/像素小伙伴/联系方式都还在）；
  3) 三张水墨示意图真实上到线上，且仍含英中双语像素气泡；
  4) /v1/apk 下载回来的字节与本地包逐字节一致。

两个真实入口 = 主域名 https://www.xxmuhelper.top（publish_apk.py 的 BASE）
              + 回滚口 https://xxmu-auth.pages.dev。
裸域 xxmuhelper.top 从来没接入 DNS，单列一行如实记录，不计入验收。

Cloudflare 的 Email Address Obfuscation 会把主域名首页的 mailto: 与明文邮箱换成
/cdn-cgi/l/email-protection#HEX 与 data-cfemail="HEX"，浏览器加载 CF 脚本后还原。
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
LOCAL = open(os.path.join(ROOT, 'apk', 'xxmu-helper-v1.1.65.apk'), 'rb').read()
SHA = hashlib.sha256(LOCAL).hexdigest()
NOTES = open(os.path.join(ROOT, 'apk', 'v1.1.65.notes.txt'), encoding='utf-8').read().strip()
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
    """官网首页内容/排版仍是相册翻页版，且管理员侧重绑功能一个字都不进官网。"""
    out = {
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
        '这一版相册能翻页了': '这一版 · 相册能翻页了' in html,
        'hero 一屏摆得下四张': '一屏摆得下四张' in html,
        '校园实景一屏四张': '校园实景一屏四张' in html,
        '留言板一屏三条': '留言板一屏三条' in html,
        '浅色深色都单独调过': '浅色深色都单独调过' in html,
        '木夹': '小木夹' in html,
        '麻绳': '麻绳' in html,
        '小圆点': '小圆点' in html,
        'FAQ 怎么翻页': '怎么翻页' in html,
        'FAQ 不用退出重进': '不用退出重进' in html,
    }
    # 管理员侧功能一个字都不该出现在学生官网（含本版新增的重绑/撤销内部词）
    out['官网无内部词'] = not any(w in html for w in
                              ('校准', '教务绑定', '手填学号', 'oddRows',
                               'cfg.latest', '管理员后台', 'rebind-at',
                               'rebindAt', '全员重绑', 'rebind-all',
                               'rebind-undo', 'cfg.rebindAt'))
    # 版本号仍由接口填充，没写死
    out['版本未写死'] = not re.search(r'id="mVer">v[\d.]+<', html)
    return out


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
            ok = (lv.get('version') == '1.1.65' and lv.get('code') == 1165
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
        print('  首页  官网内容/排版（相册翻页版 + 无内部词）：%s  %s'
              % ('/'.join(k for k, v in ink.items() if v) if ink_ok
                 else '缺 ' + '/'.join(k for k, v in ink.items() if not v),
                 'PASS' if ink_ok else 'FAIL'))
        if not ink_ok:
            fails.append(host + ' 官网内容/排版异常或混入管理员内部词')

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
print('RESULT: PASS  两入口 /v1/config、首页、三张示意图、下载链路、1.1.65 切版本全部一致')
print('  主域名邮箱被 CF Email Obfuscation 保护，解码后为 ' + MAIL + '，浏览器端正常显示。')
