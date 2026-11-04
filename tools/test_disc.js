/* disc.js 离线测试 —— 使用声明层的状态机。
 *
 *   node tools/test_disc.js
 *
 * 为什么值得单独测：这一层是「首次打开必须看见」的东西，它的失败方式
 * 全是静默的 —— 少弹一次没人报错，多弹一次也没人报错，顺序错了更没人
 * 报错（只是用户被连点跳过）。只有断言能发现。
 *
 * 覆盖 7 组：
 *   [1] 首次启动自动弹（pref 空）
 *   [2] 已看过不再弹
 *   [3] 关掉 = 已阅（✕ 与「我已知晓」等价）
 *   [4] 激活门还立着时不往教程转（否则教程会被 gate 盖住，等于白弹）
 *   [5] 解锁后关掉 → 转教程
 *   [6] replay() 不写 pref、不转教程
 *   [7] pref 读失败时当成「没看过」（和 tut 相反）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'web', 'disc.js'), 'utf8');

let pass = 0, failn = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { failn++; console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

/** 造一个沙箱：假 Host / 假 localStorage / 假 DOM / 假定时器 */
function make(opts) {
  opts = opts || {};
  const prefs = Object.assign({}, opts.prefs || {});
  const cls = {};                       // id -> Set(className)
  const els = {};
  const timers = [];
  const calls = { tut: 0, onb: 0 };

  function el(id) {
    if (!els[id]) {
      const set = new Set();
      cls[id] = set;
      els[id] = {
        id,
        get classList() {
          return {
            add: c => set.add(c),
            remove: c => set.delete(c),
            contains: c => set.has(c),
          };
        },
        scrollIntoView: () => {},
        onclick: null,
      };
    }
    return els[id];
  }

  const Host = {
    getPref: k => {
      if (opts.prefThrows) throw new Error('pref boom');
      return prefs[k] || '';
    },
    setPref: (k, v) => {
      if (opts.prefThrows) throw new Error('pref boom');
      prefs[k] = v;
    },
  };

  const sandbox = {
    console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    Host,
    localStorage: {
      getItem: k => prefs[k] || null,
      setItem: (k, v) => { prefs[k] = v; },
    },
    document: { getElementById: el },
    Tut: { afterUnlock: () => { calls.tut++; } },
    Onboard: { afterUnlock: () => { calls.onb++; } },
    switchTab: () => {},
    About: { refresh: () => {} },
  };
  if (opts.noHost) delete sandbox.Host;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;__disc = Disc;', sandbox, { timeout: 3000 });

  return {
    D: sandbox.__disc,
    prefs,
    els,
    el,
    timers,
    calls,
    /** 跑掉所有已排队的定时器（只跑当前这一批，避免无限递归） */
    flush() {
      const batch = timers.splice(0, timers.length);
      batch.forEach(t => t.fn());
    },
    locked(v) {
      const g = el('gate');
      if (v) g.classList.remove('off'); else g.classList.add('off');
    },
  };
}

console.log('[1] 首次启动自动弹（pref 空）');
{
  const t = make();
  t.locked(true);
  t.D.init();
  ok(t.timers.length === 1, 'init 排了一个 show 定时器', 'timers=' + t.timers.length);
  ok(t.timers[0] && t.timers[0].ms === 260, '延迟 260ms（等首屏画完）');
  t.flush();
  ok(t.el('disc').classList.contains('on'), '声明层已显示');
  ok(t.D.done() === false, 'done() 仍是 false（还没关）');
}

console.log('\n[2] 已看过不再弹');
{
  const t = make({ prefs: { xxmu_disc_done: '1' } });
  t.locked(true);
  t.D.init();
  ok(t.timers.length === 0, 'init 没有排 show', 'timers=' + t.timers.length);
  ok(t.el('disc').classList.contains('on') === false, '声明层没显示');
  ok(t.D.done() === true, 'done() 为 true');
}

console.log('\n[3] 关掉 = 已阅（✕ 与按钮等价）');
{
  const t = make();
  t.locked(true);
  t.D.init();
  t.flush();
  t.el('discX').onclick();                 // 点 ✕
  ok(t.prefs.xxmu_disc_done === '1', '✕ 之后 pref 写成 1');
  ok(t.el('disc').classList.contains('on') === false, '层已关');

  const t2 = make();
  t2.locked(true);
  t2.D.init();
  t2.flush();
  t2.el('discOk').onclick();               // 点「我已知晓」
  ok(t2.prefs.xxmu_disc_done === '1', '「我已知晓」之后 pref 写成 1');
}

console.log('\n[4] 激活门还立着时不往教程转');
{
  const t = make();
  t.locked(true);                          // gate 没有 off
  t.D.init();
  t.flush();
  t.el('discOk').onclick();
  t.flush();
  ok(t.calls.tut === 0, '没有转教程', 'tut=' + t.calls.tut);
  ok(t.calls.onb === 0, '也没有转引导');
  ok(t.prefs.xxmu_disc_done === '1', '但仍然记为已阅（看过就是看过）');
}

console.log('\n[5] 解锁后关掉 → 转教程');
{
  const t = make();
  t.locked(false);                         // gate 已 off
  t.D.init();
  t.flush();
  t.el('discOk').onclick();
  ok(t.timers.length === 1, '排了一个转教程的定时器');
  t.flush();
  ok(t.calls.tut === 1, '教程被叫起来了', 'tut=' + t.calls.tut);
}

console.log('\n[6] replay() 不写 pref、不转教程');
{
  const t = make({ prefs: { xxmu_disc_done: '1' } });
  t.locked(false);
  t.D.init();
  t.D.replay();
  ok(t.el('disc').classList.contains('on'), '层已显示');
  t.el('discOk').onclick();
  t.flush();
  ok(t.calls.tut === 0, '重看不再转教程', 'tut=' + t.calls.tut);
  ok(t.prefs.xxmu_disc_done === '1', 'pref 仍是 1（没被改坏）');
}

console.log('\n[7] pref 读失败时当成没看过');
{
  const t = make({ prefThrows: true });
  t.locked(true);
  ok(t.D.done() === false, 'done() 返回 false（宁可多弹一次）');
  t.D.init();
  t.flush();
  ok(t.el('disc').classList.contains('on'), '仍然弹出来了');
}

console.log('\n[8] 没有 Host 时走 localStorage');
{
  const t = make({ noHost: true });
  t.locked(false);
  ok(t.D.done() === false, '没 Host 且 localStorage 空 → false');
  t.D.init();
  t.flush();
  t.el('discOk').onclick();
  ok(t.prefs.xxmu_disc_done === '1', '写进 localStorage');
  t.flush();
  ok(t.calls.tut === 1, '照样转教程', 'tut=' + t.calls.tut);
}

console.log('\n' + (failn === 0
  ? '[PASS] 通过 ' + pass + ' 项，失败 0 项'
  : '[FAIL] 通过 ' + pass + ' 项，失败 ' + failn + ' 项'));
process.exit(failn === 0 ? 0 : 1);
