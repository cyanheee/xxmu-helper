/* 复现真机路径，验证 NOVA 器官到底有没有挂上（v2：杀 timer + 硬超时）。
 *   node design/sketch/_probe_switch.js switch  → 经典启动后点「万象舱」按钮（用户真实操作）
 *   node design/sketch/_probe_switch.js cold    → 已存 nova 冷启动
 * 判据：PROBE 行 organs>=10 且 belt/ticket/dial/clip 都 >=1。用完自动删临时 html。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const mode = process.argv[2] || 'switch';
let html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');

const pre = `<script>
try{localStorage.setItem("xxmu_theme","light");${mode === 'cold'
  ? 'localStorage.setItem("xxmu_skin","nova");'
  : 'localStorage.removeItem("xxmu_skin");'}}catch(e){}
window.__errs=[];window.addEventListener("error",function(e){window.__errs.push((e.message||"?")+"@"+(e.lineno||0));});
/* 杀掉 focus/reminder 的循环 timer，否则 --virtual-time-budget 永远跑不完 */
try{for(var i=1;i<=20000;i++){clearTimeout(i);clearInterval(i);}
  var nil=function(){return 0;};window.setTimeout=function(f){try{f();}catch(e){}return 0;};window.setInterval=nil;}catch(e){}
</script>`;
html = html.replace(/<head([^>]*)>/, (m, a) => '<head' + a + '>' + pre);

const tail = `<script>
document.addEventListener("DOMContentLoaded",function(){
  var app=document.getElementById("app");if(app)app.classList.remove("locked");
  ["gate","disc","tut","onb","upd","sheet"].forEach(function(id){var e=document.getElementById(id);if(e){e.style.display="none";e.classList.remove("on");}});
  ${mode === 'switch'
    ? 'var btn=document.querySelector(".skin-opt[data-skin-mode=\\"nova\\"]");if(btn){btn.click();}else{window.__errs.push("no-nova-btn");}'
    : ''}
  var q=function(s){return document.querySelectorAll(s).length;};
  var line="PROBE mode=${mode} skin="+document.documentElement.getAttribute("data-skin")
    +" organs="+q("[data-organ]")+" belt="+q(".nv-belt")+" crank="+q(".nv-crank")
    +" tape="+q(".nv-tape")+" dial="+q(".nv-dial")+" ticket="+q(".nv-ticket")
    +" clip="+q(".nv-clip")+" rain="+q(".nv-rain")+" plate="+q(".nv-plate")
    +" errs="+JSON.stringify(window.__errs);
  document.title=line;
  var p=document.createElement("pre");p.id="__probe";p.textContent=line;document.body.appendChild(p);
});
</script>`;
html = html.replace('</body>', tail + '</body>');
const out = path.join(ROOT, 'web', '_probe_switch.html');
fs.writeFileSync(out, html, 'utf8');

const edge = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const ud = path.join(os.tmpdir(), 'nova-probe-' + Date.now());
let dom = '';
try {
  dom = execFileSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + ud, '--virtual-time-budget=1500', '--dump-dom',
    'file:///' + out.replace(/\\/g, '/')
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 40 * 1024 * 1024, timeout: 25000 });
} catch (e) { dom = String(e.stdout || ''); }
const m = dom.match(/PROBE [^<]*/);
console.log(m ? m[0] : 'NO PROBE LINE (dom len=' + dom.length + ')');
try { fs.unlinkSync(out); } catch (e) {}
