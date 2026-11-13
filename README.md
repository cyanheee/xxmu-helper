<div align="center">

<img src="docs/shots/logo.svg" width="88" alt="河医大助手">

# 河医大助手 / XXMU Helper

**河南医药大学 · 学生自建的校园教务辅助工具**
**A student-built campus course assistant for Henan Medical University**

课表 · 作业倒计时 · 空教室 · 饮水机 · 校园资料
Timetable · Assignment countdown · Free classrooms · Water dispenser · Campus info

[![Platform](https://img.shields.io/badge/platform-Android%207.0%2B-3ddc84?logo=android&logoColor=white)](#)
[![Version](https://img.shields.io/badge/version-1.1.81-2563eb)](https://github.com/cyanheee/xxmu-helper/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![QQ](https://img.shields.io/badge/QQ-692962849-12b7f5?logo=tencentqq&logoColor=white)](https://wpa.qq.com/msgrd?v=3&uin=692962849&site=qq&menu=yes)

**[简体中文](#简体中文) · [English](#english)**

<br>

<img src="docs/shots/shot-kb.svg" width="24%" alt="课表">
<img src="docs/shots/shot-learn.svg" width="24%" alt="学习">
<img src="docs/shots/shot-water.svg" width="24%" alt="饮水机">

<sub>界面示意图（按 App 真实结构绘制，非真机截图）·当前 v1.1.81：四个平台的作业考试清单打开就自己更新，「水墨云图」浅色皮肤之外另有深色与最初的经典皮肤可切换</sub>

</div>

---

<div align="center">

## 简体中文

</div>

### 这是什么

一个安卓 App，把几件每天都要重复的小事合到一处：

- 想知道**本周上什么课**，得登教务、找入口、等页面加载
- 想知道**哪份作业快到期**，得挨个课程点进去翻
- 想知道**现在哪间教室空着**，得手动比对课表
- 想**接杯水**，得先扫码再在机器上按
- 想看**宿舍空调还剩多少度电**，得进完美校园一层层找自己那间房

这几个动作本身不难，但一天要做好几次。课表、作业、空教室、接水、空调、校园资料现在都在同一个界面里。学习通、雨课堂、喜鹊儿和知到上的作业、考试都归进同一份倒计时清单，打开就自己悄悄更新，不用再来回切平台、也不用每次手动点；「水墨云图」浅色皮肤、课表角落那两位会动会说话的像素小伙伴都还在。

**它不是学校的官方产品**，是在校学生自己写了自己用的工具。数据全部来自学校官方系统，一切正式事务（成绩、选课、评教、缴费）请以官方系统为准。

### 下载

| 方式 | 地址 |
|---|---|
| 官网 | <https://www.xxmuhelper.top> |
| GitHub Release | [最新版本](https://github.com/cyanheee/xxmu-helper/releases) |
| 直连下载 | <https://xxmu-auth.pages.dev/v1/apk> |
| 更新群 | QQ `1097668324` |

当前版本 **v1.1.81 / 1181**（2026-11-13）：四个平台的作业、考试清单现在打开 App 或切回前台就自己悄悄重对一遍，前台放着每半小时再刷一次，十分钟内的重复打开不反复打、退到后台不刷；哪个平台登录掉了，只在它的连接卡上写清原因、给一键重登，不弹满屏提示，也不拿空清单冒充「没作业」，已读到的旧数据照旧留着。雨课堂扫码页不再一闪就关，扫完进课程页点右上角「完成」才算登好，失效时写清当前区域和两种原因。扫码、登录过期仍要本人来，App 只读取清单不代签到、不代交作业。此前知到作业考试接入、水墨云图浅色皮肤、像素小伙伴、能翻页的相册和留言板、空调房间防呆、课前提醒连堂只响一次都还在。

> 在微信里打开会提示无法下载安装包，这是微信的限制。点右上角「···」→「在浏览器打开」，再点一次下载即可。

### 联系我

用的人多了我才知道该继续做什么。有问题、想提需求、发现 bug，都可以直接找我。

| 渠道 | 联系方式 |
|---|---|
| QQ | **692962849** |
| QQ 群（更新通知） | [1097668324](https://qm.qq.com/q/xxmuhelper) |
| 邮箱 | 692962849@qq.com |
| GitHub | [github.com/cyanheee](https://github.com/cyanheee) |

### 功能

**课表**

登录教务后自动读取，按周渲染成网格。当前周高亮，今天所在列加标记，每门课显示教室与起止时间。

顶部有一条状态说明栏，用来区分四种情况：**尚未同步 / 本周确实没课 / 周次读不懂 / 读取失败**。这四种在屏幕上必须能分开——否则用户看到的都是「一张空白表格」，没法判断是自己没同步还是软件坏了。

**作业与考试**

从学习通、雨课堂、喜鹊儿和知到读取作业和考试，归进同一份清单，按紧急程度排序。清单打开 App、切回前台或前台放到点会自己重对一遍，一门一门串行刷、十分钟内的重复打开不反复打、退到后台不刷。知到默认走「接口直连」直接读数据，读不到时也可以切「读作业页」兜底；四个平台都只读取清单，不代签到、不代交作业、不代发帖。

状态处理是这里最要紧的部分：平台返回的状态文案有很多种写法，能识别的归类为「待做 / 待批阅 / 已完成 / 已过期」，**认不出来的一律标成「未知」，绝不判成「已完成」**。因为判成已完成会让你错过截止且不可恢复，判成未知最多让你多点开看一次，代价可逆。同理，课程没读通、平台数据没解析出来时一律标降级写明原因，绝不冒充「没作业」。登录态过期（如雨课堂扫码失效）会收敛到对应连接卡写清原因、给一键重登，不弹满屏提示，已读到的旧数据照旧留着。

**空教室**

按你课表里出现过的教室，算出某天某几节哪间空着。也可以反过来找「整周都空」的自习位置。

**局限要说清**：只能看到你自己课表里出现过的教室（一般十几间），看不到别的班的安排，所以结果仅供参考。

**饮水机**

扫一次码记住机器，之后在手机上操作。

这里有个容易误解的地方：**手机只能「解锁」，出水还得在机器出水口按一下物理键**。胖乖生活平台的官方页面原文就是「请在出水口处点按开始接水」——它没有开放远程开阀的接口，这是硬件设计，不是没做。

但「停」是可以远程下发的，所以做了**最长放水（防忘关）**：设一个时长上限，到点自动帮你发停止命令。它是一道安全网，不是按毫升精确计量——官方页面并不向网页开放实时出水量。三条限制写在界面上：到点到停阀有几秒延迟会多流一点；断网盯不住；一直没检测到出水会提醒你去按。

**校园资料**

学校常用入口、办事流程、联系方式归到一处，支持检索和本地新增。WIKI 页的校园实景与留言板会隔几分钟自动对一次新内容，从后台切回 App 也会顺手更新，右上角另有「刷新」可手动拉；内容没变时不重排，正在检索的内容不会被打断。

**宿舍空调**

只读展示完美校园里自己那间房的剩余度数，缴费仍在完美校园里自己完成。这里不代办支付，也不换算单位，读数以缴费页为准、可能有延迟。

v1.1.62 针对两条真实反馈做了防呆：入口卡直接印出**当前绑定的是哪间房**，绑错校区一眼能看出来，面板里也留了「换房间」的入口；官方把套间 AB 房（如 22514B）追加在房号列表末尾，以前按数字排序会沉底翻不到，现在改成自然排序、B 间紧跟主号并单独高亮；一个学号登记了多间空调房时，会全部列出来点选，不再默认拿第一间。

**外观与彩蛋**

浅色是「水墨云图 / 花青云水」：宣纸留白、花青淡墨晕染、朱砂印章点缀；深色与最初的经典皮肤都还在，设置里随时切换。课表角落有两位 8-bit 像素小伙伴，会走、会跳、会挥手，气泡里是英中双语台词，点一下马里奥会响一段合成的八位电子音。连击、金币、成就、图鉴、双人拌嘴这些小玩法都在本地跑，长按可以静音，系统开了「减少动态效果」就全部安静下来。它们只占课表底部左右两小块空地，不挡课程、不挡铭牌和底部五个标签。

### 隐私

这是最需要说清楚的部分。

| 数据 | 存在哪 | 会不会上传 |
|---|---|---|
| 教务 / 学习通密码 | **不存储** | 直接提交给学校官方登录页 |
| 登录会话 Cookie | 手机本地 WebView | 不上传 |
| 课表、作业 | 手机本地 | 不上传 |
| 设备标识 | 本地生成的随机串哈希 | 只用于区分设备，不采集 IMEI/MAC |

服务端（Cloudflare Workers）只保存三样东西：**版本号、公告、设备数量**。不保存课表，不保存作业，不保存密码。

### 常见问题

<details>
<summary><b>课表是空的 / 少了几节课</b></summary>

先确认教务能正常登录，然后在课表页点「重新同步」。

如果还是空，课表页顶部的说明条会告诉你属于哪种情况。点条上的「复制课表诊断」，把内容发到群里，能直接定位问题。
</details>

<details>
<summary><b>会不会要我的教务密码</b></summary>

不会。登录是在 App 内置浏览器里打开的**学校官方登录页**，密码输给的是学校，App 只保留登录后的会话凭证。密码不经过开发者服务器。
</details>

<details>
<summary><b>饮水机为什么点完还要在机器上按一下</b></summary>

胖乖生活平台只开放了「解锁」接口，没有远程开阀能力。手机能做的到解锁为止，出水必须人在机器上按。但「停」可以远程做，所以设了最长放水（防忘关）之后能自动停。
</details>

<details>
<summary><b>空调剩余度数和缴费页对不上</b></summary>

先看入口卡上印的房间名是不是自己宿舍。最常见的原因是绑到了别的校区、别的公寓，或者同一层里另一间空调分表——两间房的数都是真的，只是不是同一间。点进面板用「换房间」重选一次即可。住在套间的同学注意选带 A / B 后缀的那一间，列表里已经按房号排好并单独标了颜色。
</details>

<details>
<summary><b>提示「版本过低」进不去</b></summary>

这个提示只在旧版本确实有问题时出现。按页面按钮下载新版覆盖安装即可，数据不会丢。
</details>

<details>
<summary><b>换了手机 / 重装了</b></summary>

重装、填学号、重新登录教务，课表会自动同步回来。一个学号可绑几台设备，超限时联系群里的管理员清一下记录。
</details>

<details>
<summary><b>这是官方的吗</b></summary>

不是。学生自建工具，和学校、和超星都没有隶属关系。
</details>

### 技术

- **界面**：纯静态 HTML/CSS/JS，跑在系统 WebView 里，不依赖任何前端框架
- **原生壳**：Java，`aapt2 + javac + d8 + apksigner` 手工打包，不用 Gradle
- **服务端**：Cloudflare Worker + KV，只做版本与公告这类轻量状态
- **数据抓取**：Python，电脑端跑

架构上有一条硬约束：**任何从 JS 调到 Java 的桥方法都不许阻塞**（不许在里面做网络、文件大 IO、图片解码），必须立刻返回、后台干活、完成后回调。因为 WebView 调 Java 时 JS 线程会同步等返回值，一慢整个界面就「能滑动但点什么都卡死」。

### 开发

```bash
# 静态体检（版本号一致性 / 资源同步 / 关键符号）
node tools/check_web.js

# 离线测试（课表解析、作业状态、饮水机协议、授权状态机…）
node tools/test_parsekb.js
node tools/test_hwstatus.js
node tools/test_water.js
node tools/test_elec.js
node tools/test_kb_align.js
node tools/test_photo_rot.js
node tools/test_net_fix.js

# 打包
python tools/build_apk.py
```

所有离线测试都能在无网络、无真机的环境下重复执行。

### 授权

代码以 **AGPL-3.0** 发布。简单说：

- ✅ 可以看、可以学、可以改、可以自己部署
- ✅ 改完自己用、给同学用都没问题
- ⚠️ **如果改成网络服务提供给他人使用，必须同样开源**
- ⚠️ 保留原作者署名

之所以选 AGPL 而不是 MIT：这个项目的代码是公开的，但不希望有人拿去做闭源的商业产品。

### 声明

- 与河南医药大学、超星学习通、胖乖生活均无隶属或合作关系
- 所有数据以学校官方系统为准
- 项目按「现状」提供，不对使用后果作任何担保
- 如果你是学校方面的工作人员且对这个项目有异议，请通过群或邮箱联系，我会配合处理

---

<div align="center">

## English

</div>

### What this is

An Android app that folds several small, repetitive daily chores into one place:

- Want to know **what classes you have this week**? Log into the academic system, find the right page, wait for it to load.
- Want to know **which assignment is due soon**? Click into each course one by one.
- Want to know **which classroom is empty right now**? Compare against your timetable by hand.
- Want **a cup of water**? Scan a QR code, then press a button on the machine.

None of these is hard on its own, but you do them several times a day. This app puts them together — timetable, assignments, free classrooms, water, air conditioning and campus info in one place. Recent releases added the “ink-wash” light skin and two animated pixel companions in the timetable corner.

**This is not an official school product.** It is a tool written and used by a student. All data comes from official school systems; anything formal — grades, course registration, teaching evaluations, payments — should be handled on the official systems.

### Download

| Channel | Address |
|---|---|
| Website | <https://www.xxmuhelper.top> |
| GitHub Release | [Latest release](https://github.com/cyanheee/xxmu-helper/releases) |
| Direct APK | <https://xxmu-auth.pages.dev/v1/apk> |
| Update group | QQ `1097668324` |

Current release **v1.1.81 / 1181** (2026-11-13): homework and exam lists from all four platforms now quietly refresh themselves when you open the app or switch back to it, and again every half hour while it stays in the foreground — repeated opens inside ten minutes do not hammer the servers, and nothing runs in the background. If any platform login has expired, the app states the reason on the connection card for that platform with a one-tap re-login, instead of popping toasts everywhere or quietly showing an empty "no homework" list; data already read is kept. The Yuketang (雨课堂) QR sign-in page no longer closes itself: scan, reach the course page and tap "Done" in the top-right corner to finish signing in, and when it expires the card shows the current region and the two most likely causes. Scanning a QR code and re-signing in after a session expires still need you; the app only reads lists, never signs in, submits homework or posts for you. Earlier work — direct Zhidao homework/exam reading, the ink-wash light skin, pixel companions, page-flipping album and message board, air-conditioning room anti-mistakes, and one reminder for back-to-back periods — is all still there.

> Opening the page inside WeChat will refuse to download the APK — that is WeChat's own restriction. Tap "···" in the top-right corner → "Open in browser", then tap download again.

### Contact

The more people use it, the clearer it is what to build next. Bug reports, feature requests and questions are all welcome.

| Channel | Contact |
|---|---|
| QQ | **692962849** |
| QQ group (release updates) | [1097668324](https://qm.qq.com/q/xxmuhelper) |
| Email | 692962849@qq.com |
| GitHub | [github.com/cyanheee](https://github.com/cyanheee) |

### Features

**Timetable**

Read automatically after logging into the academic system, then rendered as a weekly grid. The current week is highlighted, today's column is marked, and every course shows its classroom and start/end time.

A status bar at the top distinguishes four situations: **not synced yet / genuinely no classes this week / week numbering could not be parsed / read failed**. These four must look different on screen — otherwise all the user sees is "a blank table" and cannot tell whether they forgot to sync or the app is broken.

**Assignments and exams**

Read from Chaoxing (学习通), Yuketang (雨课堂), Xiqueer (喜鹊儿) and Zhidao (智慧树 / zhihuishu), merged into one list and sorted by urgency. The list quietly refreshes itself on open, on returning to the foreground, or on a timer while in the foreground — one course at a time in series, no repeat hits within ten minutes, nothing in the background. Zhidao defaults to a direct API read, with a "read the homework page" fallback; all four platforms only read the list, never sign in, submit homework or post for you.

Status handling is the most important part here: the platform returns many different phrasings for a status, so anything recognisable is grouped into "to do / awaiting grading / done / expired", and **anything unrecognised is marked "unknown" — never "done"**. Marking an unknown as "done" makes you miss a deadline irreversibly; marking it "unknown" costs you one extra tap. The cost is reversible.By the same rule, a course that could not be read or a response that could not be parsed is reported as degraded with a reason, never disguised as "no homework". An expired login (for example a Yuketang QR session) is reported on the connection card for that platform with a one-tap re-login instead of toasts everywhere, and data already read is kept.

**Free classrooms**

Uses the set of classrooms that appear in *your* timetable to work out which rooms are free on a given day and period. It can also find "free all week" study spots.

**The limitation is stated clearly**: it only sees classrooms from your own timetable (usually a dozen or so), not other classes' schedules, so the result is a reference only.

**Water dispenser**

Scan the machine's QR code once to remember it, then operate from the phone.

There is a commonly misunderstood point here: **the phone can only "unlock"; water actually starts when someone presses the physical button on the dispenser.** The official platform page literally says "please tap at the outlet to start". It exposes no remote valve-opening API — that is a hardware design decision, not an unfinished feature.

However, *stopping* can be issued remotely, so the app offers a **maximum run time (so you don’t forget to switch it off)**: pick a time limit and it sends the stop command when that limit is reached. It is a safety net, not millilitre-accurate metering — the platform exposes no live flow reading to the web page. Three limits are written into the UI: a few seconds of lag before the valve closes means a little extra water; a network drop means it stops tracking; and if no water is detected at all, it reminds you to press the button.

**Campus info**

Common school entry points, procedures and contacts gathered in one place, with search and locally added entries. The campus photos and the message board poll for new content every few minutes, refresh again when the app returns to the foreground, and each has a manual refresh button; unchanged content does not re-render, so an in-progress search is never interrupted.

**Dormitory air conditioning**

Read-only display of the remaining kWh for your own room, taken from the campus platform; payment still happens there. The unit is never converted and the reading may lag — treat the payment page as authoritative. As of v1.1.62 the card prints which room is bound (so a wrong campus is obvious at a glance), suite rooms such as 22514B sort next to their base number and are highlighted, and when a student ID has several registered rooms they are all listed to choose from instead of silently picking the first.

**Look and feel**

The light skin is “ink wash / azure clouds”: paper-white space, pale azurite washes, a touch of cinnabar red. The dark skin and the original classic skin are both still available. Two 8-bit pixel companions sit in the timetable corner; they walk, jump and wave, speak in bilingual bubbles, and tapping Mario plays a short synthesised chiptune. Combos, coins, achievements and a small collection run entirely offline; a long press mutes them and “reduce motion” puts them to rest. They stay in two small gaps and never cover courses or the bottom tabs.

### Privacy

This is the part that deserves the clearest statement.

| Data | Where it lives | Uploaded? |
|---|---|---|
| Academic / learning-platform password | **Never stored** | Submitted directly to the school's official login page |
| Session cookies | Local WebView | No |
| Timetable, assignments | Local device | No |
| Device identifier | Locally generated random hash | Only to tell devices apart; no IMEI/MAC collection |

The backend (Cloudflare Workers) stores exactly three things: **version number, announcements, device count**. No timetables, no assignments, no passwords.

### FAQ

<details>
<summary><b>The timetable is empty / missing some classes</b></summary>

First confirm you can log into the academic system, then tap "Re-sync" on the timetable page.

If it is still empty, the status bar at the top of the page tells you which case applies. Tap "Copy timetable diagnostics" and send the content to the group — it pinpoints the problem directly.
</details>

<details>
<summary><b>Does it want my academic-system password?</b></summary>

No. Login happens on the **school's official login page** inside the app's built-in browser. The password goes to the school; the app only keeps the resulting session. The password never passes through the developer's server.
</details>

<details>
<summary><b>Why do I still have to press the machine after using the water dispenser feature?</b></summary>

The platform only exposes an "unlock" API, with no remote valve control. The phone's capability ends at unlocking; starting the water requires pressing the button on the machine. Stopping *can* be done remotely, which is why setting a maximum run time lets it stop automatically as a safety net.
</details>

<details>
<summary><b>The remaining kWh does not match the payment page</b></summary>

Check the room name printed on the entry card first. Most of the time it is bound to a different campus, building, or another air-conditioning sub-meter on the same floor — both readings are real, just for different rooms. Use “change room” in the panel to pick again. If you live in a suite, pick the room with the A / B suffix; they are now sorted by number and highlighted.
</details>

<details>
<summary><b>It says "version too old" and won't let me in</b></summary>

That message only appears when an old version genuinely has a problem. Download the new version from the button shown and install over it — your data is kept.
</details>

<details>
<summary><b>I changed phones / reinstalled</b></summary>

Reinstall, enter your student ID, log into the academic system again, and the timetable syncs back. One student ID can bind a few devices; if you hit the limit, ask an admin in the group to clear the records.
</details>

<details>
<summary><b>Is this official?</b></summary>

No. It is a student-built tool with no affiliation to the university or to Chaoxing.
</details>

### Technical notes

- **UI**: plain static HTML/CSS/JS running in the system WebView, no frontend framework
- **Native shell**: Java, packaged by hand with `aapt2 + javac + d8 + apksigner`, no Gradle
- **Backend**: Cloudflare Worker + KV, holding only lightweight state such as version and announcements
- **Data scraping**: Python, run on a desktop

One hard architectural constraint: **every JS-to-Java bridge method must be non-blocking** — no network, no large file IO, no bitmap decoding inside it. It must return immediately, do the work on a background thread, and call back when finished. The reason: when WebView calls Java, the JS thread waits synchronously for the return value, so one slow call freezes the whole UI into "scrolls fine but nothing responds".

### Development

```bash
# Static checks (version consistency / asset sync / key symbols)
node tools/check_web.js

# Offline tests (timetable parsing, assignment status, dispenser protocol, licence state machine…)
node tools/test_parsekb.js
node tools/test_hwstatus.js
node tools/test_water.js
node tools/test_elec.js
node tools/test_kb_align.js
node tools/test_photo_rot.js
node tools/test_net_fix.js

# Build
python tools/build_apk.py
```

Every offline test can be re-run without a network connection and without a physical device.

### Licence

Released under **AGPL-3.0**. In plain terms:

- ✅ Read it, learn from it, modify it, deploy it yourself
- ✅ Use your modified version for yourself or your classmates
- ⚠️ **If you turn it into a network service for others, you must open-source your version too**
- ⚠️ Keep the original author's attribution

AGPL rather than MIT because: the code is public, but it should not become someone's closed-source commercial product.

### Disclaimer

- Not affiliated with Henan Medical University, Chaoxing Learning, or the Qiekj water-dispenser platform
- All data is subject to the official school systems
- Provided "as is", with no warranty of any kind
- If you are a staff member of the university and have concerns about this project, please reach out via the group or email and I will cooperate

---

<div align="center">

**课表、作业、空教室，一个 App 就够了。**
**Timetable, assignments, free classrooms — one app is enough.**

</div>
