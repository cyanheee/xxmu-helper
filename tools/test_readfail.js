/* 前端「读失败」与「没有数据」的行为测试（真跑 app.js 里那四个读入口）。
 *
 *   node tools/test_readfail.js
 *
 * 为什么必须有这个：v1.1.15 把 Java 侧 readFileIfBig 的失败返回值从 "" 改成
 * null（原来两者同形）。这个改动的价值全在「前端真的把它当失败处理」上 ——
 * 只要有一个读入口还在判 `raw && raw.length > 20`，null 就会和 "" 一样
 * 走「没有数据」分支，Java 那边改了等于白改，而且现象还是最难发现的那种：
 * 学生看到的是上一学期甚至别人的课表，界面写着「已同步」。
 *
 * 做法：从 app.js 里把四个函数体原样切出来（不跑整个文件，避免 DOM 依赖），
 * 注入一个假的 Host 与 READ_ERR，逐场景断言。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  → ' + extra : '')); }
}

/** 从源码里按函数名切出完整的 `function name(...) { ... }` 文本。
 *  只做花括号计数 —— app.js 里这些函数体内没有字符串形式的孤立 `}`，
 *  所以够用；比正则贪婪匹配可靠（正则会在第一个 `}` 就截断）。 */
function cut(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(name + ' 花括号不配平');
}

/* 只取这四个读入口 + readFail 与 READ_ERR 的声明。 */
const code = [
  'const READ_ERR = { schedule: "", homework: "" };',
  cut('readFail'),
  cut('readExternal'),
  cut('readCached'),
  cut('readExternalHomework'),
  cut('readCachedHomework'),
  'this.__api = { readExternal, readCached, readExternalHomework, readCachedHomework, READ_ERR };',
].join('\n');

/** 造一个运行上下文：给定 Host 各方法返回值，跑一遍四个读入口 */
function run(hostImpl) {
  const sandbox = {
    Host: hostImpl,
    console: { warn() {} },
    JSON,
    Array,
    Object,
    String,
    Error,
    RegExp,
  };
  sandbox.window = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'app-readers.js' });
  return sandbox.__api;
}

const GOOD_SCHEDULE = JSON.stringify({ user: '20261440117', courses: [{ name: '人体解剖学', day: 1, weeks: [1, 2], periods: [1, 2] }] });
const GOOD_HOMEWORK = JSON.stringify({ works: [{ name: '作业一', status: '待做' }] });

console.log('\n[1] 正常数据：外部优先，能读出来');
{
  const api = run({
    externalSchedule: () => GOOD_SCHEDULE,
    cachedSchedule: () => GOOD_SCHEDULE,
    externalHomework: () => GOOD_HOMEWORK,
    cachedHomework: () => GOOD_HOMEWORK,
  });
  const s = api.readExternal();
  ok(s && s.user === '20261440117', '外部课表读到了');
  ok(s && s._source === 'external', '外部读出来的数据带 _source=external');
  ok(api.READ_ERR.schedule === '', '成功时不留错误');
  ok(api.readExternalHomework()._source === 'external', '外部作业读到了');
}

console.log('\n[2] 没有文件（Java 返回空串）：当成「没有数据」，不报错');
{
  const api = run({
    externalSchedule: () => '', cachedSchedule: () => '',
    externalHomework: () => '', cachedHomework: () => '',
  });
  ok(api.readExternal() === null, '空串 → null');
  ok(api.READ_ERR.schedule === '', '空串不算错误（这是「还没同步」不是「读坏了」）');
  ok(api.readCachedHomework() === null && api.READ_ERR.homework === '', '作业同理');
}

console.log('\n[3] 读失败（Java 返回 null）：必须记错误，不能伪装成「没有数据」');
{
  const api = run({
    externalSchedule: () => null, cachedSchedule: () => null,
    externalHomework: () => null, cachedHomework: () => null,
  });
  const s = api.readExternal();
  ok(s === null, '读失败返回 null（由上层决定怎么显示）');
  ok(/读取失败/.test(api.READ_ERR.schedule), '外部课表读失败写进了 READ_ERR',
    JSON.stringify(api.READ_ERR.schedule));
  /* 作业是另一条独立链路，必须**分别调用**才能断言（漏了就是漏了一个入口）。 */
  ok(api.readExternalHomework() === null, '外部作业读失败返回 null');
  ok(/读取失败/.test(api.READ_ERR.homework), '外部作业读失败写进了 READ_ERR',
    JSON.stringify(api.READ_ERR.homework));

  /* 关键一条：四个入口都要各自记错。
   * 只改前两个、漏了缓存那两个，就是「外部读不出来 → 退到缓存 →
   * 缓存也读不出来 → 静默用内置数据」的完整链条。 */
  const api2 = run({
    externalSchedule: () => '', cachedSchedule: () => null,
    externalHomework: () => '', cachedHomework: () => null,
  });
  ok(api2.readCached() === null, '缓存读失败也返回 null');
  ok(/读取失败/.test(api2.READ_ERR.schedule), '缓存课表读失败也记了错误',
    JSON.stringify(api2.READ_ERR.schedule));
  ok(api2.readCachedHomework() === null, '缓存作业读失败也返回 null');
  ok(/读取失败/.test(api2.READ_ERR.homework), '缓存作业读失败也记了错误',
    JSON.stringify(api2.READ_ERR.homework));
}

console.log('\n[4] 内容坏了（有字节但 JSON 解析不了）：同样要报错，且原因不同');
{
  const api = run({
    externalSchedule: () => '{"courses": [坏掉的内容，这里故意不闭合',
    cachedSchedule: () => '', externalHomework: () => '{"works": [ {"name": 坏掉的内容，这里故意不闭合',
    cachedHomework: () => '',
  });
  ok(api.readExternal() === null, '坏 JSON 返回 null');
  ok(/解析失败/.test(api.READ_ERR.schedule), '坏 JSON 的提示是「解析失败」而不是「读不出来」',
    JSON.stringify(api.READ_ERR.schedule));
  ok(api.readExternalHomework() === null, '作业坏 JSON 返回 null');
  ok(/解析失败/.test(api.READ_ERR.homework), '作业坏 JSON 同理',
    JSON.stringify(api.READ_ERR.homework));
}

console.log('\n[5] 结构对但内容不完整：要说出来');
{
  const api = run({
    externalSchedule: () => JSON.stringify({ user: '20261440117', synced_at: 1, term: '2026-2027-1' }),   /* 结构对但没有 courses */
    cachedSchedule: () => '', externalHomework: () => '', cachedHomework: () => '',
  });
  ok(api.readExternal() === null, '没有 courses 数组 → null');
  ok(/不完整/.test(api.READ_ERR.schedule), '提示「内容不完整」', JSON.stringify(api.READ_ERR.schedule));
}

console.log('\n[6] Host 抛异常：不能把整个界面打死');
{
  const api = run({
    externalSchedule: () => { throw new Error('boom'); },
    cachedSchedule: () => '', externalHomework: () => { throw new Error('boom'); },
    cachedHomework: () => '',
  });
  ok(api.readExternal() === null, 'Host 抛异常时返回 null');
  ok(/出错/.test(api.READ_ERR.schedule), '记了「读外部课表出错」', JSON.stringify(api.READ_ERR.schedule));
}

console.log('\n[7] 没有 Host（浏览器预览）：安静地当没有数据');
{
  const api = run(undefined);
  ok(api.readExternal() === null && api.READ_ERR.schedule === '', '无 Host 时不报错也不崩');
}

console.log('\n' + (bad === 0
  ? '  [PASS] 读失败/没数据 的区分逻辑通过 ' + total + ' 项'
  : '  [FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
