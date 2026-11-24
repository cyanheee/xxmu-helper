# -*- coding: utf-8 -*-
"""v2.0.0 交付总览：把四张实拍拼成一张，便于一眼看完三新功能。

用法：python -X utf8 design/sketch/_sheet_v200.py
输出：design/sketch/shots/_v200_overview.png（宽 1420）
"""
import io
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
OUT = os.path.join(SHOTS, "_v200_overview.png")

PANEL_W = 390
GAP = 18
PAD = 22
TOP = 54            # 标题带高度
BOTTOM = 46         # 图注带高度
BG = (247, 244, 238)

ITEMS = [
    ("v200-learn-light.png", "learn", "NOVA skin"),
    ("v200-sheet-light.png", "grades", "classic skin"),
    ("v200-sheet-nova-light.png", "grades", "NOVA skin"),
]


def load(name):
    p = os.path.join(SHOTS, name)
    if not os.path.exists(p):
        sys.stderr.write("missing: %s\n" % p)
        sys.exit(1)
    return Image.open(p).convert("RGB")


def main():
    imgs = [load(n) for n, _, _ in ITEMS]
    # 统一裁到同一高度：取最矮的那张，顶部对齐（三张都是顶部有内容的版式）
    h = min(im.height for im in imgs)
    n = len(imgs)
    W = PAD * 2 + PANEL_W * n + GAP * (n - 1)
    H = TOP + h + BOTTOM
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)

    x = PAD
    for im, (name, cap, skin) in zip(imgs, ITEMS):
        crop = im.crop((0, 0, min(PANEL_W, im.width), h))
        canvas.paste(crop, (x, TOP))
        d.rectangle([x - 1, TOP - 1, x + PANEL_W, TOP + h], outline=(210, 203, 190))
        # 图注：纯 ASCII 画不了中文就交给调用方看图；这里只写皮肤名与尺寸
        d.text((x + 2, TOP + h + 10), "%s  %dx%d" % (skin, crop.width, crop.height),
               fill=(120, 112, 100))
        x += PANEL_W + GAP

    canvas.save(OUT)
    print("ok %s %dx%d %d bytes" % (os.path.basename(OUT), W, H, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
