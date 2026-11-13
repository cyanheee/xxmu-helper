/* 喜鹊儿「双探全自动 + 粘贴/剪贴板兜底」的离线回归测试（v1.1.71）。
 *
 * 为什么要换整套：v1.1.66 写死 7 个 jsp、v1.1.67 抓菜单挖链接逐个验真，
 * 两轮真机诊断（m01034 / m01318）都失败——青果 V17 业务页防裸 GET、静态
 * HTML 里没有真地址。v1.1.68 改「人带路回传整页」但只翻 iframe，真机第三轮
 * （m01910）证伪：考试安排表在 <frameset>/<frame> 里，顶层 body 近空 → 回传空。
 * v1.1.69 的 FIND_JS 遍历 window.frames（含 <frame>）+ 认不出把原文摊进粘贴框。
 *
 * 门禁钉住的是**行为**，不发任何网络请求：
 *   ① 卡片式文字（真机喜鹊儿截图那种）能认出课程/时间/考场/学分/轮次；
 *   ② 表格式文字（课程名称+考试时间同一行 / tables[] 数据行）能认出课程与时间；
 *   ③ __onXqFind 回跳对象 top + frame 递归全读、重复要去重，不能记两场；
 *   ④ 不带年份「11月14日」按学年推年；时间解析不出留空，绝不臆造 00:00；
 *   ⑤ 状态读不到留空，绝不写「已完成」；没导入 / 认不出 → degraded；
 *   ⑥ 认不出回跳把读回原文落进 lastRaw 并摊进 textarea，clear 连原文一起清；
 *   ⑦ fetchExams 只读快照，回传导入时间（synced_at），不做任何 HTTP 请求。
 *
 * 用 Node vm 注入假的 SOURCES / XXMU / Host / window / document，不碰真机、不联网。
 * 用法：node tools/test_xiqueer.js   退出码 0 = 全过
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const XQ_SRC = fs.readFileSync(path.join(ROOT, 'web', 'xiqueer.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

/* 真机喜鹊儿 APP「考试安排」页的文字（m01322 截图逐行还原）。
 * 特征：标签字间夹空格、课程带 [代码]、日期与时间之间夹括号周次。 */
const CARD = [
  '2026-2027学年第一学期',
  '[yg0231]高等数学B1',
  '学    分： 5.0',
  '考试性质： 中考',
  '考核方式： 考试',
  '轮    次： 期中考试',
  '还剩3天',
  '考试地点： 新乡校区 博学楼-第三教学楼3102',
  '座 位 号： **',
  '2026-11-14(11周 星期六)11:00-12:00',
].join('\n');

/* 青果网页那种表格：课程名称、考试时间、考场同一行（tab 分隔，FIND_JS
 * 把 <tr> 的 innerText 交回来时就是这种形态）。 */
const TABLE = [
  '序号\t课程名称\t考试时间\t考场\t考试状态',
  '1\t医用物理学\t2026-12-20 09:00-11:00\t第 3 教学楼 A201\t',
].join('\n');

/* 造沙箱。SOURCES 只暴露 define 捕获 spec；XXMU.pref 当本地存储；
 * Host 记录 openFinderFor 是否被正确调用；SrcUI 记录回跳后的刷新；
 * document 是「二级半框里已渲染的粘贴框」的替身，用来验认不出回跳摊原文。 */
function mkTa() {
  return {
    value: '', rows: '3',
    setAttribute: function (k, v) { if (k === 'rows') this.rows = String(v); },
  };
}
function load() {
  const store = {}, calls = { finder: [], probe: [], sync: [], toast: [], http: 0, httpUrls: [] };
  const specBox = {};
  const textareas = [mkTa(), mkTa()];
  const clipBox = { text: '' };
  const httpBox = { ok: true, text: '' };
  const SOURCES = {
    define(spec) { specBox.spec = spec; return {}; },
    http(url) { calls.http++; calls.httpUrls.push(String(url));
      return Promise.resolve({ ok: httpBox.ok, text: httpBox.text, code: 200 }); },
    stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' '); },
    now() { return 1700000000; },
  };
  const XXMU = {
    pref(k, v) {
      if (arguments.length >= 2) { store[k] = String(v); return ''; }
      return store[k] || '';
    },
    toast(m) { calls.toast.push(String(m)); },
  };
  const Host = {
    openFinderFor(u, t, cb) { calls.finder.push([u, t, cb]); return true; },
    openProbeFor(u, t, cb) { calls.probe.push([u, t, cb]); return true; },
    openLogin() { return true; },
    getClip() { return clipBox.text; },
  };
  const SrcUI = {
    sync(id, silent) { calls.sync.push([id, silent]); },
    paint() { calls.paint = (calls.paint || 0) + 1; },
  };
  const document = {
    querySelectorAll(sel) { return sel === 'textarea.src-paste' ? textareas : []; },
  };
  const sandbox = {
    console, Date, Math, JSON, String, Number, Array, Object, RegExp, Promise,
    parseInt, isNaN, SOURCES, XXMU, Host, SrcUI, document,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(XQ_SRC, sandbox, { timeout: 3000 });
  return { XQ: sandbox.XQ, spec: specBox.spec, calls: calls, store: store,
    onFind: sandbox.__onXqFind, onProbe: sandbox.__onXqProbe,
    textareas: textareas, clipBox: clipBox, httpBox: httpBox };
}

async function main() {
  console.log('\n[v1.1.71] web/xiqueer.js 双探全自动 / 粘贴导入离线测试（Node vm）');

  /* ① 初始没有快照 → fetch 是 degraded，且绝不做任何 HTTP 请求。 */
  {
    const { XQ, spec, calls } = load();
    ok('① 初始 XQ.has() 为假', XQ.has() === false);
    const r = await spec.fetch(() => {});
    ok('② 没导入时 state=degraded、给三步指引、不发 HTTP 请求',
      r && r.state === 'degraded' && (r.error || '').indexOf('三步') >= 0
        && calls.http === 0,
      'state=' + (r && r.state) + ' http=' + calls.http + ' err=' + (r && r.error));
    ok('③ 降级诊断非空且说明了读回整页的来源',
      !!(r && r.diag) && r.diag.indexOf('读回整页') >= 0,
      'diag=' + (r && r.diag ? r.diag.slice(0, 80) : '(none)'));
  }

  /* ④ 卡片式粘贴：课程/起止/考场/学分/轮次/状态全对。 */
  {
    const { XQ, spec, calls } = load();
    const imp = XQ.importText(CARD);
    ok('④ 卡片式文字认出 1 场考试', imp.count === 1, 'import=' + JSON.stringify(imp));
    const r = await spec.fetch(() => {});
    const e = r && r.exams && r.exams[0];
    ok('⑤ 课程=高等数学B1、起止=2026-11-14 11:00/12:00',
      !!e && e.course === '高等数学B1'
        && e.start === '2026-11-14 11:00' && e.end === '2026-11-14 12:00',
      'exam=' + JSON.stringify(e));
    ok('⑥ 考场含 3102、学分 5.0、轮次 期中考试，状态留空不编已完成',
      !!e && String(e.place).indexOf('3102') >= 0 && e.credit === '5.0'
        && e.round === '期中考试' && e.status === '',
      'exam=' + JSON.stringify(e));
    ok('⑦ ok 态回传导入时间 synced_at（不是刷新时刻），且仍未发 HTTP',
      r && r.state === 'ok' && r.synced_at > 0 && calls.http === 0,
      'state=' + (r && r.state) + ' synced_at=' + (r && r.synced_at));
    ok('⑧ XQ.has() 变真', XQ.has() === true);
  }

  /* ⑨ 表格式文字：课程、时间、考场。 */
  {
    const { XQ, spec } = load();
    const imp = XQ.importText(TABLE);
    ok('⑨ 表格式文字认出 1 场考试', imp.count === 1, 'import=' + JSON.stringify(imp));
    const r = await spec.fetch(() => {});
    const e = r && r.exams && r.exams[0];
    ok('⑩ 表格解析：课程=医用物理学、起止正确、考场=第 3 教学楼 A201',
      !!e && e.course === '医用物理学'
        && e.start === '2026-12-20 09:00' && e.end === '2026-12-20 11:00'
        && String(e.place).indexOf('教学楼') >= 0,
      'exam=' + JSON.stringify(e));
  }

  /* ⑪ __onXqFind：top.text 与 frame.text 是同一份 → 必须去重成 1 场。 */
  {
    const { spec, calls, onFind } = load();
    const payload = JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/desk/exam.action',
      text: CARD, rows: [],
      frames: [{ u: 'https://qgjw.xxmu.edu.cn/student/ksap.jsp',
        text: CARD, rows: [] }],
    });
    ok('⑪ __onXqFind 已挂到 window', typeof onFind === 'function');
    onFind(payload);
    const r = await spec.fetch(() => {});
    ok('⑫ 回跳对象解析后去重为 1 场（不是 2 场）',
      r && r.state === 'ok' && r.exams.length === 1,
      'exams=' + (r && r.exams ? r.exams.length : 'n/a'));
    ok('⑬ 回跳后触发 SrcUI.sync(xiqueer) 重建聚合缓存',
      calls.sync.some(c => c[0] === 'xiqueer'),
      'sync=' + JSON.stringify(calls.sync));
  }

  /* ⑭ 认不出绝不落空快照；⑮ 时间缺失绝不臆造 00:00；⑰ clear 回 degraded。 */
  {
    const { XQ, spec } = load();
    const garbage = XQ.importText('这是普通页面，没有考试表。');
    ok('⑭ 认不出文字返回 count=0 且带可解释的报错',
      garbage.count === 0 && (garbage.error || '').indexOf('日期和时间') >= 0,
      'import=' + JSON.stringify(garbage));
    const noTime = XQ.importText('高等数学B1\n2026-11-14\n考试地点： 博学楼3102');
    ok('⑮ 只有日期没有时刻：仍认出考试但 start/end 留空，不含 00:00',
      noTime.count === 1, 'import=' + JSON.stringify(noTime));
    const r = await spec.fetch(() => {});
    const e = r && r.exams && r.exams[0];
    ok('⑯ 缺时刻的考试 start=="" / end=="" / status==""',
      !!e && e.start === '' && e.end === '' && e.status === '',
      'exam=' + JSON.stringify(e));
    XQ.clear();
    const r2 = await spec.fetch(() => {});
    ok('⑰ clear() 后回到 degraded，不残留旧考试',
      XQ.has() === false && r2 && r2.state === 'degraded',
      'state=' + (r2 && r2.state));
  }

  /* ⑱ find() 走 openFinderFor 打开门户；v1.1.70 起回跳名留空（不再赌读页）。 */
  {
    const { XQ, calls } = load();
    XQ.find();
    ok('⑱ find() 调 Host.openFinderFor 打开教务门户，且不再挂自动读页回跳',
      calls.finder.length === 1 && calls.finder[0][2] === '',
      'finder=' + JSON.stringify(calls.finder));
  }

  /* ⑲⑳ 两场考试连在一起：窗口要按日期切开，课程 / 考场 / 时间不能串到隔壁。 */
  {
    const { XQ, spec } = load();
    const MULTI = [
      '2026-2027学年第一学期',
      '[yg0231]高等数学B1',
      '考试地点： 新乡校区 博学楼3102',
      '2026-11-14(11周 星期六)11:00-12:00',
      '[yg0455]大学英语A2',
      '考试地点： 新乡校区 笃行楼2201',
      '2026-12-01(14周 星期二)14:30-16:30',
    ].join('\n');
    const imp = XQ.importText(MULTI);
    ok('⑲ 两场考试连在一起认出 2 场（不是 1 场也不是 3 场）',
      imp.count === 2, 'import=' + JSON.stringify(imp));
    const r = await spec.fetch(() => {});
    const es = (r && r.exams) || [];
    const a = es.filter(e => e.course === '高等数学B1')[0];
    const b = es.filter(e => e.course === '大学英语A2')[0];
    ok('⑳ 多考试课程 / 考场 / 起止不串：高数 3102 11:00、英语 2201 14:30',
      !!a && !!b
        && String(a.place).indexOf('3102') >= 0 && a.start === '2026-11-14 11:00'
        && String(b.place).indexOf('2201') >= 0 && b.start === '2026-12-01 14:30',
      'exams=' + JSON.stringify(es));
  }

  /* ㉑ v1.1.69 根因回归：顶层 body 近空，考试在 <frame> 里（不是 iframe）。
   * v1.1.68 只翻 iframe 会回传空 → 报「没认出」；新版遍历 window.frames 全读。 */
  {
    const { spec, onFind } = load();
    const payload = JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/desk/exam.action',
      text: '课程考试  考试安排表  检索  打印  导出  学年学期  考试批次',
      rows: [], tables: [], sels: ['2026-2027学年第一学期'],
      frames: [
        { u: 'https://qgjw.xxmu.edu.cn/student/ksap_top.jsp',
          text: '申请缓考 查看缓考信息 考试安排表 申请补考 考试选择信息', rows: [], tables: [], sels: [] },
        { u: 'https://qgjw.xxmu.edu.cn/student/ksap_data.jsp',
          text: CARD, rows: [], tables: [], sels: [] },
      ],
      raw: '（整页原文）',
    });
    onFind(payload);
    const r = await spec.fetch(() => {});
    const e = r && r.exams && r.exams[0];
    ok('㉑ 顶层空、考试在 <frame> 里也认出 1 场（高等数学B1）',
      r && r.state === 'ok' && r.exams.length === 1
        && !!e && e.course === '高等数学B1',
      'exams=' + JSON.stringify(r && r.exams));
  }

  /* ㉒ FIND_JS 的 tables[] 数据行（<table> innerText）能认出课程；
   * ㉓ 只有下拉 sels、raw 有字但没考试表 → 不凭空造考试（raw 不进解析块）。 */
  {
    const { XQ } = load();
    const es = XQ.parse({
      u: 'https://qgjw.xxmu.edu.cn/student/ksap.jsp',
      text: '考试安排表',
      rows: [],
      tables: ['序号 课程名称 考试时间 考场\n1 医用物理学 2026-12-20 09:00-11:00 第3教学楼A201'],
      sels: ['2026-2027学年第一学期', '期中考试'],
      frames: [], raw: '（原文）',
    });
    ok('㉒ tables[] 里的数据行认出课程=医用物理学',
      es.length === 1 && es[0].course === '医用物理学'
        && es[0].start === '2026-12-20 09:00',
      'exams=' + JSON.stringify(es));
    const none = XQ.parse({
      u: 'https://qgjw.xxmu.edu.cn/student/ksap.jsp',
      text: '', rows: [], tables: [],
      sels: ['2026-2027学年第一学期', '全部'],
      frames: [], raw: '2026-2027学年第一学期 检索 打印 导出',
    });
    ok('㉓ 只有下拉条件、没有考试表时不凭空造出「未标注课程」影子考试',
      none.length === 0, 'exams=' + JSON.stringify(none));
  }

  /* ㉔ 不带年份「11月14日」按学年推年（青果表格常见写法）。 */
  {
    const { XQ, spec } = load();
    const md = [
      '2026-2027学年第一学期',
      '[yg0231]高等数学B1',
      '考试地点： 博学楼3102',
      '11月14日 星期六 11:00-12:00',
    ].join('\n');
    const imp = XQ.importText(md);
    const r = await spec.fetch(() => {});
    const e = r && r.exams && r.exams[0];
    ok('㉔ 不带年份「11月14日」按学年推成 2026-11-14 11:00',
      imp.count === 1 && !!e && e.start === '2026-11-14 11:00',
      'import=' + JSON.stringify(imp) + ' exam=' + JSON.stringify(e));
  }

  /* ㉕㉖ 认不出回跳：把读回原文落进 lastRaw、摊进已渲染的 textarea 并把行数调大；
   * 再 clear() 时连原文一起清掉，不残留上一次的脏文本。 */
  {
    const { XQ, textareas, onFind } = load();
    const payload = JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/desk/exam.action',
      text: '考试安排表  检索  打印  导出',
      rows: [], tables: [], sels: ['2026-2027学年第一学期'],
      frames: [{ u: 'https://qgjw.xxmu.edu.cn/student/ksap_blank.jsp',
        text: '学年学期 考试批次', rows: [], tables: [], sels: [] }],
      raw: 'RAWTEXT_考试安排表_检索_未出表',
    });
    onFind(payload);
    ok('㉕ 认不出回跳把读回原文落进 XQ.lastRaw()',
      String(XQ.lastRaw()).indexOf('RAWTEXT') >= 0,
      'lastRaw=' + String(XQ.lastRaw()).slice(0, 80));
    ok('㉖ 认不出回跳摊进 textarea 且 rows=5；clear() 连原文一起清',
      textareas.length > 0
        && textareas.every(t => String(t.value).indexOf('RAWTEXT') >= 0 && t.rows === '5')
        && (XQ.clear(), String(XQ.lastRaw()) === ''),
      'textareas=' + JSON.stringify(textareas.map(t => ({ v: t.value.slice(0, 20), rows: t.rows })))
        + ' lastRawAfterClear=' + String(XQ.lastRaw()));
  }

  /* ㉗㉘㉙㉚ v1.1.70：从剪贴板导入（你复制、App 解析）。
   * 剪贴板有考试表 → 一步认出；空剪贴板 → 清楚提示；首页菜单 → 认不出且把原文摊出来。 */
  {
    const { XQ, spec, clipBox } = load();
    clipBox.text = CARD;
    const r = XQ.importClip();
    ok('㉗ 剪贴板里有考试表：一步认出 1 场、返回原文',
      r.count === 1 && String(r.raw).indexOf('高等数学') >= 0,
      'r=' + JSON.stringify({ count: r.count, err: r.error }));
    const snap = await spec.fetch(() => {});
    ok('㉘ 剪贴板导入后快照是 ok、课程=高等数学B1',
      snap && snap.state === 'ok' && snap.exams[0] && snap.exams[0].course === '高等数学B1',
      'state=' + (snap && snap.state));
  }
  {
    const { XQ, clipBox } = load();
    clipBox.text = '';
    const r = XQ.importClip();
    ok('㉙ 空剪贴板：count=0、给「剪贴板是空的」提示，不落空快照',
      r.count === 0 && String(r.error).indexOf('剪贴板是空的') >= 0 && XQ.has() === false,
      'r=' + JSON.stringify(r));
  }
  {
    const { XQ, clipBox } = load();
    clipBox.text = '学籍档案 学籍异动 培养方案 辅修事宜';
    const r = XQ.importClip();
    ok('㉚ 剪贴板是首页菜单：认不出、把原文摊回 raw 供粘贴框显示',
      r.count === 0 && String(r.raw).indexOf('学籍档案') >= 0,
      'r=' + JSON.stringify({ count: r.count, raw: r.raw }));
  }

  /* ㉛-㊱ v1.1.71 方案 C 双探全自动：probe() 开双探、记住报表地址、之后
   * fetchExams 用 SOURCES.http 带 Cookie 全自动重放；两路都被挡则诚实降级。 */
  {
    const { XQ, calls } = load();
    XQ.probe();
    ok('㉛ probe() 开双探视图并挂 __onXqProbe 回跳',
      calls.probe.length === 1 && calls.probe[0][2] === '__onXqProbe',
      'probe=' + JSON.stringify(calls.probe));
  }
  {
    const { XQ, calls, onProbe } = load();
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action',
      text: '课程考试 考试安排表 检索 打印 导出', rows: [], tables: [], sels: [], frames: [],
      raw: '（门户）',
      probes: [
        { url: 'https://qgjw.xxmu.edu.cn/custom/js/SetKingoEncypt.jsp', method: 'GET', kind: 'request' },
        { url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel10319.jsp?params=abc', method: 'GET', kind: 'download' },
      ],
    }));
    const a = XQ.auto();
    ok('㉜ 双探记住最像报表的下载/导出地址（AUTO_KEY）并触发刷新',
      !!a && String(a.url).indexOf('ksap_excel') >= 0
        && calls.sync.some(c => c[0] === 'xiqueer'),
      'auto=' + JSON.stringify(a) + ' sync=' + JSON.stringify(calls.sync));
  }
  {
    const { XQ, spec, calls, onProbe, httpBox } = load();
    httpBox.ok = true;
    httpBox.text = '<table><tr><td>序号</td><td>课程名称</td><td>考试时间</td><td>考场</td></tr>'
      + '<tr><td>1</td><td>医用物理学</td><td>2026-12-20 09:00-11:00</td><td>第3教学楼A201</td></tr></table>';
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action', text: '', rows: [], frames: [],
      probes: [{ url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel.jsp?params=xx', method: 'GET', kind: 'download' }],
    }));
    const r = await spec.fetch(() => {});
    ok('㉝ 记住地址后 fetchExams 全自动重放：发 1 次带 Cookie 的 http、认出考试、ok',
      calls.http === 1 && String(calls.httpUrls[0]).indexOf('ksap_excel') >= 0
        && r && r.state === 'ok' && r.exams.length === 1
        && r.exams[0].course === '医用物理学',
      'http=' + calls.http + ' state=' + (r && r.state)
        + ' exams=' + JSON.stringify(r && r.exams));
  }
  {
    const { XQ, spec, onProbe, httpBox } = load();
    XQ.importText(CARD);
    httpBox.ok = true; httpBox.text = '凭证已失效，请重新登录';
    onProbe(JSON.stringify({ u: 'https://qgjw.xxmu.edu.cn/', text: '', frames: [],
      probes: [{ url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel.jsp?params=xx', method: 'GET', kind: 'download' }] }));
    const r = await spec.fetch(() => {});
    ok('㉞ 自动重放认不出时保留旧快照、不把凭证失效页当 0 条考试',
      r && r.state === 'ok' && r.exams.length === 1
        && r.exams[0].course === '高等数学B1',
      'state=' + (r && r.state) + ' exams=' + JSON.stringify(r && r.exams));
  }
  {
    const { XQ, textareas, onProbe } = load();
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action?v=1',
      text: '学籍档案 学籍异动 培养方案', rows: [], tables: [], sels: [], frames: [],
      raw: 'RAWTEXT_probe_只有门户菜单',
      probes: [
        { url: 'https://qgjw.xxmu.edu.cn/frame/homes.action', method: 'GET', kind: 'request' },
        { url: 'https://qgjw.xxmu.edu.cn/custom/js/GetKingoEncypt.jsp?t=1', method: 'GET', kind: 'request' },
        { url: 'about:blank', method: 'GET', kind: 'request' },
      ],
    }));
    ok('㉟ 两条探针都被挡：不记自动地址、把读回原文摊进 RAW_KEY 与 textarea',
      XQ.auto() === null && String(XQ.lastRaw()).indexOf('RAWTEXT_probe') >= 0
        && textareas.every(t => String(t.value).indexOf('RAWTEXT_probe') >= 0),
      'auto=' + JSON.stringify(XQ.auto()) + ' lastRaw=' + String(XQ.lastRaw()).slice(0, 40));
  }
  {
    const { XQ, spec, calls, onProbe } = load();
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/student/ksap.jsp',
      text: CARD, rows: [], tables: [], frames: [], probes: [],
    }));
    const r = await spec.fetch(() => {});
    ok('㊱ 双探视图里页面直接渲染出表：当场认出 1 场、零 HTTP（还没记地址）',
      r && r.state === 'ok' && r.exams.length === 1
        && r.exams[0].course === '高等数学B1' && calls.http === 0,
      'state=' + (r && r.state) + ' http=' + calls.http);
  }

  /* ㊲㊳㊴ v1.1.72：幽灵条目与自清地址（m03025 真机那条「未标注课程 · — ~ —」）。 */
  {
    const { XQ } = load();
    /* 外壳页：只有零星日期/时刻字样，没有任何课程名 —— 老版本会造出
     * 「未标注课程 · — ~ —」挂在待完成里。这版必须一条都不认。 */
    const ghost = XQ.parse('考试安排表\n2026-11-14\n11:00-12:00\n检索 打印 导出');
    ok('㊲ 只有日期没有课程名的外壳页不再造出「未标注课程」幽灵考试',
      ghost.length === 0, 'exams=' + JSON.stringify(ghost));
    const real = XQ.parse('课程名称 考试时间 考场\n1 医用物理学 2026-12-20 09:00-11:00 第3教学楼A201');
    ok('㊳ 表格里课程和时刻齐全的正常考试照旧认出',
      real.length === 1 && real[0].course === '医用物理学',
      'exams=' + JSON.stringify(real));
  }
  {
    const { XQ, spec, httpBox, onProbe } = load();
    XQ.importText(CARD);
    /* 先经双探回跳记下一条像报表的地址 */
    onProbe(JSON.stringify({
      u: 'https://qgjw.xxmu.edu.cn/frame/homes.action', text: '', frames: [],
      probes: [{ url: 'https://qgjw.xxmu.edu.cn/student/ksap_excel.jsp?params=xx', method: 'GET', kind: 'download' }],
    }));
    const before = XQ.auto();
    httpBox.ok = false; httpBox.text = '';
    const r1 = await spec.fetch(() => {});
    const mid = XQ.auto();
    const r2 = await spec.fetch(() => {});
    ok('㊴ 自动地址连续两次拿不到考试表就忘掉，旧快照照旧保留',
      !!before && !!mid && XQ.auto() === null
        && r1 && r1.state === 'ok' && r2 && r2.state === 'ok' && XQ.has() === true,
      'before=' + JSON.stringify(before) + ' mid=' + JSON.stringify(mid)
        + ' after=' + JSON.stringify(XQ.auto()) + ' has=' + XQ.has());
  }

  /* ㊵㊶ v1.1.73：标题别被学年抬头撑长（m03292 真机标题两行、副行重复课程名）。 */
  {
    const { XQ } = load();
    const e = XQ.parse([
      '2026-2027学年第一学期',
      '[yg0231]高等数学B1',
      '学    分： 5.0',
      '轮    次： 2026-2027学年第一学期期中考试',
      '考试地点： 新乡校区 博学楼-第三教学楼3102',
      '2026-11-14(11周 星期六)11:00-12:00',
    ].join('\n'))[0];
    ok('㊵ 轮次里的学年学期抬头被剥掉，标题就是课程名本身',
      !!e && e.name === '高等数学B1' && e.round === '期中考试',
      'name=' + (e && e.name) + ' round=' + (e && e.round));
    const t = XQ.parse([
      '[yg0301]大学英语A2',
      '轮    次： 2026-2027学年第一学期期末考试',
      '2026-12-01(14周 星期二)14:30-16:30',
    ].join('\n'))[0];
    ok('㊶ 只有期末考试也照旧剥干净，长标题不再出现',
      !!t && t.name === '大学英语A2' && t.round === '期末考试',
      'name=' + (t && t.name) + ' round=' + (t && t.round));
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.log('[FAIL] 测试抛异常: ' + ((e && e.stack) || e));
  process.exit(1);
});
