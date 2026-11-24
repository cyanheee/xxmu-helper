# -*- coding: utf-8 -*-
"""v2.0 图标候选生成器（第三版：医学院语言）。

只写 design/icons_v2/，不碰 android/res、不碰 web/、不碰线上。
母版 2048 绘制，LANCZOS 降到 48/72/96/144/192/512。

    python -X utf8 design/icons_v2/gen_v2.py

医学符号取舍（重要，别再改错方向）：
  * 用 **ECG 心电波形**替掉原来的「水位波形」——一图两义：河流的波纹 + 生命体征，
    而且 ECG 本来就是仪器读数语言，和 NOVA 的 HUD 完全同源。
  * 用 **青绿细线十字准星**（HUD 定位标），不用实心红十字：
    红十字是日内瓦公约专用标志，实心块还会被当成药店 / 通用医疗 App。
  * C 案用「镂空十字托底」——医学院属性最直白，48px 也能认。
  * 不画蛇杖 / 听诊器 / 白大褂 / DNA：48px 里全变噪点。
  * 「河」仍是主语（校名首字，辨识度最高），医学是第二层语义。

可读性硬标准（前两轮踩过的坑）：
  1. 字高 ≥ 0.45S；2. 装饰线宽 ≥ 0.012S；3. 不给字形加高斯黑影；
  4. 不画密阵（>10 格必糊）；5. 弧形高光两端渐隐；6. 描边字必须有淡内衬。
"""
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "design", "icons_v2")
FONT_HEI = r"C:\Windows\Fonts\simhei.ttf"

S = 2048

DEEP = (22, 48, 60)       # #16303C
DEEP2 = (11, 27, 37)
GLASS = (18, 42, 56)      # #122A38
PAPER = (242, 233, 218)   # #F2E9DA --n-tape
PAPER_HI = (255, 252, 245)
CYAN = (53, 224, 208)     # #35E0D0
CYAN_D = (29, 128, 120)
CYAN_MID = (27, 85, 96)
CORAL = (255, 92, 122)    # #FF5C7A

SCHEMES = [
    ("01_plate", "A 舱铭牌", "铭牌 + 「河」+ ECG 读数带 + HUD 十字 + 珊瑚今日点"),
    ("02_port", "B 舷窗", "圆形舷窗 + 刻度环 + 大「河」+ 珊瑚十字标记"),
    ("03_cross", "C 医十字", "镂空十字托底 + 「河」压上，医学院最直白"),
    ("04_readout", "D 读数", "描边「河」+ 心电图纸刻度带"), 
    ("05_pulse", "E 脉搏", "只留「河」+ 一道 ECM 脉冲线 + 珊瑚点，最简"),
]


# ---------------------------------------------------------------- 基础
def lerp(a, b, t):
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def diag_gradient(size, c0, c1, angle=-58.0):
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


def soft_glow_mask(size, center, radius, strength=110):
    g = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(g)
    steps = 28
    for i in range(steps, 0, -1):
        t = i / float(steps)
        r = radius * t
        d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r],
                  fill=int(strength * (1 - t) ** 1.8))
    return g.filter(ImageFilter.GaussianBlur(size * 0.012))


def add_glow(img, center, radius, color, strength=110):
    g = soft_glow_mask(S, center, radius, strength)
    layer = Image.new("RGBA", (S, S), tuple(color) + (255,))
    layer.putalpha(g)
    return Image.alpha_composite(img, layer)


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


def fill_grad(mask, c0, c1, angle=-70.0):
    w, h = mask.size
    g = diag_gradient(max(w, h), c0, c1, angle).resize((w, h), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    return out


def put(base, layer, cx, cy):
    base.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))


def scanlines(img, step=15, alpha=7):
    ov = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for y in range(0, S, step):
        d.line([(0, y), (S, y)], fill=(255, 255, 255, alpha), width=max(1, step // 6))
    return Image.alpha_composite(img, ov)


def vignette(img, strength=94):
    g = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(g)
    for i in range(26):
        t = i / 26.0
        r = S * (0.80 - 0.52 * t)
        d.ellipse([S / 2 - r * 1.3, S / 2 - r * 1.3, S / 2 + r * 1.3, S / 2 + r * 1.3],
                  outline=int(strength * t ** 2.0), width=int(S * 0.10))
    g = g.filter(ImageFilter.GaussianBlur(S * 0.025))
    dark = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    dark.putalpha(g)
    return Image.alpha_composite(img, dark)


def base_canvas(glow_at=(0.30, 0.14), glow_r=0.80, glow_col=CYAN, glow_s=46):
    img = diag_gradient(S, DEEP, DEEP2, -58.0).convert("RGBA")
    return add_glow(img, (int(S * glow_at[0]), int(S * glow_at[1])), int(S * glow_r), glow_col, glow_s)


def hud_cross(d, cx, cy, arm, w, color):
    """HUD 定位十字（细线，不是实心红十字）。"""
    d.line([(cx - arm, cy), (cx + arm, cy)], fill=color, width=w)
    d.line([(cx, cy - arm), (cx, cy + arm)], fill=color, width=w)


def hud_corner(d, x, y, arm, w, color, sx=1, sy=1):
    d.line([(x, y + arm * sy), (x, y), (x + arm * sx, y)], fill=color, width=w)


# ---------------------------------------------------------------- ECG
def ecg_points(x0, x1, y_base, amp, n=420, beats=1.0, phase=0.0):
    """QRS 复合波 + T 波。返回折线点；beats 可让小尺寸只放一个尖峰。"""
    pts = []
    for i in range(n + 1):
        t = i / float(n)
        u = (t * beats + phase) % 1.0
        v = 0.0
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
        x = x0 + (x1 - x0) * t
        y = y_base - v * amp
        pts.append((x, y))
    return pts


def draw_ecg(img, x0, x1, y_base, amp, color, width, beats=1.0, phase=0.0, glow=True):
    pts = ecg_points(x0, x1, y_base, amp, 520, beats, phase)
    if glow:
        gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(gl).line(pts, fill=tuple(color) + (200,), width=int(width * 2.6), joint="curve")
        img = Image.alpha_composite(img, gl.filter(ImageFilter.GaussianBlur(S * 0.012)))
    d = ImageDraw.Draw(img, "RGBA")
    d.line(pts, fill=tuple(color) + (245,), width=width, joint="curve")
    return img


# ---------------------------------------------------------------- A 舱铭牌
def scheme_plate():
    img = base_canvas()
    inset = int(S * 0.105)
    box = [inset, inset, S - inset, S - inset]
    plate = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate, "RGBA")
    pd.rounded_rectangle(box, radius=int(S * 0.100), fill=(28, 60, 75, 188))
    pd.rounded_rectangle(box, radius=int(S * 0.100), outline=CYAN + (38,), width=int(S * 0.007))
    img = Image.alpha_composite(img, plate)

    m = glyph_mask("河", int(S * 0.500), target_w=int(S * 0.60))
    put(img, fill_grad(m, PAPER_HI, PAPER, -72.0), S * 0.5, S * 0.395)

    # ECG 读数带
    img = draw_ecg(img, S * 0.255, S * 0.720, S * 0.742, S * 0.088, CYAN, int(S * 0.014), beats=1.6, phase=0.06)

    d = ImageDraw.Draw(img, "RGBA")
    r = int(S * 0.024)
    dx, dy = int(S * 0.762), int(S * 0.742)
    d.ellipse([dx - r, dy - r, dx + r, dy + r], fill=CORAL + (255,))

    # HUD 角标 + 十字准星（铭牌内侧右上）
    b = int(S * 0.030)
    hud_corner(d, inset + b, inset + b, int(S * 0.085), int(S * 0.011), CYAN + (170,), sx=1, sy=1)
    hud_corner(d, S - inset - b, S - inset - b, int(S * 0.085), int(S * 0.011), CYAN + (170,), sx=-1, sy=-1)
    hud_cross(d, S - inset - int(S * 0.105), inset + int(S * 0.105), int(S * 0.030), int(S * 0.010), CYAN + (150,))

    img = scanlines(img, int(S * 0.0075), 7)
    return vignette(img, 92)


# ---------------------------------------------------------------- B 舷窗
def scheme_port():
    img = base_canvas(glow_at=(0.60, 0.20), glow_r=0.66, glow_col=CYAN, glow_s=38)
    cx = cy = S * 0.5
    R = S * 0.350
    seal = int(S * 0.032)

    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([cx - R - seal, cy - R - seal, cx + R + seal, cy + R + seal], fill=(26, 56, 70, 236))
    d.ellipse([cx - R - seal, cy - R - seal, cx + R + seal, cy + R + seal],
              outline=CYAN + (60,), width=int(S * 0.009))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(13, 32, 44, 255))

    inner = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    inner = add_glow(inner, (int(cx - R * 0.28), int(cy - R * 0.32)), int(R * 0.92), (48, 96, 114), 88)
    mk = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mk).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    inner.putalpha(ImageChops.multiply(inner.split()[3], mk))
    img = Image.alpha_composite(img, inner)

    d = ImageDraw.Draw(img, "RGBA")
    n = 24
    for i in range(n):
        a = math.radians(-90 + i * 360.0 / n)
        big = (i % 2 == 0)
        r1 = R + S * 0.050
        r2 = R + S * (0.108 if big else 0.080)
        col = CYAN + ((200,) if big else (116,))
        wd = int(S * (0.014 if big else 0.011))
        if i == 3:
            continue  # 该位留给珊瑚十字
        d.line([(cx + math.cos(a) * r1, cy + math.sin(a) * r1),
                (cx + math.cos(a) * r2, cy + math.sin(a) * r2)], fill=col, width=wd)
    # 珊瑚十字标记（正上方偏右一格）
    a = math.radians(-90 + 3 * 360.0 / 24)
    mr = R + S * 0.085
    mx, my = cx + math.cos(a) * mr, cy + math.sin(a) * mr
    hud_cross(d, mx, my, int(S * 0.024), int(S * 0.010), CORAL + (255,))

    m = glyph_mask("河", int(S * 0.470), target_w=int(S * 0.52))
    put(img, fill_grad(m, PAPER_HI, PAPER, -72.0), cx, cy + S * 0.004)

    # 两端渐隐高光
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl, "RGBA").arc(
        [cx - R * 0.80, cy - R * 0.80, cx + R * 0.80, cy + R * 0.80], 200, 260,
        fill=(255, 255, 255, 46), width=int(S * 0.022))
    fade = Image.new("L", (S, S), 0)
    fd = ImageDraw.Draw(fade)
    for i in range(5):
        fd.arc([cx - R * 0.80, cy - R * 0.80, cx + R * 0.80, cy + R * 0.80],
               200 + i * 12, 212 + i * 12, fill=200 - i * 30, width=int(S * 0.022))
    hl.putalpha(ImageChops.multiply(hl.split()[3], fade.filter(ImageFilter.GaussianBlur(S * 0.026))))
    img = Image.alpha_composite(img, hl)

    img = scanlines(img, int(S * 0.0075), 6)
    return vignette(img, 82)


# ---------------------------------------------------------------- C 医十字
def scheme_cross():
    img = base_canvas(glow_at=(0.50, 0.42), glow_r=0.84, glow_col=CYAN, glow_s=42)
    cx = cy = S * 0.5
    arm_w = S * 0.205        # 十字臂宽
    arm_len = S * 0.300      # 臂长（半）
    rad = int(S * 0.048)

    # 十字托底：压暗的青绿实心 + 细亮边（不抢「河」，48px 仍有轮廓）
    plate = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate, "RGBA")
    col = (21, 74, 82, 255)
    bars = [
        [cx - arm_w / 2, cy - arm_len, cx + arm_w / 2, cy + arm_len],
        [cx - arm_len, cy - arm_w / 2, cx + arm_len, cy + arm_w / 2],
    ]
    for b in bars:
        pd.rounded_rectangle(b, radius=rad, fill=col)
    for b in bars:
        pd.rounded_rectangle(b, radius=rad, outline=CYAN + (120,), width=int(S * 0.009))
    img = Image.alpha_composite(img, plate)

    m = glyph_mask("河", int(S * 0.455), target_w=int(S * 0.60))
    put(img, fill_grad(m, PAPER_HI, PAPER, -72.0), cx, cy)

    d = ImageDraw.Draw(img, "RGBA")
    r = int(S * 0.022)
    dx, dy = int(S * 0.800), int(S * 0.800)
    d.ellipse([dx - r, dy - r, dx + r, dy + r], fill=CORAL + (255,))

    img = scanlines(img, int(S * 0.0075), 7)
    return vignette(img, 96)


# ---------------------------------------------------------------- D 读数
def scheme_readout():
    img = base_canvas(glow_at=(0.5, 0.36), glow_r=0.86, glow_col=CYAN, glow_s=38)
    # 上半：暖纸白实心「河」（不再用描边字，48px 留得住）
    m = glyph_mask("河", int(S * 0.470), target_w=int(S * 0.58))
    put(img, fill_grad(m, PAPER_HI, PAPER, -72.0), S * 0.5, S * 0.352)
    # 下半：一卷心电图纸带（暖纸底 + 青绿网格），带子在图标下缘出画
    top = int(S * 0.612)
    bot = int(S * 0.905)
    strip = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip, "RGBA")
    sd.rectangle([0, top, S, bot], fill=(232, 222, 202, 255))
    img = Image.alpha_composite(img, strip)
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(0, 21):
        x = int(S * 0.0125 * i * 4)
        d.line([(x, top), (x, bot)], fill=(120, 108, 88, 26), width=int(S * 0.0035))
    for i in range(0, 5):
        y = int(top + (bot - top) * i / 4.0)
        d.line([(0, y), (S, y)], fill=(120, 108, 88, 26), width=int(S * 0.0035))
    d.line([(0, top), (S, top)], fill=(120, 108, 88, 60), width=int(S * 0.005))

    img = draw_ecg(img, S * 0.040, S * 0.960, S * 0.760, S * 0.098, (16, 106, 100), int(S * 0.015),
                   beats=1.9, phase=0.03, glow=False)
    d = ImageDraw.Draw(img, "RGBA")
    r = int(S * 0.024)
    dx, dy = int(S * 0.900), int(S * 0.760 - S * 0.098)
    d.ellipse([dx - r, dy - r, dx + r, dy + r], fill=CORAL + (255,))

    img = scanlines(img, int(S * 0.0075), 7)
    return vignette(img, 96)


# ---------------------------------------------------------------- E 脉搏
def scheme_pulse():
    img = base_canvas(glow_at=(0.44, 0.28), glow_r=0.88, glow_col=CYAN, glow_s=40)
    m = glyph_mask("河", int(S * 0.545), target_w=int(S * 0.62))
    put(img, fill_grad(m, PAPER_HI, PAPER, -74.0), S * 0.5, S * 0.435)

    img = draw_ecg(img, S * 0.180, S * 0.820, S * 0.792, S * 0.108, CYAN, int(S * 0.016),
                   beats=1.25, phase=0.02)
    d = ImageDraw.Draw(img, "RGBA")
    r = int(S * 0.026)
    dx = int(S * 0.845)
    d.ellipse([dx - r, S * 0.792 - r, dx + r, S * 0.792 + r], fill=CORAL + (255,))

    img = scanlines(img, int(S * 0.0075), 6)
    return vignette(img, 88)


BUILDERS = {
    "01_plate": scheme_plate,
    "02_port": scheme_port,
    "03_cross": scheme_cross,
    "04_readout": scheme_readout,
    "05_pulse": scheme_pulse,
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
        print("OK %-11s %d" % (slug, os.path.getsize(os.path.join(folder, "preview-512.png"))))


if __name__ == "__main__":
    main()
