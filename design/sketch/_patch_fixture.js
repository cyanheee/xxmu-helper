/* throwaway: patch make_nova_real.js polaroid branch -> v1.1.63 rail DOM */
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'make_nova_real.js');
let s = fs.readFileSync(p, 'utf8');

function esc(x) {
  return Array.from(x).map(function (c) {
    var n = c.codePointAt(0);
    return n > 127 ? '\\u' + n.toString(16).toUpperCase().padStart(4, '0') : c;
  }).join('');
}
function qarr(name, arr) {
  return '        var ' + name + '=[' + arr.map(function (x) { return '"' + esc(x) + '"'; }).join(',') + '];';
}

var pcaps = ['秋叶小径', '临湖晨读', '后山晚云', '银杏大道', '图书馆暮色', '操场晚风', '校门晨光', '实验楼窗台'];
var ff = ['21级临床', '22级药学', '大一新生', '图书馆常客', '匿名同学'];
var fk = ['优化建议', '问题反馈', '优化建议', '吐槽', '感谢'];
var ft = ['课表能不能加个周数切换，一目了然', '教务登录有时候会超时，多点几次才好', '希望 WIKI 能多放点校园照片', '食堂人流能不能也做个提示', 'WIKI 照片墙这个横滑挺好看的，赞。'];
var frp = ['已记录，下个版本排上', '已修复超时重试', '欢迎投稿校园实景', '收到，会考虑', '谢谢，多提意见'];

var L = [];
L.push('      if (organ==="polaroid"){');
L.push('        document.documentElement.setAttribute("data-shot-polaroid","1");');
L.push('        if (typeof switchTab==="function") switchTab("wiki");');
L.push('        var wb=document.getElementById("wikiBody");');
L.push(qarr('pcaps', pcaps));
L.push(qarr('ff', ff));
L.push(qarr('fk', fk));
L.push(qarr('ft', ft));
L.push(qarr('frp', frp));
L.push('        var hintPh="' + esc('这些是同学自己拍的。上传后要管理员审核通过才会公开，只放校园实景，别放人脸和宿舍内部。') + '";');
L.push('        var hintFb="' + esc('想加功能、发现 bug、资料有错，都可以在这里说，不用加群。管理员回复后会显示在下面。') + '";');
L.push('        var adminReply="' + esc('管理员回复') + '";');
L.push('        var qq=String.fromCharCode(39);');
L.push('        var hues=[28,205,255,165,42,120,300,88];');
L.push('        function mkImg(hv){');
L.push('          var sv="<svg xmlns="+qq+"http://www.w3.org/2000/svg"+qq+" viewBox="+qq+"0 0 160 120"+qq+"><rect width="+qq+"160"+qq+" height="+qq+"120"+qq+" fill="+qq+"hsl("+hv+",13%,72%)"+qq+"/><circle cx="+qq+"120"+qq+" cy="+qq+"28"+qq+" r="+qq+"13"+qq+" fill="+qq+"hsl("+(hv+42)+",18%,82%)"+qq+"/><path d="+qq+"M0 92 L44 56 L74 82 L108 58 L160 100 L160 120 L0 120 Z"+qq+" fill="+qq+"hsl("+(hv+205)+",12%,46%)"+qq+"/></svg>";');
L.push('          var im=document.createElement("img"); im.className="ph-img"; im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(sv); return im;');
L.push('        }');
L.push('        function mkDots(n,cls){var d=document.createElement("div"); d.className=cls; for(var i=0;i<n;i++){var e=document.createElement("i"); if(i===0)e.className="on"; d.appendChild(e);} return d;}');
L.push('        function mkPill(t){var b=document.createElement("button"); b.className="pill"; b.textContent=t; return b;}');
L.push('        function mkHead(title,p1,p2){var h=document.createElement("div"); h.className="ph-head"; var t=document.createElement("span"); t.className="ph-title"; t.textContent=title; h.appendChild(t); h.appendChild(mkPill(p1)); h.appendChild(mkPill(p2)); return h;}');
L.push('        function mkHint(t){var e=document.createElement("p"); e.className="hint left tight"; e.textContent=t; return e;}');
// ---- photo rail: 8 prints = 2 pages of 4 ----
L.push('        var psec=document.querySelector(".ph-sec");');
L.push('        if(!psec){psec=document.createElement("div"); psec.className="ph-sec"; if(wb)wb.appendChild(psec);}');
L.push('        var ph=psec.querySelector(".ph-head"); psec.innerHTML="";');
L.push('        psec.appendChild(ph||mkHead("' + esc('校园实景') + '","' + esc('↻ 刷新') + '","' + esc('+ 传一张') + '"));');
L.push('        var prail=document.createElement("div"); prail.className="ph-rail";');
L.push('        for(var pgi=0;pgi<2;pgi++){');
L.push('          var ppage=document.createElement("div"); ppage.className="ph-page";');
L.push('          var pgrid=document.createElement("div"); pgrid.className="ph-grid";');
L.push('          for(var pj=0;pj<4;pj++){');
L.push('            var pi=pgi*4+pj;');
L.push('            var hang=document.createElement("div"); hang.className="ph-hang";');
L.push('            var pc=document.createElement("div"); pc.className="ph-card";');
L.push('            var im=mkImg(hues[pi]); im.alt=pcaps[pi]; pc.appendChild(im);');
L.push('            var cap=document.createElement("div"); cap.className="ph-cap"; cap.textContent=pcaps[pi]; pc.appendChild(cap);');
L.push('            hang.appendChild(pc); pgrid.appendChild(hang);');
L.push('          }');
L.push('          ppage.appendChild(pgrid); prail.appendChild(ppage);');
L.push('        }');
L.push('        psec.appendChild(prail); psec.appendChild(mkDots(2,"rail-dots ph-dots")); psec.appendChild(mkHint(hintPh));');
// ---- feedback rail: 5 notes = 2 pages of 3+2 ----
L.push('        var fsec=document.querySelector(".fb-sec");');
L.push('        if(!fsec){fsec=document.createElement("div"); fsec.className="fb-sec"; if(wb)wb.appendChild(fsec);}');
L.push('        var fh=fsec.querySelector(".ph-head"); fsec.innerHTML="";');
L.push('        fsec.appendChild(fh||mkHead("' + esc('留言板') + '","' + esc('↻ 刷新') + '","' + esc('+ 说两句') + '"));');
L.push('        fsec.appendChild(mkHint(hintFb));');
L.push('        var frail=document.createElement("div"); frail.className="fb-rail";');
L.push('        for(var fgi=0;fgi<2;fgi++){');
L.push('          var fpage=document.createElement("div"); fpage.className="fb-page";');
L.push('          var flist=document.createElement("div"); flist.className="fb-list";');
L.push('          var cnt=fgi===0?3:2;');
L.push('          for(var fj=0;fj<cnt;fj++){');
L.push('            var fi=fgi*3+fj;');
L.push('            var fc=document.createElement("div"); fc.className="fb-card";');
L.push('            var top=document.createElement("div"); top.className="fb-top";');
L.push('            var a=document.createElement("span"); a.className="fb-from"; a.textContent=ff[fi]; top.appendChild(a);');
L.push('            var b=document.createElement("span"); b.className="fb-kind"; b.textContent=fk[fi]; top.appendChild(b);');
L.push('            var c=document.createElement("span"); c.className="fb-at"; c.textContent="11-10 18:4"+fi; top.appendChild(c);');
L.push('            fc.appendChild(top);');
L.push('            var tx=document.createElement("div"); tx.className="fb-text"; tx.textContent=ft[fi]; fc.appendChild(tx);');
L.push('            if(fi%2===0){var rp=document.createElement("div"); rp.className="fb-reply"; var rt=document.createElement("div"); rt.className="fb-reply-t"; rt.textContent=adminReply; rp.appendChild(rt); var rb=document.createElement("div"); rb.className="fb-reply-b"; rb.textContent=frp[fi]; rp.appendChild(rb); fc.appendChild(rp);}');
L.push('            flist.appendChild(fc);');
L.push('          }');
L.push('          fpage.appendChild(flist); frail.appendChild(fpage);');
L.push('        }');
L.push('        fsec.appendChild(frail); fsec.appendChild(mkDots(2,"rail-dots fb-dots"));');
L.push('        if (window.NOVA_ORGANS) NOVA_ORGANS.sync();');
L.push('      }');

/* Escapes live one level deeper: the harness array is a JS string that is
   later joined into an inline <script>. Chinese must survive as literal
   \uXXXX in the emitted HTML, so double every backslash when writing the
   make_nova_real.js source line (matches the existing var zh=["\\u..."]). */
var newBlock = L.map(function (c) {
  return "  '" + c.replace(/\\/g, '\\\\') + "',";
}).join('\n') + '\n';

// 1) replace the old polaroid branch (up to the settings branch)
var startMark = '      if (organ==="polaroid"){';
var si = s.indexOf(startMark);
if (si < 0) { console.error('POLAROID START NOT FOUND'); process.exit(1); }
si = s.lastIndexOf('\n', si) + 1;              // line start of the polaroid line
var setMark = s.indexOf('      if (organ==="settings"){', si);
if (setMark < 0) { console.error('SETTINGS MARK NOT FOUND'); process.exit(1); }
var ei = s.lastIndexOf('\n', setMark) + 1;      // line start of settings line (keep it)
s = s.slice(0, si) + newBlock + s.slice(ei);

// 2) shot-state CSS right before </style>
var cssAnchor = "'</style>',";
var cssLines = [
  "  '  /* v1.1.63 polaroid rails: keep horizontal clip so page 2 peeks,',",
  "  '     disable snap/smooth so the static frame sits exactly on page 1 */',",
  "  '  html[data-shot-polaroid=\"1\"] .ph-rail,',",
  "  '  html[data-shot-polaroid=\"1\"] .fb-rail{overflow-x:auto!important;',",
  "  '    overflow-y:hidden!important;scroll-snap-type:none!important;',",
  "  '    scroll-behavior:auto!important}',"
].join('\n') + '\n';
if (s.indexOf(cssAnchor) < 0) { console.error('CSS ANCHOR NOT FOUND'); process.exit(1); }
s = s.replace(cssAnchor, cssLines + cssAnchor);

// 3) early JS: set data-shot-polaroid before first paint (line-based, robust)
var lines = s.split('\n');
var idx = lines.findIndex(function (l) { return l.indexOf('organEarly==="focus"') >= 0; });
if (idx >= 0) {
  lines.splice(idx + 1, 0,
    "  '    if (organEarly===\"polaroid\") document.documentElement.setAttribute(\"data-shot-polaroid\",\"1\");',");
}
s = lines.join('\n');

fs.writeFileSync(p, s, 'utf8');
console.log('patched ok, bytes=' + Buffer.byteLength(s, 'utf8'));
