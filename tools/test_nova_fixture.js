/* test_nova_fixture.js — 出图夹具自身的护栏
 *
 *   node tools/test_nova_fixture.js
 *
 * 为什么需要它：`organ-swipe-light.png` 曾经和 `organ-belt-light.png`
 * 字节完全一样 —— 刷票状态静默退化成普通课表页。原因不是器官代码坏了，
 * 而是出图夹具坏了：
 *   ① harness CSS 把 #sheet 强制 display:none，而刷票器官住在 #sh-body 里；
 *   ② headless 虚拟时间不推进 CSS 动画，票永远停在关键帧第 0 帧。
 * 夹具一改回去，同样的问题会再来一次，而且图还「看着正常存在」。
 *
 * 所以这里断言的是夹具本身：
 *   - 语法能过（注入式夹具折行会静默退回旧夹具）
 *   - swipe 状态有专属的静态摆位覆盖
 *   - #sheet 在 swipe 状态不被隐藏
 *   - 每条注入的 JS 字符串保持单行、引号成对
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const FIX = path.join(root, 'design', 'sketch', 'make_nova_real.js');

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) { pass++; }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
}

ok(fs.existsSync(FIX), '夹具 make_nova_real.js 存在');
const src = fs.existsSync(FIX) ? fs.readFileSync(FIX, 'utf8') : '';

if (src) {
  /* ① 语法必须能过 */
  let syntaxOk = true, syntaxErr = '';
  try { new vm.Script(src, { filename: 'make_nova_real.js' }); }
  catch (e) { syntaxOk = false; syntaxErr = e.message; }
  ok(syntaxOk, '夹具语法合法（折行会让截图静默退回旧夹具）', syntaxErr);

  /* ② swipe 状态的三条专属覆盖 */
  ok(/data-shot-swipe/.test(src), '夹具有 data-shot-swipe 状态标记');
  ok(/data-shot-swipe="1"\]\s*#sheet\{display:block/.test(src),
    'swipe 状态下 #sheet 不被隐藏（刷票器官住在 #sh-body 里）');
  ok(/data-shot-swipe="1"\]\s*\.nv-swipe-card\{[^}]*animation:none/.test(src),
    'swipe 票停掉动画（虚拟时间不推进 CSS 动画，否则永远停在第 0 帧）');
  ok(/data-shot-swipe="1"\]\s*\.nv-swipe-card\{[^}]*transform:translateX\(/.test(src),
    'swipe 票被摆到读卡器口的静态姿态');
  ok(/data-shot-swipe="1"\]\s*\.nv-swipe-reader\{/.test(src),
    '读卡器有 swipe 专属高亮');

  /* ③ 隐藏清单不得包含 #sheet，否则刷票器官永远拍不到 */
  const hideBlock = (/\n\s*'[^']*#gate,#disc,#tut,#onb,#upd,#sheet\{display:none!important\}[^']*'/.exec(src) || [])[0] || '';
  ok(hideBlock.indexOf('#sheet') >= 0 && hideBlock.indexOf('data-shot-swipe') < 0,
    '隐藏清单里的 #sheet 会被 swipe 状态覆盖');

  /* ④ 注入式字符串必须单行且引号成对 */
  const lines = src.split('\n');
  let odd = 0;
  lines.forEach((ln, i) => {
    if (!/^\s*'/.test(ln)) return;          // 只看单行字符串字面量
    const q = (ln.match(/'/g) || []).length;
    if (q % 2 !== 0) { odd++; console.log('    引号不成对 -> 行 ' + (i + 1)); }
  });
  ok(odd === 0, '注入式 JS 字符串引号成对（折行/引号错都会让夹具失效）', odd + ' 处异常');

  /* ⑤ 探针要能报出几何，才能定位「东西在但看不见」 */
  ok(/swipeRect/.test(src) && /cardRect/.test(src) && /cardTransform/.test(src),
    '探针报出 swipe / card 的几何与 transform');
  ok(/ORGAN_PROBE/.test(src), '夹具有 ORGAN_PROBE 输出');
}

console.log('test_nova_fixture: ' + pass + ' passed, ' + fail + ' failed -> ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
