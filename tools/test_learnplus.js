/* 学习页三个新功能的离线回归测试（v2.0.0）。
 *
 * 为什么要有这个：这三个功能都在「说一句话给学生听」，而说错话的代价
 * 比不说大得多 ——
 *   · 「今日课程已结束」说早了，人就不去上课了；
 *   · 「还剩 3 小时」说错了，人点进去发现已经交了；
 *   · 「剩下的课平均考 69 分就够」算错了，整个学期的目标就按错的方向走。
 * 这三件事都没法靠截图看真假，只能把判断抽成纯函数钉死。
 *
 * web/learnplus.js 自带 `module.exports`，所以这里直接 require 真实代码
 * （不是从源码里切字符串），测的就是跑在手机上的那一份。
 *
 * 用法：node tools/test_learnplus.js
 * 退出码 0 = 全过；1 = 有失败。
 */
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LP = require(path.join(ROOT, 'web', 'learnplus.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

/* 造一条作业/考试，字段与 renderHomework 里 items.push 的一致。 */
function it(o) {
  return Object.assign({
    kind: 'work', name: 'x', course: '某课', status: '待做', open: true,
    notStart: false, expired: false, left: 10,
  }, o || {});
}

/* 本地时间造一个秒级时间戳：周末几号无所谓，「今天」只看时分。 */
function at(h, m) {
  return new Date(2026, 10, 21, h, m || 0, 0, 0).getTime() / 1000;
}

/* 校方作息（与 web/data.js 的 window.SCHEDULE.times 前六节一致） */
const TIMES = ['08:00~08:40', '08:50~09:30', '10:00~10:40', '10:50~11:30',
  '14:00~14:40', '14:50~15:30'];

function main() {
  console.log('\n[v2.0.0] 学习页：今日一行 / 复制未完成 / 目标绩点');

  ok('① 模块导出了三个纯函数',
    typeof LP.todaySummary === 'function' && typeof LP.undoneText === 'function'
    && typeof LP.gpaNeed === 'function');

  /* ---------- ② 今日一行：下一节课 ---------- */
  const b1 = [{ name: '系统解剖学', room: 'A101', start: 1, span: 2 },
    { name: '生理学', room: 'B203', start: 3, span: 2 }];
  let s = LP.todaySummary(b1, TIMES, [], at(9, 0));
  ok('② 09:00 时下一节是 10:00 的生理学',
    s.next && s.next.name === '生理学' && s.next.at === 600, JSON.stringify(s.next));
  ok('② 今日有课 → has=true', s.has === true);
  ok('② 还没上完 → ended=false', s.ended === false);

  s = LP.todaySummary(b1, TIMES, [], at(7, 0));
  ok('② 07:00 时下一节是 08:00 的系统解剖学',
    s.next && s.next.name === '系统解剖学' && s.next.at === 480, JSON.stringify(s.next));

  /* ---------- ③ 今日一行：全都上完了才算结束 ---------- */
  s = LP.todaySummary(b1, TIMES, [], at(23, 0));
  ok('③ 23:00 全部上完 → ended=true', s.ended === true && s.next === null);

  /* ---------- ④ 钟点读不到就不敢说「结束了」 ---------- */
  s = LP.todaySummary(b1, [], [], at(23, 0));
  ok('④ 没有作息表 → 不下「已结束」结论', s.ended === false, 'ended=' + s.ended);
  ok('④ 没有作息表 → next.at 为 null（只说第几节）',
    s.next && s.next.at === null && s.next.start === 1, JSON.stringify(s.next));
  ok('④ 没有作息表 → has 仍为 true', s.has === true);

  /* ---------- ⑤ 没课 ---------- */
  s = LP.todaySummary([], TIMES, [], at(9, 0));
  ok('⑤ 今天没课 → has=false 且 next=null', s.has === false && s.next === null);
  ok('⑤ 没课不能说「已结束」（那是两句话）', s.ended === false);

  /* ---------- ⑥ 最近截止：只算还能交的 ---------- */
  const items = [
    it({ name: '已过期作业', left: -50, expired: true }),
    it({ name: '已经交了', left: 20, status: '已完成' }),
    it({ name: '明天交', left: 30 }),
    it({ name: '今晚交', left: 3 }),
    it({ name: '考试', kind: 'exam', left: 100, status: '未开考', open: false, notStart: true }),
  ];
  s = LP.todaySummary([], TIMES, items, at(9, 0));
  ok('⑥ 最近截止取 left 最小的「今晚交」',
    s.due && s.due.name === '今晚交' && s.due.left === 3, JSON.stringify(s.due));
  ok('⑥ 待做条数不含已完成/已过期 → 3 件', s.dueN === 3, 'dueN=' + s.dueN);

  /* ---------- ⑦ 复制清单：格式与顺序 ---------- */
  const txt = LP.undoneText(items, h => '还剩 ' + h + ' 小时');
  ok('⑦ 首行是件数', txt.split('\n')[0] === '还差 3 件', txt.split('\n')[0]);
  ok('⑦ 最紧的排第一条', txt.split('\n')[1].indexOf('今晚交') > 0, txt.split('\n')[1]);
  ok('⑦ 带作业/考试标签', txt.indexOf('[作业]') > 0 && txt.indexOf('[考试]') > 0);
  ok('⑦ 已过期的不进清单', txt.indexOf('已过期作业') < 0);
  ok('⑦ 已交的不进清单', txt.indexOf('已经交了') < 0);
  ok('⑦ 没有待做时返回空串', LP.undoneText([it({ status: '已完成' })], String) === '');
  ok('⑦ 截止时间读不到时说「未读到」而不是瞎猜',
    LP.undoneText([it({ left: null })], String).indexOf('截止时间未读到') > 0);

  /* ---------- ⑧ 目标绩点反推 ---------- */
  const stat = { gpa: 3.2, credits: 100, unknown: 0, passed: 20 };
  let r = LP.gpaNeed(stat, 3.0, 18);
  ok('⑧ 目标 3.0 + 剩 18 学分 → 平均考 69 分',
    r.ok && r.score === 69 && r.feasible === true, JSON.stringify(r));
  ok('⑧ 平均绩点 1.89', r.ok && Math.abs(r.point - 1.89) < 0.01, r.point);

  r = LP.gpaNeed(stat, 3.5, 18);
  ok('⑧ 目标 3.5 追不上 → feasible=false 且封顶 90 分',
    r.ok && r.feasible === false && r.score === 90, JSON.stringify(r));

  r = LP.gpaNeed(stat, 2.0, 18);
  ok('⑧ 目标比现状还低 → 需要的分数按 0 算', r.ok && r.score === 0, JSON.stringify(r));

  r = LP.gpaNeed(stat, 3.0, 0);
  ok('⑧ 剩余学分为 0 不硬算', r.ok === false, JSON.stringify(r));

  r = LP.gpaNeed({ gpa: null, credits: 0, unknown: 3, passed: 0 }, 3.0, 18);
  ok('⑧ 一门都没出分时如实说没成绩', r.ok === false, JSON.stringify(r));

  /* 边界：4.0 是封顶，别算出「需要 100 分」这种不可能的数 */
  const top = { gpa: 3.95, credits: 100, unknown: 0, passed: 20 };
  r = LP.gpaNeed(top, 4.0, 10);
  ok('⑧ 需要满分时分数封在 90（4.0 制的顶）', r.ok && r.score === 90, JSON.stringify(r));

  /* ---------- ⑨ 「还剩多久」只有一个口径 ----------
   * m05936 的病：学习页印「还剩 11 小时 60 分」，同一时刻作业卡印「还剩 12 小时」。
   * 原因是 learnplus.js 自己抄了一份拼字逻辑、抄漏了「分钟进位到 60」的归一化。
   * 这里把 app.js 里的正主 fmtLeft 抠出来跑一遍，两边逐条比对。 */
  const fs = require('fs');
  const appSrc = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');
  const m = appSrc.match(/function fmtLeft\(h\)\s*\{[\s\S]*?\n\}/);
  ok('⑨ app.js 里找得到 fmtLeft', !!m);
  let fmtLeft = null;
  if (m) {
    // eslint-disable-next-line no-new-func
    fmtLeft = new Function('return (' + m[0] + ')')();
    global.fmtLeft = fmtLeft;   // 让 learnplus 的 relText 走到「借正主」那条分支
  }
  ok('⑨ app.js::fmtLeft 可用', typeof fmtLeft === 'function');

  /* 11 小时 59 分 40 秒 = 11.9944 小时：四舍五入到分钟会变成 12 小时 00 分 */
  ok('⑨ 11.9944 小时不印「11 小时 60 分」',
    fmtLeft && fmtLeft(11.9944) === '还剩 12 小时', fmtLeft && fmtLeft(11.9944));
  ok('⑨ 学习页同一时刻的说法与作业卡一致',
    LP.relText(11.9944) === '还剩 12 小时', LP.relText(11.9944));

  /* 全区间逐条比对：任何一个值两边不一致都算口径分裂 */
  const probes = [null, -0.5, -3, 0, 0.001, 0.2, 0.5, 0.99, 1, 1.5, 2.25,
    11.9944, 12, 23.9999, 24.5, 47.99, 47.9999, 48, 49, 71.5, 119.99, 240];
  let mismatch = null;
  for (const p of probes) {
    const a = p == null ? '截止未读到' : (p < 0 ? '已过截止' : fmtLeft(p));
    const b = LP.relText(p);
    if (a !== b) { mismatch = p + ': app=' + a + ' / learn=' + b; break; }
  }
  ok('⑨ 23 个边界值两边完全一致', mismatch === null, mismatch);

  /* 不印 60 分：把 0~48 小时每一分钟都扫一遍 */
  let bad = null;
  for (let mi = 0; mi <= 48 * 60; mi++) {
    const t = fmtLeft(mi / 60);
    if (/ 60 分| 0 分|NaN|undefined/.test(t)) { bad = (mi / 60) + 'h → ' + t; break; }
  }
  ok('⑨ 扫遍 2881 个分钟点都不出「60 分」', bad === null, bad);

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail)
    + ' assertions: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

main();
