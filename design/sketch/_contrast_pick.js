/* 对比度实算：候选第三档文字色 × 真实底色
 * 口径：WCAG 2.x 相对亮度，alpha 合成到不透明底。
 * 用法：node design/sketch/_contrast_pick.js
 */
const fs = require('fs');

const hex = h => {
  h = String(h).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const lum = rgb => {
  const c = rgb.map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const l1 = lum(hex(a)), l2 = lum(hex(b));
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
};
const sat = h => {
  const [r, g, b] = hex(h).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const l = (mx + mn) / 2;
  return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
};

/* 浅色档真实底色（从 nova-skin.css / nova-medium.css 取） */
const lightBgs = [
  ['页面底最暗 #EFF2F4', '#EFF2F4'],
  ['页面底中段 #F3F6F7', '#F3F6F7'],
  ['页面底最亮 #F8FAFB', '#F8FAFB'],
  ['内容区卡面 #FDFEFF', '#FDFEFF'],
  ['纯白 #FFFFFF', '#FFFFFF'],
  ['次级面 #E9EFF2', '#E9EFF2'],
  ['网格玻璃 #D8E3E9', '#D8E3E9'],
  ['网格格子 #E2E9ED', '#E2E9ED'],
  ['纸质载体 #F0EBE0', '#F0EBE0'],
  ['控件纸 #EDE5D0', '#EDE5D0'],
];
/* 深色档真实底色 */
const darkBgs = [
  ['舱底 #1A1430', '#1A1430'],
  ['舱底2 #241A3E', '#241A3E'],
  ['玻璃 #161028', '#161028'],
  ['深玻璃 #0C0818', '#0C0818'],
  ['格子 #2A2246', '#2A2246'],
];

const lightCands = ['#7B8B99', '#566370', '#5A6874', '#5E6C79', '#52606D', '#4E5C69'];
const darkCands = ['#8B7FB5', '#9C90C6', '#A79BD0', '#B3A7DA'];

console.log('=== 浅色档 --n-ink-3 候选（阈值 4.5 正文 / 3.0 大字） ===');
for (const c of lightCands) {
  const rs = lightBgs.map(([n, bg]) => ratio(c, bg));
  const min = Math.min(...rs);
  const worst = lightBgs[rs.indexOf(min)][0];
  console.log(`${c}  S=${(sat(c) * 100).toFixed(1)}%  最差=${min.toFixed(2)} @${worst}  ` +
    `最好=${Math.max(...rs).toFixed(2)}  ${min >= 4.5 ? 'PASS' : 'FAIL'}`);
}

console.log('\n=== 深色档 --n-ink-3 候选 ===');
for (const c of darkCands) {
  const rs = darkBgs.map(([n, bg]) => ratio(c, bg));
  const min = Math.min(...rs);
  const worst = darkBgs[rs.indexOf(min)][0];
  console.log(`${c}  S=${(sat(c) * 100).toFixed(1)}%  最差=${min.toFixed(2)} @${worst}  ` +
    `最好=${Math.max(...rs).toFixed(2)}  ${min >= 4.5 ? 'PASS' : 'FAIL'}`);
}

console.log('\n=== .ntc-badge 修法（app.css:1543 黄底 + oncolor 字） ===');
const ntc = [
  ['现状 oncolor #FDF6E6 on yellow #D9A32B', '#FDF6E6', '#D9A32B'],
  ['建议 ink #3B3225 on yellow', '#3B3225', '#D9A32B'],
  ['建议 纯墨 #1E1B16 on yellow', '#1E1B16', '#D9A32B'],
  ['建议 #16233A on yellow', '#16233A', '#D9A32B'],
];
for (const [n, fg, bg] of ntc) {
  console.log(`${n} = ${ratio(fg, bg).toFixed(2)}:1 ${ratio(fg, bg) >= 4.5 ? 'PASS' : 'FAIL'}`);
}

console.log('\n=== NOVA 档主色对比度复核（skin-color 交付的 #12897C） ===');
const acc = [
  ['主色 #12897C on 页面底 #EFF2F4', '#12897C', '#EFF2F4'],
  ['主色 #12897C on 白 #FFFFFF', '#12897C', '#FFFFFF'],
  ['主色 #12897C on 玻璃 #D8E3E9', '#12897C', '#D8E3E9'],
  ['主色亮阶 #1FA898 on 白', '#1FA898', '#FFFFFF'],
  ['主色亮阶 #1FA898 on 玻璃', '#1FA898', '#D8E3E9'],
  ['主色墨 #0B6157 on 白', '#0B6157', '#FFFFFF'],
  ['主色墨 #0B6157 on 玻璃', '#0B6157', '#D8E3E9'],
  ['白字 on 主色 #12897C', '#FFFFFF', '#12897C'],
];
for (const [n, fg, bg] of acc) {
  console.log(`${n} = ${ratio(fg, bg).toFixed(2)}:1 ${ratio(fg, bg) >= 4.5 ? 'PASS' : 'FAIL'}`);
}
