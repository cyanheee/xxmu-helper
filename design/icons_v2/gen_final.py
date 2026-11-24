# -*- coding: utf-8 -*-
"""v2.0 图标候选 · 定稿批（8 个，纸感语系，全部过 48px）。生成本批最终稿。

    python -X utf8 design/icons_v2/gen_final.py
    python -X utf8 design/icons_v2/sheet_final.py

设计纪律
--------
语系：App 经典皮肤的牛皮纸 / 墨线 / 砖红印 / 铅笔，不用深色玻璃舱。
主语：「河」实心 simhei，字高 ≥0.34S，跨机一致。
医学语义只靠三件东西：十字、ECG、圆章。
十字一律按**单条十二点路径**画，避免两个矩形叠出穿心的内部线（上一批 C/E 的败笔）。
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "design", "icons_v2")
FONT_HEI = r"C:\Windows\Fonts\simhei.ttf"

S = 2048

PAPER = (239, 226, 200)
PAPER2 = (250, 243, 226)
PAPER3 = (255, 251, 242)
INK = (59, 50, 37)
INK2 = (106, 88, 66)
PENCIL = (156, 139, 112)
RED = (178, 59, 38)
RED_D = (140, 40, 24)
BLUE = (44, 92, 122)
GOLD = (217, 163, 43)
GREEN = (78, 122, 72)
GREEN_D = (54, 92, 50)

# 十字十二点：索引 0,1,3,4,6,7,9,10 是外凸角（可倒圆），2,5,8,11 是内凹角
CONVEX = (0, 1, 3, 4, 6, 7, 9, 10)


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


def plus_pts(cx, cy, a, L, r=0.0):
    """十字单一路径：十二点，外凸角倒圆。a=半臂宽，L=半臂长。"""
    raw = [(cx - a, cy - L), (cx + a, cy - L), (cx + a, cy - a), (cx + L, cy - a),
           (cx + L, cy + a), (cx + a, cy + a), (cx + a, cy + L), (cx - a, cy + L),
           (cx - a, cy + a), (cx - L, cy + a), (cx - L, cy - a), (cx - a, cy - a)]
    n = len(raw)
    out = []
    for i, p in enumerate(raw):
        if i not in CONVEX or r <= 0:
            out.append(p)
            continue
        pp = raw[(i - 1) % n]
        pn = raw[(i + 1) % n]
        p0 = cut(p, pp, r)
        p1 = cut(p, pn, r)
        for k in range(11):
            t = k / 10.0
            out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p[0] + t * t * p1[0],
                        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p[1] + t * t * p1[1]))
    return out


def cut(p, q, r):
    dx, dy = q[0] - p[0], q[1] - p[1]
    ln = math.hypot(dx, dy) or 1.0
    k = min(r, ln * 0.5) / ln
    return (p[0] + dx * k, p[1] + dy * k)


def draw_plus(d, pts, fill=None, outline=None, width=0):
    if fill is not None:
        d.polygon(pts, fill=fill)
    if outline is not None:
        d.line(list(pts) + [pts[0]], fill=outline, width=width, joint="curve")


def plus_shadow(base, pts, dx=0.014, dy=0.016, alpha=30):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    sh = Image.new("RGBA", (S, S), INK + (0,))
    sh.putalpha(m.point(lambda v: v * alpha // 255))
    base.alpha_composite(sh, (int(S * dx), int(S * dy)))


# ---------------------------------------------------------------- A 纸印章
def scheme_stamp():
    img = paper_bg()
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = S * 0.5
    r_out = S * 0.352
    d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], outline=RED + (255,), width=int(S * 0.030))
    r_in = S * 0.292
    d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], outline=RED + (140,), width=int(S * 0.009))

    m = glyph_mask("河", int(S * 0.372), target_w=int(S * 0.42))
    hard_shadow(img, m, cx, cy + S * 0.008, alpha=26, dx=0.007, dy=0.009)
    put(img, solid(m, INK, 255), cx, cy + S * 0.008)

    # 环顶：纸色小圆盘当垫底（像印泥压掉一段），绿十字叠在上面
    d = ImageDraw.Draw(img, "RGBA")
    hr = S * 0.072
    d.ellipse([cx - hr, cy - r_out - hr, cx + hr, cy - r_out + hr], fill=PAPER2 + (255,))
    cross(d, cx, cy - r_out, int(S * 0.044), int(S * 0.017), GREEN + (255,))
    d.ellipse([cx - S * 0.009, cy - r_out - S * 0.009, cx + S * 0.009, cy - r_out + S * 0.009],
              fill=GREEN + (255,))

    for i, y in enumerate((0.818, 0.862, 0.904)):
        pts = [(S * 0.312 + S * 0.376 * t / 24.0,
                S * y + math.sin(t / 24.0 * math.pi * 4 + i) * S * 0.012) for t in range(25)]
        d.line(pts, fill=GOLD + (210 - i * 45,), width=int(S * (0.012 - i * 0.002)), joint="curve")
    return img


# ---------------------------------------------------------------- B 处方笺
def scheme_rx():
    img = paper_bg(PAPER3, PAPER, -66.0, 11)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, int(S * 0.090), S], fill=RED + (255,))
    d.rectangle([int(S * 0.090), 0, int(S * 0.100), S], fill=RED + (55,))
    for i in range(6):
        y = int(S * (0.255 + i * 0.104))
        d.line([(int(S * 0.170), y), (S - int(S * 0.070), y)], fill=BLUE + (38,), width=int(S * 0.005))
    ink_glyph(img, "河", 0.470, S * 0.585, S * 0.495, color=INK)
    r = int(S * 0.100)
    ox, oy = int(S * 0.790), int(S * 0.788)
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([ox - r, oy - r, ox + r, oy + r], fill=RED + (255,))
    cross(d, ox, oy, int(r * 0.56), int(S * 0.021), PAPER3 + (255,))
    return img


# ---------------------------------------------------------------- C 铅笔十字
def scheme_pencil():
    """四笔实心绿十字：四条臂分开画、中央留纸色方洞，墨河正好嵌进洞里。"""
    img = paper_bg(PAPER3, PAPER, -72.0, 15)
    cx = cy = S * 0.5
    a = S * 0.130          # 中央方洞半宽
    aw = S * 0.320         # 臂宽
    AL = S * 0.340         # 臂长
    gap = S * 0.008        # 臂与洞之间的纸缝（细，让十字读起来是整块）
    r = int(S * 0.026)

    bars = [
        [cx - aw / 2, cy - AL, cx + aw / 2, cy - a - gap],          # 上
        [cx - aw / 2, cy + a + gap, cx + aw / 2, cy + AL],          # 下
        [cx - AL, cy - aw / 2, cx - a - gap, cy + aw / 2],          # 左
        [cx + a + gap, cy - aw / 2, cx + AL, cy + aw / 2],          # 右
    ]
    m = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(m)
    for b in bars:
        md.rounded_rectangle(b, radius=r, fill=255)

    sh = Image.new("RGBA", (S, S), GREEN_D + (0,))
    sh.putalpha(m.point(lambda v: v * 66 // 255))
    img.alpha_composite(sh, (int(S * 0.010), int(S * 0.013)))

    plate = Image.new("RGBA", (S, S), GREEN + (0,))
    plate.putalpha(m)
    img = Image.alpha_composite(img, plate)

    # 墨河嵌在洞心：先一层纸色描边托底，避免绿边糊住笔画
    ink_glyph(img, "河", 0.300, cx, cy + S * 0.002, color=INK, halo=PAPER3, halo_w=0.010)
    return img


# ---------------------------------------------------------------- D 河与脉搏
def scheme_river():
    img = paper_bg(PAPER3, PAPER, -74.0, 13)
    ink_glyph(img, "河", 0.430, S * 0.5, S * 0.372, color=INK)

    d = ImageDraw.Draw(img, "RGBA")
    for y, col, wd in ((0.708, RED, 0.018), (0.764, BLUE, 0.014)):
        pts = [(S * 0.158 + S * 0.684 * t / 30.0,
                S * y + math.sin(t / 30.0 * math.pi * 3.4) * S * 0.013) for t in range(31)]
        d.line(pts, fill=col + (242,), width=int(S * wd), joint="curve")
    base = S * 0.848
    flat = [(S * 0.158 + S * 0.296 * t / 12.0,
             base + math.sin(t / 12.0 * math.pi * 2.2) * S * 0.011) for t in range(13)]
    d.line(flat, fill=GOLD + (240,), width=int(S * 0.013), joint="curve")
    ecg = ecg_points(S * 0.454, S * 0.862, base, S * 0.112, 380, 1.0, 0.10)
    gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gl, "RGBA").line(ecg, fill=GOLD + (150,), width=int(S * 0.032), joint="curve")
    img = Image.alpha_composite(img, gl.filter(ImageFilter.GaussianBlur(S * 0.010)))
    d = ImageDraw.Draw(img, "RGBA")
    d.line(ecg, fill=GOLD + (252,), width=int(S * 0.014), joint="curve")
    r = int(S * 0.022)
    d.ellipse([S * 0.888 - r, base - r, S * 0.888 + r, base + r], fill=RED + (255,))
    return img


# ---------------------------------------------------------------- E 绷带十字
def scheme_bandage():
    img = paper_bg(PAPER3, PAPER, -68.0, 12)
    cx = cy = S * 0.5
    a = S * 0.190
    L = S * 0.340
    pts = plus_pts(cx, cy, a, L, S * 0.050)

    plus_shadow(img, pts, 0.014, 0.016, 30)
    d = ImageDraw.Draw(img, "RGBA")
    draw_plus(d, pts, fill=PAPER3 + (255,))
    draw_plus(d, pts, outline=RED + (255,), width=int(S * 0.021))

    # 纱布折线：只在臂内，避开中心与描边
    for off in (-0.070, 0.070):
        d.line([(cx + S * off, cy - L + S * 0.036), (cx + S * off, cy - a - S * 0.020)],
               fill=RED + (44,), width=int(S * 0.006))
        d.line([(cx + S * off, cy + a + S * 0.020), (cx + S * off, cy + L - S * 0.036)],
               fill=RED + (44,), width=int(S * 0.006))
        d.line([(cx - L + S * 0.036, cy + S * off), (cx - a - S * 0.020, cy + S * off)],
               fill=RED + (44,), width=int(S * 0.006))
        d.line([(cx + a + S * 0.020, cy + S * off), (cx + L - S * 0.036, cy + S * off)],
               fill=RED + (44,), width=int(S * 0.006))

    ink_glyph(img, "河", 0.330, cx, cy + S * 0.004, color=RED, halo=None)
    return img


# ---------------------------------------------------------------- F 校徽
def scheme_seal():
    img = paper_bg(PAPER3, PAPER, -72.0, 11)
    cx, cy = S * 0.5, S * 0.462
    r = S * 0.330

    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    sh = Image.new("RGBA", (S, S), INK + (0,))
    sh.putalpha(m.point(lambda v: v * 30 // 255))
    img.alpha_composite(sh, (int(S * 0.013), int(S * 0.015)))

    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK + (255,))
    r2 = S * 0.286
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=PAPER3 + (255,))
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=INK + (255,), width=int(S * 0.010))

    ink_glyph(img, "河", 0.396, cx, cy - S * 0.008, color=INK, shadow=False)

    d = ImageDraw.Draw(img, "RGBA")
    cross(d, cx, cy - r - S * 0.028, int(S * 0.048), int(S * 0.018), RED + (255,))
    for i, yy in enumerate((0.878, 0.920)):
        pts = [(S * 0.348 + S * 0.304 * t / 22.0,
                S * yy + math.sin(t / 22.0 * math.pi * 3.2 + i) * S * 0.010) for t in range(23)]
        d.line(pts, fill=GOLD + (215 - i * 65,), width=int(S * (0.012 - i * 0.003)), joint="curve")
    return img


# ---------------------------------------------------------------- G 墨迹
def scheme_ink():
    img = paper_bg(PAPER2, PAPER, -76.0, 16)
    cx, cy = S * 0.5, S * 0.478

    # 墨晕：几团模糊墨块，压成背景肌理
    wash = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash, "RGBA")
    rnd = random.Random(23)
    for _ in range(9):
        rx = cx + rnd.uniform(-S * 0.26, S * 0.26)
        ry = cy + rnd.uniform(-S * 0.26, S * 0.26)
        rr = rnd.uniform(S * 0.10, S * 0.22)
        wd.ellipse([rx - rr, ry - rr * rnd.uniform(0.7, 1.2), rx + rr, ry + rr * rnd.uniform(0.7, 1.2)],
                   fill=INK + (26,))
    img = Image.alpha_composite(img, wash.filter(ImageFilter.GaussianBlur(S * 0.045)))

    ink_glyph(img, "河", 0.548, cx, cy, color=INK)

    d = ImageDraw.Draw(img, "RGBA")
    # 金线 + 红印点（右下），压住墨团的收尾
    d.line([(S * 0.252, S * 0.812), (S * 0.748, S * 0.812)], fill=GOLD + (225,), width=int(S * 0.011))
    rr = int(S * 0.049)
    d.ellipse([S * 0.795 - rr, S * 0.812 - rr, S * 0.795 + rr, S * 0.812 + rr], fill=RED + (255,))
    return img


# ---------------------------------------------------------------- H 绿十字反白
def scheme_green():
    img = paper_bg(PAPER3, PAPER, -70.0, 12)
    cx = cy = S * 0.5
    a = S * 0.196
    L = S * 0.332
    pts = plus_pts(cx, cy, a, L, S * 0.042)

    plus_shadow(img, pts, 0.014, 0.016, 34)
    d = ImageDraw.Draw(img, "RGBA")
    draw_plus(d, pts, fill=GREEN + (255,))

    # 纸白「河」反白压在绿十字上
    m = glyph_mask("河", int(S * 0.300))
    put(img, solid(m, PAPER3, 255), cx, cy + S * 0.002)

    d = ImageDraw.Draw(img, "RGBA")
    d.line(list(pts) + [pts[0]], fill=GREEN_D + (255,), width=int(S * 0.008), joint="curve")
    return img


BUILDERS = {
    "01_stamp": scheme_stamp,
    "02_rx": scheme_rx,
    "03_pencil": scheme_pencil,
    "04_river": scheme_river,
    "05_bandage": scheme_bandage,
    "06_seal": scheme_seal,
    "07_ink": scheme_ink,
    "08_green": scheme_green,
}


def main():
    os.makedirs(OUT, exist_ok=True)
    sizes = [48, 72, 96, 144, 192, 512]
    mask = rounded_mask(S, 0.225)
    for slug, build in BUILDERS.items():
        img = build()
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
        print("OK %-12s %8d" % (slug, os.path.getsize(os.path.join(folder, "preview-512.png"))))


if __name__ == "__main__":
    main()
