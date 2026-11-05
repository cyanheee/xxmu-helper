#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""敏感信息扫描：把「绝不能公开」的东西在提交前揪出来。

    python -X utf8 tools/scan_secrets.py              # 扫整个仓库
    python -X utf8 tools/scan_secrets.py --path web   # 只扫某个目录
    python -X utf8 tools/scan_secrets.py --strict     # 有 WARN 也返回非零

为什么需要它：这个项目里同时住着**要公开的东西**（前端源码、官网、工具脚本）
和**绝不能公开的东西**（Cloudflare Token、ADMIN_KEY、签名密钥、学生的真实
课表和作业页面快照）。靠人肉记「哪些别提交」必然漏，而且漏一次就是永久的
—— Git 历史里的东西删不干净，别人 clone 过就扩散了。

结论分三级，因为「构建产物没被忽略」和「密钥泄露」根本不是一个严重程度，
混在一起输出会把真正的问题淹没（第一版就把 611 条构建产物和 5 条密钥
排在同一屏里，等于没法看）：
  【BLOCK】必须人工确认才能提交：密钥形态、真实个人信息、密钥库、真实数据快照
  【IGNORE】构建产物，本该进 .gitignore；只要确认 .gitignore 覆盖了它就行
  【WARN】可疑但多半是示例值：示例学号、测试手机号

退出码：0 = 干净；1 = 有 BLOCK；2 = 只有 IGNORE/WARN（且未加 --strict）。
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------- BLOCK：一旦进了公开仓库就是事故 ----------------
BLOCK_PATHS = [
    (r'\.jks$', '签名密钥库'),
    (r'\.keystore$', '签名密钥库'),
    (r'DEPLOY-OUT\.txt$', '部署输出（含 ADMIN_KEY）'),
    (r'_ghtoken|^ghtoken\.txt$', 'GitHub Token 文件'),
    (r'^build_scan/', '学习通页面全量快照（含真实学号与课程）'),
    (r'^build_html', '学习通页面分片（含真实作业状态）'),
    (r'^data/session\.json$', '教务会话 cookie'),
    (r'^data/captcha\.jpg$', '验证码图'),
    (r'^data/.*\.pkl$', 'Python 会话 pickle'),
    (r'^data/.*\.db$', 'cookie 数据库'),
    (r'secrets\.json$', '学号密码'),
]

# 「体积大 / 是产物」而不是「泄密」的，不归 BLOCK：
# 历史安装包一共 50 多个、16 MB，公开仓库里既没必要也拖慢 clone，
# 但它们本身不含任何秘密（签名在前，内容是公开的 APK）。
# 和密钥库混在 BLOCK 里只会让真正的问题（1 个 .jks）被 50 行包名淹没。
# 下面定义完 BUILD_PATHS 之后再补进去。

# ---------------- IGNORE：构建产物，确认 .gitignore 覆盖即可 ----------------
BUILD_PATHS = [
    (r'^android/build/', '打包中间产物'),
    (r'^android/assets/', 'web/ 的构建副本（build_apk.py 生成）'),
    (r'^build_/', '打包中间产物'),
    (r'^\.wrangler/', 'wrangler 本地状态'),
    # 历史安装包一共 50 多个、16 MB，公开仓库里既没必要也拖慢 clone，
    # 但它们本身不含任何秘密（签名在前，内容是公开的 APK）。
    # 和密钥库混在 BLOCK 里只会让真正的问题（1 个 .jks）被 50 行包名淹没。
    (r'^apk/.*\.apk$', '历史安装包（走 Releases，不进仓库）'),
    (r'^apk/.*\.notes\.txt$', '发版说明（随 Release 一起放）'),
]

# ---------------- 内容里的密钥形态 ----------------
SECRET_PATTERNS = [
    (r'cfut_[A-Za-z0-9_\-]{20,}', 'Cloudflare API Token', '立刻吊销并换新'),
    (r'\bsk-[A-Za-z0-9]{20,}', 'OpenAI 风格密钥', '换新'),
    (r'\bAKIA[0-9A-Z]{16}\b', 'AWS Access Key', '换新'),
    (r'(?i)(admin[_-]?key|api[_-]?key|secret[_-]?key)\s*[=:]\s*["\']?[A-Za-z0-9_\-]{16,}',
     '疑似硬编码密钥', '改成从环境变量读'),
]

# ---------------- 个人信息 ----------------
PII_PATTERNS = [
    (r'\b20\d{9,11}\b', '疑似学号'),
    (r'\b1[3-9]\d{9}\b', '疑似手机号'),
    (r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', '邮箱'),
]

# 允许出现的值：占位符、示例、公开联系方式。
# 不加白名单的话，文档里写「例如 20261440117」也会被拦，跑几次没人看就废了。
ALLOW_VALUES = {
    '20261440117',      # 文档示例学号
    '20261440105',      # 历史事故记录里的示例（作者本人，已公开）
    '20261440106',
    '20261440107',
    '20261440108',
    '20261430313',
    '20260100001',      # 界面占位符
    '202500000999',     # 测试用例
    '1097668324',       # QQ 群号（公开）
    '572833261',        # 作者 QQ（对外公开）
    '572833261@qq.com',  # 作者邮箱（公开）
    '13800000000',      # 测试手机号
    '03733029485',      # 学校招生办（公开信息）
    '3527049930',       # 学校官方 QQ（公开信息）
    'ADMIN_KEY_HERE',   # 测试里的占位
}

# 这些文件本身就是「怎么防泄密」的说明 / 测试夹具，会引用密钥形态做例子，
# 只扫路径不扫内容（否则文档会自己命中自己 —— check_web 上踩过一次同款）。
SELF_REFERENTIAL = {
    'tools/scan_secrets.py',
    'tools/test_cfg.js',
    'tools/test_edgecache.js',
    'tools/test_license.js',
    'tools/test_grab.js',
}

SKIP_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.apk', '.jar',
            '.jks', '.keystore', '.zip', '.pyc', '.so', '.dex', '.ttf',
            '.woff', '.class', '.idsig'}


def mask(s):
    if len(s) <= 8:
        return s[:2] + '***'
    return s[:4] + '***' + s[-3:]


def walk(bases):
    for base in bases:
        if os.path.isfile(base):
            yield base
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules', '__pycache__')]
            for fn in filenames:
                yield os.path.join(dirpath, fn)


def load_gitignore():
    p = os.path.join(ROOT, '.gitignore')
    pats = []
    try:
        with open(p, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                pats.append(line.lstrip('/'))
    except OSError:
        pass
    return pats


def covered_by_gitignore(rel, pats):
    """判断 rel 是否被某条 .gitignore 规则覆盖。

    只实现仓库里实际用到的那几种形态，够用且不会有意外的宽匹配：
      · 目录规则 `foo/`         → 路径以 foo/ 开头
      · 通配 `*.ext` / `apk/*.ext` → 用 fnmatch（支持 * 与 ?）
      · 精确路径                → 相等或作为目录前缀
    不实现 `**`、`!` 取反等高级语法 —— 用不到，实现了反而容易误判。
    """
    import fnmatch
    for p in pats:
        if p.endswith('/'):
            if rel.startswith(p):
                return True
            continue
        if '*' in p or '?' in p:
            # fnmatch 的 * 会跨 / ，而 gitignore 的 * 不跨。
            # 这里把 rel 的目录部分和文件名分开比，避免 apk/*.apk 误配 a/b.apk。
            if '/' in p:
                if fnmatch.fnmatch(rel, p):
                    return True
            else:
                if fnmatch.fnmatch(rel.rsplit('/', 1)[-1], p):
                    return True
            continue
        if rel == p or rel.startswith(p + '/') or rel.endswith('/' + p):
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--path', action='append', default=None)
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--strict', action='store_true')
    a = ap.parse_args()

    bases = a.path or [ROOT]
    block, ignore, warn, shielded = [], [], [], []
    gi = load_gitignore()
    scanned = 0

    for f in walk(bases):
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        ext = os.path.splitext(f)[1].lower()

        # 判据修正（v1.1.22）：BLOCK 的本意是「这东西会进仓库」，不是
        # 「这东西存在于磁盘上」。以前只要路径命中就报 BLOCK，于是
        # 本地留着调试快照（build_html/）、签名密钥、DEPLOY-OUT.txt
        # 这些**已经被 .gitignore 挡住**的文件也会刷出 439 条 ——
        # 都是误报，跑几次就没人看了，等于这个脚本失效。
        # 现在分两档：.gitignore 已覆盖 -> shielded（跳过内容扫描）；
        # 没覆盖 -> 才是真的 BLOCK，那才是会泄密的那一条。
        protected = covered_by_gitignore(rel, gi)
        hit_block = None
        for pat, why in BLOCK_PATHS:
            if re.search(pat, rel):
                hit_block = why
                break
        if hit_block:
            if protected:
                shielded.append((rel, 0, hit_block, ''))
            else:
                block.append((rel, 0, hit_block + '（.gitignore 未覆盖！）', ''))
        for pat, why in BUILD_PATHS:
            if re.search(pat, rel):
                if not protected:
                    ignore.append((rel, 0, why + '（.gitignore 未覆盖！）', ''))
                break

        # .gitignore 已经挡住的文件不会再进仓库，里面的内容也就不会泄密，
        # 没必要再逐行扫（还会把 build_html/ 的几百个分片读一遍，很慢）。
        if protected or hit_block:
            continue

        if ext in SKIP_EXT:
            continue
        try:
            if os.path.getsize(f) > 2 * 1024 * 1024:
                continue
        except OSError:
            continue

        scanned += 1
        try:
            with open(f, encoding='utf-8', errors='ignore') as fh:
                lines = fh.readlines()
        except OSError:
            continue

        do_content = rel not in SELF_REFERENTIAL
        for i, line in enumerate(lines, 1):
            if not do_content:
                break
            for pat, name, advice in SECRET_PATTERNS:
                m = re.search(pat, line)
                if m and m.group(0) not in ALLOW_VALUES:
                    block.append((rel, i, name, mask(m.group(0)) + '（' + advice + '）'))
            for pat, name in PII_PATTERNS:
                for m in re.finditer(pat, line):
                    v = m.group(0)
                    if v in ALLOW_VALUES:
                        continue
                    warn.append((rel, i, name, mask(v)))

    if not a.quiet:
        print('扫描了 %d 个文本文件（另有二进制按路径判定）' % scanned)

    def dump(title, rows, limit=40):
        """按「规则名下第一条 + 条数」聚合输出。

        为什么不是逐条打印：build_html/ 一个目录就有几百个分片文件，
        逐条列出来会占满整屏，人只会看到「439 条」然后关掉窗口 ——
        等于没扫。真正要看的只是「哪条规则命中了、涉及到哪些位置」，
        所以每条规则只给一个代表位置 + 总数。
        """
        if not rows:
            return
        by_name = {}
        for rel, ln, name, ev in rows:
            by_name.setdefault(name, []).append((rel, ln, ev))
        print('\n【%s】%d 条，涉及 %d 类问题' % (title, len(rows), len(by_name)))
        for name, items in by_name.items():
            rel, ln, ev = items[0]
            loc = rel + (':%d' % ln if ln else '')
            extra = '' if len(items) == 1 else '  (共 %d 处)' % len(items)
            print('  %-20s %-46s %s%s' % (name[:20], loc[:46], ev, extra))

    dump('BLOCK 必须确认（会进仓库的）', block)
    dump('IGNORE 构建产物', ignore)
    dump('WARN 疑似示例值', warn)

    # 被 .gitignore 挡住的敏感文件：不算问题，但要说出来，
    # 否则「扫描说干净」和「磁盘上躺着 6 个密钥文件」看起来矛盾。
    if shielded and not a.quiet:
        by_name = {}
        for rel, _ln, name, _ev in shielded:
            by_name.setdefault(name, []).append(rel)
        print('\n【已挡住】%d 个敏感文件在磁盘上，但 .gitignore 覆盖了，不会进仓库：'
              % len(shielded))
        for name, items in by_name.items():
            print('  %-22s %s%s' % (name[:22], items[0][:46],
                                    '' if len(items) == 1 else '  (共 %d 处)' % len(items)))

    print('\n' + '=' * 68)
    if block:
        print('[FAIL] %d 条 BLOCK。这些不能出现在任何提交里。' % len(block))
        print('       一旦提交过，从历史里删除要 filter-repo，所以必须在第一次提交前挡住。')
        return 1
    if ignore:
        print('[FAIL] %d 个构建产物的路径没被 .gitignore 覆盖，会误提交。' % len(ignore))
        return 1
    if warn:
        if a.strict:
            print('[FAIL] %d 条 WARN（--strict 模式）。确认是示例值就加进 ALLOW_VALUES。' % len(warn))
            return 2
        print('[WARN] %d 条疑似示例值，人工过一眼；确认真的是示例就加进 ALLOW_VALUES。' % len(warn))
        return 2
    print('[PASS] 没有发现需要拦截的内容。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
