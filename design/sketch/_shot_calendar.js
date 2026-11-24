/* _shot_calendar.js -- v2.13.0 "export to calendar" panel shots (classic + nova).
 *
 *   node design/sketch/_shot_calendar.js [light|dark] [nova|classic]
 *
 * Subject: the half-sheet opened from Settings -> 数据与更新 -> 导出到手机日历.
 * It shows how many classes / how many deadlines the file will contain, the two
 * buttons, and the two honest notes (floating time, skipped rows).
 *
 * Notes on why this fixture looks the way it does:
 *   1. There is no Host in headless Edge, so web/ics.js reads localStorage through
 *      web/sync.js pref() exactly like on a phone without the bridge. Seeding
 *      localStorage is therefore seeding the real read path -- nothing stubbed.
 *   2. DATA / TIMES / START are top-level `let` in web/app.js, NOT window props.
 *      We assign them by name after the app scripts have run (same trick
 *      _shot_nowline.js uses). window.DATA would be undefined and the panel
 *      would honestly say "no schedule to export".
 *   3. The panel is opened by calling ICS.openPanel(), not by clicking
 *      #rowCalendar: a shot that only proves a click works would hide a broken
 *      panel.
 *
 * Reads the REAL web/index.html. ASCII-only source, same rule as the others.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(__dirname, 'shots');
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

const theme = process.argv[2] === 'dark' ? 'dark' : 'light';
const skin = process.argv[3] === 'classic' ? 'classic' : 'nova';

/* Headless Edge lays out at ~492px regardless of --window-size and crops the
 * bitmap: pin the layout box (same trick as _shot_export.js). */
const HIDE = '<style id="calHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  /* #sheet lives INSIDE #app, so hiding #app would take the panel with it.
   * Hide #app's other children and let #app collapse to zero height. */
  + '#app{height:auto!important;min-height:0!important;overflow:visible!important;'
  + 'padding:0!important;margin:0!important;border:none!important;background:transparent!important}'
  + '#app > *:not(#sheet){display:none!important}'
  + '#sheet{position:static!important;inset:auto!important;'
  + 'display:block!important;background:transparent!important;backdrop-filter:none!important;'
  + 'align-items:stretch!important;width:390px!important;z-index:auto!important;'
  + 'margin:10px 0 0!important}'
  + '#sheet .sh-box{max-height:none!important;height:auto!important;width:390px!important;'
  + 'box-shadow:none!important;border:none!important;border-radius:0!important}'
  + 'body{background:var(--bg)!important;padding-bottom:24px!important}'
  + '</style>';

/* Real data on a plausible phone. 75-course semesters are the real thing, but
 * for a figure 8 courses across a week is what a reader can actually take in.
 * xxmu_cx_homework is the shape web/chaoxing.js writes (works[] with end_ts in
 * seconds + status words, exams[] with end). */
const SEED = [
  '<script id="calSeed">',
  '(function(){',
  '  var p2 = function(n){ return (n < 10 ? "0" : "") + n; };',
  '  var iso = function(d){ return d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate()); };',
  '  var now = new Date();',
  '  var nowSec = Math.floor(now.getTime() / 1000);',
  '  try {',
  '    localStorage.setItem("xxmu_start", iso(new Date(now.getFullYear(), 7, 31)));',
  '    localStorage.setItem("xxmu_weeks", "21");',
  '    localStorage.setItem("xxmu_skin", ' + JSON.stringify(skin) + ');',
  '    localStorage.setItem("xxmu_theme", ' + JSON.stringify(theme) + ');',
  '    localStorage.setItem("xxmu_cx_homework", JSON.stringify({',
  '      source: "chaoxing", synced_at: nowSec,',
  '      works: [',
  '        {course: "\u75C5\u7406\u5B66", name: "\u75C5\u7406\u5B9E\u9A8C\u62A5\u544A",',
  '         status: "\u5F85\u505A", end_ts: nowSec + 26*3600, end: ""},',
  '        {course: "\u836F\u7406\u5B66", name: "\u7B2C\u4E09\u7AE0\u4F5C\u4E1A",',
  '         status: "\u5F85\u505A", end_ts: nowSec + 96*3600, end: ""},',
  '        {course: "\u7CFB\u7EDF\u89E3\u5256\u5B66", name: "\u5DF2\u4EA4\u7684\u4F5C\u4E1A",',
  '         status: "\u5DF2\u5B8C\u6210", end_ts: nowSec + 200*3600, end: ""},',
  '      ],',
  '      exams: [',
  '        {course: "\u5927\u5B66\u751F\u5B89\u5168\u6559\u80B2", name: "\u671F\u4E2D\u6D4B\u8BD5",',
  '         status: "\u672A\u5F00\u8003", end_ts: 0, end: "", upcoming: true},',
  '      ],',
  '    }));',
  '  } catch (e) {}',
  '})();',
  '</script>',
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. */
const QUIET = [
  '<script id="calQuiet">',
  '(function(){',
  '  for (var i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }',
  '  window.setInterval = function(){ return 0; };',
  '  window.requestAnimationFrame = function(){ return 0; };',
  '  window.fetch = function(){ return new Promise(function(){}); };',
  '  try { XMLHttpRequest.prototype.send = function(){}; } catch(e){}',
  '})();',
  '</script>',
].join('\n');

/* Eight courses spread over the week, weeks 10-15 (a solid 6-week run so the
 * RRULE merge is visible in the event count: 8 courses -> 8 events, not 48). */
function head() {
  return [
    '    try {',
    '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
    '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
    '      var ap = document.getElementById("app");',
    '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
    '    } catch(e){}',
    '    try { if (typeof switchTab === "function") switchTab("settings"); } catch(e){}',
    /* Top-level let in app.js: assign by name, never via window. */
    '    try {',
    '      var W = [10,11,12,13,14,15];',
    '      DATA = { courses: [',
    '        {name:"\u7CFB\u7EDF\u89E3\u5256\u5B66", teacher:"\u5E9E\u76FC\u5A07", room:"3301", day:1, weeks:W, periods:[1,2]},',
    '        {name:"\u751F\u7406\u5B66", teacher:"\u5218\u5EFA\u5E73", room:"A201", day:1, weeks:W, periods:[5,6]},',
    '        {name:"\u75C5\u7406\u5B66", teacher:"\u738B\u4E3D", room:"C102", day:2, weeks:W, periods:[3,4]},',
    '        {name:"\u836F\u7406\u5B66", teacher:"\u674E\u5A1C", room:"B305", day:3, weeks:W, periods:[1,2]},',
    '        {name:"\u533B\u5B66\u514D\u75AB\u5B66", teacher:"\u8D75\u5F3A", room:"3401", day:3, weeks:W, periods:[7,8]},',
    '        {name:"\u5C40\u90E8\u89E3\u5256\u5B66", teacher:"\u9648\u6653", room:"2410", day:4, weeks:W, periods:[3,4]},',
    '        {name:"\u533B\u5B66\u4F26\u7406\u5B66", teacher:"\u5B59\u8309", room:"1801", day:5, weeks:W, periods:[1,2]},',
    '        {name:"\u5E94\u7528\u5FC3\u7406\u5B66", teacher:"\u5468\u96EA", room:"A201", day:5, weeks:W, periods:[5,6]},',
    '      ] };',
    '      TIMES = [',
    '        "08:00~08:40","08:40~09:20","09:30~10:10","10:20~11:00",',
    '        "11:10~11:50","11:50~12:30","14:00~14:40","14:40~15:20",',
    '        "15:30~16:10","16:20~17:00","17:10~17:50","17:50~18:30",',
    '        "19:00~19:40","19:40~20:20","20:30~21:10","21:10~21:50"',
    '      ];',
    '      PERIODS = 16;',
    '      START = new Date(new Date().getFullYear(), 7, 31);',
    '      curWeek = 11;',
    '    } catch(e){}',
    /* Open the panel through its real entry point. If openPanel() ever fails,
     * the shot comes out empty instead of showing a convincing fake. */
    '    try { if (typeof ICS !== "undefined" && ICS.openPanel) ICS.openPanel(); } catch(e){}',
    '    try { if (typeof NOVA_ORGANS !== "undefined") NOVA_ORGANS.sync(); } catch(e){}',
  ].join('\n');
}

function wrap(id, extra) {
  return [
    '<script id="' + id + '">',
    '(function(){',
    '  function go(){',
    head(),
    extra,
    '  }',
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(go, 80); });',
    '  else setTimeout(go, 80);',
    '})();',
    '</script>',
  ].join('\n');
}

const BODY = wrap('calBodyJs', [
  '    setTimeout(function(){',
  '      try {',
  '        var box = document.querySelector("#sheet .sh-box");',
  '        if (box) box.scrollTop = 0;',
  /* Report the panel's real bottom edge so the caller can shoot exactly that
   * tall. Also report a few readings so the console proves the panel is real. */
  '        var h = Math.ceil((box ? box.getBoundingClientRect().bottom : 0) + 20);',
  '        document.documentElement.setAttribute("data-shot-h", String(h));',
  '        var sum = document.querySelector("#sheet .ex-sum");',
  '        document.documentElement.setAttribute("data-shot-info",',
  '          "sum=" + (sum ? sum.textContent : "?") + " name="',
  '          + (document.getElementById("sh-name") || {}).textContent);',
  '      } catch(e){}',
  '    }, 260);',
].join('\n'));

function build(tag, extra) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  /* SEED must run before the app scripts read localStorage, so it goes in
   * </head> (after the inline theme bootstrap, before <body>). */
  h = h.replace('</head>', HIDE + '\n' + SEED + '\n</head>');
  h = h.replace('</body>', extra + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_cal_' + tag + '-' + skin + '-' + theme + '.html');
  fs.writeFileSync(p, h, 'utf8');
  return p;
}

function shoot(html, name, w, h) {
  const out = path.join(OUT, name);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=' + w + ',' + h,
    '--virtual-time-budget=2200',
    '--screenshot=' + out,
    'file:///' + html.replace(/\\/g, '/'),
  ], { timeout: 120000, stdio: 'ignore' });
  const st = fs.statSync(out);
  console.log('  ' + name + '  ' + st.size + ' B');
  return out;
}

function measure(html) {
  const dom = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=390,1200',
    '--virtual-time-budget=2200', '--dump-dom',
    'file:///' + html.replace(/\\/g, '/'),
  ], { timeout: 120000, encoding: 'utf8' });
  const m = /data-shot-h="(\d+)"/.exec(dom);
  const info = /data-shot-info="([^"]*)"/.exec(dom);
  console.log('  info:', info ? info[1] : '(none)');
  return m ? Math.max(320, Math.min(1400, Number(m[1]))) : 900;
}

const a = build('panel', BODY);
const H = measure(a);
shoot(a, 'v213-calendar-' + skin + '-' + theme + '.png', 390, H);
fs.unlinkSync(a);

console.log('done ' + skin + ' ' + theme);
