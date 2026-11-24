# -*- coding: utf-8 -*-
"""出包后自检：从 APK 里读回关键文件，确认打进去的是新代码（不是旧 assets）。

用法：python -X utf8 tools/check_apk_inside.py [apk 路径]
不传路径 = apk/ 目录下版本号最大的那个包。路径相对仓库根解析，
所以在哪个目录下跑都一样。
"""
import glob
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def newest_apk():
    cands = glob.glob(os.path.join(ROOT, "apk", "*.apk"))

    def key(p):
        base = os.path.basename(p)
        m = re.search(r"v(\d+)\.(\d+)\.(\d+)", base)
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)

    return max(cands, key=key) if cands else ""


if len(sys.argv) > 1:
    APK = sys.argv[1]
    if not os.path.isabs(APK):
        APK = os.path.join(ROOT, APK)
else:
    APK = newest_apk()

print("APK =", os.path.relpath(APK, ROOT) if APK else "(none)")
z = zipfile.ZipFile(APK)
names = z.namelist()


def read(n):
    return z.read(n).decode("utf-8", "replace")


about = read("assets/about.js")
m = re.search(r"APP_VERSION\s*=\s*'([^']+)'", about)
print("about.js APP_VERSION =", m.group(1) if m else "(not found)")

lp = read("assets/learnplus.js")
print("assets/learnplus.js bytes =", len(lp.encode("utf-8")))
print("  guard typeof module === undefined :", "typeof module === " in lp)
print("  has todaySummary                  :", "function todaySummary" in lp)
print("  has gpaNeed                       :", "function gpaNeed" in lp)

idx = read("assets/index.html")
ver = m.group(1) if m else ""
print("index.html has #todayLine   :", 'id="todayLine"' in idx)
print("index.html has #copyUndone  :", 'id="copyUndone"' in idx)
print('index.html loads learnplus  :', 'src="learnplus.js"' in idx)
print("index.html #aboutVer == %s :" % ver, ('id="aboutVer">v' + ver) in idx)

css = read("assets/app.css")
print("app.css .gt-form label nowrap:", "white-space:nowrap" in css.replace(" ", ""))
print("app.css .today-line          :", ".today-line" in css)

ns = read("assets/nova-skin.css")
print("nova-skin.css .gpa-target    :", ".gpa-target" in ns)

g = read("assets/grades.js")
print("grades.js present            :", "computeGpa" in g)

# ---- v2.1.0：出水看护 ----
# 这一段是 v2.0.0 那次教训的直接产物：上一版打进包里的 learnplus.js 还是
# 16113 字节的旧版，只看 web/ 目录永远发现不了，装上去才会发现功能没生效。
# 所以每加一个 web 模块，都在这里补一组「包里的那份是不是新的」。
ww = read("assets/waterwatch.js")
print("assets/waterwatch.js bytes   :", len(ww.encode("utf-8")))
print("  has WATERWATCH               :", "const WATERWATCH" in ww)
print("  has pollOnce                 :", "function pollOnce" in ww)
print("  guard no module.exports bug  :",
      "if (typeof module === 'undefined' && typeof window !== 'undefined')" in ww)
print("  polls goods/shower/sync      :", "WATER.syncWater" in ww)
print("  never claims stop on error   :", "绝不因此判" in ww or "绝不判" in ww)

print("index.html has #waterLive    :", 'id="waterLive"' in idx)
print('index.html loads waterwatch  :', 'src="waterwatch.js"' in idx)
print("app.css .water-live          :", ".water-live" in css)
print("nova-skin.css .water-live    :", ".water-live" in ns)
print("app.js uses WATERWATCH       :", "WATERWATCH" in read("assets/app.js"))
appjs = read("assets/app.js")
print("app.js runningOf             :", "function runningOf" in appjs)

# ---- v2.3.0：现在一屏 ----
# 同样的问题：web/nowline.js 写好了、index.html 也引了，但包里那份是不是新的
# 只有拆包才知道。上次 learnplus.js 就是「源码新、包内旧」。
nw = read("assets/nowline.js")
print("assets/nowline.js bytes      :", len(nw.encode("utf-8")))
print("  has NOWLINE                  :", "const NOWLINE" in nw)
print("  has nowInfo                  :", "function nowInfo" in nw)
print("  has roomNow                  :", "function roomNow" in nw)
print("  guard no module.exports bug  :",
      re.sub(r"/\*[\s\S]*?\*/", "", nw).find("!module.exports") < 0
      and "typeof module === 'undefined'" in nw)
print("  never claims ended on unknown:", "unknown" in nw and "over" in nw)
print("  uses recursive setTimeout    :", "setTimeout(" in nw and "setInterval" not in nw.split("*/")[-1])
print("index.html has #nowLine      :", 'id="nowLine"' in idx)
print('index.html loads nowline     :', 'src="nowline.js"' in idx)
print("app.css .now-line            :", ".now-line" in css)
print("nova-skin.css .now-line      :", ".now-line" in ns)
print("app.js paints NOWLINE        :", "NOWLINE.paint" in appjs)
print("tut.js mentions nowline      :", "nowline" in read("assets/tut.js"))

# ---- v2.4.0：专注记录可视化 ----
# 同一个老问题：web/focus.js 改好了，包里那份是不是新的只有拆包才知道。
fo = read("assets/focus.js")
print("assets/focus.js bytes        :", len(fo.encode("utf-8")))
print("  has histo                    :", "function histo(" in fo)
print("  has streak                   :", "function streak(" in fo)
print("  has peakOf                   :", "function peakOf(" in fo)
print("  has paintHisto               :", "function paintHisto(" in fo)
print("  HIST_DAYS is 14              :", "HIST_DAYS = 14" in fo)
print("  paints into #focusHisto      :", "'focusHisto'" in fo)
print("  keeps zero-day baseline      :", "fh-zero" in fo)
print("index.html has #focusHisto   :", 'id="focusHisto"' in idx)
print("index.html has #focusHint    :", 'id="focusHint"' in idx)
print("app.css .focus-histo         :", ".focus-histo" in css)
print("nova-skin.css .focus-histo   :", ".focus-histo" in ns)
print("tut.js mentions focuslog     :", "focuslog" in read("assets/tut.js"))

# ---- v2.5.0：备份与导出（档 D）----
# 这一版最容易出的事：export.js 写得很漂亮，但包里那份还是旧的，
# 或者 Java 侧的 exportText 桥根本没编译进 dex。两件事都得拆包看。
ex = read("assets/export.js")
dex_bytes = b"".join(z.read(n) for n in names if n.endswith(".dex"))
print("assets/export.js bytes       :", len(ex.encode("utf-8")))
print("  has SECRET whitelist         :", "const SECRET = [" in ex and "const PICK = [" in ex)
print("  hides tokens                 :", "xxmu_water_token" in ex and "xxmu_ykt_auth" in ex)
print("  reads OK:/ERR: prefix        :", "indexOf('OK:')" in ex and "indexOf('ERR:')" in ex)
print("  local time not UTC           :", "toISOString" not in ex.split("function stamp")[1].split("function stampFile")[0])
print("  no network inside            :", "fetch(" not in ex and "XMLHttpRequest" not in ex)
print("index.html has #rowExport    :", 'id="rowExport"' in idx)
print("index.html loads export.js   :", 'src="export.js"' in idx)
print("app.css .ex-acts             :", ".ex-acts" in css)
print("nova-skin.css .ex-acts       :", ".ex-acts" in ns)
print("tut.js mentions exportdata   :", "exportdata" in read("assets/tut.js"))
print("dex has exportText bridge    :", b"exportText" in dex_bytes)
print("dex has MediaStore write     :", b"MediaStore$Downloads" in dex_bytes or b"MediaStore" in dex_bytes)

# ---- v2.6.0：从教务读成绩（档 C）----
# 这一版最容易出的事：gradepull.js 写好了但没进 assets，或者 grades.js 里那颗
# 按钮的入口没跟着包出去。解析逻辑在离线测试里验过，这里只看「包里的那份」。
gp = read("assets/gradepull.js")
print("assets/gradepull.js bytes    :", len(gp.encode("utf-8")))
print("  has parseGradeTable          :", "function parseGradeTable" in gp)
print("  has mergeInto                :", "function mergeInto" in gp)
print("  finds columns by keyword     :", "colsOf" in gp and "<td|th>" not in gp)
print("  tries three grade paths      :", gp.count(".jsp?menucode=S40303") == 3)
print("  goes through netCk           :", "XXMU.netCk(" in gp)
print("  never posts                  :", "'POST'" not in gp and '"POST"' not in gp)
print("  no fetch/XHR                 :", "fetch(" not in gp and "XMLHttpRequest" not in gp)
print("  keeps letter grades          :", "\u4f18\u79c0" in gp or "优秀" in gp)
print("index.html loads gradepull.js:", 'src="gradepull.js"' in idx)
print("grades.js wires the button   :", "GRADEPULL.openPanel" in read("assets/grades.js"))
print("app.css .gp-row              :", ".gp-row" in css)
print("nova-skin.css .gp-row        :", ".gp-row" in ns)
print("tut.js mentions gradepull    :", "gradepull" in read("assets/tut.js"))

# ---- v2.7.0：界面这一轮（课卡断行、读数条、两个按钮、铭牌时刻）----
# 这一版全是 CSS/文案级别的小改，最容易被「改的是 web/、包里的还是旧那份」骗过。
# 断言只挑「改之前不可能出现」的字符串。
na = read("assets/nova-skin.css")
print("---")
print("nova-skin.css kb-tools accent:", ".kb-bar-acts .btn.soft" in na)
print("nova-skin.css .c padding 3 1 :", "3px 1px 3px 3px !important" in na)
doodle_css = read("assets/nova-organs.css")
_dd = doodle_css.split('html[data-skin="nova"] .nv-doodle{')
print("nova-organs.css .nv-doodle   :",
      "display:none" if len(_dd) > 1 and "display:none" in _dd[1][:120] else "STILL VISIBLE")
no = read("assets/nova-organs.js")
print("nova-organs.js syncText      :", "function syncText(" in no)
print("nova-organs.js parseStamp    :", "function parseStamp(" in no)
print("nova-organs.js plate shortens:", "src === 'syncAt' || src === 'hwSyncAt'" in no)
print("app.js __HWSTAT              :", "window.__HWSTAT" in read("assets/app.js"))
print("app.js whoami keeps --       :",
      "'--'" in read("assets/app.js").split("if (!hasHost())")[1].split("setWhoami")[0][:600]
      if "if (!hasHost())" in read("assets/app.js") else False)

# ---- v2.8.0：可读性这一轮（五个色值令牌 + 字号地板）----
# 这一版改的全是数值，没有新字符串、没有新界面，只有「旧值 vs 新值」的差。
# 所以断言直接钉新值；旧值出现在包里就说明打进包的是改之前那份。
print("---")
_ac = read("assets/app.css")
print("--pencil light #706046       :", "--pencil:#706046;" in _ac)
print("--pencil dark  #B0A085       :", "--pencil:#B0A085;" in _ac)
print("--warn   #83560A             :", "--warn:#83560A;" in _ac)
print("--on-yellow dark             :", "--on-yellow:#2A2018;" in _ac)
print("--oncolor-dim .82            :", "--oncolor-dim:rgba(23,18,14,.82);" in _ac)
print("--hw-* five tokens           :",
      all(t in _ac for t in ["--hw-threat:#FF8A80;", "--hw-info:#7FB3F0;",
                             "--hw-soon:#E8A34E;", "--hw-done:#8FD08A;",
                             "--hw-idle:#A89C8E;"]))
_ap = read("assets/app.js")
print("HW_COLORS 未交 #A8201A      :", "'未交': '#A8201A'" in _ap)
print("HW_COLORS 待做 #9E5009      :", "'待做': '#9E5009'" in _ap)
print("HW_INK                       :", "const HW_INK = {" in _ap)
_pc = read("assets/nova-polish.css")
print("polish .pr/.pr2 10px         :", "font-size:10px !important" in _pc)
print("polish no 9px clock          :", "font-size:9px !important" not in _pc)
_mc = read("assets/nova-medium.css")
_mgs = _mc.split("#grid .gp .gt{")
print("nova light .gp .gt --n-ink   :",
      len(_mgs) > 1 and "var(--n-ink)" in _mgs[1][:160])
_oc = read("assets/nova-organs.css")
# 先剥注释再判：CSS 注释里正写着「8px → 10px」，不剥会自己判自己红（第 4 次踩这个坑）。
_oc_code = re.sub(r"/\*[\s\S]*?\*/", "", _oc)
_small = []
for _sel in (".nv-clip-tag{", ".nv-ticket-note{", ".nv-polaroid-tag{", ".nv-tape-top{"):
    _seg = _oc_code.split(_sel)[1:2]
    if _seg and re.search(r"(?:font|font-size)\s*:[^;}]*\b[89]px", _seg[0][:200]):
        _small.append(_sel)
print("organs small labels >=10px   :", not _small, _small)

# ---- v2.9.0：工具卡走查这一轮（半框里的卡 + 折叠行荧光笔 + 铭牌整行）----
# 这一版改的是「同一个元素在不同的落位下长什么样」，组件名都没变，
# 所以断言必须钉到具体的规则片段上，不能只查选择器存不存在。
print("---")
_ac9 = read("assets/app.css")
# ① 半框里的 sheet-only 卡：透明底（压过 nth-of-type 彩纸）+ isolate（否则荧光笔沉底）。
#    `.card:nth-of-type(4n+4)` 特异性 (0,2,0) 高过 `.sheet-only` (0,1,0)，
#    只写 .sheet-only 会被彩纸底盖回来 —— 这是实拍里那张「淡紫待办卡」的真因。
_so9 = _ac9.split(".sh-box .sheet-only,.sh-box .card.sheet-only{")[1:2]
print("sheet-only in sheet -> clear :",
      bool(_so9) and "background:transparent" in _so9[0][:300])
print("sheet-only in sheet -> isolate:",
      bool(_so9) and "isolation:isolate" in _so9[0][:300])
# ② 半框里的「卡中卡」（provider 卡）不许再贴胶带：第一条会被 .sh-box 上沿裁半截。
print("nested cards lose tape       :",
      ".sh-box .sheet-only .card::before," in _ac9)
# ③ 折叠行 inline-flex：块级盒是整行，::after 的 left:0/right:0 会横穿整卡。
_fold9 = _ac9.split(".hwsec.fold{")[1:2]
print("fold line is inline-flex     :",
      bool(_fold9) and "display:inline-flex" in _fold9[0][:220])
# ④ 深色荧光笔收到 .14：原样 .6 时条色 rgb(158,129,66)，--pencil 只有 1.45。
_dk9 = _ac9.split('html[data-theme="dark"] .hwsec::after,')[1:2]
print("dark marker → .14            :",
      bool(_dk9) and bool(re.search(r"opacity\s*:\s*\.14", _dk9[0][:400])))
_df9 = _ac9.split('html[data-theme="dark"] .hwsec.fold,')[1:2]
print("dark fold ink → --ink2       :",
      bool(_df9) and "color:var(--ink2)" in _df9[0][:200])
# ⑤ 铭牌的「数据来源」走整行：真实读数是长句，两列格里会被裁成「内…」。
print("plate srcTag goes wide       :",
      "row.className = 'nv-plate-row wide'" in read("assets/nova-organs.js"))
print("plate .wide has style        :",
      ".nv-plate-row.wide" in read("assets/nova-organs.css"))

# ---- v2.9.1：其余四个页面摆到窄屏上看这一轮（日期框 + 空提示位）----
# 两条都是看图看出来的，不是想出来的。断言读的是打包进 assets 的那一份。
print("---")
_ac91 = read("assets/app.css")
_ah91 = read("assets/index.html")
_nc91 = read("assets/nova-skin.css")
# ① 学期设置那一行：日期框 min-width 132px、保存按钮整行换下去。
#    实测 390 宽手机上卡片内容宽 336px，日期框 116 + 周数 84 + 按钮 120 吃满，
#    而原生 date 控件画「2026/08/31」加日历图标要约 136px -> 截成「2026/08.」。
print("term row has fr-row-term     :", 'class="fr-row fr-row-term"' in _ah91)
_t91 = _ac91.split(".fr-row-term #setStart{")[1:2]
print("date input min-width 132px   :",
      bool(_t91) and "min-width:132px" in _t91[0][:120])
_s91 = _ac91.split(".fr-row-term #setSave{")[1:2]
print("save button wraps full width :",
      bool(_s91) and "flex:1 0 100%" in _s91[0][:120])
# 反过来：.fr-row 本体不许加 flex-wrap —— 饮水机「验证码 + 发送」得留在同一行。
_f91 = _ac91.split(".fr-row{")[1:2]
print("plain .fr-row stays nowrap   :",
      not (bool(_f91) and "flex-wrap" in _f91[0][:120]))
# ② 空 .gate-err 在 NOVA 下不占位：有底有边有内边距，空着会画成粉色空盒子。
print("empty gate-err hidden (nova) :",
      'html[data-skin="nova"] .gate-err:empty{display:none' in _nc91)

# ---- v2.10.0：桌面小组件改成人话这一轮（纯 Java 侧）----
# 这一版没动 assets，所以这里断的是「dex 里真的有新类、旧硬编码真的没了」。
# 为什么还要在这里查：源码对了但没进包，用户装上去还是老样子 —— v2.0.0 就
# 栽过一次（web/ 是新的、assets 里还是旧 learnplus.js）。
print("---")
_dex_all = b"".join(z.read(n) for n in names if n.endswith(".dex"))
print("dex has WidgetClock          :", b"WidgetClock" in _dex_all)
print("dex has ClassWidget          :", b"ClassWidget" in _dex_all)
# 状态记号与四档副标题是这一版的脸面，字符串常量会原样进 dex。
print("dex has now/done marks       :",
      ("\u25b6").encode("utf-8") in _dex_all or "\u25b6".encode("utf-8") in _dex_all)
print("dex has 'still in class'     :", "正在上".encode("utf-8") in _dex_all)
print("dex has 'class over'         :", "今天的课上完了".encode("utf-8") in _dex_all)
print("dex has 'no term start'      :", "还没设开学日".encode("utf-8") in _dex_all)
# 反向：硬编码的默认开学日不许再进包。
print("dex no hardcoded start date  :", "2026-08-31".encode("utf-8") not in _dex_all)

dex = [n for n in names if n.endswith(".dex")]
print("dex entries                  :", dex)

# ---- v2.11.0：桌面小组件与 App 的「改课表指令」对齐 ----
# 这一版也没动 assets（只改 Java 侧 + notes），所以同样只查 dex。
# 要证明的是：新类 WidgetOps 真进包了，且「只认加课」的老分支真的没了。
print("---")
print("dex has WidgetOps            :", b"WidgetOps" in _dex_all)
print("dex has WidgetOps$Course     :", b"WidgetOps$Course" in _dex_all)
# 四种指令的名字是字符串字面量，会原样进 dex（add/stop/move/holiday 太常见，
# 所以查中文诊断名更可靠 —— typeName() 里那四个）。
for _cn in ("加课", "停课", "调课", "放假"):
    print("dex has ops type '%s'        :" % _cn, _cn.encode("utf-8") in _dex_all)
# 反向：MainActivity.setPref 里那段「这三个键变了就重画组件」的键名必须进包。
print("dex has xxmu_kb_ops watch    :", b"xxmu_kb_ops" in _dex_all)
print("dex has xxmu_weeks watch     :", b"xxmu_weeks" in _dex_all)

# ---- v2.12.0：桌面小组件「最近要交」（作业/考试截止）----
# 这一版同样没动 assets（Java 侧 + notes），只查 dex。
# 要证明三件事：①新类 WidgetDue 真进包；②四种状态词（中文，比查 done/open 可靠）
# 与三种记号真进包；③两个新 key 进包 —— xxmu_cx_homework 是数据来源，
# 「今天没课 · 」是那句「不再无条件说去玩吧」的文案锚点。
print("---")
print("dex has WidgetDue            :", b"WidgetDue" in _dex_all)
print("dex has WidgetDue$Item       :", b"WidgetDue$Item" in _dex_all)
for _cw in ("待批阅", "待互评", "未开考", "已过期"):
    print("dex has due word '%s'        :" % _cw, _cw.encode("utf-8") in _dex_all)
for _mk, _nm in (("\u23f0", "alarm-clock"), ("\u23f3", "hourglass"), ("\u270e", "pencil")):
    print("dex has mark %-14s :" % ("'" + _nm + "'"), _mk.encode("utf-8") in _dex_all)
print("dex has xxmu_cx_homework     :", b"xxmu_cx_homework" in _dex_all)
print("dex has 'no class but due'   :", "今天没课 · ".encode("utf-8") in _dex_all)

# ---- v2.13.0：课表导出成日历（.ics）----
# 这一版动了 assets（新增 web/ics.js、改了 index.html），所以两边都查：
# assets 里真有 ics.js、真有那行入口、真被引入；dex 里真有 text/calendar 这个 MIME。
print("---")
print("assets has ics.js            :", "assets/ics.js" in names)
if "assets/ics.js" in names:
    _ics = z.read("assets/ics.js")
    print("assets/ics.js bytes          :", len(_ics))
    for _needle, _label in (
            (b"const ICS", "IIFE"),
            (b"BEGIN:VCALENDAR", "VCALENDAR"),
            (b"RRULE:FREQ=WEEKLY", "RRULE"),
            (b"VTIMEZONE", "should-not-have-vtimezone"),
    ):
        _has = _needle in _ics
        if _label == "should-not-have-vtimezone":
            print("ics no VTIMEZONE             :", not _has)
        else:
            print("ics has %-20s :" % _label, _has)
    # 浮动时间：不许出现 TZID=（注释里解释这个坑不算，所以只查赋值形态）
    print("ics no TZID param            :", b"TZID:" not in _ics)
    print("ics no toISOString           :", b"toISOString" not in _ics)

_html = z.read("assets/index.html").decode("utf-8", "replace") if "assets/index.html" in names else ""
print("index has #rowCalendar       :", 'id="rowCalendar"' in _html)
print("index loads ics.js           :", 'src="ics.js"' in _html)
print("dex has text/calendar        :", b"text/calendar" in _dex_all)

# --- v2.14.0 -----------------------------------------------------------------
# 这一版只动了前端 + Java 文案，没动 assets 里的新文件；要查的是
# 「提醒系统真认得待办这个类别」，以及卡片第三行真进了包里的 index.html。
rem14 = z.read("assets/reminder.js").decode("utf-8", "replace") if "assets/reminder.js" in names else ""
print("reminder has KEY_TODO        :", "xxmu_remind_todo" in rem14)
print("reminder has buildTodo       :", "function buildTodo(" in rem14)
print("reminder 8am / 23:59         :", ("day0 + 8 * 3600000" in rem14) and ("day0 + 24 * 3600000 - 60000" in rem14))
print("index has #remindTodoRow     :", 'id="remindTodoRow"' in _html)
print("index has #remindTodoStat    :", 'id="remindTodoStat"' in _html)
print("dex has KIND_TODO            :", b"todo" in _dex_all)
print("dex has todo 今天到期        :", "今天到期".encode("utf-8") in _dex_all)
print("dex has todo 明天到期        :", "明天到期".encode("utf-8") in _dex_all)
print("dex has 有件待办到期          :", "有件待办到期".encode("utf-8") in _dex_all)

# --- v2.15.0 -----------------------------------------------------------------
# 四处「写了没人读」+ 一个真 BUG，全是纯 web 改动（没动 Java/dex）。
# 查的是打进包里的 assets/ 那份 web 代码——只看 web/ 目录永远发现不了
# 装上去才发现功能没生效（v2.0.0 learnplus 的教训）。纪律判断先剥注释。
def _strip15(s):
    return re.sub(r"^\s*//.*$", "", re.sub(r"/\*[\s\S]*?\*/", "", s), flags=re.M)


_f15 = _strip15(read("assets/focus.js"))
_a15 = _strip15(read("assets/about.js"))
_css15 = read("assets/app.css")
_og15 = read("assets/nova-organs.css")
print("focus.js resetBtn wired      :", "const resetBtn" in _f15 and "resetBtn.onclick" in _f15)
print("focus.js no shadow bug       :", "const reset = $('focusReset')" not in _f15)
print("focus.js stateErr/LAST_ERR   :", "const stateErr = LAST_ERR" in _f15 and "readErr" in _f15)
print("focus.js peakOf wired        :", "peakOf(state.log" in _f15)
print("focus.js shortDate           :", "function shortDate" in _f15)
print("index has #focusErr          :", 'id="focusErr"' in _html)
print("app.css .focus-err           :", ".focus-err" in _css15)
print("nova-organs.css .focus-err   :", ".focus-err" in _og15)
print("about.js autoDiag wired      :", "SOURCES.autoDiag()" in _a15 and "autoLine" in _a15)
print("about.js no-log fallback     :", "还没有记录" in _a15)

mft = z.read("AndroidManifest.xml")
print("manifest bytes               :", len(mft))

# --- v2.16.0 -----------------------------------------------------------------
# 名单只记教务网登录成功的真号：手填无效号（202211 这类）不进名单。
# 查打进包里的 assets/ 那份前端代码——只看 web/ 目录发现不了「装上去没生效」。
def _strip16(s):
    return re.sub(r"^\s*//.*$", "", re.sub(r"/\*[\s\S]*?\*/", "", s), flags=re.M)


_a16 = _strip16(read("assets/app.js"))
_t16 = read("assets/tut.js")
_c16 = _strip16(read("assets/index.html"))
print("v216 app no looksOddId       :", "function looksOddId" not in _a16)
print("v216 app no 手填标签          :", "格式异常（手填）" not in _a16)
print("v216 app no 校准/汇总/录真号  :",
      all(x not in _a16 for x in ("function renderOdd()", "function switchListTab",
                                  "function renderKbSummary", "function openKbFix(",
                                  "ODD = res.oddRows", "ONLY_CONFIRMED")))
print("v216 app 真号验证态文案       :", "教务网登录学号 · 已验证" in _a16)
print("v216 app 只数 LIST            :", "admListCnt').textContent = LIST.length + ' 人'" in _a16)
print("v216 html admListTip          :", 'id="admListTip"' in _c16)
print("v216 html no 二级菜单         :", 'id="admListTab"' not in _c16 and 'id="admKbSummary"' not in _c16)
print("v216 tut content ver 12       :", "const TUT_CONTENT_VER = 12" in _t16)
# AXML 里字符串以 UTF-16LE 存在 string pool；versionCode 是整数不放文本，
# 版本一致性由 verify_apk.py 从 manifest 正式解析校验（五件套已过）。
print("v216 manifest versionName     :", "2.16.0".encode("utf-16-le") in mft)
