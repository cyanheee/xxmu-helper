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
        out.push({ at, name: c.name || '', room: c.room || '', mins: m, mode: md });
      });
    });
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /* 把提醒挂到 Java 侧（先清空再重挂）
   * quiet=true 时不弹 toast：每次 load() 都会调一次 refresh，若每次都弹
   * 「已设置 N 个」，下拉刷新一次弹一次，会让人以为哪里在反复设置。 */
  function apply(quiet) {
    if (typeof Host === 'undefined' || !Host.scheduleReminders) return 0;
    try { Host.cancelReminders(); } catch (e) {}
    if (!on()) return 0;
    const list = build();
    if (!list.length) return 0;
    let n = 0;
    try {
      n = Host.scheduleReminders(JSON.stringify(list.slice(0, 200)));
      if (n > 0 && !quiet) toast('已设置 ' + n + ' 个' + MODE_LABEL[mode()] + '提醒');
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
    if (name) name.textContent = '课程提醒';
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
    if (!st) return;
    if (!on()) { st.textContent = '未开启'; return; }
    let permOk = true;
    try { if (typeof Host !== 'undefined' && Host.canNotify) permOk = !!Host.canNotify(); } catch (e) {}
    st.textContent = permOk ? (MODE_LABEL[mode()] + ' · 提前 ' + mins() + ' 分钟') : '待授权通知';
  }

  function init() {
    if (inited) return;
    inited = true;
    const btn = document.getElementById('remindSet');
    if (btn) btn.onclick = openSettings;
    paint();
    if (on()) ensurePerm();
  }

  /* 课表加载完成后由 app.js 调用，真正把提醒挂上。quiet = 后台重挂不弹 toast。 */
  function refresh() {
    paint();
    apply(true);
  }

  return { init, refresh, openSettings, build, mode, MODES, MODE_LABEL, MODE_HINT, preview };
})();
