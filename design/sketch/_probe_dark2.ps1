param([string]$src)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img

function Y($c) { return [math]::Round((0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B), 1) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }

Write-Output "=== LED row full search y 700..740, x 270..378 ==="
for ($y = 700; $y -le 742; $y += 2) {
  $line = ""
  for ($x = 270; $x -le 378; $x += 2) {
    $c = $bmp.GetPixel($x, $y)
    $v = Y $c
    if ($v -ge 190) { $line += "@" } elseif ($v -ge 130) { $line += "O" } elseif ($v -ge 85) { $line += "o" } elseif ($v -ge 52) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

Write-Output "=== moss hunt: green excess scan y 960..1040 step 2, x 4..130 step 2 ==="
for ($y = 960; $y -le 1042; $y += 2) {
  $line = ""
  $best = 0
  for ($x = 4; $x -le 130; $x += 2) {
    $c = $bmp.GetPixel($x, $y)
    $g = $c.G - [math]::Max($c.R, $c.B)
    if ($g -gt $best) { $best = $g }
    if ($g -ge 10) { $line += "G" } elseif ($g -ge 4) { $line += "g" } else { $line += "." }
  }
  Write-Output ("y={0,4} maxG={1,3} {2}" -f $y, $best, $line)
}

Write-Output "=== plate sheet vertical scan x=200 y=760..1050 step 10 ==="
for ($y = 760; $y -le 1050; $y += 10) {
  $c = $bmp.GetPixel(200, $y)
  Write-Output ("y={0,4} {1} Y={2}" -f $y, (Hex $c), (Y $c))
}

Write-Output "=== compare: plate sheet vs sibling card (same page) ==="
$pairs = @(
  @{n = "plate sheet interior"; x = 200; y = 850 },
  @{n = "plate sheet interior2"; x = 200; y = 980 },
  @{n = "sibling card 设置"; x = 200; y = 1150 },
  @{n = "sibling card 设置2"; x = 200; y = 1250 },
  @{n = "page bg"; x = 200; y = 1400 }
)
foreach ($p in $pairs) {
  $c = $bmp.GetPixel($p.x, $p.y)
  Write-Output ("{0,-24} {1} Y={2}" -f $p.n, (Hex $c), (Y $c))
}

$bmp.Dispose(); $img.Dispose()
