/* 河医大助手 · 从教务读一次成绩（v2.6.0，档 C）
 *
 * 为什么现在才做：成绩页一直只能「用户自己在 PC 上跑 core/kingo.py，再把 JSON
 * 粘进来」。数据在那儿、界面也在那儿，缺的只是「从登录态到成绩表」这一步。
 *
 * 三条红线（与 grades.js 一致，且这一层更要守）：
 *   1. 只读。GET 一次成绩页，不提交任何表单、不改任何东西、不代查别人。
 *   2. 读不出来就说读不出来。哪条候选路径、几个字节、为什么不算成绩表，
 *      全写在面板上；绝不拿「页面里凑巧有个数字」当分数。
 *   3. 文字等级（优秀 / 合格 / 良好）原样保留，不换算成 90 分 ——
 *      换算出来的绩点看着很专业，其实是编的。
 *
 * 为什么要用 XXMU.netCk 而不是新写一条 Java 桥：netCk 已经从 CookieManager
 * 取指定域的 Cookie 塞进请求头（学习通就是靠它），青果认的是同一套东西。
 * 少一条桥就少一处「宿主不认这个方法」的静默失败。
 */
const GRADEPULL = (() => {
  'use strict';

  const BASE = 'https://qgjw.xxmu.edu.cn';
  const REFERER = BASE + '/frame/homes.action';

  /* 青果成绩页的候选路径。core/kingo.py 里也是这三条，谁先返回带成绩表的
   * 真 HTML 就用谁；全都不行就把三份诊断一起摆出来，不猜第四个。 */
  const PATHS = [
    '/student/xscj.stuckcj.jsp?menucode=S40303',
    '/student/xscj.wdcj.jsp?menucode=S40303',
    '/student/cjcx.xscj.jsp?menucode=S40303'
  ];

  /* 光秃秃抓下来的表格顶多几十 KB，超过这个数说明抓到的不是成绩页
   * （多半是整站框架页），直接判失败比硬解析好。 */
  const MAX_BYTES = 900 * 1024;

  function toast(msg) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU.toast) { XXMU.toast(msg); return; }
      if (typeof Pop !== 'undefined' && Pop.toast) { Pop.toast(msg); return; }
      if (typeof Host !== 'undefined' && Host.toast) { Host.toast(msg); }
    } catch (e) {}
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  /* ---------------- 纯函数：HTML → 行 ---------------- */

  /* @testable:cellText */
  function cellText(html) {
    let s = String(html == null ? '' : html);
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
         .replace(/<style[\s\S]*?<\/style>/gi, ' ')
         .replace(/<!--[\s\S]*?-->/g, ' ')
         .replace(/<br\s*\/?>/gi, ' ')
         .replace(/<[^>]*>/g, ' ');
    s = s.replace(/&nbsp;|&ensp;|&emsp;|&#160;/gi, ' ')
         .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
         .replace(/&amp;/gi, '&');
    return s.replace(/\s+/g, ' ').trim();
  }
  /* @end */

  /* @testable:rowsOf */
  function rowsOf(html) {
    const rows = [];
    const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = re.exec(String(html || '')))) {
      const cells = [];
      const cre = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      let c;
      while ((c = cre.exec(m[1]))) cells.push(cellText(c[2]));
      if (cells.length) rows.push(cells);
    }
    return rows;
  }
  /* @end */

  /* 表头 → 列号。青果各校版本列名不一样，所以按关键字找而不是按位置写死。
   * 注意顺序：先找「成绩」，再找「绩点」—— 两个都在时不能把绩点当分数。 */
  /* @testable:colsOf */
  function colsOf(cells) {
    const find = (re, skip) => {
      for (let i = 0; i < cells.length; i++) {
        if (skip && skip(i)) continue;
        if (re.test(cells[i])) return i;
      }
      return -1;
    };
    const scoreAt = find(/成绩|分数/);
    const nameAt = find(/课程|科目/);
    return {
      name: nameAt,
      score: scoreAt,
      credit: find(/学分/),
      term: find(/学期/),
      teacher: find(/教师|老师|任课/),
      point: find(/绩点/, (i) => i === scoreAt)
    };
  }
  /* @end */

  const BAD_NAME = /^(合计|总计|平均|小计|备注|说明|课程名称|课程名)$/;
  const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s);

  /**
   * 从一页 HTML 里解析成绩。
   *
   * 返回 { list, matched, rows, tables, header }。
   * matched=false 时 list 一定是空数组 —— 不允许「半个表」冒充成绩。
   */
  /* @testable:parseGradeTable */
  function parseGradeTable(html) {
    const rows = rowsOf(html);
    let head = -1;
    let cols = null;
    for (let i = 0; i < rows.length; i++) {
      const c = colsOf(rows[i]);
      if (c.name >= 0 && c.score >= 0) { head = i; cols = c; break; }
    }
    if (head < 0) {
      return { list: [], matched: false, rows: rows.length, tables: 0, header: [] };
    }
    const list = [];
    let tables = 1;
    for (let i = head + 1; i < rows.length; i++) {
      const cells = rows[i];
      /* 又出现一行表头（有些版本每张分段表都带表头）→ 换列号继续，
       * 不要把「课程名称 / 成绩」当成一门课。 */
      const again = colsOf(cells);
      if (again.name >= 0 && again.score >= 0) { cols = again; tables++; continue; }

      const name = clean(cells[cols.name]);
      if (!name || BAD_NAME.test(name)) continue;
      /* 名字列读到了东西但没有任何一格像分数/等级 → 这行不是成绩行。
       * 允许整行只有一个课程名（分数还没出），那种按情况不明收下。 */
      const rawScore = cols.score >= 0 ? clean(cells[cols.score]) : '';
      const cr = cols.credit >= 0 ? clean(cells[cols.credit]) : '';
      const credit = isNum(cr) ? Math.abs(Number(cr)) : 0;
      if (!rawScore && cells.length > cols.name + 1 && !isNum(cr) && !cr) {
        /* 名字后面一片空白：多半是跨行合并留下的残行，跳过 */
        continue;
      }
      list.push({
        name: name,
        credit: credit,
        score: rawScore || null,
        term: cols.term >= 0 ? clean(cells[cols.term]) : '',
        teacher: cols.teacher >= 0 ? clean(cells[cols.teacher]) : ''
      });
    }
    return {
      list,
      matched: list.length > 0,
      rows: rows.length,
      tables,
      header: rows[head] || []
    };
  }
  /* @end */

  /* 教务把没登录的请求一律打回一段 alert 脚本，跟课表那边是同一种拦法。
   * 判据照 sync.js 的 kbExpired 收紧：宁可漏一次，也别把真成绩页判成失效。 */
  /* @testable:looksStale */
  function looksStale(text, raw) {
    const t = String(text || '');
    const b = String(raw || '');
    if (t.indexOf('凭证已失效') >= 0 || t.indexOf('请重新登录') >= 0) return true;
    if (b.length > 0 && b.length < 1500 &&
        (b.indexOf("location.href='/'") >= 0 || b.indexOf('location.href="/"') >= 0)) return true;
    if (b.indexOf('id="dosub"') >= 0 || b.indexOf('name="randnumber"') >= 0) return true;
    return false;
  }
  /* @end */

  /* 文字等级：优秀 / 良好 / 合格 / 不及格 / 通过 / 免修 / A- 之类。
   * 只用来在面板上多写一句「其中 N 门是文字等级」，绝不参与换算。 */
  /* @testable:isGradeWord */
  function isGradeWord(s) {
    const v = clean(s);
    if (!v) return false;
    if (isNum(v)) return false;
    return /^[\u4e00-\u9fa5A-Za-z+\-]{1,6}$/.test(v);
  }
  /* @end */

  /* 合并：新读到的按「学期+课名」对齐到旧表，旧表里教务没返回的（往届、
   * 手工补的）原样留着。新值读不出分而旧值读得出时，保留旧分 —— 降级覆盖
   * 等于把已经知道的事忘掉。 */
  /* @testable:mergeInto */
  function mergeInto(oldList, freshList) {
    const out = (Array.isArray(oldList) ? oldList : []).map((g) => Object.assign({}, g));
    const keyOf = (g) => clean(g && g.term) + '|' + clean(g && g.name);
    const idx = {};
    out.forEach((g, i) => {
      const k = keyOf(g);
      if (!idx[k]) idx[k] = [];
      idx[k].push(i);
    });
    const stats = { added: 0, updated: 0, kept: 0 };
    (Array.isArray(freshList) ? freshList : []).forEach((f) => {
      const k = keyOf(f);
      const bucket = idx[k];
      if (bucket && bucket.length) {
        const i = bucket.shift();
        const prev = out[i];
        const nNum = isNum(clean(f.score));
        const oNum = isNum(clean(prev && prev.score));
        out[i] = {
          name: clean(f.name) || clean(prev.name),
          credit: (Number(f.credit) > 0) ? Number(f.credit) : Number(prev.credit) || 0,
          score: (nNum || !oNum) ? (f.score == null ? null : clean(String(f.score)))
                                 : (prev.score == null ? null : clean(String(prev.score))),
          term: clean(f.term) || clean(prev.term) || '未分学期',
          teacher: clean(f.teacher) || clean(prev.teacher) || ''
        };
        stats.updated++;
      } else {
        out.push({
          name: clean(f.name),
          credit: (Number(f.credit) > 0) ? Number(f.credit) : 0,
          score: f.score == null ? null : clean(String(f.score)),
          term: clean(f.term) || '未分学期',
          teacher: clean(f.teacher) || ''
        });
        stats.added++;
      }
    });
    stats.kept = out.length - stats.added - 0;
    return { list: out, stats };
  }
  /* @end */

  /* ---------------- 网络：一条路一条路试 ---------------- */

  function pullOne(path) {
    const url = BASE + path;
    return XXMU.netCk(url, 'GET', '', '', '', BASE, REFERER).then((raw) => {
      const r = XXMU.splitResp(raw);
      if (r.code !== 200) {
        return { path, ok: false, code: r.code, bytes: 0, why: 'HTTP ' + r.code + '：' + clean(r.body).slice(0, 80) };
      }
      const bytes = r.body.length;
      if (bytes > MAX_BYTES) {
        return { path, ok: false, code: r.code, bytes, why: '这一页太大了（' + bytes + ' 字节），不是成绩页' };
      }
      const text = XXMU.decodeAuto(r.body);
      if (looksStale(text, r.body)) {
        return { path, ok: false, code: r.code, bytes, stale: true, why: '教务说凭证已失效' };
      }
      const p = parseGradeTable(text);
      if (!p.matched) {
        return { path, ok: false, code: r.code, bytes, rows: p.rows, why: '这一页没有「课程 / 成绩」表头的表' };
      }
      return { path, ok: true, code: r.code, bytes, list: p.list, rows: p.rows, tables: p.tables, why: '' };
    }).catch((e) => ({
      path, ok: false, code: 0, bytes: 0,
      why: '请求失败：' + ((e && e.message) || e)
    }));
  }

  /* 顺序试，命中就停。不并发：三个请求同时打过去对教务不礼貌，
   * 而且真出问题时诊断会乱。 */
  function pull() {
    const tried = [];
    let i = 0;
    function step() {
      if (i >= PATHS.length) return Promise.resolve({ ok: false, tried });
      const p = PATHS[i++];
      return pullOne(p).then((r) => {
        tried.push(r);
        if (r.ok) return { ok: true, hit: r, tried };
        return step();
      });
    }
    if (typeof XXMU === 'undefined' || !XXMU.netCk) {
      return Promise.resolve({
        ok: false, tried: [{ path: '(环境)', ok: false, bytes: 0, why: '不在 App 里，没有带 Cookie 的请求桥' }]
      });
    }
    return step();
  }

  /* ---------------- 面板 ---------------- */

  function mk(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let LAST = null;

  function rowFor(r) {
    const box = mk('div', 'gp-row' + (r.ok ? ' ok' : ''));
    box.appendChild(mk('b', 'gp-path', r.path));
    const bits = [];
    if (r.bytes != null) bits.push(r.bytes + ' 字节');
    if (r.ok && r.list) bits.push('读到 ' + r.list.length + ' 门');
    if (!r.ok && r.why) bits.push(r.why);
    box.appendChild(mk('span', 'gp-why', bits.join(' · ')));
    return box;
  }

  function diagText(res) {
    const L = [];
    L.push('河医大助手 成绩读取诊断');
    L.push('时间：' + new Date().toLocaleString());
    L.push('结果：' + (res && res.ok ? '读到 ' + res.hit.list.length + ' 门' : '没读到'));
    (res && res.tried ? res.tried : []).forEach((r) => {
      L.push('- ' + r.path + ' → ' + (r.ok ? 'OK' : 'FAIL') +
        ' · ' + (r.bytes || 0) + ' 字节' + (r.why ? ' · ' + r.why : ''));
    });
    return L.join('\n');
  }

  function copyDiag() {
    const t = diagText(LAST);
    try {
      if (typeof Host !== 'undefined' && Host.clip) { Host.clip(t); toast('诊断已复制'); return; }
    } catch (e) {}
    toast('复制失败');
  }

  function openPanel() {
    const body = document.getElementById('sh-body');
    const name = document.getElementById('sh-name');
    const sheet = document.getElementById('sheet');
    if (!body || !sheet) return;
    if (typeof parkTools === 'function') parkTools();
    if (name) name.textContent = '从教务读成绩';
    body.innerHTML = '';

    body.appendChild(mk('p', 'hint',
      '用你登录教务的同一份 Cookie 去读一次成绩页。只发一次 GET，不提交任何东西、不代查别人。' +
      '读到的分数默认还是盖着的，点「全部翻开」才看得见。'));

    const acts = mk('div', 'gp-acts');
    const btn = mk('button', 'btn', '读一次');
    const btnDiag = mk('button', 'btn ghost', '复制诊断');
    btnDiag.onclick = copyDiag;
    acts.appendChild(btn);
    acts.appendChild(btnDiag);
    body.appendChild(acts);

    const out = mk('div', 'gp-out');
    body.appendChild(out);

    const res = mk('div', 'gp-res');
    body.appendChild(res);

    function paintTried(tried) {
      out.innerHTML = '';
      out.appendChild(mk('div', 'gp-cap', '试过的路径'));
      (tried || []).forEach((r) => out.appendChild(rowFor(r)));
    }

    btn.onclick = () => {
      btn.disabled = true;
      btn.textContent = '正在读…';
      out.innerHTML = '';
      res.innerHTML = '';
      res.appendChild(mk('p', 'hint', '一条一条试。教务慢的时候要等十几秒，别退出。'));
      pull().then((r) => {
        LAST = r;
        btn.disabled = false;
        btn.textContent = '再读一次';
        paintTried(r.tried);
        res.innerHTML = '';
        if (!r.ok) {
          const anyStale = (r.tried || []).some((x) => x.stale);
          res.appendChild(mk('p', 'hint',
            anyStale
              ? '教务说凭证已失效：先去「登录教务」重登一次，回来再点「读一次」。'
              : '三条候选路径都没读出成绩表。可能是学校换了成绩页地址，把上面的「复制诊断」发过来就能对。'));
          return;
        }
        const list = r.hit.list;
        const words = list.filter((g) => isGradeWord(g.score)).length;
        const noScore = list.filter((g) => !clean(g.score)).length;
        const sum = mk('div', 'gp-sum');
        sum.appendChild(mk('b', '', '读到 ' + list.length + ' 门'));
        const bits = ['来自 ' + r.hit.path];
        if (words) bits.push(words + ' 门是文字等级');
        if (noScore) bits.push(noScore + ' 门还没有分数');
        sum.appendChild(mk('span', '', bits.join(' · ')));
        res.appendChild(sum);

        const prev = (typeof GRADES !== 'undefined' && GRADES.load) ? (GRADES.load().list || []) : [];
        const m = mergeInto(prev, list);
        res.appendChild(mk('p', 'hint',
          '合并后一共 ' + m.list.length + ' 门：新增 ' + m.stats.added + ' 门、更新 ' + m.stats.updated + ' 门'
          + (prev.length ? '，教务没返回的 ' + Math.max(0, prev.length - m.stats.updated) + ' 门原样留着' : '') + '。'));

        const go = mk('button', 'btn', '写入成绩（默认盖着）');
        go.onclick = () => {
          try {
            GRADES.save(m.list);
            GRADES.resetCover();
            toast('已写入 ' + m.list.length + ' 门');
            GRADES.open();
          } catch (e) {
            toast('写入失败：' + ((e && e.message) || e));
          }
        };
        res.appendChild(go);

        const imp = mk('p', 'hint',
          '文字等级（优秀 / 合格 / 不及格之类）原样保留，不换算成分数 —— 换算出来的绩点看着专业，其实是编的。' +
          '想按自己的口径算，可以把它们改成数字再「导入成绩 JSON」。');
        res.appendChild(imp);
      });
    };

    sheet.classList.add('on');
  }

  function init() {
    /* 不占任何入口按钮：成绩面板里那一行由 grades.js 自己挂，
     * 这里只保证全局对象存在。 */
  }

  return {
    init, openPanel, pull, pullOne,
    parseGradeTable, rowsOf, colsOf, cellText, looksStale, isGradeWord, mergeInto,
    diagText, PATHS, BASE
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GRADEPULL;
