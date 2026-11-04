/**
 * test_edgecache.js —— 离线验证 v1.1.10 的「抗打」三件套。
 *
 * 为什么必须有这个文件：
 *   这三条改动（ignoreQuery 缓存键 / 404 负缓存 / 全局兜底限流）全都是
 *   「线上才看得出差别」的行为，本地看一眼代码看不出对不对。而它们的
 *   失效方式是**静默的** —— 缓存键还是带 query，代码照样跑，只是
 *   每次请求都回源、把 KV 读额度悄悄吃光，没有任何报错。
 *   所以必须在本地用假 caches.default + 假 KV 把行为钉死。
 *
 * 跑法：node tools\test_edgecache.js
 *   全部通过 exit 0；任一不过 exit 1。
 *
 * 覆盖：
 *   [1] /v1/config 带随机 query 时命中同一个缓存键（ignoreQuery）
 *   [2] /v1/photos 带随机 query 时命中同一个缓存键
 *   [3] /v1/feedback 带随机 query 时命中同一个缓存键
 *   [4] /v1/photo?k=<合法但不存在> 第二次命中负缓存，不再读 ph:idx
 *   [5] /v1/photo?k=<格式非法> 第二次命中负缓存
 *   [6] /v1/photo?k=<合法> 与 k=<另一个> 不能共用缓存键（不能串图）
 *   [7] 未知路径连打 N 次后被全局限流挡下（429）
 *   [8] 正常用户的请求量不会被全局限流误伤
 *   [9] 404 响应带 no-store 之外仍然能被我们自己的负缓存存下来
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('[PASS] ' + name); }
  else { fail++; console.log('[FAIL] ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

/* ---------------- 假 KV：记录每一次 get/put，用来数「回源了几次」 ---------------- */
function makeKV(seed) {
  const store = new Map(Object.entries(seed || {}));
  const stat = { gets: 0, puts: 0, byKey: {} };
  return {
    stat,
    store,
    async get(k, type) {
      stat.gets++;
      stat.byKey[k] = (stat.byKey[k] || 0) + 1;
      const v = store.has(k) ? store.get(k) : null;
      if (v == null) return null;
      if (type === 'arrayBuffer') {
        const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8');
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      }
      return typeof v === 'string' ? v : String(v);
    },
    async put(k, v) { stat.puts++; store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list() { return { keys: [...store.keys()].map(n => ({ name: n })), list_complete: true }; },
  };
}

/* ---------------- 假 caches.default：一个 Map，够用 ---------------- */
function makeCaches() {
  const m = new Map();
  return {
    m,
    async match(req) {
      const k = typeof req === 'string' ? req : req.url;
      const hit = m.get(k);
      if (!hit) return undefined;
      // 必须每次给新的 body，否则第二次读会拿到已消费的流
      return new Response(hit.body.slice(0), { status: hit.status, headers: hit.headers });
    },
    async put(req, res) {
      const k = typeof req === 'string' ? req : req.url;
      const body = new Uint8Array(await res.arrayBuffer());
      m.set(k, { body, status: res.status, headers: new Headers(res.headers) });
    },
    async delete(req) {
      const k = typeof req === 'string' ? req : req.url;
      m.delete(k);
    },
  };
}

function makeEnv(kv) {
  return {
    AUTH: kv,
    ADMIN_KEY: 'test-admin-key-40-chars-xxxxxxxxxxxxxxxxx',
    SECRET: 'test-secret',
    SIGN_KEY: 'test-sign',
  };
}

/* 每个用例都重新 require 一次 worker（RL / CFG_CACHE 是模块级状态，
 * 不重置会互相污染 —— 尤其是限流计数）。用 vm 跑一份新的。 */
function freshWorker() {
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    URL, Request, Response, Headers, Map, Set, Date, JSON, Math, String, Number,
    Array, Object, Promise, Error, RegExp, parseInt, parseFloat, isFinite, isNaN,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Buffer,
    crypto: require('crypto').webcrypto,
    caches: makeCaches(),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;__w = (typeof default_ !== "undefined" ? default_ : null);', sandbox, { timeout: 5000 });
  // worker.js 用的是 `export default { fetch }`，vm 里不能直接跑 ESM 语法。
  // 这里把 export 去掉再取。
  return sandbox;
}

/* 上面那条路走不通：worker.js 是 ESM（export default）。用文本改写绕开。 */
function loadWorker() {
  const code = SRC.replace(/^export\s+default\s+/m, 'var __worker = ');
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    URL, Request, Response, Headers, Map, Set, Date, JSON, Math, String, Number,
    Array, Object, Promise, Error, RegExp, parseInt, parseFloat, isFinite, isNaN,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Buffer,
    crypto: require('crypto').webcrypto,
    caches: { default: makeCaches() },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;this.__worker = __worker;', sandbox, { timeout: 5000 });
  return { w: sandbox.__worker, caches: sandbox.caches.default };
}

function req(url, method) {
  return new Request(url, { method: method || 'GET', headers: { 'cf-connecting-ip': '10.9.9.9' } });
}

(async function main() {
  /* ================= [1][2][3] ignoreQuery ================= */
  {
    const { w, caches } = loadWorker();
    const kv = makeKV({
      cfg: JSON.stringify({ qq: '1', maxDev: 3, updPolicy: 'nag' }),
      'apk:meta': JSON.stringify({ ver: '1.1.9', size: 1, sha256: 'a', name: 'x.apk' }),
      'ph:idx': JSON.stringify([]),
      'fb:idx': JSON.stringify([]),
    });
    const env = makeEnv(kv);

    const r1 = await w.fetch(req('https://x.pages.dev/v1/config?r=' + Math.random()), env);
    await r1.text();
    const r2 = await w.fetch(req('https://x.pages.dev/v1/config?r=' + Math.random()), env);
    await r2.text();
    eq('[1] /v1/config 换随机 query 仍是 hit', r2.headers.get('x-edge'), 'hit');

    const p1 = await w.fetch(req('https://x.pages.dev/v1/photos?r=' + Math.random()), env);
    await p1.text();
    const p2 = await w.fetch(req('https://x.pages.dev/v1/photos?r=' + Math.random()), env);
    await p2.text();
    eq('[2] /v1/photos 换随机 query 仍是 hit', p2.headers.get('x-edge'), 'hit');

    const f1 = await w.fetch(req('https://x.pages.dev/v1/feedback?r=' + Math.random()), env);
    await f1.text();
    const f2 = await w.fetch(req('https://x.pages.dev/v1/feedback?r=' + Math.random()), env);
    await f2.text();
    eq('[3] /v1/feedback 换随机 query 仍是 hit', f2.headers.get('x-edge'), 'hit');

    ok('[1-3] 三次都命中后 KV 读次数没跟着请求数涨',
      kv.stat.byKey['cfg'] === 1, 'cfg gets=' + kv.stat.byKey['cfg']);
  }

  /* ================= [4][5][6] photo 负缓存 ================= */
  {
    const { w } = loadWorker();
    const kv = makeKV({ 'ph:idx': JSON.stringify([]) });
    const env = makeEnv(kv);

    // 合法格式但不存在
    const k1 = 'pabcdefgh';
    const a1 = await w.fetch(req('https://x.pages.dev/v1/photo?k=' + k1), env);
    await a1.text();
    const idxAfterFirst = kv.stat.byKey['ph:idx'] || 0;
    const a2 = await w.fetch(req('https://x.pages.dev/v1/photo?k=' + k1), env);
    await a2.text();
    eq('[4] 不存在的合法 k 第一次是 miss', a1.headers.get('x-edge'), 'miss');
    eq('[4] 不存在的合法 k 第二次是 hit', a2.headers.get('x-edge'), 'hit');
    eq('[4] 第二次没再读 ph:idx', kv.stat.byKey['ph:idx'], idxAfterFirst);
    eq('[4] 状态码仍是 404', a2.status, 404);

    // 格式非法
    const b1 = await w.fetch(req('https://x.pages.dev/v1/photo?k=bad!!'), env);
    await b1.text();
    const b2 = await w.fetch(req('https://x.pages.dev/v1/photo?k=bad!!'), env);
    await b2.text();
    eq('[5] 非法 k 第一次是 miss', b1.headers.get('x-edge'), 'miss');
    eq('[5] 非法 k 第二次是 hit', b2.headers.get('x-edge'), 'hit');
    eq('[5] 非法 k 仍是 404', b2.status, 404);

    // 两个不同的非法 k 应该共用同一个负缓存键（都是 404，没必要分开存）
    const b3 = await w.fetch(req('https://x.pages.dev/v1/photo?k=zzzzzzzzzz'), env);
    await b3.text();
    eq('[5] 另一个非法 k 也命中同一个负缓存', b3.headers.get('x-edge'), 'hit');

    // 不能串图：合法 k 必须按 k 分开
    const kv2 = makeKV({
      'ph:idx': JSON.stringify([
        { k: 'paaaaaaa', st: 'a', at: 1 },
        { k: 'pbbbbbb', st: 'a', at: 2 },
      ]),
      'ph:paaaaaaa': Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'ph:pbbbbbb': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    const env2 = makeEnv(kv2);
    const { w: w2 } = loadWorker();
    const c1 = await w2.fetch(req('https://x.pages.dev/v1/photo?k=paaaaaaa'), env2);
    const c1buf = Buffer.from(await c1.arrayBuffer());
    const c2 = await w2.fetch(req('https://x.pages.dev/v1/photo?k=pbbbbbb'), env2);
    const c2buf = Buffer.from(await c2.arrayBuffer());
    eq('[6] 两张不同的图各自命中自己那份', c1.status + '/' + c2.status, '200/200');
    ok('[6] 图片字节没有串', c1buf[0] === 0xff && c2buf[0] === 0x89,
      'a0=' + c1buf[0] + ' b0=' + c2buf[0]);
  }

  /* ================= [7][8] 全局兜底限流 ================= */
  {
    const { w } = loadWorker();
    const kv = makeKV({ cfg: JSON.stringify({ qq: '1', maxDev: 3 }) });
    const env = makeEnv(kv);

    let first429 = -1;
    for (let i = 1; i <= 700; i++) {
      const r = await w.fetch(req('https://x.pages.dev/v1/nonexistent-' + i), env);
      await r.text();
      if (r.status === 429 && first429 < 0) first429 = i;
    }
    ok('[7] 未知路径连打会被 429 挡下', first429 > 0, 'first429=' + first429);
    eq('[7] 触发点正好在 600 之后', first429, 601);
  }
  {
    const { w } = loadWorker();
    const kv = makeKV({
      cfg: JSON.stringify({ qq: '1', maxDev: 3 }),
      'apk:meta': JSON.stringify({ ver: '1.1.9', size: 1, sha256: 'a', name: 'x.apk' }),
      'ph:idx': JSON.stringify([]),
      'fb:idx': JSON.stringify([]),
    });
    const env = makeEnv(kv);
    let bad = 0;
    // 模拟一次冷启动 + 半小时正常使用：30 次配置、30 次图片列表、30 次留言、30 次激活
    for (let i = 0; i < 30; i++) {
      for (const u of ['/v1/config', '/v1/photos', '/v1/feedback']) {
        const r = await w.fetch(req('https://x.pages.dev' + u), env);
        await r.text();
        if (r.status === 429) bad++;
      }
    }
    eq('[8] 90 次正常请求零误伤', bad, 0);
  }

  /* ================= [9] 负缓存存下来的确实是 404 且带 ttl ================= */
  {
    const { w, caches } = loadWorker();
    const kv = makeKV({ 'ph:idx': JSON.stringify([]) });
    const env = makeEnv(kv);
    const r = await w.fetch(req('https://x.pages.dev/v1/photo?k=paaaaaaa'), env);
    await r.text();
    eq('[9] 404 负缓存带 cache-control', (r.headers.get('cache-control') || '').indexOf('max-age=60') >= 0, true);
    const keys = [...caches.m.keys()].filter(k => k.indexOf('/v1/photo') >= 0);
    ok('[9] 缓存键里是 ?k=<值> 而不是整串 query', keys.length > 0 && keys[0].indexOf('?k=paaaaaaa') >= 0,
      JSON.stringify(keys));
  }

  /* ================= [10] 回源限额：换着 k 刷也要被挡 ================= */
  {
    const { w } = loadWorker();
    const kv = makeKV({ 'ph:idx': JSON.stringify([]) });
    const env = makeEnv(kv);
    let first429 = -1;
    for (let i = 1; i <= 140; i++) {
      // 每次换一个合法格式的 k —— 负缓存救不了这种刷法
      const k = 'p' + String(i).padStart(8, '0');
      const r = await w.fetch(req('https://x.pages.dev/v1/photo?k=' + k), env);
      await r.text();
      if (r.status === 429 && first429 < 0) first429 = i;
    }
    ok('[10] 换着 k 刷会被回源限额挡下', first429 > 0, 'first429=' + first429);
    eq('[10] 触发点正好在 120 之后', first429, 121);
    ok('[10] 挡住之后不再读 ph:idx', kv.stat.byKey['ph:idx'] <= 120,
      'ph:idx gets=' + kv.stat.byKey['ph:idx']);
  }

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.log('[FAIL] 测试脚本自身崩了：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
