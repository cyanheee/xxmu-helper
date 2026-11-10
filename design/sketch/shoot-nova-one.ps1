# Take ONE NOVA organ shot. Pure ASCII for PS 5.1.
#   powershell -NoProfile -ExecutionPolicy Bypass -File design\sketch\shoot-nova-one.ps1 -Tag organ-swipe-light -Theme light -Skin nova -Organ swipe
#   ... -Reduced   forces prefers-reduced-motion: reduce (static fallback QA)
param(
  [string]$Tag = 'organ-swipe-light',
  [string]$Theme = 'light',
  [string]$Skin = 'nova',
  [string]$Organ = '',
  [switch]$Reduced
)
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$root = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$sketch = $root + '\design\sketch'
$shots = $sketch + '\shots'
$W = 390
$H = 1500
New-Item -ItemType Directory -Force -Path $shots | Out-Null

& $node ($sketch + '\make_nova_real.js') $Theme $Skin | Out-Null
$page = $sketch + '\nova-real-' + $Skin + '-' + $Theme + '.html'
$raw = $env:TEMP + '\nova-one-' + $Tag + '-' + (Get-Random) + '.png'
$pic = $shots + '\' + $Tag + '.png'
if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
$ud = $env:TEMP + '\nova-one-edge-' + $Tag + '-' + (Get-Random)
$url = 'file:///' + ($page -replace '\\','/')
if ($Organ) { $url = $url + '?organ=' + $Organ }
$flags = '--headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=' + $W + ',' + $H + ' --virtual-time-budget=900'
if ($Reduced) { $flags = $flags + ' --force-prefers-reduced-motion' }
$cmd = '"' + $edge + '" ' + $flags + ' --user-data-dir="' + $ud + '" --screenshot="' + $raw + '" "' + $url + '"'
cmd /c $cmd 2>$null | Out-Null
if (!(Test-Path -LiteralPath $raw)) { "{0,-22} FAILED" -f $Tag; exit 1 }
$img = [System.Drawing.Image]::FromFile($raw)
$crop = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.InterpolationMode = 'NearestNeighbor'
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$W,$H)), (New-Object System.Drawing.Rectangle(0,0,$W,$H)), [System.Drawing.GraphicsUnit]::Pixel)
$crop.Save($pic, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $crop.Dispose(); $img.Dispose()
Remove-Item -LiteralPath $raw -Force
$fi = Get-Item -LiteralPath $pic
"{0,-22} {1,4}x{2,-4} {3,8} bytes  {4}" -f $Tag, $W, $H, $fi.Length, (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
