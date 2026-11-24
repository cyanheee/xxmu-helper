/* one-shot v2: converge the polaroid branch to a 3-page rail whose MIDDLE
 * page is on screen, so BOTH neighbours peek. Chinese copy comes from
 * _gen_esc.js via __TOKEN__ expansion (LITS at the tail already does it).
 * Temp helper (leading underscore), kept as a record. */
'use strict';
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, 'make_nova_real.js');
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

function lineOf(marker) {
  const i = s.indexOf(marker);
  if (i < 0) throw new Error('missing marker: ' + marker);
  if (s.indexOf(marker, i + 1) >= 0) throw new Error('ambiguous marker: ' + marker);
  return s.lastIndexOf('\n', i) + 1;
}

/* pure browser-side JS lines; tokens are expanded by the existing LITS map */
const L = [
  '      if (organ==="polaroid"){',
  '        document.documentElement.setAttribute("data-shot-polaroid","1");',
  '        if (typeof switchTab==="function") switchTab("wiki");',
  '        var wb=document.getElementById("wikiBody");',
  '        var pcaps=__PCAPS__;',
  '        var ff=__FBFROM__;',
  '        var fk=__FBKIND__;',
  '        var ft=__FBTEXT__;',
  '        var frp=__FBREPLY__;',
  '        var fa=__FBAT__;',
  '        var LBL=__LBL__;',
  '        var PILL=__PILL__;',
  '        var qq=String.fromCharCode(39);',
  '        var hues=[205,28,255,165,330,18,190,95,48,272,140,15];',
  '        function E(tag,cls,txt){var e=document.createElement(tag);',
  '          if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e;}',
  '        function mkImg(hv,i){',
  '          var sv="<svg xmlns="+qq+"http://www.w3.org/2000/svg"+qq+" viewBox="+qq+"0 0 160 120"+qq+"><rect width="+qq+"160"+qq+" height="+qq+"120"+qq+" fill="+qq+"hsl("+hv+",13%,72%)"+qq+"/><circle cx="+qq+"120"+qq+" cy="+qq+"28"+qq+" r="+qq+"13"+qq+" fill="+qq+"hsl("+((hv+42)%360)+",18%,82%)"+qq+"/><path d="+qq+"M0 92 L44 56 L74 82 L108 58 L160 100 L160 120 L0 120 Z"+qq+" fill="+qq+"hsl("+((hv+205)%360)+",12%,46%)"+qq+"/></svg>";',
  '          var im=document.createElement("img"); im.className="ph-img"; im.alt=pcaps[i];',
  '          im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(sv); return im;',
  '        }',
  '        function mkDots(n,cls,onIdx){var d=E("div",cls);',
  '          for(var i=0;i<n;i++){var e=E("i"); if(i===onIdx)e.className="on";',
  '            d.appendChild(e);} return d;}',
  '        function mkHead(title,p1,p2){var h=E("div","ph-head");',
  '          h.appendChild(E("span","ph-title",title));',
  '          h.appendChild(E("button","pill",p1));',
  '          h.appendChild(E("button","pill",p2)); return h;}',
  '        function mkHint(t){return E("p","hint left tight",t);}',
  '        function photoCard(i){var c=E("div","ph-card");',
  '          c.appendChild(mkImg(hues[i%hues.length],i));',
  '          c.appendChild(E("div","ph-cap",pcaps[i])); return c;}',
  '        function fbCard(i){',
  '          var c=E("div","fb-card"); var top=E("div","fb-top");',
  '          top.appendChild(E("span","fb-from",ff[i]));',
  '          top.appendChild(E("span","fb-kind",fk[i]));',
  '          top.appendChild(E("span","fb-at",fa[i]));',
  '          c.appendChild(top); c.appendChild(E("div","fb-text",ft[i]));',
  '          if(frp[i]){var r=E("div","fb-reply");',
  '            r.appendChild(E("div","fb-reply-t",LBL[2]));',
  '            r.appendChild(E("div","fb-reply-b",frp[i]));',
  '            c.appendChild(r);} return c;',
  '        }',
  '        /* photo rail: 3 pages x 4 polaroids, middle page is the shot */',
  '        var psec=document.querySelector(".ph-sec");',
  '        if(!psec){psec=E("div","ph-sec"); if(wb)wb.appendChild(psec);}',
  '        var ph=psec.querySelector(".ph-head"); psec.innerHTML="";',
  '        psec.appendChild(ph||mkHead(LBL[0],PILL[0],PILL[1]));',
  '        var prail=E("div","ph-rail");',
  '        for(var pg=0;pg<3;pg++){',
  '          var ppage=E("div","ph-page"); var grid=E("div","ph-grid");',
  '          for(var k=0;k<4;k++){var hang=E("div","ph-hang");',
  '            hang.appendChild(photoCard(pg*4+k)); grid.appendChild(hang);}',
  '          ppage.appendChild(grid); prail.appendChild(ppage);',
  '        }',
  '        psec.appendChild(prail);',
  '        psec.appendChild(mkDots(3,"rail-dots ph-dots",1));',
  '        psec.appendChild(mkHint(LBL[3]));',
  '        /* feedback rail: 3 pages x 3 cards, middle page is the shot */',
  '        var fsec=document.querySelector(".fb-sec");',
  '        if(!fsec){fsec=E("div","fb-sec"); if(wb)wb.appendChild(fsec);}',
  '        var fh=fsec.querySelector(".ph-head"); fsec.innerHTML="";',
  '        fsec.appendChild(fh||mkHead(LBL[1],PILL[2],PILL[3]));',
  '        fsec.appendChild(mkHint(LBL[4]));',
  '        var frail=E("div","fb-rail");',
  '        for(var fg=0;fg<3;fg++){',
  '          var fpage=E("div","fb-page"); var list=E("div","fb-list");',
  '          for(var j=0;j<3;j++) list.appendChild(fbCard(fg*3+j));',
  '          fpage.appendChild(list); frail.appendChild(fpage);',
  '        }',
  '        fsec.appendChild(frail);',
  '        fsec.appendChild(mkDots(3,"rail-dots fb-dots",1));',
  '        if (window.NOVA_ORGANS) NOVA_ORGANS.sync();',
  '        /* deterministic both-side peek: move exactly one page width so the',
  '           middle page is centered and both neighbours peek ~22px. */',
  '        function peek(rail){',
  '          if(!rail) return;',
  '          var p=rail.firstElementChild;',
  '          var w=p?p.getBoundingClientRect().width:0;',
  '          if(!w||w<50) w=346;',
  '          try{rail.scrollLeft=w;}catch(e){}',
  '          rail.setAttribute("data-shot-peek",String(Math.round(w)));',
  '          rail.setAttribute("data-shot-scroll",String(Math.round(rail.scrollLeft)));',
  '        }',
  '        peek(document.querySelector(".ph-rail"));',
  '        peek(document.querySelector(".fb-rail"));',
  '      }'
];
const newBranch = L.map(function (line) {
  return "  '" + line.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "',";
}).join('\n') + '\n';

const a = lineOf('if (organ==="polaroid"){');
const b = lineOf('if (organ==="settings"){');
s = s.slice(0, a) + newBranch + s.slice(b);

/* update the stale CSS comment (rules themselves stay: horizontal clip,
 * snap+smooth off are exactly what a static middle-page scrollLeft needs) */
const oldCmt = "  '     disable snap/smooth so the static frame sits exactly on page 1 */',";
const newCmt = "  '     disable snap/smooth so the harness scrollLeft lands on the middle page */',";
if (!s.includes(oldCmt)) throw new Error('missing css comment');
s = s.replace(oldCmt, newCmt);

fs.writeFileSync(f, s, 'utf8');
console.log('patched v2 ' + f + ' (' + s.length + ' chars), branch lines=' + L.length);
