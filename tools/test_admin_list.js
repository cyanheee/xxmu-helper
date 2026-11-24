/* 管理名单排序 + 「只记教务真号」的离线行为测试（v1.1.45 → v2.16.0）
 *
 *   node tools/test_admin_list.js
 *
 * 历史：用户原话「按照新收录的学号排序，从新到老。而且为什么有个12026，
 *   不都是 2025.2026这些年份开头吗」。截图里 12 位、1 开头的 120261200112
 *   排在最上面，其实是字典序把「1 最小」当成了「最新」。
 * v2.16.0：用户原话「2022 那个是无效号码，这种应该不记录进去。应该只记录
 *   正确教务网登录成功的学号」。名单彻底只收教务真号，手填号/脏号不记录，
 *   前端不再有「待补录 / 格式异常（手填）/ 校准·异常」这一套。
 *
 * 能验：排序纯函数（at 降序 / at=0 垫底 / 同 at 稳定）、时间格式化、
 *       后端只回传真号、前端不再拼手填行与格式异常标签、前后端判据一致。
 * 不能验：真机上名单页的观感；某条存量号是谁填的（只能从 KV 的 last/dev 查）。
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

/** 从 app.js 里切出名单那两个连着写的纯函数，真跑一遍。
 *
 * 不能按函数名逐个 cut：app.js 更早的地方已有一个同名 fmtAt（返回 '--'），
 * indexOf 会先命中它，切出来的根本不是名单用的那个（上一版就栽在这上面，
 * 测出「2026/11/5 19:29:39」「--」这种假 FAIL）。这里按区间整段切。
 * v2.16.0：区间里只剩 listNewFirst 与 fmtAt —— looksOddId 已删。 */
const F_START = '  function listNewFirst(';
const F_END = '  function renderList()';
const a0 = app.indexOf(F_START), b0 = app.indexOf(F_END, a0);
if (a0 < 0 || b0 < 0) throw new Error('切不出名单排序函数区');
const code = app.slice(a0, b0) +
  '\nthis.__f = { listNewFirst, fmtAt };';
const s = { Number, String, Date, Math, RegExp, console };
s.globalThis = s;
vm.createContext(s);
vm.runInContext(code, s, { filename: 'admin-list.js' });
const f = s.__f;

console.log('1. 名单按收录时间从新到老（排序纯函数，喂历史数据验证排序本身）');
{
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

console.log('\n2. 只记教务网登录成功的学号，手填号不记录（v2.16.0）');
{
  /* 后端判据：isKbId 只认本校真号 11 位 20 开头 */
  ok(worker.indexOf('^20\\d{2}\\d{7}$') >= 0,
    '后端 isKbId 只认 20xx+7 位本校真号（202211 这类过不了）');
  /* handleActivate 只有教务真号合法才记账；手填号不再无条件写 idx */
  ok(/if \(isKbId\(kb\)\) \{[\s\S]{0,800}idxApply\(env, \[\], dels\)[\s\S]{0,200}bindKbRow\(env, id, kb\)/.test(worker),
    '激活时只有教务真号合法才记账，手填号不写名单');
  /* bindKbRow 以真号为主键，非真号直接拒绝 */
  ok(/if \(!isKbId\(real\)\) return \{ changed: false, bound: false \}/.test(worker),
    'bindKbRow 非真号直接拒绝记账');
  /* handleList 按真号去重、手填号不回传 */
  ok(/const byReal = new Map\(\)/.test(worker), 'handleList 按教务真号键值去重');
  ok(/if \(!isKbId\(real\)\) return;/.test(worker), 'handleList 跳过无合法真号的存量行');
  ok(/const oddRows = \[\]/.test(worker), 'oddRows 恒空：异常号不再作为可操作条目回传');
  ok(/pendingCount: 0, conflictCount: 0/.test(worker), '待补录/冲突计数恒为 0');
  /* 前端已彻底删掉那套异常展示 */
  ok(!/looksOddId/.test(app), '前端 looksOddId 已删（不再标形状异常）');
  ok(!/格式异常（手填）/.test(app), '前端不再有「格式异常（手填）」标签');
  ok(!/ODD\.filter/.test(app) && !/\.concat\(pending\)/.test(app), '前端不再拼 ODD 待补录行');
  ok(/教务网登录学号 · 已验证/.test(app), '每行只陈述「教务网登录学号 · 已验证」');
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
  ok(/admListCnt'\)\.textContent = LIST\.length \+ ' 人'/.test(app),
    '列表总人数统计没被改坏');
  ok(/\.adm-id-wrap\{/.test(css) && /\.adm-at\{/.test(css), '名单行样式齐全');
}

console.log('\n' + (bad === 0
  ? '[PASS] 名单排序与真号口径 ' + total + ' 项全过'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
