/* 河医大助手 - 首次使用引导
 *
 * ================== 为什么需要它 ==================
 *
 * v0.9.9 之前，APK 里带着一份写死的课表（开发者自己的）和一个写死的作业快照。
 * 学生一装就能看到「数据」，于是没人会去登录 —— 但那是别人的课表。
 *
 * 现在内置数据清空了，第一次进来必然是空的。空屏幕不会告诉用户下一步做什么，
 * 所以补这一层：激活通过后弹出，两步各一个按钮，登完在页面上打勾。
 *
 * ================== 为什么用「一次」而不是「每次」 ==================
 *
 * 存一个 pref 键记「已经引导过」。之后即使某个平台没登录，
 * 课表页和学习页各自的空态里也有入口，不必每次都弹全屏。
 */

const Onboard = (() => {
  const K = 'xxmu_onboard_done';
  const $ = id => document.getElementById(id);

  function done() {
    try {
      if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(K) === '1';
      return localStorage.getItem(K) === '1';
    } catch (e) { return true; }
  }

  function mark() {
    try {
      if (typeof Host !== 'undefined' && Host.setPref) Host.setPref(K, '1');
      else localStorage.setItem(K, '1');
    } catch (e) {}
  }

  /** 两个平台各自登了没 */
  function state() {
    let kb = false, cx = false;
    try {
      kb = !!(typeof Host !== 'undefined' && Host.cookies && Host.cookies().length > 20);
    } catch (e) {}
    try {
      cx = (typeof CX !== 'undefined') && CX.loggedIn();
    } catch (e) {}
    return { kb: kb, cx: cx };
  }

  function paint() {
    const s = state();
    const kbSt = $('onbKbState');
    if (kbSt) {
      kbSt.textContent = s.kb ? '已登录' : '未登录';
      kbSt.className = s.kb ? 'ok' : '';
    }
    const cxSt = $('onbCxState');
    if (cxSt) {
      cxSt.textContent = s.cx ? '已登录' : '未登录';
      cxSt.className = s.cx ? 'ok' : '';
    }
    const kbB = $('onbKbBtn');
    if (kbB) kbB.textContent = s.kb ? '重新登录' : '去登录';
    const cxB = $('onbCxBtn');
    if (cxB) cxB.textContent = s.cx ? '重新登录' : '去登录';

    /* 两个都登完了，按钮从「开始使用」变成「开始使用（已完成）」
     * 但仍然可点 —— 有人就是想先看看界面。 */
    const d = $('onbDone');
    if (d) d.textContent = (s.kb && s.cx) ? '都登录好了，开始使用' : '先这样，开始使用';
  }

  function show() {
    const el = $('onb');
    if (!el) return;
    paint();
    el.classList.add('on');
  }

  function hide() {
    const el = $('onb');
    if (el) el.classList.remove('on');
    mark();
  }

  /** 激活通过后调用；已引导过就什么都不做 */
  function afterUnlock() {
    if (done()) return;
    /* 延迟一点，让主界面先画出来 —— 引导层是盖在上面的，
     * 底下什么都没有会显得像卡住了 */
    setTimeout(show, 400);
  }

  let inited = false;

  function init() {
    /* 必须幂等：app.js 底部无条件 init 一次，Gate.boot() 走 __onUnlocked
     * 又 init 一次。这里除了绑按钮，还会把 __onLoginSuccess / __onCxLoggedIn
     * 包一层 —— 重复 init 会让回调链越包越长，登录成功一次 paint 好几遍。 */
    if (inited) return;
    inited = true;
    const kb = $('onbKbBtn');
    if (kb) {
      kb.onclick = () => {
        if (!(typeof Host !== 'undefined' && Host.openLogin)) {
          showTip('登录教务需要在 App 内进行。');
          return;
        }
        Host.openLogin();
      };
    }
    const cx = $('onbCxBtn');
    if (cx) cx.onclick = () => { if (typeof CxUI !== 'undefined') CxUI.login(); };
    const d = $('onbDone');
    if (d) d.onclick = hide;

    /* 两个平台登录成功后都要刷新这一步的状态。
     *
     * v1.1.8 血案：这两层包装原来写成 `function () {}` —— 声明时不收参数，
     * 调用 oldKb() 也不传，于是 sync.js 里 `__onLoginSuccess(chk)` 的那个
     * chk 在这里被整个吞掉。上游 app.js 的判断是
     * `if (chk && chk.ok === false) { 弹「学号对不上」并 return; }`，
     * 收不到 chk 就永远不成立，直接往下走到 syncSchedule(true)；
     * 而 syncSchedule 内部在第二次被叫时会 kbMismatchAck = true 然后放行。
     * 结果：第一次登录就自动同步了别人的课表，且「已知情」标记被置死，
     * 之后每次自动同步都畅通无阻 —— 这正是 m00003 那个 bug 的复活。
     * 转发参数本身没有成本，漏了就是把整条拦截链掐断。 */
    const oldKb = window.__onLoginSuccess;
    window.__onLoginSuccess = function (chk) {
      if (typeof oldKb === 'function') { try { oldKb(chk); } catch (e) {} }
      paint();
    };
    const oldCx = window.__onCxLoggedIn;
    window.__onCxLoggedIn = function (r) {
      if (typeof oldCx === 'function') { try { oldCx(r); } catch (e) {} }
      paint();
    };
  }

  return { init, show, hide, afterUnlock, paint, done };
})();
