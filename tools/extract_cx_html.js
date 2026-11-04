/* 从上一步 scan_sessions.js 抓出来的命中行里，把学习通页面的原始 HTML 抠出来。
 *
 * 用法：node tools/extract_cx_html.js <build_scan 目录> <输出目录>
 *
 * 会话日志里每一行都是一条完整事件（JSON）。真正的页面 HTML 藏在
 * tool/result 事件的 message.content[].text 里，且被 JSON 转义过。
 * 这个脚本做三件事：
 *   1) 解析每行 JSON，走到 tool/result 的文本载荷；
 *   2) 在文本里找「作业状态 / 考试状态」前后各 1200 字符的窗口，作为结构样本写出来；
 *   3) 顺便把任何含 <li style="padding:30px 0" 的整块 li 也单独抽出来。
 * 目的只有一个：看清真实标签结构，而不是靠记忆猜正则。
 */
const fs = require('fs');
const path = require('path');

const SCAN = process.argv[2] || path.join(__dirname, '..', 'build_scan');
const OUT = process.argv[3] || path.join(__dirname, '..', 'build_html');

function texts(node, acc) {
  if (!node) return acc;
  if (typeof node === 'string') return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') acc.push(node.text);
    for (const k of Object.keys(node)) {
      if (k === 'text') continue;
      const v = node[k];
      if (v && typeof v === 'object') texts(v, acc);
    }
  }
  return acc;
}

function liBlocks(html) {
  const out = [];
  const re = /<li[^>]*>[\s\S]*?<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].indexOf('作业状态') >= 0 || m[0].indexOf('考试状态') >= 0) out.push(m[0]);
  }
  return out;
}

function main() {
  if (!fs.existsSync(SCAN)) { console.log('没有扫描结果目录：' + SCAN); return; }
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(SCAN).filter(f => f.endsWith('.txt'));
  let win = 0, lis = 0;

  for (const f of files) {
    const lines = fs.readFileSync(path.join(SCAN, f), 'utf8').split('\n');
    const base = f.replace(/\.txt$/, '');

    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { return; }
      const acc = texts(ev, []);
      const payload = acc.join('\n');
      if (payload.indexOf('作业状态') < 0 && payload.indexOf('考试状态') < 0) return;

      /* 1) 状态词前后窗口：看得到 span/strong 的真实嵌套 */
      const marks = ['作业状态', '考试状态'];
      marks.forEach(mk => {
        let i = payload.indexOf(mk);
        let n = 0;
        while (i >= 0 && n < 6) {
          const seg = payload.slice(Math.max(0, i - 1500), i + 1500);
          fs.writeFileSync(path.join(OUT, base + '_' + idx + '_' + mk + '_' + n + '.txt'), seg, 'utf8');
          win++; n++;
          i = payload.indexOf(mk, i + 1);
        }
      });

      /* 2) 整块 li：正则拿去测结构用 */
      const blocks = liBlocks(payload);
      blocks.forEach((b, i) => {
        fs.writeFileSync(path.join(OUT, base + '_' + idx + '_li' + i + '.html'), b, 'utf8');
        lis++;
      });
    });
  }
  console.log('窗口样本 ' + win + ' 个，li 块 ' + lis + ' 个，输出目录 ' + OUT);
}

main();
