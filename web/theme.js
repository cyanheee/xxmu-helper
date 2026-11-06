/* 河医大助手 - 主题（v1.1.39）
 *
 * 这个文件在 <head> 里、app.css **之前**加载，所以它必须先干两件事：
 *   ① 在首屏绘制之前把 data-theme 写到 <html> 上（深色用户冷启动不闪白）；
 *   ② 同步把状态栏/导航栏/WebView 底色交给 Java 改掉。
 * 剩下的 UI（「我的 → 外观」半框、跟随系统变化）等 DOM 就绪后由 THEME.init() 接上。
 *
 * 三档：auto（跟随系统，默认）/ light / dark。选择存在 pref 'xxmu_theme'，
 * auto 存空串 —— 没设过、清过数据、pref 读失败都自然回到「跟随系统」。
 *
 * 为什么不用 prefers-color-scheme 判断系统：
 *   targetSdk 33 的 WebView 在关掉 force dark 之后，CSS 里的
 *   prefers-color-scheme 不一定跟着系统夜间模式走。真值来自 Java 的
 *   Configuration.uiMode（Host.isSystemDark），matchMedia 只当浏览器兜底。
 *
 * 为什么必须关掉 WebView 的 force dark：
 *   系统开深色时 WebView 会自动把页面反色，我们自己写的深色 CSS 会被
 *   再倒一次 —— 深底上的浅卡片变黑卡片，比没做主题还难看。
 *   颜色只允许由 app.css 的 html[data-theme] 决定。
 */
window.THEME = (function () {
  var KEY = 'xxmu_theme';
  var AUTO = 'auto', LIGHT = 'light', DARK = 'dark';
  var META_LIGHT = '#ffffff', META_DARK = '#0e1320';
  var LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };

  function hasHost() { return typeof Host !== 'undefined' && Host; }

  function getPref(k) {
    try { if (hasHost() && Host.getPref) return Host.getPref(k) || ''; } catch (e) {}
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function setPref(k, v) {
    try { if (hasHost() && Host.setPref) { Host.setPref(k, v); return; } } catch (e) {}
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  /** 读出来的值必须归一化：手滑存进去的乱码一律当「跟随系统」。 */
  function mode() {
    var m = getPref(KEY);
    return (m === LIGHT || m === DARK) ? m : AUTO;
  }

  function sysDark() {
    try { if (hasHost() && Host.isSystemDark) return !!Host.isSystemDark(); } catch (e) {}
    try {
      return !!(window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  }

  /** 纯函数：三档 × 系统亮/暗 → 实际生效的主题。测试直接打这一条。 */
  function resolve(m, sys) {
    if (m === LIGHT) return LIGHT;
    if (m === DARK) return DARK;
    return sys ? DARK : LIGHT;
  }

  function current() { return resolve(mode(), sysDark()); }

  function paint() {
    try {
      if (!document.getElementById) return;
      var row = document.getElementById('themeState');
      if (row) row.textContent = LABEL[mode()] + ' ›';
    } catch (e) {}
  }

  function apply() {
    var dark = current() === DARK;
    var t = dark ? DARK : LIGHT;
    try { document.documentElement.setAttribute('data-theme', t); } catch (e) {}
    try { document.documentElement.dataset.theme = t; } catch (e) {}
    try {
      var meta = document.querySelector
        ? document.querySelector('meta[name="theme-color"]') : null;
      if (meta) meta.setAttribute('content', dark ? META_DARK : META_LIGHT);
    } catch (e) {}
    /* Java 侧：状态栏图标明暗 / 导航栏 / WebView 底色。
     * 不阻塞（只做 UI 设置），所以可以直接当桥方法调。 */
    try { if (hasHost() && Host.setAppTheme) Host.setAppTheme(dark); } catch (e) {}
    paint();
    return dark;
  }

  function set(m) {
    var v = (m === LIGHT || m === DARK) ? m : AUTO;
    setPref(KEY, v === AUTO ? '' : v);
    return apply();
  }

  /** 「我的 → 外观」半框。复用全局 #sheet / closeSheet()，不新造浮层。 */
  function open() {
    try {
      var body = document.getElementById('sh-body');
      var name = document.getElementById('sh-name');
      var sheet = document.getElementById('sheet');
      if (!body || !sheet) return;
      /* 待办/番茄钟卡还住在半框里就先请回停车场，避免叠着 */
      if (typeof parkTools === 'function') parkTools();
      if (name) name.textContent = '外观';
      body.innerHTML = '';

      var wrap = document.createElement('div');
      wrap.className = 'th-wrap';
      var opts = [];
      [AUTO, LIGHT, DARK].forEach(function (m) {
        var b = document.createElement('button');
        b.className = 'btn ghost th-opt';
        b.setAttribute('data-mode', m);
        var t = document.createElement('span');
        t.textContent = LABEL[m];
        b.appendChild(t);
        var tick = document.createElement('span');
        tick.className = 'th-tick';
        b.appendChild(tick);
        b.onclick = function () {
          set(m);
          repaint();
          if (typeof XXMU !== 'undefined' && XXMU.toast) {
            XXMU.toast('已切换：' + LABEL[m]);
          }
        };
        opts.push({ m: m, btn: b, tick: tick });
        wrap.appendChild(b);
      });
      body.appendChild(wrap);

      var hint = document.createElement('div');
      hint.className = 'hint left th-hint';
      body.appendChild(hint);

      function repaint() {
        var now = mode(), cur = current();
        opts.forEach(function (o) {
          if (o.m === now) o.btn.classList.add('on');
          else o.btn.classList.remove('on');
          o.tick.textContent = o.m === now ? '✓' : '';
        });
        hint.textContent = '当前：' + (cur === DARK ? '深色' : '浅色') +
          '。跟随系统会按手机的夜间模式自动切换，切完不用重启 App。' +
          '课表上的彩色课程块在两种主题里保持一致。';
      }
      repaint();
      sheet.classList.add('on');
    } catch (e) {}
  }

  function init() {
    try {
      var row = document.getElementById('rowTheme');
      if (row) row.onclick = open;
    } catch (e) {}
    /* 系统夜间模式变了（Java 的 onConfigurationChanged 会回调），
     * 以及浏览器自己发的 matchMedia 事件，都只重算一次颜色。 */
    window.__onThemeSys = function () { apply(); };
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.addEventListener) mq.addEventListener('change', function () { apply(); });
      else if (mq && mq.addListener) mq.addListener(function () { apply(); });
    } catch (e) {}
    /* 切后台回来再对一次（有的 ROM 改了系统主题不发回调）。
     * 必须链式保留 elec.js 已挂的 __onResume，不能整个覆盖掉。 */
    var prev = window.__onResume;
    window.__onResume = function () {
      try { if (prev) prev(); } catch (e) {}
      apply();
    };
    apply();
  }

  /* 首屏：立刻生效，不等 DOMContentLoaded，不等 app.js。 */
  apply();
  /* 但 <head> 阶段 #themeState 还没被解析出来，上面那次 paint() 扑了个空。
   * 所以 DOM 就绪后再补画一次入口状态字：即使 body 末尾的 THEME.init()
   * 因别处脚本异常没跑到，「我的 → 外观」那一行也不会停在静态的
   * 「跟随系统」而和用户上次选的「深色」对不上。 */
  try {
    if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', function () { paint(); });
    }
  } catch (e) {}

  return {
    KEY: KEY, LABEL: LABEL,
    mode: mode, set: set, open: open, init: init,
    resolve: resolve, current: current, sysDark: sysDark, apply: apply,
    paint: paint, getPref: getPref, setPref: setPref
  };
})();
