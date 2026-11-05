# 河医大助手 · 当前状态（STATE）

> 自动生成，**别手改**。重新生成：`python tools/state.py`。
> 生成时间：2026-11-05 08:51
> 接手一个会话时只读这一页；架构与踩坑细节见 [HANDOFF.md](HANDOFF.md)，
> 历史每一版改了什么见 [docs/handoff/changelog.md](docs/handoff/changelog.md)，
> 待办见 [docs/handoff/todo.md](docs/handoff/todo.md)。

## 1. 代码版本（读自磁盘）

| 位置 | 值 |
|---|---|
| AndroidManifest versionName | **1.1.22** |
| AndroidManifest versionCode | **1122** |
| web/about.js APP_VERSION | 1.1.22 |
| web/index.html #aboutVer | 1.1.22 |

## 2. 本地最新的包

| 项 | 值 |
|---|---|
| 文件 | `apk/xxmu-helper-v1.1.22.apk` |
| 大小 | 571000 字节 |
| SHA-256 | `33e4d7445d649259abefffb73e67e544c15a5a0f0f8f2796a91262d4705d999b` |
| 出包时间 | 2026-11-05 08:46 |
| 包内版本（aapt2） | 1.1.22 / 1122 |

注意：**多个版本常常字节数相同**（v1.1.16 与 v1.1.17 都是 558650），
只能靠 SHA-256 和包内符号区分，别用大小认版本。

## 3. 线上现在发的是哪一版

探测入口：`https://xxmu-auth.pages.dev`（另一个是 `https://www.xxmuhelper.top`）

| 字段 | 值 |
|---|---|
| latest.version | **1.1.17** |
| latest.code | 1117 |
| latest.size | 558650 |
| latest.sha256 | `e75cfc7c4ac94de3` |
| latest.url | https://xxmu-auth.pages.dev/v1/apk |
| apk.name（blob 里实际的包） | xxmu-helper-v1.1.17.apk |
| min.code（强制淘汰线） | 0 |
| enforceVer | True |
| updPolicy | nag |
| qq | 1097668324 |
| maxDev | 3 |

> 线上 latest 与本地最新的包**不是同一个**（sha 不同）。

> 本地已到 **1.1.22**，线上还是 **1.1.17** —— 新版本**还没发**。
> （用户说「继续写」不等于授权发布；只有说「上线/发版/发布」才切 latest。）

## 4. 仓库位置

| 项 | 值 |
|---|---|
| 分支 | main @ `5d306ee` |
| origin/main | `f921482` |
| 领先远程 | 4 个提交 |
| 未提交改动 | 0 个文件 |

最近提交：

```
5d306ee fix(tools): 收尾比对照走 API tree，不假设本地有远程 commit 对象
5e46332 refactor(tools): push_via_api 的收尾抽成 finish()，两条推送路径共用
2cc4610 fix(tools): push_via_api 推送后自己对齐 origin/main，不再让人手动 reset --hard
7c01651 feat(learn): 学习页新增「我的待办」（纯本地）+ 交接文档拆成三层
f921482 fix(tools): push_via_api 支持远程分叉时以远程提交为父提交
4a03bb7 docs: 加入 HENUBox 对比分析
```

## 5. 常用命令（复制即用）

```powershell
$env:Path += ';C:\Program Files\Git\cmd;C:\Program Files\nodejs'   # git / node 都不在默认 PATH

node tools/check_web.js                 # 静态体检（版本三处一致 / assets 同步 / 各版锚点）
node tools/test_mytodo.js               # 以及 tools/test_*.js 全套离线测试
python tools/build_apk.py               # 出包（自动同步 web/ -> assets/）
python tools/verify_apk.py              # 出包后五件套校验
python tools/bump_ver.py 1.1.22 1122    # 版本号三处同改
python tools/publish_apk.py --no-publish  # 只上传不通知（默认就该用这个）
python tools/publish_apk.py             # 真发布：切 cfg.latest，学生一开就弹更新
python tools/state.py                   # 重新生成本文件
```

工具清单与每套测试覆盖什么，见 HANDOFF.md 第 7 节与「离线测试一览」。

## 6. 未完待办

- [ ] **PC 移植**已完成大半：`core/paths.py` 集中解析 `COOKIE_DB`/`PUSH_DIR`/`PUSH`/`XN`/`XQ`/`TERM`（环境变量 `XXMU_*` 优先，PC 默认 `XXMU_PUSH=0`）；入口 `python tools/sync_all.py`（退出码 0/2/3/4），PowerShell 包装 `tools/run_sync.ps1`，定时样例 `tools/crontab.sample`，说明 `PC-SETUP.md`。
- [ ] **前端预览**：`python -m http.server` 起 `web/`，或直接用 headless Edge `--dump-dom` 跑（`Host` 未定义时代码已 fallback，可跑）。
- [ ] **数据外置**：APK 已支持外部 JSON 优先 + App 私有目录缓存，可考虑改成本地 http 拉取，免重打包。
- [ ] **胖乖生活真机联调**（v0.5.0 遗留，v1.1.0 又加了结算）：拿到真实 token 后确认 `goods/normal/skus` 的实际入参名与 `goods/water/unlock` 成功响应结构；确认 `goods/endWater` 的返回形状与 `goods/shower/sync` 的 `status/amount/identify` 真实值。判据：405 = WAF 挑战（重试），404/200-JSON = 路径存在。
- [ ] **代码质量**：`app.js` 已 3500+ 行，仍是单文件零依赖。若要长期维护可拆，但**保持无构建链**更稳。
- [ ] **联机授权**（v1.1.0 已改）：激活码已取消，改为「填学号即可进 + 登录教务自证学号」。仍能做的加固：服务端可校验 `fp` 与设备名额（已有）、`rev:` 黑名单（已有）；若要更强可要求登录教务后由客户端上报一个服务端可验的凭证，但青果没有开放 OAuth，投入产出比不高。
- [ ] **待真机验证的三件事**（v1.1.0 遗留，v1.1.2/v1.1.3 仍未做）：①青果登录页 `input#username` 在真机 WebView 里能否稳定读到（`onPageFinished` 时序）；②学号不一致时拦课表同步的提示是否清楚；③饮水机结算全链路。
- [ ] **真机连接方式**（每次都要重来）：`adb pair HOST:PAIR_PORT 配对码` → `adb connect HOST:CONNECT_PORT`。无线调试的连接端口**每次重连都变**（配对端口与连接端口无关，配对成功后不用再配对）；找不到端口时扫 30000-65535。`adb devices -l` 空 + `adb mdns services` 空 = 手机没开无线调试，只能请用户开。
- [ ] **改中文文件只能用 read/edit/write 工具**：v1.1.2 那次用 `Get-Content -Raw` + `-replace` + `WriteAllText(UTF8Encoding($false))` 改 `index.html`，字节数从 37434 涨到 42457、行数 722（应为 763）、`<title>` 变成 `娌冲尰澶у姪鎵?/title>`。**`[Text.Encoding]::UTF8.GetString` 是宽容解码，不会产生 U+FFFD，所以「replacementChars=0」证明不了没坏** —— 要靠字节数与 `android/assets/` 里的副本对比，或者跑 `node tools/check_web.js`（现在会查乱码指纹并 exit 1）。
- [ ] **PATH 里的 `adb` 是坏的，别用**。`C:\Windows\system32\adb.exe` 是 1.0.32 老版本，`adb devices` 会先打印 `adb server is out of date. killing...` 然后 `CreateProcess failure, error 2` / `failed to start daemon`；`adb mdns services` 甚至只吐 help 文本。真正的 adb 在 **`D:\android-sdk\platform-tools\adb.exe`（1.0.41 / 37.0.1）**，脚本和命令里都写全路径。这个坑会让「手机没连上」和「adb 本身坏了」看起来一模一样。
- [ ] **解析类 bug 要按「失败方式是静默」来设计防线**。v1.1.5 的两个 bug（占位符当学号、状态读不到当已完成）表现都是「不报错、不警告，只是默默给了一个错答案」，靠日志和 try/catch 都发现不了，只有用户肉眼看出「这条不对」。所以这类改动必须配三样东西：①离线断言（`tools/test_hwstatus.js`、`tools/test_license.js`）；②静态锚点（`tools/check_web.js` 里断言关键符号还在，防被人「顺手简化」改回去）；③**原始输入留样**（`CX.diag()` + 「查看作业状态原文」按钮，出问题能立刻拿到页面原文，不必再靠截图反推）。缺第③条时，下一次学习通改版只能重新猜一遍标签结构。
- [ ] **拿不准时的默认值要考虑「错了有多贵」**。作业状态判成「待做」最多让用户多点开看一眼，判成「已完成」会让他错过截止、不可逆 —— 所以 `unknown` 一律站「还得做」这边。同理，`test_hwstatus.js` 里「未交 + 已过截止」这一条我第一版把期望写反了（写成不算待做），跑出 FAIL 才纠正；**测试期望本身也会朝「看起来更整洁」的方向漂，要拿用户实际痛感去校**。
- [ ] **Worker / Pages Functions 里写 `cache-control` 不会让边缘缓存**。这是 v1.1.6 之前一直存在的误解：`handleConfig` 每个请求都读一次 KV，谁都以为「加了 cache-control 就有缓存了」。实际上 Worker 响应默认**根本不进边缘缓存**，必须显式 `caches.default.put()`。改成了 `edgeCache()` 包装器，并加 `x-edge: hit|miss` 响应头 —— **有了这个头，缓存生效没生效连打两次就能验，不用猜**。凡是「我加了缓存头了」的判断，都要用这个头或 `cf-cache-status` 复核一遍。
- [ ] **管理接口要同时防「放大」和「写额度」**。KV 免费额度是 10 万读 + **1 千写**/天，写特别少。用 KV 做限流计数器等于把防刷本身变成刷（每次拒一个请求还要写一次 KV）。所以限流一律用 isolate 内存 `Map`：会随重启丢，但 isolate 按机房分布、生命周期以分钟计，真被刷时每个机房各挡一部分，成本为零。另加体积上限（`content-length` 早退）与条数硬上限（待审 ≥40 张直接拒），这两条不依赖内存状态，跨 isolate 也有效。
- [ ] **前后端字段名不一致是「跑一遍看不出来」的 bug**。`res.list` vs `rows` 那次的表现是接口 200、不报错、不抛异常，就是永远空 —— 靠功能测试发现不了（看起来像「还没人上传」）。这类问题只能靠把两边字符串拿出来对照，见 `tools/test_api_contract.js`。**写这种测试要只扫指定函数体，别全文件扫** —— v1 全文件扫 `res.xxx` 把 `document.createElement` 的 `res.appendChild` 也当接口字段，报 20 个假阳性，噪声一大片后测试就成摆设。
- [ ] **Android `WebChromeClient` 默认不实现 `prompt()`**，`prompt()` 静默返回 `null` —— 既不弹框也不报错。项目里 WIKI 和 GUIDE 的「+ 补一条」靠三个 `prompt()` 收输入，**从上线起就是死的**，一年多没人发现，因为点一下只是「什么都没发生」。修法两条并行：Java 侧重写 `onJsPrompt`（`AlertDialog` + `EditText`，异常也必须 `result.cancel()`，否则调用方永久 pending），前端把重要的那处改成 `#sheet` 表单。**判断标准：收集 ≥2 个字段就用表单，别用 prompt。**
- [ ] **iOS 之外还要考虑「手机端能不能跑完」**。上传校园图片时字节**从不进 JS**：`Host.pickPhotoForUpload` 在 Java 侧解码、缩放、压缩、流式上传，前端只收进度与结果。若改走 base64 塞进 `postMultipart`，1.5 MB 图 → 2 MB base64 字符串 → 峰值吃 6 MB 堆，低端机直接被系统杀掉。
- [ ] **按 IP 限流在「反代 + NAT」这套组合下等于没有限流**（v1.1.7 的血案，值得反复读）。两件事叠加：①学校 NAT 后面几百人共用一个出口 IP；②Pages Functions 从 Cloudflare 内网发起新请求，`cf-connecting-ip` 变成 Cloudflare 自己的 `2a06:98c0:3600::103`。于是所有按 IP 的计数变成「全校共用一个桶」——`5 条留言/天` 真的就是全校 5 条。**这类 bug 的特征是「单人测试永远通过」**，一个人怎么测都在阈值内，只有第二个班的人开始用时才炸。修法三层：Pages 层用自定义头（`x-xxmu-ip` + `x-xxmu-via` 标记）把真实 IP 带过内网跳、Worker 侧只在标记匹配时才信这个头、限流主键改成设备指纹 `fp`。另留一个 `/v1/_diag` 常驻自检（只回布尔不回原文），每次重新部署 Pages 后打一次确认 `viaProxy=true`。
- [ ] **一次 KV 读失败就永久清空真实数据，是这类「索引 + 明细」结构最危险的失败方式**（v1.1.8）。`getIdx` 原实现把「读空」当「首次迁移」，重建后无条件写回；而重建的数据源（`lic:`）在新版本里早已不再写，重建结果必为空。于是**一次 KV 抖动 = 管理名单永久清空**，不可逆、无备份、日志里只有一行 read 失败。规律：凡是「读失败 → 自动修复 → 写回」这种带自动决策的路径，都要先区分「键不存在」和「读失败 / 内容坏」。**坏值一律不写回**，让上层看到 `null` 并报错，比「贴心修复」安全得多。同样的错误在 `getCfg` 上也有一份（读空与 JSON 损坏都回落 `DEFAULT_CFG` 并缓存 60 秒 → 公告消失、`latest.url` 变空，60 秒后自愈）。
- [ ] **免费额度的天花板要按「单个请求的子请求数」算**，不只是按天算。Cloudflare 免费版单个 Worker 请求最多 50 次子请求（KV 读算），`handleAdminFeedback` 原来一次读 200 条留言正文 —— 留言超过 51 条这个接口就永远 500，而且报的是「服务端忙」，完全指不到原因。**列表接口必须分页，且页大小要留出余量**（现在 `PAGE = 40` + 1 次读索引 = 41，`handleFeedbackList` 更是降到 30）。
- [ ] **写额度（1000/天）比读额度稀缺得多，要看住「每次请求写几次」**。`/v1/activate` 原来 3 读 3 写，其中「激活时把整个名单索引重写一遍」最致命 —— 一个学生一天开十次 App 就是十次全表写。修法不是加限流，而是**别写**：`idxApply` 只在真有变化时才 `putIdx`，已存在的学号连 `at` 都不刷。凡是「每次都写」的记账逻辑，都要问一句「这次真的变了吗」。
- [ ] **锁在 UI 线程的图片解码不一定 ANR，但一定会被系统杀掉**。4000×3000 一张 48 MB，ZXing 再 `int[w*h]` 又 48 MB。正确姿势是两段式：先 `inJustDecodeBounds` 读尺寸，`while (longest / sample > N) sample *= 2` 粗采样，再按 `inSampleSize` 精确解码。**采样比缩放省在解码前**，先解大图再 `createScaledBitmap` 峰值已经吃满了。
- [ ] **下载完不校验哈希 = 把「装坏包」当成正常分支**。分段并发只保证每段长度对，拼起来是不是原文件它不知道；错在 zip 未签名区域时**签名照样过**，学生会装上一个半坏的 App。校验要流式（`DigestInputStream`），不能用 `readAllBytes`。第二参（期望哈希）设计成空串可跳过 —— 老前端不传时不至于直接失败。
- [ ] **「读失败」和「没数据」在界面上长得一模一样，是这一项目最反复的坑**（v1.1.9 又修一次）。`CX.cached()` 里 `JSON.parse` 失败直接 `return null`，而 `renderHomework()` 把 `null` 解释成「还没同步过学习通」——于是「缓存写坏了」显示成「你没登录」，用户唯一能做的就是反复点同步，每次都覆盖失败。规律：**凡是 `catch → return 空值` 的读路径，都要额外带出一句人话的原因**（这里是模块级 `LAST_READ_ERR` + `readErr()` 导出），让上层能把「没有」和「读不出来」分开渲染。
- [ ] **`catch` 里返回默认值 + 缓存，等于把「一次故障」固化成一分钟的「新常态」**。`getCfg` 原来读空和 JSON 损坏都回落 `DEFAULT_CFG` 并缓存 60 秒，外面还套 `edgeCache` 60 秒 —— 公告消失、`latest.url` 变空，日志一个字都没有。修法不是「加日志」而是**改默认动作**：读不出来就**不缓存**，下一次请求重试。缓存的前提是「这次真的读到了」。
- [ ] **无凭证接口的写放大要设硬上限，但上限的落点要选在「损害最小处」**。`/v1/activate` 谁都能调，假学号每次新增 1 条 + 1 次 KV 写，1000 写/天烧光后**全站管理操作 500**。加 `IDX_CAP = 5000` 时特意让**激活本身继续成功**（票照发、课表照看），只把「入名单」这一步停掉 —— 损害从「全校当天不能用」降到「名单少几条」。凡是封顶，都要问一句「封在哪一层，用户还剩下什么」。
- [ ] **Pages Functions 里把 `await request.arrayBuffer()` 裸露在 try 外，会把平台默认 500 HTML 弹给用户**。客户端 `"上传失败：" + body` 按 `|` 拆不开，整段 HTML 直接显示在手机上。修法：包 try 并回 `413` + JSON。**结论：所有跨进程边界的异常都要自己兜成契约格式，别指望运行时给你一个能解析的 body。**
- [ ] **KV 的 REST 读接口返回的是原始字节，不是数字数组 JSON**。早期脚本多套了一层 `JSON.parse`，把 `idx` 读成 `"       "`（一堆空格），看起来像「索引是空的」——差点据此以为名单丢了。判据：响应头 `content-type: application/octet-stream`，`buf.toString('utf8')` 直接可用。
- [ ] **新加一层「必须看见」的弹窗，要按 z-index 全场排序来定，不能凭感觉**（v1.1.11）。`#disc` 最初写 `z-index: 74`，理由是「比 `#tut` 的 70 高一层」——但 `#gate` 是 100、`#upd` 是 120、`#ntc` 是 125、`#onb` 是 130，声明会被激活门和更新提示整个盖住。**被盖住 = 没看见，而且用户以为「点不动」**。改到 132。规律：凡是「必须在某个时刻被看见」的层，定 z-index 之前先把全表的 z-index 拉出来排一遍；只跟相邻的那个比较，一定漏。
- [ ] **同一个开关变量别在两层都清**。`disc.js` 里 `show()` 清 `replayMode = false`，而 `replay()` 是「先置 true 再调 `show()`」→ 立刻被自己踩掉，重看声明之后仍然会转教程。`tools/test_disc.js` 的 `[6]` 组就是这个 FAIL。修法：拆出 `showFirst()`，只在「首次自动弹」这条路径清标志。**规律：一个标志只该有一个写入点；如果两个入口都需要它归零，那是两个函数，不是一个函数加个参数。**
- [ ] **`wrangler secret put` 从 PowerShell 管道读进来会带一个尾随换行**（v1.1.12）。`$k | npx wrangler secret put ADMIN_KEY` → wrangler 打印 Success，但服务端 `constEq` 逐字节比对永远不等，所有管理请求 401，而错误文案只有「管理员口令不正确」——看不出是长度问题。同类问题在 `.env`、`--data`、`ConvertTo-Json` 落盘（带 BOM → `{"code":10026,"message":"Could not parse request body."}`）上都出现过。**规矩：任何「逐字节比对」的凭据，写入前先 `[IO.File]::WriteAllText` 落一个无 BOM 无换行的文件，再 `cmd /c "type 文件 | wrangler secret put KEY"`；写完必须用真实请求验一次，不能只看 wrangler 的 Success。**
- [ ] **属性被当成函数调用 = 整个入口从第一行就断了，而且界面上一个字都不会说**（v1.1.12）。`AUTH.Admin.key` 是字符串属性，`app.js` 写成 `AUTH.Admin.key ? AUTH.Admin.key() : ''` → 存过口令后必然抛 `TypeError: ... is not a function`。这行在所有 `XXMU.pref(...)` 之前，于是「保存口令并连接」按钮**四个版本**里都是点了没反应；用户看到的红字其实来自另一个元素（`#admStatMsg`，用旧口令拉的统计），两条消息分属两个元素，看起来像「新口令也不对」。**规矩：①一个值有几种形态（属性 / 函数 / 可空），调用点必须唯一，别在业务代码里现编；②一个动作的失败提示要写在同一处可见位置，两个提示位各说各话比没有提示更误导；③静态锚点要剥注释再查 —— 修复说明的注释里就引用了那个错误写法，不剥会自己命中自己。**
- [ ] **「界面什么都不说」有时候不是没写提示，而是提示被排版挤出了屏幕**（v1.1.13）。课表页的状态说明（`#kbtip`、`#kbEmpty` 浮层）一直都有，写在 `#grid` 后面；但 `PERIODS` 最少 14 行、`grid-auto-rows:46px`，网格本身就 690px 上下，手机一屏根本装不下。于是「没同步」「周次没读懂」「本周确实没课」三种状态在屏幕上完全一样：一张白纸。**规矩：①判断「有没有提示」不能只看代码里有没有那段文案，要看它在 DOM 里的位置和容器高度 —— 状态类信息一律排在会被滚动的长内容之前；②三种不同原因绝不允许共用一个视觉结果，否则等于没区分；③给这类位置写静态锚点（`indexOf('id="kbBar"') < indexOf('id="grid"')`），比人眼复查可靠。**
- [ ] **正则「写宽松」不等于「写对了」：串联的 `[^>]*` 只放宽了空格和引号，没放宽顺序**（v1.1.13）。课程块原来是精确匹配 `style='padding-bottom:5px;clear:both;'`，改成 `[^>]*padding-bottom:\s*5px[^>]*clear:\s*both[^>]*` 后看着宽松，但学校把 `clear:both` 挪到前面时依然失配 —— `tools/test_parsekb.js` 的 `[3]` 组当场跑出 2 项 FAIL。正解是两个独立前瞻 `(?=[^>]*A)(?=[^>]*B)`，属性顺序任意。**规矩：凡是要「顺序无关」，就用并列的前瞻断言，不要用串联的通配；而且必须造一个「换序样本」的测试用例，否则这个洞永远测不出来。**
- [ ] **解析器丢数据的方式是「整格消失」，不是抛异常**（v1.1.13）。`cellRe` 里 `id=['"]k(\d)(\d)['"]` 只认一位节次，第 10 节 `k110` 会先吃 `"11"` 再要求引号、撞上 `"0"` → 失配 → 那一格连同里面的课一起消失，不进 `bad[]`、不报错。**规矩：写「按 id 编号取内容」的正则时，编号位数必须显式给上界（`\d{1,2}`），并且用「编号到两位数的样本」当回归用例 —— 第 1~9 个永远测不出这个洞。**
- [ ] **「点了没反应」的第二种形态：内容真的生成了，只是落在视口外面**（v1.1.14）。名单页「详情」按钮 `card.style.display='block'` 生效、`AUTH.Admin.state()` 请求发出、结果渲染进了 `#admDetailBody` —— 但 `#admDetailCard` 排在名单卡下面，而名单卡自己就是「搜索框 + 筛选条 + 46vh 列表 + 刷新按钮」，详情卡被推到一屏之外。用户描述只有一句「点详情没有用」。**规矩：①`display:none → block` 不等于「用户看见了」，凡是展开一块内容，必须同时决定「它在哪、要不要滚过去」；②能挪位置的优先挪到触发按钮附近，别只加滚动 —— 长卡片下面再滚动，手感是「页面猛地跳一下」；③给这种位置关系写硬断言（`indexOf('id="admDetailCard"') < indexOf('id="admListCnt"')`），并加一条距离断言（`scrollIntoView` 必须紧跟 `display='block'`），光有文案没有位置等于没修；④排除服务端时先用真实凭据打一次接口，别在前后端之间来回猜 —— 这次 `curl /v1/admin/state` 一次就证明接口是好的。**
- [ ] **`publish_apk.py` 原来没有网络重试，一次 TLS 握手抖动就整趟发布中断**（v1.1.14）。连跑两次都在 `kv_put('apk:blob')` 上崩：`_ssl.c:985: The handshake operation timed out`、`EOF occurred in violation of protocol (_ssl.c:2423)`；同一时刻 `curl.exe` 打 `api.cloudflare.com` 是 0.77 秒 400、打站点 200 —— 不是令牌失效、也不是封禁，是学校这条网到 CF API 的握手偶发被掐。**规矩：①所有发往境外的写操作都要带退避重试；②只重试网络层异常，`urllib.error.HTTPError`（4xx/5xx）是明确答复，重试只会把「口令错」变成「等 12 秒后还是错」；③重试日志要打出来（`网络抖动（URLError），2 秒后重试…`），否则下次又会被当成发布失败。**
- [ ] **pwsh 里 `curl.exe --data-binary '{"ids":[...]}'` 会被引号解析吃掉**（v1.1.14）。表现是服务端回 `{"ok":false,"msg":"没有合法学号"}` —— 看起来像接口坏了或参数名写错，实际是 JSON 根本没到。**规矩：任何带双引号的 JSON 都先 `[IO.File]::WriteAllText` 落成无 BOM 文件，再 `--data-binary "@D:\_x.json"`。**（同类：`node -e` 里含双引号的正则会炸，要落 `.js`。）
