#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成官网/README 用的界面示意图（SVG，纯代码绘制）。

    python -X utf8 tools/gen_shots.py

为什么不用真机截图：
  ①本机没有真机也没有模拟器；②headless Edge 截 App 页面时灵时不灵
  （file:// 中文路径直接 0 字节，走本地 http 也会偶发卡死整个进程）。
  用一张渲染残缺的截图放在官网，比放一张干净的示意图更糟。

所以这里按 App 真实的 UI 结构（配色、圆角、字号层级都取自 web/app.css）
用 SVG 手绘三张「效果示意图」：课表页 / 学习页 / 校园事务页。
它们是**示意图不是截图**，这点在页面文案里会标明，不谎称是真机界面。

产物：
  server/pages/dist/img/shot-kb.svg      课表
  server/pages/dist/img/shot-learn.svg   学习（作业倒计时）
  server/pages/dist/img/shot-water.svg   饮水机
  server/pages/dist/img/logo.svg         品牌图标
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'server', 'pages', 'dist', 'img')

# —— 与 web/app.css 的 :root 完全一致，保证官网和 App 同一张脸 ——
BG = '#f4f6fb'
SURFACE = '#ffffff'
FG = '#0f172a'
FG2 = '#3d4759'
MUTE = '#8b94a6'
LINE = '#e9edf5'
ACCENT = '#2563eb'
ACCENT_SOFT = '#eaf1ff'
OK = '#16a34a'
WARN = '#ea580c'

# 课程色（app.css 里的马卡龙色系，取前四）
C1 = '#dbeafe'   # 蓝
C1T = '#1e40af'
C2 = '#dcfce7'   # 绿
C2T = '#166534'
C3 = '#fef3c7'   # 黄
C3T = '#92400e'
C4 = '#fae8ff'   # 紫
C4T = '#86198f'

W, H = 390, 780          # 手机比例（接近 19.5:9）


def head(w=W, h=H):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d" fill="none">' % (w, h, w, h)
    )


def phone_frame(inner, title):
    """手机外框 + 品牌行 + 底部导航，三张图共用骨架。

    注意：`defs`（渐变/阴影定义）必须放在 <svg> 内部的最前面，
    所以由这里统一拼，不能由 main() 在外面拼 —— 否则生成的是
    `<defs>…</defs><svg>…</svg>`，浏览器直接报
    「error on line 1 at column 572: Unexpected token: <」。
    """
    s = []
    s.append(head())
    s.append(defs())
    s.append('<rect x="0" y="0" width="%d" height="%d" rx="26" fill="%s"/>' % (W, H, BG))
    # 状态栏（简化，只画时间与信号点）
    s.append('<text x="22" y="26" font-size="12" font-weight="600" fill="%s">21:18</text>' % FG)
    for i in range(4):
        s.append('<rect x="%d" y="%d" width="3" height="%d" rx="1" fill="%s"/>'
                 % (320 + i * 5, 26 - (4 + i * 2), 4 + i * 2, FG2))
    # 品牌行
    s.append('<rect x="0" y="36" width="%d" height="58" fill="%s"/>' % (W, SURFACE))
    s.append('<rect x="18" y="48" width="34" height="34" rx="11" fill="url(#brand)"/>')
    s.append('<text x="35" y="70" font-size="15" font-weight="700" fill="#fff" '
             'text-anchor="middle" font-family="sans-serif">河</text>')
    s.append('<text x="62" y="62" font-size="15" font-weight="700" fill="%s">河医大助手</text>' % FG)
    s.append('<text x="62" y="78" font-size="10.5" fill="%s">%s</text>' % (MUTE, title))
    s.append('<line x1="0" y1="94" x2="%d" y2="94" stroke="%s"/>' % (W, LINE))
    s.append(inner)
    # 底部导航
    s.append('<rect x="0" y="%d" width="%d" height="%d" fill="%s"/>' % (H - 62, W, 62, SURFACE))
    s.append('<line x1="0" y1="%d" x2="%d" y2="%d" stroke="%s"/>' % (H - 62, W, H - 62, LINE))
    tabs = [('课表', True), ('学习', False), ('校园', False), ('我的', False)]
    for i, (name, on) in enumerate(tabs):
        cx = 48 + i * 98
        col = ACCENT if on else MUTE
        s.append('<rect x="%d" y="%d" width="18" height="16" rx="4" fill="%s" opacity="%s"/>'
                 % (cx - 9, H - 44, col, '0.9' if on else '0.45'))
        s.append('<text x="%d" y="%d" font-size="9.5" fill="%s" text-anchor="middle" '
                 'font-weight="%s">%s</text>'
                 % (cx, H - 20, col, '700' if on else '500', name))
    return ''.join(s)


def defs():
    return (
        '<defs>'
        '<linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#3b82f6"/>'
        '<stop offset="55%" stop-color="#2563eb"/>'
        '<stop offset="100%" stop-color="#4f46e5"/>'
        '</linearGradient>'
        '<linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#3b82f6"/>'
        '<stop offset="60%" stop-color="#2563eb"/>'
        '<stop offset="100%" stop-color="#4f46e5"/>'
        '</linearGradient>'
        '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.07"/>'
        '</filter>'
        '</defs>'
    )


# ---------------------------------------------------------------- 课表页
def shot_kb():
    s = []
    s.append('<text x="18" y="118" font-size="11" fill="%s">第 8 周 · 共 21 周</text>' % MUTE)
    s.append('<text x="18" y="140" font-size="19" font-weight="700" fill="%s">本周课表</text>' % FG)

    # —— 网格几何：必须让课程块正好贴住格子，否则看起来像页面错位 ——
    GRID_L = 16            # 左边缘
    GRID_R = W - 16        # 右边缘
    COL_N = 7
    COL_W = (GRID_R - GRID_L) / COL_N      # 每列宽
    GAP = 2                # 块与格之间的内缩
    top = 158              # 星期头起始 y
    grid_top = top + 32
    # 行数按剩余空间算：图高 780、导航占 62、网格从 grid_top 起，
    # 留 8px 底部间隙。写死行数会在底部留一大片空白，看起来像没渲染完。
    ROW_H = 46
    ROWS = int((H - 62 - 8 - grid_top) / ROW_H)

    days = ['一', '二', '三', '四', '五', '六', '日']
    s.append('<rect x="%d" y="%d" width="%d" height="26" rx="9" fill="%s"/>'
             % (GRID_L, top, GRID_R - GRID_L, SURFACE))
    for i, d in enumerate(days):
        cx = GRID_L + COL_W * (i + 0.5)
        today = (i == 2)
        if today:
            s.append('<rect x="%.1f" y="%d" width="%.1f" height="22" rx="7" fill="%s"/>'
                     % (cx - 13, top + 2, 26, ACCENT_SOFT))
        s.append('<text x="%.1f" y="%d" font-size="11" font-weight="%s" fill="%s" '
                 'text-anchor="middle">%s</text>'
                 % (cx, top + 18, '700' if today else '500', ACCENT if today else FG2, d))

    # 空白格
    for r in range(ROWS):
        for c in range(COL_N):
            x = GRID_L + c * COL_W
            y = grid_top + r * ROW_H
            fill = '#ffffff'
            s.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%d" rx="6" fill="%s" '
                     'stroke="%s" stroke-width="0.6"/>'
                     % (x + 0.5, y + 0.5, COL_W - 1, ROW_H - 1, fill, LINE))

    # 课程块：(列 0-6, 起始行 0-9, 跨几行, 名称, 教室, 色号)
    # 名称控制在 4 字以内，避免 SVG 不会自动换行导致竖排
    COLORS = [(C1, C1T), (C2, C2T), (C3, C3T), (C4, C4T)]
    courses = [
        (0, 0, 2, '解剖', '3301', 0),
        (1, 0, 2, '英语', 'A205', 1),
        (2, 0, 1, '组胚', '3308', 2),
        (3, 0, 2, '生理', '3201', 3),
        (4, 1, 2, '生化', '3305', 1),
        (5, 0, 2, '病理', '3311', 3),
        (2, 2, 2, '诊断', '附院', 0),
        (6, 3, 2, '体育', '操场', 2),
        (0, 3, 1, '心理', 'B107', 1),
        (1, 3, 2, '药理', '3205', 3),
        (4, 4, 1, '医学史', '3301', 0),
    ]
    for c, r, span, name, room, ci in courses:
        bg, fg = COLORS[ci]
        x = GRID_L + c * COL_W + GAP
        y = grid_top + r * ROW_H + GAP
        w = COL_W - GAP * 2
        h = span * ROW_H - GAP * 2
        s.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%d" rx="6" fill="%s"/>'
                 % (x, y, w, h, bg))
        cx = x + w / 2
        # 名称：一行放得下就居中一行，否则分两行（按字数均分）
        if len(name) <= 2:
            s.append('<text x="%.1f" y="%.1f" font-size="10" font-weight="700" '
                     'fill="%s" text-anchor="middle">%s</text>'
                     % (cx, y + 15, fg, name))
        elif len(name) == 3:
            s.append('<text x="%.1f" y="%.1f" font-size="10" font-weight="700" '
                     'fill="%s" text-anchor="middle">%s</text>'
                     % (cx, y + 14, fg, name[:2]))
            s.append('<text x="%.1f" y="%.1f" font-size="10" font-weight="700" '
                     'fill="%s" text-anchor="middle">%s</text>'
                     % (cx, y + 25, fg, name[2:]))
        else:
            s.append('<text x="%.1f" y="%.1f" font-size="9.5" font-weight="700" '
                     'fill="%s" text-anchor="middle">%s</text>'
                     % (cx, y + 13, fg, name[:2]))
            s.append('<text x="%.1f" y="%.1f" font-size="9.5" font-weight="700" '
                     'fill="%s" text-anchor="middle">%s</text>'
                     % (cx, y + 24, fg, name[2:]))
        if h > 60:
            s.append('<text x="%.1f" y="%.1f" font-size="8" fill="%s" opacity="0.75" '
                     'text-anchor="middle">%s</text>' % (cx, y + h - 7, fg, room))
    return phone_frame(''.join(s), '课表')


# ---------------------------------------------------------------- 学习页
def shot_learn():
    s = []
    s.append('<text x="18" y="118" font-size="11" fill="%s">6 门课 · 9 条待办</text>' % MUTE)
    s.append('<text x="18" y="140" font-size="19" font-weight="700" fill="%s">学习</text>' % FG)

    # 分段控件
    y = 156
    s.append('<rect x="14" y="%d" width="%d" height="30" rx="10" fill="%s"/>' % (y, W - 28, SURFACE))
    s.append('<rect x="18" y="%d" width="120" height="22" rx="7" fill="%s"/>' % (y + 4, ACCENT_SOFT))
    s.append('<text x="78" y="%d" font-size="11" font-weight="600" fill="%s" '
             'text-anchor="middle">按紧急度</text>' % (y + 19, ACCENT))
    s.append('<text x="200" y="%d" font-size="11" fill="%s" text-anchor="middle">按课程</text>'
             % (y + 19, MUTE))
    s.append('<text x="300" y="%d" font-size="11" fill="%s" text-anchor="middle">全部</text>'
             % (y + 19, MUTE))

    items = [
        ('大学生安全教育', '激情犯罪与防范性侵害课后作业', '还剩 3 小时', WARN, '待做'),
        ('系统解剖学', '神经系统章节测试', '还剩 11 小时', WARN, '待做'),
        ('大学英语', 'Unit 5 单元作业', '还剩 2 天 4 时', FG2, '待做'),
        ('生理学', '第三章课后习题', '还剩 5 天', FG2, '待批阅'),
        ('组织胚胎学', '实验报告', '已过期', MUTE, '已过期'),
        ('体育', '体测信息登记', '状态未知', MUTE, '未知'),
    ]
    cy = 200
    for course, name, left, lcol, badge in items:
        s.append('<rect x="14" y="%d" width="%d" height="78" rx="12" fill="%s" filter="url(#sh)"/>'
                 % (cy, W - 28, SURFACE))
        s.append('<text x="26" y="%d" font-size="10.5" fill="%s">%s</text>' % (cy + 20, MUTE, course))
        s.append('<text x="26" y="%d" font-size="12.5" font-weight="600" fill="%s">%s</text>'
                 % (cy + 38, FG, name if len(name) <= 15 else name[:15] + '…'))
        s.append('<text x="26" y="%d" font-size="11" font-weight="600" fill="%s">%s</text>'
                 % (cy + 60, lcol, left))
        # 右上角状态胶囊
        bw = 8 + len(badge) * 11
        bcol = WARN if badge == '待做' else (OK if badge == '已完成' else MUTE)
        s.append('<rect x="%d" y="%d" width="%d" height="20" rx="7" fill="%s" opacity="0.12"/>'
                 % (W - 26 - bw, cy + 14, bw, bcol))
        s.append('<text x="%d" y="%d" font-size="10" font-weight="600" fill="%s" '
                 'text-anchor="middle">%s</text>' % (W - 26 - bw / 2, cy + 28, bcol, badge))
        cy += 84
    return phone_frame(''.join(s), '学习')


# ---------------------------------------------------------------- 校园/饮水机
def shot_water():
    s = []
    s.append('<text x="18" y="118" font-size="11" fill="%s">校园事务</text>' % MUTE)
    s.append('<text x="18" y="140" font-size="19" font-weight="700" fill="%s">饮水机</text>' % FG)

    # 账号卡
    y = 156
    s.append('<rect x="14" y="%d" width="%d" height="72" rx="12" fill="%s" filter="url(#sh)"/>'
             % (y, W - 28, SURFACE))
    s.append('<text x="26" y="%d" font-size="10.5" fill="%s">账号</text>' % (y + 22, MUTE))
    s.append('<text x="%d" y="%d" font-size="11" font-weight="600" fill="%s" '
             'text-anchor="end">150****3129</text>' % (W - 26, y + 22, FG2))
    s.append('<line x1="26" y1="%d" x2="%d" y2="%d" stroke="%s"/>' % (y + 34, W - 26, y + 34, LINE))
    s.append('<text x="26" y="%d" font-size="10.5" fill="%s">已绑定饮水机</text>' % (y + 56, MUTE))
    s.append('<text x="%d" y="%d" font-size="11" font-weight="600" fill="%s" '
             'text-anchor="end">2 台</text>' % (W - 26, y + 56, FG2))

    # 最长放水（防忘关）
    y = 240
    s.append('<rect x="14" y="%d" width="%d" height="96" rx="12" fill="%s" filter="url(#sh)"/>'
             % (y, W - 28, SURFACE))
    s.append('<text x="26" y="%d" font-size="11" font-weight="600" fill="%s">最长放水（防忘关）</text>'
             % (y + 24, FG))
    s.append('<text x="26" y="%d" font-size="9.5" fill="%s">选了数字，到量自动帮你停</text>'
             % (y + 40, MUTE))
    chips = ['不限', '1分钟', '2分钟', '5分钟']
    for i, c in enumerate(chips):
        cx = 26 + i * 84
        on = (i == 3)
        s.append('<rect x="%d" y="%d" width="72" height="26" rx="9" fill="%s"/>'
                 % (cx, y + 58, ACCENT if on else ACCENT_SOFT))
        s.append('<text x="%d" y="%d" font-size="10.5" font-weight="%s" fill="%s" '
                 'text-anchor="middle">%s</text>'
                 % (cx + 36, y + 75, '700' if on else '500', '#fff' if on else ACCENT, c))

    # 设备卡
    y = 348
    s.append('<rect x="14" y="%d" width="%d" height="150" rx="12" fill="%s" filter="url(#sh)"/>'
             % (y, W - 28, SURFACE))
    s.append('<text x="26" y="%d" font-size="12.5" font-weight="700" fill="%s">'
             '南校区4号公寓东5楼</text>' % (y + 26, FG))
    s.append('<text x="26" y="%d" font-size="9.5" fill="%s">SN 8654…324 · 2 个出水口</text>'
             % (y + 44, MUTE))
    btns = [('放水·冷', False), ('放水·热', False), ('重新绑定', True), ('移除', True)]
    bx = 26
    for label, ghost in btns:
        bw = 62 if len(label) <= 3 else (len(label) - 3) * 11 + 52
        s.append('<rect x="%d" y="%d" width="%d" height="30" rx="9" fill="%s" %s/>'
                 % (bx, y + 62, bw,
                    '#f7f9fc' if ghost else 'url(#hero)',
                    'stroke="%s"' % LINE if ghost else ''))
        s.append('<text x="%d" y="%d" font-size="10.5" font-weight="600" fill="%s" '
                 'text-anchor="middle">%s</text>'
                 % (bx + bw / 2, y + 81, FG2 if ghost else '#fff', label))
        bx += bw + 8
    # 状态提示
    s.append('<rect x="26" y="%d" width="%d" height="36" rx="9" fill="%s"/>'
             % (y + 100, W - 52, '#fff8f1'))
    s.append('<text x="36" y="%d" font-size="9.5" fill="#8a3d0c">'
             '已解锁 · 去机器出水口按一下就出水</text>' % (y + 123))
    return phone_frame(''.join(s), '校园事务')


# ---------------------------------------------------------------- 品牌图标
def logo(size=256):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 256 256">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%%" stop-color="#3b82f6"/>'
        '<stop offset="55%%" stop-color="#2563eb"/>'
        '<stop offset="100%%" stop-color="#4f46e5"/>'
        '</linearGradient></defs>'
        '<rect width="256" height="256" rx="64" fill="url(#g)"/>'
        '<text x="128" y="176" font-family="PingFang SC,Microsoft YaHei,sans-serif" '
        'font-size="132" font-weight="700" fill="#ffffff" text-anchor="middle">河</text>'
        '</svg>' % (size, size)
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    items = [
        ('logo.svg', logo()),
        ('shot-kb.svg', shot_kb() + '</svg>'),
        ('shot-learn.svg', shot_learn() + '</svg>'),
        ('shot-water.svg', shot_water() + '</svg>'),
    ]
    for name, svg in items:
        p = os.path.join(OUT, name)
        with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg)
        print('%-18s %6d 字节' % (name, os.path.getsize(p)))
    print('\n输出目录：%s' % OUT)
    print('（这些是示意图不是真机截图，页面文案里必须如实标明。）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
