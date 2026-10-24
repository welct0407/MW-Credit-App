param([string]$TestNamePattern,[switch]$R053,[switch]$LegacyIdentity,[ValidateSet(88,89)][int]$R053Target=89,[switch]$AgentReadsOnly,[string[]]$ReadResources)
$ErrorActionPreference='Stop'
if(($R053 -or $AgentReadsOnly) -and $LegacyIdentity){throw 'Choose one exact Phase8 fixture mode'}
if($ReadResources -and -not $AgentReadsOnly){throw 'Read resource selection requires the exact read-only mode'}
if(-not $LegacyIdentity){$R053=$true}
if($env:CI -ne 'true'){. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"}
. "$PSScriptRoot/../../scripts/database/Common.ps1"
$pgBin=Get-PgBin
$token=[guid]::NewGuid().ToString('N')
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('mw-phase8-'+$token)
$data=Join-Path $fixtureRoot 'data';$database=if($R053){'loan_manager_dev'}else{'mw_phase8_'+$token}
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
Write-Host "Owned Phase8 disposable fixture: $fixtureRoot"
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$fixturePort=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false;$saved=@{}
$names=@('AGENT_READ_AUDIT_RESOURCES','PHASE8_TEST_TARGET','PHASE8_TEST_DISPOSABLE','PHASE8_TEST_HOST','PHASE8_TEST_PORT','PHASE8_TEST_DATABASE','PHASE8_TEST_USER','PHASE8_TEST_PASSWORD','PHASE8_TEST_DATA_DIRECTORY')
Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {$names+=$_.Name}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name);[Environment]::SetEnvironmentVariable($name,$null)}
try {
 & (Get-PgTool initdb) -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 Start-PgServer $data (Join-Path $fixtureRoot 'postgres.log') $fixturePort $fixtureRoot;$started=$true
 & (Get-PgTool createdb) -h 127.0.0.1 -p $fixturePort -U postgres $database
 if($LASTEXITCODE){throw 'Disposable database creation failed'}
 foreach($file in @('Test-AgentAuditPrerequisites.sql','Test-AppRolePrerequisites.sql')){
  & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d $database -f "$PSScriptRoot/../../scripts/database/$file"
  if($LASTEXITCODE){throw 'Disposable prerequisites failed'}
 }
 $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/$database";$env:FLYWAY_USER='postgres';$env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
 Push-Location $DbRepoRoot
 try {
  & (Get-FlywayPath) '-outputType=json' '-target=85' migrate | Out-File (Join-Path $fixtureRoot 'migration85.json')
  if($LASTEXITCODE){Get-Content (Join-Path $fixtureRoot 'migration85.json');throw 'V85 fixture migration failed'}
  $finalTarget=if($R053){$R053Target}else{86}
  & (Get-FlywayPath) '-outputType=json' "-target=$finalTarget" '-group=true' '-mixed=false' '-executeInTransaction=true' migrate | Out-File (Join-Path $fixtureRoot 'migration86.json')
  if($LASTEXITCODE){Get-Content (Join-Path $fixtureRoot 'migration86.json');throw 'V86 fixture migration failed'}
 } finally {Pop-Location}
 & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d $database -f "$PSScriptRoot/phase8-identity-fixture.sql"
 if($LASTEXITCODE){throw 'Synthetic identity setup failed'}
 if($R053 -and $R053Target -eq 89){
  & (Get-PgTool createdb) -h 127.0.0.1 -p $fixturePort -U postgres -T $database payment_rehearsal
  if($LASTEXITCODE){throw 'Isolated identical financial reference database creation failed'}
 }
 $env:PHASE8_TEST_TARGET=[string]$finalTarget;
 if($ReadResources){$env:AGENT_READ_AUDIT_RESOURCES=ConvertTo-Json -InputObject @($ReadResources) -Compress}
 $env:PHASE8_TEST_DISPOSABLE='1';$env:PHASE8_TEST_HOST='127.0.0.1';$env:PHASE8_TEST_PORT=[string]$fixturePort;$env:PHASE8_TEST_DATABASE=$database;$env:PHASE8_TEST_USER='postgres';$env:PHASE8_TEST_DATA_DIRECTORY=$data
 $arguments=@('--test','--test-concurrency=1');if($TestNamePattern){$arguments+=('--test-name-pattern='+$TestNamePattern)}
 if($AgentReadsOnly){& node @arguments "$PSScriptRoot/agent-conversation-read-independent.test.mjs"}
 elseif($R053){
  $testFiles=@("$PSScriptRoot/r053-rpc-independent.test.mjs","$PSScriptRoot/phase8-notifications.test.mjs","$PSScriptRoot/phase8-notifications-independent.test.mjs","$PSScriptRoot/r053-wakeup-independent.test.mjs","$PSScriptRoot/r053-worker-http-independent.test.mjs")
  if($R053Target -eq 89){$testFiles+="$PSScriptRoot/r053-agent-receipt-independent.test.mjs"}
  & node @arguments @testFiles
 }else{& node @arguments "$PSScriptRoot/production-business-independent.test.mjs"}
 if($LASTEXITCODE){throw 'Phase8 identity tests failed'}
} finally {
 foreach($name in (@($names)+@('FLYWAY_URL','FLYWAY_USER','FLYWAY_CONFIG_FILES')|Select-Object -Unique)){[Environment]::SetEnvironmentVariable($name,$saved[$name])}
 if($started){& (Get-PgTool pg_ctl) -D $data -m fast -w stop | Out-Null;if($LASTEXITCODE){throw "Owned database stop failed; retained $fixtureRoot"}}
 $resolved=[IO.Path]::GetFullPath($fixtureRoot);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 if((Split-Path $resolved -Parent).TrimEnd([IO.Path]::DirectorySeparatorChar) -ne $temp.TrimEnd([IO.Path]::DirectorySeparatorChar) -or (Split-Path $resolved -Leaf) -ne ('mw-phase8-'+$token)){throw 'Cleanup containment failed'}
 if((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cleanup root link refused'}
 $ancestor=Split-Path $resolved -Parent
 while($ancestor){if((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cleanup ancestor link refused'};$next=Split-Path $ancestor -Parent;if($next -eq $ancestor){break};$ancestor=$next}
 if(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Cleanup child link refused'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
 Write-Host "Owned Phase8 loopback fixture stopped and removed: $resolved"
}
