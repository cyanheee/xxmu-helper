/* 一次性落码脚本：m02144 待审图片方向编辑 + 左右横滑。
 * 按锚点切片替换，每处断言命中且仅命中一次，避免多行 old_string 的缩进不匹配。
 * 跑完即可删；产物是六个 web/ + server/ 文件的真实改动。
 * 版本不升，折进尚未发布的 v1.1.62/1162。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function rd(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function wr(rel, s) { fs.writeFileSync(path.join(ROOT, rel), s, 'utf8'); }

function sub(s, needle, target, label) {
  const n = s.split(needle).length - 1;
  if (n !== 1) throw new Error(label + ': expected 1 hit, got ' + n);
  return s.replace(needle, function () { return target; });
}
function sect(s, startAnchor, endAnchor, target, label) {
  const a0 = s.indexOf(startAnchor);
  if (a0 < 0) throw new Error(label + ': start anchor missing');
  if (s.indexOf(startAnchor, a0 + startAnchor.length) >= 0) throw new Error(label + ': start anchor not unique');
  const b0 = s.indexOf(endAnchor, a0 + startAnchor.length);
  if (b0 < 0) throw new Error(label + ': end anchor missing');
  const a = s.lastIndexOf('\n', a0) + 1;
  const b = s.lastIndexOf('\n', b0) + 1;
  return s.slice(0, a) + target + s.slice(b);
}

/* ---------- server/worker.js：rot 字段进索引 + act='rot' ---------- */
{
  const rel = 'server/worker.js';
  let s = rd(rel);
  s = sub(s,
    ".map(x => ({ k: x.k, cap: x.cap || '', w: x.w || 0, h: x.h || 0, at: x.at || 0 }));",
    ".map(x => ({ k: x.k, cap: x.cap || '', w: x.w || 0, h: x.h || 0, at: x.at || 0, rot: x.rot || 0 }));",
    'worker: handlePhotos map 加 rot');
  s = sub(s,
    "at: x.at || 0, st: x.st || 'p', id: x.id || '',",
    "at: x.at || 0, st: x.st || 'p', id: x.id || '', rot: x.rot || 0,",
    'worker: handleAdminPhotos rows 加 rot');
  const w3 = String.raw`  } else if (act === 'cap') {
    idx[i].cap = cleanText(b.cap || '', 60);
    await putPhotoIdx(env, idx);
  } else if (act === 'rot') {
    /* 方向只存 0/90/180/270 的元数据，不重编码字节：可逆、不损画质、
     * 一次只改 ph:idx 一个键。两条 purgeEdge 会把公开墙的缓存一起清掉。 */
    const r = Number(b.rot);
    idx[i].rot = (r === 90 || r === 180 || r === 270) ? r : 0;
    await putPhotoIdx(env, idx);
  } else {
    return bad('act 只能是 ok / no / del / cap / rot');
  }
`;
  s = sect(s, "} else if (act === 'cap') {", "await audit(env, 'photo_' + act, [], k);", w3, 'worker: act=rot 分支');
  wr(rel, s);
  console.log('ok  worker.js  rot 字段 + act=rot');
}

/* ---------- web/auth.js：photoAct 第 4 参 rot ---------- */
{
  const rel = 'web/auth.js';
  let s = rd(rel);
  const a1 = String.raw`    photoAct(act, k, cap, rot) {
      const body = { act: act, k: k || '', cap: cap == null ? '' : cap };
      if (rot != null) body.rot = rot;
      return postJson('/v1/admin/photo', body, this.key);
    },
`;
  s = sect(s, 'photoAct(act, k, cap) {', '/* 取任意状态的图片字节', a1, 'auth: photoAct 带 rot');
  wr(rel, s);
  console.log('ok  auth.js  photoAct 带 rot');
}

/* ---------- web/wiki.js：展示位把 rot 转正 ---------- */
{
  const rel = 'web/wiki.js';
  let s = rd(rel);
  const wiki = String.raw`  /* 方向元数据 → 展示时转正。rot 只存 0/90/180/270，不改图片字节，
   * 所以公开墙、点开大图、拍立得照片墙都是同一个角度，且随时能改回来。
   * 只在需要旋转时套一层固定 4:3 的框兜住横竖互换；rot=0 的图走原样
   * 路径，一点都不回归（老图的宽高比、看着的样子全部保持）。 */
  function rotWrap(p, img, full) {
    const r = Number(p.rot) || 0;
    if (!r) return img;
    const f = el('div', 'img-frame' + (full ? ' img-frame-full' : ''));
    f.setAttribute('data-rot', String(r));
    f.appendChild(img);
    return f;
  }

  function photoCard(p) {
    const c = el('div', 'ph-card');
    const img = document.createElement('img');
    img.className = 'ph-img';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = p.cap || '校园图片';
    img.src = (typeof AUTH !== 'undefined' && AUTH.Photos)
      ? AUTH.Photos.url(p.k)
      /* 兜底只在 AUTH 没加载时走（浏览器里预览 web/ 会这样）。
       * 这里也写首选域名：AUTH 不在时没有探测机制可依赖，
       * 用新域名至少是对的；真在 App 里跑一定走上面那条 AUTH.Photos.url。 */
      : ('https://www.xxmuhelper.top/v1/photo?k=' + encodeURIComponent(p.k));
    /* 宽高比在服务端解析出来了就直接用，图片没到之前也占好位，
     * 不会出现「先是一行小方块，加载完整个页面跳一下」。
     * 旋转过的图宽高由 .img-frame 固定，别再按原始比例撑。 */
    if (!Number(p.rot) && p.w > 0 && p.h > 0) img.style.aspectRatio = p.w + ' / ' + p.h;
    c.appendChild(rotWrap(p, img, false));
    if (p.cap) c.appendChild(el('div', 'ph-cap', p.cap));
    c.onclick = () => openPhoto(p);
    return c;
  }

  function openPhoto(p) {
    document.getElementById('sh-name').textContent = p.cap || '校园图片';
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'ph-full';
    img.alt = p.cap || '校园图片';
    img.src = (typeof AUTH !== 'undefined' && AUTH.Photos)
      ? AUTH.Photos.url(p.k) : '';
    body.appendChild(rotWrap(p, img, true));
    if (p.cap) body.appendChild(el('p', 'wiki-p', p.cap));
    document.getElementById('sheet').classList.add('on');
  }

`;
  s = sect(s, 'function photoCard(p) {', '/* 单飞 + 时间窗', wiki, 'wiki: 展示位应用 rot');
  wr(rel, s);
  console.log('ok  wiki.js  rotWrap + 卡片/大图转正');
}

/* ---------- web/app.js：审核页横滑 carousel + 方向编辑器 ---------- */
{
  const rel = 'web/app.js';
  let s = rd(rel);
  s = sub(s, 'revokeRevUrls();', 'revokeRevUrls();\n    revNavShow(0);', 'app: 拉取时先收起翻页条');
  const app2 = String.raw`  function normRot(v) {
    let r = Number(v) || 0;
    r = ((r % 360) + 360) % 360;
    return (r === 90 || r === 180 || r === 270) ? r : 0;
  }

  function revStep() {
    const box = $('revPhotoList');
    if (!box) return 300;
    return box.clientWidth || box.getBoundingClientRect().width || 300;
  }

  function revScroll(dir) {
    const box = $('revPhotoList');
    if (!box) return;
    /* 用 scrollLeft 赋值，老 WebView 也认；snap 会在滚动停下时把边对齐。 */
    box.scrollLeft = box.scrollLeft + dir * revStep();
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
  }

  function revNavShow(n) {
    const nav = $('revPhotoNav');
    if (!nav) return;
    nav.style.display = n > 1 ? 'flex' : 'none';
    const pos = $('revPhotoPos');
    if (pos && n > 1) pos.textContent = '第 1 / ' + n + ' 张';
  }

  function renderRevPhotos() {
    const box = $('revPhotoList');
    if (!box) return;
    box.innerHTML = '';
    revNavShow(0);
    if (!REV_PHOTOS.length) {
      box.appendChild(el('p', 'hint', '没有待审的图片。'));
      return;
    }
    REV_PHOTOS.forEach(p => {
      const c = el('div', 'rev-item');
      const frame = el('div', 'img-frame rev-frame');
      frame.setAttribute('data-rot', String(normRot(p.rot)));
      const img = document.createElement('img');
      img.className = 'rev-img';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = p.cap || '待审图片';
      /* 关键：不能用 AUTH.Photos.url（只放已通过的图）。
       * 管理员要能看见待审的那张，否则「审核」就是盲签。 */
      revPhotoSrc(p.k, img);
      frame.appendChild(img);
      c.appendChild(frame);

      const meta = el('div', 'rev-meta');
      const st = el('span', 'rev-badge',
        p.st === 'a' ? '已公开' : (p.st === 'p' ? '待审' : '已下架'));
      if (p.st === 'a') st.classList.add('ok');
      meta.appendChild(st);
      if (p.id) meta.appendChild(el('span', 'rev-sub', '学号 ' + String(p.id).slice(-4)));
      /* 尺寸读不出来时显示「尺寸未知」，不要印「0×0」——
       * 管理员没法区分那是「解析失败」还是真解析成 0 */
      const dim = (p.w > 0 && p.h > 0) ? (p.w + '×' + p.h) : '尺寸未知';
      meta.appendChild(el('span', 'rev-sub', dim));
      c.appendChild(meta);

      if (p.cap) c.appendChild(el('div', 'rev-cap', p.cap));

      /* 方向编辑：四个角度都是即时预览，只有「保存方向」落库。
       * 保存成就地改 REV_PHOTOS 里这一项，不整表重载，
       * 横滑停在第几张就还停在第几张。 */
      const rotBar = el('div', 'rev-rot');
      rotBar.appendChild(el('span', 'rev-rot-lab', '图片方向'));
      let cur = normRot(p.rot);
      const preview = v => { cur = normRot(v); frame.setAttribute('data-rot', String(cur)); };
      const mkRot = (txt, fn) => {
        const b = el('button', 'btn ghost btn-sm', txt);
        b.onclick = fn;
        rotBar.appendChild(b);
      };
      mkRot('↺ 左转', () => preview(cur - 90));
      mkRot('↻ 右转', () => preview(cur + 90));
      mkRot('⟳ 180°', () => preview(cur + 180));
      mkRot('还原', () => preview(0));
      const save = el('button', 'btn btn-sm', '保存方向');
      save.onclick = () => photoRot(p.k, cur, save, frame, p);
      rotBar.appendChild(save);
      c.appendChild(rotBar);

      const acts = el('div', 'rev-acts');
      if (p.st !== 'a') {
        const ok = el('button', 'btn btn-sm', '通过');
        ok.onclick = () => photoAct('ok', p.k, ok);
        acts.appendChild(ok);
      }
      if (p.st === 'a') {
        const no = el('button', 'btn ghost btn-sm', '下架');
        /* 下架是软下架（服务端只把 st 改成 'x'，字节还在），但仍然要把
         * 「会不会出现在全校面前」说清楚，并且给个二次确认 —— 原来这里
         * 没有 confirm，而服务端把 no 和 del 当同一条路径，手滑一次就
         * 物理删除不可恢复。 */
        no.onclick = async () => {
          if (!await askConfirm('从校园实景里撤下这张图？\n\n图片和说明都会保留，以后还能重新上架。')) return;
          photoAct('no', p.k, no);
        };
        acts.appendChild(no);
      }
      /* 已下架（st === 'x'）的给一个回场入口 */
      if (p.st === 'x') {
        const re = el('button', 'btn ghost btn-sm', '重新上架');
        re.onclick = () => photoAct('ok', p.k, re);
        acts.appendChild(re);
      }
      const capBtn = el('button', 'btn ghost btn-sm', '改说明');
      capBtn.onclick = () => {
        const v = prompt('图片说明（留空则显示为无说明）', p.cap || '');
        if (v === null) return;
        photoAct('cap', p.k, capBtn, v);
      };
      acts.appendChild(capBtn);
      const del = el('button', 'btn ghost btn-sm', '删除');
      del.onclick = async () => {
        if (!await askConfirm('彻底删掉这张图？文件也会一起删，找不回来。\n\n只是想从公开列表撤下来的话，用「下架」。',
          { danger: true })) return;
        photoAct('del', p.k, del);
      };
      acts.appendChild(del);
      c.appendChild(acts);
      box.appendChild(c);
    });
    box.scrollLeft = 0;
    revNavShow(REV_PHOTOS.length);
    const nav = $('revPhotoNav');
    if (nav && !nav._bound) {
      nav._bound = true;
      const pv = $('revPrev'), nx = $('revNext');
      if (pv) pv.onclick = () => revScroll(-1);
      if (nx) nx.onclick = () => revScroll(1);
    }
    if (!box._revBound) {
      box._revBound = true;
      box.addEventListener('scroll', revUpdatePos);
    }
  }

  function photoRot(k, rot, btn, frame, p) {
    busy(btn, true, '保存中…');
    AUTH.Admin.photoAct('rot', k, '', rot).then(res => {
      busy(btn, false);
      if (!res || !res.ok) { XXMU.toast((res && res.msg) || '没保存上'); return; }
      p.rot = rot;
      if (frame) frame.setAttribute('data-rot', String(rot));
      XXMU.toast('方向已保存');
    }, e => {
      busy(btn, false);
      XXMU.toast('连不上服务器：' + ((e && e.message) || e));
    });
  }

  function photoAct(act, k, btn, cap) {
    busy(btn, true, '处理中…');
    AUTH.Admin.photoAct(act, k, cap).then(res => {
      busy(btn, false);
      if (!res || !res.ok) { XXMU.toast((res && res.msg) || '操作失败'); return; }
      XXMU.toast('已' + ({ ok: '通过', no: '下架', del: '删除', cap: '改说明' }[act] || '完成'));
      loadRevPhotos();
    }, e => {
      busy(btn, false);
      XXMU.toast('连不上服务器：' + ((e && e.message) || e));
    });
  }

`;
  s = sect(s, 'function renderRevPhotos()', 'function loadRevFb()', app2, 'app: 横滑 carousel + 方向编辑');
  wr(rel, s);
  console.log('ok  app.js  横滑 + 方向编辑 + nav');
}

/* ---------- web/index.html：横滑容器 + 翻页条 ---------- */
{
  const rel = 'web/index.html';
  let s = rd(rel);
  s = sub(s, '<div id="revPhotoList" class="rev-list">',
    '<div id="revPhotoList" class="rev-list rev-photos">', 'index: 审核列表加 rev-photos');
  const navHtml = String.raw`<div id="revPhotoNav" class="rev-nav" style="display:none">
            <button id="revPrev" class="btn ghost btn-sm">‹ 上一张</button>
            <span id="revPhotoPos" class="rev-pos">第 1 张</span>
            <button id="revNext" class="btn ghost btn-sm">下一张 ›</button>
          </div>
          <button id="revPhotoRefresh" class="btn ghost">刷新待审图片</button>`;
  s = sub(s, '<button id="revPhotoRefresh" class="btn ghost">刷新待审图片</button>',
    navHtml, 'index: 插翻页条');
  wr(rel, s);
  console.log('ok  index.html  rev-photos + revPhotoNav');
}

/* ---------- web/app.css：横滑 / 翻页条 / 方向框样式 ---------- */
{
  const rel = 'web/app.css';
  let s = rd(rel);
  const css = String.raw`.rev-acts{display:flex;gap:7px;flex-wrap:wrap}
/* 待审图片改成左右滑动：一次一张，snap 对齐，手指横划 / 按钮都能翻。
 * 只作用于 .rev-photos，留言板那条 .rev-list 仍是原来的纵向堆叠。 */
.rev-photos{flex-direction:row;gap:0;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
  scrollbar-width:none}
.rev-photos::-webkit-scrollbar{display:none}
.rev-photos > .rev-item{flex:0 0 100%;width:100%;box-sizing:border-box;
  scroll-snap-align:start;scroll-snap-stop:always}
.rev-photos > .hint{flex:0 0 100%}
.rev-nav{display:none;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 8px}
.rev-nav .btn{flex:0 0 auto}
.rev-pos{font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
/* 方向框：固定 4:3，图片绝对居中后按 data-rot 旋转。
 * 90/270 会横竖互换，把 img 收成 75% 宽 / 133.33% 高，
 * 转 90 度正好铺满 4:3 的框，不溢出也不留白。 */
.img-frame{position:relative;width:100%;aspect-ratio:4 / 3;overflow:hidden;
  background:var(--img-bg, var(--surface2));border-radius:10px}
.img-frame > img{position:absolute;top:50%;left:50%;
  width:100%;height:100%;aspect-ratio:auto;object-fit:cover;
  border-radius:0;transform:translate(-50%,-50%) rotate(0deg)}
.img-frame[data-rot="90"] > img,
.img-frame[data-rot="270"] > img{width:75%;height:133.333%}
.img-frame[data-rot="90"] > img{transform:translate(-50%,-50%) rotate(90deg)}
.img-frame[data-rot="180"] > img{transform:translate(-50%,-50%) rotate(180deg)}
.img-frame[data-rot="270"] > img{transform:translate(-50%,-50%) rotate(270deg)}
.img-frame-full{border-radius:13px}
.img-frame-full > img{object-fit:contain}
.rev-rot{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rev-rot-lab{font-size:10.5px;color:var(--mute);margin-right:2px}`;
  s = sub(s, '.rev-acts{display:flex;gap:7px;flex-wrap:wrap}', css, 'css: 横滑 / 翻页条 / 方向框');
  wr(rel, s);
  console.log('ok  app.css  横滑 + 方向框样式');
}

console.log('DONE  m02144 六文件落码完成');
