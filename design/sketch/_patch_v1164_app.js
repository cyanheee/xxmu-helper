/* v1.1.64 方案 C：一次性给 web/app.js 打上双号名单的前端改动。
 * 用「唯一锚点 + 命中次数断言」而不是多行大块 edit，避免缩进不符写坏文件。 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const p = path.join(root, 'web/app.js');
let s = fs.readFileSync(p, 'utf8');

const R = [];
R.push({
  label: 'renderList 合并 pending 灰度行', n: 1,
  old: `    let rows = LIST.slice().sort(listNewFirst);
    if (FILTER === 'granted') rows = rows.filter(r => !r.revoked);`,
  neu: `    let rows = LIST.slice().sort(listNewFirst);
    /* v1.1.64 方案 C：默认把「待补录」的手填行也灰度带进主列表，
     * 上面粗的是进门填的号，下面细的小字写教务网状态；勾了「只看已确认」
     * 就只剩服务端 confirmed 的行。conflict（脏数据/真号撞车）只进校准。 */
    if (!ONLY_CONFIRMED) {
      const pending = ODD.filter(r => r.reason === 'pending')
        .map(r => Object.assign({}, r, { _pending: true }));
      rows = rows.concat(pending).sort(listNewFirst);
    }
    if (FILTER === 'granted') rows = rows.filter(r => !r.revoked);`
});
R.push({
  label: 'renderList 双行 + 待补录灰度', n: 1,
  old: `      const row = el('div', 'adm-item');
      const idWrap = el('div', 'adm-id-wrap');
      idWrap.appendChild(el('span', 'adm-id', r.id));`,
  neu: `      const row = el('div', 'adm-item' + (r._pending ? ' is-pending' : ''));
      const idWrap = el('div', 'adm-id-wrap');
      idWrap.appendChild(el('span', 'adm-id', r.id));
      /* v1.1.64：下面细的小字 = 教务网登录读回的真号（用户原话「下面细的小字
       * 是绑定教务网，确认是教务网登录所抓取到的学号」）；没抓到就写待补录。 */
      idWrap.appendChild(el('span', 'adm-kbline',
        r._pending ? '教务网：待补录' : ('教务网 ' + (r.kb || '') + ' · 已确认')));`
});
R.push({
  label: '已确认才挂教务已绑定徽章', n: 1,
  old: `      /* v1.1.63：服务端只回 kb:1 的行，能显示出来的都是教务网绑定真号 */
      tags.appendChild(el('span', 'adm-kb', '教务已绑定'));`,
  neu: `      /* v1.1.64：只有已确认行才挂「教务已绑定」；待补录靠灰度 + 细行说明 */
      if (!r._pending) tags.appendChild(el('span', 'adm-kb', '教务已绑定'));`
});
R.push({
  label: 'renderOdd reason 文案改三态', n: 1,
  old: `      /* reason 由服务端定：odd=连在册形状都不对，unbound=形状对但没绑教务 */
      tags.appendChild(el('span', 'adm-odd', r.reason === 'odd' ? '格式异常（手填）' : '未绑教务'));`,
  neu: `      /* reason 由服务端定：pending=还没补报真号，conflict=kb 脏数据/真号撞车 */
      tags.appendChild(el('span', 'adm-odd', r.reason === 'conflict' ? '两号冲突' : '待补录教务学号'));`
});
R.push({
  label: 'renderOdd 加录真号按钮', n: 1,
  old: `      const btn = el('button', 'adm-cp', '详情');
      btn.onclick = () => showDetail(r.id);
      row.appendChild(btn);
      box.appendChild(row);`,
  neu: `      const btn = el('button', 'adm-cp', '详情');
      btn.onclick = () => showDetail(r.id);
      row.appendChild(btn);
      /* v1.1.64 方案 C：不等对方再开 App，管理员直接补教务网真号 */
      const fix = el('button', 'adm-cp adm-fix', '录真号');
      fix.onclick = () => openKbFix(r);
      row.appendChild(fix);
      box.appendChild(row);`
});
const helpers = [
  `  /* v1.1.64 方案 C：校准里「手动录真号」。真号只在学生本机，等对方再开一次`,
  `   * App 自动补报不总是可行；管理员拿教务网查到的号直接补。用现成的 #sheet`,
  `   * 半框收输入，不依赖 window.prompt（WebView 里常被宿主拦掉）。 */`,
  `  function openKbFix(r) {`,
  `    const body = $('sh-body'), name = $('sh-name'), sheet = document.getElementById('sheet');`,
  `    if (!body || !name || !sheet) return;`,
  `    name.textContent = '补录教务学号 · ' + (r.id || '空号');`,
  `    body.innerHTML = '';`,
  `    body.appendChild(el('p', 'hint', '上面这行是进门时填的号；把教务网登录读回的 11 位真号填在下面，确认后它会变成「已确认」。'));`,
  `    const inp = document.createElement('input');`,
  `    inp.className = 'adm-in one';`,
  `    inp.type = 'text';`,
  `    inp.inputMode = 'numeric';`,
  `    inp.placeholder = '教务网学号（20 开头，11 位）';`,
  `    body.appendChild(inp);`,
  `    const msg = el('p', 'adm-tip', '');`,
  `    body.appendChild(msg);`,
  `    const go = el('button', 'btn ghost', '确认补录');`,
  `    go.style.marginTop = '10px';`,
  `    go.onclick = () => {`,
  `      const real = String(inp.value || '').trim();`,
  `      if (!/^20\\d{2}\\d{7}$/.test(real)) {`,
  `        msg.textContent = '学号形状不对：要 20 开头、11 位数字。';`,
  `        msg.style.color = 'var(--danger)';`,
  `        return;`,
  `      }`,
  `      msg.style.color = '';`,
  `      msg.textContent = '正在补录…';`,
  `      AUTH.Admin.kbFix(r.id, real).then(res => {`,
  `        if (!res || !res.ok) { msg.textContent = (res && res.msg) || '补录失败'; return; }`,
  `        sheet.classList.remove('on');`,
  `        refreshList();`,
  `      }, e => { msg.textContent = '连不上服务器：' + errText(e); });`,
  `    };`,
  `    body.appendChild(go);`,
  `    sheet.classList.add('on');`,
  `    try { inp.focus(); } catch (e) {}`,
  `  }`,
  ``,
  `  /* v1.1.64 方案 C：卡头三态计数（用户原话「计数也分开计数」）。`,
  `   * 服务端给 confirmedCount / pendingCount / conflictCount；老服务端没有时`,
  `   * 用 LIST / ODD 本地兜底，升级过渡期也不会显示 undefined。 */`,
  `  function renderKbSummary(res) {`,
  `    const sum = $('admKbSummary');`,
  `    if (!sum) return;`,
  `    const cc = (res && res.confirmedCount != null) ? res.confirmedCount : LIST.length;`,
  `    const pc = (res && res.pendingCount != null) ? res.pendingCount : ODD.filter(r => r.reason === 'pending').length;`,
  `    const fc = (res && res.conflictCount != null) ? res.conflictCount : ODD.filter(r => r.reason === 'conflict').length;`,
  `    sum.textContent = '';`,
  `    sum.appendChild(el('span', 'adm-sum-ok', '已确认 ' + cc));`,
  `    sum.appendChild(el('span', 'adm-sum-pending', '待补录 ' + pc));`,
  `    sum.appendChild(el('span', 'adm-sum-conflict', '冲突 ' + fc));`,
  `  }`,
  ``
].join('\n');
R.push({
  label: '插入 openKbFix + renderKbSummary', n: 1,
  old: `  /* 名单卡二级菜单：正常名单 / 校准·异常，各自成表、各自计数。 */
  function switchListTab(t) {`,
  neu: helpers + `  /* 名单卡二级菜单：正常名单 / 校准·异常，各自成表、各自计数。 */
  function switchListTab(t) {`
});
R.push({
  label: 'refreshStats/refreshList 写三计数汇总', n: 2,
  old: `      if ($('admListHidden')) $('admListHidden').textContent = res.hidden ? ('已隐去 ' + res.hidden + ' 个未绑定号码，见「校准 · 异常」') : '';
      renderList();
      renderOdd();`,
  neu: `      if ($('admListHidden')) $('admListHidden').textContent = res.hidden ? ('已隐去 ' + res.hidden + ' 个未绑定号码，见「校准 · 异常」') : '';
      renderKbSummary(res);
      renderList();
      renderOdd();`
});
R.push({
  label: 'init 绑定只看已确认开关', n: 1,
  old: `    const find = $('admFind');
    if (find) {
      find.oninput = () => {
        FIND = find.value.trim();
        renderList();
      };
    }`,
  neu: `    const find = $('admFind');
    if (find) {
      find.oninput = () => {
        FIND = find.value.trim();
        renderList();
      };
    }
    /* v1.1.64 方案 C：只看已确认开关 */
    const only = $('admOnlyConfirmed');
    if (only) {
      only.onchange = () => {
        ONLY_CONFIRMED = !!only.checked;
        renderList();
      };
    }`
});

R.forEach((r, i) => {
  const parts = s.split(r.old);
  const got = parts.length - 1;
  if (got !== r.n) throw new Error('replace[' + i + '] ' + r.label + ' expected ' + r.n + ' got ' + got);
  s = parts.join(r.neu);
  console.log('ok  ' + r.label + '  x' + got);
});
fs.writeFileSync(p, s, 'utf8');
console.log('DONE  web/app.js  ' + s.length + ' chars');
