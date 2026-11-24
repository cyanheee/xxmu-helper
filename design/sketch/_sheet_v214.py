# _sheet_v214.py -- v2.14.0 contact sheet (todo deadline reminders)
#   python -X utf8 design/sketch/_sheet_v214.py
# Four columns (nova-light / nova-dark / classic-light / classic-dark); each
# column stacks the learn-page remind card over the settings sheet, scaled by
# the same factor so the two shots keep their real relative width.
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
OUT = os.path.join(SHOTS, '_v214_todoremind_overview.png')

PAD = 10
LABEL_H = 26
LABEL_W = 96
BG = (245, 243, 238)
FG = (60, 58, 54)
SCALE = 0.5

VARIANTS = [
    ('nova', 'light', 'NOVA LIGHT'),
    ('nova', 'dark', 'NOVA DARK'),
    ('classic', 'light', 'CLASSIC LIGHT'),
    ('classic', 'dark', 'CLASSIC DARK'),
]
PARTS = ['card', 'sheet']


def load(skin, theme, part):
    p = os.path.join(SHOTS, 'v214-todoremind-%s-%s-%s.png' % (part, skin, theme))
    im = Image.open(p).convert('RGB')
    w = int(im.width * SCALE)
    h = int(im.height * SCALE)
    return im.resize((w, h), Image.LANCZOS)


cols = []
for skin, theme, lab in VARIANTS:
    ims = [load(skin, theme, p) for p in PARTS]
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

d.text((4, 6), 'v2.14.0', fill=FG)
d.text((4, 22), '', fill=FG)
sheet.save(OUT)
print(OUT, sheet.size, os.path.getsize(OUT), 'B')
