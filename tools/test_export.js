/* 河医大助手 · 备份与导出（v2.5.0）行为测试
 *
 * 跑法：node tools/test_export.js
 *
 * 这个文件测的是 web/export.js 真代码，不是夹具里的复制品 ——
 * 直接 require 那份文件（它末尾有 module.exports，浏览器里那一行不执行）。
 *
 * 重点覆盖三类最容易出事的点：
 *   1. 敏感键绝不出现在备份里（登录态一旦跟着备份走，换台手机就能冒用身份）
 *   2. 读坏的键要进 skipped，不能假装「你本来就没有」
 *   3. 白名单之外的键不该出现（防止将来有人加了新键就自动泄漏）
 */

'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'export.js'), 'utf8');
const E = require(path.join(ROOT, 'web', 'export.js'));

let pass = 0, fail = 0;
const fails = [];

function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  fails.push(label + (extra ? ('  → ' + extra) : ''));
}
function eq(a, b, label) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(sa === sb, label, 'got ' + sa + ', want ' + sb);
}

/* ------------------------------------------------------------------ 1. 白名单 */

ok(Array.isArray(E.PICK) && E.PICK.length >= 30, '白名单是一份长清单', 'len=' + E.PICK.length);
ok(E.PICK.indexOf('xxmu_mytodo') >= 0, '待办在导出清单里');
ok(E.PICK.indexOf('xxmu_focus') >= 0, '专注记录在导出清单里');
ok(E.PICK.indexOf('xxmu_grades') >= 0, '成绩在导出清单里');
ok(E.PICK.indexOf('xxmu_gpa_target') >= 0, '目标绩点在导出清单里');
ok(E.PICK.indexOf('xxmu_water_devs') >= 0, '饮水机设备在导出清单里');
ok(E.PICK.indexOf('xxmu_water_token') < 0, '饮水机 token 不在导出清单里');
ok(E.PICK.indexOf('xxmu_ykt_auth') < 0, '雨课堂授权不在导出清单里');
ok(E.PICK.indexOf('xxmu_zhs_auth') < 0, '知到授权不在导出清单里');
ok(E.PICK.indexOf('xxmu_license') < 0, '激活码不在导出清单里');
ok(E.PICK.indexOf('xxmu_admin_key') < 0, '管理员密钥不在导出清单里');
ok(E.PICK.indexOf('xxmu_acct_cx') < 0, '教务账号不在导出清单里');

/* 白名单与敏感名单不能有交集 —— 有交集就是白名单写错了，出事时 SECRET 那道
 * 双保险会静默吞掉一个用户以为会备份的键，属于「安静地少备份」。 */
const inter = E.PICK.filter(k => E.SECRET.indexOf(k) >= 0);
eq(inter, [], '白名单与敏感名单没有交集');

/* 敏感名单本身要覆盖到所有真存在的高危键 */
['xxmu_water_token', 'xxmu_water_uid', 'xxmu_ykt_auth', 'xxmu_zhs_auth',
  'xxmu_acct_cx', 'xxmu_acct_kb', 'xxmu_cx_homework',
  'xxmu_license', 'xxmu_license_id', 'xxmu_ticket', 'xxmu_ticket_exp',
  'xxmu_admin_key', 'xxmu_fp'].forEach(function (k) {
    ok(E.SECRET.indexOf(k) >= 0, '敏感名单覆盖 ' + k);
  });

/* ---------------------------------------------------------- 2. buildBackup 基本 */

const FIXED = new Date(2026, 10, 21, 14, 2, 11);
const store = {
  xxmu_mytodo: JSON.stringify([{ id: 'a', text: '交实验报告' }, { id: 'b', text: '复习病理' }]),
  xxmu_focus: JSON.stringify({ settings: { mode: 'pomo' }, log: { '2026-11-20': 30, '2026-11-21': 45 } }),
  xxmu_grades: JSON.stringify({ list: [{ name: '系统解剖学', score: '87' }] }),
  xxmu_water_devs: JSON.stringify([{ id: 'g-1' }, { id: 'g-2' }]),
  xxmu_wiki_mine: JSON.stringify([{ id: 'w1' }]),
  xxmu_gpa_target: '3.5',
  xxmu_start: '2026-08-31',
  xxmu_weeks: '20',
};
function reader(map) {
  return function (k) {
    const v = map[k];
    if (v === undefined) return { ok: true, value: '' };
    return { ok: true, value: v };
  };
}

const b = E.buildBackup(FIXED, reader(store));
eq(b.app, 'xxmu-helper', '备份文件带 app 标记');
eq(b.backup, 1, '备份格式版本是 1');
eq(b.at, '2026-11-21 14:02:11', '时间戳用本地时间（不是 UTC）');
eq(Object.keys(b.data).sort(), ['xxmu_focus', 'xxmu_gpa_target', 'xxmu_mytodo',
  'xxmu_start', 'xxmu_water_devs', 'xxmu_weeks', 'xxmu_wiki_mine', 'xxmu_grades'].sort(),
  '只导出有值的键');
ok(!('xxmu_skin' in b.data), '本来就没有的键不写空串占位');
eq(b.skipped, [], '一切正常时 skipped 为空');
eq(b.counts.todos, 2, '数出 2 条待办');
eq(b.counts.focusDays, 2, '数出 2 天专注记录');
eq(b.counts.grades, 1, '数出 1 门成绩');
eq(b.counts.water, 2, '数出 2 台饮水机');
eq(b.counts.wiki, 1, '数出 1 条自己发的 WIKI');

/* ------------------------------------------------------------ 3. 敏感键不进文件 */

const leakStore = Object.assign({}, store, {
  xxmu_water_token: 'TOKEN-abc-123',
  xxmu_ykt_auth: 'YKT-SECRET',
  xxmu_zhs_auth: 'ZHS-SECRET',
  xxmu_admin_key: 'ADMIN-SECRET',
  xxmu_license: 'LIC-SECRET',
});
const bl = E.buildBackup(FIXED, reader(leakStore));
const dump = JSON.stringify(bl);
['TOKEN-abc-123', 'YKT-SECRET', 'ZHS-SECRET', 'ADMIN-SECRET', 'LIC-SECRET'].forEach(function (s) {
  ok(dump.indexOf(s) < 0, '备份里不含 ' + s);
});
ok(!('xxmu_water_token' in bl.data), 'data 里没有 token 这个键');

/* 就算有人把敏感键误加进 PICK，SECRET 那道双保险也要挡住 */
const savedPick = E.PICK.slice();
E.PICK.push('xxmu_water_token');
const bd = E.buildBackup(FIXED, reader(leakStore));
E.PICK.length = 0;
savedPick.forEach(k => E.PICK.push(k));
ok(!('xxmu_water_token' in bd.data), '白名单误加敏感键也会被 SECRET 挡住');

/* ---------------------------------------------------------------- 4. 读坏的键 */

const bad = E.buildBackup(FIXED, function (k) {
  if (k === 'xxmu_mytodo') return { ok: false, why: '内容超过 512KB（999999 字符），没有导出' };
  if (k === 'xxmu_focus') throw new Error('存储层炸了');
  return { ok: true, value: '' };
});
ok(!('xxmu_mytodo' in bad.data), '读坏的键不进 data');
eq(bad.skipped.length, 2, 'ok:false 的和抛异常的，两个都进 skipped',
  'skipped=' + JSON.stringify(bad.skipped.map(s => s.key)));
ok(bad.skipped.some(s => s.key === 'xxmu_mytodo'), 'skipped 里点名了读坏的那个键');
ok(bad.skipped.some(s => s.key === 'xxmu_focus'), 'skipped 里点名了抛异常的那个键');
ok(bad.skipped.filter(s => s.key === 'xxmu_mytodo')[0].why.indexOf('512KB') >= 0, 'skipped 里带上了原因');
ok(bad.skipped.filter(s => s.key === 'xxmu_focus')[0].why.indexOf('抛异常') >= 0, '抛异常也写清了');
ok(bad.notes.length > 0, '一个键都没有时 notes 说明白了');

/* ------------------------------------------------ 5. 空机 / 只有缓存也不能崩 */

const empty = E.buildBackup(FIXED, reader({}));
eq(empty.counts.keys, 0, '空机 keys=0');
ok(empty.notes.some(n => n.indexOf('还没有可导出的数据') >= 0), '空机给一句人话');
eq(E.summary(empty), '这台手机上还没有可导出的数据', '空机 summary 说人话');

const withCache = E.buildBackup(FIXED, reader({ xxmu_mytodo: '[]' }));
ok(withCache.counts.keys === 1, '空数组也算有值（写进 data 的是 "[]" 本身）');

/* -------------------------------------------------------- 6. summary / 文件名 */

eq(E.summary(b), '可导出：2 条待办 · 2 天专注记录 · 1 门成绩 · 2 台饮水机 · 1 条我发的 WIKI',
  'summary 按固定顺序拼');
eq(E.fileName(FIXED), '河医大助手备份-20261121-1402.json', '文件名带本地时间戳');
eq(E.stamp(FIXED), '2026-11-21 14:02:11', 'stamp 是本地时间');
eq(E.stampFile(FIXED), '20261121-1402', 'stampFile 是紧凑时间戳');

/* ------------------------------------------------------ 7. jsonText 可被解析 */

const txt = E.jsonText(b);
let parsed = null;
try { parsed = JSON.parse(txt); } catch (e) { }
ok(parsed && parsed.app === 'xxmu-helper', 'jsonText 输出是合法 JSON');
ok(txt.indexOf('\n') > 0, 'jsonText 带缩进（diff 的时候能看）');
ok(txt.length > 100, 'jsonText 不是空壳');

/* ------------------------------------------------------------ 8. 源码纪律 */

/* 先剥注释再查。export.js 的文件头注释里正在解释「绝不能写 !module.exports」
 * 「不要用 toISOString」「不要写 window.APP_VERSION」—— 直接 indexOf 会把
 * 自己的说明文字判成违规（v2.1.0 的 check_apk_inside 就踩过这个坑）。 */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

ok(SRC.indexOf('@testable:buildBackup') >= 0, 'buildBackup 带 @testable 标记');
ok(SRC.indexOf('@testable:countOf') >= 0, 'countOf 带 @testable 标记');
ok(SRC.indexOf('@testable:summary') >= 0, 'summary 带 @testable 标记');
ok(CODE.indexOf('!module.exports') < 0, '没有 !module.exports 这个自启动陷阱');
ok(CODE.indexOf("typeof module === 'undefined'") >= 0, '自启动守卫用 typeof module');
ok(CODE.indexOf('OK:') >= 0 && CODE.indexOf('ERR:') >= 0, 'saveFile 读 OK:/ERR: 前缀');
ok(CODE.indexOf('window.APP_VERSION') < 0, '没有把顶层 const 当 window 属性用');
ok(CODE.indexOf('toISOString') < 0, '没有用 toISOString（UTC 会早 8 小时）');
ok(CODE.indexOf('fetch(') < 0 && CODE.indexOf('XMLHttpRequest') < 0, '一次网络请求都不发');
/* 不能对 xxmu_ 前缀做扫描式导出 */
ok(!/PICK\s*=\s*[^;]*Object\.keys/.test(CODE), '白名单不是扫前缀生成的');

/* --------------------------------------------------------------- 结果 */

console.log('');
if (fail === 0) {
  console.log('\u2713 备份与导出 v2.5.0 行为测试通过 ' + pass + ' 项');
  process.exit(0);
}
console.log('\u2717 备份与导出 v2.5.0 有 ' + fail + ' 项没过（共 ' + (pass + fail) + ' 项）');
fails.forEach(function (f) { console.log('   \u2717 ' + f); });
process.exit(1);
