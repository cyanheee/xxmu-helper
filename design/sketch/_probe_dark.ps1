param([string]$src)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
$W = $bmp.Width
$H = $bmp.Height
Write-Output ("size {0}x{1}" -f $W, $H)

function Y($c) { return [math]::Round((0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B), 1) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }

Write-Output "=== A. stone (search bright blob near x 10..30, y 690..700) ==="
for ($y = 686; $y -le 702; $y++) {
  $line = ""
  for ($x = 8; $x -le 34; $x++) {
    $c = $bmp.GetPixel($x, $y)
    $v = Y $c
    if ($v -ge 200) { $line += "@" } elseif ($v -ge 140) { $line += "O" } elseif ($v -ge 90) { $line += "o" } elseif ($v -ge 55) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

Write-Output "=== B. LED row (x 280..375, y 692..714) sample every 2px ==="
for ($y = 690; $y -le 716; $y += 2) {
  $line = ""
  for ($x = 278; $x -le 376; $x += 2) {
    $c = $bmp.GetPixel($x, $y)
    $v = Y $c
    if ($v -ge 200) { $line += "@" } elseif ($v -ge 140) { $line += "O" } elseif ($v -ge 90) { $line += "o" } elseif ($v -ge 55) { $line += "-" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

Write-Output "=== C. plate bar bg vs sheet vs page card ==="
$pts = @(
  @{n = "page bg (x=8,y=660)"; x = 8; y = 660 },
  @{n = "card above (x=200,y=560)"; x = 200; y = 560 },
  @{n = "plate bar (x=200,y=706)"; x = 200; y = 706 },
  @{n = "plate bar right (x=360,y=706)"; x = 360; y = 706 },
  @{n = "sheet top (x=200,y=772)"; x = 200; y = 772 },
  @{n = "sheet mid (x=200,y=900)"; x = 200; y = 900 },
  @{n = "sheet bottom (x=200,y=1010)"; x = 200; y = 1010 },
  @{n = "sheet left edge (x=18,y=900)"; x = 18; y = 900 },
  @{n = "page below sheet (x=200,y=1046)"; x = 200; y = 1046 },
  @{n = "next card (x=200,y=1120)"; x = 200; y = 1120 }
)
foreach ($p in $pts) {
  $c = $bmp.GetPixel($p.x, $p.y)
  Write-Output ("{0,-32} {1}  Y={2}" -f $p.n, (Hex $c), (Y $c))
}

Write-Output "=== D. moss in dark (x 6..120, y 1040..1056) ==="
for ($y = 1038; $y -le 1058; $y += 2) {
  $line = ""
  for ($x = 6; $x -le 124; $x += 2) {
    $c = $bmp.GetPixel($x, $y)
    $g = $c.G - [math]::Max($c.R, $c.B)
    if ($g -ge 12) { $line += "G" } elseif ($g -ge 5) { $line += "g" } else { $line += "." }
  }
  Write-Output ("y={0,4} {1}" -f $y, $line)
}

$bmp.Dispose(); $img.Dispose()
