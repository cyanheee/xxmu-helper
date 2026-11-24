# -*- coding: utf-8 -*-
"""v2.9.0 tool-card overview sheet: 4 cards x 4 combos.

Columns are the four tool panels that live in #toolPark and get moved into the
half-sheet at runtime: todo / bind (account) / focus / free (empty rooms).
Focus already exists as v240-focus-*.png from v2.4.0; the other three are new.
Bind is much taller than the rest, so each column gets its own scale: width
fits the column, height is capped so the whole sheet stays readable.

ASCII-only source: this runs under PowerShell 5.1 via python -X utf8.
"""
import os
from PIL import Image, ImageDraw

SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
OUT = os.path.join(SH, "_v290_toolcards_overview.png")

CARDS = [
    ("todo", "uix-tool-todo-%s-%s.png", "MY TODO"),
    ("bind", "uix-tool-bind-%s-%s.png", "ACCOUNT BIND"),
    ("focus", "v240-focus-%s-%s.png", "FOCUS TIMER"),
    ("free", "uix-tool-free-%s-%s.png", "EMPTY ROOMS"),
]
ROWS = [
    ("nova", "light", "NOVA LIGHT"),
    ("nova", "dark", "NOVA DARK"),
    ("classic", "light", "CLASSIC LIGHT"),
    ("classic", "dark", "CLASSIC DARK"),
]

COL_W = 340
MAX_H = 1200
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


def column_scale(pat):
    """One scale per column so every row of that column lines up."""
    tallest = 0
    for skin, theme, _ in ROWS:
        im = Image.open(path_of(pat, skin, theme))
        tallest = max(tallest, im.height)
    return min(COL_W / 390.0, float(MAX_H) / tallest)


def load(pat, skin, theme, scale):
    im = Image.open(path_of(pat, skin, theme)).convert("RGB")
    w = int(im.width * scale)
    h = int(im.height * scale)
    return im.resize((w, h), Image.LANCZOS)


def main():
    scales = [(key, pat, cap, column_scale(pat)) for key, pat, cap in CARDS]
    col_ws = [max(int(390 * s), 1) for _, _, _, s in scales]
    total_w = LABEL_W + sum(w + PAD for w in col_ws[:-1]) + col_ws[-1] + PAD

    grid = []
    for skin, theme, label in ROWS:
        grid.append((label, [load(pat, skin, theme, s) for _, pat, _, s in scales]))

    row_hs = [max(c.height for c in cell) for _, cell in grid]
    H = CAP_H + PAD + sum(h + LABEL_H + PAD for h in row_hs)
    sheet = Image.new("RGB", (total_w, H), BG)
    d = ImageDraw.Draw(sheet)

    x = LABEL_W
    for (_, _, cap, _), w in zip(scales, col_ws):
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
