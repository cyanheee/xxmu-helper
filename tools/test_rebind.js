/* v1.1.65 方案 A：「全员下线重绑教务网」的离线契约测试。
  *
  *   node tools/test_rebind.js
  *
  * 起因（用户原话 m02386）：「能不能让所有人下线，都重新绑定一次教务网，重新补录
  * 一下」。YG 选 A（m02438：「先这个吧」），承接 m02436 尾句「确认走 A，就按这套
  * 落码、出包、上线」。
  *
  * 关键修正：A 原设计「写 rev:」会死锁 —— handleActivate:1088 与 handleCheck 都查
  * rev:，客户端 check() 收到 revoked/bad_ticket 就 deactivate+clearTicket 逼重新激活，
  * 而重新激活又被 rev: 挡死，永远回不来。改用 cfg.rebindAt 时间戳：
  *   rebindKicks(rebindAt, exp) —— 票据签发时刻 issuedAt = exp - 30*DAY，
  *   严格早于 rebindAt 的判 bad_ticket（同秒重激活放行）；管理员票据在
  *   isAdminId 分支提前 return，不受影响；cfg.rebindAt 默认不存在 → 线上零回归。
  * 客户端收到 bad_ticket 会 LICENSE.deactivate() 清 K_ACCT_KB/K_VERIFIED 等五键，
  * 必须重新登录一次教务网抓真号 → activate 带 kb=kbAccount() → bindKbRow 写回
  * kb/kbAt → 名单逐个回「已确认」。这就是真正「重绑了一次教务网」。
  *
  * 能验：rebindKicks 判据（真跑）、handleRebindAll / handleRebindUndo 真跑
  *       （备份 / 清标记 / 发公告 / 重入护栏 / 撤销还原 / 三种坏备份）、前后端接线锁。
  * 不能验：真机教务登录页、真 KV 并发写、边缘 purgeEdge 真的全网失效。那要真机 + 校园网。
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
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  \u2192 ' + extra : '')); }
}
function grabDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const worker = read('server/worker.js');
const auth = read('web/auth.js');
const appjs = read('web/app.js');
const html = read('web/index.html');
const lic = read('web/license.js');

console.log('服务端：抽出 rebindKicks / handleRebindAll / handleRebindUndo 真跑:');
const kickSrc = grabDecl(worker, 'function rebindKicks(rebindAt, exp)');
const allSrc = grabDecl(worker, 'async function handleRebindAll(req, env)');
const undoSrc = grabDecl(worker, 'async function handleRebindUndo(req, env)');
ok(!!kickSrc, 'rebindKicks 源码抽得到');
ok(!!allSrc, 'handleRebindAll 源码抽得到');
ok(!!undoSrc, 'handleRebindUndo 源码抽得到');

/* vm 桩：一份 KV（env.AUTH）放 rebind:backup，IDX/CFG 走 getIdx/putIdx/getCfg/putCfg
 * 闭包，purgeEdge/audit 记账。三段真实源码拼进同一个 context，是真函数不是复制品。 */
const DAY = 86400;
const T = 1700000000;                 // 秒级基准，now() 恒返回它
let IDX = null;                       // null = 模拟 getIdx 读失败
let CFG = {};
const KV = new Map();
let PURGED = [];
let AUDITS = [];
const env = {
  AUTH: {
    get: async k => (KV.has(k) ? KV.get(k) : null),
    put: async (k, v) => { KV.set(k, v); },
    delete: async k => { KV.delete(k); },
  },
};
const sandbox = {
  console, Promise, DAY,
  now: () => T,
  getIdx: async () => (IDX === null ? null : IDX.map(x => Object.assign({}, x))),
  putIdx: async (e, list) => { IDX = list.map(x => Object.assign({}, x)); },
  getCfg: async () => Object.assign({}, CFG),
  putCfg: async (e, cfg) => { CFG = Object.assign({}, cfg); },
  purgeEdge: async (req, p) => { PURGED.push(p); },
  audit: async (e, act, ids, extra) => { AUDITS.push({ act: act, ids: ids, extra: extra }); },
  bad: (msg, status) => ({ ok: false, msg: msg, status: status }),
  json: (o) => o,
};
vm.createContext(sandbox);
vm.runInContext(
  kickSrc + '\n' + allSrc + '\n' + undoSrc +
  '\n;this.A = { rebindKicks: rebindKicks, handleRebindAll: handleRebindAll, handleRebindUndo: handleRebindUndo };',
  sandbox);
const A = sandbox.A;

function reset(idx, cfg) {
  IDX = idx;
  CFG = Object.assign({}, cfg);
  KV.clear();
  PURGED = [];
  AUDITS = [];
}

(async () => {
  /* ---------- rebindKicks 判据真跑 ---------- */
  console.log('rebindKicks 真跑（严格小于：同秒签发的票据必须放行）:');
  const span = 30 * DAY;
  ok(A.rebindKicks(0, T + span) === false, 'rebindAt=0（默认不存在）→ 一律放行，线上零回归');
  ok(A.rebindKicks('', T + span) === false, 'rebindAt 空串 → 放行');
  ok(A.rebindKicks(undefined, T + span) === false, 'rebindAt 未定义 → 放行');
  ok(A.rebindKicks(T, (T - 100) + span) === true,
    '重绑前签发的老票据（issuedAt=T-100）→ 判踢下线');
  ok(A.rebindKicks(T, T + span) === false,
    '同秒重新激活签发的票据（issuedAt===rebindAt）→ 放行（严格小于）');
  ok(A.rebindKicks(T, (T + 5) + span) === false,
    '重绑之后签发的新票据（issuedAt=T+5）→ 放行');
  ok(A.rebindKicks(String(T), (T - 1) + span) === true,
    'rebindAt 是字符串（KV 常见）也能 parseInt 判定 → 踢');

  /* ---------- handleRebindAll 真跑：备份 / 清标记 / 公告 / audit ---------- */
  console.log('handleRebindAll 真跑（一次发起：备份 + 清 kb/kbAt + 发公告 + 边缘失效）:');
  const ORIG = [
    { id: '20291100411', at: 100, note: '张', kb: '20261440105', kbAt: 200 }, // v1.1.64 双号
    { id: '12345', at: 110, note: '李' },                                     // pending
    { id: '20241100927', at: 120, kb: 1 },                                    // v1.1.63 遗留 kb:1
  ];
  reset(ORIG.map(x => Object.assign({}, x)),
    { notice: '旧公告', noticeAt: 50, noticeTitle: '旧标题', qq: '1097668324' });
  const r1 = await A.handleRebindAll({}, env);
  ok(!!r1 && r1.ok === true, '发起成功 ok:true');
  ok(!!r1 && r1.rows === 3, '返回 rows=3（整份名单行数）', r1 && r1.rows);
  ok(!!r1 && r1.rebindAt === T, '返回 rebindAt=now()', r1 && r1.rebindAt);
  ok(KV.has('rebind:backup'), '整键备份写进 rebind:backup');
  let bp = null;
  try { bp = JSON.parse(KV.get('rebind:backup')); } catch (e) { bp = null; }
  ok(!!bp && Array.isArray(bp.idx) && bp.idx.length === 3, '备份含完整 3 行 idx');
  ok(!!bp && bp.idx[0].kb === '20261440105' && bp.idx[2].kb === 1,
    '备份是「清空前」的原始 idx（含 kb 真号 / kb:1 遗留）');
  ok(!!bp && bp.notice === '旧公告' && bp.noticeTitle === '旧标题' && bp.noticeAt === 50,
    '备份同时存旧公告三字段，撤销能还原');
  ok(IDX.length === 3 && IDX.every(e => !('kb' in e) && !('kbAt' in e)),
    'idx 每行 kb / kbAt 都删掉，整批回「待补录」');
  ok(IDX[0].id === '20291100411' && IDX[0].at === 100 && IDX[0].note === '张',
    'id / at / note 原样保留（不是重建一份空名单）');
  ok(CFG.rebindAt === T, 'cfg.rebindAt 写入时间戳');
  ok(/重新登录一次教务网/.test(CFG.notice || '') && CFG.noticeTitle === '学号重新确认' && CFG.noticeAt === T,
    'cfg 写入重绑公告 + 标题 + 时间');
  ok(CFG.qq === '1097668324', 'cfg 其它字段（qq）没被白名单式构造丢掉');
  ok(PURGED.indexOf('/v1/config') >= 0, 'purgeEdge(/v1/config) 让公告即时生效');
  ok(AUDITS.some(a => a.act === 'rebind-all'), 'audit 记 rebind-all 留痕');
  // 跨函数集成：发起后，老票据判踢、新票据放行
  ok(A.rebindKicks(CFG.rebindAt, (T - 100) + span) === true &&
     A.rebindKicks(CFG.rebindAt, T + span) === false,
    '集成：发起后老票据被踢、同秒重激活的票据放行（回流闭环）');

  /* ---------- 重入护栏：不许用已清空的 idx 覆盖第一份备份 ---------- */
  console.log('handleRebindAll 重入护栏:');
  const r2 = await A.handleRebindAll({}, env);
  ok(!!r2 && r2.ok === false && /已经发起过/.test(r2.msg || ''),
    '第二次发起被拒（提示先撤销）', r2 && r2.msg);
  const bp2 = JSON.parse(KV.get('rebind:backup'));
  ok(bp2.idx[0].kb === '20261440105',
    '护栏生效：第一份备份没被「已清空的 idx」覆盖');
  ok(IDX.length === 3 && IDX.every(e => !('kb' in e)), '重入没做二次写入');

  /* ---------- handleRebindUndo 真跑：一键还原 ---------- */
  console.log('handleRebindUndo 真跑（还原 idx + 删 rebindAt + 还原公告 + 删备份）:');
  const ru = await A.handleRebindUndo({}, env);
  ok(!!ru && ru.ok === true && ru.rows === 3, '撤销成功 ok:true rows=3', ru && ru.rows);
  ok(IDX[0].kb === '20261440105' && IDX[0].kbAt === 200 && IDX[2].kb === 1,
    'idx 还原出 kb 真号 / kbAt / kb:1（名单回到已确认）');
  ok(!('rebindAt' in CFG), 'cfg.rebindAt 被删除 → 老票据重新有效');
  ok(CFG.notice === '旧公告' && CFG.noticeTitle === '旧标题' && CFG.noticeAt === 50,
    '公告还原到发起前');
  ok(CFG.qq === '1097668324', '撤销后其它 cfg 字段仍在');
  ok(!KV.has('rebind:backup'), 'rebind:backup 已删除（可再次发起）');
  ok(PURGED.indexOf('/v1/config') >= 0, '撤销也 purgeEdge(/v1/config)');
  ok(AUDITS.some(a => a.act === 'rebind-undo'), 'audit 记 rebind-undo 留痕');

  /* ---------- 三种坏输入：一律不写入、只报错 ---------- */
  console.log('handleRebindUndo 坏输入（不写入、只报错）:');
  reset([{ id: '1', at: 1 }], { notice: 'x' });
  const u0 = await A.handleRebindUndo({}, env);
  ok(!!u0 && u0.ok === false && /没有可撤销/.test(u0.msg || ''),
    '没发起过（无 backup）→ 明确报错', u0 && u0.msg);
  KV.set('rebind:backup', '{坏 JSON');
  const u1 = await A.handleRebindUndo({}, env);
  ok(!!u1 && u1.ok === false && u1.status === 500 && /读不出来/.test(u1.msg || ''),
    'backup 是坏 JSON → 500，不做任何写入', u1 && u1.msg);
  KV.set('rebind:backup', JSON.stringify({ idx: 'not-an-array' }));
  const u2 = await A.handleRebindUndo({}, env);
  ok(!!u2 && u2.ok === false && u2.status === 500 && /格式不对/.test(u2.msg || ''),
    'backup.idx 不是数组 → 500，不做任何写入', u2 && u2.msg);

  /* ---------- getIdx 读失败：整批拒绝、零写入 ---------- */
  console.log('handleRebindAll 读 idx 失败护栏:');
  reset(null, { notice: 'x' });
  const a0 = await A.handleRebindAll({}, env);
  ok(!!a0 && a0.ok === false && a0.status === 500 && /名单索引读不出来/.test(a0.msg || ''),
    'getIdx=null → 500，不覆盖名单', a0 && a0.msg);
  ok(!KV.has('rebind:backup'), '读失败时连备份都没写（零写入）');

  /* ---------- 不用 rev: 的硬约束（死锁防线） ---------- */
  console.log('方案 A 不用 rev:（写 rev: 会死锁）:');
  ok(!/put\(['"]rev:/.test(allSrc) && !/rev:'/.test(allSrc),
    'handleRebindAll 不写 rev: 停用标记');
  ok(!/put\(['"]rev:/.test(undoSrc), 'handleRebindUndo 不碰 rev:');
  ok(/rebind:backup/.test(allSrc) && /rebind:backup/.test(undoSrc),
    '备份统一走 rebind:backup 单键（O(1) 可逆）');

  /* ---------- 前后端接线静态锁 ---------- */
  console.log('前后端接线锁（任何一处被删，方案 A 会退化/失灵）:');
  ok(/function rebindKicks\(rebindAt, exp\)/.test(worker), 'worker 有 rebindKicks 纯函数');
  ok(/async function handleRebindAll\(req, env\)/.test(worker) &&
     /async function handleRebindUndo\(req, env\)/.test(worker), 'worker 有两个 handler');
  ok(/if \(rebindKicks\(cfg\.rebindAt, t1\.exp\)\)/.test(worker) &&
     /reason: 'bad_ticket', rebind: true/.test(worker),
    'handleCheck 判据：老票据返回 bad_ticket + rebind:true');
  ok(worker.indexOf('const t1 = await checkTicket(') >= 0 &&
     worker.indexOf('const t1 = await checkTicket(') < worker.indexOf('if (rebindKicks(cfg.rebindAt, t1.exp))'),
    '判据在 checkTicket 验真之后（不误伤无效票据）');
  ok(/if \(p === '\/v1\/admin\/rebind-all' && req\.method === 'POST'\)/.test(worker) &&
     /if \(p === '\/v1\/admin\/rebind-undo' && req\.method === 'POST'\)/.test(worker),
    '两条路由都挂在 admin 鉴权块内');
  ok(/rebindAll\(\) \{ return postJson\('\/v1\/admin\/rebind-all'/.test(auth) &&
     /rebindUndo\(\) \{ return postJson\('\/v1\/admin\/rebind-undo'/.test(auth),
    'auth.js Admin.rebindAll / rebindUndo 出口');
  ok(/function openRebind\(all\)/.test(appjs) &&
     /AUTH\.Admin\.rebindAll\(\)/.test(appjs) && /AUTH\.Admin\.rebindUndo\(\)/.test(appjs),
    'app.js openRebind 二次确认 + 调两个出口');
  ok(/\$\('admRebindState'\)/.test(appjs), '发起/撤销后写 #admRebindState 状态');
  ok(/on\('admRebindGo', \(\) => openRebind\(true\)\)/.test(appjs) &&
     /on\('admRebindUndo', \(\) => openRebind\(false\)\)/.test(appjs),
    'init 绑定两个按钮');
  ok(/id="admRebindState"/.test(html) && /id="admRebindGo"/.test(html) && /id="admRebindUndo"/.test(html),
    'index.html 名单卡有状态位 + 两个按钮');
  // 回流闭环：bad_ticket 会 deactivate 清 K_ACCT_KB，逼真正重登教务网
  ok(/reason === 'revoked' \|\| reason === 'not_granted' \|\| reason === 'bad_ticket'/.test(auth),
    'auth.check 把 bad_ticket 归进 deactivate 分支');
  ok(/function deactivate\(\)/.test(lic) && /set\(K_ACCT_KB, ''\)/.test(lic),
    'license.deactivate 清 K_ACCT_KB（真号缓存）→ 逼重新登录教务网');

  console.log('');
  if (bad) { console.log('test_rebind: ' + (total - bad) + '/' + total + ' passed, ' + bad + ' FAILED'); process.exit(1); }
  console.log('test_rebind: ' + total + ' passed, 0 failed \u2192 PASS');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
