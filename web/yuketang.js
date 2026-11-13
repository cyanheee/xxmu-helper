/* 河医大助手 · 雨课堂适配器（v1.1.81 · 方案 C 真接活清单 + 方案 B 登录链路修复）
 *
 * ================== v1.1.81 修「扫码登录了没成功」====================
 * 根因和知到 v1.1.78 同款（lesson 0mweebrn）：okHints 里那串业务页片段会被
 * WebActivity.isLoggedInUrl 用 `u.contains(h)` 命中扫码后跳的中间页，
 * onPageFinished 就自动秒关，回跳还写下假 __bound —— 没拿到 sessionid 却判
 * 「已登录」，盲发探针全 50000。这版：
 *   ① okHints 换成永不命中的哨兵 OK_SENTINEL（登录完成只认点右上角「完成」）；
 *   ② 真登录判据独立成 AUTH_KEY，只有点完成且验到区域 cookie 才写，
 *      curLoggedIn = authed() && hasCookie()，不再认秒关留下的假 __bound；
 *   ③ 覆盖 __onSrcDone_yuketang 回跳，取消 / 没验到 cookie 一律清掉登录态；
 *   ④ basic-info 报 50000 时状态收成 stale、诊断写明当前区域与两条疑似原因
 *      （区域不匹配 / 没拿到 sessionid），连接卡显示「需重新登录」+ 一键直达重扫，
 *      自动刷新会跳过失效来源，不弹满屏 toast、不对着失效接口反复打。
 * 天花板：微信扫码必须人来做，机器代不了；这里只把「失效」说清并给一键重登。
 * ====================================================================
 *
 * ================== 这一版和上一版的区别 ==================
 * v1.1.66 只留了框架 + 诚实降级，因为当时没有 sessionid、也没有可信端点。
 * 现在端点是拿真源码核过的（yuketang-mcp 的 src/api.ts），并且无登录态实测
 * 过：`/api/v3/classroom/on-lesson-upcoming-exam` 返回 200
 * `{"code":50000,"msg":"UNAUTHENTICATED"}`、`/v2/api/web/courses/list` 返回 401
 * ——端点全活，只差登录态。所以这一版真接：
 *
 *   1) GET /api/v3/user/basic-info                               验登录态
 *   2) GET /api/v3/classroom/on-lesson-upcoming-exam             待考考试 + 正在上课
 *   3) GET /v2/api/web/courses/list?identity=2                   课程列表（identity=2 学生视角）
 *   4) 每课 GET /v2/api/web/logs/learn/{classroomId}?actype=-1&page=0&offset=50&sort=-1
 *      时间轴：type 5=试卷作业 / 19=章节作业，is_finished=false 即待做
 *   5) 每课 GET /c27/online_courseware/schedule/course/progress/?classroom_id=&course_id=
 *      章节树叶：score_deadline 补截止时间，progress.done/total 补完成度
 *
 * 请求量 2+2N（N≈6-10），限 4 并发，首屏 4-6 秒。
 *
 * ================== 为什么一定要输 xtbz: ykt ==================
 * `/c27/*` 与 `/mooc-api/*` 缺这个头会返回 40000；全局带上无害（client.ts 结论）。
 * 不带则章节进度整批失败——那正好是截止时间的唯一来源。
 *
 * ================== 三套成功字段必须分流 ==================
 * 雨课堂同一批接口里并存三种成功标志：`success:boolean`（看 error_code/sub_code）、
 * `errcode`（0 为成功）、`code`（0 为成功）。只认一种会把成功当失败，解析顺序不能改。
 *
 * ================== 四区域：必须让人选，不能猜 ==================
 * standard / hetang（荷塘）/ changjiang（长江）/ huanghe（黄河）四套部署会话互不通用，
 * 同一账号在 A 区的 sessionid 拿到 B 区不认。
 *
 * v1.1.75 修正：v1.1.74 写死 standard，而 YG 自己用的是长江雨课堂（m03730
 * 「我用的是长江雨课堂，不是这个雨课堂」）——扫码在 standard 域留下了 Cookie，
 * 接口却全打在 www.yuketang.cn，等于一个都读不到。
 * 现在四区可切，**默认长江**（本校口径），卡片上能换；
 * 选中区域存 pref `xxmu_ykt_region`，登录态判断、登录入口、清 Cookie
 * 三处都跟着当前区域走，不再钉在某个域上。
 *
 * ================== hints 为什么这么填 ==================
 * WebActivity.isLoggedInUrl 用 `||` 分段比对 URL：badHints 命中即判未登录，
 * okHints 命中才判已登录。okHints 只放登录后才出现的业务页片段，
 * 绝不放裸 '/web' ——登录入口本身就叫 /web，放进去会把扫码页误判成已登录。
 *
 * ================== 诚实红线 ==================
 * 只读：不代签到、不代作答、不代发帖。已完成作业的题面平台本身就不给读。
 * 解析不出条目时返回 degraded 并说「接口返回了但没认出条目」，绝不返回空清单
 * 冒充「这学期没作业」。截止时间读不到就留空，由渲染层写「时间未读到」。
 */
(function () {
  'use strict';

  /* ---------------- 四个区域（会话互不通用，必须让用户选）--------------- */
  var REGIONS = [
    { id: 'changjiang', name: '长江', host: 'https://changjiang.yuketang.cn' },
    { id: 'standard', name: '雨课堂', host: 'https://www.yuketang.cn' },
    { id: 'hetang', name: '荷塘', host: 'https://pro.yuketang.cn' },
    { id: 'huanghe', name: '黄河', host: 'https://huanghe.yuketang.cn' }
  ];
  /* 默认长江：本校用的是长江雨课堂（YG m03730）。换区存 pref，下次记住。 */
  var REGION_KEY = 'xxmu_ykt_region';
  var DEFAULT_REGION = 'changjiang';

  function regionOf(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }
  function curRegion() {
    var id = '';
    try {
      id = (typeof XXMU !== 'undefined' && XXMU.pref) ? String(XXMU.pref(REGION_KEY) || '') : '';
    } catch (e) { id = ''; }
    return regionOf(id) || regionOf(DEFAULT_REGION);
  }
  function setRegion(id) {
    if (!regionOf(id)) return false;
    try {
      if (typeof XXMU !== 'undefined' && XXMU.pref) XXMU.pref(REGION_KEY, id);
    } catch (e) { return false; }
    return true;
  }

  /* 当前区域的三个地址。所有请求、登录入口、Cookie 判定都从这里取，
   * 一处切换全链路跟着走——v1.1.74 把它们写成常量，扫描留下了长江的
   * Cookie 却把请求全打到 standard，等于一个都读不到。 */
  function hostNow() { return curRegion().host; }
  function baseNow() { return curRegion().host; }
  function loginNow() { return curRegion().host + '/web'; }

  var HDR = 'xtbz: ykt';

  var NEED_LOGIN = '还没登录雨课堂。点「登录 / 绑定雨课堂」，用微信扫码后回到这里再同步一次。';
  var EXPIRED = '雨课堂说登录失效了（code 50000）。重新扫一次码就行，已读到的作业和考试不会丢。';
  var NO_PARSE = '雨课堂接口返回了，但没认出作业条目。可能是平台改版了，把卡片上的诊断发我再修。';

  /* v1.1.81 登录链路修复（仿知到 v1.1.79）：真登录判据独立成 AUTH_KEY，
   * okHints 用永不命中的哨兵，登录完成只认用户点右上角「完成」。 */
  var AUTH_KEY = 'xxmu_ykt_auth';
  var OK_SENTINEL = '/__xxmu_ykt_manual_done__/';
  var CB = '__onSrcDone_yuketang';
  var BAD_HINTS = '/login||/passport||/signin||/qrcode||/bind';

  /* ---------------- 基础设施 ---------------- */

  function api(path) {
    return SOURCES.http(baseNow() + path, {
      cookieUrl: hostNow() + '/', referer: loginNow(), headers: HDR
    });
  }

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function str(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return '';
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function rec(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

  /* v1.1.76：不再死认 `data.activities` / `data.course_progress`。
   * 真机返回「已登录：梁牛翔；课程 3 门；待考考试 0 场；时间轴条目 0，章节叶 0」
   * ——接口都成功，只是条目挂在我没猜到的层级上，被当成「这学期没作业」。
   * 下面两个下探函数按字段名/形状找数组，找不到就交给诊断把骨架打出来。 */

  function ownKeys(o) {
    var r = rec(o), ks = [];
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) ks.push(k);
    return ks;
  }

  /* 响应骨架（给「复制诊断」用）：只打键名与数组长度，不打内容，
   * 既不泄露作业正文也够定位层级。 */
  function skeleton(root, depth) {
    var maxD = (depth === undefined) ? 2 : depth;
    var parts = [];
    (function walk(node, d, path) {
      if (d > maxD || !node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        parts.push(path + '[' + node.length + ']');
        if (node.length) walk(node[0], d + 1, path + '[0]');
        return;
      }
      var keys = ownKeys(node);
      for (var i = 0; i < keys.length && i < 10; i++) {
        var k = keys[i], v = node[k], p = path ? path + '.' + k : k;
        if (Array.isArray(v)) {
          parts.push(p + '[' + v.length + ']');
          if (v.length && d + 1 <= maxD) walk(v[0], d + 1, p + '[0]');
        } else if (v && typeof v === 'object') {
          walk(v, d + 1, p);
        } else {
          parts.push(p + '=' + String(v).slice(0, 18));
        }
        if (parts.length > 26) return;
      }
    })(root, 0, '');
    return parts.join(' ');
  }

  /* 按断言找第一个匹配的数组，返回 {key, value}；找不到 null。 */
  function deepArray(root, match, maxDepth) {
    var maxD = maxDepth === undefined ? 4 : maxDepth;
    var seen = [];
    function walk(node, d, path) {
      if (d > maxD || !node || typeof node !== 'object') return null;
      if (seen.indexOf(node) >= 0) return null;
      seen.push(node);
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length && i < 3; i++) {
          var sub = walk(node[i], d + 1, path + '[]');
          if (sub) return sub;
        }
        return null;
      }
      var keys = ownKeys(node);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j], v = node[k], p = path ? path + '.' + k : k;
        if (Array.isArray(v) && match(k, v)) return { key: p, value: v };
        var found = walk(v, d + 1, p);
        if (found) return found;
      }
      return null;
    }
    return walk(root, 0, '');
  }

  /* 收集所有匹配的数组并拼起来（章节树里 section_leaf_list 会有多份）。 */
  function deepConcat(root, match, maxDepth) {
    var maxD = maxDepth === undefined ? 5 : maxDepth;
    var out = [], seen = [];
    (function walk(node, d) {
      if (d > maxD || !node || typeof node !== 'object') return;
      if (seen.indexOf(node) >= 0) return;
      seen.push(node);
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length && i < 40; i++) walk(node[i], d + 1);
        return;
      }
      var keys = ownKeys(node);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j], v = node[k];
        if (Array.isArray(v) && match(k, v)) {
          for (var t = 0; t < v.length; t++) out.push(v[t]);
        } else {
          walk(v, d + 1);
        }
      }
    })(root, 0);
    return out;
  }

  /* 形状判据：这批对象像不像时间轴条目 / 章节叶。字段名不同也能认出来。 */
  function looksLikeActs(a) {
    var o = rec(a);
    return !!(o.title !== undefined || o.name !== undefined)
      && (o.type !== undefined || o.is_finished !== undefined || o.create_time !== undefined);
  }
  function looksLikeLeaf(a) {
    var o = rec(a);
    return o.leaf_type !== undefined
      || (o.name !== undefined && o.progress && typeof o.progress === 'object');
  }


  /* 毫秒时间戳 → 'YYYY-MM-DD HH:mm'（app.js 用 new Date(s.replace(/-/g,'/')) 解析）。
   * 秒级时间戳（<1e12）先乘 1000。解析不出就返回空串，由渲染层写「时间未读到」。 */
  function fmt(ms) {
    var n = num(ms);
    if (!n) return '';
    if (n < 100000000000) n = n * 1000;
    var d = new Date(n);
    if (isNaN(d.getTime())) return '';
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 三套成功字段分流。返回 {ok, data, err}；err 是可以直接上屏的中文。 */
  function parse(res) {
    if (!res || !res.ok) {
      var e = (res && res.error) ? String(res.error) : '网络不通';
      return { ok: false, err: '连不上雨课堂：' + e };
    }
    var text = String(res.text || '');
    var o = null;
    try { o = JSON.parse(text); } catch (x) { o = null; }
    if (!o || typeof o !== 'object') {
      return { ok: false, err: '雨课堂返回的不是 JSON（可能是登录页），请重新扫码登录。' };
    }
    var good = false, code = '';
    if (typeof o.success === 'boolean') {
      good = (o.success === true);
      code = (o.error_code !== undefined) ? o.error_code : o.sub_code;
    } else if (o.errcode !== undefined) {
      good = (o.errcode === 0 || o.errcode === '0');
      code = o.errcode;
    } else {
      good = (o.code === 0 || o.code === '0');
      code = o.code;
    }
    if (good) return { ok: true, data: (o.data !== undefined ? o.data : null) };
    var c = String(code == null ? '' : code);
    var msg = str(o.msg) || str(o.message);
    if (c === '50000' || c === '401002' || c === '10005') return { ok: false, err: EXPIRED, code: c };
    if (c === '40000') return { ok: false, err: '雨课堂要求带 xtbz 头（内部参数），这一版已经带了，若仍报请发诊断。', code: c };
    if (c === '80005') return { ok: false, err: '雨课堂要求换用 xtbz 通道（code 80005）。', code: c };
    if (c === '80019') return { ok: false, err: '章节接口换了代（code 80019），本版已改用 course/progress，若仍报请发诊断。', code: c };
    if (c === '20009' || c === '20007') return { ok: false, err: '当前身份读不到这个班（code ' + c + '）。', code: c };
    return { ok: false, err: '雨课堂返回失败：code ' + (c || '未知') + (msg ? '，' + msg : ''), code: c };
  }

  /* 限并发跑一批任务，任何一条失败都只让它自己变 null，不拖垮整批。 */
  function pool(items, limit, fn) {
    var out = new Array(items.length);
    var i = 0;
    function next() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return Promise.resolve()
        .then(function () { return fn(items[k], k); })
        .then(function (v) { out[k] = v; })
        .catch(function () { out[k] = null; })
        .then(next);
    }
    var starters = [];
    var n = Math.min(limit, items.length);
    for (var j = 0; j < n; j++) starters.push(next());
    return Promise.all(starters).then(function () { return out; });
  }

  /* ---------------- 数据抽取 ---------------- */

  function coursesOf(data) {
    var out = [];
    arr(rec(data).list).forEach(function (raw) {
      var it = rec(raw), c = rec(it.course);
      var cid = str(it.classroom_id);
      if (!cid) return;
      out.push({
        classroomId: cid,
        courseId: str(c.id),
        name: str(c.name) || str(it.name),
        className: str(it.name),
        teacher: str(rec(it.teacher).name),
        term: num(it.term)
      });
    });
    return out;
  }

  function activitiesOf(data) {
    var out = [];
    /* 先按 sdk 口径取 data.activities；取不到就下探找「像时间轴条目」的数组。
     * 真机 0 条就是这一步死认字段造成的。 */
    var list = arr(rec(data).activities);
    if (!list.length) {
      var hit = deepArray(data, function (k, v) {
        if (!v.length) return false;
        for (var i = 0; i < v.length && i < 3; i++) if (looksLikeActs(v[i])) return true;
        return false;
      });
      list = hit ? hit.value : [];
    }
    list.forEach(function (raw) {
      var a = rec(raw);
      out.push({
        id: str(a.id),
        type: num(a.type),
        title: str(a.title) || str(a.name),
        coursewareId: str(a.courseware_id),
        createTime: num(a.create_time),
        finished: (a.is_finished === true)
      });
    });
    return out;
  }

  function leavesOf(data) {
    var out = [];
    /* 章节叶也可能换层级：优先 data.course_progress[].section_leaf_list，
     * 取不到就把所有「像章节叶」的数组拼起来（多份 section_leaf_list 也要）。 */
    var got = false;
    arr(rec(data).course_progress).forEach(function (secRaw) {
      arr(rec(secRaw).section_leaf_list).forEach(function (leafRaw) {
        got = true;
        pushLeaf(leafRaw);
      });
    });
    if (!got) {
      deepConcat(data, function (k, v) {
        if (k === 'section_leaf_list') return true;
        if (!v.length) return false;
        for (var i = 0; i < v.length && i < 3; i++) if (looksLikeLeaf(v[i])) return true;
        return false;
      }).forEach(pushLeaf);
    }
    function pushLeaf(leafRaw) {
      var lf = rec(leafRaw), prog = rec(lf.progress);
      out.push({
        name: str(lf.name),
        leafId: str(lf.id),
        leafType: num(lf.leaf_type),
        locked: (lf.is_locked === true),
        scoreDeadline: num(lf.score_deadline),
        status: str(prog.status),
        done: num(prog.done),
        total: num(prog.total),
        userScore: num(prog.user_score),
        totalScore: num(prog.total_score)
      });
    }
    return out;
  }

  /* leaf_type：0 视频 / 3 推荐 / 4 讨论 / 5 考试作业 / 6 作业 / 8 签到课堂 / 19 章节作业
   * 只关心 5 / 6 / 19 —— 其余不是要交的东西。
   * v1.1.76：另外，只要带截止时间或状态写着「未交/待做」，也当待办收下——
   * 平台新增过类型，硬筛会把新类型作业整批吞掉。 */
  function isDeadlineLeaf(t) { return t === 5 || t === 6 || t === 19; }

  function leafWantsAttention(lf) {
    if (isDeadlineLeaf(lf.leafType)) return true;
    if (lf.scoreDeadline > 0) return true;
    var st = String(lf.status || '');
    return /未交|未完成|待交|待做|待完成|进行中|未提交/.test(st);
  }

  /* 待考考试。upcomingExam 是平台原始对象数组（未映射），字段名按多套候选宽松取，
   * 一个都取不到就跳过——绝不编造课程名或时间。 */
  function examsOf(list) {
    var out = [];
    arr(list).forEach(function (raw) {
      var e = rec(raw);
      var name = str(e.examName) || str(e.exam_name) || str(e.title) || str(e.name);
      if (!name) return;
      var course = str(e.courseName) || str(e.course_name)
        || str(rec(e.course).name) || str(e.classroomName) || str(rec(e.classroom).name);
      var st = e.startTime !== undefined ? e.startTime
        : (e.start_time !== undefined ? e.start_time
          : (e.start !== undefined ? e.start
            : (e.examStartTime !== undefined ? e.examStartTime : e.begin_time)));
      var en = e.endTime !== undefined ? e.endTime
        : (e.end_time !== undefined ? e.end_time
          : (e.end !== undefined ? e.end
            : (e.examEndTime !== undefined ? e.examEndTime : e.finish_time)));
      out.push({
        course: course,
        name: name,
        start: fmt(st),
        end: fmt(en),
        /* 状态留空：平台没给这场考试的状态位，渲染层会按开考时间写「未开考」。 */
        status: '',
        status_known: false,
        place: str(e.classroomName) || str(e.position) || str(e.place),
        source: 'yuketang'
      });
    });
    return out;
  }

  /* ---------------- 主流程 ---------------- */

  function fetchTodo(onStep) {
    var step = typeof onStep === 'function' ? onStep : function () {};
    var diag = [];

    step('检查雨课堂登录态');
    return api('/api/v3/user/basic-info').then(function (r) {
      var p = parse(r);
      if (!p.ok) {
        /* v1.1.81：登录失效（50000 / 401002 / 10005）单独收成 stale，
         * 诊断写明当前区域与两条疑似原因，连接卡才好给人指路重扫；
         * 自动刷新会跳过 stale 来源，不对着失效接口反复打。 */
        if (p.code === '50000' || p.code === '401002' || p.code === '10005') {
          try { if (typeof XXMU !== 'undefined' && XXMU.pref) XXMU.pref(AUTH_KEY, ''); } catch (e) {}
          diag.push('当前区域：' + curRegion().name + '（' + curRegion().host + '）');
          diag.push('两条最可能的原因：① 区域选错，本校一般是「长江」，'
            + '四套雨课堂会话互不通用，换区要重新扫码；② 扫完没真拿到登录态，'
            + '二维码约 5 分钟过期，要进到课程页、再点右上角「完成」才算数。');
          diag.push('basic-info 失败：' + p.err);
          return { state: 'stale', error: p.err, diag: diag.join('；') };
        }
        return { state: 'degraded', error: p.err, diag: 'basic-info 失败：' + p.err };
      }
      var who = rec(p.data);
      var uname = str(who.name) || str(who.Name);
      diag.push('已登录' + (uname ? '：' + uname : ''));

      step('读待考考试与课程列表');
      return Promise.all([
        api('/api/v3/classroom/on-lesson-upcoming-exam'),
        api('/v2/api/web/courses/list?identity=2')
      ]).then(function (rs) {
        var live = parse(rs[0]);
        var cls = parse(rs[1]);

        if (!cls.ok) {
          return { state: 'degraded', error: cls.err, diag: diag.concat(['课程列表失败：' + cls.err]).join('；') };
        }

        var courses = coursesOf(cls.data);
        diag.push('课程 ' + courses.length + ' 门');

        var exams = [];
        var onLesson = 0;
        if (live.ok) {
          var ld = rec(live.data);
          exams = examsOf(ld.upcomingExam);
          onLesson = arr(ld.onLessonClassrooms).length;
          diag.push('待考考试 ' + exams.length + ' 场' + (onLesson ? '，正在上课 ' + onLesson + ' 堂' : ''));
        } else {
          /* 考试这条失败不该让整批失败：课程作业还能出，就照旧出。 */
          diag.push('待考考试没拿到：' + live.err);
        }

        if (!courses.length) {
          return {
            state: 'ok', works: [], exams: exams, synced_at: 0,
            diag: diag.join('；') + '；课程列表为空（这学期没选课，或 identity 口径变了）'
          };
        }

        step('逐课读作业与截止时间（' + courses.length + ' 门）');
        return pool(courses, 4, function (c) {
          return Promise.all([
            api('/v2/api/web/logs/learn/' + encodeURIComponent(c.classroomId)
              + '?actype=-1&page=0&offset=50&sort=-1'),
            api('/c27/online_courseware/schedule/course/progress/?classroom_id='
              + encodeURIComponent(c.classroomId) + '&course_id=' + encodeURIComponent(c.courseId))
          ]).then(function (pair) {
            return {
              course: c,
              acts: parse(pair[0]),
              prog: parse(pair[1])
            };
          });
        }).then(function (rows) {
          /* key = 课程|标题，activities 先入（状态更准），章节叶再补截止时间。 */
          var map = {};
          var order = [];
          var actCount = 0, leafCount = 0, failed = 0;

          function put(courseName, name, endText, status) {
            var key = courseName + '|' + (name || '').trim();
            if (!(name || '').trim()) return;
            var cur = map[key];
            if (cur) {
              if (!cur.end && endText) cur.end = endText;
              if (cur.status === '待做' && status === '已完成') cur.status = status;
              return;
            }
            map[key] = {
              course: courseName, name: (name || '').trim(), end: endText || '',
              status: status, status_known: true, source: 'yuketang'
            };
            order.push(key);
          }

          /** 章节叶的完成度 → 中文状态。可疑就留空（渲染层写「状态未知」）。 */
          function leafStatus(lf) {
            if (lf.done > 0 && lf.total > 0 && lf.done >= lf.total) return '已完成';
            if (typeof CX !== 'undefined' && CX.classify) {
              var k = CX.classify(lf.status);
              if (k === 'done') return '已完成';
              if (k === 'open') return '待做';
            }
            return '';
          }

          rows.forEach(function (row) {
            if (!row) { failed++; return; }
            var courseName = row.course.name || row.course.className || '未标注课程';

            if (row.acts.ok) {
              activitiesOf(row.acts.data).forEach(function (a) {
                /* v1.1.76：不再只收 type 5/19。撞见没见过的类型就整条丢掉，
                 * 正是「数学有作业却一条不出」的第二个原因。
                 * 只排除明确不是作业的两类：9=公告、14=上课记录。 */
                if (a.type === 9 || a.type === 14) return;
                if (!a.title) return;
                actCount++;
                put(courseName, a.title, '', a.finished ? '已完成' : '待做');
              });
              if (!actCount && diag.length < 8) {
                diag.push('时间轴骨架：' + skeleton(row.acts.data));
              }
            } else {
              failed++;
              if (diag.length < 8) diag.push('时间轴失败（' + courseName + '）：' + row.acts.err);
            }

            if (row.prog.ok) {
              leavesOf(row.prog.data).forEach(function (lf) {
                /* v1.1.76：不再只认 leaf_type 5/6/19。平台新增过类型，
                 * 硬筛会把新类型作业整批吞掉；带截止时间或「未交」状态的也算待办。 */
                if (!leafWantsAttention(lf)) return;
                if (!lf.name) return;
                leafCount++;
                var st = leafStatus(lf);
                put(courseName, lf.name, lf.scoreDeadline ? fmt(lf.scoreDeadline) : '', st || '');
              });
              if (!leafCount && diag.length < 9) {
                diag.push('章节骨架：' + skeleton(row.prog.data));
              }
            }
          });

          var works = [];
          order.forEach(function (k) { works.push(map[k]); });

          diag.push('时间轴条目 ' + actCount + '，章节叶 ' + leafCount
            + (failed ? '，' + failed + ' 门课读取失败' : ''));

          /* 一条都没抓到但接口全成功 → 可能是平台改版，宁可报 degraded 也不报「没作业」。 */
          if (!works.length && !exams.length) {
            return {
              state: 'degraded',
              error: NO_PARSE,
              diag: diag.join('；')
            };
          }

          step('整理 ' + works.length + ' 条作业 / ' + exams.length + ' 场考试');
          return {
            state: 'ok',
            works: works,
            exams: exams,
            synced_at: Math.floor(Date.now() / 1000),
            diag: diag.join('；')
          };
        });
      });
    }).catch(function (e) {
      return {
        state: 'degraded',
        error: '雨课堂同步出错了：' + ((e && e.message) ? e.message : String(e)),
        diag: diag.join('；')
      };
    });
  }

  /* 登录态 / 登录入口 / 断开 三件事都按**当前区域**走。
   * 不能交给 define 的默认实现：那三个默认值在读 spec 时就把 host 与
   * loginUrl 定死了，用户换了区域仍旧判旧域的 Cookie（v1.1.74 的死因）。 */
  function authed() { try { return XXMU.pref(AUTH_KEY) === '1'; } catch (e) { return false; } }
  function hasCookie() {
    try {
      if (typeof Host !== 'undefined' && Host && Host.hasCookieFor) {
        return !!Host.hasCookieFor(hostNow() + '/');
      }
    } catch (e) {}
    return false;
  }
  /* 只认「点完成 + 验到 cookie」双重判据。旧版认 xxmu_ykt_todo__bound，
   * 而扫码中间页被 WebActivity 秒关时也会写那个假 __bound —— 没拿到
   * sessionid 却判已登录，盲发探针全 50000（知到 v1.1.78 同款坑）。 */
  function curLoggedIn() { return authed() && hasCookie(); }

  function curOpenLogin() {
    try {
      if (typeof Host === 'undefined' || !Host || !Host.openLoginFor) return false;
      Host.openLoginFor(loginNow(),
        '登录 / 绑定雨课堂 · ' + curRegion().name,
        BAD_HINTS, OK_SENTINEL, '', CB);
      return true;
    } catch (e) { return false; }
  }

  function curLogout() {
    try {
      if (typeof Host !== 'undefined' && Host && Host.clearCookieFor) {
        Host.clearCookieFor(hostNow() + '/');
      }
    } catch (e) {}
    try { XXMU.pref(AUTH_KEY, ''); } catch (e) {}
    try { XXMU.pref('xxmu_ykt_todo__bound', ''); } catch (e) {}
  }

  SOURCES.define({
    id: 'yuketang',
    label: '雨课堂',
    short: '雨课堂',
    kinds: ['work', 'exam'],
    key: 'xxmu_ykt_todo',
    /* host / loginUrl 仍要写：define 用它们判「有没有登录入口」，
     * 真值由下面三个覆盖函数按当前区域实时给。 */
    host: curRegion().host,
    loginUrl: curRegion().host + '/web',
    loginTitle: '登录 / 绑定雨课堂',
    badHints: BAD_HINTS,
    okHints: OK_SENTINEL,
    grabSel: '',
    loggedIn: curLoggedIn,
    openLogin: curOpenLogin,
    logout: curLogout,
    fetch: fetchTodo
  });

  /* 覆盖 define 的默认登录回跳：默认版在扫码中间页被秒关时也会写假
   * __bound。这里只在「用户点完成(ok=true) 且验到区域 cookie」才写
   * AUTH_KEY；取消 / 没验到 cookie 一律清掉，不假装登录成功。 */
  window[CB] = function (ok, acct) {
    if (!ok) {
      try { XXMU.pref(AUTH_KEY, ''); } catch (e) {}
      try { XXMU.toast('已取消雨课堂登录'); } catch (e) {}
      return;
    }
    if (hasCookie()) {
      try { XXMU.pref(AUTH_KEY, '1'); } catch (e) {}
    } else {
      try { XXMU.pref(AUTH_KEY, ''); } catch (e) {}
      try { XXMU.toast('没检测到登录态，请在页面里扫完码、进到课程页后再点右上角「完成」'); } catch (e) {}
    }
    if (window.SrcUI && window.SrcUI.sync) window.SrcUI.sync('yuketang', false);
  };

  /* 给界面用：读当前区域、切区域。切换后要重新登录（会话不通用），
   * 由 app.js 在切完提示「换区要重新扫码」。 */
  window.YKT = window.YKT || {};
  window.YKT.regions = function () {
    return REGIONS.map(function (r) { return { id: r.id, name: r.name, host: r.host }; });
  };
  window.YKT.region = function () { return curRegion().id; };
  window.YKT.setRegion = function (id) { return setRegion(id); };
  window.YKT.regionName = function () { return curRegion().name; };
})();
