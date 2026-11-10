# -*- coding: utf-8 -*-
"""把官网三张手机示意图重生成为 NOVA 舷窗语言（纯 SVG，无外部依赖）。

真源 = 本脚本；产物 = server/pages/dist/img/shot-{kb,learn,water}.svg。
旧版是牛皮纸 + 墨线 + 纸卡片；NOVA 是切角玻璃 + 段码 + 磁带 / 票券 / 剪报。
"""
import io, os


def xesc(s):
    """XML 文本转义：SVG 是 XML，未转义的 & < > 会让整个文件解析失败。"""
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'server', 'pages', 'dist', 'img')

SHELL = '#E8EEF0'
GLASS = '#122A38'
GLASS2 = '#1B3B49'
DEEP = '#0C1E29'
CYAN = '#35E0D0'
CORAL = '#FF5C7A'
VIOLET = '#7C5CFF'
COIN = '#FFD23F'
GRASS = '#2BD47D'
BRASS = '#C9A24B'
ON = '#F5FAFF'
ON2 = '#A9C6D2'
TAPE = '#F2E9DA'
TAPE2 = '#DCCDB4'
MONO = 'ui-monospace,Menlo,Consolas,monospace'
# SVG 是 XML：font-family 属性值里的双引号必须转义，否则整个文件解析失败
# （v1.1.56 首次生成时就是这个坑：font-family="system-ui,"Microsoft YaHei",sans-serif"
#  直接把标签截断，浏览器渲染出一张空白图 + 红色错误框）。
SANS = 'system-ui,Microsoft YaHei,sans-serif'


def frame(inner, title, sub, badge):
    return f'''<svg width="390" height="780" viewBox="0 0 390 780" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  <clipPath id="hull"><rect x="0" y="0" width="390" height="780" rx="18"/></clipPath>
  <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{SHELL}"/><stop offset="1" stop-color="#D8E6EA"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{GLASS}"/><stop offset="1" stop-color="{DEEP}"/>
  </linearGradient>
  <radialGradient id="sun" cx="50%" cy="110%" r="70%">
    <stop offset="0" stop-color="#FF6B3D" stop-opacity=".42"/>
    <stop offset="1" stop-color="#FF6B3D" stop-opacity="0"/>
  </radialGradient>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
    <rect width="4" height="1" fill="{ON}" opacity=".035"/>
  </pattern>
</defs>
<g clip-path="url(#hull)">
  <rect width="390" height="780" fill="url(#wash)"/>
  <rect width="390" height="36" fill="{DEEP}"/>
  <text x="16" y="23" font-family="{MONO}" font-size="9" fill="{CYAN}" letter-spacing="1.6">XXMU · NOVA OS</text>
  <text x="286" y="23" font-family="{MONO}" font-size="9" fill="{CORAL}">W11 / 21</text>
  <circle cx="370" cy="18" r="3" fill="{GRASS}"/>
  <text x="16" y="31" font-family="{MONO}" font-size="7" fill="{ON2}">LOCAL · NO CLOUD PASSWORD</text>

  <!-- week conveyor -->
  <rect x="12" y="46" width="366" height="58" rx="8" fill="#16242D" stroke="{BRASS}" stroke-opacity=".5"/>
  <circle cx="16" cy="75" r="16" fill="#7A5A26" stroke="{BRASS}" stroke-width="2"/>
  <circle cx="374" cy="75" r="16" fill="#7A5A26" stroke="{BRASS}" stroke-width="2"/>
  <text x="22" y="59" font-family="{MONO}" font-size="8" fill="{BRASS}" letter-spacing="1.4">WEEK CONVEYOR</text>
  {''.join(f'<rect x="{x}" y="64" width="30" height="24" rx="2" fill="{c}" stroke="{s}" stroke-opacity=".5"/><text x="{x+15}" y="80" text-anchor="middle" font-family="{MONO}" font-size="9" fill="{t}">{n:02d}</text>' for x, n, c, s, t in [(86,9,'#1B3038','#C9A24B',ON2),(120,10,'#1B3038','#C9A24B',ON2),(154,11,CYAN,'#BFFFF6','#062029'),(188,12,'#1B3038','#C9A24B',ON2),(222,13,'#1B3038','#C9A24B',ON2)])}
  <path d="M195 46 L195 60" stroke="{CORAL}" stroke-width="2"/>
  <path d="M190 46 L200 46 L195 53 Z" fill="{CORAL}"/>

  <text x="14" y="128" font-family="{SANS}" font-size="19" font-weight="800" fill="#101828">{xesc(title)}</text>
  <text x="376" y="128" text-anchor="end" font-family="{MONO}" font-size="9" fill="#4A5A6A" letter-spacing="1">{xesc(sub)}</text>
  <rect x="14" y="136" width="362" height="2" fill="{CORAL}" opacity=".65"/>
  {inner}

  <!-- band dial -->
  <rect x="10" y="708" width="370" height="62" rx="11" fill="#16232B" stroke="{BRASS}" stroke-width="1.5"/>
  <rect x="22" y="714" width="346" height="4" fill="url(#scan)" opacity=".5"/>
  <circle cx="45" cy="716" r="5" fill="{CYAN}"/>
  {''.join(f'<text x="{x}" y="746" text-anchor="middle" font-family="{SANS}" font-size="10" fill="{c}">{xesc(label)}</text>' for x, label, c in [(45,'课表',CYAN),(120,'学习',ON2),(195,'校园',ON2),(270,'资料',ON2),(345,'我的',ON2)])}
  <text x="22" y="764" font-family="{MONO}" font-size="8" fill="{CYAN}" letter-spacing="1.2">{xesc(badge)}</text>
  <text x="368" y="764" text-anchor="end" font-family="{MONO}" font-size="8" fill="{ON2}">XXMU / NOVA</text>
</g>
</svg>'''


def kb_inner():
    cells = []
    courses = [('解剖','08:00',0,0),('生理','10:05',1,0),('生化','14:30',2,0),
               ('英语','08:00',4,0),('组胚','08:00',1,1),('病理','10:05',2,1),
               ('体育','08:00',0,2),('诊断','10:05',2,2),('免疫','14:30',4,2),
               ('生理','08:00',1,3),('解剖','10:05',3,3)]
    x0, y0, cw, ch = 16, 194, 51, 62
    # HUD glass + chamfer
    cells.append(f'<path d="M26 156 H364 L376 168 V486 L364 498 H26 L14 486 V168 Z" fill="url(#glass)" stroke="{CYAN}" stroke-opacity=".55" stroke-width="1.5"/>')
    cells.append(f'<path d="M26 156 H364 L376 168 V486 L364 498 H26 L14 486 V168 Z" fill="url(#sun)"/>')
    cells.append(f'<path d="M26 156 H364 L376 168 V486 L364 498 H26 L14 486 V168 Z" fill="url(#scan)"/>')
    for i, d in enumerate(['一','二','三','四','五','六','日']):
        cells.append(f'<text x="{27+i*51}" y="180" text-anchor="middle" font-family="{MONO}" font-size="9" fill="{COIN if i==1 else ON2}">{d}</text>')
    for r in range(5):
        for c in range(7):
            cells.append(f'<rect x="{x0+c*51}" y="{y0+r*62}" width="47" height="58" fill="{GLASS2}" fill-opacity=".72" stroke="{ON2}" stroke-opacity=".22" stroke-width="2"/>')
    for name, t, c, r in courses:
        x, y = x0+c*51, y0+r*62
        gold = (c == 1)
        cells.append(f'<rect x="{x}" y="{y}" width="47" height="58" fill="{"rgba(255,210,63,.14)" if gold else "rgba(27,59,73,.85)"}" stroke="{COIN if gold else CYAN}" stroke-opacity="{.9 if gold else .45}" stroke-width="2"/>')
        cells.append(f'<rect x="{x+2}" y="{y+2}" width="5" height="5" fill="{VIOLET}"/>')
        cells.append(f'<text x="{x+24}" y="{y+24}" text-anchor="middle" font-family="{SANS}" font-size="9" font-weight="600" fill="{ON}">{xesc(name)}</text>')
        cells.append(f'<text x="{x+24}" y="{y+39}" text-anchor="middle" font-family="{MONO}" font-size="7" fill="{ON2}">{xesc(t)}</text>')
    cells.append(f'<text x="20" y="520" font-family="{MONO}" font-size="8" fill="#4A5A6A">上下课时间 · 21 周可切 · 点格放大</text>')
    cells.append(f'<rect x="14" y="540" width="362" height="8" fill="{SHELL}" stroke="{CYAN}" stroke-opacity=".4"/>')
    cells.append(f'<rect x="14" y="540" width="224" height="8" fill="{CYAN}" opacity=".8"/>')
    return ''.join(cells)


def learn_inner():
    """学习页：画成「磁带门打开」的样子 —— 背景压暗，作业卷宗从触点放大铺满。"""
    s = []
    # 背景：学习页原貌压暗（门打开时看得到底下的界面）
    s.append(f'<rect x="0" y="0" width="390" height="780" fill="#0C1E29" opacity=".92"/>')
    s.append(f'<rect x="14" y="150" width="362" height="46" rx="7" fill="#16242D" stroke="{CYAN}" stroke-opacity=".3"/>')
    s.append(f'<text x="30" y="180" font-family="{MONO}" font-size="11" fill="{ON2}">作业与考试</text>')
    for i in range(3):
        y = 220 + i*70
        s.append(f'<rect x="14" y="{y}" width="362" height="58" rx="6" fill="#132430" opacity=".8"/>')
        s.append(f'<text x="30" y="{y+34}" font-family="{SANS}" font-size="12" fill="#5C7480">待交与考试</text>')
    # 门内：放大的作业卷宗（暖色磁带壳）
    s.append(f'<rect x="30" y="250" width="330" height="420" rx="12" fill="{TAPE}" stroke="#8A6A2C" stroke-opacity=".4"/>')
    s.append(f'<text x="48" y="282" font-family="{MONO}" font-size="9" fill="#7A5423" letter-spacing="2.2">MIXTAPE 01 · XXMU</text>')
    s.append(f'<rect x="46" y="298" width="150" height="34" rx="3" fill="{CORAL}"/>')
    s.append(f'<text x="121" y="320" text-anchor="middle" font-family="{SANS}" font-size="12" font-weight="700" fill="white">A 面 · 作业</text>')
    s.append(f'<rect x="204" y="298" width="140" height="34" rx="3" fill="none" stroke="#8A6A2C" stroke-opacity=".55"/>')
    s.append(f'<text x="274" y="320" text-anchor="middle" font-family="{SANS}" font-size="12" font-weight="700" fill="#5A3B16">B 面 · 考试</text>')
    # 卷宗里的作业条目
    rows = [('系统解剖学作业','11-10 截止','未完成'),('生理学实验报告','11-13 截止','未完成'),
            ('英语单词 50 个','11-08 截止','已完成'),('生物化学笔记','11-15 截止','未完成')]
    for i, (name, due, st) in enumerate(rows):
        y = 352 + i*64
        fill = '#FFFFFF' if st == '未完成' else '#F2F6E8'
        s.append(f'<rect x="46" y="{y}" width="298" height="54" rx="6" fill="{fill}" fill-opacity=".62" stroke="#8A6A2C" stroke-opacity=".28"/>')
        s.append(f'<rect x="46" y="{y}" width="3" height="54" fill="{CORAL if st=="未完成" else GRASS}"/>')
        s.append(f'<text x="62" y="{y+22}" font-family="{SANS}" font-size="12" font-weight="600" fill="#241C10">{xesc(name)}</text>')
        s.append(f'<text x="62" y="{y+41}" font-family="{MONO}" font-size="9" fill="#5A3B16">{xesc(due)}</text>')
        tag = CORAL if st == '未完成' else GRASS
        s.append(f'<rect x="266" y="{y+16}" width="66" height="22" rx="3" fill="{tag}" fill-opacity=".16"/>')
        s.append(f'<text x="299" y="{y+31}" text-anchor="middle" font-family="{MONO}" font-size="9" fill="{tag}">{xesc(st)}</text>')
    s.append(f'<text x="48" y="630" font-family="{MONO}" font-size="9" fill="#5A3B16">截止时间与完成情况 · 只读展示</text>')
    s.append(f'<text x="48" y="650" font-family="{MONO}" font-size="8" fill="#8A6A2C">从手指按下的地方放大铺满</text>')
    # 关闭钮
    s.append(f'<rect x="322" y="262" width="30" height="30" rx="3" fill="none" stroke="#8A6A2C" stroke-opacity=".5"/>')
    s.append(f'<path d="M332 272 L342 282 M342 272 L332 282" stroke="#5A3B16" stroke-width="1.6"/>')
    return ''.join(s)


def water_inner():
    s = []
    # hot water ticket
    s.append(f'<path d="M14 160 H376 V292 L364 304 L352 292 L340 304 L328 292 L316 304 L304 292 L292 304 L280 292 L268 304 L256 292 L244 304 L232 292 L220 304 L208 292 L196 304 L184 292 L172 304 L160 292 L148 304 L136 292 L124 304 L112 292 L100 304 L88 292 L76 304 L64 292 L52 304 L40 292 L28 304 L14 292 Z" fill="#FFF4DC" stroke="#8A5A3B" stroke-opacity=".45"/>')
    s.append(f'<text x="30" y="186" font-family="{MONO}" font-size="9" fill="#5A3B16" letter-spacing="1.6">HOT WATER · NO.305</text>')
    s.append(f'<path d="M28 196 H362" stroke="#8A5A3B" stroke-opacity=".5" stroke-dasharray="4 4"/>')
    s.append(f'<text x="30" y="238" font-family="{SANS}" font-size="27" font-weight="800" fill="#241C10">免验证<tspan x="30" dy="32">接热水</tspan></text>')
    s.append(f'<text x="240" y="238" font-family="{MONO}" font-size="10" fill="#5A3B16">已绑定设备</text>')
    s.append(f'<text x="240" y="256" font-family="{MONO}" font-size="10" fill="#5A3B16">撕角出水 →</text>')
    s.append(f'<text x="30" y="284" font-family="{MONO}" font-size="8" fill="#5A3B16">ONLY WATER · 不涉资金</text>')
    # clipping WIKI
    s.append(f'<rect x="14" y="326" width="362" height="150" rx="3" fill="{TAPE}" stroke="#8A5A3B" stroke-opacity=".3"/>')
    s.append(f'<rect x="26" y="336" width="94" height="20" fill="{CORAL}"/>')
    s.append(f'<text x="34" y="350" font-family="{MONO}" font-size="8" fill="white" letter-spacing="1">CAMPUS WIKI</text>')
    s.append(f'<text x="28" y="382" font-family="{SANS}" font-size="17" font-weight="800" fill="#2B2A24">校园剪报</text>')
    s.append(f'<path d="M28 390 H362" stroke="#2B2A24" stroke-width="1" stroke-dasharray="2 2"/>')
    for i, (n, t) in enumerate([('校历','学期与假期'),('招生办','官方入口'),('附属医院','名录与地址'),('校训','明德 · 博学')]):
        x, y = 28 + (i%2)*170, 402 + (i//2)*34
        s.append(f'<rect x="{x}" y="{y}" width="160" height="28" rx="2" fill="rgba(255,255,255,.55)" stroke="#2B2A24" stroke-opacity=".25"/>')
        s.append(f'<text x="{x+7}" y="{y+18}" font-family="{SANS}" font-size="11" font-weight="700" fill="#2B2A24">{xesc(n)}</text>')
        s.append(f'<text x="{x+153}" y="{y+18}" text-anchor="end" font-family="{MONO}" font-size="8" fill="#7A6E58">{xesc(t)}</text>')
    # polaroid wall
    for i, (cap, col, tag) in enumerate([('待审核','#C9D5DA','待冲洗'),('已上墙','#FF9A62','图书馆 · 秋'),('便签','#FFF2A8','留言板')]):
        x = 20 + i*122
        s.append(f'<rect x="{x}" y="504" width="108" height="130" rx="2" fill="#FFFDF7" transform="rotate({-2 if i==0 else 2 if i==1 else -1} {x+54} 569)"/>')
        s.append(f'<rect x="{x+6}" y="510" width="96" height="96" fill="{col}"/>')
        s.append(f'<text x="{x+54}" y="565" text-anchor="middle" font-family="{SANS}" font-size="10" fill="#4A3B12">{xesc(tag)}</text>')
        s.append(f'<text x="{x+54}" y="622" text-anchor="middle" font-family="{MONO}" font-size="8" fill="#6A6255">{xesc(cap)}</text>')
    s.append(f'<text x="20" y="660" font-family="{MONO}" font-size="8" fill="#4A5A6A">校园图片需管理员审核 · 留言板 12 条</text>')
    return ''.join(s)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('shot-kb.svg', frame(kb_inner(), '课表舷窗', 'TIMETABLE / 7×5', 'CH 01 · TIMETABLE')),
        ('shot-learn.svg', frame(learn_inner(), '磁带门', 'STUDY / A·B', 'CH 02 · STUDY')),
        ('shot-water.svg', frame(water_inner(), '校园舱格', 'CAMPUS / WIKI', 'CH 03 · CAMPUS')),
    ]
    for name, svg in jobs:
        # 生成后必须自己当 XML 解析一遍：SVG 里一个未转义的引号就会让浏览器
        # 渲染出「空白图 + 红色错误框」，肉眼很难立刻看出是 XML 坏了。
        import xml.etree.ElementTree as ET
        try:
            ET.fromstring(svg)
        except Exception as e:
            raise SystemExit('%s 不是合法 XML：%s' % (name, e))
        p = os.path.join(OUT, name)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(svg)
        print('ok  %-18s %6d bytes  (xml ok)' % (name, len(svg.encode('utf-8'))))
    print('done 3 NOVA site shots')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
