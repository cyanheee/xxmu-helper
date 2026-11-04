/* 河医大助手 · 联网授权与版本服务（Cloudflare Worker）v2
 *
 * 为什么要有它：
 *   纯本地方案（v0.7.0 及以前）的密钥在 APK 里，会反编译的人可以自己算码，
 *   也没办法远程踢人。要真正做到「我决定谁能用」，校验必须发生在我能改的地方。
 *
 * 核心思路：
 *   1. 激活码算法不变（HMAC-SHA256 + Crockford Base32，16 位），
 *      所以学生手上已经发出的码继续有效，不需要重发。
 *   2. 但码只是「口令」，真正生效还需要服务端有一张「已开卡」记录。
 *   3. 激活成功后发一张票据（ticket = exp.签名），客户端离线可继续用，
 *      联网时静默复检：被吊销就锁死，正常就自动续期。
 *
 * 三个密钥（都在 Worker 的 Secret 里，绝不进 APK）：
 *   SECRET     算激活码用，必须与旧版 license.js 里的常量一模一样，
 *              否则老码全废。这个值一改，所有已发的码都要重发。
 *   SIGN_KEY   签票据用。可以随时轮换（轮换后所有人重登一次即可）。
 *   ADMIN_KEY  管理员口令，调 /v1/admin/* 时放在 X-Admin-Key 头里。
 *
 * KV 里的键：
 *   lic:<id>      已开卡记录  {at, note}
 *   rev:<id>      吊销标记    "1"
 *   dev:<id>      设备绑定    [{fp, tag, at, last}]
 *   last:<id>     最近一次激活的痕迹（诊断用，60 天过期）
 *   cfg           版本配置    JSON
 *   idx           使用名单    [{id, at, note}]（整表单键，见下面 getIdx 的说明）
 *   fb:idx        留言索引    [{k, at, id, kind, read}]
 *   fb:<k>        留言正文    {id, kind, text, contact, at, reply, replyAt}
 *   ph:idx        图片索引    [{k, at, id, cap, w, h, st}]  st = 'p' 待审 / 'a' 通过
 *   ph:<k>        图片本体    原始 JPEG/PNG 字节（不是 base64，省 33%）
 *   rl:<bucket>   限流计数    "3"（带 expirationTtl，过期自动消失）
 */

const enc = new TextEncoder();
const DAY = 86400;
const MAX_DEV = 3;              // 每个学号默认最多绑定几台设备

/* 名单索引（idx）的条数上限。
 * 一个装了这个 App 的学生才会进名单，本校实际是几百到几千的量级，
 * 5000 留了足够余量。设上限的理由见 idxApply 里的注释：
 * /v1/activate 不需要凭证，每个假学号都会真的新增一条 + 写一次 KV，
 * 而全站 KV 免费写额度只有 1000/天。封顶之后损害就停在「名单少几条」。 */
const IDX_CAP = 5000;

/* ---------------------------------------------------------------- 工具 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-admin-key',
  'Access-Control-Max-Age': '86400',
};

function json(o, status) {
  /* 非 ASCII 一律转成 JSON 的 \uXXXX 转义。
   * v0.9.7 及更早的客户端把 Java 带回的 ISO-8859-1 字节串直接 JSON.parse，
   * 没做 UTF-8 解码，中文公告/更新说明就会变成乱码。转义后线上只有 ASCII
   * 字节，新旧客户端 JSON.parse 后得到的都是正确 Unicode 字符串。 */
  const body = JSON.stringify(o).replace(/[\u007f-\uffff]/g,
    ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  return new Response(body, {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS),
  });
}

function bad(msg, status) {
  const r = json({ ok: false, msg: msg }, status || 200);
  // 错误响应一律不许缓存：否则边缘会把某个人的 429 / 401 发给下一个人
  const h = new Headers(r.headers);
  h.set('cache-control', 'no-store');
  return new Response(r.body, { status: r.status, headers: h });
}

/** 给一个已生成的响应加上缓存头（不改 body，只换 headers） */
function withCache(r, cc) {
  const h = new Headers(r.headers);
  h.set('cache-control', cc);
  return new Response(r.body, { status: r.status, headers: h });
}

/* ---------------------------------------------------------------- 边缘缓存
 *
 * 血泪教训（别照抄「加个 cache-control 就完事」）：
 *   在 Worker 里给响应写 `cache-control: public, max-age=60` **不会**让
 *   Cloudflare 边缘缓存它。Worker/Pages Functions 的响应默认不进边缘缓存，
 *   想缓存必须**显式调用 Cache API**（caches.default）。只写头等于白写，
 *   而且会给人「我已经做了缓存」的错觉，比不写更危险。
 *
 * 这里做的就是把这件事显式化，并给响应加一个 `x-edge: hit|miss` 头 ——
 * 有了它，「缓存到底生效没生效」是可以连着打两次就验出来的，
 * 不用靠猜。线上实测结果记在 HANDOFF 里。
 *
 * 只缓存「所有人看到的都一样」的 GET：配置、图片列表、图片本体、已回复留言。
 * 带管理员口令的、带学号的、写操作的一律不缓存。
 */
async function edgeCache(req, ttlSec, producer, opts) {
  const o = opts || {};
  let cache = null;
  try { cache = caches.default; } catch (e) { cache = null; }
  if (!cache) return await producer();          // 环境没有 Cache API，直接回源

  // 缓存键要带上 host，否则 pages.dev 和 workers.dev 会互串。
  // 只用 pathname+search 是安全的：这几个接口的响应不随 Cookie 变化。
  const u = new URL(req.url);

  /* v1.1.10：**缓存键能不能忽略 query，是一个安全属性，不只是性能。**
   *
   * 原来键里带 u.search，于是 `/v1/feedback?x=<随机数>` 每次都 miss、
   * 每次都真进 Worker、每次都读一遍 fb:idx 再读最多 30 条正文。
   * 实测：随机 query 打 /v1/config、/v1/photos、/v1/feedback 全部 miss。
   * 免费版 10 万 KV 读/天，一个每秒 10 个随机 query 的脚本，
   * 大约 55 分钟就能把全站当天的读额度吃光 —— 之后所有学生都打不开。
   *
   * 「所有人看到的都一样」的接口，它的响应本来就不该随 query 变化，
   * 那就别让 query 参与缓存键。真要区分内容的（/v1/photo?k=）保持原样。 */
  const keyUrl = o.ignoreQuery
    ? (u.origin + u.pathname)
    : (u.origin + u.pathname + (o.queryKey != null ? o.queryKey : u.search));
  const key = new Request(keyUrl, { method: 'GET' });

  try {
    const hit = await cache.match(key);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set('x-edge', 'hit');
      return new Response(hit.body, { status: hit.status, headers: h });
    }
  } catch (e) { /* 缓存读失败就回源，绝不能因此报错 */ }

  /* v1.1.10：回源也要限额。
   *
   * 负缓存只能救「同一个假 key 反复打」，救不了「每次换一个新 key」。
   * 实测：`/v1/photo?k=<随机>` 连续 4 个不同 k 全是 miss，每次都读一遍
   * ph:idx —— 一个每秒换一个 k 的脚本，读额度照样能被打光。
   *
   * 这里限的是「回源次数」而不是「请求次数」，因为正常用户的绝大多数
   * 请求都会命中缓存、根本走不到这一行；只有真的在制造 miss 的人才会
   * 撞上。阈值按「一个出口 IP 一分钟最多 120 次回源」定：正常冷启动
   * 几十次，宿舍 NAT 后面几十个人同时开 App 也就这个量级。 */
  if (o.costLimit && !rlHit('edge:ip:' + clientIp(req), o.costLimit, 60 * 1000)) {
    return bad('请求太频繁，等一会儿再试。', 429);
  }

  const r = await producer();

  /* 缓存哪些状态码：200 用 ttlSec；404 可以用一个更短的 negTtl。
   *
   * 为什么需要负缓存：`/v1/photo?k=<随机>` 原来每次都回源、每次都读
   * ph:idx，一个随机 k 就是一次 KV 读，而且 bad() 走的是 404 分支、
   * 根本不经过这里，连缓存的机会都没有。现在允许 404 进缓存一小会儿，
   * 同一个假 k 反复打只花一次。 */
  let cacheTtl = 0;
  if (r.status === 200) cacheTtl = ttlSec;
  else if (r.status === 404 && o.negTtl) cacheTtl = o.negTtl;

  if (cacheTtl > 0) {
    const h = new Headers(r.headers);
    h.set('cache-control', 'public, max-age=' + cacheTtl + ', s-maxage=' + cacheTtl);
    h.set('x-edge', 'miss');
    const out = new Response(r.body, { status: r.status, headers: h });
    try {
      // put 的 body 会被消费，所以用 clone 原样再返回一份
      await cache.put(key, out.clone());
    } catch (e) { /* 缓存写失败不影响这次请求 */ }
    return out;
  }
  return r;
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Crockford Base32，与 web/license.js 的 toBase32 逐字节等价。
 * 必须一致：客户端算出来的码要和服务端算出来的一样。 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

async function codeFor(secret, id) {
  const raw = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    enc.encode(id));
  const bytes = new Uint8Array(raw);
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < bytes.length && out.length < 16; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && out.length < 16) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{1,4}/g).join('-');
}

function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}

/* 定长比较，避免早退泄露前缀 */
function safeEq(a, b) {
  const x = normalizeCode(a), y = normalizeCode(b);
  if (!x || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

function now() { return Math.floor(Date.now() / 1000); }

/* 票据签名密钥。
 *
 * v1.1.9 的安全修复：**不再回落到 env.SECRET**。
 *
 * 原来写的是 `env.SIGN_KEY || env.SECRET`，理由是「漏配别让全站瘫」。
 * 但 env.SECRET 是明文常量 `XXMU-HELPER-GU-2026-v1`，就写在 web/license.js:23，
 * 而那个文件会被 tools/build_apk.py 逐字节打进每个 APK 的 assets/ —— 谁下个包
 * unzip 就能看到。于是「漏配 SIGN_KEY」这个本该是「部署疏忽」的情况，会直接升级成
 * 「任何人可以离线伪造 admin 票据、直接调 /v1/admin/*」。
 *
 * 现在的行为：只认 SIGN_KEY。没配就抛错 —— 报错、接口 500，但不会静默降级成
 * 一个公开的密钥。部署脚本（tools/deploy_server.ps1 / deploy_worker.py）本来就
 * 强制写入并校验 SIGN_KEY，所以这个分支正常永远走不到，它只是「万一」的护栏。
 *
 * 顺带记一条：web/license.js 的 codeFor/verify 已经没有任何调用点（v1.1.0 取消
 * 激活码后就是死代码），SECRET 常量也在那里。它们留着是为了兼容极老的客户端，
 * 但**绝不能作为任何服务端密钥**。
 */
function signKey(env) {
  const k = env.SIGN_KEY;
  if (!k || String(k).length < 16) {
    throw new Error('SIGN_KEY 未配置或过短：拒绝用可预测的密钥签票据');
  }
  return k;
}

/* 票据里带 role。
 *
 * 为什么要带：
 *   v0.9.7 及以前，「谁是管理员」是客户端写死的 ADMIN_IDS 常量，命中就直接放行、
 *   连激活码都不用填。任何人反编译 APK 就能看到那个学号，输入即可进入管理员界面。
 *   把 role 签进票据之后，管理员身份由服务端在这里签发，客户端只是「读票」，
 *   改包也没法自己伪造——伪造需要 SIGN_KEY，而它只在 Worker 的 Secret 里。
 *
 * 向后兼容：老客户端拿的票据 role 是空串，checkTicket 会两种都试一遍。
 */
async function makeTicket(env, id, fp, exp, role) {
  // role 为空时拼串必须与旧版**逐字节相同**（id|fp|exp），否则已发出的票据全部失效，
  // 所有已激活的学生都会被迫重新激活一次。
  const body = role ? (id + '|' + fp + '|' + exp + '|' + role) : (id + '|' + fp + '|' + exp);
  return exp + '.' + (await hmacHex(signKey(env), body));
}

/** 返回 {exp, role} 或 null */
async function checkTicket(env, id, fp, ticket) {
  const t = String(ticket || '');
  const dot = t.indexOf('.');
  if (dot <= 0) return null;
  const exp = parseInt(t.slice(0, dot), 10);
  if (!exp || exp < now()) return null;
  for (const role of ['', 'admin']) {
    const want = await makeTicket(env, id, fp, exp, role);
    if (want.length !== t.length) continue;
    let d = 0;
    for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ want.charCodeAt(i);
    if (d === 0) return { exp: exp, role: role };
  }
  return null;
}

/* ---------------------------------------------------------------- 设备绑定
 *
 * 为什么要有：
 *   票据已经绑了设备指纹，但那只是「拷走票据没用」。学生换手机、装平板、
 *   甚至重装系统都会变指纹，光靠票据会导致他自己也被锁在外面。
 *   所以服务端维护一份「这个学号绑了哪几台」，有上限、可查看、可一键清空。
 *
 * 上限的作用不是绝对防共享（挡不住一个人把自己的码给朋友，朋友换设备时
 * 来找管理员要解绑），而是让「一码传全班」变成需要反复人工干预的高摩擦路径。
 */

function maxDev(cfg) {
  const n = parseInt((cfg && cfg.maxDev) || MAX_DEV, 10);
  return (!n || n < 1) ? MAX_DEV : Math.min(n, 10);
}

async function getDevs(env, id) {
  const raw = await env.AUTH.get('dev:' + id);
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

async function putDevs(env, id, list) {
  if (!list.length) { await env.AUTH.delete('dev:' + id); return; }
  await env.AUTH.put('dev:' + id, JSON.stringify(list));
}

/** 把设备登记进去。返回 {ok:true} 或 {ok:false, reason:'device_limit', devs}
 *
 * v1.1.8：写入节流。原来每次激活都无条件 `list[i].last = now(); putDevs(...)`
 * —— 一个学生一天开十次 App 就是十次 KV 写，而 KV 免费额度全站只有 1000 写/天。
 * 被刷光之后管理员的开通、停用、审核、发公告全部 500，且「激活失败」这个
 * 现象完全指不到真实原因。现在只有「新设备」或「上次记录超过 6 小时」
 * 才落盘，last 的用途只是给管理员看个大概时间，不需要分钟级精度。
 */
const DEV_TOUCH_GAP = 6 * 3600;   // 秒
async function bindDevice(env, id, fp, tag, limit) {
  const list = await getDevs(env, id);
  const i = list.findIndex(d => d.fp === fp);
  if (i >= 0) {
    const stale = !list[i].last || (now() - list[i].last) > DEV_TOUCH_GAP;
    const tagChanged = !!tag && list[i].tag !== tag;
    if (stale || tagChanged) {
      list[i].last = now();
      if (tag) list[i].tag = tag;
      await putDevs(env, id, list);
      return { ok: true, devs: list, isNew: false, touched: true };
    }
    return { ok: true, devs: list, isNew: false, touched: false };
  }
  if (list.length >= limit) {
    return { ok: false, reason: 'device_limit', devs: list, limit: limit };
  }
  list.push({ fp: fp, tag: tag || '', at: now(), last: now() });
  await putDevs(env, id, list);
  return { ok: true, devs: list, isNew: true, touched: true };
}

async function hasDevice(env, id, fp) {
  const list = await getDevs(env, id);
  return list.some(d => d.fp === fp);
}

/* ---------------------------------------------------------------- 名单索引
 *
 * 为什么要有 idx：
 *   早期 handleList 是「列 lic: 前缀 → 对每个学号再各读 3 次（lic/rev/dev）」。
 *   Cloudflare Workers 免费版一次请求最多 50 次子请求，50 个学号就会爆掉，
 *   表现为名单只加载一半或直接 500。改成把成员表存进单个 KV 文档，列名单只要
 *   1~2 次读取；停用集合用 rev: 前缀一次 list 拿到（list 不计入子请求爆炸）。
 *
 *   代价是 idx 和 lic:/rev:/dev: 之间需要保持一致——所有增删都必须同时改两处。
 *   管理动作频率很低，这个代价换来的稳定性值得。
 */

/* 读名单索引。返回数组，或 null 表示「读到了但内容坏了」。
 *
 * ⚠️ 这里曾经是这么写的：解析失败 → 当成首次迁移 → 从 lic: 前缀重建 →
 *    无条件 putIdx 写回。而 v1.1.0 取消开卡以后 lic: 大面积为空
 *    （handleUngrant 还专门 delete lic:），重建结果必然是空数组。
 *    于是一次 KV 读抖动、一次半写入、一次手工改坏，就会把整张名单
 *    永久清空 —— 而且新写回去的是「合法 JSON 空数组」，下次走正常分支，
 *    再也重建不回来。这不是攻击，是自毁。
 *
 * 现在的规矩：
 *   raw == null（键根本不存在）= 真的首次迁移，才重建并落盘；
 *   raw 存在但解析不出来 = 坏值，**不写回**，返回 null 交给调用方报错。
 * 宁可让管理员看到「名单读不出来」，也不能让它悄悄变成「名单是空的」。 */
async function getIdx(env) {
  const raw = await env.AUTH.get('idx');
  if (raw != null && raw !== '') {
    try {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return a;
      console.error('idx 不是数组，拒绝自动重建');
    } catch (e) {
      console.error('idx JSON 损坏，拒绝自动重建', e && e.message);
    }
    return null;
  }
  // 首次迁移：从 lic: 前缀重建（不读值，避免迁移时子请求爆掉，故 at 未知记 0）
  const out = [];
  let cursor;
  do {
    const r = await env.AUTH.list({ prefix: 'lic:', cursor: cursor });
    for (const k of r.keys) out.push({ id: k.name.slice(4), at: 0, note: '' });
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  await putIdx(env, out);
  return out;
}

async function putIdx(env, list) { await env.AUTH.put('idx', JSON.stringify(list)); }

/* 批量增删：一次读、内存里改完、一次写。
 *
 * 为什么不能沿用「每个学号一次 idxAdd」：
 *   ① 每次 idxAdd = 1 次整表读 + 1 次整表写。批量开卡 20 个人 = 20 次读写，
 *      KV 免费额度只有 1000 写/天，一个开学季就能吃完。
 *   ② KV 是最终一致且没有事务。两个并发激活各自读到旧表、各自写回，
 *      后写的把先写的整条新增抹掉 —— 学生明明激活成功，管理员名单里没有他。
 *      （这条没法彻底修，但把「批量 = N 次往返」压成 1 次，窗口小了一个量级，
 *       剩下的靠 handleList 兜底提示 reconcile。）
 *
 * v1.1.8 追加一条关键优化：**没有真实变化就不写**。
 *   原来 add 无条件 `changed = true` 并把 at 刷成 now()，于是同一台手机
 *   每次启动激活都整表重写一次 —— 一个学生一天开十次 App 就是十次 KV 写。
 *   KV 免费额度 1000 写/天是全站共享，被这样磨光之后，管理员的开通、停用、
 *   审核、发公告全部 500，而「激活失败」根本看不出是这个原因。
 *   现在：已存在的学号只更新 note（且只在 note 真变了才更新），不碰 at
 *   —— at 保持「第一次见到的时刻」，这本来就是名单页想看的语义。
 *
 * 参数：adds = [{id, note}]，dels = ['学号', ...]。返回写后的数组。
 * getIdx 返回 null（索引损坏）时抛错，绝不覆盖。
 */
async function idxApply(env, adds, dels) {
  const idx = await getIdx(env);
  if (idx === null) throw new Error('idx 索引损坏，读不出来（为免覆盖真实名单，本次不写入）');
  let changed = false;
  let overflow = 0;
  for (const a of (adds || [])) {
    const i = idx.findIndex(e => e.id === a.id);
    if (i >= 0) {
      if (a.note && idx[i].note !== a.note) { idx[i].note = a.note; changed = true; }
    } else {
      /* v1.1.9：名单长度硬上限。
       *
       * /v1/activate 不需要任何凭证（身份由学校登录页证明），所以任何人都能
       * 拿「格式合法的假学号」去调它。每调一次只要这个学号不在名单里，
       * 就会真的新增一条 + 写一次 KV —— 而全站 KV 免费额度只有 1000 写/天，
       * 写光之后管理员的开通/停用/审核/发公告全部 500，且「为什么全都失败」
       * 从现象上完全指不到原因。IP 限流挡不住（学校 NAT 后面几百人共用一个
       * 出口，阈值不能定低），fp 也能随便换。
       *
       * 加一个上限之后，损害就被封顶了：刷到 5000 条以后再刷不再产生写入。
       * 这个数字远大于一所学校的学生数（本校在册两万余人，但装这个 App 的
       * 是几百到几千的量级），正常使用永远碰不到。触顶后**激活仍然成功**
       * （照发票据，学生能继续用），只是不进名单 —— 名单的用途是给管理员
       * 看「谁在用」，丢几条可以被 handleList 的重建兜住，而让全站写额度
       * 被刷爆是不可恢复的。 */
      if (idx.length >= IDX_CAP) { overflow++; continue; }
      idx.push({ id: a.id, at: now(), note: a.note || '' });
      changed = true;
    }
  }
  for (const id of (dels || [])) {
    const j = idx.findIndex(e => e.id === id);
    if (j >= 0) { idx.splice(j, 1); changed = true; }
  }
  if (changed) await putIdx(env, idx);
  if (overflow) {
    try { console.error('idx 已达上限 ' + IDX_CAP + '，本次跳过 ' + overflow + ' 条新增（激活不受影响）'); } catch (e) {}
  }
  return { idx: idx, changed: changed, overflow: overflow };
}

/** 一次性拿到所有停用标记（分页 list，每页 1 次子请求） */
async function revokedSet(env) {
  const s = new Set();
  let cursor;
  do {
    const r = await env.AUTH.list({ prefix: 'rev:', cursor: cursor });
    for (const k of r.keys) s.add(k.name.slice(4));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return s;
}

/* ---------------------------------------------------------------- 配置 */

const DEFAULT_CFG = {
  latest: { version: '0.9.0', code: 21, url: '', notes: '', size: 0, sha256: '' },
  min: { version: '0.0.0', code: 0 },
  maxDev: MAX_DEV,
  // enforceVer = true 时，复检必须带 ver 且不低于 min，否则当作坏票据处理。
  // 默认关：配错会让全校一起打不开，必须由管理员显式打开。
  enforceVer: false,
  qq: '1097668324',
  // 公告：与「更新提示」是两件事。
  //   notice   —— 正文，空串表示没有公告
  //   noticeAt —— 发布时间戳。客户端只记「我看过 noticeAt 这一版」，
  //               管理员改公告会刷新这个值，于是所有人重新看到一次。
  //               用时间戳而不是布尔标记，是因为要能反复发新公告。
  notice: '',
  noticeAt: 0,
  noticeTitle: '',
  // 更新提示策略：
  //   'nag'  —— 没更新就一直提示（每次打开都弹）
  //   'once' —— 每台设备只提示一次，点了「以后再说」就不再打扰
  // 强制升级（min.code + enforceVer）不受这个影响。
  updPolicy: 'nag',
  // requireGrant = true 时恢复「白名单」模式：必须有 lic:<学号>（后台开过卡）
  // 才能进。v1.1.0 起默认关——激活码已取消，身份校验交给学校自己的登录页。
  // 留着这个开关，是为了临时限额（比如只放某几个班先试）时不用改客户端。
  requireGrant: false,
};

/* cfg 是**每一次请求都要读**的东西：/v1/config、/v1/activate、/v1/check 全要先拿它。
   一个人打开 App 至少触发 3 次读，全校一天下来几千次，KV 免费额度（10 万读/天）
   大半耗在同一个键上。而这份配置几分钟才变一次，完全没必要每次回源。

   这里加一层 isolate 内存缓存（60 秒）。要点：
     · 缓存挂在模块作用域，同一个 isolate 内的请求共享；isolate 被回收就自然没了。
     · **写必须失效**（putCfg），否则管理员改了公告要等一分钟才生效 —— 那时
       管理员会以为自己没保存成功，反复点，反而更糟。
     · 多个 isolate 之间最多差 60 秒，对「公告 / 版本号」这种信息无所谓。

   v1.1.9：**读失败时不许把默认值当真值缓存。**
   原来 `raw` 为空（键不存在）和 `JSON.parse` 抛异常走的是同一条路：都回落
   DEFAULT_CFG 并存进缓存 60 秒，外面还有 edgeCache(60) 再放大一层。于是
   「KV 里 cfg 被写坏」这个事故的表现是：公告消失、latest.url 变空（下载按钮
   变成空链接），而**谁都不知道发生了什么** —— 60 秒后它自己好了，日志里一个字没有。
   现在分三种情况：
     · 键不存在（真的第一次部署）→ 用默认值，**不缓存**（每次回源，成本可接受，
       因为这种情况只会在首次部署的几分钟内出现）；
     · 有值但解析失败 → 记 error 日志，用默认值，**不缓存**（修好立刻生效，
       而不是继续拿默认值糊 60 秒）；
     · 正常 → 缓存。
   注意：不缓存只是「每次都回源」，不会让请求失败 —— 配置读不到时宁可慢，
   不可把错误值当成已确认的事实到处传播。 */
let CFG_CACHE = null;
let CFG_AT = 0;
const CFG_TTL = 60 * 1000;

async function getCfg(env) {
  const t = Date.now();
  if (CFG_CACHE && t - CFG_AT < CFG_TTL) return CFG_CACHE;
  const raw = await env.AUTH.get('cfg');

  /* 键不存在：真的第一次部署。用默认值，但不缓存（下次还是回源，
   * 一旦管理员保存了配置就立刻进入正常缓存路径）。 */
  if (raw == null || raw === '') {
    return DEFAULT_CFG;
  }

  let out;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('cfg 不是对象');
    }
    out = Object.assign({}, DEFAULT_CFG, parsed);
  } catch (e) {
    /* 有值但坏了：记日志、不缓存、用默认值顶着。
     * 这样管理员把 cfg 改回合法 JSON 的**下一个请求**就恢复，
     * 而不是再等 60 秒（+ 边缘缓存 60 秒）才看到变化。 */
    try { console.error('cfg 解析失败，本次不缓存：', e && e.message); } catch (x) {}
    return DEFAULT_CFG;
  }

  CFG_CACHE = out;
  CFG_AT = t;
  return out;
}

/** 写配置：落 KV 之后必须同步刷掉本 isolate 的缓存 */
async function putCfg(env, next) {
  await env.AUTH.put('cfg', JSON.stringify(next));
  CFG_CACHE = next;
  CFG_AT = Date.now();
}

function cmpVer(a, b) {
  const x = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const y = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] || 0, q = y[i] || 0;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/**
 * 版本是否低到必须拦下。
 * 返回 null = 放行；返回字符串 = 拦截原因（给用户看的）。
 *
 * 注意这里返回的 reason 一定是 bad_ticket —— 老版本客户端只对
 * revoked / not_granted / bad_ticket 三个暗号真正锁死，别的原因它会软放行。
 * 想让它真的失效，只能用它已经认识的暗号。
 */
function blockOld(cfg, ver, code) {
  if (!cfg.enforceVer) return null;
  const min = cfg.min || {};
  // 不带版本号 = 老客户端（v0.8.0 之前的 check 不带 ver）
  if (!ver) {
    if ((min.code && min.code > 0) || (min.version && min.version !== '0.0.0')) {
      return '请更新到 v' + (min.version || min.code) + ' 后再使用';
    }
    return null;
  }
  if (min.version && cmpVer(ver, min.version) < 0) {
    return '当前版本 v' + ver + ' 已停止使用，请更新到 v' + min.version;
  }
  if (min.code && code && code < min.code) {
    return '当前版本 v' + ver + ' 已停止使用，请更新到 v' + min.version;
  }
  return null;
}

/* ---------------------------------------------------------------- 业务 */

/* ------------------------------------------------------- 安装包托管
 *
 * 为什么把 APK 放这儿：以前发版要手动把包传到某个网盘，再把链接填进
 * 「下载链接」。链接会失效、网盘会限速、有些还会跳广告页，学生点进去
 * 看到一堆「立即下载」按钮不知道点哪个。
 *
 * 现在改成：管理员在 App 里选一个 APK → 直接传到这儿 → 线上配置里的
 * url 自动指向 /v1/apk。学生点「去下载」就是下载这个文件本身，中间
 * 没有任何第三方页面。
 *
 * 存储用 KV 两个键：
 *   apk:meta   {name,size,sha256,ver,code,at}   元信息，几十字节
 *   apk:blob   文件本体（KV 单值上限 25 MiB，够放几个月的安装包）
 *
 * 为什么不放 R2：要额外开一个产品、额外配一个绑定，而且 R2 的自定义域
 * 在国内一样要过 DNS。KV 免费额度对这个体量绰绰有余。
 */

const APK_META = 'apk:meta';
const APK_BLOB = 'apk:blob';
const APK_MAX = 24 * 1024 * 1024;   // 留 1 MiB 余量给 KV 的 25 MiB 上限

async function getApkMeta(env) {
  /* 这里**故意不做内存缓存**，虽然它只有几十字节。
   *
   * 试过一次，随后撤掉了：meta 里的 sha256 是 getApkBlob 的缓存键。
   * 把 meta 缓存在 isolate 里，就等于把一个旧 sha 钉住 —— 旧 sha 命中旧的
   * ArrayBuffer，于是在 isolate 存活期间（几分钟到几小时）**持续发老包**。
   * 用户点「去下载」装回来还是上个版本，而服务端查什么都是对的。
   * 这正是 handleApk 里 cache-control: no-cache 要防的那个 bug，
   * 不能为了省几次小 KV 读自己再开一个同类口子。
   *
   * 代价可接受：每次 /v1/apk 多一次小 KV 读（4 段并发 = 4 次），
   * 但整包字节仍然走下面的 getApkBlob 内存缓存，昂贵的那部分一次都不用重复读。 */
  const raw = await env.AUTH.get(APK_META);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/* 安装包字节的 isolate 内存缓存。
 *
 * 为什么必须有：分段下载把一个 480 KB 的包拆成 4 个 Range 请求，
 * 每个请求都 `AUTH.get(APK_BLOB, 'arrayBuffer')` 就是 4 次 KV 读 + 4 次
 * 把整包读进内存。一轮更新全校几百人 = 几千次 KV 读，免费额度（10 万/天）
 * 一次更新就见底。而包体在发版间隙完全不变，用 sha256 当缓存键，
 * 换了包自然失效（旧的 ArrayBuffer 被 GC 掉）。
 *
 * 500 KB 常驻内存对 Worker 的 128 MB 上限可忽略；只留一份，不按 key 分桶。
 */
let APK_BUF = null;
let APK_BUF_STAMP = '';

async function getApkBlob(env, meta) {
  /* 缓存键不能只用 sha256。历史上有一批包是 `handleUploadApk` 早期版本传的，
   * meta 里没有 sha256，于是 sha === '' → `APK_BUF && sha && ...` 直接短路为假
   * → 缓存永久不命中。而客户端下载走的是 4 段并发 Range（Http.java 的
   * SEGMENTS=4），等于每个安装包要 4 次全量读 KV + 4 份 500 KB 常驻。
   * 改成 size + name + at 一起当指纹，缺 sha 时也能命中。 */
  const m = meta || {};
  const stamp = [m.sha256 || '', m.size || 0, m.name || '', m.at || 0].join('|');
  if (APK_BUF && APK_BUF_STAMP === stamp) return APK_BUF;
  const buf = await env.AUTH.get(APK_BLOB, 'arrayBuffer');
  if (buf) { APK_BUF = buf; APK_BUF_STAMP = stamp; }
  return buf;
}

/**
 * GET /v1/config —— 版本信息，公开，不需要任何凭证
 *
 * 抗打的核心就靠这个：`/v1/config` 是**每个客户端启动都会请求**的，
 * 而绝大多数请求的答案完全一样（版本号、公告、群号，几分钟才变一次）。
 * 走 edgeCache 之后，命中时 Worker 一行业务代码都不执行、KV 一次都不读。
 * 全校几百人同时打开 App，回源的只有每分钟第一个 ——
 * 这才是最省钱的防刷：**让它打不到你**，而不是挡它的包。
 *
 * 为什么是 60 秒而不是一天：管理员发一条公告，最迟一分钟后所有人都能看到。
 * 再长就会出现「我改了他还看不到」的困惑，那个成本比省下的 KV 读高得多。
 * 管理员动了配置会主动清缓存（见 putCfg 之后的 purgeEdge），
 * 所以实际感知是「立即生效」。
 */
async function handleConfig(req, env) {
  /* ignoreQuery：配置对所有人都是同一份，query 不该参与缓存键。
   * 见 edgeCache 里 v1.1.10 的注释 —— 随机 query 绕缓存是能打穿 KV 额度的。 */
  return await edgeCache(req, 60, async () => {
    const c = await getCfg(env);
    return json({
      ok: true,
      latest: c.latest,
      min: c.min,
      maxDev: maxDev(c),
      qq: c.qq,
      notice: c.notice,
      noticeAt: c.noticeAt,
      noticeTitle: c.noticeTitle,
      updPolicy: c.updPolicy,
      enforceVer: !!c.enforceVer,
      // 托管包的信息。客户端用它在「去下载」旁边显示大小，也用来判断
      // 线上配置里的 url 到底是不是我们自己托管的那个。
      apk: await getApkMeta(env),
      ts: now(),
    });
  }, { ignoreQuery: true });
}

/**
 * 清掉某条路径的边缘缓存。
 *
 * 为什么需要：配置/图片列表都有缓存，管理员改完之后如果不清，
 * 他自己刷新也看不到变化，会以为没保存成功——然后反复点，越搞越乱。
 * 用 caches.default.delete 按同样的 key 删。
 *
 * 注意：Pages 那层代理转发过来时 host 是 pages.dev（真实对外域名），
 * 而缓存 key 用的是 Worker 收到的 URL。两层各自有各自的 cache，
 * 所以这里只能清 Worker 这一侧；Pages 侧的透传不写缓存（见 _worker.js），
 * 因此不会留下旧值。
 */
async function purgeEdge(req, pathAndQuery) {
  try {
    const cache = caches.default;
    if (!cache) return;
    const u = new URL(req.url);
    await cache.delete(new Request(u.origin + pathAndQuery, { method: 'GET' }));
  } catch (e) { /* 清缓存失败不影响写操作本身 */ }
}

/**
 * POST /v1/admin/upload?name=xxx.apk&ver=1.0.0&code=100&publish=1&base=https://xxx.pages.dev
 *
 * 请求体是 APK 的原始字节（不是 multipart，不是 base64）。
 * publish=1 时顺手把线上配置的 latest 指向这份文件。
 *
 * 为什么要 base 参数：Worker 的真实域名是 *.workers.dev，国内被 DNS 污染，
 * 学生手机连不上；线上真正对外的是 Pages 那层代理。请求经过代理转发到这里时，
 * request.url 的 origin 已经是 workers.dev 了（代理改写不了它），
 * 如果拿 url.origin 拼下载链接，写进配置的就是一个全校都打不开的地址。
 * 所以由客户端把它实际访问的 BASE 一起传上来；没传才退回 url.origin。
 *
 * 为什么要校验 ZIP 魔数：手机端的文件选择器可能给过来一个 .apk 后缀的
 * 下载失败页面（网盘常见），那种文件装不上，但体积和名字都对，只有
 * 前两个字节不是 'PK'。这里先挡一道，免得发出去一个全校都装不上的包。
 */
async function handleUploadApk(req, env, url) {
  const q = url.searchParams;
  const name = String(q.get('name') || 'app.apk').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const ver = String(q.get('ver') || '').trim();
  const code = parseInt(q.get('code') || '0', 10) || 0;
  const publish = q.get('publish') === '1';
  /* 客户端上报的对外地址（Pages 域名）。只接受 http(s)，并去掉尾部斜杠，
   * 免得被塞进一个 javascript: 之类的东西再原样发给全校。 */
  let base = String(q.get('base') || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(base)) base = url.origin;

  const buf = await req.arrayBuffer();
  if (!buf || buf.byteLength < 1024) {
    return bad('上传的文件太小（' + (buf ? buf.byteLength : 0) + ' 字节），不像是安装包');
  }
  if (buf.byteLength > APK_MAX) {
    return bad('安装包 ' + (buf.byteLength / 1048576).toFixed(1) + ' MB，'
      + '超过单文件 24 MB 上限。请用命令行 tools/deploy_worker.py 上传。');
  }
  const head = new Uint8Array(buf, 0, 4);
  if (!(head[0] === 0x50 && head[1] === 0x4b)) {
    return bad('这不是一个 APK：文件头不是 ZIP（PK）。'
      + '多半是网盘返回的错误页面被存成了 .apk。');
  }

  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const meta = { name: name, size: buf.byteLength, sha256: sha, ver: ver, code: code, at: now() };
  await env.AUTH.put(APK_BLOB, buf);
  await env.AUTH.put(APK_META, JSON.stringify(meta));
  // 刚上传的包直接放进内存缓存，第一批下载的人不用再等一次 KV 大读
  APK_BUF = buf;
  APK_BUF_STAMP = [meta.sha256 || '', meta.size || 0, meta.name || '', meta.at || 0].join('|');

  let latest = null;
  if (publish) {
    const cur = await getCfg(env);
    latest = Object.assign({}, cur.latest, {
      version: ver || cur.latest.version,
      code: code || cur.latest.code,
      // 指向本服务的下载路由。用相对路径不行——客户端拿到的是完整 URL。
      // base 是客户端上报的对外地址（Pages），见函数头注释。
      url: base + '/v1/apk',
      size: buf.byteLength,
      sha256: sha,
    });
    const next = Object.assign({}, cur, { latest: latest });
    await putCfg(env, next);
  }

  await audit(env, 'upload', [], name + ' ' + (buf.byteLength / 1024).toFixed(0) + 'KB '
    + (publish ? 'publish ver=' + ver + ' code=' + code : 'store-only'));
  await purgeEdge(req, '/v1/config');
  return json({ ok: true, apk: meta, latest: latest });
}

/** GET /v1/apk —— 公开下载。就是给「去下载」按钮用的，不需要任何凭证。
 *
 * 为什么要支持 Range（v1.1.4 起）：
 *   2026-11-03 深夜实测：这个链路**单条 TCP 连接被压在 ~300 KB/s 左右**，
 *   而且限制不在我们这边也不在客户端——同一时刻开 4 条并发各下整包，
 *   聚合能到 1.28 MB/s，开 20 条到 6.2 MB/s，单条反而一直是 280~340 KB/s。
 *   即客户端把一个 488 KB 的包拆成几段并发去拉，总耗时能压到原来的 1/N。
 *   而并发分段的前提是服务端能按字节区间返回，所以这里补上 206。
 *
 *   复核（同日稍晚）：换一条出口路径后单流也能到 1.2 MB/s，说明「300 KB/s」
 *   是当时那条链路的上限，不是这条链路的固有属性。所以分段的价值有两面：
 *     ① 上限被人为压低时（校园网、运营商限速、CF 边缘限速）能线性叠加带宽；
 *     ② 无论快慢，断了都能从断点续，不必从头下 480 KB。
 *   客户端（Http.java）按 4 段走，正是①与②的折中。
 *
 *   不支持 Range 的旧版客户端不受影响：不带头就还是原来那条 200 全量路径。
 */
async function handleApk(req, env) {
  const meta = await getApkMeta(env);
  if (!meta) return bad('服务器上还没有安装包', 404);
  const buf = await getApkBlob(env, meta);
  if (!buf) return bad('安装包数据丢了，请重新上传', 404);
  const fn = (meta.name || 'app.apk').replace(/[^\w.\-]/g, '_');
  const total = buf.byteLength || 0;
  const head = {
    'content-type': 'application/vnd.android.package-archive',
    'content-disposition': 'attachment; filename="' + fn + '"',
    /* 必须 no-cache：这个 URL 是固定的 /v1/apk，发新版时 blob 换成新内容，
     * 但 URL 一个字都没变。给它 max-age 就等于让浏览器/中间代理在发版后
     * 最多一整天还发旧包——用户点了「去下载」，装回来还是老版本，
     * 那种 bug 极难查（服务端查什么都是对的）。省那点 KV 读不值得。
     * no-cache 仍然允许存，只是每次回源验一次，Range 重试照样省不了往返，
     * 但至少不会串版本。 */
    'cache-control': 'no-cache',
    'accept-ranges': 'bytes',
    'x-apk-sha256': meta.sha256 || '',
    'x-apk-ver': meta.ver || '',
  };

  const rv = String((req && req.headers.get('range')) || '').trim();
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rv);
  if (m && total > 0) {
    let start;
    let end;
    if (m[1] === '') {
      // "bytes=-500" 最后 500 字节
      if (m[2] === '') return apk416(total, head);
      const n = parseInt(m[2], 10);
      start = Math.max(0, total - n);
      end = total - 1;
    } else {
      start = parseInt(m[1], 10);
      end = (m[2] === '') ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
    }
    if (!isFinite(start) || !isFinite(end) || start > end || start >= total) {
      return apk416(total, head);
    }
    const part = buf.slice(start, end + 1);
    return new Response(part, {
      status: 206,
      headers: Object.assign({}, head, CORS, {
        'content-length': String(end - start + 1),
        'content-range': 'bytes ' + start + '-' + end + '/' + total,
      }),
    });
  }

  return new Response(buf, {
    headers: Object.assign({}, head, CORS, { 'content-length': String(total) }),
  });
}

/** 区间越界 —— 必须带 content-range: bytes * /total，客户端才知道真实长度 */
function apk416(total, head) {
  return new Response(null, {
    status: 416,
    headers: Object.assign({}, head, CORS, {
      'content-range': 'bytes */' + total,
      'content-length': '0',
    }),
  });
}

/** POST /v1/admin/apkdel —— 删掉托管的安装包（配置里的 url 不动） */
async function handleApkDel(req, env) {
  await env.AUTH.delete(APK_BLOB);
  await env.AUTH.delete(APK_META);
  // 内存里还留着整包，不清掉的话删完照样能下（会让人以为没删成功）
  APK_BUF = null;
  APK_BUF_STAMP = '';
  await audit(env, 'apkdel', [], '删除托管安装包');
  return json({ ok: true });
}

/** 管理员学号集合（KV adm: 前缀，数量极少，一次 list 拿完） */
async function adminSet(env) {
  const s = new Set();
  let cursor;
  do {
    const r = await env.AUTH.list({ prefix: 'adm:', cursor: cursor });
    for (const k of r.keys) s.add(k.name.slice(4));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return s;
}

async function isAdminId(env, id) {
  return !!(await env.AUTH.get('adm:' + String(id || '').trim()));
}

/** POST /v1/activate {id, code, fp, ver, tag, akey}
 *
 * akey = 管理口令。**只有存在于 adm: 名单里的学号才需要它**，
 * 普通学生带上也会被忽略。管理员激活不走设备名额，也不要求已开卡。
 */
async function handleActivate(req, env) {
  const b = await req.json().catch(() => null);
  if (!b) return bad('请求体不是合法 JSON');
  const id = String(b.id || '').trim();
  const fp = String(b.fp || '').trim();
  if (!/^\d{6,20}$/.test(id)) return bad('学号格式不对');
  if (!fp) return bad('缺少设备标识');

  const cfg = await getCfg(env);

  // 版本太低：连进都不给，直接让他去更新
  // 版本码字段名是 vcode（v0.9.0 之前客户端误发 code，与激活码同名冲突；
  // 这里两个都收，兼容已发出的旧包）
  const vcode = parseInt(b.vcode != null ? b.vcode : b.code || '0', 10) || 0;
  const blocked = blockOld(cfg, String(b.ver || ''), vcode);
  if (blocked) return json({ ok: false, reason: 'too_old', msg: blocked });

  // 管理员学号：必须提交管理口令，服务端验证通过才发 admin 票据。
  // 这一步是整个权限模型的根：客户端不再有任何「命中常量就放行」的路径。
  if (await isAdminId(env, id)) {
    const ak = String(b.akey || '');
    const want = String(env.ADMIN_KEY || '');
    /* v1.1.9：改走 constEq。原来这里是 `ak.length !== want.length || ak !== want`，
     * 虽然先比长度已经消掉了「按长度逐字节早退」的信息泄露，但比较本身仍是
     * 短路的字符串 `===`，而且这几行是全项目唯一一处没用 constEq 的口令比较 ——
     * 一个文件里两种写法，下次有人抄错一边就会出问题。统一成同一把尺子。 */
    if (!want || ak.length !== want.length || !constEq(ak, want)) {
      return json({ ok: false, reason: 'need_admin_key', msg: '这个学号是管理员账号，需要管理口令才能进入' });
    }
    const expA = now() + 30 * DAY;
    const tkA = await makeTicket(env, id, fp, expA, 'admin');
    await env.AUTH.put('last:' + id, JSON.stringify({ at: now(), fp, ver: b.ver || '', tag: b.tag || '' }), { expirationTtl: 60 * DAY });
    return json({ ok: true, ticket: tkA, exp: expA, role: 'admin', devCount: 1, maxDev: maxDev(cfg) });
  }

  if (await env.AUTH.get('rev:' + id)) {
    /* reason 必须给：客户端要能分清「被管理员停用」和「没开卡」。
     * 两者的自救路径完全不同——停用要等管理员解封，没开卡要去要码。
     * 原来这里只用 bad() 回了句话，没带 reason，前端只能靠字符串匹配中文，
     * 一旦改文案就断。check 接口一直带着 reason，两处对齐。 */
    return json({
      ok: false,
      reason: 'revoked',
      msg: '该学号已被管理员停用，请联系 ' + (cfg.qq ? 'QQ 群 ' + cfg.qq : '管理员'),
    });
  }

  /* v1.1.0：取消激活码。
   *
   * 原来这里有两道关：lic:<id> 有没有开卡、code 是否等于 codeFor(学号)。
   * 两道都删了，原因：
   *   1. 码是 HMAC(内置密钥, 学号)，密钥在 APK 里，反编译就能给任意学号算码，
   *      「谁能用」实际上不可控；
   *   2. 开卡要管理员一个个手输学号，新生一开学就是几百条，纯人力浪费。
   *
   * 身份真实性改由**学校自己**证明：客户端让用户在 App 内的 WebView 里
   * 登录青果教务（青果用学号当登录名），登录页的 input#username 会被读回来
   * 与登记的学号比对，不一致就拒绝同步课表。这比任何离线可算的码都硬，
   * 而且学校一改密码就自动失效。
   *
   * 想恢复白名单（临时限额招新等场景）把 cfg.requireGrant 设为 true 即可，
   * 不用改客户端也不用重新发版。
   */
  if (cfg.requireGrant) {
    const lic = await env.AUTH.get('lic:' + id);
    if (!lic) {
      return json({
        ok: false,
        reason: 'not_granted',
        msg: '这个学号还没有开通。请先联系管理员在后台加入名单。',
      });
    }
  }

  // 设备名额
  const bind = await bindDevice(env, id, fp, String(b.tag || ''), maxDev(cfg));
  if (!bind.ok) {
    return json({
      ok: false,
      reason: 'device_limit',
      msg: '这个学号已绑定 ' + bind.devs.length + ' 台设备（上限 ' + bind.limit + ' 台）。'
        + '换手机请联系管理员解绑后再试。',
      devices: bind.devs.map(d => ({ tag: d.tag, last: d.last })),
    });
  }

  const exp = now() + 30 * DAY;
  const ticket = await makeTicket(env, id, fp, exp);
  /* last: 是「最近一次激活痕迹」，TTL 60 天，也是 /v1/admin/versioncheck
   * 判断「他在用哪个版本」的唯一来源。同样节流：同一台设备 6 小时内重复激活
   * 不再重写，否则每次冷启动都烧一次 KV 写。 */
  const lastStale = bind.isNew || bind.touched;
  if (lastStale) {
    await env.AUTH.put('last:' + id, JSON.stringify({ at: now(), fp, ver: b.ver || '', tag: b.tag || '' }), { expirationTtl: 60 * DAY });
  }
  /* v1.1.1：开卡取消后 idx 没人写，名单页会永远是空的。
   * 改成「谁进来过就记一笔」——这也正是管理员现在想看的：谁在用。
   * 原来只有 handleGrant 写 idx，那条路已经删了。
   *
   * v1.1.8：idx 读不出来（getIdx 返回 null）时**不许**把整张名单覆盖成空的。
   * 记账失败不影响上课，所以这里不抛错，只留一条日志。 */
  try {
    await idxApply(env, [{ id: id, note: '' }], []);
  } catch (e) {
    console.error('激活成功但名单记账失败：', e && e.message);
  }
  return json({ ok: true, ticket: ticket, exp: exp, devCount: bind.devs.length, maxDev: maxDev(cfg) });
}

/** POST /v1/check {id, ticket, fp, ver, code} */
async function handleCheck(req, env) {
  const b = await req.json().catch(() => null);
  if (!b) return bad('请求体不是合法 JSON');
  const id = String(b.id || '').trim();
  const fp = String(b.fp || '').trim();
  if (!/^\d{6,20}$/.test(id)) return bad('学号格式不对');

  const cfg = await getCfg(env);

  // 管理员：只看票据里的 role，不看 lic:（管理员无须开卡）
  if (await isAdminId(env, id)) {
    const t0 = await checkTicket(env, id, fp, b.ticket);
    if (!t0 || t0.role !== 'admin') {
      return json({ ok: false, reason: 'need_admin_key', msg: '管理员登录已过期，请重新输入管理口令' });
    }
    let tk = b.ticket, ex = t0.exp;
    if (t0.exp - now() < 20 * DAY) {
      ex = now() + 30 * DAY;
      tk = await makeTicket(env, id, fp, ex, 'admin');
    }
    return json({ ok: true, ticket: tk, exp: ex, role: 'admin' });
  }

  if (await env.AUTH.get('rev:' + id)) {
    return json({ ok: false, reason: 'revoked', msg: '该学号已被管理员停用' });
  }
  /* v1.1.0：与 handleActivate 一致，开卡记录只在 cfg.requireGrant 时才查 */
  if (cfg.requireGrant && !(await env.AUTH.get('lic:' + id))) {
    return json({ ok: false, reason: 'not_granted', msg: '该学号未开通' });
  }

  // 强制淘汰旧版本。用 bad_ticket 是为了让老客户端真的锁死（它只认这三个）。
  const vcode2 = parseInt(b.vcode != null ? b.vcode : b.code || '0', 10) || 0;
  const blocked = blockOld(cfg, String(b.ver || ''), vcode2);
  if (blocked) {
    return json({ ok: false, reason: 'bad_ticket', too_old: true, msg: blocked });
  }

  const t1 = await checkTicket(env, id, fp, b.ticket);
  if (!t1) {
    return json({ ok: false, reason: 'bad_ticket', msg: '登录凭证无效或已过期，请重新激活' });
  }
  const exp0 = t1.exp;

  // 设备必须仍在名单里（管理员解绑后旧设备立即失效）
  if (!(await hasDevice(env, id, fp))) {
    return json({ ok: false, reason: 'bad_ticket', msg: '这台设备已被解绑，请重新激活' });
  }

  // 滑动续期：剩余不足 20 天就换一张新的
  let ticket = b.ticket, exp = exp0;
  if (exp0 - now() < 20 * DAY) {
    exp = now() + 30 * DAY;
    ticket = await makeTicket(env, id, fp, exp);
  }
  return json({ ok: true, ticket: ticket, exp: exp });
}

/* ---------------------------------------------------------------- 管理员 */

/**
 * 定长时间比较，用于口令。
 *
 * 同文件 `safeEq()` 是给激活码写的（会先 normalizeCode 转大写、去掉分隔符），
 * 拿它比口令会把大小写不同的口令判成相等 —— 这里要的是**逐字节**比较，
 * 且不能因为提前发现不同就早退（`===` 的耗时随匹配前缀长度变化，理论上
 * 可以被测出来）。
 */
function constEq(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

function isAdmin(req, env) {
  const k = req.headers.get('x-admin-key') || '';
  return !!env.ADMIN_KEY && constEq(k, env.ADMIN_KEY);
}

/** 管理员名单管理（本身也受 x-admin-key 保护） */
async function handleAdmins(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  const act = String(b.act || 'list');

  if (act === 'list') {
    const s = await adminSet(env);
    return json({ ok: true, ids: [...s] });
  }
  if (!ids.length) return bad('没有合法学号');
  /* v1.1.8：audit 原来写在循环里 —— 批量加 20 个管理员会读改写整张审计表 20 次，
   * 还把同一个 ids 数组重复写 20 遍，日志里出现 20 条一模一样的记录。
   * 同文件 handleGrant / handleRevoke / handleUngrant 都是放在循环外的，这里漏了。 */
  for (const id of ids) {
    if (act === 'add') await env.AUTH.put('adm:' + id, '1');
    else if (act === 'del') await env.AUTH.delete('adm:' + id);
    else return bad('act 只能是 add / del / list');
  }
  await audit(env, 'admin_' + act, ids, '');
  const s = await adminSet(env);
  return json({ ok: true, ids: [...s] });
}

/** 给所有已开卡的人重新发一张 role='' 的票据不会生效——票据是客户端存的，
 *  所以吊销管理员身份靠「把 adm: 删掉」：下次 check 会走学生分支，
 *  lic: 里没有他就直接 not_granted。这里只负责名单本身。 */

function idList(b) {
  const raw = Array.isArray(b && b.ids) ? b.ids.slice() : [];
  if (typeof (b && b.ids) === 'string') raw.push.apply(raw, b.ids.split(/[\s,，;；、]+/));
  return raw.map(s => String(s).trim()).filter(s => /^\d{6,20}$/.test(s));
}

/** POST /v1/admin/grant {ids:[...]} —— 开卡（允许激活） */
async function handleGrant(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  const out = [];
  for (const id of ids) {
    await env.AUTH.put('lic:' + id, JSON.stringify({ at: now(), note: String(b.note || '') }));
    await env.AUTH.delete('rev:' + id);   // 开卡顺带解封
    out.push({ id: id, code: await codeFor(env.SECRET, id) });
  }
  /* v1.1.8：名单索引一次读写搞定。原来是循环里逐个 idxAdd，
   * 开 20 个人 = 20 次整表读 + 20 次整表写，且并发时后写的会盖掉先写的。 */
  await idxApply(env, ids.map(id => ({ id: id, note: String(b.note || '') })), []);
  await audit(env, 'grant', ids);
  return json({ ok: true, count: out.length, rows: out });
}

/** POST /v1/admin/revoke {ids:[...]} —— 踢人（立刻失效） */
async function handleRevoke(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  for (const id of ids) {
    await env.AUTH.put('rev:' + id, '1');
    await env.AUTH.delete('dev:' + id);
  }
  await audit(env, 'revoke', ids);
  return json({ ok: true, count: ids.length });
}

/** POST /v1/admin/ungrant {ids:[...]} —— 收回卡（不拉黑，但激活不了） */
async function handleUngrant(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  for (const id of ids) {
    await env.AUTH.delete('lic:' + id);
    await env.AUTH.delete('dev:' + id);
    // 顺带解封：否则一个曾被停用的人收回卡后会永远显示「已被管理员停用」，
    // 管理者看到的原因提示是错的。
    await env.AUTH.delete('rev:' + id);
  }
  // v1.1.8：同上，名单索引一次读写。
  await idxApply(env, [], ids);
  await audit(env, 'ungrant', ids);
  return json({ ok: true, count: ids.length });
}

/** POST /v1/admin/unrevoke {ids:[...]} —— 解封 / 重新启用
 *
 * 与 grant 的区别，也是这个接口存在的全部理由：
 *   grant     = 开卡 + 解封 + 重置设备名额。适用于「从没开通过」或「要连码
 *               一起重新发」的人，副作用是会改写 idx 里的开卡时间和备注。
 *   unrevoke  = **只**删掉 rev:，一个字节都不碰 lic: / idx / dev:。
 *
 * 原来的毛病：停用之后想恢复，只能去点「开通」，而开通会顺手清设备、改开卡
 * 时间、覆盖备注——管理员只是想解个封，却把这人当新人重置了一遍，名单上
 * 的开卡时间也变成今天，回溯记录失真。
 *
 * revoke 时已经清掉了 dev:，所以解封后对方仍需在手机上重新激活一次
 * （绑定名额从 0 起算），这是刻意的：停用期间谁在别处拿到码都不算数。
 */
async function handleUnrevoke(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  const out = [];
  for (const id of ids) {
    const wasRev = !!(await env.AUTH.get('rev:' + id));
    await env.AUTH.delete('rev:' + id);
    // 没有开卡记录的人「解封」等于什么都没做，如实告诉管理员，
    // 免得他以为解封了、对方却仍然激活不了（那种情况要开卡，不是解封）。
    const hasLic = !!(await env.AUTH.get('lic:' + id));
    out.push({ id: id, wasRevoked: wasRev, granted: hasLic });
  }
  await audit(env, 'unrevoke', ids);
  return json({ ok: true, count: ids.length, rows: out });
}

/** POST /v1/admin/revoke-device {id, fp} —— 只踢掉某一台设备
 *
 * 设备页上「这台解绑」用。原来的 unbind 只能整人清空，
 * 而管理员真正想做的常常只是「把那台不该在的机器拿掉」，
 * 留着同一学号的其他机器不动。
 */
async function handleRevokeDevice(req, env) {
  const b = await req.json().catch(() => ({}));
  const id = String((b && b.id) || '').trim();
  const fp = String((b && b.fp) || '').trim();
  if (!/^\d{6,20}$/.test(id)) return bad('学号格式不对');
  if (!fp) return bad('缺少设备标识');
  const list = await getDevs(env, id);
  // 前端拿到的是截断过的 8 位指纹（不把完整指纹下发到界面），
  // 所以这里允许前缀匹配。
  const next = list.filter(d => String(d.fp || '').indexOf(fp) !== 0);
  if (next.length === list.length) return bad('没找到这台设备（可能已被解绑）');
  await putDevs(env, id, next);
  await audit(env, 'revoke-device', [id], fp.slice(0, 8));
  return json({ ok: true, id: id, devCount: next.length });
}

/** POST /v1/admin/unbind {ids:[...]} —— 解绑设备（只清设备，不动开卡状态） */
async function handleUnbind(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  for (const id of ids) await env.AUTH.delete('dev:' + id);
  await audit(env, 'unbind', ids);
  return json({ ok: true, count: ids.length });
}

/** POST /v1/admin/devices {id} —— 查某学号绑了哪些设备 */
async function handleDevices(req, env) {
  const b = await req.json().catch(() => ({}));
  const id = String((b && b.id) || '').trim();
  if (!/^\d{6,20}$/.test(id)) return bad('学号格式不对');
  const list = await getDevs(env, id);
  return json({
    ok: true, id: id, count: list.length,
    rows: list.map(d => ({ fp: d.fp ? d.fp.slice(0, 8) : '', tag: d.tag || '', at: d.at, last: d.last })),
  });
}

/** GET /v1/admin/list —— 已开卡名单（走 idx 索引，子请求数恒定） */
async function handleList(env) {
  const idx = await getIdx(env);
  /* v1.1.8：getIdx 现在用 null 表示「读到了但坏了」。这里必须如实报错 ——
   * 原来会把损坏的 idx 当成空表，界面显示「名单是空的」，
   * 管理员可能真跑去改 KV，把好数据也毁掉。 */
  if (idx === null) return bad('名单索引读不出来（KV 里的 idx 值损坏）。为了不覆盖真实数据，本次没有做任何写入。请到 Cloudflare KV 检查 idx 这个键。', 500);
  const rev = await revokedSet(env);
  const rows = idx.map(e => ({
    id: e.id, at: e.at || 0, note: e.note || '',
    revoked: rev.has(e.id),
  }));
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return json({ ok: true, count: rows.length, revokedCount: rev.size, rows: rows });
}

/** POST /v1/admin/state {ids:[...]} —— 批量查单个学号的完整状态
 *
 * 名单页点「详情」时用：开卡时间、是否停用、绑了几台设备、最近一次激活痕迹。
 * 一次请求搞定，避免前端串行发 4 个请求。
 */
async function handleState(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  /* v1.1.8：每个学号 4 次子请求，免费版上限 50 次 → 超过 12 个学号就必抛。
   * 「详情」按钮是单人查询，本该只查一两个，但接口层不该假设调用方守规矩。 */
  const CAP = 10;
  const use = ids.slice(0, CAP);
  const rows = [];
  for (const id of use) {
    const lic = await env.AUTH.get('lic:' + id);
    const rev = await env.AUTH.get('rev:' + id);
    const devs = await getDevs(env, id);
    let last = null;
    try { last = JSON.parse(await env.AUTH.get('last:' + id) || 'null'); } catch (e) {}
    /* lic: 的 JSON.parse 原来没有 try —— 一条脏记录会让整个接口 500，
     * 管理员看到的是「服务端忙」，压根不知道是哪个学号坏了。 */
    let licAt = 0;
    if (lic) { try { licAt = JSON.parse(lic).at || 0; } catch (e) { licAt = 0; } }
    rows.push({
      id: id,
      granted: !!lic,
      at: licAt,
      revoked: !!rev,
      devCount: devs.length,
      devices: devs.map(d => ({ fp: (d.fp || '').slice(0, 8), tag: d.tag || '', at: d.at, last: d.last })),
      last: last,
    });
  }
  return json({
    ok: true, rows: rows, maxDev: maxDev(await getCfg(env)),
    truncated: ids.length > use.length, total: ids.length,
  });
}

/** POST /v1/admin/codes {ids:[...]} —— 只算码，不改任何状态
 *
 * 给「我已经开过卡，现在只是重新抄一份码」的场景。
 */
async function handleCodes(req, env) {
  const b = await req.json().catch(() => ({}));
  const ids = idList(b);
  if (!ids.length) return bad('没有合法学号');
  const rows = [];
  for (const id of ids) rows.push({ id: id, code: await codeFor(env.SECRET, id) });
  return json({ ok: true, count: rows.length, rows: rows });
}

/* ---------------------------------------------------------------- 操作日志
 *
 * 管理动作不可撤销（比如强制淘汰会让全校打不开），所以每次都要留痕。
 * 只保留最近 200 条，够回溯「我什么时候点了什么」。
 */

const AUDIT_MAX = 200;

async function audit(env, act, ids, extra) {
  try {
    const raw = await env.AUTH.get('audit');
    let arr = [];
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) arr = a; } catch (e) {} }
    arr.unshift({ at: now(), act: act, ids: (ids || []).slice(0, 20), n: (ids || []).length, extra: extra || '' });
    if (arr.length > AUDIT_MAX) arr = arr.slice(0, AUDIT_MAX);
    await env.AUTH.put('audit', JSON.stringify(arr));
  } catch (e) { /* 留痕失败不能阻断业务 */ }
}

/** GET /v1/admin/audit —— 最近的管理动作 */
async function handleAudit(env) {
  const raw = await env.AUTH.get('audit');
  let arr = [];
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) arr = a; } catch (e) {} }
  return json({ ok: true, count: arr.length, rows: arr });
}

/** POST /v1/admin/config {latest, min, notice, maxDev, enforceVer, qq} */
async function handleSetCfg(req, env) {
  const b = await req.json().catch(() => ({}));
  if (!b) return bad('请求体不是合法 JSON');
  const cur = await getCfg(env);

  /* 公告发布时间戳的处理：
   *   noticeAt 显式传 0  → 清空公告（新手管理员想撤掉一条）
   *   正文变了           → 自动刷新为当前时间，让所有人重新看到一次
   *   正文没变           → 保留原值，不打扰已经看过的人
   * 这样「发一次公告」和「撤掉公告」都不需要管理员操心时间戳。
   *
   * v1.1.15：`b.noticeAt` 现在**只认 0 这一个特殊值**，其它一律忽略、由服务端算。
   * 原来只要带了 noticeAt 就用它，优先级还高于「正文是否变化」。
   * 于是管理前端把 `GET /v1/config` 的整个对象回写时（`{...cfg, notice:'新公告'}`），
   * noticeAt 沿用旧值、正文变了时间戳没变 —— 客户端「这一版我看过」的判断
   * 依旧成立，学生永远看不到这条新公告，而管理员界面显示「保存成功」。
   * 前端的 sendNotice 现在传的 `noticeAt = now()` 也落在「被忽略」这条路上，
   * 但正文同时变了，服务端算出来的还是 now()，结果一致；
   * 而 clearNotice 传的 0 仍然生效。唯一失去的能力是「不改正文、硬把时间戳
   * 往前挪一点」这种强行重发 —— 那句需求应该改正文（哪怕加一个字）。 */
  let noticeAt = cur.noticeAt || 0;
  const newNotice = b.notice === undefined ? cur.notice : String(b.notice);
  const newTitle = b.noticeTitle === undefined ? cur.noticeTitle : String(b.noticeTitle);
  const bodyChanged = (newNotice !== cur.notice || newTitle !== cur.noticeTitle);
  if (b.noticeAt !== undefined && (parseInt(b.noticeAt, 10) || 0) === 0) {
    noticeAt = 0;                                  // 显式清空
  } else if (bodyChanged) {
    noticeAt = newNotice ? now() : 0;
  }

  /* v1.1.15：maxDev 不再静默回退。
   * 原来写的是 `parseInt(b.maxDev, 10) || cur.maxDev` —— 两个静默失败叠在一起：
   *   · 管理员想「临时把所有人锁成 0 台设备」时 `0 || cur` 回退成原值，
   *     界面显示保存成功，实际一点没变；
   *   · 传 `"abc"` 同样静默回退，没有任何提示。
   * 现在非法值直接拒，0 允许（但下面 maxDev() 的语义是 `0 视为未配置`，
   * 所以这里也明确拒 0，告诉管理员「至少 1 台」——两处口径对齐，
   * 免得出现「保存了 0、实际还是 3」这种看起来像 bug 的行为）。 */
  let nextMaxDev = cur.maxDev;
  if (b.maxDev !== undefined) {
    const n = parseInt(b.maxDev, 10);
    if (!isFinite(n) || isNaN(n)) return bad('设备上限必须是数字');
    if (n < 1 || n > 10) return bad('设备上限要在 1-10 之间');
    nextMaxDev = n;
  }

  const next = {
    latest: Object.assign({}, cur.latest, b.latest || {}),
    min: Object.assign({}, cur.min, b.min || {}),
    notice: newNotice,
    noticeAt: noticeAt,
    noticeTitle: newTitle,
    qq: b.qq === undefined ? cur.qq : String(b.qq),
    maxDev: nextMaxDev,
    enforceVer: b.enforceVer === undefined ? cur.enforceVer : !!b.enforceVer,
    updPolicy: b.updPolicy === 'once' ? 'once' : (b.updPolicy === 'nag' ? 'nag' : cur.updPolicy),
    requireGrant: b.requireGrant === undefined ? cur.requireGrant : !!b.requireGrant,
  };

  /* 安全联锁：强制淘汰一旦生效，被挡的人只能靠自己下载新版进来。
   *   如果下载链接和 QQ 群号都没配，等于把人锁在门外——这是不可恢复的事故，
   *   管理员事后改配置也要等对方能联网才行（离线时客户端会放行，但一旦联网
   *   就再也进不去了）。所以这种组合直接拒绝，不给「保存成功」的假象。
   * 注意 min.code > 0 才算真的会拦人；min.code = 0 时 enforceVer 是空转。 */
  const minCodeNum = parseInt((next.min && next.min.code) || 0, 10) || 0;
  if (next.enforceVer && minCodeNum > 0) {
    const hasUrl = !!(next.latest && String(next.latest.url || '').trim());
    const hasQq = !!String(next.qq || '').trim();
    if (!hasUrl && !hasQq) {
      return bad('不能开启强制淘汰：下载链接和 QQ 群号都是空的，'
        + '被拦下的用户将没有任何办法拿到新版本。请至少填一个。');
    }
  }

  await putCfg(env, next);
  // 边缘缓存里还躺着旧配置，不清掉管理员自己都要等一分钟才看到生效
  await purgeEdge(req, '/v1/config');
  await audit(env, 'config', [],
    'enforceVer=' + next.enforceVer + ' min.code=' + (next.min && next.min.code)
    + ' noticeAt=' + next.noticeAt + ' updPolicy=' + next.updPolicy);
  return json({ ok: true, cfg: next });
}

/**
 * POST /v1/admin/versioncheck —— 强制淘汰前的「预演」。
 *
 * 回答一个问题：如果现在把 min.code 抬到 N，会有多少人被挡住、他们装的是什么版本。
 * 读 last:<id> 是有 TTL 60 天的最近激活记录，里面带 ver 和机型。
 *
 * 为什么需要这个：强制淘汰是不可逆的门——被挡住的人如果自己下不到新版，
 * 就再也进不来了。管理员按下那个勾之前应该先看一眼「还有几个人在旧版上」。
 */
async function handleVersionCheck(req, env) {
  const b = await req.json().catch(() => ({}));
  const minCode = parseInt(b.minCode || 0, 10) || 0;
  const minVer = String(b.minVersion || '');
  const idx0 = await getIdx(env);
  if (idx0 === null) return bad('名单索引读不出来，先修好 idx 再预演。', 500);
  const rev = await revokedSet(env);

  /* v1.1.8 修两处：
   *   ① idx 里的元素是 {id, at, note} 对象，原来写 `for (const id of idx)`
   *      直接把对象当学号用 —— rev.has(对象) 恒 false、'last:'+对象 变成
   *      'last:[object Object]'，于是「已停用」判定和「谁会被挡住」全错，
   *      前端还渲染出 [object Object]。这个接口存在的唯一意义（开强制淘汰
   *      前先预演）因此完全失效。
   *   ② 每个学号 1 次子请求，免费版上限 50 次 —— 名单一过 50 人这里必抛，
   *      管理员在最需要这个信息的时候拿不到。改成只查前 CAP 个并如实报告
   *      truncated，让他知道这次结果不是全量。 */
  const CAP = 40;
  const all = idx0.filter(e => e && e.id);
  const use = all.slice(0, CAP);

  const blocked = [];
  const unknown = [];
  let checked = 0;
  for (const e of use) {
    const id = e.id;
    if (rev.has(id)) continue;           // 已停用的不算，他们本来就用不了
    const raw = await env.AUTH.get('last:' + id);
    checked++;
    if (!raw) { unknown.push({ id: id }); continue; }
    let info = {};
    try { info = JSON.parse(raw); } catch (x) {}
    const ver = String(info.ver || '');
    const code = parseInt(info.code || 0, 10) || 0;
    let willBlock = false;
    if (minVer && ver && cmpVer(ver, minVer) < 0) willBlock = true;
    if (minCode && code && code < minCode) willBlock = true;
    if (minVer && !ver) willBlock = true;  // 不带版本号 = 更老的客户端
    if (willBlock) blocked.push({ id: id, ver: ver || '(太旧，没上报)', tag: info.tag || '', at: info.at || 0 });
  }

  /* unknown：从来没联网激活过（或 last 已过 TTL）。他们对 min 的影响未知，
   * 但下次联网激活时同样会被 blockOld 拦下，所以也要提醒。 */
  return json({
    ok: true, minCode, minVersion: minVer,
    checked, blocked, unknown,
    truncated: all.length > use.length, total: all.length,
  });
}

/** GET /v1/admin/code?id=xxx —— 按需算码（不想在 App 里算时用） */
async function handleCode(url, env) {
  const id = String(url.searchParams.get('id') || '').trim();
  if (!/^\d{6,20}$/.test(id)) return bad('学号格式不对');
  return json({ ok: true, id: id, code: await codeFor(env.SECRET, id) });
}

/* ================================================================
 * 防刷 / 抗打
 *
 * 先说清楚能做什么、不能做什么，免得以后有人以为这里挡住了 DDoS：
 *
 *   Cloudflare 已经挡掉了绝大部分「打进来」的流量（L3/L4 和大部分 L7 洪水）。
 *   一个 Worker 能感知到的攻击，基本只剩两类：
 *     ① **你自己接口的放大效应** —— 一个便宜请求触发一次昂贵的 KV 读/写。
 *        这是最致命的：KV 免费额度是 10 万读 + 1 千写/天，写尤其少。
 *        被人刷 1000 次写，当天管理接口就全废了；刷光读额度，全校连
 *        /v1/config 都拿不到，App 直接打不开。
 *     ② **单个客户端反复重试** —— 客户端 bug、脚本、手抖连点。
 *
 *   所以这里的策略是按「成本」分层，而不是一视同仁地计数：
 *
 *   A. 便宜请求（GET /v1/config、/v1/apk）→ **靠边缘缓存**解决，不靠限流。
 *      见 handleConfig / handleApk 的 cache-control。缓存命中时 Worker 压根不执行。
 *   B. 中等请求（/v1/activate、/v1/check）→ 内存计数，超了就 429。
 *   C. 昂贵请求（上传图片、发表留言、管理员写配置）→ 内存计数 + 硬上限 + 体积限制。
 *
 *   为什么不用 KV 做计数器：**KV 写是按次计费的，每天只有 1000 次免费**。
 *   用 KV 记数等于把「防刷」本身变成刷。内存计数器会随 isolate 重启丢失，
 *   但 isolate 是按机房分布的、生命周期以分钟计，真正被刷时每个机房各自
 *   挡一部分，效果足够，成本为零。
 * ================================================================ */

/* 限流主键的选择（这条踩过坑，写在最前面）：
 *
 * 一开始全部按 IP 分桶，上线才发现两个问题叠在一起：
 *   ① Pages 反代把学生 IP 丢了（见 clientIp 的注释），全校共用一个桶；
 *   ② 就算修好①，学校/运营商 NAT 后面仍然是几百人共用一个出口 IP。
 * 两者任一成立，按 IP 限流都会变成「全校共用额度」——第 21 台设备激活
 * 就被 429，留言一天全校只能发 5 条。这不是限流，是禁用。
 *
 * 所以现在的分层是：
 *   · **写操作按 fp（设备指纹）计数**，fp 是一台设备一个，天然可分。
 *     普通接口拿不到 fp 的（GET），才退回 IP。
 *   · **IP 只做粗粒度兜底**，阈值放到「一个班同时用都不会碰到」的量级，
 *     用来挡单个脚本狂刷，不用来约束正常用户。
 *
 * 额度按「便宜/昂贵」分：便宜接口额度宽，昂贵接口（要写 KV 的）额度紧。 */

const RL = new Map();          // key -> {n, resetAt}
const RL_MAX = 4000;           // 上限，防止 key 无限增长（内存也是资源）

/* 真实客户端 IP。
 *
 * ⚠️ 这里有个坑，是上线后才发现的，写下来免得以后有人「优化」掉：
 *
 * 学生走的是 https://xxmu-auth.pages.dev（Pages 反代），不是直连 Worker。
 * Pages Functions 转发时是**从 Cloudflare 内网发起的新请求**，到了 Worker
 * 这边 `cf-connecting-ip` 变成了 Cloudflare 自己的地址（实测
 * `2a06:98c0:3600::103`），学生手机的 IP 完全丢失。
 *
 * 后果不是「限流偏严」而是「限流彻底失效」：全校共用一个桶，
 * 第 21 台设备激活就被 429，留言一天全校只能发 5 条。这种 bug 在
 * 单人测试里永远发现不了，因为一个人怎么测都在阈值之内。
 *
 * 所以 Pages 那一层用一个标记头把真实 IP 带过来（见 pages/dist/_worker.js 的
 * IP_TAG）。这里只在标记头对得上时才信它 —— 标记头是明文，能自己构造请求的
 * 人照样能伪造，IP 限流本来也只挡无脑脚本；真正兜底的是 fp 限流和
 * KV 条数硬上限。 */
const PROXY_TAG = 'xxmu-pages-proxy-v1';

function clientIp(req) {
  try {
    if (req.headers.get('x-xxmu-via') === PROXY_TAG) {
      const real = String(req.headers.get('x-xxmu-ip') || '').trim();
      if (real) return real;
    }
  } catch (e) {}
  return (req.headers.get('cf-connecting-ip') || '').trim() || '0.0.0.0';
}

/** 限流主键：优先用设备指纹，没有才退回 IP。
 *  fp 是客户端按安装生成的 32 位十六进制串，服务端只做格式校验、不做认证。 */
function rlKey(req, prefix, fp) {
  const f = String(fp || '').trim();
  if (/^[0-9a-f]{16,64}$/i.test(f)) return prefix + ':fp:' + f;
  return prefix + ':ip:' + clientIp(req);
}

/**
 * 计数一次。返回 true 表示「还行」，false 表示「超了」。
 * @param key    桶名（不同接口必须用不同桶，否则互相挤额度）
 * @param limit  窗口内允许的次数
 * @param winMs  窗口长度
 */
function rlHit(key, limit, winMs) {
  const t = Date.now();
  if (RL.size > RL_MAX) {
    /* 先清过期的；清完还超就**淘汰最早的**，不能 RL.clear()。
     *
     * 原来这里是 `RL.clear()`：攻击者只要用随机 fp 把表撑到 4000 条，
     * 就能把所有正在计数的 key（包括他自己刚被拒的那些）配额一起归零，
     * 等于每次撑满表都换到一轮全新的配额 —— 把防御变成了助攻。 */
    for (const [k, v] of RL) if (v.resetAt <= t) RL.delete(k);
    while (RL.size > RL_MAX) {
      const first = RL.keys().next();
      if (first.done) break;
      RL.delete(first.value);
    }
  }
  let v = RL.get(key);
  if (!v || v.resetAt <= t) { v = { n: 0, resetAt: t + winMs }; RL.set(key, v); }
  v.n++;
  return v.n <= limit;
}

/** 请求体太大就早退，避免把 20 MB 读进内存再判断 */
function tooBig(req, maxBytes) {
  const cl = req.headers.get('content-length');
  if (cl) {
    const n = parseInt(cl, 10) || 0;
    if (n > maxBytes) return n;
  }
  return 0;
}

/** 读 JSON 体，带大小上限。超限或不是 JSON 返回 null。 */
async function readJson(req, maxBytes) {
  const big = tooBig(req, maxBytes);
  if (big) return null;
  const buf = await req.arrayBuffer().catch(() => null);
  if (!buf || buf.byteLength > maxBytes) return null;
  try { return JSON.parse(new TextDecoder().decode(buf)); } catch (e) { return null; }
}

/** 图片魔数校验：只收 JPEG / PNG / WebP。返回格式名或空串。 */
function imageKind(bytes) {
  if (!bytes || bytes.length < 12) return '';
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return '';
}

/** 取 JPEG/PNG 的宽高，只为了给前端预留版面（避免加载时跳动）。
 *  读不出来就返回 0，前端按方形兜底，不影响功能。 */
function imageSize(bytes, kind) {
  try {
    if (kind === 'png') {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { w: dv.getUint32(16), h: dv.getUint32(20) };
    }
    if (kind === 'jpeg') {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const m = bytes[i + 1];
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        // SOF0..SOF15，排除 DHT(C4)/JPG(C8)/DAC(CC)
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { w: (bytes[i + 7] << 8) | bytes[i + 8], h: (bytes[i + 5] << 8) | bytes[i + 6] };
        }
        i += 2 + len;
      }
    }
  } catch (e) {}
  return { w: 0, h: 0 };
}

/** 生成短 key：时间戳 36 进制 + 随机，够用且按字典序大致递增 */
function shortKey(prefix) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36) + rnd;
}

/** 文本清洗：去控制字符、压空白、截断。用户输入一律当纯文本，绝不拼 HTML。 */
function cleanText(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

/* ---------------------------------------------------------------- 校园图片 */

const PHOTO_MAX = 1600 * 1024;      // 单张 1.6 MB —— 手机直出压过的照片都在这个量级以下
const PHOTO_CAP = 600;              // 索引里最多存多少张（含待审），防止无上限膨胀
const PHOTO_IDX = 'ph:idx';

async function getPhotoIdx(env) {
  const raw = await env.AUTH.get(PHOTO_IDX);
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
async function putPhotoIdx(env, list) {
  await env.AUTH.put(PHOTO_IDX, JSON.stringify(list.slice(0, PHOTO_CAP)));
}

/**
 * GET /v1/photos —— 公开，只返回**已审核通过**的图片元信息。
 *
 * 故意不带图片字节：一张 300 KB 的图 base64 进 JSON 就是 400 KB，
 * 一次列表请求能吃掉十几兆流量。字节走 /v1/photo?k=，那条可以长缓存。
 */
async function handlePhotos(req, env) {
  return await edgeCache(req, 120, async () => {
    const idx = await getPhotoIdx(env);
    const rows = idx
      .filter(x => x.st === 'a')
      .map(x => ({ k: x.k, cap: x.cap || '', w: x.w || 0, h: x.h || 0, at: x.at || 0 }));
    rows.sort((a, b) => b.at - a.at);
    return json({ ok: true, count: rows.length, rows: rows });
  }, { ignoreQuery: true });
}

/** GET /v1/photo?k=xxx —— 图片本体。只在审核通过后公开。 */
async function handlePhoto(req, url, env) {
  const k = String(url.searchParams.get('k') || '').trim();

  /* v1.1.10：k 的格式校验也放进缓存键的计算里。
   *
   * 原来格式不对就直接 bad(404) 返回，不经过 edgeCache —— 于是
   * `/v1/photo?k=<随机>` 每次都真进 Worker、每次都不读 KV 但照样
   * 消耗一次请求额度。更糟的是格式对但图不存在（`p` + 随机字符）
   * 那条路会走 producer、每次读一遍 ph:idx，实测 12 次随机 k = 12 次回源。
   *
   * 现在两条路都进 edgeCache：正常 k 用 k 做缓存键，非法 k 归到同一个
   * 负缓存键上（反正结果都是 404），配 negTtl 让同一个假 k 只花一次。 */
  const valid = /^p[0-9a-z]{6,32}$/.test(k);
  const qk = valid ? ('?k=' + k) : '?k=!invalid';
  if (!valid) {
    return await edgeCache(req, 0, async () => bad('图片编号不对', 404),
      { queryKey: qk, negTtl: 60 });
  }

  /* 图片字节是抗打的重点：一张 300 KB 的图被全校反复看，
   * 每次都回源读 KV 就是灾难。k 按上传时间生成、内容永不变，
   * 缓存一年都不会过期——这一类内容缓存收益最大。
   *
   * **审核状态检查必须放在 producer 里面，不能放在外面。**
   * 原来这里是在 edgeCache 之前先 `getPhotoIdx()` 查一遍 st==='a'，
   * 结果是：图片字节命中缓存了，但每一次看图仍然要读一次 `ph:idx`
   * ——全校刷一次 WIKI 就是几百次 KV 读，缓存等于白做。
   * 放进去之后缓存命中就完全不碰 KV。
   *
   * 那「管理员下架后缓存里还是旧图」怎么办？`handleAdminPhotoAct`
   * 每一次审核动作都会 purgeEdge 这两条路径，所以不会留下旧值。
   */
  return await edgeCache(req, 86400 * 30, async () => {
    const idx = await getPhotoIdx(env);
    const hit = idx.filter(x => x.k === k)[0];
    if (!hit || hit.st !== 'a') return bad('没有这张图片', 404);

    const buf = await env.AUTH.get('ph:' + k, 'arrayBuffer');
    if (!buf) return bad('图片已丢失', 404);
    const kind = imageKind(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
    const type = kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg';
    return new Response(buf, {
      headers: {
        'content-type': type,
        'access-control-allow-origin': '*',
      },
    });
  }, { queryKey: qk, negTtl: 60, costLimit: 120 });
}

/**
 * POST /v1/photo?cap=说明&id=学号 —— 学生上传校园图片，**进待审队列**。
 *
 * 为什么必须待审：这是唯一一个「学生可以把任意内容显示给全校」的入口。
 * 不审等于把一块可以贴任何图的公告板交出去，出了问题第一个被找的是开发者。
 *
 * 限流分三层：
 *   ① 同一**设备** 10 分钟内最多 3 张（防脚本刷）
 *   ② 索引总量上限 PHOTO_CAP（防 KV 被撑爆）
 *   ③ 待审队列超过 40 张时**直接拒收**，而不是继续堆
 *      —— 管理员不看的话队列只会越堆越长，最后谁都不愿意翻；
 *         拒收会逼着上传者等，也让管理员看到「该清了」。
 */
async function handlePhotoUpload(req, url, env) {
  /* 额度按设备算（见 rlKey 的注释）：一台设备 10 分钟最多 3 张。
   * 用 IP 的话，一个班同时上传就会互相挤掉。 */
  const fp = String(url.searchParams.get('fp') || '').trim();
  if (!rlHit(rlKey(req, 'ph', fp), 3, 10 * 60 * 1000)) {
    return bad('上传太频繁了，10 分钟内最多传 3 张，等一会儿再试。', 429);
  }

  const big = tooBig(req, PHOTO_MAX);
  if (big) return bad('图片太大（' + (big / 1048576).toFixed(1) + ' MB），请先压缩到 1.5 MB 以内');

  const buf = await req.arrayBuffer().catch(() => null);
  if (!buf || buf.byteLength < 1024) return bad('图片太小或没读上来');
  if (buf.byteLength > PHOTO_MAX) {
    return bad('图片 ' + (buf.byteLength / 1048576).toFixed(1) + ' MB，超过 1.5 MB 上限');
  }

  const bytes = new Uint8Array(buf);
  const kind = imageKind(bytes);
  if (!kind) return bad('这不像图片文件（只收 JPEG / PNG / WebP）');

  const idx = await getPhotoIdx(env);
  const pending = idx.filter(x => x.st === 'p').length;
  if (pending >= 40) return bad('待审核的图片已经排了 40 张，等管理员看完再传吧。');
  if (idx.length >= PHOTO_CAP) return bad('图库满了，等管理员清理一些再传。');

  const id = String(url.searchParams.get('id') || '').trim();
  const cap = cleanText(url.searchParams.get('cap') || '', 60);
  const k = shortKey('p');
  const size = imageSize(bytes, kind);

  await env.AUTH.put('ph:' + k, buf);

  /* 索引是「读-改-写」的单文档，KV 无事务：两个人同时上传时，
   * 各自读到旧表、各自 unshift、各自整键覆盖 —— 后写的把先写的整条抹掉。
   * 那个被抹掉的 ph:<k> 就变成永久孤儿：学生看到「已提交待审」，
   * 管理员审核页里根本没有这张图。
   *
   * 这里用「写完读回来自查」收窄窗口：put 之后再读一次索引，
   * 确认自己的 k 还在；不在就重做一次（最多两轮）。
   * 彻底解决要靠 Durable Object 或分片索引，对这个量级的应用不划算。
   * 兜底是 handleAdminPhotos 里的孤儿清理（act:'orphan'）。 */
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    const fresh = await getPhotoIdx(env);
    if (!fresh.some(x => x.k === k)) {
      fresh.unshift({
        k: k, at: now(), id: /^\d{6,20}$/.test(id) ? id : '',
        cap: cap, w: size.w, h: size.h, st: 'p',
      });
      if (fresh.length > PHOTO_CAP) fresh.length = PHOTO_CAP;
      await putPhotoIdx(env, fresh);
    }
    const back = await getPhotoIdx(env);
    ok = back.some(x => x.k === k);
  }
  if (!ok) return bad('这张图传上去了但索引没写进去，请重试一次。');

  return json({
    ok: true, k: k, pending: true,
    msg: '已提交，管理员审核通过后会出现在校园图片里。',
  });
}

/** GET /v1/admin/photos —— 管理员看全部（含待审） */
async function handleAdminPhotos(env) {
  const idx = await getPhotoIdx(env);
  const rows = idx.map(x => ({
    k: x.k, cap: x.cap || '', w: x.w || 0, h: x.h || 0,
    at: x.at || 0, st: x.st || 'p', id: x.id || '',
  }));
  return json({ ok: true, count: rows.length, pending: rows.filter(r => r.st === 'p').length, rows: rows });
}

/**
 * POST /v1/admin/photo {k, act}
 *   act = 'ok'     通过（进公开墙）
 *   act = 'no'     下架（st→'x'，**保留字节**，可以重新上架）
 *   act = 'del'    彻底删除（索引 + 字节）
 *   act = 'cap'    改说明文字
 *   act = 'orphan' 清理孤儿图片（没有 k 参数）：扫 ph: 前缀，
 *                  把索引里已经不存在的字节删掉
 */
async function handleAdminPhotoAct(req, env) {
  const b = await readJson(req, 4096);
  if (!b) return bad('请求体不是合法 JSON');
  const act = String(b.act || '');

  /* 孤儿清理不需要 k，先处理掉，免得被下面的编号校验挡回去。
   *
   * 为什么会有孤儿：上传是「先 put ph:<k>，再整键覆盖索引」，KV 无事务，
   * 两个人同时上传时后写的那次会把先写的那条索引抹掉，ph:<k> 就没人认领了。
   * 这些字节会一直占着 KV（无 TTL），直到有人扫一遍。 */
  if (act === 'orphan') {
    const idx0 = await getPhotoIdx(env);
    const live = new Set(idx0.map(x => x.k));
    const dead = [];
    let cursor;
    do {
      const r = await env.AUTH.list({ prefix: 'ph:', cursor: cursor });
      for (const it of r.keys) {
        const k = it.name.slice(3);
        if (!live.has(k)) dead.push(k);
      }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    for (const k of dead) await env.AUTH.delete('ph:' + k);
    await audit(env, 'photo_orphan', [], '删了 ' + dead.length + ' 张孤儿图');
    return json({ ok: true, removed: dead.length, rows: dead.slice(0, 50) });
  }

  const k = String(b.k || '').trim();
  if (!/^p[0-9a-z]{6,32}$/.test(k)) return bad('图片编号不对');
  const idx = await getPhotoIdx(env);
  const i = idx.findIndex(x => x.k === k);
  if (i < 0) return bad('没有这张图片');

  if (act === 'ok') {
    idx[i].st = 'a';
    await putPhotoIdx(env, idx);
  } else if (act === 'no') {
    /* 软下架：只把状态改成 'x'，**不删字节**。
     *
     * v1.1.7 之前 'no' 和 'del' 走的是同一条 `idx.splice + AUTH.delete`，
     * 也就是「下架」等于物理删除，而前端的「下架」按钮还没有 confirm
     * —— 管理员手滑一下，图和索引一起没了，不可恢复。
     * 现在两件事分开：'x' 能从审核页重新上架，'del' 才是真的删。
     * handlePhotos 只放行 st==='a'，'x' 天然不会出现在公开列表。 */
    idx[i].st = 'x';
    await putPhotoIdx(env, idx);
  } else if (act === 'del') {
    idx.splice(i, 1);
    await putPhotoIdx(env, idx);
    await env.AUTH.delete('ph:' + k);
  } else if (act === 'cap') {
    idx[i].cap = cleanText(b.cap || '', 60);
    await putPhotoIdx(env, idx);
  } else {
    return bad('act 只能是 ok / no / del / cap');
  }
  await audit(env, 'photo_' + act, [], k);
  // 列表有边缘缓存，审核动作必须把它清掉，否则管理员自己刷新也看不到变化
  await purgeEdge(req, '/v1/photos');
  await purgeEdge(req, '/v1/photo?k=' + k);
  const pending = (await getPhotoIdx(env)).filter(x => x.st === 'p').length;
  return json({ ok: true, pending: pending });
}

/**
 * GET /v1/admin/photo/raw?k=xxx —— 管理员专用取图，**不看审核状态**。
 *
 * 为什么必须单独开一条：`/v1/photo` 只放行 st==='a'，而审核页要看的恰恰
 * 是 st==='p' 的待审图。v1.1.6 里审核页直接拿 `/v1/photo?k=` 当 <img src>，
 * 于是待审的图全是裂图 —— 管理员只能凭一行说明盲点「通过」，
 * 等于把「审核」这件事做反了。
 *
 * 安全边界：必须带 x-admin-key（在路由层校验），且一律 no-store，
 * 不让待审图进任何一层缓存。
 */
async function handleAdminPhotoRaw(req, url, env) {
  const k = String(url.searchParams.get('k') || '').trim();
  if (!/^p[0-9a-z]{6,32}$/.test(k)) return bad('图片编号不对', 404);
  const buf = await env.AUTH.get('ph:' + k, 'arrayBuffer');
  if (!buf) return bad('图片已丢失', 404);
  const kind = imageKind(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
  const type = kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg';
  return new Response(buf, {
    headers: {
      'content-type': type,
      'cache-control': 'no-store',
      /* 管理员口令走的是自定义头，跨不到 <img> 上。所以这条接口改成
       * 「把口令放 query」也不行（会进日志/历史）。折中：前端用
       * XXMU.net 拿到字节再 createObjectURL，见 app.js 的 revPhotoSrc()。 */
    },
  });
}

/* ---------------------------------------------------------------- 留言板 */

const FB_MAX = 800;                 // 索引最多留多少条
const FB_IDX = 'fb:idx';
const FB_LEN = 500;                 // 正文上限

async function getFbIdx(env) {
  const raw = await env.AUTH.get(FB_IDX);
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
async function putFbIdx(env, list) {
  await env.AUTH.put(FB_IDX, JSON.stringify(list.slice(0, FB_MAX)));
}

/**
 * POST /v1/feedback {id, kind, text, contact, fp} —— 学生留言给管理员。
 *
 * 为什么要做这个（而不是只用 QQ 群）：
 *   大部分同学不想为了提一句意见就加群、@人、等回复。留言是「异步、不用露脸、
 *   不用加群」的通道，回不回都能看到 —— 这才是它比群强的地方。
 *
 * 三条硬约束：
 *   · 同一设备 60 秒一条、一天最多 5 条（防刷屏）。按 fp 不按 IP ——
 *     学校里几百人共用一个出口 IP，按 IP 会让「全校一天 5 条」。
 *   · 正文 ≤ 500 字（够说清楚，也不至于写成论文）
 *   · 索引进**同一条 KV 键**（fb:idx），所以发一条 = 1 次读 + 1 次写。
 *     上限 FB_MAX 条，超了挤掉最老的 —— 不清理也不会无限增长。
 */
async function handleFeedbackPost(req, env, url) {
  const b = await readJson(req, 8192);
  if (!b) return bad('请求体不是合法 JSON');

  const fpk = String(b.fp || '').trim();
  if (!rlHit(rlKey(req, 'fb60', fpk), 1, 60 * 1000)) {
    return bad('刚发过一条，等一分钟再发。', 429);
  }
  if (!rlHit(rlKey(req, 'fbday', fpk), 5, 24 * 3600 * 1000)) {
    return bad('今天已经发了 5 条了，明天再来吧。', 429);
  }

  const text = cleanText(b.text, FB_LEN);
  if (text.length < 2) return bad('说点什么再发吧（至少 2 个字）');

  const id = String(b.id || '').trim();
  const kind = ['优化建议', 'bug', '内容纠错', '其它'].indexOf(String(b.kind || '')) >= 0
    ? String(b.kind) : '其它';
  const k = shortKey('f');
  const rec = {
    id: /^\d{6,20}$/.test(id) ? id : '',
    kind: kind,
    text: text,
    contact: cleanText(b.contact || '', 40),
    fp: cleanText(b.fp || '', 40),
    at: now(),
    reply: '',
    replyAt: 0,
  };
  await env.AUTH.put('fb:' + k, JSON.stringify(rec), { expirationTtl: 180 * DAY });

  const idx = await getFbIdx(env);
  idx.unshift({ k: k, at: rec.at, id: rec.id, kind: kind, read: 0, hasReply: 0 });
  await putFbIdx(env, idx);

  return json({ ok: true, k: k, msg: '收到了。管理员看到会回复，回复后会显示在留言板上。' });
}

/**
 * GET /v1/feedback —— 公开：**只返回管理员已经回复过的**。
 *
 * 为什么只给已回复的：留言里常常带着学号、宿舍号、甚至手机号。
 * 全公开等于把学生的隐私摆到墙上。只公开「有回复的」有两个好处 ——
 * 提问的人得到了答复，别人也只需要看「已经有答案的那部分」。
 */
async function handleFeedbackList(req, env) {
  return await edgeCache(req, 60, async () => {
    const idx = await getFbIdx(env);
    /* v1.1.8：这里每条留言 1 次子请求。免费版单请求上限 50 次，
     * 40 条 + 1 次读索引 = 41，留一点余量给边缘缓存那层的开销。
     * 公开墙本来也不需要更多——有回复的留言翻到 30 条没人会看。 */
    const replied = idx.filter(x => x.hasReply).slice(0, 30);
    const rows = [];
    for (const it of replied) {
      const raw = await env.AUTH.get('fb:' + it.k);
      if (!raw) continue;
      let r = null;
      try { r = JSON.parse(raw); } catch (e) { continue; }
      rows.push({
        k: it.k, kind: r.kind || '', text: r.text || '',
        reply: r.reply || '', at: r.at || 0, replyAt: r.replyAt || 0,
        // 公开墙上不显示学号 —— v1.1.15 起连后 4 位也不给。
        // 原来拼的是 '同学' + 学号后 4 位，注释却写「不显示学号」。同学院同年级
        // 学号前缀相同、后 4 位就是流水号，配合「谁在哪天提了什么」（留言里
        // 常带班级、宿舍号）在小范围内足以认出人。公开墙本来也不需要区分
        // 谁是谁，同一人多条留言各自署名相同没有意义。
        from: r.id ? '同学' : '匿名',
      });
    }
    return json({ ok: true, count: rows.length, rows: rows });
  }, { ignoreQuery: true });
}

/** GET /v1/admin/feedback —— 管理员看全部（含未读）
 *
 * ⚠️ v1.1.8 修：原来 `for (const it of idx.slice(0, 200)) await AUTH.get(...)`。
 *    Cloudflare Workers 免费版**单请求最多 50 次子请求**，留言超过 51 条
 *    这个接口就必抛，被顶层 catch 兜成「服务端忙」500 —— 管理后台里
 *    留言页永远打不开，而且学生那边一切正常，看起来完全不像服务端 bug。
 *    （同文件 handleList 早就为这个坑改过一次，这里原样重踩。）
 *
 * 现在：未读数直接从索引算（索引里就有 read 标记，不花子请求），
 * 正文只回前 PAGE 条，并如实告诉前端 truncated / total。
 * 想看更早的留言用 ?offset= 翻页。
 */
async function handleAdminFeedback(env, url) {
  const idx = await getFbIdx(env);
  const PAGE = 40;
  const off = Math.max(0, parseInt((url && url.searchParams.get('offset')) || 0, 10) || 0);
  const slice = idx.slice(off, off + PAGE);
  const rows = [];
  for (const it of slice) {
    const raw = await env.AUTH.get('fb:' + it.k);
    if (!raw) { rows.push({ k: it.k, gone: true, at: it.at, kind: it.kind }); continue; }
    let r = null;
    try { r = JSON.parse(raw); } catch (e) { rows.push({ k: it.k, gone: true, at: it.at }); continue; }
    rows.push({
      k: it.k, id: r.id || '', kind: r.kind || '', text: r.text || '',
      contact: r.contact || '', at: r.at || 0, reply: r.reply || '',
      replyAt: r.replyAt || 0, read: it.read ? 1 : 0,
    });
  }
  return json({
    ok: true, count: rows.length, offset: off,
    unread: idx.filter(x => !x.read).length,
    total: idx.length,
    truncated: idx.length > off + rows.length,
    rows: rows,
  });
}

/**
 * POST /v1/admin/feedback {k, reply, del, read}
 *   reply 非空 → 存回复并标记已读
 *   del=1      → 删除这条留言
 *   只传 read  → 仅标为已读
 */
async function handleAdminFeedbackAct(req, env) {
  const b = await readJson(req, 8192);
  if (!b) return bad('请求体不是合法 JSON');
  const k = String(b.k || '').trim();
  if (!/^f[0-9a-z]{6,32}$/.test(k)) return bad('留言编号不对');
  const idx = await getFbIdx(env);
  const i = idx.findIndex(x => x.k === k);
  if (i < 0) return bad('没有这条留言');

  /* 动作字段统一成 act。v1.1.6 的客户端发的是 {act:'del'}，而这里原来判的是
   * `if (b.del)` —— 全函数根本不看 act，于是「删除留言」这个请求一路落到
   * 最后那行 `idx[i].read = 1`，界面上提示「已删除」、刷新后留言还在，
   * 反复点也删不掉。旧包兼容：b.del 仍然认。 */
  const act = String(b.act || (b.del ? 'del' : '')).trim();

  if (act === 'del') {
    idx.splice(i, 1);
    await putFbIdx(env, idx);
    await env.AUTH.delete('fb:' + k);
    await audit(env, 'fb_del', [], k);
    /* 删除也必须清边缘缓存：/v1/feedback 是 edgeCache(60s)，
     * 不清的话删掉的留言还会在公开留言板上再挂一分钟。 */
    await purgeEdge(req, '/v1/feedback');
    return json({ ok: true, deleted: true });
  }

  const reply = cleanText(b.reply || '', FB_LEN);
  if (reply) {
    const raw = await env.AUTH.get('fb:' + k);
    let r = {};
    try { r = JSON.parse(raw) || {}; } catch (e) { r = {}; }
    r.reply = reply;
    r.replyAt = now();
    await env.AUTH.put('fb:' + k, JSON.stringify(r), { expirationTtl: 180 * DAY });
    idx[i].hasReply = 1;
    idx[i].read = 1;
    await putFbIdx(env, idx);
    await audit(env, 'fb_reply', [], k);
    await purgeEdge(req, '/v1/feedback');
    return json({ ok: true, replied: true });
  }

  if (act && act !== 'read') return bad('act 只能是 del / read / reply');

  idx[i].read = 1;
  await putFbIdx(env, idx);
  return json({ ok: true });
}

/* ---------------------------------------------------------------- 路由 */

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';

    try {
      /* v1.1.10：全局兜底限流，位置必须在所有路由之前。
       *
       * 原来限流是「按接口各管一段」，于是**没有匹配到任何路由的请求
       * 完全不受限**：实测连打 40 次 /v1/nonexistent-N，40 个 404，
       * 一个 429 都没有。攻击者不需要找到真接口，随便编路径就能让
       * Worker 一直执行 —— 请求数照样计入免费版 10 万/天的额度。
       *
       * 这一道是最后的安全网，阈值必须宽到正常用户碰不到：
       * 一次冷启动会打 config + photos + feedback + 若干图片，几十个请求；
       * 一个出口 IP 后面可能同时有整个宿舍甚至整个机房 NAT。
       * 600 次/分钟 = 每秒 10 次，正常使用远远够，脚本一定撞。 */
      if (!rlHit('all:ip:' + clientIp(req), 600, 60 * 1000)) {
        return bad('请求太频繁，等一会儿再试。', 429);
      }

      /* 公开接口先过一道「便宜优先」的检查。
       * /v1/config 与 /v1/apk 不在这里限流：它们靠边缘缓存（下面各自的
       * cache-control）把绝大部分请求挡在边缘，Worker 根本不执行。
       * 给它们加计数反而会让正常用户被误伤 —— 一次冷启动就要读一次配置。 */
      if (p === '/v1/config') return await handleConfig(req, env);
      if (p === '/v1/apk') return await handleApk(req, env);
      if (p === '/v1/photos') return await handlePhotos(req, env);
      /* 必须限定 GET：这一行原来没写 method，于是 POST /v1/photo（上传）
       * 被它先接走当成「取某张图」，上传接口永远返回 404。
       * 结构相同的 /v1/feedback 早就分了 GET/POST，这里漏了。 */
      if (p === '/v1/photo' && req.method === 'GET') return await handlePhoto(req, url, env);
      if (p === '/v1/feedback' && req.method === 'GET') return await handleFeedbackList(req, env);

      if (p === '/v1/photo' && req.method === 'POST') return await handlePhotoUpload(req, url, env);
      if (p === '/v1/feedback' && req.method === 'POST') return await handleFeedbackPost(req, env, url);
      if (p === '/v1/activate' && req.method === 'POST') {
        /* 每一台新设备开机都会来一次，正常用量很低；这里是挡脚本批量注册学号。
         * 按 IP 计（这一层还没解析请求体，拿不到 fp），所以阈值必须留够：
         * 一个班同时装 App、或者宿舍一起重装，几十个请求是正常量，
         * 20 次/10 分钟会误伤。真正防刷学号的是 fp 设备名额 + 学号格式校验。 */
        if (!rlHit('act:ip:' + clientIp(req), 200, 10 * 60 * 1000)) {
          return bad('请求太频繁，等几分钟再试。', 429);
        }
        return await handleActivate(req, env);
      }
      if (p === '/v1/check' && req.method === 'POST') {
        /* 客户端本来就 6 小时才复检一次；这里只是挡真正发疯的循环。
         * 按 IP 计，同样要留够——一台设备 6 小时 1 次，200 次/6 分钟
         * 意味着一个出口 IP 后面同时有几百台设备在异常重试，那才该挡。 */
        if (!rlHit('chk:ip:' + clientIp(req), 200, 6 * 60 * 1000)) {
          return bad('请求太频繁，等几分钟再试。', 429);
        }
        return await handleCheck(req, env);
      }

      if (p.startsWith('/v1/admin/')) {
        /* v1.1.9：管理接口也要限流。
         *
         * 原来整段 `/v1/admin/*` 一个 rlHit 都没有 —— 全站唯一带口令的入口
         * 却是唯一可以无限次尝试的入口。管理员口令是 40 位随机串，暴破不现实，
         * 但「无限次」本身会掩盖两件事：①有人在试探时日志里什么都没有；
         * ②每次失败都要走一趟 constEq + 可能触发 KV 读，属于免费的放大面。
         *
         * 用的是「IP + 是否带口令」两档：没带口令的请求多半是扫描器，
         * 收得更紧（30 次/10 分钟）；带了口令的（哪怕口令错）放宽到
         * 300 次/10 分钟 —— 管理页一次操作会连打几个接口，正常用碰不到。
         *
         * 注意顺序：先限流再鉴权。反过来就等于「只有口令正确才计数」，
         * 那正好放过了暴破。 */
        const admHasKey = !!(req.headers.get('x-admin-key') || '').trim();
        const admOk = admHasKey
          ? rlHit('adm:ip:' + clientIp(req), 300, 10 * 60 * 1000)
          : rlHit('adm404:ip:' + clientIp(req), 30, 10 * 60 * 1000);
        if (!admOk) return bad('管理接口请求太频繁，等几分钟再试。', 429);
        if (!isAdmin(req, env)) return bad('管理员口令不正确', 401);
        if (p === '/v1/admin/grant') return await handleGrant(req, env);
        if (p === '/v1/admin/revoke') return await handleRevoke(req, env);
        if (p === '/v1/admin/unrevoke') return await handleUnrevoke(req, env);
        if (p === '/v1/admin/revoke-device') return await handleRevokeDevice(req, env);
        if (p === '/v1/admin/ungrant') return await handleUngrant(req, env);
        if (p === '/v1/admin/unbind') return await handleUnbind(req, env);
        if (p === '/v1/admin/devices') return await handleDevices(req, env);
        if (p === '/v1/admin/state') return await handleState(req, env);
        if (p === '/v1/admin/codes') return await handleCodes(req, env);
        if (p === '/v1/admin/audit') return await handleAudit(env);
        if (p === '/v1/admin/config') return await handleSetCfg(req, env);
        if (p === '/v1/admin/upload') return await handleUploadApk(req, env, url);
        if (p === '/v1/admin/apkdel') return await handleApkDel(req, env);
        if (p === '/v1/admin/versioncheck') return await handleVersionCheck(req, env);
        if (p === '/v1/admin/list') return await handleList(env);
        if (p === '/v1/admin/code') return await handleCode(url, env);
        if (p === '/v1/admin/admins') return await handleAdmins(req, env);
        if (p === '/v1/admin/photos') return await handleAdminPhotos(env);
        if (p === '/v1/admin/photo') return await handleAdminPhotoAct(req, env);
        /* 管理员取图：不看审核状态，审核页靠它显示待审图 */
        if (p === '/v1/admin/photo/raw') return await handleAdminPhotoRaw(req, url, env);
        if (p === '/v1/admin/feedback') {
          return req.method === 'GET'
            ? await handleAdminFeedback(env, url)
            : await handleAdminFeedbackAct(req, env);
        }
        return bad('没有这个管理接口', 404);
      }

      if (p === '/' || p === '/v1') {
        return json({ ok: true, name: 'xxmu-auth', ver: 2, ts: now() });
      }
      /* 路由自检：确认 Pages 反代有没有把真实客户端 IP 带过来。
       * 只回布尔和长度，不回 IP 原文。
       *
       * v1.1.15：三个布尔值全部改为**仅管理员可见**。
       * 原来它对所有人公开返回 viaProxy / ipForwarded / ipLooksInternal。
       * 其中 ipLooksInternal 等于直接告诉扫描者「你们现在的 IP 透传是失效的、
       * 限流已经退化成全校共用一个桶」—— 正是构造「伪造 x-xxmu-ip 绕过限流」
       * 时最想知道的那个信号。哪怕不含 IP 原文，这也是免费给攻击者做 A/B 测试。
       * 公开部分只留 ok 与版本号（够用来判断 Worker 活着），
       * 详细自检带上 x-admin-key 再问。 */
      if (p === '/v1/_diag') {
        if (!isAdmin(req, env)) return json({ ok: true, ver: 4 });
        const raw = String(req.headers.get('x-xxmu-ip') || '');
        const viaOk = req.headers.get('x-xxmu-via') === PROXY_TAG;
        const ip = clientIp(req);
        return json({
          ok: true,
          ver: 4,
          viaProxy: viaOk,              // Pages 那一层带了标记头吗
          ipForwarded: viaOk && raw.length > 0,  // 真实 IP 有没有到
          ipLooksInternal: ip.indexOf('2a06:98c0') === 0, // 还是不是 Cloudflare 自己的地址
        });
      }
      return bad('没有这个接口', 404);
    } catch (e) {
      /* 内部异常文本不对客户端输出：KV 绑定名、键名拼装、JSON 解析位置
       * 这些细节会直接出现在学生手机上，也等于把服务端结构免费发给任何
       * 构造畸形请求的人。细节只写日志。 */
      try { console.error('xxmu worker error', e && e.stack ? e.stack : e); } catch (x) {}
      return json({ ok: false, msg: '服务端忙，请稍后再试' }, 500);
    }
  },
};
