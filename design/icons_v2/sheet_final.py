# -*- coding: utf-8 -*-
"""定稿批对比图（8 个）。

    python -X utf8 design/icons_v2/sheet_final.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "design", "icons_v2")
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONTB = r"C:\Windows\Fonts\msyhbd.ttc"

ITEMS = [
    ("01_stamp", "A 纸印章", "牛皮纸 + 砖红双环章 + 墨河压心 + 环顶绿十字垫纸盘 + 沙金三波纹"),
    ("02_rx", "B 处方笺", "纸卡 + 砖红侧脊 + 淡蓝六格线 + 墨河偏右 + 红章白十字压在右下"),
    ("03_pencil", "C 折纸十字", "四条绿臂分开画、中央留方洞，臂内一道纸白笔缝；墨河压在洞心"),
    ("04_river", "D 河与脉搏", "墨河居中 + 两条河线 + 第三条金线中段突起成 ECG，尾点收红"),
    ("05_bandage", "E 绷带十字", "纸白粗十字砖红描边 + 臂内四条纱布折线 + 砖红河，形最像贴纸"),
    ("06_seal", "F 校徽", "墨色实心圆章 + 纸白内圈 + 墨河 + 顶上红十字 + 底两道金波纹"),
    ("07_ink", "G 墨迹", "墨晕肌理铺底 + 大墨河（全批最大字）+ 底部金线 + 红圆印收尾"),
    ("08_green", "H 绿十字反白", "实心仙人掌绿十字 + 纸白河反白 + 深绿细描边，最素最清楚"),
]

CELL = 300
GAP = 24
MARGIN = 40
HEADER = 118
FOOT = 152


def main():
    cols = 4
    rows = (len(ITEMS) + cols - 1) // cols
    w = MARGIN * 2 + CELL * cols + GAP * (cols - 1)
    h = HEADER + rows * (CELL + FOOT) + MARGIN
    sheet = Image.new("RGB", (w, h), (248, 249, 250))
    d = ImageDraw.Draw(sheet)
    ft = ImageFont.truetype(FONTB, 34)
    fn = ImageFont.truetype(FONTB, 24)
    fd = ImageFont.truetype(FONT, 16)
    d.text((MARGIN, 22), "河医大助手 2.0 · 新图标 · 定稿批 8 个（回一个字母即可）", font=ft, fill=(16, 24, 40))
    d.text((MARGIN, 68), "统一走你 App 的经典皮肤：牛皮纸 / 墨线 / 砖红印 / 铅笔绿。医学语义只用十字、ECG、圆章三件东西。",
           font=fd, fill=(74, 90, 106))
    d.text((MARGIN, 90), "十字全改成单条十二点路径画，不再有两个矩形叠出的穿心内线。", font=fd, fill=(120, 134, 148))

    for i, (slug, name, desc) in enumerate(ITEMS):
        cx = i % cols
        cy = i // cols
        x = MARGIN + cx * (CELL + GAP)
        y = HEADER + cy * (CELL + FOOT)
        icon = Image.open(os.path.join(OUT, slug, "preview-512.png")).convert("RGBA").resize((CELL, CELL), Image.LANCZOS)
        d.rounded_rectangle([x - 8, y - 8, x + CELL + 8, y + CELL + 8], radius=24, fill=(255, 255, 255))
        sheet.paste(icon, (x, y), icon)
        d.text((x, y + CELL + 14), name, font=fn, fill=(16, 24, 40))
        line, ty = "", y + CELL + 44
        for ch in desc:
            if d.textlength(line + ch, font=fd) > CELL + 6:
                d.text((x, ty), line, font=fd, fill=(74, 90, 106))
                ty += 20
                line = ch
            else:
                line += ch
        if line:
            d.text((x, ty), line, font=fd, fill=(74, 90, 106))
        si = Image.open(os.path.join(OUT, slug, "launcher-96.png")).convert("RGBA")
        sheet.paste(si, (x, y + CELL + 96), si)
        sm = Image.open(os.path.join(OUT, slug, "launcher-48.png")).convert("RGBA")
        sheet.paste(sm, (x + 108, y + CELL + 108), sm)
        d.text((x + 170, y + CELL + 114), "96 / 48 实际", font=fd, fill=(120, 134, 148))

    out = os.path.join(OUT, "_final总览.png")
    sheet.save(out, "PNG", optimize=True)
    print("OK", out, os.path.getsize(out))


if __name__ == "__main__":
    main()
