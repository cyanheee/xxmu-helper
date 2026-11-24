# -*- coding: utf-8 -*-
"""v1.1.90：把「登录成功」从 URL 猜测改成带 Cookie 真探一次。

只改 WebActivity.java 一个文件。所有替换都做「命中数量必须为 1」的硬校验，
任何一处对不上就整体放弃、不写盘（避免半改状态）。
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(ROOT, "android", "src", "com", "xxmu", "helper", "WebActivity.java")

src = io.open(F, encoding="utf-8", newline="").read()
orig = src

PATCHES = []


def patch(name, old, new):
    PATCHES.append((name, old, new))


# ---------- 1. import Toast ----------
patch(
    "import Toast",
    "import android.widget.TextView;\n",
    "import android.widget.TextView;\nimport android.widget.Toast;\n",
)

# ---------- 2. 新增 EXTRA_VERIFY_URL ----------
patch(
    "EXTRA_VERIFY_URL",
    '    /** 登录页的判据（出现任一即算没登录），用 "||" 分隔 */\n'
    '    public static final String EXTRA_BAD_HINTS = "bad_hints";\n',
    '    /** 登录页的判据（出现任一即算没登录），用 "||" 分隔 */\n'
    '    public static final String EXTRA_BAD_HINTS = "bad_hints";\n'
    '    /** v1.1.90：真校验用的探测地址（必须登录才看得到的页面）。\n'
    '     *  不传 = 按域名自动推导（青果走 /frame/homes.action）；传空串 = 不做真校验。 */\n'
    '    public static final String EXTRA_VERIFY_URL = "verify_url";\n',
)

# ---------- 3. 读完 extra ----------
patch(
    "read extra verifyUrl",
    "        grabSel = it.getStringExtra(EXTRA_GRAB);\n",
    "        grabSel = it.getStringExtra(EXTRA_GRAB);\n"
    "        verifyUrl = it.getStringExtra(EXTRA_VERIFY_URL);\n",
)

# ---------- 4. 字段 ----------
patch(
    "fields",
    "    private String lastUn = \"\";\n",
    '    private String lastUn = "";\n'
    "\n"
    "    /** v1.1.90：真校验的探测地址。null=按域名推导，\"\"=不校验（保持旧行为） */\n"
    "    private String verifyUrl = null;\n"
    "    /** 上次校验的时刻，用来节流：同一批页面跳转里连着触发 onPageFinished 时别打成一串 */\n"
    "    private long verifyAt = 0;\n"
    "    private boolean verifying = false;\n"
    "    /** 连续校验失败次数。>=1 时再点一次「完成」就强制返回，别把人卡死在登录页 */\n"
    "    private int verifyFail = 0;\n",
)

# ---------- 5. 「完成」按钮 ----------
patch(
    "done button",
    "            done.setOnClickListener(new View.OnClickListener() {\n"
    "                public void onClick(View v) {\n"
    "                    CookieManager.getInstance().flush();\n"
    "                    if (capture) finishWithCapture();\n"
    "                    else finishWithResult(true);\n"
    "                }\n"
    "            });\n",
    "            done.setOnClickListener(new View.OnClickListener() {\n"
    "                public void onClick(View v) {\n"
    "                    CookieManager.getInstance().flush();\n"
    "                    if (detectLogin) {\n"
    "                        /* v1.1.90：原来这里无条件 finishWithResult(true)，\n"
    "                         * 也就是用户什么都不填、直接按「完成」也会报登录成功。\n"
    "                         * 现在先真探一次；已经失败过一次的，第二下放行\n"
    "                         * （万一学校改了页面结构、探针失效，用户还有出路）。 */\n"
    "                        if (verifyFail >= 1) { finishWithResult(true); return; }\n"
    "                        verifyLogin(web == null ? null : web.getUrl(), true);\n"
    "                        return;\n"
    "                    }\n"
    "                    if (capture) finishWithCapture();\n"
    "                    else finishWithResult(true);\n"
    "                }\n"
    "            });\n",
)

# ---------- 6. onPageFinished ----------
patch(
    "onPageFinished",
    "                if (detectLogin && isLoggedInUrl(u)) {\n"
    "                    CookieManager.getInstance().flush();\n"
    "                    if (grabSel != null) {\n"
    "                        // 要读账号时不能直接 finishWithResult：那会丢掉用户刚填的学号。\n"
    "                        // completeCapture 一样是 RESULT_OK，上层照旧判登录成功，\n"
    "                        // 额外还能从 EXTRA_ACCOUNT 拿到账号。\n"
    "                        readPageState(true);\n"
    "                    } else {\n"
    "                        finishWithResult(true);\n"
    "                    }\n"
    "                }\n",
    "                if (detectLogin && isLoggedInUrl(u)) {\n"
    "                    loginHintsHit(u);\n"
    "                }\n",
)

VERIFY_CODE = r'''    /* ==================== 登录结果的真校验（v1.1.90） ====================
     *
     * 修的是「学号填了、密码没填，也报登录成功」。
     *
     * 老判据只看 URL 字符串（见 isLoggedInUrl）：青果在账号框填完、密码还没进门
     * 时地址栏就已经变了，靠 URL 猜必然误判；顶栏「完成」更直接无条件
     * setResult(RESULT_OK)。上层把假登录当真登录，把从未验证过的学号写进
     * pref 的 xxmu_verified，下一次抓课表被青果弹回 login.action ——
     * 用户看到的是「登录已失效，请重新登录」，一件 5 秒能说清的事被拖成连环故障。
     *
     * 现在的判据：拿 CookieManager 里的票，**真的去请求一个必须登录才看得到的
     * 页面**，四条全过才算成功：
     *   ① HTTP 200
     *   ② 正文 >= 1200 字节（未登录时青果对 /frame/* 统一回 547 字节的 alert 脚本）
     *   ③ 不含「凭证已失效」「请重新登录」（UTF-8 与 GBK 两种字节位都查）
     *   ④ 不含 frmbody / login.action 这两个未登录页的骨架锚点
     *
     * 为什么不看 status code：未登录时青果对 /frame/* 一律回 200，只是正文换成
     * 那段 alert 脚本，状态码毫无区分度（2026-11-14 实测五次探针全 200/547B）。
     *
     * 探测地址默认按域名推导；未知站点保持旧行为，不做真校验 —— 宁可漏判也不
     * 把没问题的站点卡住。
     */

    private static String originOf(String u) {
        if (u == null) return null;
        try {
            java.net.URL x = new java.net.URL(u);
            int p = x.getPort();
            String port = (p > 0 && p != 80 && p != 443) ? (":" + p) : "";
            return x.getProtocol() + "://" + x.getHost() + port + "/";
        } catch (Throwable e) {
            return null;
        }
    }

    /** 探测地址：显式传了就用传的，否则按域名推导，推不出来返回空串（=不校验） */
    private String resolveVerifyUrl(String pageUrl) {
        if (verifyUrl != null) return verifyUrl;
        if (pageUrl == null) return "";
        String low = pageUrl.toLowerCase();
        if (low.indexOf("qgjw.xxmu.edu.cn") >= 0) {
            return "https://qgjw.xxmu.edu.cn/frame/homes.action";
        }
        return "";
    }

    private static class Verdict {
        final boolean ok;
        final String why;

        Verdict(boolean o, String w) {
            ok = o;
            why = w;
        }
    }

    /**
     * 正文里找中文特征词。
     *
     * Http 把响应体按 ISO-8859-1 原样搬过来（每个 char = 一个字节位），所以在
     * Java 侧不能直接 indexOf 中文字面量 —— 得把特征词按 UTF-8 / GBK 各编一次
     * 再转成字节位形态去匹配。只编一次是错的：课表正文是 GBK、凭证失效提示是
     * UTF-8，同一台服务器两种编码都会出现（2026-11-14 实测该 alert 脚本是 UTF-8）。
     */
    private static boolean bodyHas(String body, String word) {
        if (body == null || body.length() == 0 || word == null || word.length() == 0) return false;
        try {
            if (body.indexOf(new String(word.getBytes("UTF-8"), "ISO-8859-1")) >= 0) return true;
        } catch (Throwable ignored) {
        }
        try {
            return body.indexOf(new String(word.getBytes("GBK"), "ISO-8859-1")) >= 0;
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** raw 是 Http.request 的返回值 "code|body" */
    private static Verdict judgeLogin(String raw) {
        if (raw == null || raw.length() == 0) {
            return new Verdict(false, "登录校验没有响应，请再试一次");
        }
        if (raw.startsWith("ERR:")) {
            return new Verdict(false, "登录校验失败（网络异常），请再试一次");
        }
        int p = raw.indexOf('|');
        if (p < 0) {
            return new Verdict(false, "登录校验失败（响应异常），请再试一次");
        }
        int code = 0;
        try {
            code = Integer.parseInt(raw.substring(0, p).trim());
        } catch (Throwable ignored) {
        }
        String body = raw.substring(p + 1);
        if (code != 200) {
            return new Verdict(false, "登录校验失败（HTTP " + code + "），请重新登录");
        }
        if (bodyHas(body, "凭证已失效") || bodyHas(body, "请重新登录")) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        if (body.indexOf("frmbody") >= 0 || body.indexOf("login.action") >= 0) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        if (body.length() < 1200) {
            return new Verdict(false, "还没登录成功：拿到的不是登录后的页面");
        }
        return new Verdict(true, "");
    }

    /**
     * 带 Cookie 真探一次，再决定要不要交回 RESULT_OK。
     *
     * @param manual 用户点的「完成」= true（失败会 toast 告诉他为什么）；
     *               页面自己跳转触发 = false（失败就静默，别在登录过程中反复弹）
     */
    private void verifyLogin(final String pageUrl, final boolean manual) {
        final String vu = resolveVerifyUrl(pageUrl);
        if (vu.length() == 0) {
            // 未知站点：保留旧判据，不在别人的网站上乱打请求
            CookieManager.getInstance().flush();
            if (grabSel != null) readPageState(true);
            else finishWithResult(true);
            return;
        }
        if (verifying) return;
        long now = System.currentTimeMillis();
        // 自动触发（页面跳转连击）才节流；用户手点「完成」必须每次都真跑
        if (!manual && now - verifyAt < 2000) return;
        verifyAt = now;
        verifying = true;

        final String cookie = CookieManager.getInstance().getCookie(vu);
        final String referer = originOf(vu);
        new Thread(new Runnable() {
            public void run() {
                String raw;
                try {
                    raw = Http.request(vu, "GET", null, cookie, null, referer, null);
                } catch (Throwable e) {
                    raw = "ERR:" + e.getClass().getSimpleName();
                }
                final Verdict v = judgeLogin(raw);
                runOnUiThread(new Runnable() {
                    public void run() {
                        verifying = false;
                        if (v.ok) {
                            verifyFail = 0;
                            CookieManager.getInstance().flush();
                            /* 要读账号时不能直接 finishWithResult：那会丢掉刚填的学号。
                             * completeCapture 同样是 RESULT_OK，还能从 EXTRA_ACCOUNT 取号。 */
                            if (grabSel != null) readPageState(true);
                            else finishWithResult(true);
                        } else {
                            // 只有用户手点的失败才计入「强制放行」次数：
                            // 页面跳转触发的失败可能只是他还没打完密码
                            if (manual) {
                                verifyFail++;
                                toastToUser(v.why + "。确认已经登录了？再按一次「完成」可强制返回");
                            }
                        }
                    }
                });
            }
        }, "xxmu-login-verify").start();
    }

    /** onPageFinished 命中 URL 判据之后的处理（抽出来，逻辑同 verifyLogin 的入口） */
    private void loginHintsHit(String u) {
        verifyLogin(u, false);
    }

    private void toastToUser(String msg) {
        try {
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        } catch (Throwable ignored) {
        }
    }

'''

patch(
    "insert verify code",
    "    /**\n     * 登录成功的判定。\n",
    VERIFY_CODE + "    /**\n     * 登录成功的判定。\n",
)


# ---------- 执行 ----------
for name, old, new in PATCHES:
    n = src.count(old)
    if n != 1:
        print("FAIL [%s]: 命中 %d 次（应为 1）" % (name, n))
        sys.exit(1)
    src = src.replace(old, new)
    print("ok   [%s]" % name)

if src == orig:
    print("FAIL: 内容没有变化")
    sys.exit(1)

io.open(F, "w", encoding="utf-8", newline="").write(src)

# ---------- 自检 ----------
chk = io.open(F, encoding="utf-8", newline="").read()
bad = []
if "\ufffd" in chk:
    bad.append("含 U+FFFD 替换字符（编码损坏）")
if chk.count("verifyLogin(") < 3:
    bad.append("verifyLogin 调用点不足")
if "import android.widget.Toast;" not in chk:
    bad.append("缺 Toast import")
if "EXTRA_VERIFY_URL" not in chk:
    bad.append("缺 EXTRA_VERIFY_URL")
# 花括号平衡（粗检）
if chk.count("{") != chk.count("}"):
    bad.append("花括号不平衡 %d/%d" % (chk.count("{"), chk.count("}")))
print("lines=%d bytes=%d" % (chk.count("\n") + 1, len(chk.encode("utf-8"))))
if bad:
    print("SELF-CHECK FAIL: " + "; ".join(bad))
    sys.exit(1)
print("SELF-CHECK PASS")
