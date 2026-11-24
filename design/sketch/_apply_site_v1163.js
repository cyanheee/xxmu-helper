'use strict';
/* One-shot: 官网首页正文同步到 v1.1.63（WIKI 相册横滑翻页 + 留言板翻页 + 暗房木夹麻绳晾相）。
 * 只动 <body> 文案 + 一条 HTML 注释；<style> 内联块一个字不碰（site-style.css 真源仍逐字一致）。
 * 名单校准 / 教务绑定是管理员侧功能，学生不该在官网看到 —— 一个字都不写。
 * 保留全部既有门禁命中串：id=ink / 水墨云图 / 花青云水 / 像素小伙伴 / 点一下就出声 /
 * 三张 img/shot-*.svg / 示意图 / 四关键词（周次传送带·磁带门·波段拨盘·万象舱）/ id=nova /
 * id=fresh / 联系方式 692962849 · 1097668324 · GitHub 绝对链接 / 版本不写死。
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

/* 1) Hero lead：把 v1.1.62 那句换成本版相册翻页，水墨云图/像素小伙伴原句一字不改 */
sub('        针对河南医药大学做的，不是通用模板。这一版浅色换成了水墨云图，课表底部还住了两个会说话的像素小伙伴。\n        空调房间现在认得更准、套间 A / B 也选得到，校园实景和留言板还会自己更新。',
    '        针对河南医药大学做的，不是通用模板。这一版浅色换成了水墨云图，课表底部还住了两个会说话的像素小伙伴。\n        校园相册和留言板现在能左右翻页了，照片像晾在老式洗相片店里的相片，一屏摆得下四张。',
    'Hero lead 换成 v1.1.63 相册翻页');

/* 2) #fresh 亮点区三张卡：从 v1.1.62 空调/自动更新/学号 换成 v1.1.63 相册/留言/两档配色 */
const FRESH_OLD = String.raw`  <!-- ================= v1.1.62：这一版 · 用着更顺手 ================= -->
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
  </section>`;

const FRESH_NEW = String.raw`  <!-- ================= v1.1.63：这一版 · 相册能翻页了 ================= -->
  <section id="fresh">
    <h2 class="sec-h">这一版 · 相册能翻页了</h2>
    <p class="sec-p">水墨云图和像素小伙伴都留着，这一版把校园相册和留言板改成了左右翻页，像在洗相片店里翻一沓照片。</p>
    <div class="feat">
      <div class="fcard">
        <div class="ic">&#128247;</div>
        <h3>校园实景一屏四张，能左右翻</h3>
        <p>照片墙不再是一长条往下拖，改成一屏摆四张、左右翻页，边上还会露出一点点上一页下一页。
          每张都像老式洗相片店里那样，用小木夹夹着晾在麻绳上，微微有点歪，底下配一行小字。</p>
      </div>
      <div class="fcard">
        <div class="ic">&#128221;</div>
        <h3>留言板一屏三条，跟着翻</h3>
        <p>留言也换成了同款翻页，一屏三条，底下一排小圆点告诉你在第几页。管理员回复过的留言照旧跟着显示，
          想加功能、发现 bug、资料有错，都还能在这里说，不用加群。</p>
      </div>
      <div class="fcard">
        <div class="ic">&#127912;</div>
        <h3>浅色深色都单独调过</h3>
        <p>浅色是米白纸面透一点雾光紫，深色是紫夜舱里配紫色木夹和圆点，两张都让白相纸清清楚楚；
          字不压字、不裁角，白天晚上翻起来都顺手。</p>
      </div>
    </div>
  </section>`;
sub(FRESH_OLD, FRESH_NEW, '#fresh 三张卡换成 v1.1.63');

/* 3) FAQ 末尾补一条相册翻页；保留空调 / 自动更新两条（功能仍在） */
const FAQ_TAIL = String.raw`    <details>
      <summary>新通过的校园图片 / 新留言，我没退出软件能看到吗</summary>
      <div class="body">
        <p>能。停在 WIKI 页每隔几分钟会自动对一次，从后台切回 App 也会顺手更新，两处右上角各有「刷新」按钮可以手动拉。不用退出重进。</p>
      </div>
    </details>
  </section>`;
const FAQ_NEW = String.raw`    <details>
      <summary>新通过的校园图片 / 新留言，我没退出软件能看到吗</summary>
      <div class="body">
        <p>能。停在 WIKI 页每隔几分钟会自动对一次，从后台切回 App 也会顺手更新，两处右上角各有「刷新」按钮可以手动拉。不用退出重进。</p>
      </div>
    </details>

    <details>
      <summary>校园相册 / 留言板怎么翻页，照片为什么有小夹子</summary>
      <div class="body">
        <p>手指左右划就能翻，一屏四张照片、三条留言，两边会露出一点相邻页，底下小圆点标着当前第几页。
          照片用木夹夹在麻绳上、微微歪着，是照着老式洗相片店晾相片的样子做的，浅色深色各有各的配色。</p>
      </div>
    </details>
  </section>`;
sub(FAQ_TAIL, FAQ_NEW, 'FAQ 补相册翻页一条');

/* 落盘前自检：新关键串齐、旧断言串仍在、绝不写死版本号、不含管理员/名单内部词 */
['id="fresh"', '这一版 · 相册能翻页了', '一屏摆得下四张', '校园实景一屏四张', '留言板一屏三条',
 '浅色深色都单独调过', '小木夹', '麻绳', '小圆点', '怎么翻页',
 'id="ink"', '水墨云图', '花青云水', '像素小伙伴', '点一下就出声',
 '周次传送带', '磁带门', '波段拨盘', '万象舱', 'id="nova"',
 '692962849', '1097668324', 'https://github.com/cyanheee/xxmu-helper'].forEach(function (k) {
  if (s.indexOf(k) < 0) throw new Error('missing key: ' + k);
});
if (/id="mVer">v[\d.]+</.test(s)) throw new Error('版本号被写死了');
for (const w of ['校准', '教务绑定', '管理员后台', 'cfg.latest', 'oddRows', '手填学号']) {
  if (s.indexOf(w) >= 0) throw new Error('官网正文混进了内部词：' + w);
}
console.log('ok  自检：新内容齐 / 旧断言串仍在 / 版本未写死 / 无管理员内部词');

fs.writeFileSync(file, s, 'utf8');
console.log('DONE  官网正文同步到 v1.1.63  (' + s.length + ' chars)');
