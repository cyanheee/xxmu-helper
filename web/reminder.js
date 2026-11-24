/* 河医大助手 - 课程提醒（v1.1.41：响铃 / 静默 / 短信草稿 三选一）
 *
 * 数据来源：web/app.js 里 load() 之后全局的 DATA.courses / TIMES / START / TOTAL_WEEKS。
 * 触发时间 = 某节课「节次起点时间」往前推 N 分钟。
 * pref：xxmu_remind_on（开关）、xxmu_remind_mins（提前量）、xxmu_remind_mode（方式）。
 *
 * 用户原话：「还有课前提醒，不一定非要是闹钟，可以只设置一条短信，
 *   因为有的人不喜欢闹钟提醒」——所以提醒不该只有「会响」一种形态。
 *
 * 三档（mode）：
 *   alarm  响铃：heads-up + 声音，沿用旧 channel，老用户升级行为不变
 *   silent 静默：不响不震不弹，只在下拉通知栏安静出现
 *   sms    短信草稿：点通知拉起系统短信编辑页，正文写好，**收件人和发送都用户自己点**
 *   —— 不自动发短信、不申请 SEND_SMS、不读通讯录、不预填收件人。
 *   「App 只把话写好，最后一下永远是你点的」。
 *
 * 关键设计（与 Java 侧配合）：
 *   - 前端只算「未来每节课的绝对毫秒时间戳」，一次打包成 JSON 交给
 *     Host.scheduleReminders；真正的闹钟由 AlarmManager 挂。前端不每秒轮询。
 *   - 每一项都带 mode 一起落盘：重启后 ReminderScheduler.restore 重挂时
 *     才不会退回默认响铃（老列表缺 mode 字段时 Java 侧回落 alarm）。
 *   - 权限：Android 13+ 发通知要 POST_NOTIFICATIONS，首次开启时调
 *     Host.requestNotifyPermission()；canNotify() 查状态。
 *     静默/短信同样需要通知权限（它们是通知栏里的一条），别以为「不响就不用给」。
 *
 * 无法离线验证：通知到底弹不弹、Doze 下准不准、短信编辑页能不能拉起，只能在真机确认。
 */

const REMINDER = (() => {
  const KEY_ON = 'xxmu_remind_on';
  const KEY_MINS = 'xxmu_remind_mins';
  const KEY_MODE = 'xxmu_remind_mode';

  /* v2.2.0：作业截止 / 考试开考提醒（与课程提醒分开两个开关）
   *
   * 为什么不并进 KEY_ON：课程提醒是「天天都有」的，作业提醒是「这周有三门」的。
   * 有人只想课前响、不想被作业催；反过来只想被作业催、上课不想响的人也有。
   * 一个总开关会逼人二选一。
   *
   * 提前量单位是小时（课程是分钟）—— 作业截止提前 15 分钟通知已经没用了，
   * 那时人正在睡或者在上别的课；提前量给 3/6/12/24/48 小时才有决策价值。
   */
  const KEY_HW = 'xxmu_remind_hw';           // 作业提醒开关（'1' = 开）
  const KEY_HW_LEAD = 'xxmu_remind_hw_lead';    // 作业提前几小时
  const KEY_EXAM_LEAD = 'xxmu_remind_exam_lead';// 考试提前几小时
  const HW_LEADS = [3, 6, 12, 24, 48];
  const EXAM_LEADS = [1, 3, 6, 12, 24];

  /* v2.14.0：我的待办到期提醒（第三个开关，仍然单独一把）
   *
   * 为什么又要一把开关：待办是「我自己写的纸条」，作业是「平台派下来的」。
   * 有人只想知道自己记的事，不想被平台催；也有人反过来。与前两个开关同理，
   * 一个总开关会逼人二选一。
   *
   * 为什么提前量按「天」不按小时：待办只有一个日子（`2026-11-25`），
   * 没有钟点。说「提前 12 小时」等于要我们先编一个钟点出来 —— 编出来的
   * 那个钟点就是假精度。按天算，文案才敢写「明天到期」这种话。
   * 提醒时刻统一定在**当天早上 8 点**（减去提前的天数）：早上是一天里
   * 唯一还来得及改计划的时候，晚上提醒等于告诉人「今天就这样了」。
   */
  const KEY_TODO = 'xxmu_remind_todo';            // 待办提醒开关（'1' = 开）
  const KEY_TODO_LEAD = 'xxmu_remind_todo_lead';  // 提前几天
  const TODO_LEADS = [0, 1, 2];

  const MODES = ['alarm', 'silent', 'sms'];
  const MODE_LABEL = { alarm: '响铃提醒', silent: '静默提醒', sms: '短信草稿' };
  const MODE_HINT = {
    alarm: '到点弹通知并响铃，锁屏也能收到。这是原来的方式。',
    silent: '到点只在通知栏安静出现，不响、不震、不弹窗。适合上课不想被打扰的人。',
    sms: '到点给一条通知，点开拉起短信编辑页，内容已经写好；收件人和「发送」都由你自己点。App 不会自动发短信，也不读通讯录。'
  };

  let inited = false;

  function pref(k, def) {
    try {
      if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(k) || def;
    } catch (e) {}
    try { return localStorage.getItem(k) || def; } catch (e) {}
    return def;
  }
  function setPref(k, v) {
    try {
      if (typeof Host !== 'undefined' && Host.setPref) { Host.setPref(k, v); return; }
    } catch (e) {}
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function toast(m) {
    if (typeof XXMU !== 'undefined' && XXMU.toast) { XXMU.toast(m); return; }
    try { console.log('[reminder]', m); } catch (e) {}
  }

  function on() { return pref(KEY_ON, '') === '1'; }
  function mins() { const n = parseInt(pref(KEY_MINS, '15'), 10); return (n >= 0 && n <= 120) ? n : 15; }

  /* v2.2.0：作业 / 考试提醒的两个开关与两个提前量。
   * 开关默认关（老用户升级后行为完全不变：不多出一条从没开过的提醒）。
   * 提前量默认：作业 12 小时（早上看到、当天还来得及交）、考试 6 小时（还有半天）。 */
  function hwOn() { return pref(KEY_HW, '') === '1'; }
  function hwLead() {
    const n = parseInt(pref(KEY_HW_LEAD, '12'), 10);
    return HW_LEADS.indexOf(n) >= 0 ? n : 12;
  }
  function examLead() {
    const n = parseInt(pref(KEY_EXAM_LEAD, '6'), 10);
    return EXAM_LEADS.indexOf(n) >= 0 ? n : 6;
  }
  /* v2.14.0：待办提醒的开关与提前天数。默认关、默认提前 1 天。
   * 为什么默认不是 0（当天早上）：当天早上才提醒，等于没有提前量；
   * 提前一天让人有个晚上可以改计划。 */
  function todoOn() { return pref(KEY_TODO, '') === '1'; }
  function todoLead() {
    const n = parseInt(pref(KEY_TODO_LEAD, '1'), 10);
    return TODO_LEADS.indexOf(n) >= 0 ? n : 1;
  }
  /** 纯函数：脏值 / 空值一律回落 alarm，绝不因为 pref 坏了就把人变成静默。 */
  function mode(m) {
    const v = m === undefined ? pref(KEY_MODE, 'alarm') : m;
    return MODES.indexOf(v) >= 0 ? v : 'alarm';
  }

  /* 作息串 "08:00~08:45" → 当天这一节的 Date（只取 HH:MM） */
  function startTimeOf(periodIdx) {
    const s = (typeof TIMES !== 'undefined' && Array.isArray(TIMES)) ? TIMES[periodIdx] : '';
    const t = String(s || '').trim();
    if (!t) return null;
    const hhmm = t.split(/[~～\-—]/)[0].trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    return { h: parseInt(m[1], 10), min: parseInt(m[2], 10) };
  }

  /* day(1-7) + week 周 + 节次起点 → 绝对 Date。失败返回 null。 */
  function courseDate(course, periodIdx, week) {
    const st = startTimeOf(periodIdx);
    if (!st) return null;
    const base = new Date(START);
    base.setDate(base.getDate() + (week - 1) * 7 + (course.day - 1));
    base.setHours(st.h, st.min, 0, 0);
    return base;
  }

  /* v2.2.0：作业截止 / 考试开考提醒。
   *
   * 数据来源不是 DATA，而是 web/app.js 的 renderHomework() 挂在 window 上的
   * __HWITEMS —— 那份已经算好了 left / expired / notStart / status 的条目，
   * 口径与学习页看到的一模一样。在这里重算一遍会造成「列表说还剩 2 小时、
   * 通知说还剩 3 小时」这种自相矛盾。
   *
   * 三条不提醒（宁可不响，也不要在不该响的时候响）：
   *   ①已判完成（isDoneStatus）—— 交了就别再催，催是打扰
   *   ②已过截止（expired 或 left<0）—— 那时提醒已经没有任何用处
   *   ③时间读不出来（end/start 解析失败）—— 没有绝对时刻就挂不了闹钟
   *
   * 提前量按小时：截止前 12 小时提醒才有决策价值，提前 15 分钟人可能正在睡。
   * 提醒时刻 = 截止时刻 − 提前量；若这个时刻已经过去（离截止不到提前量了），
   * 就退成「现在 + 30 秒」立刻提醒一次 —— 剩下 3 小时的东西也该被看见。
   */
  function buildHw() {
    const out = [];
    const items = (typeof window !== 'undefined' && Array.isArray(window.__HWITEMS))
      ? window.__HWITEMS : [];
    const now = Date.now();
    const md = mode();
    const wLead = hwLead() * 3600000;
    const eLead = examLead() * 3600000;
    /* 已经过去不到这个时长的，仍然值得立刻提醒一次；超过就算过期不响。 */
    const GRACE = 30 * 1000;

    items.forEach(x => {
      if (!x) return;
      if (x.expired === true) return;
      if (x.left != null && x.left < 0) return;
      if (typeof isDoneStatus === 'function' && isDoneStatus(x.status)) return;
      const raw = x.raw || {};
      const exam = x.kind === 'exam';
      /* 考试提醒盯「开考时刻」，作业提醒盯「截止时刻」。考试开考时间读不到时
       * 退回结束时间 —— 迟到发现总比一直不知道强，但文案会写清是截止。 */
      const src = exam ? (raw.start || raw.end) : raw.end;
      if (!src) return;
      let dueMs = NaN;
      try { dueMs = new Date(String(src).replace(/-/g, '/')).getTime(); } catch (e) {}
      if (!(dueMs > 0)) return;
      let at = dueMs - (exam ? eLead : wLead);
      if (at <= now) {
        /* 已经进入提前量窗口：只在「还没到点」或「刚过点不到 grace」时补一条 */
        if (dueMs + GRACE <= now) return;
        at = now + GRACE;
      }
      out.push({
        at,
        name: x.name || '',
        room: x.course || '',
        mins: Math.max(1, Math.round((dueMs - at) / 60000)),
        mode: md,
        kind: exam ? 'exam' : 'hw',
        due: dueMs,
      });
    });
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /* v2.14.0：把「我的待办」里写了日子的条目也变成提醒。
   *
   * 为什么以前没有：待办是 v1.1.60 加的本地功能，它自己有 due 字段、
   * 有自己的排序和「昨天（已过）」着色，但从头到尾没接过提醒系统 ——
   * MYTODO 里 grep 不到 REMINDER 一个字。用户记了「周三前交实验报告」，
   * 到那天早上手机不会吭声，只有他自己想起来才会打开看。
   *
   * 三条口径：
   *   ①只认写了日子的（x.due = 'YYYY-MM-DD'）。没写日子的待办没有「到期」
   *     这回事，催它就是凭空造一条 deadline。
   *   ②已完成的不催；已经过期的不催（过期了再提醒只会让人烦）。
   *   ③提醒时刻 = 那一天早上 8 点，往前推 N 天。早上 8 点是还来得及改计划
   *     的时刻；晚上提醒等于说「今天就这样了」。
   *
   * 不写「还剩几小时」：待办只有一个日子，没有钟点。硬算小时就得先编一个
   * 钟点出来，那是假精度。文案交给 Java 侧按「日历差几天」说
   * （今天/明天/N 天后到期），这条口径在 Receiver 里。
   */
  function buildTodo() {
    const out = [];
    if (typeof MYTODO === 'undefined' || !MYTODO || typeof MYTODO.list !== 'function') return out;
    let arr = [];
    try { arr = MYTODO.list() || []; } catch (e) { return out; }
    const now = Date.now();
    const md = mode();
    const lead = todoLead();
    const GRACE = 30 * 1000;
    arr.forEach(x => {
      if (!x || x.done) return;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x.due || ''));
      if (!m) return;
      const day0 = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      if (!(day0 > 0)) return;
      /* 截止时刻取这一天结束（23:59）。待办只写日子不写钟点，
       * 「这一天之内做完都算数」是唯一不编造的理解。 */
      const dueMs = day0 + 24 * 3600000 - 60000;
      if (dueMs + GRACE <= now) return;
      let at = day0 + 8 * 3600000 - lead * 86400000;
      if (at <= now) {
        if (dueMs + GRACE <= now) return;
        at = now + GRACE;   /* 已经进了提前窗口：立刻补一条 */
      }
      out.push({
        at,
        name: x.text || '',
        room: '',
        mins: Math.max(1, Math.round((dueMs - at) / 60000)),
        mode: md,
        kind: 'todo',
        due: dueMs,
      });
    });
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /* 遍历课表，产出 [{at,name,room,mins,mode}]，只留未来时间。
   * mode 必须逐项带着：Java 侧会原样落盘，重启重挂时按它重建 PendingIntent。
   *
   * v1.1.78 连堂去重：同一门课同一天可能连着上好几节（periods:[1,2,3]），
   * 以前对每一节都挂一条提醒，三节课就响三次。用户原话「同一门课只提醒一次」。
   * 现在按「一门课 × 一周」只取当天最早那一节，在它前面 N 分钟提醒一次。
   * 顺带把 200 条上限里被连堂重复项占掉的名额省出来（学期后半段不再被吃光）。 */
  function build() {
    const out = [];
    const courses = (typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.courses)) ? DATA.courses : [];
    const now = Date.now();
    const m = mins();
    const md = mode();
    courses.forEach(c => {
      const weeks = Array.isArray(c.weeks) ? c.weeks : [];
      const periods = Array.isArray(c.periods) ? c.periods : [];
      weeks.forEach(w => {
        if (!(w >= 1 && w <= (typeof TOTAL_WEEKS !== 'undefined' ? TOTAL_WEEKS : 21))) return;
        let at = null;
        periods.forEach(pRaw => {
          const p = parseInt(pRaw, 10);
          if (!(p >= 1)) return;
          const d = courseDate(c, p - 1, w);
          if (!d) return;
          const t = d.getTime() - m * 60000;
          if (at === null || t < at) at = t;   // 连堂只留最早一节
        });
        if (at === null || at <= now) return;
        /* v2.2.0：kind/due 一起带上 —— Java 侧靠 kind 决定通知文案说
         * 「N 分钟后上课」还是「N 小时后截止」，靠 due 算出真正的剩余时长
         * （mins 在作业那条里是「从提醒时刻到截止的分钟数」，语义与课程不同）。 */
        out.push({
          at, name: c.name || '', room: c.room || '', mins: m, mode: md,
          kind: 'class', due: at + m * 60000,
        });
      });
    });
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /* 课程的 + 作业/考试的 + 我的待办 合成一份交给 Java。
   * 顺序：先按时间排，这样 200 条上限砍掉的永远是「最远的那几条」，
   * 不会出现「作业提醒把明天的课挤掉」或者反过来。 */
  function buildAll() {
    const a = on() ? build() : [];
    const b = hwOn() ? buildHw() : [];
    const c = todoOn() ? buildTodo() : [];
    const all = a.concat(b, c);
    all.sort((x, y) => x.at - y.at);
    return all;
  }

  /* 把提醒挂到 Java 侧（先清空再重挂）
   * quiet=true 时不弹 toast：每次 load() 都会调一次 refresh，若每次都弹
   * 「已设置 N 个」，下拉刷新一次弹一次，会让人以为哪里在反复设置。 */
  function apply(quiet) {
    if (typeof Host === 'undefined' || !Host.scheduleReminders) return 0;
    try { Host.cancelReminders(); } catch (e) {}
    const list = buildAll();
    if (!list.length) return 0;
    let n = 0;
    try {
      n = Host.scheduleReminders(JSON.stringify(list.slice(0, 200)));
      if (n > 0 && !quiet) {
        const nc = list.filter(x => x.kind === 'class' || !x.kind).length;
        const nt = list.filter(x => x.kind === 'todo').length;
        const nh = list.length - nc - nt;
        /* v2.14.0：三个开关都开时三个分量都报；只开一部分时不写成
         * 「（课程 3 · 作业 0）」这种带零的括号 —— 零分量没信息量。 */
        const parts = [];
        if (on()) parts.push('课程 ' + nc);
        if (hwOn()) parts.push('作业 ' + nh);
        if (todoOn()) parts.push('待办 ' + nt);
        toast('已设置 ' + n + ' 个提醒' + (parts.length ? '（' + parts.join(' · ') + '）' : ''));
      }
    } catch (e) {}
    return n;
  }

  /* ---------------- 设置面板（#sheet 半框） ---------------- */

  /** 生成三档方式按钮。抽成函数，设置面板与未来别处共用同一套 DOM。 */
  function buildModes(onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'rm-modes';
    const opts = [];
    MODES.forEach(m => {
      const b = document.createElement('button');
      b.className = 'btn ghost rm-mode';
      b.setAttribute('data-mode', m);
      const t = document.createElement('span');
      t.textContent = MODE_LABEL[m];
      b.appendChild(t);
      const tick = document.createElement('span');
      tick.className = 'rm-mode-tick';
      b.appendChild(tick);
      b.onclick = () => {
        setPref(KEY_MODE, m);
        paintModes(opts, MODE_LABEL, hint);
        apply();
        paint();
        if (onPick) onPick(m);
      };
      opts.push({ m, btn: b, tick });
      wrap.appendChild(b);
    });
    const hint = document.createElement('div');
    hint.className = 'hint left rm-mode-hint';
    return { wrap, opts, hint, repaint: () => paintModes(opts, MODE_LABEL, hint) };
  }

  function paintModes(opts, labels, hint) {
    const now = mode();
    opts.forEach(o => {
      if (o.m === now) o.btn.classList.add('on');
      else o.btn.classList.remove('on');
      o.tick.textContent = o.m === now ? '✓' : '';
    });
    if (hint) hint.textContent = MODE_HINT[now];
  }

  function openSettings() {
    const body = document.getElementById('sh-body');
    const name = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    if (typeof parkTools === 'function') parkTools();
    /* v2.2.0：标题从「课程提醒」改成「提醒」—— 这个面板现在同时管上课和
     * 作业截止两件事，还挂「课程提醒」四个字会让只来开作业提醒的人以为走错门。 */
    if (name) name.textContent = '提醒';
    body.innerHTML = '';

    const row1 = document.createElement('div');
    row1.className = 'rm-row';
    const lab = document.createElement('label');
    lab.className = 'rm-row-label';
    lab.textContent = '课前提醒';
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.className = 'rm-switch';
    sw.checked = on();
    lab.appendChild(sw);
    row1.appendChild(lab);
    body.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'rm-row';
    const lab2 = document.createElement('label');
    lab2.className = 'rm-row-label';
    lab2.textContent = '提前';
    const sel = document.createElement('select');
    sel.className = 'rm-sel';
    [0, 5, 10, 15, 20, 30].forEach(v => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = v === 0 ? '不提前（上课时）' : v + ' 分钟';
      if (v === mins()) o.selected = true;
      sel.appendChild(o);
    });
    lab2.appendChild(sel);
    row2.appendChild(lab2);
    body.appendChild(row2);

    /* v1.1.41：方式三档 */
    const row3 = document.createElement('div');
    row3.className = 'rm-mode-row';
    const cap = document.createElement('div');
    cap.className = 'card-title';
    cap.textContent = '提醒方式';
    row3.appendChild(cap);
    const built = buildModes(null);
    row3.appendChild(built.wrap);
    row3.appendChild(built.hint);
    body.appendChild(row3);
    built.repaint();

    /* v2.2.0：作业截止 / 考试开考提醒（同一个面板里分区，不另开页面）
     *
     * 为什么放在这里而不是学习页：用户来这个面板就是为了「安排提醒」，
     * 学习页要专心给人看「还有什么要做」。两处各摆一半开关，人会找不到。
     *
     * 一行一个开关，下面两个下拉共用一条说明 —— 提前量对作业和考试不一样
     * 是刻意的：作业怕的是「忘了交」，考试怕的是「起晚了」，前者要半天，
     * 后者要几小时。 */
    const hwRow = document.createElement('div');
    hwRow.className = 'rm-row';
    const hwLab = document.createElement('label');
    hwLab.className = 'rm-row-label';
    hwLab.textContent = '作业截止提醒';
    const hwSw = document.createElement('input');
    hwSw.type = 'checkbox';
    hwSw.className = 'rm-switch';
    hwSw.id = 'rmHwSw';
    hwSw.checked = hwOn();
    hwLab.appendChild(hwSw);
    hwRow.appendChild(hwLab);
    body.appendChild(hwRow);

    const leadBox = document.createElement('div');
    leadBox.className = 'rm-row';
    leadBox.id = 'rmHwLeadRow';
    const leadLab = document.createElement('label');
    leadLab.className = 'rm-row-label';
    leadLab.textContent = '截止前';
    const hwSel = document.createElement('select');
    hwSel.className = 'rm-sel';
    hwSel.id = 'rmHwLead';
    HW_LEADS.forEach(v => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = v + ' 小时';
      if (v === hwLead()) o.selected = true;
      hwSel.appendChild(o);
    });
    leadLab.appendChild(hwSel);
    leadBox.appendChild(leadLab);
    body.appendChild(leadBox);

    const examBox = document.createElement('div');
    examBox.className = 'rm-row';
    examBox.id = 'rmExamLeadRow';
    const examLab = document.createElement('label');
    examLab.className = 'rm-row-label';
    examLab.textContent = '考试开考前';
    const examSel = document.createElement('select');
    examSel.className = 'rm-sel';
    examSel.id = 'rmExamLead';
    EXAM_LEADS.forEach(v => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = v + ' 小时';
      if (v === examLead()) o.selected = true;
      examSel.appendChild(o);
    });
    examLab.appendChild(examSel);
    examBox.appendChild(examLab);
    body.appendChild(examBox);

    const hwHint = document.createElement('div');
    /* v2.14.0：与下面待办那条一致 —— 这是两行长句，'.hint' 的居中会把它们折成
     * 一首诗的样子。v2.2.0 写的时候没注意，这一轮拍图才看出来。 */
    hwHint.className = 'hint left';
    hwHint.id = 'rmHwHint';
    body.appendChild(hwHint);

    /* 「试一下作业提醒」：和课程那条「试一下当前方式」并列。
     * 作业/考试通知的文案跟课程完全不同（「还有 11 小时 32 分截止」
     * 而不是「15 分钟后上课」），不给试一次，用户根本没法判断这个开关
     * 打开后手机到底会说什么 —— 而提醒这种功能，只有真看到过才敢开。 */
    const hwTry = document.createElement('button');
    hwTry.className = 'btn soft';
    hwTry.id = 'rmHwPreview';
    hwTry.textContent = '试一下作业提醒';
    hwTry.onclick = () => previewTask('hw');
    body.appendChild(hwTry);

    /* v2.14.0：我的待办到期提醒（第三个分区）
     *
     * 和前两块并列，不并进「作业截止」里 —— 待办是自己写的纸条，作业是
     * 平台派的，两件事在心里是分开的；合在一起开关一关就一起没了。
     *
     * 只给「提前几天」三档，不给钟点：待办本来就只有日子没有钟点，
     * 给个「提前 12 小时」的下拉等于假装它有精度。
     */
    const todoRow = document.createElement('div');
    todoRow.className = 'rm-row';
    const todoLab = document.createElement('label');
    todoLab.className = 'rm-row-label';
    todoLab.textContent = '待办到期提醒';
    const todoSw = document.createElement('input');
    todoSw.type = 'checkbox';
    todoSw.className = 'rm-switch';
    todoSw.id = 'rmTodoSw';
    todoSw.checked = todoOn();
    todoLab.appendChild(todoSw);
    todoRow.appendChild(todoLab);
    body.appendChild(todoRow);

    const todoLeadBox = document.createElement('div');
    todoLeadBox.className = 'rm-row';
    todoLeadBox.id = 'rmTodoLeadRow';
    const todoLeadLab = document.createElement('label');
    todoLeadLab.className = 'rm-row-label';
    todoLeadLab.textContent = '提前';
    const todoSel = document.createElement('select');
    todoSel.className = 'rm-sel';
    todoSel.id = 'rmTodoLead';
    TODO_LEADS.forEach(v => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = v === 0 ? '当天早上' : v + ' 天';
      if (v === todoLead()) o.selected = true;
      todoSel.appendChild(o);
    });
    todoLeadLab.appendChild(todoSel);
    todoLeadBox.appendChild(todoLeadLab);
    body.appendChild(todoLeadBox);

    const todoHint = document.createElement('div');
    /* v2.14.0：两行长句。'.hint' 默认 text-align:center，长句居中折行读起来像诗
     * （v2.13.0 在日历面板上已经踩过一次），这里从一开始就用 left。 */
    todoHint.className = 'hint left';
    todoHint.id = 'rmTodoHint';
    body.appendChild(todoHint);

    const todoTry = document.createElement('button');
    todoTry.className = 'btn soft';
    todoTry.id = 'rmTodoPreview';
    todoTry.textContent = '试一下待办提醒';
    todoTry.onclick = () => previewTask('todo');
    body.appendChild(todoTry);

    function paintTodoRows() {
      const onNow = todoSw.checked;
      todoLeadBox.style.opacity = onNow ? '' : '.45';
      todoSel.disabled = !onNow;
      let n = 0;
      try {
        if (typeof MYTODO !== 'undefined' && MYTODO && typeof MYTODO.list === 'function') {
          const now = Date.now();
          n = (MYTODO.list() || []).filter(x => x && !x.done
            && /^(\d{4})-(\d{2})-(\d{2})$/.test(String(x.due || ''))
            && new Date(String(x.due) + 'T23:59:00').getTime() >= now).length;
        }
      } catch (e) { n = 0; }
      todoHint.textContent = onNow
        ? ('现在有 ' + n + ' 条写了日子、还没做完的待办会按上面的时间提醒，'
          + '提醒在早上 8 点响。没写日子的、已经做完的、日子已经过了的都不提醒。')
        : '开启后，你自己记的待办到了那天早上会来一条通知。';
    }
    paintTodoRows();

    todoSw.onchange = () => {
      setPref(KEY_TODO, todoSw.checked ? '1' : '');
      if (todoSw.checked) ensurePerm();
      paintTodoRows();
      apply();
      paint();
    };
    todoSel.onchange = () => {
      setPref(KEY_TODO_LEAD, todoSel.value);
      paintTodoRows();
      apply();
      paint();
    };

    /* 提前量两行只在开关打开时才显得有用；关着的时候置灰，
     * 但仍留在原位（忽然出现/消失的选项比灰掉更让人迷惑）。 */
    function paintHwRows() {
      const onNow = hwSw.checked;
      [leadBox, examBox].forEach(el => {
        el.style.opacity = onNow ? '' : '.45';
        el.querySelectorAll('select').forEach(s => { s.disabled = !onNow; });
      });
      const n = (typeof window !== 'undefined' && Array.isArray(window.__HWITEMS))
        ? window.__HWITEMS.filter(x => x && !x.expired
          && x.left != null && x.left >= 0
          && !(typeof isDoneStatus === 'function' && isDoneStatus(x.status))).length
        : 0;
      hwHint.textContent = onNow
        ? ('现在有 ' + n + ' 件还没做完的作业/考试会按上面的时间提醒。'
          + '已交的和已过截止的不提醒；读不到时间的那条也不提醒。')
        : '开启后，作业快到截止、考试快到开考时会各来一条通知。';
    }
    paintHwRows();

    hwSw.onchange = () => {
      setPref(KEY_HW, hwSw.checked ? '1' : '');
      if (hwSw.checked) ensurePerm();
      paintHwRows();
      apply();
      paint();
    };
    hwSel.onchange = () => {
      setPref(KEY_HW_LEAD, hwSel.value);
      paintHwRows();
      apply();
      paint();
    };
    examSel.onchange = () => {
      setPref(KEY_EXAM_LEAD, examSel.value);
      paintHwRows();
      apply();
      paint();
    };

    /* 「试一下」：不挂闹钟，当场出一条当前方式的提醒（或拉起短信编辑页）。
     * 没有这个按钮，用户只能改手机时间等下一节课，根本比不出哪档合意。 */
    const tryBtn = document.createElement('button');
    tryBtn.className = 'btn soft';
    tryBtn.id = 'rmPreview';
    tryBtn.textContent = '试一下当前方式';
    tryBtn.onclick = () => preview();
    body.appendChild(tryBtn);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '由系统闹钟触发，锁屏也能收到（首次需允许通知权限）';
    body.appendChild(hint);

    /* 精确闹钟被系统关掉时给一句实话 + 一个出口。 */
    let canExact = true;
    try { if (typeof Host !== 'undefined' && Host.exactAlarmOk) canExact = Host.exactAlarmOk(); } catch (e) {}
    if (on() && !canExact) {
      const warn = document.createElement('div');
      warn.className = 'hint rm-warn';
      warn.textContent = '系统的「闹钟和提醒」权限被关掉了，提醒可能晚几分钟。';
      const fix = document.createElement('button');
      fix.className = 'btn soft';
      fix.textContent = '去打开';
      fix.onclick = () => {
        try { if (typeof Host !== 'undefined' && Host.openExactAlarmSettings) Host.openExactAlarmSettings(); } catch (e) {}
      };
      body.appendChild(warn);
      body.appendChild(fix);
    }

    sw.onchange = () => {
      setPref(KEY_ON, sw.checked ? '1' : '');
      if (sw.checked) ensurePerm();
      apply();
      paint();
    };
    sel.onchange = () => {
      setPref(KEY_MINS, sel.value);
      apply();
      paint();
    };

    sheet.classList.add('on');
  }

  /** 「试一下」：短信档直接开系统短信编辑页，其余出一条通知。 */
  function preview() {
    const m = mode();
    const mm = mins();
    if (m === 'sms') {
      try { if (typeof Host !== 'undefined' && Host.openSmsDraft) Host.openSmsDraft('高等数学（示例）', 'A101', mm); }
      catch (e) {}
      return;
    }
    try {
      if (typeof Host !== 'undefined' && Host.previewReminder) {
        Host.previewReminder(m, '高等数学（示例）', 'A101', mm);
      }
    } catch (e) {}
  }

  /** 「试一下作业/考试提醒」：直接出一条该 kind 的通知（走默认响铃档）。
   *
   * 为什么固定 alarm 而不跟随「提醒方式」：这个按钮要回答的是
   * 「作业提醒长什么样」，不是「我现在选的是哪一档」。跟着 mode 走的话，
   * 选了静默的人点一下只会看到通知栏里多一行，反而以为按钮坏了。
   * 想验静默/短信，用上面那个「试一下当前方式」。 */
  function previewTask(kind) {
    /* v2.14.0：三种 kind 都要能试。待办的示例文案跟前两种不一样
     * （「『买实验报告本』明天到期」），不看一眼很难判断打开后是什么样。 */
    const k = kind === 'exam' ? 'exam' : (kind === 'todo' ? 'todo' : 'hw');
    try {
      if (typeof Host !== 'undefined' && Host.previewTaskReminder) {
        Host.previewTaskReminder(k, '', '');
        return;
      }
    } catch (e) {}
    /* 没有 Host（浏览器里预览）也要有反馈，否则点了像没反应 */
    toast('这里只能看文案，真正的通知要在手机上试');
  }

  function ensurePerm() {
    if (typeof Host === 'undefined') return;
    try {
      if (Host.canNotify && !Host.canNotify()) {
        if (Host.requestNotifyPermission) Host.requestNotifyPermission();
      }
    } catch (e) {}
  }

  window.__onNotifyPerm = function (granted) {
    try {
      if (!granted) toast('没给通知权限，课程提醒不会弹出');
      else apply(true);
      paint();
    } catch (e) {}
  };

  function paint() {
    const st = document.getElementById('remindStat');
    const hst = document.getElementById('remindHwStat');
    const tst = document.getElementById('remindTodoStat');
    /* v2.2.0：两行分开说。以前只有一行「状态」，两个开关共用一个读数的话，
     * 只开作业提醒的人会看到「未开启」—— 那是课程那栏的答案，不是他的。
     * 现在的口径：上课那行只说课程，作业那行只说作业/考试。
     * v2.14.0：待办那行同理，只说待办。 */
    const permOkOf = function () {
      try { if (typeof Host !== 'undefined' && Host.canNotify) return !!Host.canNotify(); } catch (e) {}
      return true;
    };
    if (st) {
      if (!on()) st.textContent = '未开启';
      else st.textContent = permOkOf()
        ? (MODE_LABEL[mode()] + ' · 提前 ' + mins() + ' 分钟')
        : '待授权通知';
    }
    if (hst) {
      if (!hwOn()) hst.textContent = '未开启';
      else hst.textContent = permOkOf()
        ? ('截止前 ' + hwLead() + ' 小时 · 考前 ' + examLead() + ' 小时')
        : '待授权通知';
    }
    if (tst) {
      if (!todoOn()) tst.textContent = '未开启';
      else tst.textContent = permOkOf()
        ? (todoLead() === 0 ? '当天早上 8 点' : ('提前 ' + todoLead() + ' 天 · 早上 8 点'))
        : '待授权通知';
    }
  }

  function init() {
    if (inited) return;
    inited = true;
    const btn = document.getElementById('remindSet');
    if (btn) btn.onclick = openSettings;
    paint();
    if (on() || hwOn() || todoOn()) ensurePerm();
  }

  /* 课表 / 作业加载完成后由 app.js 调用，真正把提醒挂上。
   * quiet = 后台重挂不弹 toast。
   *
   * v2.2.0：作业提醒用的是 window.__HWITEMS，而它由 renderHomework() 挂上。
   * 现在 renderHomework() 末尾和 load() 末尾都会喊一次 refresh()（前者为了
   * 后台自动刷新也能重挂、后者照顾只改课表的路径），一次加载就会连喊两声。
   * apply() 是「先 cancel 再挂」，重复跑结果正确但要多做一遍 200 次
   * PendingIntent 操作 —— 冷启动时这一点能感觉到。所以这里合流：
   * 同一个 tick 里的多次调用只真正执行一次。 */
  let refreshTimer = null;
  function refresh() {
    paint();
    if (refreshTimer) return;
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      apply(true);
    }, 0);
  }

  return {
    init, refresh, openSettings, build, buildAll, buildHw, buildTodo,
    mode, MODES, MODE_LABEL, MODE_HINT, preview,
    hwOn, hwLead, examLead, HW_LEADS, EXAM_LEADS,
    todoOn, todoLead, TODO_LEADS,
  };
})();
