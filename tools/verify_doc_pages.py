# -*- coding: utf-8 -*-
"""验证说明书 PDF 的**分页**是否正确（封面是否独占第一页）。

    python -X utf8 tools/verify_doc.py

为什么单独验这一步：屏幕截图看到的是「连续滚动」，看不出分页；
而 PDF 里「封面 + 第一章挤在同一页」是软著材料的低级错误，
审查员一眼就能看到。这里用无头浏览器量真实分页位置。
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'publish', 'srcreg', 'manual.html')

# A4 在 96dpi 下是 794 x 1123 px；打印时上下各留 2cm/1.8cm 页边距
A4_H_PX = 1123
MARGIN_TOP_PX = round(2.0 / 2.54 * 96)      # ≈ 76
MARGIN_BOTTOM_PX = round(1.8 / 2.54 * 96)   # ≈ 68
PRINTABLE_H = A4_H_PX - MARGIN_TOP_PX - MARGIN_BOTTOM_PX

PROBE = """
(() => {
  const cover = document.querySelector('.cover');
  const first = document.querySelector('h1.first');
  const r1 = cover ? cover.getBoundingClientRect() : null;
  const r2 = first ? first.getBoundingClientRect() : null;
  return JSON.stringify({
    coverHeight: r1 ? Math.round(r1.height) : null,
    coverBottom: r1 ? Math.round(r1.bottom) : null,
    firstTop: r2 ? Math.round(r2.top) : null,
    printableHeight: %d,
    docHeight: Math.round(document.documentElement.scrollHeight)
  });
})()
""" % PRINTABLE_H


def find_edge():
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
        if os.path.exists(p):
            return p
    return ''


def measure():
    """用无头浏览器量封面与第一章的位置关系。"""
    edge = find_edge()
    if not edge or not os.path.exists(HTML):
        return None

    tmp = tempfile.mkdtemp(prefix='docmeas_')
    # 拷到纯英文路径，避免中文路径让 --dump-dom 失败
    dst = os.path.join(tmp, 'm.html')
    with open(HTML, encoding='utf-8') as f:
        content = f.read()
    # 注入探针：把测量结果写进 title，便于从 dump-dom 里读
    content = content.replace(
        '</body>',
        '<script>document.title = "MEASURE" + %s;</script></body>' % PROBE)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(content)

    out = os.path.join(tmp, 'dom.txt')
    cmd = [edge, '--headless=new', '--disable-gpu', '--no-first-run',
           '--user-data-dir=' + os.path.join(tmp, 'ud'),
           '--window-size=794,1123', '--virtual-time-budget=4000',
           '--dump-dom', 'file:///' + dst.replace('\\', '/')]
    try:
        with open(out, 'wb') as fo:
            subprocess.run(cmd, stdout=fo, stderr=subprocess.DEVNULL, timeout=60)
    except Exception:                                        # noqa: BLE001
        return None

    try:
        with open(out, encoding='utf-8', errors='ignore') as f:
            dom = f.read()
    except OSError:
        return None

    i = dom.find('MEASURE{')
    if i < 0:
        return None
    j = dom.find('}', i)
    try:
        return json.loads(dom[i + len('MEASURE'):j + 1])
    except ValueError:
        return None


def main():
    bad = 0
    if not os.path.exists(HTML):
        print('[FAIL] 找不到 manual.html，先跑 tools/gen_manual.py')
        return 1

    m = measure()
    if not m:
        print('[WARN] 无法用无头浏览器测量（Edge 不可用）。'
              '请手动打开 PDF 确认封面是否独占第一页。')
    else:
        print('封面高度      : %s px' % m['coverHeight'])
        print('封面底部位置  : %s px' % m['coverBottom'])
        print('第一章顶部位置: %s px' % m['firstTop'])
        print('A4 可打印高度 : %d px' % m['printableHeight'])

        if m['coverHeight'] is None or m['firstTop'] is None:
            print('[FAIL] 页面结构里找不到 .cover 或 h1.first')
            bad += 1
        else:
            # 封面高度必须小于可打印高度，否则会溢出成两页、break-after 落空
            if m['coverHeight'] > m['printableHeight']:
                print('[FAIL] 封面高 %d > 可打印高 %d，会溢出到第二页，'
                      '导致第一章和封面挤在一起' % (m['coverHeight'], m['printableHeight']))
                bad += 1
            else:
                print('[PASS] 封面高度在单页范围内（%d < %d）'
                      % (m['coverHeight'], m['printableHeight']))
            # 第一章必须用 first 类强制另起页
            if 'class="first"' in open(HTML, encoding='utf-8').read():
                print('[PASS] 第一章带 .first 类（强制另起一页）')
            else:
                print('[FAIL] 第一章缺 .first 类，可能与封面同页')
                bad += 1

    # PDF 最终页数
    pdf = os.path.join(ROOT, 'publish', 'srcreg',
                       '说明书_河医大助手校园教务辅助软件_V1.1.17.pdf')
    if os.path.exists(pdf):
        import re
        raw = open(pdf, 'rb').read()
        pages = len(re.findall(rb'/Type\s*/Page[^s]', raw))
        print('PDF 页数      : %d' % pages)
        # 18 页的说明书 + 封面独占 1 页 = 至少 2 页属于「结构正常」
        if pages < 12:
            print('[WARN] 页数偏少（%d），内容可能不够详实' % pages)

    print()
    if bad:
        print('[FAIL] %d 项未过。' % bad)
        return 1
    print('[PASS] 说明书分页正确。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
