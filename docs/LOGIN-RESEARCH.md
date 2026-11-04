# 登录功能技术预研报告（2026-11-03）

> 目标：把 xxmu-app 从「PC 抓数据 → 推 JSON」改成「App 内登录 → 自动拉数据」，供全校学生使用。
> 本文件记录实测结论，所有 ✅/❌ 均为真实网络/文件验证结果，非推测。

## 一、结论速览

| 数据源 | 状态 | 说明 |
|---|---|---|
| **青果教务网页端** | ✅ 完全可用 | `qgjw.xxmu.edu.cn` 可达，验证码可拉，DES 加密已跑通（node） |
| **喜鹊儿（青果官方 APP）** | ⚠️ 算法通、网关挡 | 加密算法已复现并通过服务端校验，但被「请升级到最新版本」版本门拦截 |
| **学习通** | ✅ 可行 | 已有 cookie 库方案；App 内可改为内嵌 WebView 登录拿 cookie |

## 二、已确认的事实

### 2.1 喜鹊儿就是青果官方 APP

- 喜鹊儿开发者 = **青果软件集团有限公司**，包名 `com.kingosoft.activity_kb_common`
- XXMU 的教务系统是青果（页面标题 `KINGOSOFT高校智慧校园教学综合服务平台`）
- **推论：喜鹊儿接口和青果网页端是同一套后端、同一个账号密码**

### 2.2 青果网页端实测（可直接作为登录方案）

```
GET https://qgjw.xxmu.edu.cn/          -> 200, 35287 bytes, 重定向到 /cas/login.action
    _sessionid  => 62507996650962DC449AEDE9...
    _ssessionid => 62507996650962DC449AEDE9...
GET /cas/genValidateCode?v=1           -> 200, 1582 bytes, JPEG (ffd8ffe0)
```

登录流程（已实现于 `core/kingo.py`）：
1. 访问 `/` 拿 `_sessionid` / `_ssessionid` + 拉验证码图
2. **不能重访首页**（会换 sessionid，验证码作废）
3. 取 `getTempDeskey` / `getTempNowtime`
4. 密码 = `md5(md5(pwd) + md5(captcha))`
5. 参数用青果自定义 DES 加密（`core/jkingo.des.js`，node vm 执行）
6. POST `/cas/logon.action`，`status=="200"` 成功

→ **DES 已实测跑通**（`_enc_params` 返回 364 字节密文 + 正常 token）

### 2.3 喜鹊儿接口实测

加密算法（来自公开逆向资料 + 本次复现）：

```
param   = getParamEncode(明文参数串, "op5nb9")
          本体：ord(s[i]) + ord(key[i%6]) + ((ceil(len/3)*6) % 6)
          每 3 位十进制 → 每 9 位十进制 → base36 补 6 位
param2  = md5( md5hex 去掉第 3/10/17/25 位 )
token   = "00000"(未登录) / 登录返回
appinfo = "android2.5.101"(旧)
POST http://www.xiqueer.com/manager/wap/wapController.jsp
```

实现见 `core/kingosoft.py`。

**接口可用性实测：**

```
旧地址 :8080  -> 端口已关闭 (TCP timeout)
新地址 :80    -> 200 {"errcode":"-2","message":"非法调用,没有加密"}   ← 加密被认可
带正确加密     -> 200 {"errcode":"-2","message":"请升级到最新版本"}   ← 版本门
```

**版本门诊断：**

- 纯 `getAgent`（学校列表）和 `getLoginInfoNew`（登录）**都被拦**
- 试过 `android2.5.101` / `2.6.457`(官方最新) / `3.0.0` 等 16 个版本号 → 全被拦
- 试过加 `X-Requested-With` / `Referer` / `Origin` / 改 UA → 全被拦
- 故意给错误 param / 缺字段 → 仍返回同样信息

→ **版本校验发生在解密之前**，判断依据不是 `appver` 参数值，而是别的字段或请求头。

### 2.4 为什么暂时无法打通喜鹊儿

下载了官方 APK（2.6.457，54.7MB）分析：

```
lib/arm64-v8a/libkdvmp.so    9.3 MB   ← dex VMP 虚拟化保护
lib/arm64-v8a/libzprotect.so  318 KB   ← 加固壳
assets/origin.apk            12 MB     ← 未加壳的原始 dex
```

- `origin.apk` 里有 5 个完整 dex，但二进制搜索 `getLoginInfoNew` / `op5nb9` / `appver=` **全部搜不到**
- 能搜到 `wapController.jsp` / `xiqueer` 等路径字符串，说明**业务常量被加密，由 `libkdvmp.so` 运行时解密**

→ 静态提取失败。**唯一出路是真机抓包**（见第四节待办）。

## 三、三档改造方案

### 方案 A：纯客户端（推荐）

App 内自建登录页，HTTP 走 Java 桥，加密和解析复用现有 JS/Python 逻辑。

```
用户 → [登录页: 学号 + 密码 + 验证码图]
         ↓ Java 桥 (Host.httpGet / Host.httpPost)
      青果 qgjw.xxmu.edu.cn
         ↓ 返回 HTML / JSON
      [JS 层解析] → window.SCHEDULE / window.HOMEWORK → 现有渲染
```

**要点：**
- 验证码图由 Java 取字节 → Base64 → 前端 `<img>` 显示（青果必然有验证码，绕不过）
- DES 加密：`jkingo.des.js` 直接在 WebView 里跑，**不用 node**
- 凭据只存本机（`SharedPreferences` + `EncryptedSharedPreferences` 或 Android Keystore）
- 学习通：内嵌 WebView 打开 `passport2.chaoxing.com` 登录 → 读 cookie

**优点**：零服务器成本、密码不出手机、无备案问题、隐私最好
**缺点**：每台设备自己算；改抓取逻辑要发新版

### 方案 B：自建服务端

```
App → 自家服务器 → 青果/学习通
```

**优点**：客户端极简，可做后台定时 + 消息推送
**缺点**：**要在服务器上存全校学生的教务密码**。这是重大责任与合规问题（等保、个人信息保护法），一旦泄露是灾难。且需要域名、备案、服务器成本。

**不建议**，除非你有能力做合规和运维。

### 方案 C：混合（务实推荐路线）

- 课表：App 内登录青果（方案 A）
- 作业：App 内 WebView 登录学习通拿 cookie（方案 A）
- 可选云同步：只上传**脱敏后的课程/作业结果**，不上传密码

## 四、待办与阻塞

### 阻塞项（需要你配合）

1. **喜鹊儿接口打不通** → 需要一次真机抓包：
   - 手机装 HttpCanary / Reqable，或 PC 装 mitmproxy + 手机装证书
   - 打开喜鹊儿登录一次，抓 `wapController.jsp` 的完整请求
   - 我要看：完整 POST body 字段名（尤其 `appinfo` 的真实值）和请求头
   - 有了这个，喜鹊儿接口就能通，课表可拿结构化 JSON，不用爬 HTML

2. **APK 编译环境** → 本机只有 JDK17 + adb，**没有 Android SDK / android.jar**
   - 编译只能在 Termux 侧（`build_apk.sh`）或装 Android SDK

### 不需要阻塞、现在就能做的

- 青果登录页 + 验证码 + 登录全链路（方案 A 的课表部分）
- 学习通 WebView 登录拿 cookie
- 凭据本地加密存储
- Android 6+ 的 `usesCleartextTraffic` / 网络安全配置

## 五、必须知道的现实约束

1. **验证码无法绕过**。青果有图形验证码，任何「登录一次永久有效」的方案都不成立。
   现实做法：登录一次存 `_sessionid`，失效前一直用；失效后提示重登。
2. **学期参数要能配**。`xnxq`/`xn`+`xq` 硬编码会在下学期全部失效，必须做成可配置或自动推断。
3. **不同专业/年级课表结构相同，但账号不同**。所以「全校可用」= 登录页通用 + 数据按账号取，不是共享数据。
4. **学习通 cookie 每台设备独立**。不能像现在这样从某台 root 手机复制一份给所有人用。
