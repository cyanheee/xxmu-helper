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
import android.widget.Toast;

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
    /** v1.1.68：带着活登录态打开教务页，让用户自己点进「考试安排」，
     *  按「完成」把整页文字/表格回传给前端解析（见 FIND_JS）。 */
    public static final String EXTRA_FIND = "find";
    /** v1.1.71：双探模式——拦「检索」发出的请求 URL + 钩「导出/打印」下载 URL，
     *  按「完成」把候选地址连同整页一起回传，之后照课表用带 Cookie 的桥全自动重放。 */
    public static final String EXTRA_PROBE = "probe";
    /** 登录成功的判据（URL 里出现任一子串即算），用 "||" 分隔；不传则用教务的默认规则 */
    public static final String EXTRA_OK_HINTS = "ok_hints";
    /** 登录页的判据（出现任一即算没登录），用 "||" 分隔 */
    public static final String EXTRA_BAD_HINTS = "bad_hints";
    /** v1.1.90：真校验用的探测地址（必须登录才看得到的页面）。
     *  不传 = 按域名自动推导（青果走 /frame/homes.action）；传空串 = 不做真校验。 */
    public static final String EXTRA_VERIFY_URL = "verify_url";
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

    /**
     * 青果登录页的手机适配（v1.1.38 起，v1.1.85 改为纯 CSS 重排）。
     *
     * 现象：青果 cas/login.action 的 .login-info-div 固定 760px 宽（380 内容 + 380 padding-left），
     * 整页 scrollWidth 约 1280px；手机 WebView 布局视口只有 360~412px，
     * 于是账号/密码/验证码三行输入框被推到屏幕右外侧，用户只看到校徽与背景插画，
     * 无论怎么上下左右滑都够不到（body 还带 scroll=no，.main-div 是绝对定位）。
     *
     * 为什么不再用 zoom：v1.1.38~v1.1.84 走的是给 html/body 设 zoom 缩放整页，
     * 760px 缩到 412px 只有 0.54 倍，16px 的字变成 8.6px，输入框实际只剩 200px 宽，
     * 学生根本没法看清和输入；而且只给 html 设 zoom 会被 body 的 width 二次覆盖，
     * 实测仍向右溢出 210px。
     *
     * 现在的做法：把 .mainbanner/.main-div/.logo-div 的绝对高度全部压平，
     * 去掉 .login-info-div 的 padding-left:380px，三行 tab 改成 100% 宽 + table-layout:fixed，
     * 输入框保持 16px，登录按钮 48px 满宽；412/360/492 三种视口实测横向溢出元素 = 0。
     *
     * 只在青果登录页注入：靠 #login-info-div / .login-div-float / form#dosub 三个特征判断，
     * 因为 WebActivity 还要开学习通登录、课表、考试安排这些页面，它们不能被套用。
     * 幂等：注入前查 style#xxmu-fit，重复调用直接返回。
     */
    private static final String FIT_CSS =
            "html,body{margin:0!important;padding:0!important;width:auto!important;"
            + "min-width:0!important;overflow-x:hidden!important}"
            + ".mainbanner,.mainbanner1{display:none!important}"
            + ".top_bg{display:none!important}"
            + ".main-div{position:static!important;height:auto!important;width:auto!important;"
            + "margin:0!important;padding:8px 14px 22px!important;box-sizing:border-box!important}"
            + ".logo-div{position:static!important;width:auto!important;margin:0!important;"
            + "padding:0!important;text-align:center!important;box-sizing:border-box!important}"
            + ".logo-div table,.logo-div tbody,.logo-div tr,.logo-div td{display:block!important;"
            + "width:auto!important;height:auto!important;margin:0!important;padding:0!important;"
            + "text-align:center!important}"
            + ".logo-div img{float:none!important;"
            + "vertical-align:middle!important;max-width:44%!important;height:auto!important;"
            + "margin:2px 4px!important}"
            + ".login-div-float{display:none!important}"
            + ".login-div{width:auto!important;margin:0!important;padding:0!important;text-align:left!important}"
            + ".login-div-title{position:static!important;width:auto!important;height:auto!important;"
            + "padding:0!important;margin:2px 0 8px!important;text-align:center!important}"
            + ".login-div-title img{width:auto!important;max-width:128px!important;height:30px!important;"
            + "object-fit:contain!important;margin:0 3px!important}"
            + ".login-info-div,.login-info-div1{position:static!important;width:auto!important;"
            + "height:auto!important;padding:0!important;margin:0!important}"
            + ".login-info-div1{display:none!important}"
            + ".login-td{padding:0!important}"
            + ".login-table{width:100%!important;table-layout:fixed!important}"
            + ".tab1,.tab2,.tab3{width:100%!important;height:46px!important;margin:0 0 10px!important;"
            + "padding:0 10px!important;box-sizing:border-box!important;background:#ecf5fa!important;"
            + "border:1px solid #cbcccd!important;border-radius:8px!important;table-layout:fixed!important}"
            + ".tab1 tr,.tab2 tr,.tab3 tr{width:100%!important}"
            + ".tab1 td:first-child,.tab2 td:first-child,.tab3 td:first-child{width:30px!important}"
            + ".tab1 td:first-child img,.tab2 td:first-child img,.tab3 td:first-child img{"
            + "width:19px!important;height:19px!important;object-fit:contain!important}"
            + ".tx1,.tx2,.tx3{width:100%!important;max-width:100%!important;height:40px!important;"
            + "line-height:40px!important;font-size:16px!important;padding:0 2px!important;"
            + "margin:0!important;border:0!important;background:transparent!important;"
            + "box-sizing:border-box!important}"
            + ".tpwd{display:inline-block!important;width:22px!important;vertical-align:middle!important}"
            + "#sp_random{font-size:12px!important}"
            + "#login,input.login{display:block!important;position:static!important;left:auto!important;"
            + "right:auto!important;float:none!important;width:100%!important;max-width:100%!important;"
            + "margin:8px 0 0!important;padding:0!important;height:48px!important;line-height:48px!important;"
            + "font-size:18px!important;box-sizing:border-box!important;color:#fff!important;"
            + "background:#2f7bd6!important;background-image:none!important;border:0!important;"
            + "border-radius:8px!important}"
            + "#setCookie,#lbl_setCookie{width:18px!important;height:18px!important;"
            + "vertical-align:middle!important}"
            + "#pub-xl,#pub-timetable,#pub-notice,#pub-rule,#pub-jsizt,#pub-dl{display:inline-block!important;"
            + "font-size:14px!important;margin:6px 6px 0!important}"
            + "#randpic,.bottom-tips,.bottom_bg,.bottom,#bottom{display:none!important}"
            + ".logo-div td:last-child img{display:none!important}"
            + "input,select,textarea,table,td,tr,div{max-width:100%!important}";

    private static final String FIT_JS =
            "(function(){try{"
            + "if(!document.querySelector('#login-info-div,.login-div-float,form#dosub'))return 'skip';"
            + "if(document.getElementById('xxmu-fit'))return 'ok';"
            + "var s=document.createElement('style');s.id='xxmu-fit';s.type='text/css';"
            + "s.appendChild(document.createTextNode('" + FIT_CSS + "'));"
            + "var h=document.head||document.documentElement;h.appendChild(s);"
            + "try{if(document.documentElement.style.zoom)document.documentElement.style.zoom='';}catch(e2){}"
            + "try{if(document.body&&document.body.style.zoom)document.body.style.zoom='';}catch(e3){}"
            + "var m=document.querySelector('meta[name=viewport]');"
            + "if(m)m.setAttribute('content','width=device-width, initial-scale=1.0');"
            + "var bt=document.getElementById('login');"
            + "if(bt){if(!bt.value||!bt.value.trim())bt.value='\\u767b\\u5f55';bt.style.backgroundImage='none';"
            + "bt.style.backgroundColor='#2f7bd6';bt.style.color='#fff';}"
            + "var hideBroken=function(){try{var im=document.images,i2;"
            + "for(i2=0;i2<im.length;i2++){var g=im[i2];"
            + "if(!g.getAttribute('src'))continue;"
            + "if(g.complete&&g.naturalWidth===0)g.style.display='none';}}catch(e4){}};"
            + "hideBroken();"
            + "try{setTimeout(hideBroken,600);setTimeout(hideBroken,1800);"
            + "setTimeout(hideBroken,3500);}catch(e5){}"
            + "return 'fit';"
            + "}catch(e){return 'err'}})()";

    /** 读 location 与 localStorage 里的 token，返回一个 JSON 字符串 */
    private static final String CAPTURE_JS =
            "JSON.stringify({u:String(location.href),"
            + "t:(function(){try{return localStorage.getItem('token')"
            + "||localStorage.getItem('TOKEN')||''}catch(e){return ''}})(),"
            + "ls:(function(){try{return JSON.stringify(localStorage)}catch(e){return '{}'}})()})";

    /**
     * v1.1.69：把当前页 + 递归到的每个 <frame>/<iframe> 的正文、表格、
     * 表格行、下拉已选值整体回传。
     *
     * 为什么返回对象而不是 JSON 字符串：evaluateJavascript 对「对象结果」
     * 直接给出 JSON 文本，省掉 CAPTURE_JS 那种「字符串结果还带一层引号」
     * 的二次解析，前端 __onXqFind 一次 JSON.parse 就能拿到整包。
     *
     * 为什么改（m01910 第三轮真机）：v1.1.68 只读 iframe，青果 V17 的
     * 「课程考试 → 考试安排表」是 <frameset>/<frame> 布局，检索出来的表在
     * 子 frame 里，顶层 document.body 近空 → 回传一片空白 → 报「没认出」。
     * window.frames 同时覆盖 <frame> 与 <iframe>，逐个取 .document 读，
     * 同源才读得到（跨域抛 SecurityError 就留空，诊断里看得见）。
     * raw 是上面那些块拼起来的人能读的原文：认不出时前端把它摊进粘贴框，
     * 让人能看见读到了什么、改一改再导入，而不是对着一句 toast 干瞪眼。
     */
    private static final String FIND_JS =
            "(function(){"
            + "var o={u:String(location.href),text:'',rows:[],tables:[],sels:[],frames:[],raw:''};"
            + "function T(s){return String(s==null?'':s)}"
            + "function A(p,s){s=T(s);if(s)p.push(s)}"
            + "function grabDoc(d){"
            + "var r={text:'',rows:[],tables:[],sels:[]};if(!d)return r;"
            + "try{r.text=T((d.body&&(d.body.innerText||d.body.textContent))||(d.documentElement&&d.documentElement.innerText)||'').slice(0,30000)}catch(e){}"
            + "try{var tr=d.getElementsByTagName('tr');for(var i=0;i<tr.length&&i<400;i++){A(r.rows,tr[i].innerText||tr[i].textContent||'')}}catch(e){}"
            + "try{var tb=d.getElementsByTagName('table');for(var j=0;j<tb.length&&j<20;j++){A(r.tables,T(tb[j].innerText||tb[j].textContent||'').slice(0,6000))}}catch(e){}"
            + "try{var se=d.getElementsByTagName('select');for(var k=0;k<se.length&&k<20;k++){var s=se[k],v='';try{var op=s.options[s.selectedIndex];v=op?(op.text||op.value):''}catch(x){}A(r.sels,v)}}catch(e){}"
            + "return r}"
            + "var top=grabDoc(document);"
            + "o.text=top.text;o.rows=top.rows;o.tables=top.tables;o.sels=top.sels;"
            /* v1.1.72：框架是嵌套的（门户 frameset 一层、业务页里再 iframe 一层）。
             * 只读 window.frames 一层会漏掉最里面那张表，改成逐层往下走，深度限 3。 */
            + "function walk(w,depth){"
            + "if(depth>3||!w)return;"
            + "var W=null;try{W=w.frames}catch(x){W=null}"
            + "if(!W)return;"
            + "for(var f=0;f<W.length&&f<20;f++){"
            + "var fr={u:'',text:'',rows:[],tables:[],sels:[]};"
            + "var cw=null;try{cw=W[f]}catch(x){cw=null}"
            + "if(!cw)continue;"
            + "try{fr.u=T(cw.location&&cw.location.href)}catch(x){}"
            + "var dd=null;try{dd=cw.document}catch(x){dd=null}"
            + "if(dd){var g=grabDoc(dd);fr.text=g.text;fr.rows=g.rows;fr.tables=g.tables;fr.sels=g.sels}"
            + "o.frames.push(fr);"
            + "walk(cw,depth+1)}}"
            + "try{walk(window,1)}catch(e){}"
            + "var parts=[];"
            + "A(parts,o.text);o.rows.forEach(function(x){A(parts,x)});o.tables.forEach(function(x){A(parts,x)});"
            + "if(o.sels.length)A(parts,o.sels.join('  '));"
            + "o.frames.forEach(function(fr){A(parts,fr.text);fr.rows.forEach(function(x){A(parts,x)});fr.tables.forEach(function(x){A(parts,x)});if(fr.sels&&fr.sels.length)A(parts,fr.sels.join('  '))});"
            + "o.raw=parts.join('\\n').slice(0,60000);"
            + "return o})()";

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
    /** v1.1.68：找考试安排模式：复用 capture 的「完成」按钮/轮询，但读整页文字而非账号框 */
    private boolean find = false;
    /** v1.1.71：双探模式。shouldInterceptRequest 拦「检索」发出的数据请求，
     *  DownloadListener 钩「导出/打印」的报表 URL，按「完成」一并回传。 */
    private boolean probe = false;
    /** 记到的候选请求，每条是一个 JSON 字符串 {url,method,kind}。 */
    private final java.util.ArrayList<String> probes = new java.util.ArrayList<String>();
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

    /** v1.1.90：真校验的探测地址。null=按域名推导，""=不校验（保持旧行为） */
    private String verifyUrl = null;
    /** 上次校验的时刻，用来节流：同一批页面跳转里连着触发 onPageFinished 时别打成一串 */
    private long verifyAt = 0;
    private boolean verifying = false;
    /** 连续校验失败次数。>=1 时再点一次「完成」就强制返回，别把人卡死在登录页 */
    private int verifyFail = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        Intent it = getIntent();
        String url = it.getStringExtra(EXTRA_URL);
        String title = it.getStringExtra(EXTRA_TITLE);
        detectLogin = it.getBooleanExtra(EXTRA_DETECT_LOGIN, false);
        capture = it.getBooleanExtra(EXTRA_CAPTURE, false);
        find = it.getBooleanExtra(EXTRA_FIND, false);
        // find 复用 capture 的「完成」按钮与轮询，但页面不按 URL 自动收工：
        // 用户要在教务框架里自己点进考试安排，最后按「完成」交回当前页文字。
        if (find) capture = true;
        probe = it.getBooleanExtra(EXTRA_PROBE, false);
        // 双探复用 find 的整页读取 + capture 的「完成」按钮/轮询，
        // completeCapture 会把拦到的候选地址并进回传对象。
        if (probe) { find = true; capture = true; }
        okHints = it.getStringExtra(EXTRA_OK_HINTS);
        badHints = it.getStringExtra(EXTRA_BAD_HINTS);
        grabSel = it.getStringExtra(EXTRA_GRAB);
        verifyUrl = it.getStringExtra(EXTRA_VERIFY_URL);
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
                    if (detectLogin) {
                        /* v1.1.90：原来这里无条件 finishWithResult(true)，
                         * 也就是用户什么都不填、直接按「完成」也会报登录成功。
                         * 现在先真探一次；已经失败过一次的，第二下放行
                         * （万一学校改了页面结构、探针失效，用户还有出路）。 */
                        if (verifyFail >= 1) { finishWithResult(true); return; }
                        verifyLogin(web == null ? null : web.getUrl(), true);
                        return;
                    }
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

        /* v1.1.39：内嵌教务/学习通页面也关掉系统的自动反色。
         * 青果登录页本来就是按桌面 760px 写的、靠 FIT_JS 缩放，再被 WebView
         * 反一遍色后输入框与提示文字的对比度会乱掉（表单「看得见但读不清」）。
         * 官方页面按它自己的配色显示，不参与 App 的深浅主题。 */
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                s.setAlgorithmicDarkeningAllowed(false);
            } else if (android.os.Build.VERSION.SDK_INT >= 29) {
                s.setForceDark(WebSettings.FORCE_DARK_OFF);
            }
        } catch (Throwable ignored) {
        }

        web.setWebViewClient(new WebViewClient() {
            /* v1.1.71 双探 A：旁路记下「检索」那一刻页面发出的数据请求 URL。
             * 只记地址、返回 null 让 WebView 照常加载，不改页面行为；
             * 像课表那样的 GET 报表地址随后由前端带 Cookie 全自动重放。 */
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView v, android.webkit.WebResourceRequest req) {
                try {
                    if (probe && req != null && req.getUrl() != null) {
                        String m = "GET";
                        try { m = req.getMethod(); } catch (Throwable ignored) {}
                        recordProbe(req.getUrl().toString(), m, "request");
                    }
                } catch (Throwable ignored) {}
                return null;
            }

            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView v, String u) {
                try { if (probe) recordProbe(u, "GET", "request"); } catch (Throwable ignored) {}
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String u) {
                return false;
            }

            @Override
            public void onPageFinished(WebView v, String u) {
                /* v1.1.38：先纠正桌面版页面的宽度，再判登录。
                 * 青果登录页 760px 宽的表单在 412px 视口里被推到屏幕外，
                 * 用户看不到账号密码框（详见 FIT_JS 注释）。
                 * 走 evaluateJavascript 而不是注入 <meta>：页面已经加载完，
                 * 改 meta 不会重排，改 zoom 才会立刻生效。 */
                try {
                    v.evaluateJavascript(FIT_JS, null);
                } catch (Throwable ignored) {
                }
                if (detectLogin && isLoggedInUrl(u)) {
                    loginHintsHit(u);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            /* v1.1.72：把「新窗口」接回同一个 WebView。
             *
             * 五轮真机的共同症结在这里：青果「考试安排表」按「检索」之后，
             * 结果是用 window.open / target=_blank 弹出来的。WebView 默认
             * supportMultipleWindows=true，而我们没覆写 onCreateWindow，
             * 于是每个新窗口都成了一个没内容的 about:blank —— 这正好对上
             * m02177 诊断里的「#1 about:blank 0字/0表」，也解释了为什么
             * 人明明看到表了、程序按「完成」却只读到门户框架页。
             *
             * 做法：临时开一个 WebView 接住这个窗口，它的首个真实地址一到，
             * 立刻交给主 WebView 加载，然后销毁临时的那个。用户看起来就是
             * 检索结果直接在眼前展开，按「完成」时读到的就是这张表。 */
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, android.os.Message resultMsg) {
                try {
                    if (resultMsg == null || !(resultMsg.obj instanceof WebView.WebViewTransport)) {
                        return false;
                    }
                    final WebView tmp = new WebView(WebActivity.this);
                    WebSettings ts = tmp.getSettings();
                    ts.setJavaScriptEnabled(true);
                    ts.setDomStorageEnabled(true);
                    ts.setLoadWithOverviewMode(true);
                    ts.setUseWideViewPort(true);
                    tmp.setWebViewClient(new WebViewClient() {
                        private void take(String u) {
                            if (u == null || u.length() < 8 || u.startsWith("about:")) return;
                            try { tmp.stopLoading(); } catch (Throwable ignored) {}
                            try { tmp.destroy(); } catch (Throwable ignored) {}
                            if (web != null) web.loadUrl(u);
                        }
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView v, String u) {
                            take(u);
                            return true;
                        }
                        @Override
                        public void onPageStarted(WebView v, String u, android.graphics.Bitmap f) {
                            take(u);
                        }
                    });
                    WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                    t.setWebView(tmp);
                    resultMsg.sendToTarget();
                    return true;
                } catch (Throwable e) {
                    return false;
                }
            }

            @Override
            public void onProgressChanged(WebView v, int p) {
                if (bar == null) return;
                if (p >= 100) bar.setVisibility(View.GONE);
                else { bar.setVisibility(View.VISIBLE); bar.setProgress(p); }
            }
        });
        /* v1.1.71 双探 B：钩住「导出 / 打印」触发的下载——这类按钮最像课表的
         * *_excel*.jsp?params= 报表地址，是全自动重放最稳的一路。
         * 只记 URL，不真正下载文件（不落盘、不打断用户操作）。 */
        web.setDownloadListener(new android.webkit.DownloadListener() {
            public void onDownloadStart(String u, String userAgent,
                    String contentDisposition, String mimetype, long contentLength) {
                try { if (probe) recordProbe(u, "GET", "download"); } catch (Throwable ignored) {}
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
        if (find) { grabFind(finishAfter); return; }
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

    /** v1.1.68：找考试安排模式的一轮读取。
     *  FIND_JS 返回对象，evaluateJavascript 直接给 JSON 文本，存进 lastCap，
     *  由 completeCapture 原样放进 EXTRA_RESULT；不走账号框、不按 machineId 自动收工。 */
    private void grabFind(final boolean finishAfter) {
        if (web == null) { if (finishAfter) completeCapture(); return; }
        try {
            web.evaluateJavascript(FIND_JS, new ValueCallback<String>() {
                public void onReceiveValue(String v) {
                    if (v != null && v.length() > 4 && !"null".equals(v)) lastCap = v;
                    if (finishAfter) completeCapture();
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

    /** v1.1.71：把一条候选请求记进 probes（去重、限量、滤掉明显静态资源）。
     *  注意别用 low.indexOf(".js") 过滤脚本——".jsp" 会被它误伤。 */
    private void recordProbe(String url, String method, String kind) {
        if (!probe || url == null) return;
        String u = url.trim();
        if (u.length() < 8 || u.length() > 2000) return;
        String low = u.toLowerCase();
        if (u.startsWith("about:") || u.startsWith("data:")
                || low.indexOf(".css") >= 0 || low.indexOf(".png") >= 0
                || low.indexOf(".jpg") >= 0 || low.indexOf(".gif") >= 0
                || low.indexOf(".woff") >= 0 || low.indexOf(".ico") >= 0
                || low.indexOf(".svg") >= 0) return;
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("url", u);
            o.put("method", method == null ? "GET" : method);
            o.put("kind", kind == null ? "request" : kind);
            String s = o.toString();
            synchronized (probes) {
                for (int i = 0; i < probes.size(); i++) {
                    if (probes.get(i).equals(s)) return;
                }
                if (probes.size() < 80) probes.add(s);
            }
        } catch (Throwable ignored) {}
    }

    private void completeCapture() {
        if (finishedOk) return;
        finishedOk = true;
        try {
            Intent r = new Intent();
            String payload = (lastCap == null) ? "null" : lastCap;
            if (probe) {
                try {
                    org.json.JSONObject o = null;
                    try { o = new org.json.JSONObject(payload); } catch (Throwable ignored) {}
                    if (o == null) o = new org.json.JSONObject();
                    org.json.JSONArray arr = new org.json.JSONArray();
                    synchronized (probes) {
                        for (int i = 0; i < probes.size(); i++) {
                            try { arr.put(new org.json.JSONObject(probes.get(i))); }
                            catch (Throwable ignored) {}
                        }
                    }
                    o.put("probes", arr);
                    o.put("probe", true);
                    payload = o.toString();
                } catch (Throwable ignored) {}
            }
            r.putExtra(EXTRA_RESULT, payload);
            r.putExtra(EXTRA_ACCOUNT, lastUn == null ? "" : lastUn);
            setResult(RESULT_OK, r);
        } catch (Throwable ignored) {
        }
        finish();
    }

    /* ==================== 登录结果的真校验（v1.1.90） ====================
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
     *   ② 正文去掉空白后 >= 40 字节（只挡空响应，别拿长度当判据：真登录的 frameset 可能不到 60 字节）
     *   ③ 不含「凭证已失效」「请重新登录」（UTF-8 与 GBK 两种字节位都查）
     *   ④ 不含 CAS 登录表单独有的 id="dosub" / name="randnumber" / id="username"
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
        /* 失效锚点只认「青果自己的登录表单」和「那段跳转脚本」，两条都要窄。
         *
         * 别用 login.action：登录成功后的业务页里登出链接也指向它。
         * 别用裸 frmbody：那是青果框架里到处都在的全局 frame 变量，登录后的
         * 页面同样会引用它，拿它当锚点会把真登录判成没登录。
         * 这里只认三样：① CAS 登录表单独有的 id="dosub" / name="randnumber" /
         * id="username"（2026-11-14 实测登录页 35287 字节里三者齐全）；
         * ② 那段「alert(...) 然后 location.href='/'」的失效跳转脚本，且整页极短
         * （实测 547 字节；正常业务页不可能这么小）。 */
        if (body.indexOf("id=\"dosub\"") >= 0
                || body.indexOf("name=\"randnumber\"") >= 0
                || body.indexOf("id=\"username\"") >= 0) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        if (body.length() < 1000 && body.indexOf("location.href") >= 0) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        /* 只留一个极小的地板，只挡空响应，别拿长度当判据。
         *
         * /frame/homes.action 登录后可能只回一个紧凑 frameset
         * （<html><frameset><frame src=...></frameset></html> 不到 60 字节），
         * 任何有意义的长度阈值都会把真登录误判成失败：v1.1.90 拍的 1200 是错的，
         * v1.1.92 的 300 依然偏高。这里只挡「空」「全是空白」和「短到装不下
         * 一个 frameset」的响应；真正的失效识别全靠上面 ③④ 两组特征。 */
        if (body.trim().length() < 40) {
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
