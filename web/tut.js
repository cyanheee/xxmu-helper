/* 河医大助手 - 首次使用教程（v1.1.6）
 *
 * ================== 它和 onboard.js 的分工 ==================
 *
 *   tut.js      = 「这个东西是干什么的、能干什么」——一次性看一遍的说明书
 *   onboard.js  = 「现在请你登录两个账号」——有状态的待办清单，登完会打勾
 *
 * 顺序是 教程 → 登录引导。先讲清楚值不值得登，再要人要账号，
 * 比一上来就弹「还差两步」通过率高。
 *
 * ================== 为什么要做 ==================
 *
 * 学生装完 App 第一眼是空的课表（不内置任何人的数据），如果不知道
 * 「这玩意儿到底能替我干什么」，他会直接卸载，而不是去找登录入口。
 * 所以第一页先把动机讲出来：懒得切一堆软件。
 *
 * ================== 技术要点 ==================
 *
 * 1. 纯前端，不联网。教程在飞行模式下也要能翻完。
 * 2. 内容写在 PAGES 数组里，加一页只加一个对象，不用碰 DOM。
 * 3. 不依赖 CSS 框架，只用 app.css 里已有的变量和 .btn / .hint。
 * 4. 翻页用横向 flex + transform，不做真实滚动 —— 滚动会有回弹和
 *    边缘露白，在国产 ROM 的 WebView 上表现不一致。
 */

const Tut = (() => {
  const K = 'xxmu_tut_done';
  const $ = id => document.getElementById(id);

  /* ---------------- 内容 ----------------
   * icon 用单个汉字/符号，比引图标字体省 200KB，也不会因为字体缺失
   * 变成一个方块。
   */
  const PAGES = [
    {
      icon: '懒',
      ttl: '为什么做这个',
      body: [
        '我最开始做它，纯粹是懒。',
        '看课表开一个 App，看作业开一个，接水还要再扫一次码。一天下来在这些软件之间切十几遍，每次都要重新登录、重新找入口。',
        '所以把这三件事塞进了一个 App：课表、作业考试、接水。都用自己的账号登录一次，之后打开就是自己的。',
        '没有广告，没有 "开通会员"，不收集你的成绩。',
      ],
    },
    {
      icon: '课',
      ttl: '课表：登录一次，一直有',
      body: [
        '点「登录教务」，在学校的官方页面上输入学号和密码。App 只负责把那个页面显示出来，不接触你的密码。',
        '登录成功后自动抓课表，之后每周自动跟学校同步一次。',
        '上方箭头切周，右上角「空教室」可以查哪个教室现在没课。',
        '学期开学日如果和学校对不上，到「我的 → 学期设置」把日期挪 7 天就行。',
      ],
      tip: '密码只在学校的页面上输入，App 和它的服务器都收不到。',
    },
    {
      icon: '学',
      ttl: '学习：作业和考试都在这一页',
      body: [
        '「学习」页读的是你的学习通账号，作业和考试按紧急度排在一起。',
        '点任意一条，直接在 App 里打开学习通对应的页面去交、去考。',
        '状态是学习通自己写的：未交、待批阅、已批阅、已完成。读不到状态时会显示「状态未知」，不会瞎猜成已完成。',
        '读完一次会缓存，没网也能看上次的结果，点「重新检查」手动刷新。',
      ],
    },
    {
      icon: '水',
      ttl: '接水：不用再扫码',
      body: [
        '学校的直饮水机走「胖乖生活」。在这里用手机号登录一次。',
        '之后在你的机器旁边点一下「接水」，阀就开了；再接一下「结束并结算」。',
        '手机上删掉胖乖生活 App 也不影响，这里已经把它那套流程接过来了。',
        '余额和订单都在这一页能看到，钱还是从你自己的账户扣。',
      ],
      tip: '只有读和开关阀，不能替你充值，也看不到支付密码。',
    },
    {
      icon: '园',
      ttl: '校园：WIKI、实景、留言',
      body: [
        '「WIKI」这一页是学校资料：官方入口、招生办电话、附属医院、各种办事流程，都标了来源。',
        '「校园实景」是同学自己拍的照片，管理员审过才公开。你也可以传，会自动压到几百 KB，不费流量。',
        '下面还有留言板。想加功能、发现 bug、资料写错了，直接写一条，不用加 QQ 群。管理员回复后会显示出来。',
      ],
    },
    {
      icon: '始',
      ttl: '就这些，开始吧',
      body: [
        '下一步会让你登录两个账号：教务（拿课表和成绩）和学习通（拿作业考试）。',
        '两个都可以先跳过，以后在「我的」和「学习」页随时能找到入口。',
        '饮水机在「校园事务」页，需要时再登。',
        '遇到问题：「我的 → 关于 → 反馈问题」，会带上诊断信息，粘给我就能定位。',
      ],
    },
  ];

  let idx = 0;

  function done() {
    try {
      if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(K) === '1';
      return localStorage.getItem(K) === '1';
    } catch (e) { return true; }   // 读不到就当看过，别拿教程拦住人
  }

  function mark() {
    try {
      if (typeof Host !== 'undefined' && Host.setPref) Host.setPref(K, '1');
      else localStorage.setItem(K, '1');
    } catch (e) {}
  }

  /* ---------------- 渲染 ---------------- */

  function build() {
    const box = $('tut');
    if (!box || box.dataset.built === '1') return;
    box.dataset.built = '1';
    box.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'tut-box';

    const strip = document.createElement('div');
    strip.className = 'tut-strip';
    PAGES.forEach((p, i) => {
      const pg = document.createElement('div');
      pg.className = 'tut-pg';

      if (i === 0) {
        const badge = document.createElement('div');
        badge.className = 'gate-badge';
        badge.textContent = '河';
        pg.appendChild(badge);
      } else {
        const ic = document.createElement('div');
        ic.className = 'tut-icon';
        ic.textContent = p.icon;
        pg.appendChild(ic);
      }

      const t = document.createElement('div');
      t.className = 'tut-ttl';
      t.textContent = p.ttl;
      pg.appendChild(t);

      p.body.forEach(txt => {
        const d = document.createElement('p');
        d.className = 'tut-p';
        d.textContent = txt;
        pg.appendChild(d);
      });

      if (p.tip) {
        const tip = document.createElement('p');
        tip.className = 'tut-tip';
        tip.textContent = p.tip;
        pg.appendChild(tip);
      }
      strip.appendChild(pg);
    });
    card.appendChild(strip);

    const dots = document.createElement('div');
    dots.className = 'tut-dots';
    PAGES.forEach((_, i) => {
      const d = document.createElement('i');
      d.dataset.i = String(i);
      dots.appendChild(d);
    });
    card.appendChild(dots);

    const acts = document.createElement('div');
    acts.className = 'tut-acts';
    const skip = document.createElement('button');
    skip.className = 'tut-skip';
    skip.id = 'tutSkip';
    skip.textContent = '跳过';
    const next = document.createElement('button');
    next.className = 'btn';
    next.id = 'tutNext';
    next.textContent = '下一步';
    acts.appendChild(skip);
    acts.appendChild(next);
    card.appendChild(acts);

    box.appendChild(card);

    skip.onclick = () => finish();
    next.onclick = () => {
      if (idx >= PAGES.length - 1) { finish(); return; }
      idx += 1;
      paint();
    };
  }

  function paint() {
    const box = $('tut');
    if (!box) return;
    const strip = box.querySelector('.tut-strip');
    if (strip) strip.style.transform = 'translateX(' + (-idx * 100) + '%)';
    box.querySelectorAll('.tut-dots i').forEach((d, i) => {
      d.classList.toggle('on', i === idx);
    });
    const next = $('tutNext');
    if (next) next.textContent = (idx >= PAGES.length - 1) ? '开始使用' : '下一步';
    const skip = $('tutSkip');
    if (skip) skip.style.visibility = (idx >= PAGES.length - 1) ? 'hidden' : 'visible';
  }

  /* 「我的 → 使用教程」是重看，看完不该再触发一次登录引导。 */
  let replayMode = false;

  function show() {
    replayMode = false;
    build();
    idx = 0;
    paint();
    const box = $('tut');
    if (box) box.classList.add('on');
  }

  function finish() {
    const box = $('tut');
    if (box) box.classList.remove('on');
    if (replayMode) { replayMode = false; return; }
    mark();
    /* 教程看完紧接着弹登录引导。Onboard 自己有 pref，
     * 已经登过或已引导过的直接返回。 */
    if (typeof Onboard !== 'undefined') setTimeout(() => Onboard.afterUnlock(), 260);
  }

  /** 激活/进 App 之后调用；已看过就什么都不做 */
  function afterUnlock() {
    if (done()) { if (typeof Onboard !== 'undefined') Onboard.afterUnlock(); return; }
    setTimeout(show, 320);
  }

  /** 「我的 → 使用教程」重看：看完不再触发登录引导。
   *
   * 这里只置一个标志再复用 show()，**不要另写一套翻页回调**。
   * 原来这里把 #tutNext / #tutSkip 的 onclick 覆盖成「只关层、不 mark、
   * 不转 Onboard」，而 build() 有 `dataset.built` 守卫不会重建 —— 于是
   * 只要用户重看过一次，之后所有正常的翻页（含首次引导）都走的是这套
   * 残缺回调：最后一页永远不 mark()，也就永远不会进登录引导。 */
  function replay() {
    replayMode = true;
    show();
  }

  let inited = false;

  function init() {
    /* app.js 底部会无条件 init 一次，随后 Gate.boot() 走 __onUnlocked
     * 又 init 一次。onclick 赋值重复无害，但 addEventListener 会真的
     * 叠成两份 —— 一次滑动翻两页、一次输入渲染两次。所有 init 都必须是
     * 幂等的。 */
    if (inited) return;
    inited = true;
    /* 左右滑动翻页：教程六页，只让点按钮翻有点笨。
     * 用 touchstart/touchend 的最小差量判断，不引任何库。 */
    const box = $('tut');
    if (!box) return;
    let sx = 0, sy = 0, moved = false;
    /* 三处都要判 touches 空：多指按下再抬起、或者在手势中途被系统打断时，
     * touches / changedTouches 可能是空数组，直接取 [0].clientX 会抛
     * TypeError，而监听器里的异常不会冒泡到任何地方 —— 表现就是「滑不动了」。 */
    box.addEventListener('touchstart', e => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      sx = t.clientX; sy = t.clientY; moved = false;
    }, { passive: true });
    box.addEventListener('touchmove', e => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - sx) > 12 && Math.abs(t.clientX - sx) > Math.abs(t.clientY - sy)) {
        moved = true;
      }
    }, { passive: true });
    box.addEventListener('touchend', e => {
      if (!moved) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      if (Math.abs(dx) < 42) return;
      if (dx < 0 && idx < PAGES.length - 1) { idx += 1; paint(); }
      if (dx > 0 && idx > 0) { idx -= 1; paint(); }
    }, { passive: true });

    const row = $('rowTut');
    if (row) row.onclick = replay;
  }

  return { init, show, hide: finish, afterUnlock, replay, done, pages: PAGES };
})();
