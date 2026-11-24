# -*- coding: utf-8 -*-
"""第二批（纸感版）对比图。

    python -X utf8 design/icons_v2/sheet_v3.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "design", "icons_v2")
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONTB = r"C:\Windows\Fonts\msyhbd.ttc"

ITEMS = [
    ("01_stamp", "A 纸印章", "牛皮纸底 + 砖红双环章 + 墨河 + 环顶绿十字"),
    ("02_rx", "B 处方笺", "纸卡 + 砖红侧边 + 淡蓝格线 + 墨河 + 红章白十字"),
    ("03_pencil", "C 铅笔十字", "手绘抖动绿十字 + 墨河压心 + 硬偏移投影"),
    ("04_river", "D 河与脉搏", "墨河 + 三道河线，第三道突起成心电"),
    ("05_bandage", "E 绷带十字", "纸白粗十字 + 砖红描边 + 砖红河，最直白"),
    ("06_seal", "F 校徽", "墨色圆章 + 纸白内圈 + 墨河 + 顶红十字 + 底波纹"),
]

CELL = 330
GAP = 26
MARGIN = 42
HEADER = 122
FOOT = 168


def main():
    cols = 3
    rows = (len(ITEMS) + cols - 1) // cols
    w = MARGIN * 2 + CELL * cols + GAP * (cols - 1)
    h = HEADER + rows * (CELL + FOOT) + MARGIN
    sheet = Image.new("RGB", (w, h), (248, 249, 250))
    d = ImageDraw.Draw(sheet)
    ft = ImageFont.truetype(FONTB, 36)
    fn = ImageFont.truetype(FONTB, 25)
    fd = ImageFont.truetype(FONT, 17)
    d.text((MARGIN, 24), "河医大助手 2.0 · 新图标候选 · 第二批（纸感版，回一个字母）", font=ft, fill=(16, 24, 40))
    d.text((MARGIN, 72), "完全跳出深色玻璃舱：用 App 自己的经典皮肤——牛皮纸、墨线、砖红印、铅笔十字",
           font=fd, fill=(74, 90, 106))
    for i, (slug, name, desc) in enumerate(ITEMS):
        cx = i % cols
        cy = i // cols
        x = MARGIN + cx * (CELL + GAP)
        y = HEADER + cy * (CELL + FOOT)
        icon = Image.open(os.path.join(OUT, slug, "preview-512.png")).convert("RGBA").resize(
            (CELL, CELL), Image.LANCZOS)
        d.rounded_rectangle([x - 9, y - 9, x + CELL + 9, y + CELL + 9], radius=26, fill=(255, 255, 255))
        sheet.paste(icon, (x, y), icon)
        d.text((x, y + CELL + 18), name, font=fn, fill=(16, 24, 40))
        line, ty = "", y + CELL + 52
        for ch in desc:
            if d.textlength(line + ch, font=fd) > CELL - 4:
                d.text((x, ty), line, font=fd, fill=(74, 90, 106))
                ty += 22
                line = ch
            else:
                line += ch
        if line:
            d.text((x, ty), line, font=fd, fill=(74, 90, 106))
        si = Image.open(os.path.join(OUT, slug, "launcher-96.png")).convert("RGBA")
        sheet.paste(si, (x, y + CELL + 108), si)
        sm = Image.open(os.path.join(OUT, slug, "launcher-48.png")).convert("RGBA")
        sheet.paste(sm, (x + 112, y + CELL + 120), sm)
        d.text((x + 176, y + CELL + 126), "96 / 48 px 实际", font=fd, fill=(120, 134, 148))
    out = os.path.join(OUT, "_v3总览.png")
    sheet.save(out, "PNG", optimize=True)
    print("OK", out, os.path.getsize(out))


if __name__ == "__main__":
    main()
