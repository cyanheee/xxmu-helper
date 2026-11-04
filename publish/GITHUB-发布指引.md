# 把项目发布到 GitHub —— 操作指引

> 仓库已经在本地初始化并提交完成（`git log` 能看到 `初始提交：河医大助手 v1.1.17`）。
> 下面五步做完，它就在 GitHub 上了。全程不需要我这边，你自己点几下就行。

---

## 一、先想清楚：这次公开的是什么

这个仓库我按你「怕被盗用」的诉求配置成了：

| 内容 | 是否公开 | 原因 |
|---|---|---|
| 源码（web/、android/、core/、server/、tools/） | ✅ 公开 | 这是「证明我写的」的核心证据 |
| 软著申请材料（publish/srcreg/） | ✅ 公开 | 顺手也是权属证明 |
| 签名密钥 `xxmu.jks` | ❌ 排除 | 丢了没法证明后续版本是你发的 |
| `server/DEPLOY-OUT.txt`（含 ADMIN_KEY） | ❌ 排除 | 泄露等于别人能改你的服务端 |
| `build_html*/`、`build_scan/`（真实学生页面快照） | ❌ 排除 | 里面有真实学号和作业 |
| `apk/` 里 50 多个历史包 | ❌ 排除 | 16 MB，且可从 tag 重建 |
| `android/assets/`（web 的构建副本） | ❌ 排除 | 构建产物，改它没用 |

**授权用的是 AGPL-3.0**：别人可以看、学、改、自己部署，但**改了拿去做网络服务必须同样开源**。这是「不完全锁死、但也不送人闭源商用」的折中。

如果你想更保守（连源码都不给），告诉我，我改成「只放 README + Releases」的形态。

---

## 二、五步操作

### 第 1 步：建 GitHub 账号（如果还没有）

<https://github.com/signup> —— 用 `572833261@qq.com` 注册即可。

建议用户名申请成 `gugu-xxmu` 或类似的，别用纯数字。

### 第 2 步：建一个空仓库

1. 右上角 **+** → **New repository**
2. 填写：

| 字段 | 填什么 |
|---|---|
| Repository name | `xxmu-helper` |
| Description | `河南医药大学学生自建的校园教务辅助工具 · 课表/作业/空教室/饮水机` |
| 可见性 | **Public**（公开才有时间证据的意义） |
| Initialize with README | **不勾**（我们已经有了） |
| .gitignore / license | **都不选**（我们已有） |

3. 点 **Create repository**

建完后页面会显示一串命令，**别照抄**，用下面的。

### 第 3 步：在项目目录里执行推送

打开 PowerShell，逐行执行：

```powershell
# Git 不在 PATH 里时先加一次（装完 Git 后新开窗口通常就有了）
$env:Path += ';C:\Program Files\Git\cmd'

cd "D:\dsh\DSH Desktop\xxmu-app"

# 把 <你的用户名> 换成你的 GitHub 用户名
git remote add origin https://github.com/<你的用户名>/xxmu-helper.git

git branch -M main
git push -u origin main
```

推送时会弹窗要你登录。**推荐用浏览器授权**：会弹出 GitHub 登录页，点授权即可，不用手动造 Token。

如果它问密码，输入的是 **Personal Access Token**（不是 GitHub 密码）：
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
→ Generate new token → 勾 `repo` → 生成后立刻复制（只显示一次）。

### 第 4 步：确认推上去的东西是对的

打开 `https://github.com/<你的用户名>/xxmu-helper`，检查三件事：

- [ ] 能看到 README，中文正常显示
- [ ] 文件树里**没有** `android/xxmu.jks`、`server/DEPLOY-OUT.txt`、`build_html`
- [ ] 右上角显示 commit 时间（这就是你要的「时间证据」）

### 第 5 步：打一个 Release 放安装包

GitHub 仓库页 → 右侧 **Releases** → **Draft a new release**

| 字段 | 填什么 |
|---|---|
| Tag | `v1.1.17` |
| Title | `v1.1.17 —— 换自有域名 + 官网` |
| 附件 | 上传 `apk/xxmu-helper-v1.1.17.apk` |
| 说明 | 复制 `apk/v1.1.17.notes.txt` 的内容 |

点 **Publish release**。

这样学生可以从 GitHub 下载安装包，同时每个版本都有公开的时间记录。

---

## 三、以后每次发版怎么做

```powershell
$env:Path += ';C:\Program Files\Git\cmd'
cd "D:\dsh\DSH Desktop\xxmu-app"

# 1. 先扫一遍，确认没带进敏感文件
python -X utf8 tools\scan_secrets.py

# 2. 改了什么就提交什么
git add -A
git commit -m "v1.1.18: 说明这次改了什么"

# 3. 推上去
git push
```

**每次提交前必须跑 `scan_secrets.py`。** 它拦三类东西：签名密钥/部署输出这类文件、
`cfut_` 开头的令牌形态、以及真实学号手机号。三条全绿再提交。

---

## 四、如果已经不小心推了敏感文件怎么办

先别慌，按这个顺序：

1. **立刻吊销**那个凭据（Cloudflare Token 去控制台 Roll、ADMIN_KEY 重新生成）
2. 再处理 Git 历史：`git filter-repo --path <文件> --invert-paths`
3. 强制推送：`git push --force`
4. 通知 GitHub 清除缓存（否则旧的 commit 仍能通过 API 访问）

**这就是为什么要在第一次提交前就挡住** —— 一旦推上去，历史里的东西删不干净，
别人 clone 过就扩散了。所以我们这次是先在本地把 `.gitignore` 配好、扫干净才提交的。

---

## 五、关于「证明这是我做的」

GitHub 能给你的是：

1. **commit 时间戳** —— 公开可查，平台记录，改不了
2. **仓库创建时间** —— 同上
3. **Release 发布时间** —— 每个版本的公开记录

这三样加软著证书，构成完整的时间证据链：

```
代码什么时候写的  → Git commit 历史
什么时候登记的    → 软著证书（官方）
包是谁发的       → APK 签名证书指纹（0e684845…57799）
```

**签名证书千万别丢。** 它在 `android/xxmu.jks`，现在已经不在仓库里了，
请单独备份到网盘或邮箱。丢了的话，你以后发的包没法证明和之前的包是同一个开发者发的。

---

## 六、如果不想公开源码

告诉我，我把它改成另一种形态：

- 仓库只放 `README.md` + 截图 + `Releases` 里的安装包
- 源码不上传，但本地保留 Git 历史（仍有时间证据，只是不公开）

这样既留了公开记录，又不把实现送出去。取舍是：**别人无法验证你真的写了这些代码**，
软著证书就成为唯一的权属证明。
