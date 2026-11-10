/* m01941：登录教务后把「手填的畸形学号」自动对齐成教务真实学号的离线契约测试。
 *
 *   node tools/test_kb_align.js
 *
 * 链路：名单 r.id = 激活时手填的 sid；教务真实学号只在客户端 LICENSE.noteKbAccount
 *   存本地 K_ACCT_KB，从不上报。截图里 202611 / 120261200112 / 2026250033 被
 *   looksOddId 标「格式异常（手填）」。修法：再登录教务时用真号重新激活，
 *   同时给 /v1/activate 带 renameFrom=旧畸形号，服务端把名单里那一行删掉。
 *
 * 能验：oddShape 判据（真跑函数）、GOOD 正则（从源码取真值）、
 *       服务端改名护栏与 dels 分支、客户端对齐护栏与导出/开机兜底、sync 触发。
 * 不能验：教务登录页真能读到 input#username、真机重新激活换票据。那要真机 + 校园网。
 *
 * 护栏是这次的红线：只有「手填畸形 + 教务真号正常」才悄悄覆盖；
 *   两个正常号不一致仍走原来的人工弹窗，绝不擅自改。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  \u2192 ' + extra : '')); }
}
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const worker = read('server/worker.js');
const auth = read('web/auth.js');
const sync = read('web/sync.js');
const appjs = read('web/app.js');

console.log('服务端：renameFrom 改名护栏:');
ok(/function oddShape\(id\) \{/.test(worker), 'oddShape 存在');
ok(/const renameFrom = String\(b\.renameFrom \|\| ''\)\.trim\(\);/.test(worker), 'handleActivate 读 renameFrom');
ok(/let dels = \[\];/.test(worker) && /dels = \[renameFrom\];/.test(worker), 'dels 收集旧畸形号');
ok(/oddShape\(renameFrom\) && !oddShape\(id\)/.test(worker), '只有「旧畸形 + 新正常」才改名');
ok(/!\(\s*await env\.AUTH\.get\('rev:' \+ renameFrom\)\s*\)/.test(worker), '管理员已修订过的号不自动删（rev: 护栏）');
ok(/idxApply\(env, \[\{ id: id, note: '' \}\], dels\)/.test(worker), 'adds 先加真号 + dels 删畸形行');
/* 门禁锁不能碰 */
ok(/return bad\('学号格式不对'\)/.test(worker), 'check_web 锁：学号格式不对 仍在');
ok(/function idxApply\(/.test(worker) && /idx\.length >= IDX_CAP/.test(worker), 'verify_apk / check_web 锁：idxApply + IDX_CAP 仍在');

console.log('oddShape 真跑（与 app.js looksOddId 同款判据）:');
const osSrc = grabFn(worker, 'oddShape');
ok(!!osSrc, 'oddShape 源码抽得到');
if (osSrc) {
  const sb = { String };
  vm.createContext(sb);
  vm.runInContext(osSrc + ';this.f = oddShape;', sb);
  const cases = [
    ['20261440105', false], ['202611', true], ['120261200112', true],
    ['2026250033', true], ['', true], [null, true], ['abcdefghijk', true],
    ['19991440105', true], ['2026144010', true],
  ];
  let osBad = 0;
  cases.forEach(c => { if (sb.f(c[0]) !== c[1]) { osBad++; console.log('      oddShape(' + JSON.stringify(c[0]) + ') = ' + sb.f(c[0]) + ' 期望 ' + c[1]); } });
  ok(osBad === 0, cases.length + ' 个学号样例全对', osBad);
}

console.log('AUTH：alignKbAccount 护栏与接线:');
ok((auth.match(/function alignKbAccount\s*\(/g) || []).length === 1, 'alignKbAccount 只定义一次（无重复叠码）');
const goodM = /const GOOD = (\/\^20\\d\{2\}\\d\{7\}\$\/);/.exec(auth);
ok(!!goodM, 'GOOD 正则存在');
if (goodM) {
  const GOOD = new Function('return ' + goodM[1])();
  const cases = [['20261440105', true], ['202611', false], ['120261200112', false], ['2026250033', false], ['', false]];
  let gBad = 0;
  cases.forEach(c => { if (GOOD.test(c[0]) !== c[1]) gBad++; });
  ok(gBad === 0, 'GOOD 只认 11 位 20 开头的正常号', gBad);
}
ok(/if \(!GOOD\.test\(real\) \|\| GOOD\.test\(from\) \|\| !from \|\| real === from\) return false;/.test(auth),
  '护栏：两个正常号不一致 / 真号不合法一律不覆盖（保留人工弹窗）');
ok(/LICENSE\.activate\(real, ''\)/.test(auth), '用真号重新激活');
ok(/Host\.setPref\('xxmu_user', real\)/.test(auth) && /localStorage\.setItem\('xxmu_user', real\)/.test(auth), 'Java 侧 + 本地学号一起改');
ok(/LICENSE\.noteKbAccount\(real\)/.test(auth), '复核 noteKbAccount，保证教务号与软件号一致');
ok(/renameFrom: from,/.test(auth), 'activate 请求带 renameFrom');
ok(/\fingerprint, activate, alignKbAccount, check,/.test(auth.replace(/\s+/g, ' ')) || /activate, alignKbAccount, check/.test(auth), 'api 导出 alignKbAccount');
ok(/setTimeout\(function \(\) \{/.test(auth) && /alignKbAccount\(a\.kb, a\.id\)/.test(auth), '开机兜底：老用户下次进 App 自动对齐');

console.log('sync：登录教务后触发对齐:');
ok(/AUTH\.alignKbAccount/.test(sync), '__onLoginDone 里调 alignKbAccount');
ok(/!chk\.unknown && chk\.ok === false/.test(sync), '只在「两号不一致」这一支触发');
ok(/chk = LICENSE\.noteKbAccount\(chk\.acct\)/.test(sync), '对齐成功复核 chk，不弹两号不一样、直接同步课表');
ok(/function looksOddId\(id\) \{/.test(appjs) && /格式异常（手填）/.test(appjs), 'app.js looksOddId 与「格式异常（手填）」字面串仍在（三处门禁锁）');

console.log('');
if (bad) { console.log('test_kb_align: ' + (total - bad) + '/' + total + ' passed, ' + bad + ' FAILED'); process.exit(1); }
console.log('test_kb_align: ' + total + ' passed, 0 failed \u2192 PASS');
