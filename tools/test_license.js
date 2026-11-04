/* 离线验证 license.js 的「学号核对」状态机（v1.1.3）。
 *
 *   node tools/test_license.js
 *
 * 不引任何测试框架：本工程没有 node_modules，也不该为了几个断言去装。
 * 造一个假的 Host（getPref/setPref 落到内存 Map），把 web/license.js 原文
 * 丢进 vm 里跑，然后按预存的 pref 组合断言 accounts() / noteKbAccount() /
 * activate() / clearCheck() 的返回值和副作用。
 *
 * 为什么必须离线测：这几条逻辑的失败形态是「用户什么都点不出来」，
 * 真机复现要重装+换号+登教务，一轮十几分钟；这里一次跑完 1 秒。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'license.js'), 'utf8');

let pass = 0;
let fail = 0;

function ok(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log('  OK   ' + label);
    console.log('         ' + g);
  } else {
    fail++;
    console.log('  FAIL ' + label);
    console.log('         得到 ' + g + ' / 期望 ' + w);
  }
}

/** 用一个预置的 pref 表起一个干净的 LICENSE 实例。 */
function makeLicense(prefs) {
  const store = new Map(Object.entries(prefs || {}));
  const Host = {
    getPref: (k) => (store.has(k) ? store.get(k) : ''),
    setPref: (k, v) => { store.set(k, v); },
  };
  const ctx = { Host, console, localStorage: undefined };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\n;__out = LICENSE;', ctx, {
    filename: 'license.js',
    timeout: 2000,
  });
  return { L: ctx.__out, store };
}

const ID = '20261430313';
const FRIEND = '20250101999';

/* ---------- 1. 脏值（占位符）当成「没读到」 ---------- */
console.log('\n[1] 历史脏值必须被当「没读到」，且顺手清掉');
{
  const { L, store } = makeLicense({
    xxmu_license_id: ID,
    xxmu_acct_kb: '账号',          // v1.1.1 落下的血案值
  });
  const acc = L.accounts();
  ok('accounts().kb 为空（脏值不入账）', acc.kb, '');
  ok('accounts().id 仍是登记学号', acc.id, ID);
  ok('verified 为 false（不能算已一致）', acc.verified, false);
  ok('pref 里的脏值被擦掉', store.get('xxmu_acct_kb'), '');

  // 再读一次，确认真的是「洗过之后稳定」，而不是每次都被清
  const acc2 = L.accounts();
  ok('二次读取仍为空，不反复写入', acc2.kb, '');
}

/* ---------- 2. noteKbAccount 拒绝写脏值 ---------- */
console.log('\n[2] noteKbAccount 收到占位词不落盘');
{
  const { L, store } = makeLicense({ xxmu_license_id: ID });
  const r = L.noteKbAccount('账号');
  ok('返回 unknown=true（不拦同步）', { ok: r.ok, unknown: r.unknown }, { ok: true, unknown: true });
  ok('pref 没被写入', store.get('xxmu_acct_kb') || '', '');
  ok('verified 没被置空成「脏」', L.accounts().verified, false);
}

/* ---------- 3. 正常一致 / 正常不一致 ---------- */
console.log('\n[3] 读到真学号时的一致判定');
{
  const a = makeLicense({ xxmu_license_id: ID });
  const r1 = a.L.noteKbAccount(ID);
  ok('一致：ok=true', r1.ok, true);
  ok('一致：unknown=false', r1.unknown, false);
  ok('一致：verified=true', a.L.accounts().verified, true);

  const b = makeLicense({ xxmu_license_id: ID });
  const r2 = b.L.noteKbAccount(FRIEND);
  ok('不一致：ok=false', r2.ok, false);
  ok('不一致：acct 是朋友的号', r2.acct, FRIEND);
  ok('不一致：verified=false', b.L.accounts().verified, false);
}

/* ---------- 4. 换学号自动作废核对记录（刘雨鹭那条路） ---------- */
console.log('\n[4] 换学号必须清掉上一轮的核对记录');
{
  const { L, store } = makeLicense({ xxmu_license_id: FRIEND });
  L.noteKbAccount(FRIEND);
  ok('前置：先用朋友号核对通过', L.accounts().verified, true);

  L.activate(ID);                       // 改回自己的学号
  ok('activate 后 kb 被清空', store.get('xxmu_acct_kb'), '');
  ok('activate 后 verified 标记被清空', store.get('xxmu_verified'), '');
  ok('activate 后 id 是新学号', L.whoami(), ID);
  ok('此时 accounts().verified 为 false（等下次登录重核对）', L.accounts().verified, false);

  const r = L.noteKbAccount(ID);
  ok('之后再用自己的号登录：一致', r.ok, true);
  ok('之后 verified=true', L.accounts().verified, true);
}

/* ---------- 5. 同学号重复登记不能误清 ---------- */
console.log('\n[5] 填同一个学号不该把已通过的核对打掉');
{
  const { L } = makeLicense({ xxmu_license_id: ID });
  L.noteKbAccount(ID);
  ok('前置：verified=true', L.accounts().verified, true);
  L.activate(ID);                       // 手滑重新提交同一个号
  ok('同号重新登记后 verified 仍为 true', L.accounts().verified, true);
}

/* ---------- 6. clearCheck 只清核对，不动登记 ---------- */
console.log('\n[6] clearCheck 的爆炸半径');
{
  const { L, store } = makeLicense({
    xxmu_license_id: ID,
    xxmu_license: 'LEGACY',
    xxmu_verified: ID,
    xxmu_acct_kb: ID,
    xxmu_acct_cx: '13800138000',
  });
  L.clearCheck();
  ok('kb 清空', store.get('xxmu_acct_kb'), '');
  ok('cx 清空', store.get('xxmu_acct_cx'), '');
  ok('verified 清空', store.get('xxmu_verified'), '');
  ok('登记学号还在（这是关键：不该把账号一起退掉）', store.get('xxmu_license_id'), ID);
  ok('whoami 仍返回学号', L.whoami(), ID);
  ok('isActivated 仍为 true', L.isActivated(), true);
}

/* ---------- 7. looksLikeAccount 的边界 ---------- */
console.log('\n[7] looksLikeAccount 边界值');
{
  const { L } = makeLicense({});
  const cases = [
    ['账号', false], ['帐号', false], ['学号', false], ['用户名', false],
    ['密码', false], ['USERNAME', false], ['Account', false],
    ['', false], ['   ', false],
    [ID, true], ['  ' + ID + '  ', true], ['2026143031', true],
    ['13800138000', true],
    ['abc12345', false], ['2026143031a', false], ['12345', false],
  ];
  for (const [v, want] of cases) {
    ok(JSON.stringify(v) + ' -> ' + want, L.looksLikeAccount(v), want);
  }
}

console.log('\n' + (fail === 0
  ? '[PASS] license 状态机 ' + pass + ' 条断言全过'
  : '[FAIL] ' + fail + ' 条断言未过'));
process.exit(fail === 0 ? 0 : 1);
