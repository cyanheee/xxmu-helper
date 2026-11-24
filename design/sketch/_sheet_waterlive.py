# -*- coding: utf-8 -*-
"""把 v2.1.0 出水看护四档实拍拼成一张对照图。

    python design/sketch/_sheet_waterlive.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
OUT = os.path.join(HERE, "shots", "_v210_water_overview.png")

NAMES = [
    ("v210-water-nova-light.png", "NOVA · light 390x1240"),
    ("v210-water-nova-dark.png", "NOVA · dark 390x1240"),
    ("v210-water-classic-light.png", "classic · light 390x1240"),
    ("v210-water-classic-dark.png", "classic · dark 390x1240"),
]

PAD = 10
LABEL_H = 22
BG = (245, 243, 238)


def main():
    imgs = []
    for fn, label in NAMES:
        p = os.path.join(SHOTS, fn)
        im = Image.open(p).convert("RGB")
        imgs.append((im, label))

    w = sum(i.width for i, _ in imgs) + PAD * (len(imgs) + 1)
    h = max(i.height for i, _ in imgs) + LABEL_H + PAD * 2
    canvas = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(canvas)

    x = PAD
    for im, label in imgs:
        canvas.paste(im, (x, PAD))
        d.text((x + 2, PAD + im.height + 4), label, fill=(60, 56, 50))
        x += im.width + PAD

    canvas.save(OUT)
    print("%s  %dx%d  %d B" % (os.path.basename(OUT), canvas.width, canvas.height,
                               os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
