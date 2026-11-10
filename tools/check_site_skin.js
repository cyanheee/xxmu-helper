/* check_site_skin.js — 官网 NOVA 换肤验收器
 *   node tools/check_site_skin.js
 * 判据：真源 CSS 与内联完全一致 / 旧西部涂鸦痕迹清零 / NOVA 器官齐全 /
 *       真源里的禁用词不许在官网正文里出现 / BUILD 键已换。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'design/sketch/site-style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/pages/dist/index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'server/pages/dist/_worker.js'), 'utf8');
const m = /<style>\s*([\s\S]*?)\s*<\/style>/i.exec(html);
const inline = m ? m[1].trim() : '';
let pass = 0, fail = 0;
function ok(c, label) { if (c) pass++; else { fail++; console.log('  FAIL  ' + label); } }

ok(!!m, '官网 index.html 有内联 <style>');
/* 真源注释里写着 "<style>…</style>" 字样，正则会提前截断，
 * 所以按真实的闭合标签定位，再和真源逐字比。 */
const head = html.slice(0, html.indexOf('</head>'));
const styleOpen = head.indexOf('<style>');
const styleClose = head.lastIndexOf('</style>');
const inlineFull = styleOpen >= 0 && styleClose > styleOpen
  ? head.slice(styleOpen + 7, styleClose).trim() : '';
ok(inlineFull === css.trim(), '内联样式与 site-style.css 真源逐字一致');
ok(css.includes('--shell:#E8EEF0'), '真源是 NOVA 冷瓷白色板');
ok(!css.includes('--paper:#EFE2C8'), '旧牛皮纸色板已清除');
for (const w of ['牛皮纸', '红皮绳', '蹄铁星', '胶带', '针脚', '方格']) {
  ok(!css.includes(w) || css.indexOf('/*') < css.indexOf(w) && /作废|不是/.test(css),
     '旧装饰词不作为实现出现：' + w);
}
for (const k of ['--glass:#122A38','clip-path:polygon(16px','XXMU / NOVA OS','--cyan:#35E0D0',
                 'MIXTAPE','prefers-reduced-motion']) {
  ok(css.includes(k), 'NOVA 器官/约束存在：' + k);
}
ok(/<meta name="theme-color" content="#E8EEF0">/.test(html),
   'theme-color 与 NOVA 同源冷瓷白');
ok(!/<style>[\s\S]*?--paper:#EFE2C8/.test(html), '内联里不再有西部涂鸦样式');
/* BUILD 键跟着 APK 的 versionName 走：从 manifest 派生，别写死版本字面量，
 * 否则每次发版都要回来改这一行，忘了就成了假绿。 */
const manifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const verName = (/android:versionName="([\d.]+)"/.exec(manifest) || [, ''])[1];
const verRe = new RegExp("const BUILD = 'v" + verName.replace(/\./g, '\\.') + "[^']*'");
ok(!!verName && verRe.test(worker), '_worker.js 的 BUILD 已切到 v' + verName + ' 系列');
/* v1.1.54 把三张手机示意图内联进首页省请求；换肤时若只重生 img/*.svg
   而忘了内联副本，官网右侧会整片残留西部涂鸦。 */
ok(!/<svg class="shot"/.test(html), '首页无内联旧版手机示意 SVG');
ok((html.match(/src="img\/shot-(kb|learn|water)\.svg"/g) || []).length === 3,
   '三张手机示意图均引用 NOVA SVG（相对路径，file:// 与线上同源）');
for (const f of ['shot-kb.svg','shot-learn.svg','shot-water.svg']) {
  const p = path.join(root, 'server/pages/dist/img', f);
  const svg = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  ok(svg.includes('#122A38') && !svg.includes('#EFE2C8'), 'NOVA 示意图无旧牛皮纸：' + f);
}
/* 官网必须讲到 App 的三个招牌器官，否则官网与 App 说的不是一回事 */
for (const [kw, label] of [['周次传送带', '周次传送带'], ['磁带门', '磁带门'], ['波段拨盘', '波段拨盘'],
                            ['万象舱', '万象舱皮肤']]) {
  ok(html.includes(kw), '官网提到：' + label);
}
ok(/id="nova"/.test(html), '官网有独立的「另一套界面」区块');

/* ---- 官网深色档（紫夜舱）护栏 ----
 * 官网跟 App 一样有浅/深两档。深色档必须自成一套介质：
 * 不能只是把背景调黑，也不能掉回西部涂鸦的旧深棕紫。 */
ok(css.includes('@media (prefers-color-scheme:dark)'), '真源含跟随系统的深色档');
ok(css.includes('--shell:#1A1430'), '深色档底色是紫夜舱 #1A1430');
ok(css.includes('--cyan:#9E8CFF'), '深色档主光升为紫罗兰 #9E8CFF');
ok(css.includes('--violet:#C08CFF'), '深色档辅光为 #C08CFF');
ok(!/prefers-color-scheme:dark[\s\S]{0,4000}#3B3225/.test(css), '深色档没有旧深棕紫');
ok(!/prefers-color-scheme:dark[\s\S]{0,4000}#000000\s*;/.test(css), '深色档不使用纯黑');
/* 深色段里必须真的改到这些元件，否则页面会白底黑字地漏出来 */
for (const sel of ['.fcard', '.dl', '.btn', '.contact', '.phone', 'footer']) {
  ok(new RegExp('prefers-color-scheme:dark[\\s\\S]{0,4000}' + sel.replace('.', '\\.') + '\\s*[,{]')
      .test(css), '深色档覆盖了 ' + sel);
}
/* 深色预览副本：是把媒体查询提为无条件的机制，不是手改内联 */
const darkPrev = path.join(root, 'design', 'sketch', 'site-dark-preview.html');
if (fs.existsSync(darkPrev)) {
  const dp = fs.readFileSync(darkPrev, 'utf8');
  ok(dp.includes('--shell:#1A1430'), '深色预览副本含紫夜舱底色');
  ok(dp.includes('src="../../server/pages/dist/img/shot-kb.svg"'), '深色预览副本示意图路径可解析');
  ok(!dp.includes('<meta name="theme-color" content="#E8EEF0">'), '深色预览副本状态栏色已改');
}
/* 深色长图必须真的存在且不是空白 */
for (const f of ['site-nova-light.png', 'site-nova-dark.png']) {
  const p = path.join(root, 'design', 'sketch', 'shots', f);
  const okF = fs.existsSync(p) && fs.statSync(p).size > 20000;
  ok(okF, '官网长图存在且非空：' + f);
}
if (fs.existsSync(path.join(root, 'design/sketch/shots/site-nova-light.png')) &&
    fs.existsSync(path.join(root, 'design/sketch/shots/site-nova-dark.png'))) {
  const h = (f) => require('crypto').createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'design/sketch/shots', f))).digest('hex');
  ok(h('site-nova-light.png') !== h('site-nova-dark.png'), '官网浅色/深色长图内容不同');
}

console.log('check_site_skin: ' + pass + ' passed, ' + fail + ' failed → ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
