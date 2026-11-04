# 联网授权与版本服务 · 部署手册

v0.8.0 起，`河医大助手` 的授权不再只靠 APK 里的密钥，而是多了一层服务端：
**码**证明「这个学号该有资格」，**服务器上的开卡记录**才是真正的开关。
这样才能做到真正的踢人——停用之后，对方下次联网就进不去。

同时版本提示也走同一个服务，所以**改提示文案、换下载链接不用重新发版**。

---

## 一、这套东西由什么组成

```
server/worker.js        Cloudflare Worker（一个文件，零依赖）
  ├─ GET  /v1/config                     版本信息（公开）
  ├─ POST /v1/activate                   激活换票据
  ├─ POST /v1/check                      联网复检 + 续期
  └─ /v1/admin/{grant,revoke,ungrant,list,config,code}   带 X-Admin-Key
web/auth.js             客户端（已经在 App 里了，只需改 BASE）
```

存储用 Workers KV，三个键前缀：

| 键 | 内容 | 用途 |
|---|---|---|
| `lic:<学号>` | `{at, note}` | 已开卡。**没有这条就激活不了** |
| `rev:<学号>` | `"1"` | 已停用。有这条就直接拒绝 |
| `cfg` | JSON | 版本配置 |

---

## 二、部署（约 10 分钟，全部免费额度内）

有两条路。**先试 A（一条命令）**，不行再走 B（手动四步）。两条路结果完全一样。

---

### A. 一键脚本（推荐）

前提：你已经在 Cloudflare 注册好账号。

**第 1 步：拿 API 令牌**

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点 **Create Token**
3. 选最下面的 **Create Custom Token**（别选模板，模板权限不够建 KV）
4. Name 随便填 `xxmu-deploy`
5. Permissions 加三条：
   - `Account` → `Workers Scripts` → **Edit**
   - `Account` → `Workers KV Storage` → **Edit**
   - `Account` → `Account Settings` → **Read**
6. Account Resources 选你自己的账号
7. Continue → Create Token → **把那串令牌复制下来**（只显示一次）

**第 2 步：拿 Account ID**

打开 https://dash.cloudflare.com → 随便点进一个域名（或右侧栏）→ 右下角有 **Account ID**，一串 32 位十六进制。没有域名的话，打开 Workers & Pages 页面，右侧栏也能看到。

**第 3 步：跑脚本**

```powershell
cd "D:\dsh\DSH Desktop\xxmu-app"
powershell -ExecutionPolicy Bypass -File tools\deploy_server.ps1 -Token "粘贴令牌" -AccountId "粘贴AccountID"
```

脚本会依次：验证令牌 → 建 KV 命名空间 AUTH → 把 id 写进 wrangler.toml → 写三个密钥（SECRET 自动用代码里那个正确值）→ deploy → 把服务地址和 ADMIN_KEY 打进 `server/DEPLOY-OUT.txt`。

**跑完后照抄 `DEPLOY-OUT.txt` 里的两行**：
- `服务地址：https://xxmu-auth.xxxx.workers.dev`
- `ADMIN_KEY：xxxxx`（App 管理后台要用它登录，丢了只能重跑 `secret put ADMIN_KEY`）

---

### B. 手动部署

#### 1. 装 wrangler

```powershell
npm i -g wrangler
wrangler login
```

浏览器会弹出 Cloudflare 授权页，点 Allow。

> **如果 `wrangler login` 卡住不返回**（本机实测过：浏览器打开了但回调到 `localhost:8976` 失败，最后报 `Timed out waiting for authorization code`），别纠缠，直接用令牌登录：
>
> ```powershell
> $env:CLOUDFLARE_API_TOKEN = "你的令牌"
> $env:CLOUDFLARE_ACCOUNT_ID = "你的AccountID"
> ```
>
> 之后所有 wrangler 命令都会读这两个环境变量，不再需要 login。
>
> 另外 PowerShell 里如果 `npm` 报「禁止运行脚本」，把 `npm` 换成 `npm.cmd`。

### 2. 建 KV 命名空间

```powershell
cd server
wrangler kv namespace create AUTH
```

会输出一段形如：

```
[[kv_namespaces]]
binding = "AUTH"
id = "a1b2c3d4e5f6..."
```

### 3. 写 `server/wrangler.toml`

仓库里已经有一份填好的模板，只要把 `id` 换成上一步那串：

```toml
name = "xxmu-auth"
main = "worker.js"
compatibility_date = "2024-11-01"
workers_dev = true

[[kv_namespaces]]
binding = "AUTH"
id = "把上一步的 id 粘这里"
```

### 4. 配三个密钥

```powershell
# 算激活码用。必须与 web/license.js 里的 SECRET 一模一样，
# 否则已经发出去的老码全部作废。正确值就是这一串：
"XXMU-HELPER-GU-2026-v1" | wrangler secret put SECRET

# 签票据用。随便一串长随机，可以以后换（换了所有人重登一次）。
"换成48位随机十六进制" | wrangler secret put SIGN_KEY

# 管理员口令。App 后台开卡/踢人/改版本都靠它。
# 别用短密码，建议 30 位以上随机串。
"换成40位随机串" | wrangler secret put ADMIN_KEY
```

> **用管道方式喂值**（`"值" | wrangler secret put 名字`），不然 wrangler 会交互式提示，中文命令行里回车容易出问题。

生成随机串（PowerShell）：

```powershell
-join ((48..57)+(97..102) | Get-Random -Count 48 | % {[char]$_})   # SIGN_KEY
-join ((48..57)+(97..102) | Get-Random -Count 40 | % {[char]$_})   # ADMIN_KEY
```

### 5. 部署

```powershell
cd server
wrangler deploy
```

输出形如 `https://xxmu-auth.<你的子域>.workers.dev`。

### 6. 把地址写进 App

改 `web/auth.js` 第 20 行：

```js
const BASE = 'https://xxmu-auth.<你的子域>.workers.dev';
```

然后 `python tools/build_apk.py` 重新出包。

### 7. 自检

```powershell
curl https://xxmu-auth.<子域>.workers.dev/v1/config
# 期望：{"ok":true,"latest":{...},"min":{...},"notice":"","ts":...}

curl -X POST https://xxmu-auth.<子域>.workers.dev/v1/admin/grant \
  -H "x-admin-key: 你的ADMIN_KEY" -H "content-type: application/json" \
  -d '{"ids":["20261440105"]}'
# 期望：{"ok":true,"count":1,"rows":[{"id":"20261440105","code":"24DN-JFSG-7NKV-RNBT"}]}
```

`20261440105` 的码必须正好是 `24DN-JFSG-7NKV-RNBT`——**对不上说明 SECRET 抄错了**，
这时所有老码都会失效，别急着发版。

---

## 三、日常怎么用

### 开卡 + 发码

App →「我的」→「管理后台」→ 填管理员口令 → 保存口令并连接 → 填学号 → **开通并生成激活码**。

一次可以贴一批学号（换行、空格、逗号都行），结果三列式复制即可。

### 踢人

同一个输入框填学号 → **停用（立刻踢下线）**。

对方不会立刻掉线（他可能正在看课表），但下次联网复检时会被锁死回激活门。
客户端的复检时机：

- App 冷启动时
- 激活后首次
- 用户手动点「立即联网复核」
- 最短间隔 6 小时（避免每次开 App 都打服务器）

所以「立刻」的实际上限是 6 小时一次 + 冷启动。要更实时，把 `web/auth.js` 里的
`CHECK_GAP` 调小即可，代价是请求变多。

收回开卡（不拉黑）和停用的区别：收回后对方**下次激活不了**，但已激活的人
在复检时也会被拦（`not_granted`）。停用则是明确的「你被封了」，提示文案不同。

### 发新版时弹更新提示

App →「我的」→「管理后台」→ **版本与更新提示**：

- **最新版本号 / 最新版本代码**：填你刚出的包。版本代码就是 `AndroidManifest.xml`
  里的 `versionCode`，每次发版必须 +1。
- **下载链接**：APK 的直链（蓝奏云、GitHub Release、你自己的对象存储都行）。
- **更新说明**：换行分段，会原样显示在弹窗里。
- **最低可用版本代码**：填 0 = 不强制；填一个数 = 低于它的版本直接挡住，不给关闭。

保存后，所有联网用户下次打开 App（延迟 1.5 秒，不抢首屏）就会看到提示。
点「以后再说」的，同一个版本 24 小时内不再打扰。

> 强制升级要谨慎：它会让人**完全用不了**。只在后端接口不兼容旧版时才用。
> 填之前先想一遍——那些没网、没流量、暂时不想更新的同学会怎样。

---

## 四、这套方案的边界（务必知道）

### 能做到

- 没开卡的人激活不了（即使他有正确算法、自己算出了码）
- 已经激活的人可以被远程停用
- 改提示文案、换下载链接不用发新版

### 做不到

- **挡住专业逆向**。密钥 `SECRET` 在 APK 里（老码要继续有效就必须留着），
  会反编译的人能自己算码——但他算出来的码仍然要过服务器那关，
  所以真正拦住他的是「没开卡」，不是「算不出码」。
- **挡住改包**。有人把 `auth.js` 里的 `localValid()` 改成恒 true，就能绕过——
  但那需要真的会改包、重新签名、覆盖安装。要彻底防，得把关键逻辑挪到
  Java 层并加完整性校验，成本远大于收益（这软件不赚钱，防火墙够用就行）。
- **保证所有人都在线**。断网时按本地码放行，这是刻意留的口子：
  不能因为一次没网就把全校人挡在门外。

### 隐私

服务端只存三样东西：**学号、开卡时间、上次激活的设备型号**。
不存密码、不存课表、不存通讯录。设备指纹是「安装 ID + 型号」哈希后的 32 位串，
在本机生成，不上报任何硬件标识，用途只有「别人拷走票据也没用」。

---

## 五、成本

Cloudflare Workers 免费额度：**每天 10 万次请求**，KV 免费额度 10 万读/1000 写每天。

一次激活 = 1 次请求；一次复检 = 1 次请求。
按 2000 个用户、每人每天开 3 次 App 算，一天约 6000 次——离上限差得远。

> 如果学校有天把 workers.dev 域名墙了，就把 Worker 挂到自己的域名上
> （Custom Domain），只改 `auth.js` 的 `BASE` 一行。

---

## 六、故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 激活时提示「没有连上服务器」但本地能用 | 网络不通 / Workers 挂了 | 正常降级。恢复后自动补验 |
| 所有人都激活失败，提示「还没有开通」 | KV 里没有 `lic:` 记录 | 用后台批量开卡，或先开自己那张 |
| 老用户全部激活失败，提示「激活码不正确」 | `SECRET` 与 APK 里的不一致 | 用第二节第 4 步的命令取出正确值重配 |
| 后台提示「管理员口令不正确」401 | `ADMIN_KEY` 不一致 | 重新 `wrangler secret put ADMIN_KEY`，App 里重填 |
| 更新弹窗不出现 | `latest.code` 没大于当前 versionCode | 版本代码必须严格大于安装包的 versionCode |
| 强制升级把人全锁死了 | `min.code` 填太高 | 后台把它改回 0 即可立即解除（用户重开 App 生效） |
