/* 河医大助手 - 学习通（超星）作业与考试抓取
 *
 * ================== 为什么要有这个文件 ==================
 *
 * v0.9.8 及以前，学习页显示的作业是打包时写死在 web/homework.js 里的
 * 一份**快照**（由 PC 上的 core/sync_hw.py 抓一次生成）。APK 一装好，
 * 数据就冻结在打包那一刻：
 *
 *   - 你在学习通里交了作业 → App 里还是「待做」
 *   - 过了截止时间 → 倒计时还是按旧的时间戳在跑，显示的天数不对
 *
 * 这不是显示 bug，是根本没有刷新通道。本文件补上这条通道：
 * 在 App 内用登录态直接抓学习通，实时解析。
 *
 * ================== 抓取链路（三步，与 core/chaoxing.py 一致） ==================
 *
 *   1) GET  mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json
 *      → channelList[].content.id           = classId（班级）
 *        channelList[].content.course.data[0].id = courseId（课程）
 *        channelList[].cpi                  = cpi（加密串，后续都要带）
 *
 *   2) GET  mooc1.chaoxing.com/visit/stucoursemiddle?courseid=&clazzid=&vc=1&cpi=
 *      → 正则 data="(/work/getAllWork?…&enc=<32hex>&openc=<32hex>)"
 *        enc/openc 每门课每次都不一样，必须从这一步的页面里现取，不能缓存。
 *
 *   3) GET  mooc1.chaoxing.com + 上一步的 href
 *      **必须带 Referer 指向第 2 步那个页面**，否则返回 3004「无访问权限」。
 *
 * ================== 状态口径（这次一并修的问题） ==================
 *
 * 学习通则里的状态词有七八种，早期代码用「等于 待做」判断未完成，
 * 一旦学习通把「待完成」改成「未交」或者带上 &nbsp; 就整批判错。
 * 现在改成关键词包含匹配，并且**未知状态原样显示、不当成待做**——
 * 宁可显示一个陌生词，也不能把已完成的说成还没做。
 */

const CX = (() => {
  const API_HOST = 'https://mooc1-api.chaoxing.com';
  const HOST = 'https://mooc1.chaoxing.com';
  const LOGIN_URL = 'https://passport2.chaoxing.com/login?fid=&refer='
    + encodeURIComponent('https://i.chaoxing.com');

  const K_HW = 'xxmu_cx_homework';
  const K_AT = 'xxmu_cx_at';

  const hasHost = () => typeof Host !== 'undefined' && Host;

  /* ---------------- 状态口径 ---------------- */

  /* 需要我做 = 未完成。
   * 「待互评」也在里面：那是要我去评别人的作业，仍然是我的活。
   * v1.1.24：「未开始」从这里挪到 NOTSTART_WORDS——它也是「还没到能动手的时候」，
   * 和「待做」不是一回事，用户要求单独列一组，不混进「待完成」。 */
  const OPEN_WORDS = ['待做', '待完成', '未交', '未提交', '重新编辑', '待互评', '进行中'];

  /* 还没到能开始做的时候（考试未开考、作业未开放）。
   * 单独一类：不算「待完成」（还动不了手），更不能算「已完成」。
   * 渲染层（app.js renderHw）会把它单独列一组「未开始」。 */
  const NOTSTART_WORDS = ['未开始', '未开考'];

  /* 已经不用我动手了。
   * 「待批阅」是**我交了**等老师批，算完成；这点最容易搞反。
   *
   * v1.1.5：把「未批阅」从 OPEN_WORDS 挪到这里。它和「待批阅」是同一件事的
   * 两种写法（我都交了，等着老师批），原来判成「待做」会让用户以为还要再交一次。
   * 用户报的原话就是「作业有已完成和未开始，还有未批阅和已批阅」——他把它当
   * 一个独立的终态，那就该落在完成侧。 */
  const DONE_WORDS = ['已完成', '已提交', '已交', '待批阅', '未批阅', '已批阅', '已互评', '已过期', '已结束', '已截止'];

  /** 状态 → 'open' | 'done' | 'unknown' */
  function classify(status) {
    const s = String(status || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '');
    if (!s) return 'unknown';
    /* 先查「完成」类：因为「待批阅」里同时含「批阅」不含「待做」，
     * 而「待互评」含「互评」却也含「待」——所以顺序不能反，
     * 必须先匹配明确表示"已交"的词，再看待办词。 */
    for (const w of DONE_WORDS) if (s.indexOf(w) >= 0) return 'done';
    for (const w of NOTSTART_WORDS) if (s.indexOf(w) >= 0) return 'notstart';
    for (const w of OPEN_WORDS) if (s.indexOf(w) >= 0) return 'open';
    return 'unknown';
  }

  /** 状态的中文标签（未知状态原样返回，绝不改写成"待做"） */
  function label(status) {
    const s = String(status || '').replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
    return s || '状态未知';
  }

  /* ---------------- 基础设施 ---------------- */

  function get(url, referer) {
    return XXMU.netCk(url, 'GET', '', '', '', HOST, referer || '');
  }

  function body(raw) {
    const r = XXMU.splitResp(raw);
    if (r.code < 0) return { ok: false, error: r.body || '网络错误' };
    if (r.code >= 400) return { ok: false, error: 'HTTP ' + r.code, code: r.code };
    return { ok: true, text: XXMU.decodeAuto(r.body), code: r.code };
  }

  /** 登录失效的统一判据（学习通会跳到 passport 或直接给登录框） */
  function deadCheck(text) {
    if (!text) return '学习通返回空内容';
    if (text.indexOf('passport2.chaoxing.com') >= 0) return '学习通登录已失效，请重新登录';
    if (text.indexOf('用户登录') >= 0 && text.indexOf('password') >= 0) return '学习通登录已失效，请重新登录';
    if (text.indexOf('您长时间没有操作') >= 0 && text.indexOf('3004') >= 0) {
      return '学习通返回 3004 无访问权限（Cookie 或 Referer 失效），请重新登录';
    }
    return '';
  }

  function loggedIn() {
    try {
      return hasHost() && Host.hasCookieFor
        ? !!Host.hasCookieFor(HOST + '/')
        : false;
    } catch (e) { return false; }
  }

  /* ---------------- 第 1 步：课程列表 ---------------- */

  function parseCourses(json) {
    let d;
    try { d = JSON.parse(json); } catch (e) {
      return { ok: false, error: '课程列表不是 JSON（大概率登录失效）' };
    }
    if (d.result !== 1) {
      return { ok: false, error: '课程列表返回 result=' + d.result + ' ' + (d.msg || '') };
    }
    const out = [];
    (d.channelList || []).forEach(ch => {
      const content = ch.content || {};
      const arr = (content.course && content.course.data) || [];
      if (!arr.length) return;
      const ct = arr[0];
      out.push({
        cid: String(ct.id || ''),
        clid: String(content.id || ch.key || ''),
        cpi: String(ch.cpi || content.cpi || ''),
        name: String(ct.name || '').trim(),
        className: String(content.name || '').trim(),
      });
    });
    return { ok: true, courses: out };
  }

  /* ---------------- 第 2 步：课程主页取作业/考试入口 ---------------- */

  function coursePage(c) {
    return HOST + '/visit/stucoursemiddle?courseid=' + encodeURIComponent(c.cid)
      + '&clazzid=' + encodeURIComponent(c.clid) + '&vc=1&cpi=' + encodeURIComponent(c.cpi);
  }

  /* ---------------- 第 3 步：解析作业清单 ---------------- */

  const RE_ALLWORK = /data="(\/work\/getAllWork\?[^"]+)"/;
  const RE_ALLEXAM = /data="(\/exam-ans\/exam\/test\?[^"]+)"/;

  function stripTags(s) {
    return String(s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&ensp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------------- 状态位提取（v1.1.5 重写） ----------------
   *
   * 用户报障：内脏学没交却显示「已完成」，未开始的考试也显示「已完成」。
   * 截图里每条卡片的角标都是「—」，说明状态字段读出来是空字符串。
   *
   * 旧写法有两个硬缺陷：
   *
   *   1) 只认 <strong>。`/作业状态：<\/span>(.*?)<\/strong>/` 假定状态一定包在
   *      <strong> 里，且 `.*?` 没开 s 标志——只要学习通把状态换成
   *      <span class="...">已完成</span>，或者中间带了换行，整条就匹配不上，
   *      于是 status = ''。而 status 一空，classify() 返回 'unknown'，
   *      下游又只判 `state === 'open'`，unknown 就顺理成章掉进了「已完成」。
   *
   *   2) 只抠标签内容，不看标签本身。学习通有一版是把状态做成
   *      <span class="zt" title="已完成">…</span>，文字在属性里。
   *
   * 新写法分两跳，任一跳到手就返回：
   *   跳 1（精确）：标签冒号之后，跳过最多三层包裹标签，取第一段纯文本。
   *                无论外层是 strong / span / b / em / font 还是裸文本都能命中。
   *   跳 2（兜底）：截取标签之后最多 300 字的一整段，连属性一起扫状态词。
   *                专门对付「没有文字、只有 title 属性」和马赛克式嵌套。
   * 两跳都认不出具体状态词，就原样返回截到的文本，让用户看到学习通到底写了
   * 什么——比印一个「—」然后被当成「已完成」强得多。
   */
  function pickStatus(blk, labels) {
    const src = String(blk || '');
    for (const lab of labels) {
      /* 「作业状态：」和「状态：」都要试；冒号可能是全角也可能是半角 */
      const head = lab + '\\s*[:：]\\s*</span[^>]*>';

      /* 跳 1：跳过包裹标签拿裸文本 */
      const near = new RegExp(head + '(?:\\s*<[^>]+>){0,3}\\s*([^<]{0,40})').exec(src);
      if (near) {
        const t = stripTags(near[1]);
        const hit = wordIn(t);
        if (hit) return hit;
      }

      /* 跳 2：宽窗口兜底，含属性值 */
      const wide = new RegExp(head + '([\\s\\S]{0,300})').exec(src);
      if (wide) {
        const raw = wide[1];
        const attr = /(?:title|alt|value)\s*=\s*["']([^"']{1,20})["']/.exec(raw);
        const hit2 = wordIn(stripTags(raw)) || (attr && wordIn(attr[1])) || '';
        if (hit2) return hit2;
        const txt = stripTags(raw).slice(0, 20);
        if (txt) return txt;   /* 认不出的词原样返回，别硬编 */
      }
    }
    return '';
  }

  /** 在一段文本里找出状态词（完成侧优先，理由同 classify） */
  function wordIn(text) {
    const s = String(text || '').replace(/[\s\u00a0]+/g, '');
    if (!s) return '';
    for (const w of DONE_WORDS) if (s.indexOf(w) >= 0) return w;
    for (const w of OPEN_WORDS) if (s.indexOf(w) >= 0) return w;
    return '';
  }

  /* ---------------- 诊断：状态读不到时留证据 ----------------
   *
   * 这次的 bug 全靠「角标是—」这一个细节反推，很险：如果学习通下次再改结构，
   * 又是同样的静默失败。所以解析时一旦发现某条状态是空的，就把那一小段原始
   * HTML 存下来（最多 3 条、每条 800 字），「我的 → 反馈」里能直接复制出来。
   * 有了这段原文，下次不用猜，看一眼就知道是标签换了还是文字换了。
   *
   * 只在内存里，不写 pref：这是纯诊断数据，不该占用户存储，也不该跨会话留。
   */
  const DIAG = { statusMiss: [], at: 0 };

  function noteMiss(kind, blk, c) {
    if (DIAG.statusMiss.length >= 3) return;
    DIAG.statusMiss.push({
      kind: kind,
      course: c && c.name,
      html: String(blk || '').slice(0, 800),
    });
  }

  function diag() {
    return { at: DIAG.at, miss: DIAG.statusMiss.slice() };
  }

  /** 清空诊断缓存（每次同步开始时调，避免累积上次的旧样本） */
  function diagReset() {
    DIAG.statusMiss.length = 0;
    DIAG.at = Math.floor(Date.now() / 1000);
  }

  /**
   * 解析作业清单页。
   *
   * 单条结构（学习通原样）：
   *   <li style="padding:30px 0">
   *     <a class="inspectTask" title="作业名" data="workId" data2="relationId">
   *     <span>开始时间：</span>2026-10-31 12:00
   *     <span>截止时间：</span>2026-11-07 23:00
   *     <span>作业状态：</span><strong>已完成</strong>
   */
  function parseWorks(html, c) {
    const works = [];
    const blocks = String(html || '').split(/<li\s+style="padding:30px\s+0"/);
    for (let i = 1; i < blocks.length; i++) {
      const blk = blocks[i].split('</li>')[0];
      if (blk.indexOf('作业状态') < 0) continue;

      let name = '', workid = '', relid = '';
      const a = /class="inspectTask"[^>]*?title="([^"]*)"[^>]*?data="(\d+)"[^>]*?data2="(\d+)"/.exec(blk);
      if (a) {
        name = a[1].trim(); workid = a[2]; relid = a[3];
      } else {
        const nm = /title="([^"]+)"/.exec(blk);
        const wid = /inspectTask"[^>]*data="(\d+)"/.exec(blk);
        name = nm ? nm[1].trim() : '(未命名作业)';
        workid = wid ? wid[1] : '';
      }

      const st = /开始时间：<\/span>([^<]*)/.exec(blk);
      const en = /截止时间：<\/span>([^<]*)/.exec(blk);
      const status = pickStatus(blk, ['作业状态', '状态']);
      if (!status) noteMiss('work', blk, c);

      works.push({
        course: c.name,
        courseid: c.cid,
        classid: c.clid,
        cpi: c.cpi,
        name: name,
        start: st ? st[1].trim() : '',
        end: en ? en[1].trim() : '',
        status: status,
        workid: workid,
        relationid: relid,
        /* 深层作业页 /mooc-ans/work/doHomeWork 实测是死链（404），
         * 统一跳课程主页，页面上有作业 tab。 */
        answer_url: coursePage(c),
        entry: 'course',
      });
    }
    return works;
  }

  /* ---------------- 考试清单 ---------------- */

  /**
   * 单条结构：
   *   <a onclick="goTest('<cid>',<relationId>,0,'<截止>',<paperId>,false,'<hash>');"
   *      title="考试名">
   *   <span>考试时间：</span>2026-10-30 18:06 至 2026-11-07 23:00
   *   <span>考试状态：</span><strong>待做</strong>
   *   分数： <strong>90分</strong>
   *
   * v1.1.5：状态改成和作业同一套 pickStatus 提取。用户报「未开始的考试显示
   * 已完成」，只靠换提取方式不够——真正的兜底是 finish() 里那条「还没到开考
   * 时间就一律算待考」，见那里的注释。
   */
  function parseExams(html, c) {
    if (String(html || '').indexOf('暂无内容') >= 0) return [];
    let seg = String(html);
    const i = seg.indexOf('class="ulDiv"');
    if (i > 0) seg = seg.slice(i);

    const exams = [];
    const blocks = seg.split(/<li[\s>]/);
    for (let k = 1; k < blocks.length; k++) {
      const blk = blocks[k].split('</li>')[0];
      if (blk.indexOf('考试时间') < 0) continue;

      const t = /title="([^"]{2,120})"/.exec(blk);
      const tm = /考试时间：<\/span>\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*至\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/.exec(blk);
      const status = pickStatus(blk, ['考试状态', '状态']);
      if (!status) noteMiss('exam', blk, c);
      const sc = />\s*(\d+(?:\.\d+)?)\s*分\s*</.exec(blk);
      const gm = /goTest\(\s*'?(\d+)'?\s*,\s*(\d+)\s*,\s*(\d+)\s*,/.exec(blk);

      exams.push({
        course: c.name,
        courseid: c.cid,
        classid: c.clid,
        cpi: c.cpi,
        name: t ? t[1].trim() : '(未命名考试)',
        start: tm ? tm[1] : '',
        end: tm ? tm[2] : '',
        status: status,
        score: sc ? sc[1] : '',
        relationid: gm ? gm[2] : '',
        examid: '',
        url: coursePage(c),
        entry: 'course',
      });
    }
    return exams;
  }

  /* ---------------- 时间换算 ---------------- */

  /** "2026-11-07 23:00" → 秒级时间戳；解析不出来返回 null */
  function ts(str) {
    const s = String(str || '').trim();
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
    if (!m) return null;
    /* 用 Date 构造而不是 new Date(str)：各 WebView 对 "YYYY-MM-DD HH:MM"
     * 这种非 ISO 串的解析结果不一致（有的当本地时间，有的当 UTC），
     * 直接给数字最稳，也和 PC 端 Python 的 mktime 口径一致。 */
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
    const t = d.getTime();
    return isNaN(t) ? null : Math.floor(t / 1000);
  }

  /* ---------------- 组装 ---------------- */

  function finish(works, exams, meta) {
    const now = Math.floor(Date.now() / 1000);

    works.forEach(w => {
      const due = ts(w.end);
      const start = ts(w.start);
      w.end_ts = due;
      w.start_ts = start;
      w.left_hours = due == null ? null : Math.round((due - now) / 36) / 100;
      w.state = classify(w.status);
      w.status_known = !!String(w.status || '').trim();
      w.expired = due != null && due < now;
      /* ---- v1.1.5：状态读不出来时，绝不当成「已完成」 ----
       *
       * 用户报障原话：「我有的作业比如『内脏学』，压根没交却显示已完成」。
       * 截图里那些卡片的角标全是「—」，也就是 status 是空的。
       *
       * 旧代码是 `w.open = classify(w.status) === 'open'`，于是：
       *   status 读空 → classify 返回 'unknown' → open = false → 掉进「已完成」。
       * 一个解析失败，直接变成了「你作业做完了」。
       *
       * 现在按时间兜底：读不出状态时，只要还没到截止时间就仍算「要做」。
       * 两个方向都可能判错，但错的方向不一样：
       *   - 已完成误判成待做：用户点开看一眼，发现做过了，浪费三秒；
       *   - 未交误判成已完成：用户以为没事，直接错过截止。
       * 后者是不可逆的，所以拿不准的时候站到「还得做」这边。
       * 到点之后仍读不出状态，才落进「已过期/状态未知」那一组。 */
      /* v1.1.24：notstart 单独一类——「未开始」不是待做（还动不了手），
       * 但也不是已完成。open 保持 false（不进「待完成」组），
       * 渲染层靠 w.state==='notstart' 把它单独列组。 */
      if (w.state === 'open') w.open = true;
      else if (w.state === 'done') w.open = false;
      else if (w.state === 'notstart') w.open = false;
      else w.open = (due == null || due > now);
    });

    exams.forEach(e => {
      const due = ts(e.end);
      const start = ts(e.start);
      e.start_ts = start;
      e.end_ts = due;
      e.left_hours = due == null ? null : Math.round((due - now) / 36) / 100;
      e.starts_in_h = start == null ? null : Math.round((start - now) / 36) / 100;
      e.state = classify(e.status);
      e.status_known = !!String(e.status || '').trim();
      e.upcoming = start != null && start > now;
      e.expired = due != null && due < now;
      /* 考试同理，并且多一条硬事实：**还没到开考时间，就不可能是「已完成」**。
       * 用户报「有的考试是未开始却也显示已完成」，那要么是状态读错了，
       * 要么是分块错位把上一场的状态安到了这一场上——不管哪种，
       * 开考时间没到就以时间为准，这条不依赖任何解析结果。 */
      /* v1.1.24：notstart（未开始/未开考）单独一组，不进「待完成」。
       * upcoming（开考时间没到）也归这类——本来就是同一件事。 */
      if (e.upcoming || e.state === 'notstart') e.open = false;
      else if (e.state === 'open') e.open = true;
      else if (e.state === 'done') e.open = false;
      else e.open = (due == null || due > now);
    });

    works.sort((a, b) => (a.end_ts == null ? 9e17 : a.end_ts) - (b.end_ts == null ? 9e17 : b.end_ts));
    exams.sort((a, b) => String(a.start || '9999').localeCompare(String(b.start || '9999')));

    const openW = works.filter(w => w.open);
    const openE = exams.filter(e => e.open);

    return {
      synced_at: now,
      source: 'chaoxing',
      term_label: '学习通',
      total: works.length,
      pending: openW.length,
      courses: meta.courses,
      works: works,
      exams: exams,
      exam_total: exams.length,
      exam_upcoming: exams.filter(e => e.upcoming).length,
      errors: meta.errors,
    };
  }

  /* ---------------- 主流程 ---------------- */

  /**
   * 抓全量作业与考试。
   *
   * 单门课失败不影响整体（errors 里记一笔），因为学习通偶尔会对
   * 某一门课返回空页或 3004，不该让整次同步失败。
   */
  function sync(onStep) {
    const step = typeof onStep === 'function' ? onStep : function () {};
    return new Promise((resolve) => {
      if (!hasHost()) { resolve({ ok: false, error: '需要在 App 内使用' }); return; }
      if (!loggedIn()) { resolve({ ok: false, error: '学习通还没登录', needLogin: true }); return; }

      step('正在取课程列表…');
      diagReset();
      get(API_HOST + '/mycourse/backclazzdata?view=json').then(raw => {
        const b = body(raw);
        if (!b.ok) { resolve({ ok: false, error: b.error }); return; }
        const dead = deadCheck(b.text);
        if (dead) { resolve({ ok: false, error: dead, needLogin: true }); return; }

        const pr = parseCourses(b.text);
        if (!pr.ok) { resolve({ ok: false, error: pr.error, needLogin: /登录/.test(pr.error) }); return; }
        if (!pr.courses.length) {
          resolve({ ok: false, error: '账号里没有课程（可能是新学期还没开课）' });
          return;
        }

        const works = [], exams = [], errors = [];
        let done = 0;

        /* 串行而不是并发：学习通对同一账号的并发请求很敏感，
         * 一次打十门课大概率被限流成 3004。宁可慢一点，要的是拿得到。 */
        function next() {
          if (done >= pr.courses.length) {
            const data = finish(works, exams, {
              courses: pr.courses.length, errors: errors,
            });
            try {
              if (Host.setPref) Host.setPref(K_HW, JSON.stringify(data));
              if (Host.setPref) Host.setPref(K_AT, String(data.synced_at));
            } catch (e) {}
            resolve({ ok: true, data: data });
            return;
          }
          const c = pr.courses[done];
          step('正在读第 ' + (done + 1) + '/' + pr.courses.length + ' 门：' + c.name);

          const page = coursePage(c);
          get(page).then(raw2 => {
            const b2 = body(raw2);
            if (!b2.ok) { errors.push({ course: c.name, error: b2.error }); done++; next(); return; }
            const dead2 = deadCheck(b2.text);
            if (dead2) { resolve({ ok: false, error: dead2, needLogin: true }); return; }

            const jobs = [];

            const wm = RE_ALLWORK.exec(b2.text);
            if (wm) {
              const href = wm[1].replace(/&amp;/g, '&');
              jobs.push(get(HOST + href, page).then(r3 => {
                const b3 = body(r3);
                if (!b3.ok) { errors.push({ course: c.name, error: '作业 ' + b3.error }); return; }
                parseWorks(b3.text, c).forEach(w => works.push(w));
              }));
            }

            const em = RE_ALLEXAM.exec(b2.text);
            if (em) {
              const href = em[1].replace(/&amp;/g, '&');
              jobs.push(get(HOST + href, page).then(r4 => {
                const b4 = body(r4);
                if (!b4.ok) { errors.push({ course: c.name, exam: '考试 ' + b4.error }); return; }
                parseExams(b4.text, c).forEach(e => exams.push(e));
              }));
            }

            Promise.all(jobs).then(() => { done++; next(); },
              (e) => {
                errors.push({ course: c.name, error: String(e && e.message || e) });
                done++; next();
              });
          }, e => {
            errors.push({ course: c.name, error: String(e && e.message || e) });
            done++; next();
          });
        }

        next();
      }).catch(e => {
        /* v1.1.8 补的兜底。
         *
         * 这个 Promise 链原来没有 catch：body() / parseCourses() / finish()
         * 只要抛一次，这个 Promise 就永远 pending —— resolve 从未被调用，
         * 调用方 app.js 的 `.then`/`.catch` 一对都不跑，那里的
         * `busy = true`（以及「抓取中…」按钮文案、disabled）也就永不复位。
         * 用户看到的是按钮卡在「抓取中…」不动，连点也没反应，
         * 只有杀掉 App 才能恢复。
         *
         * 注意上一层的 `get(...)` 自己已经吞过网络异常并 resolve 了，
         * 所以能走到这里的只有「解析/组装逻辑自己炸了」这种真 bug。 */
        resolve({ ok: false, error: '解析学习通页面时出错：' + String(e && e.message || e) });
      });
    });
  }

  /** 读上次抓到的缓存（JSON 对象，没有则 null）
   *
   * v1.1.9：解析失败不再静默 return null。
   * 原来 JSON.parse 抛异常就当成「没有缓存」，跟「真的没同步过」在界面上
   * 完全一样 —— 而真实的区别是：前者可以靠重新同步修好，后者要用户去登录。
   * 现在把原因写进 LAST_READ_ERR，由 app.js 的空态显示出来。 */
  let LAST_READ_ERR = '';
  function cached() {
    LAST_READ_ERR = '';
    try {
      if (!hasHost() || !Host.getPref) return null;
      const raw = Host.getPref(K_HW);
      if (!raw || raw.length < 20) return null;
      let d = null;
      try {
        d = JSON.parse(raw);
      } catch (e) {
        LAST_READ_ERR = '本地学习通缓存解析失败：' + String((e && e.message) || e);
        return null;
      }
      if (!d || !Array.isArray(d.works)) {
        LAST_READ_ERR = '本地学习通缓存里没有 works 数组（可能只写了一半）';
        return null;
      }
      return d;
    } catch (e) {
      LAST_READ_ERR = '读本地学习通缓存出错：' + String((e && e.message) || e);
      return null;
    }
  }

  function openLogin() {
    if (hasHost() && Host.openWebFor) {
      Host.openWebFor(LOGIN_URL, '登录学习通', true);
      return true;
    }
    return false;
  }

  function logout() {
    try {
      if (hasHost() && Host.clearCookieFor) Host.clearCookieFor(HOST + '/');
      if (hasHost() && Host.setPref) Host.setPref(K_HW, '');
      /* v1.1.8：K_AT（上次同步时间）也要清。
       * 原来只清作业缓存，时间戳留着 —— 界面上就不再是「没同步过」，
       * 而是显示「3 天前同步」，下面一片空白。用户看到「有同步记录但没数据」，
       * 最自然的判断是 App 坏了，而不是「我刚退出了账号」。 */
      if (hasHost() && Host.setPref) Host.setPref(K_AT, '');
    } catch (e) {}
  }

  return {
    sync, cached, loggedIn, openLogin, logout,
    classify, label, ts, parseCourses, parseWorks, parseExams, finish,
    /* v1.1.5：状态提取单独导出，给 tools/test_hwstatus.js 做离线断言用。
     * 这几个函数是「作业显示对不对」的唯一入口，值得有独立的回归测试。
     * diag/diagReset 给「我的 → 反馈」用：状态读不到时把那段原始 HTML 留出来，
     * 下次学习通改版不用再靠截图反推。 */
    pickStatus, wordIn, stripTags, diag, diagReset,
    OPEN_WORDS, DONE_WORDS, NOTSTART_WORDS,
    readErr: () => LAST_READ_ERR,
    LOGIN_URL, K_HW, K_AT,
  };
})();

/* 学习通登录完成回调（由 Java 侧 WebActivity 回传）
 *
 * 第二个参数 acct 是登录页 input#phone 的值。学习通那个框是「手机号或学号」
 * 二合一，读到 11 位手机号时无法判定身份 —— 那种情况只记下来不拦人。
 * 读到非手机号（多半是学号）时才与软件登记的学号比对。
 */
window.__onCxDone = function (ok, acct) {
  if (ok) {
    let chk = { ok: true, unknown: true, acct: '' };
    try {
      if (typeof LICENSE !== 'undefined' && LICENSE.noteCxAccount) {
        chk = LICENSE.noteCxAccount(acct || '');
      }
    } catch (e) {}
    if (typeof XXMU !== 'undefined') {
      if (chk.unknown) XXMU.toast('学习通登录成功');
      else if (chk.ok) XXMU.toast('学习通登录成功，学号已核对');
      else XXMU.toast('学习通账号（' + chk.acct + '）与登记的学号不一致');
    }
    if (window.__onCxLoggedIn) window.__onCxLoggedIn();
  } else {
    if (typeof XXMU !== 'undefined') XXMU.toast('已取消学习通登录');
  }
};
