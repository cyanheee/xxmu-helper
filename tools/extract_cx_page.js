/* 从会话日志里捞真正的学习通页面响应（不是源码回显）。
 *
 * 上一版 extract_cx_html.js 捞出来的全是「源码里讨论这段 HTML 的注释」，
 * 因为判断条件只看了「有没有『作业状态』四个字」，而 core/chaoxing.py 的
 * 文档字符串里就写着这四个字。
 *
 * 这一版加两条硬判据：
 *   1) 载荷里必须有 >=3 个 HTML 起始标签（<li / <div / <span / <table ...），
 *      源码注释不会有这种密度；
 *   2) 必须出现「作业状态：</span>」或「考试状态：</span>」这种**带标签的状态位**，
 *      这才是真页面，文档里写的是纯文本。
 * 命中后按「li 块」切片保存，直接可以拿来跑正则。
 */
const fs = require('fs');
const path = require('path');

const SCAN = process.argv[2] || path.join(__dirname, '..', 'build_scan');
const OUT = process.argv[3] || path.join(__dirname, '..', 'build_html2');

function texts(node, acc) {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') acc.push(node.text);
    for (const k of Object.keys(node)) {
      if (k === 'text') continue;
      const v = node[k];
      if (v && typeof v === 'object') texts(v, acc);
      else if (typeof v === 'string' && v.length > 500) acc.push(v);
    }
  }
  return acc;
}

function tagCount(s) {
  const m = s.match(/<(li|div|span|table|ul|tr|td|a|strong|p)[\s>]/gi);
  return m ? m.length : 0;
}

function looksLikePage(s) {
  if (tagCount(s) < 3) return false;
  return /作业状态：<\/span>|考试状态：<\/span>/.test(s.replace(/&nbsp;/g, ' '));
}

function liBlocks(html) {
  const out = [];
  const re = /<li[^>]*>[\s\S]*?<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    const b = m[0];
    if (b.indexOf('作业状态') >= 0 || b.indexOf('考试状态') >= 0) out.push(b);
  }
  return out;
}

function main() {
  if (!fs.existsSync(SCAN)) { console.log('没有扫描结果目录：' + SCAN); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SCAN).filter(f => f.endsWith('.txt'));

  let pageHit = 0, liTotal = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(SCAN, f), 'utf8').split('\n');
    const base = f.replace(/\.txt$/, '');

    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { return; }
      const payload = texts(ev, []).join('\n');
      if (!looksLikePage(payload)) return;
      pageHit++;

      /* 整页存一份（可能几十 KB，够看清结构） */
      const pageFile = path.join(OUT, base + '_' + idx + '_page.html');
      fs.writeFileSync(pageFile, payload, 'utf8');

      const blocks = liBlocks(payload);
      blocks.forEach((b, i) => {
        fs.writeFileSync(path.join(OUT, base + '_' + idx + '_li' + i + '.html'), b, 'utf8');
        liTotal++;
      });
      console.log('PAGE ' + base + '#' + idx + '  tags=' + tagCount(payload)
        + '  li=' + blocks.length + '  bytes=' + payload.length);
    });
  }
  console.log('真页面 ' + pageHit + ' 个，li 块 ' + liTotal + ' 个 -> ' + OUT);
}

main();
