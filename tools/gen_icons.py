# -*- coding: utf-8 -*-
"""生成 6 套应用图标方案，供用户挑选（v1.1.40）。

    python -X utf8 tools/gen_icons.py

产出（全部送到 桌面\\xxmuhelper\\图标方案\\，另在项目 design/icons/ 留一份进 git）：
    01..06_<slug>/
        preview-512.png       大方图，看细节
        icon.svg              矢量源（中文用系统字体，跨机器可能略有差异）
        launcher-48/72/96/144/192.png   可直接替换的多尺寸
    _总览.png                 6 个排一起，带编号和名字
    怎么选.txt                选号 + 一条替换命令

设计约束：
  * 都沿用 App 的蓝紫渐变 / 白 / 深底这一族，别和 App 两张脸；
  * 48px 下也要认得出 —— 图形粗、元素少，不塞小字；
  * 纯 PIL 绘制，零外部依赖，断网也能跑；
  * 只生成方案，**不碰 android/res** —— 用户没选之前不擅自换图标。
"""
import io
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = r"C:\Windows\Fonts\msyhbd.ttc"   # 微软雅黑粗体，Windows 自带

SS = 4          # 超采样倍率，抗锯齿
S = 512         # 逻辑画布边长
SZ = S * SS

# 品牌色族
BLUE_A = (59, 130, 246)
BLUE_B = (37, 99, 235)
INDIGO = (79, 70, 229)
CYAN = (56, 189, 248)
DEEP = (14, 19, 32)
WHITE = (255, 255, 255)


def desktop():
    """真实桌面路径（和 deliver.py 同一套判据，问注册表而不是 expanduser）。"""
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                           r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders")
        v, _ = winreg.QueryValueEx(k, "Desktop")
        if v and os.path.isdir(v):
            return v
    except Exception:
        pass
    p = os.path.join(os.path.expanduser("~"), "Desktop")
    return p if os.path.isdir(p) else os.path.expanduser("~")


def font(px):
    return ImageFont.truetype(FONT, int(px * SS), index=0)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tristop(t, a, b, c):
    if t < 0.5:
        return lerp(a, b, t / 0.5)
    return lerp(b, c, (t - 0.5) / 0.5)


def gradient(a=BLUE_A, b=BLUE_B, c=INDIGO, vertical=False):
    """SZ×SZ 的对角/垂直三色渐变 RGB。"""
    im = Image.new("RGB", (SZ, SZ))
    px = im.load()
    for y in range(SZ):
        for x in range(0, SZ, 1):
            if vertical:
                t = y / (SZ - 1)
            else:
                t = (x + y) / (2 * (SZ - 1))
            px[x, y] = tristop(t, a, b, c)
    return im


def rounded_mask(radius, inset=0):
    m = Image.new("L", (SZ, SZ), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([inset, inset, SZ - 1 - inset, SZ - 1 - inset],
                        radius=int(radius * SS), fill=255)
    return m


def base(grad=None, solid=None, radius=112):
    """圆角方底板：渐变或纯色，带一圈极轻的内高光。"""
    if solid is not None:
        im = Image.new("RGBA", (SZ, SZ), solid + (255,))
    else:
        im = (grad or gradient()).convert("RGBA")
    m = rounded_mask(radius)
    out = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    # 顶部一道淡高光，让方块不那么平
    hl = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([int(-0.25 * SZ), int(-0.62 * SZ), int(1.25 * SZ), int(0.32 * SZ)],
               fill=(255, 255, 255, 26))
    out = Image.alpha_composite(out, hl)
    out.putalpha(m)
    return out


def text_mask(ch, size_px, oy=0):
    m = Image.new("L", (SZ, SZ), 0)
    d = ImageDraw.Draw(m)
    d.text((SZ / 2, SZ / 2 + oy * SS), ch, font=font(size_px), fill=255, anchor="mm")
    return m


def paste_white(im, mask, alpha=255):
    layer = Image.new("RGBA", (SZ, SZ), WHITE + (0,))
    layer.putalpha(mask.point(lambda v: v * alpha // 255))
    return Image.alpha_composite(im, layer)


def paste_gradient_text(im, mask, a=WHITE, b=(226, 238, 255)):
    g = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
    gp = g.load()
    for y in range(SZ):
        col = lerp(a, b, y / (SZ - 1)) + (255,)
        for x in range(SZ):
            gp[x, y] = col
    g.putalpha(mask)
    return Image.alpha_composite(im, g)


# ------------------------------------------------------------------ 六套方案

def scheme_a():
    """01 河字·蓝紫渐变：现有风格的精修版。"""
    im = base(gradient())
    im = paste_white(im, text_mask("河", 300, -6))
    return im


def scheme_b():
    """02 课表网格：白色日历 + 3×2 课程格，一眼看出是课表 App。"""
    im = base(gradient(BLUE_A, BLUE_B, INDIGO))
    d = ImageDraw.Draw(im)
    L, T, R, B = int(112 * SS), int(126 * SS), int(400 * SS), int(390 * SS)
    d.rounded_rectangle([L, T, R, B], radius=int(30 * SS), fill=WHITE)
    # 顶部一条蓝条（月份/周次感）
    d.rounded_rectangle([L, T, R, T + int(52 * SS)], radius=int(30 * SS), fill=(37, 99, 235))
    d.rectangle([L, T + int(30 * SS), R, T + int(52 * SS)], fill=(37, 99, 235))
    # 两个挂环
    for cx in (180, 332):
        d.rounded_rectangle([int((cx - 9) * SS), int(108 * SS), int((cx + 9) * SS), int(146 * SS)],
                            radius=int(9 * SS), fill=(226, 238, 255))
    # 3 列 × 2 行格子，其中一格点亮
    gx0, gy0 = int(140 * SS), int(206 * SS)
    cw, ch, gap = int(74 * SS), int(64 * SS), int(14 * SS)
    for r in range(2):
        for c in range(3):
            x0 = gx0 + c * (cw + gap)
            y0 = gy0 + r * (ch + gap)
            col = (37, 99, 235) if (r, c) == (0, 1) else (219, 230, 250)
            d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=int(12 * SS), fill=col)
    return im


def scheme_c():
    """03 医药十字：河南「医药」大学，白色圆角十字 + 中心高光。"""
    im = base(gradient(CYAN, BLUE_B, INDIGO))
    d = ImageDraw.Draw(im)
    cx, cy = SZ / 2, SZ / 2
    arm, thick = int(196 * SS), int(92 * SS)
    d.rounded_rectangle([cx - thick // 2, cy - arm // 2, cx + thick // 2, cy + arm // 2],
                        radius=int(30 * SS), fill=WHITE)
    d.rounded_rectangle([cx - arm // 2, cy - thick // 2, cx + arm // 2, cy + thick // 2],
                        radius=int(30 * SS), fill=WHITE)
    d.ellipse([cx - int(26 * SS), cy - int(26 * SS), cx + int(26 * SS), cy + int(26 * SS)],
              fill=(37, 99, 235))
    return im


def scheme_d():
    """04 极简线河：浅底 + 蓝紫渐变「河」字，最轻的一版。"""
    im = base(solid=(244, 246, 251), radius=112)
    d = ImageDraw.Draw(im)
    # 细描边
    d.rounded_rectangle([int(28 * SS), int(28 * SS), int(484 * SS), int(484 * SS)],
                        radius=int(96 * SS), outline=(219, 228, 245), width=int(4 * SS))
    m = text_mask("河", 330, -8)
    g = gradient(BLUE_A, BLUE_B, INDIGO).convert("RGBA")
    g.putalpha(m)
    return Image.alpha_composite(im, g)


def scheme_e():
    """05 三道河流：抽象的三道白色波浪，现代、无文字。"""
    im = base(gradient(BLUE_A, BLUE_B, INDIGO))
    d = ImageDraw.Draw(im)
    for k, (base_y, amp, w) in enumerate([(196, 30, 26), (262, 26, 26), (328, 30, 26)]):
        pts = []
        for x in range(0, SZ + 1, int(6 * SS)):
            t = x / SZ
            y = (base_y + amp * math.sin(2 * math.pi * (1.15 * t) + k * 0.9)) * SS
            pts.append((x, y))
        d.line(pts, fill=WHITE if k != 1 else (226, 238, 255), width=int(w * SS), joint="curve")
        r = int(w * SS / 2)
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r],
                      fill=WHITE if k != 1 else (226, 238, 255))
    return im


def scheme_f():
    """06 夜空河字：深底 + 星点 + 亮蓝「河」，呼应深色模式。"""
    im = base(solid=DEEP, radius=112)
    d = ImageDraw.Draw(im)
    # 右上月牙（大圆减小圆）
    mx, my, mr = int(372 * SS), int(140 * SS), int(58 * SS)
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(96, 165, 250))
    d.ellipse([mx - int(20 * SS), my - mr - int(18 * SS),
               mx + mr + int(6 * SS), my + mr - int(6 * SS)], fill=DEEP)
    # 星点
    for (sx, sy, sr) in [(120, 132, 6), (168, 92, 4), (398, 320, 5),
                         (110, 356, 4), (356, 402, 4), (152, 236, 3)]:
        d.ellipse([int((sx - sr) * SS), int((sy - sr) * SS),
                   int((sx + sr) * SS), int((sy + sr) * SS)], fill=(147, 197, 253))
    m = text_mask("河", 300, -4)
    g = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
    gp = g.load()
    for y in range(SZ):
        c = lerp((147, 197, 253), (232, 242, 255), y / (SZ - 1)) + (255,)
        for x in range(SZ):
            gp[x, y] = c
    g.putalpha(m)
    return Image.alpha_composite(im, g)


SCHEMES = [
    ("01_河字渐变", "A 河字·蓝紫渐变", "现有图标的精修版，最稳，和 App 完全同一套视觉", scheme_a),
    ("02_课表网格", "B 课表网格", "白色日历＋课程格，一眼看出是课表工具", scheme_b),
    ("03_医药十字", "C 医药十字", "白色圆角十字，点出「河南医药大学」", scheme_c),
    ("04_极简线河", "D 极简线河", "浅底＋渐变「河」字，最轻最干净", scheme_d),
    ("05_三道河流", "E 三道河流", "三道抽象波浪，无文字，现代感最强", scheme_e),
    ("06_夜空河字", "F 夜空河字", "深底＋星点＋亮蓝「河」，呼应深色模式", scheme_f),
]

SVG_TPL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/><stop offset="0.55" stop-color="#2563eb"/><stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  {body}
</svg>
"""

SVG_BODY = {
    0: '<rect x="0" y="0" width="512" height="512" rx="112" fill="url(#g)"/>\n'
       '  <text x="256" y="268" font-size="300" font-family="Microsoft YaHei,PingFang SC,sans-serif" '
       'font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">河</text>',
    1: '<rect x="0" y="0" width="512" height="512" rx="112" fill="url(#g)"/>\n'
       '  <rect x="112" y="126" width="288" height="264" rx="30" fill="#fff"/>\n'
       '  <path d="M112 156a30 30 0 0 1 30-30h228a30 30 0 0 1 30 30v22H112z" fill="#2563eb"/>\n'
       '  <rect x="171" y="108" width="18" height="38" rx="9" fill="#e2eeff"/>\n'
       '  <rect x="323" y="108" width="18" height="38" rx="9" fill="#e2eeff"/>\n'
       '  <g fill="#dbe6fa"><rect x="140" y="206" width="74" height="64" rx="12"/>'
       '<rect x="302" y="206" width="74" height="64" rx="12"/>'
       '<rect x="140" y="284" width="74" height="64" rx="12"/>'
       '<rect x="228" y="284" width="74" height="64" rx="12"/>'
       '<rect x="302" y="284" width="74" height="64" rx="12"/></g>\n'
       '  <rect x="228" y="206" width="74" height="64" rx="12" fill="#2563eb"/>',
    2: '<rect x="0" y="0" width="512" height="512" rx="112" fill="url(#g)"/>\n'
       '  <rect x="210" y="158" width="92" height="196" rx="30" fill="#fff"/>\n'
       '  <rect x="158" y="210" width="196" height="92" rx="30" fill="#fff"/>\n'
       '  <circle cx="256" cy="256" r="26" fill="#2563eb"/>',
    3: '<rect x="0" y="0" width="512" height="512" rx="112" fill="#f4f6fb"/>\n'
       '  <rect x="28" y="28" width="456" height="456" rx="96" fill="none" stroke="#dbe4f5" stroke-width="4"/>\n'
       '  <text x="256" y="264" font-size="330" font-family="Microsoft YaHei,PingFang SC,sans-serif" '
       'font-weight="700" fill="#2563eb" text-anchor="middle" dominant-baseline="central">河</text>',
    4: '<rect x="0" y="0" width="512" height="512" rx="112" fill="url(#g)"/>\n'
       '  <g fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round">\n'
       '    <path d="M0 196 Q 108 150 216 196 T 432 196 T 648 196"/>\n'
       '    <path d="M0 262 Q 108 220 216 262 T 432 262 T 648 262" stroke="#e2eeff"/>\n'
       '    <path d="M0 328 Q 108 286 216 328 T 432 328 T 648 328"/>\n'
       '  </g>',
    5: '<rect x="0" y="0" width="512" height="512" rx="112" fill="#0e1320"/>\n'
       '  <circle cx="372" cy="140" r="58" fill="#60a5fa"/>\n'
       '  <ellipse cx="396" cy="122" rx="62" ry="62" fill="#0e1320"/>\n'
       '  <g fill="#93c5fd"><circle cx="120" cy="132" r="6"/><circle cx="168" cy="92" r="4"/>'
       '<circle cx="398" cy="320" r="5"/><circle cx="110" cy="356" r="4"/>'
       '<circle cx="356" cy="402" r="4"/><circle cx="152" cy="236" r="3"/></g>\n'
       '  <text x="256" y="264" font-size="300" font-family="Microsoft YaHei,PingFang SC,sans-serif" '
       'font-weight="700" fill="#c9ddff" text-anchor="middle" dominant-baseline="central">河</text>',
}


def down(im, n):
    return im.convert("RGBA").resize((n, n), Image.LANCZOS)


def main():
    desk_out = os.path.join(desktop(), "xxmuhelper", "图标方案")
    repo_out = os.path.join(ROOT, "design", "icons")
    for d in (desk_out, repo_out):
        os.makedirs(d, exist_ok=True)

    print("生成 6 套图标方案 …")
    big = []
    for i, (slug, title, desc, fn) in enumerate(SCHEMES):
        im = fn()
        sub_d = os.path.join(desk_out, slug)
        sub_r = os.path.join(repo_out, slug)
        for d in (sub_d, sub_r):
            os.makedirs(d, exist_ok=True)
        paths = []
        # 预览大图
        p512 = os.path.join(sub_d, "preview-512.png")
        down(im, 512).save(p512)
        paths.append(p512)
        # 多尺寸 launcher
        for n in (48, 72, 96, 144, 192):
            p = os.path.join(sub_d, "launcher-%d.png" % n)
            down(im, n).save(p)
            paths.append(p)
        # SVG
        psvg = os.path.join(sub_d, "icon.svg")
        io.open(psvg, "w", encoding="utf-8", newline="\n").write(SVG_TPL.format(body=SVG_BODY[i]))
        paths.append(psvg)
        # 项目内留一份（进 git，不进 APK）
        for src in paths:
            import shutil
            shutil.copyfile(src, os.path.join(sub_r, os.path.basename(src)))
        big.append((title, desc, down(im, 320).resize((300, 300), Image.LANCZOS)))
        print("  %s  %s" % (slug, desc))

    # ---- 总览图：3 列 × 2 行，带编号和名字 ----
    CW, CH, PAD, TOP = 380, 430, 40, 60
    OW, OH = CW * 3 + PAD * 2, CH * 2 + PAD * 2 + TOP
    ov = Image.new("RGB", (OW, OH), (244, 246, 251))
    od = ImageDraw.Draw(ov)
    f_title = ImageFont.truetype(FONT, 40)
    f_name = ImageFont.truetype(FONT, 26)
    f_desc = ImageFont.truetype(FONT, 18)
    od.text((PAD, 16), "河医大助手 · 图标方案（挑一个号告诉我）", font=f_title, fill=(15, 23, 42))
    for i, (title, desc, thumb) in enumerate(big):
        col, row = i % 3, i // 3
        x = PAD + col * CW
        y = TOP + PAD + row * CH
        od.rounded_rectangle([x, y, x + CW - 24, y + CH - 16], radius=24,
                             fill=(255, 255, 255), outline=(233, 237, 245), width=2)
        ix = x + (CW - 24 - 300) // 2
        iy = y + 26
        # 必须按 alpha 合成：直接 paste(RGB) 会把透明四角当成黑色贴上来，
        # 总览里就是四块黑角，拿去给用户挑等于交付残次品。
        thumb_rgba = thumb.convert("RGBA")
        ov.paste(thumb_rgba, (ix, iy), thumb_rgba)
        od.text((x + 24, y + 338), title, font=f_name, fill=(15, 23, 42))
        # 描述可能较长，简单折行
        line, lines = "", []
        for ch in desc:
            line += ch
            if len(line) >= 17:
                lines.append(line); line = ""
        if line:
            lines.append(line)
        for j, ln in enumerate(lines[:2]):
            od.text((x + 24, y + 374 + j * 24), ln, font=f_desc, fill=(139, 148, 166))
    ovp = os.path.join(desk_out, "_总览.png")
    ov.save(ovp)
    import shutil
    shutil.copyfile(ovp, os.path.join(repo_out, "_总览.png"))
    print("  总览图 -> " + ovp)

    # ---- 怎么选 ----
    txt = [
        "河医大助手 · 应用图标方案",
        "",
        "看 _总览.png，六个编号从左到右、从上到下是 1~6。",
        "每个文件夹里有 preview-512.png（大图）、icon.svg（矢量源）、",
        "launcher-48/72/96/144/192.png（可替换的多尺寸）。",
        "",
        "方案：",
    ]
    for i, (slug, title, desc, fn) in enumerate(SCHEMES):
        txt.append("  %d  %-14s %s" % (i + 1, title, desc))
    txt += [
        "",
        "选定之后回我一句「用 N 号图标」，我会：",
        "  1) 在项目里跑  python -X utf8 tools/apply_icon.py N",
        "     （覆盖 android/res/mipmap-*/ic_launcher.png 并逐字节校验，自动备份原图标）",
        "  2) 重新出包、放桌面、把新包给你。",
        "",
        "这轮只是让你选，App 里现在装的还是老图标，线上也没动。",
        "注：SVG 里的「河」字依赖系统字体，跨机器可能略有差异；",
        "   以 preview-512.png 为准，PNG 是逐像素画出来的。",
    ]
    for d in (desk_out, repo_out):
        io.open(os.path.join(d, "怎么选.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(txt))

    print("\n输出目录：" + desk_out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
