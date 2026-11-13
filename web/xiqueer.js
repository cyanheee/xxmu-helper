/* 河医大助手 · 喜鹊儿（青果教务）考试安排适配器（v1.1.71 双探全自动 + 复制兜底）
 *
 * ================== 三轮真机证伪后的定案 ==================
 * v1.1.66 写死 7 个 jsp 路径、真机一个没命中却谎称「登录态过期」；
 * v1.1.67 改成抓 9 张菜单页挖链接逐个验真表头，真机诊断（m01318）还是
 * 全军覆没：/student/ksap*.jsp 一律「凭证失效页」，而 /frame/homes.action
 * 是活的（32382B）。根因不是地址没猜对 —— 青果 V17 用 .action/.do 的
 * Struts 端点 + AJAX 动态菜单 + KingoEncypt 动态令牌，业务页防裸 GET。
 *
 * v1.1.68 换到「真浏览器带路」：App 内 WebView 打开教务，人点一次考试安排，
 * 按完成，FIND_JS 把整页文字/表格读回来解析。第三轮报障（m01910）：人已经
 * 进到「课程考试 → 考试安排表」、选了学年学期、按检索出了表，按完成仍报
 * 「没认出」。根因＝青果 V17 用 <frameset>/<frame> 布局，v1.1.68 只读
 * iframe，顶层 document.body 近空 —— 回传一片空白。
 *
 * v1.1.69 两处换层：
 *   ① 读页桥遍历 window.frames 递归读 frame + iframe 的 innerText / <tr> /
 *      <table> 单元格 / <select> 已选值，并拼出 raw 原文。
 *   ② 认不出时不再只弹一句 toast：把读回的原文摊进喜鹊卡片的粘贴框，
 *      人看得见读到了什么、能改课程/时间、再点「导入这段」。黑盒变可见。
 *
 * v1.1.70 换执行层（第四轮 m02177「检索了还是不行」）：按「完成」时程序够到的
 * 仍只有门户框架页（#0 菜单 S204 / #1 about:blank），检索出的考试表根本不在
 * App 能 evaluateJavascript 到的文档里 —— 四轮全卡在「App 主动去够青果页面」。
 * 这版不再赌读页：人在自己看得见的那页长按复制，App 读系统剪贴板
 *（Host.getClip）自己解析，一键导入；「去教务」只负责把门户打开方便复制。
 *
 * 诚实红线：认不出就是认不出，绝不落一份空快照冒充「同步成功」；读不到
 * 状态一律留空（交给 renderHomework 说「未开考 / 状态未知」），绝不编
 * 「已完成」；时间解析不出留空，绝不臆造 00:00。
 *
 * v1.1.71（方案 C · 双探全自动，触发是 m02339「课表能自动爬取考试为什么不能」）：
 * 复核发现课表全自动靠的是免令牌报表端点 wsxk.xskcb_excel10319.jsp?params=
 * （b64(xn&xq&xh)、带 Cookie 直出整张表），考试四版从没试过同款地址 —— 之前
 * 「换执行层改复制」判早了。这版同时装两路探针：A 拦「检索」发出的请求 URL、
 * B 钩「导出/打印」的下载 URL，谁先拿到像报表的地址就记住 AUTO_KEY；之后
 * fetchExams 照课表用 SOURCES.http 带 Cookie 全自动重放，零复制、零手动。
 * 两路都被挡才诚实降级回剪贴板/粘贴，界面不撒谎。仍是只读，不代交、不提交。
 */
(function () {
  'use strict';

  const BASE = 'https://qgjw.xxmu.edu.cn';
  const HOME = BASE + '/';                 // 教务门户首页：登录后有完整菜单，能点到考试安排
  const HOST = BASE + '/';
  const SNAP_KEY = 'xxmu_xq_capture';     // 导入快照 {exams,url,at,diag}
  const RAW_KEY = 'xxmu_xq_last_raw';     // 上次「没认出」时读回的原文，供粘贴框回填
  const AUTO_KEY = 'xxmu_xq_auto';        // v1.1.71：双探记住的自动报表地址 {url,at,kind}
  let LAST_DIAG = '';                      // 本次会话最后一次定位说明（供复制诊断）

  const NOEXAM = '还没读到考试安排。三步：一，点「自动同步一次」，进教务「课程考试 → 考试安排表」选好学年学期、按「检索」让表出来（或点一次「导出」），再按右上角「完成」；二，程序记住那条报表地址后就像课表一样全自动刷新，不用再复制；三，万一学校把地址挡了，就长按复制考试那几行文字回来点「从剪贴板导入」，或把文字粘进框点「导入这段」。';
  const NO_PARSE = '没认出考试条目。请确认复制的文字里带有日期和时间（例如 2026-11-14(11周 星期六)11:00-12:00 或 11月14日 11:00-12:00），以及课程名（例如 高等数学B1）。整页复制最稳；读到的原文已摊进框里，可改动后再导入。';
  const NO_CLIP = '剪贴板是空的。先到教务「考试安排表」或喜鹊儿「考试安排」页，长按选中考试那几行文字点「复制」，再回来点「从剪贴板导入」；或者直接把文字粘进下面的框点「导入这段」。';

  /* ---- 存储：有 Host 走 Host.pref（跟着 App 走），浏览器里退 localStorage ---- */
  function pg(k) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU && XXMU.pref) return XXMU.pref(k);
    } catch (e) {}
    try { return (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || ''; }
    catch (e) { return ''; }
  }
  function ps(k, v) {
    try {
      if (typeof XXMU !== 'undefined' && XXMU && XXMU.pref) { XXMU.pref(k, v); return; }
    } catch (e) {}
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); }
    catch (e) {}
  }
  function toast2(msg) {
    try { if (typeof XXMU !== 'undefined' && XXMU && XXMU.toast) XXMU.toast(msg); }
    catch (e) {}
  }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function trim(s) { return String(s == null ? '' : s).replace(/\u00a0/g, ' ').trim(); }

  function defaultDiag() {
    return '喜鹊儿考试安排（v1.1.71 · 双探全自动 + 复制兜底）：青果 V17 业务页防直链、'
      + '检索结果常进弹窗，App 主动读页读回整页四轮真机都够不到考试表。'
      + '这版按课表的报表端点思路装了两路探针：点「自动同步一次」，进教务「课程考试 → 考试安排表」'
      + '选好学年学期，按一次「检索」或点一次「导出」，再按右上角「完成」，程序记住那条自动地址，'
      + '之后像课表一样带登录态全自动刷新；探针都被挡时才退回「从剪贴板导入」或粘贴。当前还没有读到考试安排。';
  }

  function loadSnap() {
    try {
      const raw = pg(SNAP_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.exams)) {
        /* v1.1.72：旧版重放可能落下过「未标注课程 · 时间也没有」的幽灵条目
         * （真机截图里那条「— ~ —」）。读出来时先滤掉，别让它一直挂在待完成里。 */
        const kept = o.exams.filter(function (e) {
          return e && (String(e.course || '').trim() || String(e.start || '').trim());
        });
        if (kept.length !== o.exams.length) {
          o.exams = kept;
          try { ps(SNAP_KEY, JSON.stringify(o)); } catch (e2) {}
        }
        return o;
      }
    } catch (e) {}
    return null;
  }

  function save(exams, url, how) {
    const at = nowSec();
    const diag = '已导入 ' + exams.length + ' 场考试（' + (how || '导入') + '）。'
      + (url ? ' 来源页：' + url + '。' : '')
      + ' 数据只存在这台手机上，改天再点一次或再粘一次即可更新。';
    ps(SNAP_KEY, JSON.stringify({ exams: exams, url: String(url || ''), at: at, diag: diag }));
    ps(RAW_KEY, '');                 // 认出来了，读回原文兜底不再需要
    LAST_DIAG = diag;
    return at;
  }

  function lastRaw() { return pg(RAW_KEY); }

  /* v1.1.71：记住 / 读取那条「像课表一样能全自动重放」的报表地址。 */
  function autoLoad() {
    try {
      const o = JSON.parse(pg(AUTO_KEY) || '');
      if (o && typeof o.url === 'string' && o.url.indexOf('http') === 0) return o;
    } catch (e) {}
    return null;
  }
  function autoSave(url, kind) {
    const o = { url: String(url), at: nowSec(), kind: String(kind || 'auto') };
    ps(AUTO_KEY, JSON.stringify(o));
    return o;
  }
  /* v1.1.72：重放失败计数。连续两次都拿不到考试表就忘掉这条地址——
   * 免得每次刷新白打一次请求，还让人以为「地址还在，只是这学期没考试」。 */
  function autoFail(why) {
    const o = autoLoad();
    if (!o) return 0;
    o.fail = (+o.fail || 0) + 1;
    o.lastErr = String(why || '');
    if (o.fail >= 2) {
      ps(AUTO_KEY, '');
      LAST_DIAG = '自动地址连续两次没拿到考试表（' + (why || '') + '），已忘掉这条地址。'
        + '请再点一次「自动同步一次」，进教务重新按「检索」或「导出」记一次。';
      return o.fail;
    }
    ps(AUTO_KEY, JSON.stringify(o));
    LAST_DIAG = '这次自动同步没拿到考试表（' + (why || '') + '），先保留上次的结果。';
    return o.fail;
  }

  /* ================== 文本解析 ================== */

  /* 把一段文本切成「行」：换行断行，制表（表格单元格）压成空格。
   * FIND_JS 取的是 <tr>/<table> 的 innerText，\t 是单元格分隔；压成换行会把
   * 「课程 / 时间 / 考场」拆成互不相干的三行，考场就丢了。 */
  function splitLines(text) {
    return String(text == null ? '' : text)
      .replace(/\r/g, '\n').replace(/\t/g, ' ').split('\n')
      .map(trim).filter(function (s) { return s.length > 0; });
  }

  function normT(t) { const p = t.replace(/\s/g, '').split(':'); return pad2(+p[0]) + ':' + p[1]; }

  /* 学年范围 → 参考年。青果页面底部/下拉里常有「2026-2027学年第一学期」。
   * 不带年份的日期（11月14日）用它推年：8~12 月/1 月归起始年，2~7 月归次年。 */
  function refYearOf(text) {
    const m = /(20\d{2})\s*[-\/\u2013]\s*(20\d{2})/.exec(String(text));
    if (m) return { y1: +m[1], y2: +m[2] };
    const y = new Date().getFullYear();
    return { y1: y, y2: y + 1 };
  }

  /* 一行里的「完整日期 + 时间」。真机卡片是 2026-11-14(11周 星期六)11:00-12:00，
   * 日期与时间之间夹括号周次；表格是 2026-12-20 09:00-11:00。
   * 只认带冒号的时刻，括号里的 11周 不会被误当时刻。 */
  function findDateTime(line) {
    const dm = /(20\d{2})\s*[-\/\u5e74.]\s*(\d{1,2})\s*[-\/\u6708.]\s*(\d{1,2})/.exec(line);
    if (!dm) return null;
    const date = dm[1] + '-' + pad2(+dm[2]) + '-' + pad2(+dm[3]);
    const after = line.slice(dm.index + dm[0].length);
    const tm = after.match(/\d{1,2}\s*:\s*\d{2}/g) || [];
    const norm = function (t) { const p = t.replace(/\s/g, '').split(':'); return pad2(+p[0]) + ':' + p[1]; };
    let endIdx = line.length;
    if (tm.length) {
      const lastT = tm[tm.length - 1];
      const pos = line.lastIndexOf(lastT);
      if (pos >= 0) endIdx = pos + lastT.length;
    }
    return {
      index: dm.index, endIdx: endIdx, date: date,
      t1: tm[0] ? norm(tm[0]) : '',
      t2: tm[1] ? norm(tm[1]) : '',
    };
  }

  /* v1.1.69：青果表格有时把「11月14日」和「11:00-12:00」写成不带年份的两行。
   * 必须带「月」字才认，避开「1-2 节」「第 3 教学楼」这类数字被当成日期。 */
  function findMdDateTime(line, ry) {
    if (!/\u6708/.test(String(line))) return null;
    const re = /(?:^|[^\d])(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65e5?/g;
    let m = null, mo = 0, day = 0, x;
    while ((x = re.exec(line))) {
      const a = +x[1], b = +x[2];
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) { m = x; mo = a; day = b; break; }
    }
    if (!m) return null;
    const r = ry || refYearOf(line);
    const yy = (mo >= 8 || mo === 1) ? r.y1 : r.y2;
    const date = yy + '-' + pad2(mo) + '-' + pad2(day);
    const after = line.slice(m.index + m[0].length);
    const tm = after.match(/\d{1,2}\s*:\s*\d{2}/g) || [];
    let endIdx = line.length;
    if (tm.length) {
      const lastT = tm[tm.length - 1];
      const pos = line.lastIndexOf(lastT);
      if (pos >= 0) endIdx = pos + lastT.length;
    }
    return {
      index: m.index, endIdx: endIdx, date: date,
      t1: tm[0] ? normT(tm[0]) : '',
      t2: tm[1] ? normT(tm[1]) : '',
    };
  }

  function cleanCourse(s) {
    return trim(s)
      .replace(/\[[A-Za-z0-9_\-]+\]/g, ' ')     /* 去掉 [yg0231] 课程代码 */
      .replace(/[:：]/g, ' ')
      .replace(/^\s*\d+[\s.\u3001,\uff0c]*\s*/, '') /* 去掉行首序号 */
      .replace(/\s+/g, ' ').trim();
  }

  /* v1.1.73：轮次那一格常被青果写成「2026-2027学年第一学期期中考试」，
   * 直接拼进标题就变成一整行长的「高等数学B1 5.0（2026-2027学年第一学期期中考试）」。
   * 学年学期是页面抬头，不是轮次本身，剥掉只留「期中考试」；
   * 剥完什么都不剩就干脆不要这个括号，而不是留个空括号。
   * 真机来源：m03292 截图里那条待完成，标题两行、副行还重复课程名。 */
  function cleanRound(s) {
    let t = trim(s);
    if (!t) return '';
    t = t.replace(/20\d{2}\s*[-–\/\u2013]\s*20\d{2}\s*学年/g, ' ');
    t = t.replace(/第?\s*[一二三四1-4]\s*学期/g, ' ');
    t = t.replace(/学年|学期/g, ' ');
    t = t.replace(/[（(]\s*[)）]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/^[·、,，:：\-\s]+|[·、,，:：\-\s]+$/g, '');
    if (t.length > 20) t = t.slice(0, 20).trim();
    return t;
  }

  function isCourseLike(s) {
    const t = trim(s);
    if (!t || t.length < 2 || t.length > 60) return false;
    if (/[:\uff1a]/.test(t)) return false;                    /* 标签行 */
    if (/^20\d{2}[-\/\u5e74.]/.test(t)) return false;         /* 日期 / 学年开头 */
    if (/\u5b66\u5e74|\u5b66\u671f/.test(t)) return false;    /* 学年 / 学期 */
    if (/\u8fd8\u5269|\u5269\u4f59|\u5012\u8ba1\u65f6/.test(t)) return false; /* 还剩X天 */
    if (/^\*+$/.test(t) || /^\d+(?:\.\d+)?$/.test(t)) return false; /* 座位** / 纯数字 */
    /* v1.1.72：页面上的按钮字和表头也不能当课程名。真机就是靠这个让
     * 「考试安排表」这一行冒充了课程，配上一串日期拼出一场假考试。 */
    if (/\u5b89\u6392\u8868|\u68c0\u7d22|\u6253\u5370|\u5bfc\u51fa|\u67e5\u8be2|\u5e8f\u53f7|\u6279\u6b21|\u8bfe\u7a0b\u540d\u79f0/.test(t)) return false;
    const c = t.replace(/\s/g, '');
    if (/^(\u8003\u8bd5\u5730\u70b9|\u8003\u8bd5\u6027\u8d28|\u8003\u6838\u65b9\u5f0f|\u8f6e\u6b21|\u5b66\u5206|\u5ea7\u4f4d\u53f7|\u5e8f\u53f7|\u8bfe\u7a0b\u540d\u79f0|\u8003\u8bd5\u65f6\u95f4|\u8003\u573a|\u8003\u8bd5\u72b6\u6001)/.test(c)) return false;
    if (/[A-Za-z\u4e00-\u9fa5]/.test(t) === false) return false;
    return true;
  }

  /* 在一段行里按标签取值：标签字间空格（学    分 / 座 位 号）都能认，
   * 值里的空格压成一个，不丢地点那种有意义的空格。 */
  function findVal(arr, label) {
    const re = new RegExp(label.split('').join('\\s*') + '\\s*[:\uff1a]\\s*(.+)');
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i].match(re);
      if (m) return trim(m[1]).replace(/\s+/g, ' ');
    }
    return '';
  }
  function hasPlace(s) {
    return /[\u697c\u6559\u5ba4\u6821\u533a\u8003\u573a\u5ba4\u5ea7\u53f7]/.test(s) && trim(s).length >= 2;
  }

  /* 解析一整段文本（top 页 / 某个 frame / rows 或 tables 拼出来的块）。 */
  function parseOneText(text) {
    const lines = splitLines(text);
    const ry = refYearOf(text);
    const hits = [];
    lines.forEach(function (ln, i) {
      const dt = findDateTime(ln) || findMdDateTime(ln, ry);
      if (dt) hits.push({ i: i, dt: dt });
    });
    const out = [];

    hits.forEach(function (hit, k) {
      const di = hit.i;
      const dt = hit.dt;
      /* 表格里日期和时刻可能分成两行（「11月14日」/「11:00-12:00」），
       * 向下看两行把时刻配回来；配不到就留空，绝不臆造 00:00。 */
      if (!dt.t1) {
        for (let q = di + 1; q <= Math.min(di + 2, lines.length - 1); q++) {
          const tm2 = String(lines[q]).match(/\d{1,2}\s*:\s*\d{2}/g) || [];
          if (tm2.length) {
            dt.t1 = normT(tm2[0]);
            dt.t2 = tm2[1] ? normT(tm2[1]) : '';
            break;
          }
        }
      }
      const line = lines[di];
      const lo = k === 0 ? Math.max(0, di - 16) : (hits[k - 1].i + 1);
      const prefix = trim(line.slice(0, dt.index));
      const suffix = trim(line.slice(dt.endIdx));
      const seg = lines.slice(lo, di + 1);

      /* 课程名：① 窗口内的 [代码]课程 行优先（卡片式最可靠）；
       *        ② 同一行日期前的部分（表格把课程和时间放一行）；
       *        ③ 再退而求其次取窗口里最近的「像课程」的行。 */
      let course = '';
      for (let i = di - 1; i >= lo; i--) {
        const m = lines[i].match(/\[[A-Za-z0-9_\-]+\]\s*([^\s].*)/);
        if (m) { course = cleanCourse(m[1]); break; }
      }
      if (!course && isCourseLike(prefix)) course = cleanCourse(prefix);
      if (!course) {
        for (let i = di - 1; i >= lo; i--) {
          if (isCourseLike(lines[i])) { course = cleanCourse(lines[i]); break; }
        }
      }

      const place = findVal(seg, '\u8003\u8bd5\u5730\u70b9')
        || findVal(seg, '\u8003\u573a')
        || (hasPlace(suffix) ? cleanCourse(suffix) : '');
      const credit = findVal(seg, '\u5b66\u5206');
      const roundRaw = findVal(seg, '\u8f6e\u6b21');
      const round = cleanRound(roundRaw);
      const nature = findVal(seg, '\u8003\u8bd5\u6027\u8d28');
      const seat = findVal(seg, '\u5ea7\u4f4d\u53f7');

      /* 时间：两个时刻都在才写起止；只有一个或没有就留空，绝不臆造 00:00。 */
      const start = dt.t1 ? (dt.date + ' ' + dt.t1) : '';
      const end = dt.t2 ? (dt.date + ' ' + dt.t2) : '';
      /* v1.1.72：没有课程名的条目一律丢弃。
       * 真机（m03025「还是不行」）那条「未标注课程 · — ~ —」就是这么来的：
       * 重放拿到的是外壳页，只有零星日期/时刻字样，硬拼出一场假考试挂在待完成里。
       * 「考试安排表」这种按钮/标题行也已被 isCourseLike 挡住。宁可这轮判失败、
       * 保旧快照，也不许凭空造一场要人去考的考试。 */
      if (!course) return;
      const label = course;
      out.push({
        course: label,
        /* v1.1.73：标题只放课程名。轮次（期中考试）单列成 subtitle/详情字段，
         * 以前拼成「高等数学B1 5.0（2026-2027学年第一学期期中考试）」——
         * 学年抬头冒充轮次，标题两行还没信息量。 */
        name: label,
        start: start, end: end,
        status: '',                 /* 读不到状态一律留空，绝不写「已完成」 */
        place: place, credit: credit, round: round, nature: nature, seat: seat,
        source: 'xiqueer',
      });
    });
    return out;
  }

  /* FIND_JS 回传对象 {u,text,rows,tables,sels,frames:[{u,text,rows,tables,sels}],raw}；
   * 粘贴导入给的是纯文本。把每个「文档」（top + 递归到的每个 frame）的
   * text / rows / tables 各当成一段文本解析，再按 课程|开考时间 去重。
   * 注意：raw 只用于「认不出时摊给用户看」，不进解析块——它是上面那些块的
   * 拼接，重复进解析会产生一堆「未标注课程」的影子条目。 */
  function collectBlocks(input) {
    const blocks = [];
    function addText(t) { const s = trim(t); if (s) blocks.push(s); }
    function addRows(rs) {
      if (!Array.isArray(rs) || !rs.length) return;
      blocks.push(rs.map(function (r) { return trim(r).replace(/\t/g, ' '); }).join('\n'));
    }
    function addTables(ts) {
      if (!Array.isArray(ts)) return;
      ts.forEach(function (t) {
        if (typeof t === 'string' && trim(t)) blocks.push(trim(t).replace(/\t/g, ' '));
        else if (Array.isArray(t)) addRows(t);
      });
    }
    function addDoc(d) {
      if (!d || typeof d !== 'object') { if (typeof d === 'string') addText(d); return; }
      addText(d.text);
      addRows(d.rows);
      addTables(d.tables);
      if (Array.isArray(d.frames)) d.frames.forEach(addDoc);
    }
    if (typeof input === 'string') {
      const s = trim(input);
      if (s.charAt(0) === '{') {
        let o = null; try { o = JSON.parse(s); } catch (e) { o = null; }
        if (o && typeof o === 'object') { addDoc(o); return blocks; }
      }
      addText(s);
    } else addDoc(input);
    return blocks;
  }

  function parseCapture(input) {
    const blocks = collectBlocks(input);
    const out = [];
    const seen = {};
    blocks.forEach(function (text) {
      parseOneText(text).forEach(function (e) {
        const key = e.course + '|' + e.start;
        if (seen[key]) return;
        seen[key] = 1;
        out.push(e);
      });
    });
    return out.slice(0, 60);
  }

  /* 把 FIND_JS 对象拼成一份人能读的原文：认不出时摊进粘贴框。 */
  function rawTextOf(obj) {
    if (!obj || typeof obj !== 'object') return '';
    if (obj.raw) return String(obj.raw);
    const parts = [];
    function A(s) { s = trim(s); if (s) parts.push(s); }
    function doc(d) {
      if (!d || typeof d !== 'object') return;
      A(d.text);
      if (Array.isArray(d.rows)) d.rows.forEach(A);
      if (Array.isArray(d.tables)) d.tables.forEach(function (t) { if (typeof t === 'string') A(t); });
      if (Array.isArray(d.sels) && d.sels.length) A('\u5df2\u9009\u6761\u4ef6\uff1a' + d.sels.join('  '));
    }
    doc(obj);
    if (Array.isArray(obj.frames)) {
      obj.frames.forEach(function (f) {
        doc(f);
        if (Array.isArray(f && f.sels) && f.sels.length) A('\u5df2\u9009\u6761\u4ef6\uff1a' + f.sels.join('  '));
      });
    }
    return parts.join('\n').slice(0, 60000);
  }

  /* ================== 对外动作 ================== */

  function find() {
    /* v1.1.70：只把教务门户打开，方便人在自己看得见的那页长按复制考试表。
     * 不再挂 __onXqFind 自动读页回跳——四轮真机证明按「完成」时程序够到的
     * 只有门户框架页，检索表不在这个 WebView 能读到的文档里，赌读页一直输。
     * cb 传空串：openFinderFor 照旧开 find 视图（顶栏有「完成」可关），
     * 但 notifyFindDone 因回调名为空直接返回，不再弹「没认出」误导人。 */
    if (typeof Host !== 'undefined' && Host && Host.openFinderFor) {
      Host.openFinderFor(HOME, '打开教务网 · 复制考试表后回来', '');
    } else {
      toast2('\u8bf7\u5728 App \u5185\u4f7f\u7528\u8fd9\u4e2a\u529f\u80fd');
    }
  }

  /* v1.1.71：开双探视图。人在教务里按一次「检索」/「导出」，Java 侧
   * shouldInterceptRequest + DownloadListener 记下候选地址，按「完成」回传，
   * __onXqProbe 挑最像报表的那条记住，之后 fetchExams 全自动重放。 */
  function probe() {
    if (typeof Host !== 'undefined' && Host && Host.openProbeFor) {
      Host.openProbeFor(HOME, '自动同步 · 检索或导出后按完成', '__onXqProbe');
    } else if (typeof Host !== 'undefined' && Host && Host.openFinderFor) {
      Host.openFinderFor(HOME, '打开教务网', '');
    } else {
      toast2('请在 App 内使用这个功能');
    }
  }

  function importText(txt) {
    const exams = parseCapture(String(txt == null ? '' : txt));
    if (!exams.length) return { count: 0, error: NO_PARSE };
    save(exams, '', '\u7c98\u8d34\u5bfc\u5165');
    return { count: exams.length };
  }

  /* v1.1.70：从系统剪贴板读文字 → 解析 → 落快照，一步到位。
   * 剪贴板由 Java 桥 Host.getClip() 读（file:// 下拿不到 navigator.clipboard）。
   * 读不到 / 认不出都返回 raw，让卡片把原文摊进框给人看、能改再导入，
   * 绝不落空快照冒充同步成功。 */
  function importClip() {
    let txt = '';
    try {
      if (typeof Host !== 'undefined' && Host && Host.getClip) txt = String(Host.getClip() || '');
    } catch (e) { txt = ''; }
    if (!trim(txt)) return { count: 0, error: NO_CLIP, raw: '' };
    const exams = parseCapture(txt);
    if (!exams.length) {
      ps(RAW_KEY, String(txt).slice(0, 20000));   // 认不出：原文摊进框，可改再导入
      return { count: 0, error: NO_PARSE, raw: String(txt).slice(0, 20000) };
    }
    save(exams, '', '从剪贴板导入');
    return { count: exams.length, raw: String(txt).slice(0, 20000) };
  }

  function clear() {
    ps(SNAP_KEY, ''); ps(RAW_KEY, ''); ps(AUTO_KEY, '');
    LAST_DIAG = defaultDiag();
  }
  function has() { const s = loadSnap(); return !!(s && s.exams && s.exams.length); }

  /* v1.1.71：把报表页（青果 *_excel*.jsp 直出的 GBK 表格 HTML）转成
   * 解析器认得的「一行一考试、单元格用空格隔开」的文本。 */
  function htmlToText(html) {
    let t = String(html == null ? '' : html)
      .replace(/<\s*\/?\s*tr[^>]*>/gi, '\n')
      .replace(/<\s*\/?\s*(td|th)[^>]*>/gi, '\t')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/?\s*p[^>]*>/gi, '\n');
    try {
      if (typeof SOURCES !== 'undefined' && SOURCES && SOURCES.stripTags) t = SOURCES.stripTags(t);
      else t = t.replace(/<[^>]*>/g, ' ');
    } catch (e) { t = t.replace(/<[^>]*>/g, ' '); }
    return t;
  }

  function fromSnap(prefix) {
    const snap = loadSnap();
    const diag = String((snap && snap.diag) || LAST_DIAG || defaultDiag())
      + (prefix ? '（' + prefix + '，已保留上次读到的考试）' : '');
    if (!snap || !snap.exams || !snap.exams.length) {
      return { state: 'degraded', error: NOEXAM, diag: diag };
    }
    return {
      state: 'ok', works: [], exams: snap.exams,
      synced_at: snap.at || nowSec(), diag: diag,
    };
  }

  /* v1.1.71：fetchExams 是 SOURCES 的抓取钩子。
   *   ① 已记住自动报表地址（AUTO_KEY）→ 照课表那样带 Cookie 全自动重放：
   *      SOURCES.http(url) → 解析 → ok，零复制。重放失败/认不出仍保留上次快照，
   *      绝不把「凭证失效页」当 0 条考试。
   *   ② 没记住地址 → 退回导入快照（剪贴板 / 粘贴 / 回跳读页）。
   *   ③ 都没有 → degraded + 三步指引，绝不落成「0 条考试」。 */
  function fetchExams(onStep) {
    const auto = autoLoad();
    if (auto && typeof SOURCES !== 'undefined' && SOURCES && SOURCES.http) {
      if (onStep) { try { onStep('正在自动同步考试安排…'); } catch (e) {} }
      return Promise.resolve(SOURCES.http(auto.url, {
        cookieUrl: BASE + '/', referer: HOME, method: 'GET',
      })).then(function (res) {
        if (res && res.ok && res.text) {
          const exams = parseCapture(htmlToText(res.text));
          if (exams.length) {
            const at = save(exams, auto.url, '全自动同步');
            return { state: 'ok', works: [], exams: exams,
              synced_at: at, diag: '已按记住的报表地址全自动同步 ' + exams.length + ' 场考试。' };
          }
          /* v1.1.72：地址还在、但拿回的不是考试表（多半是凭证失效页或外壳页）。
           * 记一次失败；连续两次就忘掉这条地址，别一直白打请求。 */
          autoFail('页面里没有考试条目');
          return fromSnap(res && res.error);
        }
        autoFail((res && res.error) || '请求失败');
        return fromSnap(res && res.error);
      }).catch(function () { autoFail('自动同步异常'); return fromSnap('自动同步失败'); });
    }
    return Promise.resolve(fromSnap(''));
  }

  /* WebView 辅助发现的回跳：MainActivity.notifyFindDone 把 FIND_JS 的 JSON
   * 文本用 JSONObject.quote 包成 JS 字符串字面量传进来，这里 JSON.parse 回对象。 */
  window.__onXqFind = function (jsonText) {
    let obj = null;
    try { obj = (typeof jsonText === 'string') ? JSON.parse(jsonText) : jsonText; }
    catch (e) { obj = null; }
    const exams = obj ? parseCapture(obj) : [];
    const url = (obj && obj.u) ? String(obj.u) : '';
    if (!exams.length) {
      const rawText = rawTextOf(obj);
      ps(RAW_KEY, rawText);                       // 读回原文落盘，粘贴框会把它摊出来
      const nf = (obj && Array.isArray(obj.frames)) ? obj.frames.length : 0;
      const fsum = (obj && Array.isArray(obj.frames)) ? obj.frames.map(function (f, i) {
        return '#' + i + ' ' + ((f && f.u) ? f.u : '?') + ' '
          + ((f && f.text) ? String(f.text).length : 0) + '\u5b57/'
          + ((f && Array.isArray(f.tables)) ? f.tables.length : 0) + '\u8868';
      }).join('\uff1b') : '';
      LAST_DIAG = '\u8f85\u52a9\u53d1\u73b0\uff1a\u6253\u5f00\u4e86 ' + (url || '\u6559\u52a1\u9875\u9762')
        + '\uff0c\u9876\u5c42 ' + ((obj && obj.text) ? String(obj.text).length : 0)
        + ' \u5b57\uff0c\u9012\u5f52\u8bfb\u4e86 ' + nf + ' \u4e2a\u6846\u67b6\uff08\u542b <frame>\uff09'
        + (fsum ? '\uff1a' + fsum : '')
        + '\uff0c\u4ecd\u6ca1\u8ba4\u51fa\u8003\u8bd5\u6761\u76ee\u3002\u8bf7\u9009\u597d\u5b66\u5e74\u5b66\u671f\u548c\u8003\u8bd5\u6279\u6b21\u3001\u6309\u300c\u68c0\u7d22\u300d\u628a\u8868\u67e5\u51fa\u6765\u518d\u6309\u300c\u5b8c\u6210\u300d\uff1b'
        + '\u8bfb\u56de\u7684\u539f\u6587\u5df2\u653e\u8fdb\u559c\u9e4a\u5361\u7247\u7684\u6846\uff0c\u53ef\u6539\u52a8\u540e\u518d\u5bfc\u5165\u3002';
      if (window.SrcUI && window.SrcUI.paint) window.SrcUI.paint();
      /* 二级半框此刻若正开着，直接把原文摊进已渲染的框（paint 重建后也补一遍） */
      try {
        const tas = (typeof document !== 'undefined' && document.querySelectorAll)
          ? document.querySelectorAll('textarea.src-paste') : [];
        for (let z = 0; z < tas.length; z++) {
          tas[z].value = rawText.slice(0, 20000);
          tas[z].setAttribute('rows', '5');
        }
      } catch (e) {}
      toast2('\u8fd9\u4e00\u9875\u6ca1\u8ba4\u51fa\u8003\u8bd5\u8868\uff1a\u5148\u6309\u300c\u68c0\u7d22\u300d\u628a\u8868\u67e5\u51fa\u6765\u518d\u6309\u5b8c\u6210\uff1b\u8bfb\u56de\u7684\u539f\u6587\u5df2\u653e\u8fdb\u6846\u91cc\uff0c\u53ef\u6539\u540e\u518d\u5bfc\u5165');
      return;
    }
    save(exams, url, '\u6559\u52a1\u9875\u9762\u8bfb\u56de');
    /* 落完快照必须刷一遍来源：SrcUI.sync → SOURCES.refresh → live() 才读得到。 */
    if (window.SrcUI && window.SrcUI.sync) window.SrcUI.sync('xiqueer', true);
    else if (window.SOURCES && window.SOURCES.refresh) window.SOURCES.refresh('xiqueer', function () {});
    toast2('\u5df2\u4ece\u6559\u52a1\u8bfb\u5230 ' + exams.length + ' \u573a\u8003\u8bd5');
  };

  /* ================== v1.1.71 双探回跳 ================== */
  /* MainActivity.notifyFindDone 把 FIND_JS 对象（Java 侧已并入 probes）传进来。
   * ① 页面里直接渲染出了考试表 → 当场认并落快照；
   * ② 否则从拦到的候选请求里挑最像「课表那种报表端点」的地址记进 AUTO_KEY；
   * ③ 两路都被挡 → 摊原文 + 诚实降级，剪贴板/粘贴兜底照旧。 */
  function probeScore(p) {
    const u = String((p && p.url) || '');
    const low = u.toLowerCase();
    let s = 0;
    if (low.indexOf('qgjw.xxmu.edu.cn') >= 0 || u.indexOf('/student/') >= 0) s += 2;
    if (p && p.kind === 'download') s += 4;                       // 导出/打印最像课表
    if (low.indexOf('download') >= 0) s += 3;
    if (low.indexOf('params=') >= 0 || low.indexOf('excel') >= 0) s += 4;
    if (low.indexOf('export') >= 0 || low.indexOf('print') >= 0) s += 3;
    if (low.indexOf('ksap') >= 0 || low.indexOf('exam') >= 0
        || low.indexOf('kaoshi') >= 0 || low.indexOf('kscx') >= 0) s += 3;
    if (low.indexOf('.jsp') >= 0 || low.indexOf('.action') >= 0
        || low.indexOf('.do') >= 0) s += 1;
    if (String((p && p.method) || 'GET').toUpperCase() === 'GET') s += 1;
    else s -= 3;
    if (low.indexOf('about:blank') >= 0 || low.indexOf('homes.action') >= 0
        || low.indexOf('menu.jsp') >= 0 || low.indexOf('login') >= 0
        || low.indexOf('custom/js/') >= 0 || low.indexOf('.css') >= 0
        || low.indexOf('.png') >= 0 || low.indexOf('.gif') >= 0) s = 0;
    return s > 0 ? s : 0;
  }

  function fireSync() {
    if (window.SrcUI && window.SrcUI.sync) window.SrcUI.sync('xiqueer', true);
    else if (window.SOURCES && window.SOURCES.refresh) window.SOURCES.refresh('xiqueer', function () {});
  }

  window.__onXqProbe = function (jsonText) {
    let obj = null;
    try { obj = (typeof jsonText === 'string') ? JSON.parse(jsonText) : jsonText; }
    catch (e) { obj = null; }
    if (!obj || typeof obj !== 'object') obj = {};

    const pageExams = parseCapture(obj);
    if (pageExams.length) {
      save(pageExams, String(obj.u || ''), '教务页直接读回');
      fireSync();
      toast2('已从教务读到 ' + pageExams.length + ' 场考试，之后全自动刷新');
      return;
    }

    const list = Array.isArray(obj.probes) ? obj.probes : [];
    let best = null, bestScore = 0;
    for (let i = 0; i < list.length; i++) {
      const sc = probeScore(list[i]);
      if (sc > bestScore) { bestScore = sc; best = list[i]; }
    }
    if (best && bestScore >= 5) {
      autoSave(best.url, best.kind || 'auto');
      LAST_DIAG = '双探已记住自动地址：' + best.url + '（' + (best.kind || 'request')
        + '，评分 ' + bestScore + '）。之后像课表一样带登录态全自动刷新，不用再复制。';
      fireSync();
      toast2('已记住自动同步地址，正在试跑一次…');
      return;
    }

    const rawText = rawTextOf(obj);
    ps(RAW_KEY, rawText);
    LAST_DIAG = '双探：打开了 ' + (obj.u || '教务页') + '，读到 ' + list.length
      + ' 条候选请求，但没有像课表那样能重放的报表地址，页面里也没认出考试条目。'
      + '请确认已按「检索」把表查出来（或点一次「导出」）再按「完成」；'
      + '实在不行就用「从剪贴板导入」或把文字粘进框，读回原文已摊进框里。';
    if (window.SrcUI && window.SrcUI.paint) window.SrcUI.paint();
    try {
      const tas = (typeof document !== 'undefined' && document.querySelectorAll)
        ? document.querySelectorAll('textarea.src-paste') : [];
      for (let z = 0; z < tas.length; z++) {
        tas[z].value = rawText.slice(0, 20000);
        tas[z].setAttribute('rows', '5');
      }
    } catch (e) {}
    toast2('这次没记住自动地址；读回的原文已摊进框，可用复制/粘贴兜底');
  };

  window.XQ = {
    find: find, probe: probe, importText: importText, importClip: importClip,
    clear: clear, has: has, lastRaw: lastRaw, auto: autoLoad,
    parse: parseCapture, fetch: fetchExams, score: probeScore, fail: autoFail,
  };

  /* 注册成 SOURCES 的一个「只读快照」来源。openLogin 复用教务登录态
   * （Host.openLogin），hasLogin 因此为真，卡片上保留「重新登录教务」。
   * key 用 xxmu_xq_capture_src，避开旧版 xxmu_xq_exams 里可能残留的缓存。 */
  if (typeof SOURCES !== 'undefined' && SOURCES && SOURCES.define) {
    SOURCES.define({
      id: 'xiqueer', label: '\u559c\u9e4a\u513f / \u9752\u679c', short: '\u559c\u9e4a',
      kinds: ['exam'], key: 'xxmu_xq_capture_src', host: HOST,
      openLogin: function () {
        if (typeof Host !== 'undefined' && Host && Host.openLogin) Host.openLogin();
      },
      fetch: fetchExams,
    });
  }
})();
