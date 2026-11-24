/* Probe: dump the DEADLINE MATRIX readout bar text from a built shot page.
 * Usage: node design/sketch/_probe_rain.js [light|dark] [nova|classic]
 * Prints the .nv-rain-seg textContent pairs and #hwStat / #hwcount / #hwSyncAt.
 * ASCII-only on purpose: PowerShell 5.1 renders CJK comments as mojibake. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const theme = process.argv[2] || 'light';
const skin = process.argv[3] || 'nova';
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

const src = path.join(WEB, 'index.html');
let html = fs.readFileSync(src, 'utf8');
const rel = (p) => 'file:///' + path.join(WEB, p).replace(/\\/g, '/');

/* Fires on load instead of setTimeout: QUIET wipes pending timers, so relying on
 * a timer here is fragile. The probe reads the DOM one rAF-free tick later via
 * the load event, which still runs after all deferred page scripts. */
const probe = [
  'function __pbDump(){',
  '  var out=[];',
  '  var segs=document.querySelectorAll(".nv-rain-seg");',
  '  for(var i=0;i<segs.length;i++){',
  '    var u=segs[i].querySelector("u"), b=segs[i].querySelector("b");',
  '    out.push((u?u.textContent:"?")+"="+(b?b.textContent:"?"));',
  '  }',
  '  var hw=document.getElementById("hwcount"), st=document.getElementById("hwStat");',
  '  var sa=document.getElementById("hwSyncAt");',
  '  out.push("hwcount="+(hw?hw.textContent:"none"));',
  '  out.push("hwStat="+(st?st.textContent:"none"));',
  '  out.push("hwSyncAt="+(sa?sa.textContent:"none"));',
  '  out.push("HWSTAT="+JSON.stringify(window.__HWSTAT||null));',
  '  document.title="PROBE|"+out.join(" | ");',
  '}',
  /* The page boots its own renderHomework() at DOMContentLoaded, which runs AFTER
   * this fixture (inline scripts parse before that event) and overwrites
   * __HWSTAT with an empty {0,0,null}. Re-applying the fixture here reproduces
   * what a real refresh does: data lands, then the organ interval re-reads it. */
  'window.addEventListener("load", function(){',
  '  try{ if(typeof __pbFix==="function") __pbFix(); }catch(e){ document.title="FIX2ERR:"+e; }',
  '  try{ if(window.NOVA_ORGANS && NOVA_ORGANS.sync) NOVA_ORGANS.sync(); }catch(e){}',
  '  setTimeout(__pbDump, 60);',
  '});'
].join('\n');

html = html.replace('<head>', '<head>\n<base href="' + rel('') + '/">');
html = html.replace('<head>', '<head>\n<script>try{localStorage.setItem("xxmu_skin","' + skin
  + '");localStorage.setItem("xxmu_theme","' + theme
  + '");localStorage.setItem("xxmu_onboard_done","1");localStorage.setItem("xxmu_tut_done","1");'
  + 'localStorage.setItem("xxmu_disc_done","1");}catch(e){}</script>');

const fixture = [
  'function __pbFix(){',
  '  var d=new Date(); var td=(d.getDay()+6)%7+1;',
  '  DATA.courses=[',
  '    {name:"\u7cfb\u7edf\u89e3\u5256\u5b66",room:"A201",weeks:[1],day:td,periods:[1,2]},',
  '    {name:"\u751f\u7406\u5b66",room:"B305",weeks:[1],day:td,periods:[5,6]}',
  '  ];',
  '  PERIODS=16; curWeek=1;',
  '  if(typeof renderWeek==="function"){renderWeek();}',
  '  var now=Date.now();',
  '  function ds(h){var x=new Date(now+h*3600e3);',
  '    function p(n){return (n<10?"0":"")+n;}',
  '    return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate())+" "+p(x.getHours())+":"+p(x.getMinutes());}',
  '  window.HOMEWORK={synced_at:Math.floor(now/1000)-1680,works:[',
  '    {name:"\u75c5\u7406\u5b66\u5b9e\u9a8c\u62a5\u544a",course:"\u75c5\u7406\u5b66",status:"\u672a\u63d0\u4ea4",status_known:true,end:ds(36),left_hours:36,open:true},',
  '    {name:"\u836f\u7406\u5b66\u75c5\u4f8b\u5206\u6790",course:"\u836f\u7406\u5b66",status:"\u672a\u63d0\u4ea4",status_known:true,end:ds(96),left_hours:96,open:true}',
  '  ],exams:[',
  '    {name:"\u751f\u7406\u5b66\u9636\u6bb5\u8003",course:"\u751f\u7406\u5b66",status:"\u672a\u5f00\u59cb",status_known:true,start:ds(72),end:ds(74)}',
  '  ]};',
  '  if(typeof renderHomework==="function"){renderHomework();}',
  '}',
  'try{ __pbFix(); }catch(e){document.title="FIXERR:"+e;}'
].join('\n');

const QUIET = [
  '<script id="pbQuiet">try{',
  '  for(var i=1;i<20000;i++){clearTimeout(i);clearInterval(i);}',
  '  window.setInterval=function(){return 0;};',
  '  window.requestAnimationFrame=function(){return 0;};',
  '  window.fetch=function(){return new Promise(function(){});};',
  '  XMLHttpRequest.prototype.send=function(){};',
  '  var g=document.getElementById("gate"),a=document.getElementById("app");',
  '  if(a){a.classList.remove("locked");a.style.display="";}',
  '  if(g){g.style.display="none";}',
  '}catch(e){}</script>'
].join('\n');

/* One single replace keeps </body> in place: chaining three replaces on the same
 * token silently drops the tag after the first one, which is how an earlier
 * revision ended up injecting nothing at all. */
const inject = [QUIET,
  '<script>\n' + fixture + '\n</script>',
  '<script>\n' + probe + '\n</script>'].join('\n');
html = html.replace('</body>', inject + '\n</body>');

const tmp = path.join(WEB, '_probe_rain.html');
fs.writeFileSync(tmp, html, 'utf8');
let dom = '';
try {
  dom = execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--window-size=390,900', '--virtual-time-budget=3000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 120000 });
} catch (e) {
  dom = (e.stdout || '') + '';
}
const m = dom.match(/<title>([\s\S]*?)<\/title>/);
console.log(m ? m[1].replace(/&amp;/g, '&') : '(no title)');
