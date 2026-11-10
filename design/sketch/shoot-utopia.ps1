# UTOPIA previews via headless Edge. Pure ASCII for PS 5.1.
$ErrorActionPreference = 'Continue'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$sketch = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch'
$shots = $sketch + '\shots'
New-Item -ItemType Directory -Force -Path $shots | Out-Null

function Take-Shot([string]$tag, [string]$target, [string]$size) {
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\ut-edge-' + $tag + '-' + (Get-Random)
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=' + $size + ' --virtual-time-budget=1600 --user-data-dir="' + $ud + '" --screenshot="' + $pic + '" "' + $target + '"'
  cmd /c $cmd 2>$null | Out-Null
  if (Test-Path -LiteralPath $pic) {
    $fi = Get-Item -LiteralPath $pic
    "{0,-20} {1,8} bytes  {2}" -f $tag, $fi.Length, (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
  } else { "{0,-20} FAILED" -f $tag }
}

$u = 'file:///C:/Users/Administrator/Desktop/xxmuhelper/xxmu-app/design/sketch/utopia-preview.html'
Take-Shot 'utopia-light' ($u + '?full=1') '390,2150'
Take-Shot 'utopia-dark'  ($u + '?full=1&theme=dark') '390,2150'
'DONE'
