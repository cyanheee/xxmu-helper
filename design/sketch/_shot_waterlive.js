/* _shot_waterlive.js -- v2.1.0 "water watch" card shot (classic + nova, light + dark).
 *
 *   node design/sketch/_shot_waterlive.js [light|dark] [nova|classic]
 *
 * Reads the REAL web/index.html (its css/js are relative paths, so file://
 * gives exactly what the WebView runs), injects a logged-in water account with
 * two machines, one live draw in progress and one unlocked-but-not-started,
 * then screenshots the campus tab.
 *
 * ASCII-only source, same rule as make_nova_real.js / _check_overflow.js:
 * PowerShell 5.1 mangles non-ASCII in .js pipes.
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

const HIDE = '<style id="wvHide">#gate,#disc,#tut,#onb,#upd{display:none!important}'
  /* The NOVA tape/clip organs clone card content into fixed overlays pinned to
   * the viewport; in a still shot they cover the real card and report a width
   * of their own. This shot is about the #waterLive block, so keep them out. */
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  /* Headless Edge refuses to go narrower than ~492px: --window-size=390 still
   * lays out at 492 and then crops the bitmap to 390, which silently cuts the
   * right side of every card. Pin the layout box instead (same trick as
   * make_nova_real.js) so what we see is what a 390px phone gets. */
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important}'
  + '</style>';

const SETUP = [
  '<script id="wvSetup">',
  '(function(){',
  '  function go(){',
  '    try {',
  '      document.documentElement.setAttribute("data-skin", ' + JSON.stringify(skin) + ');',
  '      document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ');',
  '    } catch(e){}',
  '    try {',
  '      var ap = document.getElementById("app");',
  '      if (ap) { ap.classList.remove("locked"); ap.style.display = ""; }',
  '    } catch(e){}',
  /* logged-in water account + two machines */
  '    try {',
  '      localStorage.setItem("xxmu_water_token", "shot-tok");',
  '      localStorage.setItem("xxmu_water_phone", "13800001234");',
  '      localStorage.setItem("xxmu_water_uid", "9001");',
  '      var devs = [',
  '        {id:"g-7731", name:"\u4e09\u53f7\u697c\u4e00\u5c42\u996e\u6c34\u673a", sn:"865403065048324",',
  '         org:"\u80d6\u4e56\u751f\u6d3b", brand:"\u7f8e\u7684", tel:"400-000-0000",',
  '         functions:[{id:"sku-cold", name:"\u51b7"}, {id:"sku-hot", name:"\u70ed"}]},',
  '        {id:"g-8802", name:"\u56fe\u4e66\u9986\u4e09\u5c42\u996e\u6c34\u673a", sn:"865403065099111",',
  '         org:"\u80d6\u4e56\u751f\u6d3b", brand:"\u6d77\u5c14", tel:"400-000-0000",',
  '         functions:[{id:"sku-8802", name:"\u5e38\u6e29"}]}',
  '      ];',
  '      localStorage.setItem("xxmu_water_devs", JSON.stringify(devs));',
  /* one live draw (started 3m12s ago), one unlocked but never started (7m ago) */
  '      var now = Date.now();',
  '      var live = {};',
  '      live["g-7731:sku-cold"] = {dev:"g-7731", devName:"\u4e09\u53f7\u697c\u4e00\u5c42\u996e\u6c34\u673a",',
  '        sku:"sku-cold", name:"\u51b7", at: now - 192000};',
  '      live["g-8802:sku-8802"] = {dev:"g-8802", devName:"\u56fe\u4e66\u9986\u4e09\u5c42\u996e\u6c34\u673a",',
  '        sku:"sku-8802", name:"\u5e38\u6e29", at: now - 420000};',
  '      localStorage.setItem("xxmu_water_live", JSON.stringify(live));',
  '    } catch(e){}',
  '    try { if (typeof switchTab === "function") switchTab("campus"); } catch(e){}',
  '    try { if (typeof CampusUI !== "undefined") CampusUI.refresh(); } catch(e){}',
  /* status 2 (drawing) for the first, status 1 (waiting) for the second;
   * pollOnce is fed a stub so the shot shows a real rendered line. */
  '    try {',
  '      if (typeof WATER !== "undefined") {',
  '        var orig = WATER.syncWater;',
  '        WATER.syncWater = function(sku){',
  '          if (sku === "sku-cold") return Promise.resolve({status:2, amount:0, identify:""});',
  '          return Promise.resolve({status:1, amount:0, identify:""});',
  '        };',
  '        WATERWATCH.pollOnce();',
  /* pollOnce resolves on a promise microtask, so restoring synchronously right
   * after the call would feed the very first tick the real (network-less)
   * syncWater -- which is exactly why the first shot read "暂时读不到状态". */
  '        setTimeout(function(){ WATER.syncWater = orig; }, 500);',
  '      }',
  '    } catch(e){}',
  '    try { if (typeof NOVA_ORGANS !== "undefined") NOVA_ORGANS.sync(); } catch(e){}',
  '    try {',
  '      var live2 = document.getElementById("waterLive");',
  '      if (live2) live2.style.display = "block";',
  '    } catch(e){}',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(go, 60); });',
  '  else setTimeout(go, 60);',
  '})();',
  '</script>',
].join('\n');

/* Kill the app's own timers so --virtual-time-budget can converge. */
const QUIET = [
  '<script id="wvQuiet">',
  '(function(){',
  '  for (var i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }',
  '  window.setInterval = function(){ return 0; };',
  '  window.requestAnimationFrame = function(){ return 0; };',
  '  window.fetch = function(){ return new Promise(function(){}); };',
  '  try { XMLHttpRequest.prototype.send = function(){}; } catch(e){}',
  '})();',
  '</script>',
].join('\n');

function build() {
  const src = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  let h = src.replace('<html lang="zh-CN">',
    '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
  if (!h.includes('data-skin=')) {
    h = h.replace('<html', '<html data-skin="' + skin + '" data-theme="' + theme + '"');
  }
  h = h.replace('</head>', HIDE + '\n</head>');
  h = h.replace('</body>', SETUP + '\n' + QUIET + '\n</body>');
  const p = path.join(WEB, '_wv_' + skin + '-' + theme + '.html');
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

const html = build();
shoot(html, 'v210-water-' + skin + '-' + theme + '.png', 390, 1240);
fs.unlinkSync(html);
console.log('done ' + skin + ' ' + theme);
