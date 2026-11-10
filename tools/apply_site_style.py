# -*- coding: utf-8 -*-
"""把 design/sketch/site-style.css 整段写进官网 index.html 的 <style>…</style>。

唯一真源是 CSS 文件；内联样式只是发布产物。禁止手改内联。

    python -X utf8 tools/apply_site_style.py           写 dist/index.html
    python -X utf8 tools/apply_site_style.py --check   只校验是否已同步
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, 'design', 'sketch', 'site-style.css')
HTML = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')


def main():
    css = io.open(CSS, encoding='utf-8').read().strip()
    html = io.open(HTML, encoding='utf-8').read()
    # 真源注释里含有字面量 "<style>…</style>"，不能用非贪婪正则去找闭合标签。
    # 只在 <head> 范围内取第一个 <style> 和最后一个 </style>。
    head_end = html.lower().find('</head>')
    if head_end < 0:
        raise SystemExit('dist/index.html 里找不到 </head>')
    head = html[:head_end]
    a = head.lower().find('<style>')
    b = head.lower().rfind('</style>')
    if a < 0 or b <= a:
        raise SystemExit('dist/index.html 的 <head> 里找不到 <style>…</style>')
    class M: pass
    m = M()
    m.start = lambda i: (a, a+7, b)[i-1] if i else a
    m.end = lambda i: (a+7, b, b+8)[i-1] if i else a+7
    m.group = lambda i: (head[a:a+7], head[a+7:b], head[b:b+8])[i-1] if i else html
    m._a, m._b = a+7, b
    if '--shell:#E8EEF0' not in css:
        raise SystemExit('site-style.css 看起来不是 NOVA 真源，拒绝写入')
    if m.group(2).strip() == css:
        print('ok  已同步，无需改动（%d 字符）' % len(css))
        return 0
    if '--paper:#EFE2C8' in m.group(2):
        print('note 检测到旧版西部涂鸦内联样式，整段替换')
    if '--check' in sys.argv:
        print('FAIL  内联样式与真源不一致（%d vs %d 字符）' % (len(m.group(2).strip()), len(css)))
        return 1
    out = html[:m._a] + '\n' + css + '\n' + html[m._b:]
    io.open(HTML, 'w', encoding='utf-8', newline='\n').write(out)
    print('ok  已写入 %s（%d 字符 CSS）' % (os.path.relpath(HTML, ROOT), len(css)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
