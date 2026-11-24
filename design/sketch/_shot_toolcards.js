/* _shot_toolcards.js -- shots of the tool cards that live in #toolPark.
 *
 *   node design/sketch/_shot_toolcards.js [light|dark] [nova|classic] [todo|bind]
 *
 * Subject: #myTodoCard ("my todos") and #bindCard ("account binding").
 * #focusCard already has its own fixture (_shot_focuslog.js, v2.4.0).
 *
 * Why it must go through openToolCard(): both cards live in #toolPark with
 * display:none and are only moved into #sheet .sh-box at runtime
 * (app.js:2833). Un-hiding the card in place would photograph a layout the
 * user never sees -- the sheet's .sh-box padding and the .sheet-only rules
 * only apply once the card is actually inside the sheet.
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
const card = (process.argv[4] || 'todo').toLowerCase() === 'bind' ? 'bind' : 'todo';
const CARD_ID = card === 'bind' ? 'bindCard' : 'myTodoCard';

/* Same panel-only framing as _shot_export.js: #sheet lives INSIDE #app, so
 * hiding #app would take the panel with it. Hide #app's other children, let
 * #app collapse, and flow the sheet in the document so the figure is exactly
 * the panel at its natural height (a fixed 88vh box would crop the bottom
 * row out of the picture silently). */
const HIDE = '<style id="tcHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
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

/* Data shapes are the ones the app itself writes (mytodo.js:30 K='xxmu_mytodo',
 * focus.js, grades.js, water.js). Dates are relative to today so the picture
 * never goes stale. Due dates are real 'YYYY-MM-DD' strings -- mytodo.js:397
 * parses them with new Date(x.due + 'T00:00:00'), so an empty string is the
 * only correct "no due date". */
const SEED = [
  '<script id="tcSeed">',
  '(function(){',
  '  var p2 = function(n){ return (n < 10 ? "0" : "") + n; };',
  '  var iso = function(d){ return d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate()); };',
  '  var now = new Date();',
  '  var day = function(back){ var d = new Date(now.getTime() + back*86400000); return iso(d); };',
  '  try {',
  '    localStorage.setItem("xxmu_mytodo", JSON.stringify([',
  '      {id:"t1", text:"周三前交\u75C5\u7406\u5B9E\u9A8C\u62A5\u544A", due: day(1), done:false, at: now.getTime()-7200000},',
  '      {id:"t2", text:"\u80CC\u5B8C\u836F\u7406\u7B2C\u4E09\u7AE0", due: day(3), done:false, at: now.getTime()-8600000},',
  '      {id:"t3", text:"\u95EE\u8F85\u5BFC\u5458\u8C03\u8BFE", due: "", done:false, at: now.getTime()-9000000},',
  '      {id:"t4", text:"\u501F\u300A\u75C5\u7406\u5B66\u300B\u7B2C\u516B\u7248", due: day(-1), done:false, at: now.getTime()-9500000},',
  '      {id:"t5", text:"\u7ED9\u5BFC\u5E08\u53D1\u5F00\u9898\u62A5\u544A", due: day(-2), done:true, at: now.getTime()-90000000},',
  '      {id:"t6", text:"\u9886\u5B9E\u9A8C\u670D", due: "", done:true, at: now.getTime()-90000000},',
  '    ]));',
  '    localStorage.setItem("xxmu_skin", ' + JSON.stringify(skin) + ');',
  '    localStorage.setItem("xxmu_theme", ' + JSON.stringify(theme) + ');',
  '  } catch (e) {}',
  '})();',
  '</script>',
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. The todo
 * card arms a 2600ms "click again to delete" timeout on demand, so no timer is
 * left running by the fixture itself. */
const QUIET = [
  '<script id="tcQuiet">',
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
    /* Open through the real entry point: it moves the card into .sh-box, sets
     * #sh-name and calls MYTODO.render() / CxUI.paint()+SrcUI.paint() itself
     * (app.js:2851-2859). If openToolCard ever breaks, the shot comes out
     * empty instead of showing a convincing fake. */
    '    try { if (typeof openToolCard === "function") openToolCard('
      + JSON.stringify(CARD_ID) + '); } catch(e){}',
    '    try { if (typeof MYTODO !== "undefined" && MYTODO.render) MYTODO.render(); } catch(e){}',
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

const BODY = wrap('tcBodyJs', [
  '    setTimeout(function(){',
  '      try {',
  '        var box = document.querySelector("#sheet .sh-box");',
  '        if (box) box.scrollTop = 0;',
  /* Report the panel's real bottom edge so the caller can shoot exactly that
   * tall -- a fixed window height would leave the figure half empty page. */
  '        var h = Math.ceil((box ? box.getBoundingClientRect().bottom : 0) + 20);',
  '        document.documentElement.setAttribute("data-shot-h", String(h));',
  /* Leave a readable trace of what actually rendered in the DOM dump, so a
   * blank figure can be diagnosed without guessing. */
  '        document.documentElement.setAttribute("data-shot-info",',
  '          "rows=" + document.querySelectorAll("#myTodoList .mtd").length',
  '          + " cnt=" + ((document.getElementById("myTodoCount") || {}).textContent || "")',
  '          + " name=" + ((document.getElementById("sh-name") || {}).textContent || ""));',
  '      } catch(e){}',
  '    }, 260);',
].join('\n'));

function build(tag, extra) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  /* SEED runs in </head> so it lands before the app scripts read localStorage. */
  h = h.replace('</head>', HIDE + '\n' + SEED + '\n</head>');
  h = h.replace('</body>', extra + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_tc_' + tag + '-' + skin + '-' + theme + '.html');
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
  const i = /data-shot-info="([^"]*)"/.exec(dom);
  if (i) console.log('  info: ' + i[1]);
  /* The bind card carries four provider panels and is roughly 2100px tall at
   * 390 wide; a 1600 cap cut the last card in half, so the ceiling has to clear
   * the tallest panel we shoot. */
  return m ? Math.max(320, Math.min(2600, Number(m[1]))) : 800;
}

const a = build(card, BODY);
const H = measure(a);
shoot(a, 'uix-tool-' + card + '-' + skin + '-' + theme + '.png', 390, H);
fs.unlinkSync(a);

console.log('done ' + skin + ' ' + theme + ' ' + card);
