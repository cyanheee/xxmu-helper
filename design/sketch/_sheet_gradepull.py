# -*- coding: utf-8 -*-
"""把 v2.6.0「从教务读成绩」四档实拍拼成一张总览图。

四张宽度一样（390），高度不一样（nova 619 / classic 662），所以统一顶部对齐、
短的不拉伸 —— 之前 _sheet_export.py 就是这么处理的，照抄结构。
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
OUT = os.path.join(SHOTS, "_v260_gradepull_overview.png")

PAD = 10
LABEL_H = 24
BG = (245, 243, 238)
FG = (60, 58, 54)

ITEMS = [
    ("v260-gradepull-nova-light.png", "NOVA LIGHT"),
    ("v260-gradepull-nova-dark.png", "NOVA DARK"),
    ("v260-gradepull-classic-light.png", "CLASSIC LIGHT"),
    ("v260-gradepull-classic-dark.png", "CLASSIC DARK"),
]


def font(size):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "arial.ttf"):
        p = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    imgs = []
    for fn, label in ITEMS:
        p = os.path.join(SHOTS, fn)
        im = Image.open(p).convert("RGB")
        imgs.append((im, label))

    w = sum(im.width for im, _ in imgs) + PAD * (len(imgs) + 1)
    hmax = max(im.height for im, _ in imgs)
    h = hmax + LABEL_H + PAD * 2

    canvas = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(canvas)
    f = font(13)

    x = PAD
    for im, label in imgs:
        canvas.paste(im, (x, PAD))
        d.text((x + 2, PAD + im.height + 5), label, fill=FG, font=f)
        x += im.width + PAD

    canvas.save(OUT)
    print(OUT, canvas.size, os.path.getsize(OUT), "B")


if __name__ == "__main__":
    main()
