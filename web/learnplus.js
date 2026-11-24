/* ===== 学习页「今天」一行 + 一键复制未完成 + 目标绩点（v2.0.0） =====
 *
 * 为什么三件事挤在一个文件里：它们共用一个事实来源 —— window.__HWITEMS
 * （renderHomework 已经算好 left / expired / notStart 的那一份）和课表块。
 * 谁都不许自己再算一遍截止时间：两份口径迟早走偏，而走偏的代价是学生看到
 * 「还剩 3 小时」点进去发现已经交了。所以这里只做**读取与呈现**。
 *
 * 三条不编数据的硬规矩（跟 nova-organs 的 todayNext 一致）：
 *   1. 课程钟点只认 TIMES（校方作息表）。读不到就只说「第 N 节」，绝不内置 08:00。
 *   2. 截止时间只认 renderHomework 算出来的 left，自己不算。
 *   3. 分不清的一律说「情况不明」，不猜「已完成」也不猜「没作业」。
 */
const LEARNPLUS = (() => {
  const $ = id => document.getElementById(id);

  /* 全局的 isDoneStatus 由 app.js 提供；离线测试里没有它，退回等价实现。
   * 两处判据必须一致：只要状态里出现「已交/已完成/已批阅/已过期」就算做完。 */
  function isDone(st) {
    if (typeof isDoneStatus === 'function') return isDoneStatus(st);
    const s = String(st == null ? '' : st);
    return /已完成|已提交|已交|已批阅|已阅|已过期|已结束|完成/.test(s);
  }

  function hhmm(seg) {
    const m = /^\s*(\d{1,2})\s*:\s*(\d{2})/.exec(String(seg == null ? '' : seg));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ------------------------------------------------------------------
   * 纯函数 1：今天还剩什么
   * blocks: [{name, room, start, span}]（app.js blocksOf 的产物）
   * times : ['08:00~08:40', ...]（校方作息，可能为空）
   * items : window.__HWITEMS
   * nowSec: 秒级时间戳
   * 返回 { has, ended, next:{name,room,start,at} | null, due:{...} | null, dueN }
   * ------------------------------------------------------------------ */
  /* @testable:todaySummary */
  function todaySummary(blocks, times, items, nowSec) {
    const t = new Date((nowSec || 0) * 1000);
    const nowMin = t.getHours() * 60 + t.getMinutes();
    const list = (blocks || []).slice().sort((a, b) => (a.start || 0) - (b.start || 0));
    let next = null, ended = false, unknown = false;

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const seg = (times && times[b.start - 1]) || '';
      const at = hhmm(seg);
      if (at == null) { unknown = true; if (!next) next = { name: b.name, room: b.room || '', start: b.start, at: null }; continue; }
      if (at >= nowMin) { if (!next || (next.at != null && at < next.at)) next = { name: b.name, room: b.room || '', start: b.start, at: at }; }
    }
    // 所有课都有钟点且都已经上完 → 今天结束了；有钟点读不到的就不敢说结束
    if (list.length && !next && !unknown) ended = true;

    let due = null, dueN = 0;
    (items || []).forEach(x => {
      if (!x || x.expired) return;          // 交不了了，不进这份清单
      if (isDone(x.status)) return;
      /* 这里**不看 open**：open=false 有三种来路（已完成 / 未开考 / 截止已过），
       * 前两种是真要处理的，第三种已经被 expired 挡掉了。漏掉「未开考」的后
       * 果是：明天有一场考试，学习页一个字都不提。 */
      dueN++;
      if (x.left == null) return;
      if (!due || x.left < due.left) due = { name: x.name || '', course: x.course || '', kind: x.kind || 'work', left: x.left, status: x.status || '' };
    });

    return { has: list.length > 0, ended: ended, next: next, due: due, dueN: dueN };
  }

  /* ------------------------------------------------------------------
   * 纯函数 2：未完成清单变成可复制的纯文本
   * 顺序 = 最紧的先；已过截止的不进这份清单（复制出去是要去做的，不是去追悔的）
   * ------------------------------------------------------------------ */
  /* @testable:undoneText */
  function undoneText(items, fmt) {
    const f = typeof fmt === 'function' ? fmt : h => (h == null ? '' : '还剩 ' + Math.round(h) + ' 小时');
    const open = (items || []).filter(x => x && !x.expired && !isDone(x.status));
    open.sort((a, b) => (a.left == null ? Infinity : a.left) - (b.left == null ? Infinity : b.left));
    if (!open.length) return '';
    const lines = open.map((x, i) => {
      const tag = x.kind === 'exam' ? '考试' : '作业';
      const who = [x.course, x.name].filter(Boolean).join(' · ');
      const left = x.left == null ? '截止时间未读到' : f(x.left);
      return (i + 1) + '. [' + tag + '] ' + who + ' — ' + left;
    });
    return '还差 ' + open.length + ' 件\n' + lines.join('\n');
  }

  /* ------------------------------------------------------------------
   * 纯函数 3：目标绩点还差多少分
   * 已经出分的那部分照实算，剩下 R 学分要靠平均分 S 才够 T：
   *   (sum + p*R) / (credits + R) >= T  →  p = (T*(credits+R) - sum) / R
   * p 是 4.0 制绩点，反推分数：p>=4 需要 90+（4.0 封顶），p<=0 说明 60 分以下都够
   * ------------------------------------------------------------------ */
  /* @testable:gpaNeed */
  function gpaNeed(stat, target, remainCredits) {
    const T = Number(target), R = Number(remainCredits);
    if (!isFinite(T) || !isFinite(R) || R <= 0) return { ok: false, why: '学分填一下' };
    if (!stat || stat.gpa == null) return { ok: false, why: '还没有已经出分的成绩' };
    const cur = Number(stat.gpa), C = Number(stat.credits) || 0;
    const sum = cur * C;
    const p = (T * (C + R) - sum) / R;           // 需要的平均绩点
    let score;                                   // 需要的平均分
    if (p >= 4) score = 90;
    else if (p <= 0) score = 0;
    else score = 50 + p * 10;
    return {
      ok: true,
      current: Math.round(cur * 100) / 100,
      target: T,
      credits: C,
      remain: R,
      point: Math.round(p * 100) / 100,
      score: Math.round(score),
      feasible: p <= 4
    };
  }

  /* ------------------------------------------------------------------
   * 剪贴板三级降级（跟 app.js 里诊断复制同一套顺序，但那份在 AdminUI
   * 的 IIFE 里拿不到，所以这里自备一份）
   * ------------------------------------------------------------------ */
  function copyText(text, okMsg) {
    const done = () => { if (typeof showTip === 'function') showTip(okMsg || '已复制'); };
    const fallback = s => {
      try {
        const ta = document.createElement('textarea');
        ta.value = s; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, s.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { done(); return; }
      } catch (e) { /* 继续走兜底 */ }
      if (typeof showTip === 'function') showTip('系统没允许自动复制，长按下面这段全选复制：\n\n' + s);
    };
    if (window.Host && typeof Host.clip === 'function') {
      try { if (Host.clip(text)) { done(); return; } } catch (e) { /* 继续 */ }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallback(text));
      return;
    }
    fallback(text);
  }

  /* ------------------------------------------------------------------
   * 渲染「今天」一行
   * ------------------------------------------------------------------ */
  /* 相对时间只有一套口径，正主是 app.js::fmtLeft（学习页、提醒、作业卡都印它）。
   * 以前这里抄了一份，抄的时候漏了「分钟进位到 60」的归一化，
   * 学习页就印出「还剩 11 小时 60 分」，而同一时刻作业卡印「还剩 12 小时」。
   * 现在先借正主；借不到（单测里单独 require 本文件）才用下面这份逐行对齐的副本。 */
  function relText(left) {
    if (left == null) return '截止未读到';
    if (left < 0) return '已过截止';
    if (typeof fmtLeft === 'function') return fmtLeft(left);
    if (left < 1) return '还剩 ' + Math.max(1, Math.round(left * 60)) + ' 分钟';
    if (left < 48) {
      let h = Math.floor(left);
      let m = Math.round((left % 1) * 60);
      if (m >= 60) { m -= 60; h += 1; }
      if (m === 0) return '还剩 ' + h + ' 小时';
      return '还剩 ' + h + ' 小时 ' + m + ' 分';
    }
    return '还剩 ' + Math.floor(left / 24) + ' 天';
  }

  function paintToday() {
    const box = $('todayLine');
    if (!box) return;
    const items = window.__HWITEMS || [];
    let blocks = [];
    try {
      if (typeof blocksOf === 'function' && typeof DATA !== 'undefined' && DATA && DATA.courses) {
        const w = typeof weekOf === 'function' ? weekOf(new Date()) : 1;
        const d = (new Date().getDay() + 6) % 7 + 1;
        blocks = blocksOf(d, w) || [];
      }
    } catch (e) { blocks = []; }
    const times = (typeof TIMES !== 'undefined' && TIMES) ? TIMES : [];
    const s = todaySummary(blocks, times, items, Date.now() / 1000);

    const main = $('todayMain'), meta = $('todayMeta'), sub = $('todaySub');
    let head = '', tone = '';
    if (!s.has) { head = '今日无课'; }
    else if (s.ended) { head = '今日课程已结束'; }
    else if (s.next) {
      const b = s.next;
      const at = b.at != null ? pad2(Math.floor(b.at / 60)) + ':' + pad2(b.at % 60) : '第 ' + b.start + ' 节';
      head = at + '　' + b.name + (b.room ? ' · ' + b.room : '');
      tone = 'next';
    } else { head = '今日无课'; }

    if (main) main.textContent = head;
    box.setAttribute('data-tone', tone);

    const bits = [];
    if (s.due) bits.push('最近截止　' + (s.due.course || s.due.name) + ' · ' + relText(s.due.left));
    if (s.dueN > 1) bits.push('还有 ' + (s.dueN - 1) + ' 件');
    if (sub) sub.textContent = bits.length ? bits.join('　·　') : '';
    if (sub) sub.hidden = !bits.length;

    const btn = $('copyUndone');
    if (btn) {
      btn.textContent = s.dueN > 0 ? '复制未完成 · ' + s.dueN : '复制未完成';
      btn.disabled = s.dueN === 0;
      btn.classList.toggle('dim', s.dueN === 0);
    }
    void meta;
  }

  /* ------------------------------------------------------------------
   * 目标绩点：不另开入口，挂在成绩面板底下（成绩面板是 GRADES 画的，
   * 这里只包一层 open，不动 grades.js 主体）
   * ------------------------------------------------------------------ */
  const TK = 'xxmu_gpa_target', CK = 'xxmu_gpa_remain';
  function getPref(k, def) {
    try {
      if (window.Host && Host.getPref) { const v = Host.getPref(k); if (v != null && v !== '') return v; }
    } catch (e) { /* 继续 */ }
    try { const v = localStorage.getItem(k); if (v != null && v !== '') return v; } catch (e) { /* 继续 */ }
    return def;
  }
  function setPref(k, v) {
    try { if (window.Host && Host.setPref) Host.setPref(k, String(v)); } catch (e) { /* 继续 */ }
    try { localStorage.setItem(k, String(v)); } catch (e) { /* 继续 */ }
  }

  function paintTarget() {
    const box = $('gpaTargetBox');
    if (!box || typeof GRADES === 'undefined') return;
    const loaded = GRADES.load();
    const stat = GRADES.computeGpa((loaded && loaded.list) || []);
    const tgt = getPref(TK, '');
    const rem = getPref(CK, '');
    const head = '已出分 ' + (stat.credits || 0) + ' 学分 · 绩点 ' + (stat.gpa == null ? '—' : stat.gpa.toFixed(2));
    let line;
    if (!tgt || !rem) line = '填目标绩点和这学期还剩多少学分，我给你算需要的平均分。';
    else {
      const r = gpaNeed(stat, tgt, rem);
      if (!r.ok) line = r.why;
      else if (!r.feasible) line = '目标 ' + r.target.toFixed(2) + ' 已经追不上了（剩余 ' + r.remain + ' 学分全拿 90 分也只有 ' + ((r.current * r.credits + 4 * r.remain) / (r.credits + r.remain)).toFixed(2) + '）';
      else if (r.score <= 60) line = '目标 ' + r.target.toFixed(2) + ' 稳了：剩下的课不挂科就够。';
      else line = '目标 ' + r.target.toFixed(2) + '：剩余 ' + r.remain + ' 学分平均要考 ' + r.score + ' 分（绩点 ' + r.point.toFixed(2) + '）';
    }
    box.querySelectorAll('[data-gp]').forEach(() => { });
    const h = $('gpaTargetHead'), l = $('gpaTargetLine'), ti = $('gpaTargetIn'), ri = $('gpaRemainIn');
    if (h) h.textContent = head;
    if (l) { l.textContent = line; l.setAttribute('data-ok', (!tgt || !rem) ? '0' : (function () { const r = gpaNeed(stat, tgt, rem); return r.ok && r.feasible ? '1' : '0'; })()); }
    if (ti && ti.value !== String(tgt)) ti.value = tgt === '' ? '' : tgt;
    if (ri && ri.value !== String(rem)) ri.value = rem === '' ? '' : rem;
  }

  function mountTarget() {
    const body = $('sh-body');
    if (!body || $('gpaTargetBox')) { paintTarget(); return; }
    const box = document.createElement('div');
    box.className = 'gpa-target';
    box.id = 'gpaTargetBox';
    box.innerHTML =
      '<div class="gt-head"><b>目标绩点</b><span class="gt-stat" id="gpaTargetHead"></span></div>' +
      '<div class="gt-form">' +
      '<label>目标<input id="gpaTargetIn" inputmode="decimal" placeholder="3.50" autocomplete="off"></label>' +
      '<label>剩余学分<input id="gpaRemainIn" inputmode="decimal" placeholder="18" autocomplete="off"></label>' +
      '</div>' +
      '<div class="gt-line" id="gpaTargetLine"></div>';
    body.appendChild(box);
    const ti = $('gpaTargetIn'), ri = $('gpaRemainIn');
    if (ti) ti.oninput = () => { setPref(TK, ti.value.trim()); paintTarget(); };
    if (ri) ri.oninput = () => { setPref(CK, ri.value.trim()); paintTarget(); };
    paintTarget();
  }

  function patchGrades() {
    if (typeof GRADES === 'undefined' || GRADES.__lpPatched) return;
    const orig = GRADES.open;
    GRADES.open = function () {
      const r = orig.apply(GRADES, arguments);
      try { mountTarget(); } catch (e) { /* 成绩面板本身不能因为这块挂掉 */ }
      return r;
    };
    GRADES.__lpPatched = true;
  }

  /* ------------------------------------------------------------------
   * init
   * ------------------------------------------------------------------ */
  function bind() {
    const btn = $('copyUndone');
    if (btn) {
      btn.onclick = () => {
        const txt = undoneText(window.__HWITEMS || [], relText);
        if (!txt) { if (typeof showTip === 'function') showTip('现在没有待做的作业'); return; }
        copyText(txt, '已复制 ' + txt.split('\n').length + ' 行，粘到群里就行');
      };
    }
    patchGrades();
    paintToday();
  }

  function init() {
    bind();
    /* 作业重绘之后「今天」这一行要立刻跟着变：renderHomework 是 app.js 顶层
     * 函数声明（挂全局），这里包一层就行，不改 app.js 主体。
     * 换周同理——课表重绘走 renderWeek，也包一层。 */
    if (typeof renderHomework === 'function' && !renderHomework.__lpWrapped) {
      const orig = renderHomework;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        try { paintToday(); } catch (e) { /* 顶部这一行坏了也不能影响作业列表 */ }
        return r;
      };
      wrapped.__lpWrapped = true;
      try { renderHomework = wrapped; } catch (e) { /* 严格模式下退化成轮询 */ }
    }
    if (typeof renderWeek === 'function' && !renderWeek.__lpWrapped) {
      const origW = renderWeek;
      const wrappedW = function () {
        const r = origW.apply(this, arguments);
        try { paintToday(); } catch (e) { /* 同上 */ }
        return r;
      };
      wrappedW.__lpWrapped = true;
      try { renderWeek = wrappedW; } catch (e) { /* 同上 */ }
    }
    // 兜底轮询：只在页面可见时算，切后台不烧电。
    setInterval(() => { if (!document.hidden) paintToday(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) paintToday(); });
  }

  /* relText 也导出：它是给「还剩多久」拼字的唯一入口，60 分不进位的边界
     只有靠测试才钉得住（app.js::fmtLeft 是同一口径的另一份实现）。 */
  return { init, paintToday, paintTarget, todaySummary, undoneText, gpaNeed, relText };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LEARNPLUS;

/* 脚本标签在 app.js 之后、body 末尾，DOM 已经建好，可以直接起。
 * 注意守卫只能看 module 是否存在：浏览器里没有 module，写 !module.exports
 * 会先抛 ReferenceError（它在 try 外面），整个 init 就永远轮不到执行。 */
if (typeof document !== 'undefined' && typeof module === 'undefined') {
  try { LEARNPLUS.init(); } catch (e) { /* 学习页增强失败不该拦住整个 App */ }
}
