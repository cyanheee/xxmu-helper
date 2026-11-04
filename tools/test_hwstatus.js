/* 作业/考试状态解析的离线回归测试（v1.1.5）。
 *
 * 为什么要有这个：用户报「内脏学没交却显示已完成」。根因是两层，
 * 而且两层的失败方式一模一样——都不报错，只是默默把「不知道」当成「做完了」。
 * 这种 bug 上真机才能发现，而真机上有 cookie、有网络、有学习通随时改版，
 * 复现成本太高。所以把解析和分桶抽出来，用固定 HTML 断言。
 *
 * 用法：node tools/test_hwstatus.js
 * 退出码 0 = 全过；1 = 有失败（构建脚本可以直接串它）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const CX_SRC = fs.readFileSync(path.join(ROOT, 'web', 'chaoxing.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  -> ' + extra : '')); }
}

/* chaoxing.js 是 IIFE，依赖 XXMU / Host。给最小垫片让它在 node 里跑起来。 */
function loadCX() {
  const sandbox = {
    console,
    Date, Math, JSON, String, Number, Array, Object, RegExp, Promise, isNaN,
    encodeURIComponent, decodeURIComponent, setTimeout,
    XXMU: {
      netCk: () => Promise.resolve(''),
      splitResp: () => ({ code: -1, body: '' }),
      decodeAuto: (s) => s,
    },
    Host: { getPref: () => '', setPref: () => {}, hasCookieFor: () => false },
    window: {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(CX_SRC + '\n;__cx = CX;', sandbox, { timeout: 3000 });
  return sandbox.__cx;
}

const C = { cid: '1', clid: '2', cpi: '3', name: '系统解剖学' };

/* 一个 li 块，status 部分可换任意写法 */
function li(name, wid, statusHtml) {
  return '<li style="padding:30px 0">\n'
    + '  <a class="inspectTask" title="' + name + '" data="' + wid + '" data2="88">x</a>\n'
    + '  <span>开始时间：</span>2026-11-01 08:00\n'
    + '  <span>截止时间：</span>2026-11-22 18:00\n'
    + '  ' + statusHtml + '\n'
    + '</li>';
}

function main() {
  const CX = loadCX();

  /* ---------- 1. 状态位提取：各种标签写法都要拿到词 ---------- */
  console.log('\n[1] pickStatus 各种标签写法');
  const cases = [
    ['strong 包裹', '<span>作业状态：</span><strong>未交</strong>', '未交'],
    ['span 包裹（v1.1.5 血案）', '<span>作业状态：</span><span class="zt">未交</span>', '未交'],
    ['b 包裹', '<span>作业状态：</span><b>未交</b>', '未交'],
    ['em 包裹', '<span>作业状态：</span><em>未交</em>', '未交'],
    ['两层嵌套', '<span>作业状态：</span><h6><span style="color:red">未交</span></h6>', '未交'],
    ['裸文本无标签', '<span>作业状态：</span> 未交 ', '未交'],
    ['标签间有换行', '<span>作业状态：</span>\n  <strong>\n  已完成\n  </strong>', '已完成'],
    ['冒号是半角', '<span>作业状态:</span><strong>已完成</strong>', '已完成'],
    ['标签名带 class', '<span class="fl">作业状态：</span><strong>待批阅</strong>', '待批阅'],
    ['文字在 title 里', '<span>作业状态：</span><i title="未批阅"></i>', '未批阅'],
    ['只有「状态：」', '<span>状态：</span><strong>已批阅</strong>', '已批阅'],
  ];
  cases.forEach(([label, html, want]) => {
    const got = CX.pickStatus(html, ['作业状态', '状态']);
    ok(label + ' -> ' + want, got === want, 'got ' + JSON.stringify(got));
  });

  /* ---------- 2. pickStatus 不该乱认 ---------- */
  console.log('\n[2] pickStatus 的边界');
  ok('完全没有状态位 -> 空串', CX.pickStatus('<span>截止时间：</span>2026-11-22', ['作业状态', '状态']) === '');
  ok('空块 -> 空串', CX.pickStatus('', ['作业状态']) === '');
  {
    /* 认不出的词要原样返回，不能变成空串——空串会被下游当成未知，
     * 但至少「原样返回」能让用户在角标上看到学习通写了什么 */
    const got = CX.pickStatus('<span>作业状态：</span><strong>待补交</strong>', ['作业状态']);
    ok('认不出的词原样返回', got === '待补交', 'got ' + JSON.stringify(got));
  }

  /* ---------- 3. classify 口径 ---------- */
  console.log('\n[3] classify 归类');
  const cls = [
    ['已完成', 'done'], ['已提交', 'done'], ['待批阅', 'done'],
    ['未批阅', 'done'],   /* v1.1.5：从 open 挪到 done */
    ['已批阅', 'done'], ['已过期', 'done'], ['已结束', 'done'],
    ['待做', 'open'], ['未交', 'open'], ['未提交', 'open'],
    ['未开始', 'open'], ['重新编辑', 'open'], ['进行中', 'open'],
    ['', 'unknown'], ['   ', 'unknown'], ['什么鬼', 'unknown'],
  ];
  cls.forEach(([s, want]) => {
    const got = CX.classify(s);
    ok('classify(' + JSON.stringify(s) + ') = ' + want, got === want, 'got ' + got);
  });
  /* 「未批阅」和「未交」都带「未」，顺序错了就会互相污染 */
  ok('未批阅不能被「未」字带偏成未交', CX.classify('未批阅') === 'done');

  /* ---------- 4. parseWorks 端到端 ---------- */
  console.log('\n[4] parseWorks 端到端');
  {
    const html = li('26-27-1-内脏学', '57770542', '<span>作业状态：</span><span class="zt">未交</span>')
      + li('26-27-1-中枢神经系统', '57770543', '<span>作业状态：</span><strong>已完成</strong>')
      + li('没有状态位的作业', '57770544', '<span>备注：无</span>');
    const ws = CX.parseWorks(html, C);
    /* 第三条整块没有「作业状态」字样，会被 continue 掉 —— 这是原有行为，
     * 保持不动：状态位不存在的行本来就不是作业行。 */
    ok('解析出 2 条', ws.length === 2, 'got ' + ws.length);
    ok('第一条状态=未交', ws[0] && ws[0].status === '未交', ws[0] && ws[0].status);
    ok('第二条状态=已完成', ws[1] && ws[1].status === '已完成', ws[1] && ws[1].status);
    ok('第一条 end 正确', ws[0] && ws[0].end === '2026-11-22 18:00', ws[0] && ws[0].end);
  }

  /* ---------- 5. finish：读不到状态时不能算做完 ---------- */
  console.log('\n[5] finish 分桶（核心）');
  {
    const now = Math.floor(Date.now() / 1000);
    const fmt = ts => {
      const d = new Date(ts * 1000);
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    };
    const future = fmt(now + 86400 * 30);
    const past = fmt(now - 86400 * 30);

    const works = [
      /* 状态读空 + 还没到期 → 必须算要做（这就是「内脏学」那条） */
      { name: 'A', status: '', end: future, start: '' },
      /* 状态读空 + 已过截止 → 不可能是「要做」，但也不能说做完了 */
      { name: 'B', status: '', end: past, start: '' },
      /* 状态明确 = 已完成 → 不算要做 */
      { name: 'C', status: '已完成', end: past, start: '' },
      /* 状态明确 = 未交 + 还没到期 → 要做 */
      { name: 'D', status: '未交', end: future, start: '' },
      /* 状态明确 = 未交 + 已过截止 → 仍然没交。归到「已完成」正是用户抱怨的
       * 那个 bug，所以它必须留在待做侧，靠倒计时显示「已过期」来提示。 */
      { name: 'E', status: '未交', end: past, start: '' },
    ];
    const exams = [
      /* 未开考 + 状态读成已完成 → 必须是待考（用户报的那条） */
      { name: 'X', status: '已完成', start: future, end: future },
      /* 已结束 + 状态已完成 → 不算待考 */
      { name: 'Y', status: '已完成', start: past, end: past },
      /* 未开考 + 状态读空 → 待考 */
      { name: 'Z', status: '', start: future, end: future },
    ];
    const d = CX.finish(works, exams, { courses: 1, errors: [] });
    const by = (arr, n) => arr.find(x => x.name === n);

    ok('A 空状态未到期 -> open', by(d.works, 'A').open === true);
    ok('A 标记了 status_known=false', by(d.works, 'A').status_known === false);
    ok('B 空状态已过期 -> 不算要做', by(d.works, 'B').open === false);
    ok('B 但仍然 status_known=false', by(d.works, 'B').status_known === false);
    ok('C 已完成 -> 不算要做', by(d.works, 'C').open === false);
    ok('C status_known=true', by(d.works, 'C').status_known === true);
    ok('D 未交未到期 -> 要做', by(d.works, 'D').open === true);
    /* 「未交 + 已过截止」：状态说得很清楚——没交。不能因为过期就把它塞进
     * 「已完成」，那正是用户截图里看到的错。它留在待做侧，界面靠
     * 倒计时显示「已过期」来区分「还没交且已晚」和「还来得及」。 */
    ok('E 未交已过期 -> 仍然是没交，留在待做', by(d.works, 'E').open === true);

    ok('X 未开考却写着已完成 -> 仍然待考', by(d.exams, 'X').open === true);
    ok('Y 已结束 -> 不算待考', by(d.exams, 'Y').open === false);
    ok('Z 未开考状态空 -> 待考', by(d.exams, 'Z').open === true);

    ok('pending 统计只数真要做的', d.pending === 3, 'got ' + d.pending);
    ok('exam_upcoming 只数未来开考的', d.exam_upcoming === 2, 'got ' + d.exam_upcoming);
  }

  /* ---------- 6. 真机快照回归：用 data/homework.json 的真实数据 ---------- */
  console.log('\n[6] 真实快照回归（data/homework.json）');
  {
    const snapPath = path.join(ROOT, 'data', 'homework.json');
    if (fs.existsSync(snapPath)) {
      const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      const now = Math.floor(Date.now() / 1000);
      /* 快照里的状态都是 PC 端 python 抓的，全部有值。这一组断言
       * 只验证：有状态的条目，分类结果和状态词一致，没有被误判。 */
      let known = 0, bad = 0;
      (snap.works || []).forEach(w => {
        const k = CX.classify(w.status);
        if (k === 'unknown') { bad++; console.log('    状态未识别: ' + JSON.stringify(w.status)); }
        else known++;
      });
      ok('快照里 ' + known + ' 条作业状态全部可识别', bad === 0, bad + ' 条识别不出');
      ok('快照里没有空状态', (snap.works || []).every(w => String(w.status || '').trim() !== ''));
      /* 考试同理 */
      let badE = 0;
      (snap.exams || []).forEach(e => { if (CX.classify(e.status) === 'unknown') badE++; });
      ok('快照里考试状态全部可识别', badE === 0, badE + ' 条识别不出');
    } else {
      console.log('  - 跳过：没有 data/homework.json');
    }
  }

  console.log('\n' + (fail ? '[FAIL]' : '[PASS]') + ' 通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
}

main();
