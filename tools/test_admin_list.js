/* 管理名单排序与异常学号标记的离线行为测试（v1.1.45）
 *
 *   node tools/test_admin_list.js
 *
 * 用户原话：「按照新收录的学号排序，从新到老。而且为什么有个12026，不都是
 *   2025.2026这些年份开头吗」。截图里 12 位、1 开头的 120261200112 排在
 *   最上面，其实是字典序把「1 最小」当成了「最新」。
 *
 * 能验：排序纯函数（at 降序 / at=0 垫底 / 同 at 稳定）、形状判据、时间格式化、
 *       前后端用同一套判据、渲染里真的调了排序与标记。
 * 不能验：真机上名单页的观感；那条异常号是谁填的（只能从 KV 的 last/dev 查）。
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

const app = read('web/app.js');
const worker = read('server/worker.js');
const css = read('web/app.css');

/** 从 app.js 里切出 v1.1.45 那三个连着写的纯函数，真跑一遍。
 *
 * 不能按函数名逐个 cut：app.js 更早的地方已有一个同名 fmtAt（返回 '--'），
 * indexOf 会先命中它，切出来的根本不是名单用的那个（上一版就栽在这上面，
 * 测出「2026/11/5 19:29:39」「--」这种假 FAIL）。这里按区间整段切。 */
const F_START = '  function listNewFirst(';
const F_END = '  function renderList()';
const a0 = app.indexOf(F_START), b0 = app.indexOf(F_END, a0);
if (a0 < 0 || b0 < 0) throw new Error('切不出名单排序函数区');
const code = app.slice(a0, b0) +
  '\nthis.__f = { listNewFirst, looksOddId, fmtAt };';
const s = { Number, String, Date, Math, RegExp, console };
s.globalThis = s;
vm.createContext(s);
vm.runInContext(code, s, { filename: 'admin-list.js' });
const f = s.__f;

console.log('1. 名单按收录时间从新到老（真实线上 idx 的形状）');
{
  // 取自 2026-11-06 线上 KV idx：11 条，含 2 条 at=0 与 2 条形状异常
  const rows = [
    { id: '20261440107', at: 0 },
    { id: '20261440117', at: 0 },
    { id: '20261430312', at: 1793715738 },
    { id: '20261440115', at: 1793715866 },
    { id: '20261430313', at: 1793716577 },
    { id: '20255170601', at: 1793716990 },
    { id: '20261490304', at: 1793719428 },
    { id: '20261101007', at: 1793723407 },
    { id: '120261200112', at: 1793754612 },
    { id: '2026250033', at: 1793755226 },
    { id: '20261230432', at: 1793878179 },
  ];
  const got = rows.slice().sort(f.listNewFirst).map(r => r.id);
  ok(got[0] === '20261230432', '最新收录排第一（11-05 19:29）', got[0]);
  ok(got[1] === '2026250033', '第二是 11-04 09:20（10 位号，按时间不按位数）', got[1]);
  ok(got[2] === '120261200112', '第三才是 11-04 09:10 的 12026…（不再霸占第一）', got[2]);
  ok(got.indexOf('20261440107') === 9 && got.indexOf('20261440117') === 10,
    '两条 at=0 的早期记录垫底（不是跳到最前）', got.slice(-2).join(','));
  ok(got[9] === '20261440107' && got[10] === '20261440117',
    'at=0 之间按 id 升序，稳定不乱跳', got.slice(-2).join(','));

  const tie = [
    { id: '20261440115', at: 100 },
    { id: '20261430312', at: 100 },
    { id: '20261440107', at: 100 },
  ].sort(f.listNewFirst).map(r => r.id);
  ok(tie.join(',') === '20261430312,20261440107,20261440115',
    'at 相同时按 id 升序（刷新不会换顺序）', tie.join(','));

  /* 反向：绝不能退回字符串字典序 —— 那样 1 开头会排最前 */
  const dict = rows.slice().sort((a, b) => a.id.localeCompare(b.id)).map(r => r.id);
  ok(dict[0] === '120261200112', '旧判据确实会把 12026… 排第一（复现截图现象）', dict[0]);
}

console.log('\n2. 形状异常的学号：标出来，不拦不改');
{
  ok(f.looksOddId('120261200112') === true, '12 位、1 开头 → 异常');
  ok(f.looksOddId('2026250033') === true, '10 位、2026 开头也是异常（本校 11 位）');
  ok(f.looksOddId('20261440107') === false, '11 位 2026 开头 → 正常');
  ok(f.looksOddId('20255170601') === false, '11 位 2025 开头 → 正常');
  ok(f.looksOddId('') === true, '空值不崩、按异常处理');
  ok(f.looksOddId(undefined) === true, 'undefined 不崩');
  /* 不能因为「形状异常」就去改激活判据：服务端只认 6~20 位纯数字 */
  ok(/return bad\('学号格式不对'\)/.test(worker) &&
     worker.indexOf("^\\d{6,20}$") >= 0,
    '服务端激活仍只要求 6~20 位纯数字（不因标记而拦人）');
  ok(!/looksOddId[\s\S]{0,200}return\s*(false|null)/.test(app),
    '前端标记函数不被当成拦截条件');
}

console.log('\n3. 收录时间显示');
{
  const t = f.fmtAt(1793878179);
  ok(t.length > 0, '有 at 时显示时间', t);
  /* 沙箱里 Date 是 UTC 环境，真机是本机时区 —— 只验形状，不验具体小时 */
  ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t), '格式 YYYY-MM-DD HH:mm', t);
  ok(f.fmtAt(0) === '', 'at=0 返回空（界面写「早期记录」）', JSON.stringify(f.fmtAt(0)));
  ok(f.fmtAt(undefined) === '', 'undefined 返回空', JSON.stringify(f.fmtAt(undefined)));
}

console.log('\n4. 前后端判据一致 + 真接上渲染');
{
  ok(/rows\.sort\(\(a, b\) => \{[\s\S]*?if \(a\.at !== b\.at\) return b\.at - a\.at/.test(worker),
    '后端 handleList 按 at 降序');
  ok(/return a\.id\.localeCompare\(b\.id\)/.test(worker), '后端 at 相等按 id 稳定');
  ok(/let rows = LIST\.slice\(\)\.sort\(listNewFirst\)/.test(app),
    '前端 renderList 真的调了排序（不是只写了函数）');
  ok(/idWrap\.appendChild\(el\('span', 'adm-at'/.test(app), '行里补了收录时间');
  ok(/tags\.appendChild\(el\('span', 'adm-odd', '格式异常（手填）'\)\)/.test(app),
    '异常号真的标在行里');
  ok(/\.adm-odd\{/.test(css) && /\.adm-at\{/.test(css) && /\.adm-id-wrap\{/.test(css),
    'CSS 三种新样式齐全');
  ok(/admListCnt'\)\.textContent = LIST\.length \+ ' 人'/.test(app),
    '列表总人数统计没被改坏');
}

console.log('\n' + (bad === 0
  ? '[PASS] 名单排序 ' + total + ' 项全过'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
