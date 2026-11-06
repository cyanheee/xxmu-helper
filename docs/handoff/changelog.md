# 每一版改了什么

> 从 HANDOFF.md 第 8 节拆出来，内容原样保留（每版的踩坑细节都在这）。
> **现在在哪**看 [STATE.md](../../STATE.md)（一页，自动生成）；
> **架构与稳定的坑**看 [HANDOFF.md](../../HANDOFF.md)；**待办**看 [todo.md](todo.md)。
> 顺序是**新 -> 旧**（最新的在最上面），新版本请插到下面那条分隔线之后。

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
