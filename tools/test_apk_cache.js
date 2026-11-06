/* APK 版本化缓存与官网静态缓存的离线契约测试（v1.1.44）
 *
 *   node tools/test_apk_cache.js
 *
 * 背景：用户报「App 内下载慢、官网加载也慢」。实测根因是每次请求都跨
 * 手机 → Pages Functions → workers.dev → Worker → KV 双跳，且 /v1/apk
 * 与首页都不进缓存。这轮加两层 Cache API 缓存，最怕的不是「没写」，
 * 而是：①老的无参数 URL 被缓存住旧包（发版后学生装回老版本）；
 * ②Range 206 被直接 put 进缓存（Cloudflare 只收 200）导致缓存写失败；
 * ③4 段 Range 用同一个键互相覆盖；④cfg.latest.url 忘了带 ?v= 整条失效。
 *
 * 能验：源码契约（按结构钉）、URL 生成、Range 切片纯函数、缓存头。
 * 不能验：真机上的实际秒数、边缘节点命中率 —— 那要部署后 curl 实测。
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
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

const worker = read('server/worker.js');
const pages = read('server/pages/dist/_worker.js');
const pub = read('tools/publish_apk.py');
const setl = read('tools/set_latest.py');

console.log('1. Worker：版本化才缓存，老路径行为不变');
ok(/const qv = \(u\.searchParams\.get\('v'\) \|\| ''\)\.trim\(\)/.test(worker),
  '从 query 读 v');
ok(/sha\.toLowerCase\(\)\.indexOf\(qv\.toLowerCase\(\)\) === 0/.test(worker),
  'v 必须是当前 sha256 的前缀（不匹配就走老路径）');
ok(/qv\.length >= 8/.test(worker), 'v 太短不缓存');
ok(/caches\.default/.test(worker) && /cache\.match\(cacheKey\)/.test(worker),
  'handleApk 真的调了 Cache API（不再只是注释说靠缓存）');
ok(/versioned\s*\?\s*'public, max-age=31536000, immutable'\s*:\s*'no-cache'/s.test(worker),
  '版本化回 immutable，老回 no-cache');
ok(/x-apk-cache/.test(worker), '响应带 x-apk-cache 标记，线上可验');
ok(/return apkResponse\(req, full, meta, true\)/.test(worker), '缓存命中走统一切片函数');
ok(/return apkResponse\(req, buf, meta, false\)/.test(worker), '老路径也走同一函数（不分叉）');

console.log('\n2. Range 从全量切片，206 不进缓存');
ok(/function apkResponse\(req, buf, meta, versioned\)/.test(worker),
  'apkResponse 单一实现');
{
  // 从源码切出 apkResponse，用假的 buf 真跑一遍 Range 逻辑
  const start = worker.indexOf('function apkResponse(');
  let i = worker.indexOf('{', start), depth = 0, end = -1;
  for (; i < worker.length; i++) {
    if (worker[i] === '{') depth++;
    else if (worker[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  ok(end > 0, '能切出 apkResponse 函数体');
  const code = [
    'const CORS = {};',
    'function apk416(t, h){ return { status: 416, headers: h }; }',
    worker.slice(start, end),
    'this.__fn = apkResponse;',
  ].join('\n');
  const s = { isFinite, parseInt, String, Object, Math, Headers, Response, URL };
  s.globalThis = s;
  vm.createContext(s);
  // Node 22 有全局 Headers/Response；若无则用极简 shim
  if (typeof Headers === 'undefined') {
    s.Headers = class { constructor(o) { this.m = Object.assign({}, o || {}); } set(k, v) { this.m[k] = String(v); } get(k) { return this.m[k] || null; } };
    s.Response = class { constructor(b, o) { this.b = b; this.status = o.status; this.headers = o.headers; } };
  }
  try {
    vm.runInContext(code, s, { filename: 'apkResponse.js' });
    const buf = new Uint8Array(1000).buffer;
    const req = { headers: { get: () => 'bytes=100-199' } };
    const r = s.__fn(req, buf, { name: 'x.apk', sha256: 'a'.repeat(64), ver: '1.1.43' }, true);
    ok(r.status === 206, 'Range 返回 206', r.status);
    const cr = r.headers.get ? r.headers.get('content-range') : r.headers.m['content-range'];
    ok(cr === 'bytes 100-199/1000', 'content-range 正确', cr);
    const cc = r.headers.get ? r.headers.get('cache-control') : r.headers.m['cache-control'];
    ok(/immutable/.test(cc), '版本化响应是 immutable', cc);
    const r2 = s.__fn({ headers: { get: () => '' } }, buf,
      { name: 'x.apk', sha256: 'a'.repeat(64), ver: '1.1.43' }, false);
    const cc2 = r2.headers.get ? r2.headers.get('cache-control') : r2.headers.m['cache-control'];
    ok(cc2 === 'no-cache', '老路径仍是 no-cache（不缓存旧包）', cc2);
  } catch (e) {
    ok(false, 'apkResponse 真跑一遍', e.message);
  }
}

console.log('\n3. Pages 层：缓存键带 Range，206 包成 200 存');
ok(/versionedApk/.test(pages), '有版本化判定');
ok(/'&r=' \+ encodeURIComponent\(rv\)/.test(pages), '缓存键带 Range 值（4 段不互相覆盖）');
ok(/status: 200, headers: ch/.test(pages), '206 段包成 200 再 put（Cache API 只收 200）');
ok(/x-apk-range/.test(pages), '段范围另存 x-apk-range，命中时还原');
ok(/hit\.body, \{ status: 206/.test(pages), 'Range 命中还原成 206');
ok(/x-pages-cache/.test(pages), '响应带 x-pages-cache: hit|miss，线上可验');
ok(/const backup = r\.clone\(\)/.test(pages), '消费 body 前先 clone 备份（异常不丢响应）');
ok(/HOME_TTL = 300/.test(pages) && /IMG_TTL = 86400/.test(pages), '首页/图片短 TTL');
ok(/x-pages-cache = 'hit'|'x-pages-cache', 'hit'/.test(pages), '静态分支有命中标记');
/* 反向：不带 ?v= 的绝不能进这个分支 */
ok(/qv\.length >= 8 && \/\^\[0-9a-f\]\+\$\/i\.test\(qv\) && rvAll !== ''/.test(pages),
  '无 v / 非法 v / 无 Range 都不走 Pages 缓存分支（单流不被拖慢）');
ok(/'x-apk-ver', 'x-apk-cache'/.test(pages), '透传列表补了 x-apk-cache');

console.log('\n4. 官网静态缓存文件');
{
  const hp = path.join(root, 'server', 'pages', 'dist', '_headers');
  ok(fs.existsSync(hp), 'dist/_headers 存在');
  const h = fs.existsSync(hp) ? fs.readFileSync(hp, 'utf8') : '';
  ok(/max-age=300/.test(h), '首页 300 秒');
  ok(/\/img\/\*/.test(h) && /max-age=86400/.test(h), '图片 1 天');
  ok(!/immutable/.test(h), '官网没用 immutable（改文案最迟 5 分钟生效）');
}

console.log('\n5. 发版链路：cfg.latest.url 必须带 ?v=');
ok(/'url': BASE \+ '\/v1\/apk\?v=' \+ sha\[:12\]/.test(pub),
  'publish_apk.py 生成版本化 URL');
ok(/base_url \+ '\?v=' \+ facts\['sha256'\]\[:12\]/.test(setl),
  'set_latest.py 也补 ?v=（含 --url 兜底传来的无参数 URL）');
ok(/url\.split\('\?'\)\[0\]/.test(setl), 'set_latest 先剥掉旧 query 再拼');
/* App 侧 isSelf 是前缀匹配，带 query 仍命中 —— 这条是防止以后有人改成全等 */
const app = read('web/app.js');
ok(/url\.indexOf\(self\) === 0/.test(app),
  'App 内下载判定仍是前缀匹配（带 ?v= 不会被当成外链）');

console.log('\n' + (bad === 0
  ? '[PASS] APK 缓存契约 ' + total + ' 项全过（真机秒数仍需部署后实测）'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
