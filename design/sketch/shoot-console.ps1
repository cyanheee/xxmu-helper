# Independent CONSOLE skin preview: 390px shots via headless Edge.
# Pure ASCII for Windows PowerShell 5.1. No production file is touched.
$ErrorActionPreference = 'Continue'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$sketch = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch'
$shots = $sketch + '\shots'
New-Item -ItemType Directory -Force -Path $shots | Out-Null

function Take-Shot([string]$tag, [string]$target) {
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\cv-edge-' + $tag + '-' + (Get-Random)
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=390,2760 --user-data-dir="' + $ud + '" --screenshot="' + $pic + '" "' + $target + '"'
  cmd /c $cmd 2>$null | Out-Null
  if (Test-Path -LiteralPath $pic) {
    $fi = Get-Item -LiteralPath $pic
    "{0,-20} {1,8} bytes  {2}" -f $tag, $fi.Length, (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
  } else { "{0,-20} FAILED" -f $tag }
}

$url = 'file:///C:/Users/Administrator/Desktop/xxmuhelper/xxmu-app/design/sketch/console-preview.html'
Take-Shot 'console-light' $url
Take-Shot 'console-dark' ($url + '?theme=dark')
'DONE'
