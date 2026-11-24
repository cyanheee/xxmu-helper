/* ============================================================
 * test_ics.js —— 日历导出（.ics）的离线测试
 *
 * 做法与 tools/test_export.js 一样：直接 require 真代码，不切字符串。
 * web/ics.js 末尾有 `if (typeof module !== 'undefined' && module.exports) module.exports = ICS;`
 * 所以在 node 里 require 拿到的就是那个模块对象。
 *
 * 跑法：node tools/test_ics.js
 * ============================================================ */
'use strict';

const path = require('path');
const ICS = require(path.join(__dirname, '..', 'web', 'ics.js'));

let pass = 0;
let fail = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  fails.push(label + (extra == null ? '' : '  (' + extra + ')'));
}
function eq(a, b, label) {
  ok(a === b, label, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
}

/* 固定一份作息：第 1~4 节，与 data/schedule.json 前四档一致。 */
const TIMES = ['08:00~08:40', '08:40~09:20', '09:30~10:10', '10:20~11:00'];
const START = new Date(2026, 8, 7); /* 2026-09-07 周一 */

/* ---------------------------------------------------------------- 1. 时间工具 */

eq(ICS.hm('08:00'), 480, 'hm 08:00');
eq(ICS.hm('8:00'), 480, 'hm 8:00 也认');
eq(ICS.hm('24:00'), 1440, 'hm 24:00');
eq(ICS.hm('08:60'), -1, 'hm 分超范围 → -1');
eq(ICS.hm('24:30'), -1, 'hm 24:30 → -1');
eq(ICS.hm(''), -1, 'hm 空串 → -1');
eq(ICS.hm(null), -1, 'hm null → -1');

const r1 = ICS.segRange('08:00~08:45');
ok(r1 && r1.a === 480 && r1.b === 525, 'segRange 波浪号', JSON.stringify(r1));
const r2 = ICS.segRange('08:00-08:45');
ok(r2 && r2.a === 480 && r2.b === 525, 'segRange 连字符');
const r3 = ICS.segRange('08:00～08:45');
ok(r3 && r3.a === 480, 'segRange 全角波浪号');
const r4 = ICS.segRange('08:00—08:45');
ok(r4 && r4.a === 480, 'segRange 破折号');
eq(ICS.segRange('08:45~08:00'), null, 'segRange 结束早于开始 → null');
eq(ICS.segRange('08:00'), null, 'segRange 只有一个时间 → null');
eq(ICS.segRange('garbage'), null, 'segRange 垃圾串 → null');

const pr = ICS.periodRange([1, 2], TIMES);
ok(pr && pr.a === 480 && pr.b === 560, 'periodRange 1-2 节 = 08:00~09:20', JSON.stringify(pr));
const pr2 = ICS.periodRange([2], TIMES);
ok(pr2 && pr2.a === 520 && pr2.b === 560, 'periodRange 单节 2 = 08:40~09:20', JSON.stringify(pr2));
const pr3 = ICS.periodRange([4, 1], TIMES);
ok(pr3 && pr3.a === 480 && pr3.b === 660, 'periodRange 乱序也取首尾', JSON.stringify(pr3));
eq(ICS.periodRange([9], TIMES), null, 'periodRange 越界 → null');
eq(ICS.periodRange([], TIMES), null, 'periodRange 空节次 → null');
eq(ICS.periodRange([1], []), null, 'periodRange 没有作息表 → null');
eq(ICS.periodRange([0], TIMES), null, 'periodRange 第 0 节 → null');

/* ---------------------------------------------------------------- 2. 周次压缩 */

const w1 = ICS.runsOf([3, 4, 5, 9, 10]);
eq(w1.length, 2, 'runsOf 两段');
ok(w1[0].from === 3 && w1[0].to === 5 && w1[1].from === 9 && w1[1].to === 10, 'runsOf 段边界', JSON.stringify(w1));
const w2 = ICS.runsOf([5, 3, 4, 4, 3]);
eq(w2.length, 1, 'runsOf 重复与乱序合成一段');
ok(w2[0].from === 3 && w2[0].to === 5, 'runsOf 合成 3-5', JSON.stringify(w2));
eq(ICS.runsOf([0, -1, 'x', null]).length, 0, 'runsOf 全坏 → 空');
eq(ICS.runsOf([]).length, 0, 'runsOf 空数组 → 空');
eq(ICS.runsOf(null).length, 0, 'runsOf null → 空');
const w3 = ICS.runsOf([1, 2, 3]);
ok(w3[0].from === 1 && w3[0].to === 3, 'runsOf 1-3');

/* ---------------------------------------------------------------- 3. 日期与格式 */

const d1 = ICS.parseDay('2026-09-07');
ok(d1 instanceof Date && d1.getFullYear() === 2026 && d1.getMonth() === 8 && d1.getDate() === 7,
  'parseDay 2026-09-07');
eq(ICS.parseDay('2026/09/07'), null, 'parseDay 斜杠不认（教务只给连字符）');
eq(ICS.parseDay(''), null, 'parseDay 空串 → null');
eq(ICS.parseDay(null), null, 'parseDay null → null');

const s1 = ICS.parseStamp('2026-10-28 22:00');
ok(s1 && s1.getHours() === 22 && s1.getMinutes() === 0, 'parseStamp 带时刻');
const s2 = ICS.parseStamp('2026-10-28');
ok(s2 && s2.getHours() === 0 && s2.getMinutes() === 0, 'parseStamp 只给日期 → 零点');
eq(ICS.parseStamp('明天'), null, 'parseStamp 中文 → null');

eq(ICS.fmtLocal(new Date(2026, 8, 7, 8, 0)), '20260907T080000', 'fmtLocal 格式');
eq(ICS.fmtLocal(new Date(2026, 11, 31, 23, 59)), '20261231T235900', 'fmtLocal 年末补零');
eq(ICS.fmtDay(new Date(2026, 0, 5)), '20260105', 'fmtDay 补零');

const dStart = ICS.dayOf(START, 1, 1);
ok(dStart.getFullYear() === 2026 && dStart.getMonth() === 8 && dStart.getDate() === 7, 'dayOf 第 1 周周一 = 开学日');
const dThu = ICS.dayOf(START, 3, 4);
ok(dThu.getMonth() === 8 && dThu.getDate() === 24, 'dayOf 第 3 周周四 = 9/24', dThu.toDateString());

/* ---------------------------------------------------------------- 4. 转义与折行 */

eq(ICS.esc('a;b,c\\d'), 'a\\;b\\,c\\\\d', 'esc 分号逗号反斜杠');
eq(ICS.esc('第一行\n第二行'), '第一行\\n第二行', 'esc 换行');
eq(ICS.esc(null), '', 'esc null → 空');

const longLine = 'SUMMARY:' + '很长的课程名称'.repeat(20);
const folded = ICS.fold(longLine);
ok(folded.indexOf('\r\n ') > 0, 'fold 长行插续行');
const parts = folded.split('\r\n ');
let allShort = true;
for (let i = 0; i < parts.length; i++) {
  if (Buffer.byteLength(parts[i], 'utf8') > 75) allShort = false;
}
ok(allShort, 'fold 每个物理行不超过 75 字节', parts.map(p => Buffer.byteLength(p, 'utf8')).join(','));
eq(ICS.fold('SUMMARY:短'), 'SUMMARY:短', 'fold 短行不动');

/* ---------------------------------------------------------------- 5. 生成课程事件 */

const course = { name: '人体解剖学', teacher: '庞盼姣', room: '3301', day: 1, weeks: [10, 11, 12], periods: [1, 2] };
const ev = ICS.courseEvent(course, { from: 10, to: 12 }, TIMES, START, '20261121T120000Z');
ok(Array.isArray(ev), 'courseEvent 返回行数组');
const evText = ev.join('\r\n');
ok(evText.indexOf('BEGIN:VEVENT') === 0, 'courseEvent 以 BEGIN:VEVENT 开头');
ok(evText.indexOf('DTSTART:20261109T080000') >= 0, 'courseEvent 第 10 周周一 08:00', evText.split('\r\n').filter(x => x.indexOf('DTSTART') === 0)[0]);
ok(evText.indexOf('DTEND:20261109T092000') >= 0, 'courseEvent 到第 2 节下课 09:20');
ok(evText.indexOf('RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO') >= 0, 'courseEvent 三周 RRULE');
ok(evText.indexOf('LOCATION:3301') >= 0, 'courseEvent 教室');
ok(evText.indexOf('END:VEVENT') >= 0, 'courseEvent 有 END');
ok(evText.indexOf('TZID') < 0 && evText.indexOf('DTSTART:2026') === 0 ? true : evText.indexOf('DTSTART:20') >= 0, 'DTSTART 是浮动时间（不带 Z / TZID）');
ok(/DTSTART:\d{8}T\d{6}\r/.test(evText) || /DTSTART:\d{8}T\d{6}$/.test(evText), 'DTSTART 末尾无 Z');

const evSingle = ICS.courseEvent({ name: '单周课', day: 2, weeks: [5], periods: [3] }, { from: 5, to: 5 }, TIMES, START, '20261121T120000Z');
const evSingleText = evSingle.join('\r\n');
ok(evSingleText.indexOf('RRULE') < 0, '单周不写 RRULE');
ok(evSingleText.indexOf('DTSTART:20261006T093000') >= 0, '第 5 周周二第 3 节 = 10/6 09:30', evSingleText.split('\r\n').filter(x => x.indexOf('DTSTART') === 0)[0]);

eq(ICS.courseEvent({ name: 'x', day: 8, weeks: [1], periods: [1] }, { from: 1, to: 1 }, TIMES, START, 'S'), null, 'courseEvent 周八 → null');
eq(ICS.courseEvent({ name: 'x', day: 1, weeks: [1], periods: [99] }, { from: 1, to: 1 }, TIMES, START, 'S'), null, 'courseEvent 节次越界 → null');
eq(ICS.courseEvent({ name: 'x', day: 1, weeks: [1], periods: [1] }, null, TIMES, START, 'S'), null, 'courseEvent 没周段 → null');

/* ---------------------------------------------------------------- 6. 生成截止事件 */

const dueItem = { kind: 'work', name: '病理学实验报告', course: '病理学', status: '待做', at: new Date(2026, 10, 25, 23, 0) };
const due = ICS.dueEvent(dueItem, '20261121T120000Z');
const dueText = due.join('\r\n');
ok(dueText.indexOf('DTSTART:20261125T230000') >= 0, '作业截止 DTSTART');
ok(dueText.indexOf('DTEND:20261125T233000') >= 0, '作业截止 DTEND 半小时后');
ok(dueText.indexOf('SUMMARY:作业截止 · 病理学实验报告') >= 0, '作业截止 标题');
ok(dueText.indexOf('BEGIN:VALARM') >= 0 && dueText.indexOf('TRIGGER:-PT60M') >= 0, '带提前 1 小时提醒');

const examDue = ICS.dueEvent({ kind: 'exam', name: '交通安全测试题', at: new Date(2026, 9, 28, 22, 0) }, 'S');
ok(examDue.join('\r\n').indexOf('SUMMARY:考试截止 · 交通安全测试题') >= 0, '考试截止 标题');
eq(ICS.dueEvent({ kind: 'work', name: 'x', at: null }, 'S'), null, '没时间 → null');
eq(ICS.dueEvent(null, 'S'), null, 'null 条目 → null');

/* ---------------------------------------------------------------- 7. 整份文件 */

const built = ICS.build([course], { start: START, times: TIMES, hw: [dueItem] });
ok(built.text.indexOf('BEGIN:VCALENDAR') === 0, 'build 以 BEGIN:VCALENDAR 开头');
ok(built.text.indexOf('END:VCALENDAR') > 0, 'build 有 END:VCALENDAR');
ok(built.text.indexOf('VERSION:2.0') >= 0, 'build 有 VERSION:2.0');
ok(built.text.indexOf('PRODID:') >= 0, 'build 有 PRODID');
eq(built.courses, 1, 'build 一节课一个事件');
eq(built.dues, 1, 'build 一条截止一个事件');
eq(built.events, 2, 'build 事件总数');
eq(built.skipped, 0, 'build 没有跳过');
ok(built.text.indexOf('\n\n') < 0, 'build 没有空行（RFC 要求每行都是属性）');
eq(built.startMissing, false, 'start 给全了 → startMissing=false');

const noStart = ICS.build([course], { start: null, times: TIMES, hw: [] });
eq(noStart.startMissing, true, 'start 缺 → startMissing=true');
eq(noStart.courses, 0, 'start 缺 → 不生成课程事件');
ok(noStart.text.indexOf('VEVENT') < 0, 'start 缺 → 没有任何 VEVENT');

const badCourse = { name: '坏课', day: 1, weeks: [1], periods: [99] };
const badBuilt = ICS.build([badCourse], { start: START, times: TIMES, hw: [] });
eq(badBuilt.skipped, 1, '读不出时间的课计入 skipped');
eq(badBuilt.courses, 0, '读不出时间的课不生成事件');

const emptyWeeks = ICS.build([{ name: '没周次', day: 1, weeks: [], periods: [1] }], { start: START, times: TIMES, hw: [] });
eq(emptyWeeks.skipped, 0, '周次是空的 → 不算「读不出来」（本来就没有）');
eq(emptyWeeks.courses, 0, '周次是空的 → 不生成');

const noneBuilt = ICS.build([], { start: START, times: TIMES, hw: [] });
ok(noneBuilt.text.indexOf('BEGIN:VCALENDAR') === 0, '空课表也产出合法骨架');
eq(noneBuilt.events, 0, '空课表 0 事件');

/* 真实数据量：75 门课也不该炸 */
const many = [];
for (let i = 0; i < 75; i++) {
  many.push({ name: '课' + i, day: (i % 7) + 1, weeks: [i % 16 + 1, i % 16 + 2], periods: [1, 2] });
}
const bigBuilt = ICS.build(many, { start: START, times: TIMES, hw: [] });
ok(bigBuilt.events >= 75, '75 门课全部生成', 'events=' + bigBuilt.events);
ok(Buffer.byteLength(bigBuilt.text, 'utf8') < 512 * 1024, '75 门课文件小于 512KB', Buffer.byteLength(bigBuilt.text, 'utf8') + 'B');

/* ---------------------------------------------------------------- 8. 文件名与导出表 */

ok(/^河医大助手课表-\d{8}\.ics$/.test(ICS.fileName(new Date(2026, 10, 21))), 'fileName 形状', ICS.fileName(new Date(2026, 10, 21)));
const api = ['init', 'openPanel', 'build', 'courseEvent', 'dueEvent', 'periodRange', 'segRange',
  'runsOf', 'dayOf', 'parseDay', 'parseStamp', 'fmtLocal', 'esc', 'fold', 'hm', 'fileName', 'saveFile'];
let missing = api.filter(k => typeof ICS[k] !== 'function');
eq(missing.length, 0, '导出表齐全', missing.join(','));

/* ---------------------------------------------------------------- 9. 源码纪律 */

const fs = require('fs');
const raw = fs.readFileSync(path.join(__dirname, '..', 'web', 'ics.js'), 'utf8');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok(code.indexOf('toISOString') < 0, '不许用 toISOString（UTC 会早 8 小时）');
ok(code.indexOf("new Date('") < 0, '不许用字符串构造 Date（iOS WebView 解析不稳）');
ok(code.indexOf('TZID') < 0, '不许写 TZID（导入端可能不认识 Asia/Shanghai）');
ok(code.indexOf('navigator.clipboard') < 0, '剪贴板只走 textarea 降级（file:// 下 clipboard 多半没有）');
ok(code.indexOf('typeof module === \'undefined\'') >= 0, '自启动守卫写法');
ok(code.indexOf('!module.exports') < 0, '绝不用 !module.exports 守卫（ReferenceError）');
ok(code.indexOf('2026-08-31') < 0, '不许硬编码开学日（要从 START 读）');

/* ---------------------------------------------------------------- 汇总 */

console.log('[ics] pass=' + pass + ' fail=' + fail);
if (fail) {
  fails.forEach(f => console.log('  FAIL ' + f));
  process.exit(1);
}
console.log('[PASS] 日历导出 v2.13.0 行为测试通过 ' + pass + ' 项');
