# QA · v1.1.65（全员下线重绑教务网 / 方案 A / cfg.rebindAt 可逆一键重绑）

> 一次性交付核对，2026-11-11。用户触发：m02386「能不能让所有人下线，都重新绑定一吹教务网，重新补录一下」，给了 A/B/C 三方案后 m02438「先这个吧」＝选 A 并授权整链执行。

## 一、成片与包

- 成品：`apk/xxmu-helper-v1.1.65.apk` **884603 字节**，SHA-256 `d7c9fe565409a864b2b97072b10717d3b5194c0543e3480e9b6b34118a026dfa`。
- 版本：versionName `1.1.65` / versionCode `1165`（`android/AndroidManifest.xml`、`web/about.js`、`web/index.html#aboutVer` 三处同源，由 `tools/bump_ver.py` 写入）。
- 签名：Signer #1 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，与 v1.1.1 一致，可直接覆盖升级。
- 构建：`python -X utf8 tools/build_apk.py` 跑两次（修 CSS 后重新 sync_assets 45 文件并重签）→ aapt2 / javac(11) / d8(105) / zipalign / apksigner → `tools/deliver.py` 送桌面 `C:\Users\Administrator\Desktop\xxmuhelper\` 逐字节校验通过。修 CSS 前那版 SHA 前缀 `65e330bad7cd`，最终 `d7c9fe565409…`。884603 字节与 v1.1.64 相同是巧合（45 文件同批资产，仅 3 文件内容变化）。
- 发版说明：`apk/v1.1.65.notes.txt`「v1.1.65 学号确认这条链路更顺了」，277 字，学生视角，只写「万一提示重新登录教务网确认学号，照提示做一遍就好」，管理员/重绑按钮/全员下线等内部词一字未提，末尾群号 `1097668324`。

## 二、机制与硬红线

- **rev: 死锁根因**：A 原设计「每人写 `rev:` 下线」会让 `handleActivate:1088` 与 `handleCheck:1260` 双重拦截，客户端 `check():554-562` 收到 revoked/bad_ticket 就 `deactivate()+clearTicket()` 强制重激活，但 activate 又被 `rev:` 挡死 → 永远回不来。
- **改用 cfg.rebindAt O(1) 可逆方案**：不写 `rev:`、不删 `dev:`、不改票据 body、学生端零改动。`rebindKicks(rebindAt, exp)` 判据 `!!t && (exp - 30*DAY) < t`（票据恒 30 天签，签发时刻 = `exp-30*DAY`，严格小于让同秒重激活放行；管理员票据 isAdminId 提前 return）。`DEFAULT_CFG` 无 rebindAt → 默认不存在 → 线上零回归。
- **回流（真·重绑）**：`bad_ticket` → `LICENSE.deactivate()` 清 K_ACCT_KB 等五键 → 必须重登教务网抓真号 → `activate` 带 `kb=kbAccount()` → `bindKbRow` 写回 kb/kbAt → 名单逐个回「已确认」。
- **运营红线**：只提供能力 + 管理台按钮，**按钮留给 YG 自己点，本轮没有替他执行 rebind-all**（没把线上全员踢下线）。撤销可一键还原名单与公告、老票据重新有效、设备绑定从未被碰过。

## 三、两档 390px 实拍（逐块核对通过）

夹具 `design/sketch/make_nova_real.js` 的 `organ==="admin"` 分支覆盖 `AUTH.Admin.list` 为同步 thenable 假三态数据，点真 `#admListBtn` 触发真渲染链；`shoot-nova-one.ps1` 无头 Edge 390x1500。首轮抓到 `.btn{width:100%}` 把 `.chips` 里「撤销上次重绑」挤出可视区，用 id 抬权重 `#admRebindGo.btn,#admRebindUndo.btn{flex:1 1 0;width:auto;...}` 修好后重出图。

| 档 | 文件 | 尺寸 | 字节 | SHA-256 |
|---|---|---|---|---|
| 浅色 | `design/sketch/shots/admin-rebind-light.png` | 390x1500 | 139522 | `1fb35d7d1050499e0a1f401b0879c438afb8790d0cf1353661f38ffa83db802e` |
| 深色 | `design/sketch/shots/admin-rebind-dark.png` | 390x1500 | 142119 | `ab3a73f3b7ed00cbb0de98b5aabaf2a0f499d8b923674557fb5e6a8bb130778e` |

逐块核对（浅色米白 / 深色紫夜舱都过）：卡头「使用名单 3 人」+ 二级菜单 + 三色汇总（已确认 3 绿 / 待补录 2 橙 / 冲突 1 红）+ 双行名单（上粗学号 / 下细教务真号）+ 校准表 3 行 + 重绑说明段 + **「发起全员重绑 | 撤销上次重绑」两枚按钮并排等分**。无溢出、无白字压白底、字不压字。

## 四、门禁（七项全绿）

| 门禁 | 结果 |
|---|---|
| `node tools/check_web.js` | `[PASS] 静态体检全部通过`（v1.1.65 18 条 has + 全员重绑/名单/排序三个契约测试全 PASS + CSS 修复静态锁） |
| `node tools/check_site_skin.js` | `47 passed, 0 failed → PASS`（BUILD `v1.1.65-rebind`） |
| `node tools/check_notes.js` | `[PASS] 发版说明 6 项全过` |
| `node tools/check_tutorial.js` | `[PASS] 教程契约 38 项全过` |
| `node tools/test_kb_bind.js` | `87 passed, 0 failed → PASS` |
| `node tools/test_rebind.js` | `56 passed, 0 failed → PASS`（vm 真跑 rebindKicks/handleRebindAll/handleRebindUndo） |
| `python -X utf8 tools/verify_apk.py` | `[PASS] 五件套全部通过`（含 8 个新 WORKER 符号锁） |

## 五、已上线（选 A 后按长任务授权自主跑完，2026-11-11 09:10）

三步一起做：

1. **Worker** `cwd=server; npx.cmd wrangler deploy` → Version ID `6a59fe01-e174-4407-bce2-ab64690e7ed1`，67.86 KiB / gzip 18.64 KiB，绑定 KV `02669ca1cef04c5e930d4e3bb2d0d780`，`https://xxmu-auth.yg-xxmu.workers.dev`，`WORKER_DEPLOY_EXIT=0`。
2. **Pages** `cwd=server/pages; npx.cmd wrangler pages deploy <dist 绝对路径> --project-name xxmu-auth --commit-dirty=true` → `https://62e08473.xxmu-auth.pages.dev`，`PAGES_DEPLOY_EXIT=0`。官网正文本版一字未改（管理员侧功能不进官网），只 `_worker.js:73` BUILD 切 `v1.1.65-rebind`。
3. **切版本** `python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.65.notes.txt` → `apk:blob`/`apk:meta`/回读校验（884603 字节 SHA 一致，1× URLError 退避重试后完成）/ `cfg.latest` 切 1.1.65 / 1165，线上自检 `/v1/config latest=1.1.65 code=1165 size=884603 sha=d7c9fe565409…`、`/v1/apk` 884603 字节 SHA 一致、下载链路一致，`PUBLISH_EXIT=0`。

**双入口验收** `design/sketch/_verify_live_v1165.py` → `RESULT: PASS`：

- 主域名 `https://www.xxmuhelper.top` 与回滚口 `https://xxmu-auth.pages.dev` 的 `/v1/config` 均 `version=1.1.65 code=1165 size=884603 sha=d7c9fe565409a864…`，notes 277 字逐字一致。
- 两入口首页 21 项断言全 PASS（水墨云图 / 像素小伙伴 / 三张 SVG / #fresh 三卡 / FAQ / 官网无内部词〔禁词表扩到 rebind 系列〕/ 版本未写死），QQ 与邮箱显示 PASS（主域名邮箱被 CF cf-email-protection 保护，解码后 692962849@qq.com；回滚口 plain）。
- 三张水墨示意图 `shot-kb/shot-learn/shot-water` PASS。
- `/v1/apk` 884603 字节、SHA 逐字节一致。
- 裸域 `xxmuhelper.top` 未接 DNS，`getaddrinfo failed` 既有事实，不计入验收。

## 六、真机未验（如实列出）

- 真·重绑后端到端链路：学生端 deactivate → 重登教务网抓真号 → activate 带 kb → 名单回填「已确认」。
- 点「发起全员重绑」后老票据陆续 bad_ticket 的实时节奏（rebindAt 生效 + purgeEdge 公告即时性）。
- 「撤销上次重绑」还原后老票据重新有效、公告回滚。
- `rebind:backup` 在真实 KV 大数据量下的读写与二次发起护栏。
- 按 house rule 未经 YG 明确要求，1.1.63/1.1.64/1.1.65 都没推 GitHub，GitHub 最新 Release 仍停 v1.1.62，而线上 cfg.latest 已是 1.1.65 —— 预期差异，不是遗留 bug。
