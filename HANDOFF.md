# 河医大助手（xxmu-app）交接说明

> **先读 [STATE.md](STATE.md)** —— 一页，写着现在在第几版、线上发的哪一版、
> 仓库在哪、还差什么。本文件只放**几个月才变一次**的东西：架构、数据模型、
> 打包流程、那些已经踩过、不该再踩的坑。
>
> 历史每一版改了什么 → [docs/handoff/changelog.md](docs/handoff/changelog.md)（1600 行，按需查）
> 待办 → [docs/handoff/todo.md](docs/handoff/todo.md)
>
> 为什么这么拆：这些文档以前是一份 1900 行的 HANDOFF，新会话要先读完全部才知道
> 现在在哪，读完上下文也快满了 —— 「对话太长点不进去」就是这么来的。
> 现在稳定的部分留在这里，状态的部分由 `python tools/state.py` 从制品本身生成。

> 目标接手端：电脑端 DSH（cyanhe）。本文档自包含，读完即可继续开发，无需原始会话历史。

## 1. 项目是什么

河南医药大学（XXMU）学生的**个人课表 + 作业待办**工具，形态是**单 APK 的离线 WebView App**：
- 前端是纯静态 HTML/CSS/JS（无框架、无构建工具、无 npm）。
- 数据由电脑/手机上的 Python 脚本抓取后生成 JSON，再塞进 App 内置 assets（或外部目录）供 WebView 读取。
- APK 用 aapt2/javac/d8/apksigner 手工打包，**没有 gradle**。

运行链路一句话：
```
教务系统(青果) ─┐
                ├─> core/*.py ─> data/*.json ─> web/*.js(内嵌副本) ─> APK assets ─> WebView UI
学习通(超星) ───┘
```

## 2. 目录结构

```
xxmu-app/
├── build_apk.sh              # APK 打包脚本（Termux 环境，5 步：aapt2 link→javac→d8→zipalign→apksigner）
├── tools/build_apk.py        # 电脑端等价实现（当前实际使用，python tools/build_apk.py）
├── tools/verify_apk.py       # 出包后五件套校验（assets 逐字节 / dex 符号 / badging / 签名证书 / worker 锚点），默认挑 apk/ 下最新包
├── tools/publish_apk.py      # 直写 Cloudflare KV 发布（写 blob+meta+cfg，自带回读校验与线上自检）
├── tools/check_web.js        # 静态体检：assets 同步一致性 + 三处版本号 + 乱码指纹，不过就 exit 1
├── tools/test_grab.cmd       # 离线跑 WebActivity.buildGrabJs 的 DOM 行为测试（+ TestGrab.java / test_grab.js）
├── tools/test_license.js     # 离线跑 license.js 的核对状态机（45 条断言，node tools/test_license.js）
├── tools/test_http_range.py  # 离线跑 Http.java 分段下载（本地起假服务器演 5 种 Range 行为，5/5 断言）
├── tools/test_downprogress.js # 离线跑前端 APKDL 下载进度链（17 条断言，从 app.js 里切出 IIFE 跑）
├── tools/test_hwstatus.js    # 离线跑作业/考试状态解析与分桶（51 条断言，node tools/test_hwstatus.js）
├── tools/test_api_contract.js # 前后端字段契约：服务端 json() 键 vs 前端读的字段（14 项，专治 res.list/res.rows 这类静默不一致）
├── docs/xiaoheihe-post.md    # 小黑盒发布文案（含发布前必读、短版、评论区预备回答）
├── android/
│   ├── AndroidManifest.xml   # package=com.xxmu.helper, versionCode=118, versionName=1.1.8
│   ├── res/{values/strings.xml, mipmap-hdpi/ic_launcher.png}
│   ├── src/com/xxmu/helper/
│   │   ├── MainActivity.java # WebView 壳 + Host 桥（30+ @JavascriptInterface 方法）
│   │   ├── WebActivity.java  # 全屏 WebView（教务登录 / 内置浏览 / 胖乖生活抓取态）
│   │   ├── Http.java         # HTTP 客户端（cookie / gzip / multipart / 4 段并发下载+续传）
│   │   └── CrashGuard.java   # 全局未捕获异常写入 files/crash.log
│   └── assets/               # = web/ 的逐字节副本（打包时 -A assets，build_apk.py 扫目录同步）
├── web/                      # 前端源码（唯一真实来源，16 个文件）
│   ├── index.html            # 5 Tab：课表 / 学习 / WIKI / 校园事务 / 我的（#tab-about 移出底栏）
│   ├── app.css
│   ├── app.js                # 全部渲染逻辑：周课表网格 + 学习页排序 + 空教室 + 校园事务 + 管理审核台
│   ├── data.js               # window.SCHEDULE = {...}  由 data/schedule.json 生成（单行）
│   ├── homework.js           # window.HOMEWORK = {...}  由 data/homework.json 生成（单行）
│   ├── sync.js               # 青果登录后的纯 JS 抓取解析层（导出 XXMU）
│   ├── license.js            # 学号登记 + 「登录的号 vs 登记的号」核对（v1.1.0 起无激活码）
│   ├── about.js              # 激活门 Gate + 关于页 + APP_VERSION
│   ├── wiki.js               # 校园 WIKI + 实景图片墙 + 留言板（v1.1.6）
│   ├── water.js              # 胖乖生活饮水机协议 + 空教室计算（导出 WATER / FREE）
│   ├── chaoxing.js           # 学习通只读：课程→作业/考试；pickStatus 状态位提取（v1.1.5 重写）
│   ├── onboard.js            # 首次启动引导（登录待办清单）
│   ├── tut.js                # 首次使用教程，六页横滑（v1.1.6）
│   └── jsQR.js               # 256KB，二维码解码（UMD，file:// 下可用）
├── core/                     # 数据抓取 + 解析（PC 端 Python 脚本）
│   ├── kingo.py    (124 行)  # 青果教务：验证码登录 / cookie / 拉课表 HTML
│   ├── base64.js, md5.js, jkingo.des.js  # 青果 DES 加密的 JS 复现（875 行 jkingo.des.js）
│   ├── sync.py      (46 行)  # 课表一键同步：login→fetch_schedule→parse→写 data/schedule.json
│   ├── parse_kb.py  (34 行)  # 青果二维表 HTML → cells[{day,period,courses[]}]
│   ├── normalize.py (46 行)  # weeks 字符串 "10-12[1-2]" → weeks[] / periods[]
│   ├── times.py      (9 行)  # 1–16 节官方作息（含 18:10~19:00 傍晚空档）
│   ├── chaoxing.py (332 行)  # 学习通只读：cookie 库→课程→作业/考试，三步接口
│   └── sync_hw.py  (109 行)  # 作业一键同步：写 data/homework.json + web/homework.js + 推外部目录
├── data/                     # 抓取产物（会话/中间文件）
│   ├── schedule.json (17.8 KB, 用户 20261440105, term 2026-2027-1, count 75)
│   ├── homework.json (10.1 KB, 7 门课 / 9 条作业 / 5 条待做)
│   ├── session.json  (青果 cookie，时效性短)
│   └── captcha.jpg
└── apk/  xxmu-helper-v0.2.6 … v0.6.0（每版都留着，v0.4.0/v0.4.1 有闪退勿分发）
```

## 3. 数据模型

### schedule.json（web/data.js 里的 window.SCHEDULE）
```json
{"user":"20261440105","synced_at":1793605751,"term":"2026-2027-1",
 "count":75,
 "cells":[{"day":1,"period":1,"courses":[
    {"name":"人体解剖学","teacher":"庞盼姣","weeks":"10-12[1-2]","room":"3301"}]}],
 "times":["08:00~08:40", ... 16 项],
 "courses":[ ...扁平化后的课程，含 day/start/weeks:[]... ]}
```
注意：`courses` 是给前端直接用的扁平表（每门课带 `day`、起始节次、`weeks` 数字数组），`cells` 是青果原始二维格。前端 `app.js` 只读 `DATA.courses`。

### homework.json（web/homework.js 里的 window.HOMEWORK）
```json
{"synced_at":..., "source":"chaoxing", "total":9, "pending":5,
 "courses":7, "term_label":"学习通", "exam_total":..., "exam_upcoming":...,
 "errors":[],
 "works":[{"course":"大学生安全教育","courseid":"...","classid":"...","cpi":"...",
   "name":"激情犯罪与防范性侵害课后作业","start":"2026-10-31 12:00","end":"2026-11-07 23:00",
   "status":"待做","workid":"57770542","relationid":"","answer_url":"https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?...",
   "left_hours":120.4,"expired":false,"open":true}],
 "exams":[{"start":"...","end":"...","status":"未开始","left_hours":..,"starts_in_h":..,"upcoming":true,"expired":false}]}
```
派生态（`left_hours` / `expired` / `open` / `upcoming`）由 `sync_hw.build()` 在写盘时算好，前端只用不算。
`OPEN_STATES = ("待做","重新编辑")`。

## 4. 前端要点（web/app.js）

- 学期基准：`const START = new Date(2026,7,31)`（2026-08-31 = 第 1 周周一），`TOTAL_WEEKS = 21`。
- 周次计算 `weekOf(d) = floor((d-START)/6048e5)+1`；`todayD = (getDay()+6)%7+1`（周一=1…周日=7，**此偏移 bug 已修，勿回退**）。
- `blocksOf(day, week)`：按 weeks 命中过滤 → 按起始节次分组 → 发 `occ[]` 占位防重叠 → 输出块。
- 渲染：`renderWeek()` 画 7 列 × `PERIODS(12)` 行网格，本周高亮表头蓝下划线 + 整列浅蓝。
- 数据读取优先级（**核心约定**）：
  ```
  readExternal()         : Host.externalSchedule() 非空 → JSON.parse（外部文件优先）
  else readCached()      : Host.cachedSchedule()（App 私有目录缓存）
  else window.SCHEDULE   （APK 内置）
  readExternalHomework() / readCachedHomework() / window.HOMEWORK 同理
  ```
  即「不重打包也能换数据」。
- 作业 / 考试卡片点击 → `Host.openInApp(url)` 用 App 内 WebActivity 打开（v0.4.1 起；系统浏览器没有学习通 cookie）。
- 底部 5 Tab 由 `data-tab` + `.tab.active` 切换；`#tab-about` 不在底栏，从「我的」页的「关于本软件」行进入，「关于」页顶部有返回按钮回「我的」。

### 4.1 学习页排序（v0.5.0；v0.6.0 修组内已完成下沉）

- 两套排序：`按紧急度`（默认）/ `按课程`，分段控件 `#sortSeg`，持久化到 pref `xxmu_sort`。
- 筛选：`全部 / 作业 / 考试`，chips `#sortChips`，持久化 `xxmu_filter`。
- 归一化层：作业与考试统一成 `items[]`，每项 `{kind:'work'|'exam', raw, course, name, status, open, left, leftStart}`，排序渲染只跟这个结构打交道。
- `byDue` 里 `left == null` 排最后（Infinity），避免无截止的插到紧急项前面。
- **按课程**：课程顺序按「该课最紧急一条的 left」排（不是拼音），组内再 byDue，组头显示「N 项未完成 · 共 M」。
- 切到按课程时 `main.scrollTop = 0`。

### 4.2 空教室（v0.5.0）

**重要限制**：本机只有自己课表里出现过的教室（去重后十几间），别的班的课看不到。所以功能定位是「**我课表里这些教室中，某天某几节没课的**」，页面文案必须写明仅供参考。

- 计算在 `web/water.js` 的 `FREE`：`allRooms()` / `busyRooms(week, p1, p2, day)` / `compute(week, p1, p2, day)`。
- **`day` 参数是必需的**：`1..7` 只看该天；`0` 或 `null` 走整周保守口径（本周任一天该时段有课即算占用）。早期版本漏了 day，导致「问周三下午」把周一上午的课也算上——单元测试抓出来的，别再退回去。
- UI 在 `app.js` 的 `openFreeSheet()`：先选星期（默认今天）再选时段（上午 1-6 / 下午 7-10 / 晚上 11-14，默认按当前钟点猜），底部额外给「整周都没课 · N 间」（三重循环 day×seg 全空，自习最稳）。
- 青果空闲教室的**真实路径无法离线推定**：未登录时任何 `/student/*.jsp` 都返回同一段 515 字节「凭证已失效」stub，连不存在的路径也一样，路径枚举彻底无效。所以只放「去教务系统查准确的空闲教室」按钮 → `Host.openInApp('https://qgjw.xxmu.edu.cn/')`，**不要猜路径**。

### 4.3 校园 WIKI（v0.5.0）

`web/wiki.js`，导出 `WIKI`。设计取向：**本机存储 + 内置条目**，不做服务端（没有服务器，也不该把学生内容托管在别人那）。
- `WIKI.init()` 读 pref `xxmu_wiki`，合并内置条目；`render()` 按 `WIKI_CATS` 分类渲染到 `#wikiBody`；支持搜索（`#wikiSearch`）、新增（`#wikiAdd`）、导出（`#wikiExport`，JSON 文本 toast）。
- 内置条目覆盖教务系统 / 学习通 / 校园生活三类常见问题（怎么登录、课表对不上、成绩在哪看、评教、作业在哪看、签到、饮水机怎么用、找空教室）。

### 4.4 校园事务 · 胖乖生活饮水机（v0.5.0）

`web/water.js` 的 `WATER` + `app.js` 的 `CampusUI`。**目标**：扫一次机器二维码，之后点一下就出水，不用每次扫码/碰一碰。

协议全部来自官方 h5 生产代码（`https://h5.qiekj.com/js/app.c17a893c.js` 等，落地在 `_pg/`），不是猜的：
- Base `https://userapi.qiekj.com/`，POST 表单，`token` 放 body，头带 `uid` 与 `phoneBrand`（大写 UA 品牌，缺省 other）。`content-type: application/x-www-form-urlencoded`，但某些端点是 Spring 的 multipart-only → `Http.postMultipart` 兜底。
- 登录：`common/sms/sendCode {phone, template:"reg"}` 实测真实发短信成功 → `user/reg {channel, phone, verify, code}` 返 `token`。
- **路线 A（商品码）**：`goods/normal/details {goodsId}` → `goods/normal/skus {goodsId}` → 选 `skuId` → `goods/water/unlock {skuId}` → `{msgId}` → 轮询 `machine/msg/sync {msgId}`，`state==="OK"` 或 `code==="05"` 即成功（最多 15 次 × 1s）。
- **路线 B（机器码，2G 直连）**：`machine/detail {machineId}` → `functionList[]`（每个出水口带 `id`=machineFunctionId）→ `machine/water/unlock {machineFunctionId}` → 同样轮询 `msg/sync`。蓝牙分支改走 `machine/encryption/cmd {type:4}`。
- 二维码 → id：`parseMachineId()` 兼容纯数字 / hash 路由 `?machineId=` / `&machineId=` / URL 编码 `machineId%3D` / `/machine/123456`；`goodsId` 同理。
- 出水中查状态：`goods/shower/sync {skuId}` → `{status, amount, identify}`，`status` 1/2/4 进行中、**3/5 结束、6 故障**。（直连式机器用 `machine/water/sync {machineFunctionId}`，结构相同。）
- **结束用水（v1.1.0 新增，之前误判为不存在）**：`POST goods/endWater { goodsId }`（淋浴机才是 `shower/goods/remoteEnd`）。此前只看 `pages_waterGoods` 一个分片，那里没有 stop 调用，于是写成「胖乖没有远程停止接口」；真逻辑在公用 mixin `src/pages/chooseShowerMachine/showerMachine/common.js`（chunk `pages_showerMachine~pages_waterGoods`），是从 `app.c17a893c.js.map` 的 `sourcesContent` 里挖出来的。
- **结算链**（`WATER.endWater` → `waitDone` → `createOrder`）：结束 → 轮询 `goods/shower/sync` 到 3/5 → 拿 `identify` 调 `POST order/afterPay/creating {orderNo: identify}` 建单 → `{orderId, orderStatus, payType}`；`orderStatus===2` 说明已付（免密），否则打开 `https://h5.qiekj.com/pay/afterPay/paymentOrder/paymentOrder?id=<orderId>&pathType=1` 付款。
  - **`identify` 不是订单号，是待建单流水号** —— 拿它当订单号去查永远查不到。
  - `orderId` 为空要 1 秒后重试（官方页面就是这么写的，纯轮询）。
- 停止：`WATER.stop(goodsId)` = `WATER.endWater(goodsId)`。多出水口（冷/热）时每口一个按钮；单口只一个「接水」。`busy` 模块级变量锁防连点，`settling` 锁防结算流程重复触发。
- 错误翻译 `WATER.human()`：-52 余额不足、5134 限流、超时等逐条映射。

**验证边界（必须记住）**：`userapi.qiekj.com` 对本机出口 IP 曾长期返回 **405 阿里云 WAF 页**，所以 unlock 成功响应**从未在真机验证过**，实现照 h5 生产源码写。v1.1.0 的 `goods/endWater` 与 `goods/shower/sync` 同样是照源码写的，**上线前必须真机跑一遍**。判据：405 = WAF 挑战（应重试而不是判定接口不存在），404/200-JSON = 路径存在。

## 5. Java 壳（MainActivity.java + WebActivity.java）

MainActivity 里 `Host` 类暴露的 `@JavascriptInterface`（v0.5.0 全量）：

| 方法 | 作用 |
|---|---|
| `externalSchedule()` | 读 `/sdcard/Android/data/com.xxmu.helper/files/schedule.json`，不存在返回 "" |
| `schedulePath()` | 返回该绝对路径（供 UI 显示） |
| `externalHomework()` / `homeworkPath()` | 同上，homework.json |
| `cachedSchedule()` / `cachedHomework()` | 读 App 私有目录缓存 |
| `saveCachedSchedule(json)` / `saveCachedHomework(json)` | 写 App 私有目录缓存 |
| `cookies()` / `clearCookies()` | 教务 Cookie 导出 / 清空 |
| `openLogin()` | 打开 **WebActivity** 的教务登录页，成功后回传 `__onLoginDone(ok)` |
| `openInApp(url)` | 打开 **WebActivity** 浏览学习通作业/考试 |
| `fetchScheduleHtml(b64)` / `httpGet` / `httpGetPlain` / `httpPost` | 走 Java 侧带**教务 Cookie** 的 HTTP |
| `httpFetch(url, method, body, contentType, headers, asMultipart)` | 第三方接口通用请求，**不带教务 Cookie**（token 由前端放 body）；`asMultipart=="1"` 走 `Http.postMultipart` |
| `openWaterCapture(url)` | 打开 WebActivity 抓取态（REQ_CAPTURE），回传 `__onWaterCapture(jsonText)` |
| `pickImage()` | `ACTION_GET_CONTENT` 选图，回传 `__onImagePicked(dataUrl)` |
| `readAsset(name)` | 读 `assets/` 下文件全文（给 jsQR 之类的备用路径） |
| `getPref` / `setPref` | SharedPreferences 读写 |
| `crashLog()` / `clearCrashLog()` / `deviceInfo()` / `b64()` / `kbUrl()` | 诊断与工具 |
| `openUrl(url)` | ACTION_VIEW 打开系统浏览器 |
| `toast(msg)` | 短提示 |

**WebActivity.java**：全屏 WebView 页，三种模式共用。
- 为什么不用 AlertDialog：`setView()` 的容器是 WRAP_CONTENT，LinearLayout 的 weight 不生效 → WebView 高度算成 0，内容区全白；且 Dialog 的 Window 默认带 `FLAG_ALT_FOCUSABLE_IM` → 点输入框软键盘不弹。两轮在对话框上打补丁都没解决，改 Activity 后从根上消除。
- 布局：竖向根布局，顶栏固定 48dp（返回 / 标题 / `detectLogin||capture` 时额外一个「完成」按钮），进度条 3dp，WebView 用 `weight=1` 填满剩余。
- 模式 1 教务登录：`EXTRA_DETECT_LOGIN`，成功判定 `isLoggedInUrl()` = 离开 `/cas/` 且命中 `/frame/`、`/student/`、`/jsxsd/` 之一。
- 模式 2 内置浏览：`EXTRA_URL`，无自动判定。
- 模式 3 抓取态（胖乖生活）：`EXTRA_CAPTURE`。注入 `CAPTURE_JS` 读 `location.href` + `localStorage.token` + 全量 `localStorage`；**每 800ms 轮询**（h5 是 hash 路由，用户点进机器详情时地址栏变但页面不重载，`onPageFinished` 不会再触发），抓到含 `machineId` 且 token 非空就自动收工。结果经 `EXTRA_RESULT` 回到 `REQ_CAPTURE` 分支 → `notifyWaterCapture()`。
- 生命周期里 `CookieManager.flush()`，`onDestroy` 里 `removeView + destroy` 防泄漏。

**Http.java**：`request(url, body, cookie, contentType, referer)` 五参兼容旧调用；主函数是七参 `request(url, method, body, cookie, contentType, referer, extraHeaders)`（`extraHeaders` 格式 `"k: v\nk: v"`）；另有 `postMultipart`（手写 boundary，把 `k=v&k=v` 拆成 part）、`text(resp)`（把 `"code|ISO-8859-1字节串"` 解回 UTF-8）。响应统一 `code + "|" + new String(raw,"ISO-8859-1")`，**Java 侧不解码**——青果是 GBK、qiekj 是 UTF-8，交给前端 `decodeAuto` 嗅探。

WebView 设置：JS + DomStorage + allowFileAccess，加载 `file:///android_asset/index.html`。无网络拦截。

**v0.4.4 还修了一个自己造成的 bug**：v0.4.2 的 `onCreate` 里写过 `CookieManager.getInstance().setAcceptThirdPartyCookies(null, true)`，第一个参数为 null 直接 NPE 闪退（一加 Android 17 打不开就是这个）。现改为 WebView 创建之后再调用，并包 try/catch。


## 6. 抓取实现要点

### 6.1 青果教务（kingo.py）
- BASE `https://qgjw.xxmu.edu.cn`，校外可直连，无需 VPN。页面 GBK。
- 登录是**两段式**：① 访问 `/` 拿 `_sessionid/_ssessionid` + 验证码图 `/cas/genValidateCode?v=1`；② **不能重访首页**（会换 sessionid 使验证码失效），取 `getTempDeskey` / `getTempNowtime`，密码 `md5(md5(pwd)+md5(captcha))`，参数用青果自定义 DES 加密（`core/jkingo.des.js` 在 node 里 vm 跑），POST `/cas/logon.action`，`status=="200"` 才算成功。
- 课表：`/student/wsxk.xskcb_excel10319.jsp?params=base64(xn=2026&xq=0&xh=学号)`，Referer 必须是 `/student/xkjg.wdkb.jsp?menucode=S20301`。
- **依赖 node**（`_enc_params` 用 `subprocess` 调 `node -e`）。移植到电脑需保证 node 在 PATH。

### 6.2 学习通（chaoxing.py）—— 只读，不做任何提交动作
- Cookie 来源：Android 学习通 App 的 WebView cookie 库 `/data/data/com.chaoxing.mobile/app_webview/Default/Cookies`，已 root 复制到 `/sdcard/Download/DSH-Go/cx_cookies.db`，`COOKIE_DB` 常量指向它，sqlite3 直读 chaoxing.com 域的明文 value。
- 三步接口（全部验证 200）：
  1. `GET mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json` → classId / courseId / cpi
  2. `GET mooc1.chaoxing.com/visit/stucoursemiddle?courseid=&clazzid=&vc=1&cpi=` → 正则抓 `data="(/work/getAllWork?...&enc=&openc=)"`（enc 每门课动态）
  3. `GET mooc1.chaoxing.com` + 上一步 href，**Referer 必须指向第 2 步页面**，否则 3004「无访问权限」
- 解析 `<li style="padding:30px 0">` 块：`a.inspectTask` 的 title/data/data2，`开始时间：/截止时间：/作业状态：` 文本。
- 考试走 `get_exam_href` / `parse_exams`，只展示不操作。
- cookie 失效抛 `CookieExpired`，`sync_hw.main()` 捕获后打印引导：让用户重开学习通 App 重登，再 `su -c 'cp .../Cookies /sdcard/Download/DSH-Go/cx_cookies.db'`。

### 6.3 从登录页读「他登录的是哪个学号」（WebActivity）
- 取消激活码后，这是唯一的身份依据：`MainActivity.openLogin()` → `openWebActivityGrab(url, "登录教务", true, grabSel)` → `WebActivity` 每 800ms（首读 1200ms）执行 `buildGrabJs(grabSel)`，把命中值留在 `lastUn`，`finish` 时塞 `EXTRA_ACCOUNT` 回来，`onActivityResult` REQ_LOGIN 分支交给 `notifyLoginAccount(ok, acct)` → JS 的 `window.__onLoginDone(ok, acct)` → `LICENSE.noteKbAccount(acct)`。
- **青果登录页是镜像输入框结构**：可见的 `input#username1` 是装饰框，HTML 里写死 `value="账号"`；真框 `input#username` 平时 `display:none`、初始无 value，由页面 jQuery 在聚焦时同步。`#password1`/`#password`、`#randnumber1`/`#randnumber` 同理。
- 因此抓取必须：①选择器 `input#username` 优先、`#username1` 只兜底；②过滤 `placeholder` 属性值与占位词表；③**不能按可见性筛**（真框本来就不可见）；④`lastUn` 只接受非空且非占位的值，防止整页换掉后被旧值粘住。四道都在 v1.1.2 落地，改动点见第 8 节。
- 学习通那条链路（`openWebFor` 的 `detect`）用 `input#phone,input#uname`，走同样的 `buildGrabJs`，同样受占位词表保护。

## 7. 打包流程

**离线验证抓账号逻辑**（v1.1.2 新增）：`tools/test_grab.cmd` 一条命令跑完 —— javac `tools/TestGrab.java`（反射调 `WebActivity.buildGrabJs`，用 `OutputStreamWriter(..., "UTF-8")` 落 `build_test/grab.js`）→ `node tools/test_grab.js`（`vm` + 极简 `document.querySelector` 垫片，按青果真实 DOM 的 6 种页面态断言）。**注意 `.cmd` 必须纯 ASCII**（cmd.exe 按 GBK 读脚本），**TestGrab 不能走 `System.out`**（控制台重定向 GBK 会把中文占位词变乱码）。

**电脑端实际使用**：`python tools/build_apk.py`（自动 sync assets → aapt2 compile → aapt2 link → javac → d8 → 合并 dex → zipalign → apksigner → 复制到 `apk/xxmu-helper-v{versionName}.apk`）。
- `--no-sync` 可跳过 assets 同步。
- **assets 同步已改成扫 `web/` 目录全量复制**（v0.5.0 改的）。早期是写死 8 个文件名的清单，加了 `jsQR.js`/`wiki.js`/`water.js` 后没同步进去，打出来的 APK 一开就缺脚本。现在还会清掉 assets 里残留的旧 `.js/.css/.html`。

Termux 里执行的原版 `build_apk.sh`（电脑端等价逻辑）：
```sh
aapt2 compile --dir res -o build/res.zip
aapt2 link -o build/app.unsigned.apk -I android.jar --manifest AndroidManifest.xml \
  -R build/res.zip --java build/gen --min-sdk-version 24 --target-sdk-version 33 \
  -A assets --auto-add-overlay
javac -source 8 -target 8 -encoding UTF-8 -bootclasspath android.jar \
  -d build/classes src/com/xxmu/helper/*.java build/gen/com/xxmu/helper/R.java
d8 --min-api 24 --output build build/classes/com/xxmu/helper/*.class
cd build && zip -j app.dexed.apk classes.dex
zipalign -f 4 app.dexed.apk app.aligned.apk
apksigner sign --ks xxmu.jks --ks-pass pass:xxmu123 --key-pass pass:xxmu123 \
  --out app-signed.apk app.aligned.apk
```
`xxmu.jks` 在 `android/xxmu.jks`（pass/keypass 都是 `xxmu123`），签名 SHA-256 = `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，**丢了就不能覆盖升级同包名**。`android.jar` 来自 `D:\android-sdk\platforms\android-33\android.jar`。

**JDK17 坑**：`d8.bat` / `apksigner.bat` 用了 `-Djava.ext.dirs`，在 JDK17 直接报 `Could not create the Java Virtual Machine`。必须改成 `java -cp <build-tools>/lib/d8.jar com.android.tools.r8.D8` 与 `java -jar <build-tools>/lib/apksigner.jar`。`build_apk.py` 已经这么写了。

**改前端后的固定动作**：`python tools/build_apk.py` 会自动同步并重打包。手动同步用 `python tools/sync_assets.py`。

**版本号要改三处**：`android/AndroidManifest.xml` 的 `versionCode`/`versionName`、`web/about.js:12` 的 `APP_VERSION`，以及 `index.html` 里 `#aboutVer` 的静态文案。虽然后者会被 about.js 覆盖，但不改会让源文件和实际显示不一致。

**发布 ≠ 出包**：`tools/publish_apk.py` 会切 `cfg.latest`，学生一开 App 就弹更新。只有用户明确说「上线 / 发版 / 发布 / 更新给他们」才是授权；只说「继续写 / 修一下 / 做好」都不是，那种情况用 `--no-publish`（只写 blob/meta，不动 `cfg`）。历史事故：v1.1.15 按惯性发布了，而那一轮的原话只是「继续写河医大助手项目」，后来回滚，1.1.15 从未上过线。

**回滚口**：`https://xxmu-auth.pages.dev` **永远可用**，它是 `cfg.latest.url` 的默认值与回滚入口 —— 自有域名 `www.xxmuhelper.top` 在校园网里可能 NXDOMAIN（学校 DNS 111.6.174.198 至今没这条记录），但 pages.dev 不受影响。客户端侧 `HOSTS` 双入口回退只在网络层失败（`ERR:` 前缀）时换域名，服务端 4xx/5xx 绝不换。**任何时候不要删掉 pages.dev 那条入口。**

## 8. 离线测试与审计报告

### 离线测试一览（不出包也能验证）

| 命令 | 覆盖什么 | 通过标志 |
|---|---|---|
| `node tools/check_web.js` | assets↔web 逐字节（**以 `web/` 目录为准全量扫，不写死文件名**）、三处版本号互校、乱码指纹、`kbMismatchAck` 引用次数、v1.1.6 教程/图片/留言/审核锚点、v1.1.7 限流/`x-xxmu-ip`/`errText` 锚点、**v1.1.8 三组 34 条**（静默失败 / 契约状态 / 显示类）、**v1.1.9 八条**（`IDX_CAP` / `cfg 解析失败，本次不缓存` / `!constEq(ak, want)` / pages 的 `arrayBuffer` + `413` / `LAST_READ_ERR` / `readErr` / `CX.readErr()`）、**v1.1.10 六条**（`ignoreQuery` / `negTtl` / `costLimit` / 兜底限流在路由之前）、**v1.1.11 十四条**（声明层 6 个 id / `disc.js` 已引入 / `Disc` 排在 `Tut` 之前 / `disc.done()` catch 必须 `return false`）、**v1.1.12 四条**（`Admin.key` 不得被当函数调用——剥注释后查 / 口令去空白 / 失败两处都提示 / 口令框关自动大写）、**v1.1.13 十六条**（`#kbBar` 五个 id / `btnShowKbRaw` / `paintKbBar` / `kbWeekStats` / `kbDiagText` / `diagReset` / `keepSample` / `About.version` / **`kbBar` 必须排在 `#grid` 之前** / **`cellRe` 必须是 `(\d)(\d{1,2})`** / **课程块正则必须是两个前瞻**）、**v1.1.14 六条**（`showDetail(id, fromRow)` / `DETAIL_FROM` / `showDetail(r.id, row)` / `card.scrollIntoView` / `DETAIL_FROM.scrollIntoView` / **详情卡必须排在名单卡之前** + 距离断言 `scrollIntoView` 紧跟 `display='block'`）、`wiki.js` 剥注释后 `prompt()` 必须为 0、动态 `innerHTML` 必须 0 命中 | `[PASS] 静态体检全部通过` |
| `node tools/test_grab.js` | `buildGrabJs` 在青果 6 种页面态下的返回值（需先跑 `tools/test_grab.cmd` 生成 `build_test/grab.js`） | `[PASS] 抓账号逻辑全部按预期` |
| `node tools/test_license.js` | `license.js` 核对状态机 45 条断言（脏值 / 换号作废 / 同号不清 / `clearCheck` 爆炸半径） | `[PASS] license 状态机 45 条断言全过` |
| `python tools/test_http_range.py` | `Http.downloadToFile` 的 4 段并发 / 退单流 / 续传 / 慢速 / 永久掐断（本地起假服务器 + 每次校验 sha256） | `[PASS] 分段下载逻辑全部通过` |
| `node tools/test_downprogress.js` | 前端 `APKDL` 的下载进度链 17 条断言（百分比不倒退 / total 未知 / 下载中重复点击 / 失败可重试 / 迟到回调不污染下一次） | `[PASS] 下载进度链 17 条断言全过` |
| `node tools/test_hwstatus.js` | 作业/考试状态解析 51 条断言（`pickStatus` 11 种标签写法 / `classify` 18 例 / `finish` 分桶 13 例含未开考 / 真实快照回归） | `[PASS] 通过 51 项，失败 0 项` |
| `node tools/test_parsekb.js` | 课表解析 38 条断言（**第 10/11/12 节必须解析出来** / **style 双引号·多空格·换序三种变体** / 一格多门课 / 周次 8 例含 `1-16周` 与逗号区间混写 / 端到端 + 诊断留样 / 0 格必须抛 / `showable=0` 但 `count>0`） | `[PASS] 通过 38 项，失败 0 项` |
| `node tools/test_api_contract.js` | 服务端 `json()` 键 vs 前端读的字段、`res.rows`/`res.list` 双字段容错、`/v1/photo`+`/v1/feedback` 的 GET/POST 方法区分、接口存在性双向对账 | `[PASS] 通过 14 项，失败 0 项` |
| `node tools/test_disc.js` | `disc.js` 使用声明层状态机 23 条断言（首次自动弹 260ms / 已看过不弹 / ✕ 与按钮等价 / gate 立着不转教程 / 解锁后转教程 / replay 不写 pref 不转教程 / pref 抛异常当没看过 / 无 Host 走 localStorage） | `[PASS] 通过 23 项，失败 0 项` |
| `python tools/verify_apk.py` | 出包后五件套（默认挑 `apk/` 下最新包）：assets 逐字节 / dex 符号 / badging / 签名证书 / **worker.js 七个锚点 + pages 的 `x-xxmu-ip` 转发** | `[PASS] 五件套全部通过` |


### 两份审计报告怎么用

`docs/audit-frontend.md`（27 条）与 `docs/audit-backend.md`（28 条）不只是待办清单，
以后再加功能时值得先扫一眼对应的那一份 —— 里面记录的全是**这一轮加新东西时踩过的同类坑**。
两份报告末尾都有一节「我检查过但认为没问题的点」，那一节同样重要：
它写着哪些地方**已经被仔细查过、不用再怀疑**，接手时先读它能省掉一半的重复排查。
v1.1.8 已修完两份报告里的全部「严重」与绝大部分「中等」；
剩下的轻微项（如上屏文案、注释里的旧名词）不影响使用，遇到再顺手改。

## 9. 给接手者的一句话

这是「零依赖、零构建、可真机直跑」的实用工具项目，风格是**先跑通再美化**：改动集中在 `web/*.js`（UI 与协议）+ `core/*.py`（数据），改完跑 `python tools/build_apk.py`（自动同步 assets）并核对 APK 内文件，再上真机验证。
