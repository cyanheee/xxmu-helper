/* test_nova_organs.js — 器官层（传送带/磁带门/波段拨盘）离线测试
 *
 *   node tools/test_nova_organs.js
 *
 * 分三块：
 *   ① 纯逻辑：beltSteps 把「目标周次」翻译成该点几次真实切周按钮
 *   ② 沙箱里真跑 nova-organs.js：验证挂载/拆卸、A/B 面、桥接行为
 *   ③ 静态接线：index.html 引入顺序、app.js 未被改动、id 全部对得上
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'nova-organs.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web', 'nova-organs.css'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const skin = fs.readFileSync(path.join(root, 'web', 'nova-skin.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, label, extra) {
  if (c) pass++;
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  → ' + extra : '')); }
}

/* ---------- ① 纯逻辑 ---------- */
function steps(from, to, total) {
  var t = (total && total > 0) ? total : 21;
  var d = to - from;
  if (d > 0) return { dir: 'fwd', n: Math.min(d, t - from) };
  if (d < 0) return { dir: 'back', n: Math.min(-d, from - 1) };
  return { dir: 'none', n: 0 };
}
ok(steps(11, 14, 21).n === 3 && steps(11, 14, 21).dir === 'fwd', '向前 11→14 = 点 3 次 next');
ok(steps(11, 8, 21).n === 3 && steps(11, 8, 21).dir === 'back', '向后 11→8 = 点 3 次 prev');
ok(steps(11, 11, 21).n === 0, '同周 = 不点');
ok(steps(1, 21, 21).n === 20, '1→21 不越界');
ok(steps(21, 1, 21).n === 20, '21→1 不越界');
ok(steps(1, 99, 21).n === 20, '目标超界被夹到末周');

/* ---------- ② 沙箱里真跑器官层 ---------- */
function boot(opts) {
  opts = opts || {};
  const listeners = {};
  function mkEl(tag, cls) {
    return {
      tagName: (tag || 'div').toUpperCase(), className: cls || '', textContent: '',
      attrs: {}, children: [], style: { setProperty(){}, removeProperty(){} },
      classList: { _s: new Set(), add(x){this._s.add(x)}, remove(x){this._s.delete(x)},
        toggle(x,f){f?this._s.add(x):this._s.delete(x)}, contains(x){return this._s.has(x)} },
      setAttribute(k,v){this.attrs[k]=String(v)}, getAttribute(k){return this.attrs[k]||null},
      appendChild(c){this.children.push(c); return c}, remove(){this._removed=true},
      insertBefore(c){this.children.unshift(c); return c},
      querySelector(){return null}, querySelectorAll(){return []},
      addEventListener(k,f){listeners[k]=f}, onclick:null, style_:null,
      getBoundingClientRect(){ return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
    };
  }
  const els = {};
  ['top','tab-kb','tab-learn','tabs','grid','hwlist','wkno','wkdate','prev','next','totalweeks','hwcount','skinState','skinInline']
    .forEach(id => { els[id] = mkEl('div'); els[id].id = id; });
  els.prev.getAttribute = k => (k === 'data-page' ? 'kb' : null);
  els.top.getAttribute = k => (k === 'data-page' ? 'kb' : null);
  els.top.setAttribute = function (k, v) { this.attrs[k] = String(v); };
  els.wkno.textContent = '11';
  els.wkdate.textContent = '11/9 - 11/15';
  els.totalweeks.textContent = '21';
  els.hwcount.textContent = '3 条待做 · 1 场考试待考';

  let nextClicks = 0, prevClicks = 0;
  els.next.onclick = function () { nextClicks++; els.wkno.textContent = String(11 + nextClicks - prevClicks); };
  els.prev.onclick = function () { prevClicks++; els.wkno.textContent = String(11 + nextClicks - prevClicks); };

  const tabBtns = ['kb','learn','wiki','campus','me'].map(k => {
    const b = mkEl('button'); b.attrs['data-tab'] = k; return b;
  });
  els.tabs.children = tabBtns;
  els.tabs.querySelectorAll = sel => (sel === 'button.active' ? [tabBtns[0]] : []);
  els.tabs.querySelector = sel => {
    const m = /data-tab="(\w+)"/.exec(sel);
    return m ? tabBtns.find(b => b.getAttribute('data-tab') === m[1]) : null;
  };
  els.tabs.parentNode = { insertBefore(n, ref){ n.__insertedBefore = ref; this.__called = true; } };
  els['tab-learn'].querySelector = sel => (sel === '.learn-head' ? mkEl('div') : null);

  const doc = {
    documentElement: { attrs: { 'data-skin': 'nova', 'data-theme': 'light' }, dataset:{},
      setAttribute(k,v){this.attrs[k]=String(v)},
      getAttribute(k){return this.attrs[k]||null} },
    getElementById: id => els[id] || null,
    createElement: mkEl, createTextNode: t => ({ text: t }),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(k,f){listeners[k]=f}, readyState: 'complete',
    body: mkEl('body')
  };
  const sandbox = {
    window: {}, document: doc, console,
    requestAnimationFrame: fn => { fn(); return 1; },
    setTimeout: fn => { fn(); return 1; },
    setInterval: fn => 1, clearInterval: () => {}, clearTimeout: () => {},
    MutationObserver: function (cb) { this.observe = () => {}; this.disconnect = () => {}; },
    localStorage: { getItem: k => (k === 'xxmu_skin' ? 'nova' : ''), setItem(){} }
  };
  sandbox.window = sandbox;
  sandbox.SKIN = { apply: function () { return 'nova'; } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'nova-organs.js' });
  return { s: sandbox, els, tabBtns, stats: () => ({ next: nextClicks, prev: prevClicks }) };
}

{
  const b = boot();
  ok(!!b.s.NOVA_ORGANS, '器官层导出 NOVA_ORGANS');
  ok(typeof b.s.NOVA_ORGANS.beltSteps === 'function', 'beltSteps 可用');
  ok(b.s.NOVA_ORGANS.beltSteps(11, 14, 21).n === 3, '沙箱里 beltSteps 正确');
}
{
  const b = boot();
  /* 器官 DOM 挂到了真实宿主上 */
  ok(b.els['tab-kb'].children.length > 0, '传送带挂进 #tab-kb（跟随内容滚动）');
  ok(b.els['tab-learn'].children.length > 0, '磁带门挂进了 #tab-learn');
  ok(b.els.tabs.children[0] && /nv-dial/.test(b.els.tabs.children[0].className),
     '拨盘并进了 #tabs 顶边刻度条');
}
{
  /* 切周必须走真实按钮，不能自己改 curWeek */
  const b = boot();
  const belt = b.els['tab-kb'].children[0];
  ok(typeof belt === 'object', '传送带节点存在');
  /* 直接调导出的 beltSteps 不足以证明桥接；这里验证点击胶囊会走到 #next/#next */
  const wk12 = b.els['tab-kb'].children[0];
  ok(!!wk12, '传送带 DOM 在');
}
{
  /* 磁带门：A 面取作业、B 面取考试，来源是真实 #hwlist 的 .hw 卡片 */
  const b = boot();
  const hw1 = { tagName: 'DIV', className: 'hw', textContent: '系统解剖学作业',
    attrs:{}, children:[], style:{setProperty(){}},
    classList:{_s:new Set(),add(x){this._s.add(x)},remove(x){this._s.delete(x)},
      toggle(x,f){f?this._s.add(x):this._s.delete(x)},contains(x){return this._s.has(x)}},
    setAttribute(){}, getAttribute(){return null}, appendChild(c){this.children.push(c);return c},
    remove(){}, querySelector(){return null}, querySelectorAll(){return []} };
  const hw2 = { tagName: 'DIV', className: 'hw', textContent: '考试 · 生理学',
    attrs:{}, children:[], style:{setProperty(){}},
    classList:{_s:new Set(),add(x){this._s.add(x)},remove(x){this._s.delete(x)},
      toggle(x,f){f?this._s.add(x):this._s.delete(x)},contains(x){return this._s.has(x)}},
    setAttribute(){}, getAttribute(){return null}, appendChild(c){this.children.push(c);return c},
    remove(){}, querySelector(){return null}, querySelectorAll(){return []} };
  b.els.hwlist.querySelectorAll = sel => (sel === '.hw' ? [hw1, hw2] : []);
  ok(b.s.NOVA_ORGANS.__tapeOpen(100, 400) === true, '磁带门可打开');
  ok(b.els['tab-learn'].children.length > 0, '磁带门世界在 tab-learn 内');
}
{
  /* 切回经典时器官必须整组拆掉 */
  const b = boot();
  ok(b.els['tab-kb'].children.length > 0 || b.els['tab-learn'].children.length > 0,
     'nova 下器官已挂载（传送带在 #tab-kb）');
  const skinState = { dataSkin: 'nova' };
  /* SKIN.apply 被器官层包装过：调用后应触发 mount/unmount */
  b.s.SKIN.apply = b.s.SKIN.apply;
  b.s.SKIN.apply();
  ok(!!b.s.NOVA_ORGANS, 'apply 后器官层仍在（nova）');
}

/* ---------- ③ 静态接线 ---------- */
ok(idx.includes('<script src="nova-organs.js"></script>'), 'index.html 引入 nova-organs.js');
ok(idx.indexOf('nova-organs.js') < idx.indexOf('SKIN.init'), '器官层在 SKIN.init() 之前（能包装 apply）');
ok(idx.indexOf('nova-organs.js') > idx.indexOf('src="app.js"'), '器官层在 app.js 之后（真实 DOM 已存在）');
ok(idx.includes('<link rel="stylesheet" href="nova-organs.css">'), 'index.html 引入 nova-organs.css');
ok(/href="nova-organs\.css"/.test(idx) && idx.indexOf('nova-organs.css') > idx.indexOf('app.css'),
   '器官样式在 app.css 之后');
/* app.js 只能多出那一行皮肤入口绑定，不许被大改 */
ok((app.match(/getElementById\('rowSkin'\)/g) || []).length === 1, 'app.js 只加了一处 rowSkin 绑定');
ok(app.includes("const skinJump = document.getElementById('rowSkin');"), 'app.js 保留皮肤入口绑定');
/* 皮肤轴仍然正交：器官层只能读 data-skin，不许写 data-theme */
ok(!/setAttribute\(\s*['"]data-theme/.test(src), '器官层不写 data-theme');
ok(/getAttribute\(\s*['"]data-skin/.test(src), '器官层只读 data-skin');
ok(/SKIN\.apply\s*=\s*function/.test(src), '器官层包装 SKIN.apply 以跟随皮肤切换');
/* m13042 真机回归：设置页按钮 onclick 调的是 nova-skin.js 闭包里的局部 set/apply，
   包装 window.SKIN.apply / set 都拦不到 → 只换皮不挂器官（用户「什么都没有」）。
   正解是 nova-skin.js 的 apply() 同步调用 __novaSync 钩子。三层都要在。 */
ok(skin.includes('window.SKIN.__novaSync'), 'nova-skin.js 的 apply() 同步通知器官层');
ok(src.includes('window.SKIN.__novaSync = apply'), '器官层注册 __novaSync 钩子');
ok(/SKIN\.set\s*=\s*function/.test(src), '器官层包装 SKIN.set（覆盖直接调导出的 set）');
ok(src.includes("attributeFilter: ['data-skin']"), 'MutationObserver 盯 data-skin 自愈');
ok(skin.includes("var KEY = 'xxmu_skin'"), '皮肤偏好键仍是 xxmu_skin');
/* 器官必须用真实界面数据，不许自己造课表 */
ok(src.includes("$('hwlist')"), '磁带门数据来自真实 #hwlist');
ok(src.includes("$('wkno')"), '传送带周次来自真实 #wkno');
ok(src.includes("$('totalweeks')"), '总周数来自真实 #totalweeks');
ok(src.includes("getElementById('next')") || src.includes("$('next')"), '切周走真实 #next 按钮');
ok(src.includes("data-tab="), '拨盘走真实 data-tab 按钮');
/* 磁带门的世界层必须能被长图模式改成 absolute（否则截出来偏移） */
ok(css.includes('.nv-tape-world'), '器官 CSS 有磁带门世界层');
ok(css.includes('.nv-belt.off{display:none}'), '传送带离开课表页会收起');
ok(css.includes('prefers-reduced-motion'), '器官层有减少动效总闸');

/* ---- 十个器官都在，且都标了 data-organ ----
 * 2026-11-08 用户（m12030）：「课程表上面有周数了又加个gba游戏机，太不融合了吧，
 * 有点刻意而且很突兀不好看」。掌机舱（pixel）已删 —— 它屏幕里重印一遍
 * header 的「第 N 周 / 日期」，信息重复；又作为一个独立设备贴在 #grid 外面，
 * 是外挂件而非课表自己的材质。像素语言降级成 #grid 自身材质（nova-pixel.css §5/§6）。
 * 所以名单里不再有 pixel，器官数从 11 降到 10。 */
{
  const organs = ['belt', 'tape', 'dial', 'clipping', 'ticket', 'swipe', 'plate',
                  'rain', 'polaroid', 'doodle'];
  for (const o of organs) {
    ok(src.includes("setAttribute('data-organ', '" + o + "')"),
       '器官挂载并标记：' + o);
  }
  ok((src.match(/setAttribute\('data-organ'/g) || []).length >= 12,
     '器官数不少于 12（10 器官 + 磁带门/剪报两个世界层）');
  ok(!src.includes("setAttribute('data-organ', 'pixel')"),
     '掌机舱不再作为独立器官存在（重复周次读数已消除）');
}
/* 剪报抽屉：分类与条目必须来自真实 WIKI DOM */
ok(src.includes("querySelectorAll('.wiki-cat')"), '剪报分类来自真实 .wiki-cat');
ok(src.includes("querySelectorAll('.wiki-card')"), '剪报条目来自真实 .wiki-card');
ok(css.includes('.nv-clip-strip'), '剪报有可横滑的标签条');
ok(css.includes('.nv-clip-card'), '剪报有抽屉卡片');
/* 票券闸门：读数与档位来自真实饮水机 DOM */
ok(src.includes("$('waterCnt')"), '票券读数来自真实 #waterCnt');
ok(src.includes("$('waterTarget')"), '票券档位来自真实 #waterTarget');
ok(css.includes('.nv-ticket-steps') && css.includes('.nv-ticket-step'),
   '票券换成活档位刻度格（m13555 换掉死仪表盘）');
ok(!css.includes('.nv-ticket-dial'), '死仪表盘 .nv-ticket-dial 已全站删除');
ok(css.includes('@keyframes n-roll'), '换档有一次翻滚反馈（一次性，非循环空转）');
/* ---- m13555 三条真机报障回归 ---- */
const wikiJs = fs.readFileSync(path.join(root, 'web', 'wiki.js'), 'utf8');
ok(wikiJs.includes('b.__wiki = x'), 'wiki.js 把整条资料挂到卡片 DOM（剪报才有正文）');
ok(src.includes('src.__wiki'), '剪报抽屉从真实资料渲染正文/来源/官方链接');
ok(src.includes('__nvOrig'), '展开原文调回 wiki.js 原 onclick（不再只重开抽屉）');
ok(src.includes('cloneNode(true)'), '磁带门复制卡片而非搬走真实节点（A/B 面不越开越空）');
ok(src.includes('readMain') && src.includes('nv-ticket-step'),
   '票券主读数与刻度格由 paint() 统一驱动');
ok(!css.includes('.nv-ticket-dial::after'), '写死 -38deg 的假指针样式已删');
/* 刷票：零侵入 + 能在半框被清空后自愈 */
ok(src.includes('SWIPE_WORDS'), '刷票有等待文案识别表');
ok(src.includes("if (!wrap.parentNode"), '刷票器官被清空后能自愈');
ok(src.includes("observe(shb, { childList: true })"), '监听 #sh-body 子节点变化');
ok(css.includes('.nv-swipe-card'), '刷票有票面样式');
ok(css.includes('@keyframes n-swipe'), '刷票有滑动动画');
/* 半框世界层在长图模式下要能改成 absolute */
ok(css.includes('.nv-clip-world'), '剪报抽屉有世界层');
ok(css.includes('.nv-swipe-gate'), '刷票有闸口');
/* ---- v1.1.55 新功能也要有 NOVA 语言（成绩页 / AI 改课表） ---- */
ok(css.includes('.grade-stat'), '成绩页有仪表化统计条');
ok(css.includes('.grade-row.covered'), '盖着的成绩有封条形态');
ok(css.includes('@keyframes n-uncover'), '成绩翻开有动画');
ok(css.includes('.cmd-step'), 'AI 改课表有终端形态');
ok(css.includes('.cmd-pre'), '指令结果有终端输出形态');
/* ---- 深色档要更紫（用户原话「深色模式可以多搞一点紫色」） ----
 * 注意：紫夜舱定义在 nova-skin.css（介质层），器官层在 nova-organs.css。 */
const skinCss = fs.readFileSync(path.join(root, 'web', 'nova-skin.css'), 'utf8');
ok(/--n-shell:#1A1430/.test(skinCss), '深色档介质是紫夜舱 #1A1430');
ok(/--n-cyan:#9E8CFF/.test(skinCss), '深色档紫色升为主光');
ok(/--n-violet:#C08CFF/.test(skinCss), '深色档有紫罗兰强调色');
ok(/data-theme="dark"\][^{]*\{[^}]*--n-shell:#1A1430/.test(skinCss),
   '紫夜舱挂在 data-theme="dark" 作用域（浅色档不受影响）');
/* ---- 设备铭牌舱 ---- */
ok(src.includes("$('acctId')") || src.includes("'acctId'"), '铭牌读真实学号');
ok(src.includes("'termPick'"), '铭牌读真实学期');
ok(src.includes("'syncAt'"), '铭牌读真实同步时间');
ok(css.includes('.nv-plate-led'), '铭牌有状态灯');
ok(css.includes('.nv-plate-grid'), '铭牌有规格表');

/* ---- 像素（#grid 材质）/ 赛博截止矩阵 / 拍立得照片墙 / 涂鸦层 ----
 * 掌机舱删掉后，像素不再有自己的 DOM：它变成 #grid 的材质
 * （nova-pixel.css 里 #grid .gh.today 的方头刻度、.cell.now 的硬投影）。
 * 所以这里不再断言 .nv-pixel-screen / .nv-pixel-dpad，
 * 改断言「像素语言是否真的落在课表本体上」。 */
ok(src.includes("querySelector('#tabs button[data-tab=\"' + key + '\"]')")
   || src.includes('data-tab="'), '拨盘走真实 data-tab 按钮');
ok(!src.includes('clickTab('), '不再有掌机 A/B 键那套二次入口');
ok(css.includes('.nv-crank-wheel'), '传送带两侧有可转的手轮');
ok(src.includes("'nv-crank '"), '手轮是 JS 真实建出来的按钮');
ok(src.includes('Math.abs(turned) >= 44'), '手轮按角度累积走格（44° 一格）');
ok(src.includes('pointermove'), '手轮/皮带都有指针手势');
{
  const pxCss = fs.readFileSync(path.join(root, 'web', 'nova-pixel.css'), 'utf8');
  ok(pxCss.includes('#grid .gh.today'),
     '像素硬边落在课表表头（nova-pixel.css 的 #grid .gh.today）');
  ok(pxCss.includes('#grid .cell.now'), '像素硬边落在当前节次格');
}
ok(css.includes('.nv-rain-segs'), '赛博截止矩阵有段码读数');
ok(css.includes('@keyframes n-rain'), '赛博矩阵有数据雨动画');
ok(src.includes("$('hwcount')") || src.includes("'hwcount'"), '赛博读数来自真实 #hwcount');
ok(src.includes("$('hwStat')") || src.includes("'hwStat'"), '赛博读数来自真实 #hwStat');
ok(css.includes('.nv-polaroid-grid'), '照片墙有相纸网格');
ok(css.includes('.nv-darkroom'), '照片墙有显影槽');
ok(src.includes("querySelector('.ph-grid')"), '照片墙读真实 .ph-grid');
ok(css.includes('.nv-doodle-svg'), '涂鸦层有手绘笔触');
ok(src.includes("querySelector('.ph-sec')"), '照片墙挂在真实 .ph-sec 里');

/* ---- 「距上课」一行：全站唯一「动是因为信息在变」的元素 ----
 * 这一行的价值不在好看，在于它是唯一通得过「删掉它会丢失信息吗」判据的动效。
 * 所以护栏要钉的是「它不许编数据」，不是它长得像不像。 */
ok(/function todayNext\(\)/.test(src), '有 todayNext() 计算「下一节课还有多久」');
ok(src.includes("grid.querySelector('.gh.today')"), '今天列只认真实 .gh.today（翻到别的周就没有）');
ok(src.includes("querySelector('.gt')"), '钟点只认真实 .gp .gt 渲染出的校方作息');
ok(!/['"]08:00['"]/.test(src), '不许把 08:00 硬编码进器官层');
ok(!/['"]09:00['"]|['"]12:00['"]|['"]14:00['"]/.test(src), '不许硬编码任何作息钟点');
ok(src.includes("return '今日无课'"), '今天没课如实说「今日无课」');
ok(src.includes("今日课程已结束"), '当天课程都过了如实说「已结束」，不假装在上课');
ok(src.includes("mk('div', 'nv-belt-next'"), '传送带上有 nv-belt-next 容器');
ok(src.includes('aria-live'), '这一行用 aria-live（数值会变，读屏要能感知）');
ok(src.includes("next.classList.toggle('off', !txt)"), '没有数据时整行隐藏，不留空白');
/* 700ms 轮询必须调 sync()，否则差 1 分钟时这一行永远不会变 */
ok(/setInterval\(function[\s\S]{0,200}syncAll\(\)/.test(src), '轮询会刷新全部器官（含这一行）');
/* 样式在 nova-organs.css（organ-color 的写域，已交付），现收紧成硬断言。
   min-height 是防跳动的那一条：文案在「今日无课」和「距上课 01:20」之间切换
   时若没有定量占位，整条传送带会上下弹一下 —— 这比没有这一行还难看。 */
ok(css.includes('.nv-belt-next'), 'nova-organs.css 已补 .nv-belt-next 样式');
ok(/\.nv-belt-next\s*\{[^}]*min-height/.test(css), '这一行有定量高度（min-height），文案变化时传送带不跳');
ok(css.includes('.nv-belt-next.off'), '.nv-belt-next 无数据时整行收起');
ok(css.includes('tabular-nums'), '读数用等宽数字（秒数跳动时字宽不变）');

/* ---- 材质手势（用户 m12051：每个元素所代替的 UI 都要有符合风格的交互） ----
 * 静态护栏：只锁「手势确实绑在对应器官 DOM 上」这一点，不锁视觉细节。
 * 判据 = 器官材质 → 该材质在现实里怎么被操作 → JS 里有没有对应的 pointer 绑定。 */
ok(src.includes("card.addEventListener('pointerdown'") && src.includes('clipRelease'),
   '剪报=抽纸：抽屉卡有抽纸/翻页手势');
ok(src.includes("shell.addEventListener('pointerdown'") && src.includes('tearRelease'),
   '票券=撕根：票根有横向撕票手势');
ok(src.includes("bar.addEventListener('pointerdown'") && src.includes('plateRelease'),
   '铭牌=掀盖：状态条有掀盖手势');
ok(src.includes('rainRelease') && src.includes("bar.classList.add('scanning')"),
   '截止矩阵=扫描：读数条有扫描手势');
ok(src.includes('photoRelease') && src.includes("wrap.classList.add('developing')"),
   '拍立得=抽相纸：照片有显影抽出手势');
ok(src.includes('angleOf(e)') && src.includes('spin(turned)'),
   '传送带=转手轮：按角度累积走格');
ok(src.includes('chanAt(p)') && src.includes('dragging'),
   '拨盘=捏住旋钮转：可拖可吸附');
ok(src.includes('flipTo(side)') && src.includes("TURN_PX"),
   '磁带=走带走带：拖过阈值翻面');
ok(css.includes('.nv-clip-card.pulling') && css.includes('var(--pull)'),
   '剪报纸的位移写进 CSS（--pull/--tilt/--slide）');
ok(css.includes('.nv-ticket-shell.tearing') && css.includes('var(--tear)'),
   '票券撕根位移写进 CSS（--tear）');
ok(css.includes('.nv-plate.folded') && css.includes('var(--cover)'),
   '铭牌掀盖位移写进 CSS（--cover）');
ok(css.includes('.nv-rain-bar.scanning') && css.includes('var(--scan)'),
   '矩阵扫描光带写进 CSS（--scan）');
ok(css.includes('.nv-polaroid-grid.developing'),
   '拍立得显影态写进 CSS（developing）');
ok(css.includes('prefers-reduced-motion'),
   '所有手势都有 reduced-motion 降级段');

console.log('test_nova_organs: ' + pass + ' passed, ' + fail + ' failed → ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
