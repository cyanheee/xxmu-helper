# _sheet_v215.py -- v2.15.0 contact sheet ("no one reads it" fixes)
#   python -X utf8 design/sketch/_sheet_v215.py
# Five columns (4 skins/themes + one error-state column); each column stacks
# the focus card over the About diagnostic panel, scaled to a common factor.
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
OUT = os.path.join(SHOTS, '_v215_gaps_overview.png')

PAD = 10
LABEL_H = 34
LABEL_W = 92
BG = (245, 243, 238)
FG = (60, 58, 54)
SCALE = 0.4

VARIANTS = [
    ('nova', 'light', 'NOVA L'),
    ('nova', 'dark', 'NOVA D'),
    ('classic', 'light', 'CLSC L'),
    ('classic', 'dark', 'CLSC D'),
]


def load(name):
    p = os.path.join(SHOTS, name)
    im = Image.open(p).convert('RGB')
    return im.resize((int(im.width * SCALE), int(im.height * SCALE)), Image.LANCZOS)


cols = []
for skin, theme, lab in VARIANTS:
    ims = [
        load('v215-focus-%s-%s.png' % (skin, theme)),
        load('v215-diag-%s-%s.png' % (skin, theme)),
    ]
    if skin == 'nova' and theme == 'light':
        ims.append(load('v215-focuserr-nova-light.png'))
    w = max(i.width for i in ims)
    h = sum(i.height for i in ims) + PAD * (len(ims) - 1)
    box = Image.new('RGB', (w, h), BG)
    y = 0
    for i in ims:
        box.paste(i, (0, y))
        y += i.height + PAD
    cols.append((box, lab))

col_w = max(c.width for c, _ in cols)
col_h = max(c.height for c, _ in cols)
W = LABEL_W + PAD + (col_w + PAD) * len(cols)
H = LABEL_H + PAD + col_h + PAD
sheet = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(sheet)
x = LABEL_W + PAD
for c, lab in cols:
    sheet.paste(c, (x, LABEL_H + PAD))
    d.text((x + 2, 6), lab, fill=FG)
    x += col_w + PAD

d.text((4, 6), 'v2.15.0', fill=FG)
d.text((4, 22), 'focus+diag', fill=FG)
sheet.save(OUT)
print(OUT, sheet.size, os.path.getsize(OUT), 'B')
