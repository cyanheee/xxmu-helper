/* 糖梨借鉴落地的离线回归测试（v1.1.55）。
 *
 * 覆盖两个纯函数模块：
 *   · web/lesson-cmd.js —— AI 改课表纯文本 DSL（解析 / 整批拒绝 / 应用 / 撤销语义）
 *   · web/grades.js     —— 成绩「情况不明」三态 / 绩点 / 导入整批校验
 *
 * 为什么不靠真机：DSL 与绩点的失败方式全都是静默的（把 unknown 当 0 分、
 * 把解析不出的行悄悄跳过），真机上根本看不出来。固定输入断言才拦得住。
 * 用法：node tools/test_tangli.js   退出码 0=全过，1=有失败。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  -> ' + extra : '')); }
}
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), 'got=' + JSON.stringify(got)); }

function load(file, globalName) {
  const src = fs.readFileSync(path.join(ROOT, 'web', file), 'utf8');
  const sandbox = {
    console, Date, Math, JSON, String, Number, Array, Object, RegExp, isNaN,
    setTimeout, encodeURIComponent, decodeURIComponent, module: { exports: {} },
    localStorage: (() => {
      const m = {};
      return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
    })(),
    Host: undefined,   // 故意不提供，逼模块走 localStorage 兜底
    XXMU: { toast: () => {} },
    navigator: undefined,
    document: undefined,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { timeout: 3000 });
  /* 源码是 `const X = (()=>{...})()`：在 vm 里 const 不挂到 sandbox 上，
   * 用追加表达式把它取出来；同时保留 module.exports 兜底。 */
  try { return vm.runInContext(globalName, sandbox, { timeout: 1000 }); }
  catch (e) { return sandbox.module && sandbox.module.exports; }
}

const LC = load('lesson-cmd.js', 'LessonCmd');
const GR = load('grades.js', 'GRADES');
const TIMES = ['08:00~08:40', '08:40~09:20', '09:30~10:10', '10:20~11:00'];
const C = { start: '2026-08-31', times: TIMES, totalWeeks: 21, today: '2026-11-08' };

console.log('\n== LessonCmd 解析 ==');
{
  const r = LC.parse('河医大助手课表指令 v1\n+ 大学物理期中考试 | 周三 | 3-4节 | 第10周 | A201', C);
  ok('加课：无错误', r.errors.length === 0, JSON.stringify(r.errors));
  eq('加课：一条 add', r.ops.length, 1);
  eq('加课：day=3', r.ops[0].day, 3);
  eq('加课：periods=[3,4]', r.ops[0].periods, [3, 4]);
  eq('加课：weeks=[10]', r.ops[0].weeks, [10]);
  eq('加课：room=A201', r.ops[0].room, 'A201');
}
{
  const r = LC.parse('+ 解剖学 | 周一 | 第1-3周 | 3节 | A101', C);
  ok('周次区间解析', r.errors.length === 0, JSON.stringify(r.errors));
  eq('周次区间=[1,2,3]', r.ops[0].weeks, [1, 2, 3]);
  eq('单节=[3]', r.ops[0].periods, [3]);
}
{
  const r = LC.parse('+ 生理 | 周二 | 09:30 | 第5周', C);
  ok('钟点能对上作息→落到第3节', r.errors.length === 0, JSON.stringify(r.errors));
  eq('钟点=第3节', r.ops[0].periods, [3]);
}
{
  const r = LC.parse('+ 生理 | 周二 | 23:59 | 第5周', C);
  ok('钟点对不上作息→整条拒绝', r.errors.length > 0 && r.ops.length === 0);
}
{
  const r = LC.parse('+ 生理 | 周二 | 3-4节 | 第99周', C);
  ok('周次超出总周数→拒绝（不夹到21）', r.errors.length > 0 && r.ops.length === 0);
}
{
  const bad = '+ 生理 | 周二 | 3-4节 | 第5周\n+ 乱码课 | 周八 | 99节 | 第0周';
  const r = LC.parse(bad, C);
  ok('任意一行坏→整批 ops 为空', r.ops.length === 0 && r.errors.length > 0);
}
{
  const r = LC.parse('停 大学英语', C);
  ok('停课不给范围→拒绝整门删除', r.errors.length > 0 && r.ops.length === 0);
}
{
  const r = LC.parse('停 大学英语 | 第9周 | 周一 | 3-4节', C);
  ok('停课带范围→通过', r.errors.length === 0, JSON.stringify(r.errors));
  eq('停课 day=1 weeks=[9] periods=[3,4]',
    [r.ops[0].day, r.ops[0].weeks, r.ops[0].periods], [1, [9], [3, 4]]);
}
{
  const r = LC.parse('调 高等数学 | 第10周 | 周五 | 1-2节 -> 第11周 | 周六 | 3-4节 | B201', C);
  ok('调课带 -> →通过', r.errors.length === 0, JSON.stringify(r.errors));
  eq('调课 to.day=6', r.ops[0].to.day, 6);
  eq('调课 to.room=B201', r.ops[0].to.room, 'B201');
}
{
  const r = LC.parse('调 高等数学 | 第10周 | 周五 | 1-2节', C);
  ok('调课缺 -> →拒绝', r.errors.length > 0 && r.ops.length === 0);
}
{
  const r = LC.parse('假 2026-10-01 ~ 2026-10-07 | 国庆', C);
  ok('放假日期→通过', r.errors.length === 0, JSON.stringify(r.errors));
  ok('放假落在第5-6周', r.ops[0].weeks.length >= 1 && r.ops[0].weeks[0] >= 5,
    JSON.stringify(r.ops[0].weeks));
}
{
  const r = LC.parse('瞎写一行', C);
  ok('无法识别的指令→错误', r.errors.length > 0 && r.ops.length === 0);
}
{
  const r = LC.parse('', C);
  ok('空文本→报「没有读到指令」', r.errors.length > 0 && r.ops.length === 0);
}

console.log('\n== LessonCmd 应用 / 叠加 ==');
const BASE = [
  { name: '大学英语', teacher: '张', room: 'A101', day: 1, weeks: [9], periods: [3, 4], raw_weeks: '' },
  { name: '解剖学', teacher: '李', room: 'B201', day: 3, weeks: [10], periods: [1, 2], raw_weeks: '' },
];
{
  const out = LC.apply(BASE, [{ type: 'add', name: '加课', day: 3, weeks: [10], periods: [3, 4], room: 'A201' }], C);
  eq('加课不改动原数组', BASE.length, 2);
  eq('加课后 3 条', out.length, 3);
  eq('加课里 _cmd 标记', out[2]._cmd, true);
}
{
  const out = LC.apply(BASE, [{ type: 'stop', name: '大学英语', day: 1, weeks: [9], periods: [3, 4] }], C);
  eq('停课只删命中的', out.length, 1);
  eq('剩下解剖学', out[0].name, '解剖学');
}
{
  const out = LC.apply(BASE, [{
    type: 'move', name: '解剖学',
    from: { weeks: [10], day: 3, periods: [1, 2] },
    to: { weeks: [11], day: 6, periods: [3, 4], room: 'C301' },
  }], C);
  eq('调课 day→6 week→11 room→C301',
    [out[1].day, out[1].weeks, out[1].room], [6, [11], 'C301']);
}
{
  const out = LC.apply(BASE, [{ type: 'holiday', weeks: [9], name: '国庆' }], C);
  eq('放假把第9周的课整条滤掉', out.length, 1);
  eq('剩下的解剖学没被误删', out[0].name, '解剖学');
}
{
  const ctxText = LC.contextText(BASE, C);
  ok('说明里有学期/作息/现有课表', /第 1 周周一/.test(ctxText) && /1节=08:00~08:40/.test(ctxText) && /大学英语/.test(ctxText));
  const df = LC.diff(BASE, BASE.slice(1), [{ type: 'stop', name: '大学英语', weeks: [9], day: 1, periods: [3, 4] }]);
  ok('预览差异含 2→1 条', /2 条 → 1 条/.test(df));
}

console.log('\n== GRADES 三态 / 绩点 ==');
{
  eq('scoreOf("--")=null', GR.scoreOf('--'), null);
  eq('scoreOf("")=null', GR.scoreOf(''), null);
  eq('scoreOf("未出")=null', GR.scoreOf('未出'), null);
  eq('scoreOf(0)=0 分（真 0 分不是不明）', GR.scoreOf(0), 0);
  eq('scoreOf(87)=87', GR.scoreOf(87), 87);
  eq('scoreOf("abc")=null', GR.scoreOf('abc'), null);
}
{
  eq('pointOf(87)=3.7', GR.pointOf(87), 3.7);
  eq('pointOf(95)=4.0（封顶）', GR.pointOf(95), 4);
  eq('pointOf(59)=0', GR.pointOf(59), 0);
  eq('pointOf(null)=null', GR.pointOf(null), null);
}
{
  const g = GR.computeGpa([
    { name: '解剖学', credit: 5, score: 87 },
    { name: '英语', credit: 3, score: '--' },
    { name: '体育', credit: 2, score: 55 },
  ]);
  eq('unknown 单独计数=1', g.unknown, 1);
  eq('学分只算有分数的=7', g.credits, 7);
  /* (3.7*5 + 0*2) / 7 = 18.5/7 = 2.64（保留两位） */
  eq('绩点不被 unknown 拉偏', g.gpa, 2.64);
  eq('通过门数=1', g.passed, 1);
}
{
  const r = GR.parseImport('[{"name":"解剖学","credit":5,"score":87,"term":"2026-2027-1"}]');
  ok('合法导入无错', r.errors.length === 0 && r.list.length === 1, JSON.stringify(r.errors));
}
{
  const r = GR.parseImport('[{"name":"解剖学","credit":5},{"credit":"x","name":"坏"}]');
  ok('任一条坏→整批拒绝', r.errors.length > 0 && r.list.length === 0, JSON.stringify(r));
}
{
  const r = GR.parseImport('{bad json');
  ok('JSON 语法错→整批拒绝', r.errors.length > 0 && r.list.length === 0);
}
{
  const r = GR.parseImport('{"list":[{"name":"A","credit":5,"score":"--"}]}');
  ok('score="--" 允许（情况不明，不是错误）', r.errors.length === 0 && r.list[0].score === '--');
}
{
  const list = [
    { name: 'A', credit: 5, score: 87, term: '2026-2027-1' },
    { name: 'B', credit: 3, score: 90, term: '2025-2026-2' },
    { name: 'C', credit: 2, score: 60 },
  ];
  const t = GR.byTerm(list);
  eq('按学期归档 3 组', t.length, 3);
  eq('未分学期排最后', t[t.length - 1][0], '未分学期');
}

console.log('\n== 结论 ==');
console.log('  pass=' + pass + '  fail=' + fail);
process.exit(fail ? 1 : 0);
