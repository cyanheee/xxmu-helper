# -*- coding: utf-8 -*-
"""官网瘦身：把 3 张示意图压到极致，并内联进首页，砍掉 4 次往返。

现状（都实测过）：
  · 首页 30.8KB / brotli 后 11.4KB，TTFB 0.76~0.85s（LAX/SEA 节点，跨太平洋）
  · 4 张 SVG 合计 31.6KB，每张一次独立请求，串行 4 张要 4.9 秒
  · 连接复用后仍然慢：water 那次 TTFB 9.3s（跨洋抖动）
  → 结论：少一个请求就是少一次跨洋握手的风险，把 3 张示意图内联最划算。

压缩手法（不改视觉效果）：
  1) brand/hero 两个 linearGradient 的 3 个 stop 颜色完全相同 → 换成纯色 fill，删渐变定义
  2) 77 个空课程格 rect 定位规则（7 列 × 11 行）→ 换成 <pattern> 一次画完
  3) 删除无用 defs（shot-kb 里 #hero 与 #sh 根本没被引用）
  4) 去掉 xmlns（内联 SVG 不需要）、压缩小数、去掉多余空格

用法：python -X utf8 design/sketch/slim_site.py
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(ROOT, 'server', 'pages', 'dist', 'img')
SITE = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')


def collapse_gradient(svg, gid):
    """3 个 stop 同色 → 纯色，并删掉该渐变定义；返回 (新 svg, 颜色)。"""
    m = re.search(r'<linearGradient id="%s".*?</linearGradient>' % gid, svg, re.S)
    if not m:
        return svg, None
    stops = re.findall(r'stop-color="([^"]+)"', m.group(0))
    if len(set(stops)) != 1:
        return svg, None
    color = stops[0]
    svg = svg.replace(m.group(0), '')
    svg = svg.replace('url(#%s)' % gid, color)
    return svg, color


def collapse_grid(svg):
    """把规则排列的空课程格换成 pattern。"""
    cell_re = re.compile(
        r'<rect x="([\d.]+)" y="([\d.]+)" width="50\.1" height="45" rx="6" '
        r'fill="#FAF3E2" stroke="#D3C0A0" stroke-width="0\.6"/>')
    cells = cell_re.findall(svg)
    if len(cells) < 20:
        return svg, 0
    xs = sorted({float(c[0]) for c in cells})
    ys = sorted({float(c[1]) for c in cells})
    if len(xs) < 2 or len(ys) < 2:
        return svg, 0
    # 间距必须一致才敢用 pattern
    dx = xs[1] - xs[0]
    dy = ys[1] - ys[0]
    for i in range(1, len(xs)):
        if abs((xs[i] - xs[i - 1]) - dx) > 0.2:
            return svg, 0
    for i in range(1, len(ys)):
        if abs((ys[i] - ys[i - 1]) - dy) > 0.2:
            return svg, 0
    w = dx * len(xs) - (dx - 50.1)
    h = dy * len(ys) - (dy - 45)
    pat = ('<pattern id="g" x="%g" y="%g" width="%g" height="%g" patternUnits="userSpaceOnUse">'
           '<rect x="0" y="0" width="50.1" height="45" rx="6" fill="#FAF3E2" '
           'stroke="#D3C0A0" stroke-width="0.6"/></pattern>'
           % (xs[0], ys[0], dx, dy))
    svg = cell_re.sub('', svg)
    svg = svg.replace('</defs>', pat + '</defs>', 1)
    if '<defs>' not in svg:
        svg = svg.replace('<svg ', '<svg ', 1)
    # 在 </defs> 之后立刻铺一层 pattern 矩形（缩进到格子区域）
    svg = svg.replace('</defs>', '</defs><rect x="%g" y="%g" width="%g" height="%g" fill="url(#g)"/>'
                      % (xs[0], ys[0], w, h), 1)
    return svg, len(cells)


def strip_unused(svg, keeps):
    """删掉没被引用的 <filter>/<linearGradient>。keeps = 需要保留的 id 列表。"""
    for fid in ('brand', 'hero', 'sh'):
        if fid in keeps:
            continue
        svg = re.sub(r'<linearGradient id="%s".*?</linearGradient>' % fid, '', svg, flags=re.S)
        svg = re.sub(r'<filter id="%s".*?</filter>' % fid, '', svg, flags=re.S)
    return svg


def tidy(svg):
    svg = svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')
    svg = re.sub(r'>\s+<', '><', svg)
    svg = svg.replace('  ', ' ')
    return svg.strip()


def slim_one(name):
    p = os.path.join(IMG, name)
    s = io.open(p, encoding='utf-8').read()
    before = len(s.encode('utf-8'))

    keeps = []
    for gid in ('brand', 'hero'):
        if ('url(#%s)' % gid) in s:
            s2, color = collapse_gradient(s, gid)
            if color:
                s = s2
            else:
                keeps.append(gid)
    if 'filter="url(#sh)"' in s:
        keeps.append('sh')
    s = strip_unused(s, keeps)
    s, ncell = collapse_grid(s)
    s = tidy(s)

    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    after = len(s.encode('utf-8'))
    print('  %-16s %6d -> %5d 字节 (%+d%%)  收掉空格子 %d 个'
          % (name, before, after, round((after - before) * 100.0 / before), ncell))
    return s


def main():
    print('压缩 SVG：')
    bodies = {}
    for n in ('shot-kb.svg', 'shot-learn.svg', 'shot-water.svg', 'logo.svg'):
        bodies[n] = slim_one(n)

    # ---- 内联 3 张示意图 ----
    html = io.open(SITE, encoding='utf-8').read()
    total_inline = 0
    for i, key in enumerate(('shot-kb.svg', 'shot-learn.svg', 'shot-water.svg')):
        src = '/img/' + key
        m = re.search(r'<img src="%s"[^>]*>' % re.escape(src), html)
        if not m:
            print('  !! 没找到 <img src="%s">' % src)
            continue
        alt = re.search(r'alt="([^"]*)"', m.group(0))
        svg = bodies[key]
        # 每个内联 SVG 的 id 要加前缀，避免三份 defs 撞名
        pre = 'p%d' % i
        svg = re.sub(r'id="([^"]+)"', lambda mm: 'id="%s_%s"' % (pre, mm.group(1)), svg)
        svg = re.sub(r'url\(#([^)]+)\)', lambda mm: 'url(#%s_%s)' % (pre, mm.group(1)), svg)
        svg = svg.replace('<svg ', '<svg class="shot" role="img" aria-label="%s" ' % (alt.group(1) if alt else ''))
        html = html.replace(m.group(0), svg)
        total_inline += len(svg.encode('utf-8'))
        print('  内联 %s  %d 字节' % (key, len(svg.encode('utf-8'))))

    io.open(SITE, 'w', encoding='utf-8', newline='\n').write(html)
    print('内联合计 %d 字节，index.html 现为 %d 字节'
          % (total_inline, len(html.encode('utf-8'))))


if __name__ == '__main__':
    main()
