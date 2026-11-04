/* 课表解析器离线断言（v1.1.13）
 *
 * 起因：用户报「20261430313 这个学号的同学不管怎么样，就是没有课程表，
 * 重新登陆，清数据，重新安装都试了」。查下来解析层有两个会「静默丢课」的洞：
 *
 *   1. 单元格 id 正则 `id=['"]k(\d)(\d)['"]` 只认两位节次（1-9）。
 *      第 10 节及以后是 k110 / k310 这种三位，正则先吃 "11" 再要求引号，
 *      后面跟着 "0" → 失配 → 那一整格的课消失，不报错、不进 bad[]。
 *   2. 课程块的正则把 style 写死成 `style='padding-bottom:5px;clear:both;'`
 *      和 `style='font-weight: bolder'`，学校改成双引号、多个空格、
 *      或调整属性顺序就整块失配。
 *
 * 这两种失败在界面上都表现为「课表一片空白」，和「教务确实没课」长得一样。
 * 所以必须用离线样本把「能解析」钉死。
 *
 * 跑法：node tools/test_parsekb.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'sync.js'), 'utf8');

/* ---- 造垫片：sync.js 是个 IIFE，依赖 Host / window / localStorage ---- */
function makeSandbox() {
  const store = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, parseInt, parseFloat, isNaN, String, Number, Array, Object,
    Uint8Array, Promise, Error, RegExp,
    TextDecoder: global.TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    unescape: global.unescape,
    encodeURIComponent: global.encodeURIComponent,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    Host: {
      getPref: (k) => (store.has(k) ? store.get(k) : ''),
      setPref: (k, v) => store.set(k, String(v)),
      toast: () => {},
      b64: (s) => Buffer.from(s, 'utf8').toString('base64'),
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

function loadSync() {
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;__sync = XXMU;', sandbox, { timeout: 5000 });
  return vm.runInContext('__sync', sandbox);
}

/* ---- 断言框架 ---- */
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 ' + name + (extra ? ('  -> ' + extra) : '')); }
}
function eq(a, b, name) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(sa === sb, name, 'got ' + sa + ' want ' + sb);
}

/* ---- 构造课表 HTML 片段 ---- */
/* 青果真实结构（从学校页面抄的形状）：
 *   <td ...><div class='div1' id='k12' >
 *     <div style='padding-bottom:5px;clear:both;'>
 *       <font style='font-weight: bolder'>课程名</font><br>
 *       教师<br>周次[节次]<br>教室</div>
 *   </div></td>
 */
function cell(day, period, rows, opts) {
  const o = opts || {};
  const q = o.quote || "'";
  const attr = o.attr || (q + 'div1' + q + ' id=' + q + 'k' + day + period + q);
  const padStyle = o.padStyle || (q + 'padding-bottom:5px;clear:both;' + q);
  const fontStyle = o.fontStyle || (q + 'font-weight: bolder' + q);
  const inner = rows.map((r) =>
    '<div style=' + padStyle + '>'
    + '<font style=' + fontStyle + '>' + r[0] + '</font><br>'
    + r[1] + '<br>' + r[2] + '<br>' + r[3] + '</div>'
  ).join('');
  return '<td class="tdclass"><div class=' + attr + '>' + inner + '</div></td>';
}

const SY = loadSync();

console.log('\n[1] 基础解析（两位节次）');
{
  const html = '<table><tr>'
    + cell(1, 2, [['系统解剖学', '张三', '1-16[1,2]', 'A101']])
    + cell(3, 4, [['生理学', '李四', '1-8[3,4]', 'B202']])
    + '</tr></table>';
  const cells = SY.parseKb(html);
  eq(cells.length, 2, '解析出 2 格');
  eq(cells[0].day, 1, '第 1 格 day=1');
  eq(cells[0].period, 2, '第 1 格 period=2');
  eq(cells[0].courses[0].name, '系统解剖学', '课程名');
  eq(cells[0].courses[0].teacher, '张三', '教师');
  eq(cells[0].courses[0].weeks, '1-16[1,2]', '周次原文');
  eq(cells[0].courses[0].room, 'A101', '教室');
}

console.log('\n[2] 第 10 节及以后（v1.1.13 修的洞）');
{
  /* 这是用户案子里最可能的现场：医学专业晚上排课，节次到 11、12 */
  const html = '<table><tr>'
    + cell(1, 9, [['第九节', 'T', '1-16[9]', 'R9']])
    + cell(1, 10, [['第十节', 'T', '1-16[10]', 'R10']])
    + cell(1, 11, [['第十一节', 'T', '1-16[11]', 'R11']])
    + cell(1, 12, [['第十二节', 'T', '1-16[12]', 'R12']])
    + '</tr></table>';
  const cells = SY.parseKb(html);
  eq(cells.length, 4, '9/10/11/12 节全部解析出来（旧版只能出 1 格）');
  eq(cells.map((c) => c.period), [9, 10, 11, 12], '节次正确');
  eq(cells[3].courses[0].name, '第十二节', '第 12 节的课程名没丢');
}

console.log('\n[3] style 写法变化（v1.1.13 修的第二个洞）');
{
  const dq = cell(2, 3, [['双引号课', 'T', '1-16[3]', 'R']], { quote: '"' });
  const sp = cell(2, 5, [['多空格课', 'T', '1-16[5]', 'R']], {
    padStyle: "'padding-bottom: 5px; clear: both;'",
    fontStyle: "'font-weight:  bolder'",
  });
  const order = cell(2, 6, [['换序课', 'T', '1-16[6]', 'R']], {
    padStyle: "'clear:both;padding-bottom:5px;'",
  });
  const html = '<table><tr>' + dq + sp + order + '</tr></table>';
  const cells = SY.parseKb(html);
  eq(cells.length, 3, '三种 style 变体都能解析');
  eq(cells.map((c) => c.period), [3, 5, 6], '节次正确');
}

console.log('\n[4] 一格多门课');
{
  const html = '<table><tr>' + cell(4, 2, [
    ['课程甲', 'T1', '1-8[2]', 'R1'],
    ['课程乙', 'T2', '9-16[2]', 'R2'],
  ]) + '</tr></table>';
  const cells = SY.parseKb(html);
  eq(cells.length, 1, '一格');
  eq(cells[0].courses.length, 2, '两门课');
  eq(cells[0].courses[1].name, '课程乙', '第二门课名');
}

console.log('\n[5] 周次解析');
{
  eq(SY.parseWeeks('1-16[1,2]', 2).weeks, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], '1-16 展开');
  eq(SY.parseWeeks('1-16[1,2]', 2).periods, [1, 2], '节次 [1,2]');
  eq(SY.parseWeeks('1-8[3]', 3).ok, true, '1-8 解析成功');
  eq(SY.parseWeeks('1-16周', 5).weeks.length, 16, '不带方括号的「1-16周」也能读');
  eq(SY.parseWeeks('1,3,5-9[2]', 2).weeks, [1,3,5,6,7,8,9], '逗号+区间混写');
  eq(SY.parseWeeks('', 7).weeks, [], '空串 → 空周次');
  eq(SY.parseWeeks('', 7).periods, [7], '空串 → 用单元格节次兜底');
  eq(SY.parseWeeks('', 7).ok, false, '空串 → ok=false');
}

console.log('\n[6] buildSchedule 端到端 + 诊断留样');
{
  const html = '<html>' + '<table><tr>'
    + cell(1, 2, [['系统解剖学', '张三', '1-16[1,2]', 'A101']])
    + cell(3, 10, [['晚上课', '李四', '1-16[10]', 'B202']])
    + '</tr></table>' + '</html>';
  SY.diagReset();
  const sch = SY.buildSchedule(html, '20261430313', { xn: '2026', xq: '0', label: '2026-2027-1' });
  eq(sch.count, 2, 'count=2');
  eq(sch.showable, 2, 'showable=2');
  eq(sch.user, '20261430313', 'user 透传');
  eq(sch.term, '2026-2027-1', 'term 透传');
  const d = SY.diag();
  eq(d.cells, 2, '诊断：格子数');
  eq(d.courses, 2, '诊断：课程数');
  ok(d.bytes > 0, '诊断：页面字节数有值');
  ok(Array.isArray(d.samples) && d.samples.length > 0, '诊断：留了原文样例');
}

console.log('\n[7] 解析 0 格必须抛（不能静默空）');
{
  SY.diagReset();
  let threw = false, msg = '';
  try {
    SY.buildSchedule('<html><body>请先登录</body></html>', 'x', null);
  } catch (e) { threw = true; msg = String(e.message || e); }
  ok(threw, '0 格抛异常');
  ok(msg.indexOf('0 个课表格子') >= 0, '异常文案说明是格子问题', msg);
  const d = SY.diag();
  ok(d.err.indexOf('0 个课表格子') >= 0, '诊断里记下这次失败', d.err);
}

console.log('\n[8] 周次全读不懂时 showable=0 但 count>0');
{
  const html = '<table><tr>'
    + cell(1, 2, [['怪周次课', 'T', '第X周', 'R']])
    + '</tr></table>';
  SY.diagReset();
  const sch = SY.buildSchedule(html, 'u', null);
  eq(sch.count, 1, 'count=1（抓到了）');
  eq(sch.showable, 0, 'showable=0（上不了网格）');
  eq(sch.bad_weeks.length, 1, 'bad_weeks 记了 1 条');
  eq(sch.bad_weeks[0].raw_weeks, '第X周', '记下原始周次原文');
}

console.log('\n----------------------------------------');
if (fail === 0) {
  console.log('[PASS] 通过 ' + pass + ' 项，失败 0 项');
  process.exit(0);
} else {
  console.log('[FAIL] 通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  fails.forEach((f) => console.log('   - ' + f));
  process.exit(1);
}
