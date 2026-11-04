/* 离线验证「下载进度」这条链（v1.1.4）。
 *
 *   node tools/test_downprogress.js
 *
 * 背景：用户截图里更新按钮停在「下载中…」一动不动，没百分比、没重试，
 * 所以他分不清是在下、卡住了、还是已经死了。v1.1.4 让 Java 侧分段下载
 * 把字节数推给 window.__onApkProgress，前端 APKDL 再换算成百分比。
 *
 * 这条链有三个容易翻车的点，真机都不好复现（要断网、要弱网、要装包），
 * 所以在这里用假的 Host 把它们钉死：
 *   1. 百分比不许倒退 —— 4 段并发各自累加，先到 90% 再被别的段拉回 88%；
 *   2. total 未知（服务端不支持 Range，退化成单流）时 pct 必须是 -1，
 *      界面只能说「下载中…」，不能显示 0% 或 NaN%；
 *   3. 下载中再点一次不能被当成新任务 —— Java 侧只有一个回调出口，
 *      覆盖了 pending 前一次的回调就永远等不到，那个按钮就永久停在
 *      「下载中…」（这正是用户报的那个现象）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');

let pass = 0;
let fail = 0;

function ok(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log('  OK   ' + label + '   ' + g);
  } else {
    fail++;
    console.log('  FAIL ' + label);
    console.log('         得到 ' + g + ' / 期望 ' + w);
  }
}

/* 只把 APKDL 这个 IIFE 从 app.js 里切出来跑，不加载整个 app.js：
 * 那 3600 行里有 DOM 查询、定时器、网络请求，塞进 vm 里会连环报错，
 * 而这个模块本身只依赖一个全局 Host，边界很干净。 */
function sliceBlock(src, head) {
  const i = src.indexOf(head);
  if (i < 0) throw new Error('app.js 里找不到块：' + head);
  // 从 head 起找到配对的 "})();"
  const end = src.indexOf('\n})();', i);
  if (end < 0) throw new Error('块没有正常结束：' + head);
  return src.slice(i, end + '\n})();'.length);
}

const BLOCK = sliceBlock(SRC, 'const APKDL = (() => {');

/** 造一个 APKDL 实例。hostReady=false 模拟在浏览器里（不是 App 内）。 */
function makeAPKDL(opts) {
  const o = opts || {};
  const calls = [];
  const Host = {
    downloadAndInstall: (u) => { calls.push(u); },
    canInstall: () => (o.canInstall === undefined ? true : o.canInstall),
    openInstallSettings: () => { calls.push('<settings>'); },
  };
  const ctx = {
    Host: o.noHost ? undefined : Host,
    console,
  };
  ctx.window = ctx;
  vm.runInNewContext(BLOCK + '\n;__out = APKDL;', ctx, {
    filename: 'app.js#APKDL',
    timeout: 2000,
  });
  return { A: ctx.__out, calls };
}

/* ---------- 1. 正常进度：百分比递增 ---------- */
console.log('\n[1] 分段下载的字节数换算成百分比');
{
  const { A, calls } = makeAPKDL();
  const seen = [];
  const r = A.start('http://x/v1/apk', () => {}, (pct) => seen.push(pct));
  ok('start 返回 started', r, 'started');
  ok('确实调了 Host.downloadAndInstall', calls, ['http://x/v1/apk']);

  A.progress(0, 492914);
  A.progress(246457, 492914);
  A.progress(492914, 492914);
  ok('从 0 到 100', seen, [0, 50, 100]);
}

/* ---------- 2. 百分比不许倒退（4 段并发的真实形态） ---------- */
console.log('\n[2] 百分比不许倒退');
{
  const { A } = makeAPKDL();
  const seen = [];
  A.start('u', () => {}, (pct) => seen.push(pct));
  /* 4 个线程各自推进，回调顺序是乱的：先到 45%，然后某个段报上来
   * 一个更小的累计值（因为别的段还没跟上），不能往回跳。 */
  A.progress(221000, 492914);   // 44
  A.progress(150000, 492914);   // 30  ← 倒退
  A.progress(300000, 492914);   // 60
  A.progress(250000, 492914);   // 50  ← 倒退
  A.progress(492914, 492914);   // 100
  ok('没有出现下降', seen, [44, 44, 60, 60, 100]);
}

/* ---------- 3. total 未知时 pct = -1 ---------- */
console.log('\n[3] 服务端没给总长（退化成单流）');
{
  const { A } = makeAPKDL();
  const seen = [];
  A.start('u', () => {}, (pct) => seen.push(pct));
  A.progress(1000, 0);
  A.progress(5000, 0);
  A.progress(5000, -1);
  /* 界面拿到 -1 只能说「下载中…」。若这里给出 0 或 NaN，
   * 按钮上就会印出「下载中 0%」卡死不动 —— 比不显示更糟。 */
  ok('total<=0 一律 -1', seen, [-1, -1, -1]);
}

/* ---------- 4. 正在下载时再点一次：拒绝，且不覆盖前一个回调 ---------- */
console.log('\n[4] 下载中重复点击');
{
  const { A } = makeAPKDL();
  let firstDone = 0;
  let secondDone = 0;
  ok('第一次 started', A.start('u', () => { firstDone++; }, () => {}), 'started');
  ok('第二次 busy', A.start('u', () => { secondDone++; }, () => {}), 'busy');
  A.finish(true, '');
  ok('只有第一个回调被调用', [firstDone, secondDone], [1, 0]);
  /* 关键：发完之后必须能重新 start，否则失败一次就再也点不动了 */
  ok('完成后能重新开始', A.start('u', () => {}, () => {}), 'started');
}

/* ---------- 5. 失败后能重试 ---------- */
console.log('\n[5] 下载失败 → 重试');
{
  const { A } = makeAPKDL();
  const got = [];
  A.start('u', (ok_, m) => got.push([ok_, m]), () => {});
  A.finish(false, '分段没拿全，还差 38400 字节');
  ok('失败回调带上了原因', got, [[false, '分段没拿全，还差 38400 字节']]);
  ok('失败后 pending 已清（能重试）', A.start('u', () => {}, () => {}), 'started');
}

/* ---------- 6. 权限不足 / 不在 App 内 ---------- */
console.log('\n[6] 装不了的情况');
{
  const a = makeAPKDL({ canInstall: false });
  const r1 = a.A.start('u', () => {}, () => {});
  ok('没给「未知来源」权限时返回 noperm', r1, 'noperm');
  ok('并且跳了设置页', a.calls, ['<settings>']);

  const b = makeAPKDL({ noHost: true });
  ok('不在 App 内（无 Host）返回 nohost', b.A.start('u', () => {}, () => {}), 'nohost');
  ok('canUse() 为 false', b.A.canUse(), false);
}

/* ---------- 7. finish 之后不会再漏进度 ---------- */
console.log('\n[7] 结束后的迟到回调不能污染下一次');
{
  const { A } = makeAPKDL();
  const a1 = [];
  A.start('u', () => {}, (p) => a1.push('first:' + p));
  A.progress(100000, 492914);
  A.finish(true, '');
  /* Java 侧在 __onApkDownload 之后还会补一个满进度（防节流吞掉最后一次），
   * 那个回调如果落到下一次任务的 pending 上，会让新任务的按钮直接跳 100%。 */
  A.progress(492914, 492914);
  ok('第一次任务只拿到自己的进度', a1, ['first:20']);

  const a2 = [];
  A.start('u', () => {}, (p) => a2.push('second:' + p));
  A.progress(0, 492914);
  A.progress(100000, 492914);
  ok('第二次任务从 0 开始，没有继承 lastPct', a2, ['second:0', 'second:20']);
}

console.log('');
if (fail) {
  console.log('[FAIL] ' + fail + ' 条未过 / 共 ' + (pass + fail) + ' 条');
  process.exit(1);
}
console.log('[PASS] 下载进度链 ' + pass + ' 条断言全过');
