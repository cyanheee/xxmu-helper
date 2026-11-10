/*
 * check_skin.js — NOVA 主题静态验收器（本轮自主补充的工具）
 *
 *   node tools/check_skin.js                     检原型 HTML/CSS
 *   node tools/check_skin.js --shots            另检 shots/nova-light.png / nova-dark.png
 *   node tools/check_skin.js --all              两者都检
 *
 * 判据来自 YG 的两条硬指令：
 *   ①「完全抛开原版，大胆融合所有」→ 旧西部涂鸦骨架的痕迹一律 FAIL
 *   ② 真实功能清单不许臆造 → 出现宿舍空调/洗衣机/报修/停车场/kWh 一律 FAIL
 * 另检：双轴正交、动效错峰、真实功能锚点齐全、出图尺寸与哈希。
 * 零依赖，只用 node 内置 fs/path/crypto。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SKETCH = path.join(ROOT, 'design', 'sketch');
const HTML = path.join(SKETCH, 'nova-preview.html');
const CSS = path.join(SKETCH, 'nova-preview.css');
const SHOTS = path.join(SKETCH, 'shots');

const BANNED_WORDS = [
  '纸胶带', '针脚', '西部描边', '蹄铁星', '红皮绳', '淡棕方格',
  '宿舍空调', '洗衣机', '报修', '停车场', '12.40', 'kWh', 'CRC OK',
  '#EFE2C8', '#3B3225', '#A89070', '#8E7BC4', '#241E1A',
];
// 旧色板允许在注释里作为"禁用说明"出现，因此只扫 CSS 的声明值区，不扫注释。
const BANNED_HEX = ['#EFE2C8', '#3B3225', '#A89070', '#8E7BC4', '#241E1A'];
const REQUIRED_ANCHORS = [
  ['21', '21 周'], ['上下课', '上下课时间'], ['课表', '课表'],
  ['作业', '作业'], ['考试', '考试'], ['截止', '截止时间'],
  ['接热水', '饮水机接热水'], ['校历', '校历'], ['招生办', '招生办'],
  ['附属医院', '附属医院'], ['校训', '校训'], ['留言板', '留言板'],
  ['审核', '图片审核'], ['磁带', '磁带门'], ['传送带', '周次传送带'],
];
const ORGANS = ['belt', 'viewport', 'tape', 'ticket', 'clipping', 'polaroid', 'dial'];

let pass = 0, fail = 0;
const notes = [];
function ok(cond, label, detail) {
  if (cond) { pass++; notes.push('  PASS  ' + label + (detail ? '  ' + detail : '')); }
  else { fail++; notes.push('  FAIL  ' + label + (detail ? '  ' + detail : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf8'); }

function checkSources() {
  notes.push('--- 源文件 / 禁词 / 锚点 ---');
  ok(fs.existsSync(HTML), 'nova-preview.html 存在');
  ok(fs.existsSync(CSS), 'nova-preview.css 存在');
  if (!fs.existsSync(HTML) || !fs.existsSync(CSS)) return;
  const html = read(HTML), css = read(CSS), all = html + '\n' + css;

  for (const w of BANNED_WORDS) {
    ok(!all.includes(w), '禁词不存在：' + w);
  }
  // 去掉注释后再查旧色板 hex，避免"禁用说明"自我误伤
  const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const htmlNoComment = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const h of BANNED_HEX) {
    ok(!cssNoComment.includes(h) && !htmlNoComment.includes(h), '旧色板未复用：' + h);
  }

  for (const [needle, label] of REQUIRED_ANCHORS) {
    ok(all.includes(needle), '真实功能锚点：' + label);
  }
  for (const organ of ORGANS) {
    ok(html.includes('data-organ="' + organ + '"'), '器官挂载：' + organ);
  }

  ok(/data-skin="nova"/.test(html), 'data-skin="nova" 已声明');
  ok(/data-theme="/.test(html), 'data-theme 已声明（双轴）');
  ok(css.includes('html[data-skin="nova"][data-theme="dark"]'), 'CSS 存在浅深正交规则');
  ok(/prefers-reduced-motion/.test(css), '减少动效总闸存在');

  // 错峰周期：至少 6 个不同秒数，且不出现 1s 以下的闪烁
  const secs = [...css.matchAll(/(\d+(?:\.\d+)?)s\s+(?:linear|ease-in-out|ease|steps)/g)]
    .map(m => parseFloat(m[1])).filter(n => n >= 1.5);
  const uniq = [...new Set(secs)].sort((a, b) => a - b);
  ok(uniq.length >= 6, '动效周期错峰 ≥6 档', '→ [' + uniq.join(', ') + ']s');
  ok(![...css.matchAll(/(\d+(?:\.\d+)?)s\s+(?:linear|ease-in-out|ease|steps)/g)]
      .some(m => parseFloat(m[1]) < 1.5), '无 <1.5s 高频闪烁');

  // 硬切状态机（像素舱格）不能被平滑 transition 覆盖
  ok(/transition-none|transition:\s*none/.test(css), '像素硬切状态机保留');
  ok(/transform-origin:\s*var\(--ox/.test(css) || /--ox/.test(css), '磁带门触点放大原点存在');
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
function checkShots() {
  notes.push('--- 390px 实拍 ---');
  const L = path.join(SHOTS, 'nova-light.png'), D = path.join(SHOTS, 'nova-dark.png');
  ok(fs.existsSync(L), 'nova-light.png 存在');
  ok(fs.existsSync(D), 'nova-dark.png 存在');
  if (!fs.existsSync(L) || !fs.existsSync(D)) return;
  const l = pngInfo(L), d = pngInfo(D);
  ok(l && l.w === 390, '浅色档宽度 390', l ? l.w + '×' + l.h + ' / ' + l.bytes + 'B' : '');
  ok(d && d.w === 390, '深色档宽度 390', d ? d.w + '×' + d.h + ' / ' + d.bytes + 'B' : '');
  ok(l && l.h === 1400, '浅色档高度 1400（右侧不再被宽视口裁切）', l ? l.h + 'px' : '');
  ok(d && d.h === 1400, '深色档高度 1400', d ? d.h + 'px' : '');
  ok(l && l.bytes > 60000, '浅色档非空白帧', l ? l.bytes + 'B' : '');
  ok(d && d.bytes > 60000, '深色档非空白帧', d ? d.bytes + 'B' : '');
  ok(l && d && l.sha !== d.sha, '浅深两张不是同一张图');
  if (l && d) notes.push('  INFO  light sha256=' + l.sha.slice(0, 16) + '  dark sha256=' + d.sha.slice(0, 16));
  for (const [name, label] of [['nova-channel.png', '频道切换态'],
                               ['nova-tape-light.png', '磁带门浅色态'],
                               ['nova-tape-dark.png', '磁带门深色态']]) {
    const p = path.join(SHOTS, name), i = fs.existsSync(p) ? pngInfo(p) : null;
    ok(i && i.w === 390 && i.h === 1400, label + ' 390×1400 实拍', i ? i.w + '×' + i.h + ' / ' + i.bytes + 'B' : 'MISSING');
    ok(i && i.bytes > 40000, label + ' 非空白帧', i ? i.bytes + 'B' : '');
  }
}

const args = process.argv.slice(2);
const wantShots = args.includes('--shots') || args.includes('--all');
const wantSrc = args.includes('--all') || !args.includes('--shots');
if (wantSrc) checkSources();
if (wantShots) checkShots();

console.log(notes.join('\n'));
console.log('\ncheck_skin: ' + pass + ' passed, ' + fail + ' failed → ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
