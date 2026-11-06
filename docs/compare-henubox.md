# HENUBox（河小盒）vs 河医大助手 —— 第二次对比（2026-11-06 复核版）

> 对象：<https://github.com/moonquake25104/HENUBox>
> 我方：<https://github.com/cyanheee/xxmu-helper>（v1.1.37，已上线）
> 第一版写于 2026-11-05，用 GitHub 元信息 + 750 条文件树 + 三个核心源文件。
> 这一版重做了取证：文件树重新递归拉了一遍（**591 个 blob，不是 750**）、读了 20 个源文件的实际内容、
> 拉了两边的完整仓库指标、现场重测了本校教务、并把「本机 v1.1.35~v1.1.37 已补掉的功能」从差距里划掉。
> 结论跟上一版不同：**它不是「一个更强版本的同类项目」，它是一个被别人写好骨架、当天灌进河大适配层的 5 小时作品。**
> 猜的地方都标「推断」，能引原文的地方都贴原文。

---

## 〇、先把上一版的事实错误改掉

| 上一版写的 | 实测 | 影响 |
|---|---|---|
| 750 个文件 | **591 个 blob / 4,836,165 字节** | 2139 KB 是 GitHub 的仓库体积口径，不是文件数 |
| 有 15 个 DeviceTest | **13 个** | 数量级不影响结论 |
| XXMU 未登录返回 517 字节 stub | 现为 **547 字节**（md5 `77e5912c5c3a2ce6dd3351c3c7255ed2`） | 机制结论不变，且更硬（见第七节） |
| 「待办 / 专注计时 / 课程提醒 / 电费」是我方缺口 | **已全部补上**：待办 v1.1.22、专注 v1.1.26、课程提醒 v1.1.27（v1.1.35 修死功能）、空调度数 v1.1.30~v1.1.37 | 上一版列的四条差距里，三条已经关掉 |
| 「基于 Kairos 源码发展而来」 | 成立，而且比这句更极端 | 见第二节 |
| 测试对比写「12 套离线断言」 | 现为 **15 套**（新增 test_elec / test_reminder / test_grab 纳入常态） | 数量仍远少于它的 65 个 `_test.go` + 13 个 DeviceTest |

---

## 一、两个仓库的客观量（2026-11-06 实测）

| 项 | HENUBox | 河医大助手 |
|---|---|---|
| 建仓 | 2026-11-02 06:36 | 2026-11-04 23:08 |
| 最后一次 push | **2026-11-02 11:20（此后 4 天零提交）** | 2026-11-06 12:17 |
| 提交数 | **9 个，全部在 11-02 那天 06:33–11:20 的 5 小时内** | 24 个，跨 11-05 → 11-06 两天 |
| 文件 / 字节 | 591 / 4,836,165 | 仓库 3262 KB（含 apk、软著源码合集） |
| 语言 | Go 171、Java 82、TS 72、TSX 68、Kotlin 35、SQL 22、XML 23 | JS（无框架）为主 + Java 壳 |
| star / fork / watcher / open issue | 10 / 0 / 0 / 0 | 1 / 0 / — / 0 |
| Release | **1 个：v0.1.1，APK 9,897,545 字节（9.44 MB）** | v1.1.37，APK **599,857 字节**（0.57 MB），线上 `/v1/apk` 就是它 |
| 许可证 | MIT（保留 Kairos 版权） | AGPL-3.0 |
| 真机测试 | 13 个 `*DeviceTest.java` + 65 个 `_test.go` | **0 个** instrumentation 测试；15 套离线 JS 断言 |
| 我方代码量 | — | web 21 个文件 22,076 行 / 864 KB；tools 8,699 行 |

这张表里最该被看见的一列不是 star，是**「9 个提交 / 5 小时 / 4 天没动」**和**「24 个提交 / 两天 / 今天还在改」**。

---

## 二、最重要的新发现：那 591 个文件不是它写的

它 9 个提交的时间戳是连在一起的：

```
4e3e0a3  06:33  Initial commit: HENUBox
8bdf836  07:40  Add GitHub release update checker
cb83d3d  07:41  Update README for release maintenance
bfbc805  08:56  Harden release URL validation and release build
cc52719  09:30  Release 0.1.1
b645d5d  11:01  Rewrite README around app features
6f5d18d  11:14  Add app screenshots to README
3b38d6c  11:17  Add screenshot usage notice
f6c7ea8  11:20  Use a single aligned screenshot preview
```

**首个提交叫「Initial commit」但一次性进来 591 个文件、17 万行 Go/TS/Java。** 这不是从零写的，是把一个现成仓库整体搬进来。

上游是 `LogicShao/Kairos`（它的 LICENSE 与 THIRD_PARTY_NOTICES 都写了）：

| Kairos 实测 | 值 |
|---|---|
| 描述 | 面向学生的跨平台本地化学业时间管理工具：专注计时、待办、课程表、考试倒计时、集成日历、WebDAV 同步 |
| 建仓 / 最后 push | 2026-06-13 / 2026-10-23 |
| star / size | 0 / 6025 KB |
| 语言 / 许可 | Go / MIT |
| 最近提交 | `3059a05 feat(ui)`、`e93f0c1 fix(security) 升级 Go 1.27.3 阻断 eMudhra 中间 CA`、`1fe6214 feat(schedule) 课前提醒与集成日历周视图` |
| 证据链 | HENUBox 的 `termphase.go` 文件头写着「ports the Rust term-phase logic (src-tauri/src/term_phase.rs)」——这是 Tauri 桌面项目的路径，河大一个 Android 工具不可能有这个 |

**推断（明确标为推断）**：HENUBox 那套「Go 后端 + Capacitor + React + 65 个 Go 测试 + 13 个 DeviceTest」的工程骨架来自 Kairos；它自己 4 天里真正写的是**河大适配层**——`henu/`（教务解析）、`classroom/`（空闲教室）、`xique/`（青果桥接）、`electricity/WanliData`、`guide-parser`（河大官网链接表）。这个判断可以和「9 个提交」互相印证，但我没有它的 git 历史原件，所以标为推断而不是结论。

**这一条改变了对它的整体评价**：它的工程质量值得学，但那是**Kairos 作者的工程质量**，不是一个人的 5 小时能达成的；拿它的 591 个文件去压一个从 `aapt2` 命令行开始手搓的项目，比的不是同一个东西。

---

## 三、它真正领先我的地方：不是功能，是「拒绝出错」的写法

功能可以补，写法难补。下面五条是我读完源码后真心认输的，每条都带原文。

### 1. 把「不知道」做成了类型，而不是一个 if

`App/server/internal/domain/classroom/parser.go`：

```go
// Status is the only production classification. The upstream page cannot
// reliably distinguish course/conflict/temporary causes, so every non-free
// value is OCCUPIED and every untrusted cell is UNKNOWN.
// The parser never turns an issue into FREE.
type Status string
const ( StatusFree = "FREE"; StatusOccupied = "OCCUPIED"; StatusUnknown = "UNKNOWN" )

type Issue struct{ Code, Room, Period, Weekday }
```

配合 `ClassroomService.java` 头注释的四条不变量：

> unknown is never free；results are only published after the connection generation and subject fingerprint are re-verified；cached entries are bound to the generation, term and query scope they were fetched for；**a failed refresh serves the same-scope cache as STALE with a safe reason, never another building's data**。

最后那句正好是我 v1.1.36 干的事（先贴上次度数、失败就保留旧数字），但我是在 JS 里用 `if` 和注释守住的，它是**用类型和缓存键守住的**。差别在于：我改代码时可能忘，它改代码时编译不过。

**我的对应短板**：`web/app.js` 的作业状态是一串字符串 `'done'/'notstart'/''`，靠 `w._open` 布尔推；`--` 与 `0` 的区别是我 v1.1.37 才补的（还为此单独写了 4 条测试）。这不是风格问题，是我确实会犯。

### 2. 结构问题单独收容，不混进数据

```go
STRUCTURAL_CODES = { DUPLICATE_PERIOD_ROW, UNEXPECTED_MERGE, UNEXPECTED_ROW_WIDTH,
                     MISSING_PERIOD, INVALID_SEATS, INVALID_WEEK }
```

解析出问题时不吞、不猜，记进 `issues[]` 并让 UI 决定怎么显示。我的解析器（`chaoxing.js` / `parsekb`）遇到不认识的行是**跳过**——跳过就是静默丢数据，这在 v1.1.9 已经咬过我一次（两位数被 `\d{1,2}` 吃掉）。

### 3. 解析器和网络层物理分离

`parser.go` 文件头第一句：「It is intentionally pure: raw bytes in, DTO out; no HTTP, cookies, database or UI state crosses this boundary.」所以它能在测试里喂字节流，`parser_test.go` 有 19,003 字节。

我的 `chaoxing.js` 是「抓 + 解 + 判 + 渲染回调」混在一起的，只能在 Node 里 `vm` 切函数出来测——`tools/test_reminder.js` 就是这么绕的（切三个函数出来再注入假数据）。**能用，但每加一个功能都要重新想怎么切。**

### 4. 网络客户端按构造防 SSRF

`ClassroomClient.java`（12,699 字节）：

```java
// Exactly three whitelisted POST routes exist here … Callers cannot supply
// URLs, combo names, cookies or arbitrary forms.
HOST = "xk.henu.edu.cn";
PATH_DROPLIST    = "/frame/droplist/getDropLists.action";
PATH_WEEK_MATRIX = "/kbbp/dykb.fjsickkxzcjc_data.jsp";
TIMEOUT_MS = 15_000;  MAX_BODY = 8 << 20;  BUDGET_MS = 45_000;
```

加上 cookie 净化（名字 > 256 字节、值 > 4096、含 `= ; \r \n` 一律丢）和 `XiqueClassroomPlugin.java` 的参数白名单（必须恰好 5 个键，多一个 `IllegalArgumentException`）。

我的 `Host.net()` 是**通用 HTTP 客户端**：URL 由 JS 传进来，只靠域名白名单挡。我确实限制了「带教务 Cookie 的桥只走学校域名」，但它连「能请求哪三个路径」都是写死的。

### 5. 它有真机测试，我没有

13 个 DeviceTest（`TimetableStoreDeviceTest`、`FocusEngineDeviceTest`、`SessionVaultDeviceTest`、`CampusGuideDeviceTest`…）跑在真机/模拟器上。

我的 15 套全是离线断言。**v1.1.27 的课程提醒就是这么翻车的**：JS 侧写得完整、`check_web.js` 全 PASS，但 manifest 里没有 `<receiver>`，通知一条都没响过，直到 v1.1.35 才补。这件事如果有一个 DeviceTest（发一条闹钟、断言通知栏出现），当天就会暴露。这条不是「它比我好一点」，是**它这条路能拦住我栽的那个坑**。

---

## 四、我真正领先它的地方

### 1. 它在跑，它没在跑

- 我：线上 `/v1/apk` 分发 v1.1.37，`/v1/config` 带强制版本、公告、设备上限、QQ 群；每天有真实学生在用。
- 它：1 个 Release、10 star、4 天零提交、0 watcher。**大概率还没有真实用户规模。**

这不是技术优势，是现实优势——但它决定了「谁的 bug 会被真实流量撞出来」。

### 2. 教务数据深度：它是零

关键词扫 591 条路径（chaoxing / 超星 / 学习通 / homework / 作业 / grade / 成绩 / water / 饮水）：**全部 0 命中**。它的 `exam` 12 条命中是自有考试表（手输倒计时），不是学习通。

我有：学习通作业+考试同步（`chaoxing.js`，含「未开始 / 已截止 / 情况不明」三态区分）、课表解析、成绩、饮水机。**对学生的日常价值，「作业快到期」比「电费还剩多少」高频得多。**

### 3. 服务端运营：它没有这个概念

它本地优先，服务端可选（甚至可以不装）。我有：KV 版本分发、强制/提示更新策略、公告、准入名单、留言板+校园实景+审核台（UGC 29/8/33/24 处引用）、限流。

**它发布一个版本要用户自己去 GitHub 下载；我发一个版本，学生下次开 App 就被推上去。** 这是产品形态差异，不是能力差异，但对「一个人维护、几十上百个学生用」这个场景，这条比什么都重要。

### 4. 装机门槛

| | HENUBox | 我方 |
|---|---|---|
| APK | 9.44 MB | 0.57 MB（1/16） |
| ABI | **仅 arm64-v8a**（Go 编译产物所限） | 通用 |
| 最低系统 | Android 9 | Android 7 |

学校里的旧机器和 32 位机器装不上它。这一条我自己都被惊到：**9.44 MB 换来的功能里，有一半我用 0.57 MB 做到了等价或更细。**

### 5. 校园指南它是链接表，我是结构化内容

它的 `guide-parser.ts` 里 `GUIDE_PAGES` 全是河大官网外链常量（calendar/maps/phones/shuttle/visits/vr/emblem/anthem），点开是内置 WebView。我的 `wiki.js`（40,206 字节）+ `guide.js` 是写好的正文条目，断网能看。

---

## 五、功能对照表（对齐到我方 v1.1.37）

| 能力 | HENUBox | 我方 v1.1.37 | 谁强 |
|---|---|---|---|
| 空闲教室 | **全校教室矩阵**（解析青果公共查询页） | 只算自己课表里出现过的十几间 | **它** ⭐ |
| 教务课表重导入 diff | **逐条 RETAIN/RETIRE 让用户决策**（`academic/diff.go` 13,481 字节 + 7 套验收测试） | 直接覆盖 | **它** ⭐ |
| AI 每日简报 | DeepSeek 客户端 + 规则引擎回落（`domain/ai/` 5 个文件） | 无 | **它** |
| WebDAV 多端同步 | ETag 条件上传、412 冲突重下重试（`sync/` 三个文件 33,000+ 字节） | 无（只有服务端 KV 的版本分发，不是用户数据同步） | **它** |
| 学期相位（教学/考试/假期） | `termphase.go` 11,642 字节 | 无 | **它** |
| 深色主题 / 多配色 | 三种外观 × 五种配色 | **0**（`prefers-color-scheme` 0 次、`data-theme` 0 次） | **它** |
| 内置图书馆/邮箱浏览与会话保持 | 有（`library` 4 + `email` 3，WebView + 插件） | 只有 wiki 里的文字说明 + 外链（wiki.js:76/81/101/103） | **它** |
| 校车/地图 | 只是 guide 里的外链 | 无 | 平 |
| 待办 | 有 | 有（v1.1.22，85 项断言） | 平 |
| 专注计时 | 有（Kairos 遗产，`pomodoro/`） | 有（v1.1.26，番茄钟+正计时+白噪音+统计） | 平 |
| 课程提醒 | 有（notify 调度器：考试提前 1440/60 分、课程提前 30 分） | 有（v1.1.35 修好）：自定义 0~30 分、重启重挂、精确闹钟降级 | **我**（可自选分钟数） |
| 电费/空调 | 万里平台（`WanliData`） | 完美校园四级选择器 + bindroom 登记 + 剩度数/今日/昨日 + 10 分钟自刷（v1.1.30~37） | **我**（更细） |
| 学习通作业+考试 | **0** | 有 | **我** ⭐ |
| 饮水机 | **0** | 有（扫码 + 定量停止） | **我** |
| 公告 / 强制更新 / 设备上限 / 准入名单 | 0 | 有（Cloudflare KV） | **我** |
| 留言板 / 校园实景 / 审核台 | 0 | 有 | **我** |
| 结构化校园指南（断网可看） | 链接表 | 正文条目 | **我** |
| 装机门槛 | 9.44 MB / arm64 only / 安卓 9 | 0.57 MB / 通用 / 安卓 7 | **我** |

**计分**：它独占 8 项，我独占 8 项，平 6 项。但要看权重——**它独占的 8 项里有 5 项是「一次性查得到」的信息类能力**（教室、链接、同步、简报、主题），**我独占的 8 项里有 5 项是「每天都要用」的行为类能力**（作业、饮水、更新、公告、UGC）。

---

## 六、架构对比（更正）

| 维度 | HENUBox | 河医大助手 |
|---|---|---|
| 界面 | React 19 + TS + Vite + Fluent UI + Radix | 原生 JS，无框架，`app.js` 207 KB / 4,700+ 行 |
| Android 壳 | Capacitor 7 + Java/Kotlin + Compose | 手写 WebView + `@JavascriptInterface` 桥（`MainActivity.java` 107,795 字节 / 2,182 行） |
| 构建 | Gradle Wrapper 8.11 + AGP 8.7 + Kotlin 2.2 | `aapt2 + javac + d8 + zipalign + apksigner` 手搓 Python 脚本（230 行） |
| 解析层 | Go，纯函数，可单独测 | JS，与网络/渲染耦合，靠 `vm` 切函数测 |
| 数据层 | Room/SQLite + Go 后端（可选 PG） | JSON + SharedPreferences + Cloudflare KV |
| 服务端 | Go（可选，不装也能用） | Cloudflare Worker（必选，但离线降级） |
| 测试 | 65 个 `_test.go` + 13 个 DeviceTest | 15 套离线断言，**0 个真机测试** |
| 发布 | GitHub Release 手动下载 | 自建 KV 分发 + 应用内强制/提示更新 |

**它的路子更正经**，这点不辩。但要说清代价：**它 591 个文件里，真正属于河大的可能不到 30 个**（`henu/` + `classroom/` + `xique/` + `electricity/` + `guide-parser`）。我把这个数字摊开，是为了回答「我是不是该重写」——不该。理由在第八节。

---

## 七、空闲教室：这一版有新结论（上一版说「要你给 URL」，现在不用了）

### 新事实 1：两校用的是同一套教务系统

```
https://qgjw.xxmu.edu.cn/  → 200 / 35,287 字节
title（GBK 编码）: KINGOSOFT高校智慧校园教学综合服务平台
```

HENUBox 解析的是 **KINGOSOFT（青果）公共查询页**。**XXMU 也是青果。** 上一版只写「它解析青果」，没说透两边同源——这意味着它的解析器对我这边**不是「可以参考」，是「可以直接移植」**。

### 新事实 2：未登录时返回的是同一段 stub，但机制比上一版更清楚

现场重测五条路径，其中三条是 HENUBox 实际用的、一条是故意不存在的：

```
POST /frame/droplist/getDropLists.action                       → 200 / 547 字节
GET  /frame/droplist/getDropLists.action                       → 200 / 547 字节
     /kbbp/dykb.fjsickkxzcjc.html?menucode=SB12                → 200 / 547 字节
     /kbbp/dykb.fjsickkxzcjc_data.jsp                          → 200 / 547 字节
     /zzz_nonexistent_12345.jsp                                → 200 / 547 字节
md5 全部 = 77e5912c5c3a2ce6dd3351c3c7255ed2
内容 = <script>alert('温馨提示：凭证已失效，请重新登录!');…
```

**结论没变（未登录拿不到真数据），但推论变了**：既然路径本身是真的（HENUBox 在河大跑通了同一套青果路由）、我方也已有带教务 Cookie 的桥（`MainActivity.java` 171/662/1876/1908 行的 `CookieManager.getCookie("https://qgjw.xxmu.edu.cn")`，`setAcceptCookie` 2080、`setAcceptThirdPartyCookies` 2095，且该桥只放学校域名），那么**下一步不是「要用户给 URL」，而是「用户登录后我直接试那两个路径」**。

### 可执行的验证步骤（下一步该做的）

1. 用户在真机上登录教务（不需要做别的）。
2. 我方用现有 `Host` 带 cookie POST `https://qgjw.xxmu.edu.cn/frame/droplist/getDropLists.action`，看是否返回真实的校区/教学楼下拉项。
3. 拿到教学楼 id 后 POST `/kbbp/dykb.fjsickkxzcjc_data.jsp` 拿周矩阵。
4. 若通，照搬它的三段式：`parser`（纯函数，FREE/OCCUPIED/UNKNOWN 三态 + `issues[]`）+ `Service`（5 分钟 TTL、同范围 STALE 回落）+ UI（教室 × 时段矩阵）。

**这条是我方当前最大的单点差距，而它现在是一个「用户只需登录一次、我就能验证」的动作，不再是「用户得帮我找 URL」。**

---

## 八、结论：该学什么、不该学什么

**一句话：它是一份免费的、写给同类学校的、工程质量很高的参考实现；我是一个还在被真实用户撞 bug 的活项目。这两件事不冲突。**

### 该学的（按性价比排序，都跟「防错」有关，跟「功能」无关）

1. **把「不确定」做成第三种状态，并且约定它永远不等于「空闲/完成」。** 我已经在作业三态上做了（`notstart`），但没有类型约束，下次改代码还是可能忘。至少给关键判断加一条 `check_web.js` 反向断言。
2. **给课程提醒补一个真机测试。** v1.1.27 那个坑值得一次 30 分钟的 instrumentation 测试：挂一个 60 秒后的闹钟，断言通知栏里有它。这是唯一能挡住同类事故的手段。
3. **解析器与网络分离。** 不必上 Go，把 `parsekb` / `chaoxing` 里「纯解析」的部分切成不接触 DOM 和网络的函数即可——`tools/test_reminder.js` 已经证明这套做法在这个项目里可行。
4. **空闲教室（见第七节）。** 这是唯一一个「功能级」的该学项。

### 不该学的

- **不该重写技术栈。** 它 591 个文件、17 万行 Go/TS/Java，其中属于河大的可能不到 30 个；引 React+TS+Gradle 进来，等于把 22,076 行能跑的 Web 层换成一套需要单独工具链的体系，而我是一个人在两台机器上手工出包。**它的骨架是别人（Kairos）花 4 个月搭的（2026-06-13 → 2026-10-23），我没有那 4 个月。**
- **不该学它的分发方式。** GitHub Release 手动下载 + 9.44 MB：它的用户得会翻墙、会找 release、会装 APK。我的学生在 App 里点一下。

### 该承认的

它用 5 小时做出一个「看起来像正经产品」的东西，是因为它**站在一个已经有 65 个测试、13 个真机测试、类型系统的骨架上**。这既是它的优势，也是它的天花板——**如果 Kairos 上游不再更新，它那 591 个文件里 560 个不会再有第二次修改，而河大适配层只有 5 小时的打磨。** 4 天零提交，就是这个天花板的第一个信号。

---

## 附：本次核实方法与取证边界

**已经取到的**

- 两仓库元信息 / 提交列表 / Release 资产：GitHub REST API（`/repos/...`、`/releases`、`/git/trees?recursive=1`）
- HENUBox 文件树：递归 tree API，`truncated: false`，591 个 blob，逐个算字节
- 源码内容：`contents` API + base64 解码，读了 20 个文件全文或大段（`classroom/parser.go`、`ClassroomClient.java`、`ClassroomService.java`、`classroom.ts`、`XiqueClassroomPlugin.java`、`schoolconn/login.go`、`academic/diff.go`、`notify/scheduler.go`、`domain/ai/*`、`sync/webdav.go`、`termphase.go`、`guide-parser.ts`、`docs/PRIVACY.md` 371 字节全文、README 2,765 字节全文等）
- 功能关键词扫描：591 条路径 × 约 20 个关键词子串匹配
- 我方度量：本机 `Select-String` 计数、`git rev-list`、文件字节数
- 本校教务探测：5 条路径现场 HTTP 请求 + md5 比对

**没取到的（要说明白）**

- **HENUBox 的 APK 拿不到。** `HENUBox-0.1.1.apk`（9,897,545 字节）下了两次都失败：`curl: (28) Failed to connect to github.com port 443 after 21106 ms`，Python urllib 走 objects 域名 `TimeoutError [WinError 10060]`。`api.github.com` 可达，release 二进制不可达。**所以本报告里「它有什么功能」全部来自源码与文档，没有一条来自拆包**——意味着它实际打包进去的东西我无法交叉验证（比如 Kairos 的桌面端代码是不是也被打进去了、9.44 MB 花在哪）。
- **65 个 `_test.go` 的总行数没取全。** 逐文件读时被 GitHub API 403 rate limit 打断，只拿到部分文件体量（`parser_test.go` 19,003 字节、`academic_b7_review_test.go` 22,964、`academic_c_test.go` 30,357、`calendar_test.go` 12,875）。所以「测试体量」只能用文件数（65）与几个样本，不能用总行数。
- **「骨架来自 Kairos」是推断，不是结论。** 依据是：9 个提交 / 5 小时 / 首个提交叫 Initial commit 却进来 591 个文件 / `termphase.go` 注释指向 Tauri 桌面路径 / 同栈同许可。我没有它的原始来历说明。
