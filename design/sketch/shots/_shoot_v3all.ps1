$root='C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$shoot=$root+'\design\sketch\shoot-nova-one.ps1'

$pages=@(
  @{n='kb';          o=''},
  @{n='tape';        o='tape'},
  @{n='campus';      o='campus'},
  @{n='me';          o='me'},
  @{n='wiki';        o='wiki'},
  @{n='pop';         o='pop'},
  @{n='swipe';       o='swipe'}
)

foreach($t in @('light','dark')){
  foreach($p in $pages){
    $tag='v3-'+$p.n+'-'+$t
    if($p.o -eq ''){
      & powershell -NoProfile -ExecutionPolicy Bypass -File $shoot -Tag $tag -Theme $t -Skin nova
    } else {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $shoot -Tag $tag -Theme $t -Skin nova -Organ $p.o
    }
  }
}

$extras=@(
  @{n='pixel';       t='light'},
  @{n='rain';        t='light'},
  @{n='doodle';      t='light'},
  @{n='polaroid';    t='light'},
  @{n='clipopen';    t='light'},
  @{n='ticketbound'; t='light'},
  @{n='pixel';       t='dark'},
  @{n='rain';        t='dark'},
  @{n='doodle';      t='dark'},
  @{n='polaroid';    t='dark'},
  @{n='clipopen';    t='dark'},
  @{n='ticketbound'; t='dark'}
)
foreach($j in $extras){
  $tag='v3-'+$j.n+'-'+$j.t
  & powershell -NoProfile -ExecutionPolicy Bypass -File $shoot -Tag $tag -Theme $j.t -Skin nova -Organ $j.n
}
