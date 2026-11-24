param([string]$src,[string]$label,[int]$y0=650,[int]$y1=1080)
# moss hunt: Gexcess = G - (R+B)/2 over the plate region, find where green actually lands
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
$W = $bmp.Width
$H = $bmp.Height
Write-Output ("===== " + $label + " moss hunt y " + $y0 + ".." + $y1 + " =====")
$maxg = -999
$mx = 0
$my = 0
$cnt6 = 0
$cnt10 = 0
$cnt16 = 0
$map = @{}
for($y = $y0; $y -le $y1; $y++){
  for($x = 0; $x -lt $W; $x++){
    $c = $bmp.GetPixel($x, $y)
    $ge = $c.G - ($c.R + $c.B)/2.0
    if($ge -ge 6){
      $cnt6++
      if($ge -ge 10){ $cnt10++ }
      if($ge -ge 16){ $cnt16++ }
    }
    if($ge -gt $maxg){ $maxg = $ge; $mx = $x; $my = $y }
    if($ge -ge 8){
      $bx = [int]($x/20)
      $by = [int]($y/20)
      $k = "" + $bx + "," + $by
      if($map.ContainsKey($k)){ $map[$k] = $map[$k] + 1 } else { $map[$k] = 1 }
    }
  }
}
$mc = $bmp.GetPixel($mx, $my)
Write-Output ("  Gexcess>=6: " + $cnt6 + " px , >=10: " + $cnt10 + " px , >=16: " + $cnt16 + " px")
Write-Output ("  max " + [math]::Round($maxg,1) + " at (" + $mx + "," + $my + ") " + ("#{0:X2}{1:X2}{2:X2}" -f $mc.R,$mc.G,$mc.B))
Write-Output "  -- 20px cell heat (count of Gexcess>=8) --"
foreach($k in ($map.Keys | Sort-Object)){
  $p = $k.Split(",")
  Write-Output ("  cell x=" + ([int]$p[0]*20) + " y=" + ([int]$p[1]*20) + " -> " + $map[$k] + " px")
}
$img.Dispose()
$bmp.Dispose()
