# -*- coding: utf-8 -*-
"""实地探测青果(KINGOSOFT)教务「考试安排」真实入口。
为什么：xiqueer.js 里 7 个候选 jsp 全是猜的，真机全没命中，报成
「登录态已过期」把我们的解析失败冒充了用户状态。这回带真 Cookie
把框架页/菜单里的真链接抓出来，再逐个访问验真。
"""
import sys, re, time
ROOT = r'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\core'
sys.path.insert(0, ROOT)
import kingo

ck = kingo.load_session()
print('COOKIE=', ck)

def fetch(path, tries=3):
    last = ''
    for i in range(tries):
        try:
            return kingo.get_gbk(path, ck)
        except Exception as e:
            last = repr(e)
            time.sleep(0.6)
    raise RuntimeError(last)

PAGES = [
    '/',
    '/frame/homes.action',
    '/frame/homepage.action',
    '/student/xskcb.jsp',
]
KEY = re.compile(r'考试|考场|安排|ksap|kscx|ks\.jsp|exam|menucode|kw[a-z]*\.jsp|ks[a-z]*\.jsp', re.I)
for p in PAGES:
    try:
        h = fetch(p)
        print('\n===== %s len=%d =====' % (p, len(h)))
        print('  HEAD:', h[:180].replace('\n', ' '))
        hit = 0
        for line in h.splitlines():
            if KEY.search(line):
                print('  |', line.strip()[:400])
                hit += 1
                if hit >= 60:
                    print('  ...(cut)')
                    break
        print('  HITS=%d' % hit)
    except Exception as e:
        print('\n===== %s ERR %s =====' % (p, e))
print('\nDONE')
