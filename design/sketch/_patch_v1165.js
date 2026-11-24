/* _patch_v1165.js — 方案 A 落码：全员下线重绑教务网（服务端 cfg.rebindAt 可逆方案）
 * 一次性补丁：唯一锚点 + 命中次数断言；不进 assets。
 * 不写 rev:（handleActivate 也查 rev:，会死锁）；用一个时间戳让老票据在 check 里失效。
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function patch(rel, edits) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  edits.forEach(function (e) {
    const old = e[0], rep = e[1], n = e[2], tag = e[3];
    const hits = s.split(old).length - 1;
    if (hits !== n) throw new Error(rel + ' :: ' + tag + ' 命中 ' + hits + ' 次，期望 ' + n);
    s = s.split(old).join(rep);
    console.log('ok  ' + rel + ' :: ' + tag + '  x' + hits);
  });
  fs.writeFileSync(p, s, 'utf8');
}

/* ---------------------------------------------------------- server/worker.js */
const CHECK_OLD = '  const exp0 = t1.exp;';
const CHECK_NEW = [
  '  /* v1.1.65 方案 A：全员重绑。cfg.rebindAt = 发起全员重绑的时刻（秒）。',
  '   * 普通票据恒为 30 天签（handleActivate: exp = now() + 30*DAY），所以',
  '   * 「签发时刻」= exp - 30*DAY；签发早于 rebindAt 的老票据一律判 bad_ticket。',
  '   * 客户端 check() 收到 bad_ticket 会清登记重新激活；重新激活（或登录后',
  '   * reportKb / alignKbAccount）把教务真号补回 idx，名单逐个回「已确认」。',
  '   * 管理员票据在 handleCheck 顶部 isAdminId 分支提前 return，不受影响。',
  '   * cfg.rebindAt 默认不存在 → 这段不触发 → 线上零回归。 */',
  '  if (rebindKicks(cfg.rebindAt, t1.exp)) {',
  "    return json({ ok: false, reason: 'bad_ticket', rebind: true, msg: '请重新登录一次教务网确认学号' });",
  '  }',
  '  const exp0 = t1.exp;',
].join('\n');

const HANDLERS_OLD = '/** POST /v1/check {id, ticket, fp, ver, code} */';
const HANDLERS_NEW = [
  '/* ------------------------------------------------- v1.1.65 方案 A：全员重绑 */',
  '',
  '/** 票据是不是「全员重绑之前签发的」？抽成纯函数，tools/test_rebind.js 直接真跑。',
  ' * 严格小于：同一秒内重新激活签发的票据（issuedAt === rebindAt）必须放行。 */',
  'function rebindKicks(rebindAt, exp) {',
  '  const t = parseInt(rebindAt, 10) || 0;',
  '  return !!t && (exp - 30 * DAY) < t;',
  '}',
  '',
  '/** POST /v1/admin/rebind-all —— 全员下线重绑教务网（一次性、可逆）。',
  ' *',
  ' * YG 原话（m02386）：「能不能让所有人下线，都重新绑定一次教务网，重新补录一下」。',
  ' * 不用 rev: —— 那会死锁：handleActivate 也查 rev:，写了之后用户重新激活同样被挡，',
  ' * 永远回不来。改用 cfg.rebindAt：一个时间戳就让所有「重绑之前签发的票据」',
  ' * 在 handleCheck 里判 bad_ticket。客户端收到 bad_ticket 会 deactivate + clearTicket，',
  ' * 清掉本机登记与 K_ACCT_KB，用户重开 App 进门后必须重新登录一次教务网，',
  ' * 登录成功抓到真号再经 activate 的 kb 字段 / /v1/kbbind 补回 idx ——',
  ' * 这就真正「重绑了一次教务网」。',
  ' *',
  ' * 动作：① 整键备份 idx + 公告到 rebind:backup；② 逐行删 kb / kbAt（保留',
  ' * id / at / note），名单整批回「待补录」；③ cfg.rebindAt = now() + 发一条公告；',
  ' * ④ purgeEdge 让 /v1/config 立即生效；⑤ audit 留痕。全程约 5 次 KV 写（O(1)），',
  ' * 不像逐个删 dev: 要按人数线性写、吃掉 1000 写/天的免费额度。',
  ' *',
  ' * 已发起过就拒绝重入，避免第二次用「已清空的 idx」覆盖掉第一份备份。 */',
  'async function handleRebindAll(req, env) {',
  '  const idx = await getIdx(env);',
  "  if (idx === null) return bad('名单索引读不出来，本次没有做任何写入。', 500);",
  '  const cfg = await getCfg(env);',
  "  if ((parseInt(cfg.rebindAt, 10) || 0) && (await env.AUTH.get('rebind:backup'))) {",
  "    return bad('已经发起过全员重绑，请先「撤销上次重绑」再重新发起，避免覆盖备份。');",
  '  }',
  '  const backup = {',
  "    idx: idx, rebindAt: cfg.rebindAt || 0,",
  "    notice: cfg.notice || '', noticeAt: cfg.noticeAt || 0, noticeTitle: cfg.noticeTitle || '',",
  '    at: now(),',
  '  };',
  "  await env.AUTH.put('rebind:backup', JSON.stringify(backup));",
  '  const cleared = idx.map(e => {',
  "    if (!e || typeof e !== 'object') return e;",
  '    const o = Object.assign({}, e);',
  '    delete o.kb;      // v1.1.64 的教务真号字符串 / v1.1.63 的 kb:1 标记一并去掉',
  '    delete o.kbAt;',
  '    return o;',
  '  });',
  '  await putIdx(env, cleared);',
  '  const t = now();',
  '  const next = Object.assign({}, cfg, {',
  '    rebindAt: t,',
  "    notice: '请重开 App，按提示重新登录一次教务网确认学号。',",
  "    noticeTitle: '学号重新确认',",
  '    noticeAt: t,',
  '  });',
  '  await putCfg(env, next);',
  "  await purgeEdge(req, '/v1/config');",
  "  await audit(env, 'rebind-all', [], 'rows=' + idx.length);",
  '  return json({ ok: true, rows: idx.length, rebindAt: t });',
  '}',
  '',
  '/** POST /v1/admin/rebind-undo —— 撤销全员重绑，一键还原。',
  ' * 恢复 idx（含 kb / kbAt）、删掉 cfg.rebindAt、还原公告，老票据随即重新有效',
  ' * （设备绑定 dev: 从头到尾没被动过）。 */',
  'async function handleRebindUndo(req, env) {',
  "  const raw = await env.AUTH.get('rebind:backup');",
  "  if (!raw) return bad('没有可撤销的重绑记录（还没发起过全员重绑）。');",
  '  let b;',
  "  try { b = JSON.parse(raw); } catch (e) { return bad('重绑备份读不出来，没有做任何写入。', 500); }",
  "  if (!b || !Array.isArray(b.idx)) return bad('重绑备份格式不对，没有做任何写入。', 500);",
  '  await putIdx(env, b.idx);',
  '  const cfg = await getCfg(env);',
  '  const next = Object.assign({}, cfg, {',
  "    notice: b.notice || '', noticeAt: b.noticeAt || 0, noticeTitle: b.noticeTitle || '',",
  '  });',
  '  delete next.rebindAt;',
  '  await putCfg(env, next);',
  "  await purgeEdge(req, '/v1/config');",
  "  await env.AUTH.delete('rebind:backup');",
  "  await audit(env, 'rebind-undo', [], 'rows=' + b.idx.length);",
  '  return json({ ok: true, rows: b.idx.length });',
  '}',
  '',
  '/** POST /v1/check {id, ticket, fp, ver, code} */',
].join('\n');

const ROUTE_OLD = "        if (p === '/v1/admin/kbfix' && req.method === 'POST') return await handleKbFix(req, env);";
const ROUTE_NEW = ROUTE_OLD + '\n'
  + "        if (p === '/v1/admin/rebind-all' && req.method === 'POST') return await handleRebindAll(req, env);\n"
  + "        if (p === '/v1/admin/rebind-undo' && req.method === 'POST') return await handleRebindUndo(req, env);";

patch('server/worker.js', [
  [CHECK_OLD, CHECK_NEW, 1, 'handleCheck 加 rebindKicks 判据'],
  [HANDLERS_OLD, HANDLERS_NEW, 1, '新增 rebindKicks + rebind-all/undo 三个函数'],
  [ROUTE_OLD, ROUTE_NEW, 1, 'admin 块加两条路由'],
]);

/* --------------------------------------------------------------- web/auth.js */
const ADM_OLD = "    kbFix(id, kb) { return postJson('/v1/admin/kbfix', { id: id, kb: kb }, this.key); },";
const ADM_NEW = ADM_OLD + '\n'
  + '    /** v1.1.65 方案 A：全员下线重绑教务网 / 一键撤销（都会走管理台二次确认） */\n'
  + "    rebindAll() { return postJson('/v1/admin/rebind-all', {}, this.key); },\n"
  + "    rebindUndo() { return postJson('/v1/admin/rebind-undo', {}, this.key); },";
patch('web/auth.js', [[ADM_OLD, ADM_NEW, 1, 'Admin 加 rebindAll / rebindUndo']]);

/* ------------------------------------------------------------ web/index.html */
const HTML_OLD = '          <button id="admListBtn" class="btn ghost">刷新名单</button>';
const HTML_NEW = [
  HTML_OLD,
  '          <!-- v1.1.65 方案 A：全员下线重绑教务网。破坏性动作走 #sheet 二次确认，',
  '               按钮留给管理员自己点；服务端动手前自动备份，「撤销」一键还原。 -->',
  '          <p class="adm-tip" style="margin-top:14px"><b>全员重绑教务网</b>：清空名单里的教务真号标记、',
  '            让所有老票据失效；学生重开 App 后要重新登录一次教务网确认学号。动手前自动备份整份名单，',
  '            「撤销」可一键还原名单与公告。</p>',
  '          <p class="adm-tip" id="admRebindState"></p>',
  '          <div class="chips" style="margin-top:6px">',
  '            <button id="admRebindGo" class="btn ghost">发起全员重绑</button>',
  '            <button id="admRebindUndo" class="btn ghost">撤销上次重绑</button>',
  '          </div>',
].join('\n');
patch('web/index.html', [[HTML_OLD, HTML_NEW, 1, '名单卡加全员重绑区（两个按钮 + 状态行）']]);

/* ---------------------------------------------------------------- web/app.js */
const OPEN_OLD = '  function openKbFix(r) {';
const OPEN_NEW = [
  '  /* v1.1.65 方案 A：全员重绑 / 撤销。破坏性动作跟 openKbFix 一样走 #sheet 半框',
  '   * 二次确认，避免误点一下把全校票据都废掉；成功后刷新名单看回流。 */',
  '  function openRebind(all) {',
  "    const body = $('sh-body'), name = $('sh-name'), sheet = document.getElementById('sheet');",
  '    if (!body || !name || !sheet) return;',
  "    name.textContent = all ? '发起全员重绑教务网' : '撤销上次重绑';",
  "    body.innerHTML = '';",
  "    body.appendChild(el('p', 'hint', all",
  "      ? '这会让所有人现有票据失效、名单里的教务真号标记清空，学生重开 App 后要重新登录一次教务网确认学号。动手前会先自动备份整份名单，随时可用「撤销」还原。'",
  "      : '把名单与公告还原到发起全员重绑之前的样子，老票据重新有效。'));",
  "    const msg = el('p', 'adm-tip', '');",
  '    body.appendChild(msg);',
  "    const go = el('button', 'btn ghost', all ? '确认发起' : '确认撤销');",
  "    go.style.marginTop = '10px';",
  '    go.onclick = () => {',
  "      msg.style.color = '';",
  "      msg.textContent = '正在处理…';",
  '      go.disabled = true;',
  '      const call = all ? AUTH.Admin.rebindAll() : AUTH.Admin.rebindUndo();',
  '      call.then(res => {',
  '        go.disabled = false;',
  "        if (!res || !res.ok) { msg.textContent = (res && res.msg) || '操作失败'; msg.style.color = 'var(--danger)'; return; }",
  "        sheet.classList.remove('on');",
  "        const st = $('admRebindState');",
  '        if (st) st.textContent = all',
  "          ? ('已发起全员重绑：共 ' + (res.rows || 0) + ' 行名单回到待补录，老票据将陆续失效。')",
  "          : ('已撤销：名单与公告还原完毕（' + (res.rows || 0) + ' 行）。');",
  '        refreshList();',
  '      }, e => {',
  '        go.disabled = false;',
  "        msg.textContent = '连不上服务器：' + errText(e);",
  "        msg.style.color = 'var(--danger)';",
  '      });',
  '    };',
  '    body.appendChild(go);',
  "    sheet.classList.add('on');",
  '  }',
  '',
  OPEN_OLD,
].join('\n');

const INIT_OLD = "    on('admListBtn', refreshList);";
const INIT_NEW = INIT_OLD + '\n'
  + "    on('admRebindGo', () => openRebind(true));\n"
  + "    on('admRebindUndo', () => openRebind(false));";
patch('web/app.js', [
  [OPEN_OLD, OPEN_NEW, 1, '插入 openRebind 二次确认半框'],
  [INIT_OLD, INIT_NEW, 1, 'init 绑定两个重绑按钮'],
]);

console.log('DONE  v1.1.65 方案 A 落码 6 处');
