#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「计算机软件著作权登记」要交的源程序文档（PDF）。

    python -X utf8 tools/gen_copyright.py                 # 生成前 30 + 后 30 页
    python -X utf8 tools/gen_copyright.py --pages 30      # 自定义每段页数
    python -X utf8 tools/gen_copyright.py --no-pdf        # 只出 txt，不转 PDF

中国版权保护中心的要求（2026 年现行口径）：
  · 源程序提交**前 30 页 + 后 30 页**，共 60 页；不足 60 页的，全部提交。
  · 每页 **50 行**（不含页眉）。
  · 页眉写**软件全称 + 版本号**，右上角写页码。
  · 连续页码（前 30 页是 1–30，后 30 页接着 31–60，中间用省略号隔开也行，
    但更稳妥的做法是直接连续编号 + 中间留一页说明「以下为程序末尾部分」）。

这份脚本干的事：
  1. 按「项目自己的代码」优先排序收集源文件（先把 web/、android/、core/、
     server/、tools/ 的真实源码挑出来，跳过后端第三方库与构建产物）
  2. 每 50 行分一页，页眉加软件名 + 版本 + 页码
  3. 生成一个 HTML，再用本机 Edge 无头打印成 PDF

**为什么不用 reportlab / fpdf**：本机没装这些库，而装库要走网络。
用「HTML + Edge 打印」零依赖，且中文字体直接用系统字体，不会出现方块。
"""
import argparse
import io
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 软件全称与版本：软著证书上印的就是这两项，必须与实际发布一致。
# 名字取「河南医药大学」的正式校名，不用简称，审核时更容易对应到实际软件。
SOFT_NAME = '河医大助手校园教务辅助软件'
SOFT_VER = 'V1.1.17'

LINES_PER_PAGE = 50
PAGES_EACH_END = 30

# 选哪些源码进软著。顺序即展示顺序 —— 把最能体现「这是我写的」的部分放前面：
# 前端界面与业务逻辑 → Android 壳 → 抓取与解析 → 服务端 → 构建工具。
# 每项是 (目录, 允许的扩展名, 是否递归)。
INCLUDE = [
    ('web', ['.js', '.html', '.css'], False),
    ('android/src', ['.java', '.xml'], True),
    ('android/res', ['.xml'], True),
    ('core', ['.py', '.js'], False),
    ('server', ['.js', '.toml'], False),
    ('server/pages/dist', ['.js', '.html'], False),
    ('tools', ['.py', '.js'], False),
]

# 明确排除：第三方库（不是他写的，写进软著反而不合适）、生成物，
# 以及**本脚本自己**。
#
# 为什么要排除自己：gen_copyright.py 属于 tools/，会被 INCLUDE 扫到。
# 但它运行时会重新写 publish/srcreg/source.*，如果它读的是「上一次的自己」，
# 行数就与这一次不同 —— 表现出来就是末页莫名其妙多一行（实测 51 行），
# 而校验脚本会判定「每页 50 行」不合格。自指的脚本不进自己的产物。
EXCLUDE_NAMES = {
    'jsQR.js',            # 第三方二维码解码库
    'jkingo.des.js',      # 青果加密的第三方复刻（算法来自学校页面）
    'base64.js', 'md5.js',
    'data.js', 'homework.js',   # 由抓取脚本生成的单行 JSON 注入
    'gen_copyright.py',   # 本脚本（自指，见上面说明）
    'verify_copyright.py',  # 校验脚本同理
    'scan_secrets.py',    # 敏感信息扫描器（含密钥形态的正则，不该进软著）
    'gen_manual.py',
    'verify_doc.py',
    'verify_doc_pages.py',
    'bump_ver.py',
    'set_latest.py',
}

# 测试文件不进软著源程序：
# ① 它们不是「软件运行时」的代码，写进源程序反而让审查员困惑；
# ② 测试里会出现 test-admin-key-123456 这类**看起来像凭据**的假值，
#    交上去可能被要求说明，纯属自找麻烦。
# ③ 测试文件动辄几千行，占掉 60 页配额，挤掉真正的主体代码。
EXCLUDE_PREFIXES = ('test_',)

EXCLUDE_PATH_PARTS = ('node_modules', '__pycache__', 'android/assets',
                      'android/build', 'build_', '.git', 'apk/')


def read_text(p):
    for enc in ('utf-8', 'gbk', 'latin-1'):
        try:
            with io.open(p, encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    return ''


def collect():
    """收集 (相对路径, 行列表)，按 INCLUDE 顺序。"""
    out = []
    for sub, exts, rec in INCLUDE:
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        files = []
        if rec:
            for dp, dns, fns in os.walk(base):
                dns[:] = [d for d in dns if d not in ('node_modules', '__pycache__')]
                for fn in fns:
                    files.append(os.path.join(dp, fn))
        else:
            for fn in os.listdir(base):
                fp = os.path.join(base, fn)
                if os.path.isfile(fp):
                    files.append(fp)
        files.sort()
        for fp in files:
            rel = os.path.relpath(fp, ROOT).replace('\\', '/')
            if any(part in rel for part in EXCLUDE_PATH_PARTS):
                continue
            if os.path.basename(fp) in EXCLUDE_NAMES:
                continue
            # 测试文件不进软著源程序（原因见 EXCLUDE_PREFIXES 的说明）
            if os.path.basename(fp).startswith(EXCLUDE_PREFIXES):
                continue
            if os.path.splitext(fp)[1].lower() not in exts:
                continue
            try:
                if os.path.getsize(fp) > 1024 * 1024:
                    continue
            except OSError:
                continue
            txt = read_text(fp)
            if not txt.strip():
                continue
            lines = txt.replace('\r\n', '\n').replace('\r', '\n').split('\n')
            # 去掉文件末尾的空行，别让每页都是空白
            while lines and not lines[-1].strip():
                lines.pop()
            if lines:
                out.append((rel, lines))
    return out


def flatten(files):
    """把所有源码拉成一条行流，但保留「文件名标记行」便于审查员定位。"""
    stream = []
    for rel, lines in files:
        stream.append('// ======== 文件：%s ========' % rel)
        stream.extend(lines)
        stream.append('')
    return stream


def to_pages(stream, total_pages_target):
    """按 LINES_PER_PAGE 切页；头尾各取 PAGES_EACH_END 页。

    返回 (页列表, 是否省略过, 省略了多少页)。

    **末页必须正好 50 行**：软著审查口径是「每页 50 行」，源码总行数不一定是
    50 的整数倍，直接切会让最后一页只剩十几行 —— 这是常见的退件原因。

    正确做法不是「往前借几行」（借完反而会出现 51 行和 48 行两页错位，
    第一版就是这么写的），而是**重新对齐**：
      尾段固定 30 页 = 1500 行，起点定在 `len - 1500`。
      这样最后一页天然取到结尾，而 1500 是 50 的整数倍，
      所以整段 30 页每页都正好 50 行。
      代价是尾段起点比「按页对齐」时早几十行，多覆盖一点中间代码，不影响审查。
    头段同理：从第 0 行起，30 页 = 1500 行，天然对齐。
    """
    each = total_pages_target // 2
    span = each * LINES_PER_PAGE          # 1500 行

    if len(stream) <= total_pages_target * LINES_PER_PAGE:
        # 不足 60 页：全交。末页不足 50 行时从结尾倒推一整页补满，
        # 前面几页保持从 0 开始的自然对齐。
        pages = [stream[i:i + LINES_PER_PAGE]
                 for i in range(0, len(stream), LINES_PER_PAGE)]
        if len(stream) >= LINES_PER_PAGE and len(pages[-1]) < LINES_PER_PAGE:
            pages[-1] = stream[len(stream) - LINES_PER_PAGE:]
        return pages, False, 0

    head = [stream[i:i + LINES_PER_PAGE] for i in range(0, span, LINES_PER_PAGE)]
    tail_start = len(stream) - span
    tail = [stream[i:i + LINES_PER_PAGE]
            for i in range(tail_start, len(stream), LINES_PER_PAGE)]

    total_pages = len(stream) // LINES_PER_PAGE + (1 if len(stream) % LINES_PER_PAGE else 0)
    skipped = total_pages - each * 2
    return head + tail, True, skipped


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def build_html(pages, truncated, skipped=0):
    """生成用于打印的 HTML。

    版式按软著审查的实操要求来：
      · A4，页边距压到 1.5cm（一页 50 行才装得下）
      · 页眉左侧软件名+版本，右侧页码
      · 正文等宽字体、8pt，行高 1.28 —— 大了会溢出到第二页，
        那是最常见的退件原因
      · 每页强行分页（page-break-after），不让浏览器自己算
    """
    h = []
    h.append('<!DOCTYPE html><html><head><meta charset="utf-8">')
    h.append('<title>%s %s 源程序</title>' % (SOFT_NAME, SOFT_VER))
    h.append('<style>')
    h.append('@page{size:A4;margin:1.5cm 1.4cm 1.2cm 1.4cm;}')
    h.append('*{box-sizing:border-box;-webkit-print-color-adjust:exact}')
    h.append('body{margin:0;font-family:"Consolas","Courier New",monospace;font-size:8pt;line-height:1.28;color:#000}')
    h.append('.pg{page-break-after:always;position:relative;min-height:26.2cm}')
    h.append('.pg:last-child{page-break-after:auto}')
    h.append('.hd{display:flex;justify-content:space-between;font-size:8.5pt;'
             'border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:6px;'
             'font-family:"Microsoft YaHei","PingFang SC",sans-serif}')
    h.append('.hd .l{font-weight:600}')
    h.append('.ln{white-space:pre-wrap;word-break:break-all;margin:0}')
    h.append('.ln i{display:inline-block;width:22px;color:#666;font-style:normal;'
             'text-align:right;padding-right:6px;user-select:none}')
    h.append('.brk{page-break-after:always;text-align:center;padding-top:45%;'
             'font-family:"Microsoft YaHei",sans-serif;font-size:11pt;color:#333;line-height:2}')
    h.append('</style></head><body>')

    total = len(pages) + (1 if truncated else 0)
    for idx, pg in enumerate(pages, 1):
        # 前 30 页之后插一页说明，告诉审查员中间省略了多少页
        if truncated and idx == PAGES_EACH_END + 1:
            h.append('<div class="pg brk">'
                     '<div>（此处省略源程序中间部分，共 %d 页）</div>'
                     '<div style="margin-top:12px">以下为源程序末尾部分</div>'
                     '</div>' % skipped)
        h.append('<div class="pg">')
        h.append('<div class="hd"><span class="l">%s %s 源程序</span><span>第 %d 页 / 共 %d 页</span></div>'
                 % (esc(SOFT_NAME), esc(SOFT_VER), idx, total))
        for ln in pg:
            h.append('<p class="ln">%s</p>' % (esc(ln) if ln.strip() else '&nbsp;'))
        h.append('</div>')
    h.append('</body></html>')
    return '\n'.join(h)


def find_edge():
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
        if os.path.exists(p):
            return p
    return ''


def html_to_pdf(html_path, pdf_path):
    edge = find_edge()
    if not edge:
        return False, '找不到 Edge，无法转 PDF（可用浏览器手动打开 HTML 后打印）'
    prof = tempfile.mkdtemp(prefix='edgepdf_')
    cmd = [edge, '--headless=new', '--disable-gpu', '--no-first-run',
           '--user-data-dir=' + prof,
           '--no-pdf-header-footer',
           '--print-to-pdf=' + pdf_path,
           'file:///' + html_path.replace('\\', '/')]
    try:
        subprocess.run(cmd, capture_output=True, timeout=180)
    except Exception as e:                                   # noqa: BLE001
        return False, 'Edge 打印失败：%s' % e
    return os.path.exists(pdf_path), ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', type=int, default=PAGES_EACH_END,
                    help='头尾各取多少页（默认 30）')
    ap.add_argument('--no-pdf', action='store_true')
    a = ap.parse_args()

    files = collect()
    if not files:
        print('[FAIL] 没有收集到任何源码，检查 INCLUDE 配置')
        return 1

    total_lines = sum(len(l) for _, l in files)
    stream = flatten(files)
    pages, truncated, skipped = to_pages(stream, a.pages * 2)

    outdir = os.path.join(ROOT, 'publish', 'srcreg')
    os.makedirs(outdir, exist_ok=True)

    print('收录源文件：%d 个' % len(files))
    print('源码总行数：%d 行' % total_lines)
    print('成页：%d 页（每页 %d 行）%s'
          % (len(pages), LINES_PER_PAGE,
             '，中间已省略' if truncated else '，不足 %d 页故全部提交' % (a.pages * 2)))
    print('软件名称：%s %s' % (SOFT_NAME, SOFT_VER))

    # 同时出一份纯文本，方便快速核对内容与行数
    txt_path = os.path.join(outdir, 'source.txt')
    with io.open(txt_path, 'w', encoding='utf-8', newline='\n') as f:
        for i, ln in enumerate(stream, 1):
            f.write('%s\n' % ln)
    print('纯文本：%s' % txt_path)

    html = build_html(pages, truncated, skipped)
    html_path = os.path.join(outdir, 'source.html')
    with io.open(html_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('HTML  ：%s' % html_path)

    if a.no_pdf:
        return 0

    pdf_path = os.path.join(outdir, '源程序_%s_%s.pdf' % (SOFT_NAME, SOFT_VER))
    ok, err = html_to_pdf(html_path, pdf_path)
    if ok:
        size = os.path.getsize(pdf_path)
        print('PDF   ：%s（%.1f KB）' % (pdf_path, size / 1024.0))
    else:
        print('[WARN] %s' % err)
        print('       可以手动用浏览器打开上面的 HTML，Ctrl+P 选「另存为 PDF」')
    return 0


if __name__ == '__main__':
    sys.exit(main())
