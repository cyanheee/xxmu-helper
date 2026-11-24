# -*- coding: utf-8 -*-
"""v2.2.0 截止哨兵实拍拼图。

两组各四档（nova/classic x light/dark）横拼：
  _v220_hwremind_overview.png  <- 学习页提醒卡 390x900 x4
  _v220_hwremset_overview.png  <- 提醒设置面板 390x1240 x4
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")

PAD = 10
LABEL_H = 24
BG = (245, 243, 238)
FG = (60, 58, 54)

GROUPS = [
    ("card", "v220-remind-%s.png", "_v220_hwremind_overview.png", [
        ("nova", "light"), ("nova", "dark"),
        ("classic", "light"), ("classic", "dark"),
    ]),
    ("sheet", "v220-remindset-%s.png", "_v220_hwremset_overview.png", [
        ("nova", "light"), ("nova", "dark"),
        ("classic", "light"), ("classic", "dark"),
    ]),
]


def sheet(prefix, label, items):
    imgs = []
    for skin, theme in items:
        p = os.path.join(SHOTS, prefix % ("%s-%s" % (skin, theme)))
        if not os.path.exists(p):
            raise SystemExit("missing: " + p)
        imgs.append((("%s %s" % (skin, theme)).upper(), Image.open(p).convert("RGB")))
    w = sum(i.width for _, i in imgs) + PAD * (len(imgs) + 1)
    h = max(i.height for _, i in imgs) + PAD * 2 + LABEL_H
    out = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(out)
    x = PAD
    for lab, im in imgs:
        d.text((x, PAD), lab, fill=FG)
        out.paste(im, (x, PAD + LABEL_H))
        x += im.width + PAD
    dst = os.path.join(SHOTS, label)
    out.save(dst)
    print("  %s  %dx%d  %d B" % (label, out.width, out.height, os.path.getsize(dst)))


for _tag, _prefix, _label, _items in GROUPS:
    sheet(_prefix, _label, _items)
print("done")
