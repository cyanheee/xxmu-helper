/* tools/test_gradepull.js —— v2.6.0 档 C「从教务读成绩」行为测试
 *
 * 做法与 test_export.js 一致：直接 require 真代码（gradepull.js 末尾有
 * module.exports），不进 DOM、不发网络。纯函数全部喂真表单形状的 HTML。
 *
 * 最要紧的两组断言是 [3] 和 [4]：
 *   [3] 表头按关键字找列，而不是按位置 —— 各校青果的列顺序不一样，
 *       写死列号会在另一所学校把「学分」当「成绩」。
 *   [4] 文字等级原样保留，绝不换算 —— 一旦换算，绩点会算出一个
 *       看着很专业、实际是编出来的数。
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'web', 'gradepull.js'));

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + label + (extra ? ' → ' + extra : ''));
}
function eq(a, b, label) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(sa === sb, label, sa + ' ≠ ' + sb);
}

/* 一份「常见青果」成绩表：表头 + 四行数据 + 一行合计。 */
const HTML_A = `
<html><body>
<table class="Nsb_r_list">
 <tr><td>学号</td><td>20261440105</td><td>姓名</td><td>张三</td></tr>
 <tr><th>课程名称</th><th>学分</th><th>成绩</th><th>绩点</th><th>学期</th><th>任课教师</th></tr>
 <tr><td>系统解剖学</td><td>5</td><td>87</td><td>3.7</td><td>2026-2027-1</td><td>李四</td></tr>
 <tr><td>生理学</td><td>4</td><td>78</td><td>2.8</td><td>2026-2027-1</td><td>王五</td></tr>
 <tr><td>病理学</td><td>4</td><td>--</td><td>--</td><td>2026-2027-1</td><td>赵六</td></tr>
 <tr><td>医学伦理学</td><td>2</td><td>优秀</td><td>--</td><td>2026-2027-1</td><td>钱七</td></tr>
 <tr><td>合计</td><td>15</td><td></td><td></td><td></td><td></td></tr>
</table>
</body></html>`;

/* 列顺序不同的一份：成绩在学分前面，而且用 <td> 当表头。 */
const HTML_B = `
<table>
 <tr><td>课程名</td><td>成绩</td><td>学分</td></tr>
 <tr><td>药理学</td><td>91</td><td>3</td></tr>
</table>`;

/* 完全没有成绩表的页面（登录后的框架页）。 */
const HTML_C = `<html><body><div id="frmbody">欢迎使用教务系统</div></body></html>`;

/* 未登录时青果回的那段 547 字节 alert。 */
const STALE = `<script>alert('温馨提示：凭证已失效，请重新登录!');
if (window.frmbody){ window.top.location.href='/'; }</script>`;

console.log('v2.6.0 从教务读成绩 · 行为测试\n');

/* ---------------- [1] cellText：标签/实体/空白 ---------------- */
console.log('[1] cellText');
eq(G.cellText('<b>系统解剖学</b>'), '系统解剖学', '1.1 去标签');
eq(G.cellText('A&nbsp;&nbsp;B'), 'A B', '1.2 &nbsp; 归一成单空格');
eq(G.cellText('  <span> 87 </span>  '), '87', '1.3 去首尾空白');
eq(G.cellText('&lt;script&gt;'), '<script>', '1.4 实体还原');
eq(G.cellText('<script>var a=1;</script>正文'), '正文', '1.5 script 整段丢掉');
eq(G.cellText(null), '', '1.6 null 不崩');
eq(G.cellText('  多   空   白  '), '多 空 白', '1.7 连续空白压成一个');

/* ---------------- [2] rowsOf：按行按格切 ---------------- */
console.log('[2] rowsOf');
const rA = G.rowsOf(HTML_A);
ok(rA.length === 7, '2.1 七行（学号行 + 表头 + 四门 + 合计）', '共 ' + rA.length);
eq(rA[1], ['课程名称', '学分', '成绩', '绩点', '学期', '任课教师'], '2.2 表头六格');
eq(rA[0].length, 4, '2.3 学号那行四格');
ok(G.rowsOf('').length === 0, '2.4 空串给空数组');
ok(G.rowsOf('<tr></tr>').length === 0, '2.5 空 tr 不算一行');

/* ---------------- [3] colsOf / parseGradeTable：按关键字找列 ---------------- */
console.log('[3] 表格解析（按关键字找列，不按位置）');
const cA = G.colsOf(['课程名称', '学分', '成绩', '绩点', '学期', '任课教师']);
eq([cA.name, cA.credit, cA.score, cA.point, cA.term, cA.teacher], [0, 1, 2, 3, 4, 5], '3.1 常见列序');
const cB = G.colsOf(['课程名', '成绩', '学分']);
eq([cB.name, cB.score, cB.credit], [0, 1, 2], '3.2 成绩在学分前面也认得（不按位置）');
const cC = G.colsOf(['序号', '课程/环节', '成绩', '绩点']);
ok(cC.name === 1 && cC.score === 2 && cC.point === 3, '3.3 「课程/环节」算课程列、绩点不顶替成绩', JSON.stringify(cC));

const pA = G.parseGradeTable(HTML_A);
ok(pA.matched === true, '3.4 认得出成绩表');
eq(pA.list.length, 4, '3.5 四门课（合计那行被剔掉）', '共 ' + pA.list.length);
eq(pA.list[0], { name: '系统解剖学', credit: 5, score: '87', term: '2026-2027-1', teacher: '李四' }, '3.6 第一门整条');
eq(pA.list[2].score, '--', '3.7 「--」原样留着（不当 0 分）');
eq(pA.list[3].score, '优秀', '3.8 文字等级原样留着（不换算 90）');
ok(pA.list.every((x) => x.name !== '合计'), '3.9 合计行必须剔掉');
ok(pA.list.every((x) => x.name !== '课程名称'), '3.10 表头不能变成一门课');
eq(pA.header, ['课程名称', '学分', '成绩', '绩点', '学期', '任课教师'], '3.11 header 回报表头原文');

const pB = G.parseGradeTable(HTML_B);
eq(pB.list[0], { name: '药理学', credit: 3, score: '91', term: '', teacher: '' }, '3.12 列序不同的表也解对');

const pC = G.parseGradeTable(HTML_C);
ok(pC.matched === false && pC.list.length === 0, '3.13 没有成绩表时 matched=false 且 list 为空（不给半张表）');

/* 一张表里出现两次表头（分段表）：第二段要换列号，且表头不能变成课 */
const HTML_D = `
<tr><td>课程名称</td><td>学分</td><td>成绩</td></tr>
<tr><td>系统解剖学</td><td>5</td><td>87</td></tr>
<tr><td>课程名称</td><td>学分</td><td>成绩</td></tr>
<tr><td>生理学</td><td>4</td><td>78</td></tr>`;
const pD = G.parseGradeTable(HTML_D);
eq(pD.list.length, 2, '3.14 分段表：两门课，表头不重复计数', '共 ' + pD.list.length);
ok(pD.tables === 2, '3.15 报了两次表头 → tables=2', String(pD.tables));
eq(pD.list.map((x) => x.name), ['系统解剖学', '生理学'], '3.16 分段表两门都对');

/* ---------------- [4] looksStale / isGradeWord ---------------- */
console.log('[4] 失效判定与文字等级');
ok(G.looksStale('凭证已失效', '') === true, '4.1 正文含「凭证已失效」');
ok(G.looksStale('', STALE) === true, '4.2 短响应 + 跳转根目录');
ok(G.looksStale('', '<html>' + 'x'.repeat(4000) + "location.href='/'</html>") === false,
  '4.3 长页面里出现跳转字样不算失效（宁可漏判）');
ok(G.looksStale('欢迎使用教务系统', '<html><body>欢迎</body></html>') === false, '4.4 正常页面不算失效');
ok(G.looksStale('', '<input id="dosub">') === true, '4.5 被打回 CAS 登录页');

ok(G.isGradeWord('优秀') === true, '4.6 优秀是文字等级');
ok(G.isGradeWord('不及格') === true, '4.7 不及格是文字等级');
ok(G.isGradeWord('87') === false, '4.8 数字不是文字等级');
ok(G.isGradeWord('') === false, '4.9 空串不是');
ok(G.isGradeWord('--') === true, '4.10 「--」按文字等级算（会在面板里点出来）');

/* ---------------- [5] mergeInto：合并语义 ---------------- */
console.log('[5] 合并（新读到 vs 本机已有）');
const prev = [
  { name: '系统解剖学', credit: 5, score: '87', term: '2026-2027-1', teacher: '李四' },
  { name: '病理学', credit: 4, score: '55', term: '2026-2027-1', teacher: '赵六' },
  { name: '体育', credit: 1, score: '90', term: '2025-2026-2', teacher: '' }
];
const fresh = [
  { name: '系统解剖学', credit: 5, score: '88', term: '2026-2027-1', teacher: '李四' },
  { name: '病理学', credit: 4, score: '--', term: '2026-2027-1', teacher: '赵六' },
  { name: '药理学', credit: 3, score: '91', term: '2026-2027-1', teacher: '' }
];
const m = G.mergeInto(prev, fresh);
eq(m.list.length, 4, '5.1 合并后四门（新增一门，旧的三门都在）', '共 ' + m.list.length);
eq(m.list[0].score, '88', '5.2 新值读得到 → 用新值');
eq(m.list[1].score, '55', '5.3 新值读不出分、旧值读得出 → 保留旧分（不降级覆盖）');
eq(m.list[2].score, '90', '5.4 教务没返回的旧课原样留着');
eq(m.list[3].name, '药理学', '5.5 新课追加在末尾');
eq(m.stats.added, 1, '5.6 stats.added=1');
eq(m.stats.updated, 2, '5.7 stats.updated=2');
ok(prev[1].score === '55', '5.8 不许改到入参（纯函数）');

const m2 = G.mergeInto([], []);
ok(m2.list.length === 0 && m2.stats.added === 0, '5.9 空 + 空不崩');
const m3 = G.mergeInto(null, fresh);
eq(m3.list.length, 3, '5.10 旧值 null 也能合并');
const m4 = G.mergeInto(prev, [{ name: '系统解剖学', credit: 0, score: '88', term: '2026-2027-1', teacher: '' }]);
eq(m4.list[0].credit, 5, '5.11 新值学分是 0 → 保留旧学分（0 不是「改成 0 学分」）');

/* ---------------- [6] 源码纪律 ---------------- */
console.log('[6] 源码纪律');
const SRC = require('fs').readFileSync(path.join(ROOT, 'web', 'gradepull.js'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(SRC.indexOf('/* @testable:parseGradeTable */') >= 0, '6.1 有 @testable 标记');
['parseGradeTable', 'mergeInto', 'looksStale', 'isGradeWord', 'rowsOf', 'colsOf', 'cellText']
  .forEach((n, i) => ok(SRC.indexOf('@testable:' + n) >= 0, '6.2.' + (i + 1) + ' ' + n + ' 有标记'));
ok(CODE.indexOf('fetch(') < 0, '6.3 不许自己发 fetch');
ok(CODE.indexOf('XMLHttpRequest') < 0, '6.4 不许 XMLHttpRequest');
ok(CODE.indexOf('netCk(') >= 0, '6.5 走 XXMU.netCk（带 Cookie 的那条桥）');
ok(CODE.indexOf("'POST'") < 0 && CODE.indexOf('"POST"') < 0, '6.6 只 GET，不出现任何 POST');
ok(CODE.indexOf('85') < 0 || CODE.indexOf('优秀') >= 0, '6.7 没有把文字等级换算成分数的常量');
/* 反向：不许出现「按位置取列」这种写法（把列号写死成 3 / 4） */
ok(!/cells\[\s*[2-9]\s*\]/.test(CODE), '6.8 不许按位置硬取列号');
ok(typeof G.PATHS === 'object' && G.PATHS.length === 3, '6.9 三条候选路径');
ok(G.BASE === 'https://qgjw.xxmu.edu.cn', '6.10 域名与 sync.js 一致');

console.log('\n' + (fail === 0
  ? '✓ 从教务读成绩 v2.6.0 行为测试通过 ' + pass + ' 项'
  : '✗ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项'));
process.exit(fail === 0 ? 0 : 1);
