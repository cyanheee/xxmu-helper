param([Parameter(Mandatory=$true)][string]$Src)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
} | Select-Object -First 1)
function Await($op, $t) { $m = $asTaskGeneric.MakeGenericMethod($t); $task = $m.Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$tmp = Join-Path $env:TEMP 'nova_ocr_band.png'
$full = [System.Drawing.Image]::FromFile($Src)
$W = $full.Width; $H = $full.Height
$full.Dispose()
$bandH = 150; $scale = 2.0
for ($y = 0; $y -lt $H; $y += $bandH) {
  $hh = [Math]::Min($bandH, $H - $y)
  $img = [System.Drawing.Image]::FromFile($Src)
  $crop = [System.Drawing.Bitmap]::new($W, $hh)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.DrawImage($img, [System.Drawing.Rectangle]::new(0,0,$W,$hh), [System.Drawing.Rectangle]::new(0,$y,$W,$hh), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $img.Dispose()
  # 灰度 + 对比度拉伸
  $nw = [int]($W * $scale); $nh = [int]($hh * $scale)
  $big = [System.Drawing.Bitmap]::new($nw, $nh)
  $g2 = [System.Drawing.Graphics]::FromImage($big)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $cm = [System.Drawing.Imaging.ColorMatrix]::new()
  $cm.Matrix00=0.299; $cm.Matrix01=0.299; $cm.Matrix02=0.299
  $cm.Matrix10=0.587; $cm.Matrix11=0.587; $cm.Matrix12=0.587
  $cm.Matrix20=0.114; $cm.Matrix21=0.114; $cm.Matrix22=0.114
  $ia = [System.Drawing.Imaging.ImageAttributes]::new(); $ia.SetColorMatrix($cm)
  $g2.DrawImage($crop, [System.Drawing.Rectangle]::new(0,0,$nw,$nh), 0,0,$W,$hh, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $g2.Dispose(); $crop.Dispose()
  $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
  $st = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($st)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  foreach ($line in $res.Lines) { Write-Output ("Y={0,5} | {1}" -f ($y + [int]($line.Words[0].BoundingRect.Y / $scale)), $line.Text) }
  $st.Dispose()
}
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
