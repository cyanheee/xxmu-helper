/* 现在一屏（nowline.js）离线测试 —— v2.3.0
 *
 * 跑法：node tools/test_nowline.js
 *
 * 做法与 test_hwremind.js 一致：cut(name) 按花括号配平从真源码里切出单个函数，
 * 拼成一段可跑的脚本丢进 vm 沙箱 —— 测的是 web/nowline.js 里的真代码，
 * 不是复制一份到测试里（复制一份就意味着以后会不一致）。
 *
 * 三件事必须测到：
 *   1. 钟点读不出来时绝不自己编时间（只能 unknown）；
 *   2. 多节连上的课要算到最后一节下课，不能上完第一节就说「上完了」；
 *   3. 空教室缺行是「教务没给」，不是「空」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'nowline.js'), 'utf8');

/* 从 src 里切出 function name(...) { ... } 的整块（含首尾大括号）。 */
function cut(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', m.index);
  if (i < 0) throw new Error('找不到函数体 ' + name);
  let depth = 0, inStr = null, esc = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/' && src[k + 1] === '/') { const nl = src.indexOf('\n', k); k = nl < 0 ? src.length : nl; continue; }
    if (c === '/' && src[k + 1] === '*') { const e = src.indexOf('*/', k + 2); k = e < 0 ? src.length : e + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, k + 1); }
  }
  throw new Error('函数体没配平：' + name);
}

const code = [
  cut(SRC, 'pad2'),
  cut(SRC, 'fmtHM'),
  cut(SRC, 'parseSeg'),
  cut(SRC, 'nowInfo'),
  cut(SRC, 'roomNow'),
  cut(SRC, 'roomsText'),
  cut(SRC, 'currentPeriod'),
  'this.__api = { pad2: pad2, fmtHM: fmtHM, parseSeg: parseSeg, nowInfo: nowInfo,',
  '  roomNow: roomNow, roomsText: roomsText, currentPeriod: currentPeriod };'
].join('\n\n');

const sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'nowline-cut.js' });
const A = sandbox.__api;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  [FAIL] ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

/* 一张一天顺利的作息表：1-2 节 08:00-09:40，3-4 节 10:00-11:40，5-6 节 14:00-15:40 */
const TIMES = [
  '08:00~08:45', '08:55~09:40',
  '10:00~10:45', '10:55~11:40',
  '14:00~14:45', '14:55~15:40',
  '16:00~16:45', '16:55~17:40',
  '19:00~19:45', '19:55~20:40'
];

/* 8:30 = 510 分钟；10:30 = 630；12:30 = 750；16:30 = 990 */

/* ---------- 1. parseSeg：三种分隔符都要认，坏数据必须是 null ---------- */
{
  eq(A.parseSeg('08:00~08:45'), { s: 480, e: 525 }, 'parseSeg 波浪线');
  eq(A.parseSeg('08:00-08:45'), { s: 480, e: 525 }, 'parseSeg 短横线');
  eq(A.parseSeg('08:00～08:45'), { s: 480, e: 525 }, 'parseSeg 全角波浪');
  eq(A.parseSeg('8:0~8:45'), null, 'parseSeg 分钟位缺零判 null');
  eq(A.parseSeg(''), null, 'parseSeg 空串判 null');
  eq(A.parseSeg(null), null, 'parseSeg null 判 null');
  eq(A.parseSeg('08:45~08:00'), null, 'parseSeg 终点早于起点判 null');
  eq(A.parseSeg('23:00~26:00'), null, 'parseSeg 超过 24 点判 null');
}

/* ---------- 2. nowInfo：正在上课 ---------- */
{
  const blocks = [{ name: '系统解剖学', room: 'A201', start: 1, span: 2 }];
  const r = A.nowInfo(blocks, TIMES, 510);          // 8:30，第 2 节里
  ok(r.has === true, '有课时 has=true');
  eq(r.cur && r.cur.name, '系统解剖学', '当前课名字');
  eq(r.cur && r.cur.room, 'A201', '当前课教室');
  eq(r.cur && r.cur.e, 580, '跨节块取最后一节下课（9:40=580）');
  eq(r.cur && r.cur.leftMin, 70, '还剩 70 分钟下课');
  ok(!r.next, '正在上课时没有 next');
  ok(r.unknown === false, '钟点齐时 unknown=false');
  ok(r.over === false, '正在上课不算 over');
}

/* ---------- 3. nowInfo：下一节 ---------- */
{
  const blocks = [{ name: '生理学', room: 'B305', start: 3, span: 2 }];
  const r = A.nowInfo(blocks, TIMES, 510);          // 8:30，离 10:00 还有 90 分
  ok(!r.cur, '还没到上课时间时 cur 为空');
  eq(r.next && r.next.at, '10:00', '下一节上课时间 10:00');
  eq(r.next && r.next.inMin, 90, '还有 90 分钟');
  eq(r.next && r.next.name, '生理学', '下一节名字');
  ok(r.over === false, '还有课时不算 over');
}

/* ---------- 4. nowInfo：全部上完 ---------- */
{
  const blocks = [
    { name: '系统解剖学', room: 'A201', start: 1, span: 2 },
    { name: '生理学', room: 'B305', start: 5, span: 2 }
  ];
  const r = A.nowInfo(blocks, TIMES, 990);          // 16:30，最后一节 15:40 已下课
  ok(!r.cur && !r.next, '全上完后 cur/next 都空');
  ok(r.over === true, '全上完时 over=true');
  ok(r.unknown === false, '全上完时 unknown=false');
}

/* ---------- 5. nowInfo：钟点读不出来 → unknown，绝不编时间 ---------- */
{
  const bad = TIMES.slice(0, 2).concat(['', '', '', '', '', '', '', '']);
  const blocks = [{ name: '病理学', room: 'C102', start: 3, span: 2 }];
  const r = A.nowInfo(blocks, bad, 630);
  ok(r.unknown === true, '钟点缺失时 unknown=true');
  ok(!r.cur, '钟点缺失时不敢说正在上哪门');
  ok(!r.next, '钟点缺失时不敢说下一节几点');
  ok(r.over === false, '钟点缺失时绝不判「已上完」');
}

/* ---------- 6. nowInfo：没有课 ---------- */
{
  const r = A.nowInfo([], TIMES, 510);
  ok(r.has === false, '没有课时 has=false');
  ok(!r.cur && !r.next, '没有课时 cur/next 都空');
  ok(r.over === false, '没有课不算 over（要能区分「没课」和「上完了」）');
}

/* ---------- 7. nowInfo：连堂块中间的课间仍算在课上 ---------- */
{
  /* 1-2 节是一块：08:00~08:45 + 08:55~09:40。8:48 落在两节之间的十分钟里。
     这里必须仍算「在上这一块」——学生对 08:45~08:55 的体感是「课间，还没下课」，
     而不是「这门课上完了」。把它判成上课，下课时长也照整块算（9:40）。 */
  const blocks = [{ name: '系统解剖学', room: 'A201', start: 1, span: 2 }];
  const r = A.nowInfo(blocks, TIMES, 528);
  ok(!!r.cur, '连堂中间的课间仍算在上这一块');
  eq(r.cur && r.cur.e, 580, '课间时下课时间仍取最后一节（9:40）');
  ok(r.over === false, '课间不判「已上完」');
}

/* ---------- 8. nowInfo：两块重叠时取更早开始的那个当「现在」 ---------- */
{
  const blocks = [
    { name: '甲', room: 'A1', start: 1, span: 2 },
    { name: '乙', room: 'B2', start: 2, span: 2 }
  ];
  const r = A.nowInfo(blocks, TIMES, 510);
  eq(r.cur && r.cur.name, '甲', '重叠时取开始更早的');
}

/* ---------- 9. roomNow：空教室统计 ---------- */
{
  /* g['3'] = 周三这一行的 7 个格子，[0]=周一 … [2]=周三 */
  const rooms = [
    { name: 'A101', seats: 60, g: { '3': [false, false, true, false, false, false, false] } },  // 周三被占
    { name: 'B202', seats: 120, g: { '3': [false, false, false, false, false, false, false] } },
    { name: 'C303', seats: 40, g: { '3': [true, false, false, false, false, false, false] } },   // 只有周一被占
    { name: 'D404', seats: 80, g: {} }               // 教务没给这一节
  ];
  const r = A.roomNow(rooms, 3, 3);
  eq(r.total, 4, '总教室数');
  eq(r.known, 3, '有数据的教室数');
  eq(r.unknown, 1, '缺行算 unknown');
  eq(r.free.map(x => x.name), ['B202', 'C303'], '空教室按座位数降序，被占的不进名单');
  ok(!r.free.some(x => x.name === 'D404'), '缺行绝不进「空」名单');

  /* 线上那份数据叫 room 不叫 name —— free.js 的 parseMatrix 产出
   * { room, type, seats, g, bang }（web/free.js:204）。这条断言就是为了
   * 钉住「读 room 字段」这件事：写错成只认 name 的话，真机上永远算 0 间空。 */
  const real = A.roomNow([
    { room: '3401', type: '普通', seats: 100, g: { '3': [false, false, false, false, false, false, false] } },
    { room: '3301', type: '多媒体', seats: 200, g: { '3': [false, false, true, false, false, false, false] } }
  ], 3, 3);
  eq(real.free.map(x => x.name), ['3401'], '教室对象用 room 字段（教务那份的真字段名）');
  ok(!real.free.some(x => x.name === '3301'), 'room 字段的被占教室不进名单');
}

/* ---------- 10. roomNow：day 越界要夹住 ---------- */
{
  const rooms = [{ name: 'A101', seats: 60, g: { '1': [false, false, false, false, false, false, false] } }];
  eq(A.roomNow(rooms, 0, 1).free.map(x => x.name), ['A101'], 'day=0 夹到周一');
  eq(A.roomNow(rooms, 9, 1).free.map(x => x.name), ['A101'], 'day=9 夹到周日');
}

/* ---------- 11. roomsText：四种说法都要区分开（入参是 roomNow 的产物） ---------- */
{
  ok(A.roomsText(null, 3).indexOf('还没查过') >= 0, 'null 时说还没查过');
  ok(A.roomsText({ free: [], unknown: 0, total: 0, known: 0 }, 3).indexOf('还没查过') >= 0, '没查过时说还没查过');
  ok(A.roomsText({ free: [], unknown: 2, total: 2, known: 0 }, 3).indexOf('教务没给') >= 0, '缺数据时说教务没给');
  ok(A.roomsText({ free: [], unknown: 0, total: 2, known: 2 }, 3).indexOf('全被占了') >= 0, '全占用时说全被占了');
  const t = A.roomsText({
    free: [{ name: 'B202', seats: 90 }, { name: 'A101', seats: 60 }],
    unknown: 0, total: 2, known: 2
  }, 3);
  ok(t.indexOf('B202') >= 0 && t.indexOf('A101') >= 0, '有空格时列名字', t);
  const t5 = A.roomsText({
    free: [{ name: 'A', seats: 1 }, { name: 'B', seats: 1 }, { name: 'C', seats: 1 }, { name: 'D', seats: 1 }, { name: 'E', seats: 1 }],
    unknown: 0, total: 5, known: 5
  }, 3);
  ok(t5.indexOf('等 5 间') >= 0, '超过三间时写「等 N 间」', t5);
}

/* ---------- 12. currentPeriod：按钟点反查第几节 ---------- */
{
  eq(A.currentPeriod(TIMES, 510), 1, '8:30 是第 1 节（08:00~08:45）');
  eq(A.currentPeriod(TIMES, 540), 2, '9:00 是第 2 节（08:55~09:40）');
  eq(A.currentPeriod(TIMES, 528), 1, '课间停在刚下课那节（8:48 → 第 1 节）');
  eq(A.currentPeriod(TIMES, 450), 0, '7:30 还没到第一节 → 0');
  eq(A.currentPeriod(TIMES, 600), 3, '10:00 是第 3 节');
}

/* ---------- 13. fmtHM / pad2 ---------- */
{
  eq(A.fmtHM(480), '08:00', 'fmtHM 480 → 08:00');
  eq(A.fmtHM(580), '09:40', 'fmtHM 580 → 09:40');
  eq(A.pad2(7), '07', 'pad2 补零');
  eq(A.pad2(12), '12', 'pad2 两位数原样');
}

/* ---------- 14. 自启动守卫：不能出现 !module.exports ---------- */
{
  /* 这两条必须**剥掉注释**再判：注释里正好在解释「不要写 !module.exports」
   * 和「为什么不用 setInterval」，直接对原文 indexOf 会自己把自己判红
   * （v2.1.0 的 check_apk_inside 踩过同一个坑）。 */
  const CODE = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(CODE.indexOf("typeof module === 'undefined'") >= 0, '自启动守卫用 typeof module');
  ok(CODE.indexOf('!module.exports') < 0, '自启动守卫不出现 !module.exports');
  ok(/NOWLINE\.init\(\)/.test(CODE), '文件末尾真的调了 init');
  ok(CODE.indexOf('setInterval') < 0, '不用 setInterval（递归 setTimeout）');
  ok(!/\bdocument\.hidden\b[\s\S]{0,80}setInterval/.test(CODE), '没有用隐藏态 + 轮询的组合');
}

/* ---------- 15. 空教室数据源：必须读 KFREE，不是 FREE ---------- */
{
  /* 全库有两个叫得像的东西：
   *   web/free.js  -> const KFREE = ...  教务矩阵（真实数据，state() 里是 rooms）
   *   web/water.js -> const FREE  = ...  本机按课表估算的老备选，没有 state()
   * 写成 FREE.state() 的后果不是报错，而是每帧都走 catch 返回 []，界面上永远
   * 「还没查过」——不报错、不崩、就是永远不出数据。这条断言就是这么来的。 */
  ok(SRC.indexOf('KFREE.state()') >= 0, '空教室数据从 KFREE.state() 取');
  ok(SRC.indexOf('KFREE.open()') >= 0, '查空教室按钮调 KFREE.open()');
  ok(!/\bFREE\s*\./.test(SRC), '不出现 FREE.xxx（那是 water.js 的本机估算版）');
  ok(!/typeof FREE\b/.test(SRC), 'typeof 判断也必须是 KFREE');
}

console.log('\n' + (fail === 0
  ? '\u2713 现在一屏 v2.3.0 行为测试通过 ' + pass + ' 项'
  : '\u2717 现在一屏 v2.3.0 有 ' + fail + ' 项失败（通过 ' + pass + ' 项）'));
process.exit(fail === 0 ? 0 : 1);
