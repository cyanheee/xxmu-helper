# -*- coding: utf-8 -*-
"""只把学生看到的更新说明（cfg.latest.notes）换成新文案，不动版本/包/URL/公告。

    python -X utf8 tools/set_notes.py apk/v1.1.43.notes.txt

为什么单独一个脚本：用户纠正「更新公告不要显示管理员需要注意的事项」。
公告字段是 notice/noticeTitle/noticeAt（set_notice.py 管），更新说明是
cfg.latest.notes（这个脚本管），两套完全独立，**改一个绝不能顺手写另一个**。
admin/setcfg 那条路会把 latest 整块覆盖，容易把 url 的 ?v= 带掉，所以这里
直接读写 KV 的 cfg，只替换 latest.notes 一个字段，其余原样回写。

写完必须回读 KV 真值 + /v1/config（后者有 60 秒 edgeCache，读旧值是正常的）。
"""
import io
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACCOUNT_ID = 'ebb7ecfd16008b9e3696ad5b4bc930d7'
KV = '02669ca1cef04c5e930d4e3bb2d0d780'
TOKEN_FILE = r'D:\_cftoken.txt'
UA = 'xxmu-setnotes/1.0'
API = ('https://api.cloudflare.com/client/v4/accounts/%s/storage/kv/namespaces/%s/values/'
       % (ACCOUNT_ID, KV))


def token():
    t = (os.environ.get('CLOUDFLARE_API_TOKEN') or '').strip()
    if t:
        return t
    if os.path.exists(TOKEN_FILE):
        return io.open(TOKEN_FILE, encoding='utf-8').read().strip()
    sys.exit('缺少 Cloudflare 令牌（%s）' % TOKEN_FILE)


def main():
    if len(sys.argv) < 2:
        sys.exit('用法： python -X utf8 tools/set_notes.py apk/vX.Y.Z.notes.txt')
    p = sys.argv[1]
    if not os.path.isabs(p):
        p = os.path.join(ROOT, p)
    notes = io.open(p, encoding='utf-8').read().strip()
    if not notes:
        sys.exit('说明是空的：' + p)
    tok = token()
    h = {'Authorization': 'Bearer ' + tok, 'User-Agent': UA}

    raw = urllib.request.urlopen(
        urllib.request.Request(API + 'cfg', headers=h), timeout=90).read().decode('utf-8')
    cfg = json.loads(raw)
    if isinstance(cfg, str):
        cfg = json.loads(cfg)
    before = (cfg.get('latest') or {}).get('notes') or ''
    print('旧 notes %d 字 → 新 notes %d 字' % (len(before), len(notes)))
    print('版本=%s code=%s url=%s（这三项不动）' %
          ((cfg.get('latest') or {}).get('version'),
           (cfg.get('latest') or {}).get('code'),
           (cfg.get('latest') or {}).get('url')))

    cfg['latest']['notes'] = notes
    body = json.dumps(cfg, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + 'cfg', data=body, method='PUT', headers=dict(
        h, **{'Content-Type': 'application/octet-stream'}))
    urllib.request.urlopen(req, timeout=180).read()

    back = json.loads(urllib.request.urlopen(
        urllib.request.Request(API + 'cfg', headers=h), timeout=90).read().decode('utf-8'))
    b = (back.get('latest') or {})
    if b.get('notes') != notes:
        sys.exit('[FAIL] 回读 notes 不一致，别当作成功')
    print('[PASS] KV 回读一致：版本=%s code=%s url=%s' %
          (b.get('version'), b.get('code'), b.get('url')))
    print('       notice/noticeTitle/noticeAt 未改：%r / %r / %r' %
          (back.get('notice'), back.get('noticeTitle'), back.get('noticeAt')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
