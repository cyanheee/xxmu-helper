/* 专注记录可视化（focus.js 的 histo / streak / peakOf）离线测试 —— v2.4.0
 *
 * 跑法：node tools/test_focuslog.js
 *
 * 做法与 test_hwremind.js / test_nowline.js 一致：cut(name) 按花括号配平从真
 * 源码里切函数，拼成一段脚本丢进 vm —— 测的是 web/focus.js 里的真代码。
 *
 * 三件事必须测到：
 *   1. 没有记录的那天是 0 分钟（照样出现在柱子里），不是「缺数据」被跳过；
 *   2. 连续天数：今天还没坐下不算断，昨天有就算连着；今天和昨天都没有就归 0；
 *   3. 归一化按窗口内最大值，不是固定 120 分钟（否则新人满屏矮柱子）。
 * 另外统一钉死「今天」= 2026-11-21，不随运行日期漂移。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'focus.js'), 'utf8');

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

/* 钉死「今天」。MAX_LOG_DAYS 也要从真源码里取，避免测试写死 90。 */
const MAX_LOG_DAYS = Number((/const\s+MAX_LOG_DAYS\s*=\s*(\d+)/.exec(SRC) || [])[1] || 0);
const NOW_ISO = '2026-11-21';

const code = [
  'const MAX_LOG_DAYS = ' + (MAX_LOG_DAYS || 90) + ';',
  'const pad2 = n => String(n).padStart(2, "0");',
  cut(SRC, 'todayIso').replace(/function todayIso\(d\)\s*\{/, 'function todayIso(d) { if (!d) d = new Date(2026, 10, 21, 15, 30, 0);'),
  cut(SRC, 'dayBase'),
  cut(SRC, 'histo'),
  cut(SRC, 'streak'),
  cut(SRC, 'peakOf'),
  'this.__api = { histo: histo, streak: streak, peakOf: peakOf, todayIso: todayIso, MAX_LOG_DAYS: MAX_LOG_DAYS };'
].join('\n\n');

const sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'focuslog-cut.js' });
const A = sandbox.__api;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  [FAIL] ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

console.log('专注记录可视化 v2.4.0 行为测试（今天钉在 ' + NOW_ISO + '）');

/* ---------------- [1] histo 的形状 ---------------- */
{
  const rows = A.histo({}, 14, NOW_ISO);
  eq(rows.length, 14, '1.1 要 14 天就返回 14 条');
  ok(rows.every(r => r.min === 0), '1.2 没有任何记录时每一条都是 0 分钟（不是缺项）');
  ok(rows.every(r => r.level === 0), '1.3 全 0 时 level 全是 0');
  eq(rows[13].key, NOW_ISO, '1.4 最后一条是今天');
  eq(rows[0].key, '2026-11-08', '1.5 第一条是 13 天前（含今天共 14 天）');
  const keys = rows.map(r => r.key);
  eq(keys, keys.slice().sort(), '1.6 按时间正序（左旧右新）');
  ok(new Set(keys).size === 14, '1.7 没有重复日期');
}

/* ---------------- [2] 0 分钟那天照样在，level 分五档 ---------------- */
{
  const log = {};
  log['2026-11-21'] = 120;   // 今天
  log['2026-11-20'] = 60;
  log['2026-11-19'] = 30;
  log['2026-11-18'] = 10;
  // 11-17 空着
  const rows = A.histo(log, 14, NOW_ISO);
  const byKey = {};
  rows.forEach(r => { byKey[r.key] = r; });
  eq(byKey['2026-11-21'].min, 120, '2.1 今天 120 分钟读出来');
  eq(byKey['2026-11-17'].min, 0, '2.2 没记录那天是 0（不是被剔除）');
  ok(byKey['2026-11-17'].level === 0, '2.3 0 分钟 level = 0');
  eq(byKey['2026-11-21'].level, 4, '2.4 窗口内最大值 level = 4');
  ok(byKey['2026-11-18'].level >= 1 && byKey['2026-11-18'].level <= 3, '2.5 少量分钟落在 1~3 档', byKey['2026-11-18'].level);
  ok(byKey['2026-11-19'].level > byKey['2026-11-18'].level, '2.6 30 分钟比 10 分钟档位高');
}

/* ---------------- [3] 归一化按窗口最大值，不是固定 120 ---------------- */
{
  // 只用两周内最高 20 分钟的新人：最高那天必须满格 4，不该因为没到 120 而全矮
  const log = { '2026-11-21': 20, '2026-11-20': 10 };
  const rows = A.histo(log, 14, NOW_ISO);
  const today = rows[rows.length - 1];
  const yest = rows[rows.length - 2];
  eq(today.level, 4, '3.1 新人的最高那天也是满档（按窗口最大值归一）');
  ok(yest.level >= 1 && yest.level < 4, '3.2 一半时长落在中间档', yest.level);
  // 有记录的天数不足一半时，level 至少要 ≥1（不能是 0，0 代表没学）
  ok(rows.every(r => r.min === 0 || r.level >= 1), '3.3 学过就有档位，绝不留在 0');
}

/* ---------------- [4] 窗口参数 ---------------- */
{
  const log = { '2026-11-21': 5, '2026-11-01': 900 };
  const rows = A.histo(log, 7, NOW_ISO);
  eq(rows.length, 7, '4.1 要 7 天就 7 条');
  ok(rows.every(r => r.key >= '2026-11-15'), '4.2 7 天窗口不含 11-01 那条');
  ok(rows.every(r => r.level <= 4), '4.3 level 不超过 4');
  // 脏参数要夹住，不能崩
  eq(A.histo({}, 0, NOW_ISO).length, 1, '4.4 n=0 夹到 1 条');
  eq(A.histo({}, 10000, NOW_ISO).length, A.MAX_LOG_DAYS, '4.5 n 超过上限夹到 MAX_LOG_DAYS');
  eq(A.histo(null, 3, NOW_ISO).length, 3, '4.6 log 为 null 也不崩');
}

/* ---------------- [5] 连续天数 ---------------- */
{
  const mk = arr => { const o = {}; arr.forEach(k => { o[k] = 30; }); return o; };
  eq(A.streak(mk(['2026-11-21', '2026-11-20', '2026-11-19']), NOW_ISO), 3, '5.1 今天连着三天 = 3');
  eq(A.streak(mk(['2026-11-20', '2026-11-19']), NOW_ISO), 2, '5.2 今天还没坐下不算断（昨天有 = 2）');
  eq(A.streak(mk(['2026-11-19', '2026-11-18']), NOW_ISO), 0, '5.3 今天和昨天都没有 = 0');
  eq(A.streak({}, NOW_ISO), 0, '5.4 空记录 = 0');
  eq(A.streak(mk(['2026-11-21']), NOW_ISO), 1, '5.5 只有今天 = 1');
  eq(A.streak(mk(['2026-11-21', '2026-11-20', '2026-11-18']), NOW_ISO), 2, '5.6 中间断一天就只算到断点前');
  eq(A.streak(null, NOW_ISO), 0, '5.7 log 为 null 也不崩');
  // 90 天内连续不断，返回值不能超过上限
  const all = [];
  for (let i = 0; i < 120; i++) {
    const d = new Date(2026, 10, 21 - i);
    all.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const s = A.streak(mk(all), NOW_ISO);
  ok(s > 0 && s <= A.MAX_LOG_DAYS, '5.8 连续天数不会超过 MAX_LOG_DAYS', s);
}

/* ---------------- [6] peakOf ---------------- */
{
  /* 14 天窗口从 11-08 起 → 11-10 的 200 分钟在窗口内，是正确答案；
     7 天窗口从 11-15 起 → 11-10 被排除，11-18 的 95 分钟成为窗口内最大。 */
  const log = { '2026-11-21': 40, '2026-11-18': 95, '2026-11-10': 200 };
  const p = A.peakOf(log, 14, NOW_ISO);
  eq(p.key, '2026-11-10', '6.1 14 天窗口内最长的是 11-10（200 分钟仍在窗口内）');
  eq(p.min, 200, '6.2 分钟数正确');
  const q = A.peakOf(log, 7, NOW_ISO);
  eq(q.key, '2026-11-18', '6.3 换 7 天窗口，11-10 被排除，11-18 成为窗口内最大');
  eq(q.min, 95, '6.4 7 天窗口的分钟数正确');
  const r2 = A.peakOf({ '2026-11-09': 95 }, 7, NOW_ISO);
  eq(r2.key, '', '6.5 只在 7 天窗口外有记录时返回空');
  eq(A.peakOf({}, 14, NOW_ISO), { key: '', min: 0 }, '6.6 一条都没有时返回空 key 与 0');
  const tie = A.peakOf({ '2026-11-21': 60, '2026-11-20': 60 }, 14, NOW_ISO);
  eq(tie.min, 60, '6.7 并列时 min 正确');
  ok(tie.key === '2026-11-20' || tie.key === '2026-11-21', '6.8 并列时 key 落在并列之一', tie.key);
}

/* ---------------- [7] 源码纪律 ---------------- */
{
  const body = SRC.slice(SRC.indexOf('function histo'), SRC.indexOf('function streak'));
  ok(body.indexOf('localStorage') < 0, '7.1 histo 不自己读写存储（纯函数）');
  ok(body.indexOf('Host.') < 0, '7.2 histo 不碰 Host 桥');
  ok(body.indexOf('toFixed') < 0, '7.3 不用 toFixed 拼字符串');
  ok(/@testable:histo/.test(SRC) && /@testable:streak/.test(SRC) && /@testable:peakOf/.test(SRC),
    '7.4 三个纯函数都有 @testable 标记');
  /* 导出表用的是短属性名（histo, streak, peakOf），不是 histo: histo。 */
  const tail = SRC.slice(SRC.lastIndexOf('return {'));
  ok(/\bhisto\b/.test(tail) && /\bstreak\b/.test(tail) && /\bpeakOf\b/.test(tail),
    '7.5 三个纯函数都已导出（夹具要能调）', tail.slice(0, 120));
  ok(/HIST_DAYS\s*=\s*14/.test(SRC), '7.6 HIST_DAYS 是 14');
  const ih = SRC.indexOf('function paintHisto');
  const ii = SRC.indexOf('function paint()');
  ok(ih > 0 && ii > ih, '7.7 paintHisto 定义在 paint 之前（paint 里会直接调）');
  ok(/paintHisto\(state\)/.test(SRC), '7.8 paint() 里真的调了 paintHisto');
}

console.log('');
if (fail === 0) {
  console.log('✓ 专注记录可视化 v2.4.0 行为测试通过 ' + pass + ' 项');
  process.exit(0);
} else {
  console.log('[FAIL] ' + fail + ' 项未过（通过 ' + pass + ' 项）');
  process.exit(1);
}
