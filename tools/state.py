#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 STATE.md —— 「现在到底在哪」的单页快照。

为什么需要它
============
这个项目已经做到 40 多个版本、1900 行交接文档。真正的痛点不是文档不够，
而是**新开一个会话要先读 1900 行才知道现在在哪**，而会话本身又有长度上限：
读得越多，能干活的余量越少，最后「对话太长点不进去」。

所以拆成两层：
  HANDOFF.md   稳定层 —— 架构、数据模型、打包流程、踩过的坑。几个月才变一次。
  STATE.md     状态层 —— 版本号、线上配置、git 位置、未完待办。每次收工重跑一次。

STATE.md 全部由脚本从**制品本身**读出来（APK 里的版本号、KV 里的 latest、
git 的 HEAD），不接受手填 —— 手填的版本号就是 v1.1.15 那次
「cfg 说新版、下载到旧字节」的根源。

用法
    python tools/state.py            # 重新生成 STATE.md 并打印摘要
    python tools/state.py --no-net   # 不联网（离线也能生成，线上那几行标注为未探测）

接手一个新会话时：**只读 STATE.md**（一屏），需要细节再翻 HANDOFF.md 的具体章节。
"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'STATE.md')

GIT = r'C:\Program Files\Git\cmd\git.exe'
if not os.path.exists(GIT):
    GIT = 'git'

BASES = [
    'https://xxmu-auth.pages.dev',
    'https://www.xxmuhelper.top',
]


def sh(args, cwd=None):
    try:
        r = subprocess.run(args, cwd=cwd or ROOT, capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=60)
        return r.stdout.strip()
    except Exception:                                        # noqa: BLE001
        return ''


# ---------------------------------------------------------------- 本地制品

def local_version():
    """版本号从 AndroidManifest 读（它是出包时的唯一真实来源）。

    同时读 about.js 与 index.html，三者不一致就在报告里显式标红 ——
    这三处历史上漏改过多次，用户看到的版本号会分成两套。
    """
    mani = io.open(os.path.join(ROOT, 'android/AndroidManifest.xml'),
                   encoding='utf-8').read()
    vn = re.search(r'android:versionName="([^"]+)"', mani)
    vc = re.search(r'android:versionCode="(\d+)"', mani)
    about = io.open(os.path.join(ROOT, 'web/about.js'), encoding='utf-8').read()
    av = re.search(r"const APP_VERSION = '([\d.]+)'", about)
    idx = io.open(os.path.join(ROOT, 'web/index.html'), encoding='utf-8').read()
    iv = re.search(r'id="aboutVer">v([\d.]+)<', idx)
    got = {
        'manifest': vn.group(1) if vn else '?',
        'code': vc.group(1) if vc else '?',
        'about.js': av.group(1) if av else '?',
        'index.html': iv.group(1) if iv else '?',
    }
    vals = set(got[k] for k in ('manifest', 'about.js', 'index.html'))
    return got, (len(vals) == 1)


def latest_apk():
    d = os.path.join(ROOT, 'apk')
    if not os.path.isdir(d):
        return None
    cands = [f for f in os.listdir(d) if f.endswith('.apk')]

    def key(f):
        m = re.search(r'v(\d+)\.(\d+)\.(\d+)', f)
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)

    if not cands:
        return None
    f = sorted(cands, key=key)[-1]
    p = os.path.join(d, f)
    blob = open(p, 'rb').read()
    return {
        'name': f,
        'size': len(blob),
        'sha256': hashlib.sha256(blob).hexdigest(),
        'at': time.strftime('%Y-%m-%d %H:%M', time.localtime(os.path.getmtime(p))),
    }


def apk_badging(path):
    """从 APK 自身读版本号 —— 和磁盘清单对比，防「清单改了、包是旧的」。"""
    sdk = os.environ.get('ANDROID_HOME') or r'D:\android-sdk'
    aapt2 = os.path.join(sdk, 'build-tools', '33.0.2', 'aapt2.exe')
    if not os.path.exists(aapt2):
        return None
    out = sh([aapt2, 'dump', 'badging', path])
    vn = re.search(r"versionName='([^']+)'", out)
    vc = re.search(r"versionCode='(\d+)'", out)
    if not (vn and vc):
        return None
    return {'ver': vn.group(1), 'code': vc.group(1)}


def git_state():
    st = {}
    st['head'] = sh([GIT, 'rev-parse', '--short', 'HEAD'])
    st['branch'] = sh([GIT, 'rev-parse', '--abbrev-ref', 'HEAD'])
    st['log'] = [l for l in sh([GIT, 'log', '--oneline', '-n', '6']).split('\n') if l]
    st['dirty'] = [l for l in sh([GIT, 'status', '--porcelain']).split('\n') if l]
    st['remote'] = sh([GIT, 'rev-parse', '--short', 'origin/main'])
    st['ahead'] = sh([GIT, 'rev-list', '--count', 'origin/main..HEAD'])
    # 远程 sha 可能由 API 造（push_via_api.py 在 github.com 连不上时用它），
    # 那样两边 sha 不同、内容其实一样。只看提交数会误报「有 2 个没推」。
    st['tree_same'] = sh([GIT, 'diff', '--stat', 'origin/main', 'HEAD']) == ''
    return st


# ---------------------------------------------------------------- 线上

def probe(base, path, timeout=12):
    try:
        req = urllib.request.Request(base + path, headers={'User-Agent': 'xxmu-state/1'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except Exception as e:                                   # noqa: BLE001
        return None, str(e).encode('utf-8', 'replace')


def online_cfg(timeout=15):
    for base in BASES:
        code, body = probe(base, '/v1/config', timeout)
        if code == 200:
            try:
                return base, json.loads(body.decode('utf-8'))
            except Exception:                                # noqa: BLE001
                continue
    return None, None


def ws_text(txt, maxlen=90):
    txt = (txt or '').replace('\\n', '\n').strip()
    return txt[:maxlen].replace('\n', ' / ')


# ---------------------------------------------------------------- 待办拾取

def todo_of_project():
    """从 docs/handoff/todo.md 抓未完成的待办（`- [ ]` 开头的行）。"""
    p = os.path.join(ROOT, 'docs/handoff/todo.md')
    if not os.path.exists(p):
        return []
    lines = io.open(p, encoding='utf-8').read().split('\n')
    out = []
    for l in lines:
        s = l.strip()
        if s.startswith('- [ ]'):
            out.append(s[5:].strip())
        elif s.startswith('## '):
            out.append('@@' + s[3:].strip())
    return out


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-net', action='store_true', help='不联网读线上配置')
    a = ap.parse_args()

    ver, ver_ok = local_version()
    apk = latest_apk()
    bad = apk_badging(os.path.join(ROOT, 'apk', apk['name'])) if apk else None
    g = git_state()
    base, cfg = (None, None) if a.no_net else online_cfg()

    L = []
    w = L.append
    w('# 河医大助手 · 当前状态（STATE）')
    w('')
    w('> 自动生成，**别手改**。重新生成：`python tools/state.py`。')
    w('> 生成时间：%s' % time.strftime('%Y-%m-%d %H:%M'))
    w('> 接手一个会话时只读这一页；架构与踩坑细节见 [HANDOFF.md](HANDOFF.md)，')
    w('> 历史每一版改了什么见 [docs/handoff/changelog.md](docs/handoff/changelog.md)，')
    w('> 待办见 [docs/handoff/todo.md](docs/handoff/todo.md)。')
    w('')

    # ---- 1. 代码版本
    w('## 1. 代码版本（读自磁盘）')
    w('')
    w('| 位置 | 值 |')
    w('|---|---|')
    w('| AndroidManifest versionName | **%s** |' % ver['manifest'])
    w('| AndroidManifest versionCode | **%s** |' % ver['code'])
    w('| web/about.js APP_VERSION | %s |' % ver['about.js'])
    w('| web/index.html #aboutVer | %s |' % ver['index.html'])
    w('')
    if not ver_ok:
        w('> ⚠️ **三处版本号不一致** —— 出包前必须 `python tools/bump_ver.py x.y.z CODE` 统一，')
        w('> 否则「我的」页显示的和包里写的是两个数。')
        w('')

    # ---- 2. 本地最新的包
    w('## 2. 本地最新的包')
    w('')
    if apk:
        w('| 项 | 值 |')
        w('|---|---|')
        w('| 文件 | `apk/%s` |' % apk['name'])
        w('| 大小 | %d 字节 |' % apk['size'])
        w('| SHA-256 | `%s` |' % apk['sha256'])
        w('| 出包时间 | %s |' % apk['at'])
        if bad:
            w('| 包内版本（aapt2） | %s / %s |' % (bad['ver'], bad['code']))
            if bad['ver'] != ver['manifest']:
                w('')
                w('> ⚠️ **包内版本（%s）≠ 磁盘清单（%s）**：要么没重新出包，要么出完又改了清单。'
                  % (bad['ver'], ver['manifest']))
        w('')
        w('注意：**多个版本常常字节数相同**（v1.1.16 与 v1.1.17 都是 558650），')
        w('只能靠 SHA-256 和包内符号区分，别用大小认版本。')
        w('')
    else:
        w('apk/ 下没有包。')
        w('')

    # ---- 3. 线上
    w('## 3. 线上现在发的是哪一版')
    w('')
    if a.no_net:
        w('（本次用了 `--no-net`，未探测线上。）')
        w('')
    elif not cfg:
        w('> ⚠️ 两个入口都探测不到 `/v1/config`：%s' % '、'.join(BASES))
        w('> 这不等于服务挂了 —— 校园网查不到自有域名是常态，用 `python tools/check_domain.py` 分区诊断。')
        w('')
    else:
        lat = cfg.get('latest') or {}
        mn = cfg.get('min') or {}
        ap = cfg.get('apk') or {}
        w('探测入口：`%s`（另一个是 `%s`）' % (base, [b for b in BASES if b != base][0]))
        w('')
        w('| 字段 | 值 |')
        w('|---|---|')
        w('| latest.version | **%s** |' % lat.get('version'))
        w('| latest.code | %s |' % lat.get('code'))
        w('| latest.size | %s |' % lat.get('size'))
        w('| latest.sha256 | `%s` |' % str(lat.get('sha256'))[:16])
        w('| latest.url | %s |' % lat.get('url'))
        w('| apk.name（blob 里实际的包） | %s |' % ap.get('name'))
        w('| min.code（强制淘汰线） | %s |' % mn.get('code'))
        w('| enforceVer | %s |' % cfg.get('enforceVer'))
        w('| updPolicy | %s |' % cfg.get('updPolicy'))
        w('| qq | %s |' % cfg.get('qq'))
        w('| maxDev | %s |' % cfg.get('maxDev'))
        w('')
        if apk and lat.get('sha256') and lat['sha256'] != apk['sha256']:
            w('> 线上 latest 与本地最新的包**不是同一个**（sha 不同）。')
            if lat.get('version') == apk['name'].split('-v')[-1].replace('.apk', ''):
                w('> 版本号却一样 —— 这是最坏的一种错配，见 HANDOFF「发布 ≠ 出包」。')
            w('')
        elif apk and lat.get('sha256') == apk['sha256']:
            w('> 线上 latest 与本地最新的包**字节一致**：发过了，不用再发。')
            w('')
        if apk and lat.get('version') != ver['manifest']:
            w('> 本地已到 **%s**，线上还是 **%s** —— 新版本**还没发**。'
              % (ver['manifest'], lat.get('version')))
            w('> （用户说「继续写」不等于授权发布；只有说「上线/发版/发布」才切 latest。）')
            w('')

    # ---- 4. git
    w('## 4. 仓库位置')
    w('')
    w('| 项 | 值 |')
    w('|---|---|')
    w('| 分支 | %s @ `%s` |' % (g['branch'], g['head']))
    w('| origin/main | `%s` |' % (g['remote'] or '未取'))
    if g['tree_same']:
        w('| 与远程内容 | **一致**（没推的东西） |')
    else:
        w('| 领先远程 | %s 个提交 |' % (g['ahead'] or '0'))
    w('| 未提交改动 | %s 个文件 |' % (len(g['dirty']) if g['dirty'] != [''] else 0))
    w('')
    if g['log']:
        w('最近提交：')
        w('')
        w('```')
        for l in g['log']:
            w(l)
        w('```')
        w('')
    if g['dirty']:
        w('未提交：')
        w('')
        w('```')
        for l in g['dirty'][:12]:
            w(l)
        w('```')
        w('')

    # ---- 5. 常用命令
    w('## 5. 常用命令（复制即用）')
    w('')
    w('```powershell')
    w('$env:Path += \';C:\\Program Files\\Git\\cmd;C:\\Program Files\\nodejs\'   # git / node 都不在默认 PATH')
    w('')
    w('node tools/check_web.js                 # 静态体检（版本三处一致 / assets 同步 / 各版锚点）')
    w('node tools/test_mytodo.js               # 以及 tools/test_*.js 全套离线测试')
    w('python tools/build_apk.py               # 出包（自动同步 web/ -> assets/）')
    w('python tools/verify_apk.py              # 出包后五件套校验')
    w('python tools/bump_ver.py 1.1.22 1122    # 版本号三处同改')
    w('python tools/publish_apk.py --no-publish  # 只上传不通知（默认就该用这个）')
    w('python tools/publish_apk.py             # 真发布：切 cfg.latest，学生一开就弹更新')
    w('python tools/state.py                   # 重新生成本文件')
    w('```')
    w('')
    w('工具清单与每套测试覆盖什么，见 HANDOFF.md 第 7 节与「离线测试一览」。')
    w('')

    # ---- 6. 未完待办
    todos = todo_of_project()
    w('## 6. 未完待办')
    w('')
    if not todos:
        w('（docs/handoff/todo.md 里没有未勾选的条目。）')
    else:
        for t in todos:
            w(('### %s' % t[2:]) if t.startswith('@@') else ('- [ ] %s' % t))
    w('')

    body = '\n'.join(L).rstrip('\n') + '\n'
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body)

    print('已生成 %s（%d 行，%d 字节）' % (os.path.relpath(OUT, ROOT),
                                          body.count('\n'), len(body.encode('utf-8'))))
    print('  代码版本 %s / %s%s' % (ver['manifest'], ver['code'],
                                    '' if ver_ok else '  ⚠ 三处不一致'))
    if apk:
        print('  最新包   %s  %d 字节  %s' % (apk['name'], apk['size'], apk['sha256'][:12]))
    if cfg:
        print('  线上     %s / %s（%s）' % (cfg.get('latest', {}).get('version'),
                                            cfg.get('latest', {}).get('code'), base))
    else:
        print('  线上     未探测/探测失败')
    print('  git      %s @ %s，领先远程 %s' % (g['branch'], g['head'], g['ahead'] or '0'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
