/* mytodo.js 离线测试 —— 「我的待办」的存储与展示。
 *
 *   node tools/test_mytodo.js
 *
 * 为什么要单独测：这块功能没有任何服务端，所有 bug 都发生在「本机记录」
 * 这一层，而它的失败方式全是静默的：
 *   · 一条记录写坏了 → 整份清空（学生自己记的东西全没了，不可逆）
 *   · 读失败被当成「空」→ 界面显示「你还没有待办」，他会重新记一遍，
 *     每次都覆盖失败的那一份
 *   · 日期算错 → 「今天」显示成「昨天」，他以为自己记错了
 * 这三种在屏幕上都不报错。只有断言能发现。
 *
 * 覆盖 6 组，共 40 条断言：
 *   [1] 增删改查的常态
 *   [2] 脏数据：坏 JSON / 非数组 / 单条格式不对 —— 只丢单条，不丢整份
 *   [3] 读失败与「没有数据」必须能区分
 *   [4] 到期日人话（今天/明天/后天/已过 N 天/M月D日）
 *   [5] 排序与计数（未完成在前、过期仍算未完成、完成沉底）
 *   [6] 上限与输入清洗
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'web', 'mytodo.js'), 'utf8');

let pass = 0, failn = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { failn++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

/** 造一个沙箱：假 Host / 假 localStorage / 假 DOM。
 *  opts.pref:      初始 pref 值（字符串）
 *  opts.prefThrow: pref 读写是否抛
 *  opts.noHost:    不用 Host，走 localStorage
 */
function make(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const prefs = Object.assign({}, opts.prefs || {});
  let cur = opts.pref;
  if (opts.noHost && cur !== undefined) prefs.xxmu_mytodo = cur;

  const Host = {
    getPref: k => {
      if (opts.prefThrow) throw new Error('pref boom');
      return prefs[k] === undefined ? '' : prefs[k];
    },
    setPref: (k, v) => {
      if (opts.prefThrow) throw new Error('pref boom');
      prefs[k] = v;
    },
  };

  const nodes = {};
  function node(id) {
    if (!nodes[id]) {
      const el = makeEl('div');
      el.id = id;
      nodes[id] = el;
    }
    return nodes[id];
  }

  /** 造一个「够真」的元素。
   *
   *  以前这里图省事写了个死 shim，结果测试报 FAIL 却是我自己的 shim 不准：
   *  ① `classList.add()` 不同步 `className` —— 代码里靠 `d.classList.add('red')`
   *     上色的地方全被认为是没上色；② `innerHTML = ''` 不清空 children ——
   *     render() 每次重画都往同一个数组里追加，越测越多。
   *  这两条都会让「代码是对的、测试说错的」，比不测更糟。
   *  所以 className 和 classList 必须共用同一个 Set，innerHTML 要真的清空。 */
  function makeEl(tag) {
    const set = new Set();
    const e = {
      tag, textContent: '', value: '', type: '',
      maxLength: 0, placeholder: '', autocomplete: '', style: {},
      children: [], isConnected: true,
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.push(c); return c; },
      remove() { this.isConnected = false; },
      querySelectorAll() { return []; },
      setAttribute() {},
      focus() {},
      addEventListener() {},
    };
    Object.defineProperty(e, 'className', {
      get() { return [...set].join(' '); },
      set(v) {
        set.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach(c => set.add(c));
      },
      enumerable: true,
    });
    Object.defineProperty(e, 'innerHTML', {
      get() { return ''; },
      set() { this.children.length = 0; },
      enumerable: true,
    });
    e.classList = {
      add(...cs) { cs.forEach(c => set.add(c)); },
      remove(...cs) { cs.forEach(c => set.delete(c)); },
      contains(c) { return set.has(c); },
      toggle(c) {
        if (set.has(c)) { set.delete(c); return false; }
        set.add(c); return true;
      },
    };
    return e;
  }

  const sandbox = {
    console,
    JSON, Array, Object, String, Number, Math, Date, isNaN, parseInt, RegExp, Error,
    setTimeout: () => 0,
    Host: opts.noHost ? undefined : Host,
    localStorage: {
      getItem: k => {
        if (opts.lsThrow) throw new Error('ls boom');
        return prefs[k] === undefined ? null : prefs[k];
      },
      setItem: (k, v) => {
        if (opts.lsThrow) throw new Error('ls boom');
        prefs[k] = v;
      },
    },
    document: {
      getElementById: id => (opts.noDom ? null : node(id)),
      createElement: makeEl,
    },
    XXMU: { toast: m => { sandbox.__toasts.push(m); } },
    __toasts: [],
  };
  if (opts.noHost) delete sandbox.Host;
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  /* mytodo.js 里是 `const MYTODO = ...`，vm 里 const 不挂到全局对象上，
   * 所以补一行显式导出再取。 */
  vm.runInContext(SRC + '\n;globalThis.MYTODO = MYTODO;', sandbox, { filename: 'mytodo.js' });
  sandbox.__prefs = prefs;
  return sandbox;
}

/** 把一个数组写进存储（模拟「上次留下的记录」） */
function seed(api, arr) {
  api.Host.setPref('xxmu_mytodo', JSON.stringify(arr));
}

console.log('\n[1] 增删改查常态');
{
  const s = make();
  const M = s.MYTODO;
  ok(M.list().length === 0, '初始为空');
  const r1 = M.add('交实验报告', '2026-11-10');
  ok(r1.ok === true, 'add 成功');
  ok(M.list().length === 1, '存下了 1 条');
  ok(M.list()[0].text === '交实验报告', '文本正确');
  ok(M.list()[0].due === '2026-11-10', '日期正确');
  ok(M.list()[0].done === false, '默认未完成');
  ok(!!M.list()[0].id, '有 id');

  const id = M.list()[0].id;
  const t1 = M.toggle(id);
  ok(t1.ok && t1.done === true, 'toggle 标记完成');
  ok(M.list()[0].done === true, '完成状态落盘');
  const t2 = M.toggle(id);
  ok(t2.ok && t2.done === false, '再 toggle 回到未完成');

  M.add('借白大褂', '');
  ok(M.list().length === 2, '第二条也存下了');
  ok(M.list()[1].due === '', '不填日期就是空串（不是今天）');

  const rm = M.remove(id);
  ok(rm.ok === true && M.list().length === 1, 'remove 删掉一条');
  ok(M.remove('nope').ok === false, '删不存在的返回失败而不是抛');

  M.add('第三条', '');
  M.toggle(M.list().filter(x => x.text === '第三条')[0].id);
  const pd = M.purgeDone();
  ok(pd.ok && pd.n === 1, 'purgeDone 清掉 1 条已完成的');
  ok(M.list().length === 1, '剩下 1 条');
  ok(M.purgeDone().n === 0, '没有可清的返回 0');

  /* 关掉再开（重新加载模块）数据还在 —— 这是「本机记录」的全部意义 */
  const pref = s.__prefs.xxmu_mytodo;
  const s2 = make({ prefs: { xxmu_mytodo: pref } });
  ok(s2.MYTODO.list().length === 1, '重新加载后数据还在');
}

console.log('\n[2] 脏数据：只丢单条，不丢整份');
{
  const s = make();
  const M = s.MYTODO;

  s.Host.setPref('xxmu_mytodo', '{不是 json');
  ok(M.list().length === 0, '坏 JSON -> 空数组（不抛）');
  ok(/读不出来/.test(M.readErr()), '坏 JSON 有可读原因', M.readErr());

  s.Host.setPref('xxmu_mytodo', '{"a":1}');
  ok(M.list().length === 0, '非数组 -> 空数组');
  ok(/格式不对/.test(M.readErr()), '非数组有可读原因', M.readErr());

  /* 关键：混着好记录和坏记录时，好记录必须活下来。
   * v1.1.8 的教训是「读失败就自动重建并写回」，一次抖动把真实数据清空。 */
  s.Host.setPref('xxmu_mytodo', JSON.stringify([
    { text: '好的第一条', due: '2026-11-10', done: false, at: 1, id: 'a' },
    null,                                   // 丢
    { text: '', due: '2026-11-11' },        // 丢（空文本）
    { text: '  前后有空白  ', at: 3, id: 'c' },  // 留（修剪后是合法文本）
    { text: '好的第二条', done: true, at: 2, id: 'b' },
    'not-an-object',                        // 丢
    { notext: 1 },                          // 丢
  ]));
  const arr = M.list();
  ok(arr.length === 3, '7 条里活下来 3 条', arr.length);
  ok(arr[0].text === '好的第一条', '好记录内容没被改');
  ok(arr[1].text === '前后有空白', '带空白的记录被修剪后保留', arr[1].text);
  ok(arr[2].text === '好的第二条', '另一条好记录也在');
  ok(/4 条记录格式不对/.test(M.readErr()), '丢掉几条要说出来', M.readErr());

  /* 只有空格/换行的文本要归一化，不能存成一堆空白 */
  M.add('  有   空格\n的  ', '');
  const last = M.list().filter(x => /空格/.test(x.text))[0];
  ok(last && last.text === '有 空格 的', '连续空白被压成一个空格', last && last.text);

  /* 超长文本要截断，否则一行能占满整屏 */
  const long = 'x'.repeat(300);
  M.add(long, '');
  const l2 = M.list().filter(x => x.text.startsWith('xxx'))[0];
  ok(l2 && l2.text.length === M.MAX_TEXT, '超长文本截到 MAX_TEXT', l2 && l2.text.length);

  /* 非法日期要当没填，不能存成 '2026-13-45' 让后面 new Date 出 NaN */
  M.add('日期写坏', '2026-13-45');
  const bad = M.list().filter(x => x.text === '日期写坏')[0];
  ok(bad && bad.due === '', '非法日期归成空串', bad && bad.due);
}

console.log('\n[3] 读失败 ≠ 没有数据');
{
  const s = make({ prefThrow: true });
  const M = s.MYTODO;
  const arr = M.list();
  ok(arr.length === 0, '读炸了返回空数组（不抛到上层）');
  ok(!!M.readErr(), '但 readErr 有话说', M.readErr());
  ok(/读不出来/.test(M.readErr()), '原因是人话', M.readErr());

  const w = M.add('试试写', '');
  ok(w.ok === false, '写不进去要返回失败');
  ok(!!w.msg, '失败带可读原因', w.msg);

  /* 没有 Host 时走 localStorage；localStorage 也炸时同样要能区分 */
  const s2 = make({ noHost: true, lsThrow: true });
  ok(s2.MYTODO.list().length === 0, 'localStorage 炸了也返回空数组');
  ok(!!s2.MYTODO.readErr(), 'localStorage 炸了也有原因', s2.MYTODO.readErr());

  /* 正常情况不该留下错误（否则界面每次都挂一条黄色警告） */
  const s3 = make();
  s3.MYTODO.add('正常一条', '');
  s3.MYTODO.list();
  ok(s3.MYTODO.readErr() === '', '正常读完 readErr 为空');
}

console.log('\n[4] 到期日人话');
{
  const M = make().MYTODO;
  const now = new Date(2026, 10, 5);            // 2026-11-05
  ok(M.fmtDue('2026-11-05', now) === '今天', '同一天 -> 今天', M.fmtDue('2026-11-05', now));
  ok(M.fmtDue('2026-11-06', now) === '明天', '次日 -> 明天');
  ok(M.fmtDue('2026-11-07', now) === '后天', '第三天 -> 后天');
  ok(M.fmtDue('2026-11-04', now) === '昨天（已过）', '前一天 -> 昨天（已过）', M.fmtDue('2026-11-04', now));
  ok(M.fmtDue('2026-11-01', now) === '已过 4 天', '四天前 -> 已过 4 天', M.fmtDue('2026-11-01', now));
  ok(M.fmtDue('2026-11-08', now) === '3 天后', '三天后 -> 3 天后', M.fmtDue('2026-11-08', now));
  ok(M.fmtDue('2026-11-25', now) === '11月25日', '远期 -> M月D日', M.fmtDue('2026-11-25', now));
  ok(M.fmtDue('', now) === '', '空日期 -> 空串（不是今天）');
  ok(M.fmtDue('瞎写', now) === '', '非法日期 -> 空串');
  /* 跨月/跨年边界：用固定 now 避免测试随日期漂 */
  ok(M.fmtDue('2026-12-01', new Date(2026, 10, 30)) === '明天', '跨月边界 -> 明天',
    M.fmtDue('2026-12-01', new Date(2026, 10, 30)));
}

console.log('\n[5] 排序与计数');
{
  const s = make();
  const M = s.MYTODO;
  const now = new Date(2026, 10, 5);
  const arr = [
    { id: 'd1', text: '没定日子', due: '', done: false, at: 10 },
    { id: 'd2', text: '后天要交', due: '2026-11-07', done: false, at: 1 },
    { id: 'd3', text: '昨天就该交', due: '2026-11-04', done: false, at: 99 },
    { id: 'd4', text: '明天要交', due: '2026-11-06', done: false, at: 5 },
    { id: 'd5', text: '做完了', due: '', done: true, at: 50 },
  ];
  const v = M.forView(arr, now);
  ok(v.open.length === 4, '未完成 4 条', v.open.length);
  ok(v.done.length === 1, '已完成 1 条', v.done.length);
  ok(v.open[0].id === 'd3', '过期的排最前（最急）', v.open[0] && v.open[0].id);
  ok(v.open[1].id === 'd4', '其次明天');
  ok(v.open[2].id === 'd2', '再次后天');
  ok(v.open[3].id === 'd1', '没定日子的排最后', v.open[3] && v.open[3].id);
  /* 过期但仍然未完成的，必须算进「要做」——它还是要人补 */
  ok(v.openCount === 4, '过期没勾的仍计入待做', v.openCount);
  ok(v.overdue === 1, '过期条数 = 1', v.overdue);

  /* 只有已完成的记录时，「要做」是 0，界面该显示「全做完了」 */
  const v2 = M.forView([{ id: 'x', text: 'a', due: '', done: true, at: 1 }], now);
  ok(v2.openCount === 0 && v2.done.length === 1, '全完成时 openCount 为 0');

  /* 空数组不能炸 */
  const v3 = M.forView([], now);
  ok(v3.open.length === 0 && v3.overdue === 0, '空数组安全');
}

console.log('\n[6] 上限与 DOM 缺失');
{
  const s = make();
  const M = s.MYTODO;
  const many = [];
  for (let i = 0; i < M.MAX_ITEMS; i++) many.push({ id: 'i' + i, text: 'x' + i, due: '', done: false, at: i });
  s.Host.setPref('xxmu_mytodo', JSON.stringify(many));
  const r = M.add('再来一条', '');
  ok(r.ok === false, '到上限后 add 返回失败');
  ok(/最多记/.test(r.msg), '失败原因说清上限', r.msg);
  ok(M.list().length === M.MAX_ITEMS, '没有超过上限');

  /* 空文本不许存（否则列表里出现一行只有勾选框的空条目） */
  for (const t of ['', '   ', '\n\t']) {
    ok(M.add(t, '').ok === false, '空文本被拒：' + JSON.stringify(t));
  }

  /* 页面上没有对应 DOM（例如以后把它挪到别的页）时，render 不能抛 */
  const s2 = make({ noDom: true });
  let threw = false;
  try { s2.MYTODO.init(); s2.MYTODO.render(); } catch (e) { threw = true; }
  ok(!threw, '没有 DOM 时 render/init 不抛');

  /* init 幂等：重复调两次不能把按钮绑两遍（绑两遍会一按开两个表单） */
  const s3 = make();
  s3.MYTODO.init();
  const before = s3.document.getElementById('myTodoAdd').onclick;
  s3.MYTODO.init();
  const after = s3.document.getElementById('myTodoAdd').onclick;
  ok(before === after, 'init 幂等（按钮不会绑两次）');
}

console.log('\n[7] 渲染出来的 DOM 长什么样');
{
  /* 这一组不看存储，看**画出来的东西**。前面几组证明数据对，
   * 这里证明「对的数据被画成了用户能看懂的样子」——
   * 两者缺一不可（v1.1.13 那次就是数据对、提示被排版挤出屏幕）。 */
  const s = make();
  const M = s.MYTODO;
  const today = M.todayIso();
  M.add('交实验报告', today);          // 今天 -> 该标橙
  M.add('借白大褂', '');               // 无日期 -> 没有日期标签
  M.add('已过期的事', '2020-01-01');   // 过期 -> 该标红
  M.add('做完的事', '');
  M.toggle(M.list().filter(x => x.text === '做完的事')[0].id);

  M.render();

  const list = s.document.getElementById('myTodoList');
  const cnt = s.document.getElementById('myTodoCount');
  ok(!!list, 'myTodoList 容器被找到');
  /* 未完成 3 条 + 已完成折叠头 + 加按钮之类的辅助，行数至少 3 */
  const rows = list.children.filter(c => c.className && /\bmtd\b/.test(c.className));
  ok(rows.length === 3, '未完成 3 条都画出来了（已完成默认折叠）', rows.length);
  ok(/3 条要做/.test(cnt.textContent), '计数写「3 条要做」', cnt.textContent);
  ok(/1 条已过期/.test(cnt.textContent), '计数带「1 条已过期」', cnt.textContent);

  /* 第一行该是过期那条（最急） */
  const firstText = rows[0].children[1].children[0].textContent;
  ok(firstText === '已过期的事', '过期那条排第一', firstText);

  /* 日期标签的着色：过期红、今天橙 */
  const dueOf = row => {
    const meta = row.children[1].children.find(c => c.className === 'mtd-meta');
    return meta ? meta.children[0] : null;
  };
  const d0 = dueOf(rows[0]);
  ok(d0 && d0.className.indexOf('red') >= 0, '过期条目的日期是红的', d0 && d0.className);
  const todayRow = rows.find(r => r.children[1].children[0].textContent === '交实验报告');
  const dt = todayRow && dueOf(todayRow);
  ok(dt && /今天/.test(dt.textContent), '今天那条写「今天」', dt && dt.textContent);
  ok(dt && dt.className.indexOf('orange') >= 0, '今天那条标橙', dt && dt.className);

  /* 没有日期的条目：不该有日期 span（而不是显示一个空格子） */
  const noDueRow = rows.find(r => r.children[1].children[0].textContent === '借白大褂');
  ok(noDueRow && !dueOf(noDueRow), '没定日子的不画日期', noDueRow && !dueOf(noDueRow));

  /* 勾选框：未完成是空、已完成打勾（折叠后重画才看得到） */
  const cb0 = rows[0].children[0];
  ok(cb0.className.indexOf('on') < 0, '未完成条目勾选框未选中', cb0.className);
  ok(cb0.textContent === '', '未完成勾选框没有勾');

  /* 折叠头存在，且写清条数 */
  const head = list.children.find(c => c.className && /hwsec/.test(c.className));
  ok(!!head, '有「已完成」折叠头');
  ok(head && /已完成 · 1/.test(head.textContent), '折叠头写「已完成 · 1」', head && head.textContent);

  /* 展开后能看到已完成那条 + 清除按钮 */
  head.onclick();
  const list2 = s.document.getElementById('myTodoList');
  /* 已完成的行包在一个 wrapper 里（和图省得每行单独写），所以要往下探一层 */
  const allRows = [];
  (function walk(n) {
    for (const c of n.children || []) {
      if (c.className && /(^|\s)mtd(\s|$)/.test(c.className)) allRows.push(c);
      walk(c);
    }
  })(list2);
  ok(allRows.length === 4, '展开后 4 条全画出来', allRows.length);
  const doneRow = allRows.find(r => r.children[1].children[0].textContent === '做完的事');
  ok(doneRow && doneRow.className.indexOf('done') >= 0, '已完成条目带 done 类（删除线）', doneRow && doneRow.className);
  ok(doneRow && doneRow.children[0].textContent === '✓', '已完成条目勾选框打勾');
  const purge = list2.children.find(c => c.className && /btn/.test(c.className));
  ok(!!purge && /清掉已完成的 1 条/.test(purge.textContent), '有「清掉已完成的 1 条」按钮', purge && purge.textContent);

  /* 全部清空后的空态：要有一句「这里记什么」，不能只留一块空白 */
  const s2 = make();
  s2.MYTODO.render();
  const l3 = s2.document.getElementById('myTodoList');
  const emptyTip = l3.children.find(c => c.className && /hint/.test(c.className));
  ok(!!emptyTip, '空态有引导文案');
  ok(emptyTip && /学习通里没有的事/.test(emptyTip.textContent), '空态说清这里记什么', emptyTip && emptyTip.textContent);
}

console.log('\n' + (failn === 0
  ? '[PASS] mytodo 通过 ' + pass + ' 项，失败 0 项'
  : '[FAIL] 通过 ' + pass + ' 项，失败 ' + failn + ' 项'));
process.exit(failn === 0 ? 0 : 1);
