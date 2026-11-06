# -*- coding: utf-8 -*-
"""把选定的图标方案换进 APK 资源（用户回「用 N 号图标」之后才跑）。

    python -X utf8 tools/apply_icon.py 3          # 1~6
    python -X utf8 tools/apply_icon.py 3 --dry    # 只打印会动哪些文件
    python -X utf8 tools/apply_icon.py --restore  # 从备份恢复上一版图标

安全约束：
  * 换之前把现有 mipmap-* 里的 ic_launcher.png 全部备份到
    design/icons/_backup/<时间戳>/，随时可 --restore。
  * 每写一份都逐字节 hash 校验（「复制了」≠「复制对了」，本项目栽过五次）。
  * 只动 android/res/mipmap-*/ic_launcher.png，不碰 KV / 官网 / git 远程；
    换完还要重新 build_apk.py 才会进包。
  * 图标源取 design/icons/<方案>/launcher-<密度>.png，按目录名匹配密度，
    不靠文件大小猜（v1.1.15 那次「磁盘清单写 1.1.15、blob 是 1.1.14」就是猜出来的）。
"""
import hashlib
import io
import os
import re
import shutil
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "design", "icons")
RES = os.path.join(ROOT, "android", "res")

# 方案序号 → 目录名（和 gen_icons.py 的 SCHEMES 顺序严格一致）
SCHEME_DIRS = [
    "01_河字渐变", "02_课表网格", "03_医药十字",
    "04_极简线河", "05_三道河流", "06_夜空河字",
]
# 密度目录 → 该密度要用的 PNG
DENSITY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def backup():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    dst = os.path.join(ICONS, "_backup", stamp)
    n = 0
    for d in DENSITY:
        src = os.path.join(RES, d, "ic_launcher.png")
        if not os.path.exists(src):
            continue
        os.makedirs(os.path.join(dst, d), exist_ok=True)
        shutil.copyfile(src, os.path.join(dst, d, "ic_launcher.png"))
        n += 1
    return dst, n


def restore():
    base = os.path.join(ICONS, "_backup")
    if not os.path.isdir(base):
        raise SystemExit("没有备份目录：" + base)
    dirs = sorted(x for x in os.listdir(base) if re.match(r"^\d{8}-\d{6}$", x))
    if not dirs:
        raise SystemExit("没有可恢复的备份")
    src_root = os.path.join(base, dirs[-1])
    print("从备份恢复：" + src_root)
    for d in DENSITY:
        src = os.path.join(src_root, d, "ic_launcher.png")
        if not os.path.exists(src):
            continue
        dst_dir = os.path.join(RES, d)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, "ic_launcher.png")
        shutil.copyfile(src, dst)
        print("  OK %-16s %s" % (d, sha(dst)[:12]))
    return 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry" in sys.argv
    if "--restore" in sys.argv:
        return restore()
    if len(args) != 1 or not args[0].isdigit() or not (1 <= int(args[0]) <= 6):
        raise SystemExit("用法： python -X utf8 tools/apply_icon.py <1~6> [--dry]")
    n = int(args[0])
    folder = os.path.join(ICONS, SCHEME_DIRS[n - 1])
    if not os.path.isdir(folder):
        raise SystemExit("找不到方案目录：" + folder + "\n先跑 python -X utf8 tools/gen_icons.py")

    print("方案 %d：%s" % (n, SCHEME_DIRS[n - 1]))
    # 先把所有源都验一遍，缺一个都不动目标
    plan = []
    for d, size in DENSITY.items():
        src = os.path.join(folder, "launcher-%d.png" % size)
        if not os.path.exists(src):
            raise SystemExit("缺源文件：" + src)
        plan.append((d, src, os.path.join(RES, d, "ic_launcher.png")))
    for d, src, dst in plan:
        print("  %-16s <- %s" % (d, os.path.basename(src)))
    if dry:
        print("[DRY] 未写文件")
        return 0

    bdir, bn = backup()
    print("已备份 %d 份旧图标 -> %s" % (bn, bdir))

    for d, src, dst in plan:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        a = sha(src)
        shutil.copyfile(src, dst)
        b = sha(dst)
        if a != b:
            raise SystemExit("hash 不一致，已中止：" + d + "（用 --restore 回滚）")
        print("  OK %-16s %6d 字节  %s…" % (d, os.path.getsize(dst), b[:12]))

    # 落一份选择记录，免得下次开会话不知道当前用的是几号
    io.open(os.path.join(ICONS, "CURRENT.txt"), "w", encoding="utf-8", newline="\n").write(
        "当前图标方案：%d  %s\n应用时间：%s\n备份：%s\n" %
        (n, SCHEME_DIRS[n - 1], time.strftime("%Y-%m-%d %H:%M:%S"), bdir))
    print("\n完成。记得跑 python -X utf8 tools/build_apk.py 才会进新包。")
    print("回滚： python -X utf8 tools/apply_icon.py --restore")
    return 0


if __name__ == "__main__":
    sys.exit(main())
