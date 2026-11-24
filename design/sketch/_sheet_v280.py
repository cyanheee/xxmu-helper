# -*- coding: utf-8 -*-
"""v2.8.0 tab overview sheet: 5 tabs x 4 combos, scaled down. ASCII-only source."""
import os
from PIL import Image, ImageDraw

SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
OUT = os.path.join(SH, "_v280_tabs_overview.png")

TABS = ["kb", "learn", "wiki", "campus", "me"]
ROWS = [
    ("nova", "light", "NOVA LIGHT"),
    ("nova", "dark", "NOVA DARK"),
    ("classic", "light", "CLASSIC LIGHT"),
    ("classic", "dark", "CLASSIC DARK"),
]

SCALE = 0.46
PAD = 8
LABEL_H = 20
LABEL_W = 96
BG = (245, 243, 238)
FG = (60, 58, 54)


def load(tab, skin, theme):
    p = os.path.join(SH, "uix-%s-%s-%s.png" % (tab, skin, theme))
    if not os.path.exists(p):
        raise SystemExit("missing: " + p)
    im = Image.open(p).convert("RGB")
    w = int(im.width * SCALE)
    h = int(im.height * SCALE)
    return im.resize((w, h), Image.LANCZOS)


def main():
    cells = []
    for skin, theme, label in ROWS:
        row = [load(t, skin, theme) for t in TABS]
        cells.append((label, row))
    col_w = max(c.width for _, row in cells for c in row)
    row_hs = [max(c.height for c in row) for _, row in cells]
    W = LABEL_W + len(TABS) * (col_w + PAD) + PAD
    H = PAD + sum(h + LABEL_H + PAD for h in row_hs)
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    y = PAD
    for (label, row), rh in zip(cells, row_hs):
        d.text((PAD, y + 4), label, fill=FG)
        x = LABEL_W
        for c in row:
            sheet.paste(c, (x, y + LABEL_H))
            d.rectangle([x - 1, y + LABEL_H - 1, x + c.width, y + LABEL_H + c.height], outline=(214, 206, 192))
            x += col_w + PAD
        y += rh + LABEL_H + PAD
    # column captions on top
    d2 = ImageDraw.Draw(sheet)
    for i, t in enumerate(TABS):
        d2.text((LABEL_W + i * (col_w + PAD) + 2, 2), t.upper(), fill=FG)
    sheet.save(OUT)
    print("OK", OUT, sheet.size, os.path.getsize(OUT))


main()
