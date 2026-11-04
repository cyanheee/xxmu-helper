#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复已生成数据里的失效链接（幂等，可反复运行）。

背景：早期版本把作业链接拼成 /mooc-ans/work/doHomeWork?...，实测该路径 404；
考试链接缺 examId 且依赖登录态。新版本统一改为「课程主页」深链。

本脚本扫描 data/homework.json，把指向死路径的 url 改写为课程主页，
并把原值存进 answer_url_legacy 便于对照。
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "homework.json")
WEB = os.path.join(ROOT, "web", "homework.js")
ASSETS = os.path.join(ROOT, "android", "assets", "homework.js")

HOST = "https://mooc1.chaoxing.com"
# 实测 404 / 不可靠的路径前缀
BAD_MARKERS = ("/mooc-ans/work/doHomeWork", "/exam-ans/exam/test/reVersionTestStartNew")


def course_page(item):
    return ("%s/visit/stucoursemiddle?courseid=%s&clazzid=%s&vc=1&cpi=%s"
            % (HOST, item.get("courseid", ""), item.get("classid", ""),
               item.get("cpi", "")))


def fix_item(item, key):
    url = item.get(key) or ""
    legacy = item.get("answer_url_legacy") or item.get("url_legacy") or ""
    bad = any(m in url for m in BAD_MARKERS) or not url
    if bad:
        if url:
            item[key + "_legacy"] = url
        item[key] = course_page(item)
        item["entry"] = "course"
        return True
    return False


def main():
    if not os.path.exists(DATA):
        print("找不到 %s" % DATA)
        return 1
    d = json.load(open(DATA, encoding="utf-8"))

    nw = sum(1 for w in d.get("works", []) if fix_item(w, "answer_url"))
    ne = sum(1 for e in d.get("exams", []) if fix_item(e, "url"))
    print("作业改写 %d 条，考试改写 %d 条" % (nw, ne))

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)

    payload = ("window.HOMEWORK = "
               + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
    for p in (WEB, ASSETS):
        if os.path.isdir(os.path.dirname(p)):
            with open(p, "w", encoding="utf-8") as f:
                f.write(payload)
            print("写入", os.path.relpath(p, ROOT))

    # 抽查
    print("\n抽查（前 3 条作业 / 前 3 场考试）：")
    for w in d.get("works", [])[:3]:
        print("  作业", w.get("answer_url", "")[:96])
    for e in d.get("exams", [])[:3]:
        print("  考试", e.get("url", "")[:96])
    return 0


if __name__ == "__main__":
    sys.exit(main())
