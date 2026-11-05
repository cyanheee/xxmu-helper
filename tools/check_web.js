/* 打包前的静态体检（不依赖 Android 工具链，1 秒跑完）。
 *
 *   node tools/check_web.js
 *
 * 查三类事：
 *   1. web/ 与 android/assets/ 逐字节一致（sync_assets 漏文件是白屏的头号原因）
 *   2. 三处版本号（manifest / about.js / index.html）互相一致
 *   3. 中文没被写坏 —— v1.1.2 曾用 PowerShell 改中文源文件，把 index.html
 *      整个写成乱码，字节数还变大了，肉眼扫 diff 完全看不出来
 *
 * 以前只 print 不打分，出问题要靠人看；现在任一条不过就 exit 1。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

let bad = 0;
function fail(msg) { bad++; console.log('  [FAIL] ' + msg); }

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

const mani = read('android/AndroidManifest.xml');
const vm = /android:versionName="([^"]+)"/.exec(mani);
const vc = /android:versionCode="([^"]+)"/.exec(mani);
const lb = /android:label="([^"]+)"/.exec(mani);
console.log('manifest: label=' + lb[1] + ' versionName=' + vm[1] + ' versionCode=' + vc[1]);
if (lb[1] !== '河医大助手') fail('manifest 的 android:label 不是「河医大助手」（中文被写坏？）');

/* 清单原来写死，新增一个 web/*.js 忘了加进来就等于没检查 ——
 * v1.1.11 加 disc.js 时才发现。现在以 web/ 目录为准全量扫，
 * 写死的名字只用来排序（让输出顺序稳定、好看的排前面）。 */
const KNOWN_ORDER = ['index.html', 'app.js', 'about.js', 'license.js', 'sync.js', 'water.js',
  'auth.js', 'wiki.js', 'guide.js', 'jsQR.js', 'onboard.js', 'disc.js', 'tut.js',
  'chaoxing.js', 'data.js', 'homework.js', 'app.css'];
const webDir = path.join(root, 'web');
const names = fs.readdirSync(webDir)
  .filter(f => /\.(html|js|css)$/i.test(f) && fs.statSync(path.join(webDir, f)).isFile())
  .sort((a, b) => {
    const ia = KNOWN_ORDER.indexOf(a), ib = KNOWN_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
for (const n of names) {
  const wp = path.join(root, 'web', n);
  const w = fs.readFileSync(wp);
  const ap = path.join(root, 'android', 'assets', n);
  const a = fs.existsSync(ap) ? fs.readFileSync(ap) : null;
  const same = a && Buffer.compare(w, a) === 0;
  console.log('  ' + n.padEnd(12) + ' web=' + String(w.length).padStart(7) + ' assets=' +
    (a ? String(a.length).padStart(7) : '   MISS') + ' identical=' + same);
  /* assets 是 web 的副本，改了 web 还没重新出包时这里就会 false。
   * 出包前必须为 true —— 否则包里带的是上一版的页面。 */
  if (!same) fail(n + ' 与 assets 不一致（先跑 tools/build_apk.py）');
}

const app = read('web/app.js');
const lic = read('web/license.js');
const idx = read('web/index.html');
const about = read('web/about.js');
const cx = read('web/chaoxing.js');

console.log('\ncheckpoints:');
const refs = (hay, needle) => (hay.match(new RegExp(needle, 'g')) || []).length;
console.log('  app.js  kbMismatchAck       =', refs(app, 'kbMismatchAck'), 'refs');
console.log('  app.js  kbMismatchToastShown=', refs(app, 'kbMismatchToastShown'), 'refs');
/* 这两个 flag 至少要各出现 3 次（声明 / 置位 / 判定），只出现在注释里说明
 * 代码没接上 —— v1.1.2 之前就是这样：注释写得头头是道，flag 一个都没用。 */
if (refs(app, 'kbMismatchAck') < 3) fail('app.js 里 kbMismatchAck 只出现 ' + refs(app, 'kbMismatchAck') + ' 次，像是没接上');
if (refs(app, 'kbMismatchToastShown') < 2) fail('app.js 里 kbMismatchToastShown 出现次数过少，像是没接上');
console.log('  license looksLikeAccount    =', /function looksLikeAccount/.test(lic));
console.log('  license PLACEHOLDER_WORDS   =', /const PLACEHOLDER_WORDS = \[/.test(lic));
console.log('  license clearCheck          =', /function clearCheck/.test(lic));
console.log('  license clearCheck 已导出   =', /^\s+clearCheck,\s*$/m.test(lic));
console.log('  about.js #btnClearCheck     =', /\$\('btnClearCheck'\)/.test(about));
console.log('  index.html #btnClearCheck   =', /id="btnClearCheck"/.test(idx));

/* ---- v1.1.5 作业状态解析 ----
 *
 * 这一批的失败方式全是「静默」：解析不到就 status=''，然后被当成「已完成」，
 * 不报错、不报警、日志里也看不出来。所以每一处关键改动都得有个静态锚点，
 * 防止有人后来「顺手简化」把它改回去。 */
console.log('  chaoxing pickStatus         =', /function pickStatus/.test(cx));
console.log('  chaoxing wordIn             =', /function wordIn/.test(cx));
console.log('  chaoxing status_known       =', refs(cx, 'status_known'), 'refs');
console.log('  app.js   status_known       =', refs(app, 'status_known'), 'refs');
console.log('  app.js   isDoneStatus       =', /function isDoneStatus/.test(app));
console.log('  app.js   状态未知 角标       =', refs(app, '状态未知'), 'refs');
if (!/function pickStatus/.test(cx)) fail('chaoxing.js 里没有 pickStatus（状态提取被改回去了？）');
if (refs(cx, 'status_known') < 2) fail('chaoxing.js 里 status_known 次数过少');
if (refs(app, 'status_known') < 1) fail('app.js 里没用上 status_known');
if (!/function isDoneStatus/.test(app)) fail('app.js 里没有 isDoneStatus（分桶会退回「读不到=已完成」）');
/* 「—」是这次 bug 的视觉指纹：角标取不到状态就印一个短横，
 * 用户看到以为没事。必须确保它不在角标路径上出现。 */
if (/\?\?\s*'—'|status\s*\|\|\s*'—'/.test(app)) fail('app.js 里还有把空状态渲染成「—」的地方');
/* 「未批阅」必须在完成侧：它和「待批阅」是同一件事的两种写法，
 * 判成待做会让用户以为还要再交一次。 */
if (!/DONE_WORDS\s*=[^\n]*未批阅/.test(cx)) fail('chaoxing.js 的 DONE_WORDS 里没有「未批阅」');
if (/OPEN_WORDS\s*=[^\n]*未批阅/.test(cx)) fail('chaoxing.js 的 OPEN_WORDS 里还留着「未批阅」（会和完成侧打架）');
console.log('  about.js #btnShowHwRaw      =', /\$\('btnShowHwRaw'\)/.test(about));
console.log('  index.html #btnShowHwRaw    =', /id="btnShowHwRaw"/.test(idx));
if (!/\$\('btnShowHwRaw'\)/.test(about)) fail('about.js 没有「查看作业状态原文」按钮的绑定');
if (!/id="btnShowHwRaw"/.test(idx)) fail('index.html 没有「查看作业状态原文」按钮');

/* ---- v1.1.6 教程 / 校园图片 / 留言板 / 审核 ----
 *
 * 这一批全是「新的东西」，最怕的是「写了代码但没接上入口」：
 * 页面里有 DOM 却没人 render、按钮有绑定但依赖的文件没加载、
 * 上传链路少一环（前端调了不存在的方法）。逐条钉住。 */
const tut = read('web/tut.js');
const wiki = read('web/wiki.js');
const auth = read('web/auth.js');
console.log('\nv1.1.6 checkpoints:');
console.log('  tut.js PAGES                =', refs(tut, 'ttl:'), 'pages');
console.log('  index.html #tut             =', /id="tut"/.test(idx));
console.log('  index.html rowTut           =', /id="rowTut"/.test(idx));
console.log('  index.html tut.js 已加载    =', /src="tut\.js"/.test(idx));
console.log('  app.js Tut.init             =', refs(app, 'Tut.init()'), 'refs');
console.log('  about.js Tut.afterUnlock    =', refs(about, 'Tut.afterUnlock'), 'refs');
if (refs(tut, 'ttl:') < 5) fail('tut.js 的 PAGES 少于 5 页，教程被删短了？');
if (!/id="tut"/.test(idx)) fail('index.html 没有教程层 #tut');
if (!/id="rowTut"/.test(idx)) fail('index.html「我的」没有「使用教程」入口');
if (!/src="tut\.js"/.test(idx)) fail('index.html 没加载 tut.js（教程永远不出现）');
if (refs(app, 'Tut.init()') < 2) fail('app.js 里 Tut.init() 少于 2 处（__onUnlocked 与末尾各一次）');
if (refs(about, 'Tut.afterUnlock') < 2) fail('about.js 里没接 Tut.afterUnlock（教程不会在解锁后弹出）');

console.log('  wiki photosSection          =', /function photosSection/.test(wiki));
console.log('  wiki fbSection              =', /function fbSection/.test(wiki));
console.log('  wiki startUpload            =', /function startUpload/.test(wiki));
console.log('  wiki composeFeedback        =', /function composeFeedback/.test(wiki));
console.log('  wiki __onPhotoUploaded      =', /__onPhotoUploaded/.test(wiki));
console.log('  auth Photos/Feedback        =', /const Photos =/.test(auth) && /const Feedback =/.test(auth));
console.log('  auth 已导出 Photos/Feedback =', /Admin, Photos, Feedback,/.test(auth));
console.log('  index.html #revPhotoList    =', /id="revPhotoList"/.test(idx));
console.log('  index.html #revFbList       =', /id="revFbList"/.test(idx));
console.log('  app.js loadRevPhotos        =', /function loadRevPhotos/.test(app));
console.log('  app.js loadRevFb            =', /function loadRevFb/.test(app));
if (!/function photosSection/.test(wiki)) fail('wiki.js 没有 photosSection（校园图片墙）');
if (!/function fbSection/.test(wiki)) fail('wiki.js 没有 fbSection（留言板）');
if (!/function startUpload/.test(wiki)) fail('wiki.js 没有 startUpload（传图入口）');
if (!/__onPhotoUploaded/.test(wiki)) fail('wiki.js 没有 __onPhotoUploaded（上传结果回不来，按钮会永久卡住）');
if (!(/const Photos =/.test(auth) && /const Feedback =/.test(auth))) fail('auth.js 没有 Photos/Feedback 导出');
if (!/Admin, Photos, Feedback,/.test(auth)) fail('auth.js 的 return 里没带 Photos/Feedback（外部拿不到）');
if (!/id="revPhotoList"/.test(idx)) fail('index.html 管理端没有图片审核列表');
if (!/id="revFbList"/.test(idx)) fail('index.html 管理端没有留言列表');
if (!/function loadRevPhotos/.test(app) || !/function loadRevFb/.test(app)) fail('app.js 审核面板逻辑缺失');

/* prompt() 在 Android WebView 里默认返回 null（onJsPrompt 默认不实现）。
 * v1.1.6 已经在 MainActivity.Chrome 里接管了，但 wiki 这种长输入的入口
 * 改成了页面内表单 —— 如果 wiki.js 又冒出 prompt()，说明有人改回去了。
 *
 * 注意要先剥注释再数：wiki.js 里明明有几段注释在讲「prompt() 为什么是死的」，
 * 直接数会把说明文字当成调用（第一次跑就是这样假报的）。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}
const wikiPrompt = (stripComments(wiki).match(/\bprompt\s*\(/g) || []).length;
console.log('  wiki.js prompt() 调用       =', wikiPrompt);
if (wikiPrompt > 0) fail('wiki.js 里又出现 prompt()（WebView 里拿不到输入，要用页面内表单）');

/* ---- v1.1.7 限流事故 / XSS / 诊断接口 ----
 *
 * 这一批修的三个东西都极难靠「点一遍」发现：
 *   1. 限流键用了 IP —— 单机怎么测都在阈值内，全校一起用就是第 21 个人被 429
 *   2. innerHTML 拼错误信息 —— 平时只是显示难看，遇到恶意内容才是注入
 *   3. 边缘缓存要显式调 caches.default —— 只写 cache-control 头等于没做
 * 所以每一处都要有静态锚点。 */
const worker = read('server/worker.js');
const pagesW = read('server/pages/dist/_worker.js');
const authSrc = auth;
console.log('\nv1.1.7 checkpoints:');
console.log('  worker x-xxmu-via            =', /xxmu-pages-proxy-v1/.test(worker));
console.log('  worker rlKey(fp)             =', /function rlKey\(req, prefix, fp\)/.test(worker));
console.log('  worker /v1/_diag             =', /p === '\/v1\/_diag'/.test(worker));
console.log('  pages  转发真实 IP           =', /headers\.set\('x-xxmu-ip', ip\)/.test(pagesW));
console.log('  app.js errText/hintInto      =', /function errText/.test(app) && /function hintInto/.test(app));
console.log('  app.js 残留 innerHTML 注入   =',
  (app.match(/innerHTML\s*=\s*'<p class="hint">'\s*\+/g) || []).length);if (!/xxmu-pages-proxy-v1/.test(worker)) fail('worker.js 里没有 PROXY_TAG（拿不到真实 IP，限流会按全校共享）');
if (!/function rlKey\(req, prefix, fp\)/.test(worker)) fail('worker.js 里没有 rlKey（限流键退回按 IP）');
if (!/function clientIp\(req\)/.test(worker)) fail('worker.js 里没有 clientIp');
if (!/headers\.set\('x-xxmu-ip', ip\)/.test(pagesW)) fail('pages 代理没把真实 IP 转发给上游（限流退化成全校共享一个桶）');
if (!/function errText/.test(app) || !/function hintInto/.test(app)) fail('app.js 缺 errText/hintInto（错误信息又会被拼进 innerHTML）');
/* 这个正则是「把动态内容拼进 innerHTML 的 hint 段落」的字面指纹。
 * 允许纯字符串字面量（如 innerHTML = '<p class="hint">读取中…</p>'），
 * 只禁止带 + 拼接的写法。 */
if (/innerHTML\s*=\s*'<p class="hint">'\s*\+/.test(app)) fail('app.js 还在把动态内容拼进 innerHTML（XSS / 显示错乱）');
if (!/fp:\s*f/.test(authSrc)) fail('auth.js 的 feedbackPost 没带 fp（限流会退回按 IP，全校共享额度）');

/* ---- v1.1.8 审计修复 ----
 *
 * 这一批来自两份审计报告（docs/audit-frontend.md 27 条、docs/audit-backend.md 28 条），
 * 全都是「点一遍看不出来」的那一类：静默失败、状态机不一致、契约错位。
 * 每一条都留一个静态锚点 —— 只要有人后来把它「顺手简化」掉，这里就红。
 *
 * 分成三组钉：
 *   A. 前端静默失败类 —— errText/hintInto 用得对不对、状态窗口有没有复位
 *   B. 契约/状态类     —— 服务端 idxApply、sha256 校验、幂等守卫
 *   C. 显示类          —— 不许再把 undefined / 「—」/「已过期但显示有效」印上屏
 */
const syncJs = read('web/sync.js');
const onboardJs = read('web/onboard.js');
console.log('\nv1.1.8 checkpoints:');

/* A. 前端 */
console.log('  onboard 转发 chk 参数       =', /window\.__onLoginSuccess = function \(chk\)/.test(onboardJs));
console.log('  onboard 转发旧回调          =', /oldKb\(chk\)/.test(onboardJs));
console.log('  onboard cx 转发 r           =', /oldCx\(r\)/.test(onboardJs));
if (!/window\.__onLoginSuccess = function \(chk\)/.test(onboardJs)) fail('onboard.js 又把 __onLoginSuccess 包成无参函数（学号核对会被吞掉，第一次登录就放行）');
if (!/oldKb\(chk\)/.test(onboardJs)) fail('onboard.js 包装里没把 chk 传下去（同上）');

console.log('  sync parseWeeks 降级        =', refs(syncJs, 'parseWeeks'), 'refs');
console.log('  sync showable               =', /showable:/.test(syncJs));
console.log('  sync bad_weeks              =', /bad_weeks:/.test(syncJs));
if (refs(syncJs, 'parseWeeks') < 2) fail('sync.js 的 parseWeeks 只出现一次（降级链被删短了？）');
if (!/showable:/.test(syncJs)) fail('sync.js 的 buildSchedule 没返回 showable（同步完成时会谎报门数）');
if (!/bad_weeks:/.test(syncJs)) fail('sync.js 的 buildSchedule 没返回 bad_weeks（周次没读懂时无从排查）');

console.log('  app crowded 叠放            =', refs(app, 'crowded'), 'refs');
console.log('  app blocksOf 不再 return 丢课 =', /s = g\.min;/.test(app));
console.log('  app SYNCING 重入锁          =', refs(app, 'SYNCING'), 'refs');
console.log('  app __x 挂在卡片上          =', /it\.__x = x/.test(app));
console.log('  app 定时器只改文本          =', /lf\.textContent = txt/.test(app));
if (refs(app, 'crowded') < 3) fail('app.js 里 crowded 出现次数过少（排不下的课会被静默丢掉）');
if (!/s = g\.min;/.test(app)) fail('app.js 的 blocksOf 又直接 return 丢课了');
if (refs(app, 'SYNCING') < 3) fail('app.js 的 syncSchedule 没有重入锁（并发点击会互相提前解锁）');
if (!/it\.__x = x/.test(app)) fail('app.js 的 cardOf 没把数据挂到 DOM（每分钟定时器会重建整个列表）');
if (!/lf\.textContent = txt/.test(app)) fail('app.js 的倒计时定时器又在整页重画了');

console.log('  app saveKey 回滚内存口令    =', /AUTH\.Admin\.setKey\(prev/.test(app));
if (!/AUTH\.Admin\.setKey\(prev/.test(app)) fail('app.js 的 saveKey 验证失败后没回滚内存里的口令');

console.log('  wiki PHOTO_ERR              =', /PHOTO_ERR/.test(wiki));
console.log('  wiki FB_ERR                 =', /FB_ERR/.test(wiki));
console.log('  wiki 单飞 INFLIGHT          =', refs(wiki, 'INFLIGHT'), 'refs');
if (!/PHOTO_ERR/.test(wiki)) fail('wiki.js 图片拉取失败时不再保留错误态（会退化成「暂无图片」，把网络问题说成没内容）');
if (!/FB_ERR/.test(wiki)) fail('wiki.js 留言板同样缺 FB_ERR');
if (refs(wiki, 'INFLIGHT') < 4) fail('wiki.js 的图片/留言请求没有单飞（一次启动会打三遍服务器）');

console.log('  tut replayMode              =', refs(tut, 'replayMode'), 'refs');
console.log('  tut init 幂等守卫           =', /if \(inited\) return;/.test(tut));
if (refs(tut, 'replayMode') < 3) fail('tut.js 的 replay 又去覆盖翻页回调了（重看一遍教程后永远进不了登录引导）');
if (!/if \(inited\) return;/.test(tut)) fail('tut.js 的 init 没有幂等守卫（双跑会叠两份监听器）');

/* B. 契约 / 状态 */
console.log('  license isActivated 校验格式 =', /function whoami\(\)[\s\S]{0,200}\^\\d\{6,20\}\$/.test(lic));
console.log('  license whoami 已收紧       =', /\^\\d\{6,20\}\$/.test(lic));
if (!/\^\\d\{6,20\}\$/.test(lic)) fail('license.js 里没有学号格式校验（谁都能往 pref 里塞个「账号」当学号）');

console.log('  auth HARD/KEEP 分档         =', /const HARD =/.test(auth) && /const KEEP =/.test(auth));
console.log('  auth activate 记住旧学号    =', /const prevId = LICENSE\.whoami\(\)/.test(auth));
if (!/const HARD =/.test(auth)) fail('auth.js 又把所有失败一律当「被停用」处理（一次限流就把本地登记清空）');
if (!/const prevId = LICENSE\.whoami\(\)/.test(auth)) fail('auth.js 的 activate 没记住原学号，失败后无法回滚');

console.log('  worker idxApply             =', /function idxApply\(/.test(worker));
console.log('  worker idx 损坏不重建       =', /拒绝自动重建/.test(worker));
console.log('  worker constEq 口令比较     =', /function constEq\(/.test(worker));
console.log('  worker 孤儿图清理           =', /act === 'orphan'/.test(worker));
console.log('  worker 子请求分页           =', /const PAGE = 40;/.test(worker));
if (!/function idxApply\(/.test(worker)) fail('worker.js 没有 idxApply（每次激活都整表重写，一天能磨光 KV 写额度）');
if (!/拒绝自动重建/.test(worker)) fail('worker.js 的 getIdx 又会用空数组覆盖真实名单（一次 KV 读失败就永久清空）');
if (!/function constEq\(/.test(worker)) fail('worker.js 的管理员口令又不是定长比较了');
if (!/act === 'orphan'/.test(worker)) fail('worker.js 没有孤儿图清理入口');
if (!/const PAGE = 40;/.test(worker)) fail('worker.js 的管理列表没有分页（留言超 40 条就会撞免费版子请求上限）');

const httpJava = read('android/src/com/xxmu/helper/Http.java');
const mainJava = read('android/src/com/xxmu/helper/MainActivity.java');
console.log('  Http.sha256                 =', /static String sha256\(java\.io\.File/.test(httpJava));
console.log('  MainActivity 校验安装包     =', /Http\.sha256\(out\)/.test(mainJava));
console.log('  MainActivity 域名白名单     =', /allowedCookieHost/.test(mainJava));
console.log('  MainActivity 路径白名单     =', /insideAppDirs/.test(mainJava));
if (!/static String sha256\(java\.io\.File/.test(httpJava)) fail('Http.java 没有 sha256（下载装了一半的包也会被判成功）');
if (!/Http\.sha256\(out\)/.test(mainJava)) fail('MainActivity 下载后没校验 sha256');
if (!/allowedCookieHost/.test(mainJava)) fail('MainActivity 的 httpGet 没有域名白名单（会带着教务 Cookie 访问任意 URL）');
if (!/insideAppDirs/.test(mainJava)) fail('MainActivity 的 uploadApk 没有路径白名单（JS 能把 pref 文件外传）');

/* C. 显示类 */
console.log('  about 过期显示「已过期」    =', /已过期，重新登录一次/.test(about));
console.log('  app 尺寸未知                =', /尺寸未知/.test(app));
console.log('  app 重新上架                =', /重新上架/.test(app));
if (!/已过期，重新登录一次/.test(about)) fail('about.js 过期后还显示「有效 · 剩 0 天」');
if (!/尺寸未知/.test(app)) fail('app.js 审核页又会在没读到图片尺寸时印「0×0」');
if (!/重新上架/.test(app)) fail('app.js 审核页没有「重新上架」（下架成了不可逆操作）');
/* undefined 上屏：v1.1.8 修的就是这个 —— 作息串没有 `~` 时
 * `.split('~')[1]` 是 undefined，卡片上直接印出来。 */
if (/split\('~'\)\[1\]/.test(app)) fail('app.js 还在用 t.split(\'~\')[1]（无分隔符时会把 undefined 印上屏）');
if (!/function firstTime/.test(app) || !/function lastTime/.test(app)) fail('app.js 缺 firstTime/lastTime（作息串解析没有兜底）');

/* ---- v1.1.9 自毁类加固 ----
 *
 * 这一批全部来自「读失败之后还继续往下写」这一类：出错本身不可怕，
 * 可怕的是把出错的结果当成事实存回去，事后再也分不清哪些是真的。
 * 每条都钉一个锚点。
 */
const pagesJs = read('server/pages/dist/_worker.js');
console.log('\nv1.1.9 checkpoints:');

console.log('  worker IDX_CAP              =', /const IDX_CAP = \d+;/.test(worker));
console.log('  worker 名单上限跳过新增     =', /idx\.length >= IDX_CAP/.test(worker));
if (!/const IDX_CAP = \d+;/.test(worker)) fail('worker.js 没有名单条数上限（假学号可以无限新增、无限写 KV）');
if (!/idx\.length >= IDX_CAP/.test(worker)) fail('worker.js 的 idxApply 没做上限判断');

console.log('  worker cfg 坏值不缓存       =', /cfg 解析失败，本次不缓存/.test(worker));
if (!/cfg 解析失败，本次不缓存/.test(worker)) fail('worker.js 的 getCfg 又把「解析失败」的默认值缓存了（公告会莫名消失 60 秒）');

console.log('  worker 激活口令走 constEq   =', /!constEq\(ak, want\)/.test(worker));
if (!/!constEq\(ak, want\)/.test(worker)) fail('worker.js 的 handleActivate 又用短路字符串比较口令了');

console.log('  pages 读 body 兜住          =', /init\.body = await request\.arrayBuffer\(\);/.test(pagesJs) && /catch \(e\) \{[\s\S]{0,200}413/.test(pagesJs));
if (!/413/.test(pagesJs)) fail('pages 代理读 body 失败时又会回平台默认 500 HTML（客户端会把它当网络不通）');

console.log('  chaoxing cached 记原因      =', /LAST_READ_ERR/.test(cx));
console.log('  chaoxing 导出 readErr       =', /readErr: \(\) => LAST_READ_ERR/.test(cx));
if (!/LAST_READ_ERR/.test(cx)) fail('chaoxing.js 的 cached() 又把「缓存坏了」静默当成「没同步过」');
if (!/readErr: \(\) => LAST_READ_ERR/.test(cx)) fail('chaoxing.js 没导出 readErr，界面拿不到失败原因');

console.log('  app 读 CX.readErr           =', /CX\.readErr\(\)/.test(app));
if (!/CX\.readErr\(\)/.test(app)) fail('app.js 的 renderHomework 没读 CX.readErr()（作业页会把缓存损坏显示成没数据）');

/* v1.1.10：抗打三条。这三条失效时全都不报错，只是「缓存悄悄不生效、
 * 请求悄悄进 Worker」，所以必须钉死在静态体检里。 */
console.log('\nv1.1.10 checkpoints:');
console.log('  edgeCache 支持 ignoreQuery  =', /ignoreQuery/.test(worker));
if (!/ignoreQuery/.test(worker)) fail('worker.js 的 edgeCache 又不认 ignoreQuery（随机 query 能绕过缓存打穿 KV 额度）');
console.log('  config/photos/feedback 忽略 query =',
  (worker.match(/ignoreQuery: true/g) || []).length >= 3);
if ((worker.match(/ignoreQuery: true/g) || []).length < 3) {
  fail('worker.js 里 ignoreQuery 少于 3 处（/v1/config、/v1/photos、/v1/feedback 都要用）');
}
console.log('  edgeCache 支持 negTtl       =', /negTtl/.test(worker));
if (!/negTtl/.test(worker)) fail('worker.js 的 edgeCache 不支持 404 负缓存（/v1/photo?k=随机 每次都读 ph:idx）');
console.log('  edgeCache 支持 costLimit    =', /costLimit/.test(worker));
if (!/costLimit/.test(worker)) fail('worker.js 的 edgeCache 没做回源限额（换着 key 刷负缓存救不了）');
console.log('  全局兜底限流 all:ip:        =', /all:ip:/.test(worker));
if (!/all:ip:/.test(worker)) fail('worker.js 没有全局兜底限流（未匹配路由的请求可以无限打）');
const allIdx = worker.indexOf("all:ip:");
const firstRoute = worker.indexOf("if (p === '/v1/config')");
console.log('  兜底限流在路由之前          =', allIdx > 0 && firstRoute > 0 && allIdx < firstRoute);
if (!(allIdx > 0 && firstRoute > 0 && allIdx < firstRoute)) {
  fail('全局兜底限流不在所有路由之前（写在后面等于没写）');
}

// ---- v1.1.11：首次打开的「使用声明」 ----
const disc = read('web/disc.js');
console.log('\nv1.1.11 checkpoints:');
const has = (hay, needle, label) => {
  const ok = hay.indexOf(needle) >= 0;
  console.log('  ' + String(label).padEnd(28) + '=', ok);
  if (!ok) fail('缺少 ' + label + '（' + needle + '）');
  return ok;
};
has(disc, "const K = 'xxmu_disc_done';", 'disc.js pref 键');
has(disc, 'function afterUnlock()', 'disc.js afterUnlock');
has(disc, 'function replay()', 'disc.js replay');
has(disc, 'let replayMode = false;', 'disc.js replayMode');
has(idx, 'id="disc"', 'index.html 声明层');
has(idx, 'id="discOk"', 'index.html 已知晓按钮');
has(idx, 'id="discX"', 'index.html 关闭按钮');
has(idx, 'id="rowDisc"', '我的页声明入口');
has(idx, 'id="discCard"', '关于页完整声明卡');
has(idx, '<script src="disc.js"></script>', 'disc.js 已引入');
has(about, "typeof Disc !== 'undefined'", 'about.js 转交 Disc');
has(app, "Disc.init()", 'app.js 调 Disc.init');
/* 顺序硬约束：声明必须排在教程之前。写在后面等于被连点跳过。 */
const di = about.indexOf("Disc !== 'undefined'");
const ti = about.indexOf("Tut !== 'undefined'");
console.log('  声明在教程之前              =', di > 0 && ti > 0 && di < ti);
if (!(di > 0 && ti > 0 && di < ti)) fail('about.js 里 Disc 必须排在 Tut 之前（顺序错了声明会被连点跳过）');
/* done() 的兜底方向必须和 tut 相反：声明读不到 pref 要当「没看过」。 */
const discDone = /function done\(\)\s*\{[\s\S]{0,320}?catch \(e\) \{ return false; \}/.test(disc);
console.log('  disc.done() 读不到当未看过   =', discDone);
if (!discDone) fail('disc.js 的 done() 读不到 pref 时必须返回 false（声明不能因为 pref 抽风被永久跳过）');

// ---- v1.1.12：管理员口令保存链路 ----
/* 这一批全是「看起来在跑、其实一个字都没执行」的类型，静态锚点是唯一能
 * 在没有真机的情况下守住它们的手段。auth 在上面 114 行已读过了。 */
console.log('\nv1.1.12 checkpoints:');
/* 必须剥掉注释再查：v1.1.12 的修复说明里就引用了 `AUTH.Admin.key()` 这个
 * 错误写法，不剥注释会把自己的注释当成违规命中。 */
function stripComments(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}
const keyCall = /Admin\.key\s*\(\s*\)/.test(stripComments(app)) || /Admin\.key\s*\(\s*\)/.test(stripComments(auth));console.log('  Admin.key 未被当函数调用      =', !keyCall);
if (keyCall) fail('有 Admin.key() 调用 —— Admin.key 是字符串属性，调用它会抛 TypeError，整个保存口令流程会静默中断');
/* 2) 保存口令前必须把输入里的空白全去掉（复制口令最常带进来的是换行）。 */
has(app, '.replace(/\\s+/g, \'\')', 'app.js 口令去空白');
/* 3) 失败提示要同时写两个位置，不能只写一个（用户看的是概览条）。 */
const bothMsg = /setMsg\(msg, why\);[\s\S]{0,120}?setMsg\(statMsg, why\);/.test(app);
console.log('  口令失败两处都提示            =', bothMsg);
if (!bothMsg) fail('saveKey 失败时必须在 #admKeyMsg 和 #admStatMsg 都写提示（原来只有一处，另一处残留旧错误）');
/* 4) 输入框要关掉自动大写/自动纠错，否则手机键盘会把口令首字母改成大写。 */
const noCap = /id="admKey"[\s\S]{0,200}?autocapitalize="off"/.test(idx);
console.log('  口令框关掉自动大写            =', noCap);
if (!noCap) fail('index.html 的 #admKey 必须带 autocapitalize="off" 与 autocorrect="off"');

// ---- v1.1.13：课表空态与解析器 ----
/* 这一批守的是「课表一片空白但界面一个字不说」这种失败方式：
 * ①状态说明必须排在网格上方（原来排在 14 行网格下面，手机滚不到）；
 * ②节次要能读两位（第 10 节及以后是 k110 / k111，旧正则只认一位）；
 * ③课程块 div 的属性顺序不能被写死（学校调一下顺序就整块失配）；
 * ④必须留诊断出口，否则下次还得靠猜。 */
console.log('\nv1.1.13 checkpoints:');
has(idx, 'id="kbBar"', 'index.html 课表状态条');
has(idx, 'id="kbBarT"', 'index.html 状态条标题');
has(idx, 'id="kbBarS"', 'index.html 状态条正文');
has(idx, 'id="kbBarSync"', 'index.html 状态条同步按钮');
has(idx, 'id="kbBarDiag"', 'index.html 状态条诊断按钮');
has(idx, 'id="btnShowKbRaw"', 'index.html 查看课表原文按钮');
has(app, 'function paintKbBar(', 'app.js paintKbBar');
has(app, 'function kbWeekStats(', 'app.js kbWeekStats');
has(app, 'function kbDiagText(', 'app.js kbDiagText');
has(syncJs, 'function diagReset(', 'sync.js diagReset');
has(syncJs, 'function keepSample(', 'sync.js keepSample');
has(about, 'btnShowKbRaw', 'about.js 绑定查看课表原文');
has(about, 'version: () => APP_VERSION', 'about.js 导出 version（诊断要版本号）');

/* 状态条必须排在 #grid 之前 —— 这是整个 v1.1.13 的核心修复，位置写错等于没修。 */
const kbBarPos = idx.indexOf('id="kbBar"');
const gridPos = idx.indexOf('id="grid"');
const barBeforeGrid = kbBarPos >= 0 && gridPos >= 0 && kbBarPos < gridPos;
console.log('  kbBar 排在 grid 之前          =', barBeforeGrid);
if (!barBeforeGrid) fail('index.html 的 #kbBar 必须排在 #grid 之前（排到网格下面就又滚不到了）');

/* 节次正则必须是 \d{1,2}，写成 \d 会静默丢掉第 10 节及以后的所有课。 */
const cellRe2 = syncJs.indexOf('k(\\d)(\\d{1,2})') >= 0;
console.log('  cellRe 节次认两位             =', cellRe2);
if (!cellRe2) fail('sync.js 的 cellRe 节次必须是 (\\d)(\\d{1,2})，只认一位会静默丢第 10 节以后的课');

/* 课程块正则必须用两个前瞻：串联的 [^>]* 只放宽了空格和引号，没放宽属性顺序。 */
const cReOrderFree = syncJs.indexOf('(?=[^>]*padding-bottom:\\s*5px)(?=[^>]*clear:\\s*both)') >= 0;
console.log('  课程块正则顺序无关            =', cReOrderFree);
if (!cReOrderFree) fail('sync.js 的课程块正则要用两个前瞻断言（padding-bottom 与 clear 各一个），串联写法换个属性顺序就失配');

// ---- v1.1.14：详情卡点了没反应 ----
/* 详情卡排在名单卡下面，名单卡自己就占满一屏（#admList 有 max-height:46vh，
 * 上面还有搜索框和筛选条）。v1.1.13 及以前只把 display 从 none 改成 block，
 * 卡片出现了但落在视口外面 —— 用户看到的是「点详情没有任何反应」。
 * 和课表那个「提示排在 14 行网格下面」是同一类错：内容在，位置不可见。
 * 所以这一批守两件事：①打开时必须主动滚到卡片；②收起时要能回到刚才那一行。 */
console.log('\nv1.1.14 checkpoints:');
has(app, 'function showDetail(id, fromRow)', 'app.js showDetail 接收来源行');
has(app, 'let DETAIL_FROM = null', 'app.js DETAIL_FROM 记来源行');
has(app, 'showDetail(r.id, row)', 'app.js 详情按钮把行传下去');
has(app, "card.scrollIntoView({ behavior: 'smooth', block: 'start' })", 'app.js 打开详情后滚到卡片');
has(app, 'DETAIL_FROM.scrollIntoView', 'app.js 收起详情后滚回原行');

/* 这条是硬约束：只改 display 不滚动，等于没修。 */
const detailScrolls = app.indexOf("card.style.display = 'block'") >= 0
  && app.indexOf('card.scrollIntoView') > app.indexOf('function showDetail(id, fromRow)')
  && app.indexOf('card.scrollIntoView') - app.indexOf('function showDetail(id, fromRow)') < 1200;
console.log('  详情卡打开后主动滚动          =', detailScrolls);
if (!detailScrolls) fail('showDetail 里改完 display 必须紧跟着 scrollIntoView，否则卡片落在视口外面');

/* 位置硬约束：详情卡必须排在名单卡【上面】。
 * 排下面时哪怕加了 scrollIntoView 也还有个坑 —— 名单卡自己 max-height:46vh，
 * 详情卡被推到很远，滚动距离大、手感是「页面猛地跳一下」。 */
const dCardPos = idx.indexOf('id="admDetailCard"');
const lCardPos = idx.indexOf('id="admListCnt"');
const detailBeforeList = dCardPos >= 0 && lCardPos >= 0 && dCardPos < lCardPos;
console.log('  详情卡排在名单卡之前          =', detailBeforeList);
if (!detailBeforeList) fail('index.html 的 #admDetailCard 必须排在名单卡之前（排在下面会落在视口外）');

// ---- v1.1.15：静默失败与资源泄漏（两轮审计剩下的「轻微」项里真会咬人的那批） ----
/* 这一批的共同点是「出错时界面不说、运行久了才炸」，所以更要静态锚点：
 * 它们全都只在异常路径上出问题，正常点一遍永远看不出来。 */
console.log('\nv1.1.15 checkpoints:');

/* ① Java 侧读文件必须能区分「读失败」和「没有数据」。
 * MainActivity.readFileIfBig 现在失败返回 null、没文件返回 ""。
 * 反过来的后果是：读失败被当成「没有外部课表」，一路退到内置
 * window.SCHEDULE —— 学生看到上一学期甚至别人的课表，界面写着「已同步」。 */
const mact = read('android/src/com/xxmu/helper/MainActivity.java');
has(mact, 'return null;', 'Java readFileIfBig 失败回 null');
has(mact, 'if (f == null || !f.exists()) return "";', 'Java 没文件仍回空串');
has(mact, 'try (FileInputStream in = new FileInputStream(f))', 'Java 读流 try-with-resources');
has(mact, 'try (FileOutputStream out = new FileOutputStream(f))', 'Java 写流 try-with-resources');
/* 前端四个读入口都必须显式判 null，否则 Java 改了等于白改。 */
has(app, '外部课表读取失败', 'app.js 外部课表判 null');
has(app, '本地课表缓存读取失败', 'app.js 课表缓存判 null');
has(app, '外部作业读取失败', 'app.js 外部作业判 null');
has(app, '本地作业缓存读取失败', 'app.js 作业缓存判 null');

/* ② 上传的 OutputStream 必须进 finally。弱网下上传失败很常见，
 * 不关写端会留半开连接，重试几次后 fd 耗尽，整个 App 的网络与文件一起失效。 */
const httpJ = read('android/src/com/xxmu/helper/Http.java');
const osFinally = (httpJ.match(/if \(os != null\) \{ try \{ os\.close\(\); \}/g) || []).length;
console.log('  Http os.close 进 finally 处数  =', osFinally);
if (osFinally < 2) fail('Http.uploadFile / uploadRaw 的 OutputStream 都要在 finally 里关（当前 ' + osFinally + ' 处）');
has(httpJ, 'OutputStream os = null;', 'Http os 提到 try 外');

/* ③ onJsPrompt 弹框前必须判 Activity 是否已销毁。
 * 否则 show() 抛 BadTokenException 被兜成 result.cancel()，
 * 现象正是「点『+ 补一条』什么都没发生」。 */
has(mact, 'if (isFinishing() || isDestroyed()) {', 'Java prompt 前判 Activity 存活');

/* ④ 公开留言板不再拼学号后 4 位；_diag 的三项自检收进管理员。 */
has(worker, "from: r.id ? '同学' : '匿名'", 'worker 留言不露学号后 4 位');
const leakTail = /from: r\.id \? \('同学' \+ String\(r\.id\)\.slice\(-4\)\)/.test(worker);
console.log('  留言板不再拼学号后 4 位        =', !leakTail);
if (leakTail) fail('worker.js 的公开留言板又拼了学号后 4 位');
/* _diag 的公开分支只能回 ok/ver，详细自检必须在 isAdmin 后面。 */
const diagPub = worker.indexOf("if (p === '/v1/_diag')");
const diagAdmin = worker.indexOf('if (!isAdmin(req, env)) return json({ ok: true, ver: 4 });');
const diagFlag = worker.indexOf('ipLooksInternal:');
console.log('  _diag 详细自检仅管理员        =',
  diagPub > 0 && diagAdmin > diagPub && diagFlag > diagAdmin);
if (!(diagPub > 0 && diagAdmin > diagPub && diagFlag > diagAdmin)) {
  fail('/v1/_diag 的 viaProxy/ipForwarded/ipLooksInternal 必须排在 isAdmin 判断之后');
}

/* ⑤ handleSetCfg：noticeAt 只认 0，maxDev 非法值直接拒。
 * 前者「配了公告写不进 KV」、后者「想设 0 台却静默回退」，都是保存成功但没生效。 */
has(worker, "if (b.noticeAt !== undefined && (parseInt(b.noticeAt, 10) || 0) === 0)", 'cfg noticeAt 只认清空');
const naiveNotice = /if \(b\.noticeAt !== undefined\) \{\s*noticeAt = parseInt\(b\.noticeAt, 10\) \|\| 0;/.test(worker);
console.log('  noticeAt 不再无条件采用        =', !naiveNotice);
if (naiveNotice) fail('handleSetCfg 又把 b.noticeAt 无条件采用了（整包回写会让新公告对所有人不可见）');
has(worker, "if (n < 1 || n > 10) return bad('设备上限要在 1-10 之间');", 'cfg maxDev 非法值直接拒');
const naiveMax = /maxDev: b\.maxDev === undefined \? cur\.maxDev : \(parseInt\(b\.maxDev, 10\) \|\| cur\.maxDev\)/.test(worker);
console.log('  maxDev 不再静默回退            =', !naiveMax);
if (naiveMax) fail('handleSetCfg 的 maxDev 又写成 parseInt(...) || cur.maxDev（无法设 0 / NaN 静默回退）');

/* ⑥ 管理台节流下沉 + 名单保留滚动位置。
 * 前者：连续审核十几个人会连发十几次全量 list()；后者：每次重画都跳回顶部。 */
has(app, 'function refreshStats(force)', 'app.js refreshStats 带 force');
has(app, 'if (!force && STATS_AT && Date.now() - STATS_AT < 3000) return;', 'app.js stats 3 秒节流');
const forcedCount = (app.match(/refreshStats\(true\)/g) || []).length;
console.log('  操作成功后强制刷新处数        =', forcedCount);
if (forcedCount < 4) fail('停用/解封/清设备/踢单台/粘贴口令/面板初始化都该传 refreshStats(true)（当前 ' + forcedCount + ' 处）');
has(app, 'const keepTop = box.scrollTop;', 'app.js renderList 记滚动位置');
has(app, 'box.scrollTop = keepTop;', 'app.js renderList 还滚动位置');

/* ⑦ 明文流量：Manifest 不再全局放开，改白名单。
 * 判定要连 xml 文件本身一起查 —— 只删 manifest 里那行、不留配置文件，
 * 在 API 24+ 上等于默认拒绝一切明文，异常域直接白屏。 */
has(mani, 'android:networkSecurityConfig="@xml/network_security_config"', 'Manifest 指向白名单配置');
/* 必须剥掉 XML 注释再查 —— 修复说明的注释里就原样引用了
 * `android:usesCleartextTraffic="true"` 这个旧写法，
 * 不剥会自己命中自己（HA ND OFF 坑 32 记过同一件事）。 */
const maniBare = String(mani).replace(/<!--[\s\S]*?-->/g, '');
const globalClear = /android:usesCleartextTraffic="true"/.test(maniBare);
console.log('  Manifest 不再全局放开明文      =', !globalClear);
if (globalClear) fail('Manifest 仍然 usesCleartextTraffic="true"（全局放开明文）');
const nsc = (() => { try { return read('android/res/xml/network_security_config.xml'); } catch (e) { return ''; } })();
has(nsc, '<base-config cleartextTrafficPermitted="false">', '白名单默认拒明文');
has(nsc, '<domain includeSubdomains="true">xxmu.edu.cn</domain>', '白名单含学校域');
has(nsc, '<domain includeSubdomains="true">qiekj.com</domain>', '白名单含胖乖生活');
has(nsc, '<domain includeSubdomains="true">chaoxing.com</domain>', '白名单含学习通');

/* ⑧ WebActivity 的混合内容不再 ALWAYS_ALLOW。 */
const wact = read('android/src/com/xxmu/helper/WebActivity.java');
const alwaysMix = /setMixedContentMode\(WebSettings\.MIXED_CONTENT_ALWAYS_ALLOW\)/.test(wact);
console.log('  混合内容不再 ALWAYS_ALLOW      =', !alwaysMix);
if (alwaysMix) fail('WebActivity 又把 MIXED_CONTENT_ALWAYS_ALLOW 放回来了');

// ---- v1.1.16：结算整块移除、改成放水/停止 + 定量放水、开阀失败自动重绑 ----
/* 这一批的失败方式特别隐蔽：删掉结算之后，只要还有任何一处代码引用
 * openSettle / settleMode / endWaterAndSettle，运行到那一步就是 TypeError，
 * 而「水能解锁成功」这一段是好的 —— 用户会以为只是某个按钮坏了。
 * 所以这里做的是**反向断言**：这些符号必须一个都不剩（剥注释后再查）。 */
console.log('\nv1.1.16 checkpoints:');

const water = read('web/water.js');
const appBare = stripComments(app);

/* ---- v1.1.21：我们并不知道 amount 的单位，界面不许写死「毫升」---- */
/* 用户实机：接约 250ml，界面显示「已出 0」，结算后账单是 32。
 * 三个数对不上。查官方 h5，`amount` 只被拿去做 `> 0` 判断、从不显示，
 * 所以**没有任何可参照的单位来源**。猜一个写死在界面上比不写更糟：
 * 它会让人以为「到了 200ml」，而实际停在哪并不确定。
 * 这条锚点守两件事：
 *   ① 界面文案不得把 amount 当毫升（不许出现「毫升」「ml」与目标值拼接）；
 *   ② 必须保留「单位以账单为准」这句免责，以及原始回报的展示。 */
const appTextBare = stripComments(app);
const claimsMl = /已出\s*'?\s*\+\s*s\.amount\s*\+\s*'?\s*(ml|毫升)/.test(appTextBare)
  || /本次\s*'?\s*\+\s*\(r\.amount[^)]*\)\s*\+\s*'?\s*(ml|毫升)/.test(appTextBare);
console.log('  界面不把 amount 当毫升         =', !claimsMl);
if (claimsMl) fail('界面又把 amount 直接拼成「毫升」了 —— 单位未经证实，必须写「以账单为准」');
const hasUnitDisclaimer = appTextBare.indexOf('单位以胖乖账单为准') >= 0
  || appTextBare.indexOf('单位以账单为准') >= 0;
console.log('  保留「单位以账单为准」说明      =', hasUnitDisclaimer);
if (!hasUnitDisclaimer) fail('放水结束/说明里要写明「单位以胖乖账单为准」，不能让人以为是毫升');

/* 到量后必须继续盯一段，把停阀后结算的用量取回来。
 * 否则 resolve 时 r.amount 还是停止前的旧值，界面和账单对不上。 */
has(water, 'const SETTLE_GAP = 5000;', 'water.js 停止后仍有观察窗口');
const settleGate = /const settlePending = stopSent && settleUntil && Date\.now\(\) < settleUntil/.test(water);
console.log('  status 3/5 先到也不提前收工     =', settleGate);
if (!settleGate) fail('watchVolume 必须在发停止后继续盯 SETTLE_GAP，不能一看到 status 3/5 就 resolve');

/* 用量只增不减：平台偶尔回旧的 0，不能把界面数字打回去 */
const monotonic = /if \(s\.amount > lastAmount\) lastAmount = s\.amount/.test(water);
console.log('  用量单调递增（不回退）          =', monotonic);
if (!monotonic) fail('watchVolume 要保证 amount 不回退（平台可能回旧的 0）');

const waterBare = stripComments(water);

/* ① 结算的界面函数必须彻底消失（剥注释后 0 命中）。 */
['openSettle', 'endWaterAndSettle', 'settleMode', 'setSettleMode', 'paintMode']
  .forEach(name => {
    const hit = appBare.indexOf(name) >= 0;
    console.log('  app.js 已无 ' + name.padEnd(18) + '=', !hit);
    if (hit) fail('app.js 里还残留 ' + name + '（结算已整块移除，留着运行到就是 TypeError）');
  });
/* createOrder 在 water.js 里刻意保留（协议记录），但界面绝不能调用它。 */
const uiCallsOrder = /AUTH[^;]*createOrder|WATER\.createOrder/.test(appBare);
console.log('  界面不再调 createOrder        =', !uiCallsOrder);
if (uiCallsOrder) fail('app.js 还在调 WATER.createOrder（结账要签约支付宝免密，已按用户要求移除）');

/* ② 新语义必须写对：unlock 不是开阀，文案不能说「正在出水 / 已开阀」。 */
has(app, '已解锁。现在去机器出水口按一下', 'app.js 文案说明要去机器上按');
has(water, '请在出水口处点按开始接水', 'water.js 记录了官方原文依据');
const badClaim = /已开阀，可以接水了|已经开启了.*正在出水/.test(appBare);
console.log('  不再声称「已开阀/正在出水」  =', !badClaim);
if (badClaim) fail('app.js 又出现「已开阀 / 正在出水」的文案（手机只能解锁，出水要人在机器上按）');

/* ③ 定量放水三件套：watchVolume、到量发停止、停止只用 goodsId。 */
has(water, 'function watchVolume(', 'water.js watchVolume');
has(water, "if (!stopSent && s.amount > 0 && s.amount >= tgt)", 'water.js 到量触发');
has(water, 'function endWaterTarget(', 'water.js 停止发命令');
has(water, "return call('goods/endWater', { goodsId: String(goodsId) });", '停止用 goodsId');
has(app, 'WATER.watchVolume(', 'app.js 用 watchVolume');
has(idx, 'id="waterTarget"', 'index.html 目标水量 chips');
/* 目标水量确实可持久化，且默认 0（不限量）。 */
has(water, "const K_TARGET = 'xxmu_water_target';", 'water.js 目标水量 pref 键');
has(water, 'function targetMl()', 'water.js targetMl');
has(water, 'function setTargetMl(', 'water.js setTargetMl');

/* ④ 自动重绑：只在明确的平台拒绝时重试，余额/签约类错误不许重试。 */
has(water, 'function unlockWithRebind(', 'water.js unlockWithRebind');
has(water, "const RETRY_CODES = ['-1', '-19'];", 'water.js 重试码表');
const retryGuarded = waterBare.indexOf('RETRY_CODES.indexOf(code) >= 0') > 0;
console.log('  重试只认明确拒绝码          =', retryGuarded);
if (!retryGuarded) fail('unlockWithRebind 必须按 RETRY_CODES 白名单判断，不能任何错误都重试');
/* 重绑后按**同名出水口**取新 skuId，不能按数组下标（冷/热顺序会变）。 */
const byName = waterBare.indexOf("fns.filter(x => x.name === wantName)[0]") > 0;
console.log('  重绑后按同名口取 skuId      =', byName);
if (!byName) fail('重绑后必须按出水口名字匹配（按顺序会开到另一个口）');

/* ⑤ 老 pref 要主动清掉，不能让 one/two 一直躺在存储里。 */
has(water, 'function clearLegacyMode()', 'water.js clearLegacyMode');
has(app, 'WATER.clearLegacyMode', 'app.js 主动清老 pref');

// ---- v1.1.17：换成自有域名 www.xxmuhelper.top ----
/* 换域名这一批的风险是「改漏一处」：BASE 有五个入口（前端两处 + Java 一处 +
 * 两个 tools 脚本），漏掉任何一处，就会出现「App 能连、但图片裂/公告发不出去」
 * 这种半残状态，而每一处单独看都是好的。
 *
 * 还有一条更危险的：域名没签发就出包 = 全校连不上。所以这里同时守
 * 「新域名用对了」和「旧域名没被误删成回滚口」两件事。 */
console.log('\nv1.1.17 checkpoints:');

/* v1.1.17 改为双入口 + 自动回退（不是把 BASE 换成一个新域名）。
 *
 * 为什么不再是「五处都写同一个新域名」：2026-11-04 真实事故——新域名证书、
 * 服务器、公共 DNS 全绿，但学生校园网 DNS（111.6.174.198）当时还查不到，
 * 更新了的学生一联网全部连不上。现在两个地址都试，谁通走谁。 */
const NEWHOST = 'https://www.xxmuhelper.top';
const OLDHOST = 'https://xxmu-auth.pages.dev';
const authJs = read('web/auth.js');
const authJsBare = stripComments(authJs);
has(authJsBare, "const HOSTS = ['" + NEWHOST + "', '" + OLDHOST + "']", 'auth.js 双入口 HOSTS');
has(authJsBare, 'function fetchAny(', 'auth.js fetchAny');
has(authJsBare, "return typeof raw === 'string' && raw.indexOf('ERR:') === 0;", 'auth.js isNetFail 判定');
has(authJsBare, 'function baseNow()', 'auth.js baseNow');
/* 反向：不许再出现「只写一个新域名、没有回退」的老形态。 */
const singleHost = /const BASE = 'https:\/\/www\.xxmuhelper\.top';/.test(authJsBare);
console.log('  auth.js 不再是单域名常量          =', !singleHost);
if (singleHost) fail('auth.js 又退回单域名常量了（换域名必须带 pages.dev 回退）');

/* BASE 必须是 getter：app.js 有 5 处 `AUTH.BASE` 属性用法，
 * 改成函数会在业务逻辑之前抛 TypeError（v1.1.12 事故）。 */
const baseGetter = /Object\.defineProperty\(api,\s*'BASE'/.test(authJsBare);
console.log('  AUTH.BASE 是 getter 属性          =', baseGetter);
if (!baseGetter) fail('AUTH.BASE 必须是 getter 属性，不能改成函数');
const baseAsFn = /AUTH\.BASE\s*\(\s*\)/.test(authJsBare);
console.log('  auth.js 无 AUTH.BASE() 调用       =', !baseAsFn);
if (baseAsFn) fail('auth.js 里出现 AUTH.BASE() —— 属性被当函数调');

/* 图片地址必须走 AUTH.Photos.url（内部用 baseNow），不能写死域名，
 * 否则校园 DNS 没刷到的学生会看到一整面裂图。 */
has(stripComments(read('web/wiki.js')), 'AUTH.Photos.url(', 'wiki.js 图片走 AUTH');

/* Java 侧同样要双入口。 */
has(mact, 'private static final String[] BASES', 'MainActivity 双入口 BASES');
has(mact, 'private String uploadAny(', 'MainActivity uploadAny');
const javaSingle = /private static final String BASE = "https/.test(mact);
console.log('  Java 不再是单域名常量              =', !javaSingle);
if (javaSingle) fail('MainActivity 又退回单域名 BASE（必须双入口 + uploadAny 回退）');
/* 回退判据必须和 JS 同源：只有 ERR: 前缀才换。 */
const javaErrGate = /!out\.startsWith\("ERR:"\)/.test(mact);
console.log('  Java 只用 ERR: 前缀判网络失败      =', javaErrGate);
if (!javaErrGate) fail('MainActivity 的回退判据必须是 "ERR:" 前缀，不能见错就换');

/* 回滚口必须写明：pages.dev 是 Pages 自带子域，永远有效。 */
const rollbackOk = /pages\.dev/.test(read('HANDOFF.md'));
console.log('  HANDOFF 里留了回滚说明              =', rollbackOk);
if (!rollbackOk) fail('HANDOFF.md 里要写明「pages.dev 永远可用，是回滚口」');

// ---- v1.1.18：官网（Pages 静态页）+ API 代理共存 ----
/* 这一批的核心风险是「路由分离被改回去」。
 * _worker.js 原来会接管**所有**请求一律转发到 workers.dev，
 * 那样 dist/index.html 永远不会被访问到 —— 浏览器打开首页拿到的是 JSON。
 * 这个错误不会报错，只会让人以为「部署没生效」。 */
console.log('\nv1.1.18 checkpoints:');

const pageWorker = read('server/pages/dist/_worker.js');
const pageWorkerBare = stripComments(pageWorker);
const site = (() => {
  try { return read('server/pages/dist/index.html'); } catch (e) { return ''; }
})();

has(pageWorkerBare, "p.indexOf('/v1/') === 0", 'worker 只把 /v1/ 当接口');
has(pageWorkerBare, 'env.ASSETS.fetch(request)', 'worker 静态资源走 ASSETS');
/* 反向：不许再出现「无条件把所有请求都转发」的老形态。 */
const blindProxy = /const target = UPSTREAM \+ u\.pathname \+ u\.search;/.test(pageWorkerBare)
  && !/if \(!apiPath\)/.test(pageWorkerBare);
console.log('  worker 不是无条件全量代理        =', !blindProxy);
if (blindProxy) fail('_worker.js 又变成把所有请求都转发到上游了（官网首页会被抢走）');
/* 404 那条：不存在的路径不能回落成 200。 */
has(pageWorkerBare, "status: 404", 'worker 不存在的静态路径回 404');
const isHomeGate = /const isHome = \(p === '\/' \|\| p === '\/index\.html'\)/.test(pageWorkerBare);
console.log('  worker 区分首页与深层路径        =', isHomeGate);
if (!isHomeGate) fail('_worker.js 要把 / 和 /index.html 当首页，其它路径回落 HTML 时判 404');

/* 官网本体：必须存在、必须有下载入口、且零外部依赖。 */
console.log('  index.html 体积                  =', site.length);
if (site.length <= 8000) fail('server/pages/dist/index.html 不存在或太小（' + site.length + ' 字节）');
has(site, 'id="dlBtn"', '官网有下载按钮');
has(site, 'href="/v1/apk"', '下载指向 /v1/apk');
has(site, '1097668324', '官网写了 QQ 群号');
has(site, 'id="mVer"', '官网版本号由接口填充');
/* 版本号不许写死：写死就会出现「官网说旧版本、实际已更新」。 */
const hardVer = /id="mVer">v[\d.]+</.test(site);
console.log('  官网版本号没有写死                =', !hardVer);
if (hardVer) fail('官网把版本号写死了（必须由 /v1/config 填充，否则发版后会两处数字不一致）');
/* 零外部依赖：不引 CDN / 外链字体 / 外链图标。断网也要能打开。
 *
 * 判据必须区分两类：
 *   · `src=` 与 `<link href=>` —— 页面**运行时要去取**的资源，断网就坏，一律禁。
 *   · 普通 `href=` —— 只是超链接，点了才请求；指 GitHub / QQ 是正常的，
 *     断网也不会让页面坏掉，反而漏掉这些才是问题（v1.1.20 加了联系方式卡）。
 * 上一版把两类混为一谈，加了 GitHub 链接就误报「引用了外部资源」。 */
const resRefs = site.match(/(?:src|<link[^>]*href)\s*=\s*["']https?:\/\/[^"']+/gi) || [];
console.log('  官网外链资源引用数                =', resRefs.length);
if (resRefs.length) fail('官网用 src/link 引了外部资源（断网会坏、也可能被墙）：'
  + resRefs.slice(0, 3).join(', '));
/* 超链接白名单：只允许指向自有站点、GitHub、QQ、邮箱、mailto。 */
const badLinks = (site.match(/href\s*=\s*["'](https?:\/\/[^"']+)/gi) || [])
  .map(s => s.replace(/^href\s*=\s*["']/i, ''))
  .filter(u => !/^https?:\/\/(?:www\.)?(?:xxmuhelper\.top|xxmu-auth\.pages\.dev|github\.com|qm\.qq\.com|wpa\.qq\.com)/.test(u));
console.log('  超链接均指向白名单域名            =', badLinks.length === 0);
if (badLinks.length) fail('官网有不认识的超链接：' + badLinks.slice(0, 3).join(', '));

/* app.css 的配色要和官网一致，否则「同一个产品两张脸」。 */
const appCss = read('web/app.css');
const sameAccent = appCss.indexOf('--accent:#2563eb') >= 0 && site.indexOf('#2563eb') >= 0;
console.log('  官网与 App 共用同一强调色          =', sameAccent);
if (!sameAccent) fail('官网的强调色要和 web/app.css 的 --accent(#2563eb) 一致');

// ---- v1.1.19：微信内置浏览器的下载提示 ----
/* 真机实测：微信里点下载会被拦截，但会弹「在浏览器中打开」。
 * 拦截是微信自身的策略，绕不过去；能做的是把「点哪里」写在页面上，
 * 免得新生以为打不开就退出。
 * 三条硬约束：
 *   ① 说明只能对微信显示（ua 判 micromessenger/wxwork），普通浏览器不许看到；
 *   ② 不许为了「绕过」去改下载链接——/v1/apk 在微信里也照样跳，
 *      假装能绕过去只会让人点到更奇怪的地方；
 *   ③ 文案里必须出现「在浏览器中打开」这几个字，那是用户唯一要点的东西。 */
console.log('\nv1.1.19 checkpoints:');
const siteBare = stripComments(site);
const hasWxBlock = /id="wxTip"/.test(site);
console.log('  官网有微信环境提示块              =', hasWxBlock);
if (!hasWxBlock) fail('官网缺 #wxTip：微信里点下载会被拦，页面上要告诉用户点哪里');
const wxHidden = /#wxTip\{[^}]*display:none/.test(siteBare);
console.log('  提示默认隐藏（非微信看不到）      =', wxHidden);
if (!wxHidden) fail('#wxTip 默认必须 display:none，否则普通浏览器用户也会看到一段和他们无关的话');
const wxUa = /micromessenger\|wxwork/i.test(siteBare);
console.log('  用 UA 判微信环境                  =', wxUa);
if (!wxUa) fail('要用 /micromessenger|wxwork/i 判环境（企业微信也要算，它也拦 APK）');
const wxShow = /wxTip\.className = 'show'/.test(siteBare);
console.log('  命中才加 .show                    =', wxShow);
if (!wxShow) fail('微信环境检测命中后要 wxTip.className = \'show\'');
const wxWords = site.indexOf('在浏览器中打开') >= 0;
console.log('  文案写明「在浏览器中打开」        =', wxWords);
if (!wxWords) fail('提示里要出现「在浏览器中打开」，那是用户唯一需要点的东西');
/* 反向：不许为了绕微信去改下载链接（/v1/apk 必须保持原样）。 */
const dlOk = /<a class="btn" id="dlBtn" href="\/v1\/apk"/.test(site);
console.log('  下载链接没有被改成「微信专用版」  =', dlOk);
if (!dlOk) fail('下载按钮保持 href="/v1/apk"；微信拦不拦是它的事，我们不去猜绕过链接');

// ---- v1.1.20：官网改版（界面示意图 + 联系方式） ----
/* 这一批的风险是「图片 404」和「联系方式漏写 https://」。
 * 图片 404 在本地看不见（文件在），部署后路径不对就是一片破图；
 * 联系方式写成相对路径，用户点进去会跳到自家域名下 404。
 * 两者都不报错，只能靠静态断言 + 逐文件存在性检查挡住。 */
console.log('\nv1.1.20 checkpoints:');

const IMG_DIR = 'server/pages/dist/img';
const IMG_FILES = ['logo.svg', 'shot-kb.svg', 'shot-learn.svg', 'shot-water.svg'];
IMG_FILES.forEach(n => {
  const p = path.join(root, IMG_DIR, n);
  const exists = fs.existsSync(p) && fs.statSync(p).size > 200;
  console.log('  ' + n.padEnd(16) + ' 存在且非空 =', exists);
  if (!exists) fail(IMG_DIR + '/' + n + ' 不存在或太小（官网会显示破图）');
});

/* 页面里引用的每个 /img/ 路径都必须真的存在 —— 少一个就是破图。 */
const imgRefs = [...new Set((site.match(/\/img\/[a-z0-9-]+\.svg/g) || []))];
console.log('  官网引用图片数                    =', imgRefs.length);
if (imgRefs.length < 3) fail('官网至少应有三张界面示意图（课表/学习/饮水机）');
imgRefs.forEach(r => {
  const p = path.join(root, IMG_DIR, r.replace('/img/', ''));
  if (!fs.existsSync(p)) fail('官网引用了不存在的图片 ' + r);
});

/* SVG 必须是合法 XML 结构 —— 曾因 defs 写在 <svg> 外面导致整张图
 * 报「error on line 1 at column 572: Unexpected token: <」，页面上是空白。 */
IMG_FILES.forEach(n => {
  const s = fs.readFileSync(path.join(root, IMG_DIR, n), 'utf8').trim();
  const opens = (s.match(/<svg/g) || []).length;
  const headOk = s.startsWith('<svg');
  console.log('  ' + n.padEnd(16) + ' 单个 svg 根元素 =', opens === 1 && headOk);
  if (opens !== 1 || !headOk) fail(IMG_DIR + '/' + n + ' 必须以单个 <svg> 开头（defs 要放在 svg 内部）');
});

/* 联系方式：QQ 号、GitHub 必须是完整的 https 绝对链接。 */
has(site, '572833261', '官网写了作者 QQ');
has(site, 'https://github.com/cyanheee/xxmu-helper', '官网写了 GitHub 绝对链接');
has(site, '1097668324', '官网写了群号');
const relGh = /href="(?!https?:\/\/)github\.com/.test(site);
console.log('  没有相对的 github.com 链接        =', !relGh);
if (relGh) fail('官网里出现 href="github.com/..."（缺 https:// 前缀，点进去会 404）');

/* 图片必须如实标明是示意图，不许暗示是真机截图。 */
const honestShot = site.indexOf('示意图') >= 0;
console.log('  图片标注为「示意图」              =', honestShot);
if (!honestShot) fail('界面图是代码绘制的示意图，页面必须如实标注，不能写成真机截图');

// 三处版本号必须同步，否则「我的」页显示的版本和包里写的不一致
const vIdx = /id="aboutVer">v([\d.]+)</.exec(idx);
const vAbout = /APP_VERSION = '([\d.]+)'/.exec(about);
console.log('  index.html aboutVer         =', vIdx && vIdx[1]);
console.log('  about.js APP_VERSION        =', vAbout && vAbout[1]);
if (!vIdx) fail('index.html 里找不到 id="aboutVer"');
if (!vAbout) fail('about.js 里找不到 APP_VERSION');
if (vIdx && vAbout && vIdx[1] !== vAbout[1]) fail('index.html 与 about.js 版本号不一致');
if (vIdx && vIdx[1] !== vm[1]) fail('页面版本号与 manifest versionName 不一致');
if (vAbout && vAbout[1] !== vm[1]) fail('about.js 版本号与 manifest versionName 不一致');

// 中文完整性：v1.1.2 那次事故的指纹
const cjk = (idx.match(/[\u4e00-\u9fff]/g) || []).length;
const mojibake = /[\u9000-\u9fff]鐨|鍖栧|娌冲尰|锛|銆|鈥/.test(idx)
  || /[\u9000-\u9fff]鐨|鍖栧|娌冲尰|锛|銆|鈥/.test(about);
console.log('  index.html CJK              =', cjk);
console.log('  mojibake                    =', mojibake);
if (cjk < 2000) fail('index.html 中文字符过少（' + cjk + '），可能被写坏');
if (mojibake) fail('检测到乱码指纹（曾用 PowerShell 写坏过中文源文件）');

console.log('\n' + (bad === 0 ? '[PASS] 静态体检全部通过' : '[FAIL] ' + bad + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
