package com.xxmu.helper;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewGroup.LayoutParams;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * 全屏 WebView 页面（登录教务 / 学习通作业考试 / 胖乖生活登录都在这里打开）。
 *
 * 为什么用 Activity 而不是 AlertDialog：
 *   早期版本把 WebView 塞进 AlertDialog.setView()，遇到两个死结——
 *   ① AlertDialog 的内容容器是 WRAP_CONTENT，LinearLayout 的 weight 不生效，
 *      WebView 高度算成 0，用户只看到标题栏和按钮；
 *   ② AlertDialog 的 Window 默认带 FLAG_ALT_FOCUSABLE_IM（"本窗口不需要软键盘"），
 *      点输入框软键盘弹不出来。
 *   Activity 的 Window 两个问题都没有：布局按屏幕算，输入法由系统正常接管。
 *
 * 三种用法：
 *   1) 普通打开网页          EXTRA_URL + EXTRA_TITLE
 *   2) 登录教务（自动判定）  EXTRA_DETECT_LOGIN = true
 *   3) 抓取态（胖乖生活）    EXTRA_CAPTURE = true
 *      打开 h5 后持续读取页面 location.href 与 localStorage.token，
 *      用户点「完成」或跳进带 machineId 的页面时回传 JSON 字符串给调用方。
 */
public class WebActivity extends Activity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_DETECT_LOGIN = "detect_login";
    public static final String EXTRA_CAPTURE = "capture";
    public static final String EXTRA_RESULT = "capture_result";
    /** 登录成功的判据（URL 里出现任一子串即算），用 "||" 分隔；不传则用教务的默认规则 */
    public static final String EXTRA_OK_HINTS = "ok_hints";
    /** 登录页的判据（出现任一即算没登录），用 "||" 分隔 */
    public static final String EXTRA_BAD_HINTS = "bad_hints";
    /** 从登录页里读出来的账号（学号）回传给调用方的 key，字符串 */
    public static final String EXTRA_ACCOUNT = "account";
    /**
     * 要读值的输入框选择器，逗号分隔，按顺序取第一个非空值。
     *
     * 用来回答「用户到底拿哪个学号登录的」这个问题。青果登录页的学号框是
     * input#username（旁边还有个同值的镜像框 #username1），学习通是 input#phone。
     * 一旦设置了这个参数，Activity 会启动轮询并把读到的值随结果一起交回，
     * 由上层判断「他登录的账号」与「软件里填的学号」是否一致。
     */
    public static final String EXTRA_GRAB = "grab";

    /** 读 location 与 localStorage 里的 token，返回一个 JSON 字符串 */
    private static final String CAPTURE_JS =
            "JSON.stringify({u:String(location.href),"
            + "t:(function(){try{return localStorage.getItem('token')"
            + "||localStorage.getItem('TOKEN')||''}catch(e){return ''}})(),"
            + "ls:(function(){try{return JSON.stringify(localStorage)}catch(e){return '{}'}})()})";

    /**
     * 登录页里那些「看起来有值、其实是装饰」的字符串。
     *
     * v1.1.2 的血案：青果登录页有两个账号框 —— 真输入框 input#username
     * 是 display:none，旁边那个可见的 input#username1 是**装饰框**，HTML 里
     * 直接写死 value="账号"（灰色，靠 focus 事件把自己 hide 掉、把真的 show 出来）。
     * 旧的抓取选择器把 #username1 排在第一位，于是永远读到「账号」这两个汉字，
     * 落进 pref 后就成了「你登录教务用的账号是：账号」，与真实学号对不上，
     * 同步被永久拦住 —— 而且换号、重登、重装都救不回来，因为每轮登录都会
     * 重新写一次「账号」。
     *
     * 所以：值和 placeholder 属性相同、或命中这张表的，一律当「没读到」。
     */
    private static final String[] PLACEHOLDER_WORDS = {
            "账号", "帐号", "学号", "用户名", "用户", "请输入账号", "请输入帐号",
            "请输入学号", "请输入用户名", "密码", "请输入密码", "手机号",
            "请输入手机号", "account", "username", "user", "password", "phone"
    };

    /** 这个值是不是占位提示、而不是用户真填的账号 */
    private static boolean isPlaceholderLike(String v) {
        if (v == null) return true;
        String s = v.trim();
        if (s.length() == 0) return true;
        for (int i = 0; i < PLACEHOLDER_WORDS.length; i++) {
            if (PLACEHOLDER_WORDS[i].equalsIgnoreCase(s)) return true;
        }
        return false;
    }

    /** 把占位词表编成一段 JS 数组字面量，塞进 buildGrabJs 里做二次过滤 */
    private static String placeholderJsArray() {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < PLACEHOLDER_WORDS.length; i++) {
            if (i > 0) b.append(',');
            b.append('"').append(PLACEHOLDER_WORDS[i].replace("\\", "\\\\")
                    .replace("\"", "\\\"")).append('"');
        }
        return b.append(']').toString();
    }

    /**
     * 读登录页输入框里的账号，返回纯字符串（不是 JSON）。
     *
     * 单独一条 JS 而不并进 CAPTURE_JS，是因为 CAPTURE_JS 的返回值要整体当
     * JSON 字符串交给上层解析，多一个字段就得改上层的解析；而账号这一步
     * 只需要一个干净的值，单独取更省事。
     *
     * 三道过滤（v1.1.2 加，缺一不可）：
     *   1. 跳过值是 placeholder 属性本身的元素（框架最常见的占位写法）
     *   2. 跳过值命中占位词表的元素（青果这种写死 value="账号" 的野生做法）
     *   3. 跳过 body 里根本没有、querySelector 返回 null 的选择器
     * 注意不能用「是否可见」当判据：青果的真输入框平时就是 display:none，
     * 只在聚焦那一刻才显示，按可见性筛会把唯一正确的框筛掉。
     */
    private static String buildGrabJs(String grabSel) {
        String sel = "\"\"";
        if (grabSel != null && grabSel.trim().length() > 0) {
            sel = "\"" + grabSel.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        }
        return "(function(){try{var s=" + sel + ";if(!s)return '';"
                + "var BAD=" + placeholderJsArray() + ";"
                + "var a=s.split(',');"
                + "for(var i=0;i<a.length;i++){var e=null;"
                + "try{e=document.querySelector(a[i])}catch(x){e=null}"
                + "if(!e||!e.value)continue;"
                + "var v=String(e.value).trim();"
                + "if(!v)continue;"
                + "var ph=e.getAttribute&&(e.getAttribute('placeholder')"
                + "||e.getAttribute('data-placeholder')||'');"
                + "if(ph&&v===String(ph).trim())continue;"
                + "var hit=false;"
                + "for(var j=0;j<BAD.length;j++){if(BAD[j]===v){hit=true;break}}"
                + "if(hit)continue;"
                + "return v;}"
                + "return '';}catch(e){return ''}})()";
    }

    /** evaluateJavascript 的返回值是一个带引号的 JS 字符串字面量，这里去掉引号与转义 */
    private static String unquote(String v) {
        if (v == null) return "";
        if (v.length() >= 2 && v.charAt(0) == '"' && v.charAt(v.length() - 1) == '"') {
            String s = v.substring(1, v.length() - 1);
            StringBuilder b = new StringBuilder(s.length());
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c == '\\' && i + 1 < s.length()) {
                    char n = s.charAt(i + 1);
                    if (n == '"' || n == '\\' || n == '/') { b.append(n); i++; continue; }
                    if (n == 'n') { b.append('\n'); i++; continue; }
                    if (n == 't') { b.append('\t'); i++; continue; }
                }
                b.append(c);
            }
            return b.toString();
        }
        if ("null".equals(v)) return "";
        return v;
    }

    private WebView web;
    private TextView titleView;
    private ProgressBar bar;
    private boolean detectLogin = false;
    private boolean capture = false;
    private boolean finishedOk = false;
    private String okHints = null;
    private String badHints = null;

    private Handler poller;
    private Runnable pollTask;
    /** 最近一次抓到的页面态（已是 JS 值形态：带引号的 JSON 字符串） */
    private String lastCap = "null";
    /** 要抓值的输入框选择器；非空即开启「读账号」模式，随结果回传 EXTRA_ACCOUNT */
    private String grabSel = null;
    /**
     * 用户在登录页里填过的账号。
     *
     * 必须由 Java 侧记住：登录提交之后页面整个换掉，新文档里 input#username
     * 已经不存在，读出来必是空串。所以每轮轮询只要读到非空值就留下来，
     * 最后随结果一起交回。
     */
    private String lastUn = "";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        Intent it = getIntent();
        String url = it.getStringExtra(EXTRA_URL);
        String title = it.getStringExtra(EXTRA_TITLE);
        detectLogin = it.getBooleanExtra(EXTRA_DETECT_LOGIN, false);
        capture = it.getBooleanExtra(EXTRA_CAPTURE, false);
        okHints = it.getStringExtra(EXTRA_OK_HINTS);
        badHints = it.getStringExtra(EXTRA_BAD_HINTS);
        grabSel = it.getStringExtra(EXTRA_GRAB);
        if (grabSel != null && grabSel.trim().length() == 0) grabSel = null;
        // 要读账号就必须持续轮询，否则用户登录完直接跳走，永远读不到输入框
        if (grabSel != null) capture = true;

        final float d = getResources().getDisplayMetrics().density;

        // ---- 根布局：竖向，顶栏固定 48dp，WebView 填满剩余（这里是 Activity，
        //      高度确定，weight 才真正生效）
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        final int barH = (int) (48 * d);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding((int) (8 * d), 0, 0, 0);
        top.setBackgroundColor(0xFFF2F3F5);

        Button close = new Button(this);
        close.setText("‹ 返回");
        close.setAllCaps(false);
        close.setTextSize(13);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setPadding(0, 0, (int) (8 * d), 0);
        close.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                if (capture) finishWithCapture();
                else finishWithResult(false);
            }
        });
        top.addView(close, new LinearLayout.LayoutParams(
                LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT));

        titleView = new TextView(this);
        titleView.setText(title == null ? "" : title);
        titleView.setTextSize(14);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f);
        tp.setMarginStart((int) (6 * d));
        top.addView(titleView, tp);

        // 回调模式下给一个显式「完成」：自动判定规则没命中时用户也能手动交回
        if (detectLogin || capture) {
            Button done = new Button(this);
            done.setText("完成");
            done.setAllCaps(false);
            done.setTextSize(13);
            done.setTextColor(0xFF1976D2);
            done.setBackgroundColor(Color.TRANSPARENT);
            done.setPadding(0, 0, (int) (10 * d), 0);
            done.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) {
                    CookieManager.getInstance().flush();
                    if (capture) finishWithCapture();
                    else finishWithResult(true);
                }
            });
            top.addView(done, new LinearLayout.LayoutParams(
                    LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT));
        }

        root.addView(top, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, barH));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setVisibility(View.GONE);
        root.addView(bar, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, (int) (3 * d)));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        /* v1.1.15：从 ALWAYS_ALLOW 收到 COMPATIBILITY_MODE。
         *
         * 原来是 ALWAYS_ALLOW —— https 页面里任何 http 资源（脚本、iframe、
         * 图片）一律放行。配合当时 Manifest 的 usesCleartextTraffic="true"，
         * 等于内嵌 WebView 这一路完全没有传输层保护：校园网里做一次
         * ARP/DNS 劫持，插进来的 http 脚本就能在教务页面的上下文里读到
         * 我们填进去的学号密码。
         *
         * COMPATIBILITY_MODE 的行为是「按现代浏览器的口径挡主动混合内容
         * （脚本 / iframe / XHR），被动内容（图片、样式）仍尝试加载」。
         * 选它而不是 BLOCK 的原因：
         *   · 实测青果登录页（/cas/login.action，35 KB）里没有任何 http 资源
         *     加载，只有两个页脚的 http **超链接**（xiqueer.com、kingosoft.com），
         *     href 不触发混合内容拦截，所以这不成问题；
         *   · 但胖乖生活 h5 与学习通的页面我们无法逐一离线核对，真 BLOCK 的
         *     失败方式是整页白屏 / 图片全裂，且无真机可验。
         * 这条改动的收益是「挡住了最危险的那一类（可执行内容）」，
         * 风险面则与改动前基本一致 —— 属于能确定拿到的收益。 */
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setJavaScriptCanOpenWindowsAutomatically(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String u) {
                return false;
            }

            @Override
            public void onPageFinished(WebView v, String u) {
                if (detectLogin && isLoggedInUrl(u)) {
                    CookieManager.getInstance().flush();
                    if (grabSel != null) {
                        // 要读账号时不能直接 finishWithResult：那会丢掉用户刚填的学号。
                        // completeCapture 一样是 RESULT_OK，上层照旧判登录成功，
                        // 额外还能从 EXTRA_ACCOUNT 拿到账号。
                        readPageState(true);
                    } else {
                        finishWithResult(true);
                    }
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                if (bar == null) return;
                if (p >= 100) bar.setVisibility(View.GONE);
                else { bar.setVisibility(View.VISIBLE); bar.setProgress(p); }
            }
        });

        root.addView(web, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        try {
            getWindow().setSoftInputMode(
                    android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                            | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED);
            getWindow().clearFlags(
                    android.view.WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        } catch (Throwable ignored) {
        }

        web.loadUrl(url);

        if (capture) startCapturePolling();
    }

    // ------------------------------------------------------------ 抓取态

    /**
     * 每 800ms 读一次页面态。
     *
     * 为什么要轮询而不是只听 onPageFinished：
     *   胖乖生活是 hash 路由（#/pages/waterMachine/...），用户点进机器详情时
     *   地址栏变但页面不重载，onPageFinished 不会再次触发。轮询是唯一稳的方式。
     *   同时登录成功后 token 落在 localStorage，也只能这么读。
     */
    private void startCapturePolling() {
        poller = new Handler(Looper.getMainLooper());
        pollTask = new Runnable() {
            public void run() {
                readPageState(false);
                if (poller != null) poller.postDelayed(this, 800);
            }
        };
        poller.postDelayed(pollTask, 1200);
    }

    private void readPageState(final boolean finishAfter) {
        if (web == null) {
            if (finishAfter) finishWithResult(false);
            return;
        }
        grabAccount(finishAfter);
    }

    /**
     * 先读页面态，再读账号框。
     *
     * 分两次 evaluateJavascript 而不是一条：CAPTURE_JS 的返回值要整体当
     * JSON 字符串转给上层，往里塞字段会牵连上层解析；账号只要一个裸值。
     */
    private void grabAccount(final boolean finishAfter) {
        if (web == null) return;
        try {
            web.evaluateJavascript(CAPTURE_JS, new ValueCallback<String>() {
                public void onReceiveValue(String v) {
                    if (v != null && v.length() > 4 && !"null".equals(v)) lastCap = v;
                    if (grabSel == null) { afterRead(finishAfter); return; }
                    try {
                        web.evaluateJavascript(buildGrabJs(grabSel), new ValueCallback<String>() {
                            public void onReceiveValue(String iv) {
                                String s = unquote(iv);
                                /* 第三道过滤落在 Java 侧：JS 那层已经滤过占位词，
                                 * 这里再滤一次是防「学校把占位词改成别的写法」时
                                 * 旧 JS 逻辑（或缓存的老 assets）把脏值写进 pref。
                                 * 脏值一旦落盘就是永久的，代价远大于多判一次。 */
                                if (s.length() > 0 && !isPlaceholderLike(s)) lastUn = s;
                                afterRead(finishAfter);
                            }
                        });
                    } catch (Throwable e) {
                        afterRead(finishAfter);
                    }
                }
            });
        } catch (Throwable e) {
            if (finishAfter) completeCapture();
        }
    }

    /** 一轮读完之后：要么收工，要么判断是否该自动收工 */
    private void afterRead(boolean finishAfter) {
        if (finishAfter) { completeCapture(); return; }
        if (!capture) return;
        if (lastCap != null && lastCap.indexOf("machineId") >= 0
                && lastCap.indexOf("\"t\":\"\"") < 0) {
            // 已进入机器页且拿到 token：直接收工，用户不用再点
            completeCapture();
        }
    }

    private void finishWithCapture() {
        // 先同步取一次最新状态，再返回；取不到就直接交回上一次的
        if (web == null) { completeCapture(); return; }
        readPageState(true);
        // readPageState(true) 的回调里会 completeCapture()，这里不重复 finish
    }

    private void completeCapture() {
        if (finishedOk) return;
        finishedOk = true;
        try {
            Intent r = new Intent();
            r.putExtra(EXTRA_RESULT, lastCap == null ? "null" : lastCap);
            r.putExtra(EXTRA_ACCOUNT, lastUn == null ? "" : lastUn);
            setResult(RESULT_OK, r);
        } catch (Throwable ignored) {
        }
        finish();
    }

    /**
     * 登录成功的判定。
     *
     * 默认是教务的规则：已离开 cas 登录页且进了 frame/student 业务页。
     * 学习通传进来自己的规则（离开 passport 且进了 mooc 业务页），
     * 因为两套系统的路径毫无共同点，写死一套必然误判。
     */
    private boolean isLoggedInUrl(String u) {
        if (u == null) return false;
        if (badHints != null && badHints.length() > 0) {
            for (String h : badHints.split("\\|\\|")) {
                if (h.length() > 0 && u.contains(h)) return false;
            }
        } else if (u.contains("/cas/")) {
            return false;
        }
        if (okHints != null && okHints.length() > 0) {
            for (String h : okHints.split("\\|\\|")) {
                if (h.length() > 0 && u.contains(h)) return true;
            }
            return false;
        }
        return u.contains("/frame/") || u.contains("/student/") || u.contains("/jsxsd/");
    }

    private void finishWithResult(boolean ok) {
        if (finishedOk) return;
        finishedOk = true;
        setResult(ok ? RESULT_OK : RESULT_CANCELED);
        finish();
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            if (web != null && web.canGoBack()) {
                web.goBack();
                return true;
            }
            if (capture) finishWithCapture();
            else finishWithResult(false);
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        try {
            if (poller != null && pollTask != null) poller.removeCallbacks(pollTask);
            poller = null;
            pollTask = null;
        } catch (Throwable ignored) {
        }
        try {
            if (web != null) {
                ViewGroup p = (ViewGroup) web.getParent();
                if (p != null) p.removeView(web);
                web.destroy();
                web = null;
            }
        } catch (Throwable ignored) {
        }
        super.onDestroy();
    }
}
