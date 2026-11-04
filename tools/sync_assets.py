#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 web/ 同步到 android/assets/，并校验 5 个文件逐字节一致。

改完前端必须跑这个，否则 APK 里是旧页面（HANDOFF 坑 1）。

用法：
    python tools/sync_assets.py          # 同步 + 校验
    python tools/sync_assets.py --check  # 只校验，不写
"""
import argparse
import hashlib
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web")
ASSETS = os.path.join(ROOT, "android", "assets")

FILES = ["index.html", "app.css", "app.js", "data.js", "homework.js"]


def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验不写")
    a = ap.parse_args()

    os.makedirs(ASSETS, exist_ok=True)
    bad = []
    for name in FILES:
        src = os.path.join(WEB, name)
        dst = os.path.join(ASSETS, name)
        if not os.path.exists(src):
            print("缺少源文件 web/%s" % name)
            bad.append(name)
            continue
        if not a.check:
            shutil.copyfile(src, dst)
            print("cp web/%-14s -> android/assets/" % name)
        a1, a2 = md5(src), (md5(dst) if os.path.exists(dst) else "MISSING")
        ok = a1 == a2
        print("%s %-14s %s" % ("OK  " if ok else "DIFF", name, a1[:12]))
        if not ok:
            bad.append(name)

    if bad:
        print("\n不一致：%s" % ", ".join(bad))
        return 1
    print("\n5/5 文件一致，assets 与 web 同步完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
