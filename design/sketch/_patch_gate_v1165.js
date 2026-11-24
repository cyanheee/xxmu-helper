/* v1.1.65 方案 A 门禁同步：check_web.js 挂 test_rebind.js + checkpoint，
 * verify_apk.py 四处静态符号锁（app.js / index.html×2 / auth.js）+ WORKER_SYMBOLS。
 * 一次性脚本，唯一锚点 + 命中次数断言，避免大块 edit 缩进不符。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function patch(rel, edits) {
  const p = path.join(root, rel);
  let src = fs.readFileSync(p, 'utf8');
  for (const e of edits) {
    const n = src.split(e.from).length - 1;
    if (n !== 1) throw new Error(rel + ' 锚点命中 ' + n + ' 次（应为 1）：' + e.from.slice(0, 70));
    src = src.replace(e.from, e.to);
    console.log('ok  ' + rel + '  ' + e.tag);
  }
  fs.writeFileSync(p, src, 'utf8');
}

/* ---------- check_web.js：v1.1.65 checkpoint（自带 spawn 子测试） ---------- */
const checkpoint = `// ---- v1.1.65 方案 A：全员下线重绑教务网（cfg.rebindAt 可逆方案） ----
{
  console.log('\\nv1.1.65 checkpoints（全员重绑 / 撤销 / 老票据判踢 / 管理台按钮）:');
  const idx3 = read('web/index.html');
  const cp = require('child_process');
  const r = cp.spawnSync(process.execPath,
    [path.join(root, 'tools', 'test_rebind.js')], { encoding: 'utf8' });
  console.log('  全员重绑契约测试        =', r.status === 0 ? 'PASS' : 'FAIL');
  if (r.status !== 0) fail('全员重绑契约测试未通过：' +
    ((r.stdout || '') + (r.stderr || '')).trim().split('\\n').slice(-4).join(' | '));
  // 服务端：判据 / 两个 handler / 备份键 / 两条 admin 路由
  has(worker, 'function rebindKicks(rebindAt, exp)', '后端 rebindKicks 判据');
  has(worker, 'async function handleRebindAll(req, env)', '后端有 handleRebindAll');
  has(worker, 'async function handleRebindUndo(req, env)', '后端有 handleRebindUndo');
  has(worker, 'rebind:backup', '整键备份走 rebind:backup 单键');
  has(worker, 'rebindKicks(cfg.rebindAt, t1.exp)', 'handleCheck 老票据判踢');
  has(worker, "reason: 'bad_ticket', rebind: true", '返回 bad_ticket + rebind:true');
  has(worker, "if (p === '/v1/admin/rebind-all' && req.method === 'POST')", '/v1/admin/rebind-all 路由');
  has(worker, "if (p === '/v1/admin/rebind-undo' && req.method === 'POST')", '/v1/admin/rebind-undo 路由');
  // 客户端出口 / 二次确认半框 / 管理台按钮 / 状态位
  has(auth, "rebindAll() { return postJson('/v1/admin/rebind-all'", 'Admin.rebindAll 出口');
  has(auth, "rebindUndo() { return postJson('/v1/admin/rebind-undo'", 'Admin.rebindUndo 出口');
  has(app, 'function openRebind(all)', '前端二次确认半框 openRebind');
  has(app, 'AUTH.Admin.rebindAll()', 'openRebind 调发起');
  has(app, 'AUTH.Admin.rebindUndo()', 'openRebind 调撤销');
  has(app, "on('admRebindGo', () => openRebind(true))", 'init 绑发起按钮');
  has(app, "on('admRebindUndo', () => openRebind(false))", 'init 绑撤销按钮');
  has(idx3, 'id="admRebindGo"', '名单卡有发起按钮');
  has(idx3, 'id="admRebindUndo"', '名单卡有撤销按钮');
  has(idx3, 'id="admRebindState"', '名单卡有重绑状态位');
}

`;

patch('tools/check_web.js', [{
  from: '// ---- v1.1.46：更新检查提速 + 发版说明学生视角 ----',
  to: checkpoint + '// ---- v1.1.46：更新检查提速 + 发版说明学生视角 ----',
  tag: 'v1.1.65 checkpoint + spawn test_rebind.js',
}]);

/* ---------- verify_apk.py：四处 NEW_JS_SYMBOLS + WORKER_SYMBOLS ---------- */
patch('tools/verify_apk.py', [
  {
    from: '"adm-kbline", "is-pending",',
    to: '"adm-kbline", "is-pending",\n' +
        '                         # v1.1.65 方案 A：全员重绑二次确认半框\n' +
        '                         "function openRebind(all)", "AUTH.Admin.rebindAll(", "AUTH.Admin.rebindUndo(",',
    tag: 'assets/app.js 加 openRebind / 两个出口',
  },
  {
    // 第一处 index.html 列表（字典里重复 key，两处都加，哪处生效都锁得住）
    from: `'id="admKbSummary"', 'id="admOnlyConfirmed"'],`,
    to: `'id="admKbSummary"', 'id="admOnlyConfirmed"',\n` +
        `                          'id="admRebindGo"', 'id="admRebindUndo"', 'id="admRebindState"'],`,
    tag: 'assets/index.html 第一处加三个重绑 id',
  },
  {
    // 第二处 index.html 列表（Python dict 重复 key 的实际生效处）
    from: '"THEME.init()"],',
    to: '"THEME.init()",\n' +
        `                          'id="admRebindGo"', 'id="admRebindUndo"', 'id="admRebindState"'],`,
    tag: 'assets/index.html 第二处（生效处）加三个重绑 id',
  },
  {
    from: '"reportKb", "/v1/kbbind", "function kbAccount()"],',
    to: '"reportKb", "/v1/kbbind", "function kbAccount()",\n' +
        '                         # v1.1.65 方案 A：管理员全员重绑出口\n' +
        '                         "rebindAll(", "rebindUndo("],',
    tag: 'assets/auth.js 加 rebindAll / rebindUndo',
  },
  {
    from: '"oddCount: oddRows.length", "oddRows: oddRows",',
    to: '"oddCount: oddRows.length", "oddRows: oddRows",\n' +
        '    # v1.1.65 方案 A：全员下线重绑（cfg.rebindAt 可逆，不写 rev: 免死锁）\n' +
        '    "function rebindKicks(", "async function handleRebindAll(",\n' +
        '    "async function handleRebindUndo(", "rebind:backup",\n' +
        '    "rebindKicks(cfg.rebindAt, t1.exp)",\n' +
        '    "/v1/admin/rebind-all", "/v1/admin/rebind-undo",',
    tag: 'WORKER_SYMBOLS 加 8 个 v1.1.65 符号',
  },
]);

console.log('DONE  v1.1.65 门禁同步 6 处');
