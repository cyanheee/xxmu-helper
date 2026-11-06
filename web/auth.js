/* 河医大助手 - 联网授权客户端（AUTH）
 *
 * 从 v0.8.0 起，激活分两步：
 *   1. 本地先算一遍码（离线可用、即时反馈「码打错了」）
 *   2. 再找服务器换一张票据（ticket）——这一步才是「我决定谁能用」
 *
 * 票据 = 过期时间戳 + "." + HMAC(SIGN_KEY, 学号|设备指纹|过期时间)
 *   - 客户端不验签（验不了，密钥在服务端），只把它当不透明字符串存着
 *   - 服务端每次 /v1/check 都会重算并校验，同时做滑动续期
 *   - 所以：断网不影响使用；被管理员拉黑，下次联网就锁死
 *
 * 为什么保留本地校验这一层：
 *   服务器没响应时（没网/防火墙/Worker 挂了）不能让所有人突然用不了。
 *   本地码 + 未过期的票据 = 放行。这是可用性和可控性的折中。
 *
 * 服务地址写死在 BASE 里。换成自己的域名只需改这一行。
 */
const AUTH = (() => {
  /* ================= 服务地址：双入口 + 自动回退（v1.1.17） =================
   *
   * 两个入口都指向同一个 Pages 项目 xxmu-auth（它再薄代理到 Worker），
   * 所以数据、票据、KV 完全一致，换哪个都能用：
   *   HOSTS[0] www.xxmuhelper.top   自有域名，好记、像自己的产品
   *   HOSTS[1] xxmu-auth.pages.dev  Pages 自带子域，永远有效
   *
   * 为什么要双入口而不是只写一个：
   *   2026-11-04 发生了真实事故 —— 新域名证书、服务器、公共 DNS 全绿，
   *   我据此判定「可用」并发布了只写新域名的包。但**学生所在校园网的 DNS
   *   （111.6.174.198）当时还查不到这个新域名**（注册局刚解除 hold，负缓存
   *   没刷完）。结果就是：更新了的学生一联网全部连不上。
   *
   *   教训是「curl --resolve 通过」只证明服务器和证书对，它绕过了 DNS，
   *   而 DNS 才是入口能不能用的决定因素。既然无法预知每个学生用的是哪个
   *   DNS，那就别赌 —— 两个地址都试，哪个通走哪个。
   *
   * 回退判据（这条最容易写错）：
   *   只有**网络层失败**才换域名，也就是 XXMU.net 返回 `ERR:` 开头的那种
   *   （DNS 解析失败 / 连接超时 / TLS 握手失败）。服务端正常回了 4xx/5xx
   *   说明这个主机是活的，绝不能切 —— 否则服务端一次抖动会让所有人在两个
   *   域名之间来回跳，每个请求都要白等一轮超时。
   *
   * 一旦探通就记住（liveHost），后续请求只打这一个，不再重复探测。
   * 不回切：探通了就一直用，哪怕原来那个后来通了 —— 能连上比「用上首选域名」
   * 重要得多，而且少一次探测就少一份等待。
   */
  const HOSTS = ['https://www.xxmuhelper.top', 'https://xxmu-auth.pages.dev'];
  let liveHost = '';

  /** 当前该用的入口。外部拼 URL（图片、APK 下载）都必须用它，不能写死 HOSTS[0]。 */
  function baseNow() { return liveHost || HOSTS[0]; }

  /** XXMU.net 的「网络层失败」长这样：`ERR:NoHost:...` / `ERR:Timeout:...` */
  function isNetFail(raw) {
    return typeof raw === 'string' && raw.indexOf('ERR:') === 0;
  }

  const K_TICKET = 'xxmu_ticket';
  const K_EXP = 'xxmu_ticket_exp';
  const K_FP = 'xxmu_fp';
  const K_LAST = 'xxmu_last_check';
  const K_DEV = 'xxmu_dev_quota';
  const K_ROLE = 'xxmu_role';
  const CHECK_GAP = 6 * 3600 * 1000;   // 联网复检最短间隔：6 小时
  const OFFLINE_GRACE = 7 * 86400 * 1000; // 票据过期后还能容忍离线多久

  function hasHost() {
    return typeof Host !== 'undefined' && Host && Host.getPref;
  }
  function get(k) {
    if (hasHost()) return Host.getPref(k) || '';
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function set(k, v) {
    if (hasHost()) { Host.setPref(k, v); return; }
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function del(k) { set(k, ''); }

  /* ---------------- 设备指纹 ----------------
   * 用途只有一个：让别人拷走票据也没用。不是隐私追踪——不上报任何
   * 硬件标识，只是把「安装 ID + 型号」哈希一遍，本地生成、本地存。
   */
  function fingerprint() {
    let fp = get(K_FP);
    if (fp && fp.length >= 16) return fp;
    let seed = '';
    try { seed += (typeof Host !== 'undefined' && Host.deviceInfo) ? Host.deviceInfo() : navigator.userAgent; } catch (e) {}
    seed += '|' + Math.random() + '|' + Date.now();
    // LICENSE.sha256 收发字节数组，这里转成小写十六进制
    fp = LICENSE.sha256(utf8(seed)).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('').slice(0, 32);
    set(K_FP, fp);
    return fp;
  }

  function utf8(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const c2 = s.charCodeAt(++i);
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /* ---------------- 网络 ----------------
   * 走 Host.httpFetch（Java 侧），因为 file:// 页面受同源策略限制，
   * 直接 fetch 一个 https 接口会被拦。Java 那次请求不受此限。
   */
  /* 把一次 HTTP 往返收尾成「要么 resolve 一个对象，要么 reject 一个 Error」。
   *
   * 这里**故意不因为 4xx/5xx 就 reject**：本服务端的业务拒绝（学号不对、
   * 设备名额满、被停用）都是 HTTP 200 + {ok:false, reason, msg}，调用方
   * 是按 res.ok / res.reason 分支的；真正带非 200 状态的只有 401/404/429/500。
   * 如果一律 reject，`activate()` 的 catch 会把它当成「联不上服务器」而
   * 放学生进门（那条分支为了不因断网挡人是有意放行的），限流就变成通行证。
   *
   * 但也不能像原来那样「解析成功就当成功」：原来 401/500 带 JSON 体时
   * 直接 resolve，配上一堆 `}, () => {});` 的空失败回调，管理员口令填错
   * 时界面一声不响地停在「—」，看起来像「加载完成」。所以：
   *   · 非 200 → 保证返回对象里 ok === false，并把 HTTP 状态带出来，
   *     调用方即使只判 res.ok 也能发现失败；
   *   · 非 200 且体里没有 msg → 补一句人能读的。
   */
  function settle(r, resolve, reject) {
    if (r.code === -1) { reject(new Error(r.body)); return; }
    let data;
    try {
      data = JSON.parse(XXMU.decodeAuto(r.body));
    } catch (e) {
      reject(new Error('服务端返回不是 JSON（HTTP ' + r.code + '）'));
      return;
    }
    if (r.code >= 400) {
      if (!data || typeof data !== 'object') data = { ok: false };
      if (data.ok !== false) data.ok = false;
      if (typeof data.http !== 'number') data.http = r.code;
      if (!data.msg) {
        data.msg = r.code === 401 ? '管理员口令不正确'
          : r.code === 429 ? '操作太频繁，等一会儿再试'
          : r.code === 404 ? '没有这个接口或内容'
          : '服务端出错（HTTP ' + r.code + '）';
      }
    }
    resolve(data);
  }

  /**
   * 打一个 path，网络层失败就换下一个入口重试（见文件里 HOSTS 的说明）。
   *
   * 返回 Promise<原始 "<code>|<body>" 字符串>，由调用方自己 settle。
   * 一个都连不上时，把**最后一个**错误原样返回 —— 上层据此降级成离线放行，
   * 提示文案里也会带上真实原因（而不是一句含糊的「网络错误」）。
   *
   * 已探通的主机（liveHost）只试一次，不重复探测，省一轮超时。
   */
  function fetchAny(path, method, body, contentType, headers, adminKey) {
    const order = liveHost ? [liveHost] : HOSTS.slice();
    let i = 0;
    let last = 'ERR:NoHost:没有可用入口';

    const tryOne = () => {
      if (i >= order.length) return Promise.resolve(last);
      const host = order[i++];
      const hdrs = adminKey ? ('x-admin-key: ' + adminKey) : (headers || '');
      return XXMU.net(host + path, method, body, contentType, hdrs, '0').then(raw => {
        if (!isNetFail(raw)) {
          /* 通了（哪怕是 4xx/5xx）—— 这个主机是活的，记住它。 */
          if (!liveHost) liveHost = host;
          return raw;
        }
        /* 网络层失败才换下一个。这就是「DNS 没通」的表现形式。 */
        last = raw;
        return tryOne();
      });
    };
    return tryOne();
  }

  function postJson(path, obj, adminKey) {
    return new Promise((resolve, reject) => {
      if (typeof XXMU === 'undefined' || !XXMU.net) {
        reject(new Error('no-host'));
        return;
      }
      // XXMU.net 优先走异步桥（Host.httpFetchAsync + __onHttpDone），
      // 老宿主会快速失败而不是同步阻塞（见 sync.js 里那段说明）。
      fetchAny(path, 'POST', JSON.stringify(obj), 'application/json', '', adminKey)
        .then(raw => {
          settle(XXMU.splitResp(raw), resolve, reject);
        }, e => reject(e));
    });
  }

  function getJson(path, adminKey) {
    return new Promise((resolve, reject) => {
      if (typeof XXMU === 'undefined' || !XXMU.net) {
        reject(new Error('no-host'));
        return;
      }
      fetchAny(path, 'GET', '', '', '', adminKey).then(raw => {
        settle(XXMU.splitResp(raw), resolve, reject);
      }, e => reject(e));
    });
  }

  /** 取图片原始字节（管理员审核页专用）。返回 Promise<Blob>，不给 JSON。 */
  function photoRaw(k) {
    return new Promise((resolve, reject) => {
      if (typeof XXMU === 'undefined' || !XXMU.net) { reject(new Error('no-host')); return; }
      const key = keyOfAdmin();
      if (!key) { reject(new Error('还没填管理员口令')); return; }
      XXMU.net(baseNow() + '/v1/admin/photo/raw?k=' + encodeURIComponent(k || ''),
        'GET', '', '', 'x-admin-key: ' + key, '0').then(raw => {
        const r = XXMU.splitResp(raw);
        if (r.code === -1) { reject(new Error(r.body)); return; }
        if (r.code < 200 || r.code >= 300) { reject(new Error('HTTP ' + r.code)); return; }
        /* XXMU.net 把字节摊成「每个 char 一个 byte」的 ISO-8859-1 字符串
         * （为了保留原始字节位，让前端自己决定编码）。图片必须原样还原
         * 成 Uint8Array 再包 Blob，否则 createObjectURL 出来的 URL 是坏的。 */
        const s = r.body || '';
        const u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xff;
        const head = u8.slice(0, 12);
        const isPng = head[0] === 0x89 && head[1] === 0x50;
        const isWebp = u8.length > 11 && head[8] === 0x57 && head[9] === 0x45;
        const mime = isPng ? 'image/png' : (isWebp ? 'image/webp' : 'image/jpeg');
        resolve(new Blob([u8], { type: mime }));
      }, e => reject(e));
    });
  }

  /** 当前会话里的管理员口令（Admin.key 是 setKey 写进来的） */
  function keyOfAdmin() {
    try { return Admin && Admin.key ? Admin.key : ''; } catch (e) { return ''; }
  }

  /* ---------------- 状态 ---------------- */

  function ticket() { return get(K_TICKET); }
  function expAt() { return parseInt(get(K_EXP) || '0', 10) || 0; }

  function saveTicket(t, exp) {
    set(K_TICKET, t || '');
    set(K_EXP, String(exp || 0));
    set(K_LAST, String(Date.now()));
  }

  function clearTicket() {
    del(K_TICKET);
    del(K_EXP);
    del(K_LAST);
    del(K_ROLE);
  }

  /* ---------------- 角色 ----------------
   * 唯一权威是服务端签进票据的 role。客户端只把它当缓存读。
   * 注意：del(K_ROLE) 必须与 clearTicket 一起做，否则退出登录后残留的
   * 'admin' 会让界面继续显示管理入口（点了也进不去，但很误导）。
   */
  function role() {
    const r = get(K_ROLE);
    return (r === 'admin' && ticket()) ? 'admin' : 'user';
  }
  function isAdmin() { return role() === 'admin'; }
  function setRole(r) { set(K_ROLE, r === 'admin' ? 'admin' : ''); }

  /** 本地是否认为可用（未联过网也能用，只要票据没过太久）
   *
   *  v1.1.0 起学生不再有「本地码」，改为「登记过学号」即可；
   *  管理员仍然只看 admin 票据。
   */
  function localValid() {
    const t = ticket();
    if (!t) return false;
    if (role() === 'admin') return Date.now() < expAt() * 1000 + OFFLINE_GRACE;
    if (!LICENSE.isActivated()) return false;
    return Date.now() < expAt() * 1000 + OFFLINE_GRACE;
  }

  /** 当前设备已用几个名额（只有服务器告诉过我们才有值） */
  function devQuota() {
    try {
      const o = JSON.parse(get(K_DEV) || '{}');
      return { n: o.n || 0, max: o.max || 0 };
    } catch (e) { return { n: 0, max: 0 }; }
  }

  /* 「现在能不能用」的最终判据。
   *
   * v1.1.0 起：本地只要登记过学号就可进（激活码已取消），
   * 有票据的再看票据是否太旧。管理员仍然必须有 admin 票据。
   *
   * 注意这里**不再**要求「学号已验证」——进 App 才可能去登录教务，
   * 登录之前一律是未验证状态，卡在这里会造成死锁。
   * 未验证的实际影响是：课表同步被拒（见 app.js 的 syncSchedule），
   * 也就是说能进门，但拿不到数据，正好指向该做的那一步。
   */
  function usable() {
    if (role() === 'admin' && ticket()) return Date.now() < expAt() * 1000 + OFFLINE_GRACE;
    return LICENSE.isActivated() || localValid();
  }

  /* ---------------- 进入（登记学号） ----------------
   *
   * v1.1.0 起取消激活码。现在的判据分两步：
   *   1. 这里只做「登记学号 + 领票」：服务端仍查黑名单(rev:)与设备名额，
   *      但**不再要求开卡记录(lic:)、也不再比对激活码**。
   *   2. 真正的身份校验搬到登录教务之后：青果用学号当登录名，
   *      WebView 把用户填的 input#username 读回来，与登记的学号比对，
   *      不一致就拒绝同步并提示（见 LICENSE.noteKbAccount / app.js 的登录回调）。
   *
   * 为什么不是「离线随便进」：服务端仍然是开关，被停用的学号进不来，
   * 设备名额照样限制。只是「你是不是这个学号的人」这道题改由学校自己出。
   *
   * 管理员那条路没变：必须带管理口令（akey），服务端验过才签 role='admin'。
   */
  function activate(id, code, akey) {
    const sid = String(id || '').trim();
    if (!/^\d{6,20}$/.test(sid)) {
      return Promise.resolve({ ok: false, msg: '学号格式不对（应为 6-20 位数字）' });
    }
    const cd = String(code || '').trim();
    const ak = String(akey || '').trim();

    /* 本地只记学号，不校验任何码。管理员也一样：他的 role 完全由服务端定，
     * 本地 setUser 只是把学号先记住，好让界面有东西显示。
     *
     * v1.1.8：先记下原来登记的学号再写。
     * 原来无论服务器因为什么拒绝，都一律 `LICENSE.deactivate()` 把本地登记
     * 清空 —— 可服务器拒绝的原因不止「你被封了」：限流 429、学号还没开通、
     * 服务端临时 500 都会走到这里。用户本来好好的，一次网络抖动点了个登录，
     * 本地登记就被抹掉，退出重进还得重新填学号，看起来像「软件把我踢了」。
     * 现在只有真被停用/吊销才清登记，其他失败原样回滚成上一次的学号。 */
    const prevId = LICENSE.whoami();
    LICENSE.activate(sid, cd);
    if (ak) LICENSE.setUser(sid, '');

    /* 只在这几种服务端明确判定的情况下撤销本地登记 */
    const HARD = ['revoked', 'not_granted', 'banned', 'bad_ticket', 'need_admin_key'];
    /* 这几种「拒绝」不是这个学号有问题，而是当下这一次做不成：
     *   device_limit 设备名额满了 —— 界面马上会让他选一台解绑，学号得留着
     *   too_old      这个安装包太旧 —— 更新完还要用同一个学号进来
     * 把学号撤掉等于让他更新完再填一遍。 */
    const KEEP = ['device_limit', 'too_old'];

    const fp = fingerprint();
    return postJson('/v1/activate', Object.assign({
      id: sid, code: cd, fp: fp, tag: deviceTag(), akey: ak,
    }, verBody())).then(res => {
      if (res && res.ok && res.ticket) {
        if (res.role === 'admin') LICENSE.setUser(sid, '');
        saveTicket(res.ticket, res.exp);
        setRole(res.role === 'admin' ? 'admin' : '');
        if (res.devCount) set(K_DEV, JSON.stringify({ n: res.devCount, max: res.maxDev || 0 }));
        return {
          ok: true, admin: res.role === 'admin',
          devCount: res.devCount, maxDev: res.maxDev,
        };
      }
      const why = (res && res.reason) || '';
      if (HARD.indexOf(why) >= 0) {
        // 服务器明确拒绝（黑名单/停用/票据坏）：撤销本地登记，不留模糊状态
        LICENSE.deactivate();
        clearTicket();
      } else if (KEEP.indexOf(why) >= 0) {
        /* 名额满 / 包太旧：留学号，只把票据清掉（本来也没发成功） */
        clearTicket();
      } else if (prevId) {
        // 其它原因（限流、服务端忙、没见过的 reason）：退回上一次的学号
        LICENSE.activate(prevId, '');
      } else {
        LICENSE.deactivate();
        clearTicket();
      }
      return {
        ok: false,
        reason: why,
        msg: (res && res.msg) || '服务器拒绝了这次进入',
        devices: (res && res.devices) || null,
      };
    }).catch(e => {
      /* 联不上服务器：学生放行（不能因为一次断网把全校挡在外面，
       * 反正真正的学号校验在登录教务那一步，断网也躲不过），
       * 管理员不放行——他的权限完全来自服务端签署的票据，本地无法自证。
       *
       * v1.1.8：带上 reason:'offline'。原来只给 msg，调用方无法区分
       * 「服务器明确拒绝」和「根本没连上」，两者在 about.js 里都会落到
       * `err(r.msg)` 那一支，于是断网时学生看到的是和「被停用」同样
       * 样式的红字，很容易以为自己被封了。 */
      if (ak) {
        return {
          ok: false,
          reason: 'offline',
          msg: '管理员身份需要联网验证，当前连不上服务器：' + String((e && e.message) || e),
        };
      }
      return { ok: true, offline: true, reason: 'offline', msg: String((e && e.message) || e) };
    });
  }

  function deviceTag() {
    try {
      if (typeof Host !== 'undefined' && Host.deviceInfo) {
        return String(Host.deviceInfo() || '').split('|')[0].trim();
      }
    } catch (e) {}
    return 'unknown';
  }

  /** 当前安装包的 versionCode。0 表示拿不到（浏览器里测试时）。 */
  function curCode() {
    try {
      if (typeof Host !== 'undefined' && Host.appCode) {
        const c = parseInt(Host.appCode(), 10);
        if (c > 0) return c;
      }
    } catch (e) {}
    return 0;
  }

  function curVer() {
    return (typeof APP_VERSION === 'string') ? APP_VERSION : '0';
  }

  /** 上报给服务器的版本信息。老版本 check 不带这些字段，服务端据此识别。
   *
   *  注意：版本号字段必须叫 vcode，不能叫 code。
   *  /v1/activate 里的 code 是**激活码**，用同名会被 versionCode 覆盖掉，
   *  表现是「开卡了、码也对，却报激活码不正确」。（v0.9.0 踩过）
   */
  function verBody() {
    return { ver: curVer(), vcode: curCode() };
  }

  /* ---------------- 静默复检 ----------------
   * App 启动、以及每次切回前台时调用。规则：
   *   - 没有票据：说明从没联过网 → 这里不拦（可能是老版本升上来的），
   *     但会在「我的」页提示「尚未联网校验」
   *   - 距上次检查不足 6 小时：跳过（省流量，也不给服务器压力）
   *   - 服务器说 revoked / not_granted / bad_ticket：锁死并返回原因
   *   - 服务器说 need_admin_key：管理员票据过期或被吊销，回去重输口令
   *   - 管理员也走这里：他的 role 由服务端重算，不是本地常量
   */
  function check(force) {
    const id = LICENSE.whoami();
    if (!id) return Promise.resolve({ ok: false, reason: 'not_activated' });
    const isAdm = role() === 'admin';
    if (!isAdm && !LICENSE.isActivated()) return Promise.resolve({ ok: false, reason: 'not_activated' });
    const t = ticket();
    if (!t) return Promise.resolve({ ok: true, reason: 'never' });
    const last = parseInt(get(K_LAST) || '0', 10) || 0;
    if (!force && Date.now() - last < CHECK_GAP) return Promise.resolve({ ok: true, cached: true });

    return postJson('/v1/check', Object.assign({ id: id, ticket: t, fp: fingerprint() }, verBody()))
      .then(res => {
        if (res && res.ok) {
          if (res.ticket && res.ticket !== t) saveTicket(res.ticket, res.exp);
          else set(K_LAST, String(Date.now()));
          setRole(res.role === 'admin' ? 'admin' : '');
          return { ok: true, admin: res.role === 'admin' };
        }
        const reason = (res && res.reason) || 'unknown';
        if (reason === 'need_admin_key') {
          clearTicket();
          return { ok: false, reason: reason, msg: (res && res.msg) || '管理员登录已过期，请重新输入管理口令' };
        }
        if (reason === 'revoked' || reason === 'not_granted' || reason === 'bad_ticket') {
          LICENSE.deactivate();
          clearTicket();
          return {
            ok: false, reason: reason,
            tooOld: !!(res && res.too_old),
            msg: (res && res.msg) || '授权已失效',
          };
        }
        return { ok: true, reason: 'soft' };   // 未知原因不锁死，避免误伤
      })
      /* v1.1.8：断网时不锁死（正确），但要把原因带出去。
       * 原来 `.catch(() => ({ ok: true, offline: true }))` 把错误对象整个丢掉，
       * 「我的」页只能显示「尚未联网校验」——用户不知道是没网、服务器挂了，
       * 还是自己票据坏了。info 只用于展示，不参与任何放行判断。 */
      .catch(e => ({
        ok: true, offline: true, reason: 'offline',
        info: String((e && e.message) || e || '网络不通'),
      }));
  }

  /* ---------------- 版本检查 ---------------- */

  /**
   * 拉版本配置。返回 {latest, min, notice}
   * 不抛异常：版本检查失败绝不能影响使用。
   */
  function versionInfo() {
    return getJson('/v1/config').catch(() => null);
  }

  /** 当前版本 vs 服务器最低要求；返回 'ok' | 'soft' | 'force' */
  function needUpgrade(cfg, curCode, curVer) {
    if (!cfg) return 'ok';
    // curCode 拿不到（浏览器里没 Host）时不能拿 0 去比，否则永远判定可更新。
    // 那种情况下只信版本号字符串。
    const c = (typeof curCode === 'number' && curCode > 0) ? curCode : 0;
    const min = cfg.min || {};
    if (c && min.code && c < min.code) return 'force';
    if (min.version && cmpVer(curVer, min.version) < 0) return 'force';
    const la = cfg.latest || {};
    if (c && la.code && c < la.code) return 'soft';
    if (la.version && cmpVer(curVer, la.version) < 0) return 'soft';
    return 'ok';
  }

  function cmpVer(a, b) {
    const x = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
    const y = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] || 0, q = y[i] || 0;
      if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
  }

  /* ---------------- 管理端（发码/开卡/踢人/改版本） ---------------- */

  const Admin = {
    key: '',
    setKey(k) { this.key = String(k || '').trim(); },
    grant(ids, note) {
      return postJson('/v1/admin/grant', { ids: ids, note: note || '' }, this.key);
    },
    revoke(ids) { return postJson('/v1/admin/revoke', { ids: ids }, this.key); },
    unRevoke(ids) { return postJson('/v1/admin/unrevoke', { ids: ids }, this.key); },
    revokeDevice(id, fp) { return postJson('/v1/admin/revoke-device', { id: id, fp: fp }, this.key); },
    unGrant(ids) { return postJson('/v1/admin/ungrant', { ids: ids }, this.key); },
    unbind(ids) { return postJson('/v1/admin/unbind', { ids: ids }, this.key); },
    devices(id) { return postJson('/v1/admin/devices', { id: id }, this.key); },
    /** 批量查单个学号的完整状态（开卡/停用/设备/最近激活） */
    state(ids) { return postJson('/v1/admin/state', { ids: ids }, this.key); },
    /** 只算码，不改任何状态（已开过卡、只想重抄一份码时用） */
    codes(ids) { return postJson('/v1/admin/codes', { ids: ids }, this.key); },
    /** 最近的管理动作，用来回溯「我什么时候点了什么」 */
    audit() { return getJson('/v1/admin/audit', this.key); },
    list() { return getJson('/v1/admin/list', this.key); },
    /** 管理员名单（act: add / del / list） */
    admins(act, ids) { return postJson('/v1/admin/admins', { act: act, ids: ids || [] }, this.key); },
    versionCheck(minCode, minVersion) {
      return postJson('/v1/admin/versioncheck',
        { minCode: minCode || 0, minVersion: minVersion || '' }, this.key);
    },
    setConfig(cfg) { return postJson('/v1/admin/config', cfg, this.key); },
    getConfig() { return getJson('/v1/config'); },
    /** 删掉服务器上托管的安装包（不动线上配置里的下载链接） */
    delApk() { return postJson('/v1/admin/apkdel', {}, this.key); },

    /* ---- 校园图片审核（v1.1.6） ---- */
    photos() { return getJson('/v1/admin/photos', this.key); },
    photoAct(act, k, cap) {
      return postJson('/v1/admin/photo',
        { act: act, k: k || '', cap: cap == null ? '' : cap }, this.key);
    },
    /* 取任意状态的图片字节（含待审/已下架）。
     *
     * 为什么不能复用 AUTH.Photos.url：/v1/photo 只放 st==='a' 的图，
     * 待审图一律 404 —— 管理员在审核页看到的会是一排裂图，只能凭说明
     * 文字盲点「通过」，正好把审核这件事做反了。
     * 管理员口令走自定义头，<img src> 加不上头，所以这里拿字节再
     * createObjectURL。 */
    photoRaw(k) { return photoRaw(k); },

    /* ---- 留言板管理（v1.1.6） ---- */
    feedback() { return getJson('/v1/admin/feedback', this.key); },
    feedbackRead(k) { return postJson('/v1/admin/feedback', { act: 'read', k: k }, this.key); },
    feedbackReply(k, reply) {
      return postJson('/v1/admin/feedback', { act: 'reply', k: k, reply: reply || '' }, this.key);
    },
    feedbackDel(k) { return postJson('/v1/admin/feedback', { act: 'del', k: k }, this.key); },
  };

  /* ================= 校园图片（公开接口，不需要登录） =================
   * 图片本身是 <img src="…/v1/photo?k=xxx"> 直接引用，不走 JSON ——
   * 一张 300 KB 的图 base64 进 JSON 就是 400 KB，而 <img> 能让
   * WebView 自己流式解码、自己走缓存。
   */

  /** 已审核通过的图片清单：{ok, list:[{k,cap,w,h,at}]} */
  function photos() { return getJson('/v1/photos'); }

  /** 详情图地址（可直接塞进 <img src>） */
  /** 详情图地址（可直接塞进 <img src>）。用 baseNow() 而不是写死首选域名 ——
   *  否则校园 DNS 连不上新域名的学生，会看到一整面裂图。 */
  function photoUrl(k) { return baseNow() + '/v1/photo?k=' + encodeURIComponent(k || ''); }

  /* ================= 留言板（公开接口） ================= */

  /** 公开留言（只含有管理员回复的）：{ok, list:[{from,kind,text,reply,at}]} */
  function feedbackList() { return getJson('/v1/feedback'); }

  /** 提交一条留言。text 必填，kind 可选，contact 可选 */
  function feedbackPost(text, kind, contact, id) {
    /* 带上 fp（设备指纹）：服务端按「设备」而不是「IP」计算发帖额度。
     * 学校里几百人共用一个校园网出口 IP，按 IP 计数会让「全校一天 5 条」，
     * 那不是限流是禁用。fp 是按安装生成的，拷走也没用。 */
    let f = '';
    try { f = fingerprint(); } catch (e) {}
    return postJson('/v1/feedback',
      { text: text, kind: kind || '其它', contact: contact || '', id: id || '', fp: f });
  }

  const Photos = { list: photos, url: photoUrl };
  const Feedback = { list: feedbackList, post: feedbackPost };

  /** 把服务端下发的绝对地址对齐到「这台手机当前真正能连上的入口」（v1.1.47）。
   *
   * 为什么需要：cfg.latest.url 由服务端写死，是
   *   https://www.xxmuhelper.top/v1/apk?v=<sha前12位>
   * 而校园网 DNS 查不到新域名的学生，fetchAny 会把 liveHost 回退到
   * xxmu-auth.pages.dev。这批学生 /v1/config 能收到（更新提示照样弹），
   * 可 UpdateUI.go() 里拼的 self = AUTH.BASE + '/v1/apk' 是 pages.dev，
   * url 却还是 www —— 前缀判据 url.indexOf(self)===0 不成立，于是「去下载」
   * 被甩给系统浏览器打开一个根本解析不了的地址，App 内下载、4 段并发、
   * 断点续传、整包 SHA 校验、拉起安装器整条链路全部丢掉。
   * 这就是 v1.1.17「更新了的学生一联网全部连不上」没补完的最后一处。
   *
   * 边界（改窄了会出事）：
   *  · 只认 HOSTS 里两个已知入口，且 host 后面必须直接是 / ? # 或结尾 ——
   *    否则 https://www.xxmuhelper.top.evil.com/ 也会被当成自己人。
   *  · 只改写 /v1/ 开头的接口路径；管理员若把 url 配成网盘/群文件外链，
   *    原样返回，仍走浏览器（不改变已有行为）。
   *  · path 与 query 一个字节都不动，尤其 ?v=<sha> 是 v1.1.44 的边缘缓存键，
   *    吃掉它等于关掉版本化缓存。
   *  · 当前入口与 url 同 origin 时什么都不做 —— 绝大多数学生走这条，
   *    改动对他们零影响。
   */
  function localizeUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    const here = baseNow();
    /* 管理员若把 url 配成相对路径（/v1/apk?v=…），也补成当前入口 ——
     * 否则 go() 里那个绝对前缀判据会把它当外链甩给浏览器。 */
    if (s.charAt(0) === '/') {
      return s.indexOf('/v1/') === 0 ? (here + s) : s;
    }
    let from = '';
    for (let i = 0; i < HOSTS.length; i++) {
      const h = HOSTS[i];
      if (s.indexOf(h) !== 0) continue;
      const tail = s.slice(h.length);
      if (tail === '' || tail.charAt(0) === '/' || tail.charAt(0) === '?' || tail.charAt(0) === '#') {
        from = h;
        break;
      }
    }
    if (!from) return s;                       // 外链 / 形近域名：一律不动
    if (s.indexOf(here) === 0) return s;      // 本来就同入口，原样返回
    const rest = s.slice(from.length);
    if (rest.indexOf('/v1/') !== 0) return s; // 只归一自己的接口，别碰别的路径
    return here + rest;
  }

  const api = {
    K_TICKET, K_EXP, K_ROLE,
    fingerprint, activate, check, localValid, usable, clearTicket,
    ticket, expAt, versionInfo, needUpgrade, cmpVer, deviceTag,
    curCode, curVer, devQuota, verBody,
    role, isAdmin, setRole,
    Admin, Photos, Feedback,
    /** 当前入口（探测后可能变成回退地址）。给测试与诊断用。 */
    hostNow: baseNow,
    /** 服务端下发的绝对地址 → 当前可用入口（更新下载用）。 */
    localizeUrl,
  };

  /* BASE 必须保持「属性」形态，不能改成函数。
   *
   * app.js 有 5 处直接写 `AUTH.BASE`（APK 下载地址、上传地址、base 参数、
   * 版本检查、self 地址）。v1.1.12 出过一次「把字符串属性当函数调」的事故：
   * 写成 `AUTH.BASE()` 就抛 TypeError，而那一行在所有业务逻辑之前，
   * 于是整个入口从第一行就断了，界面上一个字都不会说。
   *
   * 用 getter 而不是固定值：双入口回退之后，地址是**运行期才知道**的
   * （探通哪个用哪个）。getter 让 `AUTH.BASE` 这种属性写法继续成立，
   * 同时每次读到的是当前真正可用的地址。 */
  Object.defineProperty(api, 'BASE', {
    enumerable: true,
    get: function () { return baseNow(); },
  });

  return api;
})();
