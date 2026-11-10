# Mashup skin preview: 4 screenshots at 390px via headless Edge.
# Pure ASCII on purpose: Windows PowerShell 5.1 mangles UTF-8-no-BOM Chinese comments.
# Uses the real web/app.css plus a standalone mashup-preview.css; web/app.css is untouched.
$ErrorActionPreference = 'Continue'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$sketch = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch'
$shots = $sketch + '\shots'
New-Item -ItemType Directory -Force -Path $shots | Out-Null

function Take-Shot([string]$tag, [string]$target) {
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\mx-edge-' + $tag + '-' + (Get-Random)
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=390,2760 --user-data-dir="' + $ud + '" --screenshot="' + $pic + '" "' + $target + '"'
  cmd /c $cmd 2>$null | Out-Null
  if (Test-Path -LiteralPath $pic) {
    $fi = Get-Item -LiteralPath $pic
    $h = (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
    "{0,-18} {1,8} bytes  {2}" -f $tag, $fi.Length, $h
  } else {
    "{0,-18} FAILED" -f $tag
  }
}

$mxUrl = 'file:///C:/Users/Administrator/Desktop/xxmuhelper/xxmu-app/design/sketch/mashup-preview.html'
Take-Shot 'mashup-light' $mxUrl
Take-Shot 'mashup-dark' ($mxUrl + '?theme=dark')

# Classic comparison: preview.html hardcodes data-theme="light" and has no ?theme hook.
# Write two temp copies IN THE SKETCH DIR so ../../web/app.css still resolves.
$srcFile = $sketch + '\preview.html'
$srcText = [IO.File]::ReadAllText($srcFile, [Text.Encoding]::UTF8)
# Same 390px containment as mashup-preview.html, injected into the temp copy only.
# Keeps the four shots comparable without touching the original preview.html.
$fit = @'
<style>
html,body{max-width:390px;overflow-x:hidden}
.pv,.pv main{max-width:390px;overflow-x:hidden}
main{width:100%;min-width:0}
.grid{width:100%;min-width:0}
.grid .c{min-width:0;overflow:hidden}
.grid .c div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.elec-entry-box{gap:6px}
.elec-entry-main{min-width:0}
.elec-entry-title,.elec-entry-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.elec-entry-odd{font-size:24px}
.elec-entry-num{font-size:.9em}
.wiki-grid{gap:6px}
.wiki-card{min-width:0;overflow:hidden}
.wiki-card>div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.seg,.chips{max-width:100%;overflow-x:auto;overflow-y:hidden}
</style>
'@
foreach ($mode in @('light','dark')) {
  $tmpFile = $sketch + '\_classic-' + $mode + '.html'
  $tmpText = $srcText.Replace('data-theme="light"', 'data-theme="' + $mode + '"')
  $tmpText = $tmpText.Replace('</head>', $fit + '</head>')
  [IO.File]::WriteAllText($tmpFile, $tmpText, (New-Object Text.UTF8Encoding($false)))
  Take-Shot ('classic-' + $mode) ('file:///' + $tmpFile.Replace('\','/'))
  Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
}
'DONE'
