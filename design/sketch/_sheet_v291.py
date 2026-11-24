# -*- coding: utf-8 -*-
"""v2.9.1 overview sheet: the four sections that had never been shot before.

Columns: settings / guide / admin / about.  Rows: the four skin+theme combos.
These pages are pure vertical pages, so the only thing worth looking at is
"did anything get cut off or squeezed".  About is 3826px tall (privacy notes +
full changelog + three paragraphs from the author), roughly 2.6x the others,
so that column gets its own taller cap instead of shrinking to a sliver.

ASCII-only source: runs under PowerShell 5.1 via `python -X utf8`.
"""
import os
from PIL import Image, ImageDraw

SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
OUT = os.path.join(SH, "_v291_fourpages_overview.png")

PAGES = [
    ("settings", "uix-settings-%s-%s.png", "SETTINGS", 1000),
    ("guide", "uix-guide-%s-%s.png", "GUIDE", 1000),
    ("admin", "uix-admin-%s-%s.png", "ADMIN", 1000),
    ("about", "uix-about-%s-%s.png", "ABOUT", 1000),
]
ROWS = [
    ("nova", "light", "NOVA LIGHT"),
    ("nova", "dark", "NOVA DARK"),
    ("classic", "light", "CLASSIC LIGHT"),
    ("classic", "dark", "CLASSIC DARK"),
]

COL_W = 340
PAD = 10
LABEL_H = 22
LABEL_W = 104
CAP_H = 26
BG = (245, 243, 238)
FG = (60, 58, 54)
EDGE = (214, 206, 192)


def path_of(pat, skin, theme):
    p = os.path.join(SH, pat % (skin, theme))
    if not os.path.exists(p):
        raise SystemExit("missing: " + p)
    return p


def column_scale(pat, max_h):
    """One scale per column so every row of that column lines up."""
    tallest = 0
    for skin, theme, _ in ROWS:
        im = Image.open(path_of(pat, skin, theme))
        tallest = max(tallest, im.height)
    return min(COL_W / 390.0, float(max_h) / tallest)


def load(pat, skin, theme, scale):
    im = Image.open(path_of(pat, skin, theme)).convert("RGB")
    w = int(im.width * scale)
    h = int(im.height * scale)
    return im.resize((w, h), Image.LANCZOS)


def main():
    cols = [(cap, pat, column_scale(pat, max_h)) for _, pat, cap, max_h in PAGES]
    col_ws = [max(int(390 * s), 1) for _, _, s in cols]
    total_w = LABEL_W + sum(w + PAD for w in col_ws[:-1]) + col_ws[-1] + PAD

    grid = []
    for skin, theme, label in ROWS:
        grid.append((label, [load(pat, skin, theme, s) for _, pat, s in cols]))

    row_hs = [max(c.height for c in cell) for _, cell in grid]
    H = CAP_H + PAD + sum(h + LABEL_H + PAD for h in row_hs)
    sheet = Image.new("RGB", (total_w, H), BG)
    d = ImageDraw.Draw(sheet)

    x = LABEL_W
    for (cap, _, _), w in zip(cols, col_ws):
        d.text((x + 2, 6), cap, fill=FG)
        x += w + PAD

    y = CAP_H + PAD
    for (label, cell), rh in zip(grid, row_hs):
        d.text((PAD, y + 4), label, fill=FG)
        x = LABEL_W
        for c, w in zip(cell, col_ws):
            top = y + LABEL_H
            sheet.paste(c, (x, top))
            d.rectangle([x - 1, top - 1, x + c.width, top + c.height], outline=EDGE)
            x += w + PAD
        y += rh + LABEL_H + PAD

    sheet.save(OUT)
    print("OK", OUT, sheet.size, os.path.getsize(OUT))


main()
