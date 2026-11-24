# -*- coding: utf-8 -*-
# 一次性诊断：本机 session 能否复现真机的「框架页活、业务 jsp 全凭证失效」。
# 用 write 落盘再跑，避开 pwsh here-string 吞掉 python 原始字符串引号的坑。
import sys, os
ROOT = "C:/Users/Administrator/Desktop/xxmuhelper/xxmu-app"
sys.path.insert(0, os.path.join(ROOT, "core"))
import kingo

ck = kingo.load_session()
print("COOKIE", ck)
paths = [
    "/",
    "/frame/homes.action",
    "/Ajax.do",
    "/STU_DynamicInitDataAction.do?classPath=",
    "/DyxyyjtzAction.do?xn=2026",
    "/student/ksap.ksap.jsp?menucode=S20302",
    "/public/SchoolNotice.jsp",
    "/frame/desk/changeUserGroupcode.action?groupcode=",
    "/frame/homepage?method=getTempDeskey",
]
for p in paths:
    try:
        h = kingo.get_gbk(p, ck or "", timeout=20)
        stale = ("凭证已失效" in h) or ("请重新登录" in h) or ("娓╅Θ" in h)
        print(p, "LEN", len(h), "STALE", stale, "HEAD", repr(h[:80]))
    except Exception as e:
        print(p, "ERR", type(e).__name__, str(e)[:120])
