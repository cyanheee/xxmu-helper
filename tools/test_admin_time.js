/* 管理台时间显示的离线行为测试（v1.1.48）
 *
 *   node tools/test_admin_time.js
 *
 * 用户截图报障：「这个时间不对吧1/22是什么」——管理台「详情」里的
 * 「最近进入 / 已绑设备」和「日志」页的时间全显示成 1/22 02:17。
 *
 * 根因：server/worker.js 的 now() 返回**秒**（Math.floor(Date.now()/1000)），
 * 而 web/app.js 的 fmtDay(ts) 直接 new Date(ts) 按**毫秒**解析。
 * 1764537032 秒被当成毫秒 → 1970-01-22 02:17。
 * 同一批调用点里还有一处已经乘了 1000（版本发布那条 f.at * 1000），
 * 所以同一个函数会同时收到两种单位 —— 不能只把调用方全改一遍了事。
 *
 * 能验：fmtDay 对秒 / 毫秒两种输入都返回真实日期；已知时间戳的固定向量；
 *       0 / 空值返回 '--'；不会把 2026 年的时间算成 1970。
 * 不能验：真机上那个详情弹层里的排版；服务端历史数据里 at 的单位是否统一
 *         （只能读 KV 才能确认，本轮按代码判据：worker 所有写入都用 now()）。
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

const app = read('web/app.js');
const worker = read('server/worker.js');

/* 从 app.js 切出 fmtDay。区间切法（不能按函数名 indexOf：
 * app.js 里 fmtAt / fmt 等近似名字很多，先命中的不是这一个）。 */
const A = app.indexOf('  function fmtDay(ts) {');
const B = app.indexOf('  function actName(a) {', A);
if (A < 0 || B < 0) throw new Error('切不出 fmtDay 函数区（app.js 结构变了？）');
const code = app.slice(A, B) + '\nthis.__f = { fmtDay };';

const s = { Number, String, Date, Math, console };
s.globalThis = s;
vm.createContext(s);
vm.runInContext(code, s, { filename: 'fmtDay.js' });
const fmtDay = s.__f.fmtDay;

console.log('1. 服务端时间戳单位：worker 的 now() 是秒');
{
  ok(/function now\(\)\s*\{\s*return Math\.floor\(Date\.now\(\)\s*\/\s*1000\)/.test(worker),
    'worker.js 的 now() 返回秒（Math.floor(Date.now()/1000)）',
    '实际写法变了，units 判据要重看');
}

console.log('2. fmtDay 两种单位都算对（就是截图里那个 1/22 的坑）');
{
  /* 2026-11-06 22:00（本机时区）的秒级时间戳 —— 现场算，不手填常数，
   * 免得写错一个数字就变成假 FAIL。用户截图里 2026-11-06 的记录显示成
   * 1/22，正是这个量级被当毫秒解析。 */
  const SEC = Math.floor(new Date(2026, 10, 6, 22, 0, 0).getTime() / 1000);
  const outSec = fmtDay(SEC);
  ok(/^11\/6\s+22:00$/.test(outSec), '秒级输入 → 11/6 22:00', outSec);
  ok(!/^1\/2[12]/.test(outSec), '秒级输入不再落到 1970-01（1/21、1/22 都不许）', outSec);

  const outMs = fmtDay(SEC * 1000);
  ok(outSec === outMs, '毫秒级输入与秒级输入结果一致（同一条数据两种传法）', outMs);
}

console.log('3. 固定向量：不会因为时区/月日补零而错');
{
  const t = 1764537032;                // 见截图同期的一个真实秒级时间戳
  const d = new Date(t * 1000);
  const p = n => (n < 10 ? '0' + n : String(n));
  const want = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  ok(fmtDay(t) === want, 'fmtDay(秒) == 按 Date 算出的本地时间', fmtDay(t) + ' vs ' + want);
  ok(d.getFullYear() === 2025 || d.getFullYear() === 2026,
    '这个时间戳确实落在 2025/2026（证明单位换算改对了）', String(d.getFullYear()));
}

console.log('4. 空值与 0 不崩、不显示 1970');
{
  ok(fmtDay(0) === '--', 'fmtDay(0) → --', fmtDay(0));
  ok(fmtDay(null) === '--', 'fmtDay(null) → --', fmtDay(null));
  ok(fmtDay('') === '--', "fmtDay('') → --", fmtDay(''));
}

console.log('5. 调用点没有各自乘 1000（避免双重换算）');
{
  /* fmtDay 内部已经判单位，调用方若还写 fmtDay(x * 1000)，
   * 就会变成「毫秒的毫秒」——2026 年会被算到 5 万年后。
   * 只允许「本来就是毫秒」的 Date.now() 系列直接传。
   * 先把注释剥掉，否则解释这条规则的注释本身会被当成代码命中。 */
  const codeOnly = app
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const calls = codeOnly.match(/fmtDay\([^)]*\)/g) || [];
  const doubled = calls.filter(c => /\*\s*1000/.test(c));
  ok(doubled.length === 0, '没有 fmtDay(x * 1000) 这种双重换算', doubled.join(' , '));
  ok(calls.length >= 4, 'fmtDay 仍被管理台多处调用（最近进入/已绑设备/日志/版本）', String(calls.length));
}

console.log('');
if (bad) {
  console.log('[FAIL] ' + bad + ' / ' + total + ' 项未过');
  process.exit(1);
}
console.log('[PASS] 时间显示 ' + total + ' 项全过');
