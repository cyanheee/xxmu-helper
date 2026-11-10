/* 河医大助手 - 校园事务：饮水机（胖乖生活） + 空教室
 *
 * ============================ 饮水机 ============================
 *
 * 现实约束：学校的直饮水机是「胖乖生活」（qiekj）平台的。它没有开放接口，
 * 唯一能用的方式是它自己 h5（h5.qiekj.com）在用的那套 HTTP 接口。
 *
 * 接口不是猜的，是从官方 h5 生产代码（app.js / pages_skip / pages_waterGoods /
 * pages_waterMachine 四个分片）里逐字读出来，再用真机二维码实测对过的：
 *   网关     https://userapi.qiekj.com/
 *   鉴权     表单里的 token 字段（不是 Header）
 *   必带头   uid / phoneBrand
 *   返回约定 HTTP 200 且 code===0 才取 data；code===2 表示未登录
 *
 * ============ 这台机器走的是「货架式」路线，不是「直连式」 ============
 *
 * 实测（2026-11，真实二维码 https://h5.qiekj.com/skip?SN=865403065048324）：
 *
 *   路线 A · 货架式（本机走这条，正确）
 *     POST goods/scan/v2        { SN }        → { id: <goodsId>, categoryName:"饮水机" }
 *     POST goods/normal/details { goodsId }   → { name, imei, machineId, brandName, … }
 *     POST goods/normal/skus    { goodsId }   → [ { skuId, name } ]  ← 出水口
 *     POST goods/water/unlock   { skuId }     → { msgId }
 *     POST machine/msg/sync     { msgId }     → { state }  "OK" 才算开阀
 *
 *   路线 B · 直连式（另一批机器可能有，这台不行）
 *     machine/detail + machine/function/list + machine/water/unlock
 *     实测：machine/function/list 与 machine/water/unlock 在当前网关是 404，
 *     machine/detail 用 SN 当 machineId 返回 4000「设备未绑定」。
 *     所以这条路整段删掉了，留着只会把人引到死路。
 *
 * 为什么「扫一次就能一直一键出水」：
 *   二维码里带的是机器 SN（就是 imei），SN 不变；SN 换 goodsId，goodsId 换
 *   出水口 skuId，全都不变。把它们存到本机，以后点「接水」直接调 unlock。
 *   不需要模拟点击、不需要无障碍服务、不需要 hook 别人的 App。
 *
 * 为什么必须登录：
 *   goods/normal/skus 和 goods/water/unlock 都要求 token（未登录返回 code=2）。
 *   登录走胖乖自己的短信码：common/sms/sendCode → user/reg。token 存在本机，
 *   不上传任何地方。
 *
 * 我们**不做**的事（有意为之）：
 *   - 不充值、不下单、不绑一卡通（动钱的操作留给官方的慧生活798）
 *   - 不后台定时出水、不自动签到
 *   - 不保存密码（胖乖只有短信码登录，本来也没有密码）
 *
 * 关于「停止出水」与「结算」：
 *   早先只看了 pages_waterGoods 一个分片，那里没有 stop 调用，于是误判成
 *   「没有远程停止接口」。真相是：货架式饮水机把结束按钮的逻辑放在公用 mixin
 *   `src/pages/chooseShowerMachine/showerMachine/common.js` 的 handleDeviceEnd
 *   里（chunk pages_showerMachine~pages_waterGoods），与淋浴机共用，所以
 *   pages_waterGoods 自己搜不到。完整链路（从 sourcemap 逐字读出）：
 *
 *     POST goods/endWater          { goodsId }   → 结束出水（唯一入参是 goodsId）
 *     POST goods/shower/sync       { skuId }     → { status, amount, identify }
 *     POST order/afterPay/creating { orderNo }   → { orderId, orderStatus, payType }
 *     支付页  https://h5.qiekj.com/pay/afterPay/paymentOrder/paymentOrder?id=<orderId>&pathType=1
 *
 *   status 语义（官方 machineUnlocked 的 switch）：1 等待解锁 / 2 正在出水 /
 *   4 解锁成功等待出水 → 继续轮询；3、5 完成（amount>0 且 identify 存在就要建单，
 *   否则直接回首页）；6 故障 → 回首页。
 *   identify 是「待建单的流水号」，不是订单号。
 *   淋浴机（categoryCode === '08'）的结束接口是 shower/goods/remoteEnd，饮水机
 *   不是，这里只用 goods/endWater。
 *
 * ⚠️ v1.1.16 两个关键修正（都是用户实机用出来的）
 *
 * 【一】`goods/water/unlock` 不是开阀，是「解锁」
 *   官方 h5 解锁成功页的原文是「请在出水口处点按开始接水」，下面一行
 *   「结束后将自动为您计费」。所以手机做完这一步之后，**人还得在机器出水口
 *   按一下物理按键才会出水**。官方全部接口（已穷举，二十来个）里没有任何
 *   「远程开阀」的能力 —— 这是平台的硬件设计，不是我们没找对接口。
 *   界面文案因此必须写「已解锁，去出水口按一下」，绝不能写「已开阀 / 正在出水」，
 *   那会让人站在机器前等水出来。
 *
 * 【二】整块**不做结算了**（用户要求）
 *   原话：「最后的结账功能不需要，因为胖乖app里需要绑定支付宝免密支付。」
 *   也就是说 endWater 之后那一步 order/afterPay/creating 建单，需要账号先签约
 *   支付宝免密代扣，而这一步自己做不了、也不该替学生去签约。硬做的话，
 *   用户会走到「订单已生成、点去付款」，然后在一个官方页面里卡住。
 *   所以 v1.1.16 把 openSettle / endWaterAndSettle / 结算方式切换全部删掉，
 *   界面只剩「放水 / 停止」。**费用仍在胖乖生活的账单里，学生自己去官方 App 付** ——
 *   这一点必须写在界面上，否则用户会以为这个功能把水费免了。
 *   `createOrder` 函数体保留（协议记录），但没有任何界面入口。
 *
 * 【三】「定量放水」v1.1.60 收敛为诚实版（不再假装能按 ml 自动停）
 *   把胖乖生产代码（8 个 chunk + sourcemap / 522 个源文件）翻到底后坐实：
 *     · 放水途中用户侧 HTTP 只轮询 status，amount 全程为 0、只在结算后出现；
 *     · 真实流量 flow 由设备霍尔流量计经 BLE/2G 私有加密通道
 *       （machine/bluetooth/report cmdCode:'0701'，orderNo-flow 串）
 *       在设备结束时上报一次结算值，用户侧 hook 不到；
 *     · goods/water/unlock、machine/water/unlock、goods/endWater 全无
 *       volume/quota/ml 入参，stateCmd 回的 quantity 只存进 privateData.params
 *       再没被读过 —— 平台没有「出 N ml 就停」；
 *     · 全库无 WebSocket/SSE/MQTT 长连接。连官方 H5 也只在完成态
 *       if (res.amount>0 && res.identify) handleStop()。
 *   因此「App 按 ml 精确自停」在 WebView+HTTP 桥下不成立；计时法（v1.1.59）
 *   被「流速不固定」否定，不再换皮保留。
 *   v1.1.60 = 解锁 → 人在机器上按 → 接够了自己点「停止」（endWater）
 *     → 结算 amount 原样显示，标「单位以胖乖账单为准」，绝不换算成毫升。
 *   另留「防跑水」超时兜底（最长时长自动发一次 endWater），明说是防忘关的
 *   安全网、不是按量停。400↔1600 的换算无公开 API 可坐实，不再拍系数。
 * 
 * ============================ 空教室 ============================
 *
 * 说明白：本机只知道自己课表里出现过的教室。所以「空教室」的算法是——
 * 把课表里出现过的所有教室收集起来，减去目标时段被占用的，剩下的就是空的。
 * 这看不到别的班的课，因此只能当参考。要准确结果得用教务系统的空闲教室查询
 * （青果的这个页面路径无法离线推定，所以只能给一个「打开教务系统」的入口）。
 */

const WATER = (() => {
  const BASE = 'https://userapi.qiekj.com/';
  /* 支付页在官方 h5，不在 API 网关。货架式建单成功后跳这里付款。 */
  const PAY_PAGE = 'https://h5.qiekj.com/pay/afterPay/paymentOrder/paymentOrder';
  const K_TOKEN = 'xxmu_water_token';
  const K_PHONE = 'xxmu_water_phone';
  const K_UID = 'xxmu_water_uid';
  const K_DEVS = 'xxmu_water_devs';
  /* 结算方式（v1.1.1）。
   *   'two' = 接水、结算两个独立按钮（老样子，各管一件事）
   *   'one' = 一个键，接完就变成「结束并结算」
   * 只影响按钮布局，两条路走的是同一条 endWater → sync → createOrder 链路。 */
  const K_MODE = 'xxmu_water_settle';

  const hasHost = () => typeof Host !== 'undefined' && Host;

  /* ---------------- 基础 ---------------- */

  /** 官方 phoneBrand 是小写品牌名，不是机型。把常见厂商映射过去。 */
  function brand() {
    const ua = navigator.userAgent || '';
    const m = /Android[^;]*;\s*([^;)]+)/i.exec(ua);
    const s = (m ? m[1] : ua).toLowerCase();
    if (/iphone|ipad|ipod/.test(s)) return 'iphone';
    if (/huawei|honor|hmscore|harmony|hw-/.test(s)) return 'huawei';
    if (/oppo|oneplus|realme|\bcph\d|\bpm[ab]\d|\bp[a-z]{2}\d{3}/.test(s)) return 'oppo';
    if (/vivo|iqoo/.test(s)) return 'vivo';
    if (/xiaomi|redmi|\bmi[ -]|\bpoco|\bmi\d/.test(s)) return 'xiaomi';
    if (/samsung|sm-[a-z0-9]+/.test(s)) return 'samsung';
    return 'default';
  }

  function kv(obj) {
    return Object.keys(obj)
      .filter(k => obj[k] !== null && obj[k] !== undefined)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])))
      .join('&');
  }

  /** 一次网络请求，返回 Promise<data>。
   * multipart 是解锁路由（以及显式 multipart:true 的请求）的官方编码；
   * 其他已实测正常的查询仍沿用 urlencoded，避免一次改动碰所有接口。 */
  function call(path, params) {
    return new Promise((resolve, reject) => {
      if (!hasHost() || !XXMU.net) {
        const e = new Error('需要在 App 内使用');
        e.endpoint = path;
        reject(e);
        return;
      }
      const body = {};
      const o = params || {};
      Object.keys(o).forEach(k => {
        if (o[k] !== null && o[k] !== undefined && o[k] !== '') body[k] = o[k];
      });
      const tk = XXMU.pref(K_TOKEN);
      /* 官方 filterData 即使 token 为空也会带上 token 字段，只有 null /
       * undefined 才删。这里保持一致，避免网关把「缺字段」当成 code=-1。 */
      body.token = tk || '';

      const headers = 'uid: ' + (XXMU.pref(K_UID) || '') + '\nphoneBrand: ' + brand();
      // XXMU.net 优先走异步桥，不阻塞 JS 线程
      /* 官方 $post 走 multipart/form-data。解锁必须对齐官方编码；已经实测
       * 正常的 SN 查询与出水口查询保留旧编码，减少对其他路由的影响。 */
      const multipart = path === 'goods/water/unlock' || (params && params.multipart);
      XXMU.net(BASE + path, 'POST', kv(body),
        'application/x-www-form-urlencoded', headers, multipart ? '1' : '0').then(raw => {
        const r = XXMU.splitResp(raw);
        if (!r) { const e = new Error('没有返回内容'); e.endpoint = path; reject(e); return; }
        if (r.code < 0) { const e = new Error(r.body || '网络错误'); e.endpoint = path; reject(e); return; }
        const text = XXMU.decodeAuto(r.body);
        let j;
        try {
          j = JSON.parse(text);
        } catch (e) {
          const err = new Error('返回不是 JSON（HTTP ' + r.code + '）：' + String(text || '').slice(0, 80));
          err.endpoint = path;
          reject(err);
          return;
        }
        // 官方约定：code===0 才算成功
        if (j && j.code === 0) { resolve(j.data); return; }
        const msg = (j && (j.msg || j.message)) || ('接口返回 code=' + (j && j.code));
        const err = new Error(msg);
        if (j) { err.code = j.code; err.msg = msg; err.detail = j.data; }
        err.endpoint = path;
        reject(err);
      }, e => { if (e && !e.endpoint) e.endpoint = path; reject(e); });
    });
  }

  /* ---------------- 登录（短信码） ---------------- */

  function sendCode(phone) {
    if (!/^1\d{10}$/.test(phone || '')) return Promise.reject(new Error('手机号格式不对'));
    return call('common/sms/sendCode', { phone: phone, template: 'reg' });
  }

  /**
   * 登录。官方 h5 走 user/reg，channel=h5，verify 和 code 都填短信码
   * （verify 是早年图形码留下的字段，现在传短信码也能过）。
   */
  function login(phone, code) {
    if (!/^1\d{10}$/.test(phone || '')) return Promise.reject(new Error('手机号格式不对'));
    if (!/^(?:\d{4}|\d{6})$/.test(code || '')) return Promise.reject(new Error('验证码格式不对（应为 4 位或 6 位数字）'));
    return call('user/reg', {
      channel: 'h5', phone: phone, code: code, verify: code,
    }).then(d => {
      const tk = d && (d.token || d.accessToken);
      if (!tk) throw new Error('登录成功但没拿到 token');
      XXMU.pref(K_TOKEN, tk);
      XXMU.pref(K_PHONE, phone);
      // uid 优先用服务端返回的，没有就拿手机号顶着（只是给网关看的标记）
      XXMU.pref(K_UID, String((d && (d.uid || d.userId || d.id)) || phone));
      return d;
    });
  }

  function logout() {
    XXMU.pref(K_TOKEN, '');
    XXMU.pref(K_PHONE, '');
    XXMU.pref(K_UID, '');
  }

  function logged() {
    return !!XXMU.pref(K_TOKEN);
  }

  /* ---------------- 设备本地列表 ---------------- */

  function loadDevs() {
    try {
      const a = JSON.parse(XXMU.pref(K_DEVS) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function saveDevs(list) {
    XXMU.pref(K_DEVS, JSON.stringify(list));
  }

  /* ---------------- 取水设定（v1.1.16，原「结算方式」位置） ---------------- */

  /* 原来这里是 settleMode / setSettleMode（'two' | 'one'，决定「接水/结算合并
   * 还是分开」）。v1.1.16 把结算整块删掉后它没有意义了 —— 见文件头「为什么
   * 不做结算」。但 K_MODE 这个 pref 键要留着并主动清掉：老版本升上来的手机上
   * 它还存着 'one'/'two'，虽然新代码不读，但留着会让以后排查的人以为还有
   * 两套行为。clearLegacyMode 在 init 时调一次。 */

  function clearLegacyMode() {
    try {
      if (XXMU.pref(K_MODE)) XXMU.pref(K_MODE, '');
    } catch (e) {}
  }

  /* ================================================================
   * v1.1.60 诚实版：不再假装能「按 ml 自动停」。
   *
   * 2026-11-09 把胖乖生产代码（8 个 chunk + sourcemap / 522 个源文件）翻到底：
   *   · 放水途中用户侧 HTTP 每秒只轮询 status（1/2/4 继续、3/5 完成态才吐
   *     amount），amount 全程为 0、只在结算后出现 —— 实机「接时显示 0，
   *     点结算才冒出来」；
   *   · 真实流量 flow 由设备霍尔流量计经 BLE/2G 私有加密通道
   *     （machine/bluetooth/report cmdCode:'0701'，orderNo-flow 串）在设备
   *     结束时上报一次结算值，用户侧 HTTP 桥 hook 不到；全库无长连接；
   *   · goods/water/unlock、machine/water/unlock、goods/endWater 全无
   *     volume/quota/ml 入参；stateCmd 回的 quantity 只存进 privateData.params
   *     再没被读过 —— 平台没有「出 N ml 就停」。
   * 所以 v1.1.58 盯 amount、v1.1.59 按标定流速计时换算 ml 两条路都不成立
   * （流速每次不固定），400↔1600 的换算无公开 API 可坐实，不再拍系数。
   *
   * 现在只剩一个诚实的功能：「最长放水」= 防忘关超时兜底，与水量无关。
   * 解锁 → 人在机器上按 → 接够了自己点「停止」(endWater) → 结算 amount
   * 原样显示，标「单位以胖乖账单为准」，绝不换算成毫升。
   * ================================================================ */
  const K_GUARD = 'xxmu_water_guard';

  /* 最长放水（秒）。0 = 不自动停，只靠手动「停止」。 */
  function guardSec() {
    const n = parseInt(XXMU.pref(K_GUARD) || '0', 10) || 0;
    return n >= 0 ? n : 0;
  }
  function setGuardSec(n) {
    const v = Math.max(0, parseInt(n, 10) || 0);
    XXMU.pref(K_GUARD, String(v));
    return v;
  }

  /**
   * 从二维码内容里抠出「机器 SN」。
   *
   * 胖乖的机器二维码长这样：https://h5.qiekj.com/skip?SN=865403065048324
   * SN 就是机器的 imei，15 位数字。goods/scan/v2 只认这个 SN —— 实测传
   * 完整 URL（qrCode=…）或 imei=… 都返回「参数不正确」。
   *
   * 同时兼容老式 hash 路由里的 machineId（另一批机器用），最后兜底抓第一段长数字。
   */
  function parseSn(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    // 纯数字
    if (/^\d{6,20}$/.test(s)) return s;
    // ?SN=xxx / &SN=xxx / sn=xxx（大小写都收）
    let m = /[?&#](?:SN|sn|snCode|imei)=([0-9A-Za-z]{4,32})/.exec(s);
    if (m) return m[1];
    // URL 被 encode 过一次的情况
    m = /(?:SN|sn|imei)%3D([0-9A-Za-z]{4,32})/.exec(s);
    if (m) return m[1];
    // /machine/123456 这种路径
    m = /machine\/(\d{4,20})/i.exec(s);
    if (m) return m[1];
    // 兜底：抓第一段 6 位以上的数字
    m = /(\d{6,20})/.exec(s);
    return m ? m[1] : '';
  }

  /** 兼容旧名字：以前这个函数返回 machineId，现在返回 SN，语义一样是「机器唯一号」 */
  const parseMachineId = parseSn;

  /**
   * 扫机器码 → 设备信息。
   *
   * 三步都是必要的，少一步拿不到能出水的东西：
   *   1. goods/scan/v2   SN → goodsId（不需要登录）
   *   2. goods/normal/details  拿名字/品牌/客服电话/长 machineId（不需要登录）
   *   3. goods/normal/skus      拿出水口 skuId（**需要登录**，未登录返回 code=2）
   *
   * 第 3 步失败不算绑定失败：机器本身已经确认存在，先存下来让用户看到名字，
   * 登录之后可以点「刷新出水口」再补。
   */
  function fetchMachine(sn) {
    return call('goods/scan/v2', { SN: sn }).then(d => {
      const goodsId = d && (d.id != null ? d.id : d.goodsId);
      if (!goodsId) throw new Error('这个码扫不出商品编号，可能不是胖乖生活的机器码');
      return call('goods/normal/details', { goodsId: goodsId }).then(x => {
        const info = x || {};
        return fetchSkus(goodsId).then(
          fns => buildDev(sn, goodsId, info, fns),
          () => buildDev(sn, goodsId, info, [])
        );
      });
    });
  }

  /** 出水口列表。失败（未登录/平台改版）返回空数组的 reject，由调用方决定怎么处理 */
  function fetchSkus(goodsId) {
    return call('goods/normal/skus', { goodsId: goodsId }).then(list => {
      const arr = Array.isArray(list) ? list : [];
      const fns = [];
      arr.forEach(f => {
        const id = f && (f.skuId != null ? f.skuId : f.id);
        if (id == null) return;
        fns.push({ id: String(id), name: String(f.name || f.skuName || '出水口') });
      });
      fns.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      return fns;
    });
  }

  function buildDev(sn, goodsId, info, fns) {
    return {
      // id 用 goodsId：它是出水接口的入参主键，比 SN 更直接
      id: String(goodsId),
      sn: String(sn),
      machineId: String(info.machineId || ''),
      name: String(info.name || ('机器 ' + goodsId)),
      brand: String(info.brandName || ''),
      tel: String(info.serviceTelephone || ''),
      org: String(info.orgName || ''),
      functions: fns,
      at: Math.floor(Date.now() / 1000),
    };
  }

  /** 绑定：先联网确认机器存在，成功才存本地。
   *  入参允许直接给二维码原文 —— 内部先归一成 SN，免得调用方忘了先 parse。 */
  function bind(raw) {
    const sn = parseSn(raw);
    if (!sn) return Promise.reject(new Error('这个码里没有机器编号'));
    return fetchMachine(sn).then(dev => {
      const list = loadDevs().filter(x => x.id !== dev.id);
      list.push(dev);
      saveDevs(list);
      return dev;
    });
  }

  /**
   * 补一次出水口（登录之后用）。
   *
   * 顺带承担「老数据迁移」：v0.9.6 及更早存的条目 id 是 SN（因为那时走的是
   * machine/detail 那条死路），现在 id 是 goodsId。所以这里不直接拿 id 去查
   * skus，而是整台机器重新拉一遍，再按新 id 替换旧条目。
   */
  function refreshDev(key) {
    const list = loadDevs();
    const old = list.filter(x => x.id === String(key))[0];
    if (!old) return Promise.reject(new Error('本地没有这台机器'));
    const sn = old.sn || old.id;
    return fetchMachine(sn).then(fresh => {
      fresh.at = old.at || fresh.at;
      const rest = loadDevs().filter(x => x.id !== old.id && x.id !== fresh.id);
      rest.push(fresh);
      saveDevs(rest);
      return fresh;
    });
  }

  function unbind(goodsId) {
    saveDevs(loadDevs().filter(x => x.id !== String(goodsId)));
  }

  function findDev(goodsId) {
    return loadDevs().filter(x => x.id === String(goodsId))[0] || null;
  }

  /* ---------------- 出水 ---------------- */

  /**
   * 解锁一个出水口（= 把这台机器放进「可以接水」的状态）。
   *
   * ⚠️ 语义澄清（v1.1.16，用户实机反馈后从官方源码确认）：
   *   `goods/water/unlock` **不是开阀**。官方 h5 解锁成功页的原文是
   *   「请在出水口处点按开始接水」，也就是说：手机做完这一步之后，
   *   **人还要在机器出水口按一下物理按键才会出水**。这不是我们没找到接口 ——
   *   官方全部接口（已穷举）里没有任何「远程开阀」的能力，这是平台的硬件设计。
   *   所以界面上不要写「已开阀」「正在出水」，那会让人以为水已经在流。
   *   准确的说法是「已解锁，去出水口按一下」。
   *
   * 返回 Promise<{ok, msgId, tries, detail}>。
   *
   * 为什么解锁后还要轮询：unlock 只是把命令下发到机器，机器走的是
   * 串口/2G 通道（goods/normal/details 里 communication:"serial"），
   * 机器回「已解锁」要几百毫秒到几秒。官方前端也是轮询 machine/msg/sync。
   *
   * 轮询语义（照抄官方 checkUnlockStatus，包括它的怪脾气）：
   *   - 返回空/ null  → 机器还没回话，继续等
   *   - state === 'OK'  → 成功
   *   - code === '05' 且蓝牙 resultBle === '05' → 成功（蓝牙机器）
   *   - 有值但不是 OK  → 立刻失败，不要傻等 15 次
   */
  function unlock(skuId, onProgress) {
    if (!logged()) return Promise.reject(new Error('请先登录胖乖生活账号'));
    if (!skuId) return Promise.reject(new Error('这台机器还没有出水口，先在下面点「刷新出水口」'));
    return call('goods/water/unlock', { skuId: skuId, forbiddenPromotionTypes: '' }).then(d => {
      const msgId = d && (d.msgId || d.id);
      if (!msgId) throw new Error('解锁命令没发出去（没有 msgId）');
      return pollMsg(msgId, onProgress).then(res => {
        return { ok: true, msgId: msgId, tries: res.tries, detail: res.data };
      });
    });
  }

  /**
   * 解锁，失败时**自动重新绑定一次再重试**（v1.1.16）。
   *
   * 用户报的现象：某台机器点接水，弹「饮水机平台拒绝了这次请求（code=-1）」，
   * 按提示点「重新绑定」之后再点接水就好了 —— 也就是说 code=-1 很多时候
   * 不是「这台机器不能远程控制」，而是**本机存着的 skuId 过期了**
   * （平台侧换过批次/商家重绑过机器，出水口 id 会变）。
   *
   * 让人手动点两次是不该的：既然失败后的正确动作是固定的（重拉 sku 列表 →
   * 用新 skuId 再试一次），那就自动做。这条是「拦一次给一条出路」的正向版本：
   * 先自己修，修不好再让人看见。
   *
   * 只在**明确的平台拒绝**（code=-1 / -19 / 参数不正确）时重试。
   * 余额不足（-52）、未签约（-88/-87）、限流（5134）这些重绑也没用，
   * 重试只会让用户多等一轮还看到同样的错。
   *
   * @param dev  设备对象（取 dev.id = goodsId、dev.sn）
   * @param fn   出水口对象（取 fn.id = skuId）
   * @param onProgress 轮询进度回调
   * @param onRetry    即将重绑时通知界面（参数：错误对象）
   */
  const RETRY_CODES = ['-1', '-19'];

  function unlockWithRebind(dev, fn, onProgress, onRetry) {
    const first = unlock(fn && fn.id, onProgress);
    return first.catch(e => {
      const code = e && e.code != null ? String(e.code) : '';
      const retriable = RETRY_CODES.indexOf(code) >= 0
        || /参数不正确/.test(String((e && e.message) || ''));
      if (!retriable) throw e;
      if (!dev || !dev.sn) {
        /* 没有 SN 就没法重绑（老版本存的条目没有 SN）。把原因说清楚，
         * 不要让用户看到一个裸的 code=-1 不知道下一步做什么。 */
        const err = new Error('这台机器的出水口编号可能过期了，但本地没存 SN，没法自动刷新。'
          + '请用「扫码 / 输入机器码添加」重新添加一次这台机器。');
        err.code = e && e.code;
        throw err;
      }
      if (onRetry) onRetry(e);
      return refreshDev(dev.id).then(fresh => {
        const fns = (fresh && fresh.functions) || [];
        /* 优先用同名出水口：冷/热两个口时，重绑后数组顺序可能变，
         * 用「第几个」会开到另一个口。 */
        const wantName = fn && fn.name;
        const hit = fns.filter(x => x.name === wantName)[0]
          || fns.filter(x => x.id === (fn && fn.id))[0]
          || fns[0];
        if (!hit) {
          const err = new Error('重新读取后这台机器还是没有出水口。'
            + '请确认胖乖生活账号已登录，或到机器旁重新扫码。');
          err.code = e && e.code;
          throw err;
        }
        return unlock(hit.id, onProgress).then(res => {
          res.rebound = true;
          res.usedFn = hit;
          return res;
        });
      });
    });
  }

  function pollMsg(msgId, onProgress) {
    let tries = 0;
    const MAX = 15;
    return new Promise((resolve, reject) => {
      const tick = () => {
        tries++;
        call('machine/msg/sync', { msgId: msgId }).then(d => {
          if (onProgress) onProgress(tries, (d && (d.state || d.code)) || '');
          if (!d) {                       // 还没回话
            if (tries >= MAX) { reject(new Error('机器一直没有响应（' + MAX + ' 次）')); return; }
            setTimeout(tick, 1000);
            return;
          }
          const state = String(d.state || '');
          const code = String(d.code || '');
          if (state === 'OK' || code === '05') { resolve({ tries: tries, data: d }); return; }
          const err = new Error('机器拒绝了这次解锁（' + (state || code || '未知') + '）');
          err.detail = d;
          reject(err);
        }).catch(e => {
          // 单次网络抖动不该判定失败，继续等到上限
          if (tries >= MAX) { reject(e); return; }
          setTimeout(tick, 1200);
        });
      };
      setTimeout(tick, 600);
    });
  }

  /* ---------------- 结束出水 / 结算 ---------------- */

  /**
   * 结束出水。官方入参只有 goodsId（不是 skuId、不是 SN）。
   *
   * 调用后机器不一定立刻停：串口/2G 通道要几秒。所以成功后照官方做法接着轮询
   * goods/shower/sync 等 status 变 3/5，再走结算。这里只负责「把结束命令发出去」，
   * 不判断是否真停 —— 判断交给 syncWater。
   */
  function endWater(goodsId) {
    if (!logged()) return Promise.reject(new Error('请先登录胖乖生活账号'));
    if (!goodsId) return Promise.reject(new Error('缺少机器编号'));
    return call('goods/endWater', { goodsId: String(goodsId) });
  }

  /**
   * 查一次出水状态。返回 {status, amount, identify}。
   *
   * skuId 是出水口 id（unlock 时用的那个），官方轮询就是拿它查。
   * status 语义见文件头注释。这里不翻译，原样返回，让调用方决定。
   */
  function syncWater(skuId) {
    if (!skuId) return Promise.reject(new Error('缺少出水口编号'));
    return call('goods/shower/sync', { skuId: String(skuId) }).then(d => {
      const o = d || {};
      return {
        status: Number(o.status) || 0,
        amount: Number(o.amount) || 0,
        identify: o.identify ? String(o.identify) : '',
        raw: o,
      };
    });
  }

  /**
   * 轮询到结束为止。onTick(第几次, {status,amount}) 用来更新界面文案。
   *
   * 官方是 1 秒一次、无上限（waterSync 自递归）。这里加上限（默认 120 次 ≈ 2 分钟），
   * 免得机器掉线时永远转圈；到上限不报错，返回 {pending:true} 让界面提示「还在出水」。
   */
  function waitDone(skuId, onTick, maxTries) {
    const MAX = maxTries || 120;
    let n = 0;
    return new Promise((resolve, reject) => {
      const tick = () => {
        n++;
        syncWater(skuId).then(s => {
          if (onTick) onTick(n, s);
          // 3、5 完成；6 故障
          if (s.status === 3 || s.status === 5) { resolve({ done: true, tries: n, sync: s }); return; }
          if (s.status === 6) { resolve({ done: true, failed: true, tries: n, sync: s }); return; }
          if (n >= MAX) { resolve({ pending: true, tries: n, sync: s }); return; }
          setTimeout(tick, 1000);
        }).catch(e => {
          if (n >= MAX) { resolve({ pending: true, tries: n, err: e }); return; }
          setTimeout(tick, 1500);
        });
      };
      setTimeout(tick, 800);
    });
  }

  /**
   * identify → orderId。**v1.1.16 起整个结算链路不再被调用**，保留函数是因为
   * 它是这条协议唯一的可执行记录（以后想恢复不必回源码里重新挖一遍），
   * 而且 tools/test_api_contract.js 还在对照它的字段。
   *
   * 不做的理由见文件头「为什么不做结算」。**不要**在界面上重新接它。
   *
   * 官方 addOrder 页面的 addOrderSync 就是这么做的：拿不到 orderId 就 1 秒后
   * 重试，拿到就按 orderStatus 分流。返回 {orderId, orderStatus, payType, paid}。
   */
  function createOrder(identify, onTick, maxTries) {
    if (!identify) return Promise.reject(new Error('没有待建单的流水号'));
    const MAX = maxTries || 15;
    let n = 0;
    return new Promise((resolve, reject) => {
      const tick = () => {
        n++;
        call('order/afterPay/creating', { orderNo: String(identify) }).then(d => {
          const o = d || {};
          const orderId = o.orderId ? String(o.orderId) : '';
          if (onTick) onTick(n, o);
          if (orderId) {
            resolve({
              orderId: orderId,
              orderStatus: Number(o.orderStatus) || 0,
              payType: o.payType != null ? o.payType : '',
              paid: Number(o.orderStatus) === 2,
              url: PAY_PAGE + '?id=' + encodeURIComponent(orderId) + '&pathType=1',
            });
            return;
          }
          if (n >= MAX) { reject(new Error('订单一直没生成（试了 ' + MAX + ' 次），请到胖乖生活里看一下账单')); return; }
          setTimeout(tick, 1000);
        }).catch(e => {
          if (n >= MAX) { reject(e); return; }
          setTimeout(tick, 1200);
        });
      };
      tick();
    });
  }

  /** 官方 h5 有远程停止接口（goods/endWater），见文件头。 */
  function canStop() { return true; }

  function stop(goodsId) {
    return endWater(goodsId);
  }

  /* ---------------- 放水守护（v1.1.60 诚实版） ----------------
   *
   * 云端实锤（8 chunk + sourcemap / 522 源文件）：放水途中用户侧 HTTP 只轮询
   * status，amount 全程为 0、只在结算后出现；真实 flow 走设备 BLE/2G 私有
   * 加密通道且只在结束时上报一次，用户侧 hook 不到；goods/endWater 等接口
   * 全无 volume/quota/ml 入参。所以「按 N ml 精确自停」在 WebView+HTTP 桥
   * 下不成立，计时换算（流速不固定）也不成立。
   *
   * 这里只保留两件真东西：
   *   ① 轮询状态 + 结算 amount 原样回传（绝不换算成毫升）；
   *   ② 可选「最长放水」超时兜底，到点发一次 endWater —— 防的是忘关，
   *      与水量无关。guardSec=0 时完全不自动停，只靠手动点「停止」。
   */
  function watchVolume(skuId, guardSec, hooks) {
    const h = hooks || {};
    const secs = Math.max(0, parseInt(guardSec, 10) || 0);
    /* 防忘关超时（毫秒）。离线行为测试可用 h.guardMs 快进注入。 */
    const guardMs = h.guardMs != null ? h.guardMs : (secs > 0 ? secs * 1000 : 0);
    /* 上限：按 0.8 秒一次算，900 次 ≈ 12 分钟，防「人走开了还在流」时空转。 */
    const MAX = 900;
    const GAP = h.gap || 800;
    const FIRST_GAP = h.firstGap || 600;
    const SETTLE_GAP = 5000;
    const settleGap = h.settleGap || SETTLE_GAP;
    const ZERO_WARN_AT = h.zeroWarnAt || 25;
    let n = 0;
    let stopSent = false;
    let zeroWarned = false;
    let settleUntil = 0;
    let lastAmount = 0;
    let startedAt = 0;      // 计时起点：见到「正在出水」的时间戳
    let stopAt = 0;         // 发出停止命令的时间戳

    /* 起表（幂等）。三种来源谁先来算谁：
     *   ① 平台报 status===2（正在出水）；② 平台报 amount>0；
     *   ③ 用户在界面点「我已按下出水键」。 */
    function startClock() { if (!startedAt) startedAt = Date.now(); }
    if (h) h.startTimer = startClock;

    return new Promise((resolve) => {
      function finish(s, tries, pending) {
        resolve({ done: !pending, status: s.status, amount: s.amount, tries: tries,
                  stoppedByUs: stopSent, elapsedMs: startedAt ? (Date.now() - startedAt) : 0 });
      }
      /* 发一次停止，并继续轮询等结算。byWhat 只用于界面文案。 */
      function fireStop(s, byWhat) {
        stopSent = true;
        stopAt = Date.now();
        settleUntil = stopAt + settleGap;
        if (h.onReached) h.onReached(s, byWhat);
        endWaterTarget(skuId, h.machineId).then(() => {
          if (n < MAX) setTimeout(tick, GAP);
          else finish(s, n, true);
        }).catch(e => {
          if (h.onStopError) h.onStopError(e);
          resolve({ done: false, stopError: e, amount: s.amount, tries: n, stoppedByUs: false });
        });
      }
      function tick() {
        n++;
        syncWater(skuId).then(s => {
          /* 用量只涨不跌；平台偶尔回旧的 0，不要让它把结算值打回去。 */
          if (s.amount > lastAmount) lastAmount = s.amount;
          s.amount = lastAmount;

          if (s.status === 2 || s.amount > 0) startClock();
          const elapsedMs = startedAt ? (Date.now() - startedAt) : 0;
          const guardLeftMs = guardMs > 0 ? Math.max(0, guardMs - elapsedMs) : 0;
          if (h.onTick) h.onTick(n, s, elapsedMs, guardMs, guardLeftMs);

          if (!zeroWarned && elapsedMs === 0 && s.amount === 0
              && n >= ZERO_WARN_AT && !stopSent) {
            zeroWarned = true;
            if (h.onZero) h.onZero();
          }

          /* 机器已停（3/5 完成、6 故障）。发过停止且还在观察窗内时继续盯，
           * 把停阀后才结算出来的最终 amount 取回来再收工。 */
          const finished = (s.status === 3 || s.status === 5);
          const settlePending = stopSent && settleUntil && Date.now() < settleUntil;

          if (finished && !settlePending) { finish(s, n); return; }
          if (s.status === 6 && !settlePending) {
            resolve({ done: true, failed: true, status: 6, amount: s.amount, tries: n });
            return;
          }
          if (stopSent && settleUntil && !settlePending) { finish(s, n); return; }

          /* v1.1.60 唯一自动停止：防忘关超时兜底，与水量无关。 */
          if (!stopSent && startedAt && guardMs > 0 && elapsedMs >= guardMs) {
            fireStop(s, '防忘关超时');
            return;
          }

          if (n >= MAX) { finish(s, n, true); return; }
          setTimeout(tick, GAP);
        }).catch(e => {
          /* 单次网络抖动继续等；连续到上限才放弃。 */
          if (n >= MAX) { resolve({ done: false, netError: e, tries: n, stoppedByUs: stopSent }); return; }
          setTimeout(tick, 1500);
        });
      }
      setTimeout(tick, FIRST_GAP);
    });
  }

  /** 放水守护用的停止：官方 endWater 只要 goodsId；没有就如实失败。 */
  function endWaterTarget(skuId, goodsId) {
    if (goodsId) return endWater(goodsId);
    return Promise.reject(new Error('缺少机器编号，没法发送停止命令，请重新绑定这台机器'));
  }

  /* ---------------- 错误翻译 ---------------- */

  /** 把接口的业务码翻成人话。码表来自官方前端与实测 */
  const CODE_MSG = {
    '-99': '登录过期了，请重新登录胖乖生活账号',
    '-21': '这台机器没有开放远程控制权限',
    '-88': '还没有签约代扣，请先去慧生活798里签约',
    '-87': '代扣已过期，请去慧生活798里重新签约',
    '-52': '余额不足，请先去慧生活798充值',
    '-20': '还没绑定一卡通',
    '-19': '机器正在准备，稍等一下再试',
    '-82': '需要先支付才能使用',
    '-1': '饮水机平台拒绝了这次请求（code=-1）。先点「重新绑定」核对机器码；若仍失败，请把下面的接口和错误码发给开发者',
    '2': '登录过期了，请重新登录',
    '5134': '账号被限流了，过一会儿再试',
    '4000': '这台机器还没被商家绑定，暂时不能用',
  };

  function human(e) {
    if (!e) return '未知错误';
    const m = String((e && e.message) || e);
    const endpoint = e.endpoint ? ('\n接口：' + e.endpoint) : '';
    const detail = e.code != null ? ('（code=' + e.code + (e.msg && e.msg !== m ? '，' + e.msg : '') + '）') : '';
    if (e && e.code != null && CODE_MSG[String(e.code)]) return CODE_MSG[String(e.code)] + detail + endpoint;
    if (/timeout|timed out|SocketTimeout/i.test(m)) return '网络超时，学校网络可能不稳定，重试一次' + endpoint;
    if (/Unable to resolve host|UnknownHost/i.test(m)) return '解析不了服务器地址，检查网络';
    if (/参数不正确/.test(m)) return '接口参数不被接受（可能是平台改版了，请联系开发者）';
    if (/没有出水口|还没有出水口/.test(m)) return m;
    return m + detail + endpoint;
  }

  /* ---------------- 二维码解码（兜底） ---------------- */

  /**
   * 解一张图里的二维码（前端兜底）。
   *
   * 主路是 Java 侧 ZXing 直接解原图（QrDecoder.java：亮度裁屏幕 + 箱式降采样
   * + 多宽度扫描），这条路只在 Java 解不出来时才走，而且拿到的已经是压过的
   * 1000px JPEG —— 所以这里能做的只有「多试几个尺度」，没有别的信息可用。
   */
  function decodeQr(dataUrl) {
    return new Promise((resolve, reject) => {
      if (typeof jsQR !== 'function') { reject(new Error('二维码库未加载')); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const iw = img.naturalWidth || img.width;
          const ih = img.naturalHeight || img.height;
          if (!iw || !ih) { reject(new Error('图片读不出来')); return; }

          // 尺度从大到小：原尺寸、0.75、0.5，外加各自的正中心 60% 裁切
          const scales = [1, 0.75, 0.5];
          for (let i = 0; i < scales.length; i++) {
            const k = scales[i];
            const w = Math.max(1, Math.round(iw * k));
            const h = Math.max(1, Math.round(ih * k));
            const hit = tryDecode(img, 0, 0, iw, ih, w, h);
            if (hit) { resolve(hit); return; }
            if (k === 1) {
              const cw = Math.round(w * 0.6), ch = Math.round(h * 0.6);
              const hit2 = tryDecode(img, Math.round((iw - cw) / 2), Math.round((ih - ch) / 2),
                cw, ch, cw, ch);
              if (hit2) { resolve(hit2); return; }
            }
          }
          reject(new Error('没识别到二维码。建议用「用相机扫二维码」直接对准机器扫'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('图片读不出来'));
      img.src = dataUrl;
    });
  }

  /** 从 img 上裁一块 (sx,sy,sw,sh) 画到 (tw,th) 的画布上解一次 */
  function tryDecode(img, sx, sy, sw, sh, tw, th) {
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
    const px = ctx.getImageData(0, 0, tw, th);
    const r = jsQR(px.data, tw, th, { inversionAttempts: 'attemptBoth' });
    return r && r.data ? r.data : null;
  }

  return {
    sendCode, login, logout, logged,
    loadDevs, saveDevs, parseSn, parseMachineId, fetchMachine, fetchSkus,
    bind, refreshDev, unbind, findDev,
    /* v1.1.16：unlockWithRebind 是界面该用的那个（自动重绑重试）；
     * unlock 保留给测试与「不想自动重试」的场合。 */
    unlock, unlockWithRebind,
    endWater, syncWater, waitDone, watchVolume, stop, canStop,
    /* createOrder 保留但**界面不再调用**（结算已整块移除，见文件头）。
     * 留着是因为它是这条协议唯一的可执行记录，删了以后想恢复就得重挖源码。 */
    createOrder,
    guardSec, setGuardSec, clearLegacyMode,
    human, decodeQr,
    K_TOKEN, K_PHONE, K_DEVS, K_MODE, K_GUARD, PAY_PAGE,
  };
})();

/* ================================================================
 *  空教室
 * ================================================================ */

const FREE = (() => {

  /** 课表里出现过的所有教室（去重、去空） */
  function allRooms() {
    const set = {};
    (DATA.courses || []).forEach(c => {
      const r = String(c.room || '').trim();
      if (!r || r === '未安排') return;
      set[r] = 1;
    });
    return Object.keys(set).sort((a, b) => a.localeCompare(b, 'zh'));
  }

  /**
   * 指定周次 + 星期 + 节次下，哪些教室被占用。
   *
   * day 的三态：
   *   1..7  —— 只看这一天（正常用法）
   *   0     —— 整周任意一天（保守口径：只要本周任一天这个时段有课就算占用）
   *   null  —— 同 0
   * 为什么必须带 day：学生问「空教室」问的是「周三下午哪间空」，
   * 只按节次不按天，会把周一上午的课算成周三上午也被占。
   */
  function busyRooms(week, p1, p2, day) {
    const busy = {};
    const wantDay = day == null ? 0 : Number(day);
    (DATA.courses || []).forEach(c => {
      if (!c.weeks || c.weeks.indexOf(week) < 0) return;
      if (wantDay && Number(c.day) !== wantDay) return;
      const ps = c.periods || [];
      const hit = ps.some(p => p >= p1 && p <= p2);
      if (!hit) return;
      const r = String(c.room || '').trim();
      if (!r || r === '未安排') return;
      (busy[r] = busy[r] || []).push({
        name: c.name, teacher: c.teacher, day: Number(c.day),
        start: Math.min.apply(null, ps), end: Math.max.apply(null, ps),
      });
    });
    return busy;
  }

  /** 返回 { free:[{room}], busy:[{room,courses}], scope:{week,day,p1,p2,rooms} } */
  function compute(week, p1, p2, day) {
    const rooms = allRooms();
    const busy = busyRooms(week, p1, p2, day);
    const free = [], used = [];
    rooms.forEach(r => {
      if (busy[r]) used.push({ room: r, courses: busy[r] });
      else free.push({ room: r });
    });
    return {
      free: free, busy: used,
      scope: { week: week, day: day, p1: p1, p2: p2, rooms: rooms.length },
    };
  }

  return { allRooms, busyRooms, compute };
})();
