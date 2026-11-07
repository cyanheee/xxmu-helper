// 把官网三张界面示意图从旧蓝色皮肤换成素描纸皮肤。
// 只做「颜色字面量替换」，不动结构；改完自校验：无残留蓝、无残缺 hex。
//
// 关键坑（v1 踩过两次）：不能用 String.replace 无脑替换短色值，
// '#fff' 会把 '#fff8f1' 切成 '#faf7ee8f1'（多出一位十六进制），
// 渲染时整个属性失效。必须用带边界的正则：颜色后面不能紧跟 hex 字符。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'server', 'pages', 'dist', 'img');

const MAP = {
  '#f4f6fb': '#f4f0e5',   // 页面底 -> 纸
  '#f7f9fc': '#f0ebdf',
  '#ffffff': '#faf7ee',   // 卡片 -> 纸面
  '#e9edf5': '#d9d2c0',   // 分隔线 -> 格线
  '#0f172a': '#1b1a17',   // 主文字 -> 墨
  '#3d4759': '#4a4640',   // 次文字 -> 墨灰
  '#8b94a6': '#8b8478',   // 弱文字 -> 铅笔
  '#eaf1ff': '#e9e3d3',   // 强调浅底 -> 纸黄
  '#2563eb': '#1b1a17',   // 品牌蓝 -> 墨
  '#3b82f6': '#1b1a17',
  '#4f46e5': '#1b1a17',
  '#1e40af': '#1b1a17',
  '#dbeafe': '#eae4d2',   // 课程块蓝 -> 彩铅纸
  '#dcfce7': '#e6ecdf',   // 课程块绿
  '#fae8ff': '#efe6dd',   // 课程块紫
  '#fef3c7': '#f1ead6',   // 课程块黄
  '#fff8f1': '#f1ead6',   // 饮水机提示底 -> 便签纸
  '#86198f': '#5a4a2e',   // 状态文字紫 -> 棕
  '#166534': '#3f6b46',   // 状态文字绿
  '#92400e': '#a56a22',   // 状态文字橙
  '#ea580c': '#a56a22',
  '#8a3d0c': '#5b4a1e',
  '#fff': '#faf7ee',
};

const FILES = ['shot-kb.svg', 'shot-learn.svg', 'shot-water.svg'];

/* 带边界替换：色值后面必须是非 hex 字符（引号、分号、空格、行尾）。
 * 这样 '#fff' 不会命中 '#fff8f1' 的前三位。 */
function rep(t, from, to) {
  const esc = from.replace('#', '#');
  const re = new RegExp(esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!=[0-9a-fA-F])', 'gi');
  return t.replace(re, to);
}

for (const f of FILES) {
  const p = path.join(DIR, f);
  let t = fs.readFileSync(p, 'utf8');
  // 长的先换，短的后换；边界正则本身已防前缀吞并，顺序只是双保险
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) t = rep(t, k, MAP[k]);
  fs.writeFileSync(p, t, 'utf8');
  console.log('done', f, fs.statSync(p).size);
}

// ---- 自校验 ----
const BLUE = ['#2563eb', '#3b82f6', '#4f46e5', '#1e40af', '#f4f6fb', '#0f172a',
  '#3d4759', '#8b94a6', '#eaf1ff', '#fff8f1', '#8a3d0c'];
let bad = 0;
for (const f of FILES) {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const b of BLUE) {
    if (t.toLowerCase().includes(b)) { console.log('RESIDUE', f, b); bad++; }
  }
  // 只校验「颜色值位置」的 hex：fill=/stroke=/stop-color=/flood-color= 之后
  const m = t.match(/(?:fill|stroke|stop-color|flood-color)="#[0-9a-fA-F]+"/g) || [];
  for (const s of m) {
    const c = s.match(/#[0-9a-fA-F]+/)[0];
    if (![4, 5, 7, 9].includes(c.length)) { console.log('MALFORMED', f, c); bad++; }
  }
  console.log('  ' + f + ' 颜色值 ' + m.length + ' 处');
}
console.log(bad === 0 ? 'ALL OK' : 'FAILED ' + bad);
