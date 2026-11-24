# -*- coding: utf-8 -*-
"""v2.7.0 tab contact sheet: five tabs in one row.

Usage:
  python -X utf8 design/sketch/_sheet_tabs.py nova light
  python -X utf8 design/sketch/_sheet_tabs.py classic dark

Reads design/sketch/shots/uix-<tab>-<skin>-<theme>.png and writes
shots/_v270_tabs_<skin>_<theme>.png. Tabs are scaled to a common height so
pages with different lengths still line up at the top, which is what makes
"is the header consistent across tabs" visible at a glance.
"""
import os
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")

TABS = ["kb", "learn", "wiki", "campus", "me"]
LABELS = {"kb": "TIMETABLE", "learn": "LEARN", "wiki": "WIKI",
          "campus": "CAMPUS", "me": "ME"}

PAD = 12
LABEL_H = 26
BG = (245, 243, 238)
FG = (60, 58, 54)
TARGET_H = 900


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: _sheet_tabs.py <nova|classic> <light|dark>\n")
        return 2
    skin, theme = sys.argv[1], sys.argv[2]

    imgs = []
    for tab in TABS:
        p = os.path.join(SHOTS, "uix-%s-%s-%s.png" % (tab, skin, theme))
        if not os.path.exists(p):
            sys.stderr.write("missing: %s\n" % p)
            return 2
        im = Image.open(p).convert("RGB")
        w = int(round(im.width * (TARGET_H / float(im.height))))
        imgs.append((tab, im.resize((w, TARGET_H), Image.LANCZOS)))

    total_w = sum(im.width for _, im in imgs) + PAD * (len(imgs) + 1)
    total_h = TARGET_H + LABEL_H + PAD * 2
    out = Image.new("RGB", (total_w, total_h), BG)
    d = ImageDraw.Draw(out)

    x = PAD
    for tab, im in imgs:
        out.paste(im, (x, PAD + LABEL_H))
        d.text((x + 2, PAD + 6), "%s · %s" % (LABELS.get(tab, tab).upper(),
                                              theme.upper()), fill=FG)
        x += im.width + PAD

    name = "_v270_tabs_%s_%s.png" % (skin, theme)
    dst = os.path.join(SHOTS, name)
    out.save(dst, "PNG", optimize=True)
    print("%s %dx%d %d bytes" % (name, out.width, out.height,
                                 os.path.getsize(dst)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
