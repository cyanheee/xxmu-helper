param([string]$src,[string]$label)
# 深色档二次验收：①石头在正确坐标的亮度比与形状 ②苔藓 Gexcess 计数 ③sheet 暖度
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile($src)
$bmp=New-Object System.Drawing.Bitmap $img
$W=$bmp.Width; $H=$bmp.Height
function Y($c){ 0.2126*$c.R + 0.7152*$c.G + 0.0722*$c.B }
function GA([int]$x,[int]$y){
  $x=[math]::Max(0,[math]::Min($W-1,$x)); $y=[math]::Max(0,[math]::Min($H-1,$y))
  if($x -lt 0 -or $y -lt 0 -or $x -ge $W -or $y -ge $H){ return $null }
  return $bmp.GetPixel($x,$y)
}
Write-Output ("===== " + $label + " (ghibli dark v2) =====")

# ① 石头：在铭牌条左上角区域 x 14..38 / y 684..706 找最亮
$best=$null; $bx=0; $by=0
for($y=680;$y -le 710;$y++){
  for($x=12;$x -le 40;$x++){
    $c=GA $x $y
    if($null -eq $c){continue}
    if($null -eq $best -or (Y $c) -gt (Y $best)){ $best=$c; $bx=$x; $by=$y }
  }
}
Write-Output ("  stone peak   ($bx,$by) " + ("#{0:X2}{1:X2}{2:X2}" -f $best.R,$best.G,$best.B) + (" Y=" + [math]::Round((Y $best),1)))
$bar=GA 200 700
Write-Output ("  bar fill     (200,700) " + ("#{0:X2}{1:X2}{2:X2}" -f $bar.R,$bar.G,$bar.B) + (" Y=" + [math]::Round((Y $bar),1)))
Write-Output ("  stone/bar    " + [math]::Round(((Y $best)/(Y $bar)),2) + "x   (target 4.0~5.5x = 岩, >7x = 灯)")

# ② ASCII 石头形状
Write-Output "  -- stone ascii x 14..36 , y 684..700 --"
$cfg = " .:-=+*#%@"
for($y=684;$y -le 700;$y++){
  $row = "  y=$y "
  for($x=14;$x -le 36;$x++){
    $c=GA $x $y
    if($null -eq $c){ $row += "?"; continue }
    $v = [math]::Round((Y $c))
    $i = [math]::Min(9,[math]::Max(0,[int]([math]::Round($v/255*9))))
    $row += $cfg.Substring($i,1)
  }
  Write-Output $row
}

# ③ 苔藓：plate 左缘下方 moss band，Gexcess = G - (R+B)/2
Write-Output "  -- moss (Gexcess) : plate bar 左段 y 690..712 , x 8..46 --"
$g6=0; $g10=0; $maxg=-99; $maxc=$null
for($y=690;$y -le 712;$y++){
  for($x=8;$x -le 46;$x++){
    $c=GA $x $y
    if($null -eq $c){continue}
    $ge = $c.G - ($c.R + $c.B)/2.0
    if($ge -gt $maxg){ $maxg=$ge; $maxc=$c }
    if($ge -ge 6){ $g6++ }
    if($ge -ge 10){ $g10++ }
  }
}
Write-Output ("  Gexcess>=6 px = " + $g6 + " , >=10 px = " + $g10 + " , max = " + [math]::Round($maxg,1) + " at " + ("#{0:X2}{1:X2}{2:X2}" -f $maxc.R,$maxc.G,$maxc.B))

# ④ sheet 暖度 warm = R - B
Write-Output "  -- sheet warmth (R-B) --"
foreach($y in 780,820,860,900,940,970){
  $c=GA 200 $y
  Write-Output ("  y=$y " + ("#{0:X2}{1:X2}{2:X2}" -f $c.R,$c.G,$c.B) + (" warm=" + ($c.R - $c.B) + " Y=" + [math]::Round((Y $c),1)))
}
$sib=GA 200 1090
Write-Output ("  sibling card " + ("#{0:X2}{1:X2}{2:X2}" -f $sib.R,$sib.G,$sib.B) + (" warm=" + ($sib.R - $sib.B) + " Y=" + [math]::Round((Y $sib),1)))
$img.Dispose(); $bmp.Dispose()
