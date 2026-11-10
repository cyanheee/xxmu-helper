# Real-app NOVA shots: render the ACTUAL web/index.html via a harness.
# Pure ASCII for PS 5.1. Light/dark are separate physical shots.
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$root = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$sketch = $root + '\design\sketch'
$shots = $sketch + '\shots'
$W = 390
$H = 2200
New-Item -ItemType Directory -Force -Path $shots | Out-Null

& $node ($sketch + '\make_nova_real.js') light
& $node ($sketch + '\make_nova_real.js') dark

function Take-Shot([string]$tag, [string]$theme) {
  $page = $sketch + '\nova-real-' + $theme + '.html'
  $raw = $env:TEMP + '\nova-real-raw-' + $tag + '-' + (Get-Random) + '.png'
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\nova-real-edge-' + $tag + '-' + (Get-Random)
  $url = 'file:///' + ($page -replace '\\','/')
  # 不用长 virtual-time：app.js 的定时器已被 harness 中和，长预算只会空转
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=' + $W + ',' + $H + ' --virtual-time-budget=600 --user-data-dir="' + $ud + '" --screenshot="' + $raw + '" "' + $url + '"'
  cmd /c $cmd 2>$null | Out-Null
  if (!(Test-Path -LiteralPath $raw)) { "{0,-22} FAILED (no raw)" -f $tag; return }
  $img = [System.Drawing.Image]::FromFile($raw)
  $crop = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.InterpolationMode = 'NearestNeighbor'
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$W,$H)), (New-Object System.Drawing.Rectangle(0,0,$W,$H)), [System.Drawing.GraphicsUnit]::Pixel)
  $crop.Save($pic, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $crop.Dispose(); $img.Dispose()
  Remove-Item -LiteralPath $raw -Force
  $fi = Get-Item -LiteralPath $pic
  "{0,-22} {1,4}x{2,-4} {3,8} bytes  {4}" -f $tag, $W, $H, $fi.Length, (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
}

Take-Shot 'nova-real-light' 'light'
Take-Shot 'nova-real-dark'  'dark'
'DONE'
