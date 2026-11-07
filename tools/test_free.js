/* 离线测试：全校空闲教室（web/free.js）
 *
 * 用真机抓下来的教务页面（tools/fixtures/kfree_w10.html，第 10 周博学楼整栋）
 * 当固定向量，验证三件事：
 *   1. parseMatrix 能把 39~40 间教室、每间 7 天 × 14 节全部解出来；
 *   2. **红色 = 占用**——用用户本人第 10 周课表交叉校验，19 个已知在上课的格子
 *      必须全部被判为「占用」；反过来（红=空闲）必须几乎全部失败。
 *      这条是本文件存在的理由：表头写的是「空闲节次」，红格却是被占的。
 *   3. 傍晚1 这种非数字节次不会被当成 12 节，也不会让整行丢掉。
 *
 * 跑法：node tools/test_free.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let bad = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  [PASS] ' + msg);
  else { bad++; console.log('  [FAIL] ' + msg); }
}

/* ---------- 把 free.js 装进沙箱 ---------- */

const src = fs.readFileSync(path.join(root, 'web', 'free.js'), 'utf8');

// free.js 只在函数体里用到这些全局，装的时候给最小桩即可
const sandbox = {
  TextDecoder: TextDecoder,
  encodeURIComponent: encodeURIComponent,
  Promise: Promise,
  Date: Date,
  JSON: JSON,
  console: console,
  PERIODS: 14,
  DAYS: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  curWeek: 10,
  el: (t, c, x) => ({ tag: t, cls: c, text: x, kids: [], appendChild(k) { this.kids.push(k); } }),
  Host: { getPref: () => '', setPref: () => {} },
  XXMU: {
    pref: () => '',
    netCk: () => Promise.resolve(''),
    splitResp: r => ({ code: 0, body: r || '' }),
    currentTerm: () => ({ xn: '2026', xq: '0', label: '2026-2027-1' })
  },
  document: { getElementById: () => null }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
// `const KFREE = ...` 在 vm 里不会挂到 sandbox 上（const 不进全局对象），
// 只能再求值一次拿引用。
const KFREE = vm.runInContext('KFREE', sandbox);

ok(!!KFREE, 'free.js 载入后导出 KFREE');

/* ---------- 真机页面当固定向量 ---------- */

const fx = path.join(root, 'tools', 'fixtures', 'kfree_w10.html');
if (!fs.existsSync(fx)) {
  console.log('  [SKIP] 缺少固定向量 ' + fx + '（从真机抓一次即可，见文件头注释）');
} else {
  const raw = fs.readFileSync(fx);
  // Java 侧就是这么传的：GBK 字节按 ISO-8859-1 一 char 一 byte 带过来
  const latin = raw.toString('latin1');
  const html = new TextDecoder('gbk').decode(raw);

  const rooms = KFREE.parseMatrix(html);
  ok(rooms.length >= 35, '解析出教室数 = ' + rooms.length + '（应 ≥35）');

  const names = rooms.map(r => r.room);
  ok(names.indexOf('3401') >= 0, '含 3401');
  ok(names.indexOf('3301') >= 0, '含 3301');
  ok(rooms.every(r => Object.keys(r.g).length >= 10), '每间教室至少 10 个节次');

  const r3401 = rooms.filter(r => r.room === '3401')[0];
  ok(!!r3401, '拿到 3401 的条目');
  ok(r3401.seats === 275, '3401 座位数 = ' + r3401.seats + '（应为 275）');
  ok(r3401.type === '多媒体教室', '3401 类型 = ' + r3401.type);
  ok(!!r3401.bang, '3401 有「傍晚1」那一节（不能丢）');
  ok(!('傍晚1' in r3401.g), '「傍晚1」没被塞进数字节次表');

  /* ---------- 语义：红色 = 占用 ---------- */

  // 用户第 10 周真实课表（截图核对过）：[教室, [节次], 星期(1=周一)]
  const CLS = [
    ['3301', [1, 2], 1], ['3402', [1, 2, 3], 4],
    ['3104', [4, 5], 2], ['3402', [4, 5], 3], ['3203', [4, 5], 4],
    ['3501', [7, 8], 1], ['3501', [7, 8], 2], ['3401', [7, 8], 4],
    ['3203', [10, 11], 3]
  ];
  const byName = {};
  rooms.forEach(r => { byName[r.room] = r; });

  let hit = 0, miss = 0, na = 0;
  const missList = [];
  for (const [room, ps, day] of CLS) {
    const r = byName[room];
    if (!r) { na++; continue; }
    for (const p of ps) {
      const row = r.g[String(p)];
      if (!row) { na++; continue; }
      if (row[day - 1]) hit++;
      else { miss++; missList.push(room + ' 周' + day + ' 第' + p + '节'); }
    }
  }
  ok(hit >= 17 && miss === 0,
    '红色=占用：命中 ' + hit + ' / ' + (hit + miss) + ' 个已知在上课的格子' +
    (miss ? '（漏：' + missList.join('、') + '）' : ''));

  let wrong = 0;
  for (const [room, ps, day] of CLS) {
    const r = byName[room];
    if (!r) continue;
    for (const p of ps) {
      const row = r.g[String(p)];
      if (row && row[day - 1]) wrong++;   // 反着理解的话，红格就成了「空」
    }
  }
  ok(wrong >= 17, '反着理解（红=空闲）会错 ' + wrong + ' 格 —— 证明语义唯一');

  /* ---------- freeAt / freeList ---------- */

  // 3401 周四(4) 第 7-8 节有高数 → 不空
  const seg78 = { t: '7-8', ps: [7, 8], bang: false };
  ok(KFREE.freeAt(r3401, 4, seg78) === false, '3401 周四 7-8 节判为「有课」');
  // 3401 周四 第 3 节：矩阵里是空的
  const seg3 = { t: '3', ps: [3], bang: false };
  ok(KFREE.freeAt(r3401, 4, seg3) === true, '3401 周四第 3 节判为「空」');
  ok(KFREE.freeList(r3401, 4, { t: 'all', ps: [1, 2, 3, 4, 5, 6, 7, 8], bang: false }) === '1-3',
    '3401 周四 1-8 节的空档压缩成 "1-3"，实得 "' +
    KFREE.freeList(r3401, 4, { t: 'all', ps: [1, 2, 3, 4, 5, 6, 7, 8], bang: false }) + '"');

  /* ---------- 表单字段 ---------- */

  const body = KFREE.matrixBody('01', '0003', 10);
  ok(body.indexOf('xnxq=2026%2C0') >= 0, '学期编码是 2026,0（年是年、0=第一学期）');
  ok(body.indexOf('xq_m=0') >= 0, 'xq_m 跟学期同步 = 0');
  ok(body.indexOf('selXQ=01') >= 0, '校区参数 selXQ');
  ok(body.indexOf('selLF=0003') >= 0, '楼参数 selLF');
  ok(body.indexOf('selJSI=&') >= 0, 'selJSI 留空 = 整栋');
  ok(body.indexOf('txtZC=10') >= 0, '周次 txtZC');
  ok(body.indexOf('menucode_current=SB12') >= 0, 'menucode_current=SB12');
  ok(body.indexOf('rad_jc=1') >= 0 && body.indexOf('lyjc=1') >= 0, 'rad_jc / lyjc 都在');
  ok(body.split('&').length === 14, '字段数 14（实得 ' + body.split('&').length + '）');

  /* ---------- 失败页面要能说出人话 ---------- */

  ok(KFREE.reasonOf('<script>alert(\'温馨提示：凭证已失效，请重新登录!\')</script>')
    .indexOf('重新登录') >= 0, '凭证失效页 → 提示去重新登录');
  const rn = KFREE.reasonOf('<script>alert(未设置的周排课天数/天排课节次。\\n请与系统管理员联系！)</script>');
  ok(rn.indexOf('周排课') >= 0, '「未设置的周排课」被原样带出来（实得 "' + rn + '"）');
  ok(KFREE.reasonOf('<html><body>hi</body></html>').indexOf('表格') >= 0, '无表格 → 说没有表格');

  /* ---------- 乱码不能直接贴给学生（v1.1.49） ----------
   * 有学生看到空闲教室那行灰字是
   * 「妮十⊖鎖悮 チ锌氥噚璇佸凡澧辩胺夯闁喰梒鐧诲祵海綪!」——
   * 教务维护/网关页本是 UTF-8，被我们按 GBK 硬解的结果。
   * 字节错配不可逆，只能在显示层判断「像不像人话」。 */

  const MOJI_TA = '妮十⊖鎖悮 チ锌氥噚璇佸凡澧辩胺夯闁喰梒鐧诲祵海綪!';
  const MOJI_1 = '鎻愮ず锛氳峰厛鐧诲綍鍚庡啀鏌ヨ锛';
  const MOJI_2 = '閹绘劗銇氶敍姘愁嚞閸忓牏娅ヨぐ鏇炴倵閸愔秵鐓＄拠顫磼';

  ok(KFREE.looksReadable(MOJI_TA) === false, '截图那串乱码判为「看不懂」');
  ok(KFREE.looksReadable(MOJI_1) === false, 'UTF-8 当 GBK 的单层乱码判为「看不懂」');
  ok(KFREE.looksReadable(MOJI_2) === false, '双层错配乱码判为「看不懂」');
  ok(KFREE.looksReadable('') === false, '空串不算人话');
  ok(KFREE.looksReadable('abc 123') === false, '没有汉字不算人话');
  ok(KFREE.looksReadable('这栋楼这周没有排课数据') === true, '正常中文判为「看得懂」');
  ok(KFREE.looksReadable('系统正在维护，请稍后重试') === true, '维护提示判为「看得懂」');

  // 乱码走了兜底，不能把原始串漏给学生
  const rm = KFREE.reasonOf('<script>alert(' + MOJI_TA + ')</script>');
  ok(rm.indexOf('鎖') < 0 && rm.indexOf('⊖') < 0, '乱码页不再原样带出（实得 "' + rm + '"）');
  ok(rm.length > 4, '乱码页给出一句能看懂的兜底（实得 "' + rm + '"）');
  // 正常提示仍然原样带出，兜底不能把好文案也吃掉
  const rOk = KFREE.reasonOf('<script>alert(系统正在维护，请稍后重试)</script>');
  ok(rOk.indexOf('系统正在维护') >= 0, '正常提示照旧原样带出（实得 "' + rOk + '"）');
}

/* ---------- 时段切分 ---------- */

const ss = KFREE.segs();
ok(ss.length === 4, '四个时段：上午/下午/晚上/全天');
ok(ss[0].ps[0] === 1 && ss[0].ps[ss[0].ps.length - 1] === 6, '上午 = 1-6');
ok(ss[1].ps[0] === 7 && ss[1].ps[ss[1].ps.length - 1] === 10, '下午 = 7-10');
ok(ss[3].bang === true, '全天包含「傍晚」那一节');
ok(ss[0].bang === false, '上午不含「傍晚」');

console.log('');
console.log(bad === 0
  ? '[PASS] 空闲教室 ' + total + ' 项全过'
  : '[FAIL] ' + bad + ' / ' + total + ' 项失败');
process.exit(bad === 0 ? 0 : 1);
