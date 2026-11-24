param([int]$X=60,[int]$Y=600,[int]$W=320,[int]$H=220,[int]$S=2,[string]$Tag='_crop')
Add-Type -AssemblyName System.Drawing
$src = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch\shots\v3-kb-light.png'
$out = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app\design\sketch\shots\' + $Tag + '.png'
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap(($W*$S), ($H*$S))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'NearestNeighbor'
$g.PixelOffsetMode = 'Half'
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,($W*$S),($H*$S))), (New-Object System.Drawing.Rectangle($X,$Y,$W,$H)), [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
"{0,-14} {1}x{2} {3} bytes" -f $Tag, ($W*$S), ($H*$S), (Get-Item $out).Length
