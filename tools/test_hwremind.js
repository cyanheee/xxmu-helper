/* v2.2.0 作业截止 / 考试开考提醒（截止哨兵）的行为测试
 *
 *   node tools/test_hwremind.js
 *
 * 为什么必须真跑 buildHw()、不能只做静态 has 锚点：
 *   这一块全在算「什么时候该响」。锚点只能证明「代码里有这几个字」，
 *   证明不了「已交的没被催」「过截止的没被翻出来」「剩下 3 小时的补一条
 *   立刻提醒」。这些错法都会安静地发生：通知照常弹，只是弹错了时候。
 *
 * 沙箱里给的是 window.__HWITEMS（真机上由 app.js renderHomework 挂）和
 * 一个 isDoneStatus 桩（真机上由 CX.classify 提供），其余全用真代码。
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

/** 花括号配平切函数（与 test_reminder_fix.js 同一套做法） */
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

/* 真机上 isDoneStatus 走 CX.classify；这里给它一个等价桩：
 * 只有「已完成 / 已提交 / 待批阅」算做完，跟 web/chaoxing.js 的口径一致。 */
const DONE = ['已完成', '已提交', '待批阅', '已批阅'];
function isDoneStatus(st) { return DONE.indexOf(String(st || '')) >= 0; }

/**
 * 在沙箱里跑真 buildHw()。
 * @param items  window.__HWITEMS 的条目（真机上由 renderHomework 算好）
 * @param lead  {hw: 小时, exam: 小时}
 * @param nowMs 测试用的「现在」
 */
function run(items, lead, nowMs) {
  const code = [
    'var mins = function () { return 15; };',
    'var md = null;',
    'function mode() { return "alarm"; }',
    'function hwLead() { return ' + lead.hw + '; }',
    'function examLead() { return ' + lead.exam + '; }',
    'var isDoneStatus = __isDone;',
    'var window = __win;',
    'var Date = __Date;',
    cut(src, 'buildHw'),
    'this.__b = buildHw;',
  ].join('\n');
  const RealDate = Date;
  /* 注意这里必须是「有参转发、无参才用假 now」的 Date。
   * 第一版写成 function FakeDate(){ return new RealDate(nowMs) }，它把
   * new Date('2026-11-21 06:00') 的参数整个吞掉，于是 buildHw 里每条的
   * due 都变成「现在」—— 8 项断言集体报错，而代码其实是对的。
   * 测试夹具吃掉参数，看起来像被测代码错，这是最容易误判的一类坑。 */
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); }
    static now() { return nowMs; }
  }
  const win = { __HWITEMS: items };
  const s = {
    __isDone: isDoneStatus, __win: win, __Date: FakeDate,
    String, Array, Math, parseInt, console,
  };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(code, s, { timeout: 3000 });
  return s.__b();
}

const H = 3600000;
const NOW = new Date(2026, 10, 21, 10, 0, 0).getTime();   // 2026-11-21 10:00
const iso = ms => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

/* ---------------------------------------------------------------- 1. 基本换算 */
console.log('1. 作业按截止前 N 小时挂一条');
const dueIn20h = NOW + 20 * H;
let r = run([{
  kind: 'work', name: '实验报告', course: '病理学', status: '待做',
  left: 20, expired: false, raw: { end: iso(dueIn20h) },
}], { hw: 12, exam: 6 }, NOW);
ok(r.length === 1, '一条作业 → 一条提醒', r.length);
ok(r.length === 1 && r[0].at === dueIn20h - 12 * H,
  '提醒时刻 = 截止 − 12 小时（不是 −15 分钟，也不是截止那一刻）',
  r.length ? iso(r[0].at) : '-');
ok(r.length === 1 && r[0].kind === 'hw', 'kind 标成 hw（Java 侧靠它换文案）',
  r.length ? r[0].kind : '-');
ok(r.length === 1 && r[0].due === dueIn20h, 'due 带上真正的截止毫秒');
ok(r.length === 1 && r[0].mode === 'alarm', 'mode 逐项带着（重启重挂不退回默认）');
ok(r.length === 1 && r[0].room === '病理学', '课程名走 room 位传下去（通知第二行要写）');
ok(r.length === 1 && r[0].mins === 720, 'mins = 到截止的分钟数（720 = 12 小时）',
  r.length ? r[0].mins : '-');

/* 提前量不同，时刻跟着变 */
r = run([{
  kind: 'work', name: 'A', course: 'C', status: '待做', left: 20,
  raw: { end: iso(dueIn20h) },
}], { hw: 48, exam: 6 }, NOW);
ok(r.length === 1 && r[0].at === NOW + 30 * 1000,
  '提前量 48 小时但只剩 20 小时 → 立刻补一条（不静默跳过）',
  r.length ? iso(r[0].at) : '-');

/* ---------------------------------------------------------------- 2. 三条不提醒 */
console.log('2. 已交 / 已过截止 / 时间读不出来 —— 一条都不该响');
r = run([
  { kind: 'work', name: '已交的', course: 'C', status: '已完成', left: 20, raw: { end: iso(dueIn20h) } },
  { kind: 'work', name: '已提交的', course: 'C', status: '已提交', left: 30, raw: { end: iso(NOW + 30 * H) } },
], { hw: 12, exam: 6 }, NOW);
ok(r.length === 0, '已完成的作业不提醒（交了就别催）', r.map(x => x.name).join(','));

r = run([
  { kind: 'work', name: '过截止', course: 'C', status: '待做', left: -5, expired: true, raw: { end: iso(NOW - 5 * H) } },
  { kind: 'work', name: 'left 是负数但没标 expired', course: 'C', status: '待做', left: -1, raw: { end: iso(NOW - 1 * H) } },
], { hw: 12, exam: 6 }, NOW);
ok(r.length === 0, '已过截止的不提醒（那时候提醒没有任何用处）',
  r.map(x => x.name).join(','));

r = run([
  { kind: 'work', name: '没时间', course: 'C', status: '待做', left: null, raw: { end: '' } },
  { kind: 'work', name: '时间乱码', course: 'C', status: '待做', left: null, raw: { end: '不知道' } },
], { hw: 12, exam: 6 }, NOW);
ok(r.length === 0, '截止时间读不出来就不挂（没有绝对时刻，挂不出闹钟）',
  r.map(x => x.name).join(','));

/* 状态没读到（status='' 或 '状态未知'）但没过截止 → 仍要提醒。
 * 这是「宁可信其有」：状态读不到是我们的问题，不该因此让他错过截止。 */
r = run([
  { kind: 'work', name: '状态未知', course: 'C', status: '状态未知', left: 20, raw: { end: iso(dueIn20h) } },
], { hw: 12, exam: 6 }, NOW);
ok(r.length === 1, '状态未知、但没过截止的仍提醒（宁可多响一次）', r.length);

/* ---------------------------------------------------------------- 3. 考试盯开考 */
console.log('3. 考试提醒盯的是开考时刻，不是结束时刻');
const startIn10h = NOW + 10 * H;
const endIn12h = startIn10h + 2 * H;
r = run([{
  kind: 'exam', name: '病理学期中考试', course: '病理学', status: '未开考',
  left: 12, leftStart: 10, expired: false,
  raw: { start: iso(startIn10h), end: iso(endIn12h) },
}], { hw: 12, exam: 6 }, NOW);
ok(r.length === 1, '一条考试 → 一条提醒', r.length);
ok(r.length === 1 && r[0].at === startIn10h - 6 * H,
  '提醒时刻 = 开考 − 6 小时（用 start 不是 end）',
  r.length ? iso(r[0].at) : '-');
ok(r.length === 1 && r[0].kind === 'exam', 'kind 标成 exam',
  r.length ? r[0].kind : '-');
ok(r.length === 1 && r[0].due === startIn10h, 'due 记的是开考时刻（Java 侧据此算「还有 N 小时开考」）');

/* 开考时间读不到时退回结束时间 —— 迟到发现也好过一直不知道 */
r = run([{
  kind: 'exam', name: '没有开考时间', course: 'C', status: '未开考', left: 12,
  raw: { start: '', end: iso(endIn12h) },
}], { hw: 12, exam: 6 }, NOW);
ok(r.length === 1, '开考时间读不到 → 退回用结束时间，仍提醒一次', r.length);

/* ---------------------------------------------------------------- 4. 补一条的边界 */
console.log('4. 已经进入提前量窗口 / 刚过截止');
r = run([{
  kind: 'work', name: '还剩 3 小时', course: 'C', status: '待做', left: 3,
  raw: { end: iso(NOW + 3 * H) },
}], { hw: 12, exam: 6 }, NOW);
ok(r.length === 1 && r[0].at === NOW + 30000,
  '剩 3 小时（已在 12 小时窗口内）→ 30 秒后补一条',
  r.length ? iso(r[0].at) : '-');
ok(r.length === 1 && r[0].mins === 180, '这条的 mins 仍是真实的 180（不是 1）',
  r.length ? r[0].mins : '-');

r = run([{
  kind: 'work', name: '刚过点', course: 'C', status: '待做', left: -0.05,
  raw: { end: iso(NOW - 3 * 60000) },
}], { hw: 12, exam: 6 }, NOW);
ok(r.length === 0, '刚过截止几分钟的也不再补（过了就是过了，不替人重开）', r.length);

/* ---------------------------------------------------------------- 5. 排序与上限 */
console.log('5. 混合排序：先到期的排前面');
r = run([
  { kind: 'work', name: '远', course: 'C', status: '待做', left: 100, raw: { end: iso(NOW + 100 * H) } },
  { kind: 'work', name: '近', course: 'C', status: '待做', left: 20, raw: { end: iso(NOW + 20 * H) } },
  { kind: 'exam', name: '考试', course: 'C', status: '未开考', left: 12,
    raw: { start: iso(NOW + 10 * H), end: iso(NOW + 12 * H) } },
], { hw: 12, exam: 6 }, NOW);
ok(r.length === 3, '三条都排上', r.length);
ok(r.length === 3 && r[0].name === '考试' && r[1].name === '近' && r[2].name === '远',
  '按提醒时刻升序（考试开考前 6h < 作业截止前 12h 里最近那条）',
  r.map(x => x.name + '@' + iso(x.at)).join(' | '));

/* 空数据不炸 */
r = run([], { hw: 12, exam: 6 }, NOW);
ok(r.length === 0, '没有 __HWITEMS 条目时返回空数组（不抛）');
r = run(undefined, { hw: 12, exam: 6 }, NOW);
ok(r.length === 0, 'window.__HWITEMS 是 undefined 时也返回空数组（不抛）');

/* ---------------------------------------------------------------- 6. 源码契约 */
console.log('6. 源码契约：开关、提前量、与课程提醒并存');
ok(/const KEY_HW = 'xxmu_remind_hw'/.test(src), '作业提醒有独立开关键（不占用课程那个）');
ok(/const KEY_HW_LEAD = 'xxmu_remind_hw_lead'/.test(src), '作业提前量独立存');
ok(/const KEY_EXAM_LEAD = 'xxmu_remind_exam_lead'/.test(src), '考试提前量独立存');
ok(/HW_LEADS = \[3, 6, 12, 24, 48\]/.test(src), '作业提前量给 3/6/12/24/48 小时');
ok(/EXAM_LEADS = \[1, 3, 6, 12, 24\]/.test(src), '考试提前量给 1/3/6/12/24 小时');
ok(/function hwOn\(\) \{ return pref\(KEY_HW, ''\) === '1'; \}/.test(src),
  '作业提醒默认关（老用户升级后不多出一条从没开过的提醒）');
ok(/function buildAll\(\)/.test(src), '有 buildAll() 把课程 + 作业合成一份');
ok(/const a = on\(\) \? build\(\) : \[\];/.test(src), 'buildAll 里课程那半受课程开关控制');
ok(/const b = hwOn\(\) \? buildHw\(\) : \[\];/.test(src), 'buildAll 里作业那半受作业开关控制');
ok(/kind: 'class', due: at \+ m \* 60000/.test(src), '课程条目也补了 kind=class（三类文案走同一套）');
ok(/if \(x\.expired === true\) return;/.test(src), 'buildHw 显式挡掉 expired');
ok(/isDoneStatus\(x\.status\)\) return;/.test(src), 'buildHw 显式挡掉已交');

/* apply 里不能再无条件 return 0：只开作业提醒、没开课程提醒的人也要挂上 */
ok(/const list = buildAll\(\);/.test(src), 'apply() 用的是 buildAll() 而不是只有课程的 build()');
ok(!/if \(!on\(\)\) return 0;/.test(src),
  'apply() 不再因为有 on() 为假就整段跳过（只开作业提醒也要生效）');

/* refresh 合流：同一 tick 多次调用只跑一次 */
ok(/let refreshTimer = null;/.test(src), 'refresh 有合流定时器');
ok(/if \(refreshTimer\) return;/.test(src), 'refresh 重复调用直接返回');

/* ---------------------------------------------------------------- 7. Java 侧契约 */
console.log('7. Java 侧：三类文案 + 两个新 channel');
const recv = read('android/src/com/xxmu/helper/ReminderReceiver.java');
const sch = read('android/src/com/xxmu/helper/ReminderScheduler.java');
const act = read('android/src/com/xxmu/helper/MainActivity.java');
ok(/KIND_CLASS = "class"/.test(recv) && /KIND_HW = "hw"/.test(recv) && /KIND_EXAM = "exam"/.test(recv),
  'Receiver 有 class/hw/exam 三类常量');
ok(/public static String normKind\(String k\)/.test(recv), 'normKind 脏值回落 class（老列表照旧说上课）');
ok(/CHANNEL_TASK = "xxmu_task_reminder"/.test(recv), '作业与考试有独立响铃 channel');
ok(/CHANNEL_TASK_SILENT = "xxmu_task_reminder_silent"/.test(recv),
  '作业与考试有独立静默 channel（能在系统设置里单独静音）');
ok(/还有 " \+ left \+ "截止"/.test(recv), '作业条本文案是「还有 N… 截止」');
ok(/left \+ "后开考"/.test(recv), '考试条本文案是「N… 后开考」');
ok(/static String leftSpan\(long min\)/.test(recv), '有时长格式化（分钟/小时/天三档）');
ok(/it\.putExtra\("kind", o\.optString\("kind", "class"\)\)/.test(sch),
  'Scheduler 把 kind 带进 intent，缺字段回落 class');
ok(/it\.putExtra\("due", o\.optLong\("due", 0L\)\)/.test(sch), 'Scheduler 把 due 带进 intent');
ok(/public void previewTaskReminder\(String kind, String name, String course\)/.test(act),
  'MainActivity 有独立的作业提醒预览桥（不复用课程的 previewReminder）');
ok(/xxmu_launch_tab/.test(act), 'MainActivity 把通知目标页写进 pref');
ok(/xxmu_launch_tab/.test(read('web/app.js')), 'app.js 启动时读并清掉这个 pref');

console.log('');
if (bad) {
  console.log('\u2717 作业/考试提醒 v2.2.0 行为测试失败 ' + bad + ' / ' + total + ' 项');
  process.exit(1);
}
console.log('\u2713 作业/考试提醒 v2.2.0 行为测试通过 ' + total + ' 项');
