/* 宿舍空调模块的离线测试：纯函数计算 + 「回前台自动刷新」的接线。
 *
 *   node tools/test_elec.js
 *
 * 为什么单独测这一块：
 *   v1.1.36 把「每次点进去重选四级」改成「只选一次、之后直出度数」，
 *   顺手补了「切回 App 自动刷一次」。这几件事里唯一能离线验的是
 *   roomverify 的拼法与拆法、楼层/房间的筛选、度数的取值，
 *   以及 Java 侧 onResume 回调到底有没有接到页面上。
 *
 * 能验与不能验：
 *   能验 —— 纯函数算得对不对、常量/回调名字有没有写错、参数名拼得对不对。
 *   不能验 —— 接口到底通不通、真机上切回 App 会不会刷。那要真机 + 校园网。
 *
 * 参数名的坑（实测踩过）：
 *   getfloorlist 的参数必须叫 buildid（小写）。写成 buildId / buildingid，
 *   服务端不报错，直接把全校 221 条楼层全返回 —— 静默错，最难查。
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

/* ---------------------------------------------------- 载入 elec.js 的纯函数部分 */

const src = read('web/elec.js');

function load() {
  /* 整个模块是 IIFE，加载时不碰 DOM（init 才绑事件），所以直接跑就行。
   * localStorage / Host 都不提供：pref() 里全是 try/catch，读不到就当空。 */
  const sandbox = {
    Date, JSON, Math, String, Number, Array, Object, parseInt, parseFloat, isNaN,
    console: { log() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;this.__E = ELEC;', sandbox);
  return sandbox.__E;
}

const E = load();

console.log('roomverify 拼法与拆法:');
/* 5 段：校区-公寓-单元-楼层-房间，第 3 段（单元）恒为空。
 * 拼错段数服务端会回「接收数据异常: 4」，而不是明确报错。 */
ok(E.rvOf({ z: '104', b: '26', f: '87', r: '44511' }) === '104-26--87-44511',
  'rvOf 拼出 5 段（第 3 段空）', E.rvOf({ z: '104', b: '26', f: '87', r: '44511' }));

const p1 = E.parseRv('104-26--87-44511');
ok(p1 && p1.z === '104' && p1.b === '26' && p1.f === '87' && p1.r === '44511',
  'parseRv 反解四级正确', JSON.stringify(p1));
ok(E.rvOf(p1) === '104-26--87-44511', 'parseRv → rvOf 往返一致', E.rvOf(p1));

/* 4 段是错的形态（真实踩过）：必须判为无效，不能猜 */
ok(E.parseRv('104-26-87-44511') === null, 'parseRv 对 4 段返回 null（不猜段位）');
ok(E.parseRv('') === null, 'parseRv 对空串返回 null');
ok(E.parseRv(null) === null, 'parseRv 对 null 返回 null');
ok(E.parseRv('1-2--3-4-5').z === '1', 'parseRv 段数偏多时仍按前 5 段解');

console.log('\n楼层筛选（照明表 vs 空调分表）:');
const floors = [
  { id: 82, name: '3层照明' }, { id: 83, name: '4层照明' },
  { id: 87, name: '5层空调' }, { id: 88, name: '6层空调' },
];
const af = E.airconFloors(floors);
ok(af.length === 2 && af[0].id === 87 && af[1].id === 88, '只留空调分表', af.map(x => x.name).join('/'));
ok(E.airconFloors([{ id: 1, name: '1层照明' }]).length === 1,
  '整栋没有空调分表时退回全部（让人自己认）');
ok(E.airconFloors([]).length === 0, '空列表不炸');
ok(E.airconFloors(null).length === 0, 'null 不炸');

console.log('\n找空调房间:');
const rooms = [
  { roomfullname: '河南医药大学南校区_4号学生公寓_5层照明_44511', roomverify: '104-26--84-44511' },
  { roomfullname: '河南医药大学南校区_4号学生公寓_5层空调_44511', roomverify: '104-26--87-44511' },
];
const hit = E.findAircon(rooms);
ok(hit && hit.roomverify === '104-26--87-44511', '在有照明房间时仍挑出空调那间', hit && hit.roomverify);
/* 不退回第一个 —— 把照明电表当空调显示，度数对不上会误导 */
ok(E.findAircon([{ roomfullname: '5层照明_44511', roomverify: '104-26--84-44511' }]) === null,
  '只有照明房间时返回 null（不退回第一个）');
ok(E.findAircon([]) === null, '空列表返回 null');
ok(E.findAircon(null) === null, 'null 返回 null');

console.log('\n多间房列全（v1.1.62 绑定防呆）:');
/* 学号名下常挂好几间（自己宿舍 + 误绑的别校区），不能只取第一间。 */
const multi = [
  { roomfullname: '河南医药大学西校区_第一学生公寓_5层空调_1505', roomverify: '105-21--63-1505' },
  { roomfullname: '河南医药大学南校区_1号学生公寓_5层空调_11505', roomverify: '104-23--63-11505' },
  { roomfullname: '河南医药大学南校区_1号学生公寓_5层照明_11505', roomverify: '104-23--62-11505' },
];
const ac = E.airconRooms(multi);
ok(ac.length === 2 && ac[0].roomverify === '105-21--63-1505' && ac[1].roomverify === '104-23--63-11505',
  'airconRooms 列全两间空调、排除照明', ac.map(x => x.roomverify).join('/'));
ok(E.findAircon(multi).roomverify === '105-21--63-1505', 'findAircon 仍取第一间空调（兼容旧调用）');
ok(E.airconRooms(null).length === 0, 'airconRooms(null) 不炸');

console.log('\n套间 AB 房自然排序（v1.1.62，官方把 AB 追加在末尾）:');
/* 官方 5 层空调 45 间里 22514B 是最后一条，老 Number(name) 排序得 NaN 沉底。 */
const suite = [
  { name: '22510' }, { name: '22514' }, { name: '22515' },
  { name: '22513' }, { name: '22512' }, { name: '22511' }, { name: '22514B' },
];
const sorted = E.roomSort(suite).map(x => x.name).join(',');
ok(sorted === '22510,22511,22512,22513,22514,22514B,22515',
  '22514B 紧跟 22514、而不是沉在末尾', sorted);
ok(suite[6].name === '22514B', 'roomSort 不改原数组（返回副本）');
/* 2 层套间 22214A / 22214B 同主号也要按字母排 */
const ab = E.roomSort([{ name: '22214B' }, { name: '22215' }, { name: '22214' }, { name: '22214A' }])
  .map(x => x.name).join(',');
ok(ab === '22214,22214A,22214B,22215', 'A/B 后缀按字母紧跟主号', ab);
/* 无法解析的房号沉底但不炸 */
const weird = E.roomSort([{ name: '未知' }, { name: '22510' }]).map(x => x.name).join(',');
ok(weird === '22510,未知', '非数字房号沉底、不 NaN 乱序', weird);
ok(E.roomSort(null).length === 0, 'roomSort(null) 不炸');

console.log('\n入口卡房间名压缩（v1.1.62）:');
ok(E.roomBrief('河南医药大学南校区-1号学生公寓-5层空调-11505') === '南校区 1号学生公寓 5层空调 11505',
  '去校名前缀、连字符换空格', E.roomBrief('河南医药大学南校区-1号学生公寓-5层空调-11505'));
ok(E.roomBrief('新乡医学院_西校区_1505') === '西校区 1505', '旧校名也去掉', E.roomBrief('新乡医学院_西校区_1505'));
ok(E.roomBrief('') === '', '空串不炸', E.roomBrief(''));

console.log('\n剩余度数取值:');
/* detaillist 可能有多段（电/空调分项），取最大值。
 * 取第一个会在分项顺序变化时给出错的数字。 */
ok(E.oddOf({ detaillist: [{ odd: '57.72' }, { odd: '60.1' }] }) === 60.1, '取 odd 最大值', E.oddOf({ detaillist: [{ odd: '57.72' }, { odd: '60.1' }] }));
ok(E.oddOf({ detaillist: [{ odd: '57.72' }] }) === 57.72, '单段取那一段');
ok(E.oddOf({ detaillist: [] }) === null, '空 detaillist 返回 null');
ok(E.oddOf({ detaillist: [{ odd: 'abc' }] }) === null, '非数字 odd 返回 null（不显示 NaN）');
ok(E.oddOf({}) === null, '没有 detaillist 返回 null');

console.log('\n每日用量文案:');
const now = new Date();
const md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
const u1 = E.usageLine({ weekuselist: [{ date: md, dayuse: 1.89 }, { date: '01-01', dayuse: 2.5 }] });
ok(u1.indexOf('今日用 1.89 度') >= 0, '有今天的记录就显示今日', u1);
const u2 = E.usageLine({ weekuselist: [{ date: '01-01', dayuse: 2.5 }] });
ok(u2.indexOf('昨天用 2.5 度') >= 0, '最后一条不是今天时当昨天', u2);
ok(E.usageLine({}) === '', '没有 weekuselist 返回空串');
ok(E.usageLine(null) === '', 'null 返回空串');

console.log('\n常量与参数名（写错会静默返回全校数据）:');
ok(src.indexOf("K_ROOM = 'xxmu_elec_room'") >= 0, '记住房间的 key 在');
ok(src.indexOf("K_LAST = 'xxmu_elec_last'") >= 0, '记住上次度数的 key 在');
ok(/const STALE = 30 \* 1000/.test(src), '自动刷新的 30 秒门槛在');
ok(src.indexOf('buildid: buildid') >= 0, 'getfloorlist 用 buildid（小写）');
ok(src.indexOf('floorid: floorid') >= 0, 'getroomnumlist 用 floorid');
ok(src.indexOf('buildId:') < 0 && src.indexOf('buildingid:') < 0, '没有写错成 buildId/buildingid');
ok(src.indexOf("CUSTOMER_CODE = '709'") >= 0, '学校代码 709');

console.log('\n自动刷新接线:');
/* 页面侧：init 里既挂 visibilitychange 也要开 window.__onResume。
 * 只挂 visibilitychange 不够 —— 真机切后台时 WebView 常保持 document.hidden === false。 */
ok(src.indexOf("document.addEventListener('visibilitychange'") >= 0, 'elec 监听 visibilitychange');
ok(src.indexOf('window.__onResume = function') >= 0, 'elec 暴露 window.__onResume');
ok(src.indexOf("body.querySelector('.elec-face')") >= 0,
  'autoRefresh 用 .elec-face 判断「正看着度数」（比标志位可靠）');
ok(src.indexOf('autoRefresh,') >= 0, 'autoRefresh 已导出');

/* Java 侧：onResume 里必须真的调一次 __onResume，否则页面永远等不到这个信号 */
const mact = read('android/src/com/xxmu/helper/MainActivity.java');
ok(/protected void onResume\(\)/.test(mact), 'MainActivity 有 onResume');
const rs = mact.slice(mact.indexOf('protected void onResume()'));
const rsBody = rs.slice(0, rs.indexOf('protected void onPause()'));
ok(rsBody.indexOf('window.__onResume') >= 0, 'onResume 回调 window.__onResume', rsBody.replace(/\s+/g, ' ').slice(0, 80));
ok(rsBody.indexOf('evaluateJavascript') >= 0, '用 evaluateJavascript 而不是 loadUrl("javascript:")');
ok(/catch \(Throwable ignored\)/.test(rsBody), 'onResume 回调包着 try/catch（页面没加载完时不能崩）');

/* 边界：自动刷新不能变成「后台按秒轮询」—— 那是学校服务器。
 * v1.1.37 起允许一个 10 分钟的定时器，但它只能刷入口卡（entryRefresh），
 * 绝不能去动半框（showRoom）—— 否则用户正看着度数会被自己刷走。 */
ok(/const AUTO_MS = 10 \* 60 \* 1000/.test(src), '入口卡定时是 10 分钟');
ok(/setInterval\([\s\S]{0,120}entryRefresh\(\)/.test(src), '定时器只调 entryRefresh');
ok(!/setInterval\s*\([^)]*autoRefresh/.test(src), 'autoRefresh 没有被 setInterval 定时轮询');
ok(!/setInterval\s*\([^)]*showRoom/.test(src), 'showRoom 没有被 setInterval 定时轮询');
ok(/if \(document\.hidden\) return;/.test(src), '页面不可见时跳过这一拍（不后台白刷）');

console.log('\n入口卡上的度数（v1.1.37）:');
ok(src.indexOf("$('elecEntryOdd')") >= 0, 'paintEntry 找得到 #elecEntryOdd');
ok(src.indexOf("$('elecRefresh')") >= 0, 'init 绑了 #elecRefresh');
ok(/rbtn\.onclick[\s\S]{0,160}stopPropagation/.test(src),
  '点刷新不会连带打开半框（stopPropagation）');
/* 换了房间还贴着旧房间的度数会让人算错电费：只有 rv 一致才显示 */
ok(/c\.rv === cur\.rv/.test(src), '只在「数字属于当前记住的房间」时才显示');
ok(src.indexOf("num.textContent = '--'") >= 0, '没数据时显示 -- 而不是 0');
ok(/function entryRefresh/.test(src) && /entryRefresh, paintEntry/.test(src), 'entryRefresh/paintEntry 已导出');
ok(!/fetchRoom\(acct, cur\.rv\)[\s\S]{0,200}TOKEN/.test(src),
  'entryRefresh 不碰 TOKEN（不打断半框重绘）');

/* 红线：仍然只读、仍然不在 App 内支付 */
ok(!/createOrder|orderNo|afterPay|paymentOrder/i.test(src), '没有支付/下单逻辑');
ok(src.indexOf("'unbindroom'") >= 0, '有 unbindroom（换房间时清旧的）');

console.log('\n' + (bad === 0
  ? '[PASS] 宿舍空调 ' + total + ' 项全过（接口真通不通仍需真机）'
  : '[FAIL] ' + bad + '/' + total + ' 项未过'));
process.exit(bad === 0 ? 0 : 1);
