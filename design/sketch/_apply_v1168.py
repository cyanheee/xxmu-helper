# -*- coding: utf-8 -*-
"""v1.1.68 一次性补丁：先把 19 处锚点全部校验通过，再一次性落盘。
教训（官网批量替换 m01023）：任何一处 MISS 就在任何 WriteAllText 之前退出，
绝不半途改坏文件。行尾 CRLF/LF 原样保留。"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def P(rel):
    return os.path.join(ROOT, rel.replace('/', os.sep))

EDITS = []

def E(rel, old, new, name):
    EDITS.append((rel, old, new, name))

# ---------------- WebActivity.java ----------------
E('android/src/com/xxmu/helper/WebActivity.java',
r'''    public static final String EXTRA_CAPTURE = "capture";
    public static final String EXTRA_RESULT = "capture_result";''',
r'''    public static final String EXTRA_CAPTURE = "capture";
    public static final String EXTRA_RESULT = "capture_result";
    /** v1.1.68：带着活登录态打开教务页，让用户自己点进「考试安排」，
     *  按「完成」把整页文字/表格回传给前端解析（见 FIND_JS）。 */
    public static final String EXTRA_FIND = "find";''',
'WA-1 EXTRA_FIND')

E('android/src/com/xxmu/helper/WebActivity.java',
r'''    /** 读 location 与 localStorage 里的 token，返回一个 JSON 字符串 */
    private static final String CAPTURE_JS =
            "JSON.stringify({u:String(location.href),"
            + "t:(function(){try{return localStorage.getItem('token')"
            + "||localStorage.getItem('TOKEN')||''}catch(e){return ''}})(),"
            + "ls:(function(){try{return JSON.stringify(localStorage)}catch(e){return '{}'}})()})";''',
r'''    /** 读 location 与 localStorage 里的 token，返回一个 JSON 字符串 */
    private static final String CAPTURE_JS =
            "JSON.stringify({u:String(location.href),"
            + "t:(function(){try{return localStorage.getItem('token')"
            + "||localStorage.getItem('TOKEN')||''}catch(e){return ''}})(),"
            + "ls:(function(){try{return JSON.stringify(localStorage)}catch(e){return '{}'}})()})";

    /**
     * v1.1.68：把当前页（含同源 iframe）的正文与表格行整体回传。
     *
     * 为什么返回对象而不是 JSON 字符串：evaluateJavascript 对「对象结果」
     * 直接给出 JSON 文本，省掉 CAPTURE_JS 那种「字符串结果还带一层引号」
     * 的二次解析，前端 __onXqFind 一次 JSON.parse 就能拿到 {u,text,rows,frames}。
     * 为什么连 iframe 一起读：青果 V17 的考试安排常常渲染在框架页的
     * 子 iframe 里，只读顶层 document.body 会拿到一张空菜单。
     */
    private static final String FIND_JS =
            "(function(){"
            + "var o={u:String(location.href),text:'',rows:[],frames:[]};"
            + "try{var t=(document.body&&document.body.innerText)||document.documentElement.innerText||'';"
            + "o.text=String(t).slice(0,60000)}catch(e){}"
            + "try{var tr=document.getElementsByTagName('tr');"
            + "for(var i=0;i<tr.length&&i<400;i++){o.rows.push(String(tr[i].innerText||tr[i].textContent||''))}}catch(e){}"
            + "try{var fs=document.getElementsByTagName('iframe');"
            + "for(var j=0;j<fs.length&&j<20;j++){var d=null,fu='',ft='',fr=[];"
            + "try{fu=String(fs[j].src||'');d=fs[j].contentDocument}catch(x){d=null}"
            + "if(d){try{var q=(d.body&&d.body.innerText)||'';ft=String(q).slice(0,60000)}catch(x){}"
            + "try{var q2=d.getElementsByTagName('tr');"
            + "for(var k=0;k<q2.length&&k<400;k++){fr.push(String(q2[k].innerText||q2[k].textContent||''))}}catch(x){}}"
            + "o.frames.push({u:fu,text:ft,rows:fr})}}catch(e){}"
            + "return o})()";''',
'WA-2 FIND_JS')

E('android/src/com/xxmu/helper/WebActivity.java',
r'''    private boolean detectLogin = false;
    private boolean capture = false;''',
r'''    private boolean detectLogin = false;
    private boolean capture = false;
    /** v1.1.68：找考试安排模式：复用 capture 的「完成」按钮/轮询，但读整页文字而非账号框 */
    private boolean find = false;''',
'WA-3 find field')

E('android/src/com/xxmu/helper/WebActivity.java',
r'''        capture = it.getBooleanExtra(EXTRA_CAPTURE, false);
        okHints = it.getStringExtra(EXTRA_OK_HINTS);''',
r'''        capture = it.getBooleanExtra(EXTRA_CAPTURE, false);
        find = it.getBooleanExtra(EXTRA_FIND, false);
        // find 复用 capture 的「完成」按钮与轮询，但页面不按 URL 自动收工：
        // 用户要在教务框架里自己点进考试安排，最后按「完成」交回当前页文字。
        if (find) capture = true;
        okHints = it.getStringExtra(EXTRA_OK_HINTS);''',
'WA-4 onCreate find')

E('android/src/com/xxmu/helper/WebActivity.java',
r'''    private void grabAccount(final boolean finishAfter) {
        if (web == null) return;
        try {''',
r'''    private void grabAccount(final boolean finishAfter) {
        if (web == null) return;
        if (find) { grabFind(finishAfter); return; }
        try {''',
'WA-5 grabAccount dispatch')

E('android/src/com/xxmu/helper/WebActivity.java',
r'''        } catch (Throwable e) {
            if (finishAfter) completeCapture();
        }
    }

    /** 一轮读完之后：要么收工，要么判断是否该自动收工 */''',
r'''        } catch (Throwable e) {
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

    /** 一轮读完之后：要么收工，要么判断是否该自动收工 */''',
'WA-6 grabFind method')

# ---------------- MainActivity.java ----------------
E('android/src/com/xxmu/helper/MainActivity.java',
r'''    private static final int REQ_SRC = 1009;  // v1.1.66 多平台来源通用登录（openLoginFor）''',
r'''    private static final int REQ_SRC = 1009;  // v1.1.66 多平台来源通用登录（openLoginFor）
    private static final int REQ_FIND = 1010; // v1.1.68 喜鹊考试安排：WebView 辅助发现''',
'MA-1 REQ_FIND')

E('android/src/com/xxmu/helper/MainActivity.java',
r'''    private String pendingSrcCb = "";''',
r'''    private String pendingSrcCb = "";
    /** v1.1.68：openFinderFor 的 JS 回跳名（window[cb](jsonText)），REQ_FIND 消费后清空。 */
    private String pendingFindCb = "";''',
'MA-2 pendingFindCb')

E('android/src/com/xxmu/helper/MainActivity.java',
r'''        @JavascriptInterface
        public void openLoginFor(final String url, final String title, final String badHints,''',
r'''        /* v1.1.68：喜鹊考试安排「WebView 辅助发现」。
         *
         * 为什么不是再猜一个 jsp 地址：真机诊断（m01318）里 /frame/homes.action
         * 是活的（32382B），可同一份 Cookie 直连 /student/*.jsp 全被 KingoEncypt
         * 令牌/防直链挡成「凭证失效页」，静态 HTML 里也挖不到 AJAX 菜单的真地址。
         * 唯一稳的路是让真浏览器自己跑完 JS：打开教务框架，用户点一次「考试安排」，
         * 页面渲染出来后按「完成」，把整页文字与表格行交回前端解析。
         *
         * 这里刻意不置 EXTRA_DETECT_LOGIN：那条路会按 URL 命中 /student/ 就自动
         * finishWithResult(true)，既拿不到 EXTRA_RESULT，也没等用户点到考试页。 */
        @JavascriptInterface
        public void openFinderFor(final String url, final String title, final String cbName) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        pendingFindCb = cbName;
                        android.content.Intent it = new android.content.Intent(
                                MainActivity.this, WebActivity.class);
                        it.putExtra(WebActivity.EXTRA_URL, url);
                        it.putExtra(WebActivity.EXTRA_TITLE, title);
                        it.putExtra(WebActivity.EXTRA_FIND, true);
                        startActivityForResult(it, REQ_FIND);
                    } catch (Throwable e) {
                        showToast("无法打开页面：" + e.getClass().getSimpleName());
                    }
                }
            });
        }

        @JavascriptInterface
        public void openLoginFor(final String url, final String title, final String badHints,''',
'MA-3 openFinderFor')

E('android/src/com/xxmu/helper/MainActivity.java',
r'''            notifySrcDone(res == RESULT_OK, acct, cb);
        } else if (req == REQ_APK) {''',
r'''            notifySrcDone(res == RESULT_OK, acct, cb);
        } else if (req == REQ_FIND) {
            // v1.1.68：用户点过「考试安排」并按「完成」，把整页 JSON 文本交回前端。
            CookieManager.getInstance().flush();
            String payload = "null";
            try {
                if (res == RESULT_OK && data != null) {
                    String s = data.getStringExtra(WebActivity.EXTRA_RESULT);
                    if (s != null && s.length() > 4) payload = s;
                }
            } catch (Throwable ignored) {}
            String cb = pendingFindCb;
            pendingFindCb = "";
            notifyFindDone(payload, cb);
        } else if (req == REQ_APK) {''',
'MA-4 REQ_FIND branch')

E('android/src/com/xxmu/helper/MainActivity.java',
r'''    private void notifyWaterCapture(final String payload) {
        final String lit = org.json.JSONObject.quote(payload == null ? "null" : payload);
        final String js = "window.__onWaterCapture && window.__onWaterCapture(" + lit + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }''',
r'''    private void notifyWaterCapture(final String payload) {
        final String lit = org.json.JSONObject.quote(payload == null ? "null" : payload);
        final String js = "window.__onWaterCapture && window.__onWaterCapture(" + lit + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    /** v1.1.68：把 WebView 抓到的一整页 JSON 文本交回 window[cb](jsonText)。
     *  payload 本身已是 JSON 文本，quote 包一层成合法 JS 字符串字面量；
     *  cb 单独 quote，防回调名里带引号把脚本截断。与学习通/教务/多平台
     *  三条登录回调彻底分开，不串台。 */
    private void notifyFindDone(final String payload, final String cb) {
        if (cb == null || cb.length() == 0) return;
        final String key = org.json.JSONObject.quote(cb);
        final String lit = org.json.JSONObject.quote(payload == null ? "null" : payload);
        final String js = "window[" + key + "] && window[" + key + "](" + lit + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }''',
'MA-5 notifyFindDone')

# ---------------- sources.js ----------------
E('web/sources.js',
r'''            synced_at: now(), state: 'ok', source: id,''',
r'''            /* v1.1.68：适配器可以回传自己的导入/抓取时间（喜鹊是「人带路」
             * 导入，上次导入时间就是数据真实产生的时间，不能用刷新时刻冒充）。 */
            synced_at: (r.synced_at || now()), state: 'ok', source: id,''',
'SRC-1 synced_at')

# ---------------- app.js ----------------
E('web/app.js',
r'''    wrap.appendChild(note);

    /* v1.1.67：登录按钮不再只在 nologin/stale 出现。''',
r'''    wrap.appendChild(note);

    /* v1.1.68：喜鹊走「人带路」——真浏览器找页 + 粘贴兜底。这两条路必须
     * 摆在卡里显眼处，否则用户只看到「重新抓一次」会以为还是没修好。 */
    if (s.id === 'xiqueer') {
      const hint2 = el('p', 'hint tight');
      hint2.textContent = '教务的业务页有防直链，自动抓不到。用下面任意一条把考试安排放进来：在 App 内打开教务点开考试安排按「完成」，或把喜鹊儿那页文字粘进来导入。';
      wrap.appendChild(hint2);
      const bFind = el('button', 'btn', '去教务里找考试安排');
      bFind.setAttribute('data-act', 'find');
      wrap.appendChild(bFind);
      const ta = el('textarea', 'src-paste');
      ta.setAttribute('placeholder', '把喜鹊儿「考试安排」页上的文字复制粘贴到这里');
      ta.setAttribute('rows', '3');
      wrap.appendChild(ta);
      const bImport = el('button', 'btn soft', '导入这段');
      bImport.setAttribute('data-act', 'import');
      wrap.appendChild(bImport);
    }

    /* v1.1.67：登录按钮不再只在 nologin/stale 出现。''',
'APP-1 xiqueer card UI')

E('web/app.js',
r'''    const bOut = el('button', 'btn ghost', '断开' + s.short);
    bOut.setAttribute('data-act', 'out');
    bOut.style.display = s.loggedIn ? 'block' : 'none';''',
r'''    /* v1.1.68：喜鹊的「断开」不能真的清教务 Cookie（那会连课表一起登出），
     * 只清掉导入的考试安排，所以换个不会误导的文案。 */
    const bOut = el('button', 'btn ghost',
      s.id === 'xiqueer' ? '清掉导入的考试' : '断开' + s.short);
    bOut.setAttribute('data-act', 'out');
    bOut.style.display = (s.id === 'xiqueer')
      ? (window.XQ && XQ.has() ? 'block' : 'none')
      : (s.loggedIn ? 'block' : 'none');''',
'APP-2 bOut label')

E('web/app.js',
r'''      if (act === 'login') {
        SOURCES.openLogin(id);
      } else if (act === 'sync') {''',
r'''      if (act === 'find') {
        /* v1.1.68：打开教务框架页，用户自己点进考试安排按「完成」，
         * 回跳 __onXqFind 把整页交回 xiqueer.js 解析并存快照。 */
        if (window.XQ) XQ.find();
      } else if (act === 'import') {
        /* v1.1.68：粘贴兜底。用户把喜鹊儿考试安排那页文字粘进卡里的框，
         * 同一个解析器认；认不出就说实话，绝不落一份空快照冒充同步成功。 */
        if (!window.XQ) return;
        const ta = cardHost && cardHost.querySelector
          ? cardHost.querySelector('textarea.src-paste') : null;
        const txt = ta ? String(ta.value || '') : '';
        if (!txt.trim()) {
          showTip('先把喜鹊儿「考试安排」那页的文字粘贴到框里，再点「导入这段」。');
          return;
        }
        const r = XQ.importText(txt);
        if (!r.count) { showTip(r.error || '没认出考试条目。'); return; }
        paint();
        renderHomework();
        if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已导入 ' + r.count + ' 场考试');
      } else if (act === 'login') {
        SOURCES.openLogin(id);
      } else if (act === 'sync') {''',
'APP-3 delegate find/import')

E('web/app.js',
r'''      } else if (act === 'out') {
        const s = SOURCES.get(id);
        if (!await askConfirm('断开' + (s ? s.label : '该平台')
          + '？下次要看数据需要重新登录。', { danger: true })) return;
        SOURCES.logout(id);''',
r'''      } else if (act === 'out') {
        const s = SOURCES.get(id);
        /* v1.1.68：喜鹊只清导入快照 + 刷一遍让来源缓存回到诚实降级，
         * 绝不调 SOURCES.logout —— 那会 clearCookieFor(教务) 把课表一起登出。 */
        const isXq = (id === 'xiqueer' && window.XQ);
        if (!await askConfirm(isXq
          ? '清掉已经导入的考试安排？教务登录不会受影响。'
          : '断开' + (s ? s.label : '该平台') + '？下次要看数据需要重新登录。',
          { danger: !isXq })) return;
        if (isXq) {
          XQ.clear();
          paint();
          renderHomework();
          SOURCES.refresh('xiqueer', function () {}).then(function () {
            paint(); renderHomework();
          });
          if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已清掉导入的考试安排');
          return;
        }
        SOURCES.logout(id);''',
'APP-4 out branch')

# ---------------- app.css ----------------
E('web/app.css',
r'''html[data-theme="dark"] #bindEntry .row .v{color:var(--ink2)}''',
r'''html[data-theme="dark"] #bindEntry .row .v{color:var(--ink2)}

/* ---------------- v1.1.68：喜鹊「粘贴考试安排」输入框 ----------------
 * 跟着 .src-card 走；颜色全用主题变量（带兜底），浅色/深色自动适配，
 * 不再单独写一份 html[data-theme="dark"] 覆盖。 ---- */
.src-card textarea.src-paste{display:block;width:100%;box-sizing:border-box;
  margin:8px 0 2px;padding:9px 10px;border:1px solid var(--line,rgba(0,0,0,.12));
  border-radius:10px;background:var(--surface2,rgba(0,0,0,.04));
  color:var(--ink,#2B2318);font:inherit;font-size:12px;line-height:1.5;
  resize:vertical;min-height:64px}
.src-card textarea.src-paste::placeholder{color:var(--mute,#8a7c68)}''',
'CSS-1 textarea')

# ---------------- design/sketch/learn-v1166.html ----------------
E('design/sketch/learn-v1166.html',
r'''    <!-- v1.1.67：喜鹊改成动态发现考试页。这里画的是「没定位到」时的诚实降级态，
         带重新登录 + 复制诊断两个新按钮（正是 YG 截图里缺的那两条路）。 -->
    <div class="card src-card">
      <div class="row"><span>喜鹊儿 / 青果</span><span class="v src-state warn">暂不可用</span></div>
      <p class="hint tight" data-role="note">没定位到考试安排页：已带登录态找过 9 个菜单页、验真 22 个候选，都不是考试表。点「复制诊断」把结果发到更新群，下一版直接接上真地址；也可重新登录教务再试。</p>
      <button class="btn">登录 / 重新登录教务</button>
      <button class="btn soft">重新抓一次</button>
      <button class="btn ghost">复制诊断</button>
      <button class="btn ghost">断开喜鹊</button>
    </div>
    <p class="hint tight" style="padding:2px 2px 6px">这一版不再写死考试页地址：从教务菜单里自己找，找不到也不冒充「登录态过期」。</p>''',
r'''    <!-- v1.1.68：喜鹊改成「人带路」——真浏览器辅助发现 + 粘贴导入兜底。 -->
    <div class="card src-card">
      <div class="row"><span>喜鹊儿 / 青果</span><span class="v src-state warn">暂不可用</span></div>
      <p class="hint tight" data-role="note">还没读到考试安排。点「去教务里找考试安排」，在打开的教务页里点开考试安排再按右上角「完成」；或者把喜鹊儿「考试安排」页上的文字复制粘贴到下面的框里，点「导入这段」。</p>
      <p class="hint tight">教务的业务页有防直链，自动抓不到。用下面任意一条把考试安排放进来。</p>
      <button class="btn">去教务里找考试安排</button>
      <textarea class="src-paste" rows="3" placeholder="把喜鹊儿「考试安排」页上的文字复制粘贴到这里"></textarea>
      <button class="btn soft">导入这段</button>
      <button class="btn ghost">登录 / 重新登录教务</button>
      <button class="btn ghost">复制诊断</button>
    </div>
    <p class="hint tight" style="padding:2px 2px 6px">这一版不再猜教务地址：你在教务里点开考试安排，程序读回整页自己认。</p>''',
'HTML-1 sample card')

# ---------------- tools/check_web.js ----------------
E('tools/check_web.js',
r'''/* ---- v1.1.67：喜鹊考试页「动态发现 + 诊断回传」锚点 ----
 * 为什么：v1.1.66 把 7 个 jsp 写死，真机全没命中却谎称「登录态过期」
 * （m01034）。这一版改成抓教务菜单页挖链接、逐个验真表头，并把定位过程
 * 落成可复制的诊断。钉住这几个符号，防止后来「顺手简化」退回硬猜。 */
console.log('\nv1.1.67 checkpoints（喜鹊动态发现 / 诊断回传）:');
const xqjs = read('web/xiqueer.js');
has(xqjs, 'MENU_PAGES', 'xiqueer.js 从教务菜单/框架页发现考试链接（不再只硬猜）');
has(xqjs, 'collectLinks', 'xiqueer.js 有业务链接提取器');
has(xqjs, 'diag:', 'xiqueer.js 回传定位诊断');
has(srcjs, 'function diag', 'sources.js 透出诊断文本');
has(app, 'SOURCES.diag', 'app.js 连接卡有「复制诊断」动作');
{
  const cp = require('child_process');
  const r = cp.spawnSync(process.execPath,
    [path.join(root, 'tools', 'test_xiqueer.js')], { encoding: 'utf8' });
  console.log('  喜鹊动态发现离线测试        =', r.status === 0 ? 'PASS' : 'FAIL');
  if (r.status !== 0) fail('喜鹊动态发现离线测试未过：' +
    ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-6).join(' | '));
}''',
r'''/* ---- v1.1.67 / v1.1.68：喜鹊考试页「诊断回传 + 真浏览器辅助发现」锚点 ----
 * 为什么改：v1.1.66 写死 7 个 jsp、v1.1.67 抓菜单挖链接逐个验真，两轮真机
 * 诊断都失败（m01034 / m01318）——V17 的业务页防裸 GET，静态 HTML 里没有
 * 真地址。v1.1.68 改成真浏览器带路 + 粘贴兜底，钉住这些符号防退回硬猜。 */
console.log('\nv1.1.67 / v1.1.68 checkpoints（喜鹊诊断回传 / 真浏览器辅助发现）:');
const xqjs = read('web/xiqueer.js');
has(xqjs, 'parseCapture', 'xiqueer.js 有考试安排解析器（卡片/表格/自由文本）');
has(xqjs, '__onXqFind', 'xiqueer.js 有 WebView 辅助发现回跳');
has(xqjs, 'diag:', 'xiqueer.js 回传定位诊断');
has(srcjs, 'function diag', 'sources.js 透出诊断文本');
has(app, 'SOURCES.diag', 'app.js 连接卡有「复制诊断」动作');
has(srcjs, 'r.synced_at || now()', 'sources.js 保留适配器回传的导入时间');
{
  const cp = require('child_process');
  const r = cp.spawnSync(process.execPath,
    [path.join(root, 'tools', 'test_xiqueer.js')], { encoding: 'utf8' });
  console.log('  喜鹊导入解析离线测试        =', r.status === 0 ? 'PASS' : 'FAIL');
  if (r.status !== 0) fail('喜鹊导入解析离线测试未过：' +
    ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-6).join(' | '));
}

/* ---- v1.1.68：真浏览器辅助发现的 Java 桥 + 前端入口 ---- */
console.log('\nv1.1.68 checkpoints（WebView 辅助发现 / 粘贴导入兜底）:');
const webAct = read('android/src/com/xxmu/helper/WebActivity.java');
const mainAct = read('android/src/com/xxmu/helper/MainActivity.java');
has(webAct, 'FIND_JS', 'WebActivity 有整页文字/表格抓取脚本');
has(webAct, 'EXTRA_FIND', 'WebActivity 有 find 模式开关');
has(mainAct, 'openFinderFor', 'MainActivity 暴露 openFinderFor 给前端');
has(mainAct, 'REQ_FIND', 'MainActivity 有独立的 find 结果分支');
has(xqjs, 'openFinderFor', 'xiqueer.js 调起 WebView 辅助发现');
has(app, "act === 'import'", 'app.js 连接卡有「导入这段」动作');''',
'CHECK-1 anchors')

# ---------------- 校验全部锚点 ----------------
cache = {}
def load(rel):
    if rel not in cache:
        with open(P(rel), 'rb') as f:
            raw = f.read()
        txt = raw.decode('utf-8')
        crlf = '\r\n' in txt
        norm = txt.replace('\r\n', '\n')
        cache[rel] = [norm, crlf]
    return cache[rel]

problems = []
for rel, old, new, name in EDITS:
    norm, _ = load(rel)
    n = norm.count(old)
    if n != 1:
        problems.append('%s: 锚点命中 %d 次（应为 1） @ %s' % (name, n, rel))
    # 这里允许 new 里仍含 old：本批多数是「在锚点前后插入」式补丁，
    # old 整段保留正是预期。只防「压根没改」和「改完反而更短」。
    if old == new:
        problems.append('%s: old == new（没改）' % name)
    if len(new) <= len(old):
        problems.append('%s: new 不比 old 长（疑似只删没加）' % name)

if problems:
    print('ANCHOR_CHECK_FAIL')
    for p in problems:
        print('  ' + p)
    sys.exit(2)

print('ANCHOR_CHECK_OK  edits=%d' % len(EDITS))

# ---------------- 一次性落盘 ----------------
for rel in list(cache.keys()):
    norm, crlf = cache[rel]
    for r2, old, new, name in EDITS:
        if r2 == rel:
            norm = norm.replace(old, new, 1)
    out = norm.replace('\n', '\r\n') if crlf else norm
    with open(P(rel), 'wb') as f:
        f.write(out.encode('utf-8'))
    print('WROTE %s (%d bytes)' % (rel, len(out.encode('utf-8'))))
