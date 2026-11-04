# -*- coding: utf-8 -*-
"""一键同步：登录 -> 拉课表 -> 解析 -> 写 data/schedule.json + web/data.js + android/assets/data.js

用法：
    python core/sync.py 学号 密码            # 第一步：取验证码，图存 data/captcha.jpg
    python core/sync.py 学号 密码 验证码     # 第二步：登录 + 抓课表 + 写盘

环境变量（可选）：XXMU_XN / XXMU_XQ / XXMU_TERM，见 core/paths.py
"""
import sys, os, json, time, argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kingo, parse_kb, times as xtimes, normalize, paths

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
WEB = os.path.join(ROOT, "web")
ASSETS = os.path.join(ROOT, "android", "assets")

# 会话中间文件：放项目 data/ 下，别用 /tmp（Windows 没有）
STATE = os.path.join(DATA, "st.pkl")


def write_js(path, varname, obj):
    """写 window.XXX = {...}; 单行注入。file:// 下 fetch 被禁，只能 script 注入。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.%s = " % varname)
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")


def sync(user, pwd, captcha=None, push_assets=True):
    if captcha is None:
        _, img, state = kingo.login(user, pwd)
        os.makedirs(DATA, exist_ok=True)
        open(os.path.join(DATA, "captcha.jpg"), "wb").write(img)
        import pickle
        pickle.dump(([(c.name, c.value, c.domain, c.path) for c in state[0]],
                     state[1], state[2]), open(STATE, "wb"))
        return {"need_captcha": True, "img": os.path.join("data", "captcha.jpg")}

    import pickle, http.cookiejar
    cookies, sid, ssid = pickle.load(open(STATE, "rb"))
    cj = http.cookiejar.CookieJar()
    for n, v, d, p in cookies:
        cj.set_cookie(http.cookiejar.Cookie(0, n, v, None, False, d, True, False, p,
                                            True, False, None, True, None, None, {}))
    ck, _, _ = kingo.login(user, pwd, captcha=captcha, cookie_jar=cj)
    kingo.save_session(ck)
    html = kingo.fetch_schedule(ck, user, xn=paths.XN, xq=paths.XQ)
    if len(html) < 2000:
        raise RuntimeError("课表为空，可能学期参数不对或会话失效")

    cells = parse_kb.parse(html)
    # 前端只读 DATA.courses：这里必须补上扁平化课程表
    courses = normalize.normalize(cells)

    out = {"user": user, "synced_at": int(time.time()),
           "term": paths.TERM, "cells": cells, "courses": courses,
           "times": xtimes.TIMES,
           "count": sum(len(c["courses"]) for c in cells)}

    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "schedule.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 前端内嵌副本 + APK assets 副本（坑 1：两份必须同步）
    write_js(os.path.join(WEB, "data.js"), "SCHEDULE", out)
    if push_assets:
        write_js(os.path.join(ASSETS, "data.js"), "SCHEDULE", out)
    return out


def main():
    ap = argparse.ArgumentParser(description="青果课表同步")
    ap.add_argument("user", help="学号")
    ap.add_argument("pwd", help="密码")
    ap.add_argument("captcha", nargs="?", default=None, help="验证码；不给则只取图")
    ap.add_argument("--no-assets", action="store_true",
                    help="不同步写 android/assets/data.js")
    a = ap.parse_args()

    print("[env]", paths.describe())
    r = sync(a.user, a.pwd, a.captcha, push_assets=not a.no_assets)
    if r.get("need_captcha"):
        print("需要验证码，图在 %s —— 看清后重跑：python core/sync.py 学号 密码 验证码" % r["img"])
        return 3
    print("OK: %d 门课 · 写 data/schedule.json + web/data.js + android/assets/data.js"
          % r["count"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
