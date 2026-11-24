/* _shot_gaps.js -- v2.15.0 "no one reads it" fix shots.
 *
 *   node design/sketch/_shot_gaps.js [focus|focuserr|diag] [light|dark] [nova|classic]
 *
 * Three subjects:
 *   focus    -- focus card with the peak-of-log high-light day line wired (v2.15.0)
 *   focuserr -- focus card when localStorage is corrupted, showing the inline
 *               LAST_ERR message (v2.15.0; before this it was a silent 0)
 *   diag     -- About.diagText() output rendered visible, with the new
 *               "auto refresh" log lines (v2.15.0; before this missing).
 *
 * Reads the REAL web/index.html so the relative css/js is exactly what the
 * WebView loads. Source is ASCII-only (the Chinese text comes from the app's
 * own diagText(), not from this fixture).
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

const kind = ['focus', 'focuserr', 'diag'].indexOf(process.argv[2]) >= 0 ? process.argv[2] : 'focus';
const theme = process.argv[3] === 'dark' ? 'dark' : 'light';
const skin = process.argv[4] === 'classic' ? 'classic' : 'nova';

const HIDE = '<style id="gpHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important}'
  + '#sheet{width:390px!important;max-width:390px!important}'
  + '</style>';

/* Focus log seed: uneven values, peak = 90 on a known day so the new
 * "longest day" line has something real to say. */
const FOCUS_SEED = [
  '  try {',
  '    var span = [45, 25, 60, 0, 30, 75, 50, 20, 0, 40, 90, 35, 55, 70];',
  '    var log = {};',
  '    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };',
  '    for (var i = 0; i < span.length; i++) {',
  '      var d = new Date(); d.setHours(12, 0, 0, 0);',
  '      d.setDate(d.getDate() - (span.length - 1 - i));',
  '      var key = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());',
  '      if (span[i] > 0) log[key] = span[i];',
  '    }',
  '    localStorage.setItem("xxmu_focus", JSON.stringify({',
  '      settings: { mode: "pomo", focusMin: 25, restMin: 5, noise: "off" }, log: log }));',
  '  } catch (e) {}'
].join('\n');

/* Corrupted focus record -> LAST_ERR -> inline red line. */
const FOCUS_BAD = [
  '  try { localStorage.setItem("xxmu_focus", "{ this is not json"); } catch (e) {}'
].join('\n');

/* Mock SOURCES.autoDiag so diagText() yields deterministic auto-refresh lines.
 * SOURCES is a top-level const object; its autoDiag property is writable. */
const DIAG_MOCK = [
  '  try {',
  '    if (typeof SOURCES !== "undefined" && SOURCES) {',
  '      SOURCES.autoDiag = function () {',
  '        var t = new Date(2026, 10, 21, 9, 5).getTime();',
  '        return [',
  '          { at: t, reason: "learn-tab", ran: 2, changed: true,',
  '            results: [{ id: "ykt", state: "ok" }, { id: "zxs", state: "stale" }] },',
  '          { at: t - 35 * 60000, reason: "resume", ran: 1,',
  '            results: [{ id: "kb", state: "gap-10m" }] },',
  '        ];',
  '      };',
  '    }',
  '  } catch (e) {}'
].join('\n');

const QUIET = [
  '<script id="gpQuiet">(function(){',
  '  for (var i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }',
  '  window.setInterval = function(){ return 0; };',
  '  window.requestAnimationFrame = function(){ return 0; };',
  '  window.fetch = function(){ return new Promise(function(){}); };',
  '  try { XMLHttpRequest.prototype.send = function(){}; } catch(e){}',
  '})();</script>'
].join('\n');

/* Focus: open the real tool-card entrance, then repaint. */
const FOCUS_HEAD = [
  '    try {',
  '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
  '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
  '      var ap = document.getElementById("app");',
  '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
  '    } catch(e){}',
  kind === 'focuserr' ? FOCUS_BAD : FOCUS_SEED,
  '    try { if (typeof openToolCard === "function") openToolCard("focusCard"); } catch(e){}',
  '    try { if (typeof FOCUS !== "undefined" && FOCUS.paint) FOCUS.paint(); } catch(e){}',
  '    try { if (typeof NOVA_ORGANS !== "undefined") NOVA_ORGANS.sync(); } catch(e){}',
].join('\n');

/* Diag: render diagText() into a visible <pre> card so we can shoot it. */
const DIAG_STYLE = '<style id="gpDiag">'
  + '#gpDiagView{position:fixed;left:12px;top:12px;width:366px;max-height:1280px;overflow:hidden;'
  + 'box-sizing:border-box;padding:14px 12px;border-radius:10px;z-index:99999;'
  + 'background:var(--paper2,#FAF3E2);color:var(--ink,#3B3225);'
  + 'border:1px solid var(--line,#A89070);font-size:11px;line-height:1.5;white-space:pre-wrap;'
  + 'word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
  + 'html[data-skin="nova"] #gpDiagView{background:var(--n-surface,#EAF1F4);'
  + 'color:var(--n-ink,#101828);border-color:rgba(16,24,40,.18)}'
  + 'html[data-skin="nova"][data-theme="dark"] #gpDiagView{background:#1B2740;'
  + 'color:#E8F0F2;border-color:rgba(232,240,242,.22)}'
  + '</style>';
const DIAG_HEAD = [
  '    try {',
  '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
  '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
  '      var ap = document.getElementById("app");',
  '      if (ap) { ap.classList.remove("locked"); }',
  '    } catch(e){}',
  DIAG_MOCK,
  '    try {',
  '      var pre = document.createElement("pre"); pre.id = "gpDiagView";',
  '      pre.textContent = (typeof About !== "undefined" && About.diagText) ? About.diagText() : "(About missing)";',
  '      document.body.appendChild(pre);',
  '      document.documentElement.setAttribute("data-shot-h", String(Math.min(1300, pre.getBoundingClientRect().height + 40)));',
  '    } catch(e){ document.documentElement.setAttribute("data-shot-h","1240"); }',
].join('\n');

const BODY_HEAD = kind === 'diag' ? DIAG_HEAD : FOCUS_HEAD;
const BODY = [
  '<script id="gpJs">(function(){',
  '  function go(){', BODY_HEAD, '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(go, 80); });',
  '  else setTimeout(go, 80);',
  '})();</script>',
].join('\n');

function build(tag) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  h = h.replace('</head>', HIDE + (kind === 'diag' ? DIAG_STYLE : '') + '\n</head>');
  h = h.replace('</body>', BODY + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_gp_' + tag + '-' + skin + '-' + theme + '.html');
  fs.writeFileSync(p, h, 'utf8');
  return p;
}

/* For diag we measure the <pre> height first; focus uses a fixed 900. */
function measure(html) {
  if (kind !== 'diag') return 900;
  const dump = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--dump-dom',
    '--virtual-time-budget=2000', 'file:///' + html.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = /data-shot-h="(\d+)"/.exec(dump);
  const n = m ? parseInt(m[1], 10) : 1240;
  return Math.max(300, Math.min(1300, n));
}

function shoot(html, name, w, h) {
  const out = path.join(OUT, name);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=' + w + ',' + h,
    '--virtual-time-budget=2200', '--screenshot=' + out,
    'file:///' + html.replace(/\\/g, '/'),
  ], { timeout: 120000, stdio: 'ignore' });
  console.log('  ' + name + '  ' + fs.statSync(out).size + ' B  (' + w + 'x' + h + ')');
  return out;
}

const p = build(kind);
const hgt = measure(p);
shoot(p, 'v215-' + kind + '-' + skin + '-' + theme + '.png', 390, hgt);
fs.unlinkSync(p);
console.log('done ' + kind + ' ' + skin + ' ' + theme);
