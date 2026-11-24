/* one-shot fixture patch: rewrite the organ==="polaroid" branch of
 * make_nova_real.js to the v1.1.63 paged rail DOM, add rail-window CSS,
 * and wire _gen_esc.js literals in via __TOKEN__ expansion.
 * Temp helper (leading underscore), run once, then leave it as a record. */
'use strict';
const fs = require('fs');
const path = require('path');
const GEN = require('./_gen_esc.js');
const f = path.join(__dirname, 'make_nova_real.js');
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

['pcaps','fbFrom','fbKind','fbText','fbReply','fbAt','labels','pills','misc']
  .forEach(k => { if (!Array.isArray(GEN.S[k])) throw new Error('missing S.' + k); });
const arr = list => '[' + list.map(GEN.esc).join(',') + ']';

function cut(marker, replacement) {
  const i = s.indexOf(marker);
  if (i < 0) throw new Error('missing marker: ' + marker);
  s = s.slice(0, i) + replacement + s.slice(i + marker.length);
}
function lineOf(marker) {
  const i = s.indexOf(marker);
  if (i < 0) throw new Error('missing line marker: ' + marker);
  if (s.indexOf(marker, i + 1) >= 0) throw new Error('ambiguous marker: ' + marker);
  return s.lastIndexOf('\n', i) + 1;
}

/* ---- A) build-time generator require -------------------------------- */
const skinLine = "const skin = process.argv[3] === 'classic' ? 'classic' : 'nova';";
cut(skinLine, skinLine + '\n' +
  '/* Chinese copy is escaped by _gen_esc.js at build time; this source and\n' +
  '   the browser-side harness stay ASCII-only (no Chinese literals). */\n' +
  "const GEN = require('./_gen_esc.js');\n" +
  "function arr(list){ return '[' + list.map(GEN.esc).join(',') + ']'; }");

/* ---- B) rail-window CSS, injected before the harness </style> -------- */
const railCss = `
  '  /* v1.1.63 WIKI rail QA (fixture only): the long shot flattens main to',
  '     height:auto, so pin the rails to a hard 390px horizontal window. This',
  '     keeps display:flex/nowrap from ever being flattened into a vertical',
  '     stack. Snap + smooth are off: virtual-time-budget never settles a',
  '     smooth scroll and mandatory snap would rewind the harness scrollLeft. */',
  '  .ph-rail,.fb-rail{display:flex!important;flex-direction:row!important;',
  '    flex-wrap:nowrap!important;width:390px!important;max-width:390px!important;',
  '    box-sizing:border-box!important;margin-inline:-12px!important;',
  '    overflow-x:auto!important;overflow-y:hidden!important;height:auto!important;',
  '    scroll-snap-type:none!important;scroll-behavior:auto!important;',
  '    scrollbar-width:none!important}',
  '  .ph-rail::-webkit-scrollbar,.fb-rail::-webkit-scrollbar{display:none!important}',
  '  .ph-rail{padding-inline:22px!important}',
  '  .fb-rail{padding-inline:18px!important}',
  '  .ph-page,.fb-page{flex:0 0 100%!important;box-sizing:border-box!important;',
  '    min-width:0!important;padding-right:8px!important;',
  '    scroll-snap-align:none!important}',
  '  .ph-rail .ph-grid,.fb-rail .fb-list{min-width:0!important}',
`.replace(/^\n/, '');
cut("'</style>',", railCss + "'</style>',");

/* ---- C) replace the whole old polaroid branch ----------------------- */
const newBranch = `
      '      if (organ==="polaroid"){',
      '        if (typeof switchTab==="function") switchTab("wiki");',
      '        var wb=document.getElementById("wikiBody");',
      '        var pcaps=__PCAPS__;',
      '        var hues=[205,28,255,165,330,18,190,95,48,272,140,15];',
      '        var fbFrom=__FBFROM__;',
      '        var fbKind=__FBKIND__;',
      '        var fbText=__FBTEXT__;',
      '        var fbReply=__FBREPLY__;',
      '        var fbAt=__FBAT__;',
      '        var LBL=__LBL__;',
      '        var PILL=__PILL__;',
      '        var MISC=__MISC__;',
      '        var qq=String.fromCharCode(39);',
      '        function E(tag,cls,txt){var e=document.createElement(tag);',
      '          if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e;}',
      '        function photoCard(i){',
      '          var c=E("div","ph-card");',
      '          var im=document.createElement("img"); im.className="ph-img"; im.alt=pcaps[i];',
      '          var hv=hues[i%hues.length];',
      '          var sv="<svg xmlns="+qq+"http://www.w3.org/2000/svg"+qq+" viewBox="+qq+"0 0 160 120"+qq+"><rect width="+qq+"160"+qq+" height="+qq+"120"+qq+" fill="+qq+"hsl("+hv+",13%,72%)"+qq+"/><circle cx="+qq+"120"+qq+" cy="+qq+"28"+qq+" r="+qq+"13"+qq+" fill="+qq+"hsl("+((hv+42)%360)+",18%,82%)"+qq+"/><path d="+qq+"M0 92 L44 56 L74 82 L108 58 L160 100 L160 120 L0 120 Z"+qq+" fill="+qq+"hsl("+((hv+205)%360)+",12%,46%)"+qq+"/></svg>";',
      '          im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(sv);',
      '          c.appendChild(im);',
      '          c.appendChild(E("div","ph-cap",pcaps[i]));',
      '          return c;',
      '        }',
      '        function fbCard(i){',
      '          var c=E("div","fb-card");',
      '          var top=E("div","fb-top");',
      '          top.appendChild(E("span","fb-from",fbFrom[i]));',
      '          top.appendChild(E("span","fb-kind",fbKind[i]));',
      '          top.appendChild(E("span","fb-at",fbAt[i]));',
      '          c.appendChild(top);',
      '          c.appendChild(E("div","fb-text",fbText[i]));',
      '          if(fbReply[i]){',
      '            var r=E("div","fb-reply");',
      '            r.appendChild(E("div","fb-reply-t",LBL[2]));',
      '            r.appendChild(E("div","fb-reply-b",fbReply[i]));',
      '            c.appendChild(r);',
      '          }',
      '          return c;',
      '        }',
      '        function dots(n,cls,onIdx){',
      '          var bar=E("div",cls);',
      '          for(var i=0;i<n;i++){var d=E("i"); if(i===onIdx) d.className="on";',
      '            bar.appendChild(d);}',
      '          return bar;',
      '        }',
      '        function head(title,p1,p2){',
      '          var h=E("div","ph-head");',
      '          h.appendChild(E("span","ph-title",title));',
      '          h.appendChild(E("button","pill",p1));',
      '          h.appendChild(E("button","pill",p2));',
      '          return h;',
      '        }',
      '        /* photo rail: 3 pages x 4 polaroids, middle page is the shot */',
      '        var phSec=E("div","ph-sec");',
      '        phSec.appendChild(head(LBL[0],PILL[0],PILL[1]));',
      '        var phRail=E("div","ph-rail");',
      '        for(var pg=0;pg<3;pg++){',
      '          var page=E("div","ph-page");',
      '          var grid=E("div","ph-grid");',
      '          for(var k=0;k<4;k++){',
      '            var hang=E("div","ph-hang");',
      '            hang.appendChild(photoCard(pg*4+k));',
      '            grid.appendChild(hang);',
      '          }',
      '          page.appendChild(grid);',
      '          phRail.appendChild(page);',
      '        }',
      '        phSec.appendChild(phRail);',
      '        phSec.appendChild(dots(3,"rail-dots ph-dots",1));',
      '        phSec.appendChild(E("p","hint left tight",LBL[3]));',
      '        /* feedback rail: 3 pages x 3 cards, middle page is the shot */',
      '        var fbSec=E("div","fb-sec");',
      '        fbSec.appendChild(head(LBL[1],PILL[2],PILL[3]));',
      '        fbSec.appendChild(E("p","hint left tight",LBL[4]));',
      '        var fbRail=E("div","fb-rail");',
      '        for(var fg=0;fg<3;fg++){',
      '          var fpage=E("div","fb-page");',
      '          var list=E("div","fb-list");',
      '          for(var j=0;j<3;j++) list.appendChild(fbCard(fg*3+j));',
      '          fpage.appendChild(list);',
      '          fbRail.appendChild(fpage);',
      '        }',
      '        fbSec.appendChild(fbRail);',
      '        fbSec.appendChild(dots(3,"rail-dots fb-dots",1));',
      '        if(wb){',
      '          wb.innerHTML="";',
      '          wb.appendChild(phSec);',
      '          wb.appendChild(fbSec);',
      '          var cat=E("div","wiki-cat",MISC[0]);',
      '          var wg=E("div","wiki-grid");',
      '          for(var mi=1;mi<MISC.length;mi++){',
      '            var wc=E("div","wiki-card");',
      '            wc.appendChild(E("div","wiki-t",MISC[mi]));',
      '            wc.__wiki={t:MISC[mi],cat:MISC[0],b:[],url:""};',
      '            wg.appendChild(wc);',
      '          }',
      '          wb.appendChild(cat); wb.appendChild(wg);',
      '        }',
      '        /* organ sync paints nv-polaroid-grid on EVERY .ph-grid (v1.1.63',
      '           querySelectorAll) and re-homes the polaroid bar into .ph-sec */',
      '        if (window.NOVA_ORGANS) NOVA_ORGANS.sync();',
      '        /* deterministic both-side peek: scroll exactly one page width so',
      '           page 2 is centered, page 1 tail + page 3 head each peek ~22px. */',
      '        function peek(rail){ if(!rail) return;',
      '          var p=rail.firstElementChild;',
      '          var w=p?p.getBoundingClientRect().width:0;',
      '          if(!w||w<50) w=346;',
      '          try{rail.scrollLeft=w;}catch(e){}',
      '          rail.setAttribute("data-shot-peek",String(Math.round(w)));',
      '        }',
      '        peek(document.querySelector(".ph-rail"));',
      '        peek(document.querySelector(".fb-rail"));',
      '      }',
`.replace(/^\n/, '');
const a = lineOf('if (organ==="polaroid"){');
const b = lineOf('if (organ==="settings"){');
s = s.slice(0, a) + newBranch + s.slice(b);

/* ---- D) expand tokens on the joined harness TEXT -------------------- */
const outLine = "out = out.replace('</body>', harness + '\\n</body>');";
cut(outLine,
  '/* Expand tokens on the joined harness text (plain text from here on, so a\n' +
  '   single \\uXXXX escape reaches the browser, which decodes it). */\n' +
  'const LITS = {\n' +
  '  __PCAPS__: arr(GEN.S.pcaps),\n' +
  '  __FBFROM__: arr(GEN.S.fbFrom),\n' +
  '  __FBKIND__: arr(GEN.S.fbKind),\n' +
  '  __FBTEXT__: arr(GEN.S.fbText),\n' +
  '  __FBREPLY__: arr(GEN.S.fbReply),\n' +
  '  __FBAT__: arr(GEN.S.fbAt),\n' +
  '  __LBL__: arr(GEN.S.labels),\n' +
  '  __PILL__: arr(GEN.S.pills),\n' +
  '  __MISC__: arr(GEN.S.misc)\n' +
  '};\n' +
  'let railHarness = harness;\n' +
  'Object.keys(LITS).forEach(function(k){ railHarness = railHarness.split(k).join(LITS[k]); });\n' +
  "out = out.replace('</body>', railHarness + '\\n</body>');");

fs.writeFileSync(f, s, 'utf8');
console.log('patched ' + f + ' (' + s.length + ' chars)');
