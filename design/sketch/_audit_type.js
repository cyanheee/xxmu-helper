/* design/sketch/_audit_type.js -- audit every visible text node in the real
 * web/index.html: computed font-size, effective background, WCAG contrast.
 *
 * Purpose: stop guessing which text "looks too small" from a screenshot.
 * Numbers only. Anything under the floor gets printed with its selector path.
 *
 * node design/sketch/_audit_type.js [light|dark] [nova|classic] [tab]
 *
 * Floors used (390px wide phone, 1x DPR):
 *   font-size  >= 10px   (11px is the project floor, 10 tolerated for meta)
 *   contrast   >= 4.5    normal text
 *              >= 3.0    large text (>=18.66px bold, or >=24px)
 *              >= 3.0    tertiary / decorative is NOT exempt -- it is text
 *
 * The heavy lifting happens inside the page: walk elements, pick ones whose
 * own text is non-empty and visible, resolve the real background by climbing
 * until an opaque color is found, then run WCAG 2.1 relative luminance.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

const theme = (process.argv[2] || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';
const skin = (process.argv[3] || 'nova').toLowerCase() === 'classic' ? 'classic' : 'nova';
const only = (process.argv[4] || '').trim();
const TABS = only ? [only] : ['kb', 'learn', 'wiki', 'campus', 'me'];

function wrap(id, lines) {
  return '<script id="' + id + '">\ntry{\n' + lines.join('\n') + '\n}catch(e){document.title="ERR:"+e}\n</script>\n';
}

const PRE = wrap('auPre', [
  'try{',
  'localStorage.setItem("xxmu_skin","' + skin + '");',
  'localStorage.setItem("xxmu_theme","' + theme + '");',
  'localStorage.setItem("xxmu_onboard_done","1");',
  'localStorage.setItem("xxmu_tut_done","1");',
  'localStorage.setItem("xxmu_disc_done","1");',
  '}catch(e){}'
]);

const QUIET = wrap('auQuiet', [
  'for(var i=1;i<20000;i++){clearTimeout(i);clearInterval(i);}',
  'window.setInterval=function(){return 0;};',
  'window.requestAnimationFrame=function(){return 0;};',
  'window.fetch=function(){return new Promise(function(){});};',
  'try{XMLHttpRequest.prototype.send=function(){};}catch(e){}'
]);

const HIDE = wrap('auHide', [
  'var st=document.createElement("style");',
  'st.textContent="'
  + '#gate,#disc,#tut,#onb,#upd,#sheet,#eg-stage,.nv-tape-world,.nv-clip-world{display:none!important}'
  + 'html,body{width:390px!important;min-width:390px!important;overflow-x:hidden!important}'
  + '#app{width:390px!important;min-width:0!important;padding:0!important;margin:0!important}'
  + '";',
  'document.head.appendChild(st);'
]);

/* Same fixture shape as _shot_tabs.js -- field names copied from the data
 * source, never invented (app.js:842 uses name, end must be 'YYYY-MM-DD HH:mm'). */
function fixture(tab) {
  return wrap('auFix', [
    'function __auFix(){',
    'var ap=document.getElementById("app");',
    'if(ap){ap.classList.remove("locked");ap.style.display="";}',
    'var tw=(typeof WEEK!=="undefined"?WEEK:11);',
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
    'try{PERIODS=16;}catch(e){}',
    'try{curWeek=tw;}catch(e){}',
    'if(typeof renderWeek==="function"){renderWeek();}',
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
    'if(typeof renderHomework==="function"){renderHomework();}',
    'try{localStorage.setItem("xxmu_mytodo",JSON.stringify([',
    ' {id:"a1",text:"周三前交病理实验报告",due:"",done:false,at:now},',
    ' {id:"a2",text:"背完药理第三章",due:"",done:false,at:now},',
    ' {id:"a3",text:"问辅导员调课",due:"",done:true,at:now}',
    ']));}catch(e){}',
    'try{if(typeof LEARNPLUS!=="undefined"){LEARNPLUS.paintToday();}}catch(e){}',
    'try{if(typeof NOWLINE!=="undefined"){NOWLINE.paint();}}catch(e){}',
    'try{if(typeof MYTODO!=="undefined"){MYTODO.render();}}catch(e){}',
    'if(typeof switchTab==="function"){switchTab("' + tab + '");}',
    'try{if(typeof NOVA_ORGANS!=="undefined"&&NOVA_ORGANS.sync){NOVA_ORGANS.sync();}}catch(e){}',
    '}',
    '__auFix();',
    'window.addEventListener("load",function(){'
      + 'try{__auFix();}catch(e){}'
      + 'setTimeout(__auDump,140);'
      + '});'
  ]);
}

/* The audit itself. Runs after load + a settle tick so organ clones exist. */
const AUDIT = wrap('auDump', [
  'function __rgb(s){',
  '  var m=/rgba?\\(([^)]+)\\)/.exec(String(s||""));',
  '  if(!m) return null;',
  '  var p=m[1].split(",").map(function(x){return parseFloat(x);});',
  '  if(p.length<3||p.some(function(x){return !isFinite(x);})) return null;',
  '  return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};',
  '}',
  'function __lum(c){',
  '  function f(v){v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}',
  '  return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);',
  '}',
  'function __ratio(a,b){',
  '  var l1=__lum(a),l2=__lum(b);',
  '  if(l1<l2){var t=l1;l1=l2;l2=t;}',
  '  return (l1+0.05)/(l2+0.05);',
  '}',
  'function __mix(fg,bg){',
  '  if(!fg) return bg;',
  '  if(fg.a>=0.999) return fg;',
  '  return {r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1};',
  '}',
  'function __bgOf(el){',
  '  var cur=el, layers=[];',
  '  while(cur && cur.nodeType===1){',
  '    var cs=getComputedStyle(cur);',
  /* A painted gradient means the effective backdrop is not a flat colour.
   * Climbing past it would land on the white body and produce a fake cr=1.00
   * for white-on-dark headers, so bail out and mark the sample unmeasurable. */
  '    if(cs.backgroundImage && cs.backgroundImage!=="none"'
  + ' && /gradient/.test(cs.backgroundImage)){return null;}',
  '    var c=__rgb(cs.backgroundColor);',
  '    if(c && c.a>0) layers.push(c);',
  '    if(c && c.a>=0.999) break;',
  '    cur=cur.parentElement;',
  '  }',
  '  var base={r:255,g:255,b:255,a:1};',
  '  for(var i=layers.length-1;i>=0;i--) base=__mix(layers[i],base);',
  '  return base;',
  '}',
  'function __sel(el){',
  '  var s=el.tagName.toLowerCase();',
  '  if(el.id) s+="#"+el.id;',
  '  if(el.className&&typeof el.className==="string"){',
  '    s+="."+el.className.trim().split(/\\s+/).slice(0,3).join(".");',
  '  }',
  '  return s;',
  '}',
  'function __auDump(){',
  '  var out=[], seen=0, gradient=0, unmeas=0;',
  '  var all=document.querySelectorAll("main *, header *, #tabs *");',
  '  for(var i=0;i<all.length;i++){',
  '    var el=all[i];',
  '    var own="";',
  '    for(var k=0;k<el.childNodes.length;k++){',
  '      var n=el.childNodes[k];',
  '      if(n.nodeType===3) own+=n.nodeValue;',
  '    }',
  '    own=own.replace(/\\s+/g," ").trim();',
  '    if(!own) continue;',
  '    var r=el.getBoundingClientRect();',
  '    if(r.width<1||r.height<1) continue;',
  '    var cs=getComputedStyle(el);',
  '    if(cs.visibility==="hidden"||cs.display==="none") continue;',
  '    if(parseFloat(cs.opacity)===0) continue;',
  '    var fs=parseFloat(cs.fontSize)||0;',
  '    var fw=parseInt(cs.fontWeight,10)||400;',
  '    var bg=__bgOf(el);',
  '    if(!bg){unmeas++;continue;}',
  /* Gradient text: color is transparent and paint comes from background-clip.
   * There is no single colour to measure, so count it separately rather than
   * report a fake cr=1.00 (that was a false alarm on every NOVA heading). */
  '    var rawCol=__rgb(cs.color);',
  '    var fill=cs.webkitTextFillColor||cs.getPropertyValue("-webkit-text-fill-color");',
  '    var rawFill=__rgb(fill);',
  '    if(rawFill&&rawFill.a>0.01) rawCol=rawFill;',
  '    if(!rawCol||rawCol.a<0.01){',
  '      var gi=cs.backgroundImage||"";',
  '      if(!rawCol||/gradient/.test(gi)){gradient++;continue;}',
  '    }',
  '    var fg=__mix(rawCol,bg);',
  '    var cr=__ratio(fg,bg);',
  '    var big=(fs>=24)||(fs>=18.66&&fw>=700);',
  '    var floor=big?3.0:4.5;',
  '    seen++;',
  '    var bad=[];',
  '    if(fs<10) bad.push("tiny");',
  '    if(cr<floor) bad.push("lowcontrast");',
  '    if(cr<2.0) bad.push("verylow");',
  '    if(!bad.length) continue;',
  '    out.push(bad.join("+")+" fs="+fs.toFixed(1)+" fw="+fw',
  '      +" cr="+cr.toFixed(2)+" "+__sel(el)',
  '      +" ["+own.slice(0,26)+"]");',
  '  }',
  '  out.sort();',
  '  document.title="AUDIT|checked="+seen+"|bad="+out.length+"|grad="+gradient+",unmeas="+unmeas+"|"',
  '    +JSON.stringify(out.slice(0,120));',
  '}'
]);

function build(tab) {
  let h = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  let inject = QUIET + HIDE + fixture(tab) + AUDIT + '</body>';
  h = h.replace('<head>', '<head><base href="file:///' + WEB.replace(/\\/g, '/') + '/">' + PRE);
  h = h.replace('</body>', inject);
  const f = path.join(WEB, '_au_' + tab + '-' + skin + '-' + theme + '.html');
  fs.writeFileSync(f, h, 'utf8');
  return f;
}

let total = 0;
for (const t of TABS) {
  const f = build(t);
  let dom = '';
  try {
    dom = execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--allow-file-access-from-files',
      '--window-size=390,900', '--virtual-time-budget=2600', '--dump-dom',
      'file:///' + f.replace(/\\/g, '/')
    ], { encoding: 'utf8', timeout: 180000 });
  } finally {
    try { fs.unlinkSync(f); } catch (e) {}
  }
  const m = /<title>([\s\S]*?)<\/title>/.exec(dom);
  const title = m ? m[1].trim() : '(no title)';
  if (title.indexOf('AUDIT|') !== 0) { console.log(t + '  ' + title); continue; }
  const parts = title.split('|');
  const checked = parts[1] || '';
  const badCount = parseInt((parts[2] || '').replace('bad=', ''), 10) || 0;
  total += badCount;
  let list = [];
  try { list = JSON.parse(parts.slice(4).join('|')); } catch (e) { list = []; }
  const grad = (parts[3] || '').replace('grad=', '');
  console.log('=== ' + t + '  ' + skin + '/' + theme + '  ' + checked
    + '  bad=' + badCount + '  gradient-text=' + grad);
  list.forEach(function (x) { console.log('   ' + x); });
}
console.log('TOTAL_BAD=' + total);
