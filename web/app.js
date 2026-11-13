/* 河医大助手 - 课表渲染 */
/* 开学日 = 第 1 周的周一。
 *
 * 这个值原来是 const 写死的，问题很实在：学校把校历往前挪一周，
 * 周次立刻全错，而且改不了 —— 学生只能看着「第 12 周」发呆。
 * 现在改成可配置：默认仍是 2026-08-31（这届的校历），
 * 用户能在「我的 → 学期设置」里改成自己那学期的真实开学日。 */
const START_DEFAULT = '2026-08-31';
const WEEKS_DEFAULT = 21;
let START = parseDate(prefGet2('xxmu_start', START_DEFAULT));
let TOTAL_WEEKS = parseInt(prefGet2('xxmu_weeks', ''), 10) || WEEKS_DEFAULT;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return new Date(2026, 7, 31);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/* prefGet 在后面才定义（它在学习页那一段），这里先给一个前置版本，
 * 否则模块加载到第 2 行就会 ReferenceError。 */
function prefGet2(k, def) {
  try {
    if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(k) || def;
  } catch (e) {}
  try { return localStorage.getItem(k) || def; } catch (e) {}
  return def;
}
function prefSet2(k, v) {
  try {
    if (typeof Host !== 'undefined' && Host.setPref) { Host.setPref(k, v); return; }
  } catch (e) {}
  try { localStorage.setItem(k, v); } catch (e) {}
}

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
/* 作息时刻：只认外部数据 times[]（校方作息表），绝不内置臆造钟点 */
let TIMES = [];
/* 原始课表 7 个大节行 = 上午(一/二/三) 下午(四/五) 晚上(六/七) → 每大节 2 小节
   即 上午 1-6 节、下午 7-10 节、晚上 11-14 节 */
const DAY_PART = p => (p <= 6 ? '上午' : p <= 11 ? '下午' : '晚上');

/* 作息串「08:00~08:45」→ 起 / 止。
 * 兼容用横杠写的、只有一个时间点的、以及带空白的情况；
 * 取不到就返回空串，调用方据此退回「第 N 节」文案，绝不上屏 undefined。 */
function firstTime(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.split(/[~～\-—]/);
  return (m[0] || '').trim();
}
function lastTime(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.split(/[~～\-—]/);
  return (m.length > 1 ? (m[m.length - 1] || '').trim() : '');
}
const PART_HEAD = { 1: '上午', 7: '下午', 12: '晚上' };

let DATA = { courses: [] };
let curWeek = 1;
let PERIODS = 12;

const COLORS = ['#e8f0fe', '#fce8e6', '#e6f4ea', '#fef7e0', '#f3e8fd', '#e4f7fb', '#fde8f3'];
const colorOf = n => COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

/* 教师名里的 &ensp; 等实体清理 */
const clean = s => String(s || '').replace(/&ensp;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const weekOf = d => Math.floor((d - START) / 6048e5) + 1;
const mondayOf = w => { const d = new Date(START); d.setDate(d.getDate() + (w - 1) * 7); return d; };
const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* 把一段错误信息安全地渲染成提示。
 *
 * 为什么要有这两个：这些位置原来写的是
 *     box.innerHTML = '<p class="hint">连不上服务器：' + e.message + '</p>'
 * e.message 里可能是服务端回的任何字节、也可能是 URL 里带回来的内容，
 * 直接拼进 innerHTML 就等于把一个注入点开在最显眼的位置。
 * 换成 textContent 之后，任何 < > & 都只是文字。 */
function errText(e) {
  if (!e) return '';
  return String(e && e.message ? e.message : e);
}

function hintInto(box, msg) {
  if (!box) return;
  box.innerHTML = '';
  box.appendChild(el('p', 'hint', msg));
  return box;
}

/* 把某一周的课整理成「块」：同名课程合并成一段，占多行。
 *
 * v1.1.8：原来排不下就 `return`，那门课直接从网格上消失。
 * 而 kbtip 里的「本周 N 节课」用的是 courses.length（含被丢的），
 * 于是「说 5 节、只画出 4 节」，用户既不知道少了一门、也无从发现是冲突。
 * 现在改成：排不下就按它自己的起始节次原地叠放（视觉上和别的课重叠，
 * 但课程、教室、时间都能点开看），并把冲突数带出去让提示语说明白。
 * 教务系统真的有同一时段两门课（重修/合班/实验分组），这是数据事实，
 * 不该由前端静默吞掉。 */
function blocksOf(day, week) {
  const list = DATA.courses.filter(c => c.day === day && Array.isArray(c.weeks) && c.weeks.includes(week));
  const groups = new Map();
  for (const c of list) {
    const key = clean(c.name) + '|' + clean(c.room);
    if (!groups.has(key)) groups.set(key, { name: clean(c.name), room: clean(c.room), teachers: [], ps: new Set() });
    const g = groups.get(key);
    (Array.isArray(c.periods) ? c.periods : []).forEach(p => g.ps.add(p));
    const t = clean(c.teacher);
    if (t && !g.teachers.includes(t)) g.teachers.push(t);
  }
  const occ = new Array(PERIODS + 3).fill(false);
  const out = [];
  [...groups.values()]
    .map(g => {
      const ps = [...g.ps].sort((a, b) => a - b);
      if (!ps.length) ps.push(1);
      /* 节次可能是 13、14 这种超出 PERIODS 的脏数据，先夹到网格范围内，
       * 否则 max 会算出比格子还大的 span，画出去直接溢出容器。 */
      const lo = Math.max(1, ps[0]);
      const hi = Math.min(PERIODS, ps[ps.length - 1] < lo ? lo : ps[ps.length - 1]);
      return { ...g, ps, min: lo, max: hi };
    })
    .sort((a, b) => a.min - b.min)
    .forEach(g => {
      const len = Math.max(1, g.max - g.min + 1);
      let s = g.min;
      while (s + len - 1 <= PERIODS && occ.slice(s, s + len).some(Boolean)) s++;
      let crowded = false;
      if (s + len - 1 > PERIODS) {
        /* 排不下了：回到它自己的起始节次原地叠放，并标记 cramped。
         * 叠放比丢掉好 —— 丢掉是「信息没了」，叠放至少还能点开看到。 */
        s = g.min;
        crowded = true;
      }
      for (let i = s; i < s + len && i <= PERIODS; i++) occ[i] = true;
      out.push({ ...g, start: s, span: Math.min(len, PERIODS - s + 1), crowded });
    });
  return out;
}

function renderWeek() {
  const wkno = document.getElementById('wkno');
  const wkdate = document.getElementById('wkdate');
  wkno.textContent = curWeek;
  const mon = mondayOf(curWeek);
  wkdate.textContent = `${fmt(mon)} - ${fmt(new Date(mon.getTime() + 6 * 864e5))}`;

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  // v3：与 web/app.css 的 .grid 同步（JS 内联优先于 CSS，改一处必须两处一起改）
  grid.style.gridTemplateColumns = `34px repeat(7,1fr)`;
  grid.style.gridAutoRows = '56px';

  const todayW = weekOf(new Date());
  const todayD = (new Date().getDay() + 6) % 7 + 1; // 周一=1 … 周日=7

  // 表头
  const corner = el('div', 'gh', '');
  corner.style.gridArea = '1 / 1';
  grid.appendChild(corner);

  DAYS.forEach((n, i) => {
    const g = el('div', 'gh' + (curWeek === todayW && i + 1 === todayD ? ' today' : ''), n);
    g.style.gridArea = `1 / ${i + 2}`;
    grid.appendChild(g);
  });

  // 节次刻度：主标=第几节；副标=官方钟点（无则显示上午/下午/晚上分段）
  for (let p = 1; p <= PERIODS; p++) {
    const head = PART_HEAD[p];
    const gp = el('div', 'gp' + (head ? ' gfirst' : ''));
    gp.appendChild(el('div', '', String(p)));
    const t = TIMES[p - 1] || '';
    gp.appendChild(el('div', 'gt', t ? t.split('~')[0] : (head || '')));
    gp.style.gridArea = `${p + 1} / 1`;
    grid.appendChild(gp);
  }

  // 空白格（今天整列高亮）
  const isThisWeek = curWeek === todayW;
  for (let p = 1; p <= PERIODS; p++) {
    for (let d = 1; d <= 7; d++) {
      const cell = el('div', 'cell' + (isThisWeek && d === todayD ? ' today' : '') +
        (PART_HEAD[p] ? ' gfirst' : ''));
      cell.style.gridArea = `${p + 1} / ${d + 1}`;
      grid.appendChild(cell);
    }
  }

  // 课程块
  for (let d = 1; d <= 7; d++) {
    for (const b of blocksOf(d, curWeek)) {
      const box = el('div', 'c');
      box.style.setProperty('--c', colorOf(b.name));
      box.style.gridArea = `${b.start + 1} / ${d + 1} / span ${b.span} / span 1`;
      box.appendChild(el('b', '', b.name));
      if (b.room) box.appendChild(el('span', 'room', b.room));
      const endP = b.start + b.span - 1;
      const t1 = TIMES[b.start - 1], t2 = TIMES[endP - 1];
      /* v1.1.8：作息串不一定带 `~`（校方偶尔给单个时间点，或者填了
       * 「08:00-08:45」这种用横杠的）。原来直接 `.split('~')[0]` 取不到就是
       * undefined，卡片上印出字面量「undefined」—— 用户截图里那种
       * 「第 3 节 · undefined」的怪显示，来源就在这里。
       * 抽成一个只取第一段的工具：有 `~` / `-` 就切，没有就整体当起点，
       * 万一 t1 是空串就退回节次文案，绝不让 undefined 上屏。 */
      const at1 = firstTime(t1), at2 = lastTime(t2);
      if (at1 && at2) {
        // 官方作息：起止分两行，避免窄列被裁
        box.appendChild(el('span', 'pr', at1));
        box.appendChild(el('span', 'pr2', at2));
      } else {
        box.appendChild(el('span', 'pr',
          (b.span > 1 ? `第 ${b.start}-${endP} 节` : `第 ${b.start} 节`) + ' · ' + DAY_PART(b.start)));
      }
      box.onclick = () => openSheet(b);
      grid.appendChild(box);
    }
  }

  /* v1.1.8：把「有课但画不出来」和「教务压根没课」分开说。
   * blocksOf 现在不再丢课，所以这里可以如实统计：
   *   n   = 本周落在网格上的课（按课程记录计，同一门课占多节只算 1）
   *   cn  = 本周末尾排不下、只能原地叠放的块数
   * 原来这里只说「本周 N 节课」，冲突被静默吞掉时数字和画面不一致。 */
  const n = totalOf(curWeek);
  let crowded = 0;
  for (let d = 1; d <= 7; d++) {
    for (const b of blocksOf(d, curWeek)) if (b.crowded) crowded++;
  }
  const t0 = TIMES.length ? '　·　作息已同步' : '　·　上下课钟点待校方作息表确认';
  let kbLine;
  if (n) {
    kbLine = `本周 ${n} 节课`;
    if (crowded) kbLine += `（其中 ${crowded} 段时段重叠，已叠加显示）`;
  } else if (DATA.courses.length) {
    /* 有课程数据但本周一节都不落 —— 最可能是周次没读懂。
     * 这时给「无课」会让人以为本学期没课，必须说清是不同的原因。 */
    kbLine = '本周没有课（已同步 ' + DATA.courses.length + ' 门，可能不在这一周）';
  } else {
    kbLine = '本周无课';
  }
  document.getElementById('kbtip').textContent = kbLine + t0;
  /* 一节课都没有 → 网格留着也没意义，盖一层引导上去。
   * 这是「每个人打开都是别人的课表」修完之后的必然结果：
   * 内置数据清空了，第一次进来就是空的，必须告诉用户下一步做什么。 */
  paintKbEmpty(!DATA.courses.length);
  paintKbBar(n);
}

/* ---------------- 课表状态条（v1.1.13） ----------------
 *
 * 用户报障原话：「20261430313 这个学号的同学不管怎么样，就是没有课程表，
 * 重新登陆，清数据，重新安装都试了」。截图里第 10 周整张网格全空、
 * 一个字都没有。
 *
 * 查下来第一层原因不是「没抓到课」，而是「抓到了但这一周没有」——
 * 而说明文字（kbLine / paintKbEmpty 的浮层）全都排在 14 行网格的下面。
 * 网格 14 × 46px ≈ 690px，加表头早就超出手机一屏，用户根本滚不到。
 * 于是「没同步」「周次没读懂」「本周确实没课」三种完全不同的状态，
 * 在屏幕上都长成同一张白纸。
 *
 * 这条状态条放在网格上方，永远在首屏；并且把三种状态说成三句不同的话。
 * 顺带给出「复制课表诊断」，让用户能把周次分布直接发回来——
 * 项目里从来没存过真实青果课表 HTML，没有这个出口就只能靠猜。
 */

/** 统计课表的周次分布，用来解释「为什么本周是空的」 */
function kbWeekStats() {
  const cs = Array.isArray(DATA.courses) ? DATA.courses : [];
  let min = Infinity, max = -Infinity, noWeeks = 0;
  const raws = [];
  cs.forEach((c) => {
    const w = Array.isArray(c.weeks) ? c.weeks : [];
    if (!w.length) {
      noWeeks++;
      const r = String(c.raw_weeks || '').trim();
      if (r && raws.indexOf(r) < 0 && raws.length < 8) raws.push(r);
      return;
    }
    w.forEach((x) => {
      const v = parseInt(x, 10);
      if (!isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
    });
  });
  return {
    total: cs.length,
    noWeeks: noWeeks,
    min: min === Infinity ? null : min,
    max: max === -Infinity ? null : max,
    raws: raws,
  };
}

/** 拼一段可复制的诊断文本：用户发回来就能定位是抓取问题还是解析问题 */
function kbDiagText() {
  const s = kbWeekStats();
  const L = [];
  L.push('【课表诊断】');
  L.push('学号：' + (currentUser() || '(未登记)'));
  L.push('版本：' + ((typeof About !== 'undefined' && About.version) ? About.version() : '--'));
  L.push('当前周：第 ' + curWeek + ' 周 / 共 ' + TOTAL_WEEKS + ' 周');
  L.push('起始日：' + fmt(START));
  L.push('学期：' + (DATA.term || '--'));
  L.push('数据来源：' + (DATA._source || '--') + '，同步于 ' + (DATA.synced_at ? new Date(DATA.synced_at * 1000).toLocaleString() : '--'));
  L.push('课程条数：' + s.total + '（其中周次没读到 ' + s.noWeeks + ' 条）');
  L.push('周次覆盖：' + (s.min == null ? '(无)' : ('第 ' + s.min + '-' + s.max + ' 周')));
  L.push('本周落课：' + totalOf(curWeek) + ' 条');
  if (s.raws.length) L.push('原始周次样例：' + s.raws.join(' | '));
  if (READ_ERR.schedule) L.push('读表错误：' + READ_ERR.schedule);
  /* v1.1.13：抓取层实测数字 —— 区分「抓取失败」和「解析失败」的唯一证据 */
  if (typeof XXMU !== 'undefined' && XXMU.diag) {
    try {
      const d = XXMU.diag();
      if (d && d.at) {
        L.push('');
        L.push('--- 上次抓取 ---');
        L.push('页面字节：' + d.bytes + '，解析出格子：' + d.cells + '，课程：' + d.courses);
        if (d.err) L.push('抓取层错误：' + d.err);
        if (d.samples && d.samples.length) {
          L.push('');
          L.push('--- 页面原文样例 ---');
          d.samples.forEach((x, i) => L.push('[样例 ' + (i + 1) + ']\n' + x));
        }
      }
    } catch (e) {}
  }
  /* 每门课一行，最多 30 条，够看出周次分布 */
  const cs = Array.isArray(DATA.courses) ? DATA.courses.slice(0, 30) : [];
  if (cs.length) {
    L.push('');
    L.push('--- 课程明细（最多 30 条）---');
    cs.forEach((c) => {
      const w = Array.isArray(c.weeks) ? c.weeks : [];
      L.push('周' + c.day + ' 第' + (Array.isArray(c.periods) ? c.periods.join(',') : '?') + ' 节 · '
        + (c.name || '?') + ' · 周次[' + (w.length ? w.join(',') : ('空:' + (c.raw_weeks || ''))) + ']');
    });
  }
  return L.join('\n');
}

let kbBarBound = false;
function paintKbBar(n) {
  const bar = document.getElementById('kbBar');
  if (!bar) return;
  const t = document.getElementById('kbBarT');
  const sub = document.getElementById('kbBarS');
  const bSync = document.getElementById('kbBarSync');
  const bDiag = document.getElementById('kbBarDiag');

  if (!kbBarBound) {
    kbBarBound = true;
    if (bSync) bSync.onclick = () => syncSchedule(true);
    if (bDiag) {
      bDiag.onclick = () => {
        const txt = kbDiagText();
        if (typeof Host !== 'undefined' && Host.clip) Host.clip(txt);
        else { try { navigator.clipboard.writeText(txt); } catch (e) {} }
        showTip('课表诊断已复制。\n\n把它发到更新群（1097668324），就能定位是抓取问题还是解析问题。\n\n预览：\n' + txt);
      };
    }
  }

  const s = kbWeekStats();
  let title = '', body = '', cls = '', showSync = false, showDiag = false;

  if (READ_ERR.schedule) {
    cls = 'bad'; title = '课表读不出来';
    body = READ_ERR.schedule + '\n重新从教务同步一次就会覆盖掉它。';
    showSync = true; showDiag = true;
  } else if (!s.total) {
    cls = ''; title = '还没有你的课表';
    body = '用你自己的学号登录一次教务，之后每次换学期重新同步一遍就行。';
    showSync = true;
  } else if (n > 0) {
    /* 本周有课 —— 网格自己会说话，不占地方 */
    bar.style.display = 'none';
    return;
  } else if (s.noWeeks === s.total) {
    cls = 'bad'; title = '同步到了 ' + s.total + ' 门课，但一条周次都没读懂';
    body = '所以它们上不了网格。这通常是教务页面里周次的写法变了。'
      + (s.raws.length ? ('\n原始周次：' + s.raws.join(' | ')) : '');
    showSync = true; showDiag = true;
  } else if (s.min != null && (curWeek < s.min || curWeek > s.max)) {
    cls = ''; title = '本周没有课';
    body = '你的课表覆盖第 ' + s.min + '–' + s.max + ' 周，现在是第 ' + curWeek + ' 周。'
      + '\n点标题栏两边的 ‹ › 换到有课的那一周。';
    showDiag = true;
  } else {
    cls = ''; title = '本周没有课';
    body = '已同步 ' + s.total + ' 门课，但都不落在第 ' + curWeek + ' 周。'
      + (s.noWeeks ? ('\n另有 ' + s.noWeeks + ' 门课的周次没读懂。') : '');
    showDiag = true;
  }

  bar.className = 'kb-bar' + (cls ? ' ' + cls : '');
  bar.style.display = 'block';
  if (t) t.textContent = title;
  if (sub) sub.textContent = body;
  if (bSync) bSync.style.display = showSync ? 'block' : 'none';
  if (bDiag) bDiag.style.display = showDiag ? 'block' : 'none';
}

/* 课表空态：说明为什么空 + 一个去登录的按钮 */
function paintKbEmpty(empty) {
  let box = document.getElementById('kbEmpty');
  if (!empty) { if (box) box.style.display = 'none'; return; }
  if (!box) {
    box = el('div', 'empty kb-empty');
    box.id = 'kbEmpty';
    const grid = document.getElementById('grid');
    grid.parentNode.insertBefore(box, grid.nextSibling);
  }
  box.innerHTML = '';
  /* v1.1.9：如果空是因为「有缓存但读不出来」，先说这件事。
   * 这两种空对用户的意义完全不同：一种是「你还没登录」，另一种是
   * 「数据在这儿但坏了」。都显示「还没有你的课表」，用户只会以为
   * 自己白登了，然后再登一遍（没用）。 */
  if (READ_ERR.schedule) {
    box.appendChild(el('b', '', '课表读不出来'));
    box.appendChild(el('p', '',
      READ_ERR.schedule + '\n\n'
      + '这不像是「还没登录」，更像是存着的课表坏了（比如写缓存时 App 被系统杀掉）。'
      + '重新从教务同步一次就会覆盖掉它。'));
    const rb = el('button', 'btn', '重新同步课表');
    rb.onclick = () => {
      if (typeof Host === 'undefined' || !Host.openLogin) {
        showTip('登录教务需要在 App 内进行。');
        return;
      }
      if (!AUTH.usable()) { showTip('请先回到开始页填写学号。'); Gate.show(); return; }
      Host.openLogin();
    };
    box.appendChild(rb);
    box.style.display = 'block';
    return;
  }
  box.appendChild(el('b', '', '还没有你的课表'));
  box.appendChild(el('p', '',
    '这个 App 不自带课表。用你自己的学号登录一次教务，'
    + '之后每次换学期重新同步一遍就行。'));
  const b = el('button', 'btn', '登录教务并同步');
  b.onclick = () => {
    if (typeof Host === 'undefined' || !Host.openLogin) {
      showTip('登录教务需要在 App 内进行。');
      return;
    }
    if (!AUTH.usable()) {
      showTip('请先回到开始页填写学号。');
      Gate.show();
      return;
    }
    Host.openLogin();
  };
  box.appendChild(b);
  box.style.display = 'block';
}

/* v1.1.8：加 Array.isArray 判据。旧缓存或手改的 JSON 里 weeks 可能是
 * 字符串 / null，`undefined.includes` 会抛 TypeError 把整个 renderWeek 打断，
 * 表现就是「课表一片空白，也没有任何提示」。 */
const totalOf = w => DATA.courses.filter(c => Array.isArray(c.weeks) && c.weeks.includes(w)).length;

/* 底部详情 */
function openSheet(b) {
  const sheet = document.getElementById('sheet');
  document.getElementById('sh-name').textContent = b.name;
  const rows = [];
  rows.push(['教室', b.room || '未安排']);
  rows.push(['教师', (b.teachers || []).join('、') || '—']);
  /* v1.1.8：`c.periods[0]` 原来没判空。
   * 只要有一条课程记录的 periods 不是数组（青果把节次列填了汉字、
   * 或者旧缓存格式不同），这里就抛 TypeError，点击课程什么都不会发生 ——
   * 用户描述是「点了没反应」，很难联想到数据里某个数组是空的。 */
  const ps = Array.isArray(b.ps) ? b.ps : [];
  const raw = DATA.courses
    .filter(c => clean(c.name) === b.name
      && Array.isArray(c.periods) && c.periods.length
      && ps.indexOf(c.periods[0]) >= 0)
    .map(c => c.raw_weeks).filter(Boolean);
  rows.push(['周次', [...new Set(raw)].join(' / ') || '—']);
  const body = document.getElementById('sh-body');
  body.innerHTML = '';
  rows.forEach(([k, v]) => {
    const r = el('div', 'row');
    r.appendChild(el('span', '', k));
    const val = el('span', 'v', v);
    r.appendChild(val);
    body.appendChild(r);
  });
  sheet.classList.add('on');
}

/* v1.1.66 / m00638：关闭统一走 closeSheet()。原来这里只 remove('on')，
 * 会把搬进 .sh-box 的账号绑定卡组留在半框里（隐藏但仍是 .sh-box 子级），
 * 下一次课表详情 openSheet 打开半框时它就跟着一起显出来叠在详情下面。
 * closeSheet 会 parkTools() 把卡搬回停车场并清掉 sh-body，才是干净收尾。 */
document.getElementById('sh-close').onclick = () => closeSheet();
document.getElementById('sheet').onclick = e => {
  if (e.target.id === 'sheet') closeSheet();
};

/* 读取课表，优先级：
 *   1. 外部 JSON 文件（PC 同步，可不重打包换数据）
 *   2. App 内登录抓取的缓存
 *   3. window.SCHEDULE（APK 内置兜底）
 *
 * v1.1.9：四个读取函数不再「悄悄吞掉异常」。
 *
 * 原来每个都是 `try { ... } catch (e) {}`，return null。后果：
 *   · 缓存文件写到一半（进程被杀、磁盘满）→ JSON.parse 抛 → 当成「没有缓存」
 *     → 掉到下一层 → 下一层也没有 → 课表页空白，一个字都不提示；
 *   · 学生看到的只有「空」，以为是学校没排课 / 软件坏了，
 *     而真正的原因（那份缓存解析失败）在任何一个界面上都看不到。
 * 现在把失败原因记进 READ_ERR，由 paintKbEmpty 显示出来，
 * 并且**明确区分**「真的没有数据」和「有数据但读不出来」——
 * 后者要建议「重新同步」，前者不要。
 */
const READ_ERR = { schedule: '', homework: '' };
function readFail(which, e, extra) {
  const s = String((e && e.message) || e || '未知错误');
  READ_ERR[which] = (extra ? extra + '：' : '') + s;
  try { console.warn('[xxmu] 读' + which + '失败', s); } catch (x) {}
}

function readExternal() {
  try {
    if (typeof Host !== 'undefined' && Host.externalSchedule) {
      const raw = Host.externalSchedule();
      /* v1.1.15：Java 侧读失败现在返回 null（原来是空串，和「没有文件」同形）。
       * 必须在这里就把「读不出来」记成错误 —— 否则它会被当成「没有外部课表」，
       * 静默退到缓存；缓存也读不出来时又退到内置 window.SCHEDULE，
       * 学生看到的是上一学期甚至别人的课表，界面却写着「已同步」。 */
      if (raw === null) {
        readFail('schedule', '文件存在但读不出来', '外部课表读取失败');
        return null;
      }
      if (raw && raw.length > 20) {
        let d = null;
        try {
          d = JSON.parse(raw);
        } catch (e) {
          /* 有内容但解析不了 —— 这是「坏」，不是「空」 */
          readFail('schedule', e, '外部课表 JSON 解析失败');
          return null;
        }
        if (d && Array.isArray(d.courses) && d.courses.length) {
          d._source = 'external';
          return d;
        }
        /* 解析成功但没有 courses：可能是半成品文件 */
        if (d) readFail('schedule', '文件里没有 courses 数组', '外部课表内容不完整');
      }
    }
  } catch (e) {
    readFail('schedule', e, '读外部课表出错');
  }
  return null;
}

/* App 内登录抓取后缓存的课表 */
function readCached() {
  try {
    if (typeof Host !== 'undefined' && Host.cachedSchedule) {
      const raw = Host.cachedSchedule();
      if (raw === null) {
        readFail('schedule', '缓存文件存在但读不出来', '本地课表缓存读取失败');
        return null;
      }
      if (raw && raw.length > 20) {
        let d = null;
        try {
          d = JSON.parse(raw);
        } catch (e) {
          readFail('schedule', e, '本地课表缓存解析失败');
          return null;
        }
        if (d && Array.isArray(d.courses) && d.courses.length) {
          d._source = 'app';
          return d;
        }
        if (d) readFail('schedule', '缓存里没有 courses 数组', '本地课表缓存不完整');
      }
    }
  } catch (e) {
    readFail('schedule', e, '读本地课表缓存出错');
  }
  return null;
}

/* ===== 学习页：学习通作业待办 ===== */
const HW_COLORS = {
  '待做': '#e8710a', '重新编辑': '#e8710a', '未交': '#d93025', '未提交': '#d93025',
  '待批阅': '#1a73e8', '未批阅': '#1a73e8', '已批阅': '#34a853',
  '未开始': '#1a73e8', '未开考': '#1a73e8', '进行中': '#d93025',
  '已完成': '#34a853', '已过期': '#b0b0b0', '已结束': '#b0b0b0',
  '状态未知': '#9aa0a6',
};
/* v1.1.24：EXAM_OPEN 已废弃（历史上用于考试 open 判断，现在全走
 * CX.classify 的 notstart 类）。留着仅供外部调试参考，不再参与任何判断。 */
const EXAM_OPEN = ['未开始', '待做', '进行中', '待考'];

/** 这条是不是「真的已经不用做了」（区别于「状态没读到」） */
function isDoneStatus(st) {
  if (typeof CX === 'undefined') return false;
  return CX.classify(st) === 'done';
}

function readExternalHomework() {
  try {
    if (typeof Host !== 'undefined' && Host.externalHomework) {
      const raw = Host.externalHomework();
      if (raw === null) {
        readFail('homework', '文件存在但读不出来', '外部作业读取失败');
        return null;
      }
      if (raw && raw.length > 20) {
        let d = null;
        try {
          d = JSON.parse(raw);
        } catch (e) {
          readFail('homework', e, '外部作业 JSON 解析失败');
          return null;
        }
        if (d && Array.isArray(d.works)) { d._source = 'external'; return d; }
        if (d) readFail('homework', '文件里没有 works 数组', '外部作业内容不完整');
      }
    }
  } catch (e) {
    readFail('homework', e, '读外部作业出错');
  }
  return null;
}

/* App 内缓存的作业 */
function readCachedHomework() {
  try {
    if (typeof Host !== 'undefined' && Host.cachedHomework) {
      const raw = Host.cachedHomework();
      if (raw === null) {
        readFail('homework', '缓存文件存在但读不出来', '本地作业缓存读取失败');
        return null;
      }
      if (raw && raw.length > 20) {
        let d = null;
        try {
          d = JSON.parse(raw);
        } catch (e) {
          readFail('homework', e, '本地作业缓存解析失败');
          return null;
        }
        if (d && Array.isArray(d.works)) { d._source = 'app'; return d; }
        if (d) readFail('homework', '缓存里没有 works 数组', '本地作业缓存不完整');
      }
    }
  } catch (e) {
    readFail('homework', e, '读本地作业缓存出错');
  }
  return null;
}

const pad2 = n => String(n).padStart(2, '0');
function fmtLeft(h) {
  if (h == null) return '';
  if (h < 0) return '已过期';
  if (h < 1) return '还剩 ' + Math.max(1, Math.round(h * 60)) + ' 分钟';
  if (h < 48) {
    /* 分钟四舍五入会进位到 60（还剩 25 小时 60 分），这里先归一化再拼字 */
    let hh = Math.floor(h);
    let mm = Math.round((h % 1) * 60);
    if (mm >= 60) { mm -= 60; hh += 1; }
    if (mm === 0) return '还剩 ' + hh + ' 小时';
    return '还剩 ' + hh + ' 小时 ' + mm + ' 分';
  }
  return '还剩 ' + Math.floor(h / 24) + ' 天';
}

/** 一条条目该归哪一堆（v1.1.77）。
 * 抽成纯函数是为了能被 tools/test_hwsort.js 直接钉住 —— 分桶错了会让人
 * 看见「交不了的东西占满首屏」，而这种事只有真机才看得出来，测试必须能覆盖。
 *    done      平台明确说做完了（去「已完成」视图）
 *    expired   截止时间已过、又没判完成 → 单独一段折叠，不占「待完成」
 *    notstart  还没开放（考试未开考 / 作业未开始）
 *    todo      还能做 → 进「待完成」，按截止时间从近到远
 *    unknown   状态没读到、也没过截止（宁可信其有，留在待完成侧）
 * expired 优先于 notstart：一条「未开放」的作业如果截止都过了，那它已经废了。 */
/* @testable:hwBucket */
function hwBucket(x) {
  if (!x) return 'unknown';
  if (typeof isDoneStatus === 'function' && isDoneStatus(x.status)) return 'done';
  /* expired 既认外部标志位，也自己按剩余时间算一遍：
   * 别的地方（旧缓存回放、测试、别的调用点）不一定都填了这个字段，
   * 而「left 是负数」本身就是过期，不需要谁来告诉我。 */
  const passed = (x.expired === true)
    || (x.left != null && x.left < 0);
  if (passed) return 'expired';
  if (x.notStart) return 'notstart';
  if (x.open) return 'todo';
  return 'unknown';
}
/* @end */

/* ===== 学习页：作业与考试待办 =====
 *
 * 两种排法，用户自己选（存在 pref 里，下次进来还是这个排法）：
 *   按紧急度 —— 截止时间从近到远。要「现在该干什么」看这个。
 *   按课程   —— 同一门课的作业和考试聚在一起。要「这门课我还欠什么」看这个。
 *
 * 为什么不做「真正的优先级算法」（重要度/学分/占比加权）：那些权重只能拍脑袋，
 * 拍错了反而误导人。截止时间是可验证的硬事实，排它不会错。
 */

const SORT_K = 'xxmu_sort';
const FILT_K = 'xxmu_filter';
const SRCF_K = 'xxmu_src_filter';   // v1.1.66：多平台来源筛选
const DVIEW_K = 'xxmu_done_view';   // v1.1.66：待完成 / 已完成 视图切换
const SORTS = ['urgent', 'course'];
const FILTERS = ['all', 'work', 'exam'];

function prefGet(k, def) {
  try {
    if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(k) || def;
  } catch (e) {}
  return def;
}
function prefSet(k, v) {
  try {
    if (typeof Host !== 'undefined' && Host.setPref) Host.setPref(k, v);
  } catch (e) {}
}

function curSort() {
  const s = prefGet(SORT_K, 'urgent');
  return SORTS.indexOf(s) >= 0 ? s : 'urgent';
}
function curFilter() {
  const f = prefGet(FILT_K, 'all');
  return FILTERS.indexOf(f) >= 0 ? f : 'all';
}
/* v1.1.66：多平台来源筛选。返回 'all' 或某来源 id；SOURCES 不存在时恒为 all，
 * 保证老版本行为一字不变。 */
function curSrcFilter() {
  if (typeof SOURCES === 'undefined') return 'all';
  const s = prefGet(SRCF_K, 'all');
  if (s === 'all') return 'all';
  return SOURCES.get(s) ? s : 'all';
}
/* v1.1.66：待完成 / 已完成 视图。默认看待完成（老用户升级后行为一字不变），
 * 存的值只认 'done'，别的（含没存过）一律落到 'todo'。 */
function curDoneView() {
  return prefGet(DVIEW_K, 'todo') === 'done' ? 'done' : 'todo';
}

function renderHomework() {
  /* 数据优先级：
   *   1. 外部 JSON（PC 同步，给不登录的场合留着）
   *   2. App 内学习通实时抓取（v0.9.9 起的主路）
   *   3. 旧版留下的文件缓存
   *   4. 内置兜底（现在是空的）
   */
  /* v1.1.66：多来源聚合。SOURCES.live() 已把学习通（builtin）连同新平台
   * 合并成单一 d，形状与旧 CX.cached() 完全一致；一个都没抓到时返回 null，
   * 让下面原有优先级链继续往下走（外部 JSON → 旧缓存 → 内置兜底）。 */
  const live = (typeof SOURCES !== 'undefined') ? SOURCES.live()
    : ((typeof CX !== 'undefined') ? CX.cached() : null);
  /* 每次重画都重新读一遍来源，所以先把上一轮的读取错误清掉 ——
   * 否则修好之后那行「作业数据读不出来」会一直挂在页面上。 */
  READ_ERR.homework = '';
  /* 各来源缓存的读取失败由各自 cached() 记（学习通见 chaoxing.js，
   * 新平台见 sources.js 的 define），这里汇总回来 —— 不然「缓存坏了」
   * 和「没同步过」在界面上还是一模一样。 */
  if (!live) {
    const errs = [];
    if (typeof SOURCES !== 'undefined') {
      SOURCES.list().forEach(s => {
        try { const e = String(s.readErr ? s.readErr() : ''); if (e) errs.push(e); }
        catch (err) {}
      });
    } else if (typeof CX !== 'undefined' && CX.readErr) {
      const ce = String(CX.readErr() || '');
      if (ce) errs.push(ce);
    }
    if (errs.length) READ_ERR.homework = errs.join('；');
  }
  const d = (window.__HW = readExternalHomework() || live || readCachedHomework()
    || window.HOMEWORK || { works: [] });
  const now = Date.now() / 1000;

  /* ---- 1. 算时间，统一成一个「条目」数组 ----
   * 作业和考试结构不同（考试有开始时间、有分数），所以先归一化成
   * {kind:'work'|'exam', course, name, status, open, left, due, raw}，
   * 后面排序和渲染都只跟这个结构打交道。 */
  const items = [];

  /* v1.1.8：`window.HOMEWORK` 这条兜底原来没校验数组形状。
   * 前三个来源（readExternalHomework / CX.cached / readCachedHomework）
   * 各自都校验过 Array.isArray(d.works)，只有最后这个全局变量没有 ——
   * homework.js 结构变了、被换成 {}、或者注入时机晚于 app.js 导致
   * window.HOMEWORK 是半成品时，`for (const w of undefined)` 会抛
   * TypeError，整个 renderHomework 中断在渲染之前：作业页停在旧 DOM 或全白，
   * 一句提示都没有。统一在这里兜一次。 */
  const works = (d && Array.isArray(d.works)) ? d.works : [];
  const examsRaw = (d && Array.isArray(d.exams)) ? d.exams : [];

  for (const w of works) {
    let left = null;
    try {
      const due = new Date(String(w.end || '').replace(/-/g, '/')).getTime() / 1000;
      if (!isNaN(due)) left = (due - now) / 3600;
    } catch (e) {}
    w._left = left;
    /* 状态口径交给 CX.classify 统一判断。
     * 原来写死「等于 待做/重新编辑 才算未完成」，学习通把文案一改
     * 或者带上 &nbsp; 就整批判错——这正是「做完了还显示未完成」的根因。 */
    const k = (typeof CX !== 'undefined') ? CX.classify(w.status) : 'unknown';
    /* 优先采信抓取时算好的 status_known（chaoxing.js 的 finish 会写），
     * 旧缓存里没有这个字段时现场补算一次——用户升级后还没重新同步，
     * 手上那份 JSON 是上一版抓的，没有这个键。 */
    const known = (typeof w.status_known === 'boolean')
      ? w.status_known : !!String(w.status || '').trim();
    /* v1.1.24：notstart（未开始）单独一类，open=false，
     * 渲染时单独列「未开始」组，不混进「待完成」。 */
    if (k === 'open') w._open = true;
    else if (k === 'done' || k === 'notstart') w._open = false;
    else w._open = (left == null || left > 0);
    /* 角标文字：状态读到了就照原样显示（学习通写什么就显示什么），
     * 读不到就明说「状态未知」。绝不印「—」，更不印「已过期」——
     * 截止时间过了只说明不能再交，不等于他交过；印「已过期」会被
     * isDoneStatus 归到达成侧，又绕回「没交的显示已完成」那个坑。
     * 到底过没过期，卡片下面的倒计时本来就写着「已过期」，不用角标重复。 */
    const shown = known ? w.status : '状态未知';
    items.push({
      kind: 'work', raw: w, course: clean(w.course) || '未标注课程',
      name: w.name || '(未命名作业)', status: shown,
      open: w._open, notStart: k === 'notstart', left: left,
      /* v1.1.77（m04098）：截止时间已经过去、又不算完成 → 单独归「已过截止」。
       * 以前这类条目 open 仍是 true（"待做"就是没交，这是事实），于是
       * 一股脑堆在「待完成」里，而且 left 是负数，越老的过期越负、
       * 按紧急度排序时全跑到最上面 —— 待完成被一堆交不了的东西占满。 */
      expired: (left != null && left < 0),
    });
  }

  const exams = examsRaw;
  for (const e of exams) {
    let due = null, start = null;
    try {
      due = new Date(String(e.end || '').replace(/-/g, '/')).getTime() / 1000;
      start = new Date(String(e.start || '').replace(/-/g, '/')).getTime() / 1000;
      if (isNaN(due)) due = null;
      if (isNaN(start)) start = null;
    } catch (err) { due = null; start = null; }
    e._due = due; e._start = start;
    e._leftStart = start != null ? (start - now) / 3600 : null;
    const ke = (typeof CX !== 'undefined') ? CX.classify(e.status) : 'unknown';
    const knownE = (typeof e.status_known === 'boolean')
      ? e.status_known : !!String(e.status || '').trim();
    const upcoming = start != null && start > now;
    /* 考试同理，并且多一条硬事实：**还没到开考时间，就不可能是「已完成」**。
     * 用户报「有的考试是未开始却也显示已完成」，那要么是状态读错了，
     * 要么是分块错位把上一场的状态安到了这一场上——不管哪种，
     * 开考时间没到就以时间为准，这条不依赖任何解析结果。
     * v1.1.24：notstart（未开始）与 upcoming（还没到开考时间）都单独列
     * 「未开始」组，不再混进「待完成」。 */
    const notStarted = upcoming || ke === 'notstart';
    if (notStarted) e._open = false;
    else if (ke === 'open') e._open = true;
    else if (ke === 'done') e._open = false;
    else e._open = (due == null || due > now);
    /* 考试角标同理：读不到状态就只能说「未开考」（有开考时间可依据）
     * 或「状态未知」，不能借着「结束时间过了」就印「已结束」——
     * 那等于替他宣布这场考试结案了，而他可能根本没去考。 */
    const shownE = knownE ? e.status : (upcoming ? '未开考' : '状态未知');
    items.push({
      kind: 'exam', raw: e, course: clean(e.course) || '未标注课程',
      name: e.name || '(未命名考试)', status: shownE,
      open: e._open, notStart: notStarted,
      left: due != null ? (due - now) / 3600 : null,
      leftStart: e._leftStart,
      /* v1.1.77：结束时间已过、又没判完成 → 归「已过截止」，不占「待完成」。
       * 判据是结束时间而不是状态：状态没读到也不能一直挂在待完成顶上。 */
      expired: (due != null && due < now),
    });
  }

  /* ---- 2. 顶部统计（不受筛选影响，永远是全量） ----
   * v1.1.77：已过截止的不再算「待做」——交不了了，堆在待做里只会把数字撑大、
   * 把真正还有时间的东西挤下去。单独数一份，够诚实也不误导。 */
  const openWorks = items.filter(x => x.kind === 'work' && x.open && !x.expired);
  const openExams = items.filter(x => x.kind === 'exam' && x.open && !x.expired);
  const expWorks = items.filter(x => x.kind === 'work' && x.expired
    && !isDoneStatus(x.status));
  const expExams = items.filter(x => x.kind === 'exam' && x.expired
    && !isDoneStatus(x.status));
  const expN = expWorks.length + expExams.length;

  document.getElementById('hwcount').textContent =
    (openWorks.length ? openWorks.length + ' 条待做' : '作业全清') +
    (openExams.length ? ' · ' + openExams.length + ' 场考试待考' : '') +
    (expN ? ' · ' + expN + ' 条已过截止' : '');

  const fmtTs = ts => ts ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }) : '未同步';
  const st = document.getElementById('hwStat');
  if (st) st.textContent = openWorks.length + ' 待做 / ' + openExams.length + ' 待考';
  const hsa = document.getElementById('hwSyncAt');
  if (hsa) hsa.textContent = fmtTs(d.synced_at);
  const src = document.getElementById('srcTag');
  if (src) {
    const label = s => s === 'external' ? '外部JSON' : s === 'app' ? '教务同步'
      : s === 'multi' ? '多平台' : '内置';
    /* v1.1.66：多平台时把「已并入几路」写出来，用户一眼知道数据不是单一来源。 */
    let hwLabel = label(d._source);
    if (d._source === 'multi' && Array.isArray(d.sources)) {
      const okN = d.sources.filter(s => s && s.state === 'ok').length;
      if (okN) hwLabel = '多平台 · ' + okN + ' 路';
    }
    src.textContent = label(DATA._source) + '（课表） / ' + hwLabel + '（作业）';
  }

  /* ---- 3. 筛选 ---- */
  const filt = curFilter();
  let pool = items;
  if (filt === 'work') pool = items.filter(x => x.kind === 'work');
  else if (filt === 'exam') pool = items.filter(x => x.kind === 'exam');
  /* v1.1.66：来源筛选叠加在类型筛选之上。x.raw.source 由 SOURCES.tag 打上，
   * 只有 ok 来源的数据才带；外部 JSON / 旧缓存没有 source，归到「全部」。 */
  const sf = curSrcFilter();
  if (sf !== 'all') {
    pool = pool.filter(x => x.raw && (x.raw.source === sf || x.raw._src === sf));
  }

  /* ---- 4. 排序 ---- */
  const byDue = (a, b) => {
    // 没有截止时间的排最后，别插在紧急的前面
    const av = a.left == null ? Infinity : a.left;
    const bv = b.left == null ? Infinity : b.left;
    return av - bv;
  };

  const box = document.getElementById('hwlist');
  box.innerHTML = '';

  if (!items.length) {
    /* 空态分三种，不能混成一种说：
     *   1) 存着的作业数据坏了（READ_ERR.homework 有值）—— 先说这个；
     *   2) 没登录学习通 → 引导去登录；
     *   3) 登录了但真没作业 → 说清楚。
     * 第一种以前根本不存在：readExternalHomework / readCachedHomework
     * 把解析异常全吞了，坏缓存跟「没有数据」在界面上完全一样。 */
    if (READ_ERR.homework) {
      const tip = el('div', 'empty');
      tip.appendChild(el('b', '', '作业数据读不出来'));
      tip.appendChild(el('p', '',
        READ_ERR.homework + '\n\n'
        + '存着的作业数据坏了（常见于同步到一半 App 被系统杀掉）。'
        + '重新抓一次就会覆盖掉它。'));
      const rb = el('button', 'btn', '重新抓一次');
      rb.onclick = () => { if (typeof CxUI !== 'undefined') CxUI.sync(false); };
      tip.appendChild(rb);
      box.appendChild(tip);
      return;
    }
    const cxOn = (typeof CX !== 'undefined') && CX.loggedIn();
    /* v1.1.66：学习通没数据，也可能是「别的平台还没绑」。只要注册了新平台，
     * 就顺手指一条路，别让人对着空白页以为只支持学习通。 */
    const hasOther = (typeof SOURCES !== 'undefined')
      && SOURCES.list().some(s => s && !s.builtin);
    if (!cxOn) {
      const tip = el('div', 'empty');
      tip.appendChild(el('b', '', '还没有作业数据'));
      /* v1.1.66 / m00638：连接卡已收进二级半框，空态别再指「下方」，
       * 改成直接把人送进「账号绑定」半框（学习通登录卡就在里面第一张）。 */
      tip.appendChild(el('p', '',
        '在「账号绑定」里登录学习通，作业和考试会自动同步。'
        + (hasOther ? '\n喜鹊儿、雨课堂、知到也在同一个入口里绑定。' : '')));
      const b = el('button', 'btn', '账号绑定');
      b.onclick = () => openToolCard('bindCard');
      tip.appendChild(b);
      box.appendChild(tip);
    } else {
      box.appendChild(el('p', 'hint',
        '学习通里没有待做的作业和考试。\n如果确实有，点上面的「刷新」重新抓一次。'
        + (hasOther ? '\n其他平台可在「账号绑定」里连接。' : '')));
    }
    return;
  }
  if (!pool.length) {
    box.appendChild(el('p', 'hint',
      filt === 'work' ? '没有作业。' : filt === 'exam' ? '没有考试。' : '没有内容。'));
    return;
  }

  const sort = curSort();

  /* v1.1.66：待完成 / 已完成 视图切换（点顶部 #doneSeg 换下面整块内容）。
   * 「已完成」只平铺平台明确判 done 的条目（isDoneStatus），按截止时间倒序，
   * 最近做完的在最前；状态没读到、未开考、还没到开考时间的一律留在「待完成」，
   * 绝不冒充完成——这是本项目从 v1.1.5 起就没松过的红线。
   * 切到「已完成」时不再套用按课程分组/底部折叠：回看做过什么就是要一眼看全。 */
  const dview = curDoneView();
  if (dview === 'done') {
    const doneOnly = pool.filter(x => isDoneStatus(x.status))
      .sort((a, b) => (b.left ?? -1e9) - (a.left ?? -1e9));
    if (!doneOnly.length) {
      box.appendChild(el('p', 'hint',
        '还没有已完成的作业和考试。\n状态没读到的条目不算「已完成」，仍留在「待完成」里。'));
      return;
    }
    box.appendChild(el('div', 'hwsec', '已完成 · ' + doneOnly.length));
    const wrap = el('div');
    doneOnly.forEach(x => wrap.appendChild(cardOf(x)));
    box.appendChild(wrap);
    return;
  }
  /* 待完成视图：把「明确已完成」的条目摘出去（它们去上面的「已完成」视图看），
   * 状态没读到 / 未开考 / 还没做的都留下，保持老版本分组与折叠一字不变。 */
  pool = pool.filter(x => !isDoneStatus(x.status));
  if (!pool.length) {
    box.appendChild(el('p', 'hint',
      '待完成里暂时没有条目。\n做过的可以点上面的「已完成」回看。'));
    return;
  }

  if (sort === 'course') {
    /* 按课程分组：先按「这门课最紧急的一条」排课程顺序，组内再按截止时间。
     * 这样最该动手的课永远在最上面，而不是按拼音把「大学英语」排到最前。 */
    const groups = new Map();
    pool.forEach(x => {
      if (!groups.has(x.course)) groups.set(x.course, []);
      groups.get(x.course).push(x);
    });
    const order = Array.from(groups.keys()).sort((a, b) => {
      /* v1.1.77：只有「还能做的」才算紧急；整门课都过截止了，就沉到最后，
       * 别拿负数剩余时间去抢最上面的位置。 */
      const urg = g => groups.get(g)
        .filter(x => !x.expired)
        .map(x => (x.left == null ? 1e9 : x.left));
      const amin = Math.min.apply(null, urg(a).concat([1e9]));
      const bmin = Math.min.apply(null, urg(b).concat([1e9]));
      return amin - bmin;
    });
    order.forEach(course => {
      /* 组内顺序：未完成的按截止时间在前，已完成的沉到组底。
       * 不能整体 byDue —— 已完成/已过期的 left 是负数或很小，会全跑到
       * 最上面去，看起来像「这门课的活都干完了」。 */
      const list = groups.get(course).slice().sort((a, b) => {
        /* v1.1.28：待做排最前（先看到要动的），未开始其次，已完成沉底。
         * v1.1.77：已过截止的插在「未开始」之后、已完成之前——它已经做不了，
         * 但也不能跟已完成混在一起。 */
        const ra = x => (x.open && !x.expired) ? 0 : (x.expired ? 1 : (x.notStart ? 2 : 3));
        if (ra(a) !== ra(b)) return ra(a) - ra(b);
        const av = a.left == null ? Infinity : a.left;
        const bv = b.left == null ? Infinity : b.left;
        return av - bv;
      });
      const todo = list.filter(x => x.open && !x.expired).length;
      const exp = list.filter(x => x.expired).length;
      const ns = list.filter(x => !x.open && !x.expired && x.notStart).length;
      const unk = list.filter(x => !x.open && !x.expired && !x.notStart
        && !isDoneStatus(x.status)).length;
      const head = el('div', 'grp-head', course);
      /* 组头也不能说「全部完成」而里面躺着状态没读到的条目——
       * 同样是「拿我们的解析失败冒充他的进度」。 */
      const parts = [];
      if (todo) parts.push(todo + ' 项未完成');
      if (ns) parts.push(ns + ' 项未开始');
      if (exp) parts.push(exp + ' 项已过截止');
      if (unk) parts.push('情况不明 ' + unk + ' 项');
      head.appendChild(el('span', '',
        parts.length ? parts.join(' · ') + ' · 共 ' + list.length : '全部完成 · 共 ' + list.length));
      box.appendChild(head);
      const wrap = el('div');
      list.forEach(x => wrap.appendChild(cardOf(x)));
      box.appendChild(wrap);
    });
  } else {
    /* 按紧急度：能做的按截止时间从近到远排在「待完成」，已过截止的单独折叠。
     *
     * v1.1.5：收尾的那一堆拆成两段。以前不管状态读没读到，只要 not open
     * 就一律写「已完成 · N」——用户看到「内脏学」躺在「已完成」里，
     * 而他明明没交。读不到状态是**我们**的问题，不能拿它冒充事实。
     *   已完成   = 学习通明确说了做完了（已完成/已提交/待批阅…）
     *   状态未知 = 状态没读到，且已过截止时间（既不能算待做，也不能算做完）
     *
     * v1.1.77（m04098 原话「已过期的不显示在待完成里，这个按时间从近到远排序，
     * 就是按紧急程度排序」）：已过截止的条目以前 open 仍为 true（"待做"是事实），
     * 于是全堆进「待完成」，而 left 是负数、越老的过期越负，按 byDue 排就全跑到
     * 最上面 —— 交不了的东西占满首屏，真正还有时间的被挤到看不见。
     * 现在按截止是否过去先分成两堆，只有「还能做的」进待完成。 */
    /* v1.1.28：「未开始」组从最前挪到「待完成」之后——用户看着页面时，
     * 眼睛先要看到「现在就得做」的东西（待完成），「还没开放」的排后面，
     * 它反正做不了，放最前只会把真正紧急的往下挤。 */
    const notstart = pool.filter(x => hwBucket(x) === 'notstart')
      .sort(byDue);
    const open = pool.filter(x => hwBucket(x) === 'todo').sort(byDue);
    /* 已过截止：按「越接近现在越靠前」排（left 降序）。用 byDue 升序会把
     * 最老的过期项顶到这段最上面——虽然都交不了了，但翻的时候第一眼该看到
     * 的是刚过期那条，不是上学期九月的。 */
    const expired = pool.filter(x => hwBucket(x) === 'expired')
      .sort((a, b) => (b.left ?? -1e9) - (a.left ?? -1e9));
    const closed = pool.filter(x => {
      const b = hwBucket(x);
      return b === 'done' || b === 'unknown';
    });
    const done = closed.filter(x => hwBucket(x) === 'done')
      .sort((a, b) => (b.left ?? -1e9) - (a.left ?? -1e9));
    const unknown = closed.filter(x => hwBucket(x) === 'unknown')
      .sort((a, b) => (b.left ?? -1e9) - (a.left ?? -1e9));

    if (open.length) {
      box.appendChild(el('div', 'hwsec', '待完成 · ' + open.length));
      const wrap = el('div');
      open.forEach(x => wrap.appendChild(cardOf(x)));
      box.appendChild(wrap);
    } else {
      box.appendChild(el('p', 'hint',
        '现在没有还要交的。\n已过截止的在下面，想回看可以展开。'));
    }
    if (notstart.length) {
      box.appendChild(el('div', 'hwsec', '未开始 · ' + notstart.length));
      const wrap = el('div');
      notstart.forEach(x => wrap.appendChild(cardOf(x)));
      box.appendChild(wrap);
    }
    if (done.length) {
      const wrap = el('div');
      done.forEach(x => wrap.appendChild(cardOf(x)));
      box.appendChild(foldSec('已完成 · ' + done.length, wrap, false));
    }
    /* v1.1.77：已过截止单独一段、默认收起。文案只说「已过截止」，
     * 不说「已完成」——他没交，是我们没资格替他结案。 */
    if (expired.length) {
      const wrap = el('div');
      expired.forEach(x => wrap.appendChild(cardOf(x)));
      box.appendChild(foldSec('已过截止 · ' + expired.length, wrap, false));
    }
    if (unknown.length) {
      const wrap = el('div');
      unknown.forEach(x => wrap.appendChild(cardOf(x)));
      /* 这一段是「状态没读到」的条目，按截止时间再分成两句实话：
       * 过了截止的不能再交，没过截止的还来得及。都不说「已完成」。 */
      const allExpired = unknown.every(x => x.left != null && x.left < 0);
      box.appendChild(foldSec(
        (allExpired ? '已过截止，状态未读到 · ' : '状态未读到 · ') + unknown.length, wrap, false));
    }
  }
}

/** 一条作业/考试卡片 */
function cardOf(x) {
  const it = el('div', 'hw');
  /* v1.1.57：把原始状态词挂到 DOM 上，供皮肤层按语义重上色。
   * 为什么需要它：下面这三种颜色是**内联 style**（bar.style.background /
   * badge.style.color），外部 CSS 读不到「这条是未开始还是未交」，
   * 只能一刀切把它压成单色、把状态语义一起丢掉。
   * 挂在属性上之后，经典皮肤完全不受影响（它没有对应的属性选择器），
   * 万象舱皮肤可以自己决定「未开始用中性、逾期用珊瑚」，各层不打架。 */
  it.setAttribute('data-st', x.status || '');
  const color = HW_COLORS[x.status] || '#9aa0a6';
  const bar = el('i', 'hwbar');
  bar.style.background = color;
  it.appendChild(bar);

  const main = el('div', 'hwmain');
  const top = el('div', 'hwtop');

  const title = (x.kind === 'exam' ? '📝 ' : '') + x.name;
  top.appendChild(el('b', '', title));
  const badge = el('span', 'hwbadge', x.status);
  badge.style.color = color;
  badge.style.borderColor = color + '55';
  top.appendChild(badge);
  /* v1.1.66：来源徽标。条目带了 source 才显示，旧缓存 / 外部 JSON 不带就不画，
   * 免得把「不知道哪来的」硬说成某个平台。短名由 SOURCES.get() 提供；
   * 经过 SOURCES.live() 合并的条目（含学习通「超星」）都会带来源，逐条可辨。 */
  if (x.raw && (x.raw.source || x.raw._src) && typeof SOURCES !== 'undefined') {
    const s = SOURCES.get(x.raw.source || x.raw._src);
    if (s) top.appendChild(el('span', 'src-badge', s.short || s.label));
  }
  main.appendChild(top);

  /* v1.1.73：考试卡片的标题已经是课程名，副行再写一遍课程名等于重复
   * （真机 m03292：标题两行、副行又「考试 · 高等数学B1 5.0」）。副行改用
   * 轮次——「期中考试」比课程名有信息量；没有轮次才退回课程名。
   * 前缀 '考试 · ' 保留：nova-organs.js 分面靠它认考试。 */
  const examRound = String((x.kind === 'exam' && x.raw && x.raw.round) || '').trim();
  main.appendChild(el('span', 'hwcourse',
    (x.kind === 'exam' ? '考试 · ' + (examRound || x.course) : x.course)));

  const meta = el('div', 'hwmeta');
  if (x.open) {
    let txt = '';
    if (x.kind === 'exam' && x.leftStart != null) {
      txt = x.leftStart > 0 ? '距开考 ' + fmtLeft(x.leftStart) : fmtLeft(x.left);
    } else if (x.left != null) {
      txt = fmtLeft(x.left);
    }
    if (txt) {
      const lf = el('span', 'hwleft', txt);
      if (x.left != null && x.left < 0) lf.classList.add('red');
      else if ((x.left != null && x.left < 24) || (x.leftStart != null && x.leftStart < 48))
        lf.classList.add('orange');
      else lf.classList.add('gray');
      meta.appendChild(lf);
    }
  } else if (x.notStart) {
    /* 未开始的条目也要能看到时间：考试显示距开考，作业照常显示 */
    let txt = '';
    if (x.kind === 'exam' && x.leftStart != null && x.leftStart > 0) {
      txt = '距开考 ' + fmtLeft(x.leftStart);
    } else if (x.left != null) {
      txt = fmtLeft(x.left);
    }
    if (txt) meta.appendChild(el('span', 'hwleft gray', txt));
  }
  if (x.kind === 'exam' && x.raw.score) {
    meta.appendChild(el('span', 'hwleft', x.raw.score + ' 分'));
  }
  /* v1.1.72：时间两栏都空时不再印「— ~ —」那种像坏掉的占位，
   * 直接说「时间未读到」，让人知道是没解析出来、不是考试没时间。 */
  const examWhen = (x.raw.start || x.raw.end)
    ? (x.raw.start || '—') + ' ~ ' + (x.raw.end || '—')
    : '时间未读到';
  meta.appendChild(el('span', 'hwdate',
    x.kind === 'exam'
      ? examWhen
      : '截止 ' + (x.raw.end || '—')));
  main.appendChild(meta);
  it.appendChild(main);

  it.onclick = () => (x.kind === 'exam' ? openExamSheet(x.raw) : openHwSheet(x.raw));
  /* v1.1.8：把这条数据挂在 DOM 上，供上面那个「每分钟只改数字」的定时器使用。
   * 用 __x 而不是 dataset：dataset 会把对象序列化成字符串。 */
  it.__x = x;
  return it;
}

/* 排序与筛选的 UI 绑定 */
function initLearnUI() {
  /* v1.1.66：待完成 / 已完成 视图切换。点一下换整块列表，存进 Host 偏好里；
   * 切换后把滚动拉回顶部，否则会停在半截列表里。语义红线由 renderHomework
   * 兜住（状态没读到的不算完成），这里只管换视图。 */
  const dseg = document.getElementById('doneSeg');
  if (dseg) {
    const paint = () => {
      const v = curDoneView();
      dseg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', b.dataset.dview === v);
      });
    };
    dseg.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (b.dataset.dview === curDoneView()) return;
        prefSet(DVIEW_K, b.dataset.dview);
        paint();
        renderHomework();
        const m = document.querySelector('main');
        if (m) m.scrollTop = 0;
      };
    });
    paint();
  }

  const seg = document.getElementById('sortSeg');
  if (seg) {
    const paint = () => {
      const s = curSort();
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', b.dataset.sort === s);
      });
    };
    seg.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (b.dataset.sort === curSort()) return;
        prefSet(SORT_K, b.dataset.sort);
        paint();
        renderHomework();
        // 切到按课程时，把滚动位置拉回顶部，否则会停在半截分组里
        const m = document.querySelector('main');
        if (m) m.scrollTop = 0;
      };
    });
    paint();
  }

  const chips = document.getElementById('sortChips');
  if (chips) {
    const paint = () => {
      const f = curFilter();
      chips.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', b.dataset.filter === f);
      });
    };
    chips.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (b.dataset.filter === curFilter()) return;
        prefSet(FILT_K, b.dataset.filter);
        paint();
        renderHomework();
      };
    });
    paint();
  }
}

/* ===== 学习通：登录与同步（v0.9.9） =====
 *
 * 为什么放在学习页而不是「我的」：作业没数据的直接原因就是没登录，
 * 让用户从「学习」看到空白 → 又跑去「我的」找登录，路径是绕的。
 * 卡片就摆在作业列表上方，空态里也有按钮，两条路都指向这里。
 */
const CxUI = (() => {
  const $ = id => document.getElementById(id);
  let busy = false;

  function fmtAt(ts) {
    if (!ts) return '--';
    return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
  }

  function paint() {
    const on = (typeof CX !== 'undefined') && CX.loggedIn();
    const st = $('cxState');
    if (st) {
      st.textContent = on ? '已登录' : '未登录';
      st.className = 'v ' + (on ? 'ok' : 'warn');
    }
    const show = id => { const e = $(id); if (e) e.style.display = on ? 'block' : 'none'; };
    const hide = id => { const e = $(id); if (e) e.style.display = on ? 'none' : 'block'; };
    show('btnCxSync'); show('btnCxOut'); hide('btnCxLogin');

    const atRow = $('cxAtRow');
    const at = $('cxAt');
    const d = (typeof CX !== 'undefined') ? CX.cached() : null;
    if (atRow) atRow.style.display = (on && d && d.synced_at) ? 'flex' : 'none';
    if (at && d) at.textContent = fmtAt(d.synced_at);
  }

  function login() {
    if (typeof CX === 'undefined') return;
    if (!(typeof Host !== 'undefined' && Host.openWebFor)) {
      showTip('登录学习通需要在 App 内进行。');
      return;
    }
    CX.openLogin();
  }

  function sync(silent) {
    if (busy) return;
    if (typeof CX === 'undefined') return;
    if (!CX.loggedIn()) {
      if (!silent) login();
      return;
    }
    busy = true;
    const btn = $('btnCxSync');
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '抓取中…'; }

    CX.sync(msg => { if (btn) btn.textContent = msg; }).then(r => {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = old || '重新抓作业与考试'; }
      paint();
      if (!r.ok) {
        if (r.needLogin) {
          paint();
          if (!silent) showTip('学习通登录已失效\n\n' + r.error + '\n\n点下面的按钮重新登录。');
          return;
        }
        if (!silent) showTip('抓取失败\n\n' + r.error);
        return;
      }
      renderHomework();
      /* v1.1.66：学习通是「多平台」里的第 0 路，它的数据一变，连接卡上的
       * 状态字/条数也得跟着变，否则「全部」筛选里数字对不上。只在成功分支画。 */
      if (typeof SrcUI !== 'undefined' && SrcUI.paint) SrcUI.paint();
      if (!silent) {
        XXMU.toast('学习通同步完成：' + r.data.works.length + ' 条作业 / '
          + r.data.exams.length + ' 场考试');
      }
    }).catch(e => {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = old || '重新抓作业与考试'; }
      if (!silent) showTip('抓取出错\n\n' + ((e && e.message) || e));
    });
  }

  function init() {
    const a = $('btnCxLogin');
    if (a) a.onclick = login;
    const b = $('btnCxSync');
    if (b) b.onclick = () => sync(false);
    const c = $('btnCxOut');
    if (c) {
      c.onclick = async () => {
        if (!await askConfirm('断开学习通？下次要看作业需要重新登录。', { danger: true })) return;
        CX.logout();
        paint();
        renderHomework();
        XXMU.toast('已断开学习通');
      };
    }
    paint();
  }

  return { init, paint, login, sync };
})();

/* ===== 多平台来源连接卡（v1.1.66） =====
 *
 * 为什么单独一个 UI 模块：学习通那张卡（cxCard）是静态 DOM + CxUI 硬绑死的
 * 三个按钮；新平台是「按注册来源动态生成」的，数量、登录入口、状态都不同。
 * 这里只读 SOURCES.status() 渲染 #srcCards / #srcChips，事件用一张委托表挂在
 * #srcCards 上，卡片重画不会丢监听。所有动作都转发给 SOURCES，自己不碰网络、
 * 不碰缓存 —— 与 sources.js 的「聚合器只管合并」分工对齐。
 *
 * 诚实口径：degraded / stale 的来源不贡献任何条目（sources.js 的 live() 已
 * 保证），连接卡上也只写清「暂不可用 / 需重新登录 + 原因」，绝不显示 0 条
 * 冒充「这平台没作业」。 */
const SrcUI = (() => {
  const $ = id => document.getElementById(id);
  const busy = {};                       // 按来源 id 记，避免重复点刷新

  function fmtAt(ts) {
    if (!ts) return '--';
    return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
  }

  /* 状态 → 卡片右上角那行字 + 颜色类。
   * ok=绿，其余=橙（nologin/idle 也带 warn，见 ui-css 的默认橙口径）。 */
  function stateText(s) {
    switch (s.state) {
      case 'ok': return { txt: '已同步 ' + s.count + ' 条', cls: 'ok' };
      case 'stale': return { txt: '需重新登录', cls: 'warn' };
      case 'degraded': return { txt: '暂不可用', cls: 'warn' };
      case 'nologin': return { txt: '未登录', cls: 'warn' };
      default: return { txt: '已绑定，未刷新', cls: 'warn' };   // idle
    }
  }

  /* 一张来源卡片。data-src 供委托表定位；data-role 那几个节点被 ui-css 的
   * .src-state / [data-role="note"] 选中。 */
  function cardNode(s) {
    const wrap = el('div', 'card src-card');
    wrap.setAttribute('data-src', s.id);

    const head = el('div', 'row');
    head.appendChild(el('span', '', s.label));
    const stx = stateText(s);
    const st = el('span', 'v src-state ' + stx.cls, stx.txt);
    st.setAttribute('data-role', 'state');
    head.appendChild(st);
    wrap.appendChild(head);

    /* 上次成功同步时间：只对真的抓到过数据的来源显示。 */
    const atRow = el('div', 'row');
    atRow.setAttribute('data-role', 'atRow');
    atRow.style.display = (s.state === 'ok' && s.synced_at) ? 'flex' : 'none';
    atRow.appendChild(el('span', '', '上次同步'));
    const at = el('span', 'v dim', fmtAt(s.synced_at));
    at.setAttribute('data-role', 'at');
    atRow.appendChild(at);
    wrap.appendChild(atRow);

    /* 说明文字：降级/失效时把原因原样写出来，这是「诚实降级」的落点。
     * 正常态给一句能力边界；四个新平台都强调只读、登录态在这台手机。 */
    const note = el('p', 'hint tight');
    note.setAttribute('data-role', 'note');
    if (s.state === 'degraded' || s.state === 'stale') {
      note.textContent = s.error || '暂未读到数据，请到官方 App / 网页查看。';
    } else {
      const kind = s.kinds && s.kinds.indexOf('exam') >= 0 && s.kinds.indexOf('work') < 0
        ? '考试安排' : '作业与考试';
      note.textContent = '只读接入' + kind + '，不会替你交作业、不会点开考试。登录态只存在这台手机上。';
    }
    wrap.appendChild(note);

    /* v1.1.71（方案 C）：主按钮是「自动同步一次」——双探记住报表地址后
     * 像课表一样全自动；剪贴板 / 粘贴留作兜底，界面不撒谎。 */
    if (s.id === 'xiqueer') {
      const hint2 = el('p', 'hint tight');
      hint2.textContent = '点「自动同步一次」，进教务「课程考试 → 考试安排表」选好学年学期按「检索」（或点「导出」）让表出来，再按右上角「完成」；程序记住那条地址后就像课表一样全自动刷新，不用再复制。学校把地址挡了才用「从剪贴板导入」或粘贴兜底。';
      wrap.appendChild(hint2);
      const bProbe = el('button', 'btn', '自动同步一次');
      bProbe.setAttribute('data-act', 'probe');
      wrap.appendChild(bProbe);
      const bClip = el('button', 'btn soft', '从剪贴板导入（兜底）');
      bClip.setAttribute('data-act', 'paste');
      wrap.appendChild(bClip);
      const bFind = el('button', 'btn ghost', '打开教务网');
      bFind.setAttribute('data-act', 'find');
      wrap.appendChild(bFind);
      const ta = el('textarea', 'src-paste');
      ta.setAttribute('placeholder', '把考试安排表的文字粘贴到这里；没认出时读回的原文会摊进这个框，可改后再导入');
      /* v1.1.69：paint() 重建卡片后，把上次「没认出」读回的原文带回来。 */
      let lastRaw = '';
      try { lastRaw = (window.XQ && XQ.lastRaw) ? String(XQ.lastRaw() || '') : ''; }
      catch (e) { lastRaw = ''; }
      ta.value = lastRaw.slice(0, 20000);
      ta.setAttribute('rows', lastRaw ? '5' : '3');
      wrap.appendChild(ta);
      const bImport = el('button', 'btn soft', '导入这段');
      bImport.setAttribute('data-act', 'import');
      wrap.appendChild(bImport);
    }

    /* v1.1.75：雨课堂四个区域会话互不通用，必须让用户点一下选对自家那套
     * （YG m03730「我用的是长江雨课堂，不是这个雨课堂」）。默认长江，
     * 选过就记在 pref 里；切区等于换了套账号，要重新扫码。 */
    if (s.id === 'yuketang' && window.YKT && YKT.regions) {
      const cur = YKT.region();
      const rRow = el('div', 'ykt-region');
      rRow.setAttribute('data-role', 'region');
      rRow.appendChild(el('span', 'ykt-region-label', '区域'));
      (YKT.regions() || []).forEach(function (r) {
        const b = el('button', (r.id === cur ? 'on' : '') + ' ykt-r', r.name);
        b.setAttribute('data-act', 'region');
        b.setAttribute('data-region', r.id);
        rRow.appendChild(b);
      });
      wrap.appendChild(rRow);
      const rHint = el('p', 'hint tight');
      rHint.textContent = '用哪套就选哪个（本校一般是「长江」）。换区等于换一套账号，'
        + '要重新扫码；换完先点「登录 / 绑定雨课堂」。';
      wrap.appendChild(rHint);
    }

    /* v1.1.78 起：知到两条接入主线做成可切探针（方案 C）。A 读官方作业页 DOM、
     * B 直连只读接口。v1.1.80 真机 B 诊断坐实接口链路活，默认切到 B（接口直连）
     * 作主线，A 留作兜底；换模式清旧快照逼一次重抓。用现成的
     * .ykt-region / .ykt-r 类名，不新增 CSS。 */
    if (s.id === 'zhihuishu' && window.ZHS && ZHS.mode) {
      const cur = ZHS.mode();
      const mRow = el('div', 'ykt-region');
      mRow.setAttribute('data-role', 'zhs-mode');
      mRow.appendChild(el('span', 'ykt-region-label', '接入'));
      ['B', 'A'].forEach(function (m) {
        const b = el('button', (m === cur ? 'on ' : '') + 'ykt-r', ZHS.modeName(m));
        b.setAttribute('data-act', 'zhsmode');
        b.setAttribute('data-mode', m);
        mRow.appendChild(b);
      });
      wrap.appendChild(mRow);
      const mHint = el('p', 'hint tight');
      mHint.textContent = '默认「接口直连」：先点「登录 / 重新登录知到」，用学校账号或扫码'
        + '登进去后，点右上角「完成」再回来，点「重新抓一次」就能读作业考试清单，'
        + '不用另外打开网页。若这学期课程/接口读不到，再切「读作业页」兜底：'
        + '点「打开知到作业页」看到清单回来重抓一次。两条都只读取清单，不会替你交作业。';
      wrap.appendChild(mHint);
      const bOpen = el('button', 'btn soft', '打开知到作业页');
      bOpen.setAttribute('data-act', 'zhsopen');
      wrap.appendChild(bOpen);
    }

    /* v1.1.67：登录按钮不再只在 nologin/stale 出现。喜鹊这类「有真实登录
     * 入口、但自动定位考试页失败」的来源是 degraded，之前 degraded 把登录
     * 按钮藏了，用户想重新登录教务都没地方点（m01034「喜鹊还是没用」）。
     * 放宽到「只要不是 ok 且有登录入口」都给按钮。v1.1.78 起知到也接了
     * 真实登录入口，文案按来源分流：喜鹊复用教务、雨课堂扫码、知到自有账号。 */
    const bLogin = el('button', 'btn',
      s.id === 'zhihuishu' ? '登录 / 重新登录知到'
        : (s.id === 'yuketang' ? '登录 / 绑定雨课堂' : '登录 / 重新登录教务'));
    bLogin.setAttribute('data-act', 'login');
    bLogin.style.display = (s.hasLogin && s.state !== 'ok') ? 'block' : 'none';

    const bSync = el('button', 'btn soft', '重新抓一次');
    bSync.setAttribute('data-act', 'sync');
    bSync.style.display = (s.state === 'ok' || s.state === 'idle'
      || s.state === 'degraded') ? 'block' : 'none';
    if (busy[s.id]) { bSync.disabled = true; bSync.textContent = '抓取中…'; }

    /* v1.1.67：动态发现考试页没命中时，给一条「复制诊断」的路。诊断里记了
     * 抓过哪些教务菜单页、每页多大、挖到哪些 jsp 链接、每个候选为什么不算
     * 考试表——用户复制发回来，下一版就能钉死真地址，不用再硬猜。只对有
     * 登录入口且降级/失效的来源显示（v1.1.78 起知到的双探针诊断也走这里）。 */
    const bDiag = el('button', 'btn ghost', '复制诊断');
    bDiag.setAttribute('data-act', 'diag');
    bDiag.style.display = (s.hasLogin && (s.state === 'degraded' || s.state === 'stale'))
      ? 'block' : 'none';

    /* v1.1.68：喜鹊的「断开」不能真的清教务 Cookie（那会连课表一起登出），
     * 只清掉导入的考试安排，所以换个不会误导的文案。 */
    const bOut = el('button', 'btn ghost',
      s.id === 'xiqueer' ? '清掉考试与自动地址' : '断开' + s.short);
    bOut.setAttribute('data-act', 'out');
    bOut.style.display = (s.id === 'xiqueer')
      ? (window.XQ && XQ.has() ? 'block' : 'none')
      : (s.loggedIn ? 'block' : 'none');
    /* v1.1.66 / m00638：按钮各自作为 wrap 的兄弟节点纵向堆叠，不再塞进
     * 同一个 .row。为什么：.btn 是 width:100%，多个挤进 display:flex 的 .row
     * 会按 min-content 把整张 .card 撑过 390px 视口（首轮两档实拍都复现）。 */
    wrap.appendChild(bLogin);
    wrap.appendChild(bSync);
    wrap.appendChild(bDiag);
    wrap.appendChild(bOut);

    return wrap;
  }

  /* 来源筛选 chips：全部 + 每个已注册来源（学习通也列，short=超星）。
   * 选中类沿用项目既有 .on，ui-css 只补了个 #srcChips 上边距。 */
  function paintChips() {
    const box = $('srcChips');
    if (!box || typeof SOURCES === 'undefined') return;
    box.innerHTML = '';
    const cur = curSrcFilter();
    const mk = (id, label) => {
      const b = el('button', cur === id ? 'on' : '', label);
      b.setAttribute('data-srcf', id);
      b.onclick = () => {
        if (id === curSrcFilter()) return;
        prefSet(SRCF_K, id);
        paintChips();
        renderHomework();
      };
      box.appendChild(b);
    };
    mk('all', '全部');
    SOURCES.list().forEach(s => mk(s.id, s.short || s.label));
  }

  function paint() {
    if (typeof SOURCES === 'undefined') return;
    const cards = $('srcCards');
    if (cards) {
      cards.innerHTML = '';
      /* 内置学习通已有 cxCard 单独一张，这里只画其余来源，避免两张重复卡。 */
      SOURCES.status().forEach(s => {
        if (s.builtin) return;
        cards.appendChild(cardNode(s));
      });
    }
    paintChips();
  }

  function sync(id, silent) {
    if (busy[id] || typeof SOURCES === 'undefined') return;
    const s = SOURCES.get(id);
    if (!s) return;
    /* 不做「未登录就转去登录」的前置拦截：每个适配器自己的 fetch 都会
     * 诚实返回 stale/degraded 并写清原因，刷新本身就是一次验真探针。
     * 真要登录，用户点卡片上的「登录/绑定」按钮（按 hasLogin 显隐）。 */
    busy[id] = true;
    paint();
    SOURCES.refresh(id, () => {}).then(r => {
      busy[id] = false;
      paint();
      renderHomework();
      if (!silent && typeof XXMU !== 'undefined' && XXMU.toast) {
        if (r && r.state === 'ok') {
          XXMU.toast((SOURCES.get(id).label || '该平台') + '同步完成');
        } else if (r && r.error) {
          showTip((SOURCES.get(id).label || '该平台') + '暂不可用\n\n' + r.error);
        }
      }
    }).catch(e => {
      busy[id] = false;
      paint();
      if (!silent) showTip('抓取出错\n\n' + ((e && e.message) || e));
    });
  }

  function init() {
    const cards = $('srcCards');
    if (!cards || typeof SOURCES === 'undefined') return;
    /* 一张委托表覆盖所有卡片的三个动作，卡片重画后依然生效。 */
    cards.onclick = async ev => {
      let btn = ev.target;
      while (btn && btn !== cards && !btn.getAttribute('data-act')) btn = btn.parentNode;
      if (!btn || btn === cards || btn.disabled) return;
      const cardHost = btn.closest ? btn.closest('[data-src]') : null;
      const id = cardHost ? cardHost.getAttribute('data-src') : null;
      if (!id) return;
      const act = btn.getAttribute('data-act');
      if (act === 'region') {
        /* v1.1.75：换区域 = 换一套账号。切完把这家来源的缓存与登录标记清掉，
         * 界面立刻回到「未登录」，逼人重新扫码，绝不让旧区的数据继续显示。 */
        const rid = btn.getAttribute('data-region');
        if (!window.YKT || !YKT.setRegion) return;
        if (!YKT.setRegion(rid)) return;
        try {
          if (typeof Host !== 'undefined' && Host.setPref) {
            Host.setPref('xxmu_ykt_todo', '');
            Host.setPref('xxmu_ykt_todo__bound', '');
          }
        } catch (e) {}
        paint();
        renderHomework();
        const nm = YKT.regionName ? YKT.regionName() : rid;
        if (typeof XXMU !== 'undefined' && XXMU.toast) {
          XXMU.toast('已切到「' + nm + '」雨课堂，先点登录扫码');
        }
        return;
      }
      if (act === 'zhsmode') {
        /* v1.1.78：切知到接入探针（A 读页 / B 直连）。换模式清旧快照，
         * 立刻重画并静默重抓一次，让用户看到新模式的诊断。 */
        if (!window.ZHS || !ZHS.setMode) return;
        const m = btn.getAttribute('data-mode');
        if (!ZHS.setMode(m)) return;
        paint();
        renderHomework();
        if (typeof XXMU !== 'undefined' && XXMU.toast) {
          XXMU.toast('已切到「' + ZHS.modeName(m) + '」，正在重新抓一次');
        }
        sync(id, true);
        return;
      }
      if (act === 'zhsopen') {
        /* v1.1.78：打开官方作业考试页（真实 WebView），看到清单后按返回，
         * WebActivity 的 FIND_JS 回跳把页面结构存进快照。 */
        if (window.ZHS && ZHS.openA) ZHS.openA();
        return;
      }
      if (act === 'probe') {
        /* v1.1.71：开双探视图，人按一次检索/导出 + 完成，程序记住报表地址。
         * 之后 SrcUI.sync → SOURCES.refresh → fetchExams 全自动重放，零复制。 */
        if (window.XQ && XQ.probe) XQ.probe();
        else if (window.XQ && XQ.find) XQ.find();
      } else if (act === 'paste') {
        /* v1.1.70：从系统剪贴板读考试表文字 → 解析 → 一步导入。
         * 认不出时把原文摊进框（XQ 已写 RAW_KEY），人能看见、改一改再导入。 */
        if (!window.XQ) return;
        const r = XQ.importClip ? XQ.importClip() : { count: 0, error: '这个版本还没有剪贴板导入。' };
        const ta0 = cardHost && cardHost.querySelector
          ? cardHost.querySelector('textarea.src-paste') : null;
        if (r && r.raw && ta0) { ta0.value = r.raw; ta0.setAttribute('rows', '5'); }
        if (!r || !r.count) { showTip((r && r.error) || '剪贴板里没认出考试条目。'); return; }
        paint();
        renderHomework();
        if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已从剪贴板导入 ' + r.count + ' 场考试');
        sync(id, true);
      } else if (act === 'find') {
        /* v1.1.70：只把教务门户打开，方便人在页面里长按复制考试表；
         * 不再承诺按「完成」自动读页（四轮真机都被业务页防直链挡住）。 */
        if (window.XQ) XQ.find();
      } else if (act === 'import') {
        /* v1.1.68：粘贴兜底。用户把喜鹊儿考试安排那页文字粘进卡里的框，
         * 同一个解析器认；认不出就说实话，绝不落一份空快照冒充同步成功。 */
        if (!window.XQ) return;
        const ta = cardHost && cardHost.querySelector
          ? cardHost.querySelector('textarea.src-paste') : null;
        const txt = ta ? String(ta.value || '') : '';
        if (!txt.trim()) {
          showTip('先把喜鹊儿「考试安排」那页的文字粘贴到框里，再点「导入这段」。');
          return;
        }
        const r = XQ.importText(txt);
        if (!r.count) { showTip(r.error || '没认出考试条目。'); return; }
        paint();
        renderHomework();
        if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已导入 ' + r.count + ' 场考试');
        /* v1.1.68：快照落盘后必须重建聚合缓存，否则 live() 读的还是旧的降级态，
         * 用户会看到「导入成功」但待办里空空如也。silent=true，上面已 toast 过。 */
        sync(id, true);
      } else if (act === 'login') {
        SOURCES.openLogin(id);
      } else if (act === 'sync') {
        sync(id, false);
      } else if (act === 'diag') {
        /* v1.1.67：喜鹊没定位到考试页时，把这次翻过哪些教务页、挖到哪些
         * 链接、每个候选为何不算考试表复制出来发群里，下一版直接钉死真地址。
         * 复制走 Host.clip（WebView 里最可靠），失败再退到可长按的提示框，
         * 不依赖 AdminUI 里那个私有的 copyText，也不谎报「已复制」。 */
        const txt = SOURCES.diag(id) || '这次还没抓过：先点「重新抓一次」，再回来复制诊断。';
        const done = () => {
          if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('诊断已复制，发到群里就能定位');
        };
        try {
          if (typeof Host !== 'undefined' && Host.clip) { Host.clip(txt); done(); return; }
        } catch (e) {}
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(done,
              () => showTip('诊断（长按复制）\n\n' + txt));
            return;
          }
        } catch (e) {}
        showTip('诊断（长按复制）\n\n' + txt);
      } else if (act === 'out') {
        const s = SOURCES.get(id);
        /* v1.1.68：喜鹊只清导入快照 + 刷一遍让来源缓存回到诚实降级，
         * 绝不调 SOURCES.logout —— 那会 clearCookieFor(教务) 把课表一起登出。 */
        const isXq = (id === 'xiqueer' && window.XQ);
        if (!await askConfirm(isXq
          ? '清掉已经读到的考试和记住的自动地址？教务登录不会受影响。'
          : '断开' + (s ? s.label : '该平台') + '？下次要看数据需要重新登录。',
          { danger: !isXq })) return;
        if (isXq) {
          XQ.clear();
          paint();
          renderHomework();
          SOURCES.refresh('xiqueer', function () {}).then(function () {
            paint(); renderHomework();
          });
          if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已清掉导入的考试安排');
          return;
        }
        SOURCES.logout(id);
        paint();
        renderHomework();
        if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已断开' + (s ? s.label : ''));
      }
    };
    paint();
  }

  return { init, paint, sync, paintChips };
})();
window.SrcUI = SrcUI;

/* 学习通登录成功：立刻抓一次 */
window.__onCxLoggedIn = function () {
  CxUI.paint();
  CxUI.sync(false);
};
const FOLD = {};           // 分组标题 -> 是否展开（跨重渲染保持）
function foldSec(title, bodyNode, open) {
  const key = title.split(' · ')[0];
  const on = FOLD[key] != null ? FOLD[key] : !!open;
  const wrap = el('div');
  const head = el('div', 'hwsec fold' + (on ? ' on' : ''), title + (on ? '  ▴' : '  ▾'));
  const box = el('div', 'foldbox');
  if (on) box.appendChild(bodyNode);
  head.onclick = () => {
    const now = head.classList.toggle('on');
    FOLD[key] = now;
    head.textContent = title + (now ? '  ▴' : '  ▾');
    box.innerHTML = '';
    if (now) box.appendChild(bodyNode);
  };
  wrap.appendChild(head);
  wrap.appendChild(box);
  return wrap;
}

function openExamSheet(e) {
  document.getElementById('sh-name').textContent = e.name || '考试详情';
  const body = document.getElementById('sh-body');
  body.innerHTML = '';
  /* v1.1.72：状态文案要按来源说。之前不管哪来的考试都写「学习通页面里没找到
   * 状态位」，喜鹊导入的也这么写，等于指着教务说学习通，人一眼就觉得坏了。 */
  const examSrcName = (() => {
    const id = e.source || e._src || '';
    try {
      if (id && typeof SOURCES !== 'undefined' && SOURCES.get) {
        const s = SOURCES.get(id);
        if (s) return s.short || s.label || '';
      }
    } catch (err) {}
    return id === 'xiqueer' ? '喜鹊' : '';
  })();
  const stTxtE = String(e.status || '').trim()
    || ('未读到' + (examSrcName ? '（' + examSrcName + '页面里没有状态这一列）'
      : '（学习通页面里没找到状态位）'));
  [['课程', e.course || '—'],
   ['开始', e.start || '—'],
   ['结束', e.end || '—'],
   ['状态', stTxtE]].forEach(([k, v]) => {
    const r = el('div', 'row');
    r.appendChild(el('span', '', k));
    r.appendChild(el('span', 'v', v));
    body.appendChild(r);
  });
  /* v1.1.68：喜鹊导入的考试带考场 / 学分 / 轮次等卡片式字段，详情里一并显示；
   * 没有的字段整行不画，不用「—」占位冒充读到了。 */
  [['考场', e.place], ['学分', e.credit], ['轮次', e.round],
   ['考试性质', e.nature], ['座位号', e.seat]].forEach(([k, v]) => {
    const t = String(v == null ? '' : v).trim();
    if (!t) return;
    const r = el('div', 'row');
    r.appendChild(el('span', '', k));
    r.appendChild(el('span', 'v', t));
    body.appendChild(r);
  });
  if (e.score) {
    const r = el('div', 'row');
    r.appendChild(el('span', '', '成绩'));
    r.appendChild(el('span', 'v', e.score + ' 分'));
    body.appendChild(r);
  }
  if (e._open && e._leftStart != null && e._due != null) {
    const nowS = Date.now() / 1000;
    const r = el('div', 'row');
    r.appendChild(el('span', '', '倒计时'));
    const txt = e._leftStart > 0 ? '距开考 ' + fmtLeft(e._leftStart) : fmtLeft((e._due - nowS) / 3600);
    const v = el('span', 'v', txt);
    if (e._due - nowS < 0) v.style.color = '#d93025';
    else if (e._leftStart < 48) v.style.color = '#e8710a';
    r.appendChild(v);
    body.appendChild(r);
  }
  if (e.url) {
    const btn = el('button', 'btn', '打开考试页面');
    btn.onclick = () => openChaoxing(e.url, '考试', e);
    body.appendChild(btn);
    const tip = el('div', 'hint', '首次打开需在学习通页面内登录一次，之后无需再登录');
    body.appendChild(tip);
  }
  document.getElementById('sheet').classList.add('on');
}

/* 已知失效的学习通深层路径（实测 404）。
 * 这些是早期版本拼错的路径，遇到就改写成课程主页，避免用户点到 404。
 * 数据层已经修过（tools/fix_urls.py），这里再兜一层，防止旧的
 * 外部 JSON / 缓存文件带着死链进来。 */
const DEAD_PATHS = [
  '/mooc-ans/work/doHomeWork',
  '/exam-ans/exam/test/reVersionTestStartNew',
];

function fixKnownDeadUrl(url, item) {
  if (!url) return '';
  const dead = DEAD_PATHS.some((p) => url.indexOf(p) >= 0);
  if (!dead) return url;
  if (item && item.courseid && item.classid && item.cpi) {
    return 'https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=' + item.courseid +
           '&clazzid=' + item.classid + '&vc=1&cpi=' + item.cpi;
  }
  return '';
}

/* 打开学习通页面。
 *
 * 关键：必须用 App 内置 WebView（Host.openInApp），不能用系统浏览器。
 * 原因：作业页/考试页都要求学习通登录态，系统浏览器里没有 cookie，
 *      打开就是 passport2 登录页（用户看到的就是"404/没内容"）。
 *      内置 WebView 有独立 cookie 池，登录一次就能持续用。
 */
function openChaoxing(url, what, item) {
  const fixed = fixKnownDeadUrl(url, item);
  if (!fixed) {
    showTip('这条' + (what || '') + '没有可用链接。\n\n可能是学习通尚未发布，或数据较旧。\n' +
            '可以在「我的」里重新同步一次作业。');
    return;
  }
  if (typeof Host !== 'undefined' && Host.openInApp) {
    Host.openInApp(fixed);
    return;
  }
  if (typeof Host !== 'undefined' && Host.openUrl) {
    /* 老版本 App 没有 openInApp，退回系统浏览器 */
    Host.openUrl(fixed);
    return;
  }
  window.open(fixed, '_blank');
}

function openHwSheet(w) {
  document.getElementById('sh-name').textContent = w.name || '作业详情';
  const body = document.getElementById('sh-body');
  body.innerHTML = '';
  /* v1.1.5：状态读不到时明说「未读到」，不印一个「—」。
   * 以前那个「—」在详情里看起来像「没有异常」，实际是我们解析失败了。 */
  const stTxt = String(w.status || '').trim() || '未读到（学习通页面里没找到状态位）';
  [['课程', w.course || '—'],
   ['开始', w.start || '—'],
   ['截止', w.end || '—'],
   ['状态', stTxt]].forEach(([k, v]) => {
    const r = el('div', 'row');
    r.appendChild(el('span', '', k));
    r.appendChild(el('span', 'v', v));
    body.appendChild(r);
  });
  if (w._open && w._left != null) {
    const r = el('div', 'row');
    r.appendChild(el('span', '', '剩余'));
    const v = el('span', 'v', fmtLeft(w._left));
    if (w._left < 0) v.style.color = '#d93025';
    else if (w._left < 24) v.style.color = '#e8710a';
    r.appendChild(v);
    body.appendChild(r);
  }
  if (w.answer_url) {
    const btn = el('button', 'btn', '去作业页面');
    btn.onclick = () => openChaoxing(w.answer_url, '作业', w);
    body.appendChild(btn);
    const tip = el('div', 'hint', '首次打开需在学习通页面内登录一次，之后无需再登录');
    body.appendChild(tip);
  } else {
    const tip = el('div', 'hint', '这条作业还没有可跳转的页面（可能尚未发布）');
    body.appendChild(tip);
  }
  document.getElementById('sheet').classList.add('on');
}

function load() {
  /* 每次重新读之前先清掉上一次的读取错误 —— 否则「修好之后错误还在屏幕上」。 */
  READ_ERR.schedule = '';
  READ_ERR.homework = '';
  DATA = readExternal() || readCached() || window.SCHEDULE || { courses: [] };
  /* v1.1.55：叠加 AI 改课表指令（借鉴 tangli「烫梨指令」）。
   * 只改内存里渲染用的这一份，绝不写回缓存 / 外部 schedule.json ——
   * 指令是「盖在上面的一层」，撤销、清空、换数据源都立刻恢复原始课表。
   * 必须在算 PERIODS / cnt / renderWeek 之前叠加，否则画面和统计还是老数据；
   * ctx.times 先从原始 DATA 取（叠加本身要用校方作息校验钟点指令）。 */
  const _baseTimes = Array.isArray(DATA.times) ? DATA.times : [];
  if (typeof LessonCmd !== 'undefined') {
    const _ops = LessonCmd.loadOps();
    if (_ops.length) {
      DATA = Object.assign({}, DATA, {
        courses: LessonCmd.apply(DATA.courses || [], _ops, {
          start: iso(START), times: _baseTimes,
          totalWeeks: TOTAL_WEEKS, today: iso(new Date()),
        }),
      });
    }
  }
  /* PERIODS 必须兜底。
   *
   * 原来写的是 `Math.max(14, ...DATA.courses.flatMap(c => c.periods))`：
   * 只要有一门课没有 periods 字段（后端新增字段、手工存的课表、或者
   * window.SCHEDULE 是空壳），flatMap 会产出 undefined，
   * Math.max(14, undefined) === NaN —— 而 NaN 会一路传到
   * `new Array(PERIODS + 3)` 直接抛 RangeError: Invalid array length，
   * 整个课表渲染中断，页面上什么都不显示，控制台之外没有任何提示。
   * 先过滤掉非数字再取最大值，取不到就用 14（默认节数）。 */
  const ps = [];
  (DATA.courses || []).forEach(c => {
    const arr = Array.isArray(c && c.periods) ? c.periods : [];
    arr.forEach(p => { const n = parseInt(p, 10); if (n > 0) ps.push(n); });
  });
  PERIODS = ps.length ? Math.max(14, ...ps) : 14;
  TIMES = Array.isArray(DATA.times) ? DATA.times : [];
  document.getElementById('cnt').textContent = (DATA.courses || []).length;
  document.getElementById('termPick').textContent = DATA.term || '--';
  document.getElementById('startday').textContent = iso(START);
  document.getElementById('totalweeks').textContent = TOTAL_WEEKS;

  /* 学期设置回填 + 保存 */
  (function bindTermEdit() {
    const sd = document.getElementById('setStart');
    const sw = document.getElementById('setWeeks');
    const sb = document.getElementById('setSave');
    if (!sd || !sw || !sb) return;
    sd.value = iso(START);
    sw.value = TOTAL_WEEKS;
    if (sb._bound) return;   // load() 会被反复调用，只绑一次
    sb._bound = true;
    sb.onclick = () => {
      const ds = (sd.value || '').trim();
      const wk = parseInt(sw.value, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
        XXMU.toast('日期请选完整（年-月-日）');
        return;
      }
      if (!(wk >= 10 && wk <= 30)) {
        XXMU.toast('总周数填 10 到 30 之间的整数');
        return;
      }
      prefSet2('xxmu_start', ds);
      prefSet2('xxmu_weeks', String(wk));
      START = parseDate(ds);
      TOTAL_WEEKS = wk;
      curWeek = Math.min(Math.max(weekOf(new Date()), 1), TOTAL_WEEKS);
      renderWeek();
      document.getElementById('startday').textContent = iso(START);
      document.getElementById('totalweeks').textContent = TOTAL_WEEKS;
      XXMU.toast('已保存：第 1 周从 ' + ds + ' 开始，共 ' + wk + ' 周');
    };

    /* ---- 一键套用常见学期（省得自己查校历） ----
     * 「填一个日期」是最容易卡住人的一步：校历上写的是「8 月底开学」，
     * 但第 1 周周一是哪天，得自己数。这里给几个最常见的套法，
     * 点一下就把日期/周数填好，人只需要核对。 */
    const quick = document.getElementById('setQuick');
    if (quick && !quick._bound) {
      quick._bound = true;
      /* 「8 月最后一个周一」= 8 月里最晚的那个周一 */
      const lastMondayOfAug = () => {
        const y = START.getFullYear();
        const d = new Date(y, 7, 31);
        const back = (d.getDay() + 6) % 7;   // 退到周一
        d.setDate(d.getDate() - back);
        return d;
      };
      const firstMondayOfSep = () => {
        const y = START.getFullYear();
        const d = new Date(y, 8, 1);
        const fwd = (8 - d.getDay()) % 7;    // 推到周一
        d.setDate(d.getDate() + fwd);
        return d;
      };
      quick.querySelectorAll('button[data-q]').forEach(b => {
        b.onclick = () => {
          const q = b.getAttribute('data-q');
          if (q === 'aug') sd.value = iso(lastMondayOfAug());
          else if (q === 'sep') sd.value = iso(firstMondayOfSep());
          else if (q === 'w20') sw.value = 20;
          else if (q === 'w21') sw.value = 21;
          else if (q === 'w22') sw.value = 22;
          quick.querySelectorAll('button[data-q]').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          XXMU.toast('已填好，核对一下再点「保存并立即生效」。');
        };
      });
    }
  })();
  const at = DATA.synced_at
    ? new Date(DATA.synced_at * 1000).toLocaleString('zh-CN', { hour12: false })
    : '未同步';
  document.getElementById('syncAt').textContent = at;

  curWeek = Math.min(Math.max(weekOf(new Date()), 1), TOTAL_WEEKS);
  renderWeek();

  renderHomework();

  /* 课表读完（含外部/缓存/SCHEDULE 兜底）后，把课程提醒按最新课表重挂一次。
   * load() 会被反复调用（刷新/换课表/改学期），每次都要重挂，否则提醒还停在上一次课表。 */
  if (typeof REMINDER !== 'undefined') REMINDER.refresh();
}

function refreshAll(silent) {
  load();
  if (!silent && typeof Host !== 'undefined' && Host.toast)
    Host.toast('已重新读取外部数据');
}

document.getElementById('refresh').onclick = () => {
  /* v0.9.9 起「刷新」= 重新抓学习通。
   * 原来这里去找一个 PC 推送的 homework.json，手机上根本不会有这个文件，
   * 点了只会弹一段「把文件放到 /sdcard/...」的提示 —— 对用户毫无意义。 */
  if (typeof CX !== 'undefined' && CX.loggedIn()) {
    CxUI.sync(false);
    return;
  }
  const ext = readExternalHomework();
  if (ext) { renderHomework(); XXMU.toast('作业已刷新'); return; }
  CxUI.login();
};

/* 倒计时每分钟重算一次（页面常驻时不再显示僵值）。
 *
 * v1.1.8：从「整个列表重画」改成「只改数字」。
 * 原来每分钟无条件 renderHomework()，而那个函数第一件事就是
 * `box.innerHTML = ''` —— 整棵作业列表被销毁重建：
 *   · 用户正滚到中间看某门课，一分钟一到列表跳回原处（滚动位置随 DOM 一起没了）；
 *   · 折叠区（foldSec）在重建后回到默认展开/收起状态；
 *   · 每张卡片重算一遍时间、重新挂一遍 onclick，纯浪费。
 * 现在只把已渲染卡片上的倒计时文本按新时间改一遍，其余一概不动。
 * 只有跨过一次「整点」状态可能变化（比如刚过截止时间要从待做沉到收尾），
 * 那种情况才真的需要重排，用 left 的符号变化来判定。 */
setInterval(() => {
  const learn = document.getElementById('tab-learn');
  if (!learn || !learn.classList.contains('active')) return;
  const box = document.getElementById('hwlist');
  if (!box) return;
  const nowS = Date.now() / 1000;
  let flip = false;
  box.querySelectorAll('.hw').forEach(card => {
    const x = card.__x;
    if (!x || !x.raw) return;
    /* 重新算这两个数（和 renderHomework 里同一套口径） */
    let left = x.left, leftStart = x.leftStart;
    if (x.kind === 'exam' && x.raw && x.raw._due != null) left = (x.raw._due - nowS) / 3600;
    if (x.kind === 'work' && x.raw && x.raw.end) {
      const due = new Date(String(x.raw.end).replace(/-/g, '/')).getTime() / 1000;
      if (!isNaN(due)) left = (due - nowS) / 3600;
    }
    if (x.kind === 'exam' && x.raw && x.raw._start != null) leftStart = (x.raw._start - nowS) / 3600;
    /* 符号变了（刚过截止 / 刚开考）才需要整页重排 */
    const wasPos = x.left == null ? null : (x.left > 0);
    const nowPos = left == null ? null : (left > 0);
    if (wasPos !== nowPos) { flip = true; return; }
    const lf = card.querySelector('.hwleft');
    if (!lf) return;
    let txt = '';
    if (x.kind === 'exam' && leftStart != null) {
      txt = leftStart > 0 ? '距开考 ' + fmtLeft(leftStart) : fmtLeft(left);
    } else if (left != null) {
      txt = fmtLeft(left);
    }
    if (txt && lf.textContent !== txt) lf.textContent = txt;
  });
  if (flip) renderHomework();
}, 60000);

/* ===== 登录与同步 ===== */

const hasHost = () => typeof Host !== 'undefined' && Host;

/* 从 Cookie 里猜学号不可靠，改由用户首次同步时输入；这里读已存的 */
function currentUser() {
  return (hasHost() && Host.getPref) ? (Host.getPref('xxmu_user') || '') : '';
}

function setLoginState(text, cls) {
  const el0 = document.getElementById('loginState');
  if (!el0) return;
  el0.textContent = text;
  el0.className = cls || '';
}

/* 教务登录状态。
 *
 * v1.1.38 修了一个从 v1.0 就在骗人的判据：原来只看 `Host.cookies().length > 20`。
 * 问题是青果**没登录时也会下发一个 43 字符的 JSESSIONID**，于是这个判断永远为真，
 * 「我的」页永远显示「已登录」。用户按这个状态去点同步才发现白等一场，
 * 而界面上没有任何一行能让他明白「其实没登进去」。
 *
 * 现在要两个证据同时成立才算登录：
 *   ① CookieManager 里有教务域的 cookie（必要条件，但不充分）；
 *   ② 真的从教务拿到过一次数据 —— 课表同步成功，或空闲教室查成功，
 *      记在 pref 'xxmu_kb_ok'（毫秒时间戳）。
 * 只有 ① 没有 ② 时显示「未验证」，这才是当时真实的状态。
 */
const LOGIN_OK_KEY = 'xxmu_kb_ok';

function markLoginOk() {
  if (hasHost() && Host.setPref) Host.setPref(LOGIN_OK_KEY, String(Date.now()));
}

function loginOkAt() {
  const s = (hasHost() && Host.getPref) ? (Host.getPref(LOGIN_OK_KEY) || '') : '';
  const n = parseInt(s, 10);
  return n > 0 ? n : 0;
}

function refreshLoginUI() {
  if (!hasHost()) {
    setLoginState('浏览器预览', '');
    const w0 = document.getElementById('whoami');
    if (w0) w0.textContent = '（需在 App 内使用）';
    return;
  }
  const ck = Host.cookies ? Host.cookies() : '';
  const u = currentUser();
  const w = document.getElementById('whoami');
  if (w) w.textContent = u || '--';

  if (!ck || ck.length < 20) {
    setLoginState('未登录', 'warn');
    return;
  }
  const at = loginOkAt();
  if (!at) {
    setLoginState('未验证', 'warn');
    return;
  }
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) setLoginState('已登录', 'ok');
  else setLoginState('已登录 · ' + days + ' 天前用过', 'ok');
}

/* 本机账号卡片：显示的是「软件的卡密账号」，不是教务账号。
 * 两个卡片分开，是因为它们是两套完全独立的东西——换卡密账号不必重新登教务，
 * 退教务也不影响卡密。合成一张卡会让人以为退了这个那个也废了。 */
function refreshAcctUI() {
  const idEl = document.getElementById('acctId');
  const roleEl = document.getElementById('acctRole');
  if (!idEl || !roleEl) return;
  const who = (typeof LICENSE !== 'undefined' && LICENSE.whoami()) || '';
  idEl.textContent = who || '--';
  let role = '未激活';
  let cls = 'warn';
  try {
    if (typeof AUTH !== 'undefined' && AUTH.usable()) {
      if (AUTH.isAdmin()) { role = '管理员'; cls = 'ok'; }
      else { role = '学生（已激活）'; cls = 'ok'; }
    }
  } catch (e) {}
  roleEl.textContent = role;
  roleEl.className = 'v ' + cls;
}

/** 退出本机账号：和关于页那个按钮走同一套逻辑，收口到一个函数避免两处不同步。
 *  顺序：先 Cookie（异步投递）→ 再 clearAccount（同步删文件+pref）→ 重载。 */
async function exitAccount() {
  if (!await askConfirm('退出这台手机上的账号？\n\n' +
    '会清除：激活状态、课表缓存、作业缓存、学习通记录、教务登录。\n' +
    '不会清除：设备指纹（换回原账号不算新设备）。\n\n' +
    '退出后回到开始页，需要重新填学号。', { danger: true })) return;
  const has = (typeof Host !== 'undefined' && Host.clearAccount);
  if (has) {
    try { if (Host.clearCookies) Host.clearCookies(); } catch (e) {}
    try { Host.clearAccount(); } catch (e) {}
  } else {
    try {
      ['xxmu_license', 'xxmu_license_id', 'xxmu_ticket', 'xxmu_ticket_exp',
       'xxmu_role', 'xxmu_last_check', 'xxmu_dev_quota', 'xxmu_user',
       'xxmu_admin_key', 'xxmu_cx_at', 'xxmu_cx_homework',
       'xxmu_water_token', 'xxmu_water_uid', 'xxmu_water_phone'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
    } catch (e) {}
  }
  try { location.reload(); } catch (e) {
    LICENSE.deactivate();
    AUTH.clearTicket();
    Gate.show();
  }
}

document.getElementById('btnExitMe').onclick = exitAccount;
window.__XXMU_EXIT_ACCOUNT = exitAccount;

/* 登录 */
document.getElementById('btnLogin').onclick = () => {
  if (!AUTH.usable()) {
    showTip('请先回到开始页填写学号。');
    Gate.show();
    return;
  }
  if (!hasHost() || !Host.openLogin) {
    showTip('登录需要在 App 内进行。\n\n浏览器预览没有 WebView 桥，只能看已有数据。');
    return;
  }
  Host.openLogin();
};

/* 登录成功后自动同步。
 *
 * 学号不再手输（v1.1.0）：进门时已经填过，登录教务时 WebView 又从登录页
 * input#username 读回了账号，两处一致才放行同步。见 sync.js 的
 * __onLoginDone 与 LICENSE.noteKbAccount。
 *
 * 参数 chk 是学号核对结果：
 *   {ok:true,  unknown:true}  —— 没读到账号（学校改版/别的登录方式），照常同步
 *   {ok:true}                 —— 读到了且一致
 *   {ok:false, acct, id}      —— 不一致，不同步
 */
/* 学号不一致的「已知情」标记：只在本次打开 App 内有效，不落盘。
 * 落盘就成了「点过一次永久放行」，那第一次真填错的人就再也不会被拦。 */
let kbMismatchAck = false;
/** 自动同步被拦时只 toast 一次，避免每 800ms 一次的重试把屏幕刷满 */
let kbMismatchToastShown = false;

window.__onLoginSuccess = function (chk) {
  refreshLoginUI();
  const u = currentUser();
  if (!u) {
    // 理论上进不了 App 就没人走到这里；真走到说明 pref 被清了，重新走门
    showTip('没有读到学号，请重新填写。');
    Gate.show();
    return;
  }
  if (chk && chk.ok === false) {
    /* 已经把话说完了，标记成「已知情」：这样他直接点「从教务同步课表」
     * 就能走第二次放行，不必先退出登录（退出登录会连带清教务 Cookie，
     * 反而要重新登一次）。 */
    kbMismatchAck = true;
    showTip('这次登录的账号不是你的学号。\n\n'
      + '你登录时填的是：' + (chk.acct || '（没读到）') + '\n'
      + '软件里登记的是：' + chk.id + '\n\n'
      + '如果这就是你的号（比如教务登录名不是学号）：到「我的 → 清除学号核对记录」，以后再登录就不会被拦。\n'
      + '如果你有两个学号、填错了：到「我的 → 重新填学号」把号改对再登录。\n'
      + '要现在就看课表：点「从教务同步课表」再点一次即可照常同步。');
    return;
  }
  syncSchedule(true);
};

/* v1.1.8：同步重入锁。
 *
 * 同一时刻能有三条路同时进 syncSchedule：启动时 800ms 的自动同步、
 * 用户点按钮、以及 __onLoginSuccess 里那次。之前完全没有互斥：
 * 三条并发打教务，青果按账号限流直接回 3004，三条各自失败、
 * 各自把 btn.disabled 改回来，用户完全看不出发生了什么，
 * 只知道「点了几次都同步失败」。而且 finally 无条件复位还会让
 * 后完成的那条把先完成的那条的状态覆盖掉。
 *
 * 现在只认第一条：后来的直接忽略（手动点的给一句明确提示）。 */
let SYNCING = false;

function syncSchedule(showResult) {
  if (!AUTH.usable()) {
    if (showResult) {
      showTip('请先回到开始页填写学号。');
      Gate.show();
    }
    return;
  }
  if (!hasHost() || !XXMU.hasHost()) {
    if (showResult) showTip('需要在 App 内使用才能从教务同步。');
    return;
  }
  if (SYNCING) {
    if (showResult) showTip('正在同步中，等这一次跑完。');
    return;
  }
  const u = currentUser();
  if (!u) {
    showTip('请先登录，并填写学号。');
    return;
  }
  /* 学号核对（v1.1.0 取消激活码后的替代关）。
   *
   * 登录教务时 WebView 会把登录页的账号框读回来，记在 LICENSE 里。
   * 这里再查一次，挡住两种情况：
   *   1. 用户用 A 学号登录教务，软件里登记的是 B —— 同步下来就是别人的课表，
   *      而且他还以为是自己的，比直接报错危险得多。
   *   2. 同一台手机换过人，pref 里的旧学号还在。
   * 没读到账号（学校改版/别的登录方式）时不拦，否则改一次版就把全校锁死。
   *
   * v1.1.2 两处改动：
   *   1. 读到「账号」这类占位提示的历史脏值不再算「不一致」。那时的问题不是
   *      他登错号，而是我们读错了框 —— 拦截逻辑本身成了 bug，把改对学号、
   *      退号重登、重装的人都锁死在同一页上。现在 license.js 已经把脏值当
   *      「没读到」，这里只剩真正的「读到且不同」才拦。
   *   2. 拦一次之后给留一条出路。刘雨鹭那个案子（m00002/m00005 截图）最伤的
   *      不是误拦，是她退出重登、甚至准备卸载重装都出不来 —— 一个只提示不
   *      放行的关卡，在判断错的时候等于把软件锁死。所以再点一次就放行：
   *      第一次告知并记 flag，第二次照常同步。
   */
  if (typeof LICENSE.accounts === 'function') {
    const acc = LICENSE.accounts();
    if (acc.kb && acc.id && acc.kb !== acc.id) {
      if (!kbMismatchAck) {
        /* 自动同步（启动时那次 showResult=false）不弹窗、也不记 flag：
         * 没人看见提示就不该被认为「已知情同意」。但也不能像 v1.1.1 那样
         * 一声不响地 return —— 那正是截图里「课表全空白、什么提示都没有」
         * 的成因。留一条 toast，把原因和下一步指向同步按钮。 */
        if (!showResult) {
          if (!kbMismatchToastShown) {
            kbMismatchToastShown = true;
            XXMU.toast('登录的学号和登记的学号对不上，点「从教务同步课表」看说明');
          }
          return;
        }
        kbMismatchAck = true;
        showTip('学号对不上，先别同步。\n\n'
          + '你现在登录教务用的账号是：' + acc.kb + '\n'
          + '软件里登记的学号是：' + acc.id + '\n\n'
          + '两个不一样，同步下来的课表很可能不是你的。\n\n'
          + '如果你确认这就是你的号（比如教务登录名不是学号）：再点一次「从教务同步课表」，就会照常同步。\n'
          + '如果不想再被拦：到「我的 → 清除学号核对记录」，只清这一条判定，课表和登录状态都不动。\n'
          + '如果你真的填错了学号：到「我的 → 重新填学号」把号改对，再登录一次教务。');
        return;
      }
      kbMismatchAck = false;
    }
  }
  const btn = document.getElementById('btnSync');
  SYNCING = true;
  btn.disabled = true; btn.classList.add('busy'); btn.textContent = '同步中…';

  /* 复位必须放 finally。
   *
   * 原来复位挂在 `.then(...).catch(...).then(复位)` 这条链的末端，而
   * `XXMU.currentTerm()`、`XXMU.fetchScheduleHtml(u, term)` 的同步前置段
   * （读 pref、b64 参数、取 Host 桥）全都在 setTimeout 回调里、在 Promise
   * 链建立之前执行。任一处同步抛异常 —— 比如 Host 桥没注入、pref 读失败
   * —— Promise 根本没建起来，复位那段永远不会跑：按钮永久禁用、文案永久
   * 「同步中…」，用户只能杀进程重进。这就是典型的静默失败：界面卡住，
   * 一句提示都没有。
   *
   * 现在先把调用包进 try 转成 resolved promise，复位一律走 finally。 */
  setTimeout(() => {
    let p, term = '';
    try {
      term = XXMU.currentTerm();
      p = XXMU.fetchScheduleHtml(u, term);
      if (!p || typeof p.then !== 'function') throw new Error('网络桥没有返回 Promise');
    } catch (err) {
      p = Promise.resolve({ ok: false, error: errText(err) });
    }
    p.then(r => {
      if (!r.ok) {
        if (showResult) showTip('同步失败\n\n' + r.error);
        if (String(r.error).indexOf('登录已失效') >= 0) setLoginState('登录已过期', 'warn');
        return;
      }
      const sch = XXMU.buildSchedule(r.html, u, term);
      const saved = Host.saveCachedSchedule(JSON.stringify(sch));
      if (!saved) {
        if (showResult) showTip('解析成功但写入缓存失败。');
        return;
      }
      markLoginOk();     // 真的拿到教务数据了，这才叫登录成功
      refreshLoginUI();
      load();
      if (showResult) {
        /* v1.1.8：toast 不能只说「N 门课」。
         * sync.js 的 count 是「从教务抓到几条课程记录」，
         * showable 是「其中周次解析成功、真能落到网格上的」。
         * 两者不等的典型场景：青果把周次列改成空格、或者填了「1-16周」这种
         * 不带方括号的写法 —— 那时旧代码只报「同步完成：12 门课」，
         * 页面却一片空白，用户只能以为 App 坏了。 */
        const nAll = sch.count | 0;
        const nOk = (typeof sch.showable === 'number') ? sch.showable : nAll;
        let msg = '同步完成：' + nOk + ' 门课';
        if (nAll > nOk) {
          msg += '（另有 ' + (nAll - nOk) + ' 条周次没读懂，没进课表）';
        }
        Host.toast(msg);
        if (nAll > 0 && nOk === 0) {
          showTip('同步到了 ' + nAll + ' 条课程，但一条周次都没读懂，课表是空的。\n\n'
            + '这通常是教务页面结构变了。点「从教务同步课表」旁的帮助、'
            + '或者到「我的 → 使用帮助」的「教务与课表」里看一眼说明；'
            + '也可以把「数据来源」那行发给我们。');
        }
        if (window.__XXMU_REFRESH_LOGIN) window.__XXMU_REFRESH_LOGIN();
      }
    }).catch(e => {
      if (showResult) showTip('同步出错\n\n' + errText(e));
    }).finally(() => {
      SYNCING = false;
      btn.disabled = false; btn.classList.remove('busy'); btn.textContent = '从教务同步课表';
    });
  }, 30);
}

document.getElementById('btnSync').onclick = () => syncSchedule(true);
window.__XXMU_REFRESH_LOGIN = refreshLoginUI;

/* 退出登录 */
document.getElementById('btnLogout').onclick = () => {
  if (!hasHost() || !Host.clearCookies) return;
  Host.clearCookies();
  /* 登录凭证清了，那条「上次成功用过」的记录也必须一起清。
   * 否则下次登录页显示的还是「已登录 · 3 天前用过」——cookie 已经没了，
   * 两个证据只剩一个，状态就是假的。 */
  try { if (Host.setPref) Host.setPref(LOGIN_OK_KEY, '0'); } catch (e) {}
  setTimeout(refreshLoginUI, 200);
};

document.getElementById('resync').onclick = () => {
  const ext = readExternal() || readCached();
  if (ext) {
    load();
    if (typeof Host !== 'undefined' && Host.toast) Host.toast('已重新读取本地数据');
    return;
  }
  const path = (typeof Host !== 'undefined' && Host.schedulePath) ? Host.schedulePath() : '';
  showTip('还没有课表数据。\n\n可以：\n1. 点上方的「登录教务」，登录后自动同步\n' +
    '2. 或把 schedule.json 放到：\n' + (path || '/sdcard/Android/data/com.xxmu.helper/files/schedule.json'));
};

/* 抽屉（Drawer）：装长内容。
 * 标题不再写死「同步说明」——它被 20 多处当通用弹窗用，
 * 标题写死等于每个场景都在说「同步说明」，其实同步只是其中一种。
 * 规则：第一行短（≤ 14 字）就当标题，剩下的当正文；
 * 否则统一叫「说明」。 */
function showTip(msg, title) {
  const lines = String(msg == null ? '' : msg).split('\n');
  let t = title;
  let bodyLines = lines;
  if (!t) {
    const first = (lines[0] || '').trim();
    if (lines.length > 1 && first && first.length <= 14) {
      t = first;
      bodyLines = lines.slice(1);
    } else {
      t = '说明';
    }
  }
  document.getElementById('sh-name').textContent = t;
  const body = document.getElementById('sh-body');
  body.innerHTML = '';
  bodyLines.forEach(line => {
    const r = el('div', 'row');
    r.appendChild(el('span', 'v', line));
    body.appendChild(r);
  });
  document.getElementById('sheet').classList.add('on');
}

document.getElementById('prev').onclick = () => { if (curWeek > 1) { curWeek--; renderWeek(); } };
document.getElementById('next').onclick = () => { if (curWeek < TOTAL_WEEKS) { curWeek++; renderWeek(); } };
document.getElementById('today').onclick = () => {
  curWeek = Math.min(Math.max(weekOf(new Date()), 1), TOTAL_WEEKS);
  renderWeek();
};

/* 课表区左右滑动切周 */
(function () {
  let x0 = null, y0 = null;
  const main = document.querySelector('main');
  main.addEventListener('touchstart', e => {
    if (!document.getElementById('tab-kb').classList.contains('active')) return;
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', e => {
    if (x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0 && curWeek < TOTAL_WEEKS) { curWeek++; renderWeek(); }
    else if (dx > 0 && curWeek > 1) { curWeek--; renderWeek(); }
  }, { passive: true });
})();

/* ===== 底部 Tab 切换 =====
 * 关于页不再占一个 tab 位（5 个位子给了课表/学习/WIKI/校园事务/我的），
 * 从「我的」页点「关于本软件」跳过去，返回按钮回「我的」。 */
/* 每个页面在顶栏显示什么。课表页的副标题是「河南医药大学」，
 * 其余页显示该页的一句话说明——比把标题栏做成一条死板的棕色横条好看得多。 */
const PAGE_HEAD = {
  kb: ['课表', '河南医药大学'],
  learn: ['学习', '作业与考试'],
  wiki: ['校园 WIKI', '学校资料与官方入口'],
  campus: ['校园事务', '饮水机 · 常用入口'],
  me: ['我的', '账号与数据'],
  about: ['关于', '开发者与反馈'],
  admin: ['管理控制台', '服务器后台'],
  guide: ['使用帮助', '这个 App 怎么用'],
  settings: ['设置', '外观 · 学期 · 更新'],
};

let CUR_TAB = 'kb';

/* ===== 导航层级 =====
 *
 * 底栏永远只代表「一级页面」（课表/学习/WIKI/校园事务/我的），它的高亮不会
 * 因为进了二级页而消失——这正是「底栏比内容高一级」的含义。
 * 二级页（目前只有「关于」）挂在某个一级 Tab 下面，靠顶栏的返回箭头 + 面包屑
 * 说明自己在第几层。这样用户任何时候按返回，都是顺着层级往上一级走，
 * 而不是从二级页一步掉到桌面。
 */
const TAB_PARENT = { about: 'me', admin: 'me', guide: 'me', settings: 'me' };
const rootOf = n => TAB_PARENT[n] || n;
const levelOf = n => (TAB_PARENT[n] ? 2 : 1);

function switchTab(name) {
  CUR_TAB = name;
  const root = rootOf(name);
  // 底栏高亮跟的是一级祖先，不是当前页
  document.querySelectorAll('#tabs button').forEach(x => {
    x.classList.toggle('active', x.dataset.tab === root);
  });
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  const sec = document.getElementById('tab-' + name);
  if (sec) sec.classList.add('active');

  // 顶栏跟着变：课表页显示周次行 + 今天/空教室，其他页只留标题
  const hd = document.getElementById('top');
  if (hd) {
    hd.dataset.page = name;
    hd.dataset.level = String(levelOf(name));
  }
  const info = PAGE_HEAD[name] || PAGE_HEAD.kb;
  const t = document.getElementById('hdTitle');
  const s = document.getElementById('hdSub');
  if (t) t.textContent = info[0];
  if (s) s.textContent = info[1];
  const crumb = document.getElementById('crumbName');
  if (crumb) crumb.textContent = info[0];

  const m = document.querySelector('main');
  if (m) m.scrollTop = 0;

  /* 进「我的」时重算本机账号卡片。
   * 激活状态可能在别的页面变过（比如刚在关于页重新输了码），
   * 每次进来重算比到处埋刷新调用可靠。 */
  if (name === 'me') {
    refreshAcctUI();
    refreshLoginUI();
  }

  /* 进学习页时刷新学习通卡片状态。
   * 不在别处调是因为这些状态随时可能变（用户在别的 App 里登录了学习通、
   * 或者刚在引导层里登完），每次进页面重算最省心。 */
  if (name === 'learn' && typeof CxUI !== 'undefined') {
    CxUI.paint();
    /* 缓存超过 30 分钟就静默重抓一次：作业状态会变，
     * 但也不能每次切页都抓（学习通对频繁请求不友好）。 */
    if (typeof CX !== 'undefined' && CX.loggedIn()) {
      const c = CX.cached();
      const stale = !c || !c.synced_at || (Date.now() / 1000 - c.synced_at > 1800);
      if (stale) CxUI.sync(true);
    }
  }
}

/* ===== 返回键接管 =====
 *
 * 为什么要有这个：Android 的物理/手势返回键默认直接退出 Activity，
 * 于是「点开空教室浮层 → 按返回」会一路退到桌面，用户丢掉整页上下文。
 * 现在 Java 侧把返回键交给这里判断：能就地消化就地消化（关浮层 / 回上一级 Tab），
 * 只有真的已经在首页课表时才让它退出。
 *
 * 返回 true = 我处理了，别退出；false = 交还给系统（退出 App）。
 */
function closeSheet() {
  const s = document.getElementById('sheet');
  if (s) s.classList.remove('on');
  parkTools();          // v1.1.28：半框关了，把住进来的卡搬回停车场
  // 清掉 sh-body 里残留的表单/设置内容（「+ 加一条」「设置」等）
  const body = document.getElementById('sh-body');
  if (body) body.innerHTML = '';
}

function sheetOpen() {
  const s = document.getElementById('sheet');
  return !!(s && s.classList.contains('on'));
}

/* ---- v1.1.28：待办/番茄钟「停车场」----
 * 两张卡平时住 #toolPark（display:none），点头部小按钮时整卡搬进
 * #sheet 的 .sh-box，关闭搬回来。DOM 常驻所以 MYTODO/FOCUS 的
 * render/paint 照旧按 id 找，感知不到自己被搬过。
 * 为什么用「搬」而不是复制：复制会有两份同 id DOM，两边的状态
 * （勾选框、计时大字）会各自演化，最后一定不同步。 */
const TOOL_PARK = { card: null };   // 当前住进半框的卡

function parkTools() {
  const park = document.getElementById('toolPark');
  if (TOOL_PARK.card && park) {
    // 保持原相对顺序：待办在前、番茄钟在后
    const fc = document.getElementById('focusCard');
    if (TOOL_PARK.card === fc && fc) park.appendChild(fc);
    else if (fc) park.insertBefore(TOOL_PARK.card, fc);
    else park.appendChild(TOOL_PARK.card);
    TOOL_PARK.card = null;
  }
  // 卡片回停车场后，清掉 sh-body 里残留的表单/设置内容（如果有）
  const body = document.getElementById('sh-body');
  if (body && !TOOL_PARK.card) body.innerHTML = '';
}

/* 打开卡片承载的半框之前，先把任何还留在 sh-body 里的表单清掉，
 * 再把目标卡搬进 .sh-box。卡片与表单不能同时在 .sh-box 里叠着。 */
function openToolCard(id) {
  const card = document.getElementById(id);
  const sheet = document.getElementById('sheet');
  const box = sheet && sheet.querySelector('.sh-box');
  if (!card || !box) return;
  // 已有别的卡住着：先请回停车场，一次只住一张
  if (TOOL_PARK.card && TOOL_PARK.card !== card) parkTools();
  const body = document.getElementById('sh-body');
  if (body) body.innerHTML = '';
  TOOL_PARK.card = card;
  card.style.display = '';
  box.appendChild(card);
  /* v1.1.66 / m00638：标题按 id 查表，别再写死「二选一」。加了 bindCard
   * 这张「账号绑定」卡组后三元式会把它也叫成「专注计时」。 */
  const NAMES = { myTodoCard: '我的待办', focusCard: '专注计时', bindCard: '账号绑定' };
  const nm = document.getElementById('sh-name');
  if (nm) nm.textContent = NAMES[id] || '';
  sheet.classList.add('on');
  if (id === 'myTodoCard' && typeof MYTODO !== 'undefined') MYTODO.render();
  if (id === 'focusCard' && typeof FOCUS !== 'undefined') FOCUS.paint();
  /* 卡组搬进半框后才刷新两张连接卡：CxUI 按 id 找静态节点、SrcUI 往
   * #srcCards 里画动态卡，节点被「搬」不丢绑定，paint 一次把最新状态/
   * 时间/降级原因填进去，避免用户看到搬进来之前的旧文案。 */
  if (id === 'bindCard') {
    if (typeof CxUI !== 'undefined') CxUI.paint();
    if (typeof SrcUI !== 'undefined') SrcUI.paint();
  }
}

/* 顶部小按钮的状态字：待办条数 + 计时当前值 */
function paintToolEntries() {
  const tc = document.getElementById('todoEntryCnt');
  if (tc && typeof MYTODO !== 'undefined') {
    const v = MYTODO.forView(MYTODO.list());
    tc.textContent = v.openCount ? String(v.openCount) : '0';
    tc.parentElement && (tc.parentElement.style.color = v.overdue ? 'var(--danger)' : '');
  }
  const fs = document.getElementById('focusEntryState');
  if (fs && typeof FOCUS !== 'undefined') {
    fs.textContent = FOCUS.fmt(FOCUS.remain(FOCUS.load()));
  }
}

window.__onBack = function () {
  if (sheetOpen()) { closeSheet(); return true; }
  // 二级页 → 回它的一级父页（底栏高亮因此不用变，本来就没离开过）
  if (TAB_PARENT[CUR_TAB]) { switchTab(TAB_PARENT[CUR_TAB]); return true; }
  // 一级页 → 回课表；已经在课表才允许退出
  if (CUR_TAB !== 'kb') { switchTab('kb'); return true; }
  return false;
};

// 顶栏返回箭头：只在二级页出现
(function () {
  const b = document.getElementById('hdBack');
  if (b) b.onclick = () => {
    if (TAB_PARENT[CUR_TAB]) switchTab(TAB_PARENT[CUR_TAB]);
    else if (CUR_TAB !== 'kb') switchTab('kb');
  };
})();

document.querySelectorAll('#tabs button').forEach(b => {
  b.onclick = () => {
    switchTab(b.dataset.tab);
    // 切到 WIKI 时重画一次（用户可能刚补过条目）
    if (b.dataset.tab === 'wiki' && typeof WIKI !== 'undefined') WIKI.render();
    if (b.dataset.tab === 'campus') CampusUI.refresh();
    if (b.dataset.tab === 'me') AdminUI.refresh();
  };
});

/* ===== 关于页 / 使用帮助页的进出 ===== */
(function () {
  const jump = document.getElementById('rowAbout');
  if (jump) jump.onclick = () => {
    switchTab('about');
    About.refresh();
  };
  const back = document.getElementById('aboutBack');
  if (back) back.onclick = () => switchTab('me');

  const gjump = document.getElementById('rowGuide');
  if (gjump) gjump.onclick = () => {
    switchTab('guide');
    if (typeof GUIDE !== 'undefined') GUIDE.render();
  };
  const gback = document.getElementById('guideBack');
  if (gback) gback.onclick = () => switchTab('me');

  /* v1.1.40：设置是「我的」下的二级页。返回箭头、物理返回键都由
   * TAB_PARENT 自动接管，这里只负责「从哪进来」和「进来后重画状态字」。 */
  const sjump = document.getElementById('rowSettings');
  if (sjump) sjump.onclick = () => {
    switchTab('settings');
    if (typeof THEME !== 'undefined' && THEME.paint) THEME.paint();
  };
  const sback = document.getElementById('settingsBack');
  if (sback) sback.onclick = () => switchTab('me');

  /* v1.1.56：外观轴 = 深浅（THEME）× 皮肤（SKIN）两条正交开关。
   * 从「我的」直接点皮肤行也能进设置，进来后两组按钮都要重画。 */
  const skinJump = document.getElementById('rowSkin');
  if (skinJump) skinJump.onclick = () => {
    switchTab('settings');
    if (typeof THEME !== 'undefined' && THEME.paint) THEME.paint();
    if (typeof SKIN !== 'undefined' && SKIN.paint) SKIN.paint();
  };
})();

/* ===== 管理员 · 控制台（联网） =====
 *
 * v0.8.0 起发码不再是「本机算一个数」——码是固定的（还是老算法，老码继续有效），
 * 真正决定谁能用的是服务器上的开卡记录。所以这个页面变成了一个真的后台：
 *   开卡 / 停用 / 收回 / 名单 / 设备 / 版本 / 日志
 *
 * 口令（ADMIN_KEY）存在本机 Prefs 里，只用来调 /v1/admin/*。
 * 它不是激活码，也不是密钥；服务器只认这一个口令，丢了只需在
 * Worker 的 Secret 里换一个新的。
 */
/* ===== App 内下载安装包 · 统一回调分发 =====
 *
 * 有两处会用到「下载并安装」：
 *   1. 管理员在版本页点「下载测一下」，验证服务器上那份包能装；
 *   2. 学生点更新弹窗的「去下载」。
 * Java 侧只有一个回调 window.__onApkDownload(ok, msg)，如果两处各自去赋值，
 * 后赋的那个会把前一个覆盖掉——表现就是「点了按钮什么都没发生」。
 * 所以这里做一层登记/分发：谁发起谁登记，回来时分给谁。
 */
const APKDL = (() => {
  let pending = null;      // { onDone, onProgress }
  /* 上一次报给界面的字节数。分段并发下载时 Java 侧已经节流到 150ms 一次，
   * 但 4 个线程各自累加，进度偶尔会「回退」（先到 90% 再被别的线程拉回 88%）。
   * 界面上的百分比不允许倒退，所以这里再夹一层。 */
  let lastPct = -1;

  function canUse() {
    return typeof Host !== 'undefined' && Host && typeof Host.downloadAndInstall === 'function';
  }

  /** 系统允许装未知来源吗？不允许就顺手跳到设置页，返回 false */
  function ensurePermission() {
    try {
      if (Host.canInstall && !Host.canInstall()) {
        if (typeof Host.openInstallSettings === 'function') Host.openInstallSettings();
        return false;
      }
    } catch (e) {}
    return true;
  }

  /**
   * @param url        完整下载地址
   * @param onDone     function(ok:boolean, msg:string)
   * @param onProgress function(pct:number, got:number, total:number)；total 未知时 pct 为 -1
   * @param sha        期望的整包 SHA-256（十六进制，可空）。
   *                   v1.1.8 起 Java 侧下载完会比对，不一致直接删文件报错。
   *                   分段下载只保证每段长度对，不保证拼起来是原文件 ——
   *                   而「长度对、字节错」的包安装器不一定会拒（错在 zip 的
   *                   未签名区域时签名照样通过），所以这一层必须在前端传下去。
   * @returns 'started' | 'busy' | 'noperm' | 'nohost'
   */
  function start(url, onDone, onProgress, sha) {
    if (!canUse()) return 'nohost';
    /* 已经有一次下载在跑：Java 侧只有 window.__onApkDownload 一个回调出口，
     * 再 start 一次会把 pending 覆盖掉，前一次的回调永远等不到，那个按钮就
     * 永久停在「下载中…」。这里直接拒掉第二次。 */
    if (pending) return 'busy';
    if (!ensurePermission()) return 'noperm';
    lastPct = -1;
    pending = {
      onDone: onDone || function () {},
      onProgress: onProgress || function () {},
    };
    try {
      /* 老版本 Java 桥只有单参签名：多传一个参数在 WebView 里会被忽略，
       * 不会抛异常，所以这里可以直接带上，不必先探测桥的版本。 */
      Host.downloadAndInstall(url, String(sha || ''));
      return 'started';
    } catch (e) {
      pending = null;
      return 'nohost';
    }
  }

  function progress(got, total) {
    if (!pending) return;
    const g = Number(got) || 0;
    const t = Number(total) || 0;
    let pct = t > 0 ? Math.floor(g * 100 / t) : -1;
    if (pct >= 0 && pct < lastPct) pct = lastPct;   // 不许倒退
    if (pct > 100) pct = 100;
    if (pct >= 0) lastPct = pct;
    try { pending.onProgress(pct, g, t); } catch (e) {}
  }

  function finish(ok, msg) {
    const p = pending;
    pending = null;
    lastPct = -1;
    try { if (p && p.onDone) p.onDone(!!ok, String(msg || '')); } catch (e) {}
  }

  return { start, progress, finish, canUse, ensurePermission };
})();

const AdminUI = (() => {
  const K_KEY = 'xxmu_admin_key';
  const PANES = ['grant', 'list', 'dev', 'ver', 'rev', 'notice', 'log'];
  let LIST = [];          // 服务端名单缓存（已确认真号，对应 confirmed 行）
  let ODD = [];           // 校准·异常名单（pending 待补录 / conflict 冲突）
  let LIST_TAB = 'normal';// 名单卡二级菜单：normal=正常名单 / cal=校准·异常
  let FILTER = 'all';
  let FIND = '';
  /* v1.1.64 方案 C：只看已确认开关。默认关=主列表把待补录的行也灰度带出来，
   * 开=主列表只显 confirmed；校准里始终能看见 pending / conflict。 */
  let ONLY_CONFIRMED = false;
  /* 刚选中的安装包：{name, size, path}。path 是 Java 侧私有目录里的绝对路径，
   * 字节从不经过 JS —— 见 MainActivity.Host.pickApk 的注释。 */
  let PICKED = null;
  /* 服务器上托管的安装包信息（/v1/config 带回来的 apk 字段） */
  let HOSTED = null;

  /* ---------- 小工具 ---------- */

  function $(id) { return document.getElementById(id); }

  function idsFrom(text) {
    return String(text || '')
      .split(/[\s,，;；、]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function key() { return XXMU.pref(K_KEY) || ''; }

  function setMsg(el, txt, ok) {
    if (!el) return;
    el.style.color = ok ? 'var(--ok)' : '';
    el.textContent = txt || '';
  }

  function busy(btn, on, txt) {
    if (!btn) return;
    if (on) {
      // 只在第一次进入时记住原文案：两次 busy(true) 叠在一起时，
      // 第二次会把「拉取中…」存成原始文案，恢复后按钮永远停在加载态。
      if (!btn.disabled) btn._t = btn.textContent;
      btn.textContent = txt || '处理中…';
      btn.disabled = true;
    } else {
      btn.textContent = btn._t || btn.textContent;
      btn.disabled = false;
    }
  }

  function fmtDay(ts) {
    if (!ts) return '--';
    /* 后台 now() 返回的是**秒**（worker.js: Math.floor(Date.now()/1000)），
     * 而这里曾经直接 new Date(ts) 按**毫秒**解析 → 2026-11-06 的秒级时间戳
     * 被当成毫秒，落在 1970-01-22，管理台显示成「1/22 02:17」。
     * 同一批调用点里还有一处已经乘了 1000（版本发布那条），两种单位都传得进来。
     * 所以按量级自判：< 1e11 当秒（≈1973 年前，业务数据不可能早于此），
     * 否则当毫秒。调用方不必再记「要不要乘 1000」。 */
    const ms = ts < 1e11 ? ts * 1000 : ts;
    const d = new Date(ms);
    const p = n => (n < 10 ? '0' + n : String(n));
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function actName(a) {
    return ({
      grant: '开通', revoke: '停用', unrevoke: '解封', ungrant: '清空设备',
      unbind: '解绑设备', 'revoke-device': '踢设备', config: '改配置',
      upload: '上传安装包', apkdel: '删安装包'
    })[a] || a;
  }

  /* ---------- 分段切换 ---------- */

  let STATS_AT = 0;

  function seg(name) {
    if (PANES.indexOf(name) < 0) name = 'grant';
    PANES.forEach(p => {
      const pane = $('admP-' + p);
      if (pane) pane.style.display = (p === name) ? 'block' : 'none';
    });
    document.querySelectorAll('#admSeg button').forEach(b => {
      b.classList.toggle('on', b.dataset.adm === name);
    });
    // 概览条在所有分段都可见，所以切页时要保证它不是「--」
    /* v1.1.15：切分段沿用 30 秒的口径（写在这里，不进 refreshStats —— 那里是
     * 3 秒的「别连点」节流，两个阈值管的是两件事，混在一起就都失效了）。 */
    if (key() && Date.now() - STATS_AT > 30000) refreshStats(true);
    if (name === 'log') loadAudit();
    /* 切到版本页要重画「已选的包」：PICKED 是常驻变量，但 DOM 只在选包那一刻
     * 被 renderPicked() 画过一次。不重画的话，切走再切回来界面回到「点这里选择
     * 安装包」，而 PICKED 里其实还留着上一个包 —— 管理员以为没选，点「上传并发布」
     * 发出去的却是旧包。 */
    if (name === 'ver') { loadAdmins(); renderPicked(); }
    if (name === 'notice') loadCfg();   // 公告状态要最新，切过来就刷一次
    if (name === 'list' && !LIST.length) refreshList();
    /* 审核页：切过来就拉一次。图片和留言都可能刚有人传，
     * 让管理员每次进来看到的都是新的，比「上次拉的缓存」有用得多。 */
    if (name === 'rev') { loadRevPhotos(); loadRevFb(); }
  }

  /* ---------- 停用 / 解封 / 清设备（v1.1.1：开卡与发码已移除） ---------- */

  async function revoke() {
    const ids = idsFrom($('admIds') && $('admIds').value);
    const err = $('admErr');
    setMsg(err, '');
    if (!key()) return setMsg(err, '先在上面填管理员口令');
    if (!ids.length) return setMsg(err, '填一个学号');
    if (!await askConfirm('停用 ' + ids.length + ' 个学号？\n\n对方下次联网就会被拦下，且设备记录会被清空。',
      { danger: true })) return;

    const btn = $('admRevoke');
    busy(btn, true, '停用中…');
    AUTH.Admin.revoke(ids).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg(err, (res && res.msg) || '停用失败');
      setMsg(err, '已停用 ' + (res.count || 0) + ' 个', true);
      refreshStats(true);
      LIST = [];
      /* v1.1.8：判空。同一文件里另一处（解封）本来就写了 `$('admP-list') &&`，
       * 这里漏了 —— HTML 改版或该 pane 未渲染时 `null.style` 抛 TypeError，
       * 停用其实已经成功，界面却卡在「停用中…」的状态上，用户会重复点。 */
      if ($('admP-list') && $('admP-list').style.display !== 'none') refreshList();
    }, e => {
      busy(btn, false);
      setMsg(err, '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /** 解封时不会再有「没开卡」这种情况了（开卡概念已取消），
   *  只剩下 wasRevoked = false 这一种「本来就没停用过」的提示。 */
  async function unrevoke() {
    const ids = idsFrom($('admIds') && $('admIds').value);
    const err = $('admErr');
    setMsg(err, '');
    if (!key()) return setMsg(err, '先在上面填管理员口令');
    if (!ids.length) return setMsg(err, '填一个学号');
    if (!await askConfirm('解封 ' + ids.length + ' 个学号？\n\n只撤掉停用标记，设备记录不恢复，' +
      '对方需要重新进一次。')) return;

    const btn = $('admUnrevoke');
    busy(btn, true, '解封中…');
    AUTH.Admin.unRevoke(ids).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg(err, (res && res.msg) || '解封失败');
      const rows = res.rows || [];
      const notRevoked = rows.filter(r => !r.wasRevoked).map(r => r.id);
      if (notRevoked.length) {
        setMsg(err, '这 ' + notRevoked.length + ' 个本来就没被停用过（' +
          notRevoked.join('、') + '），没做改动', true);
      } else {
        setMsg(err, '已解封 ' + (res.count || 0) + ' 个', true);
      }
      refreshStats(true);
      LIST = [];
      if ($('admP-list') && $('admP-list').style.display !== 'none') refreshList();
    }, e => {
      busy(btn, false);
      setMsg(err, '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /** 名单上每一行的快捷开关：已停用的显示「解封」，正常的显示「停用」。
   *  这样不用滚回「开卡」页再抄一遍学号——那是最容易抄错的一步。 */
  async function toggleRow(r) {
    const verb = r.revoked ? '解封' : '停用';
    if (!await askConfirm(verb + ' ' + r.id + '？' + (r.revoked ? '' :
      '\n\n对方下次联网就会被拦下，已绑设备记录会被清空。'),
      { danger: !r.revoked })) return;
    const fn = r.revoked ? AUTH.Admin.unRevoke : AUTH.Admin.revoke;
    fn.call(AUTH.Admin, [r.id]).then(res => {
      if (!res || !res.ok) { XXMU.toast((res && res.msg) || (verb + '失败')); return; }
      XXMU.toast('已' + verb + ' ' + r.id);
      LIST = [];
      refreshList();
      refreshStats(true);
    }, e => XXMU.toast('连不上服务器：' + ((e && e.message) || e)));
  }

  /** 「清空设备记录」：不再叫「收回开卡」。
   *  开卡概念取消后 ungrant 接口唯一还有用的副作用就是删 dev: —— 换手机时用。 */
  async function ungrant() {
    const ids = idsFrom($('admIds') && $('admIds').value);
    const err = $('admErr');
    setMsg(err, '');
    if (!key()) return setMsg(err, '先在上面填管理员口令');
    if (!ids.length) return setMsg(err, '填一个学号');
    if (!await askConfirm('清空 ' + ids.length + ' 个学号的设备绑定？\n\n' +
      '不影响停用状态，只是把已经绑过的手机记录清零，' +
      '对方下次进入时可以重新绑满名额。', { danger: true })) return;

    const btn = $('admUngrant');
    busy(btn, true, '清理中…');
    AUTH.Admin.unbind(ids).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg(err, (res && res.msg) || '清理失败');
      setMsg(err, '已清空 ' + (res.count || 0) + ' 个人的设备记录', true);
      refreshStats(true);
      LIST = [];
    }, e => {
      busy(btn, false);
      setMsg(err, '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /* ---------- 名单 ---------- */

  function refreshStats(force) {
    /* v1.1.8：时间戳记在这里，不记在调用点。
     * 原来 STATS_AT 只在 seg() 里更新，可是停用/解封/清设备这些操作
     * 各自直接调 refreshStats() 而不碰 STATS_AT —— 操作完切个分段，
     * 那个 30 秒判断还以为「该刷了」，于是又打一次一模一样的请求。
     * 一个操作两次 list() 看着无害，但管理员名单大了以后每次都是整表拉，
     * 而且两次响应回来的顺序不保证，后到的旧数据会把刚变的数字盖回去。
     * 统一成「谁发请求谁记时间」，节流和刷新就不会互相打架。
     *
     * v1.1.15：节流下沉到这里，并加 force 参数。
     * 原来节流只写在 seg()（切分段）那一条路径上，而「停用 / 解封 / 清设备 /
     * 踢单台」成功之后都是无条件 refreshStats()。管理员连续处理十几个人的
     * 审核时，每处理一个就整表拉一次 list()、renderList 又整表重建 ——
     * 十几次全量请求，滚动位置一次次丢。
     * 现在：3 秒内重复调用直接跳过；操作成功后传 true 强制刷。
     * 注意这是**本地节流**，不是服务端限流，目的只是别让手上这几十次点击
     * 变成几十次 KV 读。 */
    if (!force && STATS_AT && Date.now() - STATS_AT < 3000) return;
    STATS_AT = Date.now();
    /* 概览区自己的提示位（#admStatMsg）。不要借用 admMsg —— 那个写的是
     * 「名单」页里的 #admAdminMsg，在「管理」页上看不见，等于没提示。 */
    const statMsg = (txt, ok) => setMsg($('admStatMsg'), txt, ok);
    AUTH.Admin.list().then(res => {
      if (!res || !res.ok) {
        /* 别静默 return：口令填错（401）时原来什么都不显示，统计区
         * 一声不响地停在「—」，看起来像「加载完了只是没数据」。 */
        if ($('admStatGranted')) $('admStatGranted').textContent = '--';
        if ($('admStatRevoked')) $('admStatRevoked').textContent = '--';
        statMsg((res && res.msg) || '统计拉取失败', false);
        return;
      }
      statMsg('', false);
      LIST = res.rows || [];
      ODD = res.oddRows || [];
      const g = LIST.filter(r => !r.revoked).length;
      const rv = LIST.length - g;
      if ($('admStatGranted')) $('admStatGranted').textContent = String(g);
      if ($('admStatRevoked')) $('admStatRevoked').textContent = String(rv);
      if ($('admListCnt')) $('admListCnt').textContent = LIST.length + ' 人';
      /* v1.1.63 校准：正常 / 异常分开计数（用户原话「计数也分开计数」）。
       * 卡头只数正常号；两个二级菜单各自带自己的计数；「已隐去 N」保留原提示
       * 口径并指去「校准 · 异常」，异常明细在 renderOdd() 单独成表。 */
      if ($('admNormalCnt')) $('admNormalCnt').textContent = LIST.length + ' 人';
      const oddN = (res.oddCount != null ? res.oddCount : ODD.length);
      if ($('admOddCnt')) $('admOddCnt').textContent = oddN + ' 个';
      if ($('admListHidden')) $('admListHidden').textContent = res.hidden ? ('已隐去 ' + res.hidden + ' 个未绑定号码，见「校准 · 异常」') : '';
      renderKbSummary(res);
      renderList();
      renderOdd();
    }, e => {
      if ($('admStatGranted')) $('admStatGranted').textContent = '--';
      if ($('admStatRevoked')) $('admStatRevoked').textContent = '--';
      statMsg('连不上服务器：' + errText(e), false);
    });
  }

  /* v1.1.45：和后端 handleList 同一套判据（新收录从新到老）。
   * 前端再排一次是为了兼容还没更新的服务端 / 缓存里的旧响应；
   * at=0（老记录没时间）统一垫底，at 相同按 id 保持稳定。 */
  function listNewFirst(a, b) {
    const x = Number(a && a.at) || 0, y = Number(b && b.at) || 0;
    if (x !== y) return y - x;
    return String(a && a.id || '').localeCompare(String(b && b.id || ''));
  }
  /* 学号形状判据：本校在册学号是 11 位、以 2025/2026 这类年份开头。
   * 只用来在名单里「标出来给人看」，**不拦、不改、不删数据** —— 激活接口
   * 只要求 6~20 位纯数字，服务端历史上就收过 12 位 1 开头的手填号，
   * 那是真实用户填进来的，管理员需要看见它、而不是被系统悄悄吞掉。 */
  function looksOddId(id) {
    const s = String(id || '');
    return s.length !== 11 || !/^20\d{2}/.test(s);
  }
  function fmtAt(at) {
    const n = Number(at) || 0;
    if (n <= 0) return '';
    try {
      const d = new Date(n * 1000);
      const p = x => String(x).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return ''; }
  }

  function renderList() {
    const box = $('admList');
    if (!box) return;
    let rows = LIST.slice().sort(listNewFirst);
    /* v1.1.64 方案 C：默认把「待补录」的手填行也灰度带进主列表，
     * 上面粗的是进门填的号，下面细的小字写教务网状态；勾了「只看已确认」
     * 就只剩服务端 confirmed 的行。conflict（脏数据/真号撞车）只进校准。 */
    if (!ONLY_CONFIRMED) {
      const pending = ODD.filter(r => r.reason === 'pending')
        .map(r => Object.assign({}, r, { _pending: true }));
      rows = rows.concat(pending).sort(listNewFirst);
    }
    if (FILTER === 'granted') rows = rows.filter(r => !r.revoked);
    if (FILTER === 'revoked') rows = rows.filter(r => r.revoked);
    if (FIND) rows = rows.filter(r => r.id.indexOf(FIND) >= 0);

    /* v1.1.15：记住滚动位置再重建。
     * renderList 每次都是 `box.innerHTML = ''` 全表重画，而它被调用的频率
     * 比想象中高 —— 每次「停用 / 解封 / 清设备」成功都会走 refreshStats()
     * → renderList()。管理员连续处理十几个人的「通过 / 下架」时，
     * 每处理一个，列表就跳回顶部，他得重新滚回第 12 个人那里。
     * #admList 自己有 max-height:46vh 的独立滚动，所以重建后要把它
     * 自己的 scrollTop 还回去（不是外层页面的）。 */
    const keepTop = box.scrollTop;
    box.innerHTML = '';
    if (!rows.length) {
      box.appendChild(el('p', 'hint', LIST.length ? '没有符合条件的学号。' : '还没有人通过教务网绑定，乱填的学号不会进名单。'));
      return;
    }
    rows.forEach(r => {
      const row = el('div', 'adm-item' + (r._pending ? ' is-pending' : ''));
      const idWrap = el('div', 'adm-id-wrap');
      idWrap.appendChild(el('span', 'adm-id', r.id));
      /* v1.1.64：下面细的小字 = 教务网登录读回的真号（用户原话「下面细的小字
       * 是绑定教务网，确认是教务网登录所抓取到的学号」）；没抓到就写待补录。 */
      idWrap.appendChild(el('span', 'adm-kbline',
        r._pending ? '教务网：待补录' : ('教务网 ' + (r.kb || '') + ' · 已确认')));
      const when = fmtAt(r.at);
      if (when) idWrap.appendChild(el('span', 'adm-at', when));
      else idWrap.appendChild(el('span', 'adm-at', '早期记录 · 无时间'));
      row.appendChild(idWrap);
      const tags = el('span', 'adm-tags');
      tags.appendChild(el('span', r.revoked ? 'adm-bad' : 'adm-ok', r.revoked ? '已停用' : '正常'));
      /* v1.1.64：只有已确认行才挂「教务已绑定」；待补录靠灰度 + 细行说明 */
      if (!r._pending) tags.appendChild(el('span', 'adm-kb', '教务已绑定'));
      /* 形状异常的号只标出来，说明为什么它跟别人不一样，不做任何拦截 */
      if (looksOddId(r.id)) {
        tags.appendChild(el('span', 'adm-odd', '格式异常（手填）'));
      }
      if (r.note) tags.appendChild(el('span', 'adm-note', r.note));
      row.appendChild(tags);
      /* 每行一个开关：正常→停用，已停用→解封。
       * 这样不必把学号抄回上面的输入框——那一步最容易抄错，
       * 而抄错的后果是停用了别人。 */
      const tg = el('button', 'adm-cp', r.revoked ? '解封' : '停用');
      tg.onclick = () => toggleRow(r);
      row.appendChild(tg);
      const btn = el('button', 'adm-cp', '详情');
      /* v1.1.23：弹 #sheet 半框，不传行元素了（名单不动，无需记来源行）。 */
      btn.onclick = () => showDetail(r.id);
      row.appendChild(btn);
      box.appendChild(row);
    });
    /* 还回滚动位置（见函数开头）。放在最后一行，元素都在 DOM 里才生效。 */
    try { box.scrollTop = keepTop; } catch (e) {}
  }

  /* v1.1.63 校准：异常名单单独成表（用户原话「把有异常的单独挑出来在一个
   * 二级菜单里面，主菜单列表那就显示正常的」）。
   * ODD 来自 /v1/admin/list 的 oddRows —— 服务端把 bound 的补集整批回传，
   * 这里只负责渲染，判据在 worker.js 的 isKbId / kb 标记，不在前端重判。
   * 顺序与主列表同一套 listNewFirst，两处时间口径一致。 */
  function renderOdd() {
    const box = $('admOddList');
    if (!box) return;
    const rows = ODD.slice().sort(listNewFirst);
    const keepTop = box.scrollTop;
    box.innerHTML = '';
    if (!rows.length) {
      box.appendChild(el('p', 'hint', '校准里暂时没有异常号；手填和没绑教务的号都会单独归到这里。'));
      return;
    }
    rows.forEach(r => {
      const row = el('div', 'adm-item');
      const idWrap = el('div', 'adm-id-wrap');
      idWrap.appendChild(el('span', 'adm-id', r.id || '（空号）'));
      const when = fmtAt(r.at);
      if (when) idWrap.appendChild(el('span', 'adm-at', when));
      else idWrap.appendChild(el('span', 'adm-at', '早期记录 · 无时间'));
      row.appendChild(idWrap);
      const tags = el('span', 'adm-tags');
      if (r.revoked) tags.appendChild(el('span', 'adm-bad', '已停用'));
      /* reason 由服务端定：pending=还没补报真号，conflict=kb 脏数据/真号撞车 */
      tags.appendChild(el('span', 'adm-odd', r.reason === 'conflict' ? '两号冲突' : '待补录教务学号'));
      if (r.note) tags.appendChild(el('span', 'adm-note', r.note));
      row.appendChild(tags);
      const tg = el('button', 'adm-cp', r.revoked ? '解封' : '停用');
      tg.onclick = () => toggleRow(r);
      row.appendChild(tg);
      const btn = el('button', 'adm-cp', '详情');
      btn.onclick = () => showDetail(r.id);
      row.appendChild(btn);
      /* v1.1.64 方案 C：不等对方再开 App，管理员直接补教务网真号 */
      const fix = el('button', 'adm-cp adm-fix', '录真号');
      fix.onclick = () => openKbFix(r);
      row.appendChild(fix);
      box.appendChild(row);
    });
    try { box.scrollTop = keepTop; } catch (e) {}
  }

  /* v1.1.64 方案 C：校准里「手动录真号」。真号只在学生本机，等对方再开一次
   * App 自动补报不总是可行；管理员拿教务网查到的号直接补。用现成的 #sheet
   * 半框收输入，不依赖 window.prompt（WebView 里常被宿主拦掉）。 */
  /* v1.1.65 方案 A：全员重绑 / 撤销。破坏性动作跟 openKbFix 一样走 #sheet 半框
   * 二次确认，避免误点一下把全校票据都废掉；成功后刷新名单看回流。 */
  function openRebind(all) {
    const body = $('sh-body'), name = $('sh-name'), sheet = document.getElementById('sheet');
    if (!body || !name || !sheet) return;
    name.textContent = all ? '发起全员重绑教务网' : '撤销上次重绑';
    body.innerHTML = '';
    body.appendChild(el('p', 'hint', all
      ? '这会让所有人现有票据失效、名单里的教务真号标记清空，学生重开 App 后要重新登录一次教务网确认学号。动手前会先自动备份整份名单，随时可用「撤销」还原。'
      : '把名单与公告还原到发起全员重绑之前的样子，老票据重新有效。'));
    const msg = el('p', 'adm-tip', '');
    body.appendChild(msg);
    const go = el('button', 'btn ghost', all ? '确认发起' : '确认撤销');
    go.style.marginTop = '10px';
    go.onclick = () => {
      msg.style.color = '';
      msg.textContent = '正在处理…';
      go.disabled = true;
      const call = all ? AUTH.Admin.rebindAll() : AUTH.Admin.rebindUndo();
      call.then(res => {
        go.disabled = false;
        if (!res || !res.ok) { msg.textContent = (res && res.msg) || '操作失败'; msg.style.color = 'var(--danger)'; return; }
        sheet.classList.remove('on');
        const st = $('admRebindState');
        if (st) st.textContent = all
          ? ('已发起全员重绑：共 ' + (res.rows || 0) + ' 行名单回到待补录，老票据将陆续失效。')
          : ('已撤销：名单与公告还原完毕（' + (res.rows || 0) + ' 行）。');
        refreshList();
      }, e => {
        go.disabled = false;
        msg.textContent = '连不上服务器：' + errText(e);
        msg.style.color = 'var(--danger)';
      });
    };
    body.appendChild(go);
    sheet.classList.add('on');
  }

  function openKbFix(r) {
    const body = $('sh-body'), name = $('sh-name'), sheet = document.getElementById('sheet');
    if (!body || !name || !sheet) return;
    name.textContent = '补录教务学号 · ' + (r.id || '空号');
    body.innerHTML = '';
    body.appendChild(el('p', 'hint', '上面这行是进门时填的号；把教务网登录读回的 11 位真号填在下面，确认后它会变成「已确认」。'));
    const inp = document.createElement('input');
    inp.className = 'adm-in one';
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.placeholder = '教务网学号（20 开头，11 位）';
    body.appendChild(inp);
    const msg = el('p', 'adm-tip', '');
    body.appendChild(msg);
    const go = el('button', 'btn ghost', '确认补录');
    go.style.marginTop = '10px';
    go.onclick = () => {
      const real = String(inp.value || '').trim();
      if (!/^20\d{2}\d{7}$/.test(real)) {
        msg.textContent = '学号形状不对：要 20 开头、11 位数字。';
        msg.style.color = 'var(--danger)';
        return;
      }
      msg.style.color = '';
      msg.textContent = '正在补录…';
      AUTH.Admin.kbFix(r.id, real).then(res => {
        if (!res || !res.ok) { msg.textContent = (res && res.msg) || '补录失败'; return; }
        sheet.classList.remove('on');
        refreshList();
      }, e => { msg.textContent = '连不上服务器：' + errText(e); });
    };
    body.appendChild(go);
    sheet.classList.add('on');
    try { inp.focus(); } catch (e) {}
  }

  /* v1.1.64 方案 C：卡头三态计数（用户原话「计数也分开计数」）。
   * 服务端给 confirmedCount / pendingCount / conflictCount；老服务端没有时
   * 用 LIST / ODD 本地兜底，升级过渡期也不会显示 undefined。 */
  function renderKbSummary(res) {
    const sum = $('admKbSummary');
    if (!sum) return;
    const cc = (res && res.confirmedCount != null) ? res.confirmedCount : LIST.length;
    const pc = (res && res.pendingCount != null) ? res.pendingCount : ODD.filter(r => r.reason === 'pending').length;
    const fc = (res && res.conflictCount != null) ? res.conflictCount : ODD.filter(r => r.reason === 'conflict').length;
    sum.textContent = '';
    sum.appendChild(el('span', 'adm-sum-ok', '已确认 ' + cc));
    sum.appendChild(el('span', 'adm-sum-pending', '待补录 ' + pc));
    sum.appendChild(el('span', 'adm-sum-conflict', '冲突 ' + fc));
  }
  /* 名单卡二级菜单：正常名单 / 校准·异常，各自成表、各自计数。 */
  function switchListTab(t) {
    LIST_TAB = (t === 'cal') ? 'cal' : 'normal';
    const np = $('admNormalPane'), op = $('admOddPane');
    if (np) np.style.display = LIST_TAB === 'normal' ? '' : 'none';
    if (op) op.style.display = LIST_TAB === 'cal' ? '' : 'none';
    document.querySelectorAll('#admListTab button').forEach(b => {
      b.classList.toggle('on', b.dataset.t === LIST_TAB);
    });
  }

  /* v1.1.23：详情从内嵌卡片改成 #sheet 半屏弹窗。
   * 起因是用户原话「点详情能不能弹一个半框页面显示，而不是加载在上面」——
   * v1.1.14 那块卡排在名单卡上面，点开后名单被顶到下面一整屏，
   * 看完还得点「收起」。改用全局 #sheet（和考试详情/作业详情同一个组件）：
   * 打开只是给 #sheet 加 .on，名单的滚动位置一点都不动，
   * 关掉（右上角「关闭」/点遮罩）直接回原样，不用再 scrollIntoView 找行。 */
  let DETAIL_OPEN = false;

  function showDetail(id) {
    const body = $('sh-body');
    const name = $('sh-name');
    if (!body || !name) return;
    DETAIL_OPEN = true;
    name.textContent = '详情 · ' + id;
    body.innerHTML = '<p class="hint">读取中…</p>';
    document.getElementById('sheet').classList.add('on');

    AUTH.Admin.state([id]).then(res => {
      if (!res || !res.ok || !res.rows || !res.rows.length) {
        body.innerHTML = '<p class="hint">读不到这个学号的状态。</p>';
        return;
      }
      const r = res.rows[0];
      body.innerHTML = '';
      const add = (k, v, cls) => {
        const row = el('div', 'row');
        row.appendChild(el('span', '', k));
        const vv = el('span', 'v ' + (cls || ''), v);
        row.appendChild(vv);
        body.appendChild(row);
      };
      add('是否停用', r.revoked ? '已被停用' : '正常', r.revoked ? 'red' : '');
      add('设备数', (r.devCount || 0) + ' / ' + (res.maxDev || 3));
      if (r.last && r.last.at) add('最近进入', fmtDay(r.last.at) + (r.last.tag ? ' · ' + r.last.tag : ''));

      if (r.devices && r.devices.length) {
        body.appendChild(el('div', 'grp-head', '已绑设备'));
        r.devices.forEach((d, i) => {
          const row = el('div', 'adm-item');
          row.appendChild(el('span', 'adm-id', '#' + (i + 1) + ' ' + (d.tag || '未知机型')));
          row.appendChild(el('span', 'adm-devmeta', fmtDay(d.at) + ' · ' + (d.fp || '')));
          /* 单台踢掉：只拿走这一台，同学的另外两台照用。
           * 整人清空是上面「设备」页那个按钮，两者不混。 */
          if (d.fp) {
            const kick = el('button', 'adm-cp', '踢掉');
            kick.onclick = async () => {
              if (!await askConfirm('把这台设备从 ' + r.id + ' 名下解绑？\n\n' +
                (d.tag || '未知机型') + '\n\n对方下次打开会被要求重新进一次，' +
                '设备名额空出一个。', { danger: true })) return;
              AUTH.Admin.revokeDevice(r.id, d.fp).then(res3 => {
                if (!res3 || !res3.ok) { XXMU.toast((res3 && res3.msg) || '解绑失败'); return; }
                XXMU.toast('已解绑，剩 ' + (res3.devCount || 0) + ' 台');
                showDetail(r.id);
                LIST = [];
              }, e3 => XXMU.toast('连不上服务器：' + ((e3 && e3.message) || e3)));
            };
            row.appendChild(kick);
          }
          body.appendChild(row);
        });
      }

      /* 详情里也放一个进出口：看到状态不对时不用滚回上面。
       * 停用过的显示「解封」，正常的显示「停用」。 */
      const tg2 = el('button', 'btn soft', r.revoked ? '解封这个学号' : '停用这个学号');
      tg2.onclick = async () => {
        const verb2 = r.revoked ? '解封' : '停用';
        if (!await askConfirm(verb2 + ' ' + r.id + '？', { danger: !r.revoked })) return;
        const fn2 = r.revoked ? AUTH.Admin.unRevoke : AUTH.Admin.revoke;
        fn2.call(AUTH.Admin, [r.id]).then(res4 => {
          if (!res4 || !res4.ok) { XXMU.toast((res4 && res4.msg) || verb2 + '失败'); return; }
          XXMU.toast('已' + verb2);
          LIST = [];
          showDetail(r.id);
          refreshStats(true);
        }, e4 => XXMU.toast('连不上服务器：' + ((e4 && e4.message) || e4)));
      };
      body.appendChild(tg2);

      const clr = el('button', 'btn soft', '清空这个人的设备记录');
      clr.onclick = async () => {
        if (!await askConfirm('清空 ' + r.id + ' 的设备绑定？\n\n不影响停用状态。', { danger: true })) return;
        AUTH.Admin.unbind([r.id]).then(res2 => {
          if (!res2 || !res2.ok) { XXMU.toast((res2 && res2.msg) || '清理失败'); return; }
          XXMU.toast('已清空');
          showDetail(r.id);
          LIST = [];
        }, e2 => XXMU.toast('连不上服务器：' + ((e2 && e2.message) || e2)));
      };
      body.appendChild(clr);
    }, e => {
      hintInto(body, '连不上服务器：' + errText(e));
    });
  }

  function refreshList() {
    const btn = $('admListBtn');
    busy(btn, true, '拉取中…');
    AUTH.Admin.list().then(res => {
      busy(btn, false);
      if (!res || !res.ok) {
        hintInto($('admList'), (res && res.msg) || '拉取失败');
        return;
      }
      LIST = res.rows || [];
      ODD = res.oddRows || [];
      const g = LIST.filter(r => !r.revoked).length;
      if ($('admStatGranted')) $('admStatGranted').textContent = String(g);
      if ($('admStatRevoked')) $('admStatRevoked').textContent = String(LIST.length - g);
      if ($('admListCnt')) $('admListCnt').textContent = LIST.length + ' 人';
      if ($('admNormalCnt')) $('admNormalCnt').textContent = LIST.length + ' 人';
      const oddN = (res.oddCount != null ? res.oddCount : ODD.length);
      if ($('admOddCnt')) $('admOddCnt').textContent = oddN + ' 个';
      if ($('admListHidden')) $('admListHidden').textContent = res.hidden ? ('已隐去 ' + res.hidden + ' 个未绑定号码，见「校准 · 异常」') : '';
      renderKbSummary(res);
      renderList();
      renderOdd();
    }, e => {
      busy(btn, false);
      hintInto($('admList'), '连不上服务器：' + errText(e));
    });
  }

  /* ---------- 设备 ---------- */

  function devMsg(txt, ok) { setMsg($('admDevMsg'), txt, ok); }

  function queryDevs() {
    const id = ($('admDevId') && $('admDevId').value.trim()) || '';
    devMsg('');
    const box = $('admDevList');
    if (box) box.innerHTML = '';
    if (!key()) return devMsg('先在上面填管理员口令');
    if (!/^\d{6,20}$/.test(id)) return devMsg('填正确的学号');

    const btn = $('admDevQuery');
    busy(btn, true, '查询中…');
    AUTH.Admin.state([id]).then(res => {
      busy(btn, false);
      if (!res || !res.ok || !res.rows || !res.rows.length) return devMsg((res && res.msg) || '查询失败');
      const r = res.rows[0];
      if (!box) return;
      if (!r.devices || !r.devices.length) {
        box.appendChild(el('p', 'hint', '这个学号还没绑任何设备（或者刚被清空）。'));
      } else {
        r.devices.forEach((d, i) => {
          const row = el('div', 'adm-item');
          row.appendChild(el('span', 'adm-id', '#' + (i + 1) + ' ' + (d.tag || '未知机型')));
          row.appendChild(el('span', 'adm-devmeta', fmtDay(d.at) + '　' + (d.fp || '')));
          box.appendChild(row);
        });
      }
      if ($('admMaxDev')) $('admMaxDev').textContent = String(res.maxDev || 3);
      devMsg(r.devCount + ' / ' + (res.maxDev || 3) + ' 台', true);
    }, e => {
      busy(btn, false);
      devMsg('连不上服务器：' + ((e && e.message) || e));
    });
  }

  async function clearDevs() {
    const id = ($('admDevId') && $('admDevId').value.trim()) || '';
    devMsg('');
    if (!key()) return devMsg('先在上面填管理员口令');
    if (!/^\d{6,20}$/.test(id)) return devMsg('填正确的学号');
    if (!await askConfirm('清空 ' + id + ' 的全部设备记录？\n\n对方下次激活时就能绑上新手机。',
      { danger: true })) return;

    const btn = $('admDevClear');
    busy(btn, true, '清空中…');
    AUTH.Admin.unbind([id]).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return devMsg((res && res.msg) || '清空失败');
      devMsg('已清空 ' + (res.count || 0) + ' 个学号的设备', true);
      if ($('admDevList')) $('admDevList').innerHTML = '';
    }, e => {
      busy(btn, false);
      devMsg('连不上服务器：' + ((e && e.message) || e));
    });
  }

  /* ---------- 版本配置 ---------- */

  function setVal(id, v) { const e = $(id); if (e) e.value = v == null ? '' : String(v); }

  /** 最低版本框同时接受 0.9.13 和 34。
   * 返回统一为 {code, version}，与 Worker 的 blockOld 数据结构一致。
   * 不能用 Number.isFinite 验版本号字符串：Number.isFinite('0.9.13') 必为 false。 */
  function parseMinCode(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s === '0') return { code: 0, version: '0.0.0' };
    if (/^\d+$/.test(s)) return { code: parseInt(s, 10) || 0, version: '' };
    if (/^\d+\.\d+\.\d+$/.test(s)) return { code: 0, version: s };
    return null;
  }

  function loadCfg() {
    AUTH.Admin.getConfig().then(cfg => {
      if (!cfg) return;
      const L = cfg.latest || {}, M = cfg.min || {};
      setVal('cfgLatestVer', L.version);
      setVal('cfgLatestCode', L.code);
      setVal('cfgUrl', L.url);
      setVal('cfgNotes', L.notes);
      setVal('cfgQq', cfg.qq);
      setVal('cfgMaxDev', cfg.maxDev);
      setVal('cfgNotice', cfg.notice);
      setVal('cfgNoticeTitle', cfg.noticeTitle);
      setVal('cfgMinCode', (M.code && Number(M.code) > 0) ? M.code : (M.version || 0));
      if ($('cfgEnforce')) $('cfgEnforce').checked = !!cfg.enforceVer;
      if ($('admMaxDev')) $('admMaxDev').textContent = String(cfg.maxDev || 3);
      if ($('admStatDev')) $('admStatDev').textContent = String(cfg.maxDev || 3);
      if ($('admStatVer')) $('admStatVer').textContent = L.version || '--';

      /* 服务器上托管的安装包：有就显示，没有就整块藏起来 */
      HOSTED = cfg.apk || null;
      renderHosted();

      /* 发版助手：告诉管理员「现在线上是哪一版」，并把版本代码预填成
       * 线上值 +1 —— versionCode 必须严格大于线上值才能覆盖安装，
       * 手填错一个数字就是全校装不上（或者装上了还是旧界面）。 */
      const curCode = parseInt(L.code || '0', 10) || 0;
      const cur = $('apkCur');
      if (cur) {
        cur.textContent = curCode > 0
          ? '当前线上：v' + (L.version || '--') + '（code ' + curCode + '）'
          : '当前线上还没有配版本';
      }
      const ac = $('apkCode');
      if (ac && !ac.value.trim() && curCode > 0) ac.value = String(curCode + 1);
      const av = $('apkVer');
      if (av && !av.value.trim() && L.version && /^\d+\.\d+\.\d+$/.test(L.version)) {
        /* 只把补丁号 +1 当建议：1.0.0 → 1.0.1。管理员要发大版本自己改。 */
        const p = L.version.split('.').map(n => parseInt(n, 10) || 0);
        av.value = p[0] + '.' + p[1] + '.' + (p[2] + 1);
      }

      /* 提示策略回填 */
      const pol = (cfg.updPolicy === 'once') ? 'once' : 'nag';
      document.querySelectorAll('#cfgPolicy button').forEach(b => {
        b.classList.toggle('on', b.dataset.policy === pol);
      });

      /* 公告状态：让管理员一眼看出「这条公告发出去多久了、有没有生效」 */
      const st = $('cfgNoticeState');
      if (st) {
        const at = parseInt(cfg.noticeAt || '0', 10) || 0;
        const body = String(cfg.notice || '').trim();
        if (!body) { st.textContent = '无公告'; st.className = 'v dim'; }
        else if (!at) { st.textContent = '有正文但无发布时间（不会被弹出）'; st.className = 'v warn'; }
        else {
          st.textContent = '已发布 · ' + new Date(at * 1000).toLocaleString('zh-CN', { hour12: false });
          st.className = 'v ok';
        }
      }
    }, e => {
      /* 空失败回调的代价：/v1/config 是公开接口、不需要口令，所以这里
       * 失败基本只有「网络不通」一种原因；原来一声不响，管理员会以为
       * 配置页本来就是空的，然后照着空表单点保存，把线上配置覆盖成默认值。 */
      const st = $('cfgNoticeState');
      if (st) { st.textContent = '拉不到线上配置（' + errText(e) + '）'; st.className = 'v warn'; }
      setMsg($('cfgMsg'), '拉不到线上配置，先别保存 —— 现在表单里可能是空的。', false);
    });
  }

  async function saveCfg() {
    const msg = $('cfgMsg');
    setMsg(msg, '');
    if (!key()) return setMsg(msg, '先在上面填管理员口令');

    const ver = ($('cfgLatestVer') && $('cfgLatestVer').value.trim()) || '';
    const code = parseInt(($('cfgLatestCode') && $('cfgLatestCode').value) || '0', 10) || 0;
    const url = ($('cfgUrl') && $('cfgUrl').value.trim()) || '';
    const notes = ($('cfgNotes') && $('cfgNotes').value) || '';
    const qq = ($('cfgQq') && $('cfgQq').value.trim()) || '';
    const maxDev = parseInt(($('cfgMaxDev') && $('cfgMaxDev').value) || '3', 10) || 3;
    const minCode = parseMinCode($('cfgMinCode') && $('cfgMinCode').value);
    const enforce = !!($('cfgEnforce') && $('cfgEnforce').checked);
    const polBtn = document.querySelector('#cfgPolicy button.on');
    const updPolicy = polBtn ? polBtn.dataset.policy : 'nag';

    if (!/^\d+\.\d+\.\d+$/.test(ver)) return setMsg(msg, '版本号要写成 0.9.2 这样');
    if (code <= 0) return setMsg(msg, '版本代码要填一个正整数（对应 AndroidManifest 的 versionCode）');
    if (!minCode) return setMsg(msg, '最低版本请填版本号（如 0.9.14）或版本代码（如 35），填 0 表示关闭');
    if (url && !/^https?:\/\//i.test(url)) return setMsg(msg, '下载链接要以 http:// 或 https:// 开头');
    if (maxDev < 1 || maxDev > 10) return setMsg(msg, '设备上限填 1-10 之间');

    if (enforce && !await askConfirm('确实要打开强制淘汰？\n\n低于 ' + (minCode.version || ('versionCode ' + minCode.code)) + ' 的所有人下次联网就打不开了。\n如果新版还没发布好，他们会被卡死。',
      { danger: true })) return;
    if (minCode.code > code) return setMsg(msg, '最低版本代码不能大于最新版本代码');

    /* 前置拦截：开了强制淘汰但没有任何下载渠道 = 把人永久锁在门外。
     * 这不是「可能有问题」，这是必然事故，所以不允许保存。
     * 服务端也有同样的检查（handleSetCfg），这里只是让用户早点看到。 */
    if (enforce && (minCode.code > 0 || minCode.version !== '0.0.0') && !url && !qq) {
      return setMsg(msg, '不能开强制淘汰：下载链接和 QQ 群号都是空的，'
        + '被拦下的人将没有任何办法拿到新版本。请至少填一个。');
    }

    const btn = $('cfgSave');
    busy(btn, true, '保存中…');
    AUTH.Admin.setConfig({
      latest: { version: ver, code: code, url: url, notes: notes },
      min: minCode,
      qq: qq,
      maxDev: maxDev,
      /* 公告是独立动作，保存版本配置绝不顺带发布/修改公告。 */
      updPolicy: updPolicy,
      enforceVer: enforce,
    }).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg(msg, (res && res.msg) || '保存失败');
      /* 这里原来写的是 `if (level === 'soft' || level === 'force')` ——
       * `level` 是 UpdateUI 那个 IIFE 的内部变量（定义在文件更下面），
       * AdminUI 的作用域里根本没有它，于是这一行在 then 里抛
       * ReferenceError：保存明明成功了，界面上却一个字都不显示，
       * loadCfg() 也不会执行，用户以为没生效。
       *
       * 改成用刚提交的 code 与本机 versionCode 直接比，自给自足。 */
      const curC = parseInt((AUTH.curCode && AUTH.curCode()) || '0', 10) || 0;
      /* 用服务端返回的配置回读，不只回显本地输入。 */
      const savedMin = res.cfg && res.cfg.min ? res.cfg.min : minCode;
      setMsg(msg, '已保存：最低版本 ' + (savedMin.version || savedMin.code || 0)
        + (res.cfg && res.cfg.enforceVer ? '，强制淘汰已开启' : '，强制淘汰未开启')
        + (code > curC ? '；更新提示会在用户下次打开时出现。' : '。'), true);
      loadCfg();
    }, e => {
      busy(btn, false);
      setMsg(msg, '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /**
   * 强制淘汰前的预演：先看看会挡住谁。
   * 这个功能存在的理由——强制淘汰是不可逆的门，被挡住的人如果自己下不到
   * 新版就再也进不来了。所以按那个勾之前必须能看清代价。
   */
  function previewBlock() {
    const box = $('cfgPreviewOut');
    const btn = $('cfgPreview');
    if (!box) return;
    if (!key()) return setMsg($('cfgMsg'), '先在上面填管理员口令');

    const min = parseMinCode($('cfgMinCode') && $('cfgMinCode').value);
    if (!min) return setMsg($('cfgMsg'), '最低版本请填版本号或版本代码');
    const minCode = min.code;
    const minVer = min.version || '';
    if (!minCode && !minVer) return setMsg($('cfgMsg'), '最低版本填 0 就等于没拦人，不用预演');

    busy(btn, true, '统计中…');
    AUTH.Admin.versionCheck(minCode, minVer).then(r => {
      busy(btn, false);
      box.style.display = 'block';
      box.innerHTML = '';
      if (!r || !r.ok) {
        box.appendChild(el('p', 'hint', (r && r.msg) || '查不到'));
        return;
      }
      const n = (r.blocked || []).length;
      const u = (r.unknown || []).length;
      const head = el('div', 'adm-item');
      head.appendChild(el('span', 'adm-id',
        n ? ('会被挡住 ' + n + ' 人') : '没有人会被挡住'));
      head.appendChild(el('span', 'adm-' + (n ? 'rev' : 'ok'), n ? '有风险' : '安全'));
      box.appendChild(head);

      (r.blocked || []).forEach(x => {
        const row = el('div', 'adm-item');
        row.appendChild(el('span', 'adm-id', x.id));
        row.appendChild(el('span', 'adm-devmeta',
          'v' + x.ver + (x.tag ? '　' + x.tag : '')));
        box.appendChild(row);
      });
      if (u) {
        box.appendChild(el('p', 'hint tight',
          '另有 ' + u + ' 人没有上报过版本（可能是很久没联网），'
          + '他们下次联网也会被拦下，请确认他们能拿到新版。'));
      }
      if (n || u) {
        box.appendChild(el('p', 'hint tight',
          '上面这些人升级之前会进不去。请先确保他们能拿到安装包（QQ 群 / 直链）。'));
      }
    }, e => {
      busy(btn, false);
      setMsg($('cfgMsg'), '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /** 管理员主动发一条通知：与 latest.notes（更新说明）完全无关。
   * 每次点击都生成新的 noticeAt，因此同一句话想再通知一次也可以。 */
  function publishNotice() {
    const msg = $('noticeMsg');
    setMsg(msg, '');
    if (!key()) return setMsg(msg, '先在上面填管理员口令');
    const title = ($('cfgNoticeTitle') && $('cfgNoticeTitle').value.trim()) || '';
    const body = ($('cfgNotice') && $('cfgNotice').value.trim()) || '';
    if (!body) return setMsg(msg, '先写想对大家说的话，再点「发布公告」');
    const btn = $('cfgNoticePublish');
    busy(btn, true, '发布中…');
    AUTH.Admin.setConfig({
      notice: body,
      noticeTitle: title,
      noticeAt: Math.floor(Date.now() / 1000),
    }).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg(msg, (res && res.msg) || '发布失败');
      const at = res.cfg && res.cfg.noticeAt;
      if (res.cfg && res.cfg.notice !== body) return setMsg(msg, '服务器回读的公告与刚填写的不一致，请重试');
      setMsg(msg, '公告已发布。联网用户下次打开 App 就会看到；每台设备看过后不再重复弹出。'
        + (at ? ('发布时间：' + new Date(at * 1000).toLocaleString('zh-CN', { hour12: false })) : ''), true);
      loadCfg();
    }, e => {
      busy(btn, false);
      setMsg(msg, '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /** 撤掉公告：正文清空 + noticeAt 归零，客户端就不会再弹 */
  async function clearNotice() {
    if (!key()) return;
    if (!await askConfirm('撤掉当前公告？\n\n已经看过的人不受影响，没看过的人以后也不会再看到这条。',
      { danger: true })) return;
    const btn = $('cfgNoticeClear');
    busy(btn, true, '撤回中…');
    AUTH.Admin.setConfig({
      latest: {}, min: {}, notice: '', noticeTitle: '', noticeAt: 0,
    }).then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg($('noticeMsg'), (res && res.msg) || '撤回失败');
      setVal('cfgNotice', '');
      setVal('cfgNoticeTitle', '');
      setMsg($('noticeMsg'), '公告已撤回。', true);
      loadCfg();
    }, e => {
      busy(btn, false);
      setMsg($('noticeMsg'), '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /* ---------- 安装包：选包 / 上传 / 托管 ----------
   *
   * 字节从不经过 JS：Java 侧把选中的文件复制进自己的私有目录，
   * 只把绝对路径回传给这里；上传时也是 Java 直接把那个文件流式 POST 出去。
   * 这样 8 MB 的包不会在 WebView 里被 base64 撑到 30 MB 然后被系统杀掉。
   */

  function fmtSize(n) {
    const b = Number(n) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  function hostReady() {
    return typeof Host !== 'undefined' && Host && typeof Host.pickApk === 'function';
  }

  /** 从文件名里猜版本号：河医大助手-v1.0.0.apk → 1.0.0 */
  function guessVer(name) {
    const m = String(name || '').match(/(\d+\.\d+\.\d+)/);
    return m ? m[1] : '';
  }

  function renderPicked() {
    const n = $('apkPickName'), m = $('apkPickMeta'), box = $('apkPick');
    if (!n || !m) return;
    if (box) box.classList.toggle('has', !!PICKED);
    if (!PICKED) {
      n.textContent = '点这里选择安装包';
      m.textContent = '从手机文件里选 .apk';
      return;
    }
    n.textContent = PICKED.name || '已选中';
    m.textContent = fmtSize(PICKED.size) + '　点一下可以换一个';
    /* 文件名里带版本号就无条件写进去：河医大助手-v1.0.0.apk → 1.0.0。
     * 文件名是这次真正要发的那个包，比 loadCfg 猜的「补丁号 +1」可靠。 */
    const v = $('apkVer');
    if (v) {
      const g = guessVer(PICKED.name);
      if (g) v.value = g;
    }
  }

  function pickApk() {
    if (!hostReady()) {
      setMsg($('apkMsg'), '这个功能要在 App 里用。浏览器里没法读你手机上的安装包。');
      return;
    }
    setMsg($('apkMsg'), '');
    Host.pickApk();
  }

  window.__onApkPicked = function (name, size, path) {
    if (!name || !path) {
      /* 用户按了返回：什么都不做，别把已经选好的包清掉 */
      return;
    }
    PICKED = { name: String(name), size: Number(size) || 0, path: String(path) };
    renderPicked();
    const msg = $('apkMsg');
    setMsg(msg, '');
    if (!/\.apk$/i.test(PICKED.name)) {
      setMsg(msg, '这个文件不叫 .apk，请确认选对了（如果确实是安装包，仍然可以上传）。');
    }
  };

  window.__onApkUpload = function (key, result) {
    const btn = $('apkUpload'), btn2 = $('apkUploadOnly');
    busy(btn, false);
    busy(btn2, false);
    const msg = $('apkMsg');
    const r = XXMU.splitResp(result);
    if (r.code === -1) return setMsg(msg, '上传失败：' + r.body);

    let data = null;
    try { data = JSON.parse(XXMU.decodeAuto(r.body)); } catch (e) {}
    if (!data) {
      return setMsg(msg, '服务器返回看不懂（HTTP ' + r.code + '）：'
        + String(XXMU.decodeAuto(r.body) || '').slice(0, 160));
    }
    if (!data.ok) return setMsg(msg, data.msg || ('上传被拒绝（HTTP ' + r.code + '）'));

    const a = data.apk || {};
    setMsg(msg, '上传成功：' + (a.name || '') + '　' + fmtSize(a.size)
      + (data.latest ? '　已同时发布 v' + data.latest.version + '（code ' + data.latest.code + '）' : '　只存了包，线上配置没动'), true);
    loadCfg();
  };

  window.__onApkDownload = function (ok, msgText) {
    APKDL.finish(ok, msgText);
  };

  /* Java 侧分段下载的进度回调。没接这个函数之前，按钮只会从「去下载」
   * 跳到「下载中…」然后一直不动 —— 学生分不清是在下还是卡死了。 */
  window.__onApkProgress = function (got, total) {
    APKDL.progress(got, total);
  };

  async function uploadApk(publish) {
    const msg = $('apkMsg');
    setMsg(msg, '');
    if (!key()) return setMsg(msg, '先在上面填管理员口令');
    if (!PICKED || !PICKED.path) return setMsg(msg, '先点上面那块「点这里选择安装包」选一个包');
    if (!hostReady() || typeof Host.uploadApk !== 'function') {
      return setMsg(msg, '这个功能要在 App 里用。');
    }

    let ver = ($('apkVer') && $('apkVer').value.trim()) || '';
    let code = parseInt(($('apkCode') && $('apkCode').value) || '0', 10) || 0;

    if (publish) {
      if (!/^\d+\.\d+\.\d+$/.test(ver)) return setMsg(msg, '版本号要写成 1.0.0 这样');
      if (code <= 0) return setMsg(msg, '版本代码要填一个正整数（对应 AndroidManifest 的 versionCode）');
    }
    if (PICKED.size > 24 * 1048576) {
      return setMsg(msg, '这个包 ' + fmtSize(PICKED.size) + '，超过服务器单文件 24 MB 上限。');
    }
    if (publish && !await askConfirm('上传并发布 v' + ver + '（code ' + code + '）？\n\n'
      + '所有联网用户下次打开 App 就会收到更新提示。', { danger: true })) return;

    const btn = publish ? $('apkUpload') : $('apkUploadOnly');
    const btn2 = publish ? $('apkUploadOnly') : $('apkUpload');
    /* 两个按钮一起进加载态：上传期间无论点哪个都会被 busy() 的 disabled 挡住，
     * 不会出现「一个在传、另一个还能点」导致同一时刻两次上传。 */
    busy(btn, true, '上传中…');
    busy(btn2, true, '上传中…');

    /* base 必须显式带上：请求经 Pages 代理转发到 Worker，Worker 看到的
     * request.url 是它自己的 workers.dev 域名，而那个域名在国内被 DNS 污染。
     * 让服务端拿它拼下载链接，写进配置的就是一个全校都打不开的地址。 */
    const q = '?name=' + encodeURIComponent(PICKED.name)
      + '&ver=' + encodeURIComponent(ver)
      + '&code=' + code
      + '&publish=' + (publish ? '1' : '0')
      + '&base=' + encodeURIComponent(AUTH.BASE);
    const k = 'up' + Date.now() + Math.floor(Math.random() * 1000);
    try {
      Host.uploadApk(k, AUTH.BASE + '/v1/admin/upload' + q, key(), PICKED.path);
    } catch (e) {
      busy(btn, false);
      busy(btn2, false);
      setMsg(msg, '调不起上传：' + ((e && e.message) || e));
    }
  }

  function renderHosted() {
    const box = $('apkHosted');
    if (!box) return;
    if (!HOSTED) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('apkHostedName', HOSTED.name || '--');
    set('apkHostedSize', fmtSize(HOSTED.size));
    set('apkHostedAt', HOSTED.at ? new Date(HOSTED.at * 1000).toLocaleString('zh-CN', { hour12: false }) : '--');
    set('apkHostedSha', String(HOSTED.sha256 || '--').slice(0, 16) + '…');
  }

  function testDownload() {
    const msg = $('apkMsg');
    setMsg(msg, '');
    if (!APKDL.canUse()) return setMsg(msg, '这个功能要在 App 里用。');
    if (!APKDL.ensurePermission()) {
      return setMsg(msg, '系统还没允许本应用安装软件。已跳到设置页，把「允许安装未知应用」打开后回来再点一次。');
    }
    busy($('apkTest'), true, '下载中…');
    /* v1.1.8：带上 sha256。测试下载和正式更新走同一个入口，
     * 这里不传就等于「管理员测的时候跳过校验，学生下的却要过」——
     * 两条路不一致，测试就失去了意义。 */
    const r = APKDL.start(AUTH.BASE + '/v1/apk', (ok, m) => {
      busy($('apkTest'), false);
      if (ok) setMsg(msg, '下载完成，已拉起系统安装器。', true);
      else setMsg(msg, '下载失败：' + (m || '未知原因'));
    }, null, HOSTED && HOSTED.sha256);
    if (r !== 'started') {
      busy($('apkTest'), false);
      setMsg(msg, r === 'noperm' ? '系统还没允许安装软件，请先在设置里打开。'
        : r === 'busy' ? '上一次下载还没结束，等它跑完再试。'
        : '这个功能要在 App 里用。');
    }
  }

  async function delHosted() {
    if (!key()) return;
    if (!await askConfirm('删掉服务器上的安装包？\n\n线上配置里的下载链接不会自动改，'
      + '如果它还指着 /v1/apk，学生点「去下载」会看到「服务器上还没有安装包」。',
      { danger: true })) return;
    const btn = $('apkDel');
    busy(btn, true, '删除中…');
    AUTH.Admin.delApk().then(res => {
      busy(btn, false);
      if (!res || !res.ok) return setMsg($('apkMsg'), (res && res.msg) || '删除失败');
      HOSTED = null;
      renderHosted();
      setMsg($('apkMsg'), '已删除服务器上的安装包。', true);
      loadCfg();
    }, e => {
      busy(btn, false);
      setMsg($('apkMsg'), '连不上服务器：' + ((e && e.message) || e));
    });
  }

  /** 把「下载链接」一键指向我们自己托管的包 */
  function useSelfUrl() {
    const u = AUTH.BASE + '/v1/apk';
    if (!HOSTED) {
      /* 服务器上还没有包时填这个地址是个死链：学生点「去下载」会拿到
       * 「服务器上还没有安装包」，而管理员在后台看不到任何异常。 */
      setMsg($('cfgMsg'), '服务器上还没有安装包，先在上面「发布新版本」里传一个。');
      return;
    }
    setVal('cfgUrl', u);
    setMsg($('cfgMsg'), '下载链接已填成 ' + u + '，记得点下面的「保存版本配置」。', true);
  }

  /* ---------- 操作日志 ---------- */

  function loadAudit() {
    const box = $('admAudit');
    const btn = $('admAuditBtn');
    if (!box) return;
    if (!key()) { box.innerHTML = '<p class="hint">先在上面填管理员口令。</p>'; return; }
    busy(btn, true, '拉取中…');
    AUTH.Admin.audit().then(res => {
      busy(btn, false);
      box.innerHTML = '';
      if (!res || !res.ok || !res.rows || !res.rows.length) {
        box.appendChild(el('p', 'hint', '还没有任何管理动作。'));
        return;
      }
      res.rows.forEach(r => {
        const row = el('div', 'adm-item');
        row.appendChild(el('span', 'adm-id', actName(r.act)));
        const n = r.n ? r.n + ' 人' : '';
        const idsTxt = (r.ids || []).slice(0, 3).join(' ');
        row.appendChild(el('span', 'adm-devmeta', fmtDay(r.at)));
        const sub = el('div', 'adm-audit-sub', (n ? n + '　' : '') + idsTxt + (r.extra ? '　' + r.extra : ''));
        row.appendChild(sub);
        box.appendChild(row);
      });
    }, e => {
      busy(btn, false);
      hintInto(box, '连不上服务器：' + errText(e));
    });
  }

  /* ---------- 管理员名单 ---------- */

  function admMsg(txt, ok) { setMsg($('admAdminMsg'), txt, ok); }

  function loadAdmins() {
    const box = $('admAdmins');
    if (!box) return;
    if (!key()) { box.innerHTML = '<p class="hint">先在上面填管理员口令。</p>'; return; }
    AUTH.Admin.admins('list', []).then(res => {
      box.innerHTML = '';
      const ids = (res && res.ok && res.ids) || [];
      if (!ids.length) {
        box.appendChild(el('p', 'hint', '名单是空的。如果删光了，就再没人能进管理后台 —— 只能改服务器 KV。'));
        return;
      }
      ids.forEach(id => {
        const row = el('div', 'adm-item');
        row.appendChild(el('span', 'adm-id', id));
        const del = el('button', 'adm-cp', '移除');
        del.onclick = async () => {
          if (!await askConfirm('把 ' + id + ' 从管理员名单里移除？\n他会掉回普通学生身份。',
            { danger: true })) return;
          AUTH.Admin.admins('del', [id]).then(r2 => {
            admMsg(r2 && r2.ok ? '已移除 ' + id : ((r2 && r2.msg) || '移除失败'), r2 && r2.ok);
            loadAdmins();
          }, e => admMsg('连不上服务器：' + ((e && e.message) || e), false));
        };
        row.appendChild(del);
        box.appendChild(row);
      });
    }, e => {
      hintInto(box, '连不上服务器：' + errText(e));
    });
  }

  function addAdmin() {
    const box = $('admAddId');
    const ids = idsFrom((box && box.value) || '');
    if (!ids.length) { admMsg('请填写学号', false); return; }
    const bad = ids.filter(i => !/^\d{6,20}$/.test(i));
    if (bad.length) { admMsg('这些不是合法学号：' + bad.join(' '), false); return; }
    const btn = $('admAddBtn');
    busy(btn, true, '提交中…');
    AUTH.Admin.admins('add', ids).then(res => {
      busy(btn, false);
      if (res && res.ok) { admMsg('已加入：' + ids.join(' '), true); if (box) box.value = ''; loadAdmins(); }
      else admMsg((res && res.msg) || '加入失败', false);
    }, e => {
      busy(btn, false);
      admMsg('连不上服务器：' + ((e && e.message) || e), false);
    });
  }

  /* ---------- 复制 ---------- */

  /* v1.1.1：激活码已取消，界面上的「复制码」入口随之删掉。
   * copyText 留着是因为管理员名单、设备指纹、日志页还在用。
   *
   * v1.1.8：原来三层兜底全失败时一声不响 —— 用户点了「复制」，
   * 界面没有任何变化，他以为复制成功了，粘出来是空的（或者上一轮的内容）。
   * 现在把每层的结果往上收，全失败时明确告诉他「复制失败，长按选中手动复制」，
   * 并把文本塞进一个可长按选中的输入框，至少还有手动这条路。 */
  function copyText(text, msg) {
    const s = String(text == null ? '' : text);
    try {
      if (typeof Host !== 'undefined' && Host.clip) {
        Host.clip(s);
        if (Host.toast) Host.toast(msg || '已复制');
        return true;
      }
    } catch (e) {}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s).then(() => {
          if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast(msg || '已复制');
        }).catch(() => {
          if (fb(s)) {
            if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast(msg || '已复制');
          } else failCopy(s);
        });
        return true;
      }
    } catch (e) {}
    if (fb(s)) {
      if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast(msg || '已复制');
      return true;
    }
    failCopy(s);
    return false;
  }

  function fb(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  /* 三层都复制不了（老 WebView 上 clipboard 可能被禁、execCommand 也可能返回 false）：
   * 弹一个只读输入框把内容选中，让用户自己长按复制。总比假装成功强。 */
  function failCopy(text) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('复制失败，请长按下面的内容手动复制');
      const box = document.getElementById('sh-body');
      const name = document.getElementById('sh-name');
      if (!box) return;
      if (name) name.textContent = '手动复制';
      box.innerHTML = '';
      const ta = document.createElement('textarea');
      ta.className = 'adm-in';
      ta.rows = 6;
      ta.value = text;
      box.appendChild(ta);
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '系统没允许自动复制。上面的内容已经选中，长按它 →「全选」→「复制」。';
      box.appendChild(p);
      const sh = document.getElementById('sheet');
      if (sh) sh.classList.add('on');
      setTimeout(() => { try { ta.focus(); ta.select(); } catch (e) {} }, 60);
    } catch (e) {}
  }

  /* ---------- 入口 ---------- */

  function visible() {
    /* 只认服务端签发的 role。本地再没有「学号命中常量即管理员」这条路。
     * 想加/删管理员：后台「管理控制台 → 版本页」旁边的管理员名单，
     * 或直接 POST /v1/admin/admins {act:'add', ids:[...]}。 */
    return AUTH.isAdmin();
  }

  function refresh() {
    const card = document.getElementById('adminCard');
    if (card) card.style.display = visible() ? 'block' : 'none';
  }

  function saveKey() {
    const n = $('admKey');
    const msg = $('admKeyMsg');
    /* 只去空白、不改大小写。口令是逐字节比对的（服务端 constEq），
     * 从聊天窗口复制时最常带进来的是首尾换行，其次是中间被折行插进来的
     * 空格 —— 两种都会让 40 位变成 41+ 位，服务端只会回一句「口令不正确」，
     * 看不出是长度问题。所以这里把**所有**空白都去掉，而不是只 trim 首尾。 */
    const k = String((n && n.value) || '').replace(/\s+/g, '');
    setMsg(msg, '');
    if (!k) return setMsg(msg, '口令不能为空');

    /* v1.1.8：验证失败要把内存里的 key 也回滚掉。
     * 原来只清 pref（XXMU.pref(K_KEY, '')），AUTH.Admin.setKey(k) 留在内存里 ——
     * 于是「界面上看着像没连上，实际所有管理请求都带着那个错口令在跑」。
     * 更糟的是接着点别的管理按钮会用旧口令发出去，成功后界面又会漂回「已连接」，
     * 前后状态自相矛盾。
     *
     * v1.1.12 修一个把整个按钮打死的手误：
     *   AUTH.Admin.key 是**字符串属性**（auth.js 里 `const Admin = { key: '', … }`），
     *   不是取值函数。原来写 `AUTH.Admin.key ? AUTH.Admin.key() : ''` ——
     *   一旦已经存过口令（字符串非空、三元为真），第二段就会调一个字符串，
     *   抛 TypeError: AUTH.Admin.key is not a function。
     *   这行在所有写 pref 的语句**之前**，于是整个 saveKey 从这里就断了：
     *   口令没存、请求没发、#admKeyMsg 一个字都没写。用户看到的是「点了没反应」，
     *   而页面上残留的红色「管理员口令不正确」来自 refreshStats 的 #admStatMsg
     *   （用旧口令拉的），两条消息分属两个元素，看起来像「新口令也不对」。
     * 现在：读字符串不再调用；失败时两个提示位一起写，不再各说各话。 */
    const prev = String((AUTH.Admin && AUTH.Admin.key) || '');
    const statMsg = $('admStatMsg');
    XXMU.pref(K_KEY, k);
    AUTH.Admin.setKey(k);
    setMsg(msg, '验证中…');
    setMsg(statMsg, '');
    AUTH.Admin.list().then(res => {
      if (res && res.ok) {
        setMsg(msg, '已连接，名单 ' + (res.count || 0) + ' 人', true);
        if ($('admPanel')) $('admPanel').style.display = 'block';
        loadCfg();
        /* 传 true：这里上面刚打过一次 list()，但那次的结果只用来判断口令
         * 对不对，没写进 LIST。3 秒节流会把这第二次调用直接跳掉，
         * 于是面板打开了、名单却是空的 —— 看起来像「口令对了但没人用过」。
         * 这个动作在「粘贴一次口令」时只发生一次，多一次全量拉无所谓。 */
        refreshStats(true);
      } else {
        const why = (res && res.msg) || '口令不正确';
        setMsg(msg, why);
        setMsg(statMsg, why);
        /* 回滚要回滚到「之前那个」，不是回到空。
         * 原来一律 XXMU.pref(K_KEY, '')，于是一次手滑粘错就把一个本来能用的
         * 口令抹掉了 —— 下次进 App 面板直接不显示，得重新粘一遍对的。
         * 只有 prev 本来就是空（从没存过）时才清空。 */
        XXMU.pref(K_KEY, prev);
        AUTH.Admin.setKey(prev);
      }
    }, e => {
      /* 连不上不能算口令错：网络问题把口令回滚掉，用户得重填一遍。
       * 但也别把新口令当成已验证 —— 只提示失败，让用户自己决定要不要再点。 */
      const why = '连不上服务器：' + errText(e) + '（口令先留着，稍后再点一次「保存口令并连接」）';
      setMsg(msg, why);
      setMsg(statMsg, why);
    });
  }

  function init() {
    const k = $('admKey');
    if (k) k.value = key();

    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('admKeySave', saveKey);
    on('admRevoke', revoke);
    on('admUnrevoke', unrevoke);
    on('admUngrant', ungrant);
    on('admListBtn', refreshList);
    on('admRebindGo', () => openRebind(true));
    on('admRebindUndo', () => openRebind(false));
    on('admDevQuery', queryDevs);
    on('admDevClear', clearDevs);
    on('cfgSave', saveCfg);
    on('cfgNoticePublish', publishNotice);
    on('cfgNoticeClear', clearNotice);
    on('cfgPreview', previewBlock);
    on('apkPick', pickApk);
    on('apkUpload', () => uploadApk(true));
    on('apkUploadOnly', () => uploadApk(false));
    on('apkTest', testDownload);
    on('apkDel', delHosted);
    on('cfgUrlSelf', useSelfUrl);
    on('admAuditBtn', loadAudit);
    on('admAddBtn', addAdmin);
    on('admDetailClose', () => {
      /* v1.1.23：详情改到 #sheet 后没有独立「收起」按钮了（右上角「关闭」
       * 和点遮罩都走 sheet 自己的 closeSheet），这里保留兼容钩子。
       * 名单的滚动位置本来就一动没动，不需要再滚回去。 */
      const sh = document.getElementById('sheet');
      if (sh && DETAIL_OPEN) { sh.classList.remove('on'); DETAIL_OPEN = false; }
    });
    on('revPhotoRefresh', loadRevPhotos);
    on('revFbRefresh', loadRevFb);

    /* 更新提示策略：两个按钮互斥，点谁谁亮 */
    document.querySelectorAll('#cfgPolicy button').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#cfgPolicy button').forEach(x => x.classList.toggle('on', x === b));
      };
    });

    document.querySelectorAll('#admSeg button').forEach(b => {
      b.onclick = () => seg(b.dataset.adm);
    });

    /* v1.1.63 校准：名单卡二级菜单（正常名单 / 校准·异常） */
    document.querySelectorAll('#admListTab button').forEach(b => {
      b.onclick = () => switchListTab(b.dataset.t);
    });

    document.querySelectorAll('#admFilter button').forEach(b => {
      b.onclick = () => {
        FILTER = b.dataset.f || 'all';
        document.querySelectorAll('#admFilter button').forEach(x => x.classList.toggle('on', x === b));
        renderList();
      };
    });

    const find = $('admFind');
    if (find) {
      find.oninput = () => {
        FIND = find.value.trim();
        renderList();
      };
    }
    /* v1.1.64 方案 C：只看已确认开关 */
    const only = $('admOnlyConfirmed');
    if (only) {
      only.onchange = () => {
        ONLY_CONFIRMED = !!only.checked;
        renderList();
      };
    }

    const row = $('rowAdmin');
    if (row) row.onclick = () => switchTab('admin');
    const back = $('adminBack');
    if (back) back.onclick = () => switchTab('me');

    seg('grant');

    // 已存过口令就直接进面板，不用每次再点一次
    if (key() && $('admPanel')) {
      $('admPanel').style.display = 'block';
      AUTH.Admin.setKey(key());
      loadCfg();
      /* 同上：这是一次性的面板初始化，被 3 秒节流跳掉就是一张空名单。 */
      refreshStats(true);
    }
    refresh();
  }

  /* ================= 审核（校园图片 + 留言，v1.1.6） =================
   *
   * 这一段的取舍：图片审核必须「一眼看到图 + 两个按钮」，不做列表详情页。
   * 审核是重复劳动，多一次点击就多一分拖延，拖着拖着待审队列就堆到 40 张
   * （服务端在那个数字上直接拒收新图）。
   */

  let REV_PHOTOS = [];
  let REV_FB = [];
  /* k -> objectURL。管理员审核页的图不能直接用 <img src="/v1/photo?k=">：
   * 那个接口只放 st==='a' 的图，待审一律 404，审核页会是一排裂图。
   * 改成用 AUTH.Admin.photoRaw(k) 拿字节再 createObjectURL。
   * 必须记下来以便 revoke —— 每张 1600px 的图在 WebView 里是几 MB 的位图，
   * 翻几次审核页不释放就是几百 MB。 */
  let REV_URLS = {};
  /* v1.1.62 慢网优化：横滑一次只该看 1~2 张，绝不能首帧把 N 张待审图全打出去。
   * img.loading="lazy" 对「JS 手动 fetch blob 再赋 src」无效（只管 src 直指 URL 的原生加载），
   * 所以改成：可见卡 ±1 才入队、队列一次只飞一张、翻页补拉、刷新清单用代际丢弃过期结果。*/
  let REV_QUEUE = [];
  let REV_QUEUED = {};
  let REV_FLYING = false;
  let REV_GEN = 0;

  function loadRevPhotos() {
    const box = $('revPhotoList');
    if (!box) return;
    if (!key()) { box.innerHTML = '<p class="hint">先在上面填管理员口令。</p>'; return; }
    box.innerHTML = '<p class="hint">拉取中…</p>';
    /* 重新拉清单之前先释放上一批的 blob URL，否则每刷一次多占一批位图 */
    revokeRevUrls();
    revNavShow(0);
    AUTH.Admin.photos().then(res => {
      if (!res || !res.ok) {
        hintInto(box, (res && res.msg) || '拉取失败');
        return;
      }
      /* 服务端字段是 rows（见 worker.js handleAdminPhotos）。 */
      REV_PHOTOS = Array.isArray(res.rows) ? res.rows : (Array.isArray(res.list) ? res.list : []);
      const cnt = $('revPhotoCnt');
      if (cnt) cnt.textContent = (res.pending || 0) + ' 待审 / 共 ' + REV_PHOTOS.length;
      renderRevPhotos();
    }, e => {
      hintInto(box, '连不上服务器：' + errText(e));
    });
  }

  /* v1.1.62：把某个 k 排进取字节队列（名字沿用，verify_apk 锁）。
   * 已有 blob 直接复用；否则只入队，由 revPump 一次飞一张。 */
  function revPhotoSrc(k, img) {
    if (!k) return;
    if (REV_URLS[k]) { img.src = REV_URLS[k]; img.alt = ''; return; }
    if (REV_QUEUED[k]) return;
    REV_QUEUED[k] = true;
    img.alt = '等待加载…';
    REV_QUEUE.push({ k: k, img: img, gen: REV_GEN });
    revPump();
  }

  /* 串行泵：同一时刻只有一张大图在过 Host.httpFetchAsync 桥，
   * 慢网下不会 N 张一起把主线程/桥挤死（3.00 KB/s 下整批 20s 超时）。 */
  function revPump() {
    if (REV_FLYING) return;
    const job = REV_QUEUE.shift();
    if (!job) return;
    REV_FLYING = true;
    const done = () => { REV_FLYING = false; revPump(); };
    job.img.alt = '加载中…';
    AUTH.Admin.photoRaw(job.k).then(blob => {
      /* 清单刷新过 / 页面重建过 → 结果作废，别写进新 DOM */
      if (job.gen !== REV_GEN || !blob) { delete REV_QUEUED[job.k]; done(); return; }
      const u = URL.createObjectURL(blob);
      REV_URLS[job.k] = u;
      job.img.src = u;
      job.img.alt = '';
      job.img.onclick = null;
      delete REV_QUEUED[job.k];
      done();
    }, e => {
      if (job.gen !== REV_GEN) { delete REV_QUEUED[job.k]; done(); return; }
      delete REV_QUEUED[job.k];
      job.img.alt = '取图失败，点一下重试';
      job.img.title = (typeof errText === 'function' ? errText(e) : String(e));
      /* 给一个能点的重试入口：点图重新排回队列（REV_QUEUED 已删） */
      job.img.onclick = () => revPhotoSrc(job.k, job.img);
      done();
    });
  }

  /* 只把「当前可见那张 ±1」排进队列。img.loading='lazy' 对
   * 「JS 手动 fetch blob 再赋 src」无效，必须用可见性自己控制。 */
  function revLoadVisible() {
    const box = $('revPhotoList');
    if (!box) return;
    const cards = box.querySelectorAll('.rev-item');
    if (!cards.length) return;
    const step = revStep();
    let i = step > 0 ? Math.round(box.scrollLeft / step) : 0;
    if (i < 0) i = 0;
    const lo = Math.max(0, i - 1), hi = Math.min(cards.length - 1, i + 1);
    for (let j = lo; j <= hi; j++) {
      const img = cards[j].querySelector('img.rev-img');
      if (!img) continue;
      if (img.src && img.src.indexOf('blob:') === 0) continue;
      const k = img.getAttribute('data-k');
      if (k) revPhotoSrc(k, img);
    }
  }

  function revokeRevUrls() {
    Object.keys(REV_URLS).forEach(k => {
      try { URL.revokeObjectURL(REV_URLS[k]); } catch (e) {}
    });
    REV_URLS = {};
    /* 换一批清单：清掉没发的队列、去重表，代际 +1 让在飞的旧请求作废 */
    REV_QUEUE = [];
    REV_QUEUED = {};
    REV_GEN++;
  }

  function normRot(v) {
    let r = Number(v) || 0;
    r = ((r % 360) + 360) % 360;
    return (r === 90 || r === 180 || r === 270) ? r : 0;
  }

  function revStep() {
    const box = $('revPhotoList');
    if (!box) return 300;
    return box.clientWidth || box.getBoundingClientRect().width || 300;
  }

  function revScroll(dir) {
    const box = $('revPhotoList');
    if (!box) return;
    /* 用 scrollLeft 赋值，老 WebView 也认；snap 会在滚动停下时把边对齐。 */
    box.scrollLeft = box.scrollLeft + dir * revStep();
    revLoadVisible();
  }

  function revUpdatePos() {
    const box = $('revPhotoList');
    const pos = $('revPhotoPos');
    if (!box || !pos) return;
    const n = REV_PHOTOS.length || 1;
    let i = Math.round(box.scrollLeft / revStep()) + 1;
    if (i < 1) i = 1;
    if (i > n) i = n;
    pos.textContent = '第 ' + i + ' / ' + n + ' 张';
    revLoadVisible();
  }

  function revNavShow(n) {
    const nav = $('revPhotoNav');
    if (!nav) return;
    nav.style.display = n > 1 ? 'flex' : 'none';
    const pos = $('revPhotoPos');
    if (pos && n > 1) pos.textContent = '第 1 / ' + n + ' 张';
  }

  function renderRevPhotos() {
    const box = $('revPhotoList');
    if (!box) return;
    box.innerHTML = '';
    revNavShow(0);
    if (!REV_PHOTOS.length) {
      box.appendChild(el('p', 'hint', '没有待审的图片。'));
      return;
    }
    REV_PHOTOS.forEach(p => {
      const c = el('div', 'rev-item');
      const frame = el('div', 'img-frame rev-frame');
      frame.setAttribute('data-rot', String(normRot(p.rot)));
      const img = document.createElement('img');
      img.className = 'rev-img';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = p.cap || '待审图片';
      /* 关键：不能用 AUTH.Photos.url（只放已通过的图）。
       * 管理员要能看见待审的那张，否则「审核」就是盲签。 */
      /* v1.1.62：不在这里直接拉图，挂 k 交给 revLoadVisible 按需取 */
      img.setAttribute('data-k', String(p.k || ''));
      frame.appendChild(img);
      c.appendChild(frame);

      const meta = el('div', 'rev-meta');
      const st = el('span', 'rev-badge',
        p.st === 'a' ? '已公开' : (p.st === 'p' ? '待审' : '已下架'));
      if (p.st === 'a') st.classList.add('ok');
      meta.appendChild(st);
      if (p.id) meta.appendChild(el('span', 'rev-sub', '学号 ' + String(p.id).slice(-4)));
      /* 尺寸读不出来时显示「尺寸未知」，不要印「0×0」——
       * 管理员没法区分那是「解析失败」还是真解析成 0 */
      const dim = (p.w > 0 && p.h > 0) ? (p.w + '×' + p.h) : '尺寸未知';
      meta.appendChild(el('span', 'rev-sub', dim));
      c.appendChild(meta);

      if (p.cap) c.appendChild(el('div', 'rev-cap', p.cap));

      /* 方向编辑：四个角度都是即时预览，只有「保存方向」落库。
       * 保存成就地改 REV_PHOTOS 里这一项，不整表重载，
       * 横滑停在第几张就还停在第几张。 */
      const rotBar = el('div', 'rev-rot');
      rotBar.appendChild(el('span', 'rev-rot-lab', '图片方向'));
      let cur = normRot(p.rot);
      const preview = v => { cur = normRot(v); frame.setAttribute('data-rot', String(cur)); };
      const mkRot = (txt, fn) => {
        const b = el('button', 'btn ghost btn-sm', txt);
        b.onclick = fn;
        rotBar.appendChild(b);
      };
      mkRot('↺ 左转', () => preview(cur - 90));
      mkRot('↻ 右转', () => preview(cur + 90));
      mkRot('⟳ 180°', () => preview(cur + 180));
      mkRot('还原', () => preview(0));
      const save = el('button', 'btn btn-sm', '保存方向');
      save.onclick = () => photoRot(p.k, cur, save, frame, p);
      rotBar.appendChild(save);
      c.appendChild(rotBar);

      const acts = el('div', 'rev-acts');
      if (p.st !== 'a') {
        const ok = el('button', 'btn btn-sm', '通过');
        ok.onclick = () => photoAct('ok', p.k, ok);
        acts.appendChild(ok);
      }
      if (p.st === 'a') {
        const no = el('button', 'btn ghost btn-sm', '下架');
        /* 下架是软下架（服务端只把 st 改成 'x'，字节还在），但仍然要把
         * 「会不会出现在全校面前」说清楚，并且给个二次确认 —— 原来这里
         * 没有 confirm，而服务端把 no 和 del 当同一条路径，手滑一次就
         * 物理删除不可恢复。 */
        no.onclick = async () => {
          if (!await askConfirm('从校园实景里撤下这张图？\n\n图片和说明都会保留，以后还能重新上架。')) return;
          photoAct('no', p.k, no);
        };
        acts.appendChild(no);
      }
      /* 已下架（st === 'x'）的给一个回场入口 */
      if (p.st === 'x') {
        const re = el('button', 'btn ghost btn-sm', '重新上架');
        re.onclick = () => photoAct('ok', p.k, re);
        acts.appendChild(re);
      }
      const capBtn = el('button', 'btn ghost btn-sm', '改说明');
      capBtn.onclick = () => {
        const v = prompt('图片说明（留空则显示为无说明）', p.cap || '');
        if (v === null) return;
        photoAct('cap', p.k, capBtn, v);
      };
      acts.appendChild(capBtn);
      const del = el('button', 'btn ghost btn-sm', '删除');
      del.onclick = async () => {
        if (!await askConfirm('彻底删掉这张图？文件也会一起删，找不回来。\n\n只是想从公开列表撤下来的话，用「下架」。',
          { danger: true })) return;
        photoAct('del', p.k, del);
      };
      acts.appendChild(del);
      c.appendChild(acts);
      box.appendChild(c);
    });
    box.scrollLeft = 0;
    revNavShow(REV_PHOTOS.length);
    revLoadVisible();
    const nav = $('revPhotoNav');
    if (nav && !nav._bound) {
      nav._bound = true;
      const pv = $('revPrev'), nx = $('revNext');
      if (pv) pv.onclick = () => revScroll(-1);
      if (nx) nx.onclick = () => revScroll(1);
    }
    if (!box._revBound) {
      box._revBound = true;
      box.addEventListener('scroll', revUpdatePos);
    }
  }

  function photoRot(k, rot, btn, frame, p) {
    busy(btn, true, '保存中…');
    AUTH.Admin.photoAct('rot', k, '', rot).then(res => {
      busy(btn, false);
      if (!res || !res.ok) { XXMU.toast((res && res.msg) || '没保存上'); return; }
      p.rot = rot;
      if (frame) frame.setAttribute('data-rot', String(rot));
      XXMU.toast('方向已保存');
    }, e => {
      busy(btn, false);
      XXMU.toast('连不上服务器：' + ((e && e.message) || e));
    });
  }

  function photoAct(act, k, btn, cap) {
    busy(btn, true, '处理中…');
    AUTH.Admin.photoAct(act, k, cap).then(res => {
      busy(btn, false);
      if (!res || !res.ok) { XXMU.toast((res && res.msg) || '操作失败'); return; }
      XXMU.toast('已' + ({ ok: '通过', no: '下架', del: '删除', cap: '改说明' }[act] || '完成'));
      loadRevPhotos();
    }, e => {
      busy(btn, false);
      XXMU.toast('连不上服务器：' + ((e && e.message) || e));
    });
  }

  function loadRevFb() {
    const box = $('revFbList');
    if (!box) return;
    if (!key()) { box.innerHTML = '<p class="hint">先在上面填管理员口令。</p>'; return; }
    box.innerHTML = '<p class="hint">拉取中…</p>';
    AUTH.Admin.feedback().then(res => {
      if (!res || !res.ok) {
        hintInto(box, (res && res.msg) || '拉取失败');
        return;
      }
      /* 服务端字段是 rows（见 worker.js handleAdminFeedback）。 */
      REV_FB = Array.isArray(res.rows) ? res.rows : (Array.isArray(res.list) ? res.list : []);
      const cnt = $('revFbCnt');
      if (cnt) cnt.textContent = (res.unread || 0) + ' 未读 / 共 ' + REV_FB.length;
      renderRevFb();
    }, e => {
      hintInto(box, '连不上服务器：' + errText(e));
    });
  }

  function renderRevFb() {
    const box = $('revFbList');
    if (!box) return;
    box.innerHTML = '';
    if (!REV_FB.length) {
      box.appendChild(el('p', 'hint', '还没有留言。'));
      return;
    }
    REV_FB.forEach(f => {
      const c = el('div', 'rev-item');
      const top = el('div', 'rev-meta');
      if (!f.read) top.appendChild(el('span', 'rev-badge', '未读'));
      top.appendChild(el('span', 'rev-badge', f.kind || '其它'));
      if (f.id) top.appendChild(el('span', 'rev-sub', '学号 ' + String(f.id).slice(-4)));
      /* 不再乘 1000：fmtDay 自己判单位（秒/毫秒都吃）。
       * 这里以前写 fmtDay(f.at * 1000)，一旦哪天上游改成毫秒就会变成
       * 「毫秒的毫秒」算到几万年后。 */
      if (f.at) top.appendChild(el('span', 'rev-sub', fmtDay(f.at)));
      c.appendChild(top);

      if (f.gone) {
        c.appendChild(el('div', 'rev-cap', '（这条留言的正文已经过期读不到了）'));
      } else {
        c.appendChild(el('div', 'rev-text', f.text || ''));
      }
      if (f.contact) c.appendChild(el('div', 'rev-sub', '联系方式：' + f.contact));

      if (f.reply) {
        const r = el('div', 'rev-reply');
        r.appendChild(el('div', 'rev-reply-t', '已回复（公开）'));
        r.appendChild(el('div', 'rev-text', f.reply));
        c.appendChild(r);
      }

      const acts = el('div', 'rev-acts');
      if (!f.gone) {
        const rep = el('button', 'btn btn-sm', f.reply ? '改回复' : '回复');
        rep.onclick = () => {
          const v = prompt('回复内容（会公开显示在留言板）', f.reply || '');
          if (v === null) return;
          const txt = String(v).trim();
          if (!txt) { XXMU.toast('回复不能空'); return; }
          busy(rep, true, '发送中…');
          AUTH.Admin.feedbackReply(f.k, txt).then(res => {
            busy(rep, false);
            if (!res || !res.ok) { XXMU.toast((res && res.msg) || '回复失败'); return; }
            XXMU.toast('已回复');
            loadRevFb();
          }, e => { busy(rep, false); XXMU.toast('连不上服务器'); });
        };
        acts.appendChild(rep);
      }
      if (!f.read) {
        const rd = el('button', 'btn ghost btn-sm', '标记已读');
        rd.onclick = () => {
          busy(rd, true, '标记中…');
          /* 成功回调必须看 res.ok：服务端拒绝（口令过期、编号不对）也是
           * 2xx/4xx 带 JSON 体回来的，不看就会提示「标记好了」然后列表
           * 刷新一看还是未读。失败回调也要带上原因，别压成「操作失败」。 */
          AUTH.Admin.feedbackRead(f.k).then(res => {
            busy(rd, false);
            if (res && res.ok) { XXMU.toast('已标记'); loadRevFb(); }
            else XXMU.toast((res && res.msg) || '标记失败');
          }, e => { busy(rd, false); XXMU.toast('连不上服务器：' + errText(e)); });
        };
        acts.appendChild(rd);
      }
      const del = el('button', 'btn ghost btn-sm', '删除');
      del.onclick = async () => {
        if (!await askConfirm('删掉这条留言？', { danger: true })) return;
        AUTH.Admin.feedbackDel(f.k).then(res => {
          if (res && res.ok) { XXMU.toast('已删除'); loadRevFb(); }
          else XXMU.toast((res && res.msg) || '删除失败');
        }, e => XXMU.toast('连不上服务器：' + errText(e)));
      };
      acts.appendChild(del);
      c.appendChild(acts);
      box.appendChild(c);
    });
  }

  /* previewBlock 也导出：测试里要单独驱动它，不必去碰「保存」那条更危险的路径 */
  return {
    init, refresh, visible, refreshList, seg, previewBlock, publishNotice,
    loadRevPhotos, loadRevFb,
  };
})();

/* ===== 校园事务页 =====
 * 这一页的状态比别处多（登录了没 / 绑了几台机器 / 正在放水），
 * 所以渲染逻辑集中在这里，数据全走 WATER。
 *
 * v1.1.16 大改：结算整块删掉，改成「放水 / 停止 + 定量放水」。
 * 起因是用户两句话：
 *   「现在的接水是手机绑定设备，相当于连接上了设备，但是还要点饮水机上的
 *     接水按钮才能出水，我要的是在手机上点就能放水。」
 *   「最后的结账功能不需要，因为胖乖app里需要绑定支付宝免密支付。」
 * 前一句决定了文案与按钮语义（见 WATER.unlock 的注释：官方就是「解锁 +
 * 人去按」，没有远程开阀），后一句决定了把结算链整条移除。
 */
const CampusUI = (() => {
  let busy = '';        // 正在放水的 skuId，防止连点
  /* 哪个出水口已经被解锁、正在等人体按物理键出水：
   * { ['goodsId:skuId']: { at, name } }。
   * 只存内存 —— 重启 App 后回到「放水」，那时也可以直接再点（重复解锁无害）。 */
  let RUNNING = {};

  function refresh() {
    const li = document.getElementById('waterLogged');
    const nl = document.getElementById('waterNotLogin');
    const dc = document.getElementById('waterDevCard');
    const on = WATER.logged();

    if (li) li.style.display = on ? 'block' : 'none';
    if (nl) nl.style.display = on ? 'none' : 'block';
    if (dc) dc.style.display = on ? 'block' : 'none';

    if (on) {
      const who = XXMU.pref(WATER.K_PHONE) || '';
      const w = document.getElementById('waterWho');
      if (w) w.textContent = who ? who.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '已登录';
    }
    renderDevs();
  }

  /** 把「最长放水（防忘关）」那排按钮的高亮刷成当前值 */
  function paintTarget() {
    const cur = WATER.guardSec();
    document.querySelectorAll('#waterTarget button').forEach(b => {
      b.classList.toggle('on', Number(b.getAttribute('data-sec')) === cur);
    });
  }

  /** 清掉所有「已解锁」记忆（退出账号、切换最长放水（防忘关）时用）。 */
  function resetRunning() { RUNNING = {}; }

  function rebindDev(dev) {
    if (!dev.sn) {
      showTip('这台设备是旧版添加的，没有保存 SN。\n点「扫码 / 输入机器码添加」重新添加一次即可覆盖。');
      return;
    }
    XXMU.toast('正在按固定 SN 重新读取机器…');
    /* 只读机器信息与出水口，不发 unlock，也不会产生出水/计费。 */
    WATER.bind(dev.sn).then(d => {
      XXMU.toast('已重新绑定：' + (d.name || d.id));
      renderDevs();
    }).catch(e => showTip('重新绑定失败\n\nSN：' + dev.sn + '\n' + WATER.human(e)));
  }

  function renderDevs() {
    const box = document.getElementById('waterDevList');
    if (!box) return;
    box.innerHTML = '';
    const list = WATER.loadDevs();
    const cnt = document.getElementById('waterCnt');
    if (cnt) cnt.textContent = list.length + ' 台';

    if (!list.length) {
      box.appendChild(el('p', 'hint', '还没有添加饮水机。扫一次机器上的二维码，或直接输入固定 SN 机器码。'));
      return;
    }

    list.forEach(dev => {
      const row = el('div', 'dev');
      const info = el('div', 'dev-info');
      info.appendChild(el('div', 'dev-n', dev.name || ('机器 ' + dev.id)));
      const sub = [];
      if (dev.sn) sub.push('SN ' + dev.sn);
      if (dev.org) sub.push(dev.org);
      if (dev.brand) sub.push(dev.brand);
      const fn = dev.functions || [];
      sub.push(fn.length ? (fn.length + ' 个出水口') : '还没有出水口');
      info.appendChild(el('div', 'dev-s', sub.join(' · ')));
      if (dev.tel) info.appendChild(el('div', 'dev-s', '客服 ' + dev.tel));
      row.appendChild(info);

      const act = el('div', 'dev-act');

      if (!fn.length) {
        // 没出水口：多半是绑定的时候还没登录（goods/normal/skus 要 token）
        const b = el('button', 'btn-sm', '刷新出水口');
        b.onclick = () => {
          XXMU.toast('正在拉取出水口…');
          WATER.refreshDev(dev.id).then(() => {
            XXMU.toast('好了');
            renderDevs();
          }).catch(e => showTip('还是拿不到出水口\n\n' + WATER.human(e) +
            '\n\n出水口列表要先登录胖乖生活账号才能取到。'));
        };
        act.appendChild(b);
      } else if (fn.length > 1) {
        /* 多出水口（冷/热/常温）：一个口一个「放水·冷」。
         * 已经解锁过的那个口，自己的键变成「停止」，别的口照旧。 */
        fn.forEach(f => {
          const running = RUNNING[dev.id + ':' + f.id];
          const b = el('button', 'btn-sm' + (running ? ' gray' : ''),
            running ? ('停止·' + f.name) : ('放水·' + f.name));
          b.onclick = () => {
            if (RUNNING[dev.id + ':' + f.id]) stopWater(dev, f);
            else startWater(dev, f);
          };
          act.appendChild(b);
        });
      } else {
        /* 单出水口：一个键两态。解锁后变「停止」，因为「停」是真能远程做的，
         * 而「开始出水」只能由人在机器上按 —— 这个不对称必须在按钮上体现，
         * 否则用户会以为再点一下就能出水。 */
        const running = RUNNING[dev.id + ':' + fn[0].id];
        const b = el('button', 'btn-sm' + (running ? ' gray' : ''), running ? '停止' : '放水');
        b.onclick = () => {
          if (RUNNING[dev.id + ':' + fn[0].id]) stopWater(dev, fn[0]);
          else startWater(dev, fn[0]);
        };
        act.appendChild(b);
      }

      const re = el('button', 'btn-sm gray', '重新绑定');
      re.onclick = () => rebindDev(dev);
      act.appendChild(re);

      const del = el('button', 'btn-sm gray', '移除');
      del.onclick = async () => {
        if (!await askConfirm('从列表里移除「' + (dev.name || dev.id) + '」？\n（只是本机不再显示，不影响你的账号）')) return;
        WATER.unbind(dev.id);
        renderDevs();
      };
      act.appendChild(del);

      row.appendChild(act);
      box.appendChild(row);
    });
  }

  /**
   * 停止出水。
   *
   * 这是「停」—— 真能远程做的那一半。用户点了「停止」，或者定量放水到量，
   * 都走这里。官方入参只有 goodsId（不是 skuId、不是 SN），见 water.js 文件头。
   *
   * 为什么不在这里判「停没停」：endWater 只是把命令下发到串口/2G 通道，
   * 机器真正停阀要几秒。所以发完继续用 WATER.waitDone 轮询到 status 3/5，
   * 中途绝不能先显示「已停止」—— 那会让人走开，而水还在流。
   *
   * 为什么没有「结算 / 去付款」：v1.1.16 按用户要求整块删掉了。
   * 原话「最后的结账功能不需要，因为胖乖app里需要绑定支付宝免密支付」——
   * 建单那一步要账号先签约免密代扣，那是我们做不了也不该替学生做的事。
   * 费用仍在胖乖生活的账单里，学生自己去官方 App 付。**别把这段接回来。**
   */
  function stopWater(dev, fn) {
    if (busy) { XXMU.toast('上一次操作还没跑完，等一下'); return; }
    if (!dev || !fn) return;
    busy = fn.id;

    const tips = document.getElementById('sh-name');
    document.getElementById('sh-body').innerHTML = '';
    if (tips) tips.textContent = '停止放水 · ' + (dev.name || dev.id);
    document.getElementById('sheet').classList.add('on');

    const line = el('p', 'hint', '已发出停止命令，等机器停阀…');
    document.getElementById('sh-body').appendChild(line);

    const rows = el('div', 'settle-box');
    document.getElementById('sh-body').appendChild(rows);
    const put = (k, v) => {
      const r = el('div', 'settle-row');
      r.appendChild(el('span', 'k', k));
      r.appendChild(el('span', 'v', v));
      rows.appendChild(r);
    };

    WATER.endWater(dev.id).then(() => {
      put('停止命令', '已发送');
      return WATER.waitDone(fn.id, (n, s) => {
        line.textContent = '等机器停阀… 第 ' + n + ' 次' +
          (s.status ? '（状态 ' + s.status + (s.amount > 0 ? '，已用 ' + s.amount : '') + '）' : '');
      });
    }).then(r => {
      delete RUNNING[dev.id + ':' + fn.id];
      renderDevs();

      if (r && r.pending) {
        line.className = 'hint warn';
        line.textContent = '机器还在出水（等了 2 分钟没变化）。可以再点一次「停止」，'
          + '或者按机器面板上的停止键。';
        if (r.sync && r.sync.amount > 0) put('本次用量', String(r.sync.amount));
        return;
      }
      if (r && r.failed) {
        line.className = 'hint warn';
        line.textContent = '机器报故障（状态 6），这次放水没能正常结束。请按机器上的停止键。';
        return;
      }
      const s = (r && r.sync) || {};
      put('出水状态', '已停止');
      line.className = 'hint ok';
      line.textContent = '已停止。本次用量 ' + (s.amount || 0) +
        '，费用会记在胖乖生活的账单里，去官方 App 付款就行。';
    }).catch(e => {
      line.className = 'hint warn';
      line.textContent = '停止失败：' + WATER.human(e)
        + '\n\n可以按机器面板上的停止键；机器到量也会自己停。';
    }).then(() => {
      busy = '';
    });
  }

  /**
   * 放水（v1.1.16）。
   *
   * ⚠️ 这里最容易做错的地方：`goods/water/unlock` **不是开阀**。
   * 官方 h5 解锁成功页原文是「请在出水口处点按开始接水」——也就是说，
   * 手机做完这一步之后，人还要在机器出水口按一下物理按键才会出水。
   * 官方全部接口里没有任何远程开阀的能力（接口已穷举，见 water.js 文件头）。
   * 所以：
   *   · 界面文案写「已解锁，去出水口按一下」，绝不写「已开阀 / 正在出水」；
   *   · 按钮从「放水」变成「停止」，因为停是真能远程做的，开始不是。
   *
   * 自动重绑：见 WATER.unlockWithRebind —— code=-1 多半是本机存的 skuId
   * 过期（平台侧重绑过机器），自动重拉一次再试，不让人手动点两次。
   */
  function startWater(dev, fn) {
    if (busy) { XXMU.toast('上一个操作还没跑完，等一下'); return; }
    busy = fn.id;

    const tips = document.getElementById('sh-name');
    document.getElementById('sh-body').innerHTML = '';
    if (tips) tips.textContent = '放水 · ' + (dev.name || dev.id);
    document.getElementById('sheet').classList.add('on');

    const line = el('p', 'hint', '正在把解锁命令发给饮水机…');
    document.getElementById('sh-body').appendChild(line);

    const guard = WATER.guardSec();
    let usedFn = fn;

    WATER.unlockWithRebind(dev, fn, (n, state) => {
      line.textContent = '等待机器响应… 第 ' + n + ' 次' + (state ? '（' + state + '）' : '');
    }, () => {
      /* 平台拒绝了第一次，正在自动重绑。这句必须说，否则用户看到
       * 界面卡在这里会以为死了 —— 重绑要重新拉机器详情 + sku 列表，2~3 秒。 */
      line.textContent = '机器的出水口编号可能过期了，正在自动重新读取…';
    }).then(res => {
      if (res && res.usedFn) usedFn = res.usedFn;

      RUNNING[dev.id + ':' + usedFn.id] = { at: Date.now(), name: usedFn.name };
      renderDevs();

      line.className = 'hint ok';
      /* 只说已经发生的事实：解锁好了，接下来要人去按。这里不能写
       * 「正在出水」—— 用户不按，一滴水都不会出来。 */
      line.textContent = '已解锁。现在去机器出水口按一下「' + usedFn.name + '」就会出水。'
        + (res && res.rebound ? '\n（出水口编号已自动更新）' : '');

      const box = document.getElementById('sh-body');

      /* v1.1.60 诚实版：云端实锤放水途中平台不给实时用量、也没有
       * 「出 N ml 就停」的入参，按 ml 精确自停不成立；计时换算又因流速
       * 不固定被否。这里只做两件真事：接够了自己点「停止」，以及可选的
       * 「最长放水」防忘关超时（与水量无关）。结算 amount 原样显示。 */
      const guardLabel = guard > 0
        ? (guard >= 60 ? (guard / 60) + ' 分钟' : guard + ' 秒') : '';

      const stopBtn = el('button', 'btn', '停止');
      stopBtn.onclick = () => { closeSheet(); stopWater(dev, usedFn); };
      box.appendChild(stopBtn);

      const laterBtn = el('button', 'btn ghost', '先接着，等会儿再说');
      laterBtn.onclick = closeSheet;
      box.appendChild(laterBtn);

      const runLine = el('p', 'hint', guard > 0
        ? '已设最长放水 ' + guardLabel + '（防忘关，与水量无关）。接够了自己点「停止」。'
        : '接够了自己点「停止」。费用记在胖乖账单里。');
      box.appendChild(runLine);

      box.appendChild(el('p', 'hint',
        '手机这边只能解锁，出水要在机器出水口按一下 —— 这是胖乖的设计。'
        + '①平台放水时不给实时用量，结算值出来后原样显示，单位以胖乖账单为准，App 不换算毫升；'
        + (guard > 0
          ? '②最长时长只是防忘关的安全网，到点发一次停止，不是按水量停；'
          : '②没设最长时长，就只靠你手动点「停止」；')
        + '③机器停阀有几秒延迟，断网时会流到机器自己的上限才停。'));

      /* 防忘关计时要有个起点。平台不一定上报「正在出水」，给手动起表按钮。 */
      let startBtn = null;
      if (guard > 0) {
        startBtn = el('button', 'btn ghost', '我已按下出水键，开始计时');
        box.appendChild(startBtn);
      }

      const watchHooks = {
        machineId: dev.id,
        onTick: (n, s, elapsedMs, guardMs, guardLeftMs) => {
          if (!elapsedMs) {
            runLine.className = 'hint';
            runLine.textContent = '已解锁，等你去机器上按出水键…';
            return;
          }
          if (startBtn && !startBtn.disabled) {
            startBtn.disabled = true;
            startBtn.textContent = '已开始计时（防忘关）';
          }
          const spent = Math.round(elapsedMs / 1000);
          const left = Math.max(0, Math.round(guardLeftMs / 1000));
          runLine.className = 'hint';
          runLine.textContent = guardMs > 0
            ? '已放约 ' + spent + ' 秒 · 最长 ' + guardLabel + '，还剩约 ' + left + ' 秒（防忘关，不是按量停）'
            : '已放约 ' + spent + ' 秒 · 接够了自己点「停止」';
        },
        onZero: () => {
          runLine.className = 'hint warn';
          runLine.textContent = '还没开始出水。请到机器出水口按一下按钮；'
            + '若机器已经在出水但这里不动，点上面「我已按下出水键」手动开始计时。';
        },
        onReached: (s, byWhat) => {
          runLine.className = 'hint ok';
          runLine.textContent = (byWhat || '防忘关超时') + '，正在发停止命令，等机器停阀…';
        },
        onStopError: (e) => {
          runLine.className = 'hint warn';
          runLine.textContent = '自动停止失败：' + WATER.human(e) + '。请到机器面板按停止。';
        },
      };
      const watchP = WATER.watchVolume(usedFn.id, guard, watchHooks);
      if (startBtn) startBtn.onclick = () => {
        if (watchHooks.startTimer) watchHooks.startTimer();
        startBtn.disabled = true;
        startBtn.textContent = '已开始计时（防忘关）';
        XXMU.toast('开始计时，到最长时长会发一次防忘关停止');
      };
      watchP.then(r => {
        delete RUNNING[dev.id + ':' + usedFn.id];
        renderDevs();
        const done = el('p', 'hint ok');
        if (r && r.done && !r.failed) {
          done.textContent = '放水结束。'
            + (r.amount > 0
              ? '平台结算回报 amount=' + r.amount + '（原样，单位以胖乖账单为准，App 不换算毫升）。'
              : '（平台暂未给结算用量）');
          /* 用量对不上时要一个能自查的出口：原始平台回报照旧贴出来，
           * 复制给开发者就能对照胖乖账单，不需要任何本地换算系数。 */
          const raw = el('p', 'hint');
          raw.style.opacity = '.75';
          raw.textContent = '（原始回报：amount=' + (r.amount == null ? 'null' : r.amount)
            + '，status=' + (r.status == null ? '?' : r.status)
            + '，轮询 ' + (r.tries || 0) + ' 次，'
            + (r.stoppedByUs ? '由本机发停止' : '未发停止') + '）';
          const cp = el('button', 'btn ghost', '复制这次的数据');
          cp.onclick = () => {
            const txt = 'amount=' + (r.amount == null ? 'null' : r.amount)
              + ' status=' + (r.status == null ? '?' : r.status)
              + ' tries=' + (r.tries || 0)
              + ' guardSec=' + guard
              + ' elapsedMs=' + (r.elapsedMs || 0)
              + ' stoppedByUs=' + (r.stoppedByUs ? 1 : 0)
              + ' machine=' + (dev.name || dev.id)
              + ' sku=' + usedFn.id;
            copyText(txt, '已复制，发到群里就能定位');
          };
          box.appendChild(done);
          box.appendChild(raw);
          box.appendChild(cp);
          const pay = el('p', 'hint');
          pay.textContent = '费用记在胖乖生活账单里，去官方 App 付款。';
          box.appendChild(pay);
          return;
        } else if (r && r.failed) {
          done.className = 'hint warn';
          done.textContent = '机器报故障（状态 6），这次放水没能正常结束。请按机器上的停止键。';
        } else if ((r && r.pending)
            || (r && r.done === false && !r.netError && !r.stopError)) {
          done.className = 'hint warn';
          done.textContent = '还在出水（到上限时长仍未见停止）。请按机器面板上的停止键。';
        } else if (r && r.netError) {
          done.className = 'hint warn';
          done.textContent = '网络断了，没法再盯着状态。机器会流到自己的上限才停，'
            + '费用照样记在胖乖账单里。';
        } else if (r && r.stopError) {
          done.className = 'hint warn';
          done.textContent = '停止命令没能发出去，请到机器面板按停止键。';
        } else {
          done.textContent = '放水结束。费用记在胖乖生活账单里。';
        }
        box.appendChild(done);
      });

      XXMU.toast('已解锁，去机器上按一下出水');
    }).catch(e => {
      line.textContent = WATER.human(e);
      line.className = 'hint warn';
      const again = el('button', 'btn ghost', '再试一次');
      again.onclick = () => {
        closeSheet();
        setTimeout(() => startWater(dev, fn), 200);
      };
      document.getElementById('sh-body').appendChild(again);
    }).then(() => {
      busy = '';
    });
  }

  /* ---------------- 登录 ---------------- */

  let cdTimer = null;

  /* ---------------- 表单提示（填中监测层） ----------------
   * 原先只有点按钮之后才 toast「手机号填错了」，用户不知道到底要几位、
   * 是不是 1 开头。这里边打边判，提示具体到差几位、错在哪一位。 */
  const SEND_LABEL = '发送验证码';

  function paintHint(id, text, cls) {
    const box = document.getElementById(id);
    if (!box) return;
    box.textContent = text || '';
    box.classList.toggle('bad', cls === 'bad');
    box.classList.toggle('good', cls === 'good');
    box.classList.toggle('show', !!text);
  }

  function checkPhone(raw) {
    const v = String(raw || '').trim();
    if (!v) return { ok: false, empty: true, msg: '填你绑在胖乖生活上的手机号，11 位、1 开头。' };
    if (/[^0-9]/.test(v)) {
      return { ok: false, msg: '这里有个「' + v.match(/[^0-9]/)[0] + '」，手机号只有数字。' };
    }
    if (v.length < 11) {
      return { ok: false, msg: '现在 ' + v.length + ' 位，再填 ' + (11 - v.length) + ' 位就够 11 位。' };
    }
    if (!/^1\d{10}$/.test(v)) {
      return { ok: false, msg: '手机号要以 1 开头，这是平台发给终端号的那串。' };
    }
    return { ok: true, msg: '11 位，格式没问题，可以发验证码了。' };
  }

  function checkCode(raw) {
    const v = String(raw || '').trim();
    if (!v) return { ok: false, empty: true, msg: '点右边发一条短信，收到后把 4 位或 6 位数字填进来。' };
    if (/[^0-9]/.test(v)) {
      return { ok: false, msg: '验证码只有数字，别把空格或字母也复制进来了。' };
    }
    /* 胖乖生活的短信码现在两种都发：4 位，或 6 位。两种都放行，
     * 别再把「必须 6 位」写死，否则 4 位码的用户永远登不上。 */
    if (v.length === 4 || v.length === 6) {
      return { ok: true, msg: v.length + ' 位齐了，点下面的按钮登录。' };
    }
    if (v.length < 4) {
      return { ok: false, msg: '现在 ' + v.length + ' 位，验证码是 4 位或 6 位。' };
    }
    if (v.length === 5) {
      return { ok: false, msg: '5 位不对，胖乖只发 4 位或 6 位，再核对一下短信。' };
    }
    return { ok: false, msg: '现在 ' + v.length + ' 位，验证码只会是 4 位或 6 位。' };
  }

  function countdown(btn, sec) {
    if (cdTimer) clearInterval(cdTimer);
    let n = sec;
    btn.disabled = true;
    btn.textContent = n + 's';
    cdTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(cdTimer); cdTimer = null;
        btn.disabled = false;
        btn.textContent = SEND_LABEL;
        return;
      }
      btn.textContent = n + 's';
    }, 1000);
  }

  function init() {
    /* v1.1.16：老版本在 pref 里存过「结算方式」（xxmu_water_settle = one/two）。
     * 结算整块删掉后它没有意义了，但不清会一直躺在那台手机的存储里，
     * 以后排查的人会以为还有两套行为。这里主动清一次，幂等。 */
    try { if (WATER.clearLegacyMode) WATER.clearLegacyMode(); } catch (e) {}

    const send = document.getElementById('waterSendCode');
    if (send) send.onclick = () => {
      const phone = (document.getElementById('waterPhone').value || '').trim();
      const pr = checkPhone(phone);
      if (!pr.ok) {
        paintHint('waterPhoneHint', pr.msg, 'bad');
        XXMU.toast(pr.msg);
        return;
      }
      send.disabled = true;
      send.textContent = '发送中';
      WATER.sendCode(phone).then(() => {
        XXMU.toast('验证码已发送');
        paintHint('waterCodeHint', '短信到了，4 位或 6 位数字填在左边都行。', 'good');
        countdown(send, 60);
      }).catch(e => {
        send.disabled = false;
        send.textContent = SEND_LABEL;
        showTip('发送验证码失败\n\n' + WATER.human(e));
      });
    };

    const lg = document.getElementById('waterLogin');
    if (lg) lg.onclick = () => {
      const phone = (document.getElementById('waterPhone').value || '').trim();
      const code = (document.getElementById('waterCode').value || '').trim();
      const pr = checkPhone(phone);
      const cr = checkCode(code);
      if (!pr.ok) {
        paintHint('waterPhoneHint', pr.msg, 'bad');
        XXMU.toast(pr.msg);
        return;
      }
      if (!cr.ok) {
        paintHint('waterCodeHint', cr.msg, 'bad');
        XXMU.toast(cr.msg);
        return;
      }
      lg.disabled = true; lg.classList.add('busy'); lg.textContent = '登录中…';
      WATER.login(phone, code).then(() => {
        XXMU.toast('登录成功');
        document.getElementById('waterCode').value = '';
        paintHint('waterCodeHint', '', '');
        refresh();
      }).catch(e => {
        showTip('登录失败\n\n' + WATER.human(e));
      }).then(() => {
        lg.disabled = false; lg.classList.remove('busy'); lg.textContent = '登录并记住这台手机';
      });
    };

    /* ---- 填中监测：边打边判，不用等提交 ---- */
    const ph = document.getElementById('waterPhone');
    if (ph) {
      ph.addEventListener('input', () => {
        const r = checkPhone(ph.value);
        paintHint('waterPhoneHint', ph.value.trim() ? r.msg : '', r.ok ? 'good' : (ph.value.trim() ? 'bad' : ''));
        ph.classList.toggle('bad', !r.ok && !!ph.value.trim());
        ph.classList.toggle('good', r.ok);
      });
      ph.addEventListener('blur', () => {
        if (!ph.value.trim()) { paintHint('waterPhoneHint', '', ''); return; }
        const r = checkPhone(ph.value);
        paintHint('waterPhoneHint', r.msg, r.ok ? 'good' : 'bad');
      });
    }
    const cd = document.getElementById('waterCode');
    if (cd) {
      cd.addEventListener('input', () => {
        const r = checkCode(cd.value);
        paintHint('waterCodeHint', cd.value.trim() ? r.msg : '', r.ok ? 'good' : (cd.value.trim() ? 'bad' : ''));
        cd.classList.toggle('bad', !r.ok && !!cd.value.trim());
        cd.classList.toggle('good', r.ok);
      });
      cd.addEventListener('blur', () => {
        if (!cd.value.trim()) { paintHint('waterCodeHint', '', ''); return; }
        const r = checkCode(cd.value);
        paintHint('waterCodeHint', r.msg, r.ok ? 'good' : 'bad');
      });
    }
    const paste = document.getElementById('waterPaste');
    if (paste) {
      paste.addEventListener('input', () => {
        const v = (paste.value || '').trim();
        if (!v) { paintHint('waterPasteHint', '', ''); return; }
        const digits = v.replace(/\D/g, '');
        if (digits.length >= 12) {
          paintHint('waterPasteHint', '看着像完整二维码链接，机器码是 ' + digits.slice(0, 15) + '。', 'good');
        } else if (digits.length >= 6) {
          paintHint('waterPasteHint', '机器码是 ' + digits + '，' + digits.length + ' 位，对得上就绑。', 'good');
        } else {
          paintHint('waterPasteHint', '现在是 ' + digits.length + ' 位，SN 一般是 15 位数字。', 'bad');
        }
      });
    }

    const lo = document.getElementById('waterLogout');
    if (lo) lo.onclick = async () => {
      if (!await askConfirm('退出胖乖生活账号？\n本机保存的饮水机列表会保留。', { danger: true })) return;
      WATER.logout();
      /* 退出账号必须把「这个出水口已解锁」的内存标记一起清掉。
       * RUNNING 记的是 goodsId:skuId → {at, name}，退出只清了 token，
       * 标记留着 → 重新登录后那台机器仍被画成「停止」按钮，用户点下去
       * 走的是 endWater，而那个会话早就不存在了。 */
      resetRunning();
      refresh();
      XXMU.toast('已退出');
    };

    /* ---- 最长放水（防忘关）：档位是秒，不是毫升。 ----
     * 0 = 不自动停，只靠手动「停止」；其他值是最长放水时长上限。
     * 选它不该清 RUNNING：那只影响「点放水时要不要起防忘关计时」，
     * 不影响机器当前是不是已经解锁。 */
    paintTarget();
    document.querySelectorAll('#waterTarget button').forEach(b => {
      b.onclick = () => {
        const sec = WATER.setGuardSec(b.getAttribute('data-sec'));
        paintTarget();
        XXMU.toast(sec > 0
          ? ('已设置：最长放水 ' + (sec >= 60 ? (sec / 60) + ' 分钟' : sec + ' 秒') + '，防忘关')
          : '已设置：不自动停，接完自己点「停止」');
      };
    });

    /* ---- 添加设备 ---- */
    const add = document.getElementById('waterAdd');
    if (add) add.onclick = () => {
      const box = document.getElementById('waterAddBox');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };

    const scan = document.getElementById('waterScan');
    if (scan) scan.onclick = () => {
      if (typeof Host !== 'undefined' && Host.scanQr) Host.scanQr();
      else XXMU.toast('这个版本不支持相机扫码，请用相册选图');
    };

    const pick = document.getElementById('waterPick');
    const file = document.getElementById('waterFile');
    if (pick && file) {
      pick.onclick = () => {
        if (typeof Host !== 'undefined' && Host.pickImage) Host.pickImage();
        else file.click();
      };
      file.onchange = () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => handleQrImage(String(fr.result || ''));
        fr.readAsDataURL(f);
        file.value = '';
      };
    }

    const poke = document.getElementById('waterPasteOk');
    if (poke) poke.onclick = () => {
      const txt = (document.getElementById('waterPaste').value || '').trim();
      if (!txt) { XXMU.toast('先粘贴二维码内容或机器编号'); return; }
      doBind(WATER.parseMachineId(txt));
    };

    /* ---- 其他入口 ---- */
    const rf = document.getElementById('rowFree');
    if (rf) rf.onclick = () => KFREE.open();
    const rc = document.getElementById('rowChaoxing');
    if (rc) rc.onclick = () => openChaoxing('', '学习通', null);
    const re = document.getElementById('rowEams');
    if (re) re.onclick = () => openFreeInEams();
  }

  /** 相册选图回来 → jsQR 解码 → 抠 machineId → 绑定 */
  window.__onImagePicked = function (dataUrl) {
    if (!dataUrl) { XXMU.toast('没有拿到图片'); return; }
    handleQrImage(dataUrl);
  };

  /**
   * 相机扫码 / 相册（Java 侧 ZXing）识别成功 → 直接拿文本，不用再解码。
   * 空串表示取消或没识别到。
   */
  window.__onQrText = function (text) {
    if (!text) { XXMU.toast('没有识别到二维码'); return; }
    const id = WATER.parseMachineId(text);
    if (!id) {
      showTip('识别到二维码，但里面没有机器编号\n\n内容：\n' + text.slice(0, 300) +
        '\n\n如果这是「胖乖生活」的机器码，请把上面这段内容发给开发者。');
      return;
    }
    doBind(id);
  };

  function handleQrImage(dataUrl) {
    WATER.decodeQr(dataUrl).then(text => {
      window.__onQrText(text);
    }).catch(e => {
      showTip('二维码识别失败\n\n' + (e && e.message ? e.message : e) +
        '\n\n可以试试「用相机扫二维码」直接对准机器扫，' +
        '或者手动粘贴二维码内容、直接填机器编号。');
    });
  }

  function doBind(sn) {
    if (!sn) { XXMU.toast('没找到机器编号'); return; }
    XXMU.toast('正在核对机器…');
    WATER.bind(sn).then(dev => {
      XXMU.toast('已添加：' + (dev.name || dev.id));
      const box = document.getElementById('waterAddBox');
      if (box) box.style.display = 'none';
      const p = document.getElementById('waterPaste');
      if (p) p.value = '';
      renderDevs();
      if (!dev.functions || !dev.functions.length) {
        showTip('机器已经添加，但还没拿到出水口\n\n' +
          '名字：' + (dev.name || dev.id) + '\n' +
          '原因：出水口列表要先登录胖乖生活账号才能取到。\n\n' +
          '在上面登录后，点设备那行的「刷新出水口」就行。');
      }
    }).catch(e => {
      const m = WATER.human(e);
      showTip('添加失败\n\n机器编号：' + sn + '\n原因：' + m +
        '\n\n如果提示「设备未绑定」，说明这台机器商家还没接入平台，' +
        '不是本软件的问题。');
    });
  }

  return { refresh, renderDevs, rebindDev, init, startWater, stopWater, paintTarget, resetRunning };
})();

/* 「打开胖乖生活 h5 抓取 token」的结果回调（目前留作兜底：
 * 短信码登录万一被平台改了风控，就用官方页面登录一次，从 localStorage 里接回 token） */
window.__onWaterCapture = function (jsonText) {
  if (!jsonText || jsonText === 'null') return;
  try {
    const o = JSON.parse(jsonText);
    if (o && o.t) {
      XXMU.pref(WATER.K_TOKEN, String(o.t));
      XXMU.toast('已接管登录状态');
      CampusUI.refresh();
      return;
    }
    // 没拿到 token 但拿到了机器号，也算有收获
    const id = WATER.parseMachineId(o && (o.u || ''));
    if (id) {
      XXMU.toast('抓到了机器编号：' + id);
      const p = document.getElementById('waterPaste');
      if (p) p.value = id;
    }
  } catch (e) {}
};

/* ===== 空教室（本机估算版）=====
 *
 * v1.1.38 起这只是**备选**：主入口走 KFREE（web/free.js），拿教务系统的
 * 空闲节次表，结果是全校真实的。本文件这套只在自己课表里出现过的教室上推算，
 * 别的班的课看不到，所以是估算。
 *
 * 保留它的理由：教务连不上 / 没登录 / 学校后台哪天又抽风的时候，
 * 有个能用的东西总比一句「查询失败」强。界面里叫「用本机课表估算」。
 */
let FREE_DAY = 0;    // 0=今天；1..7
let FREE_SEG = -1;   // -1=按当前时间猜

function freeTargetDay() {
  if (FREE_DAY >= 1 && FREE_DAY <= 7) return FREE_DAY;
  return (new Date().getDay() + 6) % 7 + 1;   // 周日 0 → 7
}

function freeSegs() {
  return [
    { t: '上午 1-6', p1: 1, p2: 6 },
    { t: '下午 7-10', p1: 7, p2: 10 },
    { t: '晚上 11-' + PERIODS, p1: 11, p2: PERIODS },
  ].filter(s => s.p1 <= PERIODS);
}

function freeDefaultSeg() {
  if (FREE_SEG >= 0 && FREE_SEG < freeSegs().length) return FREE_SEG;
  // 按当前钟点猜：一上午二下午三晚上。只看小时，不追求精确到节
  const h = new Date().getHours();
  if (h < 12) return 0;
  if (h < 18) return 1;
  return 2;
}

/** 本机估算版（原来叫 openFreeSheet）。
 *  v1.1.38 把主入口让给了 KFREE.open()，这个名字留着是因为两个旧按钮
 *  （课表页顶部 #btnFree、校园页 #rowFree）都还指着它，改起来容易漏。 */
function openFreeLocal() {
  const week = curWeek;
  const day = freeTargetDay();
  const segs = freeSegs();
  const si = Math.min(freeDefaultSeg(), segs.length - 1);
  const seg = segs[si];

  const body = document.getElementById('sh-body');
  document.getElementById('sh-name').textContent = '空教室 · 第 ' + week + ' 周';
  body.innerHTML = '';

  body.appendChild(el('p', 'hint',
    '这是在你自己课表里出现过的 ' + FREE.allRooms().length +
    ' 间教室上推算的，别的班的课看不到，只是估算。要全校真实的用「空闲教室（教务）」。'));

  /* ---- 星期选择 ---- */
  const dchips = el('div', 'chips');
  DAYS.forEach((nm, i) => {
    const d = i + 1;
    const b = el('button', '', nm);
    if (d === day) b.classList.add('on');
    b.onclick = () => { FREE_DAY = d; openFreeLocal(); };
    dchips.appendChild(b);
  });
  body.appendChild(dchips);

  /* ---- 时段选择 ---- */
  const schips = el('div', 'chips');
  segs.forEach((s, i) => {
    const b = el('button', '', s.t);
    if (i === si) b.classList.add('on');
    b.onclick = () => { FREE_SEG = i; openFreeLocal(); };
    schips.appendChild(b);
  });
  body.appendChild(schips);

  /* ---- 结果 ---- */
  const r = FREE.compute(week, seg.p1, seg.p2, day);
  body.appendChild(el('div', 'hwsec',
    DAYS[day - 1] + ' ' + seg.t + ' · 空 ' + r.free.length + ' / ' + r.scope.rooms + ' 间'));

  if (!r.free.length) {
    body.appendChild(el('p', 'hint', '你课表里的教室这个时段都有课。'));
  } else {
    const grid = el('div', 'wiki-grid');
    r.free.forEach(x => {
      const c = el('div', 'wiki-card');
      c.appendChild(el('div', 'wiki-t', x.room));
      grid.appendChild(c);
    });
    body.appendChild(grid);
  }

  if (r.busy.length) {
    const det = el('button', 'btn ghost', '看被占的 ' + r.busy.length + ' 间');
    det.onclick = () => {
      const lines = r.busy.map(b =>
        b.room + '：' + b.courses.map(c => c.name + (c.teacher ? '（' + c.teacher + '）' : '')).join('、'));
      showTip(lines.join('\n'));
    };
    body.appendChild(det);
  }

  /* ---- 整周概览：哪间教室整周全空（自习最稳） ---- */
  const allWeek = FREE.allRooms().filter(room => {
    for (let d = 1; d <= 7; d++) {
      for (const s of segs) {
        if (FREE.compute(week, s.p1, s.p2, d).busy.some(b => b.room === room)) return false;
      }
    }
    return true;
  });
  if (allWeek.length) {
    body.appendChild(el('div', 'hwsec', '整周都没课 · ' + allWeek.length + ' 间'));
    const g2 = el('div', 'wiki-grid');
    allWeek.forEach(room => {
      const c = el('div', 'wiki-card');
      c.appendChild(el('div', 'wiki-t', room));
      g2.appendChild(c);
    });
    body.appendChild(g2);
  }

  const jump = el('button', 'btn', '去教务系统查全校空闲教室');
  jump.onclick = () => KFREE.open();
  body.appendChild(jump);

  document.getElementById('sheet').classList.add('on');
}

/** 教务系统的空闲教室页（青果真实路径无法离线推定，只能给入口） */
function openFreeInEams() {
  if (typeof Host === 'undefined' || !Host.openInApp) {
    showTip('需要在 App 内打开。\n\n路径：教务系统 → 排课/选课 → 空闲教室查询');
    return;
  }
  // 先进教务首页，用户在菜单里点到「空闲教室」即可，避免猜路径猜错
  Host.openInApp('https://qgjw.xxmu.edu.cn/');
}

/* ===== 更新提示 =====
 *
 * 版本配置放在服务器（/v1/config），不在 APK 里——所以发版之后不用再发一个包
 * 才能改提示文案或下载地址。
 *
 * 两种强度：
 *   软（soft）：可以「以后再说」，一天只提醒一次，别把人烦死。
 *   强（force）：低于最低版本的直接挡住，不给关闭。只在「不升级就真的用不了」
 *                时才用（比如后端接口改了、旧版逻辑必错）。
 *
 * 判断顺序：currentCode > minCode → 强制；currentCode < latestCode → 软提示。
 * 用 versionCode 而不是版本号字符串，因为 versionCode 单调递增，比 0.10.0 这种
 * 字符串比较可靠。
 */
const UpdateUI = (() => {
  const K_SKIP = 'xxmu_upd_skip';    // 「只提示一次」策略下点过「以后再说」的版本代码
  const K_MUTE = 'xxmu_upd_mute';    // 用户自己勾「这个版本先不提示了」的版本代码
  const K_SKIP_AT = 'xxmu_upd_at';   // 上次提醒时间（诊断用）
  const K_NOTICE = 'xxmu_notice_seen'; // 已看过的公告时间戳
  const QQ_DEFAULT = '1097668324';

  let cfg = null;
  let level = 'ok';

  function curCode() { return AUTH.curCode(); }

  function curVer() { return AUTH.curVer(); }

  function qq() {
    const q = (cfg && cfg.qq) || QQ_DEFAULT;
    return String(q || '').trim();
  }

  /** 打开提示层。force=true 时没有「以后再说」 */
  function open(force) {
    if (!cfg) return;
    const la = cfg.latest || {};
    const box = document.getElementById('upd');
    if (!box) return;

    document.getElementById('updTtl').textContent = force ? '必须更新才能继续用' : '发现新版本';
    document.getElementById('updVer').textContent =
      '当前 v' + curVer() + '　→　最新 v' + (la.version || '--');
    document.getElementById('updNotes').textContent = la.notes || '';

    // 没有直链就把群号顶上来——这是唯一保证能拿到安装包的地方
    const grp = document.getElementById('updGroup');
    const q = qq();
    if (grp) {
      if (q) {
        grp.style.display = '';
        grp.textContent = '更新群：' + q + '（点这里复制群号）';
        grp.onclick = () => {
          if (typeof Host !== 'undefined' && Host.toast) Host.toast('已复制群号 ' + q);
          if (typeof Host !== 'undefined' && Host.clip) Host.clip(q);
        };
      } else {
        grp.style.display = 'none';
      }
    }
    const goBtn = document.getElementById('updGo');
    if (goBtn) goBtn.textContent = (la.url ? '去下载' : '复制群号');

    /* 强制升级时，激活门会被顶上来（Gate.show）。两个层叠在一起时
     * gate 的 z-index 是 100、upd 是 120，所以 upd 在上——这一点是好事，
     * 但用户点「忽略」之外没有任何出口，万一下载链接没配好就彻底卡死。
     * 所以强制升级时在激活门上也放一个「更新到最新版」按钮，双保险。 */
    const gUpd = document.getElementById('gateUpd');
    if (gUpd) gUpd.style.display = force ? '' : 'none';

    /* 「这个版本先不提示了」：这是**用户自己**的选择，和后台的默认策略叠加。
     * 后台把默认设成 nag（一直提示），用户勾了这个勾就只在这台设备上静音
     * 这一版；换版本或管理员抬高版本号后会重新提示。
     * 强制升级时整个勾选框不出现——那时候没得选。 */
    const wrap = document.getElementById('updCheckWrap');
    if (wrap) wrap.style.display = force ? 'none' : 'flex';
    const mute = document.getElementById('updMute');
    if (mute) mute.checked = false;

    box.classList.toggle('force', !!force);
    box.classList.add('on');
  }

  function close() {
    const box = document.getElementById('upd');
    if (box) box.classList.remove('on');
  }

  function go() {
    /* 服务端写死的绝对 URL 必须对齐到「这台手机当前真正能连上的入口」（v1.1.47）。
     * 校园网 DNS 没刷到 www 的学生，fetchAny 已经退到 pages.dev，
     * 但 cfg.latest.url 仍是 www —— 不做这一步，下面的 isSelf 判据永远 false，
     * 于是甩给系统浏览器打开一个解析不了的地址，App 内下载/校验/安装器全丢。 */
    const rawUrl = (cfg && cfg.latest && cfg.latest.url) || '';
    const url = (typeof AUTH !== 'undefined' && AUTH.localizeUrl)
      ? AUTH.localizeUrl(rawUrl) : rawUrl;
    if (!url) {
      const q = qq();
      if (q) {
        if (typeof Host !== 'undefined' && Host.clip) Host.clip(q);
        if (typeof Host !== 'undefined' && Host.toast) Host.toast('已复制群号 ' + q + '，去 QQ 加群下载');
        else showTip('请加 QQ 群 ' + q + ' 下载最新版。');
      } else {
        /* 管理员既没填下载链接、也没配群号——这是配置事故。
         * 千万不要 showTip：那是 #sheet（z-index 30），会被激活门（100）
         * 压住，用户点了按钮什么都看不到，以为 App 坏了。
         * 用 Pop.alert：固定在顶部、不受任何遮罩压住，
         * 而且它就是「系统提醒」这一层该做的事。 */
        Pop.alert('管理员还没配置下载地址，也还没填 QQ 群号。\n\n'
          + '请联系开发者 QQ 692962849 索取最新安装包。',
          { title: '下载不了', kind: 'danger' });
      }
      return;
    }

    /* 自己托管的包（/v1/apk）走 App 内下载 + 拉起安装器：
     * 用户不用去文件管理器里再点一遍，也躲开了国产浏览器把 apk 拦成
     * 「风险文件」的问题。别的外链（网盘、QQ 群文件）仍然交给浏览器。
     * v1.1.47：url 已在开头经 AUTH.localizeUrl 归一到「这台手机当前能连上的
     * 入口」，所以这里的前缀判据在回退到 pages.dev 的机器上同样成立。 */
    const self = (typeof AUTH !== 'undefined' && AUTH.BASE) ? (AUTH.BASE + '/v1/apk') : '';
    const isSelf = self && url.indexOf(self) === 0;
    if (isSelf && typeof APKDL !== 'undefined' && APKDL.canUse()) {
      if (!APKDL.ensurePermission()) {
        Pop.alert('系统还没允许本应用安装软件。\n\n'
          + '已经跳到设置页了，把「允许安装未知应用」打开，再回来点一次「去下载」。',
          { title: '还没允许安装', kind: 'warn' });
        return;
      }
      const btn = document.getElementById('updGo');
      if (btn) { btn.textContent = '下载中…'; btn.disabled = true; }
      let shownPct = -1;
      const r = APKDL.start(url, (ok, m) => {
        if (!ok) {
          if (btn) { btn.textContent = '重试下载'; btn.disabled = false; }
          Pop.alert('下载没成功：' + (m || '未知原因') + '\n\n'
            + '可以点「重试下载」再来一次，或者加 QQ 群 ' + qq() + ' 手动下载。',
            { title: '下载失败', kind: 'danger' });
          return;
        }
        /* 下载成功时安装器已经弹出来了。这个更新弹窗留着只会挡在前面，
         * 而且按钮还停在 100% —— 直接关掉，让学生看见系统的安装确认。 */
        if (btn) { btn.textContent = '去下载'; btn.disabled = false; }
        close();
      }, (pct) => {
        /* 进度只更新按钮文字，不弹任何东西。pct<0 表示服务端没给总长
         * （退化成单流），那时只能说「下载中…」。 */
        if (!btn) return;
        if (pct < 0) { if (shownPct !== -2) { shownPct = -2; btn.textContent = '下载中…'; } return; }
        if (pct === shownPct) return;
        shownPct = pct;
        btn.textContent = pct >= 100 ? '下载完成，正在安装…' : ('下载中 ' + pct + '%');
      }, (cfg && cfg.latest && cfg.latest.sha256) || '');
      if (r !== 'started' && btn) {
        btn.textContent = '去下载';
        btn.disabled = false;
        /* busy：上一次下载还在跑。原来这里是静默 return —— 学生连点两下
         * 「去下载」，第二下什么都不发生、按钮还被复位成「去下载」，
         * 看起来像第一次点击被吞了。同文件另一处调用点是有文案的。 */
        if (r === 'busy') { Pop.alert('上一次下载还没结束，等它跑完再试。', { title: '正在下载', kind: 'warn' }); return; }
        if (r === 'noperm') { Pop.alert('系统还没允许本应用安装软件，去「设置 → 安装未知应用」里打开再回来。', { title: '还没允许安装', kind: 'warn' }); return; }
      }
      return;
    }

    if (typeof Host !== 'undefined' && Host.openUrl) Host.openUrl(url);
    else window.open(url, '_blank');
  }

  function later() {
    if (level === 'force') return;
    const la = (cfg && cfg.latest) || {};
    const code = String(la.code || '');
    if (code) {
      const policy = (cfg && cfg.updPolicy === 'once') ? 'once' : 'nag';
      const mute = document.getElementById('updMute');
      /* 两种情况都记「这一版已经问过了」，但记在不同的键上：
       *   K_SKIP —— 后台策略是「只提示一次」，这是管理员定的规矩
       *   K_MUTE —— 用户自己勾了「先不提示」，这是用户表达的意愿
       * 分开记的理由：管理员把策略从 once 改回 nag 时，用户自己静音过的
       * 应该继续静音（那是他明确选的），而只是被 once 策略跳过的应该
       * 重新开始提示（他没表达过任何意愿，只是没机会）。 */
      if (policy === 'once') XXMU.pref(K_SKIP, code);
      if (mute && mute.checked) XXMU.pref(K_MUTE, code);
      XXMU.pref(K_SKIP_AT, String(Date.now()));
    }
    close();
  }

  /**
   * 拉一次配置并决定要不要弹。
   * 任何失败都静默——版本检查失败绝不能挡住用户用 App。
   *
   * 顺序：先公告，再更新提示。两者都是全屏层，同时弹会叠在一起。
   */
  function check(silent) {
    return AUTH.versionInfo().then(c => {
      if (!c || !c.ok) return 'ok';
      cfg = c;
      level = AUTH.needUpgrade(c, curCode(), curVer());

      const la = c.latest || {};
      const tag = document.getElementById('updJumpVer');
      if (tag) {
        tag.textContent = level === 'ok'
          ? ('v' + curVer() + ' · 已是最新')
          : ('v' + (la.version || '') + ' 可更新');
        tag.style.color = level === 'ok' ? '' : 'var(--accent)';
      }

      /* 公告优先：管理员发的通知是「一次性的、有时效的」，
       * 更新提示是「持续存在的状态」，先看有时效的。
       * 公告关掉之后再决定要不要弹更新。 */
      if (showNotice()) return 'notice';

      return checkUpdate(silent);
    }, () => 'ok');
  }

  /** 公告是否要弹：有正文 + noticeAt 比本机记的更新（或从没看过） */
  function noticePending() {
    if (!cfg) return false;
    const body = String(cfg.notice || '').trim();
    if (!body) return false;
    const at = parseInt(cfg.noticeAt || '0', 10) || 0;
    if (!at) return false;                     // 老配置没有时间戳，不当公告
    const seen = parseInt(XXMU.pref(K_NOTICE) || '0', 10) || 0;
    return at > seen;
  }

  function showNotice() {
    if (!noticePending()) return false;
    const box = document.getElementById('ntc');
    if (!box) return false;
    const ttl = String(cfg.noticeTitle || '').trim();
    document.getElementById('ntcTtl').textContent = ttl || '公告';
    document.getElementById('ntcBody').textContent = String(cfg.notice || '');
    const at = parseInt(cfg.noticeAt || '0', 10) || 0;
    document.getElementById('ntcAt').textContent = at
      ? new Date(at * 1000).toLocaleString('zh-CN', { hour12: false })
      : '';
    /* 公告是「系统提醒」，不是「要你做决定」——所以它该是顶部常驻条，
     * 不是糊在脸上让人点「知道了」的模态框。
     * 模态框留给真正非做不可的事（强制升级、用完即弃的声明）。
     * #ntc 的 DOM 仍然照写（无障碍与降级路径都指着它），只是不再弹出来。 */
    Pop.alert(String(cfg.notice || ''), {
      title: ttl || '公告',
      kind: 'info',
      onClose: function () { closeNotice(); }
    });
    return true;
  }

  function closeNotice() {
    if (cfg) {
      const at = parseInt(cfg.noticeAt || '0', 10) || 0;
      if (at) XXMU.pref(K_NOTICE, String(at));
      /* 记完再决定要不要接着弹更新，否则公告关掉就什么都不出现了 */
      setTimeout(() => checkUpdate(true), 120);
    }
    const box = document.getElementById('ntc');
    if (box) box.classList.remove('on');
    /* 顶部常驻条也收掉（用户手动点了 #ntcOk 或直接关了那条） */
    Pop.hideAlert && Pop.hideAlert();
  }

  /** 纯更新提示的判定（公告已单独处理） */
  function checkUpdate(silent) {
    if (!cfg) return 'ok';
    const la = cfg.latest || {};

    if (level === 'force') { open(true); return 'force'; }

    if (level === 'soft') {
      /* 提示策略分两层，用两个不同的 pref 键记，不能混：
       *   后台默认（cfg.updPolicy）
       *     nag  → 没更新就一直提示，每次打开都弹（用户点「以后再说」不算数）
       *     once → 每台设备对每一版只提示一次（点过就不再打扰）
       *   用户自己勾（K_MUTE）
       *     「这个版本先不提示了」→ 这台设备对这一版静音，任何策略都得尊重
       * 分成两个键是因为语义不同：一个是管理员定的规矩，一个是用户自己
       * 明确表达过的意愿。混用会导致 nag 策略下用户点一下就永远收不到提示。 */
      const la2 = cfg.latest || {};
      const code = String(la2.code || '');
      const policy = (cfg.updPolicy === 'once') ? 'once' : 'nag';
      const muted = (XXMU.pref(K_MUTE) || '') === code && code !== '';
      if (muted) return 'muted';
      if (policy === 'once' && (XXMU.pref(K_SKIP) || '') === code && code !== '') {
        return 'soft-skipped';
      }
      open(false);
      return 'soft';
    }

    if (!silent) XXMU.toast('已经是最新版本 v' + curVer());
    return 'ok';
  }

  function init() {
    const g = document.getElementById('updGo');
    if (g) g.onclick = go;
    const l = document.getElementById('updLater');
    if (l) l.onclick = later;
    const row = document.getElementById('rowUpd');
    if (row) row.onclick = () => { check(false); };
    const nb = document.getElementById('ntcOk');
    if (nb) nb.onclick = closeNotice;
    /* 激活门上的备用出口：强制升级时它才出现。
     * 它和 #upd 里的「去下载」走同一个 go()，所以行为完全一致；
     * 存在的意义是万一 #upd 因为某种原因没弹出来（比如版本信息还没拉回来
     * 就已经被 check 判死在门外），用户仍有一条自己走通的路。 */
    const gUpd = document.getElementById('gateUpd');
    if (gUpd) gUpd.onclick = go;
    // 别的页面想让用户升到「最新版」时也能叫起来（目前只有关于页用）
    const tag = document.getElementById('updJumpVer');
    if (tag) tag.textContent = 'v' + curVer();
  }

  return { init, check, open, close, level: () => level, cfg: () => cfg };
})();

/* ===== 初始化顺序很重要 =====
 *   1. 文件末尾先把所有模块 init 一遍（不管有没有激活）
 *   2. 再 Gate.init() 判断是否需要显示激活门
 *   3. 末行 load() 已在上面的 init 段里调过，未激活时「关于」页也有内容
 *
 * ⚠️ 这里**只放「解锁之后才该做的事」**。
 *
 * v1.1.6 及以前，`__onUnlocked` 把 About.refresh / WIKI.init / GUIDE.init /
 * CampusUI.init / AdminUI.init / CxUI.init / Onboard.init / Tut.init /
 * UpdateUI.init 全部又调了一遍，而文件末尾本来就已经调过一次。已激活的
 * 用户冷启动时这些 init 全跑两遍：
 *   · Tut.init / WIKI.init / GUIDE.init 用的是 addEventListener，绑两次
 *     → 教程里滑一次手势翻两页、WIKI 搜索框一次输入渲染两遍；
 *   · Onboard.init 会把 __onLoginSuccess / __onCxLoggedIn 各包一层
 *     → 回调链越包越长，登录一次 paint 好几遍；
 *   · UpdateUI.check(true) 在 1200ms 和 1500ms 各打一次 /v1/config。
 * 现在各模块的 init 都加了幂等守卫，这里也不再重复调 —— 双保险：
 * 万一以后有人新增了一个不幂等的 init，也不会因为这两处调用而翻倍。
 */
window.__onUnlocked = function () {
  /* 已登录教务的，进来自动同步一次课表（不弹结果，失败只 toast 一次） */
  if (hasHost() && Host.cookies && Host.cookies() && currentUser()) {
    setTimeout(() => syncSchedule(false), 800);
  }
};

/* v1.1.55：糖梨借鉴的两个入口。用 typeof 守卫 + 元素存在检查，
 * 防止旧 index.html 配新 app.js 时末尾初始化整段抛错（同 btnFree 的教训）。 */
(function bindTangliEntries() {
  const cmd = document.getElementById('kbCmdBtn');
  if (cmd && typeof LessonCmd !== 'undefined') {
    cmd.onclick = () => LessonCmd.open({
      courses: DATA.courses || [],
      ctx: {
        start: iso(START), times: TIMES, totalWeeks: TOTAL_WEEKS, today: iso(new Date()),
      },
      reload: () => { load(); },
    });
  }
  const gr = document.getElementById('gradeEntry');
  if (gr && typeof GRADES !== 'undefined') gr.onclick = () => GRADES.open();
})();

/* 顶部「空教室」按钮：在课表页时直接开，其他页跳到课表再开。
 *
 * v1.1.8：原来这里是裸的 `document.getElementById('btnFree').onclick = ...`。
 * 这个按钮是 v1.0 之后才加的，一旦有人拿旧 index.html 配新 app.js
 * （或者以后改版把它移走），这一行就是 TypeError —— 而它位于文件末尾的
 * 初始化区，抛在这里意味着后面所有 `Xxx.init()` 全都不执行：
 * 页面能看、点什么都没反应，控制台里只有一行 find null。 */
(function bindFreeBtn() {
  const b = document.getElementById('btnFree');
  if (b) b.onclick = () => KFREE.open();
})();

About.init();
initLearnUI();
load();
refreshLoginUI();
refreshAcctUI();
About.refresh();
if (typeof WIKI !== 'undefined') WIKI.init();
if (typeof GUIDE !== 'undefined') GUIDE.init();
CampusUI.init();
CampusUI.refresh();
AdminUI.init();
CxUI.init();
/* v1.1.66：多平台来源连接卡 + 来源筛选。SOURCES 与各适配器 script 都在
 * app.js 之前加载，这里 init 时注册已完成；若某个 js 没加载也只是空卡，
 * 不会拖垮这一串初始化（SrcUI.init 自带 typeof 守卫）。 */
if (typeof SrcUI !== 'undefined') SrcUI.init();
if (typeof MYTODO !== 'undefined') MYTODO.init();
if (typeof FOCUS !== 'undefined') FOCUS.init();
if (typeof REMINDER !== 'undefined') REMINDER.init();
if (typeof ELEC !== 'undefined') ELEC.init();
/* v1.1.28：待办/番茄钟入口小按钮 + 入口状态字 */
(function bindToolEntries() {
  const t = document.getElementById('todoEntry');
  if (t) t.onclick = () => openToolCard('myTodoCard');
  const f = document.getElementById('focusEntry');
  if (f) f.onclick = () => openToolCard('focusCard');
  /* v1.1.66 / m00638：账号绑定细入口条，点开就是四张连接卡那组半框。 */
  const b = document.getElementById('bindEntry');
  if (b) b.onclick = () => openToolCard('bindCard');
  paintToolEntries();
  // 计时进行中时每秒刷入口小字；没在跑不占定时器
  setInterval(() => {
    if (typeof FOCUS !== 'undefined' && FOCUS.load && document.getElementById('focusEntryState')) {
      paintToolEntries();
    }
  }, 1000);
})();

Onboard.init();
if (typeof Disc !== 'undefined') Disc.init();
if (typeof Tut !== 'undefined') Tut.init();
UpdateUI.init();
Gate.init();
/* v1.1.46：启动后立刻查版本，不再固定白等 1500ms。
 *
 * 用户原话「启动软件检查更新能不能快一点，现在有点慢，感觉打开了好久才弹要更新」。
 * 实测 /v1/config 的 TTFB 是 0.8~1.4s（双跳 + 首次 TLS），而原来还要先睡
 * 1500ms 才发请求 —— 学生感知的「好久」里有一大半是这 1.5 秒纯等待，
 * 跟网络一点关系都没有。
 *
 * 现在用双 rAF：第一帧让浏览器把首屏画出来，第二帧就发请求（约 32ms）。
 * 为什么不用 0ms：同步塞进启动段会和 load()/各模块 init 抢主线程，
 * 首屏反而更慢；双 rAF 是「不抢首屏」和「不白等」的折中。
 * 为什么不用 setTimeout(0)：那只是排到任务队列尾部，仍可能挤在首屏绘制前。
 *
 * 双保险：极老的 WebView 没有 rAF 时退回 60ms 定时器；
 * 请求是异步桥发出的，不阻塞 JS 线程，课表同步等初始化照常并行进行。 */
(function checkUpdateOnFirstPaint() {
  const fire = () => { setTimeout(() => UpdateUI.check(true), 0); };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(fire));
  } else {
    setTimeout(fire, 60);
  }
})();
