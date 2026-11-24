/* 河医大助手 - 首次使用教程
 *
 * ================== 它和 onboard.js 的分工 ==================
 *
 *   tut.js      = 「这个东西是干什么的、能干什么」——一次性看一遍的说明书
 *   onboard.js  = 「现在请你登录两个账号」——有状态的待办清单，登完会打勾
 *
 * 顺序是 教程 → 登录引导。先讲清楚值不值得登，再要人要账号。
 *
 * ================== v1.1.42：内容必须跟着功能走 ==================
 *
 * 用户原话：「使用教程什么的每次版本更新，如果有功能性变化这个也需要更新」。
 * 以前教程停在 v1.1.6，还在教「接水→结束并结算」（结算早已删除）、
 * 「我的 → 学期设置」（已搬进设置页）——学生照着做只会找不到按钮。
 *
 * 所以这一版加两道卡口，不靠人记：
 *   ① `TUT_CONTENT_VER` 和 `TUT_FEATURES`：教程声称覆盖了哪些功能，
 *      逐条写在这里；`tools/check_tutorial.js` 拿它跟
 *      `docs/handoff/tutorial-contract.json` 对照，功能变了没更新就 exit 1。
 *   ② 每页 `since` 标明是哪一版加的，`release_all.py` 预检会跑这个检查。
 *
 * 改功能时的动作（一句话）：改 docs/handoff/tutorial-contract.json 里的
 * 功能清单 → 改本文件的 PAGES → 把 TUT_CONTENT_VER +1 → 跑检查。
 *
 * ================== 技术要点 ==================
 *
 * 1. 纯前端，不联网。教程在飞行模式下也要能翻完。
 * 2. 内容写在 PAGES 数组里，加一页只加一个对象，不用碰 DOM。
 * 3. 不依赖 CSS 框架，只用 app.css 里已有的变量和 .btn / .hint。
 * 4. 翻页用横向 flex + transform，不做真实滚动 —— 滚动会有回弹和
 *    边缘露白，在国产 ROM 的 WebView 上表现不一致。
 * 5. v1.1.42 排版修复：strip 装进无 padding 的 .tut-view，否则相邻页
 *    会露在卡片左右 padding 区（真机截图实证）。
 */

const Tut = (() => {
  const K = 'xxmu_tut_done';
  const $ = id => document.getElementById(id);

  /* 内容版本号 + 覆盖清单：由 tools/check_tutorial.js 与契约表核对。
   * 契约表里加了新功能、这里没加页/没改字，静态体检就会红。 */
  const TUT_CONTENT_VER = 12;
  const TUT_FEATURES = [
    'overview', 'schedule', 'nowline', 'freeroom', 'homework', 'today', 'copyundone',
    'gpatarget', 'gradepull', 'mytodo', 'focus', 'focuslog', 'reminder_modes', 'hwremind', 'todoremind', 'calendar',
    'water', 'waterwatch',
    'elec', 'wiki', 'settings', 'theme', 'update', 'exportdata', 'privacy', 'start',
  ];

  /* ---------------- 内容 ----------------
   * icon 用单个汉字/符号，比引图标字体省 200KB，也不会因为字体缺失
   * 变成一个方块。since = 这一页最后一次因为功能变化而更新的版本。
   */
  const PAGES = [
    {
      icon: '懒', since: '2.16.0',
      ttl: '为什么做这个',
      body: [
        '我最开始做它，纯粹是懒。',
        '看课表开一个 App，看作业开一个，查空教室、看宿舍空调、接水还要再扫一次码。一天下来在这些软件之间切十几遍，每次都要重新登录、重新找入口。',
        '所以把这些事塞进了一个 App：课表、作业考试、空闲教室、宿舍空调、接水、待办和提醒。教务和学习通用自己的账号登录一次，之后打开就是自己的。',
        '进门时随手写个号码也能用，但那个号码不作数：只有真在教务网登录成功、学号被学校页面认过的，才会进使用名单。手填的号、乱填的号，一个都不会记进去。',
        '没有广告，没有「开通会员」，不收集你的成绩。',
      ],
      covers: ['overview', 'privacy'],
    },
    {
      icon: '课', since: '2.6.0',
      ttl: '课表：登录一次，一直有',
      body: [
        '点「登录教务」，在学校的官方页面上输入学号和密码。App 只负责把那个页面显示出来，不接触你的密码。',
        '登录成功后自动抓课表，之后每周自动跟学校同步一次。',
        '课表上面那条「现在」是三句话：正在上什么（几点下课）、下一节几点上、这一节哪几间教室还空着。它会自己走，不用点刷新；切到别的页就停，回来再接着走。',
        '「现在」那行下面的「查空教室」进的是教务的真实数据：选校区、教学楼、周次、时段，直接列出整段都空的教室，不是拿你自己的课表估的。课表上那行只显示当前这一节，要挑教室还是点按钮进去。',
        '上方箭头切周；开学日如果和学校对不上，到「我的 → 设置 → 课表与学期」把日期挪 7 天就行。',
        '课表上那个「成绩」按钮里，现在能直接「从教务读成绩」：用你刚登录的那份身份去读一次成绩页，读到什么就显示什么，读完默认还是盖着的，点「全部翻开」才看得见。',
        '读的时候会一条一条试青果的几个成绩页地址，每条试成没成、为什么不成，都写在面板上。全都读不到就把「复制诊断」发过来 —— 学校换一次地址，改一行就好，不用你再在电脑上跑脚本。',
        '文字等级（优秀、合格、不及格这类）原样留着，不换算成分数：换出来的绩点看着专业，其实是编的。想按自己的口径算，把它们改成数字再「导入成绩 JSON」。',
        '那个「成绩」按钮里还能算一笔账：填一个想达到的绩点、再填这学期还剩多少学分，它按已出的成绩反推剩下的课平均要考多少分。算不出来会直说追不上，不会给你一个好看但做不到的数字。',
      ],
      tip: '密码只在学校的页面上输入，App 和它的服务器都收不到。',
      covers: ['schedule', 'nowline', 'freeroom', 'settings', 'gpatarget', 'gradepull'],
    },
    {
      icon: '学', since: '2.14.0',
      ttl: '学习：作业、待办和专注',
      body: [
        '「学习」页最上面一行是「今日一行」：今天下一节什么课、几点上，和最近要交的那一件。不用点进任何地方，抬头看一眼就够了。',
        '旁边那个按钮能把没交完的作业和要考的试一次复制出来，粘到群里、发给同学、塞进备忘录都行。已经交掉的和已经过截止的不会混进去。',
        '「学习」页的主角是学习通作业和考试，按紧急度排好，状态是学习通自己写的：未交、待批阅、已批阅、已完成。读不到时显示「状态未知」，不会瞎猜成已完成。',
        '顶部三个小按钮是「我的待办」「专注计时」和「刷新」：待办纯本地存这台手机，番茄钟带白噪音，点开是半框，不占作业列表的地方。',
        '专注计时里有一排柱子，是最近 14 天每天坐下来学了多少分钟，下面一行写「最近 14 天专注 N 分钟 · M 天有记录」，连着两天以上还会写「连续 K 天」。今天还没开始不算断，昨天有就算连着。',
        '柱子的高矮是按你自己这 14 天里最长的那天算的，不是固定标准 —— 用得少也能看出哪天多一点。某天没学就是一根贴着底的细线，不是空白（空白会让人以为记录丢了）。专注记录只存在这台手机，最多留 90 天。',
        '「提醒」那张卡有三行：上课、作业截止、待办到期。上课那条按课表在课前响；作业截止那条盯的是截止时刻，考试盯的是开考时刻，提前量分开设（作业默认 12 小时、考试默认 6 小时，因为作业怕忘、考试怕起晚）。',
        '待办到期那条盯的是你自己在「我的待办」里写的日子：一条待办只写日期不写钟点，所以提醒落在那天早上 8 点（还来得及改计划的时段），提前量按天选。文案只说「今天到期」「明天到期」「N 天后到期」，不会编一个「还有 11 小时 32 分」的假精度。没写日子的、已经做完的、日子已经过了的都不提醒。',
        '已交的和已经过截止的不提醒，时间读不出来的那条也不提醒；已经进入提前量窗口的（比如剩 3 小时而提前量是 12 小时）会立刻补一条，不静默跳过。作业截止默认是关的，要自己去打开。',
        '上课提醒有三种方式：响铃、静默、短信草稿。不喜欢被闹钟吵，就选静默；短信那档只把内容写好，收件人和发送都由你自己点，App 不会自动发。',
        '设置里点「试一下当前方式」「试一下作业提醒」「试一下待办提醒」，当场就能比出哪档合意、通知长什么样，不用等下一节课。',
      ],
      tip: '密码只在学校的页面上输入，App 和它的服务器都收不到。',
      covers: ['homework', 'today', 'copyundone', 'mytodo', 'focus', 'focuslog', 'reminder_modes', 'hwremind', 'todoremind'],
    },
    {
      icon: '水', since: '2.1.0',
      ttl: '接水：不用再扫码',
      body: [
        '学校的直饮水机走「胖乖生活」。在「校园事务」页用手机号登录一次。',
        '之后在机器旁边点「接水」完成绑定和解锁，按一下饮水机上的按钮出水。手机上真正能做的只有解锁和停止，开阀必须人在机器边按 —— 这是胖乖的设计，App 不假装做得到。',
        '接够了自己点「停止」，或者直接按机器上的停止键。按完这边会自己查有没有真停：卡片上多一行「出水看护」，写着还在出水、已经停了、还是暂时读不到状态；读不到就说读不到，不会替你编一个「已停止」。',
        '以前那个「定量」放水已经撤了——平台在放水途中不给实时用量，做出来只会是个假的进度条。',
        '「结算」那一套也去掉了——充值、绑卡、付款都在官方 App 里，这边不碰钱。',
        '用量以平台账单为准，界面不谎称毫升。解锁偶发失败会自动重试绑定一次。',
      ],
      tip: '只有读、解锁和停止，不代办充值，也看不到支付密码。',
      covers: ['water', 'waterwatch', 'privacy'],
    },
    {
      icon: '园', since: '1.1.42',
      ttl: '校园：空调、WIKI、留言',
      body: [
        '「校园事务」页最上面是宿舍空调卡，选中一次房间后，剩余度数直接印在卡上，每 10 分钟自己刷一次；缴费跳官方完美校园，App 不做支付。',
        '「WIKI」这一页是学校资料：官方入口、招生办电话、附属医院、各种办事流程，都标了来源。',
        '「校园实景」是同学自己拍的照片，管理员审过才公开。你也可以传，会自动压到几百 KB，不费流量。',
        '下面还有留言板。想加功能、发现 bug、资料写错了，直接写一条，不用加 QQ 群。管理员回复后会显示出来。',
      ],
      covers: ['elec', 'wiki'],
    },
    {
      icon: '置', since: '2.13.0',
      ttl: '设置：外观、备份，和这台手机',
      body: [
        '「我的 → 设置」是独立一页，外观三档（跟随系统 / 浅色 / 深色）直接铺开，点一下立刻换，不用重启，也跟着手机的夜间模式走。',
        '课表与学期、备份与导出、检查更新、重新读取本地数据也都收在这一页。',
        '「数据与更新 → 备份与导出」能把这台手机上的东西带出去：待办、专注记录、成绩、饮水机清单、自己发的 WIKI，先看一句「可导出：3 条待办 · 12 天专注记录」再决定。存成文件会写到手机的「下载/河医大助手」里，Android 10 及以上不需要给任何存储权限；也可以直接复制成文本粘到别处。',
        '登录态和票据绝不进这份文件：学习通、知到、雨课堂的授权、教务账号、饮水机的 token、激活码，一样都不会写进去。换了手机要重新登一次。',
        '下面一行「导出到手机日历」把课表存成日历文件（.ics），跨十周的课会合并成一条「每周重复」，而不是十条日程；作业考试的截止点也一起带上，自带「提前 1 小时」提醒。',
        '时间写成浮动时间（不带时区名），导进手机日历后显示的就是本机时间；某一节的作息读不出、或这门课周次为空，那一条就不进日历，面板会写「有 N 条读不出时间」——不会拿 00:00 硬顶上去。',
        '「我的」页剩下的教程、使用帮助、使用声明、关于本软件是查资料的地方；管理员才看得见控制台。',
        '有新版本时 App 会提示并直接下载安装，安装包和发版说明都在官网与 GitHub 上。',
      ],
      covers: ['theme', 'settings', 'update', 'exportdata', 'calendar'],
    },
    {
      icon: '始', since: '2.16.0',
      ttl: '就这些，开始吧',
      body: [
        '下一步会让你登录教务（拿课表）和学习通（拿作业考试）。两个都可以先跳过，以后在「我的」和「学习」页随时能找到入口。',
        '提醒一句：进门时填的那个号码只是让你先进来看看，不算正式学号；去教务网登录成功一次之后，你的学号才会进使用名单。只填号不登录，名单里不会有你。',
        '饮水机、宿舍空调在「校园事务」页，需要时再登。',
        '遇到问题：「我的 → 关于 → 反馈问题」，会带上诊断信息，粘给我就能定位。也可以在 WIKI 的留言板写一条。',
        '这页教程会跟着功能一起更新；想重看，随时到「我的 → 使用教程」。',
      ],
      covers: ['start'],
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
    /* v1.1.42：strip 必须装进一层无 padding 的裁切容器。
     * 直接挂在 .tut-box 里，相邻页会露在卡片左右 padding 区（真机截图实证）。 */
    const view = document.createElement('div');
    view.className = 'tut-view';
    view.appendChild(strip);
    card.appendChild(view);

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
   * 只置一个标志再复用 show()，不要另写一套翻页回调 —— 原来覆盖
   * #tutNext / #tutSkip 的 onclick，导致重看一次后首次引导永远不 mark()。 */
  function replay() {
    replayMode = true;
    show();
  }

  let inited = false;

  function init() {
    /* app.js 底部会无条件 init 一次，随后 Gate.boot() 走 __onUnlocked
     * 又 init 一次。onclick 赋值重复无害，但 addEventListener 会真的
     * 叠成两份 —— 一次滑动翻两页。所有 init 都必须幂等。 */
    if (inited) return;
    inited = true;
    const box = $('tut');
    if (!box) return;
    let sx = 0, sy = 0, moved = false;
    /* 三处都要判 touches 空：多指按下再抬起、或手势中途被系统打断时，
     * touches / changedTouches 可能是空数组，直接取 [0].clientX 会抛
     * TypeError，而监听器里的异常不冒泡 —— 表现就是「滑不动了」。 */
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

  return {
    init, show, hide: finish, afterUnlock, replay, done,
    pages: PAGES, contentVer: TUT_CONTENT_VER, features: TUT_FEATURES,
  };
})();