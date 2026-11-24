param([string]$src, [string]$label)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
$W = $bmp.Width; $H = $bmp.Height
function Y($c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) }
function Hex($c) { return ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B) }

Write-Output "===== $label surface separation ====="
$pts = @(
  @("page bg left margin", 6, 900),
  @("page bg right margin", 384, 900),
  @("page bg between cards", 6, 1040),
  @("plate bar fill", 200, 700),
  @("sheet interior TOP", 200, 790),
  @("sheet interior MID", 200, 880),
  @("sheet interior LOW", 200, 975),
  @("sheet left edge in", 14, 900),
  @("sheet right edge in", 372, 900),
  @("card ABOVE sheet", 200, 640),
  @("card BELOW sheet", 200, 1090),
  @("card BELOW2", 200, 1200)
)
foreach ($p in $pts) {
  $x = [math]::Min($W - 1, [math]::Max(0, [int]$p[1]))
  $y = [math]::Min($H - 1, [math]::Max(0, [int]$p[2]))
  $c = $bmp.GetPixel($x, $y)
  Write-Output ("  {0,-22} ({1},{2}) {3} Y={4}" -f $p[0], $x, $y, (Hex $c), [math]::Round((Y $c), 1))
}

# row scan at y=900 to find plate left/right border and page gap
Write-Output "-- row scan y=900, every 12px --"
for ($x = 0; $x -lt $W; $x += 12) {
  $c = $bmp.GetPixel($x, 900)
  Write-Output ("  x={0,3} {1} Y={2}" -f $x, (Hex $c), [math]::Round((Y $c), 1))
}

$bmp.Dispose(); $img.Dispose()
