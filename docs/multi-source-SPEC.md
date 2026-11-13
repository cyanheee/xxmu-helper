# 学习页「多平台作业/考试待办」落地契约（v1.1.66 / 1166）

> 本文件是**并行开发的唯一契约**，由 Lead 钉死。所有 teammate 动手前先读这一份。
> 目标：在「学习」栏里加 **喜鹊儿考试 / 知到作业考试 / 雨课堂作业考试** 三路待办，
> 与现有「学习通」并列聚合。目标版本 **1.1.66 / versionCode 1166**（线上 1.1.65/1165）。
> 方案 B：分级分三批 + 诚实降级；**只给出方案里承诺的、本机可诚实交付的部分**。

## 0. 铁律（违反即返工）

1. **只读**：不代交作业、不点开考试、不代签到、不改任何平台数据。
2. **登录态纯端侧**：服务端绝不托管密码 / sessionid / WIKI 内容。所有凭据只在 `Host.getPref/setPref` 或 WebView Cookie 里。
3. **绝不把失效页 / 提示页 / 登录页当成「0 条数据」**。抓不到 → `state:'stale'`（要重登）或 `state:'degraded'`（接口不可用 / 未验真），这两种**不并入条目**，但要把原因如实显示在连接卡。
4. **不硬绕风控、不臆造 URL**。青果考试端点本机 cookie 已过期（探针实测 515 字节「凭证已失效」），运行时带 Cookie 候选试探、命中真表才认；雨课堂 / 知到无公开 API、本机无 sessionid，这一版按方案 B 做「框架 + 登录入口 + 连通性探针 + 诚实降级」，**绝不假装抓到了真实数据、绝不硬编臆造的 endpoint**。
5. **未知状态原样显示**：复用 `CX.classify`，绝不把陌生状态词当成「待做」。
6. **向后兼容**：学习通是主路，新增来源失败不能拖垮它；所有来源无数据时页面表现与 v1.1.65 一致。
7. **无构建链**：纯 ES5+/IIFE，WebView 直接跑；不引入框架、不解包、不装依赖。
8. **中文「为什么」注释**：本仓库每个非显然决策都要写清动机，不写 `// fix` 这种。

## 1. 聚合器 `web/sources.js`（Lead 已写好，不要改）

全局 `const SOURCES = (()=>{...})()`。它把学习通包装成内置来源，其余来源由各适配器 `.js` 注册。

对适配器暴露的接口（**照这个签名调用**）：

```js
SOURCES.define({
  id: 'xiqueer',              // 唯一 id
  label: '喜鹊儿 / 青果',      // 连接卡主标题
  short: '喜鹊',              // 条目徽标短名
  kinds: ['exam'],            // 该来源提供哪些类型：'work' / 'exam'
  key: 'xxmu_xq_exams',       // setPref 缓存键（省略则自动 'xxmu_src_'+id）
  host: 'https://qgjw.xxmu.edu.cn/',  // 可选：默认登录态按此域查 hasCookieFor
  loginUrl: '...',            // 可选：给了就自动生成「登录」入口走新桥
  loginTitle, badHints, okHints, grabSel,   // 可选：登录 WebView 判定参数
  // 三个方法可覆盖；不覆盖则用工厂默认（cookie 域判登录 / clearCookieFor 登出）
  loggedIn: function(){ return bool; },      // 可选
  openLogin: function(){ return bool; },     // 可选
  logout: function(){},                      // 可选
  // ★ 必填：抓取核心，返回 Promise（或直接返回对象）
  fetch: function(onStep){
    return SOURCES.http(url, {cookieUrl, referer}).then(function(b){
      // b = {ok, text, code, error}
      // 命中真表：
      return { state:'ok', works:[], exams:[ {...} ] };
      // 登录失效：return { state:'stale', error:'教务凭证已失效，请重新登录' };
      // 接口不可用/未验真：return { state:'degraded', error:'…原因…' };
    });
  },
});
```

- `fetch` 返回 `{state:'ok', works, exams, errors?}` / `{state:'stale'|'degraded', error}`。
- 工厂自动做：缓存读写与形状校验、`synced_at` 时间戳、`state` 记忆（降级也落盘一份「空数据+原因」）、`window.__onSrcDone_<id>(ok,acct)` 登录回跳（成功自动 `SrcUI.sync(id)`）、`logout` 清 cookie+缓存。适配器**不要自己写 setPref/getPref**。

`SOURCES.http(url, opts)` → `Promise<{ok, text, code, error}>`，已封装 `XXMU.netCk + splitResp + decodeAuto`（UTF-8 fatal 退 GBK）。`opts`: `{method, body, contentType, headers, cookieUrl, referer}`。
`SOURCES.stripTags(html)`、`SOURCES.now()`（秒）可直接用。

## 2. 数据格式（务必对齐 `data/homework.json`）

每条 **work**：`{course, name, start, end, status, source?, ...}`
每条 **exam**：`{course, name, start, end, status, place?, ...}`
- `start/end` 字符串 `YYYY-MM-DD HH:mm`（`app.js` 用 `new Date(String.replace(/-/g,'/'))` 解析）。
- `status` 用平台原文（如「未开始」「待考」）；读不到就留空 → 前端显示「状态未知」，**绝不填「已完成」**。
- `source` 由聚合器就地补上（=`id`），适配器不用写。
- `SOURCES.live()` 合并所有 `state:'ok'` 来源，产出单一 `d` 对象喂 `renderHomework`；全空返回 `null`。
- `SOURCES.status()` 返回每个来源的 `{id,label,short,builtin,kinds,state,synced_at,count,works,exams,error,loggedIn,hasLogin,hasRefresh}`。

**状态机**：`ok`（验真数据，含确实 0 条）/ `stale`（要重登）/ `degraded`（接口不可用 / 未验真 / 本机无登录态）/ `nologin`（未登录，无缓存时推断）/ `idle`（已登录但从没同步）。**只有 `ok` 且 `synced_at>0` 并入条目**。

## 3. 三个来源这一版各自做到哪一层（分级，别越界）

| id | label | short | kinds | 这一版交付 | 绝不越界 |
|---|---|---|---|---|---|
| `xiqueer` | 喜鹊儿 / 青果 | 喜鹊 | `['exam']` | **复用教务登录态**：`loggedIn` 按 `https://qgjw.xxmu.edu.cn/` 的 cookie；`fetch` 按候选 jsp 路径（照 `core/kingo.py` 的 `GRADE_PATHS` 模式）逐个 `SOURCES.http` 试探，命中含「课程名称 + 考试时间/考场」真表才解析成 exams；见「凭证已失效/请重新登录」→ `stale`；候选全不命中 → `degraded`（附原因）。登录入口复用教务：`openLogin` 调 `Host.openLogin()`（学校官方登录页，Java 回调 `__onLoginDone`），**不另造登录**。 | 不硬编单一 URL 当真、不攻 `libkdvmp.so` VMP、不把失效页当 0 条、不新增考试提交。 |
| `yuketang` | 雨课堂 | 雨课堂 | `['work','exam']` | **框架 + 登录入口 + 端点预留 + 诚实降级**：`loginUrl:'https://www.yuketang.cn/web'`，`okHints` 含已登录标识，`loggedIn` 按绑定标记 + cookie；`fetch` 先做一次连通性/登录态检查，本机无 sessionid/未绑定 → `degraded`，error 写「雨课堂学生端接口需真机微信扫码绑定并抓包确认，本机预留接入」。四区域（standard/hetang/changjiang/huanghe）在注释里说明、`loginUrl` 默认 standard。 | **不硬编臆造的学生端 endpoint**（yuketang-mcp 只给了工具名没给 URL）、不代签到、不代考试作答、不假装拉到了作业。 |
| `zhihuishu` | 知到 / 智慧树 | 知到 | `['work','exam']` | **连通性探针 + 清晰降级**（方案 B 第三批本就如此）：`fetch` 探一下官方作业考试页是否可达 / 是否有登录态，一律 `degraded`，error 写「知到需 CAS/SSO 二跳签名，活接口待真机复验，本机未接入，请到官方 App/网页查看」。 | 不照抄 2023 年归档仓库的旧签名、不臆造 ev/secretStr、不硬绕、不假装拉到了清单。 |

> 三个文件都**很短**：主要是 `SOURCES.define({...})` + 一个 `fetch`。一致、可审、契约不漂移。

## 4. DOM 契约（`web/index.html`，teammate `ui-html` 负责）

在**现有 `cxCard` 之后**（第 319 行 `</div>` 后）插入：
```html
<!-- v1.1.66：新增三平台连接卡容器，由 app.js 的 SrcUI 动态填充 -->
<div id="srcCards"></div>
```
在**现有 `sortChips` 之后**（第 330 行 `</div>` 后）插入一组来源筛选容器（由 SrcUI 填充）：
```html
<div class="chips" id="srcChips"></div>
```

**script 顺序**（第 1143 行 `chaoxing.js` 之后紧接插入 4 个，必须在 `app.js` 之前）：
```html
<script src="chaoxing.js"></script>
<script src="sources.js"></script>
<script src="xiqueer.js"></script>
<script src="yuketang.js"></script>
<script src="zhihuishu.js"></script>
<script src="about.js"></script>
...
```
（`sources.js` 惰性引用 CX；三个适配器调用 `SOURCES.define` 注册。`app.js` 在最后，能读到全部。）

## 5. 连接卡 / 筛选 DOM（由 `SrcUI` 动态生成，`ui-css` 提供样式类名）

每张卡（遍历 `SOURCES.status()` 里 `!builtin` 的来源）：
```html
<div class="card src-card" data-src="xiqueer">
  <div class="row"><span>喜鹊儿 / 青果</span><span class="v src-state warn" data-role="state">未登录</span></div>
  <div class="row" data-role="atRow" style="display:none"><span>上次同步</span><span class="v" data-role="at">--</span></div>
  <p class="hint tight" data-role="note" style="display:none"></p>
  <button class="btn" data-act="login">登录 / 绑定</button>
  <button class="btn soft" data-act="sync" style="display:none">刷新待办</button>
  <button class="btn ghost" data-act="out" style="display:none">断开</button>
  <p class="hint tight">只读，不会替你交作业、不会点开考试。登录态只在这台手机上。</p>
</div>
```
- 连接卡用**事件委托**绑在 `#srcCards` 上，靠 `data-src` / `data-act` 分发，不为每个来源写一套。
- 状态文案：`ok`→「已同步 N 条」绿 / `stale`→「需重新登录」橙 / `degraded`→「暂不可用」橙 + `note` 显示 error 全文 / `nologin`→「未登录」/ `idle`→「已绑定，未刷新」。
- 来源筛选 `#srcChips`：一个「全部」+ 每个来源一个 `<button data-srcf="id">短名</button>`，选中态 `class="on"`。当前筛选存 `prefGet('xxmu_src_filter','all')`。

## 6. `web/app.js`（Lead 自己改，其他人不要碰）

1. 第 726 行：`const live = (typeof SOURCES!=='undefined') ? SOURCES.live() : ((typeof CX!=='undefined')?CX.cached():null);`
   —— `SOURCES.live()` 已含学习通，形状与旧 `CX.cached()` 一致。
2. 第 732–735 行 `READ_ERR.homework`：改为读 `SOURCES` 各来源 `readErr()` 汇总（学习通仍取 `CX.readErr()`）。
3. 第 842–846 行 `srcTag`：`d._source==='multi'` 时显示「多平台 · N 路」。
4. 第 848–852 行筛选：`filt` 之后再加一层来源筛选 `curSrcFilter()`（`SOURCES` 存在时按 `x.raw.source` 过滤）。
5. 第 1001 行 `cardOf(x)`：卡片加一个来源徽标 `<span class="src-badge">短名</span>`，读 `x.raw.source` → `SOURCES.get(src).short`；无来源（旧缓存/外部 JSON）不显示徽标。
6. 新增 `const SrcUI = (()=>{...})()`（仿现有 `CxUI`，第 1122 行）：`paint()` 渲染 `#srcCards` + `#srcChips`、`sync(id,silent)` 调 `SOURCES.refresh(id)`、`login(id)` 调 `SOURCES.openLogin(id)`、`logout(id)`、`init()` 事件委托。导出到 `window.SrcUI`（供 `sources.js` 登录回跳调用）。
7. `initLearnUI()`（第 ~1060 行）里调 `SrcUI.init()`；`CxUI.sync` 成功回调里也 `SrcUI.paint()`（学习通同步后重画来源状态）。
8. **空态**（第 865–899 行）：`CX` 未登录且三新平台也无 `ok` 数据时，提示语补一句「也可在学习页下方绑定其他平台」。

## 7. `web/app.css`（teammate `ui-css`，只在这个文件追加，不改已有规则）

新增类：`.src-card`（与 `.cx-card` 同风格，可微调间距）、`.src-state.ok` 绿 / `.warn` 橙、`.src-badge`（条目右上角小圆角标签，浅色/深色两套都要有，参考现有 `data-theme` 变量）、`#srcChips`（沿用 `.chips`）、`.src-note`（降级原因，小字、不刺眼）。**浅色 + 深色都要照顾**（本项目深色档是硬要求）。

## 8. `android/src/com/xxmu/helper/MainActivity.java`（teammate `bridge`，只改这个文件）

新增 `@JavascriptInterface` 方法（**保留 `openWebFor` 原样不动**以兼容学习通）：
```java
public void openLoginFor(String url, String title, String badHints,
                         String okHints, String grabSel, String cbName)
```
- 仿第 1196 行 `openWebActivityGrab`，但 hints / grabSel / 回调名都**参数化**：把 `badHints/okHints/grabSel` 塞进 WebActivity 的 Intent extras（WebActivity 第 229–244 行已读 `EXTRA_OK_HINTS/EXTRA_BAD_HINTS/EXTRA_GRAB`，第 516 行 `isLoggedInUrl` 已用 hints 判定，**WebActivity 大概率无需改**）。
- 用新 requestCode `REQ_SRC`（新常量）；MainActivity 加字段 `String pendingSrcCb` 存 `cbName`。
- `onActivityResult` 新增 `REQ_SRC` 分支：flush Cookie + 读 `EXTRA_ACCOUNT`，回调 `window[pendingSrcCb](ok, acct)`（仿第 1670 行 `notifyCxDone` / 第 2020 行 `notifyLoginAccount`，写一个 `notifySrcDone(ok,acct,cb)`）。
- 若 WebActivity 确实缺某个 extra key 的读取，允许**最小改动** WebActivity.java（在 brief 里回报），但优先不动它。

## 9. `tools/test_sources.js` + `tools/check_web.js`（teammate `tests`）

- `tools/test_sources.js`：用 Node `vm` 加载 `web/sources.js`，注入假的 `XXMU/Host/CX/window/localStorage`，断言：
  ① 学习通包装成 builtin 来源；② `define` 三个来源后 `status().length===4`；③ `live()` 只并入 `ok` 来源、`degraded/stale` **零条目**；④ 每条并入项带 `source` 标签；⑤ 全空时 `live()===null`；⑥ `refresh` 降级会记忆 error、`status()` 能读回；⑦ 缓存坏 JSON 触发 `readErr()` 不当成「没同步过」。
  参照 `tools/test_hwstatus.js` 的写法（读文件文本 + `vm`）。
- `tools/check_web.js`：补静态锚点——`sources.js` 存在且含 `registerBuiltinChaoxing` / `state:'degraded'` / `live` / `!merged`（不并入降级）、`app.js` 含 `SOURCES.live()`、`index.html` 含 `srcCards`/`srcChips`/四个新 script。**别改 `KNOWN_ORDER`**（check_web 是全量扫 web/ 目录比对 assets，新文件会被自动纳入）。

## 10. 文件所有权（**禁止越界**，写作用域互不重叠）

| teammate | 只允许改/建 |
|---|---|
| `adapters` | `web/xiqueer.js`、`web/yuketang.js`、`web/zhihuishu.js`（仅新建这三个） |
| `bridge` | `android/src/com/xxmu/helper/MainActivity.java`（必要时最小改 `WebActivity.java`） |
| `ui-html` | `web/index.html` |
| `ui-css` | `web/app.css` |
| `tests` | `tools/test_sources.js`（新建）、`tools/check_web.js` |
| **Lead（我）** | `web/sources.js`(已写)、`web/app.js`、`docs/multi-source-SPEC.md`、集成 / 门禁 / 出图 / 出包 / 版本 / notes / 发布 / 官网部署 |

`app.js` / `sources.js` / SPEC 是集成枢纽，只有 Lead 碰。谁都不要动 `homework.js` / `chaoxing.js` / `sync.js` / `build_apk.py` / 版本号文件。

## 11. Wave 2 由 Lead 串行完成（teammate 不用管）

`node tools/check_web.js` + 全套 `node tools/test_*.js` → `python tools/bump_ver.py 1.1.66 1166`（三处版本一致）→ `python tools/build_apk.py`（同步 android/assets、出包、送桌面 `C:\Users\Administrator\Desktop\xxmuhelper`）→ 无头 Edge 出 **浅色 + 深色各一张 390px 实拍图**逐块核对（纸感/对比度/溢出/白字压白底）→ `python tools/verify_apk.py` → `set_notes.py`/`set_notice.py` 写 notes → `python tools/publish_apk.py`（真发布切 cfg.latest）→ 官网部署同步。

## 12. 真机待测（回报里必须诚实列出，本机无设备/无活登录态一律不声称已验证）

- 喜鹊考试：学生真机重新登录教务后，考试安排候选 jsp 能否命中真表（本机 cookie 已过期，只能验到 `stale` 降级链）。
- 雨课堂：真机微信扫码绑定 + 学生端接口抓包确认端点 URL 后，才能接真实作业/考试清单。
- 知到：CAS/SSO 二跳签名活接口复验后才能接清单。
- 四张连接卡在真机上的手感、来源筛选、深色档观感。
