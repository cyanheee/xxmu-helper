/* 河医大助手 · NOVA「万象舱」皮肤开关（v1.1.56 原型落地）
 *
 * 与 theme.js 完全正交：
 *   theme.js 管 data-theme=auto/light/dark，写 xxmu_theme；
 *   本文件管 data-skin=classic/nova，写 xxmu_skin。
 * 两者互不覆盖，任何一边的按钮都不动另一边的属性。
 *
 * 必须在 <head> 里、app.css 之前同步跑一次（和 theme.js 同排），
 * 否则 NOVA 用户冷启动会先闪一帧经典涂鸦纸卡片。
 *
 * 默认经典：没存过 / 存了乱码 / Host 桥读失败 → 一律 classic。
 * 设置页里 #skinInline 由本文件自己挂载（THEME.mount('themeInline') 只管深浅）。
 */
window.SKIN = (function () {
  var KEY = 'xxmu_skin';
  var CLASSIC = 'classic', NOVA = 'nova';
  var LABEL = { classic: '经典', nova: '万象舱' };
  var META = { classic: { light: '#EFE2C8', dark: '#241E1A' },
               nova:    { light: '#E8EEF0', dark: '#121A2E' } };

  function hasHost() { return typeof Host !== 'undefined' && Host; }
  function getPref(k) {
    try { if (hasHost() && Host.getPref) return Host.getPref(k) || ''; } catch (e) {}
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function setPref(k, v) {
    try { if (hasHost() && Host.setPref) { Host.setPref(k, v); return; } } catch (e) {}
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function mode() { var m = getPref(KEY); return m === NOVA ? NOVA : CLASSIC; }

  /** 纯函数：给离线测试直接打，不依赖 DOM。 */
  function resolve(v) { return v === NOVA ? NOVA : CLASSIC; }
  function isNova() { return mode() === NOVA; }

  function syncMeta() {
    try {
      var meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
      if (!meta) return;
      var dark = (typeof THEME !== 'undefined' && THEME.current) ? THEME.current() === 'dark'
        : document.documentElement.getAttribute('data-theme') === 'dark';
      meta.setAttribute('content', META[mode()][dark ? 'dark' : 'light']);
    } catch (e) {}
  }

  function apply() {
    var m = mode();
    try { document.documentElement.setAttribute('data-skin', m); } catch (e) {}
    try { document.documentElement.dataset.skin = m; } catch (e) {}
    syncMeta();
    paint();
    /* 同步通知器官层（2026-11-09 真机 m13042 修复）：
       本函数与 set() 都是 IIFE 内的闭包局部函数，设置页按钮 onclick 直接调它们，
       包装 window.SKIN.apply / window.SKIN.set 都拦不到这条路径 —— 结果只换了
       data-skin、介质 CSS 生效，nova-organs.js 的动态器官却一个都没挂。
       这里挂一个同步钩子，器官层把它指向自己的 mount/unmount，皮肤一变立刻装/拆，
       不等 MutationObserver 的微任务、也不依赖调用方是谁。首屏 IIFE 执行时
       window.SKIN 还没赋值，下面的短路保护会跳过（那时器官层也还没加载）。 */
    try {
      if (window.SKIN && typeof window.SKIN.__novaSync === 'function') window.SKIN.__novaSync();
    } catch (e) {}
    return m;
  }
  function set(m) {
    setPref(KEY, resolve(m) === NOVA ? NOVA : '');
    return apply();
  }

  var GROUPS = [];
  function paint() {
    var now = mode();
    GROUPS.forEach(function (g) {
      g.opts.forEach(function (o) {
        if (o.m === now) o.btn.classList.add('on'); else o.btn.classList.remove('on');
        o.tick.textContent = o.m === now ? '✓' : '';
      });
    });
    try {
      var st = document.getElementById('skinState');
      if (st) st.textContent = LABEL[now] + ' ›';
    } catch (e) {}
  }
  function build() {
    var wrap = document.createElement('div');
    wrap.className = 'skin-wrap';
    var opts = [];
    [CLASSIC, NOVA].forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'skin-opt';
      b.setAttribute('data-skin-mode', m);
      b.appendChild(document.createTextNode(m === NOVA ? '万象舱（全新）' : '经典'));
      var tick = document.createElement('span'); tick.className = 'tick';
      b.appendChild(tick);
      b.onclick = function () {
        set(m);
        if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('外观：' + LABEL[m]);
        if (typeof THEME !== 'undefined' && THEME.apply) THEME.apply();
      };
      opts.push({ m: m, btn: b, tick: tick });
      wrap.appendChild(b);
    });
    return { wrap: wrap, opts: opts };
  }
  function mount(containerId) {
    try {
      var box = document.getElementById(containerId);
      if (!box || box.getAttribute('data-skin-mounted') === '1') return;
      box.setAttribute('data-skin-mounted', '1');
      var built = build();
      box.appendChild(built.wrap);
      var hint = document.createElement('p');
      hint.className = 'hint tight';
      hint.textContent = '万象舱是独立于深浅模式的另一套界面：保留全部功能，换一套全新的操作逻辑。';
      box.appendChild(hint);
      GROUPS.push(built);
      paint();
    } catch (e) {}
  }
  function init() {
    mount('skinInline');
    /* theme.js 改深浅时同步状态栏颜色，但不反过来改 data-theme */
    var prev = window.__onThemeSys;
    window.__onThemeSys = function () { try { if (prev) prev(); } catch (e) {} syncMeta(); };
    apply();
  }

  /* 首屏同步生效：不等 DOMContentLoaded */
  apply();
  try {
    if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', function () { init(); });
    }
  } catch (e) {}

  return { KEY: KEY, LABEL: LABEL, mode: mode, set: set, apply: apply,
           mount: mount, init: init, paint: paint, resolve: resolve, isNova: isNova,
           getPref: getPref, setPref: setPref };
})();
