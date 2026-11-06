/* 发版说明/公告的「学生视角」检查（v1.1.46）
 *
 *   node tools/check_notes.js [--file apk/vX.Y.Z.notes.txt]
 *
 * 用户原话：「更新公告我说了，不要显示管理员需要注意的事项」。
 * 以前 apk/v1.1.43.notes.txt 里夹着「这几版之前只留了本地包，没发给学生」
 * 「真机上还有几处我没验到」「截图发我」「线上仍是…学生不会收到更新提示」——
 * 那全是写给管理员/自己看的运维话，学生点「去下载」看到只会莫名其妙。
 * 规则（用户纠正过三次）：累积汇总、管理员功能不写、自己的 bug 老实写，
 * 再加这一条：**不写内部过程、不写没验到、不写「找我/发截图/点头」**。
 *
 * 判断落在「学生视角」上，不靠人记：禁用词表 + 结构检查，命中就 exit 1。
 * 这条检查被 check_web.js 和 release_all.py 预检调用，漏了发不出去。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

/** 学生不该看到的话。每一条都对应真实写错过的一句。 */
const BANNED = [
  ['只留了本地包', '发版过程（本地包）'],
  ['没发给学生', '发版过程（没发）'],
  ['没上线', '发版过程（上线状态）'],
  ['不会收到更新提示', '发版过程（推送状态）'],
  ['线上仍是', '运维状态（线上版本）'],
  ['我没验到', '内部验收状态'],
  ['还需要装上确认', '内部验收状态'],
  ['真机未验', '内部验收状态'],
  ['截图发我', '对管理员说的求助语'],
  ['得你点头', '对管理员说的决策语'],
  ['等用户点头', '对管理员说的决策语'],
  ['管理员需要注意', '明确的管理员视角'],
  ['管理员后台', '管理员功能'],
  ['KV', '服务端内部名词'],
  ['cfg.latest', '服务端内部名词'],
  ['GitHub', '发布渠道内部名词'],
  ['官网', '发布渠道内部名词'],
  ['出包', '构建过程'],
  ['publish_apk', '工具名'],
  ['release_all', '工具名'],
  ['本次提交', '研发过程'],
  ['真机上的观感', '内部验收状态'],
];

function files() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--file');
  if (i >= 0 && argv[i + 1]) return [argv[i + 1]];
  const d = path.join(root, 'apk');
  const all = fs.readdirSync(d)
    .filter(f => /^v\d+\.\d+\.\d+\.notes\.txt$/.test(f))
    .sort((a, b) => {
      const pa = a.match(/\d+/g).map(Number), pb = b.match(/\d+/g).map(Number);
      for (let k = 0; k < 3; k++) if (pa[k] !== pb[k]) return pb[k] - pa[k];
      return 0;
    })
    .map(f => 'apk/' + f);
  /* 默认只查「这次要发的那一份」：早期 notes 是历史档案，
   * 那时还没定「结尾必须有群号」的规矩，全扫会制造一堆假红
   * （第一版就扫出 14 条，全是历史文件）。--all 才做全量体检。 */
  return argv.indexOf('--all') >= 0 ? all : all.slice(0, 1);
}

console.log('发版说明 · 学生视角检查');
const list = files();
ok(list.length > 0, '找到 notes 文件', list.length);

list.forEach(rel => {
  const s = read(rel);
  const hits = BANNED.filter(p => s.indexOf(p[0]) >= 0);
  console.log('\n  ' + rel + '（' + s.length + ' 字）');
  ok(hits.length === 0, '没有管理员/内部视角的话',
    hits.map(h => h[0] + '（' + h[1] + '）').join('、'));
  ok(/更新群[：:]\s*\d+/.test(s), '结尾有更新群号');
  ok(!/^\s*[-*]\s/m.test(s), '没有 Markdown 项目符号（App 里是纯文本弹层）');
});

/* 公告正文与更新说明是两套东西，别混。 */
console.log('\n公告与更新说明分离');
const app = read('web/app.js');
ok(/cfg\.notice/.test(app) && /la\.notes/.test(app),
  '前端分别读 notice（公告）与 latest.notes（更新说明）');
ok(/updNotes'\)\.textContent = la\.notes/.test(app), '更新弹窗只显示 latest.notes');

console.log('\n' + (bad === 0
  ? '[PASS] 发版说明 ' + total + ' 项全过'
  : '[FAIL] ' + bad + '/' + total + ' 项未过（学生不该看到管理员事项）'));
process.exit(bad === 0 ? 0 : 1);
