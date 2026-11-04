param(
    [Parameter(Mandatory=$true)][string]$Token,
    [Parameter(Mandatory=$true)][string]$AccountId
)

# 河医大助手 · 服务端一键部署
# 用法（在项目根目录）：
#   powershell -ExecutionPolicy Bypass -File tools\deploy_server.ps1 -Token "你的API令牌" -AccountId "你的账户ID"

$ErrorActionPreference = 'Continue'
$env:Path += ';C:\Program Files\nodejs'
$env:CLOUDFLARE_API_TOKEN = $Token
$env:CLOUDFLARE_ACCOUNT_ID = $AccountId

$server = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\server'
$server = (Resolve-Path $server).Path
Set-Location $server

function WR {
    & npm.cmd exec --yes wrangler@latest -- @args 2>&1 | Out-String
}

function NewKey([int]$len) {
    $chars = 'abcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray()
    $sb = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt $len; $i++) { [void]$sb.Append($chars[(Get-Random -Maximum $chars.Length)]) }
    return $sb.ToString()
}

Write-Host '[1/5] 验证令牌...' -ForegroundColor Cyan
$who = WR whoami
if ($who -match 'failed|not authenticated|Authentication error') {
    Write-Host $who -ForegroundColor Red
    throw '令牌无效或权限不足。请确认令牌包含 Workers Scripts:Edit 与 Workers KV Storage:Edit 权限。'
}
Write-Host '  令牌有效'

Write-Host '[2/5] 创建 KV 命名空间 AUTH ...' -ForegroundColor Cyan
$kvOut = WR kv namespace create AUTH
Write-Host $kvOut

$m = [regex]::Match($kvOut, '([0-9a-f]{32})')
if (-not $m.Success) {
    if ($kvOut -match 'already exists|already been taken') {
        throw '已存在同名 KV 命名空间。请到 Cloudflare 后台 → Workers & Pages → KV，复制 AUTH 的 id 手动填进 server/wrangler.toml，然后跳过本脚本的建 KV 步骤。'
    }
    throw '没能从输出里抓到 KV id。请把上面这段输出发给开发者。'
}
$kvId = $m.Groups[1].Value
Write-Host "  KV id = $kvId" -ForegroundColor Green

$tomlPath = Join-Path $server 'wrangler.toml'
$toml = [IO.File]::ReadAllText($tomlPath)
$toml = [regex]::Replace($toml, '(?m)^id\s*=\s*"[^"]*"', ('id = "' + $kvId + '"'))
[IO.File]::WriteAllText($tomlPath, $toml, (New-Object System.Text.UTF8Encoding($false)))
Write-Host '  已写入 wrangler.toml'

Write-Host '[3/5] 写三个密钥...' -ForegroundColor Cyan

# SECRET 必须与 web/license.js 里一模一样，否则已经发出去的码全部作废
$r1 = ('XXMU-HELPER-GU-2026-v1' | & npm.cmd exec --yes wrangler@latest -- secret put SECRET 2>&1 | Out-String)
if ($r1 -match 'ERROR|failed') { Write-Host $r1 -ForegroundColor Red; throw 'SECRET 写入失败' }
Write-Host '  SECRET 已写入'

$signKey = NewKey 48
$r2 = ($signKey | & npm.cmd exec --yes wrangler@latest -- secret put SIGN_KEY 2>&1 | Out-String)
if ($r2 -match 'ERROR|failed') { Write-Host $r2 -ForegroundColor Red; throw 'SIGN_KEY 写入失败' }
Write-Host '  SIGN_KEY 已写入'

$adminKey = NewKey 40
$r3 = ($adminKey | & npm.cmd exec --yes wrangler@latest -- secret put ADMIN_KEY 2>&1 | Out-String)
if ($r3 -match 'ERROR|failed') { Write-Host $r3 -ForegroundColor Red; throw 'ADMIN_KEY 写入失败' }
Write-Host '  ADMIN_KEY 已写入'

Write-Host '[4/5] 部署...' -ForegroundColor Cyan
$dep = WR deploy
Write-Host $dep
if ($dep -match 'ERROR|failed to publish') { throw '部署失败，看上面输出' }

$url = ''
$mm = [regex]::Match($dep, 'https://[a-z0-9\-]+\.[a-z0-9\-]+\.workers\.dev')
if ($mm.Success) { $url = $mm.Value }

Write-Host '[5/5] 完成' -ForegroundColor Green

# 自动把服务地址写进 web/auth.js，省得手改
if ($url) {
    $authPath = Join-Path $server '..\web\auth.js'
    $authPath = (Resolve-Path $authPath).Path
    $js = [IO.File]::ReadAllText($authPath)
    $js2 = [regex]::Replace($js, "(?m)^\s*const BASE = '[^']*';", ("  const BASE = '" + $url + "';"))
    if ($js2 -ne $js) {
        [IO.File]::WriteAllText($authPath, $js2, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host ('  已把服务地址写进 web/auth.js 的 BASE') -ForegroundColor Green
    } else {
        Write-Host '  ⚠ 没能在 web/auth.js 里找到 BASE 那一行，请手动改' -ForegroundColor Red
    }
}

$out = @(
    '河医大助手 · 服务端部署结果',
    ('时间：' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')),
    '',
    '服务地址：' + $url,
    'App 管理后台口令（ADMIN_KEY）：',
    '  ' + $adminKey,
    '',
    '下一步：',
    '  1) 把上面的服务地址填进 web/auth.js 第 19 行的 BASE',
    '  2) python tools/build_apk.py 重新出包',
    '  3) 打开 App → 我的 → 管理后台 → 粘贴 ADMIN_KEY → 保存口令并连接',
    '  4) 用后台给 20261440105 开一次卡（自己的号），再自检码是不是 24DN-JFSG-7NKV-RNBT',
    '',
    'ADMIN_KEY 丢了就重跑：',
    '  $env:CLOUDFLARE_API_TOKEN="..."; wrangler secret put ADMIN_KEY'
)
$out -join "`r`n" | Set-Content -Path (Join-Path $server 'DEPLOY-OUT.txt') -Encoding UTF8

Write-Host ''
Write-Host '=====================================================' -ForegroundColor Yellow
Write-Host (' 服务地址：' + $url) -ForegroundColor Yellow
Write-Host (' ADMIN_KEY：' + $adminKey) -ForegroundColor Yellow
Write-Host '=====================================================' -ForegroundColor Yellow
Write-Host ' 已同时写入 server/DEPLOY-OUT.txt' -ForegroundColor Gray
