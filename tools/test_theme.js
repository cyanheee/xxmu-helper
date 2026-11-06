/* 主题系统的离线行为测试（v1.1.39）
 *
 *   node tools/test_theme.js
 *
 * 为什么静态锚点不够：这一版最容易出的错是「文件都在、接线全对，但
 * resolve 写反了 / auto 档没跟随系统 / __onResume 把 elec 的覆盖掉了」。
 * 这三类只有在沙箱里真跑一遍逻辑才看得出来（v1.1.35 课程提醒、
 * v1.1.22 mytodo 都栽在「只验有没有，没验跑起来对不对」）。
 *
 * 能验：三档×系统亮暗的判定、pref 读写与归一化、data-theme / theme-color /
 *       Java 桥调用、系统变化回调、__onResume 链式、外观半框三按钮点击、
 *       CSS 深色变量覆盖完整性。
 * 不能验：真机状态栏图标颜色、WebView 自动反色是否真被关掉、深色观感。
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

/* ---------------------------------------------------------------- DOM shim
 * 忠实度要求（v1.1.22 的教训）：classList.add/remove 必须同步 className，
 * innerHTML='' 必须真的清掉 children，querySelector 必须能找到 meta。
 * 否则测试报的 FAIL 是 shim 造出来的假象。 */
function El(tag) {
  const self = {
    tagName: tag, children: [], attrs: {}, className: '', textContent: '',
    style: {}, onclick: null, _listeners: {}, value: '', checked: false,
    get innerHTML() { return ''; },
    set innerHTML(v) { if (v === '') { this.children = []; this.textContent = ''; } },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    addEventListener(k, fn) { (this._listeners[k] = this._listeners[k] || []).push(fn); },
    get classList() {
      const e = this;
      return {
        add(c) { const s = new Set(e.className.split(/\s+/).filter(Boolean)); s.add(c); e.className = [...s].join(' '); },
        remove(c) { e.className = e.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
        contains(c) { return e.className.split(/\s+/).includes(c); },
      };
    },
    get dataset() { return this._dataset || (this._dataset = {}); },
  };
  return self;
}

function makeEnv(sysDark, saved, headOnly) {
  const store = Object.assign({}, saved || {});
  const html = El('html');
  const meta = El('meta'); meta.attrs['name'] = 'theme-color'; meta.attrs.content = '#ffffff';
  const body = El('div'), name = El('b'), sheet = El('div'), row = El('div');
  const els = {
    'sh-body': body, 'sh-name': name, sheet: sheet,
    rowTheme: row, themeState: El('span'),
  };
  const Host = {
    getPref: k => (store[k] === undefined ? '' : store[k]),
    setPref: (k, v) => { store[k] = v; },
    isSystemDark: () => !!sysDark,
    setAppTheme: d => { Host.__lastTheme = !!d; Host.__calls = (Host.__calls || 0) + 1; },
    __lastTheme: null, __calls: 0,
  };
  let mqHandler = null;
  const matchMedia = q => ({
    matches: !!sysDark,
    addEventListener: (ev, fn) => { if (ev === 'change') mqHandler = fn; },
    addListener: fn => { mqHandler = fn; },
  });
  /* head 阶段：DOM 还没解析，getElementById 一律返回 null。
   * 用一个开关模拟真实的加载时序，验证首屏 apply() 不依赖任何 DOM 节点。
   * 默认（headOnly=false）模拟「脚本已经跑完、DOM 也就绪」，方便后续断言 UI。 */
  let domReady = !headOnly;
  const document = {
    documentElement: html,
    getElementById: id => (domReady ? (els[id] || null) : null),
    /* <meta name="theme-color"> 写在 theme.js 之前，head 阶段就已经能查到。
     * 把它也跟着 domReady 藏起来是不忠实的 shim（真浏览器里它一直在）。 */
    querySelector: sel => sel === 'meta[name="theme-color"]' ? meta : null,
    createElement: El,
    addEventListener: (k, fn) => { if (k === 'DOMContentLoaded') document.__dcl = fn; else document.__vis = fn; },
    hidden: false,
  };
  const sandbox = {
    Host, document, localStorage: {
      getItem: k => (store[k] === undefined ? null : store[k]),
      setItem: (k, v) => { store[k] = String(v); },
    },
    matchMedia,
    console, Date, String, Object, Array, Set, JSON,
    XXMU: { toast: m => { sandbox.__toast = m; } },
    parkTools: () => { sandbox.__parked = (sandbox.__parked || 0) + 1; },
    /* 预置一个「别人已挂的 __onResume」（模拟 elec.js 先加载完） */
    __onResume: () => { sandbox.__prevResume = (sandbox.__prevResume || 0) + 1; },
  };
  /* 真浏览器里 window === globalThis。vm 里必须手动做成同一个对象，
   * 否则 theme.js 的 window.THEME = ... 写到了别处，测试读到 undefined。 */
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('web/theme.js'), sandbox, { filename: 'theme.js' });
  return {
    sandbox, store, html, meta, els, Host,
    T: sandbox.THEME,
    setSys(v) { sysDark = v; Host.isSystemDark = () => !!v; },
    /* DOM 就绪：节点开始可见 + 触发 DOMContentLoaded（head 阶段补画那条路）。
     * theme.js 的 init() 是另一条独立路径，测试里单独调，不混在这里。 */
    ready() {
      domReady = true;
      if (document.__dcl) document.__dcl();
      sandbox.THEME.paint();      // body 末尾 THEME.init() 那条路
    },
    fireMq() { if (mqHandler) mqHandler(); },
    fireDcl() { domReady = true; if (document.__dcl) document.__dcl(); },
    fireVis() { if (document.__vis) document.__vis(); },
  };
}

/* ---------------------------------------------------------------- 1. resolve 纯函数 */
console.log('1. 三档 × 系统亮暗 → 实际主题（纯函数，6 个组合）');
{
  const e = makeEnv(false, {});
  const cases = [
    ['auto', false, 'light'], ['auto', true, 'dark'],
    ['light', false, 'light'], ['light', true, 'light'],
    ['dark', false, 'dark'], ['dark', true, 'dark'],
    ['garbage', true, 'dark'],   // 乱码当 auto，仍跟随系统
  ];
  cases.forEach(c => ok(e.T.resolve(c[0], c[1]) === c[2],
    'resolve(' + c[0] + ', sys=' + c[1] + ') = ' + c[2], e.T.resolve(c[0], c[1])));
}

/* ---------------------------------------------------------------- 2. 首屏 apply */
console.log('\n2. 首屏：data-theme / theme-color / Java 桥');
{
  const e = makeEnv(true, {});   // 系统深色 + 没设过主题
  ok(e.html.attrs['data-theme'] === 'dark', '系统深色且没设过 → html 上是 dark', e.html.attrs['data-theme']);
  ok(e.html.dataset.theme === 'dark', 'dataset.theme 同步');
  ok(e.meta.attrs.content === '#0e1320', 'theme-color 改成深色', e.meta.attrs.content);
  ok(e.Host.__lastTheme === true, 'Host.setAppTheme(true) 真的调了');
  ok(e.T.mode() === 'auto', '没设过时 mode() = auto');
  ok(e.T.current() === 'dark', 'current() 是真正生效的 dark');
  ok(e.els.themeState.textContent === '跟随系统 ›', '入口状态字显示「跟随系统」', e.els.themeState.textContent);
}
{
  const e = makeEnv(false, { xxmu_theme: 'light' });
  ok(e.html.attrs['data-theme'] === 'light', '显式浅色且系统浅 → light');
  ok(e.Host.__lastTheme === false, 'Java 桥收到 false');
}
{
  const e = makeEnv(false, { xxmu_theme: 'dark' });
  ok(e.html.attrs['data-theme'] === 'dark', '显式深色，系统浅也强制 dark');
}
{
  const e = makeEnv(true, { xxmu_theme: 'light' });
  ok(e.html.attrs['data-theme'] === 'light', '显式浅色，系统深也不变');
}

/* ---------------------------------------------------------------- 2a. 加载时序 */
console.log('\n2a. 真实加载时序（head 阶段 DOM 还不存在）');
{
  const e = makeEnv(true, { xxmu_theme: 'dark' }, true);   // 上次选了深色、系统也深色
  ok(e.html.attrs['data-theme'] === 'dark', 'head 阶段就已经把 html 设成 dark（不闪白）');
  ok(e.meta.attrs.content === '#0e1320', 'head 阶段 meta 也改了');
  ok(e.Host.__lastTheme === true, 'head 阶段就通知了 Java');
  ok(e.els.themeState.textContent === '', '此刻 #themeState 还不存在（符合真实 DOM 时序）',
    JSON.stringify(e.els.themeState.textContent));
  /* 只触发 DOMContentLoaded 兜底，不调 init() —— 模拟 body 末尾那行没跑到 */
  e.fireDcl();
  ok(e.els.themeState.textContent === '深色 ›',
    'DOMContentLoaded 补画后状态字与真实主题一致（不谎报「跟随系统」）',
    e.els.themeState.textContent);
  ok(e.els.rowTheme.onclick === null, '入口行的绑定仍由 THEME.init() 负责（职责分开）');
  e.T.init();
  ok(e.els.rowTheme.onclick === e.T.open, 'init 后入口可点');
}

/* ---------------------------------------------------------------- 3. 持久化与归一化 */
console.log('\n3. 切换 / 持久化 / 脏值');
{
  const e = makeEnv(false, {});
  e.T.set('dark');
  ok(e.store.xxmu_theme === 'dark', 'set(dark) 落到 pref');
  ok(e.html.attrs['data-theme'] === 'dark', '切完立刻生效');
  ok(e.Host.__lastTheme === true, '切完立刻通知 Java');
  ok(e.els.themeState.textContent === '深色 ›', '状态字跟着变', e.els.themeState.textContent);
  e.T.set('light');
  ok(e.store.xxmu_theme === 'light' && e.html.attrs['data-theme'] === 'light', '再切回浅色');
  e.T.set('auto');
  ok(e.store.xxmu_theme === '', 'auto 存空串（清数据后自然回到跟随系统）', JSON.stringify(e.store.xxmu_theme));
  ok(e.html.attrs['data-theme'] === 'light', 'auto + 系统浅 = light');
}
{
  const e = makeEnv(true, { xxmu_theme: '#乱码%%' });
  ok(e.T.mode() === 'auto', 'pref 里的脏值归一化为 auto', e.T.mode());
  ok(e.T.current() === 'dark', '脏值不会把人锁死在浅色');
}

/* ---------------------------------------------------------------- 4. 系统夜间模式变化 */
console.log('\n4. 系统主题变化时（Java onConfigurationChanged / matchMedia）');
{
  const e = makeEnv(false, {});   // auto + 系统浅
  e.T.init();                     // __onThemeSys 是在 init 里挂上的
  ok(e.html.attrs['data-theme'] === 'light', '起始 light');
  e.setSys(true);
  e.sandbox.__onThemeSys();       // Java 回调
  ok(e.html.attrs['data-theme'] === 'dark', '__onThemeSys 后变 dark');
  ok(e.Host.__lastTheme === true, 'Java 侧状态栏也跟着变');
  e.setSys(false);
  e.fireMq();                     // 浏览器兜底
  ok(e.html.attrs['data-theme'] === 'light', 'matchMedia change 后变回 light');
}
{
  const e = makeEnv(false, { xxmu_theme: 'dark' });
  e.T.init();
  e.setSys(true);
  e.sandbox.__onThemeSys();
  ok(e.html.attrs['data-theme'] === 'dark', '用户锁深色时系统变化不覆盖选择');
}

/* ---------------------------------------------------------------- 5. __onResume 链式 */
console.log('\n5. onResume 不能把 elec.js 的回调覆盖掉');
{
  const e = makeEnv(false, {});
  e.T.init();
  ok(typeof e.sandbox.__onResume === 'function', 'init 后仍有 __onResume');
  e.sandbox.__onResume();
  ok(e.sandbox.__prevResume === 1, '前一个 __onResume（elec）真的被调到', e.sandbox.__prevResume);
  ok(e.Host.__calls >= 2, '同时重算了一次主题', e.Host.__calls);
  ok(e.els.rowTheme.onclick === e.T.open, 'rowTheme 绑定到 THEME.open');
}

/* ---------------------------------------------------------------- 6. 外观半框 */
console.log('\n6. 「我的 → 外观」半框三档');
{
  const e = makeEnv(false, {});
  e.T.init();
  e.T.open();
  ok(e.els['sh-name'].textContent === '外观', '半框标题是「外观」');
  ok(e.sandbox.__parked === 1, 'open 先请回停车场（不与待办/番茄钟叠着）');
  ok(e.els.sheet.classList.contains('on'), '半框打开');
  const wrap = e.els['sh-body'].children[0];
  ok(!!wrap && wrap.children.length === 3, '三个选项按钮', wrap && wrap.children.length);
  const modes = wrap ? wrap.children.map(b => b.getAttribute('data-mode')) : [];
  ok(modes.join(',') === 'auto,light,dark', '顺序：跟随系统 / 浅色 / 深色', modes.join(','));
  ok(wrap && wrap.children[0].classList.contains('on'), '默认选中「跟随系统」');
  ok(wrap && wrap.children[0].children[1].textContent === '✓', '选中项有 ✓');
  /* 点「深色」 */
  wrap.children[2].onclick();
  ok(e.store.xxmu_theme === 'dark', '点深色后存了 dark');
  ok(e.html.attrs['data-theme'] === 'dark', '点深色后页面立刻变深');
  ok(!wrap.children[0].classList.contains('on') && wrap.children[2].classList.contains('on'),
    '选中态从 auto 移到 dark');
  ok(e.sandbox.__toast === '已切换：深色', '有 toast 反馈', e.sandbox.__toast);
  const hint = e.els['sh-body'].children[1];
  ok(!!hint && hint.textContent.indexOf('当前：深色') === 0, '提示写明当前生效的是深色', hint && hint.textContent);
  /* 点「跟随系统」 */
  wrap.children[0].onclick();
  ok(e.store.xxmu_theme === '' && e.html.attrs['data-theme'] === 'light', '点回跟随系统立即恢复浅色');
}

/* ---------------------------------------------------------------- 7. CSS 深色变量覆盖 */
console.log('\n7. app.css：深色块必须覆盖全部语义变量（漏一个就花脸）');
{
  const css = read('web/app.css');
  const light = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));
  const darkStart = css.indexOf('html[data-theme="dark"]{');
  ok(darkStart > 0, '有深色块');
  const dark = css.slice(darkStart, css.indexOf('}', darkStart));
  const lightVars = [...light.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]);
  const darkVars = [...dark.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]);
  /* 只有「颜色 / 阴影 / 遮罩」这类会花脸的变量才必须在深色里重给值。
   * --radius / --radius-sm 是尺寸，两种主题共用同一个值是对的，
   * 强行要求「全部变量都覆盖」是测试期望写宽了（第一版就误报过这两条）。 */
  const SAME_IN_DARK = new Set(['--radius', '--radius-sm']);
  const missing = lightVars.filter(v => !SAME_IN_DARK.has(v) && !darkVars.includes(v));
  ok(missing.length === 0,
    '浅色的 ' + (lightVars.length - SAME_IN_DARK.size) + ' 个颜色/阴影变量，深色全给了值',
    missing.join(','));
  ok(darkVars.length >= 45, '深色变量数量足够（不是只改了底色）', darkVars.length);
  ok(darkVars.indexOf('--radius') < 0, '尺寸类变量不重复定义（两种主题共用）');
  ok(/color-scheme:\s*dark/.test(dark), '深色块声明 color-scheme');
  /* 组件里残留的中性硬编码（变量定义行不算）*/
  const neutralOk = new Set(['#fff', '#2563eb', '#3b82f6', '#4f46e5', '#60a5fa',
    '#4b7bec', '#2f5fe0', '#ea580c', '#f59e0b', '#e8f0fe', '#16233a', '#4a5666', '#5b6884']);
  const stray = [];
  css.split(/\r?\n/).forEach((ln, i) => {
    const l = ln.trim();
    if (/^--[\w-]+\s*:/.test(l) || l.startsWith('/*') || l.startsWith('*')) return;
    (l.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(c => {
      if (!neutralOk.has(c.toLowerCase())) stray.push((i + 1) + ':' + c);
    });
  });
  ok(stray.length === 0, '组件里没有会花脸的中性硬编码', stray.slice(0, 8).join(' '));
  ok(/\.th-opt\{/.test(css) && /\.th-opt\.on\{/.test(css), '外观选项样式齐全');
}

/* ---------------------------------------------------------------- 8. Java / 清单接线 */
console.log('\n8. Java 侧与 manifest 接线（链路每一端都在）');
{
  const main = read('android/src/com/xxmu/helper/MainActivity.java');
  const webAct = read('android/src/com/xxmu/helper/WebActivity.java');
  const mani = read('android/AndroidManifest.xml');
  ok(/public boolean isSystemDark\(\)/.test(main), 'isSystemDark 用 Configuration.uiMode');
  ok(/UI_MODE_NIGHT_YES/.test(main), '真的比了 UI_MODE_NIGHT_YES');
  ok(/public void setAppTheme\(final boolean dark\)/.test(main), 'Host.setAppTheme 桥');
  ok(/runOnUiThread\(new Runnable\(\)/.test(main.slice(main.indexOf('setAppTheme'))), '桥里 post 回 UI 线程');
  ok(/applyAppTheme\(themeDarkNow\(\)\);\s*\n\s*web\.loadUrl/.test(main.replace(/\r/g, '')),
    'onCreate 在 loadUrl 之前设首屏底色');
  ok(/onConfigurationChanged/.test(main), '处理系统夜间模式变化');
  ok(/keyboardHidden\|uiMode/.test(mani), 'configChanges 含 uiMode');
  ok(/setAlgorithmicDarkeningAllowed\(false\)/.test(main) && /FORCE_DARK_OFF/.test(main),
    'MainActivity 关掉自动反色（33+ / 29~32 两条分支）');
  ok(/setAlgorithmicDarkeningAllowed\(false\)/.test(webAct), 'WebActivity 也关掉自动反色');
  ok(/window\.__onThemeSys/.test(main), '系统变化回调页面');
}

console.log('\n' + (bad === 0
  ? '[PASS] 主题系统 ' + total + ' 条断言全过'
  : '[FAIL] ' + bad + '/' + total + ' 条未过'));
process.exit(bad === 0 ? 0 : 1);
