# -*- coding: utf-8 -*-
"""校验软著源程序 PDF 的页数与每页行数是否符合审查要求。

    python -X utf8 tools/verify_copyright.py

为什么单独校验：软著退回最常见的原因就是「每页不足 50 行 / 页数不对 /
页眉没写软件名」。这些用眼睛翻 60 页看不出来，但用代码量一遍就一目了然。
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'publish', 'srcreg')
HTML = os.path.join(DIR, 'source.html')
PDF = os.path.join(DIR, '源程序_河医大助手校园教务辅助软件_V1.1.17.pdf')


def main():
    bad = 0

    if not os.path.exists(HTML):
        print('[FAIL] 找不到 %s，先跑 tools/gen_copyright.py' % HTML)
        return 1

    h = io.open(HTML, encoding='utf-8').read()

    # 按 <div class="pg"> 切块，数每块里的行数
    blocks = re.split(r'<div class="pg[^"]*">', h)[1:]
    counts = [b.count('class="ln"') for b in blocks]
    body_pages = [c for c in counts if c > 0]
    brk_pages = [c for c in counts if c == 0]

    print('总块数        : %d（含 1 页省略说明）' % len(counts))
    print('正文页        : %d' % len(body_pages))
    print('说明页        : %d' % len(brk_pages))
    print('每页行数分布  : %s' % sorted(set(body_pages)))

    if len(body_pages) != 60:
        print('[FAIL] 正文不是 60 页（实际 %d）。软著要求前 30 + 后 30。' % len(body_pages))
        bad += 1
    else:
        print('[PASS] 正文 60 页')

    wrong = [c for c in body_pages if c != 50]
    if wrong:
        # 末页行数不足是**软著退件的常见原因**：审查口径是「每页 50 行」，
        # 最后一页只剩几行会被认为排版不合规。正确做法是往回补满
        # （从后 30 页的起点往前多取几行），而不是留白。
        print('[FAIL] 有 %d 页不是 50 行：%s' % (len(wrong), wrong[:10]))
        print('       末页行数不足会退件。修法：把尾段页的起点往前挪，让最后一页补满 50 行。')
        bad += 1
    else:
        print('[PASS] 每页都是 50 行')

    # 页眉必须带软件名与版本
    heads = re.findall(r'<span class="l">([^<]+)</span>', h)
    want = '河医大助手校园教务辅助软件 V1.1.17 源程序'
    if heads and all(x == want for x in heads):
        print('[PASS] 页眉统一：%s' % want)
    else:
        print('[FAIL] 页眉不一致或缺失，样本：%s' % (heads[:2] if heads else '无'))
        bad += 1

    # 页码必须连续
    nums = [(int(a), int(b)) for a, b in re.findall(r'第 (\d+) 页 / 共 (\d+) 页', h)]
    if nums:
        seq = [n for n, _ in nums]
        tot = nums[0][1]
        if seq == list(range(1, len(seq) + 1)):
            print('[PASS] 页码连续 1..%d，声明总页数 %d' % (len(seq), tot))
        else:
            print('[FAIL] 页码不连续：%s' % seq[:12])
            bad += 1

    # PDF 实际页数（用 Edge 无头打印的产物，页数应等于块数）
    if os.path.exists(PDF):
        size = os.path.getsize(PDF)
        print('PDF 体积      : %.1f KB' % (size / 1024.0))
        # 数 PDF 里的 /Type /Page（不含 /Pages）
        with open(PDF, 'rb') as f:
            raw = f.read()
        n = len(re.findall(rb'/Type\s*/Page[^s]', raw))
        print('PDF 页数      : %d' % n)
        if n != len(counts):
            print('[WARN] PDF 页数(%d) 与 HTML 块数(%d) 不一致，'
                  '可能是某页内容溢出到第二页 —— 务必打开 PDF 抽查末尾几页。'
                  % (n, len(counts)))
            bad += 1
        else:
            print('[PASS] PDF 页数与预期一致')
    else:
        print('[WARN] 没找到 PDF，只校验了 HTML')

    print()
    if bad:
        print('[FAIL] %d 项未过，先修再提交软著。' % bad)
        return 1
    print('[PASS] 源程序文档符合软著提交要求。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
