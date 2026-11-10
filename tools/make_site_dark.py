# -*- coding: utf-8 -*-
"""把官网页面复制成「深色预览版」，用于出深色长图核对。

做法：把内联样式里 @media (prefers-color-scheme:dark){…} 的内容抽出来，
      变成无条件规则追加到样式块末尾——headless Edge 没有稳定的
      prefers-color-scheme 模拟开关，这个办法比 --force-dark-mode 可控
      （--force-dark-mode 会额外套一层浏览器自动深色，和我们的色板打架）。

只生成预览副本，绝不写回 dist/index.html。

    python -X utf8 tools/make_site_dark.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')
OUT = os.path.join(ROOT, 'design', 'sketch', 'site-dark-preview.html')

MARK = '@media (prefers-color-scheme:dark)'


def extract_media_body(css):
    """返回 media 块内的 CSS 文本；找不到就返回 ''。"""
    i = css.find(MARK)
    if i < 0:
        return ''
    j = css.find('{', i)
    if j < 0:
        return ''
    depth = 0
    for k in range(j, len(css)):
        if css[k] == '{':
            depth += 1
        elif css[k] == '}':
            depth -= 1
            if depth == 0:
                return css[j + 1:k]
    return ''


def main():
    html = io.open(HTML, encoding='utf-8').read()
    head_end = html.lower().find('</head>')
    head = html[:head_end]
    a = head.lower().find('<style>')
    b = head.lower().rfind('</style>')
    if a < 0 or b <= a:
        raise SystemExit('找不到内联 <style>…</style>')
    css = head[a + 7:b]
    body = extract_media_body(css)
    if not body.strip():
        raise SystemExit('真源里没有 %s 段' % MARK)

    # 整段掏出媒体查询，避免同规则重复声明（body 含嵌套括号，必须按原文精确匹配）
    i = css.find(MARK)
    css_nodark = css[:i] + css[i:].replace(MARK + '{' + body + '}', '', 1)

    merged = css_nodark + '\n/* ---- deep preview: media 段已提为无条件 ---- */\n' + body + '\n'

    out = html[:a] + '<style>' + merged + '</style>' + html[b + 8:]
    out = out.replace('<meta name="theme-color" content="#E8EEF0">',
                      '<meta name="theme-color" content="#1A1430">')
    # 预览副本放在 design/sketch/，官网里的相对路径 img/shot-*.svg 指不到，
    # 重写成相对 dist 的路径，否则深色长图里示意图全是黑框 + alt 文字。
    out = out.replace('src="img/', 'src="../../server/pages/dist/img/')
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
    print('ok  已生成 %s（深色规则 %d 字符）' % (os.path.relpath(OUT, ROOT), len(body)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
