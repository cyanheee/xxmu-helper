/* test_nova_skin.js — 皮肤轴与深浅轴正交的离线测试。
 * 不依赖浏览器：把 nova-skin.js 放进最小沙箱里跑，断言读写、归一化、
 * data-skin 写入、与 THEME 互不覆盖、meta 颜色、设置页挂载。
 *   node tools/test_nova_skin.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'nova-skin.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web', 'nova-skin.css'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + label); } }

function boot(store, opts) {
  opts = opts || {};
  const attrs = {};
  const listeners = {};
  const doc = {
    documentElement: {
      attrs: attrs,
      dataset: {},
      setAttribute(k, v) { attrs[k] = String(v); this.dataset[k.replace('data-', '')] = String(v); },
      getAttribute(k) { return attrs[k] || null; }
    },
    querySelector(sel) {
      if (sel === 'meta[name="theme-color"]') return opts.meta || null;
      return null;
    },
    getElementById(id) { return opts.els && opts.els[id] ? opts.els[id] : null; },
    createElement(tag) {
      return { tagName: tag, className: '', children: [], attrs: {},
        classList: { _s: new Set(), add(x){this._s.add(x)}, remove(x){this._s.delete(x)},
                     toggle(x,f){f?this._s.add(x):this._s.delete(x)}, contains(x){return this._s.has(x)} },
        setAttribute(k,v){this.attrs[k]=v}, getAttribute(k){return this.attrs[k]||null},
        appendChild(c){this.children.push(c);return c}, textContent: '', onclick: null };
    },
    createTextNode(t) { return { text: t }; },
    addEventListener(k, fn) { listeners[k] = fn; }
  };
  const sandbox = {
    window: {}, document: doc, localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); }
    },
    Host: undefined, THEME: opts.theme || undefined, XXMU: { toast() {} },
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'nova-skin.js' });
  return { s: sandbox, attrs, doc, listeners, SKIN: sandbox.SKIN || sandbox.window.SKIN };
}

/* --- resolve 纯函数：乱码 / 空 / 越界一律回经典 --- */
{
  const { SKIN } = boot({});
  ok(SKIN.resolve('') === 'classic', '空值归一为 classic');
  ok(SKIN.resolve('nova') === 'nova', 'nova 保持 nova');
  ok(SKIN.resolve('NOVA') === 'classic', '大小写不冒充 nova');
  ok(SKIN.resolve('__garbage__') === 'classic', '乱码归一为 classic');
  ok(SKIN.resolve(null) === 'classic', 'null 归一为 classic');
  ok(SKIN.mode() === 'classic', '默认经典（没存过不自动开新皮肤）');
}

/* --- 首屏同步写 data-skin，冷启动不闪经典页 --- */
{
  const store = { xxmu_skin: 'nova' };
  const b = boot(store);
  ok(b.attrs['data-skin'] === 'nova', '首屏同步写 data-skin="nova"');
  ok(b.SKIN.isNova() === true, 'isNova() 读到 nova');
}
{
  const b = boot({});
  ok(b.attrs['data-skin'] === 'classic', '默认首屏写 data-skin="classic"');
}

/* --- set() 落盘 + 立即生效 + label --- */
{
  const store = {};
  const b = boot(store);
  b.SKIN.set('nova');
  ok(store.xxmu_skin === 'nova', 'set(nova) 写 pref');
  ok(b.attrs['data-skin'] === 'nova', 'set(nova) 立刻写属性');
  b.SKIN.set('classic');
  ok(store.xxmu_skin === '', 'set(classic) 清空 pref 回到默认');
  ok(b.attrs['data-skin'] === 'classic', 'set(classic) 立刻回经典');
  ok(b.SKIN.LABEL.nova === '万象舱', 'nova 中文名');
}

/* --- 与 THEME 正交：SKIN 绝不写 data-theme --- */
{
  const themeAttrs = {};
  const fakeTheme = {
    current() { return 'dark'; },
    apply() { themeAttrs.written = (themeAttrs.written || 0) + 1; }
  };
  const meta = { attrs: {}, setAttribute(k,v){this.attrs[k]=v} };
  const b = boot({ xxmu_skin: 'nova' }, { theme: fakeTheme, meta });
  ok(!('data-theme' in b.attrs), 'SKIN 不写 data-theme');
  ok(b.attrs['data-skin'] === 'nova', 'SKIN 只写 data-skin');
  ok(meta.attrs.content === '#121A2E', 'nova + dark 的状态栏色是夜航蓝');
  ok(themeAttrs.written === undefined, 'SKIN 不反向调用 THEME.apply');
}
{
  const meta = { attrs: {}, setAttribute(k,v){this.attrs[k]=v} };
  const b = boot({}, { meta });
  ok(meta.attrs.content === '#EFE2C8', 'classic + light 保留旧状态栏色');
}

/* --- 设置页挂载：两个按钮 + 独立 hint，不碰 themeInline --- */
{
  const box = { attrs: {}, children: [], appendChild(c){this.children.push(c);return c},
    getAttribute(k){return this.attrs[k]||null}, setAttribute(k,v){this.attrs[k]=v} };
  const b = boot({}, { els: { skinInline: box } });
  b.SKIN.mount('skinInline');
  ok(box.attrs['data-skin-mounted'] === '1', 'mount 有幂等标记');
  ok(box.children.length === 2, '挂载 wrap + hint 两个节点');
  ok(box.children[0].children.length === 2, '两个皮肤档：经典 / 万象舱');
  b.SKIN.mount('skinInline');
  ok(box.children.length === 2, '重复 mount 不叠加');
  const opts = box.children[0].children;
  ok(opts[0].attrs['data-skin-mode'] === 'classic', '第一档 classic');
  ok(opts[1].attrs['data-skin-mode'] === 'nova', '第二档 nova');
  opts[1].onclick();
  ok(b.attrs['data-skin'] === 'nova', '点万象舱立即写属性');
  ok(opts[1].classList.contains('on'), '选中态落在万象舱按钮');
  opts[0].onclick();
  ok(b.attrs['data-skin'] === 'classic', '点经典立即切回');
}

/* --- 静态接线：CSS/HTML/app.js 的锚点一个都不能丢 --- */
ok(idx.includes('<script src="nova-skin.js"></script>'), 'index.html 在 head 加载 nova-skin.js');
ok(idx.indexOf('<script src="nova-skin.js"></script>') < idx.indexOf('<link rel="stylesheet" href="app.css">'),
   'nova-skin.js 在 app.css 之前（只比标签，避开注释里的文件名）');
ok(idx.includes('<link rel="stylesheet" href="nova-skin.css">'), 'index.html 加载 nova-skin.css');
ok(idx.includes('id="skinInline"'), '设置页有皮肤挂载点');
ok(idx.includes('id="skinState"'), '我的页有皮肤状态行');
ok(idx.includes('if (window.SKIN && SKIN.init) SKIN.init();'), 'DOM 末尾补 init');
ok(app.includes("getElementById('rowSkin')"), 'app.js 绑定皮肤入口行');
ok(css.includes('html[data-skin="nova"][data-theme="dark"]'), 'CSS 存在浅深正交规则');
/* 正式页面实拍教训：只给 #app 铺水彩底，app.css 末尾西部覆盖层给 html
   标签写的牛皮纸+方格+红皮绳会整片漏在内容外沿。必须打 html 标签级。 */
ok(/html\[data-skin="nova"\]\{\s*background-color:var\(--n-shell\) !important/.test(css),
   '浅色档 html 标签级背景清零存在');
ok(/html\[data-skin="nova"\]\[data-theme="dark"\]\{\s*background-color:var\(--n-shell\) !important/.test(css),
   '深色档 html 标签级背景清零存在');
ok(/html\[data-skin="nova"\] header::after\{display:none !important\}/.test(css),
   '顶栏西部针脚线被关掉');
ok(/#grid \.c\{/.test(css) && !/#grid \.course\{/.test(css),
   '课程块覆盖命中真实 .c（不是臆造的 .course）');
ok(css.includes('html[data-skin="nova"] .card::before,\nhtml[data-skin="nova"] .card::after{content:none !important}'),
   '经典纸卡片胶带/蹄铁星在 NOVA 下被彻底关掉');
ok(!/html\[data-skin="nova"\][^\n]*setAttribute\('data-theme'/.test(src), 'JS 不改深浅轴');
ok(/prefers-reduced-motion:reduce/.test(css), '减少动效总闸存在');
/* v1.1.56 护栏：夹具源码里每条 harness 字符串必须是单行。
 * 折行一次就会让 node 报 "Invalid or unexpected token"，
 * 而截图会静默退回上一版夹具，看起来像"改了没效果"。 */
{
  /* v1.1.56 护栏：夹具源码里每条 harness 字符串必须单行且语法合法。
   * 折行一次就会让 node 报 "Invalid or unexpected token"，
   * 而截图会静默退回上一版夹具，看起来像"改了没效果"（已栽过三次）。
   * 直接用 vm 把夹具当脚本 parse 一遍，比查引号可靠。 */
  const vm = require('vm');
  const mkPath = path.join(root, 'design/sketch/make_nova_real.js');
  const mkSrc = fs.readFileSync(mkPath, 'utf8');
  let syntaxOk = true, syntaxErr = '';
  try { new vm.Script(mkSrc, { filename: 'make_nova_real.js' }); }
  catch (e) { syntaxOk = false; syntaxErr = String(e.message).split('\n')[0]; }
  ok(syntaxOk, 'make_nova_real.js 语法合法（vm 解析）', syntaxErr);
  const badLines = [];
  mkSrc.split('\n').forEach((l, i) => {
    const t = l.trim();
    if (!t.startsWith("'")) return;
    if ((t.match(/'/g) || []).length % 2 !== 0) badLines.push('L' + (i + 1));
  });
  ok(badLines.length === 0, 'make_nova_real.js 每条 harness 字符串单行闭合', badLines.slice(0, 4).join(','));
}

console.log('test_nova_skin: ' + pass + ' passed, ' + fail + ' failed → ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
