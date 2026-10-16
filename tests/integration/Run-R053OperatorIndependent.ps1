param([string]$TestNamePattern,[switch]$AgentReceipts,[switch]$Production,[switch]$BindingOnly,[switch]$LedgerOwner)
$ErrorActionPreference='Stop'
if($BindingOnly -and ($Production -or $AgentReceipts)){throw 'Choose exact binding-only fixture mode'}
# -LedgerOwner (A-design §9.4): V1-V92 as a superuser `postgres` that the test then demotes to the Cloud SQL
# shape (LOGIN NOSUPERUSER CREATEROLE, owner of the catalogue), then the V93 owner-authority path as that runner.
if($LedgerOwner -and ($Production -or $AgentReceipts -or $BindingOnly)){throw 'Choose exact ledger-owner fixture mode'}
if($env:CI -ne 'true'){. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"}
. "$PSScriptRoot/../../scripts/database/Common.ps1"
$pgBin=Get-PgBin
$bootstrapUser=if($BindingOnly -or $LedgerOwner){'c_r053_binding_init'}else{'postgres'}
$migrationUser=if($LedgerOwner){'postgres'}else{$bootstrapUser}
$token=[guid]::NewGuid().ToString('N')
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('mw-phase8-'+$token)
$data=Join-Path $fixtureRoot 'data';$database='loan_manager_dev'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
Write-Host "Owned Phase8 disposable fixture: $fixtureRoot"
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$fixturePort=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false;$saved=@{}
$names=@('PHASE8_AGENT_RECEIPTS','PHASE8_LEDGER_OWNER','PHASE8_TEST_DISPOSABLE','PHASE8_TEST_HOST','PHASE8_TEST_PORT','PHASE8_TEST_DATABASE','PHASE8_TEST_USER','PHASE8_TEST_PASSWORD','PHASE8_TEST_DATA_DIRECTORY')
Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {$names+=$_.Name}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name);[Environment]::SetEnvironmentVariable($name,$null)}
try {
 & (Get-PgTool initdb) -D $data -U $bootstrapUser --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 Start-PgServer $data (Join-Path $fixtureRoot 'postgres.log') $fixturePort $fixtureRoot;$started=$true
 if($BindingOnly){'CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE;' | & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U $bootstrapUser -d postgres;if($LASTEXITCODE){throw 'Binding operator creation failed'}}
 if($LedgerOwner){'CREATE ROLE postgres LOGIN SUPERUSER CREATEROLE;' | & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U $bootstrapUser -d postgres;if($LASTEXITCODE){throw 'Ledger-owner runner creation failed'}}
 & (Get-PgTool createdb) -h 127.0.0.1 -p $fixturePort -U $bootstrapUser -O postgres $database
 if($LASTEXITCODE){throw 'Disposable database creation failed'}
 foreach($file in @('Test-AgentAuditPrerequisites.sql','Test-AppRolePrerequisites.sql')){
  & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U $migrationUser -d $database -f "$PSScriptRoot/../../scripts/database/$file"
  if($LASTEXITCODE){throw 'Disposable prerequisites failed'}
 }
 if($LedgerOwner){
  $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/$database";$env:FLYWAY_USER=$migrationUser;$env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
  Push-Location $DbRepoRoot
  try {
   & (Get-FlywayPath) '-outputType=json' '-target=92' migrate | Out-File (Join-Path $fixtureRoot 'migration92.json')
   if($LASTEXITCODE){Get-Content (Join-Path $fixtureRoot 'migration92.json');throw 'V92 fixture migration failed'}
  } finally {Pop-Location}
 } elseif(-not $BindingOnly){
 $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/$database";$env:FLYWAY_USER='postgres';$env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
 Push-Location $DbRepoRoot
 try {
  & (Get-FlywayPath) '-outputType=json' '-target=85' migrate | Out-File (Join-Path $fixtureRoot 'migration85.json')
  if($LASTEXITCODE){Get-Content (Join-Path $fixtureRoot 'migration85.json');throw 'V85 fixture migration failed'}
  & (Get-FlywayPath) '-outputType=json' '-target=87' migrate | Out-File (Join-Path $fixtureRoot 'migration86.json')
  if($LASTEXITCODE){Get-Content (Join-Path $fixtureRoot 'migration86.json');throw 'V86 fixture migration failed'}
 } finally {Pop-Location}
 & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d $database -f "$PSScriptRoot/phase8-identity-fixture.sql"
 if($LASTEXITCODE){throw 'Synthetic identity setup failed'}
 if($Production){
  $database='loan_manager_prod'
  & (Get-PgTool createdb) -h 127.0.0.1 -p $fixturePort -U postgres $database
  if($LASTEXITCODE){throw 'Production fixture database creation failed'}
  'GRANT mw_app_prod TO mw_app_prod_journal_owner WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;' | & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d $database
  if($LASTEXITCODE){throw 'Production fixture owner membership failed'}
  $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/$database"
  Push-Location $DbRepoRoot
  try {
   & (Get-FlywayPath) '-outputType=json' '-target=77' migrate | Out-File (Join-Path $fixtureRoot 'prod77.json')
   if($LASTEXITCODE){throw 'Production V77 fixture migration failed'}
   & (Get-FlywayPath) '-outputType=json' '-target=87' '-group=true' '-mixed=false' '-executeInTransaction=true' migrate | Out-File (Join-Path $fixtureRoot 'prod87.json')
   if($LASTEXITCODE){throw 'Production grouped V87 fixture migration failed'}
  }finally{Pop-Location}
 }
 }
 if($AgentReceipts){$env:PHASE8_AGENT_RECEIPTS='1'}
 if($LedgerOwner){$env:PHASE8_LEDGER_OWNER='1'}
 # PHASE8_TEST_USER is the fixture's administrative login; in -LedgerOwner mode that is the bootstrap superuser, not the runner.
 $env:PHASE8_TEST_DISPOSABLE='1';$env:PHASE8_TEST_HOST='127.0.0.1';$env:PHASE8_TEST_PORT=[string]$fixturePort;$env:PHASE8_TEST_DATABASE=$database;$env:PHASE8_TEST_USER=$(if($LedgerOwner){$bootstrapUser}else{'postgres'});$env:PHASE8_TEST_DATA_DIRECTORY=$data
 $arguments=@('--test','--test-concurrency=1');if($TestNamePattern){$arguments+=('--test-name-pattern='+$TestNamePattern)}
 $testFile=if($LedgerOwner){'ledger-owner-operator-independent.test.mjs'}elseif($BindingOnly){'r053-binding-independent.test.mjs'}elseif($Production){'r053-production-operator-independent.test.mjs'}else{'r053-operator-independent.test.mjs'}
 & node @arguments "$PSScriptRoot/$testFile"
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

