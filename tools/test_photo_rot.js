/* m02144：待审图片「方向编辑 + 左右滑动」的离线契约测试。
 *
 *   node tools/test_photo_rot.js
 *
 * 能验：rot 元数据在服务端列表/审核动作里的读写、4 参 photoAct 带角度、
 *       wiki 展示位只对 rot≠0 套框、审核页横滑 snapping 与「保存方向不整表重载」、
 *       normRot 的角度归一化（真跑函数，不只字符串）、90/270 的 4:3 旋转尺寸。
 * 不能验：真机手指横划手感、objectURL 出图、边缘缓存清没清。那要真机 + 校园网。
 *
 * 设计取舍（写在这里，别再改回重编码）：
 *   旋转只存 ph:idx 里的 rot 数字，不改图片字节 —— 可逆、不损画质、
 *   一次只写一个 KV 键。审核动作复用原有两条 purgeEdge 把公开墙缓存一起清掉。
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
function count(s, re) { return (s.match(re) || []).length; }

/* 从源码里抠出一个具名函数（花括号配对），拿到 vm 里真跑。 */
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
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
const wiki = read('web/wiki.js');
const app = read('web/app.js');
const html = read('web/index.html');
const css = read('web/app.css');

console.log('服务端：rot 元数据 + act=rot:');
ok(/rot: x\.rot \|\| 0/.test(worker), 'handlePhotos 公开列表带 rot');
ok(/id: x\.id \|\| '', rot: x\.rot \|\| 0,/.test(worker), 'handleAdminPhotos 审核列表带 rot');
ok(count(worker, /rot: x\.rot \|\| 0/g) === 2, '两个列表各一处，不多不少', count(worker, /rot: x\.rot \|\| 0/g));
ok(/} else if \(act === 'rot'\) \{/.test(worker), 'act=rot 分支存在');
ok(/idx\[i\]\.rot = \(r === 90 \|\| r === 180 \|\| r === 270\) \? r : 0;/.test(worker), '只接受 0/90/180/270，其余归零');
ok(/return bad\('act 只能是 ok \/ no \/ del \/ cap \/ rot'\);/.test(worker), '错误串补上 rot');
ok(!/return bad\('act 只能是 ok \/ no \/ del \/ cap'\);/.test(worker), '旧错误串已改掉');
ok(/await purgeEdge\(req, '\/v1\/photos'\)/.test(worker) && /await purgeEdge\(req, '\/v1\/photo\?k=' \+ k\)/.test(worker), 'rot 复用两条 purgeEdge 清公开墙缓存');
/* 门禁 WORKER_SYMBOLS 锁的字面串，一个都不能少 */
ok(/act === 'orphan'/.test(worker), 'verify_apk 锁：act === \'orphan\' 仍在');
ok(/const IDX_CAP = 5000;/.test(worker), 'verify_apk 锁：IDX_CAP 仍在');
ok(/function idxApply\(/.test(worker), 'verify_apk 锁：idxApply 仍在');

console.log('AUTH：4 参 photoAct 带 rot:');
ok(/photoAct\(act, k, cap, rot\) \{/.test(auth), 'photoAct 加了第 4 参 rot');
ok(/if \(rot != null\) body\.rot = rot;/.test(auth), 'rot 有值才进 body（旧 3 参调用零回归）');
ok(/return postJson\('\/v1\/admin\/photo', body, this\.key\);/.test(auth), 'postJson 走 body');
ok(/photoRaw\(k\) \{ return photoRaw\(k\); \}/.test(auth), 'verify_apk 锁：photoRaw 仍在');

console.log('WIKI：展示位按 rot 转正:');
ok(/function rotWrap\(p, img, full\) \{/.test(wiki), 'rotWrap 存在');
ok(/if \(!r\) return img;/.test(wiki), 'rot=0 原样直挂，老图零回归');
ok(/f\.setAttribute\('data-rot', String\(r\)\);/.test(wiki), '框上写 data-rot');
ok(/if \(!Number\(p\.rot\) && p\.w > 0 && p\.h > 0\)/.test(wiki), '只有 rot=0 才用原始宽高比占位的');
ok(/c\.appendChild\(rotWrap\(p, img, false\)\);/.test(wiki), '卡片套 rotWrap');
ok(/body\.appendChild\(rotWrap\(p, img, true\)\);/.test(wiki), '大图套 rotWrap(full)');
ok(/AUTH\.Photos\.url\(/.test(wiki), 'check_web.js:754 锁：AUTH.Photos.url( 仍在');
ok(/https:\/\/www\.xxmuhelper\.top\/v1\/photo\?k=/.test(wiki), 'AUTH 缺席时的兜底 URL 仍在');

console.log('app.js：横滑 + 方向编辑:');
ok(/function normRot\(v\) \{/.test(app) && /function revStep\(\)/.test(app) && /function revScroll\(dir\)/.test(app)
  && /function revUpdatePos\(\)/.test(app) && /function revNavShow\(n\)/.test(app), '五个横滑辅助函数齐');
ok(/box\.scrollLeft = box\.scrollLeft \+ dir \* revStep\(\);/.test(app), '用 scrollLeft 赋值翻页，老 WebView 也认');
ok(/addEventListener\('scroll', revUpdatePos\)/.test(app), '滚动时更新「第 n / N 张」');
ok(/el\('div', 'img-frame rev-frame'\)/.test(app) && /frame\.appendChild\(img\)/.test(app), '审核图塞进 4:3 方向框');
ok(/frame\.setAttribute\('data-rot', String\(normRot\(p\.rot\)\)\);/.test(app), '首帧按服务端 rot 定角度');
ok(/↺ 左转/.test(app) && /↻ 右转/.test(app) && /⟳ 180°/.test(app) && /还原/.test(app) && /保存方向/.test(app), '四个角度 + 还原 + 保存六个按钮齐');
ok(/photoRot\(p\.k, cur, save, frame, p\)/.test(app), '保存方向走 photoRot');
ok(/AUTH\.Admin\.photoAct\('rot', k, '', rot\)/.test(app), 'photoRot 打 act=rot');
ok(/p\.rot = rot;/.test(app) && /frame\.setAttribute\('data-rot', String\(rot\)\)/.test(app), '成就地改内存 + 框角度');
/* 保住横滑位置：photoRot 函数体内不能调 loadRevPhotos */
const photoRotBody = grabFn(app, 'photoRot') || '';
ok(!/loadRevPhotos\(/.test(photoRotBody), '保存方向不整表重载，横滑停第几张还是第几张');
ok(/尺寸未知/.test(app) && /重新上架/.test(app), 'verify_apk.py:109 锁：尺寸未知 / 重新上架 仍在');
/* test_admin_list.js 的禁插区间：listNewFirst 与 renderList 之间不许有新函数 */
const fStart = app.indexOf('function listNewFirst('), fEnd = app.indexOf('function renderList()');
const fBetween = app.slice(fStart, fEnd);
ok(fStart >= 0 && fEnd > fStart && !/function (normRot|revScroll|photoRot|renderRevPhotos)/.test(fBetween), '禁插区间没被塞新函数');

console.log('normRot 真跑（角度归一化）:');
const nrSrc = grabFn(app, 'normRot');
ok(!!nrSrc, 'normRot 源码抽得到');
if (nrSrc) {
  const sb = { Math, Number };
  vm.createContext(sb);
  vm.runInContext(nrSrc + ';this.f = normRot;', sb);
  const cases = [[0, 0], [90, 90], [180, 180], [270, 270], [360, 0], [-90, 270], [450, 90], [45, 0], [NaN, 0], ['90', 90], [720, 0]];
  let nrBad = 0;
  cases.forEach(c => { if (sb.f(c[0]) !== c[1]) { nrBad++; console.log('      normRot(' + JSON.stringify(c[0]) + ') = ' + sb.f(c[0]) + ' 期望 ' + c[1]); } });
  ok(nrBad === 0, cases.length + ' 个角度边界全对', nrBad);
}

console.log('index.html：nav 与 class:');
ok(/<div id="revPhotoList" class="rev-list rev-photos">/.test(html), '待审列表加 rev-photos 专用 class');
ok(/id="revPhotoNav"/.test(html) && /id="revPrev"/.test(html) && /id="revPhotoPos"/.test(html) && /id="revNext"/.test(html), '上一张 / 位置 / 下一张 nav 齐');
ok(/<div id="revFbList" class="rev-list">/.test(html), '留言板仍是纯 .rev-list 纵向（不带 rev-photos）');
ok(/id="revPhotoRefresh"/.test(html), '刷新按钮仍在');

console.log('app.css：横滑 + 旋转框:');
ok(/\.rev-photos\{flex-direction:row/.test(css) && /scroll-snap-type:x mandatory/.test(css), 'rev-photos 横向 snap');
ok(/\.rev-photos > \.rev-item\{flex:0 0 100%/.test(css) && /scroll-snap-align:start/.test(css), '每张 100% 宽、起点对齐');
ok(/\.rev-list\{display:flex;flex-direction:column/.test(css), '全局 .rev-list 仍是纵向（留言板不塌）');
ok(/\.img-frame\{position:relative/.test(css) && /aspect-ratio:4 \/ 3/.test(css), '方向框固定 4:3');
ok(/translate\(-50%,-50%\) rotate\(0deg\)/.test(css), 'img 绝对居中 + 默认 0°');
ok(/\[data-rot="90"\] > img,/.test(css) && /width:75%;height:133\.333%/.test(css), '90/270 横竖互换收成 75% × 133.33%');
ok(/rotate\(90deg\)/.test(css) && /rotate\(180deg\)/.test(css) && /rotate\(270deg\)/.test(css), '三档角度都在');
ok(/\.img-frame-full > img\{object-fit:contain\}/.test(css), '大图用 contain 不裁边');

console.log('');
if (bad) { console.log('test_photo_rot: ' + (total - bad) + '/' + total + ' passed, ' + bad + ' FAILED'); process.exit(1); }
console.log('test_photo_rot: ' + total + ' passed, 0 failed \u2192 PASS');
