# -*- coding: utf-8 -*-
"""一次性：把官网 dist 同步到 v1.1.61 水墨云图浅色 + 彩蛋 v2。

只动三处：design/sketch/site-style.css（唯一 CSS 真源）、
server/pages/dist/index.html（正文）、server/pages/dist/_worker.js（BUILD）。
内联 <style> 段由 tools/apply_site_style.py 之后同步，本脚本不碰。

硬约束：不重定义 :root 8 个 NOVA_PAIRS / dark 19 个 DARK_PAIRS 令牌（同源锁）。
浅色层只在 prefers-color-scheme:light 命中且不带 !important → 深色档 0 影响；
深预览副本里末尾无条件 dark 规则（带 !important）天然胜出。
幂等：检测到 #ink 已存在就整体跳过。
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSS = os.path.join(ROOT, 'design', 'sketch', 'site-style.css')
HTML = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')
WORK = os.path.join(ROOT, 'server', 'pages', 'dist', '_worker.js')


def rd(p):
    return io.open(p, encoding='utf-8').read()


def wr(p, s):
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


def sub1(text, old, new, tag):
    n = text.count(old)
    if n != 1:
        raise SystemExit('FAIL %s: anchor hit %d times (want 1)' % (tag, n))
    return text.replace(old, new, 1)


INK_DARK = """  /* v1.1.61 ink highlight: dark tier keeps the violet-night medium */
  #ink .ink-card{background:linear-gradient(180deg,rgba(42,32,72,.92),rgba(30,22,56,.92)) !important;
    border-color:rgba(183,155,255,.2) !important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 3px 0 rgba(0,0,0,.5) !important}
  #ink .ink-card h3{color:var(--ink) !important}
  #ink .ink-card p{color:var(--ink2) !important}
  #ink .ink-card .ink-seal{background:rgba(158,140,255,.14) !important;
    border-color:rgba(158,140,255,.35) !important;color:var(--cyan) !important}
  #ink .ink-tags span{background:rgba(158,140,255,.10) !important;
    border-color:rgba(183,155,255,.25) !important;color:var(--ink2) !important}
  #ink .ink-foot{color:var(--ink3) !important;border-top-color:rgba(183,155,255,.2) !important}
  #ink .ink-foot b{color:var(--coral) !important}
"""

INK_BLOCK = """/* ============================================================
 * v1.1.61 "Ink Cloud / Hua-qing Yun-shui" site light tier
 * mirrors App nova-ink.css. :root NOVA_PAIRS + dark DARK_PAIRS untouched.
 * #ink structure is unconditional; light palette only under
 * prefers-color-scheme:light and WITHOUT !important, so the dark
 * preview's trailing unconditional dark rules (with !important) win.
 * ============================================================ */
#ink .ink-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:14px}
#ink .ink-card{position:relative;padding:18px 18px 16px;border-radius:12px;
  border:1px solid rgba(28,43,48,.13);border-top:3px solid #2E6E76;
  background:linear-gradient(180deg,#FCFDFC,#F1F6F3);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 3px 0 rgba(28,43,48,.10)}
#ink .ink-card:nth-child(2){border-top-color:#B23A2E}
#ink .ink-card:nth-child(3){border-top-color:#C9A24B}
#ink .ink-card h3{margin:0 0 8px;font:700 15px var(--sans);letter-spacing:.4px;color:#1C2B30}
#ink .ink-card p{margin:0;font-size:13px;line-height:1.7;color:#4C6068}
#ink .ink-card .ink-seal{display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:50%;margin-bottom:12px;
  background:rgba(46,110,118,.10);border:1px solid rgba(46,110,118,.30);
  color:#2E6E76;font:16px var(--mono)}
#ink .ink-tags{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0;list-style:none}
#ink .ink-tags span{font:700 10.5px var(--mono);letter-spacing:.5px;
  padding:5px 10px;border-radius:4px;
  background:rgba(46,110,118,.07);border:1px solid rgba(46,110,118,.20);color:#33474D}
#ink .ink-foot{margin:18px 0 0;padding-top:14px;font-size:12.5px;line-height:1.7;
  color:#5B6E76;border-top:1px dashed rgba(28,43,48,.16)}
#ink .ink-foot b{color:#B23A2E}
@media (max-width:520px){#ink .ink-grid{grid-template-columns:1fr}}

@media (prefers-color-scheme:light){
  body{
    background-color:#EDF0EC;
    background-image:
      radial-gradient(ellipse 82% 26% at 12% 2%,  rgba(46,110,118,.13), transparent 68%),
      radial-gradient(ellipse 70% 20% at 92% 26%, rgba(46,110,118,.09), transparent 70%),
      radial-gradient(ellipse 90% 22% at 4% 66%,  rgba(38,54,60,.08), transparent 72%),
      radial-gradient(ellipse 78% 20% at 96% 92%, rgba(46,110,118,.07), transparent 72%),
      repeating-linear-gradient(96deg,rgba(28,43,48,.014) 0 1px,transparent 1px 6px),
      linear-gradient(180deg,#F3F1EA 0%,#EAEDE9 55%,#E1E7E4 100%);
    color:#1C2B30;
  }
  body::before{background:linear-gradient(90deg,rgba(46,110,118,.10),rgba(46,110,118,.02),transparent)}
  .brand-txt h1{color:#1C2B30}
  .brand-txt p{color:#4C6068}
  .hero-copy h2{color:#1C2B30}
  .hero-copy h2 em{color:#B23A2E;background:linear-gradient(transparent 62%,rgba(46,110,118,.20) 62%)}
  .hero-copy .lead{color:#4C6068}
  .pill{background:rgba(252,253,252,.82);border-color:rgba(28,43,48,.16);
    color:#33474D;box-shadow:0 3px 0 rgba(28,43,48,.10)}
  .pill b{color:#B23A2E}
  .sec-h{color:#1C2B30}
  .sec-h::before{color:#B23A2E}
  .sec-p{color:#5B6E76}
  .fcard{background:linear-gradient(180deg,#FCFDFC,#F1F6F3);
    border-color:rgba(28,43,48,.13);border-left-color:#2E6E76;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 3px 0 rgba(28,43,48,.10)}
  .fcard:nth-child(4n+2){border-left-color:#B23A2E}
  .fcard:nth-child(4n+3){border-left-color:#7C5CFF}
  .fcard:nth-child(4n+4){border-left-color:#C9A24B}
  .fcard .ic{background:rgba(46,110,118,.10);border-color:rgba(46,110,118,.30);color:#2E6E76}
  .fcard h3{color:#1C2B30}
  .fcard p{color:#4C6068}
  .step{background:rgba(252,253,252,.86);border-color:rgba(28,43,48,.13);
    color:#4C6068;box-shadow:0 3px 0 rgba(28,43,48,.10)}
  .step::before{background:linear-gradient(180deg,#33474D,#26363C);
    color:#EAF2EF;border-color:rgba(201,162,75,.5)}
  .step b{color:#1C2B30}
  details{background:rgba(252,253,252,.86);border-color:rgba(28,43,48,.13);
    box-shadow:0 3px 0 rgba(28,43,48,.10)}
  details[open] summary{background:rgba(46,110,118,.08)}
  details summary::after{color:#B23A2E}
  details .body{color:#4C6068;border-top-color:rgba(28,43,48,.14)}
  .phone{border-color:rgba(46,110,118,.35);background:#F3F1EA;
    box-shadow:0 8px 20px rgba(28,43,48,.20)}
  .shots-cap{color:#5B6E76}
  .contact{background:linear-gradient(165deg,#ECE7DA,#DFDED2);
    border-color:rgba(28,43,48,.28);color:#43382A;box-shadow:0 5px 0 rgba(28,43,48,.20)}
  .contact::before{background:linear-gradient(180deg,#40565C,#26363C)}
  .contact::after{color:#EAF2EF}
  .contact h2{color:#1C2B30}
  .contact .sub{color:#5B6E76}
  .clink{background:rgba(252,253,252,.78);border-color:rgba(28,43,48,.24)}
  .clink .ci{background:#33474D;color:#EAF2EF}
  .clink .ct span{color:#5B6E76}
  .clink .arr{color:#B23A2E}
  footer{border-top-color:rgba(28,43,48,.14);color:#5B6E76}
  footer .fl a{color:#4C6068}
  footer .fl a:hover{color:#B23A2E}
}
"""

INK_SECTION = """  <!-- ================= v1.1.61: this build - Ink Cloud ================= -->
  <section id="ink">
    <h2 class="sec-h">这一版 · 水墨云图</h2>
    <p class="sec-p">浅色档换成了「花青云水」：宣纸米白打底，花青淡墨一层层晕开，
      墨蓝石板顶栏压住却不发黑，瓷白课程卡浮在纸面上。只动浅色，经典和深色一点没改。</p>
    <div class="ink-grid">
      <div class="ink-card">
        <div class="ink-seal">印</div>
        <h3>宣纸上的课表</h3>
        <p>三层花青晕染加一层细纸纤维，今天所在列点一抹朱砂。时间刻度与课程卡共用一条基准线，
          窄列也不裁字；切周和拖动的动画都归到一帧里算，连点不卡。</p>
      </div>
      <div class="ink-card">
        <div class="ink-seal">8</div>
        <h3>两个像素小伙伴</h3>
        <p>马里奥和林克住在课表底部的空带，八种姿势会眨眼、走步、跳、挥手、欢呼。
          气泡里每人十二句英中双语台词，还有稀有句和两人拌嘴，会跟着这一节课的状态接话。</p>
      </div>
      <div class="ink-card">
        <div class="ink-seal">&#9834;</div>
        <h3>点一下就出声</h3>
        <p>点马里奥会响一句八位电子音的「Ma-ri-o!」，全是本机合成、断网也有。
          连击攒金币、六枚成就、台词图鉴、长按切静音，进度都记在本机，慢慢玩不容易腻。</p>
      </div>
    </div>
    <div class="ink-tags">
      <span>8 POSES</span><span>24 + 6 QUOTES</span><span>EN / 中</span>
      <span>8-BIT SFX</span><span>COMBO · COINS · ACHIEVEMENTS</span><span>OFFLINE</span>
    </div>
    <p class="ink-foot"><b>不挡事：</b>小人只在万象舱的课表页出现，中间给铭牌和底部五个入口让路；
      系统开了「减少动态效果」时，动作、粒子和弹字全停下，只留静态台词。</p>
  </section>

"""

FAQ_NEW = """    </details>

    <details>
      <summary>浅色界面怎么变样了 / 课表里那两个小人是什么</summary>
      <div class="body">
        <p>浅色档这一版换成了水墨云图的「花青云水」配色，宣纸底加花青晕染；经典皮肤和深色档都还在，设置里随时切回去。</p>
        <p>课表底部那两个像素小人是彩蛋：点一下会换个动作、说一句带翻译的台词，还会响一声八位电子音。连击攒金币、集台词图鉴、解成就，长按可以关掉音效。系统开了「减少动态效果」它们就安静待着，不挡课表也不挡按钮。</p>
      </div>
    </details>
  </section>"""


def main():
    html = rd(HTML)
    if 'id="ink"' in html:
        print('note  already applied (#ink exists), skip - idempotent')
        return 0

    # ---- 1) CSS truth source: dark-tier #ink overrides + trailing light tier ----
    css = rd(CSS)
    step_line = "  .steps .step::before{background:linear-gradient(180deg,var(--cyan),#6D57D8) !important;color:#120C22 !important}"
    css = sub1(css, step_line + "\n}\nbody{",
               step_line + "\n" + INK_DARK + "}\nbody{", 'CSS dark tier')
    css = css.rstrip('\n') + '\n' + INK_BLOCK
    wr(CSS, css)
    print('ok  site-style.css  +ink dark overrides +light tier (%d chars)' % len(css))

    # ---- 2) index.html body ----
    html = sub1(html,
                u'针对河南医药大学做的，不是通用模板。',
                u'针对河南医药大学做的，不是通用模板。这一版浅色换成了水墨云图，课表底部还住了两个会说话的像素小伙伴。',
                'hero lead')
    html = sub1(html,
                u'alt="课表页：切角舷窗、七列舱格、周次传送带"',
                u'alt="课表页：宣纸花青浅色、周次传送带、底部两个像素小伙伴"',
                'shot-kb alt')
    html = sub1(html,
                u'alt="学习页：磁带门打开，作业与考试卷宗铺满"',
                u'alt="学习页：磁带门卷宗，作业与考试分面"',
                'shot-learn alt')
    html = sub1(html,
                u'alt="校园页：热水票券、校园剪报、照片墙"',
                u'alt="校园页：热水票、校园剪报、照片墙"',
                'shot-water alt')
    html = sub1(html,
                u'界面示意图（按 App 真实结构绘制，非真机截图）',
                u'界面示意图（按 App 浅色档真实结构绘制，非真机截图）',
                'shots cap')
    html = sub1(html,
                u'  <!-- ================= 万象舱：另一套界面 ================= -->\n  <section id="nova">',
                INK_SECTION + u'  <!-- ================= 万象舱：另一套界面 ================= -->\n  <section id="nova">',
                'ink section insert')
    html = sub1(html,
                u'        <p>所有数据以学校教务系统为准；遇到成绩、选课、评教这类正式事务，一律以官方系统为准。</p>\n      </div>\n    </details>\n  </section>',
                u'        <p>所有数据以学校教务系统为准；遇到成绩、选课、评教这类正式事务，一律以官方系统为准。</p>\n      </div>\n' + FAQ_NEW,
                'FAQ new details')
    wr(HTML, html)
    print('ok  index.html  body synced (%d chars)' % len(html))

    # ---- 3) worker BUILD: invalidate edge cache ----
    wk = rd(WORK)
    wk = sub1(wk, "const BUILD = 'v1.1.61-nova';",
              "const BUILD = 'v1.1.61-ink-nova';", 'worker BUILD')
    wr(WORK, wk)
    print('ok  _worker.js  BUILD -> v1.1.61-ink-nova')

    print('NEXT  python -X utf8 tools/apply_site_style.py')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
