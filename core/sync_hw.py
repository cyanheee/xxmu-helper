#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键同步学习通作业待办 -> data/homework.json + App 外部目录。

用法：
    python3 core/sync_hw.py            # 同步并写盘
    python3 core/sync_hw.py --no-push  # 只写 data/homework.json，不推手机外部目录
"""
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import chaoxing  # noqa: E402
import paths  # noqa: E402

DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "homework.json")
WEB_OUT = os.path.join(ROOT, "web", "homework.js")
ASSETS_OUT = os.path.join(ROOT, "android", "assets", "homework.js")
EXTERNAL = os.path.join(paths.PUSH_DIR, "homework.json")

OPEN_STATES = ("待做", "重新编辑")


def build():
    d = chaoxing.sync()
    # 标注每条的优先级与倒计时基准
    now = time.time()
    for w in d["works"]:
        try:
            due = time.mktime(time.strptime(w["end"], "%Y-%m-%d %H:%M"))
            w["left_hours"] = round((due - now) / 3600.0, 1)
            w["expired"] = due < now and w["status"] in OPEN_STATES
        except Exception:
            w["left_hours"] = None
            w["expired"] = False
        w["open"] = w["status"] in OPEN_STATES
    d["pending"] = sum(1 for w in d["works"] if w["open"])

    # 考试同样补倒计时（只读展示，不做任何答题动作）
    exams = d.get("exams") or []
    for e in exams:
        try:
            st = time.mktime(time.strptime(e["start"], "%Y-%m-%d %H:%M"))
            en = time.mktime(time.strptime(e["end"], "%Y-%m-%d %H:%M"))
        except Exception:
            e["left_hours"] = None
            e["upcoming"] = False
            continue
        e["left_hours"] = round((en - now) / 3600.0, 1)
        e["starts_in_h"] = round((st - now) / 3600.0, 1)
        e["upcoming"] = e.get("status") in ("未开始", "待做", "进行中")
        e["expired"] = en < now and e.get("status") in ("未开始", "待做", "进行中")
    d["exams"] = exams
    d["exam_upcoming"] = sum(1 for e in exams if e.get("upcoming"))
    d["term_label"] = "学习通"
    return d


def main():
    no_push = "--no-push" in sys.argv or not paths.PUSH
    print("[env] " + paths.describe())
    try:
        d = build()
    except chaoxing.CookieExpired as e:
        print("登录态失效：%s" % e)
        print("→ 手机上：打开学习通 App 重新登录，然后重新复制 Cookies：")
        print("  su -c 'cp /data/data/com.chaoxing.mobile/app_webview/Default/Cookies "
              "/sdcard/Download/DSH-Go/cx_cookies.db'")
        print("→ 电脑上：adb pull 到 %s" % paths.COOKIE_DB)
        return 2

    os.makedirs(DATA, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)

    # 前端内嵌副本（file:// 下 fetch 被禁，只能用 script 注入）
    payload = ("window.HOMEWORK = "
               + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
    for p in (WEB_OUT, ASSETS_OUT):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(payload)

    print("写入 %s" % OUT)
    print("写入 %s" % WEB_OUT)
    print("写入 %s" % ASSETS_OUT)
    print("课程 %d 门 · 作业 %d 条 · 待做 %d 条" % (d["courses"], d["total"], d["pending"]))
    for w in d["works"]:
        mark = "!" if w["open"] else " "
        print(" %s %-20s %-26s %-17s %s" %
              (mark, w["course"][:18], w["name"][:24], w["end"], w["status"]))
    if d["errors"]:
        print("\n单门课失败：")
        for e in d["errors"]:
            print("  - %s: %s" % (e["course"], e["error"]))

    if not no_push:
        try:
            os.makedirs(os.path.dirname(EXTERNAL), exist_ok=True)
            shutil.copyfile(OUT, EXTERNAL)
            print("\n已推送 -> %s" % EXTERNAL)
        except Exception as e:
            print("\n推送外部目录失败（%s: %s）" % (type(e).__name__, e))
            print("→ 需 root 建目录：su -c 'mkdir -p %s'" % os.path.dirname(EXTERNAL))
    return 0


if __name__ == "__main__":
    sys.exit(main())
