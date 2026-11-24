param(
  [Parameter(Mandatory=$true)][string]$In,
  [string]$Name = '',
  [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0,
  [double]$MinRatio = 1.6,
  [int]$MaxRows = 30
)

Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap($In)
if ($W -le 0) { $W = $bmp.Width - $X }
if ($H -le 0) { $H = $bmp.Height - $Y }
if ($X -lt 0) { $X = 0 }
if ($Y -lt 0) { $Y = 0 }
if (($X + $W) -gt $bmp.Width)  { $W = $bmp.Width - $X }
if (($Y + $H) -gt $bmp.Height) { $H = $bmp.Height - $Y }

function Get-Lum([int]$r, [int]$g, [int]$b) {
  $f = @($r, $g, $b) | ForEach-Object {
    $c = $_ / 255.0
    if ($c -le 0.03928) { $c / 12.92 } else { [Math]::Pow((($c + 0.055) / 1.055), 2.4) }
  }
  return 0.2126 * $f[0] + 0.7152 * $f[1] + 0.0722 * $f[2]
}

function Get-Ratio([double]$l1, [double]$l2) {
  $a = [Math]::Max($l1, $l2); $b = [Math]::Min($l1, $l2)
  return ($a + 0.05) / ($b + 0.05)
}

Write-Output ("[{0}] {1}  region {2},{3} {4}x{5}" -f $Name, (Split-Path $In -Leaf), $X, $Y, $W, $H)

$rows = New-Object System.Collections.ArrayList

for ($y = $Y; $y -lt ($Y + $H); $y++) {
  $hist = @{}
  for ($x = $X; $x -lt ($X + $W); $x++) {
    $p = $bmp.GetPixel($x, $y)
    $k = ('{0},{1},{2}' -f $p.R, $p.G, $p.B)
    if ($hist.ContainsKey($k)) { $hist[$k] = $hist[$k] + 1 } else { $hist[$k] = 1 }
  }
  $bgKey = $null; $bgN = -1
  foreach ($k in $hist.Keys) { if ($hist[$k] -gt $bgN) { $bgN = $hist[$k]; $bgKey = $k } }
  $bp = $bgKey -split ','
  $bgL = Get-Lum ([int]$bp[0]) ([int]$bp[1]) ([int]$bp[2])

  $bestRatio = 1.0; $bestFg = $bgKey; $bestN = 0
  foreach ($k in $hist.Keys) {
    $kp = $k -split ','
    $rl = Get-Lum ([int]$kp[0]) ([int]$kp[1]) ([int]$kp[2])
    $r = Get-Ratio $bgL $rl
    if ($r -gt $bestRatio) { $bestRatio = $r; $bestFg = $k; $bestN = $hist[$k] }
  }

  if ($bestRatio -ge $MinRatio) {
    $fgp = $bestFg -split ','
    [void]$rows.Add([pscustomobject]@{
      Y = $y
      Bg = ('#{0:X2}{1:X2}{2:X2}' -f [int]$bp[0], [int]$bp[1], [int]$bp[2])
      Fg = ('#{0:X2}{1:X2}{2:X2}' -f [int]$fgp[0], [int]$fgp[1], [int]$fgp[2])
      Ratio = [Math]::Round($bestRatio, 2)
      Px = $bestN
    })
  }
}

$bmp.Dispose()

if ($rows.Count -eq 0) {
  Write-Output "  (no row above ratio $MinRatio -> uniform / blank region)"
  return
}

$show = $rows | Select-Object -First $MaxRows
foreach ($r in $show) {
  Write-Output ("  y={0,-5} bg={1} fg={2} ratio={3,-6} px={4}" -f $r.Y, $r.Bg, $r.Fg, $r.Ratio, $r.Px)
}
$max = ($rows | Measure-Object -Property Ratio -Maximum).Maximum
Write-Output ("  -- rows={0}  maxRatio={1}" -f $rows.Count, $max)
