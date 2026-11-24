param([string]$Path)
Add-Type -AssemblyName System.Drawing
$full = [System.IO.Path]::GetFullPath((Join-Path 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app' $Path))
$bmp = [System.Drawing.Bitmap]::new($full)
"size = {0} x {1}" -f $bmp.Width, $bmp.Height
function MeanY([System.Drawing.Bitmap]$b,[int]$x0,[int]$y0,[int]$w,[int]$h,[string]$name){
  $sum=0.0; $n=0
  for($y=$y0;$y -lt ($y0+$h);$y++){
    for($x=$x0;$x -lt ($x0+$w);$x++){
      $p=$b.GetPixel($x,$y)
      $sum = $sum + (0.2126*$p.R + 0.7152*$p.G + 0.0722*$p.B)
      $n = $n + 1
    }
  }
  "{0,-24} meanY={1,7:N1}  center={2}" -f $name, ($sum/$n), ($b.GetPixel([int]($x0+$w/2),[int]($y0+$h/2)).Name)
}
# 纵向扫描：找课表网格真正的行位置
"--- vertical scan x=100 (card column) ---"
for($y=380;$y -lt 700;$y+=10){
  $p=$bmp.GetPixel(100,$y)
  "y={0,4}  {1}" -f $y, $p.Name
}
$bmp.Dispose()
