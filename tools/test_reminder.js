/* 课程提醒链路的离线测试（前端算时间 + Java 挂闹钟 + manifest 注册，三段一起验）。
 *
 *   node tools/test_reminder.js
 *
 * 为什么非要三段一起验：
 *   v1.1.27 的课程提醒在真机上从来没响过。当时 reminder.js 写得完整、
 *   Host.scheduleReminders 桥也在、静态体检全 PASS —— 但 AndroidManifest.xml
 *   里没有 <receiver>，AlarmManager 到点广播无人接收，整条链路在最后一格断掉。
 *   前端断言全是 true 这件事给了人虚假的安全感。
 *   所以这里不只测 JS 算得对不对，还要测「Java 那头接不接得住」。
 *
 * 能验与不能验：
 *   能验 —— 时间戳算得对不对、requestCode 落在 1..200、manifest/类文件齐不齐。
 *   不能验 —— 通知到底弹不弹、Doze 下准不准。那要真机，别假装验过了。
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

/* ---------------------------------------------------------------- 前端：算时间 */

const src = read('web/reminder.js');

/** 从 reminder.js 里切出纯计算函数（不跑 DOM 部分） */
function cut(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(name + ' 花括号不配平');
}

function loadCalc(env) {
  /* build() 会调 mins() 取提前量；这里注入固定 15 分钟，
     mins() 自己的 pref 读取与 0~120 兜底不在本测试范围内。 */
  const code = [
    'function mins() { return 15; }',
    cut('startTimeOf'),
    cut('courseDate'),
    cut('build'),
    'this.__calc = { startTimeOf, courseDate, build };',
  ].join('\n');
  const sandbox = {
    TIMES: env.TIMES,
    START: env.START,
    TOTAL_WEEKS: env.TOTAL_WEEKS,
    DATA: env.DATA,
    Date,
    String,
    Array,
    parseInt,
    Date_now: Date.now,
  };
  sandbox.Date = Date;
  vm.createContext(sandbox);
  // build() 里用 Date.now()，用真实当前时间；测试数据都设成未来
  vm.runInContext(code, sandbox);
  return sandbox.__calc;
}

console.log('前端时间计算:');

/* 第 1 周周一 = 2030-01-07（元旦后的第一个周一），作息第 1 节 08:00 */
const START = new Date(2030, 0, 7, 0, 0, 0, 0);
const TIMES = ['08:00~08:45', '08:55~09:40', '10:00~10:45'];
const calc = loadCalc({
  START, TIMES, TOTAL_WEEKS: 20,
  DATA: {
    courses: [
      // 周一第 1 节，第 1 周
      { name: '高等数学', room: 'A101', day: 1, weeks: [1, 2], periods: [1] },
      // 周三第 2 节，第 1 周
      { name: '大学英语', room: 'B202', day: 3, weeks: [1], periods: [2] },
    ],
  },
});

const st = calc.startTimeOf(0);
ok(st && st.h === 8 && st.min === 0, '作息串 "08:00~08:45" 解析出 08:00', JSON.stringify(st));
ok(calc.startTimeOf(99) === null, '节次越界返回 null');
ok(calc.startTimeOf(0) !== null && calc.startTimeOf(1).h === 8 && calc.startTimeOf(1).min === 55,
  '第 2 节解析出 08:55');

const d1 = calc.courseDate({ day: 1 }, 0, 1);
ok(d1 && d1.getFullYear() === 2030 && d1.getMonth() === 0 && d1.getDate() === 7
  && d1.getHours() === 8 && d1.getMinutes() === 0,
  '第 1 周周一第 1 节 = 2030-01-07 08:00', d1 && d1.toString());

const d2 = calc.courseDate({ day: 3 }, 1, 1);
ok(d2 && d2.getDate() === 9 && d2.getHours() === 8 && d2.getMinutes() === 55,
  '第 1 周周三第 2 节 = 01-09 08:55', d2 && d2.toString());

/* 第 2 周应是 +7 天 */
const d3 = calc.courseDate({ day: 1 }, 0, 2);
ok(d3 && d3.getDate() === 14, '第 2 周同一节课 = 01-14（+7 天）', d3 && d3.getDate());

/* build()：只留未来 */
const now = Date.now();
const list = calc.build();
ok(Array.isArray(list), 'build() 返回数组');
ok(list.length > 0, 'build() 有产出（设的是未来学期）', list.length);
ok(list.every(x => x.at > now), '产出里没有已过去的时刻');
ok(list.every((x, i) => i === 0 || list[i - 1].at <= x.at), '按时间升序');
ok(list.every(x => typeof x.name === 'string' && typeof x.room === 'string' && typeof x.mins === 'number'),
  '每项都有 name/room/mins');
/* 「提前 15 分钟」应落到 07:45 */
const first = list[0];
const fm = new Date(first.at);
ok(first.name === '高等数学' && fm.getHours() === 7 && fm.getMinutes() === 45,
  '第 1 条 = 高等数学 07:45（08:00 前 15 分钟）',
  first.name + ' ' + fm.getHours() + ':' + fm.getMinutes());

/* 缺数据不能抛 */
const calcEmpty = loadCalc({ START, TIMES, TOTAL_WEEKS: 20, DATA: { courses: [] } });
ok(calcEmpty.build().length === 0, '没课时 build() 返回空数组而不是抛错');
const calcNoData = loadCalc({ START, TIMES, TOTAL_WEEKS: 20, DATA: undefined });
ok(calcNoData.build().length === 0, 'DATA 未定义时 build() 返回空数组');
/* 周次越界（超过 TOTAL_WEEKS）要被丢掉 */
const calcOut = loadCalc({
  START, TIMES, TOTAL_WEEKS: 2,
  DATA: { courses: [{ name: 'X', room: '', day: 1, weeks: [3], periods: [1] }] },
});
ok(calcOut.build().length === 0, '超出总周数的课不挂提醒');

/* ---------------------------------------------------------------- Java + manifest */

console.log('\nJava 侧接线:');
const mani = read('android/AndroidManifest.xml');
ok(/<receiver[^>]*android:name="\.ReminderReceiver"/.test(mani), 'manifest 注册了 ReminderReceiver');
ok(/<receiver[^>]*android:name="\.BootReceiver"/.test(mani), 'manifest 注册了 BootReceiver');
ok(/POST_NOTIFICATIONS/.test(mani), '声明 POST_NOTIFICATIONS');
ok(/SCHEDULE_EXACT_ALARM/.test(mani), '声明 SCHEDULE_EXACT_ALARM');
ok(/RECEIVE_BOOT_COMPLETED/.test(mani), '声明 RECEIVE_BOOT_COMPLETED');
ok(/BOOT_COMPLETED/.test(mani), 'BootReceiver 监听开机');
ok(/MY_PACKAGE_REPLACED/.test(mani), 'BootReceiver 监听换包（自更新后重挂）');
/* ReminderReceiver 只该被系统闹钟投递 */
const rcvTag = /<receiver[\s\S]*?android:name="\.ReminderReceiver"[\s\S]*?\/>/.exec(mani);
ok(rcvTag && /android:exported="false"/.test(rcvTag[0]),
  'ReminderReceiver exported=false（外部 App 不能伪造通知）');

const rcv = read('android/src/com/xxmu/helper/ReminderReceiver.java');
ok(/extends BroadcastReceiver/.test(rcv), 'ReminderReceiver 继承 BroadcastReceiver');
ok(/createNotificationChannel/.test(rcv), 'API 26+ 建 channel（不建就静默不弹）');
ok(/setSmallIcon\(/.test(rcv), '设置了 smallIcon（为空部分 ROM 直接不显示）');
ok(/FLAG_IMMUTABLE/.test(rcv), 'PendingIntent 用 FLAG_IMMUTABLE（API 31 强制）');
ok(/getStringExtra\("name"\)/.test(rcv) && /getStringExtra\("room"\)/.test(rcv),
  '读 scheduleReminders 塞进去的 name/room');

const sched = read('android/src/com/xxmu/helper/ReminderScheduler.java');
ok(/static int schedule\(/.test(sched), 'ReminderScheduler.schedule 存在');
ok(/static void cancelAll\(/.test(sched), 'ReminderScheduler.cancelAll 存在');
ok(/static void restore\(/.test(sched), 'ReminderScheduler.restore（重启重挂）存在');
ok(/KEY_LIST/.test(sched), '提醒列表落盘（重启时重放）');
/* requestCode 必须落在 1..MAX，否则 cancel 循环清不掉 */
ok(/keep\.length\(\) \+ 1/.test(sched), 'requestCode 按 keep.length()+1 递增（落在 1..MAX）');
ok(/i <= MAX/.test(sched), 'cancelAll 循环到 MAX');
ok(/canScheduleExactAlarms/.test(sched), 'Android 12+ 精确闹钟权限检查');
ok(/setAndAllowWhileIdle/.test(sched), '精确闹钟被拒时退非精确兜底');
ok(/setExactAndAllowWhileIdle/.test(sched), 'Doze 下用 setExactAndAllowWhileIdle');
/* 过去时刻不能挂 */
ok(/at <= now\) continue/.test(sched), '过去时刻不挂（避免一开就弹一堆过期通知）');

const mact = read('android/src/com/xxmu/helper/MainActivity.java');
ok(/ReminderScheduler\.schedule/.test(mact), 'MainActivity 调 ReminderScheduler.schedule');
ok(/ReminderScheduler\.cancelAll/.test(mact), 'MainActivity 调 ReminderScheduler.cancelAll');
ok(!/getBroadcast\(\s*MainActivity\.this,\s*i\s*\+\s*1/.test(mact),
  'MainActivity 里没有第二份闹钟构造（调度只留一份实现）');
ok(/onRequestPermissionsResult/.test(mact) && /__onNotifyPerm/.test(mact),
  '通知权限结果回传前端（不再假装已开启）');

/* ---------------------------------------------------------------- 前端与 Java 的契约 */

console.log('\n前后端契约:');
ok(/Host\.scheduleReminders\(JSON\.stringify\(list\.slice\(0,\s*200\)\)\)/.test(read('web/reminder.js')),
  '前端按 200 条上限截断后再交给 Java');
ok(/__onNotifyPerm\s*=/.test(src), '前端实现 window.__onNotifyPerm 回调');
ok(/exactAlarmOk/.test(src) && /openExactAlarmSettings/.test(src),
  '前端处理「精确闹钟被关掉」并给出设置入口');

console.log('\n' + (bad === 0
  ? '[PASS] 课程提醒链路 ' + total + ' 项全过（通知是否真弹仍需真机）'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
