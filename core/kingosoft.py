# -*- coding: utf-8 -*-
"""喜鹊儿（青果 KINGOSOFT 掌上校园）接口客户端 —— 纯 Python 实现。

喜鹊儿就是青果系统官方 APP。XXMU 的青果教务(https://qgjw.xxmu.edu.cn) 与喜鹊儿
是同一套后端，所以走喜鹊儿接口拿课表比爬 HTML 页面稳得多：不需要验证码、
不需要 GBK 解析、不需要 node 跑 DES。

加密算法来自公开逆向资料（kingosoft_api）：
    param  = getParamEncode(明文参数串, encodeKey)
    param2 = md5( md5hex 去掉第 3/10/17/25 位 )
    token  = "00000"（未登录）或登录返回的 token
    appinfo= "android2.5.101"

只做只读查询：学校列表、登录、课表、作息时间。
"""
import hashlib
import json
import math
import urllib.parse
import urllib.request

# 旧文档写的是 :8080，2024 起该端口已关闭，接口迁到 80
BASE = "http://www.xiqueer.com/manager/wap/wapController.jsp"
ENCODE_KEY = "op5nb9"
APP_VER = "android2.5.101"
UA = "okhttp/3.12.0"

_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _to_b36(n: int) -> str:
    if n < 0:
        return "-" + _to_b36(-n)
    out = ""
    while True:
        out = _B36[n % 36] + out
        n //= 36
        if n <= 0:
            break
    return out


def get_param_encode(s: str, key: str = ENCODE_KEY) -> str:
    """对应 java EncodeAPI.getParamEncode / JS Encodeing.getParamEncode"""
    if not s or not key:
        return s
    kl = len(key)
    sl = len(s)
    n = math.ceil(sl / kl)
    n2 = math.ceil(sl * 3.0 * 6.0 / 9.0 / 6.0)   # = ceil(sl/3)
    add = (n2 * 6) % kl

    acc = []
    for i in range(n):
        for n3 in range(1, kl + 1):
            n4 = i * kl + n3                    # 1-based
            if n4 > sl:
                break
            v = ord(s[n4 - 1]) + ord(key[n3 - 1]) + add
            acc.append(str(v).rjust(3, "0")[-3:])
            if n4 == sl:
                break
    digits = "".join(acc)

    out = ""
    for i in range(0, len(digits), 9):
        chunk = digits[i:i + 9]
        out += _to_b36(int(chunk)).rjust(6, "0")[-6:]
    return out


def md5(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def get_param2_encode(s: str) -> str:
    """md5hex 去掉第 3/10/17/25 位（1-based）后再 md5"""
    h = md5(s)
    keep = [c for i, c in enumerate(h) if i not in (2, 9, 16, 24)]
    return md5("".join(keep))


def encode_payload(plain: str, token: str = "00000") -> dict:
    """返回 POST 表单字段 dict"""
    if plain.startswith("&"):
        plain = plain[1:]
    return {
        "param": get_param_encode(plain, ENCODE_KEY),
        "param2": get_param2_encode(plain),
        "token": token or "00000",
        "appinfo": APP_VER,
    }


def post(plain_params: str, token: str = "00000", timeout: int = 25) -> str:
    data = urllib.parse.urlencode(encode_payload(plain_params, token)).encode()
    req = urllib.request.Request(
        BASE, data=data,
        headers={"User-Agent": UA,
                 "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gbk", "replace")


def school_list(name_hint: str = "") -> list:
    """取学校列表；name_hint 非空则按名称过滤"""
    plain = "appver=%s&action=getAgent&xxmc=%s" % (APP_VER, name_hint)
    body = post(plain)
    try:
        data = json.loads(body)
    except Exception:
        raise RuntimeError("学校列表不是 JSON: " + body[:300])
    return data if isinstance(data, list) else [data]


def login_params(xxdm, login_id, password, sjxh="MI 8", os_="android", xtbb="10"):
    """参数顺序不能改"""
    return ("xxdm=%s&sjxh=%s&loginId=%s&sswl=55555&os=%s&xtbb=%s"
            "&appver=%s&action=getLoginInfoNew&isky=1&sjbz=&pwd=%s&loginmode=0"
            % (xxdm, sjxh, login_id, os_, xtbb, APP_VER, password))


def login(xxdm, login_id, password):
    """成功返回 dict（含 token/userid/uuid/xxdm 等），失败抛 RuntimeError"""
    body = post(login_params(xxdm, login_id, password))
    try:
        j = json.loads(body)
    except Exception:
        raise RuntimeError("登录返回不是 JSON: " + body[:300])
    if str(j.get("flag")) != "0":
        raise RuntimeError("登录失败: flag=%s msg=%s" % (j.get("flag"), j.get("msg")))
    return j


def course_params(user, week, xnxq, jsdm="", bjdm=""):
    return ("jsdm=%s&week=%s&xnxq=%s&channel=jrkb&usertype=%s&action=getKb"
            "&step=kbdetail_bz&userId=%s&bjdm=%s&sfid=%s&uuid=%s"
            % (jsdm, week, xnxq, user.get("usertype", "STU"),
               user.get("uuid", ""), bjdm, user.get("userid", ""),
               user.get("uuid", "")))


def get_courses(user, week, xnxq):
    body = post(course_params(user, week, xnxq), token=user.get("token", "00000"))
    try:
        return json.loads(body)
    except Exception:
        return {"raw": body[:2000]}
