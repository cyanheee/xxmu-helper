# -*- coding: utf-8 -*-
"""v2.13.0 "export to calendar" overview sheet: one panel x four combos.

There is only one subject this round (the half-sheet opened from
Settings -> "export to phone calendar"), so the sheet is a single column:
nova light / nova dark / classic light / classic dark, each labelled on the
left. Panels are short (~400px), so no per-column scaling is needed -- they
are pasted at 1:1 and the sheet is exactly as tall as the four of them.

ASCII-only source: this runs under PowerShell 5.1 via `python -X utf8`.
"""
import os
from PIL import Image, ImageDraw

SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
OUT = os.path.join(SH, "_v213_calendar_overview.png")

PAT = "v213-calendar-%s-%s.png"
ROWS = [
    ("nova", "light", "NOVA LIGHT"),
    ("nova", "dark", "NOVA DARK"),
    ("classic", "light", "CLASSIC LIGHT"),
    ("classic", "dark", "CLASSIC DARK"),
]

PAD = 12
LABEL_W = 108
BG = (245, 243, 238)
FG = (60, 58, 54)
EDGE = (214, 206, 192)


def path_of(skin, theme):
    p = os.path.join(SH, PAT % (skin, theme))
    if not os.path.exists(p):
        raise SystemExit("missing: " + p)
    return p


def main():
    imgs = []
    for skin, theme, label in ROWS:
        im = Image.open(path_of(skin, theme)).convert("RGB")
        imgs.append((label, im))

    col_w = max(im.width for _, im in imgs)
    total_w = LABEL_W + col_w + PAD
    H = PAD + sum(im.height + PAD for _, im in imgs)

    sheet = Image.new("RGB", (total_w, H), BG)
    d = ImageDraw.Draw(sheet)

    y = PAD
    for label, im in imgs:
        d.text((PAD, y + 4), label, fill=FG)
        x = LABEL_W
        sheet.paste(im, (x, y))
        d.rectangle([x - 1, y - 1, x + im.width, y + im.height], outline=EDGE)
        y += im.height + PAD

    sheet.save(OUT)
    print("OK", OUT, sheet.size, os.path.getsize(OUT))


main()
