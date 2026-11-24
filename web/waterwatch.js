/* ================================================================
 *  出水看护（v2.1.0）
 *
 *  用户原话：「饮水机能不能做个自己检索是否停止，因为软件上点停止有延迟，
 *  所以更喜欢按饮水机上的停止按钮。但是软件不会检索是否停止。」
 *
 *  要解决的其实是三件事，一件比一件靠后：
 *    ① App 里点「停止」之后，机器真正停阀要几秒（命令只下发到串口/2G 通道），
 *       那段等待只有 sheet 里那一行字在说，关掉 sheet 就看不见了；
 *    ② watchVolume 有 12 分钟上限，到点它返回 pending 就撒手，那时如果人
 *       还在接水，之后没有任何东西会知道它停了；
 *    ③ RUNNING 只存内存，App 一被杀、被切后台久了，界面回到「放水」，
 *       人以为还在接水 —— 而水可能早就停了，也可能真的还在流。
 *
 *  做法：把「已解锁、还没确认结束」的出水口按 devId:skuId 持久化到本机，
 *  用官方查状态接口 goods/shower/sync（就是 WATER.syncWater）定时读一次，
 *  一读到 status 3/5/6 就收掉这一条并主动告诉人。**不猜接口、不换算毫升、
 *  读不到就说读不到。**
 *
 *  边界（必须诚实，界面文案也要照这个写）：
 *    · 只看护「本机解锁过」的出水口。平台没有「按机器查当前状态」的接口，
 *      goods/shower/sync 只认 skuId —— 别人在那台机器上接水，这里看不到。
 *    · 分不清「你在机器上按了停止」「到量自停」「本机发的防忘关停止」，
 *      所以文案只说「已经停了」，不替人编一个原因。
 *    · status 3/5 之前的 amount 一直是 0，结算量只在结束时出现，原样显示。
 *    · 30 分钟还读不出结论就放弃看护，明说放弃 —— 不编一个「已停止」。
 * ================================================================ */

const WATERWATCH = (() => {
  /** 持久化的「正在出水」清单：{ 'devId:skuId': { dev, devName, sku, name, at } } */
  const K_LIVE = 'xxmu_water_live';
  /** 前台轮询间隔。比 watchVolume 的 800ms 慢得多：这里查的是「停没停」，
   *  不是用量曲线，没必要猛刷（sources.js 的自动同步也是这个纪律）。 */
  const GAP = 8000;
  /** 页面不可见时降频，省电；回到前台会立刻补一次。 */
  const HIDDEN_GAP = 30000;
  /** 解锁后这么久还没出水，提示一次「机器可能没按」。 */
  const NO_FLOW_MS = 3 * 60 * 1000;
  /** 超过这么久还没结论就放弃，别拿一条永远「在读」的行糊着人。 */
  const STALE_MS = 30 * 60 * 1000;
  /** 「刚刚停了」那行留在卡片上的时间。 */
  const ENDED_KEEP_MS = 5 * 60 * 1000;

  let busy = false;          // sheet 里有操作在跑：让 watchVolume 独占轮询，不双打
  let ticking = false;       // 单飞：上一轮没跑完就跳过（同 sources.js 的做法）
  let timerId = null;
  let inited = false;

  /** 最近一次读到的东西，内存态，只服务界面：key → {status, amount, at, err, ...} */
  let lastState = {};
  /** 「刚刚停了 / 放弃了」的临时行：[{ text, cls, until }] */
  let transient = [];
  /** 结束回调（app.js 用来同步按钮态等） */
  const subs = [];

  function keyOf(dev, fn) {
    return String((dev && dev.id) || '') + ':' + String((fn && fn.id) || '');
  }

  function rawLoad() {
    try {
      const s = XXMU.pref(K_LIVE) || '';
      if (!s) return {};
      const o = JSON.parse(s);
      return (o && typeof o === 'object') ? o : {};
    } catch (e) {
      /* 存坏了就当没有。不 throw —— 这一层坏掉不该拖累饮水机主流程。 */
      return {};
    }
  }

  function rawSave(map) {
    try { XXMU.pref(K_LIVE, JSON.stringify(map || {})); } catch (e) {}
  }

  function hasLive() {
    return Object.keys(rawLoad()).length > 0;
  }

  /** 这个出水口是不是还在看护清单里。renderDevs 用它决定按钮显示「放水」还是
   *  「停止」—— RUNNING 只存内存，App 被杀之后这里还有记录，界面才不会骗人。 */
  function has(dev, fn) {
    const devId = (dev && typeof dev === 'object') ? dev.id : dev;
    const sku = (fn && typeof fn === 'object') ? fn.id : fn;
    return !!rawLoad()[String(devId) + ':' + String(sku)];
  }

  function curGap() {
    const hidden = (typeof document !== 'undefined')
      && (document.hidden === true || document.visibilityState === 'hidden');
    return hidden ? HIDDEN_GAP : GAP;
  }

  /* ---------------- 注册 / 注销 ---------------- */

  /**
   * 记下「这个出水口已经解锁、还没确认结束」。
   * 重复解锁不重置起点（at 沿用旧的），否则「已放多少秒」会跳回 0。
   */
  function arm(dev, fn) {
    if (!dev || !fn) return null;
    const k = keyOf(dev, fn);
    const map = rawLoad();
    const prev = map[k] || {};
    map[k] = {
      dev: String(dev.id),
      devName: dev.name || ('机器 ' + dev.id),
      sku: String(fn.id),
      name: fn.name || '',
      at: Number(prev.at) || Date.now(),
    };
    rawSave(map);
    delete lastState[k];
    schedule();
    paint();
    return map[k];
  }

  /** 确认结束了（或者用户自己点了停止并且已经核实）就把这条收掉。 */
  function disarm(devOrId, sku) {
    const devId = (devOrId && typeof devOrId === 'object') ? devOrId.id : devOrId;
    const k = String(devId) + ':' + String(sku);
    const map = rawLoad();
    if (map[k]) {
      delete map[k];
      rawSave(map);
    }
    delete lastState[k];
    paint();
    return true;
  }

  /** 把某台机器下所有出水口都收掉（移除设备 / 退出账号时用，别再对着
   *  一台已经不显示的机器轮询）。 */ 
  function disarmDev(devOrId) {
    if (devOrId === undefined || devOrId === null || devOrId === '') {
      /* 无参 = 全清（退出账号）。 */
      rawSave({});
      lastState = {};
      paint();
      return -1;
    }
    const devId = String((devOrId && typeof devOrId === 'object') ? devOrId.id : devOrId);
    const map = rawLoad();
    let n = 0;
    Object.keys(map).forEach(k => {
      if (String(map[k].dev) === devId) { delete map[k]; delete lastState[k]; n++; }
    });
    if (n) rawSave(map);
    paint();
    return n;
  }

  function list() {
    const map = rawLoad();
    return Object.keys(map).map(k => {
      const it = map[k];
      return Object.assign({ key: k }, it, lastState[k] || {});
    }).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  }

  /* ---------------- 轮询 ---------------- */

  function notifyEnd(it, st, byWhat) {
    const who = (it.devName || '饮水机') + (it.name ? ' · ' + it.name : '');
    const amt = Number(st && st.amount) || 0;
    if (st && st.fault) {
      XXMU.toast('饮水机报故障（状态 6）：' + who + '，这次放水没有正常结束。');
      pushLine('! ' + who + ' 报故障（状态 6），请到机器上看一眼', 'warn');
    } else {
      XXMU.toast('饮水机已经停了：' + who
        + (amt > 0 ? (' · 平台结算量 ' + amt + '（原样）') : ' · 平台没给结算量'));
      pushLine('✓ ' + who + ' 已经停了' + (amt > 0 ? (' · 平台结算量 ' + amt + '（原样，以胖乖账单为准）') : ' · 平台没给结算量'),
        'ok');
    }
    subs.forEach(f => { try { f(it, st, byWhat || 'sync'); } catch (e) {} });
  }

  function notifyGiveUp(it) {
    const who = (it.devName || '饮水机') + (it.name ? ' · ' + it.name : '');
    pushLine('? ' + who + ' 读了 30 分钟还没结论，先不看了（机器会自己到量停）', 'warn');
    subs.forEach(f => { try { f(it, { giveUp: true }, 'giveup'); } catch (e) {} });
  }

  function pushLine(text, cls) {
    transient.push({ text: text, cls: cls || 'ok', until: Date.now() + ENDED_KEEP_MS });
    if (transient.length > 4) transient = transient.slice(-4);
  }

  /**
   * 读一轮。串行、不并发 —— 一台机器一个请求，不猛刷。
   * 返回 { ran, ended, skipped }，给测试和调试用。
   */
  function pollOnce() {
    if (ticking) return Promise.resolve({ ran: 0, ended: 0, skipped: 'ticking' });
    if (busy) return Promise.resolve({ ran: 0, ended: 0, skipped: 'busy' });

    const map = rawLoad();
    const keys = Object.keys(map);
    if (!keys.length) { paint(); return Promise.resolve({ ran: 0, ended: 0, skipped: 'empty' }); }

    ticking = true;
    let ran = 0;
    const ended = [];

    let chain = Promise.resolve();
    keys.forEach(k => {
      chain = chain.then(() => {
        const it = map[k];
        if (!it) return null;
        ran++;
        return WATER.syncWater(it.sku).then(s => {
          const t = Date.now();
          const age = t - (Number(it.at) || t);
          if (s.status === 3 || s.status === 5) {
            lastState[k] = { status: s.status, amount: s.amount, at: it.at, endedAt: t, err: '' };
            ended.push(k);
          } else if (s.status === 6) {
            lastState[k] = { status: 6, amount: s.amount, at: it.at, endedAt: t, fault: true, err: '' };
            ended.push(k);
          } else {
            lastState[k] = {
              status: s.status,
              amount: s.amount,
              at: it.at,
              waiting: (s.status === 1 || s.status === 4) && age > NO_FLOW_MS,
              err: '',
            };
          }
          return null;
        }).catch(e => {
          /* 读不到就是读不到：保留这一条继续试，绝不因此判「已停止」。 */
          lastState[k] = Object.assign({}, lastState[k] || {}, {
            at: it.at,
            err: String((e && e.message) || e || '读不到状态'),
          });
          return null;
        });
      });
    });

    return chain.then(() => {
      ticking = false;
      const now = Date.now();
      const map2 = rawLoad();

      ended.forEach(k => {
        const it = map2[k] || map[k];
        delete map2[k];
        notifyEnd(it, lastState[k] || {});
        delete lastState[k];
      });

      Object.keys(map2).forEach(k => {
        const it = map2[k];
        const age = now - (Number(it.at) || now);
        if (age > STALE_MS) {
          delete map2[k];
          delete lastState[k];
          notifyGiveUp(it);
        }
      });

      rawSave(map2);
      paint();
      return { ran: ran, ended: ended.length };
    }).catch(e => {
      ticking = false;
      return { ran: ran, ended: ended.length, error: String((e && e.message) || e) };
    });
  }

  /* ---------------- 定时器 ---------------- */

  function schedule() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (!hasLive()) return;
    timerId = setTimeout(step, curGap());
  }

  function step() {
    timerId = null;
    pollOnce().then(() => schedule(), () => schedule());
  }

  /** 立刻读一次（回到前台、刚解锁完），然后重新排期。 */
  function kick() {
    if (!hasLive()) { paint(); return Promise.resolve({ ran: 0, skipped: 'empty' }); }
    return pollOnce().then(r => { schedule(); return r; }, () => { schedule(); return { ran: 0 }; });
  }

  /** sheet 里有操作在跑时为 true：那段时间让 watchVolume 独占，别双打接口。 */
  function setBusy(v) {
    const was = busy;
    busy = !!v;
    if (was && !busy) kick();
  }

  /* ---------------- 界面 ---------------- */

  function mk(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = String(text);
    return d;
  }

  function hms(ms) {
    const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (s < 60) return s + ' 秒';
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return m + ' 分' + (r ? (' ' + r + ' 秒') : '');
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  }

  function lineOf(x) {
    const who = (x.devName || '饮水机') + (x.name ? ' · ' + x.name : '');
    const age = hms(Date.now() - (Number(x.at) || Date.now()));
    if (x.err) {
      /* 有读不到的错，但也不能因此说水停了 —— 只如实说「暂时读不到」。 */
      return { cls: 'warn', dot: '?', text: who + ' · 暂时读不到状态，继续试（' + x.err + '）' };
    }
    if (x.waiting) {
      return { cls: 'warn', dot: '○', text: who + ' · 解锁了但一直没出水（已等 ' + age + '），去机器上按一下出水键' };
    }
    if (x.status === 2) {
      return { cls: 'live', dot: '●', text: who + ' · 正在出水（已 ' + age + '）· 在机器上按停止键，这边会自动跟着变' };
    }
    if (x.status === 1 || x.status === 4) {
      return { cls: '', dot: '○', text: who + ' · 已解锁，等你去机器上按出水键（已等 ' + age + '）' };
    }
    return { cls: '', dot: '·', text: who + ' · 状态 ' + (x.status || '未知') + '（已 ' + age + '）' };
  }

  /** 重画卡片顶部那块「出水看护」。没有内容就整块藏起来，不占地方。 */
  function paint() {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('waterLive');
    if (!box) return;

    const now = Date.now();
    transient = transient.filter(x => x.until > now);
    const items = list();

    box.innerHTML = '';
    if (!items.length && !transient.length) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';

    transient.forEach(x => {
      const row = mk('div', 'live-row ' + x.cls);
      row.appendChild(mk('span', 'live-dot', x.cls === 'ok' ? '✓' : '!'));
      row.appendChild(mk('span', 'live-txt', x.text));
      box.appendChild(row);
    });

    items.forEach(x => {
      const d = lineOf(x);
      const row = mk('div', 'live-row ' + d.cls);
      row.appendChild(mk('span', 'live-dot', d.dot));
      row.appendChild(mk('span', 'live-txt', d.text));
      box.appendChild(row);
    });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    if (inited) return;
    inited = true;

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || document.visibilityState === 'hidden') {
          schedule();          /* 换成长间隔，别在后台猛刷 */
        } else {
          kick();              /* 回到前台立刻补一次 */
        }
      });
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => kick());
    }

    /* App 从后台回来时 MainActivity 会喊 window.__onResume。这里包一层而不是
     * 覆盖：app.js 的自动同步也要跑，谁都不能把另一个挤掉。 */
    if (typeof window !== 'undefined') {
      const prev = window.__onResume;
      window.__onResume = function () {
        try { if (typeof prev === 'function') prev.apply(this, arguments); } catch (e) {}
        kick();
      };
    }

    paint();
    schedule();
  }

  /** 注册「这条出水口结束了」的回调（app.js 用来同步按钮态）。 */
  function onEnd(fn) {
    if (typeof fn === 'function') subs.push(fn);
  }

  return {
    init, arm, disarm, disarmDev, has, list, pollOnce, kick, setBusy, paint, onEnd,
    K_LIVE, GAP, HIDDEN_GAP, NO_FLOW_MS, STALE_MS,
  };
})();

/* 自启动守卫：浏览器里 module 不存在，node 里存在但不该在这里跑 DOM。
 * v2.0.0 的 learnplus.js 在这条上踩过坑（写成 !module.exports，浏览器里
 * module 未定义 → ReferenceError 抛在 try 外面 → init 从来没执行过）。 */
if (typeof module === 'undefined' && typeof window !== 'undefined') {
  try {
    if (typeof WATER !== 'undefined' && typeof XXMU !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { try { WATERWATCH.init(); } catch (e) {} });
      } else {
        WATERWATCH.init();
      }
    }
  } catch (e) {}
}
