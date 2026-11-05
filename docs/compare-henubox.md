# HENUBox（河小盒）vs 河医大助手 —— 功能对比与技术评估

> 对象：<https://github.com/moonquake25104/HENUBox>
> 分析日期：2026-11-05
> 方法：读仓库元信息、完整文件树（750 条）、README、docs/PRIVACY.md、docs/BUILDING.md、
> SECURITY.md、THIRD_PARTY_NOTICES.md，以及 classroom/parser.go、henu/parser.go、
> electricity/WanliData.java 三个核心实现文件。
> 所有结论都标了依据来源，猜的地方会写明是猜的。

---

## 一、它是什么

| 项 | 值 |
|---|---|
| 全名 | HENUBox 河小盒 |
| 定位 | **河南大学**校园生活 Android 工具箱 |
| 创建 | 2026-11-02 |
| 语言构成 | Go（后端 + 课表解析）、TypeScript（界面）、Java/Kotlin（Android 壳） |
| 代码量 | 2139 KB，750 个文件 |
| Star / Fork | 10 / 0 |
| 版本 | **只有 1 个 Release：v0.1.1**，APK 9.44 MB |
| 许可证 | MIT |
| 来源 | **基于 `LogicShao/Kairos` 的 MIT 源码发展而来**（THIRD_PARTY_NOTICES.md 明确写了） |

最后一条很重要：**它不是从零写的**，是在 Kairos 这个已有项目上改的。这不影响它好用，但对比时要意识到两边起点不同。

---

## 二、它有、我没有的功能

按“对学生的实际价值”排序，不是按代码量。

### 1. 空闲教室：能查**全校**，我只能查你课表里那十几间 ⭐差距最大

**它是怎么做的**（`App/server/internal/domain/classroom/parser.go` 文件头注释）：

```go
// Package classroom parses the KINGOSOFT public-query classroom week matrix.
```

KINGOSOFT（青果）教务系统有一个**公共查询页**，不需要登录就能按「教学楼 + 周次」查整栋楼的教室占用矩阵。它解析的是这个页面，所以能看到**全校所有教室**。

**我为什么没做**：我今天又实测了一次 XXMU 的教务——

```
qgjw.xxmu.edu.cn/public/queryRoom.jsp      → 517 字节「凭证已失效」
qgjw.xxmu.edu.cn/zzz_nonexistent_12345.jsp → 517 字节「凭证已失效」
```

**未登录时，任何路径（包括不存在的）都返回同一段 517 字节占位**。这意味着两件事：
- XXMU 的公共查询页即使存在，也要求登录态
- 我无法离线枚举出它的真实路径（拿到的永远是同一个 stub）

**这是两校教务配置的差异，不是我没发现。** 但结论很明确：**这个功能对你的学校是真有价值的，我当前只给出“基于你课表的十几间教室”，覆盖率远低于它。**

**能不能补上**：能，但要你在真机上帮我确认一件事——登录教务后，侧边栏/菜单里有没有「空闲教室」「教室查询」「公共查询」这类入口。有的话把那个页面的 URL 发我，我照着写解析；KINGOSOFT 的这个矩阵结构是通用的，解析器可以移植。

### 2. 电费查询（`electricity/WanliData.java`）

它接了「万里」能耗平台的接口，能查宿舍电表：

```java
view.put("remaining_kwh", decimal(row.get("remainingPower"), false));
view.put("reading_time", text(row.get("readingTime"), 64, true));
view.put("cumulative_kwh", decimal(row.get("cumulativePower"), true));
```

还能查每日用电明细（`days()` 方法，按月拉，最多 31 天）。

**我没有这个功能。** 这个对住校生很实用——不用为了看还剩多少电跑一趟宿管。但 XXMU 用不用万里平台我不知道，需要你确认宿舍楼下的电表/缴费入口是哪个系统。

### 3. 专注计时（番茄钟 + 正计时 + 白噪音 + 专注记录）

- 番茄钟、正计时两种模式
- 内置 4 段白噪音（雨声 / 海浪 / 粉噪声 / 棕噪声，CC0 授权，`focus-audio/*.ogg`）
- 专注记录与统计（`FocusInsights`、`focus/FocusEngine.java` 13 KB）
- 支持勿扰模式接管（`FocusDnd.java`）

**我没有。** 这是纯粹的「自习工具」，跟教务无关，但确实有人需要——尤其期末周。

### 4. 待办清单（独立于作业）

- 今天 / 重要 / 逾期 三种视图
- 排序与拖拽（`tasks_order.go`）
- 本地 SQLite 存储

**我的「作业」是从学习通读来的**，只能显示平台上的作业，**不能自己加一条待办**。这是个真实缺口：比如「周三前交实验报告」这种老师口头说的、平台没有的任务，我这边没地方记。

### 5. 校园指南（比我的「校园资料」更细）

它的 `CampusGuidePage.tsx`（15 KB）包含：校历、校区地图、常用电话、**校车时刻**、校园信息。另外有 `app__routes.js` 里的「全景」入口。

我的 `wiki.js` 是「条目 + 搜索」，内容是静态整理的。**校车时刻、校区地图这两项我没有。**

### 6. 三种外观 × 五种配色

- 经典 / **液态玻璃**（真做了 glass 效果，`henubox-backdrop` 是一整套 Kotlin 渲染模块）/ 安卓原生
- 五种配色、浅色/深色/跟随系统

我只有一套蓝紫渐变配色，没有主题系统。**这是纯观感差距，但确实是差距**——它的 README 截图里液态玻璃那套相当好看。

### 7. 课程提醒（本地通知）

`CourseReminderPlanner.java` + `CourseReminderReceiver.java`：按课表提前 N 分钟本地通知「该去上课了」。

**我没有。** 我只在 App 内显示倒计时，不推通知。

### 8. 图书借阅 / 学校邮箱入口

`LibraryBrowserActivity.java`（13 KB）、`EmailBrowserActivity.java`——内置 WebView 打开图书馆和邮箱，带会话保持。

我有「校园资料」里的链接，但**是打开官方页面，没有做内置浏览和会话保持**。

---

## 三、我有、它没有的功能

### 1. 学习通作业与考试 ⭐它完全没有

我在它 750 个文件里搜过：`chaoxing` 0 个、`超星` 0 个、`学习通` 0 个、`homework` 0 个。

它只有 `exams`（12 个文件），但看路径是它**自己数据库里的考试表**（`db/queries/exams.sql`、`internal/domain/*/exams`），是用户手动录入或从教务导入的，**不是从学习通实时读的**。

**这是我最核心的差异优势**：作业截止时间自动同步、按紧急度排序、状态归一化（读不到就标「未知」而不是「已完成」）。它的待办要你自己一条条录。

### 2. 饮水机（扫一次码，之后一键解锁 + 定量停止）

它搜 `water` / `饮水` 都是 0 个。

这是我花时间最多的一块（v1.1.16 整块重写），也是**每天都会用**的功能。

### 3. 公告 / 版本分发的服务端

它只有 `UpdateChecker.tsx`（4 KB，检查 GitHub Releases）和 `XiqueUpdatePlugin.java`。

我有完整的 Cloudflare Worker：版本配置、公告（可撤回、可重发）、按学号/设备维度的名单与封禁、管理控制台、审核台、限流防刷。

**差别在“能不能运营”**：它发版只能靠 GitHub Releases，没法给全校推一条公告、没法停用某个刷接口的人；我这套是为「发给全校几百人」设计的。

### 4. 留言板 + 校园实景 + 审核台

它没有用户产生内容的模块（`campus.jpg` 是静态图）。

我有留言板（带审核链路、防 XSS、按 fp 限流）和校园实景图片上传（待审 → 通过 → 公开）。

### 5. 双入口自动回退

`HOSTS = ['https://www.xxmuhelper.top', 'https://xxmu-auth.pages.dev']`，网络层失败才换，服务端 4xx/5xx 绝不换。

它不需要这个——它本地优先，Android 模式不依赖服务器。

---

## 四、架构对比（差距最大的一项，但方向和它相反）

| 维度 | HENUBox | 河医大助手 |
|---|---|---|
| 界面 | React 19 + TypeScript + Vite + Fluent UI + Radix | 原生 JS，无框架，单文件 app.js（4700 行） |
| Android 壳 | **Capacitor 7** + Java/Kotlin + Compose | 手写 WebView + `@JavascriptInterface` 桥 |
| 构建 | Gradle Wrapper 8.11 + AGP 8.7 + Kotlin 2.2 | `aapt2 + javac + d8 + apksigner` 手搓脚本 |
| 课表解析 | **Go**，编译成 AAR 给 Android 用 | JavaScript |
| 数据层 | Room/SQLite + Go 后端（可选 PostgreSQL） | JSON 文件 + SharedPreferences |
| 服务端 | Go（可选，不装也能用） | Cloudflare Worker（必选，但离线降级） |
| 测试 | Go 单测 + Android instrumentation 测试（15 个 DeviceTest） | 12 套离线 JS/Python 断言 |
| ABI | **仅 arm64-v8a** | 通用 |
| 最低系统 | Android 9 | Android 7 |

**它的架构明显更“正经”**——类型系统、组件化、依赖注入、Gradle 标准构建、真正的 instrumentation 测试。我这套是「手搓但能跑」。

**但方向不同**：
- 它是**本地优先**（数据在手机上，服务器可选）
- 我是**服务端驱动**（版本、公告、准入、审核都在云上）

本地优先在隐私和离线可用性上赢；服务端驱动在「能运营、能管控」上赢。

---

## 五、代码质量对比（客观说，它更好）

### 它做得比我好的地方

**1. 解析器是纯函数，且写明了「绝不把不确定判成 FREE」**

```go
// Status is the only production classification. The upstream page cannot
// reliably distinguish course/conflict/temporary causes, so every non-free
// value is OCCUPIED and every untrusted cell is UNKNOWN.
// The parser never turns an issue into FREE.
```

这个思路和我 v1.1.5 那条教训（「读不到不许冒充已完成」）是同一个原则，但它写进了类型约束里——`Status` 只有三个值，并且用 `Issue` 结构单独记录结构问题，**从设计上杜绝了静默误判**。

**2. 解析器明确区分「逻辑课程 / 排课安排 / 源行」**

```go
type Stats struct {
    LogicalCourses    int
    Sessions          int
    SourceRows        int
    UnparsedFragments int
}
// the caller must never equate them with the "13 courses" summary of the export
```

我没有这层区分，我的 `courses[]` 是扁平的。当一门课有多个上课安排时，这是隐患。

**3. 数据边界防腐做得狠**

`WanliData.java` 里每个字段都有校验：`text(value, 128, false)`（长度上限 + 是否允许空）、列表上限 100、日期必须落在选中月份内、重复日期直接抛异常。**所有外部来的数据都被当成不可信的。**

我的 water.js / sync.js 里没有这种系统性的边界校验。

**4. 有真正的 instrumentation 测试**

15 个 `*DeviceTest.java`，跑在真机/模拟器上。我只有离线断言——这是我一直明说的短板。

**5. 第三方许可管得清楚**

`THIRD_PARTY_NOTICES.md` + 应用内离线查看 + 自动生成脚本。我的 LICENSE 只有 AGPL 全文，没有依赖清单。

### 我做得比它好的地方

**1. 我在跑，它没有**

我线上有真实用户在用的版本（v1.1.17，几十个学生）；它只有 1 个 Release、10 star，**大概率还没有真实用户规模**。这不是技术优势，但是现实优势。

**2. 服务端运营能力**

见上，它完全没有。

**3. 我有学习通数据**

它没有。这是产品定位差异，但对学生来说「作业快到期」比「电费还剩多少」更天天用。

**4. 支持更老的系统**

Android 7 vs 它的 Android 9。学校里的旧手机不少。

**5. 覆盖面更广的 ABI**

我只用 `aapt2`，没有 NDK 限制；它因为 Go 编译产物**只支持 arm64-v8a**，32 位老机器装不上。

---

## 六、它暴露了我的哪些真问题

这一节是本分析最该看的部分。

| 我的问题 | 它的做法 | 我该怎么改 |
|---|---|---|
| **空闲教室覆盖率低**（只有自己课表里的十几间） | 解析 KINGOSOFT 公共查询页，拿全校教室 | 要你先确认 XXMU 有没有登录后的教室查询入口 |
| **作业只能看不能加** | 独立待办系统，可自建 | 在「学习」页加「+ 添加待办」，本地存 |
| **没有课程提醒** | 本地通知，提前 N 分钟 | Android 加 AlarmManager + Notification，可做 |
| **没有电费查询** | 万里平台接口 | 要你确认 XXMU 用哪个系统 |
| **代码架构欠债**（4700 行单文件、无类型、无框架、手搓构建） | React+TS+Capacitor+Gradle | 大改，不建议现在动 |
| **没有真机测试** | 15 个 DeviceTest | 要真机 |

---

## 七、结论

**它赢在工程质量和功能广度，我赢在真实运营和教务数据深度。**

- 它的**空闲教室**、**电费查询**、**待办**、**专注计时**、**课程提醒**、**主题系统**是真实的功能差距，其中空闲教室和待办对学生的价值最高。
- 我的**学习通作业同步**、**饮水机**、**公告与服务端运营**、**校园 UGC** 是它没有的，而且都是我这边日常在用、它那边完全没有的。
- 架构上它明显更正规（React+TS 有类型、Go 解析器纯函数、Gradle 标准构建、真机测试），我这边是「手搓但能跑」。**如果长期维护，它的路子对；但我现在有真实用户，重写风险太大。**

**最该做的三件事**（按性价比）：

1. **空闲教室升级** —— 要你提供 XXMU 登录后的教室查询 URL，我就能把覆盖率从「十几间」提到「全校」。这是差距最大的一项。
2. **加「自建待办」** —— 纯本地功能，一天能做完，补上「老师口头布置的作业没地方记」这个洞。
3. **加课程提醒** —— Android 本地通知，学生反馈会很直接。

**不建议做的**：重写技术栈。它有 750 个文件和完整工具链，我是一个人维护；现在把 React+TS 引进来，等于把 4700 行能跑的代码换成 7500 行跑不起来的代码。

---

## 附：核实方法说明

- 功能有无：在 750 条文件路径里对 23 个关键词做子串匹配（chaoxing/超星/学习通/homework/作业/exam/考试/library/图书/email/邮箱/grade/成绩/water/饮水/electric/电费/pdf/notice/公告），结果如实记录
- 空闲教室实现：读 `classroom/parser.go` 前 90 行，注释明写 "KINGOSOFT public-query classroom week matrix"
- 电费字段：读 `electricity/WanliData.java` 前 75 行
- XXMU 是否有公共查询：实测 6 条路径 + 1 条对照（不存在的路径），全部返回同一段 517 字节 stub
- APK 大小 / Release 数 / star：GitHub API 实测
