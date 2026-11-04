/* 离线验证 WebActivity.buildGrabJs 生成的探测脚本行为。
 *
 *   node tools/test_grab.js build_test/grab.js
 *
 * 用的是青果登录页真实的 DOM 结构（见 D:\dsh\DSH Desktop\_scratch_qg.html）：
 *   #username1  可见装饰框，HTML 里写死 value="账号"，focus 时 hide 自己
 *   #username   真提交框，display:none，初始无 value，由 JS 同步进来
 * 所以「用户填过学号」和「用户还没填」这两种页面态，必须给出不同结果。
 */
const fs = require('fs');
const vm = require('vm');

const jsPath = process.argv[2] || 'build_test/grab.js';
const code = fs.readFileSync(jsPath, 'utf8');

function el(value, attrs) {
  return { value: value, getAttribute: (n) => ((attrs || {})[n] === undefined ? null : attrs[n]) };
}

function run(dom) {
  const sandbox = {
    document: { querySelector: (s) => (dom[s] === undefined ? null : dom[s]) },
  };
  return vm.runInNewContext(code, sandbox, { timeout: 1000 });
}

const cases = [
  {
    name: '用户还没点过输入框：#username1 是占位「账号」，#username 空',
    dom: {
      'input#username': el(''),
      'input[name=username]': el(''),
      'input#username1': el('账号'),
    },
    want: '',
  },
  {
    name: '用户已经填了学号：#username 有真值（正确路径）',
    dom: {
      'input#username': el('20261430313'),
      'input[name=username]': el('20261430313'),
      'input#username1': el('账号'),
    },
    want: '20261430313',
  },
  {
    name: '只有装饰框有值（v1.1.1 的血案）→ 必须当没读到',
    dom: {
      'input#username': el(''),
      'input[name=username]': el(''),
      'input#username1': el('账号'),
    },
    want: '',
  },
  {
    name: '值等于 placeholder 属性本身 → 跳过',
    dom: {
      'input#username': el('请输入账号', { placeholder: '请输入账号' }),
      'input[name=username]': null,
      'input#username1': el('账号'),
    },
    want: '',
  },
  {
    name: '别的青果版本只有 #username1 且真的填了 → 兜底要能拿到',
    dom: {
      'input#username': null,
      'input[name=username]': null,
      'input#username1': el('20261430313'),
    },
    want: '20261430313',
  },
  {
    name: '三个框都不存在（学校改版）→ 空串，不误报',
    dom: { 'input#username': null, 'input[name=username]': null, 'input#username1': null },
    want: '',
  },
];

let bad = 0;
for (const c of cases) {
  const got = String(run(c.dom) || '');
  const pass = got === c.want;
  if (!pass) bad++;
  console.log((pass ? '  OK   ' : '  FAIL ') + c.name);
  console.log('         得到 ' + JSON.stringify(got) + ' / 期望 ' + JSON.stringify(c.want));
}

/* ---- Java 侧 isPlaceholderLike 的等价判定（license.js 的 looksLikeAccount 用它） ---- */
const PLACEHOLDER_WORDS = ['账号', '帐号', '学号', '用户名', '用户', '请输入账号', '请输入帐号',
  '请输入学号', '请输入用户名', '密码', '请输入密码', '手机号', '请输入手机号',
  'account', 'username', 'user', 'password', 'phone'];

function looksLikeAccount(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  if (PLACEHOLDER_WORDS.some((w) => w.toLowerCase() === s.toLowerCase())) return false;
  return /^\d{6,20}$/.test(s);
}

const licCases = [
  ['账号', false],
  ['20261430313', true],
  ['', false],
  ['  20261430313  ', true],
  ['13800138000', true],
  ['abc12345', false],
  ['USERNAME', false],
  ['2026143031', true],
];
console.log('\nlooksLikeAccount:');
for (const [v, want] of licCases) {
  const got = looksLikeAccount(v);
  const pass = got === want;
  if (!pass) bad++;
  console.log((pass ? '  OK   ' : '  FAIL ') + JSON.stringify(v) + ' -> ' + got);
}

console.log(bad === 0 ? '\n[PASS] 抓账号逻辑全部按预期' : '\n[FAIL] ' + bad + ' 项不符');
process.exit(bad === 0 ? 0 : 1);
