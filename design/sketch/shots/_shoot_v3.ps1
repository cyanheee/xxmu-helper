param([string]$Only='')

$root='C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$shoot=$root+'\design\sketch\shoot-nova-one.ps1'

$pages=@(
  @{n='kb';    o=''},
  @{n='tape';  o='tape'},
  @{n='campus';o='campus'},
  @{n='me';    o='me'},
  @{n='wiki';  o='wiki'},
  @{n='pop';   o='pop'},
  @{n='swipe'; o='swipe'}
)

foreach($t in @('light','dark')){
  foreach($p in $pages){
    if($Only -ne '' -and $Only -ne $p.n){ continue }
    $tag='v3-'+$p.n+'-'+$t
    if($p.o -eq ''){
      & powershell -NoProfile -ExecutionPolicy Bypass -File $shoot -Tag $tag -Theme $t -Skin nova
    } else {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $shoot -Tag $tag -Theme $t -Skin nova -Organ $p.o
    }
  }
}
