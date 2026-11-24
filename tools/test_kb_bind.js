/* v2.16.0：使用名单「只记教务网登录成功的真号」的离线契约测试。
  *
  *   node tools/test_kb_bind.js
  *
  * 起因（用户 m00218）：管理控制台里那条 202211 是进门手填的无效号，不该记录。
  * 名单只应收录教务网登录成功、学号被学校页面验证过的真号。
  *
  * 修法：bindKbRow 以教务真号为主键（手填行兼容升级成真号主键，或新建真号行）；
  * handleActivate 只在 isKbId(kb) 成立时才记账，手填号不再写 idx；
  * handleList 用 byReal Map 按真号去重（at 取最早），只回传真号行；
  * oddRows 恒空，pendingCount / conflictCount 恒 0，hidden = 被挡住的存量手填/脏号行数。
  *
  * 能验：isKbId / kbRealOf / kbClassOf 判据（真跑，旧判据兼容保留）、
  *       bindKbRow 四种场景（真跑）、handleList 只认真号 + 去重 + 停用（真跑）、
  *       路由/护栏字面量、前后端接线。
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
ok(!!kbClassSrc, 'kbClassOf 源码抽得到（旧判据兼容保留）');
ok(!!bindSrc, 'bindKbRow 源码抽得到');
ok(!!listSrc, 'handleList 源码抽得到');

/* vm 桩：getIdx/putIdx 读写闭包里的 IDX，rev: 停用标记放 REV，其余是纯函数。
 * 五段真实源码拼进同一个 context。 */
let IDX = [];
const REV = new Set();
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
    'kb 是真号字符串 → 返回它');
  ok(A.kbRealOf({ id: '20261440105', kb: 1 }) === '20261440105',
    '遗留：kb===1 且 id 是真号 → 返回 id');
  ok(A.kbRealOf({ id: '20241100927' }) === '', '无 kb → 空串');
  ok(A.kbRealOf({ id: '20241100927', kb: 'junk' }) === '',
    'kb 是脏字符串且非法 → 空串');
  ok(A.kbRealOf(null) === '' && A.kbRealOf(undefined) === '', 'null / undefined 不炸');

  console.log('kbClassOf 真跑（旧判据兼容保留）:');
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

  console.log('bindKbRow 真跑（v2.16.0：以教务真号为主键）:');
  // 场景 1：旧版「手填主键 + kb 真号」存量行 → 兼容升级成真号主键（抹掉手填主键）
  IDX = [
    { id: '20291100411', at: 1, note: '', kb: '20261440105' },  // 旧版写过 kb 的存量行
    { id: '20241100927', at: 2, note: '' },                      // 从未补报的手填行
  ];
  REV.clear();
  const r1 = await A.bindKbRow(env, '20291100411', '20261440105');
  const s1 = IDX.find(e => e.id === '20261440105');
  ok(!!s1 && s1.kb === '20261440105' && s1.kbAt != null,
    '旧存量行主键原地升级成真号 + kb 真号 + kbAt');
  ok(r1.bound === true && r1.changed === true, '升级返回 bound=true / changed=true');
  ok(!IDX.some(e => e.id === '20291100411'), '手填号不再作为主键留在名单');
  ok(IDX.find(e => e.id === '20241100927').kb === undefined,
    '另一条未补报的手填行保持不动（由 handleList 挡住）');

  // 场景 2：gateId===real 幂等（已是真号主键的行）
  IDX = [{ id: '20261440105', at: 5, note: '', kb: '20261440105', kbAt: 100 }];
  const r2 = await A.bindKbRow(env, '20261440105', '20261440105');
  ok(IDX.length === 1 && r2.bound === true && r2.changed === false,
    'gateId===real 已绑定 → 幂等（changed=false）');

  // 场景 3：v1.1.63 遗留 kb===1 真号行 → 升级成字符串 + kbAt
  IDX = [{ id: '20261440105', at: 5, note: '', kb: 1 }];
  const r3 = await A.bindKbRow(env, 'whatever', '20261440105');
  ok(IDX.length === 1 && IDX[0].kb === '20261440105' && IDX[0].kbAt != null,
    'gateId 找不到时回退命中遗留真号行，幂等升级不新增行');
  ok(r3.bound === true && r3.changed === true, '升级返回 bound=true / changed=true');

  // 场景 4：非真号直接拒绝
  IDX = [];
  const r4 = await A.bindKbRow(env, '202611', '202611');
  ok(r4.bound === false && r4.changed === false && IDX.length === 0,
    '非 11 位 20 开头 → 拒绝记账，名单不脏');

  console.log('handleList 真跑（只回传真号 / 去重 / 停用 / 计数归零）:');
  IDX = [
    { id: '20261440105', at: 100, note: '', kb: '20261440105', kbAt: 100 }, // 真号已确认
    { id: '20252500999', at: 80, note: '', kb: 1 },                          // 遗留真号（停用）
    { id: '20241100927', at: 90, note: '' },                                 // 手填，无真号 → 挡
    { id: '120261200112', at: 70, note: '', kb: 'junk' },                    // 脏号 → 挡
    { id: '202211', at: 60, note: '' },                                      // 手填无效号 → 挡
  ];
  REV.add('rev:20252500999');
  const res = await A.handleList(env);
  ok(res.ok === true && res.count === 2, '主列表只回 2 个真号（count=2）');
  ok(res.rows.every(r => r.id === '20261440105' || r.id === '20252500999'),
    '手填 / 脏号（含 202211）都不出现在 rows 里');
  ok(res.rows.find(r => r.id === '20261440105').kb === '20261440105',
    '每行 kb 就是真号（名单只有一列真号）');
  ok(res.hidden === 3, 'hidden=3（3 个存量被挡手填 / 脏号行数）');
  ok(res.rows.find(r => r.id === '20252500999').revoked === true,
    '停用状态跟着真号行一起回');
  ok(res.revokedCount === 1, 'revokedCount 只数主列表里被停用的');
  ok(res.rows[0].id === '20261440105' && res.rows[1].id === '20252500999',
    '主列表按 at 降序（新收录在前）');
  ok(res.confirmedCount === 2 && res.pendingCount === 0 && res.conflictCount === 0,
    '待补录 / 冲突计数归零');
  ok(res.oddCount === 0 && res.oddRows.length === 0, '校准表恒空（不再回传异常行）');
  ok(res.count + res.hidden === 5 && res.hidden === 3, '真号 + 被挡 = 全表 5 行（无重复、无遗漏）');
  REV.clear();

  console.log('handleList 真跑（同一真号撞车 → 合成一条，at 取最早）:');
  IDX = [
    { id: '20261440105', at: 100, note: 'A', kb: '20261440105', kbAt: 100 },
    { id: '20261440105', at: 90, note: 'B', kb: '20261440105', kbAt: 90 },
  ];
  const clash = await A.handleList(env);
  ok(clash.count === 1 && clash.rows.length === 1,
    '同一真号只出现一条 row（byReal 去重）');
  ok(clash.rows[0].at === 90 && clash.rows[0].note === 'B',
    '撞车取 at 最早的那条（90 < 100）');
  ok(clash.pendingCount === 0 && clash.conflictCount === 0 && clash.oddCount === 0,
    '去重后无 pending / conflict / odd');

  console.log('门禁锁的字面量仍在（check_web / verify_apk / test_admin_list）:');
  ok(/if \(a\.at !== b\.at\) return b\.at - a\.at/.test(worker), '后端按 at 降序');
  ok(/return a\.id\.localeCompare\(b\.id\)/.test(worker), '同 at 按 id 稳定排序');
  ok(/const byReal = new Map\(\)/.test(worker), 'handleList 按真号 Map 去重');
  ok(/const oddRows = \[\]/.test(worker), 'handleList 不再回传异常行');
  ok(/pendingCount: 0, conflictCount: 0/.test(worker), '返回体三态计数归零');
  ok(/hidden: idx\.length - bound\.length/.test(worker), 'hidden = 被挡存量行数');
  ok(/return bad\('学号格式不对'\)/.test(worker), 'check_web 锁：激活判据没被改');
  ok(/function idxApply\(/.test(worker) && /idx\.length >= IDX_CAP/.test(worker),
    'verify_apk / check_web 锁：idxApply + IDX_CAP 仍在');
  ok(/function isKbId\(id\) \{/.test(worker) && /async function bindKbRow\(/.test(worker),
    'verify_apk 锁：isKbId / bindKbRow 符号在');

  console.log('服务端 /v1/kbbind 路由与护栏:');
  ok(/async function handleKbBind\(req, env\)/.test(worker), 'handleKbBind 定义');
  ok(/if \(!isKbId\(kb\)\) return bad\('教务绑定学号格式不对'\)/.test(worker),
    'kbbind 校验真号在册形状');
  ok(/if \(p === '\/v1\/kbbind' && req\.method === 'POST'\)/.test(worker), '/v1/kbbind 路由存在');
  ok(/rlHit\('kb:ip:' \+ clientIp\(req\), 200, 10 \* 60 \* 1000\)/.test(worker),
    'kbbind 带独立限流');

  console.log('服务端 /v1/admin/kbfix（手动录真号，admin 鉴权块内）:');
  ok(/async function handleKbFix\(req, env\)/.test(worker), 'handleKbFix 定义');
  ok(/if \(p === '\/v1\/admin\/kbfix' && req\.method === 'POST'\)/.test(worker),
    '/v1/admin/kbfix 路由存在');
  ok(/audit\(env, 'kbfix', \[id\], kb\)/.test(worker),
    'kbfix 写审计日志（act=kbfix，带真号）');
  ok(/isKbId\(kb\)/.test(worker), 'kbfix 校验真号在册形状');

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
    'Admin.kbFix 调 /v1/admin/kbfix（手动录真号前端出口）');
  ok(/adm-kb', '教务已绑定'/.test(appjs), '名单行显示「教务已绑定」徽章（死代码锁保留）');
  ok(/admListHidden/.test(appjs) && /已隐去 '/.test(appjs), '管理员看得到隐去计数');
  ok(/还没有人完成教务网登录/.test(appjs), '空态文案锁（只认真号口径）在');
  ok(/教务网登录学号 · 已验证/.test(appjs), '名单行显示「教务网登录学号 · 已验证」');
  ok(/id="admListTip"/.test(html) && /id="admListHidden"/.test(html),
    '名单卡有静态说明 + 隐去计数位');

  console.log('v2.16.0 反断言（三态 / 校准 / 手填标签全删）:');
  ok(!/function looksOddId\(id\) \{/.test(appjs) && !/格式异常（手填）/.test(appjs),
    '前端无 looksOddId / 「格式异常（手填）」');
  ok(!/function renderOdd\(\)/.test(appjs) && !/ODD = res\.oddRows \|\| \[\]/.test(appjs),
    '前端无校准表 renderOdd / ODD 集合');
  ok(!/function switchListTab\(t\)/.test(appjs) && !/ONLY_CONFIRMED/.test(appjs),
    '前端无二级菜单切换 / 只看已确认开关');
  ok(!/function renderKbSummary\(res\)/.test(appjs) && !/function openKbFix\(r\)/.test(appjs),
    '前端无三态汇总 / 手动录真号半框');
  ok(!/id="admListTab"/.test(html) && !/id="admOddPane"/.test(html) && !/id="admKbSummary"/.test(html),
    'index.html 无二级菜单 / 异常 pane / 汇总容器');
  ok(/admListCnt'\)\.textContent = LIST\.length \+ ' 人'/.test(appjs),
    '门禁锁：主列表计数只数 LIST（test_admin_list 依赖）');

  console.log('');
  if (bad) { console.log('test_kb_bind: ' + (total - bad) + '/' + total + ' passed, ' + bad + ' FAILED'); process.exit(1); }
  console.log('test_kb_bind: ' + total + ' passed, 0 failed \u2192 PASS');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
