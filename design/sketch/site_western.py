# -*- coding: utf-8 -*-
"""把官网 server/pages/dist/index.html 的内联 <style> 换成西部涂鸦版。

坑：绝不能用 PowerShell 的 [IO.File]::ReadAllText 配相对路径 —— 相对路径按
当前进程目录解析（不是 -WorkingDirectory），读失败返回 null，后面的
WriteAllText 就把文件写成 0 字节。这里统一用 python + 绝对路径。

用法：python -X utf8 design/sketch/site_western.py
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')
CSS = os.path.join(ROOT, 'design', 'sketch', 'site-western.css')

OLD_META = '<meta name="theme-color" content="#2563eb">'
OLD_META2 = '<meta name="theme-color" content="#f4f0e5">'
NEW_META = '<meta name="theme-color" content="#EFE2C8">'


def main():
    site = io.open(SITE, encoding='utf-8').read()
    css = io.open(CSS, encoding='utf-8').read()

    st = site.index('<style>')
    en = site.index('</style>')
    if st < 0 or en < st:
        raise SystemExit('找不到 <style> 块')

    out = site[:st] + '<style>\n' + css + '</style>' + site[en + len('</style>'):]

    if OLD_META in out:
        out = out.replace(OLD_META, NEW_META, 1)
    elif OLD_META2 in out:
        out = out.replace(OLD_META2, NEW_META, 1)
    else:
        raise SystemExit('找不到 theme-color meta，先确认页面结构')

    io.open(SITE, 'w', encoding='utf-8', newline='\n').write(out)
    print('ok  index.html  %d 字节（原 %d）' % (len(out.encode('utf-8')), len(site.encode('utf-8'))))


if __name__ == '__main__':
    main()
