param([string]$src, [string]$label, [int]$barTop = 0)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
function Y($c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }

Write-Output "===== $label (barTop=$barTop) ====="
if ($barTop -eq 0) {
  $rows = @()
  for ($y = 630; $y -le 790; $y++) { if ((Y ($bmp.GetPixel(200, $y))) -lt 26) { $rows += $y } }
  $barTop = $rows[0]
  Write-Output ("auto barTop={0}" -f $barTop)
}

Write-Output "-- stone window x 22..36, y (barTop-6)..(barTop+6), full hex dump of brightest --"
$best = 0; $bx = 0; $by = 0; $bc = $bmp.GetPixel(0, 0)
for ($y = $barTop - 7; $y -le $barTop + 7; $y++) {
  for ($x = 20; $x -le 40; $x++) {
    $c = $bmp.GetPixel($x, $y); $v = Y $c
    if ($v -gt $best) { $best = $v; $bx = $x; $by = $y; $bc = $c }
  }
}
Write-Output ("  brightest ({0},{1}) {2} Y={3}" -f $bx, $by, (Hex $bc), [math]::Round($best, 1))
Write-Output "-- stone map (Y buckets) --"
for ($y = $barTop - 8; $y -le $barTop + 8; $y++) {
  $line = ""
  for ($x = 16; $x -le 44; $x++) {
    $v = Y ($bmp.GetPixel($x, $y))
    if ($v -ge 210) { $line += "@" } elseif ($v -ge 160) { $line += "O" } elseif ($v -ge 110) { $line += "o" } elseif ($v -ge 60) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

Write-Output "-- global anchors --"
$anch = @(
  @{n = "page bg (12,620)"; x = 12; y = 620 },
  @{n = "card above (200,600)"; x = 200; y = 600 },
  @{n = "bar fill (200,bar+8)"; x = 200; y = $barTop + 8 },
  @{n = "sheet top (200,bar+60)"; x = 200; y = $barTop + 60 },
  @{n = "sheet mid (200,940)"; x = 200; y = 940 },
  @{n = "sheet low (200,985)"; x = 200; y = 985 },
  @{n = "card below (200,1100)"; x = 200; y = 1100 },
  @{n = "page bg (200,1440)"; x = 200; y = 1440 }
)
foreach ($a in $anch) { $c = $bmp.GetPixel($a.x, $a.y); Write-Output ("  {0,-26} {1} Y={2}" -f $a.n, (Hex $c), [math]::Round((Y $c), 1)) }

Write-Output "-- moss green presence in seam band (x 8..130, y 985..1015) --"
$cnt6 = 0; $cnt10 = 0; $maxg = -99; $mg = $bmp.GetPixel(0, 0)
for ($y = 985; $y -le 1015; $y++) {
  for ($x = 8; $x -le 130; $x++) {
    $c = $bmp.GetPixel($x, $y); $g = $c.G - [math]::Max($c.R, $c.B)
    if ($g -ge 6) { $cnt6++ }
    if ($g -ge 10) { $cnt10++ }
    if ($g -gt $maxg) { $maxg = $g; $mg = $c }
  }
}
Write-Output ("  Gexcess>=6: {0} px ; >=10: {1} px ; max={2} at {3}" -f $cnt6, $cnt10, $maxg, (Hex $mg))

$bmp.Dispose(); $img.Dispose()
