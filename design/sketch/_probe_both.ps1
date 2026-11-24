param([string]$light, [string]$dark)
Add-Type -AssemblyName System.Drawing

function Y($c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }
function Gx($c) { return ($c.G - [math]::Max($c.R, $c.B)) }

function Probe($path, $label) {
  Write-Output "############ $label : $path"
  $img = [System.Drawing.Image]::FromFile($path)
  $bmp = New-Object System.Drawing.Bitmap $img

  # find the plate bottom seam: scan x=200 downward for the darkest row between 940 and 1060
  $minY = 999; $minV = 999
  for ($y = 940; $y -le 1060; $y++) {
    $c = $bmp.GetPixel(200, $y); $v = Y $c
    if ($v -lt $minV) { $minV = $v; $minY = $y }
  }
  Write-Output ("plate bottom seam row = y={0}  Y={1}" -f $minY, [math]::Round($minV, 1))

  # moss band: 12px band around seam, left segment x 12..120  vs  control x 160..268
  $sumA = 0.0; $sumB = 0.0; $n = 0
  $maxGleft = -99; $bestLeft = $null
  for ($y = $minY - 8; $y -le $minY + 8; $y++) {
    for ($x = 12; $x -le 120; $x++) {
      $c = $bmp.GetPixel($x, $y); $sumA += (Y $c); $n++
      $g = Gx $c
      if ($g -gt $maxGleft) { $maxGleft = $g; $bestLeft = $c }
    }
  }
  $cnt = 0
  for ($y = $minY - 8; $y -le $minY + 8; $y++) {
    for ($x = 160; $x -le 268; $x++) { $c = $bmp.GetPixel($x, $y); $sumB += (Y $c); $cnt++ }
  }
  Write-Output ("moss band LEFT  meanY={0}  maxGreenExcess={1} at {2}" -f [math]::Round($sumA / $n, 1), $maxGleft, (Hex $bestLeft))
  Write-Output ("moss band CNTRL meanY={0}   -> delta={1}" -f [math]::Round($sumB / $cnt, 1), [math]::Round(($sumA / $n) - ($sumB / $cnt), 1))

  # count moss-green pixels (G excess >= 6) in left band
  $gcount = 0
  for ($y = $minY - 10; $y -le $minY + 10; $y++) {
    for ($x = 8; $x -le 130; $x++) {
      if ((Gx ($bmp.GetPixel($x, $y))) -ge 6) { $gcount++ }
    }
  }
  Write-Output ("moss-green pixels (Gexcess>=6) in 23x123 left band = {0}" -f $gcount)

  # flying stone: search brightest blob in x 8..34, y (barTop-8..barTop+10)
  # bar top: find where bar starts = first row below seam-200 with distinct dark fill at x=200
  $barTop = $minY - 300
  for ($y = $minY - 340; $y -le $minY - 240; $y++) {
    $c = $bmp.GetPixel(200, $y); $v = Y $c
    if ($v -lt 30) { $barTop = $y; break }
  }
  Write-Output ("approx bar top y={0}" -f $barTop)
  $bestV = 0; $bx = 0; $by = 0; $bc = $null
  for ($y = $barTop - 10; $y -le $barTop + 14; $y++) {
    for ($x = 6; $x -le 40; $x++) {
      $c = $bmp.GetPixel($x, $y); $v = Y $c
      if ($v -gt $bestV) { $bestV = $v; $bx = $x; $by = $y; $bc = $c }
    }
  }
  Write-Output ("stone brightest px at ({0},{1}) {2} Y={3} greenExcess={4}" -f $bx, $by, (Hex $bc), [math]::Round($bestV, 1), (Gx $bc))
  # stone extent: count px with Y >= 150 within that window
  $sc = 0
  for ($y = $barTop - 10; $y -le $barTop + 14; $y++) {
    for ($x = 6; $x -le 40; $x++) { if ((Y ($bmp.GetPixel($x, $y))) -ge 150) { $sc++ } }
  }
  Write-Output ("stone pixels Y>=150 = {0}" -f $sc)

  # LED dots brightness for comparison (right side of bar)
  $bestLed = 0
  for ($y = $barTop; $y -le $barTop + 40; $y++) {
    for ($x = 270; $x -le 378; $x++) {
      $v = Y ($bmp.GetPixel($x, $y)); if ($v -gt $bestLed) { $bestLed = $v }
    }
  }
  Write-Output ("brightest status-LED Y in bar = {0}" -f [math]::Round($bestLed, 1))

  # bar fill hue
  $cb = $bmp.GetPixel(200, $barTop + 20)
  Write-Output ("bar fill (200,{0}) = {1} Y={2}" -f ($barTop + 20), (Hex $cb), [math]::Round((Y $cb), 1))
  $cs = $bmp.GetPixel(200, $minY - 40)
  Write-Output ("sheet fill (200,{0}) = {1} Y={2}" -f ($minY - 40), (Hex $cs), [math]::Round((Y $cs), 1))
  $cp = $bmp.GetPixel(200, $minY + 120)
  Write-Output ("card below (200,{0}) = {1} Y={2}" -f ($minY + 120), (Hex $cp), [math]::Round((Y $cp), 1))

  $bmp.Dispose(); $img.Dispose()
}

Probe $light "LIGHT"
Probe $dark "DARK"
