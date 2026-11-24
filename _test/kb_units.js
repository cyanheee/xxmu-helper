const fs = require('fs');
const src = fs.readFileSync('web/sync.js', 'utf8');
const m = src.match(/function kbExpired\(text, raw\)\s*\{[\s\S]*?\n  \}/);
if (!m) { console.log('FAIL: kbExpired not found'); process.exit(1); }
const kbExpired = eval('(' + m[0] + ')');

const expired = "<script>alert('\u6e29\u99a8\u63d0\u793a\uff1a\u51ed\u8bc1\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55!');if (window.frmbody){  window.top.location.href='/'; } else { window.top.location.href='/'; }</script>";
const loginPage = fs.readFileSync('_test/login_form.html', 'utf8');

// \u6a21\u62df\u5df2\u767b\u5f55\u7684\u8bfe\u8868\u9875\uff1a\u5e26 frmbody \u5f15\u7528\u3001\u5e26 login.action \u767b\u51fa\u94fe\u63a5\u3001\u8db3\u591f\u957f\u3001\u542b\u5468\u6b21\u4e0e\u8bfe\u7a0b\u683c\u5b50
let kb = '<html><head><title>\u6211\u7684\u8bfe\u8868</title><script>var frmbody = window.frmbody || parent.frmbody;</script></head><body>';
kb += '<a href="/cas/login.action?logout=1">\u9000\u51fa\u767b\u5f55</a>';
for (let i = 0; i < 40; i++) kb += '<div id="div1" class="cell"><span>u8bfe\u7a0b' + i + ' \u7b2c1-16\u5468 \u5468\u4e00\u7b2c1\u8282</span></div>';
kb += '</body></html>';
console.log('fixture kb bytes=' + Buffer.byteLength(kb));

const cases = [
  ['\u5931\u6548\u9875 text+raw', kbExpired(expired, expired), true],
  ['\u5931\u6548\u9875 raw-only',   kbExpired('', expired), true],
  ['CAS \u767b\u5f55\u9875',        kbExpired(loginPage, loginPage), true],
  ['\u771f\u5b9e\u8bfe\u8868\u9875', kbExpired(kb, kb), false],
  ['\u7a7a\u54cd\u5e94',            kbExpired('', ''), false],
];
let bad = 0;
for (const [n, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? '[OK]   ' : '[BAD]  ') + n + '  got=' + got + ' want=' + want);
}
console.log(bad === 0 ? 'UNIT PASS' : 'UNIT FAIL ' + bad);
process.exit(bad === 0 ? 0 : 1);