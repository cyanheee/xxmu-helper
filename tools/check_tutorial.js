/* 使用教程与功能清单的一致性检查（v1.1.42）
 *
 *   node tools/check_tutorial.js
 *
 * 用户原话：「使用教程什么的每次版本更新，如果有功能性变化这个也需要更新」。
 * 以前这句只写在交接文档里，靠人记 —— 结果教程停在 v1.1.6，还在教
 * 「接水→结束并结算」（结算早删了）和「我的 → 学期设置」（已搬进设置页）。
 *
 * 这里把「靠人记」变成脚本：
 *   docs/handoff/tutorial-contract.json  = App 现在有哪些学生能看见的功能
 *   web/tut.js 的 TUT_FEATURES / covers / since / TUT_CONTENT_VER = 教程声称覆盖了什么
 * 两边对不上就 exit 1；check_web.js 与 release_all.py 预检都会调它。
 *
 * 检查项：
 *   1. 契约表是合法 JSON、feature id 不重复
 *   2. 教程声明的 features 与契约表**完全一致**（多一个少一个都红）
 *   3. 每个 feature 至少被一页 covers 到
 *   4. 每页都有 since，且 since 不早于它 cover 的功能里最晚的那个版本
 *      （功能在 1.1.41 加的，那页就不能还标 1.1.6）
 *   5. 教程正文必须出现 mustMention 的说法（入口路径改了没跟着改会红）
 *   6. 禁用词一条都不许出现（删掉的功能不能还教）
 *   7. 内容版本号与契约表 version 一致
 *   8. 排版防线：.tut-view 裁切容器在，且 strip 上没有 will-change
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

function verNum(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
  return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : 0;
}

let contract;
try {
  contract = JSON.parse(read('docs/handoff/tutorial-contract.json'));
  ok(true, '契约表是合法 JSON');
} catch (e) {
  ok(false, '契约表是合法 JSON', e.message);
  console.log('\n[FAIL] 契约表读不出来');
  process.exit(1);
}

const feats = contract.features || [];
const ids = feats.map(f => f.id);
ok(ids.length > 0, '契约表列了功能', ids.length);
ok(new Set(ids).size === ids.length, 'feature id 不重复');
ok(feats.every(f => f.id && f.since && f.label), '每条都有 id/since/label');

/* --- 从 tut.js 里把 PAGES / TUT_FEATURES / TUT_CONTENT_VER 真跑一遍。
 * 用 vm 而不是正则抠字符串：内容里带引号、括号、中文逗号，正则容易抠错。 */
const src = read('web/tut.js');
let pages = [], declared = [], contentVer = 0;
try {
  const vm = require('vm');
  const cut = (from, to) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a + from.length);
    if (a < 0 || b < 0) throw new Error('切不出 ' + from + ' → ' + to);
    return src.slice(a, b);
  };
  /* 三个声明（TUT_CONTENT_VER / TUT_FEATURES / PAGES）一起切。
   * 用「内容区起点 → let idx」而不是逐个切：注释里也提到过这些名字，
   * src.indexOf 会先命中注释，切出来是半句注释。 */
  const code = [
    cut('  const TUT_CONTENT_VER', '  let idx = 0;'),
    'this.__dump = { pages: PAGES, declared: TUT_FEATURES, ver: TUT_CONTENT_VER };',
  ].join('\n');
  const s = { console };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(code, s, { filename: 'tut-content.js' });
  pages = s.__dump.pages;
  declared = s.__dump.declared;
  contentVer = s.__dump.ver;
  ok(true, '能从 tut.js 真跑出 PAGES / TUT_FEATURES');
} catch (e) {
  ok(false, '能从 tut.js 真跑出 PAGES / TUT_FEATURES', e.message);
  console.log('\n[FAIL] 教程内容读不出来');
  process.exit(1);
}

console.log('\n功能覆盖对照：');
const missing = ids.filter(id => declared.indexOf(id) < 0);
const extra = declared.filter(id => ids.indexOf(id) < 0);
ok(missing.length === 0, '契约表的功能，教程都声明了', missing.join(','));
ok(extra.length === 0, '教程没声明契约表之外的功能', extra.join(','));

const covered = {};
pages.forEach(p => (p.covers || []).forEach(id => { covered[id] = (covered[id] || 0) + 1; }));
const uncovered = ids.filter(id => !covered[id]);
ok(uncovered.length === 0, '每个功能至少被一页 covers 到', uncovered.join(','));
ok(pages.length >= 5, '教程页数不少于 5', pages.length);
ok(pages.every(p => p.ttl && Array.isArray(p.body) && p.body.length > 0), '每页都有标题和正文');

console.log('\n版本新鲜度（功能变了，那页的 since 必须跟上）：');
const sinceOf = {};
feats.forEach(f => { sinceOf[f.id] = f.since; });
let stale = [];
pages.forEach(p => {
  ok(!!p.since, '「' + p.ttl + '」有 since', p.since || '(缺)');
  if (!p.since) return;
  const latest = Math.max(0, ...(p.covers || []).map(id => verNum(sinceOf[id])));
  if (latest && verNum(p.since) < latest) {
    stale.push(p.ttl + ' 标 ' + p.since + '，但它讲的功能最晚是 ' +
      (p.covers || []).filter(id => verNum(sinceOf[id]) === latest).join('/'));
  }
});
ok(stale.length === 0, '没有「讲着新功能却标着旧版本」的页', stale.join(' ; '));
ok(contentVer === contract.version,
  'TUT_CONTENT_VER 与契约表 version 一致',
  contentVer + ' vs ' + contract.version);

console.log('\n正文口径（入口路径 / 功能名 / 禁用词）：');
const body = pages.map(p => (p.body || []).concat(p.tip ? [p.tip] : [], [p.ttl])).join('\n');
(contract.mustMention || []).forEach(w => {
  ok(body.indexOf(w) >= 0, '教程里提到了「' + w + '」');
});
(contract.forbidden || []).forEach(w => {
  /* 「没有广告，没有『开通会员』」是否定式表述，不算过时宣传。
   * 逐个匹配：把「没有/不含/不/无需 + 这个词」的行先剔掉，剩下的才算命中。
   * 上一版直接 indexOf 把这句判成了 FAIL —— 检查器自己写窄了会制造假红。 */
  const lines = body.split('\n');
  const hit = lines.filter(l => {
    if (l.indexOf(w) < 0) return false;
    const at = l.indexOf(w);
    const pre = l.slice(Math.max(0, at - 12), at);
    return !/(没有|不含|不|无需|去掉|删掉|不再是)\s*[「"'']?$/.test(pre);
  });
  ok(hit.length === 0, '没有过时的「' + w + '」', hit.slice(0, 2).join(' | '));
});

console.log('\n排版防线（真机截图的相邻页漏字）：');
const css = read('web/app.css');
ok(/\.tut-view\s*\{[^}]*overflow:\s*hidden/s.test(css), '.tut-view 有 overflow:hidden');
ok(/\.tut-view\s*\{[^}]*padding:\s*0/s.test(css), '.tut-view 自己没有 padding（裁切层不能有内边距）');
ok(/className = 'tut-view'/.test(src) && /view\.appendChild\(strip\)/.test(src),
  'tut.js 把 strip 装进了 .tut-view');
ok(!/will-change:\s*transform/.test(css), 'strip 上没有 will-change（国产 ROM 合成层会绕开祖先裁切）');
ok(/\.tut-box\s*\{[^}]*overflow:\s*hidden/s.test(css), '.tut-box 仍保留 overflow:hidden 兜底');

console.log('\n' + (bad === 0
  ? '[PASS] 教程契约 ' + total + ' 项全过'
  : '[FAIL] ' + bad + '/' + total + ' 项未过（功能变了但教程没跟着更）'));
process.exit(bad === 0 ? 0 : 1);
