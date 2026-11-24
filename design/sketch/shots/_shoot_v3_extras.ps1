$root='C:\Users\Administrator\Desktop\xxmuhelper\xxmu-app'
$shoot=$root+'\design\sketch\shoot-nova-one.ps1'

$jobs=@(
  @{n='pixel';        t='light'},
  @{n='rain';         t='light'},
  @{n='doodle';       t='light'},
  @{n='polaroid';     t='light'},
  @{n='clipopen';     t='light'},
  @{n='ticketbound';  t='light'},
  @{n='focus';        t='light'},
  @{n='pixel';        t='dark'},
  @{n='rain';         t='dark'},
  @{n='clipopen';     t='dark'},
  @{n='doodle';       t='dark'},
  @{n='polaroid';     t='dark'}
)

foreach($j in $jobs){
  $tag='v3-'+$j.n+'-'+$j.t
  & powershell -NoProfile -ExecutionPolicy Bypass -File $shoot -Tag $tag -Theme $j.t -Skin nova -Organ $j.n
}
