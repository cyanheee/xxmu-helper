/* One-shot (QA/publish docs): sync GitHub-facing content to v1.1.62.
 * UTF-8 in, UTF-8 out; preserve the file's original CRLF/LF convention.
 * Every replacement must hit EXACTLY once, otherwise abort without writing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function apply(file, pairs) {
  const p = path.join(root, file);
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.indexOf('\r\n') >= 0;
  let s = raw.replace(/\r\n/g, '\n');
  let bad = 0;
  pairs.forEach(function (pr, i) {
    const o = pr[0], n = pr[1];
    const c = s.split(o).length - 1;
    if (c !== 1) {
      console.log('  MISS #' + i + '  count=' + c + '  ::  ' + o.slice(0, 46).replace(/\n/g, '|'));
      bad++;
    } else {
      s = s.replace(o, n);
    }
  });
  if (bad) {
    console.log('  ABORT ' + file + ' (' + bad + ' misses) - nothing written');
    process.exitCode = 1;
    return;
  }
  const out = crlf ? s.replace(/\n/g, '\r\n') : s;
  fs.writeFileSync(p, out, 'utf8');
  console.log('  OK  ' + file + '   ' + pairs.length + ' replacements   ' +
    Buffer.byteLength(out, 'utf8') + ' bytes   ' + (crlf ? 'CRLF' : 'LF'));
}

const R = 'README.md';
apply(R, [
  // 1) version badge
  ['[![Version](https://img.shields.io/badge/version-1.1.50-2563eb)](https://github.com/cyanheee/xxmu-helper/releases)',
   '[![Version](https://img.shields.io/badge/version-1.1.62-2563eb)](https://github.com/cyanheee/xxmu-helper/releases)'],

  // 2) caption under the three mockups
  ['<sub>界面示意图（按 App 真实结构绘制，非真机截图）</sub>',
   '<sub>界面示意图（按 App 真实结构绘制，非真机截图）· 当前为 v1.1.62「水墨云图」浅色皮肤，另有深色与最初的经典皮肤可切换</sub>'],

  // 3) Chinese "what this is" intro
  ['一个安卓 App，解决四件每天都要重复的小事：\n\n- 想知道**本周上什么课**，得登教务、找入口、等页面加载\n- 想知道**哪份作业快到期**，得挨个课程点进去翻\n- 想知道**现在哪间教室空着**，得手动比对课表\n- 想**接杯水**，得先扫码再在机器上按\n\n这几个动作本身不难，但一天要做好几次。这个 App 把它们合到一处。',
   '一个安卓 App，把几件每天都要重复的小事合到一处：\n\n- 想知道**本周上什么课**，得登教务、找入口、等页面加载\n- 想知道**哪份作业快到期**，得挨个课程点进去翻\n- 想知道**现在哪间教室空着**，得手动比对课表\n- 想**接杯水**，得先扫码再在机器上按\n- 想看**宿舍空调还剩多少度电**，得进完美校园一层层找自己那间房\n\n这几个动作本身不难，但一天要做好几次。课表、作业、空教室、接水、空调、校园资料现在都在同一个界面里。最近两版还换了「水墨云图」浅色皮肤，课表角落多了两位会动、会说话的像素小伙伴。'],

  // 4) Chinese download table: current release
  ['| 更新群 | QQ `1097668324` |\n\n> 在微信里打开会提示无法下载安装包，这是微信的限制。点右上角「···」→「在浏览器打开」，再点一次下载即可。',
   '| 更新群 | QQ `1097668324` |\n\n当前版本 **v1.1.62 / 1162**（2026-11-10）：空调入口卡会写明绑定的是哪间房、套间 AB 宿舍能选到、绑了多间房会列出来自己挑。上一版 v1.1.61 换的水墨云图浅色皮肤与像素小伙伴都还在。\n\n> 在微信里打开会提示无法下载安装包，这是微信的限制。点右上角「···」→「在浏览器打开」，再点一次下载即可。'],

  // 5) Chinese water wording -> honest safety-net wording
  ['但「停」是可以远程下发的，所以做了**定量放水**：选了最长放水（防忘关）之后，到量自动帮你发停止命令。三条限制写在界面上：到量到停阀有几秒延迟会多流一点；断网盯不住；一直没检测到出水会提醒你去按。',
   '但「停」是可以远程下发的，所以做了**最长放水（防忘关）**：设一个时长上限，到点自动帮你发停止命令。它是一道安全网，不是按毫升精确计量——官方页面并不向网页开放实时出水量。三条限制写在界面上：到点到停阀有几秒延迟会多流一点；断网盯不住；一直没检测到出水会提醒你去按。'],

  // 6) Chinese features: add aircon + look&feel
  ['**校园资料**\n\n学校常用入口、办事流程、联系方式归到一处，支持检索和本地新增。\n\n### 隐私',
   '**校园资料**\n\n学校常用入口、办事流程、联系方式归到一处，支持检索和本地新增。\n\n**宿舍空调**\n\n只读展示完美校园里自己那间房的剩余度数，缴费仍在完美校园里自己完成。这里不代办支付，也不换算单位，读数以缴费页为准、可能有延迟。\n\nv1.1.62 针对两条真实反馈做了防呆：入口卡直接印出**当前绑定的是哪间房**，绑错校区一眼能看出来，面板里也留了「换房间」的入口；官方把套间 AB 房（如 22514B）追加在房号列表末尾，以前按数字排序会沉底翻不到，现在改成自然排序、B 间紧跟主号并单独高亮；一个学号登记了多间空调房时，会全部列出来点选，不再默认拿第一间。\n\n**外观与彩蛋**\n\n浅色是「水墨云图 / 花青云水」：宣纸留白、花青淡墨晕染、朱砂印章点缀；深色与最初的经典皮肤都还在，设置里随时切换。课表角落有两位 8-bit 像素小伙伴，会走、会跳、会挥手，气泡里是英中双语台词，点一下马里奥会响一段合成的八位电子音。连击、金币、成就、图鉴、双人拌嘴这些小玩法都在本地跑，长按可以静音，系统开了「减少动态效果」就全部安静下来。它们只占课表底部左右两小块空地，不挡课程、不挡铭牌和底部五个标签。\n\n### 隐私'],

  // 7) Chinese FAQ: aircon mismatch
  ['<details>\n<summary><b>提示「版本过低」进不去</b></summary>',
   '<details>\n<summary><b>空调剩余度数和缴费页对不上</b></summary>\n\n先看入口卡上印的房间名是不是自己宿舍。最常见的原因是绑到了别的校区、别的公寓，或者同一层里另一间空调分表——两间房的数都是真的，只是不是同一间。点进面板用「换房间」重选一次即可。住在套间的同学注意选带 A / B 后缀的那一间，列表里已经按房号排好并单独标了颜色。\n</details>\n\n<details>\n<summary><b>提示「版本过低」进不去</b></summary>'],

  // 8) Chinese dev commands: add test_elec
  ['node tools/test_water.js\n\n# 打包\npython tools/build_apk.py',
   'node tools/test_water.js\nnode tools/test_elec.js\n\n# 打包\npython tools/build_apk.py'],

  // 9) English intro
  ['An Android app that folds four small, repetitive daily chores into one place:',
   'An Android app that folds several small, repetitive daily chores into one place:'],
  ['None of these is hard on its own, but you do them several times a day. This app puts them together.',
   'None of these is hard on its own, but you do them several times a day. This app puts them together — timetable, assignments, free classrooms, water, air conditioning and campus info in one place. Recent releases added the \u201cink-wash\u201d light skin and two animated pixel companions in the timetable corner.'],

  // 10) English download table
  ['| Update group | QQ `1097668324` |\n\n> Opening the page inside WeChat',
   '| Update group | QQ `1097668324` |\n\nCurrent release **v1.1.62 / 1162** (2026-11-10): the air-conditioning card now shows which room is bound, suite A/B rooms are selectable, and multiple registered rooms are listed for you to pick. The v1.1.61 ink-wash light skin and pixel companions are still there.\n\n> Opening the page inside WeChat'],

  // 11) English features: add aircon + look&feel
  ['**Campus info**\n\nCommon school entry points, procedures and contacts gathered in one place, with search and locally added entries.\n\n### Privacy',
   '**Campus info**\n\nCommon school entry points, procedures and contacts gathered in one place, with search and locally added entries.\n\n**Dormitory air conditioning**\n\nRead-only display of the remaining kWh for your own room, taken from the campus platform; payment still happens there. The unit is never converted and the reading may lag — treat the payment page as authoritative. As of v1.1.62 the card prints which room is bound (so a wrong campus is obvious at a glance), suite rooms such as 22514B sort next to their base number and are highlighted, and when a student ID has several registered rooms they are all listed to choose from instead of silently picking the first.\n\n**Look and feel**\n\nThe light skin is \u201cink wash / azure clouds\u201d: paper-white space, pale azurite washes, a touch of cinnabar red. The dark skin and the original classic skin are both still available. Two 8-bit pixel companions sit in the timetable corner; they walk, jump and wave, speak in bilingual bubbles, and tapping Mario plays a short synthesised chiptune. Combos, coins, achievements and a small collection run entirely offline; a long press mutes them and \u201creduce motion\u201d puts them to rest. They stay in two small gaps and never cover courses or the bottom tabs.\n\n### Privacy'],

  // 12) English water wording -> honest
  ['However, *stopping* can be issued remotely, so the app implements **measured dispensing**: pick a target volume and it sends the stop command for you once reached. Three limits are written into the UI: a few seconds of lag between target and valve closure means a little extra water; a network drop means it stops tracking; and if no water is detected at all, it reminds you to press the button.',
   'However, *stopping* can be issued remotely, so the app offers a **maximum run time (so you don\u2019t forget to switch it off)**: pick a time limit and it sends the stop command when that limit is reached. It is a safety net, not millilitre-accurate metering — the platform exposes no live flow reading to the web page. Three limits are written into the UI: a few seconds of lag before the valve closes means a little extra water; a network drop means it stops tracking; and if no water is detected at all, it reminds you to press the button.'],
  ['The platform only exposes an "unlock" API, with no remote valve control. The phone\'s capability ends at unlocking; starting the water requires pressing the button on the machine. Stopping *can* be done remotely, which is why setting a target volume lets it stop automatically.',
   'The platform only exposes an "unlock" API, with no remote valve control. The phone\'s capability ends at unlocking; starting the water requires pressing the button on the machine. Stopping *can* be done remotely, which is why setting a maximum run time lets it stop automatically as a safety net.'],

  // 13) English FAQ: aircon mismatch
  ['<details>\n<summary><b>It says "version too old" and won\'t let me in</b></summary>',
   '<details>\n<summary><b>The remaining kWh does not match the payment page</b></summary>\n\nCheck the room name printed on the entry card first. Most of the time it is bound to a different campus, building, or another air-conditioning sub-meter on the same floor — both readings are real, just for different rooms. Use \u201cchange room\u201d in the panel to pick again. If you live in a suite, pick the room with the A / B suffix; they are now sorted by number and highlighted.\n</details>\n\n<details>\n<summary><b>It says "version too old" and won\'t let me in</b></summary>'],

  // 14) English dev commands: add test_elec
  ['node tools/test_water.js\n\n# Build\npython tools/build_apk.py',
   'node tools/test_water.js\nnode tools/test_elec.js\n\n# Build\npython tools/build_apk.py'],
]);

const G = 'publish/GITHUB-发布指引.md';
apply(G, [
  // current-state banner on top
  ['# 把项目发布到 GitHub —— 操作指引\n\n> 仓库已经在本地初始化并提交完成（`git log` 能看到 `初始提交：河医大助手 v1.1.17`）。\n> 下面五步做完，它就在 GitHub 上了。全程不需要我这边，你自己点几下就行。',
   '# 把项目发布到 GitHub —— 操作指引\n\n> **2026-11-10 现状**：仓库已在 GitHub 上（`https://github.com/cyanheee/xxmu-helper`），本地路径是\n> `C:\\Users\\Administrator\\Desktop\\xxmuhelper\\xxmu-app`，当前代码版本 **v1.1.62 / 1162**。\n> 下面第 1～4 步是首次发布时的历史步骤，仓库建好之后可跳过；日常发版直接看第三节。\n> 作者联系方式：QQ `692962849`，邮箱 `692962849@qq.com`，更新群 `1097668324`。\n>\n> 仓库已经在本地初始化并提交完成（`git log` 能看到 `初始提交：河医大助手 v1.1.17`）。\n> 下面五步做完，它就在 GitHub 上了。全程不需要我这边，你自己点几下就行。'],

  // username is settled
  ['建议用户名申请成 `gugu-xxmu` 或类似的，别用纯数字。',
   '用户名已确定为 `cyanheee`，仓库地址就是 `https://github.com/cyanheee/xxmu-helper`。'],

  // two stale cd paths (distinct contexts)
  ['cd "D:\\dsh\\DSH Desktop\\xxmu-app"\n\n# 把 <你的用户名> 换成你的 GitHub 用户名',
   'cd "C:\\Users\\Administrator\\Desktop\\xxmuhelper\\xxmu-app"\n\n# 把 <你的用户名> 换成你的 GitHub 用户名'],
  ['cd "D:\\dsh\\DSH Desktop\\xxmu-app"\n\n# 1. 先扫一遍，确认没带进敏感文件',
   'cd "C:\\Users\\Administrator\\Desktop\\xxmuhelper\\xxmu-app"\n\n# 1. 先扫一遍，确认没带进敏感文件'],

  // Release example
  ['| Tag | `v1.1.17` |\n| Title | `v1.1.17 —— 换自有域名 + 官网` |\n| 附件 | 上传 `apk/xxmu-helper-v1.1.17.apk` |\n| 说明 | 复制 `apk/v1.1.17.notes.txt` 的内容 |',
   '| Tag | `v1.1.62` |\n| Title | `v1.1.62 —— 空调好认房了 + 套间 AB 可选项` |\n| 附件 | 上传 `apk/xxmu-helper-v1.1.62.apk` |\n| 说明 | 复制 `apk/v1.1.62.notes.txt` 的内容 |'],

  // recurring commit example
  ['git commit -m "v1.1.18: 说明这次改了什么"',
   'git commit -m "v1.1.62: 说明这次改了什么"'],
]);
