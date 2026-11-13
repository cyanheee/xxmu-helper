/* 河医大助手 · NOVA「万象舱」器官层（v1.1.56）
 *
 * ============================ 为什么单独一个文件 ============================
 * nova-skin.css 只是「换皮」：把经典纸卡片重绘成舱体。
 * 但用户要的是「像保留功能、重新开发一款全新软件」，所以还得有**新交互**：
 *   ① 周次传送带   —— 21 周不再靠 ‹ › 两颗按钮，而是一条能拖的机械皮带
 *   ② 磁带门       —— 作业/考试不再是一长条列表，而是一扇能放大穿过的门
 *   ③ 波段拨盘     —— 五个频道不是普通 Tab 高亮，而是一颗滑动指示珠 + 舱格重排
 * 这三个器官的 DOM 由本文件生成，数据全部来自真实界面，绝不编造。
 *
 * 与 skin 轴的关系：本文件只在 html[data-skin="nova"] 下工作；
 * 切回经典时器官整组拆掉，经典界面一行不动。
 *
 * 桥接原则：**不碰 app.js 一行**。所有动作都通过点击真实按钮 / 读真实 DOM 完成，
 * 所以「传送带动了一下」最终落到的是 app.js 自己的 renderWeek()，行为与经典一致。
 *
 *   传送带  → 点胶囊 = 点 #prev/#next（真实切周）
 *   磁带门  → 门内列表 = #hwlist 里已有的真实 .hw 卡片（DOM 搬运，不是重画）
 *   波段拨盘 → 点频道 = 点 #tabs 里的真实 button（真实切页）
 */
(function () {
  'use strict';
  if (!window.SKIN) return;

  var ORGANS = null;      /* 已挂载的器官集合 */
  var WATCH = null;       /* 观察器 */
  var lastWeek = null;
  var lastTab = null;

  function on() { return document.documentElement.getAttribute('data-skin') === 'nova'; }
  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function totalWeeks() {
    var el = $('totalweeks');
    var n = el ? parseInt(el.textContent, 10) : NaN;
    /* 设置页没填时总周数可能是「--」；退回 app.js 的默认 21 周。 */
    return (n >= 10 && n <= 30) ? n : 21;
  }
  function curWeek() {
    var el = $('wkno');
    var n = el ? parseInt(el.textContent, 10) : NaN;
    return (n >= 1 && n <= 99) ? n : 1;
  }
  function toast(msg) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast(msg);
      else if (window.__novaToast) window.__novaToast(msg);
    } catch (e) {}
  }

  /* ======================================================================
   * 「今天下一节课还差多久」—— 全站唯一一个「动起来是因为有信息在变」的东西。
   *
   * 独立批判（SIGNATURE-CRITIC）的判据是「删掉它会丢失信息吗？」：
   * 装饰动效答「不会」→ 删；这一行答「会」→ 留，而且是唯一该留的。
   * 传送带原本只是个「周次选择器」（功能件），加上这一行才变成「时间仪表」。
   *
   * 三条硬约束，全是为了不编数据：
   *   ① 只在「当前显示的就是本周」时才算。判据用真实 DOM：app.js 只在
   *      curWeek === todayW 时才给今天那一列加 .today，翻到别的周就没有这个类。
   *      没有 .today 就算不出「今天」，硬算是假信息。
   *   ② 列号从 .gh.today 的 gridArea 读，不自己拿 Date 推星期——
   *      两套推法一旦不同源，就会在跨零点时打架。
   *   ③ 钟点只认 .gp .gt 渲染出来的校方作息（app.js 的 TIMES[]，来自外部数据）。
   *      读不到就整行不显示，绝不内置一个 08:00 顶上（app.js:36 的注释同理）。
   * ====================================================================== */
  function todayNext() {
    var grid = $('grid');
    if (!grid || !grid.children || !grid.querySelector) return '';
    var head = null;
    try { head = grid.querySelector('.gh.today'); } catch (e) { head = null; }
    if (!head) return '';
    /* .gh 的 gridArea 是「1 / 第几列」，第一列是节次刻度，所以要减 1 才是周几。 */
    var ha = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String((head.style && head.style.gridArea) || ''));
    if (!ha) return '';
    var col = +ha[2];
    if (!(col >= 2)) return '';

    var kids = grid.children, i, k, m;

    /* 节次 → 起始分钟。'上午/下午/晚上' 这类分段标题不是 HH:MM，直接跳过。 */
    var starts = {};
    for (i = 0; i < kids.length; i++) {
      k = kids[i];
      if (!k || !/(^|\s)gp(\s|$)/.test(String(k.className || ''))) continue;
      m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String((k.style && k.style.gridArea) || ''));
      if (!m) continue;
      var gt = k.querySelector ? k.querySelector('.gt') : null;
      var txt = gt ? String(gt.textContent || '').trim() : '';
      var hm = /^(\d{1,2}):(\d{2})$/.exec(txt);
      if (hm) starts[+m[1] - 1] = (+hm[1]) * 60 + (+hm[2]);
    }

    /* 今天这一列的所有课，只按「起始分钟」排序，不猜每节课多长。 */
    var list = [];
    for (i = 0; i < kids.length; i++) {
      k = kids[i];
      if (!k || !/(^|\s)c(\s|$)/.test(String(k.className || ''))) continue;
      m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String((k.style && k.style.gridArea) || ''));
      if (!m || +m[2] !== col) continue;
      var t0 = starts[+m[1] - 1];
      if (t0 == null) continue;
      list.push(t0);
    }
    if (!list.length) return '今日无课';
    list.sort(function (a, b) { return a - b; });

    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var nextAt = -1;
    for (i = 0; i < list.length; i++) {
      if (list[i] > nowMin) { nextAt = list[i]; break; }
    }
    /* 全部已过：不假装「正在上课」（那需要知道每节课多长，这里没有这个数据）。 */
    if (nextAt < 0) return '今日课程已结束';

    var d = nextAt - nowMin;
    var hh = Math.floor(d / 60), mm = d % 60;
    return '距上课 ' + (hh > 0 ? (hh + ':' + (mm < 10 ? '0' : '') + mm) : (mm + ' 分'));
  }

  /* ======================================================================
   * 器官 ①：周次传送带
   * 21 个胶囊排成一条皮带，中间那格放大高亮；能拖、也能点。
   * 拖到第 N 格松手 = 连点 #prev/#next，把真实周次切过去。
   * ====================================================================== */
  function buildBelt() {
    var host = $('tab-kb') || $('top');
    if (!host) return null;
    var wrap = mk('div', 'nv-belt');
    wrap.setAttribute('data-organ', 'belt');

    var head = mk('div', 'nv-belt-head');
    head.appendChild(mk('span', '', 'WEEK CONVEYOR'));
    var count = mk('u', '', '21 WEEKS');
    head.appendChild(count);
    wrap.appendChild(head);

    var rail = mk('div', 'nv-belt-rail');
    var track = mk('div', 'nv-belt-track');
    rail.appendChild(track);
    var needle = mk('i', 'nv-needle');
    rail.appendChild(needle);

    /* 机身两侧的手轮不是装饰，是「转一周」的手柄。
     * 真实切周按钮 #prev / #next 在 NOVA 里被收进机壳（nova-skin.css 的
     * .week-row 收起段），屏幕上周次的说法只剩这一处：这排手轮 + 下方读数。
     * 转轮 = 走一格（按角度累计，44° 一格 = 8 等分齿纹的半个齿距，
     * 不会轻轻一碰就翻周）；点一下 = 走一格，和经典版点 ‹ › 完全一致。
     * 皮带本身还能拖（多周快进），三种手感同一个结果，都落回真实按钮。 */
    var body = mk('div', 'nv-belt-body');
    body.appendChild(crank('l', -1, '上一周'));
    body.appendChild(rail);
    body.appendChild(crank('r', 1, '下一周'));
    wrap.appendChild(body);

    var foot = mk('div', 'nv-belt-foot');
    foot.appendChild(mk('span', '', '拖皮带 / 转手轮'));
    var name = mk('span', 'nv-belt-name', '');
    foot.appendChild(name);
    wrap.appendChild(foot);

    /* 唯一「因为有信息在变才动」的一行。min-height 先占好，
       免得从「今日无课」变到「距上课 01:20」时整条传送带往上跳一下。 */
    var next = mk('div', 'nv-belt-next', '');
    next.setAttribute('aria-live', 'polite');
    wrap.appendChild(next);

    /* 真实周次胶囊：点一下就切到那一周 */
    var total = totalWeeks();
    for (var w = 1; w <= total; w++) {
      (function (wk) {
        var b = mk('button', 'nv-wk', (wk < 10 ? '0' : '') + wk);
        b.type = 'button';
        b.setAttribute('data-w', String(wk));
        b.onclick = function () { goWeek(wk); };
        track.appendChild(b);
      })(w);
    }

    /* 手轮：转一格 = 切一周。累积角度而不是「转一次算一次」，
       所以慢慢转能一格一格走，快速甩会连走几格（和真手轮一致）。
       44° = 8 等分齿纹的半个齿距；松手时把余下的角度弹回 0（棘轮回位）。 */
    function crank(side, dir, title) {
      var b = mk('button', 'nv-crank ' + side);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.appendChild(mk('i', 'nv-crank-wheel'));
      var turned = 0, dragging = false, lastA = 0;
      function angleOf(e) {
        var r = b.getBoundingClientRect();
        if (!r.width) return 0;
        return Math.atan2(e.clientY - (r.top + r.height / 2),
                          e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
      }
      /* v1.1.61 流畅度：手轮 pointermove 也是逐事件写 --rot，
         合成到每帧一次，最后一次角度为准（棘轮回位 spin(0) 同理）。 */
      var rotWant = 0, rotRaf = 0;
      function spin(deg) {
        rotWant = deg;
        if (rotRaf) return;
        var flush = function () {
          rotRaf = 0;
          b.style.setProperty('--rot', rotWant + 'deg');
        };
        if (window.requestAnimationFrame) rotRaf = requestAnimationFrame(flush);
        else flush();
      }
      b.addEventListener('pointerdown', function (e) {
        dragging = true; lastA = angleOf(e);
        b.classList.add('on');
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      b.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var a = angleOf(e);
        var d = a - lastA;
        /* 跨 ±180° 时补正，否则会突然跳一整圈 */
        if (d > 180) d -= 360; else if (d < -180) d += 360;
        lastA = a;
        turned += d;
        spin(turned);
        while (Math.abs(turned) >= 44) {
          var step = turned > 0 ? 1 : -1;
          /* 顺时针（角度增大）在右手轮上是下一周，左手轮相反 */
          goWeek(curWeek() + step * dir);
          turned -= step * 44;
          spin(0);
        }
      });
      function end() {
        if (!dragging) return;
        dragging = false;
        b.classList.remove('on');
        turned = 0;
        spin(0);
      }
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      /* 点一下（没拖动）：走一格。和经典版点一下 ‹ › 同一个结果。 */
      b.addEventListener('click', function (e) {
        e.preventDefault();
        goWeek(curWeek() + dir);
      });
      return b;
    }

    /* 拖动：pointer 事件，WebView 里 touch 也能走 pointer */
    var dragging = false, startX = 0, startOffset = 0, moved = false;
    /* v1.1.61 流畅度：pointermove 一秒能来 60~120 次，逐事件写 --shift
       会让合成层每事件重算一次。合成到每帧一次（rAF 合并），最后一次为准；
       snap() / goWeek() 也走这里，吸附与连点同样只写一次。 */
    var shiftWant = 0, shiftRaf = 0;
    function offsetOf() {
      /* 有一帧还没 flush 时读内存里的目标值，别读到上一帧的旧位移 */
      if (shiftRaf) return shiftWant;
      return parseFloat(track.style.getPropertyValue('--shift')) || 0;
    }
    function setOffset(v) {
      shiftWant = v;
      if (shiftRaf) return;
      var flush = function () {
        shiftRaf = 0;
        track.style.setProperty('--shift', shiftWant + 'px');
      };
      if (window.requestAnimationFrame) shiftRaf = requestAnimationFrame(flush);
      else flush();
    }
    function onDown(e) {
      dragging = true; moved = false;
      startX = e.clientX;
      startOffset = offsetOf();
      wrap.classList.add('dragging');
      try { rail.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      setOffset(startOffset + dx);
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove('dragging');
      var dx = e.clientX - startX;
      /* 拖过 1 格 = 切 1 周；不足一格就弹回 */
      var steps = Math.round(dx / 46);
      if (steps === 0) {
        snap();
      } else {
        goWeek(curWeek() + steps);
      }
    }
    rail.addEventListener('pointerdown', onDown);
    rail.addEventListener('pointermove', onMove);
    rail.addEventListener('pointerup', onUp);
    rail.addEventListener('pointercancel', onUp);
    rail.addEventListener('click', function (e) {
      /* 拖过之后不要再触发点击切周（否则会连跳两周） */
      if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); }
    });

    function snap() {
      var idx = curWeek() - 1;
      var target = track.children[idx];
      if (!target) return;
      /* 布局还没稳（宽度 0）时算出来的中心是假的，跳过这轮。 */
      if (!target.getBoundingClientRect || !rail.getBoundingClientRect) return;
      var rr = rail.getBoundingClientRect();
      if (!rr.width) return;
      var tr = target.getBoundingClientRect();
      if (!tr.width) return;
      /* 必须算「绝对目标偏移」而不是「在当前偏移上再加 delta」：
         getBoundingClientRect 拿到的已经是变换后的屏幕坐标，
         拿它去补当前 shift 等于每帧累加一次，皮带会一路滑出屏幕。
         正确做法：量出目标胶囊相对轨道左端的未变换位置，再居中。 */
      var trackBox = track.getBoundingClientRect();
      var targetLeft = tr.left - trackBox.left;
      var desired = -(targetLeft + tr.width / 2 - rr.width / 2);
      setOffset(desired);
    }
    function goWeek(w) {
      var total = totalWeeks();
      w = Math.max(1, Math.min(total, w));
      var cur = curWeek();
      if (w === cur) { snap(); return; }
      /* v1.1.61 流畅度：连点 N 次 = app.js renderWeek() 全量重建 N 次。
         这段同步窗口里给 <html> 挂 .nv-fastweek，nova-polish.css 会把
         #grid 内所有 transition/animation 关掉，避免每次重建都重跑一遍
         合成层；窗口结束下一帧撤掉，正常交互的过渡照旧。 */
      var root = document.documentElement;
      var endFast = function () { root.classList.remove('nv-fastweek'); };
      root.classList.add('nv-fastweek');
      try {
        /* 通过真实按钮切周：不碰 app.js 的 curWeek 变量，
           只点用户本来就会点的 ‹ ›，行为和经典模式完全一致。 */
        var fwd = $('next'), back = $('prev');
        var i;
        if (w > cur) { for (i = cur; i < w; i++) if (fwd) fwd.click(); }
        else { for (i = cur; i > w; i--) if (back) back.click(); }
      } finally {
        /* 连点结束后立刻把皮带滑到新周（setOffset 已 rAF 合并，一帧只写一次），
           nova-polish.css B1 的 240ms transform 过渡会把这一下变成平滑吸附。 */
        snap();
        if (window.requestAnimationFrame) requestAnimationFrame(endFast);
        else endFast();
      }
      toast('第 ' + w + ' 周');
    }
    function sync() {
      var total = totalWeeks();
      count.textContent = total + ' WEEKS';
      var cur = curWeek();
      var kids = track.children;
      for (var i = 0; i < kids.length; i++) {
        kids[i].classList.toggle('on', (+kids[i].getAttribute('data-w')) === cur);
      }
      var wk = $('wkdate');
      name.textContent = '第 ' + cur + ' 周 · ' + (wk ? wk.textContent : '');
      if (lastWeek !== cur) { lastWeek = cur; }
      /* 传送带是课表页的周次选择器：离开课表页就收起，
         和经典版 .week-row 只在 kb 页显示的行为一致。 */
      var onKb = false;
      var top = $('top');
      if (top && top.getAttribute('data-page') === 'kb') onKb = true;
      var active = document.querySelector('#tabs button.active');
      if (active && active.getAttribute('data-tab') === 'kb') onKb = true;
      wrap.classList.toggle('off', !onKb);
      syncNext();
      snap();
    }

    /* 这一行的存在理由见 todayNext() 的注释：全站唯一「动是因为信息在变」。
       文案为空时（没数据、或翻到了别的周）整行隐藏，不留空白。 */
    function syncNext() {
      var txt = todayNext();
      if (next.textContent !== txt) next.textContent = txt;
      next.classList.toggle('off', !txt);
    }

    host.insertBefore(wrap, host.firstChild);
    /* 首帧布局还没稳，等一帧再对一次位置（否则皮带滑到错的地方） */
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { snap(); });
    } else {
      setTimeout(function () { snap(); }, 50);
    }
    return { el: wrap, sync: sync, goWeek: goWeek };
  }

  /* ======================================================================
   * 器官 ②：磁带门（作业 / 考试）
   * 门是「门」：点一下从触点放大铺满；门里放的是真实 .hw 卡片（DOM 搬运）。
   * ====================================================================== */
  function buildTape() {
    var host = $('tab-learn');
    if (!host) return null;
    var wrap = mk('div', 'nv-tape');
    wrap.setAttribute('data-organ', 'tape');

    var shell = mk('button', 'nv-tape-shell');
    shell.type = 'button';
    var top = mk('span', 'nv-tape-top');
    var sideTag = mk('em', '', 'SIDE A');
    top.appendChild(sideTag);
    top.appendChild(mk('u', '', 'XXMU · MIXTAPE 01'));
    shell.appendChild(top);
    var win = mk('span', 'nv-tape-win');
    var reel1 = mk('i', 'nv-reel');
    var reel2 = mk('i', 'nv-reel');
    var label = mk('span', 'nv-tape-label', '作业 / 考试');
    var sub = mk('span', 'nv-tape-sub', '');
    label.appendChild(sub);
    win.appendChild(reel1); win.appendChild(label); win.appendChild(reel2);
    shell.appendChild(win);
    var bot = mk('span', 'nv-tape-bot');
    bot.appendChild(mk('em', '', '▶ PLAY'));
    bot.appendChild(mk('u', '', '点击放大 · 时空穿越'));
    bot.appendChild(mk('em', '', '⏸ B 面'));
    shell.appendChild(bot);
    wrap.appendChild(shell);

    /* 门内世界：真实卡片的搬运区 */
    var world = mk('div', 'nv-tape-world');
    world.setAttribute('data-organ', 'tape-world');
    var wcard = mk('div', 'nv-tape-card');
    var close = mk('button', 'nv-tape-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    wcard.appendChild(close);
    var kicker = mk('div', 'nv-tape-kicker', 'MIXTAPE 01 · XXMU');
    wcard.appendChild(kicker);
    var sides = mk('div', 'nv-tape-sides');
    var bA = mk('button', 'on', 'A 面 · 作业');
    var bB = mk('button', '', 'B 面 · 考试');
    bA.type = 'button'; bB.type = 'button';
    sides.appendChild(bA); sides.appendChild(bB);
    wcard.appendChild(sides);
    var list = mk('div', 'nv-tape-list');
    wcard.appendChild(list);
    var foot = mk('div', 'nv-tape-foot', '截止时间与完成情况 · 只读展示');
    wcard.appendChild(foot);
    world.appendChild(wcard);
    wrap.appendChild(world);

    var state = { side: 'a' };

    /* 磁带的手感（2026-11-08，用户 m12051）
     *
     * 一台磁带随身听只有三个动作：走带、翻面、按播放。
     * 原来这颗壳只有 onclick —— 那就是「换了张皮的按钮」。
     * 现在的分工：
     *   · 按住左右拖  → 走带：两个卷轴按位移同步转（--spin），磁带真的在走；
     *   · 拖过 46px 松手 → 翻面：A 面 ↔ B 面（像把磁带翻过来），卷轴朝反方向转回去；
     *   · 轻点不动     → 播放：放大铺满（原来的 open()）。
     * 46px 是「一格」的物理量，取自壳宽 1/8 左右 —— 比误触阈值大，
     * 又不需要甩很远，和真磁带走一段带子的手程接近。
     * 全程不拦 scroll：只在水平位移明显大于垂直位移时才接管（touch-action:pan-y 由 CSS 定）。
     */
    var TURN_PX = 46;
    var tx = 0, sx = 0, sy = 0, holding = false, travelled = 0;

    function spin(deg) {
      shell.style.setProperty('--spin', deg + 'deg');
    }
    function flipTo(side) {
      if (state.side === side) return;
      state.side = side;
      sideTag.textContent = side === 'a' ? 'SIDE A' : 'SIDE B';
      bA.classList.toggle('on', side === 'a');
      bB.classList.toggle('on', side === 'b');
      render();
      wrap.classList.add('flipping');
      setTimeout(function () { wrap.classList.remove('flipping'); }, 460);
    }

    shell.addEventListener('pointerdown', function (e) {
      holding = true;
      sx = e.clientX; sy = e.clientY;
      tx = 0; travelled = 0;
      shell.classList.add('turning');
      try { shell.setPointerCapture(e.pointerId); } catch (err) {}
    });
    shell.addEventListener('pointermove', function (e) {
      if (!holding) return;
      var dx = e.clientX - sx;
      var dy = e.clientY - sy;
      /* 竖向为主就放手，让页面正常滚动 */
      if (!travelled && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        holding = false; shell.classList.remove('turning'); spin(0);
        return;
      }
      if (Math.abs(dx) > 6) travelled = 1;
      /* 位移 → 角度：一格 46px 对应 180°，走过一整圈就是拖满了 */
      tx = dx;
      spin(dx / TURN_PX * 180);
      if (travelled) e.preventDefault();
    });
    function letGo(e) {
      if (!holding) return;
      holding = false;
      shell.classList.remove('turning');
      if (travelled && Math.abs(tx) >= TURN_PX) {
        /* 翻面：走过的角度收回去，卷轴倒转一小段 —— 磁带离手后自己回位 */
        flipTo(state.side === 'a' ? 'b' : 'a');
        spin(0);
        travelled = 0;
        return;
      }
      spin(0);
      if (!travelled) {
        /* 轻点 = 播放：放大铺满 */
        open(e.clientX, e.clientY);
      }
      travelled = 0;
    }
    shell.addEventListener('pointerup', letGo);
    shell.addEventListener('pointercancel', function () {
      holding = false; travelled = 0;
      shell.classList.remove('turning');
      spin(0);
    });

    function collect() {
      /* 用户 m13555：「学习里这个待办作业考试 a 面 b 面也不显示未完成任务」。
         根因：旧版把 #hwlist 里真实的 .hw **搬进**抽屉（appendChild 会移动
         原节点），第一次打开就把原列表掏空，之后再 collect 永远拿到空数组。
         现在只读 + 复制：原列表一根毛都不动，抽屉里是它的镜像。
         分面也不再扫全文找「考试」二字（作业正文里带这两个字就会分错面），
         改认 app.js cardOf() 生成的两个真实标记：标题前缀 '📝 '、
         课程前缀 '考试 · '；两者都没有才退回全文匹配兜底。 */
      var src = $('hwlist');
      var out = [];
      if (!src) return out;
      var cards = src.querySelectorAll('.hw');
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var t = c.querySelector('.hwtop b');
        var crs = c.querySelector('.hwcourse');
        var tt = t ? (t.textContent || '') : '';
        var ct = crs ? (crs.textContent || '') : '';
        var marked = tt.indexOf('📝 ') === 0 || ct.indexOf('考试 · ') === 0;
        var isExam = marked || /考试/.test(c.textContent || '');
        var copy = (typeof c.cloneNode === 'function') ? c.cloneNode(true) : c;
        /* 复制品纯展示：摘掉点击，免得点抽屉里的卡又去开一遍半框；
           原卡还在 #hwlist 里，那边的点击照旧有效。 */
        copy.onclick = null;
        out.push({ el: copy, exam: isExam });
      }
      return out;
    }
    function render() {
      list.innerHTML = '';
      var all = collect();
      var rows = [], i;
      for (i = 0; i < all.length; i++) {
        if (state.side === 'b' ? all[i].exam : !all[i].exam) rows.push(all[i]);
      }
      if (!rows.length) {
        /* 空态也要说实话：这里只放 #hwlist 已经读到的条目，不编数据、也不
           造一个假的刷新入口。真没同步过来时，学习页自己有更准的提示。 */
        var isB = state.side === 'b';
        var empty = mk('div', 'nv-tape-empty');
        empty.appendChild(mk('b', '', isB ? 'B 面暂时是空的' : 'A 面暂时是空的'));
        empty.appendChild(mk('u', '',
          '这里只放学习通已经读到的条目；没有内容时请回学习页刷新或先登录学习通。'));
        list.appendChild(empty);
        return;
      }
      for (i = 0; i < rows.length; i++) {
        list.appendChild(rows[i].el);
      }
    }
    function syncLabel() {
      var cnt = $('hwcount');
      var t = cnt ? cnt.textContent : '';
      sub.textContent = t || '点开放大';
    }
    function open(x, y) {
      /* 触点只决定「从哪儿冒出来」，终点必须居中：
         用 --dx/--dy（触点到视口中心的差）做 translate 起点，
         收敛到 0 就是居中；transform-origin 固定 center，
         不用 origin=触点（那样终态也会偏在触点那边）。 */
      var cx = (x == null) ? window.innerWidth / 2 : x;
      var cy = (y == null) ? window.innerHeight / 2 : y;
      wcard.style.setProperty('--dx', (cx - window.innerWidth / 2) + 'px');
      wcard.style.setProperty('--dy', (cy - window.innerHeight / 2) + 'px');
      state.side = 'a';
      sideTag.textContent = 'SIDE A';
      bA.classList.add('on'); bB.classList.remove('on');
      render();
      wrap.classList.add('open');
    }
    function closeWorld() { wrap.classList.remove('open'); }
    /* shell 的三种动作已经在上面绑在 pointer 事件上（走带/翻面/播放），
       这里不再另绑 onclick —— 两套事件会在同一次轻点上各触发一遍。 */
    close.onclick = closeWorld;
    world.addEventListener('click', function (e) {
      if (e.target === world) closeWorld();
    });
    /* 门里的 A/B 两个精确按钮仍保留：翻面手势负责「手感」，
       按钮负责「一次到位」与无障碍。两边都走同一个 flipTo，不会状态打架。 */
    bA.onclick = function () { flipTo('a'); };
    bB.onclick = function () { flipTo('b'); };

    /* 插在学习页标题行之后：插在前面会把 learn-head 的标题挤掉 */
    var anchor = host.querySelector('.learn-head');
    if (anchor && anchor.nextSibling) {
      host.insertBefore(wrap, anchor.nextSibling);
    } else {
      host.insertBefore(wrap, host.firstChild);
    }
    return { el: wrap, sync: function () { syncLabel(); }, open: open, close: closeWorld };
  }

  /* ======================================================================
   * 器官 ③：波段拨盘
   * 一颗指示珠在五个频道之间滑；点频道 = 点真实 Tab 按钮。
   * 切页后主区做一次 stagger 重排（不是普通高亮）。
   * ====================================================================== */
  function buildDial() {
    var tabs = $('tabs');
    if (!tabs) return null;
    var wrap = mk('div', 'nv-dial');
    wrap.setAttribute('data-organ', 'dial');
    var scale = mk('i', 'nv-dial-scale');
    wrap.appendChild(scale);
    var bead = mk('i', 'nv-dial-bead');
    wrap.appendChild(bead);
    var read = mk('div', 'nv-dial-read');
    var chTxt = mk('span', '', 'CH 01 · TIMETABLE');
    read.appendChild(chTxt);
    read.appendChild(mk('u', '', 'XXMU / NOVA'));
    wrap.appendChild(read);

    var CH = {
      kb: ['CH 01 · TIMETABLE', '课表'],
      learn: ['CH 02 · STUDY', '学习'],
      wiki: ['CH 03 · ARCHIVE', 'WIKI'],
      campus: ['CH 04 · CAMPUS', '校园事务'],
      me: ['CH 05 · DEVICE', '我的']
    };
    var ORDER = ['kb', 'learn', 'wiki', 'campus', 'me'];

    function sync() {
      var active = tabs.querySelector('button.active');
      var key = active ? active.getAttribute('data-tab') : 'kb';
      var idx = ORDER.indexOf(key);
      if (idx < 0) idx = 0;
      /* 手指正捏着旋钮时，别让 700ms 的轮询把指示珠抢回旧档 —— 那会一卡一卡 */
      if (!dragging) {
        bead.style.setProperty('--x', ((idx + 0.5) / ORDER.length * 100) + '%');
        chTxt.textContent = CH[key] ? CH[key][0] : 'CH 01 · TIMETABLE';
      }
      if (lastTab !== key) {
        lastTab = key;
        /* 换台时整舱错峰点亮：谁都不抢 */
        var pods = document.querySelectorAll('#app main .tab.active .card, #app main .tab.active .grid');
        for (var i = 0; i < pods.length; i++) {
          (function (el, n) {
            el.classList.remove('nv-in');
            void el.offsetWidth;
            el.style.animationDelay = Math.min(n, 6) * 34 + 'ms';
            el.classList.add('nv-in');
          })(pods[i], i);
        }
      }
    }
    function jumpTo(key) {
      var btn = tabs.querySelector('button[data-tab="' + key + '"]');
      if (btn) btn.click();
    }

    tabs.insertBefore(wrap, tabs.firstChild);

    /* 拨盘要能「转」，不是只能「点」（2026-11-08，用户 m12051：
     * 「每一个元素所代替的ui都要有合理的，符合风格的设计交互方式」）。
     *
     * 一台真的波段拨盘只有两个动作：手指压住旋钮转、转到目标台松手。
     * 所以这里做成：
     *   · pointerdown 记下触点与起始频道，压住即算「捏住旋钮」；
     *   · pointermove 让指示珠按位移连续滑动（每 ORDER.length 分之一屏宽 = 一个频道），
     *     读数跟着变，但不真的切页 —— 转到位再切，中间不会有五连跳；
     *   · pointerup 吸附到最近的频道并 jumpTo（点真实 data-tab 按钮）；
     *   · 松手前位移不足 8px 判为点击，落到触点对应的那档（保留原来的点选）。
     *
     * 用 --x 传百分比、--drag 做「拖动中」的降级态（吸附动画只在松手后跑），
     * 这样拖动时不黏手，松手时才弹到位。
     */
    var dragging = false, startX = 0, startP = 0, lastP = -1, moved = false;

    function posOf(clientX) {
      var r = scale.getBoundingClientRect();
      if (!r.width) return 0;
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    }
    function chanAt(p) {
      return Math.max(0, Math.min(ORDER.length - 1, Math.floor(p * ORDER.length)));
    }
    /* v1.1.61 流畅度：pointermove 逐事件写 --x（布局属性 left 的驱动值）
       与读数 textContent 会各触发一次重排。--x 合成到每帧一次；读数只在
       真正换档（idx 变化）时才写，同一档内手指再怎么抖都不碰 DOM 文本。 */
    var xWant = 0, xRaf = 0, lastChan = -1;
    function paint(p, animate) {
      xWant = (p * 100) + '%';
      if (!xRaf) {
        var flush = function () {
          xRaf = 0;
          bead.style.setProperty('--x', xWant);
        };
        if (window.requestAnimationFrame) xRaf = requestAnimationFrame(flush);
        else flush();
      }
      var idx = chanAt(p);
      if (idx !== lastChan) {
        lastChan = idx;
        var key = ORDER[idx];
        chTxt.textContent = CH[key] ? CH[key][0] : 'CH 01 · TIMETABLE';
      }
      wrap.classList.toggle('turning', !!animate);
    }

    scale.addEventListener('pointerdown', function (e) {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startP = posOf(e.clientX);
      lastP = startP;
      wrap.classList.add('grab');
      try { scale.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    scale.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (Math.abs(e.clientX - startX) > 8) moved = true;
      /* 连续跟手：不做按档跳变，转多少走多少 */
      var p = posOf(e.clientX);
      lastP = p;
      paint(p, true);
    });

    function release(commit) {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove('grab');
      var p = (lastP < 0) ? startP : lastP;
      var idx = chanAt(p);
      /* 吸附到该档的中心，让指示珠落在刻度正中而不是边缘 */
      paint((idx + 0.5) / ORDER.length, true);
      if (commit) jumpTo(ORDER[idx]);
      setTimeout(function () { wrap.classList.remove('turning'); }, 220);
    }

    scale.addEventListener('pointerup', function (e) {
      /* 没拖动 = 点击：按落点那档走（和原来的点选一致） */
      if (!moved) lastP = posOf(e.clientX);
      release(true);
    });
    scale.addEventListener('pointercancel', function () { release(false); });

    /* 键盘与无障碍：旋钮是一个真的可聚焦控件，左右键换台 */
    scale.setAttribute('tabindex', '0');
    scale.setAttribute('role', 'slider');
    scale.setAttribute('aria-label', '频道拨盘');
    scale.addEventListener('keydown', function (e) {
      var active = tabs.querySelector('button.active');
      var cur = ORDER.indexOf(active ? active.getAttribute('data-tab') : 'kb');
      if (cur < 0) cur = 0;
      if (e.key === 'ArrowRight') { jumpTo(ORDER[Math.min(ORDER.length - 1, cur + 1)]); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { jumpTo(ORDER[Math.max(0, cur - 1)]); e.preventDefault(); }
    });

    return { el: wrap, sync: sync, jumpTo: jumpTo };
  }

  /* ======================================================================
   * 器官 ④：剪报抽屉（WIKI 页）
   * 分类做成能横向滑的剪报标签条，条目做成撕角卡，
   * 点条目不是弹普通半框，而是把内容抽进一卷「剪报抽屉」里展开。
   * 数据全部来自真实 .wiki-cat / .wiki-card，不自己造条目。
   * ====================================================================== */
  function buildClipping() {
    var host = $('tab-wiki');
    if (!host) return null;
    var wrap = mk('div', 'nv-clip');
    wrap.setAttribute('data-organ', 'clipping');

    var bar = mk('div', 'nv-clip-bar');
    var tag = mk('span', 'nv-clip-tag', 'CAMPUS WIKI');
    bar.appendChild(tag);
    var strip = mk('div', 'nv-clip-strip');
    bar.appendChild(strip);
    wrap.appendChild(bar);

    /* 抽屉世界：把真实条目内容搬进来 */
    var world = mk('div', 'nv-clip-world');
    world.setAttribute('data-organ', 'clipping-world');
    var card = mk('div', 'nv-clip-card');
    var close = mk('button', 'nv-clip-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    card.appendChild(close);
    var kicker = mk('div', 'nv-clip-kicker', 'CAMPUS WIKI');
    card.appendChild(kicker);
    var title = mk('div', 'nv-clip-title', '');
    card.appendChild(title);
    var body = mk('div', 'nv-clip-body');
    card.appendChild(body);
    world.appendChild(card);
    wrap.appendChild(world);

    var cats = [];

    function collectCats() {
      var out = [];
      var nodes = host.querySelectorAll('.wiki-cat');
      for (var i = 0; i < nodes.length; i++) {
        var t = (nodes[i].textContent || '').trim();
        if (t && out.indexOf(t) < 0 && t.indexOf('搜索') < 0) out.push(t);
      }
      return out;
    }
    function collectCards(cat) {
      var out = [];
      var grids = host.querySelectorAll('.wiki-grid');
      for (var g = 0; g < grids.length; g++) {
        var prev = grids[g].__nvCat;
        if (!prev) {
          /* 分类标题是 grid 的前一个兄弟节点 */
          var p = grids[g].previousElementSibling;
          prev = p ? (p.textContent || '').trim() : '';
          grids[g].__nvCat = prev;
        }
        if (cat && prev !== cat) continue;
        var cards = grids[g].querySelectorAll('.wiki-card');
        for (var i = 0; i < cards.length; i++) out.push(cards[i]);
      }
      return out;
    }
    function syncStrip() {
      var now = collectCats();
      if (now.join('|') === cats.join('|')) return;
      cats = now;
      strip.innerHTML = '';
      for (var i = 0; i < cats.length; i++) {
        (function (c) {
          var b = mk('button', 'nv-clip-chip', c);
          b.type = 'button';
          b.onclick = function () { scrollToCat(c); };
          strip.appendChild(b);
        })(cats[i]);
      }
    }
    function scrollToCat(cat) {
      var grids = host.querySelectorAll('.wiki-grid');
      for (var g = 0; g < grids.length; g++) {
        var p = grids[g].previousElementSibling;
        var prev = p ? (p.textContent || '').trim() : '';
        if (prev === cat) {
          grids[g].scrollIntoView({ behavior: 'smooth', block: 'start' });
          /* 给个短暂高亮，像翻到了那一版 */
          grids[g].classList.add('nv-flash');
          setTimeout(function () { grids[g].classList.remove('nv-flash'); }, 700);
          return;
        }
      }
    }
    var clipIdx = 0;
    function showCardAt(i) {
      var all = host.querySelectorAll('.wiki-card');
      if (!all.length) return;
      clipIdx = (i + all.length) % all.length;
      openCard(all[clipIdx]);
      card.classList.add('pull-in');
      setTimeout(function () { card.classList.remove('pull-in'); }, 300);
    }
    function openCard(src) {
      /* 用户 m13555：「wiki 里点开没有内容，展开全文也没用」。
         两条根因：
          ① 旧版只从 .wiki-t 取标题，再把整张卡 clone 后 display:none 塞进来
             —— 抽屉里除了标题一片空白。wiki.js 的 card(x) 本来就只渲染标题，
             正文 x.b / 来源 x.src / 官方链接 x.u 压根不在卡片 DOM 里。
             现在 wiki.js 把整条 x 挂到 b.__wiki，这里读它原样渲染。
          ② 旧版「展开原文」调 src.onclick，但 sync() 已把 onclick 重写成
             openCard 自己 → 点它只会又开一次抽屉，永远到不了 wiki.js 的
             open(id)（那个才填 #sh-body）。现在 sync() 把原函数存进
             __nvOrig，这里调它，半框详情照旧可用。 */
      var all = host.querySelectorAll('.wiki-card');
      for (var q = 0; q < all.length; q++) { if (all[q] === src) { clipIdx = q; break; } }
      var x = src.__wiki || null;
      var t = src.querySelector('.wiki-t');
      title.textContent = (x && x.t) || (t ? t.textContent : '') || '校园 WIKI';
      body.innerHTML = '';

      if (x && x.cat) body.appendChild(mk('div', 'wiki-cat2', x.cat));
      var ps = (x && x.b) ? x.b : [];
      for (var i = 0; i < ps.length; i++) {
        body.appendChild(mk('p', 'wiki-p', ps[i]));
      }
      if (!ps.length) {
        body.appendChild(mk('p', 'wiki-p', '这条资料没有更多正文，点下面的按钮看完整条目。'));
      }
      if (x && x.u) {
        var go = mk('button', 'btn soft', '打开官方页面');
        go.type = 'button';
        go.onclick = function () {
          try {
            if (typeof Host !== 'undefined' && Host.openUrl) Host.openUrl(x.u);
            else if (window.open) window.open(x.u, '_blank');
          } catch (e) {}
        };
        body.appendChild(go);
      }
      if (x && x.src) body.appendChild(mk('p', 'wiki-src', '来源：' + x.src));

      var orig = src.__nvOrig || null;
      var more = mk('button', 'btn soft', '展开原文');
      more.type = 'button';
      more.onclick = function () {
        wrap.classList.remove('open');
        if (orig) orig();
      };
      body.appendChild(more);
      /* 开关类加在 .nv-clip 容器上（CSS 是 .nv-clip.open .nv-clip-world） */
      wrap.classList.add('open');
    }

    /* 剪报的手感（用户 m12051）：一张从卷宗里抽出来的纸。
     *   · 往下拖 >90px 松手 → 把纸塞回卷宗（关闭抽屉）；
     *   · 左右拖 >60px 松手 → 翻到上/下一张真实 .wiki-card；
     *   · 轻点不抢按钮（原文/关闭各管各的）。
     * --pull/--tilt/--slide 是「抽纸」的物理位移，不是装饰动画。 */
    var cHold = false, cX = 0, cY = 0, cDx = 0, cDy = 0, cMoved = 0;
    card.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      cHold = true; cX = e.clientX; cY = e.clientY;
      cDx = 0; cDy = 0; cMoved = 0;
      card.classList.add('pulling');
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    });
    card.addEventListener('pointermove', function (e) {
      if (!cHold) return;
      cDx = e.clientX - cX; cDy = e.clientY - cY;
      if (Math.abs(cDx) > 6 || Math.abs(cDy) > 6) cMoved = 1;
      if (Math.abs(cDy) > Math.abs(cDx)) {
        card.style.setProperty('--pull', cDy + 'px');
        card.style.setProperty('--tilt', (cDy * 0.012) + 'deg');
        card.style.setProperty('--slide', '0px');
      } else {
        card.style.setProperty('--pull', '0px');
        card.style.setProperty('--tilt', (cDx * 0.006) + 'deg');
        card.style.setProperty('--slide', cDx + 'px');
      }
      if (cMoved) e.preventDefault();
    });
    function clipRelease() {
      if (!cHold) return;
      cHold = false;
      card.classList.remove('pulling');
      card.style.setProperty('--pull', '0px');
      card.style.setProperty('--tilt', '0deg');
      card.style.setProperty('--slide', '0px');
      if (!cMoved) return;
      if (Math.abs(cDy) > Math.abs(cDx) && cDy > 90) {
        wrap.classList.remove('open');
      } else if (Math.abs(cDx) > Math.abs(cDy) && Math.abs(cDx) > 60) {
        showCardAt(clipIdx + (cDx < 0 ? 1 : -1));
      }
    }
    card.addEventListener('pointerup', clipRelease);
    card.addEventListener('pointercancel', clipRelease);

    close.onclick = function () { wrap.classList.remove('open'); };
    world.addEventListener('click', function (e) {
      if (e.target === world) wrap.classList.remove('open');
    });

    function sync() {
      syncStrip();
      /* 给真实剪报卡挂上抽屉交互（只挂一次）。
         原 onclick 必须留一份：抽屉里的「展开原文」要调回 wiki.js 的
         open(id)，否则点它只会再开一次抽屉（m13555 用户报障）。
         wiki.js 重新 render() 出的新卡片没有 __nvBound，这里会重新绑定，
         拿到的 __nvOrig 同样是那张卡自己的 open(id)。 */
      var cards = host.querySelectorAll('.wiki-card');
      for (var i = 0; i < cards.length; i++) {
        (function (c) {
          if (c.__nvBound) return;
          c.__nvBound = true;
          c.__nvOrig = c.onclick || null;
          c.onclick = function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            openCard(c);
          };
        })(cards[i]);
      }
    }

    var anchor = host.querySelector('.wiki-head');
    if (anchor && anchor.nextSibling) host.insertBefore(wrap, anchor.nextSibling);
    else host.insertBefore(wrap, host.firstChild);
    return {
      el: wrap,
      sync: sync,
      /* 离线测试/无头截图用：直接打开第 n 张真实剪报卡 */
      open: function (idx) {
        var cards = host.querySelectorAll('.wiki-card');
        var src = cards[idx || 0];
        if (!src) return false;
        openCard(src);
        return true;
      }
    };
  }

  /* ======================================================================
   * 器官 ⑤：票券闸门（校园事务页）
   * 饮水机做成撕角票券：最长放水是一排机械档位，
   * 读数区是仪表窗。全部数据来自真实 #waterCard / #waterDevCard。
   * ====================================================================== */
  function buildTicket() {
    var host = $('tab-campus');
    if (!host) return null;
    var wrap = mk('div', 'nv-ticket');
    wrap.setAttribute('data-organ', 'ticket');

    var shell = mk('div', 'nv-ticket-shell');
    var head = mk('div', 'nv-ticket-head');
    head.appendChild(mk('span', '', 'HOT WATER · 胖乖生活'));
    var st = mk('span', 'nv-ticket-state', '未绑定');
    head.appendChild(st);
    shell.appendChild(head);

    /* 用户 m13555：「校园生活最上面的仪表盘跟死的一样，不会动，要不就换了吧」。
       旧版是 46px 圆表 + 写死 -38deg 的指针 + 从没被写过的 <b>--</b>，
       既没有数据也没有动作 —— 一块假表，还和下面「饮水机」卡信息重复。
       换成「最长放水活档位」：主读数就是 #waterTarget 当前选中的那一档，
       下面一排刻度格跟选档一起走；撕票换档时整排翻滚一次（一次性反馈，
       不是 infinite 空转）。仪表不再是装饰，是这张票真正在控制的那个量。 */
    var gauge = mk('div', 'nv-ticket-gauge');
    var read = mk('div', 'nv-ticket-read');
    var readMain = mk('b', '', '不限');
    var readSub = mk('u', '', '最长放水');
    read.appendChild(readMain);
    read.appendChild(readSub);
    gauge.appendChild(read);
    shell.appendChild(gauge);

    var steps = mk('div', 'nv-ticket-steps');
    shell.appendChild(steps);

    var note = mk('p', 'nv-ticket-note',
      '手机这边只能解锁，出水要在机器上按一下；接够了自己点「停止」，最长放水只是防忘关。');
    shell.appendChild(note);
    wrap.appendChild(shell);

    /* 活档位：读数 / 刻度格 / 选档三处永远同一份真值（#waterTarget）。
       forceIdx 给「刚点完但 app.js 还没回写 class」的那一帧用。
       lastPaint 做幂等：syncAll() 每 700ms 会调一次 sync()，
       若每次都重建 steps.innerHTML，正在按下的刻度格会被抽走、
       rolled 翻滚动画也会被下一帧打断。签名没变就只更新文字，不碰 DOM。 */
    var lastPaint = null;
    function paint(rolled, forceIdx) {
      if (!readMain || !steps) return;
      var target = $('waterTarget');
      var chips = target ? target.querySelectorAll('button') : [];
      var cur = -1;
      for (var v = 0; v < chips.length; v++) {
        if (chips[v].classList.contains('nv-on')) { cur = v; break; }
      }
      if (cur < 0) {
        for (var i = 0; i < chips.length; i++) {
          if (chips[i].classList.contains('on')) { cur = i; break; }
        }
      }
      if (cur < 0) cur = 0;
      if (forceIdx != null) cur = forceIdx;
      if (cur >= chips.length) cur = 0;
      var labels = [];
      for (var k = 0; k < chips.length; k++) labels.push((chips[k].textContent || '').trim());
      var label = chips.length ? labels[cur] : '不限';
      var sig = cur + '|' + labels.join(',') + '|' + chips.length;
      var changed = sig !== lastPaint;
      lastPaint = sig;

      readMain.textContent = label || '不限';
      /* 账号读数也归 paint 统一管：sync() 里单独写一次会被下一行 paint 覆盖。
         只在真绑定了账号时前缀，未绑定就只报档位，不摆一个假的 '--'。 */
      var whoEl = $('waterWho');
      var who = whoEl ? (whoEl.textContent || '').trim() : '';
      var whoPrefix = (who && who !== '--') ? who + ' · ' : '';
      readSub.textContent = whoPrefix + (chips.length
        ? '最长放水 · ' + (cur + 1) + ' / ' + chips.length + ' 档'
        : '最长放水');
      if (changed) {
        steps.innerHTML = '';
        for (var j = 0; j < chips.length; j++) {
          (function (idx) {
            var txt = labels[idx];
            var cell = mk('button', 'nv-ticket-step' + (idx === cur ? ' on' : ''), txt);
            cell.type = 'button';
            cell.setAttribute('aria-label', '最长放水 ' + txt);
            cell.onclick = function () { chips[idx].click(); };
            steps.appendChild(cell);
          })(j);
        }
      } else {
        /* 签名没变也可能需要挪一下 .on（比如 forceIdx 与真实 class 之间的竞态），
           只切类名不重建节点。 */
        var cells = steps.querySelectorAll('.nv-ticket-step');
        for (var m = 0; m < cells.length; m++) {
          cells[m].classList.toggle('on', m === cur);
        }
      }
      if (rolled) {
        steps.classList.remove('rolled');
        void steps.offsetWidth;   /* 强制重排，让一次性动画能重复触发 */
        steps.classList.add('rolled');
        setTimeout(function () { steps.classList.remove('rolled'); }, 420);
      }
    }

    function sync() {
      /* 绑定台数：真实 #waterCnt */
      var cnt = $('waterCnt');
      var n = cnt ? (cnt.textContent || '').trim() : '';
      st.textContent = n && n !== '0 台' ? n : '未绑定';
      /* 最长放水档位：真实 #waterTarget 里的按钮。点它走 app.js 自己的
         选量逻辑，这里只负责让票面读数与刻度格跟着动。 */
      var target = $('waterTarget');
      var chips = target ? target.querySelectorAll('button') : [];
      for (var i = 0; i < chips.length; i++) {
        (function (b, idx) {
          if (b.__nvBound) return;
          b.__nvBound = true;
          b.addEventListener('click', function () {
            var all = target.querySelectorAll('button');
            for (var j = 0; j < all.length; j++) all[j].classList.remove('nv-on');
            b.classList.add('nv-on');
            paint(true, idx);
          });
        })(chips[i], i);
      }
      paint(false);
    }

    /* 票券的手感（用户 m12051）：票根要「撕」才换档。
     *   · 沿底部齿孔横向拖 >56px 松手 → 沿撕线撕下一格，档位前/后移一格
     *     （点的是真实 #waterTarget 按钮，app.js 的选量逻辑照旧生效）；
     *   · 轻点不抢任何按钮；松手不足阈值就弹回原位。
     * --tear 是票根被拉开的物理位移，不是装饰动画。 */
    var tHold = false, tX = 0, tDx = 0, tMoved = 0;
    shell.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      tHold = true; tX = e.clientX; tDx = 0; tMoved = 0;
      shell.classList.add('tearing');
      try { shell.setPointerCapture(e.pointerId); } catch (err) {}
    });
    shell.addEventListener('pointermove', function (e) {
      if (!tHold) return;
      tDx = e.clientX - tX;
      if (Math.abs(tDx) > 6) tMoved = 1;
      shell.style.setProperty('--tear', Math.max(-72, Math.min(72, tDx)) + 'px');
      if (tMoved) e.preventDefault();
    });
    function tearRelease() {
      if (!tHold) return;
      tHold = false;
      shell.classList.remove('tearing');
      shell.style.setProperty('--tear', '0px');
      if (!tMoved || Math.abs(tDx) < 56) return;
      var target = $('waterTarget');
      if (!target) return;
      var chips = target.querySelectorAll('button');
      if (!chips.length) return;
      var cur = 0;
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].classList.contains('on') || chips[i].classList.contains('nv-on')) { cur = i; break; }
      }
      var next = Math.max(0, Math.min(chips.length - 1, cur + (tDx < 0 ? 1 : -1)));
      if (next !== cur) chips[next].click();
    }
    shell.addEventListener('pointerup', tearRelease);
    shell.addEventListener('pointercancel', tearRelease);

    /* v1.1.60：空调卡独立在最上面，票券紧跟其后、和「饮水机」卡连成一块，
       不再夹在「饮水机 → 空调 → 饮水机」之间（用户 m15143）。 */
    var anchor = $('waterCard') || host.firstChild;
    host.insertBefore(wrap, anchor);
    return { el: wrap, sync: sync };
  }

  /* ======================================================================
   * 器官 ⑥：刷卡（饮水机解锁的重连等待）
   *
   * 胖乖的接口在 unlock 之后要轮询机器状态，机器↔服务器重连要好几秒，
   * 这段时间界面原本只有一行「等待机器响应…」。
   *
   * 2026-11-08 用户（m06219）：「刷票可以改为刷卡，我们的校园卡长这样」，
   * 并给了实拍。于是这里画的不是票，是一张**河南医药大学的校园卡**：
   * 深砖红卡面、左上圆形校徽、右侧两行校名（中文衬线 + 小号英文）、
   * 左侧竖排两列校训（右起竖读「至爱致用 / 明德博学」）、中右一张图书馆
   * 实景、左下「学生卡 | STUDENT CARD」、表面一道斜向高光。
   * 卡从左边滑进来，被闸口的读卡器「刷」过去 —— 等待就变成了刷卡。
   *
   * 卡面上没有一个字是编的：校名/校训/英文名都照卡面实拍；
   * 建筑照片用 CSS 渐变抽象（玻璃幕墙网格 + 台阶 + 旗杆），不引外链图。
   * 真正的进度文字（app.js 写的那些）放在闸口下面一行，不压在卡面上，
   * 因为那些句子会长到「正在把解锁命令发给机器，请等它响一声」，压上去必糊。
   *
   * 零侵入：不改 app.js 一行。用 MutationObserver 盯着 #sh-body，
   * 一旦出现「正在把解锁命令」「等待机器响应」这类提示，就把那行
   * 换成刷卡形态，文字仍然保留（app.js 还在往里写进度）。
   * ====================================================================== */
  var SWIPE_WORDS = ['正在把解锁命令', '等待机器响应', '正在自动重新读取'];
  function buildSwipe() {
    var host = $('sh-body');
    if (!host) { window.__swipeWhy = 'no-sh-body'; return null; }
    if (!host.appendChild) { window.__swipeWhy = 'no-appendChild'; return null; }

    var wrap = mk('div', 'nv-swipe');
    wrap.setAttribute('data-organ', 'swipe');
    var gate = mk('div', 'nv-swipe-gate');
    var slot = mk('div', 'nv-swipe-slot');

    /* ---- 卡本体：照实拍拼，装饰件全部 aria-hidden ---- */
    var card = mk('div', 'nv-swipe-card');

    /* 斜向高光（亮面塑料卡的那道白） */
    var sheen = mk('i', 'nv-sc-sheen');
    sheen.setAttribute('aria-hidden', 'true');
    card.appendChild(sheen);

    /* 左上校徽：双圈 + 校门线稿 */
    var seal = mk('div', 'nv-sc-seal');
    seal.setAttribute('aria-hidden', 'true');
    var sealIn = mk('i', 'nv-sc-seal-in');
    sealIn.setAttribute('aria-hidden', 'true');
    seal.appendChild(sealIn);
    var sealArch = mk('i', 'nv-sc-seal-arch');
    sealArch.setAttribute('aria-hidden', 'true');
    seal.appendChild(sealArch);
    card.appendChild(seal);

    /* 校名两行。校名照卡面：河南醫藥大學（此处用简体，与全站其余处一致） */
    var nameBox = mk('div', 'nv-sc-name');
    var nameCn = mk('b', '', '河南醫藥大學');
    var nameEn = mk('u', '', 'HENAN MEDICAL UNIVERSITY');
    nameBox.appendChild(nameCn);
    nameBox.appendChild(nameEn);
    card.appendChild(nameBox);

    /* 校训：竖排两列，右起竖读 */
    var motto = mk('div', 'nv-sc-motto');
    motto.setAttribute('aria-label', '校训：至爱致用 明德博学');
    motto.appendChild(mk('span', '', '至爱致用'));
    motto.appendChild(mk('span', '', '明德博学'));
    card.appendChild(motto);

    /* 图书馆实景（CSS 渐变，非图片） */
    var photo = mk('i', 'nv-sc-photo');
    photo.setAttribute('aria-hidden', 'true');
    card.appendChild(photo);

    /* 左下：学生卡 | STUDENT CARD */
    var foot = mk('div', 'nv-sc-foot');
    foot.appendChild(mk('b', '', '学生卡'));
    foot.appendChild(mk('i', '', ''));
    foot.appendChild(mk('u', '', 'STUDENT CARD'));
    card.appendChild(foot);

    slot.appendChild(card);
    gate.appendChild(slot);
    var reader = mk('i', 'nv-swipe-reader');
    reader.setAttribute('aria-hidden', 'true');
    gate.appendChild(reader);
    wrap.appendChild(gate);

    /* 进度真话放在闸口下面一行（长句子不压卡面） */
    var tLine = mk('div', 'nv-swipe-t', '');
    wrap.appendChild(tLine);
    var label = mk('div', 'nv-swipe-label', '正在刷卡 · 等机器回应');
    wrap.appendChild(label);
    host.appendChild(wrap);

    var state = { bound: null, text: '' };

    function isSwipeText(t) {
      for (var i = 0; i < SWIPE_WORDS.length; i++) {
        if (t.indexOf(SWIPE_WORDS[i]) >= 0) return true;
      }
      return false;
    }
    function sync() {
      /* app.js 打开半框时会 innerHTML='' 清空 #sh-body，会把器官一起抹掉。
         所以每次同步前先确认自己还在；不在就重新挂回去。 */
      if (!wrap.parentNode && host && host.appendChild) host.appendChild(wrap);
      /* app.js 每轮询都会重写那行文字；找到它，把原话搬进票面 */
      var lines = host.querySelectorAll('.hint');
      var target = null;
      for (var i = 0; i < lines.length; i++) {
        if (isSwipeText(lines[i].textContent || '')) { target = lines[i]; break; }
      }
      if (!target) {
        /* 没有等待提示了：收工，票收走 */
        if (state.bound) {
          state.bound.style.display = '';
          wrap.classList.remove('on');
          state.bound = null;
        }
        return;
      }
      if (state.bound !== target) {
        if (state.bound) state.bound.style.display = '';
        state.bound = target;
        target.style.display = 'none';
        /* 把真话留在票面里：app.js 之后继续改它，我们同步跟着改 */
        wrap.classList.add('on');
      }
      var t = (target.textContent || '').trim();
      if (t !== state.text) {
        state.text = t;
        tLine.textContent = t;
        label.textContent = '正在刷卡 · ' + t;
      }
    }
    return { el: wrap, sync: sync };
  }

  /* ======================================================================
   * 器官 ⑦：设备铭牌舱（我的 页）
   * 「我的」原本是四张白卡片堆着。这一版把它做成一台设备的铭牌：
   * 顶部一条仪器状态条（学号 / 登录态 / 数据源），下面一块规格表。
   * 数据全部读真实 DOM（#acctId / #whoami / #loginState / #termPick /
   * #syncAt / #hwSyncAt / #srcTag / #cnt / #hwStat），一个字都不编。
   * ====================================================================== */
  function buildPlate() {
    var host = $('tab-me');
    if (!host) return null;
    var wrap = mk('div', 'nv-plate');
    wrap.setAttribute('data-organ', 'plate');

    /* 仪器状态条：三个读数 + 一排状态灯 */
    var bar = mk('div', 'nv-plate-bar');
    var idBox = mk('div', 'nv-plate-id');
    idBox.appendChild(mk('u', '', 'XXMU · DEVICE'));
    var idVal = mk('b', '', '--');
    idBox.appendChild(idVal);
    bar.appendChild(idBox);
    var leds = mk('div', 'nv-plate-leds');
    for (var i = 0; i < 3; i++) {
      var l = mk('i', 'nv-plate-led');
      l.appendChild(mk('u', '', ['本地', '教务', '超星'][i]));
      leds.appendChild(l);
    }
    bar.appendChild(leds);
    wrap.appendChild(bar);

    /* 规格表：标题 + 两列读数 */
    var sheet = mk('div', 'nv-plate-sheet');
    sheet.appendChild(mk('div', 'nv-plate-h', 'SPEC · 本机规格'));
    var grid = mk('div', 'nv-plate-grid');
    var rows = [
      ['激活学号', 'acctId'],
      ['身份', 'acctRole'],
      ['教务学号', 'whoami'],
      ['登录状态', 'loginState'],
      ['学期', 'termPick'],
      ['课程数', 'cnt'],
      ['课表同步', 'syncAt'],
      ['作业同步', 'hwSyncAt'],
      ['数据来源', 'srcTag'],
      ['学习通作业', 'hwStat']
    ];
    for (var r = 0; r < rows.length; r++) {
      (function (label, id) {
        var row = mk('div', 'nv-plate-row');
        row.appendChild(mk('span', '', label));
        var v = mk('b', '', '--');
        v.setAttribute('data-src', id);
        row.appendChild(v);
        grid.appendChild(row);
      })(rows[r][0], rows[r][1]);
    }
    sheet.appendChild(grid);
    wrap.appendChild(sheet);

    function sync() {
      if (!wrap.parentNode && host && host.appendChild) host.appendChild(wrap);
      /* 被取代的「数据状态」卡要一直藏着（经典→NOVA 切换时它可能被重新显示） */
      var dup = host.querySelector('[data-nv-hidden]');
      if (dup) dup.style.display = 'none';
      /* 学号读真值 */
      var who = $('whoami'), act = $('acctId');
      var idText = (who && who.textContent && who.textContent !== '--') ? who.textContent
        : (act && act.textContent && act.textContent !== '--' ? act.textContent : '未登录');
      idVal.textContent = idText;
      /* 三盏灯：本地永远亮（数据在本机），教务/超星看真实状态 */
      var ls = $('loginState');
      var loginOn = !!(ls && /已登录|登录/.test(ls.textContent || '') && !/未登录/.test(ls.textContent || ''));
      var cx = $('hwStat');
      var cxOn = !!(cx && cx.textContent && cx.textContent !== '--' && /待做|作业全清/.test(cx.textContent));
      var leds2 = leds.querySelectorAll('.nv-plate-led');
      if (leds2[0]) leds2[0].classList.add('on');
      if (leds2[1]) leds2[1].classList.toggle('on', loginOn);
      if (leds2[2]) leds2[2].classList.toggle('on', cxOn);
      /* 规格表逐项读真值 */
      var vals = grid.querySelectorAll('[data-src]');
      for (var i = 0; i < vals.length; i++) {
        var src = vals[i].getAttribute('data-src');
        var el = $(src);
        var t = el ? (el.textContent || '').trim() : '';
        vals[i].textContent = t && t !== '--' ? t : '—';
      }
    }

    /* 铭牌舱取代「数据状态」那张卡（内容完全重复）：
       找到它就把自己放到它的位置，并把原卡藏起来。
       找不到就退回到「本机账号」卡之后。 */
    /* 铭牌舱的手感（用户 m12051）：一块可以掀起来的检修盖板。
     *   · 在状态条上向下拖 >44px 松手 → 把盖板翻下来，收起规格表；
     *     再点/再拖一次掀回去（只是显隐，读数一个字不改）。
     * --cover 是盖板被掀起的位移，轻点同样可切换（键盘/无障碍兼容）。 */
    var pHold = false, pY = 0, pDy = 0, pMoved = 0;
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('aria-label', '掀开或合上设备铭牌盖板');
    bar.addEventListener('pointerdown', function (e) {
      pHold = true; pY = e.clientY; pDy = 0; pMoved = 0;
      bar.classList.add('lifting');
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    });
    bar.addEventListener('pointermove', function (e) {
      if (!pHold) return;
      pDy = e.clientY - pY;
      if (Math.abs(pDy) > 6) pMoved = 1;
      bar.style.setProperty('--cover', Math.max(0, Math.min(20, pDy)) + 'px');
      if (pMoved) e.preventDefault();
    });
    function plateRelease() {
      if (!pHold) return;
      pHold = false;
      bar.classList.remove('lifting');
      bar.style.setProperty('--cover', '0px');
      if (!pMoved) { wrap.classList.toggle('folded'); return; }
      if (pDy > 44) wrap.classList.add('folded');
      else if (pDy < -44) wrap.classList.remove('folded');
    }
    bar.addEventListener('pointerup', plateRelease);
    bar.addEventListener('pointercancel', plateRelease);
    bar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrap.classList.toggle('folded'); }
    });

    var dup = null;
    var cards = host.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      var t = cards[i].querySelector('.card-title');
      if (t && /数据状态/.test(t.textContent || '')) { dup = cards[i]; break; }
    }
    if (dup && dup.parentNode) {
      dup.parentNode.insertBefore(wrap, dup);
      dup.setAttribute('data-nv-hidden', '1');
      dup.style.display = 'none';
    } else {
      var anchor = host.querySelector('#acctCard');
      if (anchor && anchor.nextSibling) host.insertBefore(wrap, anchor.nextSibling);
      else host.insertBefore(wrap, host.firstChild);
    }
    return { el: wrap, sync: sync };
  }

  /* ======================================================================
   * 器官 ⑧：像素层 —— 不再是一台独立的掌机
   *
   * 2026-11-08 用户（m12030）：「课程表上面有周数了又加个gba游戏机，
   * 太不融合了吧，有点刻意而且很突兀不好看」。
   *
   * 判词是对的：那台掌机同时干两件事——① 屏幕里再印一遍「第 N 周 / 日期」，
   * 而 header 上已经有了；② 它作为一个「设备」贴在课表外面，是外挂件，
   * 不是课表自己的材质。信息重复 + 身份错位，两条都踩在「融合」的反面。
   *
   * 所以这里不留任何 DOM。像素语言全部降级成 #grid 自己的材质（硬边、点阵
   * 表头、当前节次格的 2px 硬投影，见 web/nova-pixel.css §5/§6）——
   * 风格不是贴在界面上的贴纸，而是这块玻璃本身被切成什么样。
   * 返回 null 是刻意的：mount() 里 pixel 这项为 null，其余器官照常装配。
   * ====================================================================== */
  function buildPixel() {
    /* 显式留空。别在这里塞「最小掌机 / 迷你手柄 / 悬浮按键」回来：
       任何独立于 #grid 的设备都会重新变成第二个周次读数。 */
    return null;
  }

  /* ======================================================================
   * 器官 ⑨：截止矩阵（赛博朋克 / 黑客帝国）—— 学习通页
   * 风格归属：赛博系负责「状态读数 + 截止段码」。
   * 读数全部读真实 DOM（#hwcount / #hwStat / #syncAt），一个字都不编；
   * 下落的字符只是氛围层，aria-hidden，不承载任何信息。
   * ====================================================================== */
  function buildRain() {
    var host = $('tab-learn');
    if (!host) return null;
    var wrap = mk('div', 'nv-rain');
    wrap.setAttribute('data-organ', 'rain');

    var bar = mk('div', 'nv-rain-bar');
    bar.appendChild(mk('span', 'nv-rain-t', 'DEADLINE MATRIX'));
    var segs = mk('div', 'nv-rain-segs');
    var defs = [['待做', 'hwcount'], ['待考', 'hwStat'], ['同步', 'syncAt']];
    for (var i = 0; i < defs.length; i++) {
      (function (label, id) {
        var s = mk('span', 'nv-rain-seg');
        s.appendChild(mk('u', '', label));
        var v = mk('b', '', '--');
        v.setAttribute('data-src', id);
        s.appendChild(v);
        segs.appendChild(s);
      })(defs[i][0], defs[i][1]);
    }
    bar.appendChild(segs);
    wrap.appendChild(bar);

    var cols = mk('div', 'nv-rain-cols');
    cols.setAttribute('aria-hidden', 'true');
    var glyphs = ['01011010', 'AK37XQ9Z', '0110MEO7', 'Z90X17QA'];
    for (var c = 0; c < 4; c++) {
      cols.appendChild(mk('span', 'nv-rain-col',
        glyphs[c] + glyphs[(c + 1) % 4] + glyphs[(c + 2) % 4]));
    }
    wrap.appendChild(cols);

    /* 截止矩阵的手感（用户 m12051）：拿扫描头从左往右扫一遍读数。
     *   · 在读数条上按住横向拖 → 一条光带跟着手走（--scan）；
     *   · 松手扫过半程以上 → 触发一次真实刷新（#refresh 或 #btnCxSync），
     *     并把读数重读一遍；不足就弹回，不误触业务。
     * 光带是「扫描」这个动作本身，不是常驻装饰。 */
    var rHold = false, rX = 0, rW = 1;
    bar.addEventListener('pointerdown', function (e) {
      rHold = true; rX = e.clientX; rW = bar.getBoundingClientRect().width || 1;
      bar.classList.add('scanning');
      bar.style.setProperty('--scan', Math.max(0, e.clientX - bar.getBoundingClientRect().left) + 'px');
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    });
    bar.addEventListener('pointermove', function (e) {
      if (!rHold) return;
      var left = bar.getBoundingClientRect().left;
      bar.style.setProperty('--scan', Math.max(0, Math.min(rW, e.clientX - left)) + 'px');
      e.preventDefault();
    });
    function rainRelease(e) {
      if (!rHold) return;
      rHold = false;
      bar.classList.remove('scanning');
      var left = bar.getBoundingClientRect().left;
      var px = Math.max(0, Math.min(rW, (e.clientX || left) - left));
      bar.style.setProperty('--scan', '0px');
      if (px < rW * 0.55) return;
      var btn = $('refresh') || $('btnCxSync');
      if (btn && btn.click) btn.click();
      sync();
    }
    bar.addEventListener('pointerup', rainRelease);
    bar.addEventListener('pointercancel', rainRelease);

    var head = host.querySelector('.learn-head');
    if (head && head.parentNode) head.parentNode.insertBefore(wrap, head);
    else host.insertBefore(wrap, host.firstChild);

    function sync() {
      if (!wrap.parentNode && host && host.appendChild) {
        var h2 = host.querySelector('.learn-head');
        if (h2 && h2.parentNode) h2.parentNode.insertBefore(wrap, h2);
        else host.insertBefore(wrap, host.firstChild);
      }
      var vals = wrap.querySelectorAll('[data-src]');
      for (var i = 0; i < vals.length; i++) {
        var el = $(vals[i].getAttribute('data-src'));
        var t = el ? (el.textContent || '').trim() : '';
        vals[i].textContent = t && t !== '--' ? t : '--';
      }
    }
    return { el: wrap, sync: sync };
  }

  /* ======================================================================
   * 器官 ⑩：拍立得照片墙（宝丽来）—— 校园实景
   * 风格归属：拍立得只负责「照片与留言的呈现形态」。
   * 真实照片卡是 wiki.js 自己渲染的 .ph-grid / .ph-card，
   * 这里只给它套上相纸与显影形态，并把空态做成「显影槽」。
   * ====================================================================== */
  function buildPolaroid() {
    var host = $('tab-wiki');
    if (!host) return null;
    var wrap = mk('div', 'nv-polaroid');
    wrap.setAttribute('data-organ', 'polaroid');
    var bar = mk('div', 'nv-polaroid-bar');
    bar.appendChild(mk('span', 'nv-polaroid-tag', 'POLAROID WALL'));
    bar.appendChild(mk('span', 'nv-polaroid-note', '待冲洗 = 待审核 · 点照片放大'));
    wrap.appendChild(bar);
    var dark = mk('div', 'nv-darkroom');
    dark.appendChild(mk('span', 'nv-darkroom-t', '显影槽 · 还没有显影完成的照片'));
    wrap.appendChild(dark);

    /* 拍立得墙的手感（用户 m12051）：相纸要从显影槽里「抽」出来。
     *   · 按住一张相纸往下拖 → 相纸跟着手下滑一点（--draw），整墙进入显影态
     *     （低饱和 + 微暖，像刚出槽还没定影）；松手弹回并恢复。
     *   · 轻点完全不拦截：真实 .ph-card 的 onclick（wiki.js 放大原图）照旧生效。
     * 拖动不足阈值时也不抢 click，保证「点照片放大」这条业务不被手感破坏。 */
    var pHoto = false, poY = 0, poDy = 0, poMoved = 0, poCard = null;
    wrap.addEventListener('pointerdown', function (e) {
      var c = e.target.closest ? e.target.closest('.ph-card') : null;
      if (!c) return;
      pHoto = true; poY = e.clientY; poDy = 0; poMoved = 0; poCard = c;
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!pHoto || !poCard) return;
      poDy = e.clientY - poY;
      if (poDy > 6) poMoved = 1;
      if (poMoved) {
        poCard.style.setProperty('--draw', Math.min(46, poDy) + 'px');
        wrap.classList.add('developing');
        e.preventDefault();
      }
    });
    function photoRelease() {
      if (!pHoto) return;
      pHoto = false;
      wrap.classList.remove('developing');
      if (poCard) poCard.style.setProperty('--draw', '0px');
      poCard = null;
    }
    wrap.addEventListener('pointerup', photoRelease);
    wrap.addEventListener('pointercancel', photoRelease);

    function sync() {
      var sec = host.querySelector('.ph-sec');
      if (!sec) return;
      if (wrap.parentNode !== sec) sec.insertBefore(wrap, sec.firstChild);
      var grid = host.querySelector('.ph-grid');
      /* v1.1.63: photo wall is now paged - each page owns its own .ph-grid,
         so painting only the first one leaves page 2+ as bare cards.
         Keep querySelector('.ph-grid') above (the gate locks that literal),
         then use querySelectorAll to paint every page. */
      var grids = sec.querySelectorAll('.ph-grid');
      for (var gi = 0; gi < grids.length; gi++) grids[gi].classList.add('nv-polaroid-grid');
      if (grid) {
        if (dark.parentNode) dark.parentNode.removeChild(dark);
      } else if (!dark.parentNode) {
        wrap.appendChild(dark);
      }
    }
    return { el: wrap, sync: sync };
  }

  /* ======================================================================
   * 器官 ⑪：手绘涂鸦层（涂鸦 / 素描线稿 FLIPSIDE）
   * 风格归属：涂鸦与线稿只负责「介质的笔触」，不承载信息。
   * 所以它做成一排手绘小图形，贴在「我的」页顶部，不抢任何读数。
   * ====================================================================== */
  function buildDoodle() {
    var host = $('tab-me');
    if (!host) return null;
    var wrap = mk('div', 'nv-doodle');
    wrap.setAttribute('data-organ', 'doodle');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<svg class="nv-doodle-svg" viewBox="0 0 64 26"><path d="M4 20C12 6 22 22 32 9C40 -1 50 5 60 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' +
      '<svg class="nv-doodle-svg" viewBox="0 0 48 26"><path d="M3 22L20 6L22 13L42 4M22 13L40 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<svg class="nv-doodle-svg" viewBox="0 0 44 26"><path d="M22 3L26 14L38 14L28 21L32 32L22 25L12 32L16 21L6 14L18 14Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>';
    host.insertBefore(wrap, host.firstChild);
    function sync() {
      if (!wrap.parentNode && host && host.appendChild) host.insertBefore(wrap, host.firstChild);
    }
    return { el: wrap, sync: sync };
  }

  /* ======================================================================
   * 装配 / 拆卸
   * ====================================================================== */
  function mount() {
    if (ORGANS) return;
    ORGANS = {
      belt: buildBelt(),
      tape: buildTape(),
      dial: buildDial(),
      clipping: buildClipping(),
      ticket: buildTicket(),
      swipe: buildSwipe(),
      plate: buildPlate(),
      pixel: buildPixel(),
      rain: buildRain(),
      polaroid: buildPolaroid(),
      doodle: buildDoodle()
    };
    syncAll();
    /* 界面自己会重画（切周、切页、同步作业），所以要持续同步器官状态。
       用轻量轮询而不是改 app.js —— 改动越小越不容易坏。 */
    var timer = setInterval(function () {
      if (!on()) return;
      syncAll();
    }, 700);
    /* 但切页是「瞬间」的，轮询有最多 700ms 延迟，传送带会多露一屏。
       所以再挂一个 MutationObserver 盯 #top 的 data-page，
       一变就立刻同步（切页时 app.js 只改这个属性）。 */
    var top = $('top');
    var mos = [];
    if (top && window.MutationObserver) {
      var mo = new MutationObserver(function () { syncAll(); });
      try { mo.observe(top, { attributes: true, attributeFilter: ['data-page'] }); mos.push(mo); } catch (e) {}
    }
    /* app.js 打开放水半框时会 innerHTML='' 清空 #sh-body，刷票器官会被一起抹掉。
       盯住 #sh-body 的子节点变化，一被清空就立刻挂回去。 */
    var shb = $('sh-body');
    if (shb && window.MutationObserver) {
      var mo2 = new MutationObserver(function () { syncAll(); });
      try { mo2.observe(shb, { childList: true }); mos.push(mo2); } catch (e) {}
    }
    WATCH = { timer: timer, mo: mos };
  }
  function unmount() {
    if (!ORGANS) return;
    try {
      if (ORGANS.belt && ORGANS.belt.el) ORGANS.belt.el.remove();
      if (ORGANS.tape && ORGANS.tape.el) ORGANS.tape.el.remove();
      if (ORGANS.dial && ORGANS.dial.el) ORGANS.dial.el.remove();
      if (ORGANS.clipping && ORGANS.clipping.el) ORGANS.clipping.el.remove();
      if (ORGANS.ticket && ORGANS.ticket.el) ORGANS.ticket.el.remove();
      if (ORGANS.swipe && ORGANS.swipe.el) ORGANS.swipe.el.remove();
      if (ORGANS.plate && ORGANS.plate.el) ORGANS.plate.el.remove();
      if (ORGANS.pixel && ORGANS.pixel.el) ORGANS.pixel.el.remove();
      if (ORGANS.rain && ORGANS.rain.el) ORGANS.rain.el.remove();
      if (ORGANS.polaroid && ORGANS.polaroid.el) ORGANS.polaroid.el.remove();
      if (ORGANS.doodle && ORGANS.doodle.el) ORGANS.doodle.el.remove();
    } catch (e) {}
    ORGANS = null;
    if (WATCH) {
      try { if (WATCH.timer) clearInterval(WATCH.timer); } catch (e) {}
      try {
        if (WATCH.mo) WATCH.mo.forEach(function (m) { m.disconnect(); });
      } catch (e) {}
      WATCH = null;
    }
  }
  function syncAll() {
    if (!ORGANS) return;
    try { if (ORGANS.belt) ORGANS.belt.sync(); } catch (e) {}
    try { if (ORGANS.tape) ORGANS.tape.sync(); } catch (e) {}
    try { if (ORGANS.dial) ORGANS.dial.sync(); } catch (e) {}
    try { if (ORGANS.clipping) ORGANS.clipping.sync(); } catch (e) {}
    try { if (ORGANS.ticket) ORGANS.ticket.sync(); } catch (e) {}
    try { if (ORGANS.swipe) ORGANS.swipe.sync(); } catch (e) {}
    try { if (ORGANS.plate) ORGANS.plate.sync(); } catch (e) {}
    try { if (ORGANS.pixel) ORGANS.pixel.sync(); } catch (e) {}
    try { if (ORGANS.rain) ORGANS.rain.sync(); } catch (e) {}
    try { if (ORGANS.polaroid) ORGANS.polaroid.sync(); } catch (e) {}
    try { if (ORGANS.doodle) ORGANS.doodle.sync(); } catch (e) {}
  }

  function apply() {
    if (on()) mount(); else unmount();
  }

  /* 首屏：DOM 还没建好时交给 DOMContentLoaded 再装 */
  function boot() {
    if (!on()) return;
    mount();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  /* 皮肤切换时跟着装 / 拆 */
  var prevApply = window.SKIN.apply;
  window.SKIN.apply = function () {
    var r = prevApply.apply(window.SKIN, arguments);
    try { apply(); } catch (e) {}
    return r;
  };
  /* 关键修复（2026-11-09 真机 m13042「传送带在哪，卡券在哪，怎么什么都没有」）：
     设置页点「万象舱」走的是 SKIN.set()，而 nova-skin.js 的 set() 内部调的是
     闭包里的局部 apply，不是 window.SKIN.apply —— 上面那层包装根本拦不到它。
     结果：data-skin 变成 nova、介质 CSS 生效，但 ORGANS 一直是 null，
     传送带/磁带门/票券/剪报/铭牌/截止矩阵/拍立得这些动态 DOM 一个都没挂，
     用户只看到一张冷灰皮（所以「马里奥/赛博/宫崎骏全都没有」也是同一个病根）。
     两条一起补：① 包装 set；② 常驻 MutationObserver 盯 html[data-skin]，
     无论谁改的属性都能自愈（含 Host pref 回传、冷启动 readyState 竞态）。
     无头夹具以前直接调 SKIN.apply() 才碰巧挂上，掩盖了这条真机路径。 */
  var prevSet = window.SKIN.set;
  window.SKIN.set = function () {
    var r = prevSet.apply(window.SKIN, arguments);
    try { apply(); } catch (e) {}
    return r;
  };
  if (window.MutationObserver) {
    var skinMo = new MutationObserver(function () { try { apply(); } catch (e) {} });
    try {
      skinMo.observe(document.documentElement,
        { attributes: true, attributeFilter: ['data-skin'] });
    } catch (e) {}
  }
  /* 最关键的一层：nova-skin.js 的 apply() 会在自己闭包里同步调用这个钩子。
     按钮 onclick → 局部 set → 局部 apply → __novaSync → 立刻 mount，
     绕开了「包装 window.SKIN.set/apply 拦不到闭包调用」的死角。
     apply() 本身幂等（mount 见 ORGANS 已存在就 return），三层保险不冲突。 */
  try { window.SKIN.__novaSync = apply; } catch (e) {}
  window.NOVA_ORGANS = {
    sync: syncAll, mount: mount, unmount: unmount,
    /* 给离线测试和无头截图用：直接开/关磁带门 */
    __tapeOpen: function (x, y) {
      if (!ORGANS || !ORGANS.tape) return false;
      ORGANS.tape.open(x, y);
      return true;
    },
    __tapeClose: function () {
      if (!ORGANS || !ORGANS.tape) return false;
      ORGANS.tape.close();
      return true;
    },
    /* 剪报抽屉：打开第 n 张真实剪报卡（离线测试/无头截图用） */
    __clipOpen: function (idx) {
      if (!ORGANS || !ORGANS.clipping) return false;
      return ORGANS.clipping.open(idx || 0);
    },
    /* 纯函数，不依赖 DOM：把「目标周次」翻译成该点几次真实切周按钮 */
    beltSteps: function (from, to, total) {
      var t = (total && total > 0) ? total : 21;
      var d = to - from;
      if (d > 0) return { dir: 'fwd', n: Math.min(d, t - from) };
      if (d < 0) return { dir: 'back', n: Math.min(-d, from - 1) };
      return { dir: 'none', n: 0 };
    }
  };
})();
