# -*- coding: utf-8 -*-
"""v2.0 图标候选 · 第二批「纸感版」（完全跳出深色舱体，走 App 的经典皮肤纸感）。

    python -X utf8 design/icons_v2/gen_v3.py

配色与 App 内经典皮肤同源（web/app.css :root）：
    纸 #EFE2C8 / 卡面 #FAF3E2 / 墨 #3B3225 / 铅笔 #9C8B70
    砖红 #B23B26 / 牛仔蓝 #2C5C7A / 沙金 #D9A32B / 仙人掌绿 #4E7A48

设计立场：这一批不做「深色玻璃舱」，做**牛皮纸上的手写笔记 / 处方笺 / 印章**。
医学语义用三样东西表达，全部能过 48px：
    ① 十字（印章、绷带、校徽上的「+」）  ② ECG 一行  ③ 双环 / 圆章（校徽语言）
「河」始终是主语，字高 ≥0.44S，实心 simhei，跨机一致。
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "design", "icons_v2")
FONT_HEI = r"C:\Windows\Fonts\simhei.ttf"

S = 2048

PAPER = (239, 226, 200)     # #EFE2C8
PAPER2 = (250, 243, 226)    # #FAF3E2
INK = (59, 50, 37)          # #3B3225
INK2 = (106, 88, 66)
PENCIL = (156, 139, 112)
RED = (178, 59, 38)         # #B23B26
BLUE = (44, 92, 122)        # #2C5C7A
GOLD = (217, 163, 43)       # #D9A32B
GREEN = (78, 122, 72)       # #4E7A48

SCHEMES = [
    ("01_stamp", "A 纸印章", "牛皮纸 + 砖红双环章 + 墨「河」+ 环顶绿十字 + 沙金波纹"),
    ("02_rx", "B 处方笺", "纸卡 + 砖红侧边 + 淡蓝格线 + 墨「河」+ 红章白十字"),
    ("03_pencil", "C 铅笔十字", "手绘抖动粗十字（仙人掌绿）+ 墨「河」压心 + 硬投影"),
    ("04_river", "D 河与脉搏", "墨「河」+ 三道河线，中间那道突起成心电"),
    ("05_bandage", "E 绷带十字", "纸白粗十字 + 砖红描边 + 砖红「河」，最直白"),
    ("06_seal", "F 校徽", "墨色圆环 + 纸白内圈 + 墨「河」+ 顶红十字 + 底波纹"),
]


# ---------------------------------------------------------------- 基础
def lerp(a, b, t):
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def diag_gradient(size, c0, c1, angle=-70.0):
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    projs = [0.0, size * ca, size * sa, size * (ca + sa)]
    lo, hi = min(projs), max(projs)
    span = (hi - lo) or 1.0
    img = Image.new("RGB", (size, size))
    px = img.load()
    lut = [lerp(c0, c1, x / float(size - 1)) for x in range(size)]
    for y in range(size):
        base = y * sa
        for x in range(size):
            p = (x * ca + base - lo) / span
            px[x, y] = lut[0 if p < 0 else (size - 1 if p > 1 else int(p * (size - 1)))]
    return img


def paper_noise(img, amount=15, seed=7):
    """纸纹：低分辨率随机点放大，避免逐像素拖慢。"""
    rnd = random.Random(seed)
    small = Image.new("L", (S // 5, S // 5), 128)
    px = small.load()
    w, h = small.size
    for y in range(h):
        for x in range(w):
            px[x, y] = 128 + rnd.randint(-amount, amount)
    grain = small.resize((S, S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2))
    lay = Image.new("RGBA", (S, S), (120, 104, 78, 255))
    lay.putalpha(grain.point(lambda v: max(0, min(26, abs(v - 128) // 3))))
    return Image.alpha_composite(img, lay)


def paper_bg(c0=PAPER2, c1=PAPER, angle=-70.0, noise=15):
    img = diag_gradient(S, c0, c1, angle).convert("RGBA")
    img = paper_noise(img, noise)
    # 四角轻微压深，让圆角边有厚度
    g = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(g)
    for i in range(20):
        t = i / 20.0
        r = S * (0.86 - 0.58 * t)
        d.ellipse([S / 2 - r * 1.35, S / 2 - r * 1.35, S / 2 + r * 1.35, S / 2 + r * 1.35],
                  outline=int(52 * t ** 2), width=int(S * 0.09))
    g = g.filter(ImageFilter.GaussianBlur(S * 0.03))
    dark = Image.new("RGBA", (S, S), (110, 92, 66, 255))
    dark.putalpha(g)
    return Image.alpha_composite(img, dark)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius), fill=255)
    return m


def glyph_mask(ch, target_h, target_w=None, font_path=FONT_HEI):
    px = 1500
    f = ImageFont.truetype(font_path, px)
    tmp = Image.new("L", (px * 2, px * 2), 0)
    ImageDraw.Draw(tmp).text((px, px), ch, font=f, fill=255, anchor="mm")
    tmp = tmp.crop(tmp.getbbox())
    w, h = tmp.size
    k = target_h / float(h)
    if target_w is not None and w * k > target_w:
        k = target_w / float(w)
    return tmp.resize((max(1, int(round(w * k))), max(1, int(round(h * k)))), Image.LANCZOS)


def put(base, layer, cx, cy):
    base.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))


def solid(mask, color, alpha=255):
    out = Image.new("RGBA", mask.size, tuple(color) + (alpha,))
    out.putalpha(mask if alpha == 255 else mask.point(lambda v: v * alpha // 255))
    return out


def hard_shadow(base, mask, cx, cy, color=INK, alpha=34, dx=0.013, dy=0.015):
    """西部涂鸦纪律：硬偏移投影，不模糊。"""
    sh = Image.new("RGBA", mask.size, tuple(color) + (0,))
    sh.putalpha(mask.point(lambda v: v * alpha // 255))
    base.alpha_composite(sh, (int(cx - mask.width / 2 + S * dx), int(cy - mask.height / 2 + S * dy)))


def ink_glyph(base, ch, h, cx, cy, color=INK, shadow=True, halo=None, halo_w=0.010):
    m = glyph_mask(ch, int(S * h))
    if halo is not None:
        grow = m.filter(ImageFilter.MaxFilter(max(3, (int(S * halo_w) | 1))))
        put(base, solid(grow, halo, 255), cx, cy)
    if shadow:
        hard_shadow(base, m, cx, cy)
    put(base, solid(m, color, 255), cx, cy)
    return m


def wobble_line(d, p0, p1, color, width, amp=0.004, seed=3, seg=26):
    """手绘感直线：沿法线加轻微 sin 抖动。"""
    rnd = random.Random(seed)
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / ln, dx / ln
    ph = rnd.uniform(0, 6.28)
    pts = []
    for i in range(seg + 1):
        t = i / float(seg)
        k = math.sin(ph + t * 5.2) * amp * S + rnd.uniform(-amp, amp) * S * 0.35
        pts.append((x0 + dx * t + nx * k, y0 + dy * t + ny * k))
    d.line(pts, fill=color, width=width, joint="curve")


def ecg_points(x0, x1, y_base, amp, n=460, beats=1.0, phase=0.0):
    pts = []
    for i in range(n + 1):
        t = i / float(n)
        u = (t * beats + phase) % 1.0
        if u < 0.28:
            v = 0.0
        elif u < 0.33:
            v = -0.14 * (u - 0.28) / 0.05
        elif u < 0.37:
            v = -0.14 + 1.20 * (u - 0.33) / 0.04
        elif u < 0.41:
            v = 1.06 - 1.72 * (u - 0.37) / 0.04
        elif u < 0.47:
            v = -0.66 + 0.66 * (u - 0.41) / 0.06
        elif u < 0.58:
            v = 0.0
        elif u < 0.72:
            v = 0.30 * math.sin((u - 0.58) / 0.14 * math.pi)
        else:
            v = 0.0
        pts.append((x0 + (x1 - x0) * t, y_base - v * amp))
    return pts


def cross(d, cx, cy, arm, w, color):
    d.line([(cx - arm, cy), (cx + arm, cy)], fill=color, width=w)
    d.line([(cx, cy - arm), (cx, cy + arm)], fill=color, width=w)


# ---------------------------------------------------------------- A 纸印章
def scheme_stamp():
    img = paper_bg()
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = S * 0.5
    r_out = S * 0.352
    # 双环（砖红，粗环 0.030S 是 48px 的底线）
    d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], outline=RED + (255,), width=int(S * 0.030))
    r_in = S * 0.292
    d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], outline=RED + (150,), width=int(S * 0.009))

    m = glyph_mask("河", int(S * 0.375), target_w=int(S * 0.42))
    hard_shadow(img, m, cx, cy + S * 0.006, alpha=28, dx=0.008, dy=0.010)
    put(img, solid(m, INK, 255), cx, cy + S * 0.006)

    # 环顶缺口放绿十字（医学标记），用纸色挖掉一段环
    gap = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gap, "RGBA")
    gd.ellipse([cx - r_out - S * 0.05, cy - r_out - S * 0.05, cx + r_out + S * 0.05, cy + r_out + S * 0.05],
               fill=(0, 0, 0, 0))
    # 直接画一段纸色弧覆盖顶部
    d.arc([cx - r_out, cy - r_out, cx + r_out, cy + r_out], 258, 282, fill=PAPER2 + (255,),
          width=int(S * 0.052))
    cross(d, cx, cy - r_out, int(S * 0.045), int(S * 0.016), GREEN + (255,))
    d.ellipse([cx - S * 0.010, cy - r_out - S * 0.010, cx + S * 0.010, cy - r_out + S * 0.010],
              fill=GREEN + (255,))

    # 底部三道沙金波纹
    for i, y in enumerate((0.812, 0.858, 0.902)):
        wdt = int(S * (0.012 - i * 0.002))
        pts = [(S * 0.300 + S * 0.400 * t / 24.0,
                S * y + math.sin(t / 24.0 * math.pi * 4 + i) * S * 0.012) for t in range(25)]
        d.line(pts, fill=GOLD + (200 - i * 40,), width=wdt, joint="curve")
    return img


# ---------------------------------------------------------------- B 处方笺
def scheme_rx():
    img = paper_bg(PAPER2, PAPER, -66.0, 12)
    d = ImageDraw.Draw(img, "RGBA")
    # 砖红侧边
    d.rectangle([0, 0, int(S * 0.088), S], fill=RED + (255,))
    d.rectangle([int(S * 0.088), 0, int(S * 0.098), S], fill=RED + (60,))
    # 淡蓝格线
    for i in range(7):
        y = int(S * (0.245 + i * 0.098))
        d.line([(int(S * 0.165), y), (S - int(S * 0.075), y)], fill=BLUE + (44,), width=int(S * 0.0055))
    ink_glyph(img, "河", 0.480, S * 0.585, S * 0.505, color=INK)
    # 右下红章：实心圆 + 纸白十字
    r = int(S * 0.098)
    ox, oy = int(S * 0.792), int(S * 0.792)
    d.ellipse([ox - r, oy - r, ox + r, oy + r], fill=RED + (255,))
    cross(d, ox, oy, int(r * 0.56), int(S * 0.020), PAPER2 + (255,))
    return img


# ---------------------------------------------------------------- C 铅笔十字
def scheme_pencil():
    img = paper_bg(PAPER2, PAPER, -72.0, 16)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = S * 0.5
    arm_w = S * 0.200
    arm_l = S * 0.318
    seg = 22
    for sign in (1, -1):
        # 竖臂两边
        wobble_line(d, (cx - arm_w / 2, cy - arm_l * sign), (cx - arm_w / 2, cy + arm_l * sign),
                    GREEN + (235,), int(S * 0.019), 0.0035, seed=11 + sign)
        wobble_line(d, (cx + arm_w / 2, cy - arm_l * sign), (cx + arm_w / 2, cy + arm_l * sign),
                    GREEN + (235,), int(S * 0.019), 0.0035, seed=21 + sign)
        wobble_line(d, (cx - arm_l * sign, cy - arm_w / 2), (cx + arm_l * sign, cy - arm_w / 2),
                    GREEN + (235,), int(S * 0.019), 0.0035, seed=31 + sign)
        wobble_line(d, (cx - arm_l * sign, cy + arm_w / 2), (cx + arm_l * sign, cy + arm_w / 2),
                    GREEN + (235,), int(S * 0.019), 0.0035, seed=41 + sign)
    # 十字内部淡绿填充（用矩形两块，边缘由抖动线覆盖）
    fillc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fillc, "RGBA")
    fd.rectangle([cx - arm_w / 2, cy - arm_l, cx + arm_w / 2, cy + arm_l], fill=(78, 122, 72, 58))
    fd.rectangle([cx - arm_l, cy - arm_w / 2, cx + arm_l, cy + arm_w / 2], fill=(78, 122, 72, 58))
    img = Image.alpha_composite(img, fillc)

    ink_glyph(img, "河", 0.455, cx, cy + S * 0.004, color=INK, halo=PAPER2, halo_w=0.014)
    return img


# ---------------------------------------------------------------- D 河与脉搏
def scheme_river():
    img = paper_bg(PAPER2, PAPER, -74.0, 14)
    ink_glyph(img, "河", 0.440, S * 0.5, S * 0.378, color=INK)

    d = ImageDraw.Draw(img, "RGBA")
    # 上两道平流
    for y, col, wd in ((0.712, RED, 0.016), (0.766, BLUE, 0.012)):
        pts = [(S * 0.160 + S * 0.680 * t / 30.0,
                S * y + math.sin(t / 30.0 * math.pi * 3.4) * S * 0.013) for t in range(31)]
        d.line(pts, fill=col + (240,), width=int(S * wd), joint="curve")
    # 第三道：前半平流，中段起心电
    base = S * 0.845
    flat = [(S * 0.160 + S * 0.300 * t / 12.0,
             base + math.sin(t / 12.0 * math.pi * 2.2) * S * 0.011) for t in range(13)]
    d.line(flat, fill=GOLD + (235,), width=int(S * 0.011), joint="curve")
    ecg = ecg_points(S * 0.460, S * 0.860, base, S * 0.108, 380, 1.0, 0.10)
    gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gl, "RGBA").line(ecg, fill=GOLD + (150,), width=int(S * 0.030), joint="curve")
    img = Image.alpha_composite(img, gl.filter(ImageFilter.GaussianBlur(S * 0.010)))
    d = ImageDraw.Draw(img, "RGBA")
    d.line(ecg, fill=GOLD + (250,), width=int(S * 0.013), joint="curve")
    r = int(S * 0.021)
    d.ellipse([S * 0.885 - r, base - r, S * 0.885 + r, base + r], fill=RED + (255,))
    return img


# ---------------------------------------------------------------- E 绷带十字
def scheme_bandage():
    img = paper_bg(PAPER2, PAPER, -68.0, 13)
    cx = cy = S * 0.5
    arm_w = S * 0.225
    arm_l = S * 0.330
    rad = int(S * 0.055)

    plate = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate, "RGBA")
    bars = [
        [cx - arm_w / 2, cy - arm_l, cx + arm_w / 2, cy + arm_l],
        [cx - arm_l, cy - arm_w / 2, cx + arm_l, cy + arm_w / 2],
    ]
    for b in bars:
        pd.rounded_rectangle(b, radius=rad, fill=PAPER2 + (255,))
    for b in bars:
        pd.rounded_rectangle(b, radius=rad, outline=RED + (255,), width=int(S * 0.020))

    # 硬投影（整体一块）
    sh = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(sh)
    for b in bars:
        sd.rounded_rectangle(b, radius=rad, fill=255)
    shadow = Image.new("RGBA", (S, S), INK + (0,))
    shadow.putalpha(sh.point(lambda v: v * 30 // 255))
    img.alpha_composite(shadow, (int(S * 0.014), int(S * 0.016)))

    img = Image.alpha_composite(img, plate)
    d = ImageDraw.Draw(img, "RGBA")
    # 四条纱布折线（细，做材质）
    for off in (-0.060, 0.060):
        d.line([(cx + S * off, cy - arm_w / 2 + S * 0.026), (cx + S * off, cy + arm_w / 2 - S * 0.026)],
               fill=RED + (40,), width=int(S * 0.006))
        d.line([(cx - arm_w / 2 + S * 0.026, cy + S * off), (cx + arm_w / 2 - S * 0.026, cy + S * off)],
               fill=RED + (40,), width=int(S * 0.006))

    ink_glyph(img, "河", 0.440, cx, cy + S * 0.004, color=RED, halo=None)
    return img


# ---------------------------------------------------------------- F 校徽
def scheme_seal():
    img = paper_bg(PAPER2, PAPER, -72.0, 12)
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy = S * 0.5, S * 0.470
    r = S * 0.330
    # 硬投影
    sh = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sh).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    shadow = Image.new("RGBA", (S, S), INK + (0,))
    shadow.putalpha(sh.point(lambda v: v * 30 // 255))
    img.alpha_composite(shadow, (int(S * 0.013), int(S * 0.015)))
    img = img.copy()

    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK + (255,))
    r2 = S * 0.288
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=PAPER2 + (255,))
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=INK + (255,), width=int(S * 0.010))

    ink_glyph(img, "河", 0.360, cx, cy - S * 0.012, color=INK, shadow=False)

    d = ImageDraw.Draw(img, "RGBA")
    cross(d, cx, cy - r - S * 0.030, int(S * 0.046), int(S * 0.017), RED + (255,))
    for i, yy in enumerate((0.872, 0.916)):
        pts = [(S * 0.330 + S * 0.340 * t / 22.0,
                S * yy + math.sin(t / 22.0 * math.pi * 3.2 + i) * S * 0.011) for t in range(23)]
        d.line(pts, fill=GOLD + (210 - i * 60,), width=int(S * (0.011 - i * 0.002)), joint="curve")
    return img


BUILDERS = {
    "01_stamp": scheme_stamp,
    "02_rx": scheme_rx,
    "03_pencil": scheme_pencil,
    "04_river": scheme_river,
    "05_bandage": scheme_bandage,
    "06_seal": scheme_seal,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    sizes = [48, 72, 96, 144, 192, 512]
    mask = rounded_mask(S, 0.225)
    for slug, label, _ in SCHEMES:
        img = BUILDERS[slug]()
        flat = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        flat.paste(img.convert("RGB"), (0, 0))
        flat.putalpha(mask)
        folder = os.path.join(OUT, slug)
        os.makedirs(folder, exist_ok=True)
        for s in sizes:
            flat.resize((s, s), Image.LANCZOS).save(
                os.path.join(folder, "launcher-%d.png" % s), "PNG", optimize=True)
        flat.resize((512, 512), Image.LANCZOS).save(
            os.path.join(folder, "preview-512.png"), "PNG", optimize=True)
        print("OK %-12s %d" % (slug, os.path.getsize(os.path.join(folder, "preview-512.png"))))


if __name__ == "__main__":
    main()
