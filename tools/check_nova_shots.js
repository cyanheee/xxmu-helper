/* check_nova_shots.js - guard for the NOVA organ QA screenshots.
 *
 * The bug it exists to catch: two different organ states produced the SAME
 * bytes. `organ-swipe-light.png` was byte-identical to `organ-belt-light.png`
 * because the fixture hid #sheet (the brush-ticket organ lives in #sh-body)
 * and headless virtual time never advances CSS animations. The swipe state
 * silently degraded into "the ordinary timetable page" and nobody noticed,
 * because the file existed and was non-blank.
 *
 * So the rule is: every organ state must be a DISTINCT image.
 *
 *   node tools/check_nova_shots.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'design', 'sketch', 'shots');

/* tag -> what the shot is supposed to prove */
const ORGAN_SHOTS = [
  ['organ-belt-light.png', '课表页浅色档（传送带 + 舷窗）'],
  ['organ-belt-dark.png', '课表页深色档（紫夜舱）'],
  ['organ-tape-light.png', '学习页磁带门打开态（浅色）'],
  ['organ-tape-dark.png', '学习页磁带门打开态（深色）'],
  ['organ-tapeb-light.png', '磁带门 B 面 · 考试（浅色）'],
  ['organ-tapeb-dark.png', '磁带门 B 面 · 考试（深色）'],
  ['organ-wiki-light.png', 'WIKI 页剪报抽屉'],
  ['organ-wiki-dark.png', 'WIKI 页剪报抽屉（深色）'],
  ['organ-campus-light.png', '校园事务页票券闸门'],
  ['organ-campus-dark.png', '校园事务页票券闸门（深色）'],
  ['organ-swipe-light.png', '饮水机刷票器官'],
  ['organ-me-light.png', '我的页设备铭牌舱（浅色）'],
  ['organ-me-dark.png', '我的页设备铭牌舱（深色）'],
  ['organ-new-features.png', '成绩卷宗 + 指令终端'],
  ['organ-focus-light.png', '专注仪表半框（浅色）'],
  ['organ-focus-dark.png', '专注仪表半框（深色）'],
  ['organ-settings-light.png', '设置页皮肤开关（万象舱）'],
  ['organ-settings-dark.png', '设置页皮肤开关（紫夜舱）'],
  ['organ-settings-classic.png', '设置页皮肤开关（经典皮肤未破）'],
  ['organ-settings-classic-dark.png', '设置页皮肤开关（经典皮肤深色未破）'],
  ['organ-clipopen-light.png', '剪报抽屉打开态（浅色）'],
  ['organ-clipopen-dark.png', '剪报抽屉打开态（深色）'],
  ['organ-ticketbound-light.png', '票券闸门绑定态（浅色）'],
  ['organ-ticketbound-dark.png', '票券闸门绑定态（深色）'],
  ['organ-mebound-light.png', '设备铭牌舱已登录态（浅色）'],
  ['organ-mebound-dark.png', '设备铭牌舱已登录态（深色）'],
  ['detail-kb-light.png', '细节打磨层 · 课表页（浅色）'],
  ['detail-kb-dark.png', '细节打磨层 · 课表页（深色=调节板）'],
  ['detail-campus-light.png', '细节打磨层 · 校园页（浅色）'],
  ['detail-campus-dark.png', '细节打磨层 · 校园页（深色）'],
  ['detail-me-light.png', '细节打磨层 · 我的页（浅色）'],
  ['detail-me-dark.png', '细节打磨层 · 我的页（深色）'],
  ['detail-pop-light.png', '细节打磨层 · 弹层（浅色）'],
  ['detail-pop-dark.png', '细节打磨层 · 弹层（深色）'],
  /* v3 修复批次：器官挂载修复 + 雾光紫白瓷浅色档 + 深色课表层级拉开 */
  ['v3fx3-kb-light.png', 'v3 修复 · 课表页浅色（雾光紫白瓷 + 传送带已挂）'],
  ['v3fx3-kb-dark.png', 'v3 修复 · 课表页深色（课卡与空格子分层）'],
  ['v3fx3-learn-light.png', 'v3 修复 · 学习页浅色（磁带门 + 赛博刻度）'],
  ['v3fx3-learn-dark.png', 'v3 修复 · 学习页深色'],
  ['v3fx3-me-light.png', 'v3 修复 · 我的页浅色（宫崎骏铭牌舱）'],
  ['v3fx3-me-dark.png', 'v3 修复 · 我的页深色'],
  ['v3fx3-campus-light.png', 'v3 修复 · 校园事务页（票券闸门）'],
  ['v3fx3-wiki-light.png', 'v3 修复 · WIKI 页（剪报抽屉）'],
  ['v3fx3-tape-light.png', 'v3 修复 · 磁带门打开态'],
  ['v3fx3-polaroid-light.png', 'v3 修复 · 拍立得墙（褪色相纸）'],
  ['v3fx3-classic-light.png', 'v3 修复 · 经典皮肤未破（并列第二选项）'],
  /* m13555 三条真机报障修复：剪报有正文 / 磁带门 A·B 面有卡 / 死仪表换活档位 */
  ['m13555-clipopen-light.png', 'm13555 剪报抽屉有正文·来源·官方链接（浅色）'],
  ['m13555-clipopen-dark.png', 'm13555 剪报抽屉有正文·来源·官方链接（深色）'],
  ['m13555-tape-light.png', 'm13555 磁带门 A 面 3 张作业卡（浅色）'],
  ['m13555-tape-dark.png', 'm13555 磁带门 A 面 3 张作业卡（深色）'],
  ['m13555-tapeb-light.png', 'm13555 磁带门 B 面考试卡（浅色）'],
  ['m13555-tapeb-dark.png', 'm13555 磁带门 B 面考试卡（深色）'],
  ['m13555-campus-light.png', 'm13555 校园页活档位票券（浅色）'],
  ['m13555-ticketbound2-light.png', 'm13555 活档位 200 读数与选中档一致（浅色）'],
  ['m13555-ticketbound-dark.png', 'm13555 活档位 200 读数与选中档一致（深色）'],
];

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  OK   ' + label + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  (' + extra + ')' : '')); }
}

function pngInfo(p) {
  const b = fs.readFileSync(p);
  if (b.slice(1, 4).toString() !== 'PNG') return null;
  return {
    w: b.readUInt32BE(16), h: b.readUInt32BE(20),
    bytes: b.length,
    sha: crypto.createHash('sha256').update(b).digest('hex'),
  };
}

console.log('--- NOVA 器官实拍护栏 ---');
if (!fs.existsSync(SHOTS)) {
  ok(false, 'shots 目录存在', SHOTS);
} else {
  const seen = new Map();
  for (const [name, label] of ORGAN_SHOTS) {
    const p = path.join(SHOTS, name);
    if (!fs.existsSync(p)) { ok(false, label + ' 有实拍图', name + ' MISSING'); continue; }
    const i = pngInfo(p);
    if (!i) { ok(false, label + ' 是合法 PNG', name); continue; }
    ok(i.w === 390, label + ' 宽度 390', i.w + '×' + i.h + ' / ' + i.bytes + 'B');
    ok(i.bytes > 40000, label + ' 非空白帧', i.bytes + 'B');
    if (seen.has(i.sha)) {
      ok(false, label + ' 与 ' + seen.get(i.sha) + ' 不是同一张图',
        name + ' sha=' + i.sha.slice(0, 16) + ' 重复');
    } else {
      seen.set(i.sha, name);
      ok(true, label + ' 状态唯一', name + ' sha=' + i.sha.slice(0, 16));
    }
  }
  ok(seen.size === ORGAN_SHOTS.length,
    '全部器官状态互不相同（' + seen.size + '/' + ORGAN_SHOTS.length + ' 唯一）');
}

console.log('\ncheck_nova_shots: ' + pass + ' passed, ' + fail + ' failed -> ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
