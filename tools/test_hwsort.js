/* 「已过截止不进待完成 + 按截止时间从近到远」的离线回归测试（v1.1.77）。
 *
 * 为什么要有这个：m04098 原话「已过期的不显示在待完成里，这个按时间从近到远
 * 排序，就是按紧急程度排序」。改之前的症状是真机截图里 09-27、10-06、10-11
 * 那些早就过期的作业排在「待完成 · 11」最上面，越老越靠前——因为过期条目的
 * 剩余时间是负数，-1200 小时比 -10 小时更小，byDue 升序就把最老的顶到首屏。
 *
 * 这种事只有真机才看得出来，所以把分桶抽成纯函数 hwBucket() 单独钉住。
 * app.js 里用 `@testable:hwBucket` / `@end` 把这段圈出来，本测试按标记切出来跑，
 * 不加载整个 app.js（那玩意儿一加载就要 DOM）。
 *
 * 用法：node tools/test_hwsort.js
 * 退出码 0 = 全过；1 = 有失败。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  -> ' + extra : '')); }
}

/* 从 app.js 里切出 hwBucket（标记定界，改代码忘了同步标记会立刻报出来）。 */
function cutFn(src) {
  const a = src.indexOf('/* @testable:hwBucket */');
  const b = src.indexOf('/* @end */', a);
  if (a < 0 || b < 0) return null;
  return src.slice(a + '/* @testable:hwBucket */'.length, b);
}

/* isDoneStatus 的替身：与 web/app.js 同口径（借 CX.classify）。 */
const DONE = ['已完成', '已提交', '已交', '待批阅', '未批阅', '已批阅', '已互评',
  '已过期', '已结束', '已截止'];
function isDoneStatus(st) {
  const s = String(st || '').replace(/\s+/g, '');
  if (!s) return false;
  for (const w of DONE) if (s.indexOf(w) >= 0) return true;
  return false;
}

function loadBucket() {
  const body = cutFn(APP);
  if (!body) return null;
  const sandbox = { console, String, Object, Array, isDoneStatus };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(body + '\n;__hb = hwBucket;', sandbox, { timeout: 3000 });
  return sandbox.__hb;
}

/* 造一条条目，字段与 renderHomework 里 items.push 的一致。 */
function it(o) {
  return Object.assign({
    kind: 'work', name: 'x', status: '待做', open: true,
    notStart: false, expired: false, left: 10,
  }, o || {});
}

function main() {
  console.log('\n[v1.1.77] 待完成分桶（已过截止移出 / 按截止时间正序）');

  const hb = loadBucket();
  ok('① app.js 里找得到 hwBucket（带 @testable 标记）', typeof hb === 'function');
  if (typeof hb !== 'function') {
    console.log('\n[FAIL]  1 assertions: pass=' + pass + ' fail=' + (fail + 1));
    process.exit(1);
  }

  /* ---------- ② 还在时间内的「待做」→ todo ---------- */
  ok('② 未交且没过截止 → todo', hb(it()) === 'todo');
  ok('② 剩余 1 分钟也算 todo', hb(it({ left: 0.01 })) === 'todo');

  /* ---------- ③ 已过截止、还没交 → expired（不进待完成） ---------- */
  ok('③ 未交且已过截止 → expired', hb(it({ left: -1 })) === 'expired');
  ok('③ 过期很久（-1200 小时）同样是 expired', hb(it({ left: -1200 })) === 'expired');

  /* ---------- ④ 已完成优先于过期 ---------- */
  ok('④ 已交且过了截止 → done（不是 expired）',
    hb(it({ status: '已完成', expired: true, left: -5 })) === 'done');
  ok('④ 已批阅也归 done', hb(it({ status: '已批阅', left: -5 })) === 'done');

  /* ---------- ⑤ 未开始 / 未开考 → notstart（也不进待完成） ---------- */
  ok('⑤ 未开始 → notstart', hb(it({ status: '未开始', open: false, notStart: true })) === 'notstart');
  ok('⑤ 未开考 → notstart', hb(it({ kind: 'exam', status: '未开考', open: false, notStart: true })) === 'notstart');

  /* ---------- ⑥ 状态没读到、也没过截止 → unknown（留在待完成侧） ---------- */
  ok('⑥ 状态未知且没过截止 → unknown',
    hb(it({ status: '状态未知', open: false, left: 5 })) === 'unknown');
  ok('⑥ 空状态且没过截止 → unknown',
    hb(it({ status: '', open: false, left: 5 })) === 'unknown');

  /* ---------- ⑦ 没有截止时间的待做仍算 todo（不能因为 left=null 被漏掉） ---------- */
  ok('⑦ 没截止时间的待做 → todo', hb(it({ left: null, open: true })) === 'todo');

  /* ---------- ⑧ 排序：待完成必须按截止时间从近到远 ---------- */
  const raw = [
    it({ name: '过期最老', left: -1200, expired: true }),
    it({ name: '三天后', left: 72 }),
    it({ name: '过期中', left: -100, expired: true }),
    it({ name: '一小时后', left: 1 }),
    it({ name: '一天后', left: 24 }),
  ];
  const byDue = (a, b) => {
    const av = a.left == null ? Infinity : a.left;
    const bv = b.left == null ? Infinity : b.left;
    return av - bv;
  };
  const todo = raw.filter(x => hb(x) === 'todo').sort(byDue).map(x => x.name);
  ok('⑧ 待完成只剩还能做的 3 条', todo.length === 3, todo.join('|'));
  ok('⑧ 待完成按截止从近到远：一小时后 → 一天后 → 三天后',
    todo.join('|') === '一小时后|一天后|三天后', todo.join('|'));
  /* app.js 里已过截止是 left 降序：越接近现在越靠前，最老的沉底。
   * 这里照同一个口径排，别用待完成的 byDue 升序套过去（那会把最老的顶上来）。 */
  const byLeftDesc = (a, b) => (b.left ?? -1e9) - (a.left ?? -1e9);
  const exp = raw.filter(x => hb(x) === 'expired').sort(byLeftDesc).map(x => x.name);
  ok('⑧ 已过截止单独一堆、2 条', exp.length === 2, exp.join('|'));
  ok('⑧ 已过截止按截止时间正序（最接近现在的在前，最老的沉底）',
    exp.join('|') === '过期中|过期最老', exp.join('|'));

  /* ---------- ⑨ 关键回归：过期条目绝不能出现在待完成里 ---------- */
  const expNames = raw.filter(x => hb(x) === 'expired').map(x => x.name);
  ok('⑨ 过期条目一条都不在待完成里',
    todo.every(n => expNames.indexOf(n) < 0), todo.join('|'));
  ok('⑨ 这就是 m04098 那条投诉：过期的不该占首屏', true);

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail)
    + ' assertions: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

main();
