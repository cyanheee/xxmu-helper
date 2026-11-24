/* 一次性校验脚本：把长截图夹具的「布局解绑」那几行去掉，
 * 还原成真实 100% 高度，用来判断「底栏不吸附」到底是真 bug 还是夹具假象。
 * 用法：node design/sketch/_viewtest.js light|dark [organ]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const theme = process.argv[2] || 'light';
const organ = process.argv[3] || '';

const gen = path.join(ROOT, 'design', 'sketch', 'make_nova_real.js');
execFileSync(process.execPath, [gen, theme, 'nova'], { stdio: 'inherit' });

const src = path.join(ROOT, 'design', 'sketch', `nova-real-nova-${theme}.html`);
let html = fs.readFileSync(src, 'utf8');

/* 夹具里这几条是为「无限长截图」服务的，真实运行时不存在 */
const kill = [
  /html,body\{[^}]*height:auto!important[^}]*\}/g,
  /#app\{[^}]*height:auto!important[^}]*\}/g,
  /main\{[^}]*overflow:visible!important[^}]*\}/g,
  /#tabs\{position:static!important\}/g
];
let n = 0;
kill.forEach((re) => {
  html = html.replace(re, (m) => { n++; return '/* _viewtest: removed ' + m.slice(0, 24) + ' */'; });
});

const out = path.join(ROOT, 'design', 'sketch', `nova-real-viewtest-${theme}.html`);
fs.writeFileSync(out, html, 'utf8');
console.log('patched ' + n + ' rules -> ' + path.basename(out));

const shot = path.join(ROOT, 'design', 'sketch', 'shots', `viewtest-${theme}${organ ? '-' + organ : ''}.png`);
const url = 'file:///' + out.replace(/\\/g, '/') + (organ ? '?organ=' + organ : '');
const edge = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
execFileSync(edge, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=390,844', '--virtual-time-budget=900', '--screenshot=' + shot, url
], { stdio: 'ignore' });

const buf = fs.readFileSync(shot);
console.log(path.basename(shot) + ' ' + buf.length + ' bytes');
