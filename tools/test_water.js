/* 饮水机 v1.1.16 的行为测试（真跑 water.js 里的逻辑，不打网络）。
 *
 *   node tools/test_water.js
 *
 * 为什么必须有这个：v1.1.16 删掉了整块结算、加了定量放水和开阀失败自动重绑。
 * 这三件事的失败方式都是「界面看起来正常，但结果不对」：
 *   · 定量放水到量后重复发 endWater → 平台可能记两次消费；
 *   · 自动重绑对余额不足（-52）也重试 → 用户多等两轮，还看到同样的错；
 *   · 重绑后按数组下标取出水口 → 冷/热顺序变了就开到另一个口。
 * 这些用静态锚点抓不住，只能把函数真跑一遍。
 *
 * 做法：从 water.js 里切出需要的函数，注入一个假的 XXMU（pref 内存版）
 * 和假的 call()（脚本化的响应序列），在 vm 里跑。
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
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a)); }

/* 按花括号配平切出 `function name(...) { ... }`。
 * water.js 里有中文注释和一两个含 `}` 的字符串，但都不在函数体的顶层位置，
 * 所以计数法够用；比正则贪婪可靠（正则会在第一个 `}` 截断）。 */
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

/* 切出来的代码片段。注意顺序：被调用的在前定义。
 * call / XXMU 由沙箱注入，所以这里不切它们。 */
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
  cut('watchVolume'),
  cut('unlockWithRebind'),
  'const RETRY_CODES = ["-1", "-19"];',
  'this.__api = { watchVolume, unlockWithRebind, unlock, endWater, syncWater };',
].join('\n');

/** 造一个沙箱。
 *  @param routes  { '接口路径': [响应1, 响应2, ...] }，按顺序消耗；用完之后
 *                 重复最后一个。抛出的 Error 实例会被当成 reject。
 *  @param devs    初始本地设备列表
 */
function make(routes, devs) {
  const store = { [K_TOKEN_()]: 'tok', [K_DEVS_()]: JSON.stringify(devs || []) };
  const calls = [];
  const consumed = {};

  function K_TOKEN_() { return 'xxmu_water_token'; }
  function K_DEVS_() { return 'xxmu_water_devs'; }

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
    Promise, JSON, Array, Object, String, Number, Math, Date, parseInt, isNaN, setTimeout,
    Error, RegExp,
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'water-cut.js' });
  return { api: sandbox.__api, store, calls, consumed, sandbox };
}

(async function main() {

  /* ================= 定量放水 ================= */
  console.log('\n[1] 定量放水：到量只发一次停止');
  {
    /* sync 序列：先 0，再涨到 300，再涨到 520（越过目标 500），然后停。
     * status: 4 = 解锁成功等待出水，2 = 正在出水，3 = 完成。
     * 注意 amount 是**累计毫升**。 */
    const m = make({
      'goods/shower/sync': [
        { status: 4, amount: 0 },
        { status: 2, amount: 300 },
        { status: 2, amount: 520 },
        { status: 3, amount: 560 },
      ],
      'goods/endWater': [{}],
    });
    let reached = 0, zero = 0;
    const r = await m.api.watchVolume('sku-1', 500, {
      machineId: 'g-1',
      onReached: () => { reached++; },
      onZero: () => { zero++; },
    });
    eq(reached, 1, '到量回调只触发一次');
    eq(m.consumed['goods/endWater'], 1, 'endWater 只发了一次（重复发会被记两次消费）');
    eq(m.calls.filter(c => c.p === 'goods/endWater')[0].params.goodsId, 'g-1',
      'endWater 传的是 goodsId（不是 skuId）');
    ok(r && r.done === true, '最终判定为「已停止」');
    eq(r.amount, 560, '上报最终用量');
    ok(zero === 0, '有出水时不报「没检测到出水」');
  }

  console.log('\n[2] 定量放水：一直没出水要有提示，但不能判失败');
  {
    /* ZERO_WARN_AT 在 water.js 里是 25（v1.1.21 从 20 提到 25，
     * 因为实测平台回报用量本身有延迟，20 秒就提醒太早）。
     * 这里构造「前 26 次都是 0，第 27 次开始出水」——必须真的跨过阈值，
     * 否则测的就不是「提示会不会触发」，而是「样本没到阈值所以不触发」。 */
    const seq = [];
    for (let i = 0; i < 26; i++) seq.push({ status: 4, amount: 0 });
    seq.push({ status: 2, amount: 600 });
    seq.push({ status: 3, amount: 605 });
    const m = make({ 'goods/shower/sync': seq, 'goods/endWater': [{}] });
    let zero = 0;
    const r = await m.api.watchVolume('sku-1', 500, {
      machineId: 'g-1', onZero: () => { zero++; },
    });
    ok(zero === 1, '「还没出水」提示只给一次（不刷屏）');
    ok(r && r.done === true, '后来出水了仍能正常停');
  }

  console.log('\n[3] 定量放水：停止命令发不出去要说清楚');
  {
    const m = make({
      'goods/shower/sync': [{ status: 2, amount: 600 }],
      'goods/endWater': [new Error('网络超时')],
    });
    let stopErr = null;
    const r = await m.api.watchVolume('sku-1', 500, {
      machineId: 'g-1', onStopError: (e) => { stopErr = e; },
    });
    ok(stopErr != null, '停止了失败回调被触发');
    ok(r && r.stopError != null, '结果里带 stopError');
    ok(r && r.stoppedByUs === false, '不能声称「我们把它停了」（实际没停成）');
  }

  console.log('\n[4] 定量放水：没有 goodsId 时如实失败，不猜参数');
  {
    const m = make({ 'goods/shower/sync': [{ status: 2, amount: 600 }] });
    const r = await m.api.watchVolume('sku-1', 500, {});   /* 不传 machineId */
    ok(r && r.stopError != null, '缺 goodsId 时给出 stopError');
    eq(m.consumed['goods/endWater'], undefined, '没有瞎发 endWater');
  }

  console.log('\n[5] 定量放水：机器自己停了（status 5）也正常收工');
  {
    const m = make({
      'goods/shower/sync': [{ status: 2, amount: 100 }, { status: 5, amount: 120 }],
    });
    const r = await m.api.watchVolume('sku-1', 500, { machineId: 'g-1' });
    ok(r && r.done === true && r.status === 5, 'status 5 判完成');
    ok(r.stoppedByUs === false, '没到量、不是我们停的');
    eq(m.consumed['goods/endWater'], undefined, '没到量就不该发停止');
  }

  /* ================= 自动重绑 ================= */
  console.log('\n[6] 开阀失败自动重绑：code=-1 会重试一次');
  {
    const dev = {
      id: 'g-1', sn: '865403065048324', name: '机器A',
      functions: [{ id: 'sku-old', name: '热' }],
    };
    const e1 = new Error('平台拒绝'); e1.code = -1;
    const m = make({
      /* 第一次 unlock：直接失败（code=-1） */
      'goods/water/unlock': [e1, { msgId: 'm-2' }],
      /* 重绑时重新拉机器 → 出水口换成 sku-new */
      'goods/scan/v2': [{ id: 'g-1' }],
      'goods/normal/details': [{ name: '机器A', machineId: 'dev-1' }],
      'goods/normal/skus': [[{ skuId: 'sku-new', name: '热' }]],
      /* 第二次 unlock 成功后轮询回 OK */
      'machine/msg/sync': [{ state: 'OK' }],
    }, [dev]);

    let retried = 0;
    const r = await m.api.unlockWithRebind(dev, dev.functions[0], null, () => { retried++; });
    eq(retried, 1, '通知界面「正在重新读取」一次');
    ok(r && r.rebound === true, '结果标记为已重绑');
    eq(r.usedFn.id, 'sku-new', '用的是重绑后的新 skuId');
    /* 关键：不能拿旧 skuId 硬撞第二次 */
    const unlockCalls = m.calls.filter(c => c.p === 'goods/water/unlock');
    eq(unlockCalls.length, 2, 'unlock 一共调了两次');
    eq(unlockCalls[1].params.skuId, 'sku-new', '第二次用的是新 skuId');
  }

  console.log('\n[7] 余额不足（-52）不许重试，直接把错抛上去');
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

  console.log('\n[8] 没有 SN 时不能乱重绑，要给可执行的下一步');
  {
    const dev = { id: 'g-1', functions: [{ id: 'sku-1', name: '热' }] };   /* 无 sn */
    const e = new Error('平台拒绝'); e.code = -1;
    const m = make({ 'goods/water/unlock': [e] }, [dev]);
    let err = null;
    await m.api.unlockWithRebind(dev, dev.functions[0], null, () => {}).catch(x => { err = x; });
    ok(err != null, '报错了');
    ok(/重新添加/.test(String(err.message)), '提示里给了「重新添加这台机器」这条出路',
      err && err.message);
    eq(m.calls.filter(c => c.p === 'goods/scan/v2').length, 0, '没 SN 就没去扫');
  }

  console.log('\n[9] 重绑后按**同名**出水口取新 id（冷热顺序会变）');
  {
    const dev = { id: 'g-1', sn: '8654', functions: [{ id: 'sku-cold', name: '冷' }] };
    const e = new Error('拒绝'); e.code = -1;
    const m = make({
      'goods/water/unlock': [e, { msgId: 'm-2' }],
      'goods/scan/v2': [{ id: 'g-1' }],
      'goods/normal/details': [{ name: '机器A' }],
      /* 重绑后顺序反了：热在前、冷在后。必须仍选「冷」。 */
      'goods/normal/skus': [[{ skuId: 'sku-hot-NEW', name: '热' },
                             { skuId: 'sku-cold-NEW', name: '冷' }]],
      'machine/msg/sync': [{ state: 'OK' }],
    }, [dev]);
    const r = await m.api.unlockWithRebind(dev, dev.functions[0], null, () => {});
    eq(r.usedFn.id, 'sku-cold-NEW', '按名字匹配到「冷」，没有按顺序取到「热」');
  }

  console.log('\n[10] endWater 的入参必须是 goodsId（不是 skuId/SN）');
  {
    const m = make({ 'goods/endWater': [{}] });
    await m.api.endWater('goods-123');
    const c = m.calls.filter(x => x.p === 'goods/endWater')[0];
    eq(c.params.goodsId, 'goods-123', 'goodsId 传对了');
    ok(c.params.skuId === undefined, '没有多传 skuId（平台会拒）');
  }

  console.log('\n[11] syncWater 的字段解析');
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
    ? '  [PASS] 饮水机 v1.1.16 行为测试通过 ' + total + ' 项'
    : '  [FAIL] ' + bad + '/' + total + ' 项未过'));
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => {
  console.log('\n[FAIL] 测试自身抛异常：' + (e && e.stack || e));
  process.exit(1);
});
