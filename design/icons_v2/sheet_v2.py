# -*- coding: utf-8 -*-
"""把 icons_v2 的候选拼成一张对比图 + 各尺寸缩略，供人眼挑。

    python -X utf8 design/icons_v2/sheet_v2.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "design", "icons_v2")
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONTB = r"C:\Windows\Fonts\msyhbd.ttc"

ITEMS = [
    ("01_plate", "A 舱铭牌", "铭牌 + 河 + 心电读数带 + HUD 十字 + 珊瑚今日点"),
    ("02_port", "B 舷窗", "圆形舷窗 + 粗刻度环 + 大河 + 珊瑚十字标记"),
    ("03_cross", "C 医十字", "镂空青绿十字托底 + 河压上，医学院最直白"),
    ("04_readout", "D 读数", "暖纸「河」+ 心电图纸带横穿下缘，最深青底"),
    ("05_pulse", "E 脉搏", "只留河 + 一道心电脉冲 + 珊瑚点，最简"),
]

CELL = 400
GAP = 30
MARGIN = 44
HEADER = 116
FOOT = 170


def main():
    cols = len(ITEMS)
    w = MARGIN * 2 + CELL * cols + GAP * (cols - 1)
    h = HEADER + CELL + FOOT + MARGIN
    sheet = Image.new("RGB", (w, h), (246, 248, 249))
    d = ImageDraw.Draw(sheet)
    ft = ImageFont.truetype(FONTB, 38)
    fn = ImageFont.truetype(FONTB, 26)
    fd = ImageFont.truetype(FONT, 18)
    d.text((MARGIN, 24), "河医大助手 2.0 · 新图标候选（医学院版，回一个字母）", font=ft, fill=(16, 24, 40))
    d.text((MARGIN, 74), "青绿心电 + 暖纸白「河」：河流波纹与生命体征共用一条线，色板与 NOVA 界面同源",
           font=fd, fill=(74, 90, 106))
    for i, (slug, name, desc) in enumerate(ITEMS):
        x = MARGIN + i * (CELL + GAP)
        y = HEADER
        p = os.path.join(OUT, slug, "preview-512.png")
        icon = Image.open(p).convert("RGBA").resize((CELL, CELL), Image.LANCZOS)
        d.rounded_rectangle([x - 10, y - 10, x + CELL + 10, y + CELL + 10], radius=30, fill=(255, 255, 255))
        sheet.paste(icon, (x, y), icon)
        d.text((x, y + CELL + 20), name, font=fn, fill=(16, 24, 40))
        line, ty = "", y + CELL + 56
        for ch in desc:
            if d.textlength(line + ch, font=fd) > CELL - 6:
                d.text((x, ty), line, font=fd, fill=(74, 90, 106))
                ty += 23
                line = ch
            else:
                line += ch
        if line:
            d.text((x, ty), line, font=fd, fill=(74, 90, 106))
        si = Image.open(os.path.join(OUT, slug, "launcher-96.png")).convert("RGBA")
        sheet.paste(si, (x, y + CELL + 112), si)
        sm = Image.open(os.path.join(OUT, slug, "launcher-48.png")).convert("RGBA")
        sheet.paste(sm, (x + 112, y + CELL + 124), sm)
        d.text((x + 176, y + CELL + 130), "96 / 48 px 实际", font=fd, fill=(120, 134, 148))
    out = os.path.join(OUT, "_v2总览.png")
    sheet.save(out, "PNG", optimize=True)
    print("OK", out, os.path.getsize(out))


if __name__ == "__main__":
    main()
