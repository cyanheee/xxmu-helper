# -*- coding: utf-8 -*-
import io, re, sys

s = io.open('web/index.html', encoding='utf-8').read()
print('--- scripts ---')
for m in re.finditer(r'<script[^>]*src="([^"]+)"', s):
    line = s[:m.start()].count('\n') + 1
    print('%5d  %s' % (line, m.group(1)))
print('--- css ---')
for m in re.finditer(r'<link[^>]*href="([^"]+)"', s):
    line = s[:m.start()].count('\n') + 1
    print('%5d  %s' % (line, m.group(1)))
