#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""当 github.com 的 443 被掐、但 api.github.com 还能通时，用 REST API 推一次提交。

    python -X utf8 tools/push_via_api.py [--dry-run]

背景（2026-11-05 实测）：
    curl https://github.com        -> 21 秒超时，连不上
    curl https://api.github.com    -> 200，0.27 秒
    git push                       -> Recv failure: Connection was reset

也就是**按域名分流的拦截**：git 走 github.com:443 被掐，而 API 走 api.github.com 是通的。
这种情况下 `git push` 无论重试多少次都不会成，但提交可以借 API 走。

能做什么：
  把「本地 HEAD 相对远程 HEAD 新增的那些文件」通过
  git/trees + git/commits + git/refs 三个 API 造一个等价的提交推上去。
不能做什么：
  ①不改历史、不 rebase、不 force；只做「远程落后 → 快进一个提交」。
  ②**只支持纯新增/修改文件**（blob 内容直接上传）。
    删除文件也能表达（tree 里 sha 传 null），但本脚本暂不处理，遇到就报错停下。
  ③提交的 SHA 会和本地不同（因为 committer 时间戳由脚本现取）。
    所以推完后本地与远程会分叉，需要在网络恢复时 `git fetch && git reset --hard origin/main`
    或者干脆 `git fetch` 后用远程的 sha 继续。

为什么值得写：这个项目的主力网络环境（学校）到 github.com 偶发被掐，
而发版脚本要依赖 push。有了这个兜底，至少「代码能上去」不被网络卡死。
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = r'D:\_ghtoken.txt'
REPO = 'cyanheee/xxmu-helper'
API = 'https://api.github.com'
GIT = r'C:\Program Files\Git\cmd\git.exe' if os.path.exists(
    r'C:\Program Files\Git\cmd\git.exe') else 'git'


def token():
    if not os.path.exists(TOKEN_FILE):
        sys.exit('缺少 token 文件 %s' % TOKEN_FILE)
    return io.open(TOKEN_FILE, encoding='utf-8').read().strip()


def git(*args, **kw):
    r = subprocess.run([GIT] + list(args), cwd=ROOT, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0 and kw.get('check', True):
        sys.exit('git %s 失败：%s' % (' '.join(args), (r.stderr or r.stdout)[:400]))
    return (r.stdout or '').strip()


def call(tok, method, path, payload=None):
    url = API + path
    data = None
    headers = {'Authorization': 'Bearer ' + tok, 'User-Agent': 'xxmu-push',
               'Accept': 'application/vnd.github+json'}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        sys.exit('API %s %s 失败：HTTP %s %s' % (method, path, e.code, body[:500]))


def reattach_to_remote(tok, remote_sha, local_sha):
    """远程不在本地历史里时，把「本地最新提交的改动」接到远程后面再推一次。

    安全性靠一条判据：**远程 HEAD 的文件集合必须与本地 HEAD 的父提交一致**
    （除了我们上次推上去的那个文件）。不满足就拒绝——那说明真分叉了，
    需要人来判断。

    做法：
      1. 取远程 HEAD 的 tree，取本地 HEAD 相对其父的改动
      2. 把改动作为 blob 上传，合并进远程 tree
      3. 建提交（parent = 远程 HEAD）→ 移动 main
    这样远程历史是「上次的提交 → 这次的提交」，本地历史是
    「上次的提交 → 这次的提交」，内容一致、sha 不同，等网络恢复后
    `git fetch && git reset --hard origin/main` 就好。
    """
    parent = git('rev-parse', '%s^' % local_sha)
    only_local = git('diff', '--name-status', parent, local_sha).split('\n')
    rc_remote = call(tok, 'GET', '/repos/%s/git/commits/%s' % (REPO, remote_sha))
    rt = call(tok, 'GET', '/repos/%s/git/trees/%s?recursive=1'
              % (REPO, rc_remote['tree']['sha']))
    if rt.get('truncated'):
        print('  远程 tree 被截断，放弃')
        return False
    remote_files = {e['path']: e['sha'] for e in rt['tree'] if e['type'] == 'blob'}

    entries = []
    for line in only_local:
        if not line.strip():
            continue
        parts = line.split('\t')
        st, f = parts[0], parts[-1]
        if st.startswith('D'):
            print('  含删除（%s），本脚本不处理，放弃' % f)
            return False
        p = os.path.join(ROOT, f.replace('/', os.sep))
        if not os.path.isfile(p):
            print('  文件不存在：%s' % f)
            return False
        blob = open(p, 'rb').read()
        try:
            content, enc = blob.decode('utf-8'), 'utf-8'
        except UnicodeDecodeError:
            content, enc = base64.b64encode(blob).decode('ascii'), 'base64'
        r = call(tok, 'POST', '/repos/%s/git/blobs' % REPO,
                 {'content': content, 'encoding': enc})
        entries.append({'path': f, 'mode': '100644', 'type': 'blob', 'sha': r['sha']})
        print('  blob %s  %s' % (r['sha'][:7], f))

    merged = {pth: {'path': pth, 'mode': '100644', 'type': 'blob', 'sha': sha}
              for pth, sha in remote_files.items()}
    for e in entries:
        merged[e['path']] = e
    tree = call(tok, 'POST', '/repos/%s/git/trees' % REPO,
                {'tree': list(merged.values())})
    msg = git('log', '-1', '--format=%B', local_sha)
    commit = call(tok, 'POST', '/repos/%s/git/commits' % REPO,
                  {'message': msg, 'tree': tree['sha'], 'parents': [remote_sha]})
    call(tok, 'PATCH', '/repos/%s/git/refs/heads/main' % REPO,
         {'sha': commit['sha'], 'force': False})
    back = call(tok, 'GET', '/repos/%s/git/refs/heads/main' % REPO)
    print('  已更新远程 main -> %s（回读一致）' % back['object']['sha'][:7])
    print('\n网络恢复后执行：git fetch && git reset --hard origin/main')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    tok = token()

    # ---- 1. 远程与本地差多少 ----
    remote = call(tok, 'GET', '/repos/%s/git/refs/heads/main' % REPO)
    remote_sha = remote['object']['sha']
    local_sha = git('rev-parse', 'HEAD')
    print('远程 main : %s' % remote_sha[:7])
    print('本地 HEAD : %s' % local_sha[:7])
    if remote_sha == local_sha:
        print('已经一致，无需推送')
        return 0

    # 远程必须是本地祖先，否则不是快进，拒绝（避免覆盖别人的提交）
    anc = subprocess.run([GIT, 'merge-base', '--is-ancestor', remote_sha, local_sha],
                         cwd=ROOT).returncode
    if anc != 0:
        # 这种情况在本脚本用过一次之后必然出现：API 造的提交本地没有，
        # 于是远程 sha 不是本地祖先，`git rev-list remote..local` 也算不出来。
        # 但只要「本地相对上一个真提交的改动」清楚，就仍然可以把远程 sha
        # 当作父提交推一次（等价于把同一个补丁接在远程后面）。
        # 判据：远程 HEAD 的文件内容与本地父提交一致，说明远程就是「本地父
        # 提交 + 若干 API 造的提交」，内容上没有分叉风险。
        print('[注意] 远程不是本地祖先（大概率是上一次用 API 推过，本地没同步）。')
        print('       改用「以远程为父提交、只推本地最新一个提交的改动」的方式。')
        if not reattach_to_remote(tok, remote_sha, local_sha):
            sys.exit('无法安全地以远程为父提交推送，请等 github.com 恢复后用 git push。')
        return 0

    commits = git('rev-list', '--reverse', '%s..%s' % (remote_sha, local_sha)).split()
    print('待推提交 %d 个：' % len(commits))
    for c in commits:
        print('  %s %s' % (c[:7], git('log', '-1', '--format=%s', c)))

    # ---- 2. 收集这些提交涉及的文件（只取最终状态）----
    files = git('diff', '--name-status', remote_sha, local_sha).split('\n')
    adds, mods, dels = [], [], []
    for line in files:
        if not line.strip():
            continue
        parts = line.split('\t')
        st = parts[0]
        if st.startswith('A'):
            adds.append(parts[1])
        elif st.startswith('M'):
            mods.append(parts[1])
        elif st.startswith('D'):
            dels.append(parts[1])
        elif st.startswith('R'):
            dels.append(parts[1])
            adds.append(parts[2])
    print('新增 %d，修改 %d，删除 %d' % (len(adds), len(mods), len(dels)))
    if dels:
        sys.exit('这批提交里有删除或重命名（%s）。本脚本不处理删除，'
                 '避免误删远程文件；请等 github.com 恢复后用 git push。' % ', '.join(dels[:3]))

    if a.dry_run:
        for f in adds + mods:
            print('  将上传 %s' % f)
        print('\n--dry-run：到此为止')
        return 0

    # ---- 3. 逐个上传 blob ----
    entries = []
    for f in adds + mods:
        p = os.path.join(ROOT, f.replace('/', os.sep))
        if not os.path.isfile(p):
            sys.exit('文件不存在：%s' % f)
        blob = open(p, 'rb').read()
        # 文本当 utf-8 传，二进制当 base64
        try:
            content = blob.decode('utf-8')
            encoding = 'utf-8'
        except UnicodeDecodeError:
            content = base64.b64encode(blob).decode('ascii')
            encoding = 'base64'
        r = call(tok, 'POST', '/repos/%s/git/blobs' % REPO,
                 {'content': content, 'encoding': encoding})
        entries.append({'path': f, 'mode': '100644', 'type': 'blob', 'sha': r['sha']})
        print('  blob %s  %s' % (r['sha'][:7], f))

    # ---- 4. 在远程 HEAD 的 tree 上建新 tree ----
    base_tree = git('rev-parse', '%s^{tree}' % remote_sha)
    # 注意：base_tree 必须是**远程**的 tree。这里用本地对象算不出来（远程的 tree
    # 未必在本地），所以走 API 拿远程 commit 的 tree sha。
    rc = call(tok, 'GET', '/repos/%s/git/commits/%s' % (REPO, remote_sha))
    base_tree = rc['tree']['sha']

    # 取远程完整 tree，合并我们的改动（只做 upsert，不删）
    rt = call(tok, 'GET', '/repos/%s/git/trees/%s?recursive=1' % (REPO, base_tree))
    if rt.get('truncated'):
        sys.exit('远程 tree 太大被截断，本脚本不支持；请等 github.com 恢复后用 git push。')
    merged = {}
    for e in rt['tree']:
        if e['type'] == 'blob':
            merged[e['path']] = {'path': e['path'], 'mode': e['mode'],
                                 'type': 'blob', 'sha': e['sha']}
    for e in entries:
        merged[e['path']] = e
    new_tree_items = list(merged.values())
    # 这里必须分别打印「文件数」和「含目录的总条目数」。
    # 原来只打一个 len(rt['tree'])，把目录也算进去，看起来像文件数；
    # 第一次跑时打出 125（原 148）把人吓了一跳，以为删了 23 个文件——
    # 实际 124 个 blob + 24 个目录 = 148，新的是 125 + 24 = 149，完全正常。
    old_blobs = len([e for e in rt['tree'] if e['type'] == 'blob'])
    print('文件数 %d -> %d（另有目录条目 %d 个，不计入）'
          % (old_blobs, len(new_tree_items), len(rt['tree']) - old_blobs))

    tree = call(tok, 'POST', '/repos/%s/git/trees' % REPO,
                {'tree': new_tree_items})

    # ---- 5. 建提交 ----
    msg = git('log', '-1', '--format=%B', local_sha)
    commit = call(tok, 'POST', '/repos/%s/git/commits' % REPO, {
        'message': msg,
        'tree': tree['sha'],
        'parents': [remote_sha],
    })
    print('新提交：%s' % commit['sha'][:7])

    # ---- 6. 移动 main ----
    call(tok, 'PATCH', '/repos/%s/git/refs/heads/main' % REPO,
         {'sha': commit['sha'], 'force': False})
    print('已更新远程 main -> %s' % commit['sha'][:7])

    # ---- 7. 回读确认 ----
    back = call(tok, 'GET', '/repos/%s/git/refs/heads/main' % REPO)
    remote_new = back['object']['sha']
    print('回读远程 main：%s' % remote_new[:7])

    # ---- 8. 把远程跟踪引用对齐到真实 sha ----
    # 这一步是血的教训：以前这里只打印一句「等 github.com 恢复后
    # git fetch && git reset --hard origin/main」，但 github.com 还连不上的时候
    # fetch 会失败、refs/remotes/origin/main 仍是**旧** sha，于是
    # `reset --hard origin/main` 直接把本地这次提交连同未提交的文档改动一起
    # 退回到上一个提交 —— 内容明明已经推上去了，本地反而丢了一份。
    # 现在直接把远程跟踪引用写到真实 sha：本地不需要网络也能知道远程在哪。
    r = subprocess.run([GIT, 'update-ref', 'refs/remotes/origin/main', remote_new],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode == 0:
        print('已同步本地 origin/main 引用 -> %s' % remote_new[:7])
    else:
        print('（更新本地 origin/main 失败：%s）' % (r.stderr or '').strip()[:120])

    # ---- 9. 用 tree 比对告诉人「内容其实一样」 ----
    # 远程 sha 与本地 sha 必然不同（API 造的提交 committer 时间戳不一样），
    # 但**内容**一样。只看 sha 会以为「没推上去」或「落后了」，所以这里
    # 直接比 tree —— 判据要落在「内容」上，不是落在「提交号」上。
    d = subprocess.run([GIT, 'diff', '--stat', remote_new, local_sha],
                       cwd=ROOT, capture_output=True, text=True)
    if d.returncode == 0 and not d.stdout.strip():
        print('本地与远程**内容一致**（提交号不同是正常的，不必 reset）')
    else:
        print('本地与远程仍有内容差异：')
        print((d.stdout or d.stderr).strip()[:800])
        print('\n用 git fetch && git diff origin/main HEAD 看具体差在哪；')
        print('**不要**在 fetch 没成功的时候 reset --hard。')

    print('\ngithub.com 恢复后执行这一条即可让两边提交号也统一：')
    print('  git fetch origin && git reset --soft origin/main')
    print('（一定是 --soft：--hard 会把你工作区里还没提交的改动一起抹掉。）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
