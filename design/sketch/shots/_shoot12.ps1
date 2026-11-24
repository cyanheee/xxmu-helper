# 批量出 12 张 colorfix-* 实拍（六状态 × 浅深）
# 用法： powershell -NoProfile -ExecutionPolicy Bypass -File design\sketch\shots\_shoot12.ps1
$ErrorActionPreference = 'Stop'
$root   = 'C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$script = Join-Path $root 'design\sketch\shoot-nova-one.ps1'

$states = @(
  @{ Name = 'kb';     Organ = '' },
  @{ Name = 'tape';   Organ = 'tape' },
  @{ Name = 'wiki';   Organ = 'wiki' },
  @{ Name = 'campus'; Organ = 'campus' },
  @{ Name = 'me';     Organ = 'me' },
  @{ Name = 'pop';    Organ = 'pop' }
)
$themes = @('light', 'dark')

foreach ($t in $themes) {
  foreach ($s in $states) {
    $tag = 'colorfix-' + $s.Name + '-' + $t
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$script,'-Tag',$tag,'-Theme',$t,'-Skin','nova')
    if ($s.Organ -ne '') { $args += @('-Organ', $s.Organ) }
    & powershell @args
  }
}
