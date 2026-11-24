param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y,
  [Parameter(Mandatory=$true)][int]$W,
  [Parameter(Mandatory=$true)][int]$H,
  [string]$Name = ''
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile($In)

function Lum([System.Drawing.Color]$c) {
  $f = { param($v) $s = $v / 255.0; if ($s -le 0.03928) { return $s / 12.92 } else { return [math]::Pow((($s + 0.055) / 1.055), 2.4) } }
  return 0.2126 * (& $f $c.R) + 0.7152 * (& $f $c.G) + 0.0722 * (& $f $c.B)
}

$minL = 999.0; $maxL = -1.0
$minC = $null; $maxC = $null
$hist = @{}
for ($yy = $Y; $yy -lt ($Y + $H); $yy++) {
  for ($xx = $X; $xx -lt ($X + $W); $xx++) {
    if ($xx -lt 0 -or $yy -lt 0 -or $xx -ge $img.Width -or $yy -ge $img.Height) { continue }
    $c = $img.GetPixel($xx, $yy)
    $l = Lum $c
    if ($l -lt $minL) { $minL = $l; $minC = $c }
    if ($l -gt $maxL) { $maxL = $l; $maxC = $c }
    $k = ('{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B)
    if ($hist.ContainsKey($k)) { $hist[$k]++ } else { $hist[$k] = 1 }
  }
}
$ratio = ($maxL + 0.05) / ($minL + 0.05)
$top = $hist.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 3
$topTxt = ($top | ForEach-Object { "$($_.Name)($($_.Value))" }) -join ' '
Write-Output ("[{0}] region {1},{2} {3}x{4}" -f $Name, $X, $Y, $W, $H)
Write-Output ("  dark  #{0:X2}{1:X2}{2:X2}  L={3:N4}" -f $minC.R, $minC.G, $minC.B, $minL)
Write-Output ("  light #{0:X2}{1:X2}{2:X2}  L={3:N4}" -f $maxC.R, $maxC.G, $maxC.B, $maxL)
Write-Output ("  contrast = {0:N2}:1" -f $ratio)
Write-Output ("  top colors: {0}" -f $topTxt)
$img.Dispose()
