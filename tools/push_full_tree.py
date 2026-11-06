# -*- coding: utf-8 -*-
"""把本地 HEAD 的**完整 tree** 以远程 HEAD 为父提交推上去（一次性对齐工具）。

    python -X utf8 tools/push_full_tree.py [--dry-run]

为什么需要它：
  push_via_api.py 的 reattach_to_remote() 只推「本地最新一个提交相对其父的改动」，
  适合「远程 = 本地父提交」的情形。但 2026-11-06 发版时远程还停在 897839c，
  本地已领先 13 个提交（v1.1.39~1.1.43 全部代码），它只推了 README 和
  release_all.py 两个文件，剩下 56 个文件/76 处差异仍在本地。
  脚本自己诚实打印了差异清单，但没把完整内容推上去。

做法（不 rebase、不 force、不改历史）：
  1. 读远程 main 的 HEAD，作为新提交的 parent（保护别人/API 造的提交）
  2. 遍历 `git ls-tree -r HEAD` 的全部文件，逐个上传 blob
  3. 用这些 blob 建一棵完整 tree → 建提交 → PATCH main
  4. **回读远程 tree，逐文件比 blob sha**，全部一致才算成功

只在远程与本地内容不同时执行；已一致就什么都不做。
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = r'D:\_ghtoken.txt'
REPO = 'cyanheee/xxmu-helper'
API = 'https://api.github.com'
GIT = r'C:\Program Files\Git\cmd\git.exe' if os.path.exists(
    r'C:\Program Files\Git\cmd\git.exe') else 'git'


def tok_read():
    if not os.path.exists(TOKEN_FILE):
        sys.exit('缺少 token 文件 ' + TOKEN_FILE)
    return io.open(TOKEN_FILE, encoding='utf-8').read().strip()


def api(tok, method, path, payload=None):
    req = urllib.request.Request(
        API + path,
        data=(json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None),
        method=method,
        headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'xxmu-push-full',
                 'Accept': 'application/vnd.github+json',
                 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        sys.exit('API %s %s 失败：HTTP %s %s' % (method, path, e.code, body[:600]))


def git(*a):
    r = subprocess.run([GIT] + list(a), cwd=ROOT, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        sys.exit('git %s 失败：%s' % (' '.join(a), (r.stderr or r.stdout)[:400]))
    return (r.stdout or '').strip()


def blob_local(rel):
    """本地文件转成 GitHub blob API 需要的 (content, encoding)。"""
    raw = open(os.path.join(ROOT, rel.replace('/', os.sep)), 'rb').read()
    try:
        return raw.decode('utf-8'), 'utf-8'
    except UnicodeDecodeError:
        return base64.b64encode(raw).decode('ascii'), 'base64'


def git_blob_sha(rel):
    """git 自己的 blob sha（SHA-1 over "blob <len>\\0<data>"），用于逐文件比对。"""
    return git('hash-object', rel.replace('/', os.sep))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    tok = tok_read()

    remote = api(tok, 'GET', '/repos/%s/git/refs/heads/main' % REPO)
    parent = remote['object']['sha']
    local = git('rev-parse', 'HEAD')
    print('远程 main : %s' % parent[:7])
    print('本地 HEAD : %s' % local[:7])

    # 本地完整文件清单（按 git ls-tree，天然排除 .gitignore 命中的文件）
    files = [x for x in git('ls-tree', '-r', '--name-only', 'HEAD').split('\n') if x]
    print('本地 tracked 文件：%d 个' % len(files))

    # 远程 tree：拿 blob sha，用于「已一致就跳过」和最后回读比对
    rc = api(tok, 'GET', '/repos/%s/git/commits/%s' % (REPO, parent))
    rt = api(tok, 'GET', '/repos/%s/git/trees/%s?recursive=1' % (REPO, rc['tree']['sha']))
    if rt.get('truncated'):
        sys.exit('远程 tree 被截断，放弃')
    remote_files = {e['path']: e['sha'] for e in rt['tree'] if e['type'] == 'blob'}

    # 逐文件比：本地 git blob sha == 远程 blob sha 就无需重传
    changed = []
    for f in files:
        want = git_blob_sha(f)
        if remote_files.get(f) != want:
            changed.append((f, want))
    deleted = [p for p in remote_files if p not in set(files)]
    print('内容不同的文件：%d 个；远程多出（本地已删）：%d 个' % (len(changed), len(deleted)))
    for f, _ in changed[:12]:
        print('  M %s' % f)
    if len(changed) > 12:
        print('  … 其余 %d 个' % (len(changed) - 12))

    if not changed and not deleted:
        print('\n远程内容与本地 HEAD 已完全一致，无需推送。')
        return 0
    if a.dry_run:
        print('\n--dry-run：不写远程')
        return 0

    # 1) 上传所有「内容不同」的文件的 blob，收集 GitHub blob sha
    entries = []
    for i, (f, _) in enumerate(changed, 1):
        content, enc = blob_local(f)
        r = api(tok, 'POST', '/repos/%s/git/blobs' % REPO,
                {'content': content, 'encoding': enc})
        mode = '100755' if git('ls-tree', 'HEAD', f).startswith('100755') else '100644'
        entries.append({'path': f, 'mode': mode, 'type': 'blob', 'sha': r['sha']})
        if i % 10 == 0 or i == len(changed):
            print('  已上传 blob %d/%d' % (i, len(changed)))

    # 2) 未变的文件原样保留远程 sha；本地已删的文件从 tree 里去掉
    for p, sha in remote_files.items():
        if p in set(files) and all(p != f for f, _ in changed):
            entries.append({'path': p, 'mode': '100644', 'type': 'blob', 'sha': sha})

    # 3) 建 tree → 建提交（parent = 远程 HEAD，不动历史）→ 移动 main
    tree = api(tok, 'POST', '/repos/%s/git/trees' % REPO, {'tree': entries})
    msg = 'sync: 对齐本地 v1.1.43 完整代码（API 通道，内容逐文件校验）'
    commit = api(tok, 'POST', '/repos/%s/git/commits' % REPO,
                 {'message': msg, 'tree': tree['sha'], 'parents': [parent]})
    api(tok, 'PATCH', '/repos/%s/git/refs/heads/main' % REPO,
        {'sha': commit['sha'], 'force': False})
    back = api(tok, 'GET', '/repos/%s/git/refs/heads/main' % REPO)
    new = back['object']['sha']
    print('\n远程 main -> %s' % new[:7])

    # 4) 回读逐文件比 blob sha（验形态，不验存在）
    rc2 = api(tok, 'GET', '/repos/%s/git/commits/%s' % (REPO, new))
    rt2 = api(tok, 'GET', '/repos/%s/git/trees/%s?recursive=1' % (REPO, rc2['tree']['sha']))
    if rt2.get('truncated'):
        sys.exit('回读 tree 被截断，无法证明一致')
    got = {e['path']: e['sha'] for e in rt2['tree'] if e['type'] == 'blob'}
    bad = []
    for f in files:
        want = git_blob_sha(f)
        if got.get(f) != want:
            bad.append(f)
    extra = [p for p in got if p not in set(files)]
    print('回读：本地 %d 文件 / 远程 %d 文件；不一致 %d；远程多出 %d'
          % (len(files), len(got), len(bad), len(extra)))
    if bad or extra:
        print('  不一致：' + ', '.join(bad[:8]))
        print('  多出：' + ', '.join(extra[:8]))
        sys.exit('[FAIL] 远程内容与本地不一致，别当作推送成功')
    print('[PASS] 远程每个文件的 blob sha 与本地 HEAD 完全一致（提交号不同是正常的）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
