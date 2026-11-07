# -*- coding: utf-8 -*-
"""把 web/app.css 重写成「涂鸦本 / 手绘草图」风。

用户反馈：不要这么多黑，也不要一直米白，涂鸦一点。
所以这一版：
  · 底色从近黑换成浅纸 + 浅蓝方格线（草图本），不是纯米白
  · 纸面之外大量加彩色：朱红 / 钴蓝 / 芥黄 / 青绿 / 紫，五色轮着用
  · 卡片白纸 + 墨线 + 硬投影，左上角贴一条彩色胶带，每 4 张换色
  · 标题前一颗手绘星号、章节标题加荧光笔涂抹、按钮像贴纸
  · 轻微旋转（±0.3deg）制造手贴的不齐感
深色档改成深靛蓝，不用纯黑。
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = os.path.join(ROOT, 'web', 'app.css')

ROOT_BLOCK = r''':root{
  /* ------------------------------------------------------------
     涂鸦本配色（v1.1.52）
     底：浅纸 + 浅蓝方格线（草图本），不是纯米白也不是黑。
     线：深灰蓝墨线（#20222B），比纯黑柔和，压在彩色底上不脏。
     色：五支笔轮着用 —— 朱红 / 钴蓝 / 芥黄 / 青绿 / 紫。
     所有「突出」都靠这五色，不靠加深背景。
     ------------------------------------------------------------ */
  --paper:#F7F2E6;
  --paper2:#FFFDF6;
  --grid:#D9E4F0;
  --ink:#20222B;
  --ink2:#4C5163;
  --pencil:#8B8D99;
  --line:#D6CDB8;

  --red:#E4572E;
  --blue:#2F5FA8;
  --yellow:#E9B23C;
  --green:#2F8F6B;
  --purple:#7B5EA7;

  --bg:var(--paper);
  --surface:var(--paper2);
  --surface2:#FBF5E7;
  --fg:var(--ink);
  --fg2:var(--ink2);
  --mute:var(--pencil);
  --line:var(--line);
  --accent:var(--red);
  --accent-soft:#FBE3D8;
  --danger:#C0392B;
  --warn:#C98A16;
  --ok:#2F8F6B;
  --radius:4px;
  --radius-sm:3px;
  --shadow:2px 2px 0 var(--ink);
  --shadow-lift:3px 3px 0 var(--ink);
  color-scheme:light;
  /* v1.1.39 深色模式：组件里的中性字面量全部收敛到这里。
   * 深色只换 html[data-theme="dark"] 那一段，浅色值 == 原字面量。 */
  --tap:#EEE6D4;
  --tap2:#F2EBDA;
  --seg-bg:#EDE5D2;
  --seg-on:#FFFDF6;
  --today-bg:#FCEFC9;
  --grip:#C9BFA8;
  --img-bg:#EDE5D2;
  --focus-line:var(--blue);
  --row-border:#E6DEC9;
  --card-mine-a:#FBEFD9;
  --gate-glow:#F7F2E6;
  --ok-bg:#DDF0E6;
  --ok-line:#A9CDBB;
  --danger-bg:#FBE0D8;
  --danger-line:#E8B3A4;
  --kb-bg:#FCEFC9;
  --kb-line:#E4C878;
  --kb-fg:#6B4A08;
  --kb-fg2:#8A6A22;
  --kb-bad-bg:#FBE0D8;
  --kb-bad-line:#E8B3A4;
  --kb-bad-fg:#9E2F1C;
  --kb-bad-fg2:#A05544;
  --kb-ok-bg:#DDF0E6;
  --kb-ok-line:#A9CDBB;
  --kb-ok-fg:#1F6B4C;
  --kb-ok-fg2:#3C7A5E;
  --tabs-bg:rgba(247,242,230,.97);
  --mask:rgba(32,34,43,.42);
  --shadow-modal:0 0 0 2px var(--ink);
  --shadow-modal-lg:0 0 0 2px var(--ink);
  /* 课程块：马卡龙色只压一层很薄的纸，让颜色自己出来 */
  --wash:rgba(255,253,246,.32);
  --c-line:rgba(32,34,43,.28);
  /* 胶带默认色（每 4 张卡换一支笔） */
  --tape:var(--red);
}
'''

DARK_BLOCK = r'''/* ============================================================
   深色主题（v1.1.52 涂鸦 · 靛蓝夜）
   ------------------------------------------------------------
   不换成纯黑：底色用靛蓝夜色，纸面变深石墨蓝，
   五支笔全部提亮一档，线色改米白。只换变量，规则不改。
   ============================================================ */
html[data-theme="dark"]{
  color-scheme:dark;
  --paper:#1C2033;
  --paper2:#242A40;
  --grid:#2E3550;
  --ink:#F2EDE1;
  --ink2:#C6C9D6;
  --pencil:#8E93A6;
  --line:#3B4460;
  --red:#FF7A50;
  --blue:#7BA7E8;
  --yellow:#F3C75E;
  --green:#5FBF95;
  --purple:#B394E0;
  --bg:var(--paper);
  --surface:var(--paper2);
  --surface2:#2A3149;
  --fg:#F2EDE1;
  --fg2:#C6C9D6;
  --mute:var(--pencil);
  --line:var(--line);
  --accent:var(--red);
  --accent-soft:#3B2A2A;
  --danger:#FF8A78;
  --warn:#E8B85C;
  --ok:#5FBF95;
  --shadow:2px 2px 0 #0C0F18;
  --shadow-lift:3px 3px 0 #0C0F18;
  --shadow-modal:0 0 0 2px #0C0F18;
  --shadow-modal-lg:0 0 0 2px #0C0F18;
  --mask:rgba(8,10,18,.72);
  --tabs-bg:rgba(28,32,51,.97);
  --tap:#333A54;
  --tap2:#39415C;
  --seg-bg:#333A54;
  --seg-on:#4A5270;
  --today-bg:#3A3520;
  --grip:#4A5270;
  --img-bg:#2A3149;
  --focus-line:var(--blue);
  --row-border:#39415C;
  --card-mine-a:#3A3520;
  --gate-glow:#1C2033;
  --ok-bg:#1F3A2E;
  --ok-line:#3A6B56;
  --danger-bg:#3B2320;
  --danger-line:#6E3A30;
  --kb-bg:#3A3320;
  --kb-line:#6B5A28;
  --kb-fg:#F3D890;
  --kb-fg2:#C7B47E;
  --kb-bad-bg:#3B2320;
  --kb-bad-line:#6E3A30;
  --kb-bad-fg:#F0A090;
  --kb-bad-fg2:#C29A8E;
  --kb-ok-bg:#1F3A2E;
  --kb-ok-line:#3A6B56;
  --kb-ok-fg:#8FD3AF;
  --kb-ok-fg2:#A5BFAE;
  --wash:rgba(36,42,64,.55);
  --c-line:rgba(242,237,225,.22);
  --tape:var(--red);
}
html[data-theme="dark"] .elec-change{color:var(--accent)}
'''

COVER = r'''

/* ============================================================
   v1.1.52 涂鸦覆盖层
   ------------------------------------------------------------
   放在文件末尾，靠「同特异性靠后者胜」压掉上面的原始规则，零 !important。
   这一版的重点不是「统一成黑白」，而是「像手绘草图本」：
     1) 底 —— 浅纸 + 浅蓝方格线（用 repeating-linear-gradient 画），
        不再是纯米白，也不再有整片黑。
     2) 线 —— 2px 深灰蓝墨线；圆角四角不等，卡片轻微旋转 ±0.3deg。
     3) 色 —— 五支笔轮换：朱红 / 钴蓝 / 芥黄 / 青绿 / 紫。
        卡片左上角贴一条彩色胶带（每 4 张换色），标题前一颗手绘星号，
        章节标题打一道荧光笔。
     4) 贴纸感 —— 硬投影 2px 2px 0 墨色，按钮按下位移。
   面板内文字的浅色令牌在下面被就地重映射成深墨，避免深字压深底。
   ============================================================ */

/* ---------------- 纸面：方格草图本 ---------------- */
html{
  background-color:var(--paper);
  background-image:
    repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 24px),
    repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 24px);
  background-position:-1px -1px;
}
body{background:transparent}

/* ---------------- 顶栏：墨线 + 荧光笔横道 ---------------- */
header{background:var(--paper);
  border-bottom:2px solid var(--ink);
  padding:calc(env(safe-area-inset-top) + 11px) 14px 10px}
.brand-mark{width:32px;height:32px;border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  background:var(--blue);color:#FFFDF6;
  border:2px solid var(--ink);box-shadow:2px 2px 0 var(--ink);
  font-size:16px;font-weight:800;transform:rotate(-3deg)}
.brand-name{color:var(--ink);font-size:17px;font-weight:800;letter-spacing:-.2px}
.brand-sub{color:var(--ink2);font-size:10.5px;letter-spacing:1.2px}
.pill{border:2px solid var(--ink);background:var(--paper2);
  color:var(--ink);border-radius:999px;box-shadow:1.5px 1.5px 0 var(--ink);
  font-size:11.5px;font-weight:700;padding:4px 11px}
.pill:active{transform:translate(1px,1px);box-shadow:none;background:var(--yellow)}
.pill.accent{background:var(--red);color:#FFFDF6;border-color:var(--ink)}
.pill.back,.crumb-back{background:var(--paper2);border:2px solid var(--ink);
  border-radius:999px;box-shadow:1.5px 1.5px 0 var(--ink);color:var(--ink)}
.crumb,.crumb-sep{color:var(--ink2)}
.crumb-cur{color:var(--ink);font-weight:800}
.hd-back{background:var(--paper2);border:2px solid var(--ink);
  border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;
  box-shadow:1.5px 1.5px 0 var(--ink);color:var(--ink)}

.wkbtn{border:2px solid var(--ink);border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;
  background:var(--paper2);color:var(--ink);font-size:17px;font-weight:800;
  box-shadow:1.5px 1.5px 0 var(--ink)}
.wkbtn:active{transform:translate(1px,1px);box-shadow:none;background:var(--yellow)}
.wk-main{color:var(--ink);font-weight:800;letter-spacing:-.2px}
.wk-sub{color:var(--ink2);font-size:10.5px;letter-spacing:.6px}

/* ---------------- 正文 ---------------- */
main{background:transparent}
.tab{padding:12px 12px 96px;letter-spacing:.1px}
.hint,.learn-head,.card-title,.grp-head,.hwsec,.wiki-cat,.ph-title,
.focus-phase,.focus-stat,.elec-label,.elec-meta,.mtd-cnt,.th-hint,
.rm-mode-hint,.adm-note,.adm-cnt,.pick-k,.hwcourse,.hwdate{color:var(--ink2)}

/* ---------------- 卡片：白纸 + 墨线 + 胶带 ---------------- */
.card{position:relative;background:var(--surface);
  border:2px solid var(--ink);
  border-radius:var(--radius);
  box-shadow:2px 2px 0 var(--ink);
  padding:16px 14px 14px;
  transform:rotate(-.25deg)}
.tab > .card:nth-child(even),
#sh-body > .card:nth-child(even){transform:rotate(.3deg)}

/* 左上角胶带：每 4 张换一支笔 */
.tab > .card:nth-of-type(4n+1),#sh-body > .card:nth-of-type(4n+1){--tape:var(--red)}
.tab > .card:nth-of-type(4n+2),#sh-body > .card:nth-of-type(4n+2){--tape:var(--blue)}
.tab > .card:nth-of-type(4n+3),#sh-body > .card:nth-of-type(4n+3){--tape:var(--green)}
.tab > .card:nth-of-type(4n+4),#sh-body > .card:nth-of-type(4n+4){--tape:var(--purple)}
.card::before{content:'';position:absolute;top:-7px;left:16px;
  width:42px;height:13px;background:var(--tape);opacity:.9;
  transform:rotate(-2.5deg);
  border-left:1px dashed rgba(255,255,255,.55);
  border-right:1px dashed rgba(255,255,255,.55)}

.card-title{color:var(--ink);font-weight:800;letter-spacing:1px;
  font-size:11px;text-transform:uppercase}
.card-title::before{content:'✳';color:var(--tape,var(--red));
  font-size:13px;margin-right:2px;font-weight:400;
  display:inline-block;transform:rotate(-8deg)}
.card-title .dot{display:none}

.row{border-top:1px dashed var(--line)}
.row+.row{border-top:1px dashed var(--line)}
.row>span:first-child{color:var(--ink2);font-weight:600}
.row .v{color:var(--ink2)}
.row .v.strong{color:var(--ink);font-weight:800}
.row.click{border-radius:6px 2px 7px 3px / 3px 7px 2px 6px}
.row.click:active{background:var(--yellow)}

/* ---------------- 按钮：贴纸 ---------------- */
.btn{background:var(--red);color:#FFFDF6;
  border:2px solid var(--ink);border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  box-shadow:2px 2px 0 var(--ink);
  font-size:14.5px;font-weight:800;letter-spacing:.8px;
  padding:13px;transition:none}
.btn:active{transform:translate(2px,2px);box-shadow:none;opacity:1;
  background:var(--red)}
.btn.ghost{background:var(--paper2);color:var(--ink);
  border:2px solid var(--ink);box-shadow:2px 2px 0 var(--ink);font-weight:700}
.btn.ghost:active{background:var(--yellow);box-shadow:none}
.btn.soft{background:var(--yellow);color:var(--ink);
  border:2px dashed var(--ink);box-shadow:none;font-weight:800}
.btn.soft:active{background:var(--paper2)}
.btn:disabled{opacity:.4;box-shadow:none}
.btn.busy{opacity:.6}
.btn-sm{background:var(--purple);color:#FFFDF6;
  border:2px solid var(--ink);border-radius:999px;box-shadow:1.5px 1.5px 0 var(--ink);
  font-weight:800;letter-spacing:.4px;padding:7px 15px}
.btn-sm:active{transform:translate(1px,1px);box-shadow:none}
.btn-sm.gray{background:var(--paper2);color:var(--ink2);
  border:2px solid var(--line);box-shadow:none}
.btn-sm.done{background:var(--ok-bg);color:var(--ok);
  border:2px solid var(--ok-line);box-shadow:none}
.ok{color:var(--ok)}
.warn{color:var(--danger)}

/* ---------------- 课表：方格本 + 彩铅事件块 ---------------- */
.grid{background:var(--paper2);
  border:2px solid var(--ink);border-radius:var(--radius);
  box-shadow:2px 2px 0 var(--ink);padding:8px 6px 10px}
.gh{color:var(--ink2);font-size:10px;letter-spacing:1px;font-weight:800}
.gh.today{color:var(--red)}
.gh.today::after{height:3px;background:var(--yellow);border-radius:2px;
  bottom:-4px;left:10%;right:10%}
.gp{color:var(--pencil)}
.gp>div:first-child{color:var(--ink2);font-weight:800}
.gp .gt{opacity:.6}
.gp.gfirst::before{height:1px;background:var(--line)}
.cell{background:transparent;border-radius:3px;
  border:1px dashed var(--grid)}
.cell.today{background:rgba(233,178,60,.22)}
/* 课程块：彩铅淡涂，颜色留着，只压一层薄纸让字压得住 */
.c{background:linear-gradient(var(--wash),var(--wash)),var(--c,#DCE6F2);
  color:var(--ink);border:1.5px solid var(--c-line);
  border-radius:5px 2px 6px 3px / 3px 6px 2px 5px;
  box-shadow:none}
.c::before{width:3px;background:var(--ink);opacity:.55;border-radius:0}
.c b{color:var(--ink);font-weight:800}
.c .room{color:var(--ink2)}
.c .pr,.c .pr2{color:var(--ink2);opacity:.85}

/* ---------------- 底部导航 ---------------- */
#tabs{background:var(--tabs-bg);border-top:2px solid var(--ink);
  backdrop-filter:none;padding:0 0 env(safe-area-inset-bottom)}
#tabs button{color:var(--ink2);font-size:10px;font-weight:700;
  letter-spacing:.4px;padding:9px 0 8px;position:relative;border-radius:0}
#tabs button svg{width:21px;height:21px;opacity:.7}
#tabs button.active{color:var(--ink);background:var(--paper2);font-weight:800}
#tabs button.active svg{opacity:1}
#tabs button.active::after{content:'';position:absolute;bottom:3px;
  width:16px;height:3px;background:var(--red);border-radius:2px;
  transform:rotate(-2deg)}
#tabs button:active{background:var(--yellow)}

/* ---------------- 半框 / 弹层 ---------------- */
#sheet{backdrop-filter:none;background:var(--mask)}
.sh-box{background:var(--paper2);border:2px solid var(--ink);
  border-bottom:0;border-radius:14px 5px 0 0 / 11px 4px 0 0;
  box-shadow:0 -3px 0 var(--ink)}
.sh-grip{width:36px;height:4px;border-radius:2px;background:var(--line)}
.sh-head{border-bottom:2px solid var(--ink);color:var(--ink)}
.sh-head b{font-weight:800;letter-spacing:-.2px}
.sheet-only{background:transparent;border:0;box-shadow:none;transform:none}
.sheet-only::before{display:none}
.upd-box,.tut-box,.disc-box,.onb-box,.ntc-box{background:var(--paper2);
  border:2px solid var(--ink);border-radius:10px 4px 11px 5px / 5px 11px 4px 10px;
  box-shadow:3px 3px 0 var(--ink)}
.upd-ttl,.tut-ttl,.disc-ttl,.onb-ttl,.ntc-ttl{color:var(--ink);font-weight:800}
.upd-ver,.tut-p,.disc-sub,.onb-sub,.ntc-at,.upd-notes,.disc-body p,
.ntc-body,.disc-body p.disc-more{color:var(--ink2)}
.upd-ico,.tut-icon,.gate-badge,.ntc-badge,.onb-n{
  background:var(--blue);color:#FFFDF6;border:2px solid var(--ink);
  border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  box-shadow:2px 2px 0 var(--ink);font-weight:800}
.ntc-badge{background:var(--yellow);color:var(--ink)}
.tut-icon{background:var(--green)}
.upd-ico{background:var(--purple)}
.upd-notes,.ntc-body{background:var(--surface2);border:1.5px dashed var(--line);
  border-radius:4px}
.upd-group{background:var(--yellow);color:var(--ink);border:2px solid var(--ink);
  border-radius:999px;font-weight:800;letter-spacing:.4px;box-shadow:1.5px 1.5px 0 var(--ink)}
.tut-tip{background:var(--paper2);color:var(--ink2);border:2px dashed var(--blue);
  border-radius:6px;font-size:12px}
.tut-dots i{background:var(--line);border-radius:2px}
.tut-dots i.on{background:var(--red);width:16px;border-radius:2px}
.tut-skip{background:transparent;border:2px solid var(--line);border-radius:6px;
  color:var(--ink2)}
.disc-x{background:var(--paper2);border:2px solid var(--ink);border-radius:8px;
  color:var(--ink);font-weight:800}
.disc-body b,.upd-notes b{color:var(--red)}

/* ---------------- 激活门 ---------------- */
#gate{background:var(--paper);
  background-image:
    repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 24px),
    repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 24px)}
.gate-badge{transform:rotate(-2deg)}
.gate-badge.sm{border-radius:8px 3px 9px 4px / 4px 9px 3px 8px}
.gate-logo{color:var(--ink);font-weight:800;letter-spacing:-.4px}
.gate-sub,.gate-hint,.gate-foot{color:var(--ink2)}
.gate-foot{border-top:2px dashed var(--line)}
.gate-tip{background:var(--paper2);color:var(--ink2);border:2px solid var(--ink);
  border-radius:8px;box-shadow:2px 2px 0 var(--ink)}
.gate-label{color:var(--ink2)}
.gate-input,.wiki-search,.fr-input,.adm-in,.rm-sel{
  background:var(--surface);border:2px solid var(--ink);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink);box-shadow:none;font-weight:600}
.gate-input:focus,.wiki-search:focus,.adm-in:focus{
  border-color:var(--blue);background:var(--surface);
  box-shadow:2px 2px 0 var(--blue)}
#gateCode{letter-spacing:2px}
.gate-more span{color:var(--ink2);border-radius:4px}
.gate-more span:active{background:var(--yellow);color:var(--ink)}
.gate-err{color:var(--danger)}
.about-logo{color:var(--ink);font-weight:800;letter-spacing:-.3px}
.about-ver{background:var(--yellow);border:2px solid var(--ink);
  color:var(--ink);border-radius:999px;font-weight:800;letter-spacing:.4px;
  box-shadow:1.5px 1.5px 0 var(--ink);transform:rotate(-1.5deg);
  display:inline-block}
.about-desc,.about-p.dim,.about-p{color:var(--ink2)}
#tab-about .row{border-top:1px dashed var(--line)}
#tab-about .row>span:first-child{color:var(--ink2)}
#tab-about .row>.v{color:var(--ink)}
.lnk{color:var(--blue);border-bottom:2px solid var(--yellow);font-weight:700}
.about-foot{color:var(--pencil)}

/* ---------------- 作业卡 / 待办 / 专注 / 提醒 ---------------- */
.hw{background:var(--surface);border:2px solid var(--ink);border-radius:5px;
  box-shadow:2px 2px 0 var(--ink);overflow:hidden}
.hwbar{width:4px;flex:0 0 4px}
.hwtop b{color:var(--ink);font-weight:800;letter-spacing:-.2px}
.hwbadge{background:var(--paper2);border:2px solid currentColor;
  border-radius:999px;font-weight:800;letter-spacing:.3px}
.hwcourse{color:var(--ink2)}
.hwleft.orange{color:var(--warn)}
.hwleft.red{color:var(--danger)}
.hwleft.gray{color:var(--pencil)}
.hwdate{color:var(--pencil);font-variant-numeric:tabular-nums}

#myTodoCard,#focusCard,#remindCard{border-left-width:2px}
.mtd{border-bottom:1px dashed var(--line)}
.mtd-cb{width:23px;height:23px;border-radius:7px 2px 8px 3px / 3px 8px 2px 7px;
  border:2px solid var(--ink);background:var(--paper2);color:var(--paper2)}
.mtd-cb.on{background:var(--green);border-color:var(--ink);
  color:#FFFDF6;font-weight:800}
.mtd-text{color:var(--ink);font-weight:600}
.mtd.done .mtd-text{color:var(--pencil);text-decoration:line-through}
.mtd-due{color:var(--ink2)}
.mtd-del{color:var(--pencil)}
.mtd-del.arm{color:var(--danger);font-weight:800}
.focus-time{color:var(--ink);font-weight:800;letter-spacing:-2px}
.focus-phase{color:var(--blue);font-weight:800;letter-spacing:1.2px}
#remindCard .row{border-top:1px dashed var(--line)}
#remindCard .row>span:first-child{color:var(--ink2)}
#remindCard .v{color:var(--red);font-weight:800}
.rm-row{border-bottom:1px dashed var(--line)}
.rm-row-label{color:var(--ink)}
.rm-switch{accent-color:var(--red)}
.rm-sel{background:var(--surface);color:var(--ink)}
.rm-warn{color:var(--danger)}
.rm-mode{background:var(--paper2);border:2px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink2);font-weight:700}
.rm-mode.on{background:var(--yellow);border-color:var(--ink);
  color:var(--ink);font-weight:800;box-shadow:2px 2px 0 var(--ink)}
.rm-mode-hint{color:var(--ink2)}

/* ---------------- 分段 / 胶囊 / 选择行 ---------------- */
.seg{background:var(--paper2);border:2px solid var(--ink);
  border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;padding:3px;
  box-shadow:1.5px 1.5px 0 var(--ink)}
.seg button{color:var(--ink2);border-radius:4px;font-weight:700;
  font-size:12.5px;letter-spacing:.3px}
.seg button.on{background:var(--blue);color:#FFFDF6;font-weight:800;
  box-shadow:none}
.chips button{background:var(--paper2);border:2px solid var(--ink);
  border-radius:999px;color:var(--ink);font-weight:700;
  box-shadow:1.5px 1.5px 0 var(--ink)}
.chips button.on{background:var(--red);color:#FFFDF6;border-color:var(--ink);
  font-weight:800}
.pick-row{background:var(--surface);border:2px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px}
.pick-row.on{border-color:var(--ink);box-shadow:2px 2px 0 var(--blue);
  background:var(--surface)}
.pick-row.ok:active{opacity:.85}
.pick-k{color:var(--pencil)}
.pick-v{color:var(--ink);font-weight:700}
.pick-arrow{color:var(--pencil)}
.pick-cell{background:var(--surface2);border:1.5px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink);font-weight:700}
.pick-cell:active{background:var(--yellow);border-color:var(--ink)}

/* ---------------- 宿舍空调 ---------------- */
.elec-entry{background:var(--blue);color:#FFFDF6;
  border:2px solid var(--ink);border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  box-shadow:3px 3px 0 var(--ink);outline:0;transform:rotate(-.4deg)}
.elec-entry-box{color:#FFFDF6;padding:15px 14px 14px}
.elec-entry-title{font-size:16px;font-weight:800;letter-spacing:.5px}
.elec-entry-sub{color:rgba(255,253,246,.86);font-weight:600}
.elec-entry-odd{font-size:32px;font-weight:800;letter-spacing:-1.2px}
.elec-entry-unit{color:rgba(255,253,246,.86)}
.elec-entry-refresh{background:var(--yellow);color:var(--ink);
  border:2px solid var(--ink);border-radius:999px;
  font-weight:800;letter-spacing:.4px;box-shadow:1.5px 1.5px 0 var(--ink)}
.elec-entry-refresh:active{transform:translate(1px,1px);box-shadow:none;background:var(--yellow)}
.elec-change{color:var(--ink);background:var(--yellow);
  border:2px solid var(--ink);border-radius:999px;font-weight:800}
html[data-theme="dark"] .elec-change{color:var(--ink)}
.elec-big{color:var(--ink);font-weight:800;letter-spacing:-2px}
.elec-unit,.elec-meta,.elec-label{color:var(--ink2)}
.elec-acts .btn{flex:1}

/* ---------------- 资料 / 图片墙 / 留言 / 教室 ---------------- */
.wiki-search{border-radius:999px}
.wiki-acts .btn{width:auto}
.wiki-card{background:var(--surface);border:2px solid var(--ink);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:2px 2px 0 var(--ink)}
.wiki-card.mine{background:var(--card-mine-a);box-shadow:2px 2px 0 var(--green)}
.wiki-t{color:var(--ink);font-weight:700}
.wiki-tag{background:var(--yellow);color:var(--ink);border:1.5px solid var(--ink);
  border-radius:999px;font-weight:800;letter-spacing:.3px}
.wiki-cat2{color:var(--blue);font-weight:800;letter-spacing:.8px}
.wiki-p{color:var(--ink2)}
.wiki-src{color:var(--pencil);border-top:1px dashed var(--line)}
.ph-card,.ph-full{border-radius:6px;border:2px solid var(--ink);
  box-shadow:2px 2px 0 var(--ink)}
.ph-cap{background:linear-gradient(transparent,rgba(32,34,43,.82));
  font-weight:700;letter-spacing:.2px}
.fb-card{background:var(--surface);border:2px solid var(--ink);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:2px 2px 0 var(--ink);color:var(--ink2)}
.fb-from{color:var(--ink);font-weight:800}
.fb-kind{background:var(--purple);color:#FFFDF6;border:1.5px solid var(--ink);
  border-radius:999px;font-weight:800}
.fb-at{color:var(--pencil)}
.fb-text{color:var(--ink2)}
.fb-reply{border-left:4px solid var(--green);background:var(--ok-bg);
  border-radius:0 5px 5px 0}
.fb-reply-t{color:var(--green);font-weight:800;letter-spacing:.5px}
.fb-reply-b{color:var(--ink2)}
.fr-label{color:var(--ink2)}
.fr-row .pill{border-radius:999px;color:var(--ink);border:2px solid var(--ink)}
.dev{border-top:1px dashed var(--line)}
.dev-n{color:var(--ink);font-weight:800}
.dev-s{color:var(--ink2)}
.room-card{background:var(--surface);border:2px solid var(--ink);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:2px 2px 0 var(--ink)}
.room-card:active{background:var(--yellow)}
.room-t{color:var(--ink);font-weight:800}
.room-m{color:var(--pencil)}
.room-f{color:var(--green);font-weight:800}
.free-acts .btn{flex:1}
/* 章节标题：荧光笔横扫 */
.hwsec,.grp-head,.wiki-cat,.ph-title{position:relative;display:inline-block;
  font-weight:800;letter-spacing:.8px;font-size:11px;color:var(--ink);
  padding:1px 4px}
.hwsec::after,.grp-head::after,.wiki-cat::after,.ph-title::after{
  content:'';position:absolute;left:0;right:0;bottom:1px;height:8px;
  background:var(--yellow);opacity:.55;z-index:-1;transform:rotate(-.6deg)}

/* ---------------- 管理台 / 审核 / 上传 ---------------- */
.adm-in{border-radius:6px}
.adm-stat{background:var(--surface);border:2px solid var(--ink);
  border-radius:5px;box-shadow:2px 2px 0 var(--ink)}
.adm-stat b{color:var(--ink);font-weight:800}
.adm-stat span{color:var(--pencil)}
.adm-stat b.warn{color:var(--danger)}
.adm-code{color:var(--blue);border-bottom:2px dotted var(--line);font-weight:800}
.adm-cp{background:var(--yellow);border:2px solid var(--ink);
  border-radius:999px;color:var(--ink);font-weight:800}
.adm-rev{background:transparent;border:2px solid var(--danger);
  color:var(--danger);border-radius:999px;font-weight:800}
.adm-ok{background:transparent;border:2px solid var(--ok);
  color:var(--ok);border-radius:999px;font-weight:800}
.adm-item{border-top:1px dashed var(--line)}
.adm-id,.adm-at,.adm-id-wrap{color:var(--pencil)}
.adm-odd{background:var(--yellow);color:var(--ink);
  border:1.5px solid var(--ink);border-radius:999px;font-weight:800}
.apk-pick{background:transparent;border:2px dashed var(--ink);
  border-radius:6px}
.apk-pick.has{background:var(--surface2);border-style:solid;
  border-color:var(--ink);box-shadow:2px 2px 0 var(--blue)}
.apk-pick-ico{background:var(--paper2);color:var(--ink);border-radius:8px;
  border:2px solid var(--ink);box-shadow:none;font-weight:800}
.apk-pick.has .apk-pick-ico{background:var(--green);color:#FFFDF6}
.apk-pick-txt b{color:var(--ink);font-weight:800}
.apk-pick-txt span{color:var(--pencil)}
.apk-hosted{background:transparent;border:2px dashed var(--line);
  border-radius:5px}
.apk-hosted .row{border-top:1px dashed var(--line)}
.settle-box{background:transparent;border:2px dashed var(--line);
  border-radius:5px}
.settle-row{border-top:1px dashed var(--line)}
.settle-row .k{color:var(--pencil)}
.settle-row .v{color:var(--ink);font-weight:800}
.rev-item{background:var(--surface2);border:1.5px solid var(--line);
  border-radius:5px}
.rev-badge{background:var(--paper2);border:1.5px solid var(--ink);
  border-radius:999px;color:var(--ink2);font-weight:800}
.rev-badge.ok{background:transparent;color:var(--ok);
  border:2px solid var(--ok)}
.rev-reply{border-left:4px solid var(--green);background:var(--ok-bg);
  border-radius:0 5px 5px 0}
.rev-reply-t{color:var(--green);font-weight:800}
.rev-cap,.rev-text,.rev-sub{color:var(--ink2)}
.adm-check{color:var(--ink2)}
.adm-check input{accent-color:var(--blue)}
.adm-tags .adm-bad{color:var(--danger)}
#admDetailCard .big-row{border-top:1px dashed var(--line)}

/* ---------------- 外观设置三档 ---------------- */
.th-opt{background:var(--paper2);border:2px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink2);font-weight:700}
.th-opt.on{background:var(--yellow);border-color:var(--ink);
  color:var(--ink);font-weight:800;box-shadow:2px 2px 0 var(--ink)}
.th-tick{font-weight:800;color:var(--ink)}
.th-hint{color:var(--ink2)}
.th-inline .th-opt{font-size:13.5px;padding:11px 13px}

/* ---------------- 滚动条 ---------------- */
::-webkit-scrollbar{width:0;height:0}
'''


def main():
    s = io.open(CSS, encoding='utf-8').read()

    rs = s.index(':root{')
    re_ = s.index('\n}\n', rs) + 3
    s = s[:rs] + ROOT_BLOCK + s[re_:]

    ds = s.index('html[data-theme="dark"]{')
    de = s.index('\n}\n', ds) + 3
    tail = s.find('html[data-theme="dark"] .elec-change', de)
    if tail >= 0:
        de = s.index('\n', tail) + 1
    s = s[:ds] + DARK_BLOCK + s[de:]

    marker = 'v1.1.51 FLIPSIDE 覆盖层'
    mi = s.index(marker)
    cs = s.rindex('/* =', 0, mi)
    s = s[:cs].rstrip() + '\n' + COVER

    io.open(CSS, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok  web/app.css  %d 字节' % len(s.encode('utf-8')))


if __name__ == '__main__':
    main()
