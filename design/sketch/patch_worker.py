# -*- coding: utf-8 -*-
"""给 Pages 层的缓存键加 BUILD 串：换皮肤后不用等 TTL 就能整批失效。"""
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = os.path.join(ROOT, 'server', 'pages', 'dist', '_worker.js')

OLD_TTL = "const HOME_TTL = 300;\nconst IMG_TTL = 86400;\n"
NEW_TTL = ("const HOME_TTL = 300;\nconst IMG_TTL = 86400;\n"
           "/* v1.1.54: \u6362\u76ae\u80a4\u540e\u8fb9\u7f18\u7f13\u5b58\u91cc\u7684\u65e7\u9996\u9875\u4e0e\u65e7 SVG \u4f1a\u9876\u4e00\u5929\u3002\n"
           " * \u7f13\u5b58\u952e\u91cc\u5e26\u4e0a\u8fd9\u4e2a BUILD \u4e32\uff0c\u6539\u4e00\u6b21 BUILD \u5c31\u7b49\u4e8e\u6574\u6279\u5931\u6548\u3002 */\n"
           "const BUILD = 'v1.1.54';\n")

OLD_KEY = "const ck = new Request(u.origin + (isHome ? '/' : p), { method: 'GET' });"
NEW_KEY = "const ck = new Request(u.origin + (isHome ? '/' : p) + '?b=' + BUILD, { method: 'GET' });"

s = io.open(W, encoding='utf-8').read()
n = 0
if OLD_TTL in s:
    s = s.replace(OLD_TTL, NEW_TTL, 1); n += 1
if OLD_KEY in s:
    s = s.replace(OLD_KEY, NEW_KEY, 1); n += 1
io.open(W, 'w', encoding='utf-8', newline='\n').write(s)
print('patched %d/2' % n)
print('BUILD:', "const BUILD = 'v1.1.54'" in s)
print('KEY  :', "'?b=' + BUILD" in s)
