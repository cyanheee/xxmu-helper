# -*- coding: utf-8 -*-
"""减黑：描边、投影、大字都从「近黑墨」改成「柔棕线」。

用户：还是有点黑了，不要那么多黑。
思路：黑色来自三处 —— ①2px 近黑描边 ②2px 硬投影 ③大字用了近黑。
改法：
  · --edge 从 var(--ink) 换成柔棕 #8C7A5E（浅色）/ #7A6E5C（深色）
  · 描边统一 2px → 1.5px，虚线同理
  · 硬投影从「实心墨」改成「半透明棕」rgba(140,122,94,.45)
  · 大字（标题/数字）保留深棕，但把 --ink 本身提亮一档，别到近黑
用法：python -X utf8 design/sketch/soften.py
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP = os.path.join(ROOT, 'web', 'app.css')
SITE_CSS = os.path.join(ROOT, 'design', 'sketch', 'site-western.css')
SITE_HTML = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')

# ---------- 1. 令牌 ----------
APP_TOKENS = [
    # 浅色：墨提亮一档；edge 换成柔棕
    ('  --ink:#2B2318;\n  --ink2:#5A4B36;\n  --pencil:#8E7E64;',
     '  --ink:#3B3225;\n  --ink2:#6A5842;\n  --pencil:#9C8B70;'),
    ('  --shadow:2px 2px 0 var(--ink);\n  --shadow-lift:3px 3px 0 var(--ink);',
     '  --shadow:2px 2px 0 rgba(140,122,94,.45);\n  --shadow-lift:3px 3px 0 rgba(140,122,94,.55);'),
    ('  --edge:var(--ink);', '  --edge:#A89070;'),
    ('  --shadow-modal:0 0 0 2px var(--ink);\n  --shadow-modal-lg:0 0 0 2px var(--ink);',
     '  --shadow-modal:0 0 0 1.5px var(--edge);\n  --shadow-modal-lg:0 0 0 1.5px var(--edge);'),
    # 深色
    ('  --ink:#F3E9D6;\n  --ink2:#C8B79C;\n  --pencil:#8F8069;',
     '  --edge:#6E6152;\n  --ink:#F3E9D6;\n  --ink2:#C8B79C;\n  --pencil:#8F8069;'),
    ('  --shadow:2px 2px 0 #120E0A;\n  --shadow-lift:3px 3px 0 #120E0A;',
     '  --shadow:2px 2px 0 rgba(0,0,0,.42);\n  --shadow-lift:3px 3px 0 rgba(0,0,0,.52);'),
    ('  --shadow-modal:0 0 0 2px #120E0A;\n  --shadow-modal-lg:0 0 0 2px #120E0A;',
     '  --shadow-modal:0 0 0 1.5px var(--edge);\n  --shadow-modal-lg:0 0 0 1.5px var(--edge);'),
]

# 深色档原本没有 --edge 行（写在末尾），要确认不重复
DARK_EDGE_FIX = [
    ('  --edge:#8A7A66;\n  --oncolor:#17120E;', '  --oncolor:#17120E;'),
    ('  --edge:#6E6152;\n  --ink:#F3E9D6;', '  --edge:#6E6152;\n  --ink:#F3E9D6;'),
]


def lighten_app():
    s = io.open(APP, encoding='utf-8').read()
    miss = []
    for old, new in APP_TOKENS:
        if old in s:
            s = s.replace(old, new, 1)
        else:
            miss.append(old.strip().splitlines()[0][:48])
    # 描边 2px → 1.5px（只动覆盖层里带 --edge 的）
    s = s.replace('border:2px solid var(--edge)', 'border:1.5px solid var(--edge)')
    s = s.replace('border:2px dashed var(--edge)', 'border:1.5px dashed var(--edge)')
    s = s.replace('border-bottom:2px solid var(--edge)', 'border-bottom:1.5px solid var(--edge)')
    s = s.replace('border-top:2px solid var(--edge)', 'border-top:1.5px solid var(--edge)')
    s = s.replace('border:2px dashed var(--ink)', 'border:1.5px dashed var(--edge)')
    s = s.replace('border:2px solid var(--ink)', 'border:1.5px solid var(--edge)')
    # 针脚线 2px dashed var(--line) 保留（那是浅棕，不黑）
    # 硬投影统一走半透明
    s = s.replace('box-shadow:2px 2px 0 var(--edge)', 'box-shadow:2px 2px 0 rgba(140,122,94,.40)')
    s = s.replace('box-shadow:3px 3px 0 var(--edge)', 'box-shadow:3px 3px 0 rgba(140,122,94,.50)')
    s = s.replace('box-shadow:1.5px 1.5px 0 var(--edge)', 'box-shadow:1.5px 1.5px 0 rgba(140,122,94,.38)')
    s = s.replace('box-shadow:2px 2px 0 var(--blue)', 'box-shadow:2px 2px 0 rgba(44,92,122,.45)')
    s = s.replace('box-shadow:2px 2px 0 var(--mist)', 'box-shadow:2px 2px 0 rgba(142,123,196,.50)')
    s = s.replace('box-shadow:0 -3px 0 var(--edge)', 'box-shadow:0 -3px 0 rgba(140,122,94,.45)')
    # 深色档单独把投影压回黑（半透明）
    s = s.replace('html[data-theme="dark"] .btn{box-shadow:2px 2px 0 #120E0A}',
                  'html[data-theme="dark"] .btn{box-shadow:2px 2px 0 rgba(0,0,0,.45)}')
    io.open(APP, 'w', encoding='utf-8', newline='\n').write(s)
    print('app.css  令牌 %d/%d  未命中：%s' % (len(APP_TOKENS) - len(miss), len(APP_TOKENS),
                                            '、'.join(miss) if miss else '无'))


SITE_TOKENS = [
    ('  --ink:#2B2318;\n  --ink-soft:#5A4B36;\n  --pencil:#8E7E64;',
     '  --ink:#3B3225;\n  --ink-soft:#6A5842;\n  --pencil:#9C8B70;'),
    ('  --shadow:2px 2px 0 var(--ink);\n  --shadow-lift:3px 3px 0 var(--ink);',
     '  --shadow:2px 2px 0 rgba(140,122,94,.45);\n  --shadow-lift:3px 3px 0 rgba(140,122,94,.55);'),
    ('  --stroke:2px;', '  --stroke:1.5px;\n  --edge:#A89070;'),
]


def lighten_site():
    s = io.open(SITE_CSS, encoding='utf-8').read()
    miss = []
    for old, new in SITE_TOKENS:
        if old in s:
            s = s.replace(old, new, 1)
        else:
            miss.append(old.strip().splitlines()[0][:48])
    s = s.replace('border:2px solid var(--ink)', 'border:1.5px solid var(--edge)')
    s = s.replace('border:2px dashed var(--ink)', 'border:1.5px dashed var(--edge)')
    s = s.replace('border-top:2px solid var(--ink)', 'border-top:1.5px solid var(--edge)')
    s = s.replace('box-shadow:2px 2px 0 var(--ink)', 'box-shadow:2px 2px 0 rgba(140,122,94,.40)')
    s = s.replace('box-shadow:3px 3px 0 var(--ink)', 'box-shadow:3px 3px 0 rgba(140,122,94,.50)')
    s = s.replace('box-shadow:4px 4px 0 var(--ink)', 'box-shadow:4px 4px 0 rgba(140,122,94,.55)')
    s = s.replace('box-shadow:1.5px 1.5px 0 var(--ink)', 'box-shadow:1.5px 1.5px 0 rgba(140,122,94,.38)')
    s = s.replace("box-shadow:3px 3px 0 rgba(43,35,24,.28)", 'box-shadow:3px 3px 0 rgba(140,122,94,.45)')
    io.open(SITE_CSS, 'w', encoding='utf-8', newline='\n').write(s)
    print('site.css 令牌 %d/%d  未命中：%s' % (len(SITE_TOKENS) - len(miss), len(SITE_TOKENS),
                                           '、'.join(miss) if miss else '无'))

    css = io.open(SITE_CSS, encoding='utf-8').read()
    html = io.open(SITE_HTML, encoding='utf-8').read()
    st = html.index('<style>')
    en = html.index('</style>')
    html = html[:st] + '<style>\n' + css + '</style>' + html[en + len('</style>'):]
    io.open(SITE_HTML, 'w', encoding='utf-8', newline='\n').write(html)
    print('官网 <style> 已同步')


if __name__ == '__main__':
    lighten_app()
    lighten_site()
