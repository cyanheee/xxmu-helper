/* 河医大助手 - 登录与同步（App 内获取数据）
 *
 * 设计要点：
 *   1. 登录不在这里做。调 Host.openLogin() 打开学校官方登录页，用户在官方页面
 *      正常登录，完成后 Java 侧回调 window.__onLoginDone(ok)。
 *      —— 这样学校改密码加密算法 / 加滑块都不用改本文件。
 *   2. 拿到 Cookie 后，本文件负责拼课表请求、解析 HTML、写缓存。
 *   3. 青果页面是 GBK，用 TextDecoder('gbk') 解码（WebView 支持）。
 *   4. 解析逻辑与 core/parse_kb.py 保持一致，但纯 JS，不依赖后端。
 */

const XXMU = (() => {
  const HOST = 'https://qgjw.xxmu.edu.cn';
  const KB_PATH = '/student/wsxk.xskcb_excel10319.jsp?params=';
  const TERM_KEY = 'xxmu_term';       // 形如 2026-2027-1
  const USER_KEY = 'xxmu_user';

  /* ---------------- 基础设施 ---------------- */

  const hasHost = () => typeof Host !== 'undefined' && Host;

  /** 拆分 Java 返回的 "<code>|<body>" */
  function splitResp(r) {
    if (!r) return { code: 0, body: '' };
    if (r.indexOf('ERR:') === 0) return { code: -1, body: r.slice(4) };
    const i = r.indexOf('|');
    if (i < 0) return { code: 0, body: r };
    return { code: parseInt(r.slice(0, i), 10) || 0, body: r.slice(i + 1) };
  }

  /** Java 侧用 ISO-8859-1 把原始字节原样带过来（每个 char = 1 byte）。
   *  这里做字符集嗅探：先试 UTF-8（失败即抛），再退回 GBK。
   *  为什么要嗅探：青果课表正文是 GBK，但"凭证已失效"这类提示是 UTF-8，
   *  固定用 GBK 会把提示解成乱码，固定用 UTF-8 会把课表解成乱码。 */
  function decodeAuto(s) {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try {
        return new TextDecoder('gbk').decode(bytes);
      } catch (e2) {
        return s;
      }
    }
  }

  function b64(str) {
    if (hasHost() && Host.b64) return Host.b64(str);
    return btoa(unescape(encodeURIComponent(str)));
  }

  function pref(k, v) {
    if (!hasHost()) return v === undefined ? (localStorage.getItem(k) || '') : (localStorage.setItem(k, v), '');
    if (v === undefined) return Host.getPref(k);
    Host.setPref(k, v);
  }

  function toast(msg) {
    if (hasHost() && Host.toast) Host.toast(msg);
    else console.log('[toast]', msg);
  }

  /* ---------------- 学期参数 ---------------- */

  /** 从日期推当前学年学期（秋季 9 月~次年 1 月 = 第 1 学期，xq=0）
   *  青果约定：xn=起始年，xq=0 秋 / 1 春 */
  function guessTerm(now) {
    const d = now || new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1; // 1-12
    let xn, xq, label;
    if (m >= 8) {            // 8 月及以后 → 秋季学期
      xn = y; xq = 0; label = `${y}-${y + 1}-1`;
    } else if (m === 1) {     // 1 月仍属秋季学期
      xn = y - 1; xq = 0; label = `${y - 1}-${y}-1`;
    } else {                  // 2-7 月 → 春季学期
      xn = y - 1; xq = 1; label = `${y - 1}-${y}-2`;
    }
    return { xn: String(xn), xq: String(xq), label };
  }

  /** 读用户设定；没设过就用推断值 */
  function currentTerm() {
    const saved = pref(TERM_KEY);
    if (saved && /^\d{4}-\d{4}-[12]$/.test(saved)) {
      const [a, , t] = saved.split('-');
      return { xn: a, xq: t === '1' ? '0' : '1', label: saved };
    }
    return guessTerm();
  }

  function setTerm(label) {
    if (!/^\d{4}-\d{4}-[12]$/.test(label)) return false;
    pref(TERM_KEY, label);
    return true;
  }

  /* ---------------- 课表抓取 ---------------- */

    /**
   * 抓课表。返回 Promise<{ ok, html, code, error }>。
   *
   * v0.9.3 起改成异步：旧版是同步调 Host.fetchScheduleHtml，
   * Java 那边要等 HTTP 回来才 return，JS 线程会一直等 —— 网络一慢，
   * 页面就"能滑动但点什么都不动"。
   */
  function fetchScheduleHtml(user, term) {
    return new Promise((resolve) => {
      if (!hasHost()) { resolve({ ok: false, error: '需要 App 环境（浏览器预览无 Cookie 桥）' }); return; }
      if (!user) { resolve({ ok: false, error: '还没登录或拿不到学号' }); return; }
      const t = term || currentTerm();
      const params = 'xn=' + t.xn + '&xq=' + t.xq + '&xh=' + user;
      const done = (raw) => {
        const r = splitResp(raw);
        if (r.code !== 200) {
          resolve({ ok: false, code: r.code, error: '课表请求失败（HTTP ' + r.code + '）' + r.body.slice(0, 120) });
          return;
        }
        const text = decodeAuto(r.body);
        // 登录失效的典型特征（青果返回一段 alert 脚本）
        if (text.indexOf('凭证已失效') >= 0 || text.indexOf('login.action') >= 0
            || text.indexOf('用户登录') >= 0) {
          resolve({ ok: false, code: r.code, error: '登录已失效，请重新登录' });
          return;
        }
        if (text.length < 2000) {
          resolve({ ok: false, code: r.code, error: '课表内容异常（' + text.length + ' 字节）' });
          return;
        }
        resolve({ ok: true, html: text, code: r.code });
      };

      // 新宿主：后台线程抓取
      if (typeof Host.fetchScheduleHtmlAsync === 'function') {
        const key = 'kb' + (++netSeq) + '_' + Date.now();
        const p = { resolve: done, timer: null };
        pendingNet[key] = p;
        p.timer = setTimeout(() => {
          if (!pendingNet[key]) return;
          delete pendingNet[key];
          resolve({ ok: false, error: '课表请求超时（网络不给力，稍后再试）' });
        }, HTTP_WAIT);
        try {
          Host.fetchScheduleHtmlAsync(key, b64(params));
        } catch (e) {
          clearTimeout(p.timer);
          delete pendingNet[key];
          resolve({ ok: false, error: '请求失败：' + ((e && e.message) || e) });
        }
        return;
      }

      // 与 net() 同理：绝不退回同步桥，宁可这次报错让用户重试。
      resolve({ ok: false, error: '宿主未提供异步抓取桥，请安装最新版本' });
    });
  }

  /* ---------------- 课表解析（对齐 core/parse_kb.py） ---------------- */

  /* v1.1.13：抓取/解析的实测数字，供「复制课表诊断」用。
   *
   * 用户报障「20261430313 没有课表，重登/清数据/重装都试了」，但项目里
   * 从来没保存过真实青果课表 HTML —— 没有样本就无法离线复现，只能靠猜。
   * 这里把「这次到底抓到了多少字节、解析出几格、每格几门课、周次原文长什么样」
   * 记在内存里（不写 pref，纯诊断数据不该占存储），用户点一下就能复制回来。
   * 有了这份原文，是抓取问题还是解析问题一眼就能分开。 */
  const LAST = { at: 0, bytes: 0, cells: 0, courses: 0, html: '', samples: [], err: '' };
  function diagReset() {
    LAST.at = Math.floor(Date.now() / 1000);
    LAST.bytes = 0; LAST.cells = 0; LAST.courses = 0;
    LAST.html = ''; LAST.samples = []; LAST.err = '';
  }
  function diag() {
    return {
      at: LAST.at, bytes: LAST.bytes, cells: LAST.cells,
      courses: LAST.courses, samples: LAST.samples.slice(),
      err: LAST.err, html: LAST.html,
    };
  }
  /** 只留一小段原文（够看清结构，又不至于让复制内容炸掉） */
  function keepSample(html) {
    const out = [];
    /* 优先截「单元格」附近：那是唯一有意义的区域 */
    const i = html.indexOf("div1");
    if (i >= 0) out.push(html.slice(Math.max(0, i - 120), i + 900));
    /* 再留一段「周次」字样附近 */
    const j = html.indexOf("周");
    if (j >= 0 && out.length < 2) out.push(html.slice(Math.max(0, j - 200), j + 400));
    if (!out.length) out.push(html.slice(0, 800));
    return out;
  }

  function cleanText(s) {
    return String(s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u3000/g, ' ')
      .replace(/&ensp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** HTML → cells[{day, period, courses:[{name,teacher,weeks,room}]}] */
  function parseKb(html) {
    const cells = [];
    /* v1.1.13：单元格 id 是 k + 星期(1位) + 节次。
     *
     * 旧正则写的是 id=['"]k(\d)(\d)['"] —— 只认「两位」，也就是节次 1-9。
     * 一旦课表排到第 10 节及以后（id='k110' / 'k310'），正则会先吃掉 "11"
     * 再要求一个引号，而后面跟着 "0"，直接失配 —— 那一格的课**整块消失**，
     * 不报错、不进 bad[]、界面什么都不说。
     *
     * 医学专业晚上/周末排课多，节次到 11、12 很常见。改成 (\d{1,2})。 */
    const cellRe = /class=['"]div1['"]\s+id=['"]k(\d)(\d{1,2})['"][^>]*>([\s\S]*?)<\/div>\s*<\/td>/g;
    let m;
    while ((m = cellRe.exec(html)) !== null) {
      const day = parseInt(m[1], 10);
      const period = parseInt(m[2], 10);
      const body = m[3];
      const courses = [];
      /* 课程块：三个 <br> 分隔 教师 / 周次 / 教室。
       * v1.1.13：style 字符串原来是写死的单引号精确匹配，学校改成双引号
       * 或调整属性顺序就整块失配。改成两个前瞻断言 —— 只要这个 div 同时带
       * padding-bottom:5px 和 clear:both，不管顺序、不管引号、不管空格数，
       * 后面的 font/br 结构照旧解析。 */
      const cRe = /<div(?=[^>]*padding-bottom:\s*5px)(?=[^>]*clear:\s*both)[^>]*>\s*<font[^>]*font-weight:\s*bolder[^>]*>([\s\S]*?)<\/font>\s*<br\s*\/?>([\s\S]*?)<br\s*\/?>([\s\S]*?)<br\s*\/?>([\s\S]*?)<\/div>/g;
      let c;
      while ((c = cRe.exec(body)) !== null) {
        courses.push({
          name: cleanText(c[1]),
          teacher: cleanText(c[2]),
          weeks: cleanText(c[3]),
          room: cleanText(c[4]),
        });
      }
      if (courses.length) cells.push({ day, period, courses });
    }
    return cells;
  }

  /* ---------------- weeks 字符串 → 数字数组（对齐 core/normalize.py） ---------------- */

  /* v1.1.8：这里原来匹配失败就 `return { weeks: [], periods: [] }`，
   * 一声不响。后果是连锁的而且全都「看起来正常」：
   *   · blocksOf 里 `c.weeks.includes(week)` 恒 false → 这门课永远不上网格；
   *   · totalOf 也不计它 → 「本周 0 节课」；
   *   · 但 buildSchedule 的 count 用的是 courses.length → toast 照样报
   *     「同步完成：N 门课」。用户看到「同步了 12 门」却一片空白，
   *     无从判断是同步失败还是教务没课。
   * 青果改版、或者周次写法变成「1-16周」这种不带方括号的形式，就会踩中。
   *
   * 现在做三件事：①多认几种写法；②没有节次时用单元格自己的节次兜底
   * （单元格 id kXY 里的 Y 就是节次，本来就是可靠信息）；③仍然解析不出
   * 周次的，记下来往上报，让界面能说「有 N 门课的周次没读懂」。 */
  function parseWeeks(s, fallbackPeriod) {
    const txt = String(s || '').trim();
    const fb = (fallbackPeriod > 0) ? [fallbackPeriod] : [];
    const expand = (str) => {
      const out = [];
      String(str || '').split(',').forEach((part) => {
        part = part.trim();
        if (!part) return;
        if (part.indexOf('-') >= 0) {
          const seg = part.split('-');
          const a = parseInt(seg[0], 10), b = parseInt(seg[1], 10);
          if (!isNaN(a) && !isNaN(b) && b >= a && b - a < 200) {
            for (let i = a; i <= b; i++) out.push(i);
          }
        } else {
          const n = parseInt(part, 10);
          if (!isNaN(n)) out.push(n);
        }
      });
      return out;
    };

    // 主格式：`4-5,7[11,12]`（青果的标准写法）
    let m = /([\d,\-]+)\[([\d,\-]+)\]/.exec(txt);
    if (m) {
      const w = expand(m[1]);
      const p = expand(m[2]);
      return { weeks: w, periods: p.length ? p : fb, ok: w.length > 0 };
    }
    // 退一步：只要有方括号里的节次就算数，周次另找
    m = /\[([\d,\-]+)\]/.exec(txt);
    if (m) {
      const p = expand(m[1]);
      const w = expand(txt.replace(/\[[\d,\-]+\]/, '').replace(/[^\d,\-]/g, ''));
      return { weeks: w, periods: p.length ? p : fb, ok: w.length > 0 };
    }
    // 再退一步：整串就是一个周次表达式（`1-16` / `1-16周` / `1,3,5-9`）
    const wOnly = expand(txt.replace(/[周周次]/g, '').replace(/[^\d,\-]/g, ''));
    if (wOnly.length) return { weeks: wOnly, periods: fb, ok: true };

    return { weeks: [], periods: fb, ok: false };
  }

  function normalize(cells) {
    const out = [];
    const bad = [];
    cells.forEach((cell) => {
      cell.courses.forEach((c) => {
        const w = parseWeeks(c.weeks, cell.period);
        if (!w.ok) bad.push({ name: c.name, raw_weeks: c.weeks, day: cell.day, period: cell.period });
        out.push({
          name: c.name, teacher: c.teacher, room: c.room,
          day: cell.day, weeks: w.weeks, periods: w.periods,
          raw_weeks: c.weeks,
        });
      });
    });
    return { courses: out, bad: bad };
  }

  /* ---------------- 组装完整 schedule 对象 ---------------- */

  function buildSchedule(html, user, term) {
    const cells = parseKb(html);
    LAST.bytes = String(html || '').length;
    LAST.cells = cells.length;
    LAST.html = String(html || '').slice(0, 4000);
    LAST.samples = keepSample(String(html || ''));
    if (!cells.length) {
      LAST.err = '解析出 0 个课表格子（页面 ' + LAST.bytes + ' 字节）';
      throw new Error('解析出 0 个课表格子（页面结构可能变了）');
    }
    const nz = normalize(cells);
    const courses = nz.courses;
    LAST.courses = courses.length;
    LAST.err = nz.bad.length ? ('有 ' + nz.bad.length + ' 条周次没读懂') : '';
    return {
      user: user,
      synced_at: Math.floor(Date.now() / 1000),
      term: (term || currentTerm()).label,
      cells: cells,
      courses: courses,
      times: (window.SCHEDULE && window.SCHEDULE.times) || [],
      count: courses.length,
      /* count 是「抓到几门」，showable 是「真正能上网格的」。
       * 两者不等时界面必须说清楚，否则就是「报 N 门、显示 0 门」。 */
      showable: courses.filter((c) => c.weeks.length > 0).length,
      bad_weeks: nz.bad,
      _source: 'app',
    };
  }

  /* ---------------- 异步 HTTP（v0.9.3） ----------------
   *
   * 旧写法是同步调 Host.httpFetch：Java 那边要等 HTTP 回来才 return，
   * 而 JS 线程会一直等这个返回值 —— 网络一慢，整个页面就"能滑动但点不动"。
   *
   * 现在优先用 Host.httpFetchAsync(key, ...) + window.__onHttpDone 回调；
   * 若宿主还没升级（没有 httpFetchAsync），退回同步版但加超时保护。
   */

  const HTTP_WAIT = 20000;   // 前端自己再兜一层，比 Java 的 25 秒短

  const pendingNet = {};

  let netSeq = 0;

  window.__onHttpDone = function (key, result) {
    const p = pendingNet[key];
    if (!p) return;
    delete pendingNet[key];
    clearTimeout(p.timer);
    p.resolve(result || '');
  };

  /**
   * 一次 HTTP 请求，返回 Promise<"<code>|<body>">。
   * 参数与 Host.httpFetch 一致。
   */
  function net(url, method, body, contentType, headers, asMultipart) {
    return new Promise((resolve) => {
      if (!hasHost()) {
        resolve('ERR:NoHost:不在 App 内');
        return;
      }

      // 新宿主：异步 + 回调
      if (typeof Host.httpFetchAsync === 'function') {
        const key = 'k' + (++netSeq) + '_' + Date.now();
        const p = { resolve: resolve, timer: null };
        pendingNet[key] = p;
        p.timer = setTimeout(() => {
          if (!pendingNet[key]) return;
          delete pendingNet[key];
          resolve('ERR:Timeout:请求超时');
        }, HTTP_WAIT);
        try {
          Host.httpFetchAsync(key, url, method || 'GET', body || '',
            contentType || '', headers || '', asMultipart || '0');
        } catch (e) {
          clearTimeout(p.timer);
          delete pendingNet[key];
          resolve('ERR:' + (e && e.name ? e.name : 'Error') + ':' + ((e && e.message) || e));
        }
        return;
      }

      /* 不再退回同步版。
       *
       * 这里原来写的是「老宿主就用同步 Host.httpFetch」，但那等于把命运押在
       * 「宿主一定有异步桥」上：v0.9.3 的三个 async 方法被写在了 Host 类外面，
       * JS 侧探测不到，于是每一次请求都走这条同步分支 —— Java 同步等 HTTP
       * 回来，JS 线程被按住，页面能滑但点不动。整条链路看起来「已改成异步」，
       * 实际一行都没生效，而且没有任何报错。
       *
       * 所以现在改成快速失败：宁可这次请求报错（上层会降级成离线放行），
       * 也绝不允许同步阻塞再次发生。
       */
      resolve('ERR:NoAsyncBridge:宿主未提供异步网络桥');
    });
  }

  /**
   * 带站点 Cookie 的请求（学习通专用）。返回 Promise<"<code>|<body>">。
   *
   * 为什么单独一个函数：学习通认人靠 Cookie，而 Cookie 在 WebView 的
   * cookie 池里，JS 读不到也设不了 —— 只能让 Java 从 CookieManager 取。
   * 顺带把 Referer 也交给 Java，因为学习通的作业清单接口拿不到 Referer
   * 会直接返回 3004「无访问权限」。
   *
   * @param cookieUrl 从哪个域取 Cookie（如 https://mooc1.chaoxing.com）
   * @param referer   上一跳页面，可为空
   */
  function netCk(url, method, body, contentType, headers, cookieUrl, referer) {
    return new Promise((resolve) => {
      if (!hasHost()) { resolve('ERR:NoHost:不在 App 内'); return; }
      if (typeof Host.httpFetchCkAsync !== 'function') {
        resolve('ERR:NoAsyncBridge:宿主未提供带 Cookie 的异步桥');
        return;
      }
      const key = 'c' + (++netSeq) + '_' + Date.now();
      const p = { resolve: resolve, timer: null };
      pendingNet[key] = p;
      p.timer = setTimeout(() => {
        if (!pendingNet[key]) return;
        delete pendingNet[key];
        resolve('ERR:Timeout:请求超时');
      }, HTTP_WAIT + 10000);   // 学习通一门课一页，比教务慢，多给 10 秒
      try {
        Host.httpFetchCkAsync(key, url, method || 'GET', body || '',
          contentType || '', headers || '', cookieUrl || '', referer || '');
      } catch (e) {
        clearTimeout(p.timer);
        delete pendingNet[key];
        resolve('ERR:' + (e && e.name ? e.name : 'Error') + ':' + ((e && e.message) || e));
      }
    });
  }

  /* ---------------- 对外 ---------------- */

  return {
    hasHost, guessTerm, currentTerm, setTerm,
    fetchScheduleHtml, parseKb, parseWeeks, normalize, buildSchedule,
    splitResp, decodeAuto, pref, toast, b64, net, netCk,
    diag, diagReset,
    TERM_KEY, USER_KEY,
  };
})();

/* 登录完成后由 Java 回调。
 *
 * 第二个参数 acct 是 WebActivity 从登录页 input#username 读回来的账号
 * （青果用学号当登录名）。v1.1.0 取消激活码后，这就是「这个学号真的是他」
 * 的唯一证据，所以要在这里落盘并与软件里登记的学号比对。
 *
 * acct 为空不算失败：可能学校改版换了输入框，也可能用户用了别的登录方式。
 * 那种情况只提示「没读到学号，请核对」，不拦人——否则改一次版就把全校锁死。
 */
window.__onLoginDone = function (ok, acct) {
  if (!ok) {
    XXMU.toast('已取消登录');
    return;
  }
  let chk = { ok: true, unknown: true, acct: '' };
  try {
    if (typeof LICENSE !== 'undefined' && LICENSE.noteKbAccount) {
      chk = LICENSE.noteKbAccount(acct || '');
    }
  } catch (e) {}

  /* v1.1.62：读到的是教务网真实学号、而当初进门填的是畸形号（6/10/12 位、
   * 1 开头那种），说明名单里那条「格式异常（手填）」就是这次该纠正的。
   * 就地对齐：本地登记 + xxmu_user 换成真号、复核解除同步门禁、
   * 重新领票并通知服务端名单改号。对齐成功后 chk 变成 ok=true，
   * 下面就不会再弹「两个号不一样」，__onLoginSuccess 直接去同步课表。 */
  if (!chk.unknown && chk.ok === false && typeof AUTH !== 'undefined' && AUTH.alignKbAccount) {
    try {
      if (AUTH.alignKbAccount(chk.acct, chk.id)) {
        chk = LICENSE.noteKbAccount(chk.acct);
      }
    } catch (e) {}
  }

  if (chk.unknown) {
    XXMU.toast(acct ? ('登录成功（账号 ' + acct + '）') : '登录成功');
  } else if (chk.ok) {
    XXMU.toast('登录成功，学号已核对');
  } else {
    /* 不一致：这是关键拦截点。用户拿 A 学号登录、软件里却登记了 B 学号，
     * 说明要么填错了，要么在拿别人的号用。不给同步，直接说清楚怎么办。 */
    XXMU.toast('登录的学号（' + chk.acct + '）和软件里填的（' + chk.id + '）不一样');
  }
  if (window.__onLoginSuccess) window.__onLoginSuccess(chk);
};
