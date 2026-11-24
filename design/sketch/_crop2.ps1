param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$X, [int]$Y, [int]$W, [int]$H, [double]$Scale = 2.0
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Src)
$rect = [System.Drawing.Rectangle]::new($X, $Y, $W, $H)
$crop = [System.Drawing.Bitmap]::new($W, $H)
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($img, [System.Drawing.Rectangle]::new(0,0,$W,$H), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$nw = [int]($W * $Scale); $nh = [int]($H * $Scale)
$big = [System.Drawing.Bitmap]::new($nw, $nh)
$g2 = [System.Drawing.Graphics]::FromImage($big)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($crop, 0, 0, $nw, $nh)
$g2.Dispose()
$big.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose(); $crop.Dispose(); $img.Dispose()
Write-Output ("OK {0} {1}x{2}" -f $Out, $nw, $nh)
