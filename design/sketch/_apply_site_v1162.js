'use strict';
/* One-shot: 把官网首页正文同步到 v1.1.62（空调防呆/AB 套间 + 校园实景·留言板自动更新 + 学号对齐）。
 * 只动 <body> 文案；<style> 内联块一个字不碰（site-style.css 真源仍逐字一致）。
 * 保留全部既有断言命中串：id=ink / 水墨云图 / 花青云水 / 像素小伙伴 / 点一下就出声 /
 * 三张 img/shot-*.svg / 示意图 / 四关键词（周次传送带·磁带门·波段拨盘·万象舱）/ id=nova /
 * 联系方式 692962849 · 1097668324 · GitHub 绝对链接 / 版本不写死。
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const file = path.join(root, 'server', 'pages', 'dist', 'index.html');
let s = fs.readFileSync(file, 'utf8');

function sub(old, neu, label) {
  const n = s.split(old).length - 1;
  if (n !== 1) throw new Error(label + ': expected exactly 1 hit, got ' + n);
  s = s.replace(old, neu);
  console.log('ok  ' + label);
}

/* 1) Hero lead 追加一句学生可感知的本版改动，原句一字不改（水墨云图/像素小伙伴仍在） */
const LEAD = '        针对河南医药大学做的，不是通用模板。这一版浅色换成了水墨云图，课表底部还住了两个会说话的像素小伙伴。';
sub(LEAD,
    LEAD + '\n        空调房间现在认得更准、套间 A / B 也选得到，校园实景和留言板还会自己更新。',
    'Hero lead 补 v1.1.62 一句');

/* 2) 在万象舱 section 之前插一整个 v1.1.62 亮点区（复用 .feat/.fcard 现成样式，无需改 CSS） */
const NOVA = '  <!-- ================= 万象舱：另一套界面 ================= -->';
const FRESH = String.raw`  <!-- ================= v1.1.62：这一版 · 用着更顺手 ================= -->
  <section id="fresh">
    <h2 class="sec-h">这一版 · 用着更顺手</h2>
    <p class="sec-p">水墨云图和像素小伙伴都留着，这一版把大家最近反馈的几个小别扭一并收拾了。</p>
    <div class="feat">
      <div class="fcard">
        <div class="ic">&#10052;</div>
        <h3>空调度数认得准了</h3>
        <p>入口卡把现在绑的校区、公寓、房间号写清楚，一眼就看出是不是自己那间；
          房间不对就换，不用再对着别人的度数纳闷。南校区 2 号公寓那样的套间，
          A / B 宿舍也全列出来，选得到、排得顺，带字母的房号不会再漏。</p>
      </div>
      <div class="fcard">
        <div class="ic">&#128257;</div>
        <h3>校园实景和留言板会自己更新</h3>
        <p>停在 WIKI 这一页，每隔几分钟就悄悄对新内容；从后台切回来也会顺手更一次，
          右上角还各多了一个「刷新」。不用退出重进软件，新通过的校园图片、新留言自己就冒出来；
          内容没变时不重新排版，正在搜的东西不会被打断。</p>
      </div>
      <div class="fcard">
        <div class="ic">&#127891;</div>
        <h3>学号跟教务网对得上了</h3>
        <p>之前手填错、格式不对的学号，重新登录一次教务就会自动换成教务网那个，
          不用手动改，也不用担心两处记成不一样的人。</p>
      </div>
    </div>
  </section>

`;
sub(NOVA, FRESH + NOVA, '插入 v1.1.62 亮点区 #fresh');

/* 3) FAQ 末尾补两条（空调度数 / 不用退出重进就能看到新内容） */
const FAQ_TAIL = String.raw`        <p>课表底部那两个像素小人是彩蛋：点一下会换个动作、说一句带翻译的台词，还会响一声八位电子音。连击攒金币、集台词图鉴、解成就，长按可以关掉音效。系统开了「减少动态效果」它们就安静待着，不挡课表也不挡按钮。</p>
      </div>
    </details>
  </section>`;
const FAQ_NEW = String.raw`        <p>课表底部那两个像素小人是彩蛋：点一下会换个动作、说一句带翻译的台词，还会响一声八位电子音。连击攒金币、集台词图鉴、解成就，长按可以关掉音效。系统开了「减少动态效果」它们就安静待着，不挡课表也不挡按钮。</p>
      </div>
    </details>

    <details>
      <summary>空调剩余度数看着不对 / 我这是套间 AB 宿舍</summary>
      <div class="body">
        <p>入口卡上会写当前绑的是哪个校区、哪间房。多半是绑到了别的校区或别的房间，点「房间不对就换」重新选一次就好。</p>
        <p>南校区 2 号公寓那类套间的 A / B 宿舍这一版都列全了，带字母的房号也能正常选到。</p>
      </div>
    </details>

    <details>
      <summary>新通过的校园图片 / 新留言，我没退出软件能看到吗</summary>
      <div class="body">
        <p>能。停在 WIKI 页每隔几分钟会自动对一次，从后台切回 App 也会顺手更新，两处右上角各有「刷新」按钮可以手动拉。不用退出重进。</p>
      </div>
    </details>
  </section>`;
sub(FAQ_TAIL, FAQ_NEW, 'FAQ 补空调/自动更新两条');

/* 落盘前自检：新关键串齐、旧断言串仍在、绝不写死版本号 */
['id="fresh"', '房间不对就换', '套间', '会自己更新', '学号跟教务网对得上了',
 '新通过的校园图片', 'id="ink"', '水墨云图', '花青云水', '像素小伙伴',
 '点一下就出声', '周次传送带', '磁带门', '波段拨盘', '万象舱',
 '692962849', '1097668324'].forEach(function (k) {
  if (s.indexOf(k) < 0) throw new Error('missing key: ' + k);
});
if (/id="mVer">v[\d.]+</.test(s)) throw new Error('版本号被写死了');
console.log('ok  自检：新内容齐 / 旧断言串仍在 / 版本未写死');

fs.writeFileSync(file, s, 'utf8');
console.log('DONE  官网正文同步到 v1.1.62  (' + s.length + ' chars)');
