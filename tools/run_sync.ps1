<#
.SYNOPSIS
    xxmu-app sync wrapper: load .xxmu.env, call tools/sync_all.py, write log.

.DESCRIPTION
    For Windows Task Scheduler. Exit code passes through from sync_all.py:
      0 success / 2 login expired / 3 captcha needed / 4 partial failure
#>
param(
    [switch]$KbOnly,
    [switch]$HwOnly,
    [switch]$NoAssets
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# node must be on PATH (Qingguo DES needs it)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    foreach ($c in @("C:\Program Files\nodejs", "C:\Program Files (x86)\nodejs")) {
        if (Test-Path (Join-Path $c "node.exe")) { $env:PATH = "$c;$env:PATH"; break }
    }
}

# load env file (KEY=VALUE)
$envFile = Join-Path $Root ".xxmu.env"
if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $i = $line.IndexOf("=")
            $k = $line.Substring(0, $i).Trim()
            $v = $line.Substring($i + 1).Trim()
            [Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
    }
}

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$argsList = @()
if ($KbOnly) { $argsList += "--kb-only" }
if ($HwOnly) { $argsList += "--hw-only" }
if ($NoAssets) { $argsList += "--no-assets" }

$logName = "sync.log"
if ($KbOnly) { $logName = "sync_kb.log" }
if ($HwOnly) { $logName = "sync_hw.log" }
$logFile = Join-Path $logDir $logName

"" | Out-File -FilePath $logFile -Append -Encoding UTF8
"===== $stamp =====" | Out-File -FilePath $logFile -Append -Encoding UTF8

$pyCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pyCmd) { $py = $pyCmd.Source } else { $py = "python" }

# Use Start-Process -RedirectStandardOutput: it writes the child's raw bytes to
# the file without re-encoding. (PowerShell's own ">>" would write UTF-16 and
# garble the UTF-8 Chinese output from python.)
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$script = Join-Path $Root "tools\sync_all.py"
$outTmp = Join-Path $logDir "_out.tmp"
$errTmp = Join-Path $logDir "_err.tmp"
$argList = @('"' + $script + '"') + $argsList

$proc = Start-Process -FilePath $py -ArgumentList $argList `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $outTmp -RedirectStandardError $errTmp
$code = $proc.ExitCode

# stitch temp streams into the log as raw bytes
foreach ($t in @($outTmp, $errTmp)) {
    if (Test-Path $t) {
        $bytes = [System.IO.File]::ReadAllBytes($t)
        if ($bytes.Length -gt 0) {
            $fs = [System.IO.File]::Open($logFile, "Append", "Write")
            $fs.Write($bytes, 0, $bytes.Length)
            $fs.Close()
            Add-Content -Path $logFile -Value "" -Encoding UTF8
        }
        Remove-Item $t -Force -ErrorAction SilentlyContinue
    }
}

"exit=$code" | Out-File -FilePath $logFile -Append -Encoding UTF8
exit $code
