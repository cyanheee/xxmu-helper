# -*- coding: utf-8 -*-
import os, re, io, collections

D = r'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\web'
KEYS = collections.defaultdict(set)

pat = re.compile(r"['\"](xxmu_[A-Za-z0-9_]+)['\"]")

for fn in sorted(os.listdir(D)):
    if not fn.endswith('.js'):
        continue
    s = io.open(os.path.join(D, fn), encoding='utf-8', errors='replace').read()
    for m in pat.finditer(s):
        KEYS[m.group(1)].add(fn)

for k in sorted(KEYS):
    print(k.ljust(28), '|', ','.join(sorted(KEYS[k])))
print('---- total keys', len(KEYS))
