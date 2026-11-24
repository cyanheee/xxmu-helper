/* _shot_nowline.js -- v2.3.0 "now line" shots (classic + nova, light + dark).
 *
 *   node design/sketch/_shot_nowline.js [light|dark] [nova|classic]
 *
 * Subject: the #nowLine strip at the top of the schedule page -- what class is
 * running, how long is left, and which rooms are free this period.
 *
 * Two things make this fixture different from the earlier ones:
 *   1. The clock is FROZEN at 09:50 (period 3 of the generated bell table), so
 *      the picture is the same whenever it runs. Without it the shot would say
 *      "today's classes are over" at 11pm and look like a bug.
 *   2. Free rooms do not come from DOM injection: NOWLINE reads
 *      FREE.state().rooms, so the fixture hands FREE a room matrix in the
 *      shape parseMatrix() produces ({ room, type, seats, g, bang }) and lets
 *      the real code decide who is free.
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
const HIDE = '<style id="nlHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important}'
  + '</style>';

/* Freeze the wall clock at 09:50 today. Date is replaced BEFORE the app scripts
 * run (this block goes into </head>), so weekOf()/weekOf(today) stay consistent
 * with the frozen hour and the fixture is reproducible.
 *
 * class extends RealDate is the shape that works: a plain function wrapper
 * swallows the arguments of new Date('2026-11-22 12:33:00') and every dueMs
 * silently becomes "now" (that bug already burned test_hwremind.js once). */
const CLOCK = [
  '<script id="nlClock">',
  '(function(){',
  '  var R = window.Date;',
  '  var F = new R();',
  '  F.setHours(9, 50, 0, 0);',
  '  var T = F.getTime();',
  /* The spread form is the only safe one: passing (y,m,d,undefined,undefined,
   * undefined,undefined) -- the "spread into seven fixed slots" variant -- makes
   * new Date(2026,10,16) an Invalid Date, and mondayOf() then prints
   * "NaN/NaN - NaN/NaN" in the week strip. Same family of bug as the FakeDate
   * that swallowed its argument in test_hwremind.js. */
  '  class FakeDate extends R {',
  '    constructor() {',
  '      var a = arguments;',
  '      if (a.length === 0) { super(T); } else { super(...a); }',
  '    }',
  '    static now() { return T; }',
  '  }',
  '  window.Date = FakeDate;',
  '})();',
  '</script>',
].join('\n');

/* Courses + bell table. DATA / TIMES / curWeek / PERIODS are top-level `let` in
 * app.js: reachable as bare identifiers, NOT as window properties (window.DATA
 * is undefined and the whole fixture silently does nothing).
 *
 * TIMES is the school-bell string array ('08:00~08:45'): parseSeg() only reads
 * the 'HH:MM ~ HH:MM' shape, so an object array would make nowInfo declare
 * unknown and the strip would fall back to "the timetable is not synced". */
const WEEK = [
  '  var p2 = function(n){ return (n < 10 ? "0" : "") + n; };',
  '  var tw = (typeof weekOf === "function") ? weekOf(new Date()) : 1;',
  '  var td = (new Date().getDay() + 6) % 7 + 1;',
  '  try {',
  '    DATA.courses = [',
  /* Period 3 is the running one at the frozen 09:50 (09:30~10:15). */
  '      {name:"\u7CFB\u7EDF\u89E3\u5256\u5B66", room:"A201", teacher:"\u5F20",',
  '       weeks:[tw], day:td, periods:[3]},',
  '      {name:"\u751F\u7406\u5B66", room:"B305", teacher:"\u674E",',
  '       weeks:[tw], day:td, periods:[7,8]},',
  '      {name:"\u75C5\u7406\u5B66", room:"C102", teacher:"\u738B",',
  '       weeks:[tw], day:(td % 7) + 1, periods:[1,2]},',
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

/* Free-room matrix in parseMatrix() shape. Field name is room, not name -- the
 * fixture uses the real one so that a field-name mistake cannot hide here (it
 * did hide once: roomNow read r.name while free.js writes r.room).
 * g['3'] = period 3, [0]=Mon .. [6]=Sun. true = occupied (red cell). */
const ROOMS = [
  '  try {',
  '    if (typeof KFREE !== "undefined" && KFREE.state) {',
  '      var st = KFREE.state();',
  '      var td2 = (new Date().getDay() + 6) % 7;   /* 0 = Mon .. 6 = Sun */',
  /* busy(every, todayFree): all seven days occupied except the one we stand on.
   * Building the row from td2 keeps the picture correct on any weekday. */
  '      var row = function (freeToday) {',
  '        var r = [1, 1, 1, 1, 1, 1, 1];',
  '        if (freeToday) r[td2] = 0;',
  '        return r;',
  '      };',
  '      var mk = function (room, seats, freeToday) {',
  '        return { room: room, type: "\u666E\u901A", seats: seats,',
  '                 g: { "3": row(freeToday), "7": row(true), "8": row(true) }, bang: null };',
  '      };',
  '      st.rooms = [',
  '        mk("3401", 180, true),',
  '        mk("3301", 120, true),',
  '        mk("3201", 90,  false),',
  '        mk("3105", 60,  false),',
  '        mk("2410", 240, false),',
  '      ];',
  '      st.at = Date.now(); st.key = "shot";',
  '    }',
  '  } catch (e) {}'
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. */
const QUIET = [
  '<script id="nlQuiet">',
  '(function(){',
  '  for (var i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }',
  '  window.setInterval = function(){ return 0; };',
  '  window.requestAnimationFrame = function(){ return 0; };',
  '  window.fetch = function(){ return new Promise(function(){}); };',
  '  try { XMLHttpRequest.prototype.send = function(){}; } catch(e){}',
  '})();',
  '</script>',
].join('\n');

function head() {
  return [
    '    try {',
    '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
    '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
    '      var ap = document.getElementById("app");',
    '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
    '    } catch(e){}',
    WEEK,
    ROOMS,
    '    try { if (typeof switchTab === "function") switchTab("kb"); } catch(e){}',
    /* The strip has no idea the fixture just replaced DATA/TIMES after boot:
     * ask for an explicit repaint instead of trusting boot order. */
    '    try { if (typeof NOWLINE !== "undefined" && NOWLINE.paint) NOWLINE.paint(); } catch(e){}',
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

const BODY = wrap('nlBodyJs', [
  '    setTimeout(function(){',
  '      try {',
  '        var m = document.querySelector("main");',
  '        if (m) m.scrollTop = 0;',
  '      } catch(e){}',
  '    }, 120);',
].join('\n'));

function build(tag, extra) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  h = h.replace('</head>', HIDE + '\n' + CLOCK + '\n</head>');
  h = h.replace('</body>', extra + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_nl_' + tag + '-' + skin + '-' + theme + '.html');
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

const a = build('top', BODY);
shoot(a, 'v230-now-' + skin + '-' + theme + '.png', 390, 900);
fs.unlinkSync(a);

console.log('done ' + skin + ' ' + theme);
