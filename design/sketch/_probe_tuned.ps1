param([string]$src, [string]$label, [int]$barTop)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
function Y($c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }

Write-Output "===== $label barTop=$barTop ====="

# stone should be at CSS left:13 top:-5 => screen x ~13..20, y barTop-5..barTop+2
Write-Output "-- stone ASCII x 6..30, y (barTop-9)..(barTop+5) --"
$best = -1; $bx = 0; $by = 0; $bc = $bmp.GetPixel(0, 0)
for ($y = $barTop - 9; $y -le $barTop + 5; $y++) {
  $line = ""
  for ($x = 6; $x -le 30; $x++) {
    $c = $bmp.GetPixel($x, $y); $v = Y $c
    if ($v -gt $best) { $best = $v; $bx = $x; $by = $y; $bc = $c }
    if ($v -ge 200) { $line += "@" } elseif ($v -ge 150) { $line += "O" } elseif ($v -ge 100) { $line += "o" } elseif ($v -ge 55) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}
Write-Output ("  stone peak ({0},{1}) = {2} Y={3}" -f $bx, $by, (Hex $bc), [math]::Round($best, 1))

# local contrast: stone vs surrounding bar
$barBg = $bmp.GetPixel(60, $barTop + 12)
Write-Output ("  bar bg (60,{0}) = {1} Y={2}  -> stone/bar luminance ratio = {3}x" -f ($barTop + 12), (Hex $barBg), [math]::Round((Y $barBg), 1), [math]::Round($best / [math]::Max(1, (Y $barBg)), 2))

# sheet top vs page: where does the warm paper start?
Write-Output "-- sheet vs page: vertical x=200 from barTop+40 to barTop+340 --"
for ($y = $barTop + 40; $y -le $barTop + 340; $y += 20) {
  $c = $bmp.GetPixel(200, $y)
  $warm = $c.R - $c.B
  Write-Output ("y={0,4} {1} Y={2} warm(R-B)={3}" -f $y, (Hex $c), [math]::Round((Y $c), 1), $warm)
}

$bmp.Dispose(); $img.Dispose()
