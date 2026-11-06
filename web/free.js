/* 河医大助手 - 全校空闲教室（教务系统真实数据）
 *
 * 为什么要有这个文件：以前「空教室」只能拿自己课表里出现过的教室去推，别的班的课
 * 看不到，等于猜。教务系统（青果 KINGOSOFT）自己有一张「空闲节次」表，这才是真的。
 *
 * 接口链（本校实测，2026-11-06）：
 *   1. POST /frame/droplist/getDropLists.action
 *        body: comboBoxName=MsSchoolArea&paramValue=            → 校区
 *        body: comboBoxName=MsSchoolArea_LF&paramValue=ssxq=01  → 教学楼
 *        body: comboBoxName=MsSchoolArea_LF_JS&paramValue=ssxq=01&ssjzw_m=0003 → 房间
 *      返回 **UTF-8 JSON**，形如 [{"code":"01","name":"新乡校区"}, ...]
 *   2. POST /kbbp/dykb.fjsickkxzcjc_data.jsp
 *      14 个表单字段，返回 **GBK HTML**，一栋楼一张大表。
 *
 * 三个必须记住的坑（都是实测撞出来的，不是猜的）：
 *
 *   A. 学期编码是 `年,0` = 第一学期（秋），`年,1` = 第二学期（春）。
 *      写成 2026,1 当第一学期，服务端不报参数错，它返回一句
 *      「未设置的周排课天数/天排课节次。请与系统管理员联系！」——看起来像学校没配，
 *      其实是学期传错了。别再靠猜，直接跟 XXMU.currentTerm() 走。
 *
 *   B. 表格是 **大写 `<TABLE>`**，小写 '<table' 一个都匹配不到。所有标签匹配一律加 i。
 *
 *   C. **红色 = 有课（占用）**，不是空闲。表头写的是「空闲节次」，红格却是被占的那格，
 *      非常反直觉。本判据用用户本人第 10 周课表交叉校验过：19 个已知在上课的格子
 *      （3401 周四 7-8 节、3301 周一 1-2 节……）在红格上一一命中，零例外。
 *      反过来（红=空闲）是 0/19。所以这里不能"照表头理解"。
 *
 *   D. 天格里没有任何文字（全 `&ensp;`），只能靠 style 里的 background-color:red 判断。
 *      颜色只有这一种，没有第二色，也没有图例可读。
 *
 *   E. 节次标签会出现 `傍晚1` 这种非数字（排在 11 和 12 之间），直接 parseInt 会 NaN。
 *      这里把它单独存成 bang，晚上时段要连它一起判，否则会把「傍晚有课」的教室
 *      报成整晚空着。
 *
 * 只读：本文件只发上面两个接口的读请求，不发任何写操作、不改教务里的任何东西。
 */

const KFREE = (() => {
  const HOST = 'https://qgjw.xxmu.edu.cn';
  const P_DROP = '/frame/droplist/getDropLists.action';
  const P_MATRIX = '/kbbp/dykb.fjsickkxzcjc_data.jsp';
  const REFERER = HOST + '/kbbp/dykb.fjsickkxzcjc.html?menucode=SB12';
  const FORM = 'application/x-www-form-urlencoded';

  const K_CAMPUS = 'xxmu_kfree_campus';
  const K_BUILD = 'xxmu_kfree_build';
  const K_LIST = 'xxmu_kfree_list';      // 校区/楼列表缓存
  const MX_TTL = 5 * 60 * 1000;          // 矩阵 5 分钟。教务数据按周变，没必要更勤
  const LIST_TTL = 24 * 60 * 60 * 1000;  // 楼列表一天

  const hasHost = () => typeof Host !== 'undefined' && Host;

  /* ---------------- 编解码 ---------------- */

  /** Java 侧把 GBK 字节按 ISO-8859-1 原样带过来（一 char 一 byte），这里还原成字节 */
  function bytesOf(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  }

  /** 矩阵页是 GBK，直接按 GBK 解。不能用「先试 UTF-8」那套：
   *  GBK 字节流里有一段能侥幸通过 UTF-8 校验，解出来是乱码但不会抛，反而更糟。 */
  function toGbk(s) {
    try { return new TextDecoder('gbk').decode(bytesOf(s)); }
    catch (e) { return s; }
  }

  function toUtf8(s) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytesOf(s)); }
    catch (e) { return toGbk(s); }
  }

  /* ---------------- 网络 ---------------- */

  function post(path, body, referer) {
    if (!hasHost() || !XXMU.netCk) {
      return Promise.resolve({ code: -1, text: '', err: '不在 App 内' });
    }
    return XXMU.netCk(HOST + path, 'POST', body, FORM, '', HOST, referer || REFERER)
      .then(r => {
        const sp = XXMU.splitResp(r);
        // 字节位还原：splitResp 给的是 ISO-8859-1 串，两种编码都在这一层往下走
        return { code: sp.code, text: sp.body };
      });
  }

  /** droplist：UTF-8 JSON */
  function drop(name, param) {
    const body = 'comboBoxName=' + encodeURIComponent(name) +
                 '&paramValue=' + encodeURIComponent(param || '');
    return post(P_DROP, body, REFERER).then(r => {
      if (r.code !== 200 && r.code !== 0) return { ok: false, err: '教务返回 ' + r.code };
      const t = toUtf8(r.text).trim();
      if (!t || t.charAt(0) !== '[') {
        return { ok: false, err: looksLikeLogin(t) ? '教务登录已失效，请先去「我的」重新登录' : '教务返回的不是列表' };
      }
      try { return { ok: true, list: JSON.parse(t) }; }
      catch (e) { return { ok: false, err: '列表解析失败' }; }
    });
  }

  function looksLikeLogin(t) {
    return t.indexOf('凭证已失效') >= 0 || t.indexOf('请重新登录') >= 0 ||
           t.indexOf('/cas/login') >= 0 || t.indexOf('name="username"') >= 0;
  }

  /* ---------------- 矩阵 ---------------- */

  let ST = {
    campus: '', build: '', buildName: '', week: 0, day: 0, seg: -1, seats: 0,
    busy: false, err: '', rooms: null, at: 0, key: '',
    campuses: null, builds: null
  };

  function termParam() {
    const t = (typeof XXMU !== 'undefined' && XXMU.currentTerm) ? XXMU.currentTerm()
                                                               : { xn: '2026', xq: '0' };
    return { xn: String(t.xn), xq: String(t.xq) };
  }

  /** 字段顺序照抄教务页面（服务端容错，但没理由去试它到底在不在乎） */
  function matrixBody(campus, build, week) {
    const t = termParam();
    const f = [
      ['xnxq', t.xn + ',' + t.xq],
      ['xn', t.xn],
      ['xn1', ''],
      ['_xq', ''],
      ['xq_m', t.xq],
      ['jslx', ''],
      ['selXQ', campus],
      ['selLF', build],
      ['selJSI', ''],           // 留空 = 整栋，而不是某一个房间
      ['selJSLX', ''],
      ['txtZC', String(week)],
      ['rad_jc', '1'],
      ['lyjc', '1'],
      ['menucode_current', 'SB12']
    ];
    return f.map(kv => kv[0] + '=' + encodeURIComponent(kv[1])).join('&');
  }

  /** 解析一栋楼的整周矩阵。
   *  返回 [{ room, type, seats, week, g:{ '1':[7 个 bool], ... }, bang:[7 个 bool] }]
   *  bool = true 表示**被占用**（红格）。 */
  function parseMatrix(html) {
    const out = [];
    if (!html) return out;
    // 大写 TABLE / 大小写混用都见过，一律不区分大小写。
    // 切块用**前瞻**而不是普通 split：普通 split 会把 <tr id=zc_N> 这个开标签吃掉，
    // 于是每间教室的第一行（就是带节次 1 的那行）落在任何 <tr>...</tr> 之外，
    // 被下面的行正则忽略掉 —— 结果就是「第 1 节永远查不到」，一整天错一格。
    const parts = html.split(/(?=<tr\s+id=zc_\d+\s+class=O>)/i);
    const tdRe = /<td[^>]*>[\s\S]*?<\/td>/gi;

    for (let i = 1; i < parts.length; i++) {      const blk = parts[i];
      const head = blk.match(/rowspan=['"]?\d+['"]?\s*>([^<]*)<\/td>/i);
      if (!head) continue;

      // 教室信息：第一行 12 个 td（教室名/类型/容量/周次 + 节次 + 7 天）
      const mg = blk.match(/rowspan=['"]?\d+['"]?\s*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>(\d+)<\/td>/i);
      const room = (mg ? mg[1] : head[1]).replace(/\s+/g, '').trim();
      if (!room) continue;
      const type = mg ? mg[2].replace(/\s+/g, '').trim() : '';
      const seats = mg ? parseInt(mg[3], 10) || 0 : 0;

      const g = {};
      let bang = null;
      const rows = blk.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const tds = row.match(tdRe);
        if (!tds) continue;
        let labIdx, cellIdx;
        if (tds.length === 12) { labIdx = 4; cellIdx = 5; }
        else if (tds.length === 8) { labIdx = 0; cellIdx = 1; }
        else continue;

        const label = tds[labIdx].replace(/<[^>]*>/g, '').replace(/&ensp;/g, '').replace(/\s+/g, '');
        const cells = tds.slice(cellIdx, cellIdx + 7);
        if (cells.length < 7) continue;
        const flags = cells.map(c => /background-color\s*:\s*red/i.test(c));

        if (/^\d+$/.test(label)) {
          g[String(parseInt(label, 10))] = flags;
        } else if (label.indexOf('傍晚') === 0) {
          bang = flags;             // 排在 11 和 12 之间的那一节
        }
        // 其余（表头「节次」「教室名称」等）直接忽略
      }

      if (!Object.keys(g).length) continue;
      out.push({ room: room, type: type, seats: seats, g: g, bang: bang || null });
    }
    return out;
  }

  /** 从失败页面里挖出教务自己那句话，比「加载失败」有用得多 */
  function reasonOf(html) {
    if (!html) return '';
    if (looksLikeLogin(html)) return '教务登录已失效，请先去「我的」重新登录';
    const m = html.match(/alert\(\s*['"]?([^'")]{4,80})/);
    if (m) return m[1].replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/<table/i.test(html)) return '教务返回的页面里没有表格';
    return '';
  }

  function mxCacheKey() { return ST.campus + '|' + ST.build + '|' + ST.week; }

  function loadMatrix(force) {
    const key = mxCacheKey();
    if (!force && ST.rooms && ST.key === key && Date.now() - ST.at < MX_TTL) {
      return Promise.resolve();
    }
    ST.busy = true; ST.err = '';
    paint();
    return post(P_MATRIX, matrixBody(ST.campus, ST.build, ST.week), REFERER)
      .then(r => {
        const html = r.code === -1 ? '' : toGbk(r.text);
        const rooms = parseMatrix(html);
        if (!rooms.length) {
          ST.err = (r.code === -1 ? '网络没通（' + (r.err || '超时') + '）' : '') ||
                   reasonOf(html) || '这栋楼这周没有排课数据';
          ST.rooms = null; ST.at = 0; ST.key = '';
        } else {
          ST.rooms = rooms; ST.at = Date.now(); ST.key = key; ST.err = '';
          /* 真的拿到教务数据了 —— 这是「登录成功」的第二个证据，
           * 和课表同步成功一样记一笔。只靠 cookie 长度判不出登录状态：
           * 青果未登录时也会下发一个 43 字符的 JSESSIONID。 */
          if (typeof markLoginOk === 'function') {
            markLoginOk();
            if (typeof refreshLoginUI === 'function') refreshLoginUI();
          }
        }
      })
      .catch(e => { ST.err = '请求失败：' + ((e && e.message) || e); ST.rooms = null; })
      .then(() => { ST.busy = false; paint(); });
  }

  /* ---------------- 列表（校区 / 楼） ---------------- */

  function listCache() {
    try {
      const o = JSON.parse(XXMU.pref(K_LIST) || '{}');
      if (o && o.at && Date.now() - o.at < LIST_TTL) return o;
    } catch (e) {}
    return null;
  }

  function saveList(o) {
    o.at = Date.now();
    try { XXMU.pref(K_LIST, JSON.stringify(o)); } catch (e) {}
  }

  function ensureCampuses() {
    if (ST.campuses) return Promise.resolve();
    const c = listCache();
    if (c && c.campuses && c.campuses.length) { ST.campuses = c.campuses; return Promise.resolve(); }
    return drop('MsSchoolArea', '').then(r => {
      if (r.ok && r.list.length) {
        ST.campuses = r.list;
        const o = listCache() || {};
        o.campuses = r.list; saveList(o);
      } else if (!ST.err) {
        ST.err = r.err || '拿不到校区列表';
      }
    });
  }

  function ensureBuilds() {
    if (!ST.campus) return Promise.resolve();
    const c = listCache();
    const ck = 'b_' + ST.campus;
    /* 缓存命中也要把 ST.build 补上。
     * 原来这里直接 return，漏了「楼号为空就默认选第一栋」这一步：
     * 第二次进同一个校区（缓存已经在了）时 ST.build 还是空的，
     * loadMatrix 便带着空 selLF 去查 —— 后端不报错，直接返回全校 185 间，
     * 界面上楼那一排也一个都没选中。用户看到的是「空 89 / 185 间」，
     * 像是没选楼就给了答案，还会以为自己点错了。 */
    const applyDefault = (list) => {
      if (!ST.build || !list.some(b => b.code === ST.build)) {
        ST.build = list[0].code;
        ST.buildName = list[0].name;
        XXMU.pref(K_BUILD, ST.build);
      }
    };
    if (c && c[ck] && c[ck].length) {
      ST.builds = c[ck];
      applyDefault(c[ck]);
      return Promise.resolve();
    }
    return drop('MsSchoolArea_LF', 'ssxq=' + ST.campus).then(r => {
      if (r.ok && r.list.length) {
        ST.builds = r.list;
        const o = listCache() || {};
        o[ck] = r.list; saveList(o);
        applyDefault(r.list);
      } else if (!ST.err) {
        ST.err = r.err || '拿不到教学楼列表';
      }
    });
  }

  /* ---------------- 时段 ---------------- */

  /** 上午/下午/晚上按**节次号**切，不按钟点：教务的表就是按节次排的 */
  function segs() {
    const maxP = Math.min(typeof PERIODS === 'number' && PERIODS > 0 ? PERIODS : 14, 16);
    const all = [];
    for (let p = 1; p <= maxP; p++) all.push(p);
    const cut = (a, b) => all.filter(p => p >= a && p <= b);
    return [
      { t: '上午 1-6', ps: cut(1, 6), bang: false },
      { t: '下午 7-10', ps: cut(7, 10), bang: false },
      { t: '晚上 11-' + maxP, ps: cut(11, maxP), bang: true },
      { t: '全天', ps: all, bang: true }
    ].filter(s => s.ps.length);
  }

  function defSeg() {
    if (ST.seg >= 0 && ST.seg < segs().length) return ST.seg;
    const h = new Date().getHours();
    if (h < 12) return 0;
    if (h < 18) return 1;
    return 2;
  }

  function defDay() {
    if (ST.day >= 1 && ST.day <= 7) return ST.day;
    return (new Date().getDay() + 6) % 7 + 1;   // 周日 0 → 7
  }

  /* ---------------- 计算 ---------------- */

  /** 某房间在某天某时段是否全空。占用=红格=true */
  function freeAt(room, day, seg) {
    const idx = day - 1;
    for (const p of seg.ps) {
      const row = room.g[String(p)];
      if (!row) continue;                 // 这一节教务没给 → 不当作空，也不当作占
      if (row[idx]) return false;
    }
    if (seg.bang && room.bang && room.bang[idx]) return false;
    return true;
  }

  /** 这一节是不是「教务没给数据」（用来把「未知」和「空」分开） */
  function unknownAt(room, day, seg) {
    const idx = day - 1;
    if (!seg.ps.some(p => room.g[String(p)])) return true;
    return false;
  }

  /** 空的具体节次，压缩成「1-3、7、9-10」这种 */
  function freeList(room, day, seg) {
    const idx = day - 1;
    const free = [];
    for (const p of seg.ps) {
      const row = room.g[String(p)];
      if (row && !row[idx]) free.push(p);
    }
    if (!free.length) return '';
    const runs = [];
    let s = free[0], prev = free[0];
    for (let i = 1; i < free.length; i++) {
      if (free[i] === prev + 1) { prev = free[i]; continue; }
      runs.push(s === prev ? String(s) : s + '-' + prev);
      s = prev = free[i];
    }
    runs.push(s === prev ? String(s) : s + '-' + prev);
    return runs.join('、');
  }

  function pick(day, seg) {
    const all = ST.rooms || [];
    const hit = [], unknown = [];
    for (const r of all) {
      if (ST.seats && r.seats && r.seats < ST.seats) continue;
      if (unknownAt(r, day, seg)) { unknown.push(r); continue; }
      if (freeAt(r, day, seg)) hit.push(r);
    }
    hit.sort((a, b) => (b.seats || 0) - (a.seats || 0));
    return { hit: hit, unknown: unknown, total: all.length };
  }

  /* ---------------- 界面 ---------------- */

  function $(id) { return document.getElementById(id); }

  function chips(items, cur, onPick) {
    const box = el('div', 'chips');
    items.forEach(it => {
      const b = el('button', '', it.t);
      if (it.v === cur) b.classList.add('on');
      b.onclick = () => onPick(it.v);
      box.appendChild(b);
    });
    return box;
  }

  function paint() {
    const body = $('sh-body');
    if (!body) return;
    const keepScroll = body.scrollTop;
    body.innerHTML = '';
    $('sh-name').textContent = '空闲教室 · 教务真实数据';

    if (!hasHost()) {
      body.appendChild(el('p', 'hint left', '这个功能要在 App 里用：需要带上教务登录态去查。'));
      return;
    }

    if (ST.busy) body.appendChild(el('p', 'hint', '正在查教务…'));

    /* 校区 */
    if (ST.campuses && ST.campuses.length > 1) {
      body.appendChild(el('div', 'hwsec', '校区'));
      body.appendChild(chips(
        ST.campuses.map(c => ({ t: c.name.replace(/校区$/, ''), v: c.code })),
        ST.campus,
        v => {
          if (v === ST.campus) return;
          ST.campus = v; ST.build = ''; ST.buildName = '';
          ST.rooms = null; ST.at = 0; ST.key = ''; ST.err = '';
          XXMU.pref(K_CAMPUS, v);
          paint();
          ensureBuilds().then(() => loadMatrix(true));
        }
      ));
    }

    /* 教学楼 */
    if (ST.builds && ST.builds.length) {
      body.appendChild(el('div', 'hwsec', '教学楼'));
      body.appendChild(chips(
        ST.builds.map(b => ({ t: b.name.replace(/^[^-]*-/, ''), v: b.code })),
        ST.build,
        v => {
          if (v === ST.build) return;
          ST.build = v;
          const hit = ST.builds.filter(b => b.code === v)[0];
          ST.buildName = hit ? hit.name : '';
          ST.rooms = null; ST.at = 0; ST.key = ''; ST.err = '';
          XXMU.pref(K_BUILD, v);
          paint();
          loadMatrix(true);
        }
      ));
    }

    /* 周次 */
    const wk = el('div', 'chips');
    const prev = el('button', '', '‹');
    const cur = el('button', 'on', '第 ' + ST.week + ' 周');
    const next = el('button', '', '›');
    prev.onclick = () => { if (ST.week > 1) { ST.week--; ST.rooms = null; ST.key = ''; paint(); loadMatrix(true); } };
    next.onclick = () => { if (ST.week < 30) { ST.week++; ST.rooms = null; ST.key = ''; paint(); loadMatrix(true); } };
    cur.onclick = () => { ST.week = curWeek || 1; ST.rooms = null; ST.key = ''; paint(); loadMatrix(true); };
    wk.appendChild(prev); wk.appendChild(cur); wk.appendChild(next);
    body.appendChild(wk);

    /* 星期 + 时段 */
    const day = defDay();
    body.appendChild(chips(
      DAYS.map((nm, i) => ({ t: nm.replace('周', ''), v: i + 1 })),
      day,
      v => { ST.day = v; paint(); }
    ));
    const ss = segs();
    const si = Math.min(defSeg(), ss.length - 1);
    const seg = ss[si];
    body.appendChild(chips(
      ss.map((s, i) => ({ t: s.t, v: i })),
      si,
      v => { ST.seg = v; paint(); }
    ));

    /* 座位筛选 */
    body.appendChild(chips(
      [{ t: '不限座位', v: 0 }, { t: '≥60', v: 60 }, { t: '≥120', v: 120 }, { t: '≥200', v: 200 }],
      ST.seats,
      v => { ST.seats = v; paint(); }
    ));

    if (ST.err) {
      body.appendChild(el('p', 'hint left', ST.err));
      const retry = el('button', 'btn ghost', '再查一次');
      retry.onclick = () => loadMatrix(true);
      body.appendChild(retry);
      return;
    }

    if (!ST.rooms) {
      if (!ST.busy) {
        body.appendChild(el('p', 'hint', '还没拿到数据。'));
        const go = el('button', 'btn', '查询');
        go.onclick = () => loadMatrix(true);
        body.appendChild(go);
      }
      body.scrollTop = keepScroll;
      return;
    }

    /* 结果 */
    const r = pick(day, seg);
    const sec = el('div', 'hwsec',
      DAYS[day - 1] + ' ' + seg.t + ' · 空 ' + r.hit.length + ' / ' + r.total + ' 间');
    body.appendChild(sec);

    if (!r.hit.length) {
      body.appendChild(el('p', 'hint', '这个时段这栋楼没有全空的教室。换个时段或换栋楼试试。'));
    } else {
      const grid = el('div', 'room-grid');
      r.hit.forEach(x => {
        const c = el('div', 'room-card');
        const t = el('div', 'room-t', x.room);
        c.appendChild(t);
        const meta = [x.type, x.seats ? x.seats + ' 座' : ''].filter(Boolean).join(' · ');
        if (meta) c.appendChild(el('div', 'room-m', meta));
        c.appendChild(el('div', 'room-f', '空 ' + freeList(x, day, seg) + ' 节'));
        grid.appendChild(c);
      });
      body.appendChild(grid);
    }

    if (r.unknown.length) {
      body.appendChild(el('p', 'hint left',
        '另有 ' + r.unknown.length + ' 间教务没给这周的排课，没算进「空」。'));
    }

    body.appendChild(el('p', 'hint left',
      '数据来自教务系统的空闲节次表，红色格=有课。可能有几分钟延迟，以教务页面为准。'));

    const acts = el('div', 'free-acts');
    const again = el('button', 'btn ghost', '刷新');
    again.onclick = () => loadMatrix(true);
    const local = el('button', 'btn ghost', '用本机课表估算');
    local.onclick = () => { if (typeof openFreeLocal === 'function') openFreeLocal(); };
    acts.appendChild(again);
    acts.appendChild(local);
    body.appendChild(acts);

    body.scrollTop = keepScroll;
  }

  /* ---------------- 入口 ---------------- */

  function open() {
    if (!ST.campus) {
      ST.campus = XXMU.pref(K_CAMPUS) || '01';
      ST.build = XXMU.pref(K_BUILD) || '';
    }
    if (!ST.week) ST.week = (typeof curWeek === 'number' && curWeek) ? curWeek : 1;

    const body = $('sh-body');
    if (body) body.innerHTML = '';
    $('sh-name').textContent = '空闲教室 · 教务真实数据';
    ST.err = '';
    // 先画骨架（有缓存就直接有内容），再补网络
    paint();
    $('sheet').classList.add('on');

    ensureCampuses()
      .then(() => { if (!ST.campus && ST.campuses && ST.campuses.length) ST.campus = ST.campuses[0].code; return ensureBuilds(); })
      .then(() => { paint(); return loadMatrix(false); })
      .catch(e => { ST.err = '出错了：' + ((e && e.message) || e); paint(); });
  }

  return {
    open: open,
    parseMatrix: parseMatrix,
    freeAt: freeAt,
    freeList: freeList,
    segs: segs,
    matrixBody: matrixBody,
    reasonOf: reasonOf,
    state: function () { return ST; }
  };
})();
