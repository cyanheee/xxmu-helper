/* design/sketch/_shot_tabs.js — 把每个 section 各拍一张整页图，用来做 UI 现状盘查。
 *
 * node design/sketch/_shot_tabs.js [light|dark] [nova|classic] [tab] [h]
 *   不给 tab 就拍全部九个
 *   （kb / learn / wiki / campus / me / settings / guide / admin / about）
 *
 * v2.9.1 起从五个主 tab 扩到九个 section：settings/guide/admin/about 这四页
 * 以前从没被截图看过，「没拍过」和「没问题」是两件事。
 *
 * 读真实 web/index.html —— 相对路径的 CSS 在 file:// 下就是 App 里那一份。
 * 只有两件事要塞进去：解锁 #app（否则 rect 全 0），和给几个页面填一点
 * 有形状的假数据（课表 10 门、作业 5 条、待办 3 条），空页面看不出排版。
 *
 * 高度不给就自动量：滚到底，取 body.scrollHeight。
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
const only = (process.argv[4] || '').trim();
const fixedH = parseInt(process.argv[5] || '0', 10) || 0;

const TABS = ['kb', 'learn', 'wiki', 'campus', 'me', 'settings', 'guide', 'admin', 'about'];

function wrap(id, lines) {
  return '<script id="' + id + '">\ntry{\n' + lines.join('\n') + '\n}catch(e){document.title="ERR:"+e}\n</script>\n';
}

const PRE = wrap('tbPre', [
  'try{',
  'localStorage.setItem("xxmu_skin","' + skin + '");',
  'localStorage.setItem("xxmu_theme","' + theme + '");',
  'localStorage.setItem("xxmu_onboard_done","1");',
  'localStorage.setItem("xxmu_tut_done","1");',
  'localStorage.setItem("xxmu_disc_done","1");',
  '}catch(e){}'
]);

const QUIET = wrap('tbQuiet', [
  'for(var i=1;i<20000;i++){clearTimeout(i);clearInterval(i);}',
  'window.setInterval=function(){return 0;};',
  'window.requestAnimationFrame=function(){return 0;};',
  'window.fetch=function(){return new Promise(function(){});};',
  'try{XMLHttpRequest.prototype.send=function(){};}catch(e){}'
]);

/* 藏首启遮罩，并把宽度钉到 390 —— headless Edge 的 --window-size=390 只裁
 * 位图不改布局（实际按 ~492 排再切右边），不钉就等于拍了一张被切掉右半的图。 */
const HIDE = wrap('tbHide', [
  'var st=document.createElement("style");',
  'st.textContent="'
  + '#gate,#disc,#tut,#onb,#upd,#sheet,#eg-stage,.nv-tape-world,.nv-clip-world{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important;padding:0!important;margin:0!important}'
  + '";',
  'document.head.appendChild(st);'
]);

/* 造一点有形状的数据：10 门课铺满一周、5 条作业（含 1 条已过截止）、3 条待办。 */
function body(tab) {
  return wrap('tbBody', [
    'var ap=document.getElementById("app");',
    'if(ap){ap.classList.remove("locked");ap.style.display="";}',
    'var tw=(typeof WEEK!=="undefined"?WEEK:11);',
    'var dn=(new Date().getDay()+6)%7+1;',
    'var C=[',
    ' {name:"系统解剖学",room:"A201",day:1,periods:[1,2]},',
    ' {name:"生理学",room:"B305",day:1,periods:[5,6]},',
    ' {name:"病理学",room:"C102",day:2,periods:[3,4]},',
    ' {name:"药理学",room:"A108",day:2,periods:[7,8]},',
    ' {name:"医学伦理学",room:"D401",day:3,periods:[1,2]},',
    ' {name:"生物化学",room:"B210",day:3,periods:[5,6]},',
    ' {name:"诊断学",room:"C305",day:4,periods:[3,4]},',
    ' {name:"内科学",room:"A201",day:4,periods:[7,8]},',
    ' {name:"外科学",room:"B102",day:5,periods:[1,2]},',
    ' {name:"儿科学",room:"C101",day:5,periods:[5,6]}',
    '];',
    'for(var i=0;i<C.length;i++){C[i].weeks=[tw];}',
    'if(typeof DATA!=="undefined"){DATA.courses=C;}',
    'var T=[];var m=8*60;',
    'for(var p=1;p<=16;p++){',
    '  var a=Math.floor(m/60),b=m%60,c=m+45,d=Math.floor(c/60),e=c%60;',
    '  T.push((a<10?"0":"")+a+":"+(b<10?"0":"")+b+"~"+(d<10?"0":"")+d+":"+(e<10?"0":"")+e);',
    '  m=c+5;',
    '}',
    'if(typeof TIMES!=="undefined"){TIMES.length=0;for(var q=0;q<T.length;q++){TIMES.push(T[q]);}}',
    'try{if(typeof PERIODS!=="undefined"){PERIODS=16;}}catch(e){}',
    'try{curWeek=tw;}catch(e){}',
    'if(typeof renderWeek==="function"){renderWeek();}',
    /* 字段名照抄 app.js:842 —— 是 name 不是 title；end 必须是
     * 'YYYY-MM-DD HH:mm' 这种能被 String.replace(/-/g,'/') 吃掉的格式，
     * 写 ISO 的 T/Z 会解析失败、截止那行原样打印一串 ISO。 */
    'var now=Date.now();',
    'function ds(h){var d=new Date(now+h*3600e3);',
    '  function p(n){return (n<10?"0":"")+n;}',
    '  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes());}',
    'window.HOMEWORK={synced_at:Math.floor(Date.now()/1000)-1680,works:[',
    ' {name:"病理学实验报告",course:"病理学",status:"未提交",status_known:true,end:ds(36),left_hours:36,open:true},',
    ' {name:"药理学病例分析",course:"药理学",status:"未提交",status_known:true,end:ds(96),left_hours:96,open:true},',
    ' {name:"生理学章节测验",course:"生理学",status:"未提交",status_known:true,end:ds(240),left_hours:240,open:true},',
    ' {name:"医学伦理学论文",course:"医学伦理学",status:"已提交",status_known:true,end:ds(120),left_hours:120,open:false},',
    ' {name:"生物化学随堂测",course:"生物化学",status:"未提交",status_known:true,end:ds(12),left_hours:12,open:true}',
    '],exams:[',
    ' {name:"生理学阶段考",course:"生理学",status:"未开始",status_known:true,start:ds(72),end:ds(74)}',
    ']};',
    /* v2.8.0：这三个读数（#cnt / #srcTag / #termPick）平时是 load() 写进去的，
     * 夹具绕过 load() 直接改 DATA，它们就停在 HTML 里的初始「0 / 内置 / --」，
     * 实拍会拍出一个「课程数 0」的假状态。这里按真实运行时的口径补一遍。 */
    'try{window.HOMEWORK._source="multi";window.HOMEWORK.sources=[{state:"ok"},{state:"ok"},{state:"stale"}];}catch(e){}',
    'try{DATA._source="app";}catch(e){}',
    'try{DATA.term="2026-2027 学年第一学期";}catch(e){}',
    'try{document.getElementById("cnt").textContent=String(C.length);}catch(e){}',
    'try{document.getElementById("termPick").textContent=DATA.term||"--";}catch(e){}',
    'if(typeof renderHomework==="function"){renderHomework();}',
    'try{localStorage.setItem("xxmu_mytodo",JSON.stringify([',
    ' {id:"a1",text:"周三前交病理实验报告",due:"",done:false,at:now},',
    ' {id:"a2",text:"背完药理第三章",due:"",done:false,at:now},',
    ' {id:"a3",text:"问辅导员调课",due:"",done:true,at:now}',
    ']));}catch(e){}',
    'try{if(typeof LEARNPLUS!=="undefined"){LEARNPLUS.paintToday();}}catch(e){}',
    'try{if(typeof NOWLINE!=="undefined"){NOWLINE.paint();}}catch(e){}',
    'try{if(typeof MYTODO!=="undefined"){MYTODO.render();}}catch(e){}',
    'try{if(typeof switchTab==="function"){switchTab("' + tab + '");}}catch(e){}',
    /* admin 页默认只露一张口令卡，控制台本体（概览四个数 + 七个分段 + 停用/解封表单）
     * 是 app.js:4534「已存过口令就直接进面板」那段展开的。那条路走 XXMU.pref，
     * 而 pref 在没有 Host 的离线夹具里恒返回 ''，所以这里直接把 panel 打开，
     * 效果等同于「这台手机存过口令、但现在连不上服务器」：概览四个数是「--」、
     * 分段能点、表单在。这正是要看的排版状态，也不含任何真实数据。 */
    'try{if("' + tab + '"==="admin"){var p=document.getElementById("admPanel");' +
      'if(p){p.style.display="block";}}}catch(e){}',
    /* 二级页各有「进来后重画一次」的规矩，光 switchTab 拍到的是空壳：
     *   settings → THEME.paint() 写主题那几行的当前值
     *   guide    → GUIDE.render() 铺正文
     *   about    → About.refresh() 写版本行
     * admin 是 switchTab 内部自己进（app.js:4527），不用额外调。 */
    'try{if("' + tab + '"==="settings"&&typeof THEME!=="undefined"&&THEME.paint){THEME.paint();}}catch(e){}',
    'try{if("' + tab + '"==="guide"&&typeof GUIDE!=="undefined"&&GUIDE.render){GUIDE.render();}}catch(e){}',
    'try{if("' + tab + '"==="about"&&typeof About!=="undefined"&&About.refresh){About.refresh();}}catch(e){}',
    'setTimeout(function(){',
    '  try{',
    '    /* 量 main 的 scrollHeight 不是 body 的：app.css:115 #app{overflow:hidden}、',
    '     * :177 main{flex:1;overflow:auto} —— 滚动发生在 main 里，body 的 scrollHeight',
    '     * 恒等于视口（808），量它只会得到一张被底部导航压住截断的图。 */',
    '    var m=document.querySelector("main"), t=document.querySelector(".tab.active");',
    '    var hd=document.querySelector("header"), nv=document.querySelector("#tabs");',
    '    var ch=0;',
    '    if(m){ch=Math.max(ch, m.scrollHeight);}',
    '    if(t){ch=Math.max(ch, t.scrollHeight);}',
    '    if(!ch){ch=Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);}',
    '    /* header 与 #tabs 是 #app 里的 flex 兄弟（app.css:118 / :308），不在这段滚动区里，',
    '     * 必须单独加上；否则窗口高只够放内容，main 仍然滚动，最后一行被导航压掉。 */',
    '    var hSeen=ch+(hd?hd.offsetHeight:0)+(nv?nv.offsetHeight:0);',
    '    document.documentElement.setAttribute("data-shot-h", String(hSeen));',
    '  }catch(e){}',
    '},420);'
  ]);
}

function build(tab) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  h = h.replace('<head>', '<head><base href="file:///' + WEB.replace(/\\/g, '/') + '/">' + PRE);
  h = h.replace('</body>', QUIET + HIDE + body(tab) + '</body>');
  const f = path.join(WEB, '_tb_' + tab + '-' + skin + '-' + theme + '.html');
  fs.writeFileSync(f, h, 'utf8');
  return f;
}

function heightOf(htmlPath) {
  const out = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--window-size=390,900', '--virtual-time-budget=2400', '--dump-dom',
    'file:///' + htmlPath.replace(/\\/g, '/')
  ], { encoding: 'utf8', timeout: 180000 });
  const m = /data-shot-h="(\d+)"/.exec(out);
  const n = m ? parseInt(m[1], 10) : 0;
  /* 上限 3200 是给长截图兜底的，但「关于」页（权限与删除说明 + 更新日志 +
   * 开发者的三段话）实测比 3200 还长，卡在上限就是拍一半。抬到 6000 ——
   * Edge 对这么高的窗口没有硬限制，只是位图大一点。 */
  return Math.max(600, Math.min(6000, n || 900));
}

function shoot(htmlPath, name, h) {
  const out = path.join(SHOTS, name);
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--window-size=390,' + h, '--virtual-time-budget=2400',
    '--screenshot=' + out,
    'file:///' + htmlPath.replace(/\\/g, '/')
  ], { timeout: 180000 });
  return out;
}

if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const list = only ? [only] : TABS;
for (const t of list) {
  const f = build(t);
  const h = fixedH || heightOf(f);
  const out = shoot(f, 'uix-' + t + '-' + skin + '-' + theme + '.png', h);
  fs.unlinkSync(f);
  console.log(path.basename(out) + '  ' + fs.statSync(out).size + ' B  (390x' + h + ')');
}
