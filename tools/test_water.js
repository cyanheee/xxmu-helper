/* 饮水机 v1.1.60 的行为测试（真跑 water.js 里的逻辑，不打网络）。
 *
 *   node tools/test_water.js
 *
 * v1.1.60 诚实版：云端实锤放水途中平台不给实时用量、也没有「出 N ml 就停」
 * 的入参，计时换算（流速不固定）也被否。这里真跑两件剩下的东西：
 *   · watchVolume 的状态轮询 + 防忘关超时（只发一次 endWater，失败如实上报）；
 *   · 结算 amount 原样回传（只增不减，绝不换算成毫升）；
 * 以及一直保留的自动重绑、endWater 入参、syncWater 解析。
 *
 * 做法：从 water.js 里切出需要的函数，注入假的 XXMU 与脚本化 call()。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'water.js'), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  \u2192 ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a)); }

/* 按花括号配平切出 `function name(...) { ... }`。 */
function cut(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(name + ' 花括号不配平');
}

const CODE = [
  'const K_TOKEN = "xxmu_water_token";',
  'const K_DEVS = "xxmu_water_devs";',
  'const PAY_PAGE = "p";',
  cut('logged'),
  cut('endWater'),
  cut('syncWater'),
  cut('pollMsg'),
  cut('unlock'),
  cut('fetchMachine'),
  cut('fetchSkus'),
  cut('buildDev'),
  cut('loadDevs'),
  cut('saveDevs'),
  cut('refreshDev'),
  cut('endWaterTarget'),
  'const K_GUARD = "xxmu_water_guard";',
  cut('guardSec'),
  cut('setGuardSec'),
  cut('watchVolume'),
  cut('unlockWithRebind'),
  'const RETRY_CODES = ["-1", "-19"];',
  'this.__api = { watchVolume, unlockWithRebind, unlock, endWater, syncWater, guardSec, setGuardSec };',
].join('\n');

/** 造沙箱：routes 是 { 接口路径: [响应...] }，用完重复最后一个。 */
function make(routes, devs) {
  const store = { xxmu_water_token: 'tok', xxmu_water_devs: JSON.stringify(devs || []) };
  const calls = [];
  const consumed = {};

  const XXMU = {
    pref(k, v) {
      if (v === undefined) return store[k] || '';
      store[k] = String(v);
      return store[k];
    },
    splitResp: (raw) => ({ code: 200, body: raw }),
    decodeAuto: (s) => s,
  };

  function call(p, params) {
    calls.push({ p, params });
    const seq = routes[p];
    if (!seq || !seq.length) return Promise.reject(new Error('没有为 ' + p + ' 准备响应'));
    const n = consumed[p] || 0;
    consumed[p] = n + 1;
    const pick = seq[Math.min(n, seq.length - 1)];
    if (pick instanceof Error) return Promise.reject(pick);
    return Promise.resolve(pick);
  }

  const sandbox = {
    XXMU, call, console: { warn() {}, log() {} },
    Promise, JSON, Array, Object, String, Number, Math, Date, parseInt, parseFloat, isNaN, setTimeout,
    Error, RegExp,
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'water-cut.js' });
  return { api: sandbox.__api, store, calls, consumed, sandbox };
}

/* 快进钩子：把轮询/观察窗口压到毫秒级，避免每个用例跑 7 秒。 */
const FAST = { gap: 30, firstGap: 20, settleGap: 60, zeroWarnAt: 3 };
function H(extra) { return Object.assign({}, FAST, extra); }

(async function main() {

  /* ================= 最长放水（防忘关）档位 ================= */
  console.log('\n[0] 最长放水档位持久化（秒，0 = 不自动停）');
  {
    const m = make({});
    eq(m.api.guardSec(), 0, '默认 0 = 不自动停');
    eq(m.api.setGuardSec(120), 120, 'setGuardSec 返回设置值');
    eq(m.api.guardSec(), 120, '读回持久化值');
    eq(m.api.setGuardSec(-5), 0, '负数夹到 0');
  }

  /* ================= 放水守护 ================= */
  console.log('\n[1] 防忘关超时只发一次停止（放水全程 amount=0）');
  {
    const m = make({
      'goods/shower/sync': [{ status: 2, amount: 0 }],
      'goods/endWater': [{}],
    });
    const r = await m.api.watchVolume('sku-1', 120, H({ machineId: 'g-1', guardMs: 40 }));
    eq(m.consumed['goods/endWater'], 1, '只发了一次 endWater');
    ok(r && r.stoppedByUs === true, '标记为本机发的停止');
    ok(r && r.done === true, '观察窗过后正常收工');
  }

  console.log('\n[2] 没检测到出水就不起表，机器自己结束也正常收工');
  {
    const m = make({
      'goods/shower/sync': [
        { status: 1, amount: 0 }, { status: 1, amount: 0 },
        { status: 1, amount: 0 }, { status: 3, amount: 0 },
      ],
    });
    let zero = 0;
    const r = await m.api.watchVolume('sku-1', 120, H({
      machineId: 'g-1', guardMs: 40, zeroWarnAt: 2, onZero: () => { zero++; },
    }));
    eq(m.consumed['goods/endWater'], undefined, '没起表就绝不会自动发停止');
    ok(zero >= 1, '没出水给了提示回调');
    ok(r && r.done === true, '机器自己结束正常收工');
    ok(r && r.stoppedByUs === false, '不是我们停的');
  }

  console.log('\n[3] 防忘关停止失败如实上报');
  {
    const m = make({
      'goods/shower/sync': [{ status: 2, amount: 0 }],
      'goods/endWater': [new Error('网络超时')],
    });
    let stopErr = null;
    const r = await m.api.watchVolume('sku-1', 120, H({
      machineId: 'g-1', guardMs: 40, onStopError: (e) => { stopErr = e; },
    }));
    ok(stopErr != null, '停止失败回调被触发');
    ok(r && r.stopError != null, '结果带 stopError');
    ok(r && r.stoppedByUs === false, '不声称停成了');
  }

  console.log('\n[4] 没有 goodsId 时如实失败，不猜参数');
  {
    const m = make({ 'goods/shower/sync': [{ status: 2, amount: 0 }] });
    const r = await m.api.watchVolume('sku-1', 120, H({ guardMs: 40 }));
    ok(r && r.stopError != null, '缺 goodsId 时给出 stopError');
    eq(m.consumed['goods/endWater'], undefined, '没有瞎发 endWater');
  }

  console.log('\n[5] 机器自己停了（status 5）也正常收工，结算值原样回传');
  {
    const m = make({
      'goods/shower/sync': [{ status: 2, amount: 0 }, { status: 5, amount: 20 }],
    });
    const r = await m.api.watchVolume('sku-1', 120, H({ machineId: 'g-1', guardMs: 100000 }));
    ok(r && r.done === true && r.status === 5, 'status 5 判完成');
    ok(r.stoppedByUs === false, '不是我们停的');
    eq(r.amount, 20, '结算 amount 原样回传（绝不换算成毫升）');
    eq(m.consumed['goods/endWater'], undefined, '没到最长时长就不该发停止');
  }

  console.log('\n[6] 结算 amount 只增不减（平台回旧 0 也打不回去）');
  {
    const m = make({
      'goods/shower/sync': [
        { status: 2, amount: 1600 }, { status: 2, amount: 0 }, { status: 3, amount: 1600 },
      ],
    });
    const r = await m.api.watchVolume('sku-1', 0, H({ machineId: 'g-1' }));
    eq(r.amount, 1600, '回旧的 0 没把结算值打回去');
    eq(m.consumed['goods/endWater'], undefined, 'guard=0 完全不自动停');
  }

  /* ================= 自动重绑 ================= */
  console.log('\n[7] 开阀失败自动重绑：code=-1 会重试一次');
  {
    const dev = {
      id: 'g-1', sn: '865403065048324', name: '机器A',
      functions: [{ id: 'sku-old', name: '热' }],
    };
    const e1 = new Error('平台拒绝'); e1.code = -1;
    const m = make({
      'goods/water/unlock': [e1, { msgId: 'm-2' }],
      'goods/scan/v2': [{ id: 'g-1' }],
      'goods/normal/details': [{ name: '机器A', machineId: 'dev-1' }],
      'goods/normal/skus': [[{ skuId: 'sku-new', name: '热' }]],
      'machine/msg/sync': [{ state: 'OK' }],
    }, [dev]);

    let retried = 0;
    const r = await m.api.unlockWithRebind(dev, dev.functions[0], null, () => { retried++; });
    eq(retried, 1, '通知界面「正在重新读取」一次');
    ok(r && r.rebound === true, '结果标记为已重绑');
    eq(r.usedFn.id, 'sku-new', '用的是重绑后的新 skuId');
    const unlockCalls = m.calls.filter(c => c.p === 'goods/water/unlock');
    eq(unlockCalls.length, 2, 'unlock 一共调了两次');
    eq(unlockCalls[1].params.skuId, 'sku-new', '第二次用的是新 skuId');
  }

  console.log('\n[8] 余额不足（-52）不许重试，直接把错抛上去');
  {
    const dev = { id: 'g-1', sn: '8654', functions: [{ id: 'sku-1', name: '热' }] };
    const e = new Error('余额不足'); e.code = -52;
    const m = make({ 'goods/water/unlock': [e] }, [dev]);
    let retried = 0;
    let err = null;
    await m.api.unlockWithRebind(dev, dev.functions[0], null, () => { retried++; })
      .catch(x => { err = x; });
    eq(retried, 0, '没有触发重绑');
    ok(err && err.code === -52, '原始错误码透传（界面才能翻译成「去充值」）');
    eq(m.calls.filter(c => c.p === 'goods/water/unlock').length, 1, '只调了一次');
  }

  console.log('\n[9] 没有 SN 时不能乱重绑，要给可执行的下一步');
  {
    const dev = { id: 'g-1', functions: [{ id: 'sku-1', name: '热' }] };
    const e = new Error('平台拒绝'); e.code = -1;
    const m = make({ 'goods/water/unlock': [e] }, [dev]);
    let err = null;
    await m.api.unlockWithRebind(dev, dev.functions[0], null, () => {}).catch(x => { err = x; });
    ok(err != null, '报错了');
    ok(/重新添加/.test(String(err.message)), '提示里给了「重新添加这台机器」这条出路',
      err && err.message);
    eq(m.calls.filter(c => c.p === 'goods/scan/v2').length, 0, '没 SN 就没去扫');
  }

  console.log('\n[10] 重绑后按**同名**出水口取新 id（冷热顺序会变）');
  {
    const dev = { id: 'g-1', sn: '8654', functions: [{ id: 'sku-cold', name: '冷' }] };
    const e = new Error('拒绝'); e.code = -1;
    const m = make({
      'goods/water/unlock': [e, { msgId: 'm-2' }],
      'goods/scan/v2': [{ id: 'g-1' }],
      'goods/normal/details': [{ name: '机器A' }],
      'goods/normal/skus': [[{ skuId: 'sku-hot-NEW', name: '热' },
                             { skuId: 'sku-cold-NEW', name: '冷' }]],
      'machine/msg/sync': [{ state: 'OK' }],
    }, [dev]);
    const r = await m.api.unlockWithRebind(dev, dev.functions[0], null, () => {});
    eq(r.usedFn.id, 'sku-cold-NEW', '按名字匹配到「冷」，没有按顺序取到「热」');
  }

  console.log('\n[11] endWater 的入参必须是 goodsId（不是 skuId/SN）');
  {
    const m = make({ 'goods/endWater': [{}] });
    await m.api.endWater('goods-123');
    const c = m.calls.filter(x => x.p === 'goods/endWater')[0];
    eq(c.params.goodsId, 'goods-123', 'goodsId 传对了');
    ok(c.params.skuId === undefined, '没有多传 skuId（平台会拒）');
  }

  console.log('\n[12] syncWater 的字段解析');
  {
    const m = make({
      'goods/shower/sync': [{ status: '3', amount: '547', identify: '0620261104211834844987' }],
    });
    const s = await m.api.syncWater('sku-1');
    eq(s.status, 3, 'status 转成数字');
    eq(s.amount, 547, 'amount 转成数字');
    eq(s.identify, '0620261104211834844987', 'identify 原样保留');
  }

  console.log('\n' + (bad === 0
    ? '  [PASS] 饮水机 v1.1.60 行为测试通过 ' + total + ' 项'
    : '  [FAIL] ' + bad + '/' + total + ' 项未过'));
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => {
  console.log('\n[FAIL] 测试自身抛异常：' + (e && e.stack || e));
  process.exit(1);
});
