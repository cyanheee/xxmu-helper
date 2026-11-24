# -*- coding: utf-8 -*-
"""v2.4.0 "focus log" screenshot composite.

Four frames (nova/classic x light/dark), 390x900 each, tiled side by side:
  _v240_focus_overview.png
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")

PAD = 10
LABEL_H = 24
BG = (245, 243, 238)
FG = (60, 58, 54)

PREFIX = "v240-focus-%s.png"
LABEL = "_v240_focus_overview.png"
ITEMS = [
    ("nova", "light"), ("nova", "dark"),
    ("classic", "light"), ("classic", "dark"),
]


def sheet():
    imgs = []
    for skin, theme in ITEMS:
        p = os.path.join(SHOTS, PREFIX % ("%s-%s" % (skin, theme)))
        if not os.path.exists(p):
            raise SystemExit("missing: " + p)
        imgs.append((("%s %s" % (skin, theme)).upper(),
                     Image.open(p).convert("RGB")))
    w = sum(i.width for _, i in imgs) + PAD * (len(imgs) + 1)
    h = max(i.height for _, i in imgs) + PAD * 2 + LABEL_H
    out = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(out)
    x = PAD
    for lab, im in imgs:
        d.text((x, PAD), lab, fill=FG)
        out.paste(im, (x, PAD + LABEL_H))
        x += im.width + PAD
    dst = os.path.join(SHOTS, LABEL)
    out.save(dst)
    print("  %s  %dx%d  %d B" % (LABEL, out.width, out.height,
                                 os.path.getsize(dst)))


sheet()
print("done")
