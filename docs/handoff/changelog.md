# 每一版改了什么

> 从 HANDOFF.md 第 8 节拆出来，内容原样保留（每版的踩坑细节都在这）。
> **现在在哪**看 [STATE.md](../../STATE.md)（一页，自动生成）；
> **架构与稳定的坑**看 [HANDOFF.md](../../HANDOFF.md)；**待办**看 [todo.md](todo.md)。
> 顺序是**新 -> 旧**（最新的在最上面），新版本请插到下面那条分隔线之后。

---

### v2.16.0（2026-11-24）—— 名单只认教务登录成功的真学号，手填号一个不记

**触发**：用户 m00218 原话「这里面的2022那个就是我之前说过的无效号码，这种应该不记录进去。应该只记录正确教务网登录成功的学号。而且新手教程是不是也要有所更新，第一次的免责声明应该也要更新。你做吧」。管理后台截图里 `202211` 这种 6 位手填号被记进名单、显示成「待补录·格式异常手填」，用户要求根治。

**一、后端只认教务真号（`server/worker.js` 三处）**：
- `handleActivate` 记账段：原来无条件 `idxApply(env,[{id:id,note:''}],dels)` —— 进门填个号就写进 idx，这是 `202211` 混进名单的根。改成只有 `isKbId(kb)`（`/^20\d{2}\d{7}$/`，11 位真号）合法才记账：先用 `renameFrom` 护栏（合法 6-20 位、≠kb、未被 `rev:` 停用）删掉手填残留行，再 `bindKbRow(env,id,kb)` 写真号。手填号不再写 idx。
- `bindKbRow(env,gateId,kb)` 整体重写为**真号主键**：`if(!isKbId(real)) return {changed:false}`；先找 `idx` 里 `id===real` 的行；找不到且 `from!==real` 时做兼容升级（`id===from && kbRealOf(e)===real` 命中就把 `idx[j].id=real`）；都没有才 `push({id:real,at,note:'',kb:real,kbAt})`。gateId 只用于升级兼容、不落盘，老手填行不会残留成主键。
- `handleList(env)` 重写筛选：删掉 `seen/tagged/kbClassOf` 三态，改用 `byReal` Map 按真号去重（`kbRealOf(e)` 合法才收，取最早 `at`），`rows` 的 `id` 直接是真号。`oddRows=[]`，`confirmedCount=rows.length`，`pendingCount/conflictCount/oddCount` 全 0，`hidden=idx.length-bound.length`（被挡下来的存量手填号数，仅用于提示，不回传明细）。手填/脏号彻底不出现在名单里。

**二、前端名单卡精简（`web/app.js` + `web/index.html`）**：
- 删 `renderOdd` / `openKbFix` / `renderKbSummary` / `switchListTab` 四函数、`looksOddId`、变量 `ODD/LIST_TAB/ONLY_CONFIRMED` 及二级菜单、三态计数、「只看已确认」勾选框的事件绑定。
- `renderList` 开头删掉把 `ODD` 里 pending 手填行 concat 进主表的逻辑（就是这一行把 `202211` 显示出来）；每行细行固定「教务网登录学号 · 已验证」，删「格式异常（手填）」标签；空表文案改「还没有人完成教务网登录；只有登录成功的学号才会进这个名单。」
- `index.html` 名单卡（:760-787）删 `#admListTab` / `#admKbSummary` / `#admNormalPane` / `#admOddPane` / `#admOnlyConfirmed`，保留 `#admListTip` 新文案「这里只列在教务网登录成功、学号已验证的人。进门时手填的号码不会记录。」
- `web/auth.js:447`、`web/sync.js:524` 的「格式异常（手填）」只是历史注释里描述旧号对齐逻辑，非渲染/记录路径，没动。

**三、新手教程 → 契约 v12（`web/tut.js` + `docs/handoff/tutorial-contract.json`）**：
- `TUT_CONTENT_VER` 11→12，契约 `version` 11→12（features 26 条不变，没有新增学生可见功能，只是口径更新）。
- 第①页「为什么做这个」、第⑦页「就这些，开始吧」since 1.1.42→2.16.0，各补一句「手填号不作数 / 教务登录成功才进名单」。照 v2.15.0 的教训：改了教程正文就必须把该页 since 和文件头版本一起顶上去，否则 `check_tutorial` 的「讲着新功能却标着旧版本」会红。`check_tutorial.js` 40 项全绿。

**四、首次声明更新（`web/index.html`）**：
- 摘要版 `#disc` 在「课表、作业…」段后插一条：进门填的号码只是试用，只有教务网登录成功、学号被学校页面验证过才计入名单，手填/乱填不记录。
- 完整版 `#discCard`：:1089 那条改为「填学号即可试用…不计入使用名单…只有教务登录成功才算正式用户」；「安全与反馈」卡服务器口径从「学号」改成「教务登录验证过的学号，进门手填的号码不会记进去」。声明排在最前，保证用户先看见。

**五、门禁与出包**：七道门禁照跑（见本版 notes）。签名证书不变，可覆盖升级。

**线上状态**：v2.15.0 已于 2026-11-22 上线（实测两入口 `/v1/config` 均回 latest=2.15.0/code 21500/size 1081846）。本版 v2.16.0 **未上线**，等用户明确说发版才切 `cfg.latest`。

---

### v2.15.0（2026-11-21）—— 四处「写了没人读」，接上了；顺手修一个真 BUG

**触发**：用户说「你可以组建ai团队呀」。组建了两个只读调研 teammate（focus/mytodo/reminder/learnplus/nowline 一组，sync/sources/chaoxing + Java 一组），
口径统一：只报「数据写了没人读 / 通道齐了没接线 / 用户会踩的真空」，每条给文件+行号+证据+最小落点，只读不改。
两组各交三条。我逐条去原文复核后，**做四条、排除两条**：

**一、重置按钮是真 BUG（`web/focus.js`）**：`const reset = $('focusReset'); if (reset) reset.onclick = reset;`
局部 `const reset` 把模块级 `function reset()`（375-382 行）遮住了，绑上去的回调是 DOM 元素自己 ——
点「重置」直接抛 TypeError，计时根本不复位。改成 `const resetBtn = ...; resetBtn.onclick = () => reset();`。
这是这组调研里唯一一个「用户点一下就坏」的真故障，其余三条都是「本来该显示没显示」。

**二、诊断里多了「自动刷新」（`web/about.js` 接线 `web/sources.js`）**：`sources.js` 从 v2.9.x 起就维护 `AUTO_LOG`
（:56，每次 autoSync push `{at,reason,ran,changed,results}`，上限 20 条），:465 的 `autoDiag()` 也早导出了，
但全库 grep 只有定义和导出两处、零调用；而 `about.js:275-311 diagText()`（就是设置页「复制诊断」按钮的总入口）
读了 LICENSE / AUTH / CX.cached / 作业来源，独独漏了它。结果用户报「作业好几天不更新」，复制出来的诊断
看不出最近到底刷没刷、跳过了谁。现在 diagText() 拼进 `SOURCES.autoDiag()` 最近 8 条：
`11/21 09:05 learn-tab · 刷了 2 个 · 有变化 · ykt:ok,zxs:stale` 这种格式，时间戳是本地时间 `M/D HH:mm`，
一条都没有就写「自动刷新：还没有记录」。不新加桥、不新加权限，只是把已经躺着的数据摆到用户眼前。

**三、专注卡多一句「最长一天」（`web/focus.js`）**：v2.4.0 做可视化时接了 `histo()`和 `streak()`，
`peakOf()`（180-188 行）写好就一直没人调用。现在 paintHisto() 的 hint 里补上
「最长一天 90 分钟 · 11月18日」，只在 `pk.min > 0`（真有记录）时才加。另加一个 `shortDate()` 纯函数
把 `YYYY-MM-DD` 压成 `M月D日`，带 `/* @testable:shortDate */` 切片供单测直接跑真源码。

**四、记录存坏了会明说（`web/focus.js`）**：`LAST_ERR` 在 35/44/55/67/71 行都被写过，但从没导出也没显示 ——
专注记录损坏时界面只显示「今日 0 分钟 · 本周 0 分钟」，看着像自己一天没学，其实是本机数据读不出来。
参照 `mytodo.js` 的 `readErr()` + 344-370 行提示，paint() 一进来就 `const stateErr = LAST_ERR;`（立刻取，
别被后面的 load 清掉），统计行加 `.warn` 转红，另起一个独立 `#focusErr` 行写「存着的专注记录读不出来（本机记录损坏）」。
长句不塞进窄的 statEl。双皮肤各配一套：classic `var(--danger)`，nova `--n-warn`。

**五、两个看着像缺口、查完不是的**：①`sources.js` 报的 `sync.js:379 bad_weeks` 落了缓存没人读 ——
其实 `web/app.js:2592-2594` 已经在同步提示里报「另有 N 条周次没读懂，没进课表」（读 `sch.showable`），
是等价实现，不重复做；②`sources.js:348 exam_upcoming: 0` 硬编码 —— 全库只有三处、没有任何渲染消费它，
用户现在踩不到，先不动（真要做得连 renderHomework 一起改，那是另一个题目）。
reminder / learnplus / nowline 三个模块两组都查过，接线是完整的，无新增缺口。

**六、教程契约为什么没动**：这四处全是内部修复与接线 —— 修一个 bug、诊断多几行、专注卡多一句高光日、错误提示。
没有新入口、没有新操作要用户学。硬加 features 反而会触发 `check_tutorial` 的「讲着新功能却标着旧版本」校验，
所以按工程判断跳过，契约仍停在 v11 / 26 条 features。

**七、两个自己写错的地方**：①`tools/test_gaps.js` 里时间戳断言一开始写成
`diag.indexOf('9/21'.replace('9/','11/')) >= 0 || /11\/21\s+09:05/.test(diag)`，绕且前半恒假 ——
改成单一正则判断就对了（35 项测试本身一次全过，错的是我这条断言的写法）。
②纪律断言照旧先 `strip()` 剥注释再判（**这个坑第 5 次踩**：注释里正解释某个词，断言把自己判红）。
另外含单引号的长 JS 一律落成 `.js` 文件再 `node` 跑，内联 `node -e` 会被 PowerShell 吞引号报 lexing error。

**八、门禁与出包**：`tools/test_gaps.js` 新建（35 项，纯函数切真源码进 vm 真跑、接线用源码纪律钉死），
`tools/test_*.js` 升到 **53 套**。`check_web.js` 加 v2.15.0 段（段内自建 `need15()` —— check_web 只有 `fail()`、
没有 `ok()`，照抄别处的 `ok()` 会 ReferenceError）、`check_apk_inside.py` 加 v2.15.0 段（读包内 assets/ 那份，
11 条全 True）。七道门禁全绿：`check_web` PASS / `check_notes` 7 项 / `check_tutorial` 40 项 /
`check_skin` 55 passed / `test_*.js` 53 套 0 失败 / `verify_apk` 五件套 / `check_apk_inside` 11 条。
`apk/xxmu-helper-v2.15.0.apk` **1081846 字节**（hash `c9eb17f35c20…`），签名证书不变，可覆盖升级。
实拍十张：`_shot_gaps.js` 出 focus / diag / focuserr 三组四皮肤，`_v215_gaps_overview.png` 766×1290；
图上确认高光日、自动刷新两段、记录损坏红字都真的显示出来（单测绿不等于视觉绿，照例看图）。

**未上线**：线上仍是 1.1.97 / 1197，等用户明确说发版才切 `cfg.latest`。

---

### v2.14.0（2026-11-21）—— 自己记的待办，到那天早上会提醒了

**触发**：v2.13.0 收尾时给 todo 第三节翻底，发现只剩「app.js 拆分」一条，而那条自己写着
「拆分本身不是目的」。换个方向找：把每个模块的 `readPref` 键与 `reminder.js` 的键对一遍，
发现 `xxmu_mytodo` 里从 v1.1.60 起就有 `due` 字段，而 `git grep -n "MYTODO" web/reminder.js`
零命中 —— 记了「周三前交实验报告」，到那天手机一声不吭。这和数据齐、通道齐、就是没接线
（v1.1.78 连堂重复、v2.1.0 出水看护）是同一类毛病，而且这一处最便宜：`MYTODO.list()` 现成、
`ReminderScheduler` 现成，缺的只是 `buildAll()` 里第三个来源。

**一、三条口径先定下来，再写代码**

1. **提醒落在早上 8 点，不是 00:00，也不是「提前量往前推的同一时刻」**。待办只写日期不写钟点，
   用户说「周三前交」的意思是周三那天还来得及，不是周三 00:00 已经到期。8 点是「还来得及改计划」
   的那个时刻 —— 凌晨震一下只能让人关掉提醒。
2. **一条待办算到那天 23:59**。`dueMs = day0 + 24*3600000 - 60000`，写到当天最后一分钟。
3. **文案只说「今天到期 / 明天到期 / N 天后到期」**，不写「还有 11 小时 32 分」。
   没有钟点的数据编到分钟是假精度 —— 这和 v1.1.60 饮水机「不换算毫升」是同一条纪律：
   **不把不知道的东西算成一个看起来很准的数**。

**二、`web/reminder.js`（621 → 810 行）**

- 新增三个持久化键：`KEY_TODO = 'xxmu_remind_todo'`、`KEY_TODO_LEAD = 'xxmu_remind_todo_lead'`、
  `TODO_LEADS = [0, 1, 2]`（提前 0/1/2 天）。**为什么又要一把开关**：课程、作业、自己记的待办
  是三件不同性质的事，有人只想被课提醒、不想被自己写的购物清单追着响。
- `todoOn()` 默认 `''`（关）、`todoLead()` 默认 1 天，都与另外两把开关同构
  （`pref(k, '') === '1'`），脏值回落而不是抛。
- 新增 `buildTodo()`（约 50 行）：守卫 `typeof MYTODO === 'undefined'`（reminder.js 在
  mytodo.js 之前加载的路径也要活），`arr = MYTODO.list()`，逐条
  ①`x.done` 跳过 ②`/^(\d{4})-(\d{2})-(\d{2})$/` 不匹配跳过（`2026/11/25`、`下周三` 一律不认，
  宁可不提醒也不猜）③`dueMs + GRACE <= now` 跳过（已过截止）④`at = day0 + 8h - lead*86400000`，
  `at <= now` 时同样按 GRACE 补一次「现在」而不是丢弃 —— 允许「今天就是那天」立刻补一条。
- `buildAll()` 从两路变三路：`on()?build():[]` + `hwOn()?buildHw():[]` + `todoOn()?buildTodo():[]`，
  统一按 `at` 排序后交给 `ReminderScheduler.schedule()`（那条路早就 `slice(0,200)` 封顶）。
- `apply()` 的 toast 改成分量式：只用真正开着的来源拼「（课程 N · 作业 N · 待办 N）」，
  不开的来源不出现（旧写法 `on() && hwOn()` 在两把开关都关时会拼出空括号）。
- `openSettings()` 在作业那一块之后加第三块：开关 `#rmTodoSw`、提前量 `#rmTodoLead`
  （0 =「当天早上」，其余「N 天」）、`#rmTodoHint`、按钮 `#rmTodoPreview`「试一下待办提醒」。
  局部 `paintTodoRows()` 与作业那块同构：关着时 `opacity .45` + `select.disabled`，
  hint 里的件数**按与 `buildTodo()` 完全相同的四条过滤算**，所以图上的数字与真会响的条数一致。
- `paint()` 补 `#remindTodoStat` 三态：`未开启` / `提前 N 天 · 早上 8 点`（或 `当天早上 8 点`）/ `待授权通知`。
- `init()` 的权限预请求加 `|| todoOn()`；导出表补 `buildTodo/todoOn/todoLead/TODO_LEADS` 四个名字
  （不给外部看的能力也要给测试看）。

**三、`web/index.html`**：`#remindCard` 在 `#remindHwRow` 之后加第三行
`#remindTodoRow`「待办到期」+ `#remindTodoStat`，带一段 v2.14.0 注释说明为什么这一行迟到了十四个版本。

**四、Java 侧（`ReminderReceiver.java` 213 → 258 行、`MainActivity.java`）**

- 新增 `KIND_TODO = "todo"`。**`normKind()` 必须认它** —— 不认就回落成 `KIND_CLASS`，
  一条待办提醒会显示成「15 分钟后上课」，这是最难查的那种错（文案对了、语义全错）。
- `show()` 的文案分叉从三类变四类，待办走独立的 `todoLeftText(due, leftMin)`：
  `due <= 0` → 按 `leftMin` 说「约 N 后到期」；已过 → 「已经到期了」；
  否则两个 `Calendar` 各自归零到当天 0 点，`Math.round((due0 - today0) / 86400000.0)`
  → `<=0`「今天到期」/`1`「明天到期」/否则「N 天后到期」。
  **不能写 `(due - now) / 86400000`**：晚上 23:00 时明天 8 点只差 9 小时，整除得 0，会说成「今天到期」。
  这个错在测试里专门有一条（`nowMs` 钉在 21:00 前后）。
- 通知渠道名改成「作业与待办提醒」/「作业与待办提醒（静默）」，描述补「待办到期」。
  点进去仍落学习页（`xxmu_tab=learn`），待办列表就在学习页。
- `MainActivity.previewTaskReminder()` 加待办分支：预览必须**真给一个明天 23:59 的 due**，
  否则走 `due=0` 兜底会试出「约 12 小时后到期」，与真机文案不一致 —— 试出来不一样的预览等于没试。

**五、测试：`tools/test_todoremind.js` 47 项**
八组：基本换算 / 提前量三档 / 四条不该提醒 + 「今天就是那天」立刻补 / 时刻边界（7:59 / 8:00 / 23:58 / 次日 00:00）
/ mins 与排序 / 输入容错 / 源码纪律 16 条 / Java 侧 6 条。做法照 `test_hwremind.js` 的
`cut()` 花括号配平 + `vm.createContext`，`FakeDate` 必须 `constructor(...a){ if(!a.length) super(nowMs); else super(...a); }`
—— 无参也返回假 now 会把 `new Date(y,m,d)` 三参吞掉，`day0` 恒等于假 now，八条断言会一起假绿。

**六、门禁与两个自己的错**

- `check_web.js` 加 v2.14.0 段（3077 → 3141 行）。**第一版用了 `ok(cond,label)`，而 check_web 里没有
  `ok()`，它是 `fail(msg)`** —— 直接 `ReferenceError: ok is not defined`。段内改用局部 `need14()`。
  这已经是「同一个 harness 里两套断言名」第二次咬人，新段一律先看本文件用的是什么。
- `check_apk_inside.py` 加 v2.14.0 条：`dex has KIND_TODO` 原写成「`b"todo"` 与 `b"xxmu_remind_todo"` 都在」
  → False。**`xxmu_remind_todo` 是 localStorage 键，只存在于 JS 字符串里，dex 里当然没有**；
  改成只查 `b"todo"`。写 dex 断言时要想清楚「这个字符串是谁写进包的」。
- 教程契约：`TUT_CONTENT_VER` 10 → 11、contract `version` 10 → 11、features 25 → 26、mustMention 10 → 11。
  `check_tutorial.js` 第一次红了一条，正是它设计来抓的：「学习：作业、待办和专注」标 2.4.0，
  但它现在讲到 `todoremind`（since 2.14.0）→ 把该页 `since` 改成 2.14.0 后 40 项全过。
- **实拍抓到的排版问题**：`#rmTodoHint` / `#rmHwHint` 都是两行长句，而 `.hint` 默认 `text-align:center`，
  居中折行读起来像诗（v2.13.0 在日历面板上已经踩过一次）。两条都改成 `hint left`。
  作业那条是 v2.2.0 留下的，一直到这次拍图才看出来。

**七、出包**
`apk/xxmu-helper-v2.14.0.apk` **1081846 字节**，签名证书 SHA-256
`0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，可覆盖升级。
`javac (14 个源文件)`、`d8 (130 个 class)`。**未上线**：`cfg.latest` 一个字没动，线上仍 1.1.97 / 1197。

**八、真机待看（七条）**
①把一条待办的日子设成明天，早上 8 点会不会响（想马上验就点「试一下待办提醒」）
②文案是「明天到期」不是「约 12 小时后到期」③设成今天、当前已过 8 点 → 是不是几十秒内补一条
④已完成 / 没写日子 / 日子已过 三种都不响 ⑤提醒卡第三行读数与设置面板里的开关同步
⑥关掉作业提醒只留待办，`apply()` 是否照常排（`parts` 那条改动）⑦试用按钮给的 due 是明天 23:59。

### v2.13.0（2026-11-21）—— 课表可以导进手机日历了（.ics）

**为什么做这个**：todo 第三节只剩「app.js 拆分」一条，而它自己写着「拆分本身不是目的」。
翻全库找真空时发现：`grep -i "BEGIN:VCALENDAR|iCalendar" web/` 零命中 —— 这个 App 有课表、
有作业截止、有上课提醒，却**从来没有办法把课表带出去**。学生真会做的事（导进手机自带日历、
导进 Outlook、发给同学）一样都做不了。这是纯本地、不需要任何外部条件的缺口，够一版。

**一、先确认数据够不够**
- 课表：`web/app.js` 的 `DATA.courses` 每门课都有 `name/teacher/room/day/weeks/periods`，
  作息表 `TIMES` 是 16 条 `"08:00~08:40"` 字符串，开学日 `START` 是 `Date`。
  三样都在内存里，`nowline.js` 已经在用，导日历不需要任何新数据。
- 截止：`web/chaoxing.js` 同步成功后把整个 payload 写进 `xxmu_cx_homework`（SharedPreferences），
  work 有 `end_ts`（秒），exam **只有 `end` 字符串**（这是个坑，见下）。
- 写文件：v2.5.0 已经有 `Host.exportText(name, content)` + `MediaStore.Downloads`，
  API 29+ 免存储权限。**一行新桥都不用加。**

**二、新增 `web/ics.js`（473 行）**
三条硬规矩写在文件头，每条都是「不这么写就会生成一份垃圾日历」：

1. **只用浮动时间**（`DTSTART:20260907T080000`，不带 `Z` 也不带 `TZID`）。
   写 `TZID=Asia/Shanghai` 要求导入端认识这个时区名，某些日历（尤其国内 ROM 自带的）
   会拒绝整个文件；改写成 UTC 则要自己换算，算错就是整体挪 8 小时 —— 而浮动时间
   在「手机和课表在同一时区」这个真实前提下永远是对的。
2. **读不出来的就不生成，绝不拿 00:00 顶上**。某一节作息串解析不出、或这门课
   `weeks` 是空的，就跳过并 `skipped++`，面板上明写「有 N 条读不出时间，没有放进日历」。
   拿零点顶上去的后果是：半夜三点手机震一下提醒你「去上人体解剖学」。
3. **多周合并成「连续周段 + `RRULE:WEEKLY`」**。75 门课 × 平均 10 周 = 上千个 VEVENT，
   导进去日历会卡；`runsOf()` 把 `[3,4,5,9,10]` 压成两段 `{3,5}` `{9,10}`，
   每段一条带 `COUNT=N` 的周重复事件。8 门课 6 周 = 8 条日程，不是 48 条。

纯函数（都可单测）：`pad2` / `fmtLocal` / `fmtDay` / `parseDay`（只认 `YYYY-M-D`，
坏串返回 **null 而不是今天**）/ `parseStamp`（认 `YYYY-M-D[ HH:MM]`）/ `hm` /
`segRange`（分隔符 `~ - ～ – —` 五种）/ `periodRange`（取第一节开始 + 最后一节结束）/
`runsOf` / `dayOf` / `esc`（转义 `\ ; ,` 与换行）/ `fold`（**按 UTF-8 字节数**折行：
按字符数折会让中文行超 75 字节，某些日历直接解析失败）。

`readDue()` 三条过滤：`CX.classify(status)==='done'` 跳过、`expired===true` 跳过、
时间读不出跳过。时间优先 `end_ts`，其次 `parseStamp(x.end)` —— **exam 没有 `end_ts`**，
只走第二条，这就是前面说的坑。

`courseEvent()` 里 `UID` 用 `{时间戳}-{课名}-{周几}-{起始周}@xxmu`：同一门课不同周段
必须是不同的 UID（否则导入端会当成同一条覆盖掉）；`DTSTAMP` 每次导出都变，那是规范要求。

`dueEvent()` 给截止点加 `BEGIN:VALARM` / `TRIGGER:-PT60M` —— 提前 1 小时。这是「截止点」
不是「开始点」，面板文案里特意写了这句。

**三、接线（三处）**
- `web/index.html`：`export.js` 之后加 `<script src="ics.js"></script>`；设置页
  `#rowExport` 下面加 `#rowCalendar`「导出到手机日历」—— 三个动作（检查更新 / 备份与导出 /
  导出到日历）都是「把数据搬进搬出」，排在一起。
- `android/.../MainActivity.java` 的 `mimeOf()` 加 `.ics → text/calendar`。不加这一行的话
  文件类型是 `application/octet-stream`，点开问「用什么打开」而不是直接进日历。
- 教程契约双写：`TUT_CONTENT_VER` 9 → 10、`TUT_FEATURES` 加 `calendar`（25 条）、
  设置页 `since` 2.5.0 → 2.13.0、`covers` 加 `calendar`；`tutorial-contract.json`
  `version` 9 → 10、features 加一条。

**四、`tools/test_ics.js`（98 项）**
直接 `require('../web/ics.js')`，不切字符串、不进 vm —— 这个模块没有 DOM 依赖，
整份都能 require，切碎反而测不到拼接逻辑。九组：时间工具 25 / 周次压缩 6 / 日期格式 9 /
转义与折行 5（含「每个物理行 ≤75 字节」逐行 `Buffer.byteLength`）/ 课程事件 9 /
截止事件 5 / 整份文件 12（含 75 门课 < 512KB）/ 导出表齐全 1 / 源码纪律 7。

**两条我自己算错的断言**：`periodRange([1,2], TIMES)` 我写成 10:00，实际是 `08:00~09:20`
—— `TIMES[1]` 是 `'08:40~09:20'`，第 2 节下课就是 09:20，是我把「第 2 节」当成「第 3 节开始」了。
另一条把 `dueEvent()` 的返回值（行数组）传给了 `build(hw:[...])`，`build` 要的是 item 对象 ——
fail 从 5 条降到 0 条。

**五、门禁里两条我又写错的断言**
1. `check_web.js` 里验折行写成 `icsCode.indexOf('75') < 0`，实际代码是
   `if (bytes + w > 74)` —— **续行前导空格占 1 字节，所以切 74 不是 75**，字面 `75`
   只出现在注释里。改成正则 `bytes\s*\+\s*w\s*>\s*74`。
2. 验入口写成查 `'#rowCalendar'`，但 `ics.js` 里只有 `getElementById('rowCalendar')`
   （不带 `#`）。改成查 `'rowCalendar'`。

**六、实拍**
新建 `design/sketch/_shot_calendar.js`（走真入口 `ICS.openPanel()`，不是点 `#rowCalendar`
—— 只证明点击能用会盖住面板本身的问题）。四档 390×397/434 + 拼图
`_v213_calendar_overview.png`（510×1722）。

实拍抓到一个排版问题：面板末尾那两段说明原来用 `.hint.tight`（继承 `.hint` 的
`text-align:center`），长句居中折行读起来像诗句。改成 `.hint.left.tight` 左对齐就好 ——
这个和 v2.5.0 发现 `.row` 的右对齐问题同源：**面板里的长句一律左对齐**。

**七、出包与门禁**
`apk/xxmu-helper-v2.13.0.apk` 1077750 字节，`javac 14 个源文件`、`d8 130 个 class`。
七道门禁全绿：`check_web` / `check_notes` / `check_tutorial` 39 项 / `check_skin` 55 /
`tools/test_*.js` **51 套 fail=0** / `verify_apk` 五件套 / `check_apk_inside` 全 True。
**未上线**，线上仍是 1.1.97 / 1197。

**八、真机待看（也写进了 todo.md）**
1. 点「导出为文件」后，文件真落到「下载 / 河医大助手」了吗；点一下能不能直接进日历。
2. 导进手机日历后，周重复对不对（一门课上 6 周应该是 6 次，不是 1 次也不是 42 次）。
3. 时区：手机在 `Asia/Shanghai` 时，日历里显示 08:00 就是 08:00（浮动时间，不换算）。
4. 截止那条的「提前 1 小时」提醒是否按预期响；它响的是截止点前 1 小时。
5. 读不出时间的那几条，面板上有没有写「有 N 条读不出时间，没有放进日历」。
6. 没设开学日时，面板是否直接叫回设置里填，而不是导出一份没有课的文件。
7. 导完 App 里的课表有没有被改动（应该一个字都不动，导出是只读的）。

### v2.12.0（2026-11-21）—— 桌面小组件摆上「最近要交」：作业考试截止上桌，且不再无条件说「今天没课，去玩吧」（**本地包 2.12.0 / 21200**）

触发：v2.11.0 改完 `ClassWidget` 之后把整个文件又读了一遍，发现文件头还留着一句 v1.1.55 时代的话 —— 「仍然不做的：作业考试不上组件（那是学习页的事）」。这句话在 `apk/v2.11.0.notes.txt` 第五条里甚至被当成承诺写给用户看了。但事实是：组件本来就有四个 `WidgetRow`，两节课的日子空两行、没课的日子整片空着。空着不显示不是克制，是浪费。

#### 一、先确认数据够不够

- **作业数据早就同步到本机了，只是没上桌**。`web/chaoxing.js:43` 有 `const K_HW = 'xxmu_cx_homework'`，`:507` 同步成功后 `if (Host.setPref) Host.setPref(K_HW, JSON.stringify(data))` —— 整份 JSON 落在 SharedPreferences 的 `xxmu_cx_homework` 键里。（注意不是 `homework_cache.json`：`Host.saveCachedHomework` 那条路在 `web/` 里一个调用点都没有。）
- `finish(works, exams, meta)` 已经给每条补齐了 `end_ts`（秒级截止时间）、`state`、`status_known`、`expired`、`open`；考试另有 `upcoming`、`starts_in_h`。Java 侧要的就是 `end_ts`、`name`、`status`、`upcoming` 这几样，齐了。
- 状态口径在 `CX.classify(status)`：先 `DONE_WORDS`（已完成/已提交/已交/待批阅/未批阅/已批阅/已互评/已过期/已结束/已截止）→ `done`；再 `NOTSTART_WORDS`（未开始/未开考）→ `notstart`；再 `OPEN_WORDS`（待做/待完成/未交/未提交/重新编辑/待互评/进行中）→ `open`。**顺序不能反**：「待批阅」是我的活干完了等老师，属完成；「待互评」里虽然有个「待」，但也是我的活，属未完成。这两条是最容易搞反的一对。
- 文案口径在 `web/app.js` 的 `fmtLeft(h)`：`<1 小时` → 「还剩 N 分钟」（`Math.max(1, ...)`，绝不写 0）；`<48 小时` → 「还剩 H 小时 M 分」（整点不写 0 分）；否则「还剩 N 天」。

#### 二、新增 `android/src/com/xxmu/helper/WidgetDue.java`（245 行）

第三次用同一套路：**纯算术与纯字符串抽出来，不 import `android.*` / `org.json.*`**，于是 `javac` + `java` 就能真跑单测，不用为测一句话去开模拟器。前两次是 `WidgetClock`（v2.10.0）和 `WidgetOps`（v2.11.0）。

- `public static final class Item { int kind; String name, course, status; long dueTs; boolean upcoming; }` —— `dueTs` 是**截止时刻的秒**，读不到就是 0。
- `stateOf(status)`：先 `squash()`（去掉 `&nbsp;`、` `、半角与全角空白），再按 DONE → NOTSTART → OPEN 三段匹配，都不是就 `UNKNOWN`。
- `durText(ts, nowSec)` / `leftText(dueTs, nowSec)`：后者管「已过期」与「还剩」前缀，前者只管时长本体 —— 因为副标题里的「3 件要交」不需要「还剩」。
- `colorOf(dueTs, nowSec)`：24 小时内 `0xFFFF8A80`（红，和 App 里 `HW_INK.bad` 同一个语义）、72 小时内 `0xFFE8A34E`（琥珀）、其余 `0xFFEFE9FF`（和 `WidgetClock.colorOf(TODO)` 一致，保证同一张卡上字色统一）。三档对深舱底都过 4.5:1。
- `markOf(kind, upcoming)`：作业 `⏰`、考试 `✎`、未开考的考试 `⏳`（免得让人以为现在就能做）。
- `line(it, nowSec)`：`mark + name`，有剩余时间就接 ` · 还剩 …`；空名字兜底「未命名作业」。
- `pick(all, nowSec, max)` / `count(all, nowSec)`：**三条过滤** —— 状态是完成的不留、截止已过的不留、读不到时间的不留（`dueTs <= 0` 直接丢）。按 `dueTs` 升序，同刻按名字稳定排序。`pick` 返回副本，改返回值不影响入参。
- 三条硬规矩写进文件头：①读不到截止时间的一条都不上桌（桌面上挂个永远不动的「还剩 --」比不显示更糟）②已过截止的不上桌 ③词表与顺序必须与 `CX.classify()` 逐字对齐。

#### 三、`ClassWidget.java`（347 → 430 行）

- 文件头的「作业考试不上组件」那句整体替换成 v2.12.0 的说明段，讲清做了什么、以及**抢位置规则**：课程行在前，待办填后面空位；课占满四行就一条待办都不显示。理由写进注释了 —— 课是「此刻要去哪」，作业是「之后要做什么」，抢位置时课赢；今天没课时四行全给待办，这是收益最大的一格。
- `rows.isEmpty()` 分支不再张口就说「今天没课，去玩吧」：先 `WidgetDue.count(due0, now0)`，件数 > 0 就写 `"今天没课 · " + n + " 件要交"` 并把四行全给 `WidgetDue.pick(...)`。**这是一句假话的修复** —— 手里压着三份报告的人，看到「去玩吧」只会觉得这 App 不懂他。
- 有课分支的四行填充循环：`i >= rows.size()` 时取第 `i - rows.size()` 条待办填进去，越界则清空该行。课程行照旧 `WidgetClock.markOf(state) + "1节 " + name + "  @" + room`。
- 新增 `private List<WidgetDue.Item> readDue(SharedPreferences p)`：读 `xxmu_cx_homework`，`length() < 20` 早退空表；解析 `works[]` 与 `exams[]`，`catch (Throwable)` 一律吞成空表。注释写明：**空列表的意思是「桌面上不显示待办」，不是「没有作业」** —— 宁可让用户进 App 看，也不要在桌面上写「没有要交的」。
- 曾试过在 `widget_today.xml` 里加一个独立的 `wdue` TextView，写完之后撤回了：多一个固定行会挤掉课程行，而四个 `row` 本来在不同日子就有不同数量的空位，动态填充更省空间。布局文件最终一个字没改。

#### 四、`MainActivity.java`：`xxmu_cx_homework` 也要触发重画

v2.11.0 已经给 `xxmu_kb_ops` / `xxmu_start` / `xxmu_weeks` 三个键加了 `ClassWidget.refresh()`。这一版补第四个：

```java
if ("xxmu_cx_homework".equals(key)) {
    try { ClassWidget.refresh(MainActivity.this); } catch (Throwable ignored) { }
}
```

理由是同一条：用户刚在 App 里点完「重新抓一次」，桌面那条截止时间不该还停在旧值上，也不该等到下一次 30 分钟轮询。其余几千个 pref 键（皮肤、主题、各种游标）仍然不触发，避免无谓重绘。

#### 五、测试：`tools/test_widgetdue.js`，74 项

做法与前两个 Java 测试完全一样：`fs.mkdtempSync` 建临时目录 → 复制 `WidgetDue.java` → 写一个 `WidgetDueTestMain` → `javac` → `java` → `finally` 删目录。

- 源码纪律 14 项：不 import `android.*` / `org.json.*`、不碰 `RemoteViews` / `Context`、三组词表都在、`ClassWidget` 四处调用 `WidgetDue.*` 都在、`setPref` 里有 `xxmu_cx_homework` 的 refresh 触发。
- Java 侧 60 项：状态 15（含「待批阅→DONE」「待互评→OPEN」「待&nbsp;做 也认」）、时长 11（含「剩 30 秒写 1 分钟不写 0」「整点不写 0 分」「48 小时→2 天」）、剩余文案 4、配色分档 5、记号 3、整行 5、挑拣 16（排序、max 边界、null 入参、`nowSec=0` 不猜时间、**返回值是副本**）、数件数 3、**一致性 1（20 个状态词「该上桌」与 `stateOf` 必须自洽）**。
- **两个我自己踩的坑**：①第一版把 `durText(NOW+0, NOW)` 断言成空串，实际返回「1 分钟」—— 回头看 `fmtLeft`，`h < 1` 时是 `Math.max(1, Math.round(h*60))`，到点那一刻就该说「1 分钟」，是我的断言错了，不是产品错了。②`int bad` 变量与工作区其它 `bad` 名字撞了，`bad.append(...)` 编不过，改名 `wrong`。
- **还有一个环境坑**：Windows 控制台默认 GBK，Java 打印的中文被 node 按 UTF-8 读成 `ʱ��������` —— 失败原因完全看不懂。在 `main` 第一行显式钉住 `System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.out), true, "UTF-8"))` 之后才读得懂。**下次写 Java 测试直接带上这一行。**

#### 六、门禁与出包

- `check_web.js` 新增 v2.12.0 段（五组断言：纯 Java / 词表与顺序 / 两条过滤 / 组件四处调用 / pref 触发），其中「`待批阅` 必须在 DONE_WORDS、`待互评` 不许在 DONE_WORDS」是**剥掉注释后**再判的 —— 这个坑前后踩过五次（`RemoteViews` / `#d93025` / `nv-clip-tag 8px` / `toISOString` / `START_DEFAULT`），每次都是注释里正解释该坑、字面出现了那个词。
- `check_apk_inside.py` 新增 v2.12.0 段，查的是 **dex 不是源码**：`WidgetDue` / `WidgetDue$Item` / 四个状态词（待批阅、待互评、未开考、已过期）/ 三个记号（⏰ ⏳ ✎）/ `xxmu_cx_homework` / 文案锚点「今天没课 · 」。出包后十二项全 True。
- 七道门禁：`check_web` PASS、`check_notes` 7 项、`check_tutorial` 39 项、`check_skin` 55 passed、`tools/test_*.js` **50 套**（49 → 50）、`verify_apk` 五件套 PASS、`check_apk_inside` 全 True。
- 出包：`javac 13 个源文件`、**`d8 130 个 class`**（v2.11.0 是 127，多的就是 `WidgetDue` + `WidgetDue$Item`）、`android/build/app-signed.apk (1044.4 KB)` → `apk/xxmu-helper-v2.12.0.apk` **1069499 字节**、`STATE.md` 9604 字节。签名 `0e684845…7799` 不变，可覆盖升级。**未上线**，`cfg.latest` 一个字没动，线上仍是 1.1.97 / 1197。

#### 七、真机待看

1. 桌面长按加组件，能不能加得出来（`targetCellWidth=3 / targetCellHeight=2`）。
2. **今天有课的日子**：待办是否接在课程行下面（两节课 → 两条待办；三节课 → 一条）。
3. **今天没课的日子**：副标题是否变成「今天没课 · N 件要交」，四行是否都是待办。
4. 四节课满的日子：待办一条都不显示 —— 这是有意的，不是漏了。
5. 记号：作业 ⏰、考试 ✎、未开考考试 ⏳，三种要能一眼分开。
6. 颜色：24 小时内红、72 小时内琥珀、更远正常；AMOLED 上红的会不会太扎眼。
7. 读不到截止时间的那条**不应出现**（不是显示「还剩 --」）。
8. 在 App 里点「重新抓一次」，退回桌面那条是否**立刻**变（不用等 30 分钟）。
9. 学习通一直没同步过的手机：桌面应只有课表，不该出现「没有要交的」这种话。

### v2.11.0（2026-11-21）—— 桌面小组件认「改课表指令」了：加课/停课/调课/放假四种变换全部对齐 App（**本地包 2.11.0 / 21100，未上线；线上实读仍 1.1.97 / 1197**）

触发：v2.10.0 把小组件的时间与状态算对之后，重读 `ClassWidget` 的注释，发现里面留着一句不太好意思的话 —— 「叠加 AI 改课表指令时只认「加课」；停/调/假需要完整 JSON 变换，组件上不重算（宁可少显示，也不显示错的）」。当时是按「保守」写的，但用户看见的不是「少显示」：他在 App 里停了星期四的生理学，打开桌面卡片，那节课还在 —— 那是**显示一份已经不存在的课表**。这比少显示一行更糟。

#### 一、先确认缺口是真的

- `web/lesson-cmd.js` 的 `apply(courses, ops, c0)`（274 行起）支持四种 `op.type`：`add`（277）、`stop`（282，`out.filter(c => !match(c, op))`）、`move`（283，命中后 `Object.assign(c,{day:op.to.day, weeks:[...op.to.weeks], periods:[...op.to.periods], room:op.to.room||c.room})`）、`holiday`（290，剔掉 `op.weeks` 再 `filter(c => c.weeks.length)`）。指令存 `xxmu_kb_ops`（17 行）。
- `web/app.js:2061 load()` 只在**内存里**叠加：`DATA = Object.assign({}, DATA, {courses: LessonCmd.apply(...)})`，注释明写「绝不写回缓存 / 外部 schedule.json」。`web/app.js:2574` 的 `saveCachedSchedule` 存的是**教务原始课表**。
- `android/.../ClassWidget.java` 老代码（139-168 行）读 `p.getString("xxmu_kb_ops","")`，然后只认 `"add".equals(op.optString("type"))`。
- 三条合起来就是结论：**App 里改了，桌面卡片不改。**

#### 二、新增 `android/src/com/xxmu/helper/WidgetOps.java`（约 250 行）

把 `apply()` 的四种变换搬到 Java 侧。**不 import `android.*` / `org.json.*` / 不碰 `RemoteViews` / `Context`** —— 原因同 `WidgetClock`：这一块全是分支与数组运算，抽成纯类就能用 `javac` + `java` 直接跑真单测（`android.jar` 里的 `org.json` 是 Stub，一旦 import 就没法在桌面上跑）。

- `public static final class Course { String name, room; int day; int[] weeks, periods; boolean cmd; Course copy(); }`
- `public static Course make(String, String, int, int[], int[])`
- `public static int[] ints(String csv)`：认 `1,2,3` / `3-5` / `3~5` / `3～5` / `3–5` / `3—5` / 混合 `1, 3-4`；`0` 不算有效节次；全坏 → 空数组（**不是 0**，0 会误伤 `has()`）
- `public static boolean has(int[], int)` / `intersect(int[], int[])`
- `public static boolean match(Course, String name, int day, int[] weeks, int[] periods)`：课名 clean 后必须相等；`day > 0` 才比日子；`weeks` / `periods` 非空才比交集 —— 与 JS 的 `match(c, q)` 逐条对齐
- `private static String clean(String)`：手写把全角空格 `\u3000` 与连续空白压成单空格 + 去尾空格（不用 regex，避免 Android 上跑正则的开销）
- `public static List<Course> apply(List<Course>, List<List<String>> ops)`：先 `copy()` 全部入参（**纯函数：不改入参，产物也不是入参本身**）；`add` → `make(...)` + `cmd = true` 追加；`stop` → 留 `!match(...)`；`move` → 命中后 `tDay>0` 改日子、`tWk.length>0` 换周次、`tPs.length>0` 换节次、`tRoom.length()>0` 换教室（**没给就保留原值**）；`holiday` → 剔掉命中的周次，剔空了整条丢弃；认不出的 type 一律跳过（一条坏指令不许把整张课表清空）
- `public static String typeName(String)` → 「加课/停课/调课/放假/未知(x)」。这四个中文串会进 dex，正好当 `check_apk_inside.py` 的可查锚点。
- 指令用**扁平 key/value 的 `List<String>`**（`type` / `name` / `day` / `weeks` / `periods` / `room` / `from.*` / `to.*`），不是 Map：调用方从 org.json 拼、测试手写断言，扁平形状两边都能拼，也避免为它再造一个嵌套结构。

#### 三、`ClassWidget.java` 接入（288 → 348 行）

- 删掉老分支，改成「先 `WidgetOps.apply` 再按今天+本周筛」：

```java
all = WidgetOps.apply(all, readOps(p.getString("xxmu_kb_ops", "")));
for (...) { if (c.day != day) continue; if (!WidgetOps.has(c.weeks, week)) continue; rows.add(...); }
```

  **顺序不能反**，注释写进了代码：先叠加再筛；反过来先筛再叠加，调课调到今天的课会看不见、放假剔了周次的更筛不出来。
- `firstOf` / `lastOf` 签名从 `JSONArray` 改成 `int[]`，`firstOf` 不再用 `Integer.MAX_VALUE` 哨兵（改成 `min == 0 || a[i] < min`）。
- 新增 `toInts(JSONArray)`（跳过 `<= 0` 的元素，不塞 0）、`readOps(String)`（把每条 op 拼成扁平 kv，`catch (Throwable)` 吞掉返回空列表）、`put` / `putNum` / `joinInts`。
- 删掉 `contains(JSONArray, int)`（改用 `WidgetOps.has`）。

#### 四、`MainActivity.setPref` 补一次主动重画

以前全库只有 `saveCachedSchedule` 会 `ClassWidget.refresh`（`MainActivity.java:255`，v1.1.55 加的）。于是「改完课表 → 桌面卡片更新」要等系统那 30 分钟轮询（`updatePeriodMillis=1800000`，部分 ROM 还会拉更长）。现在 `setPref` 里加：

```java
if ("xxmu_kb_ops".equals(key) || "xxmu_start".equals(key) || "xxmu_weeks".equals(key)) {
    try { ClassWidget.refresh(MainActivity.this); } catch (Throwable ignored) { }
}
```

只认这三个键：`xxmu_kb_ops`（指令叠加层）、`xxmu_start`（开学日，决定周次）、`xxmu_weeks`（总周数）。其余几千个 pref（皮肤、主题、各种游标）不触发，避免无谓重绘。

#### 五、测试：`tools/test_widgetops.js`，57 项

做法同 `tools/test_widget.js` —— **真编真跑 Java**，不切字符串进 vm：`mkdtemp` 复制 `WidgetOps.java` → 写一个 `WidgetOpsTestMain`（47 条断言）→ `javac -encoding UTF-8 -nowarn -d out` → `java -cp out` → `finally` 删临时目录。

- 源码纪律 10 项：package 声明、不 import `android.*` / `org.json.*`、四种 type 字面量都在、`ClassWidget` 走 `WidgetOps.apply(` / `WidgetOps.has(`、**不含 `"add".equals(op.optString("type"))`**
- Java 侧 47 项：`ints` 8（含 `0` 无效、`abc` → 空）、`match` 7、`apply` 空 ops 原样 + **产物是副本**（`r0.get(0) != b0.get(0)`）、停课 3、调课 5（含「没说教室保住原教室」「给了就换」「`from` 没命中不动」）、放假 4、加课 5（`cmd == true`、`1-16` 展开成 16 个 int）、坏指令 2、组合 2（停→假→加 顺序生效）、空白实体 1
- **两次我自己算错的断言**：①`holiday weeks="2,3,4"` 我期望只剩解剖学，实际 `base()` 里病理学的 weeks 正好是 `{2,3,4}`，剔空移除后剩**两门**（解剖学 + 生理学）—— 断言改对即可。②更早一版把期望写成只留解剖学，同源。
- 一条环境坑：PowerShell 打印 Java 的中文输出要先 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`，否则按 GBK 解成 `ϵͳ����ѧ`（第一次跑整行乱码，看着像断言失败）。

#### 六、门禁与出包

- `tools/check_web.js` 新增 v2.11.0 段（在 v2.10.0 段之后、`[PASS]` 判定之前）：四组断言 + `spawnSync` 跑 `test_widgetops.js`。实测读数 `写指令后立刻重画组件 = true`、`WidgetOps 四类指令 = 4/4`、`ClassWidget 走 WidgetOps = true`、`老「只认加课」分支已删 = true`。
- `tools/check_apk_inside.py` 新增 v2.11.0 段：读 **dex 不读源码** —— `WidgetOps`、`WidgetOps$Course`、四个中文 `加课/停课/调课/放假`、`xxmu_kb_ops`、`xxmu_weeks` 全 True。
- 出包：`python -X utf8 tools\bump_ver.py 2.11.0 21100` → `python -X utf8 tools\build_apk.py` → assets 54 个、`javac (13 个源文件)`、**`d8 (127 个 class, 1 个 jar)`**（v2.10.0 是 125，多的是 `WidgetOps` 与 `WidgetOps$Course`）、`android/build/app-signed.apk (1040.4 KB)`。
- `apk/xxmu-helper-v2.11.0.apk` **1065403 字节**，`classes.dex` 685956 → **690632** 字节（v2.10.0 对比），`resources.arsc` 与 entries 数不变。签名证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`（可覆盖升级）。
- 七道门禁：`check_web` `[PASS]`、`check_notes` 7 项、`check_tutorial` 39 项、`check_skin` 55 passed、`tools/test_*.js` **49 套**（48 → 49）、`verify_apk` 五件套、`check_apk_inside` 全 True。

#### 七、真机待看

1. 在 App 里停一节课（「改课表」输入指令），退回桌面 —— 那节是否**立刻**从卡片上消失（不用等 30 分钟）。
2. 调课到别的日子，卡片上是否跟着挪（不是两边都留）。
3. 放假一周，那一周的课在卡片上是否都不出现。
4. 撤销指令后是否回原样（`xxmu_kb_ops` 清空 → 卡片回到原始课表）。
5. 加课（`add`）行为有没有被这版改坏（v2.10.0 就是好的，这版只是换了实现）。
6. 有些 ROM 桌面组件刷新受省电策略限制，若「立刻」不成立，先从最近任务里划掉 App 再试一次。

---

### v2.10.0（2026-11-21）—— 桌面小组件从「今天 3 节课」改成人话：正在上还有多久下课、下节几点、上过的划掉（**本地包 2.10.0 / 21000，未上线；线上实读仍 1.1.97 / 1197**）

触发：`docs/handoff/todo.md`「三、可以做」这一轮翻到底，剩下能纯本地做完的只有「`app.js` 已 4700+ 行要不要拆」和「导出补导入」——前者原文写着「拆分本身不是目的，只有『改一处要读三千行』真的拖慢时才值得做」，后者卡在合并/覆盖、旧字段、成绩覆盖手输三个冲突没定口径。于是回头看了一个一直没人管的东西：桌面小组件 `ClassWidget`。它从 v1.1.55 上线起就没再动过，副标题永远只写「今天 N 节课 · 点开看课表」，而课表缓存里的 `times`（16 档作息串）**从来没被读过一次** —— 时间数据就在文件里，只是没人拿它算。

#### 一、这一版动的是 Java 侧，不是 web/

`web/` 这一版一行没改。改的是 `android/src/com/xxmu/helper/` 下两个文件：

- 新增 `WidgetClock.java`（150 行）。抽出来的理由不是「架构好看」，是这一段是全小组件里**唯一有分支、会算错、错了会当着用户面说错话**的部分：钟点比较、连堂课取最后一节、四档副标题文案。它不 import `android.*`、不 import `org.json.*`、不碰 `RemoteViews` 和 `Context` —— 所以能裸 `javac` + `java` 直接跑真单测。剩下的（读文件、拼 RemoteViews、挂 PendingIntent）是「有线就连」的代码，为它造一套 Android 测试环境不值得。
- `ClassWidget.java` 224 行 → 289 行，`paint()` 改成调 `WidgetClock`，老的私有 `parseSeg` / `span` / `hm` / `minuteOf` / `segStart` / `segEnd` **六段全删**。两套实现并存一定会各自漂移，所以门禁里反向断言「不许有第二份」。

#### 二、具体改了什么

**① 「还有多久下课」（用一直没人读的 `times`）**

`paint()` 里新读 `d.optJSONArray("times")`，逐档 `WidgetClock.parseSeg()` 拆成起止分钟，`WidgetClock.build(segs, true/false)` 分别摊成 `int[] tStart` / `int[] tEnd`（下标 i+1 = 第 i+1 节）。然后 `nowMin = HOUR_OF_DAY * 60 + MINUTE`，遍历今天的课找当前节与下一节。

关键取的是 `lastOf(periods)` 而不是 `firstOf()`：连堂课 `periods:[1,2]` 要按第 2 节的下课时间算，否则「还有多久下课」永远少数一节。`Row` 因此从 `{period,name,room}` 改成 `{first,last,name,room}`，排序也按 `first` 升序、相同再按 `last`。

四档副标题：
- 正在上 → `正在上 · 还有 25 分钟 下课`
- 课间 → `下节 14:30 · 12 分钟后`
- 都上完了 → `今天的课上完了 · 共 3 节`
- 有时钟读不出来 → 退回老文案 `今天 3 节课 · 点开看课表`

**② 每行加状态记号与颜色**

行首 `mark`：正在上 `▶ `、已上完 `· `、还没到三个空格（让左边界对齐）。颜色走 `v.setTextColor(ROW_IDS[i], WidgetClock.colorOf(state))` —— 这是这个文件第一次用 `RemoteViews.setTextColor`。

`colorOf`：`NOW → 0xFF9E8CFF`（与标题同主色）、`DONE → 0xFF8A82A0`（压在 `#1D1538` 舱底上约 5.4:1）、其余 `0xFFEFE9FF`（`WidgetRow` 默认色，不改）。

**行首仍写节次不写钟点**（`1节 人体解剖学 @3301`）。写「08:00」要多占三格，而每行是 `maxLines=1` + `ellipsize=end`，挤掉的正好是教室名 —— 钟点在副标题里已经给了，行里给节次更有用。

**③ 两个会说谎的毛病**

- 删掉 `private static final String START_DEFAULT = "2026-08-31"`。老逻辑是「没存过开学日就拿这个顶着算周次」，于是算出来的周次跟课表里的 `weeks` 对不上、筛不出任何课，卡片就写「今天没课，去玩吧」——**用户明明有课**。现在 `week < 1` 直接写 `还没设开学日 · 去设置里设一次` 并清空四行；`week > totalWeeks` 写 `这学期（共 N 周）已经上完了`。
- 有时钟读不出来时，老逻辑照样装着知道时间。现在只要有一档 `parseSeg` 返回 null，就整块放弃（`clockOk = false`），只写「今天 N 节课」——宁可不报时间，也不报错时间。

#### 三、测试：`tools/test_widget.js`（90 项）

做法跟仓库里其它 `test_*.js` 都不一样。别的都是切 JS 字符串进 `vm` 跑，这个是**真编真跑 Java**：把 `WidgetClock.java` 复制到 `fs.mkdtempSync()` 临时目录，附带写一个 `WidgetClockTestMain`（73 条断言），`spawnSync('javac', ...)` 再 `spawnSync('java', ...)`，`finally` 删目录。

- **源码纪律 17 项**：`WidgetClock` 不许 import `android.*` / `org.json.*` / 碰 `RemoteViews` / `Context`（碰了就不能裸跑）；`ClassWidget` 五处 `WidgetClock.*(` 调用都在；**不许有第二份 `parseSeg` / `span` / `hm` / `minuteOf`**；`START_DEFAULT` 不许回来；「还没设开学日」「已经上完了」两句必须在。
- **`WidgetClock` 真跑 73 项**：`minuteOf` 10（`24:00`→1440、`24:30`/`08:60`/`0800`/空/null→-1）、`parseSeg` 13（`~ - ～ – —` 五种分隔符；结束早于开始/起止相同/缺前后半→null）、`build` 10（越界 -1、一档坏→整块 null）、**真实 16 档作息全解析**（第 1 节 08:00、第 16 节 22:00、第 15 节只有 20 分钟）、`hm` 4 / `span` 7、`stateOf` 8、`markOf` 4 / `colorOf` 4、`subText` 7。
- **边界口径**：`nowMin = 480`（08:00）上课那一分钟算 `NOW`、`520`（下课那一分钟）仍算 `NOW`、`521` 才 `DONE` —— 跟 `web/nowline.js` 同一套口径，两个地方说同一件事不能有两种算法。
- **一致性循环**：470→620 共 151 个时刻上，`subText()` 说的话与 `stateOf()` 判的状态必须一致（说「正在上」就必须真有一节是 NOW，说「下节」就不许有节在上）。这条是防「文案和状态各写各的」。

**踩到两次自己的错**：
1. `ok(!/RemoteViews/.test(clockSrc))` 第一版红 —— `WidgetClock.java` 文件头注释正写着「不需要 RemoteViews」。**这是「注释里正在解释某个坑，断言把自己判红」第 5 次**。修法固定成 `strip()` 剥注释再判。
2. `subText` 两条断言我自己算错了：连堂课 `periods:[1,2]` + `firsts={1,3}` + `lasts={2,3}`，`nowMin=500`（08:20）时下课是 09:20 = 560，还剩 **60 分** 不是 40 分；`nowMin=555`（09:15）仍在连堂里（09:20 才下课）不是「下节」。改成 500→「1 小时」、555→「5 分钟」、565（09:25）→「下节 09:30 · 5 分钟后」。

#### 四、编译验证（单编会失败，必须全量）

单编 `ClassWidget.java` 会报 `找不到符号 类 MainActivity`。正确命令照 `tools/build_apk.py`：

```
javac -source 8 -target 8 -encoding UTF-8 -nowarn \
  -bootclasspath "D:\android-sdk\platforms\android-33\android.jar" \
  -classpath "<android\libs\*.jar 用 ; 连接>" -d <tmp> <所有 *.java> R.java
```

**只给 `-classpath android.jar` 不行**：`QrDecoder.java` / `ScanActivity.java` 的 `com.google.zxing.*` 会报 43 个错，必须 `-bootclasspath android.jar -classpath android\libs\*.jar` 分开给（`tools/build_apk.py:148-153` 的 `lib_jars()` 本来就这么做）。

产物：`WidgetClock.class` 3142B、`ClassWidget.class` 10094B、`ClassWidget$Row.class` 477B、`ClassWidget$1.class` 976B。

#### 五、门禁

- `tools/check_web.js` 加 **v2.10.0 段**：源码纪律 + 布局（`widget_today.xml` 的 `wtitle`/`wsub`/`wrow1..4`/`@drawable/widget_bg` 都在、`widget_today_info.xml` 还指向它、Manifest 里 `.ClassWidget` 还在），再 `spawnSync` 跑 `tools/test_widget.js`。可见读数：`WidgetClock 纯函数类 = 150 行 / 4/4 个核心函数`、`ClassWidget 行数 = 289（走 WidgetClock 5/5 处）`、`硬编码开学日已删 = true`。
- `tools/check_apk_inside.py` 加 **v2.10.0 段**，读的是 dex 不是源码：`dex has WidgetClock` / `ClassWidget` / `now/done marks` / `'still in class'` / `'class over'` / `'no term start'` 六条必须 True，反向 **`dex no hardcoded start date`** 必须 True（`2026-08-31` 不许再进包）。**这一条先跑过一次是 False**——当时包里还是 v2.9.1，正好证明它真的在查包里那份。
- 结果：`check_web` `[PASS]`、`check_notes` 7 项、`check_tutorial` 39 项、`check_skin` 55 passed、`tools/test_*.js` **48 套**（47→48）、`verify_apk` 五件套、`check_apk_inside` 九条全 True。`STATE.md` 9266 字节。

#### 六、包里是什么

`apk/xxmu-helper-v2.10.0.apk` **1065403 字节** `4bd7a2babfba…`，d8 收了 **125 个 class**（比 v2.9.1 多一个，就是 `WidgetClock`）。签名证书 SHA-256 `0e684845…7799`，可覆盖升级。`apk/v2.10.0.notes.txt` 五条学生视角。**未上线**，`cfg.latest` 一个字没动，线上仍 1.1.97 / 1197。

#### 七、真机待看（详见 todo.md）

这一版没有离线截图能给 —— 桌面小组件是 App 外面的东西，headless 浏览器拍不到。所以下面几条只能真机看：桌面长按添加组件后是否显示、`▶`/`·` 两个记号与颜色在真机取色下能否分开、四档副标题在 30 分钟内是否真的自己变（`updatePeriodMillis=1800000`）、连堂课是否按最后一节算下课、没设开学日时那句提示是否出现、学期上完后那句是否出现。**注意：`updatePeriodMillis` 最小生效粒度受系统限制（文档说 30 分钟是下限，部分 ROM 会拉长），所以「自己变」这件事真机上可能要等更久 —— 那是系统行为，不是算错。**

---

### v2.9.1（2026-11-21）—— 剩下四页也摆到窄屏上看：日期框被截成「2026/08.」、管理台漂着三个粉色空盒子（**本地包 2.9.1 / 2910，未上线；线上实读仍 1.1.97 / 1197**）

触发：上一轮（v2.9.0）拍的是「不在 tab 里」的那批卡与面板，但主界面本身还有四个 section 从来没被单独拍过 —— `tab-settings`（设置）、`tab-guide`（教程）、`tab-admin`（管理台）、`tab-about`（关于）。`_shot_tabs.js` 的 `TABS` 一直是五个（kb/learn/wiki/campus/me）。这一轮把 `TABS` 扩到九个，同时把「矮视口横向溢出体检」从「只覆盖学习页 + 成绩面板」扩到九个页面 × 六种视口 —— 后者是 `todo.md`「三、可以做」里挂了很久的那条「其余页面仍需真机或另写探针逐页看」。

#### 一、先扩两把尺子

`design/sketch/_shot_tabs.js`：`TABS` 加四项；`body(tab)` 在 `switchTab(tab)` 之后补三句二级页的渲染调用 —— `THEME.paint()`（settings）、`GUIDE.render()`（guide）、`About.refresh()`（about）。原因：`switchTab()` 只做「切 active 类 + 换标题 + 滚回顶部」（`web/app.js:2726`），这三个页面的内容是各自的模块在 `switchTab` 之后另调的，光切 tab 拍到的是空壳。admin 不用补，它的内容在 `#admPanel` 里，靠 `web/app.js:4527` 展开。

`heightOf()` 的截断上限从 `Math.min(3200, …)` 抬到 **6000**。理由不是「怕不够」——「关于」页实测 **3826px**（权限与删除说明 + 完整更新日志 + 开发者三段话），3200 正好卡在中间，拍出来的图是半截的，而半截图最容易被误读成「页面坏了」。

`design/sketch/_check_overflow.js` 这一轮改动最大，见第三节。

#### 二、四个真问题

##### ① 管理台页漂着三个粉色空盒子（NOVA）

`uix-admin-nova-light.png` 上，口令卡下面、概览下面、停用表单下面各浮着一条粉色空条，像是界面没加载完。

根因在两层样式的落差：`web/app.css:884` 的 `.gate-err` 只给了字色 + `min-height:18px`，空着的时候是一个看不见的占位；而 `web/nova-skin.css:773` 给 NOVA 的 `.gate-err` 补了底、边框、圆角和内边距 —— 于是**空占位也成了一个实体盒子**。`web/index.html` 里一共九处 `.gate-err`（`gateErr`/`admKeyMsg`/`admStatMsg`/`admErr`/`admDevMsg`/`apkMsg`/`cfgMsg`/`admAdminMsg`/`noticeMsg`），平时内文都是空串，等出错才写进去。

修法是在 `web/nova-skin.css` 的 `.gate-err` 规则之后加一条 `html[data-skin="nova"] .gate-err:empty{display:none !important}`。**没有去改 JS** —— 那九处都是「先 `setMsg('')` 清空、出错再写」，为了样式去改这九处的调用时序是本末倒置；`:empty` 直接表达「没字就别占位」。管理台那张图从 1503px 收到 1419px。

##### ② 设置页「开学日」被挤成「2026/08.」（两种皮肤都有）

`uix-settings-classic-light.png` 与 `uix-settings-nova-light.png` 上，学期设置那一行的日期框只显示 `2026/08.` 后面就没了，右侧日历图标也被压扁。

先量，不猜。探针读数（390 宽、classic/light）：`.fr-row` 宽 336（卡片内容宽）、`#setStart` **116×46**、`#setWeeks` 84×43、`#setSave` 120×36 —— 116 + 84 + 120 + 两个 8px 间距 = 336，**正好吃满**。而原生 `<input type="date">` 要画 `2026/08/31` 十个字符加一枚日历按钮，约需 136px。原文 `web/app.css:1287` 的 `.fr-row #setStart{flex:1.45 1 0;min-width:0}` 只调了比例，`min-width:0` 又允许它被压到 0，所以比例再大也顶不住。

修法：给 `web/index.html` 那一行加一个 `.fr-row-term` 钩子，`web/app.css` 里针对它写三条 —— `.fr-row-term{flex-wrap:wrap}`、`#setStart{flex:1 1 132px;min-width:132px}`、`#setSave{flex:1 0 100%;margin-top:8px}`。也就是**把「保存并立即生效」整行换下去**。改后探针读数：`#setStart` **244×46**、`#setSave` 336×36（通栏），三组合（classic/light、nova/light、classic/dark）完全一致。

**为什么不直接改 `.fr-row`**：`web/index.html:465` 还有一条 `.fr-row`（饮水机「验证码 + 发送验证码」），它必须留在同一行，加 `flex-wrap` 会把它拆成两截。所以只给设置页这一行加类，`check_web` 里还写了一条反向断言盯着 `.fr-row` 本体不许出现 `flex-wrap`。

##### ③ 「关于」页以前只能拍到一半

就是第一节那条 3200 上限。抬高后 nova 两档 3826px、classic 两档 3791px，尾部 3× 裁图确认末屏是开发者信息区，没有空白也没有被裁的元素。

##### ④ 管理台在离线夹具里只剩一张口令卡

`#admPanel` 默认 `style="display:none"`（`web/index.html:696`），展开条件是 `web/app.js:4534` 的 `if (key() && $('admPanel'))`，而 `key()` 读 `XXMU.pref('xxmu_admin_key')` —— 离线无 Host 时恒为空串。先试过写 localStorage，无效（`XXMU.pref` 走 Host 桥，不读 localStorage 兜底）。最后在夹具里直接 `document.getElementById('admPanel').style.display='block'`。这在语义上等价于「存过口令但连不上服务器」：概览四个数是「--」、分段能点、表单在，不含任何真实数据 —— 拍的是**版式**，不是**数据**。

#### 三、溢出体检扩到九页（这轮真正的量）

`design/sketch/_check_overflow.js` 原来只测学习页 + 成绩面板。这一轮扩成 **9 个 section × 6 种视口**（360/390/412/492×900、492×700、360×640），一个 Edge 启动、六个 iframe 同量，一个 iframe 里顺序切九个 tab（54 个 iframe 同时渲染会拖到十几分钟）。

首跑 FAIL 16 处：`kb` 12~15 条、`wiki` 1~3 条、`settings` 0~2 条。读 CSS 后全部判定为**横向滚动/裁切容器**在正常工作的表现：

- `div.nv-belt-track`（课表顶部的周次传送带）：`web/nova-organs.css:80` 的 `.nv-belt{overflow:hidden}` + `transform:translateX(var(--shift))`，里面装 20 多个 `.nv-wk` 周次格 —— 它天生就比屏幕宽，靠拖动看后面的周。
- `button.nv-clip-chip`（WIKI 的四分段夹子）：同一套横向 chip 带。
- `settings` 那两颗：`#setQuick` 五个 quick chips 在 360px 下换行，右边界超出视口，但 `web/app.css:594` 的 `.chips{overflow-x:auto}` 让它可滑。

于是加 `clipOf(el)`：从 `el.parentElement` 往上爬，遇第一个 `overflowX !== "visible"` 的祖先就返回它和它的模式（`auto`/`scroll` = 用户滑得到；`hidden`/`clip` = 内容真够不着）。`scan()` 相应改成三档：可滚 → 跳过；可裁 → 计入 `hid`（单独提示，不判红）；都没有 → 才算 `n`（真溢出）。另外加了个 `seen` 计数，判定要求 `seen > 0` —— 某页扫到 0 个可见元素说明夹具没把那页渲染出来，那种「0 溢出」是假的。

同时补齐夹具，让「没溢出」这个结论有意义：写饮水机 token + 两台机器 + 一条出水看护记录（`web/app.js:4987` 的 `if (dc) dc.style.display = on ? 'block' : 'none'`，不写 token 校园页有半页是空的）；写 `xxmu_mytodo` 四条（两条带日期走「昨天/明天」、两条无日期）；写成绩四门含一门空分 + 目标绩点 + 剩余学分。等待时间从 1800ms 抬到 5200ms、`--virtual-time-budget` 从 3500 抬到 9000（单档要顺序切九个 tab）。

**结果：四组合（light/dark × nova/classic）全部 PASS**，退出码 0。nova 两档各 82 个元素被 `overflow:hidden` 祖先裁掉（全是上面那两类拖动带，设计内），classic 两档 0。单档读数形如 `kb:0#196 | learn:0#111 | wiki:0#68 | campus:0#59 | me:0#60 | settings:0#60 | guide:0#51 | admin:0#10 | about:0#123 || btnW=97 vOver=0 tl=66`。

一个操作上的坑：`node ... 2>&1 | Select-String` 会让 PowerShell 把 Edge 往 stderr 刷的 `fallback_task_provider.cc:126` 当成错误输出，于是报 `[exit code: 1]` —— 但脚本本身是 PASS 的。判退出码要写 `node ... 2>$null | Out-Null; Write-Host $LASTEXITCODE`。

#### 四、门禁

七道全绿：`check_web`（新增 v2.9.1 段五条：`fr-row-term` 钩子 / `#setStart` 的 `min-width:132px` / `#setSave` 通栏 / 反向断言 `.fr-row` 本体无 `flex-wrap` / 空 `.gate-err` 不占位，外加两把尺子文件必须在）、`check_notes` 7 项、`check_tutorial` 39 项、`check_skin` 55 passed、`tools/test_*.js` **47 套**、`verify_apk` 五件套、`check_apk_inside`（新增 v2.9.1 段五条，读的是 `assets/` 里打包进去的那一份）。

`design/sketch/_audit_type.js` 四组合复跑仍全 0；深色 NOVA 的 kb/me 两页仍是 `checked=0 unmeas=112/63` —— **unmeas 不等于通过**，这两页只能真机取色。

#### 五、包里是什么

`apk/xxmu-helper-v2.9.1.apk` 1061307 字节，SHA-256 `b08864003902…`（完整值见 `STATE.md`）。签名证书 SHA-256 `0e684845…7799`、DN `CN=XXMU Helper, OU=Dev, O=XXMU, L=Xinxiang, ST=Henan, C=CN`，与 1.1.x 起每一版一致，可直接覆盖升级。`apk/v2.9.1.notes.txt` 四条学生视角说明。

**未上线。** `cfg.latest` 一个字没动，线上实读仍是 1.1.97 / 1197。

#### 六、真机待看

指向 `todo.md` 的 v2.9.1 条目。要点是「日期框在真机上是否显示完整」—— 离线是用桌面 Chromium 的 date 控件量的，Android WebView 的 date 控件排版不完全一样，宽度按 132px 起算应该是够的，但只有真机能确认。

---


触发：v2.8.0 把五个主 tab 逐张看过一遍，但还有一批界面从来没被拍过 —— 它们的共同点是**不在 tab 里**：我的待办、专注计时、账号绑定这三张卡平时睡在 `#toolPark`（`display:none`），只有点开才被 `openToolCard()` 搬进半框 `.sh-box`；空教室、成绩、导出、提醒设置是「面板」而不是「页面」。这些地方以前只在开发时随手瞄过，没有四档对照图。这一轮把它们全部拍成 390 宽的实拍，逐张看。

#### 一、先补两把尺子

`_shot_toolcards.js`（我的待办 / 账号绑定）+ `_shot_freetool.js`（空教室）都是**读真实 `web/index.html`** 的夹具，不做「假造一个面板」的事。两条必须遵守的做法：

1. **必须走真入口 `openToolCard(id)`，不能原地 `display:''`**。半框里的 `.sh-box` 内边距、`.sheet-only` 那套规则只在卡真的被 append 进去时才生效；原地显示拍到的是另一套排版，看图会得出错误结论。
2. **`#sheet` 是 `#app` 的子节点**，所以「只拍面板」不能靠藏 `#app`（会连面板一起藏成一整张白图），要写 `#app > *:not(#sheet){display:none!important}`。这个坑 v2.5.0 拍导出面板时踩过一次，这次直接沿用。

空教室面板还多三件事，都是「不这么写就跑不出正确结论」：

- `PERIODS` 必须是 **14** 不是 9。`segs()` 按 `PERIODS` 切「晚上 11-14」，只造 9 节时晚上时段一格数据都没有，`unknownAt()` 会把所有房间判成未知，图上是「空 0 / 12 间」——看起来像产品崩了，其实是夹具缺数据。
- 教室类型必须按 **GBK 字节**拼（`多媒体 B6E0C3BDCCE5` 等）。`post()` 把响应喂 `toGbk()`，而浏览器没有 GBK 编码器；只有按字节 `String.fromCharCode` 拼才能既保持源文件纯 ASCII、又走真实的解码路径。（第一版把「研讨室」写成 `D1D0CCT6CAD2`，多了一个 C，图上渲染成「研?□室」。）
- `netCk` 桩必须装在 **`go()` 里、`KFREE.open()` 之前**。装在 `</head>` 时 `web/sync.js` 还没执行、`window.XXMU` 还是 undefined，桩装不上，`post()` 直接吃 `ERR:`，报「网络没通（超时）」。守卫写 `typeof XXMU !== "undefined"` —— 顶层 `const XXMU` 不是 window 属性，这个坑 v2.3.0 已经踩过一次。

#### 二、四个真问题（全部是「同一个东西在不同落位下长了两副面孔」）

**① 我的待办卡在经典皮肤下整张淡紫。** `openToolCard()` 把卡 append 进 `.sh-box` 后，它成了容器里第 4 个同级元素，而 `web/app.css` 的彩纸规则是 `.card:not(.elec-entry):nth-of-type(4n+4){…--tint-mist…}`，特异性 (0,2,0) 高过 `.sheet-only` 的 (0,1,0) —— 于是这张本该是「面板里的一张纸」的卡，被当成「桌上第四张彩纸」配了雾紫底 + 紫胶带。探测读数：`nsib=4 nth-of-type=4 cls=card sheet-only tape=#8E7BC4`。

修法（`web/app.css`）：`.sh-box .sheet-only,.sh-box .card.sheet-only{background:transparent;border:0;box-shadow:none;transform:none;--tape:var(--red);isolation:isolate}`。

两处细节值得记住：**`.sheet-only` 得改成 `.sh-box .sheet-only`**（父级限定的特异性才压得住 nth-of-type；第一次写成 `#sh-body .sheet-only` 无效，因为挂载点是 `.sh-box` 不是 `#sh-body`）；**`isolation:isolate` 不能省** —— 下面第②条那个荧光笔用的是 `z-index:-1`，它以前能显示是因为卡片整体有 `transform`（形成层叠上下文），`transform:none` 之后它会直接沉到 `.sh-box` 的纸色底下面，整条消失。

**② 「已完成 · 2 ▾」的沙金荧光笔横穿整张卡。** `.hwsec::after` 是 `left:0;right:0` 的绝对定位条，而 `.hwsec.fold` 原来是 `display:flex`——**块级盒撑满整行**，所以包含块是整行而不是文字，那条高亮横跨整卡，看起来像一条画歪的下划线。修法：改成 `display:inline-flex`（缩到文字宽，`align-items`/`gap` 仍然生效）。

**③ 同一行在深色模式下读不出字。** 深色档 `--paper2 #302620` 上叠 `--yellow #E8BE58` 按 `opacity:.6` 混出条色 `rgb(158,129,66)`，压在上面的字：`--pencil #B0A085` 只有 **1.45**、`--ink2 #C8B79C` 只有 **1.89**、`--ink #F3E9D6` 也才 3.07。扫描结果：opacity .10 → 条 `rgb(66,53,38)`（4.64 / 6.05 / 9.86）、.14 → 4.22 / 5.50 / 8.95、.18 → 3.84 / 5.01 / 8.15。

选 **.14 + 折叠行字色提到 `--ink2`**，不选 .10：.10 那条荧光笔几乎看不见，等于把装饰删了；.14 保留一笔淡痕，`--pencil` 的 4.22 缺口用字色提升补掉（折叠行本身就该比正文重一档）。用改 `opacity` 而不是换背景色，是为了让浅深两档共用同一条 `--yellow`。四条同名规则（`.hwsec`/`.grp-head`/`.wiki-cat`/`.ph-title`）一起改，它们共用同一条 `::after`。

**④ 账号绑定面板里的 provider 卡顶上贴了一条被裁半截的胶带。** `#bindCard` 里挂着 `#cxCard` + `#srcCards` 里三张 provider 卡，它们是真 `.card`，各带 `::before` 胶带（44×13，`top:-7px` 探出卡外）。半框 `.sh-box` 是滚动容器、会裁掉溢出 —— 第一张卡正好贴在上沿，胶带被切掉一半，图上是一块凭空浮着的红方块。修法：`.sh-box .sheet-only .card::before,.sh-box .sheet-only .card::after{display:none}`。

**彩纸底色（nth-of-type 的 tint）有意保留** —— 那是皮肤记号不是装饰附件；胶带才是「贴在桌上」的物理暗示，在半框里没有依据。

#### 三、顺带：铭牌里那个长读数

「我的」页 NOVA 皮肤的 SPEC 铭牌（`buildPlate()`）把 10 条读数塞进两列网格，`.nv-plate-row b` 是 `nowrap + ellipsis`。而「数据来源」的真实读数是 `教务同步（课表） / 多平台 · 2 路（作业）` 这种长句（由 `label()` 拼），一格只有约 150px，实拍里被裁成「内置（课表） / 内…」。修法：`buildPlate()` 里给 `srcTag` 那一行加 `.nv-plate-row.wide`，样式 `grid-column:1 / -1` + 允许换行右对齐。只放宽这一行，其余九行保持两列（它们都是一两个字的短值，放宽反而散）。

#### 四、门禁

- `tools/check_web.js` 加 v2.9.0 段（6 组）：sheet-only 透明底 + isolate、卡中卡无胶带、`.hwsec.fold` 是 inline-flex、深色荧光笔 `.14`、深色折叠行 `--ink2`、铭牌 `wide` 与三把尺子文件存在。
- `tools/check_apk_inside.py` 加 v2.9.0 段（8 条）：断言打**进包里的那份 assets** 也是新代码，而不是只看 `web/` 源（v2.0.0 就是因为只看源、包里还是旧版 learnplus.js，才补了这个脚本）。
- `_audit_type.js` 四组合复跑仍全 0：light/classic 41→0、light/nova 33→0、dark/classic 28→0、dark/nova 0（深色 NOVA 的 kb/me 两页 `checked=0`、`unmeas=112/63`，元素底是渐变、审计器主动放弃测量 —— **unmeas 不等于通过**，这两页只能真机取色）。

七道门禁：`check_web` PASS（50 assets identical）、`check_notes` 7 项 PASS、`check_tutorial` 39 项 PASS、`check_skin` 55 passed、`test_*.js` 47 套 fail=0、`verify_apk` 五件套 PASS、`check_apk_inside` 全 True。

#### 五、包里是什么

`apk/xxmu-helper-v2.9.0.apk` **1061307 字节**，`STATE.md` 9044 字节；签名证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799` 与历史一致，可覆盖升级。`apk/v2.9.0.notes.txt` 六条学生视角。**未上线** —— `cfg.latest` 一个字没动，线上仍是 1.1.97 / 1197。

#### 六、真机待看

见 `todo.md` 的「## 二、等真机」v2.9.0 段：半框里待办卡的胶带颜色、深色荧光笔淡痕是否还看得出来、账号绑定四张卡是否还有被裁的元素、我的待办删除按钮点两次的第二态。这些离线实拍都能验，但`.sh-box` 的滚动裁切在真机上受系统字体缩放影响，值得再看一眼。

---

### v2.8.0（2026-11-21）—— 可读性这一轮：把「看不清」量化成对比度，一条一条改到 4.5 以上（**本地包 2.8.0 / 2800，未上线；线上实读仍 1.1.97 / 1197**）

触发：v2.7.0 修完排版之后，仍然有人（也包括我自己看截图时）觉得「有些字费劲」。这件事不能靠眼睛投票 —— 到底哪一行不够，得量。于是先写了一个审计器，再按它开出来的清单改。

#### 一、先造一把尺子：`design/sketch/_audit_type.js`

做法：读真实 `web/index.html`，把 `#app` 解锁、隐藏首启遮罩，按四组合（light/dark × nova/classic）逐 tab（kb / learn / wiki / campus / me）遍历**所有有文字的元素**，对每个元素算三件事：字号 `< 10px` 判 `tiny`、字重、以及**文字色对最近的实底色的对比度**（`cr`）。输出 `TOTAL_BAD` 与逐条明细（选择器 + 文字片段 + fs/fw/cr）。

第一版跑出来 `light/nova TOTAL_BAD=136`，里面有一堆 `cr=1.00` —— 全是假的。原因是审计器向上找底色时，只要祖先链上第一个非透明 `background-color` 就停，而 NOVA 的深色渐变底是 `background-image`，被它跳过、一路爬到 `body` 的白底，于是白字压白底算出 1.00（`#hdTitle` / `#hdSub` / 五个 tab 标签 / `u[XXMU·DEVICE]` 等 38 个）。修法：向上爬时任一层 `backgroundImage` 含 `gradient` 就 `return null`，这一条不参与判定、计入 `unmeas`。

修完的读数才是真问题清单：`light/classic 41`、`light/nova 33`、`dark/classic 28`、`dark/nova 7`。

> **`unmeas` 不等于通过。** 深色 NOVA 的 kb 与 me 两页是 `checked=0 / unmeas=112`、`checked=0 / unmeas=63` —— 整页元素几乎都压在渐变/玻璃底上，审计器**主动放弃测量**。这两个 0 是「没量」，不是「量过了」。要真验只能上真机取色，离线做不到，已写进 todo 的「等真机」。

#### 二、经典皮肤的低对比度只有一个源头

`web/app.css:22` 的 `--pencil:#9C8B70`，而 `:39` 写着 `--mute:var(--pencil)` —— 也就是说「次要文字色」就是这支铅笔灰。它对 `--paper #EFE2C8` 只有 **2.58**、对 `--paper2 #FAF3E2` 只有 **2.99**。审计里经典皮肤所有 2.99 全是它：`hwdate`（截止日期）、`hwleft.gray`（剩余时间）、`.row .v.dim`（行尾「›」、「管理 ›」、「浅色 ›」）、`.about-foot`、`.wiki-src`、`.fb-at`、`.room-m`、`.adm-stat span`…一共 23 处引用，改 token 一处通吃。

候选值用 python 精确算 WCAG 之后定 **`#706046`**：对 `--paper` 4.75 / `--paper2` 5.50 / `--surface2 #F5EAD4` 5.10，三底全过 4.5，色相仍是同一支铅笔。同批：`--warn:#B27A12`（2.88 / 3.34）→ **`#83560A`**（4.96 / 5.75），它管的是 `hwleft.orange`（「还剩 11 小时 59 分」）。`--ok:#3F6B3C`（4.85 / 5.62）与 `--danger:#A62B1C`（5.49 / 6.36）实测合格，**一个字没动** —— 改色只改不合格的。

#### 三、深色皮肤的铅笔灰，以及一个被我误判了半小时的 1.46

深色档 `--pencil:#8F8069` 对 `--paper #241E1A` / `--paper2 #302620` / `--surface2 #3A2E26` = 4.28 / 3.83 / 3.42，三底全不达标。改 **`#B0A085`** → 6.44 / 5.77 / 5.14。

改完还剩两条 `cr=1.46`：`#elecRefresh`（校园事务的「刷新」）与 `#btnSync.btn.soft`（「从教务同步课表」）。这两个都是**按钮**，字压在自己的底上，跟铅笔灰无关。查到底：深色档 `--yellow:#E8BE58`，而按钮的字色继承的是 `--ink:#F3E9D6`（深色档的 ink 是**浅色**）—— 浅米字压金黄底，1.46，肉眼几乎就是一块色块。

修法不是给这两个按钮单独写规则，而是**补一个「黄底上的字」令牌**：`--on-yellow`。浅色档 `var(--ink)`（纸底上的黄块仍用墨色），深色档写死 `#2A2018`。然后用一次性脚本把 14 处黄底统一改吃它：`.btn.soft` / `.ntc-badge` / `.upd-group` / `.gate-more span:active` / `.about-ver` / `.rm-mode.on` / `.pick-cell.suite` / `.elec-entry-refresh` / `.elec-change`（含深色覆盖）/ `.wiki-tag` / `.adm-cp` / `.adm-odd` / `.th-opt.on`。脚本每处都断言「该选择器在文件里恰好出现 1 次」，任一处不符就整体不写盘。

同批还有 `--oncolor-dim:rgba(23,18,14,.72)` → **`.82`**：深色档的 `--oncolor` 是深墨 `#17120E`，「淡一档」用 alpha 往下掉，压 `--red #E8704C` 只剩 4.38；提到 .82 后五底色 5.40 / 4.72 / 5.85 / 7.22 / 4.96 全过 4.5。

#### 四、作业状态色：内联色搬的是 Material 500 号色

`web/app.js:611` 的 `HW_COLORS` 是直接照 Material Design 500 号色填的：蓝 `#2196F3` 4.07、红 `#F44336` 4.31、橙 `#FF9800` **2.79**、绿 `#4CAF50` **2.76**、灰 `#9E9E9E` **1.96**（全部对经典 `--paper2`）。五个里只有前两个勉强及格。整表换成深一档的同色相：

```js
const HW_COLORS = {
  '待做': '#9E5009', '重新编辑': '#9E5009', '未交': '#A8201A', '未提交': '#A8201A',
  '待批阅': '#1259AE', '未批阅': '#1259AE', '已批阅': '#1E6B33',
  '未开始': '#1259AE', '未开考': '#1259AE', '进行中': '#A8201A',
  '已完成': '#1E6B33', '已过期': '#6E6E6E', '已结束': '#6E6E6E',
  '状态未知': '#6E6E6E',
};
```

同时新增 `const HW_INK = { bad: HW_COLORS['未交'], soon: HW_COLORS['待做'] };`，替换掉 `web/app.js` 里两处内联字色（考试倒计时 `'#d93025'`、作业剩余 `'#e8710a'`）—— 那两处是卡片里手写的，跟 `HW_COLORS` 是两套，之前改一处另一处不变。

**为什么只影响经典皮肤**：`web/nova-skin.css:1112-1166`（⑥ 段）用 `!important` 按 `.hw[data-st]` 重上色（三级可读性：威胁 / 待办 / 完成），NOVA 下 `HW_COLORS` 被完全覆盖。所以这一改是修经典、NOVA 不动。

深色档的作业卡是另一套：`html[data-theme="dark"] .c{filter:saturate(1.5) contrast(.98)}` 会把上面这些色一起压暗。新增一段按 `data-st` 覆盖，**但颜色必须走令牌**——`tools/check_web.js` 的 `NEUTRAL_OK` 白名单不许组件里出现裸色值（`check_web.js:1359`）。所以五个令牌：`--hw-threat:#FF8A80`、`--hw-info:#7FB3F0`、`--hw-soon:#E8A34E`、`--hw-done:#8FD08A`、`--hw-idle:#A89C8E`。

#### 五、9px 的钟点：真凶在第五层 CSS

`.c .pr2`（课卡右下的下课钟点）审计报 `fs=9`。但 `web/app.css:234` 写的是 11px、`web/nova-skin.css:219` 写的是 `font:11px/1.35` —— 改哪个都不生效。

这次没再逐层 grep，而是写了个探针：遍历 `document.styleSheets`，对目标元素用 `el.matches(selectorText)` 把**所有命中了它、且声明了 fontSize/font 的规则**连同来源文件一起打出来。一次就指到了：

```
PR2|computed fs=9px
  app.css:          .c .pr2 => 11px
  nova-skin.css:    html[data-skin="nova"] #grid .c .room, … => 11px/1.35
  nova-polish.css:  html[data-skin="nova"][lang] #grid.grid .c .pr, … => 9px   ← 就是它
```

`web/nova-polish.css`（`web/index.html:37` 引入）是之前几版一直漏掉的**第五层**（app / nova-skin / nova-medium / nova-polish / nova-cyber）。它的特异性写成 `html[data-skin="nova"][lang] #grid.grid …` = **(1,5,1)**，故意高过 medium 的 (1,4,1)。这一层把课表时间做成「基准尺」：左列 `.gt` 与卡内 `.pr` 都绝对定位到「行顶 2px + 12px 行高」，对齐同一条 y=14px 的线；`.pr2` 贴卡底右侧。

9px 是当年为「第 1-3 节 · 上午」这种兜底长文案定的。现在 `.pr2` 里只剩「09:35」五个字符，10px 等宽约 30px，塞进 41px 卡内宽完全够。改 **10px**，**line-height 必须保持 12px** —— 那条 y=14px 基准线是按 `top:2px + 12px` 算出来的，动行高整列时间都会错位。

`gp .gt`（左列节次钟点）：NOVA 浅色档吃 `--n-ink-2 #4A5A6A` 压 `#D8E3E9` = 4.16（差 0.34）→ 改 `--n-ink`；经典皮肤原写 `opacity:.65` 叠铅笔灰 → 改 `color:var(--ink2);opacity:1`（6.15），靠 400 vs 800 的字重差区分主次，不靠透明度。

#### 六、一批 8-9px 的英文小标

`web/nova-organs.css` 里 `.nv-tape-top/.nv-tape-bot`（SIDE A / ▶ PLAY）8px、`.nv-clip-tag`（CAMPUS WIKI）8px、`.nv-ticket-head`（HOT WATER · 胖乖生活）/ `.nv-ticket-read u` / `.nv-ticket-note` 9px、`.nv-polaroid-tag`（POLAROID WALL）/ `.nv-polaroid-note` 9px —— 全部提到 10px。这些是等宽大写 + 1.6px 字距的装饰小标，提到 10px 后宽度仍够。

#### 七、改完复跑：四组合全 0

`node design\sketch\_audit_type.js <theme> <skin>` 四组：`light/classic 0`、`light/nova 0`、`dark/classic 0`、`dark/nova 0`（后者仍带 `unmeas`，见第一节）。修前分别是 41 / 33 / 28 / 7。

#### 八、实拍又抓到两个真问题

五 tab × 四组合 20 张重拍之后，在「我的」页看到两处，都不是审计器能报的（一个是数据没喂、一个是截断）：

1. **课程数显示 0**。截图里「课程数 0」而课表页明明有 10 门课。原因是 `#cnt`/`#termPick`/`#srcTag` 是 `app.js:2099-2101` 的 `load()` 写的，而实拍夹具绕过 `load()` 直接赋 `DATA.courses`，这三个读数就停在 HTML 里的初始值（`--` / `--` / `内置`）。**这是夹具的问题，不是产品的问题** —— 修夹具：补 `DATA.term`、`DATA._source`、`HOMEWORK._source`/`sources` 并按 `load()` 的口径写一遍三个 DOM。
2. **「数据来源」被裁成「内置（课表） / 内_」**。这个是真问题：`web/nova-organs.js` 的铭牌 `buildPlate()` 把 10 条读数塞进两列网格，`.nv-plate-row b` 是 `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`，而「数据来源」的真实读数是「教务同步（课表） / 多平台 · 2 路（作业）」这种长句，两列格里只有约 150px。修法：给这一行加 `.wide`（`grid-column:1 / -1` 占满两列）并让读数折行，其它九行仍是紧凑的一行一读数。

#### 九、门禁

七道全绿：`check_web`（新增 v2.8.0 段 10 条 + 3 条反向，含「不许再出现 `#d93025`/`#e8710a`」「polish 不许再有 `9px !important`」）、`check_notes` 7 项、`check_tutorial` 39 项、`check_skin` 55 passed、`test_*.js` 47 套、`verify_apk` 五件套、`check_apk_inside`（新增 v2.8.0 段 13 条）。

`check_web.js` 与 `check_apk_inside.py` 两处各踩了一次同一个坑：**断言写「文件里不许出现某字符串」，而注释里正在解释这个字符串**（`app.js` 注释里的 `#e8710a`、`nova-organs.css` 注释里的 `8px → 10px`），第一版都判了红。修法统一成「先剥 `/*…*/` 与 `//` 再判」。这已经是这个坑的第 4 次，写进纪律：**任何「源码里不许有 X」的断言，先剥注释**。

#### 十、包里是什么

`apk/xxmu-helper-v2.8.0.apk` **1061307 字节**，SHA-256 `5C1B29D6238DF5AB56D4889CEFDAAC60D935F6EDD138BDA453B4DB9CAD882D7C`，签名证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`（可覆盖升级）。`apk/v2.8.0.notes.txt` 八条学生视角说明。`STATE.md` 8905 字节。**未上线**：`cfg.latest` 一个字没动，线上实读仍 1.1.97 / 1197。

#### 十一、真机待看

见 `todo.md` 的「## 二、等真机」v2.8.0 段（六条）。要点：深色 NOVA 那两页的 `unmeas` 只能真机取色；深色档黄底按钮的字是新令牌 `--on-yellow`，要看真机上是不是够黑；课表右下的钟点从 9px 到 10px，要看会不会在 5 字卡名列里挤掉一行。

---

### v2.7.0（2026-11-21）—— 界面这一轮：课表上的字不再被挤成一列，读数不再说胡话（**本地包 2.7.0 / 2700，未上线；线上实读仍 1.1.97 / 1197**）

触发：用户把五个 tab 的截图一张张发过来。前六版都在加功能，这一版没有新功能 —— 全部是「数据和逻辑都对，但屏幕上印出来的东西是错的」。一共七处，每一处都先在截图里看见、再回源码定位、改完重拍确认。

#### 一、课名被逐字竖排：三轮才找对地方

`uix-kb-nova-light.png` 里「系统解剖学」竖着排成「系统解」/「剖」/「学」，「医学伦理学」排成「医学」/「伦理」/「学」。房间号 `A201` 是好的，所以不是所有字都断。

算一下宽度就清楚了：390px 屏，节次列 34px、网格左右 padding 6px、七列各留 2px gap，一天一列 = `(390-34-12-14)/7 ≈ 47px`。课卡再扣掉 4px 内边距和 2px 左侧竖条，正文宽度只剩 30px —— 11px 汉字一行放两个字，五个字必然三行。而 `web/app.css:223` 的 `.c b` 写着 `word-break:break-all`，中文在任何位置都断，于是「系统解/剖/学」这种切法就成了默认行为。

三轮改动，前两轮都没解决：

1. **先腾垂直空间** —— 课卡里原来同时印起始钟点和结束钟点（`09:35`）。但左侧节次轴 `.gp .gt` 每一行本来就写这一节的起始时间，卡片再印一遍纯属重复，还占掉单节卡（56px = 4 行）里的两行。改成只在连堂（`b.span > 1`）时保留结束钟点：

   ```js
   const at1 = firstTime(t1), at2 = lastTime(t2);
   if (at1 && at2) {
     /* v2.7.0：课卡里不再印起始钟点。左边节次轴每行已经写了这一节几点开始，
        卡片再印一遍要吃掉 4 行正文里的 2 行。连堂的课仍保留结束钟点。 */
     if (b.span > 1) box.appendChild(el('span', 'pr2', at2));
   } else {
   ```

   重拍，字还是竖排。**说明瓶颈不在垂直方向，在水平方向** —— 这一步的价值是排除了一个猜测，不是修好了。

2. **改断词规则与内边距（app.css）** —— `.c` 的 `padding:4px 4px 4px 6px` → `3px 1px 3px 3px`，左侧竖条 `2.5px` → `2px`；`.c b` 与 `.c .room` 的 `word-break:break-all` → `word-break:normal; overflow-wrap:break-word`，`padding-left:1px` → `0`。内容宽度从 30px 变 34px，理论上能一行三字。重拍，**还是竖排**。

3. **找对归属：NOVA 的内边距不在 app.css** —— 决定性的一步。`web/nova-skin.css:204` 有一条 `html[data-skin="nova"] #grid .c{... padding:4px 3px 3px 5px !important}`，带 `!important`。app.css 里改的那个值在 NOVA 皮肤下**从来没生效过**。改成 `3px 1px 3px 3px !important` 并留注释说明「`.c::before` 在 NOVA 层是 `content:none`，左边不用留竖条位」。重拍 → 「系统解剖学」两行「系统解/剖学」，「医学伦理学」两行「医学伦/理学」，`A201`、`09:35` 各一行。**这才叫修好。**

   顺带记一条容易踩错的归属知识：`web/nova-skin.css:191-195` 有一段旧注释写着「浅色档实际生效的是 `nova-medium.css` 里 `:not([data-theme="dark"])` 那一组，特异性更高、载入在后，所以下面这段只在深色档生效」。这次实测推翻了它对 `padding` 的适用性 —— `nova-medium.css:223` 那组只覆盖 `border/background/color/border-radius/box-shadow`，**没写 `padding`**，所以 padding 仍由 nova-skin.css 那条唯一带 `!important` 的规则决定。一句话：**在 NOVA 里改某个属性之前，先确认 medium 层有没有写这个属性；没写，就还在 skin 层。**

#### 二、截止矩阵三格读数：标签和数字互相打架

学习页「DEADLINE MATRIX」右上三格，改之前：

- 「待做」下面印的是「4 条待做 · 4 场考试待考」
- 「待考」下面印的是「4 待做 / 0 待考」
- 「同步」下面印的是**课表**的同步时刻

根因是 `web/nova-organs.js` 的 `buildRain()` 用 `data-src` 直接抠别的元素的 `textContent`：`待做` ← `#hwcount`、`待考` ← `#hwStat`、`同步` ← `#syncAt`。三个都抠错了对象。另外 `segs.appendChild(s)` 那一行漏了，三个 `nv-rain-seg` 根本没进 DOM。

改法是把「数值」和「怎么印」分开：

- `web/app.js:920-936` 新增结构化出口：

  ```js
  window.__HWSTAT = {
    works: openWorks.length,
    exams: openExams.length,
    expired: expN,
    /* 同步时刻用秒级时间戳给，读数条按「今天/昨天/几月几号」自己决定印多长，
       #hwSyncAt 那串 '2026/11/21 15:08:09' 塞不进读数条。 */
    syncedAt: d.synced_at || null,
  };
  ```

- `buildRain()` 三列改成自己的键 `['待做','works'] / ['待考','exams'] / ['同步','sync']`，值节点 `data-hw=<key>`，补回 `segs.appendChild(s)`。
- `sync()` 从 `window.__HWSTAT` 取数，同步时刻自己格式化。

CSS 那边不用动 —— `web/nova-organs.css:876-897` 的两段式布局（标题一行、读数行三列 `flex:1 1 0; min-width:0` + `ellipsis`）本来就是对的。

#### 三、顺手修的口径错：未开考的考试不算「待考」

这是第二格读数暴露出的事，但它是产品逻辑错，不是显示错。原来：

```js
const openExams = items.filter(x => x.kind === 'exam' && x.open && !x.expired);
```

而 `web/app.js:873-874` 里，未开考的考试 `open` 恒为 `false`：

```js
const notStarted = upcoming || ke === 'notstart';
if (notStarted) e._open = false;
```

于是「两天后有一场考试」在待考格印 0，可下面列表里明明躺着那一场。新口径：

```js
/* v2.7.0：待考的判据改成「没交卷、也没过期」，不再要求 open。
 * open 对考试的含义是「平台说还在进行」，于是还没开考的考试 open=false，
 * 「待考」就印成 0 —— 可下面列表里明明躺着一场两天后要考的。
 * 「待考」该数的是「你还有几场要考」，没开考不等于不用考。 */
const openExams = items.filter(x => x.kind === 'exam' && !x.expired
  && !isDoneStatus(x.status));
```

注意作业那一行（`openWorks`）**没动**：作业的 `open` 语义是「已下发且未收」，与考试不同，照旧。

#### 四、同步时刻的统一短格式

`web/nova-organs.js` 在 `curWeek()` 之后提了两个模块级函数：

```js
/* 同步时刻印成最短的可识别形式：今天只印时分，昨天印「昨天」，更早印「11/19」。
   整串 2026/11/21 15:08:09 在半栏（≈130px）里只能读到「2026/1…」，等于没印。
   两个地方要用它：截止矩阵的读数条、设备铭牌的「课表同步 / 作业同步」。
   v2.7.0 从 buildRain 的闭包里提出来，避免两处各写一份（那种副本一定会走样）。 */
function syncText(ts) { /* 今天→HH:MM / 昨天→'昨天 HH:MM' / 更早→'M/D' */ }

/* 「2026/11/21 15:17:31」这类整串 → 秒级时间戳。app.js 的 fmtTs 就是这个格式。
   解析不出来返回 null，让调用方退回原样搬运。 */
function parseStamp(t) { ... }
```

这两个函数原来是 `buildRain()` 闭包里的私有实现，只服务读数条一处。「我的」页的设备铭牌也要印同样的两个时刻，**复制一份必然走样**（本仓库已经有过一次教训：`learnplus.js` 抄 `fmtLeft` 抄漏了进位归一化，v2.7.0 一起修了 —— 见第七节），所以提到模块顶层，一处定义两处用。

铭牌的 `sync()` 里加特判，把长串压成短形式，全称放 `title`：

```js
if (src === 'syncAt' || src === 'hwSyncAt') {
  var ts = parseStamp(t);
  if (ts != null) {
    vals[i].textContent = syncText(ts);
    vals[i].title = t;
    continue;
  }
}
```

#### 五、三处视觉收尾

- **课表底部两颗按钮在 NOVA 下是一团灰**。`web/nova-skin.css:307-309` 的 `html[data-skin="nova"] .btn.soft` 把全站 soft 按钮统一压成中性灰 —— 这条规则本身是对的，「soft」的意思就是「次要」。但课表底部只有这两颗动作按钮，「次要」在这里没有别的更重要的事可让位，一片灰等于没有主次。**只给这一处补回主色，不动全局 `.btn.soft`**：浅色档 `background:var(--n-accent)` + 白字，深色档 `linear-gradient(160deg,var(--n-cyan),#6D57D8)` + `#120C22` 字。
- **「我的」页顶部一根孤立波浪线**。那是 `buildDoodle()` 画的 SVG 三笔（波浪 / 折线 / 五角星），`web/nova-organs.css` 早前按「D 级只许一笔」的设计把后两笔 `display:none` 收掉了。收完剩下的那一笔单独看不像笔触，像误留的装饰。整块 `display:none`；DOM 留着（`sync()` 还要插回去），只是不显示、不占位。
- **「教务学号」一格印的是一句话**。`refreshLoginUI()` 的 `!hasHost()` 分支原来写 `#whoami.textContent = '（需在 App 内使用）'`，而设备铭牌会把 `#whoami` 的 textContent 直接搬进「教务学号」格 —— 于是一个值的位置上放了一句环境说明。改成 `'--'`，环境差异由「登录状态 → 浏览器预览」那一行讲。

#### 六、一处跨版本的旧账：`relText` 抄漏了进位归一化

同一批截图里，「今日一行」的副行印着「最近截止 生物化学 · 还剩 11 小时 60 分」，而下面作业卡印的是「还剩 12 小时」。同一个时刻、两种说法。

原因：`web/learnplus.js` 的 `relText(left)` 是 `web/app.js:671 fmtLeft(h)` 的手抄副本，抄的时候漏了这一段归一化：

```js
let hh = Math.floor(h);
let mm = Math.round((h % 1) * 60);
if (mm >= 60) { mm -= 60; hh += 1; }   // ← 抄丢的就是这行
```

`app.js::fmtLeft` 的注释本来就写着「分钟四舍五入会进位到 60（还剩 25 小时 60 分），这里先归一化再拼字」，抄的人没看见。

改法不是再抄一遍，而是**先借正主，借不到才用副本**：

```js
function relText(left) {
  if (left == null) return '截止未读到';
  if (left < 0) return '已过截止';
  if (typeof fmtLeft === 'function') return fmtLeft(left);
  // …以下为逐行对齐 fmtLeft 的兜底副本（离线测试与单独 require 时用）…
}
```

并把它加进导出表，让测试能直接钉：`return { init, paintToday, paintTarget, todaySummary, undoneText, gpaNeed, relText };`

`tools/test_learnplus.js` 新增第 ⑨ 组，做法是**从 app.js 里抠出真函数来对照**（不是对照副本）：正则取 `function fmtLeft\(h\)\s*\{[\s\S]*?\n\}`，`new Function('return (' + m[0] + ')')()` 造出函数赋给 `global.fmtLeft`，然后跑 23 个边界值 + 扫遍 0~48h 全部 2881 个分钟点，断言两边逐字一致、且绝不出现「 60 分 / 0 分 / NaN / undefined」。

顺带确认**不要一起改**的几处（语义不同，各有各的分档）：`web/learnplus.js:77` 的默认 fmt、`web/nowline.js:184`（还剩 N 分钟下课）、`web/focus.js:279`（秒级）、`web/app.js:5265`（防忘关剩余秒）、`web/waterwatch.js:308 hms(ms)`。

#### 七、这一轮的五个教训

1. **改 CSS 没生效，先找 `!important` 的归属层**。同一个属性在 `app.css` / `nova-skin.css` / `nova-medium.css` / `nova-cyber.css` 里可能有四份，先 `grep` 全部命中再动手。第一、二轮的失败就是在这个上面浪费的。
2. **重拍验证必须固定「改了什么就该变什么」**。三轮里前两轮都重拍了、都看了图、都发现「还是竖排」—— 如果只看「改了代码」就收工，这个 bug 会活到用户手上。
3. **手抄副本一定会走样**。`relText` 抄漏归一化、`syncText` 差点被复制第二份。能借正主就借正主，不能借就提到模块顶层让两边共用。
4. **`data-src` 抠别人的 textContent 是反模式**。上游一改文案，下游的读数就跟着变成一句人话。「我要数字」就该让数据源给数字（`window.__HWSTAT`），格式化放在展示层。
5. **离线夹具注入早于页面自渲染时，被渲染函数覆盖的全局必须「事后重赋」**。`window.__HWSTAT` 被页面自己的 `DOMContentLoaded → renderHomework()` 覆盖成全 0，探针里三个读数一直是 `--`。修法是在 `load` 事件里重跑一次夹具再 `sync()` —— 这恰好复现了真机「打开 → 数据到达 → 器官 700ms 轮询再读一遍」的真实时序。

#### 八、门禁与出包

`tools/check_web.js` 新增 v2.7.0 段 8 条断言（课卡断行三处、`span > 1` 只印结束钟点、`__HWSTAT` 存在、`data-hw` 用自有键、`syncText`/`parseStamp` 各一份、待考口径正则、`.kb-bar-acts .btn.soft` 主色、`.nv-doodle` 已关、`#whoami` 不再放假值、`syncText` 只许出现一次）。

`tools/check_apk_inside.py` 新增 v2.7.0 段 —— 这一版全是 CSS 与文案的小改，最容易「改的是 `web/`、包里的还是旧那份」：断言 `nova-skin.css` 里有 `.kb-bar-acts .btn.soft` 与 `3px 1px 3px 3px !important`、`nova-organs.css` 的 `.nv-doodle{` 后面紧跟 `display:none`、`nova-organs.js` 有 `syncText`/`parseStamp`/`src === 'syncAt' || src === 'hwSyncAt'`、`app.js` 有 `window.__HWSTAT`、`!hasHost()` 分支里是 `'--'`。

出包：`python -X utf8 tools\bump_ver.py 2.7.0 2700` → `python -X utf8 tools\build_apk.py` → `apk/xxmu-helper-v2.7.0.apk` **1057211 字节 `27d48eed9260`**，签名证书 SHA-256 `0e684845…7799` 未变（可覆盖升级）。七道门禁全绿：`check_web` PASS、`check_notes` 7 项 PASS、`check_tutorial` 39 项 PASS、`check_skin` 55 passed、`tools/test_*.js` 47 套 fail=0、`verify_apk` 五件套 PASS、`check_apk_inside` 全 True。

实拍：五 tab × 四组合（nova/classic × light/dark）共 20 张全部重拍，`design/sketch/shots/uix-<tab>-<skin>-<theme>.png`。这一轮还修好了截图脚本自己的测高 bug —— `heightOf()` 原来量 `body.scrollHeight`，而 `web/app.css:115` 是 `#app{overflow:hidden}`、`:177` 是 `main{flex:1;overflow:auto}`，滚动发生在 `main` 里，于是 `body.scrollHeight` 恒等于视口、`me`/`campus`/`wiki` 三页全部被压成 808 高、`me` 页下半截被底部导航压掉。改量 `main.scrollHeight + header.offsetHeight + #tabs.offsetHeight` 之后：`me` 1490、`campus` 1202、`wiki` 1643。

#### 九、真机待看

1. 换 NOVA 皮肤 + 深色档，课表里的课名是不是两行（浅色档与经典皮肤离线已验）。
2. 学习页三格读数是不是「2 / 1 / 15:17」这种纯数字，标签与数字对得上。
3. 有一场「未开考」的考试时，待考那格是不是 1（这一条是真机才有的数据）。
4. 课表底部「AI 改课表」是不是深青绿实底白字（浅色档）/ 紫色渐变（深色档）。
5. 「我的」页最上面还有没有那根灰波浪线。
6. 「本机规格」表里「课表同步 / 作业同步」是不是「15:17」这种短的，长按有没有全称。
7. 「今日一行」副行的「还剩 X 小时 Y 分」与作业卡的时长说法是不是完全一致（重点看 11 小时 59 分 附近）。

### v2.6.0（2026-11-21）—— 成绩自己从教务进来：一条一条试，读到的还是盖着（**本地包 2.6.0 / 2600，未上线；线上实读仍 1.1.97 / 1197**）

触发：档 C。四档构想里最后一档，也是唯一一档「别人拿不到、只有这个 App 能拿到」的东西 —— 成绩本来就在教务服务器上，只是从来没有一条路把它请进来。到 v2.5.0 为止，想用「绩点 / 目标绩点」两个功能，得先在电脑上跑 `core/kingo.py`、把打出来的 JSON 复制到手机上、再粘进成绩面板的导入框。对一个只想看自己绩点的学生来说，这条路的每一段都长得没有道理。

**这一版做的事只有一件：把那段路缩短成两下点击。** 不加新页面，不改成绩的显示方式，不改绩点算法。

#### 一、为什么能这么省事：Cookie 与请求桥早就在了

`web/sync.js` 里的 `netCk(url, method, body, contentType, headers, cookieUrl, referer)` 从 v1.0 就存在，它走 `Host.httpFetchCkAsync`，Java 侧从 `CookieManager.getCookie(cookieUrl)` 现取 Cookie —— 学习通、雨课堂、喜鹊三家的抓取全都建在它上面。教务这套也一样：登录一次之后 Cookie 就在 WebView 的 CookieManager 里，和抓课表用的是同一份。

所以这一版**一行 Java 都没加**。翻 `MainActivity.java` 的 `fetchScheduleHtmlAsync`（2291-2316 行）就是现成范本：带 Cookie + Referer，GET 一个 JSP，把响应原样交回 JS。成绩页要的完全是同一件事。

#### 二、新增 `web/gradepull.js`（16904 字节）

七个 `/* @testable:xxx */` 纯函数，全部可离线测：

- `cellText(html)` —— 去 `script`/`style`/注释，去标签，还原 `&nbsp;/&ensp;/&emsp;/&lt;/&gt;/&quot;/&#39;/&amp;`，最后压空白。教务表格里的中文全是 `&nbsp;` 占位，不还原就是一片豆腐块。
- `rowsOf(html)` —— 按 `<tr>` 切行、按 `<td|th>` 切格。
- `colsOf(cells)` —— **按关键字找列，不按位置**。`scoreAt = find(/成绩|分数/)` 先找，`point = find(/绩点/, skip i === scoreAt)` 后找。这条不是洁癖：青果不同学院导出的表列序不一样，今年「学分/成绩/绩点」，明年可能插一列「考核方式」；更坏的情况是某一版把「绩点」放在「成绩」前面，按位置取就会把 3.7 当成绩、把 87 当绩点 —— 然后绩点算出来还挺像回事。
- `parseGradeTable(html)` —— 找第一行「既有课程列又有成绩列」的当表头；分段表（一学期一张）遇到第二个表头就换列号并 `tables++`；`BAD_NAME = /^(合计|总计|平均|小计|备注|说明|课程名称|课程名)$/` 的行丢掉。返回 `{list, matched, rows, tables, header}`，**`matched === false` 时 `list` 一定是空数组** —— 不允许半张表冒充成绩。
- `looksStale(text, raw)` —— 照 `sync.js` 的 `kbExpired` 收紧版：正文含「凭证已失效」「请重新登录」、含登录表单特征、或短正文里带 `location.href='/'`。
- `isGradeWord(s)` —— 非数字、1~6 个中文/字母/`+-` 就算文字等级（优秀、良好、合格、不合格、通过、不通过、A、B+）。
- `mergeInto(oldList, freshList)` —— 按 `term|name` 对齐合并，返回 `{list, stats:{added, updated, kept}}`。**三条规矩**：新值读得到分就用新值；新值读不出而旧值读得出，**保留旧分**（降级覆盖等于把已经知道的事忘掉）；教务这次没返回的旧课，原样留着。纯函数，不改入参。

网络层两个：`pullOne(path)` 只试一条；`pull()` **顺序试、命中即停**。不并发是刻意的 —— 三个请求同时打到教务，既不礼貌，出问题时也不知道是哪条出的。

#### 三、界面：从「成绩」按钮里长出来

`web/grades.js` 的 `open()` 里，在「全部翻开 / 重新盖上」之后多一颗「从教务读成绩」。点开是一个半框面板（照 `REMINDER.openSettings()` 的范式自建 DOM 塞 `#sh-body`），标题「从教务读成绩」，两颗按钮「读一次」「复制诊断」。

面板上真会写东西：

- 「试过的路径」逐条列出 —— `/student/xscj.stuckcj.jsp?menucode=S40303` · 814 字节 · 读到 6 门；没读到的写没读到的原因（框架页 / 凭证失效 / 表头里没有成绩列）。
- 成功：`读到 6 门 / 来自 … · 2 门是文字等级` + `合并后一共 7 门：新增 6 门、更新 0 门，教务没返回的 1 门原样留着。` + 一颗「写入成绩（默认盖着）」。
- 失败：凭证失效就说「先去「登录教务」重登一次」；三条都不通就说「把上面的「复制诊断」发过来就能对」。

**读完不自动展开。** 分数是隐私，成绩面板本来就有「全部翻开 / 重新盖上」这一层，从教务读进来也一样默认盖着 —— 用户自己决定什么时候在什么场合翻开。

#### 四、文字等级绝不换算

成绩里有「优秀 / 合格 / 不及格 / 通过」这类文字等级。把「优秀」硬映射成 95、把「合格」映射成 75，绩点立刻就能算得很漂亮 —— 但那个绩点是编的。这一版的选择是：**原样保留，`scoreOf` 照旧判成 null，`computeGpa` 照旧把它算进 `unknown` 而不是 0 分**。面板底部明写一句「换算出来的绩点看着专业，其实是编的。想按自己的口径算，可以把它们改成数字再「导入成绩 JSON」」。

`tools/check_web.js` 为此加了一条反向断言：`/优秀['"]?\s*[:=]\s*\d/` 一旦出现就判红。

#### 五、七个坑与教训

1. **`XXMU.netCk` 的第三个参数是 body** —— 写 `netCk(url, 'GET')` 会让 body 变 `undefined`，Java 侧 `Http.request` 收到 null 走 GET 分支没意见，但换个方法就出事。四条空串要写齐。
2. **`decodeAuto` 是按字节还原的，不是 `TextDecoder('gbk')`** —— 它先按 UTF-8 fatal 试、失败再按 charCode&0xff 还原字节后按 GBK 解。测试夹具造 HTML 必须走 `TextEncoder` → `String.fromCharCode`，不能直接拿 JS 字符串当响应体。
3. **夹具里 `QUIET` 必须注入在正文脚本之前** —— `QUIET` 会 `clearTimeout(1..20000)`，排在后面就把正文自己那两处 `setTimeout`（点按钮、测高）清掉了。第一版实拍 15183 字节、图里只有一个空面板，就是这个原因。
4. **皮肤/主题必须在 `<head>` 后立刻写 localStorage** —— `nova-skin.js` 在文档很靠前的地方就跑起来并按 pref 设 `data-skin`。只在末尾改 attribute 会被它覆盖回默认，四档会得到四张一模一样的图。
5. **测高 JS 必须写进 `wrap()` 的数组参数** —— 字符串拼接会漏掉闭包，那段 JS 被当纯文本渲染到页面上（v2.5.0 踩过一次，这次直接照定案写法写）。
6. **找绩点时必须跳过已经被认成「成绩」的那一格** —— 两者都含「绩」字的表头（例如「成绩(绩点)」）会让两个索引指到同一列，结果就是绩点顶替成绩，算出来的绩点还挺像回事。`skip i === scoreAt` 就是让两个索引永不合流。
7. **测试第一版数错行** —— `HTML_A` 我写「六行」实际七行（漏了学号那一行）。这类「产品对、断言错」的红要改断言，不是改产品。

#### 六、测试与门禁

- 新增 `tools/test_gradepull.js`：6 组 65 项。含「`matched === false` 时 list 必须是空数组」「文字等级原样留着不变成数字」「`mergeInto` 不许改入参」「新值 0 学分保留旧学分」「源码里不许出现 `cells[2-9]`」。
- `tools/test_*.js` 46 → **47 套，全过**。
- `tools/check_web.js` 加 v2.6.0 段 19 条：不许 fetch/XHR/POST、必须走 `XXMU.netCk(`、三条候选路径齐全、域名正确、不许把文字等级映射成数字、`index.html` 里 `gradepull.js` 必须在 `grades.js` 之后 `app.js` 之前、双皮肤都有 `.gp-row`/`.gp-sum`。
- `tools/check_apk_inside.py` 加 v2.6.0 段：读 `assets/gradepull.js` 断言七个函数名、三条路径、`XXMU.netCk(`、无 POST/fetch、以及 `grades.js` 真挂了按钮。
- 教程契约双写：`TUT_CONTENT_VER` 8→9、`TUT_FEATURES` 加 `'gradepull'`（24 条）、「课」页 `since: '2.6.0'` 正文 6→9 条；`docs/handoff/tutorial-contract.json` `version` 8→9。
- 出包：`apk/xxmu-helper-v2.6.0.apk` 1053115 字节 `a7453da854ec…`，签名与历史一致（可覆盖升级）。**未上线**，`cfg.latest` 一个字没动。

#### 七、真机待看

1. 教务没登录时点「从教务读成绩」，面板是不是明说「先去登录」而不是三条都报「读不到」。
2. 真的登录后读一次，读到的门数与学生自己数的对不对；`2 门是文字等级` 的数字对不对。
3. 分段表（一学期一张）的年份学期是否都进来了，`tables` 大于 1 时列有没有串。
4. 教务里有重修课（同名不同学期）时，合并是按 `term|name` 对齐的，会不会把两门并成一门。
5. 面板上「试过的路径」那条 800 多字节的数字，是不是真的等于教务返回的字节数。
6. 读进来之后回成绩面板，是不是还盖着（不能被自动翻开）。

#### 八、没做的事

- 没做「自动定时读」——读一次是用户明确的动作。定时读等于后台反复打教务，而且成绩出来本来就没那么频繁。
- 没做「按绩点反查哪门课拖后腿」这种分析。数据够了，但那是另一个功能。
- 没做「导出给同学」。成绩是个人信息。

### v2.5.0（2026-11-21）—— 你的数据能带走了：设置里多一行「备份与导出」（**本地包 2.5.0 / 2500，未上线；线上实读仍 1.1.97 / 1197**）

触发：档 D。四档构想里这一档排第三，但它是唯一一档「不加任何新功能、只是把已有的东西交还给用户」的活。到 v2.4.0 为止，课表、待办、专注记录、成绩、饮水机清单、自己发的 WIKI，全部只存在一台手机的 SharedPreferences 里。换手机、清数据、重装、卸载重登，一样都带不走，而界面上从来没有一句话提过这件事。这不是功能缺失，是**没有出口**。

### 改了什么

新增 `web/export.js`（18455 字节）：

- `FORMAT = 1`、`K_LAST = 'xxmu_export_at'`、`MAX_VALUE = 512 * 1024`（单个键超过半兆就不进备份，进 `skipped` 并写明原因——静默丢一行比报错更坏）。
- `SECRET` 23 个键，四类，**永远不导出**：第三方登录态（`xxmu_water_token` / `xxmu_water_uid` / `xxmu_ykt_auth` / `xxmu_zhs_auth`）、教务账号与原始页面（`xxmu_acct_cx` / `xxmu_acct_kb` / `xxmu_cx_homework` / `xxmu_cx_at`）、票据与密钥（`xxmu_license` / `xxmu_license_id` / `xxmu_ticket` / `xxmu_ticket_exp` / `xxmu_admin_key` / `xxmu_fp` / `xxmu_verified` / `xxmu_role`）、纯游标（`xxmu_upd_at` / `xxmu_upd_skip` / `xxmu_upd_mute` / `xxmu_export_at` / `xxmu_last_check` / `xxmu_notice_seen` / `xxmu_disc_done`）。
- `PICK` 40 个键的**白名单**。为什么不用「扫所有 `xxmu_` 前缀」：扫前缀看着省事，但哪天有人加了新键（尤其哪个平台的 token），它会自动进备份文件，而备份文件是会被发到群里、发到网盘、发到别人手机上的。白名单每加一个键都要人想一次「这个能不能给出去」，这个摩擦是有用的。
- `/* @testable:buildBackup */ buildBackup(now, read)`：`read` 可注入（测试用），每键单独 try/catch——一个键读崩了不该让整份备份生不出来；`SECRET` 在循环里再挡一次（双保险，防止哪天有人把敏感键误加进 `PICK`）；空串跳过不占位；另外用 `Host.cachedSchedule()` / `Host.cachedHomework()` 把两个原生缓存文件原文也带上。
- `/* @testable:countOf */ countOf(data)` 与 `/* @testable:summary */ summary(b)`：「可导出：3 条待办 · 10 天专注记录 · 3 门成绩 · 2 台饮水机 · 1 条我发的 WIKI」——**先让人看清有什么，再让人决定要不要**。空机写「这台手机上还没有可导出的数据：先登录教务同步一次课表，或者加几条待办再来。」
- `stamp()` 用本地时间拼 `YYYY-MM-DD HH:mm:ss`，**不用 `toISOString`**：那是 UTC，东八区会显示成早上五点，用户看着像坏了。
- `saveFile()` **严格读 `"OK:"` / `"ERR:"` 前缀**再判断成败。这里特意不写 `if (Host.clip(text))` 那种写法——v2.0.0 的 `learnplus.js:139` 就是栽在这上面：`Host.clip` 在 Java 侧是 `public void`，JS 侧恒为 `undefined`，判断永远假，功能靠兜底才没坏，但逻辑是错的。
- `copyText()` 三级降级：`Host.clip` → `navigator.clipboard.writeText` → 临时 textarea + `execCommand`，**每一级都读结果**，全败时把字符数报出来（「复制不了（文本 4210 字符）。试试「导出为文件」」）。
- `openPanel()` 复用 `REMINDER.openSettings()` 那套半框范式（`#sh-body` / `#sh-name` / `#sheet` + `parkTools()`），不新开页面。
- 末尾自启动守卫写 `if (typeof document !== 'undefined' && typeof module === 'undefined')` ——**绝不能写 `!module.exports`**，v2.0.0 的 learnplus 就是那样写的，浏览器里 `module` 未定义直接 ReferenceError，而且抛在 try 外面，整个 `init()` 从来没跑过。

Java 侧新增一条桥（`android/src/com/xxmu/helper/MainActivity.java`）：

- `Host.exportText(String name, String content)`（779 行）→ `MainActivity.this.exportTextFile(...)`（145 行）。**必须写在 `class Host` 的花括号里**，写外面就成了 MainActivity 的方法，JS 侧 `typeof Host.exportText === 'function'` 恒假、静默退回（v0.9.3 那三个 HTTP 方法踩过一模一样的坑，注释里留着）。
- 落盘策略：API 29+ 走 `MediaStore.Downloads` + `RELATIVE_PATH = "Download/河医大助手"` + `IS_PENDING 1→0`——**这条路不需要任何存储权限**，Manifest 里一条都没加。API 24–28 没有 `RELATIVE_PATH`，写公共下载目录要 `WRITE_EXTERNAL_STORAGE`，本工程从不为一次导出让所有用户常驻一条权限，所以退回 `getExternalFilesDir(DIRECTORY_DOWNLOADS)`，面板上写出完整路径。
- 失败一律 `"ERR:"` + 一句人话（「建不了导出目录」「写文件失败（可能是磁盘满了）」）；系统下载目录写失败但私有目录成功时，返回 `"OK:路径（系统下载目录没写成：…）"`，**半成功也要说清**，不能让人以为文件在下载目录里。

页面与样式：

- `web/index.html`：设置页「数据与更新」卡里，`#rowUpd` 之后、`#resync` 之前插 `#rowExport`「备份与导出 ›」。这两个动作是一对（一个进、一个出），挨着才想得起来。`<script src="export.js">` 排在 `app.js` 之后（`openPanel` 要调 `parkTools`），`nova-organs.js` 之前。
- `web/app.css` +4 条、`web/nova-skin.css` +7 条双皮肤。经典皮肤里成功**不加绿色**——牛皮纸上再多一种「成功绿」只会更花。

### 实拍抓出来的一处排版问题（产品代码真改了）

第一版面板里「这份备份」那块直接用了 `.row`（`display:flex;justify-content:space-between` + `.row .v{text-align:right}`）。实拍一看：「可导出：3 条待办 · 10 天专注记录 · 3 门成绩 · 2 台饮水机 · 1 条我发的 WIKI」被右对齐折成两截，读起来像两行不相干的字。

改成独立的 `.ex-stat` 卡片：`.ex-cap`「这份备份里有什么」+ `.ex-sum` 让长句左对齐、`line-height:1.55`、数字 `tabular-nums`。骨架类的东西（`.row`）是为「左边名目、右边一个短值」设计的，一句话塞进去必然错位——这条以后遇到「长句进列表」都要先想起来。

### 实拍夹具踩的三个坑（都记下来）

`design/sketch/_shot_export.js`，出四张 390 宽、**高度随内容**的图（372 / 372 / 408 / 408）。

1. 第一版想「藏掉设置页只留面板」，写 `#app{display:none}` → **整张图全白**。原因：`#sheet` 是 `#app` 的子节点（`index.html:1168`），不是兄弟。藏父等于藏子。
2. 第二版改 `visibility:hidden` + `#sheet{visibility:visible}` → 面板出来了，但上边留了 570px 空白（`#app` 的 padding 和 min-height 还在）。
3. 定案：`#app` 归零（height/padding/margin/border/background/overflow 全清）+ `#app > *:not(#sheet){display:none}` + `#sheet` 从 `fixed` 改 `static`、去 `backdrop-filter`、`max-height:none`。这样面板就是一张普通文档流里的卡。
4. 截图高度改成自适应：注入的脚本在 260ms 后读 `#sheet .sh-box` 的 `getBoundingClientRect().bottom`，写进 `data-shot-h`；外层先用 `--dump-dom` 跑一次拿到这个值，再决定 `--window-size` 的高。**不要为了省事把这段 JS 拼进字符串**——拼错一层闭包，它会被当纯文本渲染到页面上（第一版图上就出现过一行 `setTimeout(function(){ try { var box = ...`）。

### 测试

新增 `tools/test_export.js` → **72 项全过**。8 组：白名单形状与 12 条敏感键不在 `PICK`；`PICK ∩ SECRET` 必须为空；`buildBackup(FIXED, reader(store))` 的形状与 counts；**敏感值绝不出现**（连「把敏感键临时塞进 PICK」都要被 `SECRET` 挡住）；读坏的键进 `skipped`（`ok:false` 与抛异常两条都测）；空机说人话；`summary` / `fileName` / `stamp` / `stampFile` 精确值；源码纪律。

第八组有一个反复踩的坑：**源码纪律断言必须先剥注释再判**。文件头注释里正在解释「绝不能写 `!module.exports`」「不要用 `toISOString`」「不要写 `window.APP_VERSION`」，直接 `indexOf` 会把说明文字判成违规。这已经是第三次（v2.1.0 的 `check_apk_inside`、v2.5.0 的 `check_web` 各一次）。

`tools/check_web.js` 新增 v2.5.0 段 21 条；`tools/check_apk_inside.py` 新增一段（`assets/export.js bytes = 18873`、dex 里真有 `exportText` 桥与 `MediaStore` 写入）。

### 门禁（全绿）

`check_web` PASS（含 v2.5.0 段 21 条 + 备份导出离线测试 PASS）；`check_notes` 7 项 PASS（`apk/v2.5.0.notes.txt` 821 字八条）；`check_tutorial` 39 项 PASS（`TUT_CONTENT_VER` 7→8、契约 `version` 7→8、新增 feature `exportdata`）；`check_skin` 55 passed；`verify_apk` 五件套 PASS；`check_apk_inside` 全 True；`tools/test_*.js` **46 套全过**（45→46）。

### 出包

`python tools/bump_ver.py 2.5.0 2500` 三处同步 → `apk/xxmu-helper-v2.5.0.apk` **1044858 字节** `c7c724d95b98…`，`assets 已同步 (53 个文件)`（50→53），签名证书 SHA-256 `0e684845…7799` 不变，可直接覆盖升级。

### 没有做的事（有意的）

- **没有导入**。只有导出、没有还原，是半套。真要做导入要处理「合并还是覆盖」「旧版本备份字段不认识怎么办」「导入的成绩要不要覆盖手输的」三个冲突问题，每一个都能做出错数据。先把出口打通，入口等有人真的换手机了再说。
- **没有云**。这份备份是一份文件，存哪由用户决定（发给自己、放进网盘、拷到电脑）。App 不碰任何服务器，导出过程零网络请求——`check_web` 里专门有一条断言 `export.js` 里不许出现 `fetch` / `XMLHttpRequest`。
- **没有把课表缓存格式当协议**。`schedule_cache` / `homework_cache` 原样带出来，但备份的 `FORMAT` 只管 pref 那一层；缓存格式变了不影响备份能不能读。

### 真机待看

1. Android 10 及以上点「导出为文件」，手机「文件」App 里能不能在「下载 / 河医大助手」下找到那个 JSON。
2. Android 9 及以下有没有真的退到私有目录、面板上那条完整路径能不能照着找到文件。
3. 导出成功后面板是不是只显示一行路径、按钮没有卡在禁用态。
4. 断网时导出是否照样成功（应当照样成功，全程不发请求）。
5. 复制成文本在真机上粘到微信/备忘录，中文与换行是否完整。
6. 换一台手机按这份 JSON 手工核对：待办条数、专注天数、成绩门数对不对得上。

### v2.4.0（2026-11-21）—— 专注计时下面多一排柱子：最近 14 天你到底学了多少（**本地包 2.4.0 / 2400，未上线；线上实读仍 1.1.97 / 1197**）

触发：用户原话「别一项一项做，把你能想到的有用的东西，有提升的东西都做出来，一直做就行」。这是四档构想之外的**第五块真空**里的第一件——`web/focus.js` 从 v0.x 起就把每次专注按天累进 `state.log['YYYY-MM-DD']`，保留 90 天，但**全库没有一处界面读过这个 log**：`stats()` 只吐「今日 / 本周」两个数，那 13 天就白记了。

### 改了什么

`web/focus.js`（504 → 618 行）

- 加 `const HIST_DAYS = 14;`（柱状图显示最近多少天；14 天两周一屏刚好）。
- 加 `dayBase(iso)`：把 `'YYYY-MM-DD'` 解析成本地零点 Date，解析不出来退回今天。用本地零点而不是 `new Date(iso)`，因为后者按 UTC 解析，东八区会整体偏一天。
- 三个带 `/* @testable:xxx */` 标记的纯函数：
  - `histo(log, n, endIso)` → 最近 cnt 天 `[{key, min, level}]`，**按时间正序**。`level` 按**窗口内最大值**归一（`Math.min(4, 1 + Math.floor(x.min / max * 4))`），0 分钟恒为 0。窗口参数夹取：`const want = Math.round(Number(n)); const cnt = Number.isFinite(want) ? Math.max(1, Math.min(MAX_LOG_DAYS, want)) : 14;`。
  - `streak(log, endIso)` → 连续天数。**今天还没开始不算断**（`if (i === 0) continue;`）——昨晚学了、今晚十点还没坐下，不该显示「连续 0 天」。
  - `peakOf(log, n, endIso)` → 窗口内最大的一天 `{key, min}`，空时 `{key:'', min:0}`。
- `paintHisto(state)`：往 `#focusHisto` 里画 14 根 `<i class="fh-bar fh-lN">`，`title` 写「日期　N 分钟」；高度按本窗口最大值归一、最低 12%；**0 分钟那天改 class `fh-bar fh-zero`、height 0 加一条 2px 细线**，不是空白。`#focusHint` 写「最近 14 天专注 N 分钟 · M 天有记录」，连续两天以上再追加「连续 K 天」。
- `paint()` 里接上 `paintHisto(state)`；导出加 `histo, streak, peakOf, paintHisto, HIST_DAYS`。

`web/index.html` +2 行（`#focusStat` 之后）：`<div class="focus-histo" id="focusHisto" aria-hidden="true">` + `<div class="focus-hint" id="focusHint">`。

`web/app.css` +12 行、`web/nova-skin.css` +22 行：两套皮肤的柱子。经典档是铅笔柱（`--accent` 按 level 调透明度 .34/.52/.72/.95）；NOVA 档是 HUD 迷你频谱（主色 + 四档透明度，深色档走 `--n-cyan`，而该令牌在深色档已被重定义成 `#9E8CFF`，所以深色档是紫罗兰 —— 见下面「一个不是 bug 的颜色」）。

### 测试：先抓住一个真 bug

新建 `tools/test_focuslog.js`（7 组 46 项）。做法与 `test_nowline.js` / `test_hwremind.js` 一致：`cut(src, name)` 按花括号配平切真函数 + `vm.createContext`，并把 `todayIso` 的函数体开头替换成 `if (!d) d = new Date(2026, 10, 21, 15, 30, 0);` 来钉死「今天」，否则断言会随跑测试的那天漂移。

首轮 39 pass / 5 fail，其中**只有一条是产品 bug**：

```
✗ 4.4 n=0 夹到 1 条  →  got 14
```

`histo` 原来写 `Math.round(Number(n) || 14)`，n=0 时 `0 || 14` 得 14，于是「只要 1 天」会被当成「要 14 天」。改成先 `Number.isFinite` 判定再夹取。这条只在传 0 时出现，线上永远传 `HIST_DAYS`，属于测试才打得出来的边界。

另外四条是我自己断言写错，产品没动：`peakOf` 取的是**窗口内**最大，我按「全库最大」写期望（14 天窗口从 11-08 起，所以 11-10 的 200 分钟就是正确答案；7 天窗口从 11-15 起，答案该是 11-18 的 95）；`7.5` 断言写成 `/histo:\s*histo/`，但导出表是短属性名 `histo, streak, peakOf, paintHisto,`。

### 一个不是 bug 的颜色

第一次看 NOVA 深色档截图，柱子是紫的，我以为 `html[data-skin="nova"][data-theme="dark"] .fh-bar{background:var(--n-cyan)}` 没生效。查下来 `web/nova-skin.css:419-420` 写着：

```css
/* 紫色升为主光：深色档的 cyan 变成紫罗兰青 */
--n-cyan:#9E8CFF;  --n-coral:#FF6E8F;
```

也就是深色档的 `--n-cyan` 本身就是紫色。这是皮肤既有口径（同一令牌在深色档跟着片子换色相），不是写错。我把注释改成说明这件事，代码不动。

### 实拍抓到的真问题：`.focus-face::after` 刻度压字

出图后放大一看，提示文字下面浮着一排小竖线，紧贴着「连续 5 天」。

用四步把它指认出来，没有靠猜：

1. `_diag_focus.js` 量盒子 → `hist=593,42 | hint=643,14`，柱状图高 42、文字高 14，两者不重叠，所以不是布局挤。
2. `_diag_focus2.js` 逐个报 `.focus-face` 的子节点 → `focusPhase@490h12 / focusTime@514h47 / focusStat@567h12 / focusHisto@593h42 / focusHint@643h14`，到 656 就结束了。
3. `_diag_focus3.js` 沿 `elementsFromPoint(60, y)` 每 2px 走一遍 → 644–656 是 `DIV.focus-hint`，656–668 是同属 `DIV.focus-face` 的空白。**刻度不在任何真实元素里。**
4. `_diag_focus4.js` 问每个祖先的 `::before` / `::after` 的 `content` → `.focus-face::after{content:""; background:repeating-linear-gradient(90deg, rgba(234,246,250,.28) 0 1px, transparent 1px 9px); height:6px}`。找到了，在 `web/nova-organs.css:1129`。

那条刻度尺（「专注仪表」的量程刻度，`position:absolute;bottom:6px;height:6px`）原本压在 `#focusStat` 下面的空白里。我把柱状图塞进 `.focus-face` 之后，面变高、`#focusHint` 成了面内最后一行，刻度正好落在字底下。**这是我这次改动引入的视觉冲突，不是既有 bug。**

修法：`web/nova-organs.css` 的 `html[data-skin="nova"] .focus-face` 底部留白 `10px → 26px`，把刻度留在面板底部的空白里，语义仍是「仪表量程」。

### 「测试没发现字段名错」的同类风险，这次提前堵了

v2.3.0 踩过 `room` / `name` 字段名，测试和产品一起错还全绿。这次 `histo` 的入参就是 `state.log` 本身（`{ 'YYYY-MM-DD': 分钟 }`），形状由 `merge()` 的 `/^\d{4}-\d{2}-\d{2}$/` 正则唯一决定，没有第二个字段名可错；测试里的 log 也直接写成那个形状，不再另造一层。

### 门禁

- `node tools/check_web.js` → `[PASS] 静态体检全部通过`（新增 v2.4.0 段 10 条，含「histo 体内不许 localStorage」「paintHisto 要接收 state」，末尾 spawn 跑离线测试并打印 `专注记录离线测试 = PASS`）
- `node tools/check_notes.js` → `[PASS] 发版说明 7 项全过`
- `node tools/check_tutorial.js` → `[PASS] 教程契约 39 项全过`（`TUT_CONTENT_VER` 6→7、`TUT_FEATURES` 加 `focuslog`、契约表 `version` 6→7）
- `node tools/check_skin.js` → `check_skin: 55 passed, 0 failed → PASS`
- `python -X utf8 tools/verify_apk.py` → `[PASS] 五件套全部通过`
- `python -X utf8 tools/check_apk_inside.py` → 全 True（`assets/focus.js bytes = 21855`，`has histo/streak/peakOf/paintHisto`、`HIST_DAYS is 14`、`paints into #focusHisto`、`keeps zero-day baseline` 全 True）
- `tools/test_*.js` → **45 套 pass=45 fail=0**（44→45）

出包：`python -X utf8 tools\bump_ver.py 2.4.0 2400` → `python -X utf8 tools\build_apk.py` → `apk/xxmu-helper-v2.4.0.apk` **1036604 字节**，签名证书 SHA-256 `0e684845…7799`（可覆盖升级）。**未上线**：`cfg.latest` 一个字没动，线上仍 1.1.97 / 1197。

### 四档实拍

`design/sketch/_shot_focuslog.js` → `v240-focus-{nova,classic}-{light,dark}.png`（各 390×900），`design/sketch/_sheet_focuslog.py` 拼成 `_v240_focus_overview.png`（1610×944）。

图上真渲染：`25:00` / `今日 70 分钟 · 本周 310 分钟` / 14 根柱子（含两根贴底细线，对应两个 0 分钟的日子）/ `最近 14 天专注 595 分钟 · 12 天有记录 · 连续 5 天`。595 = 种子数据的实际和，不是编的。

**专注卡在 `#toolPark` 里**（`display:none` 的停车场），只有 `openToolCard('focusCard')` 会把它搬进 `.sh-box` 并触发 `FOCUS.paint()`（`web/app.js:2794`、`2813`）。实拍夹具必须调那个函数，不能原地去掉 `display:none` —— 原地去掉的话卡片会以 tab 内联样式渲染，跟真机上半框的观感完全两回事。这条写进夹具注释，免得下次又试错。

### 真机待看

1. 真机上专注满 25 分钟后，柱子是否立刻长高一格（`addLog` → `save` → `paint` 这条链在 `FOCUS.pause()` 里）。
2. 换手机/清数据后柱子是否全变成贴底细线（`state.log` 只在本机，不跟着账号走 —— 这是有意的）。
3. 90 天滚动之后最早的柱子是否正常退出（`addLog` 里裁切；短期内看不出来，属于长期观察项）。
4. NOVA 深色档柱子是紫色 —— 这是 `--n-cyan` 在该档的定义，不是显示异常，验收时不要当 bug 报。
5. `.focus-face` 底部现在多留 16px 空白，真机上量程刻度是否仍稳稳落在面板底部（改之前它压在字上）。

---

### v2.3.0（2026-11-21）—— 课表顶上多一行「现在」：正在上什么、还剩几分钟下课、这一节哪几间教室空着（**本地包 2.3.0 / 2300，未上线；线上实读仍 1.1.97 / 1197**）

触发：用户原话「别一项一项做，把你能想到的有用的东西，有提升的东西都做出来，一直做就行」。这是四档构想里的**档 B**。

### 为什么是这一行

课表页原来的第一屏是：一行状态条、然后就是那个 16×7 的网格。想知道「现在上什么」得自己拿当前钟点去数格子，还得记得今天是周几。这不是难，是**每次都要重算一遍**，一天重算十几次。

而「现在」这个问题的答案，全部已经在内存里了：`blocksOf(day, week)` 早就把当天该上的课算成分块（连堂合并、重叠占位都处理过），`TIMES` 有每一节的上下课钟点，`KFREE.state()` 有教务那份教室占用矩阵。**数据齐、就是不给人看。**

### 新增 `web/nowline.js`（11390 字节）

`const NOWLINE = (() => { ... })();`，导出 `{ init, paint, nowInfo, roomNow, roomsText, parseSeg, currentPeriod, fmtHM }`。三个纯函数带 `/* @testable:xxx */ ... /* @end */` 供测试切片：

- `parseSeg(seg)` —— `'08:00~08:45'` → `{s:480, e:525}`（分钟数）。分隔符认 `~ - ～ – —` 五种（教务后台导出的分隔符历史上变过）。终点不晚于起点、或超出 0~1440，一律 `null`。
- `nowInfo(blocks, times, nowMin)` —— 返回 `{has, cur, next, unknown, over}`。三条规矩：
  1. **连堂块的下课时间取最后一节的**。`periods:[1,2,3]` 合并成一块，不能拿第 1 节的 `08:45` 说「还剩 5 分钟下课」。
  2. **课间那 10 分钟仍算在这一块里**（`nowMin < e` 而非 `<= s` 之类）。学生体感是「还在上这门课，中间歇一会儿」，说成「已下课」会被当成 bug 报上来。
  3. **任一节读不到钟点就 `unknown = true`，且永不判 `over`**。宁可写「今天的课钟点还没同步」，也不猜「今天的课上完了」。
- `roomNow(rooms, day, p)` —— 数这一节哪几间空。**故意不给「空」兜底**：某间教室 `g[String(p)]` 这一行不存在（教务只给了部分节次）算 `unknown`，不算空。`free` 按座位数降序 —— 大教室先出现，学生要的是「能坐下」。
- `roomsText(r, p)` —— 四句话：`还没查过（点右边按钮查）` / `这一节的教室数据教务没给` / `第 N 节全被占了` / `A101、B202 等 N 间`（≤3 间全列，多了写「等 N 间」）。
- `currentPeriod(times, nowMin)` —— 按钟点反查现在第几节。课间停在上完那一节；没到第一节返回 0。
- `paint()` —— 画面四态：`now`（正在上，主色点 + 竖痕）/ `next`（下一节几点）/ `warn`（数据读不到）/ `''`（没课）。无课时写「今天没有课」，全上完写「今天的课上完了」，钟点缺写「今天的课钟点还没同步」。
- `init()` —— 绑 `#nowFree`（→ `KFREE.open()`）、画一次、排下一次、监听 `visibilitychange`，并且**包一层 `window.__onResume` 保留原回调**（不覆盖 v1.1.81 那个自动刷新的钩子）。
- `schedule()` —— **递归 `setTimeout` 60 秒**，不是 `setInterval`。`document.hidden` 或 `CUR_TAB !== 'kb'` 就**不排下一次** —— 切到别的页、App 在后台，这个定时器就该停，没必要每分钟唤醒一次 WebView。`tools/check_web.js` 里有反向断言盯着这两条（`/setInterval\s*\(/` 和 `/(fetch|XMLHttpRequest|Host\.http)\s*\(/` 一出现就红）。

### `web/index.html` 两处

1. `#tab-kb` 里、`#kbBar` 之后 `#grid` 之前插 `#nowLine`：`.nl-top`（`.nl-dot` + `#nowMain`）、`#nowSub`（`hidden` 控制）、`.nl-rooms`（`#nowRooms` + `#nowFree`「查空教室」）。放在网格上方而不是并进 `#kbBar` —— 那条是「有没有数据」的状态条，语义不同，混在一起以后谁都不敢动。
2. `<script src="nowline.js">` 插在 `learnplus.js` 之后、`nova-organs.js` 之前。它要用 app.js 的 `DATA`/`TIMES`/`PERIODS`/`blocksOf`/`weekOf`/`CUR_TAB`，也要用 free.js 的 `KFREE`。顺序错了就是 `undefined`，不报错、功能静默消失 —— 所以 `check_web.js` 里做了 `idx(app.js) < idx(nowline.js) < idx(free.js)` 的顺序断言。

### 双皮肤样式

`web/app.css` +45 行：`.now-line` 沿用 `.today-line` 那套牛皮纸便签（不等圆角 `5px 2px 6px 3px / 3px 6px 2px 5px`、硬投影 `1.5px 1.5px 0`、左侧 3px 竖痕按 `data-tone` 换色）。
`web/nova-skin.css` +65 行：白瓷读数条（`--n-surface` + 1px 弱线 + 2px 主色竖痕 + `--n-elev-1`），`#nowMain` 用 `font-variant-numeric: tabular-nums` 让「还剩 25 分钟」换数字时不跳；深色档换玻璃片 `rgba(255,255,255,.05)` + 青色竖痕。

### 两个真 bug（都是我自己写出来、被测试和实拍抓到的）

**① `FREE` 变量名撞车 —— 最阴的一个。** 第一版 `freeRooms()` 里写 `FREE.state()`，抄的是以为的名字。全库有两个像的东西：`web/free.js:1341` 的 `const KFREE`（教务真实矩阵，有 `state()`）和 `web/water.js:31216` 的 `const FREE`（老的「本机按课表估算版」，只有 `allRooms`/`busyRooms`/`compute`，**没有 `state()`**）。后果是 `typeof FREE === 'undefined' || !FREE || !FREE.state` 成立 → 每帧 `catch` 掉返回 `[]` → 界面永远「空教室　还没查过」，**不报错、不崩、永远不出数据**。是 `design/sketch/_dbg_now.js` 把 `document.title` 写成 `SET ERR FREE.state is not a function` 才抓住的。修法：11 处 `FREE` 全改 `KFREE`，并在 `tools/test_nowline.js` 加反向断言 `!/FREE\s*\./.test(SRC)` 与 `!/typeof FREE/.test(SRC)` —— 这类撞名光看代码是看不出来的，只能靠断言钉住。

**② 教室字段名是 `room` 不是 `name`。** `roomNow()` 原本读 `r.name` 拼名单，但 `web/free.js:204` 的 `parseMatrix()` 产出的是 `{ room, type, seats, g, bang }`。真机上每间教室 `name` 都是空串 → 永远显示「空教室　N 间」而说不出是哪几间。**而我的 62 项测试因为夹具也用了 `name` 而全绿** —— 测试和产品一起错了同一个字段名。修法：`name: (r && (r.room || r.name)) || ''`，两个都认（防以后有人改回 `name`），并在测试里补两条用 `room` 字段的断言（64 项）。

### 一条被确认为「产品更对」的测试红

`tools/test_nowline.js` 第一轮 11 项失败，全部是我自己断言写错、**产品代码一行没改**：课间该不该算在块内、`room.g['3']` 的下标是周几、`roomsText` 的入参是 `roomNow` 的产物、`currentPeriod` 的边界、以及自启动守卫那两条 —— 对原文直接 `indexOf` 会把注释里「不要写 `!module.exports`」也数进去，必须先剥注释再判。同类坑此前在 `check_apk_inside.py`（waterwatch 段）踩过一次。

另外 `tools/test_remind_modes.js` 有两条 v2.2.0 遗留的红：断言钉死了单行 `MODE_ALARM.equals(mode) ? CHANNEL_ALARM : CHANNEL_SILENT`，而 v2.2.0 已经把四分通道抽成 `final boolean loud = MODE_ALARM.equals(mode)` + `chId` 三元。改成断言 `loud` 变量 + `new Notification.Builder(context, chId)`（建 channel 与用 channel 同源，这才是要保的性质）。

### 门禁

- `node tools/test_nowline.js` → **64 项全过**
- `tools/test_*.js` 共 **44 套**，`pass=44 fail=0`
- `check_web.js` `[PASS]`（v2.3.0 段 15 条 + `现在一屏离线测试 = PASS`）
- `check_notes.js` 7 项 `[PASS]`；`check_tutorial.js` 39 项 `[PASS]`（契约 version 5→6、`TUT_CONTENT_VER` 5→6、新增 `nowline` feature）
- `check_skin.js` 55 passed；`verify_apk.py` 五件套 `[PASS]`；`check_apk_inside.py` 全 True（`assets/nowline.js = 11390`）
- `apk/xxmu-helper-v2.3.0.apk` **1032508 字节**，签名证书 SHA-256 `0e684845...7799` 与历史一致（可覆盖升级）

### 四档实拍

`design/sketch/_shot_nowline.js` + `_sheet_nowline.py`，390×900 × 四档拼成 `_v230_nowline_overview.png`（1610×944）。图上真渲染：`● 系统解剖学 · A201` / `还剩 25 分钟下课` / `空教室　3401、3301` / 右侧「查空教室」，网格里同时能看到周五第 3 节那门课。

实拍踩到的两件事：
1. **必须冻结时钟**。不冻结的话深夜跑图出来是「今天的课上完了」，看着像 bug 其实是当下真的没课。`CLOCK` 段在 App 脚本之前替换 `window.Date`，钉在 09:50。
2. **`FakeDate` 的七参 spread 会造出 Invalid Date**。第一版写 `super(a[0],a[1],...,a[6])`，于是 `new Date(2026,10,16)` 后面五个是 `undefined` → `mondayOf()` 拿到 Invalid Date → 周次条显示「第 1 周　NaN/NaN - NaN/NaN」。改成 `if (a.length === 0) super(T); else super(...a);` —— 与 `test_hwremind.js` 那次「夹具吃掉参数」是同族 bug，方向相反（那次吞参数，这次补了多余参数）。
3. 空教室矩阵要按「今天」算：写死 `[1,1,1,0,1,1,1]`（周四空）在别的星期跑就变成「第 3 节全被占了」。改成运行时用 `(getDay()+6)%7` 决定哪一格置 0。

### 真机待看

1. 钟点真的走起来：等到下课那一刻，那行是否从「还剩 1 分钟」变成下一节 / 「今天的课上完了」。
2. 课间那 10 分钟是否仍显示正在上（这是有意的设计，不是漏判）。
3. 切到别的页再回来，是否立刻对时（`visibilitychange` + `__onResume` 两条路）。
4. 教务数据没同步时是否写「今天的课钟点还没同步」而不是「今天没有课」。
5. 「查空教室」点进去是不是教务真实矩阵（而不是老的本机估算）。
6. 后台放半小时回来，那一行的时间是否立刻正确（而不是停在半小时前）。

### v2.2.0（2026-11-21）—— 截止哨兵：作业快到截止、考试快到开考时各来一条通知（**本地包 2.2.0 / 2200，未上线；线上实读仍 1.1.97 / 1197**）

触发：用户原话「推进呀，把能更新的地方都更新，ui设计，新功能什么的都搞起来」。这是「值得加的功能」四档构想里的**档 A**。

先说清楚它原来为什么一条都没有：`web/reminder.js` 的 `build()` 从头到尾只遍历 `DATA.courses`（课程表），产出的每一条都是「X 分钟后上课」。而作业清单里明明有 `end`（截止时刻）、考试有 `start`/`end`，`data/homework.json` 里连 `left_hours` 都算好了 —— **数据齐、通道齐（响铃/静默/短信草稿三档 v1.1.x 就在），就是没人把这两头接起来**。学生最容易忘的两件事，一件一直在提醒，另一件一条提醒都没有。

设计上定了一条：**课程提醒和作业提醒分成两个独立开关**。理由不是洁癖 —— 课表是每周固定的、作业是这周才三门，一个总开关会逼人在「关掉天天响的上课提醒」和「不要作业提醒」之间二选一。同时**作业截止默认关**（`KEY_HW` 不写入即视为关）：老用户升级后不该凭空多出一条他从没开过的提醒；要的人自己在设置里打勾。

改动 `web/reminder.js`（主体，+约 260 行）：

- 新常量：`KEY_HW = 'xxmu_remind_hw'`、`KEY_HW_LEAD = 'xxmu_remind_hw_lead'`、`KEY_EXAM_LEAD = 'xxmu_remind_exam_lead'`；`HW_LEADS = [3, 6, 12, 24, 48]`（小时）、`EXAM_LEADS = [1, 3, 6, 12, 24]`；默认作业 12 小时、考试 6 小时（作业怕忘、考试怕起晚，提前量不该一样）。
- `hwOn() / hwLead() / examLead()`：三个纯函数，脏值（空串、负数、不在档位里）一律回落默认，不抛。
- `buildHw()`：读 `window.__HWITEMS`（**v2.0.0 起 `renderHomework()` 就把算好的条目挂这里了，口径只有一处，不再自己解析原始 JSON**）。三条**不提醒**：`x.expired === true`、`x.left != null && x.left < 0`、`isDoneStatus(x.status)`。考试取 `raw.start || raw.end`、作业取 `raw.end`，**解析不出来就整条 return**（宁可不提醒，也不提醒一个猜的时间）。`at = dueMs - lead`，若 `at` 已过但现在还没到期，则**立刻补一条**（`at = now + 30 秒` 的 `GRACE`），保证「已经进入提前量窗口」的那几条不会静默消失。产出 `{at, name, room: course, mins, mode, due, kind}` —— `kind` 是这一版新加的字段，Java 侧靠它决定标题和去处。
- `build()` 里给课程条目补 `kind:'class'`、`due`；新增 `buildAll()` = 课程 + 作业合并后按 `at` 排序。`apply()` 改用 `buildAll()`，并**去掉了原来的 `if (!on()) return 0;` 提前退出**（否则只开作业提醒、关掉上课提醒的人一条都挂不上），toast 文案改成「已设置 N 个提醒（课程 C · 作业 H）」。
- `openSettings()` 里新增一整块：`#rmHwSw` 开关、`#rmHwLead`（截止前 N 小时）、`#rmExamLead`（开考前 N 小时）、`#rmHwHint`（写「现在有 N 件还没做完的作业/考试会按上面的时间提醒。已交的和已过截止的不提醒；读不到时间的那条也不提醒。」，N 由 `window.__HWITEMS` 现场数）、`#rmHwPreview`（「试一下作业提醒」）。关掉作业开关时两个下拉置灰（`opacity:.45` + `disabled`），但仍可见 —— 隐藏会让人以为这功能不存在。
- `paint()` 改成两行：`#remindStat` 只说课程、`#remindHwStat` 只说作业（「截止前 12 小时 · 考前 6 小时」）。
- `refresh()` 改成同一 tick 合流：`renderHomework()` 每刷一次都会喊它，不去重就会在 200 条闹钟上限上反复全撤全挂。

改动 `web/app.js`（两处）：

- `renderHomework()` 末尾补 `REMINDER.refresh()`（`typeof REMINDER !== 'undefined'` 守卫）。理由：后台 `autoSync` 刷出新作业时，闹钟也得按新数据重挂，否则新作业要等下次开 App 才有提醒。
- 新增启动 IIFE `applyLaunchTab()`：读 `Host.getPref('xxmu_launch_tab')`、**读后立刻清空**、只认 `'learn'` 才 `switchTab('learn')`。这是给「点通知直接进学习页」用的，一次性投递，用户下次正常打开不会被莫名其妙拽到学习页。

改动 `web/index.html`（+3）：`#remindCard` 标题「课程提醒」→「提醒」，第一行 label「状态」→「上课」，新增第二行 `#remindHwRow` + `#remindHwStat`。两件事都是「到点提醒我」，分成两张卡只会让人以为要分别去两个地方设。

改动 Java 侧（这是这一版真正的工作量所在）：

- `ReminderScheduler.java`：`schedule()` 里给 Intent 补 `putExtra("kind", …)` 与 `putExtra("due", …)`。原来的 Intent 只带 name/room/mins/mode，Receiver 根本分不清来的是课还是作业。
- `ReminderReceiver.java`：新增 `CHANNEL_TASK = "xxmu_task_reminder"` / `CHANNEL_TASK_SILENT`、`KIND_CLASS/KIND_HW/KIND_EXAM`、`normKind()`；`show()` 拆成 5 参重载（转调）+ 7 参新版，**通道按「上课 / 作业任务」×「响铃 / 静默」四分** —— 学生可能想让上课响铃、作业只静默，一个通道做不到。标题文案：上课仍是「N 分钟后上课」，作业是「还有 12 小时截止」/「截止时间到了」，考试是「6 小时后开考」/「开考时间到了」；`due` 缺失时退回用 `mins` 并加「约」字。通知 id 从「当前毫秒 mod MAX_INT」改成 `(isClass ? 10000 : 20000) + now % 10000`，否则同一毫秒挂的两条会互相覆盖。非课程的那条点进去带 `xxmu_tab=learn`。
- `MainActivity.java`：`Host` 桥新增 `previewTaskReminder(kind, name, course)`。**没有复用 `previewReminder`**，因为那版没有 `kind`，拿它预览作业会弹出「15 分钟后上课」——预览就是给人确认文案的，文案错了不如不给。`onCreate` 在 `setContentView(web)` 之后把 `getIntent().getStringExtra("xxmu_tab")` 写进 pref 并 `removeExtra`，避免旋转屏幕时重复触发。

**测试抓到一个夹具 bug（不是产品 bug，但差点被当成产品 bug）**：新建 `tools/test_hwremind.js`（约 300 行，`cut()` 配平切函数 + `vm` 沙箱跑真的 `buildHw()`），第一版 8 项断言集体报错，看起来像 `buildHw` 全崩。查下来是夹具自己的 `FakeDate` 写成了 `function FakeDate(){ return new RealDate(nowMs); }` —— **它把 `new Date('2026-11-21 06:00')` 的参数整个吞掉了**，于是每条的 `due` 都变成「现在」。改成 `class FakeDate extends RealDate { constructor(...a){ if (a.length === 0) super(nowMs); else super(...a); } static now(){ return nowMs; } }` 后 52 项全过。教训：测试夹具吃掉参数，是最容易误判成产品 bug 的一类坑，报错先怀疑夹具。

`tools/check_web.js` 尾部加了 v2.2.0 检查段：正面断言 `#remindHwRow`/`#remindHwStat`/`KEY_HW`/`buildHw()`/`buildAll()`/`kind:`/`due:`/`window.__HWITEMS` 都在；**反向断言** `buildHw` 体内不许出现 `fetch(` / `XMLHttpRequest` / `Host.http`（提醒算在本地，不该在挂闹钟时联网）；Java 侧断言 `CHANNEL_TASK`/`KIND_HW`/`KIND_EXAM`/`normKind(`/`putExtra("kind"`/`putExtra("due"`/`previewTaskReminder` 都在，且课程文案仍是「分钟后上课」；最后 spawn 一次 `tools/test_hwremind.js`。
- 这里也踩了一次空：本来照 `learnplus.js`/`waterwatch.js` 的样子断言了一句「有自启动守卫」，直接红 —— `reminder.js` **没有**自启动守卫（它一律由 `app.js` 显式 `REMINDER.init()`，因为闹钟要等课表加载完才算得出来）。改成反向断言：文件尾部不许出现顶层 `REMINDER.init(`，且必须以 `})();` 收尾。

教程与契约双写：`web/tut.js` `TUT_CONTENT_VER` 4 → **5**，`TUT_FEATURES` 加 `'hwremind'`，「学习」页整页重写（`since` 2.0.0 → **2.2.0**，body 从 6 条到 8 条，新增「作业那条盯截止、考试那条盯开考，提前量分开设」「已交的、过截止的、时间读不出来的都不催，已经进窗口的会立刻补一条」「作业截止默认关」），`covers` 加 `hwremind`；顺手删掉原来那句「设置里点『试一下当前方式』」——现在是两个试号按钮并列。`docs/handoff/tutorial-contract.json` `version` 4 → **5**，features 加 `hwremind`（since 2.2.0），`mustMention` 加 `"作业截止"`。

门禁：`node --check` 0 失败；`test_*.js` **43 套全过**（42 → 43）；`check_web.js` `[PASS] 静态体检全部通过`（v2.2.0 段全 true）；`check_notes.js` `[PASS] 发版说明 7 项全过`；`check_tutorial.js` `[PASS] 教程契约 39 项全过`（38 → 39，`mustMention` 多了一条）；`check_skin.js` `55 passed, 0 failed`；`verify_apk.py` `[PASS] 五件套全部通过`；`check_apk_inside.py` 全 True。

出包：`apk/xxmu-helper-v2.2.0.apk` **1024253 字节 db27bbd75385…**（`android/build/app-signed.apk` 1000.2 KB，javac 11 源文件 / d8 124 class 1 jar），签名同前（证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，可覆盖升级），交付目录逐字节校验通过。`apk/v2.2.0.notes.txt` 八条学生视角（约 1300 字）。

**未上线**（线上实读仍 1.1.97 / 1197，cfg.latest 一个字没动）。

四档实拍（`design/sketch/_shot_hwremind.js` + `_sheet_hwremind.py`，读的是**真实 `web/index.html`**）：`shots/v220-remind-nova-light.png` 142568 B / `v220-remind-nova-dark.png` 131077 B / `v220-remind-classic-light.png` 65052 B / `v220-remind-classic-dark.png` 63961 B（学习页提醒卡，390×900，拼成 `_v220_hwremind_overview.png` 1610×944）；`v220-remindset-*` 四张 125843 / 107119 / 64009 / 59180 B（设置面板，390×1240，拼成 `_v220_hwremset_overview.png` 1610×1284）。图上两行真实渲染：「上课　响铃提醒 · 提前 15 分钟」「作业截止　截止前 12 小时 · 考前 6 小时」；设置面板里作业那一段完整（开关、两个提前量下拉、说明、两个试号按钮）。

实拍踩的坑（第一次出图两行都写「未开启」）：
1. **`REMINDER.paint` 没有导出**。诊断脚本读到的 `pERR` 是 `REMINDER.paint is not a function` —— `function paint()` 是模块内部函数，只在 `init()`/`refresh()` 里被调。夹具改调 `REMINDER.refresh()`（它内部先 `paint()` 再 `apply(true)`）才有值。
2. **`DATA.courses` 在 stock 数据里是空的**，原来「取 `DATA.courses.slice()` 再改 `weeks`/`day`」的写法等于什么都没做，今日一行恒为「今日无课」。必须自己造课（`DATA.courses = [...]` + 重建 `TIMES` 16 档字符串 + `curWeek` + `renderWeek()`）。补上之后今日一行才显示「11:00　生理学 · B305」。
3. 造完课今日一行仍然说「今日无课」——因为 `renderWeek()` 只重画课表，今日一行是 `learnplus.js` 自己读 DATA 画的，而它是按启动时的空数据算过一次就不管了。夹具里补一句显式 `LEARNPLUS.paintToday()`。
4. 老坑复用：headless Edge 的 `--window-size=390` 只定画布不定布局宽，得注入 CSS 钉布局盒；NOVA 的 tape/clip 器官会克隆覆盖层，得 `display:none`。

真机待看：① 设置里打开「作业截止提醒」后回到学习页，那行是否显示「截止前 12 小时 · 考前 6 小时」；② **把某门作业的截止改到 10 分钟内**（或用「试一下作业提醒」），通知文案是否是「还有 N 分钟截止」而不是「N 分钟后上课」；③ 关掉「课前提醒」只留作业那档，作业通知是否照常来（这是 `apply()` 去掉 `if(!on()) return` 的那条）；④ 已交的作业是否确实不催；⑤ 点作业通知是否直接进学习页（`applyLaunchTab`），且第二次正常开 App 不被拽过去；⑥ 作业提醒不勾选时下拉是否置灰但可见。

---

### v2.1.0（2026-11-21）—— 出水看护：按了机器上的停止键，App 自己查到「已经停了」（**本地包 2.1.0 / 2100，未上线；线上实读仍 1.1.97 / 1197**）

触发：用户原话「你先做吧，饮水机能不能做个自己检索是否停止，因为软件上点停止有延迟，所以更喜欢按饮水机上的停止按钮。但是软件不会检索是否停止」。

要在先讲清楚这版**没有**改的东西：`goods/water/unlock` 依然只是解锁、不是开阀；结算链路依然不接（v1.1.16 按用户要求整块删掉，`createOrder` 只当协议记录）；用量依然只说「平台结算回报 amount，原样，不换算毫升」。这一版只解决「停没停，App 不知道」。

三个具体的窟窿，正好一条补药：

1. **点「停止」之后那几秒**：`endWater` 只是把命令下发到串口/2G 通道，机器真停阀要几秒，原来只有 sheet 里一行「等机器停阀…第 N 次」，关掉 sheet 就什么都没有。
2. **`watchVolume` 12 分钟上限一到就撒手**（`const MAX = 900`），此后界面归零，人若不盯着，机器到底停没停无从得知。
3. **`RUNNING` 只存内存**（`web/app.js` 的 `let RUNNING = {}`，注释写着「只存内存，重启 App 后回到『放水』」）——App 一被杀，回来看到「放水」两个字，人以为还在出水，其实可能早停了；反过来也可能已经出水而界面不知道。

新增 `web/waterwatch.js`（**425 行**，IIFE，导出 `{init, arm, disarm, disarmDev, has, list, pollOnce, kick, setBusy, paint, onEnd, K_LIVE, GAP, HIDDEN_GAP, NO_FLOW_MS, STALE_MS}`）：

- 持久化键 `K_LIVE = 'xxmu_water_live'`，形状 `{ 'devId:skuId': { dev, devName, sku, name, at } }`，走 `XXMU.pref`（= `Host.getPref/setPref`）——**存本机，所以 App 被杀掉再打开还认得**，这是它和 `RUNNING` 的本质区别。
- `pollOnce()`：`ticking` 单飞 + 串行 `chain`；`WATER.syncWater(sku)` 读到 status 3/5 → 收掉并 `notifyEnd`；status 6 → 收掉并说「报故障」；其它只写 `lastState`。**catch 只记 `err`，绝不因此判「已停」** —— 这是这块功能最容易做错、也最伤人的地方。
- 节流：`GAP = 8000`（前台）/ `HIDDEN_GAP = 30000`（后台，看 `document.hidden`）；`busy` 为真时直接让 `watchVolume` 独占，不打双份接口。
- `NO_FLOW_MS = 3 * 60 * 1000`：解锁了但一直没出水（status 1/4 且超 3 分钟）就改文案提示「去机器上按一下出水键」，不是干等。
- `STALE_MS = 30 * 60 * 1000`：认了半小时还没结论就放弃看护（`notifyGiveUp`，**不弹 toast**，免得人误以为发生了大事），把记录清掉、按钮回到「放水」。
- `init()`：`visibilitychange`（hidden 换长间隔、可见立刻 `kick()`）、`online` 补查、**包一层 `window.__onResume` 而不覆盖**（app.js 的自动同步也要跑，谁都不能把另一个挤掉）。
- `lineOf()` 五态文案：`● 正在出水（已 N）· 在机器上按停止键，这边会自动跟着变` / `○ 已解锁，等你去机器上按出水键` / `○ 解锁了但一直没出水（已等 N）` / `? 暂时读不到状态，继续试` / `· 状态 X`。
- 自启动守卫写 `if (typeof module === 'undefined' && typeof window !== 'undefined')` —— 直接沿用 v2.0.0 那个教训的正确写法（`!module.exports` 在浏览器里必抛，而且抛在 `try` 外面）。

改动 `web/app.js`（六处，全部用 `typeof WATERWATCH !== 'undefined'` 守卫，退化成旧行为也不报错）：

- 新增 `runningOf(dev, fn)`：先查内存 `RUNNING`，再查 `WATERWATCH.has(dev.id, fn.id)`；`renderDevs()` 里三处按钮态判断全改成它 —— **这样「放水/停止」两态不再只依赖内存表**。
- `startWater` 解锁成功、写 `RUNNING` 之后立刻 `WATERWATCH.arm(dev, usedFn)`；`stopWater` 与 `startWater` 的 `pending` / 网络断 / 停止命令发不出去三个分支都保留/补上 `arm(dev, fn)`，文案统一补一句「这边会继续在后台盯着，一停就告诉你」；成功与故障分支 `disarm`。
- 进出 sheet 时 `setBusy(true/false)`；「移除」按钮 `disarmDev(dev.id)`；退出胖乖账号 `disarmDev()` 全清（token 没了继续轮询只会报「登录过期」）。
- `CampusUI.init(); CampusUI.refresh();` 之后挂 `WATERWATCH.onEnd(() => CampusUI.renderDevs())` + `WATERWATCH.init()`；**顺序必须在 CampusUI 之后**（它要读 `WATER.loadDevs()`），`onEnd` 只重画列表、不碰 sheet。

改动 `web/index.html`（+2）：`#waterDevCard` 说明段之后插 `<div id="waterLive" class="water-live" style="display:none">`；`waterwatch.js` 排在 `water.js` 之后、`mytodo.js` 之前（**必须在 app.js 之前**——CampusUI 要查它）。

改动 `web/app.css`（+26）与 `web/nova-skin.css`（+48）：两套皮肤各一套。经典是牛皮纸便签（不等圆角 `6px 2px 7px 3px / 3px 7px 2px 6px` + 硬投影 + 虚线分隔），NOVA 是白瓷读数条（左侧主色竖痕 `border-left:2px solid var(--n-accent)` + `tabular-nums`），正在出水那个点有一个 `liveBreath` 呼吸动画，并且带 `prefers-reduced-motion` 关闭。

**测试抓到一个真 bug**：`tools/test_waterwatch.js`（**新建**，约 200 行）第 `[4]` 组断言「amount=0 时如实说平台没给结算量」直接红了 —— `notifyEnd` 的 toast 只在 `amt > 0` 时拼后半句，`amt === 0` 时**整句尾巴都没了**（只有 `pushLine` 那条写全了）。也就是说真机上会遇到「饮水机已经停了：三号楼 · 冷」后面什么都没有，人不知道是平台没给量还是被吞了。修好后 47 项全过。

测试的做法值得记一笔：**不再像 `tools/test_water.js` 那样按花括号配平切单个函数**，而是直接取 IIFE 本体（`src.slice(0, src.indexOf('})();') + 5)`）整段塞进 `vm`，沙箱只给假 `XXMU`（`pref` 走 store、`toast` 收进数组）与假 `WATER`（`syncWater` 按 routes 顺序发）、**不给 `document`/`window`** —— 于是 `paint()` 与 `init()` 自己早退，正好只测逻辑层。13 组 47 项覆盖：登记/注销/`disarmDev()` 无参返 -1 全清、重复 arm 不重置 `at`、status 3 与 5 收掉且 amount 原样带出、status 6 说「报故障」而**不说**「已经停了」、status 1/4 继续看护、网络错**不收掉也不弹提示**只把 err 记进 list、31 分钟前登记则放弃且不弹 toast、`setBusy(true)` 时零请求、单飞跳过、空清单跳过、坏 JSON 当空不抛。

教程与契约双写（**加功能不改教程，`check_tutorial.js` 会红**）：

- `web/tut.js`：`TUT_CONTENT_VER` 3 → **4**；`TUT_FEATURES` 加 `'waterwatch'`；饮水机页整页重写（`since` 1.1.42 → **2.1.0**，`covers` 加 `waterwatch`），**顺手删掉一句从 v1.1.60 起就已经是假的文案**——原文写「想定量就设好水量，到量 App 自动帮你停，不用守着」，而平台在放水途中根本不给实时用量，这句一直在骗人。改成实话：手机上只能解锁和停止，开阀要人在机器边按；按完这边会自己查停没停，读不到就说读不到。
- `docs/handoff/tutorial-contract.json`：`version` 3 → **4**，features 加 `waterwatch`（since 2.1.0），`mustMention` 里把 `"定量"` 换成 `"出水看护"`。

`tools/check_apk_inside.py` 补一段（这就是 v2.0.0 那次「包里还是旧 learnplus.js」教训的延续）：读 `assets/waterwatch.js` 断言 `const WATERWATCH` / `function pollOnce` / 守卫写法 / `WATER.syncWater` / 「绝不判停」的说明，再断言包里 `index.html` 有 `#waterLive` 且引入了 `waterwatch.js`、`app.css` 与 `nova-skin.css` 都有 `.water-live`、`app.js` 里既有 `WATERWATCH` 也有 `function runningOf`。第一版断言写成「不含 `!module.exports`」，**误报了**——文件头注释里正解释着这个坑，字面上就出现了这个词。改成断言正面写法（`if (typeof module === 'undefined' && typeof window !== 'undefined')`）后 12 项全 True。

门禁：`node --check` 0 失败；`test_*.js` **42 套全过**（41 → 42）；`check_web.js` `[PASS] 静态体检全部通过`；`check_notes.js` `[PASS] 发版说明 7 项全过`；`check_tutorial.js` `[PASS] 教程契约 38 项全过`；`check_skin.js` `55 passed, 0 failed`；`verify_apk.py` `[PASS] 五件套全部通过`；`check_apk_inside.py` 全 True。

出包：`apk/xxmu-helper-v2.1.0.apk` **1020157 字节 fd3d1f7c305d…**（`android/build/app-signed.apk` 996.2 KB），签名同前（证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，可覆盖升级），交付目录逐字节校验通过。

**未上线**（线上实读仍 1.1.97 / 1197，cfg.latest 一个字没动）。

四档实拍（`design/sketch/_shot_waterlive.js` + `_sheet_waterlive.py`，前者读的是**真实 `web/index.html`**，不是拼出来的假图）：`shots/v210-water-nova-light.png` 132315 B / `v210-water-nova-dark.png` 135796 B / `v210-water-classic-light.png` 114650 B / `v210-water-classic-dark.png` 114369 B，四张拼成 `shots/_v210_water_overview.png` 1610×1282 580236 B。图上 `#waterLive` 两块都真实渲染：`● 三号楼一层饮水机 · 冷 · 正在出水（已 3 分 12 秒）· 在机器上按停止键，这边会自动跟着变` + `○ 图书馆三层饮水机 · 常温 · 解锁了但一直没出水（已等 7 分），去机器上按一下出水键`；按钮态也跟着对（正在出水那口的按钮是「停止·冷」，其余是「放水·热」/「放水」）。

实拍踩的两个坑，下一个做截图的人别再踩：
1. **NOVA 的 tape/clip 器官会把卡片内容克隆成 fixed 覆盖层**，渲染在上层压住真卡片（第一次出图整页都是克隆体）。`HIDE` 段里补 `#eg-stage,.nv-tape-world,.nv-clip-world,.nv-swipe{display:none!important}`。这一条和 v2.0.0 那次「以为 `#sh-body` 被刷卡器官吃了」是同一类问题的不同表现：器官确实会动 DOM，但真出问题的是它克隆出的覆盖层，不是它 append 进容器的那个节点。
2. **`--window-size=390` 在 headless Edge 下不生效**：布局仍按 ~492px 排，然后bitmap 裁到 390，右侧整块被切掉（第一版图里卡片右边全被拦腰截断，连「2 台」都只露出「2 台/」）。修法是在注入 CSS 里直接钉布局盒：`html,body{width:390px!important;min-width:390px!important}` + `#app{width:390px!important}`，跟 `make_nova_real.js` 用的是同一招。**只看图不看宽度的人会以为是 CSS 溢出，其实是被裁了。**

真机待看：① 解锁后去机器上按出水键，卡片那行是否从「已解锁，等你按出水键」变成「正在出水（已 N 分）」；② **直接在机器上按停止键**（不点手机），几秒后按钮是否自己变回「放水」、是否弹「饮水机已经停了」——这是这一版的正题；③ 杀进程再打开，那行是不是还在（存本机才成立）；④ 断网时那行是否写「暂时读不到状态，继续试」而**不是**「已停止」；⑤ 结算 amount 出来时是否原样显示、带不带「以胖乖账单为准」的字。

---

### v2.0.0（2026-11-21）—— 「看一眼就走」：今日一行、一键复制未完成、目标绩点反推（**本地包 2.0.0 / 2000，未上线；线上实读仍 1.1.97 / 1197**）

触发：m00252 原话「今天进行一个超级大版本的更新迭代，进化到2.0版本」+ m00528 原话「由你改问题，提功能性建议，ui建议。给我一个比现在效果翻倍的成品」。

三件事的同一个出发点：学习页被打开的次数最多，但每次都只被「看一眼就走」。这一眼要能回答三件事——下节课在哪、还有什么要交、这学期绩点还能不能救。原来这三件都要点进二级页，或者自己拿计算器按。

新增 `web/learnplus.js`（16315 字节，IIFE，导出 `{init, paintToday, paintTarget, todaySummary, undoneText, gpaNeed}`）：

- `todaySummary(blocks, times, items, nowSec)`：三条「不编数据」的硬约束——①只在 `.gh.today` 那一列真存在时才算今日课；②节次钟点只认 `TIMES` 或 DOM 上真写着的，读不到就 `unknown = true`，绝不说「今日课程已结束」；③`at >= nowMin` 才算还没上完，`ended` 只在「有课 + 所有课都有钟点 + 都上完」时才为真。
- `undoneText(items)`：把未完成条目拼成一段能直接粘到群里/发给同学的纯文本。
- `gpaNeed(stat, target, remainCredits)`：按 `p = (T*(C+R) - cur*C) / R` 反推剩余学分要考到多少绩点，再折成百分制（`p >= 4 → 90`、`p <= 0 → 0`、否则 `50 + p*10`）。追不上就直接写「已经追不上了，剩余 N 学分全拿 90 分也只有 X」，不粉饰。
- `patchGrades()` 包一层 `GRADES.open`（判 `GRADES.__lpPatched`），往 `#sh-body` 末尾追加 `#gpaTargetBox`；偏好键 `xxmu_gpa_target` / `xxmu_gpa_remain`。不新开入口——目标绩点是「看成绩时会顺手想算一下」的东西，单独开一页没人去点。

改动 `web/app.js`（+6 行）：`renderHomework()` 末尾挂 `window.__HWITEMS = items;`。这一份才算过 `left` / `expired` / `notStart`；让 learnplus 各自再算一遍就多出一份会和这里走偏的口径。

改动 `web/index.html`（+21/-4）：`.learn-head` 之后插 `#todayLine`（`.tl-top` + `#todayMain` + `#copyUndone` + `#todaySub`）；`<script src="learnplus.js">` 排在 app.js 之后、nova-organs.js 之前。

改动 `web/app.css`（+56）与 `web/nova-skin.css`（+102）：两套皮肤各一套——经典是牛皮纸便签（不等圆角 + 硬投影 + 手写感），NOVA 是白瓷读数条 + 主色竖痕 + 等宽数字。数字全部 `font-variant-numeric: tabular-nums`。

**写的时候被自己的实拍抓到三个真 bug**：

1. **自启动守卫在浏览器里必抛**：原来写 `typeof document !== 'undefined' && !module.exports`。浏览器里没有 `module`，`!module.exports` 直接 ReferenceError，而它在 `try` **外面** → `LEARNPLUS.init()` 在真机上从未执行过（定时器、`renderHomework`/`renderWeek` 的包装全都没挂上）。改成 `typeof module === 'undefined'`。**这一条如果没抓到，2.0 的三个新功能在真机上全是死的。**
2. **`todaySummary` / `undoneText` 把「明天有一场考试」整条吞掉**：初版对 `x.open === false` 一律 `return`，但 `open = false` 有三种来路（已完成 / 未开考 / 截止已过），只有第三种该被挡住，而它已经由 `expired` 拦下了。改成只留 `expired` + `isDone(status)` 两道过滤。
3. **`.gt-form label` 把「目标」压成竖排「目/标」**：label 里的裸文本节点作为 flex item 被压到一字一行。改成 `flex: 0 1 auto` + `white-space: nowrap` + `min-width: 0`，输入框 `flex: 1 1 40px`。

测试 `tools/test_learnplus.js`（**新建**，6643 字节）：27 条断言直接 `require` 真代码跑（不切字符串、不 mock DOM），覆盖 `todaySummary` 的三条不编数据约束、`undoneText` 的过滤面（`open=false` 三种来路各一条）、`gpaNeed` 的三段折线与「追不上」判据。全套从 40 套变 **41 套**。

顺带把「账本」这件事也补上（三本账一直是手工维护，才烂成 59 个包没说明）：

- `tools/check_notes.js` 新增 `GATE_FROM = [2,0,0]` + `verOf/cmpVer`：**v2.0.0 起「每个 .apk 必须有同名发版说明」变成硬卡口**；历史缺的 59 个只打印清单、不失败（追不回来了，但不再新增）。
- `tools/build_apk.py` 新增 `# 8c. 重算账本（v2.0.0 新增）`：出包后自动跑 `tools/state.py` 重写 STATE.md，失败只打印、不中断出包。以前 STATE.md 停在 1.1.59，就是因为出包流程里根本没有这一步。
- `tools/verify_apk.py` 的 `check_launcher()` 与 `tools/check_web.js` 的图标段都改成「先找 `design/icons/<slug>`，再找 `design/icons_v2/<slug>`」，并在 `check_web` 里断言 `design/icons/CURRENT.txt` 的 slug 是 `07_ink`、五档 res 与源图逐字节一致。

图标换成 G 号 `07_ink`（墨迹）：深青底 + 亮青「河」字 + 右上一条 ECG 心电波形（一图两义：河流的波纹 + 生命体征，与 NOVA 的 HUD 读数语言同源）。48px 下的六条硬标准是这一轮的沉淀：字高 ≥ 0.45S、装饰线宽 ≥ 0.012S、不给字形加高斯黑影、不画密阵（> 10 格必糊）、弧形高光两端渐隐、描边字必须配极淡内填充。落地用 `python -X utf8 tools/apply_icon.py --v2 07_ink`。

契约同步：`docs/handoff/tutorial-contract.json` version 2 → 3，features 新增 `today` / `copyundone` / `gpatarget`（since 2.0.0）；`web/tut.js` 的 `TUT_CONTENT_VER` 同步 2 → 3，「课表」「学习」两页的 covers + since 一起改。加功能不改教程文案，`check_tutorial.js` 会红。

门禁：`node --check` 全量 0 失败；`test_*.js` **41 套全过 pass=41 fail=0**；`check_web.js` `[PASS] 静态体检全部通过`；`check_notes.js` `[PASS] 发版说明 7 项全过`（含新硬卡口）；`check_skin.js` `55 passed, 0 failed → PASS`；`verify_apk.py` `[PASS] 五件套全部通过`。

另外新写了 `tools/check_apk_inside.py`（**新建**）：不问「源文件对不对」，只问「**打进包里的那份是不是新代码**」——直接开 zip 读 `assets/learnplus.js`、`index.html`、`app.css`、`nova-skin.css`，断言守卫写法、`#todayLine` / `#copyUndone` / `learnplus.js` 的引入、`.gt-form label` 的 `nowrap`、`.gpa-target` 全都存在，并核对 `assets/about.js` 的版本号与 `index.html` 的 `#aboutVer` 一致。**这条检查是有来由的**：上一版 APK 打出来时 `learnplus.js` 还是修守卫之前的 16113 字节（新的是 16315），也就是说 2.0 的三个新功能在真机上根本不会跑——只看 `web/` 目录永远发现不了，必须读包。

出包：`apk/xxmu-helper-v2.0.0.apk` **1007803 字节 DFB6F760202A…**（`javac (11 个源文件)` / `d8 (124 个 class, 1 个 jar)`），签名同前（证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，可覆盖升级），交付目录逐字节校验通过。

四档实拍（两个皮肤各两张，不挑皮肤才是真验过）：

- 学习页 390×1700（NOVA，`design/sketch/shots/v200-learn-light.png` / `v200-learn-dark.png`）—— `#todayLine` 主行「● 08:00　系统解剖学 · A201」+ 右侧「复制未完成 · 5」，副行「最近截止　病理学 · 还剩 25 小时 59 分　·　还有 4 件」，下方 2 待做 / 3 未开始 / 1 已过截止。
- 成绩面板 390×1240 —— 经典皮肤 `v200-sheet-light.png` 60205B / `v200-sheet-dark.png` 59264B；NOVA 皮肤 `v200-sheet-nova-light.png` 86159B / `v200-sheet-nova-dark.png` 96876B。两个皮肤都是：「绩点 2.28 / 已修 13 学分 · 2 门通过 · 1 门分数情况不明」、四门课全部「点一下翻开」、底部 `#gpaTargetBox` 写「目标 3.50 已经追不上了（剩余 18 学分全拿 90 分也只有 3.28）」。**第三态（药理学空分）没被当 0 分**，这是这一版最该守住的一条。

**一个被我自己误判过、后来推翻的结论，记在这里免得下次再撞**：中途观察到 NOVA 皮肤下 `#sh-body` 里出现 `div.nv-swipe`（刷卡器官），当时判断「刷卡器官用 MutationObserver 接管了 `#sh-body`，`#gpaTargetBox` 活不下来，成绩面板只能用经典皮肤出图」。为这次补拍 NOVA 版专门加了调试读数，实测 `#sh-body` 的子节点是 `hint, grade-stat, grade-acts, grade-box, grade-imp, gpaTargetBox, nv-swipe` 共 7 个，`gpaTargetBox` 活着且 `offsetTop=555`——`nv-swipe` 确实被 append 进来了，但它默认 `display:none`（`nova-organs.css` 里只有 `.nv-swipe.on{display:block}`，而 `.on` 只在真出现「正在把解锁命令」这类文字时才加），所以它只是静静躺在那里，既不显示也不遮挡。**真因还是上面第 1 条那个 `init` 守卫 bug**：`patchGrades()` 没挂上 → `GRADES.open` 没被包 → `mountTarget()` 从没被调用。皮肤一直是无辜的。教训：离线夹具里「某块 DOM 不见了」先怀疑自己的时序，别急着给皮肤定罪。

**「矮屏不挤按钮」不是嘴说的，量过了**：发版说明里写了「矮屏幕上作业很多时也不会把按钮挤到屏幕外」，而 todo.md 里「矮视口 492×700 复查」一直是未勾项。为了不让这句话变成空话，新写了 `design/sketch/_check_overflow.js`（**新建**，约 300 行，ASCII-only）：读**真实 `web/index.html`**（就是 App 里 WebView 跑的那一份，不是拍图夹具），在 `</body>` 前注入四段——隐藏首启遮罩、造四门课与五条作业、把成绩面板连目标绩点一起打开、再封掉 `setInterval`/`rAF`/`fetch`/`XHR`；然后一次 Edge 启动、六个不同宽度的 iframe 同时量「有没有元素右边界超出视口」「复制未完成按钮有没有被顶出 `.tl-top`」「两个目标绩点输入框还够不够宽」。

跑出来的账（**浅/深 × NOVA/经典 四组合 × 360/390/412/492（900 高）+ 492×700 + 360×640 共 24 次，全 PASS**）：

- 六档全部 `over=0`（`#tab-learn` 与 `#sheet` 子树里没有任何元素右溢），`scrollWidth` 恒等于视口宽；
- `#copyUndone` 宽度 NOVA 99px / 经典 97px，六档一样——**没被挤压、也没换行把它顶出去**（`vOver=0`）；
- `#gpaTargetIn` / `#gpaRemainIn` 宽 108/101（360 宽）到 168/168（492 宽），都远大于 28px 的可点下限；
- `#todayLine` 高 68（NOVA）/ 66（经典），四组合一致。

三个把这条路堵住的坑，写在代码注释里了：①`#app.locked{display:none}`（`app.css:795`，激活门盖着时整个 App 是隐藏的）——不解锁量出来全是 0，会误判成「按钮被挤没」；②headless Edge 的 `--virtual-time-budget` 遇到真页面自己的 30 秒刷新与 700ms 器官轮询会永不收敛（第一版直接 `ETIMEDOUT`），必须封定时器；③`TIMES` 是「作息串」数组（`'08:00~08:45'`），不是 `{start,end}` 对象数组——喂对象进去 `hhmm()` 认不出，今日一行会退回「第 1 节」而不是真实钟点。

**未上线**（线上实读仍 1.1.97 / 1197，cfg.latest 一个字没动）。

真机待看：① 学习页顶部今日一行是否显示「下一节课 + 教室」，无课时是否写「今日无课」而不是空白；② 「复制未完成」粘到群里是否是完整清单、条数与按钮上的 N 对不对；③ 成绩面板最底下目标绩点是否算得对，追不上时是否直说而不是硬凑一个漂亮数字；④ **换 NOVA 皮肤后成绩面板还能不能看到目标绩点**（离线实拍两个皮肤都验过是好的，但真机上 `#sh-body` 会被刷卡器官 append 一个元素，仍值得看一眼）。

---

> **补记说明（2026-11-21）**：下面 v1.1.97 ~ v1.1.78 共 20 条是事后补的。当时的发版说明只写了 78~82 与 95~97（83~94 共 12 个包一个说明都没留），changelog 则一直停在 v1.1.77。这批条目的改动清单全部来自 `apk/` 里**逐版出差分**——assets 逐文件 sha256 比、`classes.dex` 的 ASCII token 集合差、以及从 dex 里提出来的 WebView 注入长串做字符级 diff——不是凭印象写。凡是差分里看不出来的（当时的实拍图、真机抽查结论），一律不写；拿不准的会明说「只改了这一层」。
---

### v1.1.97（2026-11-18）—— 空教室「内容看不懂」的真凶是教务票据失效，面板内一键重登（**本地包 1.1.97 / 1197，未上线；线上实读仍 1.1.65 / 1165**）

触发：学生截「查空教室」报「教务返回的内容看不懂，可能正在维护」，反复出现。

诊断：教务对未登录请求回的是一段约 **515 字节的脚本**（`location.href='/'` 那一套），既不含「凭证已失效」「请重新登录」这两个中文词，也没有 `id="dosub"` / `name="randnumber"` 这些登录表单特征 —— `sync.js` 的 `kbExpired()` 认不出来，于是落到了「内容看不懂」这个通用兜底。学生看到的是「可能在维护」，真实原因是登录过期。

改动 `web/free.js`（本版**只改这一个文件**）：

- `looksLikeLogin(t)` 加长到与 `sync.js` 的 `kbExpired` 对齐：`b.length > 0 && b.length < 1500` 且含 `location.href='/'`，或含 `id="dosub"` / `name="randnumber"`。
- 状态加 `authBad: false`；`loadMatrix` 里成功/失败分别置位，只有「票据失效」才置 `authBad`。
- 新增 `reloginAndReload()`：临时包一层 `window.__onLoginSuccess`，登录成功后 `prev(chk)` + `loadMatrix(true)` 自动重查；5 分钟兜底 `setTimeout(restore, 5*60*1000)` 防悬挂；`Host.openLogin` 不存在时立刻 `restore()`（老版本 App 不至于卡死）。
- `free.js:565`：票据失效时在错误区直接给一个面板内登录入口。原来要「退出面板 → 去设置 → 重新登录教务 → 回学习页 → 再进空教室 → 再查一次」六步，现在一步。

测试：`tools/test_free.js` 补「票据失效页不含旧关键词时也要认出来，并给出登录入口」。

出包：`apk/xxmu-helper-v1.1.97.apk` **962682 字节 4e6d69ede79d…**，dex `678564` 字节（与 v1.1.94 逐字节相同 —— 这一版纯前端），assets 49 个 / 1756499 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.96（2026-11-16）—— 知到读不出自动重试、雨课堂「已交显示未交」、四张连接卡常驻复制诊断（**本地包 1.1.96 / 1196，未上线；线上实读仍 1.1.65 / 1165**）

三条来自同一批真机回报。

改动 `web/zhihuishu.js`：
- `post()` 加第 5 参 `diag`，配 `note()` / `failText()`：网络层失败（HTTP `-1` 或 `ok:false`）**自动重试一次**。约束写进注释了——「零额外请求，绝不换域、绝不改 cookieUrl」，重试只重发同一条。
- 知到偶发 `HTTP -1` 之前被当成「读不到」，学生看到的是空清单。

改动 `web/yuketang.js`：
- `353-369` 行：时间轴活动**自身**也可能带截止/提交字段，补上兜底链 `a.end_time → endTime → deadline → due_time → end_date → dueTime`。注释点明「`create_time` 是「创建时间」不是截止，绝不能当截止时间用」。这修的是「雨课堂截止日期显示 `-`」。
- `460` 后：新增 `actStatus = str(a.status) || str(a.homework_status) || str(a.submit_status)`；`655-664` 行新增 `actDone = (a.finished === true) || (CX.classify(a.status) === 'done')`。**只认明确完成词，绝不凭 `is_finished === false` 或空 `status` 推断已交**。这修的是「已交作业仍显示未完成」。

改动 `web/app.js`（`1599` 行附近）：`bDiag.style.display` 从「仅 degraded / stale 时显示」改成恒 `'block'` —— 按孤汩要求「每个软件都加复制诊断」，四张连接卡（学习通 / 喜鹊 / 雨课堂 / 知到）常驻「复制诊断」。

测试：`tools/test_yuketang.js` 新增 ⑰⑱⑲ 三组（自带截止字段 → 补到作业卡 / 明确已提交状态词 → 判完成 / 空 status + 未做完 → 仍是待做，不能误伤）；`tools/test_zhihuishu.js` 新增 ⑮（首次 `HTTP -1` → 重试一次认出）。

出包：`apk/xxmu-helper-v1.1.96.apk` **962682 字节 53ae5d454743…**，dex `678564`（与 94 相同，纯前端），assets 49 个 / 1753813 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.95（2026-11-16）—— 登录挪进设置页、学习页进来自动刷、雨课堂「已交仍显示未完成」（**本地包 1.1.95 / 1195，未上线；线上实读仍 1.1.65 / 1165**）

改动全在 assets（dex 与 v1.1.94 逐字节相同）：

改动 `web/app.js`：
- `document.getElementById('refresh').onclick`（`2148` 行起有长注释）从「只刷学习通」重写成「**串行刷所有已登录来源**」——一门刷完再下一门，不并发。学习通并发敏感（`chaoxing.js:499` 记过「一次打十门课大概率被限流成 3004」），多平台更不能一起打。
- `2841` 行起：点进「学习」页时调 `SOURCES.autoSync(cb, {reason:'learn-tab'})` 自动读一次，10 分钟内不重复读。
- `6208` 行：设置页里的账号绑定入口指向同一张 `#bindCard` 半框（登录入口从散落的卡片收进「我的 → 设置」的「账号绑定」卡）。

改动 `web/yuketang.js`：
- `put()` 改口径：`status === '已完成'` 强覆盖任何非完成态；已存在的完成态不许被空串 / 「待做」降级。**只能往「完成」升，不能往「未完成」降。**
- `leafStatus` 补两条：`if (lf.userScore > 0) return '已完成'`、`if (lf.totalScore > 0 && lf.userScore >= lf.totalScore) return '已完成'`。

出包：`apk/xxmu-helper-v1.1.95.apk` **958586 字节 089d81831327…**，dex `678564`，assets 49 个 / 1751024 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.94（2026-11-16）—— 空版（只改 Manifest 与版本号）（**本地包 1.1.94 / 1194，未上线；线上实读仍 1.1.65 / 1165**）

`classes.dex` 与 assets 逐字节比：dex 从 `678548` 变 `678564`（+16 字节，全部是版本号字符串），ASCII token 集合差集为 **0**；assets 层零改动。

这一版的实质改动在 v1.1.93 就已经落盘了，94 是补一次干净出包。

出包：`apk/xxmu-helper-v1.1.94.apk` **958586 字节 249da61df419…**，dex `678564`，assets 49 个 / 1745948 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.93（2026-11-16）—— 失效判据收窄：宁可漏一次，也别把正常课表判成失效（**本地包 1.1.93 / 1193，未上线；线上实读仍 1.1.65 / 1165**）

触发：v1.1.90~92 那套判据太宽，开始出现「课表明明好好的，却被判成登录失效」。

改动 `web/sync.js` 的 `kbExpired(text, raw)`（`160` 行起）重写判据：

- **明确不要** `login.action`（登录成功后业务页的登出链接也指向它）、**不要裸 `frmbody`**（青果到处都在的全局 frame 变量）。
- 改为三组，命中任一组才算失效：①含「凭证已失效」或「请重新登录」；②`b.length > 0 && b.length < 1500` 且含 `location.href='/'` 或 `location.href="/"`；③含 `id="dosub"` / `name="randnumber"` / `id="username"`。

注释里记了实测：**未登录时青果对任何业务页都回同一段 547 字节的 alert 脚本（UTF-8）** —— 所以「短 + 带跳转」这个组合是可信的，而单独一个中文词不是。

`classes.dex` 同步：新增 `location.href` 锚点（+32 字节）。

出包：`apk/xxmu-helper-v1.1.93.apk` **958586 字节 b207ff12a435…**，dex `678548`，assets 49 个 / 1745948 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.92（2026-11-16）—— 登录真校验的长度阈值第三次调：40 字节（**本地包 1.1.92 / 1192，未上线；线上实读仍 1.1.65 / 1165**）

v1.1.90 拍的长度阈值 `1200` 是错的，v1.1.91 试着放宽到 `300` 依然偏高 —— 因为**登录成功后的 `/frame/homes.action` 可能只回不到 60 字节的紧凑 frameset**，300 会把真登录判成没登录。

改动 `android/src/com/xxmu/helper/WebActivity.java`（`932-937`）：

- `if (body.trim().length() < 40) { return new Verdict(false, "还没登录成功：拿到的不是登录后的页面"); }` —— 只挡空响应。
- `if (body.length() < 1000 && body.indexOf("location.href") >= 0) { return new Verdict(false, "还没登录成功：密码或验证码没填完"); }` —— 这一条才是真正干活的判据：短 + 带跳转 = 还是那段 alert 脚本。
- 探针失效锚点里**拿掉 `login.action`**（登录成功后登出链接也指向它，会误判），改由 CAS 表单独靠特征判。

`classes.dex` +72 字节：新增 `id="dosub"`、`id="username"`、`name="randnumber"`，删 `login.action`。

出包：`apk/xxmu-helper-v1.1.92.apk` **958586 字节 5cd6548009b2…**，dex `678516`，assets 49 个 / 1745097 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.91（2026-11-16）—— 空版（只改 Manifest 与版本号）（**本地包 1.1.91 / 1191，未上线；线上实读仍 1.1.65 / 1165**）

`classes.dex` 与 v1.1.90 **完全同大小（678444）且 ASCII token 集合差集为 0**；assets 层零改动。只改了 `AndroidManifest.xml` 和三处版本号。

出包：`apk/xxmu-helper-v1.1.91.apk` **958586 字节 3c1e73a7de12…**，dex `678444`，assets 49 个 / 1745097 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.90（2026-11-14）—— 登录结果的真校验：学号填了、密码没填，也不再报「登录成功」（**本地包 1.1.90 / 1190，未上线；线上实读仍 1.1.65 / 1165**）

触发：学生在青果登录页只填了学号就点「完成」，App 报登录成功；回头查课表全是空的，人也以为已经登好了。

根因：`WebActivity` 的「完成」按钮无条件 `finishWithResult(true)` —— 用户什么都不填直接按，也算成功。而 WebView 拿不到「是否真登录」的信号，因为**未登录时青果对 `/frame/*` 一律回 200，只是正文换成那段 547 字节的 alert 脚本，状态码毫无区分度**（2026-11-14 实测五次探针全 200 / 547B）。

改动 `android/src/com/xxmu/helper/WebActivity.java`：

- 新增 `WebActivity$Verdict`、`verifyUrl` / `verifyAt` / `verifying` / `verifyFail` 状态、`verifyLogin()` / `judgeLogin()` / `originOf()` / `resolveVerifyUrl()` / `loginHintsHit()` / `getProtocol()` / `toastToUser()`；extra 键 `EXTRA_VERIFY_URL`、`verify_url`，pref 键 `xxmu-login-verify`。
- 探测地址按域名推导，落到 `https://qgjw.xxmu.edu.cn/frame/homes.action`。
- 四条判据：①HTTP 200 ②正文去空白 ≥ 40 字节 ③不含「凭证已失效」「请重新登录」（UTF-8 与 GBK 两种字节位都查）④不含 `id="dosub"` / `name="randnumber"` / `id="username"`。
- 「完成」按钮：`if (verifyFail >= 1) { finishWithResult(true); return; }` —— **已经失败过一次的第二下放行**。理由写在注释里：「万一学校改了页面结构、探针失效，用户还有出路」。不能把人卡死在登录页。

改动 `web/sync.js`：新增 `kbExpired(text, raw)`（`160` 行，注释「青果「凭证已失效」判定（v1.1.90）」）。用 **`raw`（Java 按 ISO-8859-1 原样搬的字节位）+ `text`（`decodeAuto` 猜出来的正文）双源**判失效 —— 只信其中一路都会漏。

`classes.dex` 670260 → 678444（**+12184，本轮最大的一跳**）。

出包：`apk/xxmu-helper-v1.1.90.apk` **958586 字节 2e041e3e992b…**，dex `678444`，assets 49 个 / 1745097 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.89（2026-11-14）—— 打开教务/平台时把标题带上，不再一律写「学习通」（**本地包 1.1.89 / 1189，未上线；线上实读仍 1.1.65 / 1165**）

以前不论从哪儿打开 WebView，标题栏都写「学习通」，从教务入口点进去也是。

改动 `android/src/com/xxmu/helper/MainActivity.java`：新增 `openInAppTitled`、`titleForUrl`，配域名 → 标题映射表（`chaoxing.com` / `passport2.chaoxing.com` / `yuketang.cn` / `zhihuishu.com` / `qgjw.xxmu.edu.cn`）。

改动 `web/app.js`（`5768` 行起）：

```js
if (Host.openInAppTitled) Host.openInAppTitled('https://qgjw.xxmu.edu.cn/', '教务系统');
else Host.openInApp('https://qgjw.xxmu.edu.cn/');
```

注释：「v1.1.89：顺手把标题带上。老版本 App 没有 `openInAppTitled`，退回 `openInApp` 也只是标题写「学习通」，功能不受影响」——**新 Host 能力一律要有一层降级**，否则前端先上线会白屏。

`classes.dex` +672 字节。

出包：`apk/xxmu-helper-v1.1.89.apk` **954490 字节 24b79cc0ef9d…**，dex `674416`，assets 49 个 / 1743988 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.88（2026-11-14）—— 校讯图改按结构选择器藏，不再靠文件名（**本地包 1.1.88 / 1188，未上线；线上实读仍 1.1.65 / 1165**）

v1.1.87 用 `img[src*='xiaoxun']` 按 URL 关键字藏校讯图，学校一换文件名就失效。

改动：换成结构选择器 `.logo-div td:last-child img{display:none!important}`。**这个版本 assets 层零改动，全部改动在 `classes.dex` 里注入的 `FIT_CSS`**（`673728` → `673744`）。

出包：`apk/xxmu-helper-v1.1.88.apk` **954490 字节 5533c3000881…**，dex `673744`，assets 49 个 / 1743708 字节（与 83~87 逐字节相同），签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.87（2026-11-14）—— 藏掉青果登录页右边的校讯图（**本地包 1.1.87 / 1187，未上线；线上实读仍 1.1.65 / 1165**）

登录页重排之后，右侧那张校讯图还占着一块空白。

改动（`FIT_CSS`，`673704` → `673728` 字节）：删掉 `display:inline-block!important`，新增 `img[src*='xiaoxun']{display:none!important}`。

出包：`apk/xxmu-helper-v1.1.87.apk` **954490 字节 f97b8fb5262c…**，dex `673728`，assets 49 个 / 1743708 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.86（2026-11-14）—— 破图隐藏改成函数 + 三次重试（**本地包 1.1.86 / 1186，未上线；线上实读仍 1.1.65 / 1165**）

v1.1.84 的 `hideBroken()` 是内联循环，只在 `onPageFinished` 那一刻跑一次；青果的图加载慢，跑的时候还是 `naturalWidth === 0`，图后来又加载成功、或者反过来晚一步坏掉，都处理不到。

改动（`FIT_JS`，`4406` → `4548` 字节）：

- 内联循环重构成具名函数 `var hideBroken = function () { … var g = im[i2]; if (g.complete && g.naturalWidth === 0) … }`。
- 加 `setTimeout(hideBroken, 600)` / `1800` / `3500` 三次重试。

出包：`apk/xxmu-helper-v1.1.86.apk` **954490 字节 64e0e15c11ef…**，dex `673704`，assets 49 个 / 1743708 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.85（2026-11-14）—— 登录页连验证码图一起藏掉（**本地包 1.1.85 / 1185，未上线；线上实读仍 1.1.65 / 1165**）

改动（`FIT_CSS` `673544` → `673564` 字节）：选择器加 `#randpic,`（隐藏验证码图容器）。`FIT_JS` 一个字节没动。

**这一版的 assets 层与 v1.1.84 逐字节相同 —— 也就是说 `app.js` / `yuketang.js` 里那批名为「v1.1.85」的改动（刷新 = 所有来源、点进学习页自动刷新、雨课堂合并同一门课同一标题的多路证据）在 85 这个包里根本没有进 APK。** 差分显示 `app.js` 到 v1.1.89 才第一次变、`yuketang.js` 到 v1.1.95 才第一次变。真正落地是后面几个包，只是注释上仍写着 v1.1.85。

出包：`apk/xxmu-helper-v1.1.85.apk` **954490 字节 b767fe9edd36…**，dex `673564`，assets 49 个 / 1743708 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.84（2026-11-14）—— 登录页从 `zoom` 缩放改成纯 CSS 重排（**本地包 1.1.84 / 1184，未上线；线上实读仍 1.1.65 / 1165**）

这是青果登录页手机适配的第二步，也是 v1.1.83 那个 `FIT_CSS` 长出来的原因。

问题：`cas/login.action` 的 `.login-info-div` 固定 760px 宽（380 内容 + 380 `padding-left`），整页 `scrollWidth` 约 1280px；手机 WebView 布局视口只有 360~412px，账号/密码/验证码三行输入框被推到屏幕右外侧。v1.1.38~1.1.83 一直用给 `html` / `body` 设 `zoom` 的办法，760px 缩到 412px 只有 0.54 倍，16px 的字变成 8.6px，输入框实际只剩 200px 宽；而且只给 `html` 设 `zoom` 会被 `body` 的 `width` 二次覆盖，实测仍向右溢出 210px。

改动（`FIT_CSS` `3361` → `3355` 字节、`FIT_JS` `4037` → `4406` 字节，字符级 diff 逐条核过）：

- `.mainbanner` 加 `,.mainbanner1`，且由「限高 88px + `object-fit:contain` + `opacity`」改为 `display:none`。
- `.login-info-div` 加 `,input.login`；`.logo-div` 加 `float:none`；圆角 6 → 8px。
- 登录按钮：`color:#fff` + `background:#2f7bd6` + `background-image:none` + `border:0` + `border-radius:8px`。
- 新增 JS：`var bt = document.getElementById('login'); … bt.value = '\u767b\u5f55'`（青果那个按钮原本是空的，补成「登录」）+ `hideBroken()`（`g.complete && g.naturalWidth === 0` 的图 `display:none`）。
- 三行 tab 改成 100% 宽 + `table-layout:fixed`，输入框保持 16px，登录按钮 48px 满宽；412 / 360 / 492 三种视口实测横向溢出元素 = 0。

注入面的两条纪律（写在 `WebActivity.java` 的注释里）：**只在青果登录页注入**（靠 `#login-info-div` / `.login-div-float` / `form#dosub` 三个特征判断），**幂等**（注入前查 `style#xxmu-fit`）。

出包：`apk/xxmu-helper-v1.1.84.apk` **954490 字节 36386567ee56…**，dex `673544`，assets 49 个 / 1743708 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.83（2026-11-14）—— 登录页适配起步：`FIT_CSS` 第一次进 dex（**本地包 1.1.83 / 1183，未上线；线上实读仍 1.1.65 / 1165**）

**这一版 assets 层零改动**（`about.js` / `index.html` 只是版本号），改动全部在 `classes.dex`：`666260` → `673184`（+6924 字节），首次出现 3361 字节的 `FIT_CSS` 长串。

也就是说：83 只是把 CSS 注入这套机制搭起来，真正的样式在 84 才写进去。

出包：`apk/xxmu-helper-v1.1.83.apk` **954490 字节 3e30f01642e4…**，dex `673184`，assets 49 个 / 1743708 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。
---

### v1.1.82（2026-11-14）—— 雨课堂的作业不再重复出现（**本地包 1.1.82 / 1182，未上线；线上实读仍 1.1.65 / 1165**）

触发：雨课堂同一条作业列成两张卡 —— 一张是带课程名、待做状态、截止时间的作业卡，另一张带 📝 当成考试又列一遍。

根因：`upcomingExam` 接口会把**带截止时间的作业**也塞一遍，前端两路都收，于是同一条出两张。

改动 `web/yuketang.js`（`460` 行起「v1.1.82 去重：作业被 upcomingExam 又塞了一遍」整段）：

- 按「课程 + 归一化标题」合并；同一场考试被平台重复推两遍的也只合一张。
- **真考试不误删**：名字不同、或名字碰巧一样但考试时间对不上的，照旧单独列。
- 作业卡没读到截止时间的，拿重复那张里的时间补回来，倒计时不丢。
- 去重逻辑写进适配器、**不写进 `app.js` 渲染层** —— 渲染层拿不到来源信息，跨来源同名会误删。

测试 `tools/test_yuketang.js` 新增 ⑭⑮⑯ 三组（去重主路径 / 截止差大是真考试 + 名字归一化 / 作业卡没截止时把考试卡的截止补回来）。

出包：`apk/xxmu-helper-v1.1.82.apk` **954490 字节 2d7b0fb710a9…**，dex `666260`，assets 49 个 / 1743708 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 待完成里同一条雨课堂作业是否只剩一张卡、条数是否变对；② 真考试（名字不同 / 时间不同）是否还在；③ 作业卡的截止时间是否还有倒计时。
---

### v1.1.81（2026-11-14）—— 作业考试打开就自己刷一遍 + 雨课堂扫码不再秒关（**本地包 1.1.81 / 1181，未上线；线上实读仍 1.1.65 / 1165**）

触发：孤汩原话「雨课堂喜鹊知到能不能像学习通一样自动重新抓取」。

诊断：逐文件核对后发现**学习通也不是后台轮询** —— `CX.sync` 只在登录成功 / 点刷新 / 解锁时触发，靠 cookie 长效撑着。三个新平台真正缺的是「登录态有效时，冷启动 / 切回前台 / 前台常驻到点，就静默补刷一次」。

改动 `web/sources.js`（`26-46` 行长注释「v1.1.81：自动刷新调度器（方案 B）」）：新增 `autoSync()`，由 `app.js` 挂冷启动、`window.__onResume`（`MainActivity.onResume` 已在喊）、30 分钟前台定时器。学习通（builtin）不参与，它有自己的触发链。

三条保护（学习通并发敏感，`chaoxing.js:499` 记过「一次打十门课大概率被限流成 3004」，多平台更不能并发）：

1. **单飞**：`AUTO_RUNNING` 期间再来一次 `autoSync` 直接跳过，防三个钩子叠加。
2. **串行**：一个来源刷完再下一个，不并发。
3. **最小间隔**：每来源距上次成功 `synced_at` 不满 `AUTO_GAP = 600` 秒不刷（`sources.js:54`）。

两条诚实底线：

4. 跳过没登录 / 明确要重登（stale）/ 从没成功过（`synced_at === 0`）的来源，**不给它们盲发请求**（发了必然 401 / 50000，还会在卡上刷出假「暂不可用」）。
5. **静默**：自动刷只落盘 + 回调重画一次，绝不弹 toast / `showTip`。失效原因交给连接卡自己显示。自动刷新也**不许走 `SrcUI.sync`**（那条路会弹满屏 toast）。

天花板写在注释里：登录态过期（雨课堂微信扫码、知到/喜鹊 cookie）机器代不了，调度器只做「失效明确提示 + 一键直达重登」，不假装能自动重登。

改动 `web/yuketang.js`：登录链路修复（仿知到 v1.1.79）—— `okHints` 里那串 `/web/course`、`/web/student` 业务页片段会被登录页自己命中，一 `onPageFinished` 就秒关。根因与知到 v1.1.78 同款。真登录判据独立成 `AUTH_KEY`，只在用户点「完成」（ok）时写。失效时卡片写清「区域选错了 / 扫完没真登进去或二维码过期」并给重扫按钮，**已读到的数据不丢**。

测试 `tools/test_sources.js` 新增 ⑧~⑪（自动刷新的单飞 / 串行 / 最小间隔 / 绝不弹 toast）；`tools/test_yuketang.js` 新增 ⑬（杜绝「扫码登录了没成功」）。

出包：`apk/xxmu-helper-v1.1.81.apk` **950394 字节 ab59eec02580…**，dex `666260`，assets 49 个 / 1739504 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 冷启动 / 切回前台时三个新平台是否真自己补刷；② 后台时是否确认不刷；③ 雨课堂扫码后页面是否停住、点「完成」才关。
---

### v1.1.80（2026-11-14）—— 知到定 B 主线：接口直连读清单（**本地包 1.1.80 / 1180，未上线；线上实读仍 1.1.65 / 1165**）

触发：v1.1.79 的模式 B 真机诊断坐实：课程列表返回 `{result:{totalCount:0, courseOpenDtos:[]}}` —— 链路是活的，是请求体字段名错了。

根因：v1.1.79 发的 `{pageSize:5, pageNum:0, status:0}` 字段名不对（平台要 `{pageNo, pageSize}` 这一套），于是 `totalCount` 永远是 0，看起来像「一门课都没有」。

改动 `web/zhihuishu.js`：

- 请求体改成 `{status:0, pageNo:1, pageSize:5}`。
- `400` 行起：直接吃 `j.result.courseOpenDtos` 数组，**不再用 `deepArray` 猜层级**（猜层级是 v1.1.78 方案 C 的临时手段，会静默返回空数组，和「这学期真没课」无法区分）。
- `626` 行起：定 B（接口直连）为默认主线，A（读官方作业页 DOM）留作兜底、仍可切。
- 删掉 CAS 换票 GET（多一次请求、还会被平台当异常）。
- `604` 行：诊断包首行标注「知到 v1.1.80 诊断包 · 模式 X · AES 自检 …」，方便学生一键复制回来定位。

「读不到就写清原因，不拿空清单冒充没作业」这条在 `zhihuishu.js` 里成为硬约束：**只有每门课都确实读通、且平台确认当前没有待交，才显示「当前没有待交作业」。**

测试 `tools/test_zhihuishu.js` 新增 ⑭（`extract_course_id` 口径从 `courseInfo.courseId` 下探 / 缺 `recruitId` 跳过 / 分页），并改 ③ 断言默认模式是 B。

出包：`apk/xxmu-helper-v1.1.80.apk` **946298 字节 68e38f66b2ab…**，dex `666260`，assets 49 个 / 1727564 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 知到是否默认「接口直连」、点「重新抓一次」是否真列出来；② 读不到时的原因文案是否具体到「哪一门 / 为什么」。
---

### v1.1.79（2026-11-14）—— 知到登录页不再一闪就关（**本地包 1.1.79 / 1179，未上线；线上实读仍 1.1.65 / 1165**）

触发：上一版点「登录 / 重新登录知到」，登录页刚打开就自动关掉，账号根本来不及输。

根因：`okHints` 里写了裸域名 `zhihuishu.com` —— 登录页自己就在这个域下，`onPageFinished` 一触发就被判成「已经到目标页」直接 `finish()`。

改动 `web/zhihuishu.js`：

- `okHints` 换成**永不命中的哨兵 `OK_SENTINEL`**（不再靠 URL 猜登录是否成功）。
- 真登录判据独立成 `AUTH_KEY = 'xxmu_zhs_auth'`，只在用户点右上「完成」（ok）时写。v1.1.78 秒关时写下的假 `__bound` 不再被认作已登录；`logout` 时顺手清掉它。
- 覆盖 `SOURCES.define` 装的默认登录回跳 —— 默认版只写 `__bound`，而 v1.1.78 的秒关也会触发它，等于写假登录。

测试 `tools/test_zhihuishu.js` 新增 ⑬（杜绝「打不开登录页面」：哨兵不命中 / 只有 `AUTH_KEY` 算登录 / `logout` 清遗留 `__bound` / 诊断首行标注不再自动秒关）。

出包：`apk/xxmu-helper-v1.1.79.apk` **946298 字节 8ec8155a47b4…**，dex `666260`，assets 49 个 / 1722146 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 点「登录知到」页面是否稳稳停住；② 登进去点「完成」再回来点「重新抓一次」是否才去读清单。
---

### v1.1.78（2026-11-13）—— 连堂课只提醒一次 + 提醒改按系统闹钟挂 + 知到有登录入口（**本地包 1.1.78 / 1178，未上线；线上实读仍 1.1.65 / 1165**）

三件事，都在这一版第一次进包。

改动 `web/reminder.js`（`94-97` 行注释「v1.1.78 连堂去重」）：

- **连堂去重**：同一门课同一天可能连着上好几节（`periods:[1,2,3]`），以前对每一节都挂一条提醒，三节课就响三次。用户原话「同一门课只提醒一次」。现在按「一门课 × 一周」只取当天最早那一节（`build()` 内 `if (at === null || t < at) at = t;   // 连堂只留最早一节`），在它前面 N 分钟提醒一次。顺带把 200 条上限里被连堂重复项占掉的名额省出来 —— 学期后半段不再被吃光。
- **准时性**：以前偶尔晚几分钟、甚至不响，是系统把提醒当普通定时任务，省电模式下被拖住。改按**系统闹钟**（`setAlarmClock`）挂，穿透 Doze，锁屏和省电模式下也按时响。三档（响铃 / 静默 / 短信草稿）照旧。

改动 `web/zhihuishu.js`：接入知到（智慧树）**方案 C 双探针**——探针 A 读官方作业页 DOM、探针 B 直连只读接口。学习页里知到有自己的登录入口。只读：不代签到、不代交作业、不代发帖，登录态只存在这台手机上。

改动 `web/app.js`：知到探针模式可切（`A 读页 / B 直连`），换模式清旧快照；「打开官方作业考试页」走真实 WebView，看到清单后按返回。

测试 `tools/test_reminder_fix.js`（**新建**，7399 字节）：覆盖连堂去重与准时性两个修复的离线断言。`tools/test_zhihuishu.js` 起步。

出包：`apk/xxmu-helper-v1.1.78.apk` **942202 字节 dd04d82f540d…**，dex `666260`，assets 49 个 / 1718697 字节，签名同前。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 连堂课是否只响一次；② 锁屏 / 省电模式下是否按时响；③ 知到登录入口是否能开、登完能否试着同步。
---

### v1.1.77（2026-11-12）—— 已过截止移出「待完成」，排序按截止时间从近到远（**本地包 1.1.77 / 1177，未上线；线上仍 1.1.65**）

触发：m04098 原话「已过期的不显示在待完成里，这个按时间从近到远排序，就是按紧急程度排序」+ 截图 m04099（雨课堂待完成 11 条全是已过期作业，09-27 / 10-06 / 10-11 越老越靠前）。

根因两条：

1. **过期条目仍算「待做」**：`renderHomework` 里 works 的 `_open` 在 `CX.classify(status)==='open'` 时恒 `true`，完全不看截止时间——「待做」表示没交，这是事实，但对「待完成」这个视图来说，交不了的东西不该占位置。
2. **过期越老越靠前**：`byDue` 是 `left` 升序，过期后 `left` 为负，`-1200` 小时 < `-10` 小时，于是 9 月那批全被顶到首屏，10 月的反而沉底——和「按紧急度」正好反着。

改动 `web/app.js`：

- works 条目加 `expired: (left != null && left < 0)`；exams 加 `expired: (due != null && due < now)`（判据用结束时间，不依赖状态——状态没读到也不能一直挂顶上）。
- 顶部统计拆开：`openWorks/openExams` 只数 `x.open && !x.expired`，另算 `expWorks/expExams/expN`，`hwcount` 变成「N 条待做 · M 场考试待考 · K 条已过截止」。
- 新增可测纯函数 `/* @testable:hwBucket */ function hwBucket(x)`（优先级 `done > expired > notstart > todo > unknown`；`expired` 既认 `x.expired===true` 也自己按 `x.left<0` 判，防止别的调用点没填标志位），并让它接管排序分桶：`open` 取 `'todo'`、`expired`、`notstart`、`done`、`unknown`。
- 「已过截止」用 **left 降序**（越接近现在越靠前，最老的沉底）——和待完成的升序相反，翻的时候第一眼看到的是刚过期那条。
- 「按课程」排序：`urg()` 只拿未过期条目算最紧急（整门课都过期就沉底，不再用负剩余时间抢位置）；组内 `ra()` 改成 `open&&!expired→0 / expired→1 / notStart→2 / 其余→3`；组头 parts 顺序改「未完成 / 未开始 / 已过截止 / 情况不明」。
- 待完成为空时给一句「现在没有还要交的。已过截止的在下面，想回看可以展开。」，并新增 `foldSec('已过截止 · N', wrap, false)` 默认折叠。

测试 `tools/test_hwsort.js`（**新建**）：按 `@testable:hwBucket` / `@end` 标记从 app.js 切出函数在 vm 里跑，不加载整个 app.js（那玩意儿一加载就要 DOM）。18 条断言覆盖：未交未过期→todo、未交已过期→expired、已完成优先于过期→done、未开始/未开考→notstart、状态没读到→unknown、没截止时间的待做仍→todo、待完成按 `一小时后|一天后|三天后`、已过截止按 `过期中|过期最老`、过期一条都不在待完成。

**写的时候被自己的测试抓到两处**：① `hwBucket` 一开始只认 `x.expired`，负 `left` 的条目会漏判成 todo（断言 ③ 直接红了）→ 补成也自己按 `left<0` 判；② `expired` 排序一开始照抄 `byDue` 升序，把最老的顶上来（断言 ⑧ 红）→ 改 left 降序。

门禁：`node --check` app.js/test_hwsort/check_web 全 0；`test_hwsort` 18/18；`test_hwstatus` 56/0（老的分桶断言一条没动，「E 未交已过期 仍是没交」保持 `open===true`——open 语义没改，改的只是视图分桶）；全套按退出码 **38/0**（新增 test_hwsort 后从 37 变 38）；`check_web` `[PASS]`（v1.1.77 段 9 锚点 + 一条反向检查「待完成不许写成不过滤 expired」）；`verify_apk` `[PASS]`；`check_notes` 6/6。

出包：`apk\xxmu-helper-v1.1.77.apk` **934010 字节 cb04a153dfd6…**，`javac (11 个源文件)` / `d8 (121 个 class)`，签名同前，交付目录逐字节校验通过。

两档实拍（390×2600）：light 203695B / dark 204283B，逐块看过：待完成 4 条之后多了「已过截止 · 2 ▾」一段（浅色米黄 / 深色深棕下都清楚），雨课堂卡的区域行仍是长江选中，无白字压白底、无横向溢出。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 待完成里是否只剩还能交的，已过期的 09-27/10-06 那批是否移到了下面折起来的「已过截止」；② 待完成是否按截止从近到远（最上面是最快到的，不是最老的）；③ 顶部是否写成「N 条待做 · M 场考试待考 · K 条已过截止」；④ 切「按课程」时每门课是否先列还能做的、组头写出已过截止条数。

---

### v1.1.76（2026-11-12）—— 雨课堂读不到作业的两处根因：死认结构 + 死认类型（**本地包 1.1.76 / 1176，未上线；线上仍 1.1.65**）

触发：m03943 真机回报「已登录：梁牛翔；课程 3 门；待考考试 0 场；时间轴条目 0，章节叶 0」+ 原话「绑定账号了，这个里面会发作业，比如数学会有作业。不应该只局限于考试」。

诊断：登录态、课程列表都通了（v1.1.75 的区域修复生效），两个取作业的接口也返回成功，但**一条条目都没解析出来**，于是走了「接口返回了但没认出作业条目」的降级。两处根因：

1. **死认字段层级**：`activitiesOf` 只读 `data.activities`、`leavesOf` 只读 `data.course_progress[].section_leaf_list`。平台实际把数据挂在别的层级时，这两个函数静默返回空数组，和「这学期真没作业」无法区分。
2. **死认类型白名单**：时间轴只收 `type === 5 || type === 19`，章节叶只收 `leaf_type 5/6/19`。平台新增过类型（type 20 等），数学那种普通作业落进新类型就被整批吞掉——这正是 YG 说的「数学会有作业」。

改动 `web/yuketang.js`：

- 新增 `ownKeys / skeleton / deepArray / deepConcat / looksLikeActs / looksLikeLeaf`。
  - `deepArray(root, match)`：顺着对象往下找第一个「匹配断言且本身有内容」的数组，返回 `{key, value}`。
  - `deepConcat(root, match)`：收集所有匹配数组并拼起来（章节树里 `section_leaf_list` 可能有多份）。
  - `looksLikeActs` / `looksLikeLeaf`：**按形状判**——有 `title|name` 且有 `type|is_finished|create_time` 就是时间轴条目；有 `leaf_type`，或有 `name` + `progress` 对象就是章节叶。字段名不同也能认。
- `activitiesOf`：先走 `data.activities`，空了就 `deepArray` 下探。
- `leavesOf`：先走 `data.course_progress`，一处都没有就 `deepConcat` 把「像章节叶」的数组全拼起来；顺带补 `userScore / totalScore`。
- 类型白名单放开：时间轴只排除 `type 9`（公告）与 `type 14`（上课记录），其余全收；章节叶改用新函数 `leafWantsAttention(lf)`——`leaf_type 5/6/19` **或** `score_deadline > 0` **或** 状态含「未交/未完成/待交/待做/待完成/进行中/未提交」都算待办。
- `skeleton(root, depth)`：把返回内容摊成「键名 + 数组长度」的一行（数组会自动下探取第 0 个元素），深度 2、上限 26 段，**只打键名不打内容**，既不泄露作业正文也够定位层级。
- 诊断里补两条：一条课的时间轴认不出就 `diag.push('时间轴骨架：' + skeleton(row.acts.data))`，章节认不出就 `diag.push('章节骨架：' + ...)`；接口失败时也把 `row.acts.err` 写进诊断。这样「复制诊断」发回来能一次定位，不用再猜。

测试 `tools/test_yuketang.js` 新增 ⑪（换层级 `data.records` + `progress_tree[].leaves` 也要认、type 20 收下、type 9 仍排除、leaf_type 7 靠「未交」收下、整体 ok）与 ⑫（结构完全认不出 → degraded、诊断里出现「时间轴骨架」且含真实键名 `hello`）→ **60/60**。

门禁：`node --check` web/yuketang.js + test + check_web 全 0；`test_yuketang` 60/60；全套按退出码 **37/0**；`check_web` `[PASS]`（新增 v1.1.76 段 8 锚点 + 一条反向检查「不许再只收 type 5/19」）；`verify_apk` `[PASS]`；`check_notes` 6/6。

出包：`apk\xxmu-helper-v1.1.76.apk` **934010 字节 537404c63edb…**，`javac (11 个源文件)` / `d8 (121 个 class)`，签名同前，交付目录逐字节校验通过。

两档实拍（390×2500）：light 197161B / dark 197708B，逐块看过：雨课堂卡新增一句「认不出条目时，『复制诊断』会把返回内容的骨架一起带出来——这版不再只往固定字段里找作业，也不再只认两种作业类型」，区域行「区域 长江(on) 雨课堂 荷塘 黄河」正常，浅色米黄/深色深棕都无白字压白底、无横向溢出。

**未上线**（线上实读仍 1.1.65 / 1165）。

真机待看：① 「重新抓一次」后待完成里是否真出现数学等课程的作业（这次不该再是 0 条）；② 若仍是 0 条，「复制诊断」里的骨架是否已经写出真实键名 —— 把那段发回即可定位；③ 已交作业是否进「已完成」；④ 截止时间是否与课程章节进度一致，读不到应显示「时间未读到」。

---

### v1.1.75（2026-11-11）—— 雨课堂四区域可选（默认长江）（**本地包 1.1.75 / 1175，未上线；线上仍 1.1.65**）

触发：m03730 原话「我用的是长江雨课堂，不是这个雨课堂」。v1.1.74 把 `HOST/BASE/LOGIN_URL` 写死 standard（`www.yuketang.cn`），而 YG 用的是长江区——扫码留下的是 `changjiang.yuketang.cn` 的 Cookie，请求却全打到 standard 域，等于一条都读不到。**这是把「四区域会话不通用」写进注释、代码里却仍然单区域的典型漏改。**

实测确认长江区整套接口健全（pwsh，UA Chrome131 Mobile + `Accept: application/json` + `xtbz: ykt` + `Referer /web`）：
- `GET /api/v3/user/basic-info` → 200 `{"code":50000,"msg":"UNAUTHENTICATED","data":""}`
- `GET /api/v3/classroom/on-lesson-upcoming-exam` → 200 同上
- `GET /v2/api/web/courses/list?identity=2` → 401
- `GET /v2/api/web/logs/learn/1?actype=-1&page=0&offset=50&sort=-1` → 401
- `GET /c27/online_courseware/schedule/course/progress/?classroom_id=1&course_id=2` → 401
- `GET /v2/api/web/classrooms/1?role=5` → 401
- `GET https://changjiang.yuketang.cn/` → 200，`<title>长江雨课堂网页版-登录</title>`，重定向终点 `/web`
- `GET /api/v3/user/login/app-web-pre-info` → 200，`qrContent` 指向 `changjiang.yuketang.cn/api/v3/user/login/app-web-qr?...`

结论：长江区端点与登录流程全活，v1.1.74 只是问错了域。

改动：

- `web/yuketang.js`
  - 删掉 `HOST / BASE / LOGIN_URL` 三个写死常量，改 `REGIONS` 表：`changjiang`（长江，`https://changjiang.yuketang.cn`，**排第一=默认**）/ `standard`（雨课堂）/ `hetang`（荷塘 `pro.yuketang.cn`）/ `huanghe`（黄河 `huanghe.yuketang.cn`）。
  - `REGION_KEY = 'xxmu_ykt_region'`、`DEFAULT_REGION = 'changjiang'`；`regionOf(id) / curRegion() / setRegion(id)`，认不出存值就回落默认。
  - `hostNow() / baseNow() / loginNow()` 三个取值函数；`api(path)` 改成 `SOURCES.http(baseNow()+path, { cookieUrl: hostNow()+'/', referer: loginNow(), headers: HDR })`——请求域与 Cookie 域必须同源，否则带不上扫码的 sessionid。
  - define 里 `host / loginUrl` 取 `curRegion()`，并**新增三个覆盖函数**把三件事都绑到当前区域：`loggedIn: curLoggedIn`（`Host.hasCookieFor(hostNow()+'/')`，无 Host 退 pref `xxmu_ykt_todo__bound`）、`openLogin: curOpenLogin`（标题带区域名，人一眼知道在扫哪套）、`logout: curLogout`（只清当前区域 Cookie）。
  - 导出 `window.YKT = { regions, region, setRegion, regionName }` 给界面用。
  - 头注释「四区域为什么不能混用」整段重写为「四区域：必须让人选，不能猜」，把 v1.1.74 的死因写在文件顶上。
- `web/app.js`
  - 雨课堂卡片加「区域」选择行：`div.ykt-region` + 每区一个 `button.ykt-r[data-act=region][data-region=<id>]`，当前区带 `.on`；配一句「用哪套就选哪个（本校一般是「长江」）。换区等于换一套账号，要重新扫码」。
  - 委托表加 `act === 'region'` 分支：`YKT.setRegion(rid)` → 清 `xxmu_ykt_todo` 与 `__bound` → `paint()` + `renderHomework()` → toast「已切到「X」雨课堂，先点登录扫码」并 return。切区必须清缓存：那是另一套系统里的数据，留着会串。
- `web/app.css`：末尾追加 `.ykt-region / .ykt-region-label / .ykt-r / .ykt-r.on` 浅色 + 三条深色覆盖，全用主题变量（`--fg2 / --mute / --accent / --line / --edge / --bg`）。**首版深色用 `#1b1524` 被「app.css 组件里残留中性硬编码（深色会花脸）」门禁 FAIL，改 `var(--bg)` 后过。**
- `tools/test_yuketang.js`：沙箱升级（`prefs` 真存取、`XXMU.pref` 读写、`Host` 扩 `hasCookieFor / openLoginFor / clearCookieFor / setPref` 并记 `calls.loginUrl / cleared`、`load()` 返回 `windowSw` 暴露 `window.YKT`），新增 ⑩ 组 11 条断言：默认长江、请求域全 `changjiang.yuketang.cn`、Cookie 同域、长江区照旧出 2 作业 1 考试、登录入口指长江、`YKT.setRegion` 存在、切 `standard` 成功、`region()` 读到 `standard`、换区后请求改打 `www.yuketang.cn`、登录入口同步换域、断开只清当前区 Cookie → **49/49**。
- `tools/check_web.js`：追加 v1.1.75 段 15 条锚点（新 const `yt1175 / ap1175 / css1175`，不复用 yt1174）：`changjiang.yuketang.cn`、`var DEFAULT_REGION = 'changjiang'`、`function curRegion`、`function hostNow`、`cookieUrl: hostNow()`、`loggedIn: curLoggedIn`、`openLogin: curOpenLogin`、`logout: curLogout`、`window.YKT`、`act === 'region'`、`data-region`、`data-act`、`ykt-region`、`.ykt-r`、`html[data-theme="dark"] .src-card .ykt-r`。
- `design/sketch/learn-v1166.html`：雨课堂卡加区域行（长江 on）+ 换区说明。
- `apk/v1.1.75.notes.txt`（602 字，学生视角四节：这版修的是「区域」/ 换区要重新登录 / 其余同上一版 / 还是只读）。

门禁：`node --check` 三文件全 0；`test_yuketang` 49/49；全套按退出码 **37/0**；`check_web` `[PASS] 静态体检全部通过`（含 v1.1.75 十五锚点）；`verify_apk` `[PASS] 五件套`；`check_notes` 6/6。

出包：`apk\xxmu-helper-v1.1.75.apk` **934010 字节**，`javac (11 个源文件)` / `d8 (121 个 class)`，签名 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，交付目录 `C:\Users\Administrator\Desktop\xxmuhelper\河医大助手-v1.1.75.apk` 逐字节校验通过。

两档 390×2400 实拍：light 186714B / dark 187380B（read_image 归一化 sha `3680b865d3e5…` / `910518b40c43…`），逐块看过：区域行「区域 长江(on) 雨课堂 荷塘 黄河」在浅色米黄与深色深棕下都清楚，选中态是实心主色块，无白字压白底、无横向溢出。

**未上线**（线上 `/v1/config` 实读仍 1.1.65 / 1165，等 YG 明说「上线」再部署官网 + 切 cfg.latest）。

真机待看：① 装后卡片上「区域」默认选中「长江」；② 点「登录 / 绑定雨课堂」是否打开 `changjiang.yuketang.cn/web` 并扫码成功；③ 扫码回来「重新抓一次」是否真出作业与待考考试；④ 若其实不是长江区，切到对应区域后是否立刻变「未登录」并要求重扫（不能拿旧区数据凑）。

---

### v1.1.74（2026-11-11）—— 雨课堂从「诚实降级桩」变成真接活清单（**本地包 1.1.74 / 1174，未上线；线上仍 1.1.65**）

触发：m03454 原话「接下来做雨课堂吧」→ 出 A（只打待考考试）/ B（+课程列表+每课时间轴）/ C（+course_progress 补截止时间、收已完成）三方案 → m03538 原话「c吧」选定 C。

**端点来源（权威、可复核）**：`powercess/yuketang-mcp` 的 `src/api.ts` 与 `src/tools.ts`（学生端只读接口）。GitHub 直连/raw/jsdelivr/ghproxy 四条 `Invoke-WebRequest` 全部连不上（「基础连接已经关闭」「无法连接到远程服务器」），只有 `mcp__anysearch__extract` 能取到原文——以后要复核这份清单直接走 extract。
- 验登录态 `GET /api/v3/user/basic-info`
- 待考考试 + 正在上课 `GET /api/v3/classroom/on-lesson-upcoming-exam`
- 课程列表 `GET /v2/api/web/courses/list?identity=2`（identity=2 是学生视角）
- 每课时间轴 `GET /v2/api/web/logs/learn/{classroomId}?actype=-1&page=0&offset=50&sort=-1`（`offset` 是每页条数不是跳过条数；`has_more` 不可信，用「返回条数 < offset」判）
- 每课章节进度 `GET /c27/online_courseware/schedule/course/progress/?classroom_id=&course_id=`（截止时间 `score_deadline` 只在这里）
- `type`：5=试卷作业、9=公告、14=上课记录、19=章节作业；`leaf_type`：0=视频、3=推荐、4=讨论、5=考试/作业、6=作业、8=签到、19=章节作业

**实测（无登录态，pwsh Invoke-WebRequest，UA Chrome131 + `xtbz: ykt`）**：`on-lesson-upcoming-exam` → HTTP 200 `{"code":50000,"msg":"UNAUTHENTICATED"}`；`basic-info` 同样；`courses/list` → **HTTP 401**。端点全活，只缺登录态。

**改动**
- `web/yuketang.js` 全量重写（约 400 行）：`api(path)` → `SOURCES.http(BASE+path,{cookieUrl:HOST, referer:LOGIN_URL, headers:'xtbz: ykt'})`；`parse(res)` 三套成功字段分流（`success:boolean` 家族 / `errcode` 家族 / `code` 家族），失败码翻译 50000·401002·10005→「登录失效重新扫码」、40000、80005、80019、20009/20007；`fmt(ms)` 把 <1e12 的按秒级换算成 `YYYY-MM-DD HH:mm`，解析不出返回空串绝不编时间；`pool(items,4,fn)` 限并发；`isDeadlineLeaf(t)` 只认 5/6/19；`fetchTodo` 五步（验登录 → 并发[待考考试, 课程列表] → 逐课并发[时间轴, 章节进度] → 以 `课程|标题` 合并、章节叶补 `end` 与状态 → 零条目时 degraded + `NO_PARSE`）；`SOURCES.define` **去掉 `alwaysDegraded: true` 与 `degradedError`**（不去掉会永远 degraded、且 `hasLogin` 为 false 连登录按钮都不给）。
- `tools/test_yuketang.js` 新建（Node vm 注入假 SOURCES/XXMU/Host/CX，假路由按最长片段命中）：10 组 38 条断言。
- `tools/check_web.js` 追加 v1.1.74 段 11 条锚点（验登录、待考考试、课程列表、时间轴、course_progress、`xtbz: ykt`、`isDeadlineLeaf`、`status_known: false`、`NO_PARSE`、`pool`、不出现 `alwaysDegraded`）。
- `design/sketch/learn-v1166.html` 待完成从 3 条变 4 条（新增雨课堂「第三章 章节测验」12-20 23:59 截止）、雨课堂卡从「暂不可用」改「已读到 · 4 条 · 1 场考试」+ 三条按钮。
- `apk/v1.1.74.notes.txt` 新建（672 字，学生视角）。

**首跑 3 条 FAIL 的真相（教训）**：`④ 收下 3 条` 得到 4 条、`④ 请求量 6` 得到 7、`⑦ 作业 3 条` 得到 4 条——不是适配器重复入列，是 **fixture 的错**：两门课共用同一个 `/c27/.../course/progress/` 假响应，同一批章节叶被记到两门课名下。改成按 `classroom_id=101` / `=102` 分开注册后 38/38 全过。教训：假路由用最长片段命中时，凡带查询参数的接口必须连参数一起写进 key，否则会串数据。

**门禁**：`node --check` 三文件全 0；`test_yuketang` `[PASS] 38 assertions`；`test_xiqueer` 41/41；`test_sources` 7/7；`check_notes` 6/6（672 字）。

**出包**：`bump_ver.py 1.1.74 1174` → 三处 ok。

**未上线**：官网未部署、`cfg.latest` 仍 1.1.65（m00979「我还没说上线」）。真机待看：扫码后能否读到作业、截止时间是否对得上章节进度、首屏耗时是否可接受、未登录/失效时的文案是否说清。



触发：m03290 原话「有了，终于有了」+ 真机截图 m03291（23:03，NOVA 深紫）。v1.1.72 真机确认成功——幽灵考试消失、考试表读到了。卡片数据全对：`📝 高等数学B1 5.0（2026-2027学年第一学期期中考试）` / 未开考 / 喜鹊 / `考试 · 高等数学B1 5.0` / `距开考 还剩 2 天` / `2026-11-14 11:00 ~ 2026-11-14 12:00`。唯一瑕疵：青果「轮次」那格写的是整句「2026-2027学年第一学期期中考试」，学年抬头被原样拼进标题，标题撑成两行、副行又重复课程名。

改动（只动展示，不动取数）：
- `web/xiqueer.js` 新增 `cleanRound(s)`：先剥 `20XX-20XX学年`、再剥 `第?[一二三四1-4]学期`、再兜 `学年|学期`、清空括号残留、压缩空白、去首尾标点、超 20 字截断。`const roundRaw = findVal(seg, '轮次')` → `const round = cleanRound(roundRaw)`。输出对象里 `name` 从 `round ? label + '（' + round + '）' : label` 改为 `name: label`（标题只放课程名）。
- `web/app.js` 副行从 `'考试 · ' + x.course` 改为 `'考试 · ' + (examRound || x.course)`，`examRound` 取 `x.raw.round`。前缀 `'考试 · '` 必须留——`web/nova-organs.js:548-551` 的分面靠 `tt.indexOf('📝 ')===0 || ct.indexOf('考试 · ')===0` 认考试。
- `openExamSheet(e)` 原本就有 `轮次` 行，round 剥净后详情自动变短，无需改。

门禁：`tools/test_xiqueer.js` 新增 ㊵（`2026-2027学年第一学期期中考试` → `name='高等数学B1'` + `round='期中考试'`）、㊶（`期末考试` 同样剥净）→ `[PASS] 41 assertions: pass=41 fail=0`；`tools/check_web.js` 追加 v1.1.73 五条锚点（`function cleanRound` / `const round = cleanRound(roundRaw)` / `name: label,` / `app.js examRound` / `'考试 · ' + (examRound || x.course)`），复用 `wa1171/ma1171/xq1171/ap1171` 不新声明；`design/sketch/learn-v1166.html` 待完成第 3 张换成真机实样（`📝 高等数学B1 5.0` / 未开考 / `考试 · 期中考试`），喜鹊卡改「已读到 · 1 场」+ 上次同步说明。

出包：`python -X utf8 tools/bump_ver.py 1.1.73 1173` → 三处 ok；`python -X utf8 tools/build_apk.py` → assets 49 文件 / javac 11 源文件全过 / d8 121 class / `apk\xxmu-helper-v1.1.73.apk 925818 字节 e9f57c6702f5…` / 签名 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799` / 送桌面逐字节校验通过。全量门禁：`check_web` `[PASS] 静态体检全部通过`、全套 `36/0`、`verify_apk` 五件套 PASS、`check_notes` 6/6。

未上线：按 m03304 原话「好，改吧，先不上线」，官网未部署、`cfg.latest` 仍 1.1.65。真机待看：标题是否变成单行「高等数学B1 5.0」、副行是否显示「考试 · 期中考试」、详情里轮次一行是否只剩「期中考试」。

### v1.1.72（2026-11-11）—— 喜鹊考试：接住「检索」弹出的新窗口，假考试整条丢掉（**本地包 1.1.72 / 1172，未上线；线上仍 1.1.65**）

触发：m03025 原话「还是不行」+ 两张真机截图（22:41，NOVA 深紫万象舱）。截图 A 学习页待完成只剩一条 `📝 未标注课程`，徽标「状态未知」、来源「喜鹊」、时间行「— ~ —」；截图 B 点开详情：「课程=未标注课程 / 开始=— / 结束=— / 状态=未读到（学习通页面里没找到状态位）」。说明 v1.1.71 的双探**确实记到了一条地址并重放了**，但拿回的是外壳页/凭证页，于是造出一场幽灵考试。

**根因两条（本轮定案）**

1. **幽灵考试**：`parseOneText` 在 `course` 为空时回退成「未标注课程」照旧 push，外壳页里零星几个日期/时刻字样就拼出一场无课程名、无时间的假考试，还挂在「待完成 1」要人去交。另外「考试安排表」这行标题字能通过 `isCourseLike()`，冒充成课程名。
2. **新窗口黑洞（五轮读页全空的真凶）**：青果「考试安排表」按下「检索」后，结果用 `window.open`/`target=_blank` 开在**新窗口**。`WebSettings.setJavaScriptCanOpenWindowsAutomatically(true)` 是开着的（`WebActivity.java:408`），但 `WebChromeClient` **没有覆写 `onCreateWindow`** → 每个新窗口都落成 `about:blank` 空壳。这正好对上 m02177 诊断里「#1 about:blank 0字/0表」，也解释了「人明明看见表、程序按完成只读到门户框架页」。前四版（硬猜 jsp / 挖菜单 / iframe / window.frames 递归）都在读**主文档**，从没接过新窗口，所以怎么改都读不到。

**改动**

- **`WebActivity.java`（740→800 行，javac 11 源文件全过，d8 121 class）**：`setWebChromeClient` 内新增 `public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg)`——判 `resultMsg.obj instanceof WebView.WebViewTransport`，建临时 `new WebView(WebActivity.this)`（开 JavaScript/DomStorage/LoadWithOverviewMode/UseWideViewPort），其 `WebViewClient` 里 `take(String u)` 过滤 `u.length()<8 || u.startsWith("about:")` 后 `tmp.stopLoading(); tmp.destroy(); web.loadUrl(u);` 交回主 WebView，`shouldOverrideUrlLoading` 返回 true、`onPageStarted` 也调 take，末尾 `((WebView.WebViewTransport) resultMsg.obj).setWebView(tmp); resultMsg.sendToTarget(); return true;`，外层 try/catch 兜底 return false。`FIND_JS` 由「只遍历一层 `window.frames`」改为 `function walk(w,depth)` 递归（`depth>3` 停、每层最多 20 个），`try{walk(window,1)}catch(e){}`，覆盖门户 frameset + 业务页 iframe 两层。
- **`web/xiqueer.js`**：新增 `autoFail(why)`——`o.fail=(+o.fail||0)+1`，`fail>=2` 就 `ps(AUTO_KEY,'')` 忘掉死地址并提示重新同步，否则保留地址并提示「先保留上次的结果」；`fetchExams` 三条失败路径（无考试条目 / `res.error` / 异常）全部先 `autoFail(...)` 再 `fromSnap(...)` 保旧快照。`isCourseLike` 补挡 `安排表|检索|打印|导出|查询|序号|批次|课程名称`。`parseOneText` 改 `if (!course) return;` + `const label = course;`——**没有课程名就整条丢弃**。`loadSnap()` 读出后按 `String(e.course||'').trim() || String(e.start||'').trim()` 滤掉旧版落下的幽灵条目并回写。`window.XQ` 增 `fail: autoFail`。
- **`web/app.js`**：`openExamSheet` 增 `examSrcName`（`SOURCES.get(e.source||e._src)` 取 short/label，兜底 `xiqueer→喜鹊`），状态说明改为按真实来源说「（喜鹊页面里没有状态这一列）」，不再一律甩「学习通」；`cardOf` 考试时间行改 `const examWhen = (start||end) ? start~end : '时间未读到'`，不再无条件印「— ~ —」。
- **门禁/测试**：`tools/test_xiqueer.js` 新增 ㊲（外壳页 `'考试安排表\n2026-11-14\n11:00-12:00\n检索 打印 导出'` 必须 **0 条**）、㊳（正常表格仍认出医用物理学）、㊴（记地址后连续两次重放失败 → `XQ.auto()===null`、`XQ.has()===true` 保旧快照）→ **39/39 全过**。`check_web.js` 追加 `v1.1.72 checkpoints` 8 锚点（`onCreateWindow` / `WebViewTransport` / `function walk(w,depth)` / `if (!course) return;` / `function autoFail` / `String(e.course || '').trim()` / `时间未读到` / `examSrcName`，复用已有 const 不新声明）。全量 `check_web [PASS]`、全套 `TESTS_PASS=36 TESTS_FAIL=0`、`test_sources 7/7`、`check_notes 6/6`（`apk/v1.1.72.notes.txt`）、`verify_apk 五件套 PASS`。
- **出包**：`bump_ver 1.1.72 1172` → `build_apk` 一次成功，成品 **`apk/xxmu-helper-v1.1.72.apk` 925818 字节 / SHA-256 `80665399dcb9…`**，签名 `0e684845…11157799` 可盖装，送桌面 `xxmuhelper\河医大助手-v1.1.72.apk` 逐字节校验通过。两档 390×2400 实拍（light 182663B sha `573d41759f…`、dark 183414B sha `127888bf75…`）逐块核对通过：主窗口待完成 3 条 + 已完成切换块 + 来源 chips + 二级半框喜鹊 v1.1.72 态（自动同步一次 / 剪贴板兜底 / 打开教务网 / 粘贴框 / 导入这段 / 登录 / 复制诊断），浅色纸感、深色深棕均无白字压白底、无横向溢出。**未上线**：m00979「我还没说上线」+ 记忆 0mwbtyww，官网部署与 cfg.latest 留给 YG 点头，线上实读 `/v1/config` 仍 1.1.65。
- **真机待测（一律未声称验证）**：①按「检索」后新窗口是否被接住、表是否读得到；②「未标注课程 · — ~ —」是否彻底消失（旧条目重开学习页应自动清掉）；③自动地址连续两次失败后是否忘掉并提示重新同步、旧考试是否保住；④清掉考试与自动地址是否不牵连教务登录态与课表。

---

### v1.1.71（2026-11-11）—— 喜鹊考试改「点一次，之后自己同步」（方案 C 双探全自动 + 复制兜底）（**本地包 1.1.71 / 1171，未上线；线上仍 1.1.65**）

触发：m02339 原话「能不能不用复制的，就按自动的，你都能爬取课表为什么不能爬取考试」——直接纠正 v1.1.70「换执行层剪贴板」被判早了。复核 `web/sync.js:14`：`const KB_PATH = '/student/wsxk.xskcb_excel10319.jsp?params=';`，课表靠这个**免令牌报表端点**（b64(`xn&xq&xh`) + 带 Cookie 直出 GBK 表，不需菜单/AJAX/检索/令牌）全自动；考试四版（v1.1.66 硬猜 jsp / v1.1.67 挖菜单 / v1.1.68 iframe / v1.1.69 window.frames 递归）从没试过同款报表端点，「考试安排表」页上的「检索 / 打印 / 导出」按钮正是线索。出 A/B/C 三套全自动方案，m02392「c」选定 C＝双探一次做齐、谁先拿到可用地址用谁、都堵才诚实降级回剪贴板/粘贴。

- **Java 桥（纯增量，javac 11 源文件全过，d8 120 class）**：`WebActivity` 加 `EXTRA_PROBE="probe"`、字段 `probe`/`java.util.ArrayList<String> probes`；onCreate `probe=getBooleanExtra(EXTRA_PROBE,false); if(probe){find=true;capture=true;}` 复用 find→capture→grabFind 链；`WebViewClient` 加两个 `shouldInterceptRequest`（`WebResourceRequest` 版取 `getUrl()/getMethod()` + 旧 `String` 版）旁路 `recordProbe(url,method,"request")` 后 `return null` 不改页面；`web.setDownloadListener(new android.webkit.DownloadListener(){...})` 钩「导出/打印」`recordProbe(u,"GET","download")`；`recordProbe` 滤 about:/data:/图片/字体/样式（**别用 `low.indexOf(".js")` 过滤，会误伤 .jsp**）、去重限 80 条、`org.json.JSONObject` 存 `{url,method,kind}`；`completeCapture()` 在 probe 模式把 probes 并进 lastCap 对象 `o.put("probes",arr); o.put("probe",true)`。全部用全限定名、无新 import。`MainActivity` 加 `REQ_PROBE=1011` / `pendingProbeCb` / `@JavascriptInterface openProbeFor(url,title,cbName)`（putExtra `EXTRA_PROBE=true` → `startActivityForResult(it,REQ_PROBE)`），onActivityResult 在 REQ_FIND 之后插 REQ_PROBE 分支，一次性消费 cb 后**复用既有 `notifyFindDone(payload,cb)`**（`JSONObject.quote` 拼 `window[cb](<lit>)`）。
- **web/xiqueer.js（34 处补丁，31967 字节）**：删「fetchExams 只读快照不做任何裸 HTTP 抓取」过时断言；加 `AUTO_KEY='xxmu_xq_auto'`、`autoLoad()/autoSave(url,kind)`（存 `{url,at,kind}`）、`probe()`（`Host.openProbeFor(HOME,'自动同步 · 检索或导出后按完成','__onXqProbe')`，退 `openFinderFor`）、`htmlToText(html)`（tr→\n、td/th→\t、stripTags）、`fromSnap(prefix)`、**替换 `fetchExams`**：见 AUTO_KEY 则 `SOURCES.http(auto.url,{cookieUrl:BASE+'/',referer:HOME,method:'GET'})` → `parseCapture(htmlToText(res.text))` → 认出 `save(exams,auto.url,'全自动同步')` 返回 ok；重放失败/认不出 `fromSnap(...)` **保留旧快照**，绝不把凭证失效页当 0 条；无 AUTO_KEY 直接 `fromSnap('')`（零 HTTP，稳住旧断言）。`probeScore(p)` 打分（download +4、params=/excel +4、export/print +3、ksap/exam/kaoshi/kscx +3、.jsp/.action/.do +1、GET +1、POST -3；homes.action/menu.jsp/login/custom/js/静态资源归零）；`window.__onXqProbe`：页面直接渲染表→当场 `save`+`fireSync`+toast；否则挑 probes 最高分 ≥5 → `autoSave`+LAST_DIAG+`fireSync`+toast「记住地址，之后自动」；两路都挡→`ps(RAW_KEY,rawTextOf(obj))`+`SrcUI.paint()`+textarea rows=5 摊原文+toast，剪贴板/粘贴兜底保留。`clear()` 连 `AUTO_KEY` 一起清。`NOEXAM` 保留「三步」子串、`defaultDiag()` 保留「读回整页」子串以兼容旧断言。
- **app.js / 样张 / notes**：喜鹊卡换 v1.1.71 态——主按钮「自动同步一次」(`data-act=probe`)、「从剪贴板导入（兜底）」(`data-act=paste`)、「打开教务网」(`data-act=find`)、textarea 回填 `XQ.lastRaw()`、「导入这段」；`bOut` 文案「清掉考试与自动地址」；委托表 `const act=...` 后插 `probe` 分支；out 确认改「清掉已经读到的考试和记住的自动地址？教务登录不会受影响。」。`apk/v1.1.71.notes.txt` 782 字学生视角（点一次→检索/导出→完成→之后全自动 + 双探原理 + 兜底 + 只读 + 群号 1097668324）。
- **门禁**：补丁脚本 `design/sketch/_apply_v1171.py` 仿 v1.1.70 的 CRLF 归一机制（MainActivity.java 是 CRLF、其余 LF；每锚点 `count==1` + 只防 `old==new`）；首跑 `ANCHOR_FAIL web/xiqueer.js edit 4 count=0`（defaultDiag 散文断行位置与磁盘不符）→ 重读 `web/xiqueer.js:33-82` 改锚点后 `ANCHOR_CHECK_OK edits=34 files=7`。`tools/test_xiqueer.js` 沙箱注入 `httpBox`/`Host.openProbeFor`/`calls.probe+httpUrls`，新增 ㉛-㊱ 六条（probe 挂回跳 / 记住 ksap_excel 地址+SrcUI.sync / fetchExams 全自动重放发 1 次 http 认出医用物理学 / 重放认不出保留旧快照 / 两探针都挡摊 RAWTEXT_probe / 页面直接渲染表当场认出零 HTTP）→ **36/36 全过**；`check_web.js` 追加 `v1.1.71 checkpoints` 11 锚点（新 const wa1171/ma1171/xq1171/ap1171 避免重复声明）。全量 `check_web [PASS]`、全套 `36 ok / 36`、`test_sources 7/7`、`check_notes 6/6`、`verify_apk 五件套 PASS`。两档 390x2400 实拍（light sha `0972402213…`、dark sha `0e4a07ee8…`）逐块核对通过：主窗口待完成/已完成切换 + 来源 chips + 二级半框喜鹊 v1.1.71 完整态（自动同步一次主按钮 + 剪贴板兜底 + 打开教务网 + 粘贴框 + 导入这段），浅色纸感/深色深棕都无白字压白底、无溢出。
- **出包**：`bump_ver 1.1.71 1171` → `build_apk` 一次成功，成品 **`apk/xxmu-helper-v1.1.71.apk` 921722 字节 / SHA-256 `f37e78770dc4923af97e4b734a75505bf596ab59cf8b9d8046601d1ddcf26dc2`**，签名 `0e684845…11157799` 可盖装，送桌面 `xxmuhelper\河医大助手-v1.1.71.apk` 逐字节校验通过。**未上线**：m00979「我还没说上线」+ 记忆 0mwbtyww，官网部署与 cfg.latest 留给 YG 点头，线上实读 `/v1/config` 仍 1.1.65。
- **真机待测（一律未声称验证）**：点「自动同步一次」后在「课程考试 → 考试安排表」选学年学期/批次按「检索」或「导出」，`shouldInterceptRequest`/`DownloadListener` 是否真拦到报表 URL 并记住；第二次起刷新是否像课表一样全自动出考试（带 Cookie 重放不被令牌挡）；两路都被挡时原文摊框 + 剪贴板/粘贴兜底是否清楚；「清掉考试与自动地址」是否不牵连教务登录态与课表。

---

### v1.1.70（2026-11-11）—— 喜鹊考试换执行层「你复制、App 解析」（剪贴板一键导入）（**本地包 1.1.70 / 1170，未上线；线上仍 1.1.65**）

触发：m02177 第四轮真机报障「检索了还是不行」+ 诊断全文 + 两张截图（m02179 学习页喜鹊卡「已绑定，未刷新」+ toast「这一页没认出考试表」+ textarea 摊出的是「学籍档案 / 学籍异动 / 培养方案 / 辅修事宜」那串门户首页菜单；m02181 是无关的 AI+医学 PPT 截图）。诊断 verbatim：「辅助发现：打开了 https://qgjw.xxmu.edu.cn/frame/homes.action?v=79848703084729403858173，顶层 256 字，递归读了 2 个框架（含 <frame>）：#0 https://qgjw.xxmu.edu.cn/frame/jw/teacherstudentmenu.jsp?menucode=S204 29字/0表；#1 about:blank 0字/0表，仍没认出考试条目。」→ **按「完成」那一刻程序够到的只有门户框架页，检索出的考试表根本不在 App 能 evaluateJavascript 到的文档里**（内容帧 about:blank）。四轮（v1.1.66 硬猜 jsp / v1.1.67 挖菜单 / v1.1.68 iframe 读页 / v1.1.69 window.frames 递归）全卡在「App 主动去够青果页面」这一层，它一直挡。定案换执行层：不再赌读页，人在自己看得见的那页长按复制，App 读系统剪贴板自己解析。

- **Java 桥（纯增量，javac 11 源文件全过）**：`MainActivity.Host` 加 `@JavascriptInterface public String getClip()`（`ClipboardManager.getPrimaryClip().getItemAt(0).getText()`，60000 字封顶，异常返回 ""），与既有 `getPref()` 同款同步返回 String 桥；`file://` 下拿不到 `navigator.clipboard`，只能走原生。`openFinderFor` 保留但喜鹊不再挂自动读页回跳。
- **web/xiqueer.js（17 处补丁之一，共 448 行基础）**：新增 `NO_CLIP`（剪贴板空的清楚提示）、`importClip()`（`Host.getClip()` → `parseCapture` → 认出则 `save` 一步落快照；空/认不出返回 `{count:0,error,raw}`，认不出时把原文写 `RAW_KEY` 摊进框给人改，绝不落空快照）；`NOEXAM` / `NO_PARSE` / `defaultDiag()` 文案全改成「复制优先」；`find()` 改只开教务门户方便复制，`cb` 传空串（`notifyFindDone` 因回调名为空直接 return，不再弹「没认出」）；`window.XQ` 暴露 `importClip`。卡片/表格式/不带年份「11月14日」补年/诚实状态等解析全部沿用 v1.1.69，零 HTTP。
- **app.js / 样张 / notes**：喜鹊卡主按钮改「从剪贴板导入」(data-act=paste)，「去教务里找考试安排表」降级为 ghost「打开教务网（复制考试表用）」；委托表新增 `paste` 分支（`XQ.importClip()` → 认不出把 raw 摊进 textarea + showTip，认出则 paint+renderHomework+toast+`sync(id,true)` 重建聚合缓存）；hint2 改「你复制、App 解析」。样张喜鹊卡同步改 v1.1.70 态；`apk/v1.1.70.notes.txt` 818 字学生视角（根因四轮 + 三步用法 + 摊原文 + 清快照 + 诚实状态 + 群号 1097668324）。
- **门禁**：`tools/test_xiqueer.js` 沙箱注入 `clipBox` + `Host.getClip`，⑱ 断言改「find() 回跳名留空」，新增 ㉗-㉚（剪贴板有考试表一步认出 / 空剪贴板清楚提示不落空快照 / 首页菜单认不出摊回 raw）→ **30/30 全过**；`check_web.js` 追加 `v1.1.70 checkpoints` 5 锚点（`public String getClip()` / `importClip` / `NO_CLIP` / `Host.getClip` / `act === 'paste'`，复用已声明 const 不重复声明）。全套 `check_web PASS`、`36 ok / 36`、`test_sources 7/7`、`check_notes 6/6`、`verify_apk 五件套 PASS`。补丁脚本 `design/sketch/_apply_v1170.py` 先校验 17 锚点再一次性写盘（首跑因 MainActivity.java 是 CRLF 而锚点按 LF 写 → count=0 失败，改为按文件原行尾归一化匹配、写盘时还原 CRLF；二跑又因 `len(n)<=len(o)` 把「整行换短文案」误判 NOOP_OR_SHRINK → 去掉长度判据只防 `o==n`，三跑 `ANCHOR_CHECK_OK edits=17`）。两档 390x2400 实拍（light sha `28acf7c3…`、dark sha `94f17bc2…`）逐块核对通过：主窗口待完成/已完成切换 + 来源 chips + 二级半框喜鹊 v1.1.70 态（从剪贴板导入主按钮 + 打开教务网 ghost + textarea + 导入这段），浅色纸感/深色深棕都无白字压白底、无溢出。
- **出包**：`bump_ver 1.1.70 1170` → `build_apk` 一次成功，成品 **`apk/xxmu-helper-v1.1.70.apk` 917626 字节 / SHA-256 `8c9e41e65613…`**，签名 `0e684845…11157799` 可盖装，送桌面 `xxmuhelper\河医大助手-v1.1.70.apk` 逐字节校验通过。**未上线**：m00979「我还没说上线」+ 记忆 0mwbtyww，官网部署与 cfg.latest 留给 YG 点头，线上实读 `/v1/config` 仍 1.1.65。
- **真机待测（一律未声称验证）**：在教务「考试安排表」检索出表或喜鹊儿 APP「考试安排」页长按复制后，点「从剪贴板导入」能否读出系统剪贴板并认出课程/起止/考场；空剪贴板/复制了首页菜单时的提示与原文摊框是否清楚；「打开教务网」是否只开门户不误弹「没认出」。

---

### v1.1.69（2026-11-11）—— 喜鹊「考试安排表」在 `<frame>` 里，读页桥连框架一起读（frame 递归 + 原文可见兜底）（**本地包 1.1.69 / 1169，未上线；线上仍 1.1.65**）

触发：m01910 第三轮真机报障「课程考试里，有考试安排，但是得选择学年学期索引，我索引出来点完成也没用」+ 三张真机截图（m01912 教务门户首页「课程考试」磁贴、m01914 「课程考试 → 考试安排表」页：标签行「申请缓考 / 查看缓考信息 / 考试安排表 / 申请补考 / 考试选择信息」+「检索 / 打印 / 导出」+ 学年学期/考试批次两个下拉 + 主体空白、m01916 学习页 toast「这一页没认出考试安排」）。用户 m01951 追问「喜鹊的内容在教务网都有，是不是爬取教务网的数据就行了」——方向对（读的正是教务网），但「发包去爬」已被三轮判死（V17 业务页防直链、裸 HTTP 全被挡成凭证失效/404，只有带登录态真浏览器进得去），正确姿势是「在浏览器里读已渲染的表」。

根因：**青果 V17 的「考试安排表」渲染在 `<frameset>/<frame>` 里**，检索出的表在子 frame；v1.1.68 的 `FIND_JS` 只 `document.getElementsByTagName('iframe')`，顶层 `document.body.innerText` 近空 → 回传 `{text:'',frames:[]}` → `parseCapture` 空 → 报「没认出」。modlens OCR 本机无 provider（`Error: No vision provider is set up on this machine`），读图靠 read_image 看原图；web_search 青果 frameset 结构只返回 KINGOSOFT V17 PDF/手册、无具体端点 → 印证别再猜地址。

- **Java 桥（纯增量，javac 11 源文件全过）**：`WebActivity.FIND_JS` 全量重写——`grabDoc(d)` 读 `body.innerText||textContent`（slice 30000）+ 前 400 个 `<tr>` 行 + 前 20 张 `<table>`（slice 6000）+ 前 20 个 `<select>` 已选 `option.text`（学年学期/考试批次）；`var top=grabDoc(document)` 填 `o.text/rows/tables/sels`；**遍历 `window.frames`（覆盖 `<frame>`+`<iframe>`）** 对每个同源 frame 再 `grabDoc` 填 `o.frames[i]={u,text,rows,tables,sels}`（跨域 `contentDocument` 抛 SecurityError 留空）；拼 `parts` 成 `o.raw=parts.join('\n').slice(0,60000)`。返回**对象** `{u,text,rows,tables,sels,frames[],raw}`。
- **web/xiqueer.js 全量重写（448 行）**：新增 `RAW_KEY='xxmu_xq_last_raw'`、`lastRaw()`、`rawTextOf(obj)`（raw 优先，否则拼 text/rows/tables/sels+frames）、`refYearOf(text)`/`findMdDateTime(line,ry)`（认不带年份「11月14日 11:00」按学年推年，必须带「月」字）；`collectBlocks` 的 `addDoc(d)` 认 `d.text/rows/tables` 并 `d.frames.forEach(addDoc)` 递归（**raw 不进解析块**，不凭下拉/原文造影子考试）；`parseOneText` 支持缺 t1 时向下两行配 `HH:MM`；`window.__onXqFind` **认不出分支**：`ps(RAW_KEY,rawTextOf(obj))` 存下读回原文 + LAST_DIAG 拼「打开了 url，顶层 N 字，递归读了 nf 个框架（含 `<frame>`）…请选好学年学期和考试批次、按「检索」把表查出来再按「完成」；读回原文已放进喜鹊卡片的框」+ `SrcUI.paint()` + `document.querySelectorAll('textarea.src-paste')` 逐个 `value=rawText.slice(0,20000)` / `rows='5'` + toast，把黑盒解析变可见原文兜底；成功分支 `save`+`SrcUI.sync('xiqueer',true)`。`save` 写快照后 `ps(RAW_KEY,'')`，`clear()` 连原文一起清；`find()` 标题改「考试安排表 · 检索出表后按完成」。
- **app.js / 样张 / notes**：cardNode 喜鹊 hint2 改「进「课程考试 → 考试安排表」，选好学年学期按「检索」查出表，再按「完成」；没认出时读回原文会摊进下面的框」；按钮改「去教务里找考试安排表」；textarea 初始值 `XQ.lastRaw().slice(0,20000)`、有原文时 `rows=5`（paint 重建后回填）；样张 `design/sketch/learn-v1166.html` 喜鹊卡同步改 v1.1.69 态 + 注解「这一版连 `<frame>` 框架一起读回」；`apk/v1.1.69.notes.txt` 749 字学生视角（根因/用法/摊原文/清快照/不带年份补年/诚实状态/雨课堂知到暂不可用/更新群 1097668324）。
- **门禁**：`tools/test_xiqueer.js` 全量重写 26 断言（在 20 条基础上加 frame 递归认出、`tables[]` 数据行认出、只有 sels/raw 不造影子、「11月14日」按学年补年、认不出落进 `lastRaw()`、摊进两个 textarea 且 `rows=5`/clear 连原文清；load() 沙箱加 `document.querySelectorAll` stub + `mkTa()`）；`check_web.js` 追加 `v1.1.69 checkpoints` 8 锚点（`window.frames`/`sels`/`o.raw`/`findMdDateTime`/`rawTextOf`/`RAW_KEY`/`lastRaw`/`XQ.lastRaw()`，复用已声明 const 不重复声明）。全套 `check_web PASS`、`36 ok / 36`、`test_xiqueer 26/26`、`test_sources 7/7`、`check_notes 6/6`、`verify_apk 五件套 PASS`。两档 390x2400 实拍（light sha `113ed4ee…`、dark sha `d424daab…`）逐块核对通过：主窗口待完成/已完成切换 + 来源 chips + 二级半框喜鹊 v1.1.69 完整态（新按钮/textarea/框架注解），浅色纸感/深色深棕都无白字压白底、无溢出。
- **出包**：`bump_ver 1.1.69 1169` → `build_apk` 一次成功，成品 **`apk/xxmu-helper-v1.1.69.apk` 917626 字节 / SHA-256 `20a0516a1692…`**，签名 `0e684845…11157799` 可盖装，送桌面 `xxmuhelper\河医大助手-v1.1.69.apk` 逐字节校验通过。**未上线**：m00979「我还没说上线」+ 记忆 0mwbtyww，官网部署与 cfg.latest 留给 YG 点头，线上实读 `/v1/config` 仍 1.1.65。
- **真机待测（一律未声称验证）**：进「课程考试 → 考试安排表」选学年学期+考试批次按「检索」出表后，`window.frames` 是否真读到子 frame 表格；按「完成」回传的 `frames[]/tables[]` 能否被 parseCapture 认出；没认出时原文是否真摊进 textarea 可编辑再导入；「清掉导入的考试」是否只清快照+原文、不牵连课表登录态。

---

### v1.1.68（2026-11-11）—— 喜鹊考试改「你带路、程序读页」（WebView 辅助发现 + 粘贴兜底）（**本地包 1.1.68 / 1168，未上线；线上仍 1.1.65**）

触发：m01318 真机诊断全文 + 两张真机截图（m01320 主窗口 / m01322 喜鹊儿 APP 考试安排卡片）。v1.1.67「抓 9 菜单页挖链接→按考试分排序→验真表头」被真机彻底证伪：`/frame/homes.action` 活页 32382B（11 条业务链接）、`/frame/desk/changeUserGroupcode.action` 真页 21630B，但 7 条 `/student/ksap*.jsp?menucode=S20302` 全「凭证失效页」、`/frame/homepage.action` 等 7 页 HTTP 404。根因＝KINGOSOFT V17 用 `.action`/`.do` Struts + AJAX 动态菜单 + KingoEncypt 动态令牌（CSDN 89375147 `getEncParams` / `custom/js/SetKingoEncypt.jsp`），裸 HTTP 无浏览器上下文进不去业务页；喜鹊儿 APP 又是卡片式数据（考试性质/轮次/考试地点/座位号），非青果网页 GBK 表格。本机 `data/session.json` Cookie 已过期（探针 `_probe_v17.py` 复现不了活会话；注：`get_gbk` 无 timeout 形参，探针首跑 TypeError 后改用 `get()`）、外网 uint128 协议分析 / kancloud 开发指南 / seebug / anysearch 全拿不到活考试页地址、APP `wapController.jsp` 有版本门「请升级到最新版本」+ `libkdvmp.so` 9.3MB dex VMP → **猜端点 / 挖静态 HTML 这条路彻底作废**，改为让真浏览器带活会话自己跑 JS。

- **Java 桥（纯增量，`javac` 11 源文件全过）**：`WebActivity` 加 `EXTRA_FIND`（值 find）+ `FIND_JS`（抓 top document 与全部同源 iframe 的 `innerText`、前 400 个 `<tr>` 行，返回**对象** `{u,text,rows,frames[]}`，60KB / 20 iframe 封顶）+ `find` 字段与 `grabFind()`（复用 capture 的顶栏「完成」按钮与 800ms 轮询，但不置 `EXTRA_DETECT_LOGIN`，免得按 URL 自动收工拿不到 `EXTRA_RESULT`）；`MainActivity` 加 `@JavascriptInterface openFinderFor(url,title,cbName)` + `REQ_FIND=1010` + `pendingFindCb` + `notifyFindDone(payload,cb)`（`JSONObject.quote` 把整页 JSON 文本包一层成 `window[cb](str)`，前端 JSON.parse，仿 notifyWaterCapture）。真浏览器里 AJAX 菜单会真加载、KingoEncypt 令牌会自动建立，绕开裸 HTTP 防直链。
- **web/xiqueer.js 全量重写（334 行）**：删掉裸 HTTP 硬抓；`window.XQ={find,importText,clear,has,parse,fetch}` + `window.__onXqFind`（JSON.parse → parseCapture → 存快照 → `SrcUI.sync('xiqueer',true)`）；`parseCapture` 认三种形态（喜鹊儿卡片式 `[yg0231]高等数学B1` + `2026-11-14(11周 星期六)11:00-12:00` 夹括号周次 + 字间带空格的 `考 试 地 点：` 标签 / 表格式 `<tr>` innerText〔`\t` 压成空格，不压成换行，否则课程时间考场拆散〕/ 自由文本），按 `course|start` 去重、slice(0,60)；「只有日期没时刻」也给一条但 `start/end/status` 全留空（绝不编「已完成」，`CX.classify` 无状态→unknown）；快照 pref `xxmu_xq_capture={exams,url,at,diag}`；`fetchExams` **零 HTTP 只读快照**，有数据回 `ok` 并回传 `synced_at=at`（`sources.js` refresh ok 分支 `now()` 改 `r.synced_at||now()` 保留导入时间），没数据回 degraded 给「三步」指引。define 的 key 换 `xxmu_xq_capture_src` 避开 v1.1.67 旧缓存。
- **app.js / app.css / 样张**：喜鹊卡加「去教务里找考试安排」+ textarea「粘贴考试安排」+「导入这段」+ 委托 find/import；import 成功后补一次 `sync(id,true)` 重建聚合缓存（否则 live() 读旧降级态）；out 分支 xiqueer 特殊走 `XQ.clear()+SOURCES.refresh`，**绝不 `SOURCES.logout`**（`clearCookieFor(教务)` 会把课表一起登出）；`openExamSheet` 补考场 / 学分 / 轮次 / 考试性质 / 座位号行（缺字段整行不画，不用「—」冒充读到）；textarea 用纯主题变量（首版 `var(--ink,#2B2318)` 兜底硬编码被 check_web「深色会花脸」门禁抓到，改 `var(--ink)`）。雨课堂 / 知到仍诚实标「暂不可用 / 本机预留接入」。
- **门禁**：一次性补丁 `design/sketch/_apply_v1168.py` 先校验 19 锚点再 WriteAllText（首跑 `if old in new` 把「插入式保留 old」误判成没改，改 `old==new` / `len(new)<=len(old)` 后 `ANCHOR_CHECK_OK edits=19`）；`tools/test_xiqueer.js` 全量重写 20 断言（卡片式 / 表格式 / iframe 去重 / 多考试不串 / 只有日期 / no-parse / clear / find 回跳 / 零 HTTP）；`check_web.js` 加 v1.1.67-68 锚点（首跑 `const webAct` 与 :1300 FIT_JS 段重复声明 → 改 `webActFind`）。全套 `36 ok / 36`、`test_sources 7/7`、`check_notes 6/6`、`verify_apk 五件套 PASS`、`check_web PASS`。两档 390x2400 实拍（light sha `ca8316f1…`、dark sha `28c17ad1…`）逐块核对通过：主窗口待完成 / 已完成切换 + 来源 chips + 二级半框里喜鹊 v1.1.68 完整态，浅色纸感 / 深色深棕都无白字压白底、无溢出。
- **出包**：`bump_ver 1.1.68 1168` → `build_apk` 两次（第二次为同步 app.css 修复进 assets），成品 **`apk/xxmu-helper-v1.1.68.apk` 913530 字节 / SHA-256 `22bdb9e7e5e4…`**，签名 `0e684845…11157799` 可盖装，送桌面 `xxmuhelper\` 逐字节校验通过。**未上线**：m00979「我还没说上线」+ 记忆 0mwbtyww，官网部署与 cfg.latest 都留给 YG 点头，线上实读 `/v1/config` 仍 1.1.65。
- **真机待测（一律未声称验证）**：点「去教务里找考试安排」打开的框架页里 AJAX 菜单 / KingoEncypt 是否真建立；点开「考试安排」按「完成」回传的整页能否被 parseCapture 认出；从喜鹊儿 APP 复制文字粘贴导入能否落进详情半框；「清掉导入的考试」是否只清快照不牵连课表登录态。

---

### v1.1.67（2026-11-11）—— 喜鹊考试改「动态发现」+ 诊断回传（**本地包 1.1.67 / 1167，未上线；线上仍 1.1.65**）

触发：m01034「喜鹊还是没用」+ 两张真机截图（m01036 / m01038）。读图定案：真机教务 Cookie 是活的（「断开喜鹊」按钮在、学习通同步正常），但 v1.1.66 写死的 7 条 jsp 路径一条都没命中，却把失败误写成「考试安排页未定位到（本机教务登录态已过期…）」，且 SrcUI 只在 nologin/stale 态画登录按钮 → degraded 态既没「重新登录」也没诊断出口。三重错：硬猜 URL + 错误文案 + 缺兜底。本机探针（`design/sketch/_probe_ks.py`）确认 `data/session.json` 的 JSESSIONID 已过期、公开登录页无菜单树；外网（uint128 逆向文、lizhengqiang/kingosoft_api README、anysearch）都拿不到活考试页地址 → 定案让真机登录后自己发现。

- **web/xiqueer.js 全文重写**：MENU_PAGES 9 条框架/菜单页并行 `Promise.all` 抓 → `collectLinks(html)` 正则挖 href/src/url/onclick 里的 jsp|action|do 链接并绝对化去重 → `examScore(u)` 按 ks/kaoshi/exam/考试/menucode 打分 → `discovered.sort(...).concat(CANDS).slice(0,MAX_PROBE=22)`（菜单发现优先、7 条硬猜兜底、命中即停）→ 逐个验真「课程名称 + 考试时间/考场」同行表头，命中 parseExams 记住真地址。删掉误人的 MISS_ERR，degraded 改实话「没定位到考试安排页：已带登录态找过 N 个菜单页、验真 M 个候选…」。
- **诊断回传链**：xiqueer.fetchExams 每步写 DIAG 并随结果回传 `diag:` → sources.js refresh() 三处落盘都存 diag、新增 `function diag(id)` 透出 → app.js 连接卡加「复制诊断」按钮（data-act=diag，Host.clip→navigator.clipboard→showTip 兜底），自动发现漏了时用户复制探针结果发群下轮钉死。
- **登录按钮放宽**：cardNode 的 bLogin 改「登录 / 重新登录教务」，显示条件从 `(nologin||stale)` 放宽到 `s.hasLogin && s.state!=='ok'`（雨课堂/知到 hasLogin=false 不受影响）；bDiag 只在 degraded/stale 显。四按钮纵向堆叠。
- **门禁**：新建 `tools/test_xiqueer.js`（Node vm 跑真 xiqueer.js + 造菜单页/考试表/STALE fixture，7 断言含「菜单发现的非硬猜路径能命中」「命中即停时 CANDS indexOf=-1 也算排在前面」「stale 不冒充 0 条」）；check_web.js 加 v1.1.67 五锚点 + spawn test_xiqueer；check_notes.js 6/6（notes 初版含「- 」项目符号被 `!/^\s*[-*]\s/m` 判 FAIL，重写成纯文本）。全套 `36 ok / 36`、verify_apk 五件套 PASS。
- **出图与出包**：`design/sketch/learn-v1166.html` 喜鹊卡改诚实降级态 + 四按钮，浅/深两档 390×2600 实拍（light sha `2d253f8f574c…`、dark sha `b50d556f1a46…`）逐块核对通过。`python -X utf8 tools/build_apk.py` 成品 **`apk/xxmu-helper-v1.1.67.apk` 909434 字节 / SHA-256 `d08253044bbf…`**，签名 `0e684845…11157799` 可盖装，送桌面 `xxmuhelper\` 逐字节校验通过。**未上线**：m00979「我还没说上线」+ 记忆 0mwbtyww，官网部署与 cfg.latest 都留给 YG 点头。
- **真机待测（一律未声称验证）**：动态发现能否在 XXMU 真机教务菜单里命中真考试表；点「复制诊断」回传的链接清单能否定位真地址；雨课堂微信扫码抓包端点；知到 CAS/SSO 二跳签名活接口复验。

---

### v1.1.66（2026-11-11）—— 学习页多平台作业考试待办聚合（方案 B）（**本地包 1.1.66 / 1166，未上线；线上仍 1.1.65**）

触发：m00002 要学习栏加喜鹊考试 / 知到作业考试 / 雨课堂作业考试待办、先看可行性再给方案 → 三套方案（A 全端侧实时聚合 / B 按可行性分三批〔推荐〕/ C 最小侵入快照），m00167「吧吧，开始做」+ m00216「可以请 ai 组建团队」授权按 B 组队落地。调研定案：喜鹊儿＝青果官方 APP 与 qgjw.xxmu.edu.cn 同后端同账号，攻其 APP 接口要过 libkdvmp.so dex VMP + 版本门（16 个版本号全无效）→ 复用青果网页端登录态；雨课堂有 @powercess/yuketang-mcp 只读端点；知到有 CAS/SSO 二跳签名、逆向仓库多归档需真机复验。

- **契约与组队**：`docs/multi-source-SPEC.md` 为并行唯一契约（8 铁律、文件所有权、Wave2 流程）；web/sources.js 聚合器导出 register/define/http/status/live/…（状态机 ok|stale|degraded|nologin|idle，只并 `state==='ok'&&synced_at>0`，产出 `_source:'multi'` 单一 d，学习通包装成 builtin）。5 路 teammate 并行：adapters 建 web/xiqueer.js / yuketang.js / zhihuishu.js；bridge 改 MainActivity.java 加 @JavascriptInterface `openLoginFor` + REQ_SRC(1009) + pendingSrcCb + notifySrcDone（javac EXIT=0，openWebFor/REQ_LOGIN 零改动）；ui-html 改 index.html 加 #srcCards/#srcChips + 4 script；ui-css 在 app.css 尾加 .src-* 浅/深两套；tests 建 tools/test_sources.js（7 断言）+ check_web 锚点。
- **app.js 8 改点**：`SOURCES.live()` 合并替代单 CX.cached()、READ_ERR 汇总、srcTag 多平台标签、来源筛选 SRCF_K / curSrcFilter、cardOf 来源徽标、SrcUI 模块（连接卡/筛选/事件委托）、CxUI 联动；修「假登录按钮」隐患（hasLogin/alwaysDegraded/degradedError，status 精确判 degraded，sync 去掉未登录前置拦截）。雨课堂/知到 `alwaysDegraded:true` 诚实标「暂不可用」，从不 ok、不填「已完成」。
- **追加两轮用户反馈**：m00638「账号绑定作为二级窗口，主窗口还是以显示待完成任务为主」→ 沿用 #toolPark→#sheet 半框，cxCard+srcCards 收进 #bindCard，主页只留细入口 #bindEntry + 任务列表，sh-close/遮罩统一走 closeSheet()；m00831「待完成旁边加已完成，点击切换」→ #doneSeg + DVIEW_K='xxmu_done_view'，已完成视图平铺、状态没读到的一律留待完成。
- **出图定案（截图伪影）**：无头 Edge `--window-size=390` 实际渲染内宽 492（Chromium 最小窗口宽），`--screenshot` 只截 390 → 右边 102px 硬裁；探针实测 `scrollWidth==clientWidth==492` 证明无横向溢出。修法：样张内联 `html,body{width/min/max:390px!important;overflow-x:hidden!important}`。前两版「右侧裁切」全是此伪影，非布局 bug。
- **门禁**：bump_ver 1.1.66/1166 → build_apk（sync_assets 扫 web/ 全量 49 文件）→ check_web PASS（v1.1.66 十二锚点）→ test_sources 7/7 → 全套 35/35 → verify_apk 五件套 PASS。修 tools/test_theme.js 既有缺陷（同选择器多段 `indexOf` 抓首段「晾相片」局部深色块、漏主深色块致 3/111 失败 → 遍历取变量最多那段）。成品 `apk/xxmu-helper-v1.1.66.apk` 909434 字节 / sha `7c9e48bc8b8a…`，已 present 交付。**未上线**：m00979「我还没说上线」喊停，官网同步脚本在 `MISS: hero lead` 抛错（三文件线上零改动），`/v1/config` 实读仍 1.1.65。

---

### v1.1.65（2026-11-11）—— 全员下线重绑教务网（方案 A / cfg.rebindAt O(1) 可逆一键重绑）（**已上线 1.1.65 / 1165**）

用户原话与触发：m02386「能不能让所有人下线，都重新绑定一吹教务网，重新补录一下」（承接 v1.1.64 名单，嫌逐个补录不干净）；给了 A/B/C 三方案（A＝服务端一键重绑不发版可逆 / B＝发 1.1.65 清 K_ACCT_KB 强逼真重登教务网 / C＝先跑 A 看回流率再精准引导）后 m02424「a是什么意思」、m02429「你给我跳哪了，我说的补录学号方案里的a」纠正字母指代（写全局 lesson 0mwbck7e：字母按最近一轮用户自己提的话题解析，别被同名注入方案带偏）；m02436 正面重发 A 的解释并收尾「确认走 A，就按这套落码、出包、上线」；**m02438「先这个吧」＝选 A 并授权整链执行**。

- **重大发现＋决策（静默改对）**：A 原设计的「每人写 `rev:` 下线」会**死锁** —— `server/worker.js handleActivate:1088` 与 `handleCheck:1260` 都查 `rev:`，`web/auth.js check():554-562` 收到 `reason==='revoked'|'bad_ticket'` 就 `LICENSE.deactivate(); clearTicket();` 强制重新激活，但 activate 又被 `rev:` 挡死 → 学生永远回不来。改用 **`cfg.rebindAt` 的 O(1) 可逆方案**：不写 `rev:`、不删 `dev:`、不改票据 body、学生端零改动。判据 `function rebindKicks(rebindAt, exp) { const t = parseInt(rebindAt,10)||0; return !!t && (exp - 30*DAY) < t; }` —— 普通票据恒 30 天签（`handleActivate: exp = now()+30*DAY`），签发时刻 = `exp - 30*DAY`，早于 rebindAt 的老票据在 `handleCheck` 被判 `bad_ticket`（严格小于，同秒重激活放行）；管理员票据在 `isAdminId` 分支提前 return 不受影响；`DEFAULT_CFG` 不含 rebindAt → 默认不存在 → 线上零回归。
- **落码六处**（一次性补丁 `design/sketch/_patch_v1165.js`，6 处唯一锚点 + `node --check` WORKER/AUTH/APP 全 OK）：`server/worker.js` 新增 `rebindKicks` / `async function handleRebindAll(req, env)`（备份整份 idx+公告三字段到单键 `rebind:backup` → 逐行删 `kb`/`kbAt` 保留 `id`/`at`/`note` → `putIdx` → `putCfg` 写 `rebindAt=now()`+「请重开 App，按提示重新登录一次教务网确认学号。」/「学号重新确认」→ `purgeEdge('/v1/config')` → `audit('rebind-all')` → 返回 `{ok,rows,rebindAt}`；已发起过且 backup 在则报错防覆盖）/ `async function handleRebindUndo(req, env)`（读 backup → `putIdx` 还原 → 删 `cfg.rebindAt` + 恢复公告 → `purgeEdge` → 删 backup → `audit('rebind-undo')`）；`handleCheck` 在 `const exp0 = t1.exp;` 前插 `if (rebindKicks(cfg.rebindAt, t1.exp)) return json({ ok:false, reason:'bad_ticket', rebind:true, msg:'请重新登录一次教务网确认学号' });`；admin 鉴权块加 `/v1/admin/rebind-all`、`/v1/admin/rebind-undo` 两条 POST 路由。`web/auth.js` 的 `Admin` 加 `rebindAll()`/`rebindUndo()`；`web/index.html` 名单卡 `#admListBtn` 后加 `#admRebindState` + `#admRebindGo`「发起全员重绑」/`#admRebindUndo`「撤销上次重绑」+ 说明段；`web/app.js` 加 `function openRebind(all)`（#sheet 二次确认 + 写状态 + `refreshList()`）、init 绑两个按钮。
- **回流机制（真·重绑，正是 A 想要的）**：客户端收到 `bad_ticket` → `LICENSE.deactivate()` 清 `K_ID/K_STATE/K_VERIFIED/K_ACCT_KB/K_ACCT_CX` 五键 → 必须重新登录教务网抓真号 → `activate` 带 `kb=kbAccount()` → `handleActivate:1181 if (isKbId(kb)) bindKbRow(env,id,kb)` 写回 `kb`/`kbAt` → 名单逐个回「已确认」。全程约 5 次 KV 写（O(1)）。`handleSetCfg` 是白名单式构造会丢 rebindAt，故 rebindAll/Undo 必须自己 `Object.assign({}, cfg, ...)` + `putCfg`，不能走 `Admin.setConfig`。
- **硬红线**：**只提供能力 + 管理台按钮，按钮留给 YG 自己点，我没替他执行** —— 不主动调用 rebind-all 把线上全员踢下线（破坏性运营动作，YG 没说「现在执行」）。撤销可一键还原名单与公告、老票据重新有效、设备绑定从未被碰过。
- **门禁**：新建 `tools/test_rebind.js`（仿 `test_kb_bind.js`，vm `grabDecl` 抽三段真源码真跑，T=1700000000/DAY=86400 桩，56 passed：rebindKicks 7 条 + rebindAll 一次发起/重入护栏 + rebindUndo + 三种坏输入 500 零写入 + getIdx=null + 不用 rev: 硬约束 + 前后端接线静态锁）；`tools/check_web.js` 挂 spawn + v1.1.65 checkpoint（18 条 has，保留全部 v1.1.64 checkpoint 与 `admListCnt` 反查锁）；`tools/verify_apk.py` 三处符号锁（app.js/index.html/auth.js + WORKER_SYMBOLS 8 个新符号）。一次性补丁 `design/sketch/_patch_gate_v1165.js` 首跑 `ENOENT design\tools\check_web.js`（root 少一层），edit 成 `path.resolve(__dirname,'..','..')` 后全绿。
- **出图抓到并修掉一个真实 CSS 缺陷**：首轮浅/深两档 390x1500 实拍都只见「发起全员重绑」一枚整行按钮，「撤销上次重绑」被挤出可视区 —— 根因 `.btn{width:100%}` 让 `.chips` 里两枚按钮各撑满一行、`overflow-x:auto` 把第二枚横向挤出，浅/深/经典三档同病。修 `web/app.css` 用 id 抬权重 `#admRebindGo.btn,#admRebindUndo.btn{flex:1 1 0;width:auto;min-width:0;margin-top:0;padding:11px 8px;font-size:13px;letter-spacing:0}`（沿用 :1231 `#revPhotoNav` 同款惯例），并钉进 `check_web.js` 静态锁防回退。**重出图逐块核对通过**：`design/sketch/shots/admin-rebind-light.png` 390x1500 / 139522 字节 / SHA `1fb35d7d1050499e0a1f401b0879c438afb8790d0cf1353661f38ffa83db802e`、`admin-rebind-dark.png` 390x1500 / 142119 字节 / SHA `ab3a73f3b7ed00cbb0de98b5aabaf2a0f499d8b923674557fb5e6a8bb130778e`；三色汇总（已确认3/待补录2/冲突1）+ 双行名单 + 校准区 + 重绑说明段 + 两枚按钮并排等分，浅色米白/深色紫夜舱都不压字。
- **验证与出包**：`python -X utf8 tools/bump_ver.py 1.1.65 1165`（web/about.js、web/index.html#aboutVer、android/AndroidManifest.xml 三处同源）；学生版 `apk/v1.1.65.notes.txt`「v1.1.65 学号确认这条链路更顺了」277 字，只写「万一提示重新登录教务网确认学号，照提示做一遍就好」，管理员/重绑按钮/全员下线等内部词一字未提；官网正文一字未改（管理员侧功能不进官网，沿用纪律），只把 `server/pages/dist/_worker.js:73` BUILD 切 `v1.1.65-rebind` 供 `check_site_skin` 版本门禁；`python -X utf8 tools/build_apk.py` 跑两次（修 CSS 后重新 sync_assets 45 文件并重签），成品 **`apk/xxmu-helper-v1.1.65.apk` 884603 字节 / SHA-256 `d7c9fe565409a864b2b97072b10717d3b5194c0543e3480e9b6b34118a026dfa`**（修 CSS 前 65e330bad7cd），签名 `0e684845…11157799` 与 v1.1.1 一致可盖装，deliver.py 送桌面 `xxmuhelper\` 字节校验通过。**七项门禁全绿**：`check_web.js` PASS（v1.1.65 18 has + 三个契约测试全 PASS）、`check_site_skin.js` 47/0、`check_notes.js` 6/6、`check_tutorial.js` 38/38、`test_kb_bind.js` 87/0、`test_rebind.js` 56/0、`verify_apk.py` 五件套。
- **已上线三步（选 A 后按长任务授权自主跑完，2026-11-11 09:10）**：Worker `cwd=server; npx.cmd wrangler deploy` → Version ID `6a59fe01-e174-4407-bce2-ab64690e7ed1`（67.86 KiB / gzip 18.64 KiB、绑定 KV `02669ca1…`）、`https://xxmu-auth.yg-xxmu.workers.dev`、`WORKER_DEPLOY_EXIT=0` → Pages `cwd=server/pages; npx.cmd wrangler pages deploy <dist 绝对路径> --project-name xxmu-auth --commit-dirty=true` → `https://62e08473.xxmu-auth.pages.dev`、`PAGES_DEPLOY_EXIT=0` → `python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.65.notes.txt`（1× URLError 退避重试后完成）切 `cfg.latest` 到 1.1.65 / 1165，`/v1/config latest=1.1.65 code=1165 size=884603 sha=d7c9fe565409…`、`/v1/apk` 884603 字节 SHA 一致、下载链路一致、`PUBLISH_EXIT=0`。**双入口验收** `design/sketch/_verify_live_v1165.py` → `RESULT: PASS`（主域名 www.xxmuhelper.top 的邮箱被 CF cf-email-protection 保护、解码后 692962849@qq.com，回滚口 xxmu-auth.pages.dev 为 plain；两入口 /v1/config、notes 277 字逐字、首页 21 项含「官网无内部词」扩到 rebind 系列、三张水墨 SVG、/v1/apk 884603 字节逐字节全一致；裸域 xxmuhelper.top 未接 DNS 不计入验收）。真机项一律没声称验证：真·重绑后学生端 deactivate→重登教务网抓真号→回填的端到端链路、点「发起全员重绑」后老票据陆续 bad_ticket 的实时节奏、「撤销」还原后老票据重新有效、`rebind:backup` 在真实 KV 大数据量下的读写。

---

### v1.1.64（2026-11-11）—— 名单双号三态（方案 C）：教务真号单独记 + 双行显示 + 汇总/开关/手动录真号（**已上线 1.1.64 / 1164**）

用户原话与触发：m01607「学号这里还是没做好我感觉，现在显示的都是未绑定教务了，但第一次登录肯定绑定教务了，就是要他们绑定教务的学号记录下来。或者改成双行上下行显示，上面粗的大体是软件登录时填的，下面细的小字是绑定教务网，确认是教务网登录所抓取到的学号」；给了 A/B/C 三方案后 m01658「c」（选方案 C：B 的数据与双行 + 卡头三态汇总 + 「只看已确认」开关 + 待补录行灰度 + 校准每行「手动录真号」按钮）。m01729「我让你做项目，你都可以自己组建团队做」。

- **根因**：服务端 `idx` 从头只存「进门手填号」，教务网抓到的真号只在每台手机本机 `web/license.js K_ACCT_KB`、从不上报；v1.1.63 判据 `kb === 1 && isKbId(e.id)` 让存量行整批落「校准」被错标「未绑教务」，而第一次登录其实必然绑过教务。真号只在学生本机 → 服务端记下只能靠「本人再开一次 App 自动补报」（`auth.js reportKb/alignKbAccount` + `sync.js __onLoginDone` 三路已铺）或「管理台手动录真号」。v1.1.63 `bindKbRow` 新建真号行 + 删手填行，双号结构不存在。方案 C 部分推翻 m00336「隐藏手填号」口径，改为两个号都留、都显示。
- **服务端（`server/worker.js` 四处）**：① 新增两顶层函数 `function kbRealOf(e)`（v1.1.64 `typeof e.kb==='string' && isKbId(e.kb)` 返回真号；v1.1.63 遗留 `e.kb===1 && isKbId(e.id)` 认 id；否则 ''）与 `function kbClassOf(e, seen)`（confirmed/pending/conflict 三态，kb 脏数据或真号撞车判 conflict）。② `async function bindKbRow(env, gateId, kb)` 签名保留，改成「按 gateId 找行、**不删行**、同行写 `row.kb = kb`(真号字符串) + `row.kbAt = now()`」；找不到 gateId 行但有 v1.1.63 遗留 `id===kb && kb===1` 幂等留用；都没有才 push `{id: gateId||kb, at, note:'', kb, kbAt}`。③ `async function handleList(env)` 签名保留，`seen` 计数 + `tagged = idx.map(e => ({e, c: kbClassOf(e, seen)}))` + `bound = confirmed 补集` / `odd = 其余`；rows/oddRows 都带 `kb: kbRealOf(e)`，oddRows `reason: conflict ? 'conflict' : 'pending'`；返回体加 `confirmedCount/pendingCount/conflictCount` 三数分开，保留 `hidden: idx.length - bound.length, oddCount: oddRows.length, oddRows: oddRows` 与两处同款 at 降序 sort 字面量。④ 新增 `async function handleKbFix(req, env)`（admin 鉴权块内 `/v1/admin/kbfix`，读 {id,kb}、校验 `^\d{6,20}$` + isKbId、`bindKbRow` + `audit(env,'kbfix',[id],kb)`）。`handleActivate` / `/v1/kbbind` / 客户端上报链路全不动。
- **前端**：`web/auth.js` 的 `Admin` 加 `kbFix(id, kb)`；`web/index.html` 名单卡加 `#admKbSummary` 汇总 + `#admOnlyConfirmed`「只看已确认」开关，`#admListTip` 改双行说明；`web/app.js` 加 `ONLY_CONFIRMED`、`renderList()` 双行 `.adm-kbline`（「教务网 {真号} · 已确认」/「教务网：待补录」）+ 待补录行 `.is-pending` 灰度 + 合并 pending 行、`renderOdd()` 三态文案（待补录教务学号/两号冲突）+ 每行「录真号」按钮、新增 `openKbFix(r)`（#sheet 半框收输入，校验 `^20\d{2}\d{7}$`，`AUTH.Admin.kbFix` 后刷新）与 `renderKbSummary(res)`（三色块），refreshStats/refreshList 都写汇总；`web/app.css` 加上粗下细/灰度/三色汇总/开关/录真号按钮六组样式，全走 `var()` 自动适配浅/深/经典三档。
- **门禁三处同步到双号契约**：`tools/test_kb_bind.js` 全量重写（grabDecl 抽 `isKbId/kbRealOf/kbClassOf/bindKbRow/handleList` 五段真跑 vm，59→87 passed：kbRealOf/kbClassOf 单元、bindKbRow 不删行、handleList 三态含 v1.1.63 遗留升级/撞车全 conflict、kbfix 路由、方案 C 前端锁；两条正则修 `adm-kbline` 换行与 `$('admOnlyConfirmed')`）；`tools/check_web.js` v1.1.64 checkpoint 整块换（kbRealOf/kbClassOf/bound=tagged.filter confirmed/odd=补集/三态计数/handleKbFix/ONLY_CONFIRMED/adm-kbline/renderKbSummary/openKbFix/Admin.kbFix/CSS 新类 has，保留 `admListCnt').textContent = LIST.length + ' 人'` 反查）；`tools/verify_apk.py` 三处符号锁加双号符号（app.js 加 ONLY_CONFIRMED/renderKbSummary/openKbFix/adm-kbline/is-pending，index.html 加 admKbSummary/admOnlyConfirmed，WORKER_SYMBOLS 加 kbRealOf/kbClassOf/bound=tagged.filter/三态计数/kbfix，保留 `kb === 1`）。门禁死代码字面量（`listNewFirst/looksOddId/'adm-odd','格式异常（手填）'/'adm-at'/LIST.slice().sort(listNewFirst)/'还没有人通过教务网绑定'/已隐去 /ODD.slice().sort(listNewFirst)/.adm-subtabs{/@keyframes admFadeIn`）全部原处保留，`tools/test_admin_list.js` 未改。
- **两档 390px 实拍逐块核对通过**（YG 外观交付硬要求）：`design/sketch/make_nova_real.js` 新增 `organ==="admin"` 分支（`_patch_admin_organ.js` 三处补丁：organEarly 早设 `data-shot-admin`、QA CSS 显示管理台名单 pane 并去 `.adm-out` max-height、覆盖 `AUTH.Admin.list` 为同步 thenable 假三态数据后点真 `#admListBtn` 触发真 renderList/renderOdd/renderKbSummary，`shoot-nova-one.ps1` 无头 Edge 390x1500 出图）。产物 `design/sketch/shots/admin-list-light.png` 390x1500 / 148132 字节 / SHA-256 `cee109b7dd61316bfe02753438e8fbb6c37d09906f4d300b165b087f44335299`、`admin-list-dark.png` 390x1500 / 149304 字节 / SHA-256 `354a45c8060f9b96bf5339fc6f70d28be50cb6d83a1447ddbc921f87427dc7ab`。逐块核对：卡头「使用名单 3 人」+ 二级菜单（正常名单 3 人 / 校准·异常 3 个）+ 汇总三色块（已确认 3 绿 / 待补录 2 橙 / 冲突 1 红）+ 双行说明 + 开关 + 主列表 5 行（3 行上粗学号 + 下细绿字真号 + 「教务已绑定」徽章，2 行灰度 + 橙字「教务网：待补录」）+ 校准表 3 行（待补录/两号冲突 + 绿色「录真号」按钮）+ 刷新按钮；浅色米白与深色紫夜舱均无溢出、无白字压白底、三色块与双行对比度够。
- **验证与出包**：`node --check` 六个文件全 OK、`python ast.parse` verify_apk.py OK；六项门禁全绿（`check_web.js` PASS、`check_site_skin.js` 47/0、`check_notes.js` 6/6、`check_tutorial.js` 38/38、`test_kb_bind.js` 87/0、`verify_apk.py` 五件套）；`python tools/build_apk.py` 同步 assets 45 文件、aapt2/javac(11)/d8(105)/zipalign/apksigner，成品 `apk/xxmu-helper-v1.1.64.apk` **884603 字节 / SHA-256 `f8f0d535c26ec4ea352c2994b15d12718f00b5075a20929a205eaa7020001d6c`**，签名 `0e684845…11157799` 与 v1.1.1 一致可覆盖升级，deliver.py 送桌面 `xxmuhelper\` 字节校验通过。学生版 `apk/v1.1.64.notes.txt`「教务网绑定更稳了，学号记得更准」只写学生可感知的「绑好的学号这回记牢了」，管理员侧功能一字未提。官网正文一字不改（v1.1.64 是后端/管理员侧改动，沿用「官网正文不写管理员侧功能」纪律），只把 `server/pages/dist/_worker.js:73` BUILD 切 `v1.1.64-kb-dual` 供 check_site_skin 版本门禁。
- **已上线（选 C 后按长任务授权自主跑完，2026-11-11 01:00）**：Worker `npx wrangler deploy`（版本 ID `07056544-6710-4d6f-bc20-be348a5a89bd`，`https://xxmu-auth.yg-xxmu.workers.dev`）→ Pages `npx wrangler pages deploy <dist 绝对路径> --project-name xxmu-auth --commit-dirty=true`（`https://31aea648.xxmu-auth.pages.dev`）→ `python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.64.notes.txt`（网络抖动 2× URLError 退避重试后完成）切 `cfg.latest` 到 1.1.64 / 1164。双入口验收 `design/sketch/_verify_live_v1164.py`（两入口 /v1/config、官网首页 21 项、三张水墨 SVG、/v1/apk 884603 字节逐字节）结果记在 `docs/handoff/qa-v1.1.64.md`。真机项一律没声称验证：真机 WebView 里双行换行与灰度对比、手动录真号半框在矮视口的手感、存量用户开机补报后真号回填的实时刷新。

---

### v1.1.63（2026-11-10）—— WIKI 相册横滑翻页 + 名单只认教务绑定号 + 名单「校准」二级菜单（**已上线 1.1.63 / 1163**）

三件一起做完，同一版 1.1.63 / 1163 出包。用户原话与触发：m00002「照片墙/留言板改左右横滑，一次展示四个/三条，两侧预览一点点上一页下一页，一定要美观」，给了 A/B/C 三方案后 m00085「a吧，但是做的美观一点，就像老式洗相片的店里那样，有夹子夹着照片的那种」；m00336「只显示他们教务网绑定的账号，不显示软件登录时输入的学号，不然这种乱填的不好管理，把之前有问题的都改了」；m00914「就是在名单那里加一个校准，把有异常的单独挑出来在一个二级菜单里面，主菜单列表那就显示正常的，计数也分开计数」。

1. **WIKI 横滑（选 A + 暗房晾相绳 / 木夹 / 雾紫圆点）**：`web/wiki.js` 新增 `railPages/makeRail/railDots/photoHang`；`photosSection()` 用 `makeRail(PHOTOS,4,{ph-rail>ph-page>ph-grid,cell:photoCard,hang:photoHang}) + railDots`，`fbSection()` 用 `makeRail(FBS,3,{fb-rail>fb-page>fb-list,cell:fbCard}) + railDots`。保留 `.ph-grid/.ph-sec` 类名与 photoCard/fbCard 原结构、刷新/上传/审核/分页轮询全部不动。`web/app.css` v1.1.63 段：`:root`/深色 `--cord/--clip/--clip-line`、`.ph-rail/.fb-rail` flex + overflow-x + snap + 露边（22px/18px）、`.ph-page` flex:0 0 100%、`.rail-dots` 雾紫圆点、`.ph-hang::after` 麻绳 / `::before` 木夹、`.ph-sec::before` 雾光紫渐变、经典西部档覆盖。`web/nova-organs.js` `sync()` 改 `querySelectorAll('.ph-grid')` 全挂 `.nv-polaroid-grid`（保留 `querySelector('.ph-grid')` 字面量给 `test_nova_organs.js:292` 门禁）；`nova-organs.css` `:nth-child(even)→.ph-hang`、`touch-action:pan-y→pan-x pan-y`（pan-y 会挡横滑）。
2. **名单只认教务绑定号（kb:1）**：根因 `server/worker.js handleList` 此前无过滤全回 idx（idx=进门手填号），v1.1.62 `renameFrom` 只按 oddShape 放行，11 位 20xx 开头的乱填号 `20291100411/20241100927/20261100411` 漏过；教务真号只存本机 LICENSE `K_ACCT_KB` 从不上报。改法：worker 加 `isKbId(/^20\d{2}\d{7}$/)`、`bindKbRow`（真号行置 kb:1 清手填残留）、`handleKbBind` + `/v1/kbbind`、`handleActivate` 接 b.kb 放宽 renameFrom 护栏、`handleList` 只回 `kb===1 && isKbId` 的行 + hidden；`auth.js` 加 `kbAccount()/reportKb()`、activate 带 kb、`alignKbAccount` 放宽护栏、开机兜底静默补报；`sync.js __onLoginDone` 补报；`app.js` 加 `adm-kb`「教务已绑定」徽章 + `#admListHidden`；`index.html` 加 `#admListTip/#admListHidden`；`app.css` 加 `.adm-kb/.adm-tip/.adm-hidden`。老用户靠开机兜底/align/登录三路回填，纯乱填号永不打标自然消失。
3. **名单「校准」二级菜单（m00914）**：服务端 `handleList` 加 `const odd = idx.filter(e => !e || e.kb !== 1 || !isKbId(e.id));`（bound 补集整批回传），`oddRows` map 带 `reason: (!e || !isKbId(e.id)) ? 'odd' : 'unbound'` + 同款 at 降序，返回体加 `oddCount: oddRows.length, oddRows: oddRows`（hidden 保留兼容门禁）。前端 `index.html` 名单卡加 `.chips.adm-subtabs#admListTab` 两按钮「正常名单 #admNormalCnt」/「校准·异常 #admOddCnt」，把原 admFind/admFilter/admList 包进 `#admNormalPane`，新增 `#admOddPane`（默认 none）内 `#admOddList`；`app.js` 加 `let ODD=[]` / `let LIST_TAB='normal'`，refreshStats/refreshList 都收 `ODD = res.oddRows || []`、分别写两个计数徽章、`renderList()` 后加 `renderOdd()`，新增 `renderOdd()`（ODD.slice().sort(listNewFirst)，每行带 `.adm-odd`「格式异常（手填）」/「未绑教务」+ 停用/解封 + 详情）与 `switchListTab(t)`，init 绑 `#admListTab button`；`app.css` 加 `.adm-subtabs/.adm-tab-cnt/#admOddPane admFadeIn`（两档皮肤 .chips button.on 都已有覆盖）。`auth.js` 未改（getJson 全字段透传）。
4. **门禁三处补锁**：`tools/test_kb_bind.js` 39→59 passed（4 组 20 条：服务端补集 / 计数分开 / reason 两值真跑混合样本 / 前端二级菜单与样式；含 `res.count + res.oddCount === 4 && res.hidden === res.oddCount` 无重复无遗漏约束）；`tools/verify_apk.py` 三处符号锁（assets/app.js 加 renderOdd/switchListTab/ODD/admOddCnt，assets/index.html 加 4 个校准 id，WORKER_SYMBOLS 加 `const odd = idx.filter(` / `oddCount` / `oddRows`）；`tools/check_web.js` 在 v1.1.63 段后插「名单校准二级菜单」块，用 `cssTxt2/idx2` 避免与已有 `appCss/cssTxt/idx` 变量冲突，14 条 has() + 1 条反查 `admListCnt').textContent = LIST.length + ' 人'`（校准不能污染 test_admin_list 依赖）。**门禁死代码字面量全部原处保留**：`listNewFirst/looksOddId/'adm-odd','格式异常（手填）'/'adm-at'/LIST.slice().sort(listNewFirst)/'还没有人通过教务网绑定'/已隐去 `；`check_web.js:1550` 禁后端退回 id 字典序。
5. **两档 390px 实拍逐块核对通过**（YG 外观交付硬要求）：夹具 `design/sketch/make_nova_real.js` 的 `organ==="polaroid"` 分支重写为 `.ph-rail>3×.ph-page>.ph-grid>4×.ph-hang>.ph-card`（12 张 3 页）+ `.fb-rail>3×.fb-page>.fb-list>.fb-card`（9 条 3 页）+ 各 3 圆点中间 .on；`shoot-nova-one.ps1` 无头 Edge 390x1500 出图。产物 `design/sketch/shots/wiki-rail-nova-light.png` 390x1500 / 269211 字节 / SHA-256 `105bcc9b430083d6…acb6473f`、`wiki-rail-nova-dark.png` 390x1500 / 184806 字节 / SHA-256 `e2e2f47f41a236c2…ae430`。逐块核对：中间页 2×2 四张白相纸、歪角 rotate、木夹 ::before、晾相麻绳 ::after、图注、左右各露相邻页约 22px、3 圆点中间拉长胶囊 .on；留言板中间页 3 条、后两条带「管理员回复」绿框；顶栏/搜索/CAMPUS WIKI 标签条/POLAROID MALL 器官条/资料卡齐全。浅色米白雾光紫 `#EBEDE9/#DDDFDA/#E9EBE6`，深色紫夜舱 `#1A1430/#2A234B/#302620` 紫色木夹与圆点明显，深色 HTML 硬写 `data-theme="dark"` 独立复核。`--dump-dom` 实测 ph-page=3/fb-page=3、ph-hang=12/fb-card=9、nv-polaroid-grid=3、data-shot-scroll=346/354。
   - **夹具机制教训**：virtual-time 下 `scroll-snap-type:x mandatory` 会回卷 scrollLeft、`scroll-behavior:smooth` 在静态帧不推进，是「露边拍不出来」的真因；`railCss` 关成 none/auto + `peek()` 把两 rail 精确设到中间页（scrollLeft=一页宽）解决。真实 `web/wiki.js` 首屏 scrollLeft=0 天然只有右侧露下一页，滑到中间页才左右都露，交互本身满足需求，`web/` 未因夹具而改。harness 是 JS 字符串数组 join 后进内联 `<script>`，中文 `\uXXXX` 要在补丁里再转义一层 `c.replace(/\\/g,'\\\\')`。多行大块 edit 常因缩进不符失败 → 用唯一单行锚点或行级 splice。`node -e` 含 `\x00` 报 null bytes → 写 .js 文件跑。
6. **验证与出包**：`node --check` 三个文件全 OK；`node tools/test_kb_bind.js` 59 passed 0 failed；`python tools/build_apk.py` 同步 assets 45 文件、aapt2/javac(11)/d8(105)/zipalign/apksigner，成品 `apk/xxmu-helper-v1.1.63.apk` **880507 字节 / SHA-256 `4f2c61f54133c832…6c96474d`**，deliver.py 送桌面 `xxmuhelper\` 字节校验通过；`python tools/verify_apk.py apk/xxmu-helper-v1.1.63.apk` → 五件套全部通过（badging 1163/1.1.63，证书 `0e684845…11157799` 与 v1.1.1 一致可覆盖升级，worker 三个校准符号都在）；`node tools/check_web.js` → 静态体检全部通过；`node tools/check_notes.js --file apk/v1.1.63.notes.txt` → 6 项全过（学生视角、467 字、末尾群号、无 Markdown 项目符号）；学生版 `apk/v1.1.63.notes.txt` 只写照片墙/留言板翻页与两档观感，管理员功能一字未提。
7. **已上线（YG 说「上线」后三步一起做，2026-11-10 22:35）**：Worker `npx wrangler deploy`（版本 ID `b339b5cb-6f9d-4d84-855e-bd95a1b2f985`）→ Pages `npx wrangler pages deploy <dist 绝对路径> --project-name xxmu-auth --commit-dirty=true`（`https://57ae7cfc.xxmu-auth.pages.dev`，`_worker.js` BUILD 切 `v1.1.63-polaroid-rail`）→ `python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.63.notes.txt` 切 `cfg.latest` 到 1.1.63 / 1163。官网正文同步到 v1.1.63（#fresh 三卡 + hero lead + FAQ 补翻页），浅色 `site-nova-light.png` 1100x2400 / 1078929 字节、深色 `site-nova-dark.png` 1100x2400 / 805842 字节两档逐块核对通过。双入口验收 `design/sketch/_verify_live_v1163.py` → `RESULT: PASS`（主域名 www.xxmuhelper.top + 回滚口 xxmu-auth.pages.dev 的 /v1/config、首页 21 项、三张水墨 SVG、/v1/apk 880507 字节逐字节一致；裸域 xxmuhelper.top 未接 DNS 不计入验收）。真机项一律没声称验证：横滑拖拽手感与回弹、Webview 里 snap 与木夹 ::before/::after 的层叠、校准二级菜单在矮视口的手感、异常号停用/解封后的实时刷新。

---

### v1.1.56（2026-11-08）—— NOVA「万象舱」：完全抛开原版骨架的全新界面（**未上线，只出了本地包**）

用户原话：「为什么你给我生成的图片还是 1.1.48 那种我说的涂鸦风格，我说了完全抛开原版，大胆融合所有。就像保留目前有的功能基础上重新设计开发一款全新的软件一样」；此前又定过「像所有人的乌托邦」「不要单一让一个风格的元素过于堆砌」「动态传送带 / 磁带机放大时空穿越」「整体 UI、操作逻辑、按钮布局、体验都可以根据风格定制改动」「不断搜索灵感资料素材」「模型到上线了你要自己切换到适合此项目的模型（xdpool 国内版）」。这一版按这些话重做。

1. **作废旧三锁**：mashup / console / pocket / utopia 四轮样张都是 v1.1.54 西部涂鸦纸卡片换皮，全部归档。`design/sketch/NOVA-DESIGN.md` 重定「风格不是贴纸，是器官」——一套舱体骨架，每个风格领一个**可操作器官**：蒸汽朋克=周次传送带、GBA=课表舱格、赛博 HUD=切角舷窗与段码、随身听=磁带门、拼贴=WIKI 剪报、拍立得=照片墙、票券=热水票、蒸汽波=舷窗落日、吉卜力=统一水彩介质层、西部=只剩一道皮革压边。经典纸卡片流 / 针脚 / 胶带 / 蹄铁星 / 暖棕描边 / 旧色板全部清零。
2. **三个招牌交互**（`design/sketch/nova-preview.html` 原型 → **正式工程 `web/nova-organs.js` 已实装**）：① 21 周传送带可拖可点、滚轮外露、吸附时课表横向滑入；② 磁带门以触点为起点放大铺满，A 面作业 / B 面考试，翻面有色相偏移；③ 波段拨盘切频道会按 `data-groups` 重排模块并 stagger 入场，不是普通 Tab 高亮。动效 2/5/6/7/8/9/11/12/18s 错峰，`prefers-reduced-motion` 一键全停。**器官层不碰 app.js 一行**：切周靠点真实 `#prev/#next`，切页靠点真实 `#tabs button`，磁带门里放的是 `#hwlist` 里已渲染好的真实 `.hw` 卡片（DOM 搬运，不重画、不编数据）。
3. **真实功能挂载复核**：只挂课表（21 周 / 上下课时间）、学习通作业与考试、饮水机免验证接热水、校园 WIKI（校历 / 招生办 / 附属医院 / 校训）、校园图片与留言板（需审核）。上一版 utopia 的「宿舍空调 12.40 kWh / CRC OK」是臆造功能，本版全部清除并写进静态验收禁词。
4. **出图链路修了一个老坑**：Windows headless Edge 把 `--window-size=390` 夹到 ~492 CSS px，而 `--screenshot` 仍只出 390px，导致此前每一张样张右侧都齐刷刷被裁（utopia 也中招没查出来）。现在 `nova-preview.html` 把 html/body/#cabin 钉死 390 CSS px，`shoot-nova.ps1` 裁掉多余视口边，另加 `?probe=1` DOM 溢出探针（实测 `count:0`）。浅 / 深 / 频道切换 / 磁带门浅 / 磁带门深共五张 390×1400 实拍逐块核对，深色档单独出物理图。
5. **正式工程落地**（独立于深浅模式的第二根轴）：`web/nova-skin.js` 在 `<head>`、`app.css` **之前**同步写 `data-skin`（冷启动不闪经典页），偏好存 `xxmu_skin`，与 `theme.js` 的 `xxmu_theme` 完全正交；`web/nova-skin.css` 把顶栏变仪表条、周次行变传送带、`#grid` 变切角舷窗、`.card` 变舱格、`#tabs` 变波段拨盘，并彻底关掉经典 `.card::before/::after` 胶带与蹄铁星。设置页加「经典 / 万象舱」两档，我的页加皮肤入口行；`app.js` 只加一行绑定，4700 行 DOM id 一个没动，用户随时能切回经典。
6. **官网同源**：`design/sketch/site-style.css` 换成 NOVA 真源，`tools/apply_site_style.py` 整段替换 `server/pages/dist/index.html` 的 `<style>`（注释里含字面量闭合标签，HTML 解析器不认 CSS 注释会提前闭合样式块把余下 CSS 当正文打印 —— 真源注释已避开该字面量，工具按 `<head>` 内首尾标签定位而不是非贪婪正则）；`tools/gen_site_shots_nova.py` 重生三张舷窗 SVG；`tools/apply_site_shots.py` 把首页里 v1.1.54 为省请求内联的三段旧版示意 SVG 换成引用 NOVA 示意图的 `<img src="img/shot-*.svg">`（相对路径，`file://` 本地渲染与 Pages 线上都能取到）；`_worker.js` 的 BUILD 切 `v1.1.56-nova` 让两域名边缘缓存整批失效（`xxmu-auth.pages.dev` 与 `www.xxmuhelper.top` 各有独立缓存）。**本地改完，未部署**。
7. **自补工具**：`tools/check_skin.js`（70 断言：禁词 / 真实功能锚点 / 器官挂载 / 双轴正交 / 动效错峰 / 五张 PNG 尺寸哈希）、`tools/test_nova_skin.js`（43 断言：归一化 / 首屏同步 / 落盘 / 与 THEME 正交 / 设置页挂载 / 静态接线 / html 标签级清零护栏）、`tools/check_site_skin.js`（24 断言：真源逐字一致 / 旧装饰清零 / 内联旧 SVG 已清 / 三张示意图引用 / BUILD）、`tools/apply_site_style.py`、`tools/apply_site_shots.py`、`tools/gen_site_shots_nova.py`、`design/sketch/shoot-nova.ps1`、`design/sketch/make_nova_real.js` + `shoot-nova-real.ps1`（渲染**正式** `web/index.html` 的实拍夹具）。`tools/check_web.js` 的 sameSkin 判据从「官网=西部涂鸦 app.css」改成「官网真源=NOVA 覆盖层令牌逐字同源 + 经典令牌仍可回退」，示意图断言从只认内联 SVG 扩到认相对路径外链。
8. **模型**：实测 xdpool 国内版池健康（`hy4free` 2/4 账号可用但软限流、`glm-5.3-flash` 2/4 可用、`hy3` 4/4 可用），把 `cordis.patch.yml` 的 `agent-default-model.model` 从 `hy4free` 切到 `glm-5.3-flash`（900K 上下文、国内版、2 账号可用），原文件备份在 `.bak-nova-20261108`。
9. **正式工程实拍（新增，`make_nova_real.js`）**：渲染**真实** `web/index.html` 而不是原型页 —— 夹具在 `</body>` 末尾批量清掉 app.js 的定时器链（否则 Edge `--virtual-time-budget` 会空转到 CPU 跑满不退出）、解锁 `#app`、关掉 gate/disc/tut/onb/upd/sheet、注入示例课表、把 `main` 内部滚动摊成长页、html/body 钉死 390px。这条链路查出并修掉了三个真 bug：① 覆盖层写了臆造类名 `.course/.kb-cell`，真实 `renderWeek()` 产出的是 `.c` / `.cell`，旧涂鸦彩色卡片因此漏进舷窗；② 西部覆盖层把牛皮纸+方格+红皮绳写在 `html` 标签上，NOVA 只改 `#app` 导致底部整片漏出旧方格；③ 顶栏被西部皮革带规则压住，没变仪表条。三处都已在 `nova-skin.css` 修掉并加静态护栏（44 断言）。浅 / 深各一张 390×2200 实拍逐块核对：无旧方格、无白字压白底、课表舱格为硬边像素风、拨盘与传送带生效。
10. **器官层实装（`web/nova-organs.js` + `nova-organs.css`）**：把三个招牌交互真正接进正式工程（之前只在原型页里）。周次传送带（21 格胶囊 + 两端黄铜滚轮 + 红色指针，能拖能点，拖完自动吸附）、磁带门（A 面作业 / B 面考试，点触点放大铺满，门内是真实 `.hw` 卡片）、波段拨盘（指示珠滑向当前频道 + 切页时舱格错峰点亮）。三条硬约束：**不碰 app.js**（切周点真实 `#prev/#next`、切页点真实 `#tabs button`）、**不编数据**（磁带门搬运 `#hwlist` 的真实卡片）、**不越轴**（器官层只读 `data-skin`，不写 `data-theme`）。切回经典时器官整组拆掉。
11. **验证**：26 套离线测试全绿（含新增 `test_nova_skin.js`、`test_nova_organs.js`；`test_grab.js` 需带 `build_test/grab.js` 参数，不带参数报 ENOENT 是它本来就要求的用法）、`check_web PASS`、`check_skin 70/70`、`check_site_skin 24/24`、`test_nova_skin 44/44`、`test_nova_organs 37/37`、`check_notes` 6/6、`verify_apk` 五件套 PASS（证书 `0e684845…11157799` 与 v1.1.1 一致可覆盖升级）。最终包 `apk/xxmu-helper-v1.1.56.apk` 711510 字节、SHA-256 `d0ac92a881fd…`，已由 `deliver.py` 送到桌面 `xxmuhelper\` 并逐字节校验。
10. **没做的两项**：官网未部署、`/v1/config` 的 cfg.latest 未切（线上仍是 1.1.54 / 1154 / 674032）。按发布纪律等 YG 明确说「上线」才两条一起做。真机项一律没声称验证：磁带门点按链路、传送带拖拽手感、Webview 里 `nova-skin.css` 的舱格覆盖、官网双域名 300s 边缘缓存失效。

---

### v1.1.55（2026-11-08）—— 糖梨（tangli）比对结论落地（**未上线，只出了本地包**）

上一轮把用户的「继续」接错到 GlassDesk 1.4.5，河医大助手这边一项借鉴都没动；
用户纠正后回来做这四项。依据 `docs/compare-henubox.md` 之外的
`augustlies/tangli` 对照结论：值得借鉴 5 点、不建议抄 4 点。

1. **DESIGN.md**（新）：工程侧已有 HANDOFF，缺设计侧。把色板 / 字体层级 /
   组件规格写清楚，**第 5 节专列「用户明确否决过的设计」**（全黑白 / 一直米白 /
   大面积黑 / 换成单一风格 / 霓虹蓝主题 / 磨砂实时模糊 / 引 RoughJS 与 Gradle /
   1500 校适配 / 托管密码与代提交），以后新会话不重新讨论。
2. **AI 改课表 DSL**（`web/lesson-cmd.js`）：复制「开学日 + 作息 + 现有课表」说明给任意
   AI，回 `+ 课名 | 周三 | 3-4节 | 第10周 | A201` / `停` / `调` / `假` 纯文本；
   本地解析 → 预览差异 → 点确认才写入 `xxmu_kb_ops` → 可单步撤销 / 清空。
   **零 AI 成本、零账号、零网络**。铁律：任一行解析不出来就整批拒绝，不猜、不静默跳过；
   钟点必须能对上校方 `times[]`，对不上就拒；改动只叠在内存 `DATA`，绝不覆盖教务缓存。
   `app.js load()` 在算 PERIODS 之前叠加，画面 / 统计 / 提醒都用叠加后的数据。
3. **成绩页**（`web/grades.js`）：新成绩先盖着、点一下翻开；按学期归档、4.0 制
   学分加权绩点。核心防错：`scoreOf('--')`/空/未出 = **情况不明第三种状态**，绝不
   当 0 分或已完成，也不参与绩点平均；导入 JSON 任一条坏就整批拒绝。
   `core/kingo.py::fetch_grades` 只留只读候选路径探测 + STALE 识别，**真实 JSP 路径
   需登录后真机核验，没验过就不冒充已做**。
4. **桌面小组件**（`ClassWidget.java` + `res/layout/widget_today.xml` +
   `res/xml/widget_today_info.xml` + manifest receiver）：今日课程 / 第几周 / 下节课教室，
   只读本机 `schedule.json` 与缓存，不联网；`saveCachedSchedule` 写完即 `refresh()`。
   组件只叠加「加课」指令，停 / 调 / 假不重算（宁可少显示，不显示错的）。

顺带：
- `tools/test_tangli.js` 55 条离线断言（DSL 解析 / 整批拒绝 / 应用 / 三态 / 绩点 / 归档）。
- `tools/check_web.js` 加 v1.1.55 结构锚点，并把三条**过期**官网断言对齐当前实现：
  三张 SVG 已内联（首页请求数 5→2）、`HOME_TTL 300→86400` + `BUILD` 缓存键整批失效；
  `tools/test_apk_cache.js` / `dist/_headers` 的 300 秒断言同步改 86400。
- 版本 1.1.55 / 1155，assets 25 文件同步；24 套离线测试全绿、`check_web` PASS、
  `verify_apk` 五件套 PASS。包 694860 字节，SHA-256
  `C852DC7E5DE5F8107D0DB15FC2B05A61C3B59263F2B22EC43AE462E76B1A78C2`，
  证书 `0e684845…11157799` 与 v1.1.1 一致（可覆盖升级）。
- **没发布**：线上 `/v1/config` 仍是 1.1.54 / 1154 / 674032，按「用户明确说上线才切
  cfg.latest」的纪律留着。桌面 `xxmuhelper\河医大助手-v1.1.55.apk` 逐字节一致。
- **没真机验证**：课程提醒、小组件排版观感、青果成绩页路径，都写进 DESIGN.md 末节。

---

### v1.1.49（2026-11-07）—— 空闲教室的乱码 + 更新提示出得慢（**未上线，只出了本地包**）

用户一张截图 + 一句「更新弹窗还是慢，你再修修。这里有乱码」。截图里「空闲教室」弹层的
座位筛选下面那行灰字是 `妮十⊖鎖悮 チ锌氥噚璇佸凡澧辩胺夯闁喰梒鐧诲祵海綪!`。

**乱码的根因**：那行字不是界面文案，是 `web/free.js` 的 `paint()` 在
`if (ST.err) body.appendChild(el('p','hint left',ST.err))` 里**把服务端错误原文直出**。
`ST.err` 由 `reasonOf(html)` 从教务返回页里用 `alert\(\s*['"]?([^'")]{4,80})` 抠出来，
而矩阵页在 `loadMatrix()` 里是按 **GBK 硬解**的（`toGbk`，理由见 free.js 顶部注释：
GBK 字节流有一段能侥幸通过 UTF-8 校验，先试 UTF-8 反而更糟）。教务维护时返回的是
**UTF-8 网关页**，被当 GBK 解 → 字节错配 → 乱码。
**为什么不能猜编码**：实测截图那串含 `⊖`（U+2296，GBK 无此码位），逐字 gb18030 回编码
也拼不回原字节 —— 字节已经被错配过不止一次，原文不可逆。所以修法不是换解码器。

**修法**：界面绝不直出未识别的原始字节。
- 新增 `function looksReadable(t)`：统计 CJK 区（U+4E00–U+9FFF）字数作分母、其中属于
  650 字常用字表（字频序，`const COMMON`）的作分子，`common / cjk >= 0.3` 才算人话；
  遇到 U+FFFD 替换符或私用区（U+E000–F8FF）直接判死。
- `reasonOf` 拆成四档：登录失效 → 固定句；抠到 alert 原文 → **过 `looksReadable` 才放行**，
  否则给「教务返回的内容看不懂，可能正在维护，稍后再试」；没有 table → 「没有表格」；
  否则空串（由 `loadMatrix` 落到「这栋楼这周没有排课数据」）。
- 阈值是用 node 实测定的：截图乱码 0.09、单层乱码 0.00/0.08、双层乱码 0.00 全部拦下；
  9 条真实教务提示（凭证失效 0.64、周排课 0.78、维护中 0.91、页面不存在 0.75…）全部放行。
- **不能**用全角区 U+FF00–FFEF 判乱码 —— 正常中文的「，」「：」都在这区。

**更新提示慢的根因（不是服务端）**：`/v1/config` 早就有 60 秒边缘缓存（实测 `x-edge: hit`，
响应头 `cache-control: public, max-age=60`），服务端 TTFB 只有 40–90ms。
慢的是 `android/src/com/xxmu/helper/Http.java` 的 `request()` 在 finally 里**无条件**
`c.disconnect()` —— Android 的 `HttpURLConnection.disconnect()` 会把 socket 从 keep-alive
池里摘掉并关闭，于是每个 `/v1/` 请求都重做一次 TCP+TLS（本机实测 TLS 段 200–2150ms，
且被路由到 LHR/SEA 节点，抖动极大）。`readResponse()` 本来就在 finally 里把响应流读完并
close（历史 fd 泄漏事故后加的），所以连接是可复用的。

**修法**：
- `Http.java`：`request()` 加 `boolean reusable = false;`，`readResponse(c)` 正常返回后置
  `reusable = true;`，finally 改成 `if (c != null && !reusable) c.disconnect();`。
  **异常路径仍然断连**（半截响应不能还回池子）。
- `MainActivity.java`：`onCreate` 在 `applyAppTheme()` 与 `loadUrl()` 之间插 `warmUpConfig();`
  —— 起一个 daemon 线程提前把 `baseNow() + "/v1/config"` 打一遍，让握手在 WebView 起来
  之前就做完。这是抢跑不是保证：失败只白做一次 2 KB 请求，吞异常。
- `tools/test_theme.js` 原先用 `/applyAppTheme\(themeDarkNow\(\)\);\s*\n\s*web\.loadUrl/`
  钉「先设底色再 loadUrl」，被 `warmUpConfig();` 插在中间后变红；改成比 `indexOf` 先后顺序，
  断言语义不变。

**验证**：① 编译/签名通过，证书与 v1.1.1 同一把 `0e684845…57799`；
② `tools/test_free.js` 42 项（新增 12 条乱码断言，含“reasonOf 不许把 `鎖`/`⊖` 带出来”）、
`check_web.js` 新增 v1.1.49 段 13 条锚点（含 Java 侧三条 `reusable` 锚点 —— check_web 历来
不查 `android/*.java`，这次破例钉死）、全 23 套离线测试 0 红、`verify_apk.py` 五件套全过；
③ 包 665840 字节 / sha256 `ab765d48…acba9` / aapt2 1149 / 1.1.49，包内 `assets/free.js`
（26124 字节）与 `web/free.js` 逐字节一致。
④ **真机没验**：乱码是否真消失（要有教务维护页才复现）、预热后首屏弹窗快了多少。

**注意**：v1.1.49 与 v1.1.38 起的多个版本**字节数完全相同（都是 665840）**，只有 SHA 不同。
认版本只能看 SHA 和「我的 → 关于」的版本号，不能看文件大小。

---

### v1.1.48（2026-11-06）—— 管理台时间全显示成「1/22」（**已上线 2026-11-06 23:0x**）

用户一张截图 + 一句「这个时间不对吧1/22是什么」。管理控制台「详情」里
「最近进入 1/22 02:17」「已绑设备 #1 … 1/22 02:17」，日志页每一行也是 1/22。

**根因**：`server/worker.js` 的 `now()` 返回**秒**
（`Math.floor(Date.now() / 1000)`），而 `web/app.js` 的 `fmtDay(ts)` 直接
`new Date(ts)` 按**毫秒**解析。1764537032 秒被当成毫秒 → 1970-01-22 02:17。
数据本身没错，只是显示时单位换算错了，所以表现为「像数据坏了」但导出却是对的。

**为什么不能只改调用方**：同一批调用点里已经有一处写了
`fmtDay(f.at * 1000)`（版本发布那条），如果只把漏乘的全部补上，
那一处就会变成「毫秒的毫秒」，2026 年被算到五万年后。四种传法同时存在时，
逐个调用点打补丁必然再错一次。

修法：`fmtDay` 内部按量级自判 —— `ts < 1e11` 当秒（≈1973 年前，
业务数据不可能早于此），否则当毫秒。调用方一律直接传原值，
那处多余的 `* 1000` 也去掉了。判据放在函数里，就不会再有人漏改。

**验证**：① 编译/签名通过、证书与前版同一把；
② 新增 `tools/test_admin_time.js` 11 项（从 app.js 切出 fmtDay 到 vm 里真跑：
秒/毫秒同结果、固定向量、0/null/'' 不崩、并断言**没有** `fmtDay(x * 1000)`
双重换算，且该断言先剥注释再匹配，避免解释规则的注释自己被当成代码）；
`check_web.js` 新增 v1.1.48 段 3 条锚点并接入该测试；全套 24 套离线测试 0 红、
`verify_apk.py` 五件套全过；包 665840 字节 / sha256 `55f0d962…` / aapt2 1148 / 1.1.48，
包内 `assets/app.js`（214266 字节）含单位判据、与 `web/` 逐字节一致。
③ **真机没验**：详情弹层与日志页在手机上的实际排版；以及 KV 里历史 `at`
是否全是秒（只能读 KV 才能确认，本轮按代码判据：worker 所有写入都走 `now()`）。

**注意**：v1.1.48 与 v1.1.47 **字节数完全相同**（都是 665840），只有 SHA 不同 ——
这个项目里已经出现过多次（v1.1.16/v1.1.17 同为 558650），认版本只能看 SHA 和
包内符号，不能看大小。

发版说明 `apk/v1.1.48.notes.txt`（学生视角，299 字，不提 1970/单位/字段名）。
**已上线**（2026-11-06 23:0x，用户一句「上线」走 release_all.py 三件套）：
线上 1.1.48 / 1148 / 665840 / sha256 `55f0d962…`，两入口 /v1/config 与 /v1/apk 一致，
GitHub Release v1.1.48 附件同字节，远程 main 经 push_full_tree.py 对齐。
`git push` 这次报 `fetch first`（远程有 API 通道造的提交，本地引用追不上），
不是被墙——直接用 REST API 补推即可，别 reset。

---

### v1.1.47（2026-11-06）—— 修掉「能看到更新却装不上」（**已上线 2026-11-06 22:2x**）

接上 v1.1.17 那次没补完的最后一处。双入口回退（`HOSTS` 两个地址，
DNS 查不到自有域名就退到 `xxmu-auth.pages.dev`）早就覆盖了图片、上传、
`/v1/config`，唯独 `cfg.latest.url` 是发版时服务端**写死的绝对地址**
`https://www.xxmuhelper.top/v1/apk?v=<sha前12位>`。

事故链路（静态体检全绿也照样中招，只在真实网络下暴露）：
校园网 DNS 对 www 是 NXDOMAIN 的学生 → `fetchAny` 退到 pages.dev →
`/v1/config` 收到了 → **更新提示照样弹**；但 `UpdateUI.go()` 拼的
`self = AUTH.BASE + '/v1/apk'` 是 pages.dev，而 url 还是 www →
`url.indexOf(self) === 0` 恒 false → 判成外链 → `Host.openUrl` 甩给系统
浏览器去开一个这台手机根本解析不了的地址 → 点「去下载」装不上、没有任何报错，
App 内下载 / 4 段并发 / 断点续传 / 整包 SHA 校验 / 拉起安装器整条链路全丢。

修法（`web/auth.js` 新增 `AUTH.localizeUrl`，只此一处）：
把服务端下发的绝对地址对齐到 `baseNow()`，路径与 query 一个字节不动
（尤其 `?v=` 是 v1.1.44 的边缘缓存键，吃掉等于关掉版本化缓存）。
边界：只认 `HOSTS` 里两个入口且 host 后必须直接跟 `/ ? #` 或结尾
（`www.xxmuhelper.top.evil.com` 不算）；只归一 `/v1/` 开头的接口，
网盘/群文件外链、官网静态资源、相对非 `/v1/` 路径原样返回；
相对 `/v1/apk` 也补成当前入口；同 origin 时原样返回（绝大多数学生零影响）。
`app.js` 的 `go()` 开头调一次，**保留 v1.1.44 那条前缀判据**不另写一套实现。

**收敛记录**：本轮磁盘上曾同时出现两套归一实现（另一套是 `selfApkUrl()`，
把 url 只当 path+query、host 一律用当前入口重写，改掉了前缀判据）。
按「一个动作只有一个写入点」收敛为 `AUTH.localizeUrl` 一套；
`check_web.js` 有反向断言 `/selfApkUrl\(/` 钉死，再冒出第二套直接 FAIL。

验证：① 编译/签名通过、证书与 v1.1.1 一致；② 新增
`tools/test_download_host.js` 25 项（从真源码切函数到 vm 里跑，含
「归一前 isSelf=false 复现故障 / 归一后 true」、形近域名、`?v=` 保留、
外链不动），`check_web.js` v1.1.47 段 8 条锚点 + 行为测试、
`verify_apk.py` 包内符号（app.js / auth.js 两处）、全套 22 套离线测试、
说明 `check_notes.js`、教程契约 38 项全过；包 665840 字节 /
sha256 `96cfdfb4…` / aapt2 1147 / 1.1.47。
③ **真机没验**：校园网 NXDOMAIN 环境里点「去下载」是否真的走通安装器 ——
本机无设备、也造不出那台手机的 DNS，只承诺 URL 逻辑与包内落盘。

发版说明 `apk/v1.1.47.notes.txt`（484 字，学生视角）写的是「能顺利装上新版 +
启动更快/下载更顺 + 说明只写给你看的东西」，不提域名、不发版过程、不提未验。
线上仍是 v1.1.43 / 1143，学生不弹更新（用户说「继续」≠ 授权发布）。

---

### v1.1.46（2026-11-06）—— 检查更新提速 + 更新说明只写学生视角（**已随 v1.1.47 上线**）

用户两句：「启动软件检查更新能不能快一点，现在有点慢，感觉打开了好久才弹要更新」，
以及「更新公告我说了，不要显示管理员需要注意的事项」。

**① 慢的根因**：实测 `/v1/config` TTFB 0.82~1.36s（双跳 + 首次 TLS），
而 `app.js` 末行还固定 `setTimeout(() => UpdateUI.check(true), 1500)` ——
学生等的一半以上是这 1.5 秒纯白等，跟网络无关。改成
`requestAnimationFrame(() => requestAnimationFrame(fire))`（双帧约 32ms，
第一帧让首屏画完、不抢 load()/各模块 init），第二帧用 0ms 任务发静默检查；
无 rAF 的老 WebView 退回 60ms 定时器。仍是异步桥 Promise，失败静默降级。
`test_update_timing.js` 18 项真跑 rAF/兜底分支，验「只发一次、silent=true、
公告仍优先」。

**② 学生视角（用户纠正）**：线上 `cfg.latest.notes`（905 字）里夹着
「这几版之前只留了本地包，没发给学生」「真机上还有几处我没验到」
「装完发现哪里不对，直接把截图发我」「线上仍是 v1.1.43，学生不会收到更新提示」——
全是写给管理员/自己看的运维话，学生点「去下载」看到只会莫名其妙。
重写成 711 字纯学生版（只讲装完能用到什么、哪里变了、去哪反馈），
用新增 `tools/set_notes.py` **只改 `latest.notes` 一个字段**直写 KV 并回读，
版本/code/带 `?v=` 的 url、`notice/noticeTitle/noticeAt` 全部确认未动。
纯管理员留档改名 `apk/v1.1.45.internal.md`（不再叫 notes.txt，不会被当发版说明）。

**③ 做成硬卡口**：新增 `tools/check_notes.js`（20 个禁用词 + 结构检查，
默认只查最新一份 notes，`--all` 才全量扫历史），接进 `check_web.js`
与 `release_all.py` 第 1 步预检 —— 以后再混进内部话直接 die() 发不出去。
这和「公告 notice 与更新说明 latest.notes 是两套字段」的旧规矩一致：
`set_notice.py` 管前者，`set_notes.py` 管后者，改一个绝不能顺手写另一个。

验证：① 编译/签名通过、证书与旧版一致；② `check_web.js` 全 PASS、
`check_notes.js` 6 项、`test_update_timing.js` 18 项、全套 22 套离线测试 0 FAIL、
`verify_apk.py` 五件套全过；线上 `/v1/config?probe=` 回读 notes 711 字、
不含「没发给学生 / 截图发我」、含群号。③ **真机没验**：从点图标到弹窗的实际秒数
（DNS/TLS/WebView 预热本机测不到），只承诺「去掉 1.5 秒固定白等 + 异步不阻塞」。

线上版本仍是 v1.1.43 / 1143（这次只热更了 notes 文案，没切 KV 版本），学生不弹更新。

---

### v1.1.45（2026-11-06）—— 管理名单按新收录从新到老 + 异常学号标出来（**已随 v1.1.47 上线**）

用户发来管理台「名单」截图，两句：「按照新收录的学号排序，从新到老。而且为什么有个12026，
不都是2025.2026这些年份开头吗」。截图里 `120261200112`（12 位、1 开头）排在第一，其余都是
11 位 2025/2026 开头。

**① 排序根因**：`server/worker.js` 的 `handleList` 用 `a.id.localeCompare(b.id)` 排字典序，
`1` 最小所以永远在最上面，看着像「最新」，其实只是字符串最小。而 `idx` 每条本来就带
`at`（`idxApply` 写入的第一次进入时刻）。改成 **`at` 降序**，`at=0`（开卡时代遗留、无时间）
统一垫底、之间按 id 升序，同 `at` 也按 id 稳定，刷新不跳。前端 `renderList` 用同款
`listNewFirst` 再排一次——**这样即使 Worker 还没部署、或响应来自旧缓存，名单页也已正确**：
旧 `handleList` 一直返回 `at` 字段，前端够用，所以这版只出 APK，服务端代码留仓库，
不需要为了修排序去动线上。

**② 12026 的真实来历（查线上 KV，不是猜）**：`idx` 共 11 条，`120261200112` 的
`at=1793754612`（2026-11-04 09:10），`last:` 里有 `{ver:'1.1.9', tag:'Xiaomi 24117RK2CC'}`，
`dev:` 有正常设备绑定，`lic:`/`rev:` 为空。**是有人在这个 App 里填进去的**，
不是系统生成、也不是学号被算错。根因：`/v1/activate` 只校验 `/^\d{6,20}$/`
（6~20 位纯数字），不校验年份和位数；本校在册是 11 位、2025/2026 开头，
这人填了 12 位 1 开头。名单里还有一条 `2026250033`（10 位）同属手填多位/少位。

**③ 处置：只标不拦**：`looksOddId()`（长度≠11 或不是 `20\d{2}` 开头）在名单行加
「格式异常（手填）」橙色标记，并在学号下面显示收录时间；**不删数据、不改激活判据、
不拦人**——那是真实用户填进来的，管理员需要看见而不是被系统悄悄吞掉。
**收紧学号校验（只收 11 位年份开头）没做**：那会把已经在用的同学挡在门外，
属于改变准入规则，等用户明确点头。

**④ 窄屏**：名单行加了两块内容后，`.adm-id-wrap` 固定 116px、按钮组不收缩、
`.adm-tags` 吸收剩余宽度，避免 412px 视口把「停用/详情」挤到第二行。

验证（三层分开说）：① 编译/签名通过、证书仍与旧版一致；② `check_web.js` 全 PASS、
新增 `test_admin_list.js` 26 项（用线上 idx 真实 11 条形状跑排序，含「旧字典序确实把
12026 排第一」的反向复现）、全套 20 套离线测试 0 FAIL、`verify_apk.py` 五件套全过；
③ **真机未验证**：名单页在矮视口下时间行/异常标记的实际观感。
过程中修了测试自身两个坑：`fmtAt` 在 app.js 更早处已有同名函数，按名字 `cut` 会切错
（测出 `2026/11/5 19:29:39` 这种假 FAIL），改成按 `listNewFirst → renderList` 区间整段切。

线上仍是 v1.1.43 / 1143（回读确认），学生不弹更新。

---

### v1.1.44（2026-11-06 线上热更，**服务端 + 官网，未出 APK**）

用户报「现在走app内下载好慢呀，什么原因，官网加载也慢」，先量化再动手，回一句「有改善你就做」后执行。
**这次只改 `server/worker.js` / `server/pages/dist/_worker.js` / `dist/_headers` / 两个发版脚本 + 当前 KV 的 cfg.latest.url，
没有出新 APK，线上版本号仍 1.1.43 / 1143，学生不会因此收到更新提示。**

**实测基线（改前）**：官网首页 TTFB 0.84s、连打三次全 `cf-cache-status: DYNAMIC` + `max-age=0` 次次回源；
`/v1/config` TTFB ~0.85s 但 `x-edge: hit`；`/v1/apk` 单流 2.42s / 273 KB/s，4 段并发 1.84s；
直连 workers.dev 21.2s 超时（国内污染，双跳必须存在）。根因是**每个请求都跨
手机 → Pages Functions → workers.dev → Worker → KV 双跳且每一跳都不缓存**：
`worker.js` 第 2186 行注释写「/v1/config 与 /v1/apk 靠边缘缓存」，但 `handleApk` 直接 return、根本没调
`edgeCache`，`no-cache` + Pages 原样透传 → 注释与代码不符；4 段并发各付一遍双跳 TTFB，收益被吃掉。

**改动**
1. **Worker**：`cfg.latest.url` 改成 `/v1/apk?v=<sha256 前 12 位>`；`handleApk` 只在 `?v=` 是当前 sha 前缀时
   把**全量字节**存进 Cache API 并回 `immutable`，Range 统一走 `apkResponse()` 从全量切片（不缓存 206）。
   **无参数老 URL / v 不匹配的请求仍走原来的 no-cache 分支**，旧客户端与回滚口行为一字不变。
2. **Pages 层**：只对「带 ?v= **且带 Range**」的请求做 Cache API 缓存，键带 `&r=<Range>`（4 段不互相覆盖），
   206 段包成 200 存、段范围另存 `x-apk-range`，命中还原 206。首页 300s / 图片 1 天短 TTL 缓存，
   404 分支不缓存。新增 `dist/_headers` 给浏览器/CDN 一层声明（真生效的是 Cache API）。
3. **两个发版脚本**：`publish_apk.py` 与 `set_latest.py` 都生成/补齐 `?v=`（后者专门防 `release_all.py`
   兜底传无参数 `--url` 把旧 URL 写回 cfg）。App 侧 `isSelf` 是前缀匹配，带 query 仍命中，不用改客户端。
4. 当前线上 KV 用 `set_latest.py` 补成版本化 URL，回读确认 `/v1/config` 已是 `...?v=3ccccfed3591`。

**当场发现并修掉的两个真问题**
- **单流被拖慢 80%**：第一版 Pages 层把无 Range 的首包也 `await` 读 661KB 再写缓存，单流 1.7s → 3.1s。
  改成只缓存带 Range 的请求，单流走原透传（Worker 层全量缓存仍在，第二次起照样省 KV）。
- **旧 cfg 缓存副本**：`set_latest.py` 写 KV 成功，但 `/v1/config` 有 60 秒 `edgeCache`，连读四次仍是旧 URL；
  带 `?probe=1` 一读就是新值。这是缓存生效的正常表现，不是写失败，别因此重跑发布。

**回读（改后）**：`/v1/config` url 带 `?v=3ccccfed3591`；版本化 Range 连打稳定 `x-pages-cache: hit`
+ `immutable`、TTFB 从 ~1.08s 降到 0.74~0.90s；官网首页连打 `miss → hit → hit`、`max-age=300`；
老无参数 URL 仍 206 + `x-apk-cache: legacy` + `no-cache`。Worker 部署后四条绑定齐全。
`npx wrangler pages deploy` 必须用 **dist 绝对路径**（检测到 server/wrangler.toml 时会把相对 `dist`
解析成 `server/dist`）；它因 config 警告把 stderr 当错误报 exit 1，但 `Deployment complete` 是真的，按回读判定。

**验证边界（如实说）**：① 编译/语法 + ② `check_web.js` 全 PASS、新增 `test_apk_cache.js` 33 项、
全套离线测试 0 FAIL 都过了；③ **真机秒数改善测不出稳定值** —— 本机到 Cloudflare 带宽本身在抖
（单流 1.4~4.5s、4 段 2.0~3.0s，新旧互有胜负），只敢承诺「缓存命中率与回源跳数」这两项结构性指标，
不承诺具体快多少秒。学生手机在校园网/5G 的单流上限仍要真机看。

---

### v1.1.43（2026-11-06）—— 应用图标换成 F 号「夜空河字」（**已上线**）

用户回「图标要F吧」。上一轮给了 6 套方案但明确不擅自换 `android/res`，
这句就是明确授权，所以这轮只做替换，别的功能一行不改。

- 跑 `python -X utf8 tools/apply_icon.py 6`：先把旧的 `mipmap-hdpi` 备份到
  `design/icons/_backup/20261106-193938/`，再把 48/72/96/144/192 五档
  `launcher-*.png` 覆盖进去，每份逐字节 hash 校验，写 `CURRENT.txt` 记选号。
  `--restore` 可一键回滚。
- `tools/check_web.js` 新增 v1.1.43 锚点：`CURRENT.txt` 必须指向 `06_夜空河字`，
  5 档 res 与方案源图逐字节一致。
- **`tools/verify_apk.py` 从四件套升成五件套**，新增 `check_launcher()`：
  包内 5 档图标与 `CURRENT.txt` 声明的方案**逐像素**一致。
  为什么不能比 zip 字节：aapt2 会对 PNG 做 crunch（重新压缩），
  包内 3106/4927/6601/9800/13007 字节都和源 PNG 不同，但像素差为 0。
  这正是「验形态而不是验存在」「SHA 只判同一个文件、不判内容」的又一例。
  顺手把 worker 锚点段的编号从 `[5]` 改成 `[6]`（原来两个 `[5]`）。

图标是纯资源替换、没有功能性变化，按 `tutorial-contract.json` 的规则
（「只改内部实现、学生看不出来 → 不用动这份表」）教程不用更，契约表保持 version 2。

验证（三层分开说，无真机）：① 编译/签名通过，证书仍与 v1.1.1 一致；
② `check_web.js` 全 PASS、教程契约 38 项全过、18 套离线测试 0 FAIL、
`verify_apk.py` 五件套全过（5 档逐像素 OK）；
③ **真机未验证**：桌面 launcher 里的实际显示、48px 下「河」字笔画有没有糊、
各家 ROM 的圆角 mask 裁切。线上仍是 v1.1.38（回读确认），学生不弹更新。

---

### v1.1.42（2026-11-06）—— 教程排版修复 + 内容追上功能 + 发版硬卡口（**只出本地包，未上线**）

用户发来真机截图：教程翻到「校园：WIKI、实景、留言」那页，白卡左右各露出
相邻页的文字碎片（右「下-」「成绩」「两个」「饮水」，左「源。」等），
左下角还有一块浅蓝。同时提了一句要求：「使用教程什么的每次版本更新，
如果有功能性变化这个也需要更新」。

**① 排版根因（截图就是验收标准）**
`.tut-box` 有 20px 左右 padding，`overflow:hidden` 只裁 **padding-box 外缘**，
padding 区本身仍然可见 —— 横排 strip 里相邻页的两头正好落进去。
左下浅蓝是上一页 `.tut-tip` 的底色。桌面 headless 看不出来，真机才漏。
修法：裁切交给一层**没有 padding** 的 `.tut-view`（`tut.js` 里
`view.appendChild(strip)`），外层卡片继续保留自己的 padding 和兜底 overflow；
同时去掉 `.tut-strip` 的 `will-change:transform` —— 部分国产 ROM 的 WebView
会为它单独建合成层，祖先的 overflow 裁切在合成层上失效。

**② 内容追到当前版本**
旧教程停在 v1.1.6，还在教「接水 → 结束并结算」（v1.1.16 已删结算）、
「我的 → 学期设置」（v1.1.40 已搬进设置页）、「右上角空教室可以查哪个教室
现在没课」（v1.1.38 起是青果 SB12 教务真实数据）——学生照着做只会找不到按钮。
重写成 7 页：概述 / 课表与空闲教室 / 学习与待办·专注·提醒三档 /
接水与空调 / WIKI / 设置与深色 / 开始使用。每页带 `since` 和 `covers`。

**③ 把「靠人记」变成硬卡口**
- `docs/handoff/tutorial-contract.json`：App 现在 15 项学生可见功能的唯一清单，
  带 `since` / `mustMention`（入口路径说法）/ `forbidden`（已删功能的话术）。
- `web/tut.js`：`TUT_CONTENT_VER` + `TUT_FEATURES` + 每页 `covers`/`since`。
- `tools/check_tutorial.js`（38 条断言）：契约表与教程声明**双向**对照、
  每个 feature 至少被一页 cover、每页 since 不早于它讲的功能里最晚的版本、
  必提词 / 禁用词 / 排版防线。用 `vm` 真跑一遍 PAGES，不靠正则抠字符串。
- `check_web.js` 同步调它；**`release_all.py` 第 1 步预检也调它** ——
  说「上线」时教程没更就 `die()`，发不出去。
- 探针实测：故意把契约表 `version` 改脏 → `exit 1 [FAIL]`；还原 → `exit 0 [PASS]`，
  文件 hash 与探针前一致。这道卡口确实红过，不是摆设。

**两个当场修的检查器自身缺陷**（都是「检查写窄了会制造假红」）：
- 禁用词 `indexOf` 把「没有广告，没有『开通会员』」这句**否定式**表述判成过时宣传
  → 改成逐行剔掉「没有/不含/不/无需 + 词」的语境再判。
- `check_web.js` 新锚点组插在 `has()` / `cssTxt` 定义之前，两次触发 const 的 TDZ
  （`ReferenceError: Cannot access ... before initialization`）；
  过时文案断言又被**自己写在文件头的修复说明**命中（本项目第二次栽在这上面）
  → 前者改为本段自读文件，后者剥注释后再查。

验证（三层分开说，无真机）：① 编译/签名通过，证书仍与 v1.1.1 一致；
② `check_web.js` 全 PASS、18 套离线测试 0 FAIL、`verify_apk.py` 四件套全过；
③ **真机未验证**：七页左右滑手感、圆点位置、不同 ROM 上裁切是否都干净。
线上仍是 v1.1.38（回读确认），学生不弹更新。

---

### v1.1.41（2026-11-06）—— 课程提醒三档：响铃 / 静默 / 短信草稿（**只出本地包，未上线**）

用户原话（追加在设置页需求后面）：「还有课前提醒，不一定非要是闹钟，
可以只设置一条短信，因为有的人不喜欢闹钟提醒」。
按项目既有边界（不自动代发、不动钱、不读通讯录）拍板做成三档可选，
不是把闹钟换成短信，也不是给一个「要不要响」的开关。

**三档**
- `alarm` 响铃：IMPORTANCE_HIGH + heads-up + 声音，沿用旧 channel
  `xxmu_class_reminder`，**老用户升级行为完全不变**。
- `silent` 静默：IMPORTANCE_LOW，不响不震不弹，只在下拉通知栏出现。
- `sms` 短信草稿：通知用静默载体，点开 `ACTION_SENDTO smsto:` 拉起系统
  短信编辑页，`sms_body` 预填「【河医大助手】课程名，N 分钟后上课，教室 X。」
  **收件人空着、「发送」由用户点**。不申请 SEND_SMS、不读通讯录、
  不用 SmsManager，`check_web.js` 四条反向断言钉住这条边界。
- 新增「试一下当前方式」：不挂闹钟，当场出一条当前方式的提醒
  （短信档直接开编辑页）。没有它，用户只能改手机时间等下一节课，根本比不出哪档合意。

**三个真坑（都是「文件齐 + 静态全绿」照样会错的那类）**
1. **NotificationChannel 的 importance 创建后改不了**。共用同一个 channel
   再动态调低，系统会忽略，结果「选了静默照样响」且无任何报错。
   所以静默另开 `xxmu_class_reminder_silent`；构造只写一处，靠
   `MODE_ALARM.equals(mode) ? ... : ...` 选 id 与重要性，避免两处各写一遍改岔。
2. **mode 必须逐项写进 build() 的 JSON**。Java 侧把这份列表原样落盘，
   手机重启后 `BootReceiver → ReminderScheduler.restore` 重挂时按它重建
   PendingIntent；不带 mode 就会退回默认响铃，用户选的静默白选。
   `optString("mode", MODE_ALARM)` 让老列表缺字段时照常响，不因升级变哑。
3. **脏 pref 绝不能把人静默**。`mode()` 与 Java 的 `norm()` 双侧把
   空值/乱码/旧值一律回落 `alarm` —— 「拦错了还能自救」这条老规矩在
   提醒上也成立：错了最多多响一次，不能从此一条都不响。

链路四端（沿用 v1.1.35 那次事故定下的规矩）：前端三档状态机 + `build()` 带 mode →
`Host.previewReminder` / `Host.openSmsDraft` 两个新桥 →
`ReminderReceiver` 读 `mode` 分支 → `ReminderScheduler` 落盘。
`test_remind_modes.js` 54 条断言（三档纯函数、build 契约、双 channel、SMS 边界、
前端接线），老 `test_reminder.js` 同步补 shim 的 `mode()` 与 3 条断言到 47 项。

验证（三层分开说，无真机）：① 编译/签名通过（证书仍与 v1.1.1 一致）；
② `check_web.js` 全 PASS、17 套离线测试 0 FAIL、`verify_apk.py` 四件套全过；
③ **真机未验证**：静默是否真的不响、短信编辑页能否拉起、通知渠道在系统设置里
   的重要性、Doze 下三档是否都准时。线上仍是 v1.1.38（回读确认），学生不弹更新。

---

### v1.1.40（2026-11-06）—— 独立设置页 + 6 套图标方案（**只出本地包，未上线；图标等用户选**）

用户发来「我的」页截图（外观混在 6 行列表里、学期设置单独一张卡、底下还散着
「重新读取本地数据」），一句「把这些外观什么的，弄出来一个设置页放进去可以，
我想换个好看点的图标，你给我生成几个方案，我来选」。两件事都落地。

**① 独立设置页（`tab-settings`，挂在 `me` 下的二级页）**
- 收拢三类「改这台手机怎么显示 / 怎么算」的东西：外观（三档主题直接铺开）、
  课表与学期（开学日 / 总周数 / 保存）、数据与更新（检查更新 / 重读本地数据）。
- 「我的」页只留一行「设置」入口 + 教程 / 帮助 / 声明 / 关于；管理员控制台不动。
- **搬动时所有 DOM id 原样保留**（`setStart` / `setSave` / `rowUpd` / `resync` /
  `startday` / `totalweeks`），所以 `app.js` 的学期绑定、`UpdateUI.init`、
  `resync.onclick` 一行都不用改。`TAB_PARENT.settings='me'` + `PAGE_HEAD.settings`
  让底栏高亮、返回箭头、物理返回键全自动。
- 静态锚点用「DOM 切片」判据：这些 id 必须**出现在 settings 段且不再出现在 me 段**
  —— 只验「存在」会放过「复制成两份同 id DOM」这个老坑。
- 外观三档不再要点开半框：`theme.js` 抽 `buildOptions()` + `mount(containerId)`，
  设置页内嵌与半框共用同一套 DOM 结构。`register(..., transient)` 区分常驻/临时组，
  `dropTransient()` 只清半框那组 —— 否则「开过一次外观再回设置页」常驻三档就被
  清空、再也不刷新。状态字改 `[data-theme-state]` 批量同步（设置入口行一处）。
- `test_theme.js` 补到 111 条断言，含「半框重开两次后设置页三档仍能切」这条回归。

**② 6 套图标方案（只给选，不擅自换）**
- `tools/gen_icons.py` 纯 PIL 绘制，零外部依赖：每套给 preview-512.png、
  icon.svg、launcher-48/72/96/144/192.png；`_总览.png` 3×2 带编号名字；
  `怎么选.txt`。项目内 `design/icons/` 留一份进 git，桌面 `图标方案\` 给用户挑。
- 6 套：A 河字蓝紫渐变（现有精修）/ B 课表网格 / C 医药十字 /
  D 极简线河 / E 三道河流 / F 夜空河字（呼应深色模式）。
- `tools/apply_icon.py <1~6>`：先备份现有 mipmap 到 `design/icons/_backup/<时间戳>/`，
  再逐份**逐字节 hash 校验**，写 `CURRENT.txt` 记选号，支持 `--restore` 与 `--dry`。
  按目录名匹配密度，不靠文件大小猜（v1.1.15 那次就是猜错版本）。
- **`gen_icons.py` 绝不碰 `android/res`**：用户没选之前换图标属于擅自扩大范围。
  `check_web.js` 有反向断言钉住这条。

**两个当场发现并修掉的小问题**：
- 总览图第一版四角是黑的：把 RGBA 缩略图直接 `paste(RGB)` 到 RGB 底图，
  透明角被当黑色。改成按自身 alpha 合成 —— 「图生成了」不等于「图能给人看」。
- 图标脚本里两行死代码（`for_x = None`、`if False else m`）清掉，重生成后
  总览 SHA 与修前完全一致，证明产物没漂。

验证（三层分开说，无真机）：① `build_apk.py` 全链路绿、签名证书仍与 v1.1.1 一致；
② `check_web.js` 全 PASS（v1.1.40 锚点组）、16 套离线测试 0 FAIL、
`verify_apk.py` 四件套全过；③ **真机未验证**：设置页在矮视口的手感、
三档在真机上的观感、图标换进 launcher 后的实际显示，都要装上看。
线上仍是 v1.1.38（`GET /v1/config` 回读确认），学生不弹更新。

---

### v1.1.39（2026-11-06）—— 主题系统 / 深色模式（**只出本地包，未上线**）

用户只说了「继续河医大助手项目」，按既定规矩：**改代码、出包、放桌面都可以，
但不切 `cfg.latest`**。线上仍是 v1.1.38（实际 `GET /v1/config` 回读确认过）。
取的是 HENUBox 对比里剩下的第一项 A-3（主题系统）。

**为什么不能只加一段 `html[data-theme=dark]` 就完事**：`app.css` 里有 113 处
硬编码颜色，其中只有 12 个在 `:root` 变量里。直接盖一层深色变量，卡片、
底栏、输入框、徽标、状态条、半框仍然全是白底浅灰字 —— 深色下会变成
「白卡片浮在深底上」的花脸。这一版先把中性字面量收敛成 47 个语义变量
（`--tap` / `--seg-bg` / `--kb-*` / `--mask` / `--tabs-bg` …），
**浅色值逐条等于原字面量**，再由深色块只换值、不改任何组件规则。
品牌蓝紫渐变、渐变上的白字、马卡龙课程色块在两种主题里保持一致。
迁移脚本每条替换都带命中数断言 + 白名单外的中性硬编码残留检查。

四端接线（缺一端就是「切了没反应」，v1.1.35 课程提醒空转八版的教训）：
1. `web/theme.js` 在 `<head>`、`app.css` **之前**加载，首屏绘制前就把
   `data-theme` 写到 `<html>`，并把 `theme-color` / Java 状态栏对齐 —— 深色
   用户冷启动不闪白。三档 `auto/light/dark` 存 `xxmu_theme`，auto 存空串，
   脏值归一化回 auto。`resolve(m, sys)` 是纯函数，6 个组合有固定断言。
2. `MainActivity.isSystemDark()` 读 `Configuration.uiMode`（`UI_MODE_NIGHT_YES`）
   作为系统真值，**不靠 `prefers-color-scheme`** —— 定制 ROM 上后者经常不跟系统走；
   `matchMedia` 只当浏览器兜底。`Host.setAppTheme` 桥改状态栏 / 导航栏 /
   WebView 底色；`onCreate` 在 `loadUrl` 之前按已存主题先设一次底色。
   `configChanges` 加 `uiMode`，系统切夜间模式时 `onConfigurationChanged` 回调
   `window.__onThemeSys` 重算颜色，不重建 Activity、不丢当前页面状态。
3. **必须关掉 WebView 的自动反色**：系统开深色时 WebView 会自己把页面反一遍，
   和我们写的深色 CSS 叠成「深底上的浅卡片被反成黑卡片」。33+ 用
   `setAlgorithmicDarkeningAllowed(false)`、29~32 用 `setForceDark(FORCE_DARK_OFF)`
   （两个 API 互斥，targetSdk 33 上前者才是生效的那个），`WebActivity` 同样关掉，
   否则青果登录页表单对比度会乱。
4. 入口在「我的 → 外观」，复用全局 `#sheet` / `closeSheet()`，三行整行可点。

**两个真时序坑（都是行为测试跑出来的，静态锚点抓不住）**：
- `#themeState` 在 `<head>` 阶段还不存在，首屏那次 `paint()` 必然扑空。
  只靠 body 末尾的 `THEME.init()` 补，一旦别处脚本异常没跑到，状态字就
  永远停在 HTML 里静态写的「跟随系统」，和用户上次选的「深色」对不上。
  现在加 `DOMContentLoaded` 兜底重画，`test_theme.js` 用 `headOnly` 开关
  真实模拟「DOM 还没解析」并单独触发这一次补画。
- `elec.js` 已经挂了 `window.__onResume` 用来回前台刷空调度数。主题也要挂，
  **整个覆盖会把空调那条冲掉**。改成 `var prev = window.__onResume` 链式保留，
  测试断言 `prev` 真的被调到。

验证（三层分开说，没有真机）：
① 编译 / 解析通过 —— `build_apk.py` 全链路绿，`apksigner` 证书与 v1.1.1 一致；
② 静态 + 行为验证 —— `check_web.js` 全 PASS（新增 v1.1.39 锚点组），
   16 套离线测试 0 FAIL（新增 `test_theme.js` 73 条断言），
   `verify_apk.py` 四件套全过（新增 4 个 dex 符号 + 3 个资产锚点）；
③ **真机未验证** —— 状态栏图标明暗、WebView 自动反色是否真被关掉、
   深色下逐页观感、切系统夜间模式时是否真的不闪，都要装到手机上看。

发版说明 `apk/v1.1.39.notes.txt` 已按「累积更新 + 不写管理员功能 + 老实交代」
写好留档；说「上线」时直接拿它走 `release_all.py` 三件套。

---

### v1.1.38（2026-11-06）—— 全校空闲教室（教务真实数据）+ 登录页终于能在手机上看见

用户上一轮做 HENUBox 对比时点出的最大单点差距就是「空闲教室」：我们只能算
「自己课表里出现过的教室」，别的班的课看不到。这一版把它做成了真的。

**先把「为什么以前做不到」说清楚**：教务是青果（KINGOSOFT），空闲教室走四个
下拉 + 一张整栋楼的一周矩阵。四个下拉（校区 / 教学楼 / 房间）都能直接拿 JSON，
最后那张矩阵才是关键。踩了三个坑才拿到它：

1. **学期编码是 `年,0` 不是 `年,1`**。青果用 `2026,0` 表示 2026-2027 第一学期
   （秋），`2026,1` 是第二学期（春）。一直按 `2026,1` 传，服务端不报参数错，
   而是回一句「未设置的周排课天数/天排课节次。请与系统管理员联系！」——
   看起来像学校没配，其实是自己传错了学期。这条是从 `Ms_KBBP_FBXQLLJXAP`
   这个「已发布学期」下拉里反推出来的。
2. **矩阵页是 GBK、`<TABLE>` 全大写、天格里一个字都没有**。判某节课有没有人，
   只能看 `style` 里有没有 `background-color:red`。写过一版「先试 UTF-8」的
   自动探测：GBK 字节能侥幸通过 UTF-8 校验，解出错字还不抛异常，比直接报错更难查。
   现在矩阵页一律按 GBK 解，不做探测。
3. **「红色 = 有课」，不是「红色 = 空」**。表头写的是「空闲节次」，照那个理解
   就整张表反了。判据不是猜的：拿用户本人第 10 周课表逐格对，红色=占用命中
   19/19、反着理解命中 0/19，全表红格比例白天 45.5%、晚上 43.8% 也符合真实教学楼。

**做了什么**：

1. 新增 `web/free.js`（全局 `KFREE`）：校区 → 教学楼 → 周次 → 星期 → 时段 → 座位
   筛选，底部给出这栋楼这个时段「全空的教室」清单（房间号 + 类型 + 座位数 +
   具体空哪几节）。数据走 `netCk`（带教务 Cookie 的桥），5 分钟缓存。
2. **入口收口到一处**：课表页顶部「空教室」按钮和校园事务页「空闲教室」行都走
   `KFREE.open()`。原来那套「按自己课表推算」降级保留，改名 `openFreeLocal()`，
   在结果页底部作为「用本机课表估算」的备选。
3. **教务登录页在手机上终于能看见表单**。青果是纯桌面布局，`.login-info-div`
   固定 760px，手机视口 412px，账号密码框落在屏幕右边外面——用户说的
   「打不开、一直加载」其实是「表单在屏幕外」。`WebActivity.java` 加了 `FIT_JS`：
   找出最宽容器算缩放比，同时设 `documentElement` 和 `body` 的 `zoom`。
   不用 meta viewport 的 initial-scale（青果 px 写死成桌面像素，改 scale 只缩字、
   容器仍溢出）；两个都设是因为只设 html 时 body 自带 width 会二次覆盖。
4. **「已登录」不再误报**。青果**未登录时也会下发 43 字符的 JSESSIONID**，
   旧判据 `Host.cookies().length > 20` 永远为真，「我的」页永远显示「已登录」。
   现在要两个证据同时成立：①有教务 cookie；②真的从教务拿到过数据
   （课表同步成功或空闲教室查成功，记 `xxmu_kb_ok`）。只有 ① 时显示「未验证」。
   退出教务登录时把这条记录一起清掉。

**顺手修的一个真 bug**：`ensureBuilds()` 命中缓存时直接 return，漏了
「楼号为空就默认选第一栋」。第二次进同一个校区时 `ST.build` 还是空的，
`loadMatrix` 带着空 `selLF` 去查，后端不报错、直接返回全校 185 间，
界面上教学楼那一排一个都没选中。真机上就是这样看到的「空 89 / 185 间」，
像是没选楼就给了答案。现在缓存命中也会补默认值。

**包信息**：`apk/xxmu-helper-v1.1.38.apk`，612205 字节，
SHA-256 `c8540b667a62…`，versionCode 1138。assets 内 `free.js` 21792 字节、
`app.js` 209207、`index.html` 53261、`app.css` 47915、`classes.dex` 641676。

**验证到哪一步**：
- 静态体检 `node tools/check_web.js` → PASS；新增 v1.1.38 段 21 条断言
- 离线 `node tools/test_free.js` → 32 项全 PASS（含「红=占用 19/19」「反着理解错 19 格」）
- 全 16 套离线测试 PASS
- 制品 `python tools/verify_apk.py` → 四件套 PASS（assets 逐字节、free.js 5 个符号、badging 1138/1.1.38、签名证书与 v1.1.1 一致）
- **真机已验证**（一加 15 / Android 17 / v1.1.38 已装）：新乡校区 → 第三教学楼 →
  第 10 周 → 周四下午，能拿到真实空闲清单；切校区来回后教学楼默认值正确
- **没验到**：别的楼/别的周是否都正常（只抽了一栋一周）；「晚上 11-14」「全天」两档
  在含「傍晚」节次时的口径；其它校区的楼名是否都带「XX楼-」前缀
### v1.1.37（2026-11-06）—— 度数直接印在入口卡上，不用点开

用户原话：「可以把这个剩余度数显示在这个按钮的右边，然后再每过十分钟自动刷新，
再加个手动刷新按钮」。

上一版（v1.1.36）把四级选择压成「只选一次」，但还剩一步多余的：
**想知道剩多少度，仍然得先点一下卡片、等半框弹出来。** 这一版把那一步也省了。

1. **入口卡改成左右两栏**。左边还是「宿舍空调 / 点一下看详情」，
   右边一个 30px 的大数字 + 「度」，数字下面是「刷新」小胶囊按钮。
   一眼看到度数，不用点任何东西。
2. **每 10 分钟自己刷一次**。`setInterval` 里只调 `entryRefresh()`，
   它只改入口卡上那个数字，**不重绘半框、不碰 TOKEN** ——
   半框开着的时候也不会被刷新打断。
3. **「刷新」按钮点完不弹半框**。`ev.stopPropagation()`，
   否则点刷新等于点了整张卡，半框跟着弹出来，看着像"刷新要跳一层"。
4. **启动时顺手刷一次**，但 10 分钟内查过就跳过，不做无意义的重复请求。

**两个判断是这一版的关键，都写在注释里了：**

- **只有数字属于「当前记住的那个房间」才显示。** `c.rv === cur.rv` 不成立时一律显示 `--`。
  换房间（`commit()`）后立刻 `paintEntry()` 把旧数字抹掉 ——
  不同房间的剩余度数是两回事，把旧房间的 57.72 留在新房间旁边，
  学生会拿它当自己宿舍的度数去算电费。
- **没数据显示 `--`，不显示 `0`。** `0` 是「真的没电了」，`--` 是「不知道」，
  这两种状态混在一起，比不显示更糟。

**踩的坑：**

- 出包前后总字节数一模一样（599857），差点以为是没打进去。实际 `assets/elec.js`
  从 27553 涨到 31939、`assets/app.css` 从 46564 涨到 47331、`index.html` 涨到 53241，
  增量全被签名块和对齐填充吸收了。**判「打进没打进」永远看 APK 内的条目字节，
  不看总大小**（这条在 v1.1.32~v1.1.35 已经栽过一次，这次没再被绊住）。
- `node tools/check_web.js` 在 build **之前**必然报 4 项「与 assets 不一致」——
  那是正常的，`build_apk.py` 的 `sync_assets` 才会把全量 assets 同步过去。
  build 完再跑就全 PASS。别在 build 前的那一轮 FAIL 上找 bug。

**包**：`apk/xxmu-helper-v1.1.37.apk`，599857 字节（与 v1.1.36 同字节，见上条）。
**未发布**：线上仍是 1.1.23，等用户说发版再切 `cfg.latest`。

**验证到哪一步**：`node tools/check_web.js` PASS（新增 v1.1.37 段）／
`node tools/test_elec.js` 53 项 PASS（新增 13 项）／15 套离线测试全 PASS／
`verify_apk.py` 四件套 PASS／`aapt2 dump badging` = 1137 / 1.1.37／
headless Edge 按 492 宽渲染了三种状态（57.72 / `--` / 1234.56），
数字右对齐、超长数不换行、按钮不被挤掉。
**没验到的**：10 分钟定时在真机上会不会被系统杀掉、刷新按钮手感、
换房后入口卡是否真的变 `--`、校园网下接口通不通 —— 这四件只能真机看。

---

### v1.1.36（2026-11-06）—— 宿舍空调只选一次房，之后点开直接出度数

用户原话：「每次点进去都要一遍遍选校区公寓楼层宿舍空调，很麻烦，能不能优化一下」。

**先摸清为什么必须选一次。** 完美校园的 `h5_getstuindexpage`（查剩余度数那个接口）
只要服务端没有 `bindroom` 过，不管传 `roomverify` 还是传完整四级参数，一律回
「未绑定房间 / 根据 roomverify 查询的用户房间绑定为空」—— 实测四种参数形态全一样。
也就是说这个网关**没有「只读按房间号查」的口子**，必须先把房间登记到学号名下。
完美校园自己的缴费页也是这么做的：点进「云缴费 → 宿舍空调」逐级选，选完那一次
在服务端等价于一次 `bindroom`。

所以这一版不是「绕过绑定」，而是把「每次重选」压成「只选一次」：

1. **记住选过的房间**（`xxmu_elec_room`）。选一次，之后就直查。
   学生若本来就在完美校园里登记过房间，`getbindroom` 直接能拿到，连选都不用选。
2. **登记丢了自动补**。换手机/服务端清过之后，接口回「未绑定房间」，
   此时按记住的房间自动 `bindroom` 一次再查，不把学生丢回选择器。
3. **换房间时解绑旧的**。实测绑定是累加的（连绑两间 `existflag=2`），
   不清旧的会越攒越多。只在「换成另一间」时解绑，且只解自己刚换掉的那一间。
4. **楼层只列空调分表**。楼层列表里照明表（3层照明/4层照明…）和空调表（5层空调…）
   混在一起，剩余度数根本不是一回事，混着列等于给了两条都对不上的数字。

顺手补的两件（同一批体验问题）：

- **切回 App 自动刷一次**。Java 侧新增 `onResume` 回调 `window.__onResume`，
  页面侧 `autoRefresh()` 判三个条件：半框开着、`.elec-face` 还在 `sh-body` 里、
  上次数据超过 30 秒。不满足就不刷 —— 刚看过又刷一遍等于白花一次请求。
- **点开的一瞬间就有数字**。把上次查到的度数存 `xxmu_elec_last`，先贴出来再后台查，
  不白屏。查询失败时保留旧数字 + 一行「没查到最新数据，上面是上次的」，
  而不是把已经看到的数字抹成一片错误提示。
  结果旁边写上「刚刚更新 · 11:58 查的」，让人知道这个数字新不新。

**没有做成定时轮询**：接口是学校的，按秒刷等于给学校服务器添乱，
而且这个数字变化本来就慢（一次充电几十度能用好几天）。只在「打开」和「回前台」时查。

**踩的坑（留给下一个接手的人）**：

- `getfloorlist` 的参数名必须是小写 `buildid`。写成 `buildId` / `buildingid` / `id`，
  服务端**不报错**，直接把全校 221 条楼层全返回。这类静默错最难查，
  所以 `test_elec.js` 里专门断言了「没有写错成 buildId/buildingid」。
- `getbuildlist` 必须带 `account`，否则 `-20003 参数异常：account不存在`。
- `roomverify` 是 5 段 `zoneid-buildid-unitid-floorid-roomnum`，第 3 段（单元）恒空，
  写成 4 段回「接收数据异常: 4」，不是明确报错。
- `bindroom` 六个参数缺一不可（`account/roomverify/zoneid/buildid/floorid/roomnum`），
  少一个就「必要请求参数缺失」；`unbindroom` 相反，只需 `account + roomverify`。
- 真机切后台时 WebView 常常仍报 `document.hidden === false`，
  只挂 `visibilitychange` 收不到「回来了」这个事件，必须由 Java 侧 `onResume` 补一条。

**包**：`apk/xxmu-helper-v1.1.36.apk`，599857 字节（比 v1.1.35 大 8KB，
因为 elec.js 从 12431 涨到 27553、app.css、classes.dex 都变大了）。
`assets/elec.js` 与 `web/elec.js` 逐字节一致。
**未发布**：线上仍是 1.1.23，等用户说发版再切 `cfg.latest`。

**验证到哪一步**：`node tools/check_web.js` PASS（新增 v1.1.36 段 20 余条断言）／
`node tools/test_elec.js` 43 项 PASS（新增）／13 套既有离线测试全 PASS／
`verify_apk.py` 四件套 PASS／`aapt2 dump badging` = 1136 / 1.1.36／
dex 里有 `__onResume`。
**没验到的**：接口在真机 + 校园网下通不通、切回 App 会不会真的刷 —— 这两件只能真机看。

---

### v1.1.35（2026-11-06）—— 课程提醒从「写得完整」修到「真的能响」

**这是一个从 v1.1.27 起就存在的问题：课程提醒在真机上一条都没响过。**

v1.1.27 加这个功能时，`web/reminder.js` 写得挑不出毛病，`Host.scheduleReminders`
桥也在，`check_web` 那一版的六条锚点全 PASS —— 但整条链路在最后一格断掉了。
三处断点叠在一起，任何一处都足以让通知永不出现：

1. **`AndroidManifest.xml` 里没有 `<receiver>`。** `ReminderReceiver.java` 存在、
   被 `MainActivity` 两处 `new Intent(this, ReminderReceiver.class)` 引用，
   但类没有注册，系统到点广播时无人接收。`AlarmManager` 那边一切正常，
   闹钟确实按时触发了，只是触发了之后什么也没发生。
2. **没有声明 `POST_NOTIFICATIONS`。** `canNotify()` 在查这个权限，
   `requestNotifyPermission()` 在请求它 —— 但 manifest 里没有这条权限，
   Android 13+ 上 `requestPermissions` 对未声明的权限会被系统当场拒绝，
   `canNotify()` 恒为 false。
3. **没有 `RECEIVE_BOOT_COMPLETED`。** 重启后 `AlarmManager` 会被系统清空，
   没人在开机时把提醒挂回去，学生周五设的提醒周一就静默消失了。

**为什么静态体检没拦住**：v1.1.27 那一段断言的六条全部是「前端有没有写」——
`src="reminder.js"`、`const REMINDER`、`Host.scheduleReminders`、
`courseDate(`、`startTimeOf(`。一条都没有问「Java 那头接不接得住」。
这是「文件生成了 ≠ 文件对」的老毛病：前端完整、体检全绿，链路在另一端断掉。

**改法：**

- 新增 `android/src/com/xxmu/helper/ReminderScheduler.java` —— 闹钟调度的唯一实现。
  之前 `scheduleReminders` 与 `reminderPi` 各有一份 `PendingIntent` 构造，
  两处一旦改岔就 cancel 不掉旧闹钟、或重复挂两条同样的通知。现在挂/清/重挂全走一处。
- 新增 `android/src/com/xxmu/helper/BootReceiver.java` —— 开机与自更新后
  `ReminderScheduler.restore()` 重放本地存的那份列表。整个 `onReceive` 包在
  try/catch 里：开机广播里抛异常，系统就不再给这个 App 投递开机广播了。
- manifest 补两个 receiver + 三条权限。`ReminderReceiver` 设 `exported="false"`
  （外部 App 不该能伪造一条「还有 5 分钟上课」的通知）；`BootReceiver` 只能 `exported="true"`，
  否则收不到系统广播。
- `MainActivity`：删掉多余的 `reminderPi()`；新增 `exactAlarmOk()` 与
  `openExactAlarmSettings()`；新增 `onRequestPermissionsResult`，把授权结果
  通过 `window.__onNotifyPerm(granted)` 回传给前端。
- `reminder.js`：`apply(quiet)` —— `refresh()` 每次下拉刷新都调它，
  每刷一次弹一次「已设置 N 个」会让人以为哪里在反复设置。
  `paint()` 改成三态：`未开启` / `待授权通知` / `提前 N 分钟` ——
  授权没给却显示「提前 15 分钟」，是另一种形式的谎报。
  精确闹钟被系统关掉时给一句实话 + 一个「去打开」的出口
  （Android 12+ 把「闹钟和提醒」做成了可撤销的特殊权限，关掉后提醒还在，只是会晚几分钟）。
- `check_web.js` 新增 v1.1.35 段：**两端都断言**。manifest 必须有 receiver 与三条权限、
  `exported="false"`、`ReminderScheduler` 里必须有 `canScheduleExactAlarms` /
  `setAndAllowWhileIdle` / `restore` / `KEY_LIST`，反向断言 `MainActivity` 里
  不许再出现第二份 `getBroadcast(...i + 1)`。
- 新增 `tools/test_reminder.js`（45 项，三段）：①前端算时间（用假 `TIMES/START/DATA`
  跑 `startTimeOf`/`courseDate`/`build`，断言 08:00 解析、第 1 周周三第 2 节 = 01-09 08:55、
  第 2 周 +7 天、只留未来、升序、缺数据返回空数组而不是抛错、超总周数丢弃）；
  ②Java 与 manifest 接线；③前后端契约（200 条上限、`__onNotifyPerm`、`exactAlarmOk`）。
  **它验的是「链路两端都在」，不是「通知会弹」** —— 后者只能真机。

**一个容易误判的现象**：包 591665 字节，和 v1.1.32/1.1.33/1.1.34 完全相同。
不是没打进去。逐条比 zip 条目才看得出：`classes.dex` 压缩后 306335 → 307688、
`AndroidManifest.xml` 1425 → 1731、`assets/reminder.js` 3317 → 4305、`app.css` 12154 → 12231，
加起来的增量被签名块与对齐填充吸收，总字节数恰好回到同一个数。
**判「打进没打进」要看 dex 里有没有那个类名**（`ReminderScheduler` / `BootReceiver`
在 v1.1.34 的 dex 里都为 False，v1.1.35 都为 True），不看总大小。

**顺手修掉的一处「假 FAIL」**：`tools/verify_apk.py` 从 v1.1.23 起一直是红的 ——
它还在断言 v1.1.14 那套内嵌详情卡（`function showDetail(id, fromRow)`、`DETAIL_FROM`、
`card.scrollIntoView`、`id="admDetailCard"`、`id="admDetailBody"`），
而 v1.1.23 已经把这些整体换成全局半框 `#sheet`。**删功能时忘了删它的锚点**，
于是「四件套」从 v1.1.23 到 v1.1.34 十个版本都没被真正跑过 ——
一个永远红的检查等于没有检查。现在锚点改成新设计
（`showDetail(id)` / `DETAIL_OPEN` / `#sheet` 的 `.on` / `sh-body` / `sh-name`），
`[PASS] 四件套全部通过`。

版本号 1.1.35 / 1135，包 591665 字节，SHA-256 `375056d1ae50…073fd0`。
`check_web` 全过 + 13 套离线测试全过（新增 `test_reminder` 45 项）+ `verify_apk` 四件套全过。
**未发布线上**（本轮原话是「读取记忆，唤醒河医大助手项目」，没有发版授权）。
仅编译 + 静态/行为验证，**无真机验证** —— 通知到底弹不弹、Doze 下准不准，装上才知道。

---

### v1.1.34（2026-11-05）—— 纯版本号

只有 `about.js` 与 `index.html` 的版本号，无功能改动。包 591665 字节。

**为什么会有这种版本**：v1.1.32 与 v1.1.33 的改动都在 `elec.js` 一个文件里，
两次都打在同一批字节数上，需要一次干净的版本号来区分真机试的是哪一版。

---

### v1.1.33（2026-11-05）—— 拉起完美校园改按包名

v1.1.30~v1.1.32 的「去缴费」一直用 `intent://...#Intent;scheme=...` 拉起完美校园。
真机反馈是「没有可用的浏览器」—— 那套 scheme 在目标 App 里没注册，
`intent://` 落到浏览器手里就只能报这句话。

- `elec.js` 改成 `Host.openApp('com.newcapec.mobile.ncp')`，按**包名**拉起。
- `AndroidManifest.xml` 补 `<queries><package android:name="com.newcapec.mobile.ncp" /></queries>` ——
  Android 11+ 的包可见性限制：不声明 `queries`，`getPackageManager()` 连
  「这个包在不在」都查不到，`openApp` 会永远认为没装。
- 拉起失败时插一段 `.openapp-fail`，给支付宝小程序的兜底路径。

---

### v1.1.32（2026-11-05）—— 空调：不再瞎猜房间，不再假装能缴费

三处都是「宁可说不知道，也别给一个错的答案」：

1. **`findAircon()` 不再 `return rooms[0]` 兜底。** 原来查不到空调表就退到第一个房间，
   于是「绑了电表但没有空调」的学生会看到一个热水表剩余额，还以为那就是空调电费。
2. **区分两种空**：「没绑定房间」与「绑了但没有空调电表」是两件完全不同的事，
   前者要去完美校园绑房间，后者是宿管没装空调表 —— 原来都显示同一句话，谁也修不了。
   后一种现在把 `roomfullname` / `roomverify` 列出来，学生报给宿管时能直接念。
3. **「去缴费」改成三步指引。** `PAY_URL` 在浏览器里打开是空白页（那个页面只对
   App 内的 WebView + 登录态有反应），继续 `Host.openUrl` 等于把人送到白屏。

---

### v1.1.31（2026-11-05）—— 空调入口提成校园页顶部的强调卡

`#rowElec` 原来在「其他」卡里的一行，和一串开关混在一起，没人找得到。
改成独立渐变卡 `#elecCard`（`.elec-entry`，`linear-gradient(150deg,#3b82f6,#2563eb 60%,#4f46e5)`），
放在校园页顶部。**理由**：剩多少电是「现在就想知道」的信息，
和「设置里某个开关」不是一个访问频率。

---

### v1.1.30（2026-11-05）—— 宿舍空调剩余度数

新增 `web/elec.js`（首版 244 行）+ `#rowElec` 入口。

- 走完美校园的 `SWAEServlet`：`getbindroom` 查绑定房间、`h5_getstuindexpage` 查余额，
  `CUSTOMER_CODE = '709'`（河医大的学校代码）。
- 这个接口**零鉴权**：只要 POST 一个学号就能查。所以给自己定了三条红线写进文件头：
  ①只读，不发任何写操作；②只用用户在 App 里已登记的学号，不做「输入别人学号查别人寝室」；
  ③**不实现支付** —— 能查到余额不等于有资格替人扣钱。
- 请求必须带 `X-Requested-With: com.newcapec.mobile.ncp` + `Origin` + `Referer`，
  且**不能**自己设 `Host`（WebView 会拒），否则被当成脚本拦掉。
- 其他：`K_ACCOUNT = 'xxmu_elec_account'`、`BASE` 与 `PAY_URL` 写死在文件头。

---

### v1.1.29（2026-11-05）—— 提醒开关切了状态不刷新

`reminder.js` 两处漏了 `paint()`：`sw.onchange` 与 `sel.onchange` 里只改了
pref 和重挂闹钟，没重画入口行 —— 于是开关明明打开了，外面还写着「未开启」。
另外 `openSettings()` 开头补 `parkTools()`（v1.1.28 的停车场机制：待办/番茄钟卡
若还住在半框里，会和设置表单叠着）；`paint()` 去掉对 `#remindRow` 的 early return。

**这类 bug 的特征**：改的是内部状态，漏的是「把状态画出来那一步」，
而静态检查只能看到前一半。

---

### v1.1.28（2026-11-05）—— 待办与番茄钟缩成入口小按钮 + 停车场

三张卡（待办、番茄钟、课程提醒）各占一屏，学习页被它们挤得只剩一条缝。

- 头部 `#refresh` 那一行改成 `<span class="learn-tools">`，内含
  `#todoEntry`（「待办 · N」）、`#focusEntry`（「番茄钟 · 25:00」）、`#refresh`。
- 两张卡移进 `<div id="toolPark">`（`display:none`），加 `sheet-only`，
  点入口时才 `openToolCard()` 请进 `#sheet` 半框，关半框时 `parkTools()` 送回去。
  **为什么用「停车场」而不是销毁重建**：卡片里有正在跑的计时器与用户输入，
  重建一次就把秒表和输入框一起清了。
- 顺手纠正 v1.1.24 的分组顺序：`const ra = x => x.open ? 0 : (x.notStart ? 1 : 2);` ——
  **待做排最前**。「未开始」的作业和考试还早，让它占着首屏是把最该做的挤下去。

---

### v1.1.27（2026-11-05）—— 课程提醒（**v1.1.35 之前一直没真正生效**）

新增 `web/reminder.js`（210 行）+ `#remindCard`。前端读 `app.js` 已算好的
`DATA.courses / TIMES / START / TOTAL_WEEKS`，把「未来每节课的绝对毫秒时间戳」
一次打包成 JSON 交给 `Host.scheduleReminders`，真正定时由 Java 侧 `AlarmManager` 挂，
到点 `ReminderReceiver` 发通知。

- 关键设计：前端只算一次、不轮询。锁屏/切后台后 WebView 的 `setInterval`
  会被系统节流甚至冻结，前台数秒的提醒在真机上几乎必然晚点。
- 提前量存 `xxmu_remind_mins`（默认 15），开关存 `xxmu_remind_on`。
- `startTimeOf()` 从 `"08:00~08:45"` 取 HH:MM；`courseDate()` 由 `START` 推绝对日期；
  `build()` 只留未来项、按时间升序。

**这一版的问题**（详见 v1.1.35）：`ReminderReceiver` 没在 manifest 注册、
`POST_NOTIFICATIONS` 与 `RECEIVE_BOOT_COMPLETED` 都没声明。文件本身写着
「无法离线验证：通知是否真弹、Doze 下是否准时，只能在真机上确认」——
而它确实从没在真机上被验证过，也确实一次都没响过。
**教训**：一句「只能真机验」不是免责声明，是一个待办；写下来就要去验。

---

### v1.1.26（2026-11-05）—— 专注计时

新增 `web/focus.js`（501 行）+ `#focusCard`。番茄钟 + 正计时 + 白噪音 + 今日/本周统计，
纯本地（`xxmu_focus`），不上传。四条设计约束写在文件头：

1. **计时用「结束时间戳」不用「每秒 +1」。** WebView 切后台/锁屏后 `setInterval`
   被节流，每秒累加的秒表会慢；存 `endAt` 反推，回到前台时数字是对的。
2. **白噪音用 Web Audio 合成，不引音频文件。** 三种（white / pink / brown）2 秒循环 buffer，
   pink 用 Paul Kellet 简化滤波。不引文件是为了不给 APK 增重、也不让断网影响播放。
3. **番茄钟阶段结束只提示，不自动开下一段。** 自动循环会在人走开的时候自己往下走，
   记录跟着乱，统计变得毫无意义。
4. 日志只留 90 天（`MAX_LOG_DAYS`），`merge()` 逐字段兜底
   （`focusMin` 1~180、`restMin` 1~60、日期必须匹配 `/^\d{4}-\d{2}-\d{2}$/`）。

---

### v1.1.25（2026-11-05）—— 我的待办挪到学习页最顶部

只有 `index.html` 一处搬动：`#myTodoCard` 从 `#hwlist` 之后移到学习页最顶部。

理由写在注释里：待办是「随手记」的东西，必须一进来就能点「+ 加一条」；
原来排在作业列表下面，要滚半天才够得着，记一条得先翻到底。
学习通那批有截止时间、会自己冒出来，往下排不影响它该出现时出现。

---

### v1.1.24（2026-11-05）—— 纯版本号

只有 `about.js` 与 `index.html` 的版本号。
对应的功能改动（「未开始」分组）实际已在 v1.1.23 的包里，这一版是补一个可识别的版本号。

---

### v1.1.23（2026-11-05）—— 「未开始」单独成组 + 管理台详情改走半框（**已发线上**）

**功能：作业与考试的「未开始」从「待完成」里拆出来**

`web/chaoxing.js`：`OPEN_WORDS` 移除 `'未开始'`，新增
`NOTSTART_WORDS = ['未开始', '未开考']`，`classify()` 返回 `'notstart'`。
`web/app.js` 里 `else if (k === 'done' || k === 'notstart') w._open = false;`，
条目带 `notStart: k === 'notstart'`。

**为什么必须拆**：「未开始」的作业和「还没做完」的作业，对学生是两件事——
后者现在就该动手，前者要等到老师放开。混在一组里，最先看到的一直是那些还不能做的。
拆出来后考试也一样处理：`if (notStarted) e._open = false;`，显示「距开考 fmtLeft(x.leftStart)」。

**功能：管理台详情从内嵌卡片改走全局半框**

`showDetail(id, fromRow)` → `showDetail(id)`，删掉 `#admDetailCard` 整块，
改走 `#sheet`（`$('sh-body')` / `$('sh-name')` + `classList.add('on')`），新增 `DETAIL_OPEN`。
`admDetailClose` 只留兼容钩子。

这处是照用户原话改的：「点详情能不能弹一个半框页面显示，而不是加载在上面」——
内嵌卡片会把下面的列表整体推下去，看完一条要重新找回原来的位置。

版本号 1.1.23 / 1123，包 571000 字节，SHA-256 `fc7cf216af26…f3380e`。
**这是当前线上版本**（`cfg.latest` 指向它）。发版说明见 `apk/v1.1.23.notes.txt`。

---

### v1.1.22（2026-11-05）—— 学习页「我的待办」+ 交接文档拆成三层

**功能：学习页新增「我的待办」**（`web/mytodo.js`，纯本地，18.7 KB）

学习通里只有老师正式发布的作业和考试。真正容易漏的是另一类：上课口头说的、
群里通知的、班委让交的材料 —— 这些系统里根本没有，学生记在纸上或微信收藏里然后忘掉。

- 数据只在本机（`Host.getPref('xxmu_mytodo')`），不上传、不进 KV、不进服务端。
  和教务密码同一处理口径（功能边界红线：服务端只放授权状态与版本）。
- **和学习通作业分开渲染，不混排**：混在一起之后用户分不清「这条是系统给的」
  还是「这条是我自己记的」，出问题也无从判断是谁错了。
- 视觉上与作业卡片刻意不同：作业卡是左侧状态色条，待办是圆形勾选框。
- 排在 `#hwlist` **之后**：学习通那批有截止时间、会自己冒出来，先给它们。
- 加一条用 `#sheet` 表单而不是 `prompt()` —— 要收两个字段（内容 + 日子），
  而且 v1.1.8 那条教训：`WebChromeClient` 默认不实现 `prompt()`，静默返回 null。
- 删除要点两次（先变成「再点」）—— 用 sheet 弹确认框对单条小操作太重，
  误删一条自己写的东西又确实恼人，二次点击是这两者之间最轻的护栏。

**测试抓出并修掉的真 bug：日期只验格式不验真实性**

`norm()` 里原来写 `due: /^\d{4}-\d{2}-\d{2}$/.test(...)`。`2026-13-45` 完全符合这个
正则，能存进去；之后 `new Date('2026-13-45')` 得到 Invalid Date，排序里
`dueKey` 变 NaN → 这一条会莫名其妙排到最前或最后。现在 `safeDue()` 回填一次
ISO 比对，同时挡住 `2026-02-30` 这种「月份对、日超界」（JS 会静默进位成 3 月 2 日）。
**这个洞是 `tools/test_mytodo.js` 的 [2] 组跑出来才发现的，不是读代码看出来的。**

**坑：脏数据只丢单条，不丢整份**

同组测试还验证了「7 条记录里 4 条格式不对」的场景：必须活下来 3 条好记录，
并把「丢了 4 条」说出来。一条记录写坏就把用户所有待办清空，是这类结构最糟的失败方式
（v1.1.8 的 `getIdx` 就是这么永久清空过管理名单的）。

**坑：测试 shim 不准会制造假 FAIL**

`test_mytodo.js` 第一版的 DOM shim 有两个错：`classList.add()` 不同步 `className`
（代码里靠它上色的地方全被认定没上色）、`innerHTML=''` 不清空 children
（render 每次重画都往同一数组追加，越测越多）。结果代码是对的、测试说错的 ——
比不测更糟。现在 shim 里 `className` 与 `classList` 共用同一个 Set，`innerHTML`
真的清空。

**工具修正 1：`scan_secrets.py` 的 BLOCK 判据错了，439 条全是误报**

原来只要路径命中 BLOCK_PATHS 就报 BLOCK，于是 `build_html/`（本地调试快照）、
`android/xxmu.jks`、`server/DEPLOY-OUT.txt` 这些**已经被 `.gitignore` 挡住、
git 从未跟踪过**的文件也刷出 439 条。跑几次没人看，等于这个脚本废了。
现在分两档：`.gitignore` 已覆盖 → 「已挡住」（列出来但不报错、跳过内容扫描）；
没覆盖 → 才是真 BLOCK。误报从 439 降到 0。
**判据要落在「会不会进仓库」，不是「文件在不在磁盘上」。**

**工具修正 2：`publish_apk.py --no-publish` 会留下坏包状态**

`--no-publish` 的本意是「存着但不通知学生」，但它**确实把 `apk:blob` 换成了新包**，
而 `cfg.latest` 里还是旧版本号和旧 sha256。v1.1.9 起客户端下载完要拿
`cfg.latest.sha256` 校验 → 学生点「去下载」拿到新字节、校验失败、装不上，且无提示。
2026-11-05 我这么干了一次，发现后立即把 blob 恢复成 1.1.17 并三处核对一致。
现在脚本自己处理：`--no-publish` 且新旧 sha 不同时，自动把 `apk:blob`/`apk:meta`
恢复成 `cfg.latest` 声明的那一份（按 sha256 在 `apk/` 里找回，不按文件名 ——
v1.1.16 与 v1.1.17 字节数相同，只有 hash 能唯一确定）。
**不再允许「blob 新、cfg 旧」这种中间态。**

**工具修正 3：`push_via_api.py` 收尾那句 `reset --hard` 是个陷阱**

github.com 连不上时 `fetch` 会失败、`refs/remotes/origin/main` 仍是**旧** sha，
于是 `reset --hard origin/main` 会把刚推上去的提交连同工作区未提交的改动一起
退回上一个提交 —— 内容已经在远程了，本地反而丢一份。这一轮真栽了一次
（本地提交被 reset 掉，靠重新 commit 补回）。现在脚本自己：
①用 API 的 tree 逐文件比 blob sha 证明「内容完全一致」；②只有本地真有这个
commit 对象时才 `update-ref`；③提示命令从 `--hard` 改成 `--soft`。
第二版还踩了一个：远程 sha 是 API 造的，**本地根本没有这个 commit 对象**，
`git diff <remote> HEAD` 直接报 `bad object` —— 所以比对只能走 API tree。

**文档重构：交接说明拆成三层（这才是「对话太长点不进去」的解法）**

`HANDOFF.md` 1912 行 → 297 行，只留几个月才变的东西（架构/数据模型/打包/稳定的坑）。
- 每版历史 → `docs/handoff/changelog.md`（1600 行，按需查，就是本文件）
- 待办 → `docs/handoff/todo.md`，改成可勾选清单
- 新增 `tools/state.py` + `STATE.md`：从**制品本身**读（`aapt2 dump badging` 读包内版本、
  磁盘三处版本号互校、线上 KV 的 `cfg.latest`、git HEAD）生成一页状态快照。
  接手会话只读这一页。**不接受手填** —— 手填版本号就是 v1.1.15 那次
  「cfg 说新版、下载到旧字节」的根源。

版本号 1.1.22 / 1122，包 571000 字节，SHA-256 `33e4d744…d999b`。
全套 11 套离线测试（mytodo 新增 85 项）+ `check_web`（v1.1.22 段 16 条锚点）+
`verify_apk` 四件套全过。**未发布线上**（本轮原话是「继续」，没有发版授权）。
仅编译 + 静态/行为验证，**无真机验证**。

---

### v1.1.21（2026-11-05）—— 饮水机不再谎称毫升，停止后多盯 5 秒

用户实测：接热水约 250ml，界面停在「已出 0」，结算后账单显示 32。三个数对不上。

**根因不是取数失败，是单位从来没被证实过。** 翻了胖乖的官方 h5：
它对 `amount` 只做「大于 0 就建单」的判断，**从不显示** —— 所以没有任何
可参照的单位。既然不知道，写一个猜的「毫升」比不写更糟：它让学生以为
到了 200 毫升，而实际停在哪里并不确定。

改法：

- 界面文案不再把 `amount` 当毫升，改说「平台回报的用量，单位以胖乖账单为准」；
  目标按钮的数值也跟着去掉单位，`200/350/500` 改成 `100/200/350`。
- **停止后多盯 5 秒**（`SETTLE_GAP = 5000`）。原来 `status 3/5` 一到就
  `resolve`，而那时平台还没把最终用量结算出来，`r.amount` 是停阀前的旧值。
- 轮询 `1000ms → 800ms`；`amount` 改为单调递增，平台偶尔回一个旧的 0
  不再把界面打回 0。
- `ZERO_WARN_AT` `20 → 25` 秒（平台回报本身有延迟，20 秒就提醒太早）。
- 结束面板给出原始回报 `amount=… status=… 轮询 N 次` + 「复制这次的数据」，
  单位再起争议时学生能直接把现场发过来。

`test_water` 的 [2] 组样本阈值跟着从 20 提到 26 —— 否则测的是「没到阈值」
而不是「不提示」。`check_web` 新增 4 条锚点：不许把 `amount` 拼成毫升、
必须保留单位免责说明、停止后必须有观察窗口、`amount` 必须单调。

版本号 1.1.21 / 1121，包 562746 字节，SHA-256 `d290b306753c…3d3b42`。

---

### v1.1.20（2026-11-05）—— 官网改版 + 界面示意图 + 一键发版脚本

**这一版没有 APK。** 改的全在 `server/pages/dist/`，所以没有新包、
不改 `versionCode`。这一条记在这里是为了让「v1.1.20 去哪了」有个答案。

- 新增三张界面示意图（课表 / 学习 / 饮水机）与品牌图标，**纯 SVG 代码绘制、零外部依赖**。
  页面如实标注「示意图，非真机截图」—— 本机没有真机也没有模拟器，
  headless 截 App 页面不稳定，拿渲染残缺的截图充数比不画更糟。
- 新增「找我」区块：QQ `572833261`（点击复制）、GitHub、更新群 `1097668324`、邮箱。
  QQ/群号点击复制做了三级兜底（`navigator.clipboard` → `document.execCommand` →
  选中文本提示手动复制），**只有真的成功才提示成功**。
- Hero 区改两栏（文案 + 三台手机并排），加三枚卖点小标签；功能卡与联系方式卡
  加悬停位移与阴影。
- 新增 `tools/gen_shots.py`（按 App 真实 UI 结构生成 SVG）。
- 新增 `tools/release_all.py`：一条命令走完 预检 → 发布 KV → 验线上 → 改文档
  → 提交 → 推送 → 建 Release → 终验 八步，任一步失败即停。
- `check_web.js` 新增 v1.1.20 段 13 条：图片存在性、SVG 单根元素、QQ/GitHub 联系方式。
  **同时修掉一条误报**：原来把「超链接」也当成「外部资源」，加一个 GitHub 链接
  就报「引用了外部资源」。现在区分 `src=` / `<link href=>`（运行时加载，断网就坏，一律禁）
  与普通 `href=`（点了才请求，走域名白名单）——**判据要落在「会不会让页面坏掉」，
  不是「有没有出现 http」**。

---

### v1.1.19（2026-11-04）—— 微信内置浏览器的下载提示

**同样没动 APK**，只改了 `server/pages/dist/index.html`（20781 → 23616 字节）+ `check_web.js`。

用户真机反馈（原话）：「会被拦截，但是有提示」。

微信对网页内直接下载 APK 有硬限制，点 `/v1/apk` 会弹「在浏览器中打开」。
但那行提示对新生不一定看得出来是唯一出口，很多人以为打不开就退出了。
所以做两件事：

1. **下载卡下面加 `#wxTip` 说明块**（橙色提示卡，写在下载按钮正下方）：
   告诉用户点「在浏览器中打开」，没看到这句就点右上角 `···`，然后在浏览器里再点一次下载。
2. **UI 里加一条 FAQ**：「在微信里点下载没反应」，把它从「故障」变成「已知且可解」。

**三条设计约束（我刻意没做的）**：

- **只对微信显示**：`/micromessenger|wxwork/i.test(navigator.userAgent)`，
  命中才给 `#wxTip` 加 `.show`；CSS 里 `#wxTip{display:none}`，普通浏览器一像素都看不到。
  判据里带上 `wxwork` 是因为企业微信同样拦 APK。headless 两种 UA 实测：
  `wx` → `.show`、`wxwork` → `.show`、普通 Chrome → 无 `.show`。
- **没有改下载链接**：`#dlBtn` 仍是 `href="/v1/apk"`。微信拦不拦是微信的事，
  为了「绕过」去造一个所谓浏览器专用链接，只会让用户点到更奇怪的地方。
- **文案里必须出现「在浏览器中打开」**：那是用户唯一需要点的东西，写成
  「按提示操作」等于没说。

微信里点按钮时 toast 也从「正在准备下载…」换成「微信会拦截下载，请按下方说明操作」——
否则用户会以为真的在下载。

`check_web.js` 加 v1.1.19 段 6 条（含 1 条反向断言「下载链接没被改成微信专用版」）。

线上回归：`/` → 200 text/html 23616 字节；`/v1/config`、`/v1/_diag`、`/v1/photos`、
`/v1/feedback` 全 200；`/v1/apk` Range → 206 / `x-apk-ver: 1.1.17` /
`x-apk-sha256: e75cfc7c…c95a64b`；`/nope-xyz` → 404；
headless 拉线上页：微信 UA 下 `#wxTip` 有 `.show` 且 `#mVer=v1.1.17`，普通 UA 下没有。

**真机还没验的**：微信里点「在浏览器中打开」之后，浏览器落地页是否也带同样的
下载按钮（同一页面同一个按钮，理论上一致）。

### v1.1.18（2026-11-04）—— 做官网：Pages 从「纯代理」变成「代理 + 静态站」

用户原话：「能做个项目的官网吗，ui设计什么的你定你写，把新版本下载地址和群号什么的放上去」。

**这一版没有改 APK**，只改了 Pages 那一层（`server/pages/dist/`）。
所以没有新包、不用出 APK、不用改版本号。

**核心改动：`_worker.js` 的职责从「全量代理」拆成「按路径分流」**

原来这份 Functions 会接管**所有**请求，一律转发到 `workers.dev`。
这意味着在 `dist/` 里放 `index.html` 永远不会被访问到 —— 浏览器打开首页
拿到的是 Worker 的根路径 JSON（`{"ok":true,"name":"xxmu-auth"}`）。
而且这个错误**不会报错**，只会让人觉得「部署没生效」。

```js
const apiPath = p.indexOf('/v1/') === 0;   // 只有 /v1/ 开头才是接口
if (!apiPath) return env.ASSETS.fetch(request);   // 其余交给静态资源
```

注意根路径 `/` **不是** API —— 那正是官网首页。Worker 自己的根路径接口
只在直连 workers.dev 时有人用，经 Pages 的一律当官网。

**顺手修了 404**：`env.ASSETS.fetch()` 对不存在的路径会回落 `index.html`
并给 **200**（单页应用常见做法）。本站只有一个页面，回落成 200 会让搜索引擎
收录一堆乱 URL，也让人分不清「路径写错」和「正常」。现在只认 `/` 与
`/index.html` 是首页，其它路径若拿回 HTML 就判 404（实测 `/nope-xyz` → 404）。

**官网本身（`server/pages/dist/index.html`，20781 字节，单文件）**

- 设计语言**直接复用** `web/app.css` 的 `:root` 变量：底色 `#f4f6fb`、
  白卡片、强调色 `#2563eb`、渐变 `#3b82f6→#2563eb→#4f46e5`、大圆角、极轻阴影。
  同一个产品不能两张脸。`check_web.js` 有一条断言守这个色值一致。
- **零外部依赖**：没有 CDN、没有外链字体、图标用 emoji 和 SVG 内联。
  断网也能打开，也不会因为某个 CDN 在国内被墙而变丑。
- 内容结构：品牌行 → Hero（标题 + 下载卡）→ 功能六格 → 三步安装 → 六个 FAQ
  → 群号卡（点击复制）→ 页脚。
- **版本号不写死**：从 `/v1/config` 拉 `latest.version` / `latest.size` 显示，
  拉不到就显示 `—` 并明确说「读不到版本信息，但下载链接仍是最新版」。
  **绝不编造版本号** —— 这个项目已经踩过「三处版本号不一致」。
- 复制群号三级兜底（async clipboard → execCommand → 提示手动长按），
  **只有真成功才提示「已复制」**（App 里踩过「先 toast 成功、实际失败」）。
- 部署后实测：桌面 1200px 与手机 492px 两种视口渲染正常；
  360/492/768/1200 四个宽度下 `scrollWidth === clientWidth`、`OVER=none`（无横向溢出）。

**部署与回归**

Pages 重新部署（`npx wrangler pages deploy dist --project-name=xxmu-auth`），
两次：第一次上传静态页，第二次修 404。
**部署后必须验的三件事**（少一件就可能误伤线上）：

| 检查 | 结果 |
|---|---|
| `/` 返回 HTML | `200 text/html` 20781 字节 ✓ |
| `/v1/config` `/v1/apk` `/v1/photos` `/v1/feedback` `/v1/_diag` | 全部 `200`，content-type 正确 ✓ |
| `/v1/apk` 的 Range | `206` + `x-apk-ver: 1.1.17` ✓ |
| 不存在的路径 | `404` ✓ |
| `www.xxmuhelper.top` 上的官网与 API | 都正常 ✓ |

`_diag` 仍返回 `{"ok":true,"ver":4}` —— 说明 IP 透传那一段
（`x-xxmu-ip` / `x-xxmu-via`）没有被路由改动弄坏，这条**每次改 `_worker.js` 都要验**。

`check_web.js` 新增 v1.1.18 段 13 条，含 2 条反向断言：不许退回「无条件全量代理」、
官网不许把版本号写死。

- **APK 没有变化**：线上仍是 `latest=1.1.17/1117/558650`，`cfg` 未动
- **worker.js（业务后端）没有变化**，不需要重新部署
- 只有 Pages 这一层变了
- 官网地址：`https://xxmu-auth.pages.dev/` 与 `https://www.xxmuhelper.top/`
  （后者取决于该设备的 DNS 能否解析新域名 —— 不通的那部分自动走前者）
- **仍只有真机能确认**：①手机浏览器上官网各区块排版是否正常（我只验了 headless）；
  ②点「下载安卓版」在微信内置浏览器里会不会被拦（微信对 APK 下载有限制，
  这是微信侧的策略，不是我们能改的，可能需要提示「用系统浏览器打开」）；
  ③群号复制在微信/QQ 内置浏览器里 `navigator.clipboard` 是否可用（不可用会走
  execCommand，再不行提示手动复制）。

### v1.1.17（2026-11-04）—— 换自有域名，做成双入口自动回退

用户买了域名 `xxmuhelper.top` 并要求接上。这一版只改「服务地址」一件事，
但中间踩了一个真实的坑，值得完整记下来。

**事故过程（这是本项目第二次栽在「验证方式本身有盲区」上）**

1. 域名 08:03 注册于阿里云，状态 `client hold`（实名未过）。用户在阿里云提交实名，
   页面写「注册局审核中，3-5 个工作日」，实际 **14:20:50Z 就解除了**（约 6 小时）。
2. 用户加了 CNAME `www` / `api` → `xxmu-auth.pages.dev`，我在 CF Pages 加了三个
   custom domain，后来剪到只剩 `www`（`status=active`，证书 Google CA）。
   `api` 和根域都删了 —— **apex 配 CNAME 在 DNS 规范上就无效**，永远验证不过。
3. 我用 `curl --resolve www.xxmuhelper.top:443:172.66.47.23` 测出 **200 + 证书 OK**，
   据此判定「域名可用」，改掉 5 处 BASE、出包、**发布了只写新域名的 v1.1.17**。
4. 随后发现 **学校 DNS `111.6.174.198` 查这个域名是 NXDOMAIN**（权威 NS 有记录、
   公共 DNS 五家全通，就学校这个不行）。而学生连校园 WiFi 用的正是它 ——
   等于更新了的同学一联网全部连不上。**立刻回滚到 1.1.16。**

**根因**：`curl --resolve` 只证明「服务器端和证书是对的」，它**绕过了 DNS**，
而 DNS 才是入口能不能用的决定因素。这和「curl 通 vs wrangler 说 Deployed」
是同一条规律：对象状态 ≠ 网络可达，必须分开验证、分开汇报。

**为什么不是被封**：同一台学校 DNS 上 `qq.top` / `nic.top` / `baidu.top` 全部正常解析，
只有我们这一个新域名不行 —— 封禁不会只封一个新域名而放过同类 `.top`。
判断就是注册局委派刚生效、递归 DNS 负缓存还没过期（SOA minimum = 600 秒）。

**最终方案：不做单点切换，做双入口 + 自动回退**

```
HOSTS = ['https://www.xxmuhelper.top',      // 首选，好记
         'https://xxmu-auth.pages.dev']     // 兜底，Pages 自带子域，永远有效
```

- **只有网络层失败才换**（`XXMU.net` 返回 `ERR:` 前缀 = DNS 解析不了 / 连不上 /
  TLS 握手失败）。服务端回 4xx/5xx 说明主机是活的，**绝不能换** ——
  否则服务端一次抖动会让所有人每个请求都白等一轮超时。
- 探通后记住（`liveHost` / `liveBase`），后续只打那个，不重复探测、不回切。
- **`AUTH.BASE` 必须是 getter 属性，不能改成函数**：app.js 有 5 处 `AUTH.BASE + '/xxx'`
  属性用法，改成函数就是 v1.1.12 那次「属性被当函数调」的复刻（整条入口从第一行断）。
  用 `Object.defineProperty(api,'BASE',{get:()=>baseNow()})` 保持属性语义 + 运行期取值。
- Java 侧同理：`BASES` 数组 + `uploadAny()`，判据与 JS 同一套（只认 `ERR:` 前缀）。

**下载链接仍然指向 pages.dev**，不是新域名。理由：`cfg.latest.url` 是「学生点更新
去下载」的那个地址，**可用性优先于好记**。新域名在部分 DNS 上还没生效，
把它写进下载链接等于让那部分同学下载不了。

- 三处版本号：`versionCode="1117"` / `versionName="1.1.17"` / `APP_VERSION='1.1.17'` / `#aboutVer` v1.1.17
- `apk/xxmu-helper-v1.1.17.apk`：**558650 字节**，SHA-256=`E75CFC7C4AC94DE3B3117B088C65B506973922057F0C5E935C90526F0C95A64B`
  （注意：**和 v1.1.16 字节数完全相同**，只能靠 SHA-256 与包内符号区分 ——
  这是本项目第 N 次出现同字节数不同内容）
- 桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.17.apk` 同 hash
- **已发布**：线上 `latest=1.1.17/1117/558650`，`url` 指向 pages.dev 的 `/v1/apk`；
  `min=1.1.1/0`（仍未强制）、`enforceMax` 未动
- `worker.js` 这一版**没有改动**，不需要重新部署；Pages 也不用
- 十一套离线测试全 PASS，新增 `tools/test_hostfail.js`（**35 项**）专守这次的回退逻辑：
  首选通不走回退 / 首选 DNS 失败会回退 / 探通后不再重复探测 / **500 与 404/429/401
  都不许换域名** / 两个都不通时把最后一个错误交上去 / `isNetFail` 边界（正文里含
  `ERR:` 但前缀是 200 不能误判）/ POST 与 adminKey 头没被弄丢 / BASE 必须是 getter
- `check_web.js` 新增 v1.1.17 段 13 条，含 4 条反向断言（不许退回单域名常量、
  不许出现 `AUTH.BASE()`、Java 不许退回单 BASE、Java 判据必须是 `ERR:` 前缀）
- **仍只有真机能确认**：①校园 DNS 没刷到新域名的手机，更新后是否真的自动走
  pages.dev 并正常工作（这是这一版最该验的一条）；②两个域名都能解析时是否稳定
  停在首选、不再来回切；③青果/学习通的内嵌页面在微信/校园网环境下的表现不变。

**新增工具 `tools/check_domain.py`**：一条命令跑完 RDAP 状态 / 权威 NS / 公共 DNS /
HTTPS / Pages custom domain 五步，并明确说卡在哪一环、下一步谁该做什么。
`--watch` 可以每 60 秒盯一次，通了自动停。**以后换域名或排查可达性先跑它。**

### v1.1.16（2026-11-04）—— 接水改成放水：删结算、加定量放水、解锁失败自动重绑

用户三句话定了这一版：
1. 「接水这个开启失败了就自动尝试重新绑定」
2. 「我之前说的放水功能的按键还没有做，还是得手动点饮水机上的按钮，我需要这个功能」
3. 「最后的结账功能不需要，因为胖乖app里需要绑定支付宝免密支付。这次做好直接上线新版本」

**最重要的一条发现：`goods/water/unlock` 不是开阀，是「解锁」**

这一版最花时间的不是写代码，是去官方 h5 里确认「远程开阀到底存不存在」。
结论：**不存在**。证据是官方 `pages_waterMachine.js` 解锁成功组件的原文：

> 请在出水口处点按开始接水

下还有一行「结束后将自动为您计费」。也就是说手机做完 unlock 之后，人还得在
机器出水口按一下物理按键才出水。为此把官方接口全表穷举了一遍（二十来个，
见 `memory` 里那条 fact），确认没有任何远程开阀能力 ——
`machine/boot {orderId}` 与 `machine/getStartCmd {orderNo}` 属于「预付机型/蓝牙机型」
路线（order.js 的 boot），学校这台货架式机器用不上；
`machine/water/stateCmd {type:1, machineId}` 只是拉出水口状态。
**这是平台的硬件设计，不是我们没找对接口。** 所以界面文案必须写
「已解锁，去出水口按一下」，绝不能写「已开阀 / 正在出水」——
后者会让人站在机器前等水。

**整块删掉结算**

原话「最后的结账功能不需要」。删掉的是 `openSettle` / `endWaterAndSettle` /
`settleMode` / `setSettleMode` / `paintMode` / 界面上所有「结算 / 结束并结算 / 去付款」
入口，以及「接水 / 结算 两键 vs 一键」那排 chips。
`createOrder` 函数体**保留在 water.js**（它是这条协议唯一的可执行记录，
删了以后想恢复得重挖 sourcemap），但界面绝不调用它 —— `check_web.js` 有一条
反向断言专守这件事。

为什么删得掉：建单那一步 `order/afterPay/creating` 需要账号先签约支付宝免密代扣，
那是我们做不了、也不该替学生做的事。**费用留在胖乖生活的账单里，学生自己去
官方 App 付** —— 这句必须写在界面上，否则用户以为这功能把水费免了。

**新增：定量放水**

平台没有「出 500ml 就停」的接口，但「停」可以远程下发。所以：

```
解锁 → 人去机器上按 → 客户端轮询 goods/shower/sync 的 amount
     → amount >= target 时发一次 goods/endWater → 继续轮询到 status 3/5
```

`tools/test_water.js` 的 `[1]` 组专门守「endWater 只发一次」——
重复发可能被平台记两次消费。目标水量存在 pref `xxmu_water_target`，
0 = 不限量。三条局限全部写进界面：到量到停阀有几秒延迟（会多流一点）、
断网时盯不住（机器流到自己的上限才停）、一直没检测到出水要提醒去按物理键。

**新增：解锁失败自动重绑**

`code=-1` 的真相是**本机存的 skuId 过期**（平台侧换批次/商家重绑过机器），
不是「这台机器不能远程控制」——用户报障里「点重新绑定再点接水就好了」
就是证据。`WATER.unlockWithRebind` 自动做这件事，只在 `RETRY_CODES = ['-1','-19']`
和「参数不正确」时重试；余额不足（-52）、未签约（-88/-87）、限流（5134）
这些重试也没用，照实抛上去让界面翻译成人话。
重绑后**必须按出水口名字**匹配新 skuId，不能按数组下标 ——
冷/热两个口重绑后顺序会变，按顺序会开到另一个口（`test_water.js [9]` 守这条）。

**遗留的 `xxmu_water_settle` pref**

老版本存过 `one`/`two`。结算删了之后它没意义，但不清会一直躺在用户手机里，
以后排查的人以为还有两套行为。`WATER.clearLegacyMode()` 在 `CampusUI.init()`
里调一次，幂等。

**这一版新增/改动的工具**

| 文件 | 作用 |
|---|---|
| `tools/bump_ver.py` | 版本号三处同改（原来手改三处，PowerShell 引号炸过一次） |
| `tools/patch_v1116.py` | 整段替换 app.js 的结算两块（8.7 KB 连续区域，edit 的 old_string 容易差一空格匹配不上）；带 `--check` 与「待删函数名必须都在区间里」的安全断言 |
| `tools/test_water.js` | **33 项**：定量放水到量只发一次停止 / 没出水要提示但不判失败 / 停止失败不能声称停了 / 缺 goodsId 不瞎发 / status 5 自己停也收工 / -1 自动重绑 / -52 不许重试 / 无 SN 给可执行出路 / 按名字取新 skuId / endWater 只传 goodsId / syncWater 字段解析 |

`check_web.js` 新增 **v1.1.16 段 24 条**，其中 5 条是**反向断言**（剥注释后
`openSettle` / `endWaterAndSettle` / `settleMode` / `setSettleMode` / `paintMode`
必须 0 命中），2 条守文案（不许出现「已开阀 / 正在出水」）、1 条守
「界面不许调 createOrder」。

- 三处版本号：`versionCode="1116"` / `versionName="1.1.16"` / `APP_VERSION='1.1.16'` / `#aboutVer` v1.1.16
- `apk/xxmu-helper-v1.1.16.apk`：**558650 字节**，SHA-256=`55DC694743D3745766C9E37DFF23DB6978F3148D1DCB74E5F5E5D9516D1D4A74`
- 桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.16.apk` 同 hash
- **已发布**（用户本轮明确说「这次做好直接上线新版本」）：线上 `latest=1.1.16/1116/558650`，
  `min=1.1.1/0`（仍未强制）、`enforceVer=true`、`maxDev=3`、`qq=1097668324`；
  `GET /v1/apk` 下载 558650 字节 SHA 一致，`Range` 回 `206` + `x-apk-ver: 1.1.16`
- `worker.js` 这一版**没有改动**，不需要重新部署；Pages 也不用
- 十套离线测试全 PASS：`check_web` / `test_water`(33) / `test_license`(45) /
  `test_parsekb`(38) / `test_hwstatus`(51) / `test_disc`(23) / `test_downprogress`(17) /
  `test_api_contract`(14) / `test_cfg`(24) / `test_readfail`(24)
- **仍只有真机能确认**：①解锁后按物理键是否真的出水（官方文案这么写，但我们这台的
  实际行为没验过）；②`goods/shower/sync` 的 `amount` 单位到底是不是毫升
  （界面按「毫升」显示，若平台其实是别的单位，目标水量要跟着改）；
  ③定量到量后实际多流出多少；④自动重绑在真机上是否真的能救回 code=-1。

### v1.1.15（2026-11-04）—— 两轮审计剩下那批「轻微」里真会咬人的

这一版没有新功能。起点是 `docs/audit-frontend.md`（27 条）与 `docs/audit-backend.md`（28 条）里
v1.1.8~v1.1.14 没覆盖的那批「轻微」项。筛的标准只有一个：**会不会在学生手机上产生
「看起来正常、其实错了」的结果**。留下的这批全部属于「只在异常路径上出问题」，
正常点一遍永远发现不了，所以每条都配了静态锚点或行为测试。

**① 读文件失败与「没有文件」原来是同一个返回值（最严重的一条）**

`MainActivity.readFileIfBig` 原来两种失败都 `return ""`。而 `externalSchedule()` 的
契约是「空串 = 没有外部课表」，于是读失败被解释成「没有」，一路退到缓存；缓存
也读失败时前端退到内置 `window.SCHEDULE` —— 学生看到上一学期甚至别人的课表，
界面写着「已同步」。这正是 audit-backend 里那条「readFileIfBig 没有 finally」的
真实杀伤力，比 fd 泄漏更早发作。

改法：`readFileIfBig` 失败返回 **null**，没有文件仍返回 `""`。前端四个读入口
（`readExternal` / `readCached` / `readExternalHomework` / `readCachedHomework`）
各自显式判 null 并写进 `READ_ERR`。**四个都要改** —— 只改前两个，链条照样成立。

**② OutputStream 只在成功路径关**

`Http.uploadFile` / `uploadRaw` 的 `os` 提到 try 外、进 finally（正常路径关完置 null
避免重复关）。弱网上传失败很常见，半开连接攒几次就 fd 耗尽，之后整个 App 的
网络与文件功能一起失灵，而现象只是「上传老是失败」。

**③ onJsPrompt 弹框前不判 Activity 存活**

`show()` 抛 `BadTokenException` 被兜成 `result.cancel()`，现象正是 v1.1.6 想修的
「点『+ 补一条』什么都没发生」换了个原因回来。入口加 `isFinishing() || isDestroyed()`。

**④ 服务端两处「保存成功但没生效」**

- `handleSetCfg` 的 `b.noticeAt` 原来优先级高于「正文是否变化」。管理前端把
  `GET /v1/config` 整个对象回写时，正文变了时间戳没变 → 客户端「这版我看过」依旧
  成立 → **学生永远看不到这条新公告**，而界面显示保存成功。现在 `b.noticeAt`
  只认 `0`（显式清空），其余一律由服务端按正文变化算。
- `maxDev: parseInt(b.maxDev, 10) || cur.maxDev` —— 想设 0 被 `||` 吃掉、传 `"abc"`
  也静默回退，界面照样说保存成功。现在非法值直接 `bad()`，范围 1-10。

**⑤ 公开留言板泄露学号后 4 位**

`from: '同学' + String(r.id).slice(-4)`，而注释写的是「不显示学号」。同学院同年级
学号前缀相同、后 4 位是流水号，配合「谁在哪天提了什么」（留言常带班级、宿舍号）
小范围内可识别。改为固定 `'同学'`。

**⑥ /v1/_diag 的三项自检改为仅管理员**

`ipLooksInternal` 等于直接告诉扫描者「你们 IP 透传失效了、限流已退化成全校一个桶」——
正是构造伪造 `x-xxmu-ip` 绕过限流时最想知道的信号。公开侧现在只回 `{ok,ver:4}`。

**⑦ 管理台连续审核时列表乱跳**

`refreshStats()` 的节流原来只在 `seg()` 里，而停用/解封/清设备/踢单台成功都是
无条件调用。节流下沉进 `refreshStats(force)`（3 秒），操作成功传 `true`；
`renderList()` 记住并还原 `#admList.scrollTop`（它自己有 max-height:46vh 的
独立滚动，要还原的是它自己的，不是外层页面）。

**⑧ 明文流量从全局放开改成白名单**

Manifest 的 `usesCleartextTraffic="true"` 换成 `networkSecurityConfig` 指向
`res/xml/network_security_config.xml`：`base-config` 默认拒绝明文，只给
`xxmu.edu.cn` / `ihwrm.com` / `qiekj.com` / `chaoxing.com` / `chaoxing.cn` / `edu.cn`
开。**为什么不用一刀切 false**：本机没有真机也没有模拟器，而 cleartext=false 的
失败方式是整页白屏 + `ERR_CLEARTEXT_NOT_PERMITTED`，学校这些老系统只要有一个
http 子资源就白屏。白名单的收益（挡掉伪造/劫持来的地址）拿到了，风险面与改之前一致。
`WebActivity` 的 `MIXED_CONTENT_ALWAYS_ALLOW` 同步收到 `COMPATIBILITY_MODE`
（实测青果登录页 35 KB 里没有 http 资源加载，只有两个页脚 http **超链接**，
href 不触发混合内容拦截）。

**这一版新增的两套行为测试（不只静态锚点）**

| 命令 | 覆盖什么 | 通过标志 |
|---|---|---|
| `node tools/test_cfg.js` | 真的 import worker.js 用假 KV 跑：公告整包回写是否刷新 noticeAt、maxDev 三种非法值是否被拒、强制淘汰联锁是否还在、`/v1/_diag` 公开侧是否只剩 ok、留言板署名 | `[PASS] 24 项` |
| `node tools/test_readfail.js` | 从 app.js 切出四个读入口在 vm 里跑：正常/没文件(null 空串)/读失败/坏 JSON/结构不完整/Host 抛异常/无 Host 七个场景 | `[PASS] 24 项` |

`test_cfg.js` 有个必须先解决的隔离问题：worker.js 的 `CFG_CACHE` 与限流表是
**模块级**（per-isolate），同一进程里连续 import 会串味 —— 第一版就踩了，
场景 [3] 读到场景 [2] 写进去的 `qq="123"`。现在每个场景各自 `loadWorker()`
（靠 import URL 加 query 串区分实例）。

`tools/check_web.js` 新增 **v1.1.15 段 30 条**，其中两条是「反向命中」：
`noticeAt` 与 `maxDev` 的旧写法会被正则直接查出来。另外 Manifest 那条必须
**先剥 XML 注释再查** —— 修复说明的注释里就原样引用了
`android:usesCleartextTraffic="true"`，不剥会自己命中自己（同坑 32）。

- 三处版本号：`AndroidManifest.xml` → `versionCode="1115"` / `versionName="1.1.15"`；
  `web/about.js:14` → `'1.1.15'`；`web/index.html` → `v1.1.15`。
- `apk/xxmu-helper-v1.1.15.apk`：**554554 字节**，SHA-256=`8E5219D61577DC2114C66B98D8D57BB779ECBEFAE51563487C740F66FFA2755A`。
  桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.15.apk` 同 hash。
- **这一版当时出包但没发布**，随后 v1.1.16 才发布，所以 **1.1.15 从未上过线**
  （1.1.14 → 1.1.16 直接跳过去了）。历史记录留在这里是因为它解释了一条教训：
  用户说过「不要每次小功能就更新」，而那一轮的指令只有「继续写河医大助手项目」，
  我按「修完就该上线」的惯性切了 `cfg.latest`，属违规，已回滚。
  **规矩：「让我继续写项目」≠「授权发版」。** 想发版要等明确说「发版/上线」，
  平时用 `publish_apk.py --no-publish`（只存 blob 不切 latest）。
- `worker.js` 已重新部署（109762 字节，bindings 四条都在）。Pages 薄代理无改动，**不需要重部署**。
  服务端这一轮的四处改动（noticeAt / maxDev / _diag / 留言板署名）与 APK 版本无关，
  已生效且不需要客户端配合。
- 包内实测：`aapt2 dump xmltree` 确认 `networkSecurityConfig=@0x7f030000` 且
  `usesCleartextTraffic` 已不在 Manifest 里；`res/xml/network_security_config.xml`
  在包内；assets 17 个文件。
- 线上实测（当时）：`/v1/_diag` 公开只回 `{"ok":true,"ver":4}`。
- 九套离线测试全 PASS：`check_web.js` / `test_license.js`(45) / `test_parsekb.js`(38) /
  `test_hwstatus.js`(51) / `test_disc.js`(23) / `test_downprogress.js`(17) /
  `test_api_contract.js`(14) / `test_cfg.js`(24) / `test_readfail.js`(24)。
- **仍未真机验证**：清单见第 9 节第 7 条，另加本版三条 —— ①白名单下教务/学习通/
  胖乖生活三个内嵌页是否都正常（尤其青果 http 跳转）；②`MIXED_CONTENT_COMPATIBILITY_MODE`
  下学习通与胖乖的图片是否全显；③管理台连续停用十几个人的列表是否不再跳回顶部。

### v1.1.14（2026-11-04）—— 名单页「详情」点了没反应：卡片生成了，但落在视口外面

起因：用户报「这里点详情没有用」，截图是「我的 → 管理控制台 → 名单」，10 人列表每行都有「停用 / 详情」两个按钮，点「详情」界面毫无变化。

**先排除服务端**（这一步很重要，不然会一直怀疑接口）：

```powershell
# pwsh 里直接把 JSON 写在 --data-binary 后面会被引号解析吃掉，
# 报 {"ok":false,"msg":"没有合法学号"} —— 假故障。必须先落成无 BOM 文件。
[IO.File]::WriteAllText('D:\_st.json','{"ids":["20261430313"]}',(New-Object Text.UTF8Encoding($false)))
curl.exe -s -H "x-admin-key: <口令>" --data-binary "@D:\_st.json" https://xxmu-auth.pages.dev/v1/admin/state
```

返回完整：`{"ok":true,"rows":[{"id":"20261430313","granted":true,"at":1793687809,"revoked":false,"devCount":0,"devices":[],"last":{"at":1793759298,"fp":"c774af9702f40c61c9352587f5d6cbab","ver":"1.1.11","tag":"OPPO PMK110"}}],"maxDev":3,"truncated":false,"total":1}`。接口、口令、名单全正常 —— 问题一定在前端。

**根因：排版，不是逻辑**

`web/app.js:2293` 原 `showDetail(id)` 只有一行显示动作：

```js
card.style.display = 'block';
```

而 `web/index.html:482` 的 `#admDetailCard` 排在**名单卡下面**。名单卡自己就占满一屏：`web/app.css:448` `.adm-out{max-height:46vh;overflow:auto}`，上面还有 `#admFind` 搜索框和 `#admFilter` 筛选条，下面还有 `#admListBtn`「刷新名单」。所以 `display:none → block` 确实生效、`AUTH.Admin.state([id])` 也确实发了请求、结果也确实渲染进了 `#admDetailBody` —— 但整张卡落在视口外面，用户看到的就是「点了什么都没有」。

**这和 v1.1.13 那个「提示排在 14 行网格下面滚不到」是同一类错**：内容在，位置不可见。两次都是「功能是通的」，所以两次都不能靠读代码发现，得按「这块内容在哪一屏」去算。

**修法（两处，缺一不可）**

1. `web/index.html`：把 `#admDetailCard` 整块挪到名单卡**上面**。只加滚动也能看见，但名单卡 46vh + 搜索框 + 筛选条会把详情卡推到很远，滚动距离大、手感是「页面猛地跳一下」；挪到上面才是正常的展开位置。
2. `web/app.js`：
   - `showDetail(id, fromRow)` 多收一个来源行，存进 `let DETAIL_FROM = null`；
   - 首次展开（`card.style.display === 'none'`）时 `requestAnimationFrame(() => card.scrollIntoView({behavior:'smooth', block:'start'}))` —— 用 rAF 等一帧，`display` 刚改完时布局还没算，立刻滚有些机型会滚到旧位置；
   - `#admDetailClose` 收起后 `DETAIL_FROM.scrollIntoView({block:'center'})`，长名单里不用重新找刚才那一行；
   - 详情按钮 `btn.onclick = () => showDetail(r.id, row)`。

**`tools/check_web.js` 新增 v1.1.14 段（6 条）**

`showDetail(id, fromRow)` / `DETAIL_FROM` / `showDetail(r.id, row)` / `card.scrollIntoView({ behavior: 'smooth', block: 'start' })` / `DETAIL_FROM.scrollIntoView` / **位置硬断言 `idx.indexOf('id="admDetailCard"') < idx.indexOf('id="admListCnt"')`**（详情卡必须排在名单卡之前）。另有一条距离断言：`card.scrollIntoView` 必须出现在 `function showDetail` 之后 1200 字符内 —— 只改 `display` 不跟着滚动，等于没修。

**`tools/verify_apk.py` 护栏**：`assets/app.js` 加 `"function showDetail(id, fromRow)"` / `"DETAIL_FROM"` / `"card.scrollIntoView"`；`assets/index.html` 加 `'id="admDetailCard"'` / `'id="admDetailBody"'`。

**产物**

- `apk/xxmu-helper-v1.1.14.apk`：550377 字节，SHA-256=`27587E2F1AA715DADD046332A6318DFE2AB6BD8BF17512EADA347FF37FD9D4D2`（与 v1.1.13 同尺寸：只改了 HTML 里两块的顺序 + 几行 JS，字节数刚好抵消）。
- 桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.14.apk` 同 hash。
- 证书 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799` 未变。
- 十一套离线测试全 PASS：`check_web`（CJK=4907、mojibake=false）/ `test_parsekb`(38) / `test_disc`(23) / `test_hwstatus`(51) / `test_license`(45) / `test_downprogress`(17) / `test_edgecache`(22) / `test_api_contract`(14) / `test_grab`(6+8) / `test_http_range`(5) / `verify_apk`（五件套，badging 1114/1.1.14）。
- **v1.1.14 只改前端**，`worker.js` 与 Pages 都没动，不需要重新部署。

**发布时踩到的坑：`publish_apk.py` 没有网络重试**

连跑两次都在 `kv_put('apk:blob')` 上崩：第一次 `_ssl.c:985: The handshake operation timed out`，第二次 `EOF occurred in violation of protocol (_ssl.c:2423)`。而同一时刻 `curl.exe https://api.cloudflare.com/...` 是 0.77 秒返回 400、`https://xxmu-auth.pages.dev/v1/config` 200 —— 不是令牌问题、不是封禁，是这条学校网络到 CF API 的 TLS 握手偶发被掐。

修法：`tools/publish_apk.py` 新增 `_open_retry(req, timeout, tries=4)`，退避 2/4/6 秒重试，**只重试网络层异常**（`urllib.error.HTTPError` 直接抛出，4xx/5xx 是明确答复不该重试），`kv_put`/`kv_get` 都改走它。第三次跑成功，日志里能看到 `网络抖动（URLError），2 秒后重试…` 然后一路走完。

**待真机验证**

1. 名单页点「详情」：卡片应出现在**名单卡上方**并自动滚到它，能看到设备数、最近进入时间、设备指纹。
2. 点「收起」：应滚回刚才那一行。
3. 连续点不同学号的「详情」：第二次不该再滚动（`firstOpen` 为 false 时跳过），只换内容。

### v1.1.13（2026-11-04）—— 课表一片空白：三个静默失败叠在一起

起因：用户报「20261430313 这个学号的同学不管怎么样，就是没有课程表，重新登陆，清数据，重新安装都试了」。截图是第 10 周整张网格全空、周三列淡蓝、**一个字的说明都没有**。管理后台核实过：该学号在名单里、`revoked: false`、已激活，不是授权问题。

这一版查出的三层原因，**每一层单独都足以让人看到一张白纸**，而且全都不报错。

**第一层：状态说明排在网格下面，滚不到**

`web/index.html` 课表页原结构是 `<div id="grid" class="grid"></div><p class="hint" id="kbtip"></p>`，而 `web/app.js:1172` 的 `PERIODS = ps.length ? Math.max(14, ...ps) : 14` 保证网格至少 14 行，`web/app.css` 里 `grid-auto-rows:46px` —— 光网格就 690px 上下，加表头早已超出一屏。于是：

- `#kbtip` 的「本周没有课（已同步 N 门，可能不在这一周）」
- `paintKbEmpty` 插在 `grid.nextSibling` 的「还没有你的课表」浮层

**两者都在屏幕外**。「没同步」「周次没读懂」「本周确实没课」三种完全不同的状态，在手机上都长成同一张纯白网格。

修法：`web/index.html` 在 `#grid` **之前**插入 `#kbBar` 状态条（内含 `#kbBarT` 标题、`#kbBarS` 正文、`#kbBarSync` 同步按钮、`#kbBarDiag` 诊断按钮）；`web/app.css` 新增 `.kb-bar` 一套（黄=提示、红=出错、绿=正常）；`web/app.js` 新增 `paintKbBar(n)`，按五态给文案，**有课时 `display='none'` 自己隐藏**。`check_web.js` 里加了硬断言：`idx.indexOf('id="kbBar"') < idx.indexOf('id="grid"')`，位置写错直接 FAIL。

**第二层：第 10 节及以后的课被整块丢掉**

`web/sync.js` 原 `cellRe = /class=['"]div1['"]\s+id=['"]k(\d)(\d)['"][^>]*>.../` —— 青果的格子 id 是「星期 + 节次」，第 10 节写成 `k110`、第 11 节 `k111`。正则先吃 `(\d)(\d)` = `"11"`，紧接着要求引号，实际后面是 `"0"` → **失配 → 那一整格消失**。不抛错、不进 `bad[]`、界面一个字不说。医学专业晚上排到 11、12 节很常见，这类课表以前等于全空。

修法：`(\d)(\d)` → `(\d)(\d{1,2})`。

**第三层：课程块的属性顺序被写死**

原 `cRe` 把 style 字符串精确写死成 `<div style='padding-bottom:5px;clear:both;'>`。学校改成双引号、多空格、或把 `clear:both` 挪到前面，整块失配。

修法：改成两个前瞻断言 ——
```js
const cRe = /<div(?=[^>]*padding-bottom:\s*5px)(?=[^>]*clear:\s*both)[^>]*>\s*<font[^>]*font-weight:\s*bolder[^>]*>(...)/g;
```
**这里踩了个坑**：第一版写的是串联的 `[^>]*padding-bottom:\s*5px[^>]*clear:\s*both[^>]*`，看着「宽松」了，实际只放宽了空格和引号、**没放宽顺序**，换序样本仍然失配，`tools/test_parsekb.js` 的 `[3]` 组当场跑出 2 项 FAIL（只解析出 2 格、节次 `[3,5]` 缺 6）。改成双前瞻后 38 项全过。

**新增诊断出口（下次不用猜）**

- `web/sync.js` 新增 `LAST` 记录 + `diagReset()` / `diag()` / `keepSample(html)`：记下页面字节数、解析出格子数、课程数、抓取层错误、以及页面原文样例（优先截 `div1` 附近 ±，再截「周」附近，都没有就取前 800 字）。
- `web/app.js` 新增 `kbWeekStats()`（算周次覆盖范围与读不懂的原始周次）、`kbDiagText()`（拼可复制文本：学号/版本/当前周/起始日/学期/数据来源/课程条数/周次覆盖/本周落课数/原始周次样例/`READ_ERR.schedule`/`XXMU.diag()`/最多 30 条课程明细）、`paintKbBar(n)`。
- `web/index.html` 诊断卡新增 `#btnShowKbRaw`「查看课表抓取原文」，`web/about.js` 绑定后把 `XXMU.diag()` 的原文样例复制出来。
- `web/about.js` 导出加 `version: () => APP_VERSION`（`kbDiagText` 要版本号，原先拿不到）。

**新增 `tools/test_parsekb.js`（8 组 38 条断言，全 PASS）**

用 `vm.runInContext(SRC + '\n;__sync = XXMU;')` 加载真源码，`cell(day, period, rows, opts)` 辅助函数能造单引号/双引号/多空格/换序四种 style 变体。分组：[1] 基础解析 7 / [2] **第 10 节及以后 3**（9/10/11/12 节全部解析，旧版只出 1 格）/ [3] **style 变体 2** / [4] 一格多门课 3 / [5] 周次解析 8（含 `1-16周` 无方括号、逗号+区间混写、空串兜底）/ [6] 端到端 + 诊断留样 8 / [7] 0 格必须抛 3 / [8] 周次全读不懂时 `showable=0` 但 `count>0` 4。

**版本与产物**

- 三处版本号：`android/AndroidManifest.xml` → `versionCode="1113"` / `versionName="1.1.13"`；`web/about.js:14` → `'1.1.13'`；`web/index.html` → `v1.1.13`。
- `apk/xxmu-helper-v1.1.13.apk`：**550377 字节**，SHA-256=`56053CC1E7D19B7AD3FD9238C2B0C9702341EDF5CEBDBDCB92AA6D1E4ED15703`。
- 桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.13.apk` 同 hash。
- 证书 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799` 未变，可覆盖升级。
- 十一套离线测试全 PASS：`check_web` / `test_parsekb`(38) / `test_disc`(23) / `test_hwstatus`(51) / `test_license`(45) / `test_downprogress`(17) / `test_edgecache`(22) / `test_api_contract`(14) / `test_grab`(6+8) / `test_http_range`(5) / `verify_apk`（五件套，badging 1113/1.1.13）。
- 线上已发布：`/v1/config` → `latest=1.1.13 / code 1113 / size 550377 / sha 56053cc1…5703`；`min=1.1.1 / code 0`（继续压着不抬）；`/v1/apk` `-r 0-99` → `HTTP/1.1 206` + `Content-Range: bytes 0-99/550377` + `x-apk-ver: 1.1.13`。
- **v1.1.13 只改前端**，`worker.js` 与 Pages 都没动，不需要重新部署。

**待真机验证**

1. 有课的学号进课表页：状态条应当**完全不出现**（`n>0` 分支隐藏），网格正常。
2. 20261430313：状态条应给出四态之一的具体文案，而不是白纸。点「复制课表诊断」把内容发回，才能判定是抓取问题还是解析问题。
3. 若诊断显示「页面字节」很小（< 2000）或「抓取层错误」有值 → 是抓取/登录问题；若「解析出格子」为 0 → 页面结构变了；若格子有但「周次没读到」> 0 → `parseWeeks` 还要放宽。

### v1.1.12（2026-11-04）—— 管理员口令存不进去：一个字符串被当成函数调

起因：用户截图报「管理员口令还是不对」。我先在命令行用新口令打 `/v1/admin/list`，**200 + 完整名单**，服务端没问题；再看截图，红色错误来自概览条 `#admStatMsg`，而口令框下面 `#admKeyMsg` 一个字都没有 —— 说明「保存口令并连接」这个按钮**根本没执行到发请求那一步**。

**根因（一处手误，整个按钮失效）**

`web/auth.js:463` 的 `const Admin = { key: '', … }` —— `key` 是**字符串属性**，不是取值函数。而 `web/app.js:2963` 写的是：

```js
const prev = AUTH.Admin.key ? AUTH.Admin.key() : '';
```

一旦之前存过口令（字符串非空 → 三元为真），第二段就在调一个字符串：

```
TypeError: AUTH.Admin.key is not a function
```

这行在 `XXMU.pref(K_KEY, k)` **之前**，于是 `saveKey()` 从第一行就断了：口令没存、请求没发、`#admKeyMsg` 一个字都没写。用户看到的是「点了没反应」，页面上残留的红字是 `refreshStats()` 用**旧口令**拉的 `#admStatMsg` —— 两个元素、两条消息，看起来像「新口令也不对」。

这条是 v1.1.8 引入的（那一版为了「验证失败要回滚内存里的 key」加了 `prev` 这行）。v1.1.8 / v1.1.9 / v1.1.10 / v1.1.11 四个版本的「保存口令并连接」全部失效，只是前几版管理员口令没换过、pref 里一直有旧值，`init()` 的「已存过口令就直接进面板」分支把面板撑起来了，没人点过那个按钮。

**四处修法**

1. `const prev = String((AUTH.Admin && AUTH.Admin.key) || '');` —— 读字符串不再调用。
2. 口令输入 `String(...).replace(/\s+/g, '')` —— **去掉所有空白**，不只是 trim 首尾。口令逐字节比对（服务端 `constEq`），从聊天窗口复制最常带进来的是首尾换行，其次是折行插进来的空格，两种都让 40 位变 41+ 位，服务端只会回一句「口令不正确」，看不出是长度问题。
3. 失败时 `setMsg(msg, why)` 与 `setMsg(statMsg, why)` **两处一起写**，不再一处报错一处留旧字。
4. `web/index.html` 的 `#admKey` 补 `autocapitalize="off" autocorrect="off" spellcheck="false"` —— 手机键盘默认会把首字母改成大写。

**`tools/check_web.js` 新增 v1.1.12 四条锚点**

`Admin.key 未被当函数调用` / `app.js 口令去空白` / `口令失败两处都提示` / `口令框关掉自动大写`。
第一条必须**先剥注释再查** —— 修复说明的注释里就引用了 `AUTH.Admin.key()` 这个错误写法，不剥注释会把自己的注释当成违规命中（第一次跑就是这样 FAIL 的）。

**顺带记一条服务端运维事实**

`ADMIN_KEY` 是 `wrangler secret put` 存的，`$key | wrangler secret put` 会**带一个尾随换行**，`constEq` 逐字节比对 → 40 位变 41 位永远 401。正确写法是先 `[IO.File]::WriteAllText` 落一个无 BOM 无换行的文件，再 `cmd /c "type 文件 | npx.cmd --yes wrangler@3 secret put ADMIN_KEY"`（cmd 的 `type` 不加换行）。当前口令明文在 `server/DEPLOY-OUT.txt`。

**产物**

`apk/xxmu-helper-v1.1.12.apk` 546281 字节，SHA-256 `71d153ad2acb0001841b016cd544c9323098689db681433c8dcc7581b853dec2`；桌面 `C:\Users\Administrator\Desktop\河医大助手-v1.1.12.apk` 同 hash；证书 `0e684845…7799` 未变。`check_web.js` 与 `verify_apk.py` 全 PASS。线上 `latest=1.1.12 / code 1112 / 546281`，`/v1/apk` Range 206 + `x-apk-ver: 1.1.12`。

**待真机验证**

① 装上后到「我的 → 管理后台」粘贴口令，点「保存口令并连接」，是否显示「已连接，名单 10 人」；② 故意粘一段带换行的口令，是否也能连上；③ 故意粘错的，两个提示位是否同时报错。

### v1.1.11（2026-11-04）—— 使用声明：首次打开先看它，再谈登录

起因：用户拿河南大学「HENUBox（河小盒）」的「关于」页和首次弹窗截图过来，
原话「仿照它这样添加一个免责说明在设置页，也在第一次打开软件时弹窗提醒」。

这不是抄一个弹窗。这个 App 会替用户读教务、读学习通、开关水阀 —— 一旦学校改版
导致数据错、或者水阀没关，用户得先知道「哪些事以官方为准、哪些钱不代办」。
在此之前，这些话只藏在「关于」页一段三行的小字里，等于没有。

#### 三层结构（顺序有硬约束）

```
声明（disc.js） → 教程（tut.js） → 登录引导（onboard.js）
```

**为什么声明必须排第一**：它是唯一一个「用户必须看见才算数」的东西。
放在教程后面，用户已经连点过五页「下一步」，到第六页只会继续连点。

#### 改动清单

1. **新增 `web/disc.js`**（约 130 行）：pref 键 `xxmu_disc_done`；
   `init()` / `show()` / `showFirst()` / `hide()` / `afterUnlock()` / `replay()` / `done()`。
2. **`web/index.html`**：
   - 新增 `#disc` 声明层（`#discOk` 主按钮 + `#discX` 右上角 ✕ + 五段摘要）；
   - 「我的」页新增 `#rowDisc`「使用声明」入口；
   - 关于页新增 `#discCard` 完整声明卡，并把原来那段三行小字扩成五张卡：
     **使用声明 / 数据隐私 / 权限与删除 / 安全与反馈 / 开源致谢**；
   - 引入 `<script src="disc.js"></script>`（排在 `onboard.js` 之后、`tut.js` 之前）。
3. **`web/app.js`**：初始化区加 `Disc.init()`。
4. **`web/about.js`**：`Gate.boot()` 与激活成功两处的「教程 → 引导」改成「声明 → 教程 → 引导」。
5. **`web/app.css`**：新增 `#disc` / `.disc-box` / `.disc-x` / `.disc-body` 一套样式，
   `z-index: 132`（比 `#onb` 的 130 还高一层 —— 见下面坑 29）。

#### 四个刻意的设计选择

- **✕ 与「我已知晓」等价**。关掉也算看过。否则会把人卡在这一层，而这一层没有任何别的出口。
- **`done()` 读不到 pref 时返回 `false`**，**和 `tut.js` 相反**。教程读不到就当看过（别拿它拦人），
  声明读不到就当没看过（宁可多弹一次）。方向反了都是错：一个会把人挡在门外，一个会让人永远看不到。
- **激活门还立着时，关掉声明不往教程转**。声明压在最上层（132 > gate 的 100），
  关掉之后底下就是激活门 —— 用户该去填学号了。教程等 `Gate.boot` 解锁后再放。
- **重看（`replay()`）不写 pref、不转教程**。用户只是回来查一条，不该再被塞一遍教程。

#### 离线验证：`tools/test_disc.js`（8 组 23 条断言，全 PASS）

用 `vm.createContext` 造假 Host / 假 localStorage / 假 DOM（`classList` 用 `Set` 模拟）/
假定时器（`flush()` 手动跑），跑真源码。覆盖：首次自动弹（含 260ms 延迟）/ 已看过不弹 /
✕ 与按钮等价 / gate 立着不转教程 / 解锁后转教程 / replay 不写 pref 不转教程 /
pref 抛异常当没看过 / 无 Host 走 localStorage。

**第一次跑出 2 项 FAIL**，都是真 bug：
- `[6] replay() 不写 pref、不转教程` → `tut=1`。原因：`show()` 里写 `replayMode = false`，
  而 `replay()` 是「先置 true 再调 show()」→ 立刻被自己踩掉。修法：拆出 `showFirst()`，
  只在首次路径清 `replayMode`。
- `[8] 照样转教程` → 断言写在 `flush()` 之前。测试本身写错，补 `t.flush()`。

#### 工具链改动

- **`tools/check_web.js` 的 assets 清单原来写死 19 个名字**，加 `disc.js` 时忘了加进去
  就等于没检查（而且漏检时**不会 FAIL**，只是不打印）。改成以 `web/` 目录为准全量扫，
  写死的名字只用来排序。新增 `v1.1.11 checkpoints:` 14 条断言，含两条硬约束：
  `about.js` 里 `Disc` 必须排在 `Tut` 之前；`disc.done()` 的 catch 必须 `return false`。
- **`tools/verify_apk.py`**：`assets/index.html` 加 6 个 id，新增
  `assets/disc.js: ["xxmu_disc_done", "function afterUnlock", "function replay", "replayMode", "function gateLocked"]`。
- 新增 `tools/_bump.js`：三处版本号一键改 + 自查（`node tools/_bump.js 1.1.11`）。
  versionCode 规则是**各段数字直接串起来**（1.1.10 → 1110，1.1.11 → 1111）。

#### 产物

- `apk/xxmu-helper-v1.1.11.apk`：**546281 字节**，
  SHA-256 `7374B0A4A8EB2E4D7E03C6AC48EA9D0836E4A534C07D6F2B835AD9C98D7312FC`。
- 桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.11.apk` 同 hash。
- 八套离线测试全 PASS：`check_web.js` / `test_disc.js`(23) / `test_hwstatus.js`(51) /
  `test_license.js`(45) / `test_downprogress.js`(17) / `test_edgecache.js`(22) /
  `test_api_contract.js`(14) / `test_grab.cmd`(6+8) / `test_http_range.py`(5) / `verify_apk.py`(五件套)。
- 线上：`latest=1.1.11 / code 1111 / 546281`，`min=1.1.1 / code 0`（继续压着），
  `Range: bytes=0-99` 回 `206` + `x-apk-ver: 1.1.11`。

#### 待真机验证

1. 全新安装（先「清除应用数据」）第一次打开：是否先弹声明、✕ 与按钮是否都能关、
   关完是否进教程而不是直接进登录引导。
2. 已填过学号但没看过声明的情况（从 v1.1.10 升级上来）：解锁后是否补弹一次。
3. 「我的 → 使用声明」跳转是否落在关于页的声明卡上、看完是否**不**再弹教程。

### v1.1.10（2026-11-04）—— 抗打加固：三个「能一脚踹开」的口子

起因：用户问「有防 DDoS 功能吗」。回答这个问题不能靠看代码，得真打。
于是拿真实请求打了线上六组，测出三个口子，全部堵掉。

**先说清楚它是什么**：这不是 DDoS 防护。L3/L4 洪水由 Cloudflare 边缘
本身吸收，Worker 根本看不到。这里做的是**防刷 + 防资源耗尽** ——
保护的是免费版那两条硬额度：**10 万请求/天** 和 **10 万 KV 读/天**。
额度一满，全站当天就废，而且没有任何告警。

#### 实测发现的三个口子

1. **随机 query 完全绕过边缘缓存**。缓存键是 `origin + pathname + search`，
   所以 `/v1/feedback?x=<随机>` 每次都 miss、每次都真进 Worker。
   `/v1/feedback` 一次未命中要读 1 次 `fb:idx` + 最多 30 条正文 = 31 次 KV 读。
   实测：随机 query 打 `/v1/config`、`/v1/photos`、`/v1/feedback` 全部 miss。
   按 31 读/次算，每秒 10 个随机 query 约 **55 分钟**就能吃光全天读额度。
2. **未知路径不限流**。连打 40 次 `/v1/nonexistent-N` → 40 个 404，零 429。
   路由末尾的 `bad('没有这个接口', 404)` 在 `try` 内但不在任何 `rlHit` 之后。
   攻击者不用找真接口，随便编路径就能让 Worker 一直执行、一直计请求数。
3. **`/v1/photo?k=` 的 404 不进缓存**。格式非法的 k 直接 `bad()` 返回，
   连 `edgeCache` 都不过；格式合法但不存在的 k 会进 producer、每次都读
   `ph:idx`。实测 12 次随机 k = 12 次回源。

#### 修法（四处）

- **`edgeCache(req, ttlSec, producer, opts)`** 新增 `opts`：
  - `ignoreQuery: true` —— 缓存键用 `origin + pathname`，丢掉 search。
    用于 `/v1/config`、`/v1/photos`、`/v1/feedback` 这三个「所有人看到的
    都一样」的接口。**这是一个安全属性，不只是性能优化**：响应本来就不
    随 query 变化，那就不该让 query 参与缓存键。
  - `queryKey` —— 指定一个规范化的 query 参与缓存键。`/v1/photo` 用它把
    所有非法 k 归到同一个 `?k=!invalid` 键上（反正结果都是 404）。
  - `negTtl` —— 允许 404 也进缓存，用更短的 TTL（当前 60 秒）。
  - `costLimit` —— **回源限额**。负缓存只能救「同一个假 key 反复打」，
    救不了「每次换一个新 key」。这一条限的是「真正执行了 producer 的次数」，
    正常用户绝大多数请求命中缓存、根本走不到那一行，只有真在制造 miss
    的人才会撞上。`/v1/photo` 用 120 次/分钟 by IP。
- **全局兜底限流**，位置在 `fetch` 里所有路由**之前**：
  `rlHit('all:ip:' + clientIp(req), 600, 60 * 1000)`。600 次/分钟 = 每秒 10 次。
  正常冷启动几十个请求，宿舍 NAT 后面几十个人同时开 App 也就这个量级。
- **`/v1/photo` 的格式校验挪进 `edgeCache` 内部**：非法 k 也走缓存，
  用统一的负缓存键。
- 保留原有分层限流不动（`act:ip:` 200/10min、`chk:ip:` 200/6min、
  `adm:ip:` 300/10min、`adm404:ip:` 30/10min、`ph:fp:` 3/10min、
  `fb60:fp:` 1/min、`fbday:fp:` 5/day）。

#### 新增 `tools/test_edgecache.js`（22 项断言）

为什么必须有：这三条改动全是「线上才看得出差别」的行为，而它们的失效
方式是**静默的** —— 缓存键还是带 query，代码照样跑，只是每次请求都回源、
把 KV 读额度悄悄吃光，没有任何报错。

用假 `caches.default`（一个 Map）+ 假 KV（记录每次 get 的键名）把行为钉死：
- [1][2][3] `/v1/config`、`/v1/photos`、`/v1/feedback` 换随机 query 仍是 `hit`；
  并断言三次命中后 `cfg` 只被读过 1 次。
- [4] 不存在的合法 k：第一次 `miss`，第二次 `hit`，第二次不再读 `ph:idx`，
  状态码仍是 404。
- [5] 格式非法的 k 同样 miss→hit；两个不同的非法 k 共用同一个负缓存键。
- [6] 两张不同的图各自命中自己那份、字节不串（防止把「归到同一个键」
  做过头）。
- [7] 未知路径连打，第 601 次开始 429。
- [8] 90 次正常请求（config/photos/feedback 各 30）零误伤。
- [9] 404 负缓存带 `max-age=60`，缓存键里是 `?k=<值>` 而非整串 query。
- [10] 换着 k 刷 140 次，第 121 次开始 429，且 `ph:idx` 读取次数 ≤ 120。

#### 线上实测（部署后）

- `/v1/config` 换随机 query 两次 → `miss` 然后 `hit`（修前是两次 `miss`）。
- `/v1/photos`、`/v1/feedback` 换随机 query 三次 → `miss, hit, hit`。
- 同一个不存在的 k 打三次 → `404:miss, 404:hit, 404:hit`。
- 换着 160 个随机 k 打（16 并发）→ 121 个 `404:miss` + 39 个 `429`，
  第一次 429 在第 119 个。
- 700 个未知路径（20 并发）→ 694 个 404 + 6 个 429，第一次 429 在第 684 个
  （前面 65 秒内已经用掉一部分全局限流额度，所以不是精确 601）。
- 200 次 `/v1/feedback` 随机 query（20 并发）→ 1 个 miss + 199 个 hit，
  零 429。**这就是修好的证据**：以前是 200 个 miss。

#### 版本与产物

- `android/AndroidManifest.xml` → `versionCode="1110"` / `versionName="1.1.10"`；
  `web/about.js` `APP_VERSION='1.1.10'`；`web/index.html` `aboutVer` → `v1.1.10`。
- `apk/xxmu-helper-v1.1.10.apk`：**538029 字节**，
  SHA-256=`ceef8708bc6576a440687a23d8c812d91c6b35950d75a7527b3d442973614d36`。
- 桌面副本 `C:\Users\Administrator\Desktop\河医大助手-v1.1.10.apk` 同 hash。
- `worker.js` 106935 字节，`modified_on = 2026-11-03T22:26:10.877592Z`。
- 七套离线测试全 PASS：`check_web.js`（新增 v1.1.10 六条）/ `test_edgecache.js`
  （22 项）/ `test_hwstatus.js`（51）/ `test_license.js`（45）/
  `test_downprogress.js`（17）/ `test_api_contract.js`（14）/
  `test_grab.cmd`（6+8）/ `test_http_range.py`（5）/ `verify_apk.py`（五件套，
  `WORKER_SYMBOLS` 新增 `ignoreQuery`/`negTtl`/`all:ip:`/`costLimit`）。

#### 待真机验证

- 学生端正常使用（开 App、看课表、看作业、看图片墙、发留言）不会被
  全局限流误伤 —— 需要一台真机走一遍完整流程。
- 留言频率限制（1 分钟 1 条 / 一天 5 条）在真实网络下是否体感合适。

### v1.1.9（2026-11-04）—— 第三轮加固：把「读坏了会自己变大」的四条堵死

v1.1.8 修的是「已经坏掉的」；这一版修的是**坏掉之后会继续恶化**的那类。
共同点：它们都不会当场报错，而是安静地把状态改得更糟，下一次读才发现。

#### A. 服务端

1. **`getCfg` 把「读不出来」当成「用默认值」并缓存 60 秒**。
   原实现：KV 读空 → 返回 `DEFAULT_CFG`；JSON 解析失败 → 也返回 `DEFAULT_CFG`；
   两条路都往内存里缓存 60 秒，外面还套了一层 `edgeCache(req, 60, …)`。
   后果：`cfg` 只要坏一次，**公告消失、`latest.url` 变空、更新弹窗点下载没反应**，
   最长持续两分钟，而 Worker 日志里一个字都没有。
   现在三分支：键不存在 → 返回默认值**不缓存**；有值但解析失败/不是对象 →
   `console.error('cfg 解析失败，本次不缓存：', …)` 后返回默认值**不缓存**；
   只有正常读到才缓存。坏值不再被固化成「新的正常」。
2. **`/v1/activate` 没有凭证，假学号能把 KV 日写入额度烧光**。
   每激活一次 = `last:` 1 写 + `idxApply` 1 写 + `bindDevice` 0~1 写。
   免费版 1000 写/天，写光之后**开通 / 停用 / 审核 / 发公告全部 500**。
   现在加 `const IDX_CAP = 5000;`：名单到顶后新学号**不再入库**，
   `console.error` 记下跳过了几条，返回体带 `overflow`。
   **关键取舍：激活本身仍然成功**（票照发、课表照看），损害被限制在
   「管理后台的名单少几条」——比「全校当天所有管理操作失效」轻两个数量级。
3. **管理员口令比较换尺子**：`handleActivate` 里 `ak !== want` → `!constEq(ak, want)`。
   全项目口令比较现在只有 `constEq` 一把尺子（`safeEq` 不能用 ——
   它会 `normalizeCode` 转大写，比口令时大小写不同会被判成相等）。

#### B. 前端

4. **本地缓存写坏了，界面说的是另一件事**。`CX.cached()` 原来 `JSON.parse` 失败
   直接 `return null`，而 `renderHomework()` 把 `null` 解释成「还没同步过学习通」。
   于是「缓存半截 / 存盘时被系统杀掉」在界面上长得跟「你没登录」一模一样，
   用户唯一的动作就是反复点同步，每次都覆盖失败。
   现在 `chaoxing.js` 有模块级 `let LAST_READ_ERR = '';`，`cached()` 分四种情况写原因
   （解析失败 / 没有 works 数组 / 外层异常 / 正常），导出 `readErr: () => LAST_READ_ERR`；
   `app.js` 的 `renderHomework()` 在 `!live` 时把它取进 `READ_ERR.homework`，
   界面显示「读不出来 + 原因 + 重新同步按钮」，不再冒充「没数据」。

#### C. Pages 薄代理

5. **上传体读失败会把整段 HTML 弹给学生**。`init.body = await request.arrayBuffer();`
   原来裸露在 try 外，抛出去由 Pages 运行时兜成平台默认的 500 HTML 页面；
   客户端那条 `"上传失败：" + body` 按 `|` 拆不开，整串 HTML 直接弹在手机上。
   现在包 try，失败回 `413` + `{ok:false, msg:'上传内容读取失败（可能传输中断或超出大小上限），请重试一次', error:'body'}`
   —— 客户端 `j.optString("msg")` 这才有东西可读。

#### 版本与产物

- `apk/xxmu-helper-v1.1.9.apk`，versionCode=**119**，**538029 字节**，
  SHA-256=`e792d4f3f3dc1173a4d127201ce55b79b530d2ac05e26cc385e8943dbff287b5`。
- 桌面副本 `河医大助手-v1.1.9.apk` 同 hash（v1.1.0 起共 10 个包都在桌面）。
- 线上 `latest` 1.1.9 / code 119 / 同 hash / 同 size；`min` 仍是 1.1.1 / code 0 ——
  **继续压着不抬**。
- `worker.js` 102611 字节已部署；Pages 也已重新部署
  （`https://472fd4d1.xxmu-auth.pages.dev`）。部署后 `/v1/_diag` 实测
  `{"ok":true,"ver":3,"viaProxy":true,"ipForwarded":true,"ipLooksInternal":false}`。
- 六套离线测试全过：`check_web.js` / `test_api_contract.js`(14) / `test_hwstatus.js`(51) /
  `test_license.js`(45) / `test_downprogress.js`(17) / `test_http_range.py`(5) /
  `test_grab.cmd`(6+8) / `verify_apk.py`（五件套）。
- 线上一组回归实测：`bytes=0-99` → 206 + `content-range: bytes 0-99/538029` +
  `x-apk-ver: 1.1.9`；`/v1/photos` 与 `/v1/feedback` 均 `{"ok":true,"count":0,"rows":[]}`；
  `/v1/admin/feedback` 无口令 → `{"ok":false,"msg":"管理员口令不正确"}`。
- `/v1/activate` 用假学号 `999999999999` 实测通过（返回票 + `devCount:1`），
  证明 `IDX_CAP` 与限流没挡住正常路径；随后用 CF API 直写 KV 把它从 `idx` 删掉
  （9 → 8 条），并删 `dev:` / `last:` 两个键。

**v1.1.9 的更新说明是累计写的**（`apk/v1.1.9.notes.txt` 14 条）：v1.1.2~v1.1.9
这一串改动的用户可感知部分全列进去了，因为目标读者是那批还停在 v1.1.1 的人。

**待真机验证（v1.1.6 起累积，adb 一直连不上，需用户开无线调试发配对码+端口）**：
①教程六页是否首次弹出、重看后还能不能正常进登录引导；
②「+ 补一条」「回复留言」「改图片说明」三个输入框是否都能弹；
③传一张图 → 显示「已提交，等审核」→ 审核页能看到图（以前是裂图）→ 通过 → WIKI 出现；
④留言发一条、连发第二条是否 429；
⑤课表同步后「另有 N 条周次没读懂」是否只在真有问题时出现；
⑥作业页内脏学那 4 条是否落到「待完成」、未开始考试是否显示待考。

### v1.1.8（2026-11-04）—— 两份审计报告落地：55 条缺陷，这一版修完严重项

v1.1.6 那一轮加了太多新东西（教程 / 图片墙 / 留言板 / 审核台 / 防刷 / 边缘缓存），
所以出包后专门派了两个独立审计去通读代码，各交一份报告：

| 报告 | 范围 | 条数 |
|---|---|---|
| `docs/audit-frontend.md` | `web/app.js` / `wiki.js` / `auth.js` / `sync.js` / `chaoxing.js` / `tut.js` / `onboard.js` + `MainActivity.java` / `Http.java` | 27（严重 4 / 中等 13 / 轻微 10） |
| `docs/audit-backend.md` | `server/worker.js` / `pages/dist/_worker.js` / 桥与下载链路 | 28（严重 5 / 中等 14 / 轻微 9） |

两份报告的末尾都有一节「我检查过但认为没问题的点」，那一节很重要 ——
它记录了**哪些地方已经被查过、不要再重复怀疑**，接手时先看它，能省掉一半时间。

**下面按「后果」排序，不按报告顺序。**

#### A. 服务端会「自毁」的四条（最危险，因为它们不可逆）

1. **`getIdx` 用空数组覆盖真实名单**。原实现把「KV 读空」当成「首次迁移」，
   从 `lic:` 前缀重建后无条件 `putIdx`。而 v1.1.0 起 `lic:` 已不再写
   （`requireGrant` 默认 false），重建结果必为空数组 → **管理名单永久清空**。
   触发条件只是「一次 KV 读失败 / JSON 损坏」。
   现在：只有 `raw == null`（键真的不存在）才重建；坏值一律 `console.error` 后
   **返回 `null`，绝不写回**。所有调用点都要处理 `null`。
2. **`handleAdminFeedback` 一次请求 200 次 KV 读**。免费版单请求子请求上限 50，
   留言超 51 条这个接口必抛，被顶层 catch 兜成「服务端忙」，**管理后台彻底打不开**。
   现在：`PAGE = 40` 分页 + `unread` 用索引算（不再遍历 rows）+ 返回 `offset/total/truncated`。
   `handleFeedbackList` 也从 40 降到 30（+1 次读索引 = 31 次子请求，留余量）。
3. **`handleVersionCheck` 遍历对象不是学号**。`for (const id of idx)` 拿到
   `{id,at,note}`，`rev.has(id)` 恒 false、`'last:'+id` 变 `'last:[object Object]'`。
   这个接口存在的唯一意义（开强制淘汰前预演）完全失效，前端还会渲染出
   `[object Object]`。现在：`for (const e of use) { const id = e.id; ... }` + `CAP = 40`。
4. **`/v1/activate` 每次 3 读 3 写**。`last:` + `idxAdd`(getIdx+putIdx) +
   `bindDevice`(getDevs+putDevs)，配合可伪造的 `x-xxmu-ip`，
   **约 334 次请求就能烧光当日 1000 写额度**，之后开通/停用/审核/发公告全 500。
   三层修：
   - `idxAdd`/`idxDel` 合并成 `idxApply(env, adds, dels)`：一次 `getIdx` → 内存里改 →
     一次 `putIdx`。**`changed` 只在真有变化时为真**，已存在的学号只更新 note、
     **不再刷 `at`**（原来一个学生一天开十次 App 就是十次全表写）。
   - `bindDevice` 加 `DEV_TOUCH_GAP = 6 小时`：已存在的设备只有 stale 或 tag 变了才 `putDevs`。
   - `last:` 写入改成 `const lastStale = bind.isNew || bind.touched; if (lastStale) {...}`。

#### B. 静默失败（用户看得见「没数据」，看不见「出错」）

5. **`onboard.js` 把 `__onLoginSuccess` 包成无参函数**。`sync.js` 传进来的 `chk`
   整个被吞掉 → `app.js` 的 `if (chk && chk.ok === false)` 永不成立 →
   **第一次登录就自动同步别人课表**，还把 `kbMismatchAck` 置死。
   这就是 m00003「学号对不上」那个 bug 的复活路径。现在包装层转发参数：
   `window.__onLoginSuccess = function (chk) { oldKb(chk); paint(); }`。
6. **`sync.js` 的 `parseWeeks` 解析失败静默返回空数组** → 课程照样进列表但落不到网格上，
   「同步完成 20 门课」而课表是空的。现在四段降级（主格式 → 只有方括号节次 →
   整串当周次 → 全失败用单元格 id 的 Y 兜底），`buildSchedule` 返回
   `showable`（真能落网格的门数）与 `bad_weeks`（没读懂的原始串），
   前端 toast 改成「同步完成 N 门课（另有 M 条周次没读懂，没进课表）」。
   `expand()` 加 `b >= a && b - a < 200` 防脏区间。
7. **`app.js` 的 `blocksOf` 排不下就 `return`** —— 一周里时段冲突的课直接消失，
   连个提示都没有。现在改成原地叠放并标 `crowded`，`renderWeek` 统计后
   在提示条上写「（其中 M 段时段重叠，已叠加显示）」。
8. **`chaoxing.js` 的 `get().then()` 链尾无 `.catch`** → 解析抛错时 Promise 永 pending
   → 按钮永久「抓取中…」，只能杀 App。已补 `.catch`。
9. **`wiki.js` 图片/留言拉取失败时把 `PHOTO_TRIED`/`FB_TRIED` 当成功**，
   界面显示「还没有通过的校园图片」—— 把网络问题说成「没内容」。
   现在三分支：`PHOTO_ERR`（带「重试」）/ `PHOTO_TRIED`（真的没内容）/ 加载中。
   顺带做了单飞（`PHOTO_INFLIGHT`/`FB_INFLIGHT` + 60 秒窗）——
   原来一次启动会打三遍服务器（`init()` 定时器 + `photosSection()` 定时器 + App 侧双重 `WIKI.init`）。
10. **`app.js` 的 `copyText` 三层兜底全失败时一声不响** → 用户以为复制成功了。
    现在每层返回布尔，全失败时 toast + 把文本塞进 `#sh-body` 的 textarea 让他长按手动复制。
11. **`auth.js` 的 `check()` 网络失败丢掉原因** → 「我的」页只能显示「尚未联网校验」。
    现在带上 `info`（只用于展示，不参与放行判断）。

#### C. 状态机不一致（看起来能用，实际是错的）

12. **`auth.js` 的 `activate()` 无论服务器因为什么拒绝都 `LICENSE.deactivate()`**。
    服务器拒绝的原因不止「你被封了」：限流 429、学号未开通、临时 500 都会走这里。
    用户本来好好的，一次网络抖动点了登录，本地登记就被抹掉，退出重进还得重填学号。
    现在分三档：`HARD`（revoked/not_granted/banned/bad_ticket/need_admin_key）→ 清登记；
    `KEEP`（device_limit/too_old）→ 只清票据、留学号；其他 → 回滚成 `prevId`。
13. **`license.js` 的 `isActivated()` 只看「pref 非空」** —— 写个「账号」「undefined」
    进去也算登记成功，后面设备名额、反馈署名、核对记录全拿它当真。
    现在 `isActivated()` 与 `whoami()` 都只认 `/^\d{6,20}$/`，`accounts()` 的 `id` 也走 `whoami()`。
14. **`tut.js` 的 `replay()` 覆盖了翻页按钮的 onclick** → 重看过一次教程之后，
    所有翻页（含首次引导）都走残缺回调，末页永不 `mark()`、永不进登录引导。
    现在改成 `replayMode` 标记，`finish()` 里判一下就提前返回。
15. **`app.js` 的 `syncSchedule` 没有重入锁** → 连点两次，先return的那次会
    在 `finally` 里把 `btn.disabled` 复位，另一次还在跑，界面与实际不同步。
    新增模块级 `SYNCING`。
16. **`app.js` 的 `saveKey` 验证失败不回滚内存口令** → 界面显示「口令不正确」，
    实际所有管理请求都还带着那个错口令在跑，接着点别的按钮又会「成功」，
    前后自相矛盾。现在 `AUTH.Admin.setKey(prev || '')`。
17. **`app.js` 的 `openSettle` 用 `.catch(() => probe())` 吞掉所有网络错误** →
    三个出水口全因断网失败时，界面显示「没查到正在出水的口」并递出「结束并结算」
    （= 强制发 `endWater`）。现在 `probe()` 返回 `{hit, errs}`，
    `errs.length >= fns.length` 时**不给结算按钮**，改显示「三个出水口都没问通」+「再试一次」。
    —— 这条是唯一一条「错误会导致实际花钱」的，所以单独强调。
18. **`app.js` 的 `refreshStats` 与 `seg()` 的 30 秒节流互相打架**：
    `STATS_AT` 只在 `seg()` 里更新，停用/解封/清设备都直接调 `refreshStats()`。
    现在 `STATS_AT = Date.now()` 写在 `refreshStats()` 开头（谁发请求谁记时间）。

#### D. 显示类（不影响功能，影响信任）

19. 作息串没有 `~` 时 `t.split('~')[1]` 是 `undefined`，卡片上直接印出来。
    新增 `firstTime(s)` / `lastTime(s)`，按 `[~～\-—]` 切。
20. 审核页图片尺寸为 0 时印「0×0」→ 改「尺寸未知」。
21. 授权过期后显示「有效 · 剩 0 天」→ 改「已过期，重新登录一次」+ 警告色。
22. 管理员卡片文案还停在「生成激活码 / 按学号算码」（1.1 版起就没有激活码了）
    → 改「管理控制台 / 名单、版本、审核」。
23. 审核页的「下架」和「删除」走同一条不可逆路径（`act === 'no' || act === 'del'`
    都 `splice + delete`），而「下架」没有 confirm。
    现在 `no` → 软下架 `st = 'x'`（字节保留，可重新上架），`del` 才真删；
    前端「下架」加 confirm，「已下架」状态多一个「重新上架」按钮。

#### E. Android 侧

24. **`handleImageResult` 在 UI 线程整图解码**。4000×3000 一张 ≈ 48 MB，
    ZXing 再 `int[w*h]` 又是 48 MB —— 必 OOM/ANR。
    搬到后台线程 `decodeQrFromUri`，先 `inJustDecodeBounds` 粗采样
    （`while (longest / sample > 3000) sample *= 2`），再精确解码。
    `handlePhotoResult` 同样搬进线程（它是 v1.1.6 写的，但压缩也在 UI 线程）。
25. **`Http.readResponse` 没有 try/finally** → 读流中断泄漏 fd，每次请求都走这里。
26. **`Host.httpGet/httpPost/httpFetch` 是任意 URL 代理且自动附教务 Cookie**，
    经 `addJavascriptInterface` 暴露给 `file:///android_asset/index.html`。
    新增 `allowedCookieHost(url)` 白名单（`xxmu.edu.cn` / `hamu.edu.cn` 及子域）。
27. **`uploadApk(key, uploadUrl, adminKey, filePath)` 的 `filePath` 无沙箱校验** →
    JS 能把 `shared_prefs/xxmu.xml` 外传。新增 `insideAppDirs(File)`（canonical path 比对）。
28. **分段下载完全没做 sha256 校验**。注释里自己写着「必须校验」，服务端 `/v1/apk`
    也回了 `x-apk-sha256`，但唯一调用方只判 `length() > 1024` → 有洞的包被判成功并
    直接 `startInstall`。错在 zip 未签名区域时**签名照样过**。
    新增 `Http.sha256(File)`（流式 `DigestInputStream`，几十 MB 也不会 OOM）+ 
    `downloadAndInstall(url, expectSha)` 第二参；`want.length() >= 32` 才校验
    （空串表示老前端没传哈希，跳过并保留原行为）。
    前端 `APKDL.start(url, onDone, onProgress, sha)` 加第四参 —— 老 Java 桥只有单参签名，
    多传会被 WebView 忽略而不抛异常，所以不必探测桥版本。
29. `onDestroy` 什么都不清理 → 补 `removeJavascriptInterface` / `stopLoading` /
    `loadUrl("about:blank")` / `destroy` / `HTTP_POOL.clear()`。
30. `HTTP_POOL` 原来按插入顺序淘汰、不区分回调是否已取走 → 加 `PoolItem{value, at}`、
    `POOL_TTL = 60000` 先清过期再按 `POOL_MAX = 64` 淘汰最早入池的。
31. `pendingPhotoCap`/`pendingPhotoSid` 加 `volatile`（写发生在 JS 线程、读在 UI 线程，
    `runOnUiThread` 的可见性是实现细节不是语言保证）。
32. `clearAccount` 两次独立 `apply()` → 合并成一个 Editor。`xxmu_fp` 被抹掉会让
    同一台手机被当成新设备，白占名额（默认 3 台）。

#### F. 本轮新增的两个工具

- `tools/verify_apk.py` 从「四件套」长到「五件套」：新增 `check_worker()`，
  在 worker.js 里查 7 个锚点（`function idxApply(` / `拒绝自动重建` / `const PAGE = 40;` /
  `function constEq(` / `act === 'orphan'` / `function edgeCache(` / `xxmu-pages-proxy-v1`），
  并在 `pages/dist/_worker.js` 里查 `headers.set('x-xxmu-ip', ip)`。
  **理由**：前两次发版都出现过「App 更新了、worker 忘了部署」—— 前端在等一个新接口，
  线上跑的还是老代码，报错全是 404，看代码怎么看都是对的。
- `tools/check_web.js` 新增 `v1.1.8 checkpoints` 三组共 34 条（前端静默失败 / 契约状态 / 显示类）。

#### 版本与产物

- `apk/xxmu-helper-v1.1.8.apk`，versionCode=**118**，**538029 字节**，
  SHA-256=`86b49be6f3bd6bb42064e980a01b09d3904ed64161974e918fa783b482b7fe79`。
- 桌面副本 `河医大助手-v1.1.8.apk` 同 hash（v1.1.0 起共 9 个包都在桌面）。
- 线上 `latest` 1.1.8 / code 118 / 同 hash / 同 size，三处一致（本地 / 桌面 / 线上下载回来）。
  `min` 仍是 1.1.1 / code 0 —— **继续压着不抬**，v1.1.1 那批有人还卡在旧页面，
  抬到 118 会把他们拦在门外。
- 服务端两个文件都已重新部署（`worker.js` 95940 字节；`npx wrangler pages deploy` 成功
  → `https://ebec694c.xxmu-auth.pages.dev`）。部署后 `/v1/_diag` 实测
  `{"ok":true,"ver":3,"viaProxy":true,"ipForwarded":true,"ipLooksInternal":false}`。
- 八套离线测试全过：`check_web.js` / `test_api_contract.js`(14) / `test_hwstatus.js`(51) /
  `test_license.js`(45) / `test_downprogress.js`(17) / `test_http_range.py`(5) /
  `test_grab.cmd`(6+8) / `verify_apk.py`（五件套）。
- 线上一组回归实测：`bytes=0-99` → 206 + `content-range: bytes 0-99/538029` + `x-apk-ver: 1.1.8`；
  `bytes=999999999-` → 416 + `bytes */538029`；`/v1/photos` 与 `/v1/feedback` 均
  `{"ok":true,"count":0,"rows":[]}`；`/v1/photo?k=pzzzzzzz` → 404；
  `/v1/admin/feedback` 无口令 → 401 `{"ok":false,"msg":"管理员口令不正确"}`。

**待真机验证（v1.1.6 起累积，adb 一直连不上，需用户开无线调试发配对码+端口）**：
①教程六页是否首次弹出、重看后还能不能正常进登录引导；
②「+ 补一条」「回复留言」「改图片说明」三个输入框是否都能弹；
③传一张图 → 显示「已提交，等审核」→ 审核页能看到图（以前是裂图）→ 通过 → WIKI 出现；
④留言发一条、连发第二条是否 429；
⑤课表同步后「另有 N 条周次没读懂」是否只在真有问题时出现；
⑥作业页内脏学那 4 条是否落到「待完成」、未开始考试是否显示待考。

### v1.1.7（2026-11-04）—— 修「限流被全校共享」+ XSS + 上传/审核链路补 fp

这一版没有新功能，全是 v1.1.6 发布后自查挖出来的问题。**其中第一条足以让全校用不了**，值得单独记一笔。

**1. 限流按 IP 计数 = 全校共用一个桶（严重）**

链条有三环，任何一环单独看都不像问题：

1. 学校出口是 NAT，几百人共用一个公网 IP（本机实测 `211.142.118.141`，`cdn-cgi/trace` 里 `colo=LAX`）。
2. `server/pages/dist/_worker.js` 转发时把 `cf-connecting-ip` 等头 **delete 掉**了，Pages Functions 是从 Cloudflare 内网发起新请求 —— 于是 Worker 眼里 `cf-connecting-ip` = **`2a06:98c0:3600::103`**（Cloudflare 自己的 IPv6）。实测探针返回 `{"cip":"2a06:98c0:3600::103","xff":"","real":"2a06:98c0:3600::103"}`。
3. v1.1.6 写的限流全是 `rlHit(prefix + clientIp(req), ...)`。

后果不是「限流偏严」，是**限流彻底失效**：`/v1/activate` 20 次/10 分钟 → 全校第 21 台设备激活就被 429；`/v1/feedback` 5 条/天 → **全校一天只能发 5 条留言**。单人测试永远发现不了，一个人怎么测都在阈值内。

四层修法：

- **Pages 层带真实 IP 过内网跳**：新增 `IP_TAG = 'xxmu-pages-proxy-v1'`，在删头循环之后 `headers.set('x-xxmu-ip', ip); headers.set('x-xxmu-via', IP_TAG)`。注释写明强度边界：这不是认证，只是「这头是我加的」标记；IP 限流本来就只挡无脑脚本，真正兜底是 fp 限流 + KV 条数硬上限 + 单请求体积上限。
- **Worker 侧认标记头**：`clientIp(req)` 先看 `x-xxmu-via === PROXY_TAG` 再取 `x-xxmu-ip`，否则退回 `cf-connecting-ip`。
- **限流主键改成设备指纹**：新增 `rlKey(req, prefix, fp)` —— fp 匹配 `/^[0-9a-f]{16,64}$/i` 就用 `prefix + ':fp:' + fp`。上传图从 query `?fp=` 取、留言从 body `b.fp` 取（`/v1/feedback` 里 `readJson` 因此提到两个 `rlHit` 之前）。`/v1/activate` 与 `/v1/check` 这时还没解析请求体、拿不到 fp，只能按 IP，但阈值放宽到 **200 次**（一个班同时装 App、一个宿舍一起重装都碰不到），靠 fp 设备名额与学号格式校验兜底。
- **留一个常驻自检**：临时探针 `/v1/_whoip` 换成 `/v1/_diag`，只回布尔（`viaProxy` / `ipForwarded` / `ipLooksInternal`），**不回 IP 原文** —— 回原文等于给愿意翻的人一张「谁在什么时候访问」的清单。部署后实测 `{"ok":true,"ver":3,"viaProxy":true,"ipForwarded":true,"ipLooksInternal":false}`。

实测：同一 fp 连发两条留言 → 第二条 429；**换一个 fp 立刻 200**。

**2. 错误信息拼进 innerHTML（XSS / 显示错乱）**

`web/app.js` 有 8 处 `box.innerHTML = '<p class="hint">…' + ((e && e.message) || e) + '</p>'`。`e.message` 里可能是服务端回的任意字节，也可能带 URL 里的内容。新增两个工具函数（`app.js:72` 与 `:77`）：

```js
function errText(e) { if (!e) return ''; return String(e && e.message ? e.message : e); }
function hintInto(box, msg) { if (!box) return; box.innerHTML = ''; box.appendChild(el('p', 'hint', msg)); return box; }
```

`el()` 用的是 `textContent`，所以任何 `< > &` 都只是文字。8 处已全部改掉，`check_web.js` 加了正则 `innerHTML\s*=\s*'<p class="hint">'\s*\+` 必须在 `app.js` 里 **0 命中**。

**3. 两个缓存位置放错**

- `handlePhoto` 的审核检查（`getPhotoIdx` + `st==='a'`）原来在 `edgeCache` **外面** —— 图片字节命中缓存了，但每次看图仍读一次 `ph:idx`，全校刷一次 WIKI 就是几百次 KV 读。已搬进 producer 里；管理员下架后靠 `handleAdminPhotoAct` 里的 `purgeEdge` 清。
- `getApkMeta` 试过加 isolate 内存缓存，**做完又撤掉了**。理由：meta 里的 `sha256` 是 `getApkBlob` 的缓存键，缓存 meta 等于**把一个旧 sha 钉住** → 旧 sha 命中旧 ArrayBuffer → isolate 存活期间持续发老包，用户点「去下载」装回来还是上个版本。这正是 `cache-control: no-cache` 要防的 bug，不能为了省几次小 KV 读自己再开一个同类口子。代价只是每次 `/v1/apk` 多一次小 KV 读。

**版本与产物**：`apk/xxmu-helper-v1.1.7.apk`，versionCode=**117**，**517549 字节**，SHA-256=`261d1d8abe566a185411d7144cb16dccbf4ad324a2fe7572bafbe46fa5d3a523`。桌面副本 `河医大助手-v1.1.7.apk` 同 hash。线上 `latest` 1.1.7 / code 117 / 同 hash，三处一致；`min.code` 仍为 0（v1.1.1 那批有人还卡在旧页面，抬了会把他们拦在门外）。

- 服务端两个文件都已重新部署（`worker.js` 80623 字节；`npx wrangler pages deploy` 成功）。Pages 部署后**必须**再打一次 `/v1/_diag` 确认 `viaProxy=true`，否则限流又退回全校共享。
- 七套离线测试全过：`check_web.js` / `test_api_contract.js`(14) / `test_hwstatus.js`(51) / `test_license.js`(45) / `test_downprogress.js`(17) / `test_http_range.py` / `test_grab.cmd` / `verify_apk.py`（四件套）。

**这一版新增的护栏**（都在 `check_web.js` 的 `v1.1.7 checkpoints` 与 `verify_apk.py` 里）：
- `worker.js` 必须含 `xxmu-pages-proxy-v1`、`function rlKey(req, prefix, fp)`、`function clientIp(req)`、`/v1/_diag` 路由。
- `pages/dist/_worker.js` 必须含 `headers.set('x-xxmu-ip', ip)`。
- `app.js` 必须含 `function errText` / `function hintInto`，且 `innerHTML = '<p class="hint">' +` 0 命中。
- `auth.js` 的 `feedbackPost` 必须带 `fp: f`。
- dex 必须含 `xxmu_fp`（Java 上传时读设备指纹）。

待真机验证：①留言发一条是否成功、连发第二条是否 429；②「+ 传一张」在图库里选图 → 压缩 → 上传 → 显示「已提交，等审核」；③管理端「审核」页能看到待审图并点「通过」；④v1.1.6 的教程/`prompt()` 四条仍未验证。

### v1.1.6（2026-11-04）—— 首次教程 + 校园实景 + 留言板 + 审核台 + 防刷 + 小黑盒文案

用户原话（m01916）：「你再思考一下还有哪些存在的问题，可以优化修复。然后我想要把这个发布出去，想先发在小黑盒上，应该需要软件内置一个使用教程在第一次打开的时候，然后还需要一个发布在小黑盒的文案。文案应该包括我为什么做这个『我最开始是懒得切一堆软件看课表看作业接水』做的……还需要做一个防止ddos攻击的措施……wiki那里可以加一些校园图片或者什么的，也可以做一个上传接口，让用户能够上传一些校园图片给管理员，由管理员挑选审核通过后显示在wiki上（类似于广告），然后也做个留言板，可以直接让用户发表意见和想法给管理员。因为大部分同学都不想进qq群我发现。」

**七件交付**：

1. **首次使用教程 `web/tut.js`（新文件，288 行）**。六页横滑：为什么做这个 / 课表 / 学习 / 接水 / 校园 / 开始吧。首句直接用用户原话「我最开始做它，纯粹是懒。」。与 `onboard.js` 分工写进文件头：**tut = 这东西是干什么的（说明书，一次性）；onboard = 现在请你登录两个账号（有状态的待办清单）**，顺序是先教程后登录引导 —— 理由是「先讲清楚值不值得登，再要人要账号，通过率更高」。pref 键 `xxmu_tut_done`，读不到时 `done()` 返回 true（**不拿教程拦人**）。入口两处：首次自动弹（`about.js` 的 `boot()` 与 `submit()` 成功后都改调 `Tut.afterUnlock()`，兜底才 `Onboard.afterUnlock()`）、「我的 → 使用教程」重看（`#rowTut`）。
   - 层序：`#sheet`(30) < `#tut`(70) < `#gate`(100) < `#upd`(120) < `#onb`(130)。

2. **修「+ 补一条」点了没反应（血案，从上线起就是死的）**。根因：Android 的 `WebChromeClient` 默认 `onJsPrompt` 直接 `return false`，既不弹框也不回调 → **所有 `prompt()` 静默返回 `null`**。WIKI 与 GUIDE 的 `addMine()` 全靠三个 `prompt()` 收输入，所以这个功能从来没工作过，而且失败方式是完全静默（点一下什么都没发生）。
   - 修法一：`MainActivity.java` 新增内部类 `Chrome extends WebChromeClient`，只重写 `onJsPrompt`（`EditText` + `AlertDialog`，确定→`result.confirm`，取消/关窗→`result.cancel()`；整体 try/catch，异常也 `cancel()` —— **绝不留一个永远不 resolve 的 prompt**，那会让调用方永久 pending，界面卡在「处理中…」），`setWebChromeClient(new Chrome())`。alert/confirm 不重写（默认实现能用）。
   - 修法二：`wiki.js` 的 `addMine()` 整体重写成 `#sheet` 表单（标题 / 分类下拉 / 内容 / 存到本机），彻底不用 `prompt()`。`guide.js` 的三条很短，保留 `prompt()` 靠 Chrome 类接管。

3. **校园实景图片墙**。`wiki.js` 新增 `photosSection()` / `photoCard()` / `openPhoto()` / `loadPhotos()` / `startUpload()`，渲染在 WIKI 页最前（理由：这是这一页唯一「只有本校人才拍得到」的内容）。`<img loading="lazy" decoding="async">` 直接引用 `/v1/photo?k=xxx`，**不走 JSON、不 base64**（300 KB 图 base64 进 JSON 就是 400 KB；`<img>` 让 WebView 自己流式解码、自己走缓存）。有 `w/h` 时写 `aspect-ratio` 占位防跳动。

4. **上传链路（Java，字节从不进 JS）**。`Http.uploadRaw(url, File, contentType)` 新增（与 `uploadFile` 的差别只有两点：不塞 `X-Admin-Key`、Content-Type 由调用方给）。`MainActivity` 新增 `REQ_PHOTO=1008`、`Host.pickPhotoForUpload(cap, sid)`、`handlePhotoResult()`：
   - **两段式解码防 OOM**：先 `inJustDecodeBounds` 读尺寸，`while (longest/sample > 3200) sample *= 2`，再 `inSampleSize` 真解码（直接解 8000×6000 要吃 200 MB）。
   - 长边压到 **1600**（校园照是「给人看这是哪」不是摄影作品，1600 在 2K 屏放大也够；手机原图压到 1600 通常只剩 200~400 KB，学生用流量也不心疼）、JPEG 质量 **82**（低于 75 文字/招牌糊得认不出，高于 88 体积翻倍）。
   - 用 `setFixedLengthStreamingMode` 流式上传。**为什么不 base64 走 `postMultipart`**：1.5 MB 图 base64 后 2 MB，加 JS 字符串和桥拷贝峰值吃 6 MB 堆，低端机容易被杀。
   - 回调：`window.__onPhotoProgress(stage)`（`compress` / `upload`）、`window.__onPhotoUploaded(ok, msgOrKey, st)`（`pending` / `fail`）。

5. **留言板**。`wiki.js` 新增 `fbSection()` / `fbCard()` / `composeFeedback()`。**只公开有回复的**（最多 40 条），展示名 `同学+学号后四位` 或「匿名」—— 理由写进代码注释：**留言常带学号宿舍号手机号，全公开等于把学生隐私摆到墙上；只公开有回复的，提问的人得到答复，别人只看有答案的那部分**。服务端限流 60 秒一条 + 一天 5 条。

6. **管理端审核台**。`AdminUI` 的 `PANES` 加 `'rev'`（在「版本」与「公告」之间），新增 `#admP-rev` pane：左「待审校园图片」右「留言板」。图片三态徽标「已公开/待审/已下架」+ 通过/下架/改说明/删除；留言显示未读徽标、类型、学号后四位、正文、联系方式、已有回复 + 回复/标记已读/删除。

7. **防刷（服务端）**。写清楚了「Worker 能挡什么、不能挡什么」：CF 已挡掉 L3/L4 和大部分 L7 洪水，Worker 能感知的只剩两类 —— ①**你自己接口的放大效应**（一个便宜请求触发昂贵 KV 读写；KV 免费额度 10 万读 + **1 千写**/天，刷光写额度当天管理接口全废）②单客户端反复重试。策略按成本分层：
   - A. 便宜请求（`/v1/config`、`/v1/apk`）→ **靠边缘缓存**，不靠限流。
   - B. 中等请求（`/v1/activate` 20 次/10 分钟、`/v1/check` 20 次/6 小时）→ 内存计数 429。
   - C. 昂贵请求（上传图 3 张/10 分钟、留言 1 条/分钟 + 5 条/天、管理员写配置）→ 内存计数 + 硬上限（待审 ≥40 张直接拒）+ 体积限制（图 1.6 MB、留言 8 KB、管理 JSON 4 KB）。
   - **为什么不用 KV 记数**：KV 写每天只有 1000 次免费，用 KV 记数等于把「防刷」本身变成刷。内存计数器随 isolate 重启丢失，但 isolate 按机房分布、生命周期以分钟计，真被刷时每个机房各挡一部分，成本为零。

**同时修的两处架构隐患（这两条比功能本身重要）**：

- **`cache-control` 在 Worker 里不会自动让边缘缓存**。改前 `handleConfig` 直接返回 JSON，KV 每个请求读一次。新增 `edgeCache(req, ttlSec, producer)`：显式用 `caches.default`，命中回 `x-edge: hit`、未命中写 `x-edge: miss` 后 `cache.put`。**`x-edge` 头是故意加的 —— 有了它「缓存到底生效没生效」连打两次就能验，不用猜。** 配套 `purgeEdge()`（管理员改配置/审核图片/回复留言后主动清）。另加 APK 字节内存缓存 `getApkBlob()`（治「4 段 Range = 4 次整包 KV 读」），上传/删除时同步刷新/清空。
- **`bad()` 一律 `cache-control: no-store`**。否则边缘会把某个人的 429/401 发给下一个人。

**踩到的两个真 bug（都是「静默失败」，功能整个消失但接口 200）**：

1. **`/v1/photo` 路由没限定方法**：`if (p === '/v1/photo')` 少了 `req.method === 'GET'`，POST 上传被 GET 分支先接走当成「取某张图」，**上传永远 404**。结构相同的 `/v1/feedback` 早就分了 GET/POST，这里漏了。
2. **前端读 `res.list`，服务端发 `rows`**：服务端所有列表接口都返 `json({ok,count,rows})`，前端 4 处读 `res.list`（`wiki.js loadPhotos`/`loadFeedback`、`app.js loadRevPhotos`/`loadRevFb`）→ **不报错、不抛异常、接口 200，但永远空**。修成兼容双字段（`res.rows || res.list`）。

**为第 2 个 bug 专门建了 `tools/test_api_contract.js`（14 项，全 PASS）**。理由：拼写不一致这类问题**无法靠「跑一遍看看」发现**（看起来就是没数据）、**也无法靠类型检查**（都是 JSON），只能把两边真正的字符串拿出来对照。实现是纯文本扫描（不 require 任何一侧）：从 `worker.js` 抽 `json({...})` 与 `DEFAULT_CFG` 的顶层键（共 45 个），用大括号配平取 `fnBody()`，只检查 4 个「吃接口返回」的函数，`ALIAS_OK` 每条豁免必须写理由。还断言：4 个函数体都必须**同时**出现 `res.rows` 和 `res.list`（光「现在对」不够，服务端改名后还得能活）、`/v1/photo` 与 `/v1/feedback` 必须各有 GET/POST 分支且**不许存在不带 method 判断的同路径兜底**、接口存在性双向对账。
> 迭代教训：v1 全文件扫 `res.xxx`，把 `const res = document.createElement(...)` 的 `res.appendChild` 也当接口字段，报出 20 个假阳性。**噪声一大片后只能靠长豁免名单糊，测试就成摆设了** → 改成只扫指定函数体。

**线上验证（实测）**：
- `GET /v1/photos` 连打两次 → 第一次 `edge=miss cc=public, max-age=120, s-maxage=120`，第二次 **`edge=hit`** —— Cache API 确实生效。
- `POST /v1/feedback` 200 → 立刻再发一条 **429**（60 秒限流生效）。
- 用 Cloudflare API 直写 KV 模拟管理员（`ADMIN_KEY` 已丢，见坑 9）：写 `ph:idx` 一条 `st:'a'` → `/v1/photos` count=1、`/v1/photo?k=` 200 `image/jpeg` 23281 字节；写 `st:'p'` → `/v1/photos` count=0 且直连 `/v1/photo` **404**（**审核门真的拦得住**）。测试数据已全部清理，线上回到 `count:0`。

**发布产物**：`apk/xxmu-helper-v1.1.6.apk`，versionCode=**116**，**517549 字节**，SHA-256=`d51061f3a145f8a210a16559d998b3ffaba2ab348f1d0060a28228faefdd360c`。桌面副本 `河医大助手-v1.1.6.apk` 同 hash。线上已发布（`latest` 1.1.6 / code 116 / 同 hash / 三处一致）；`min.code` 仍为 0。
- 打包：16 个 assets / 73 class。四件套 `[PASS]`，证书与 v1.1.1 一致。
- 全套 8 个离线测试一次全过：`check_web.js` / `test_api_contract.js`(14) / `test_hwstatus.js`(51) / `test_license.js`(45) / `test_downprogress.js`(17) / `test_http_range.py` / `verify_apk.py` / `test_grab.cmd`。

**文案**：`docs/xiaoheihe-post.md`（120 行，6144 字节）。含「发布前必读（这段不要发出去）」、标题三选一、正文（开头即用户原话、五节功能介绍、四步用法、隐私三条、限制三条、反馈三条）、短版、一句话简介、标签、配图顺序、评论区预备回答 6 个。**明确写了不要把「加群」当必须步骤** —— 用户说过大部分同学不想进群，留言板就是为此做的。

待真机验证：①首次装上是否先弹教程、六页能否横滑、末页「开始使用」后是否正确接上登录引导；②「+ 传一张」选图 → 压缩 → 上传 → 显示「已提交，等审核」；③留言板发一条、管理员在「我的 → 管理 → 审核」回复后是否公开显示；④`prompt()`（GUIDE 的补一条）是否真能弹输入框。

### v1.1.5（2026-11-04）—— 修「作业/考试状态读不准」：读不到状态不再冒充已完成

用户报障（原话）：「学习通这里又出错了，我有的作业比如『内脏学』，压根没交却显示已完成，有的考试是未开始却也显示已完成。它一共有作业和考试，作业有已完成和未开始，还有未批阅和已批阅。考试有未开始，已完成，已结束。数据读的不准确呀现在」。两张截图是决定性证据：分组头写着「已完成 · 9」，下面 9 条作业（26-27-1-中枢神经系统 / 周围神经系统 / 脉管系统和感觉器 / 内脏学 / 经典导引 / 振动作业 / Unit 1 / 流体运动 / 激情犯罪）**每一条右侧角标都是一个短横「—」**——即 `status` 全部解析成空字符串。

**根因（两层，失败方式一样：都不报错，只是默默把「不知道」当成「做完了」）**：

1. **状态提取只认 `<strong>`**。`web/chaoxing.js` 里原来是 `const sst = /作业状态：<\/span>(.*?)<\/strong>/.exec(blk);`，`.*?` 比 python 版少了 `re.S`（对照 `core/chaoxing.py:186`）。学习通页面把状态换成 `<span class="zt">`、或者中间夹了换行，整条就匹配不上 → `status = ''`。
2. **空状态被判成「已完成」**。`classify('')` 返回 `'unknown'`，而 `finish()` 里只判 `w.open = classify(w.status) === 'open'` —— `unknown === 'open'` 为假，open=false，直接掉进「已完成」那一堆。`web/app.js` 的 `renderHomework()` 又自己重算一遍 `w._open = k === 'open'`（不采信 CX 算好的），同样的缺陷再犯一次；分组时 `done = pool.filter(x => !x.open)` + 标题写死 `'已完成 · N'`，「状态读不到」就这样被渲染成了「已完成」。

**改法（前端两层 + 一处诊断）**：

- `web/chaoxing.js` 新增 `pickStatus(blk, labels)`（两跳：①跳过最多三层包裹标签取裸文本，②取标签后 300 字宽窗口连 `title`/`alt`/`value` 属性一起扫状态词），配 `wordIn(text)`（去空白后先扫 `DONE_WORDS` 再扫 `OPEN_WORDS`）。`parseWorks` / `parseExams` 都改调它，替换掉两条 `<strong>` 正则。认不出具体词时**原样返回截到的文本**，不返回空串 —— 让用户在角标上看到学习通到底写了什么。
- `DONE_WORDS` 加 `'未批阅'`、`OPEN_WORDS` 删 `'未批阅'`。理由：它和「待批阅」是同一件事的两种写法（我都交了，等老师批），判成待做会让人以为还要再交一次；用户原话把它当独立终态。
- `finish()` 分桶加重写：两侧都写 `status_known`；works 侧 `open/ done` 已知时照判，`unknown` 时按截止时间兜底（`due == null || due > now`）。exams 侧多一条**不依赖任何解析**的硬事实：`if (e.upcoming) e.open = true;` —— 开考时间没到就不可能是已完成。
- 决策依据写进注释：两个方向都可能判错，但**判成待做最多多点开看一眼，判成已完成会让人错过截止，不可逆**，所以拿不准站「还得做」这边。
- `web/app.js`：`renderHomework()` 采信 `status_known`（旧缓存没这个键时现场补算，防升级后第一次打开误判）；角标读不到时印「状态未知」而不是「—」；折叠区从「已完成 · N」一段拆成两段 —— **已完成**（学习通明确说做完的）与 **状态未读到**（读不到且已过截止），组头也从「全部完成」改成「未完成情况不明」。`isDoneStatus(st)` 新增为唯一判据，避免各处再各写一套。
- **诊断**：`chaoxing.js` 新增 `DIAG.statusMiss`（内存，最多 3 条 × 800 字）、`noteMiss()`、`diag()`、`diagReset()`（`sync()` 开头调）；「我的 → 诊断」新增 `#btnShowHwRaw`「查看作业状态原文」，一键复制原始 HTML。理由：这次 bug 全靠「角标是—」一个细节反推，项目历史上从没把学习通原始页面落过盘，下次改版只能继续猜。

**离线验证**：新增 `tools/test_hwstatus.js`（51 条断言、6 组，全 PASS）：①`pickStatus` 11 种标签写法（strong / span / b / em / 两层嵌套 / 裸文本 / 标签间换行 / 半角冒号 / 带 class / 文字只在 title 属性 / 只有「状态：」）；②边界 3 例（无状态位→空串、空块→空串、认不出的词原样返回）；③`classify` 18 例；④`parseWorks` 端到端 4 例；⑤`finish` 分桶 13 例（**含「未开考却写着已完成 → 仍然待考」这条用户直接抱怨的**）；⑥真实快照 `data/homework.json` 回归（9 条件业 + 10 场考试状态全部可识别）。
> E 用例（未交 + 已过截止）第一次写错了期望，跑出 2 项 FAIL。改正为「未交+已过期仍属没交，留在待做侧」——这正是用户抱怨的方向，不能反过来。

- 当前 APK：`apk/xxmu-helper-v1.1.5.apk`，versionCode=**115**，501106 字节，SHA-256=`7f9f90c56c6f0643ff19b9f2b6567aa33e2c5d761ac4cb0cbb4cfea81b40747d`。签名证书与前几版一致（`0e684845…`），可覆盖安装；桌面副本已交付 `河医大助手-v1.1.5.apk`。
- 线上已发布：`latest` 1.1.5 / code 115 / 501106 字节 / 同 SHA-256；`min.code` 仍为 0（继续压着不抬）。
- 改的文件：`web/chaoxing.js`、`web/app.js`、`web/about.js`（`#btnShowHwRaw` 绑定 + `#fbHw` 健康度行 + `APP_VERSION='1.1.5'`）、`web/index.html`（`#fbHw` 行 / `#btnShowHwRaw` 按钮 / `aboutVer`）、`android/AndroidManifest.xml`（115/1.1.5）、`tools/check_web.js`（v1.1.5 静态锚点）、`tools/verify_apk.py`（`NEW_JS_SYMBOLS` 加 chaoxing.js / index.html 两项）。

待真机验证：①内脏学那 4 条是否落到「待完成」而不是「已完成」；②未开始的考试是否显示待考；③「查看作业状态原文」能不能复制出内容（若仍读不到，把那段原文发回来就能直接定位）。

### v1.1.4（2026-11-03）—— 下载提速：4 段并发 + 断点续传 + 进度条

用户报障：「下载太慢了，有解决方法吗」+ 截图。截图信息量很大：更新弹窗的按钮停在「下载中…」一动不动，**顶部状态栏网速 0.41 KB/s**，走的是 5G 移动流量不是 Wi-Fi；按钮进入「下载中…」之后**没有百分比、没有进度、没有重试**，所以「慢」和「卡死」在用户眼里长得一模一样。

**量测结论（决定整个方案怎么设计）**：

1. **`/v1/apk` 当时完全不支持 Range**：`GET` 返 200 全量、`content-range` / `accept-ranges` 都没有；`worker.js` 里搜 `Range|206|partial` 零命中，`handleApk` 是 `AUTH.get(APK_BLOB,'arrayBuffer')` 一次性返回。客户端只能从头下到尾，断了就从头再来。
2. **单条 TCP 连接被压在 ~300 KB/s**，而且限的是「每连接」不是「每客户端」——同时开 4 条并发各下整包，聚合 1.28 MB/s；8 条 2.28 MB/s；20 条 6.21 MB/s（20/20 全成功）。TTFB 0.9~1.2s，正文 1.4~1.7s，**大头是传输限速而不是握手**。
3. **复核时发现这个上限不是固有的**：同日稍晚换一条出口路径，单流也能到 1.2 MB/s。所以「300 KB/s」是**当时那条链路**的上限。分段并发因此有两个价值：①上限被压低时（校园网/运营商/CF 边缘限速）能线性叠加；②无论快慢，断了能续，不必重下整个 480 KB。
4. **分段数定 4 不是拍脑袋**：单流 1.59s → 2 段 1.17s → 3 段 1.04s → 4 段 1.02s → 6 段 0.99s → 8 段 0.87s → 12 段 0.85s（每项 5 次，全量 sha256 校验）。4 段拿到七成收益，连接数只有 8 段一半，弱网更稳；12 段已不再变快（到顶）。
5. 包体构成：`classes.dex` 294175（解压 607204）+ `assets/jsQR.js` 56811（解压 256885）是两个大头。**试过用 d8.jar 里自带的 R8 3.3.20 做 shrink：keep 全部自己的类反而 297660（比 d8 更大），只 keep 入口 + `@JavascriptInterface` 才 271156 —— 只省 2 万字节（约 4%），换混淆与裁剪风险，放弃**。`jsQR.js` 保留：它是相册选图的第 2 条兜底（ZXing `QrDecoder.decodeBitmap` 直解失败后才交给前端 jsQR）。

**改法（服务端 / 代理 / Java / 前端，四层都要动）**：

- `server/worker.js` `handleApk(req, env)`：加 `accept-ranges: bytes`；解析 `^bytes=(\d*)-(\d*)$`，支持 `bytes=a-b` / `bytes=a-` / `bytes=-n`；命中返 **206** + `content-range: bytes a-b/total` + 精确 `content-length`；越界走新增的 `apk416(total, head)` 返 416 + `content-range: bytes */total`。不带头的老客户端仍走 200 全量。
- `server/pages/dist/_worker.js`（薄代理）：透传头白名单加上 `accept-ranges` / `content-range` / `etag`。**少了 `content-range`，客户端拿到 206 却不知道是哪一段，只能退化单流** —— 这条是实测出来的：只改 worker 不改代理时，返回 206 但 `content-range=None`。
- `android/src/com/xxmu/helper/Http.java`：新增 `SEGMENTS=4`、`interface Progress`、`downloadToFile(url,dst,onProgress)`、`probeLength(url)`（发 `Range: bytes=0-0` 从 `content-range` 尾部取总长，**不用 HEAD —— CF 对 HEAD 不一定正确处理**）、`fetchRange(...)`、`downloaded(...)`；`downloadSingle(...)` 原样保留作退路（探测失败或 `total < 256KB` 时走它）。
  - **续传的坑**：进度不能用「累加器」，要用 `long[] cursor` 记每段游标 —— 续传会重取已经写过的字节，累加器会把同一批字节数两遍，百分比冲到 120%。
  - `fetchRange` 的 `setReadTimeout` 是 **25000ms 不是 120 秒**：截图现场 0.41 KB/s 那种连接是「僵」不是「慢」，等两分钟才超时，用户看到的就是按钮永远不动。
  - 每段最多重试 3 次（`Thread.sleep(500*(attempt+1))`），全部失败才抛；读完后校验 `cursor[seg] > segTo[seg]`，少给了就再要一次。
  - 故意**不解析 `content-range` 右端去「修正」`to`**：读循环本来就只读到流结束，少给了上层会发现并重取；多写一段边界解析只会多一个出错点。
- `android/src/com/xxmu/helper/MainActivity.java` `downloadAndInstall`：接 `Http.Progress` 匿名实现，**150ms 或百分比变化**双条件节流后 `pushProgress` → `window.__onApkProgress(got,total)`；成功时在 `__onApkDownload` 后再补一次 `__onApkProgress(len,len)`（**节流会吞掉最后一次回调，界面会永远停在 97%**）；失败时 `out.delete()`（**分段失败留下的是 `setLength` 出来的空洞文件，已有几百 KB，不删会让下次「文件太小」判断误判成成功，装上一个全 0 的包**）。
- `web/app.js` 的 `APKDL` 模块本来就有 `start/finish/progress` 三件套和 `pending` 单飞，`window.__onApkProgress` 直接接到 `APKDL.progress`；`progress()` 里已有一层「百分比不许倒退」的夹逼（4 线程各自累加，进度偶尔会先到 90% 再被别的线程拉回 88%）。`#updGo` 的文案改成「下载中 42%」，失败变「重试下载」并可再点。
- `cache-control` 从 `no-store` 改成 **`no-cache`（不是 `max-age`）**。一度写成 `public, max-age=86400`，随后自己撤了：`/v1/apk` 这个 URL 是固定的，发新版时 blob 换内容但 URL 一个字没变，给它 `max-age` 就等于让浏览器/中间代理在发版后最多一整天还发旧包 —— 用户点了「去下载」，装回来还是老版本，服务端查什么都是对的，这种 bug 极难查。

**离线验证装置**：`tools/test_http_range.py`（本地起 `ThreadingHTTPServer` 演 5 种 Range 行为，现场生成 `TestHttp.java` 调真 `Http.downloadToFile`，每次校验 sha256）。5 个用例全过：

| 用例 | 期望 | 实测 |
|---|---|---|
| 正常 4 段并发 | 成功 | OK 0.1s，sha 一致 |
| 服务端不支持 Range | 退回单流仍成功 | OK，sha 一致 |
| 分段偶发掐断（预算 4 次） | 续传后成功 | OK 0.6s，sha 一致 |
| 慢速 50 KB/s | 成功 | OK **5.9s**（串行要 24s，证明 4 段真并行） |
| 永久掐断 | 必须失败 | **FAIL**，报「分段没拿全，还差 38400 字节」 |

两个坑：①「偶发掐断」不能按 `(start,end)` 去重 —— 续传起点变了就是新的 Range 请求，按 key 去重会导致每次重试都被掐，永远续不上，得用**全局预算**；②故意 RST 会让 socketserver 往 stderr 打 traceback，设 `httpd.handle_error = lambda *a: None` 关掉，否则真正的失败信息被淹掉。

- 当前 APK：`apk/xxmu-helper-v1.1.4.apk`，versionCode=**114**，492914 字节，SHA-256=`97156cae9b72006498c3f4ef28a669b48368e8434a5560a89effb11158a6be9b`。签名证书与前几版一致（`0e684845…`），可覆盖安装；桌面副本已交付 `河医大助手-v1.1.4.apk`。
- 线上已发布：`latest` 1.1.4 / code 114 / 492914 字节 / 同 SHA-256；`min.code` 仍为 0（继续压着不抬）。
- 线上复测：`bytes=0-0` → 206 + `bytes 0-0/492914`；`bytes=100-199` → 206 + 精确 100 字节；`bytes=999999999-` → 416 + `bytes */492914`；全量 → 200 + 492914。

待真机验证：①真机下载是否真的变快、进度条是否在动（adb 连不上，需要用户开无线调试重新配对）；②三条旧遗留（青果读号时序 / 不一致提示是否清楚 / `goods/endWater` 与 `goods/shower/sync` 返回）。

### v1.1.3（2026-11-03）—— 补齐「学号核对」的另一半：换号作废 + 单独清除

v1.1.2 只修了「读到占位符「账号」被当成学号」这一半。刘雨鹭那条路还有两个洞，v1.1.3 补上：

1. **换号后旧核对记录还在**。她先填朋友的学号、登录过教务（`K_ACCT_KB` 落成朋友的号），再改回自己的学号 —— 新学号一到，「朋友的号 ≠ 我的号」，又拦一次。修法：`license.js` 的 `activate(studentId)` 里，若 `get(K_ID)` 已存在且与新学号不同，先把 `K_ACCT_KB` / `K_ACCT_CX` / `K_VERIFIED` 清空再写新号（核对记录本质是「这个学号 ↔ 那个教务账号」的绑定，学号一变就该作废）。同号重复提交不清，避免手滑重填把已通过的核对打掉。
2. **清一个布尔判据的代价太大**。v1.1.2 之前用户唯一的出路是「重新填学号」或「退出本机账号」，两条都会把课表缓存、教务 cookie 一起冲掉。新增 `LICENSE.clearCheck()`（只清那三个 pref）+ 「我的」页 `#btnClearCheck`「清除学号核对记录」按钮，清完不 `location.reload()`（下次登录教务会重新核对，「未核对」本来就是正常状态）。

- 当前 APK：`apk/xxmu-helper-v1.1.3.apk`，versionCode=**113**，488818 字节，SHA-256=`5702E2DF26B27A7CAD1A5754EC454ECF2509FC19E06B7C35A08DAD31573B7DC6`。签名证书与 v1.1.1/v1.1.2 一致（`0e684845…`），可覆盖安装；桌面副本已交付 `河医大助手-v1.1.3.apk`。
- 线上已发布：`latest` 1.1.3 / code 113 / 488818 字节 / 同 SHA-256；`min.code` 仍为 0（继续压着不抬）。
- 改的文件：`web/license.js`（`activate` 换号清记录、新增并导出 `clearCheck`）、`web/index.html`（`#btnClearCheck` + hint）、`web/about.js`（按钮绑定 + `APP_VERSION='1.1.3'`）、`web/app.js`（两处不一致提示的措辞：把「退出本机账号」改成指向新按钮「清除学号核对记录」，退出整机太贵）、`android/AndroidManifest.xml`（113/1.1.3）。
- 离线验证：新增 `tools/test_license.js`（45 条断言，7 组 —— 脏值不入账 / `noteKbAccount` 拒写占位词 / 一致与不一致 / 换号作废 / 同号不清 / `clearCheck` 爆炸半径 / `looksLikeAccount` 边界）。`tools/check_web.js` 升级为会打分的体检：assets 一致性、三处版本号互校、乱码指纹、`kbMismatchAck` 引用次数下限，任一项不过 `exit 1`。
- `tools/verify_apk.py` 也不再写死版本号：期望值从 `android/AndroidManifest.xml` 读，默认挑 `apk/` 下版本号最大的包（之前写死 112/1.1.2，改成 113 后第一次跑是假 FAIL）。

待真机验证（同 v1.1.2 遗留）：①青果登录页读学号时序；②不一致时的提示是否清楚；③`goods/endWater` 与 `goods/shower/sync` 真机返回。adb 目前连不上（`adb devices -l` 空、`adb mdns services` 空），需要用户在手机上开无线调试后重新配对。

### v1.1.2（2026-11-03）—— 修「学号对不上，先别同步」把课表永久锁死

用户报障：截图里弹层写着「你现在登录教务用的账号是：**账号**」「软件里登记的学号是：20261430313」，课表网格整张空白。聊天记录（刘雨鹭）的复现路径：「第一版本填的我自己的学号 → 第二版重装后第一次填了朋友的学号 → 退出登录 → 登录自己的学号 → 就变这样」，「退出重新登录完还是这种」。

- 当前 APK：`apk/xxmu-helper-v1.1.2.apk`，versionCode=**112**，488818 字节，SHA-256=`2E01793F0729BBF93414FA992EAC8777E478559D0F6CDABB2D1FD098F725C660`。签名证书与 v1.1.1 一致（`0e684845…`），可覆盖安装；桌面副本已交付 `河医大助手-v1.1.2.apk`。

**根因（三层叠加，缺一层都不会出这个现象）**：

1. **青果登录页有两个镜像输入框**（离线快照 `D:\dsh\DSH Desktop\_scratch_qg.html`，34943 字节）：
   - `input#username1`（DOM pos 25035）：`type=text class=tx1 maxlength=20 value="账号" style=color:#ccc` —— **假的装饰框，value 恒为中文占位符「账号」**；
   - `input#username`（DOM pos 25223）：`name=username class=tx1 tabindex=1 style="display:none"` —— **真提交框，初始无 value**，用户点一下假框时由页面 jQuery 把内容同步进来（`if(jQuery(this).val()=='账号') jQuery(this).val('')` → `hide()` `#username1` → `show()` `#username`）。
   - 密码 `#password1`/`#password`、验证码 `#randnumber1`/`#randnumber` 同样是这套镜像结构。
2. **抓取端把装饰框的值当成了账号**。旧 `buildGrabJs` 按逗号选择器取「第一个 value 非空」的框，而 `#username` 平时 `display:none` 且空 → 回落到 `#username1` → 拿到字面量 **"账号"**。`grabAccount()` 里 `if (s.length() > 0) lastUn = s;` 又只接受非空覆盖，登录提交后整页 DOM 换掉、两个框都不在了，于是最终回传的 `EXTRA_ACCOUNT` 永远是 "账号"。
3. **脏值被持久化并硬拦**：`noteKbAccount("账号")` 写进 pref `xxmu_acct_kb` → `syncSchedule()` 的 `if (acc.kb && acc.id && acc.kb !== acc.id) return;` 直接拦掉抓课表 —— **从没发起过请求**，所以网格全空、且一个字的错误提示都没有。改学号、退出重登都救不回来，因为每轮登录都会重新写一次「账号」。

**修法（四处，互相兜底）**：

- `android/src/com/xxmu/helper/WebActivity.java`：
  - 新增 `PLACEHOLDER_WORDS`（line 86）与 `isPlaceholderLike(String)`（line 93）：`账号 帐号 学号 用户名 用户 请输入账号 请输入帐号 请输入学号 请输入用户名 密码 请输入密码 手机号 请输入手机号 account username user password phone`。
  - 新增 `placeholderJsArray()`（line 104）把词表编成 JS 数组字面量。
  - `buildGrabJs`（line 128）加三道过滤：①值等于元素 `placeholder`/`data-placeholder` 属性本身则跳过；②值命中 `BAD` 词表则跳过；③`querySelector` 返回 null 则跳过。**故意不按可见性筛** —— 青果真框平时就是 `display:none`，按可见性会把唯一正确的框筛掉。
  - `grabAccount` 回调（line 392）改成 `if (s.length() > 0 && !isPlaceholderLike(s)) lastUn = s;` —— Java 侧再挡一层，防 JS 侧被页面改版绕过。
- `android/src/com/xxmu/helper/MainActivity.java:187`：`openLogin()` 的选择器顺序改为 `"input#username,input[name=username],input#username1"` —— **真框优先，`#username1` 只作别的青果版本的兜底**（旧代码顺序相反，是这次血案的直接触发点）。
- `web/license.js`：新增 `PLACEHOLDER_WORDS`（line 254）与 `looksLikeAccount(v)`（line 261，占位词 → false，其余只认 `/^\d{6,20}$/`）；`noteKbAccount`（line 275）与 `noteCxAccount`（line 294）遇到不像账号的值返回 `{ok:true, unknown:true}` 且**不写 pref**，同时把历史上被污染的旧值清掉；`accounts()`（line 314）出口再洗一次 —— **老版本装过的手机升级后 pref 里那句「账号」会被自动清掉，不必卸载重装**；`activate()`（line 215→229 区段）登记新学号时不再保留旧的 `K_ACCT_KB`。
- `web/app.js`：新增两个模块级 flag `kbMismatchAck`（line 1050）、`kbMismatchToastShown`（line 1052）。`syncSchedule()` 的拦截逻辑（line 1115-1141）改成「**拦一次、给一条出路**」：
  - 自动同步（`showResult=false`）不弹层、不记 flag，只 toast 一次「登录的学号和登记的学号对不上，点「从教务同步课表」看说明」然后 return —— 这修掉了「课表空白且毫无提示」；
  - 手动点同步：第一次弹说明并置 `kbMismatchAck=true`，**再点一次就放行**（`kbMismatchAck=false` 后继续往下走抓取）。理由：一个只提示不放行的关卡，一旦判断错就等于把软件锁死；而「教务登录名不是学号」的学校是真实存在的情况，不能让这类用户永远同步不了。

**验证**：
- 离线 DOM 测试装置（新增，可复跑）：`tools/test_grab.cmd` → javac `tools/TestGrab.java`（反射调 `buildGrabJs`，用 `OutputStreamWriter(..., "UTF-8")` 写 `build_test/grab.js`）→ `node tools/test_grab.js`（vm + 极简 `document.querySelector` 垫片执行生成出来的 JS）。6 个页面态全 OK：未点过输入框 → `""`；已填学号 → `20261430313`；只有装饰框有值 → `""`；值等于 placeholder 属性 → `""`；只有 `#username1` 且真填了 → 兜底拿到；三框都不存在 → `""` 不误报。`looksLikeAccount` 8 条断言全 OK（`账号`→false、`20261430313`→true、`USERNAME`→false、`abc12345`→false …）。
- 13 个 JS 文件语法全过（`node tools/check_web.js`）。
- APK 四件套全过（`python tools/verify_apk.py`）：assets 15 文件逐字节一致（app.js 145728 / license.js 13881 / index.html 37434 …）；dex 含 `PLACEHOLDER_WORDS`/`isPlaceholderLike`/`placeholderJsArray`，license.js 含 `looksLikeAccount`/`PLACEHOLDER_WORDS`，app.js 含 `kbMismatchAck`/`kbMismatchToastShown`；badging **112/1.1.2**；签名证书 `0e684845…` 与 v1.1.1 一致。
- 三处版本号已同步：`AndroidManifest.xml:4-5`（112/1.1.2）、`web/about.js:14`（`APP_VERSION = '1.1.2'`）、`web/index.html:626`（`v1.1.2`）。

**踩坑记录（下次改这个项目会再遇到）**：
- **PowerShell 5.1 的 `Get-Content -Raw` + `-replace` + `WriteAllText(..., UTF8Encoding($false))` 会把中文源码写坏**（这次写坏了 `web/index.html` 与 `web/about.js`，只能重写）。改这种带大量中文的文件只用 `edit`/`write` 工具，别走 PowerShell 文本管道。
- **`cmd.exe` 按 ANSI/GBK 读 `.cmd` 文件**：脚本里写中文注释会让整个批处理错位成 `'…' is not recognized`。`tools/test_grab.cmd` 必须保持纯 ASCII。
- **不要用 `System.out` 输出生成的 JS**：Windows 控制台重定向是 GBK/936，占位词表里的中文会变乱码，测试就变成在测「乱码能不能挡住」。TestGrab 因此改成写 UTF-8 文件。
- **PowerShell 传 `-Dfile.encoding=UTF-8` 给 java 会被吃掉**（`ClassNotFoundException: /encoding=UTF-8`），要用 `"-Dfile.encoding=UTF-8"` 整个加引号，或者干脆走 .cmd。

- **仍待真机验证**（真机此刻 adb 连不上，`adb devices -l` 空、`adb mdns services` 空，故未装）：①升级后打开 App，原先卡在「学号对不上」的那台机器课表是否自动恢复（pref 脏值自动清洗）；②真机 WebView 的 `onPageFinished` 时序下 `input#username` 能否稳定读到；③`goods/endWater` 与 `goods/shower/sync` 的真实返回。

### v1.1.1（2026-11-03）—— 拆掉发卡 + 结算方式可切换

用户原话：「这个发卡是不是没用了，可以优化掉了，结算做成可以设置的，一种是点完接水变成结算，一种是两个分别是独立按键」

- 当前 APK：`apk/xxmu-helper-v1.1.1.apk`，versionCode=**111**，484722 字节，SHA-256=`34E36EB1F7970AF48B2D394B131CFF8DB593AAA7222AFB8063B3ADB74287B794`。签名不变（`0e684845…`），可覆盖安装；桌面副本已交付。
- **发卡/开卡整套拆掉**（v1.1.0 取消激活码后它已经不参与准入，只剩误导）：
  - `web/index.html` 删除 `#admGrant`（开通并生成激活码）、`#admNote`（备注框）、`#admOut`（结果输出区）、`#admCopyAll`/`#admCopyPair`；`app.js` 删除 `grant()`、`renderOut()`、`currentRows()`、`copyAll()`、`copyPair()` 与对应的 `on(...)` 绑定，导出表去掉 `grant`。
  - 管理段首页改名「管理」，只留三个动作：**停用（立刻踢下线）** / **解封（重新启用）** / **清空设备记录**。概览第一格由「已开卡」改「正常使用」，名单卡标题由「已开卡名单」改「使用名单」。
  - **`ungrant()` 语义改写**：原来叫「收回开卡」（服务端 `handleUngrant` 会删 `lic:` + `dev:` + `rev:`）。现在界面上叫「清空设备记录」，实际改调 `AUTH.Admin.unbind(ids)` —— 只删 `dev:`，不动 `rev:`，这是换手机时唯一还需要的东西。**理由**：取消开卡后删 `lic:` 毫无意义，而 `handleUngrant` 连带删 `rev:` 会让「停用」和「没开卡」两种状态在名单上长得一样（v0.9.1 踩过一次）。
  - `unrevoke()` 去掉「没开卡 / 本来就没开卡」那套提示（那个状态已不可能出现），只在真的没被停用时说「本来就没被停用过」。
  - `actName()` 里 `ungrant: '收回'` → `'清空设备'`。
- **名单索引必须补一处服务端改动**（不改会静默坏掉）：`idx` 这个 KV 键原本**只有 `handleGrant` 写**。开卡功能删掉后，管理员打开名单永远是空的。改法：`handleActivate` 成功分支末尾加 `await idxAdd(env, id, '');` —— 这样一来名单语义变成「谁进过 App」，比原来「谁被开过卡」更符合现在的需要。注意 `idxAdd` 每次调用会读+写整个 `idx`，人数上千后单次开销变大，届时再换分片方案。
- **结算方式可切换**（`WATER.settleMode` / `setSettleMode`，pref 键 `xxmu_water_settle`，默认 `'two'`）：
  - `'two'`（默认，保持老行为，避免升级后界面突变）：每台机器一排「接水」+ 一个「结算」按钮。
  - `'one'`：单个按键，标签随状态在「接水」→「结算」之间切换；开阀成功后该键立刻变「结算」，点它直接走 `openSettle`。多出水口时标签是「冷/热」→「结算·冷/结算·热」，只结开过阀的那个口。
  - 状态存内存变量 `RUNNING`（键 `goodsId:fnId`），**不落盘** —— 重启 App 后回到「接水」，想结旧账切到两键模式用「结算」（那个会自己探机器用量）。
  - `openSettle(dev, only)` 新增第二参数：`only` 传了只问这一个出水口，不串行探全部。原来无参版本保留（两键模式的「结算」不指定口）。
  - 停阀确认后（`endWaterAndSettle` 的 status≥3 分支、`openSettle` 的 `go(hit)` 分支）都 `delete RUNNING[...]` 并 `renderDevs()`，键复位回「接水」。
  - **切模式时 `resetRunning()` 清空 RUNNING**：不清的话，两键模式正在出水时切到一键，那个键直接显示「结算」，用户会以为刚才那次水没结过。
- 验证：13 个 JS 文件 `new Function()` 语法全过；worker.js 用 Blob + 动态 `import()` 验 module 语法（本机无 node）；**headless 断言 41/41 ALL-OK**（发卡控件零残留、三个动作各自发出正确请求、空名单文案、settleMode 默认/切换/高亮、一键模式按键变「结算」、只问一个口、建单用 identify、停阀后复位、多口「结算·冷」、版本三处一致）；APK 出包四件套全过（assets 15 文件逐字节一致、dex 含 `openWebActivityGrab`/`notifyLoginAccount`/`grabAccount`/`buildGrabJs`、`renderOut`/`copyPair`/`admCopyAll` 已从包内消失、badging 111/1.1.1、证书不变、管理员学号 0 命中）。
- Worker 已部署（`modified_on 2026-11-03T14:02:57Z`，etag `7d2ce351…`，四条绑定齐全），线上 `latest` = `1.1.1`/code `111`/484722/`34E36EB1…`，`min` 归零、`enforceVer=false`、`updPolicy=nag`；`GET /v1/apk` 实测 484722 字节 SHA-256 与本地一致。
- **仍待真机验证**（沿用 v1.1.0 的三条）：①青果登录页 `input#username` 在真机 WebView 的 `onPageFinished` 时序下能否稳定读到；②学号不一致时拦课表同步的提示是否清楚；③`goods/endWater` 与 `goods/shower/sync` 在真机 SN 上的真实返回。


### v1.1.0（2026-11-03）—— 取消激活码 + 饮水机结算

用户原话：「要不取消激活码吧，但是需要检验它登录的教务网账号，学习通账号的学号是否是一致的，与软件账号是否匹配。给饮水机加一个"结算功能"，不然还需要点机器上的结算按键」

- 当前 APK：`apk/xxmu-helper-v1.1.0.apk`，versionCode=**110**，484722 字节，SHA-256=`E2608941CBA487DDEBB55854EED011117917200E0B97819FC1764E2B0A441C14`。签名不变（`0e684845…`），可覆盖安装；桌面副本已交付。
- **为什么取消激活码**：旧码 = HMAC-SHA256(内置密钥 `XXMU-HELPER-GU-2026-v1`, 学号) 截断转 Base32。密钥在 APK 里，反编译就能给任意学号算码，「谁能用」实际上不可控；而且开卡要管理员一个个手输，新生一开学就是几百条。
- **新的身份判据：让学校自己证明**。青果用**学号当登录名**，所以用户在 App 内 WebView 登录教务页时填的 `input#username` 就是他的学号 —— 读回来与登记的学号比对，不一致就拒绝同步课表。比任何离线可算的码都硬，而且学校一改密码就自动失效。
- 关键设计取舍：
  - **进 App 不拦，拦在同步课表那一步**。进门前不可能已验证，卡在门前会死锁。
  - **学习通只当辅助，不拦人**。它的登录框是 `input#phone`，值可能是 11 位手机号，无法判定身份，只 `noteCxAccount` 记下来。
  - `isActivated()` 语义从「已激活」改成「已登记学号」，**名字没改** —— 为了不牵动 auth.js/app.js/about.js 里十几处调用点。
  - `activate()` 主动写 `K_STATE=''`，清掉老版本残留的 `xxmu_license`，避免旧判据复活。
  - `codeFor/verify/normalizeCode` **全部保留**（管理员发码器还在用，作为人工核对手段），只是不再参与授权。
- **Java 侧读账号的机制**（`WebActivity`）：
  - 新增 `EXTRA_GRAB`（要读值的 CSS 选择器，逗号分隔取第一个非空）与 `EXTRA_ACCOUNT`（回传读到的账号）。
  - `buildGrabJs(sel)` 生成 `document.querySelector` 探测脚本；`unquote()` 处理 evaluateJavascript 返回的 JS 字符串字面量转义。
  - **非空值必须由 Java 记住**（`lastUn`）—— 登录提交后整个 document 换掉，新页面里 `input#username` 已不存在，即时读必空。
  - `onPageFinished` 的 detect 分支改为：命中登录 URL 后 `if (grabSel != null) readPageState(true); else finishWithResult(true);`。直接 finish 会丢掉刚填的学号；`completeCapture` 同样是 `RESULT_OK`，上层照旧判登录成功，还额外拿到账号。
  - `MainActivity.openLogin()` 传 `"input#username,input#username1,input[name=username]"`；`openWebFor`（学习通）传 `"input#phone,input#uname"`。
  - `notifyLoginAccount(ok, acct)` 把账号拼进 `window.__onLoginDone(ok, acct)`；原 `notifyLoginResult(ok)` 保留为 `notifyLoginAccount(ok, '')` 的委派。
- **服务端**（`server/worker.js`，1028 行）：`handleActivate` 删掉 `lic:<id>` 开卡检查与 `codeFor` 激活码比对两道关；`handleCheck` 的 `lic:` 检查也加了 `cfg.requireGrant &&` 前缀。**`DEFAULT_CFG.requireGrant = false`，留着这个开关是为了临时限额招新时不用改客户端也不用重新发版**。保留：学号格式、fp、`blockOld`、管理员 akey 分支、`rev:` 黑名单、`bindDevice` 名额。
- **饮水机结算功能**（`web/water.js` + `web/app.js`）—— 协议是从官方 h5 的 **sourcemap** 里挖出来的，之前判断「没有远程结束接口」是错的：
  - 结束用水：`POST goods/endWater { goodsId }`（货架式；淋浴机才是 `shower/goods/remoteEnd`）。原来以为货架式没有 stop，是因为只看 `pages_waterGoods` 一个分片 —— 真逻辑在公用 mixin `src/pages/chooseShowerMachine/showerMachine/common.js`（chunk `pages_showerMachine~pages_waterGoods`，从 `app.c17a893c.js.map` 的 `sourcesContent` 里拿到）。
  - 出水状态轮询：`POST goods/shower/sync { skuId }` → `{status, amount, identify}`。`status` 1/2/4 = 继续等，**3/5 = 结束（`amount>0 && identify` 才有单）**，6 = 故障。
  - 建单：`POST order/afterPay/creating { orderNo: identify }` → `{orderId, orderStatus, payType}`；`orderStatus===2` 表示已付；`orderId` 为空就 1 秒后重试（纯轮询）。付款页 `https://h5.qiekj.com/pay/afterPay/paymentOrder/paymentOrder?id=<orderId>&pathType=1`。
  - **`identify` 不是订单号，是待建单流水号** —— 这一点搞错就会拿它当订单号去查，永远查不到。
  - 客户端实现：`WATER.endWater` → `WATER.waitDone`（默认 120 次×1s）→ 金额为 0 就提示「没产生费用」→ `WATER.createOrder`（15 次）→ 生成「去付款」按钮走 `Host.openWebFor(url,'付款',false)`。`app.js` 的 `endWaterAndSettle()` 用 `settling` 标志防重复触发（原来没有，连点会覆盖回调）。
  - 开阀成功后不再只有「知道了」：现在给「结束并结算」+「先接着，等会儿再说」两个出口，并说明不点也行（机器到量会自己停，但那样要去胖乖账单里付款）。
- 验证：worker.js 用 Edge 动态 `import()` 做 ES module 语法检查（本机没 node，`node --check` 不可用；数括号会被正则字面量误判）；APK 22 项检查全过（assets 与 web 逐字节一致、dex 含 `buildGrabJs`/`grabAccount`/`EXTRA_ACCOUNT`/`notifyLoginAccount`、aapt2 badging 110/1.1.0、apksigner 证书不变、管理员学号 0 命中）；端到端 `GET /v1/apk` 下载 484722 字节 SHA-256 一致、包内 `assets/license.js` 含 `noteKbAccount`、`about.js` 是 `1.1.0`、`water.js` 含 `goods/endWater`。
- **实测取消激活码生效**：`POST /v1/activate {id:'20261440106', code:'', ...}` → `ok:true` 并签发票据（探测设备已用 `revoke-device` 清理）。
- 线上配置已推：latest `1.1.0`/code `110`/size `484722`/sha256 `E2608941…1C14`/url `https://xxmu-auth.pages.dev/v1/apk`；min 归零；`enforceVer=false`；`updPolicy=nag`；公告未动。Worker 已部署（etag `e5bda231…`，modified `2026-11-03T13:27:21Z`）。
- **仍待真机验证**：①青果登录页读学号是否真能拿到（DOM 抓手指的是 `#username`，但真机上 `onPageFinished` 的时序要实测）；②学号不一致时拦课表同步的提示是否清楚；③`goods/endWater` 与 `goods/shower/sync` 在真机 SN 上的真实返回。
- **打开强制淘汰的顺序不可颠倒**：先让真机把 v1.1.0 装好跑通，再把 `min` 抬到 `1.1.0`/`110` 并勾 `enforceVer`。

### v1.0.0（2026-11-03）

- 当前 APK：`apk/xxmu-helper-v1.0.0.apk`，versionCode=**100**，476530 字节，SHA-256=`25949BDFBB10B6D83B36CC5630B48AA8FA59A1779934A7483B0152F81A8DA7BD`。签名不变（`0e684845…`），可覆盖安装；桌面副本已交付。
- **内置安装包托管与下载安装**（用户原话：「能不能弄内置下载链接，用我即管理员账号，有一个上传最新版的功能，我去上传」）。服务端新增三个路由：
  - `POST /v1/admin/upload?name=&ver=&code=&publish=1&base=` —— 请求体是 APK **原始字节**（不是 multipart、不是 base64）。校验：体积 ≥1024B、≤24MiB、**ZIP 魔数必须是 `PK`**（防网盘错误页存成 .apk）。`publish=1` 时顺手把 `latest` 指向 `base + '/v1/apk'` 并写入 size/sha256。
  - `GET /v1/apk` —— 公开下载，不需要任何凭证。响应带 `x-apk-sha256` / `x-apk-ver` 头。
  - `POST /v1/admin/apkdel` —— 删托管包（配置里的 url 不动）。
  - 存储用 KV 两个键：`apk:meta`（几十字节）+ `apk:blob`（文件本体，KV 单值上限 25 MiB）。**不用 R2**：要多开一个产品、多配一个绑定，R2 自定义域在国内一样要过 DNS。
  - **为什么上传要带 `base` 参数**：Worker 真实域名是 `*.workers.dev`，国内被 DNS 污染；对外是 Pages 代理，请求转到这里时 `request.url` 的 origin 已经是 workers.dev 了（代理改写不了）。拿 `url.origin` 拼下载链接会写进一个全校都打不开的地址，所以由客户端上报它实际访问的 BASE。
- **客户端内置下载安装**：`Host.downloadAndInstall(url)` 用 `Http.downloadToFile` 下到 `getCacheDir()/apk/update.apk`，再经 `ApkProvider`（`com.xxmu.helper.apkfile`，`grantUriPermissions=true`）走 `FileProvider` 式 URI 拉起系统安装器。Manifest 已声明 `REQUEST_INSTALL_PACKAGES`。另加 `Host.canInstall()` / `Host.openInstallSettings()`（Android 8+ 要用户手动授权「安装未知应用」）。
- **管理后台新增「版本」页**（原版本配置混在设置里）：选包 → 显示文件名/大小 → **按文件名自动猜版本号**（`河医大助手-v1.0.2.apk` → `1.0.2`）→ code 自动建议 `当前+1` → 上传并发布 / 仅上传不发布 / 同步下载测试 / 删除托管包。`useSelfUrl` 一键把下载链接填成 `https://xxmu-auth.pages.dev/v1/apk`。
- **公告独立成页**：`#admSeg` 从五段变六段（grant/list/dev/**ver**/**notice**/log），公告不再是版本页里的一小块。
- headless 断言 **39/39 ALL-OK**（真实 index.html DOM + 按 `@JavascriptInterface` 完整 mock 的桥）。覆盖：六段切换与互斥、版本建议、未选包拒绝上传、选包后界面变化与切段保持、版本号格式校验、上传 URL 带 base/publish、同步下载 busy 态、useSelfUrl 填值、版本保存只带版本字段、公告只带三字段、版本号三处一致。
- 服务端已部署（etag `b49bbc00…`，modified `2026-11-03T11:51:01Z`），四条绑定齐全；`/v1/config` 与 `/v1/apk` 响应字节 `has_non_ascii=False`。
- **线上配置已推**：latest `1.0.0`/code `100`/size `476530`/sha256 `25949BDF…A7BD`/url `https://xxmu-auth.pages.dev/v1/apk`；min 归零 `0.0.0`/`0`；`enforceVer=false`；`updPolicy=nag`；`qq=1097668324`；公告未动。
- 端到端实测：`GET /v1/apk` 下载 476530 字节，SHA-256 与本地**逐字节一致**，ZIP 魔数正确、含 `AndroidManifest.xml` 与 `classes.dex`（22 条目）。
- 验证四件套：assets 15 文件 MD5 mismatch=`[]`、extra=`[]`；dex 含 `uploadApk`/`downloadAndInstall`/`canInstall`/`openInstallSettings`/`onApkUpload`/`onApkPicked`/`onApkDownload`；aapt2 badging `100`/`1.0.0`；apksigner 证书仍 `0e684845…`；管理员学号包内 0 命中。
- **打开强制淘汰的顺序不可颠倒**：先让真机把 v1.0.0 装好跑通，再把 `min` 抬到 `1.0.0`/`100` 并勾 `enforceVer`。因为一旦拦人，被拦的用户只能靠自己下载新版进来。

### v0.9.15（2026-11-03）

- 当前 APK：`apk/xxmu-helper-v0.9.15.apk`，versionCode=36，464242 字节（与 0.9.12/13/14 同尺寸，只能靠 SHA-256 区分），SHA-256=`F636B7409C24DE8B475EB7A42DB43E7E53243E153D20DAE75A1886F8F1F0A313`。签名不变，可覆盖安装；桌面副本已交付。
- **修学习通「抓取失败 / HTTP 405」**（用户报障：「学习通这里有问题」）。根因不在学习通，在本项目的 `Http.java`：
  - 旧代码 `if (body != null) c.setDoOutput(true);`，而 **`HttpURLConnection` 只要调了 `setDoOutput(true)` 就把请求方法静默改成 POST**，即使 `setRequestMethod("GET")` 写在它前面也一样。
  - JS 侧传的 body 是**空字符串 `''` 不是 `null`**（`chaoxing.js:82` 的 `XXMU.netCk(url,'GET','','','',HOST,referer)`），所以每一次「GET」实际发出去的都是 POST → 学习通对 POST 一律 405。
  - 实测对照（JDK17 打真端点）：`setDoOutput(true)+GET → 实际 POST → 405`；`不调 setDoOutput+GET → 实际 GET → 200`。curl 交叉验证：`/mycourse/backclazzdata` GET 200 / POST 405，`/visit/stucoursemiddle` GET 302 / POST 405。
  - 修法（`Http.java:88-90`）：
    ```java
    boolean withBody = body != null
            && (body.length() > 0 || "POST".equals(m) || "PUT".equals(m))
            && !"GET".equals(m) && !"HEAD".equals(m);
    ```
    GET/HEAD 一律不碰 `setDoOutput`；POST/PUT 即使体为空也照样能发（`water.js` 的 `kv({})` 会给出空体，靠 `"POST".equals(m)` 兜住）。方法名先 `method.toUpperCase(Locale.ROOT)`。
  - **连带修好一处静默故障**：`auth.js:107` 的 `getJson()` 也是 `'GET'` + 空体 → `/v1/admin/list`、`/v1/admin/audit` 等所有 GET 管理接口此前实际都在发 POST，全靠 Worker 不校验方法才侥幸返回。修好后回归正常。
  - 回归验证（用真 `Http.java` 打真端点）：`GET body="" → 200`（两个端点），`POST body="" → 405`（POST 分支未被破坏，符合预期）。
- 验证：assets MD5 一致（15 文件，mismatch=[]）、包内 `setDoOutput`/`httpFetchCkAsync` 符号在、`about.js` 里 `APP_VERSION='0.9.15'`、aapt2 badging 36/0.9.15、apksigner 通过、管理员学号 0 命中。
- **服务端无改动，本次不需要部署 Worker**（修的是客户端 `Http.java`）。

### v0.9.14（2026-11-03）

- 当前 APK：`apk/xxmu-helper-v0.9.14.apk`，versionCode=35，464242 字节（与 v0.9.12/v0.9.13 同尺寸，只能靠 SHA-256 区分），SHA-256=`B00069F20CCD97656101CD4B486868DDE9DCA973F2230AF51DFB267C158BFF96`。签名不变，可覆盖安装；桌面副本已交付。
- **Worker 已部署，线上配置已同步**（2026-11-03）。令牌与部署流程见下节。
- **公告与更新说明彻底拆开**（用户原话：「我要的公告功能是我自己有想说的话发给用户，而不是更新公告」）。新增 `publishNotice()` 与 `#cfgNoticePublish`「发布公告给所有用户」，只提交 `{notice, noticeTitle, noticeAt}` 三个字段；`saveCfg()` 不再读取也不再发送 `notice/noticeTitle`，所以保存版本配置绝不会顺带发公告或改公告。发布后有独立 `#noticeMsg` 反馈（含服务端回读的发布时间），撤回按钮的反馈也从 `cfgMsg` 改到 `noticeMsg`。
- 最低版本号误报修好：`parseMinCode` 返回 `{code, version}` 对象（与 Worker `blockOld` 的数据结构一致），`0.9.14` 这种版本号字符串不再被 `Number.isFinite` 判成非法；非法输入返回 `null` 显式报错；保存时提交完整 `min:{code,version}`，成功提示回读 `res.cfg.min`。
- 验证：headless Edge 加载**真实 index.html DOM** + mock 异步桥（`httpFetchAsync(k,url,m,b,ct,hs,mp)`，回调 `window.__onHttpDone(k,'200|'+latin1)`）跑 13 条断言 ALL-OK —— 公告请求只含三个公告字段、不含 `min`/`latest`；版本请求只含版本字段、不含 `notice`/`noticeAt`；`0.9.x` 仍被拦下。
- assets MD5 一致（15 文件）、包内 `cfgNoticePublish`/`publishNotice`/`parseMinCode` 对象版符号齐、管理员学号 0 命中、aapt2 badging 35/0.9.14、apksigner 通过。
- **服务端 Worker 的 ASCII 兼容改动（v0.9.13 起的 `json()` 转 `\\uXXXX`）已部署**（2026-11-03）。`https://xxmu-auth.pages.dev/v1/config` 返回字节 `has_non_ascii=False`，中文以 `\uXXXX` 形式下发，v0.9.7 这类直接 `JSON.parse(body)` 的旧包也能正确显示。

### 部署 Worker（有令牌时怎么做）

```bash
python tools/deploy_worker.py
```

- 令牌来源：环境变量 `CLOUDFLARE_API_TOKEN`，或文件 `D:\_cftoken.txt`（**不要写进项目任何文件**）。
- 必须 multipart：metadata 里 `main_module=worker.js` + `compatibility_date=2024-11-01` + `bindings=[{type:kv_namespace,name:AUTH,namespace_id:02669ca1cef04c5e930d4e3bb2d0d780}]`，源码 part 的 content-type 用 `application/javascript+module`。裸 PUT 会被当 classic worker，报 10021 `Unexpected token 'export'`。
- 上传 metadata 只写 KV 绑定，**三个 secret（ADMIN_KEY / SECRET / SIGN_KEY）由 Cloudflare 自动保留**；脚本会回读 `/bindings` 校验四条都在，缺一条就报错退出。
- Pages 薄代理 `server/pages/dist/_worker.js` 转发到 `https://xxmu-auth.yg-xxmu.workers.dev`，**Worker 重部署不需要动它**。
- 用 `urllib` 直接 POST `https://xxmu-auth.pages.dev/v1/admin/*` 会拿到 `HTTP 403 error code: 1010` —— 这是 Cloudflare 的浏览器签名校验拦 Python-urllib 默认 UA，加一个浏览器 `User-Agent` 头即可。PowerShell 的 `Invoke-WebRequest` 自带 UA，不受影响。
- 管理接口的口令放 **`X-Admin-Key` 头**，不是 body 里的 `key`（body 放 `{key:...}` 会返回「管理员口令不正确」）。
- `POST /v1/admin/config` 收**裸 cfg body**（`{"latest":{...},"min":{...}}`），传 `{"cfg":{...}}` 会被 `Object.assign` 静默回落成旧值。

### 线上发布（v1.1.2 起走 KV 直写，不再需要 ADMIN_KEY）

`python tools/publish_apk.py --apk apk/xxmu-helper-vX.Y.Z.apk --notes-file apk/vX.Y.Z.notes.txt`

- 为什么不用 `/v1/admin/upload`：那条路由要 `X-Admin-Key`，而 `ADMIN_KEY` 是 `deploy_server.ps1` 部署时随机生成、只写进 `server/DEPLOY-OUT.txt` 的 secret，本机那份已经没了。但 **KV 可以直接用 API Token 写** —— 同一个 `AUTH` 命名空间，写入的 `apk:blob` / `apk:meta` / `cfg` 三个键与 `/v1/admin/upload` 写下的完全等价（键名见 `server/worker.js:342-343` 与 `:435`）。
- 令牌来源：环境变量 `CLOUDFLARE_API_TOKEN` → 文件 `D:\_cftoken.txt`（当前长度 53，前缀 `cfut_1`，**能读写 KV，但调 `/v1/admin/*` 会被 403**，因为那是 Worker 侧的 secret 校验，与 CF API Token 无关）。
- 脚本四步：写 `apk:blob` → 写 `apk:meta` → **回读 `apk:blob` 用 SHA-256 比对**（防截断）→ 读 `cfg` 改 `latest` 再写回（`min.code` 保持 0，不强制升级）。`--no-publish` 只存不切。
- **自检那步的坑**：Cloudflare 边缘会 403 掉 python-urllib 的默认 UA（`error code: 1010`），自检必须带浏览器 UA，否则会误以为发布失败（HANDOFF 上一段记的是同一个坑，只是当时撞在 admin 路由上）。
- **KV 的 REST 读接口对文本值返回的是原始字节**（`content-type: application/octet-stream`），`buf.toString('utf8')` 直接就是原文 —— **不是**数字数组 JSON。
  v1.1.2 时记过一句「是 JSON 编码的字符串（数字数组形式）」，那是当时脚本自己多套了一层 `JSON.parse` 造成的误判：
  对着真正的原始字节再 `JSON.parse` 会把 `idx` 读成 `"       "`（一堆空格），看起来像「索引是空的」。**不要对返回值再做 JSON 解包。**
  实测体积：`cfg` 2838 字节、`idx` 407 字节（8 条学号）。

### 线上配置现状（2026-11-04 v1.1.14 发布后）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.14` / code `1114` / size `550377` / sha256 `27587e2f…d4d2` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.14.apk` / 550377 / `27587e2f…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | v1.1.8 更新说明 / 已写入（v1.1.9 起说明改放 `latest.notes`） |

- 三处 hash 一致：本地 `apk/xxmu-helper-v1.1.14.apk` / 桌面 `河医大助手-v1.1.14.apk` / 线上 `GET /v1/apk`（550377 字节，`Range: bytes=0-99` 回 `206` + `x-apk-ver: 1.1.14`）。
- v1.1.14 **只改了前端**，`worker.js` 与 Pages 都没动，不需要重新部署。
- 回归实测：`/v1/admin/list` → `count:10, revokedCount:0`；`/v1/admin/photos` → `count:0`；`/v1/config` → `latest=1.1.14/1114/550377`、`min=1.1.1/0`、`updPolicy=nag`、`qq=1097668324`。
- **`publish_apk.py` 现在带网络重试**（`_open_retry`，退避 2/4/6 秒，只重试网络层异常）。学校这条网到 `api.cloudflare.com` 的 TLS 握手会偶发被掐，报 `handshake operation timed out` 或 `EOF occurred in violation of protocol`，而同一时刻 curl 打同一域名 0.8 秒就通 —— 别误判成令牌失效或封禁。

### 线上配置现状（2026-11-04 v1.1.13 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.13` / code `1113` / size `550377` / sha256 `56053cc1…5703` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.13.apk` / 550377 / `56053cc1…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | v1.1.8 更新说明 / 已写入（v1.1.9 起说明改放 `latest.notes`） |

- 三处 hash 一致：本地 `apk/xxmu-helper-v1.1.13.apk` / 桌面 `河医大助手-v1.1.13.apk` / 线上 `GET /v1/apk`（550377 字节，`Range: bytes=0-99` 回 `206` + `x-apk-ver: 1.1.13`）。
- v1.1.13 **只改了前端**，`worker.js` 与 Pages 都没动，不需要重新部署。
- **`ADMIN_KEY` 当前明文在 `server/DEPLOY-OUT.txt`**（v1.1.12 期间重新生成过一次，旧口令已作废）。写入方式见第 9 节坑 31 —— `$key | wrangler secret put` 会带尾随换行，必须走 `cmd /c "type 文件 | wrangler secret put"`。
- 名单硬上限：`IDX_CAP = 5000`（到顶后新学号不入库但**激活仍成功**，`overflow` 计数进返回体）。
- 限流现状：上传图 3 张/10 分钟（按 fp）、留言 1 条/分钟 + 5 条/天（按 fp）、`/v1/activate` 200 次/10 分钟（按 IP）、`/v1/check` 200 次/6 分钟（按 IP）、管理接口 300 次/10 分钟、404 路由 30 次/10 分钟、`/v1/photo` 回源 120 次/分钟（均按 IP）。

### 线上配置现状（2026-11-04 v1.1.12 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.12` / code `1112` / size `546281` / sha256 `71d153ad…dec2` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.12.apk` / 546281 / `71d153ad…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | v1.1.12 更新说明（5 条） / 已写入 |
- **部署 Pages 必须显式带 `CLOUDFLARE_ACCOUNT_ID`**：
  ```powershell
  $env:CLOUDFLARE_API_TOKEN = (Get-Content D:\_cftoken.txt -Raw).Trim()
  $env:CLOUDFLARE_ACCOUNT_ID  = "ebb7ecfd16008b9e3696ad5b4bc930d7"
  npx.cmd --yes wrangler@3 pages deploy dist --project-name=xxmu-auth --branch=main --commit-dirty=true
  ```
  只设 token 会报 `A request to the Cloudflare API (/memberships) failed. Authentication error [code: 10000]`。

### 线上配置现状（2026-11-04 v1.1.11 发布后，历史）

### 线上配置现状（2026-11-04 v1.1.9 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.9` / code `119` / size `538029` / sha256 `e792d4f3…87b5` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.9.apk` / 538029 / `e792d4f3…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | v1.1.9 更新说明（14 条） / 已写入 |

- 三处 hash 一致：本地 `apk/xxmu-helper-v1.1.9.apk` / 桌面 `河医大助手-v1.1.9.apk` / 线上 `GET /v1/apk`（538029 字节）。
- `worker.js` 已重新部署（**102611 字节**），Pages 也已重新部署（`https://472fd4d1.xxmu-auth.pages.dev`）。**每次重新部署 Pages 之后必须打一次 `GET /v1/_diag`**，期望 `{"ok":true,"ver":3,"viaProxy":true,"ipForwarded":true,"ipLooksInternal":false}` —— 不是 true 就说明 `_worker.js` 的 `x-xxmu-ip` 转发被弄丢了，限流会退回「全校共享一个桶」。
- **部署 Pages 必须显式带 `CLOUDFLARE_ACCOUNT_ID`**：
  ```powershell
  $env:CLOUDFLARE_API_TOKEN = (Get-Content D:\_cftoken.txt -Raw).Trim()
  $env:CLOUDFLARE_ACCOUNT_ID  = "ebb7ecfd16008b9e3696ad5b4bc930d7"
  npx.cmd --yes wrangler@3 pages deploy dist --project-name=xxmu-auth --branch=main --commit-dirty=true
  ```
  只设 token 会报 `A request to the Cloudflare API (/memberships) failed. Authentication error [code: 10000]`。
- 名单硬上限：`IDX_CAP = 5000`（到顶后新学号不入库但**激活仍成功**，`overflow` 计数进返回体）。
- 限流现状：上传图 3 张/10 分钟（按 fp）、留言 1 条/分钟 + 5 条/天（按 fp）、`/v1/activate` 200 次/10 分钟（按 IP）、`/v1/check` 200 次/6 分钟（按 IP）、管理接口 300 次/10 分钟、404 路由 30 次/10 分钟（均按 IP）。

### 线上配置现状（2026-11-04 v1.1.8 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.8` / code `118` / size `538029` / sha256 `86b49be6…fe79` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.8.apk` / 538029 / `86b49be6…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | v1.1.8 更新说明 / 已写入（`noticeAt` 用 `int(time.time())`） |

- 三处 hash 一致：本地 `apk/xxmu-helper-v1.1.8.apk` / 桌面 `河医大助手-v1.1.8.apk` / 线上 `GET /v1/apk`（538029 字节）。
- `worker.js` 已重新部署（95940 字节），Pages 也已重新部署。**每次重新部署 Pages 之后必须打一次 `GET /v1/_diag`**，期望 `{"ok":true,"ver":3,"viaProxy":true,"ipForwarded":true,"ipLooksInternal":false}` —— 不是 true 就说明 `_worker.js` 的 `x-xxmu-ip` 转发被弄丢了，限流会退回「全校共享一个桶」。
- **改公告的小技巧**：`/v1/config` 有 `edgeCache(req, 60, …)` + `getCfg` 的 60 秒内存缓存，线上改完 `cfg` 要等最多 60 秒才生效。改完 `notice` 后立刻查会看到旧值，别误判成「没写进去」。
- 限流现状：上传图 3 张/10 分钟（按 fp）、留言 1 条/分钟 + 5 条/天（按 fp）、`/v1/activate` 200 次/10 分钟（按 IP）、`/v1/check` 200 次/6 分钟（按 IP）。
- **`min` 仍压着不抬**：v1.1.1 那批用户里有人正卡在「学号对不上」页面，抬 `min.code` 会让他们的旧版本直接被拦；等确认新版本在真机跑通、提示文案没问题了再抬。

### 线上配置现状（2026-11-04 v1.1.7 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.7` / code `117` / size `517549` / sha256 `261d1d8a…a523` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.7.apk` / 517549 / `261d1d8a…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | 空 / `0` |

- 三处 hash 一致：本地 `apk/xxmu-helper-v1.1.7.apk` / 桌面 `河医大助手-v1.1.7.apk` / 线上 `GET /v1/apk`。
- `worker.js` 已重新部署（80623 字节），Pages 也已重新部署。**每次重新部署 Pages 之后必须打一次 `GET /v1/_diag`**，期望 `{"ok":true,"ver":3,"viaProxy":true,"ipForwarded":true,"ipLooksInternal":false}` —— 不是 true 就说明 `_worker.js` 的 `x-xxmu-ip` 转发被弄丢了，限流会退回「全校共享一个桶」。
- 限流现状：上传图 3 张/10 分钟（按 fp）、留言 1 条/分钟 + 5 条/天（按 fp）、`/v1/activate` 200 次/10 分钟（按 IP）、`/v1/check` 200 次/6 分钟（按 IP）。
- **`min` 仍压着不抬**：v1.1.1 那批用户里有人正卡在「学号对不上」页面，抬 `min.code` 会让他们的旧版本直接被拦；等确认新版本在真机跑通、提示文案没问题了再抬。

### 线上配置现状（2026-11-03 v1.1.4 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.4` / code `114` / size `492914` / sha256 `97156cae…be9b` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.4.apk` / 492914 / `97156cae…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | 空 / `0` |

- 发布后实测：`GET /v1/config` 返回 `latest=1.1.4/114/492914`；`GET /v1/apk` 下载 492914 字节、SHA-256 一致；`Range` 四态验证通过（`0-0`→206/`0-0/492914`、`100-199`→206/100 字节、越界→416/`*/492914`、无头→200 全量）。
- `cache-control` 现为 **`no-cache`**（曾短暂是 `public, max-age=86400`，已撤）。
- **`min` 仍压着不抬**：v1.1.1 那批用户里有人正卡在「学号对不上」页面，抬 `min.code` 会让他们的旧版本直接被拦；等确认新版本在真机跑通、提示文案没问题了再抬。

### 线上配置现状（2026-11-03 v1.1.3 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.3` / code `113` / size `488818` / sha256 `5702E2DF…B7DC6` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.3.apk` / 488818 / `5702e2df…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | 空 / `0` |

- 发布后实测：`GET https://xxmu-auth.pages.dev/v1/config` 返回 `latest=1.1.3/113/488818`，`GET /v1/apk` 下载回来 488818 字节、SHA-256 与本地一致。
- **`min` 仍压着不抬**：v1.1.1 那批用户里有人正卡在「学号对不上」页面，抬 `min.code` 会让他们的旧版本直接被拦；等确认 v1.1.3 在真机跑通、提示文案没问题了再抬。

### 线上配置现状（2026-11-03 v1.1.2 发布后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.2` / code `112` / size `488818` / sha256 `2E01793F…C660` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.2.apk` / 488818 / `2e01793f…` |
| `min` | version `1.1.1` / code `0`（**仍未强制**，`enforceVer=true` 但 `min.code=0` 时是空转） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | 空 / `0` |

- 发布后实测：`GET https://xxmu-auth.pages.dev/v1/config` 返回 `latest=1.1.2/112/488818`，`GET /v1/apk` 下载回来 488818 字节、SHA-256 与本地一致 —— 学生点「去下载」拿到的就是修好的包。
- **`min` 仍压着不抬**：v1.1.1 那批用户里有人正卡在「学号对不上」页面，把 `min.code` 抬到 112 会让他们的旧版本直接被拦；等确认 v1.1.2 在真机跑通、错误提示文案没问题了再抬。

### 线上配置现状（2026-11-03 v1.1.1 部署后，历史）

| 字段 | 值 |
|---|---|
| `latest` | version `1.1.1` / code `111` / size `484722` / sha256 `34E36EB1…B794` / url `https://xxmu-auth.pages.dev/v1/apk` |
| `apk`（托管包元信息） | `xxmu-helper-v1.1.1.apk` / 484722 / `34e36eb1…` |
| `min` | version `0.0.0` / code `0` |
| `enforceVer` | **false**（不强制淘汰） |
| `requireGrant` | 未写入（= 取 `DEFAULT_CFG` 的 false，即不需要开卡） |
| `updPolicy` | `nag` |
| `qq` | `1097668324` |
| `maxDev` | `3` |
| `notice` / `noticeAt` | 空 / `0` |

- 注意 `requireGrant` 在 `/v1/config` 响应里**不出现** —— `handleConfig` 只透出部分字段；`handleSetCfg` 是「传了才改」，所以它一直是代码里的 `DEFAULT_CFG.requireGrant = false`。想临时恢复白名单模式，`POST /v1/admin/config {requireGrant:true}` 即可，不用改客户端。
- 部署前线上处于**危险状态**：`min.version` 已是 `0.9.14` 而 `latest.code` 还是 `33`，且 `enforceVer=true` → 0.9.14 以下的客户端全被拦。已把 `min` 归零、`enforceVer` 关闭。**开启顺序不可颠倒**：先让用户在真机把 v1.1.1 跑通，再把 `min` 抬到 `1.1.1`/`111` 并勾 `enforceVer`。
- 已实测：`ver=0.9.0 / 0.9.12 / 0.9.13` 三个版本调 `/v1/activate` 均返回 `ok:true`；管理员学号带 `akey` 激活返回 `role:admin`；`/v1/check` 与 `/v1/config` 响应字节全 ASCII。v1.1.0 起空 `code` 也能开（`20261440106` 实测 `ok:true`）。

### v0.9.13（2026-11-03）

- 当前 APK：`apk/xxmu-helper-v0.9.13.apk`，versionCode=34，464242 字节，SHA-256=`B5CD95753DD78E7F0811CFA0F46051787EC83ABAD1AFEA0C67C2172C6FF90F5A`。签名不变，可覆盖安装；桌面副本已交付。
- 修复 v0.9.7 中文更新说明乱码：旧包 `getJson` 直接 `JSON.parse(r.body)`。`server/worker.js` 的 `json()` 已把非 ASCII 转为 `\\uXXXX`，**此服务端改动尚未部署**：本机未找到 `CLOUDFLARE_API_TOKEN`，Wrangler 配置目录也为空。恢复令牌后用同一 multipart REST 上传即可，Pages 代理无需改动。
- 最低版本框不再 `parseInt('0.9.13')` 静默变成 0：`parseMinCode` 接受版本号或整数代码，非法输入显式报错，保存结果直接回读 `res.cfg.min.code/enforceVer`。线上真实管理接口已验证 min.code 能存 33 再恢复 0；保存时线上 `enforceVer=true`，未改动它。
- 饮水机不是动态二维码问题：SN 固定，本地存 goodsId/skuId。新增显示 SN、手输固定机器码、设备「重新绑定」（只读信息，绝不自动重发 unlock）。`goods/water/unlock` 改走官方 multipart，空 token 字段保留、uid 取 d.id、phoneBrand 映射官方小写品牌；错误显示接口与真实 code，不再武断提示平台改版。真机开阀仍需实测。
- 验证：隔离回归 ALL-OK 5、三个 JS `node --check`、assets MD5 一致、包内修复符号、管理员学号 0 命中、aapt2 badging 34/0.9.13、apksigner 通过。线上 latest 配置仍为 0.9.12/code33，**不提前强制升级**。

### v0.9.12（2026-11-03）

- 当前 APK：`apk/xxmu-helper-v0.9.12.apk`，versionCode=33，464242 字节，SHA-256=`8A998D922B6EC61CA69FDDA8836643EF52F4E8CDEDBBE5766E70F5B5008F136F`。沿用 xxmu.jks，能覆盖安装旧版。
- 管理后台可「解封（重新启用）」：新路由 `POST /v1/admin/unrevoke`，只删 `rev:<id>`，**保留** `lic:<id>` 和备注；停用当时清空过设备，解封后用原码重新激活即可。另有 `POST /v1/admin/revoke-device` 踢单台设备，按 fp 前缀匹配。
- 我的页与关于页新增「退出本机账号」。只退出软件激活账号，不会收回或停用服务端账号；退出前弹确认，清完回到激活页。Host 新增 `clearAccount()` / `removePref(key)`：清 SharedPreferences（保留 `xxmu_fp`）、删除课表与作业缓存 JSON，配合 `clearCookies()` 清教务/学习通登录。**设备指纹必须保留**，否则每换一次账号就白占一台设备名额。
- 原来关于页的「退出登录」改名「退出教务登录」，避免与软件账号退出混淆。
- 部署：Worker 用 multipart 上传（`metadata={"main_module":"worker.js","compatibility_date":"2024-11-01","bindings":[{"type":"kv_namespace","name":"AUTH","namespace_id":"02669ca1cef04c5e930d4e3bb2d0d780"}]}` + `worker.js` part）；直接 PUT 源码会被当 classic worker，报 `Unexpected token 'export'`。Pages 薄代理无改动，无需重部署。
- 线上 cfg 已推 latest=0.9.12/code 33，**min 仍 0.0.0/0，enforceVer=false**（不强制淘汰）。`POST /v1/admin/config` 只收裸 cfg body。
- 已验证：服务端 35/35、退出账号前端 42/42、headless DOM ALL-OK、javac/d8/aapt2/apksigner 通过、15 个 assets 与 web/ MD5 一致、dex 中三个新/异步桥方法存在、包内无管理员学号。真机退出与解封仍需覆盖安装后实际点一遍。

- v0.2.6 三页终验通过：课表周次/课程落位/今天高亮正常；作业与考试倒计时正常。
- **v0.6.0（当前）**：全站 UI 重做（顶部品牌区 + 5 个带图标的 Tab + 卡片式布局，去掉原来那条压掉整行的深色通栏标题），并接管 Android 返回键（浮层开着先关浮层、非课表页先回课表、只有真在首页才退出）。140410 字节已签名，assets 11 个文件与 web/ 逐字节一致。
- v0.5.0：课表 / 学习（按紧急度·按课程 + 作业·考试筛选）/ WIKI / 校园事务（胖乖生活饮水机 + 空教室 + 教务·学习通入口）/ 我的 / 关于，6 个页面 5 个底部 Tab。136314 字节。
  - 已验证：JS `node --check` 全过；`_test_water.js` 单测 26/26 PASS；headless Edge 实测学习页（待完成 8 / 按课程 5 个分组）、空教室（周二上午空 13/14、整周全空 3 间）、WIKI、校园事务四个页面渲染正常；APK 内 assets 与 dex 符号逐项核对。
  - **未验证**：真机（本机 `adb devices` 为空、无模拟器）；胖乖生活真实 token 与 unlock 响应。
  - 历史版本 v0.4.0 / v0.4.1 有启动闪退（`setAcceptThirdPartyCookies(null,...)` NPE），勿分发；v0.4.4 修闪退。
- 坑 1：`web/` 与 `android/assets/` 是双份，现在由 `build_apk.py` 扫目录自动同步；手工 `cp` 漏文件会白屏。打包后建议核对 zip 内 assets 数量 —— v0.5.0 首包就踩了：写死的 8 文件清单漏掉 jsQR/wiki/water。
- 坑 2：`data.js` / `homework.js` 是单行 JSON 注入（`file://` 下 fetch 被禁，只能用 script 注入）。不要改成 fetch。
- 坑 3：青果验证码必须两步会话，任何中间重访首页都会让验证码作废。
- 坑 4：学习通第 3 步缺 Referer 就 3004。
- 坑 5：`secrets.json`（学号密码）**未入库**，`sync.py` 需命令行传参：`python core/sync.py 学号 密码 [验证码]`，验证码图落 `data/captcha.jpg`，会话 pickle 在 `data/st.pkl`（Windows 无 `/tmp`）。
- 坑 6：`data/session.json` 时效短，青果会话过期需重登。
- 坑 7：**改含中文的文件只能用 write/edit 工具**。PowerShell 5.1 的 `Set-Content` / `Out-File` 会按 ANSI 重写，把 UTF-8 中文变成乱码 —— 已踩两次：`AndroidManifest.xml` 报 `not well-formed (invalid token)`、`web/about.js` 出现不可逆无效字节。恢复办法：从上一版 APK 里 `zipfile.ZipFile(...).read('assets/xxx.js')` 抽完好副本。
- 坑 8：`userapi.qiekj.com` 会按出口 IP 返回 405 阿里云 WAF 页，同一请求不同时间不同工具结果不同 —— **不要用在线探测判断接口存在性**，以 h5 生产源码为准。
- 坑 9：`node` 不在 PATH，PowerShell 里先 `$env:Path += ';C:\Program Files\nodejs'`；`Start-Process -FilePath cmd.exe -ArgumentList "/c", $长命令` 传含空格参数会报「文件名、目录名或卷标语法不正确」，改用 `-RedirectStandardOutput` 落盘再读。
- 坑 10：headless Edge 的 `--window-size` 不被采纳（innerWidth 恒 492），截图裁切是工具假象。判断布局溢出要用 `--dump-dom` 测 `document.body.scrollWidth` + 逐个 `getBoundingClientRect().right > innerWidth`。
- App 未做后台定时同步：所有数据靠外部脚本刷新 + 外部文件优先机制。
