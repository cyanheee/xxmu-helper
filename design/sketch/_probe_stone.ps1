param([string]$src, [string]$label)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
function Y($c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }
function Gx($c) { return ($c.G - [math]::Max($c.R, $c.B)) }

Write-Output "===== $label ====="
# locate the dark bar: at x=200 find contiguous rows whose Y<26 (bar fill) inside y 640..760
$barRows = @()
for ($y = 630; $y -le 780; $y++) {
  $v = Y ($bmp.GetPixel(200, $y))
  if ($v -lt 26) { $barRows += $y }
}
if ($barRows.Count -gt 0) {
  Write-Output ("bar rows at x=200: {0}..{1}" -f $barRows[0], $barRows[-1])
} else { Write-Output "bar not found"; }

# stone search: whole area above/at bar top-left
$top = if ($barRows.Count -gt 0) { $barRows[0] } else { 700 }
$bestV = 0; $bx = 0; $by = 0; $bc = $bmp.GetPixel(0, 0)
for ($y = $top - 14; $y -le $top + 8; $y++) {
  for ($x = 4; $x -le 60; $x++) {
    $c = $bmp.GetPixel($x, $y); $v = Y $c
    if ($v -gt $bestV) { $bestV = $v; $bx = $x; $by = $y; $bc = $c }
  }
}
Write-Output ("stone brightest ({0},{1}) {2} Y={3} Gx={4}" -f $bx, $by, (Hex $bc), [math]::Round($bestV, 1), (Gx $bc))

# ASCII map around bar top-left
Write-Output "-- map x 0..64 y (top-12)..(top+26) --"
for ($y = $top - 12; $y -le $top + 26; $y += 1) {
  $line = ""
  for ($x = 0; $x -le 64; $x += 2) {
    $c = $bmp.GetPixel($x, $y); $v = Y $c
    if ($v -ge 170) { $line += "@" } elseif ($v -ge 110) { $line += "O" } elseif ($v -ge 70) { $line += "o" } elseif ($v -ge 40) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

# sheet top highlight delta: vertical scan from bar bottom down
$sheetTop = $top + 40
Write-Output "-- sheet top gradient x=200 --"
for ($y = $sheetTop - 6; $y -le $sheetTop + 46; $y += 4) {
  $c = $bmp.GetPixel(200, $y)
  Write-Output ("y={0,4} {1} Y={2}" -f $y, (Hex $c), [math]::Round((Y $c), 1))
}

# moss chroma in the seam band: find darkest row 940..1060 then scan
$minY = 999; $minV = 999
for ($y = 940; $y -le 1060; $y++) { $v = Y ($bmp.GetPixel(200, $y)); if ($v -lt $minV) { $minV = $v; $minY = $y } }
Write-Output ("seam row y={0} Y={1}" -f $minY, [math]::Round($minV, 1))
$maxG = -99; $sumR = 0.0; $sumG = 0.0; $sumB = 0.0; $n = 0
for ($y = $minY - 8; $y -le $minY + 8; $y++) {
  for ($x = 10; $x -le 120; $x++) {
    $c = $bmp.GetPixel($x, $y)
    $g = Gx $c; if ($g -gt $maxG) { $maxG = $g }
    $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $n++
  }
}
Write-Output ("seam moss band mean RGB = {0}/{1}/{2}  maxGreenExcess={3}" -f [math]::Round($sumR / $n, 1), [math]::Round($sumG / $n, 1), [math]::Round($sumB / $n, 1), $maxG)

$bmp.Dispose(); $img.Dispose()
