/* 扫全部 session 日志（zstd 压缩的 JSONL），找出历史上抓过的学习通页面片段。
 *
 * 用法：node tools/scan_sessions.js <输出目录>
 *
 * 为什么要有这个工具：学习通的作业/考试清单页 HTML 结构没法猜——真实页面里
 * 「作业状态」这四个字周围的标签嵌套、有没有额外 class、状态词到底取到哪儿，
 * 决定了正则能不能用。与其凭记忆写正则再上真机试，不如把历史会话里留过的
 * 原始响应找出来。找到就把命中行写进输出目录，人工看真结构。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'sessions');
const OUT = process.argv[2] || path.join(__dirname, '..', 'build_scan');

const NEEDLES = [
  '作业状态',
  '考试状态',
  'getAllWork',
  'ulDiv',
  'goTest(',
  'inspectTask',
];

function walk(dir, acc) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.zstd$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function main() {
  const files = walk(ROOT, []);
  console.log('session 日志文件数 = ' + files.length);
  if (!files.length) { console.log('没找到，检查 ' + ROOT); return; }

  fs.mkdirSync(OUT, { recursive: true });
  const stat = {};
  NEEDLES.forEach(n => { stat[n] = 0; });

  let scanned = 0;
  for (const f of files) {
    let text;
    try { text = zlib.zstdDecompressSync(fs.readFileSync(f)).toString('utf8'); }
    catch (e) { continue; }
    scanned++;

    const hits = NEEDLES.filter(n => text.indexOf(n) >= 0);
    if (!hits.length) continue;
    hits.forEach(n => { stat[n]++; });

    const sid = path.basename(path.dirname(f));
    const outFile = path.join(OUT, sid + '.txt');
    const lines = text.split('\n').filter(l => hits.some(n => l.indexOf(n) >= 0));
    fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
    console.log('HIT ' + sid + '  lines=' + lines.length + '  ' + hits.join(','));
  }

  console.log('--- 各关键词命中文件数 ---');
  NEEDLES.forEach(n => console.log('  ' + n + ' -> ' + stat[n]));
  console.log('扫描完成，命中内容已写入 ' + OUT);
}

main();
