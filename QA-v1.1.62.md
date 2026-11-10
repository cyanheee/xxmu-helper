# 河医大助手 v1.1.62 发版 QA 报告（空调防呆 + 套间 AB + 学号纠偏 + 图片方向/横滑 + 卡顿 + WIKI 自动刷新 + 官网/GitHub 同步上线）

日期：2026-11-10　写域：`web/` + `server/` + `android/` + `tools/` + `design/sketch/` + `docs/` + `publish/` + `apk/` + `README.md`
形态：单 APK 离线 WebView，`web/` 纯静态无框架无构建，aapt2/javac/d8/apksigner 手工打包。
仓库根：`C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app`

## 1. 需求与目标演变

| ref | 用户原话（短引） | 落点 |
| --- | --- | --- |
| m01626 | 「有人反应空调的剩余电费度数不对。你看看怎么修」 | 诊断：截图 1417.4 度（西校区第一公寓 1505）vs 411.20 度（南校区 1 号公寓 11505）是**绑错校区**，两间不同房各自真值，不是算法错 |
| m01663 | 「没问题,他绑定错校区了,不过你优化一下吧」 | 空调防呆：入口卡印出当前绑定房名 + 「房间不对就换」+ 多间空调房列出来由学生自己认 |
| m01688 | 「有人反馈南校区2公寓2*14宿舍是套间,有AB宿舍存在,图中给的宿舍选项不齐全」 | 官方接口实测坐实 63 间含 `22514B`；`Number("22514B")=NaN` 沉底 = 「选项不齐全」根因 → `roomSort` 自然排序 + AB `suite` 高亮 |
| m01847 | 「做完以后把github页面内容也更新了,别忘了联系方式也得改」 | README / docs/shots 四张 SVG / GITHUB-发布指引 同步到 v1.1.62 与作者 QQ 692962849 |
| m01941 | 「这个格式异常是不是它登录软件填的学号是这样的,你改成显示它教务网登录的学号,并且需要保证教务网跟软件学号一致」 | 学号纠偏：客户端 `alignKbAccount` + 服务端 `renameFrom`/`dels` 复用现成 idxApply 分支 |
| m02144 | 「这个待审核照片这里加一个编辑图片方向的功能…选成左右滑动查看的，上下的不太好操作」 | rot 元数据 + 横向 scroll-snap carousel + 五按钮方向编辑器 |
| m02306 | 「这些管理员有关的不发布在更新公告，更新公告只讲给用户修了什么bug，加了什么功能」 | 全局准则：notes 只写学生可感知的修复/功能，管理员侧一字不进 |
| m02414 | 「优化一下不，连接有点卡」+ 慢网 3.00KB/s 两张「取图失败」截图 | 根因：`img.loading='lazy'` 对 JS 手动 fetch blob 无效，render 对 N 张全并发打 raw 接口 → 按需拉图 + 串行队列 + 点击重试 + 双入口回退 |
| m02465 | 「wiki那一页的图片和留言板出个刷新或者隔几分钟自动更新，不然我审核通过了，有的人没退出重进软件还是看不到」 | 3 分钟轮询 + 前台切回补拉 + 两个「↻ 刷新」pill + 指纹防重绘 |
| m02548 | 「我前面说的那些从空调剩余电费到最新的问题都要处理优化好，然后直接上线，同步官网和github内容。」 | **授权直接上线**：部署 Worker + Pages、切 cfg.latest 到 1.1.62/1162、同步 GitHub 内容 |

## 2. 改动清单

### 2.1 空调防呆 + 套间 AB（m01626 / m01663 / m01688）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `web/elec.js` | 整文件重写 813 行 | 新增 `airconRooms` / `roomKey(/^(\d+)([A-Za-z]*)$/)` / `roomSort` 自然排序 / `roomBrief` 压名 / `chooseRoom` 多间点选 / `autoPick` 多间时交给人认 / `paintEntry` 写 `#elecEntryRoom` / `renderRoom`「房间不对就换」/ `LOAD.r` 后 `roomSort` / `suite` 高亮类；原有函数、`AUTO_MS` 10 分钟、`c.rv===cur.rv`、`--` 不编 0、红线全留 |
| `web/index.html` | 改 | 入口卡加 `#elecEntryRoom` |
| `web/app.css` | 改 | `.elec-entry-room` + `.pick-cell.suite`（基础 / 深色 / 西部派生三处） |
| `tools/test_elec.js` | 改 | +11 项（64 项全过） |
| `tools/check_web.js` | 改 | v1.1.62 断言段 11 项（`#elecEntryRoom` / `.elec-entry-room` / `.pick-cell.suite` / `roomSort` / `chooseRoom` / `suite` 类 / 禁止 `Number(a.name)-Number(b2.name)` 排序） |

### 2.2 学号纠偏（m01941）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `server/worker.js` | 改 | `oddShape(id)`（11 位 + `^20\d{2}`）；handleActivate 落点改 `let dels=[]` + `renameFrom` 护栏（旧号畸形、真号正常、无 `rev:` 撤销记录才删）→ `idxApply(env,[{id,note:''}],dels)`。旧客户端不发 `renameFrom` → `dels` 空，行为不变 |
| `web/auth.js` | 改 | `alignKbAccount(kb,old)`：护栏 `GOOD=/^20\d{2}\d{7}$/`，只在「手填畸形 + 教务真号正常」时覆盖（两个正常号不同仍走人工弹窗）→ `LICENSE.activate` + `Host.setPref`/`localStorage` + `noteKbAccount` 复核 + 重新 POST `/v1/activate` 带 `renameFrom` 换票据；导出到 api；开机 1200ms 兜底（QA 夹具杀 timer 不跑） |
| `web/sync.js` | 改 | `__onLoginDone` 在 `chk.ok===false` 时先试 `AUTH.alignKbAccount`，成功则 `chk=LICENSE.noteKbAccount(chk.acct)` → 不弹「两号不一样」、直接同步课表 |
| `tools/test_kb_align.js` | 新建 | 24 项 PASS（vm 抽 `oddShape` 6 例、renameFrom/dels 护栏、alignKbAccount、导出、开机兜底、sync 触发） |

### 2.3 图片方向编辑 + 横向滑动（m02144）

rot 元数据（0/90/180/270）存 `ph:idx` + CSS `[data-rot]` transform：**可逆、不重编码、不损画质、只写索引**；扩展 `act==='rot'` 不新增端点。

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `server/worker.js` | 改 | `handlePhotos` / `handleAdminPhotos` rows 加 `rot:x.rot||0`；`handleAdminPhotoAct` 插 rot 分支、错误串 `'act 只能是 ok / no / del / cap / rot'`、复用两条 `purgeEdge` |
| `web/auth.js` | 改 | `photoAct(act,k,cap,rot)` 第 6 参传 rot |
| `web/wiki.js` | 改 | `rotWrap(p,img,full)`，`rot=0` 零回归 |
| `web/app.js` | 改 | 横向 scroll-snap carousel + `.rev-rot` 五按钮 + `photoRot` 就地保存不整表重载 |
| `web/index.html` | 改 | `#revPhotoList` 加 `.rev-photos` + `#revPhotoNav` |
| `web/app.css` | 改 | `.rev-photos` / `.img-frame` 4:3 + 90/270 用 `width:75%;height:133.333%` 正好铺满；只作用审核区，`#revFbList` 留言板保纵向 |
| `tools/test_photo_rot.js` | 新建 | 49 项 PASS |
| `design/sketch/_apply_photo_rot.js` | 一次性脚本 | 幂等落码（不进仓库） |

### 2.4 连接卡顿 / 取图失败（m02414）

`design/sketch/_apply_net_fix.js` 落码：按需拉图（可见 ±1 张，`revLoadVisible()` 用 `Math.round(scrollLeft/revStep())`）+ 串行队列（`REV_FLYING`/`REV_QUEUED`/`REV_GEN` 代际丢弃、`revPump()` 一次飞一张）+ 失败 `img.alt='取图失败，点一下重试'` + `img.onclick` 重试 + `photoRaw` 改走 `fetchAny(...,adminKey)` 双入口回退。`tools/test_net_fix.js` 97 项 PASS（vm 真跑 `revLoadVisible` 可见索引）。

### 2.5 WIKI 自动刷新（m02465）

`photosSection`/`fbSection` 各加「↻ 刷新」pill（`loadPhotos(true)`/`loadFeedback(true)`）；`init()` 挂 `setInterval(...,180000)` 3 分钟轮询，守卫 `document.hidden` / `top.dataset.page!=='wiki'` / 搜索态；`visibilitychange` 前台切回 ≥30s 顺手拉；`PHOTO_FP`/`FB_FP = JSON.stringify(arr)` 指纹，仅变化才 `render()`（不打断正在搜索）。`app.css` `.ph-title{margin-right:auto}` + `.ph-head .pill{…}`。

### 2.6 版本 / 出包 / 官网 / GitHub

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `web/about.js` / `web/index.html` / `android/AndroidManifest.xml` | 改 | `python -X utf8 tools/bump_ver.py 1.1.62 1162` 三处同步；**版本折进未发布的 1.1.62，不升 1.1.63** |
| `server/pages/dist/_worker.js:73` | 改 | `const BUILD = 'v1.1.62-fresh-nova';`（缓存整批失效；`check_site_skin.js:40-45` 从 manifest versionName 派生正则，不写死） |
| `apk/v1.1.62.notes.txt` | 新建 | 五节纯学生视角（入口卡写清房名 / 套间 AB 能选到 / 多间自己挑 / 校园实景和留言板会自己更新 / 别的都照旧），结尾「更新群：1097668324」；管理员侧（旋转/横滑/拉图/名单纠偏）一字未进（m02306），`check_notes.js` 6 项全过 |
| `server/pages/dist/index.html` | 改 | Hero lead 追加空调/自动更新一句；`<!-- 万象舱 -->` 前插 `<section id="fresh">`「这一版 · 用着更顺手」三卡（复用 `.feat/.fcard`，**不动 site-style.css 真源**）；FAQ 补两条；保留 `id=ink`/`id=nova`、四关键词、三张 SVG、联系方式、`id="mVer">—</b>` |
| `README.md` | 改 | 中英文补自动更新段 + FAQ + 开发命令加 `node tools/test_kb_align.js` / `test_photo_rot.js` / `test_net_fix.js`；饮水机保持诚实版（最长放水防忘关，非按毫升精确计量） |
| `publish/GITHUB-发布指引.md` | 改 | Release Title → `v1.1.62 —— 空调好认房了 + 套间 AB + 校园实景/留言自动更新` |
| `docs/shots/*.svg` | 改 | 复制官网水墨云图版四张（含花青宣纸色、不含 `#EFE2C8`） |
| `design/sketch/_verify_live_v1162.py` | 新建 | 双入口 16 项首页断言（8 旧 ink + 8 新 fresh）+ 三张线上 SVG 带 `?cb=` + CF 邮箱 XOR 解码 + 裸域单列 |

## 3. 实拍核对（先看图再发版）

App 审核页两档 390x1600 实拍（QA 夹具走真 `app.css`）**抓到并修复真实缺陷**：「‹ 上一张 / 第 n/N 张 / 下一张 ›」被 `.card .btn-sm{width:100%}` 撑成竖排、文字挤成竖条。修法＝在 `web/app.css` 用 id 抬权重：`#revPhotoNav .btn{…width:auto…}` / `#revPhotoNav .rev-pos{…white-space:nowrap}` / `#revPhotoList .rev-rot .btn, #revPhotoList .rev-acts .btn{…width:auto…}`。重出图复核 PASS：导航压回横排、五按钮与三按钮收成行内胶囊、四档 4:3 旋转角标每 90° 挪一格无留白无溢出、留言板仍纵向。

| 实拍 | 尺寸 / 字节 | SHA-256 前 16 |
| --- | --- | --- |
| `design/sketch/shots/v1162-photo-rot2-light.png` | 390x1600 / 254115B | `1D4674E7E131373D` |
| `design/sketch/shots/v1162-photo-rot2-dark.png` | 390x1600 / 172656B | `E88EF3745E652ED9` |
| `design/sketch/shots/site-nova-light.png` | 1100x2400 / 1076608B | `2F19F80487D71444` |
| `design/sketch/shots/site-nova-dark.png` | 1100x2400 / 808189B | `B0F8ED277EE9E2F3` |

官网 #fresh 区实看渲染正常：三卡横排、花青宣纸浅色、水墨云图区与像素小伙伴区都在，无溢出或错位。

早期竖排缺陷版 `v1162-photo-rot-light.png`（`2B9E1F92A1DA7B0E`）/`v1162-photo-rot-dark.png`（`52A7C0D732D2392C`）已 [SUPERSEDED]。

## 4. 出包与门禁

APK：`apk/xxmu-helper-v1.1.62.apk` **876411 字节**，sha256 `03053d62af5e2c34a6baf8eb5ce5487e30e4524b2f2391312b1ccf00b7fd7f50`，证书 SHA-256 `0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799`（同签名可覆盖升级），`tools/build_apk.py` 同步 assets 45 文件、`web/` 与 `android/assets/` 逐字节一致。

| 门禁 | 结果 |
| --- | --- |
| `tools/test_photo_rot.js` | 49 PASS |
| `tools/test_kb_align.js` | 24 PASS |
| `tools/test_net_fix.js` | 97 PASS |
| 全链 JS（`Get-ChildItem tools -File \| ^(check_\|test_).*\.js$`） | **PASS=38 FAIL=0** |
| 全链 Python（check_domain / test_http_range / verify_apk / verify_copyright / verify_doc / verify_doc_pages） | **PASS=6 FAIL=0** |
| `tools/check_web.js` | `[PASS] 静态体检全部通过`（`index.html 体积 = 39511`、版本未写死、内联样式 = 真源逐字一致、v1.1.62 空调防呆 11 项全 true） |
| `tools/check_site_skin.js` | 47 passed, 0 failed → PASS |
| `tools/test_apk_cache.js` | 34 项全过 |
| `tools/check_skin.js` | 55 passed, 0 failed → PASS |

## 5. 上线结果（m02548 授权，三步一起）

| 步骤 | 命令 / 结果 |
| --- | --- |
| Worker（让服务端 rot / renameFrom / oddShape 生效） | cwd=`server`，`npx.cmd wrangler deploy` → `Uploaded xxmu-auth (3.31 sec)`，`https://xxmu-auth.yg-xxmu.workers.dev`，Current Version ID `e403d689-b04c-424d-9d21-d836072ec3c7`，KV binding `env.AUTH (02669ca1…d780)` |
| Pages 官网 | cwd=`server/pages`，`npx.cmd wrangler pages deploy dist --project-name xxmu-auth --commit-dirty=true` → `https://0c42ba1c.xxmu-auth.pages.dev`，BUILD `v1.1.62-fresh-nova` |
| 切版本 | `python -X utf8 tools/publish_apk.py --notes-file apk/v1.1.62.notes.txt` → `apk:blob` / `apk:meta` 写入 + 回读校验通过 + `cfg.latest` 切到 `1.1.62 / code 1162`，线上自检 `/v1/config` 与 `/v1/apk` 一致 |

**双入口验收** `python -X utf8 design/sketch/_verify_live_v1162.py` 第一次即 `RESULT: PASS`：

- 主域名 `https://www.xxmuhelper.top` 与回滚口 `https://xxmu-auth.pages.dev` 均 `/v1/config version=1.1.62 code=1162 size=876411 sha=03053d62af5e2c34…`、notes 与本地逐字一致（662 字）、`/v1/apk` 876411 字节 sha 一致。
- 首页联系方式：QQ=PASS、旧号 `572833261` 计数 0、邮箱主域名走 CF Email Obfuscation（XOR 解码后 `692962849@qq.com`）、回滚口明文。
- 首页内容/排版 16 项断言全 PASS（水墨云图 8 项 + v1.1.62 #fresh 8 项）；三张水墨示意图 `shot-kb/shot-learn/shot-water` 带 `?cb=` 全 PASS。
- 裸域 `xxmuhelper.top` 未接入 DNS（`getaddrinfo failed`），既有部署事实，BASE 与回滚口均不含此域，单列记录不计入 fails。

## 6. 约束保持与教训

- notes 只写学生可感知（m02306），管理员侧一字未进；`check_notes.js` 22 个禁用词 + 无 Markdown 项目符号 + 结尾群号，全过。
- 版本折进未发布的 1.1.62，不升 1.1.63；`server/worker.js` 的 rot / renameFrom / oddShape 属服务端，**已随本次 Worker 部署生效**。
- 门禁锁未碰：`verify_apk.py` 锁 `revPhotoSrc`/`photoRaw`/`尺寸未知`/`重新上架`；`test_admin_list.js:37-42` 禁在 `function listNewFirst(` 与 `function renderList()` 之间插函数；`check_web.js` NOVA_PAIRS 根令牌同源锁；官网内联样式 = `site-style.css` 逐字一致、零外链、版本号不写死。
- 教训：落码脚本 `path.resolve(__dirname,'..')` 从 `design/sketch` 只回到 `design/` → `ENOENT ... design\web\auth.js`，须 `'..','..'`；无头 Edge 把 "bytes written" 写 stderr，pwsh 须 `$ErrorActionPreference='Continue'` + `2>&1`（Stop 会误抛 NativeCommandError `[exit code: 1]`）；外观改动必须自己出图核对（本次抓到单测字符串查不出的布局塌陷）；官网换版必须正文 + 示意图 + CSS 全套同步（lesson `0mw75ec04` 同类复发）。
