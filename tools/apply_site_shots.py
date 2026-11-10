# -*- coding: utf-8 -*-
"""把官网首页里三段内联的旧版手机示意 SVG 换成 NOVA 示意图引用。

v1.1.54 为了省跨洋请求，把三张 shot-*.svg 整段内联进 index.html；
v1.1.56 用 gen_site_shots_nova.py 重生了 img/shot-*.svg，但内联副本没动，
于是首页还是牛皮纸涂鸦。这里按 <div class="phone"> 逐段替换成
<img src="/img/shot-*.svg">，保留 aria-label 文案。

    python -X utf8 tools/apply_site_shots.py           写 dist/index.html
    python -X utf8 tools/apply_site_shots.py --check   只校验
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')
SHOTS = [
    ('shot-kb.svg', '课表页：切角舷窗、七列舱格、周次传送带'),
    ('shot-learn.svg', '学习页：磁带门、作业与考试 A/B 面'),
    ('shot-water.svg', '校园页：热水票、校园剪报、照片墙'),
]


def main():
    s = io.open(HTML, encoding='utf-8').read()
    # 三段 .phone 各自是一整行（v1.1.54 内联时没换行），逐行匹配整行替换。
    lines = s.split('\n')
    hits, out = 0, []
    for line in lines:
        if '<div class="phone">' in line and '<svg class="shot"' in line:
            name, alt = SHOTS[hits] if hits < len(SHOTS) else SHOTS[-1]
            indent = line[:len(line) - len(line.lstrip())]
            out.append(indent + '<div class="phone"><img class="shot" src="img/' + name +
                       '" width="390" height="780" alt="' + alt + '" loading="eager"></div>')
            hits += 1
        else:
            out.append(line)
    new = '\n'.join(out)
    if hits == 0 and 'src="img/shot-kb.svg"' in s:
        print('ok  already NOVA (%d img refs)' % s.count('src="img/shot-'))
        return 0
    if hits != 3:
        print('WARN matched %d inline .phone blocks (expected 0 or 3)' % hits)
        if '--check' in sys.argv:
            return 1
    # 旧一轮可能已经替换过，只是 src 还带 /img/ 根路径（file:// 打开会 404）；
    # 统一改成相对路径，本地渲染和线上部署都能取到。
    new = new.replace('src="/img/shot-', 'src="img/shot-')
    if '--check' in sys.argv:
        print('FAIL  still has %d inline legacy svg' % hits)
        return 1
    io.open(HTML, 'w', encoding='utf-8', newline='\n').write(new)
    print('ok  replaced %d inline legacy svg -> NOVA img refs' % hits)
    return 0


if __name__ == '__main__':
    sys.exit(main())
