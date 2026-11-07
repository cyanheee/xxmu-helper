# -*- coding: utf-8 -*-
"""在涂鸦本上叠一层「西部」：牛皮纸 + 沙土色 + 牧场风细节。

用户：可以再多一点点西部元素，混着涂鸦风格。
做法（不改结构，只改配色 + 补几处装饰）：
  · 纸：从冷白方格本换成牛皮纸（暖沙），格线变淡棕，左边加一道红皮绳线
  · 色：五支笔从「朱红/钴蓝/芥黄/青绿/紫」换成
        「砖红/牛仔蓝/沙金/仙人掌绿/赤陶」
  · 装饰：卡片角改成「撕纸」锯齿边、标题前加蹄铁星、分隔线用马鞍革针脚
  · 深色档：从靛蓝夜改成「沙漠星空」的深棕紫
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = os.path.join(ROOT, 'web', 'app.css')

ROOT_BLOCK = r''':root{
  /* ------------------------------------------------------------
     西部涂鸦本（v1.1.53）
     底：牛皮纸（暖沙）+ 淡棕方格线 + 左侧红皮绳。
     线：深棕墨（#2B2318），像烧过的木头。
     笔：砖红 / 牛仔蓝 / 沙金 / 仙人掌绿 / 赤陶，五支轮换。
     ------------------------------------------------------------ */
  --paper:#EFE2C8;
  --paper2:#FAF3E2;
  --grid:#DCCBAB;
  --ink:#2B2318;
  --ink2:#5A4B36;
  --pencil:#8E7E64;
  --line:#D3C0A0;

  --red:#B23B26;
  --blue:#2C5C7A;
  --yellow:#D9A32B;
  --green:#4E7A48;
  --purple:#8A5A3B;

  --bg:var(--paper);
  --surface:var(--paper2);
  --surface2:#F5EAD4;
  --fg:var(--ink);
  --fg2:var(--ink2);
  --mute:var(--pencil);
  --accent:var(--red);
  --accent-soft:#F3DCCB;
  --danger:#A62B1C;
  --warn:#B27A12;
  --ok:#3F6B3C;
  --radius:4px;
  --radius-sm:3px;
  --shadow:2px 2px 0 var(--ink);
  --shadow-lift:3px 3px 0 var(--ink);
  color-scheme:light;
  /* v1.1.39 深色模式：组件里的中性字面量全部收敛到这里。
   * 深色只换 html[data-theme="dark"] 那一段，浅色值 == 原字面量。 */
  --tap:#E7D8BC;
  --tap2:#ECDEC4;
  --seg-bg:#E4D4B6;
  --seg-on:#FAF3E2;
  --today-bg:#F4E2B4;
  --grip:#C4AE88;
  --img-bg:#E7D8BC;
  --focus-line:var(--blue);
  --row-border:#E0CFAF;
  --card-mine-a:#F7E8CC;
  --gate-glow:#EFE2C8;
  --ok-bg:#DDE7D3;
  --ok-line:#AABF9C;
  --danger-bg:#F6DFD5;
  --danger-line:#DBAE9C;
  --kb-bg:#F4E2B4;
  --kb-line:#D8B96E;
  --kb-fg:#6B4A08;
  --kb-fg2:#8A6A22;
  --kb-bad-bg:#F6DFD5;
  --kb-bad-line:#DBAE9C;
  --kb-bad-fg:#9E2F1C;
  --kb-bad-fg2:#A05544;
  --kb-ok-bg:#DDE7D3;
  --kb-ok-line:#AABF9C;
  --kb-ok-fg:#2F5C2C;
  --kb-ok-fg2:#4A6B44;
  --tabs-bg:rgba(239,226,200,.97);
  --mask:rgba(43,35,24,.42);
  --shadow-modal:0 0 0 2px var(--ink);
  --shadow-modal-lg:0 0 0 2px var(--ink);
  --wash:rgba(250,243,226,.16);
  --c-line:rgba(43,35,24,.30);
  --tape:var(--red);
  --edge:var(--ink);
  --oncolor:#FDF6E6;
  --oncolor-dim:rgba(253,246,230,.86);
  /* 卡片轮换底色：三支笔的极淡版本 + 一根皮绳线 */
  --tint-blue:#E4EDF1;
  --tint-yellow:#F8EBC7;
  --tint-purple:#F1E3D4;
  --rule-red:rgba(178,59,38,.45);
}
'''

DARK_BLOCK = r'''/* ============================================================
   深色主题（v1.1.53 西部 · 沙漠星空）
   ------------------------------------------------------------
   深棕紫的夜空，纸面变深皮革，五支笔整体提亮，
   描边换沙色。只换变量，规则不改。
   ============================================================ */
html[data-theme="dark"]{
  color-scheme:dark;
  --paper:#241E1A;
  --paper2:#302620;
  --grid:#3B3028;
  --ink:#F3E9D6;
  --ink2:#C8B79C;
  --pencil:#8F8069;
  --line:#463829;
  --red:#E8704C;
  --blue:#6FA8C8;
  --yellow:#E8BE58;
  --green:#7FB877;
  --purple:#C08E68;
  --bg:var(--paper);
  --surface:var(--paper2);
  --surface2:#3A2E26;
  --fg:#F3E9D6;
  --fg2:#C8B79C;
  --mute:var(--pencil);
  --accent:var(--red);
  --accent-soft:#3E2A22;
  --danger:#F08A72;
  --warn:#E8BE58;
  --ok:#7FB877;
  --shadow:2px 2px 0 #120E0A;
  --shadow-lift:3px 3px 0 #120E0A;
  --shadow-modal:0 0 0 2px #120E0A;
  --shadow-modal-lg:0 0 0 2px #120E0A;
  --mask:rgba(12,9,7,.74);
  --tabs-bg:rgba(36,30,26,.97);
  --tap:#453830;
  --tap2:#4E3F35;
  --seg-bg:#453830;
  --seg-on:#5A4A3D;
  --today-bg:#463A1E;
  --grip:#5A4A3D;
  --img-bg:#3A2E26;
  --focus-line:var(--blue);
  --row-border:#463829;
  --card-mine-a:#463A1E;
  --gate-glow:#241E1A;
  --ok-bg:#24361F;
  --ok-line:#42603A;
  --danger-bg:#3E2620;
  --danger-line:#70402F;
  --kb-bg:#463A1E;
  --kb-line:#7A6330;
  --kb-fg:#F0D79A;
  --kb-fg2:#C6B183;
  --kb-bad-bg:#3E2620;
  --kb-bad-line:#70402F;
  --kb-bad-fg:#F0A090;
  --kb-bad-fg2:#C29A8E;
  --kb-ok-bg:#24361F;
  --kb-ok-line:#42603A;
  --kb-ok-fg:#93C99A;
  --kb-ok-fg2:#A9BFAC;
  --wash:rgba(48,38,32,.55);
  --c-line:rgba(243,233,214,.22);
  --tape:var(--red);
  --edge:#8A7A66;
  --oncolor:#17120E;
  --oncolor-dim:rgba(23,18,14,.72);
  --tint-blue:#2C333A;
  --tint-yellow:#3E3720;
  --tint-purple:#3A2C24;
  --rule-red:rgba(232,112,76,.38);
}
html[data-theme="dark"] .elec-change{color:var(--accent)}
'''

COVER = r'''

/* ============================================================
   v1.1.53 西部涂鸦覆盖层
   ------------------------------------------------------------
   在涂鸦本上添一点西部：牛皮纸、皮绳、撕边、蹄铁星、针脚线。
   放在文件末尾，同特异性靠后者胜，零 !important。
     1) 纸 —— 牛皮纸 + 淡棕方格 + 左侧一道红皮绳（双线）
     2) 边 —— 卡片用「撕纸」锯齿下边（clip-path），角上是蹄铁星
     3) 笔 —— 砖红/牛仔蓝/沙金/仙人掌绿/赤陶，四张一轮换底色
     4) 线 —— 分隔用马鞍革针脚（dashed 加粗 + 微错位）
   ============================================================ */

/* ---------------- 牛皮纸 + 方格 + 皮绳 ---------------- */
html{
  background-color:var(--paper);
  background-image:
    linear-gradient(90deg,
      transparent 0 22px,
      var(--rule-red) 22px 23.5px,
      transparent 23.5px 27px,
      var(--rule-red) 27px 28px,
      transparent 28px),
    repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 24px),
    repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 24px);
  background-position:0 0,-1px -1px,-1px -1px;
  background-attachment:local,local,local;
}
body{background:transparent}

/* ---------------- 顶栏：皮革带 + 缝线 ---------------- */
header{background:var(--paper);
  border-bottom:2px solid var(--edge);
  box-shadow:0 5px 0 var(--yellow), 0 7px 0 var(--edge);
  padding:calc(env(safe-area-inset-top) + 11px) 14px 10px}
header::after{content:'';position:absolute;left:0;right:0;bottom:-14px;
  height:0;border-top:2px dashed var(--edge);opacity:.45}
.brand-mark{width:32px;height:32px;
  border-radius:10px 3px 11px 4px / 4px 11px 3px 10px;
  background:var(--red);color:var(--oncolor);
  border:2px solid var(--edge);box-shadow:2px 2px 0 var(--edge);
  font-size:16px;font-weight:800;transform:rotate(-4deg)}
.brand-name{color:var(--ink);font-size:17px;font-weight:800;letter-spacing:-.2px}
.brand-sub{color:var(--ink2);font-size:10px;letter-spacing:1.4px;
  text-transform:uppercase}
.pill{border:2px solid var(--edge);background:var(--paper2);
  color:var(--ink);border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:1.5px 1.5px 0 var(--edge);
  font-size:11px;font-weight:800;padding:4px 10px;letter-spacing:.4px}
.pill:active{transform:translate(1px,1px);box-shadow:none;background:var(--yellow)}
.pill.accent{background:var(--red);color:var(--oncolor);border-color:var(--edge)}
.pill.back,.crumb-back{background:var(--paper2);border:2px solid var(--edge);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:1.5px 1.5px 0 var(--edge);color:var(--ink)}
.crumb,.crumb-sep{color:var(--ink2)}
.crumb-cur{color:var(--ink);font-weight:800}
.hd-back{background:var(--paper2);border:2px solid var(--edge);
  border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;
  box-shadow:1.5px 1.5px 0 var(--edge);color:var(--ink)}

.wkbtn{border:2px solid var(--edge);
  border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;
  background:var(--paper2);color:var(--ink);font-size:17px;font-weight:800;
  box-shadow:1.5px 1.5px 0 var(--edge)}
.wkbtn:active{transform:translate(1px,1px);box-shadow:none;background:var(--yellow)}
.wk-main{color:var(--ink);font-weight:800;letter-spacing:-.2px}
.wk-sub{color:var(--ink2);font-size:10.5px;letter-spacing:.6px}

/* ---------------- 正文 ---------------- */
main{background:transparent}
.tab{padding:14px 12px 96px;letter-spacing:.1px}
.hint,.learn-head,.card-title,.grp-head,.hwsec,.wiki-cat,.ph-title,
.focus-phase,.focus-stat,.elec-label,.elec-meta,.mtd-cnt,.th-hint,
.rm-mode-hint,.adm-note,.adm-cnt,.pick-k,.hwcourse,.hwdate{color:var(--ink2)}

/* ---------------- 卡片：撕纸 + 胶带 + 蹄铁星 ---------------- */
.card{position:relative;background:var(--surface);
  border:2px solid var(--edge);
  border-radius:var(--radius);
  box-shadow:2px 2px 0 var(--edge);
  padding:16px 14px 18px;
  transform:rotate(-.25deg)}
.card:not(.elec-entry):nth-of-type(4n+1){--tape:var(--red);background:#FFFBF0}
.card:not(.elec-entry):nth-of-type(4n+2){--tape:var(--blue);background:var(--tint-blue)}
.card:not(.elec-entry):nth-of-type(4n+3){--tape:var(--yellow);background:var(--tint-yellow)}
.card:not(.elec-entry):nth-of-type(4n+4){--tape:var(--purple);background:var(--tint-purple)}
.card:nth-of-type(even){transform:rotate(.3deg)}

/* 胶带 */
.card::before{content:'';position:absolute;top:-7px;left:16px;
  width:44px;height:13px;background:var(--tape);opacity:.92;
  transform:rotate(-2.5deg);
  border-left:1px dashed rgba(255,255,255,.5);
  border-right:1px dashed rgba(255,255,255,.5)}

/* 右上角蹄铁星：西部标记 */
.card::after{content:'✦';position:absolute;top:6px;right:9px;
  font-size:11px;line-height:1;color:var(--tape);
  opacity:.75;transform:rotate(12deg)}

.card-title{color:var(--ink);font-weight:800;letter-spacing:1.2px;
  font-size:11px;text-transform:uppercase}
.card-title::before{content:'✦';color:var(--tape,var(--red));
  font-size:12px;margin-right:3px;font-weight:400;
  display:inline-block;transform:rotate(-10deg)}
.card-title .dot{display:none}

.row{border-top:2px dashed var(--line)}
.row+.row{border-top:2px dashed var(--line)}
.row>span:first-child{color:var(--ink2);font-weight:600}
.row .v{color:var(--ink2);font-variant-numeric:tabular-nums}
.row .v.strong{color:var(--ink);font-weight:800}
.row.click{border-radius:6px 2px 7px 3px / 3px 7px 2px 6px}
.row.click:active{background:var(--yellow)}

/* ---------------- 按钮：马鞍革贴片 ---------------- */
.btn{background:var(--red);color:var(--oncolor);
  border:2px solid var(--edge);
  border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  box-shadow:2px 2px 0 var(--edge);
  font-size:14.5px;font-weight:800;letter-spacing:1px;
  padding:13px;transition:none}
.btn:active{transform:translate(2px,2px);box-shadow:none;opacity:1}
.btn.ghost{background:var(--paper2);color:var(--ink);
  border:2px solid var(--edge);box-shadow:2px 2px 0 var(--edge);font-weight:700}
.btn.ghost:active{background:var(--yellow);box-shadow:none}
.btn.soft{background:var(--yellow);color:var(--ink);
  border:2px dashed var(--edge);box-shadow:none;font-weight:800}
.btn.soft:active{background:var(--paper2)}
.btn:disabled{opacity:.4;box-shadow:none}
.btn.busy{opacity:.6}
.btn-sm{background:var(--purple);color:var(--oncolor);
  border:2px solid var(--edge);border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:1.5px 1.5px 0 var(--edge);
  font-weight:800;letter-spacing:.4px;padding:7px 14px}
.btn-sm:active{transform:translate(1px,1px);box-shadow:none}
.btn-sm.gray{background:var(--paper2);color:var(--ink2);
  border:2px solid var(--line);box-shadow:none}
.btn-sm.done{background:var(--ok-bg);color:var(--ok);
  border:2px solid var(--ok-line);box-shadow:none}
.ok{color:var(--ok)}
.warn{color:var(--danger)}

/* ---------------- 课表：方格账本 ---------------- */
.grid{background:var(--paper2);
  border:2px solid var(--edge);border-radius:var(--radius);
  box-shadow:2px 2px 0 var(--edge);padding:8px 6px 10px}
.gh{color:var(--ink2);font-size:10px;letter-spacing:1.2px;font-weight:800}
.gh.today{color:var(--red)}
.gh.today::after{height:3px;background:var(--yellow);border-radius:2px;
  bottom:-4px;left:8%;right:8%}
.gp{color:var(--pencil)}
.gp>div:first-child{color:var(--ink2);font-weight:800}
.gp .gt{opacity:.65}
.gp.gfirst::before{height:1px;background:var(--line)}
.cell{background:transparent;border-radius:3px;
  border:1px dashed var(--grid)}
.cell.today{background:rgba(217,163,43,.24)}
.c{background:linear-gradient(var(--wash),var(--wash)),var(--c,#DCE6F2);
  color:var(--ink);border:1.5px solid var(--c-line);
  border-radius:5px 2px 6px 3px / 3px 6px 2px 5px;
  box-shadow:1px 1px 0 rgba(43,35,24,.35);
  filter:saturate(2.2) contrast(1.05);
  transform:rotate(-.5deg)}
.c:nth-child(even){transform:rotate(.5deg)}
.c::before{width:3px;background:var(--edge);opacity:.55;border-radius:0}
.c b{color:var(--ink);font-weight:800}
.c .room{color:var(--ink2)}
.c .pr,.c .pr2{color:var(--ink2);opacity:.9}

/* ---------------- 底部导航：马鞍带 ---------------- */
#tabs{background:var(--tabs-bg);border-top:2px solid var(--edge);
  backdrop-filter:none;padding:0 0 env(safe-area-inset-bottom)}
#tabs button{color:var(--ink2);font-size:10px;font-weight:700;
  letter-spacing:.4px;padding:9px 0 8px;position:relative;border-radius:0}
#tabs button svg{width:21px;height:21px;opacity:.75}
#tabs button.active{color:var(--ink);background:var(--paper2);font-weight:800}
#tabs button.active svg{opacity:1}
#tabs button.active::after{content:'';position:absolute;bottom:3px;
  width:16px;height:3px;background:var(--red);border-radius:2px;
  transform:rotate(-2deg)}
#tabs button:active{background:var(--yellow)}

/* ---------------- 半框 / 弹层 ---------------- */
#sheet{backdrop-filter:none;background:var(--mask)}
.sh-box{background:var(--paper2);border:2px solid var(--edge);
  border-bottom:0;border-radius:14px 5px 0 0 / 11px 4px 0 0;
  box-shadow:0 -3px 0 var(--edge)}
.sh-grip{width:36px;height:4px;border-radius:2px;background:var(--line)}
.sh-head{border-bottom:2px dashed var(--edge);color:var(--ink)}
.sh-head b{font-weight:800;letter-spacing:-.2px}
.sheet-only{background:transparent;border:0;box-shadow:none;transform:none}
.sheet-only::before,.sheet-only::after{display:none}
.upd-box,.tut-box,.disc-box,.onb-box,.ntc-box{background:var(--paper2);
  border:2px solid var(--edge);
  border-radius:10px 4px 11px 5px / 5px 11px 4px 10px;
  box-shadow:3px 3px 0 var(--edge)}
.upd-ttl,.tut-ttl,.disc-ttl,.onb-ttl,.ntc-ttl{color:var(--ink);font-weight:800}
.upd-ver,.tut-p,.disc-sub,.onb-sub,.ntc-at,.upd-notes,.disc-body p,
.ntc-body,.disc-body p.disc-more{color:var(--ink2)}
.upd-ico,.tut-icon,.gate-badge,.ntc-badge,.onb-n{
  background:var(--blue);color:var(--oncolor);
  border:2px solid var(--edge);
  border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  box-shadow:2px 2px 0 var(--edge);font-weight:800}
.ntc-badge{background:var(--yellow);color:var(--oncolor)}
.tut-icon{background:var(--green)}
.upd-ico{background:var(--purple)}
.upd-notes,.ntc-body{background:var(--surface2);border:2px dashed var(--line);
  border-radius:4px}
.upd-group{background:var(--yellow);color:var(--ink);border:2px solid var(--edge);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  font-weight:800;letter-spacing:.4px;box-shadow:1.5px 1.5px 0 var(--edge)}
.tut-tip{background:var(--paper2);color:var(--ink2);border:2px dashed var(--blue);
  border-radius:6px;font-size:12px}
.tut-dots i{background:var(--line);border-radius:2px}
.tut-dots i.on{background:var(--red);width:16px;border-radius:2px}
.tut-skip{background:transparent;border:2px solid var(--line);border-radius:6px;
  color:var(--ink2)}
.disc-x{background:var(--paper2);border:2px solid var(--edge);
  border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;
  color:var(--ink);font-weight:800}
.disc-body b,.upd-notes b{color:var(--red)}

/* ---------------- 激活门 ---------------- */
#gate{background:var(--paper);
  background-image:
    linear-gradient(90deg,
      transparent 0 22px,
      var(--rule-red) 22px 23.5px,
      transparent 23.5px),
    repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 24px),
    repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 24px)}
.gate-badge{transform:rotate(-3deg)}
.gate-badge.sm{border-radius:8px 3px 9px 4px / 4px 9px 3px 8px}
.gate-logo{color:var(--ink);font-weight:800;letter-spacing:-.4px}
.gate-sub,.gate-hint,.gate-foot{color:var(--ink2)}
.gate-foot{border-top:2px dashed var(--line)}
.gate-tip{background:var(--paper2);color:var(--ink2);border:2px solid var(--edge);
  border-radius:8px;box-shadow:2px 2px 0 var(--edge)}
.gate-label{color:var(--ink2)}
.gate-input,.wiki-search,.fr-input,.adm-in,.rm-sel{
  background:var(--surface);border:2px solid var(--edge);
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
.about-ver{background:var(--yellow);border:2px solid var(--edge);
  color:var(--oncolor);border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  font-weight:800;letter-spacing:.4px;box-shadow:1.5px 1.5px 0 var(--edge);
  transform:rotate(-1.5deg);display:inline-block}
.about-desc,.about-p.dim,.about-p{color:var(--ink2)}
#tab-about .row{border-top:2px dashed var(--line)}
#tab-about .row>span:first-child{color:var(--ink2)}
#tab-about .row>.v{color:var(--ink)}
.lnk{color:var(--blue);border-bottom:2px solid var(--yellow);font-weight:700}
.about-foot{color:var(--pencil)}

/* ---------------- 作业卡 / 待办 / 专注 / 提醒 ---------------- */
.hw{background:var(--surface);border:2px solid var(--edge);border-radius:5px;
  box-shadow:2px 2px 0 var(--edge);overflow:hidden}
.hwbar{width:4px;flex:0 0 4px}
.hwtop b{color:var(--ink);font-weight:800;letter-spacing:-.2px}
.hwbadge{background:var(--paper2);border:2px solid currentColor;
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  font-weight:800;letter-spacing:.3px}
.hwcourse{color:var(--ink2)}
.hwleft.orange{color:var(--warn)}
.hwleft.red{color:var(--danger)}
.hwleft.gray{color:var(--pencil)}
.hwdate{color:var(--pencil);font-variant-numeric:tabular-nums}

#myTodoCard,#focusCard,#remindCard{border-left-width:2px}
.mtd{border-bottom:2px dashed var(--line)}
.mtd-cb{width:23px;height:23px;border-radius:7px 2px 8px 3px / 3px 8px 2px 7px;
  border:2px solid var(--edge);background:var(--paper2);color:var(--paper2)}
.mtd-cb.on{background:var(--green);border-color:var(--edge);
  color:var(--oncolor);font-weight:800}
.mtd-text{color:var(--ink);font-weight:600}
.mtd.done .mtd-text{color:var(--pencil);text-decoration:line-through}
.mtd-due{color:var(--ink2)}
.mtd-del{color:var(--pencil)}
.mtd-del.arm{color:var(--danger);font-weight:800}
.focus-time{color:var(--ink);font-weight:800;letter-spacing:-2px}
.focus-phase{color:var(--blue);font-weight:800;letter-spacing:1.2px}
#remindCard .row{border-top:2px dashed var(--line)}
#remindCard .row>span:first-child{color:var(--ink2)}
#remindCard .v{color:var(--red);font-weight:800}
.rm-row{border-bottom:2px dashed var(--line)}
.rm-row-label{color:var(--ink)}
.rm-switch{accent-color:var(--red)}
.rm-sel{background:var(--surface);color:var(--ink)}
.rm-warn{color:var(--danger)}
.rm-mode{background:var(--paper2);border:2px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink2);font-weight:700}
.rm-mode.on{background:var(--yellow);border-color:var(--edge);
  color:var(--ink);font-weight:800;box-shadow:2px 2px 0 var(--edge)}
.rm-mode-hint{color:var(--ink2)}

/* ---------------- 分段 / 胶囊 / 选择行 ---------------- */
.seg{background:var(--paper2);border:2px solid var(--edge);
  border-radius:8px 3px 9px 4px / 4px 9px 3px 8px;padding:3px;
  box-shadow:1.5px 1.5px 0 var(--edge)}
.seg button{color:var(--ink2);border-radius:4px;font-weight:700;
  font-size:12.5px;letter-spacing:.3px}
.seg button.on{background:var(--blue);color:var(--oncolor);font-weight:800;
  box-shadow:none}
.chips button{background:var(--paper2);border:2px solid var(--edge);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink);font-weight:700;box-shadow:1.5px 1.5px 0 var(--edge)}
.chips button.on{background:var(--red);color:var(--oncolor);
  border-color:var(--edge);font-weight:800}
.pick-row{background:var(--surface);border:2px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px}
.pick-row.on{border-color:var(--edge);box-shadow:2px 2px 0 var(--blue);
  background:var(--surface)}
.pick-row.ok:active{opacity:.85}
.pick-k{color:var(--pencil)}
.pick-v{color:var(--ink);font-weight:700}
.pick-arrow{color:var(--pencil)}
.pick-cell{background:var(--surface2);border:1.5px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink);font-weight:700}
.pick-cell:active{background:var(--yellow);border-color:var(--edge)}

/* ---------------- 宿舍空调：牛仔布告牌 ---------------- */
.card.elec-entry{background:var(--blue);color:var(--oncolor);
  border:2px solid var(--edge);
  border-radius:9px 3px 10px 4px / 4px 10px 3px 9px;
  box-shadow:3px 3px 0 var(--edge);outline:0;transform:rotate(-.4deg);
  --tape:var(--yellow)}
.elec-entry-box{color:var(--oncolor);padding:15px 14px 14px}
.elec-entry-title{font-size:16px;font-weight:800;letter-spacing:.5px}
.elec-entry-sub{color:var(--oncolor-dim);font-weight:600}
.elec-entry-odd{font-size:32px;font-weight:800;letter-spacing:-1.2px}
.elec-entry-unit{color:var(--oncolor-dim)}
.elec-entry-refresh{background:var(--yellow);color:var(--ink);
  border:2px solid var(--edge);border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  font-weight:800;letter-spacing:.4px;box-shadow:1.5px 1.5px 0 var(--edge)}
.elec-entry-refresh:active{transform:translate(1px,1px);box-shadow:none}
.elec-change{color:var(--ink);background:var(--yellow);
  border:2px solid var(--edge);border-radius:999px;font-weight:800}
html[data-theme="dark"] .elec-change{color:var(--ink)}
.elec-big{color:var(--ink);font-weight:800;letter-spacing:-2px}
.elec-unit,.elec-meta,.elec-label{color:var(--ink2)}
.elec-acts .btn{flex:1}

/* ---------------- 资料 / 图片墙 / 留言 / 教室 ---------------- */
.wiki-search{border-radius:6px}
.wiki-acts .btn{width:auto}
.wiki-card{background:var(--surface);border:2px solid var(--edge);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:2px 2px 0 var(--edge)}
.wiki-card.mine{background:var(--card-mine-a);box-shadow:2px 2px 0 var(--green)}
.wiki-t{color:var(--ink);font-weight:700}
.wiki-tag{background:var(--yellow);color:var(--ink);border:1.5px solid var(--edge);
  border-radius:999px;font-weight:800;letter-spacing:.3px}
.wiki-cat2{color:var(--blue);font-weight:800;letter-spacing:.8px}
.wiki-p{color:var(--ink2)}
.wiki-src{color:var(--pencil);border-top:2px dashed var(--line)}
.ph-card,.ph-full{border-radius:6px;border:2px solid var(--edge);
  box-shadow:2px 2px 0 var(--edge)}
.ph-img{background-image:repeating-linear-gradient(45deg,
  rgba(43,35,24,.10) 0 2px, transparent 2px 9px),var(--img-bg)}
.ph-cap{background:linear-gradient(transparent,rgba(43,35,24,.84));
  font-weight:700;letter-spacing:.2px}
.fb-card{background:var(--surface);border:2px solid var(--edge);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:2px 2px 0 var(--edge);color:var(--ink2)}
.fb-from{color:var(--ink);font-weight:800}
.fb-kind{background:var(--purple);color:var(--oncolor);
  border:1.5px solid var(--edge);border-radius:999px;font-weight:800}
.fb-at{color:var(--pencil)}
.fb-text{color:var(--ink2)}
.fb-reply{border-left:4px solid var(--green);background:var(--ok-bg);
  border-radius:0 5px 5px 0}
.fb-reply-t{color:var(--green);font-weight:800;letter-spacing:.5px}
.fb-reply-b{color:var(--ink2)}
.fr-label{color:var(--ink2)}
.fr-row .pill{border-radius:6px;color:var(--ink);border:2px solid var(--edge)}
.dev{border-top:2px dashed var(--line)}
.dev-n{color:var(--ink);font-weight:800}
.dev-s{color:var(--ink2)}
.room-card{background:var(--surface);border:2px solid var(--edge);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  box-shadow:2px 2px 0 var(--edge)}
.room-card:active{background:var(--yellow)}
.room-t{color:var(--ink);font-weight:800}
.room-m{color:var(--pencil)}
.room-f{color:var(--green);font-weight:800}
.free-acts .btn{flex:1}
/* 章节标题：沙金荧光笔 */
.hwsec,.grp-head,.wiki-cat,.ph-title{position:relative;display:inline-block;
  font-weight:800;letter-spacing:.9px;font-size:11px;color:var(--ink);
  padding:1px 5px}
.hwsec::after,.grp-head::after,.wiki-cat::after,.ph-title::after{
  content:'';position:absolute;left:0;right:0;bottom:1px;height:8px;
  background:var(--yellow);opacity:.6;z-index:-1;transform:rotate(-.6deg)}

/* ---------------- 管理台 / 审核 / 上传 ---------------- */
.adm-in{border-radius:6px}
.adm-stat{background:var(--surface);border:2px solid var(--edge);
  border-radius:5px;box-shadow:2px 2px 0 var(--edge)}
.adm-stat b{color:var(--ink);font-weight:800}
.adm-stat span{color:var(--pencil)}
.adm-stat b.warn{color:var(--danger)}
.adm-code{color:var(--blue);border-bottom:2px dotted var(--line);font-weight:800}
.adm-cp{background:var(--yellow);border:2px solid var(--edge);
  border-radius:6px;color:var(--ink);font-weight:800}
.adm-rev{background:transparent;border:2px solid var(--danger);
  color:var(--danger);border-radius:6px;font-weight:800}
.adm-ok{background:transparent;border:2px solid var(--ok);
  color:var(--ok);border-radius:6px;font-weight:800}
.adm-item{border-top:2px dashed var(--line)}
.adm-id,.adm-at,.adm-id-wrap{color:var(--pencil)}
.adm-odd{background:var(--yellow);color:var(--ink);
  border:1.5px solid var(--edge);border-radius:6px;font-weight:800}
.apk-pick{background:transparent;border:2px dashed var(--edge);border-radius:6px}
.apk-pick.has{background:var(--surface2);border-style:solid;
  border-color:var(--edge);box-shadow:2px 2px 0 var(--blue)}
.apk-pick-ico{background:var(--paper2);color:var(--ink);border-radius:8px;
  border:2px solid var(--edge);box-shadow:none;font-weight:800}
.apk-pick.has .apk-pick-ico{background:var(--green);color:var(--oncolor)}
.apk-pick-txt b{color:var(--ink);font-weight:800}
.apk-pick-txt span{color:var(--pencil)}
.apk-hosted{background:transparent;border:2px dashed var(--line);border-radius:5px}
.apk-hosted .row{border-top:2px dashed var(--line)}
.settle-box{background:transparent;border:2px dashed var(--line);border-radius:5px}
.settle-row{border-top:2px dashed var(--line)}
.settle-row .k{color:var(--pencil)}
.settle-row .v{color:var(--ink);font-weight:800}
.rev-item{background:var(--surface2);border:1.5px solid var(--line);border-radius:5px}
.rev-badge{background:var(--paper2);border:1.5px solid var(--edge);
  border-radius:6px;color:var(--ink2);font-weight:800}
.rev-badge.ok{background:transparent;color:var(--ok);border:2px solid var(--ok)}
.rev-reply{border-left:4px solid var(--green);background:var(--ok-bg);
  border-radius:0 5px 5px 0}
.rev-reply-t{color:var(--green);font-weight:800}
.rev-cap,.rev-text,.rev-sub{color:var(--ink2)}
.adm-check{color:var(--ink2)}
.adm-check input{accent-color:var(--blue)}
.adm-tags .adm-bad{color:var(--danger)}
#admDetailCard .big-row{border-top:2px dashed var(--line)}

/* ---------------- 外观设置三档 ---------------- */
.th-opt{background:var(--paper2);border:2px solid var(--line);
  border-radius:6px 2px 7px 3px / 3px 7px 2px 6px;
  color:var(--ink2);font-weight:700}
.th-opt.on{background:var(--yellow);border-color:var(--edge);
  color:var(--ink);font-weight:800;box-shadow:2px 2px 0 var(--edge)}
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

    marker = 'v1.1.52 涂鸦覆盖层'
    mi = s.index(marker)
    cs = s.rindex('/* =', 0, mi)
    s = s[:cs].rstrip() + '\n' + COVER

    io.open(CSS, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok  web/app.css  %d 字节' % len(s.encode('utf-8')))


if __name__ == '__main__':
    main()
