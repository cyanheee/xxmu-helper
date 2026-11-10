/* 河医大助手 · 成绩页（借鉴 tangli「新成绩先盖着，点一下翻开」）
 *
 * 红线（DESIGN.md 第 5 节 / 项目功能红线）：
 *   · 只读展示，绝不评价、绝不代查别人、绝不代提交
 *   · 分数「情况不明」是第三种状态，绝不当成 0 分 / 已通过 / 已完成
 *   · 数据只在本机（Host pref），不上传服务端；以教务官方成绩为准
 *
 * 数据来源：core/kingo.py::fetch_grades 抓到后整理成 JSON，由用户粘进导入框。
 * 青果成绩页的真实 JSP 路径需登录后在真机核验，本文件不猜接口、不联网。
 */
const GRADES = (() => {
  'use strict';

  const KEY = 'xxmu_grades';
  const KEY_SEEN = 'xxmu_grades_revealed';

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
  function toast(msg) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU.toast) { XXMU.toast(msg); return; }
      if (typeof Host !== 'undefined' && Host.toast) { Host.toast(msg); return; }
    } catch (e) {}
  }
  const clean = s => String(s == null ? '' : s).replace(/&ensp;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  /* 分数：只认能读成数字的确定值；'--' / '' / '未出' / null 一律是「情况不明」。
   * 这是防错的核心——把 unknown 当 0 会把绩点算成一个看似正确的错数。 */
  function scoreOf(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s || /^(--|-|—|未出|未公布|暂无|情况不明|unknown)$/i.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  /** 4.0 制：60→1.0，90+→4.0，<60→0；封顶 4.0。 */
  function pointOf(score) {
    if (score == null) return null;
    if (score < 60) return 0;
    return Math.min(4, Math.round((score - 50) / 10 * 10) / 10);
  }
  /** 加权绩点。unknown 单独计数，绝不参与平均。 */
  function computeGpa(list) {
    let sum = 0, credits = 0, unknown = 0, passed = 0;
    for (const g of (Array.isArray(list) ? list : [])) {
      const s = scoreOf(g && g.score);
      const cr = Number(g && g.credit);
      const credit = Number.isFinite(cr) && cr > 0 ? cr : 0;
      if (s == null) { unknown++; continue; }
      sum += (pointOf(s) || 0) * credit;
      credits += credit;
      if (s >= 60) passed++;
    }
    return { gpa: credits > 0 ? Math.round(sum / credits * 100) / 100 : null, credits, unknown, passed };
  }

  function idOf(g, i) { return clean((g && g.term) || '') + '|' + clean((g && g.name) || '') + '|' + i; }

  function load() {
    try {
      const raw = getPref(KEY, '');
      if (!raw) return { list: [] };
      const d = JSON.parse(raw);
      if (Array.isArray(d)) return { list: d };
      if (d && Array.isArray(d.list)) return d;
      return { list: [] };
    } catch (e) { return { list: [], error: String(e.message || e) }; }
  }
  function save(list) { setPref(KEY, JSON.stringify({ list: list || [], saved_at: Date.now() })); }
  function revealed() {
    try { const a = JSON.parse(getPref(KEY_SEEN, '[]')); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function reveal(id) {
    const a = revealed();
    if (!a.includes(id)) { a.push(id); setPref(KEY_SEEN, JSON.stringify(a)); }
  }
  function revealAll(list) {
    setPref(KEY_SEEN, JSON.stringify((list || []).map((g, i) => idOf(g, i))));
  }
  function resetCover() { setPref(KEY_SEEN, '[]'); }

  /** 把粘贴的文本解析成成绩数组。任何一条不合法都整批拒绝（同 LessonCmd 纪律）。 */
  function parseImport(text) {
    let d;
    try { d = JSON.parse(String(text || '').trim()); }
    catch (e) { return { list: [], errors: ['JSON 解析失败：' + String(e.message || e)] }; }
    const arr = Array.isArray(d) ? d : (d && Array.isArray(d.list) ? d.list : null);
    if (!arr) return { list: [], errors: ['要一个数组，或 {"list":[...]}'] };
    const errors = [], list = [];
    arr.forEach((g, i) => {
      if (!g || typeof g !== 'object') { errors.push('第 ' + (i + 1) + ' 条不是对象'); return; }
      const name = clean(g.name);
      if (!name) { errors.push('第 ' + (i + 1) + ' 条没有课名'); return; }
      const cr = Number(g.credit);
      if (!Number.isFinite(cr) || cr < 0) { errors.push('第 ' + (i + 1) + ' 条学分不是非负数字'); return; }
      /* score 允许缺省 / '--'（情况不明），但不允许对象、数组混进来 */
      if (g.score != null && ['object', 'function'].includes(typeof g.score)) {
        errors.push('第 ' + (i + 1) + ' 条分数格式不对'); return;
      }
      list.push({ name, credit: cr, score: g.score == null ? null : clean(String(g.score)),
        term: clean(g.term) || '未分学期', teacher: clean(g.teacher) });
    });
    return errors.length ? { list: [], errors } : { list, errors: [] };
  }

  /** 按学期归档（保持原顺序，未知学期归到「未分学期」放最后）。 */
  function byTerm(list) {
    const m = new Map();
    (list || []).forEach((g, i) => {
      const t = clean(g.term) || '未分学期';
      if (!m.has(t)) m.set(t, []);
      m.get(t).push({ g, i });
    });
    return [...m.entries()].sort((a, b) => a[0] === '未分学期' ? 1 : b[0] === '未分学期' ? -1 : b[0].localeCompare(a[0]));
  }

  /* ---------- UI ---------- */
  function mk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function open() {
    const body = document.getElementById('sh-body');
    const name = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    if (name) name.textContent = '成绩';
    body.innerHTML = '';

    body.appendChild(mk('p', 'hint',
      '成绩只存本机、只读展示，不评价、不代查别人，以教务官方为准。分数没读到就是「情况不明」，不算 0 分。'));

    const d = load();
    const list = d.list || [];
    const g = computeGpa(list);
    const stat = mk('div', 'grade-stat');
    stat.appendChild(mk('b', '', g.gpa == null ? '绩点 —' : '绩点 ' + g.gpa.toFixed(2)));
    stat.appendChild(mk('span', '', '已修 ' + g.credits + ' 学分 · ' + g.passed + ' 门通过'
      + (g.unknown ? ' · ' + g.unknown + ' 门分数情况不明' : '')));
    body.appendChild(stat);

    const acts = mk('div', 'grade-acts');
    const btnAll = mk('button', 'btn ghost', '全部翻开');
    const btnCover = mk('button', 'btn ghost', '重新盖上');
    btnAll.onclick = () => { revealAll(list); paint(); };
    btnCover.onclick = () => { resetCover(); paint(); };
    acts.appendChild(btnAll); acts.appendChild(btnCover);
    body.appendChild(acts);

    const box = mk('div', 'grade-box');
    body.appendChild(box);

    const imp = mk('details', 'grade-imp');
    imp.appendChild(mk('summary', '', '导入成绩 JSON'));
    const ta = mk('textarea', 'cmd-ta');
    ta.placeholder = '[{"name":"系统解剖学","credit":5,"score":87,"term":"2026-2027-1"}]';
    const btnImp = mk('button', 'btn ghost', '校验并导入');
    const msg = mk('p', 'hint');
    btnImp.onclick = () => {
      const r = parseImport(ta.value);
      if (r.errors.length) { msg.textContent = '导入失败（整批未写入）：' + r.errors.join('；'); return; }
      save(r.list); resetCover();
      msg.textContent = '已导入 ' + r.list.length + ' 条，新成绩默认盖着。';
      toast('成绩已导入 ' + r.list.length + ' 条');
      open();   // 重绘（含统计）
    };
    imp.appendChild(ta); imp.appendChild(btnImp); imp.appendChild(msg);
    body.appendChild(imp);

    function paint() {
      box.innerHTML = '';
      if (d.error) { box.appendChild(mk('p', 'hint', '上次的成绩数据读不出来：' + d.error)); return; }
      if (!list.length) {
        box.appendChild(mk('p', 'grade-empty', '还没有成绩。把教务成绩整理成 JSON 粘进下面就能看，不用联网。'));
        return;
      }
      const seen = revealed();
      for (const [term, rows] of byTerm(list)) {
        box.appendChild(mk('div', 'hwsec', term));
        for (const { g: item, i } of rows) {
          const id = idOf(item, i);
          const isOpen = seen.includes(id);
          const s = scoreOf(item.score);
          const row = mk('div', 'grade-row' + (isOpen ? '' : ' covered'));
          row.appendChild(mk('b', '', item.name));
          row.appendChild(mk('span', 'grade-credit', item.credit + ' 学分'));
          const scoreEl = mk('span', 'grade-score',
            !isOpen ? '📖 点一下翻开' : (s == null ? '情况不明' : String(s) + ' 分'));
          if (isOpen && s != null && s < 60) scoreEl.classList.add('red');
          if (isOpen && s == null) scoreEl.classList.add('muted');
          row.appendChild(scoreEl);
          if (!isOpen) {
            row.onclick = () => { reveal(id); paint(); };
          } else {
            const pt = pointOf(s);
            row.appendChild(mk('span', 'grade-point', pt == null ? '—' : '绩点 ' + pt.toFixed(1)));
          }
          box.appendChild(row);
        }
      }
    }
    paint();
    sheet.classList.add('on');
  }

  return { KEY, open, load, save, parseImport, computeGpa, scoreOf, pointOf, byTerm, revealed, reveal, revealAll, resetCover };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GRADES;
