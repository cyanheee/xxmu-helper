param([string]$src,[string]$out,[int]$x0=0,[int]$y0=0,[int]$w=0,[int]$h=0,[int]$scale=3)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
if ($w -le 0) { $w = $bmp.Width - $x0 }
if ($h -le 0) { $h = $bmp.Height - $y0 }
$dw = [int]($w * $scale)
$dh = [int]($h * $scale)
$dst = New-Object System.Drawing.Bitmap $dw, $dh
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$rcSrc = New-Object System.Drawing.Rectangle $x0, $y0, $w, $h
$rcDst = New-Object System.Drawing.Rectangle 0, 0, $dw, $dh
$g.DrawImage($bmp, $rcDst, $rcSrc, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose(); $bmp.Dispose(); $img.Dispose()
Write-Output ("saved {0} {1}x{2}" -f $out, $dw, $dh)
