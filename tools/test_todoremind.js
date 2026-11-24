/* v2.14.0 我的待办到期提醒的行为测试
 *
 *   node tools/test_todoremind.js
 *
 * 为什么必须真跑 buildTodo()、不能只做静态 has 锚点：
 *   这一块全在算「什么时候该响」。锚点只能证明「代码里有这几个字」，
 *   证明不了「没写日子的没被催」「做完的没被催」「提前 2 天是提前 2 天
 *   不是提前 2 小时」「今天 23:00 时明天的事不会被说成今天」。
 *   这些错法都会安静地发生：通知照常弹，只是弹错了时候或者弹了不该弹的。
 *
 * 沙箱里给的是 MYTODO（真机上由 web/mytodo.js 提供），其余全用真代码。
 * 做法与 tools/test_hwremind.js 同一套：花括号配平切函数 + vm 跑。
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

/** 花括号配平切函数（与 test_hwremind.js / test_reminder_fix.js 同一套做法） */
function cut(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(name + ' 花括号不配平');
}

const src = read('web/reminder.js');

/**
 * 在沙箱里跑真 buildTodo()。
 * @param items  MYTODO.list() 的返回（真机上由 mytodo.js 算好，已 norm 过）
 * @param lead   提前几天（0 / 1 / 2）
 * @param nowMs  测试用的「现在」
 */
function run(items, lead, nowMs) {
  const code = [
    'function mode() { return "alarm"; }',
    'function todoLead() { return ' + lead + '; }',
    'var MYTODO = __mt;',
    'var Date = __Date;',
    cut(src, 'buildTodo'),
    'this.__b = buildTodo;',
  ].join('\n');
  const RealDate = Date;
  /* 有参转发、无参才用假 now。第一版写成「无参也 return new RealDate(nowMs)」
   * 会把 new Date(y, m, d) 的三参整个吞掉 —— 于是 buildTodo 里
   * day0 恒等于假 now，10 项断言集体报错而代码其实是对的。 */
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); }
    static now() { return nowMs; }
  }
  const mt = { list: function () { return items; } };
  const s = { __mt: mt, __Date: FakeDate, String, Array, Math, parseInt, console };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(code, s, { timeout: 3000 });
  return s.__b();
}

const D = 86400000;
const H = 3600000;
/* 2026-11-21 10:00 本地时间。用 new Date(y,m,d,h) 构造，绝不用字符串
 * '2026-11-21 10:00' —— 后者在部分引擎里被当 UTC，会让整套断言偏 8 小时。 */
const NOW = new Date(2026, 10, 21, 10, 0, 0).getTime();
const iso = ms => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};
const dayOf = ms => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/* ---------------------------------------------------------------- 1. 基本换算 */
console.log('1. 写了日子的待办 → 那天早上 8 点挂一条');
let r = run([{ id: 'a', text: '交病理实验报告', due: '2026-11-25', done: false }], 1, NOW);
ok(r.length === 1, '一条待办 → 一条提醒', r.length);
ok(r.length === 1 && r[0].at === new Date(2026, 10, 24, 8, 0, 0).getTime(),
  '提前 1 天 → 提醒在 11-24 早上 8 点（不是 11-25，也不是半夜）',
  r.length ? iso(r[0].at) : '-');
ok(r.length === 1 && r[0].kind === 'todo', 'kind 标成 todo（Java 侧靠它换文案）',
  r.length ? r[0].kind : '-');
ok(r.length === 1 && r[0].name === '交病理实验报告', 'name 带上待办正文');
ok(r.length === 1 && r[0].room === '', 'room 留空（待办没有教室）');
ok(r.length === 1 && r[0].mode === 'alarm', 'mode 逐项带着（重启重挂不退回默认）');
ok(r.length === 1 && r[0].due === new Date(2026, 10, 25, 23, 59, 0).getTime(),
  'due = 那一天 23:59（待办只写日子，这一天内做完都算数）',
  r.length ? iso(r[0].due) : '-');

/* 提前量三档 */
r = run([{ text: 'X', due: '2026-11-25', done: false }], 0, NOW);
ok(r.length === 1 && r[0].at === new Date(2026, 10, 25, 8, 0, 0).getTime(),
  '提前 0 天 → 当天早上 8 点', r.length ? iso(r[0].at) : '-');

r = run([{ text: 'X', due: '2026-11-25', done: false }], 2, NOW);
ok(r.length === 1 && r[0].at === new Date(2026, 10, 23, 8, 0, 0).getTime(),
  '提前 2 天 → 11-23 早上 8 点', r.length ? iso(r[0].at) : '-');

/* ---------------------------------------------------------------- 2. 四条不该提醒 */
console.log('2. 没写日子 / 已完成 / 日子已过 / 脏日子 —— 一条都不该响');
r = run([
  { text: '没写日子的', due: '', done: false },
  { text: 'due 是 null', due: null, done: false },
  { text: 'due 是 undefined', done: false },
], 1, NOW);
ok(r.length === 0, '没写日子的不提醒（没有「到期」这回事，催它是凭空造 deadline）',
  r.map(x => x.name).join(','));

r = run([
  { text: '已经做完的', due: '2026-11-25', done: true },
], 1, NOW);
ok(r.length === 0, '已完成的不提醒（做完了就别催）', r.map(x => x.name).join(','));

r = run([
  { text: '昨天的', due: '2026-11-20', done: false },
  { text: '前天的', due: '2026-11-19', done: false },
], 1, NOW);
ok(r.length === 0, '日子已经过了的不提醒（过期再催只会让人烦）',
  r.map(x => x.name).join(','));

r = run([
  { text: '格式不对', due: '2026/11/25', done: false },
  { text: '两个数字的月', due: '2026-1-5', done: false },
  { text: '不是日期', due: '下周三', done: false },
], 1, NOW);
ok(r.length === 0, 'due 不是 YYYY-MM-DD 的一律跳过（宁可漏一条，也不猜）',
  r.map(x => x.name).join(','));

/* 今天就是 2026-11-21，现在 10:00，当天 23:59 还没到 */
r = run([{ text: '今天到期的', due: '2026-11-21', done: false }], 1, NOW);
ok(r.length === 1 && r[0].at === NOW + 30 * 1000,
  '提前 1 天但今天就是那天 → 立刻补一条（不静默跳过）',
  r.length ? iso(r[0].at) : '-');

/* ---------------------------------------------------------------- 3. 时刻边界 */
console.log('3. 早上 8 点这个时刻的边界');
/* 早上 7:59 → 当天 8 点还没到，应该挂在 8 点整 */
r = run([{ text: 'X', due: '2026-11-25', done: false }], 0,
  new Date(2026, 10, 25, 7, 59, 0).getTime());
ok(r.length === 1 && r[0].at === new Date(2026, 10, 25, 8, 0, 0).getTime(),
  '7:59 时 → 仍挂在 8:00 整（不是立刻）', r.length ? iso(r[0].at) : '-');

/* 早上 8:00 整 → 已经到点，立刻补（at = now + GRACE） */
r = run([{ text: 'X', due: '2026-11-25', done: false }], 0,
  new Date(2026, 10, 25, 8, 0, 0).getTime());
ok(r.length === 1 && r[0].at === new Date(2026, 10, 25, 8, 0, 0).getTime() + 30000,
  '8:00 整 → 立刻补一条（30 秒宽限，不是静默丢掉）',
  r.length ? iso(r[0].at) : '-');

/* 23:58 → 已进窗口，还来得及补 */
r = run([{ text: 'X', due: '2026-11-25', done: false }], 0,
  new Date(2026, 10, 25, 23, 58, 0).getTime());
ok(r.length === 1, '23:58 时当天还没过 → 仍补一条', r.length);

/* 23:59 之后（第二天 00:00）→ 已过截止，丢掉 */
r = run([{ text: 'X', due: '2026-11-25', done: false }], 0,
  new Date(2026, 10, 26, 0, 0, 0).getTime());
ok(r.length === 0, '过了 23:59 就丢掉（不是无限期地补）', r.length);

/* ---------------------------------------------------------------- 4. mins 与排序 */
console.log('4. mins / 排序');
r = run([{ text: 'X', due: '2026-11-25', done: false }], 1, NOW);
ok(r.length === 1 && r[0].mins === Math.round(
  (new Date(2026, 10, 25, 23, 59, 0).getTime() - new Date(2026, 10, 24, 8, 0, 0).getTime()) / 60000
), 'mins = 提醒时刻到 23:59 的分钟数', r.length ? r[0].mins : '-');

r = run([
  { text: '晚的', due: '2026-11-28', done: false },
  { text: '早的', due: '2026-11-23', done: false },
  { text: '中间的', due: '2026-11-25', done: false },
], 0, NOW);
ok(r.length === 3 && r[0].name === '早的' && r[1].name === '中间的' && r[2].name === '晚的',
  '按提醒时刻升序（200 条上限砍掉的永远是最远的）',
  r.map(x => x.name).join(','));

/* ---------------------------------------------------------------- 5. 输入容错 */
console.log('5. 输入容错 —— 坏数据不许把整批拖垮');
r = run(null, 1, NOW);
ok(r.length === 0, 'MYTODO.list() 返回 null → 空表不抛', r.length);

r = run([null, undefined, {}, { text: '正常的那条', due: '2026-11-25', done: false }], 1, NOW);
ok(r.length === 1 && r[0].name === '正常的那条',
  '混着 null/undefined/空对象时，正常那条照旧产出', r.map(x => x.name).join(','));

/* ---------------------------------------------------------------- 6. 与真 mytodo 的口径一致 */
console.log('6. 与 web/mytodo.js 的口径一致性');
const mySrc = read('web/mytodo.js');
const dueRe = /\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$/;
ok(dueRe.test(mySrc.replace(/\s+/g, ' ')) || /safeDue/.test(mySrc),
  'mytodo.js 自己就把 due 收成 YYYY-MM-DD（这里不需要再容错别的格式）');

/* ---------------------------------------------------------------- 7. 源码纪律 */
console.log('7. 源码纪律');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(src);
const todoCode = cut(code, 'buildTodo');
ok(/kind:\s*'todo'/.test(todoCode), "buildTodo 产出 kind: 'todo'");
ok(!/REMINDER/.test(todoCode), 'buildTodo 里不引用 REMINDER（避免自引用）');
ok(/day0 \+ 8 \* 3600000/.test(todoCode),
  '提醒时刻写死 8 点（早上是唯一还来得及改计划的时段）');
ok(/day0 \+ 24 \* 3600000 - 60000/.test(todoCode),
  'due 取当天 23:59（不取 00:00 —— 那会让「今天之内做完」变成「凌晨就过期」）');
ok(/if \(!x \|\| x\.done\) return;/.test(todoCode), '先挡掉空条目与已完成');
ok(/out\.sort/.test(todoCode), '产出前按时刻排序');
ok(/typeof MYTODO === 'undefined'/.test(todoCode),
  'MYTODO 不存在时安全返回（浏览器预览 / 早期加载都不许抛）');

/* buildAll 必须把三路合起来 */
const allCode = cut(code, 'buildAll');
ok(/todoOn\(\) \? buildTodo\(\)/.test(allCode), 'buildAll 有第三路 todoOn() ? buildTodo()');
ok(/a\.concat\(b, c\)/.test(allCode), 'buildAll 汇成一份（不是只 concat 两路）');

/* 卡片第三行与面板第三区都在 */
const html = read('web/index.html');
ok(/id="remindTodoRow"/.test(html), 'index.html 有第三行 #remindTodoRow');
ok(/id="remindTodoStat"/.test(html), 'index.html 有第三行读数 #remindTodoStat');

const panel = code.slice(code.indexOf('function openSettings('));
ok(/id = 'rmTodoSw'/.test(panel), '面板有 #rmTodoSw 开关');
ok(/id = 'rmTodoLead'/.test(panel), '面板有 #rmTodoLead 提前量');
ok(/id = 'rmTodoPreview'/.test(panel), '面板有「试一下待办提醒」');
ok(/setPref\(KEY_TODO,/.test(panel), '开关写回 KEY_TODO');
ok(/setPref\(KEY_TODO_LEAD,/.test(panel), '提前量写回 KEY_TODO_LEAD');

/* paint() 要管第三行 */
const paintCode = cut(code, 'paint');
ok(/remindTodoStat/.test(paintCode), 'paint() 会写 #remindTodoStat');
ok(/todoLead\(\) === 0 \? '当天早上 8 点'/.test(paintCode),
  '提前 0 天时读数是「当天早上 8 点」而不是「提前 0 天」');

/* ---------------------------------------------------------------- 8. Java 侧文案 */
console.log('8. Java 侧（ReminderReceiver）认 todo 且文案不写小时');
const jv = read('android/src/com/xxmu/helper/ReminderReceiver.java');
const jvCode = strip(jv);
ok(/KIND_TODO = "todo"/.test(jvCode), 'Java 侧有 KIND_TODO = "todo"');
ok(/if \(KIND_TODO\.equals\(k\)\) return KIND_TODO;/.test(jvCode),
  'normKind 认 todo（不认就会被当成「上课」说「15 分钟后上课」）');
ok(/todoLeftText/.test(jvCode), '有 todoLeftText 专门算待办的剩余说法');
ok(/今天到期/.test(jv) && /明天到期/.test(jv) && /天后到期/.test(jv),
  '文案三档：今天到期 / 明天到期 / N 天后到期');
ok(/HOUR_OF_DAY, 0/.test(jvCode),
  '按日历天归零再比（不按 24 小时整除 —— 晚上 23:00 会把明天说成今天）');
ok(!/还有 " \+ left \+ "截止/.test(jvCode.split('KIND_TODO.equals(kind)')[1] || ''),
  '待办那句里没有「还有 N 小时截止」这种假精度');

/* ---------------------------------------------------------------- 汇总 */
console.log('');
if (bad === 0) console.log('[PASS] 待办到期提醒 v2.14.0 行为测试通过 ' + total + ' 项');
else console.log('[FAIL] ' + bad + ' / ' + total + ' 项未过');
process.exit(bad === 0 ? 0 : 1);
