# -*- coding: utf-8 -*-
"""跨平台路径解析：Android(Termux) / PC 通用。

优先级：环境变量 > 自动探测（Android 上 /sdcard 存在则用手机路径）> PC 默认（项目内 data/）。

可用环境变量：
    XXMU_COOKIE_DB   学习通 cookie 库路径（sqlite，只读）
    XXMU_PUSH_DIR    推送目标目录（默认手机上 App 的外部数据目录）
    XXMU_PUSH        1/0，是否把 homework.json 推到手机目录（PC 默认 0）
    XXMU_XN          学年，如 2026
    XXMU_XQ          学期，0=秋季/1=春季
    XXMU_TERM        学期标签，仅用于展示，如 2026-2027-1
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def env(name, default=""):
    v = os.environ.get(name)
    return default if v is None or v.strip() == "" else v.strip()


IS_ANDROID = os.path.exists("/sdcard") or env("PREFIX").find("com.termux") >= 0


def _flag(name, default):
    v = env(name, "").lower()
    if not v:
        return default
    return v not in ("0", "false", "no", "off")


# 学习通 cookie 库：手机上是从 App 复制出来的，PC 上是 adb pull 下来的副本
COOKIE_DB = env("XXMU_COOKIE_DB") or (
    "/sdcard/Download/DSH-Go/cx_cookies.db" if IS_ANDROID
    else os.path.join(ROOT, "data", "cx_cookies.db")
)

# 手机端 App 的外部数据目录（不重打包换数据用的投放位置）
PUSH_DIR = env("XXMU_PUSH_DIR") or "/sdcard/Android/data/com.xxmu.helper/files"

# 是否推送：Android 默认开，PC 默认关（PC 上直接重打包或手动 adb push）
PUSH = _flag("XXMU_PUSH", IS_ANDROID)

# 学期参数
XN = env("XXMU_XN", "2026")
XQ = env("XXMU_XQ", "0")
TERM = env("XXMU_TERM", "2026-2027-1")


def describe():
    """给 sync 脚本打印用的一行环境说明。"""
    return ("platform=%s | cookie_db=%s | push=%s(%s) | xn=%s xq=%s"
            % ("android" if IS_ANDROID else "pc", COOKIE_DB,
               PUSH, PUSH_DIR, XN, XQ))
