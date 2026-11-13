/* 多来源作业/考试聚合器（web/sources.js）的离线回归测试（v1.1.66）。
 *
 * 为什么要这个：sources.js 是浏览器里跑的 IIFE，直接 require 拿不到东西，
 * 又依赖 XXMU / Host / CX / window 一堆端侧全局。真机上这些全局带着真实
 * cookie 和网络，测不了「降级态绝不并进条目」「坏缓存不当成没同步过」这类
 * 静默失败。所以用 Node vm 把假的全局注入进去，把聚合逻辑固定成断言。
 *
 * 用法：node tools/test_sources.js
 * 退出码 0 = 全过；1 = 有失败（可串进构建门禁）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'sources.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

/* 一条缓存 blob。sources.js 的 cached() 要求 works/exams 都是数组，
 * state + synced_at 决定 status()/live() 认不认这份数据。 */
function cacheBlob(o) {
  return JSON.stringify(Object.assign({
    works: [], exams: [], synced_at: 0, state: 'ok', source: '', errors: [],
  }, o));
}

/* status() 的返回是 vm realm 的数组，用普通 for 找，避开 realm 差异。 */
function byId(st, id) {
  for (let i = 0; i < st.length; i++) if (st[i].id === id) return st[i];
  return null;
}

/* 造一个隔离的浏览器环境跑 sources.js。
 *
 * 三个关键点（踩过的坑，写清楚为什么）：
 *  1. sources.js 是 `const SOURCES = (()=>{...})()`，const 是词法绑定，
 *     不会挂到 sandbox 属性上。所以在同一段脚本末尾追加 `;__S = SOURCES;`
 *     把引用捞出来（与 tools/test_hwstatus.js 捞 CX 一个套路）。
 *  2. IIFE 末尾 registerBuiltinChaoxing() 立即执行，里面 `typeof CX` 为
 *     undefined 就直接 return —— 学习通就不会被登记。故必须在 runInContext
 *     **之前**先把 CX 放进 sandbox，否则 ① 和 ② 的长度断言全错。
 *  3. define() 会写 window[cbName]，所以 sandbox.window 必须存在；这里让
 *     它指回 sandbox 本身，和 WebView 里 window===全局 的行为一致。
 *
 * Host.getPref/setPref 是聚合器唯一的缓存通道，用一份可变的 store 兜住，
 * 这样能从 Node 侧预置缓存 JSON、也能读回 refresh 写进去的内容。 */
function loadSources(initialPrefs) {
  const store = Object.assign({}, initialPrefs || {});
  const Host = {
    getPref: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? String(store[k]) : ''),
    setPref: (k, v) => { store[k] = String(v); },
    hasCookieFor: () => false,
    clearCookieFor: () => {},
    openWebFor: () => true,
    openLogin: () => true,
    openLoginFor: () => true,   // 新桥：默认登录入口用，本测试不触发
  };
  const CX = {
    loggedIn: () => false,
    cached: () => null,
    sync: () => Promise.resolve({ ok: false, error: '学习通不可用' }),
    openLogin: () => false,
    logout: () => {},
    readErr: () => '',
  };
  const XXMU = {
    netCk: () => Promise.resolve(''),
    splitResp: () => ({ code: -1, body: '' }),
    decodeAuto: (s) => s,
    toast: () => {},
  };
  /* sources.js 走 Host 读写缓存，不碰 localStorage；这里仍按契约注入一份
   * 最小实现，保证沙箱齐全、将来聚合器若改用 localStorage 也不会 ReferenceError。 */
  const localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  const sandbox = {
    console, Date, Math, JSON, String, Number, Array, Object, RegExp, Promise,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, setTimeout,
    XXMU, Host, CX, localStorage,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;__S = SOURCES;', sandbox, { timeout: 3000 });
  return sandbox.__S;
}

async function main() {
  console.log('\n[v1.1.66] web/sources.js 聚合器离线测试（Node vm）');

  /* ① 学习通必须被包装成 builtin 来源，status() 里能查到。 */
  {
    const SOURCES = loadSources({});
    const row = byId(SOURCES.status(), 'chaoxing');
    ok('① 学习通包装成 builtin 来源', !!row && row.builtin === true,
      'status=' + JSON.stringify(SOURCES.status().map(s => ({ id: s.id, builtin: s.builtin }))));
  }

  /* ② define 注册三个新来源后，连同学习通一共 4 个来源。 */
  {
    const SOURCES = loadSources({});
    ['xiqueer', 'yuketang', 'zhihuishu'].forEach(id => {
      SOURCES.define({ id, label: id, short: id, kinds: ['exam'],
        fetch: () => ({ state: 'degraded', error: 'x' }) });
    });
    const st = SOURCES.status();
    ok('② define 三个来源后 status().length===4', st.length === 4,
      'got ' + st.length + ' -> ' + JSON.stringify(st.map(s => s.id)));
  }

  /* ③④ 只并入 ok 来源；degraded/stale 零条目；每条并入项带 source 标签。
   * 造一个 ok 来源带 2 条作业，另造 degraded 与 stale 各塞假数据，
   * 断言合并结果里只有那 2 条 ok 数据、且都打了 source。 */
  {
    const prefs = {};
    prefs['xxmu_src_ok1'] = cacheBlob({
      works: [{ name: 'OK-W1', course: 'C' }, { name: 'OK-W2', course: 'C' }],
      exams: [], synced_at: 1700000000, state: 'ok',
    });
    prefs['xxmu_src_deg1'] = cacheBlob({
      works: [{ name: 'BAD-W', course: 'C' }], exams: [{ name: 'BAD-E' }],
      synced_at: 1700000000, state: 'degraded', error: '接口不可用',
    });
    prefs['xxmu_src_sta1'] = cacheBlob({
      works: [], exams: [{ name: 'STALE-E' }],
      synced_at: 1700000000, state: 'stale', error: '登录已失效',
    });
    const SOURCES = loadSources(prefs);
    [['ok1', 'xxmu_src_ok1'], ['deg1', 'xxmu_src_deg1'], ['sta1', 'xxmu_src_sta1']]
      .forEach(([id, key]) => {
        SOURCES.define({ id, key, fetch: () => ({ state: 'ok', works: [], exams: [] }) });
      });
    const d = SOURCES.live();
    const names = [];
    if (d) {
      (d.works || []).forEach(w => names.push(w.name));
      (d.exams || []).forEach(e => names.push(e.name));
    }
    const clean = !!d && names.length === 2
      && names.indexOf('OK-W1') >= 0 && names.indexOf('OK-W2') >= 0
      && names.indexOf('BAD-W') < 0 && names.indexOf('BAD-E') < 0
      && names.indexOf('STALE-E') < 0;
    ok('③ live() 只并入 ok 来源，degraded/stale 零条目', clean,
      'live=' + (d ? JSON.stringify(names) : 'null'));

    const items = d ? (d.works || []).concat(d.exams || []) : [];
    ok('④ 每条并入项都带 source 标签',
      items.length > 0 && items.every(x => x && x.source === 'ok1'),
      'sources=' + JSON.stringify(items.map(x => x && x.source)));
  }

  /* ⑤ 一个 ok 来源都没有（只有 degraded/stale 缓存）时 live() 必须为 null，
   * 好让 renderHomework 的旧优先级链继续往下走。 */
  {
    const prefs = {};
    prefs['xxmu_src_d1'] = cacheBlob({ works: [{ name: 'X' }], exams: [],
      synced_at: 1700000000, state: 'degraded', error: 'e' });
    prefs['xxmu_src_s1'] = cacheBlob({ works: [], exams: [{ name: 'Y' }],
      synced_at: 1700000000, state: 'stale', error: 'login' });
    const SOURCES = loadSources(prefs);
    [['d1', 'xxmu_src_d1'], ['s1', 'xxmu_src_s1']].forEach(([id, key]) => {
      SOURCES.define({ id, key, fetch: () => ({ state: 'ok', works: [], exams: [] }) });
    });
    const d = SOURCES.live();
    ok('⑤ 所有来源无 ok 数据时 live()===null', d === null,
      'got ' + (d ? JSON.stringify(d.works) + '/' + JSON.stringify(d.exams) : 'null'));
  }

  /* ⑥ refresh 走降级要把 error 落盘记住，status() 能读回 degraded + 非空 error。
   * refresh 内部是 Promise.resolve(...).then(...)，必须 await 才能读到写回的缓存。 */
  {
    const SOURCES = loadSources({});
    SOURCES.define({ id: 'r1', key: 'xxmu_src_r1',
      fetch: () => ({ state: 'degraded', error: '接口未验真，本机降级' }) });
    const rr = await SOURCES.refresh('r1');
    const row = byId(SOURCES.status(), 'r1');
    ok('⑥ refresh 降级记忆 error，status() 读回 degraded/error',
      !!rr && rr.state === 'degraded'
        && !!row && row.state === 'degraded' && !!row.error && row.error.length > 0,
      'refresh=' + JSON.stringify(rr) + ' row=' + JSON.stringify(row && { state: row.state, error: row.error }));
  }

  /* ⑦ 缓存里塞坏 JSON：cached() 解析失败要置 per-source READ_ERR，
   * readErr() 非空、status().error 也要带上原因，绝不静默当成「没同步过」。
   * 坑：cached() 有 `raw.length < 20` 提前 return（那样 READ_ERR 不会置位），
   * 所以坏串必须 >=20 字符，这里特意给一长串非法 JSON。 */
  {
    const prefs = { 'xxmu_src_e1': '{ this is BROKEN json !!!!!!!!!!!!!!!!!!!!!' };
    const SOURCES = loadSources(prefs);
    SOURCES.define({ id: 'e1', key: 'xxmu_src_e1',
      fetch: () => ({ state: 'ok', works: [], exams: [] }) });
    const st = SOURCES.status();                 // 触发 cached() -> READ_ERR 置位
    const s = SOURCES.get('e1');
    const re = (s && s.readErr) ? s.readErr() : '';
    const row = byId(st, 'e1');
    const surfaced = !!row && !!row.error && row.error.indexOf('缓存') >= 0;
    ok('⑦ 坏 JSON 触发 readErr() 非空、不被当成没同步过',
      !!re && re.length > 0 && surfaced && row.state !== 'ok',
      'readErr=' + JSON.stringify(re) + ' status.error=' + JSON.stringify(row && row.error));
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  7 assertions: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.log('[FAIL] 测试抛异常: ' + ((e && e.stack) || e));
  process.exit(1);
});
