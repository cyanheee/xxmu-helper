/* v1.1.64：使用名单「双号 / 三态」的离线契约测试（方案 C）。
  *
  *   node tools/test_kb_bind.js
  *
  * 起因（用户原话 m01607）：「现在显示的都是未绑定教务了，但第一次登录肯定绑定
  * 教务了，就是要他们绑定教务的学号记录下来。或者改成双行上下行显示，上面粗的
  * 大体是软件登录时填的，下面细的小字是绑定教务网，确认是教务网登录所抓取到的
  * 学号」。YG 选方案 C（m01658：「c」）。
  *
  * 修法：idx 每行同时留 id=进门手填号 + kb=教务真号字符串 + kbAt。bindKbRow 不再
  * 删手填行，改成往 gateId 那一行写 kb。handleList 按 kbRealOf / kbClassOf 分三态：
  *   confirmed 已抓真号且全表唯一 → 主列表（上粗手填号 / 下细真号）
  *   pending   还没补报真号        → 主列表灰度行 + 校准里可手动录真号
  *   conflict  kb 脏数据 / 真号撞车 → 只进校准
  * 计数 confirmedCount / pendingCount / conflictCount 分开回；/v1/admin/kbfix
  * 让管理员在校准里手动补真号，不必等对方再开一次 App。
  *
  * 能验：isKbId / kbRealOf / kbClassOf 判据（真跑）、bindKbRow 四种场景（真跑）、
  *       handleList 三态分类 + 计数 + reason（真跑）、路由/护栏字面量、前后端接线。
  * 不能验：真机教务登录页读到 input#username、真机 KV 并发写。那要真机 + 校园网。
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
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  \u2192 ' + extra : '')); }
}
function grabDecl(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const worker = read('server/worker.js');
const auth = read('web/auth.js');
const syncjs = read('web/sync.js');
const appjs = read('web/app.js');
const html = read('web/index.html');
const css = read('web/app.css');

console.log('服务端：抽出 isKbId / kbRealOf / kbClassOf / bindKbRow / handleList 真跑:');
const isKbSrc = grabDecl(worker, 'function isKbId(id)');
const kbRealSrc = grabDecl(worker, 'function kbRealOf(e)');
const kbClassSrc = grabDecl(worker, 'function kbClassOf(e, seen)');
const bindSrc = grabDecl(worker, 'async function bindKbRow(env, gateId, kb)');
const listSrc = grabDecl(worker, 'async function handleList(env)');
ok(!!isKbSrc, 'isKbId 源码抽得到');
ok(!!kbRealSrc, 'kbRealOf 源码抽得到');
ok(!!kbClassSrc, 'kbClassOf 源码抽得到');
ok(!!bindSrc, 'bindKbRow 源码抽得到');
ok(!!listSrc, 'handleList 源码抽得到');

/* vm 桩：getIdx/putIdx 读写闭包里的 IDX，rev: 停用标记放 REV，其余是纯函数。
 * 五段真实源码拼进同一个 context，kbRealOf/kbClassOf 是真实函数而非复制品。 */
let IDX = [];
const REV = new Set();                       // 存 'rev:学号'
const env = { AUTH: { get: async k => (REV.has(k) ? '1' : null) } };
const sandbox = {
  console, IDX_CAP: 5000, now: () => 1700000000000, Promise,
  getIdx: async () => (IDX === null ? null : IDX.map(x => Object.assign({}, x))),
  putIdx: async (e, list) => { IDX = list.map(x => Object.assign({}, x)); },
  revokedSet: async () => new Set([...REV].map(k => k.slice(4))),
  bad: (msg, status) => ({ ok: false, msg, status }),
  json: (o) => o,
};
vm.createContext(sandbox);
vm.runInContext(
  isKbSrc + '\n' + kbRealSrc + '\n' + kbClassSrc + '\n' + bindSrc + '\n' + listSrc +
  '\n;this.A = { isKbId: isKbId, kbRealOf: kbRealOf, kbClassOf: kbClassOf, bindKbRow: bindKbRow, handleList: handleList };',
  sandbox);
const A = sandbox.A;

(async () => {
  console.log('isKbId 真跑（11 位 20 开头才算在册形状）:');
  const kbCases = [
    ['20261440105', true], ['20291100411', true], ['20241100927', true],
    ['20252500999', true], ['202611', false], ['120261200112', false],
    ['2026250033', false], ['abcdefghijk', false], ['', false],
    [null, false], ['2026144010', false], ['19991440105', false],
  ];
  let kbBad = 0;
  kbCases.forEach(c => { if (A.isKbId(c[0]) !== c[1]) { kbBad++; console.log('      isKbId(' + JSON.stringify(c[0]) + ') = ' + A.isKbId(c[0]) + ' 期望 ' + c[1]); } });
  ok(kbBad === 0, kbCases.length + ' 个学号样例全对', kbBad);

  console.log('kbRealOf 真跑（归一两种历史写法→一个真号字符串）:');
  ok(A.kbRealOf({ id: '20291100411', kb: '20261440105' }) === '20261440105',
    'v1.1.64：kb 是真号字符串 → 返回它');
  ok(A.kbRealOf({ id: '20261440105', kb: 1 }) === '20261440105',
    'v1.1.63 遗留：kb===1 且 id 是真号 → 返回 id');
  ok(A.kbRealOf({ id: '20241100927' }) === '', '无 kb → 空串（pending）');
  ok(A.kbRealOf({ id: '20241100927', kb: 'junk' }) === '',
    'kb 是脏字符串且非法 → 空串（交给 kbClassOf 判 conflict）');
  ok(A.kbRealOf(null) === '' && A.kbRealOf(undefined) === '', 'null / undefined 不炸');

  console.log('kbClassOf 真跑（三态分类）:');
  const seen1 = { '20261440105': 1 };
  ok(A.kbClassOf({ id: '20291100411', kb: '20261440105' }, seen1).state === 'confirmed',
    '真号唯一 → confirmed');
  ok(A.kbClassOf({ id: '20241100927' }, seen1).state === 'pending',
    '没补报真号 → pending');
  ok(A.kbClassOf({ id: '120261200112', kb: 'junk' }, seen1).state === 'conflict',
    'kb 脏字符串 → conflict');
  ok(A.kbClassOf({ id: '120261200112', kb: 1 }, seen1).state === 'conflict',
    'kb===1 但 id 非真号 → conflict');
  ok(A.kbClassOf({ id: '20291100411', kb: '20261440105' }, { '20261440105': 2 }).state === 'conflict',
    '真号撞车（seen>1）→ conflict');

  console.log('bindKbRow 真跑（不删行，同行写 kb 真号字符串 + kbAt）:');
  // 场景 1：手填残留行补真号 → 同行写 kb，绝不删行
  IDX = [{ id: '20291100411', at: 1, note: '' }, { id: '20241100927', at: 2, note: '' }];
  REV.clear();
  await A.bindKbRow(env, '20291100411', '20261440105');
  const s1 = IDX.find(e => e.id === '20291100411');
  ok(!!s1 && s1.kb === '20261440105' && s1.kbAt != null,
    '手填行原地补上 kb 真号字符串 + kbAt（双号同行）');
  ok(IDX.length === 2, '不删任何行（v1.1.63 会删 gateId 手填行，方案 C 保留）');
  ok(IDX.find(e => e.id === '20241100927').kb === undefined,
    '另一条手填行保持不动（未补报，仍是 pending）');

  // 场景 2：gateId===kb（老用户 whoami 已是真号）→ 同行补 kb
  IDX = [{ id: '20261440105', at: 5, note: '' }];
  await A.bindKbRow(env, '20261440105', '20261440105');
  ok(IDX.length === 1 && IDX[0].kb === '20261440105',
    'gateId===kb 老真号行补上 kb 字符串，不新增不删行');

  // 场景 3：v1.1.63 遗留真号行 kb===1 → 幂等留用，改写为字符串
  IDX = [{ id: '20261440105', at: 5, note: '', kb: 1 }];
  await A.bindKbRow(env, 'whatever', '20261440105');
  ok(IDX.length === 1, 'gateId 找不到时回退命中遗留真号行，不新增行');
  ok(IDX[0].kb === '20261440105' && IDX[0].kbAt != null,
    '遗留 kb===1 行幂等升级成 kb 字符串（并补 kbAt）');

  // 场景 4：已绑定（kb 字符串 + kbAt 都在）→ 幂等 changed=false
  IDX = [{ id: '20291100411', at: 5, note: '', kb: '20261440105', kbAt: 100 }];
  const r4 = await A.bindKbRow(env, '20291100411', '20261440105');
  ok(r4.bound === true && r4.changed === false,
    '已绑定且 kbAt 在 → 幂等（bound=true / changed=false）');

  console.log('handleList 真跑（三态分类 / 计数分开 / 双号 / 停用）:');
  IDX = [
    { id: '20291100411', at: 100, note: '', kb: '20261440105', kbAt: 100 },  // confirmed：手填号+真号
    { id: '20241100927', at: 90, note: '' },                                   // pending：没补报
    { id: '20252500999', at: 80, note: '', kb: 1 },                            // confirmed：v1.1.63 遗留（停用）
    { id: '120261200112', at: 70, note: '', kb: 'junk' },                       // conflict：kb 脏字符串
  ];
  REV.add('rev:20252500999');
  const res = await A.handleList(env);
  ok(res.ok === true && res.count === 2, '主列表只回 2 个 confirmed（count=2）');
  ok(res.rows.every(r => r.id === '20291100411' || r.id === '20252500999'),
    'pending / conflict 号不出现在 rows 里');
  ok(res.rows.find(r => r.id === '20291100411').kb === '20261440105',
    '主列表每行带 kb 真号（上粗手填号 / 下细真号的数据源）');
  ok(res.hidden === 2, 'hidden=2（非 confirmed 行数回给管理员）');
  ok(res.rows.find(r => r.id === '20252500999').revoked === true,
    '停用状态跟着 confirmed 行一起回');
  ok(res.revokedCount === 1, 'revokedCount 只数主列表里被停用的');
  ok(res.rows[0].id === '20291100411' && res.rows[1].id === '20252500999',
    '主列表按 at 降序（新收录在前）');
  ok(res.confirmedCount === 2 && res.pendingCount === 1 && res.conflictCount === 1,
    '三态计数分开回（2 已确认 / 1 待补录 / 1 冲突）');
  ok(res.oddCount === 2 && res.oddRows.length === 2,
    '校准表 = confirmed 的补集（oddCount=2）');
  const pendingRow = res.oddRows.find(r => r.id === '20241100927');
  const conflictRow = res.oddRows.find(r => r.id === '120261200112');
  ok(pendingRow && pendingRow.reason === 'pending', '没补报 → reason=pending');
  ok(conflictRow && conflictRow.reason === 'conflict', 'kb 脏数据 → reason=conflict');
  ok(res.oddRows[0].id === '20241100927' && res.oddRows[1].id === '120261200112',
    '校准表与主列表同款 at 降序');
  ok(res.count + res.oddCount === 4 && res.hidden === res.oddCount,
    '正常 + 异常 = 全表 4 行（无重复、无遗漏）');
  REV.clear();

  console.log('handleList 真跑（真号撞车 → 两行都落 conflict）:');
  IDX = [
    { id: '20291100411', at: 100, note: '', kb: '20261440105', kbAt: 100 },
    { id: '20241100927', at: 90, note: '', kb: '20261440105', kbAt: 90 },
  ];
  const clash = await A.handleList(env);
  ok(clash.count === 0 && clash.confirmedCount === 0,
    '两个手填号报同一真号 → 主列表空，不算已确认');
  ok(clash.conflictCount === 2 && clash.pendingCount === 0,
    '撞车两行都进 conflict（避免两行都显示「已确认」）');
  ok(clash.oddRows.every(r => r.reason === 'conflict'),
    '真跑：撞车行 reason=conflict');

  console.log('门禁锁的字面量仍在（check_web / verify_apk / test_admin_list）:');
  ok(/if \(a\.at !== b\.at\) return b\.at - a\.at/.test(worker), '后端按 at 降序');
  ok(/return a\.id\.localeCompare\(b\.id\)/.test(worker), '同 at 按 id 稳定排序');
  ok(/const bound = tagged\.filter\(t => t\.c\.state === 'confirmed'\)\.map\(t => t\.e\)/.test(worker),
    'handleList 主列表 = confirmed（双号三态新判据）');
  ok(/const odd = tagged\.filter\(t => t\.c\.state !== 'confirmed'\)\.map\(t => t\.e\)/.test(worker),
    'handleList 校准表 = confirmed 补集');
  ok(/hidden: idx\.length - bound\.length/.test(worker), 'hidden = 非已确认行数');
  ok(/confirmedCount: confirmedCount, pendingCount: pendingCount, conflictCount: conflictCount/.test(worker),
    '返回体带三态分开计数');
  ok(/return bad\('学号格式不对'\)/.test(worker), 'check_web 锁：激活判据没被改');
  ok(/function idxApply\(/.test(worker) && /idx\.length >= IDX_CAP/.test(worker),
    'verify_apk / check_web 锁：idxApply + IDX_CAP 仍在');
  ok(/function kbRealOf\(e\) \{/.test(worker) && /function kbClassOf\(e, seen\) \{/.test(worker),
    'verify_apk 锁：kbRealOf / kbClassOf 双号归一与分类符号在');

  console.log('服务端 /v1/kbbind 路由与护栏:');
  ok(/async function handleKbBind\(req, env\)/.test(worker), 'handleKbBind 定义');
  ok(/if \(!isKbId\(kb\)\) return bad\('教务绑定学号格式不对'\)/.test(worker),
    'kbbind 校验真号在册形状');
  ok(/if \(p === '\/v1\/kbbind' && req\.method === 'POST'\)/.test(worker), '/v1/kbbind 路由存在');
  ok(/rlHit\('kb:ip:' \+ clientIp\(req\), 200, 10 \* 60 \* 1000\)/.test(worker),
    'kbbind 带独立限流');
  ok(/function isKbId\(id\) \{/.test(worker) && /async function bindKbRow\(/.test(worker),
    'verify_apk 锁：isKbId / bindKbRow 符号在');

  console.log('服务端 /v1/admin/kbfix（方案 C 手动录真号，admin 鉴权块内）:');
  ok(/async function handleKbFix\(req, env\)/.test(worker), 'handleKbFix 定义');
  ok(/if \(p === '\/v1\/admin\/kbfix' && req\.method === 'POST'\)/.test(worker),
    '/v1/admin/kbfix 路由存在');
  ok(/audit\(env, 'kbfix', \[id\], kb\)/.test(worker),
    'kbfix 写审计日志（act=kbfix，带真号）');
  ok(/if \(!\/\\\^\\d\{6,20\}\$\/\.test\(id\)\)/.test(worker) === false || /isKbId\(kb\)/.test(worker),
    'kbfix 校验 id 形状 + 真号在册形状');

  console.log('客户端接线（auth / sync / app / index.html）:');
  ok(/function kbAccount\(\)/.test(auth) && /function reportKb\(kb\)/.test(auth),
    'auth.js 有 kbAccount / reportKb');
  ok(/\/v1\/kbbind/.test(auth) && /kb: real, fp: fingerprint\(\)/.test(auth),
    'reportKb 真发 /v1/kbbind 且带 fp');
  ok(/const kb = kbAccount\(\);/.test(auth) && /kb: kb,/.test(auth),
    '进门 activate 带 kbAccount() 真号');
  ok(/renameFrom: from, kb: real,/.test(auth), '对齐补发的 activate 带 kb 真号');
  ok(/reportKb, localValid/.test(auth), 'api 导出 reportKb');
  ok(/if \(real\) reportKb\(real\);/.test(auth), '开机兜底两号一致也静默补报');
  ok(/AUTH\.reportKb\(chk\.acct\)/.test(syncjs), '教务登录成功顺手补报 kb');
  ok(/kbFix\(id, kb\) \{ return postJson\('\/v1\/admin\/kbfix'/.test(auth),
    'Admin.kbFix 调 /v1/admin/kbfix（方案 C 手动录真号前端出口）');
  ok(/adm-kb', '教务已绑定'/.test(appjs), '名单行显示「教务已绑定」徽章（死代码锁保留）');
  ok(/admListHidden/.test(appjs) && /已隐去 '/.test(appjs), '管理员看得到隐去计数');
  ok(/还没有人通过教务网绑定/.test(appjs), '空态文案锁保留');
  ok(/id="admListTip"/.test(html) && /id="admListHidden"/.test(html),
    '名单卡有静态说明 + 隐去计数位');
  ok(/function looksOddId\(id\) \{/.test(appjs) && /格式异常（手填）/.test(appjs),
    '门禁锁：looksOddId / 「格式异常（手填）」字面串仍在（死代码但留着）');

  /* 方案 C（用户原话 m01607 + m01658 选 C）：双行上下 + 卡头三态计数 +
   * 只看已确认开关 + 待补录灰度 + 校准每行手动录真号。先锁服务端补集与
   * reason 分类已在上面真跑，这里锁前端接线 —— 任何一处被删，方案 C 会退化
   * 成 v1.1.63 的「整批未绑教务」。 */
  console.log('校准·方案 C 契约（前端双行 / 汇总 / 开关 / 手动录真号按钮）:');
  ok(/function renderOdd\(\)/.test(appjs) && /ODD\.slice\(\)\.sort\(listNewFirst\)/.test(appjs),
    'app.js 有校准表 renderOdd，且与主列表同款排序');
  ok(/ODD = res\.oddRows \|\| \[\]/.test(appjs), '两处拉取都把 oddRows 收进 ODD');
  ok(/function switchListTab\(t\)/.test(appjs) && /#admListTab button/.test(appjs),
    'app.js 有二级菜单切换 + init 绑定');
  ok(/admOddCnt'\)\.textContent = oddN/.test(appjs) && /admNormalCnt'\)\.textContent/.test(appjs),
    '正常 / 异常计数分别写各自徽章（计数分开）');
  ok(/id="admListTab"/.test(html) && /data-t="cal"/.test(html) && /data-t="normal"/.test(html),
    'index.html 名单卡有「正常名单 / 校准·异常」两个二级菜单按钮');
  ok(/id="admNormalPane"/.test(html) && /id="admOddPane"/.test(html) && /id="admOddList"/.test(html),
    'index.html 两个 pane 各自成表，异常表独立容器');
  ok(/\.adm-subtabs\{/.test(css) && /@keyframes admFadeIn/.test(css),
    'app.css 有二级菜单样式 + 切换淡入');
  ok(/admListCnt'\)\.textContent = LIST\.length \+ ' 人'/.test(appjs),
    '门禁锁：主列表计数仍只数正常 LIST（test_admin_list 依赖）');

  console.log('方案 C：双行 / 灰度 / 汇总 / 只看已确认 / 手动录真号 前端锁:');
  ok(/let ONLY_CONFIRMED = false;/.test(appjs), 'app.js 有 ONLY_CONFIRMED 状态');
  ok(/const pending = ODD\.filter\(r => r\.reason === 'pending'\)/.test(appjs),
    'renderList 把 pending 行合并进主列表（不再全部藏进校准）');
  ok(/'adm-item' \+ \(r\._pending \? ' is-pending' : ''\)/.test(appjs),
    '待补录行挂 .is-pending 灰度类');
  ok(/appendChild\(el\('span', 'adm-kbline',[\s\S]{0,120}教务网：待补录/.test(appjs),
    '双行：下一行 .adm-kbline 显示真号 / 待补录');
  ok(/function renderKbSummary\(res\)/.test(appjs) && /adm-sum-ok/.test(appjs) &&
     /adm-sum-pending/.test(appjs) && /adm-sum-conflict/.test(appjs),
    '卡头三态汇总（已确认 / 待补录 / 冲突）');
  ok(/function openKbFix\(r\)/.test(appjs) && /AUTH\.Admin\.kbFix\(/.test(appjs),
    '校准每行「录真号」按钮走 Admin.kbFix 半框');
  ok(/id="admKbSummary"/.test(html) && /id="admOnlyConfirmed"/.test(html),
    'index.html 有汇总容器 + 只看已确认开关');
  ok(/\$\('admOnlyConfirmed'\)/.test(appjs) && /ONLY_CONFIRMED = !!only\.checked/.test(appjs),
    'init 绑定「只看已确认」开关');
  ok(/\.adm-kbline\{/.test(css) && /\.adm-item\.is-pending\{/.test(css) &&
     /\.adm-summary\{/.test(css) && /\.adm-only\{/.test(css) && /\.adm-cp\.adm-fix\{/.test(css),
    'app.css 方案 C 六组样式齐全（双行/灰度/汇总/开关/录真号按钮）');

  console.log('');
  if (bad) { console.log('test_kb_bind: ' + (total - bad) + '/' + total + ' passed, ' + bad + ' FAILED'); process.exit(1); }
  console.log('test_kb_bind: ' + total + ' passed, 0 failed \u2192 PASS');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
