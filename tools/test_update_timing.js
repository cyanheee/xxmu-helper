/* 启动检查更新时序的离线行为测试（v1.1.46）
 *
 *   node tools/test_update_timing.js
 *
 * 用户原话「启动软件检查更新能不能快一点，现在有点慢，感觉打开了好久才弹要更新」。
 * 实测 /v1/config TTFB 0.8~1.4s，旧代码还要先 setTimeout 1500ms 才发请求，
 * 学生等的一半以上是纯白等。改成双 rAF 后立即发（约 32ms）。
 *
 * 能验：双 rAF 真的会触发检查、只触发一次、老 WebView 有兜底、
 *       不再有 1500ms、检查是非阻塞 Promise、失败静默不挡用 App。
 * 不能验：真机上从点图标到弹窗的实际秒数（DNS/TLS/WebView 预热都测不到）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

const app = read('web/app.js');

/* 从源码里切出启动检查的 IIFE 真跑一遍（不复制实现） */
const START = '(function checkUpdateOnFirstPaint()';
const a = app.indexOf(START);
const b = app.indexOf('})();', a);
ok(a > 0 && b > a, '能切出启动检查函数');
const snippet = app.slice(a, b + 5);

function runEnv(hasRaf) {
  const frames = [];
  const timers = [];
  const calls = [];
  const sandbox = {
    UpdateUI: { check: (silent) => { calls.push(silent); return Promise.resolve('ok'); } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    console,
  };
  if (hasRaf) {
    sandbox.window = {
      requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    };
  } else {
    sandbox.window = {};
  }
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox, { filename: 'update-timing.js' });
  return { frames, timers, calls };
}

console.log('1. 新 WebView（有 requestAnimationFrame）');
{
  const e = runEnv(true);
  ok(e.frames.length === 1, '先挂第一帧回调', e.frames.length);
  /* 第一帧：把第二帧排上，此时还不该发请求 */
  e.frames[0]();
  ok(e.frames.length === 2, '第一帧里排了第二帧（让首屏先画完）', e.frames.length);
  ok(e.timers.length === 0, '第一帧还没发检查（不抢首屏）', e.timers.length);
  /* 第二帧：排一个 0ms 任务 */
  e.frames[1]();
  ok(e.timers.length === 1 && e.timers[0].ms === 0,
    '第二帧用 0ms 任务发出检查，没有 1500ms 白等', JSON.stringify(e.timers.map(t => t.ms)));
  e.timers[0].fn();
  ok(e.calls.length === 1 && e.calls[0] === true,
    '检查只发一次且是静默（silent=true）', JSON.stringify(e.calls));
}

console.log('\n2. 老 WebView（没有 rAF）');
{
  const e = runEnv(false);
  ok(e.timers.length === 1 && e.timers[0].ms === 60,
    '退回 60ms 定时器（不会永远不检查）', JSON.stringify(e.timers.map(t => t.ms)));
  e.timers[0].fn();
  ok(e.timers.length === 2 && e.timers[1].ms === 0, '随后同样用 0ms 发出');
  e.timers[1].fn();
  ok(e.calls.length === 1 && e.calls[0] === true, '也只发一次');
}

console.log('\n3. 源码契约');
{
  ok(!/setTimeout\(\(\) => UpdateUI\.check\(true\), 1500\)/.test(app),
    '1500ms 固定延迟已删');
  ok(/UpdateUI\.check\(true\)/.test(app), '仍是静默检查');
  ok(/return AUTH\.versionInfo\(\)\.then/.test(app),
    'check 用异步 Promise，不阻塞 JS 线程');
  ok(/\}, \(\) => 'ok'\);/.test(app),
    '版本检查失败静默降级（绝不挡住用 App）');
  ok(/if \(showNotice\(\)\) return 'notice'/.test(app),
    '公告仍优先于更新提示（顺序没被改）');
}

console.log('\n4. 发版说明：只有学生视角');
{
  const cp = require('child_process');
  const r = cp.spawnSync(process.execPath,
    [path.join(root, 'tools', 'check_notes.js')], { encoding: 'utf8' });
  ok(r.status === 0, 'check_notes.js 通过', (r.stdout || '').split('\n').slice(-2).join(' '));
  const notes = read('apk/v1.1.43.notes.txt');
  ok(notes.indexOf('没发给学生') < 0 && notes.indexOf('我没验到') < 0,
    '旧版那两句管理员话已删');
  ok(notes.indexOf('更新群：1097668324') > 0, '结尾仍有群号');
  const rel = read('tools/release_all.py');
  ok(/check_notes\.js/.test(rel), '发版预检会跑学生视角检查');
}

console.log('\n' + (bad === 0
  ? '[PASS] 更新检查时序 ' + total + ' 项全过'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
