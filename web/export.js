/* 河医大助手 · 备份与导出（v2.5.0 / 档 D「数据能带走」）
 *
 * 为什么要有这个文件：到 v2.4.0 为止，App 里所有东西都只活在
 * SharedPreferences 里 —— 换手机、清数据、重装，待办、专注记录、
 * 成绩、饮水机设备全部一起消失，而界面上没有任何一句话提醒过这件事。
 * 这个模块把「我自己的数据」变成一份能带走的 JSON。
 *
 * 三条红线（与全项目一致）：
 *   1. 只读本机、只写本机。导出不发网络请求，一次也不发。
 *   2. **登录态与票据绝不进导出文件**（water token / 学习通 auth /
 *      知到 auth / 教务账号 / 激活码 / 上传票据 / 管理员密钥）。
 *      备份文件很容易被丢进微信、网盘，把凭据一起带走等于换了台
 *      手机继续冒用身份。
 *   3. 读不到就是读不到。某个 key 坏了、超长、抛异常，就在 notes 里
 *      写明「这项没读出来」，绝不写一个空对象冒充「你本来就没有」。
 *
 * 导出格式（backup 版本号只升不降，导入端据此判断能不能认）：
 *   { app:'xxmu-helper', backup:1, ver:'2.5.0', at:'2026-11-21 14:02:11',
 *     counts:{...}, data:{...}, skipped:[{key,why}], notes:[...] }
 */

const EXPORT = (() => {
  'use strict';

  const FORMAT = 1;
  const K_LAST = 'xxmu_export_at';

  /* 单个 value 的上限。课表缓存能到 100KB 级，正常；超过 512KB 基本是
   * 有东西递归写坏了，导出去只会让文件变成打不开的垃圾，所以截断并记账。 */
  const MAX_VALUE = 512 * 1024;

  /* 明确不导出的键。分三类，注释写清为什么 —— 将来加键的人一眼就知道
   * 自己要不要往这里加。 */
  const SECRET = [
    /* 第三方登录态：拿去就能以他的身份读待办 */
    'xxmu_water_token', 'xxmu_water_uid', 'xxmu_ykt_auth', 'xxmu_zhs_auth',
    /* 教务账号与抓下来的原始页面（含学号、姓名、班级） */
    'xxmu_acct_cx', 'xxmu_acct_kb', 'xxmu_cx_homework', 'xxmu_cx_at',
    /* 激活码 / 上传票据 / 管理员密钥：泄漏等于把发版权交出去 */
    'xxmu_license', 'xxmu_license_id', 'xxmu_ticket', 'xxmu_ticket_exp',
    'xxmu_admin_key', 'xxmu_fp', 'xxmu_verified', 'xxmu_role',
    /* 更新器自己的游标，没有备份价值 */
    'xxmu_upd_at', 'xxmu_upd_skip', 'xxmu_upd_mute', 'xxmu_export_at',
    'xxmu_last_check', 'xxmu_notice_seen', 'xxmu_disc_done',
  ];

  /* 要导出的键，显式列全。**不扫全部前缀**：扫前缀看着省事，但只要哪天
   * 有人加了一个新键（比如某平台的 token），它就会自动进备份文件 ——
   * 而备份文件是会被发出去的。白名单让人必须主动决定。 */
  const PICK = [
    /* 课表与学期 */
    'xxmu_start', 'xxmu_weeks', 'xxmu_term', 'xxmu_user',
    /* 外观与偏好 */
    'xxmu_skin', 'xxmu_theme', 'xxmu_sort', 'xxmu_filter', 'xxmu_done_view',
    'xxmu_launch_tab', 'xxmu_tut_done', 'xxmu_onboard_done', 'xxmu_eg_v2',
    'xxmu_eg_mute',
    /* 待办 */
    'xxmu_mytodo',
    /* 专注 */
    'xxmu_focus',
    /* 成绩与目标绩点 */
    'xxmu_grades', 'xxmu_grades_revealed', 'xxmu_gpa_target', 'xxmu_gpa_remain',
    /* 提醒 */
    'xxmu_remind_on', 'xxmu_remind_mins', 'xxmu_remind_mode',
    'xxmu_remind_hw', 'xxmu_remind_hw_lead', 'xxmu_remind_exam_lead',
    /* 饮水机（设备清单与最长放水，不含 token） */
    'xxmu_water_devs', 'xxmu_water_guard', 'xxmu_water_phone', 'xxmu_water_live',
    /* 校园内容里属于他的那一份 */
    'xxmu_wiki_mine', 'xxmu_guide_mine',
    /* 教室与空调 */
    'xxmu_kfree_campus', 'xxmu_kfree_build', 'xxmu_elec_room', 'xxmu_elec_account',
    /* 推送来源开关 */
    'xxmu_src_filter', 'xxmu_xq_auto', 'xxmu_ykt_region', 'xxmu_zhs_mode',
    'xxmu_zhs_find',
  ];

  const TITLE = {
    xxmu_start: '开学日', xxmu_weeks: '总周数', xxmu_term: '学期',
    xxmu_user: '教务学号', xxmu_skin: '皮肤', xxmu_theme: '明暗',
    xxmu_sort: '作业排序', xxmu_filter: '作业筛选', xxmu_done_view: '已完成显示',
    xxmu_mytodo: '我的待办', xxmu_focus: '专注记录',
    xxmu_grades: '成绩', xxmu_gpa_target: '目标绩点', xxmu_gpa_remain: '剩余学分',
    xxmu_water_devs: '饮水机', xxmu_water_guard: '最长放水',
    xxmu_wiki_mine: '我发的 WIKI', xxmu_guide_mine: '我写的攻略',
  };

  /* ---------------------------------------------------------------- 工具 */

  function pref(k) {
    try {
      if (typeof Host !== 'undefined' && Host && Host.getPref) return Host.getPref(k) || '';
    } catch (e) { }
    try { return localStorage.getItem(k) || ''; } catch (e) { }
    return '';
  }
  function setPref(k, v) {
    try {
      if (typeof Host !== 'undefined' && Host && Host.setPref) { Host.setPref(k, v); return; }
    } catch (e) { }
    try { localStorage.setItem(k, v); } catch (e) { }
  }
  function toast(msg) {
    try {
      if (typeof Pop !== 'undefined' && Pop.toast) { Pop.toast(msg); return; }
      if (typeof XXMU !== 'undefined' && XXMU.toast) { XXMU.toast(msg); return; }
      if (typeof Host !== 'undefined' && Host && Host.toast) { Host.toast(msg); return; }
    } catch (e) { }
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** 版本号：about.js 顶层的 `const APP_VERSION` 在同一个全局词法作用域里，
   *  直接引用即可；拿不到就写空串，不猜、不硬编码。
   *  （注意：它是 const 不是 window 属性，写 window.APP_VERSION 得 undefined。）*/
  function ver() {
    try {
      if (typeof APP_VERSION === 'string' && APP_VERSION) return APP_VERSION;
    } catch (e) { }
    return '';
  }

  /** 本地时间戳 `YYYY-MM-DD HH:mm:ss`。不用 toISOString —— 那是 UTC，
   *  东八区导出来会比手机上的时间早 8 小时，对不上「几点导的」。 */
  function stamp(d) {
    const x = d || new Date();
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate())
      + ' ' + pad2(x.getHours()) + ':' + pad2(x.getMinutes()) + ':' + pad2(x.getSeconds());
  }
  function stampFile(d) {
    const x = d || new Date();
    return x.getFullYear() + pad2(x.getMonth() + 1) + pad2(x.getDate())
      + '-' + pad2(x.getHours()) + pad2(x.getMinutes());
  }

  /** 读一个键，返回 {ok, value, why}。
   *  三态：ok=true 有值 / ok=true value='' 本来就没有 / ok=false 读坏了。 */
  function readKey(k) {
    let raw = '';
    try {
      raw = pref(k);
    } catch (e) {
      return { ok: false, why: '读的时候抛异常：' + String(e && e.message || e) };
    }
    if (raw == null) raw = '';
    raw = String(raw);
    if (raw.length === 0) return { ok: true, value: '' };
    if (raw.length > MAX_VALUE) {
      return { ok: false, why: '内容超过 ' + Math.round(MAX_VALUE / 1024) + 'KB（' + raw.length + ' 字符），没有导出' };
    }
    return { ok: true, value: raw };
  }

  /* ------------------------------------------------------------ 组装备份 */

  /* @testable:buildBackup */
  /** 组装成对象。`read` 可注入（测试用），默认走真 pref。
   *  纯逻辑：不含 DOM、不发网络。 */
  function buildBackup(now, read) {
    const d = now || new Date();
    const rd = typeof read === 'function' ? read : readKey;
    const data = {};
    const skipped = [];
    const notes = [];
    let n = 0;

    PICK.forEach(function (k) {
      if (SECRET.indexOf(k) >= 0) return;   // 双保险：白名单误加也不出去
      /* read 也许会被注入一份会抛的读法（测试里就这么干），也可能某天
       * Android 那边的存储层真的炸了。一个键读不出来不该让整份备份生不出来
       * —— 记一笔、跳过它、继续往下。 */
      let r = null;
      try {
        r = rd(k);
      } catch (e) {
        skipped.push({ key: k, why: '读的时候抛异常：' + String(e && e.message || e) });
        return;
      }
      if (!r || !r.ok) { skipped.push({ key: k, why: (r && r.why) || '读不出来' }); return; }
      if (r.value === '') return;           // 本来就没有的键不写空串占位
      data[k] = r.value;
      n++;
    });

    /* 课表与作业缓存不住在 pref 里，是 Java 私有目录里的两个 json 文件，
     * 走单独的桥取。取不到不算错（可能刚装还没登录过）。 */
    try {
      if (typeof Host !== 'undefined' && Host && Host.cachedSchedule) {
        const sch = Host.cachedSchedule();
        if (sch && String(sch).length > 20) data.schedule_cache = String(sch);
      }
    } catch (e) { notes.push('课表缓存没读出来（' + String(e && e.message || e) + '）'); }
    try {
      if (typeof Host !== 'undefined' && Host && Host.cachedHomework) {
        const hw = Host.cachedHomework();
        if (hw && String(hw).length > 20) data.homework_cache = String(hw);
      }
    } catch (e) { notes.push('作业缓存没读出来（' + String(e && e.message || e) + '）'); }

    const counts = countOf(data);
    if (n === 0 && !data.schedule_cache && !data.homework_cache) {
      notes.push('这台手机上还没有可导出的数据：先登录教务同步一次课表，或者加几条待办再来。');
    }
    return {
      app: 'xxmu-helper',
      backup: FORMAT,
      ver: ver(),
      at: stamp(d),
      counts: counts,
      data: data,
      skipped: skipped,
      notes: notes,
    };
  }
  /* @end */

  /* @testable:countOf */
  /** 数一数这份备份里各有多少条。纯粹为了在界面上说人话
   *  （「3 条待办 · 12 天专注记录」比「18 个键」有意义）。 */
  function countOf(data) {
    const c = { keys: 0, todos: 0, focusDays: 0, grades: 0, water: 0, wiki: 0 };
    Object.keys(data || {}).forEach(function (k) { c.keys++; });
    function parse(v) { try { return JSON.parse(v); } catch (e) { return null; } }
    const todo = parse(data.xxmu_mytodo);
    if (Array.isArray(todo)) c.todos = todo.length;
    const focus = parse(data.xxmu_focus);
    if (focus && focus.log && typeof focus.log === 'object') c.focusDays = Object.keys(focus.log).length;
    const g = parse(data.xxmu_grades);
    if (g && Array.isArray(g.list)) c.grades = g.list.length;
    else if (Array.isArray(g)) c.grades = g.length;
    const w = parse(data.xxmu_water_devs);
    if (Array.isArray(w)) c.water = w.length;
    const wiki = parse(data.xxmu_wiki_mine);
    if (Array.isArray(wiki)) c.wiki = wiki.length;
    return c;
  }
  /* @end */

  /* @testable:summary */
  /** 一句话描述（面板顶部那行）。 */
  function summary(b) {
    const c = (b && b.counts) || {};
    const bits = [];
    if (c.todos) bits.push(c.todos + ' 条待办');
    if (c.focusDays) bits.push(c.focusDays + ' 天专注记录');
    if (c.grades) bits.push(c.grades + ' 门成绩');
    if (c.water) bits.push(c.water + ' 台饮水机');
    if (c.wiki) bits.push(c.wiki + ' 条我发的 WIKI');
    if (b && b.data && b.data.schedule_cache) bits.push('课表');
    if (b && b.data && b.data.homework_cache) bits.push('作业缓存');
    if (!bits.length) return '这台手机上还没有可导出的数据';
    return '可导出：' + bits.join(' · ');
  }
  /* @end */


  function jsonText(b) {
    return JSON.stringify(b || buildBackup(), null, 2);
  }

  /** 文件名。参数是一个 Date（省略就用现在）。 */
  function fileName(d) {
    return '河医大助手备份-' + stampFile(d) + '.json';
  }

  /* ------------------------------------------------------------ 落盘/复制 */

  /** 写成文件。返回 {ok, msg, path}。
   *  **不看呢返回值就当成功是最容易犯的错**（v2.0.0 的 learnplus 就踩过
   *  `if (Host.clip(text))` 恒 falsy）—— 这里严格读 `"OK:…" / "ERR:…"`。 */
  function saveFile() {
    const b = buildBackup();
    const text = jsonText(b);
    let raw = '';
    try {
      if (typeof Host === 'undefined' || !Host || !Host.exportText) {
        return { ok: false, msg: '这个版本拿不到写文件的能力，改用「复制成文本」', backup: b };
      }
      raw = String(Host.exportText(fileName(), text) || '');
    } catch (e) {
      return { ok: false, msg: '写文件失败：' + String(e && e.message || e), backup: b };
    }
    if (raw.indexOf('OK:') === 0) {
      setPref(K_LAST, stamp());
      return { ok: true, msg: raw.slice(3), path: raw.slice(3), backup: b, size: text.length };
    }
    if (raw.indexOf('ERR:') === 0) return { ok: false, msg: raw.slice(4), backup: b };
    return { ok: false, msg: raw || '写文件没有返回结果（未知原因）', backup: b };
  }

  /** 复制成文本。三级降级，每级都**读返回值**。
   *  返回 {ok, msg, size}。 */
  function copyText() {
    const b = buildBackup();
    const text = jsonText(b);
    /* 一级：原生剪贴板。Host.clip 是 void，所以不能靠返回值判断，
     * 只能「调用不抛异常就算交付给它了」。 */
    try {
      if (typeof Host !== 'undefined' && Host && Host.clip) {
        Host.clip(text);
        return { ok: true, msg: '已复制 ' + text.length + ' 字符，去粘贴保存', backup: b, size: text.length };
      }
    } catch (e) { }
    /* 二级：异步剪贴板 API（file:// 下多半没有，写了也不亏） */
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return { ok: true, msg: '已复制 ' + text.length + ' 字符', backup: b, size: text.length };
      }
    } catch (e) { }
    /* 三级：临时 textarea + execCommand */
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return { ok: true, msg: '已复制 ' + text.length + ' 字符', backup: b, size: text.length };
    } catch (e) { }
    return { ok: false, msg: '复制不了（文本 ' + text.length + ' 字符）。试试「导出为文件」', backup: b };
  }

  /* --------------------------------------------------------------- 界面 */

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function openPanel() {
    const body = document.getElementById('sh-body');
    const name = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    if (typeof parkTools === 'function') parkTools();
    if (name) name.textContent = '备份与导出';
    body.innerHTML = '';

    const b = buildBackup();

    body.appendChild(el('p', 'hint left tight',
      '把本机的课表、待办、专注记录、成绩、饮水机清单打包成一份 JSON，存成文件或者复制走。'));

    /* 不用 .row：那条是「左边名词、右边一个短值」的版式，右对齐 + 冒号对齐的
     * 排版遇到「3 条待办 · 10 天专注记录 · 3 门成绩 · 2 台饮水机」这种长句
     * 会右对齐折成两截，读起来像两行不相干的东西（v2.5.0 实拍抓到的）。
     * 这里换成一块独立的小结：上面一行小标题，下面整段左对齐。 */
    const stat = el('div', 'ex-stat');
    stat.appendChild(el('div', 'ex-cap', '这份备份里有什么'));
    stat.appendChild(el('div', 'ex-sum', summary(b)));
    body.appendChild(stat);

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
      const r = saveFile();
      if (r.ok) show(true, '已存到：' + r.msg + '（' + Math.round((r.size || 0) / 1024) + 'KB）');
      else show(false, r.msg);
      if (r.ok) toast('已导出');
    };
    bCopy.onclick = function () {
      const r = copyText();
      show(r.ok, r.msg);
      if (r.ok) toast('已复制');
    };

    /* 明确告诉用户什么没在里面。这句话不能省 —— 用户看到「备份」两个字
     * 会以为换手机就全回来了，登录态不在里面这件事必须写在明面上。 */
    body.appendChild(el('p', 'hint tight',
      '不含登录态和票据：学习通 / 知到 / 雨课堂的授权、教务账号、饮水机的 token、激活码都不会进这份文件。换了手机要重新登一次，这是有意的。'));

    if (b.skipped.length) {
      const bad = el('p', 'hint tight ex-bad',
        '有 ' + b.skipped.length + ' 项这次没读出来（文件里不会假装它们不存在）：'
        + b.skipped.map(function (s) { return s.key + '（' + s.why + '）'; }).join('；'));
      body.appendChild(bad);
    }
    (b.notes || []).forEach(function (t) { body.appendChild(el('p', 'hint tight', t)); });

    const last = pref(K_LAST);
    if (last) body.appendChild(el('p', 'hint tight', '上次导出：' + last));

    sheet.classList.add('on');
  }

  function init() {
    /* 设置页那行「备份与导出」是静态节点，绑定一次就够。
     * 用 onclick 覆盖而不是 addEventListener，避免重复 init 时叠多份。 */
    const row = document.getElementById('rowExport');
    if (row) row.onclick = openPanel;
  }

  return {
    init: init,
    openPanel: openPanel,
    buildBackup: buildBackup,
    countOf: countOf,
    summary: summary,
    jsonText: jsonText,
    fileName: fileName,
    saveFile: saveFile,
    copyText: copyText,
    stamp: stamp,
    stampFile: stampFile,
    FORMAT: FORMAT,
    PICK: PICK,
    SECRET: SECRET,
  };
})();

/* 自启动：脚本排在 app.js 之后，DOM 已就绪，直接绑。
 * 守卫写法照 v2.1.0 定下的规矩：`typeof module === 'undefined'` ——
 * 绝不能写 `!module.exports`，那在浏览器里是 ReferenceError，
 * 而且抛在 try 外面，整个模块会静默不执行（v2.0.0 的 learnplus 就这么栽过）。 */
if (typeof document !== 'undefined' && typeof module === 'undefined') {
  try { EXPORT.init(); } catch (e) { }
}

/* 给 tools/test_export.js 用（浏览器里 module 不存在，这一行不执行）。 */
if (typeof module !== 'undefined' && module.exports) module.exports = EXPORT;
