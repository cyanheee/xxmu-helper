#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PC 端一键同步：青果课表 + 学习通作业 -> data/*.json + web/*.js + android/assets/*.js

用法：
    python tools/sync_all.py                    # 全量（课表用已保存的 session 直接拉，免验证码）
    python tools/sync_all.py --login 学号 密码   # 强制重新登录（会存验证码图，需人工看图再跑一次）
    python tools/sync_all.py --captcha 1234      # 用刚才的验证码完成登录并同步
    python tools/sync_all.py --hw-only           # 只同步作业
    python tools/sync_all.py --kb-only           # 只同步课表
    python tools/sync_all.py --no-assets         # 不同步 android/assets（只改 web/ 时用）

退出码：0 成功 / 2 登录态失效 / 3 需要人工输入验证码 / 4 部分失败
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CORE = os.path.join(ROOT, "core")
sys.path.insert(0, CORE)

import paths          # noqa: E402
import kingo          # noqa: E402
import parse_kb       # noqa: E402
import normalize      # noqa: E402
import times as xtimes  # noqa: E402
import sync as S      # noqa: E402
import sync_hw as SH  # noqa: E402
import chaoxing       # noqa: E402


def banner(msg):
    print("\n=== %s  %s ===" % (msg, time.strftime("%Y-%m-%d %H:%M:%S")))


def do_kb(user=None, pwd=None, captcha=None, assets=True):
    """课表：有 session 就直接拉；否则需要登录（验证码要人工看图）。"""
    ck = kingo.load_session()
    if ck:
        banner("课表：复用 session")
        try:
            u = user or _session_user()
            html = kingo.fetch_schedule(ck, u, xn=paths.XN, xq=paths.XQ)
            if len(html) < 2000:
                raise RuntimeError("课表 HTML 太短（%d），可能 session 过期" % len(html))
            return _write_schedule(html, u, assets)
        except Exception as e:
            print("session 失效（%s），需要重新登录" % e)
    # 账号密码兜底：环境变量 XXMU_USER / XXMU_PWD（cron 用）或命令行
    user = user or paths.env("XXMU_USER")
    pwd = pwd or paths.env("XXMU_PWD")
    if not (user and pwd):
        print("没有可用 session，且未提供学号密码：请跑 --login 学号 密码，"
              "或设 XXMU_USER / XXMU_PWD")
        return "need_login"
    banner("课表：登录")
    r = S.sync(user, pwd, captcha, push_assets=assets)
    if r.get("need_captcha"):
        print("验证码图 -> %s" % r["img"])
        print("看清后跑：python tools/sync_all.py --captcha 验证码")
        return "need_captcha"
    print("课表 OK：%d 门课" % r["count"])
    return "ok"


def _session_user():
    """从已有 schedule.json 里取学号，避免命令行重复输入。"""
    import json
    p = os.path.join(ROOT, "data", "schedule.json")
    try:
        return json.load(open(p, encoding="utf-8")).get("user")
    except Exception:
        return None


def _write_schedule(html, user, assets):
    cells = parse_kb.parse(html)
    if not cells:
        raise RuntimeError("解析出 0 个课表格子，页面结构可能变了")
    courses = normalize.normalize(cells)
    out = {"user": user, "synced_at": int(time.time()), "term": paths.TERM,
           "cells": cells, "courses": courses, "times": xtimes.TIMES,
           "count": sum(len(c["courses"]) for c in cells)}
    import json
    with open(os.path.join(ROOT, "data", "schedule.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    S.write_js(os.path.join(ROOT, "web", "data.js"), "SCHEDULE", out)
    if assets:
        S.write_js(os.path.join(ROOT, "android", "assets", "data.js"), "SCHEDULE", out)
    print("课表 OK：%d 门课 / %d 个格子" % (len(courses), len(cells)))
    return "ok"


def do_hw(assets=True):
    banner("作业：学习通")
    try:
        d = SH.build()
    except chaoxing.CookieExpired as e:
        print("学习通登录态失效：%s" % e)
        print("→ 手机重登学习通后 adb pull，路径见 XXMU_COOKIE_DB=%s" % paths.COOKIE_DB)
        return "cookie_expired"
    import json
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "homework.json"), "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    payload = ("window.HOMEWORK = "
               + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
    targets = [os.path.join(ROOT, "web", "homework.js")]
    if assets:
        targets.append(os.path.join(ROOT, "android", "assets", "homework.js"))
    for p in targets:
        with open(p, "w", encoding="utf-8") as f:
            f.write(payload)
    print("作业 OK：课程 %d 门 / 作业 %d 条 / 待做 %d 条 / 考试待考 %d"
          % (d["courses"], d["total"], d["pending"], d.get("exam_upcoming", 0)))
    if d["errors"]:
        print("单门课失败 %d 个：" % len(d["errors"]))
        for e in d["errors"][:5]:
            print("  - %s: %s" % (e.get("course"), e.get("error")))
    return "ok"


def main():
    ap = argparse.ArgumentParser(description="PC 一键同步（课表 + 作业）")
    ap.add_argument("--login", nargs=2, metavar=("学号", "密码"), help="强制重新登录教务")
    ap.add_argument("--captcha", help="验证码（配合上次 --login 产生的图）")
    ap.add_argument("--user", help="学号（复用 session 时可选，默认读 schedule.json）")
    ap.add_argument("--kb-only", action="store_true")
    ap.add_argument("--hw-only", action="store_true")
    ap.add_argument("--no-assets", action="store_true", help="不写 android/assets")
    a = ap.parse_args()

    assets = not a.no_assets
    print("[env] " + paths.describe())

    results = {}
    if not a.hw_only:
        user = (a.login[0] if a.login else None) or a.user or _session_user()
        pwd = a.login[1] if a.login else None
        results["kb"] = do_kb(user, pwd, a.captcha, assets)
    if not a.kb_only:
        results["hw"] = do_hw(assets)

    print("\n--- 汇总 ---")
    for k, v in results.items():
        print("  %s: %s" % (k, v))

    if "need_captcha" in results.values():
        return 3
    if "cookie_expired" in results.values() or "need_login" in results.values():
        return 2
    if any(v != "ok" for v in results.values()):
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
