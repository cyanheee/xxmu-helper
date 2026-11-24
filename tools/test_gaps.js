/* v2.15.0「写了没人读」四处补线的离线测试 —— node tools/test_gaps.js
 *
 * 四处都是 teammate 调研 + 我逐条验证后确认的真缺口：
 *   1. focus.js 的「重置」按钮被局部 const 遮蔽 —— 点一下抛 TypeError、计时不复位（真 BUG）；
 *   2. sources.js 的 autoDiag() 写了每 30 分钟跳过谁，about.js 复制诊断独漏它；
 *   3. focus.js 的 peakOf() 从 v2.4.0 写好就没人调用，高光日一直藏着；
 *   4. focus.js 的 LAST_ERR 写了坏数据从不显示，用户只看到静默 0。
 *
 * 做法：纯函数（shortDate / diagText 的 autoLine）用 cut() 切真源码进 vm 真跑；
 * 「接线」类（按钮回调 / peakOf 调用 / LAST_ERR 显示 / autoDiag 进诊断）用源码纪律
 * 断言钉死 —— 这类是「某处调用了某处」，没有可独立跑的输入输出，只能靠结构断言。
 * 纪律断言一律先剥注释再判（这个坑已经踩了 5 次：注释里正解释某词、断言把自己判红）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FOCUS = fs.readFileSync(path.join(ROOT, 'web', 'focus.js'), 'utf8');
const ABOUT = fs.readFileSync(path.join(ROOT, 'web', 'about.js'), 'utf8');
const SOURCES = fs.readFileSync(path.join(ROOT, 'web', 'sources.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
const APPCSS = fs.readFileSync(path.join(ROOT, 'web', 'app.css'), 'utf8');
const OGCSS = fs.readFileSync(path.join(ROOT, 'web', 'nova-organs.css'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  [FAIL] ' + label + (extra ? ' :: ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

/* 剥掉 /* *\/ 块注释与 // 行注释 —— 纪律断言只能对剥过的源码判。 */
function strip(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const focusCode = strip(FOCUS);
const aboutCode = strip(ABOUT);

/* ---------- 1. shortDate 纯函数：切真源码进 vm 真跑 ---------- */
function cut(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', m.index);
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

const vmCode = [cut(FOCUS, 'shortDate'), 'this.__shortDate = shortDate;'].join('\n');
const ctx = vm.createContext({});
vm.runInContext(vmCode, ctx);
const shortDate = ctx.__shortDate;
eq(shortDate('2026-11-21'), '11月21日', 'shortDate 正常日期');
eq(shortDate('2026-01-05'), '1月5日', 'shortDate 去前导零');
eq(shortDate('2026-12-31'), '12月31日', 'shortDate 双位数');
eq(shortDate(''), '', 'shortDate 空串');
eq(shortDate(null), '', 'shortDate null');
eq(shortDate('2026/11/21'), '', 'shortDate 非 ISO 分隔符');
eq(shortDate('2026-1-5'), '', 'shortDate 非补零');

/* ---------- 2. 重置按钮 bug：局部变量改名 + 显式回调 ---------- */
ok(!/const\s+reset\s*=\s*\$\('focusReset'\)/.test(focusCode), '重置按钮不再用遮蔽名 reset');
ok(/const\s+resetBtn\s*=\s*\$\('focusReset'\)/.test(focusCode), '重置按钮改用 resetBtn');
ok(/resetBtn\.onclick\s*=\s*\(\)\s*=>\s*reset\(\)/.test(focusCode), '回调显式调用模块级 reset()');

/* ---------- 3. LAST_ERR 显示接线 ---------- */
ok(/const\s+stateErr\s*=\s*LAST_ERR/.test(focusCode), 'paint 立刻取 LAST_ERR');
ok(/statEl\.classList\.toggle\('warn',\s*!!stateErr\)/.test(focusCode), '统计行按错误上 warn 色');
ok(/\$\('focusErr'\)/.test(focusCode), '取 #focusErr 独立错误行');
ok(/errEl\.textContent\s*=\s*stateErr\s*\|\|\s*''/.test(focusCode), '错误文字写进 focusErr');
ok(/errEl\.style\.display\s*=\s*stateErr\s*\?/.test(focusCode), '无错误时隐藏错误行');
ok(/readErr:\s*\(\)\s*=>\s*LAST_ERR/.test(focusCode), '导出 readErr 供诊断');
ok(/id="focusErr"/.test(HTML), 'index.html 有 #focusErr 节点');
ok(/\.focus-err\s*\{/.test(APPCSS), 'classic 有 .focus-err 样式');
ok(/\.focus-stat\.warn\s*\{/.test(APPCSS), 'classic 有 .focus-stat.warn 样式');
ok(/html\[data-skin="nova"\]\s*\.focus-err\s*\{/.test(OGCSS), 'NOVA 有 .focus-err 样式');

/* ---------- 4. peakOf 接线 ---------- */
ok(/const\s+pk\s*=\s*peakOf\(state\.log,\s*HIST_DAYS\)/.test(focusCode), 'paintHisto 真调用 peakOf');
ok(/pk\.min\s*>\s*0/.test(focusCode), '有记录才加高光日一句');
ok(/'最长一天 '\s*\+\s*pk\.min/.test(focusCode), '高光日显示最长分钟数');
ok(/shortDate\(pk\.key\)/.test(focusCode), '高光日显示 M月D日');

/* ---------- 5. autoDiag 接进复制诊断（vm 真跑 diagText 的 autoLine 段） ---------- */
/* 造一段与 about.js 里同构的 autoLine 计算脚本（自动刷新段是新增的、可独立验逻辑）。 */
function cutBetween(src, startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error('切不到段：' + startMark);
  return src.slice(a, b);
}
/* 直接从 about.js 里把 diagText() 整块切出来真跑。 */
const diagFn = cut(ABOUT, 'diagText');
const logs = [
  { at: new Date(2026, 10, 21, 9, 5).getTime(), reason: 'learn-tab', ran: 2, changed: true,
    results: [{ id: 'ykt', state: 'ok' }, { id: 'zxs', state: 'stale' }] },
  { at: new Date(2026, 10, 21, 8, 30).getTime(), reason: 'resume', ran: 0 },
];
const diagCtx = vm.createContext({
  LICENSE: { whoami: () => '20260001', usable: () => true, isAdmin: () => false, accounts: () => ({ kb: '20260001', verified: true }) },
  AUTH: { usable: () => true, isAdmin: () => false },
  APP_VERSION: '2.15.0',
  SOURCES: { autoDiag: () => logs },
  CX: { cached: () => ({ works: [{ status: 'done' }], exams: [] }) },
  navigator: { userAgent: 'test' },
  $: () => ({ textContent: '超星' }),
  deviceInfo: () => 'test-device',
  currentUser: undefined,
  Host: undefined,
});
vm.runInContext(diagFn, diagCtx);
const diag = diagCtx.diagText();
ok(diag.indexOf('自动刷新') >= 0, '诊断里有「自动刷新」段');
ok(diag.indexOf('learn-tab') >= 0, '诊断里有刷新原因');
ok(diag.indexOf('刷了 2 个') >= 0, '诊断里有跑了几个');
ok(diag.indexOf('有变化') >= 0, '诊断里有变化标记');
ok(diag.indexOf('zxs:stale') >= 0, '诊断里列出被跳过的来源与状态');
ok(/11\/21\s+09:05/.test(diag), '诊断里有可读时间戳（M/D HH:mm）');
/* 无日志时明说「还没有记录」。 */
const diagCtx2 = vm.createContext(Object.assign({}, {
  LICENSE: diagCtx.LICENSE, AUTH: diagCtx.AUTH, APP_VERSION: '2.15.0',
  SOURCES: { autoDiag: () => [] }, CX: { cached: () => null },
  navigator: { userAgent: 'x' }, $: () => null, deviceInfo: () => 'x',
}));
vm.runInContext(diagFn, diagCtx2);
ok(diagCtx2.diagText().indexOf('自动刷新：还没有记录') >= 0, '无日志时明说还没有记录');
/* SOURCES 缺失时不炸。 */
const diagCtx3 = vm.createContext({
  LICENSE: diagCtx.LICENSE, AUTH: diagCtx.AUTH, APP_VERSION: '2.15.0',
  CX: { cached: () => null }, navigator: { userAgent: 'x' },
  $: () => null, deviceInfo: () => 'x',
});
vm.runInContext(diagFn, diagCtx3);
ok(diagCtx3.diagText().indexOf('自动刷新：还没有记录') >= 0, 'SOURCES 缺失时安全降级');
/* 源码纪律：autoDiag 真被 diagText 引用。 */
ok(/SOURCES\.autoDiag\(\)/.test(aboutCode), 'diagText 调 SOURCES.autoDiag()');
ok(/autoLine/.test(aboutCode), '返回数组里有 autoLine');
ok(/autoDiag\(\)\s*\{\s*return\s+AUTO_LOG\.slice\(\)/.test(SOURCES.replace(/\n/g, ' ')), 'autoDiag 导出日志副本');

console.log(fail === 0
  ? '[PASS] 补齐没人读的缺口 v2.15.0 行为测试通过 ' + pass + ' 项'
  : '[FAIL] ' + fail + ' 项失败 / ' + pass + ' 项通过');
process.exit(fail === 0 ? 0 : 1);
