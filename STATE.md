# 河医大助手 · 当前状态（STATE）

> 自动生成，**别手改**。重新生成：`python tools/state.py`。
> 生成时间：2026-11-06 19:47
> 接手一个会话时只读这一页；架构与踩坑细节见 [HANDOFF.md](HANDOFF.md)，
> 历史每一版改了什么见 [docs/handoff/changelog.md](docs/handoff/changelog.md)，
> 待办见 [docs/handoff/todo.md](docs/handoff/todo.md)。

## 1. 代码版本（读自磁盘）

| 位置 | 值 |
|---|---|
| AndroidManifest versionName | **1.1.43** |
| AndroidManifest versionCode | **1143** |
| web/about.js APP_VERSION | 1.1.43 |
| web/index.html #aboutVer | 1.1.43 |

## 2. 本地最新的包

| 项 | 值 |
|---|---|
| 文件 | `apk/xxmu-helper-v1.1.43.apk` |
| 大小 | 661744 字节 |
| SHA-256 | `3ccccfed3591249d53f6827da077f89d1b30473da2545a4b878fff2ed21fb230` |
| 出包时间 | 2026-11-06 19:42 |
| 包内版本（aapt2） | 1.1.43 / 1143 |

注意：**多个版本常常字节数相同**（v1.1.16 与 v1.1.17 都是 558650），
只能靠 SHA-256 和包内符号区分，别用大小认版本。

## 3. 线上现在发的是哪一版

探测入口：`https://xxmu-auth.pages.dev`（另一个是 `https://www.xxmuhelper.top`）

| 字段 | 值 |
|---|---|
| latest.version | **1.1.38** |
| latest.code | 1138 |
| latest.size | 612205 |
| latest.sha256 | `c8540b667a62bdc4` |
| latest.url | https://www.xxmuhelper.top/v1/apk |
| apk.name（blob 里实际的包） | xxmu-helper-v1.1.38.apk |
| min.code（强制淘汰线） | 0 |
| enforceVer | True |
| updPolicy | nag |
| qq | 1097668324 |
| maxDev | 3 |

> 线上 latest 与本地最新的包**不是同一个**（sha 不同）。

> 本地已到 **1.1.43**，线上还是 **1.1.38** —— 新版本**还没发**。
> （用户说「继续写」不等于授权发布；只有说「上线/发版/发布」才切 latest。）

## 4. 仓库位置

| 项 | 值 |
|---|---|
| 分支 | main @ `ab03937` |
| origin/main | `2f06dac` |
| 领先远程 | 10 个提交 |
| 未提交改动 | 0 个文件 |

最近提交：

```
ab03937 feat(icon): v1.1.43 应用图标换成 F 号夜空河字 + 五件套逐像素校验
3711d2d docs: 提交后重新生成 STATE（本地 1.1.42 / 线上 1.1.38）
732d8ee fix(tutorial): v1.1.42 修横排漏字 + 内容追上功能 + 发版教程契约硬卡口
31956ac docs: 提交后重新生成 STATE（本地 1.1.41 / 线上 1.1.38）
492a041 feat(reminder): v1.1.41 课程提醒三档（响铃/静默/短信草稿）+ 试一下预览
e5b1a3e docs: 提交后重新生成 STATE（本地 1.1.40 / 线上 1.1.38）
```

## 5. 常用命令（复制即用）

```powershell
$env:Path += ';C:\Program Files\Git\cmd;C:\Program Files\nodejs'   # git / node 都不在默认 PATH

node tools/check_web.js                 # 静态体检（版本三处一致 / assets 同步 / 各版锚点）
node tools/test_mytodo.js               # 以及 tools/test_*.js 全套离线测试
python tools/build_apk.py               # 出包（自动同步 assets + 自动送到桌面 xxmuhelper\）
python tools/deliver.py                 # 单独把最新包和本文件送到 桌面\xxmuhelper\（逐字节校验）
python tools/verify_apk.py              # 出包后五件套校验
python tools/bump_ver.py 1.1.22 1122    # 版本号三处同改
python tools/publish_apk.py --no-publish  # 只上传不通知（默认就该用这个）
python tools/publish_apk.py             # 真发布：切 cfg.latest，学生一开就弹更新
python tools/state.py                   # 重新生成本文件
```

**交付落点只有一处**：`C:\Users\Administrator\Desktop\xxmuhelper`。
注：`D:\dsh\DSH Desktop` 是 DSH 的工作目录，名字带 Desktop 但它**不是桌面**；
资源管理器里的桌面是 `C:\Users\<用户>\Desktop`。以前两个「桌面」都放过，
用户的原话是「我咋没看见出包在哪」—— 所以现在只有一处，由 `deliver.py` 送并校验。

工具清单与每套测试覆盖什么，见 HANDOFF.md 第 7 节与「离线测试一览」。

## 6. 未完待办


### 一、等用户的
- [ ] **备份签名密钥** `android/xxmu.jks`（pass `xxmu123`）到网盘/邮箱。

### 二、等真机（没有设备，一律不能声称已验证）
- [ ] **青果登录页 `input#username` 在真机 WebView 的 `onPageFinished` 时序下能否稳定读到**。
- [ ] **学号不一致时拦课表同步的提示是否清楚**（v1.1.2 那次判据错把人永久锁死过）。
- [ ] **v1.1.16 饮水机四条（最要紧）**…
- [ ] **v1.1.15 三条**：明文白名单下教务/学习通/胖乖生活三个内嵌页是否都正常…
- [ ] **v1.1.22「我的待办」在真机上的手感**：勾选圈点得准不准、日期选择器在…
- [ ] **v1.1.35 课程提醒真的会弹吗（优先级最高，v1.1.27~v1.1.34 一直是死的）**…
- [ ] **v1.1.26 专注计时在真机上的三件事**：①切后台/锁屏 10 分钟后回来…
- [ ] **v1.1.28 停车场机制的手感**：学习页头部三个小按钮（待办 / 番茄钟 / 刷新）…
- [ ] **v1.1.30~v1.1.37 宿舍空调八条**：①自己的学号能否查到绑定房间…
- [ ] **v1.1.38 教务登录页缩放在真机上的观感**：手机点「登录教务」，表单是否完整可见…
- [ ] **v1.1.39 深色模式五条（优先级最高，本机无设备一律不能声称已验证）**…
- [ ] **v1.1.40 独立设置页四条（真机）**：①「我的」点设置能否进二级页…
- [ ] **v1.1.41 课程提醒三档五条（真机）**：①学习页 → 课程提醒 → 设置…
- [ ] **v1.1.42 教程排版四条（真机）**：①重看「我的 → 使用教程」，逐页翻到第 5 页…

### 三、可以做（纯本地，不需要任何外部条件）
- [ ] **各版本 UI 在矮视口下的复查**：用 492×700 这类尺寸逐页过一遍…
- [ ] **`app.js` 已 4700+ 行**。若要长期维护可以按页面拆，但**保持无构建链**更稳…
