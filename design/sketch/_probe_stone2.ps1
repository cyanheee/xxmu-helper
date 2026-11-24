param([string]$src, [string]$label, [int]$gy0, [int]$gy1)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
$W = $bmp.Width; $H = $bmp.Height
function Y($c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }

Write-Output "===== $label stone hunt y $gy0..$gy1 ====="
# 1) find the brightest pixel in the left-top corner region of the plate bar
$best = -1; $bx = 0; $by = 0; $bc = $bmp.GetPixel(0, 0)
for ($y = $gy0; $y -le $gy1; $y++) {
  for ($x = 0; $x -le 60; $x++) {
    $c = $bmp.GetPixel($x, $y); $v = Y $c
    if ($v -gt $best) { $best = $v; $bx = $x; $by = $y; $bc = $c }
  }
}
Write-Output ("  corner brightest ({0},{1}) = {2} Y={3}" -f $bx, $by, (Hex $bc), [math]::Round($best, 1))

# 2) find where the plate bar truly starts: darkest long run at x=200
$minY = 999; $minRow = 0
for ($y = 600; $y -lt 800; $y++) {
  $c = $bmp.GetPixel(200, $y); $v = Y $c
  if ($v -lt $minY) { $minY = $v; $minRow = $y }
}
Write-Output ("  darkest row at x=200: y={0} Y={1}" -f $minRow, [math]::Round($minY, 1))

# 3) ASCII of stone window centered on brightest
$x0 = [math]::Max(0, $bx - 14); $x1 = [math]::Min($W - 1, $bx + 14)
$y0 = [math]::Max(0, $by - 6); $y1 = [math]::Min($H - 1, $by + 8)
Write-Output ("-- ASCII x {0}..{1}, y {2}..{3} --" -f $x0, $x1, $y0, $y1)
for ($y = $y0; $y -le $y1; $y++) {
  $line = ""
  for ($x = $x0; $x -le $x1; $x++) {
    $v = Y ($bmp.GetPixel($x, $y))
    if ($v -ge 200) { $line += "@" } elseif ($v -ge 140) { $line += "O" } elseif ($v -ge 90) { $line += "o" } elseif ($v -ge 50) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

# 4) stone diameter: count pixels within 12 luminance of peak
$n = 0
for ($y = $y0; $y -le $y1; $y++) {
  for ($x = $x0; $x -le $x1; $x++) {
    if ((Y ($bmp.GetPixel($x, $y))) -ge ($best - 12)) { $n++ }
  }
}
Write-Output ("  near-peak pixels (within 12) = {0}  -> approx diameter {1}px" -f $n, [math]::Round([math]::Sqrt($n) / 0.886, 1))

# 5) ratio vs bar bg sampled just right of stone
$bg = $bmp.GetPixel([math]::Min($W - 1, $bx + 26), $by + 6)
Write-Output ("  bar bg ({0},{1}) = {2} Y={3} -> ratio {4}x" -f [math]::Min($W - 1, $bx + 26), ($by + 6), (Hex $bg), [math]::Round((Y $bg), 1), [math]::Round($best / [math]::Max(1, (Y $bg)), 2))

$bmp.Dispose(); $img.Dispose()
