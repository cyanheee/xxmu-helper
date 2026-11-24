/* ============================================================
 * ics.js —— 把课表和截止时间导出成日历文件（.ics）
 *
 * 为什么做这个（v2.13.0）：
 *   课表在 App 里能看到，但换到手机自带日历 / 电脑 Outlook / 小米日历上就没有。
 *   学生真正的日程表是系统日历，课表不在里面等于每天要开两次两个 App。
 *   这里做的是一份标准 iCalendar（RFC 5545）文本，任何日历软件都能导入。
 *
 * 三条硬规矩：
 *   1. **时间只用「浮动时间」**（`DTSTART:20260907T080000`，不带 Z 也不带 TZID）。
 *      学生都在国内，日历按本机时区显示即正确；写 TZID 反而要求导入端认识
 *      Asia/Shanghai，某些日历会因此拒绝整个文件。带 Z（UTC）则要换算，
 *      一旦换算错了，课就整体挪 8 小时 —— 这是最贵的错，宁可不用。
 *   2. **读不出来的就不生成**。某一节的作息串解析不出来、某一门的周次是空的，
 *      那一条直接跳过并计数，最后在面板上写明「N 条没导」。
 *      绝不拿 00:00 顶上 —— 一个占满早八的假事件比缺一条更难发现。
 *   3. **同一门课的多周不逐周展开**，合并成「连续周段 + RRULE:WEEKLY」。
 *      75 门课 × 平均 10 周 = 上千个 VEVENT，文件又大、日历又乱；
 *      合并后同一门课通常只有 1~3 条。
 * ============================================================ */
const ICS = (() => {
  'use strict';

  /* 生成这份文件的模块版本。导出的文件里会写进 PRODID，方便以后对账。 */
  const VER = '2.13.0';

  const DAY_CODES = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* 本地时间 → 20260907T080000（浮动，不带 Z） */
  function fmtLocal(d) {
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00';
  }

  /* 本地日期 → 20260907（全天事件用） */
  function fmtDay(d) {
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  /* 2026-09-07 → Date（本地零点）。格式不对返回 null，绝不返回「今天」。 */
  function parseDay(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s == null ? '' : s));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  /* 2026-09-07 14:30 / 2026-09-07 → Date（本地）。只给日期时落在 00:00。 */
  function parseStamp(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s == null ? '' : s));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] == null ? 0 : +m[4], m[5] == null ? 0 : +m[5]);
    return isNaN(d.getTime()) ? null : d;
  }

  /* '08:00' → 480。'8:00' 也认；'24:00' 认成 1440；其余非法返回 -1。 */
  function hm(seg) {
    const m = /^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/.exec(String(seg == null ? '' : seg));
    if (!m) return -1;
    const h = +m[1];
    const mi = +m[2];
    if (h === 24 && mi === 0) return 1440;
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return -1;
    return h * 60 + mi;
  }

  /* 一节作息串 '08:00~08:45' → {a:480,b:525}；坏串返回 null。 */
  function segRange(seg) {
    const parts = String(seg == null ? '' : seg).split(/[~\-～–—]/);
    if (parts.length < 2) return null;
    const a = hm(parts[0]);
    const b = hm(parts[1]);
    if (a < 0 || b < 0 || b <= a) return null;
    return { a: a, b: b };
  }

  /* 某门课的节次区间。取第一节的开始 + 最后一节的结束（连堂课中间的空档不算）。
   * times 是 1-based 数组（times[0] 是第 1 节）。任一节读不出就整门放弃 → null。 */
  function periodRange(periods, times) {
    if (!Array.isArray(periods) || !periods.length) return null;
    if (!Array.isArray(times) || !times.length) return null;
    let first = Math.floor(Number(periods[0]));
    let last = first;
    if (!(first >= 1)) return null;
    for (let i = 1; i < periods.length; i++) {
      const p = Math.floor(Number(periods[i]));
      if (!(p >= 1)) return null;
      if (p < first) first = p;
      if (p > last) last = p;
    }
    const s = segRange(times[first - 1]);
    const e = segRange(times[last - 1]);
    if (!s || !e) return null;
    return { a: s.a, b: e.b };
  }

  /* 把 [3,4,5,9,10] 压成 [{from:3,to:5},{from:9,to:10}]。
   * 排序、去重、丢掉非正数与非数字；非连续就断开。 */
  function runsOf(weeks) {
    if (!Array.isArray(weeks) || !weeks.length) return [];
    const seen = {};
    const list = [];
    for (let i = 0; i < weeks.length; i++) {
      const w = Math.floor(Number(weeks[i]));
      if (!isFinite(w) || w < 1) continue;
      if (seen[w]) continue;
      seen[w] = 1;
      list.push(w);
    }
    list.sort(function (x, y) { return x - y; });
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const last = out[out.length - 1];
      if (last && list[i] === last.to + 1) last.to = list[i];
      else out.push({ from: list[i], to: list[i] });
    }
    return out;
  }

  /* 学期第 week 周、周 day（1=周一）那天。start 是第 1 周周一（本地零点）。 */
  function dayOf(start, week, day) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    d.setDate(d.getDate() + (week - 1) * 7 + (day - 1));
    return d;
  }

  /* RFC 5545 的 TEXT 转义：反斜杠、分号、逗号要转义，换行变 \n。 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  /* 长行折行：每个物理行不超过 75 个**字节**（不是字符），续行以空格开头。
   * 中文一个字 3 字节，直接按字符数切会把行撑爆 —— 这里按 UTF-8 字节计。 */
  function fold(line) {
    const s = String(line == null ? '' : line);
    let out = '';
    let cur = '';
    let bytes = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i);
      const code = s.charCodeAt(i);
      let w = 1;
      if (code > 0x7ff) w = 3;
      else if (code > 0x7f) w = 2;
      if (bytes + w > 74) {
        out += (out ? '\r\n ' : '') + cur;
        cur = '';
        bytes = 0;
      }
      cur += ch;
      bytes += w;
    }
    return out + (out ? '\r\n ' : '') + cur;
  }

  /* 一门课 + 一个连续周段 → 一组 VEVENT 行。读不出时间就返回 null。 */
  function courseEvent(course, run, times, start, stamp) {
    if (!course || !run) return null;
    const day = Math.floor(Number(course.day));
    if (!(day >= 1 && day <= 7)) return null;
    const rng = periodRange(course.periods, times);
    if (!rng) return null;
    const first = dayOf(start, run.from, day);
    const head = new Date(first.getFullYear(), first.getMonth(), first.getDate(),
      Math.floor(rng.a / 60), rng.a % 60, 0);
    const tail = new Date(head.getFullYear(), head.getMonth(), head.getDate(),
      Math.floor(rng.b / 60), rng.b % 60, 0);
    const count = run.to - run.from + 1;
    const name = String(course.name || '未命名课程').trim();
    const desc = [];
    if (course.teacher) desc.push('教师：' + course.teacher);
    desc.push('第 ' + run.from + (count > 1 ? '~' + run.to : '') + ' 周 · ' + DAY_NAMES[day]);
    if (course._cmd) desc.push('（这条是改课表指令加进来的）');
    const L = [];
    L.push('BEGIN:VEVENT');
    L.push('UID:' + esc(stamp + '-' + slug(name) + '-' + day + '-' + run.from) + '@xxmu');
    L.push('DTSTAMP:' + stamp);
    L.push('DTSTART:' + fmtLocal(head));
    L.push('DTEND:' + fmtLocal(tail));
    if (count > 1) L.push('RRULE:FREQ=WEEKLY;COUNT=' + count + ';BYDAY=' + DAY_CODES[day]);
    L.push(fold('SUMMARY:' + esc(name)));
    if (course.room) L.push(fold('LOCATION:' + esc(course.room)));
    L.push(fold('DESCRIPTION:' + esc(desc.join('\n'))));
    L.push('TRANSP:OPAQUE');
    L.push('END:VEVENT');
    return L;
  }

  /* 名字 → UID 里能用的片段。只留字母数字，中文全部丢掉会剩空串，那就用长度兜底。 */
  function slug(s) {
    const a = String(s || '').replace(/[^0-9A-Za-z]+/g, '');
    if (a) return a.slice(0, 16);
    return 'c' + String(s || '').length;
  }

  /* 一条截止时间 → VEVENT。带 1 小时前提醒（那是学生真正需要的那个动作）。 */
  function dueEvent(item, stamp) {
    if (!item) return null;
    const d = item.at;
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    const kind = item.kind === 'exam' ? '考试' : '作业';
    const name = String(item.name || '未命名').trim();
    const L = [];
    L.push('BEGIN:VEVENT');
    L.push('UID:' + esc(stamp + '-due-' + slug(name) + '-' + fmtLocal(d)) + '@xxmu');
    L.push('DTSTAMP:' + stamp);
    L.push('DTSTART:' + fmtLocal(d));
    L.push('DTEND:' + fmtLocal(new Date(d.getTime() + 30 * 60000)));
    L.push(fold('SUMMARY:' + esc(kind + '截止 · ' + name)));
    const desc = [];
    if (item.course) desc.push('课程：' + item.course);
    if (item.status) desc.push('状态：' + item.status);
    desc.push('注意：这是学习通上的' + kind + '截止时间，不是开始时间。');
    L.push(fold('DESCRIPTION:' + esc(desc.join('\n'))));
    L.push('BEGIN:VALARM');
    L.push('TRIGGER:-PT60M');
    L.push('ACTION:DISPLAY');
    L.push(fold('DESCRIPTION:' + esc(kind + '还有 1 小时截止：' + name)));
    L.push('END:VALARM');
    L.push('END:VEVENT');
    return L;
  }

  /* 主函数：课表 + 截止 → 整份文件文本。
   * opts: {start:Date, times:string[], hw:[{kind,name,course,status,at:Date}]}
   * 返回 {text, events, skipped, courses, dues}
   * —— skipped 是「该导但读不出来」的条数，必须显式告诉用户。 */
  function build(courses, opts) {
    const o = opts || {};
    const start = o.start instanceof Date && !isNaN(o.start.getTime()) ? o.start : null;
    const times = Array.isArray(o.times) ? o.times : [];
    const hw = Array.isArray(o.hw) ? o.hw : [];
    const now = new Date();
    const stamp = fmtLocal(now).replace(/[-:]/g, '') + 'Z';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//XXMU Helper//KB ' + VER + '//CN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      fold('X-WR-CALNAME:' + esc(o.calName || '河医大助手课表')),
    ];
    let events = 0;
    let skipped = 0;
    let nc = 0;
    let nd = 0;

    if (start) {
      const list = Array.isArray(courses) ? courses : [];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c) continue;
        const runs = runsOf(c.weeks);
        let made = 0;
        for (let j = 0; j < runs.length; j++) {
          const ev = courseEvent(c, runs[j], times, start, stamp);
          if (!ev) continue;
          for (let k = 0; k < ev.length; k++) lines.push(ev[k]);
          events++;
          made++;
          nc++;
        }
        /* 有周次但一条都生成不出来 → 计入「读不出来」，这条要报给用户 */
        if (!made && (runs.length || (Array.isArray(c.weeks) && c.weeks.length))) skipped++;
      }
    }

    for (let i = 0; i < hw.length; i++) {
      const ev = dueEvent(hw[i], stamp);
      if (!ev) { skipped++; continue; }
      for (let k = 0; k < ev.length; k++) lines.push(ev[k]);
      events++;
      nd++;
    }

    lines.push('END:VCALENDAR');
    return {
      text: lines.join('\r\n') + '\r\n',
      events: events,
      skipped: skipped,
      courses: nc,
      dues: nd,
      startMissing: !start,
    };
  }

  /* ---------------------------------------------------------------- 界面 */

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 从本机读截止时间。只读，不改任何东西。
   * work 有 end_ts（秒），exam 只有 end 字符串 —— 两种都要接住。 */
  function readDue() {
    const out = [];
    let raw = '';
    try { raw = (typeof XXMU !== 'undefined' && XXMU.pref) ? XXMU.pref('xxmu_cx_homework') : ''; } catch (e) { raw = ''; }
    if (!raw || String(raw).length < 20) return out;
    let d = null;
    try { d = JSON.parse(raw); } catch (e) { return out; }
    if (!d || typeof d !== 'object') return out;
    const done = function (st) {
      if (typeof CX === 'undefined' || !CX.classify) return false;
      return CX.classify(st) === 'done';
    };
    const take = function (arr, kind) {
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const x = arr[i];
        if (!x) continue;
        if (done(x.status)) continue;
        if (x.expired === true) continue;
        let at = null;
        const ts = Number(x.end_ts);
        if (isFinite(ts) && ts > 0) at = new Date(ts * 1000);
        else at = parseStamp(x.end);
        if (!at || isNaN(at.getTime())) continue;
        out.push({ kind: kind, name: x.name || '', course: x.course || '', status: x.status || '', at: at });
      }
    };
    take(d.works, 'work');
    take(d.exams, 'exam');
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  function fileName(d) {
    const x = d || new Date();
    return '河医大助手课表-' + x.getFullYear() + pad2(x.getMonth() + 1) + pad2(x.getDate()) + '.ics';
  }

  /* 把生成的文本交给原生写文件。严格读 OK:/ERR: 前缀 ——
   * Host.exportText 是异步 void，返回值靠不住（v2.0.0 栽过一次）。 */
  function saveFile(text, name) {
    if (typeof Host === 'undefined' || !Host || !Host.exportText) {
      return { ok: false, msg: '这个功能要在 App 里用（浏览器里没有存文件的通道）' };
    }
    try {
      const r = Host.exportText(name, text);
      const s = String(r == null ? '' : r);
      if (s.indexOf('OK:') === 0) return { ok: true, msg: s.slice(3), size: text.length };
      if (s.indexOf('ERR:') === 0) return { ok: false, msg: s.slice(4) };
      return { ok: false, msg: '存文件没有回话，去「下载」目录看看有没有：' + name };
    } catch (e) {
      return { ok: false, msg: '存文件失败：' + (e && e.message ? e.message : e) };
    }
  }

  function openPanel() {
    const body = document.getElementById('sh-body');
    const nameEl = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    if (typeof parkTools === 'function') parkTools();
    if (nameEl) nameEl.textContent = '导出到日历';
    body.innerHTML = '';

    body.appendChild(el('p', 'hint left tight',
      '把课表做成日历文件（.ics），用手机自带日历、Outlook、Google 日历都能导入。'
      + '导入后课表就长在日历里，不用每天开两个 App。'));

    /* 数据来源：DATA / TIMES / START 都是 app.js 的顶层 let，不是 window 属性。
     * 读不到就明说，别拿空课表生成一份「什么都没有」的文件。 */
    let courses = null;
    let times = null;
    let start = null;
    try {
      if (typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.courses)) courses = DATA.courses;
      if (typeof TIMES !== 'undefined' && Array.isArray(TIMES)) times = TIMES;
      if (typeof START !== 'undefined' && START instanceof Date) start = START;
    } catch (e) { }

    if (!courses || !courses.length) {
      body.appendChild(el('p', 'hint left tight ex-bad',
        '现在没有课表可导。先在「课表」页点「从教务同步」，或者确认学期设置里的开学日填好了。'));
      sheet.classList.add('on');
      return;
    }

    const due = readDue();
    const built = build(courses, { start: start, times: times, hw: due });

    const stat = el('div', 'ex-stat');
    stat.appendChild(el('div', 'ex-cap', '这份日历里有什么'));
    const bits = [];
    bits.push(built.courses + ' 节课');
    if (built.dues) bits.push(built.dues + ' 条截止');
    stat.appendChild(el('div', 'ex-sum', bits.join(' · ') + '（共 ' + built.events + ' 个日程）'));
    body.appendChild(stat);

    if (built.startMissing) {
      body.appendChild(el('p', 'hint left tight ex-bad',
        '学期开学日没读到，课表部分没法排期。去「课表 → 学期设置」里填一下再回来。'));
    }

    const acts = el('div', 'ex-acts');
    const bFile = el('button', 'btn', '导出为文件');
    const bCopy = el('button', 'btn ghost', '复制成文本');
    acts.appendChild(bFile);
    acts.appendChild(bCopy);
    body.appendChild(acts);

    const out = el('div', 'fr-hint ex-out', '');
    out.style.display = 'none';
    body.appendChild(out);

    function show(ok, msg) {
      out.style.display = '';
      out.className = 'fr-hint ex-out' + (ok ? '' : ' ex-bad');
      out.textContent = msg;
    }

    bFile.onclick = function () {
      const nm = fileName(new Date());
      const r = saveFile(built.text, nm);
      if (r.ok) show(true, '已存到：' + r.msg + '（' + Math.round((r.size || 0) / 1024) + 'KB）');
      else show(false, r.msg);
    };
    bCopy.onclick = function () {
      /* 复制用和备份面板同一套三级降级。这里只做文本复制，不写文件。 */
      try {
        const ta = document.createElement('textarea');
        ta.value = built.text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) show(true, '已复制 ' + built.text.length + ' 字符');
        else show(false, '复制不了。用「导出为文件」吧');
      } catch (e) {
        show(false, '复制失败：' + (e && e.message ? e.message : e));
      }
    };

    if (built.skipped) {
      body.appendChild(el('p', 'hint left tight ex-bad',
        '有 ' + built.skipped + ' 条读不出时间，没有放进日历（不会拿 00:00 顶上）：'
        + '通常是这一节的作息串没同步到，或者这门课的周次是空的。'));
    }

    body.appendChild(el('p', 'hint left tight',
      '时间按本机时区写成「浮动时间」，导入后与手机日历显示一致。'
      + '截止时间那条带了「提前 1 小时」的提醒 —— 那是学习通上的截止点，不是开始点。'));
    body.appendChild(el('p', 'hint left tight',
      '导出的文件只在这台手机上，不影响 App 里的课表。改课表指令加的课也会一起导出。'));

    sheet.classList.add('on');
  }

  function init() {
    const row = document.getElementById('rowCalendar');
    if (row) row.onclick = openPanel;
  }

  return {
    init: init,
    openPanel: openPanel,
    readDue: readDue,
    build: build,
    courseEvent: courseEvent,
    dueEvent: dueEvent,
    periodRange: periodRange,
    segRange: segRange,
    runsOf: runsOf,
    dayOf: dayOf,
    parseDay: parseDay,
    parseStamp: parseStamp,
    fmtLocal: fmtLocal,
    fmtDay: fmtDay,
    esc: esc,
    fold: fold,
    hm: hm,
    fileName: fileName,
    saveFile: saveFile,
    VER: VER,
  };
})();

/* 自启动：脚本排在 app.js 之后，DOM 已就绪，直接绑。
 * 守卫照 v2.1.0 的规矩写 `typeof module === 'undefined'` ——
 * 绝不能写 `!module.exports`，那在浏览器里是 ReferenceError 且抛在 try 外面。 */
if (typeof document !== 'undefined' && typeof module === 'undefined') {
  try { ICS.init(); } catch (e) { }
}

/* 给 tools/test_ics.js 用（浏览器里 module 不存在，这一行不执行）。 */
if (typeof module !== 'undefined' && module.exports) module.exports = ICS;
