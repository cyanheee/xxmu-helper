# NOVA previews via headless Edge. Pure ASCII for PS 5.1.
# Separate physical shots: homepage light/dark, channel-switch state, cassette
# portal state. Headless Edge clamps --window-size=390 to ~492 CSS px on
# Windows; nova-preview.html pins html/body/#cabin to 390px, shooter trims it.
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$sketch = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch'
$shots = $sketch + '\shots'
$targetW = 390
$targetH = 1400
New-Item -ItemType Directory -Force -Path $shots | Out-Null

function Take-Shot([string]$tag, [string]$target) {
  $raw = $env:TEMP + '\nova-raw-' + $tag + '-' + (Get-Random) + '.png'
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\nova-edge-' + $tag + '-' + (Get-Random)
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=' + $targetW + ',' + $targetH + ' --virtual-time-budget=1800 --user-data-dir="' + $ud + '" --screenshot="' + $raw + '" "' + $target + '"'
  cmd /c $cmd 2>$null | Out-Null
  if (!(Test-Path -LiteralPath $raw)) { "{0,-22} FAILED (no raw)" -f $tag; return }
  $img = [System.Drawing.Image]::FromFile($raw)
  $crop = New-Object System.Drawing.Bitmap($targetW, $targetH)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.InterpolationMode = 'NearestNeighbor'
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$targetW,$targetH)), (New-Object System.Drawing.Rectangle(0,0,$targetW,$targetH)), [System.Drawing.GraphicsUnit]::Pixel)
  $crop.Save($pic, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $crop.Dispose(); $img.Dispose()
  Remove-Item -LiteralPath $raw -Force
  $fi = Get-Item -LiteralPath $pic
  "{0,-22} {1,4}x{2,-4} {3,8} bytes  {4}" -f $tag, $targetW, $targetH, $fi.Length, (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
}

$u = 'file:///C:/Users/Administrator/Desktop/xxmuhelper/xxmu-app/design/sketch/nova-preview.html'
Take-Shot 'nova-light'      ($u + '?full=1')
Take-Shot 'nova-dark'       ($u + '?full=1&theme=dark')
Take-Shot 'nova-channel'    ($u + '?full=1&shot=channel')
Take-Shot 'nova-tape-light' ($u + '?full=1&shot=tape')
Take-Shot 'nova-tape-dark'  ($u + '?full=1&shot=tape&theme=dark')
'DONE'
