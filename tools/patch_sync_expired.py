# -*- coding: utf-8 -*-
"""v1.1.90：课表失效判据加 ASCII 锚点。

背景：青果未登录时对 /frame/* 与 /student/* 统一回一段 alert 脚本
（`<script>alert('温馨提示：凭证已失效，请重新登录!');if (window.frmbody){...}`，
547 原始字节 / 515 字符，HTTP 200）。这段是 **UTF-8**，不是 GBK。

老的判据只看解码后的中文字面量（凭证已失效 / login.action / 用户登录）。
decodeAuto 先试 UTF-8、失败才退 GBK —— 课表正文是 GBK，一旦某次响应里
混杂了 GBK 无法解成合法 UTF-8 的字节，整页会退到 GBK 解码，那段 UTF-8 的
提示词就变成乱码，`indexOf('凭证已失效')` 直接落空 → 失效页被当成正常课表
往下走，最后报「课表内容异常（547 字节）」，用户完全看不懂发生了什么。

修法：同时认两个 ASCII 锚点 —— 它们在 ISO-8859-1 字节位形态里就是纯 ASCII，
与编码猜测无关：`frmbody`、`window.top.location.href=`。
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(ROOT, "web", "sync.js")

src = io.open(F, encoding="utf-8", newline="").read()
orig = src

OLD_JUDGE = """        const text = decodeAuto(r.body);
        // 登录失效的典型特征（青果返回一段 alert 脚本）
        if (text.indexOf('凭证已失效') >= 0 || text.indexOf('login.action') >= 0
            || text.indexOf('用户登录') >= 0) {
          resolve({ ok: false, code: r.code, error: '登录已失效，请重新登录' });
          return;
        }
"""

NEW_JUDGE = """        const text = decodeAuto(r.body);
        // 登录失效的典型特征（青果返回一段 alert 脚本）
        if (kbExpired(text, r.body)) {
          resolve({ ok: false, code: r.code, error: '登录已失效，请重新登录' });
          return;
        }
"""

if src.count(OLD_JUDGE) != 1:
    print("FAIL [judge]: 命中 %d 次" % src.count(OLD_JUDGE))
    sys.exit(1)
src = src.replace(OLD_JUDGE, NEW_JUDGE)
print("ok   [judge]")

HELPER = """  /**
   * 青果「凭证已失效」判定（v1.1.90）。
   *
   * 两个来源同时看：
   *   ① raw —— Java 侧按 ISO-8859-1 原样搬过来的字节位（每个 char = 1 byte）。
   *      ASCII 锚点在这里一定认得出来，不受编码猜测影响。
   *   ② text —— decodeAuto 猜出来的正文，用来认中文特征词。
   *
   * 只认 ① 会漏掉「正常课表页里恰好有 login.action 字样」的情形吗？不会：
   * 失效页是整页只有那一段 alert，正文长度另外还有 < 2000 的兜底。
   * 只认 ② 会在编码猜错时整条判据失效（见文件头注释），所以必须有 ①。
   */
  function kbExpired(text, raw) {
    const t = text || '';
    if (t.indexOf('凭证已失效') >= 0 || t.indexOf('login.action') >= 0
        || t.indexOf('用户登录') >= 0) return true;
    const b = raw || '';
    if (b.indexOf('frmbody') >= 0) return true;
    // alert 脚本里必然把这些窗口链都写成 window.top.location.href='/'，
    // 正常课表页不会带这个片段。
    if (b.indexOf("window.top.location.href=") >= 0
        && b.indexOf('alert(') >= 0) return true;
    return false;
  }

"""

ANCHOR = "  /* ---------------- 课表解析（对齐 core/parse_kb.py） ---------------- */\n"
if src.count(ANCHOR) != 1:
    print("FAIL [anchor]: 命中 %d 次" % src.count(ANCHOR))
    sys.exit(1)
src = src.replace(ANCHOR, HELPER + ANCHOR)
print("ok   [helper]")

# 导出 kbExpired，供其它来源（考试安排等）复用
EXPORT_OLD = "    splitResp, decodeAuto, pref, toast, b64, net, netCk,\n"
EXPORT_NEW = "    splitResp, decodeAuto, kbExpired, pref, toast, b64, net, netCk,\n"
if src.count(EXPORT_OLD) != 1:
    print("WARN [export]: 未找到导出块，跳过")
else:
    src = src.replace(EXPORT_OLD, EXPORT_NEW)
    print("ok   [export]")

if src == orig:
    print("FAIL: 内容没有变化")
    sys.exit(1)

io.open(F, "w", encoding="utf-8", newline="").write(src)

chk = io.open(F, encoding="utf-8", newline="").read()
bad = []
if "\ufffd" in chk:
    bad.append("含 U+FFFD")
if chk.count("kbExpired") < 2:
    bad.append("kbExpired 引用不足")
print("lines=%d bytes=%d" % (chk.count("\n") + 1, len(chk.encode("utf-8"))))
if bad:
    print("SELF-CHECK FAIL: " + "; ".join(bad))
    sys.exit(1)
print("SELF-CHECK PASS")
