# QA · v1.1.64（名单双号三态 / 方案 C）

> 一次性交付核对，2026-11-11。用户触发：m01607「学号这里还是没做好……双行上下行显示，上面粗的是软件登录时填的，下面细的小字是绑定教务网」，m01658 选方案 C。

## 一、成片与包

- 成品：`apk/xxmu-helper-v1.1.64.apk` **884603 字节**，SHA-256 `f8f0d535c26ec4ea352c2994b15d12718f00b5075a20929a205eaa7020001d6c`。
- 版本：versionName `1.1.64` / versionCode `1164`（`android/AndroidManifest.xml`、`web/about.js`、`web/index.html#aboutVer` 三处同源，由 `tools/bump_ver.py` 写入）。
- 签名：Signer #1 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，与 v1.1.1 一致，可直接覆盖升级。
- 构建：`python -X utf8 tools/build_apk.py` → assets 同步 45 文件 → aapt2 / javac(11) / d8(105) / zipalign / apksigner → `tools/deliver.py` 送桌面 `C:\Users\Administrator\Desktop\xxmuhelper\` 逐字节校验通过。
- 发版说明：`apk/v1.1.64.notes.txt`「教务网绑定更稳了，学号记得更准」，298 字，学生视角，管理员侧功能一字未提，末尾群号 `1097668324`。

## 二、两档 390px 实拍（逐块核对通过）

夹具 `design/sketch/make_nova_real.js` 新增 `organ==="admin"` 分支：覆盖 `AUTH.Admin.list` 为同步 thenable 假三态数据，点真 `#admListBtn` 触发真 `renderList()/renderOdd()/renderKbSummary()`，中文文案与 DOM 全部由产品代码产出，不是手画。`shoot-nova-one.ps1` 无头 Edge 390x1500。

| 档 | 文件 | 尺寸 | 字节 | SHA-256 |
|---|---|---|---|---|
| 浅色 | `design/sketch/shots/admin-list-light.png` | 390x1500 | 148132 | `cee109b7dd61316bfe02753438e8fbb6c37d09906f4d300b165b087f44335299` |
| 深色 | `design/sketch/shots/admin-list-dark.png` | 390x1500 | 149304 | `354a45c8060f9b96bf5339fc6f70d28be50cb6d83a1447ddbc921f87427dc7ab` |

逐块核对（浅色米白 / 深色紫夜舱都过）：

- 卡头「使用名单 3 人」+ 二级菜单「正常名单 3 人 / 校准·异常 3 个」。
- 汇总三色块：已确认 3（绿）/ 待补录 2（橙）/ 冲突 1（红）。
- tip 双行说明（上面粗进门号 / 下面细教务真号）+「只看已确认（隐去待补录）」开关。
- 主列表 5 行：3 行上粗学号 + 下细绿字「教务网 {真号} · 已确认」+「教务已绑定」绿徽章；2 行灰度降档 + 橙字「教务网：待补录」+「格式异常（手填）」标。
- 校准表 3 行：「待补录教务学号」/「两号冲突」+ 每行绿色「录真号」按钮。
- 刷新名单按钮。无溢出、无白字压白底、三色块与双行对比度够、字不压字。

## 三、门禁（六项全绿）

| 门禁 | 结果 |
|---|---|
| `node tools/check_web.js` | `[PASS] 静态体检全部通过`（v1.1.64 checkpoints 全 true） |
| `node tools/check_site_skin.js` | `47 passed, 0 failed → PASS`（BUILD `v1.1.64-kb-dual`） |
| `node tools/check_notes.js` | `[PASS] 发版说明 6 项全过` |
| `node tools/check_tutorial.js` | `[PASS] 教程契约 38 项全过` |
| `node tools/test_kb_bind.js` | `87 passed, 0 failed → PASS`（vm 真跑 kbRealOf/kbClassOf/bindKbRow/handleList 三态） |
| `python -X utf8 tools/verify_apk.py` | `[PASS] 五件套全部通过` |

语法：`node --check` 六个 JS 全 OK，`python ast.parse` verify_apk.py / _verify_live_v1164.py 全 OK。

## 四、已上线（选 C 后按长任务授权自主跑完，2026-11-11 01:00）

三步一起做：

1. **Worker** `cwd=server; npx.cmd wrangler deploy` → Version ID `07056544-6710-4d6f-bc20-be348a5a89bd`，`https://xxmu-auth.yg-xxmu.workers.dev`，`DEPLOY_EXIT=0`。
2. **Pages** `cwd=server/pages; npx.cmd wrangler pages deploy <dist 绝对路径> --project-name xxmu-auth --commit-dirty=true` → `https://31aea648.xxmu-auth.pages.dev`，`PAGES_EXIT=0`。官网正文本版未改（后端/管理员侧改动，沿用「官网正文不写管理员侧功能」纪律），只 `_worker.js:73` BUILD 切 `v1.1.64-kb-dual`。
3. **切版本** `python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.64.notes.txt` → `apk:blob` / `apk:meta` / 回读校验（884603 字节 SHA 一致，网络抖动 2× URLError 退避重试后完成）/ `cfg.latest` 切 1.1.64 / 1164，`PUBLISH_EXIT=0`。

**双入口验收** `design/sketch/_verify_live_v1164.py` → `RESULT: PASS`：

- 主域名 `https://www.xxmuhelper.top` 与回滚口 `https://xxmu-auth.pages.dev` 的 `/v1/config` 均 `version=1.1.64 code=1164 size=884603 sha=f8f0d535c26ec4ea…`，notes 298 字逐字一致。
- 两入口首页 21 项断言全 PASS（水墨云图 / 像素小伙伴 / 三张 SVG / #fresh 三卡 / FAQ / 官网无内部词 / 版本未写死），QQ 与邮箱显示 PASS。
- 三张水墨示意图 `shot-kb/shot-learn/shot-water` PASS。
- `/v1/apk` 884603 字节、SHA 逐字节一致。
- 裸域 `xxmuhelper.top` 未接 DNS，`getaddrinfo failed` 既有事实，不计入验收。

## 五、真机未验（如实列出）

- 真机 WebView 里双行学号换行位置与灰度对比。
- 「手动录真号」#sheet 半框在矮视口的手感与输入法遮挡。
- 存量用户开机兜底补报真号后，管理台名单从「待补录」翻成「已确认」的实时刷新链路。
- 「只看已确认」开关与校准表在真实 KV 大数据量下的滚动/排序手感。
