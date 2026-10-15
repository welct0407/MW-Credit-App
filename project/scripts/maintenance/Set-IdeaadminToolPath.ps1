[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference='Stop'
if($env:USERPROFILE -ne 'C:\Users\ideaadmin'){throw 'This VM-01 setup is scoped to ideaadmin'}
$toolPaths=@(
 'C:\Users\ideaadmin\AppData\Local\MWCredit\tools\node-v24.21.0-win-x64',
 'C:\Users\ideaadmin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python',
 'C:\Users\ideaadmin\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd',
 'C:\Users\ideaadmin\AppData\Local\MWCredit\tools\gh\bin',
 'C:\Users\ideaadmin\AppData\Local\MWCredit\tools\terraform',
 'C:\Users\ideaadmin\AppData\Local\MWCredit\tools\functions',
 'C:\Users\ideaadmin\.azure\bin',
 'C:\Users\ideaadmin\AppData\Local\MWCredit\database-tools\postgresql-18.6-3\pgsql\bin',
 'C:\Users\ideaadmin\AppData\Local\MWCredit\database-tools\flyway-13.6.0',
 'C:\Users\ideaadmin\AppData\Local\MWCredit\database-tools\flyway-13.6.0\jre\bin',
 'C:\GitHub\MW-Partner-Operations\local\bin'
)
foreach($p in $toolPaths){if(-not(Test-Path -LiteralPath $p -PathType Container)){throw "Tool directory missing: $p"}}
$before=[Environment]::GetEnvironmentVariable('Path','User')
$entries=[Collections.Generic.List[string]]::new()
foreach($p in @($toolPaths)+@($before -split ';')){
 if($p -and -not $entries.Contains($p)){[void]$entries.Add($p)}
}
$after=$entries -join ';'
if($after -match 'Users[\\/]MWCredit'){throw 'User PATH still includes the retired profile'}
if($Apply){
 $backup='C:\Users\ideaadmin\Documents\ideaadmin-independent-20261011\user-path-before.txt'
 if(-not(Test-Path -LiteralPath $backup)){[IO.File]::WriteAllText($backup,$before)}
 [Environment]::SetEnvironmentVariable('Path',$after,'User')
 if([Environment]::GetEnvironmentVariable('Path','User') -ne $after){throw 'User PATH readback failed'}
 $env:PATH=($toolPaths -join ';')+';'+$env:PATH
}
[pscustomobject]@{Applied=[bool]$Apply;VerifiedToolDirectories=$toolPaths.Count;UserPathContainsMWCreditProfile=$false}
