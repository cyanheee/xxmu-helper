#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性：把 v1.1.62 的 GitHub Release 与 APK 附件对齐（不动官网 / KV / README）。"""
import hashlib
import json
import os
import urllib.error
import urllib.request

ROOT = r'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
TOK = open(r'D:\_ghtoken.txt', encoding='utf-8').read().strip()
REPO = 'cyanheee/xxmu-helper'
TAG = 'v1.1.62'
APK = os.path.join(ROOT, 'apk', 'xxmu-helper-v1.1.62.apk')
NOTES = os.path.join(ROOT, 'apk', 'v1.1.62.notes.txt')
NAME = os.path.basename(APK)
blob = open(APK, 'rb').read()
sha = hashlib.sha256(blob).hexdigest()
notes = open(NOTES, encoding='utf-8').read().strip()


def api(method, url, data=None, raw=None, ctype=None):
    hdr = {'Authorization': 'Bearer ' + TOK, 'User-Agent': 'xxmu-release',
           'Accept': 'application/vnd.github+json'}
    body = None
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        hdr['Content-Type'] = 'application/json'
    if raw is not None:
        body = raw
        hdr['Content-Type'] = ctype
    req = urllib.request.Request(url, data=body, method=method, headers=hdr)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode('utf-8'))


print('APK   %s  %d bytes  sha256=%s' % (NAME, len(blob), sha))
print('notes %d chars' % len(notes))

tag_url = 'https://api.github.com/repos/%s/releases/tags/%s' % (REPO, TAG)
try:
    rel = api('GET', tag_url)
    print('Release %s 已存在 id=%s' % (TAG, rel['id']))
except urllib.error.HTTPError as e:
    if e.code != 404:
        raise
    title = notes.split('\n')[0].strip()
    rel = api('POST', 'https://api.github.com/repos/%s/releases' % REPO, data={
        'tag_name': TAG,
        'target_commitish': 'main',
        'name': '%s · %s' % (TAG, title),
        'body': notes,
        'draft': False,
        'prerelease': False,
    })
    print('Release %s 已创建 id=%s' % (TAG, rel['id']))

assets = rel.get('assets') or []
have = [a for a in assets if a['name'] == NAME and a.get('size') == len(blob)]
if have:
    print('附件已存在，跳过上传：%s  %d bytes' % (have[0]['name'], have[0]['size']))
else:
    up = api('POST',
             'https://uploads.github.com/repos/%s/releases/%d/assets?name=%s'
             % (REPO, rel['id'], NAME),
             raw=blob, ctype='application/vnd.android.package-archive')
    print('附件已上传 %s  %d bytes' % (up.get('name'), up.get('size', 0)))
    print('download %s' % up.get('browser_download_url', ''))

final = api('GET', tag_url)
for a in final.get('assets', []):
    print('final asset  %s  %d bytes  dl=%d' % (a['name'], a['size'], a.get('download_count', 0)))
print('Release https://github.com/%s/releases/tag/%s' % (REPO, TAG))
print('GH_RELEASE_DONE')
