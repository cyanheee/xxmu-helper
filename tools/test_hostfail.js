/* 双入口自动回退的行为测试（真跑 auth.js 里的 fetchAny 逻辑）。
 *
 *   node tools/test_hostfail.js
 *
 * 为什么必须有这个：v1.1.17 要把服务地址改成「先试自有域名、失败退 pages.dev」。
 * 这条逻辑有三种写法会导致非常难查的故障，全都不会报错：
 *   ① 只要失败就换域名 → 服务端一次 500，所有人的每个请求都白等一轮超时，
 *      而且会在两个域名之间来回跳、重复提交；
 *   ② 探通后不记住 → 每次请求都先撞一次坏域名，本来 200ms 的请求变成 20 秒；
 *   ③ 把 AUTH.BASE 改成函数 → app.js 那 5 处 `AUTH.BASE` 全部 TypeError，
 *      而且它们都在业务逻辑之前，整个入口从第一行就断了（v1.1.12 的事故）。
 *
 * 做法：从 auth.js 里切出 HOSTS / liveHost / baseNow / isNetFail / fetchAny，
 * 注入一个假的 XXMU.net（脚本化返回），在 vm 里跑。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'auth.js'), 'utf8');

let bad = 0, total = 0;
function ok(cond, label, extra) {
  total++;
  if (cond) console.log('  \u2713 ' + label);
  else { bad++; console.log('  \u2717 ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a)); }

/** 按花括号配平切出函数体。 */
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

/* 只取回退逻辑这几块。注意 HOSTS / liveHost 是 const/let，要原样搬过来。 */
const CODE = [
  "const HOSTS = ['https://www.xxmuhelper.top', 'https://xxmu-auth.pages.dev'];",
  "let liveHost = '';",
  cut('baseNow'),
  cut('isNetFail'),
  cut('fetchAny'),
  'this.__api = { fetchAny, baseNow, isNetFail, HOSTS, getLive: () => liveHost };',
].join('\n');

/**
 * 造沙箱。
 * @param script { 'host+path': [响应, ...] } 按顺序消耗，用完重复最后一个。
 *               响应可以是字符串，也可以是 Error（模拟 throw）。
 */
function make(script) {
  const calls = [];
  const used = {};

  const XXMU = {
    net(url, method, body, contentType, headers, asMultipart) {
      calls.push({ url, method, body, contentType, headers, asMultipart });
      const seq = script[url];
      if (!seq) return Promise.resolve('ERR:Unknown:没有为 ' + url + ' 准备响应');
      const n = used[url] || 0;
      used[url] = n + 1;
      const pick = seq[Math.min(n, seq.length - 1)];
      if (pick instanceof Error) return Promise.reject(pick);
      return Promise.resolve(pick);
    },
  };

  const sandbox = { XXMU, Promise, String, Array, Object, Error, console: { warn() {} } };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'auth-cut.js' });
  return { api: sandbox.__api, calls, used };
}

const NEW = 'https://www.xxmuhelper.top';
const OLD = 'https://xxmu-auth.pages.dev';

(async function main() {

  console.log('\n[1] 首选域名正常 → 只打一次，不碰回退地址');
  {
    const m = make({ [NEW + '/v1/config']: ['200|{"ok":true}'] });
    const raw = await m.api.fetchAny('/v1/config', 'GET', '', '', '', '');
    eq(raw, '200|{"ok":true}', '拿到首选域名的响应');
    eq(m.calls.length, 1, '只发了一个请求');
    eq(m.api.getLive(), NEW, '记住首选域名');
    eq(m.api.baseNow(), NEW, 'baseNow 返回首选');
  }

  console.log('\n[2] 首选域名 DNS 不通 → 回退到 pages.dev');
  {
    /* 这正是 2026-11-04 的真实情形：校园 DNS 查不到新域名。 */
    const m = make({
      [NEW + '/v1/config']: ['ERR:UnknownHost:Unable to resolve host'],
      [OLD + '/v1/config']: ['200|{"ok":true}'],
    });
    const raw = await m.api.fetchAny('/v1/config', 'GET', '', '', '', '');
    eq(raw, '200|{"ok":true}', '最终拿到回退地址的响应');
    eq(m.calls.length, 2, '试了两次（首选一次 + 回退一次）');
    eq(m.api.getLive(), OLD, '记住回退地址');
    eq(m.api.baseNow(), OLD, 'baseNow 切到回退地址');
    ok(m.calls[0].url.indexOf(NEW) === 0, '第一次打首选');
    ok(m.calls[1].url.indexOf(OLD) === 0, '第二次打回退');
  }

  console.log('\n[3] 探通后不再重复探测（省一轮超时）');
  {
    const m = make({
      [NEW + '/v1/config']: ['ERR:Timeout:请求超时'],
      [OLD + '/v1/config']: ['200|{"ok":true}'],
      [OLD + '/v1/check']: ['200|{"ok":true}'],
    });
    await m.api.fetchAny('/v1/config', 'GET', '', '', '', '');
    const callsAfterFirst = m.calls.length;
    await m.api.fetchAny('/v1/check', 'GET', '', '', '', '');
    eq(m.calls.length - callsAfterFirst, 1, '第二次请求只发一次，没有回头撞坏域名');
    ok(m.calls[m.calls.length - 1].url.indexOf(OLD) === 0, '第二次也走回退地址');
  }

  console.log('\n[4] 服务端 500 不许换域名（这条最容易写错）');
  {
    /* 主机是活的，只是服务端出错。换域名毫无意义，只会让每个请求都白等一轮。 */
    const m = make({ [NEW + '/v1/config']: ['500|{"ok":false}'] });
    const raw = await m.api.fetchAny('/v1/config', 'GET', '', '', '', '');
    eq(raw, '500|{"ok":false}', '原样返回 500');
    eq(m.calls.length, 1, '没有去试回退地址');
    eq(m.api.getLive(), NEW, '仍然认定首选是活的');
  }

  console.log('\n[5] 404 / 429 同样不换');
  {
    for (const code of ['404', '429', '401']) {
      const m = make({ [NEW + '/v1/x']: [code + '|{}'] });
      await m.api.fetchAny('/v1/x', 'GET', '', '', '', '');
      eq(m.calls.length, 1, code + ' 不触发回退');
    }
  }

  console.log('\n[6] 两个都不通 → 把最后一个错误原样交上去');
  {
    const m = make({
      [NEW + '/v1/config']: ['ERR:UnknownHost:x'],
      [OLD + '/v1/config']: ['ERR:Timeout:y'],
    });
    const raw = await m.api.fetchAny('/v1/config', 'GET', '', '', '', '');
    eq(raw, 'ERR:Timeout:y', '返回最后一个网络错误');
    eq(m.calls.length, 2, '两个都试过');
    eq(m.api.getLive(), '', '没有记住任何一个（都没通）');
    eq(m.api.baseNow(), NEW, '没探通时 baseNow 给首选');
  }

  console.log('\n[7] isNetFail 的判定边界');
  {
    const m = make({});
    ok(m.api.isNetFail('ERR:Timeout:x') === true, 'ERR: 开头算网络失败');
    ok(m.api.isNetFail('200|{}') === false, '200 不算');
    ok(m.api.isNetFail('0|') === false, '0| 不算');
    ok(m.api.isNetFail('') === false, '空串不算');
    ok(m.api.isNetFail(null) === false, 'null 不算');
    /* 关键刁钻样本：正文里含 "ERR:" 但状态码正常，不能误判成网络失败。 */
    ok(m.api.isNetFail('200|{"msg":"ERR:xxx"}') === false,
      '正文里含 ERR: 但前缀是 200 —— 不算网络失败');
  }

  console.log('\n[8] POST 与 adminKey 头的传递没被回退逻辑弄丢');
  {
    const m = make({ [NEW + '/v1/admin/config']: ['200|{"ok":true}'] });
    await m.api.fetchAny('/v1/admin/config', 'POST', '{"a":1}', 'application/json', '', 'SECRET');
    const c = m.calls[0];
    eq(c.method, 'POST', '方法保留');
    eq(c.body, '{"a":1}', 'body 保留');
    eq(c.headers, 'x-admin-key: SECRET', 'adminKey 拼进了头');
    eq(c.asMultipart, '0', 'asMultipart 传 0');
  }

  console.log('\n[9] AUTH.BASE 必须是属性、不能是函数（v1.1.12 事故防线）');
  {
    /* app.js 有 5 处 `AUTH.BASE + '/xxx'`。如果这里退化成函数，
     * 拼出来就是 "function () {...}/xxx"，或者调用时直接 TypeError。
     * 必须剥注释再查 —— 上面的说明里就写了 `AUTH.BASE()` 这个错误写法，
     * 不剥会自己命中自己（HANDOFF 坑 32 记过同一件事）。 */
    const bare = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

    const hasGetter = /Object\.defineProperty\(api,\s*'BASE'/.test(bare);
    console.log('  auth.js 用 defineProperty 定义 BASE =', hasGetter);
    if (!hasGetter) { bad++; console.log('    ✗ BASE 必须是 getter 属性，不能改成函数'); }
    else { total++; console.log('    ✓'); }

    const asFn = /AUTH\.BASE\s*\(\s*\)/.test(bare);
    console.log('  auth.js 里没有 AUTH.BASE() 调用 =', !asFn);
    if (asFn) { bad++; console.log('    ✗ 出现了 AUTH.BASE() —— 属性被当函数调'); }
    else { total++; console.log('    ✓'); }

    /* 反向：getter 必须真的返回运行期地址，不能写成常量。 */
    const liveGetter = /get:\s*function\s*\(\)\s*\{\s*return\s+baseNow\(\)/.test(bare);
    console.log('  getter 返回 baseNow()（运行期地址）=', liveGetter);
    if (!liveGetter) { bad++; console.log('    ✗ BASE 的 getter 必须返回 baseNow()，否则回退后地址不会变'); }
    else { total++; console.log('    ✓'); }
  }

  console.log('\n' + (bad === 0
    ? '  [PASS] 双入口回退逻辑通过 ' + total + ' 项'
    : '  [FAIL] ' + bad + '/' + total + ' 项未过'));
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => {
  console.log('\n[FAIL] 测试自身抛异常：' + (e && e.stack || e));
  process.exit(1);
});
