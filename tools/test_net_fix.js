/* v1.1.62 慢网优化 + WIKI 自动刷新 的回归门禁（m02414 + m02465）。
 * 只读源码字符串 + vm 真跑纯函数，不发网络、不碰生产文件。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) { console.log('  \u2713 ' + label); }
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  << ' + extra : '')); }
}
function has(s, needle, label) { ok(s.indexOf(needle) >= 0, label, '缺: ' + needle); }

/* 花括号配对抠出一个函数定义（这几个函数体里字符串不含花括号） */
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing function ' + name);
  let d = 0, started = false, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

const app = read('web/app.js');
const auth = read('web/auth.js');
const wiki = read('web/wiki.js');
const css = read('web/app.css');

console.log('\n[1] auth.js photoRaw：改走 fetchAny 双入口回退（m02414 根因之一）');
{
  const fn = grabFn(auth, 'photoRaw');
  has(fn, "fetchAny('/v1/admin/photo/raw?k=' + encodeURIComponent(k || '')", 'photoRaw 走 fetchAny');
  has(fn, "'GET', '', '', '', key", 'fetchAny 第 6 参 adminKey 拼 x-admin-key');
  has(fn, "if (isNetFail(raw))", '网络层失败显式 reject');
  ok(fn.indexOf("XXMU.net(baseNow()") < 0, '不再单发 baseNow()（不再整批卡死在主域名）');
  ok(fn.indexOf("XXMU.splitResp(raw)") >= 0, '仍用 XXMU.splitResp 拆响应');
  ok(fn.indexOf("charCodeAt(i) & 0xff") >= 0, 'ISO-8859-1 逐字节还原保留');
  ok(fn.indexOf("image/png") >= 0 && fn.indexOf("image/webp") >= 0 && fn.indexOf("image/jpeg") >= 0, 'PNG/WebP/JPEG 判 mime 保留');
  ok(fn.indexOf("keyOfAdmin()") >= 0, '管理员口令校验保留');
  // fetchAny 本体仍带双域名
  has(auth, "const HOSTS = ['https://www.xxmuhelper.top', 'https://xxmu-auth.pages.dev'];", 'HOSTS 双入口仍在');
  has(auth, "adminKey ? ('x-admin-key: ' + adminKey)", 'fetchAny 拼管理员头');
}

console.log('\n[2] app.js 审核页：四状态 + 串行队列 + 代际丢弃 + 点图重试');
{
  has(app, 'let REV_QUEUE = [];', 'REV_QUEUE 队列');
  has(app, 'let REV_QUEUED = {};', 'REV_QUEUED 去重表');
  has(app, 'let REV_FLYING = false;', 'REV_FLYING 单飞守卫');
  has(app, 'let REV_GEN = 0;', 'REV_GEN 代际');

  const enq = grabFn(app, 'revPhotoSrc');
  ok(enq.indexOf('AUTH.Admin.photoRaw') < 0, 'revPhotoSrc 只入队、不直接发请求');
  has(enq, 'REV_QUEUE.push({ k: k, img: img, gen: REV_GEN });', 'revPhotoSrc 推 job 带 gen');
  has(enq, 'revPump();', 'revPhotoSrc 触发泵');
  has(enq, 'if (REV_URLS[k])', '已有 blob 复用');
  has(enq, 'if (REV_QUEUED[k]) return;', '同 k 去重');

  const pump = grabFn(app, 'revPump');
  has(pump, 'if (REV_FLYING) return;', 'revPump 同一时刻只飞一张');
  has(pump, 'const job = REV_QUEUE.shift();', 'revPump 取队头');
  has(pump, 'REV_FLYING = true;', '起飞置位');
  has(pump, 'const done = () => { REV_FLYING = false; revPump(); };', '完成后递归下一张');
  has(pump, 'AUTH.Admin.photoRaw(job.k).then', '飞的是 photoRaw');
  has(pump, 'job.gen !== REV_GEN', '代际不符丢弃过期结果');
  has(pump, 'URL.createObjectURL(blob)', '成功后 createObjectURL');
  has(pump, "job.img.alt = '取图失败，点一下重试';", '失败给可点提示');
  has(pump, 'job.img.onclick = () => revPhotoSrc(job.k, job.img);', '点图重新排队重试');
  has(pump, 'delete REV_QUEUED[job.k];', '完成/失败清去重表，允许重试');

  const rev = grabFn(app, 'revokeRevUrls');
  has(rev, 'REV_QUEUE = [];', '换清单清队列');
  has(rev, 'REV_QUEUED = {};', '换清单清去重表');
  has(rev, 'REV_GEN++;', '换清单代际 +1');
  has(rev, 'URL.revokeObjectURL', 'blob URL 仍会释放');
}

console.log('\n[3] app.js 按需拉图：render 不预拉全表 + 翻页补拉');
{
  const render = grabFn(app, 'renderRevPhotos');
  ok(render.indexOf('revPhotoSrc(p.k, img)') < 0, 'render 里不再对每张直接 revPhotoSrc');
  has(render, "img.setAttribute('data-k', String(p.k || ''));", 'img 挂 data-k 交给按需加载');
  has(render, 'revLoadVisible();', 'render 末尾调 revLoadVisible');
  has(render, "el('div', 'img-frame rev-frame')", '4:3 旋转框保留（m02144）');
  has(render, "frame.setAttribute('data-rot', String(normRot(p.rot)));", 'data-rot 保留');
  has(render, '尺寸未知', '尺寸未知兜底保留（verify_apk 锁）');
  has(render, '重新上架', '重新上架保留（verify_apk 锁）');

  const scroll = grabFn(app, 'revScroll');
  has(scroll, 'box.scrollLeft = box.scrollLeft + dir * revStep();', 'revScroll 兼容老 WebView 的 scrollLeft 赋值');
  has(scroll, 'revLoadVisible();', 'revScroll 翻页补拉');
  const pos = grabFn(app, 'revUpdatePos');
  has(pos, "pos.textContent = '第 ' + i + ' / ' + n + ' 张';", '位置指示保留');
  has(pos, 'revLoadVisible();', 'scroll 事件也补拉');
  has(app, "addEventListener('scroll', revUpdatePos)", 'scroll 监听仍绑 revUpdatePos');
}

console.log('\n[4] vm 真跑 revLoadVisible：只取当前可见 ±1');
{
  const code = [
    'let REV_URLS = {}, REV_QUEUED = {}, REV_QUEUE = [], REV_GEN = 0, REV_FLYING = false;',
    'function revPump() {}', // stub：不让队列被消费，直接看入队结果
    "const $ = () => BOX;",
    grabFn(app, 'revStep'),
    grabFn(app, 'revPhotoSrc'),
    grabFn(app, 'revLoadVisible'),
    'this.__Q = REV_QUEUE;'
  ].join('\n');
  function run(scrollLeft, imgs) {
    const cards = imgs.map(im => ({ querySelector: () => im }));
    const BOX = {
      clientWidth: 300, scrollLeft: scrollLeft,
      getBoundingClientRect: () => ({ width: 300 }),
      querySelectorAll: () => cards
    };
    const sandbox = { BOX };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    vm.runInContext('revLoadVisible()', sandbox);
    return sandbox.__Q.map(j => j.k);
  }
  const mk = (n, blobIdx) => Array.from({ length: n }, (_, i) => ({
    src: blobIdx === i ? 'blob:already' : '',
    alt: '', getAttribute: k => (k === 'data-k' ? 'p' + (1000 + i) : null)
  }));
  ok(JSON.stringify(run(0, mk(5, -1))) === JSON.stringify(['p1000', 'p1001']),
    'scrollLeft=0 只拉第 1、2 张（可见 ±1）', JSON.stringify(run(0, mk(5, -1))));
  ok(JSON.stringify(run(600, mk(5, -1))) === JSON.stringify(['p1001', 'p1002', 'p1003']),
    '滚到第 3 张只补 1~3 号', JSON.stringify(run(600, mk(5, -1))));
  ok(JSON.stringify(run(0, mk(5, 0))) === JSON.stringify(['p1001']),
    '已是 blob 的那张跳过', JSON.stringify(run(0, mk(5, 0))));
  ok(JSON.stringify(run(0, mk(1, -1))) === JSON.stringify(['p1000']),
    '只有一张时不越界', JSON.stringify(run(0, mk(1, -1))));
  ok(JSON.stringify(run(1200, mk(5, -1))) === JSON.stringify(['p1003', 'p1004']),
    '滚到末张只补最后两张', JSON.stringify(run(1200, mk(5, -1))));
}

console.log('\n[5] wiki.js：两个手动刷新按钮');
{
  const ps = grabFn(wiki, 'photosSection');
  const fs = grabFn(wiki, 'fbSection');
  has(ps, "el('button', 'pill', '↻ 刷新')", '校园实景有刷新按钮');
  has(ps, 'rph.onclick = () => loadPhotos(true);', '图片刷新强制 force=true');
  has(fs, "el('button', 'pill', '↻ 刷新')", '留言板有刷新按钮');
  has(fs, 'rfb.onclick = () => loadFeedback(true);', '留言刷新强制 force=true');
  has(ps, "'+ 传一张'", '上传按钮仍在');
  has(fs, "'+ 说两句'", '留言按钮仍在');
}

console.log('\n[6] wiki.js：指纹防重绘（无变化不 render）');
{
  has(wiki, 'let PHOTO_FP = \'\';', 'PHOTO_FP 指纹状态');
  has(wiki, 'let FB_FP = \'\';', 'FB_FP 指纹状态');
  const lp = grabFn(wiki, 'loadPhotos');
  const lf = grabFn(wiki, 'loadFeedback');
  has(lp, 'const fp = JSON.stringify(arr);', 'loadPhotos 算清单指纹');
  has(lp, 'if (fp !== PHOTO_FP) { PHOTO_FP = fp; render(); }', '图片只在变化时 render');
  has(lf, 'const fbp = JSON.stringify(arr);', 'loadFeedback 算留言指纹');
  has(lf, 'if (fbp !== FB_FP) { FB_FP = fbp; render(); }', '留言只在变化时 render');
  has(lp, "PHOTO_FP = '';", '图片失败/异常分支复位指纹');
  has(lf, "FB_FP = '';", '留言失败/异常分支复位指纹');
  has(lp, 'if (!force && PHOTO_TRIED && (Math.floor(Date.now() / 1000) - PHOTOS_AT) < 60)', '图片 60s 时间窗仍在');
  has(lf, 'if (!force && FB_TRIED && (Math.floor(Date.now() / 1000) - FB_AT) < 60)', '留言 60s 时间窗仍在');
  has(lp, 'PHOTO_TRIED = false;', '图片失败仍留重试入口（v1.1.8 教训）');
  has(lf, 'FB_TRIED = false;', '留言失败仍留重试入口');
}

console.log('\n[7] wiki.js init()：3 分钟轮询 + 前台守卫 + 切回顺手拉');
{
  const init = grabFn(wiki, 'init');
  has(init, 'setInterval(() => {', '挂了周期轮询');
  has(init, '}, 180000);', '周期=180000ms=3 分钟');
  has(init, 'if (document.hidden) return;', '后台不拉（省流量）');
  has(init, "top.dataset.page && top.dataset.page !== 'wiki'", '非 WIKI 页不拉');
  has(init, "if (s && (s.value || '').trim()) return;", '搜索态不拉（不打断输入）');
  has(init, 'loadPhotos(true);', '轮询强制拉图片');
  has(init, 'loadFeedback(true);', '轮询强制拉留言');
  has(init, "document.addEventListener('visibilitychange'", '前台切回监听');
  has(init, 'if (now - PHOTOS_AT >= 30) loadPhotos(true);', '切回 ≥30s 拉图片');
  has(init, 'if (now - FB_AT >= 30) loadFeedback(true);', '切回 ≥30s 拉留言');
  has(init, 'if (inited) return;', 'init 幂等守卫仍在');
  has(init, 'render();', 'init 仍首帧 render');
}

console.log('\n[8] app.css：刷新 pill 排版不挤标题');
{
  has(css, 'margin-right:auto', '.ph-title 推开右侧按钮');
  has(css, '.ph-head .pill{margin-left:6px;flex:0 0 auto}', 'pill 不压缩、靠右');
}

console.log('\n[9] 门禁锁未被破坏（verify_apk / check_web / test_photo_rot 的字面串）');
{
  ['revPhotoSrc', 'photoRaw', '尺寸未知', '重新上架', 'function listNewFirst(a, b)'].forEach(s => has(app, s, 'app.js 保留 ' + s));
  ['photoRaw', 'function localizeUrl(url)'].forEach(s => has(auth, s, 'auth.js 保留 ' + s));
  ['photosSection', 'fbSection', 'startUpload', 'composeFeedback', 'PHOTO_ERR', 'FB_ERR'].forEach(s => has(wiki, s, 'wiki.js 保留 ' + s));
  has(wiki, 'AUTH.Photos.url(', 'wiki.js 图片仍走 AUTH.Photos.url（check_web 锁）');
  // 新增函数没插进 listNewFirst..renderList 禁区
  const a = app.indexOf('function listNewFirst('), b = app.indexOf('function renderList()');
  const zone = app.slice(a, b);
  ok(zone.indexOf('function revLoadVisible') < 0 && zone.indexOf('function revPump') < 0 && zone.indexOf('function normRot') < 0,
    '新辅助函数都在 3650+，没插禁区');
}

console.log('\n' + (bad === 0
  ? 'test_net_fix: ' + total + ' passed, 0 failed → PASS'
  : 'test_net_fix: ' + (total - bad) + ' passed, ' + bad + ' failed → FAIL'));
process.exit(bad === 0 ? 0 : 1);
