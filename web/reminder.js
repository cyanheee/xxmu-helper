/* 河医大助手 - 课程提醒（课前 N 分钟本地通知）
 *
 * 数据来源：web/app.js 里 load() 之后全局的 DATA.courses / TIMES / START / TOTAL_WEEKS。
 * 这里不再自己读一遍课表，而是读 app.js 已经算好的那几个全局量：
 *   - DATA.courses：[{ name, teacher, room, day(1-7), weeks:[...], periods:[...] }]
 *   - TIMES：作息串数组，第 N 节 = TIMES[N-1]（如 "08:00~08:45"）
 *   - START：开学日（第 1 周周一）的 Date
 *   - TOTAL_WEEKS：总周数
 *
 * 提醒的触发时间 = 某节课「节次起点时间」往前推 N 分钟。
 * 提前量 N 存在 pref 'xxmu_remind_mins'，默认 15 分钟；开关存 'xxmu_remind_on'。
 *
 * 关键设计（与 Java 侧配合）：
 *   - 前端只负责「算出未来每节课的绝对毫秒时间戳」，一次打包成 JSON
 *     传给 Host.scheduleReminders；真正的闹钟由 AlarmManager 挂，
 *     到点后 ReminderReceiver 发通知。前端不做每秒轮询。
 *   - 权限：Android 13+ 发通知要 POST_NOTIFICATIONS，首次开启时调
 *     Host.requestNotifyPermission() 弹系统框；canNotify() 查状态。
 *
 * 无法离线验证：通知是否真弹、Doze 下是否准时，只能在真机上确认。
 */

const REMINDER = (() => {
  const KEY_ON = 'xxmu_remind_on';
  const KEY_MINS = 'xxmu_remind_mins';

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
    // mondayOf 用 START（第 1 周周一）算第 week 周的周一
    const base = new Date(START);
    base.setDate(base.getDate() + (week - 1) * 7 + (course.day - 1));
    base.setHours(st.h, st.min, 0, 0);
    return base;
  }

  /* 遍历课表，产出 [{at,name,room,mins}]，只留未来时间 */
  function build() {
    const out = [];
    const courses = (typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.courses)) ? DATA.courses : [];
    const now = Date.now();
    const m = mins();
    courses.forEach(c => {
      const weeks = Array.isArray(c.weeks) ? c.weeks : [];
      const periods = Array.isArray(c.periods) ? c.periods : [];
      periods.forEach(pRaw => {
        const p = parseInt(pRaw, 10);
        if (!(p >= 1)) return;
        const pIdx = p - 1; // TIMES 数组下标
        weeks.forEach(w => {
          if (!(w >= 1 && w <= (typeof TOTAL_WEEKS !== 'undefined' ? TOTAL_WEEKS : 21))) return;
          const d = courseDate(c, pIdx, w);
          if (!d) return;
          const at = d.getTime() - m * 60000;
          if (at <= now) return;
          out.push({ at, name: c.name || '', room: c.room || '', mins: m });
        });
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
      // Java 侧最多挂 200 条（按时间升序取最近的），够覆盖三周左右；
      // App 每次打开都会重挂，学生日常用不会有缺口。
      n = Host.scheduleReminders(JSON.stringify(list.slice(0, 200)));
      if (n > 0 && !quiet) toast('已设置 ' + n + ' 个课程提醒');
    } catch (e) {}
    return n;
  }

  /* 设置面板：开关 + 提前分钟数（写 #sheet 半框） */
  function openSettings() {
    const body = document.getElementById('sh-body');
    const name = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    // v1.1.29：若待办/番茄钟卡还住在半框里，先请回停车场，避免和设置表单叠着
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

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '提醒由系统闹钟触发，锁屏也能收到（首次需允许通知权限）';
    body.appendChild(hint);

    /* 精确闹钟被系统关掉时给一句实话 + 一个出口。
     * 不写这句的话，用户看到的是「到点晚了十分钟」，只会认定功能不准；
     * 而真实原因是 Android 12+ 把「闹钟和提醒」做成了可撤销的特殊权限。 */
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
      paint();          // v1.1.29：开关切换后要刷新入口行状态，否则外面还显示「未开启」
    };
    sel.onchange = () => {
      setPref(KEY_MINS, sel.value);
      apply();
      paint();          // 提前量变了，入口行「提前 N 分钟」也要跟着变
    };

    sheet.classList.add('on');
  }

  function ensurePerm() {
    if (typeof Host === 'undefined') return;
    try {
      if (Host.canNotify && !Host.canNotify()) {
        if (Host.requestNotifyPermission) Host.requestNotifyPermission();
      }
    } catch (e) {}
  }

  /* Java 侧 onRequestPermissionsResult 回调进来（window.__onNotifyPerm）。
   * 用户点「允许」之后要把闹钟重挂一遍：之前那次 apply 是在权限还没拿到时做的，
   * 通知虽已挂上、但发不出去，重挂不改时间只保证链路是通的；更重要的是让设置页
   * 的状态反映真实结果，而不是永远显示「已开启」。 */
  window.__onNotifyPerm = function (granted) {
    try {
      if (!granted) {
        toast('没给通知权限，课程提醒不会弹出');
      } else {
        apply(true);
      }
      paint();
    } catch (e) {}
  };

  function paint() {
    // 学习页的提醒入口行，显示当前状态（开关/提前量）
    const st = document.getElementById('remindStat');
    if (!st) return;
    if (!on()) { st.textContent = '未开启'; return; }
    // 开了但没给通知权限：显示成「已开·待授权」，比一个会骗人的「提前 15 分钟」诚实
    let permOk = true;
    try { if (typeof Host !== 'undefined' && Host.canNotify) permOk = !!Host.canNotify(); } catch (e) {}
    st.textContent = permOk ? ('提前 ' + mins() + ' 分钟') : '待授权通知';
  }

  function init() {
    if (inited) return;
    inited = true;

    // 设置按钮
    const btn = document.getElementById('remindSet');
    if (btn) btn.onclick = openSettings;

    paint();
    // 页面启动即按当前设置挂一次（课表若还没 load 完，DATA 是空的，会挂 0 条；
    // load() 完成后 app.js 会再调 refresh，那时才真正挂上）
    if (on()) ensurePerm();
  }

  /* 课表加载完成后由 app.js 调用，真正把提醒挂上。
   * quiet：这里是后台重挂（每次刷新都走一遍），不该弹 toast。 */
  function refresh() {
    paint();
    apply(true);
  }

  return { init, refresh, openSettings, build };
})();
