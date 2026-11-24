/* design/sketch/_shot_gradepull.js — v2.6.0 档 C「从教务读成绩」实拍夹具
 *
 * node design/sketch/_shot_gradepull.js [light|dark] [nova|classic]
 *
 * 做法：读真实 web/index.html（相对路径的 CSS 在 file:// 下就是 App 里那一份），
 * 把 XXMU.netCk 换成返回一段假成绩页 HTML 的桩，然后照真实动作点两下：
 * 打开「从教务读成绩」面板 → 点「读一次」。图上因此是**真渲染**的路径诊断
 * 与合并结果，不是拼出来的静态文案。
 *
 * 三条老坑照旧要绕（前几个夹具踩过）：
 *   1. #sheet 是 #app 的子节点 → 藏 #app 会连面板一起藏掉，出全白图；
 *   2. #app.locked 不解锁则所有 rect 为 0；
 *   3. 页面自带 setInterval（focus 的 500ms ticker、organs 轮询），不封掉
 *      headless 的 --virtual-time-budget 永不收敛，进程会 ETIMEDOUT。
 *
 * 高度自适应：面板高度随「试过的路径」条数变，所以先 --dump-dom 跑一次量
 * sh-box 的 bottom，再按它定窗口高。测高脚本必须写进 wrap() 的数组参数里
 * （字符串拼接会漏掉闭包，那段 JS 会被当纯文本渲染到页面上）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const SHOTS = path.join(__dirname, 'shots');
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

const theme = (process.argv[2] || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';
const skin = (process.argv[3] || 'nova').toLowerCase() === 'classic' ? 'classic' : 'nova';

function wrap(id, lines) {
  return '<script id="' + id + '">\ntry{\n' + lines.join('\n') + '\n}catch(e){document.title="ERR:"+e}\n</script>\n';
}

/* 皮肤/主题必须在页面脚本之前写进 localStorage：nova-skin.js 在 <head> 后
 * 第 12 行就跑起来了，它会按 pref 自己设 data-skin —— 只在末尾改 attribute
 * 会被它覆盖回默认值，四档实拍就会得到四张一模一样的图（踩过）。 */
const PRE = wrap('gpPre', [
  'try{',
  'localStorage.setItem("xxmu_skin","' + skin + '");',
  'localStorage.setItem("xxmu_theme","' + theme + '");',
  '}catch(e){}'
]);

/* 隐藏首启遮罩 + 把 #app 归零（老坑 1、2 的定案写法）。 */
const HIDE = wrap('gpHide', [
  'document.documentElement.setAttribute("data-skin","' + skin + '");',
  'document.documentElement.setAttribute("data-theme","' + theme + '");',
  'var st=document.createElement("style");',
  'st.textContent="'
  + '#gate,#disc,#tut,#onb,#upd{display:none!important}'
  + '#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important;height:auto!important;'
  + 'min-height:0!important;overflow:visible!important;padding:0!important;'
  + 'margin:0!important;border:none!important;background:transparent!important}'
  + '#app > *:not(#sheet){display:none!important}'
  + '#sheet{position:static!important;inset:auto!important;display:block!important;'
  + 'background:transparent!important;backdrop-filter:none!important;'
  + 'align-items:stretch!important;width:390px!important;z-index:auto!important;'
  + 'margin:10px 0 0!important}'
  + '#sheet .sh-box{max-height:none!important;height:auto!important;width:390px!important;'
  + 'box-shadow:none!important;border:none!important;border-radius:0!important}'
  + 'body{background:var(--bg)!important;padding-bottom:24px!important}'
  + '";',
  'document.head.appendChild(st);'
]);

/* 先解锁 #app（老坑 2）。 */
const UNLOCK = wrap('gpUnlock', [
  'var ap=document.getElementById("app");',
  'if(ap){ap.className="";ap.classList.remove("locked");ap.style.display="";}'
]);

/* 假成绩页：一份常见青果表（表头 + 六门 + 合计），按 UTF-8 字节映射成
 * latin1 字符串 —— decodeAuto 就是按 charCode&0xff 还原字节的。 */
const BODY = wrap('gpBody', [
  'var rows=[',
  '["课程名称","学分","成绩","绩点","学期","任课教师"],',
  '["系统解剖学","5","87","3.7","2026-2027-1","李四"],',
  '["生理学","4","78","2.8","2026-2027-1","王五"],',
  '["病理学","4","--","--","2026-2027-1","赵六"],',
  '["医学伦理学","2","优秀","--","2026-2027-1","钱七"],',
  '["药理学","3","91","4.0","2026-2027-1","孙八"],',
  '["生物化学","3.5","84","3.4","2026-2027-1","周九"],',
  '["合计","21.5","","","",""]',
  '];',
  'var html="<html><body><table>";',
  'for(var i=0;i<rows.length;i++){html+="<tr>";for(var j=0;j<rows[i].length;j++){',
  'html+=(i===0?"<th>":"<td>")+rows[i][j]+(i===0?"</th>":"</td>");}html+="</tr>";}',
  'html+="</table></body></html>";',
  'var u8=new TextEncoder().encode(html);',
  'var raw="";for(var k=0;k<u8.length;k++){raw+=String.fromCharCode(u8[k]);}',
  'var PAYLOAD="200|"+raw;',
  /* 桩：只有第一条候选命中，另两条给「不是成绩页」——图上就能看到诊断长什么样。 */
  'if(typeof XXMU!=="undefined"){XXMU.netCk=function(url){return new Promise(function(res){',
  '  setTimeout(function(){',
  '    if(String(url).indexOf("stuckcj")>=0){res(PAYLOAD);}',
  '    else{',
  '      var b=new TextEncoder().encode("<html><body><div id=\\"frmbody\\">欢迎使用教务系统</div></body></html>");',
  '      var r2="";for(var q=0;q<b.length;q++){r2+=String.fromCharCode(b[q]);}',
  '      res("200|"+r2);',
  '    }',
  '  },40);',
  '});};}',
  /* 本机已有一门旧成绩，让「合并」那句话有内容可写。 */
  'try{localStorage.setItem("xxmu_grades",JSON.stringify({list:[',
  '{name:"体育",credit:1,score:"90",term:"2025-2026-2",teacher:""}',
  '],saved_at:Date.now()}));}catch(e){}',
  /* 照真实动作点两下。 */
  'if(typeof GRADES!=="undefined"){GRADES.open();}',
  'if(typeof GRADEPULL!=="undefined"){GRADEPULL.openPanel();}',
  'setTimeout(function(){',
  '  var b=document.querySelector(".gp-acts .btn");',
  '  if(b){b.click();}',
  '},60);',
  'setTimeout(function(){',
  '  try{var box=document.querySelector("#sheet .sh-box");if(box){box.scrollTop=0;}',
  '  var h=Math.ceil((box?box.getBoundingClientRect().bottom:0)+20);',
  '  document.documentElement.setAttribute("data-shot-h",String(h));}catch(e){}',
  '},700);'
]);

const QUIET = wrap('gpQuiet', [
  'for(var i=1;i<20000;i++){clearTimeout(i);clearInterval(i);}',
  'window.setInterval=function(){return 0;};',
  'window.requestAnimationFrame=function(){return 0;};',
  'window.fetch=function(){return new Promise(function(){});};',
  'try{XMLHttpRequest.prototype.send=function(){};}catch(e){}'
]);

function build(tag, extra) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  /* PRE 紧跟 <head>：nova-skin.js 在文档很靠前的地方就会读 pref 并设 data-skin，
   * 必须赶在它之前把 localStorage 写好。 */
  h = h.replace('<head>', '<head><base href="file:///' + WEB.replace(/\\/g, '/') + '/">' + PRE);
  /* QUIET 必须在 extra 之前注入：QUIET 会 clearTimeout(1..20000)，
   * 如果它排在后面，BODY 里那两处 setTimeout（点按钮、测高）会被自己清掉，
   * 图上就只剩一个空面板（第一版就是这么白跑的）。 */
  h = h.replace('</body>', QUIET + extra + '</body>');
  const f = path.join(WEB, '_gp_' + tag + '-' + skin + '-' + theme + '.html');
  fs.writeFileSync(f, h, 'utf8');
  return f;
}

function contentHeight(htmlPath) {
  const out = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--window-size=390,900', '--virtual-time-budget=2200', '--dump-dom',
    'file:///' + htmlPath.replace(/\\/g, '/')
  ], { encoding: 'utf8', timeout: 120000 });
  const m = /data-shot-h="(\d+)"/.exec(out);
  const n = m ? parseInt(m[1], 10) : 0;
  return Math.max(320, Math.min(1400, n || 760));
}

function shoot(htmlPath, name, w, h) {
  const out = path.join(SHOTS, name);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--window-size=' + w + ',' + h, '--virtual-time-budget=2200',
    '--screenshot=' + out,
    'file:///' + htmlPath.replace(/\\/g, '/')
  ], { timeout: 120000 });
  return out;
}

if (!fs.existsSync(EDGE)) {
  console.error('找不到 Edge：' + EDGE);
  process.exit(1);
}
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const a = build('panel', HIDE + UNLOCK + BODY);
const H = contentHeight(a);
const out = shoot(a, 'v260-gradepull-' + skin + '-' + theme + '.png', 390, H);
fs.unlinkSync(a);
console.log(out + '  ' + fs.statSync(out).size + ' B  (390x' + H + ')');
