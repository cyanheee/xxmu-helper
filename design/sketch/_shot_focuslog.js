/* _shot_focuslog.js -- v2.4.0 "focus log" shots (classic + nova, light + dark).
 *
 *   node design/sketch/_shot_focuslog.js [light|dark] [nova|classic]
 *
 * Subject: the #focusCard inside the tool sheet, scrolled so the new
 * #focusHisto bars and #focusHint line are both visible.
 *
 * The card normally lives in #toolPark (display:none) and only moves into
 * .sh-box when openToolCard('focusCard') runs -- app.js:2794. So the fixture
 * must call that, not try to un-hide the card in place.
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
 * out at 492 and crops the bitmap to 390, silently cutting the right edge off.
 * Pin the layout box instead (same trick as the other v2.x fixtures). */
const HIDE = '<style id="flHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  /* NOVA tape/clip organs clone card content into fixed overlays that cover
   * the real card in a still shot. */
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important}'
  + '#sheet{width:390px!important;max-width:390px!important}'
  + '</style>';

/* Seed a 14-day focus log. Values are deliberately uneven: a flat wall of
 * equal bars would not show whether the height scaling works, and one zero day
 * proves the baseline tick renders instead of an empty gap. */
const SEED = [
  '  try {',
  '    var span = [45, 25, 60, 0, 30, 75, 50, 20, 0, 40, 90, 35, 55, 70];',
  '    var log = {};',
  '    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };',
  '    for (var i = 0; i < span.length; i++) {',
  '      var d = new Date();',
  '      d.setHours(12, 0, 0, 0);',
  '      d.setDate(d.getDate() - (span.length - 1 - i));',
  '      var key = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());',
  '      if (span[i] > 0) log[key] = span[i];',
  '    }',
  '    localStorage.setItem("xxmu_focus", JSON.stringify({',
  '      settings: { mode: "pomo", focusMin: 25, restMin: 5, noise: "off" },',
  '      log: log,',
  '    }));',
  '  } catch (e) {}'
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. The focus
 * ticker is a 500ms setInterval: left running, headless never settles. */
const QUIET = [
  '<script id="flQuiet">',
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
    SEED,
    /* openToolCard moves #focusCard out of #toolPark into .sh-box, sets the
     * sheet title, and calls FOCUS.paint() itself (app.js:2813) -- which is
     * where paintHisto() runs. */
    '    try { if (typeof openToolCard === "function") openToolCard("focusCard"); } catch(e){}',
    '    try { if (typeof FOCUS !== "undefined" && FOCUS.paint) FOCUS.paint(); } catch(e){}',
    '    try { if (typeof NOVA_ORGANS !== "undefined") NOVA_ORGANS.sync(); } catch(e){}',
  ].join('\n');
}

const BODY = [
  '<script id="flJs">',
  '(function(){',
  '  function go(){',
  head(),
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(go, 60); });',
  '  else setTimeout(go, 60);',
  '})();',
  '</script>',
].join('\n');

function build(tag, extra) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  h = h.replace('</head>', HIDE + '\n</head>');
  h = h.replace('</body>', extra + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_fl_' + tag + '-' + skin + '-' + theme + '.html');
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

const a = build('card', BODY);
shoot(a, 'v240-focus-' + skin + '-' + theme + '.png', 390, 900);
fs.unlinkSync(a);

console.log('done ' + skin + ' ' + theme);
