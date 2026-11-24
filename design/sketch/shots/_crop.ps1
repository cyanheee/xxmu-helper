param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y,
  [Parameter(Mandatory=$true)][int]$W,
  [Parameter(Mandatory=$true)][int]$H,
  [int]$Scale = 2
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($In)
$rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
$crop = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$W,$H)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
if ($Scale -ne 1) {
  $big = New-Object System.Drawing.Bitmap(($W*$Scale), ($H*$Scale))
  $g2 = [System.Drawing.Graphics]::FromImage($big)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g2.DrawImage($crop, 0, 0, ($W*$Scale), ($H*$Scale))
  $g2.Dispose()
  $big.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose()
} else {
  $crop.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
}
$crop.Dispose(); $img.Dispose()
Write-Output "$Out  ${W}x${H} x$Scale"
