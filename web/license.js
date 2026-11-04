/* 河医大助手 - 授权
 *
 * v1.1.0 起**取消激活码**。原因与替代方案：
 *   - 旧机制：激活码 = HMAC-SHA256(密钥, 学号) 截断转 Base32。密钥打包在 APK 里，
 *     反编译就能算任意学号的码，「谁能用」实际上不可控。
 *   - 现机制：只填学号即可进入，身份真实性由**登录教务**来证明 ——
 *     青果用学号当登录名，能登进去说明他确实掌握该学号的密码。
 *     登录页里的 input#username 会被 WebView 读回来（见 WebActivity 的
 *     EXTRA_GRAB），与软件里登记的学号比对；不一致就提示并拒绝同步。
 *   - 学习通作为第二渠道：登录页 input#phone 的值可能是手机号，
 *     手机号无法判定身份，只记下来不拦。
 *
 * 码相关函数（codeFor/verify/normalizeCode）全部保留：管理员的发码器页面
 * 还用它们给同学算码，作为「谁是本校学生」的人工核对手段，不再参与授权。
 */
const LICENSE = (() => {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32（去掉 I L O U）
  const GROUP = 4;
  const GROUPS = 4;
  const CODE_LEN = GROUP * GROUPS; // 16

  /* 授权密钥。改这个值会让所有已发出的激活码失效 —— 改动前想清楚。 */
  const SECRET = 'XXMU-HELPER-GU-2026-v1';

  /* v0.9.8 起，这里**不再有任何管理员学号**。
   *
   * 为什么删掉（真实事故）：
   *   原来这里写着 ADMIN_IDS = ['20261440xxx']，命中就 set(K_STATE,'ADMIN') 直接放行，
   *   连激活码都不用填。任何人反编译 APK 就能看到这个学号，输入即可进入管理员界面，
   *   随后用抓到的管理口令在后台随意开卡。管理员身份是**服务端**的事，
   *   由 POST /v1/activate 带 akey 验证后签发 role='admin' 的票据，
   *   客户端只读票、不做判断。想改谁是管理员，改服务端 KV 的 adm: 名单即可，
   *   不需要重新发版。
   */
  const ADMIN_IDS = [];

  const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const c2 = str.charCodeAt(++i);
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return out;
  }

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  /** SHA-256，输入字节数组，返回 32 字节数组 */
  function sha256(bytes) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
               0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    const msg = bytes.slice();
    const bitLen = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    // 64 位长度，高 32 位对短消息恒为 0
    msg.push(0, 0, 0, 0);
    msg.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff,
             (bitLen >>> 8) & 0xff, bitLen & 0xff);

    const w = new Array(64);
    for (let off = 0; off < msg.length; off += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
               (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }

    const out = [];
    H.forEach((v) => {
      out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    });
    return out;
  }

  /** HMAC-SHA256 */
  function hmac(keyBytes, msgBytes) {
    let k = keyBytes.slice();
    if (k.length > 64) k = sha256(k);
    while (k.length < 64) k.push(0);
    const ipad = k.map((b) => b ^ 0x36);
    const opad = k.map((b) => b ^ 0x5c);
    return sha256(opad.concat(sha256(ipad.concat(msgBytes))));
  }

  /** 字节数组 -> Base32（自定义字母表） */
  function toBase32(bytes, chars) {
    let bits = 0, value = 0, out = '';
    for (let i = 0; i < bytes.length && out.length < chars; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5 && out.length < chars) {
        out += ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    return out;
  }

  /** 学号 -> 规范化激活码（16 位，含分隔符） */
  function codeFor(studentId) {
    const id = String(studentId || '').trim();
    if (!id) return '';
    const mac = hmac(utf8Bytes(SECRET), utf8Bytes(id));
    const raw = toBase32(mac, CODE_LEN);
    return raw.match(new RegExp('.{1,' + GROUP + '}', 'g')).join('-');
  }

  /** 用户输入的码 -> 去掉分隔符、转大写、纠正常见误输入 */
  function normalizeCode(input) {
    return String(input || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .replace(/O/g, '0')   // Crockford 字母表里没有 O/I/L/U
      .replace(/[IL]/g, '1')
      .replace(/U/g, 'V');
  }

  function verify(studentId, input) {
    const want = normalizeCode(codeFor(studentId));
    const got = normalizeCode(input);
    if (!want || !got) return false;
    if (got.length !== want.length) return false;
    // 定长比较，避免早退泄露前缀
    let diff = 0;
    for (let i = 0; i < want.length; i++) {
      diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    }
    return diff === 0;
  }

  function isAdmin(studentId) {
    return ADMIN_IDS.indexOf(String(studentId || '').trim()) >= 0;
  }

  /* ---- 状态存取（Host Prefs 优先，浏览器回退 localStorage）---- */

  const K_STATE = 'xxmu_license';
  const K_ID = 'xxmu_license_id';
  const K_VERIFIED = 'xxmu_verified';
  const K_ACCT_KB = 'xxmu_acct_kb';
  const K_ACCT_CX = 'xxmu_acct_cx';

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

  /** 本地是否「已登记」。
   *
   *  v1.1.0 起取消激活码：不再有「码对不对」这一层，只要求填一个学号。
   *  真正证明「这个学号是你的」改为**登录教务**——青果用学号当登录名，
   *  能登进去就说明他掌握该学号的密码，比任何离线可算的码都硬。
   *  所以这里的语义从「已激活」变成了「已登记学号」，名字留着不动是为了
   *  不牵动 auth.js / app.js / about.js 里另外十几处调用点。
   *
   *  旧版本落下的 xxmu_license（本地码）一律忽略：码已经不用了。
   */
  function isActivated() {
    const id = get(K_ID);
    if (!id) return false;
    /* v1.1.8：光「非空」不够。这一层的性质是「登记过」而不是「验证过」，
     * 任何人都能往 pref 里写东西（开发工具、备份还原、别的机器拷来的配置），
     * 写进去一个「账号」「undefined」「null」也会被当成登记成功，
     * 后面所有用到学号的地方（设备名额、反馈署名、核对记录）就都拿它当真。
     * 只认 6-20 位数字 —— 与 activate() 的校验保持一致，不额外收紧口径。 */
    return /^\d{6,20}$/.test(String(id).trim());
  }

  /** 登记学号（不再校验激活码）。码相关函数保留，管理员发码器还在用。 */
  function activate(studentId, input) {
    const id = String(studentId || '').trim();
    if (!id) return { ok: false, error: '请先填写学号' };
    if (!/^\d{6,20}$/.test(id)) return { ok: false, error: '学号格式不对（应为 6-20 位数字）' };
    /* 换了学号就把上一轮的核对记录扔掉。
     * 刘雨鹭那个案子（m00005）：先填朋友的学号、登录过教务，再改回自己的号，
     * 这时 K_ACCT_KB 里还留着朋友的号，新学号一进来就「对不上」，又拦一次。
     * 核对记录是「这个学号 ↔ 那个教务账号」的绑定，学号一变就该作废。 */
    const old = get(K_ID);
    if (old && old !== id) {
      set(K_ACCT_KB, '');
      set(K_ACCT_CX, '');
      set(K_VERIFIED, '');
    }
    set(K_ID, id);
    // 老版本可能留着 xxmu_license，这里主动清掉，避免 isActivated 的旧判据复活
    set(K_STATE, '');
    return { ok: true };
  }

  function deactivate() {
    set(K_ID, '');
    set(K_STATE, '');
    set(K_VERIFIED, '');
    set(K_ACCT_KB, '');
    set(K_ACCT_CX, '');
  }

  /** 只记录「当前是谁」，不表示已激活。
   *  管理员走这条路：他手上没有激活码，凭服务端签发的票据进去。 */
  function setUser(studentId, code) {
    set(K_ID, String(studentId || '').trim());
    if (code) set(K_STATE, normalizeCode(code));
  }

  /** 只清「学号核对」那三样记录，其余一概不动。
   *
   *  为什么需要这个粒度：v1.1.1 之前，一旦核对记录是错的，用户唯一的出路是
   *  「退出本机账号」或「重新填学号」—— 两条路都会把课表缓存、教务 cookie
   *  一起冲掉，代价远大于问题本身。核对记录本来就只是三个 pref 值，单独清
   *  干净就够了，而且清完下一次登录教务就会重新写一份正确的。 */
  function clearCheck() {
    set(K_ACCT_KB, '');
    set(K_ACCT_CX, '');
    set(K_VERIFIED, '');
  }

  /** 当前登记的学号。不合法的值一律当没登记（见 isActivated 的注释）。 */
  function whoami() {
    const id = String(get(K_ID) || '').trim();
    return /^\d{6,20}$/.test(id) ? id : '';
  }

  /* ---- 学号一致性：从教务/学习通页面里读到的真实账号 ---- */

  /** 这些字符串不是账号，是登录页的占位提示。
   *
   *  v1.1.2 的坑：青果登录页可见的 input#username1 是装饰框，HTML 里写死
   *  value="账号"。旧版把它的值当账号记了下来，于是「教务账号=账号」，
   *  和真实学号永远不等，同步被永久拦截，而每轮登录还会再写一次。
   *  Java 侧已经加了同名的过滤（WebActivity.PLACEHOLDER_WORDS），这里再兜
   *  一层：pref 里已经被污染的旧值要能自动洗掉，不能等用户重装。
   */
  const PLACEHOLDER_WORDS = [
    '账号', '帐号', '学号', '用户名', '用户', '请输入账号', '请输入帐号',
    '请输入学号', '请输入用户名', '密码', '请输入密码', '手机号',
    '请输入手机号', 'account', 'username', 'user', 'password', 'phone',
  ];

  /** 这个值看起来像不像一个真账号？不像就当「没读到」。 */
  function looksLikeAccount(v) {
    const s = String(v || '').trim();
    if (!s) return false;
    const low = s.toLowerCase();
    for (let i = 0; i < PLACEHOLDER_WORDS.length; i++) {
      if (low === PLACEHOLDER_WORDS[i].toLowerCase()) return false;
    }
    // 青果的登录名就是学号；学习通那边可能是手机号。两条都放行，
    // 其他形态（纯符号、纯中文）一律不认。
    return /^\d{6,20}$/.test(s);
  }

  /** 记下「用户的教务账号」，并返回它与软件账号是否一致。
   *  空值表示没读到（学校改版、或用户用了别的登录方式），一律不判不一致。 */
  function noteKbAccount(acct) {
    const a = String(acct || '').trim();
    if (!looksLikeAccount(a)) {
      // 读到的是占位提示/垃圾值：不要写进 pref，否则会覆盖上一次的真账号。
      // 但要把历史上被污染的值清掉，让下一轮同步能正常走。
      if (get(K_ACCT_KB) && !looksLikeAccount(get(K_ACCT_KB))) set(K_ACCT_KB, '');
      return { ok: true, unknown: true, acct: '' };
    }
    set(K_ACCT_KB, a);
    const id = whoami();
    if (!id) return { ok: true, unknown: true, acct: a };
    const ok = a === id;
    if (ok) set(K_VERIFIED, id);
    else set(K_VERIFIED, '');
    return { ok: ok, unknown: false, acct: a, id: id };
  }

  /** 记下学习通那边读到的账号。学习通登录名是「手机号或学号」二合一，
   *  拿到 11 位手机号时无法判定身份，只能记为 unknown。 */
  function noteCxAccount(acct) {
    const a = String(acct || '').trim();
    if (!looksLikeAccount(a)) {
      if (get(K_ACCT_CX) && !looksLikeAccount(get(K_ACCT_CX))) set(K_ACCT_CX, '');
      return { ok: true, unknown: true, acct: '' };
    }
    set(K_ACCT_CX, a);
    const id = whoami();
    if (!a || !id) return { ok: true, unknown: true, acct: a };
    const isPhone = /^1\d{10}$/.test(a);
    if (isPhone) return { ok: true, unknown: true, phone: true, acct: a };
    return { ok: a === id, unknown: false, acct: a, id: id };
  }

  /** 教务账号是否已验证与软件学号一致 */
  function verified() {
    const v = get(K_VERIFIED);
    return !!v && v === get(K_ID);
  }

  function accounts() {
    /* 出口再洗一次：老版本装过的手机，pref 里可能正躺着「账号」这个脏值，
     * 不清掉的话用户升级完照样卡在「学号对不上」那一页。 */
    const kbRaw = get(K_ACCT_KB);
    const kb = looksLikeAccount(kbRaw) ? kbRaw : '';
    if (kbRaw && !kb) set(K_ACCT_KB, '');
    const cxRaw = get(K_ACCT_CX);
    const cx = looksLikeAccount(cxRaw) ? cxRaw : '';
    if (cxRaw && !cx) set(K_ACCT_CX, '');
    return {
      /* 用 whoami() 而不是 get(K_ID)：这条记录里混进「账号」这种脏值时，
       * 上游拿它去和 acc.kb 比就会得出「学号对不上」的假结论。 */
      id: whoami(),
      kb: kb,
      cx: cx,
      verified: verified(),
    };
  }

  return {
    codeFor, verify, normalizeCode,
    isAdmin, isActivated, activate, deactivate, setUser, whoami,
    noteKbAccount, noteCxAccount, verified, accounts, looksLikeAccount,
    clearCheck,
    sha256, hmac, toBase32,
    SECRET_PLACEHOLDER: true,
    ADMIN_IDS,
    K_VERIFIED, K_ACCT_KB, K_ACCT_CX,
  };
})();
