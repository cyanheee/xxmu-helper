/* 河医大助手 - 课表页「现在」一屏（v2.3.0）
 *
 * 用户要的东西：打开课表页，第一眼就知道「现在在干嘛、接下来是什么、
 * 现在哪间教室空」。这三件事原来分散在三个地方 ——
 *   1. 现在上什么：课表网格里那块高亮，但要自己在 7 列 14 行里找今天那列；
 *   2. 下一节：同上一处；
 *   3. 现在哪间空：得点「空闲教室」进半框、选校区、选楼、选时段、再点查询。
 *
 * 这一行把三件事压在最上面，且**只读已有数据**：
 *   - 课程只认 DATA.courses 与 TIMES（校方作息表），读不到钟点就说读不到，
 *     绝不自己编一个 08:00；
 *   - 空教室只认 KFREE 缓存（KFREE.state().rooms），没查过就直说没查过，
 *     绝不拿旧缓存冒充此刻；
 *   - 一节课都不跨时段去猜，只回答「这一节」。
 *
 * 三条不编数据的硬规矩（与 learnplus.js / nova-organs.js 一致）：
 *   1. 钟点只认 TIMES，parseSeg 读不出来就整块跳过，并把 unknown 带出去；
 *   2. 课程用 blocksOf() 的产物（它已经把同门课多节并成一个块、把重叠的
 *      排到别处），这里不重新分组，避免两处口径不一致；
 *   3. 空教室缺行（教务没给这一节）算「不知道」，不算「空」。
 */
const NOWLINE = (() => {
  const $ = id => document.getElementById(id);

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtHM(min) {
    const m = Math.max(0, Math.round(min));
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  /* '08:00~08:45' / '08:00-08:45' / '08:00～08:45' → {s, e}
   * 校方作息表三种分隔符都出现过（见 app.js 的 firstTime/lastTime 注释），
   * 这里一次性都认。读不出来返回 null —— 调用方必须当作「不知道」。 */
  function parseSeg(seg) {
    const m = /(\d{1,2})\s*:\s*(\d{2})\s*[~\-～–—]\s*(\d{1,2})\s*:\s*(\d{2})/.exec(String(seg == null ? '' : seg));
    if (!m) return null;
    const s = (+m[1]) * 60 + (+m[2]);
    const e = (+m[3]) * 60 + (+m[4]);
    if (!(e > s) || s < 0 || e > 24 * 60) return null;
    return { s: s, e: e };
  }

  /* ------------------------------------------------------------------
   * 纯函数 1：现在在干什么
   * blocks: blocksOf(day, week) 的产物 [{name, room, start, span}]
   * times : ['08:00~08:45', ...]
   * nowMin: 当天第几分钟（0~1439）
   *
   * 返回 { has, cur, next, unknown, over }
   *   cur  : 正在上的那一块（span 多节的取最后一节的下课时间）
   *   next : 还没开始、最近的那一块
   *   over : 全部有钟点的课都已下课（且没有读不出的块）
   * ------------------------------------------------------------------ */
  /* @testable:nowInfo */
  function nowInfo(blocks, times, nowMin) {
    const list = (blocks || []).slice().sort((a, b) => (a.start || 0) - (b.start || 0));
    const tm = times || [];
    let cur = null, next = null, unknown = false;

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const startP = b.start || 1;
      const span = Math.max(1, b.span || 1);
      const lastP = startP + span - 1;
      const first = parseSeg(tm[startP - 1]);
      const last = parseSeg(tm[lastP - 1]) || first;
      if (!first || !last) { unknown = true; continue; }
      const e = Math.max(last.e, first.e);

      if (nowMin >= first.s && nowMin < e) {
        if (!cur || first.s < cur.s) {
          cur = {
            name: b.name || '', room: b.room || '', start: startP,
            s: first.s, e: e, leftMin: Math.max(1, e - nowMin)
          };
        }
      } else if (first.s > nowMin) {
        if (!next || first.s < next.s) {
          next = {
            name: b.name || '', room: b.room || '', start: startP,
            s: first.s, at: fmtHM(first.s), inMin: first.s - nowMin
          };
        }
      }
    }

    const over = !!(list.length && !cur && !next && !unknown);
    return { has: list.length > 0, cur: cur, next: next, unknown: unknown, over: over };
  }

  /* ------------------------------------------------------------------
   * 纯函数 2：这一节哪间教室空
   * rooms: KFREE.state().rooms（教务矩阵解析产物，room.g['3'][0] === true 表示占用）
   * 缺行（room.g 里没有这一节）= 教务没给数据 = 不知道，不算空。
   *
   * 字段名是 room 不是 name —— free.js 的 parseMatrix 产出
   * { room, type, seats, g, bang }（见 web/free.js:204）。这里两种都认，
   * 因为测试夹具与将来别的数据源可能叫 name，而线上那份一定叫 room。
   * ------------------------------------------------------------------ */
  /* @testable:roomNow */
  function roomNow(rooms, day, p) {
    const idx = Math.max(0, Math.min(6, (day || 1) - 1));
    const out = { free: [], unknown: 0, total: 0, known: 0 };
    (rooms || []).forEach(r => {
      out.total++;
      const row = r && r.g && r.g[String(p)];
      if (!row) { out.unknown++; return; }
      out.known++;
      if (!row[idx]) {
        out.free.push({
          name: (r && (r.room || r.name)) || '',
          seats: (r && r.seats) || 0
        });
      }
    });
    out.free.sort((a, b) => (b.seats || 0) - (a.seats || 0));
    return out;
  }

  /* ------------------------------------------------------------------
   * 纯函数 3：小字的空教室说明（不给按钮逻辑，只给一句话）
   * ------------------------------------------------------------------ */
  /* @testable:roomsText */
  function roomsText(r, p) {
    if (!r || !r.total) return '空教室　还没查过（点右边按钮查）';
    if (!r.known) return '空教室　这一节的教室数据教务没给';
    if (!r.free.length) return '空教室　第 ' + p + ' 节全被占了';
    const names = r.free.slice(0, 3).map(x => x.name).filter(Boolean).join('、');
    const more = r.free.length > 3 ? ' 等 ' + r.free.length + ' 间' : '';
    return '空教室　' + (names || (r.free.length + ' 间')) + more;
  }

  /* ------------------------------------------------------------------
   * 取数 + 画
   * ------------------------------------------------------------------ */
  function nowMinOf(d) {
    const t = d || new Date();
    return t.getHours() * 60 + t.getMinutes();
  }

  function todayDay() { return (new Date().getDay() + 6) % 7 + 1; }

  function blocksToday() {
    try {
      if (typeof blocksOf !== 'function') return [];
      if (typeof DATA === 'undefined' || !DATA || !Array.isArray(DATA.courses)) return [];
      const w = typeof weekOf === 'function' ? weekOf(new Date()) : 1;
      return blocksOf(todayDay(), w) || [];
    } catch (e) { return []; }
  }

  /** 当前是第几节（按 TIMES 反查）；读不出来返回 0 */
  function currentPeriod(times, nowMin) {
    const tm = times || [];
    let p = 0;
    for (let i = 0; i < Math.min(tm.length, 20); i++) {
      const r = parseSeg(tm[i]);
      if (!r) continue;
      if (nowMin >= r.s && nowMin < r.e) return i + 1;
      if (nowMin >= r.e) p = i + 1;      // 课间：停在刚下课的那一节
    }
    return p;
  }

  function freeRooms() {
    try {
      if (typeof KFREE === 'undefined' || !KFREE || !KFREE.state) return [];
      const st = KFREE.state();
      return (st && Array.isArray(st.rooms)) ? st.rooms : [];
    } catch (e) { return []; }
  }

  function paint() {
    const box = $('nowLine');
    if (!box) return;
    const times = (typeof TIMES !== 'undefined' && TIMES) ? TIMES : [];
    const nowMin = nowMinOf();
    const info = nowInfo(blocksToday(), times, nowMin);

    const main = $('nowMain'), sub = $('nowSub'), rooms = $('nowRooms');
    let head = '', tail = '', tone = '';
    if (info.cur) {
      head = info.cur.name + (info.cur.room ? ' · ' + info.cur.room : '');
      tail = '还剩 ' + info.cur.leftMin + ' 分钟下课';
      tone = 'now';
    } else if (info.next) {
      head = info.next.name + (info.next.room ? ' · ' + info.next.room : '');
      tail = info.next.at + ' 上课 · 还有 ' + info.next.inMin + ' 分钟';
      tone = 'next';
    } else if (!info.has) {
      head = '今天没有课';
      tail = '';
    } else if (info.unknown) {
      head = '今天的课钟点还没同步';
      tail = '作息表读不到时这里只能看课表网格';
      tone = 'warn';
    } else {
      head = '今天的课上完了';
      tail = '';
    }

    if (main) main.textContent = head || '—';
    box.setAttribute('data-tone', tone);
    if (sub) {
      sub.textContent = tail;
      sub.hidden = !tail;
    }

    if (rooms) {
      const p = currentPeriod(times, nowMin);
      if (!p) rooms.textContent = '空教室　不在上课时段，点右边按钮自己选';
      else rooms.textContent = roomsText(roomNow(freeRooms(), todayDay(), p), p);
    }
  }

  /* ------------------------------------------------------------------
   * init：只在「切到课表页 / 回到前台」时重画，外加一分钟一次的轻量刷新。
   *
   * 为什么不用 setInterval：与 waterwatch 同一理由 —— 常驻定时器在 WebView
   * 后台不会停，手机放兜里一整天会持续唤醒主线程。这里用递归 setTimeout，
   * 且只有页面可见 + 当前就在课表页时才排下一次；两者都不满足就干脆不排，
   * 等 visibilitychange / __onResume 再唤醒。
   * ------------------------------------------------------------------ */
  let timer = null;
  let inited = false;

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function tick() {
    timer = null;
    paint();
    schedule();
  }

  function schedule() {
    clearTimer();
    try {
      if (typeof document !== 'undefined' && document.hidden) return;
    } catch (e) { /* 离线测试没有 document.hidden，照常排 */ }
    // 只在课表页排：别的页面上这一行是 display:none，画了也没人看
    try {
      if (typeof CUR_TAB !== 'undefined' && CUR_TAB !== 'kb') return;
    } catch (e) { /* CUR_TAB 不可见时按课表页处理 */ }
    timer = setTimeout(tick, 60 * 1000);
  }

  function init() {
    if (inited) return;
    inited = true;

    const btn = $('nowFree');
    if (btn) {
      btn.onclick = () => {
        try {
          if (typeof KFREE !== 'undefined' && KFREE && KFREE.open) KFREE.open();
        } catch (e) { /* 打不开半框不该拦住课表 */ }
      };
    }

    paint();
    schedule();

    // 切页 / 回前台 / 切回本页都重算一次：这三种都是「用户刚想看」的时刻
    if (typeof window !== 'undefined' && window.addEventListener) {
      try { document.addEventListener('visibilitychange', () => { paint(); schedule(); }); } catch (e) {}
    }
    const prevResume = (typeof window !== 'undefined') ? window.__onResume : null;
    try {
      window.__onResume = function () {
        try { if (typeof prevResume === 'function') prevResume(); } catch (e) {}
        paint();
        schedule();
      };
    } catch (e) {}
  }

  return {
    init: init, paint: paint,
    nowInfo: nowInfo, roomNow: roomNow, roomsText: roomsText,
    parseSeg: parseSeg, currentPeriod: currentPeriod, fmtHM: fmtHM
  };
})();

/* 自启动：与 learnplus/waterwatch 同一写法。
 * 注意不能写 `!module.exports` —— 浏览器里 module 未定义会抛 ReferenceError，
 * 而且这一句在 try 外面（v2.0.0 踩过，init 从未执行）。 */
if (typeof document !== 'undefined' && typeof module === 'undefined') {
  try { NOWLINE.init(); } catch (e) { /* 课表页增强失败不该拦住整个 App */ }
}
