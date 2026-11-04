# PC 端接入说明（新增，2026-11-03）

> 这份是 HANDOFF.md 的补充，只讲**从手机搬到电脑后改了什么、怎么跑**。
> 原始设计约定（数据模型、前端逻辑、6 个坑）见 HANDOFF.md，未改动。

## 1. 做了什么

把两个 Android 硬编码路径抽成 `core/paths.py`，并修掉 `sync.py` 的一个真 bug。

| 文件 | 改动 |
|---|---|
| `core/paths.py` | **新增**。集中解析 `COOKIE_DB` / `PUSH_DIR` / `PUSH` / `XN` / `XQ` / `TERM`，环境变量优先，Android 上仍走 `/sdcard` 老路径 |
| `core/chaoxing.py` | `COOKIE_DB` 改为从 `paths` 导入（原来是写死的 `/sdcard/Download/DSH-Go/cx_cookies.db`） |
| `core/sync_hw.py` | `EXTERNAL` 改为 `paths.PUSH_DIR`；**新增写 `android/assets/homework.js`**；`--no-push` 与 `XXMU_PUSH` 合流 |
| `core/sync.py` | 修 bug（见下）；会话中间文件从 `/tmp/st.pkl` 改成 `data/st.pkl`（Windows 无 /tmp）；`xn/xq/term` 走 `paths` |
| `core/kingo.py` | `_enc_params` 用 `_node_bin()` 找 node（`XXMU_NODE` > PATH > 常见安装路径）；`subprocess` 显式 `encoding="utf-8"`，避免 Windows GBK 解码炸 |
| `tools/sync_all.py` | **新增**。一键同步入口，带退出码，给 cron/任务计划用 |
| `tools/run_sync.ps1` | **新增**。Windows 任务计划包装器（读 `.xxmu.env`、写日志、透传退出码） |
| `tools/sync_assets.py` | **新增**。`web/` → `android/assets/` 同步 + md5 校验，替代手敲 cp |
| `tools/crontab.sample` / `tools/SCHEDULE-WINDOWS.md` | **新增**。Linux cron 与 Windows 任务计划配置 |
| `.gitignore` / `.xxmu.env.example` | **新增**。凭据与中间产物不入库 |

### 修掉的 bug（重点）

原 `core/sync.py` 只写 `data/schedule.json`，而且里面**没有 `courses` 字段**，也**不生成 `web/data.js`**。

但前端 `app.js:458` 读的是 `window.SCHEDULE` → 直接用 `DATA.courses`。也就是说：
跑完原版 `sync.py` 后，`web/data.js` 还是旧的；`data/schedule.json` 里也缺 `courses`。
现有仓库里的两份数据是对的（手工补过），但代码链路是断的——换个学期重新同步就会踩到。

现在 `sync.py` / `sync_all.py` 都会：
1. `parse_kb.parse()` 出 `cells`
2. `normalize.normalize(cells)` 出扁平 `courses[]`（带 `day` / `weeks:[]` / `periods:[]`）
3. 同时写 `data/schedule.json`、`web/data.js`、`android/assets/data.js`

## 2. 环境变量

全在 `core/paths.py`，或复制 `.xxmu.env.example` → `.xxmu.env`：

| 变量 | 作用 | PC 默认 |
|---|---|---|
| `XXMU_COOKIE_DB` | 学习通 cookie 库（sqlite，只读） | `<项目>/data/cx_cookies.db` |
| `XXMU_PUSH` | 是否推作业到手机外部目录 | `0`（关） |
| `XXMU_PUSH_DIR` | 推送目标 | `/sdcard/Android/data/com.xxmu.helper/files` |
| `XXMU_XN` / `XXMU_XQ` | 学年 / 学期（xq: 0 秋 1 春） | `2026` / `0` |
| `XXMU_TERM` | 学期展示标签 | `2026-2027-1` |
| `XXMU_USER` / `XXMU_PWD` | 教务账号（session 过期时自动尝试登录用） | 空 |
| `XXMU_NODE` | node 可执行文件路径 | 自动探测 |

## 3. 怎么跑

### 3.1 前置

```powershell
python --version        # 3.8+
node --version          # 必须有，青果 DES 加密靠它
```

node 没装：`winget install OpenJS.NodeJS.LTS -e --source winget`（本机已装 v26.13.0）。

### 3.2 学习通 cookie（作业同步的前提）

手机上学习通处于登录状态时：

```powershell
adb shell su -c "cp /data/data/com.chaoxing.mobile/app_webview/Default/Cookies /sdcard/Download/cx_cookies.db"
adb pull /sdcard/Download/cx_cookies.db "D:\dsh\DSH Desktop\xxmu-app\data\cx_cookies.db"
```

cookie 失效时脚本退出码 `2`，照上面再拉一次即可。

### 3.3 一键同步

```powershell
cd "D:\dsh\DSH Desktop\xxmu-app"

# 全量（课表优先复用 data/session.json，作业读 cookie 库）
python tools\sync_all.py

# 只作业
python tools\sync_all.py --hw-only

# 只课表
python tools\sync_all.py --kb-only

# 教务 session 过期了，重新登录（两步）
python tools\sync_all.py --login 学号 密码      # 产出 data/captcha.jpg，退出码 3
python tools\sync_all.py --captcha 1234 --user 学号
# 注意：第二步需要密码，实际用：
#   python core/sync.py 学号 密码 1234
```

### 3.4 改完前端

```powershell
python tools\sync_assets.py        # web/ -> android/assets/ + md5 校验
```

### 3.5 浏览器预览

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory web
# 打开 http://127.0.0.1:8765/index.html
```

`Host` 未定义时前端自动 fallback 到 `window.SCHEDULE` / `window.HOMEWORK`，能完整跑。

## 4. 退出码

`tools/sync_all.py` 与 `tools/run_sync.ps1` 一致：

| 码 | 含义 | 处理 |
|---|---|---|
| 0 | 成功 | — |
| 2 | 登录态失效（教务 session 过期 / 学习通 cookie 过期 / 未提供账号） | 重新登录或 adb pull |
| 3 | 需要人工看验证码 | 看 `data/captcha.jpg` 再跑 |
| 4 | 部分失败 | 看日志 |

## 5. 定时任务

- Linux/macOS：`tools/crontab.sample`
- Windows：`tools/SCHEDULE-WINDOWS.md`（`Register-ScheduledTask`，含验证命令）

建议频率：作业每 30 分钟；课表每天一次（青果 session 时效短，登录还要验证码，抢不到无人值守）。
