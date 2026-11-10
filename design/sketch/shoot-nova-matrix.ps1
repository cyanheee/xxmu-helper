# Orthogonality matrix shots: classic/nova skin x light/dark theme.
# Pure ASCII for PS 5.1. Each cell is a SEPARATE physical shot.
# Proves the two axes never touch each other: switching skin does not change
# light/dark, switching light/dark does not change skin.
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$root = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$sketch = $root + '\design\sketch'
$shots = $sketch + '\shots'
$W = 390
$H = 1400
New-Item -ItemType Directory -Force -Path $shots | Out-Null

function Take-Shot([string]$tag, [string]$skin, [string]$theme) {
  & $node ($sketch + '\make_nova_real.js') $theme $skin | Out-Null
  $page = $sketch + '\nova-real-' + $skin + '-' + $theme + '.html'
  $raw = $env:TEMP + '\nova-mx-' + $tag + '-' + (Get-Random) + '.png'
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\nova-mx-edge-' + $tag + '-' + (Get-Random)
  $url = 'file:///' + ($page -replace '\\','/')
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=' + $W + ',' + $H + ' --virtual-time-budget=700 --user-data-dir="' + $ud + '" --screenshot="' + $raw + '" "' + $url + '"'
  cmd /c $cmd 2>$null | Out-Null
  if (!(Test-Path -LiteralPath $raw)) { "{0,-24} FAILED" -f $tag; return }
  $img = [System.Drawing.Image]::FromFile($raw)
  $crop = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.InterpolationMode = 'NearestNeighbor'
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$W,$H)), (New-Object System.Drawing.Rectangle(0,0,$W,$H)), [System.Drawing.GraphicsUnit]::Pixel)
  $crop.Save($pic, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $crop.Dispose(); $img.Dispose()
  Remove-Item -LiteralPath $raw -Force
  $fi = Get-Item -LiteralPath $pic
  "{0,-24} {1,4}x{2,-4} {3,8} bytes  {4}" -f $tag, $W, $H, $fi.Length, (Get-FileHash -LiteralPath $pic -Algorithm SHA256).Hash.Substring(0,16)
}

Take-Shot 'matrix-classic-light' 'classic' 'light'
Take-Shot 'matrix-classic-dark'  'classic' 'dark'
Take-Shot 'matrix-nova-light'    'nova'    'light'
Take-Shot 'matrix-nova-dark'     'nova'    'dark'
'DONE'
