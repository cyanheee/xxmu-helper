/* m02414 + m02465 一次性落码（只改生产文件，按锚点切片替换，幂等）
 *
 *   node design/sketch/_apply_net_fix.js
 *
 *  m02414「连接有点卡 + 待审图取图失败」：
 *    审核页横滑后 render 对每张立即 revPhotoSrc → N 张大图并发挤
 *    Host.httpFetchAsync 桥（img.loading=lazy 对手动 fetch blob 无效）。
 *    改：可见 ±1 才入队、一次飞一张、刷新清单代际丢弃、失败点图重试；
 *    photoRaw 从单发 baseNow() 换成 fetchAny 双入口回退。
 *  m02465「wiki 图片/留言板隔几分钟自动更新」：
 *    两个 section 各加「↻ 刷新」、init 挂 3 分钟轮询（前台 + wiki 页 +
 *    非搜索态）、返回数据没变不 render（不打断搜索/大图弹层）。
 *
 *  不升版本，折进尚未发布的 v1.1.62/1162。notes 按 m02306 不改（管理员
 *  功能不进公告）。发布/上线仍须 YG 点头。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, 'utf8');

/* 精确替换：old 必须命中且仅命中 1 次（split/join 避开 $ 替换语义） */
function sub(tag, src, old, neu) {
  const parts = src.split(old);
  if (parts.length !== 2) throw new Error(tag + ': old 命中 ' + (parts.length - 1) + ' 次（要 1 次）\n  old=' + JSON.stringify(old.slice(0, 80)));
  return parts.join(neu);
}
/* 起点锚 → 终点锚整段重写（body 自带起点行，末尾留空行接终点） */
function sect(tag, src, a, b, body) {
  const i = src.indexOf(a);
  const j = i >= 0 ? src.indexOf(b, i + a.length) : -1;
  if (i < 0) throw new Error(tag + ': 起点找不到 ' + JSON.stringify(a.slice(0, 60)));
  if (j < 0) throw new Error(tag + ': 终点找不到 ' + JSON.stringify(b.slice(0, 60)));
  return src.slice(0, i) + body + src.slice(j);
}

/* ==================== web/auth.js：photoRaw 走 fetchAny ==================== */
const B_photoRaw = String.raw`  /** 取图片原始字节（管理员审核页专用）。返回 Promise<Blob>，不给 JSON。 */
  function photoRaw(k) {
    return new Promise((resolve, reject) => {
      if (typeof XXMU === 'undefined' || !XXMU.net) { reject(new Error('no-host')); return; }
      const key = keyOfAdmin();
      if (!key) { reject(new Error('还没填管理员口令')); return; }
      /* v1.1.62：改走 fetchAny 双入口回退，不再单发 baseNow()。审核页
       * 一次要拉好几张大图（横滑按需取），主域名偶发 403/超时时单发会
       * 整批「取图失败」；fetchAny 跟 config / check 一样在 www 与
       * pages.dev 之间回退，通了记住 liveHost。 */
      fetchAny('/v1/admin/photo/raw?k=' + encodeURIComponent(k || ''),
        'GET', '', '', '', key).then(raw => {
        if (isNetFail(raw)) { reject(new Error(String(raw).slice(4))); return; }
        const r = XXMU.splitResp(raw);
        if (r.code === -1) { reject(new Error(r.body)); return; }
        if (r.code < 200 || r.code >= 300) { reject(new Error('HTTP ' + r.code)); return; }
        /* XXMU.net 把字节摊成「每个 char 一个 byte」的 ISO-8859-1 字符串
         * （为了保留原始字节位，让前端自己决定编码）。图片必须原样还原
         * 成 Uint8Array 再包 Blob，否则 createObjectURL 出来的 URL 是坏的。 */
        const s = r.body || '';
        const u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xff;
        const head = u8.slice(0, 12);
        const isPng = head[0] === 0x89 && head[1] === 0x50;
        const isWebp = u8.length > 11 && head[8] === 0x57 && head[9] === 0x45;
        const mime = isPng ? 'image/png' : (isWebp ? 'image/webp' : 'image/jpeg');
        resolve(new Blob([u8], { type: mime }));
      }, e => reject(e));
    });
  }

`;
let auth = read('web/auth.js');
auth = sect('auth.js photoRaw', auth,
  '  /** 取图片原始字节（管理员审核页专用）。返回 Promise<Blob>，不给 JSON。 */',
  '  /** 当前会话里的管理员口令',
  B_photoRaw);
write('web/auth.js', auth);
console.log('ok  auth.js  photoRaw 走 fetchAny 双入口');

/* ==================== web/app.js：按需拉图 + 串行队列 ==================== */
const queueNew = '  let REV_URLS = {};\n'
  + '  /* v1.1.62 慢网优化：横滑一次只该看 1~2 张，绝不能首帧把 N 张待审图全打出去。\n'
  + '   * img.loading="lazy" 对「JS 手动 fetch blob 再赋 src」无效（只管 src 直指 URL 的原生加载），\n'
  + '   * 所以改成：可见卡 ±1 才入队、队列一次只飞一张、翻页补拉、刷新清单用代际丢弃过期结果。*/\n'
  + '  let REV_QUEUE = [];\n'
  + '  let REV_QUEUED = {};\n'
  + '  let REV_FLYING = false;\n'
  + '  let REV_GEN = 0;';

const B_pump = String.raw`  /* v1.1.62：把某个 k 排进取字节队列（名字沿用，verify_apk 锁）。
   * 已有 blob 直接复用；否则只入队，由 revPump 一次飞一张。 */
  function revPhotoSrc(k, img) {
    if (!k) return;
    if (REV_URLS[k]) { img.src = REV_URLS[k]; img.alt = ''; return; }
    if (REV_QUEUED[k]) return;
    REV_QUEUED[k] = true;
    img.alt = '等待加载…';
    REV_QUEUE.push({ k: k, img: img, gen: REV_GEN });
    revPump();
  }

  /* 串行泵：同一时刻只有一张大图在过 Host.httpFetchAsync 桥，
   * 慢网下不会 N 张一起把主线程/桥挤死（3.00 KB/s 下整批 20s 超时）。 */
  function revPump() {
    if (REV_FLYING) return;
    const job = REV_QUEUE.shift();
    if (!job) return;
    REV_FLYING = true;
    const done = () => { REV_FLYING = false; revPump(); };
    job.img.alt = '加载中…';
    AUTH.Admin.photoRaw(job.k).then(blob => {
      /* 清单刷新过 / 页面重建过 → 结果作废，别写进新 DOM */
      if (job.gen !== REV_GEN || !blob) { delete REV_QUEUED[job.k]; done(); return; }
      const u = URL.createObjectURL(blob);
      REV_URLS[job.k] = u;
      job.img.src = u;
      job.img.alt = '';
      job.img.onclick = null;
      delete REV_QUEUED[job.k];
      done();
    }, e => {
      if (job.gen !== REV_GEN) { delete REV_QUEUED[job.k]; done(); return; }
      delete REV_QUEUED[job.k];
      job.img.alt = '取图失败，点一下重试';
      job.img.title = (typeof errText === 'function' ? errText(e) : String(e));
      /* 给一个能点的重试入口：点图重新排回队列（REV_QUEUED 已删） */
      job.img.onclick = () => revPhotoSrc(job.k, job.img);
      done();
    });
  }

  /* 只把「当前可见那张 ±1」排进队列。img.loading='lazy' 对
   * 「JS 手动 fetch blob 再赋 src」无效，必须用可见性自己控制。 */
  function revLoadVisible() {
    const box = $('revPhotoList');
    if (!box) return;
    const cards = box.querySelectorAll('.rev-item');
    if (!cards.length) return;
    const step = revStep();
    let i = step > 0 ? Math.round(box.scrollLeft / step) : 0;
    if (i < 0) i = 0;
    const lo = Math.max(0, i - 1), hi = Math.min(cards.length - 1, i + 1);
    for (let j = lo; j <= hi; j++) {
      const img = cards[j].querySelector('img.rev-img');
      if (!img) continue;
      if (img.src && img.src.indexOf('blob:') === 0) continue;
      const k = img.getAttribute('data-k');
      if (k) revPhotoSrc(k, img);
    }
  }

  function revokeRevUrls() {
    Object.keys(REV_URLS).forEach(k => {
      try { URL.revokeObjectURL(REV_URLS[k]); } catch (e) {}
    });
    REV_URLS = {};
    /* 换一批清单：清掉没发的队列、去重表，代际 +1 让在飞的旧请求作废 */
    REV_QUEUE = [];
    REV_QUEUED = {};
    REV_GEN++;
  }

`;

const B_scroll = String.raw`  function revScroll(dir) {
    const box = $('revPhotoList');
    if (!box) return;
    /* 用 scrollLeft 赋值，老 WebView 也认；snap 会在滚动停下时把边对齐。 */
    box.scrollLeft = box.scrollLeft + dir * revStep();
    revLoadVisible();
  }

  function revUpdatePos() {
    const box = $('revPhotoList');
    const pos = $('revPhotoPos');
    if (!box || !pos) return;
    const n = REV_PHOTOS.length || 1;
    let i = Math.round(box.scrollLeft / revStep()) + 1;
    if (i < 1) i = 1;
    if (i > n) i = n;
    pos.textContent = '第 ' + i + ' / ' + n + ' 张';
    revLoadVisible();
  }

  function revNavShow(n) {
    const nav = $('revPhotoNav');
    if (!nav) return;
    nav.style.display = n > 1 ? 'flex' : 'none';
    const pos = $('revPhotoPos');
    if (pos && n > 1) pos.textContent = '第 1 / ' + n + ' 张';
  }

`;

const r1New = "      /* v1.1.62：不在这里直接拉图，挂 k 交给 revLoadVisible 按需取 */\n"
  + "      img.setAttribute('data-k', String(p.k || ''));";
const r2Old = "    box.scrollLeft = 0;\n    revNavShow(REV_PHOTOS.length);";
const r2New = "    box.scrollLeft = 0;\n    revNavShow(REV_PHOTOS.length);\n    revLoadVisible();";

let app = read('web/app.js');
app = sub('app.js 队列状态', app, '  let REV_URLS = {};', queueNew);
app = sect('app.js pump 段', app,
  '  /* 把某个 k 的字节取回来变成 blob URL（已有就复用） */',
  '  function normRot(v) {', B_pump);
app = sect('app.js 横滑三函数', app,
  '  function revScroll(dir) {', '  function renderRevPhotos() {', B_scroll);
app = sub('app.js render 挂 data-k', app, '      revPhotoSrc(p.k, img);', r1New);
app = sub('app.js render 末尾补拉', app, r2Old, r2New);
write('web/app.js', app);
console.log('ok  app.js  按需拉图 + 串行队列 + 点图重试 + 翻页补拉');

/* ==================== web/wiki.js：刷新按钮 + 指纹 + 轮询 ==================== */
const phHeadOld = "    head.appendChild(el('span', 'ph-title', '校园实景'));\n    const up = el('button', 'pill', '+ 传一张');";
const phHeadNew = "    head.appendChild(el('span', 'ph-title', '校园实景'));\n"
  + "    const rph = el('button', 'pill', '↻ 刷新');\n"
  + "    rph.onclick = () => loadPhotos(true);\n"
  + "    head.appendChild(rph);\n"
  + "    const up = el('button', 'pill', '+ 传一张');";
const fbHeadOld = "    head.appendChild(el('span', 'ph-title', '留言板'));\n    const go = el('button', 'pill', '+ 说两句');";
const fbHeadNew = "    head.appendChild(el('span', 'ph-title', '留言板'));\n"
  + "    const rfb = el('button', 'pill', '↻ 刷新');\n"
  + "    rfb.onclick = () => loadFeedback(true);\n"
  + "    head.appendChild(rfb);\n"
  + "    const go = el('button', 'pill', '+ 说两句');";

const B_loadPhotos = String.raw`  let PHOTO_INFLIGHT = null;
  let PHOTO_ERR = '';
  let PHOTO_FP = '';
  /* 单飞 + 60 秒时间窗仍在；v1.1.62 多一条「指纹」：轮询/手动刷新拿到
   * 一模一样的清单就别 render —— render 会整页重建 DOM，打断正在输入的
   * 搜索词和已打开的大图弹层。 */
  function loadPhotos(force) {
    if (!force && PHOTO_TRIED && (Math.floor(Date.now() / 1000) - PHOTOS_AT) < 60) return PHOTO_INFLIGHT || Promise.resolve();
    if (PHOTO_INFLIGHT) return PHOTO_INFLIGHT;
    PHOTO_TRIED = true;
    PHOTO_ERR = '';
    if (typeof AUTH === 'undefined' || !AUTH.Photos) { render(); return Promise.resolve(); }
    PHOTO_INFLIGHT = AUTH.Photos.list().then(res => {
      /* 服务端返回的字段叫 rows，不是 list。两个都接，免得改名静默失效。 */
      const arr = res && res.ok ? (res.rows || res.list) : null;
      if (Array.isArray(arr)) {
        const fp = JSON.stringify(arr);
        PHOTOS = arr;
        PHOTOS_AT = Math.floor(Date.now() / 1000);
        if (fp !== PHOTO_FP) { PHOTO_FP = fp; render(); }
      } else {
        PHOTO_ERR = '服务器返回的内容看不懂，点重试';
        PHOTO_TRIED = false;
        PHOTO_FP = '';
        render();
      }
    }, (e) => {
      /* v1.1.8：失败不能把 PHOTO_TRIED 留在 true，否则再不重试，要杀 App。 */
      PHOTOS = [];
      PHOTO_ERR = '校园图片没拉到（' + (typeof errText === 'function' ? errText(e) : String(e)) + '）';
      PHOTO_TRIED = false;
      PHOTO_FP = '';
      render();
    }).then(() => {
      PHOTO_INFLIGHT = null;
    });
    return PHOTO_INFLIGHT;
  }

`;

const B_loadFeedback = String.raw`  let FB_ERR = '';
  let FB_INFLIGHT = null;
  let FB_FP = '';
  function loadFeedback(force) {
    /* 与 loadPhotos 同构：单飞 + 60 秒时间窗 + 失败可重试 + 无变化不重绘。 */
    if (!force && FB_TRIED && (Math.floor(Date.now() / 1000) - FB_AT) < 60) return FB_INFLIGHT || Promise.resolve();
    if (FB_INFLIGHT) return FB_INFLIGHT;
    FB_TRIED = true;
    FB_ERR = '';
    if (typeof AUTH === 'undefined' || !AUTH.Feedback) { render(); return Promise.resolve(); }
    FB_INFLIGHT = AUTH.Feedback.list().then(res => {
      const arr = res && res.ok ? (res.rows || res.list) : null;
      if (Array.isArray(arr)) {
        const fbp = JSON.stringify(arr);
        FBS = arr;
        FB_AT = Math.floor(Date.now() / 1000);
        if (fbp !== FB_FP) { FB_FP = fbp; render(); }
      } else {
        FB_ERR = '服务器返回的内容看不懂，点重试';
        FB_TRIED = false;
        FB_FP = '';
        render();
      }
    }, (e) => {
      FBS = [];
      FB_ERR = '留言没拉到（' + (typeof errText === 'function' ? errText(e) : String(e)) + '）';
      FB_TRIED = false;
      FB_FP = '';
      render();
    }).then(() => {
      FB_INFLIGHT = null;
    });
    return FB_INFLIGHT;
  }

`;

const wikiInitOld = "    render();\n    /* 图片和留言的拉取交给 photosSection()";
const wikiInitNew = String.raw`    render();
    /* v1.1.62：管理员审核通过 / 回复留言后，已经开着 WIKI 页没退出的
     * 同学原本要杀 App 重进才看得到。挂一个 3 分钟轮询，只在
     * 「WIKI 页可见 + 没在搜索 + App 在前台」时才拉，省流量。 */
    try {
      setInterval(() => {
        if (document.hidden) return;
        const top = document.getElementById('top');
        if (top && top.dataset.page && top.dataset.page !== 'wiki') return;
        const s = document.getElementById('wikiSearch');
        if (s && (s.value || '').trim()) return;
        loadPhotos(true);
        loadFeedback(true);
      }, 180000);
      /* 从后台切回前台，距上次超过 30 秒就顺手拉一次，不用等满 3 分钟。 */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        const now = Math.floor(Date.now() / 1000);
        if (now - PHOTOS_AT >= 30) loadPhotos(true);
        if (now - FB_AT >= 30) loadFeedback(true);
      });
    } catch (e) {}
    /* 图片和留言的拉取交给 photosSection()`;

let wiki = read('web/wiki.js');
wiki = sub('wiki.js 图片 head', wiki, phHeadOld, phHeadNew);
wiki = sub('wiki.js 留言 head', wiki, fbHeadOld, fbHeadNew);
wiki = sect('wiki.js loadPhotos', wiki,
  '  let PHOTO_INFLIGHT = null;',
  '  /** 开始上传：先问一句说明，再交给 Java 侧开相册 */', B_loadPhotos);
wiki = sect('wiki.js loadFeedback', wiki,
  "  let FB_ERR = '';", '  function composeFeedback() {', B_loadFeedback);
wiki = sub('wiki.js init 轮询', wiki, wikiInitOld, wikiInitNew);
write('web/wiki.js', wiki);
console.log('ok  wiki.js 两个刷新 + 3 分钟轮询 + 无变化不重绘');

/* ==================== web/app.css：刷新 pill 布局 ==================== */
const cssOld = ".ph-title{font-size:12px;font-weight:650;color:var(--mute);\n  letter-spacing:.6px}";
const cssNew = ".ph-title{font-size:12px;font-weight:650;color:var(--mute);\n  letter-spacing:.6px;margin-right:auto}\n.ph-head .pill{margin-left:6px;flex:0 0 auto}";
let css = read('web/app.css');
css = sub('app.css pill 布局', css, cssOld, cssNew);
write('web/app.css', css);
console.log('ok  app.css 标题推开 + pill 靠右');

console.log('DONE  m02414 + m02465 四文件落码完成');
