/* 河医大助手 · AI 改课表指令（借鉴 augustlies/tangli「烫梨指令」）
 *
 * 核心设计：**不接任何 AI API、不联网、零账号**。
 *   ① 把「开学日 + 作息 + 现有课表」拼成一段人话复制到剪贴板
 *   ② 用户自己粘给豆包 / DeepSeek / 任意 AI
 *   ③ AI 回一段纯文本指令，用户粘回来 → 本地解析 → 预览 → 点确认才生效
 *   ④ 每一步指令都留痕，可撤销
 *
 * 铁律（对照 DESIGN.md 第 4 节「状态三态」）：
 *   · 解析失败必须**整批拒绝**，绝不对认不出来的行做猜测或静默跳过
 *   · 时间只认「第 N 节」或能对上校方作息 times[] 的钟点，绝不内置臆造钟点
 *   · 只改本机叠加层（xxmu_kb_ops），不动外部 schedule.json / 缓存 / 内置数据
 */
const LessonCmd = (() => {
  'use strict';

  const KEY_OPS = 'xxmu_kb_ops';
  const DAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
  const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const HEAD = '河医大助手课表指令 v1';

  const clean = s => String(s == null ? '' : s)
    .replace(/&ensp;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- 存储：指令叠加层 ---------- */
  function getPref(k, def) {
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
  function loadOps() {
    try {
      const raw = getPref(KEY_OPS, '');
      if (!raw) return [];
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveOps(ops) { setPref(KEY_OPS, JSON.stringify(ops || [])); }
  function appendOps(ops) {
    const all = loadOps().concat(ops || []);
    saveOps(all);
    return all;
  }
  function undo() {
    const all = loadOps();
    if (!all.length) return false;
    all.pop();
    saveOps(all);
    return true;
  }
  function clear() { saveOps([]); }

  /* ---------- 上下文 ---------- */
  /** ctx = { start:'2026-08-31', times:['08:00~08:40',...], totalWeeks:21, today:'2026-11-08' } */
  function ctx(o) {
    const c = o || {};
    return {
      start: String(c.start || '2026-08-31'),
      times: Array.isArray(c.times) ? c.times : [],
      totalWeeks: parseInt(c.totalWeeks, 10) || 21,
      today: String(c.today || ''),
    };
  }
  function startDate(c) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.start);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function dateOf(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function weekOfDate(d, c) {
    const st = startDate(c);
    if (!st || !d) return 0;
    return Math.floor((d - st) / 6048e5) + 1;
  }

  /* ---------- 原子解析 ---------- */
  function parseDay(s) {
    const m = /周([一二三四五六日天])/.exec(String(s || ''));
    return m ? DAY_MAP[m[1]] : 0;
  }
  function parseWeeks(s, c) {
    const m = /第\s*(\d+)\s*(?:[-~～]\s*(\d+))?\s*周/.exec(String(s || ''));
    if (!m) {
      /* 也认「10,12周」这种逗号列举 */
      const m2 = /(?:^|\s)([\d,]+)\s*周/.exec(String(s || ''));
      if (!m2) return null;
      const out = m2[1].split(',').map(x => parseInt(x, 10)).filter(n => n > 0);
      return out.length ? uniq(out) : null;
    }
    const a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
    if (!(a > 0 && b >= a)) return null;
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    if (out.some(w => w > c.totalWeeks)) return null;   // 超出总周数 → 拒绝，不夹
    return out;
  }
  function uniq(a) { return [...new Set(a)].sort((x, y) => x - y); }

  /** '3-4节' / '3节' / '14:30'（后者必须能落到 times[] 里，落不到就拒绝） */
  function parsePeriods(s, c) {
    const t = String(s || '').trim();
    let m = /^(\d+)\s*[-~～]\s*(\d+)\s*节$/.exec(t);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (!(a > 0 && b >= a && b <= 14)) return null;
      const out = []; for (let i = a; i <= b; i++) out.push(i);
      return out;
    }
    m = /^(\d+)\s*节$/.exec(t);
    if (m) {
      const n = parseInt(m[1], 10);
      return n > 0 && n <= 14 ? [n] : null;
    }
    m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (m) {
      const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
      if (hh > 23 || mm > 59) return null;
      const mins = hh * 60 + mm;
      /* times[] 形如 '08:00~08:40'：起点<=t<=终点才算对得上 */
      const hit = c.times.findIndex(one => {
        const p = String(one || '').split(/[~～\-—]/);
        if (p.length < 2) return false;
        const a = toMin(p[0]), b = toMin(p[1]);
        return a != null && b != null && mins >= a && mins <= b;
      });
      return hit >= 0 ? [hit + 1] : null;   // 找不到 → 整条拒绝，绝不猜
    }
    return null;
  }
  function toMin(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function parseHolidayWeeks(s, c) {
    const m = /^(\d{4}-\d{2}-\d{2})\s*(?:[-~～至到]\s*(\d{4}-\d{2}-\d{2}))?$/.exec(String(s || '').trim());
    if (!m) return null;
    const a = dateOf(m[1]), b = m[2] ? dateOf(m[2]) : a;
    if (!a || !b || b < a) return null;
    const wa = weekOfDate(a, c), wb = weekOfDate(b, c);
    if (!(wa > 0 && wb >= wa)) return null;
    const out = [];
    for (let i = wa; i <= wb; i++) if (i <= c.totalWeeks) out.push(i);
    return out.length ? out : null;
  }

  function splitParts(line) {
    return line.split(/\s*\|\s*/).map(x => x.trim());
  }
  /** 从若干段里找出「周/节/周次」三种片段 */
  function scan(parts, c, needWeeks) {
    let day = 0, periods = null, weeks = null, room = '';
    const rest = [];
    for (const p of parts) {
      if (!p) continue;
      if (!day && /周[一二三四五六日天]/.test(p)) { day = parseDay(p); continue; }
      if (!periods && /节|^\d{1,2}:\d{2}$/.test(p)) { periods = parsePeriods(p, c); continue; }
      if (!weeks && /(第\s*\d|[\d,]+\s*周)/.test(p)) { weeks = parseWeeks(p, c); continue; }
      rest.push(p);
    }
    return { day, periods, weeks, room, rest };
  }

  function err(lineNo, msg) { return { line: lineNo, msg }; }

  /** 主入口：文本 → {ops:[], errors:[]}。任何 error 都让 ops 为空（整批拒绝）。 */
  function parse(text, c0) {
    const c = ctx(c0);
    const errors = [], ops = [];
    const lines = String(text == null ? '' : text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const s = raw.trim();
      if (!s || s.startsWith('#') || s.startsWith('//') || s === HEAD) continue;
      const no = i + 1;
      const verb = s.charAt(0);
      const body = s.slice(1).trim();
      if (!'＋+停调假'.includes(verb)) { errors.push(err(no, '无法识别的指令：' + s.slice(0, 24))); continue; }
      if (!body) { errors.push(err(no, '指令后面没有内容')); continue; }

      /* 假：'2026-10-01 ~ 2026-10-07 | 国庆' */
      if (verb === '假') {
        const p = splitParts(body);
        const weeks = parseHolidayWeeks(p[0], c);
        if (!weeks) { errors.push(err(no, '放假日期读不出来（要 2026-10-01 ~ 2026-10-07 这种写法）')); continue; }
        ops.push({ type: 'holiday', weeks, name: clean(p[1]) || '假期', dates: clean(p[0]) });
        continue;
      }

      if (verb === '+' || verb === '＋') {
        /* + 课名 | 周三 | 3-4节 | 第10周 | A201 */
        const p = splitParts(body);
        if (!p[0]) { errors.push(err(no, '加课没写课名')); continue; }
        const sc = scan(p.slice(1), c, true);
        if (!sc.day) { errors.push(err(no, '加课没写星期（周三 这种）')); continue; }
        if (!sc.periods) { errors.push(err(no, '加课没写节次（3-4节），或钟点对不上校方作息')); continue; }
        if (!sc.weeks) { errors.push(err(no, '加课没写周次（第10周）')); continue; }
        const room = sc.rest[0] || '';
        ops.push({
          type: 'add', name: clean(p[0]), day: sc.day, periods: sc.periods,
          weeks: sc.weeks, room: clean(room), teacher: '', raw_weeks: '', _cmd: true,
        });
        continue;
      }

      if (verb === '停') {
        /* 停 课名 | 第9周 | 周一 | 3-4节 */
        const p = splitParts(body);
        if (!p[0]) { errors.push(err(no, '停课没写课名')); continue; }
        const sc = scan(p.slice(1), c, false);
        /* 停课必须至少给一个范围，防止一句话把整门课全删了 */
        if (!sc.weeks && !sc.day && !sc.periods) {
          errors.push(err(no, '停课要写明范围（第9周 / 周三 / 3-4节 至少给一个），拒绝整门删除'));
          continue;
        }
        ops.push({ type: 'stop', name: clean(p[0]), day: sc.day, periods: sc.periods, weeks: sc.weeks });
        continue;
      }

      if (verb === '调') {
        /* 调 课名 | 第10周 | 周五 | 1-2节 -> 第11周 | 周六 | 3-4节 */
        const arrow = body.indexOf('->');
        if (arrow < 0) { errors.push(err(no, '调课要用 -> 分开「原来」和「改成」')); continue; }
        const left = body.slice(0, arrow), right = body.slice(arrow + 2);
        const lp = splitParts(left), rp = splitParts(right);
        if (!lp[0]) { errors.push(err(no, '调课没写课名')); continue; }
        const l = scan(lp.slice(1), c, false), r = scan(rp, c, true);
        if (!l.weeks || !l.day || !l.periods) { errors.push(err(no, '调课的「原来」要写全：第N周 / 周几 / N-M节')); continue; }
        if (!r.weeks || !r.day || !r.periods) { errors.push(err(no, '调课的「改成」要写全：第N周 / 周几 / N-M节')); continue; }
        ops.push({
          type: 'move', name: clean(lp[0]),
          from: { weeks: l.weeks, day: l.day, periods: l.periods },
          to: { weeks: r.weeks, day: r.day, periods: r.periods, room: clean(r.rest[0] || '') },
        });
        continue;
      }
    }

    if (errors.length) return { ops: [], errors, head: HEAD };
    if (!ops.length) errors.push(err(0, '没有读到任何指令（至少写一行 + / 停 / 调 / 假）'));
    return { ops: errors.length ? [] : ops, errors, head: HEAD };
  }

  /* ---------- 应用（纯函数，不改入参） ---------- */
  function intersect(a, b) { return !!(Array.isArray(a) && a.length && a.some(x => b.includes(x))); }
  function match(c, q) {
    if (clean(c.name) !== clean(q.name)) return false;
    if (q.day && c.day !== q.day) return false;
    if (q.weeks && !intersect(c.weeks || [], q.weeks)) return false;
    if (q.periods && !intersect(c.periods || [], q.periods)) return false;
    return true;
  }
  function clone(c) {
    return {
      name: c.name, teacher: c.teacher || '', room: c.room || '',
      day: c.day, weeks: Array.isArray(c.weeks) ? [...c.weeks] : [],
      periods: Array.isArray(c.periods) ? [...c.periods] : [],
      raw_weeks: c.raw_weeks || '', _cmd: !!c._cmd,
    };
  }
  function apply(courses, ops, c0) {
    let out = (Array.isArray(courses) ? courses : []).map(clone);
    for (const op of (Array.isArray(ops) ? ops : [])) {
      if (op.type === 'add') {
        const added = clone(op);
        added._cmd = true;      // 指令加进来的课永远带标记，与教务原始记录区分
        out.push(added);
      }
      else if (op.type === 'stop') out = out.filter(c => !match(c, op));
      else if (op.type === 'move') {
        out = out.map(c => match(c, { name: op.name, ...op.from })
          ? Object.assign(c, {
              day: op.to.day, weeks: [...op.to.weeks], periods: [...op.to.periods],
              room: op.to.room || c.room,
            })
          : c);
      } else if (op.type === 'holiday') {
        out = out.map(c => Object.assign(c, {
          weeks: (c.weeks || []).filter(w => !op.weeks.includes(w)),
        })).filter(c => c.weeks.length);
      }
    }
    return out;
  }

  /* ---------- 给 AI 的说明文本 ---------- */
  function contextText(courses, c0) {
    const c = ctx(c0);
    const todayW = c.today ? weekOfDate(dateOf(c.today), c) : 0;
    const lines = [
      '下面是我的课表，请按「河医大助手课表指令 v1」格式回我一段纯文本，不要解释、不要代码块。',
      '',
      '【指令格式（每行一条）】',
      '+ 课名 | 周三 | 3-4节 | 第10周 | A201        （加一节课，最后一段是教室，可省略）',
      '停 课名 | 第9周 | 周一 | 3-4节              （停掉某周某天的课，范围至少给一个）',
      '调 课名 | 第10周 | 周五 | 1-2节 -> 第11周 | 周六 | 3-4节',
      '假 2026-10-01 ~ 2026-10-07 | 国庆          （这几周不上课）',
      '',
      '【规则】节次只写 1-14 节或「3-4节」；周次写「第10周」或「第10-12周」；星期写「周三」。',
      '不要写我没有给出的钟点，不要编课名。第一行请写：' + HEAD,
      '',
      '【学期】开学日 ' + c.start + '（那天是第 1 周周一），共 ' + c.totalWeeks + ' 周'
        + (todayW > 0 ? '，今天大约是第 ' + todayW + ' 周' : '') + '。',
      '【校方作息】' + (c.times.length ? c.times.map((t, i) => (i + 1) + '节=' + t).join('；') : '（还没同步，节次请用数字写）'),
      '',
      '【现有课表】' + (courses.length ? '' : '（空）'),
    ];
    (courses || []).forEach(x => {
      lines.push('- ' + clean(x.name) + ' | ' + (DAY_NAMES[x.day] || '周?') + ' | '
        + (x.periods || []).join(',') + '节 | 第' + uniq(x.weeks || []).join(',') + '周'
        + (x.room ? ' | ' + clean(x.room) : ''));
    });
    return lines.join('\n');
  }

  /** 预览差异：只读汇总，不落盘 */
  function diff(before, after, ops) {
    const kinds = { add: 0, stop: 0, move: 0, holiday: 0 };
    (ops || []).forEach(o => { if (kinds[o.type] != null) kinds[o.type]++; });
    const lines = [
      '指令 ' + (ops || []).length + ' 条：加课 ' + kinds.add + ' · 停课 ' + kinds.stop
        + ' · 调课 ' + kinds.move + ' · 放假 ' + kinds.holiday,
      '课程记录：' + before.length + ' 条 → ' + after.length + ' 条',
    ];
    (ops || []).forEach((o, i) => {
      const n = '  ' + (i + 1) + '. ';
      if (o.type === 'add') lines.push(n + '加「' + o.name + '」' + DAY_NAMES[o.day] + ' 第'
        + o.weeks.join(',') + '周 ' + o.periods.join('-') + '节' + (o.room ? ' @' + o.room : ''));
      else if (o.type === 'stop') lines.push(n + '停「' + o.name + '」第' + (o.weeks || []).join(',') + '周');
      else if (o.type === 'move') lines.push(n + '调「' + o.name + '」→' + DAY_NAMES[o.to.day]
        + ' 第' + o.to.weeks.join(',') + '周 ' + o.to.periods.join('-') + '节');
      else if (o.type === 'holiday') lines.push(n + '放假「' + o.name + '」影响第' + o.weeks.join(',') + '周');
    });
    return lines.join('\n');
  }

  /* ---------- UI（只有浏览器里才调用；node 测纯函数时不碰 DOM） ---------- */
  function copy(text, done) {
    const s = String(text || '');
    try {
      if (typeof Host !== 'undefined' && Host.clip) { Host.clip(s); done(true); return; }
    } catch (e) {}
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s).then(() => done(true), () => fallback(s, done));
        return;
      }
    } catch (e) {}
    fallback(s, done);

    function fallback(t, cb) {
      try {
        const ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        cb(ok);
      } catch (e) { cb(false); }
    }
  }
  function toast(msg) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU.toast) { XXMU.toast(msg); return; }
      if (typeof Host !== 'undefined' && Host.toast) { Host.toast(msg); return; }
    } catch (e) {}
  }

  /** 在 #sheet 半框里打开指令面板。reload 是 app.js 传进来的刷新回调。 */
  function open(opts) {
    const o = opts || {};
    const body = document.getElementById('sh-body');
    const name = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    if (name) name.textContent = 'AI 改课表';
    body.innerHTML = '';

    const mk = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    body.appendChild(mk('p', 'hint',
      '不联网、不调 AI、不上传课表。把说明复制给任意 AI，把回的指令粘回来，预览确认后才生效。'));

    const step1 = mk('div', 'cmd-step', '① 复制课表说明给 AI');
    const btnCopy = mk('button', 'btn', '复制说明');
    const btnCtx = mk('button', 'btn ghost', '看说明内容');
    const ctxBox = mk('textarea', 'cmd-ta');
    ctxBox.value = contextText(o.courses || [], o.ctx || {});
    ctxBox.readOnly = true; ctxBox.style.display = 'none';
    btnCopy.onclick = () => copy(ctxBox.value, ok => toast(ok ? '说明已复制，去粘给 AI' : '复制失败，可点「看说明内容」手动长按复制'));
    btnCtx.onclick = () => { ctxBox.style.display = ctxBox.style.display === 'none' ? 'block' : 'none'; };
    step1.appendChild(btnCopy); step1.appendChild(btnCtx); step1.appendChild(ctxBox);
    body.appendChild(step1);

    const step2 = mk('div', 'cmd-step', '② 把 AI 回的指令粘在这里');
    const ta = mk('textarea', 'cmd-ta');
    ta.placeholder = HEAD + '\n+ 大学物理期中考试 | 周三 | 3-4节 | 第10周 | A201\n停 大学英语 | 第9周 | 周一 | 3-4节';
    const btnPrev = mk('button', 'btn ghost', '预览变更');
    step2.appendChild(ta); step2.appendChild(btnPrev); body.appendChild(step2);

    const result = mk('div', 'cmd-result');
    body.appendChild(result);

    const step3 = mk('div', 'cmd-step', '③ 确认 / 撤销');
    const btnApply = mk('button', 'btn', '确认生效');
    btnApply.disabled = true;
    const btnUndo = mk('button', 'btn ghost', '撤销上一步');
    const btnClear = mk('button', 'btn ghost', '清空全部改动');
    step3.appendChild(btnApply); step3.appendChild(btnUndo); step3.appendChild(btnClear);
    body.appendChild(step3);
    body.appendChild(mk('p', 'hint', '改动只叠在本机，刷新课表 / 换数据源后会重新叠加，不会覆盖教务数据。'));

    let pending = null;

    function paintResult(text, bad) {
      result.innerHTML = '';
      const pre = mk('pre', 'cmd-pre' + (bad ? ' bad' : ''), text);
      result.appendChild(pre);
    }
    btnPrev.onclick = () => {
      const r = parse(ta.value, o.ctx || {});
      if (r.errors.length) {
        pending = null; btnApply.disabled = true;
        paintResult('指令没通过，整批未生效：\n' + r.errors.map(e => '· 第' + e.line + '行：' + e.msg).join('\n'), true);
        return;
      }
      const before = (o.courses || []).slice();
      const after = apply(before, r.ops, o.ctx || {});
      pending = r.ops;
      btnApply.disabled = false;
      paintResult(diff(before, after, r.ops) + '\n\n确认后才会写入本机。', false);
    };
    btnApply.onclick = () => {
      if (!pending || !pending.length) return;
      appendOps(pending);
      toast('已生效 ' + pending.length + ' 条指令');
      if (typeof o.reload === 'function') o.reload();
      if (sheet) sheet.classList.remove('on');
    };
    btnUndo.onclick = () => {
      if (!undo()) { toast('没有可撤销的改动'); return; }
      toast('已撤销上一步');
      if (typeof o.reload === 'function') o.reload();
      paintResult('已撤销一条指令，课表已重算。', false);
    };
    btnClear.onclick = () => {
      if (!loadOps().length) { toast('本来就没有改动'); return; }
      clear(); toast('已清空全部指令改动');
      if (typeof o.reload === 'function') o.reload();
      paintResult('全部改动已清空，恢复原始课表。', false);
    };
    paintResult('当前已叠加 ' + loadOps().length + ' 条指令改动。', false);
    sheet.classList.add('on');
  }

  return {
    KEY_OPS, HEAD, parse, apply, ctx, contextText, diff,
    loadOps, saveOps, appendOps, undo, clear, open, copy,
    /* 测试用 */
    _internal: { parseDay, parseWeeks, parsePeriods, parseHolidayWeeks, weekOfDate },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LessonCmd;
