/* 河医大助手 · 多来源作业/考试聚合器（v1.1.66）
 *
 * ================== 为什么要这个文件 ==================
 * 学习页原来只有一个数据源：学习通（CX.cached()）。YG 要在「学习」栏里
 * 再加喜鹊儿的考试、知到的作业考试、雨课堂的作业考试。若给每个平台各写
 * 一套「连接卡 + 缓存 + 抓取 + 合并」，app.js 会变成一堆 if/else，每加一个
 * 平台都要动渲染主逻辑。这里收敛成**注册表 + 聚合器**：
 *   - 每个平台是一个「来源(source)」，实现同一套契约（docs/multi-source-SPEC.md）；
 *   - 学习通也包装成一个来源（builtin），chaoxing.js 抓取逻辑一点不改；
 *   - live() 把各来源缓存合并成 renderHomework 认得的**单一 d 对象**；
 *   - status() 给学习页连接卡报每个来源的诚实状态。
 *
 * ================== 诚实红线（这个项目的命根子） ==================
 * 1. 只读：不代交作业、不点开考试、不代签到；登录态只在这台手机上。
 * 2. **绝不把登录提示页 / 失效页当成「0 条数据」**。抓不到就是抓不到：
 *    来源返回 state='stale'（要重新登录）或 'degraded'（接口不可用/未验真），
 *    这两种状态**不贡献任何条目**，但把原因如实报给连接卡。
 * 3. 未知状态原样显示，绝不当成「待做」——沿用 CX.classify。
 * 4. 一个来源没数据，不拖垮别的来源；学习通照常是主路。
 *
 * ================== 向后兼容 ==================
 * live() 在「所有来源都没抓到数据」时返回 null，让 renderHomework 原有
 * 优先级链（外部 JSON → live → 旧缓存 → window.HOMEWORK）继续往下走。
 * 学习通没登录、新平台也没登录时，页面表现与 v1.1.65 逐字一致。
 */
const SOURCES = (() => {
  const REG = [];
  const byId = {};
  let LAST_ERR = '';

  const hasHost = () => typeof Host !== 'undefined' && Host;
  const hasXXMU = () => typeof XXMU !== 'undefined' && XXMU;
  const now = () => Math.floor(Date.now() / 1000);

  function safe(fn, def) {
    try { return fn(); } catch (e) { return def; }
  }

  /* ---------------- 通用 HTTP（带 Cookie，字符集自动嗅探） ----------------
   * 复用 web/sync.js 的 netCk + splitResp + decodeAuto，适配器不用各写一遍。
   * 返回 Promise<{ok, text?, code?, error?}>。 */
  function http(url, o) {
    o = o || {};
    if (!hasXXMU() || !XXMU.netCk) {
      return Promise.resolve({ ok: false, error: '不在 App 内或缺少网络桥' });
    }
    const cookieUrl = o.cookieUrl || url;   // 从哪个域取 Cookie
    const referer = o.referer || '';
    return XXMU.netCk(url, o.method || 'GET', o.body || '',
      o.contentType || '', o.headers || '', cookieUrl, referer).then(raw => {
      const r = XXMU.splitResp(raw);
      if (r.code < 0) return { ok: false, error: r.body || '网络错误', code: -1 };
      if (r.code >= 400) return { ok: false, error: 'HTTP ' + r.code, code: r.code };
      let text = r.body;
      try { text = XXMU.decodeAuto(r.body); } catch (e) {}
      return { ok: true, text, code: r.code, raw };
    });
  }

  function stripTags(s) {
    return String(s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------------- 注册一个「已实现全部方法」的来源 ----------------
   * 学习通用这个直接包装 CX。契约：
   *   { id, label, short, kinds, builtin?,
   *     loggedIn():bool, openLogin():bool, logout():void,
   *     refresh(onStep):Promise<{state,...}>,
   *     cached():{works,exams,synced_at,state?,error?}|null,
   *     readErr():string }
   */
  function register(src) {
    if (!src || !src.id || byId[src.id]) {
      LAST_ERR = '来源注册失败：缺少 id 或重复 id=' + (src && src.id);
      return null;
    }
    const s = Object.assign({
      label: src.id, short: src.id, kinds: ['work', 'exam'], builtin: false,
      loggedIn: () => false, openLogin: () => false, logout: () => {},
      readErr: () => '',
      /* 是否有「可用的登录入口」。alwaysDegraded 的来源（本机只做探针、
       * 没接活清单接口）由 define 显式置 false：不给它画一个点了也没用的
       * 「登录/绑定」按钮，也不让它首帧伪装成「未登录，绑一下就好」。 */
      hasLogin: true, alwaysDegraded: false, degradedError: '',
    }, src);
    REG.push(s);
    byId[s.id] = s;
    return s;
  }

  /* ---------------- 工厂：define(spec) 生成完整来源 ----------------
   * 三个新平台用这个，只需提供 fetch(onStep)（返回
   *   { state:'ok', works:[], exams:[], error?:'' }
   *   | { state:'stale'|'degraded', error:'...' }），
   * 缓存读写、状态推断、降级记忆、登录回调全部由工厂统一做。
   *
   * spec 可覆盖：loggedIn / openLogin / logout / host(默认 cookie 域) /
   *   loginUrl / loginTitle / badHints / okHints / grabSel / key(缓存键)。
   */
  function define(spec) {
    const id = spec.id;
    const key = spec.key || ('xxmu_src_' + id);
    const cbName = '__onSrcDone_' + id;
    let READ_ERR = '';

    /* 默认登录态：按 cookie 域判断；无 host 时按「绑定标记」pref 判断 */
    function defaultLoggedIn() {
      if (spec.loggedIn) return !!safe(spec.loggedIn, false);
      if (spec.host && hasHost() && Host.hasCookieFor) {
        return !!safe(() => Host.hasCookieFor(spec.host), false);
      }
      return prefGet(key + '__bound') === '1';
    }

    /* 默认登录入口：走 MainActivity 新桥 openLoginFor，成功后自动刷新 */
    function defaultOpenLogin() {
      if (spec.openLogin) return !!safe(spec.openLogin, false);
      if (!spec.loginUrl) return false;
      if (!hasHost() || !Host.openLoginFor) return false;
      try {
        Host.openLoginFor(spec.loginUrl, spec.loginTitle || ('登录' + (spec.label || id)),
          spec.badHints || '/login||passport', spec.okHints || '',
          spec.grabSel || '', cbName);
        return true;
      } catch (e) { return false; }
    }

    function defaultLogout() {
      if (spec.logout) { try { spec.logout(); } catch (e) {} }
      try {
        if (spec.host && hasHost() && Host.clearCookieFor) Host.clearCookieFor(spec.host);
      } catch (e) {}
      prefSet(key, '');
      prefSet(key + '__bound', '');
    }

    function prefGet(k) {
      try { return hasHost() && Host.getPref ? (Host.getPref(k) || '') : ''; }
      catch (e) { return ''; }
    }
    function prefSet(k, v) {
      try { if (hasHost() && Host.setPref) Host.setPref(k, v); } catch (e) {}
    }

    /* 读缓存：校验形状；失败记 READ_ERR，绝不静默当成「没同步过」。 */
    function cached() {
      READ_ERR = '';
      const raw = prefGet(key);
      if (!raw || raw.length < 20) return null;
      let d = null;
      try { d = JSON.parse(raw); }
      catch (e) {
        READ_ERR = '本地「' + (spec.label || id) + '」缓存解析失败：' + String((e && e.message) || e);
        return null;
      }
      if (!d || !Array.isArray(d.works) || !Array.isArray(d.exams)) {
        READ_ERR = '本地「' + (spec.label || id) + '」缓存结构不完整';
        return null;
      }
      return d;
    }

    /* 抓取：调适配器 fetch → 成功落盘验真数据；降级也落盘一份，
     * 让连接卡记住原因（不会假装「从没同步过」）。 */
    function refresh(onStep) {
      const step = typeof onStep === 'function' ? onStep : function () {};
      let out;
      try { out = spec.fetch(step); }
      catch (e) { out = Promise.resolve({ state: 'degraded', error: String((e && e.message) || e) }); }
      return Promise.resolve(out).then(r => {
        r = r || { state: 'degraded', error: '抓取没返回结果' };
        const st = r.state === 'ok' ? 'ok' : (r.state === 'stale' ? 'stale' : 'degraded');
        /* v1.1.67：适配器可以顺带回传一份「定位诊断」文本（喜鹊动态发现
         * 考试页用）。它跟数据、原因一起落盘，供「复制诊断」按钮读取；
         * 没有这个字段的来源就是空串，不影响任何旧逻辑。 */
        const diag = String(r.diag || '');
        if (st === 'ok') {
          const data = {
            works: Array.isArray(r.works) ? r.works : [],
            exams: Array.isArray(r.exams) ? r.exams : [],
            /* v1.1.68：适配器可以回传自己的导入/抓取时间（喜鹊是「人带路」
             * 导入，上次导入时间就是数据真实产生的时间，不能用刷新时刻冒充）。 */
            synced_at: (r.synced_at || now()), state: 'ok', source: id,
            errors: Array.isArray(r.errors) ? r.errors : [],
            diag: diag,
          };
          prefSet(key, JSON.stringify(data));
          prefSet(key + '__bound', '1');
          return { state: 'ok', data };
        }
        /* 降级：写一份「空数据 + 原因 + 诊断」，供 status() 如实显示 */
        prefSet(key, JSON.stringify({
          works: [], exams: [], synced_at: 0, state: st, source: id,
          error: String(r.error || (st === 'stale' ? '登录已失效，请重新登录' : '暂不可用')),
          errors: [], diag: diag,
        }));
        return { state: st, error: String(r.error || '') };
      }).catch(e => {
        const msg = String((e && e.message) || e);
        prefSet(key, JSON.stringify({
          works: [], exams: [], synced_at: 0, state: 'degraded', source: id,
          error: '抓取出错：' + msg, errors: [], diag: '抓取出错：' + msg,
        }));
        return { state: 'degraded', error: msg };
      });
    }

    /* 登录 WebView 回跳：成功即自动刷一次。由 openLoginFor 的 cbName 触发。 */
    try {
      window[cbName] = function (ok, acct) {
        if (!ok) {
          if (hasXXMU() && XXMU.toast) XXMU.toast('已取消' + (spec.label || id) + '登录');
          return;
        }
        prefSet(key + '__bound', '1');
        if (window.SrcUI && window.SrcUI.sync) window.SrcUI.sync(id, false);
      };
    } catch (e) {}

    return register({
      id, label: spec.label || id, short: spec.short || spec.label || id,
      kinds: spec.kinds || ['work', 'exam'], builtin: !!spec.builtin,
      loggedIn: defaultLoggedIn, openLogin: defaultOpenLogin, logout: defaultLogout,
      refresh, cached, readErr: () => READ_ERR,
      /* 有可用登录入口才画按钮。alwaysDegraded（本批只做探针、没接活清单
       * 接口）的来源一律不给登录按钮——点了也拉不到数据，属于假入口。 */
      hasLogin: spec.alwaysDegraded ? false : (!!(spec.loginUrl || spec.openLogin)),
      alwaysDegraded: !!spec.alwaysDegraded,
      degradedError: spec.degradedError || '',
      _key: key, _cb: cbName,
    });
  }

  /* ---------------- 学习通包装为内置来源 ---------------- */
  function registerBuiltinChaoxing() {
    if (typeof CX === 'undefined') return;
    register({
      id: 'chaoxing', label: '学习通', short: '超星',
      kinds: ['work', 'exam'], builtin: true,
      loggedIn: () => safe(() => CX.loggedIn(), false),
      openLogin: () => safe(() => CX.openLogin(), false),
      logout: () => { try { CX.logout(); } catch (e) {} },
      refresh: (onStep) => safe(() => CX.sync(onStep), Promise.resolve({ ok: false, error: '学习通不可用' }))
        .then(r => {
          if (!r.ok) return { state: r.needLogin ? 'stale' : 'degraded', error: r.error };
          return { state: 'ok', data: r.data };
        }),
      cached: () => safe(() => CX.cached(), null),
      readErr: () => (CX.readErr ? safe(() => CX.readErr(), '') : ''),
    });
  }

  /* ---------------- 给条目标来源标签（就地打字段，不拷贝） ----------------
   * cached() 每次返回新 parse 的对象，加字段不污染任何持久状态。
   * cardOf / 详情弹层读 raw.source 就能显示「这条来自哪个平台」。 */
  function tag(list, id) {
    (list || []).forEach(x => { if (x && typeof x === 'object') { x.source = id; x._src = id; } });
    return list || [];
  }

  /* ---------------- 状态数组（给连接卡 / 来源筛选） ---------------- */
  function status() {
    return REG.map(s => {
      let snap = null, err = '';
      try { snap = s.cached ? s.cached() : null; }
      catch (e) { err = String((e && e.message) || e); }
      const logged = safe(() => s.loggedIn(), false);
      let state;
      if (snap && snap.state) state = snap.state;
      else if (snap && snap.synced_at) state = 'ok';       // 旧格式（学习通）
      else if (s.alwaysDegraded) state = 'degraded';        // 本批探针平台：首帧即降级
      else if (!logged) state = 'nologin';
      else state = 'idle';
      const w = snap && Array.isArray(snap.works) ? snap.works.length : 0;
      const e = snap && Array.isArray(snap.exams) ? snap.exams.length : 0;
      /* alwaysDegraded 且还没刷过：把适配器写死的原因回填，避免首帧显示
       * 一条空 error 的「暂不可用」。刷过之后 snap.error 里就是真实原因。 */
      const reason = err || (snap && snap.error)
        || (s.alwaysDegraded && !snap ? s.degradedError : '')
        || safe(() => s.readErr(), '') || '';
      return {
        id: s.id, label: s.label, short: s.short, builtin: !!s.builtin,
        kinds: s.kinds || ['work', 'exam'],
        state, synced_at: snap && snap.synced_at ? snap.synced_at : 0,
        count: w + e, works: w, exams: e,
        error: reason,
        loggedIn: logged,
        hasLogin: s.hasLogin !== false && typeof s.openLogin === 'function',
        hasRefresh: typeof s.refresh === 'function',
      };
    });
  }

  /* ---------------- 聚合：合并成 renderHomework 认得的单一 d ----------------
   * 只并入 state==='ok' 且 synced_at>0 的来源；降级态不贡献条目。
   * 一个都没并入 → 返回 null（保持原优先级链）。 */
  function live() {
    const works = [], exams = [], st = status();
    let latest = 0, merged = 0;
    for (let i = 0; i < REG.length; i++) {
      const s = REG[i], one = st[i];
      if (!one || one.state !== 'ok' || !one.synced_at) continue;
      let snap = null;
      try { snap = s.cached(); } catch (e) { continue; }
      if (!snap) continue;
      tag(snap.works, s.id).forEach(x => works.push(x));
      tag(snap.exams, s.id).forEach(x => exams.push(x));
      if (snap.synced_at > latest) latest = snap.synced_at;
      merged++;
    }
    if (!merged) return null;
    return {
      synced_at: latest, _source: 'multi', source: 'multi',
      works, exams, sources: st,
      total: works.length + exams.length,
      pending: works.filter(w => w && w.open !== false).length,
      exam_total: exams.length, exam_upcoming: 0,
      courses: 0, errors: [], term_label: '多平台',
    };
  }

  function list() { return REG.slice(); }
  function get(id) { return byId[id]; }
  function refresh(id, onStep) {
    const s = byId[id];
    if (!s || !s.refresh) return Promise.resolve({ state: 'degraded', error: '来源不存在：' + id });
    return s.refresh(onStep);
  }
  function openLogin(id) {
    const s = byId[id];
    return s && s.openLogin ? safe(() => s.openLogin(), false) : false;
  }
  function logout(id) {
    const s = byId[id];
    if (s && s.logout) try { s.logout(); } catch (e) {}
  }

  /* v1.1.67：读出某来源最近一次抓取落盘的「定位诊断」文本。喜鹊动态发现
   * 考试页失败时，这段文本就是给连接卡「复制诊断」按钮用的；没诊断的来源
   * 返回空串，由 UI 自己给一句「先重新抓一次」的提示，绝不假装复制成功。 */
  function diag(id) {
    const s = byId[id];
    if (!s || !s.cached) return '';
    let snap = null;
    try { snap = s.cached(); } catch (e) { return ''; }
    return String((snap && snap.diag) || '');
  }

  /* 初始化时把学习通登记为第 0 个来源（其余由各适配器 .js 调 define 注册）。 */
  registerBuiltinChaoxing();

  return {
    register, define, http, stripTags, now,
    status, live, list, get, refresh, openLogin, logout, diag,
    readErr: () => LAST_ERR,
  };
})();
