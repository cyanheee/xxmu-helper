#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一条命令看清「自有域名通没通」。

    python tools/check_domain.py                    # 查 xxmuhelper.top
    python tools/check_domain.py example.com        # 查别的
    python tools/check_domain.py --watch            # 每 60 秒查一次，通了就停

为什么要这个脚本：域名接入卡在很多环节（注册局 hold / NS 没生效 / CNAME 没配 /
证书 pending / Pages 域名没加），每一环的检查方式都不一样，散着查很容易
把「还没生效」误判成「配错了」。这里按依赖顺序一次跑完，并明确说卡在哪一环、
下一步谁该做什么。

检查顺序（前一项不过，后面基本没意义，但仍然全跑一遍方便看全貌）：
  1. RDAP 状态码        —— client hold 就直接停，那是注册局没发布
  2. 权威 NS 有没有记录  —— 区分「没配」和「配了发不出去」
  3. 公共 DNS 能不能查   —— 决定全网是否可达
  4. HTTPS 能不能打开    —— 证书签发状态
  5. Pages custom domain —— API 查 validation_data.error_message
"""
import argparse
import json
import sys
import time
import urllib.request

ACCOUNT_ID = 'ebb7ecfd16008b9e3696ad5b4bc930d7'
PAGES_PROJECT = 'xxmu-auth'
CF_TOKEN_FILE = r'D:\_cftoken.txt'
UPSTREAM = 'xxmu-auth.pages.dev'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')


def http(url, timeout=20, headers=None):
    req = urllib.request.Request(url, headers=dict({'User-Agent': UA}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def read_token():
    try:
        with open(CF_TOKEN_FILE, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def step_rdap(domain):
    """① 注册局状态。client hold / serverHold = 域名根本没被发布，后面全白搭。"""
    print('\n[1] 注册局状态（RDAP）')
    try:
        _, body = http('https://rdap.org/domain/' + domain)
        d = json.loads(body.decode('utf-8'))
    except Exception as e:                                   # noqa: BLE001
        print('    查不到 RDAP：%s（域名可能未注册）' % type(e).__name__)
        return None
    status = d.get('status') or []
    print('    状态码：%s' % (', '.join(status) if status else '(无)'))
    for ev in (d.get('events') or []):
        print('    %-14s %s' % (ev.get('eventAction'), ev.get('eventDate')))

    bad = [s for s in status if s.lower() in ('client hold', 'server hold')]
    if bad:
        print('    ✗ 被暂停解析（%s）—— 注册局还没发布这个域名。' % ', '.join(bad))
        print('      下一步：只能等注册商审核完成（或去催客服），配再多记录也不会生效。')
        return False
    print('    ✓ 没有被 hold')
    return True


def dns_query(name, rtype, server):
    """用 PowerShell 的 Resolve-DnsName 查（Windows 上最省事，不依赖 dnspython）。"""
    import subprocess
    cmd = ['powershell', '-NoProfile', '-Command',
           "try { Resolve-DnsName -Name '%s' -Type %s -Server %s -DnsOnly -ErrorAction Stop "
           "| Select-Object -ExpandProperty %s -ErrorAction SilentlyContinue "
           "| ForEach-Object { $_ } } catch { }"
           % (name, rtype, server, 'NameHost' if rtype in ('CNAME', 'NS') else 'IPAddress')]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=25).stdout
        return [x.strip() for x in out.splitlines() if x.strip()]
    except Exception:                                        # noqa: BLE001
        return []


def step_dns(domain, subs):
    """②③ 权威 NS vs 公共 DNS。这一步是区分「没配」和「配了发不出去」的关键。"""
    print('\n[2] 权威 NS 上的记录（dns1.hichina.com）')
    auth_ok = {}
    for name in subs:
        c = dns_query(name, 'CNAME', 'dns1.hichina.com')
        auth_ok[name] = bool(c)
        print('    %-28s %s' % (name, ('→ ' + ', '.join(c)) if c else '（无记录）'))

    print('\n[3] 公共 DNS（决定全网能不能查到）')
    pub_ok = {}
    for name in subs:
        c = dns_query(name, 'CNAME', '223.5.5.5')
        if not c:
            c = dns_query(name, 'A', '223.5.5.5')
        pub_ok[name] = bool(c)
        print('    %-28s %s' % (name, ', '.join(c) if c else '✗ 查不到（NXDOMAIN）'))

    for name in subs:
        if auth_ok[name] and not pub_ok[name]:
            print('    ✗ %s：权威 NS 有记录但公网查不到 = 域名没被发布（hold）' % name)
    return auth_ok, pub_ok


def step_https(subs):
    """④ 证书签发（Pages 自定义域名签发完才会 200）。"""
    print('\n[4] HTTPS 是否可访问')
    out = {}
    for name in subs:
        try:
            code, body = http('https://%s/v1/config' % name, timeout=20)
            ok = code == 200 and b'"ok"' in body[:200]
            out[name] = ok
            print('    %-28s %s  %s' % (name, code, '✓ 可用' if ok else '(返回异常)'))
        except Exception as e:                               # noqa: BLE001
            out[name] = False
            print('    %-28s ✗ %s' % (name, type(e).__name__))
    return out


def step_pages(subs):
    """⑤ Pages 侧自定义域名的验证状态 —— 报错文案能反证卡在哪。"""
    tok = read_token()
    if not tok:
        print('\n[5] Pages custom domain：跳过（没找到 %s）' % CF_TOKEN_FILE)
        return {}
    print('\n[5] Pages custom domain 状态')
    url = ('https://api.cloudflare.com/client/v4/accounts/%s/pages/projects/%s/domains'
           % (ACCOUNT_ID, PAGES_PROJECT))
    try:
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + tok})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode('utf-8'))
    except Exception as e:                                   # noqa: BLE001
        print('    读取失败：%s' % type(e).__name__)
        return {}
    out = {}
    for it in (data.get('result') or []):
        name = it.get('name')
        vd = it.get('validation_data') or {}
        err = vd.get('error_message') or ''
        out[name] = it.get('status')
        print('    %-28s status=%-9s %s' % (name, it.get('status'), err))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('domain', nargs='?', default='xxmuhelper.top')
    ap.add_argument('--watch', action='store_true', help='每 60 秒查一次，通了就停')
    a = ap.parse_args()

    subs = [a.domain, 'www.' + a.domain, 'api.' + a.domain]

    while True:
        print('=' * 62)
        print('检查 %s    %s' % (a.domain, time.strftime('%Y-%m-%d %H:%M:%S')))
        print('=' * 62)

        held = step_rdap(a.domain)
        auth_ok, pub_ok = step_dns(a.domain, subs)
        live = step_https(subs)
        step_pages(subs)

        any_live = any(live.values())
        print('\n' + '-' * 62)
        if any_live:
            print('结论：至少一个域名已可用 —— 可以开始切 BASE 了。')
            for n, v in live.items():
                if v:
                    print('      %s ✓' % n)
            return 0
        if held is False:
            print('结论：卡在注册局 hold。等到审核完成再来看，期间改代码没意义。')
        else:
            print('结论：域名已不被 hold，但公网还查不到 —— 可能刚解除，等 DNS 生效（几分钟到几小时）。')
        print('-' * 62)

        if not a.watch:
            return 1
        print('\n60 秒后重查…（Ctrl+C 退出）')
        time.sleep(60)


if __name__ == '__main__':
    sys.exit(main())
