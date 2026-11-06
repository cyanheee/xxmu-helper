/* 河医大助手 - 宿舍空调剩余度数（完美校园）
 *
 * ==================== 数据来源 ====================
 *
 * 学校宿舍空调的剩余度数在「完美校园」（新开普 Newcapec，17wanxiao）平台里查。
 * 学校代码（customercode）= 709（新乡医学院，完美校园官方学校代码表里的旧名）。
 *
 * 接口（零鉴权，只认学号）：
 *   网关   https://xqh5.17wanxiao.com/smartWaterAndElectricityService/SWAEServlet
 *   ① getzonelist        —— 校区列表                      {data:[{id,name}]}
 *   ② getbuildlist       —— 某校区的公寓楼               {data:[{id,name}]}  必须带 account
 *   ③ getfloorlist       —— 某楼栋的楼层（照明/空调分表）  {data:[{id,name}]}  参数名 buildid（小写）
 *   ④ getroomnumlist     —— 某楼层的房间号                {data:[{id,name}]}  参数名 floorid
 *   ⑤ bindroom           —— 登记「我的房间」              需 account+roomverify+zoneid+buildid+floorid+roomnum
 *   ⑥ getbindroom        —— 查已登记的房间               {existflag, roomlist:[{roomfullname,roomverify,detaillist}]}
 *   ⑦ h5_getstuindexpage —— 查单个房间详情（剩余度数）    需 account+roomverify+timestamp
 *      → modlist[0].odd（剩余度数）、odd 单位是「度」、weekuselist 是每日用量
 *   ⑧ unbindroom         —— 取消登记                     需 account+roomverify
 *
 * 请求都走 POST，参数用 JSON 字符串 URL 编码塞在 ?param= 里，body 为空。
 * 必须带 X-Requested-With: com.newcapec.mobile.ncp + Origin + Referer，
 * 否则网关可能判成非官方客户端。Host 头不传（HttpURLConnection 不允许设 Host）。
 *
 * ==================== 为什么必须「选一次房」 ====================
 *
 * h5_getstuindexpage 只要不先 bindroom，无论传 roomverify 还是完整四级参数，
 * 一律返回「未绑定房间 / 根据 roomverify 查询的用户房间绑定为空」（已实测 4 种参数形态）。
 * 也就是说这个网关没有「只读按房间号查」的口子，必须先把房间登记到学号名下。
 *
 * 完美校园自己的缴费页也是这么做的：点进「云缴费 → 宿舍空调」后逐级选
 * 校区/公寓/楼层/房间，选完那次操作在服务端等价于一次 bindroom。
 *
 * 所以本模块的做法是：**只让学生选一次**，选完记住，之后点开直接出度数。
 *   · 本地记住房间（xxmu_elec_room），下次进来自动查，不再问
 *   · 学生若已在完美校园里登记过房间，getbindroom 直接能拿到，连选都不用选
 *   · 想换房间：「换」按钮回到选择器，先解绑旧的再登记新的
 *   · 服务端绑定丢了（换手机/被清）会自动重新登记一次，不用学生重选
 *
 * ==================== 边界（红线） ====================
 *
 * 1. 只读、只看「剩余度数」，不做任何缴费/充值/下单 —— 动钱一律跳官方。
 * 2. 学号取自软件已登记的学号（xxmu_user），不做「输别人学号查」。
 * 3. bindroom 只登记学生刚刚亲手选中的那一间房，不批量、不猜测、不遍历。
 * 4. 「去缴费」不跳官方缴费 H5 —— 那是完美校园 App/小程序的内嵌页，
 *    系统浏览器打开是空白（真机已踩坑）。改为：半框给指引 + 按包名拉起
 *    完美校园 App（com.newcapec.mobile.ncp）。
 *    缴费在完美校园/支付宝官方完成。
 */

const ELEC = (() => {
  const CUSTOMER_CODE = '709';   // 新乡医学院（河南医药大学前身名）
  const BASE = 'https://xqh5.17wanxiao.com/smartWaterAndElectricityService/SWAEServlet';
  const PAY_URL = 'https://xqh5.17wanxiao.com/userwaterelecmini/index.html';  // 官方缴费 H5 入口

  const K_ACCOUNT = 'xxmu_elec_account';   // 用户手填的学号/工号（兜底，一般用软件学号）
  const K_ROOM = 'xxmu_elec_room';         // 记住的房间 {z,b,f,r,rv,name}
  const K_LAST = 'xxmu_elec_last';         // 上次查到的度数 {rv,name,odd,use,at}
  const CK = 'xxmu_elec_c_';               // 四级列表缓存前缀
  const TTL = 7 * 24 * 3600 * 1000;        // 列表缓存 7 天（校区/楼栋极少变）
  const STALE = 30 * 1000;                 // 数据超过 30 秒，回到前台就自动刷一次

  function hasHost() { return typeof Host !== 'undefined' && Host; }
  function pref(k, v) {
    try {
      if (hasHost() && Host.getPref) return v === undefined ? (Host.getPref(k) || '') : (Host.setPref(k, v), '');
    } catch (e) {}
    if (v === undefined) return localStorage.getItem(k) || '';
    try { localStorage.setItem(k, v); } catch (e) {}
    return '';
  }

  function readJSON(k, def) {
    try {
      const s = pref(k);
      if (!s) return def;
      const v = JSON.parse(s);
      return v == null ? def : v;
    } catch (e) { return def; }
  }
  function writeJSON(k, v) {
    try { pref(k, JSON.stringify(v)); } catch (e) {}
  }

  function headers() {
    return 'Origin: ' + 'https://xqh5.17wanxiao.com\n'
      + 'X-Requested-With: com.newcapec.mobile.ncp\n'
      + 'Referer: https://xqh5.17wanxiao.com/userwaterelecmini/index.html';
  }

  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '000';
  }

  /** 一次电费请求。返回 Promise<解析后的 body 对象> */
  function call(param, method) {
    return new Promise((resolve, reject) => {
      if (!hasHost() || typeof XXMU === 'undefined' || !XXMU.net) {
        reject(new Error('需要在 App 内使用'));
        return;
      }
      const url = BASE + '?param=' + encodeURIComponent(JSON.stringify(param))
        + '&customercode=' + CUSTOMER_CODE + '&method=' + method
        + '&command=JBSWaterElecService';
      XXMU.net(url, 'POST', '', 'application/x-www-form-urlencoded', headers(), '0')
        .then(raw => {
          const r = XXMU.splitResp(raw);
          if (r.code < 0) { reject(new Error(r.body || '网络错误')); return; }
          const text = XXMU.decodeAuto(r.body);
          let j;
          try { j = JSON.parse(text); } catch (e) {
            reject(new Error('返回不是 JSON（HTTP ' + r.code + '）')); return;
          }
          if (!j || j.code_ !== 0) { reject(new Error((j && j.message_) || '查询失败')); return; }
          // body 是二次 JSON 字符串，再解一层
          let body;
          try { body = JSON.parse(j.body); } catch (e) { body = j.body; }
          resolve(body);
        }, e => reject(e));
    });
  }

  function account() {
    // 优先用软件已登记的学号（xxmu_user），否则用手填的兜底值
    let a = '';
    try { if (hasHost() && Host.getPref) a = Host.getPref('xxmu_user') || ''; } catch (e) {}
    if (!a) a = pref(K_ACCOUNT);
    return (a || '').trim();
  }

  /** roomverify 是 5 段：校区-公寓-单元-楼层-房间，我们这条线第 3 段恒为空。
   *  例：104-26--87-44511 → 南校区 / 4号学生公寓 / 5层空调 / 44511 */
  function rvOf(sel) {
    return sel.z + '-' + sel.b + '--' + sel.f + '-' + sel.r;
  }
  /** 从 roomverify 反解出四级（getbindroom 只回 roomverify，要拆回来） */
  function parseRv(rv) {
    const p = String(rv || '').split('-');
    if (p.length < 5) return null;
    return { z: p[0], b: p[1], f: p[3], r: p[4], rv: String(rv) };
  }

  /* ---------------- 四级列表（带磁盘缓存） ---------------- */

  function cached(key, loader) {
    const c = readJSON(CK + key, null);
    if (c && c.at && c.data && (Date.now() - c.at) < TTL) return Promise.resolve(c.data);
    return loader().then(data => {
      const arr = Array.isArray(data) ? data : [];
      if (arr.length) writeJSON(CK + key, { at: Date.now(), data: arr });
      return arr;
    });
  }

  function zones(acct) {
    return cached('z', () => call({ cmd: 'getzonelist', account: acct }, 'getzonelist')
      .then(b => (b && b.data) || []));
  }
  function builds(acct, zoneid) {
    return cached('b' + zoneid, () => call({ cmd: 'getbuildlist', account: acct, zoneid: zoneid }, 'getbuildlist')
      .then(b => (b && b.data) || []));
  }
  function floors(acct, buildid) {
    return cached('f' + buildid, () => call({ cmd: 'getfloorlist', account: acct, buildid: buildid }, 'getfloorlist')
      .then(b => (b && b.data) || []));
  }
  function roomnums(acct, floorid) {
    return cached('r' + floorid, () => call({ cmd: 'getroomnumlist', account: acct, floorid: floorid }, 'getroomnumlist')
      .then(b => (b && b.data) || []));
  }

  /** 楼层里只留「空调」分表（照明表剩余度数跟空调用电不是一回事，混着列会误导）。
   *  万一这栋楼压根没有空调分表，就退回全部，让人自己认。 */
  function airconFloors(list) {
    const arr = Array.isArray(list) ? list : [];
    const ac = arr.filter(x => (x && String(x.name || '')).indexOf('空调') >= 0);
    return ac.length ? ac : arr;
  }

  /* ---------------- 绑定 / 查询 ---------------- */

  /** 登记房间到学号名下（学生亲手选的那一间，只此一次） */
  function bindRoom(acct, sel) {
    return call({
      cmd: 'bindroom', account: acct, roomverify: rvOf(sel),
      zoneid: sel.z, buildid: sel.b, floorid: sel.f, roomnum: sel.r,
    }, 'bindroom');
  }

  function unbindRoom(acct, rv) {
    return call({ cmd: 'unbindroom', account: acct, roomverify: rv }, 'unbindroom');
  }

  /** 查单个房间详情。modlist 空就是没查到（多半是服务端还没登记这个房间） */
  function fetchRoom(acct, rv) {
    return call({
      cmd: 'h5_getstuindexpage', account: acct, roomverify: rv, timestamp: stamp(),
    }, 'h5_getstuindexpage').then(b => {
      const list = (b && Array.isArray(b.modlist)) ? b.modlist : [];
      if (!list.length) {
        const m = (b && b.message) || '没查到这块电表';
        const e = new Error(m);
        e.unbound = /未绑定/.test(m) || String(b && b.result) === '-90004';
        throw e;
      }
      return b;
    });
  }

  /** 查学号已登记的房间列表 */
  function fetchRooms(acct) {
    return call({ cmd: 'getbindroom', account: acct }, 'getbindroom')
      .then(b => (b && b.roomlist) || []);
  }

  /** 从房间列表里找「空调」房间（名字含「空调」）。找不到返回 null。
   *  注意：不退回第一个——普通照明电表当成空调显示会误导（剩余度数对不上）。 */
  function findAircon(rooms) {
    if (!Array.isArray(rooms)) return null;
    for (const r of rooms) {
      const name = (r.roomfullname || '').toString();
      if (name.indexOf('空调') >= 0) return r;
    }
    return null;
  }

  /** 读房间的剩余度数。detaillist 是多段（电/空调分项），取 odd 最大值或第一个。 */
  function oddOf(room) {
    const dl = room && Array.isArray(room.detaillist) ? room.detaillist : [];
    if (!dl.length) return null;
    const odds = dl.map(x => parseFloat(x && x.odd)).filter(n => Number.isFinite(n));
    if (!odds.length) return null;
    return Math.max.apply(null, odds);
  }

  /* ---------------- 界面 ---------------- */

  const $ = id => document.getElementById(id);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function mmdd(d) { return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  /** 「今日用 x 度 · 昨天用 y 度」——都是 weekuselist 里的日用量 */
  function usageLine(mod) {
    if (!mod) return '';
    const wl = Array.isArray(mod.weekuselist) ? mod.weekuselist : [];
    if (!wl.length) return '';
    const today = mmdd(new Date());
    let todayUse = null, lastUse = null;
    for (const w of wl) {
      if (w && w.date === today && w.dayuse != null) todayUse = w.dayuse;
    }
    const l = wl[wl.length - 1];
    if (l && l.date !== today && l.dayuse != null) lastUse = l.dayuse;
    const parts = [];
    if (todayUse != null) parts.push('今日用 ' + todayUse + ' 度');
    if (lastUse != null) parts.push('昨天用 ' + lastUse + ' 度');
    return parts.join(' · ');
  }

  /** 记住房间 */
  function saveRoom(sel) {
    writeJSON(K_ROOM, {
      z: sel.z, b: sel.b, f: sel.f, r: sel.r,
      rv: sel.rv || rvOf(sel), name: sel.name || '',
    });
  }
  function savedRoom() {
    const s = readJSON(K_ROOM, null);
    if (!s || !s.rv) return null;
    return s;
  }

  /** 上次查到的度数：为了让「点开的一瞬间」就有数字，而不是先白屏再等接口 */
  function lastOdd() {
    const s = readJSON(K_LAST, null);
    return (s && s.odd != null) ? s : null;
  }
  function saveOdd(sel, mod, use) {
    const odd = mod && Number.isFinite(parseFloat(mod.odd)) ? parseFloat(mod.odd) : null;
    if (odd == null) return;
    writeJSON(K_LAST, { rv: sel.rv || rvOf(sel), name: sel.name || '', odd: odd, use: use || '', at: Date.now() });
  }

  /* ---------------- 入口卡上的度数（v1.1.37） ----------------
   *
   * 用户原话：「可以把这个剩余度数显示在这个按钮的右边，然后再每过十分钟自动刷新，
   * 再加个手动刷新按钮」。
   *
   * 所以入口卡本身要带数字，不用点开就能看见；旁边一个「刷新」按钮；
   * 另外每 10 分钟自己刷一次。
   *
   * 为什么是 10 分钟而不是几秒：这是学校的接口，按秒刷等于给学校服务器添乱，
   * 而且宿舍空调的剩余度数变化本来就慢（充一次几十度能用好几天）。
   * 页面不可见时也不刷 —— 后台白刷没意义，还费电。
   */

  const AUTO_MS = 10 * 60 * 1000;   // 入口卡每 10 分钟自己刷一次
  let ENTRY_BUSY = false;

  /** 把「上次查到的度数」贴到入口卡上。没有数据就显示 --，绝不编一个 0 出来。 */
  function paintEntry() {
    const num = $('elecEntryOdd'), sub = $('elecEntrySub');
    if (!num) return;
    const c = lastOdd();
    const cur = savedRoom();
    /* 只有「上次那个数字属于现在记住的这间房」才敢显示 ——
     * 换了房间还贴着旧房间的度数，是会让人算错电费的。 */
    const same = c && (!cur || !cur.rv || c.rv === cur.rv);
    if (same && c.odd != null) {
      num.textContent = String(c.odd);
      if (sub) sub.textContent = '上次 ' + clock(c.at) + ' 更新 · 点开看详情 ›';
    } else {
      num.textContent = '--';
      if (sub) sub.textContent = cur ? '点一下，看还剩多少度 ›' : '点一次，选好房间就记住 ›';
    }
  }

  /** 只刷入口卡上的数字，不打开半框。手动点「刷新」和 10 分钟定时都走这里。
   *  刻意不复用 showRoom()：那个会动 TOKEN、会重绘半框，
   *  在用户正看着半框时被定时器打断就变成「自己跳走」了。 */
  function entryRefresh() {
    const sub = $('elecEntrySub'), btn = $('elecRefresh');
    const acct = account();
    const cur = savedRoom();
    if (!acct || !cur || !cur.rv) { paintEntry(); return; }
    if (ENTRY_BUSY) return;
    ENTRY_BUSY = true;
    if (btn) btn.className = 'elec-entry-refresh busy';

    fetchRoom(acct, cur.rv).then(d => {
      const mod = (d && Array.isArray(d.modlist)) ? d.modlist[0] : null;
      if (mod) saveOdd(cur, mod, usageLine(mod));
      paintEntry();
    }).catch(() => {
      // 查不到就留着旧数字，只在副标题里说一句 —— 把已经看到的度数抹成 -- 更糟
      const c = lastOdd();
      if (c && sub) sub.textContent = '上次 ' + clock(c.at) + ' 更新 · 没刷上，点开重试 ›';
      else paintEntry();
    }).then(() => {
      ENTRY_BUSY = false;
      if (btn) btn.className = 'elec-entry-refresh';
    });
  }

  /* ---------------- 打开：直接查 / 选择器 ---------------- */

  let TOKEN = 0;   // 每次重绘自增，旧异步回调看见 token 变了就放弃（防止「换房间」被旧响应覆盖）
  let CUR = null;  // 当前半框里正在看的那间房（null = 还没选/不看空调页），供回前台自动刷新用

  /** 回到前台要不要自动刷一次度数。
   *  只在「半框开着、里面正在显示空调度数、上次数据超过 30 秒」时刷——
   *  用「.elec-face 还在不在 sh-body 里」判断，比记标志位可靠：
   *  半框被别的内容（待办/设置）占用时，这个元素早就被 innerHTML 清掉了。 */
  function autoRefresh() {
    if (!CUR) return;
    const sheet = $('sheet');
    if (!sheet || !sheet.classList || !sheet.classList.contains('on')) return;
    const body = $('sh-body');
    if (!body || !body.querySelector('.elec-face')) return;
    const c = lastOdd();
    if (c && c.rv === (CUR.rv || rvOf(CUR)) && (Date.now() - (c.at || 0)) < STALE) return;
    const acct = account();
    if (!acct) return;
    showRoom(acct, CUR);
  }

  function open() {
    const body = $('sh-body');
    const sheet = $('sheet');
    const name = $('sh-name');
    if (!body || !sheet) return;
    if (typeof parkTools === 'function') parkTools();
    if (name) name.textContent = '宿舍空调';
    CUR = null;                     // 重新进入：先不当成「正在看某间房」

    const acct = account();
    if (!acct) {
      body.innerHTML = '';
      body.appendChild(el('p', 'hint', '还没登记学号，先到「我的 → 教务账号」登录一次。'));
      sheet.classList.add('on');
      return;
    }

    sheet.classList.add('on');
    const saved = savedRoom();
    if (saved) showRoom(acct, saved);
    else autoPick(acct);
  }

  /** 没记住房间时：先看学生在完美校园里有没有已登记的房间（有就直接用，省掉选择） */
  function autoPick(acct) {
    const body = $('sh-body');
    const t = ++TOKEN;
    body.innerHTML = '';
    body.appendChild(el('p', 'hint', '查询中…'));
    fetchRooms(acct).then(list => {
      if (t !== TOKEN) return;
      const room = findAircon(list);
      if (room && room.roomverify) {
        const base = parseRv(room.roomverify);
        if (base) {
          base.name = room.roomfullname || '';
          saveRoom(base);
          showRoom(acct, base);
          return;
        }
      }
      openPicker(acct);
    }).catch(() => { if (t === TOKEN) openPicker(acct); });
  }

  /** 显示剩余度数。
   *  先把上次的度数贴出来（有就立刻有数字，不白屏），同时后台查最新一次覆盖上去。 */
  function showRoom(acct, sel) {
    const body = $('sh-body');
    const t = ++TOKEN;
    CUR = sel;
    const rv = sel.rv || rvOf(sel);
    const cached = lastOdd();
    const hasCache = !!(cached && cached.rv === rv);

    body.innerHTML = '';
    if (hasCache) {
      renderRoom(acct, sel, { odd: cached.odd, use: cached.use, at: cached.at }, true);
    } else {
      body.appendChild(el('p', 'hint', '查询中…'));
    }

    fetchRoom(acct, rv).then(d => {
      if (t !== TOKEN) return;
      renderRoom(acct, sel, d, false);
    }).catch(e => {
      if (t !== TOKEN) return;
      if (e && e.unbound) {
        // 服务端登记丢了（换设备/被清理）——按记住的房间重新登记一次，不用学生重选
        body.innerHTML = '';
        body.appendChild(el('p', 'hint', '正在重新登记房间…'));
        bindRoom(acct, sel).then(() => fetchRoom(acct, rv))
          .then(d => { if (t === TOKEN) renderRoom(acct, sel, d, false); })
          .catch(err => { if (t === TOKEN) showFail(err, acct); });
        return;
      }
      // 有旧数据就留着旧数据，只在下面提示一句查不到最新，别把人已经看到的数字抹掉
      if (hasCache) {
        const tl = body.querySelector('.elec-time');
        if (tl) tl.textContent = '上次 ' + clock(cached.at) + ' 查的（没刷上新数据）';
        const old = body.querySelector('.elec-errline');
        if (old) old.remove();
        body.appendChild(el('p', 'hint elec-errline', '没查到最新数据（' + ((e && e.message) || e) + '），上面是上次的。'));
        return;
      }
      showFail(e, acct);
    });
  }

  function renderRoom(acct, sel, d, isCached) {
    const body = $('sh-body');
    const mod = (d && Array.isArray(d.modlist)) ? d.modlist[0] : (d && d.odd != null ? d : null);
    const roomName = sel.name || (d && d.roomfullname) || sel.rv || '';
    const use = usageLine(mod) || (isCached && d && d.use ? d.use : '');

    body.innerHTML = '';
    const card = el('div', 'elec-face');
    const label = el('div', 'elec-label', roomName);
    const chg = el('span', 'elec-change', '换房间');
    chg.onclick = ev => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      openPicker(acct);
    };
    label.appendChild(chg);

    const odd = mod && Number.isFinite(parseFloat(mod.odd)) ? parseFloat(mod.odd) : null;
    card.appendChild(label);
    card.appendChild(el('div', 'elec-big', odd == null ? '--' : String(odd)));
    card.appendChild(el('div', 'elec-unit', '度（剩余）'));
    body.appendChild(card);

    if (use) body.appendChild(el('div', 'elec-meta', use));

    // 什么时候查的：让人知道这个数字新不新（不写的话会以为一直在实时跳）
    const when = isCached && d && d.at ? d.at : Date.now();
    body.appendChild(el('div', 'elec-meta elec-time',
      (isCached ? '更新中… · 上次 ' : '刚刚更新 · ') + clock(when) + ' 查的'));

    if (!isCached) { saveOdd(sel, mod, use); paintEntry(); }

    body.appendChild(el('div', 'elec-meta', '数据来自完美校园，可能有延迟，以缴费页为准'));

    const row = el('div', 'elec-acts');
    const again = el('button', 'btn ghost', isCached ? '刷新' : '再查一次');
    again.onclick = () => showRoom(acct, sel);
    row.appendChild(again);
    const pay = el('button', 'btn', '去缴费');
    pay.onclick = () => goPay();
    row.appendChild(pay);
    body.appendChild(row);

    body.appendChild(el('p', 'hint', '缴费在完美校园 / 支付宝官方完成，本 App 不代办。'));
  }

  function clock(ts) {
    const d = new Date(ts || Date.now());
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function showFail(e, acct) {
    const body = $('sh-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'hint', '查询失败\n\n' + ((e && e.message) || e)
      + '\n\n这是完美校园的接口，校园网/校外网络不稳定都会失败，重试一次。'));
    const again = el('button', 'btn ghost', '重试');
    again.onclick = () => open();
    body.appendChild(again);
  }

  /* ---------------- 四级选择器（只选这一次） ---------------- */

  function openPicker(acct) {
    const body = $('sh-body');
    const t = ++TOKEN;
    CUR = null;                      // 在选房间，不在看某间房：回前台不用自动刷
    const sel = { z: '', b: '', f: '', r: '', rv: '', name: '' };
    const names = { z: '', b: '', f: '', r: '' };

    body.innerHTML = '';
    body.appendChild(el('p', 'hint', '第一次用，选一次宿舍；以后点开就直接看剩余度数。'));
    const wrap = el('div', 'pick');
    body.appendChild(wrap);

    const LABEL = { z: '校区', b: '公寓', f: '楼层', r: '房间' };
    const LOAD = {
      z: () => zones(acct),
      b: () => builds(acct, sel.z),
      f: () => floors(acct, sel.b).then(airconFloors),
      r: () => roomnums(acct, sel.f).then(list => list.slice().sort((a, b2) => Number(a.name) - Number(b2.name))),
    };
    const KEYS = ['z', 'b', 'f', 'r'];

    function curIdx() {
      for (let i = 0; i < KEYS.length; i++) if (!sel[KEYS[i]]) return i;
      return KEYS.length;
    }

    function paint() {
      if (t !== TOKEN) return;
      const cur = curIdx();
      wrap.innerHTML = '';
      for (let i = 0; i < KEYS.length; i++) {
        const k = KEYS[i];
        if (i > cur) continue;             // 还没轮到的层级先不显示
        const done = !!sel[k];
        const row = el('div', 'pick-row' + (done ? ' ok' : (i === cur ? ' on' : '')));
        row.appendChild(el('span', 'pick-k', LABEL[k]));
        const v = el('span', 'pick-v' + (done ? '' : ' ph'), done ? names[k] : '请选择');
        row.appendChild(v);
        row.appendChild(el('span', 'pick-arrow', done ? '›' : ''));
        if (done) {
          row.onclick = () => {
            // 点已选的那一级＝从那级开始重选
            for (let j = i; j < KEYS.length; j++) { sel[KEYS[j]] = ''; names[KEYS[j]] = ''; }
            paint();
          };
        }
        wrap.appendChild(row);

        if (i === cur) {
          const grid = el('div', 'pick-grid' + (k === 'r' ? ' c4' : ''));
          const loading = el('p', 'hint', '加载中…');
          wrap.appendChild(loading);
          LOAD[k]().then(list => {
            if (t !== TOKEN) return;
            if (loading.parentNode) loading.remove();
            if (!list.length) {
              wrap.appendChild(el('p', 'hint', '这一级没有可选内容，换个上一级试试。'));
              return;
            }
            for (const item of list) {
              const cell = el('div', 'pick-cell', String(item.name || item.id));
              cell.onclick = () => {
                sel[k] = String(item.id);
                names[k] = String(item.name || item.id);
                if (k === 'r') {
                  sel.rv = rvOf(sel);
                  sel.name = names.z + ' ' + names.b + ' ' + names.f + ' ' + names.r;
                  commit();
                } else {
                  paint();
                }
              };
              grid.appendChild(cell);
            }
            wrap.appendChild(grid);
          }).catch(e => {
            if (t !== TOKEN) return;
            if (loading.parentNode) loading.remove();
            wrap.appendChild(el('p', 'hint', '列表加载失败：' + ((e && e.message) || e)));
          });
        }
      }
      const last = wrap.lastElementChild;
      if (last && last.scrollIntoView) {
        try { last.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
    }

    /** 四级选齐 → 登记 → 直接展示度数 */
    function commit() {
      if (t !== TOKEN) return;
      const old = savedRoom();          // 换房间时把旧的那一间解绑，别让服务端越攒越多
      body.innerHTML = '';
      body.appendChild(el('p', 'hint', '正在登记房间…'));
      bindRoom(acct, sel).then(() => {
        if (t !== TOKEN) return;
        saveRoom(sel);
        paintEntry();               // 换了房间：入口卡上的旧度数立刻作废（显示 --）
        if (old && old.rv && old.rv !== sel.rv) {
          unbindRoom(acct, old.rv).catch(() => {});   // 失败不影响，只是留一条旧记录
        }
        showRoom(acct, sel);
      }).catch(e => {
        if (t !== TOKEN) return;
        body.innerHTML = '';
        body.appendChild(el('p', 'hint', '登记房间失败：' + ((e && e.message) || e)
          + '\n\n可以直接去完美校园里选一次，回来再点这里。'));
        const again = el('button', 'btn ghost', '重新选');
        again.onclick = () => openPicker(acct);
        body.appendChild(again);
      });
    }

    paint();
  }

  function goPay() {
    // 官方缴费页（userwaterelecmini/index.html）是「完美校园」小程序的内嵌页，
    // 单独在系统浏览器打开是空壳（真机已踩坑：标题加载出来但整页空白）。
    // 正确去处：①完美校园官方 App（com.newcapec.mobile.ncp，包名已从应用宝官方页证实）；
    // ②或支付宝里搜「完美校园」小程序。appId 无可靠公开来源，不赌 scheme 直达小程序。
    const body = $('sh-body');
    if (body) {
      body.innerHTML = '';
      body.appendChild(el('p', 'hint',
        '缴费要去「完美校园」：\n\n'
        + '① 打开完美校园 App（或支付宝搜「完美校园」小程序）\n'
        + '② 登录后进「云缴费 → 宿舍空调」\n'
        + '③ 选到你已经选过的那间房，输入金额支付\n\n'
        + '（那个网页打开是空白的，因为它是给 App/小程序内嵌用的，浏览器里没有登录态。）'));
      const open = el('button', 'btn', '打开完美校园 App');
      open.onclick = () => {
        // 按包名拉起（Host.openApp 走 getLaunchIntentForPackage，没装返回 false）；
        // scheme/intent:// 走不通——完美校园不注册公开 scheme，真机报「没有可用的浏览器」。
        let ok = false;
        try { ok = hasHost() && Host.openApp && Host.openApp('com.newcapec.mobile.ncp'); } catch (e) {}
        if (!ok) {
          const tip = el('p', 'hint', '没找到完美校园 App。可以在支付宝里搜「完美校园」小程序，或到应用商店下载完美校园 App。');
          const old = body.querySelector('.openapp-fail');
          if (old) old.remove();
          tip.className = 'hint openapp-fail';
          body.insertBefore(tip, open);
        }
      };
      body.appendChild(open);
      const back = el('button', 'btn ghost', '返回');
      back.onclick = () => open();
      body.appendChild(back);
    }
  }

  /* ---------------- init ---------------- */

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    const row = $('elecCard');
    if (row) row.onclick = open;

    /* 「刷新」按钮在入口卡里面，点它不能把半框也打开（会打断人正在看的东西），
     * 所以这里 stopPropagation 掉，只刷数字。 */
    const rbtn = $('elecRefresh');
    if (rbtn) {
      rbtn.onclick = ev => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        entryRefresh();
      };
    }

    // 一进软件就把上次的数字贴出来（不联网、瞬开）；没记住房间就保持 --
    paintEntry();
    /* 记住过房间、且上次数据已经超过 10 分钟，才顺手静默刷一次。
     * 每次开软件都打一次接口没必要 —— 迟到几十秒没人会在意，白刷才是打扰。 */
    const boot = lastOdd();
    if (savedRoom() && account() && (!boot || (Date.now() - (boot.at || 0)) > AUTO_MS)) {
      entryRefresh();
    }

    /* 自动刷新只在两种时机发生，且都要过 autoRefresh() 的「半框开着 + 超过 30 秒」判断：
     *   ①页面重新可见（从完美校园/其他 App 切回来）；
     *   ②Java 侧 onResume 主动回调（WebView 切后台不一定触发 visibilitychange）。
     * 不在后台定时轮询：这个接口是学校的，按秒刷等于给学校服务器添乱，
     * 而且度数变化本来就慢（一次充电几十度能用好几天）。 */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { autoRefresh(); paintEntry(); }
    });
    window.__onResume = function () { autoRefresh(); paintEntry(); };

    /* 入口卡每 10 分钟自己刷一次（用户要求）。
     * 只在页面可见时刷 —— 不可见就跳过这一拍，等回来时那一次 visibilitychange 会补上。
     * 半框开着的时候也刷，但只更新卡上的数字，不动半框（entryRefresh 不碰 TOKEN）。 */
    setInterval(() => {
      if (document.hidden) return;
      entryRefresh();
    }, AUTO_MS);
  }

  return {
    init, open, goPay, autoRefresh, entryRefresh, paintEntry,
    fetchRooms, fetchRoom, bindRoom, unbindRoom, findAircon, oddOf, account,
    rvOf, parseRv, airconFloors, usageLine, savedRoom, saveRoom, lastOdd,
    CUSTOMER_CODE, PAY_URL,
  };
})();
