# NOVA 灵感素材笔记（2026-11-08 自主创作轮）

> 这一轮的硬前提来自 YG 原话：「完全抛开原版，大胆融合所有。就像保留目前有的功能基础上重新设计开发一款全新的软件一样」。
> 所以本文件只记**能变成器官/交互**的素材，不记"再贴一层皮"的素材。上一轮 utopia/mashup/console/pocket 全部作废归档。

## 一、搜到的、真正用上的

| 来源 | 提炼要点 | 落在哪个器官 |
|---|---|---|
| [StyleKit · Pixel Art](https://www.stylekit.top/en/styles/pixel-art) | PICO-8 六色 `#1a1c2c / #f4f4f4 / #ff004d / #00e436 / #29adff / #ffec27`；rounded-none、4px 厚边、4px 硬边阴影；**transition-none：像素游戏是状态机不是动画引擎，变化全是瞬时硬切** | 主舷窗课表舱格：选中态做硬切，不做平滑过渡；配色只借"低色深"语义，不整屏照抄 |
| [Vaporwave 设计规范](https://www.uistyleguide.com/)（含 canonical palette / VHS 规范） | 消失点霓虹网格、洋红→紫→橙落日、**VHS 扫描线只 2–3% 透明度**、VT323 CRT 字、色差；明确警告"可读性/受教育场景不该整屏洋红" | 只取「舷窗落日渐变 + 2% 扫描线」；正文一律高对比系统字，绝不洋红压紫 |
| [60fps.design · Atlas Card](https://60fps.design/appsites/atlas-card-header-video-zoom-transitions) | "the metallic card acts as a **focal portal window**, camera continuously zooms **through the card frame**, transitions smoothly between environments"；站点动效词表 Shared Element / Zoom / Morph / Stagger / Ticker / Picker | **磁带门放大转场**的直接来源：框不是按钮，是"穿过去的门" |
| 60fps.design · Ryuki Place | "Cassette Play Tracks Interaction" —— 磁带作为曲目/条目容器 | 磁带 A 面=作业、B 面=考试，条目即"曲目" |
| [Red Dot · Fluitape](https://www.red-dot.org/project/fluitape-tape-drives-65883) | 沙漏形磁带机，**翻转机身即倒带**，卷轴转动可见，用"时间流动"做交互语义 | 磁带门翻转 = 作业↔考试；卷轴转速绑"最近截止时间" |
| [Elbow clip-on cassette](https://laughingsquid.com/clip-on-cassette-tape-player/) | 单滑轮、**机械运动外露**，"the cassette plays itself" | 周次传送带把滚轮/皮带露在外面，切周是真的在"传送" |
| [Steampunk UI Kit](https://bobkingg.itch.io/steampunk-ui-kit) | 黄铜/紫铜铆钉、齿轮、维多利亚仪表 | 传送带的滚轮与刻度尺，仅此一处 |
| Cyberpunk HUD 几何框（[Pinterest 合集](https://www.pinterest.com/pin/221309769185287882/)） | 四角切角框、分段状态条、单色发光读数 | 舷窗四角切角 + 顶部状态读数条 |
| [Ghibli 美学 / Laputa](https://elements.envato.com/learn/studio-ghibli-aesthetic) | 水粉打底+水彩晕染、掺灰的高饱和自然色、笔触与暖光分层、**一切圆润化**、"科技被苔藓藤蔓包住" | 做**介质层**而非第九张贴纸：把九个器官粘成一台"长在自然里的机器" |
| [Ghibli-Inspired Narrative Map](https://designmd.app/library/ghibli-inspired-narrative-map/) | watercolor background / whimsical / nature inspired 用于叙事地图 | 浅色档底色晕染 |
| 拼贴/剪报（[Pinterest simple collage](https://nl.pinterest.com/ideas/simple-collage/958312658229/)） | torn paper、magazine cutout、washi tape、贴歪标签 | **只**给校园 WIKI 一个区用，不铺满全屏 |
| [Proto.io 交互合集](https://blog.proto.io/mobile-interaction-designs-april-2022/) | "intuitive filtering / sphere into kaleidoscopic view / orbit-like rings / shared element" | 频道拨盘的"指示珠滑动"与模块入场 stagger |

## 二、明确不抄

- **不抄**整屏 PICO-8 / 整屏 vaporwave / 整屏 CRT：单一风格堆砌正是 YG 否掉的东西。
- **不抄**任何"纸卡片纵向流 + 底部 5 Tab + 针脚虚线 + 暖棕描边"：那是 v1.1.48/1.1.54 的骨架。
- **不抄**旧色板 `#EFE2C8 / #3B3225 / #A89070 / #8E7BC4` 原样复用；NOVA 用独立冷瓷白 + 霓虹珊瑚 + 青绿荧光。
- **不臆造功能**：上一版 utopia 把「宿舍空调 12.40 度 / kWh / CRC OK」当主视觉仪表，属硬伤。真实清单只有课表 / 作业与考试 / 饮水机接热水 / 校园 WIKI / 校园图片与留言板（图片需审核）。没有洗衣机、报修、停车场、宿舍空调。

## 三、这一轮自己定的融合原理

> **风格不是贴纸，是器官。**
> 一台机器有且只有一套骨架；每个风格领一个"能操作的器官"，面积、亮度、动效周期都压在同一量级，谁也不扩音。风格之间靠**共用的介质**（水彩晕染底色 / 舱体圆角 / 冷瓷白外壳 / 同一套读数字）融合，而不是靠并排陈列。

器官配额见 `NOVA-DESIGN.md`。
