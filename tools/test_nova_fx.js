/* test_nova_fx.js — NOVA 反馈层（nova-fx.js）的静态护栏
 *
 *   node tools/test_nova_fx.js
 *
 * 为什么需要它：nova-fx.js 是一层「纯视觉、零业务」的装饰代码，最容易被
 * 后来的人当成没用的东西删掉，或者被「顺手简化」成一段 transition，
 * 于是四拍表演悄悄退化成「弹一下」，而页面看上去**完全正常**——
 * 没人会发现，只有手感没了。所以这里把它的关键约束钉死。
 *
 * 钉的五件事：
 *   ① 不绑业务：只允许 addEventListener / 读 DOM，不许调任何业务函数
 *   ② 不改别人：不许写 app.js 里的任何函数名，不许改 style 属性持久值
 *   ③ 种子化：不许出现真的 Math.random()（注释里提到可以）
 *   ④ 皮肤隔离 + 减动效：必须有 data-skin === 'nova' 与 prefers-reduced-motion 判定
 *   ⑤ 四拍齐全：预备 / 命中 / 余势 / 收招 四段时间轴都在
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const P = path.join(root, 'web', 'nova-fx.js');
const IDX = path.join(root, 'web', 'index.html');

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) { pass++; }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
}

ok(fs.existsSync(P), 'web/nova-fx.js 存在');
const src = fs.existsSync(P) ? fs.readFileSync(P, 'utf8') : '';
if (!src) {
  console.log('test_nova_fx: 0 passed, ' + (fail || 1) + ' failed -> FAIL');
  process.exit(1);
}

/* ---- 语法 ---- */
let syntaxOk = true, syntaxErr = '';
try { new (require('vm').Script)(src, { filename: 'nova-fx.js' }); }
catch (e) { syntaxOk = false; syntaxErr = e.message; }
ok(syntaxOk, '语法合法', syntaxErr);

/* ---- ① 真·Math.random 一次都不许有（注释里提字眼是可以的） ---- */
const codeLines = src.split('\n').filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l));
const realRandom = codeLines.filter(l => /Math\.random\s*\(/.test(l));
ok(realRandom.length === 0, '代码里没有真的 Math.random()（每次刷新抖动必须一样）',
  realRandom.join(' | '));

/* 种子函数必须存在且是确定性的 */
ok(/function lcg\(seed\)/.test(src), '有种子化随机函数 lcg(seed)');
ok(/1664525/.test(src) && /1013904223/.test(src), 'lcg 用固定常数（Numerical Recipes LCG）');
ok(/seed:\s*lcg/.test(src), '种子函数对外导出（夹具/调试可复用）');

/* ---- ② 皮肤隔离 + 减动效 ---- */
ok(/data-skin'\s*\)\s*===\s*'nova'/.test(src) || /getAttribute\('data-skin'\)\s*===\s*'nova'/.test(src),
  '只在 data-skin === "nova" 下工作');
ok(/prefers-reduced-motion:\s*reduce/.test(src), '识别 prefers-reduced-motion: reduce');
ok(/function calm\(\)/.test(src) && /return on\(\) && !calm\(\)/.test(src),
  '减动效时整层不工作（不是降到 1ms）');

/* ---- ③ 不绑业务：不许调业务函数、不许改 app.js 的东西 ---- */
const biz = ['WATER.', 'XXMU.render', 'renderHomework', 'switchTab(', 'CampusUI', 'renderWeek',
  'localStorage.setItem', 'fetch('];
const hitBiz = biz.filter(b => src.indexOf(b) >= 0);
ok(hitBiz.length === 0, '不调用任何业务函数（只加视觉，不加行为）', hitBiz.join(' , '));

/* ---- ④ 四拍齐全 ---- */
ok(/function act\(el, opts\)/.test(src), '有 act(el, opts) 四拍函数');
ok(/预备/.test(src) && /命中/.test(src) && /收招/.test(src), '四拍的意图写在代码里（预备/命中/余势/收招）');
ok(/cubic-bezier\(\.4,0,1,1\)/.test(src), '第一拍用加速曲线（「立刻压下去」）');
ok(/cubic-bezier\(\.2,1\.6,\.4,1\)/.test(src), '第二拍过冲（「咬住」而不是「滑过」）');
ok(/cubic-bezier\(\.4,0,\.2,1\)/.test(src), '收招用减速曲线');
ok(/restore\(\)/.test(src) && /el\.style\.transform = prevTransform/.test(src),
  '收招后把原 inline 还回去（不留垃圾）');

/* ---- ⑤ light 层：独立加色层，不是把颜色调亮 ---- */
ok(/mix-blend-mode/.test(src) && /plus-lighter/.test(src), '有独立的加色光层（pixelfx 的 light 缓冲）');
ok(/id = 'nv-fx-layer'/.test(src) || /id='nv-fx-layer'/.test(src), '光层有稳定 id 便于排查');
ok(/pointer-events/.test(src) && /none/.test(src), '光层不吃事件');
/* z-index 必须低于必须点的东西：#gate=100 / #upd=120 */
const zm = /'z-index:(\d+)'/.exec(src) || /z-index:\s*(\d+)/.exec(src);
ok(zm && parseInt(zm[1], 10) < 100, '光层 z-index 低于激活门 #gate(100)', zm ? zm[1] : '未找到');

/* ---- ⑥ 步进抖动：像素要整像素位移 ---- */
ok(/function stepShake\(/.test(src), '有步进抖动 stepShake（像素在跳不是在滑）');
ok(/Math\.round\(\(rnd\(\) \* 2 - 1\) \* amp\)/.test(src), '抖动位移取整像素（半像素就不是像素风）');

/* ---- ⑦ 接线：事件委托 + index.html 引入顺序 ---- */
ok(/addEventListener\('click', function \(ev\)/.test(src) && /, true\)/.test(src),
  '用捕获阶段事件委托（动态生成的设备行按钮也生效）');
const idx = fs.existsSync(IDX) ? fs.readFileSync(IDX, 'utf8') : '';
ok(idx.includes('<script src="nova-fx.js"></script>'), 'index.html 引入 nova-fx.js');
ok(idx.indexOf('nova-fx.js') > idx.indexOf('src="app.js"'), 'nova-fx.js 在 app.js 之后（真实 DOM 已建）');
/* 注意：注释里也会出现 "SKIN.init" 字样，必须定位真正的调用语句，否则取到的是注释位置 */
const initIdx = idx.indexOf('<script>if (window.SKIN && SKIN.init) SKIN.init();</script>');
ok(initIdx > 0 && idx.indexOf('<script src="nova-fx.js"></script>') < initIdx,
  'nova-fx.js 早于真正的 SKIN.init() 调用（能包住 SKIN.apply）', 'init 位置 ' + initIdx);

/* ---- ⑧ 放水的状态切换要能被看见 ---- */
ok(/MutationObserver/.test(src) && /waterDevList/.test(src),
  '盯 #waterDevList 的文字变化（放水→停止 这一下才是真命中）');
ok(/\^\(停止\|放水\)/.test(src), '只在「停止/放水」互切时补光，不被其它重绘带着乱闪');

console.log('test_nova_fx: ' + pass + ' passed, ' + fail + ' failed -> ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
