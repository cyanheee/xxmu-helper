/* 前后端字段契约测试 —— node tools/test_api_contract.js
 *
 * 为什么需要它：
 * v1.1.6 第一次部署完，图片墙和留言板在线上永远是空的。代码没报错、
 * 控制台没有异常、接口 200 返回正常，只是前端读 res.list 而服务端写的
 * 是 res.rows —— 一次拼写不一致，功能静默消失。
 *
 * 这类 bug 无法靠「跑一遍看看」发现（看起来就是没数据），也无法靠类型
 * 检查（都是 JSON），只能把两边真正的字符串拿出来对照。
 *
 * 为什么不用「全文件扫 res.xxx」：那样会把 `const res =
 * document.createElement(...)` 里的 res.appendChild 也算进来，噪声一大片，
 * 最后只能靠一长串豁免名单糊过去 —— 测试就成了摆设。
 * 这里只扫**明确处理接口返回的那几个函数体**，范围小但每一条都算数。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

const worker = fs.readFileSync(path.join(root, 'server/worker.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
const wiki = fs.readFileSync(path.join(root, 'web/wiki.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'web/auth.js'), 'utf8');
const about = fs.readFileSync(path.join(root, 'web/about.js'), 'utf8');

/* ---------- 1. 抽出服务端 json({...}) 里的顶层键 ---------- */
const serverKeys = new Set();
{
  const re = /json\(\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\s*\)/g;
  let m;
  while ((m = re.exec(worker))) {
    const kre = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g;
    let k;
    while ((k = kre.exec(m[1]))) serverKeys.add(k[1]);
  }
  /* putCfg 那条不是 json(...)，但 /v1/config 会把 cfg 整个序列化回来，
   * DEFAULT_CFG 的键也属于「服务端会发出的字段」。 */
  const d = /const DEFAULT_CFG = \{([\s\S]*?)\n\};/.exec(worker);
  if (d) {
    const kre = /(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g;
    let k;
    while ((k = kre.exec(d[1]))) serverKeys.add(k[1]);
  }
}
console.log('服务端会发出的字段（' + serverKeys.size + ' 个）:');
console.log('  ' + [...serverKeys].sort().join(', '));
ok('扫描本身没失效', serverKeys.size >= 25, '只抽到 ' + serverKeys.size + ' 个');

/* ---------- 2. 取出指定函数体（按大括号配平，不用正则硬啃） ---------- */
function fnBody(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  let i = src.indexOf('{', at);
  if (i < 0) return null;
  let depth = 0, inS = 0, q = '';
  for (; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (inS) {
      if (c === q && p !== '\\') inS = 0;
      else if (c === '\n' && q !== '`') { /* JS 单行字符串跨行不合法，忽略 */ }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inS = 1; q = c; continue; }
    if (c === '/' && src[i + 1] === '/') {           // 行注释
      const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue;
    }
    if (c === '/' && src[i + 1] === '*') {           // 块注释
      const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

/* ---------- 3. 只检查「吃接口返回」的函数 ---------- */
const TARGETS = [
  ['wiki.js', wiki, 'loadPhotos'],
  ['wiki.js', wiki, 'loadFeedback'],
  ['app.js', app, 'loadRevPhotos'],
  ['app.js', app, 'loadRevFb'],
];

/* 兼容别名：这些字段服务端不发，但前端**故意**也认一份。
 * 加进来的每一条都必须写清理由，否则这测试就退化成豁免名单了。 */
const ALIAS_OK = new Map([
  ['list', 'rows 的历史名字；容错读取，服务端改名时仍能出数据'],
]);

console.log('\n各函数体里读的接口字段:');
let unknownAll = [];
for (const [file, src, name] of TARGETS) {
  const body = fnBody(src, name);
  if (!body) { ok(file + ' 里能找到 ' + name, false); continue; }
  const reads = new Set();
  const re = /\bres\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(body))) reads.add(m[1]);
  const unknown = [...reads].filter(k => !serverKeys.has(k) && !ALIAS_OK.has(k));
  const known = [...reads].filter(k => serverKeys.has(k));
  const alias = [...reads].filter(k => ALIAS_OK.has(k));
  console.log('  ' + name.padEnd(14) + ' 读到: ' + (known.join(', ') || '(无)')
    + (alias.length ? '   兼容别名: ' + alias.join(', ') : '')
    + (unknown.length ? '   未知: ' + unknown.join(', ') : ''));
  unknownAll = unknownAll.concat(unknown.map(k => name + '.' + k));
}
ok('四个接口消费者读的字段服务端都发', unknownAll.length === 0, unknownAll.join(', '));

/* ---------- 4. 这次血案的两个具体位置：必须有 rows/list 容错 ----------
 * 光「现在对」不够：服务端哪天把 rows 改名，前端还得能活。
 * 所以这几个位置要求同时接受 rows 和 list。 */
for (const [file, src, name] of TARGETS) {
  const body = fnBody(src, name) || '';
  ok(name + ' 同时接受 rows 与 list',
    /res\.rows/.test(body) && /res\.list/.test(body), '只认一种');
}

/* ---------- 5. 路由必须区分 GET / POST ----------
 * /v1/photo 原来没限定 method，POST 上传被 GET 分支先接走，永远 404。 */
console.log('\n路由方法区分:');
const routeLines = worker.split('\n').filter(l => l.indexOf("p === '/v1/") >= 0);
function routeHas(p, method) {
  return routeLines.some(l => l.indexOf(p) >= 0 && l.indexOf("'" + method + "'") >= 0);
}
ok('/v1/photo 有 GET 分支', routeHas("'/v1/photo'", 'GET'));
ok('/v1/photo 有 POST 分支', routeHas("'/v1/photo'", 'POST'));
ok('/v1/feedback 有 GET 分支', routeHas("'/v1/feedback'", 'GET'));
ok('/v1/feedback 有 POST 分支', routeHas("'/v1/feedback'", 'POST'));
/* 兜底那条：不许存在不带 method 判断的 /v1/photo 或 /v1/feedback 分支 */
for (const p of ["'/v1/photo'", "'/v1/feedback'"]) {
  const bare = routeLines.filter(l => l.indexOf(p) >= 0 && l.indexOf('method') < 0);
  ok(p + ' 没有不判方法的兜底分支', bare.length === 0, bare.join(' | ').trim());
}

/* ---------- 6. 前端调用的每条 AUTH 接口，服务端都得有 ---------- */
console.log('\n接口存在性:');
const calls = new Set();
{
  const re = /(?:getJson|postJson)\(\s*'(\/v1\/[^'?]*)/g;
  let m;
  while ((m = re.exec(auth))) calls.add(m[1]);
}
console.log('  前端调用 ' + calls.size + ' 条: ' + [...calls].sort().join(', '));
const missing = [...calls].filter(c => worker.indexOf("'" + c + "'") < 0);
ok('前端调的接口服务端都有', missing.length === 0, missing.join(','));

/* 反向：服务端的公开接口都得被前端用过（管理接口不查，管理员不常开） */
const publicPaths = ['/v1/config', '/v1/check', '/v1/activate', '/v1/apk',
  '/v1/photos', '/v1/photo', '/v1/feedback'];
const unused = publicPaths.filter(p => (auth + app + about).indexOf(p) < 0);
ok('公开接口都被前端用到', unused.length === 0, unused.join(','));

console.log('\n' + (fail === 0
  ? '[PASS] 通过 ' + pass + ' 项，失败 0 项'
  : '[FAIL] 通过 ' + pass + ' 项，失败 ' + fail + ' 项'));
process.exit(fail === 0 ? 0 : 1);
