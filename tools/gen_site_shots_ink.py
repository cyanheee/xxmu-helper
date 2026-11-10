# -*- coding: utf-8 -*-
"""把官网三张手机示意图重生成 v1.1.61「水墨云图 / 花青云水」浅色语言。

真源 = 本脚本；产物 = server/pages/dist/img/shot-{kb,learn,water}.svg。
与 App 的 web/nova-ink.css 同一套色：宣纸米白留白 + 花青淡墨晕染 + 朱砂印章，
底部保留两个 8-bit 像素小伙伴与英中双语气泡（彩蛋 v2 的静态定妆帧）。
旧 NOVA 版深玻璃舱格由 tools/gen_site_shots_nova.py 生成，已由本脚本取代。

门禁约束（tools/check_web.js、tools/check_site_skin.js）：
  * 单个 svg 根、以 '<svg' 开头、390x780 viewBox、> 200 字节；
  * 必须含 '#122A38'（深墨顶栏）、绝不含 '#EFE2C8'（旧牛皮纸）；
  * 纯内联、零外部依赖；SVG 是 XML，文本里的 & < > " 一律转义。
"""
import io, os
import xml.etree.ElementTree as ET


def xesc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'server', 'pages', 'dist', 'img')

PAPER_TOP = '#F3F1EA'
PAPER_MID = '#EAEDE9'
PAPER_BOT = '#E1E7E4'
CARD      = '#FCFDFC'
CELL      = '#DCE7E3'
CELL_EDGE = '#CBDAD7'
INK       = '#1C2B30'
INK2      = '#4C6068'
INKDEEP   = '#122A38'   # 门禁要求保留
SLATE     = '#33474D'
ACCENT    = '#2E6E76'
ACCENT_HI = '#3E8891'
CINNABAR  = '#B23A2E'   # 朱砂印章
BRASS     = '#C9A24B'
COIN      = '#F4C542'
WHITE     = '#FFFFFF'
ON2       = '#A9C6D2'
MONO = 'ui-monospace,Menlo,Consolas,monospace'
SANS = 'system-ui,Microsoft YaHei,sans-serif'

MARIO = [
    '....RRRRRR..', '...RRRRRRRR.', '..RRRRRRRRRR', '..KKSSSSSSKK',
    '..KSSWSSWSSK', '..KSSSSSSSSK', '...KSKKKKSK.', '...SSSSSSSS.',
    '....KSSSSK..', '..RRRRRRRR..', '.RRRBBBBRRR.', 'RRRRBYBBYBBR',
    '.RR.BBBBB.RR', '...BBBBBB...', '..NN.BB.NN..',
]
LINK = [
    '.....G......', '....GGG.....', '...GGGGG....', '..GGGGGGG...',
    '..YYSSSSYY..', '..YSWSSWSY..', '...SSSSSS...', '...KSSSSK...',
    '....SSSS....', '..GGGGGGGG..', '.GGGKKKKGGG.', 'NGGGKKKKGGGN',
    '..GGGGGGGG..', '...gg..gg...', '..NN....NN..',
]
PAL_M = {'R': '#E8402A', 'K': '#2B2B33', 'S': '#F7C08A', 'W': WHITE,
         'B': '#2C4FC9', 'Y': COIN, 'N': '#7A4423'}
PAL_L = {'G': '#2E9E4F', 'g': '#1B6B34', 'Y': '#F2D06B', 'S': '#F7C08A',
         'W': WHITE, 'K': '#2B2B33', 'N': '#7A4423'}


def sprite(rows, pal, x, y, s=2):
    """按行 run-length 合并像素，全内联 <rect>，离线可用。"""
    out = []
    for r, row in enumerate(rows):
        c = 0
        while c < len(row):
            ch = row[c]
            n = 1
            while c + n < len(row) and row[c + n] == ch:
                n += 1
            if ch != '.':
                out.append('<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>'
                           % (x + c * s, y + r * s, n * s, s, pal[ch]))
            c += n
    return ''.join(out)


def bubble(x, y, w, en, zh):
    h = 46
    out = []
    out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="9" fill="%s" '
               'fill-opacity=".97" stroke="%s" stroke-width="1"/>'
               % (x, y, w, h, CARD, CELL_EDGE))
    out.append('<path d="M%d %d L%d %d L%d %d Z" fill="%s" stroke="%s" stroke-width="1"/>'
               % (x + 20, y + h - 1, x + 30, y + h - 1, x + 22, y + h + 8, CARD, CELL_EDGE))
    out.append('<path d="M%d %d H%d" stroke="%s" stroke-dasharray="2 2" opacity=".8"/>'
               % (x + 9, y + 26, x + w - 9, CELL_EDGE))
    out.append('<text x="%d" y="%d" font-family="%s" font-size="8" font-weight="700" '
               'fill="%s">%s</text>' % (x + 9, y + 20, MONO, INK, xesc(en)))
    out.append('<text x="%d" y="%d" font-family="%s" font-size="8.5" font-weight="600" '
               'fill="%s">%s</text>' % (x + 9, y + 39, SANS, INK2, xesc(zh)))
    return ''.join(out)


def eg_layer():
    """彩蛋 v2 静态定妆帧：左右各一枚小人 + 英中双语气泡，中间留空不挡内容。"""
    out = []
    out.append(bubble(10, 556, 124, "It's-a me, Mario!", '是我呀，马里奥！'))
    out.append(bubble(256, 556, 124, 'Hey! Listen!', '嘿！听我说！'))
    out.append('<ellipse cx="56" cy="640" rx="16" ry="3" fill="%s" opacity=".14"/>' % INK)
    out.append(sprite(MARIO, PAL_M, 44, 606, 2))
    out.append('<ellipse cx="338" cy="640" rx="16" ry="3" fill="%s" opacity=".14"/>' % INK)
    out.append(sprite(LINK, PAL_L, 326, 606, 2))
    out.append('<rect x="14" y="648" width="362" height="1" fill="%s"/>' % CELL_EDGE)
    out.append('<text x="195" y="672" text-anchor="middle" font-family="%s" font-size="8" '
               'fill="%s" letter-spacing=".6">点一下有惊喜 · 连击攒金币 · 长按切音效</text>'
               % (MONO, INK2))
    return ''.join(out)


def frame(inner, title, sub, badge):
    week = []
    for x, n, c, stroke, t in [
        (86, 9, CARD, CELL_EDGE, INK2), (120, 10, CARD, CELL_EDGE, INK2),
        (154, 11, ACCENT, ACCENT_HI, WHITE), (188, 12, CARD, CELL_EDGE, INK2),
        (222, 13, CARD, CELL_EDGE, INK2),
    ]:
        week.append('<rect x="%d" y="66" width="30" height="24" rx="4" fill="%s" '
                    'stroke="%s" stroke-width="1"/>' % (x, c, stroke))
        week.append('<text x="%d" y="82" text-anchor="middle" font-family="%s" font-size="9" '
                    'font-weight="700" fill="%s">%02d</text>' % (x + 15, MONO, t, n))
    week_s = ''.join(week)

    tabs = []
    for x, label, c in [(45, '课表', ACCENT_HI), (120, '学习', ON2),
                        (195, '校园', ON2), (270, '资料', ON2), (345, '我的', ON2)]:
        tabs.append('<text x="%d" y="746" text-anchor="middle" font-family="%s" '
                    'font-size="10" fill="%s">%s</text>' % (x, SANS, c, label))
    tabs_s = ''.join(tabs)

    return f'''<svg width="390" height="780" viewBox="0 0 390 780" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
  <clipPath id="hull"><rect x="0" y="0" width="390" height="780" rx="18"/></clipPath>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{PAPER_TOP}"/><stop offset=".55" stop-color="{PAPER_MID}"/><stop offset="1" stop-color="{PAPER_BOT}"/>
  </linearGradient>
  <radialGradient id="inkA" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="{ACCENT}" stop-opacity=".16"/><stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="inkB" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="{SLATE}" stop-opacity=".11"/><stop offset="1" stop-color="{SLATE}" stop-opacity="0"/>
  </radialGradient>
  <pattern id="fiber" width="5" height="5" patternUnits="userSpaceOnUse">
    <rect width="5" height="1" fill="{INK}" opacity=".014"/>
  </pattern>
</defs>
<g clip-path="url(#hull)">
  <rect width="390" height="780" fill="url(#paper)"/>
  <ellipse cx="62" cy="70" rx="180" ry="120" fill="url(#inkA)"/>
  <ellipse cx="340" cy="250" rx="150" ry="130" fill="url(#inkA)"/>
  <ellipse cx="195" cy="740" rx="240" ry="150" fill="url(#inkB)"/>
  <rect width="390" height="780" fill="url(#fiber)"/>

  <rect width="390" height="36" fill="{INKDEEP}"/>
  <rect width="390" height="2" fill="{ACCENT_HI}" opacity=".55"/>
  <circle cx="22" cy="18" r="10" fill="{COIN}"/>
  <text x="22" y="22" text-anchor="middle" font-family="{SANS}" font-size="10" font-weight="800" fill="{INK}">河</text>
  <text x="40" y="23" font-family="{SANS}" font-size="12" font-weight="800" fill="{WHITE}">河医大助手</text>
  <text x="346" y="22" text-anchor="end" font-family="{MONO}" font-size="8" fill="{ON2}" letter-spacing="1.2">XXMU / INK OS</text>
  <rect x="356" y="6" width="24" height="24" rx="5" fill="{CINNABAR}"/>
  <text x="368" y="23" text-anchor="middle" font-family="{SANS}" font-size="12" font-weight="800" fill="{WHITE}">印</text>

  <rect x="12" y="46" width="366" height="58" rx="9" fill="{CARD}" fill-opacity=".86" stroke="{CELL_EDGE}"/>
  <text x="22" y="60" font-family="{MONO}" font-size="7" fill="{INK2}" letter-spacing="1.2">WEEK CONVEYOR · 周次传送带</text>
  {week_s}
  <circle cx="30" cy="78" r="10" fill="none" stroke="{BRASS}" stroke-width="1.4"/>
  <circle cx="360" cy="78" r="10" fill="none" stroke="{BRASS}" stroke-width="1.4"/>
  <path d="M195 46 L195 58" stroke="{CINNABAR}" stroke-width="1.6"/>
  <path d="M191 46 L199 46 L195 52 Z" fill="{CINNABAR}"/>

  <text x="14" y="128" font-family="{SANS}" font-size="19" font-weight="800" fill="{INK}">{xesc(title)}</text>
  <text x="376" y="128" text-anchor="end" font-family="{MONO}" font-size="9" fill="{INK2}" letter-spacing="1">{xesc(sub)}</text>
  <rect x="14" y="136" width="362" height="2" fill="{ACCENT}" opacity=".42"/>
  <rect x="14" y="136" width="34" height="2" fill="{CINNABAR}"/>
  {inner}
  {eg_layer()}

  <rect x="10" y="708" width="370" height="62" rx="11" fill="{SLATE}"/>
  <rect x="22" y="714" width="346" height="4" fill="url(#fiber)" opacity=".7"/>
  <circle cx="45" cy="716" r="5" fill="{ACCENT_HI}"/>
  {tabs_s}
  <text x="22" y="764" font-family="{MONO}" font-size="8" fill="{ACCENT_HI}" letter-spacing="1.2">{xesc(badge)}</text>
  <text x="368" y="764" text-anchor="end" font-family="{MONO}" font-size="8" fill="{ON2}">XXMU / INK</text>
</g>
</svg>'''


def kb_inner():
    """浅色课表：宣纸格 + 瓷白课程卡 + 时间对齐 + 今日列提花青。"""
    s = []
    times = ['08:00', '09:20', '10:20', '11:10', '14:30', '16:00', '17:30', '19:00']
    for i, t in enumerate(times):
        y = 200 + i * 44
        s.append('<text x="14" y="%d" font-family="%s" font-size="7.5" fill="%s">%s</text>'
                 % (y, MONO, INK2, t))
    for i, d in enumerate(['一', '二', '三', '四', '五', '六', '日']):
        x = 46 + i * 47
        col = ACCENT if i == 1 else INK2
        s.append('<text x="%d" y="172" text-anchor="middle" font-family="%s" font-size="9" '
                 'font-weight="700" fill="%s">周%s</text>' % (x + 23, SANS, col, d))
        if i == 1:
            s.append('<rect x="%d" y="178" width="34" height="2" rx="1" fill="%s"/>'
                     % (x + 6, ACCENT))
    x0, y0, cw, ch = 46, 186, 47, 58
    for r in range(5):
        for c in range(7):
            x, y = x0 + c * cw, y0 + r * ch
            f = '#EAF2EF' if c == 1 else CELL
            s.append('<rect x="%d" y="%d" width="%d" height="%d" rx="5" fill="%s" '
                     'stroke="%s" stroke-width=".8"/>' % (x, y, cw - 3, ch - 4, f, CELL_EDGE))
    courses = [
        ('系统解剖', 'A201', 0, 0), ('英语', 'D202', 4, 0),
        ('生理学', 'B103', 1, 1), ('病理学', 'B103', 2, 1),
        ('组织胚胎', 'A201', 1, 2), ('生物化学', 'C305', 2, 2), ('医学免疫', 'A201', 4, 2),
        ('体育', 'Playg', 0, 3), ('药理学', 'C305', 3, 3), ('诊断学', 'D202', 2, 4),
    ]
    for name, room, c, r in courses:
        x, y = x0 + c * cw, y0 + r * ch
        s.append('<rect x="%d" y="%d" width="%d" height="%d" rx="4" fill="%s" '
                 'stroke="%s" stroke-opacity=".35"/>' % (x + 1, y + 1, cw - 5, ch - 6, CARD, ACCENT))
        s.append('<rect x="%d" y="%d" width="3" height="%d" rx="1" fill="%s"/>'
                 % (x + 1, y + 1, ch - 6, ACCENT))
        s.append('<text x="%d" y="%d" font-family="%s" font-size="8.5" font-weight="700" '
                 'fill="%s">%s</text>' % (x + 5, y + 18, SANS, INK, xesc(name)))
        s.append('<text x="%d" y="%d" font-family="%s" font-size="7" fill="%s">%s</text>'
                 % (x + 5, y + 32, MONO, INK2, xesc(room)))
        s.append('<text x="%d" y="%d" font-family="%s" font-size="6.5" fill="%s">08:00</text>'
                 % (x + 5, y + 45, MONO, ACCENT))
    s.append('<rect x="14" y="486" width="362" height="1" fill="%s"/>' % CELL_EDGE)
    s.append('<text x="14" y="504" font-family="%s" font-size="8" fill="%s">'
             '上下课时间对齐 · 21 周可切 · 点格放大</text>' % (MONO, INK2))
    s.append('<rect x="14" y="516" width="362" height="8" rx="4" fill="%s"/>' % CELL)
    s.append('<rect x="14" y="516" width="214" height="8" rx="4" fill="%s" opacity=".8"/>' % ACCENT)
    s.append('<text x="376" y="540" text-anchor="end" font-family="%s" font-size="7.5" '
             'fill="%s">本周 10 节课 · 作息已同步</text>' % (MONO, INK2))
    return ''.join(s)


def learn_inner():
    """浅色学习页：磁带门卷宗，A 面作业 / B 面考试，朱砂未完成、花青已完成。"""
    s = []
    s.append('<rect x="14" y="150" width="362" height="40" rx="8" fill="%s"/>' % SLATE)
    s.append('<text x="28" y="175" font-family="%s" font-size="9" fill="%s" '
             'letter-spacing="1.2">MIXTAPE 01 · 磁带门 / 作业与考试</text>' % (MONO, ON2))
    s.append('<rect x="14" y="200" width="362" height="336" rx="10" fill="%s" stroke="%s"/>'
             % (CARD, CELL_EDGE))
    s.append('<rect x="14" y="200" width="362" height="6" rx="3" fill="%s" opacity=".45"/>' % ACCENT)
    s.append('<rect x="28" y="220" width="166" height="32" rx="5" fill="%s"/>' % CINNABAR)
    s.append('<text x="111" y="241" text-anchor="middle" font-family="%s" font-size="11" '
             'font-weight="800" fill="%s">A 面 · 作业</text>' % (SANS, WHITE))
    s.append('<rect x="202" y="220" width="166" height="32" rx="5" fill="none" stroke="%s"/>' % CELL_EDGE)
    s.append('<text x="285" y="241" text-anchor="middle" font-family="%s" font-size="11" '
             'font-weight="700" fill="%s">B 面 · 考试</text>' % (SANS, INK2))
    rows = [('系统解剖学作业', '11-10 截止', '未完成'), ('生理学实验报告', '11-13 截止', '未完成'),
            ('英语单词 50 个', '11-08 截止', '已完成'), ('生物化学笔记', '11-15 截止', '未完成')]
    for i, (name, due, st) in enumerate(rows):
        y = 266 + i * 62
        tag = CINNABAR if st == '未完成' else ACCENT
        s.append('<rect x="28" y="%d" width="340" height="54" rx="6" fill="%s" '
                 'stroke="%s" stroke-width=".8"/>' % (y, PAPER_TOP, CELL_EDGE))
        s.append('<rect x="28" y="%d" width="3" height="54" rx="1" fill="%s"/>' % (y, tag))
        s.append('<text x="42" y="%d" font-family="%s" font-size="11.5" font-weight="700" '
                 'fill="%s">%s</text>' % (y + 23, SANS, INK, xesc(name)))
        s.append('<text x="42" y="%d" font-family="%s" font-size="8.5" fill="%s">%s</text>'
                 % (y + 41, MONO, INK2, xesc(due)))
        s.append('<rect x="296" y="%d" width="62" height="22" rx="4" fill="%s" fill-opacity=".12"/>'
                 % (y + 16, tag))
        s.append('<text x="327" y="%d" text-anchor="middle" font-family="%s" font-size="8.5" '
                 'fill="%s">%s</text>' % (y + 31, MONO, tag, xesc(st)))
    s.append('<text x="28" y="524" font-family="%s" font-size="8" fill="%s">'
             '截止时间与完成情况 · 只读展示</text>' % (MONO, INK2))
    return ''.join(s)


def water_inner():
    """浅色校园页：热水票 + 朱砂印章 + 校园剪报 + 拍立得墙。"""
    s = []
    s.append('<rect x="14" y="150" width="362" height="132" rx="10" fill="%s" stroke="%s"/>'
             % (CARD, CELL_EDGE))
    s.append('<text x="30" y="174" font-family="%s" font-size="8" fill="%s" '
             'letter-spacing="1.2">HOT WATER · NO.305 / 热水票</text>' % (MONO, INK2))
    s.append('<path d="M28 184 H362" stroke="%s" stroke-dasharray="4 4"/>' % CELL_EDGE)
    s.append('<text x="30" y="222" font-family="%s" font-size="24" font-weight="800" '
             'fill="%s">免验证接热水</text>' % (SANS, INK))
    s.append('<text x="30" y="246" font-family="%s" font-size="8.5" fill="%s">'
             'ONLY WATER · 不涉资金</text>' % (MONO, ACCENT))
    s.append('<rect x="316" y="200" width="46" height="46" rx="6" fill="%s"/>' % CINNABAR)
    s.append('<text x="339" y="231" text-anchor="middle" font-family="%s" font-size="16" '
             'font-weight="800" fill="%s">河</text>' % (SANS, WHITE))

    s.append('<rect x="14" y="296" width="362" height="130" rx="8" fill="%s" stroke="%s"/>'
             % (CARD, CELL_EDGE))
    s.append('<rect x="26" y="306" width="96" height="20" rx="3" fill="%s"/>' % ACCENT)
    s.append('<text x="34" y="320" font-family="%s" font-size="7.5" fill="%s" '
             'letter-spacing="1">CAMPUS WIKI</text>' % (MONO, WHITE))
    s.append('<text x="28" y="350" font-family="%s" font-size="16" font-weight="800" '
             'fill="%s">校园剪报</text>' % (SANS, INK))
    s.append('<path d="M28 358 H362" stroke="%s" stroke-dasharray="2 2"/>' % CELL_EDGE)
    for i, (n, t) in enumerate([('校历', '学期与假期'), ('招生办', '官方入口'),
                                ('附属医院', '名录地址'), ('校训', '明德博学')]):
        x, y = 28 + (i % 2) * 170, 364 + (i // 2) * 30
        s.append('<rect x="%d" y="%d" width="160" height="26" rx="5" fill="%s" '
                 'stroke="%s" stroke-width=".8"/>' % (x, y, PAPER_TOP, CELL_EDGE))
        s.append('<text x="%d" y="%d" font-family="%s" font-size="10.5" font-weight="700" '
                 'fill="%s">%s</text>' % (x + 8, y + 18, SANS, INK, xesc(n)))
        s.append('<text x="%d" y="%d" text-anchor="end" font-family="%s" font-size="7.5" '
                 'fill="%s">%s</text>' % (x + 152, y + 18, MONO, INK2, xesc(t)))

    for i, (cap, col, tag) in enumerate([('待审核', CELL, '待冲洗'),
                                         ('已上墙', '#C8D8CF', '图书馆 · 秋'),
                                         ('便签', '#EDE3CD', '留言板')]):
        x = 20 + i * 122
        s.append('<rect x="%d" y="438" width="108" height="88" rx="3" fill="%s" stroke="%s"/>'
                 % (x, WHITE, CELL_EDGE))
        s.append('<rect x="%d" y="444" width="96" height="62" rx="2" fill="%s"/>' % (x + 6, col))
        s.append('<text x="%d" y="521" text-anchor="middle" font-family="%s" font-size="9" '
                 'fill="%s">%s</text>' % (x + 54, SANS, INK2, xesc(tag)))
        s.append('<text x="%d" y="536" text-anchor="middle" font-family="%s" font-size="7" '
                 'fill="%s">%s</text>' % (x + 54, MONO, INK2, xesc(cap)))
    s.append('<text x="14" y="548" font-family="%s" font-size="7.5" fill="%s">'
             '校园图片需管理员审核 · 留言板 12 条</text>' % (MONO, INK2))
    return ''.join(s)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('shot-kb.svg', frame(kb_inner(), '水墨课表', 'TIMETABLE / 花青', 'CH 01 · TIMETABLE')),
        ('shot-learn.svg', frame(learn_inner(), '磁带门', 'STUDY / A·B', 'CH 02 · STUDY')),
        ('shot-water.svg', frame(water_inner(), '校园剪报', 'CAMPUS / WIKI', 'CH 03 · CAMPUS')),
    ]
    for name, svg in jobs:
        try:
            ET.fromstring(svg)
        except Exception as e:
            raise SystemExit('%s 不是合法 XML：%s' % (name, e))
        assert svg.startswith('<svg'), name
        assert svg.count('<svg') == 1, name
        assert '#122A38' in svg and '#EFE2C8' not in svg, name
        p = os.path.join(OUT, name)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(svg)
        print('ok  %-18s %6d bytes  (xml ok / ink ok)' % (name, len(svg.encode('utf-8'))))
    print('done 3 INK site shots')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
