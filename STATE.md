# 河医大助手 · 当前状态（STATE）

> 自动生成，**别手改**。重新生成：`python tools/state.py`。
> 生成时间：2026-11-24 11:20
> 接手一个会话时只读这一页；架构与踩坑细节见 [HANDOFF.md](HANDOFF.md)，
> 历史每一版改了什么见 [docs/handoff/changelog.md](docs/handoff/changelog.md)，
> 待办见 [docs/handoff/todo.md](docs/handoff/todo.md)。

## 1. 代码版本（读自磁盘）

| 位置 | 值 |
|---|---|
| AndroidManifest versionName | **2.16.0** |
| AndroidManifest versionCode | **21600** |
| web/about.js APP_VERSION | 2.16.0 |
| web/index.html #aboutVer | 2.16.0 |

## 2. 本地最新的包

| 项 | 值 |
|---|---|
| 文件 | `apk/xxmu-helper-v2.16.0.apk` |
| 大小 | 1077750 字节 |
| SHA-256 | `c849d08fead70d9f0c895a735e17e763ca7f2ef39da0314a19e4791e50b05d60` |
| 出包时间 | 2026-11-24 11:20 |
| 包内版本（aapt2） | 2.16.0 / 21600 |

注意：**多个版本常常字节数相同**（v1.1.16 与 v1.1.17 都是 558650），
只能靠 SHA-256 和包内符号区分，别用大小认版本。

## 3. 线上现在发的是哪一版

探测入口：`https://xxmu-auth.pages.dev`（另一个是 `https://www.xxmuhelper.top`）

| 字段 | 值 |
|---|---|
| latest.version | **2.15.0** |
| latest.code | 21500 |
| latest.size | 1081846 |
| latest.sha256 | `c9eb17f35c20cd06` |
| latest.url | https://www.xxmuhelper.top/v1/apk?v=c9eb17f35c20 |
| apk.name（blob 里实际的包） | xxmu-helper-v2.15.0.apk |
| min.code（强制淘汰线） | 0 |
| enforceVer | False |
| updPolicy | nag |
| qq | 1097668324 |
| maxDev | 3 |

> 线上 latest 与本地最新的包**不是同一个**（sha 不同）。

> 本地已到 **2.16.0**，线上还是 **2.15.0** —— 新版本**还没发**。
> （用户说「继续写」不等于授权发布；只有说「上线/发版/发布」才切 latest。）

## 4. 仓库位置

| 项 | 值 |
|---|---|
| 分支 | main @ `eac534c` |
| 远程 main（API 实读） | `eac534c` |
| 与远程内容 | **不一致**（逐文件比 326 个 blob sha：不一致 37 / 远程多出 0；STATE.md 自指，不计入） |
| 未提交改动 | 679 个文件 |

最近提交：

```
eac534c release: v1.1.97 (code 1197)
e52c768 release: v1.1.82 (code 1182)
da9980e release: v1.1.81 (code 1181)
22d37ee release: v1.1.80 (code 1180)
ad04b85 release: v1.1.62 —— 空调防呆/套间AB、学号对齐、图片方向编辑、WIKI自动刷新、官网与README同步
57f4031 chore: prune debug screenshots and third-party reference images
```

未提交：

```
M STATE.md
 M android/AndroidManifest.xml
 M android/res/mipmap-hdpi/ic_launcher.png
 M android/res/mipmap-mdpi/ic_launcher.png
 M android/res/mipmap-xhdpi/ic_launcher.png
 M android/res/mipmap-xxhdpi/ic_launcher.png
 M android/res/mipmap-xxxhdpi/ic_launcher.png
 M android/src/com/xxmu/helper/ClassWidget.java
 M android/src/com/xxmu/helper/MainActivity.java
 M android/src/com/xxmu/helper/ReminderReceiver.java
 M android/src/com/xxmu/helper/ReminderScheduler.java
 M design/icons/CURRENT.txt
```

## 5. 常用命令（复制即用）

```powershell
$env:Path += ';C:\Program Files\Git\cmd;C:\Program Files\nodejs'   # git / node 都不在默认 PATH

node tools/check_web.js                 # 静态体检（版本三处一致 / assets 同步 / 各版锚点）
node tools/test_mytodo.js               # 以及 tools/test_*.js 全套离线测试
python tools/build_apk.py               # 出包（自动同步 assets + 自动送到桌面 xxmuhelper\）
python tools/deliver.py                 # 单独把最新包和本文件送到 桌面\xxmuhelper\（逐字节校验）
python tools/verify_apk.py              # 出包后五件套校验
python tools/bump_ver.py 1.1.22 1122    # 版本号三处同改
python tools/publish_apk.py --no-publish  # 只上传不通知（默认就该用这个）
python tools/publish_apk.py             # 真发布：切 cfg.latest，学生一开就弹更新
python tools/state.py                   # 重新生成本文件
```

**交付落点只有一处**：`C:\Users\Administrator\Desktop\xxmuhelper`。
注：`D:\dsh\DSH Desktop` 是 DSH 的工作目录，名字带 Desktop 但它**不是桌面**；
资源管理器里的桌面是 `C:\Users\<用户>\Desktop`。以前两个「桌面」都放过，
用户的原话是「我咋没看见出包在哪」—— 所以现在只有一处，由 `deliver.py` 送并校验。

工具清单与每套测试覆盖什么，见 HANDOFF.md 第 7 节与「离线测试一览」。

## 6. 未完待办


### 一、等用户的
- [ ] **备份签名密钥** `android/xxmu.jks`（pass `xxmu123`）到网盘/邮箱。

### 二、等真机（没有设备，一律不能声称已验证）
- [ ] **v2.15.0「四处写了没人读」抽查（新；headless 只验到渲染与文案，真点按钮/真损坏数据要在真机看）**…
- [ ] 打开专注卡点「重置」：计时真的归零回到 25:00，不再一点就闪退/没反应。判据：`web/focus.js` init() 里 `resetBtn.onclick = () => reset()`，不再让局部 `const` 遮住模块级 `function reset()`。
- [ ] 专注满几天后，卡底那句多出「最长一天 N 分钟 · M月D日」，只有真有记录才出现（全空时仍是「最近 14 天还没有专注记录」）。判据：paintHisto() 的 `peakOf()` + `shortDate()`。
- [ ] 把专注记录弄坏（或真机存储异常）时，界面写红字「存着的专注记录读不出来（本机记录损坏）」，统计行也转红，而不是装作「今日 0 分钟」让人以为一天没学。判据：paint() 的 `stateErr = LAST_ERR` + `.focus-err` / `.warn`。
- [ ] 设置页「复制诊断」那段多出「自动刷新（最近 N 条）」：能看见几点、刷了几个来源、有无变化、跳过了谁（`ykt:ok,zxs:stale` 这种）。判据：`about.js diagText()` 接了 `SOURCES.autoDiag()`。
- [ ] 从没自动刷新过时，诊断里写「自动刷新：还没有记录」，不是空一段或报错。判据：autoLine 的无日志兜底。
- [ ] NOVA 深色档下，专注错误红字与诊断自动刷新段都清晰可读（不糊不压线）。判据：实拍 `v215-focuserr-*` / `v215-diag-*` 四档已目视，真机再确认一次。
- [ ] **v2.14.0「自己记的待办会提醒了」抽查（新；提醒是系统闹钟，headless 拍不到响的那一刻）**…
- [ ] 把一条待办的日子设成明天，早上 8 点会不会响；想马上验就点「提醒 → 设置 → 试一下待办提醒」。判据：`web/reminder.js` 的 `buildTodo()`（`at = day0 + 8*3600000 - lead*86400000`）与 `ReminderReceiver.todoLeftText()`。
- [ ] 通知上写的是「明天到期」，不是「还有 11 小时 32 分」也不是「约 12 小时后到期」。判据：待办走 `todoLeftText()` 独立分支，不落 `leftSpan()` 那条小时/分钟的路。
- [ ] 把日子设成今天、当前已经过了早上 8 点 → 几十秒内应该补一条（`GRACE = 30*1000`），而不是什么都不来。判据：`buildTodo()` 里 `at <= now` 时 `at = now + GRACE`。
- [ ] 三种都不响：没写日子的、已经做完的、日子已经过了的。判据：`if (!x || x.done) return;`、正则不匹配即跳过、`dueMs + GRACE <= now` 跳过。
- [ ] 提醒卡第三行「待办到期」的读数与设置面板里的开关联动（`未开启` / `提前 1 天 · 早上 8 点` / `当天早上 8 点` / `待授权通知`）。判据：`paint()` 的 `#remindTodoStat` 三态。
- [ ] 关掉作业提醒、只留待办，待办照常响；toast 只列开着的来源，不出现「（课程 0 · 作业 0 · 待办 N）」这种空括号。判据：`apply()` 的 `parts` 拼装。
- [ ] 点「试一下待办提醒」时通知上写「明天到期」——预览给的 due 是明天 23:59，不是 `now+12h`。判据：`MainActivity.previewTaskReminder()` 的待办分支。
- [ ] **v2.13.0「课表导出成日历」抽查（新；导出发生在 Android 文件系统里，headless 拍不到**…
- [ ] 点「导出为文件」后，文件真落到「下载 / 河医大助手」；点一下能直接进手机日历（`text/calendar` 生效，不是「用什么打开」）。判据：`MainActivity.mimeOf()` 的 `.ics` 分支 + `Host.exportText`。
- [ ] 导进日历后周重复对不对：一门课上 6 周应出现 6 次，不是 1 次也不是 42 次。判据：`web/ics.js` 的 `runsOf()` 与 `RRULE:FREQ=WEEKLY;COUNT=N`。
- [ ] 时区对不对：手机在 `Asia/Shanghai` 时，日历里写 08:00 就是 08:00。判据：`fmtLocal()` 输出浮动时间（无 `Z`、无 `TZID`）。
- [ ] 截止那条的「提前 1 小时」提醒会响，且响的是截止点前 1 小时（不是开始点前）。判据：`dueEvent()` 的 `VALARM/TRIGGER:-PT60M`。
- [ ] 某一节作息读不出时，面板写「有 N 条读不出时间，没有放进日历」，而**不是**拿 00:00 顶上。判据：`build()` 的 `skipped` 计数与 `.ex-bad` 段落。
- [ ] 没设开学日时，面板直接叫回「课表 → 学期设置」填，而不是导出一份没有课的文件。判据：`build()` 的 `startMissing`。
- [ ] 导出前后 App 里的课表一个字都没动（导出是只读的）。判据：`openPanel()` 只读 `DATA`/`TIMES`/`START`，不写 pref。
- [ ] **v2.12.0「桌面小组件摆上最近要交」抽查（新；组件在 App 外面，headless 拍不到**…
- [ ] **v2.11.0「桌面小组件认改课表指令」抽查（新；这一版离线只能验 Java 逻辑，桌面那一层 headless 拍不到）**…
- [ ] **v2.10.0「桌面小组件改成人话」抽查（新；这一版没有离线图能给 —— 组件在 App 外面，headless 浏览器拍不到）**…
- [ ] **v2.9.1「其余四页摆到窄屏上看」抽查（新；六种视口 × 四组合离线全 PASS，但 date 控件是桌面 Chromium 量的）**…
- [ ] **v2.9.0「工具卡这一轮」抽查（新；四档离线实拍都验过，但 `.sh-box` 的滚动裁切在真机上受系统字体缩放影响）**…
- [ ] **v2.8.0「可读性这一轮」抽查（新；离线把对比度量化到四组合全 0，但深色 NOVA 有两页量不了）**…
- [ ] **v2.7.0「界面这一轮」抽查（新；这一版全是显示层，离线验过七项，剩下要真机看）**…
- [ ] **v2.6.0「从教务读成绩」真机抽查（新；这一版的正题）**…
- [ ] **v2.5.0「备份与导出」真机抽查（新；这一版的正题）**…
- [ ] **v2.4.0「专注记录」真机抽查（新；这一版的正题）**…
- [ ] **v2.3.0「现在一屏」真机抽查（这一版的正题）**…
- [ ] **v2.2.0「截止哨兵」真机抽查（新；这一版的正题）**…
- [ ] **v2.1.0「出水看护」真机抽查（新；这一版的正题）**…
- [ ] **v2.0.0 学习页「今日一行」真机抽查（新）**…
- [ ] **v2.0.0「复制未完成」真机抽查（新）**…
- [ ] **v2.0.0 成绩面板「目标绩点」真机抽查（新；最可能出问题的一条）**…
- [ ] **v2.0.0 图标 07_ink（墨迹）真机抽查（新）**…
- [ ] **v2.0.0 教程三页是否跟上了新功能（新）**…
- [ ] **v1.1.77 已过截止移出待完成 + 按截止正序真机抽查**…
- [ ] **v1.1.76 雨课堂「读不到作业」修复真机抽查（新）**…
- [ ] **v1.1.75 雨课堂四区域可选真机抽查**…
- [ ] **v1.1.74 雨课堂真接活清单真机抽查**…
- [ ] **v1.1.73 喜鹊考试标题剥学年抬头真机抽查**…
- [ ] **v1.1.72 喜鹊「接住新窗口 + 丢幽灵条目」真机抽查（已由 m03290 确认为可用，留档）**…
- [ ] **v1.1.71 喜鹊「点一次，之后自己同步」双探全自动真机抽查（已被 m03025 证伪主链路，留作过程记录）**…
- [ ] **v1.1.70 喜鹊「你复制、App 解析」剪贴板导入真机抽查（已被 m02339 推翻为主路径，降为兜底验证）**…
- [ ] **v1.1.69 喜鹊「考试安排表」frame 递归读页真机抽查（已被 m02177 第四轮证伪，留作过程记录）**…
- [ ] **v1.1.68 喜鹊 WebView 辅助发现真机抽查**…
- [ ] **v1.1.55 糖梨借鉴四项真机抽查（新）**…
- [ ] **v1.1.49 两条（新）**…
- [ ] **青果登录页 `input#username` 在真机 WebView 的 `onPageFinished` 时序下能否稳定读到**。
- [ ] **学号不一致时拦课表同步的提示是否清楚**（v1.1.2 那次判据错把人永久锁死过）。
- [ ] **v1.1.16 饮水机四条（最要紧）**…
- [ ] **v1.1.15 三条**：明文白名单下教务/学习通/胖乖生活三个内嵌页是否都正常…
- [ ] **v1.1.22「我的待办」在真机上的手感**：勾选圈点得准不准、日期选择器在…
- [ ] **v1.1.35 课程提醒真的会弹吗（优先级最高，v1.1.27~v1.1.34 一直是死的）**…
- [ ] **v1.1.26 专注计时在真机上的三件事**：①切后台/锁屏 10 分钟后回来…
- [ ] **v1.1.28 停车场机制的手感**：学习页头部三个小按钮（待办 / 番茄钟 / 刷新）…
- [ ] **v1.1.30~v1.1.37 宿舍空调八条**：①自己的学号能否查到绑定房间…
- [ ] **v1.1.38 教务登录页缩放在真机上的观感**：手机点「登录教务」，表单是否完整可见…
- [ ] **v1.1.39 深色模式五条（优先级最高，本机无设备一律不能声称已验证）**…
- [ ] **v1.1.40 独立设置页四条（真机）**：①「我的」点设置能否进二级页…
- [ ] **v1.1.41 课程提醒三档五条（真机）**：①学习页 → 课程提醒 → 设置…
- [ ] **v1.1.42 教程排版四条（真机）**：①重看「我的 → 使用教程」，逐页翻到第 5 页…
- [ ] **v1.1.45 管理名单三条（真机）**：①名单是否按收录时间从新到老…
- [ ] **v1.1.48 管理台时间显示（真机）**：①装 v1.1.48 进管理控制台 → 名单 →…
- [ ] **v1.1.47 下载入口归一（真机，优先级最高）**：①在一台校园网 DNS…
- [ ] **v1.1.46 检查更新提速（真机）**：①从点图标到更新弹窗出现…
- [ ] **等用户点头才做**：收紧学号准入（只收 11 位、20xx 年份开头）。

### 三、可以做（纯本地，不需要任何外部条件）
- [ ] **`app.js` 已 4700+ 行**。若要长期维护可以按页面拆，但**保持无构建链**更稳…
