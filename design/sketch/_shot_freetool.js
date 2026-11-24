/* _shot_freetool.js -- shots of the "free classrooms" panel (KFREE.open).
 *
 *   node design/sketch/_shot_freetool.js [light|dark] [nova|classic]
 *
 * Reads the REAL web/index.html and drives the REAL KFREE.open() path:
 *   open() -> paint() skeleton -> ensureCampuses() -> ensureBuilds()
 *          -> loadMatrix(false) -> post() -> XXMU.netCk -> parseMatrix -> paint()
 *
 * Only two things are stubbed:
 *   1. Host  -- a localStorage-backed {getPref,setPref,toast}. free.js:47
 *               hasHost() is `typeof Host !== 'undefined' && Host`, and its
 *               drop()/post() bail out to "not in the app" without it. Without
 *               this stub the panel photographs as one line of grey text.
 *   2. XXMU.netCk -- returns "<code>|<body>" like Java does. The matrix body is
 *               ASCII ONLY on purpose: free.js:post() pipes the response
 *               through XXMU.splitResp then toGbk() (a GBK decode), and the
 *               browser has no GBK encoder. Pure ASCII survives either codec
 *               unchanged, and parseMatrix only looks at room name / type /
 *               seats / red-cell flags, so nothing real is being faked.
 *
 * Everything else -- chips, week bar, pick(), room cards, freeList() run
 * compression -- is the shipping code.
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

/* Panel-only framing, same rules as _shot_toolcards.js: #sheet lives inside
 * #app, so #app cannot be hidden -- only its other children. */
const HIDE = '<style id="ftHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{height:auto!important;min-height:0!important;overflow:visible!important;'
  + 'padding:0!important;margin:0!important;border:none!important;background:transparent!important}'
  + '#app > *:not(#sheet){display:none!important}'
  + '#sheet{position:static!important;inset:auto!important;'
  + 'display:block!important;background:transparent!important;backdrop-filter:none!important;'
  + 'align-items:stretch!important;width:390px!important;z-index:auto!important;'
  + 'margin:8px 0 0!important}'
  + '#sheet .sh-box{max-height:none!important;height:auto!important;width:390px!important;'
  + 'box-shadow:none!important;border:none!important;border-radius:0!important}'
  + 'body{background:var(--bg)!important;padding-bottom:20px!important}'
  + '</style>';

/* ---------------------------------------------------------------- matrix ---
 * One <tr id=zc_N class=O> block per room. The first row of a block carries 12
 * tds (name/type/seats/weeks with rowspan, then the period label, then 7 day
 * cells); every following row carries 8. free.js:parseMatrix keys off exactly
 * those two shapes, so the fixture has to honour them.
 *
 * Occupancy: deterministic, seeded by room index and period so the picture is
 * identical on every run (a random grid would make two shots of the same
 * version disagree and look like a regression).
 */
/* Room names and types are GBK bytes, written out as hex.
 *
 * Why not just type the Chinese: free.js:post() hands the response through
 * toGbk(), and the browser has no GBK *encoder* -- so the fixture cannot emit
 * a Chinese string and have it survive that decode. What it CAN do is emit the
 * bytes the real 教务 page would send, one char per byte, which is exactly the
 * shape bytesOf() expects (`charCodeAt(i) & 0xff`). Building the fixture from
 * hex makes the shot exercise the real decode path instead of bypassing it,
 * and keeps this file pure ASCII so it survives any codepage.
 *
 * Hex was taken from the GBK table (codepage 936):
 *   多媒体 B6E0C3BDCCE5   普通教室 C6D5CDA8BDCCCAD2
 *   研讨室 D1D0CCT6CAD2   实验室   CAB5D1E9CAD2
 *   阶梯教室 BDD7CCDDBDCCCAD2
 */
function gbk(hex) {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) {
    s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return s;
}

const T_MULTI = gbk('B6E0C3BDCCE5');
const T_PLAIN = gbk('C6D5CDA8BDCCCAD2');
const T_SEMIN = gbk('D1D0CCD6CAD2');
const T_LAB = gbk('CAB5D1E9CAD2');
const T_STAIR = gbk('BDD7CCDDBDCCCAD2');

const ROOMS = [
  ['A201', T_MULTI, 60], ['A203', T_MULTI, 60],
  ['A205', T_STAIR, 120], ['A207', T_STAIR, 120],
  ['A301', T_SEMIN, 40], ['A303', T_SEMIN, 40],
  ['B101', T_LAB, 48], ['B103', T_LAB, 48],
  ['B201', T_STAIR, 200], ['B203', T_STAIR, 200],
  ['B301', T_PLAIN, 90], ['B303', T_PLAIN, 90],
];
const PERIODS = 14;

/* "Today" as the教务 grid counts it: Monday=1 .. Sunday=7. Computed here, in
 * node, because the fixture must be reproducible: whatever day the shot runs
 * on, the grid is built so the *current* day looks the way the panel is
 * supposed to look (a couple of rooms busy, most of them free, two rooms with
 * no timetable at all so the "教务没给这周的排课" hint also appears).
 * An occupancy pattern that ignored the calendar was the first version's
 * mistake: on any given day roughly 40% of cells were red, so over a full-day
 * window essentially every room came out blocked and the shot showed
 * "这个时段这栋楼没有全空的教室" instead of room cards.
 *
 * 14 periods, not 9: free.js:segs() clamps to `PERIODS` (the app-wide var,
 * default 14 when no timetable has synced) and the panel's default segment is
 * picked from the clock -- after 18:00 that is "晚上 11-14", which has no data
 * at all in a 9-period grid, so every room came back "unknown" and the shot
 * showed 空 0 / 12 间 with nothing in it. */
const TODAY = (new Date().getDay() + 6) % 7 + 1;

/* Room index -> the periods it is busy on TODAY. An empty array means "free
 * all day". Rooms 0/1/6 are busy for a couple of periods (still free in most
 * windows), rooms 3 and 9 are busy all day (the blocked path), rooms 10 and 11
 * only publish periods 1-2 (the unknown path). */
function busyToday(ri) {
  if (ri === 10 || ri === 11) return null;          // publishes almost nothing
  if (ri === 3 || ri === 9) return allPeriods();
  if (ri === 0) return [1, 2, 3, 4, 11];
  if (ri === 1) return [5, 6, 7, 12];
  if (ri === 6) return [9, 13, 14];
  return [];
}

function allPeriods() {
  const a = [];
  for (let p = 1; p <= PERIODS; p++) a.push(p);
  return a;
}

/* For every OTHER day the grid just needs plausible red cells; the panel is
 * photographed on today's column only, but a grid that is blank everywhere
 * else would look like broken data if anyone re-shot on a different day. */
function occupied(ri, p, day, busy) {
  if (day === TODAY) {
    if (!busy) return false;                        // handled by sparse rows
    return busy.indexOf(p) >= 0;
  }
  return ((ri * 7 + p * 3 + day) % 5) < 2;
}

function matrixHtml() {
  const rows = [];
  ROOMS.forEach(function (r, ri) {
    const name = r[0], type = r[1], seats = r[2];
    const busy = busyToday(ri);
    /* Rooms 10/11 are the "this week's timetable is missing" case. They must
     * publish periods the CURRENT SEGMENT does not cover at all -- unknownAt()
     * is `!seg.ps.some(p => room.g[p])`, so a room that publishes periods 1-2
     * still counts as known in a morning window and gets sorted into "free".
     * Publishing only 11-14 puts them out of reach of 上午 1-6 / 下午 7-10 and
     * produces the hint line "另有 2 间教务没给这周的排课，没算进「空」". */
    const pubFrom = busy === null ? 11 : 1;
    const pubTo = busy === null ? PERIODS : PERIODS;
    const span = pubTo - pubFrom + 1;
    for (let p = pubFrom; p <= pubTo; p++) {
      const cells = [];
      for (let d = 1; d <= 7; d++) {
        const on = occupied(ri, p, d, busy);
        cells.push('<td' + (on ? ' style="background-color:red"' : '')
          + '>&ensp;</td>');
      }
      if (p === pubFrom) {
        rows.push('<tr id=zc_' + ri + ' class=O>'
          + '<td rowspan=' + (span + 1) + '>' + name + '</td>'
          + '<td rowspan=' + (span + 1) + '>' + type + '</td>'
          + '<td rowspan=' + (span + 1) + '>' + seats + '</td>'
          + '<td rowspan=' + (span + 1) + '>1-20</td>'
          + '<td>' + p + '</td>' + cells.join('') + '</tr>');
      } else {
        rows.push('<tr><td>' + p + '</td>' + cells.join('') + '</tr>');
      }
    }
    /* The 傍晚 row sits between period 11 and 12 on the real page; parseMatrix
     * stores it separately as `bang`. Included so the code that reads it runs. */
    const bang = [];
    for (let d = 1; d <= 7; d++) bang.push('<td>&ensp;</td>');
    rows.push('<tr><td>傍晚</td>' + bang.join('') + '</tr>');
  });
  return '<table id=kbTable>' + rows.join('') + '</table>';
}

/* Everyone in this fixture has already picked a campus and a building, and the
 * droplist cache is warm -- that is the state a returning user is in. Going
 * through the cache also avoids stubbing drop(), so ensureCampuses() /
 * ensureBuilds() / applyDefault() all run for real. */
const SEED = [
  '<script id="ftSeed">',
  '(function(){',
  '  var store = {};',
  '  var p2 = function(n){ return (n<10?"0":"")+n; };',
  '  var now = new Date();',
  '  var at = now.getTime();',
  '  window.Host = {',
  '    getPref: function(k){ return store[k] === undefined ? "" : store[k]; },',
  '    setPref: function(k,v){ store[k] = String(v); },',
  '    toast: function(m){ console.log("[toast]", m); },',
  '    clip: function(){ return ""; }',
  '  };',
  '  store["xxmu_kfree_campus"] = "01";',
  '  store["xxmu_kfree_build"]  = "A";',
  '  store["xxmu_kfree_list"] = JSON.stringify({',
  '    at: at,',
  '    campuses: [ {code:"01", name:"\u4E3B\u6821\u533A"}, {code:"02", name:"\u65B0\u6821\u533A"} ],',
  '    b_01: [ {code:"A", name:"\u0031\u0031-\u6559\u5B66\u697C A"},',
  '            {code:"B", name:"\u0031\u0032-\u6559\u5B66\u697C B"} ]',
  '  });',
  '  store["xxmu_skin"] = ' + JSON.stringify(skin) + ';',
  '  store["xxmu_theme"] = ' + JSON.stringify(theme) + ';',
  '  window.__ftMatrix = ' + JSON.stringify(matrixHtml()) + ';',
  '})();',
  '</script>',
].join('\n');

/* No timers are left armed by KFREE itself, but the rest of the app (skin
 * animations, the 30s sync tick) starts plenty; without this the headless
 * virtual-time budget never converges. */
const QUIET = [
  '<script id="ftQuiet">',
  '(function(){',
  '  for (var i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }',
  '  window.setInterval = function(){ return 0; };',
  '  window.requestAnimationFrame = function(){ return 0; };',
  '  window.fetch = function(){ return new Promise(function(){}); };',
  '  try { XMLHttpRequest.prototype.send = function(){}; } catch(e){}',
  '})();',
  '</script>',
].join('\n');

const BODY = [
  '<script id="ftBodyJs">',
  '(function(){',
  '  function go(){',
  '    try {',
  '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
  '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
  '      var ap = document.getElementById("app");',
  '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
  '    } catch(e){}',
  /* Real entry point. If KFREE.open ever stops setting #sh-name or stops
   * painting the week bar, the shot goes blank instead of showing a
   * convincing fake. */
  /* The netCk stub has to be installed HERE, not in SEED: SEED is injected
   * before </head>, which is before sync.js has defined window.XXMU -- an
   * `if (window.XXMU)` guard there is simply false and the stub never lands.
   * (First run of this file did exactly that and photographed "network
   * timeout" with an empty room list.) */
  '    try {',
  '      if (typeof XXMU !== "undefined" && XXMU.netCk) {',
  '        var _orig = XXMU.netCk;',
  '        XXMU.netCk = function(url){',
  '          if (String(url).indexOf("dykb") >= 0) {',
  '            return Promise.resolve("200|" + window.__ftMatrix);',
  '          }',
  '          return _orig.apply(XXMU, arguments);',
  '        };',
  '      }',
  '    } catch(e){}',
  '    try { if (typeof KFREE !== "undefined" && KFREE.state) KFREE.state().seg = 0; } catch(e){}',
  '    try { if (typeof KFREE !== "undefined" && KFREE.open) KFREE.open(); } catch(e){}',
  '    setTimeout(function(){',
  '      try {',
  '        var box = document.querySelector("#sheet .sh-box");',
  '        if (box) box.scrollTop = 0;',
  '        var h = Math.ceil((box ? box.getBoundingClientRect().bottom : 0) + 20);',
  '        document.documentElement.setAttribute("data-shot-h", String(h));',
  '        var st = (typeof KFREE !== "undefined" && KFREE.state) ? KFREE.state() : null;',
  '        document.documentElement.setAttribute("data-shot-info",',
  '          "rooms=" + ((st && st.rooms) ? st.rooms.length : -1)',
  '          + " cards=" + document.querySelectorAll("#sh-body .room-card").length',
  '          + " chips=" + document.querySelectorAll("#sh-body .chips").length',
  '          + " name=" + ((document.getElementById("sh-name") || {}).textContent || "")',
  '          + " err=" + ((st && st.err) || ""));',
  '      } catch(e){}',
  '    }, 420);',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(go, 80); });',
  '  else setTimeout(go, 80);',
  '})();',
  '</script>',
].join('\n');

function build() {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  /* SEED before </head> so the pref store exists before free.js reads it. */
  h = h.replace('</head>', HIDE + '\n' + SEED + '\n</head>');
  h = h.replace('</body>', BODY + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_ft-' + skin + '-' + theme + '.html');
  fs.writeFileSync(p, h, 'utf8');
  return p;
}

function edge(args, timeout) {
  return execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ].concat(args), { timeout: timeout || 120000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function measure(html) {
  const dom = edge(['--window-size=390,1400', '--virtual-time-budget=2600',
    '--dump-dom', 'file:///' + html.replace(/\\/g, '/')]);
  const m = /data-shot-h="(\d+)"/.exec(dom);
  const i = /data-shot-info="([^"]*)"/.exec(dom);
  if (i) console.log('  info: ' + i[1]);
  /* The panel carries 8 chip rows + up to 12 room cards; 2000 is the ceiling
   * before something is silently cropped. */
  return m ? Math.max(320, Math.min(2000, Number(m[1]))) : 900;
}

const a = build();
const H = measure(a);
const out = path.join(OUT, 'uix-tool-free-' + skin + '-' + theme + '.png');
edge(['--window-size=390,' + H, '--virtual-time-budget=2600',
  '--screenshot=' + out, 'file:///' + a.replace(/\\/g, '/')]);
console.log('  uix-tool-free-' + skin + '-' + theme + '.png  ' + fs.statSync(out).size + ' B');
fs.unlinkSync(a);
console.log('done ' + skin + ' ' + theme + ' free');
