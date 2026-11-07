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

/* 从 theme.js 真源码里抠出两个状态栏色，测试跟着实现走。
 * 换主题色（v1.1.50 素描纸）时这里不用再改第二遍。 */
const themeSrc = read('web/theme.js');
const mMeta = themeSrc.match(/META_LIGHT\s*=\s*'([^']+)'[^;]*META_DARK\s*=\s*'([^']+)'/);
if (!mMeta) throw new Error('theme.js 里没找到 META_LIGHT / META_DARK');
const META_LIGHT = mMeta[1], META_DARK = mMeta[2];

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
  /* v1.1.50：初始 meta 内容与断言目标都从 theme.js 真源码里读，
   * 不再写死 #ffffff / #0e1320 —— 换主题色时测试不用跟着改。 */
  const meta = El('meta'); meta.attrs['name'] = 'theme-color';
  meta.attrs.content = META_LIGHT;
  const body = El('div'), name = El('b'), sheet = El('div');
  const inline = El('div');           // 设置页里常驻三档的容器
  const settingsState = El('span');   // 「我的」页设置入口的状态字
  settingsState.attrs['data-theme-state'] = '';
  const themeState = El('span');
  themeState.attrs['data-theme-state'] = '';
  /* v1.1.40 起 index.html 里已经没有 id="rowTheme" 那一行了
   *（三档直接铺在设置页里），shim 跟着真实 DOM，不再伪造这个节点。 */
  const els = {
    'sh-body': body, 'sh-name': name, sheet: sheet,
    themeInline: inline, settingsState: settingsState, themeState: themeState,
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
    querySelectorAll: sel => {
      if (!domReady || sel !== '[data-theme-state]') return [];
      return [els.settingsState, els.themeState];
    },
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
  ok(e.meta.attrs.content === META_DARK, 'theme-color 改成深色', e.meta.attrs.content);
  ok(e.Host.__lastTheme === true, 'Host.setAppTheme(true) 真的调了');
  ok(e.T.mode() === 'auto', '没设过时 mode() = auto');
  ok(e.T.current() === 'dark', 'current() 是真正生效的 dark');
  ok(e.els.themeState.textContent === '跟随系统 ›', '入口状态字显示「跟随系统」', e.els.themeState.textContent);
  ok(e.els.settingsState.textContent === '跟随系统 ›', '「我的」页设置入口状态字同步', e.els.settingsState.textContent);
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
  ok(e.meta.attrs.content === META_DARK, 'head 阶段 meta 也改了');
  ok(e.Host.__lastTheme === true, 'head 阶段就通知了 Java');
  ok(e.els.themeState.textContent === '', '此刻 #themeState 还不存在（符合真实 DOM 时序）',
    JSON.stringify(e.els.themeState.textContent));
  /* 只触发 DOMContentLoaded 兜底，不调 init() —— 模拟 body 末尾那行没跑到 */
  e.fireDcl();
  ok(e.els.themeState.textContent === '深色 ›',
    'DOMContentLoaded 补画后状态字与真实主题一致（不谎报「跟随系统」）',
    e.els.themeState.textContent);
  e.T.init();
  ok(e.els.themeInline.children.length === 2,
    'init 把三档直接铺进设置页（不用再点开半框）', e.els.themeInline.children.length);
  const inlineWrap = e.els.themeInline.children[0];
  ok(!!inlineWrap && inlineWrap.children.length === 3, '设置页里三个按钮');
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
  ok(e.els.settingsState.textContent === '深色 ›', '设置入口状态字也跟着变（多处同步）', e.els.settingsState.textContent);
  e.T.set('light');
  ok(e.els.settingsState.textContent === '浅色 ›', '切回浅色，两处都更新');
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
  ok(e.els.themeInline.children.length === 2, '设置页三档仍然常驻');
}

/* ---------------------------------------------------------------- 6. 外观半框 */
console.log('\n6. 外观三档（半框 / 设置页内嵌共用同一套逻辑）');
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

/* ---------------------------------------------------------------- 6a. 设置页常驻三档 */
console.log('\n6a. 设置页里直接点三档（v1.1.40）');
{
  const e = makeEnv(false, {});
  e.T.init();
  const inlineWrap = e.els.themeInline.children[0];
  ok(!!inlineWrap && inlineWrap.children.length === 3, '三档铺在设置页里');
  ok(inlineWrap.children[0].classList.contains('on'), '默认选中跟随系统');
  inlineWrap.children[2].onclick();                 // 点深色
  ok(e.store.xxmu_theme === 'dark' && e.html.attrs['data-theme'] === 'dark', '设置页里点深色立刻生效');
  ok(inlineWrap.children[2].classList.contains('on') && !inlineWrap.children[0].classList.contains('on'),
    '设置页选中态跟着变');
  ok(e.els.settingsState.textContent === '深色 ›', '「我的」页入口状态字同步');
  /* 关键回归：开过一次半框再回设置页，常驻那组不能被 dropTransient 弄丢 */
  e.T.open();
  e.T.open();
  ok(e.els.themeInline.children.length === 2, '半框重开不会重复挂三档');
  inlineWrap.children[1].onclick();                 // 在设置页点浅色
  ok(e.store.xxmu_theme === 'light' && inlineWrap.children[1].classList.contains('on'),
    '开过半框后设置页三档仍能切换并刷新');
  /* 半框那组也跟着同步（两个地方选中态不打架） */
  const sheetWrap = e.els['sh-body'].children[0];
  ok(sheetWrap.children[1].classList.contains('on'), '半框里的选中态同步为浅色');
  ok(e.els.settingsState.textContent === '浅色 ›', '状态字仍同步');
}

/* ---------------------------------------------------------------- 7. CSS 深色变量覆盖 */
/* ---------------------------------------------------------------- 7. 设置页与导航结构 */
console.log('\n7. 独立设置页：DOM / 层级 / 入口真走');
{
  const idx = read('web/index.html');
  const app = read('web/app.js');
  ok(/<section id="tab-settings" class="tab">/.test(idx), '有独立设置页 section');
  ok(/id="rowSettings"/.test(idx), '「我的」页有设置入口');
  ok(/id="settingsBack"/.test(idx), '设置页有返回按钮');
  ok(/id="themeInline"/.test(idx), '外观三档容器在设置页里');
  ok(/id="setStart"/.test(idx) && /id="setSave"/.test(idx), '学期设置搬进设置页（id 保留）');
  ok(/id="rowUpd"/.test(idx) && /id="resync"/.test(idx), '检查更新与重读数据搬进设置页（id 保留）');
  const me = idx.slice(idx.indexOf('id="tab-me"'), idx.indexOf('id="tab-settings"'));
  const st = idx.slice(idx.indexOf('id="tab-settings"'), idx.indexOf('id="tab-guide"'));
  ok(st.indexOf('id="setStart"') >= 0 && me.indexOf('id="setStart"') < 0, '学期设置真的搬走了（不是两份）');
  ok(st.indexOf('id="rowUpd"') >= 0 && me.indexOf('id="rowUpd"') < 0, '检查更新真的搬走了');
  ok(st.indexOf('id="resync"') >= 0 && me.indexOf('id="resync"') < 0, '重读数据真的搬走了');
  ok(st.indexOf('id="themeInline"') >= 0 && me.indexOf('id="themeInline"') < 0, '外观三档只在设置页');
  ok(me.indexOf('id="rowTheme"') < 0 && st.indexOf('id="rowTheme"') < 0,
    '不再有重复的外观行（设置页里直接铺开）');
  ok(/settings:\s*'me'/.test(app), 'TAB_PARENT 有 settings → me（返回键/底栏自动接管）');
  ok(/settings:\s*\['设置'/.test(app), 'PAGE_HEAD 有设置页标题');
  ok(/rowSettings[\s\S]{0,300}switchTab\('settings'\)/.test(app), '入口真的跳转到设置页');
  ok(/settingsBack[\s\S]{0,160}switchTab\('me'\)/.test(app), '返回箭头回到「我的」');
  ok(/switchTab\('settings'\)[\s\S]{0,200}THEME\.paint/.test(app), '进设置页重画状态字');
  ok(/data-theme-state/.test(idx), '状态字用 data-theme-state 批量同步');
}

/* ---------------------------------------------------------------- 7a. 图标方案 */
console.log('\n7a. 图标方案（6 套 + 总览 + 一键替换）');
{
  const gen = read('tools/gen_icons.py');
  const ap = read('tools/apply_icon.py');
  ok(/SCHEMES\s*=\s*\[/.test(gen) && (gen.match(/scheme_[a-f]\)/g) || []).length >= 6,
    'gen_icons.py 里 6 套方案');
  ok(/launcher-%d\.png/.test(gen), '生成多尺寸 launcher');
  ok(/icon\.svg/.test(gen), '生成 SVG 源');
  ok(/_总览\.png/.test(gen), '生成总览图');
  ok(/thumb_rgba/.test(gen), '总览图按 alpha 合成（不留黑角）');
  ok(/CURRENT\.txt/.test(ap) && /--restore/.test(ap), 'apply_icon.py 有选号记录与回滚');
  ok(/a != b/.test(ap), '替换后逐字节 hash 校验');
  ok(/backup\(\)/.test(ap) && /_backup/.test(ap), '换图标前先备份');
  ok(!/os\.path\.join\(RES/.test(gen), '生成方案时不碰 android/res');
}

console.log('\n7b. app.css：深色块必须覆盖全部语义变量（漏一个就花脸）');
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
  /* v1.1.50 又加了三个「几何/笔触」令牌：线宽与两组手绘圆角。
   * 它们和 --radius 一样属于尺寸，两种主题共用同一个值是对的 ——
   * 放进白名单，否则会被误判成「深色漏了颜色」。 */
  const SAME_IN_DARK = new Set([
    '--radius', '--radius-sm', '--stroke-w', '--br-hand', '--br-hand-sm',
  ]);
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
  /* v1.1.49：onCreate 里在两行之间插了 warmUpConfig()（抢跑 /v1/config
   * 的握手），原来的「紧挨着」正则就误判了。判据本来也不是「相邻」，
   * 而是「底色先设、页面后加载」—— 改比先后顺序，不要求同行。 */
  {
    const src = main.replace(/\r/g, '');
    const iTheme = src.indexOf('applyAppTheme(themeDarkNow());');
    const iLoad = src.indexOf('web.loadUrl("file:///android_asset/index.html")');
    ok(iTheme >= 0 && iLoad >= 0 && iTheme < iLoad,
      'onCreate 在 loadUrl 之前设首屏底色',
      iTheme < 0 ? '找不到 applyAppTheme 调用' : (iLoad < 0 ? '找不到 loadUrl' : '顺序反了'));
  }
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
