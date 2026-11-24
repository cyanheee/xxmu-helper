# -*- coding: utf-8 -*-
"""v1.1.70 一次性补丁：四轮真机够不到青果考试表 -> 换执行层「你复制、App 解析」。

先校验全部锚点（每个 old 在对应文件里恰好出现 1 次），全部通过后再一次性
按文件写盘；任何 MISS/重复都在任何写盘之前退出。字节级读写保留 CRLF/LF 与 BOM。
"""
import os, sys
from collections import defaultdict

ROOT = r'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
E = []
def add(f, o, n): E.append((f, o, n))

F_MAIN = r'android\src\com\xxmu\helper\MainActivity.java'
F_XQ   = r'web\xiqueer.js'
F_APP  = r'web\app.js'
F_CHK  = r'tools\check_web.js'
F_HTML = r'design\sketch\learn-v1166.html'
F_TEST = r'tools\test_xiqueer.js'

# ---- 1) MainActivity: 读系统剪贴板的桥 ----
add(F_MAIN, r'''        @JavascriptInterface
        public void clip(final String text) {
            if (text == null) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.ClipboardManager cm =
                            (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("xxmu", text));
                    } catch (Throwable t) {
                        Toast.makeText(MainActivity.this, "复制失败", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
''', r'''        @JavascriptInterface
        public void clip(final String text) {
            if (text == null) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.ClipboardManager cm =
                            (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("xxmu", text));
                    } catch (Throwable t) {
                        Toast.makeText(MainActivity.this, "复制失败", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        /**
         * v1.1.70：读取系统剪贴板文本，给喜鹊「从剪贴板导入考试表」用。
         *
         * 为什么换执行层：青果 V17 业务页防直链、检索结果常进弹窗/子框架，
         * App 主动 evaluateJavascript 四轮真机都够不到考试表（m02177 诊断：
         * 按「完成」那一刻顶层仍是门户 homes.action，#1 内容帧 about:blank）。
         * 这版让人在自己看得见的那页长按选中复制，App 只读剪贴板自己解析。
         * 返回 String：getPref 已是同款同步返回值桥，JS 侧 Host.getClip() 直取。
         */
        @JavascriptInterface
        public String getClip() {
            try {
                android.content.ClipboardManager cm =
                    (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm == null || !cm.hasPrimaryClip()) return "";
                android.content.ClipData cd = cm.getPrimaryClip();
                if (cd == null || cd.getItemCount() == 0) return "";
                CharSequence t = cd.getItemAt(0).getText();
                if (t == null) return "";
                String s = t.toString();
                return s.length() > 60000 ? s.substring(0, 60000) : s;
            } catch (Throwable ignored) { return ""; }
        }
''')

# ---- 2) xiqueer.js 头注释补 v1.1.70 ----
add(F_XQ, r''' *   ② 认不出时不再只弹一句 toast：把读回的原文摊进喜鹊卡片的粘贴框，
 *      人看得见读到了什么、能改课程/时间、再点「导入这段」。黑盒变可见。
 *
 * 诚实红线：认不出就是认不出，绝不落一份空快照冒充「同步成功」；读不到
''', r''' *   ② 认不出时不再只弹一句 toast：把读回的原文摊进喜鹊卡片的粘贴框，
 *      人看得见读到了什么、能改课程/时间、再点「导入这段」。黑盒变可见。
 *
 * v1.1.70 换执行层（第四轮 m02177「检索了还是不行」）：按「完成」时程序够到的
 * 仍只有门户框架页（#0 菜单 S204 / #1 about:blank），检索出的考试表根本不在
 * App 能 evaluateJavascript 到的文档里 —— 四轮全卡在「App 主动去够青果页面」。
 * 这版不再赌读页：人在自己看得见的那页长按复制，App 读系统剪贴板
 *（Host.getClip）自己解析，一键导入；「去教务」只负责把门户打开方便复制。
 *
 * 诚实红线：认不出就是认不出，绝不落一份空快照冒充「同步成功」；读不到
''')

# ---- 3) NOEXAM：复制优先（保留「三步」让离线断言稳定） ----
add(F_XQ, r'''  const NOEXAM = '还没导入考试安排。三步：一，点「去教务里找考试安排」，在打开的教务页面里点进「课程考试 → 考试安排表」；二，选好学年学期和考试批次、按「检索」把考试表查出来，再按右上角「完成」，程序读回整页自己认；三，或者把喜鹊儿「考试安排」页的文字复制粘贴到卡片里的框，点「导入这段」。';
''', r'''  const NOEXAM = '还没导入考试安排。三步：一，在教务「课程考试 → 考试安排表」检索出表、或喜鹊儿「考试安排」页；二，长按选中考试那几行文字点「复制」，回来点「从剪贴板导入」；三，或把文字粘进卡片里的框点「导入这段」。程序不再赌自动读教务页面，你复制、App 解析。';
''')

# ---- 4) NO_PARSE 改口 + 新增 NO_CLIP ----
add(F_XQ, r'''  const NO_PARSE = '没认出考试条目。请确认粘贴的文字里带有日期和时间（例如 2026-11-14(11周 星期六)11:00-12:00 或 11月14日 11:00-12:00），以及课程名（例如 高等数学B1）。整页复制最稳。';
''', r'''  const NO_PARSE = '没认出考试条目。请确认复制的文字里带有日期和时间（例如 2026-11-14(11周 星期六)11:00-12:00 或 11月14日 11:00-12:00），以及课程名（例如 高等数学B1）。整页复制最稳；读到的原文已摊进框里，可改动后再导入。';
  const NO_CLIP = '剪贴板是空的。先到教务「考试安排表」或喜鹊儿「考试安排」页，长按选中考试那几行文字点「复制」，再回来点「从剪贴板导入」；或者直接把文字粘进下面的框点「导入这段」。';
''')

# ---- 5) defaultDiag：复制优先（保留「读回整页」让离线断言稳定） ----
add(F_XQ, r'''  function defaultDiag() {
    return '喜鹊儿考试安排（v1.1.69 · 读回整页）：青果 V17 的业务页带防直链和动态令牌，'
      + '程序不猜地址。v1.1.69 连 <frame>/<iframe> 框架一起读：你在 App 打开的教务页面里'
      + '点进「课程考试 → 考试安排表」、按「检索」查表、按右上角「完成」，整页读回来自己认；'
      + '没认出时把读回的原文摊进粘贴框，可改动后再导入。当前还没有导入过考试安排。';
  }
''', r'''  function defaultDiag() {
    return '喜鹊儿考试安排（v1.1.70 · 复制后解析）：青果 V17 业务页防直链、检索结果常进弹窗，'
      + 'App 主动读页读回整页四轮真机都够不到考试表，这版不再赌读页。你在教务「课程考试 → 考试安排表」'
      + '检索出表、或喜鹊儿「考试安排」页，长按选中考试文字复制，回来点「从剪贴板导入」，程序自己认；'
      + '也可直接把文字粘进框点「导入这段」。当前还没有导入过考试安排。';
  }
''')

# ---- 6) 新增 importClip()（放在 clear 之前） ----
add(F_XQ, r'''  function clear() { ps(SNAP_KEY, ''); ps(RAW_KEY, ''); LAST_DIAG = defaultDiag(); }
''', r'''  /* v1.1.70：从系统剪贴板读文字 → 解析 → 落快照，一步到位。
   * 剪贴板由 Java 桥 Host.getClip() 读（file:// 下拿不到 navigator.clipboard）。
   * 读不到 / 认不出都返回 raw，让卡片把原文摊进框给人看、能改再导入，
   * 绝不落空快照冒充同步成功。 */
  function importClip() {
    let txt = '';
    try {
      if (typeof Host !== 'undefined' && Host && Host.getClip) txt = String(Host.getClip() || '');
    } catch (e) { txt = ''; }
    if (!trim(txt)) return { count: 0, error: NO_CLIP, raw: '' };
    const exams = parseCapture(txt);
    if (!exams.length) {
      ps(RAW_KEY, String(txt).slice(0, 20000));   // 认不出：原文摊进框，可改再导入
      return { count: 0, error: NO_PARSE, raw: String(txt).slice(0, 20000) };
    }
    save(exams, '', '从剪贴板导入');
    return { count: exams.length, raw: String(txt).slice(0, 20000) };
  }

  function clear() { ps(SNAP_KEY, ''); ps(RAW_KEY, ''); LAST_DIAG = defaultDiag(); }
''')

# ---- 7) find()：只开门户，不再挂自动读页回跳 ----
add(F_XQ, r'''  function find() {
    /* 打开教务门户，人在里面点进「课程考试 → 考试安排表」、选好学年学期和
     * 考试批次、按「检索」把表查出来，再按完成，回跳 __onXqFind。
     * 刻意用 openFinderFor（EXTRA_FIND），不置 detect_login：找页不是登录，
     * 别让 WebView 按 URL 判定提前收工、拿不到 EXTRA_RESULT。 */
    if (typeof Host !== 'undefined' && Host && Host.openFinderFor) {
      Host.openFinderFor(HOME, '\u8003\u8bd5\u5b89\u6392\u8868 \u00b7 \u68c0\u7d22\u51fa\u8868\u540e\u6309\u5b8c\u6210', '__onXqFind');
    } else {
      toast2('\u8bf7\u5728 App \u5185\u4f7f\u7528\u8fd9\u4e2a\u529f\u80fd');
    }
  }
''', r'''  function find() {
    /* v1.1.70：只把教务门户打开，方便人在自己看得见的那页长按复制考试表。
     * 不再挂 __onXqFind 自动读页回跳——四轮真机证明按「完成」时程序够到的
     * 只有门户框架页，检索表不在这个 WebView 能读到的文档里，赌读页一直输。
     * cb 传空串：openFinderFor 照旧开 find 视图（顶栏有「完成」可关），
     * 但 notifyFindDone 因回调名为空直接返回，不再弹「没认出」误导人。 */
    if (typeof Host !== 'undefined' && Host && Host.openFinderFor) {
      Host.openFinderFor(HOME, '打开教务网 · 复制考试表后回来', '');
    } else {
      toast2('\u8bf7\u5728 App \u5185\u4f7f\u7528\u8fd9\u4e2a\u529f\u80fd');
    }
  }
''')

# ---- 8) window.XQ 暴露 importClip ----
add(F_XQ, r'''  window.XQ = { find: find, importText: importText, clear: clear, has: has,
    lastRaw: lastRaw, parse: parseCapture, fetch: fetchExams };
''', r'''  window.XQ = { find: find, importText: importText, importClip: importClip, clear: clear, has: has,
    lastRaw: lastRaw, parse: parseCapture, fetch: fetchExams };
''')

# ---- 9) app.js 喜鹊卡：主按钮改「从剪贴板导入」 ----
add(F_APP, r'''    /* v1.1.68：喜鹊走「人带路」——真浏览器找页 + 粘贴兜底。这两条路必须
     * 摆在卡里显眼处，否则用户只看到「重新抓一次」会以为还是没修好。 */
    if (s.id === 'xiqueer') {
      const hint2 = el('p', 'hint tight');
      hint2.textContent = '教务的业务页有防直链，得你在页面里点开才看得到。点「去教务里找考试安排表」，进「课程考试 → 考试安排表」，选好学年学期按「检索」查出表，再按「完成」。没认出时读回的原文会摊进下面的框，改一改再导入。';
      wrap.appendChild(hint2);
      const bFind = el('button', 'btn', '去教务里找考试安排表');
      bFind.setAttribute('data-act', 'find');
      wrap.appendChild(bFind);
      const ta = el('textarea', 'src-paste');
      ta.setAttribute('placeholder', '把考试安排表的文字复制粘贴到这里；没认出时这里会自动摊开程序读回的原文');
      /* v1.1.69：paint() 重建卡片后，把上次「没认出」读回的原文带回来，
       * 否则 __onXqFind 里直接写进 DOM 的那份会在重绘后消失。
       * 初始有原文就多给两行高度，别让人一进来只看到一行以为是空的。 */
      let lastRaw = '';
      try { lastRaw = (window.XQ && XQ.lastRaw) ? String(XQ.lastRaw() || '') : ''; }
      catch (e) { lastRaw = ''; }
      ta.value = lastRaw.slice(0, 20000);
      ta.setAttribute('rows', lastRaw ? '5' : '3');
      wrap.appendChild(ta);
      const bImport = el('button', 'btn soft', '导入这段');
      bImport.setAttribute('data-act', 'import');
      wrap.appendChild(bImport);
    }
''', r'''    /* v1.1.70：四轮真机都卡在「App 主动去够青果页面」，这次换执行层——
     * 你复制、App 解析。主按钮是「从剪贴板导入」：人在自己看得见的考试表上
     * 长按选中复制，回来一键导入；「去教务」只负责把门户打开方便复制，
     * 不再承诺按完成自动读页（那条路一直被挡）。粘贴框 + 导入这段仍留着兜底。 */
    if (s.id === 'xiqueer') {
      const hint2 = el('p', 'hint tight');
      hint2.textContent = '在教务「课程考试 → 考试安排表」检索出表、或喜鹊儿「考试安排」页，长按选中考试那几行文字点「复制」，回来点「从剪贴板导入」就行。程序不再赌自动读教务页面；也可以直接把文字粘进下面的框点「导入这段」。';
      wrap.appendChild(hint2);
      const bClip = el('button', 'btn', '从剪贴板导入');
      bClip.setAttribute('data-act', 'paste');
      wrap.appendChild(bClip);
      const bFind = el('button', 'btn ghost', '打开教务网（复制考试表用）');
      bFind.setAttribute('data-act', 'find');
      wrap.appendChild(bFind);
      const ta = el('textarea', 'src-paste');
      ta.setAttribute('placeholder', '把考试安排表的文字粘贴到这里；从剪贴板导入没认出时，原文会摊进这个框，可改后再导入');
      /* v1.1.69：paint() 重建卡片后，把上次「没认出」读回的原文带回来。 */
      let lastRaw = '';
      try { lastRaw = (window.XQ && XQ.lastRaw) ? String(XQ.lastRaw() || '') : ''; }
      catch (e) { lastRaw = ''; }
      ta.value = lastRaw.slice(0, 20000);
      ta.setAttribute('rows', lastRaw ? '5' : '3');
      wrap.appendChild(ta);
      const bImport = el('button', 'btn soft', '导入这段');
      bImport.setAttribute('data-act', 'import');
      wrap.appendChild(bImport);
    }
''')

# ---- 10) app.js 委托表：新增 paste 分支 ----
add(F_APP, r'''      if (act === 'find') {
        /* v1.1.68：打开教务框架页，用户自己点进考试安排按「完成」，
         * 回跳 __onXqFind 把整页交回 xiqueer.js 解析并存快照。 */
        if (window.XQ) XQ.find();
      } else if (act === 'import') {
''', r'''      if (act === 'paste') {
        /* v1.1.70：从系统剪贴板读考试表文字 → 解析 → 一步导入。
         * 认不出时把原文摊进框（XQ 已写 RAW_KEY），人能看见、改一改再导入。 */
        if (!window.XQ) return;
        const r = XQ.importClip ? XQ.importClip() : { count: 0, error: '这个版本还没有剪贴板导入。' };
        const ta0 = cardHost && cardHost.querySelector
          ? cardHost.querySelector('textarea.src-paste') : null;
        if (r && r.raw && ta0) { ta0.value = r.raw; ta0.setAttribute('rows', '5'); }
        if (!r || !r.count) { showTip((r && r.error) || '剪贴板里没认出考试条目。'); return; }
        paint();
        renderHomework();
        if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已从剪贴板导入 ' + r.count + ' 场考试');
        sync(id, true);
      } else if (act === 'find') {
        /* v1.1.70：只把教务门户打开，方便人在页面里长按复制考试表；
         * 不再承诺按「完成」自动读页（四轮真机都被业务页防直链挡住）。 */
        if (window.XQ) XQ.find();
      } else if (act === 'import') {
''')

# ---- 11) check_web.js：v1.1.70 锚点（复用已声明 const） ----
add(F_CHK, r'''has(app, 'XQ.lastRaw()', 'app.js 喜鹊卡片回填读回原文');

console.log('\n' + (bad === 0 ? '[PASS] 静态体检全部通过' : '[FAIL] ' + bad + ' 项未过'));
''', r'''has(app, 'XQ.lastRaw()', 'app.js 喜鹊卡片回填读回原文');

/* ---- v1.1.70：四轮真机够不到青果考试表 → 换执行层「你复制、App 解析」。
 * m02177 诊断：按「完成」时顶层仍是门户 homes.action、#1 内容帧 about:blank，
 * 检索出的考试表根本不在 App 够得到的文档里。这版加系统剪贴板桥 + 一键导入，
 * 钉住这些符号，防止退回去赌自动读页。 */
console.log('\nv1.1.70 checkpoints（剪贴板导入 / 不再赌读页）:');
has(mainAct, 'public String getClip()', 'MainActivity 有读取系统剪贴板的桥');
has(xqjs, 'importClip', 'xiqueer.js 有从剪贴板导入');
has(xqjs, 'NO_CLIP', 'xiqueer.js 对空剪贴板有清楚提示');
has(xqjs, 'Host.getClip', 'xiqueer.js 走 Host.getClip 读剪贴板');
has(app, "act === 'paste'", 'app.js 有「从剪贴板导入」动作');

console.log('\n' + (bad === 0 ? '[PASS] 静态体检全部通过' : '[FAIL] ' + bad + ' 项未过'));
''')

# ---- 12) 样张喜鹊卡改 v1.1.70 态 ----
add(F_HTML, r'''    <!-- v1.1.69：喜鹊「考试安排表」在 <frame> 里，读页桥连框架一起读。 -->
    <div class="card src-card">
      <div class="row"><span>喜鹊儿 / 青果</span><span class="v src-state warn">暂不可用</span></div>
      <p class="hint tight" data-role="note">还没读到考试安排。点「去教务里找考试安排表」，进「课程考试 → 考试安排表」，选好学年学期按「检索」查出表，再按右上角「完成」。没认出时读回的原文会摊进下面的框，改一改再导入。</p>
      <p class="hint tight">教务的业务页有防直链，得你在页面里点开才看得到；检索出表后再按「完成」，程序连框架一起读。</p>
      <button class="btn">去教务里找考试安排表</button>
      <textarea class="src-paste" rows="3" placeholder="把考试安排表的文字复制粘贴到这里；没认出时这里会自动摊开程序读回的原文"></textarea>
      <button class="btn soft">导入这段</button>
      <button class="btn ghost">登录 / 重新登录教务</button>
      <button class="btn ghost">复制诊断</button>
    </div>
    <p class="hint tight" style="padding:2px 2px 6px">这一版连 &lt;frame&gt; 框架一起读回，认不出就把读回原文摊进框里给你改。</p>
''', r'''    <!-- v1.1.70：四轮真机够不到青果考试表，换执行层「你复制、App 解析」。 -->
    <div class="card src-card">
      <div class="row"><span>喜鹊儿 / 青果</span><span class="v src-state warn">暂不可用</span></div>
      <p class="hint tight" data-role="note">还没导入考试安排。在教务「课程考试 → 考试安排表」检索出表、或喜鹊儿「考试安排」页，长按选中考试那几行文字点「复制」，回来点「从剪贴板导入」就行。</p>
      <p class="hint tight">程序不再赌自动读教务页面；也可以直接把文字粘进下面的框点「导入这段」，没认出时原文会摊进框里给你改。</p>
      <button class="btn">从剪贴板导入</button>
      <button class="btn ghost">打开教务网（复制考试表用）</button>
      <textarea class="src-paste" rows="3" placeholder="把考试安排表的文字粘贴到这里；没认出时原文会摊进这个框，可改后再导入"></textarea>
      <button class="btn soft">导入这段</button>
      <button class="btn ghost">登录 / 重新登录教务</button>
      <button class="btn ghost">复制诊断</button>
    </div>
    <p class="hint tight" style="padding:2px 2px 6px">这一版你复制、App 解析：一键读剪贴板认课程/时间/考场，不再赌读页。</p>
''')

# ---- 13) test_xiqueer.js：沙箱注入 clipBox + Host.getClip + 返回 ----
add(F_TEST, r'''  const textareas = [mkTa(), mkTa()];
''', r'''  const textareas = [mkTa(), mkTa()];
  const clipBox = { text: '' };
''')
add(F_TEST, r'''  const Host = {
    openFinderFor(u, t, cb) { calls.finder.push([u, t, cb]); return true; },
    openLogin() { return true; },
  };
''', r'''  const Host = {
    openFinderFor(u, t, cb) { calls.finder.push([u, t, cb]); return true; },
    openLogin() { return true; },
    getClip() { return clipBox.text; },
  };
''')
add(F_TEST, r'''  return { XQ: sandbox.XQ, spec: specBox.spec, calls: calls, store: store,
    onFind: sandbox.__onXqFind, textareas: textareas };
''', r'''  return { XQ: sandbox.XQ, spec: specBox.spec, calls: calls, store: store,
    onFind: sandbox.__onXqFind, textareas: textareas, clipBox: clipBox };
''')

# ---- 14) 断言 ⑱：find() 现在回跳名留空 ----
add(F_TEST, r'''  /* ⑱ find() 走 openFinderFor 且回跳名正确，不误用登录链。 */
  {
    const { XQ, calls } = load();
    XQ.find();
    ok('⑱ find() 调 Host.openFinderFor 且回跳名 __onXqFind',
      calls.finder.length === 1 && calls.finder[0][2] === '__onXqFind',
      'finder=' + JSON.stringify(calls.finder));
  }
''', r'''  /* ⑱ find() 走 openFinderFor 打开门户；v1.1.70 起回跳名留空（不再赌读页）。 */
  {
    const { XQ, calls } = load();
    XQ.find();
    ok('⑱ find() 调 Host.openFinderFor 打开教务门户，且不再挂自动读页回跳',
      calls.finder.length === 1 && calls.finder[0][2] === '',
      'finder=' + JSON.stringify(calls.finder));
  }
''')

# ---- 15) 新增 ㉗-㉚ 剪贴板导入断言 ----
add(F_TEST, r'''  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
''', r'''  /* ㉗㉘㉙㉚ v1.1.70：从剪贴板导入（你复制、App 解析）。
   * 剪贴板有考试表 → 一步认出；空剪贴板 → 清楚提示；首页菜单 → 认不出且把原文摊出来。 */
  {
    const { XQ, spec, clipBox } = load();
    clipBox.text = CARD;
    const r = XQ.importClip();
    ok('㉗ 剪贴板里有考试表：一步认出 1 场、返回原文',
      r.count === 1 && String(r.raw).indexOf('高等数学') >= 0,
      'r=' + JSON.stringify({ count: r.count, err: r.error }));
    const snap = await spec.fetch(() => {});
    ok('㉘ 剪贴板导入后快照是 ok、课程=高等数学B1',
      snap && snap.state === 'ok' && snap.exams[0] && snap.exams[0].course === '高等数学B1',
      'state=' + (snap && snap.state));
  }
  {
    const { XQ, clipBox } = load();
    clipBox.text = '';
    const r = XQ.importClip();
    ok('㉙ 空剪贴板：count=0、给「剪贴板是空的」提示，不落空快照',
      r.count === 0 && String(r.error).indexOf('剪贴板是空的') >= 0 && XQ.has() === false,
      'r=' + JSON.stringify(r));
  }
  {
    const { XQ, clipBox } = load();
    clipBox.text = '学籍档案 学籍异动 培养方案 辅修事宜';
    const r = XQ.importClip();
    ok('㉚ 剪贴板是首页菜单：认不出、把原文摊回 raw 供粘贴框显示',
      r.count === 0 && String(r.raw).indexOf('学籍档案') >= 0,
      'r=' + JSON.stringify({ count: r.count, raw: r.raw }));
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
''')

# ---------------- 校验全部锚点，再一次性写盘 ----------------
byfile = defaultdict(list)
for f, o, n in E:
    byfile[f].append((o, n))

data = {}
for f in byfile:
    p = os.path.join(ROOT, f)
    if not os.path.isfile(p):
        print('FILE_MISSING', f); sys.exit(2)
    with open(p, 'rb') as fp:
        b = fp.read()
    try:
        s = b.decode('utf-8')
    except UnicodeDecodeError as ex:
        print('DECODE_FAIL', f, ex); sys.exit(2)
    # MainActivity.java 是 CRLF，其余 web/tools 文件是 LF。
    # 锚点统一按 LF 匹配；写盘时按各文件原行尾还原，别把 CRLF 文件写成 LF。
    eol = '\r\n' if b'\r\n' in b else '\n'
    s_lf = s.replace('\r\n', '\n') if eol == '\r\n' else s
    data[f] = [p, s_lf, eol]

for f in byfile:
    s = data[f][1]
    for i, (o, n) in enumerate(byfile[f]):
        c = s.count(o)
        if c != 1:
            print('ANCHOR_FAIL', f, 'edit', i, 'count=', c, 'oldhead=', repr(o[:60]))
            sys.exit(2)
        # 只防「真没改」。整行替换式补丁（NOEXAM/defaultDiag 换短文案）会 legitimately
        # 变短，len 判据会误伤——这里每处 old 都是 count==1 的唯一锚点，替换即生效，
        # 不再用长度做「没改干净」的猜测（插入式补丁才需要那层保护）。
        if o == n:
            print('NOOP', f, 'edit', i); sys.exit(2)

print('ANCHOR_CHECK_OK  edits=%d  files=%d' % (len(E), len(byfile)))
for f in byfile:
    p, s, eol = data[f]
    for o, n in byfile[f]:
        s = s.replace(o, n, 1)
    out = s.replace('\n', eol) if eol == '\r\n' else s
    with open(p, 'wb') as fp:
        fp.write(out.encode('utf-8'))
    print('WROTE', f, len(out.encode('utf-8')), 'bytes')
print('PATCH_EXIT=0')
