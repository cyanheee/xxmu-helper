/* _shot_hwremind.js -- v2.2.0 "deadline sentinel" shots (classic + nova, light + dark).
 *
 *   node design/sketch/_shot_hwremind.js [light|dark] [nova|classic]
 *
 * Two subjects:
 *   1) the #remindCard on the learn page -- two rows now (class / homework)
 *   2) the #sheet settings panel -- the new homework/exam section
 *
 * Reads the REAL web/index.html (relative css/js -> file:// is exactly what the
 * WebView runs). ASCII-only source, same rule as make_nova_real.js.
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

/* Headless Edge will not go narrower than ~492px: --window-size=390 still lays
 * out at 492 and crops the bitmap to 390, silently cutting the right edge off
 * every card. Pin the layout box instead (same trick as _shot_waterlive.js). */
const HIDE = '<style id="hrHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  /* NOVA tape/clip organs clone card content into fixed overlays that cover
   * the real card in a still shot. */
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important}'
  + '</style>';

/* Prefs + real homework data. The data goes in through window.HOMEWORK so that
 * renderHomework() computes __HWITEMS itself -- the reminder card counts from
 * that list, and faking the list directly would let a broken render path look
 * healthy in the picture. */
const SETUP = [
  '  try {',
  '    var H = 3600000, now = Date.now();',
  '    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };',
  '    var iso = function (ms) {',
  '      var d = new Date(ms);',
  '      return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate())',
  '        + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":00";',
  '    };',
  '    localStorage.setItem("xxmu_remind_on", "1");',
  '    localStorage.setItem("xxmu_remind_mins", "15");',
  '    localStorage.setItem("xxmu_remind_mode", "alarm");',
  '    localStorage.setItem("xxmu_remind_hw", "1");',
  '    localStorage.setItem("xxmu_remind_hw_lead", "12");',
  '    localStorage.setItem("xxmu_remind_exam_lead", "6");',
  '    window.HOMEWORK = {',
  '      works: [',
  '        {course:"\u75C5\u7406\u5B66", name:"\u5B9E\u9A8C\u62A5\u544A\uFF1A\u7EC6\u80DE\u663E\u5FAE\u89C2\u5BDF",',
  '         status:"\u5F85\u505A", status_known:true, end:iso(now + 26 * H)},',
  '        {course:"\u7CFB\u7EDF\u89E3\u5256\u5B66", name:"\u7B2C\u4E09\u6B21\u4F5C\u4E1A\uFF1A\u6570\u636E\u7ED3\u6784",',
  '         status:"\u5F85\u505A", status_known:true, end:iso(now + 48 * H)},',
  '        {course:"\u7EC4\u7EC7\u5B66\u4E0E\u80DA\u80CE\u5B66", name:"\u7B2C\u4E8C\u6B21\u4F5C\u4E1A",',
  '         status:"\u5DF2\u5B8C\u6210", status_known:true, end:iso(now - 3 * H)},',
  '      ],',
  '      exams: [',
  '        {course:"\u75C5\u7406\u5B66", name:"\u75C5\u7406\u5B66\u671F\u4E2D\u8003\u8BD5",',
  '         status:"\u672A\u5F00\u8003", status_known:true,',
  '         start:iso(now + 24 * H), end:iso(now + 26 * H)},',
  '      ],',
  '    };',
  '  } catch (e) {}'
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. */
const QUIET = [
  '<script id="hrQuiet">',
  '(function(){',
  '  for (var i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }',
  '  window.setInterval = function(){ return 0; };',
  '  window.requestAnimationFrame = function(){ return 0; };',
  '  window.fetch = function(){ return new Promise(function(){}); };',
  '  try { XMLHttpRequest.prototype.send = function(){}; } catch(e){}',
  '})();',
  '</script>',
].join('\n');

/* DATA / TIMES / curWeek are top-level `let` in app.js: reachable as bare
 * identifiers, NOT as window properties (window.DATA is undefined and the whole
 * fixture silently does nothing). The stock data ships no courses at all, so
 * build them here rather than mutating whatever happens to be there.
 *
 * TIMES is the school-bell string array ('08:00~08:45'): hhmm() only parses
 * 'HH:MM' prefixes, so an object array would make todaySummary declare
 * unknown and the today line would fall back to "第 N 节". */
const WEEK = [
  '  var tw = (typeof weekOf === "function") ? weekOf(new Date()) : 1;',
  '  var td = (new Date().getDay() + 6) % 7 + 1;',
  '  try {',
  '    DATA.courses = [',
  '      {name:"\u7CFB\u7EDF\u89E3\u5256\u5B66", room:"A201", teacher:"\u5F20",',
  '       weeks:[tw], day:td, periods:[1,2]},',
  '      {name:"\u751F\u7406\u5B66", room:"B305", teacher:"\u674E",',
  '       weeks:[tw], day:td, periods:[5,6]},',
  '      {name:"\u75C5\u7406\u5B66", room:"C102", teacher:"\u738B",',
  '       weeks:[tw], day:(td % 7) + 1, periods:[3,4]},',
  '    ];',
  '    TIMES = [];',
  '    for (var p = 1; p <= 16; p++) {',
  '      var m0 = 8 * 60 + (p - 1) * 45;',
  '      TIMES.push(p2(Math.floor(m0 / 60)) + ":" + p2(m0 % 60) + "~"',
  '        + p2(Math.floor((m0 + 45) / 60)) + ":" + p2((m0 + 45) % 60));',
  '    }',
  '    PERIODS = 16;',
  '    curWeek = tw;',
  '    if (typeof renderWeek === "function") renderWeek();',
  '  } catch (e) {}'
].join('\n');

function head() {
  return [
    '    try {',
    '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
    '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
    '      var ap = document.getElementById("app");',
    '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
    '    } catch(e){}',
    SETUP,
    WEEK,
    '    try { if (typeof switchTab === "function") switchTab("learn"); } catch(e){}',
    '    try { if (typeof renderHomework === "function") renderHomework(); } catch(e){}',
    /* The today line is painted by learnplus.js from its own read of DATA,
     * and in the app it is repainted on every renderWeek()/renderHomework()
     * pass. This fixture builds DATA after the page already booted, so ask for
     * an explicit repaint instead of trusting boot order. Without it the line
     * keeps the "no class today" verdict it computed against empty data. */
    '    try { if (typeof LEARNPLUS !== "undefined" && LEARNPLUS.paintToday) LEARNPLUS.paintToday(); } catch(e){}',
    '    try { if (typeof REMINDER !== "undefined" && REMINDER.refresh) REMINDER.refresh(); } catch(e){}',
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
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(go, 60); });',
    '  else setTimeout(go, 60);',
    '})();',
    '</script>',
  ].join('\n');
}

/* ---- shot 1: the #remindCard on the learn page ---- */
const CARD = wrap('hrCardJs', [
  /* scroll main so the remind card sits a bit below the top: the card above it
   * (deadline matrix / today line) gives the shot context, and starting halfway
   * down a card looks like a rendering bug. */
  '    setTimeout(function(){',
  '      try {',
  '        var c = document.getElementById("remindCard");',
  '        var m = document.querySelector("main");',
  '        if (c && m) m.scrollTop = Math.max(0, c.offsetTop - 300);',
  '      } catch(e){}',
  '    }, 120);',
].join('\n'));

/* ---- shot 2: the settings sheet with the homework section ---- */
const SHEET = [
  '<style id="hrSheetCss">',
  '#sheet{position:fixed!important;left:0!important;top:0!important;',
  '  width:390px!important;height:1240px!important;max-height:1240px!important;',
  '  display:flex!important;border-radius:0!important;margin:0!important;}',
  '#sheet .sh-box{max-height:1240px!important;}',
  '</style>',
  wrap('hrSheetJs', [
    '    try { if (typeof REMINDER !== "undefined") REMINDER.openSettings(); } catch(e){}',
  ].join('\n')),
].join('\n');

function build(tag, extra) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  h = h.replace('</head>', HIDE + '\n</head>');
  h = h.replace('</body>', extra + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_hr_' + tag + '-' + skin + '-' + theme + '.html');
  fs.writeFileSync(p, h, 'utf8');
  return p;
}

function shoot(html, name, w, h) {
  const out = path.join(OUT, name);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=' + w + ',' + h,
    '--virtual-time-budget=2000',
    '--screenshot=' + out,
    'file:///' + html.replace(/\\/g, '/'),
  ], { timeout: 120000, stdio: 'ignore' });
  const st = fs.statSync(out);
  console.log('  ' + name + '  ' + st.size + ' B');
  return out;
}

const a = build('card', CARD);
shoot(a, 'v220-remind-' + skin + '-' + theme + '.png', 390, 900);
fs.unlinkSync(a);

const b = build('sheet', SHEET);
shoot(b, 'v220-remindset-' + skin + '-' + theme + '.png', 390, 1240);
fs.unlinkSync(b);

console.log('done ' + skin + ' ' + theme);
