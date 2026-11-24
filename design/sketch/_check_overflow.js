/* _check_overflow.js -- 横向溢出 + 竖向挤压体检（离线、无真机）。
 *
 *   node design/sketch/_check_overflow.js [light|dark] [nova|classic]
 *
 * v2.9.1 起覆盖全部 9 个 section（原来只看学习页 + 成绩面板）。
 * todo.md「三、可以做」里那条「各版本 UI 在矮视口下的复查」明确写着
 * 「其余页面（设置、WIKI、校园、饮水机、教室、我的）仍需真机或另写探针
 * 逐页看」—— 这个脚本就是那支探针。
 *
 * 每档量三件事：
 *   1) 每个 section 里的元素有没有右边界超过视口（over=0 才算过）；
 *      顺带量左边界 < 0（负溢出，通常是负 margin / 绝对定位越界）。
 *   2) 学习页今日一行：按钮是否被挤出 .tl-top（超出即说明文字把按钮顶到
 *      第二行或被裁掉），以及按钮实际宽度还够不够点（< 64px 视为挤没了）。
 *   3) 成绩面板：两个目标绩点输入框是否被压扁（< 28px 点不到）。
 *
 * 为什么用 iframe：Windows 上 headless Edge 对窗口宽度有下限（实测最小
 * 492），--window-size=360 一样报 innerWidth=492，量不出窄屏。塞进
 * width=W 的 iframe 里，内部 clientWidth 就等于 W。
 *
 * 为什么读 web/index.html 而不是自己拼页面：它引的 css/js 都是相对路径，
 * file:// 打开就是 App 里 WebView 跑的那一份。以前用 make_nova_real.js
 * 生成的长截图夹具页量布局，那套夹具为了「一张长截图」把 html/body/#app
 * 全写死 390px !important，在改造过的地基上量出来的溢出算谁的说不清
 * （实测 360px 档恒报 over=71，全是画布撑出来的假阳性）。
 *
 * 为什么一个 iframe 里跑完 9 个 tab 而不是 9×6 个 iframe：switchTab 只是
 * 给 section 换 active 类，同一个文档里顺序切过去就行；54 个 iframe 同时
 * 渲染会把这台机器的 headless 拖到十几分钟。
 *
 * ASCII-only source，规则同 make_nova_real.js。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

const WIDTHS = [360, 390, 412, 492];

/* 9 个 section，顺序与 index.html 里一致。 */
const TABS = ['kb', 'learn', 'wiki', 'campus', 'me', 'settings', 'guide', 'admin', 'about'];

/* ------------------------------------------------------------------ *
 * 页面内探针：先按 WIDTHS 各起一个 iframe，每个 iframe 内部顺序切 9 个
 * tab，逐个量完再切下一个。最后由窗口侧统一收 title。
 * ------------------------------------------------------------------ */
const PROBE = [
  '<script id="ovProbe">',
  '(function(){',
  '  var TABS = ' + JSON.stringify(TABS) + ';',
  '  var W = document.documentElement.clientWidth;',
  '  var res = [];',
  '  var idx = 0;',
  '',
  '  function nm(el){',
  '    var s = el.tagName.toLowerCase();',
  '    if (el.id) s += "#" + el.id;',
  '    var c = (el.className && typeof el.className === "string") ? el.className.trim() : "";',
  '    if (c) s += "." + c.split(/\\s+/).slice(0, 2).join(".");',
  '    return s.slice(0, 42);',
  '  }',
  '',
  /* 元素是否被某个祖先裁掉了。这是这套体检最关键的一条判断 ——
   * 不判它就会把「横向滚动的带子」全报成溢出：
   *   · .nv-belt-track 是周次传送带，20+ 个 36px 的格子本来就比屏幕宽，
   *     外层 .nv-belt-rail 明确写了 overflow:hidden 让它横向拖；
   *   · WIKI 的 .nv-clip-chip 同理。
   * 分两档：
   *   scroll = 祖先是 overflow-x:auto/scroll → 用户滑得到，不算错；
   *   clip   = 祖先是 overflow:hidden/clip 且自己不可滚 → 内容真的够不着，
   *            这才是要修的（单独计数，不能混进 over）。 */
  '  function clipOf(el){',
  '    var cur = el.parentElement;',
  '    while (cur && cur !== document.body) {',
  '      var cs = getComputedStyle(cur);',
  '      var ox = cs.overflowX;',
  '      if (ox !== "visible") {',
  '        var mode = (ox === "auto" || ox === "scroll") ? "scroll" : "clip";',
  '        /* hidden 但内容可滚（scrollWidth > clientWidth 且有滚动条能力）视作 clip；',
  '         * 这里只要知道「是不是同一个可滚容器」，type 已够用。 */',
  '        return { mode: mode, sel: nm(cur) };',
  '      }',
  '      cur = cur.parentElement;',
  '    }',
  '    return null;',
  '  }',
  '',
  /* 扫一个选择器下的所有元素，返回 {n, l, hid, first}。
   *   n   = 真的顶出视口（没被任何祖先裁）
   *   l   = 负向溢出（左边界 < 0）
   *   hid = 被 overflow:hidden 的祖先裁掉了、且那个祖先不可滚 → 够不着 */
  '  function scan(sel){',
  '    var all = document.querySelectorAll(sel), n = 0, l = 0, hid = 0, seen = 0, first = [];',
  '    for (var i = 0; i < all.length; i++) {',
  '      var el = all[i];',
  '      var cs = getComputedStyle(el);',
  '      if (cs.display === "none" || cs.visibility === "hidden") continue;',
  '      var r = el.getBoundingClientRect();',
  '      if (r.width <= 0 && r.height <= 0) continue;',
  '      seen++;',
  '      if (r.right > W + 0.6) {',
  '        var c = clipOf(el);',
  '        if (c && c.mode === "scroll") continue;',
  '        if (c && c.mode === "clip") {',
  '          hid++;',
  '          if (first.length < 3) first.push("clip:" + nm(el) + "@" + Math.round(r.right));',
  '          continue;',
  '        }',
  '        n++;',
  '        if (first.length < 3) first.push(nm(el) + "@" + Math.round(r.right));',
  '      }',
  '      if (r.left < -0.6 && r.width > 1) l++;',
  '    }',
  '    return { n: n, l: l, hid: hid, seen: seen, first: first };',
  '  }',
  '',
  '  function step(){',
  '    if (idx >= TABS.length) { finish(); return; }',
  '    var t = TABS[idx++];',
  '    try { if (typeof switchTab === "function") switchTab(t); } catch (e) {}',
  /* 二级页各自有「进来后重画一次」的规矩，光 switchTab 不够：
   * guide 的正文是 GUIDE.render() 铺的，about 的版本行是 About.refresh()
   * 写的。漏了这两步，拍到的是空壳，量出来的「没有溢出」毫无意义。 */
  '    try { if (t === "guide" && typeof GUIDE !== "undefined" && GUIDE.render) GUIDE.render(); } catch (e) {}',
  '    try { if (t === "about" && typeof About !== "undefined" && About.refresh) About.refresh(); } catch (e) {}',
  '    try { if (t === "settings" && typeof THEME !== "undefined" && THEME.paint) THEME.paint(); } catch (e) {}',
  '    setTimeout(function(){',
  '      var r = scan("#tab-" + t + " *");',
  '      var s = t + ":" + r.n + (r.l ? "/" + r.l + "L" : "") + (r.hid ? "/" + r.hid + "H" : "") +',
  '              "#" + r.seen;',
  '      if (r.first.length) s += "(" + r.first.join(",") + ")";',
  '      res.push(s);',
  '      step();',
  '    }, 200);',
  '  }',
  '',
  /* 学习页专项：今日一行的按钮位置 + 成绩面板的输入框宽度。
   * 这两条是 v2.0.0 新增的三个功能里最容易在窄屏上塌的两个。 */
  '  function learnBits(){',
  '    var out = [];',
  '    try { if (typeof switchTab === "function") switchTab("learn"); } catch (e) {}',
  '    var top = document.querySelector("#todayLine .tl-top");',
  '    var btn = document.getElementById("copyUndone");',
  '    if (top && btn) {',
  '      var rt = top.getBoundingClientRect(), rb = btn.getBoundingClientRect();',
  '      out.push("btnW=" + Math.round(rb.width) + " vOver=" + Math.round(rb.bottom - rt.bottom));',
  '    } else out.push("btnW=-1 vOver=-1");',
  '    var tl = document.getElementById("todayLine");',
  '    out.push("tl=" + (tl ? Math.round(tl.getBoundingClientRect().height) : -1));',
  '    return out.join(" ");',
  '  }',
  '',
  '  function gpaBits(){',
  '    var out = [];',
  '    try { if (typeof GRADES !== "undefined" && GRADES.open) GRADES.open(); } catch (e) {}',
  '    try { if (typeof LEARNPLUS !== "undefined" && LEARNPLUS.paintTarget) LEARNPLUS.paintTarget(); } catch (e) {}',
  '    var sheet = document.getElementById("sheet");',
  '    var sv = "sheet=no";',
  '    if (sheet) {',
  '      var cs = getComputedStyle(sheet);',
  '      sv = "sheet=" + cs.display + "/" + Math.round(sheet.getBoundingClientRect().height) +',
  '           " on=" + (sheet.className.indexOf("on") >= 0 ? 1 : 0);',
  '    }',
  '    out.push(sv);',
  '    var sh = scan("#sheet *");',
  '    out.push("sover=" + sh.n);',
  '    if (sh.first.length) out.push("sfirst=" + sh.first.join(","));',
  '    var ti = document.getElementById("gpaTargetIn"), ri = document.getElementById("gpaRemainIn");',
  '    if (ti && ri) {',
  '      out.push("tW=" + Math.round(ti.getBoundingClientRect().width) +',
  '               " rW=" + Math.round(ri.getBoundingClientRect().width));',
  '    } else out.push("tW=-1 rW=-1");',
  '    return out.join(" ");',
  '  }',
  '',
  '  function finish(){',
  '    var learn = learnBits();',
  '    setTimeout(function(){',
  '      var gpa = gpaBits();',
  '      setTimeout(function(){',
  '        var de = document.documentElement;',
  '        var line = "W=" + W + " sw=" + de.scrollWidth + " | " + res.join(" | ") +',
  '                   " || " + learn + " || " + gpa;',
  '        document.title = line;',
  '      }, 320);',
  '    }, 240);',
  '  }',
  '',
  '  if (document.readyState === "complete") step(); else window.addEventListener("load", step);',
  '})();',
  '</script>'
].join('\n');

/* 首启遮罩（激活门/免责/教程/引导/更新）在真机上只出现一次，体检时压掉，
 * 否则 #gate 会把整页盖住、量的还是遮罩。#sheet 不藏 —— 面板也要量。 */
const HIDE = [
  '<style id="ovHide">',
  '#gate,#disc,#tut,#onb,#upd{display:none!important}',
  '</style>'
].join('\n');

/* 造当天一定有课、有未完成作业的夹具。DATA / TIMES / curWeek / PERIODS
 * 是 app.js 顶层 let 绑定，跨 script 标签能按裸标识符读写，但不是 window
 * 属性 —— 写成 window.DATA 一律 undefined，夹具会静默什么都不做。 */
const SETUP = [
  '<script id="ovSetup">',
  '(function(){',
  '  function go(){',
  '    try {',
  '      document.documentElement.setAttribute("data-skin", SKIN);',
  '      document.documentElement.setAttribute("data-theme", THEME);',
  '    } catch(e){}',
  /* #app.locked{display:none} 是激活门盖着时的状态；不解锁整页 rect 全是 0，
   * 量什么都是 0（会误判成「按钮被挤没」）。 */
  '    try {',
  '      var ap = document.getElementById("app");',
  '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
  '    } catch(e){}',
  '    try {',
  '      var tw = weekOf(new Date()), d0 = (new Date().getDay() + 6) % 7 + 1;',
  '      var d1 = d0 % 7 + 1, d2 = (d0 + 1) % 7 + 1;',
  '      DATA.courses = [',
  '        {name:"\u7cfb\u7edf\u89e3\u5256\u5b66", room:"A201", teacher:"\u5f20", weeks:[tw], day:d0, periods:[1,2]},',
  '        {name:"\u751f\u7406\u5b66", room:"B305", teacher:"\u674e", weeks:[tw], day:d0, periods:[5,6]},',
  '        {name:"\u75c5\u7406\u5b66", room:"C102", teacher:"\u738b", weeks:[tw], day:d1, periods:[3,4]},',
  '        {name:"\u836f\u7406\u5b66", room:"D404", teacher:"\u8d75", weeks:[tw], day:d2, periods:[1,2]}',
  '      ];',
  /* TIMES 是「校方作息串」数组，形如 08:00~08:40（app.js 按
   * TIMES[b.start-1].split("~")[0] 取起点）。别造成对象数组 —— hhmm()
   * 只认 HH:MM 开头的字符串，喂对象进 todaySummary 会判 unknown。 */
  '      TIMES = [];',
  '      for (var p = 1; p <= 16; p++) {',
  '        var m0 = 8 * 60 + (p - 1) * 45;',
  '        TIMES.push(pad2(Math.floor(m0 / 60)) + ":" + pad2(m0 % 60) + "~" +',
  '                   pad2(Math.floor((m0 + 45) / 60)) + ":" + pad2((m0 + 45) % 60));',
  '      }',
  '      PERIODS = 16; curWeek = tw;',
  '    } catch(e){}',
  '    try {',
  '      var now = Date.now(), H = 3600 * 1000;',
  '      window.HOMEWORK = {',
  '        works: [',
  '          {id:"w1", course:"\u75c5\u7406\u5b66", title:"\u5b9e\u9a8c\u62a5\u544a\uff1a\u7ec6\u80de\u663e\u5fae\u89c2\u5bdf", due: now + 26*H, status:"\u5f85\u505a", status_known:true},',
  '          {id:"w2", course:"\u7cfb\u7edf\u89e3\u5256\u5b66", title:"\u7b2c\u4e09\u6b21\u4f5c\u4e1a\uff1a\u6570\u636e\u7ed3\u6784", due: now + 48*H, status:"\u5f85\u505a", status_known:true},',
  '          {id:"w3", course:"\u751f\u7406\u5b66", title:"\u5355\u5143\u6d4b\u9a8c\uff08\u7b2c\u516b\u7ae0\uff09", due: now + 96*H, status:"\u672a\u5f00\u59cb", status_known:true},',
  '          {id:"w4", course:"\u836f\u7406\u5b66", title:"\u590d\u4e60\u63d0\u7eb2", due: now + 12*H, status:"\u5f85\u505a", status_known:true},',
  '          {id:"w5", course:"\u75c5\u7406\u5b66", title:"\u65e9\u5df2\u8fc7\u671f\u7684\u4f5c\u4e1a", due: now - 5*H, status:"\u5f85\u505a", status_known:true}',
  '        ],',
  '        exams: [',
  '          {id:"e1", course:"\u75c5\u7406\u5b66", title:"\u75c5\u7406\u5b66\u671f\u4e2d\u8003\u8bd5", start: now + 24*H, end: now + 26*H, status:"\u672a\u5f00\u59cb", status_known:true},',
  '          {id:"e2", course:"\u7cfb\u7edf\u89e3\u5256\u5b66", title:"\u7cfb\u7edf\u89e3\u5256\u5b66\u671f\u4e2d\u8003\u8bd5", start: now + 120*H, end: now + 122*H, status:"\u672a\u5f00\u59cb", status_known:true}',
  '        ]',
  '      };',
  '      window.HOMEWORK._source = "multi";',
  '      window.HOMEWORK.sources = [{state:"ok"},{state:"ok"},{state:"stale"}];',
  '    } catch(e){}',
  '    try { DATA._source = "app"; DATA.term = "2026-2027 \u5b66\u5e74\u7b2c\u4e00\u5b66\u671f"; } catch(e){}',
  '    try {',
  '      if (typeof renderWeek === "function") renderWeek();',
  '      if (typeof renderHomework === "function") renderHomework();',
  '    } catch(e){}',
  /* 待办夹具：有 due 的走「昨天/明天」相对日期，没 due 的走纯文本，
   * 两种排版都要量到。due 必须是 YYYY-MM-DD —— mytodo.js 用
   * new Date(x.due + "T00:00:00") 解析。 */
  '    try {',
  '      function ds2(h){ var d = new Date(Date.now() + h*3600e3);',
  '        function p(n){ return (n<10?"0":"")+n; }',
  '        return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()); }',
  '      localStorage.setItem("xxmu_mytodo", JSON.stringify([',
  '        {id:"a1", text:"\u501f\u300a\u75c5\u7406\u5b66\u300b\u7b2c\u516b\u7248", due: ds2(-24), done:false, at:Date.now()},',
  '        {id:"a2", text:"\u5468\u4e09\u524d\u4ea4\u75c5\u7406\u5b9e\u9a8c\u62a5\u544a", due: ds2(24), done:false, at:Date.now()},',
  '        {id:"a3", text:"\u80cc\u5b8c\u836f\u7406\u7b2c\u4e09\u7ae0", due:"", done:false, at:Date.now()},',
  '        {id:"a4", text:"\u95ee\u8f85\u5bfc\u5458\u8c03\u8bfe", due:"", done:true, at:Date.now()}',
  '      ]));',
  '    } catch(e){}',
  /* 饮水机夹具：真机上这张卡只有登录后才显示（app.js refresh() 里
   * dc.style.display = on ? block : none）。不写 token+设备，「校园事务」
   * 页就有半页是空的，量出来的「没溢出」不算数。 */
  '    try {',
  '      localStorage.setItem("xxmu_water_token", "shot-token");',
  '      localStorage.setItem("xxmu_water_phone", "13800001234");',
  '      localStorage.setItem("xxmu_water_devs", JSON.stringify([',
  '        {id:"g-7731", name:"\u4e09\u53f7\u697c\u4e00\u5c42", sn:"865403065048324",',
  '         fns:[{id:"sku-cold",name:"\u51b7"},{id:"sku-hot",name:"\u70ed"}]},',
  '        {id:"g-8802", name:"\u56fe\u4e66\u9986\u4e09\u5c42", sn:"865403065048999",',
  '         fns:[{id:"sku-n",name:"\u5e38\u6e29"}]}',
  '      ]));',
  '      localStorage.setItem("xxmu_water_live", JSON.stringify({',
  '        "g-7731:sku-cold": {at: Date.now() - 192000, name:"\u4e09\u53f7\u697c\u4e00\u5c42"}',
  '      }));',
  '    } catch(e){}',
  /* 成绩夹具：四门课，一门空分（第三态绝不当 0 分） */
  '    try {',
  '      var L = [{name:"\u7cfb\u7edf\u89e3\u5256\u5b66", credit:5, score:"87", term:"2026-2027-1"},',
  '               {name:"\u751f\u7406\u5b66", credit:4, score:"78", term:"2026-2027-1"},',
  '               {name:"\u75c5\u7406\u5b66", credit:4, score:"55", term:"2026-2027-1"},',
  '               {name:"\u836f\u7406\u5b66", credit:3, score:"", term:"2026-2027-1"}];',
  '      localStorage.setItem("xxmu_grades", JSON.stringify({list:L, saved_at: Date.now()}));',
  '      localStorage.setItem("xxmu_gpa_target", "3.5");',
  '      localStorage.setItem("xxmu_gpa_remain", "18");',
  '    } catch(e){}',
  '    try { if (typeof MYTODO !== "undefined" && MYTODO.render) MYTODO.render(); } catch(e){}',
  '    try { if (typeof CampusUI !== "undefined" && CampusUI.refresh) CampusUI.refresh(); } catch(e){}',
  '    try { if (typeof NOVA_ORGANS !== "undefined" && NOVA_ORGANS.sync) NOVA_ORGANS.sync(); } catch(e){}',
  '  }',
  '  if (document.readyState === "complete") go(); else window.addEventListener("load", go);',
  '})();',
  '</script>'
].join('\n');

function build(theme, skin) {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  /* 真正的 index.html 会自己起一堆定时器（皮肤动画、30 秒刷新、器官轮询）
   * 和网络请求（抓配置/云端）。headless 的 --virtual-time-budget 遇到
   * setInterval 会把虚拟时间一路推下去永不收敛，实测整轮 ETIMEDOUT。
   * 所以在所有脚本之后先清空定时器并封掉 setInterval / rAF / fetch，
   * 只留一次性的 setTimeout 给探针用。 */
  const quiet = [
    '<script id="ovQuiet">',
    '(function(){',
    '  for (var i = 1; i < 20000; i++) { try { clearTimeout(i); clearInterval(i); } catch(e){} }',
    '  window.setInterval = function(){ return 0; };',
    '  window.requestAnimationFrame = function(){ return 0; };',
    '  try { window.fetch = function(){ return new Promise(function(){}); }; } catch(e){}',
    '  try { if (window.XMLHttpRequest) { XMLHttpRequest.prototype.send = function(){}; } } catch(e){}',
    '})();',
    '</script>'
  ].join('\n');
  const banner = '<script>var THEME=' + JSON.stringify(theme) +
    ',SKIN=' + JSON.stringify(skin) + ';</script>';
  /* 必须落在 web/ 目录里：index.html 引的 css/js 都是相对路径。 */
  const out = path.join(WEB, '_ov-inner.html');
  fs.writeFileSync(out,
    html.replace('</body>',
      quiet + '\n' + banner + '\n' + HIDE + '\n' + SETUP + '\n' + PROBE + '\n</body>'),
    'utf8');
  return out;
}

/* 一次 Edge 启动量完所有档位：每档一个 iframe（宽度不同，高度按档给），
 * 等足够久后统一把各自 contentDocument.title 收进 <pre>。
 * 每个 iframe 内部要顺序切 9 个 tab（每个 200ms 余量）+ 两段专项，实测
 * 单档约 2.6s 虚拟时间，所以这里留 5200ms。 */
function measureAll(innerPath, cases) {
  const wrapper = path.join(WEB, '_ov-wrap.html');
  const src = path.basename(innerPath);
  const frames = cases.map(function (c, i) {
    return '<iframe class="cf" data-i="' + i + '" src="' + src + '" style="width:' +
      c[0] + 'px;height:' + c[1] + 'px"></iframe>';
  }).join('\n');
  const doc = [
    '<!doctype html><html><head><meta charset="utf-8"><title>pending</title>',
    '<style>html,body{margin:0;padding:0;background:#fff}',
    'iframe{border:0;display:block;margin:0}</style>',
    '</head><body>',
    frames,
    '<pre id="out" style="font:12px monospace">pending</pre>',
    '<script>',
    'setTimeout(function(){',
    '  var fs = document.querySelectorAll("iframe.cf"), out = [];',
    '  for (var i = 0; i < fs.length; i++) {',
    '    try { out.push(fs[i].contentDocument.title || "(empty title)"); }',
    '    catch (e) { out.push("ERR " + e.message); }',
    '  }',
    '  document.getElementById("out").textContent = out.join("\\n");',
    '}, 5200);',
    '</script></body></html>'
  ].join('\n');
  fs.writeFileSync(wrapper, doc, 'utf8');

  const url = 'file:///' + wrapper.replace(/\\/g, '/');
  const dom = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--window-size=1100,1000',
    '--virtual-time-budget=9000',
    '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 });

  const m = dom.match(/<pre id="out"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) return [];
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .split('\n').map(function (s) { return s.trim(); });
}

const theme = process.argv[2] || 'light';
const skin = process.argv[3] || 'nova';
const inner = build(theme, skin);

/* 492x700 是 todo.md 里那条「矮视口复查」的原始尺寸，一并跑。 */
const CASES = WIDTHS.map(function (w) { return [w, 900]; }).concat([[492, 700], [360, 640]]);

let bad = 0;
let hinted = 0;
const lines = [];
const results = measureAll(inner, CASES);
CASES.forEach(function (c, i) {
  const w = c[0], h = c[1];
  const line = results[i] || '(missing)';
  lines.push('[' + w + 'x' + h + '] ' + line);

  /* 每个 tab 的 over 都必须为 0；负溢出也必须为 0。
   * hid（被 overflow:hidden 祖先裁掉的）只做提示、不判红 —— 传送带
   * .nv-belt-track 天生比屏幕宽，靠 JS 拖 transform，它就是该被裁的。
   * 真顶出视口的才算 over。
   * seen（参与判断的可见元素数）必须 > 0：某页扫到 0 个元素说明夹具没把
   * 那页渲染出来，那种「0 溢出」是假的，不能放过。 */
  TABS.forEach(function (t) {
    const re = new RegExp('(?:^|\\| )' + t + ':(\\d+)(?:/(\\d+)L)?(?:/(\\d+)H)?#(\\d+)');
    const m = re.exec(line);
    if (!m) { bad++; return; }
    if (Number(m[1]) !== 0) bad++;
    if (m[2] && Number(m[2]) !== 0) bad++;
    if (Number(m[4]) === 0) bad++;
    if (m[3]) hinted += Number(m[3]);
  });

  const sw = /sw=(\d+)/.exec(line);
  const iw = /W=(\d+)/.exec(line);
  const btnW = /btnW=(-?\d+)/.exec(line);
  const vOver = /vOver=(-?\d+)/.exec(line);
  const tW = /tW=(-?\d+)/.exec(line);
  const rW = /rW=(-?\d+)/.exec(line);
  const sover = /sover=(\d+)/.exec(line);

  if (sw && Number(sw[1]) > w) bad++;                   /* 文档不能被撑宽 */
  if (!iw || Number(iw[1]) !== w) bad++;                /* iframe 内部宽度要对 */
  if (!btnW || Number(btnW[1]) < 64) bad++;             /* 复制按钮不能挤没 */
  if (!vOver || Number(vOver[1]) > 1) bad++;            /* 不能被顶出 .tl-top */
  if (!tW || Number(tW[1]) < 28) bad++;                 /* 目标输入框点得到 */
  if (!rW || Number(rW[1]) < 28) bad++;
  if (sover && Number(sover[1]) !== 0) bad++;           /* 面板里也不能溢出 */
});
lines.forEach(function (l) { console.log(l); });

['_ov-inner.html', '_ov-wrap.html'].forEach(function (f) {
  try { fs.unlinkSync(path.join(WEB, f)); } catch (e) {}
});
console.log(bad === 0
  ? 'PASS 六种视口 / 九个 page 均无横向溢出，今日一行按钮与目标绩点输入框都点得到'
  : 'FAIL ' + bad + ' 处');
if (hinted) {
  console.log('  （另有 ' + hinted + ' 个元素被 overflow:hidden 祖先裁掉，' +
    '全是 .nv-belt-track / .nv-clip-chip 这类 JS 拖动的横向带，属设计内、不计入 FAIL）');
}
process.exit(bad === 0 ? 0 : 1);
