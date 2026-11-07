# -*- coding: utf-8 -*-
"""把 web/app.css 重写成 FLIPSIDE 风格：近黑底 + 米白块面 + 砖红强调 + 直角。

替换三段：
  1) :root（浅色/主色板）
  2) html[data-theme="dark"]（夜间）
  3) 文件末尾的覆盖层（旧的「素描纸」整段换掉）
原 1200 行的组件骨架一行不动。
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = os.path.join(ROOT, 'web', 'app.css')

ROOT_BLOCK = r''':root{
  /* ------------------------------------------------------------
     FLIPSIDE 色板（v1.1.51）
     近黑底 + 米白块面 + 砖红细线。参考的是 FLIPSIDE（翻面）那套美术：
     深色背景上贴一块块米白面板，面板之间靠 1px 砖红线切分，
     标题字重拉到 800，圆角几乎为零，没有任何渐变与柔和阴影。
     ------------------------------------------------------------ */
  --black:#0F0F11;
  --black2:#151518;
  --panel:#ECE4D7;
  --panel2:#DDD3C1;
  --cream:#F5EFE4;
  --brick:#B23A1E;
  --brick-dim:#7C3A22;
  --navy:#1B2333;
  --onbg:#F2EDE4;
  --onbg2:#A8A093;
  --onbg3:#6E675C;

  --bg:var(--black);
  --surface:var(--panel);
  --surface2:var(--panel2);
  --fg:#0F0F11;
  --fg2:#3A362F;
  --mute:#7E776C;
  --line:#C9BFAC;
  --accent:var(--brick);
  --accent-soft:#E7D3C6;
  --danger:#A32A18;
  --warn:#9A5A12;
  --ok:#2F6B45;
  --radius:2px;
  --radius-sm:1px;
  --shadow:none;
  --shadow-lift:none;
  color-scheme:dark;
  /* v1.1.39 深色模式：组件里的中性字面量全部收敛到这里。
   * 深色只换 html[data-theme="dark"] 那一段，浅色值 == 原字面量。 */
  --tap:#CFC5B2;
  --tap2:#D8CEBB;
  --seg-bg:#CFC5B2;
  --seg-on:#ECE4D7;
  --today-bg:#E0D3BC;
  --grip:#8E8677;
  --img-bg:#DDD3C1;
  --focus-line:#B23A1E;
  --row-border:#D8CEBB;
  --card-mine-a:#E4DAC8;
  --gate-glow:#141416;
  --ok-bg:#DCE6DC;
  --ok-line:#A8BFA8;
  --danger-bg:#EEDCD6;
  --danger-line:#C79B8E;
  --kb-bg:#E8DCC4;
  --kb-line:#C4AF88;
  --kb-fg:#5A3F14;
  --kb-fg2:#7A5F34;
  --kb-bad-bg:#EEDCD4;
  --kb-bad-line:#C79B8E;
  --kb-bad-fg:#7E2A1A;
  --kb-bad-fg2:#8A4A3A;
  --kb-ok-bg:#DCE6DC;
  --kb-ok-line:#A8BFA8;
  --kb-ok-fg:#2F5C3F;
  --kb-ok-fg2:#3F6A4A;
  --tabs-bg:rgba(15,15,17,.97);
  --mask:rgba(0,0,0,.72);
  --shadow-modal:0 0 0 1px rgba(178,58,30,.55);
  --shadow-modal-lg:0 0 0 1px rgba(178,58,30,.65);
  /* 课程块：马卡龙底被压成「深色事件块」，字用米白 */
  --wash:rgba(15,15,17,.62);
  --c-line:rgba(242,237,228,.16);
}
'''

DARK_BLOCK = r'''/* ============================================================
   深色主题（v1.1.51 FLIPSIDE · 纯黑板）
   ------------------------------------------------------------
   FLIPSIDE 本身就是暗色系，所以两档的差别不在「亮/暗」，
   而在「米白面板多还是少」：浅色那档主内容是成块的米白面板，
   这一档面板收成深石墨，只留米白字和砖红线，夜里更沉。
   只换语义变量，组件规则一条不改。
   ============================================================ */
html[data-theme="dark"]{
  color-scheme:dark;
  --black:#0A0A0C;
  --black2:#101014;
  --panel:#1B1B20;
  --panel2:#242429;
  --cream:#F0EAE0;
  --brick:#D2542F;
  --brick-dim:#8E4426;
  --navy:#151A26;
  --onbg:#F0EAE0;
  --onbg2:#9A938A;
  --onbg3:#5E5952;
  --bg:var(--black);
  --surface:var(--panel);
  --surface2:var(--panel2);
  --fg:#EDE7DD;
  --fg2:#C3BDB2;
  --mute:#8E877D;
  --line:#33333A;
  --accent:var(--brick);
  --accent-soft:#3A231A;
  --danger:#E0705E;
  --warn:#D89B4A;
  --ok:#5FA67A;
  --shadow:none;
  --shadow-lift:none;
  --shadow-modal:0 0 0 1px rgba(210,84,47,.55);
  --shadow-modal-lg:0 0 0 1px rgba(210,84,47,.70);
  --mask:rgba(0,0,0,.80);
  --tabs-bg:rgba(10,10,12,.97);
  --tap:#2C2C32;
  --tap2:#33333A;
  --seg-bg:#2C2C32;
  --seg-on:#3A3A42;
  --today-bg:#2A2620;
  --grip:#4A4A52;
  --img-bg:#242429;
  --focus-line:#D2542F;
  --row-border:#33333A;
  --card-mine-a:#2A2620;
  --gate-glow:#101014;
  --ok-bg:#16241B;
  --ok-line:#2F4A38;
  --danger-bg:#2A1512;
  --danger-line:#5A2A22;
  --kb-bg:#2C2519;
  --kb-line:#54452A;
  --kb-fg:#E0C892;
  --kb-fg2:#B8A67E;
  --kb-bad-bg:#2A1512;
  --kb-bad-line:#5A2A22;
  --kb-bad-fg:#E89A8A;
  --kb-bad-fg2:#C09A90;
  --kb-ok-bg:#16241B;
  --kb-ok-line:#2F4A38;
  --kb-ok-fg:#8CC49C;
  --kb-ok-fg2:#A0BAA6;
  --wash:rgba(10,10,12,.55);
  --c-line:rgba(240,234,224,.14);
}
html[data-theme="dark"] .elec-change{color:var(--accent)}
'''

COVER = r'''

/* ============================================================
   v1.1.51 FLIPSIDE 覆盖层
   ------------------------------------------------------------
   放在文件末尾，靠「同特异性靠后者胜」压掉上面的原始规则，
   全程不用 !important。颜色一律走变量，两档主题共用同一套线条。
   这套美术只有四条规则，记住这四条就不会跑偏：
     1) 块面 —— 近黑底 + 米白面板，面板是整块的，不做渐变、不做毛玻璃
     2) 直角 —— 圆角收到 0~2px，四角可以不等，但不能圆润
     3) 一条线 —— 面板之间靠 1px 砖红（--brick）切分，线要比块面更抢眼
     4) 重字 —— 中文标题字重 800、字距收紧；英文小字字距拉开
   黑底上的裸文字一律用 --onbg / --onbg2，面板里的字才用 --fg / --fg2。
   ============================================================ */

/* ---------------- 纸面换成纯黑板 ---------------- */
html{background-color:var(--black);background-image:none}
body{background:transparent}

/* ---------------- 顶栏：深藏青 + 底部砖红线 ---------------- */
header{background:var(--navy);border-bottom:1px solid var(--brick);
  padding:calc(env(safe-area-inset-top) + 12px) 14px 12px}
.brand-mark{width:30px;height:30px;border-radius:2px;
  background:var(--panel);color:var(--black);
  border:0;box-shadow:none;
  font-size:16px;font-weight:800;letter-spacing:0}
.brand-name{color:var(--onbg);font-size:17px;font-weight:800;
  letter-spacing:-.2px}
.brand-sub{color:var(--onbg2);font-size:10.5px;letter-spacing:1.6px;
  text-transform:uppercase;margin-top:2px}
.pill{border:1px solid rgba(242,237,228,.22);background:transparent;
  color:var(--onbg2);box-shadow:none;border-radius:2px;
  font-size:11.5px;letter-spacing:.6px;padding:5px 11px}
.pill:active{background:rgba(242,237,228,.10)}
.pill.accent{border-color:var(--brick);background:transparent;
  color:var(--brick);font-weight:700}
.pill.back,.crumb-back{background:transparent;color:var(--onbg);
  border:1px solid rgba(242,237,228,.24);border-radius:2px}
.crumb,.crumb-sep{color:var(--onbg3)}
.crumb-cur{color:var(--onbg)}
.hd-back{background:transparent;border:1px solid rgba(242,237,228,.24);
  border-radius:2px;color:var(--onbg)}

/* 周次行 */
.wkbtn{border-radius:2px;background:transparent;
  border:1px solid rgba(242,237,228,.24);color:var(--onbg);
  font-size:17px;box-shadow:none}
.wkbtn:active{background:rgba(242,237,228,.12)}
.wk-main{color:var(--onbg);font-size:16px;font-weight:800;letter-spacing:-.2px}
.wk-sub{color:var(--onbg3);font-size:10.5px;letter-spacing:.8px}

/* ---------------- 主体 ---------------- */
main{background:transparent}
.tab{letter-spacing:.1px}
.hint,.learn-head,.grp-head,.hwsec,.wiki-cat,.ph-title,.focus-phase,
.focus-stat,.elec-label,.elec-meta,.mtd-cnt,.th-hint,.rm-mode-hint,
.adm-note,.adm-cnt{color:var(--onbg2)}
.grp-head{border-bottom:1px solid rgba(242,237,228,.12);padding-bottom:6px}
.hint{font-size:11.5px}
.empty{background:transparent;border:1px dashed rgba(242,237,228,.22);
  border-radius:2px}
.empty b{color:var(--onbg)}
.empty p{color:var(--onbg2)}

/* ---------------- 卡片：米白整块 + 砖红细线 ---------------- */
.card{background:var(--surface);border:0;
  border-left:3px solid var(--brick);
  border-radius:var(--radius);box-shadow:none;
  padding:15px 14px}
.card-title{color:var(--fg2);font-weight:800;letter-spacing:1.4px;
  font-size:10.5px;text-transform:uppercase}
.card-title .dot{width:0;height:0;border-radius:0;background:none;
  box-shadow:none;display:none}
.row{border-top:1px solid var(--row-border)}
.row+.row{border-top:1px solid var(--row-border)}
.row>span:first-child{color:var(--fg2);font-weight:600}
.row .v{color:var(--fg2)}
.row .v.strong{color:var(--fg);font-weight:800}
.row.click:active{background:var(--surface2)}

/* ---------------- 按钮：砖红实块 / 描边空块 ---------------- */
.btn{background:var(--brick);color:#FFF7EF;
  border:0;border-radius:var(--radius);box-shadow:none;
  font-size:14.5px;font-weight:800;letter-spacing:1px;
  padding:14px 13px}
.btn:active{background:var(--brick-dim);transform:none;opacity:1}
.btn.ghost{background:transparent;color:var(--fg);
  border:1.5px solid var(--fg);box-shadow:none;font-weight:700}
.btn.ghost:active{background:var(--surface2)}
.btn.soft{background:transparent;color:var(--brick);
  border:1.5px solid var(--brick);box-shadow:none;font-weight:800}
.btn:disabled{opacity:.38}
.btn.busy{opacity:.55}
.btn-sm{background:var(--fg);color:var(--panel);
  border:0;border-radius:2px;box-shadow:none;font-weight:800;
  letter-spacing:.6px;padding:8px 16px}
.btn-sm:active{background:var(--brick);transform:none}
.btn-sm.gray{background:transparent;color:var(--fg2);
  border:1.5px solid var(--line);box-shadow:none}
.btn-sm.done{background:transparent;color:var(--ok);
  border:1.5px solid var(--ok-line);box-shadow:none}
.ok{color:var(--ok)}
.warn{color:var(--danger)}

/* ---------------- 课表：黑底方格 + 深色事件块 ---------------- */
.grid{background:transparent;border:1px solid rgba(242,237,228,.16);
  border-radius:var(--radius);box-shadow:none;padding:8px 6px 10px}
.gh{color:var(--onbg3);font-size:10px;letter-spacing:1px;font-weight:700}
.gh.today{color:var(--onbg);font-weight:800}
.gh.today::after{height:2px;background:var(--brick);border-radius:0;
  bottom:-3px;left:12%;right:12%}
.gp{color:var(--onbg3)}
.gp>div:first-child{color:var(--onbg2);font-weight:800}
.gp .gt{opacity:.5;color:var(--onbg3)}
.gp.gfirst::before{height:1px;background:rgba(242,237,228,.14)}
.cell{background:transparent;border-radius:0;
  border:1px solid rgba(242,237,228,.07)}
.cell.today{background:rgba(178,58,30,.13)}
/* 课程块：原马卡龙色被压暗成事件块，字反白，左沿一道砖红 */
.c{background:linear-gradient(var(--wash),var(--wash)),var(--c,#CFC5B2);
  color:var(--onbg);border:0;border-radius:2px;
  box-shadow:none;letter-spacing:0}
.c::before{width:2px;background:var(--brick);opacity:1;border-radius:0}
.c b{color:var(--onbg);font-weight:800}
.c .room{color:var(--onbg2)}
.c .pr,.c .pr2{color:var(--onbg3)}
.c:active{filter:brightness(1.5)}

/* ---------------- 底部导航：黑条 + 选中块 ---------------- */
#tabs{background:var(--tabs-bg);border-top:1px solid var(--brick);
  backdrop-filter:none;padding:0 0 env(safe-area-inset-bottom)}
#tabs button{color:var(--onbg3);font-size:10px;font-weight:700;
  letter-spacing:.5px;padding:10px 0 9px;position:relative;
  border-radius:0}
#tabs button svg{width:21px;height:21px;opacity:.55}
#tabs button.active{color:var(--black);background:var(--panel);
  font-weight:800}
#tabs button.active svg{opacity:1}
#tabs button:active{transform:none;background:rgba(242,237,228,.08)}

/* ---------------- 详情面板 / 各种弹层 ---------------- */
#sheet{backdrop-filter:none;background:var(--mask)}
.sh-box{background:var(--panel);border-top:2px solid var(--brick);
  border-radius:0;box-shadow:none}
.sh-grip{width:34px;height:3px;border-radius:0;background:var(--line)}
.sh-head{border-bottom:1px solid var(--line);color:var(--fg)}
.sh-head b{font-weight:800;letter-spacing:-.2px}
.sheet-only{background:transparent;border:0;box-shadow:none}
.upd-box,.tut-box,.disc-box,.onb-box,.ntc-box{background:var(--panel);
  border:0;border-top:3px solid var(--brick);border-radius:2px;
  box-shadow:none}
.upd-ttl,.tut-ttl,.disc-ttl,.onb-ttl,.ntc-ttl{color:var(--fg);font-weight:800;
  letter-spacing:-.3px}
.upd-ver,.tut-p,.disc-sub,.onb-sub,.ntc-at,.upd-notes,.disc-body p,
.tut-p,.ntc-body{color:var(--fg2)}
.upd-ico,.tut-icon,.gate-badge,.ntc-badge,.onb-n{
  background:var(--black);color:var(--panel);
  border:0;border-radius:2px;box-shadow:none;font-weight:800}
.ntc-badge{background:var(--brick);color:#FFF7EF}
.upd-notes,.ntc-body{background:var(--surface2);border-radius:1px}
.upd-group{background:var(--black);color:var(--panel);border-radius:2px;
  font-weight:800;letter-spacing:.5px}
.tut-tip{background:var(--black);color:var(--panel);border-radius:2px;
  border:0;border-left:3px solid var(--brick);font-size:12px}
.tut-dots i{background:var(--line);border-radius:0}
.tut-dots i.on{background:var(--brick);width:16px;border-radius:0}
.tut-skip{background:transparent;border:1px solid var(--line);
  border-radius:2px;color:var(--fg2)}
.disc-x{background:var(--black);color:var(--panel);border-radius:2px}
.disc-body b,.upd-notes b{color:var(--brick)}

/* ---------------- 激活门 ---------------- */
#gate{background:var(--black);
  background-image:linear-gradient(0deg,rgba(178,58,30,.10),transparent 60%)}
.gate-badge.sm{border-radius:2px}
.gate-logo{color:var(--onbg);font-weight:800;letter-spacing:-.4px}
.gate-sub,.gate-hint,.gate-foot{color:var(--onbg2)}
.gate-foot{border-top:1px solid rgba(242,237,228,.14)}
.gate-tip{background:var(--panel);color:var(--fg2);border-radius:2px;
  border-left:3px solid var(--brick);box-shadow:none}
.gate-label{color:var(--onbg2)}
.gate-input,.wiki-search,.fr-input,.adm-in,.rm-sel{
  background:var(--surface);border:1.5px solid var(--line);
  border-radius:2px;color:var(--fg);box-shadow:none;font-weight:600}
.gate-input:focus,.wiki-search:focus,.adm-in:focus{
  border-color:var(--brick);background:var(--surface)}
#gateCode{letter-spacing:2px}
.gate-more span{color:var(--onbg2);border-radius:2px}
.gate-more span:active{background:rgba(242,237,228,.10);color:var(--onbg)}
.gate-err{color:#E0705E}
.about-logo{color:var(--onbg);font-weight:800;letter-spacing:-.3px}
.about-ver{background:transparent;border:1px solid var(--brick);
  color:var(--brick);border-radius:2px;font-weight:800;letter-spacing:.6px}
.about-desc,.about-p.dim{color:var(--onbg2)}
.about-p{color:var(--onbg2)}
#tab-about .row{border-top:1px solid rgba(242,237,228,.12)}
#tab-about .row>span:first-child{color:var(--onbg2)}
#tab-about .row>.v{color:var(--onbg)}
.lnk{color:var(--brick);border-bottom:1px solid var(--brick);font-weight:700}
.about-foot{color:var(--onbg3)}

/* ---------------- 作业卡 / 待办 / 专注 / 提醒 ---------------- */
.hw{background:var(--surface);border:0;border-radius:2px;
  box-shadow:none;overflow:hidden}
.hwbar{width:3px;flex:0 0 3px}
.hwtop b{color:var(--fg);font-weight:800;letter-spacing:-.2px}
.hwbadge{background:transparent;border:1px solid currentColor;
  border-radius:2px;font-weight:800;letter-spacing:.4px}
.hwcourse{color:var(--fg2)}
.hwleft.orange{color:var(--warn)}
.hwleft.red{color:var(--danger)}
.hwleft.gray{color:var(--mute)}
.hwdate{color:var(--mute)}
.foldbox:empty{display:none}

.mtd{border-bottom:1px solid rgba(242,237,228,.12)}
.mtd-cb{width:22px;height:22px;border-radius:2px;
  border:2px solid var(--onbg2);background:transparent;color:var(--black)}
.mtd-cb.on{background:var(--panel);border-color:var(--panel);
  color:var(--black);font-weight:800}
.mtd-text{color:var(--onbg)}
.mtd.done .mtd-text{color:var(--onbg3);text-decoration:line-through}
.mtd-due{color:var(--onbg2)}
.mtd-del{color:var(--onbg3)}
.mtd-del.arm{color:#E0705E}
#myTodoCard{background:transparent;border-left:0;border-top:1px solid var(--brick);
  padding-top:14px}
#focusCard{background:transparent;border-left:0;border-top:1px solid var(--brick)}
.focus-time{color:var(--onbg);font-weight:800;letter-spacing:-2px}
.focus-phase{letter-spacing:1.4px;text-transform:uppercase;font-weight:700}
#remindCard{background:transparent;border-left:0;border-top:1px solid var(--brick)}
#remindCard .row{border-top:1px solid rgba(242,237,228,.12)}
#remindCard .row>span:first-child{color:var(--onbg2)}
#remindCard .v{color:var(--brick);font-weight:800}
.rm-row{border-bottom:1px solid rgba(242,237,228,.12)}
.rm-row-label{color:var(--onbg)}
.rm-switch{accent-color:var(--brick)}
.rm-sel{background:var(--surface);color:var(--fg)}
.rm-warn{color:#E0705E}
.rm-mode{background:transparent;border:1.5px solid rgba(242,237,228,.22);
  border-radius:2px;color:var(--onbg2);font-weight:700}
.rm-mode.on{background:var(--brick);border-color:var(--brick);
  color:#FFF7EF;font-weight:800}
.rm-mode-hint{color:var(--onbg2)}

/* ---------------- 分段 / 胶囊 / 选择行 ---------------- */
.seg{background:transparent;border:1px solid rgba(242,237,228,.20);
  border-radius:2px;padding:2px}
.seg button{color:var(--onbg2);border-radius:0;font-weight:700;
  font-size:12.5px;letter-spacing:.4px}
.seg button.on{background:var(--panel);color:var(--black);
  font-weight:800;box-shadow:none}
.chips button{background:transparent;border:1px solid rgba(242,237,228,.20);
  border-radius:2px;color:var(--onbg2);font-weight:700}
.chips button.on{background:var(--panel);color:var(--black);
  border-color:var(--panel);font-weight:800;box-shadow:none}
.pick-row{background:var(--surface);border:1px solid var(--line);
  border-radius:2px}
.pick-row.on{border-color:var(--brick);box-shadow:none;
  border-left-width:4px;background:var(--surface)}
.pick-row.ok:active{opacity:.8}
.pick-k{color:var(--mute)}
.pick-v{color:var(--fg);font-weight:700}
.pick-arrow{color:var(--faint,#B8AE9C)}
.pick-cell{background:var(--surface2);border-radius:2px;color:var(--fg);
  font-weight:700;border:1px solid transparent}
.pick-cell:active{background:var(--panel)}

/* ---------------- 宿舍空调 ---------------- */
.elec-entry{background:var(--brick);color:#FFF7EF;
  border-radius:var(--radius);box-shadow:none;outline:0;
  border-left:0}
.elec-entry-box{color:#FFF7EF;padding:16px 15px 15px}
.elec-entry-title{font-size:16px;font-weight:800;letter-spacing:.6px}
.elec-entry-sub{color:rgba(255,247,239,.80);font-weight:600}
.elec-entry-odd{font-size:32px;font-weight:800;letter-spacing:-1.2px}
.elec-entry-unit{color:rgba(255,247,239,.80)}
.elec-entry-refresh{background:transparent;color:#FFF7EF;
  border:1.5px solid rgba(255,247,239,.60);border-radius:2px;
  font-weight:800;letter-spacing:.6px}
.elec-entry-refresh:active{background:rgba(255,247,239,.18)}
.elec-change{color:var(--brick);background:transparent;
  border:1px solid var(--brick);border-radius:2px;font-weight:800}
html[data-theme="dark"] .elec-change{color:var(--brick)}
.elec-big{color:var(--onbg);font-weight:800;letter-spacing:-2px}
.elec-unit,.elec-meta,.elec-label{color:var(--onbg2)}
.elec-acts .btn{flex:1}

/* ---------------- 资料 / 图片墙 / 留言 / 教室 ---------------- */
.wiki-search{border-radius:2px}
.wiki-acts .btn{width:auto}
.wiki-card{background:var(--surface);border:0;border-radius:2px;
  box-shadow:none;border-left:3px solid transparent}
.wiki-card.mine{border-left-color:var(--brick);background:var(--surface);
  background-image:none}
.wiki-t{color:var(--fg);font-weight:700}
.wiki-tag{background:transparent;color:var(--brick);border:1px solid var(--brick);
  border-radius:2px;font-weight:800;letter-spacing:.4px}
.wiki-cat2{color:var(--brick);font-weight:800;letter-spacing:1px}
.wiki-p{color:var(--onbg2)}
.wiki-src{color:var(--onbg3);border-top:1px solid rgba(242,237,228,.12)}
.ph-card,.ph-full{border-radius:2px;border:0}
.ph-cap{background:linear-gradient(transparent,rgba(0,0,0,.82));
  font-weight:700;letter-spacing:.2px}
.fb-card{background:var(--surface);border:0;border-radius:2px;
  box-shadow:none;border-left:3px solid transparent}
.fb-from{color:var(--fg);font-weight:800}
.fb-kind{background:transparent;color:var(--brick);
  border:1px solid var(--brick);border-radius:2px;font-weight:800}
.fb-at{color:var(--mute)}
.fb-text{color:var(--fg2)}
.fb-reply{border-left:3px solid var(--brick);background:var(--surface2);
  border-radius:0}
.fb-reply-t{color:var(--brick);font-weight:800;letter-spacing:.6px}
.fb-reply-b{color:var(--fg2)}
.fb-list .fb-card+.fb-card{margin-top:0}
.fr-label{color:var(--onbg2)}
.fr-row .pill{border-radius:2px;color:var(--onbg);
  border:1px solid rgba(242,237,228,.24)}
.dev{border-top:1px solid rgba(242,237,228,.12)}
.dev-n{color:var(--onbg);font-weight:800}
.dev-s{color:var(--onbg2)}
.room-card{background:var(--surface);border:0;border-radius:2px;
  box-shadow:none;border-left:3px solid var(--brick)}
.room-t{color:var(--fg);font-weight:800}
.room-m{color:var(--mute)}
.room-f{color:var(--ok);font-weight:800}
.free-acts .btn{flex:1}
.hwsec{font-weight:800;letter-spacing:1.2px;text-transform:uppercase;
  font-size:10.5px}

/* ---------------- 管理台 / 审核 / 上传 ---------------- */
.adm-in{border-radius:2px}
.adm-stat{background:var(--surface);border:0;border-radius:2px;
  box-shadow:none;border-top:2px solid var(--brick)}
.adm-stat b{color:var(--fg);font-weight:800}
.adm-stat span{color:var(--mute)}
.adm-stat b.warn{color:var(--danger)}
.adm-code{color:var(--brick);border-bottom:1px dashed var(--line);
  font-weight:800}
.adm-cp{background:transparent;border:1.5px solid var(--fg);
  border-radius:2px;color:var(--fg);font-weight:800}
.adm-rev{background:transparent;border:1px solid var(--danger);
  color:var(--danger);border-radius:2px;font-weight:800}
.adm-ok{background:transparent;border:1px solid var(--ok);
  color:var(--ok);border-radius:2px;font-weight:800}
.adm-item{border-top:1px solid var(--row-border)}
.adm-id,.adm-at,.adm-id-wrap{color:var(--mute)}
.adm-odd{background:transparent;color:var(--warn);
  border:1px solid var(--kb-line);border-radius:2px}
.apk-pick{background:transparent;border:1.5px dashed var(--fg);
  border-radius:2px}
.apk-pick.has{background:var(--surface2);border-style:solid;
  border-color:var(--brick)}
.apk-pick-ico{background:var(--black);color:var(--panel);border-radius:2px;
  box-shadow:none;font-weight:800}
.apk-pick.has .apk-pick-ico{background:var(--brick);color:#FFF7EF}
.apk-pick-txt b{color:var(--fg);font-weight:800}
.apk-pick-txt span{color:var(--mute)}
.apk-hosted{background:transparent;border:1px solid var(--line);
  border-radius:2px}
.apk-hosted .row{border-top:1px solid var(--row-border)}
.settle-box{background:transparent;border:1px dashed var(--line);
  border-radius:2px}
.settle-row{border-top:1px solid var(--row-border)}
.settle-row .k{color:var(--mute)}
.settle-row .v{color:var(--fg);font-weight:800}
.rev-item{background:var(--surface2);border-radius:2px;border:0}
.rev-badge{background:var(--panel);border-radius:2px;color:var(--fg2);
  font-weight:800}
.rev-badge.ok{background:transparent;color:var(--ok);
  border:1px solid var(--ok)}
.rev-reply{border-left:3px solid var(--brick);background:var(--surface2);
  border-radius:0}
.rev-reply-t{color:var(--brick);font-weight:800}
.rev-cap,.rev-text,.rev-sub{color:var(--fg2)}
.rev-meta .rev-badge+.rev-badge{margin-left:4px}
.adm-check{color:var(--onbg2)}
.adm-check input{accent-color:var(--brick)}
.adm-tags .adm-bad{color:var(--danger)}
#admDetailCard .big-row{border-top:1px solid var(--row-border)}

/* ---------------- 外观设置三档 ---------------- */
.th-opt{background:transparent;border:1.5px solid rgba(242,237,228,.22);
  border-radius:2px;color:var(--onbg2);font-weight:700}
.th-opt.on{background:var(--brick);border-color:var(--brick);
  color:#FFF7EF;font-weight:800;box-shadow:none}
.th-tick{font-weight:800}
.th-hint{color:var(--onbg2)}
.th-inline .th-opt{font-size:13.5px;padding:12px 14px}

/* ---------------- 滚动条：藏起来 ---------------- */
::-webkit-scrollbar{width:0;height:0}
'''


def main():
    s = io.open(CSS, encoding='utf-8').read()

    # 1) :root 段
    rs = s.index(':root{')
    re_ = s.index('\n}\n', rs) + 3
    s = s[:rs] + ROOT_BLOCK + s[re_:]

    # 2) 深色块（含紧随其后的 .elec-change 一行）
    ds = s.index('html[data-theme="dark"]{')
    de = s.index('\n}\n', ds) + 3
    tail = s.find('html[data-theme="dark"] .elec-change', de)
    if tail >= 0:
        de = s.index('\n', tail) + 1
    s = s[:ds] + DARK_BLOCK + s[de:]

    # 3) 覆盖层（从旧素描纸标题注释到文件末尾）
    marker = '   v1.1.50 素描纸主题 · 覆盖层'
    mi = s.index(marker)
    cs = s.rindex('/* =', 0, mi)
    s = s[:cs].rstrip() + '\n' + COVER

    io.open(CSS, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok  web/app.css  %d 字节' % len(s.encode('utf-8')))


if __name__ == '__main__':
    main()
