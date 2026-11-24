'use strict';
/* One-shot patch: add an `organ=admin` QA branch to make_nova_real.js so the
   REAL AdminUI render functions paint a 390px list card with fake tri-state
   rows. ASCII-only, same discipline as _patch_v1164_app.js. */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, 'make_nova_real.js');
let s = fs.readFileSync(P, 'utf8');
let hits = 0;

function once(from, to, label) {
  const c = s.split(from).length - 1;
  if (c !== 1) throw new Error('anchor [' + label + '] count=' + c);
  s = s.replace(from, to);
  hits++;
  console.log('ok  ' + label + '  x1');
}
function lines(arr, indent) {
  return arr.map(function (l) { return indent + "'" + l + "',"; }).join('\n');
}

/* 1) early flag, so the CSS is live before first paint */
const A_EARLY = '    if (organEarly==="polaroid") document.documentElement.setAttribute("data-shot-polaroid","1");';
const B_EARLY = A_EARLY + "',\n '    if (organEarly===\"admin\") document.documentElement.setAttribute(\"data-shot-admin\",\"1\");";
once(A_EARLY, B_EARLY, 'organEarly admin flag');

/* 2) QA-only CSS: collapse the long shot onto the list card */
const css = [
  '  /* v1.1.64 admin-list QA (fixture only): collapse the long shot to the',
  '     list card. Hide every other tab + the admin key/stats/seg chrome,',
  '     un-cap both scrollers, and show the calibration pane beside the normal',
  '     list so ONE 390x1500 frame covers confirmed / pending / conflict. */',
  '  html[data-shot-admin="1"] .tab:not(#tab-admin){display:none!important}',
  '  html[data-shot-admin="1"] #tab-admin{display:block!important;',
  '    padding-top:8px!important;padding-bottom:12px!important}',
  '  html[data-shot-admin="1"] #admKeyCard,',
  '  html[data-shot-admin="1"] .adm-stats,',
  '  html[data-shot-admin="1"] #admStatMsg,',
  '  html[data-shot-admin="1"] #admSeg{display:none!important}',
  '  html[data-shot-admin="1"] #admPanel{display:block!important}',
  '  html[data-shot-admin="1"] .adm-pane{display:none!important}',
  '  html[data-shot-admin="1"] #admP-list{display:block!important}',
  '  html[data-shot-admin="1"] #admOddPane{display:block!important}',
  '  html[data-shot-admin="1"] .adm-out{max-height:none!important;',
  '    overflow:visible!important}'
];
const A_CSS = "    scroll-behavior:auto!important}',\n'</style>',";
const B_CSS = "    scroll-behavior:auto!important}',\n" + lines(css, '  ') + "\n'</style>',";
once(A_CSS, B_CSS, 'admin QA css block');

/* 3) organ=admin branch: fake tri-state /v1/admin/list + real render chain */
const admin = [
  '      if (organ==="admin"){',
  '        if (typeof switchTab==="function") switchTab("admin");',
  '        var FAKE={ok:true,count:3,revokedCount:1,hidden:3,oddCount:3,',
  '          confirmedCount:3,pendingCount:2,conflictCount:1,',
  '          rows:[',
  '            {id:"20261440105",kb:"20261440105",at:1700000000,note:"",revoked:false},',
  '            {id:"20251100888",kb:"20251100777",at:1699000000,note:"",revoked:false},',
  '            {id:"20261440321",kb:"20261440321",at:1698000000,note:"",revoked:true}],',
  '          oddRows:[',
  '            {id:"123456789012",kb:"",at:1697000000,note:"",revoked:false,reason:"pending"},',
  '            {id:"20261440555",kb:"",at:1696000000,note:"",revoked:false,reason:"pending"},',
  '            {id:"20261440666",kb:"BAD",at:1695000000,note:"",revoked:false,reason:"conflict"}]};',
  '        /* synchronous thenable: no microtask / virtual-time dependency */',
  '        try { AUTH.Admin.list=function(){ return { then:function(ok){ try{ ok(FAKE); }catch(e){} return this; } }; }; } catch(e){}',
  '        var rb=document.getElementById("admListBtn"); if(rb) rb.click();',
  '        var ap=document.getElementById("admPanel"); if(ap) ap.style.display="block";',
  '        var lp=document.getElementById("admP-list"); if(lp) lp.style.display="block";',
  '        var op=document.getElementById("admOddPane"); if(op) op.style.display="block";',
  '      }'
];
const A_ADMIN = "'      if (organ===\"settings\"){',";
const B_ADMIN = lines(admin, '  ') + "\n'      if (organ===\"settings\"){',";
once(A_ADMIN, B_ADMIN, 'organ=admin branch');

fs.writeFileSync(P, s, 'utf8');
console.log('DONE  make_nova_real.js ' + s.length + ' chars, ' + hits + ' patches');
