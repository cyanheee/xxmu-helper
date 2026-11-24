/* 河医大助手 - 专注计时（番茄钟 + 正计时 + 白噪音 + 专注记录）
 *
 * ================== 为什么要有它 ==================
 *
 * 学习页原来只有「学习通抓来的作业/考试」和「自己记的待办」，都是「要做什么」。
 * 但「坐下来学」这件事本身没有一个轻量的陪伴工具：定个 25 分钟不碰手机、
 * 配一点白噪音盖住宿舍杂音。这正是 HENUBox 有、我们缺的一块。
 *
 * ================== 设计约束（和我的待办对齐） ==================
 *
 * 1. **纯本地**。计时、白噪音、专注记录全在手机里，不上传。和我的待办一个口径。
 *
 * 2. **计时用「结束时间戳」而不是「每秒 +1」**。Android 的 WebView 在切后台
 *    或锁屏时 setInterval 会被节流甚至停掉，累计 +1 的计时器切出去十分钟回来
 *    还是显示刚离开的数字。存 endTime，每次 tick 用「现在还剩多久」反推，
 *    锁屏回来数字是对的。
 *
 * 3. **白噪音用 Web Audio 合成，不引音频文件**。三种（白/粉/棕）都是算法生成的
 *    循环 buffer，零外部资源、断网也能响。音量可控、可随时关。
 *
 * 4. **番茄钟阶段结束只提示、不自动开下一段**。自动循环会在人已经走开的时候
 *    自己往下走（专注→休息→专注→休息……），记录也会跟着乱。这里专注结束
 *    toast 提醒 + 记一笔，用户点「开始」才进休息；休息结束同理，回到专注等用户。
 */

const FOCUS = (() => {
  const K = 'xxmu_focus';
  const MAX_LOG_DAYS = 90;       // 专注记录最多留 90 天，防无限增长
  const HIST_DAYS = 14;          // v2.4.0：柱状图显示最近多少天（14 天两周一屏刚好）

  /* 番茄钟默认时长（分钟）。用户可改，存本地。 */
  const D_FOCUS_MIN = 25;
  const D_REST_MIN = 5;

  let LAST_ERR = '';

  /* ---------------- 存储 ---------------- */

  function rawGet() {
    try {
      if (typeof Host !== 'undefined' && Host.getPref) return Host.getPref(K);
      return localStorage.getItem(K);
    } catch (e) {
      if (e && e.message) LAST_ERR = '本机存储读不出来（' + e.message + '）';
      return '';
    }
  }

  function rawSet(s) {
    try {
      if (typeof Host !== 'undefined' && Host.setPref) { Host.setPref(K, s); return true; }
      localStorage.setItem(K, s);
      return true;
    } catch (e) {
      LAST_ERR = '写不进本机存储（' + (e && e.message ? e.message : e) + '）';
      return false;
    }
  }

  /** 读整份状态。坏了不丢整份，退回一个干净的空状态并报错。 */
  function load() {
    LAST_ERR = '';
    const raw = rawGet();
    if (!raw) return fresh();
    let o = null;
    try { o = JSON.parse(raw); } catch (e) {
      LAST_ERR = '存着的专注记录读不出来（本机记录损坏）';
      return fresh();
    }
    if (!o || typeof o !== 'object') {
      LAST_ERR = '存着的专注记录格式不对';
      return fresh();
    }
    return merge(fresh(), o);
  }

  function fresh() {
    return {
      settings: {
        mode: 'pomo',          // 'pomo' 番茄钟 | 'timer' 正计时
        focusMin: D_FOCUS_MIN,
        restMin: D_REST_MIN,
        noise: 'off',          // 'off' | 'white' | 'pink' | 'brown'
      },
      log: {},                 // { 'YYYY-MM-DD': 专注分钟数 }
    };
  }

  /** 把读进来的字段安全地合进默认值，逐字段兜底，避免脏数据把状态搞崩。 */
  function merge(base, o) {
    const s = base.settings;
    const os = o.settings || {};
    if (os.mode === 'pomo' || os.mode === 'timer') s.mode = os.mode;
    if (Number.isFinite(os.focusMin) && os.focusMin >= 1 && os.focusMin <= 180) s.focusMin = Math.round(os.focusMin);
    if (Number.isFinite(os.restMin) && os.restMin >= 1 && os.restMin <= 60) s.restMin = Math.round(os.restMin);
    if (['off', 'white', 'pink', 'brown'].indexOf(os.noise) >= 0) s.noise = os.noise;
    const log = (o.log && typeof o.log === 'object') ? o.log : {};
    for (const d in log) {
      const n = Number(log[d]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(n) && n > 0) base.log[d] = Math.round(n);
    }
    return base;
  }

  function save(o) {
    return rawSet(JSON.stringify(o));
  }

  /* ---------------- 时间工具 ---------------- */

  const pad2 = n => String(n).padStart(2, '0');
  function todayIso(d) {
    const t = d || new Date();
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  }

  /** 把 'YYYY-MM-DD' 解析成本地零点 Date；解析不出来就用今天。 */
  function dayBase(iso) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(iso || ''));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /* ---------------- 记录可视化（v2.4.0） ----------------
   *
   * 以前 state.log 按天累计了 90 天，界面上只有一句「今日 N 分钟 · 本周 M 分钟」，
   * 看不出「这周比上周用功吗」「已经连着几天了」。这里把同一份 log 画成
   * 最近 N 天的柱子 + 连续天数，不新增任何存储字段。
   *
   * 两条硬规矩：①没有记录的那天是 0，不是「缺数据」，不画成灰问号；
   * ②柱子高度按「最近 N 天里的最大值」归一，不是按固定 120 分钟，
   * 免得刚用两周的人看到的全是齐刷刷的矮柱子。
   */

  /* @testable:histo */
  /** 最近 n 天（含 endIso 当天）的每日分钟，按时间正序。level 0~4 供上色。 */
  function histo(log, n, endIso) {
    // n 传坏了退回 14（paintHisto 传的是 HIST_DAYS）；0 或负数夹到 1，超上限夹到 MAX_LOG_DAYS
    const want = Math.round(Number(n));
    const cnt = Number.isFinite(want) ? Math.max(1, Math.min(MAX_LOG_DAYS, want)) : 14;
    const base = dayBase(endIso);
    const src = (log && typeof log === 'object') ? log : {};
    const out = [];
    let max = 0;
    for (let i = cnt - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const v = Math.max(0, Math.round(Number(src[todayIso(d)]) || 0));
      if (v > max) max = v;
      out.push({ key: todayIso(d), min: v, level: 0 });
    }
    for (let i = 0; i < out.length; i++) {
      const x = out[i];
      if (x.min <= 0 || max <= 0) { x.level = 0; continue; }
      x.level = Math.min(4, 1 + Math.floor((x.min / max) * 4));
    }
    return out;
  }
  /* @end */

  /* @testable:streak */
  /** 连续专注天数。今天还没开始不算断（昨天有就算连着）。 */
  function streak(log, endIso) {
    const base = dayBase(endIso);
    const src = (log && typeof log === 'object') ? log : {};
    let n = 0;
    for (let i = 0; i < MAX_LOG_DAYS; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const v = Math.round(Number(src[todayIso(d)]) || 0);
      if (v > 0) { n++; continue; }
      if (i === 0) continue;    // 今天还没坐下，不算断
      break;
    }
    return n;
  }
  /* @end */

  /* @testable:peakOf */
  /** 最近 n 天里最长的一天 {key, min}；一条记录都没有时返回 {key:'', min:0}。 */
  function peakOf(log, n, endIso) {
    const rows = histo(log, n, endIso);
    let best = { key: '', min: 0 };
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].min > best.min) best = { key: rows[i].key, min: rows[i].min };
    }
    return best;
  }
  /* @end */

  /* ---------------- 运行时状态（不持久化，只活在内存） ---------------- */

  let RT = {
    running: false,        // 计时器是否在走
    phase: 'focus',        // 当前阶段：'focus' | 'rest'（正计时永远是 focus）
    endAt: 0,              // 结束时间戳（ms）；正计时为「已走过秒数」累计用 startAt
    startAt: 0,            // 正计时开始时间戳
    acc: 0,                // 正计时累计秒数
    tickId: 0,
  };

  let audioCtx = null;
  let noiseNode = null;
  let noiseGain = null;
  let noiseOn = false;

  const $ = id => document.getElementById(id);

  /* ---------------- 白噪音（Web Audio 合成） ---------------- */

  function makeNoiseBuffer(type, ctx) {
    const len = ctx.sampleRate * 2;   // 2 秒循环 buffer
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else { // pink（Paul Kellet 简化滤波）
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  function stopNoise() {
    if (noiseNode) { try { noiseNode.stop(); } catch (e) {} }
    if (noiseGain) { try { noiseGain.disconnect(); } catch (e) {} }
    noiseNode = null; noiseGain = null; noiseOn = false;
  }

  function startNoise(type) {
    stopNoise();
    if (type === 'off') return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const src = audioCtx.createBufferSource();
      src.buffer = makeNoiseBuffer(type, audioCtx);
      src.loop = true;
      noiseGain = audioCtx.createGain();
      noiseGain.gain.value = 0.22;   // 白噪音默认音量，偏轻不吵
      src.connect(noiseGain).connect(audioCtx.destination);
      src.start();
      noiseNode = src;
      noiseOn = true;
    } catch (e) {
      /* Web Audio 不可用（极老 WebView）就静默跳过，不影响计时本身。 */
      noiseOn = false;
    }
  }

  /* ---------------- 计时核心 ---------------- */

  /** 当前阶段总时长（秒）。正计时没有终点，返回 null。 */
  function phaseTotal(state) {
    if (state.settings.mode === 'timer') return null;
    return (RT.phase === 'focus' ? state.settings.focusMin : state.settings.restMin) * 60;
  }

  /** 还剩多少秒（正计时返回已走秒数）。
   *  正计时未开始时 startAt=0，直接 Date.now()/1000 会返回一个巨大数字，
   *  所以未运行（startAt=0）时只回累计值 acc，通常为 0。 */
  function remain(state) {
    if (state.settings.mode === 'timer') {
      const live = RT.startAt ? Math.floor((Date.now() - RT.startAt) / 1000) : 0;
      return live + RT.acc;
    }
    return Math.max(0, Math.ceil((RT.endAt - Date.now()) / 1000));
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return pad2(m) + ':' + pad2(s);
  }

  function tick() {
    const state = load();
    if (state.settings.mode === 'timer') {
      paint();
      return;
    }
    // 番茄钟：倒计时到 0 → 阶段结束
    if (Date.now() >= RT.endAt) {
      endPhase(state);
      return;
    }
    paint();
  }

  /** 阶段结束：番茄钟专注→记一笔+切休息；休息→切回专注。正计时停则记。 */
  function endPhase(state) {
    stopTicker();
    RT.running = false;

    if (state.settings.mode === 'timer') {
      // 正计时手动停止才走到这，记走过的时间（至少 1 分钟才算）
      const sec = remain(state);
      if (sec >= 60) addLog(state, Math.round(sec / 60));
      toast('已结束，专注 ' + fmt(sec));
    } else if (RT.phase === 'focus') {
      addLog(state, state.settings.focusMin);
      RT.phase = 'rest';
      toast('专注 ' + state.settings.focusMin + ' 分钟完成，休息一下');
    } else {
      RT.phase = 'focus';
      toast('休息结束，可以开始下一段');
    }
    RT.endAt = 0; RT.startAt = 0; RT.acc = 0;
    paint();
  }

  function addLog(state, minutes) {
    const d = todayIso();
    state.log[d] = (state.log[d] || 0) + minutes;
    // 只留最近 90 天，防止记录无限膨胀
    const keys = Object.keys(state.log).sort();
    while (keys.length > MAX_LOG_DAYS) delete state.log[keys.shift()];
    save(state);
  }

  function startTicker() {
    stopTicker();
    RT.tickId = setInterval(tick, 500);
  }

  function stopTicker() {
    if (RT.tickId) { clearInterval(RT.tickId); RT.tickId = 0; }
  }

  function start() {
    const state = load();
    if (RT.running) return;
    RT.running = true;
    if (state.settings.mode === 'timer') {
      if (!RT.startAt) RT.startAt = Date.now();
      startTicker();
    } else {
      RT.endAt = Date.now() + phaseTotal(state) * 1000;
      startTicker();
    }
    paint();
  }

  function pause() {
    if (!RT.running) return;
    stopTicker();
    RT.running = false;
    if (load().settings.mode === 'timer') {
      // 正计时暂停：累计已走秒数，startAt 清零，下次 start 重新计时
      RT.acc += Math.floor((Date.now() - RT.startAt) / 1000);
      RT.startAt = 0;
    }
    paint();
  }
  function reset() {
    stopTicker();
    RT.running = false;
    RT.endAt = 0; RT.startAt = 0; RT.acc = 0;
    const state = load();
    if (state.settings.mode === 'pomo') RT.phase = 'focus';
    paint();
  }

  function toast(msg) {
    if (typeof XXMU !== 'undefined' && XXMU.toast) XXMU.toast(msg);
  }

  /* ---------------- 统计 ---------------- */

  /** 今日专注分钟数 + 最近 7 天总分钟。 */
  function stats(state) {
    const today = todayIso();
    const todayMin = state.log[today] || 0;
    let week = 0;
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const k = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      week += state.log[k] || 0;
    }
    return { todayMin, week };
  }

  /* ---------------- 界面 ---------------- */

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** 打开「设置」弹窗：改番茄钟时长、休息时长、选白噪音。 */
  function openSettings() {
    const body = $('sh-body');
    const sheet = $('sheet');
    if (!body || !sheet) return;
    // v1.1.28：专注卡可能正住在半框里，先把卡请回停车场，再写设置表单
    if (typeof parkTools === 'function') parkTools();
    $('sh-name').textContent = '专注计时设置';
    body.innerHTML = '';
    const state = load();

    const l1 = el('label', 'fr-label', '专注时长（分钟）');
    body.appendChild(l1);
    const focus = el('input', 'fr-input');
    focus.type = 'number'; focus.min = 1; focus.max = 180; focus.step = 1;
    focus.value = state.settings.focusMin;
    body.appendChild(focus);

    const l2 = el('label', 'fr-label', '休息时长（分钟）');
    body.appendChild(l2);
    const rest = el('input', 'fr-input');
    rest.type = 'number'; rest.min = 1; rest.max = 60; rest.step = 1;
    rest.value = state.settings.restMin;
    body.appendChild(rest);

    const l3 = el('label', 'fr-label', '白噪音');
    body.appendChild(l3);
    const chips = el('div', 'chips');
    [['off', '关'], ['white', '白噪音'], ['pink', '粉噪音'], ['brown', '棕噪音']].forEach(([v, label]) => {
      const b = el('button', state.settings.noise === v ? 'on' : '', label);
      b.type = 'button';
      b.onclick = () => {
        state.settings.noise = v;
        chips.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        applyNoise(v);
      };
      chips.appendChild(b);
    });
    body.appendChild(chips);

    const save = el('button', 'btn', '保存');
    save.onclick = () => {
      const fm = parseInt(focus.value, 10);
      const rm = parseInt(rest.value, 10);
      if (!Number.isFinite(fm) || fm < 1 || fm > 180) { toast('专注时长填 1 到 180'); return; }
      if (!Number.isFinite(rm) || rm < 1 || rm > 60) { toast('休息时长填 1 到 60'); return; }
      state.settings.focusMin = fm;
      state.settings.restMin = rm;
      save(state);
      closeSheet();
      paint();
      if (typeof paintToolEntries === 'function') paintToolEntries();
    };
    body.appendChild(save);

    const cancel = el('button', 'btn ghost', '取消');
    cancel.onclick = () => closeSheet();
    body.appendChild(cancel);

    sheet.classList.add('on');
  }

  function applyNoise(v) {
    if (v === 'off') stopNoise();
    else startNoise(v);
  }

  /** 画最近 14 天的柱子 + 连续天数。没有记录就写一句人话，不画空柱子。 */
  function paintHisto(state) {
    const box = $('focusHisto');
    const hint = $('focusHint');
    if (!box) return;
    const rows = histo(state.log, HIST_DAYS);
    let total = 0, days = 0;
    for (let i = 0; i < rows.length; i++) {
      total += rows[i].min;
      if (rows[i].min > 0) days++;
    }
    box.innerHTML = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const b = el('i', 'fh-bar fh-l' + r.level);
      b.title = r.key + '　' + r.min + ' 分钟';
      // 有记录的那天才给高度，0 分钟的留一条底线，让人看得出「这天没学」而不是「没数据」
      b.style.height = r.min > 0 ? Math.max(12, Math.round((r.min / Math.max(1, peakMax(rows))) * 100)) + '%' : '0';
      if (r.level === 0) b.className = 'fh-bar fh-zero';
      box.appendChild(b);
    }
    if (hint) {
      const sk = streak(state.log);
      const bits = [];
      if (total <= 0) bits.push('最近 ' + HIST_DAYS + ' 天还没有专注记录');
      else bits.push('最近 ' + HIST_DAYS + ' 天专注 ' + total + ' 分钟 · ' + days + ' 天有记录');
      if (sk >= 2) bits.push('连续 ' + sk + ' 天');
      /* v2.15.0：peakOf 从 v2.4.0 就写好、全库没人调用（高光日一直藏着）。
       * 现在有记录时补一句「最长一天 X 分钟 · M月D日」，没记录就不加噪音。 */
      const pk = peakOf(state.log, HIST_DAYS);
      if (pk.min > 0) bits.push('最长一天 ' + pk.min + ' 分钟 · ' + shortDate(pk.key));
      hint.textContent = bits.join(' · ');
    }
  }

  /** histo() 里用来归一的最大值（不含 0）。 */
  function peakMax(rows) {
    let m = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].min > m) m = rows[i].min;
    return m;
  }

  /** 'YYYY-MM-DD' → 'M月D日'，给「最长一天」那句话用。 */
  /* @testable:shortDate */
  function shortDate(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!m) return '';
    return (Number(m[2])) + '月' + (Number(m[3])) + '日';
  }
  /* @end */

  /** 重画整张卡。 */
  function paint() {
    const card = $('focusCard');
    if (!card) return;
    const state = load();
    /* v2.15.0：load() 里会把读失败/记录损坏写进 LAST_ERR，这里立刻取一份——
     * 别等到别处再 load，那会把错误清掉。旧版写了却从不显示，用户踩到坏数据
     * 只看到静默失败（mytodo.js 早有 readErr()+提示，这里照它补上）。 */
    const stateErr = LAST_ERR;
    const mode = state.settings.mode;
    // 模式切换按钮
    const segBtns = card.querySelectorAll('[data-fmode]');
    segBtns.forEach(b => b.classList.toggle('on', b.dataset.fmode === mode));

    // 计时数字
    const big = $('focusTime');
    if (big) {
      if (mode === 'timer') big.textContent = fmt(remain(state));
      else big.textContent = fmt(RT.running ? remain(state) : phaseTotal(state));
    }

    // 阶段标签
    const phase = $('focusPhase');
    if (phase) {
      if (mode === 'timer') phase.textContent = RT.running ? '正计时中' : '随时开始';
      else if (!RT.running) phase.textContent = RT.phase === 'focus' ? '番茄钟 · 待开始' : '休息 · 待开始';
      else phase.textContent = RT.phase === 'focus' ? '专注中 · 别分心' : '休息中 · 起来走走';
    }

    // 主按钮文字
    const btn = $('focusToggle');
    if (btn) btn.textContent = RT.running ? '暂停' : '开始';

    // 统计
    const st = stats(state);
    const statEl = $('focusStat');
    if (statEl) {
      statEl.textContent = '今日 ' + st.todayMin + ' 分钟 · 本周 ' + st.week + ' 分钟';
      /* v2.15.0：本机记录读不出来就说出来，别静默当 0 分钟。
       * 不往 statEl 追加错误文字（那行窄，塞长句会挤成两行），改用独立的
       * #focusErr 行承载；statEl 只负责上色。 */
      statEl.classList.toggle('warn', !!stateErr);
      const errEl = $('focusErr');
      if (errEl) {
        errEl.textContent = stateErr || '';
        errEl.style.display = stateErr ? '' : 'none';
      }
    }

    paintHisto(state);

    // 白噪音 chips 高亮
    const noiseBtns = card.querySelectorAll('[data-noise]');
    noiseBtns.forEach(b => b.classList.toggle('on', b.dataset.noise === state.settings.noise));
  }

  /* ---------------- init ---------------- */

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;

    const card = $('focusCard');
    if (!card) return;

    const seg = card.querySelector('[data-fmode-seg]');
    if (seg) {
      seg.querySelectorAll('[data-fmode]').forEach(b => {
        b.onclick = () => {
          if (b.dataset.fmode === load().settings.mode) return;
          const state = load();
          // 切模式先停掉当前计时，避免两种模式的运行时状态混在一起
          stopTicker(); RT.running = false; RT.endAt = 0; RT.startAt = 0; RT.acc = 0;
          state.settings.mode = b.dataset.fmode;
          if (state.settings.mode === 'pomo') RT.phase = 'focus';
          save(state);
          paint();
        };
      });
    }

    const toggle = $('focusToggle');
    if (toggle) toggle.onclick = () => (RT.running ? pause() : start());

    /* v2.15.0 修真 bug：这里原来写 `const reset = $('focusReset'); if (reset) reset.onclick = reset;`。
     * 局部 const reset 把模块级 function reset() 遮住了，末句实际是「把 DOM 元素自己
     * 绑成点击回调」——点「重置」抛 TypeError，计时照跑，秒表归零只能靠切模式。
     * 改：局部变量改名 resetBtn，回调显式调用模块级 reset()。 */
    const resetBtn = $('focusReset');
    if (resetBtn) resetBtn.onclick = () => reset();

    const set = $('focusSet');
    if (set) set.onclick = openSettings;

    const noiseSeg = card.querySelector('[data-noise-seg]');
    if (noiseSeg) {
      noiseSeg.querySelectorAll('[data-noise]').forEach(b => {
        b.onclick = () => {
          const state = load();
          state.settings.noise = b.dataset.noise;
          save(state);
          applyNoise(state.settings.noise);
          paint();
        };
      });
    }

    paint();
  }

  return {
    init, paint, start, pause, reset,
    load, save, stats, fmt, todayIso, remain,
    startNoise, stopNoise, makeNoiseBuffer,
    histo, streak, peakOf, paintHisto, shortDate,
    readErr: () => LAST_ERR,
    K, MAX_LOG_DAYS, HIST_DAYS, D_FOCUS_MIN, D_REST_MIN,
  };
})();
