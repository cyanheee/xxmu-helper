# Build the QQ channel media kit: copy 7 real UI shots + one 3-skin cover collage.
# Pure ASCII source so PS 5.1 reads it without codepage surprises.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$src  = $root + '\design\sketch\shots'
$dst  = $root + '\publish\qq-channel'
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$map = @(
  @('v1161-ink-light.png',     '01-cover-ink-light.png'),
  @('v1161-ink-dark.png',      '02-ink-dark.png'),
  @('v1161-classic-light.png', '03-classic-light.png'),
  @('qq-learn-light.png',      '04-homework-exams.png'),
  @('qq-campus-light.png',     '05-campus-water.png'),
  @('qq-wiki-light.png',       '06-wiki-board.png'),
  @('qq-me-light.png',         '07-me-settings.png')
)
foreach($m in $map){
  Copy-Item -LiteralPath ($src + '\' + $m[0]) -Destination ($dst + '\' + $m[1]) -Force
}

# ---- collage: 3 skin shots side by side, ASCII labels only ----
$files  = @('01-cover-ink-light.png','02-ink-dark.png','03-classic-light.png')
$labels = @('01  INK LIGHT','02  VIOLET DARK','03  CLASSIC')
$W = 390; $H = 1500; $GAP = 12; $TOP = 96; $BOT = 64
$CW = $W*3 + $GAP*2
$CH = $TOP + $H + $BOT
$bmp = New-Object System.Drawing.Bitmap($CW, $CH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255,243,241,234))
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bar   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,51,71,77))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,180,205,206))
$dark  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,44,64,72))
$lb    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215,28,43,48))
$f1 = [System.Drawing.Font]::new('Segoe UI', 34, [System.Drawing.FontStyle]::Bold,    [System.Drawing.GraphicsUnit]::Pixel)
$f2 = [System.Drawing.Font]::new('Segoe UI', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$f3 = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Bold,    [System.Drawing.GraphicsUnit]::Pixel)

$g.FillRectangle($bar, 0, 0, $CW, $TOP)
$g.DrawString('XXMU HELPER   /   THREE SKINS', $f1, $white, [single]28, [single]14)
$g.DrawString('TIMETABLE - HOMEWORK - WATER - WIKI     v1.1.61', $f2, $muted, [single]30, [single]60)

for($i=0; $i -lt 3; $i++){
  $im = [System.Drawing.Image]::FromFile($dst + '\' + $files[$i])
  $x = $i*($W+$GAP)
  $g.DrawImage($im, $x, $TOP, $W, $H)
  $im.Dispose()
  $g.FillRectangle($lb, $x, $TOP, $W, 40)
  $g.DrawString($labels[$i], $f3, $white, [single]($x+16), [single]($TOP+9))
}
$g.DrawString('Student-built campus assistant  -  not an official school product  -  Android', $f2, $dark, [single]30, [single]($TOP+$H+16))

$out = $dst + '\00-cover-3skins.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
$fi = Get-Item -LiteralPath $out
"{0}  {1}x{2}  {3} bytes" -f $fi.Name, $CW, $CH, $fi.Length
"---- kit ----"
Get-ChildItem -LiteralPath $dst -File | Sort-Object Name | ForEach-Object { "{0,-28} {1,8} bytes" -f $_.Name, $_.Length }
