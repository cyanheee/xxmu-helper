# Site NOVA shots: full-page light + dark long images of the real site.
# Pure ASCII for PS 5.1.
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$py = 'C:\Users\Administrator\AppData\Local\Programs\Python\Python311\python.exe'
$root = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$sketch = $root + '\design\sketch'
$shots = $sketch + '\shots'
$W = 1100
$H = 2400
New-Item -ItemType Directory -Force -Path $shots | Out-Null

& $py -X utf8 ($root + '\tools\make_site_dark.py')

function Take-Shot([string]$tag, [string]$page) {
  $raw = $env:TEMP + '\site-raw-' + $tag + '-' + (Get-Random) + '.png'
  $pic = $shots + '\' + $tag + '.png'
  if (Test-Path -LiteralPath $pic) { Remove-Item -LiteralPath $pic -Force }
  $ud = $env:TEMP + '\site-edge-' + $tag + '-' + (Get-Random)
  $url = 'file:///' + ($page -replace '\\','/')
  $cmd = '"' + $edge + '" --headless=new --disable-gpu --no-first-run --no-default-browser-check --hide-scrollbars --force-device-scale-factor=1 --window-size=' + $W + ',' + $H + ' --virtual-time-budget=2500 --user-data-dir="' + $ud + '" --screenshot="' + $raw + '" "' + $url + '"'
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

Take-Shot 'site-nova-light' ($root + '\server\pages\dist\index.html')
Take-Shot 'site-nova-dark'  ($sketch + '\site-dark-preview.html')
'DONE'
