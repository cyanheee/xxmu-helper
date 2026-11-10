/* 河医大助手 · NOVA「万象舱」反馈层（nova-fx.js）
 *
 * ============================ 这个文件解决什么 ============================
 * 现在的 NOVA 有 11 个器官、一堆风格，但**动作是死的**：点「放水」，按钮亮一下；
 * 切周，皮带滑过去；点重绑，弹个框。这些都只是「状态变化」，不是「一次事件」。
 *
 * 参照 pixelfx（github.com/patch-gg/pixelfx，MIT）里那套被验证过的做法，
 * 把「反馈」当成一次有身体的表演来做。它那边叫 act，这里照抄它的骨架：
 *
 *   wind-up（预备）   →  snap（命中，这一帧要硬、要短）
 *   → follow-through（余势）→  recovery（回落，慢一点收）
 *
 * pixelfx 的 README 原话大意：一个特效自己看着就是张贴纸，真正卖出这一击的是
 * 它周围的身体——预备动作说明要来了、命中定格、被打得后仰、收招。
 * 我们用同样的四拍去包住真实按钮，让「点了一下」变成「发生了一件事」。
 *
 * ============================ 从 pixelfx 拿的四件事 ============================
 * ① 双缓冲里那个 **light 缓冲**：不透明颜色画一层，发光的另画一层，最后叠加。
 *    网页里的等价物 = 独立的一层 `mix-blend-mode:plus-lighter` 光斑。
 *    「热的东西看起来热，是因为有 light 缓冲」，不是因为它更亮。
 * ② **种子化随机**：pixelfx 每个特效第 40 帧每次渲染都一样。我们必须一样——
 *    每次刷新都抖得不一样的噪点是「廉价感」最大的来源。所以本文件里没有
 *    一个 Math.random，全是固定 seed 的 LCG。
 * ③ **12fps 步进**：像素的动是「跳」不是「滑」。所以本文件的像素类动效用
 *    steps 语义（离散帧），不用缓动曲线。
 * ④ **命中定格**：pixelfx 的 `hits:[{t, stop, shake}]`——命中瞬间时间几乎停住。
 *    对应到交互上就是：按下时先压（快），松开时闪一下（最短），然后慢收。
 *
 * ============================ 边界 ============================
 * · 只在 html[data-skin="nova"] 下工作；经典皮肤一行不动（本文件根本不跑）。
 * · **不依赖也不修改任何 CSS 文件**：所有姿态都是 inline style，随用随清。
 *   这样多人同时改 CSS 时不会撞车，也不会因为别人 `!important` 覆盖而失效。
 * · 不绑任何业务逻辑：用事件委托监听真实按钮，**只加视觉，不加行为**。
 *   所以它永远不会让「放水」变成两次，也不会改变 app.js 的任何判断。
 * · prefers-reduced-motion: reduce 时整层不启用（不是降到 1ms，是不做）。
 */
(function () {
  'use strict';

  /* ---------------- 基础判定 ---------------- */

  function on() {
    return document.documentElement.getAttribute('data-skin') === 'nova';
  }
  function calm() {
    /* 用户要求减少动效时，本层完全不工作。判断放在每次调用里，
       因为系统设置可能在 App 运行期间被改。 */
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }
  function live() { return on() && !calm(); }

  /* ---------------- ② 种子化随机（没有 Math.random） ----------------
   * 线性同余，参数取自 Numerical Recipes。同一个 seed 永远给同一串数。
   * 用途：抖动点阵、粒子初速、延迟抖动——全站每次刷新必须一模一样。 */
  function lcg(seed) {
    var s = (seed | 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 8) & 0xffffff) / 0x1000000;   /* [0,1) */
    };
  }

  /* ---------------- ① light 层：独立的一层加色光 ----------------
   * 关键：这是**另一层**，不是把颜色调亮。
   * mix-blend-mode:plus-lighter 是加色混合，两团光叠在一起会真的变白，
   * 这正是 pixelfx 用 light 缓冲得到的效果。 */
  var LAYER = null;
  function layer() {
    if (LAYER && LAYER.parentNode) return LAYER;
    LAYER = document.createElement('div');
    LAYER.id = 'nv-fx-layer';
    LAYER.setAttribute('aria-hidden', 'true');
    /* z-index 55：高于内容与器官（器官 ≤ 10）、高于底栏（20）、高于半框（30），
       低于激活门 #gate（100）与更新弹层 #upd（120）——光斑绝不能盖住必须点的东西。 */
    LAYER.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:55', 'pointer-events:none',
      'mix-blend-mode:plus-lighter', 'contain:strict'
    ].join(';');
    document.body.appendChild(LAYER);
    return LAYER;
  }

  /* ---------------- 光斑：一次性的加色闪烁 ----------------
   * opts: { x, y, r, color, ms, squash }
   * x/y 是视口坐标（clientX/clientY）。没有坐标时按元素中心算。 */
  function glow(x, y, opts) {
    if (!live()) return null;
    opts = opts || {};
    var r = opts.r || 64;
    var ms = opts.ms || 260;
    var color = opts.color || '53,224,208';     /* 默认是主色青绿，RGB 三段 */
    var el = document.createElement('div');
    /* 两层渐变：内芯接近白（加色后会过曝成白点，像真的发光），外圈是主色。
       这就是 pixelfx 里 light 缓冲的「热区」。 */
    el.style.cssText = [
      'position:absolute',
      'left:' + (x - r) + 'px', 'top:' + (y - r) + 'px',
      'width:' + (r * 2) + 'px', 'height:' + (r * 2) + 'px',
      'border-radius:50%',
      'background:radial-gradient(circle,' +
        'rgba(255,255,255,.85) 0%,' +
        'rgba(' + color + ',.62) 26%,' +
        'rgba(' + color + ',.20) 52%,' +
        'rgba(' + color + ',0) 72%)',
      'opacity:0',
      'will-change:opacity,transform'
    ].join(';');
    layer().appendChild(el);

    var track = [
      /* 起手：几乎没有（预备阶段不应该有光） */
      { opacity: 0, transform: 'scale(.55)' },
      /* 命中：亮度冲到顶，尺寸几乎不再涨 —— 光是在「亮起来」不是「长大」 */
      { opacity: 1, transform: 'scale(1)' },
      /* 收招：慢收，透明度掉得比尺寸快，留一点余晖 */
      { opacity: 0, transform: 'scale(1.35)' }
    ];
    var timing = {
      duration: ms,
      easing: 'cubic-bezier(.2,.7,.3,1)',
      fill: 'forwards'
    };
    try {
      var a = el.animate(track, timing);
      a.onfinish = function () { el.remove(); };
      /* 兜底：某些老 WebView 的 onfinish 不触发，超时也要清掉 */
      setTimeout(function () { if (el.parentNode) el.remove(); }, ms + 400);
    } catch (e) {
      /* 连 WAAPI 都没有：直接不留痕，绝不退回「常亮」 */
      el.remove();
    }
    return el;
  }

  /* ---------------- ④ act：四拍表演 ----------------
   * opts: { scale, lift, ms, hitMs, colors }
   * 时间轴（默认总 ~440ms）：
   *   0                      预备开始：压下 + 微微缩（说明「要来了」）
   *   ms*0.28                命中：这一帧必须最短最硬 —— 回弹到放大
   *   ms*0.28 + hitMs        余势：还在放大一点点
   *   ms                     收招：回到 1，慢
   *
   * 为什么不做成一段 ease？因为一段 ease 读起来像「弹了一下」，
   * 四拍读起来像「按下去、咬住了、松手」。后者才是物理。 */
  function act(el, opts) {
    if (!el || !live()) return;
    opts = opts || {};
    var s = opts.scale || 1.035;
    var ms = opts.ms || 440;
    var hitMs = opts.hitMs || 70;
    var lift = opts.lift || 0;

    /* 记住原始 inline，收招后原样还回去（绝不写进 style 属性里留下垃圾） */
    var prevTransform = el.style.transform;
    var prevTransition = el.style.transition;
    var prevFilter = el.style.filter;
    var done = false;
    function restore() {
      if (done) return;
      done = true;
      el.style.transform = prevTransform;
      el.style.transition = prevTransition;
      el.style.filter = prevFilter;
      el.classList.remove('nv-fx-act');
    }
    el.classList.add('nv-fx-act');

    /* 第一拍：预备。快（120ms 内到位），几乎是「立刻压下去」 */
    el.style.transition = 'transform 110ms cubic-bezier(.4,0,1,1), filter 110ms linear';
    el.style.transform = 'translateY(' + lift + 'px) scale(.972)';
    el.style.filter = 'brightness(.96)';

    /* 第二拍：命中。短、硬、略过冲。用 cubic-bezier 的后段过冲做「咬住」 */
    var t1 = Math.round(ms * 0.28);
    setTimeout(function () {
      if (done) return;
      el.style.transition = 'transform ' + hitMs + 'ms cubic-bezier(.2,1.6,.4,1), filter ' + hitMs + 'ms linear';
      el.style.transform = 'translateY(' + (-lift) + 'px) scale(' + s + ')';
      el.style.filter = 'brightness(1.06)';
    }, t1);

    /* 第三拍：余势 + 收招。慢收，回到原位 */
    var t2 = t1 + hitMs;
    setTimeout(function () {
      if (done) return;
      el.style.transition = 'transform ' + (ms - t2) + 'ms cubic-bezier(.4,0,.2,1), filter ' + (ms - t2) + 'ms linear';
      el.style.transform = 'translateY(0) scale(1)';
      el.style.filter = '';
    }, t2);
    setTimeout(restore, ms + 30);
  }

  /* ---------------- 命中组合：act + 光斑 ----------------
   * 「一个动作 = 身体四拍 + 一次光」。这两个必须同时发生，
   * 只做 act 显得干，只做光显得飘。 */
  function hit(el, opts) {
    if (!el || !live()) return;
    opts = opts || {};
    act(el, opts);
    var r = el.getBoundingClientRect();
    glow(r.left + r.width / 2, r.top + r.height / 2, {
      r: opts.glowR || Math.max(44, Math.min(96, r.width * 0.8)),
      color: opts.color,
      ms: opts.glowMs || 300
    });
  }

  /* ---------------- ③ 步进抖动：离散帧，不是滑 ----------------
   * 给一个元素铺 N 帧的离散位移，用来做「像素在跳」的感觉。
   * 只在 pixel 器官相关的元素上用。 */
  function stepShake(el, frames, stepMs, amp) {
    if (!el || !live()) return;
    frames = frames || 4;
    stepMs = stepMs || 60;
    amp = amp || 2;
    var prev = el.style.transform;
    var rnd = lcg(20181108);          /* 固定 seed：每次刷新同一套抖动 */
    var i = 0;
    var timer = setInterval(function () {
      if (i >= frames) {
        clearInterval(timer);
        el.style.transform = prev;
        return;
      }
      /* 只取整像素位移 —— 像素风挪半像素就不是像素风了 */
      var dx = Math.round((rnd() * 2 - 1) * amp);
      var dy = Math.round((rnd() * 2 - 1) * amp);
      el.style.transform = prev + ' translate(' + dx + 'px,' + dy + 'px)';
      i++;
    }, stepMs);
  }

  /* ======================================================================
   * 接线：只监听真实元素，只加视觉
   * ====================================================================== */

  /* 用事件委托，一次挂到 document —— 这样动态生成的按钮（饮水机设备行是
     app.js 现建的）也自动生效，不需要在别人 render 之后再去绑。 */
  function closest(el, sel) {
    while (el && el !== document) {
      if (el.matches && el.matches(sel)) return el;
      el = el.parentNode;
    }
    return null;
  }

  /* 分三档强度，别让所有按钮都一样重 —— 那就是没重点。
   *   normal：普通按钮，act 幅度小一点
   *   strong：真正「做事」的按钮（放水/停止/登录/发送），四拍完整 + 光
   *   quiet ：导航类（切周/切页），只做压一下，不加光（否则每翻一页闪一下会很吵） */
  var STRONG = [
    '#waterSendCode', '#waterLogin', '#waterScan', '#waterPick',
    '.dev-act button', '#waterTarget button', '#setSave',
    '#btnFree', '#refresh'
  ].join(',');

  var QUIET = [
    '#prev', '#next', '#today', '#tabs button', '#sortSeg button',
    '.nv-belt-cap', '.nv-dial-tick'
  ].join(',');

  document.addEventListener('click', function (ev) {
    if (!live()) return;
    var t = ev.target;
    if (!t || t.nodeType !== 1) return;

    /* strong 优先：它是真做事，视觉可以重 */
    var s = closest(t, STRONG);
    if (s) {
      /* 发光颜色跟着语义走：危险/停止用信号色，其余用主色 */
      var danger = /停止|删除|解绑/.test(s.textContent || '');
      hit(s, {
        scale: 1.045, ms: 460, hitMs: 76, lift: 1,
        color: danger ? '255,92,122' : '53,224,208',
        glowR: 72, glowMs: 340
      });
      return;
    }

    var q = closest(t, QUIET);
    if (q) {
      /* 导航不加光，只压一下。这就是「安静到不打扰」的具体执行。 */
      act(q, { scale: 1.012, ms: 300, hitMs: 56, lift: 0 });
      /* 皮带胶囊是像素/机械感的东西，额外给一次离散抖动 */
      if (q.classList && q.classList.contains('nv-belt-cap')) stepShake(q, 3, 55, 1);
    }
  }, true);

  /* 放水是一个「持续状态」，不是一次点击。
     按钮文字从「放水」变成「停止」那一瞬间才是真正的命中选择——
     这时候补一次光，让用户知道「机器收到了」。
     用 MutationObserver 盯 .dev-act 区域的文字变化，不改别人一行。 */
  function watchDevAct() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var t = recs[i].target;
        var btn = closest(t && t.nodeType === 1 ? t : (t && t.parentNode), '.dev-act button');
        if (!btn) continue;
        if (!live()) continue;
        var txt = btn.textContent || '';
        /* 只有变成「停止」或变回「放水」才算状态切换，别被别的重绘带着乱闪 */
        if (!/^(停止|放水)/.test(txt)) continue;
        glow(
          btn.getBoundingClientRect().left + btn.offsetWidth / 2,
          btn.getBoundingClientRect().top + btn.offsetHeight / 2,
          { r: 82, color: /停止/.test(txt) ? '255,92,122' : '53,224,208', ms: 380 }
        );
      }
    });
    var host = document.getElementById('waterDevList') || document.body;
    try { mo.observe(host, { childList: true, subtree: true, characterData: true }); } catch (e) {}
  }

  function boot() {
    if (!on()) return;
    watchDevAct();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 皮肤切换时重新准备（经典档不挂着观察器） */
  try {
    if (window.SKIN && window.SKIN.apply) {
      var prevApply = window.SKIN.apply;
      window.SKIN.apply = function () {
        var r = prevApply.apply(window.SKIN, arguments);
        try { if (on()) watchDevAct(); } catch (e) {}
        return r;
      };
    }
  } catch (e) {}

  window.NOVA_FX = {
    act: act,
    hit: hit,
    glow: glow,
    stepShake: stepShake,
    seed: lcg,
    /* 离线测试与无头截图用：不做动效，直接铺一次光看效果 */
    __glowAt: function (x, y, color) { return glow(x, y, { color: color, ms: 600 }); }
  };
})();
