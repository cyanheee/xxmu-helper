/* 河医大助手 - 首次打开的使用声明
 *
 * ================== 它和 tut.js / onboard.js 的分工 ==================
 *
 *   disc.js     = 「用之前你得先知道这些」——一次性、必须看见
 *   tut.js      = 「这东西是干什么的、能干什么」——一次性看一遍的说明书
 *   onboard.js  = 「现在请你登录两个账号」——有状态的待办清单
 *
 * 顺序：声明 → 教程 → 登录引导。
 *
 * ================== 为什么声明排在最前面 ==================
 *
 * 它是唯一一个「用户必须看见才算数」的东西。放在教程后面，用户已经
 * 连点过五页「下一步」，到第六页只会继续连点，等于没看见。
 *
 * 另一个原因：这个 App 会替用户读教务、读学习通、开关水阀。
 * 一旦学校改版导致数据错、或者水阀没关，用户得先知道「以官方为准」。
 * 把这句话放在最前面，不是甩锅，是让人知道自己该核对什么。
 *
 * ================== 技术要点 ==================
 *
 * 1. 纯前端，不联网。飞行模式下也要能关掉它。
 * 2. ✕ 和「我已知晓」等价 —— 关掉也算看过。否则会把人卡在这一层，
 *    而这一层没有任何别的出口（#gate 还没解锁时它就在上面）。
 * 3. pref 读不到时 done() 返回 false（**和 tut/onboard 相反**）。
 *    tut 那边读不到就当看过，因为教程不重要、别拿它拦人；
 *    这里读不到就当没看过，因为声明必须让人看见一次 ——
 *    宁可多弹一次，不能因为 pref 抽风就永久跳过。
 * 4. 「我的 → 使用声明」是重看，看完不该再触发教程。
 */

const Disc = (() => {
  const K = 'xxmu_disc_done';
  const $ = id => document.getElementById(id);

  function done() {
    try {
      if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(K) === '1';
      return localStorage.getItem(K) === '1';
    } catch (e) { return false; }
  }

  function mark() {
    try {
      if (typeof Host !== 'undefined' && Host.setPref) Host.setPref(K, '1');
      else localStorage.setItem(K, '1');
    } catch (e) {}
  }

  /* 「我的 → 使用声明」是重看：看完不再往下转教程/引导。 */
  let replayMode = false;
  /* 防止两条路径同时把它叫起来（首次启动 + Gate.boot 各有一条）。 */
  let shown = false;

  /** 激活门还立着吗？立着说明用户还没填学号，此刻不能往教程转。 */
  function gateLocked() {
    const g = $('gate');
    return !!(g && !g.classList.contains('off'));
  }

  function show() {
    if (shown) return;
    const el = $('disc');
    if (!el) return;
    shown = true;
    el.classList.add('on');
  }

  /** 首次自动弹：这里才清 replayMode（不能放在 show 里，replay 会自己踩掉） */
  function showFirst() {
    replayMode = false;
    show();
  }

  function hide() {
    const el = $('disc');
    if (el) el.classList.remove('on');
    shown = false;
    if (replayMode) { replayMode = false; return; }
    mark();
    /* 两种情况不往下转：
     *   · 重看（replayMode）—— 用户只是回来查一条，别再把教程塞给他；
     *   · 激活门还立着 —— 声明是「用之前先知道」，看完该去填学号了。
     *     教程要等 Gate.boot 解锁之后再放（那条路会重新调 afterUnlock）。 */
    if (gateLocked()) return;
    if (typeof Tut !== 'undefined') setTimeout(() => Tut.afterUnlock(), 260);
    else if (typeof Onboard !== 'undefined') setTimeout(() => Onboard.afterUnlock(), 260);
  }

  /** 解锁之后调用；已看过就直接转教程 */
  function afterUnlock() {
    if (done()) {
      if (typeof Tut !== 'undefined') Tut.afterUnlock();
      else if (typeof Onboard !== 'undefined') Onboard.afterUnlock();
      return;
    }
    setTimeout(showFirst, 320);
  }

  /** 「我的 → 使用声明」重看 */
  function replay() {
    replayMode = true;
    show();
  }

  let inited = false;

  function init() {
    /* 必须幂等：app.js 底部无条件 init 一次，Gate 解锁路径还会再走一次。
     * 这里用 onclick 赋值（重复无害），但守卫还是要加 —— 以后谁改成
     * addEventListener 就会叠成两份，一次点击关两层。 */
    if (inited) return;
    inited = true;
    const ok = $('discOk');
    if (ok) ok.onclick = hide;
    const x = $('discX');
    if (x) x.onclick = hide;

    /* 「我的 → 使用声明」：跳到关于页并把声明那张卡拉进视野。
     * 不另开一个页面 —— 声明只有一份内容，复制两处以后必然改漏一处。 */
    const row = $('rowDisc');
    if (row) row.onclick = () => {
      if (typeof switchTab === 'function') switchTab('about');
      if (typeof About !== 'undefined' && About.refresh) About.refresh();
      const card = $('discCard');
      if (card && card.scrollIntoView) {
        setTimeout(() => {
          try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        }, 60);
      }
    };

    /* 第一次打开就弹 —— 不等解锁。
     *
     * 为什么不等 Gate.boot：声明是「用之前先知道」，激活门后面才轮得到它，
     * 等于让人先把学号交出去再看条款。它压在最上层（z-index 132 > gate 100），
     * 关掉之后底下就是激活门，用户接着填学号，顺序是通的。
     * 延迟 260ms 让首屏先画出来 —— 白屏上直接盖一层会显得像卡死。 */
    if (!done()) setTimeout(showFirst, 260);
  }

  return { init, show, hide, afterUnlock, replay, done };
})();
