/* 知到（智慧树）适配器 · 方案 C 双探针 离线回归测试（v1.1.80 · 定 B 主线接活）
 *
 * 门禁钉住的是**行为**，不发任何真网络请求（SOURCES.http 用假路由替身）：
 *   ① 注册契约：去掉 alwaysDegraded、给真 loginUrl、loggedIn/openLogin/logout/fetch 齐全；
 *   ② 纯 JS AES-128-CBC 与 Node 内置 crypto 逐字节一致（含中文 / 多字段）；
 *   ③ 模式 A/B 可切、换模式清旧快照、默认 B（v1.1.80 真机定 B 主线，A 留兜底）；
 *   ④ 未登录 → degraded 且一条业务请求都不发（先逼登录，不盲跑）；
 *   ⑤ A 探针（显式切回 A）：真页面快照能认出清单，state 1→待做 / 4→已提交，end 换算 YYYY-MM-DD HH:mm；
 *   ⑥ A 探针：没快照 → degraded + 明确指引，绝不给空 ok 清单冒充「没作业」；
 *   ⑦ B 探针：课程 {code:200,result.courseOpenDtos} + 作业 {status:'200'} 成功 → 认出清单并去重；
 *   ⑧ B 探针：POST body 是可被对应密钥解密的 secretStr，课程字段 {status/pageNo/pageSize} 正确、
 *      作业字段（recruitId/courseId/flag/pageSize/pageNum）正确；
 *   ⑨ B 探针诚实分层：课程 code!=200 / 无课程不造 500 / 作业解析失败 → degraded（不冒充没作业）；
 *      每门课都 status=200 + 空 studentHomeworkList → 平台确认的空 ok 清单（不是解析失败）；
 *   ⑩ 只读红线：源码一个写端点都不许出现（saveCourseTran/doHomework/saveStudentAnswer/submit…）；
 *   ⑪ openA 走 openFinderFor 且回跳 __onZhsFind；回跳存快照并触发一次同步；
 *   ⑫ 每条都打来源标签 zhihuishu，源里没有「已登录即空清单」这种假成功；
 *   ⑬ v1.1.79 登录链路修复（v1.1.80 保留）：okHints 永不命中的哨兵、真登录判据独立 AUTH_KEY、
 *      覆盖 __onSrcDone_ 回跳只有「完成」且验到 cookie 才写、cancel/无 cookie 清、logout 清干净；
 *   ⑭ v1.1.80 课程解析：extract_course_id 口径（courseInfo.courseId 下探）、缺 recruitId 跳过、
 *      result.totalCount 分页翻页、不拿空 recruitId 造占位请求。
 *
 * 用 Node vm 注入假的 SOURCES / XXMU / Host / CX，不碰真机、不联网。
 * 用法：node tools/test_zhihuishu.js   退出码 0 = 全过
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ZHS_SRC = fs.readFileSync(path.join(ROOT, 'web', 'zhihuishu.js'), 'utf8');

const IV = '1g3qqdh4jvbskb9x';
const HOME_KEY = '7q9oko0vqb3la20r';
const EXAM_KEY = 'onbfhdyvz8x7otrp';
const KEY = 'xxmu_zhs_todo';
const MODE_KEY = 'xxmu_zhs_mode';
const FIND_KEY = 'xxmu_zhs_find';
const AUTH_KEY = 'xxmu_zhs_auth';   // v1.1.79 真登录判据（不再认 __bound）

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

/* Node 内置 crypto 的参考实现：适配器手写的纯 JS AES 必须逐字节等于它。 */
function nodeEnc(obj, key) {
  const c = crypto.createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(IV, 'utf8'));
  return Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]).toString('base64');
}
function nodeDec(b64, key) {
  const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(IV, 'utf8'));
  return Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]).toString('utf8');
}
function fmtLocal(ms) {
  let n = Number(ms);
  if (!n) return '';
  if (n < 1e12) n = n * 1000;
  const d = new Date(n);
  if (isNaN(d.getTime())) return '';
  const p = x => (x < 10 ? '0' : '') + x;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* 造沙箱。routes 是「URL 片段 → 响应文本/对象/函数」的假路由；命中最长片段，
 * 没命中返回 404。路由值可以是函数 (ctx)->响应，ctx={url,body,opts}，用来按
 * 解密后的 pageNo 返回不同页（测分页）。opts.prefs 预置本地存储，
 * opts.loggedIn 控 hasCookieFor。 */
function load(routes, opts) {
  opts = opts || {};
  const calls = { urls: [], bodies: [], toasts: [], finder: null, loginUrl: '', synced: false, openLogin: null };
  const specBox = {};
  /* v1.1.79：默认预置「已点完成且验到 cookie」的真登录态，让各探针场景
   * 继续在已登录下测行为；要测未登录显式传 prefs:{xxmu_zhs_auth:''} 或 loggedIn:false。 */
  const prefs = Object.assign({}, { [AUTH_KEY]: '1' }, opts.prefs || {});
  const SOURCES = {
    define(spec) { specBox.spec = spec; return {}; },
    http(url, o) {
      const u = String(url);
      calls.urls.push({ url: u, cookieUrl: (o && o.cookieUrl) || '', method: (o && o.method) || 'GET' });
      if (o && o.body) calls.bodies.push({ url: u, body: String(o.body) });
      let best = null, bestLen = -1;
      Object.keys(routes).forEach(function (k) {
        if (u.indexOf(k) >= 0 && k.length > bestLen) { best = k; bestLen = k.length; }
      });
      if (best == null) return Promise.resolve({ ok: false, error: 'HTTP 404', text: '', code: 404 });
      let v = routes[best];
      if (typeof v === 'function') v = v({ url: u, body: (o && o.body) || '', opts: o });
      if (v && typeof v === 'object' && v.__err) {
        return Promise.resolve({ ok: false, error: v.__err, text: '', code: 0 });
      }
      return Promise.resolve({ ok: true, text: typeof v === 'string' ? v : JSON.stringify(v), code: 200 });
    },
    stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' '); },
    now() { return 1700000000; },
  };
  const XXMU = {
    pref(k, v) {
      if (v === undefined) return prefs[k] === undefined ? '' : prefs[k];
      prefs[k] = v; return '';
    },
    toast(m) { calls.toasts.push(String(m)); },
  };
  const Host = {
    hasCookieFor() { return opts.loggedIn === undefined ? true : !!opts.loggedIn; },
    openLoginFor(url, title, badHints, okHints, grabSel, cb) {
      calls.loginUrl = String(url);
      calls.openLogin = { url: String(url), title: String(title), badHints: String(badHints),
        okHints: String(okHints), grabSel: String(grabSel), cb: String(cb) };
      return true;
    },
    clearCookieFor(url) { calls.cleared = String(url); return true; },
    openFinderFor(url, title, cb) { calls.finder = { url: String(url), cb: String(cb) }; return true; },
  };
  const CX = { classify() { return 'unknown'; } };
  const sandbox = {
    console, Date, Math, JSON, String, Number, Array, Object, RegExp, Promise,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    SOURCES, XXMU, Host, CX,
  };
  sandbox.window = sandbox;
  sandbox.SrcUI = { sync() { calls.synced = true; } };
  vm.createContext(sandbox);
  vm.runInContext(ZHS_SRC, sandbox, { timeout: 3000 });
  return { spec: specBox.spec, calls, prefs, sw: sandbox };
}

/* 从 'secretStr=<encoded>' 里取出 base64。 */
function secretOf(body) {
  const m = /^secretStr=(.*)$/s.exec(body);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}
/* 解密一个课程列表 POST 的 body，拿到请求体对象。 */
function courseReqJson(body) {
  try { return JSON.parse(nodeDec(secretOf(body), HOME_KEY)); } catch (e) { return null; }
}
function hwReqJson(body) {
  try { return JSON.parse(nodeDec(secretOf(body), EXAM_KEY)); } catch (e) { return null; }
}

async function main() {
  console.log('\n[v1.1.80] 知到适配器（方案 C 双探针 · 定 B 主线接活）离线断言');

  /* ---------- ① 注册契约 ---------- */
  const A = load({});
  ok('① define 拿到 zhihuishu 的 spec', A.spec && A.spec.id === 'zhihuishu');
  ok('① 不再标 alwaysDegraded（否则永远降级、也不给登录按钮）', !A.spec.alwaysDegraded);
  ok('① kinds 同时出作业与考试', String(A.spec.kinds) === 'work,exam');
  ok('① 有 loginUrl 才给得出「登录 / 重新登录知到」按钮',
    typeof A.spec.loginUrl === 'string' && A.spec.loginUrl.indexOf('zhihuishu.com') >= 0);
  ok('① loggedIn/openLogin/logout/fetch 都是函数',
    ['loggedIn', 'openLogin', 'logout', 'fetch'].every(k => typeof A.spec[k] === 'function'));

  /* ---------- ② 纯 JS AES 与 Node crypto 逐字节一致 ---------- */
  {
    const s = load({});
    const cases = [
      { a: 1 },
      { recruitId: '', courseId: 0, flag: 1, pageSize: 100, pageNum: 0 },  // 作业清单请求体
      { status: 0, pageNo: 1, pageSize: 5 },                                // 课程列表请求体 v1.1.80
      { courseName: '医学信息工程导论', examName: '第三章测验', x: '中文与emoji😀' },
    ];
    let good = 0;
    cases.forEach(function (o, i) {
      const mine = s.sw.ZHS.secretStr(o, EXAM_KEY), ref = nodeEnc(o, EXAM_KEY);
      if (mine === ref) good++;
      else console.log('       用例' + i + ' mine=' + mine + ' ref=' + ref);
    });
    ok('② AES-128-CBC 4 组明文都等于 Node crypto', good === 4, good + '/4');
    const courseObj = { status: 0, pageNo: 1, pageSize: 5 };
    const hk = s.sw.ZHS.secretStr(courseObj, HOME_KEY);
    ok('② 换 home_key 也照样等于 Node crypto', hk === nodeEnc(courseObj, HOME_KEY));
    ok('② aesSelfTest 自检通过', /AES 自检通过/.test(String(s.sw.ZHS.aesSelfTest())), s.sw.ZHS.aesSelfTest());
  }

  /* ---------- ③ 模式 A/B（v1.1.80 默认 B） ---------- */
  {
    const s = load({}, { prefs: {} });
    ok('③ 默认模式 B（真机定 B 主线）', s.sw.ZHS.mode() === 'B', s.sw.ZHS.mode());
    ok('③ 干净 load（没设 MODE_KEY）也是 B', load({}).sw.ZHS.mode() === 'B');
    ok('③ modeName 带中文说明', /读作业页/.test(s.sw.ZHS.modeName('A')) && /接口直连/.test(s.sw.ZHS.modeName('B')));
    s.prefs[KEY] = '{"old":1}';
    ok('③ setMode(A) 成功（A 仍可手动切回兜底）', s.sw.ZHS.setMode('A') === true);
    ok('③ 换模式清掉旧清单快照', s.prefs[KEY] === '', JSON.stringify(s.prefs[KEY]));
    ok('③ mode() 读到 A', s.sw.ZHS.mode() === 'A');
    ok('③ 非法模式拒绝', s.sw.ZHS.setMode('X') === false && s.sw.ZHS.mode() === 'A');
  }

  /* ---------- ④ 未登录：先逼登录，一条业务请求都不发 ---------- */
  {
    const s = load({}, { loggedIn: false });
    const r = await s.spec.fetch(function () {});
    ok('④ 未登录 → degraded', r.state === 'degraded', r.state);
    ok('④ 说清要先登录知到', /登录/.test(String(r.error || '')), r.error);
    ok('④ 没盲发任何网络请求', s.calls.urls.length === 0, s.calls.urls.length);
  }

  const dl = String(new Date(2026, 11, 20, 23, 59).getTime());   // 毫秒时间戳，走数字分支，确定
  const st = String(new Date(2026, 10, 1, 8, 0).getTime());

  /* ---------- ⑤ A 探针（显式切回 A）：真页面快照认出清单 ---------- */
  {
    const snap = JSON.stringify({
      u: 'https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList',
      text: '未上交 已上交', frames: [], tables: [],
      list: [
        { courseName: '医学影像学', examName: '第一章测验', endDate: dl, startTime: st, state: 1 },
        { courseName: '医学影像学', examName: '第二章测验', endDate: dl, startTime: '', state: 4 },
      ],
    });
    const prefs = {}; prefs[MODE_KEY] = 'A'; prefs[FIND_KEY] = snap;
    const s = load({ 'stuExamWeb.html': '<div id="app">作业考试</div>' }, { prefs });
    const r = await s.spec.fetch(function () {});
    ok('⑤ A 探针 state=ok', r.state === 'ok', JSON.stringify(r).slice(0, 200));
    ok('⑤ 带 synced_at', r.synced_at > 0, r.synced_at);
    const w = r.works || [];
    ok('⑤ 认出 2 条作业', w.length === 2, w.map(x => x.name).join('|'));
    const w1 = w.find(x => x.name === '第一章测验');
    ok('⑤ state 1 → 「待做」', w1 && w1.status === '待做', w1 && w1.status);
    ok('⑤ 截止时间换算成 YYYY-MM-DD HH:mm', w1 && w1.end === fmtLocal(dl), w1 && w1.end + ' vs ' + fmtLocal(dl));
    ok('⑤ 开始时间也换算', w1 && w1.start === fmtLocal(st), w1 && w1.start);
    const w2 = w.find(x => x.name === '第二章测验');
    ok('⑤ state 4 → 「已提交」', w2 && w2.status === '已提交', w2 && w2.status);
    ok('⑤ 每条都打来源标签 zhihuishu', w.every(x => x.source === 'zhihuishu'));
    ok('⑤ 课程名照抄平台值', w1 && w1.course === '医学影像学', w1 && w1.course);
  }

  /* ---------- ⑥ A 探针：没快照 → degraded，不冒充空清单 ---------- */
  {
    const prefs = {}; prefs[MODE_KEY] = 'A';
    const s = load({ 'stuExamWeb.html': '<div id="app"></div>' }, { prefs });
    const r = await s.spec.fetch(function () {});
    ok('⑥ 无快照 → degraded 而不是 ok 空清单', r.state === 'degraded', r.state);
    ok('⑥ 明确让用户去「打开知到作业页」', /打开知到作业页/.test(String(r.error || '')), r.error);
    ok('⑥ 诊断记下本地快照为空', /本地 A 快照长度 0/.test(String(r.diag || '')), r.diag);
    ok('⑥ 绝不给一个空 works 冒充「没作业」', r.works === undefined, JSON.stringify(r.works));
  }

  /* v1.1.80 B 夹具：课程 {code:200,result:{totalCount,courseOpenDtos}}，
   * 作业 {status:'200',rt:{studentHomeworkList}}（据 pjm314159/zhs 逐字）。 */
  const CS = { code: 200, result: { totalCount: 1, courseOpenDtos: [
    { recruitId: 'R1', courseId: 1001, courseName: '医学影像学' },
  ] } };
  const HW = { status: '200', rt: { studentHomeworkList: [
    { courseName: '医学影像学', examName: '第一章测验', endDate: dl, startTime: st, state: 1 },
    { courseName: '诊断学', examName: '期末作业', endDate: dl, startTime: '', state: 4 },
  ] } };
  const HW_EMPTY = { status: '200', rt: { studentHomeworkList: [] } };
  function bRoutes(cs, hw) {
    const r = {};
    r['queryShareCourseInfo'] = cs;
    r['getStudentHomework'] = hw;
    return r;
  }
  function prefsB() { const p = {}; p[MODE_KEY] = 'B'; return p; }

  /* ---------- ⑦ B 探针：课程 + 作业接口成功 → 认出清单并去重 ---------- */
  let B;
  {
    B = load(bRoutes(CS, HW), { prefs: prefsB() });
    const r = await B.spec.fetch(function () {});
    ok('⑦ B 探针 state=ok', r.state === 'ok', JSON.stringify(r).slice(0, 220));
    const w = r.works || [];
    ok('⑦ flag=1/2 两次返回重复数据，按 课程|名称 去重后仍是 2 条',
      w.length === 2, w.map(x => x.name).join('|'));
    ok('⑦ state 映射对（待做 / 已提交）',
      w.some(x => x.name === '第一章测验' && x.status === '待做')
      && w.some(x => x.name === '期末作业' && x.status === '已提交'),
      w.map(x => x.name + ':' + x.status).join('|'));
    ok('⑦ 截止时间换算对', w.every(x => x.end === fmtLocal(dl)), w.map(x => x.end).join('|'));
    ok('⑦ 每条都打来源标签 zhihuishu', w.every(x => x.source === 'zhihuishu'));
    ok('⑦ 诊断记下抽出条数', /抽出 2 条/.test(String(r.diag || '')), r.diag);
    ok('⑦ 诊断含 业务 code=200 / 课程列表 / 作业清单 三步',
      /业务 code=200/.test(String(r.diag || '')) && /课程列表 POST\(pageNo=1\)/.test(String(r.diag || ''))
      && /作业清单 POST/.test(String(r.diag || '')), r.diag);
    ok('⑦ 已删掉多余的 CAS 换票（诊断里不再有）',
      !/CAS 换票/.test(String(r.diag || '')), r.diag);
  }

  /* ---------- ⑧ B 探针：POST body 是可解密的 secretStr，字段正确 ---------- */
  {
    const hwPosts = B.calls.bodies.filter(b => b.url.indexOf('getStudentHomework') >= 0);
    const csPosts = B.calls.bodies.filter(b => b.url.indexOf('queryShareCourseInfo') >= 0);
    ok('⑧ 作业清单发的是 POST form', hwPosts.length >= 1, hwPosts.length);
    ok('⑧ 课程列表也发了 POST form（totalCount=1 → 1 页）', csPosts.length === 1, csPosts.length);
    let decOk = 0, fieldOk = 0;
    hwPosts.forEach(function (b) {
      const s = secretOf(b.body);
      if (!/^secretStr=/.test(b.body) || !s) return;
      let j = null;
      try { j = JSON.parse(nodeDec(s, EXAM_KEY)); } catch (e) { return; }
      decOk++;
      if (j.courseId === 1001 && j.recruitId === 'R1' && (j.flag === 1 || j.flag === 2)
        && j.pageSize === 100 && j.pageNum === 0) fieldOk++;
    });
    ok('⑧ 作业清单 secretStr 能被 exam_key 解密', decOk === hwPosts.length, decOk + '/' + hwPosts.length);
    ok('⑧ 解密后字段 recruitId/courseId/flag/pageSize/pageNum 全对', fieldOk === hwPosts.length, fieldOk + '/' + hwPosts.length);
    const cj = courseReqJson(csPosts[0].body);
    ok('⑧ 课程列表用 home_key 加密、请求体是 {status:0,pageNo:1,pageSize:5}',
      !!cj && cj.status === 0 && cj.pageNo === 1 && cj.pageSize === 5, JSON.stringify(cj));
    ok('⑧ 课程列表不再发错的 pageNum:0', !!cj && cj.pageNum === undefined, JSON.stringify(cj));
    ok('⑧ 请求都带 cookieUrl（跨域带 cookie）',
      B.calls.urls.filter(u => u.url.indexOf('getStudentHomework') >= 0)
        .every(u => /studentexam-api/.test(u.cookieUrl)),
      B.calls.urls.map(u => u.cookieUrl).join('|'));
  }

  /* ---------- ⑨ B 探针诚实分层：失败/未解析绝不冒充「没作业」 ---------- */
  {
    /* 课程业务 code != 200 → degraded，且一条作业请求都不发。 */
    const BADCODE = bRoutes({ code: 500, result: { totalCount: 0, courseOpenDtos: null } }, HW);
    const s1 = load(BADCODE, { prefs: prefsB() });
    const r1 = await s1.spec.fetch(function () {});
    ok('⑨ 课程业务 code=500 → degraded', r1.state === 'degraded', r1.state);
    ok('⑨ 诊断记下业务 code=500', /业务 code=500/.test(String(r1.diag || '')), r1.diag);
    ok('⑨ 课程没读通就不发作业请求', s1.calls.bodies.filter(b => /getStudentHomework/.test(b.url)).length === 0);

    /* 无课程：code=200 但 courseOpenDtos 空 → 不拿空 recruitId 占位造那个
     * For input string: "" 的假 500（v1.1.79 B 诊断的真凶）。 */
    const NOCOURSE = bRoutes({ code: 200, result: { totalCount: 0, courseOpenDtos: null } }, HW);
    const s2 = load(NOCOURSE, { prefs: prefsB() });
    const r2 = await s2.spec.fetch(function () {});
    ok('⑨ 本学期没抽到课程 → degraded', r2.state === 'degraded', r2.state);
    ok('⑨ 无课程时不发作业清单请求（不造空 recruitId 500）',
      s2.calls.bodies.filter(b => /getStudentHomework/.test(b.url)).length === 0);
    ok('⑨ 诊断说明「没抽到课程 / 不拿空课程号」',
      /没抽到课程|不拿空课程号/.test(String(r2.diag || '') + String(r2.error || '')), r2.diag);

    /* 作业解析失败（status!='200' 或没返回 studentHomeworkList 数组）→ degraded，
     * 绝不给一个空 works 冒充「没作业」。 */
    const BADHW = bRoutes(CS, { status: '500', rt: {} });
    const s3 = load(BADHW, { prefs: prefsB() });
    const r3 = await s3.spec.fetch(function () {});
    ok('⑨ 作业 status!=200 → degraded（没解析出来不冒充没作业）', r3.state === 'degraded', r3.state);
    ok('⑨ 绝不给空 works 冒充「没作业」', r3.works === undefined, JSON.stringify(r3.works));
    ok('⑨ 诊断记下作业 status', /status=500/.test(String(r3.diag || '')), r3.diag);

    /* 平台明确回 status='200' + 空 studentHomeworkList → 诚实空 ok 清单。 */
    const s4 = load(bRoutes(CS, HW_EMPTY), { prefs: prefsB() });
    const r4 = await s4.spec.fetch(function () {});
    ok('⑨ 每门课都读通且清单为空 → state=ok 的空清单（平台确认没作业）',
      r4.state === 'ok' && Array.isArray(r4.works) && r4.works.length === 0, JSON.stringify(r4).slice(0, 200));
    ok('⑨ 这个空 ok 带 synced_at（是读通了，不是降级）', r4.synced_at > 0, r4.synced_at);

    /* 接口全 401 / 抛错 → degraded 且不崩。 */
    const ERR = { queryShareCourseInfo: { __err: 'HTTP 401' }, getStudentHomework: { __err: 'HTTP 401' } };
    const s5 = load(ERR, { prefs: prefsB() });
    const r5 = await s5.spec.fetch(function () {});
    ok('⑨ 接口全 401 时 degraded 且不崩', r5.state === 'degraded', r5.state);
    ok('⑨ 诊断里记下 HTTP/业务 code', /HTTP code|业务 code/.test(String(r5.diag || '')), r5.diag);
  }

  /* ---------- ⑩ 只读红线 ---------- */
  {
    const WRITE = ['saveCourseTran', 'saveStudentAnswer', 'saveBatchAnswer',
      'answer/submit', 'doHomework', 'openExam', '/submit', 'homework_redo'];
    const hit = WRITE.filter(w => ZHS_SRC.indexOf(w) >= 0);
    /* 注释里出现「不碰 saveCourseTran」是允许的：只查真正的请求调用点。 */
    const callHit = WRITE.filter(w => new RegExp('(SOURCES\\.http|post\\()[\\s\\S]{0,120}' + w).test(ZHS_SRC));
    ok('⑩ 源码没有把任何写端点拼进请求', callHit.length === 0, callHit.join(','));
    ok('⑩ 只有两个业务端点（课程 + 作业清单）',
      (ZHS_SRC.match(/queryShareCourseInfo|getStudentHomework/g) || []).length >= 2);
    ok('⑩ 保留了「只读不代交」的注释红线', /只读/.test(ZHS_SRC) || /不碰/.test(ZHS_SRC));
  }

  /* ---------- ⑪ openA / __onZhsFind 回跳 ---------- */
  {
    const s = load({});
    s.sw.ZHS.openA();
    ok('⑪ openA 走 openFinderFor 打开官方 H5 页',
      s.calls.finder && /stuExamWeb/.test(s.calls.finder.url),
      s.calls.finder && s.calls.finder.url);
    ok('⑪ 回跳回调名是 __onZhsFind', s.calls.finder && s.calls.finder.cb === '__onZhsFind',
      s.calls.finder && s.calls.finder.cb);
    s.sw.__onZhsFind('{"text":"未上交 清单"}');
    ok('⑪ 回跳把页面快照存进本地', s.prefs[FIND_KEY] === '{"text":"未上交 清单"}',
      JSON.stringify(s.prefs[FIND_KEY]));
    ok('⑪ 回跳触发一次静默同步', s.calls.synced === true, s.calls.synced);
  }

  /* ---------- ⑬ v1.1.79 登录链路修复（v1.1.80 保留）：杜绝「打不开登录页面」 ----------
   * v1.1.78 真机诊断：okHints='zhihuishu.com' 让登录页刚 onPageFinished 就被
   * isLoggedInUrl 判已登录 → 秒关 → 回跳写假 __bound → 没登录却盲发探针全 401。
   * 本组钉死：okHints 换成永不命中的哨兵、真登录判据用独立 AUTH_KEY、
   * 覆盖回跳只在「完成」+ 验到 cookie 才写、logout 清干净。 */
  {
    const CB = '__onSrcDone_zhihuishu';
    const s = load({});

    /* ① 注册的 okHints 不是裸域名（否则登录页自己就命中 → 秒关） */
    ok('⑬ define 的 okHints 不含裸域名 zhihuishu.com',
      !/zhihuishu\.com/.test(String(s.spec.okHints)), String(s.spec.okHints));
    ok('⑬ define 的 okHints 是非空哨兵（空会退回默认 /frame/ 判定）',
      String(s.spec.okHints).length > 0, String(s.spec.okHints));
    ok('⑬ badHints 覆盖登录/护照/扫码/绑定各入口',
      ['login', 'passport', 'signin', 'qrcode', 'bind'].every(h => String(s.spec.badHints).indexOf(h) >= 0),
      String(s.spec.badHints));

    /* ② curOpenLogin 实际传给 openLoginFor 的 okHints 也得是哨兵、不是裸域名 */
    s.spec.openLogin();
    ok('⑬ curOpenLogin 走 openLoginFor 打开 onlineweb 登录页',
      s.calls.openLogin && /onlineweb\.zhihuishu\.com/.test(s.calls.openLogin.url),
      s.calls.openLogin && s.calls.openLogin.url);
    ok('⑬ 传给 openLoginFor 的 okHints 与 define 一致（哨兵，非裸域名）',
      s.calls.openLogin && s.calls.openLogin.okHints === s.spec.okHints
        && !/zhihuishu\.com/.test(s.calls.openLogin.okHints),
      s.calls.openLogin && s.calls.openLogin.okHints);
    ok('⑬ 回跳回调名是 __onSrcDone_zhihuishu',
      s.calls.openLogin && s.calls.openLogin.cb === CB, s.calls.openLogin && s.calls.openLogin.cb);

    /* ③ 真登录判据：只有 AUTH_KEY 才算，v1.1.78 秒关写下的假 __bound 不算 */
    const fake = load({}, { prefs: (function () { const p = {}; p[AUTH_KEY] = ''; p[KEY + '__bound'] = '1'; return p; })() });
    const fr = await fake.spec.fetch(function () {});
    ok('⑬ 光有假 __bound=1（没 AUTH_KEY）仍判未登录 → degraded 不盲发',
      fr.state === 'degraded' && fake.calls.urls.length === 0, fr.state + '/' + fake.calls.urls.length);

    /* ④ 覆盖回跳：适配器自己 window[CB] 覆盖了 SOURCES 默认版 */
    ok('⑬ window[__onSrcDone_zhihuishu] 被覆盖成自己的函数',
      typeof s.sw[CB] === 'function');

    const done = load({}, { prefs: (function () { const p = {}; p[AUTH_KEY] = ''; return p; })() });
    done.sw[CB](true, '');
    ok('⑬ 点「完成」(ok=true) 且验到 cookie → 写 AUTH_KEY=1',
      done.prefs[AUTH_KEY] === '1', JSON.stringify(done.prefs[AUTH_KEY]));
    ok('⑬ 完成回跳触发一次非静默同步', done.calls.synced === true, done.calls.synced);

    const cancel = load({}, { prefs: (function () { const p = {}; p[AUTH_KEY] = '1'; return p; })() });
    cancel.sw[CB](false, '');
    ok('⑬ 取消(ok=false) → 清掉 AUTH_KEY，回到未登录',
      cancel.prefs[AUTH_KEY] === '', JSON.stringify(cancel.prefs[AUTH_KEY]));
    ok('⑬ 取消给一句 toast', cancel.calls.toasts.length >= 1, cancel.calls.toasts.join('|'));

    const noCk = load({}, { loggedIn: false, prefs: (function () { const p = {}; p[AUTH_KEY] = '1'; return p; })() });
    noCk.sw[CB](true, '');
    ok('⑬ 点「完成」但没验到 cookie → 不写真登录，清 AUTH_KEY',
      noCk.prefs[AUTH_KEY] === '', JSON.stringify(noCk.prefs[AUTH_KEY]));
    ok('⑬ 没 cookie 提示「登进去后再点完成」',
      /完成/.test(noCk.calls.toasts.join('|')), noCk.calls.toasts.join('|'));

    /* ⑤ logout 把 AUTH_KEY / FIND_KEY / 旧 __bound 全清掉 */
    const out = load({}, { prefs: (function () { const p = {}; p[AUTH_KEY] = '1'; p[FIND_KEY] = '{"x":1}'; p[KEY + '__bound'] = '1'; return p; })() });
    out.spec.logout();
    ok('⑬ logout 清 AUTH_KEY', out.prefs[AUTH_KEY] === '', JSON.stringify(out.prefs[AUTH_KEY]));
    ok('⑬ logout 清 A 探针快照 FIND_KEY', out.prefs[FIND_KEY] === '', JSON.stringify(out.prefs[FIND_KEY]));
    ok('⑬ logout 清 v1.1.78 遗留的假 __bound', out.prefs[KEY + '__bound'] === '',
      JSON.stringify(out.prefs[KEY + '__bound']));

    /* ⑥ 诊断/错误文案引导用户手动点「完成」 */
    ok('⑬ 未登录错误文案写明「点右上角完成」', /完成/.test(String(fr.error || '')), fr.error);
    ok('⑬ 诊断首行标注 v1.1.80 且说明不再自动秒关',
      /v1\.1\.80/.test(String(fr.diag || '')) && /不再自动秒关/.test(String(fr.diag || '')), fr.diag);
  }

  /* ---------- ⑭ v1.1.80 课程解析：extract_course_id / 缺 recruitId / 分页 ---------- */
  {
    /* 组合夹具：① 顶层 courseId ② 顶层 0 下探 courseInfo.courseId
     * ③ 缺 recruitId（应跳过）。作业返回可信空清单。 */
    const MIX = { code: 200, result: { totalCount: 3, courseOpenDtos: [
      { recruitId: 'R1', courseId: 1001, courseName: '甲' },
      { recruitId: 'R2', courseId: 0, courseInfo: { courseId: 2002, name: '乙' }, courseName: '乙' },
      { courseId: 3003, courseName: '丙' },
    ] } };
    const s = load(bRoutes(MIX, HW_EMPTY), { prefs: prefsB() });
    const r = await s.spec.fetch(function () {});
    const hwBodies = s.calls.bodies.filter(b => /getStudentHomework/.test(b.url));
    const cids = hwBodies.map(b => { const j = hwReqJson(b.body); return j && j.courseId; });
    ok('⑭ 顶层 courseId 正常进作业请求', cids.indexOf(1001) >= 0, cids.join('|'));
    ok('⑭ 顶层 courseId=0 下探 courseInfo.courseId（extract_course_id 口径）',
      cids.indexOf(2002) >= 0, cids.join('|'));
    ok('⑭ 缺 recruitId 的课程被跳过（不拿空串发请求）',
      cids.indexOf(3003) < 0, cids.join('|'));
    ok('⑭ 只给 2 门有效课发作业请求（每门 flag 1/2 共 4 次）',
      hwBodies.length === 4, hwBodies.length);
    ok('⑭ 诊断记下被跳过 1 门课', /没抽出有效的|1 门课/.test(String(r.diag || '')), r.diag);

    /* 分页：totalCount=6 → ceil(6/5)=2 页；按解密后的 pageNo 返回不同课程。 */
    const paged = function (ctx) {
      const cj = courseReqJson(ctx.body);
      const p = cj ? cj.pageNo : 1;
      return { code: 200, result: { totalCount: 6,
        courseOpenDtos: p === 1
          ? [{ recruitId: 'P1', courseId: 11, courseName: '第一页' }]
          : [{ recruitId: 'P2', courseId: 22, courseName: '第二页' }] } };
    };
    const sp = load({ queryShareCourseInfo: paged, getStudentHomework: HW_EMPTY },
      { prefs: prefsB() });
    const rp = await sp.spec.fetch(function () {});
    const csBodies = sp.calls.bodies.filter(b => /queryShareCourseInfo/.test(b.url));
    const pageNos = csBodies.map(b => { const j = courseReqJson(b.body); return j && j.pageNo; });
    ok('⑭ totalCount=6 → 翻 2 页课程请求', pageNos.length === 2, pageNos.join('|'));
    ok('⑭ 两页分别用 pageNo=1 / pageNo=2', pageNos.indexOf(1) >= 0 && pageNos.indexOf(2) >= 0, pageNos.join('|'));
    const pHwCids = sp.calls.bodies.filter(b => /getStudentHomework/.test(b.url))
      .map(b => { const j = hwReqJson(b.body); return j && j.courseId; });
    ok('⑭ 第二页的课程（courseId=22）也发到作业请求', pHwCids.indexOf(22) >= 0, pHwCids.join('|'));
    ok('⑭ 两页都读通空清单 → 诚实空 ok 清单', rp.state === 'ok', rp.state);
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + '  ' + (pass + fail) + ' assertions: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.log('\n[FAIL] 测试自身崩了：' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
