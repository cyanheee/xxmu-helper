/* _shot_nova_sheet.js - one-off: does #gpaTargetBox survive under the NOVA skin?
 * The earlier QA shots used the classic skin because a debug reading suggested
 * the swipe organ replaced everything inside #sh-body. That reading needs proof,
 * not a guess: photograph the same panel with the NOVA skin turned on.
 * ASCII-only source, same rule as make_nova_real.js.
 *   node design/sketch/_shot_nova_sheet.js [light|dark]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SK = path.join(ROOT, 'design', 'sketch');
const SHOTS = path.join(SK, 'shots');
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

const theme = process.argv[2] || 'light';

execFileSync(process.execPath, [path.join(SK, 'make_nova_real.js'), theme, 'nova'],
  { stdio: 'inherit' });
const src = path.join(SK, 'nova-real-nova-' + theme + '.html');
let html = fs.readFileSync(src, 'utf8');

const extra = [
  '<style id="novaSheetCss">',
  '#sheet{position:fixed!important;left:0!important;top:0!important;',
  '  width:390px!important;height:1240px!important;max-height:1240px!important;',
  '  display:block!important;border-radius:0!important;margin:0!important;}',
  '#sh-body{max-height:1120px!important;overflow:auto!important;}',
  '</style>',
  '<script id="novaSheetJs">',
  '(function(){',
  '  function go(){',
  '    try { document.documentElement.setAttribute("data-shot-sheet","1"); } catch(e){}',
  '    try { if (typeof switchTab === "function") switchTab("learn"); } catch(e){}',
  '    try { if (typeof renderHomework === "function") renderHomework(); } catch(e){}',
  '    try {',
  '      var L=[{name:"\\u7CFB\\u7EDF\\u89E3\\u5256\\u5B66",credit:5,score:"87",term:"2026-2027-1"},',
  '             {name:"\\u751F\\u7406\\u5B66",credit:4,score:"78",term:"2026-2027-1"},',
  '             {name:"\\u75C5\\u7406\\u5B66",credit:4,score:"55",term:"2026-2027-1"},',
  '             {name:"\\u836F\\u7406\\u5B66",credit:3,score:"",term:"2026-2027-1"}];',
  '      localStorage.setItem("xxmu_grades",JSON.stringify({list:L,saved_at:Date.now()}));',
  '      localStorage.setItem("xxmu_gpa_target","3.5");',
  '      localStorage.setItem("xxmu_gpa_remain","18");',
  '    } catch(e){}',
  '    try { if (typeof GRADES !== "undefined" && GRADES.open) GRADES.open(); } catch(e){}',
  '    try { if (typeof GRADES !== "undefined" && GRADES.revealAll) GRADES.revealAll(GRADES.load().list||[]); } catch(e){}',
  '    try { if (typeof LEARNPLUS !== "undefined") { LEARNPLUS.paintTarget(); } } catch(e){}',
  '    try { if (typeof NOVA_ORGANS !== "undefined") NOVA_ORGANS.sync(); } catch(e){}',
  /* The verification readout is opt-in: with the overlay on, it covers the
   * sheet title and the shot is useless as a deliverable. Pass "debug" as the
   * second argv to get it back. */
  (process.env.V200_DEBUG === '1' ? [
  '    try {',
  '      var b=document.getElementById("sh-body");',
  '      var t=document.getElementById("gpaTargetBox");',
  '      var w=document.createElement("div");',
  '      w.style.cssText="position:fixed;left:0;top:0;z-index:99999;background:#000;color:#0f0;font:11px monospace";',
  '      var kids=b?b.children.length:-1;',
  '      var names=[];',
  '      if(b){for(var i=0;i<kids;i++){names.push(b.children[i].className||b.children[i].tagName)}}',
  '      w.textContent="kids="+kids+" tgt="+(t?"YES":"NO")+" top="+(t?t.offsetTop:-1)+" | "+names.join(",");',
  '      document.body.appendChild(w);',
  '    } catch(e){}'
  ].join('\n') : ''),
  '    try {',
  '      var b2=document.getElementById("sh-body");',
  '      var t2=document.getElementById("gpaTargetBox");',
  '      if (b2 && t2) b2.scrollTop = t2.offsetTop - 40;',
  '    } catch(e){}',
  '  }',
  '  if (document.readyState === "complete") go(); else window.addEventListener("load", go);',
  '})();',
  '</script>'
].join('\n');

html = html.replace('</body>', extra + '\n</body>');

const out = path.join(SK, 'nova-sheet-' + theme + '.html');
fs.writeFileSync(out, html, 'utf8');

const png = path.join(SHOTS, 'v200-sheet-nova-' + theme + '.png');
execFileSync(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=390,1240', '--virtual-time-budget=1600',
  '--screenshot=' + png, 'file:///' + out.replace(/\\/g, '/')
], { stdio: 'ignore' });
console.log(path.basename(png) + ' ' + fs.readFileSync(png).length + ' bytes');
