/* 服务端 cfg 写入链路的行为测试（不是静态锚点，是真的跑一遍 Worker）。
 *
 *   node tools/test_cfg.js
 *
 * 为什么要这个：v1.1.15 修的三个问题全都是「接口返回 200、界面显示保存成功、
 * 但实际没生效」。这类 bug 靠读代码和看返回码都发现不了 —— 得把 handleSetCfg
 * 真的跑一次，再把写进 KV 的东西读回来比对。
 *
 * 造一个假 env（Map 当 KV），import worker.js，直接打 HTTP 请求。
 * 不需要 node_modules、不需要 wrangler、不联网。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'server', 'worker.js');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) { console.log('  \u2713 ' + label); }
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  → ' + extra : '')); }
}

/* ESM 导入 worker.js。文件在 server/ 下没有 package.json，node 会按 .js
 * 当 CommonJS —— 复制到临时目录改后缀 .mjs 再导，比改源文件干净。
 *
 * 每次调用都**生成一个新的模块实例**（靠 import 的 query 串区分 URL）。
 * 原因：worker.js 里有模块级的 CFG_CACHE / 限流表 RL，是 per-isolate 的。
 * 真实运行时一个 isolate 只伺候一个 env，但测试要在同一个进程里跑好几个
 * 「全新的服务端」，不清掉就会看到上一个场景的 cfg 漏到下一个 ——
 * 我第一版就踩了：场景 [3] 读到的是场景 [2] 写完的 qq="123"、min.code=0。 */
let _seq = 0;
function loadWorker() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xxmu-cfg-'));
  const mod = path.join(tmp, 'worker.mjs');
  fs.copyFileSync(src, mod);
  return import(pathToFileURL(mod).href + '?n=' + (++_seq));
}

/** 假 KV：实现 Worker 用到的 get/put/delete/list */
function fakeKV(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list(opt) {
      const prefix = (opt && opt.prefix) || '';
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort()
        .map(name => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

const ADMIN_KEY = 'test-admin-key-123456';

function makeEnv(cfgJson) {
  const kv = fakeKV(cfgJson ? { cfg: cfgJson } : {});
  return { env: { AUTH: kv, ADMIN_KEY, SECRET: 's', SIGN_KEY: 'k' }, kv };
}

async function call(w, env, method, p, body, headers) {
  const req = new Request('https://xxmu-auth.example.com' + p, {
    method,
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await w.default.fetch(req, env);
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, res };
}

/* 项目约定：错误也是 HTTP 200 + {ok:false,msg}（见 worker.js 的 bad()），
 * 所以判据一律看 json.ok，不看 res.status。 */
const rejected = r => !!(r.json && r.json.ok === false);
const accepted = r => !!(r.json && r.json.ok === true);

(async () => {
  const adm = { 'x-admin-key': ADMIN_KEY };

  /* ---------------- ① 公告：正文变了，noticeAt 必须跟着变 ---------------- */
  console.log('\n[1] 公告 noticeAt 是否真的会刷新');
  const w1 = await loadWorker();
  {
    const base = JSON.stringify({
      latest: { version: '1.1.14', code: 1114, url: '', notes: '' },
      min: { version: '1.1.1', code: 0 },
      notice: '旧公告', noticeTitle: '公告', noticeAt: 1000,
      qq: '1097668324', maxDev: 3, enforceVer: true, updPolicy: 'nag',
    });
    const { env, kv } = makeEnv(base);

    /* 场景 A：管理前端把整个 cfg 对象回写（这是最容易犯的错 —— 前端
     * loadCfg() 拿到什么就原样 setConfig 回去），只改 notice。 */
    const full = JSON.parse(base);
    full.notice = '新公告';
    const rA = await call(w1, env, 'POST', '/v1/admin/config', full, adm);
    const savedA = JSON.parse(await kv.get('cfg'));
    ok(rA.status === 200 && rA.json && rA.json.ok, 'A 整包回写返回 ok');
    ok(savedA.notice === '新公告', 'A 正文写进去了');
    ok(savedA.noticeAt !== 1000 && savedA.noticeAt > 1000,
      'A noticeAt 跟着刷新了（否则学生永远看不到这条新公告）',
      'noticeAt=' + savedA.noticeAt);

    /* 场景 B：正文没变、只有版本号变 —— noticeAt 必须保留，不能打扰看过的人 */
    const before = savedA.noticeAt;
    const rB = await call(w1, env, 'POST', '/v1/admin/config',
      { latest: { version: '1.1.15', code: 1115 }, notice: '新公告' }, adm);
    const savedB = JSON.parse(await kv.get('cfg'));
    ok(rB.status === 200, 'B 只改版本号返回 ok');
    ok(savedB.noticeAt === before, 'B 正文没变时 noticeAt 保持不变',
      'before=' + before + ' after=' + savedB.noticeAt);

    /* 场景 C：显式 noticeAt:0 必须能清空公告 */
    const rC = await call(w1, env, 'POST', '/v1/admin/config',
      { notice: '', noticeTitle: '', noticeAt: 0 }, adm);
    const savedC = JSON.parse(await kv.get('cfg'));
    ok(rC.status === 200, 'C 清空公告返回 ok');
    ok(savedC.noticeAt === 0, 'C noticeAt 归零', 'noticeAt=' + savedC.noticeAt);
    ok(savedC.notice === '', 'C 公告正文清空');
  }

  /* ---------------- ② maxDev：非法值必须拒，而不是静默回退 ---------------- */
  console.log('\n[2] 设备上限 maxDev 的校验');
  const w2 = await loadWorker();
  {
    const base = JSON.stringify({
      latest: { version: '1.1.15', code: 1115, url: '', notes: '' },
      min: { version: '1.1.1', code: 0 },
      notice: '', noticeTitle: '', noticeAt: 0,
      qq: '1097668324', maxDev: 3, enforceVer: false, updPolicy: 'nag',
    });

    const { env, kv } = makeEnv(base);
    const r1 = await call(w2, env, 'POST', '/v1/admin/config', { maxDev: 'abc' }, adm);
    ok(rejected(r1), 'maxDev="abc" 被拒（不再静默回退）', JSON.stringify(r1.json));
    ok(JSON.parse(await kv.get('cfg')).maxDev === 3, 'maxDev="abc" 时原值没被改坏');

    const r2 = await call(w2, env, 'POST', '/v1/admin/config', { maxDev: 0 }, adm);
    ok(rejected(r2), 'maxDev=0 被拒并说明范围（避免「保存了 0、实际还是 3」）',
      JSON.stringify(r2.json));

    const r3 = await call(w2, env, 'POST', '/v1/admin/config', { maxDev: 99 }, adm);
    ok(rejected(r3), 'maxDev=99 超出 1-10 被拒', JSON.stringify(r3.json));

    const r4 = await call(w2, env, 'POST', '/v1/admin/config', { maxDev: 2 }, adm);
    ok(accepted(r4) && JSON.parse(await kv.get('cfg')).maxDev === 2,
      'maxDev=2 正常保存');

    /* 不传 maxDev 时不能把已有值冲掉 */
    const r5 = await call(w2, env, 'POST', '/v1/admin/config', { qq: '123' }, adm);
    ok(accepted(r5) && JSON.parse(await kv.get('cfg')).maxDev === 2,
      '不传 maxDev 时保留原值');
  }

  /* ---------------- ③ 安全联锁不能被这次改动破坏 ---------------- */
  console.log('\n[3] 强制淘汰联锁仍然生效');
  const w3 = await loadWorker();
  {
    const base = JSON.stringify({
      latest: { version: '1.1.15', code: 1115, url: '', notes: '' },
      min: { version: '1.1.1', code: 111 },     /* min.code>0 真会拦人 */
      notice: '', noticeTitle: '', noticeAt: 0,
      qq: '', maxDev: 3, enforceVer: false, updPolicy: 'nag',
    });
    const { env } = makeEnv(base);
    const r = await call(w3, env, 'POST', '/v1/admin/config', { enforceVer: true }, adm);
    ok(rejected(r), '没有下载链接也没有 QQ 群时，开强制淘汰被拒', JSON.stringify(r.json));
  }

  /* ---------------- ④ /v1/_diag：公开只给 ok，详细项要管理员 ---------------- */
  console.log('\n[4] /v1/_diag 的暴露面');
  const w4 = await loadWorker();
  {
    const { env } = makeEnv(null);
    const pub = await call(w4, env, 'GET', '/v1/_diag');
    ok(pub.status === 200 && pub.json && pub.json.ok === true, '公开访问仍能拿到 ok');
    ok(pub.json.ipLooksInternal === undefined, '公开响应不含 ipLooksInternal');
    ok(pub.json.ipForwarded === undefined, '公开响应不含 ipForwarded');
    ok(pub.json.viaProxy === undefined, '公开响应不含 viaProxy');

    const asAdmin = await call(w4, env, 'GET', '/v1/_diag', undefined, adm);
    ok(asAdmin.json && typeof asAdmin.json.ipLooksInternal === 'boolean',
      '带管理口令时才有详细自检', JSON.stringify(asAdmin.json));
  }

  /* ---------------- ⑤ 公开留言板不得泄露学号后 4 位 ---------------- */
  console.log('\n[5] 公开留言板的署名');
  const w5 = await loadWorker();
  {
    /* 造一条「有回复」的留言，让它进公开墙（replied 才列出）。 */
    const fbIdx = JSON.stringify([{ k: 'k1', at: 1, id: '20261440117', kind: 'fb', read: 1, hasReply: true }]);
    const kv = fakeKV({
      'fb:idx': fbIdx,
      'fb:k1': JSON.stringify({
        id: '20261440117', kind: 'fb', text: '问个事', contact: '',
        at: 1, reply: '已答复', replyAt: 2,
      }),
    });
    const env = { AUTH: kv, ADMIN_KEY, SECRET: 's', SIGN_KEY: 'k' };
    const r = await call(w5, env, 'GET', '/v1/feedback');
    const row = (r.json && r.json.rows && r.json.rows[0]) || {};
    ok(r.status === 200, '公开留言板可访问');
    ok(!/0117/.test(String(row.from || '')), '署名里没有学号后 4 位', 'from=' + row.from);
    ok(row.from === '同学' || row.from === '匿名', '署名是「同学」或「匿名」', 'from=' + row.from);
  }

  /* ---------------- ⑥ 匿名留言不应因为 id 为空而变成空署名 ---------------- */
  console.log('\n[6] 没有学号的留言');
  const w6 = await loadWorker();
  {
    const kv = fakeKV({
      'fb:idx': JSON.stringify([{ k: 'k2', at: 1, id: '', kind: 'fb', read: 1, hasReply: true }]),
      'fb:k2': JSON.stringify({ id: '', kind: 'fb', text: '匿名提问', at: 1, reply: '收到', replyAt: 2 }),
    });
    const env = { AUTH: kv, ADMIN_KEY, SECRET: 's', SIGN_KEY: 'k' };
    const r = await call(w6, env, 'GET', '/v1/feedback');
    const row = (r.json && r.json.rows && r.json.rows[0]) || {};
    ok(row.from === '匿名', '无学号时署名是「匿名」', 'from=' + row.from);
  }

  console.log('\n' + (bad === 0
    ? '  [PASS] cfg/留言板/diag 行为测试通过 ' + total + ' 项'
    : '  [FAIL] ' + bad + '/' + total + ' 项未过'));
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => {
  console.log('\n[FAIL] 测试自身抛异常：' + (e && e.stack || e));
  process.exit(1);
});
