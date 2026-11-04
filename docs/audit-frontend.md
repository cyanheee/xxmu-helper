# 河医大助手 · 前端代码审计报告

- **审计范围**：`web/*.js`、`web/index.html`、`web/app.css`（只审前端，不含 Cloudflare Worker 与 Java 侧）
- **审计方式**：逐文件全文阅读（`app.js` 4080 行分 12 段读完），每条结论都用脚本回查过当前行号与原文
- **基线行数**：`app.js` 4080 / `wiki.js` 856 / `auth.js` 515 / `chaoxing.js` 609 / `sync.js` 402 / `license.js` 363 / `about.js` 532 / `water.js` 682 / `guide.js` 334 / `tut.js` 290 / `onboard.js` 128 / `index.html` 810 / `app.css` 842
- **结论**：**严重 4 条**，中等 13 条，轻微 10 条，合计 27 条

---

### [严重] web/onboard.js:116 包装 `__onLoginSuccess` 时吞掉 `chk`，学号核对在第一次登录就被标成「已知情」
- 现象：
  ```js
  const oldKb = window.__onLoginSuccess;                              // 115
  window.__onLoginSuccess = function () {          // 116 —— 签名里没有 chk
    if (typeof oldKb === 'function') { try { oldKb(); } catch (e) {} }   // 117 —— 调用也不传
    paint();
  };
  ```
  而 `web/sync.js:401` 是带参数调用的：`if (window.__onLoginSuccess) window.__onLoginSuccess(chk);`，`chk` 是 `LICENSE.noteKbAccount(acct)` 的返回（`sync.js:388`）。
- 后果：`app.js:1172` 的 `if (chk && chk.ok === false)` 永远收到 `undefined`，于是**直接落到 `app.js:1185` 的 `syncSchedule(true)`**。`syncSchedule` 内部还有一道 `app.js:1224-1250` 的兜底，所以拦截文案还能弹出来——但那道兜底在 `1240-1246` 弹完提示后就执行 `kbMismatchAck = true`（`app.js:1239`）。结果就是：**用户第一次登录，软件立刻自动同步了一次、并且把「已知情」标死**；下一秒 `__onUnlocked`（`app.js:4056`）的 800ms 自动同步、或用户随便点一次同步按钮，`kbMismatchAck` 已经是 `true`，直接放行，把别人学号的课表同步进来当成自己的。这正是 `app.js:1155` 注释里写明要防的事。原始设计是「第一次告知、用户主动再点一次才放行」，现在变成了「第一次就替用户点了」。
- 建议：透传参数。
  ```js
  window.__onLoginSuccess = function (chk) {
    try { if (typeof oldKb === 'function') oldKb(chk); } catch (e) {}
    paint();
  };
  ```
  `__onCxLoggedIn`（`onboard.js:121`）保持无参（`app.js:812` 的定义本身也不带参），但要顺手确认 `paint()` 不依赖参数。

---

### [严重] web/sync.js:203 `parseWeeks` 匹配失败静默返回空数组，整门课从课表上消失
- 现象：
  ```js
  function parseWeeks(s) {
    const m = /([\d,\-]+)\[([\d,\-]+)\]/.exec(String(s || '').trim());    // 202
    if (!m) return { weeks: [], periods: [] };                          // 203
    ...
  }
  ```
  只有形如 `1-16[1-2]` 才解析得出。青果改版后若给出 `1-16周 第1-2节`、`[1-2节]1-16周`、或裸 `1-16`，一律落到空数组。
- 后果：`sync.js:228` 把空数组写进 `courses[].weeks`，之后 `app.js:86` 的 `c.weeks.includes(week)` 恒为 false、`app.js:226` 的 `totalOf` 也不计 → **这门课在任何一周都不显示、总数也不计，全程没有任何提示**。而 `sync.js:249` 的 `count: courses.length` 仍然把这门课算进去，`app.js:1289` 会 toast「同步完成：N 门课」——数字和画面直接对不上，用户无法判断是漏课还是本来就没这门。
- 建议：`if (!m)` 时不要返回空壳；把整串丢进 `weeks: []` 前先记一条告警，并让 `buildSchedule` 返回 `{ count, warnings }`：
  ```js
  out.push({ ..., raw_weeks: c.weeks, _badWeeks: !w.weeks.length });
  ```
  同步完成后若 `warnings.length` 则 toast「有 X 门课周次没解析出来，可能不显示」，并在课表页留一行可展开的提示。

---

### [严重] web/app.js:106 冲突格排不下时直接 `return`，整门课被静默丢弃
- 现象：
  ```js
  while (s + len - 1 <= PERIODS && occ.slice(s, s + len).some(Boolean)) s++;   // 105
  if (s + len - 1 > PERIODS) return;                                          // 106
  for (let i = s; i < s + len; i++) occ[i] = true;                            // 107
  out.push({ ...g, start: s, span: len });                                    // 108
  ```
- 后果：某天课程多到排不下，或某门课的 `periods` 跨度异常（如写成 `[1,14]`，`len` 就是 14）时，后面的课**整块不画**。而 `app.js:184` 的 `#kbtip` 用的是 `totalOf(curWeek)`（课程条数），会显示「本周 N 节课」而课表上少一块，用户无法判断哪门丢了、也不会去重新同步。
- 建议：排不下时降级而不是丢弃——`span` 截到剩余节次继续画，或至少把被丢的课收进 `dropped`，在 `#kbtip` 追加「另有 X 节时间冲突未显示」。

---

### [严重] web/chaoxing.js:543 `get(...).then()` 没有 `.catch`，`sync()` 的 Promise 可能永不 settle
- 现象：
  ```js
  return new Promise((resolve) => {                                  // 434 附近
    ...
    get(API_HOST + '/mycourse/backclazzdata?view=json').then(raw => {   // 469
      const b = body(raw);
      ...
      next();                                                          // 542
    });                                                                // 543 —— 链到此结束，无 catch
  });
  ```
  外层 `new Promise` 的 executor 里没有 `try`，整条 `.then` 链也没有 `.catch`。
- 后果：`body()` / `parseCourses()` 里任何一次同步抛错（服务端结构变了、`raw` 异常），Promise 永久 pending，`resolve` 不会被调用。`app.js:760` 置的 `busy = true` 永不复位 → 按钮永久停在「抓取中…」，`app.js:765` 的 `.then` 与 `783` 的 `.catch` 都不会跑，`paint()` 也不再更新。用户只能杀进程重进，而且下次点还是同样卡住。
- 建议：链尾补
  ```js
  .catch(e => resolve({ ok: false, error: '抓取出错：' + ((e && e.message) || e) }));
  ```
  `app.js:760` 侧再加一层 60s 超时兜底：超时就 `busy = false` 并提示「抓取超时，稍后再试」。

---

### [中等] web/license.js:211 `isActivated()` 只检查本机 pref 里有 `K_ID`
- 现象：
  ```js
  function isActivated() {          // 210
    return !!get(K_ID);             // 211
  }
  ```
  配合 `web/auth.js:238` 的 `return LICENSE.isActivated() || localValid();`
- 后果：v1.1.0 取消激活码之后，本地门槛退化为「pref 里有个非空字符串」。而 `auth.js:265` 的 `LICENSE.activate(sid, cd)` 是在联网验证**之前**执行的，`activate()` 也只校验「6-20 位数字」。能读写 App 私有目录的环境（root、`adb backup` 解包重打包、部分厂商备份工具）写一个 `xxmu_license_id=123456` 就等于「已登记」。这不是当前会大面积发生的事，但意味着**离线宽限期的边界完全由本机决定**，Worker 侧的 `/v1/activate` 成了可选的建议而非门槛。
- 建议：把 `isActivated()` 明确降级为「本地已登记」的弱判据（改名或加注释），真正的门槛交给服务端签发的 ticket + `expAt`（`auth.js:210-216` 的 `localValid()` 已经在做）。`auth.js:268` 的 `fingerprint()` 已经算出并随 `/v1/activate` 发出去了，但**本地没有拿它做任何校验**——建议 ticket 与 `fp` 绑定时也在本地比对一次，指纹不符就让 ticket 失效。

---

### [中等] web/wiki.js:439 校园图片拉取失败时清空已有数据并重渲染
- 现象：
  ```js
  PHOTO_INFLIGHT = AUTH.Photos.list().then(res => {
    const arr = res && res.ok ? (res.rows || res.list) : null;
    if (Array.isArray(arr)) { PHOTOS = arr; PHOTOS_AT = Math.floor(Date.now() / 1000); }   // 436
    render();
  }, () => { PHOTOS = []; render(); })        // 439 —— 失败也清空
   .then(() => { PHOTO_INFLIGHT = null; });
  ```
- 后果：网络一抖，已经显示出来的校园实景照瞬间全消失，换成 `wiki.js:369` 的「还没有通过的校园图片。你拍一张传上来…」——用户会以为内容被管理员删光了。`loadPhotos(force)` 有 60 秒时间窗（`424`），但**这条路径上没有任何「重试」入口**：`photosSection()` 的 `if (!PHOTO_TRIED) setTimeout(loadPhotos, 60)`（`380`）在 `PHOTO_TRIED` 已为真后不再调度，用户只能切 tab 触发 `WIKI.render()` 或杀进程重进。
- 建议：失败分支保留旧 `PHOTOS` 不动；`PHOTOS_AT` 的语义改成「最后一次成功时间」，并且在 `photosSection()` 里当 `PHOTOS.length && 距上次成功 > 5 分钟` 时追加一条可点的「图片加载失败，点这里重试」→ `loadPhotos(true)`。

---

### [中等] web/wiki.js:587 留言板失败同样清空，且 `FB_TRIED` 永不复位、没有 force 入口
- 现象：
  ```js
  function loadFeedback() {              // 579
    FB_TRIED = true;                     // 580 —— 请求前就置位
    ...
    AUTH.Feedback.list().then(res => {
      const arr = res && res.ok ? (res.rows || res.list) : null;
      if (Array.isArray(arr)) FBS = arr;
      render();
    }, () => { FBS = []; render(); });   // 587
  }
  ```
  对比 `loadPhotos(force)`（`423`）——后者有 force 参数和 60 秒时间窗，**`loadFeedback` 两个都没有**，`FB_TRIED` 一旦置真就再没有复位点（`wiki.js` 全文只有 `530` 声明、`545/552` 读、`580` 写这四处）。
- 后果：一次失败后本次启动内留言板永远是空的，`wiki.js:545` 的空态文案还写着「还没有公开的留言」，把加载失败说成了事实。用户刚发过言却看不到自己那条在不在，很可能重复提交。
- 建议：`loadFeedback` 补 `force` 参数与 60 秒时间窗，和 `loadPhotos` 对齐；失败分支不清 `FBS`；`FB_TRIED` 的置位移到成功分支，失败时留「点这里重试」。

---

### [中等] web/auth.js:265-301 激活先写本地再联网，失败分支不回滚
- 现象：
  ```js
  LICENSE.activate(sid, cd);          // 265 —— 先把学号写进 pref
  if (ak) LICENSE.setUser(sid, '');   // 266
  ...
  }).catch(e => {
    if (ak) {
      return { ok: false, msg: '管理员身份需要联网验证，当前连不上服务器：' + ... };   // 295-300
    }
    return { ok: true, offline: true, msg: ... };   // 301
  });
  ```
  只有服务端**明确拒绝**的分支（`283`）才 `LICENSE.deactivate()`。
- 后果：管理员在离线/网络异常下被拒（`ok:false`，`app.js` 会把人挡在门外），但本机 `K_ID` 已经写入、`isActivated()` 为真；用户第二次走不带 akey 的普通激活时，`license.js:215` 的 `activate` 看到旧值相同就直接沿用。反方向也一样：学生「离线激活成功」之后如果服务端本来会拒绝（已停用账号），本地要等下一次 `check()` 才发现。
- 建议：把 `LICENSE.activate/setUser` 挪到服务端返回 `ok` 之后；离线分支单独走 `LICENSE.activateOffline(sid)` 并在 pref 里打 `offline=1` 标记，下次联网强制复核。

---

### [中等] web/auth.js:382 `check()` 网络失败一律放行，且丢掉错误原因
- 现象：
  ```js
  return { ok: true, reason: 'soft' };   // 380，未知原因不锁死
  })
  .catch(() => ({ ok: true, offline: true }));   // 382 —— catch 不带参数
  ```
- 后果：服务端 500、证书错误、被劫持，与「真的没网」在 UI 上完全一样——`about.js` 的诊断串只能显示「尚未联网校验」，`btnCopyDiag` 复制出来的内容也区分不了。`380` 行的注释说「未知原因不锁死，避免误伤」，但这样一来一个被停用的账号只要让请求失败（飞行模式）就能继续用；管理员想排查「为什么这一批学生都用不了」也拿不到任何区分信息。
- 建议：`.catch(e => ({ ok: true, offline: true, why: errText(e) }))`，把 `why` 带进「我的 → 关于」的诊断串和复制内容里；对 `reason` 为 `revoked` / `bad_ticket` 的明确拒绝，不要被后续分支的 `offline` 语义盖掉。

---

### [中等] web/app.js:1252-1253 `syncSchedule` 无重入锁，并发两条同步会互相提前解锁按钮
- 现象：
  ```js
  const btn = document.getElementById('btnSync');                       // 1252
  btn.disabled = true; btn.classList.add('busy'); btn.textContent = '同步中…';   // 1253
  ```
  全文件 grep 不到任何 `SYNCING` / `syncRunning` 之类的模块级标志。复位在 `1294-1296` 的 `.finally` 里**无条件**执行。
- 后果：`app.js:4056` 的 `setTimeout(() => syncSchedule(false), 800)`（进 App 自动同步）与用户手点「从教务同步课表」（`app.js:1300`）可以叠在一起。先完成的那条 `finally` 把按钮放开，第二条还在跑，用户可以再点出第三条。三条并发抓同一份课表、都写 `Host.saveCachedSchedule`（`1282`），最后一次写赢——结果是随机的一份。`.finally` 的复位本身是对的（这是上一版修好的），但**没有锁的时候它反而成了提前放行**。
- 建议：加模块级 `let SYNCING = false;`：
  ```js
  if (SYNCING) { if (showResult) XXMU.toast('正在同步中…'); return; }
  SYNCING = true;
  ```
  `finally` 里复位 `SYNCING`；`btn.disabled` 只由这个标志驱动。

---

### [中等] web/app.js:1703 停用成功后取 `$('admP-list').style` 没有 null 保护
- 现象：
  ```js
  LIST = [];                                                    // 1702
  if ($('admP-list').style.display !== 'none') refreshList();    // 1703
  ```
  同一函数族的解封分支写的是有保护的版本（`1736`）：`if ($('admP-list') && $('admP-list').style.display !== 'none') refreshList();`
- 后果：`admP-list` 一旦不存在（分段改版、HTML 顺序调整），这行在 `.then` 回调里抛 `TypeError`，变成 unhandled rejection。`busy(btn, false)` 已执行（`1698`）、成功提示也已打出（`1700`），但名单不会刷新——用户看到「已停用 1 个」却还是原来那一行，会怀疑没生效再点一次。
- 建议：统一成 `if ($('admP-list') && $('admP-list').style.display !== 'none')`，与 `1736` 对齐。

---

### [中等] web/app.js:2615-2626 `saveKey` 验证失败后不回滚内存里的口令
- 现象：
  ```js
  XXMU.pref(K_KEY, k);       // 2615 —— 先落盘
  AUTH.Admin.setKey(k);      // 2616 —— 先写内存
  AUTH.Admin.list().then(res => {
    if (res && res.ok) { ... }
    else {
      setMsg(msg, (res && res.msg) || '口令不正确');
      XXMU.pref(K_KEY, '');  // 2626 —— 只清了 pref
    }
  });
  ```
- 后果：`AUTH.Admin` 内部的 `this.key` 仍是那个错误口令。本次会话内后续所有管理员请求（`refreshStats` / `loadCfg` / `revoke` / `loadRevPhotos`…）都带着它发出去，一律 401。用户改成对的口令再点保存——**在保存成功之前那一次请求仍然用旧口令**，看起来就是「改了也没用」，只能杀进程。
- 建议：失败分支补 `AUTH.Admin.setKey('')`；或改成先用临时变量验证、成功后再 `XXMU.pref` + `setKey` 一起落库。

---

### [中等] web/app.js:3257-3263 `probe()` 用 `.catch(() => probe())` 把所有网络错误吃掉
- 现象：
  ```js
  const probe = () => {                                       // 3257
    if (i >= fns.length) return Promise.resolve(null);
    ...
    }).catch(() => probe());                                  // 3263
  };
  ```
- 后果：所有出水口都请求失败（没网 / token 过期 / 接口报错）时 `probe()` 返回 `null`，界面走 `app.js:3314-3324` 显示「**没查到正在出水的口。如果机器还在出水，点下面的按钮强制结束**」——把一个网络故障说成了「机器没在出水」，还递上一个「结束并结算」的按钮。用户照着点，会对一台可能正在正常出水的机器发 `endWater`，这是会产生费用的误操作。
- 建议：`catch(e)` 里把错误累积起来，`i >= fns.length` 时区分两种情况：
  ```js
  if (errCount && !hitCount) return { err: lastErr };   // 全部失败
  return null;                                          // 全部成功但都没金额
  ```
  上层对 `err` 提示「查不到出水状态：<原因>，请检查网络后重试」，**不要**递强制结束按钮。

---

### [中等] web/app.js:86 / 226 未校验 `c.weeks` 是数组，外部 JSON 写成字符串会静默漏课或整页中断
- 现象：
  ```js
  const list = DATA.courses.filter(c => c.day === day && c.weeks.includes(week));   // 86
  const totalOf = w => DATA.courses.filter(c => c.weeks.includes(w)).length;        // 226
  ```
  数据源是 `load()` 里的 `readExternal() || readCached() || window.SCHEDULE || {courses: []}`，而 `readExternal()` 只校验了 `Array.isArray(d.courses)`，**元素内部字段完全不校验**。
- 后果：用户用 PC 同步工具手写外部课表、把周次写成 `"1-16"`（字符串）时，字符串也有 `.includes()`，语义变成「子串包含」——`"1-16".includes(1)` 为 false，这门课静默不显示、`totalOf` 也不计；字段写漏时 `c.weeks` 是 `undefined` → `TypeError` → `renderWeek()` 整页中断，课表画到一半停住，只在控制台报错。
- 建议：`load()` 里对每门课做一次规整：
  ```js
  DATA.courses = (DATA.courses || []).filter(c => c && c.name)
    .map(c => Object.assign({}, c, {
      weeks: Array.isArray(c.weeks) ? c.weeks : [],
      periods: Array.isArray(c.periods) ? c.periods : [],
      teachers: Array.isArray(c.teachers) ? c.teachers : [],
    }));
  ```

---

### [中等] web/app.js:236 `openSheet` 里 `c.periods[0]` 未判空
- 现象：
  ```js
  const raw = DATA.courses
    .filter(c => clean(c.name) === b.name && b.ps.includes(c.periods[0]))   // 236
    .map(c => c.raw_weeks).filter(Boolean);
  ```
  同函数 `234` 行还有 `b.teachers.join('、')`，同样假设 `teachers` 是数组。
- 后果：只要有一门同名课程的 `periods` 缺失，`c.periods[0]` 就抛 `TypeError`，`openSheet` 在写完标题（`231`）之后、加 `.on` 类（`265`）之前中断——用户点课程块**毫无反应**，浮层根本打不开，控制台只有一条报错。`teachers` 非数组时同理。
- 建议：`Array.isArray(c.periods) && b.ps.includes(c.periods[0])`；`b.teachers` 用 `(b.teachers || []).join('、')`。

---

### [中等] web/about.js:527 查询一个在 DOM 里不存在的底栏按钮，整段「进关于页刷新诊断」是死代码
- 现象：
  ```js
  (function hookAboutTab() {                                              // 526
    const btn = document.querySelector('#tabs button[data-tab="about"]'); // 527
    if (btn) {                                                          // 528
      btn.addEventListener('click', () => { setTimeout(About.refresh, 0); });
    }
  })();
  ```
  `index.html` 的 `#tabs` 只有 5 个按钮，`data-tab` 分别是 `kb/learn/wiki/campus/me`（`index.html:750/758/767/775/784`），**没有 `about`**。
- 后果：`btn` 恒为 `null`，这段守卫静默跳过。功能上目前靠 `app.js:1493-1494` 的 `switchTab('about'); About.refresh();` 兜住了，所以看不出来；但代码上像是「已经处理过了」，下一个人排查「关于页的版本号/授权状态是旧的」时会先怀疑 `About.refresh` 本身。
- 建议：删掉这段死代码，把 `About.refresh()` 收敛进 `switchTab()` 的 `about` 分支（`app.js:1484` 附近已经对 campus 这么做了）。

---

### [中等] web/app.js:3139-3141 `endWaterAndSettle` 追加 `settle-box` 前不清空，重复进入会叠加
- 现象：
  ```js
  const box = document.getElementById('sh-body');   // 3139
  const rows = el('div', 'settle-box');             // 3140
  box.appendChild(rows);                            // 3141 —— 没先清空
  ```
  「机器还在出水」分支只复位按钮、保留浮层内容（`3161-3165`），用户可以立刻再点一次，于是又 append 一套。
- 后果：第二次进入时页面上出现两组「本次用量」，第二次成功建单后能看到两个不同的「订单号」（`app.js:3296-3308` 会 `appendChild(pay)`），用户可能对着上一个订单号去付款。
- 建议：进入时先清旧块：
  ```js
  box.querySelectorAll('.settle-box').forEach(n => n.remove());
  ```
  或者让 `put()` 写进一个函数级对象、只在末尾一次性渲染。

---

### [轻微] web/app.js:174 作息串里没有 `~` 时界面直接印出 `undefined`
- 现象：
  ```js
  const t1 = TIMES[b.start - 1], t2 = TIMES[endP - 1];      // 170
  if (t1 && t2) {                                          // 171
    box.appendChild(el('span', 'pr', t1.split('~')[0]));
    box.appendChild(el('span', 'pr2', t2.split('~')[1]));   // 174
  }
  ```
  `t1 && t2` 只保证数组里有这一项，不保证格式是 `H:MM~H:MM`。
- 后果：作息表某一项写成 `08:00-08:40` 或单点 `08:00`，课程块末尾就印一个 `undefined`。
- 建议：`const end = t2.indexOf('~') >= 0 ? t2.split('~')[1] : t2;`，兜底成整串。

---

### [轻微] web/app.js:1047-1049 每分钟无条件 `renderHomework()`，整个列表 DOM 全毁重建
- 现象：
  ```js
  setInterval(() => {
    if (document.getElementById('tab-learn').classList.contains('active')) renderHomework();
  }, 60000);
  ```
- 后果：`renderHomework` 里 `document.getElementById('hwlist').innerHTML = ''`（`511-512`）后把所有卡片重画，用户在作业列表里往下翻着看，每 60 秒被弹回顶部。另外 `#tab-learn` 若不存在会因 `.classList` 抛错（当前存在，属脆性），这个 interval 也从不 `clearInterval`。
- 建议：只更新倒计时文本节点——给倒计时 `span` 存 `data-due`，定时器里只改 `textContent`，不重建 DOM。

---

### [轻微] web/app.js:2621 / 2697 `$('admPanel').style.display` 无 null 保护
- 现象：
  ```js
  setMsg(msg, '已连接，名单 ' + (res.count || 0) + ' 人', true);
  $('admPanel').style.display = 'block';      // 2621
  ```
  `2697`（`init()` 里回填已存口令后展开面板）是同一句。
- 后果：`admPanel` 缺失时 `.then` 里抛错——口令其实验证成功了、pref 也写好了，但用户看不到「已连接」提示、面板也不出现，只能再点一次。当前 HTML 下不触发，属脆性。
- 建议：`const p = $('admPanel'); if (p) p.style.display = 'block';`

---

### [轻微] web/app.js:2567-2592 复制链路三层失败都不给反馈
- 现象：
  ```js
  function copyText(text, msg) {                                              // 2567
    try { if (Host.clip) { Host.clip(text); if (Host.toast) Host.toast(msg || '已复制'); return; } } catch (e) {}
    if (XXMU.toast) XXMU.toast(msg || '已复制');                               // 2571 —— 先报成功
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fb(text));             // 2574
        return;
      }
    } catch (e) {}
    fb(text);                                                                  // 2578
  }
  function fb(text) {                                                          // 2581
    try { ...; document.execCommand('copy'); ... } catch (e) {}                 // 2589-2591
  }
  ```
- 后果：`2571` 在真正尝试之前就 toast 了「已复制」；`document.execCommand('copy')` 在新版 WebView 里已不保证可用。三层全失败时用户以为复制好了去粘贴，粘出来是空的，**且不会有任何第二次提示**。
- 建议：`fb()` 返回 boolean（`execCommand` 的返回值本身就是 boolean）；`copyText` 把 toast 挪到真正成功之后，最终失败时 `XXMU.toast('复制失败，请长按选择文本')`。

---

### [轻微] web/index.html:328-329 管理员卡片文案还停在「生成激活码 / 按学号算码」
- 现象：
  ```html
  <div class="row click" id="rowAdmin">
    <span>生成激活码</span>
    <span class="v dim">按学号算码 ›</span>
  </div>
  ```
  而 `app.js:2689` 的 onclick 已经改成 `switchTab('admin')`（管理控制台），激活码机制整体移除（`license.js:210-211` 注释也写明「码已经不用了」）。
- 后果：管理员点进去看到的是名单/发版/审核控制台，与卡片文案完全对不上，会以为点错了或功能坏了。
- 建议：文案改成「管理控制台 / 名单 · 发版 · 审核 ›」。

---

### [轻微] web/about.js:295 授权过期后显示「有效 · 剩 0 天」而不是「已过期」
- 现象：
  ```js
  const exp = AUTH.expAt();
  const d = exp ? Math.max(0, Math.ceil((exp * 1000 - Date.now()) / 86400000)) : 0;   // 295
  net.textContent = exp ? ('有效 · 剩 ' + d + ' 天') : '有效';
  net.className = 'v ok';                                                             // 297
  ```
- 后果：`Math.max(0, ...)` 把「已过期」压成 0，紧接着又硬拼「有效」、还配绿色 `v ok`。用户看到「有效 · 剩 0 天」，无法判断是今天到期还是早就过期，而实际可能已经在离线宽限期之外。
- 建议：先判 `if (exp * 1000 < Date.now())` → 文案「已过期（X 天前）」并 `className = 'v warn'`。

---

### [轻微] web/chaoxing.js:569 `logout()` 清 Cookie 与作业缓存，但不清同步时间戳 `K_AT`
- 现象：
  ```js
  function logout() {
    try {
      if (hasHost() && Host.clearCookieFor) Host.clearCookieFor(HOST + '/');
      if (hasHost() && Host.setPref) Host.setPref(K_HW, '');   // 569
    } catch (e) {}
  }
  ```
  `K_AT` 在文件里只有定义与导出，没有任何一处清它。
- 后果：`K_AT` 只增不清，任何未来读取它的地方看到的都是上次已注销会话的同步时间。目前前端没有读取点，属于潜在脏状态——一旦以后加了「上次同步于」的展示，就会显示一次不存在的同步。
- 建议：`logout()` 里补 `Host.setPref(K_AT, '')`，或直接删掉这个键（当前无人读）。

---

### [轻微] web/app.js:4061 顶层 `document.getElementById('btnFree').onclick` 无 null 保护
- 现象：
  ```js
  document.getElementById('btnFree').onclick = () => openFreeSheet();   // 4061
  ```
- 后果：`btnFree` 当前存在于 `index.html:134`，不会炸；但这是 `app.js` 顶层最后一段裸解引用之一。一旦顶栏改版删掉这个按钮，`app.js` 顶层执行在这里中断，紧跟其后的 `About.init(); initLearnUI(); load(); ... Gate.init();`（`4063-4078`）全部不执行 → 白屏，控制台只有一条 `TypeError`。同类裸解引用还有 `251/253/1115/1119/1300/1304/1310/1334/1335/1336` 等。
- 建议：`const bf = document.getElementById('btnFree'); if (bf) bf.onclick = ...;`；顶层这一批统一收口到一个 `bind(id, fn)` 辅助函数。

---

### [轻微] web/app.js:1671 分段切换的 30s 节流与操作后的无条件刷新互相打架
- 现象：
  ```js
  if (key() && Date.now() - STATS_AT > 30000) { STATS_AT = Date.now(); refreshStats(); }   // 1671
  ```
  但停用/解封/清设备成功之后都是**无条件** `refreshStats();`（`1701`、`1734` 同款）。
- 后果：节流只挡住了「切分段」这一条路径，操作成功后照样整表重拉。管理员连续处理十几个人的「通过 / 下架」时会连发十几次 `AUTH.Admin.list()` 全量请求，`renderList()` 每次都 `box.innerHTML = ''`（`1823`）重建整张表，滚动位置随之丢失。
- 建议：把节流下沉到 `refreshStats()` 内部（`if (Date.now() - STATS_AT < 3000) return;`），操作成功后传 `refreshStats(true)` 强制刷新；`renderList` 保留 `scrollTop`。

---

### [轻微] web/app.js:3456 退出胖乖账号时不清 `RUNNING`，已开阀的机器仍显示「结算」
- 现象：
  ```js
  if (!confirm('退出胖乖生活账号？\n本机保存的饮水机列表会保留。')) return;
  WATER.logout();     // 3456
  refresh();          // 3457
  XXMU.toast('已退出');
  ```
  同文件的 `resetRunning()`（`2999`：`function resetRunning() { RUNNING = {}; }`）在切换结算方式时（`3466`）会调，退出分支却没调。
- 后果：退出登录后 `RUNNING` 里还留着「某台机器某个口已开阀」，`renderDevs()` 依旧把那个口的按钮画成「结算」（`3075/3087`）。用户点它 → `WATER.syncWater` 因为没 token 立刻失败 → 经 `probe()` 吞错（见中等那条）→ 提示「没查到待结算的用水」。一个已退出的账号还挂着结算入口。
- 建议：退出分支补 `resetRunning(); renderDevs();`。

---

## 我检查过但认为没问题的点

以下是特意查过、确认**当前代码是对的**，下一个人不用重复查：

1. **`errText()` / `hintInto()` 的注入**（`app.js:72-82`）——已经是 `textContent` / `appendChild(el(...))`。全文件 `innerHTML` 的 30 余处赋值，除 `''`（清空）外**全是静态字符串常量**（如 `'<p class="hint">读取中…</p>'`），没有一处拼接动态数据。
2. **全项目没有 `eval` / `new Function` / `document.write`**（grep 零命中）。
3. **`wiki.js` / `guide.js` 无动态 `innerHTML`**——条目渲染全走 `el(tag, cls, text)`，`text` 落到 `textContent`；用户提交的标题/正文、服务端返回的 `p.cap` / `f.reply` 都不会变成 HTML。
4. **`prompt()` 在 App 内是可用的**——`MainActivity.java` 的 `Chrome.onJsPrompt` 真弹 `AlertDialog` 并 `result.confirm(...)`，取消/异常分支都 `result.cancel()`，不会留下永久 pending 的 promise。`guide.js:276-279`、`app.js:2825`（图片说明）、`app.js:2909`（留言回复）这三处原生 `prompt` 都能正常工作。
5. **`res.rows` vs `res.list`**——`app.js:2734`（图片审核）、`app.js:2865`（留言）与 `wiki.js:433`（图片）、`wiki.js:584`（留言）都做了双字段兼容；`refreshStats`（`1801`：`LIST = res.rows || []`）直取 `rows` 是安全的，Worker 那个接口确实返回 `rows`。
6. **`chaoxing.js` 的 `pickStatus`**（`189-215`）——已是「精确标签 → 300 字兜底」两跳；`head` / `lab` 里的中文常量不含正则元字符，未转义是安全的。
7. **`PERIODS` 的 NaN 崩溃**——原来 `Math.max(14, ...flatMap(c => c.periods))` 遇脏值会变 `NaN`，`new Array(NaN + 3)` 抛 `RangeError` 整页白屏。现在已改成先 `parseInt` 过滤再取 `Math.max`，安全。
8. **`syncSchedule` 的按钮复位**——`1294-1296` 已挪到 `.finally`，`1272-1274` 把同步前置段包进 `try` 转成 resolved promise，Host 桥缺失也不会让按钮永久变灰（**但重入锁仍然缺，见中等第 6 条**）。
9. **`refreshStats` / `loadCfg` 的失败反馈**——`1790` 的 `statMsg` 会显示「统计拉取失败」；`2087-2092` 在拉不到配置时明确写「拉不到线上配置（…）」+「先别保存 —— 现在表单里可能是空的」。这两个原来最典型的静默失败已经修好。
10. **`APKDL.start` 的 `busy` / `noperm` 分支**——已补 `alert`，不再静默 return。
11. **`foldSec` 的折叠键**（`817-827`）——键是 `title.split(' · ')[0]`，「已完成 · 3」与「状态未读到 · 5」切成不同键，数量变化不影响；`FOLD` 跨重渲染保持展开态是有意设计。
12. **公告两端判据一致**——管理员侧 `app.js:2078-2085` 与学生侧 `noticePending()`（`3943-3951`）都要求「有正文 **且** `noticeAt > 0`」，未发正文时明确提示「有正文但无发布时间（不会被弹出）」。「两端判据不一致」在当前代码里不成立。
13. **JS 的 id 与 `index.html` 是否对得上**——脚本比对了 `app.js` 全部 `getElementById('...')` 与 `index.html` 全部 `id="..."`，唯一在 JS 里出现而 HTML 中不存在的是 `kbEmpty`，它由 `app.js:199` 动态创建，属正常。
14. **`app.css` 的 z-index 层级**——`#tabs:20 < #sheet:70 < #gate:100 < #upd:120 < #ntc:125 < #onb:130`，`#tut`（`785-790`）没设 z-index、靠 DOM 顺序叠层。层级本身有序，未发现「强制更新被其他层盖住」的确定性冲突。
15. **各模块 `init()` 的幂等**——`tut.js:259`、`onboard.js:97` 都有 `if (inited) return;`；`wiki.js` 靠 `PHOTO_TRIED` / `FB_TRIED` 也最多拉一次。`app.js` 底部只 init 一次（`4063-4078`），`__onUnlocked`（`4053-4058`）只做自动同步、不再重复 init——注释里说的「v1.1.6 init 双跑」已经修好。
16. **`tut.js` 的 `replay()`**——只置 `replayMode` 再复用 `show()`，不再另写一套翻页回调；`finish()` 在 `replayMode` 时正确短路并复位。「重看一次就永远不再 mark」那个坑已修。
17. **`water.js` 的 `FREE.compute` / `busyRooms`**（`647-664`）——用 `c.weeks.indexOf(week) < 0` 判周次、`ps.some(...)` 保证 `ps` 非空后才 `Math.min.apply`；`day` 为 `0/null` 时按「整周任意一天」处理，与注释一致，无 `Infinity` 泄漏。
18. **`chaoxing.js` 的排序**（`432-433`）——无截止排最后（`9e17`），空 `start` 兜底成 `'9999'`（`'9' > '2'` 故排最后），空值不会插到紧急项前面。
19. **`license.js` 的 `sha256` / `codeFor`**——`sha256` 用 `bytes.slice()` 的副本做填充，不改调用方数组；`codeFor` 的 `.match()` 理论上可能返回 `null`，但 `hmac` 恒输出 32 字节、`toBase32(mac, 16)` 恒 16 位，当前不会触发。
20. **`water.js` 没有 `URL.createObjectURL` 泄漏**——全文无 `createObjectURL`；`decodeQr` 用的是 base64 字符串，`tryDecode` 里创建的 canvas 可被 GC。
21. **`sync.js:271` 的 `if (!p) return`**——`__onHttpDone` 收到未知 key 时静默返回，这是超时后 `clearTimeout` 已删记录的必然结果（Java 回调晚到），刻意设计，不产生错误状态，只是缺一行日志。
22. **`app.js:2596` 的 `visible()`**——已改成只认 `AUTH.isAdmin()`（服务端签发 role），本地常量那条路彻底断了；`license.js` 的 `ADMIN_IDS` 也已清空。不是遗漏。
23. **`app.js:3403-3415` 的 `countdown()`**——`n <= 0` 时 `clearInterval(cdTimer); cdTimer = null;` 并恢复按钮，重复调用会先清上一个，逻辑闭环。WebView 回收时不清影响可忽略。
24. **`sync.js:380-390` 的 `chk` 构造**——`noteKbAccount` 抛错时被 `try/catch` 兜住、`chk` 保持 `{ok:true, unknown:true}`，不会因为这一句崩掉登录流程。
25. **`app.js:812-815` 的 `__onCxLoggedIn`**——本身不接收参数，`onboard.js` 包装时不传参是正确的，只有 `__onLoginSuccess` 那条传参链被切断（见严重第 1 条）。
