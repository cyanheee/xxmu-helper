/* _shot_export.js -- v2.5.0 "backup & export" panel shots (classic + nova).
 *
 *   node design/sketch/_shot_export.js [light|dark] [nova|classic]
 *
 * Subject: the half-sheet opened from Settings -> 数据与更新 -> 备份与导出.
 * It shows what is exportable on this phone, the two buttons, and the line
 * that says login state never goes into the file.
 *
 * Two notes on why this fixture looks the way it does:
 *   1. There is no Host in headless Edge, so web/export.js falls back to
 *      localStorage exactly like web/sync.js:54 does. Seeding localStorage is
 *      therefore seeding the real read path -- nothing is stubbed.
 *   2. The panel is opened by calling EXPORT.openPanel(), not by clicking
 *      #rowExport: the click handler is bound during EXPORT.init(), and a shot
 *      that only proves a click works would hide a broken panel.
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
 * bitmap: pin the layout box (same trick as _shot_nowline.js). */
const HIDE = '<style id="exHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  /* The subject is the panel, not the settings page behind it. #sheet lives
   * INSIDE #app (index.html nests it), so hiding #app outright would take the
   * panel down with it. Hide #app's other children instead and let #app
   * collapse to zero height, so the figure starts at the panel's own top edge
   * instead of a screenful of blank page.
   * Flowing the sheet in the document (position:static) makes the figure the
   * panel at its natural height: a fixed 88vh box would have cropped the
   * bottom lines (skipped keys / notes) out of the picture silently. */
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

/* Real data on a plausible phone. Keys and value shapes are the ones the app
 * itself writes, so buildBackup() reads them through the normal path:
 *   xxmu_mytodo   -> [{id,text,due,done,at}, ...]
 *   xxmu_focus    -> {settings:{...}, log:{'YYYY-MM-DD': minutes}}
 *   xxmu_grades   -> {list:[{term,name,credit,score}], saved_at}
 *   xxmu_water_devs -> [{id,name,fns:[...]}, ...]
 *   xxmu_wiki_mine  -> [{...}]
 * Date keys are relative to today so the picture never goes stale. */
const SEED = [
  '<script id="exSeed">',
  '(function(){',
  '  var p2 = function(n){ return (n < 10 ? "0" : "") + n; };',
  '  var iso = function(d){ return d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate()); };',
  '  var now = new Date();',
  '  var day = function(back){ var d = new Date(now.getTime() - back*86400000); return iso(d); };',
  '  try {',
  '    localStorage.setItem("xxmu_mytodo", JSON.stringify([',
  '      {id:"t1", text:"\u5B9E\u9A8C\u62A5\u544A\uFF1A\u7EC6\u80DE\u663E\u5FAE\u89C2\u5BDF", due: day(-2), done:false, at: now.getTime()-7200000},',
  '      {id:"t2", text:"\u7ED9\u5BFC\u5E08\u53D1\u5F00\u9898\u62A5\u544A", due: day(-5), done:false, at: now.getTime()-8600000},',
  '      {id:"t3", text:"\u501F\u300A\u75C5\u7406\u5B66\u300B\u7B2C\u516B\u7248", due:"", done:true, at: now.getTime()-90000000},',
  '    ]));',
  '    var log = {};',
  '    var mins = [45,25,60,0,30,75,50,20,0,40,90,35];',
  '    for (var i = 0; i < mins.length; i++) { if (mins[i] > 0) log[day(i+1)] = mins[i]; }',
  '    localStorage.setItem("xxmu_focus", JSON.stringify({',
  '      settings:{mode:"pomo", focusMin:25, restMin:5, noise:"off"}, log: log',
  '    }));',
  '    localStorage.setItem("xxmu_grades", JSON.stringify({',
  '      list:[',
  '        {term:"2026-2027-1", name:"\u7CFB\u7EDF\u89E3\u5256\u5B66", credit:5, score:87},',
  '        {term:"2026-2027-1", name:"\u751F\u7406\u5B66", credit:4, score:78},',
  '        {term:"2026-2027-1", name:"\u75C5\u7406\u5B66", credit:4, score:""},',
  '      ], saved_at: now.getTime()',
  '    }));',
  '    localStorage.setItem("xxmu_water_devs", JSON.stringify([',
  '      {id:"g-7731", name:"\u4E09\u53F7\u697C\u4E00\u5C42\u996E\u6C34\u673A"},',
  '      {id:"g-8802", name:"\u56FE\u4E66\u9986\u4E09\u5C42\u996E\u6C34\u673A"},',
  '    ]));',
  '    localStorage.setItem("xxmu_wiki_mine", JSON.stringify([',
  '      {id:"w1", cat:"\u98DF\u5802", text:"\u4E8C\u98DF\u5802\u4E8C\u697C\u7684\u70ED\u5E72\u9762\u6BD4\u4E00\u697C\u597D\u5403", at: now.getTime()-3600000},',
  '    ]));',
  '    localStorage.setItem("xxmu_start", iso(new Date(now.getFullYear(), 7, 31)));',
  '    localStorage.setItem("xxmu_weeks", "21");',
  '    localStorage.setItem("xxmu_skin", ' + JSON.stringify(skin) + ');',
  '    localStorage.setItem("xxmu_theme", ' + JSON.stringify(theme) + ');',
  '  } catch (e) {}',
  '})();',
  '</script>',
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. */
const QUIET = [
  '<script id="exQuiet">',
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
    '    try { if (typeof switchTab === "function") switchTab("settings"); } catch(e){}',
    /* Open the panel through its real entry point. If openPanel() ever fails,
     * the shot comes out empty instead of showing a convincing fake. */
    '    try { if (typeof EXPORT !== "undefined" && EXPORT.openPanel) EXPORT.openPanel(); } catch(e){}',
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

const BODY = wrap('exBodyJs', [
  '    setTimeout(function(){',
  '      try {',
  '        var box = document.querySelector("#sheet .sh-box");',
  '        if (box) box.scrollTop = 0;',
  /* Report the panel's real bottom edge so the caller can shoot exactly that
   * tall -- a fixed 1000px window would leave two thirds of the figure as empty
   * page background. */
  '        var h = Math.ceil((box ? box.getBoundingClientRect().bottom : 0) + 20);',
  '        document.documentElement.setAttribute("data-shot-h", String(h));',
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
  const p = path.join(WEB, '_ex_' + tag + '-' + skin + '-' + theme + '.html');
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

/* The panel is ~330px tall; a 1000px window would leave two thirds of the
 * figure as empty page background. Ask the page how tall it really is and shoot
 * that, so the figure is the panel and nothing else. */
function contentHeight(html) {
  const dom = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=390,1200',
    '--virtual-time-budget=2200', '--dump-dom',
    'file:///' + html.replace(/\\/g, '/'),
  ], { timeout: 120000, encoding: 'utf8' });
  const m = /data-shot-h="(\d+)"/.exec(dom);
  return m ? Math.max(320, Math.min(1400, Number(m[1]))) : 1000;
}

const a = build('panel', BODY);
const H = contentHeight(a);
shoot(a, 'v250-export-' + skin + '-' + theme + '.png', 390, H);
fs.unlinkSync(a);

console.log('done ' + skin + ' ' + theme);
