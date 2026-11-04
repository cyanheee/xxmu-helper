# xxmu-app PC 端定时同步（Windows 任务计划）

比 cron 省事：用项目自带的 `tools/run_sync.ps1` 包一层，任务计划只调它。

## 一次性准备

1. 建凭据文件 `xxmu-app\.xxmu.env`（**不要提交仓库**，加进 .gitignore）：

```
XXMU_USER=20261440105
XXMU_PWD=你的密码
XXMU_COOKIE_DB=D:\dsh\DSH Desktop\xxmu-app\data\cx_cookies.db
XXMU_PUSH=0
```

2. 确认 node 在 PATH：`node --version`（青果 DES 加密要它）。

## 注册任务（管理员 PowerShell 执行一次）

```powershell
$root = "D:\dsh\DSH Desktop\xxmu-app"
$ps1  = Join-Path $root "tools\run_sync.ps1"

# 作业：每 30 分钟
$A = New-ScheduledTaskAction -Execute "powershell.exe" `
     -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -HwOnly"
$T = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
     -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "xxmu-sync-hw" -Action $A -Trigger $T `
     -Description "学习通作业同步（每 30 分钟）" -Force

# 课表：每天 06:10
$A2 = New-ScheduledTaskAction -Execute "powershell.exe" `
      -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -KbOnly"
$T2 = New-ScheduledTaskTrigger -Daily -At 06:10
Register-ScheduledTask -TaskName "xxmu-sync-kb" -Action $A2 -Trigger $T2 `
      -Description "青果课表同步（每日）" -Force
```

## 验证 / 排查

```powershell
Start-ScheduledTask -TaskName "xxmu-sync-hw"
Get-ScheduledTaskInfo -TaskName "xxmu-sync-hw" | Select LastRunTime,LastTaskResult
Get-Content ".\xxmu-app\logs\sync_hw.log" -Tail 30
```

`LastTaskResult` 含义跟 sync_all 的退出码一致：
`0` 成功 · `2` 登录态失效（要 adb pull 新 cookie） · `3` 需要人工看验证码 · `4` 部分失败。

## 取消

```powershell
Unregister-ScheduledTask -TaskName "xxmu-sync-hw" -Confirm:$false
Unregister-ScheduledTask -TaskName "xxmu-sync-kb" -Confirm:$false
```
