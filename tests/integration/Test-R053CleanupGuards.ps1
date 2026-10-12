# Execute the maintained cleanup blocks only; no PostgreSQL or migrations.
$ErrorActionPreference='Stop'
$originalTemp=$env:TEMP; $originalTmp=$env:TMP
$ownedBase=Join-Path ([IO.Path]::GetTempPath()) ('mw-r053-cleanup-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $ownedBase | Out-Null
$hidden=Join-Path $ownedBase 'hidden-parent'
New-Item -ItemType Directory -Path $hidden | Out-Null
[IO.File]::SetAttributes($hidden,[IO.FileAttributes]::Hidden)
$checks=0
try {
 foreach($file in @('Run-Phase8.ps1','Run-R053OperatorIndependent.ps1','Run-R053JobsCatalogueIndependent.ps1')){
  $source=Get-Content -LiteralPath (Join-Path $PSScriptRoot $file) -Raw
  $start=$source.IndexOf('$resolved=[IO.Path]::GetFullPath($fixtureRoot)')
  $end=$source.IndexOf('Write-Host "Owned Phase8 loopback fixture stopped and removed:', $start)
  if($start -lt 0 -or $end -le $start){throw 'Exact maintained cleanup block not found'}
  $cleanup=[scriptblock]::Create($source.Substring($start,$end-$start))
  $env:TEMP=$hidden; $env:TMP=$hidden
  $token=[guid]::NewGuid().ToString('N');$fixtureRoot=Join-Path $hidden ('mw-phase8-'+$token)
  New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
  [IO.File]::SetAttributes($fixtureRoot,[IO.FileAttributes]::Hidden)
  $child=Join-Path $fixtureRoot 'hidden-child';New-Item -ItemType Directory -Path $child | Out-Null;[IO.File]::SetAttributes($child,[IO.FileAttributes]::Hidden)
  & $cleanup
  if(Test-Path -LiteralPath $fixtureRoot){throw 'Hidden owned tree was not removed'};$checks++
  # A hidden linked child must still stop deletion, including its target.
  $token=[guid]::NewGuid().ToString('N');$fixtureRoot=Join-Path $hidden ('mw-phase8-'+$token)
  New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
  $target=Join-Path $ownedBase ('target-'+$token);New-Item -ItemType Directory -Path $target | Out-Null
  $link=Join-Path $fixtureRoot 'linked-child';New-Item -ItemType Junction -Path $link -Target $target | Out-Null
  $refused=$false;try{& $cleanup}catch{if($_.Exception.Message -ne 'Cleanup child link refused'){throw};$refused=$true}
  if(-not $refused -or -not(Test-Path -LiteralPath $fixtureRoot) -or -not(Test-Path -LiteralPath $target)){throw 'Linked child was not safely refused'};$checks++
  # Remove only the exact junction, then the exact verified owned directories.
  Remove-Item -LiteralPath $link -Force
  & $cleanup
  Remove-Item -LiteralPath $target -Force
 }
 Write-Host "Maintained hidden-parent cleanup and linked-child guards passed $checks/6; no SQL executed."
} finally {
 $env:TEMP=$originalTemp; $env:TMP=$originalTmp
 $resolvedBase=[IO.Path]::GetFullPath($ownedBase)
 if((Split-Path $resolvedBase -Leaf) -notmatch '^mw-r053-cleanup-[a-f0-9]{32}$'){throw 'Test scratch containment refused'}
 if(Get-ChildItem -LiteralPath $resolvedBase -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Retained link prevents test scratch cleanup'}
 Remove-Item -LiteralPath $resolvedBase -Recurse -Force
}
