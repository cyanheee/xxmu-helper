/* make_photo_rot_qa.js - standalone visual QA fixture for v1.1.62 photo rotation.
 *
 * Loads the REAL web/index.html <head> (all CSS links, same order) with all
 * <script> stripped, hard-writes data-skin/data-theme on <html>, and replaces
 * the body with:
 *   (1) a 2x2 grid of .img-frame.rev-frame[data-rot=0/90/180/270] over a
 *       direction-marked 4:3 test image -> proves the rotation math real,
 *   (2) the REAL #revPhotoList.rev-list.rev-photos carousel + #revPhotoNav,
 *       with one sideways (rot=90) photo card containing the real .rev-rot
 *       editor buttons and .rev-acts,
 *   (3) a #revFbList.rev-list (plain, stays vertical) to prove no regression.
 *
 * Pure QA fixture. Nothing under web/ is modified. Output written to files,
 * never piped through PowerShell (that path once mangled CJK into mojibake).
 *
 *   node design/sketch/make_photo_rot_qa.js light nova
 *   node design/sketch/make_photo_rot_qa.js dark  nova
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const theme = process.argv[2] === 'dark' ? 'dark' : 'light';
const skin = process.argv[3] === 'classic' ? 'classic' : 'nova';

/* ---- direction-marked 4:3 test image (1600x1200), as inline SVG data URI ----
   TL=red, TR=green, BL=blue, BR=gold; big "F"; "TOP" text + up arrow at top,
   "GROUND" at bottom. After a 90/180/270 rotate the marker positions must
   move exactly one corner per 90 deg, with NO letterbox gaps in the 4:3 frame. */
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200">',
  '<rect width="1600" height="1200" fill="#E3EBE8"/>',
  '<g stroke="#AEC3BD" stroke-width="3">',
  '<path d="M0 300H1600M0 600H1600M0 900H1600M400 0V1200M800 0V1200M1200 0V1200"/>',
  '</g>',
  '<rect x="0" y="0" width="240" height="190" fill="#E8402A"/>',
  '<rect x="1360" y="0" width="240" height="190" fill="#2E9E4F"/>',
  '<rect x="0" y="1010" width="240" height="190" fill="#2C5C7A"/>',
  '<rect x="1360" y="1010" width="240" height="190" fill="#D9A32B"/>',
  '<text x="800" y="150" font-size="96" text-anchor="middle" fill="#1C2B30" font-family="sans-serif" font-weight="bold">TOP / UP</text>',
  '<path d="M800 190 L880 320 L720 320 Z" fill="#E8402A"/>',
  '<text x="800" y="700" font-size="360" text-anchor="middle" fill="#1C2B30" font-family="sans-serif" font-weight="bold">F</text>',
  '<text x="800" y="1000" font-size="96" text-anchor="middle" fill="#1C2B30" font-family="sans-serif" font-weight="bold">GROUND</text>',
  '</svg>'
].join('');
const IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

const ROTS = [
  { r: 0,   t: 'rot 0 / original' },
  { r: 90,  t: 'rot 90 / right' },
  { r: 180, t: 'rot 180 / flip' },
  { r: 270, t: 'rot 270 / left' }
];

function frame(rot) {
  return '<div class="img-frame rev-frame" data-rot="' + rot + '">' +
    '<img class="rev-img" alt="qa" src="' + IMG + '">' +
    '</div>';
}

let grid = '';
ROTS.forEach(function (o) {
  grid += '<div class="qa-cell">' + frame(o.r) +
    '<div class="qa-lab">' + o.t + '</div></div>';
});

/* one real carousel card: sideways photo (rot=90) with editor + acts */
function card(rot, idx, n) {
  return '<div class="rev-item">' +
    frame(rot) +
    '<div class="rev-meta"><span class="adm-tag">待审</span> ' +
      '<span>学号 0224</span> <span>1600×1200</span></div>' +
    '<div class="rev-cap">南校区 2 号公寓楼下（横躺原图）</div>' +
    '<div class="rev-rot"><span class="rev-rot-lab">方向</span>' +
      '<button class="btn ghost btn-sm">↺ 左转</button>' +
      '<button class="btn ghost btn-sm">↻ 右转</button>' +
      '<button class="btn ghost btn-sm">⟳ 180°</button>' +
      '<button class="btn ghost btn-sm">还原</button>' +
      '<button class="btn btn-sm">保存方向</button></div>' +
    '<div class="rev-acts">' +
      '<button class="btn">通过</button>' +
      '<button class="btn ghost">改说明</button>' +
      '<button class="btn ghost">删除</button></div>' +
    '</div>';
}

const carousel =
  '<div id="revPhotoList" class="rev-list rev-photos">' +
    card(90, 1, 4) + card(180, 2, 4) + card(270, 3, 4) + card(0, 4, 4) +
  '</div>' +
  '<div id="revPhotoNav" class="rev-nav">' +
    '<button id="revPrev" class="btn ghost btn-sm">‹ 上一张</button>' +
    '<span id="revPhotoPos" class="rev-pos">第 1 / 4 张</span>' +
    '<button id="revNext" class="btn ghost btn-sm">下一张 ›</button>' +
  '</div>';

const fbList =
  '<div id="revFbList" class="rev-list">' +
    '<div class="rev-item"><div class="rev-meta">学号 8801 · 11/09</div>' +
      '<div class="rev-text">建议加一个空教室查询，谢谢！</div></div>' +
    '<div class="rev-item"><div class="rev-meta">学号 3312 · 11/08</div>' +
      '<div class="rev-text">接水页面能不能记住上次选的机器？</div></div>' +
  '</div>';

const qaCss = [
  '<style id="qaRotCss">',
  '  html,body{width:390px!important;max-width:390px!important;min-width:390px!important;',
  '    height:auto!important;overflow-x:hidden!important}',
  '  body{margin:0!important;padding:0!important}',
  '  #app{position:static!important;display:block!important;overflow:visible!important}',
  '  .qa-wrap{padding:12px 12px 24px}',
  '  .qa-h{font:700 16px/1.3 sans-serif;color:var(--ink);margin:8px 0 2px}',
  '  .qa-sub{font:12px/1.45 sans-serif;color:var(--ink2);margin:0 0 10px}',
  '  .qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}',
  '  .qa-cell{background:var(--surface2);border:1px solid var(--line);border-radius:8px;padding:6px}',
  '  .qa-lab{font:700 11px/1.3 sans-serif;color:var(--ink);text-align:center;margin:5px 0 1px}',
  '  .qa-sep{height:1px;background:var(--line);margin:14px 0}',
  '  .qa-flag{display:inline-block;font:700 11px/1.3 sans-serif;color:#fff;',
  '    background:#2E6E76;border-radius:5px;padding:2px 7px;margin-bottom:6px}',
  '  #revPhotoNav{display:flex!important}',
  '  .adm-tag{display:inline-block;background:var(--surface);border:1px solid var(--line);',
  '    border-radius:6px;padding:1px 6px;font-size:11px;color:var(--ink2)}',
  '</style>'
].join('\n');

const body =
  '<body><div id="app"><main class="qa-wrap">' +
    '<div class="qa-flag">v1.1.62 · ' + skin + ' · ' + theme + '</div>' +
    '<div class="qa-h">1 · 四档旋转（2×2 核对 4:3 数学）</div>' +
    '<div class="qa-sub">红=左上 绿=右上 蓝=左下 金=右下；每转 90° 角标应挪一格，边框不许留白或溢出。</div>' +
    '<div class="qa-grid">' + grid + '</div>' +
    '<div class="qa-sep"></div>' +
    '<div class="qa-h">2 · 横滑审阅（真实布局，只显示第 1 张）</div>' +
    '<div class="qa-sub">左右滑动看下一张；下面一排是方向编辑与通过/改说明/删除。</div>' +
    '<div class="card">' + carousel + '</div>' +
    '<div class="qa-sep"></div>' +
    '<div class="qa-h">3 · 留言板（保持纵向，验证不塌）</div>' +
    '<div class="card">' + fbList + '</div>' +
  '</main></div></body>';

/* take everything before <body>, drop every <script>, inject base + qa css */
let head = src.slice(0, src.indexOf('<body>'));
head = head.replace(/<script[\s\S]*?<\/script>/g, '');
head = head.replace('<html lang="zh-CN">',
  '<html lang="zh-CN" data-skin="' + skin + '" data-theme="' + theme + '">');
head = head.replace('<head>', '<head>\n<base href="../../web/">\n' + qaCss);

const out = head + body + '\n</html>';
const name = 'photo-rot-qa-' + skin + '-' + theme + '.html';
fs.writeFileSync(path.join(__dirname, name), out, 'utf8');
console.log('ok ' + name + ' (' + out.length + ' chars)');
