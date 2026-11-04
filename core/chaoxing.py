#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""学习通（超星）作业待办读取 —— 只读，不做任何提交动作。

Cookie 来源：Android 学习通 App 的 WebView cookie 库
  /data/data/com.chaoxing.mobile/app_webview/Default/Cookies  (需 root)
  已复制到 COOKIE_DB 指定路径，chaoxing.com 域的 value 为明文，可用 sqlite3 直读。

接口链路（三步，全部已验证 200）：
  1) GET https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json
     -> channelList[].content.id = classId, .course.data[0].id = courseId, .cpi
  2) GET https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=&clazzid=&vc=1&cpi=
     -> 正则 data="(/work/getAllWork?...&enc=<32hex>&openc=<32hex>)"   (enc 每门课动态)
  3) GET https://mooc1.chaoxing.com + 上一步 href
     ** 必须 Referer 指向第 2 步页面，否则返回 3004「无访问权限」**

解析：<li style="padding:30px 0"> 块
  a.inspectTask  title=作业名  data=workId  data2=(relationId)
  开始时间：</span>YYYY-MM-DD HH:MM
  截止时间：</span>YYYY-MM-DD HH:MM
  作业状态：</span>... </strong>
"""
import os
import re
import json
import sqlite3
import time
import urllib.request
import urllib.error

UA = ("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")

HOST = "https://mooc1.chaoxing.com"
API_HOST = "https://mooc1-api.chaoxing.com"


def course_page_url(c, tab="work"):
    """课程主页深链（稳定入口）。

    坑：以前直接拼 /mooc-ans/work/doHomeWork 和
    /exam-ans/exam/test/reVersionTestStartNew，实测这些路径**自带 404**
    （不是登录问题，是端点本身无效）。而课程主页
      /visit/stucoursemiddle?courseid=..&clazzid=..&vc=1&cpi=..
    是学习通 App 和网页都会用的入口，只要用户在学习通里已登录就一定打得开，
    页面上有「作业 / 考试」tab，点一下就到对应列表。

    所以这里统一跳到课程主页，tab 参数仅作为记录（学习通不认这个 query，
    但保留下来便于以后换更精确的深链时不用改数据结构）。
    """
    return ("%s/visit/stucoursemiddle?courseid=%s&clazzid=%s&vc=1&cpi=%s"
            % (HOST, c["cid"], c["clid"], c["cpi"]))

try:
    from paths import COOKIE_DB  # 跨平台：环境变量 XXMU_COOKIE_DB > 手机/PC 默认
except Exception:  # 单文件直接跑时兜底
    COOKIE_DB = "/sdcard/Download/DSH-Go/cx_cookies.db"

# 只要 chaoxing 域里的会话相关 cookie，减少请求头体积
KEEP_PREFIX = ("_uid", "_d", "UID", "_tid", "fid", "fidsCount", "uf", "vc3",
               "xxtenc", "p_auth_token", "sso_puid", "sso_role", "sso_schooltime",
               "sso_t", "sso_v", "cx_p_token", "DSSTASH_LOG", "KI4SO_SERVER_EC",
               "route", "JSESSIONID")


class CookieExpired(Exception):
    """学习通登录态失效：需要用户打开 App 重新登录一次。"""


def load_cookies(db_path=None):
    """从 WebView cookie 库读出 chaoxing.com 域 cookie（明文）。返回 dict。"""
    db_path = db_path or COOKIE_DB
    if not os.path.exists(db_path):
        raise CookieExpired(f"cookie 库不存在：{db_path}（需先复制 App 的 Cookies 文件）")
    con = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
    try:
        ck = {}
        for host, name, val in con.execute(
                "select host_key,name,value from cookies where host_key like '%chaoxing.com'"):
            if val:
                ck[name] = val
    finally:
        con.close()
    if not ck:
        raise CookieExpired("cookie 库中没有 chaoxing.com 的明文 cookie")
    return ck


def cookie_header(ck):
    return "; ".join("%s=%s" % (k, v) for k, v in ck.items())


def _get(url, ck, referer=None, timeout=30):
    headers = {
        "User-Agent": UA,
        "Cookie": cookie_header(ck),
        "Accept": "text/html,application/xhtml+xml,application/json,*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    try:
        raw = urllib.request.urlopen(req, timeout=timeout).read()
    except urllib.error.HTTPError as e:
        raise CookieExpired("HTTP %s @ %s" % (e.code, url))
    except urllib.error.URLError as e:
        raise CookieExpired("网络错误 %s @ %s" % (e.reason, url))
    # 学习通部分页面 GBK，但作业接口是 UTF-8
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gbk", "replace")


def _check_alive(html, what=""):
    if "passport2.chaoxing.com" in html or "用户登录" in html:
        raise CookieExpired("学习通登录态失效（%s），请在 App 内重新登录" % what)
    if "您长时间没有操作" in html and "3004" in html:
        raise CookieExpired("学习通返回 3004 无访问权限（%s），cookie 或 Referer 失效" % what)


def list_courses(ck):
    """返回 [{cid,clid,cpi,name,className}]"""
    html = _get(API_HOST + "/mycourse/backclazzdata?view=json", ck)
    _check_alive(html, "课程列表")
    try:
        data = json.loads(html)
    except json.JSONDecodeError:
        raise CookieExpired("课程列表不是 JSON，可能登录态失效")
    if data.get("result") != 1:
        raise CookieExpired("课程列表返回 result=%s msg=%s" % (data.get("result"), data.get("msg")))
    out = []
    for ch in data.get("channelList") or []:
        content = ch.get("content") or {}
        courses = (content.get("course") or {}).get("data") or []
        if not courses:
            continue
        ct = courses[0]
        out.append({
            "cid": str(ct["id"]),
            "clid": str(content.get("id") or ch.get("key")),
            "cpi": str(ch.get("cpi") or content.get("cpi") or ""),
            "name": ct.get("name", "").strip(),
            "className": content.get("name", "").strip(),
        })
    return out


def _course_page_url(c):
    return ("%s/visit/stucoursemiddle?courseid=%s&clazzid=%s&vc=1&cpi=%s"
            % (HOST, c["cid"], c["clid"], c["cpi"]))


def get_work_href(ck, c):
    """抓课程中间页，返回作业清单的相对 href（含 enc/openc）。无作业 tab 返回 None。"""
    page = _course_page_url(c)
    html = _get(page, ck)
    _check_alive(html, "课程页 " + c["name"])
    m = re.search(r'data="(/work/getAllWork\?[^"]+)"', html)
    if not m:
        return None, page
    return m.group(1).replace("&amp;", "&"), page


def parse_works(html, c):
    """解析作业清单页 -> list[dict]"""
    works = []
    for blk in re.split(r'(?=<li\s+style="padding:30px 0")', html)[1:]:
        blk = blk.split("</li>")[0]
        if "作业状态" not in blk:
            continue
        a = re.search(
            r'class="inspectTask"[^>]*?title="([^"]*)"[^>]*?data="(\d+)"[^>]*?data2="(\d+)"',
            blk, re.S)
        if a:
            name, workid, relid = a.group(1).strip(), a.group(2), a.group(3)
        else:
            nm = re.search(r'title="([^"]+)"', blk)
            wid = re.search(r'inspectTask"[^>]*data="(\d+)"', blk)
            name = nm.group(1).strip() if nm else "(未命名作业)"
            workid = wid.group(1) if wid else ""
            relid = ""
        st = re.search(r"开始时间：</span>([^<]*)", blk)
        en = re.search(r"截止时间：</span>([^<]*)", blk)
        s = re.search(r"作业状态：</span>(.*?)</strong>", blk, re.S)
        status = re.sub(r"<[^>]+>", "", s.group(1)).strip() if s else ""
        works.append({
            "course": c["name"],
            "courseid": c["cid"],
            "classid": c["clid"],
            "cpi": c["cpi"],
            "name": name,
            "start": st.group(1).strip() if st else "",
            "end": en.group(1).strip() if en else "",
            "status": status,
            "workid": workid,
            "relationid": relid,
            # 深层作业页路径实测 404，统一走课程主页（页面上有作业 tab）
            "answer_url": course_page_url(c, "work"),
            "entry": "course",
        })
    return works


def fetch_works(ck, c):
    href, page = get_work_href(ck, c)
    if not href:
        return []
    html = _get(HOST + href, ck, referer=page)
    _check_alive(html, "作业清单 " + c["name"])
    return parse_works(html, c)


def _due_ts(w):
    try:
        return time.mktime(time.strptime(w["end"], "%Y-%m-%d %H:%M"))
    except Exception:
        return 9e18


OPEN_STATES = ("待做", "重新编辑")


def sync(db_path=None):
    """拉全部课程作业，返回 {synced_at,total,pending,works,errors}"""
    ck = load_cookies(db_path)
    courses = list_courses(ck)
    works, exams, errors = [], [], []
    for c in courses:
        try:
            works.extend(fetch_works(ck, c))
        except CookieExpired as e:
            raise
        except Exception as e:                       # 单门课失败不影响整体
            errors.append({"course": c["name"], "error": "%s: %s" % (type(e).__name__, e)})
        try:
            exams.extend(fetch_exams(ck, c))
        except CookieExpired as e:
            raise
        except Exception as e:
            errors.append({"course": c["name"], "exam": "%s: %s" % (type(e).__name__, e)})

    works.sort(key=_due_ts)
    exams.sort(key=lambda e: e.get("start") or "9999")
    pending = [w for w in works if w["status"] in OPEN_STATES]
    return {
        "synced_at": int(time.time()),
        "source": "chaoxing",
        "total": len(works),
        "pending": len(pending),
        "courses": len(courses),
        "works": works,
        "exams": exams,
        "exam_total": len(exams),
        "errors": errors,
    }


# ---------------------------------------------------------------- 考试（只读）
EXAM_HREF_RE = re.compile(r'data="(/exam-ans/exam/test\?[^"]+)"')


def get_exam_href(ck, c):
    """课程中间页里的「考试」入口，返回 (href, page_url)。无入口返回 (None, page)。"""
    page = _course_page_url(c)
    html = _get(page, ck)
    _check_alive(html, "课程页 " + c["name"])
    m = EXAM_HREF_RE.search(html)
    if not m:
        return None, page
    return m.group(1).replace("&amp;", "&"), page


def parse_exams(html, c):
    """解析考试列表页（只读）。

    单项结构：
        <a ... onclick="goTest('<cid>',<relationId>,0,'<截止 2026-11-07 23:00:00.0>',<paperId>,false,'<hash>');"
           title="大学生安全教育——激情犯罪课后测试题">...</a>
        <span class="pt5"><span class="fl">考试时间：</span>2026-10-30 18:06 至 2026-11-07 23:00</span>
        <span class="pt5"><span class="fl">考试状态：</span><strong>待做</strong></span>
        ... 分数： <strong>90分</strong> | 查看排名
    空列表页内为 <p ...>暂无内容</p>。
    """
    if "暂无内容" in html:
        return []
    exams = []
    seg = html
    i = seg.find('class="ulDiv"')
    if i > 0:
        seg = seg[i:]
    for blk in re.split(r"<li[\s>]", seg)[1:]:
        blk = blk.split("</li>")[0]
        if "考试时间" not in blk:
            continue
        # 标题
        t = re.search(r'title="([^"]{2,120})"', blk)
        title = t.group(1).strip() if t else ""
        # 时间区间
        tm = re.search(r"考试时间：</span>\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})\s*至\s*"
                       r"([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})", blk)
        start = tm.group(1) if tm else ""
        end = tm.group(2) if tm else ""
        # 状态
        st = re.search(r"考试状态：</span>\s*<strong>\s*(.*?)\s*</strong>", blk, re.S)
        status = re.sub(r"<[^>]+>", "", st.group(1)) if st else ""
        status = (status.replace("&nbsp;", " ").replace("[重考]", "")
                  .replace("\u00a0", " ").strip())
        # 成绩
        sc = re.search(r">\s*([0-9]+(?:\.[0-9]+)?)\s*分\s*<", blk)
        score = sc.group(1) if sc else ""
        # goTest 参数：courseId, relationId, ?, 截止时间, paperId, false, hash
        gm = re.search(r"goTest\(\s*'?(\d+)'?\s*,\s*(\d+)\s*,\s*(\d+)\s*,", blk)
        relid = gm.group(2) if gm else ""
        examid = ""
        pm = re.search(r"goTest\([^)]*,\s*(\d{6,})\s*,\s*(?:true|false)", blk)
        if pm:
            examid = pm.group(1)
        exams.append({
            "course": c["name"],
            "courseid": c["cid"],
            "classid": c["clid"],
            "cpi": c["cpi"],
            "name": title or "(未命名考试)",
            "start": start,
            "end": end,
            "status": status,
            "score": score,
            "relationid": relid,
            "examid": examid,
            # 同上：考试深层路径要靠 examId 且必须带登录态，统一走课程主页
            "url": course_page_url(c, "exam"),
            "entry": "course",
        })
    return exams


def fetch_exams(ck, c):
    href, page = get_exam_href(ck, c)
    if not href:
        return []
    html = _get(HOST + href, ck, referer=page)
    _check_alive(html, "考试列表 " + c["name"])
    return parse_exams(html, c)


if __name__ == "__main__":
    d = sync()
    print("课程 %d 门，作业 %d 条，待做 %d 条" % (d["courses"], d["total"], d["pending"]))
    for w in d["works"]:
        print("  %-22s %-26s %-17s %s" % (w["course"][:20], w["name"][:24], w["end"], w["status"]))
    for e in d["errors"]:
        print("  ! ", e)
