# -*- coding: utf-8 -*-
"""把青果教务首页完整落盘，挖菜单树 / JS 配置里的「考试安排」真链接。
为什么：未登录首页也可能带静态菜单 JSON 或指向菜单接口的 js，
比硬猜 jsp 路径可靠；本机 session 过期，只能从公开首页下手。
"""
import sys, re, io, os
ROOT = r'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\core'
sys.path.insert(0, ROOT)
import kingo

OUT = r'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch\_home.html'
h = kingo.get_gbk('/', '')
io.open(OUT, 'w', encoding='utf-8').write(h)
print('HOME_LEN=', len(h), '->', OUT)

# 所有 src / href / action / url 字面量
links = re.findall(r'(?:src|href|action|url)\s*=\s*["\']([^"\']+)["\']', h, re.I)
print('LINKS=', len(links))
seen = set()
for l in links:
    if l in seen: continue
    seen.add(l)
    print('  L|', l[:220])

# 含「考试」「ks」「menu」的行
print('---- KEY LINES ----')
for i, line in enumerate(h.splitlines(), 1):
    if re.search(r'考试|考场|ksap|kscx|menucode|menu|Menu|MENU|\.jsp|\.action', line, re.I):
        s = line.strip()
        if len(s) > 500: s = s[:500] + '…'
        print('%4d| %s' % (i, s))
print('DONE')
