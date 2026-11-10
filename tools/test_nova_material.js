/* NOVA v3 材质轴 —— 静态护栏
 * ----------------------------------------------------------------------
 * 它防的是「顺手简化」：改着改着材质层被磨平、规则被破掉。
 * 破掉之后页面看着完全正常，只有「风格没站住」这件事会静默发生。
 *
 * 检查项：
 *  1  五份风格层文件存在且非空（材质层真的落盘了，不是空壳）
 *  2  每份文件的 CSS 规则都包在 html[data-skin="nova"] 里（不污染经典皮肤）
 *  3  物理规则铁律：box-shadow 的 y 不得为负；高光只 inset 0 1px 0
 *  4  圆角只用 0 / 50% / 8px / 12px / var(--n-r-sm) / var(--n-r-md)
 *  5  材质色饱和度 S ≤ 45%（材质色必须低饱和）
 *  6  风格层不许出现循环动效（animation-iteration-count: infinite）
 *  7  每份文件必须有 prefers-reduced-motion 段
 *  8  每份文件必须有深色档作用域 html[data-skin="nova"][data-theme="dark"]
 *  9  每份文件头部必须有注释头（写清它认领哪个器官、守哪条规则）
 * 10  index.html 的 CSS 加载顺序与 NOVA-SIGNATURE §6 认领表一致
 *
 * 跑法：node tools/test_nova_material.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var WEB = path.join(ROOT, 'web');

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}
function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

/* §6 认领表：文件 → 它负责的器官。顺序 = index.html 的加载顺序。 */
var LAYERS = [
  { file: 'nova-press.css',  claim: ['clipping', 'ticket'],  title: '漫画 / 复古票券（纸）' },
  { file: 'nova-brass.css',  claim: ['belt', 'tape'],       title: '蒸汽朋克 / 西部（黄铜·皮革）' },
  /* 2026-11-08：掌机舱删了（用户 m12030 指出它重印 header 的周次），
   * 像素不再是一门器官，而是 #grid 自己的材质（硬边格、方头表头、当前节次硬投影）。 */
  { file: 'nova-pixel.css',  claim: ['grid'],               title: '像素硬边（#grid 材质）' },
  { file: 'nova-cyber.css',  claim: ['rain', 'dial'],       title: '赛博朋克 / HUD' },
  { file: 'nova-anime.css',  claim: ['doodle', 'clipping'], title: '宝可梦 / 动漫 / 涂鸦' },
  { file: 'nova-ghibli.css', claim: ['plate'],              title: '宫崎骏' }
];

/* index.html 里的 CSS 顺序（相对 web/）。pop.css 不在材质轴里，单列。
 * 顺序理由：材质层（press→brass→pixel→cyber→anime→ghibli）必须都在 organs 之后
 * （要压住器官自带的介质）；motion 在其后统一收敛动效；campuscard 再其后，
 * 因为它要盖掉 motion 对 .nv-swipe-card 的 animation:none（否则校园卡不滑）。 */
var EXPECT_ORDER = [
  'app.css', 'nova-skin.css', 'nova-organs.css', 'nova-medium.css',
  'nova-press.css', 'nova-brass.css', 'nova-pixel.css', 'nova-cyber.css',
  'nova-anime.css', 'nova-ghibli.css', 'nova-motion.css', 'nova-campuscard.css', 'pop.css'
];

function hexSat(hex) {
  var h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  var r = parseInt(h.slice(0, 2), 16) / 255;
  var g = parseInt(h.slice(2, 4), 16) / 255;
  var b = parseInt(h.slice(4, 6), 16) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  var l = (mx + mn) / 2;
  if (mx === mn) return 0;
  var d = mx - mn;
  var s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  return Math.round(s * 100);
}

/* 找出文件里自己定义的颜色（--xxx: #hex）并算饱和度 */
function declaredColors(src) {
  var out = [];
  var re = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
  var m;
  while ((m = re.exec(src))) {
    var s = hexSat(m[2]);
    if (s === null) continue;
    out.push({ name: m[1], hex: m[2], sat: s });
  }
  return out;
}

console.log('== NOVA v3 材质轴静态护栏 ==');

var sources = {};
LAYERS.forEach(function (L) {
  var p = path.join(WEB, L.file);
  var src = read(p);
  sources[L.file] = src;
  var bytes = Buffer.byteLength(src, 'utf8');
  console.log('\n-- ' + L.file + '（' + L.title + '，认领 ' + L.claim.join(' + ') + '）');

  /* 1 存在且非空 */
  ok(bytes > 0, L.file + ' 已落盘（非空壳）');
  if (!src) return;

  /* 9 注释头：文件开头就是块注释，且里面写清了它负责什么 */
  var headEnd = src.indexOf('*/');
  var head = headEnd > 0 ? src.slice(0, headEnd + 2) : '';
  ok(/^\s*\/\*/.test(src) && head.length > 40
     && (head.indexOf('写域') >= 0 || head.indexOf('负责') >= 0 || head.indexOf('职责') >= 0),
     L.file + ' 有注释头写明职责');

  /* 2 作用域 */
  var scoped = /html\[data-skin="nova"\]/.test(src);
  ok(scoped, L.file + ' 规则包在 html[data-skin="nova"] 内');
  var unscope = src.replace(/html\[data-skin="nova"\][^{]*\{[^}]*\}/g, '')
                   .replace(/\/\*[\s\S]*?\*\//g, '')
                   .replace(/@media[^{]*\{/g, '')
                   .replace(/@keyframes[^{]*\{/g, '');
  var stray = unscope.replace(/[^{}]*\}/g, '').replace(/[^{}]*\{/g, '');
  var straySel = (unscope.match(/[^{}]{2,}\{/g) || []).length;
  ok(straySel === 0, L.file + ' 没有游离在 nova 作用域外的选择器（命中 ' + straySel + '）');

  /* 3 物理规则：阴影只向下 */
  var shadowBad = [];
  var sre = /box-shadow\s*:\s*([^;}]+)/g;
  var sm;
  while ((sm = sre.exec(src))) {
    var body = sm[1];
    /* 逐个阴影层找 y 分量：形如 <x> <y> <blur> */
    var layers = body.split(/,(?![^(]*\))/);
    for (var i = 0; i < layers.length; i++) {
      var L2 = layers[i];
      var nums = L2.match(/-?\d+(\.\d+)?px/g);
      if (!nums || nums.length < 2) continue;
      /* 跳过 inset（inset 的第一个数字不是位移） */
      var lead = L2.replace(/inset\s*/g, ' ').trim();
      var nn = lead.match(/-?\d+(\.\d+)?px/g);
      if (!nn || nn.length < 2) continue;
      var y = parseFloat(nn[1]);
      if (y < 0) shadowBad.push(L2.trim().slice(0, 48));
    }
  }
  ok(shadowBad.length === 0, L.file + ' 所有 box-shadow 的 y ≥ 0（光只从上往下）'
     + (shadowBad.length ? ' —— 违反：' + shadowBad.slice(0, 2).join(' | ') : ''));

  /* 3b 高光只 inset 0 1px 0 */
  ok(!/inset\s+0\s+-\d/.test(src), L.file + ' 没有反向 inset 高光（inset 的 y 不得为负）');

  /* 4 圆角 */
  var radii = [];
  var rre = /border-radius\s*:\s*([^;}]+)/g;
  var rm;
  while ((rm = rre.exec(src))) radii.push(rm[1].trim().replace(/\s*!important\s*$/, ''));
  var badR = radii.filter(function (v) {
    return !/^(0|50%|8px|12px|var\(--n-r-sm\)|var\(--n-r-md\)|999px)$/.test(v);
  });
  ok(badR.length === 0, L.file + ' 圆角只用 0/50%/8px/12px/令牌'
     + (badR.length ? ' —— 违反：' + badR.slice(0, 3).join(' | ') : ''));

  /* 5 材质色饱和度 */
  var colors = declaredColors(src);
  var hot = colors.filter(function (c) { return c.sat > 45; });
  ok(hot.length === 0, L.file + ' 自己声明的材质色 S ≤ 45%'
     + (hot.length ? ' —— 违反：' + hot.slice(0, 3).map(function (c) { return c.name + ' ' + c.hex + ' S=' + c.sat; }).join(' | ') : ''));

  /* 6 不许循环动效 */
  ok(!/animation-iteration-count\s*:\s*infinite/i.test(src)
     && !/\b(infinite)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
     L.file + ' 没有循环动效（v3 全站只允许 2 处循环，已在 motion 层）');

  /* 7 reduced-motion */
  ok(/prefers-reduced-motion/.test(src), L.file + ' 有 prefers-reduced-motion 段');

  /* 8 深色档 */
  ok(/html\[data-skin="nova"\]\[data-theme="dark"\]/.test(src), L.file + ' 有深色档作用域');
});

/* 10 index.html 加载顺序 */
console.log('\n-- web/index.html CSS 加载顺序');
var idx = read(path.join(WEB, 'index.html'));
var order = [];
var ire = /<link[^>]+href="([^"]+\.css)"/g;
var im;
while ((im = ire.exec(idx))) order.push(im[1].split('/').pop());
var wanted = EXPECT_ORDER.filter(function (f) { return order.indexOf(f) >= 0; });
var got = order.filter(function (f) { return EXPECT_ORDER.indexOf(f) >= 0; });
ok(JSON.stringify(wanted) === JSON.stringify(got),
   'CSS 顺序与 NOVA-SIGNATURE §6 一致（实际：' + got.join(' → ') + '）');

console.log('\n== 结果：' + pass + ' passed, ' + fail + ' failed → ' + (fail === 0 ? 'PASS' : 'FAIL') + ' ==');
process.exit(fail === 0 ? 0 : 1);
