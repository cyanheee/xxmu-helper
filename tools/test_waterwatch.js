/* 出水看护（v2.1.0）的行为测试（真跑 web/waterwatch.js 里的逻辑，不打网络）。
 *
 *   node tools/test_waterwatch.js
 *
 * 这块功能只做一件事：记下「已解锁、还没确认结束」的出水口，定时查一次
 * 官方状态接口，一读到 3/5/6 就收掉并告诉人。所以要守的边界也就四条：
 *   · 读不到状态 -> 继续试，绝不因此说「已停了」（这是用户最怕的谎）
 *   · 读到 3/5    -> 收掉，并把 amount 原样带出来（不换算毫升）
 *   · 读到 6      -> 收掉，说「报故障」，别说「正常结束」
 *   · 认了太久（30 分钟）还没结论 -> 放弃看护，明说放弃
 *
 * 做法：从 waterwatch.js 切出 IIFE 本体，注入假的 XXMU / WATER / Promise 沙箱。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'waterwatch.js'), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  \u2192 ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a)); }

/* 只取 IIFE 本体：`const WATERWATCH = (() => { ... })();`
 * 后面的自启动守卫（typeof module === 'undefined' ...）在这里不该跑。 */
const end = src.indexOf('})();');
if (end < 0) throw new Error('waterwatch.js 里找不到 IIFE 收尾');
const BODY = src.slice(0, end + 5);

const CODE = [
  BODY,
  'this.__ww = WATERWATCH;',
].join('\n');

/** 造沙箱：store 是本机 pref；routes 是 { 'goods/shower/sync': [响应...] }。 */
function make(routes, live) {
  const store = { xxmu_water_live: JSON.stringify(live || {}) };
  const toasts = [];
  const calls = [];
  const consumed = {};

  const XXMU = {
    pref(k, v) {
      if (v === undefined) return store[k] || '';
      store[k] = String(v);
      return store[k];
    },
    toast(msg) { toasts.push(String(msg)); },
  };

  const WATER = {
    syncWater(sku) {
      calls.push(sku);
      const seq = routes['goods/shower/sync'];
      if (!seq || !seq.length) return Promise.reject(new Error('没有准备响应'));
      const n = consumed['s'] || 0;
      consumed['s'] = n + 1;
      const pick = seq[Math.min(n, seq.length - 1)];
      if (pick instanceof Error) return Promise.reject(pick);
      return Promise.resolve(pick);
    },
  };

  const sandbox = {
    XXMU, WATER, console: { warn() {}, log() {} },
    Promise, JSON, Array, Object, String, Number, Math, Date, parseInt, parseFloat, isNaN,
    setTimeout, clearTimeout, Error, RegExp,
    /* 没有 document / window：paint() 与 init() 会自己早退，正好只测逻辑层。 */
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'waterwatch-cut.js' });
  return { api: sandbox.__ww, store, calls, consumed, toasts, sandbox };
}

const DEV = { id: 'g-1', name: '三号楼饮水机' };
const FN = { id: 'sku-cold', name: '冷' };

function liveOf(m) {
  try { return JSON.parse(m.store.xxmu_water_live || '{}'); } catch (e) { return {}; }
}

(async function main() {

  /* ================= 登记 / 注销 ================= */
  console.log('\n[0] 解锁后登记、查得回来、能注销');
  {
    const m = make({});
    eq(m.api.has(DEV, FN), false, '一开始没有记录');
    m.api.arm(DEV, FN);
    eq(m.api.has(DEV, FN), true, 'arm 之后 has 为真');
    eq(m.api.has('g-1', 'sku-cold'), true, '也认裸 id（renderDevs 传的就是 id）');
    const l = m.api.list();
    eq(l.length, 1, 'list 里一条');
    eq(l[0].devName, '三号楼饮水机', '记下了机器名');
    eq(l[0].name, '冷', '记下了出水口名');
    m.api.disarm(DEV, FN.id);
    eq(m.api.has(DEV, FN), false, 'disarm 之后没了');
    eq(m.api.list().length, 0, 'list 空了');
  }

  console.log('\n[1] 重复解锁不重置起点（「已放多少秒」不能跳回 0）');
  {
    const old = Date.now() - 60 * 1000;
    const m = make({}, {
      'g-1:sku-cold': { dev: 'g-1', devName: '三号楼饮水机', sku: 'sku-cold', name: '冷', at: old },
    });
    m.api.arm(DEV, FN);
    eq(liveOf(m)['g-1:sku-cold'].at, old, 'at 沿用旧值');
  }

  console.log('\n[2] 同一台机器多个出水口、多台机器互不干扰');
  {
    const m = make({});
    m.api.arm(DEV, FN);
    m.api.arm(DEV, { id: 'sku-hot', name: '热' });
    m.api.arm({ id: 'g-2', name: '四号楼' }, FN);
    eq(m.api.list().length, 3, '三条独立记录');
    eq(m.api.disarmDev('g-1'), 2, 'disarmDev 只收掉那台机器的两个出水口');
    eq(m.api.list().length, 1, '剩下另一台机器');
    eq(m.api.disarmDev(), -1, '无参 = 全清（退出账号）');
    eq(m.api.list().length, 0, '全清了');
  }

  /* ================= 状态轮询 ================= */
  console.log('\n[3] 读到 status 3（完成）就收掉，amount 原样带出');
  {
    const m = make({ 'goods/shower/sync': [{ status: 3, amount: 547 }] });
    m.api.arm(DEV, FN);
    const r = await m.api.pollOnce();
    eq(r.ran, 1, '查了一次');
    eq(r.ended, 1, '收掉一条');
    eq(m.api.list().length, 0, '看护清单空了');
    eq(m.toasts.length, 1, '弹了一次提示');
    ok(/已经停了/.test(m.toasts[0]), '提示说的是「已经停了」');
    ok(/547/.test(m.toasts[0]), '把 amount 原样带出来了', m.toasts[0]);
  }

  console.log('\n[4] 读到 status 5（另一种完成态）同样收掉');
  {
    const m = make({ 'goods/shower/sync': [{ status: 5, amount: 0 }] });
    m.api.arm(DEV, FN);
    const r = await m.api.pollOnce();
    eq(r.ended, 1, 'status 5 也认收工');
    eq(m.api.list().length, 0, '清单空了');
    ok(/平台没给结算量/.test(m.toasts[0]), 'amount=0 时如实说平台没给量', m.toasts[0]);
  }

  console.log('\n[5] 读到 status 6（故障）收掉，但说的是「报故障」不是「正常结束」');
  {
    const m = make({ 'goods/shower/sync': [{ status: 6, amount: 0 }] });
    m.api.arm(DEV, FN);
    const r = await m.api.pollOnce();
    eq(r.ended, 1, '故障也收掉（没结论就别一直挂着）');
    ok(/故障/.test(m.toasts[0]), '提示里说报故障', m.toasts[0]);
    ok(!/已经停了/.test(m.toasts[0]), '没有说成「已经停了」');
  }

  console.log('\n[6] 读到 1/4（还没出水）继续看护，不动它');
  {
    const m = make({ 'goods/shower/sync': [{ status: 1, amount: 0 }] });
    m.api.arm(DEV, FN);
    const r = await m.api.pollOnce();
    eq(r.ended, 0, '不收掉');
    eq(m.api.list().length, 1, '还在清单里');
    eq(m.api.has(DEV, FN), true, 'has 仍为真');
    eq(m.toasts.length, 0, '没弹提示');
  }

  console.log('\n[7] 读不到状态（网络错）-> 继续试，绝不判「已停了」');
  {
    const m = make({ 'goods/shower/sync': [new Error('网络超时')] });
    m.api.arm(DEV, FN);
    const r = await m.api.pollOnce();
    eq(r.ended, 0, '没有收掉');
    eq(m.api.list().length, 1, '还在看护清单里');
    eq(m.toasts.length, 0, '绝不弹「已经停了」');
    const l = m.api.list();
    ok(/网络超时/.test(String(l[0].err)), '把读不到的错记下来了（界面能如实显示）', l[0].err);
  }

  console.log('\n[8] 认了 30 分钟还没结论 -> 放弃并明说放弃');
  {
    const stale = Date.now() - 31 * 60 * 1000;
    const m = make({ 'goods/shower/sync': [{ status: 2, amount: 0 }] }, {
      'g-1:sku-cold': { dev: 'g-1', devName: '三号楼饮水机', sku: 'sku-cold', name: '冷', at: stale },
    });
    const r = await m.api.pollOnce();
    eq(r.ended, 0, '不是「结束」，是「放弃」');
    eq(m.api.list().length, 0, '清单清掉了');
    eq(m.toasts.length, 0, '放弃不弹 toast（免得人以为发生大事）');
    ok(m.api.has(DEV, FN) === false, 'has 变 false，按钮回到「放水」');
  }

  console.log('\n[9] sheet 里有操作时让 watchVolume 独占，不打双份接口');
  {
    const m = make({ 'goods/shower/sync': [{ status: 3, amount: 0 }] });
    m.api.arm(DEV, FN);
    m.api.setBusy(true);
    const r = await m.api.pollOnce();
    eq(r.skipped, 'busy', 'busy 时直接跳过');
    eq(m.calls.length, 0, '一个请求都没发');
    eq(m.api.list().length, 1, '看护记录原样留着');
    m.api.setBusy(false);
  }

  console.log('\n[10] 单飞：上一轮没跑完时再调直接跳过');
  {
    const m = make({ 'goods/shower/sync': [{ status: 2, amount: 0 }] });
    m.api.arm(DEV, FN);
    const p1 = m.api.pollOnce();
    const p2 = m.api.pollOnce();
    const r2 = await p2;
    eq(r2.skipped, 'ticking', '第二次调用被跳过');
    await p1;
  }

  console.log('\n[11] 清单空的时候不假装在查');
  {
    const m = make({});
    const r = await m.api.pollOnce();
    eq(r.skipped, 'empty', '空清单直接返回');
    eq(m.calls.length, 0, '没发请求');
  }

  console.log('\n[12] 存坏了的数据当空处理，不抛');
  {
    const m = make({});
    m.store.xxmu_water_live = '{这不是 JSON';
    eq(m.api.list().length, 0, '坏数据当空清单');
    eq(m.api.has(DEV, FN), false, 'has 不会抛');
    m.api.arm(DEV, FN);
    eq(m.api.list().length, 1, '坏数据被覆盖后还能正常登记');
  }

  console.log('\n' + (bad === 0
    ? '  [PASS] 出水看护 v2.1.0 行为测试通过 ' + total + ' 项'
    : '  [FAIL] ' + bad + '/' + total + ' 项未过'));
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => {
  console.log('\n[FAIL] 测试自身抛异常：' + (e && e.stack || e));
  process.exit(1);
});
