/* 课程提醒三档（响铃 / 静默 / 短信草稿）的行为测试（v1.1.41）
 *
 *   node tools/test_remind_modes.js
 *
 * 用户原话：「还有课前提醒，不一定非要是闹钟，可以只设置一条短信，
 *   因为有的人不喜欢闹钟提醒」。这一版最容易出的错不是「文件没写」，
 *   而是：①脏 mode 把人变成静默（从此再也不响，且无提示）；
 *   ②build() 没带 mode → 重启重挂退回响铃，用户选的静默白选；
 *   ③静默与响铃共用一个 NotificationChannel → importance 改不了，照样响；
 *   ④短信方式替用户把消息发出去了（越界）。
 * 这四类静态锚点都抓不住，所以真跑一遍逻辑 + 按源码结构钉。
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
  else { bad++; console.log('  \u2717 ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

function cut(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(name + ' 花括号不配平');
}

const src = read('web/reminder.js');

/* ---------------------------------------------------------------- 1. mode() 纯函数 */
console.log('1. 三档状态机（脏值一律回落响铃）');
{
  /* 从源码里切出 mode() 本体，注入可控的 pref —— 不复制实现。 */
  const code = [
    'const MODES = ["alarm","silent","sms"];',
    "const KEY_MODE = 'xxmu_remind_mode';",
    'function pref(k, def){ return __val === undefined ? def : __val; }',
    cut(src, 'mode'),
    'this.__mode = mode;',
  ].join('\n');
  function run(v, arg) {
    const s = { __val: v, undefined: undefined };
    s.globalThis = s;
    vm.createContext(s);
    vm.runInContext(code, s);
    return arg === undefined ? s.__mode() : s.__mode(arg);
  }
  ok(run('alarm') === 'alarm', 'alarm → alarm');
  ok(run('silent') === 'silent', 'silent → silent');
  ok(run('sms') === 'sms', 'sms → sms');
  ok(run('') === 'alarm', '空值 → alarm（默认不静默）');
  ok(run('#乱码%%') === 'alarm', '脏值 → alarm（绝不能把人静默）');
  ok(run('ALARM') === 'alarm', '大小写不合法 → alarm');
  ok(run(undefined, 'silent') === 'silent', '显式传值优先于 pref');
  ok(run('silent', 'bogus') === 'alarm', '显式脏值也回落 alarm');
}

/* ---------------------------------------------------------------- 2. build() 带 mode */
console.log('\n2. build() 每一项都带 mode（重启重挂才不退回响铃）');
{
  const START = new Date(2030, 0, 7, 0, 0, 0, 0);
  const TIMES = ['08:00~08:45'];
  const DATA = { courses: [{ name: '高等数学', room: 'A101', day: 1, weeks: [1], periods: [1] }] };
  const code = [
    'const MODES=["alarm","silent","sms"];',
    'function mins(){ return 15; }',
    'function mode(){ return __md; }',
    cut(src, 'startTimeOf'),
    cut(src, 'courseDate'),
    cut(src, 'build'),
    'this.__build = build;',
  ].join('\n');
  function buildWith(md) {
    const s = { TIMES, START, TOTAL_WEEKS: 20, DATA, Date, String, Array, parseInt, __md: md };
    s.globalThis = s;
    vm.createContext(s);
    vm.runInContext(code, s);
    return s.__build();
  }
  const a = buildWith('alarm');
  ok(a.length === 1, '有 1 条未来提醒', a.length);
  ok(a[0].mode === 'alarm', 'alarm 写进每一项');
  ok(buildWith('silent')[0].mode === 'silent', 'silent 写进每一项');
  ok(buildWith('sms')[0].mode === 'sms', 'sms 写进每一项');
  ok(a[0].name === '高等数学' && a[0].room === 'A101' && a[0].mins === 15,
    'name/room/mins 老字段没丢');
  const t = new Date(a[0].at);
  ok(t.getFullYear() === 2030 && t.getHours() === 7 && t.getMinutes() === 45,
    '时间仍是提前 15 分钟 = 07:45');
  ok(/out\.push\(\{ at, name: c\.name \|\| '', room: c\.room \|\| '', mins: m, mode: md \}\)/.test(src),
    '源码里 out.push 真的带 mode（不是测试里拼的）');
}

/* ---------------------------------------------------------------- 3. Java：双 channel */
console.log('\n3. Java 侧：静默必须用独立 channel（importance 创建后改不了）');
{
  const rcv = read('android/src/com/xxmu/helper/ReminderReceiver.java');
  ok(/CHANNEL_ALARM\s*=\s*"xxmu_class_reminder"/.test(rcv), '响铃沿用老 channel（老用户升级行为不变）');
  ok(/CHANNEL_SILENT\s*=\s*"xxmu_class_reminder_silent"/.test(rcv), '静默另开一个 channel');
  ok(/MODE_ALARM\.equals\(mode\)\s*\?\s*CHANNEL_ALARM\s*:\s*CHANNEL_SILENT/.test(rcv),
    '建 channel 时按方式二选一');
  ok(/NotificationManager\.IMPORTANCE_LOW/.test(rcv), '静默用 IMPORTANCE_LOW');
  ok(/NotificationManager\.IMPORTANCE_HIGH/.test(rcv), '响铃用 IMPORTANCE_HIGH');
  /* 反向：绝不能只用一个 channel 动态改 importance —— 系统会忽略，静默照样响。 */
  const chCount = (rcv.match(/new NotificationChannel\(/g) || []).length;
  ok(chCount === 1, '只在一处构造 channel（靠变量选 id/重要性），不是两处各写一遍', chCount);
  ok(/!MODE_ALARM\.equals\(mode\)|MODE_SILENT\.equals\(mode\)/.test(rcv) ||
     /MODE_ALARM\.equals\(mode\) \?/.test(rcv), '通知 Builder 也按方式选 channel');
  ok(/setPriority\(Notification\.PRIORITY_LOW\)/.test(rcv), '静默通知 setPriority(LOW)');
  ok(/MODE_SMS\.equals\(mode\)/.test(rcv), '短信档有独立分支');
  ok(/getStringExtra\("mode"\)/.test(rcv), 'Receiver 从广播里读 mode');

  const sched = read('android/src/com/xxmu/helper/ReminderScheduler.java');
  ok(/putExtra\("mode", o\.optString\("mode", ReminderReceiver\.MODE_ALARM\)\)/.test(sched),
    'Scheduler 把 mode 原样落盘（缺字段时回落 alarm）');
  ok(/KEY_LIST/.test(sched), '提醒列表仍落盘（重启重放带上 mode）');
}

/* ---------------------------------------------------------------- 4. 短信边界 */
console.log('\n4. 短信只开编辑页，不自动发、不读通讯录、不预填收件人');
{
  const rcv = read('android/src/com/xxmu/helper/ReminderReceiver.java');
  const mani = read('android/AndroidManifest.xml');
  ok(/Intent\.ACTION_SENDTO/.test(rcv), '用 ACTION_SENDTO（系统短信编辑页）');
  ok(/Uri\.parse\("smsto:"\)/.test(rcv), 'smsto: 不带号码（收件人空着）');
  ok(/sms_body/.test(rcv), '只预填正文 sms_body');
  ok(/【河医大助手】/.test(rcv), '正文有来源标识');
  if (/SmsManager|sendTextMessage|sendMultipartTextMessage/.test(rcv)) {
    ok(false, 'Receiver 里出现了自动发短信的 API（越界）');
  } else ok(true, '没有 SmsManager / sendTextMessage（不自动发）');
  if (/android\.permission\.SEND_SMS/.test(mani)) ok(false, 'manifest 申请了 SEND_SMS（不该）');
  else ok(true, 'manifest 没有 SEND_SMS 权限');
  if (/READ_CONTACTS|WRITE_CONTACTS/.test(mani)) ok(false, 'manifest 申请了通讯录权限（不该）');
  else ok(true, 'manifest 没有通讯录权限');
  if (/sms\.putExtra\("address"/.test(rcv)) ok(false, '预填了收件人（不该）');
  else ok(true, '没有预填收件人');
  ok(/getActivity\(context/.test(rcv), '短信 PendingIntent 指向 Activity（不再回自己代码）');
  ok(/function\ smsBody|static String smsBody/.test(rcv), '正文构造抽成函数（可单测）');
}

/* ---------------------------------------------------------------- 5. 前端接线与权限 */
console.log('\n5. 前端：三档按钮 / 试一下 / 权限 / 状态字');
{
  ok(/const KEY_MODE = 'xxmu_remind_mode'/.test(src), 'mode 的 pref 键');
  ok(/MODES = \['alarm', 'silent', 'sms'\]/.test(src), '三档顺序固定');
  ok(/function buildModes\(onPick\)/.test(src), 'buildModes 生成三档按钮');
  ok(/setAttribute\('data-mode', m\)/.test(src), '按钮带 data-mode');
  ok(/tryBtn\.id = 'rmPreview'/.test(src), '有「试一下」按钮');
  ok(/Host\.previewReminder/.test(src), '非短信档调 Java 预览通知');
  ok(/Host\.openSmsDraft/.test(src), '短信档调 Java 拉起编辑页');
  ok(/const m = mode\(\);/.test(src) && /m === 'sms'/.test(src), '短信档走单独分支');
  ok(/setPref\(KEY_MODE, m\)/.test(src), '点一档就落盘');
  ok(/apply\(\);/.test(src) && /paint\(\);/.test(src), '切档后重挂闹钟并刷状态字');
  ok(/MODE_LABEL\[mode\(\)\]/.test(src), '状态字写明当前方式（不谎报「已开启」）');
  ok(/静默.*通知|通知.*静默/.test(src) || /首次需允许通知权限/.test(src),
    '说明里交代静默也需要通知权限');
  ok(/不读通讯录|收件人/.test(src), '文案写明不读通讯录 / 收件人自己选');
  ok(/canNotify/.test(src), '仍检查通知权限');
  const main = read('android/src/com/xxmu/helper/MainActivity.java');
  ok(/public void previewReminder\(/.test(main), 'MainActivity 有 previewReminder 桥');
  ok(/public void openSmsDraft\(/.test(main), 'MainActivity 有 openSmsDraft 桥');
  const css = read('web/app.css');
  ok(/\.rm-mode\{/.test(css) && /\.rm-mode\.on\{/.test(css), '三档样式齐全');
}

console.log('\n' + (bad === 0
  ? '[PASS] 课程提醒三档 ' + total + ' 条断言全过（通知/短信真机仍需确认）'
  : '[FAIL] ' + bad + '/' + total + ' 条未过'));
process.exit(bad === 0 ? 0 : 1);
