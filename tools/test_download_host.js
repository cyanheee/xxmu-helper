/* 更新下载 URL 的「入口归一」行为测试（v1.1.47）
 *
 *   node tools/test_download_host.js
 *
 * 背景：v1.1.17 加了双入口回退，校园网 DNS 查不到 www 的学生会退到
 * xxmu-auth.pages.dev。图片、上传、/v1/config 都跟着 baseNow() 走了，
 * 唯独 cfg.latest.url 是服务端写死的绝对地址
 *   https://www.xxmuhelper.top/v1/apk?v=<sha前12位>
 * 于是 UpdateUI.go() 里的
 *   self = AUTH.BASE + '/v1/apk'; isSelf = url.indexOf(self) === 0
 * 在这批学生机上恒 false → 「去下载」被甩给系统浏览器打开解析不了的地址，
 * App 内下载、4 段并发、断点续传、整包 SHA 校验、拉起安装器全部丢失。
 * 表现是「能看到更新，就是装不上」，和 v1.1.17 那次全校连不上同源。
 *
 * 这里从 web/auth.js 里切出真实的 HOSTS / baseNow / localizeUrl 在 vm 里跑，
 * 再从 web/app.js 里抠出 go() 用的那条 isSelf 判据真算一遍 —— 只验
 * 「函数存在」抓不住「归一之后仍不匹配」这种错。
 *
 * 能验：URL 形态、query 保留、外链不动、形近域名不动、isSelf 前后变化。
 * 不能验：真机 WebView 的下载与安装器 —— 那要装到手机上点一次。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'web', 'auth.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a)); }

/** 按花括号配平切出一个函数体。 */
function cut(src, name) {
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
  "const HOSTS = ['https://www.xxmuhelper.top', 'https://xxmu-auth.pages.dev'];",
  'let liveHost = HOST_OVERRIDE;',
  cut(auth, 'baseNow'),
  cut(auth, 'localizeUrl'),
  'this.__api = { localizeUrl, baseNow, HOSTS };',
].join('\n');

function make(live) {
  const s = { HOST_OVERRIDE: live, String };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(CODE, s, { filename: 'auth-localize.js' });
  return s.__api;
}

const WWW = 'https://www.xxmuhelper.top';
const PGS = 'https://xxmu-auth.pages.dev';
const APK = '/v1/apk?v=3ccccfed3591';

console.log('1. 服务端的绝对 URL 必须对齐到当前可用入口');
{
  const a = make(PGS);                       // 校园 DNS 没刷到，已回退
  const raw = WWW + APK;
  const got = a.localizeUrl(raw);
  eq(got, PGS + APK, 'www → pages.dev，path 与 ?v= 一个字节不动');
  ok(/[?&]v=3ccccfed3591$/.test(got), '版本化缓存键 ?v= 没被吃掉');
}
{
  const a = make(WWW);                       // 反向：服务端配了旧入口
  eq(a.localizeUrl(PGS + APK), WWW + APK, 'pages.dev → www 同样归一');
}
{
  const a = make('');                        // 还没探过，首选就是 www
  eq(a.localizeUrl(WWW + APK), WWW + APK, '首选入口命中时原样返回（绝大多数学生零影响）');
  eq(a.localizeUrl(PGS + APK), WWW + APK, '未探通时把旧入口也提到首选');
}

console.log('\n2. 边界：不是自己的地址一律不碰');
{
  const a = make(PGS);
  const cases = [
    ['https://pan.example.com/x.apk', '外链（网盘/群文件）原样返回'],
    ['https://www.xxmuhelper.top.evil.com/v1/apk?v=a', '形近域名不认'],
    ['http://www.xxmuhelper.top/v1/apk?v=a', 'http 不认（HOSTS 只有 https）'],
    ['/download/x.apk', '非 /v1/ 的相对路径也不归一'],
    ['', '空串'],
    ['   ', '纯空白'],
    [WWW + '/download/x.apk', '自家域名但非 /v1/ 接口，不归一'],
    [WWW + '/img/logo.svg', '官网静态资源不归一'],
  ];
  cases.forEach(c => eq(a.localizeUrl(c[0]), c[0] === '   ' ? '' : c[0], c[1]));
  eq(a.localizeUrl(WWW + '/v1/config'), PGS + '/v1/config', '/v1/ 下别的接口也归一');
  eq(a.localizeUrl('/v1/apk?v=3ccccfed3591'), PGS + '/v1/apk?v=3ccccfed3591',
    '相对 /v1/apk 补成当前入口（管理员手填相对路径时也不会被当外链）');
  eq(a.localizeUrl('/v1/config'), PGS + '/v1/config', '相对 /v1/ 接口同样补齐');
  eq(a.localizeUrl(WWW), WWW, '光一个域名（无路径）不归一');
  eq(a.localizeUrl(WWW + '?x=1'), WWW + '?x=1', '域名后直接跟 query，不属于 /v1/ 不归一');
  eq(a.localizeUrl(WWW + '#top'), WWW + '#top', '域名后直接跟 #，不归一');
}

console.log('\n3. 真跑 UpdateUI.go() 的 isSelf 判据');
{
  /* app.js 里的判据原文，剥掉变量声明后照抄成纯函数。 */
  const srcSelf = /const isSelf = self && url\.indexOf\(self\) === 0;/.test(app);
  ok(srcSelf, 'app.js 里的前缀判据仍是 indexOf(self) === 0（没被改成全等）');
  ok(/AUTH\.localizeUrl\(rawUrl\)/.test(app), 'go() 真的调了 AUTH.localizeUrl');
  ok(/const rawUrl = \(cfg && cfg\.latest && cfg\.latest\.url\)/.test(app),
    '取的是 cfg.latest.url（不是另拼一个地址）');

  const a = make(PGS);
  const self = a.baseNow() + '/v1/apk';
  const raw = WWW + APK;
  const isSelf = url => !!(self && url.indexOf(self) === 0);
  ok(!isSelf(raw), '归一之前：回退到 pages.dev 的学生 isSelf = false（复现故障）');
  ok(isSelf(a.localizeUrl(raw)), '归一之后：isSelf = true，走 App 内下载');
  ok(isSelf(WWW + APK) === false, '这条断言不是恒真（www 在 pages.dev 机上确实不匹配）');
}

console.log('\n' + (bad === 0
  ? '[PASS] 下载入口归一 ' + total + ' 项全过（真机安装仍需装到手机上点一次）'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
