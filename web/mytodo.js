/* 河医大助手 - 我的待办（自建，纯本地）
 *
 * ================== 为什么要有它 ==================
 *
 * 学习页原来只有「学习通抓来的作业/考试」。但学生真正会漏掉的是另一类：
 * 老师上课口头说的、群里发的、班委通知的 —— 这些学习通里根本没有，
 * 学生只能记在纸上或者微信收藏里，然后忘掉。
 *
 * 所以这一块和学习通是**两个来源、两种可信度**：
 *   学习通 → 服务端数据，读不到要单独说清楚（见 renderHomework 的三态空态）
 *   我的待办 → 本机数据，永远不会「同步失败」，只会「没存上」
 * 两者绝不混在同一个列表里排序 —— 混在一起之后，用户就分不清
 * 「这条是学习通说的」还是「我自己记的」，出问题也无从判断是谁错了。
 *
 * ================== 三条硬约束 ==================
 *
 * 1. **只在本地**。不上传、不进服务端，和教务密码/内容一样的处理口径
 *    （见功能边界红线：服务端只放授权状态与版本）。
 *
 * 2. **读失败 ≠ 没有待办**。v1.1.9 那次「缓存坏了显示成没登录」的教训：
 *    凡是 `catch → return 空数组` 的读路径，都要把原因带出来，
 *    否则用户面对一片空白只能反复点，每次覆盖失败。
 *    这里用模块级 LAST_ERR + readErr() 导出，和 chaoxing.js 一个做法。
 *
 * 3. **不叫「待办清单」而叫「我的待办」**。用户一眼要能看出这是
 *    「我自己记的」，不是系统给的。
 */

const MYTODO = (() => {
  const K = 'xxmu_mytodo';
  const MAX_ITEMS = 200;       // 上限是防手滑，不是防攻击（本机数据）
  const MAX_TEXT = 60;         // 一条待办超过这个长度就不是待办了，是笔记

  let LAST_ERR = '';

  /* ---------------- 存储 ---------------- */

  function rawGet() {
    try {
      if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(K);
      return localStorage.getItem(K);
    } catch (e) {
      /* 读不到 pref 分两种：没有这条记录（返回空），和读调用本身炸了。
       * 前者是常态，后者必须让上层知道，否则「坏了」和「空」长得一样。 */
      if (e && e.message) LAST_ERR = '本机存储读不出来（' + e.message + '）';
      return '';
    }
  }

  function rawSet(s) {
    try {
      if (typeof Host !== 'undefined' && Host.setPref) { Host.setPref(K, s); return true; }
      localStorage.setItem(K, s);
      return true;
    } catch (e) {
      LAST_ERR = '写不进本机存储（' + (e && e.message ? e.message : e) + '）';
      return false;
    }
  }

  /** 合法的 YYYY-MM-DD -> 原样返回；否则空串。
   *
   *  为什么不能只用正则：`2026-13-45` 完全符合 `\d{4}-\d{2}-\d{2}`，
   *  存进去之后 `new Date('2026-13-45')` 得到 Invalid Date，
   *  排序里 dueKey 变 NaN，这一条会莫名其妙排到最前或最后。
   *  （这个洞是 tools/test_mytodo.js 的 [2] 组跑出来才发现的。）
   *  再回填一次 ISO 字符串，挡住 `2026-02-30` 这种「月份对、日超界」
   *  —— JS 会把它静默进位成 3 月 2 日。 */
  function safeDue(v) {
    const s = String(v || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return '';
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d.getTime())) return '';
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return '';
    return s;
  }

  /** 规范化一条记录。脏数据一律丢掉**单条**，不丢整份 ——
   *  一条记录写坏了就把用户所有待办清空，是这一类结构最糟的失败方式。 */
  function norm(x) {
    if (!x || typeof x !== 'object') return null;
    const text = String(x.text == null ? '' : x.text).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const out = {
      id: String(x.id || '') || ('t' + Math.random().toString(36).slice(2, 9)),
      text: text.slice(0, MAX_TEXT),
      due: safeDue(x.due),
      done: !!x.done,
      at: Number(x.at) || 0,
    };
    if (!out.at) out.at = Date.now();
    return out;
  }

  /** 读全部。返回数组；`_bad > 0` 表示有记录被丢掉（要在界面上说一句）。 */
  function list() {
    LAST_ERR = '';
    const raw = rawGet();
    if (!raw) return [];
    let arr = null;
    try {
      arr = JSON.parse(raw);
    } catch (e) {
      LAST_ERR = '存着的待办读不出来（本机记录损坏）';
      return [];
    }
    if (!Array.isArray(arr)) {
      LAST_ERR = '存着的待办格式不对（不是数组）';
      return [];
    }
    const out = [];
    for (const x of arr) {
      const n = norm(x);
      if (n) out.push(n);
    }
    if (out.length < arr.length) {
      LAST_ERR = '有 ' + (arr.length - out.length) + ' 条记录格式不对，已跳过（其余 ' + out.length + ' 条正常）';
    }
    return out;
  }

  function save(arr) {
    return rawSet(JSON.stringify(arr));
  }

  /* ---------------- 增删改 ---------------- */

  function add(text, due) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return { ok: false, msg: '先写点什么再保存' };
    const arr = list();
    if (arr.length >= MAX_ITEMS) {
      return { ok: false, msg: '最多记 ' + MAX_ITEMS + ' 条，先清理一些' };
    }
    const item = norm({ text: t, due: due || '', done: false, at: Date.now() });
    arr.push(item);
    if (!save(arr)) return { ok: false, msg: LAST_ERR || '保存失败' };
    return { ok: true, id: item.id, msg: '已加一条' };
  }

  function toggle(id) {
    const arr = list();
    const it = arr.find(x => x.id === id);
    if (!it) return { ok: false, msg: '这条已经不在了' };
    it.done = !it.done;
    if (!save(arr)) return { ok: false, msg: LAST_ERR || '保存失败' };
    return { ok: true, done: it.done };
  }

  function remove(id) {
    const arr = list();
    const i = arr.findIndex(x => x.id === id);
    if (i < 0) return { ok: false, msg: '这条已经不在了' };
    arr.splice(i, 1);
    if (!save(arr)) return { ok: false, msg: LAST_ERR || '保存失败' };
    return { ok: true };
  }

  function purgeDone() {
    const arr = list();
    const left = arr.filter(x => !x.done);
    const n = arr.length - left.length;
    if (!n) return { ok: true, n: 0 };
    if (!save(left)) return { ok: false, msg: LAST_ERR || '保存失败' };
    return { ok: true, n: n };
  }

  /* ---------------- 展示用的计算 ---------------- */

  const pad2 = n => String(n).padStart(2, '0');
  function todayIso(d) {
    const t = d || new Date();
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  }

  /** 到期日 -> 人话。空串表示「没定日子」，不是「今天」。 */
  function fmtDue(due, now) {
    if (!due) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
    if (!m) return '';
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d.getTime())) return '';
    const base = now || new Date();
    const t0 = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const days = Math.round((d - t0) / 864e5);
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days === 2) return '后天';
    if (days === -1) return '昨天（已过）';
    if (days < 0) return '已过 ' + (-days) + ' 天';
    if (days <= 7) return days + ' 天后';
    return (+m[2]) + '月' + (+m[3]) + '日';
  }

  /** 排序：没做完的在前（有日子的按日子从近到远，没日子的按记录时间），
   *  做完的沉底。**已过期但没勾的仍然算没做完** —— 它还是要人去补。 */
  function forView(arr, now) {
    const base = now || new Date();
    const open = arr.filter(x => !x.done);
    const done = arr.filter(x => x.done);
    const dueKey = x => (x.due ? new Date(x.due + 'T00:00:00').getTime() : Infinity);
    open.sort((a, b) => {
      const av = dueKey(a), bv = dueKey(b);
      if (av !== bv) return av - bv;
      return (a.at || 0) - (b.at || 0);
    });
    done.sort((a, b) => (b.at || 0) - (a.at || 0));
    return { open, done, openCount: open.length, overdue: open.filter(x => {
      if (!x.due) return false;
      const k = dueKey(x) - new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
      return k < 0;
    }).length };
  }

  function readErr() { return LAST_ERR; }

  /* ---------------- 界面 ---------------- */

  const $ = id => document.getElementById(id);

  /** 打开「加一条」的表单。
   *  为什么要表单不要 prompt：v1.1.8 那条教训 —— WebChromeClient 默认
   *  不实现 prompt()，它静默返回 null，既不弹框也不报错。而且这里要
   *  两个字段（内容 + 日子），收集 ≥2 个字段就该用表单。 */
  function openAdd() {
    const body = $('sh-body');
    const sheet = $('sheet');
    if (!body || !sheet) return;
    // v1.1.28：待办卡可能正住在半框里，先把卡请回停车场，
    // 再写表单，否则卡片和表单会在 .sh-box 里叠着。
    if (typeof parkTools === 'function') parkTools();
    $('sh-name').textContent = '加一条自己的待办';
    body.innerHTML = '';

    const tip = document.createElement('p');
    tip.className = 'hint left tight';
    tip.textContent = '这里记的是学习通里没有的事：老师上课说的、群里通知的、'
      + '要交的材料。只存在这台手机上，不会上传。';
    body.appendChild(tip);

    const l1 = document.createElement('label');
    l1.className = 'fr-label';
    l1.textContent = '要做什么';
    body.appendChild(l1);

    const inp = document.createElement('input');
    inp.className = 'fr-input';
    inp.type = 'text';
    inp.maxLength = MAX_TEXT;
    inp.placeholder = '例：交实验报告 / 借白大褂 / 找辅导员签字';
    inp.autocomplete = 'off';
    body.appendChild(inp);

    const l2 = document.createElement('label');
    l2.className = 'fr-label';
    l2.textContent = '大概什么时候要（可不填）';
    body.appendChild(l2);

    const due = document.createElement('input');
    due.className = 'fr-input';
    due.type = 'date';
    body.appendChild(due);

    const chips = document.createElement('div');
    chips.className = 'chips';
    [['今天', 0], ['明天', 1], ['后天', 2], ['这周日', 'sun']].forEach(([label, off]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = () => {
        const d = new Date();
        if (off === 'sun') d.setDate(d.getDate() + ((7 - ((d.getDay() + 6) % 7)) % 7 || 7));
        else d.setDate(d.getDate() + off);
        due.value = todayIso(d);
        chips.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      };
      chips.appendChild(b);
    });
    body.appendChild(chips);

    const save = document.createElement('button');
    save.className = 'btn';
    save.textContent = '保存';
    save.onclick = () => {
      const r = add(inp.value, due.value);
      if (!r.ok) {
        /* 失败要留在原地并说清楚，不能关掉表单 —— 关了就找不到刚写的内容。 */
        const e = document.createElement('p');
        e.className = 'hint left tight';
        e.style.color = 'var(--danger)';
        e.textContent = r.msg;
        if (body.__err) body.__err.remove();
        body.__err = e;
        body.insertBefore(e, save);
        return;
      }
      closeSheet();
      if (typeof XXMU !== 'undefined') XXMU.toast(r.msg);
      render();
      if (typeof paintToolEntries === 'function') paintToolEntries();
    };
    body.appendChild(save);

    const cancel = document.createElement('button');
    cancel.className = 'btn ghost';
    cancel.textContent = '取消';
    cancel.onclick = () => closeSheet();
    body.appendChild(cancel);

    sheet.classList.add('on');
    setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** 重画整张卡。空态要说清楚「这里本来就没有东西」而不是「加载中」。 */
  function render() {
    const card = $('myTodoCard');
    const box = $('myTodoList');
    const cnt = $('myTodoCount');
    if (!card || !box) return;

    const arr = list();
    const err = LAST_ERR;
    const v = forView(arr);

    if (cnt) {
      cnt.textContent = !arr.length
        ? '还没有'
        : (v.openCount ? v.openCount + ' 条要做' : '全做完了')
          + (v.overdue ? ' · ' + v.overdue + ' 条已过期' : '');
    }

    box.innerHTML = '';

    /* 读坏了要单独说，不能显示成「你没有待办」。 */
    if (err && !arr.length) {
      const tip = el('div', 'empty');
      tip.appendChild(el('b', '', '待办记录读不出来'));
      tip.appendChild(el('p', '', err + '\n\n这不是「你没有待办」，是存着的那份数据坏了。'));
      const rb = el('button', 'btn ghost', '覆盖掉它，重新开始');
      rb.onclick = () => {
        if (!save([])) { if (typeof XXMU !== 'undefined') XXMU.toast(LAST_ERR); return; }
        render();
      };
      tip.appendChild(rb);
      box.appendChild(tip);
      return;
    }

    if (!arr.length) {
      const tip = el('p', 'hint left tight');
      tip.textContent = '学习通里没有的事记在这里：老师上课说的、群里通知的、要交的材料。';
      box.appendChild(tip);
      return;
    }

    if (err) {
      const warn = el('p', 'hint left tight');
      warn.style.color = 'var(--warn)';
      warn.textContent = err;
      box.appendChild(warn);
    }

    const mkRow = x => {
      const row = el('div', 'mtd');
      if (x.done) row.classList.add('done');
      const cb = el('button', 'mtd-cb' + (x.done ? ' on' : ''));
      cb.type = 'button';
      cb.setAttribute('aria-label', x.done ? '标记为未完成' : '标记为已完成');
      cb.textContent = x.done ? '✓' : '';
      cb.onclick = ev => {
        ev.stopPropagation();
        const r = toggle(x.id);
        if (!r.ok) { if (typeof XXMU !== 'undefined') XXMU.toast(r.msg); return; }
        render();
        if (typeof paintToolEntries === 'function') paintToolEntries();
      };
      row.appendChild(cb);

      const main = el('div', 'mtd-main');
      main.appendChild(el('span', 'mtd-text', x.text));
      const meta = el('div', 'mtd-meta');
      const fd = fmtDue(x.due);
      if (fd) {
        const d = el('span', 'mtd-due', fd);
        if (!x.done) {
          const base = new Date();
          const t0 = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
          const dd = new Date(x.due + 'T00:00:00').getTime() - t0;
          if (dd < 0) d.classList.add('red');
          else if (dd <= 2 * 864e5) d.classList.add('orange');
        }
        meta.appendChild(d);
      }
      if (meta.children.length) main.appendChild(meta);
      row.appendChild(main);

      const del = el('button', 'mtd-del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', '删掉这条');
      /* 删除不做二次确认，但要求点两次（先变成「再点一次」）。
       * 用 #sheet 弹一个确认框对这种单条小操作太重，而误删一条
       * 自己写的待办也确实让人恼火 —— 二次点击是这两者之间最轻的护栏。 */
      del.onclick = ev => {
        ev.stopPropagation();
        if (!del.__armed) {
          del.__armed = true;
          del.textContent = '再点';
          del.classList.add('arm');
          setTimeout(() => {
            if (!del.isConnected) return;
            del.__armed = false;
            del.textContent = '✕';
            del.classList.remove('arm');
          }, 2600);
          return;
        }
        const r = remove(x.id);
        if (!r.ok) { if (typeof XXMU !== 'undefined') XXMU.toast(r.msg); return; }
        render();
        if (typeof paintToolEntries === 'function') paintToolEntries();
      };
      row.appendChild(del);
      return row;
    };

    v.open.forEach(x => box.appendChild(mkRow(x)));

    if (v.done.length) {
      const head = el('div', 'hwsec fold' + (FOLD_MY.on ? ' on' : ''),
        '已完成 · ' + v.done.length + (FOLD_MY.on ? '  ▴' : '  ▾'));
      head.onclick = () => {
        FOLD_MY.on = !FOLD_MY.on;
        render();
      };
      box.appendChild(head);
      if (FOLD_MY.on) {
        const wrap = el('div');
        v.done.forEach(x => wrap.appendChild(mkRow(x)));
        box.appendChild(wrap);
        const purge = el('button', 'btn ghost', '清掉已完成的 ' + v.done.length + ' 条');
        purge.onclick = () => {
          const r = purgeDone();
          if (!r.ok) { if (typeof XXMU !== 'undefined') XXMU.toast(r.msg); return; }
          if (typeof XXMU !== 'undefined') XXMU.toast('已清掉 ' + r.n + ' 条');
          render();
        };
        box.appendChild(purge);
      }
    }
  }

  /* 折叠状态不持久化：每次进 App 默认收起，用户主动展开。
   * 持久化的话会出现「昨天点开过，今天一进就是一堆已完成」。 */
  const FOLD_MY = { on: false };

  /* ---------------- init ---------------- */

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    const add = $('myTodoAdd');
    if (add) add.onclick = openAdd;
    render();
  }

  return {
    init, render, openAdd,
    list, add, toggle, remove, purgeDone,
    fmtDue, forView, todayIso, readErr,
    K, MAX_ITEMS, MAX_TEXT,
  };
})();
