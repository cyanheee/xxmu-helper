/* v1.1.78 课程提醒两个修复的离线测试（连堂去重 + 准时性）
 *
 *   node tools/test_reminder_fix.js
 *
 * 用户原话（m00382）：「有的课是三个课时，它每节课时前都提醒，应该同一门课
 *   只提醒一次。还有这个提醒有的有问题，有延迟或者不提醒（给通知权限了）」。
 *
 * 这两类都是「静态 has 锚点抓不住」的行为：
 *   ①连堂去重要真跑一遍 build() 才知道三节课是不是只剩一条；
 *   ②准时性要看 set() 里到底调的是 setAlarmClock 还是被 Doze 节流的
 *     setExactAndAllowWhileIdle，且要确认兜底顺序没被改反。
 * 所以这里既真跑 JS 逻辑，也按源码结构钉住两条主路径，不假装测过真机弹通知。
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
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

/** 从 reminder.js 里切出纯计算函数体（花括号配平，不跑 DOM 部分） */
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

/* ---------------------------------------------------------------- 1. 连堂去重（真跑 build） */
console.log('1. 连堂课（3 课时）同一门课只挂一条提醒');
function loadBuild(DATA, TIMES, START, TOTAL_WEEKS) {
  const code = [
    'function mins() { return 15; }',
    "function mode() { return 'alarm'; }",
    cut(src, 'startTimeOf'),
    cut(src, 'courseDate'),
    cut(src, 'build'),
    'this.__build = build;',
  ].join('\n');
  const s = {
    TIMES, START, TOTAL_WEEKS, DATA,
    Date, String, Array, parseInt,
  };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(code, s, { timeout: 3000 });
  return s.__build();
}

/* 第 1 周周一 = 2030-01-07；作息第一节 08:00、第二节 08:55、第三节 10:00 */
const START = new Date(2030, 0, 7, 0, 0, 0, 0);
const TIMES = ['08:00~08:45', '08:55~09:40', '10:00~10:45'];

/* 一门课 3 节连堂、上两周：老逻辑会挂 2 周 × 3 节 = 6 条，现在应各只剩 1 条 = 2 条 */
const triple = loadBuild({
  courses: [{ name: '外科学', room: 'C301', day: 1, weeks: [1, 2], periods: [1, 2, 3] }],
}, TIMES, START, 20);
ok(triple.length === 2, '3 节连堂 × 2 周 → 只有 2 条提醒（每门课每周一条）', triple.length);
ok(triple.every(x => x.name === '外科学'), '保留的还是这门课');
ok(triple.every(x => { const d = new Date(x.at); return d.getHours() === 7 && d.getMinutes() === 45; }),
  '每条都落在最早那节前 15 分钟 = 07:45（不是第 2/3 节）',
  triple.map(x => new Date(x.at).toString()).join(' | '));
/* 周次仍然各留一条（没把两周也合并掉） */
ok(triple.length === 2 && new Date(triple[0].at).getDate() === 7 && new Date(triple[1].at).getDate() === 14,
  '两周各一条（01-07 / 01-14），不是全学期只留一条');

/* 单节课不受影响：仍 1 周 1 条 */
const single = loadBuild({
  courses: [{ name: '诊断学', room: 'A101', day: 3, weeks: [1, 2], periods: [2] }],
}, TIMES, START, 20);
ok(single.length === 2, '单节课 × 2 周 → 仍 2 条（去重没误删普通课）', single.length);

/* 两门不同的课同一天同时段，不能被误合并成一条 */
const twoCourses = loadBuild({
  courses: [
    { name: '甲课', room: 'A', day: 1, weeks: [1], periods: [1, 2] },
    { name: '乙课', room: 'B', day: 1, weeks: [1], periods: [1, 2] },
  ],
}, TIMES, START, 20);
ok(twoCourses.length === 2, '两门不同课各留一条（只在同一门课内去重）', twoCourses.length);
ok(new Set(twoCourses.map(x => x.name)).size === 2, '两条分别是甲课 / 乙课');

/* 200 上限不再被连堂重复项吃光：一门课 3 节 × 20 周，老逻辑 60 条，现在 20 条 */
const many = loadBuild({
  courses: [{ name: '连堂大课', room: '', day: 2, weeks: Array.from({ length: 20 }, (_, i) => i + 1), periods: [1, 2, 3] }],
}, TIMES, START, 20);
ok(many.length === 20, '3 节 × 20 周 → 20 条（不是 60 条），200 名额不再被重复项吃光', many.length);

/* 源码结构：外层按 weeks、内层取最小 at，确认不是只在测试里拼的 */
ok(/weeks\.forEach\(w => \{[\s\S]*?periods\.forEach\(pRaw/.test(src),
  'build() 外层按周、内层遍历节次');
ok(/if \(at === null \|\| t < at\) at = t/.test(src),
  'build() 用「取最小 at」把连堂收敛到最早一节');
ok(/连堂只留最早一节|同一门课只提醒一次/.test(src), '源码注释写明连堂去重意图');

/* ---------------------------------------------------------------- 2. 准时性（setAlarmClock 穿透 Doze） */
console.log('\n2. 提醒准时性：主路径改用 setAlarmClock');
const sched = read('android/src/com/xxmu/helper/ReminderScheduler.java');
ok(/setAlarmClock\(/.test(sched), 'set() 主路径调 setAlarmClock（系统当用户真闹钟，穿透 Doze）');
ok(/new AlarmManager\.AlarmClockInfo\(at, null\)/.test(sched), '用 AlarmClockInfo(at, null) 构造');
ok(/Build\.VERSION\.SDK_INT >= 21/.test(sched), 'setAlarmClock 有 API21+ 守卫（minSdk24 满足）');
/* 主路径必须在精确/非精确兜底之前，否则永远轮不到它。
 * 用带 am. 前缀的「实际调用」定位，别用裸词 —— 方法注释里也提到了
 * 「以前主路径是 setExactAndAllowWhileIdle」，裸词 indexOf 会先命中注释。 */
const iClock = sched.indexOf('am.setAlarmClock(');
const iExact = sched.indexOf('am.setExactAndAllowWhileIdle');
const iAndAllow = sched.indexOf('am.setAndAllowWhileIdle');
ok(iClock >= 0 && iExact >= 0 && iClock < iExact, 'setAlarmClock 调用排在 setExactAndAllowWhileIdle 之前', iClock + ' / ' + iExact);
ok(iClock >= 0 && iAndAllow >= 0 && iClock < iAndAllow, 'setAlarmClock 调用排在非精确兜底之前');
/* 旧兜底仍在：万一 setAlarmClock 被拒，仍退回原来的精确/非精确，不会一条都挂不上 */
ok(/canScheduleExactAlarms/.test(sched), '保留 Android 12+ 精确闹钟权限兜底');
ok(/setExactAndAllowWhileIdle/.test(sched), '保留 setExactAndAllowWhileIdle 兜底');
ok(/setAndAllowWhileIdle/.test(sched), '保留非精确 setAndAllowWhileIdle 兜底');
ok(/catch \(Throwable ignored\) \{\}/.test(sched) || /catch \(Throwable/.test(sched), 'setAlarmClock 失败有 catch 降级');

/* 前后端 200 上限契约不变（去重在前端做，Java 侧契约不动） */
ok(/Host\.scheduleReminders\(JSON\.stringify\(list\.slice\(0,\s*200\)\)\)/.test(src),
  '前端仍按 200 条上限截断交给 Java（去重后名额自然够用）');

console.log('\n' + (bad === 0
  ? '[PASS] 提醒两修复 ' + total + ' 项全过（真机弹通知仍需确认）'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
