/* 河医大助手 · 知到（智慧树）适配器（v1.1.80 · 方案 C 双探针诊断版 · 定 B 主线接活）
 *
 * ================== 沿革 ==================
 * v1.1.78 方案 C 双探针起步（探针 A 读官方作业页 DOM / 探针 B 纯 JS AES 直连
 * 两个只读端点）。v1.1.79 修登录链路：okHints 换成永不命中的 OK_SENTINEL
 * （只认用户点右上角「完成」）、独立 AUTH_KEY 真登录判据、覆盖 window[CB]
 * 回跳验 cookie 才写真登录，从根上杜绝「登录页一闪就关 → 没真登录盲发探针
 * → 全 401」——从此不再自动秒关。
 *
 * ================== v1.1.80 做什么 ==================
 * YG 的 v1.1.79 模式 B 真机诊断坐实：课程列表返回 {result:{totalCount:0,
 * courseOpenDtos:null},code:200,...}、作业清单返回 {code:500,message:
 * "For input string: \"\""} —— 两条都是服务端成功解密 secretStr 之后才给得出
 * 的正常响应（500 是 Java 对空 recruitId 做 parseInt 炸的，不是解密失败），
 * 登录也不再 401 → AES 密钥 / 端点 / cookie 三样全活。真凶只剩课程列表的
 * 请求体字段名：v1.1.79 发的 {pageSize:5,pageNum:0,status:0} 是错的。
 * 据 pjm314159/zhs 的 src/zhs/zhidao/course.py 逐字复刻：
 *   课程列表请求体 {status:0, pageNo:1, pageSize:5}（pageNo 从 1 起）
 *   成功判据 j.code===200，数据在 j.result.courseOpenDtos（不是 rt.shareCourseList）
 *   分页按 j.result.totalCount 循环 data.pageNo = p
 *   课程对象 recruitId(独立数字) / courseId(顶层) / courseInfo.courseId(下探，
 *     即 extract_course_id 口径：顶层 courseId>0 否则 courseInfo.courseId)
 *   作业清单请求体 {recruitId, courseId, flag(1未交/2已交), pageSize:100, pageNum:0}
 *   成功判据 status=='200'，取 rt.studentHomeworkList[]
 * 顺手删掉纯多余的 CAS 换票 GET（cookie 登录 WebView 时已种好，真机 404）。
 * 无课程就如实报「本学期没抽到课程」，绝不拿空 recruitId 占位去造那个 500。
 * 各门课都成功返回空清单字段才算「当前没待办」，认不出字段一律 degraded。
 * 默认模式切到 B（接口直连）作主线，A（读作业页）保留作兜底。
 *
 * ================== 只读红线 ==================
 * 写端点（saveCourseTran / doHomework / saveStudentAnswer / submit）一律不碰；
 * 解析不出报 degraded，绝不把「没认出来」冒充「没作业」；
 * 每一步的 URL / HTTP code / 响应 status / 响应骨架都记进诊断，据实定位。
 *
 * ================== 活接口速查 ==================
 * 课程 POST https://onlineservice-api.zhihuishu.com/gateway/t/v1/student/course/share/queryShareCourseInfo
 * 作业 POST https://studentexam-api.zhihuishu.com/studentExam/gateway/t/v1/student/getStudentHomework
 * 请求形状：POST form 单字段 secretStr = Base64(AES-128-CBC(JSON(请求体), PKCS7))
 *   iv = 1g3qqdh4jvbskb9x，home_key = 7q9oko0vqb3la20r（课程），
 *   exam_key = onbfhdyvz8x7otrp（作业/考试）；contentType=application/x-www-form-urlencoded
 * 作业每项：courseName / examName / endDate / startTime / state(1未交 4已交 5重置)
 * A 探针 H5 页 https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList
 */
(function () {
  'use strict';

  var HOME = 'https://online.zhihuishu.com/';
  var PASSPORT = 'https://passport.zhihuishu.com';
  var API_HOME = 'https://onlineservice-api.zhihuishu.com';
  var API_HW = 'https://studentexam-api.zhihuishu.com';
  var H5 = 'https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList';
  var LOGIN_URL = 'https://onlineweb.zhihuishu.com/';
  var COURSE_API = API_HOME + '/gateway/t/v1/student/course/share/queryShareCourseInfo';
  var HW_API = API_HW + '/studentExam/gateway/t/v1/student/getStudentHomework';

  var KEY = 'xxmu_zhs_todo';
  var MODE_KEY = 'xxmu_zhs_mode';        // 'A' | 'B'
  var FIND_KEY = 'xxmu_zhs_find';        // A 探针页面快照
  /* v1.1.79：真登录判据独立成键，不认 v1.1.78 秒关写下的假 __bound。
   * 只有用户在登录 WebView 里点右上角「完成」、且确实带回了登录态，
   * 回跳才写 AUTH_KEY='1'；没这个值一律当没登录，不盲发探针。 */
  var AUTH_KEY = 'xxmu_zhs_auth';
  /* 哨兵：登录页与登录成功后的所有已知 URL 都不含这串。isLoggedInUrl 的
   * okHints 命中才自动判成功 → 给一个永不命中的值 = 永不自动秒关，
   * 登录完成只认用户点「完成」按钮（WebActivity.finishWithResult(true)）。 */
  var OK_SENTINEL = '/__xxmu_zhs_manual_done__/';
  var IV = '1g3qqdh4jvbskb9x';
  var HOME_KEY = '7q9oko0vqb3la20r';
  var EXAM_KEY = 'onbfhdyvz8x7otrp';

  /* ================= AES-128-CBC（纯 JS，file:// WebView 可跑）=================
   * 不依赖 Web Crypto（file:// 下 crypto.subtle 常被禁），也不改 Java。
   * 标准实现：S-box + KeyExpansion + 10 轮 + CBC + PKCS7 + Base64。
   * test_zhihuishu.js 用 Node crypto 交叉验同一明文/密钥/iv，保证没写错。 */
  var SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
  ];

  function xtime(a) { a &= 255; return (a & 0x80) ? (((a << 1) ^ 0x1b) & 255) : ((a << 1) & 255); }
  function gmul3(a) { return (a ^ xtime(a)) & 255; }

  function expandKey(key) {                 // 16-byte key -> 176-byte round keys
    var w = new Array(176), i, t0, t1, t2, t3, tmp, rcon = 1;
    for (i = 0; i < 16; i++) w[i] = key[i] & 255;
    for (i = 16; i < 176; i += 4) {
      t0 = w[i - 4]; t1 = w[i - 3]; t2 = w[i - 2]; t3 = w[i - 1];
      if (i % 16 === 0) {
        tmp = t0;
        t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[tmp];
        rcon = xtime(rcon);
      }
      w[i]     = (w[i - 16] ^ t0) & 255;
      w[i + 1] = (w[i - 15] ^ t1) & 255;
      w[i + 2] = (w[i - 14] ^ t2) & 255;
      w[i + 3] = (w[i - 13] ^ t3) & 255;
    }
    return w;
  }

  function addRoundKey(s, w, off) { for (var i = 0; i < 16; i++) s[i] ^= w[off + i]; }

  function shiftRows(s) {
    var o = new Array(16), r, c;
    for (r = 0; r < 4; r++) for (c = 0; c < 4; c++) o[r + 4 * c] = s[r + 4 * ((c + r) % 4)];
    return o;
  }

  function mixColumns(s) {
    var o = new Array(16), c, a0, a1, a2, a3;
    for (c = 0; c < 4; c++) {
      a0 = s[4 * c]; a1 = s[4 * c + 1]; a2 = s[4 * c + 2]; a3 = s[4 * c + 3];
      o[4 * c]     = xtime(a0) ^ gmul3(a1) ^ a2 ^ a3;
      o[4 * c + 1] = a0 ^ xtime(a1) ^ gmul3(a2) ^ a3;
      o[4 * c + 2] = a0 ^ a1 ^ xtime(a2) ^ gmul3(a3);
      o[4 * c + 3] = gmul3(a0) ^ a1 ^ a2 ^ xtime(a3);
    }
    return o;
  }

  function encryptBlock(block, w) {
    var s = block.slice(0), r, i;
    addRoundKey(s, w, 0);
    for (r = 1; r <= 10; r++) {
      for (i = 0; i < 16; i++) s[i] = SBOX[s[i]];
      s = shiftRows(s);
      if (r < 10) s = mixColumns(s);
      addRoundKey(s, w, r * 16);
    }
    return s;
  }

  function utf8Bytes(str) {
    var out = [], i, c, c2, cp;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        c2 = str.charCodeAt(i + 1);
        cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        i++;
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function asciiBytes(s) { var o = [], i; for (i = 0; i < s.length; i++) o.push(s.charCodeAt(i) & 255); return o; }

  function b64(bytes) {
    var T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var s = '', i, b0, b1, b2;
    for (i = 0; i < bytes.length; i += 3) {
      b0 = bytes[i]; b1 = bytes[i + 1]; b2 = bytes[i + 2];
      s += T[b0 >> 2];
      s += T[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
      s += (b1 === undefined) ? '=' : T[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
      s += (b2 === undefined) ? '=' : T[b2 & 63];
    }
    return s;
  }

  function aesCbc(plain, keyStr) {
    var data = utf8Bytes(plain), pad = 16 - (data.length % 16), i;
    for (i = 0; i < pad; i++) data.push(pad);
    var w = expandKey(asciiBytes(keyStr)), prev = asciiBytes(IV), out = [], b, j, block;
    for (b = 0; b < data.length; b += 16) {
      block = data.slice(b, b + 16);
      for (j = 0; j < 16; j++) block[j] ^= prev[j];
      prev = encryptBlock(block, w);
      out = out.concat(prev);
    }
    return b64(out);
  }

  function secretStr(obj, keyStr) { return aesCbc(JSON.stringify(obj), keyStr); }

  /* AES 自检：固定明文 {"a":1} + exam_key 应得 24 字符合法 base64。
   * 写进诊断，真机一眼能看出纯 JS 加密有没有坏。 */
  function aesSelfTest() {
    try {
      var v = secretStr({ a: 1 }, EXAM_KEY);
      return /^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length === 24
        ? 'AES 自检通过（24 字符）' : 'AES 自检形状异常：' + v;
    } catch (e) { return 'AES 自检抛错：' + e; }
  }

  /* ================= 基础设施（仿 yuketang.js）================= */
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function str(v) { return (typeof v === 'string' || typeof v === 'number') ? String(v) : ''; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function rec(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function ownKeys(o) { var r = [], k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r.push(k); return r; }

  function skeleton(root, depth) {
    depth = depth == null ? 2 : depth;
    function walk(v, d) {
      if (v == null) return String(v);
      if (Array.isArray(v)) return '[' + v.length + ']' + (d > 0 && v.length ? '{' + walk(v[0], d - 1) + '}' : '');
      if (typeof v === 'object') {
        if (d <= 0) return '{' + ownKeys(v).length + '键}';
        var parts = [], ks = ownKeys(v).slice(0, 12), i;
        for (i = 0; i < ks.length; i++) parts.push(ks[i] + ':' + walk(v[ks[i]], d - 1));
        return '{' + parts.join(',') + '}';
      }
      return typeof v === 'string' ? '"' + v.slice(0, 24) + '"' : String(v);
    }
    return walk(root, depth);
  }

  function fmt(ms) {
    if (!ms) return '';
    var t = String(ms).trim();
    if (/^\d+$/.test(t)) { var n = Number(t); if (n < 1e12) n *= 1000; ms = n; }
    var d = new Date(ms);
    if (isNaN(d.getTime())) return t;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function deepArray(root, match, maxDepth) {
    maxDepth = maxDepth || 5;
    var found = [];
    function scan(v, d) {
      if (found.length >= 8 || d > maxDepth || v == null) return;
      if (Array.isArray(v)) {
        if (v.length && match(v)) { found.push(v); return; }
        for (var i = 0; i < v.length && i < 20; i++) scan(v[i], d + 1);
      } else if (typeof v === 'object') {
        var ks = ownKeys(v);
        for (var j = 0; j < ks.length; j++) scan(v[ks[j]], d + 1);
      }
    }
    scan(root, 0);
    return found;
  }

  function parseJson(text) { try { return JSON.parse(text); } catch (e) { return null; } }

  /* 状态词对齐 CX.classify（web/chaoxing.js:54/59/68）：
   * 1/5 未交/重置 → '待做'(open)，4 已交 → '已提交'(done)，其余留空不装懂。 */
  function stateWord(st) {
    var n = num(st);
    if (n === 1 || n === 5) return '待做';
    if (n === 4) return '已提交';
    return '';
  }

  function itemOf(d) {
    var course = str(d.courseName), name = str(d.examName);
    if (!name && !course) return null;
    var st = stateWord(d.state);
    return {
      course: course, name: name || course,
      end: fmt(d.endDate), start: fmt(d.startTime),
      status: st, status_known: !!st, source: 'zhihuishu'
    };
  }

  /* ================= 登录态（v1.1.79 真登录判据）=================
   * v1.1.78 认 KEY+'__bound' 当已登录，但登录 WebView 被 okHints 秒关时
   * 也会写这个键 → 没真登录却恒判「已登录」。本版只认 AUTH_KEY：只有用户在
   * 登录页点右上角「完成」、回跳验到 cookie 才写，且 logout 一并清掉。 */
  function authed() { try { return XXMU.pref(AUTH_KEY) === '1'; } catch (e) { return false; } }
  function hasCookie() {
    try {
      if (typeof Host !== 'undefined' && Host.hasCookieFor) {
        return Host.hasCookieFor(HOME) || Host.hasCookieFor(API_HOME + '/')
          || Host.hasCookieFor(PASSPORT + '/') || Host.hasCookieFor(API_HW + '/');
      }
    } catch (e) {}
    return false;
  }
  function loggedIn() { return authed() && hasCookie(); }

  var CB = '__onSrcDone_zhihuishu';
  /* okHints 用永不命中的哨兵：登录页/业务页都不会自动判成功，杜绝秒关。
   * 登录完成只认用户点右上角「完成」按钮（finishWithResult(true)）。 */
  function curOpenLogin() {
    if (typeof Host !== 'undefined' && Host.openLoginFor) {
      Host.openLoginFor(LOGIN_URL, '登录知到（智慧树）',
        '/login||passport||/signin||/qrcode||/bind',
        OK_SENTINEL, '', CB);
    }
  }
  function curLogout() {
    try { XXMU.pref(AUTH_KEY, ''); } catch (e) {}
    try { XXMU.pref(FIND_KEY, ''); } catch (e) {}
    try { XXMU.pref(KEY + '__bound', ''); } catch (e) {}
  }

  /* ================= A 探针：页面快照 =================
   * openFinderFor 打开官方作业考试页（真实 WebView，能看到渲染后的 DOM），
   * WebActivity 的 FIND_JS 回跳把页面结构交给 __onZhsFind；这里只存快照，
   * 解析放到 fetch 里做，认不出就摊进诊断，绝不冒充清单。 */
  window.__onZhsFind = function (txt) {
    try { XXMU.pref(FIND_KEY, String(txt || '').slice(0, 200000)); } catch (e) {}
    if (window.SrcUI && SrcUI.sync) SrcUI.sync('zhihuishu', true);
  };
  function openA() {
    if (typeof Host !== 'undefined' && Host.openFinderFor) {
      Host.openFinderFor(H5, '知到 · 打开「作业考试」页，看到清单后按完成/返回', '__onZhsFind');
    } else {
      curOpenLogin();
    }
  }

  function parseA(snapText, diag) {
    var snap = parseJson(snapText);
    if (!snap) { diag.push('A 快照不是 JSON，长度 ' + String(snapText || '').length); return []; }
    diag.push('A 快照键：' + ownKeys(snap).join(',')
      + '；frames=' + arr(snap.frames).length + '，tables=' + arr(snap.tables).length);
    var lists = deepArray(snap, function (a) {
      var r = rec(a[0]);
      return !!(r.examName || r.courseName || r.homeworkName || r.name);
    }, 6);
    var works = [], seen = {}, i, j, d, w, k;
    for (i = 0; i < lists.length; i++) {
      for (j = 0; j < lists[i].length; j++) {
        d = rec(lists[i][j]);
        w = itemOf(d) || (function () {
          var nm = str(d.name || d.homeworkName);
          if (!nm) return null;
          return { course: str(d.courseName), name: nm, end: fmt(d.endDate || d.endTime),
            start: '', status: '', status_known: false, source: 'zhihuishu' };
        })();
        if (!w) continue;
        k = w.course + '|' + w.name;
        if (seen[k]) continue;
        seen[k] = 1; works.push(w);
      }
    }
    if (!works.length) {
      var t = String(snap.text || snap.raw || '').replace(/\s+/g, ' ').slice(0, 300);
      diag.push('A 快照未认出清单条目；页面文字预览：' + t);
    }
    return works;
  }

  /* ================= B 探针：AES 直连只读端点 ================= */
  function post(url, dataObj, keyStr, cookieUrl) {
    var body = 'secretStr=' + encodeURIComponent(secretStr(dataObj, keyStr));
    return SOURCES.http(url, {
      cookieUrl: cookieUrl, referer: HOME,
      method: 'POST', body: body,
      contentType: 'application/x-www-form-urlencoded'
    });
  }
  function codeOf(b) { return b ? (b.code || (b.ok ? 200 : -1)) : -1; }
  function bodyOf(b) { return b ? String(b.text || '') : ''; }

  /* extract_course_id 口径（src/zhs/zhidao/models.py）：顶层 courseId>0 用它，
   * 否则下探 courseInfo.courseId，都没有则 0（这门课没法查作业，跳过）。 */
  function courseIdOf(d) {
    var top = num(d.courseId);
    if (top > 0) return top;
    var nested = num(rec(d.courseInfo).courseId);
    return nested > 0 ? nested : 0;
  }
  /* v1.1.80：直接吃 j.result.courseOpenDtos 数组，不再 deepArray 猜层级
   * （lesson 0mwcba4kz：认准 code=200 后的确切字段，认不出把骨架进诊断）。
   * recruitId 是独立数字字段（worker.py 印证从课程拆出逐请求传），缺它就跳过，
   * 绝不拿空串去发作业请求（真机会被服务端 parseInt 炸成 For input string: ""）。 */
  function packCourses(list, diag, seen) {
    seen = seen || {};
    var out = [], i, d, rid, cid, skipped = 0;
    for (i = 0; i < list.length; i++) {
      d = rec(list[i]);
      rid = str(d.recruitId); cid = courseIdOf(d);
      if (!cid || !rid) { skipped++; continue; }
      if (seen[cid + '|' + rid]) continue;
      seen[cid + '|' + rid] = 1;
      out.push({ recruitId: rid, courseId: cid,
        name: str(d.courseName || rec(d.courseInfo).name || '') });
    }
    if (skipped) diag.push('课程列表有 ' + skipped
      + ' 门课没抽出有效的 recruitId/courseId（字段名据骨架复验）。');
    return out;
  }

  /* 作业清单：status==='200' 且 rt.studentHomeworkList 是数组才算「读通」。
   * 空数组 = 平台明确说这门课没有待交作业（可信空），字段缺失 = 没认出。
   * 这样区分「平台说没作业」与「我没解析出来」，绝不把后者冒充成前者。 */
  function hwResponseOk(j) {
    return str(j.status) === '200' && Array.isArray(rec(j.rt).studentHomeworkList);
  }
  function packHomeworks(result) {
    var rt = rec(result).rt, list = arr(rec(rt).studentHomeworkList);
    if (!list.length) {
      /* 字段名变了就按形状下探找数组（lesson 0mwcba4kz），但只在真有条目时
       * 生效；空清单的「可信空」判据仍由 hwResponseOk 严格把关。 */
      var ls = deepArray(result, function (a) {
        var r = rec(a[0]); return !!(r.examName || r.courseName);
      }, 6);
      if (ls.length) list = ls[0];
    }
    return list;
  }

  function fetchB(step, diag) {
    var PAGE_SIZE = 5, MAX_PAGES = 20;
    var allCourses = [], seen = {}, total = 0, pages = 0;

    /* 读一页课程：据 course.py 用 {status:0,pageNo:p,pageSize:5}，认业务
     * code===200，数据在 result.courseOpenDtos，总数字段 result.totalCount。 */
    function coursePage(p) {
      step('B 探针 · 读课程列表（第 ' + p + ' 页）');
      return post(COURSE_API, { status: 0, pageNo: p, pageSize: PAGE_SIZE },
        HOME_KEY, API_HOME + '/').then(function (r) {
        var j = parseJson(bodyOf(r)) || {}, bizCode = j.code;
        diag.push('课程列表 POST(pageNo=' + p + ') → HTTP code=' + codeOf(r)
          + '，业务 code=' + str(bizCode) + '，骨架=' + skeleton(j, 3));
        var result = rec(j.result);
        if (p === 1) total = num(result.totalCount);
        packCourses(arr(result.courseOpenDtos), diag, seen)
          .forEach(function (c) { allCourses.push(c); });
        return num(bizCode) === 200;
      }, function (e) {
        diag.push('课程列表 POST(pageNo=' + p + ') 失败：' + (e && e.error ? e.error : e));
        return false;
      });
    }

    /* 串行翻页：首页拿到 totalCount 后按 ceil(total/pageSize) 补后续页。 */
    function readAllCourses() {
      return coursePage(1).then(function (ok1) {
        if (!ok1) return false;
        var n = Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE));
        var chain = Promise.resolve(true), p;
        for (p = 2; p <= n; p++) {
          (function (pp) {
            chain = chain.then(function (prev) {
              return coursePage(pp).then(function (x) { return prev && x; });
            });
          })(p);
        }
        pages = Math.max(1, n);
        return chain;
      });
    }

    return readAllCourses().then(function (courseOk) {
      if (!courseOk) {
        return finish([], step, diag,
          'B 探针没读通课程列表（业务 code 不是 200 或请求失败）。诊断里记了每页 '
          + 'HTTP code / 业务 code / 响应骨架，据骨架可复验 result.courseOpenDtos '
          + '与 result.totalCount 的字段名。接口只读，不会替你交作业。');
      }
      if (!allCourses.length) {
        diag.push('课程列表共 ' + pages + ' 页、totalCount=' + total
          + '，但没抽到带有效 recruitId/courseId 的课程——本学期可能还没选课/没开课，'
          + '或字段名与骨架对不上。据此不拿空课程号去试发作业清单'
          + '（那只会得到 For input string: "" 的假 500）。');
        return finish([], step, diag,
          'B 探针读通了课程列表，但这学期没抽到课程（或课程字段没认出来）。'
          + '复制诊断可看到课程列表骨架；接口只读，不会替你交作业。');
      }

      /* 逐课 × flag(1 未交 / 2 已交) 发作业清单；请求体沿用 pageNum:0，
       * 与 src/zhs/api/encrypted_query.py 的 homework 策略一致（不发 dateFormate）。 */
      var tasks = [], i, f, co;
      for (i = 0; i < Math.min(allCourses.length, 8); i++) {
        co = allCourses[i];
        for (f = 1; f <= 2; f++) {
          (function (c, flag) {
            tasks.push(post(HW_API, {
              recruitId: c.recruitId, courseId: c.courseId,
              flag: flag, pageSize: 100, pageNum: 0
            }, EXAM_KEY, API_HW + '/').then(function (r) {
              var j = parseJson(bodyOf(r)) || {};
              diag.push('作业清单 POST(flag=' + flag + ',course=' + c.courseId
                + ',recruit=' + c.recruitId + ') → HTTP code=' + codeOf(r)
                + '，status=' + str(j.status) + '，骨架=' + skeleton(j, 3));
              return { j: j, co: c, flag: flag };
            }, function (e) {
              diag.push('作业清单 POST(flag=' + flag + ',course=' + c.courseId
                + ') 失败：' + (e && e.error ? e.error : e));
              return { j: {}, co: c, flag: flag };
            }));
          })(co, f);
        }
      }
      return tasks.reduce(function (chain, task) {
        return chain.then(function (acc) { return task.then(function (x) { acc.push(x); return acc; }); });
      }, Promise.resolve([]));
    })
      .then(function (resps) {
        /* 课程失败/空课程时 finish() 已返回汇总对象（非数组），直接透传。 */
        if (!Array.isArray(resps)) return resps;
        var works = [], seenW = {}, i, j, list, w, k, got = 0, bad = 0, readable = {}, key;
        for (i = 0; i < resps.length; i++) {
          key = resps[i].co.courseId + '|' + resps[i].co.recruitId;
          if (readable[key] === undefined) readable[key] = true;
          if (!hwResponseOk(resps[i].j)) { readable[key] = false; bad++; continue; }
          list = packHomeworks(resps[i].j);
          if (list.length) got++;
          for (j = 0; j < list.length; j++) {
            w = itemOf(rec(list[j]));
            if (!w) continue;
            if (resps[i].co.name && !w.course) w.course = resps[i].co.name;
            k = w.course + '|' + w.name;
            if (seenW[k]) continue;
            seenW[k] = 1; works.push(w);
          }
        }
        var keys = ownKeys(readable);
        var readCount = keys.filter(function (kk) { return readable[kk]; }).length;
        var allReadable = keys.length > 0 && readCount === keys.length;
        diag.push('作业清单共 ' + resps.length + ' 次请求，' + got
          + ' 次带非空 studentHomeworkList，' + bad + ' 次没按 status=200 读通，'
          + '抽出 ' + works.length + ' 条；' + keys.length + ' 门课里 ' + readCount
          + ' 门两档都读通。');
        if (works.length) return finish(works, step, diag, '');
        if (allReadable) {
          /* 每门课都明确回了 status='200' + 空 studentHomeworkList：这是平台
           * 亲口说的「当前没有待交作业」，不是解析失败，给一个诚实的空 ok 清单。 */
          step('各门课都读通，平台确认当前没有待交作业');
          return { state: 'ok', works: [], exams: [],
            synced_at: Math.floor(Date.now() / 1000), diag: diag.join('\n') };
        }
        return finish([], step, diag,
          'B 探针有课程没读通作业清单（status 不是 200 或没返回 studentHomeworkList 数组）。'
          + '这时不能把「没解析出来」当作「没作业」；诊断里记了每门课每次的 '
          + 'HTTP code / status / 骨架，据实复验。接口只读，不会替你交作业。');
      });
  }

  /* ================= fetch 汇总 ================= */
  function finish(works, step, diag, emptyErr) {
    if (works && works.length) {
      step('认出 ' + works.length + ' 条待办');
      return { state: 'ok', works: works, exams: [],
        synced_at: Math.floor(Date.now() / 1000), diag: diag.join('\n') };
    }
    step('这一轮没认出清单，出诊断');
    return { state: 'degraded', error: emptyErr, diag: diag.join('\n') };
  }

  function fetchA(step, diag) {
    step('A 探针 · 探官方作业考试页');
    return SOURCES.http(H5, { cookieUrl: HOME, referer: HOME, method: 'GET' })
      .then(function (r) {
        var t = bodyOf(r);
        diag.push('H5 页 GET → code=' + codeOf(r) + '，长度 ' + t.length
          + '，含 webExamList=' + (/webExamList/.test(t))
          + '，含 studentHomework=' + (/studentHomework/i.test(t)));
      }, function () { diag.push('H5 页 GET 失败（继续读本地快照）'); })
      .then(function () {
        var snap = '';
        try { snap = XXMU.pref(FIND_KEY) || ''; } catch (e) {}
        diag.push('本地 A 快照长度 ' + snap.length
          + (snap ? '' : '（还没点过「打开知到作业页」，或桥没回跳）'));
        var works = snap ? parseA(snap, diag) : [];
        return finish(works, step, diag,
          'A 探针这一轮没从页面里认出「未上交/已上交」清单。请先点卡片上的'
          + '「打开知到作业页」进去看到清单，再回来点「重新抓一次」；本版会把页面骨架'
          + '记进诊断（复制诊断可见），下一版据此钉死 DOM 结构。也可切到 B 探针试接口。');
      });
  }

  function fetchTodo(onStep) {
    var step = typeof onStep === 'function' ? onStep : function () {};
    var diag = [];
    diag.push('知到 v1.1.80 诊断包 · 模式 ' + mode() + ' · ' + aesSelfTest()
      + '（登录已改为点右上角「完成」才生效，不再自动秒关）');
    if (mode() === 'B') {
      diag.push('B 探针（主线）说明：课程列表按 pageNo/status/pageSize、认业务 code=200、'
        + '读 result.courseOpenDtos；作业清单认 status=200、读 rt.studentHomeworkList。'
        + '每一步都记了 URL/HTTP code/业务字段/骨架，据实复验。接口只读，不会替你交作业。');
    }
    if (!loggedIn()) {
      return Promise.resolve({ state: 'degraded',
        error: '还没登录知到。先点「登录 / 重新登录知到」，用学校账号或扫码登进去，'
          + '登进去后点右上角「完成」，再回来刷新。',
        diag: diag.join('\n') });
    }
    step(mode() === 'A' ? 'A 探针：读官方作业页' : 'B 探针：直连只读接口');
    return (mode() === 'A' ? fetchA(step, diag) : fetchB(step, diag))
      .then(function (r) { return r; }, function (e) {
        return { state: 'degraded', error: '探针异常：' + (e && e.message ? e.message : e),
          diag: diag.join('\n') };
      });
  }

  /* ================= 模式（卡片可切）================= */
  /* v1.1.80：真机 B 诊断证明接口链路活，定 B（接口直连）为默认主线；
   * A（读作业页）保留兜底，用户仍可在卡片上手动切回 A。 */
  function mode() { try { return XXMU.pref(MODE_KEY) === 'A' ? 'A' : 'B'; } catch (e) { return 'B'; } }
  function setMode(m) {
    if (m !== 'A' && m !== 'B') return false;
    try { XXMU.pref(MODE_KEY, m); } catch (e) {}
    try { XXMU.pref(KEY, ''); } catch (e) {}   // 换模式清旧快照，逼一次重抓
    return true;
  }
  function modeName(m) { return m === 'B' ? 'B · 接口直连' : 'A · 读作业页'; }
  window.ZHS = {
    mode: mode, setMode: setMode, modeName: modeName,
    openA: openA, loggedIn: loggedIn,
    secretStr: secretStr, aesSelfTest: aesSelfTest   // 测试钩子（离线交叉验 AES）
  };

  /* ================= 注册 ================= */
  SOURCES.define({
    id: 'zhihuishu', label: '知到 / 智慧树', short: '知到',
    kinds: ['work', 'exam'], key: KEY,
    host: HOME, loginUrl: LOGIN_URL, loginTitle: '登录知到（智慧树）',
    badHints: '/login||passport||/signin||/qrcode||/bind',
    okHints: OK_SENTINEL, grabSel: '',
    loggedIn: loggedIn, openLogin: curOpenLogin, logout: curLogout,
    fetch: fetchTodo
  });

  /* v1.1.79：覆盖 SOURCES.define 装的默认登录回跳。默认版只写 __bound，
   * 而 v1.1.78 的秒关也会触发它 → 写假登录。这里只在用户点「完成」(ok)
   * 且确实带回了 cookie 时才写 AUTH_KEY；取消或没 cookie 一律清掉，
   * 回到未登录。登录完成判定权彻底交还给用户手动「完成」。 */
  window[CB] = function (ok, acct) {
    if (!ok) {
      try { XXMU.pref(AUTH_KEY, ''); } catch (e) {}
      if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast('已取消知到登录');
      return;
    }
    if (hasCookie()) {
      try { XXMU.pref(AUTH_KEY, '1'); } catch (e) {}
    } else {
      try { XXMU.pref(AUTH_KEY, ''); } catch (e) {}
      if (typeof XXMU !== 'undefined' && XXMU.toast) {
        XXMU.toast('没检测到登录态，请在页面里登进去后再点右上角「完成」');
      }
    }
    if (window.SrcUI && window.SrcUI.sync) window.SrcUI.sync('zhihuishu', false);
  };
})();
