# -*- coding: utf-8 -*-
"""v1.1.71 方案 C：双探全自动（拦检索请求 + 钩导出下载，照课表重放）。
先校验全部锚点唯一，再一次性落盘；按各文件原始行尾还原（MainActivity 是 CRLF）。
教训：插入式补丁的锚点校验只能用 count==1 + 只防 old==new；
不能用 old in new / len(new)<=len(old)（会误伤插入式与整行换短文案）。
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))            # .../design/sketch
ROOT = os.path.dirname(os.path.dirname(HERE))                 # repo root
P = lambda rel: os.path.join(ROOT, rel)

EDITS = {}

# ---------------------------------------------------------------- WebActivity.java
EDITS['android/src/com/xxmu/helper/WebActivity.java'] = [
(r"""    public static final String EXTRA_FIND = "find";
""", r"""    public static final String EXTRA_FIND = "find";
    /** v1.1.71：双探模式——拦「检索」发出的请求 URL + 钩「导出/打印」下载 URL，
     *  按「完成」把候选地址连同整页一起回传，之后照课表用带 Cookie 的桥全自动重放。 */
    public static final String EXTRA_PROBE = "probe";
"""),

(r"""    private boolean find = false;
""", r"""    private boolean find = false;
    /** v1.1.71：双探模式。shouldInterceptRequest 拦「检索」发出的数据请求，
     *  DownloadListener 钩「导出/打印」的报表 URL，按「完成」一并回传。 */
    private boolean probe = false;
    /** 记到的候选请求，每条是一个 JSON 字符串 {url,method,kind}。 */
    private final java.util.ArrayList<String> probes = new java.util.ArrayList<String>();
"""),

(r"""        if (find) capture = true;
""", r"""        if (find) capture = true;
        probe = it.getBooleanExtra(EXTRA_PROBE, false);
        // 双探复用 find 的整页读取 + capture 的「完成」按钮/轮询，
        // completeCapture 会把拦到的候选地址并进回传对象。
        if (probe) { find = true; capture = true; }
"""),

(r"""        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String u) {
""", r"""        web.setWebViewClient(new WebViewClient() {
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
"""),

(r"""        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                if (bar == null) return;
                if (p >= 100) bar.setVisibility(View.GONE);
                else { bar.setVisibility(View.VISIBLE); bar.setProgress(p); }
            }
        });
""", r"""        web.setWebChromeClient(new WebChromeClient() {
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
"""),

(r"""    private void completeCapture() {
""", r"""    /** v1.1.71：把一条候选请求记进 probes（去重、限量、滤掉明显静态资源）。
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
"""),

(r"""            Intent r = new Intent();
            r.putExtra(EXTRA_RESULT, lastCap == null ? "null" : lastCap);
            r.putExtra(EXTRA_ACCOUNT, lastUn == null ? "" : lastUn);
""", r"""            Intent r = new Intent();
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
"""),
]

# ---------------------------------------------------------------- MainActivity.java
EDITS['android/src/com/xxmu/helper/MainActivity.java'] = [
(r"""    private static final int REQ_FIND = 1010; // v1.1.68 喜鹊考试安排：WebView 辅助发现
""", r"""    private static final int REQ_FIND = 1010; // v1.1.68 喜鹊考试安排：WebView 辅助发现
    private static final int REQ_PROBE = 1011; // v1.1.71 喜鹊考试双探：拦检索请求 + 钩导出下载
"""),

(r"""    private String pendingFindCb = "";
""", r"""    private String pendingFindCb = "";
    /** v1.1.71：openProbeFor 的 JS 回跳名（window[cb](jsonText)），REQ_PROBE 消费后清空。 */
    private String pendingProbeCb = "";
"""),

(r"""                        it.putExtra(WebActivity.EXTRA_FIND, true);
                        startActivityForResult(it, REQ_FIND);
                    } catch (Throwable e) {
                        showToast("无法打开页面：" + e.getClass().getSimpleName());
                    }
                }
            });
        }
""", r"""                        it.putExtra(WebActivity.EXTRA_FIND, true);
                        startActivityForResult(it, REQ_FIND);
                    } catch (Throwable e) {
                        showToast("无法打开页面：" + e.getClass().getSimpleName());
                    }
                }
            });
        }

        /** v1.1.71：打开「双探」教务视图。用户进「课程考试 → 考试安排表」，
         *  选好学年学期按一次「检索」（或点一次「导出」），按「完成」把拦到的
         *  候选地址交回前端；之后前端照课表用带 Cookie 的桥全自动重放，零复制。 */
        @JavascriptInterface
        public void openProbeFor(final String url, final String title, final String cbName) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        pendingProbeCb = cbName;
                        android.content.Intent it = new android.content.Intent(
                                MainActivity.this, WebActivity.class);
                        it.putExtra(WebActivity.EXTRA_URL, url);
                        it.putExtra(WebActivity.EXTRA_TITLE, title);
                        it.putExtra(WebActivity.EXTRA_PROBE, true);
                        startActivityForResult(it, REQ_PROBE);
                    } catch (Throwable e) {
                        showToast("无法打开页面：" + e.getClass().getSimpleName());
                    }
                }
            });
        }
"""),

(r"""            String cb = pendingFindCb;
            pendingFindCb = "";
            notifyFindDone(payload, cb);
        } else if (req == REQ_APK) {
""", r"""            String cb = pendingFindCb;
            pendingFindCb = "";
            notifyFindDone(payload, cb);
        } else if (req == REQ_PROBE) {
            // v1.1.71：双探视图关掉，把整页 + 拦到的候选请求地址交回前端。
            CookieManager.getInstance().flush();
            String payload = "null";
            try {
                if (res == RESULT_OK && data != null) {
                    String s = data.getStringExtra(WebActivity.EXTRA_RESULT);
                    if (s != null && s.length() > 4) payload = s;
                }
            } catch (Throwable ignored) {}
            String cb = pendingProbeCb;
            pendingProbeCb = "";
            notifyFindDone(payload, cb);
        } else if (req == REQ_APK) {
"""),
]

# ---------------------------------------------------------------- web/xiqueer.js
EDITS['web/xiqueer.js'] = [
(r"""/* 河医大助手 · 喜鹊儿（青果教务）考试安排适配器（v1.1.69 框架全读 + 原文可见兜底）
""", r"""/* 河医大助手 · 喜鹊儿（青果教务）考试安排适配器（v1.1.71 双探全自动 + 复制兜底）
"""),

(r""" * 「已完成」；时间解析不出留空，绝不臆造 00:00。fetchExams 只读快照，
 * 不做任何裸 HTTP 抓取（那条路已被三轮真机判死）。
 */
""", r""" * 「已完成」；时间解析不出留空，绝不臆造 00:00。
 *
 * v1.1.71（方案 C · 双探全自动，触发是 m02339「课表能自动爬取考试为什么不能」）：
 * 复核发现课表全自动靠的是免令牌报表端点 wsxk.xskcb_excel10319.jsp?params=
 * （b64(xn&xq&xh)、带 Cookie 直出整张表），考试四版从没试过同款地址 —— 之前
 * 「换执行层改复制」判早了。这版同时装两路探针：A 拦「检索」发出的请求 URL、
 * B 钩「导出/打印」的下载 URL，谁先拿到像报表的地址就记住 AUTO_KEY；之后
 * fetchExams 照课表用 SOURCES.http 带 Cookie 全自动重放，零复制、零手动。
 * 两路都被挡才诚实降级回剪贴板/粘贴，界面不撒谎。仍是只读，不代交、不提交。
 */
"""),

(r"""  const RAW_KEY = 'xxmu_xq_last_raw';     // 上次「没认出」时读回的原文，供粘贴框回填
  let LAST_DIAG = '';                      // 本次会话最后一次定位说明（供复制诊断）
""", r"""  const RAW_KEY = 'xxmu_xq_last_raw';     // 上次「没认出」时读回的原文，供粘贴框回填
  const AUTO_KEY = 'xxmu_xq_auto';        // v1.1.71：双探记住的自动报表地址 {url,at,kind}
  let LAST_DIAG = '';                      // 本次会话最后一次定位说明（供复制诊断）
"""),

(r"""  const NOEXAM = '还没导入考试安排。三步：一，在教务「课程考试 → 考试安排表」检索出表、或喜鹊儿「考试安排」页；二，长按选中考试那几行文字点「复制」，回来点「从剪贴板导入」；三，或把文字粘进卡片里的框点「导入这段」。程序不再赌自动读教务页面，你复制、App 解析。';
""", r"""  const NOEXAM = '还没读到考试安排。三步：一，点「自动同步一次」，进教务「课程考试 → 考试安排表」选好学年学期、按「检索」让表出来（或点一次「导出」），再按右上角「完成」；二，程序记住那条报表地址后就像课表一样全自动刷新，不用再复制；三，万一学校把地址挡了，就长按复制考试那几行文字回来点「从剪贴板导入」，或把文字粘进框点「导入这段」。';
"""),

(r"""  function defaultDiag() {
    return '喜鹊儿考试安排（v1.1.70 · 复制后解析）：青果 V17 业务页防直链、检索结果常进弹窗，'
      + 'App 主动读页读回整页四轮真机都够不到考试表，这版不再赌读页。你在教务「课程考试 → 考试安排表」'
      + '检索出表、或喜鹊儿「考试安排」页，长按选中考试文字复制，回来点「从剪贴板导入」，程序自己认；'
      + '也可直接把文字粘进框点「导入这段」。当前还没有导入过考试安排。';
  }
""", r"""  function defaultDiag() {
    return '喜鹊儿考试安排（v1.1.71 · 双探全自动 + 复制兜底）：青果 V17 业务页防直链、'
      + '检索结果常进弹窗，App 主动读页读回整页四轮真机都够不到考试表。'
      + '这版按课表的报表端点思路装了两路探针：点「自动同步一次」，进教务「课程考试 → 考试安排表」'
      + '选好学年学期，按一次「检索」或点一次「导出」，再按右上角「完成」，程序记住那条自动地址，'
      + '之后像课表一样带登录态全自动刷新；探针都被挡时才退回「从剪贴板导入」或粘贴。当前还没有读到考试安排。';
  }
"""),

(r"""  function lastRaw() { return pg(RAW_KEY); }
""", r"""  function lastRaw() { return pg(RAW_KEY); }

  /* v1.1.71：记住 / 读取那条「像课表一样能全自动重放」的报表地址。 */
  function autoLoad() {
    try {
      const o = JSON.parse(pg(AUTO_KEY) || '');
      if (o && typeof o.url === 'string' && o.url.indexOf('http') === 0) return o;
    } catch (e) {}
    return null;
  }
  function autoSave(url, kind) {
    const o = { url: String(url), at: nowSec(), kind: String(kind || 'auto') };
    ps(AUTO_KEY, JSON.stringify(o));
    return o;
  }
"""),

(r"""  function importText(txt) {
""", r"""  /* v1.1.71：开双探视图。人在教务里按一次「检索」/「导出」，Java 侧
   * shouldInterceptRequest + DownloadListener 记下候选地址，按「完成」回传，
   * __onXqProbe 挑最像报表的那条记住，之后 fetchExams 全自动重放。 */
  function probe() {
    if (typeof Host !== 'undefined' && Host && Host.openProbeFor) {
      Host.openProbeFor(HOME, '自动同步 · 检索或导出后按完成', '__onXqProbe');
    } else if (typeof Host !== 'undefined' && Host && Host.openFinderFor) {
      Host.openFinderFor(HOME, '打开教务网', '');
    } else {
      toast2('请在 App 内使用这个功能');
    }
  }

  function importText(txt) {
"""),

(r"""  function clear() { ps(SNAP_KEY, ''); ps(RAW_KEY, ''); LAST_DIAG = defaultDiag(); }
""", r"""  function clear() {
    ps(SNAP_KEY, ''); ps(RAW_KEY, ''); ps(AUTO_KEY, '');
    LAST_DIAG = defaultDiag();
  }
"""),

(r"""  /* fetchExams 是 SOURCES 的抓取钩子：只读导入快照，不做任何网络请求。
   * 有快照 → ok（synced_at 用导入时刻，不用刷新时刻冒充，见 sources.js）；
   * 没快照 → degraded + 三步指引，绝不落成「0 条考试」。 */
  function fetchExams(onStep) {
    const snap = loadSnap();
    const diag = String((snap && snap.diag) || LAST_DIAG || defaultDiag());
    if (!snap || !snap.exams || !snap.exams.length) {
      return Promise.resolve({ state: 'degraded', error: NOEXAM, diag: diag });
    }
    return Promise.resolve({
      state: 'ok', works: [], exams: snap.exams,
      synced_at: snap.at || nowSec(),
      diag: diag,
    });
  }
""", r"""  /* v1.1.71：把报表页（青果 *_excel*.jsp 直出的 GBK 表格 HTML）转成
   * 解析器认得的「一行一考试、单元格用空格隔开」的文本。 */
  function htmlToText(html) {
    let t = String(html == null ? '' : html)
      .replace(/<\s*\/?\s*tr[^>]*>/gi, '\n')
      .replace(/<\s*\/?\s*(td|th)[^>]*>/gi, '\t')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/?\s*p[^>]*>/gi, '\n');
    try {
      if (typeof SOURCES !== 'undefined' && SOURCES && SOURCES.stripTags) t = SOURCES.stripTags(t);
      else t = t.replace(/<[^>]*>/g, ' ');
    } catch (e) { t = t.replace(/<[^>]*>/g, ' '); }
    return t;
  }

  function fromSnap(prefix) {
    const snap = loadSnap();
    const diag = String((snap && snap.diag) || LAST_DIAG || defaultDiag())
      + (prefix ? '（' + prefix + '，已保留上次读到的考试）' : '');
    if (!snap || !snap.exams || !snap.exams.length) {
      return { state: 'degraded', error: NOEXAM, diag: diag };
    }
    return {
      state: 'ok', works: [], exams: snap.exams,
      synced_at: snap.at || nowSec(), diag: diag,
    };
  }

  /* v1.1.71：fetchExams 是 SOURCES 的抓取钩子。
   *   ① 已记住自动报表地址（AUTO_KEY）→ 照课表那样带 Cookie 全自动重放：
   *      SOURCES.http(url) → 解析 → ok，零复制。重放失败/认不出仍保留上次快照，
   *      绝不把「凭证失效页」当 0 条考试。
   *   ② 没记住地址 → 退回导入快照（剪贴板 / 粘贴 / 回跳读页）。
   *   ③ 都没有 → degraded + 三步指引，绝不落成「0 条考试」。 */
  function fetchExams(onStep) {
    const auto = autoLoad();
    if (auto && typeof SOURCES !== 'undefined' && SOURCES && SOURCES.http) {
      if (onStep) { try { onStep('正在自动同步考试安排…'); } catch (e) {} }
      return Promise.resolve(SOURCES.http(auto.url, {
        cookieUrl: BASE + '/', referer: HOME, method: 'GET',
      })).then(function (res) {
        if (res && res.ok && res.text) {
          const exams = parseCapture(htmlToText(res.text));
          if (exams.length) {
            const at = save(exams, auto.url, '全自动同步');
            return { state: 'ok', works: [], exams: exams,
              synced_at: at, diag: '已按记住的报表地址全自动同步 ' + exams.length + ' 场考试。' };
          }
        }
        return fromSnap(res && res.error);
      }).catch(function () { return fromSnap('自动同步失败'); });
    }
    return Promise.resolve(fromSnap(''));
  }
"""),

(r"""  window.XQ = { find: find, importText: importText, importClip: importClip, clear: clear, has: has,
    lastRaw: lastRaw, parse: parseCapture, fetch: fetchExams };
""", r"""  /* ================== v1.1.71 双探回跳 ================== */
  /* MainActivity.notifyFindDone 把 FIND_JS 对象（Java 侧已并入 probes）传进来。
   * ① 页面里直接渲染出了考试表 → 当场认并落快照；
   * ② 否则从拦到的候选请求里挑最像「课表那种报表端点」的地址记进 AUTO_KEY；
   * ③ 两路都被挡 → 摊原文 + 诚实降级，剪贴板/粘贴兜底照旧。 */
  function probeScore(p) {
    const u = String((p && p.url) || '');
    const low = u.toLowerCase();
    let s = 0;
    if (low.indexOf('qgjw.xxmu.edu.cn') >= 0 || u.indexOf('/student/') >= 0) s += 2;
    if (p && p.kind === 'download') s += 4;                       // 导出/打印最像课表
    if (low.indexOf('download') >= 0) s += 3;
    if (low.indexOf('params=') >= 0 || low.indexOf('excel') >= 0) s += 4;
    if (low.indexOf('export') >= 0 || low.indexOf('print') >= 0) s += 3;
    if (low.indexOf('ksap') >= 0 || low.indexOf('exam') >= 0
        || low.indexOf('kaoshi') >= 0 || low.indexOf('kscx') >= 0) s += 3;
    if (low.indexOf('.jsp') >= 0 || low.indexOf('.action') >= 0
        || low.indexOf('.do') >= 0) s += 1;
    if (String((p && p.method) || 'GET').toUpperCase() === 'GET') s += 1;
    else s -= 3;
    if (low.indexOf('about:blank') >= 0 || low.indexOf('homes.action') >= 0
        || low.indexOf('menu.jsp') >= 0 || low.indexOf('login') >= 0
        || low.indexOf('custom/js/') >= 0 || low.indexOf('.css') >= 0
        || low.indexOf('.png') >= 0 || low.indexOf('.gif') >= 0) s = 0;
    return s > 0 ? s : 0;
  }

  function fireSync() {
    if (window.SrcUI && window.SrcUI.sync) window.SrcUI.sync('xiqueer', true);
    else if (window.SOURCES && window.SOURCES.refresh) window.SOURCES.refresh('xiqueer', function () {});
  }

  window.__onXqProbe = function (jsonText) {
    let obj = null;
    try { obj = (typeof jsonText === 'string') ? JSON.parse(jsonText) : jsonText; }
    catch (e) { obj = null; }
    if (!obj || typeof obj !== 'object') obj = {};

    const pageExams = parseCapture(obj);
    if (pageExams.length) {
      save(pageExams, String(obj.u || ''), '教务页直接读回');
      fireSync();
      toast2('已从教务读到 ' + pageExams.length + ' 场考试，之后全自动刷新');
      return;
    }

    const list = Array.isArray(obj.probes) ? obj.probes : [];
    let best = null, bestScore = 0;
    for (let i = 0; i < list.length; i++) {
      const sc = probeScore(list[i]);
      if (sc > bestScore) { bestScore = sc; best = list[i]; }
    }
    if (best && bestScore >= 5) {
      autoSave(best.url, best.kind || 'auto');
      LAST_DIAG = '双探已记住自动地址：' + best.url + '（' + (best.kind || 'request')
        + '，评分 ' + bestScore + '）。之后像课表一样带登录态全自动刷新，不用再复制。';
      fireSync();
      toast2('已记住自动同步地址，正在试跑一次…');
      return;
    }

    const rawText = rawTextOf(obj);
    ps(RAW_KEY, rawText);
    LAST_DIAG = '双探：打开了 ' + (obj.u || '教务页') + '，读到 ' + list.length
      + ' 条候选请求，但没有像课表那样能重放的报表地址，页面里也没认出考试条目。'
      + '请确认已按「检索」把表查出来（或点一次「导出」）再按「完成」；'
      + '实在不行就用「从剪贴板导入」或把文字粘进框，读回原文已摊进框里。';
    if (window.SrcUI && window.SrcUI.paint) window.SrcUI.paint();
    try {
      const tas = (typeof document !== 'undefined' && document.querySelectorAll)
        ? document.querySelectorAll('textarea.src-paste') : [];
      for (let z = 0; z < tas.length; z++) {
        tas[z].value = rawText.slice(0, 20000);
        tas[z].setAttribute('rows', '5');
      }
    } catch (e) {}
    toast2('这次没记住自动地址；读回的原文已摊进框，可用复制/粘贴兜底');
  };

  window.XQ = {
    find: find, probe: probe, importText: importText, importClip: importClip,
    clear: clear, has: has, lastRaw: lastRaw, auto: autoLoad,
    parse: parseCapture, fetch: fetchExams, score: probeScore,
  };
"""),
]

# ---------------------------------------------------------------- web/app.js
EDITS['web/app.js'] = [
(r"""    /* v1.1.70：四轮真机都卡在「App 主动去够青果页面」，这次换执行层——
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
""", r"""    /* v1.1.71（方案 C）：主按钮是「自动同步一次」——双探记住报表地址后
     * 像课表一样全自动；剪贴板 / 粘贴留作兜底，界面不撒谎。 */
    if (s.id === 'xiqueer') {
      const hint2 = el('p', 'hint tight');
      hint2.textContent = '点「自动同步一次」，进教务「课程考试 → 考试安排表」选好学年学期按「检索」（或点「导出」）让表出来，再按右上角「完成」；程序记住那条地址后就像课表一样全自动刷新，不用再复制。学校把地址挡了才用「从剪贴板导入」或粘贴兜底。';
      wrap.appendChild(hint2);
      const bProbe = el('button', 'btn', '自动同步一次');
      bProbe.setAttribute('data-act', 'probe');
      wrap.appendChild(bProbe);
      const bClip = el('button', 'btn soft', '从剪贴板导入（兜底）');
      bClip.setAttribute('data-act', 'paste');
      wrap.appendChild(bClip);
      const bFind = el('button', 'btn ghost', '打开教务网');
      bFind.setAttribute('data-act', 'find');
      wrap.appendChild(bFind);
      const ta = el('textarea', 'src-paste');
      ta.setAttribute('placeholder', '把考试安排表的文字粘贴到这里；没认出时读回的原文会摊进这个框，可改后再导入');
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
"""),

(r"""    const bOut = el('button', 'btn ghost',
      s.id === 'xiqueer' ? '清掉导入的考试' : '断开' + s.short);
""", r"""    const bOut = el('button', 'btn ghost',
      s.id === 'xiqueer' ? '清掉考试与自动地址' : '断开' + s.short);
"""),

(r"""      const act = btn.getAttribute('data-act');
      if (act === 'paste') {
""", r"""      const act = btn.getAttribute('data-act');
      if (act === 'probe') {
        /* v1.1.71：开双探视图，人按一次检索/导出 + 完成，程序记住报表地址。
         * 之后 SrcUI.sync → SOURCES.refresh → fetchExams 全自动重放，零复制。 */
        if (window.XQ && XQ.probe) XQ.probe();
        else if (window.XQ && XQ.find) XQ.find();
      } else if (act === 'paste') {
"""),

(r"""          ? '清掉已经导入的考试安排？教务登录不会受影响。'
""", r"""          ? '清掉已经读到的考试和记住的自动地址？教务登录不会受影响。'
"""),
]

# ---------------------------------------------------------------- tools/check_web.js
EDITS['tools/check_web.js'] = [
(r"""console.log('\n' + (bad === 0 ? '[PASS] 静态体检全部通过' : '[FAIL] ' + bad + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
""", r"""/* ---- v1.1.71：方案 C 双探全自动（拦检索请求 + 钩导出下载，照课表重放）。
 * m02339「课表能自动爬取考试为什么不能」：复核发现课表靠免令牌报表端点
 * wsxk.xskcb_excel10319.jsp?params=；这版同时装两路探针，谁先拿到像报表的
 * 地址就记住，之后用 SOURCES.http 带 Cookie 全自动重放，零复制。 */
console.log('\nv1.1.71 checkpoints（双探全自动 / 报表地址重放）:');
const wa1171 = read('android/src/com/xxmu/helper/WebActivity.java');
const ma1171 = read('android/src/com/xxmu/helper/MainActivity.java');
const xq1171 = read('web/xiqueer.js');
const ap1171 = read('web/app.js');
has(wa1171, 'EXTRA_PROBE', 'WebActivity 有 EXTRA_PROBE 双探开关');
has(wa1171, 'shouldInterceptRequest', 'WebActivity 拦「检索」发出的请求 URL');
has(wa1171, 'setDownloadListener', 'WebActivity 钩「导出/打印」的下载 URL');
has(wa1171, 'recordProbe', 'WebActivity 把候选地址记进 probes');
has(ma1171, 'openProbeFor', 'MainActivity 有 openProbeFor 打开双探视图');
has(ma1171, 'REQ_PROBE', 'MainActivity 有 REQ_PROBE 结果分支');
has(xq1171, '__onXqProbe', 'xiqueer.js 有双探回跳处理');
has(xq1171, 'AUTO_KEY', 'xiqueer.js 记住自动报表地址');
has(xq1171, 'SOURCES.http', 'xiqueer.js 照课表用带 Cookie 的桥重放');
has(xq1171, 'probeScore', 'xiqueer.js 对候选地址打分挑最像报表的');
has(ap1171, "act === 'probe'", 'app.js 有「自动同步一次」动作');

console.log('\n' + (bad === 0 ? '[PASS] 静态体检全部通过' : '[FAIL] ' + bad + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
"""),
]

# ---------------------------------------------------------------- design/sketch/learn-v1166.html
EDITS['design/sketch/learn-v1166.html'] = [
(r"""    <!-- v1.1.70：四轮真机够不到青果考试表，换执行层「你复制、App 解析」。 -->
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
""", r"""    <!-- v1.1.71：方案 C 双探全自动，主按钮「自动同步一次」，剪贴板/粘贴兜底。 -->
    <div class="card src-card">
      <div class="row"><span>喜鹊儿 / 青果</span><span class="v src-state warn">暂不可用</span></div>
      <p class="hint tight" data-role="note">还没读到考试安排。点「自动同步一次」，进「课程考试 → 考试安排表」选好学年学期按「检索」（或点「导出」）让表出来，再按右上角「完成」。</p>
      <p class="hint tight">程序会记住那条报表地址，之后像课表一样带登录态全自动刷新，不用再复制；万一被挡，读回原文会摊进下面的框，也能用剪贴板或粘贴兜底。</p>
      <button class="btn">自动同步一次</button>
      <button class="btn soft">从剪贴板导入（兜底）</button>
      <button class="btn ghost">打开教务网</button>
      <textarea class="src-paste" rows="3" placeholder="把考试安排表的文字粘贴到这里；没认出时读回的原文会摊进这个框，可改后再导入"></textarea>
      <button class="btn soft">导入这段</button>
      <button class="btn ghost">登录 / 重新登录教务</button>
      <button class="btn ghost">复制诊断</button>
    </div>
    <p class="hint tight" style="padding:2px 2px 6px">这一版双探一次做齐：拦「检索」请求 + 钩「导出」下载，谁先拿到像课表的报表地址用谁，之后全自动。</p>
"""),
]

# ---------------------------------------------------------------- tools/test_xiqueer.js
EDITS['tools/test_xiqueer.js'] = [
(r"""/* 喜鹊儿「真浏览器辅助发现 + 粘贴导入」的离线回归测试（v1.1.69）。
""", r"""/* 喜鹊儿「双探全自动 + 粘贴/剪贴板兜底」的离线回归测试（v1.1.71）。
"""),

(r"""  const store = {}, calls = { finder: [], sync: [], toast: [], http: 0 };
  const specBox = {};
  const textareas = [mkTa(), mkTa()];
  const clipBox = { text: '' };
""", r"""  const store = {}, calls = { finder: [], probe: [], sync: [], toast: [], http: 0, httpUrls: [] };
  const specBox = {};
  const textareas = [mkTa(), mkTa()];
  const clipBox = { text: '' };
  const httpBox = { ok: true, text: '' };
"""),

(r"""    http() { calls.http++; return Promise.resolve({ ok: false, text: '', code: 0 }); },
""", r"""    http(url) { calls.http++; calls.httpUrls.push(String(url));
      return Promise.resolve({ ok: httpBox.ok, text: httpBox.text, code: 200 }); },
"""),

(r"""    openFinderFor(u, t, cb) { calls.finder.push([u, t, cb]); return true; },
    openLogin() { return true; },
""", r"""    openFinderFor(u, t, cb) { calls.finder.push([u, t, cb]); return true; },
    openProbeFor(u, t, cb) { calls.probe.push([u, t, cb]); return true; },
    openLogin() { return true; },
"""),

(r"""  return { XQ: sandbox.XQ, spec: specBox.spec, calls: calls, store: store,
    onFind: sandbox.__onXqFind, textareas: textareas, clipBox: clipBox };
""", r"""  return { XQ: sandbox.XQ, spec: specBox.spec, calls: calls, store: store,
    onFind: sandbox.__onXqFind, onProbe: sandbox.__onXqProbe,
    textareas: textareas, clipBox: clipBox, httpBox: httpBox };
"""),

(r"""  console.log('\n[v1.1.69] web/xiqueer.js 辅助发现 / 粘贴导入离线测试（Node vm）');
""", r"""  console.log('\n[v1.1.71] web/xiqueer.js 双探全自动 / 粘贴导入离线测试（Node vm）');
"""),

(r"""  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
""", r"""  /* ㉛-㊱ v1.1.71 方案 C 双探全自动：probe() 开双探、记住报表地址、之后
   * fetchExams 用 SOURCES.http 带 Cookie 全自动重放；两路都被挡则诚实降级。 */
  {
    const { XQ, calls } = load();
    XQ.probe();
    ok('㉛ probe() 开双探视图并挂 __onXqProbe 回跳',
      calls.probe.length === 1 && calls.probe[0][2] === '__onXqProbe',
      'probe=' + JSON.stringify(calls.probe));
  }
  {
    const { XQ, calls, onProbe } = load();
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action',
      text: '课程考试 考试安排表 检索 打印 导出', rows: [], tables: [], sels: [], frames: [],
      raw: '（门户）',
      probes: [
        { url: 'https://qgjw.xxmu.edu.cn/custom/js/SetKingoEncypt.jsp', method: 'GET', kind: 'request' },
        { url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel10319.jsp?params=abc', method: 'GET', kind: 'download' },
      ],
    }));
    const a = XQ.auto();
    ok('㉜ 双探记住最像报表的下载/导出地址（AUTO_KEY）并触发刷新',
      !!a && String(a.url).indexOf('ksap_excel') >= 0
        && calls.sync.some(c => c[0] === 'xiqueer'),
      'auto=' + JSON.stringify(a) + ' sync=' + JSON.stringify(calls.sync));
  }
  {
    const { XQ, spec, calls, onProbe, httpBox } = load();
    httpBox.ok = true;
    httpBox.text = '<table><tr><td>序号</td><td>课程名称</td><td>考试时间</td><td>考场</td></tr>'
      + '<tr><td>1</td><td>医用物理学</td><td>2026-12-20 09:00-11:00</td><td>第3教学楼A201</td></tr></table>';
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action', text: '', rows: [], frames: [],
      probes: [{ url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel.jsp?params=xx', method: 'GET', kind: 'download' }],
    }));
    const r = await spec.fetch(() => {});
    ok('㉝ 记住地址后 fetchExams 全自动重放：发 1 次带 Cookie 的 http、认出考试、ok',
      calls.http === 1 && String(calls.httpUrls[0]).indexOf('ksap_excel') >= 0
        && r && r.state === 'ok' && r.exams.length === 1
        && r.exams[0].course === '医用物理学',
      'http=' + calls.http + ' state=' + (r && r.state)
        + ' exams=' + JSON.stringify(r && r.exams));
  }
  {
    const { XQ, spec, onProbe, httpBox } = load();
    XQ.importText(CARD);
    httpBox.ok = true; httpBox.text = '凭证已失效，请重新登录';
    onProbe(JSON.stringify({ u: 'https://qgjw.xxmu.edu.cn/', text: '', frames: [],
      probes: [{ url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel.jsp?params=xx', method: 'GET', kind: 'download' }] }));
    const r = await spec.fetch(() => {});
    ok('㉞ 自动重放认不出时保留旧快照、不把凭证失效页当 0 条考试',
      r && r.state === 'ok' && r.exams.length === 1
        && r.exams[0].course === '高等数学B1',
      'state=' + (r && r.state) + ' exams=' + JSON.stringify(r && r.exams));
  }
  {
    const { XQ, textareas, onProbe } = load();
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action?v=1',
      text: '学籍档案 学籍异动 培养方案', rows: [], tables: [], sels: [], frames: [],
      raw: 'RAWTEXT_probe_只有门户菜单',
      probes: [
        { url: 'https://qgjw.xxmu.edu.cn/frame/homes.action', method: 'GET', kind: 'request' },
        { url: 'https://qgjw.xxmu.edu.cn/custom/js/GetKingoEncypt.jsp?t=1', method: 'GET', kind: 'request' },
        { url: 'about:blank', method: 'GET', kind: 'request' },
      ],
    }));
    ok('㉟ 两条探针都被挡：不记自动地址、把读回原文摊进 RAW_KEY 与 textarea',
      XQ.auto() === null && String(XQ.lastRaw()).indexOf('RAWTEXT_probe') >= 0
        && textareas.every(t => String(t.value).indexOf('RAWTEXT_probe') >= 0),
      'auto=' + JSON.stringify(XQ.auto()) + ' lastRaw=' + String(XQ.lastRaw()).slice(0, 40));
  }
  {
    const { XQ, spec, calls, onProbe } = load();
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/student/ksap.jsp',
      text: CARD, rows: [], tables: [], frames: [], probes: [],
    }));
    const r = await spec.fetch(() => {});
    ok('㊱ 双探视图里页面直接渲染出表：当场认出 1 场、零 HTTP（还没记地址）',
      r && r.state === 'ok' && r.exams.length === 1
        && r.exams[0].course === '高等数学B1' && calls.http === 0,
      'state=' + (r && r.state) + ' http=' + calls.http);
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
"""),
]


def read_norm(rel):
    p = P(rel)
    with open(p, 'rb') as f:
        b = f.read()
    crlf = b'\r\n' in b
    return p, crlf, b.decode('utf-8').replace('\r\n', '\n')


def apply(rel, edits):
    p, crlf, norm = read_norm(rel)
    problems = []
    for i, (old, new) in enumerate(edits):
        c = norm.count(old)
        if c != 1:
            problems.append('%s edit %d count=%d' % (rel, i, c))
        elif old == new:
            problems.append('%s edit %d NOOP' % (rel, i))
    if problems:
        for x in problems:
            print('ANCHOR_FAIL ' + x)
        return None
    cur = norm
    for old, new in edits:
        cur = cur.replace(old, new, 1)
    out = cur.replace('\n', '\r\n') if crlf else cur
    return p, out.encode('utf-8')


results = []
for rel, edits in EDITS.items():
    r = apply(rel, edits)
    if r is None:
        sys.exit(2)
    results.append(r)

for p, data in results:
    with open(p, 'wb') as f:
        f.write(data)
    print('WROTE %s (%d bytes)' % (os.path.relpath(p, ROOT), len(data)))

total = sum(len(e) for e in EDITS.values())
print('ANCHOR_CHECK_OK edits=%d files=%d' % (total, len(EDITS)))
