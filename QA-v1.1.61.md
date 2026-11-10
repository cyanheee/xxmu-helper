# 河医大助手 v1.1.61 发版 QA 报告（两轮迭代合并 · 水墨云图浅色 + 万人级像素彩蛋 v2）

日期：2026-11-10　写域：`web/` + `design/sketch/` + `tools/` + `server/pages/dist/` + `apk/` + `android/`
形态：单 APK 离线 WebView，`web/` 纯静态无框架无构建，aapt2/javac/d8/apksigner 手工打包。
仓库根：`C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app`

## 1. 两轮需求与目标演变

| ref | 用户原话（短引） | 落点 |
| --- | --- | --- |
| m00002 | 「回忆河医大助手进度，这个上下课时间没对齐…动画有点不流畅…可以在某些地方加一个会动的马里奥什么的，加一个塞尔达的人物等等，标一个气泡，有一些著名的台词…不遮挡重要内容，美观，好看，流畅」 | 第一轮：时间对齐 + 流畅度 + 彩蛋 v1（已交付，见 §3 上半） |
| m00477 | 「浅色模式的颜色风格可以参考三角洲行动里的麦晓雯的水墨云图配色。以后我给你要求你都出几套方案先让我选择，修改，然后再动手制作。这一版优化完浅色风格以后就上线吧，像素小人要有一些基础动作，气泡里的语音也多一点，英文加翻译，最好点击会有原版音效，比如马里奥点它一下就说一句"马里奥"（原版音效）」 | 第二轮主体：水墨云图浅色 + 彩蛋 v2；同时立下全局新规矩「先出几套方案让 YG 选/改再动手」 |
| m00561 | 「也把作者联系方式qq改成692962849，邮箱692962849@qq.com」 | 全库替换 90 处 / 25 文件；`1097668324` 是更新群号，保持不变 |
| m00591 | 「官网的联系方式别忘了改，这一次你先自己决定，选出最好看的方案，先上线，我要先睡觉了」 | 授权自选配色 + 做完直接上线（部署官网 + 切 cfg.latest 两条一起） |
| m00623 | 「你不用高效，我只要高质，哪怕你做一整晚都没事，一定要给我那种万人级别的游戏的品质，丝滑，好看，流畅，有趣，细腻等等，各种可玩性很高，不要太容易就腻了」 | 品质门槛拉满：彩蛋要做成万人级游戏质感、长期不腻 |

## 2. 方案抉择：三套预览 → 选 A 花青云水

外部检索「三角洲行动 麦晓雯 水墨云图配色」拿不到官方色板（百度百科 403、公众号验证墙、小红书 404），靠语义推断 = 宣纸米白/青灰留白 + 花青淡墨晕染 + 朱砂印章红。先出三套预览（`design/sketch/make_ink_preview.js`，PREVIEW ONLY 不碰 `web/`）+ 无头 Edge 390x1500 实拍逐块核对：

| 预览 | 文件 | SHA-256 前 16 | 特征 |
| --- | --- | --- | --- |
| A 花青云水 | `design/sketch/shots/ink-a-390x1500.png` | `01BB72709B7B1939` | 花青/青绿山水、冷调、墨蓝石板顶栏 |
| B 朱印云图 | `design/sketch/shots/ink-b-390x1500.png` | `7B809E7B94032E80` | 朱砂印红、暖宣纸 |
| C 留白淡墨 | `design/sketch/shots/ink-c-390x1500.png` | `94C2FB94AAD0E5CC` | 极简留白、雾光紫点缀 |
| 三套拼图 | `design/sketch/shots/ink-compare-3.png` | `DC8605A060ADC69B` | 1170x1544 逐块核对 PASS |

YG m00591 授权自选 → **选 A 花青云水**：花青/青绿山水最贴「水墨云图」，冷调延续现有青绿主色，墨蓝石板顶栏不压黑（对应「不要那么多黑」），三层晕染即「云图」。

落地范围（关键决策）：ink 配色 = **App 浅色档专属**新文件 `web/nova-ink.css`，scope `html[data-skin="nova"]:not([data-theme="dark"])[lang]`（特异性 (0,3,1) 压过 medium/skin 派生层 (0,1,1)/(0,2,1)）；**经典档 / 深色档 / 官网配色一律 0 影响**（官网只改联系方式 + BUILD 缓存键）。根令牌 `web/nova-skin.css:8-20` 一个字未动（NOVA_PAIRS 同源锁不破）。

## 3. 改动清单（两轮合并）

第一轮（m00002，课表时间对齐 / 流畅度 / 彩蛋 v1）：

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `web/nova-polish.css` | 新建 | §A 时间对齐：`.gp .gt` 与 `.c .pr` 同绝对定位于行顶 + 12px 行高 + 1px 底刻线 → y=14px 基准线；节次号垂直居中；`.pr2` 贴卡底收口；tabular-nums 9px + ellipsis。前缀 `html[data-skin="nova"][lang] #grid.grid …` (1,5,1) 抬过 `nova-medium.css` (1,4,1)。§B 流畅度：传送带 240ms transform 吸附、连点切周挂 `.nv-fastweek` 关过渡、contain 隔离、reduced-motion 兜底 |
| `web/nova-organs.js` | 改 4 处 | `setOffset()`/`spin()`/`paint()` 的 `--shift`/`--rot`/`--x` 逐事件写改 rAF 合并；`goWeek()` 连点期间挂 `.nv-fastweek` 关过渡（根治「切周触发 renderWeek 全量重建」的卡顿） |
| `web/index.html` | 改 | 挂 polish/easter 两个 `<link>` + 1 个彩蛋 `<script>` |
| `design/sketch/make_nova_real.js` | 改 | 长图夹具把 `#eg-stage` 覆写成 absolute 390x1500、`.eg-actor{bottom:140px!important}` |

第二轮（m00477+m00623，水墨云图 + 彩蛋 v2 + 发版）：

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `web/nova-ink.css` | 新建 | A 花青云水浅色派生层：令牌级覆写 `--n-ink:#1C2B30` / `--n-accent:#2E6E76` / `--n-graphite:#33474D` / `--n-m-card:#FCFDFC` / `--n-m-glass:#CBDAD7` / `--n-m-grid-cell:#DCE7E3` / `--eg-clock:#3A5560` 等；5 层 background-image（3 radial 花青晕染 + repeating-linear-gradient 纸纤维 + linear `#F3F1EA→#EAEDE9→#E1E7E4`）；`#grid .c.today`/`.gh.today` 强调色；`#top` 花青上缘天光；reduced-motion 兜底 |
| `web/nova-easter.js` | 整文件重写 v2 | 独立 IIFE（不碰 app.js、不进 ORGANS 表）。8 帧 POSE（idle/blink/step/jump/wave/cheer/power/sleep，`patch(base,diffs)` 派生 + `spriteSVG` run-length inline SVG）；NORMAL 各 12 句英中双语 `{en,zh}` + RARE 各 3 句 + BANTER 4 组 + `comboQuote` + `echoQuote()`（只读 `.nv-belt-next` 真实状态，绝不编钟点）；Web Audio 合成 8-bit 音效（`audio.mario()` 523→659→784 三音模拟「Ma-ri-o!」、`audio.link()` triangle、coin/jump/power/fanfare，master gain 0.13、懒初始化首个手势、mute 持久化）；`localStorage 'xxmu_eg_v2'` 持久化 taps/coins/combo/best/seen 图鉴/ACH 6 成就；`tap()` 连击 2800ms 窗口 + 每日首次 +5 + 15% 拌嘴；`bindTap` pointerdown 520ms 长按切静音；`build()` 首帧静态兜底（夹具杀 timer 也能出图）、later/unlater 全包 try/catch；`loop()` beat 眨眼/走步/换台词/拌嘴/状态呼应 |
| `web/nova-easter.css` | 整文件重写 v2 | 保留 b15 布局契约（`#eg-stage` z-index:18 / pointer-events:none、`.eg-actor` `bottom:calc(96px + env(safe-area-inset-bottom))`、左右 96px 中间 198px 留空），只在 `.eg-sprite` 开 `pointer-events:auto`（舞台仍 none，不抢课表点击）；气泡 `.eg-en`+`.eg-zh` 两行 + `.eg-badge` 计数 + `eg-rare` 金边 + `eg-pop`；`.eg-frame` 8 帧叠放 opacity 切换；8 条 `data-pose` 动画 + 粒子 `.eg-p` / 浮字 `.eg-float` / 成就 `.eg-toast`；reduced-motion 全 static |
| `web/index.html` | 改 | 挂 `nova-ink.css`（在 `nova-campuscard.css` 之后、`pop.css` 之前）；`aboutVer` → v1.1.61 |
| `web/about.js` | 改 | `APP_VERSION='1.1.61'`；`DEV_QQ='692962849'` / `DEV_MAIL='692962849@qq.com'`（m00561） |
| `android/AndroidManifest.xml` | 改 | `versionCode="1161"` / `versionName="1.1.60"→"1.1.61"` |
| `server/pages/dist/_worker.js` | 改 | `const BUILD = 'v1.1.61-nova';`（缓存键整批失效） |
| `server/pages/dist/index.html` | 改 | 官网联系方式三处（:557/:581/:585）→ 692962849 / 692962849@qq.com |
| `tools/check_site_skin.js` | 改 :40 | BUILD 断言改为**从 manifest versionName 派生**，不再写死版本字面量（避免每次发版忘改造成假绿） |
| `design/sketch/shoot-nova-one.ps1` | 改 | 加 `[switch]$Reduced` → Edge `--force-prefers-reduced-motion`，出静态档实拍 |
| `apk/v1.1.61.notes.txt` | 新建 | 学生视角更新说明（浅色水墨 / 像素小伙伴多动作双语点击音效连击金币成就 / 顺滑不挡事 / 别的照旧），结尾「更新群：1097668324」，避开 check_notes 的 22 个禁用词、无 Markdown 项目符号 |

约束保持：`.gp .gt` 的 HH:MM 文本与 `.c .pr/.pr2` DOM 一字未删（`todayNext()` 依赖真实作息）；经典皮肤原样保留；双轴正交（data-theme=auto/light/dark 存 xxmu_theme + data-skin=classic/nova 存 xxmu_skin）；原版音效全离线（Web Audio 合成，不引外部采样 URL）；未 git commit / push（House rule）。

## 4. 实拍核对（无头 Edge，`--headless=new --window-size=390,1500 --virtual-time-budget=900 --force-device-scale-factor=1`）

| 截图 | 尺寸 | bytes | SHA-256 前 16 | verify 结论 |
| --- | --- | --- | --- | --- |
| `design/sketch/shots/v1161-ink-light.png` | 390x1500 | 197714 | `DCC4E30D62130BA9` | PASS：宣纸青绿晕染可见、瓷白卡片、时间对齐、两个小人和双语气泡都在、中间铭牌与 5 Tab 留空、无溢出无白字压白底 |
| `design/sketch/shots/v1161-ink-dark.png` | 390x1500 | 304975 | `EE5F4B9CB6568E69` | PASS：紫夜舱深色配色原样、双语气泡与两小人可见、无溢出（ink 层 0 命中） |
| `design/sketch/shots/v1161-classic-light.png` | 390x1500 | 99587 | `05A4CED9B1DF9AD9` | PASS：无彩蛋、无花青配色、牛皮纸原版布局完整（ink + 彩蛋对经典档 0 影响） |
| `design/sketch/shots/v1161-ink-light-reduced.png` | 390x1500 | 197721 | `F4721D47D630DE8C` | PASS：动画全停、双语气泡与两像素小人静态保留、无溢出、布局与常动档一致 |
| `design/sketch/shots/v1161-ink-dark-reduced.png` | 390x1500 | 304988 | `06F6E8C66B4BE2E5` | PASS：深色 reduced 静态终态无信息丢失 |

逐块结论：
- **浅色水墨**：宣纸米白底 + 三层花青晕染可见但不噪，瓷白课程卡与青绿 today 强调色分明；墨蓝石板顶栏非纯黑；卡片不裁字、时间与左列刻度同一把尺子。
- **彩蛋 v2**：马里奥（左）+ 林克（右）各带英中双语气泡，首帧 `"It's-a me, Mario!" / 是我呀，马里奥！` 与 `"It's dangerous to go alone! Take this." / 一个人上路太危险！拿上这个。`；落在「AI 改课表 / 成绩」按钮下方到铭牌条之间空白带，不压课名/按钮/`CH 01 · TIMETABLE` 铭牌/5 Tab；中间 198px 完全留空。
- **隔离性**：深色档与原版紫夜舱一致、经典档哈希独立 = 水墨层与彩蛋对两者 0 影响。
- **reduced**：`--force-prefers-reduced-motion` 下 8 条 pose 动画、粒子、浮字、toast 全部 static，静态终态与常动档布局一致，无信息丢失。
- 台词池逐行复核：`web/nova-easter.js:137` `Q("It's dangerous to go alone! Take this.", '一个人上路太危险！拿上这个。')`，中文无错字，截图显示正常。

## 5. 点击链路真机级验证（QA ONLY，不碰 `web/`）

夹具 `design/sketch/make_eg_click_test.js` 读 `nova-real-nova-light.html`，掐掉随机（`Math.random=()=>0.99`）后对 `.eg-mario .eg-sprite` 派发两次真实 `PointerEvent('pointerdown')` + `PointerEvent('pointerup')`，Edge `--dump-dom` 回读 `<pre id="eg-test-result">`（UTF-8 解码）：

```
EGTEST_JSON:{"ok":true,"stageOn":true,"en":"Never skip leg day at the timetable!","zh":"课表再忙也别忘了练腿！","badge":"2","badgeShown":"","pose":"wave","frame":"wave","particles":0,"floatTexts":[],"taps":2,"combo":2,"coins":7}
```

结论全绿：`stageOn=true`（isNova && isKb 显隐命中）；双语台词刷新且中文编码正确；`badge=2` 点击计数；`pose/frame=wave` 8 帧姿势轮转；`taps=2 / combo=2 / coins=7`（含每日首次 +5 与每次 +1）持久化写入 `xxmu_eg_v2`。`particles=0 / floatTexts=[]` 是 virtual-time-budget 下 animationend/later 已清理的终态，非失败；首帧静态兜底让夹具杀 timer 也能出图。

## 6. 门禁 / 构建 / 出包

| 项 | 结果 |
| --- | --- |
| `node --check web/nova-easter.js` | JS v2 syntax OK |
| JS 门禁（35 个 `check_`/`test_`） | **PASS=35 FAIL=0**：check_notes / check_nova_shots / check_site_skin / check_skin / check_tutorial / check_web / test_apk_cache / test_cfg / test_nova_fixture / test_nova_fx / test_nova_material / test_nova_organs / test_nova_skin / test_update_timing / test_theme / test_water 等全 ok |
| Python 门禁（6 个） | 全 exit=0：check_domain（www.xxmuhelper.top active）/ test_http_range（分段下载全过）/ verify_apk（五件套全过）/ verify_copyright（61 页软著文档）/ verify_doc（18 页说明书）/ verify_doc_pages（封面单页） |
| `tools/build_apk.py` | OK：`assets 已同步 (45 个文件)` → aapt2 → javac(11) → d8(105 class) → zipalign → apksigner sign |
| 成品 | `apk/xxmu-helper-v1.1.61.apk` **868219 字节** SHA-256 前 12 `816493f093b7…`；`STATE.md` 6815 字节 `76b95a47fee9…` 已送达 `C:\Users\Administrator\Desktop\xxmuhelper` 并逐字节校验 |
| 签名 | `apksigner verify` 证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`（DN: CN=XXMU Helper, OU=Dev, O=XXMU, L=Xinxiang, ST=Henan, C=CN）—— **与 v1.1.60 同签名，可覆盖升级** |
| web ↔ android/assets | check_web.js 全量逐字节比对 PASS（45/45 齐，含 nova-ink.css / nova-easter.js / nova-easter.css） |

## 7. 上线验收（m00591 已授权：部署官网 + 切 cfg.latest 两条一起）

两条上线动作均已完成，线上自检 + 双入口独立验收全部 PASS。

**① 官网部署**（`server/pages`，`wrangler 4.159.0 pages deploy dist --project-name xxmu-auth --commit-dirty=true`）：
`Uploading... (5/5)` → `Success! Uploaded 1 files (4 already uploaded)` → `Uploading _headers` → `Compiled Worker successfully` → `Uploading Worker bundle` → `Deployment complete!` `https://788e9af1.xxmu-auth.pages.dev`，`EXIT=0`。dist 共 4 项（`index.html` / `_headers` / `_worker.js` / `img`）；`_worker.js:73` BUILD 已是 `v1.1.61-nova`（整批缓存失效）；官网联系方式 :557/:581/:585 已是新 QQ / 新邮箱。

**② cfg.latest 切换**（`python -X utf8 tools/publish_apk.py --apk apk/xxmu-helper-v1.1.61.apk --notes-file apk/v1.1.61.notes.txt`）：
aapt2 从 APK 自身读出 `version : 1.1.61 (code 1161)` / `size : 868219` / `sha256 : 816493f093b7…` → `[1/4] apk:blob 已写入` → `[2/4] apk:meta 已写入` → `[3/4] 回读校验通过（868219 字节，SHA-256 一致）` → `[4/4] cfg.latest 已切到 1.1.61 / code 1161` → 线上自检 `/v1/config` 与 `/v1/apk` 一致 → `下载链路一致`，`EXIT=0`。中途一次 `网络抖动（URLError），2 秒后重试…` 自动恢复。

**③ 双入口独立验收**（`python -X utf8 design/sketch/_verify_live_v1161.py`，UA 伪装 Android Chrome 避开 CF 边缘 403，带重试）：

| 入口 | /v1/config | notes | 首页联系方式 | /v1/apk |
| --- | --- | --- | --- | --- |
| `https://www.xxmuhelper.top`（主域名 / BASE） | PASS `1.1.61 / 1161 / 868219 / 816493f093b7…` | PASS 逐字一致 566 字 | PASS `QQ=692962849 / 旧QQ=0 / 邮箱=cf-email-protection 解码后 692962849@qq.com` | PASS 868219 字节 sha 一致 |
| `https://xxmu-auth.pages.dev`（回滚口 / Pages） | PASS 同上 | PASS 同上 | PASS `QQ=692962849 / 旧QQ=0 / 邮箱=plain 692962849@qq.com` | PASS 868219 字节 sha 一致 |

`RESULT: PASS  两入口 /v1/config、首页、下载链路全部一致` / `EXIT=0`。

- 主域名首页的 `mailto:` 与明文邮箱被 **Cloudflare Email Address Obfuscation** 换成 `/cdn-cgi/l/email-protection#…` 与 `data-cfemail="…"`（XOR 编码），浏览器加载 CF 脚本后还原成 `692962849@qq.com`；验收脚本 `cf_decode()` 解出来逐字比对为正确值，不是「没更新」。回滚口没开这个 setting，是明文。
- 裸域 `xxmuhelper.top` **未接入 DNS**（`getaddrinfo failed`），是既有部署事实：`publish_apk.py:35` BASE = www、`state.py:44-45` 两入口 = www + pages.dev、`check_domain.py:174` 结论本就是「至少一个域名已可用」。裸域单列如实记录，不计入验收。
- 未做 git commit / push（House rule，未经明确要求不提交）；`tools/release_all.py` 的 commit/push/建 Release 三步不走。本地工作区改动全部落盘，线上产物与本地 APK 逐字节一致。

## 8. 官网内容 / 排版补做（m01023「官网内容排版什么的没更新」）

App 发版时官网只换了联系方式与 BUILD，正文仍是旧 NOVA 万象舱冷瓷白 + 三张深玻璃示意图，完全没有水墨云图与像素彩蛋 v2。本轮把官网同步到 v1.1.61，仍属 m00591 授权的同一版上线范围；APK 与 cfg.latest 均未动（已是 1.1.61/1161，包字节不变）。

| 项 | 结果 |
| --- | --- |
| 三张示意图重绘 | `tools/gen_site_shots_ink.py` 生成 `shot-kb.svg` 23214B / `shot-learn.svg` 15311B / `shot-water.svg` 15906B，均为 390×780 单 `<svg>`、宣纸 `#F3F1EA→#E1E7E4` + 花青 `#2E6E76`、保留 `#122A38` / 不含 `#EFE2C8`，每张都画了浅色课表或卷宗 + 底部两枚 8-bit 像素小人 + 英中双语气泡 |
| 官网正文 | Hero lead 呼应新浅色；三张图 alt/cap 改浅色成品示意；`#nova` 前插 `<section id="ink">`「这一版 · 水墨云图」三卡（宣纸上的课表 / 两个像素小伙伴 / 点一下就出声）+ 标签行 + 不挡事说明；FAQ 补一条说明浅色与小人的来历。四关键词（周次传送带 / 磁带门 / 波段拨盘 / 万象舱）、`id="nova"`、示意图标注、版本不写死、`/v1/apk` 下载与联系方式全部保留 |
| 官网样式 | `design/sketch/site-style.css` 末尾追加 `@media (prefers-color-scheme:light){…}` 宣纸花青浅色层（不重定义 NOVA_PAIRS 8 个根令牌、不碰 DARK_PAIRS 19 个深档令牌、不用 !important）+ `#ink` 结构样式；dark 段末尾补 `#ink` 深档覆写；`python -X utf8 tools/apply_site_style.py` 同步内联（内联 = 真源逐字一致 PASS） |
| 缓存失效 | `server/pages/dist/_worker.js:73` BUILD `v1.1.61-nova` → `v1.1.61-ink-nova`（版本派生断言仍 PASS） |
| 官网长图实拍 | `shots/site-nova-light.png` 1100×2400 1066302B `B3A62FD6787DE17A`；`shots/site-nova-dark.png` 1100×2400 788193B `8CA1C2D66570922A`。逐块核对 PASS：浅色宣纸花青晕染、水墨示意图含双语气泡与像素小人、`#ink` 三卡无溢出；深色紫夜舱原样、`#ink` 暗紫卡浅字可读、浅色层 0 影响（改版前浅色旧图 `c8d58d4b0499e6936a…`） |
| 门禁 | 核心 `check_web` / `check_site_skin` 47/47 / `test_apk_cache` 34/34 / `check_skin` 55/55 全绿；全链 `JS gates: PASS=35 FAIL=0` + `PY gates: PASS=6 FAIL=0` |
| 官网部署 | `wrangler 4.159.0 pages deploy dist --project-name xxmu-auth --commit-dirty=true` → `Uploaded 4 files` / `Deployment complete! https://580a3634.xxmu-auth.pages.dev` / `EXIT=0` |
| 双入口验收 | `_verify_live_v1161.py` 加首页 `id=ink`/水墨云图/花青云水/像素小伙伴/点一下就出声/四关键词 + 三张线上 SVG（带 cache-buster，验 `"It's-a me"`/「是我呀」/`#122A38`、无 `#EFE2C8`）断言 → www 与 pages.dev 两入口全 PASS；`RESULT: PASS` / `EXIT=0`。/v1/config 仍是 1.1.61/1161/868219B/sha 一致、notes 566 字逐字一致、/v1/apk 字节一致 |

两条补充判据：主域名邮箱仍是 CF Email Obfuscation 保护（解码后 `692962849@qq.com`）；裸域 `xxmuhelper.top` 未接 DNS，不计入验收。未 git commit / push，未重新出包，未切 cfg.latest。

## 附：设计决策与教训

- 「动画不流畅」根因：`nova-organs.js goWeek()` 连点 `#next/#prev` 每次触发 `app.js renderWeek()` 全量重建（app.js 无 setWeek/goWeek 导出）+ pointermove 逐事件写 CSS 变量 → rAF 合并 + `.nv-fastweek` 关过渡。改 CSS 过渡前先核实 `.dragging` 真 add/remove（`nova-organs.js:280` add / `:293` remove），否则橡皮筋。
- 彩蛋被盖：`#tabs` z-index:20 > `#eg-stage`:18 → 抬 `.eg-actor bottom` 而非抬层级（先 `--dump-dom` 确认 DOM 再放大裁切定位）。
- 浅色真源权重：`nova-medium.css` 是 (1,4,1) `html[data-skin="nova"]:not([data-theme="dark"]) #grid .c .pr2`，`nova-polish.css` 用 `[lang]` 抬 (1,5,1) 压过；ink 层用 (0,3,1) 令牌覆写，不动根令牌。
- 原版音效取舍：APK 必须离线 → Web Audio 合成 8-bit 方波/三角波还原腔调，零外链。
- QA 夹具 `window.setInterval=nil` → 彩蛋必须首帧静态兜底、timer 全包 try/catch、弹入用「去类/offsetWidth/加类」回流代替 setTimeout。
- 别写死版本/色值字面量：`check_site_skin.js:40` 已从 manifest 派生；NOVA_PAIRS 用 tokOf 取值比对（`--shell/--glass/--cyan/--coral/--violet/--coin/--brass/--tape` 与 `nova-skin.css` 同源），改根令牌即假红。
- 外部检索死路：麦晓雯水墨云图官方色板查不到（403/验证墙/404）→ 用三套预览让 YG 自选规避。
- 器官真机挂载三层修复（`nova-skin.js apply` 末尾 `__novaSync` + `SKIN.set` 包装 + data-skin MutationObserver）；`nova-organs.js:14` 桥接原则「不碰 app.js 一行」、`:69-70`「钟点只认 `.gp .gt` 渲染出来的校方作息…绝不内置一个 08:00 顶上」。
