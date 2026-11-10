# NOVA 排版与对比度审计报告

- 审计员：`type-audit`（严格只读，未修改 `web/` 与 `tools/` 下任何文件）
- 审计基准：`NOVA-SIGNATURE.md` §2（配色配额与对比度底线）、§4（排版）
- **代码基线快照：2026-11-08 17:09（CST）** —— 所有行号与色值都用这一版逐条回查过（`node` 按 `\n` 切行 + 子串定位，非手抄）
  | 文件 | 字节 | 行数 | mtime（UTC） |
  |---|---|---|---|
  | `web/app.css` | 87080 | 1850 | 05:15:29（本次审计全程未被动过） |
  | `web/nova-skin.css` | 67009 | 1180 | 08:59:30 |
  | `web/nova-organs.css` | 67910 | 1049 | 09:04:34 |
  | `web/nova-medium.css` | 21624 | 351 | 08:54:11 |
  | `web/nova-pixel.css` | 18348 | 322 | 08:50:44 |
  | `web/nova-motion.css` | 25098 | 450 | 08:14:14 |
  | `web/nova-campuscard.css` | 12544 | 236 | 08:12:32（`index.html:27` **已引用**，本轮已计入统计） |
  | `web/pop.css` | 4365 | 108 | 05:41:12 |
- 实际加载序（`web/index.html:13-30` 逐行实测）：`app.css(13) → nova-skin.css(14) → nova-organs.css(15) → nova-medium.css(19) → nova-pixel.css(23) → nova-motion.css(24) → nova-campuscard.css(27) → pop.css(30)`
- 实算工具：`design/sketch/_audit3.js`（样式全量计数）+ `design/sketch/_c5.js`（WCAG 2.x 相对亮度与 alpha 合成）。两者都是 node 脚本、都**直接从 CSS 文件正则读令牌值**，不手抄；统计前统一剥掉 `/* */` 块注释，避免注释里的示例值污染计数。脚本在报告落盘后删除。
- 字号口径说明：只数 `font-size:` 会漏掉 `font:` 简写里的字号（`nova-organs.css` 有 69 处 `font:…Npx`，漏掉会把该层从 70 处低估到 1 处）。本报告字号总数 = **`font-size:` 216 + `font:` 简写 100 = 316**。

> **重要前提**：审计期间 `web/` 下的皮肤层正被其他队友持续重写（我只读未动）。本报告所有行号与数值以 17:09 快照为准；已被并行修复的项单列在 §0.2，**不再计入缺陷**，以免虚报。

---

## 0. 结论摘要

### 0.1 七项体检结论

| # | 项目 | 判定 | 关键量化 |
|---|---|---|---|
| 1 | 字号阶梯 | **失控** | **316 处**（`font-size:` 216 + `font:` 简写 100）/ **38 个值**；越出 §4 五档 **237 处 = 75.0%**；带小数 **99 处 = 31.3%**；<11px **81 处**（最小 **3.8px**，`nova-campuscard.css:110`；次小 **4.4px**，`:195`；第三 `app.css:195` 5.5px） |
| 2 | 字重 | **失控** | 186 处 / 7 个值；非法（非 400/500/700）**128 处 = 68.8%**，其中 800 独占 65 处、600 43 处、650 19 处、550 1 处；合法 400 仅 8 处、500 仅 5 处、700 45 处 |
| 3 | 行高 | **大面积缺失** | 全站仅 60 处显式声明（app.css 51 / pop.css 6 / campuscard 2 / organs 1）；`nova-skin.css` / `nova-medium.css` / `nova-pixel.css` / `nova-motion.css` **全部 0 处**；八九十来号的小字全部退回 `app.css:106` 的 `1.5` |
| 4 | 对比度 | **17 项不合格** | 实算 34 项 → FAIL 17；最差 **2.11:1**（`.ntc-badge`）、**2.58:1**（`--mute`）、**2.68:1**（`--n-ink-3`）、**2.95:1**（白字压 `--n-accent-hi`）、**3.46:1**（`.brand-sub`）、**3.62:1**（深色 `#grid .gp`） |
| 5 | 圆角 | **仍失控（收敛层之外）** | 275 处 / 字面量 **37 个值**；字面量 **178 处 = 64.7%**（令牌 97 处 = 35.3%）；四角显式不等 **29 处**（全在 `app.css` 西部覆盖层）；令牌三档（4/8/12）与宪法两档冲突 |
| 6 | 间距 4px 网格 | **系统性失守** | `padding/margin/gap` 里 px 数值 721 个 → 非网格且 >2px **398 个 = 55.2%**；**区块间距 ≥32px 全站 0 条**（唯一超 32 的是 `nova-campuscard.css:38` 的 `margin:-50px`，负值拉叠不算间距） |
| 7 | 硬编码 hex | **已大幅收敛但未清完** | 组件内硬编 **157 处**（skin 76 / app 46 / organs 20 / campuscard 12 / medium 3 / pixel 0 / motion 0 / pop 0）；`--n-ink-3` 浅深两档仍是两套互不同步且都不达标的色值 |

### 0.2 已被并行修复、本次不计为缺陷（诚实性声明）

以下都是我在审计过程中**实际测到过的缺陷**，但在 15:55 快照里已被队友改掉，故只记录、不计入：

| 原缺陷 | 现状态 |
|---|---|
| `.card` 四角 `10px 12px 9px 13px` 各说各话 | 已改为 `var(--n-r-md)`（`nova-skin.css:240`）；全站仅剩 `nova-medium.css` 注释里提到该字面量 |
| `.btn` 圆角 7px（不在令牌里） | 已改 `var(--n-r-sm)`（`nova-skin.css:266`） |
| `.btn.ghost` 青绿压浅底 **1.38:1** | 已改 `--n-accent-ink` 压白瓷（`nova-skin.css:269-271`） |
| `.btn.soft` 紫压浅底 **3.62:1** | 已改 `--n-ink-2` 压 `--n-surface-3`（`nova-skin.css:272-274`） |
| `.wiki-tag` 白字压珊瑚 **2.97:1** | 已改 `--n-accent-weak` / `--n-accent-ink`（`nova-skin.css:321`） |
| `.skin-opt.on`（nova 版）白字压珊瑚 **2.97:1** | 已改白瓷底 + `--n-accent-ink`（`nova-skin.css:367-369`） |
| `.room-f` 草绿压浅底 **1.83:1** | 已改 `--o-accent-ink`（`nova-organs.css:583`，深色档 `:600`） |
| `.nv-ticket-state` 橙压票据底 **2.18:1** | 已改 `--o-accent-ink`（`nova-organs.css:892`） |
| `.grade-score.muted` 2.84:1 | 已改 `--o-ink-3`（`nova-organs.css:940`；浅色档 `.grade-score` 本体在 `:939`） |
| `.nv-dial-read u` **3.58:1** | 已改 `--o-ink-3`（`nova-organs.css:262`），实测 5.82 |
| `#grid` **浅色档** 7px/8px/9px 小字对比度（曾测到 `.gp` 3.79、`.c .room` 4.33） | 已整片翻底：`nova-medium.css:156` 把 `#grid` 改 `--n-m-glass #D8E3E9` 纯色、`:191-203` 把 `.c` 改 `--n-m-card #FDFEFF` + `--n-ink` / `.room` 改 `--n-ink-2`；`:210-211` 把 `.gh/.gp` 改 `--n-ink-2`。按当前令牌实测 **5.43（gh/gp @glass）/ 6.53（@页面中段）/ 17.75（.c）/ 7.02（.c .room）**，全部通过 |
| `.nv-plate-h` 9px 用 `--n-ink-3` | **浅色档仍是 `--n-ink-3`**，但 `--o-ink-3` 已换成 `#57676F`（`nova-organs.css:33`），`nova-organs.css:453-454` 实际读 `var(--o-ink-3)` → @`#D8E3E9` 4.50 / @`#FDFEFF` 5.82，**压线通过**；深色档 `:470-471` 仍读 `--n-ink-3` `#8B7FB5` → @`#26314C` 3.57 **仍不合格** |
| 页面底 5 团彩色 radial-gradient（无法测最不利端） | 已改三点线性渐变 `#F8FAFB → #F3F6F7 → #EFF2F4`（`nova-skin.css:63`），本文所有"页面底"测量都按这三点取最暗（`#EFF2F4`） |
| `.nv-dial-read` 曾按"磁带壳"测 | 底子已澄清：`nova-organs.js` 把它 `insertBefore` 到 `#tabs` 上方，真实底是石墨渐变 `#1D2830 → #0C1317`；该处现读 `--o-ink-3`，已达标 |

> 另：用户点名的三个嫌疑点，实测结论如下——
> - `--n-ink-3:#7B8B99` 在中性底上**确实不够**（九底实测 2.68~3.50:1，需 4.5）→ 成立，见 §4.1。
> - `.card` 圆角 `10px 12px 9px 13px` **曾经成立，现在已修**（`nova-skin.css:250` 收成 `var(--n-r-md)`）→ 当前树 0 命中；但 `app.css` 里另有 **29 处**四角不等的手绘圆角仍在跑（§5.3）。
> - `web/app.css` 大量非 4 倍数间距 **成立**（271 个 px 值非网格），`nova-organs.css` 还有 90 个 → 见 §6。
> - `nova-skin.css` / `nova-organs.css` 直接写 hex **成立但已收敛**（skin 现 76 处、organs 20 处）→ 见 §7。
>
> 另外三个嫌疑点实测**不成立**，如实说明：`.nv-plate-row b` 14.80:1、`.nv-ticket-read b` 12.94:1、`.nv-rain-seg b` **11.79:1**（`b` 全部达标；但 `u` 曾不达标，现已随 `--o-ship-ink-2` 修好）。

### 0.3 最严重 3 条

1. **`--n-ink-3` 在浅色档全线不合格** — `web/nova-skin.css:11` 定义 `#7B8B99`，在九个真实底色上实测 **2.68（`--n-m-glass #D8E3E9`，最差）/ 2.99 / 3.12 / 3.17 / 3.19 / 3.23 / 3.35 / 3.47 / 3.50（`#FFFFFF`，最好）**，全部低于 4.5，多数连大字标准 3.0 都不到。第三档文字（`.hint`、`.elec-entry-sub`、`.elec-entry-unit`、`.wiki-src`、`.gate-sub`、`.nv-plate-h`、`.room-m`、`.pop-alert-x` 等）一次性全中。**建议 `--n-ink-3: #566370`**——这是候选阶梯里唯一九底全过的值（最险底 `#D8E3E9` 4.71，最好底 `#FFFFFF` 6.15）；`#5A6874`（4.39）、`#5E6C79`（4.13）都还差一口气。
2. **`.ntc-badge` 是全站最差对比度 2.11:1，且它是"待办数字"这类必读信息** — `web/app.css:1543` `.ntc-badge{background:var(--yellow);color:var(--oncolor)}`，`--oncolor #FDF6E6` 压 `--yellow #D9A32B` 只有 **2.11:1**（正文要 4.5）。同组 `:1538` 的 `.upd-ico/.tut-icon/.gate-badge` 用 `--oncolor` 都过（6.68 / 4.64 / 5.41），**只有这一颗翻车**，所以不能整组换色——`--ink` 换到 `.upd-ico` 会掉到 2.16、换到 `.tut-icon` 掉到 2.52。**只改 `.ntc-badge` 一处：`color:var(--ink)` = 5.53:1**。
3. **字号阶梯完全失控 + 极小字不可读** — **38 个字号值**、75.0% 越出五档、**81 处 <11px**。最小已不是 `app.css:195` 的 5.5px，而是 `web/nova-campuscard.css:110` 的 **3.8px**、`:195` 的 **4.4px**（校园卡器官的说明行，属于正文信息而非装饰），第三才是 `app.css:195` 的 5.5px（课表"节"字，还被 `transform:scale(.95)` 二次压到 5.2px）。**建议收敛到 `11 / 13 / 15 / 18 / 24` 五档，任何层级字号下限锁 11px**；课表内格靠 `scale` 缩放或隐藏非必要字段消化，而不是把字号缩到个位数。

---

## 1. 字号阶梯失控

### 1.1 全量分布（`_audit3.js` 实测，**316 处**声明）

统计口径：`font-size:` 直写 **216 处** + `font:` 简写里带的字号 **100 处**（简写同样决定字号，漏掉会低估 nova-organs 层一半的量）。合计 **316 处 / 38 个值**。

| 值 | 次数 | 五档 | 值 | 次数 | 五档 | 值 | 次数 | 五档 |
|---|---|---|---|---|---|---|---|---|
| 60px | 1 | ✗ | 21px | 1 | ✗ | 13.5px | 10 | ✗ |
| 56px | 1 | ✗ | 20px | 4 | ✗ | 13px | 26 | ✓ |
| 46px | 1 | ✗ | 19px | 4 | ✗ | 12.5px | 34 | ✗ |
| 32px | 1 | ✗ | 18px | 2 | ✓ | 12px | 30 | ✗ |
| 30px | 2 | ✗ | 17px | 5 | ✗ | 11.5px | 31 | ✗ |
| 26px | 2 | ✗ | 16.5px | 2 | ✗ | 11px | 34 | ✓ |
| 24px | 1 | ✓ | 16px | 5 | ✗ | 10.5px | 8 | ✗ |
| 23px | 1 | ✗ | 15.5px | 1 | ✗ | 10px | 20 | ✗ |
| 22px | 2 | ✗ | 15px | 16 | ✓ | 9.5px | 2 | ✗ |
| — | — | — | 14.5px | 3 | ✗ | 9px | 30 | ✗ |
| — | — | — | 14px | 15 | ✗ | 8.5px | 3 | ✗ |
| — | — | — | — | — | — | 8px | 9 | ✗ |
| — | — | — | — | — | — | 7.5px | 1 | ✗ |
| — | — | — | — | — | — | 7px | 4 | ✗ |
| — | — | — | — | — | — | 6.5px | 1 | ✗ |
| — | — | — | — | — | — | 5.5px | 1 | ✗ |
| — | — | — | — | — | — | 4.4px | 1 | ✗ |
| — | — | — | — | — | — | 3.8px | 1 | ✗ |

- **38 个值，§4 只允许 5 档（11 / 13 / 15 / 18 / 24）。落在档位里的只有 5 个值、**79 处**；越出 **237 处 = 75.0%**。**
- **带小数 99 处 = 31.3%**（`.5` 系列 8 个值 + `3.8` / `4.4` / `6.5`）。半像素字号在 1x DPR 屏上必然出现亚像素模糊，字重看起来"发虚"，这是 NOVA 皮肤"不够锐"的第一来源。
- 单文件集中度：`app.css` **203** 处、`nova-organs.css` **70** 处、`nova-skin.css` **29** 处、`nova-campuscard.css` **7** 处、`pop.css` **7** 处、`nova-medium.css` / `nova-pixel.css` / `nova-motion.css` 各 **0** 处（这三层只覆盖颜色与动效，不碰字号 —— 这是做对的）。
- 补充：`letter-spacing` 同样无阶梯（**121 处 / 27 个值**，含 `-2px×3` / `-.2px×7` / `1.8px×3` / `.02em×2` / `.05em×1` / `.06em×2` / `.10em×2`），字距是层级变量的一部分，这里一并列为阶梯失控。

### 1.2 逐条缺陷（文件:行号 | 现值 | 建议值 | 理由）

**A. 极小子字（< 11px，共 **81 处**，全部列出）**

统计含 `font:` 简写 —— 这一节是**含简写口径**。`app.css` 24 处、`nova-organs.css` 40 处、`nova-skin.css` 11 处、`nova-campuscard.css` 6 处。

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/nova-campuscard.css:110` | `3.8px` | 11px | **全站最小**。3.8px 在 1x 屏上连一个汉字都放不下，只剩色块；且它落在校园卡器官的说明行上，是**正文信息**不是装饰 |
| `web/nova-campuscard.css:195` | `4.4px` | 11px | 第二小。同样不可读 |
| `web/app.css:195` | `.gp .gt{font-size:5.5px}` | 11px（或移除该字） | 曾是"全站最小"，现排名第三。5.5px 被 `transform:scale(.95)` 二次缩小后实际 5.2px |
| `web/nova-campuscard.css:120` | `6.5px` | 11px | |
| `web/app.css:214` | `.c .pr{font-size:7px}` | 11px | 课表格里的教师名，是**正文信息**不是装饰；7px 且 `opacity:.9` 双重削弱 |
| `web/app.css:216` | `.c .pr2{font-size:7px}` | 11px | 同上 |
| `web/nova-skin.css:200` | `font:7px …`（同 `.pr` 系） | 11px | nova 层重复了一遍 app 层的 7px |
| `web/nova-organs.css:460` | `font:7px …`（`color:var(--o-ship-ink-3)`） | 11px | 器官层最小字 |
| `web/app.css:213` | `.c .room{font-size:7.5px}` | 11px | 教室名，正文信息 |
| `web/app.css:205` | `font-size:8.5px;line-height:1.22` | 11px | 课表格主体文字 |
| `web/app.css:211` | `.c b{font-size:9px;font-weight:650}` | 11px + 700 | 9px 配 650 是"既小又不够粗"，读不清 |
| `web/app.css:194` | `.gp>div:first-child{font-size:9.5px}` | 11px | 节次格序号 |
| `web/app.css:527` | `.wiki-tag{font-size:9px}` | 11px | 角标 |
| `web/app.css:565` | `.fb-kind{font-size:9.5px}` | 11px | 反馈类型标签 |
| `web/app.css:186` / `:1485` | `.gh{font-size:10px}` | 11px | 星期头（同一选择器两个位置、两种字重） |
| `web/app.css:395` `.hwbadge` / `:721` `.adm-at` / `:723` `.adm-odd` / `:1071` `.rev-badge` / `:1081` `.rev-reply-t` / `:1511` `#tabs button` | `10px` ×6 | 11px | 全是功能性标签；`#tabs` 是主导航 |
| `web/app.css:1381` | `.brand-sub{font-size:10px;letter-spacing:1.4px}` | 11px / ls 1.2px | 品牌副名；10px + 1.4px 字距让汉字之间出现裂缝 |
| `web/app.css:301` / `:567` / `:573` / `:790` / `:1074` / `:1404` | `10.5px` ×6 | 11px | |
| `web/nova-organs.css:581` | `.room-m{font-size:10.5px !important}` | 11px | 器官层最小字 |
| `web/nova-skin.css:584` | `font:10.5px …` | 11px | |
| **`web/nova-organs.css` 余下 38 处** | `85(9) 135(9) 173(8) 197(8) 216(9) 234(9) 275(9) 291(8) 314(10) 335(9) 354(9) 368(9) 370(9) 405(8) 406(10) 408(9) 438(8) 469(9) 506(10) 512(9) 523(10) 535(9) 541(9) 564(9) 606(10) 700(10) 706(10) 716(10) 739(8) 754(9) 785(9) 792(8) 796(10) 805(8) 828(9) 831(9) 836(9) 854(9)` | 11px | 器官层把 8~10px 当成了默认刻度 —— 这是本层最系统的一处问题：**40 处 <11px 占本层 70 处的 57%** |
| **`web/nova-skin.css` 余下 9 处** | `100(9) 109(9) 134(9) 157(9) 159(8) 186(8.5) 195(9) 321(10) 355(9)` | 11px | `.gp` 8px（`:159`）、`#grid .c b` 8.5px（`:186`）、`#tabs button` 9px（`:355`）都在此列 |
| **`web/nova-campuscard.css` 余下 3 处** | `106(10) 190(8.5) 218(9)` | 11px | |

**B. 半像素中间值（§4 明令禁止，抽样 14 条）**

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:141` | `.brand-name{font-size:16.5px;font-weight:650}` | 18px / 700 | 品牌名是层级最高的一处，却用最不可控的 16.5 |
| `web/app.css:148` `:159` `:239`（另 29 处：`327 341 350 366 497 575 629 654 672 694 699 717 733 761 768 780 819 858 954 1017 1050 1075 1076 1188 1649 1814 1818 1828 1845`） | `12.5px` ×**32** | 13px | **单一值最大宗**。12.5 与 13 只差 0.5px，肉眼分不出却制造两档；32 处改 13px 后 `12.5px` 整个值消失 |
| `web/app.css:173` | `15.5px` | 15px 或 18px | 与基准 15px 几乎同值，纯噪声 |
| `web/app.css:253` `:309` `:374` `:393` `:423` `:726` `:884` `:996` `:1129` `:1797` | `13.5px` ×10 | 13px | 13.5 是 13 与 15 之间的假档 |
| `web/app.css:665` `:1327` `:1458` | `14.5px` ×3 | 15px | 14.5 同样是 13/15 之间的假档 |
| `web/app.css:924` | `16.5px` | 18px | |
| `web/app.css:326` `:788` `:1380` `:1400` + `web/nova-organs.css:366` | `17px` ×5 | 18px | 17 不在五档内，且 18px 档只有 2 处 —— 说明 18 档被 17 抢走了 |
| `web/app.css:128` `:650` `:1120` `:1825` | `20px` ×4 | 18px 或 24px | 20 是 18/24 之间的假档 |
| `web/app.css:919` `:987` | `22px` ×2 | 24px | |
| `web/app.css:690` | `.about-logo{font-size:21px}` | 24px | 21 是全站孤值 |
| `web/app.css:652` | `.gate-logo{font-size:23px}` | 24px | 23 是 24 档的"手抖值" |
| `web/app.css:760` `:856` | `18px` ×2 | 18px（合规，保留） | 记录为**正确档位的样本**：18px 本该是卡标题标准档，却只有 2 处 |
| `web/nova-organs.css:336` | `.nv-clip-title{font:800 19px …}` | 18px | 器官层自己又造了 19px 档（app 层 `:169` `:1125` `:1184` 也是 19px） |
| `web/app.css:1337` vs `:1797` | `.th-inline .th-opt` 14px vs 13.5px | 统一 13px | **同一选择器两个字号**，后者是西部覆盖层，切皮肤时字号会跳 |

**C. 读数档大小不一（同一语义多种尺寸）**

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:348` | `.elec-big{font-size:60px}` | 56px | 与 `:445` 同语义（都是"读数大字"），却差 4px |
| `web/app.css:445` | `.focus-time{font-size:56px}` | 56px | 基准 |
| `web/nova-organs.css:696` | `font:700 46px/1.02 …` | 56px 或独立声明 | 器官层第三个读数尺寸。**46/56/60 三个值服务同一种视觉角色**，`46px` 还自带 `line-height:1.02`（低于 §4 的 1.15 下限） |
| `web/app.css:333` | `.elec-entry-odd{font-size:30px}` | 24px | 30 不在任何档；且与 `:1679` 的 **32px**（西部覆盖层同一选择器）冲突 |
| `web/app.css:1679` | `.elec-entry-odd{font-size:32px;font-weight:800}` | 24px / 700 | 同一选择器第二个字号 + 非法字重，切皮肤字号会从 30 跳到 32 |
| `web/nova-skin.css:315` | `font:700 30px …` | 24px | skin 层又造了 30 档（第四个"中间大档"） |
| `web/app.css:647` `:758` | `font-size:26px` ×2 | 24px | 26 是 24 档的手抖值；`nova-organs.css:505` 的 `.grade-stat b` 是 **24px**（正确），同一类"统计大数"两层不一致 |
| `web/app.css:652` | `.gate-logo{font-size:23px}` | 24px | 见 §1.2-B |
| `web/app.css:1120` | `font-size:20px` | 24px | 弹层大标，与 `:1125` 的 19px 相邻却不同档 |

> **建议阶梯**：`11px`（刻度/标签/徽标）· `13px`（正文次要/表格）· `15px`（正文）· `18px`（小标题/卡标题）· `24px`（读数小档）· 外加一个**显式声明的第六档 `56px`（读数大档）**——宪法 §4 只写五档，但代码里 46/56/60 已经在做第六档的事，与其默许三个值并存，不如承认它为 `--n-fs-display`。需要归并或删除的值共 **33 个**：`60 / 46 / 32 / 30 / 26 / 23 / 22 / 21 / 20 / 19 / 17 / 16.5 / 15.5 / 14.5 / 13.5 / 12.5 / 11.5 / 10.5 / 10 / 9.5 / 9 / 8.5 / 7.5 / 7 / 6.5 / 5.5 / 4.4 / 3.8`。

---

## 2. 字重滥用

### 2.1 全量分布（**188 处 / 7 个值**）

| 值 | 次数 | 占比 | 合法性 |
|---|---|---|---|
| **800** | **65** | 34.6% | ✗ 非法 |
| 700 | 45 | 23.9% | ✓ |
| **600** | **43** | 22.9% | ✗ 非法 |
| **650** | **19** | 10.1% | ✗ 非法 |
| 400 | 8 | 4.3% | ✓ |
| 500 | 7 | 3.7% | ✓ |
| **550** | **1** | 0.5% | ✗ 非法 |

- **非法合计 128 处 = 68.1%**（188 处声明，去块注释口径；`font-weight:` 与 `font:` 简写合并统计）。
- **层级倒挂**：最重的 800（65 处）比正常 400（8 处）多 8 倍，比 500（7 处）多 9 倍。说明"重要"这件事全靠加粗表达，而不是 §4 要求的「尺寸 + 字重 + 颜色」三者组合。
- **动态字体不会帮你**：`550 / 650` 在多数系统中会落到 `font-synthesis` 的最近可用档（通常变成 400 或 700），**不同设备渲染结果不一致**——同一行字在 iPhone 和安卓上粗细不同。
- 800 的集中度极端：65 处里有 **62 处挤在 `app.css` 的西部涂鸦覆盖层（1379–1835）**，另 3 处在 `nova-skin.css:389/520/717`；`600` 43 处里 `app.css` 占 37 处，其余在 `nova-skin.css:277/695/1089/1128`、`nova-campuscard.css:190`、`pop.css:77`。

### 2.2 逐条缺陷

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:525` | `.wiki-t{font-weight:550}` | 500 | **全站唯一 550 值**（188 处里仅此 1 处）。单点野值，无规则可循；500 已是"中等强调"档 |
| `web/app.css:141` | `.brand-name{font-weight:650}` | 700 | 品牌名用 700 是合理的，650 落入合成区间 |
| `web/app.css:173` `:194` `:211` `:231` `:245` `:290` `:379` `:481` `:490` `:505` `:515` `:542` `:573` `:726` `:997` `:1071` `:1081` `:1330` | `650` ×18（+`:141` 共 19） | 700 | 650 全部改成 700，语义不变而渲染可控。**注意 `:194` 是 `.gp>div:first-child{font-size:9.5px;font-weight:650}`——9.5px 配 650 是全站最难读的一处**（既超小又不够粗） |
| `web/app.css:152` `:162` `:254` `:262` `:269` `:303` `:309` `:313` `:335` `:341` `:345` `:367` `:374` `:393` `:401` `:426` `:444` `:458` `:500` `:529` `:564` `:566` `:618` `:624` `:630` `:693` `:769` `:884` `:988` `:1057` `:1203` `:1214` `:1447` `:1582` `:1622` `:1678` `:1838`（37 处）+ `web/nova-skin.css:277` `:695` `:1089` `:1128`（4 处）+ `web/nova-campuscard.css:190` + `web/pop.css:77` | `600` ×43 | 500 或 700 | 600 与 650 在低分屏上分辨不出来，等于白加一档；建议二选一。`.chips button.on{color:#fff;font-weight:600}`（`web/app.css:500`）是**最高频交互控件选中态**，600 应优先删 |
| `web/app.css:1379`–`1835` 段（西部覆盖层，62 处） | `800` | 700 | 手风琴/涂鸦覆盖层整段用 800，"涂鸦感"不来自字重 |
| `web/app.css:1627` | `.focus-time{color:var(--ink);font-weight:800;letter-spacing:-2px}` | 700 | 56px 大字已经靠尺寸拉层级，800 只会让笔画糊在一起；同行 `letter-spacing:-2px` 也让汉字挤在一起 |
| `web/app.css:1679` | `.elec-entry-odd{font-size:32px;font-weight:800;letter-spacing:-1.2px}` | 700 | 与 `:333`（30px/700）同选择器，字重字号双双不一致 |
| `web/app.css:1835` | `.grade-score{font-weight:800}` | 700 | 成绩数字，另有 tabular-nums（已加） |
| `web/nova-skin.css:389` | `.skin-opt.on{…;font-weight:800}`（裸规则，`:385`–`:389`） | 700 | 同时是**作用域泄漏的裸规则**（见 §7.4）：无 `html[data-skin="nova"]` 前缀，只在非 nova 皮肤生效（nova 版是 `:382`） |
| `web/nova-skin.css:520` | `.sh-head b{font-weight:800 !important}` | 700 | skin 层对 app 层 `:290` 的 650 再叠一层 800，最终渲染值由加载序决定 |
| `web/nova-skin.css:717` | `.gate-logo{…font-weight:800 !important}` | 700 | app 层 `:652` 是 700，skin 层升到 800 → **同一元素两个字重** |
| `web/nova-organs.css:537` `:356` `:366` `:505` `:336` | `font:800 16px` / `font-weight:700` / `font:800 17px` / `font:800 24px` / `font:800 19px` | 700 | 器官层与 app 层同语义不同值（`.grade-score` app 是 800、organs 也是 800，但 `.nv-ticket-state` organs 用 700 —— 同类状态标签两套规则） |

> **建议规则**：`400` 正文 / `500` 次级强调 / `700` 标题与读数，**删除 550 / 600 / 650 / 800 四个值**。若确实需要"比 500 重但不至于 700"，用**颜色加深**而不是加字重（§4 已明确要求三者组合）。

---

## 3. 行高缺失与异常

### 3.1 全量分布（**60 处真值 / 8 个文件**）

> 口径：只统计显式 `line-height`（含 `font:` 简写里的 `/1.5` 形式）。`web/nova-organs.css:153` 有一处 `15` 是误命中（`font-size` 的一部分），已剔除。

| 文件 | 显式 line-height 处数 | 说明 |
|---|---|---|
| `web/app.css` | 51 | 唯一较完整的文件 |
| `web/pop.css` | 6 | `1.6 / 1 / 1.5 / 1.65 / 1.5 / 1.55`（`:31` `:41` `:68` `:70` `:89` `:102`） |
| `web/nova-campuscard.css` | 2 | 都是 `1.1`（`:104` `:120`） |
| `web/nova-organs.css` | **1** | 唯一真值 `:791` = `1.15`。**器官层 70 处字号只配了 1 处行高** |
| **`web/nova-skin.css`** | **0** | **接管全站主界面的一层（1224 行、29 处字号），一行没有** |
| **`web/nova-medium.css`** | **0** | |
| **`web/nova-pixel.css`** | **0** | |
| **`web/nova-motion.css`** | **0** | 纯动效，可豁免 |

值分布（19 个不同值）：`1×9`、`1.6×8`、`1.5×5`、`1.4×4`、`1.7×4`、`1.55×4`、`1.65×3`、`1.45×3`、`1.85×3`、`1.75×3`、`1.22×2`、`1.05×2`、`1.1×3`、`1.35×2`、`1.2×1`、`1.9×1`、`1.8×1`、`1.25×1`、`1.15×1`。

**`1×9` 是第一个真问题**：`line-height:1` 意味着行盒等于字号，汉字上下会被切掉一点（汉字的实际行盒需要 ≥1.15 才不裁）。9 处全在 `web/app.css`（`:128` `:169` `:332` `:370` `:418` `:431` `:1179` `:1435` + `pop.css:41`）。

### 3.2 核心缺陷：小字被拉回 1.5

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:106` | `font:15px/1.5 …`（全站唯一基准） | 保持 15px/1.5 | 作为正文基准是对的 |
| `web/nova-skin.css:186` | `font:8.5px/1.25 …`（`#grid .c` 主体） | 11px / 1.5 | 8.5px 连同一个 1.25 的行盒只有 10.6px |
| `web/nova-skin.css:195` | `#grid .c b{font:700 9px/1.3 …}` | 拆开写，`line-height:1.15` | 9px × 1.3 = 11.7px 行盒；且相邻 `.c` 主体用 8.5px/**1.25**（`:186`），两个值不成体系 |
| `web/nova-skin.css:354`–`:355` | `#tabs button{color:rgba(233,240,242,.52)}` + `font:9px …` **无行高** | `line-height:1.15` | 9px 继承 1.5 → 行盒 13.5px；`min-height:46px` 让它视觉上居中，实际无害，但**没写就等于没控制**，一旦有人改 min-height 就会串 |
| `web/nova-skin.css:270` | `.hint,.hint.tight{color:var(--n-ink-3)}` **无行高、无字号** | 加 `font-size:11px;line-height:1.5` | `.hint` 是说明文字，跨多行时行高决定可读性；app 层 `:219` 给了 11.5px 但没给行高 |
| `web/nova-skin.css:313` | `.elec-entry-sub{…font-size:11px !important}` **无行高** | `line-height:1.5` | 11px 继承 1.5 尚可，但同文件 `:317` 的 `.elec-entry-unit` 只有 `color` → 字号与行高都落到 app 层 |
| `web/nova-organs.css:597` | `.room-m{color:var(--o-ink-3) !important;font-size:10.5px !important}` **无行高** | 11px / 1.5 | 10.5px 配 1.5 = 15.75px 行盒，与相邻 11px 行不同高 |
| `web/nova-organs.css:368` | `.nv-ticket-read u{font:9px …}` **无行高** | 11px / 1.15 | 票券副读数，单行也不能省 |
| `web/app.css:205` | `font-size:8.5px;line-height:1.22` | 11px / 1.5 | 8.5px 用 1.22 是"小字收紧"的手法，但 8.5px 本身非法（见 §1） |
| `web/app.css:211` | `.c b{font-size:9px;font-weight:650;line-height:1.22}` | 11px / 1.5 | 同上；9px + 650 + 1.22 是三项缺陷叠在一行 |

### 3.3 行高异常值

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:220` | `line-height:1.65` | 1.6 | §4 上限 1.6；1.65 让该段比别人松 5%，跨段拼接时可见 |
| `web/app.css:1126` | `line-height:1.35` | 1.5 | 正文用 1.35 太紧（汉字行距不足会粘连） |
| `web/app.css:1185` | `line-height:1.35` | 1.5 | 同上 |
| `web/app.css:348` | `.elec-big{font-size:60px;line-height:1.05}` | 1.15 | §4 读数档下限 1.15；60px 用 1.05 行盒 63px，配上下边框容易裁字 |
| `web/app.css:445` | `.focus-time{font-size:56px;line-height:1.05}` | 1.15 | 同上 |
| `web/nova-organs.css:696` | `font:700 46px/1.02 …` | 1.15 | **全站最紧的读数行高**，46px × 1.02 = 46.9px 行盒 |
| `web/app.css:128` `:169` `:332` `:370` `:418` `:431` `:1179` `:1435` | `line-height:1` ×8 | 1.15 | 见 §3.1 末尾 |
| `web/app.css:789` | `line-height:1.25` | 保持（读数档上限） | 合规，记录为正确样例 |
| `web/app.css:141` | `.brand-name{line-height:1.2}` | 保持 | 合规 |
| `web/nova-campuscard.css:104` `:120` | `line-height:1.1` | 1.15 | 1.1 低于下限；且是全站含 3.8px/4.4px 的那一层 |

> **建议**：在 `nova-skin.css` 顶部补一个统一的排版底座（这是当前最大空白）：
> ```css
> html[data-skin="nova"]{
>   --n-lh-tight:1.15;   /* 读数、标题、单行数字 */
>   --n-lh-body:1.5;     /* 正文、说明 */
> }
> html[data-skin="nova"] .card-title,
> html[data-skin="nova"] .elec-entry-odd,
> html[data-skin="nova"] .focus-time,
> html[data-skin="nova"] .nv-ticket-read b{line-height:var(--n-lh-tight)}
> html[data-skin="nova"] .hint,
> html[data-skin="nova"] .row,
> html[data-skin="nova"] .elec-entry-sub{line-height:var(--n-lh-body)}
> ```

---

## 4. 对比度不达标（实算）

> 方法：WCAG 2.x 相对亮度公式，`alpha` 先按目标底合成，渐变取两端的**最不利端**。需求栏按 §2.3：正文/说明 4.5，大字 3.0。全表见附录 A。**实算 32 项 → FAIL 13 项**（附录 A 第 1–32 行；1–31 来自 `_contrast4.js` 主表，第 32 行为 `#grid` 专项复算补入的深色档 `.gp`；第 33 行是该条的修复候选）。

### 4.1 FAIL 清单（按严重度排序）

| 文件:行号 | 选择器 / 令牌 | 实测 | 需求 | 建议值 | 理由 |
|---|---|---|---|---|---|
| `web/app.css:1543` | `.ntc-badge{background:var(--yellow);color:var(--oncolor)}` | **2.11** | 4.5 | `color:var(--ink)` → **5.53** | **全站最差**。同组 `:1538` 的 `.upd-ico/.tut-icon/.gate-badge` 三枚用 `--oncolor` 都过（6.68/4.64/5.41），只有它压在 `--yellow #D9A32B` 上翻车。注意：**不能整组换色**——`--ink` 用在 `.upd-ico`(2.16) 与 `.tut-icon`(2.52) 上会反向不达标，必须逐枚给色 |
| `web/nova-skin.css:11` | `--n-ink-3:#7B8B99`（浅色档三级文字） | **2.68**（最差）～3.50（最好） | 4.5 | **`#566370`** | 九个实际底 **全部**不过：`#FFFFFF` 3.50 / 页面顶 `#F8FAFB` 3.35 / 中段 `#F3F6F7` 3.23 / 底 `#EFF2F4` 3.12 / `--n-shell #E8EEF0` 2.99 / `--n-surface-3 #F1F4F5` 3.17 / `--n-m-card #FDFEFF` 3.47 / `--n-m-paper #F1F5F7` 3.19 / `--n-m-glass #D8E3E9` **2.68**。候选阶梯九底最小值：`#6E7E8C` 3.20 / `#687885` 3.49 / `#62717E` 3.85 / `#5E6C79` 4.13 / `#5A6874` 4.39 / **`#566370` 4.71（唯一九底全过）**。**对照：器官层同一语义的 `--o-ink-3:#57676F`（`nova-organs.css:33`）是 5.82/5.31，本来就达标——两层第三档用了两个色值，这就是"深浅档不同步"最直接的证据** |
| `web/app.css:39`（`--mute:var(--pencil)` ← `:22 --pencil:#9C8B70`） | 经典纸壳三级字 `--mute` | **2.58**～2.99 | 4.5 | **`#726140`** | @`--surface #FAF3E2` 2.99 / @`--paper #EFE2C8` **2.58** / @`--surface2 #F5EAD4` 2.78 / @`--today-bg #F4E2B4`（`:56`）**2.58**。`#726140` 实测 5.42/4.68/5.03/4.68 全过 |
| `web/app.css:21` | `--ink2 #6A5842` 在 `--today-bg` 上的派生用法（`.gp>div:first-child` 等） | 6.15（surface）但 4.xx（today-bg） | 4.5 | 单独给 `--today-bg` 配深一档 | 记录：`--ink2` 在 `#FAF3E2` 达 6.15，但 `--today-bg #F4E2B4` 更黄更暗，实测已接近下限，需按底给色 |
| `web/nova-skin.css:30` | `--n-accent:#12897C`（白字） | **4.29** | 4.5 | **`#117B6F`（5.14）** | 当前树实查，`background:var(--n-accent)` + `color:#FFFFFF` 的三处全在 skin 文件：`web/nova-skin.css:265-266` `.btn`（主按钮）、`:655-656` `.btn-sm`（设备行小圆钮）、`:863-864` `.pop-confirm-yes`（确认弹层主按钮）。**换深字也不行**：`#04241F` 只有 3.83、`#062029` 3.93、`#0B1F1C` 3.99——`#12897C` 卡在"白字差一点、深字也差一点"的中间值，只能压深主色。`--n-accent-lo #0A6156` 白字 7.35 达标（按下态 `:276`），保持不动。`.th-opt.on`（`:357-358`）与 `.skin-opt.on`（`:367-369`）已改用 `--n-accent-weak` 淡底 + `--n-accent-ink` 字，**不再受影响** |
| `web/nova-skin.css:339` | `#tabs button{color:rgba(233,240,242,.46)}` | **3.94** | 4.5 | `.46 → .62`（**5.91**） | 底是 `linear-gradient(180deg,--n-graphite-3 #1D2830, --n-graphite-2 #0C1317)`，最不利端 3.94、另一端 4.23，两端都不过。**这是底部主导航的 5 个主按钮，9px 小字，无大字豁免** |
| `web/nova-skin.css:387` | 深色档 `--n-ink-3:#8B7FB5` | **3.57**（@`#26314C`）～5.09 | 4.5 | **`#A79BD1`** | 五个深色底：`#241A3E` 4.49（差 0.01）/`#161028` 5.09/`#1A1430` 4.89/`#2E2350` 3.94/**`#26314C` 3.57**。`#A79BD1` 实测 6.39/7.25/6.95/5.60/5.07 全过；`#9A8FC4` 仍有一底 4.37 不过，不要用 |
| `web/nova-skin.css:154` | **深色档** `#grid .gp{color:rgba(226,236,238,.44)}`（8px，节次列） | **3.79 / 3.81** | 4.5 | `.44 → .58`（**5.63 / 5.87**） | 浅色档已由 `nova-medium.css:210-214` 整片翻底修好（实测 5.48/6.34），**深色档漏改**：这条 `rgba(226,236,238,.44)` 无 dup，在 `#grid` 深色底 `linear-gradient(180deg,#1A1234,#0D0920)` 上只有 3.79/3.81。同文件 `:152` 的 `.gh` 是 `.52` → 4.77/4.89 刚过，`.gp` 比它低一档就掉出去了。`.50` 只到 4.52，余量太薄，建议 `.58` 与 `.gh` 拉开 |
| `web/app.css:41` | `--accent-soft #F3DCCB` 上放 `--accent #B23B26` 文字 | **4.49** | 4.5 | 文字改 `#A82F1E` → **5.15** | **差 0.01**。受影响 14 处：`app.css:151`(.pill.accent)、`:268`(.btn.soft)、`:481`、`:528`(`.wiki-tag` 9px)、`:565`(`.fb-kind` 9.5px)、`:572`、`:692`、`:768`、`:877`、`:979`、`:1080`、`:1134`、`:1330`(`.th-opt.on`)、`nova-skin.css:374`。**9px/9.5px/12.5px 都是小字，无豁免** |
| `web/app.css:70` | `--kb-fg2 #8A6A22` @ `--kb-bg #F4E2B4`（`:67`） | **3.93** | 4.5 | **`#6E5214`（5.69）** | 键盘次文字 |
| `web/app.css:31` | `--mist #8E7BC4` @ `--surface` | **3.28** | 4.5 | **`#6B57A8`（5.34）** | 主要出处 `app.css:1840` `.grade-row.covered .grade-score{font-size:12px;font-weight:700}`（12px 小字）。另 `:1628`/`:1795`/`:1803-1805` 用 `--mist` 做装饰线可豁免，**只有 1840 是文字** |
| `web/nova-organs.css:599` | 深色档 `.room-m{color:var(--n-ink-3) !important}` | 3.57～4.49 | 4.5 | 改 `var(--o-ink-3)` 的深色档值 | 浅色档已在 `:581` 改成 `var(--o-ink-3)`（@`--n-m-glass` 4.50 / @`--n-m-card` 5.82），**深色档漏改**——同一文件内同选择器两档不一致。深色底：`#26314C` 3.57 / `#2E2350` 3.94 / `#241A3E` 4.49 |
| `web/nova-organs.css:470-471` | 深色档 `.nv-plate-h{color:var(--n-ink-3) !important}`（9px/700） | **3.57** | 4.5 | 同 `.room-m`（改用深色档 `--o-ink-3`） | 浅色档 `:453-454` 已读 `var(--o-ink-3) #57676F` → @`#D8E3E9` 4.50 / @`#FDFEFF` 5.82 / @`#F1F5F7` 5.36，**刚好压线通过**；深色档仍写 `--n-ink-3`，漏改 |
| `web/app.css:1538` 组 | `.chips button.on` `#fff` @ `linear-gradient(160deg,#3b82f6,#2563eb)` | **3.68** | 4.5 | 去掉蓝渐变，改 `var(--red)`/`var(--oncolor)`（5.50） | 渐变起点 `#3b82f6` 白字 3.68、终点 `#2563eb` 5.17。**并且 `#3b82f6` / `#2563eb` / `#4f46e5` 是 NOVA 调色板之外的蓝，违反 §2.1「主色只一个青绿」** |

### 4.2 PASS 但余量极薄（需注意）

| 文件:行号 | 项 | 实测 | 说明 |
|---|---|---|---|
| `web/nova-skin.css:95` | `#top .brand-sub` `rgba(233,240,242,.40)` @ 石墨 `#141C21` | 5.35 / 5.62 / 4.88 | 最不利端 4.88，余量 0.38；换个底就翻 |
| `web/nova-skin.css:129` | `#top .wk-sub` 同色 | 4.88 | 同上 |
| `web/app.css:177` | `.pill` 经典版 `--fg2` @ `--surface` | 6.15 | 合规 |
| `web/nova-organs.css:583` | `.room-f` `--o-accent-ink` @ `--o-ceramic` | 7.77 | 已修，合规（深色档 `:600` 同值） |
| `web/nova-skin.css:260` | `.hint` 若按建议把 `--n-ink-3` 改 `#566370` | 5.16～6.15 | 一条令牌改动同时修好 9 处（含深色档 `:445-446`） |
| `web/nova-pixel.css:151` | 日期行 `opacity:.72` 合成后（`--px-4` on `--px-1`） | 5.00 / 4.84 | 文件自带注释实测值，复核一致；深色档余量只剩 0.34 |
| `web/nova-pixel.css:68/71` | `--px-4 #9DB3BF` @ `--px-1 #0A1217` | 8.67 | 文件自带注释，复核一致 |

### 4.3 不计入统计的"假设组合"（诚实性声明）

| 曾测项 | 结论 |
|---|---|
| `--edge #A89070` 作文字 | **不存在**。`grep` 9 处 `var(--edge)` 全部是 `border-color`，无一处 `color:`。剔除 |
| `#fff` 压 `--accent-soft` | **不存在**。`accent-soft` 附近 80 字符内无 `color:#fff` 命中。剔除 |
| `.nv-dial-read` 按"磁带壳 `#DCCDB4`"算 | **底子选错了**。`nova-organs.js` 把拨盘 `insertBefore(wrap, tabs)` 挂在 `#tabs` 上方，真实底是 `#tabs` 的石墨渐变。已按 `#1D2830/#0C1317` 重算（3.58/3.91），且该处已在 `nova-organs.css:262` 改 `--o-ink-3`（实测 5.82），本条**不再计入 FAIL** |

---

## 5. 圆角失控

### 5.1 全量（265 处 / 42 个值）

- **走令牌 91 处（34.3%）**：`var(--n-r-sm)×30`、`var(--n-r-md)×28`、`var(--n-r-xs)×20`、`var(--radius)×7`、`var(--radius-sm)×4`、`var(--n-r-md) var(--n-r-md) 0 0×2`
- **字面量 174 处（65.7%）**
- **四角显式不等（含 `/` 椭圆写法）29 处，全部在 `web/app.css` 的西部涂鸦覆盖层**

字面量 Top：`50%×20`、`6px 2px 7px 3px / 3px 7px 2px 6px×17`、`0×12`、`6px×12`、`999px×10`、`13px×10`、`8px×9`、`2px×8`、`5px×8`、`7px×5`、`14px×5`、`8px 3px 9px 4px / 4px 9px 3px 8px×5`、`11px×4`、`10px×4`、`4px×4`、`9px×3`、`20px×3`、`3px×3`、`9px 3px 10px 4px / 4px 10px 3px 9px×3`、`99px×2`、`22px×2`、`1px×2`，其余单例（`22px 22px 0 0`、`0 10px 10px 0`、`19px`、`15px`、`18px`、`0 9px 9px 0`、`10px 3px 11px 4px / 4px 11px 3px 10px`、`5px 2px 6px 3px / 3px 6px 2px 5px`、`14px 5px 0 0 / 11px 4px 0 0`、`10px 4px 11px 5px / 5px 11px 4px 10px`、`7px 2px 8px 3px / 3px 8px 2px 7px`、`inherit`）

### 5.2 A. 宪法与令牌档位冲突

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/nova-skin.css:949-953` | `--n-r-xs:4px` / `--n-r-sm:8px` / `--n-r-md:12px`（三档） | **删掉 `--n-r-xs`**，只留 8/12 | §4 原文「圆角只有两档 `--n-r-sm 8px`（控件）/ `--n-r-md 12px`（容器），其余归零」。多出的 4px 是第三档，已用在 `:991`（`#top .pill`）与 `nova-medium.css` 的 `.nv-polaroid-tag` 等 19 处 |
| `web/nova-skin.css:946` | 注释「圆角收敛成三档令牌，不再 3/6/10/12/14 混用」 | 改写注释 | **注释与事实相反**：收敛层只覆盖 8 类选择器，`app.css` 仍有 42 个值、174 处字面量、29 处四角不等。留着这句会让下一个接手的人以为已经干净 |
| `web/nova-skin.css:982-999` | 收敛层（`.btn/.pill/.card/#grid/.pop-*` → 令牌） | 扩表 | 只收了 8 类。建议把 `#setQuick button`（`:588` 附近 7px）、`.gate-badge`（16px）、`.rm-sel`（`9px 11px 8px 12px`）等一并收进来 |

### 5.3 B. 四角显式不等（29 处，全在 app.css 西部覆盖层）

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:1376` | `10px 3px 11px 4px / 4px 11px 3px 10px` | `var(--radius)` = 4px | 8 个值（四角 × 两轴）互不相同，等效于四角各一个随机圆角。手绘感应来自**边框与阴影**，不是把圆角打乱 |
| `web/app.css:1384` `:1390` `:1450` `:1470` `:1549` `:1581` `:1592` `:1608` `:1638` `:1653` `:1658` `:1666` `:1682` `:1696` `:1712` `:1729` `:1791`（17 处） | `6px 2px 7px 3px / 3px 7px 2px 6px` | `var(--radius)` | 同一串值抄 17 遍，说明是复制粘贴而非设计 |
| `web/app.css:1395` `:1399` `:1558` `:1572` `:1646`（5 处） | `8px 3px 9px 4px / 4px 9px 3px 8px` | `var(--radius)` | 同上，更大一号 |
| `web/app.css:1456` `:1541` `:1673`（3 处） | `9px 3px 10px 4px / 4px 10px 3px 9px` | `var(--radius)` | 同上，再大一号 |
| `web/app.css:1498` | `5px 2px 6px 3px / 3px 6px 2px 5px` | `var(--radius)` | |
| `web/app.css:1533` | `10px 4px 11px 5px / 5px 11px 4px 10px` | `var(--radius)` | |
| `web/app.css:1618` | `7px 2px 8px 3px / 3px 8px 2px 7px` | `var(--radius)` | |

> 这 29 处一旦叠加 `html[data-skin="nova"]`，因为 `!important` 层在皮肤层，实际不生效；但**切回经典/西部皮肤时立刻全部暴露**，且它们是 `border-radius` 计数虚高的主因（29/265）。

### 5.4 C. 令牌之外的散兵

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/nova-skin.css:372` | `.skin-opt{border-radius:10px}` | `var(--n-r-sm)` | **10px 是宪法里没有的第四档**；且这是 4 条**无 `html[data-skin="nova"]` 前缀的裸规则**之一（`:372`/`:374` 及其余两条），写在 nova 文件里却只在**非 nova 皮肤**生效 → 作用域泄漏 |
| `web/nova-skin.css:611` 附近 | `.gate-badge{border-radius:16px}` | `var(--n-r-sm)` | 16px 无对应档位 |
| `web/nova-skin.css:588` 附近 | `#setQuick button{border-radius:7px}` | `var(--n-r-sm)` | 7px 在 8 与 4 之间 |
| `web/nova-skin.css:498` 附近 | `.rm-sel` 类 `9px 11px 8px 12px` | `var(--n-r-md)` | 器官层 `nova-organs.css:9xx` 与 skin 层重复出现同款四角不等 |
| `web/app.css:497` | `.chips button{border-radius:999px}` | `var(--n-r-sm)` | 胶囊与 NOVA 的"方瓷"语言相冲；且 `999px` vs `99px`（`:336`/`:346`）两个"无穷大"并存 |
| `web/app.css:336` `:346` | `border-radius:99px` ×2 | 统一 `999px` 或删 | 同一意图两个伪值 |
| `web/app.css:281` | `border-radius:22px 22px 0 0` | `var(--n-r-md) var(--n-r-md) 0 0` | 与 `nova-skin.css:332` 的 `var(--n-r-md) var(--n-r-md) 0 0` 同语义不同值 |
| `web/app.css:572` `:630` `:1080` | `0 10px 10px 0` / `0 7px 7px 0` / `0 9px 9px 0` | `0 var(--n-r-sm) var(--n-r-sm) 0` | 三个不同数值表达同一"右侧圆角" |
| `web/nova-pixel.css:69` `:96` `:128` `:165` `:198` `:209` | `border-radius:0` | 保持 | **唯一严格归零的一层，作为正面样例记录** |
| `web/nova-medium.css` | 全部 `border-radius:var(...)` | 保持 | 零字面量，正面样例 |

---

## 6. 间距不在 4px 网格

### 6.1 全量（`padding/margin/gap` 中 px 数值 695 个）

- **非 4px 网格且 >2px：371 个 = 53.4%**
- 按文件：**`app.css` 257** / **`nova-organs.css` 84** / `nova-skin.css` 18 / `pop.css` 12
- `nova-medium.css` **0** / `nova-pixel.css` **0** → 正面样例
- 非网格值分布：`10px×95`、`6px×54`、`14px×45`、`9px×35`、`11px×28`、`7px×26`、`3px×21`、`13px×19`、`5px×14`、`18px×14`、`22px×12`、`15px×5`、`17px×1`、`26px×1`、`34px×1`

### 6.2 最严重：§4「区块间距 ≥32px」零实现

| 项 | 实测 | 结论 |
|---|---|---|
| `margin` ≥ 32px 的规则条数 | **0** | §4 要求「区块间距 ≥32px」，**全站没有任何一条规则实现** |
| 全站最大 margin 值 | **28px** | `app.css` 单点；其余 ≤24px |
| `padding` ≥ 32px | 3 处，且都不是区块间距 | `app.css:178` `padding:12px 12px 96px`（底部安全区）、`:1185` `padding-right:34px`（图标避让）、`:1408` `padding:14px 12px 96px`（同上） |

> 卡片与卡片、区块与区块之间全靠 **8~14px** 贴着，这是"拥挤"的结构性根因，比单个 10px 严重得多。**建议新增 `--n-space-block:32px`，所有 `.card` 之间的兄弟间距、`.tab` 内分组间距都用它。**

### 6.3 逐条缺陷（抽样 20 条，全部带选择器）

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/app.css:324` | `.elec-entry-box{padding:14px 14px 13px}` | `16px 16px` | 14/13 都不在网格；且**同一元素在 `:1676` 又写了一套 `padding:15px 14px 14px`** |
| `web/app.css:1676` | `.elec-entry-box{padding:15px 14px 14px}` | `16px` | 与 `:324` 冲突，切皮肤时盒子会"缩一下" |
| `web/app.css:1210` | `padding:10px 11px 9px` | `12px` | 三个值三种偏移 |
| `web/app.css:153` | `.pill.back{padding:7px 14px;margin-bottom:12px}` | `8px 16px` / `16px` | |
| `web/app.css:184` | `padding:8px 6px 10px` | `8px` | 6px 与 10px 不对称 |
| `web/app.css:219` | `.hint{font-size:11.5px;margin:12px 4px}` | `16px 0` | 4px 侧边距让说明文字贴边 |
| `web/app.css:340` | `.elec-face{padding:22px 0 10px}` | `24px 0 12px` | |
| `web/app.css:361` | `.pick-row{gap:8px;padding:13px 14px}` | `16px` | |
| `web/app.css:466` | `.rm-sel{font-size:14px;padding:6px 10px}` | `8px 12px` | |
| `web/app.css:478` | `padding:11px 14px` | `12px 16px` | |
| `web/app.css:497` | `.chips button{padding:6px 14px}` | `8px 16px` | |
| `web/app.css:571` | `.fb-reply{margin-top:9px;padding:9px 11px}` | `8px` / `12px` | |
| `web/app.css:579` | `.fr-label{margin:14px 0 6px}` | `16px 0 8px` | |
| `web/app.css:613` | `.chips.set-quick{margin:11px 0 0;gap:6px}` | `12px 0 0` / `8px` | |
| `web/app.css:614` | `.set-quick button{font-size:11.5px;padding:6px 11px}` | `12px` | |
| `web/app.css:658` | `.gate-label{margin:14px 0 6px}` | `16px 0 8px` | 与 `:579` 同类不同值 |
| `web/app.css:1337` / `:1797` | `.th-inline .th-opt{padding:11px 14px}` vs `11px 13px` | `12px 16px` | **同一选择器两套 padding** |
| `web/app.css:118`-`122` | `header{padding:calc(…+10px) 14px 10px}` | `12px` / `16px` | 14px 非网格，且是全站最顶部 |
| `web/app.css:134` | `.brand-mark{32px}` + `:132` `.brand{gap:9px}` | `8px` | 9px 单点野值 |
| `web/app.css:123` | `.top-row{gap:10px}` | `12px` | |
| `web/nova-skin.css:242` | `.card{padding:15px 14px 16px !important}` | `16px` | **`.card` 是全站最高频容器**，三个值全非 4 倍数；`nova-medium.css` 只改了背景/圆角，**从未改 padding** → 一直生效 |
| `web/nova-skin.css:249` | `.card-title{padding-bottom:9px;margin-bottom:9px}` | `8px` / `12px` | |
| `web/nova-skin.css:253` | `.card-title::before{margin-right:7px}` | `8px` | |
| `web/nova-skin.css:142` | `padding:12px 8px 10px !important`（#grid） | `12px 8px` | |
| `web/nova-skin.css:178` | `.c{padding:4px 3px 3px 5px !important}` | `4px` | 四边四个值，3px 与 5px 都非网格 |
| `web/nova-skin.css:295` | `.elec-entry-box{padding:13px 12px 12px !important}` | `16px 12px` | **同一元素第三套 padding**（app 层 `:324`、`:1676` 已各一套） |
| `web/nova-skin.css:371` | `.skin-wrap{gap:8px;margin:10px 0 2px}` | `12px 0 4px` | |
| `web/nova-skin.css:572` | `.fr-label,.gate-label{margin:18px 0 8px !important}` | `16px 0 8px` | 18px 非网格 |
| `web/nova-skin.css:669` | `#setQuick{gap:8px;margin:11px 0 0}` | `12px 0 0` | |
| `web/nova-skin.css:718` | `.gate-err{padding:10px 12px !important}` | `12px` | |
| `web/nova-skin.css:1043`-`1045` | `.chips button{padding:0 12px}` / `.on{padding:0 14px}` | `0 12px` / `0 16px` | 选中/未选中左右内距不同，文字会"跳" |
| `web/nova-skin.css:1038` | `.chips button.on::before{width:4px;height:1.5px}` | `height:2px` | **1.5px 非整像素**，在 1x 屏上渲染成 1 或 2，颜色不匀（括号装饰看起来一粗一细） |
| `web/nova-organs.css:74` | `.nv-belt{margin:10px 0 4px;padding:9px 10px 8px}` | `12px 0 8px` / `8px 12px` | |
| `web/nova-organs.css:327` | `.nv-ticket-shell{padding:10px 11px 16px}` | `12px 12px 16px` | |
| `web/nova-organs.css:195` | `.nv-tape-card{padding:18px 16px 14px}` | `16px` | 18/14 非网格 |
| `web/nova-organs.css:580` 段 | `.chips button{gap/padding}` 与 skin 层重复定义 | 收敛到一处 | |
| `web/pop.css:60` | `padding:14px 15px 12px` | `16px 16px 12px` | 15px 非网格 |
| `web/pop.css:87` | `.pop-toast{padding:9px 15px}` | `8px 16px` | |
| `web/pop.css:100` | `.pop-tip{padding:7px 10px}` | `8px 12px` | |

---

## 7. 硬编码 hex 导致深浅档不同步

### 7.1 全量（组件内 hex，剔除令牌定义块）

| 文件 | 组件内硬编 | 令牌定义 | 判定 |
|---|---|---|---|
| `web/nova-skin.css` | **88** | 55 | 已从旧快照的 111 收敛，但仍是最大头 |
| `web/app.css` | 46 | 104 | 经典纸壳色板本身是 hex 定义的，可豁免大部分 |
| `web/nova-organs.css` | **29** | 28 | 已从 102 大幅收敛 |
| `web/nova-medium.css` | 15 | 3 | |
| `web/nova-pixel.css` | 13 | 10 | 私有 `--px-*` 层，可接受 |
| `web/nova-motion.css` | 0 | 0 | 纯动效 |
| `web/pop.css` | 0 | 0 | 干净 |
| **合计（组件内）** | **191** | — | |

### 7.2 根因：根令牌与派生令牌两层，但第三档只改了一半

`web/nova-skin.css:23-28` 的注释说明了正确做法（原文）：

> 「根令牌 `--n-cyan/--n-coral/...` 与官网 `site-style.css` 逐字同源，`check_web.js` 的 `NOVA_PAIRS` 锁死，所以改成两层：根令牌只当色彩来源，界面一律读派生令牌。」

这个架构是对的（`:29-54` 新增 `--n-accent / --n-accent-hi / --n-accent-lo / --n-accent-ink / --n-accent-weak / --n-accent-line`、`--n-surface / -2 / -3`、`--n-line-weak / --n-line / --n-line-strong`、`--n-graphite / -2 / -3`）。**但 `--n-ink-3` 没有被纳入这套体系**，仍是根令牌的旧值。

### 7.3 逐条缺陷

| 文件:行号 | 现值 | 建议值 | 理由 |
|---|---|---|---|
| `web/nova-skin.css:11` | `--n-ink-3:#7B8B99`（浅色档根令牌） | **`#566370`** | 直接改根令牌即可，全站 9 处引用随之达标。见 §4 |
| `web/nova-skin.css:387` | `--n-ink-3:#8B7FB5`（深色档根令牌） | **`#A79BD1`** | 同上，深色档 11 处引用 |
| `web/nova-organs.css:41` 附近 | `--o-ink-3:#57676F` | 保持 | **器官层的值本来就是对的（5.82/5.31），skin 层应该抄它**——同一个"三级文字"概念在两个文件里是两个色值，这是最深层的不同步 |
| 对称性问题 | skin 层 `--n-ink-3` 浅 2.71~3.50 / 深 3.57~5.09；organs 层 `--o-ink-3` 浅 5.82 | 两档统一到 organs 的值 | |
| `web/nova-skin.css:63` | `background-image:linear-gradient(180deg,#F5F7F8,#EDF1F2,#E7ECEE)` 硬编 | 收成 `--n-page-1/2/3` | 页面底是全站对比度的基准，硬编导致"换底色必须全文搜索" |
| `web/nova-pixel.css:56` | `--px-page:#E8EEF0` | 改为实际页面底或删 | **已过时**：页面底现在是三点渐变，`#E8EEF0` 不再被渲染；像素层的对比度注释（"8.67:1 / 5.99:1"）是按旧底算的 |
| `web/nova-skin.css:100` `:101` | `#F3E6C6` / `#2E2210` | 用 `--n-coin` 派生 | 金色系硬编，深浅档不同步源头 |
| `web/nova-skin.css:139` | `#122A38` | `var(--n-glass)` | 与 `:50` 令牌同值却重写一遍 |
| `web/nova-organs.css:95` | `#22373F` | `var(--o-ship-win)` | |
| `web/nova-organs.css:463` | `#26314C` | `var(--n-m-card)` 深色档 | 深色铭牌底，是 `--n-ink-3` 3.57 翻车的那个底；两处都该进令牌 |
| `web/app.css:135` | `background:linear-gradient(140deg,#3b82f6,#2563eb 55%,#4f46e5)` | 换 `--blue`/`--accent` 系 | **调色板外蓝**，违反 §2.1；是全项目复用最多的"非法蓝" |
| `web/app.css:203` `:205` `:209` `:213` | `#e8f0fe` / `#16233a` / `#2563eb` / `#4a5666` | 进令牌 | 课表格子的一整套蓝灰，与 NOVA 无对应关系 |
| `web/app.css:1538-1545` 组 | 四枚 badge 的色由 `--blue/--green/--purple/--yellow` 给，文字统一 `--oncolor` | 逐枚给字色 | 见 §4 第一条（`.ntc-badge` 2.11） |
| `web/nova-organs.css:114`-`200` 段 | `#7A5423` 抄 6 遍（纸壳说明字） | `var(--o-ink-3)` 或新建 `--o-paper-ink` | 同值抄 6 遍，改色要改 6 处 |
| `web/nova-organs.css:210`-`275` 段 | `#241C10` / `#5A3B16` / `#FFF4DC` / `#F7DFB2`（票券区 7 处） | 收成 `--o-ticket-*` 三档 | |
| `web/nova-organs.css:400`-`414` 段 | `#2A2130` / `#6B5A8A` / `#B0345C` / `#8B7FB5`（成绩卷宗 7 处） | 收成 `--o-grade-*` | `#8B7FB5` 就是那个深色档 `--n-ink-3`，抄进来等于把缺陷复制一份 |

### 7.4 其他一致性缺口（顺带记录）

| 项 | 实测 | 说明 |
|---|---|---|
| `tabular-nums` 覆盖 | `font-variant-numeric` 仅 22 处 | §4 要求「全站 tabular-nums」。当前 `app.css` 18 处 + `nova-skin.css:978`（22 选择器群组）+ `nova-organs.css:97/141/675`。**`.focus-time`、`.wk-main`、`#grid` 内数字、`.nv-pixel-*` 仍未覆盖** → 数字变化时会抖 |
| 作用域泄漏 | `nova-skin.css:372/374` 等 4 条裸规则 | 无 `html[data-skin="nova"]` 前缀，写在 nova 文件里却只在**非 nova 皮肤**生效；且带 `border-radius:10px`（非法第四档）+ `font-weight:800`（非法字重）+ `--accent`@`--accent-soft`（4.49 不达标）三重缺陷 |
| 孤儿文件 | `web/nova-campuscard.css`（175 行） | **未被 `index.html` 引用，`web/*.js` 里零命中**。它自带 `font-size:3.6px`（`:99`）与 `font-size:4.2px`（`:150`）、`line-height:1.12`（`:109`）——**一旦接线，将成为全站最小字号并立刻违反 §1/§3**。建议接线前先按本文档 11px 下限整改 |
| 加载序 | 宪法 §6 写 4 层 | 实际 7 层（多了 `nova-medium`、`nova-pixel`、`pop.css`，`nova-motion` 也算一层）。宪法该更新，否则新人按 §6 判断"谁能覆盖谁"会出错 |
| 媒介层不管排版 | `nova-medium.css`：0 字号 / 0 字重 / 0 行高 / 0 间距 | 只收敛圆角与背景。**这意味着 §1/§2/§3/§6 的缺陷不会被任何后续层救回来**，必须回到源头改 |

---

## 附录 A：对比度实算全表（32 项，13 FAIL）

> 1–31 来自 `_contrast4.js` 主表（令牌色值已用 `_final.js` 按 **16:18 当前树**重算复核，页面底改为 `#F8FAFB/#F3F6F7/#EFF2F4` 三点、`--n-m-*` 改为 `#FDFEFF/#F1F5F7/#D8E3E9`，第 1 项的区间随之下修至 2.68）；第 32 项来自 `#grid` 专项复算（`_grid3.js` / `_grid4.js`），因为课表格是当前最大面积的小字区域，必须单列。

| # | 需求 | 实测 | 判定 | 样本 | 前景 / 最不利底 | 字号/字重 |
|---|---|---|---|---|---|---|
| 1 | 4.5 | **2.68 ~ 3.50** | **FAIL** | `--n-ink-3 #7B8B99` 三级文字 | `#7B8B99` @ `--n-m-glass #D8E3E9`（最差 2.68）/ 页面底 `#EFF2F4` 3.12 / `--n-shell #E8EEF0` 2.99 / `--n-m-card #FDFEFF` 3.47 / `#FFFFFF` 3.50（**9 个底全不过**） | 9~13px / 400~700 |
| 2 | 4.5 | **2.58** | **FAIL** | `--mute #9C8B70` 经典纸壳三级字 | `#9C8B70` @ `--paper #EFE2C8`（2.58~2.99） | 9.5~11.5 / 400 |
| 3 | 4.5 | **4.29** | **FAIL** | `.btn` 白字 @ `--n-accent` | `#FFFFFF` @ `#12897C`（`nova-skin.css:265-266`） | 14 / 600 |
| 4 | 4.5 | 7.35 | PASS | `.btn` 白字 @ `--n-accent-lo` | `#FFFFFF` @ `#0A6156` | 14 / 600 |
| 5 | 4.5 | **3.83** | **FAIL** | `.btn` 深字替代 | `#04241F` @ `#12897C` | 14 / 600 |
| 6 | 4.5 | **3.94** | **FAIL** | `#tabs` 未选中 | `rgba(233,240,242,.46)` @ `#1D2830`（另一端 4.23） | 9 / 400 |
| 7 | 4.5 | **4.29** | **FAIL** | `.btn-sm` / `.pop-confirm-yes` 同款白字 @ `--n-accent` | `#FFFFFF` @ `#12897C`（`nova-skin.css:655-656`、`:863-864`） | 12.5 / 600 |
| 8 | 4.5 | **3.57** | **FAIL** | dark `--n-ink-3` | `#8B7FB5` @ 铭牌 `#26314C`（4.49/5.09/4.89/3.94/3.57） | 9 / 700 |
| 9 | 4.5 | 5.82 | PASS | `--o-ink-3` @ `--o-ceramic` | `#57676F` @ `#FDFEFF` | — |
| 10 | 4.5 | 5.31 | PASS | `--o-ink-3` @ `--o-ceramic-2` | `#57676F` @ `#F0F4F6` | — |
| 11 | 4.5 | **2.11** | **FAIL** | `.ntc-badge` | `--oncolor #FDF6E6` @ `--yellow #D9A32B`（`app.css:1543`） | — |
| 12 | 4.5 | **4.49** | **FAIL** | `--red` 文字 @ `--accent-soft` | `#B23B26` @ `#F3DCCB`（差 0.01，14 处） | 9~12.5 / 600 |
| 13 | 4.5 | **3.93** | **FAIL** | `--kb-fg2` @ `--kb-bg` | `#8A6A22` @ `#F4E2B4` | 11.5 / 400 |
| 14 | 4.5 | **3.28** | **FAIL** | `--mist` @ `--surface` | `#8E7BC4` @ `#FAF3E2`（`app.css:1840`） | 12 / 700 |
| 15 | 4.5 | **3.58** | **FAIL** | `.nv-dial-read u` | `rgba(169,198,210,.55)` @ `#1D2830` | 8 / 400 |
| 16 | 4.5 | 17.75 | PASS | `--n-ink` @ `#FFFFFF` | `#101828` @ `#FFFFFF` | 15 / 400 |
| 17 | 4.5 | 7.09 | PASS | `--n-ink-2` @ `#FFFFFF` | `#4A5A6A` @ `#FFFFFF` | 13 / 400 |
| 18 | 4.5 | 7.34 | PASS | `--n-accent-ink` @ `#FFFFFF` | `#0B6157` @ `#FFFFFF` | — |
| 19 | 4.5 | 10.83 | PASS | `#tabs` 选中 | `#F2F6F7` @ 石墨+8%白 | 9 / 700 |
| 20 | 4.5 | 10.45 | PASS | 品牌名 | `--n-cyan #35E0D0` @ `#141C21` | 13 / 700 |
| 21 | 4.5 | 5.14 | PASS | **修复A** 白字 @ `--n-accent → #117B6F` | `#FFFFFF` @ `#117B6F` | 推荐值 |
| 22 | 4.5 | 5.88 | PASS | **修复A'** 白字 @ `#0F7165` | `#FFFFFF` @ `#0F7165` | 更保守 |
| 23 | 4.5 | **4.71** | PASS | **修复B** `--n-ink-3 → #566370` @ 最险底 `--n-m-glass #D8E3E9` | `#566370` @ `#D8E3E9` | 九底最小值 |
| 24 | 4.5 | 4.71 ~ 6.15 | PASS | **修复B** `#566370` 九底跨度 | `#D8E3E9` 4.71 / `--n-shell` 5.25 / 页面底 5.47 / `--n-m-paper` 5.61 / 页面中段 5.66 / `#F8FAFB` 5.87 / `--n-m-card` 6.09 / `#FFFFFF` 6.15 | 全过 |
| 25 | 4.5 | 4.68 | PASS | **修复C** `--mute → #726140` @ `#EFE2C8` | `#726140` @ `#EFE2C8` | 最差底 |
| 26 | 4.5 | 5.91 | PASS | **修复D** `#tabs` 未选中 `.46 → .62` | `rgba(233,240,242,.62)` @ `#1D2830` | — |
| 27 | 4.5 | 5.07 | PASS | **修复E** dark `--n-ink-3 → #A79BD1` @ `#26314C` | `#A79BD1` @ `#26314C` | 最差底 |
| 28 | 4.5 | 5.53 | PASS | **修复F** `.ntc-badge` 改 `--ink` | `#3B3225` @ `#D9A32B` | — |
| 29 | 4.5 | 5.69 | PASS | **修复G** `--kb-fg2 → #6E5214` | `#6E5214` @ `#F4E2B4` | — |
| 30 | 4.5 | 5.15 | PASS | **修复H** `--red` 文字 → `#A82F1E` | `#A82F1E` @ `#F3DCCB` | — |
| 31 | 4.5 | 5.34 | PASS | **修复I** `--mist → #6B57A8` | `#6B57A8` @ `#FAF3E2` | — |
| 32 | 4.5 | **3.79 / 3.81** | **FAIL** | **深色档** `#grid .gp` | `rgba(226,236,238,.44)` @ `#1A1234` / `#0D0920`（`nova-skin.css:154`） | 8 / 400 |
| 33 | 4.5 | 5.63 / 5.87 | PASS | **修复J** 深色 `.gp` `.44 → .58` | `rgba(226,236,238,.58)` @ 同上两底 | — |

### 附录 A-2：`#grid` 专项复算（浅色档已整片翻底，全部通过）

| 项 | 前景 / 底 | 实测 | 判定 | 依据 |
|---|---|---|---|---|
| `.gh` / `.gp` 表头 | `--n-ink-2 #4A5A6A` @ `--n-m-glass #D8E3E9` | **5.43** | PASS | `nova-medium.css:210-211` |
| `.gh` / `.gp` @ 页面中段 | `#4A5A6A` @ `#F3F6F7` | **6.53** | PASS | `nova-medium.css:156` |
| `.gh` / `.gp` @ 格子合成底 | `#4A5A6A` @ `rgba(255,255,255,.56)` over `#D8E3E9` → `#EEF3F5` | **6.34** | PASS | `nova-medium.css:181-186` |
| `.c` 课块主体 | `--n-ink #101828` @ `--n-m-card #FDFEFF` | **17.58** | PASS | `nova-medium.css:191-200` |
| `.c .room/.pr/.pr2` | `--n-ink-2 #4A5A6A` @ `#FDFEFF` | **7.02** | PASS | `nova-medium.css:201-203` |
| `.c.today` | `#101828` @ `rgba(31,167,154,.10)` over `#FDFEFF` → `#E7F5F5` | **15.87** | PASS | `nova-medium.css:187-190`、`:204` |
| 深色 `.c` 主体 | `--n-ink #EFE9FF` @ `#261C44` | **13.34** | PASS | `nova-skin.css` dark |
| 深色 `.c .room` | `--n-on-2 #A9C6D2` @ `#261C44` | **8.78** | PASS | 同上 |
| **深色 `.gp`** | `rgba(226,236,238,.44)` @ `#1A1234` / `#0D0920` | **3.79 / 3.81** | **FAIL** | `nova-skin.css:154`，见 §4.1 |

## 附录 B：候选色阶梯（可照抄）

**`--n-accent`（白字 / 深字 `#04241F`）**

| 值 | 白字 | 深字 | 判定 |
|---|---|---|---|
| `#12897C`（现） | 4.29 | 3.83 | 两头都不够 |
| **`#117B6F`** | **5.14** | 3.20 | **推荐（白字用）** |
| `#0F7165` | 5.88 | 2.80 | 更保守 |
| `#0E6A5F` | 6.47 | 2.54 | |
| `#0C6359` | 7.13 | 2.31 | |
| `#0B5C52` | 7.87 | 2.09 | |
| `#0A6156`（`--n-accent-lo`） | 7.35 | — | 保持不动 |

**`--n-ink-3` 浅色档（@`#FFFFFF` / `#F1F4F5` / `#E7ECEE` / `#D9E4EA`）**

| 值 | 四底实测 | 判定 |
|---|---|---|
| `#7B8B99`（现） | 3.50 / 3.17 / 2.94 / 2.71 | 全不过 |
| `#6E7E8C` | 4.18 / 3.78 / 3.51 / 3.23 | 全不过 |
| `#687885` | 4.55 / 4.12 / 3.82 / 3.52 | 全不过 |
| `#62717E` | 5.02 / 4.54 / 4.22 / 3.88 | 全不过 |
| `#5E6C79` | 5.39 / 4.88 / 4.52 / 4.17 | 全不过 |
| `#5A6874` | 5.73 / 5.18 / 4.81 / 4.43 | 差 0.07 |
| **`#566370`** | **6.15 / 5.56 / 5.16 / 4.76** | **唯一四底全过，推荐** |

**`--mute`（@`#FAF3E2` / `#EFE2C8` / `#F5EAD4` / `#F4E2B4`）**

| 值 | 四底实测 | 判定 |
|---|---|---|
| `#9C8B70`（现） | 2.99 / 2.58 / 2.78 / 2.58 | 全不过 |
| `#847356` | 4.16 / 3.59 / 3.85 / 3.59 | 全不过 |
| `#7E6D50` | 4.53 / 3.91 / 4.20 / 3.91 | 全不过 |
| `#7A6949` | 4.81 / 4.15 / 4.46 / 4.15 | 全不过 |
| **`#726140`** | **5.42 / 4.68 / 5.03 / 4.68** | **全过，推荐** |
| `#6E5D3C` | 5.76 / 4.97 / 5.34 / 4.97 | 更保守 |

**深色档 `--n-ink-3`（@`#241A3E` / `#161028` / `#1A1430` / `#2E2350` / `#26314C`）**

| 值 | 五底实测 | 判定 |
|---|---|---|
| `#8B7FB5`（现） | 4.49 / 5.09 / 4.89 / 3.94 / 3.57 | 两个不过 |
| `#9A8FC4` | 5.49 / 6.23 / 5.98 / 4.82 / **4.37** | 一个不过（不要用） |
| **`#A79BD1`** | **6.39 / 7.25 / 6.95 / 5.60 / 5.07** | **全过，推荐** |
| `#B3A8DC` | 7.39 / 8.39 / 8.05 / 6.49 / 5.87 | 更保守 |

---

## 附录 C：建议的整改顺序（按「改一行收益最大」排序）

1. **`--n-ink-3` 两个令牌值**（`nova-skin.css:11` / `:387`）→ 一次改 20 处引用。**收益最高、成本最低。**
2. **`--n-accent` 一个令牌值**（`nova-skin.css:30`）→ 一次修好 `.btn`（`:265`）/ `.btn-sm`（`:655`）/ `.pop-confirm-yes`（`:863`）三处白字实心按钮。
3. **`#tabs` 未选中 `.46 → .62`**（`nova-skin.css:339`）→ 底部主导航。
4. **`--mute` / `--mist` / `--kb-fg2` 三个经典纸壳令牌**（`app.css:22`（`--pencil`，`--mute` 在 `:39` 引用它）/ `:31` / `:70`）。
5. **`.ntc-badge` 单独给色**（`app.css:1543`）。
6. **深色档 `#grid .gp` 的 `.44 → .58`**（`nova-skin.css:154`）→ 8px 节次列。
7. **字号归并到五档**（`app.css` 208 处，按 §1 的对照表批量替换）。
8. **字重删四个值**（550/600/650/800 → 500/700）。
9. **`margin:≥32px` 引入区块间距令牌**，替代 8~14px 贴边。
10. **圆角字面量收进令牌**（`app.css` 174 处，先做 29 处四角不等）。
11. **`nova-campuscard.css` 接线前整改**（3.6px / 4.2px 必须上调）。

---

*报告生成于 2026-11-08 15:55，基线为同刻 CSS 快照；行号与数值在 16:17 按当时树复核过一遍（字重 181 处 / 圆角 265 处 / 硬编 hex 192 处）。实算脚本 `_contrast4.js` / `_stats.js` / `_space.js` / `_grid*.js` 已按约定删除；如需复算，附录 B 已给出全部输入色值，可直接重跑。*
