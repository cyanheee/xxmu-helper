# -*- coding: utf-8 -*-
"""青果(KINGOSOFT)「考试安排」端点复验探针（落码前一次性，只读）。

用 data/session.json 里现成的教务登录态：
  1) 挖登录后框架页/菜单树里「考试」相关链接与 menucode；
  2) 按 core/kingo.py 的 GRADE_PATHS 候选试探模式，试几条常见考试安排 jsp，
     谁返回带「课程名称/考试时间/考场」的真表就认谁。
只读，不提交、不改任何业务文件。用完即可删。
"""
import json, os, re, urllib.request

BASE = "https://qgjw.xxmu.edu.cn"
UA = ("Mozilla/5.0 (Linux; Android 14; PLK110) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
SESS = os.path.join(HERE, "..", "data", "session.json")

cookie = ""
try:
    cookie = json.load(open(SESS, encoding="utf-8"))["cookie"]
    print("SESSION cookie len=%d : %s..." % (len(cookie), cookie[:40]))
except Exception as e:
    print("NO_SESSION", e)


def get(path, ref=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Cookie": cookie,
         "Referer": ref or (BASE + "/frame/homes.action"),
         "X-Requested-With": "XMLHttpRequest"}
    req = urllib.request.Request(BASE + path, headers=h)
    raw = urllib.request.urlopen(req, timeout=25).read()
    for enc in ("gbk", "utf-8"):
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode("utf-8", "replace")


def looks_stale(html):
    return ("凭证已失效" in html or "请重新登录" in html
            or ("用户登录" in html and "password" in html))


print("########## MENU HUNT ##########")
for p in ["/frame/homes.action", "/frame/homepage.action", "/"]:
    try:
        html = get(p)
        print("== %s len=%d stale=%s ==" % (p, len(html), looks_stale(html)))
        for m in re.finditer(r'[^>\n]{0,80}考试[^<\n]{0,80}', html):
            print("  EXAM-TXT:", m.group(0).strip()[:160])
        hrefs = re.findall(
            r'(?:href|url|action)\s*[=:]\s*["\']?([^"\'>\s]+\.jsp[^"\'>\s]*)',
            html, re.I)
        for hh in sorted(set(hrefs)):
            if any(k in hh.lower() for k in ("ks", "exam", "ap", "kao")):
                print("  EXAM-HREF:", hh[:160])
        mc = set(re.findall(r'menucode[=:]\s*["\']?(S?\d+)', html, re.I))
        print("  MENUCODES:", sorted(mc)[:80])
    except Exception as e:
        print("== %s ERR %s ==" % (p, e))

print("########## CANDIDATE PROBE ##########")
CANDS = [
    "/student/ksap.ksap.jsp?menucode=S20302",
    "/student/xsks.ksap.jsp?menucode=S20302",
    "/student/ksap.xsksap.jsp?menucode=S20302",
    "/student/xsksap.ksap.jsp",
    "/student/kscx.ksap.jsp?menucode=S20302",
    "/student/ksxt.ksap.jsp",
    "/student/wsxk.xskcb_excel10319.jsp",  # 已知课表页，验证 cookie 活性
]
for p in CANDS:
    try:
        html = get(p)
        kws = {k: html.count(k) for k in
               ("考试", "考场", "考试时间", "课程名称", "座位",
                "凭证已失效", "请重新登录")}
        print("== %s len=%d ==" % (p, len(html)))
        print("   %s" % kws)
        print("   " + repr(html[:300]))
    except Exception as e:
        print("== %s ERR %s ==" % (p, e))
