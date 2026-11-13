/* 雨课堂适配器（方案 C · 真接活清单）的离线回归测试（v1.1.74）。
 *
 * 门禁钉住的是**行为**，不发任何真网络请求（SOURCES.http 用假路由替身）：
 *   ① 端点清单与上限：验登录态 → 待考考试 → 课程列表 → 每课时间轴 + 章节进度；
 *   ② 三套成功字段（success:boolean / errcode / code）都必须认成成功；
 *   ③ code 50000 / 401002 / 10005 一律翻译成「登录失效，重新扫码」；
 *   ④ 未登录 / 课程列表 401 → degraded，不当成「这学期没作业」；
 *   ⑤ 接口全成功但一条条目都没有 → degraded + 明说没认出（绝不返回空清单冒充没作业）；
 *   ⑥ 章节叶只收 leaf_type 5/6/19，视频（0）不算作业；
 *   ⑦ score_deadline 补截止时间，fmt 成 'YYYY-MM-DD HH:mm'；
 *   ⑧ 毫秒/秒级时间戳都能转；解析不出就留空，绝不编时间；
 *   ⑨ 已完成的作业也要收（进「已完成」页），状态不编造；
 *   ⑩ 考试状态留空（平台没给状态位），由渲染层按开考时间写「未开考」。
 *
 * 用 Node vm 注入假的 SOURCES / XXMU / Host / CX，不碰真机、不联网。
 * 用法：node tools/test_yuketang.js   退出码 0 = 全过
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const YT_SRC = fs.readFileSync(path.join(ROOT, 'web', 'yuketang.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

/* 与适配器内部 fmt 同口径（本地时区），用来比对期望值。 */
function fmtLocal(ms) {
  let n = Number(ms);
  if (!n) return '';
  if (n < 100000000000) n = n * 1000;
  const d = new Date(n);
  if (isNaN(d.getTime())) return '';
  const p = x => (x < 10 ? '0' : '') + x;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* 造沙箱。routes 是「URL 片段 → 响应文本」的假路由；命中最长片段，
 * 没命中返回 404。这样每个用例只描述它关心的几条接口。 */
function load(routes, opts) {
  opts = opts || {};
  const calls = { urls: [], toasts: [] };
  const specBox = {};
  const SOURCES = {
    define(spec) { specBox.spec = spec; return {}; },
    http(url, o) {
      const u = String(url);
      calls.urls.push({ url: u, headers: (o && o.headers) || '', cookieUrl: (o && o.cookieUrl) || '' });
      let best = null, bestLen = -1;
      Object.keys(routes).forEach(function (k) {
        if (u.indexOf(k) >= 0 && k.length > bestLen) { best = k; bestLen = k.length; }
      });
      if (best == null) return Promise.resolve({ ok: false, error: 'HTTP 404', text: '', code: 404 });
      const v = routes[best];
      if (v && typeof v === 'object' && v.__err) {
        return Promise.resolve({ ok: false, error: v.__err, text: '', code: 0 });
      }
      return Promise.resolve({ ok: true, text: typeof v === 'string' ? v : JSON.stringify(v), code: 200 });
    },
    stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' '); },
    now() { return 1700000000; },
  };
  /* pref 用真存取：区域选择靠它记（v1.1.75），返回空串的假 pref 测不出来。
   * v1.1.81：opts.prefs 可预置登录态键，测 AUTH_KEY 双判据；opts.cookie 控验 cookie。 */
  const prefs = Object.assign({}, opts.prefs || {});
  const XXMU = {
    pref(k, v) {
      if (v === undefined) return prefs[k] === undefined ? '' : prefs[k];
      prefs[k] = v;
      return '';
    },
    toast(m) { calls.toasts.push(String(m)); },
  };
  const Host = {
    openLogin() { return true; },
    hasCookieFor() {
      if (opts.cookie !== undefined) return !!opts.cookie;
      return calls.cookie === undefined ? true : !!calls.cookie;
    },
    openLoginFor(url, title, badHints, okHints, grabSel, cb) {
      calls.loginUrl = String(url);
      calls.openLogin = { url: String(url), title: String(title), badHints: String(badHints),
        okHints: String(okHints), grabSel: String(grabSel), cb: String(cb) };
      return true;
    },
    clearCookieFor(url) { calls.cleared = String(url); return true; },
    getPref(k) { return prefs[k] === undefined ? '' : prefs[k]; },
    setPref(k, v) { prefs[k] = v; return true; },
  };
  /* 只借 CX.classify 的口径；DONE/NOTSTART/OPEN 词表与 web/chaoxing.js 一致。 */
  const CX = {
    classify(s0) {
      const s = String(s0 || '').replace(/&nbsp;/g, ' ').replace(/\s+/g, '');
      if (!s) return 'unknown';
      const DONE = ['已完成', '已提交', '已交', '待批阅', '未批阅', '已批阅', '已互评', '已过期', '已结束', '已截止'];
      const NOTSTART = ['未开始', '未开考'];
      const OPEN = ['待做', '待完成', '未交', '未提交', '重新编辑', '待互评', '进行中'];
      for (const w of DONE) if (s.indexOf(w) >= 0) return 'done';
      for (const w of NOTSTART) if (s.indexOf(w) >= 0) return 'notstart';
      for (const w of OPEN) if (s.indexOf(w) >= 0) return 'open';
      return 'unknown';
    },
  };
  const sandbox = {
    console, Date, Math, JSON, String, Number, Array, Object, RegExp, Promise,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    SOURCES, XXMU, Host, CX,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(YT_SRC, sandbox, { timeout: 3000 });
  /* windowSw 暴露给用例：v1.1.75 的区域切换挂在 window.YKT 上。 */
  return { spec: specBox.spec, calls: calls, windowSw: sandbox, prefs: prefs };
}

const P_LOGIN = { '/api/v3/user/basic-info': { code: 0, data: { name: '张与目' } } };

async function main() {
  console.log('\n[v1.1.82] 雨课堂适配器（方案 C 真接活清单 + 登录链路修复 + 作业去重）离线断言');

  /* ---------- ① 注册契约 ---------- */
  const A = load({});
  ok('① define 拿到 yuketang 的 spec', A.spec && A.spec.id === 'yuketang');
  ok('① 不再标 alwaysDegraded（否则永远降级、也不给登录按钮）', !A.spec.alwaysDegraded);
  ok('① kinds 同时出作业与考试', String(A.spec.kinds) === 'work,exam');
  ok('① 有 loginUrl 才给得出「登录 / 绑定雨课堂」按钮',
    typeof A.spec.loginUrl === 'string' && A.spec.loginUrl.indexOf('/web') > 0);

  /* ---------- ② 未登录：code 50000 → 登录失效 ---------- */
  {
    const T = load({ '/api/v3/user/basic-info': { code: 50000, msg: 'UNAUTHENTICATED', data: '' } });
    const r = await T.spec.fetch(function () {});
    ok('② code 50000 判成 stale（登录失效），不是普通 degraded', r.state === 'stale', JSON.stringify(r).slice(0, 160));
    ok('② 说清是登录失效、要重新扫码', /登录失效|重新扫码|扫一次码/.test(String(r.error || '')), r.error);
    ok('② 只打了一条请求就收手（没白跑课程列表）', T.calls.urls.length === 1, T.calls.urls.length);
    ok('② 诊断写明当前区域与两条疑似原因（区域不匹配 / 没拿到登录态）',
      /当前区域/.test(String(r.diag || '')) && /区域选错/.test(String(r.diag || ''))
      && /没真拿到登录态/.test(String(r.diag || '')), r.diag);
    ok('② 失效时把 AUTH_KEY 清掉，不假装还登录着',
      T.prefs['xxmu_ykt_auth'] === '' || T.prefs['xxmu_ykt_auth'] === undefined,
      JSON.stringify(T.prefs['xxmu_ykt_auth']));
  }

  /* ---------- ③ 课程列表 401 → 说 HTTP 401，不冒充没作业 ---------- */
  {
    const T = load(Object.assign({}, P_LOGIN, {
      '/v2/api/web/courses/list': { __err: 'HTTP 401' },
    }));
    const r = await T.spec.fetch(function () {});
    ok('③ 课程列表失败 → degraded', r.state === 'degraded', r.state);
    ok('③ 带上 401 的真实原因', /401/.test(String(r.error || '')), r.error);
    ok('③ 绝不给一个空 works 冒充「没作业」', r.works === undefined, JSON.stringify(r.works));
  }

  /* ---------- ④ 全流程：考试 + 作业 + 章节截止 ---------- */
  const examStart = new Date(2026, 10, 14, 11, 0).getTime();      // 2026-11-14 11:00
  const examEnd = new Date(2026, 10, 14, 12, 0).getTime();
  const dlSec = Math.floor(new Date(2026, 11, 20, 23, 59).getTime() / 1000);  // 秒级，验换算
  const FULL = {
    '/api/v3/user/basic-info': { code: 0, data: { name: '张与目' } },
    '/api/v3/classroom/on-lesson-upcoming-exam': {
      code: 0,
      data: {
        onLessonClassrooms: [{ classroomId: 'c1', courseId: 'k1', courseName: '高等数学B1' }],
        upcomingExam: [{
          examName: '期中考试', courseName: '高等数学B1',
          startTime: examStart, endTime: examEnd, classroomName: '第三教学楼3102',
        }],
      },
    },
    '/v2/api/web/courses/list': {
      code: 0,
      data: {
        list: [
          { classroom_id: 101, name: '高数B1-1班', course: { id: 201, name: '高等数学B1' }, teacher: { name: '李老师' }, term: 202601 },
          { classroom_id: 102, name: '医用物理-2班', course: { id: 202, name: '医用物理学' }, teacher: { name: '王老师' }, term: 202601 },
        ],
      },
    },
    '/v2/api/web/logs/learn/101': {
      code: 0,
      data: {
        activities: [
          { id: 'a1', type: 5, title: '第三章 章节测验', is_finished: false },
          { id: 'a2', type: 19, title: '作业二', is_finished: true },
          { id: 'a3', type: 9, title: '放假通知', is_finished: false },   // 公告不算作业
          { id: 'a4', type: 14, title: '第8次课', is_finished: false },    // 上课记录不算
        ],
      },
    },
    '/v2/api/web/logs/learn/102': { code: 0, data: { activities: [] } },
    /* 进度接口按 classroom_id 分开：两门课共用一个假响应会把同一批章节叶
     * 记到两门课名下，变成假重复——这不是适配器的问题，是 fixture 的错。 */
    '/c27/online_courseware/schedule/course/progress/?classroom_id=101': {
      code: 0,
      data: {
        course_progress: [{
          section_leaf_list: [
            { id: 'l1', name: '第三章 章节测验', leaf_type: 5, score_deadline: dlSec, progress: { status: '', done: 0, total: 10 } },
            { id: 'l2', name: '作业二', leaf_type: 19, score_deadline: 0, progress: { status: '', done: 5, total: 5 } },
            { id: 'l3', name: '第1节 极限', leaf_type: 0, score_deadline: 0, progress: { status: '', done: 1, total: 1 } },
          ],
        }],
      },
    },
    '/c27/online_courseware/schedule/course/progress/?classroom_id=102': {
      code: 0,
      data: { course_progress: [{ section_leaf_list: [] }] },
    },
  };
  {
    const T = load(FULL);
    const steps = [];
    const r = await T.spec.fetch(function (s) { steps.push(String(s)); });
    ok('④ 整体 state=ok', r.state === 'ok', JSON.stringify(r).slice(0, 200));
    ok('④ 带 synced_at', r.synced_at > 0, r.synced_at);
    ok('④ 有进度回报（读登录态→课程→逐课）', steps.length >= 3, steps.join(' / '));

    const works = r.works || [];
    const names = works.map(w => w.name);
    ok('④ 收下 2 条作业（章节测验 / 作业二；章节叶与时间轴同名合并、不重复）',
      works.length === 2, names.join('|'));
    ok('④ 公告（type 9）与上课记录（type 14）不当作业',
      names.indexOf('放假通知') < 0 && names.indexOf('第8次课') < 0, names.join('|'));
    const t1 = works.find(w => w.name === '第三章 章节测验');
    ok('④ 未完成作业状态是「待做」', t1 && t1.status === '待做', t1 && t1.status);
    ok('④ 章节叶补上截止时间，秒级时间戳也换算对',
      t1 && t1.end === fmtLocal(dlSec), t1 && t1.end);
    const t2 = works.find(w => w.name === '作业二');
    ok('④ 已完成的作业也要收（进「已完成」页）', t2 && t2.status === '已完成', t2 && t2.status);
    ok('④ 视频叶（leaf_type 0）不冒出来当作业', names.indexOf('第1节 极限') < 0, names.join('|'));

    const exams = r.exams || [];
    ok('④ 待考考试 1 场', exams.length === 1, JSON.stringify(exams).slice(0, 160));
    ok('④ 考试开考时间是 YYYY-MM-DD HH:mm', exams[0] && exams[0].start === fmtLocal(examStart), exams[0] && exams[0].start);
    ok('④ 考试结束时间同样换算', exams[0] && exams[0].end === fmtLocal(examEnd), exams[0] && exams[0].end);
    ok('④ 考试不编状态（留给渲染层按开考时间写「未开考」）',
      exams[0] && exams[0].status === '' && exams[0].status_known === false);
    ok('④ 考场照抄平台值', exams[0] && /3102/.test(String(exams[0].place)), exams[0] && exams[0].place);

    ok('④ 每条都打来源标签 yuketang',
      works.every(w => w.source === 'yuketang') && exams.every(e => e.source === 'yuketang'));
    ok('④ 请求都带了 xtbz: ykt（否则 /c27 报 40000）',
      T.calls.urls.every(u => /xtbz:\s*ykt/.test(u.headers)), T.calls.urls.map(u => u.headers).join('|'));
    ok('④ 请求量符合 3+2N（验登录 + 待考考试 + 课程列表 + 每课两条 = 7 次）',
      T.calls.urls.length === 7, T.calls.urls.length);
    ok('④ 时间轴与章节进度各打一次，没重复跑',
      T.calls.urls.filter(u => u.url.indexOf('/logs/learn/') > 0).length === 2
      && T.calls.urls.filter(u => u.url.indexOf('course/progress') > 0).length === 2);
  }

  /* ---------- ⑤ 三套成功字段都认 ---------- */
  {
    const SUCC = {
      '/api/v3/user/basic-info': { success: true, data: { name: '甲' } },       // success:boolean 家族
      '/api/v3/classroom/on-lesson-upcoming-exam': { errcode: 0, data: { onLessonClassrooms: [], upcomingExam: [] } }, // errcode 家族
      '/v2/api/web/courses/list': {
        code: 0,
        data: { list: [{ classroom_id: 9, name: '班级', course: { id: 19, name: '诊断学' }, term: 202601 }] },
      },
      '/v2/api/web/logs/learn/9': { code: 0, data: { activities: [{ id: 'x', type: 5, title: '测验一', is_finished: false }] } },
      '/c27/online_courseware/schedule/course/progress/': { code: 0, data: { course_progress: [] } },
    };
    const T = load(SUCC);
    const r = await T.spec.fetch(function () {});
    ok('⑤ success:boolean 与 errcode 两套成功标志都当成功', r.state === 'ok', JSON.stringify(r).slice(0, 200));
    ok('⑤ 拿到作业 1 条', (r.works || []).length === 1);
  }

  /* ---------- ⑥ 接口全成功但零条目 → degraded，不冒充没作业 ---------- */
  {
    const EMPTY = {
      '/api/v3/user/basic-info': { code: 0, data: { name: '乙' } },
      '/api/v3/classroom/on-lesson-upcoming-exam': { code: 0, data: { onLessonClassrooms: [], upcomingExam: [] } },
      '/v2/api/web/courses/list': {
        code: 0,
        data: { list: [{ classroom_id: 7, name: '班', course: { id: 17, name: '病理学' }, term: 202601 }] },
      },
      '/v2/api/web/logs/learn/7': { code: 0, data: { activities: [] } },
      '/c27/online_courseware/schedule/course/progress/': { code: 0, data: { course_progress: [] } },
    };
    const T = load(EMPTY);
    const r = await T.spec.fetch(function () {});
    ok('⑥ 零条目 → degraded 而不是 ok 空清单', r.state === 'degraded', r.state);
    ok('⑥ 明说「没认出作业条目」而不是「这学期没作业」',
      /没认出/.test(String(r.error || '')), r.error);
  }

  /* ---------- ⑦ 考试接口单条失败不拖垮作业 ---------- */
  {
    const PART = Object.assign({}, FULL);
    PART['/api/v3/classroom/on-lesson-upcoming-exam'] = { code: 50000, msg: 'UNAUTHENTICATED' };
    const T = load(PART);
    const r = await T.spec.fetch(function () {});
    ok('⑦ 只有考试接口失效时，作业照旧出', r.state === 'ok' && (r.works || []).length === 2,
      r.state + ' / ' + (r.works || []).length);
    ok('⑦ 诊断里记下考试没拿到', /待考考试没拿到|登录失效/.test(String(r.diag || '')), r.diag);
  }

  /* ---------- ⑧ 时间解析不出就留空，绝不编 ---------- */
  {
    const NOEX = Object.assign({}, FULL, {
      '/api/v3/classroom/on-lesson-upcoming-exam': {
        code: 0,
        data: { onLessonClassrooms: [], upcomingExam: [{ examName: '补考', courseName: '生理学' }] },
      },
    });
    const T = load(NOEX);
    const r = await T.spec.fetch(function () {});
    const e = (r.exams || [])[0];
    ok('⑧ 没给时间就不编时间，start 留空', e && e.start === '', e && JSON.stringify(e.start));
    ok('⑧ 只给名字也照样出这一场（不因缺时间丢弃）', !!e && e.name === '补考');
  }

  /* ---------- ⑨ 网络全断 → degraded 带原因 ---------- */
  {
    const DEAD = { '/api/v3/user/basic-info': { __err: 'ERR:Timeout:请求超时' } };
    const T = load(DEAD);
    const r = await T.spec.fetch(function () {});
    ok('⑨ 网络不通时 degraded', r.state === 'degraded', r.state);
    ok('⑨ 带上真实错误', /Timeout|超时/.test(String(r.error || '')), r.error);
  }

  /* ---------- ⑩ 四个区域：默认长江、换区后请求域/登录入口/清 Cookie 都跟着走 ----------
   * 这是 v1.1.75 的死因回归：v1.1.74 把域写死 standard，YG 用长江雨课堂
   * （m03730），扫码留下的 Cookie 与请求域对不上，一个都读不到。 */
  {
    const T = load(FULL);
    ok('⑩ 默认区是长江（本校口径）', T.spec.loggedIn && T.spec.openLogin);
    /* 打一次真实的 fetch，看请求落在哪个域。 */
    const r = await T.spec.fetch(function () {});
    const hosts = T.calls.urls.map(u => {
      const m = String(u.url).match(/^https:\/\/([^\/]+)/);
      return m ? m[1] : '';
    });
    ok('⑩ 默认请求打在 changjiang.yuketang.cn',
      hosts.length > 0 && hosts.every(h => h === 'changjiang.yuketang.cn'), hosts.join('|'));
    ok('⑩ Cookie 也从长江域取（否则带不上扫码的 sessionid）',
      T.calls.urls.every(u => String(u.cookieUrl).indexOf('changjiang.yuketang.cn') >= 0),
      T.calls.urls.map(u => u.cookieUrl).join('|'));
    ok('⑩ 长江区照旧出作业与考试', r.state === 'ok' && (r.works || []).length === 2
      && (r.exams || []).length === 1, r.state + '/' + (r.works || []).length);

    /* 登录入口按当前区拼，标题带区域名，人一眼知道在扫哪套。 */
    T.spec.openLogin();
    ok('⑩ 登录入口指向长江域', /changjiang\.yuketang\.cn\/web/.test(String(T.calls.loginUrl)), T.calls.loginUrl);

    /* 换到标准区：请求域立刻跟着换，登录入口也换。 */
    const sw = T.windowSw ? T.windowSw : null;
    ok('⑩ 暴露 YKT.setRegion 给界面用', !!(sw && typeof sw.YKT === 'object' && typeof sw.YKT.setRegion === 'function'));
    if (sw && sw.YKT) {
      ok('⑩ 切到 standard 成功', sw.YKT.setRegion('standard') === true);
      ok('⑩ 切完 region() 读到 standard', sw.YKT.region() === 'standard', sw.YKT.region());
      T.calls.urls.length = 0;
      await T.spec.fetch(function () {});
      const h2 = T.calls.urls.map(u => String(u.url).match(/^https:\/\/([^\/]+)/)[1]);
      ok('⑩ 换区后请求改打 www.yuketang.cn',
        h2.length > 0 && h2.every(x => x === 'www.yuketang.cn'), h2.join('|'));
      T.spec.openLogin();
      ok('⑩ 换区后登录入口也换域', /www\.yuketang\.cn\/web/.test(String(T.calls.loginUrl)), T.calls.loginUrl);
      T.spec.logout();
      ok('⑩ 断开只清当前区的 Cookie', /www\.yuketang\.cn/.test(String(T.calls.cleared)), T.calls.cleared);
    }
  }

  /* ---------- ⑪ v1.1.76：条目挂在非标准层级 / 新类型也必须认 ----------
   * 真机「已登录：梁牛翔；课程 3 门；待考考试 0 场；时间轴条目 0，章节叶 0」
   * = 接口成功但结构不一样。YG 原话「绑定账号了，这个里面会发作业，比如数学会有作业。
   * 不应该只局限于考试」——所以这里钉住：换层级、换 type、换 leaf_type 都要能收。 */
  {
    const ALT = {
      '/api/v3/user/basic-info': { code: 0, data: { name: '梁牛翔' } },
      '/api/v3/classroom/on-lesson-upcoming-exam': { code: 0, data: { onLessonClassrooms: [], upcomingExam: [] } },
      '/v2/api/web/courses/list': {
        code: 0,
        data: { list: [{ classroom_id: 301, name: '高数班', course: { id: 401, name: '高等数学' }, term: 202601 }] },
      },
      /* 时间轴没挂在 data.activities，而在 data.records；type 20 是平台新增类型 */
      '/v2/api/web/logs/learn/301': {
        code: 0,
        data: {
          records: [
            { id: 'r1', type: 20, title: '第五章 习题', is_finished: false },
            { id: 'r2', type: 9, title: '放假通知', is_finished: false },
          ],
        },
      },
      /* 章节叶没挂在 data.course_progress，而在 data.progress_tree[].leaves；
       * leaf_type 7 没见过，但状态写着「未交」 */
      '/c27/online_courseware/schedule/course/progress/?classroom_id=301': {
        code: 0,
        data: {
          progress_tree: [{
            leaves: [{ id: 'x1', name: '期中作业', leaf_type: 7, score_deadline: 0, progress: { status: '未交' } }],
          }],
        },
      },
    };
    const T = load(ALT);
    const r = await T.spec.fetch(function () {});
    const names = (r.works || []).map(w => w.name);
    ok('⑪ 时间轴换层级（data.records）也能认出条目', names.indexOf('第五章 习题') >= 0, names.join('|'));
    ok('⑪ 章节叶换层级（progress_tree[].leaves）也能认出', names.indexOf('期中作业') >= 0, names.join('|'));
    ok('⑪ 没见过的 type=20 当作业收下，不再只认 5/19', names.indexOf('第五章 习题') >= 0);
    ok('⑪ 公告（type 9）仍然排除，不能混进作业',
      names.indexOf('放假通知') < 0, names.join('|'));
    const mt = (r.works || []).find(w => w.name === '第五章 习题');
    ok('⑪ 未完成 → 「待做」', mt && mt.status === '待做', mt && mt.status);
    const mp = (r.works || []).find(w => w.name === '期中作业');
    ok('⑪ 没见过的 leaf_type=7 靠「未交」状态也能收下',
      !!mp, names.join('|'));
    ok('⑪ 靠状态收下的条目状态不编造', mp && mp.status === '待做', mp && mp.status);
    ok('⑪ 整体 ok，不是「暂不可用」', r.state === 'ok', r.state);
  }

  /* ---------- ⑫ 结构认不出时，诊断要能打出响应骨架 ----------
   * 这轮真机只回了「时间轴条目 0，章节叶 0」，等于没说哪里不对。
   * 骨架（键名 + 数组长度）能让人一次把原因发回来。 */
  {
    const SHAPE = {
      '/api/v3/user/basic-info': { code: 0, data: { name: '甲' } },
      '/api/v3/classroom/on-lesson-upcoming-exam': { code: 0, data: { onLessonClassrooms: [], upcomingExam: [] } },
      '/v2/api/web/courses/list': {
        code: 0,
        data: { list: [{ classroom_id: 8, name: '班', course: { id: 18, name: '病理学' }, term: 202601 }] },
      },
      '/v2/api/web/logs/learn/8': { code: 0, data: { hello: 'world' } },
      '/c27/online_courseware/schedule/course/progress/?classroom_id=8': { code: 0, data: { note: 'x' } },
    };
    const T = load(SHAPE);
    const r = await T.spec.fetch(function () {});
    ok('⑫ 结构认不出 → degraded，不当成没作业', r.state === 'degraded', r.state);
    ok('⑫ 诊断里打出了时间轴骨架（键名可见）', /时间轴骨架/.test(String(r.diag || '')), r.diag);
    ok('⑫ 键名真的写进了诊断（hello）', /hello/.test(String(r.diag || '')), r.diag);
  }

  /* ---------- ⑬ v1.1.81 登录链路修复：杜绝「扫码登录了没成功」 ----------
   * v1.1.74 真机报 basic-info 50000：okHints 写成业务页片段，扫码中间页
   * 被 isLoggedInUrl 命中秒关，默认回跳写下假 __bound，没拿到 sessionid
   * 却判已登录、盲发探针全 50000。本组钉死：okHints 换永不命中的哨兵、
   * 真登录判据独立成 AUTH_KEY、覆盖回跳只在「完成」+ 验到 cookie 才写、
   * logout / cancel / 失效清干净。 */
  {
    const CB = '__onSrcDone_yuketang';
    const S = load({});

    ok('⑬ define 的 okHints 不含业务页片段 /web（否则扫码中间页被秒关）',
      String(S.spec.okHints).indexOf('/web') < 0, String(S.spec.okHints));
    ok('⑬ define 的 okHints 是非空哨兵（空会退回默认 /frame/ 判定）',
      String(S.spec.okHints).length > 0, String(S.spec.okHints));
    ok('⑬ badHints 仍覆盖登录/护照/扫码/绑定各入口',
      ['login', 'passport', 'signin', 'qrcode', 'bind'].every(h => String(S.spec.badHints).indexOf(h) >= 0),
      String(S.spec.badHints));

    S.spec.openLogin();
    ok('⑬ curOpenLogin 走 openLoginFor 打开当前区域登录页',
      S.calls.openLogin && /changjiang\.yuketang\.cn\/web/.test(S.calls.openLogin.url),
      S.calls.openLogin && S.calls.openLogin.url);
    ok('⑬ 传给 openLoginFor 的 okHints 与 define 一致（哨兵，非业务页）',
      S.calls.openLogin && S.calls.openLogin.okHints === S.spec.okHints,
      S.calls.openLogin && S.calls.openLogin.okHints);
    ok('⑬ 回跳回调名是 __onSrcDone_yuketang',
      S.calls.openLogin && S.calls.openLogin.cb === CB, S.calls.openLogin && S.calls.openLogin.cb);

    /* 真登录判据：只有 AUTH_KEY 才算，秒关写下的假 __bound 不算 */
    const fake = load({}, { prefs: { 'xxmu_ykt_auth': '', 'xxmu_ykt_todo__bound': '1' } });
    ok('⑬ 光有假 __bound=1（没 AUTH_KEY）仍判未登录',
      fake.spec.loggedIn() === false, String(fake.spec.loggedIn()));

    ok('⑬ window[__onSrcDone_yuketang] 被覆盖成自己的函数',
      typeof S.windowSw[CB] === 'function');

    const done = load({}, { prefs: { 'xxmu_ykt_auth': '' }, cookie: true });
    done.windowSw[CB](true, '');
    ok('⑬ 点「完成」(ok=true) 且验到 cookie → 写 AUTH_KEY=1',
      done.prefs['xxmu_ykt_auth'] === '1', JSON.stringify(done.prefs['xxmu_ykt_auth']));
    ok('⑬ 写完判已登录（双判据都满足）', done.spec.loggedIn() === true);

    const cancel = load({}, { prefs: { 'xxmu_ykt_auth': '1' }, cookie: true });
    cancel.windowSw[CB](false, '');
    ok('⑬ 取消(ok=false) → 清掉 AUTH_KEY，回到未登录',
      cancel.prefs['xxmu_ykt_auth'] === '', JSON.stringify(cancel.prefs['xxmu_ykt_auth']));
    ok('⑬ 取消给一句 toast', cancel.calls.toasts.length >= 1, cancel.calls.toasts.join('|'));

    const noCk = load({}, { prefs: { 'xxmu_ykt_auth': '1' }, cookie: false });
    noCk.windowSw[CB](true, '');
    ok('⑬ 点「完成」但没验到 cookie → 不写真登录，清 AUTH_KEY',
      noCk.prefs['xxmu_ykt_auth'] === '', JSON.stringify(noCk.prefs['xxmu_ykt_auth']));
    ok('⑬ 没 cookie 提示「进到课程页再点完成」',
      /完成/.test(noCk.calls.toasts.join('|')), noCk.calls.toasts.join('|'));

    const out = load({}, { prefs: { 'xxmu_ykt_auth': '1', 'xxmu_ykt_todo__bound': '1' }, cookie: true });
    out.spec.logout();
    ok('⑬ logout 清 AUTH_KEY', out.prefs['xxmu_ykt_auth'] === '', JSON.stringify(out.prefs['xxmu_ykt_auth']));
    ok('⑬ logout 清秒关遗留的假 __bound', out.prefs['xxmu_ykt_todo__bound'] === '',
      JSON.stringify(out.prefs['xxmu_ykt_todo__bound']));
    ok('⑬ logout 清区域 Cookie', /yuketang\.cn/.test(String(out.calls.cleared || '')), out.calls.cleared);
  }

  /* ---------- ⑭ v1.1.82 去重：upcomingExam 把带截止的作业又塞一遍 ----------
   * 真机截图：同一条「第十四次作业」列了两张卡（作业卡 + 📝 考试卡），
   * 截止同为 2026-11-15 20:00。根因＝雨课堂 upcomingExam 里混进了作业。
   * 钉死：撞作业名的假考试丢掉、真考试不动、自身重复推送合成一条、
   * 诊断写清删了几张，作业卡（带课程名与状态）信息更全要留着。 */
  {
    const hwName = '第十四次作业 学号尾号为4和9的同学提交(1)';
    const hwEnd = new Date(2026, 10, 15, 20, 0).getTime();   // 2026-11-15 20:00
    const hwEndSec = Math.floor(hwEnd / 1000);
    const examStart2 = new Date(2026, 11, 1, 9, 0).getTime();
    const examEnd2 = new Date(2026, 11, 1, 11, 0).getTime();
    const DUP = Object.assign({}, FULL, {
      '/api/v3/classroom/on-lesson-upcoming-exam': {
        code: 0,
        data: {
          onLessonClassrooms: [{ classroomId: 'c1', courseId: 'k1', courseName: '高等数学B1' }],
          upcomingExam: [
            /* 平台把这条作业又塞进 upcomingExam：名字、截止都与作业一致 → 丢掉 */
            { examName: hwName, courseName: '高等数学B1',
              startTime: new Date(2026, 10, 13, 9, 40).getTime(), endTime: hwEnd },
            /* 真考试：名字不同，一张不动 */
            { examName: '期末考试', courseName: '高等数学B1',
              startTime: examStart2, endTime: examEnd2, classroomName: '第三教学楼3102' },
            /* 同一场真考试被重复推送两次 → 合成一张 */
            { examName: '期末考试', courseName: '高等数学B1',
              startTime: examStart2, endTime: examEnd2, classroomName: '第三教学楼3102' },
          ],
        },
      },
      '/v2/api/web/logs/learn/101': {
        code: 0,
        data: { activities: [{ id: 'a1', type: 19, title: hwName, is_finished: false }] },
      },
      '/c27/online_courseware/schedule/course/progress/?classroom_id=101': {
        code: 0,
        data: { course_progress: [{ section_leaf_list: [
          { id: 'l1', name: hwName, leaf_type: 19, score_deadline: hwEndSec,
            progress: { status: '', done: 0, total: 1 } },
        ] }] },
      },
    });
    const T = load(DUP);
    const steps = [];
    const r = await T.spec.fetch(function (s) { steps.push(String(s)); });

    ok('⑭ 去重后整体 state=ok（作业 1 条 + 真考试 1 场）', r.state === 'ok', JSON.stringify(r).slice(0, 200));
    const works = r.works || [], exams = r.exams || [];
    ok('⑭ 作业卡只剩 1 条，没被拆成两张', works.length === 1, JSON.stringify(works).slice(0, 200));
    ok('⑭ 留下的是作业卡，名字与截图一致', works[0] && works[0].name === hwName, works[0] && works[0].name);
    ok('⑭ 作业卡带截止时间 2026-11-15 20:00', works[0] && works[0].end === fmtLocal(hwEndSec), works[0] && works[0].end);
    ok('⑭ 作业卡信息更全（课程名 + 状态都留着）',
      works[0] && works[0].course === '高等数学B1' && works[0].status === '待做',
      works[0] && (works[0].course + '|' + works[0].status));
    ok('⑭ 假考试删掉、自身重复合并后只剩 1 场考试', exams.length === 1, JSON.stringify(exams).slice(0, 200));
    ok('⑭ 留下的是真考试「期末考试」', exams[0] && exams[0].name === '期末考试', exams[0] && exams[0].name);
    ok('⑭ 撞作业名的 📝 假考试不再出现',
      exams.every(e => e.name !== hwName), exams.map(e => e.name).join('|'));
    ok('⑭ 真考试的考场信息完好', exams[0] && /3102/.test(String(exams[0].place)), exams[0] && exams[0].place);
    ok('⑭ 诊断写明删掉 1 张重复作业卡',
      String(r.diag || '').indexOf('去重：删掉 1 张重复作业卡') >= 0, r.diag);
    ok('⑭ 诊断写明合并 1 张重复考试卡',
      String(r.diag || '').indexOf('合并 1 张重复考试卡') >= 0, r.diag);
    ok('⑭ 整理计数按去重后算（1 条作业 / 1 场考试）',
      steps.join('|').indexOf('整理 1 条作业 / 1 场考试') >= 0, steps.join('|'));
  }

  /* ---------- ⑮ v1.1.82 去重边界：截止差大是真考试 / 名字归一化 ---------- */
  {
    const wk = '第三章 章节测验';
    const d1 = new Date(2026, 11, 20, 23, 59).getTime();    // 作业截止 2026-12-20 23:59
    const d1Sec = Math.floor(d1 / 1000);
    const d2 = new Date(2026, 10, 15, 20, 0).getTime();     // 考试截止 2026-11-15 20:00
    const EDGE = Object.assign({}, FULL, {
      '/api/v3/classroom/on-lesson-upcoming-exam': {
        code: 0,
        data: {
          onLessonClassrooms: [],
          upcomingExam: [
            /* 同名但截止与作业差 > 60s → 判真考试，一张不动 */
            { examName: wk, courseName: '高等数学B1',
              startTime: new Date(2026, 10, 13, 9, 40).getTime(), endTime: d2,
              classroomName: '第三教学楼3102' },
            /* 名字只差空格，归一化后撞作业名且没给截止 → 判重复丢掉 */
            { examName: '第三章  章节测验 ', courseName: '', startTime: 0, endTime: 0 },
          ],
        },
      },
      '/v2/api/web/logs/learn/101': {
        code: 0, data: { activities: [{ id: 'a1', type: 5, title: wk, is_finished: false }] },
      },
      '/c27/online_courseware/schedule/course/progress/?classroom_id=101': {
        code: 0,
        data: { course_progress: [{ section_leaf_list: [
          { id: 'l1', name: wk, leaf_type: 5, score_deadline: d1Sec,
            progress: { status: '', done: 0, total: 10 } },
        ] }] },
      },
    });
    const T = load(EDGE);
    const steps = [];
    const r = await T.spec.fetch(function (s) { steps.push(String(s)); });
    const works = r.works || [], exams = r.exams || [];
    ok('⑮ 同名但截止差大：整体 state=ok', r.state === 'ok', JSON.stringify(r).slice(0, 200));
    ok('⑮ 作业仍是 1 条', works.length === 1, works.map(w => w.name).join('|'));
    ok('⑮ 作业截止时间没被考试卡覆盖', works[0] && works[0].end === fmtLocal(d1Sec), works[0] && works[0].end);
    ok('⑮ 截止差 > 60s 的真考试保留（不误删）', exams.length === 1, JSON.stringify(exams).slice(0, 200));
    ok('⑮ 保留下来的考试截止是 2026-11-15 20:00',
      exams[0] && exams[0].end === fmtLocal(d2), exams[0] && exams[0].end);
    ok('⑮ 名字归一化（空格差异）那条被删',
      String(r.diag || '').indexOf('去重：删掉 1 张重复作业卡') >= 0, r.diag);
    ok('⑮ 整理计数 1 条作业 / 1 场考试',
      steps.join('|').indexOf('整理 1 条作业 / 1 场考试') >= 0, steps.join('|'));
  }

  /* ---------- ⑯ v1.1.82 去重边界：作业卡没截止时把考试卡的截止补回来 ---------- */
  {
    const backEnd = new Date(2026, 10, 15, 20, 0).getTime();
    const BACK = Object.assign({}, FULL, {
      '/api/v3/classroom/on-lesson-upcoming-exam': {
        code: 0,
        data: {
          onLessonClassrooms: [],
          upcomingExam: [
            { examName: '作业二', courseName: '高等数学B1',
              startTime: new Date(2026, 10, 13, 9, 40).getTime(), endTime: backEnd },
          ],
        },
      },
      '/v2/api/web/logs/learn/101': {
        code: 0, data: { activities: [{ id: 'a1', type: 19, title: '作业二', is_finished: false }] },
      },
      '/c27/online_courseware/schedule/course/progress/?classroom_id=101': {
        code: 0, data: { course_progress: [{ section_leaf_list: [] }] },
      },
    });
    const T = load(BACK);
    const r = await T.spec.fetch(function () {});
    const works = r.works || [], exams = r.exams || [];
    ok('⑯ 补回截止后整体 state=ok（作业 1 条，考试 0 场）', r.state === 'ok', JSON.stringify(r).slice(0, 200));
    ok('⑯ 作业卡 1 条', works.length === 1, JSON.stringify(works).slice(0, 200));
    ok('⑯ 假考试被删光', exams.length === 0, JSON.stringify(exams).slice(0, 200));
    ok('⑯ 作业卡原本没截止，补回了考试卡读到的 2026-11-15 20:00',
      works[0] && works[0].end === fmtLocal(backEnd), works[0] && works[0].end);
    ok('⑯ 诊断写明删掉 1 张重复作业卡',
      String(r.diag || '').indexOf('去重：删掉 1 张重复作业卡') >= 0, r.diag);
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.log('\n[FAIL] 测试自身崩了：' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
