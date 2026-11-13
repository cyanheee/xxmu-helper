# v1.1.63 抽查报告（WIKI 横滑 + 名单校准）

> 只记**实测**过的东西，没验的一律写「未验」。对应 [changelog.md](changelog.md) 的 v1.1.63 段。
> 用户 YG 外观交付硬要求：改完自己出浅色 + 深色 390px 实拍逐块核对，把抽查结果（截图尺寸 / 哈希 / verify 结论）写进报告。

## 一、成片/包

| 项 | 值 |
| --- | --- |
| 包 | `apk/xxmu-helper-v1.1.63.apk` |
| 大小 | 880507 字节 |
| SHA-256 | `4f2c61f54133c832314daa1eff4fb62d2faa3846588f42e2df1861056c96474d` |
| badging | versionCode 1163 / versionName 1.1.63 / package com.xxmu.helper |
| 签名 | SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`，与 v1.1.1 一致可覆盖升级 |
| 送达 | deliver.py 送 `C:\Users\Administrator\Desktop\xxmuhelper`，逐字节校验通过 |
| assets | sync_assets 同步 45 个文件，web/ 与 android/assets/ 逐字节一致 |

## 二、两档 390px 实拍（逐块核对，均通过）

出图：`design/sketch/shoot-nova-one.ps1 -Tag … -Theme light|dark -Skin nova -Organ polaroid`，无头 Edge `--window-size=390,1500 --virtual-time-budget=900`，两次 exit=0。深色档靠 HTML 里硬写 `data-theme="dark"` 单独出图复核（比 iframe setAttribute 可靠）。

| 档 | 文件 | 尺寸 | 字节 | SHA-256 |
| --- | --- | --- | --- | --- |
| 浅色 | `design/sketch/shots/wiki-rail-nova-light.png` | 390×1500 | 269211 | `105bcc9b430083d6b8a670c997384829672c7f4a6c50b147efb49fd8acb6473f` |
| 深色 | `design/sketch/shots/wiki-rail-nova-dark.png` | 390×1500 | 184806 | `e2e2f47f41a236c215368ad855aa7302d70ff380b21db504b2c740c9db0ae430` |

逐块核对结论（两张都过）：

- **照片墙**：中间页 2×2 四张白相纸，歪角 rotate、`::before` 木夹、`::after` 晾相麻绳、图注（图书馆夜色 / 操场晚风 / 校门晨光 / 实验楼窗台）；左右各露相邻页约 22px；3 个雾紫圆点，中间那个拉长成胶囊 `.on`。
- **留言板**：中间页 3 条（同学·其它·11-07 12:30 / 匿名·优化建议·11-06 19:48 / 大二同学·资料纠错·11-06 09:14），后两条带「管理员回复」绿框；左右露边、3 圆点中间 `.on`。
- **整页**：顶栏 / 搜索 / CAMPUS WIKI 标签条 / POLAROID MALL 器官条 / 学校概况资料卡齐全，无白字压白底、无溢出、无相纸被边角裁掉。
- **配色**：浅色米白雾光紫取样 `#EBEDE9 / #DDDFDA / #E9EBE6`；深色紫夜舱 `#1A1430 / #2A234B / #302620`，紫色木夹与圆点明显。
- **DOM 实测**：`--dump-dom` 得 ph-page=3 / fb-page=3、ph-hang=12 / ph-card=12 / fb-card=9、`nv-polaroid-grid`=3、`data-shot-scroll`=346 与 354（两 rail 精确停在中间页）。

夹具机制（写进报告以免下次重踩）：virtual-time 下 `scroll-snap-type:x mandatory` 会回卷 scrollLeft、`scroll-behavior:smooth` 在静态帧不推进，是「露边拍不出来」的真因；`railCss` 关成 none/auto + `peek()` 把两 rail 设到中间页解决。**真实 `web/wiki.js` 首屏 scrollLeft=0 天然只有右侧露下一页，滑到中间页才左右都露，交互本身满足需求，`web/` 没有为了夹具改动。**

## 三、门禁与验证结论（全部实测 PASS）

- `node --check` ×3（test_kb_bind.js / check_web.js / verify_apk.py py_compile）→ 全 OK
- `node tools/test_kb_bind.js` → **59 passed, 0 failed → PASS**（原 39 条 + 校准契约 20 条：服务端补集 / 计数分开 / reason 两值真跑混合样本 / 前端二级菜单与样式 / 主列表计数不被污染）
- `python tools/verify_apk.py apk/xxmu-helper-v1.1.63.apk` → **五件套全部通过**；包内 `const odd = idx.filter(` / `oddCount: oddRows.length` / `oddRows: oddRows` 三个校准符号都在
- `node tools/check_web.js` → **静态体检全部通过**；`名单排序行为测试 = PASS`、`教务绑定名单契约测试 = PASS`、aboutVer / APP_VERSION = 1.1.63
- `node tools/check_notes.js --file apk/v1.1.63.notes.txt` → **6 项全过**（学生视角、467 字、末尾群号、无 Markdown 项目符号、公告与更新说明分离）

## 四、已上线（YG 说「上线」后三步一起做，2026-11-10 22:35）

- **Worker 部署**：`npx wrangler deploy`（cwd `server/`）→ xxmu-auth Version ID `b339b5cb-6f9d-4d84-855e-bd95a1b2f985`，让 `oddRows / kbbind` 线上生效。
- **官网 Pages 部署**：`npx wrangler pages deploy <dist 绝对路径> --project-name xxmu-auth --commit-dirty=true` → `https://57ae7cfc.xxmu-auth.pages.dev`。官网正文同步到 v1.1.63（#fresh 三卡 + hero lead + FAQ 补翻页），`_worker.js` BUILD 切 `v1.1.63-polaroid-rail`；浅色 `site-nova-light.png` 1100x2400 / 1078929 字节 / SHA `6fb0381a…a91080d`、深色 `site-nova-dark.png` 1100x2400 / 805842 字节 / SHA `19bb9e76…860eb2b` 两档逐块核对通过。
- **切版本**：`python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.63.notes.txt` → `apk:blob` / `apk:meta` 写入 + 回读校验通过（880507 字节，SHA-256 一致）+ `cfg.latest` 切到 1.1.63 / 1163。
- **四项门禁全绿**：`check_web.js` 静态体检 PASS、`check_site_skin.js` 47 passed 0 failed、`check_notes.js` 6 项全过、`check_tutorial.js` 38/38。
- **双入口验收 PASS**（`design/sketch/_verify_live_v1163.py`）：主域名 `https://www.xxmuhelper.top` 与回滚口 `https://xxmu-auth.pages.dev` 的 `/v1/config`（version / code / size / sha256 / notes 466 字逐字）、首页 21 项、三张水墨 SVG、`/v1/apk` 880507 字节逐字节全一致；裸域 `xxmuhelper.top` 未接 DNS，单列不计入验收。

## 五、真机未验（如实列出）

- 横滑拖拽手感与回弹、Webview 里 snap 与木夹 `::before/::after` 的层叠、校准二级菜单在矮视口的手感、异常号停用/解封后的实时刷新。以上均未在真机上声称验证通过。
