[CmdletBinding()]
param([switch]$RehearseMigration,[ValidatePattern('^[a-z0-9-]+$')][string]$Label='development-before')
. "$PSScriptRoot/Common.ps1"
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917'
$bin=Get-PgBin
$root=Join-Path $DbToolRoot ('r005-restore-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$data=Join-Path $root 'data'
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false
try {
 & (Join-Path $bin 'initdb.exe') -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'initdb failed'}
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $root 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'start.out') -RedirectStandardError (Join-Path $root 'start.err')
 $p.WaitForExit();if($p.ExitCode){throw 'Local server start failed'};$started=$true
 & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -c 'CREATE SCHEMA assessment_lab'
 & (Join-Path $bin 'pg_restore.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --no-owner --no-privileges --exit-on-error --schema=public --schema=assessment_lab (Join-Path $private "$Label.dump") 2> (Join-Path $root 'restore.err')
 if($LASTEXITCODE){throw "Restore failed; private diagnostic $root"}
 $dump=Join-Path $root 'restored.sql'
 & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$dump
 if($LASTEXITCODE){throw 'Restored schema export failed'}
 & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile "$dump.normalized"
 if((Get-FileHash "$dump.normalized").Hash -ne (Get-FileHash (Join-Path $private "$Label.normalized.sql")).Hash){throw 'Restored backup schema differs'}
 if($RehearseMigration){
  $audit=@'
SELECT jsonb_object_agg(t,h) FROM (
 SELECT 'Payments' t,md5(string_agg((to_jsonb(p)-'Ref Received By Cash Holder')::text,'' ORDER BY "Row ID")) h FROM "Payments" p
 UNION ALL SELECT 'Business Expenses',md5(string_agg((to_jsonb(e)-'Ref Paid By Cash Holder')::text,'' ORDER BY "Row ID")) FROM "Business Expenses" e
 UNION ALL SELECT 'Loans',md5(string_agg(to_jsonb(l)::text,'' ORDER BY "Row ID")) FROM "Loans" l
 UNION ALL SELECT 'Settlements',md5(string_agg(to_jsonb(s)::text,'' ORDER BY "Row ID")) FROM "Settlements" s
) fingerprints;
'@
  $before=$audit | & (Join-Path $bin 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres
  if($LASTEXITCODE){throw 'Before-data fingerprint failed'}
  $savedFlyway=@{}
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {$savedFlyway[$_.Name]=$_.Value;Remove-Item "Env:$($_.Name)"}
  try{
   $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$port/postgres"; $env:FLYWAY_USER='postgres'
   $env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
   Push-Location $DbRepoRoot
   try{
    $migration=& (Get-FlywayPath) '-target=20' '-outputType=json' migrate
    if($LASTEXITCODE){throw 'R005 restored-copy migration failed'}
    $migration=($migration -join "`n")|ConvertFrom-Json
    if(-not $migration.success -or $migration.migrationsExecuted -ne 1){throw 'Expected only R005 migration'}
   }finally{Pop-Location}
  }finally{
   Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
   foreach($name in $savedFlyway.Keys){[Environment]::SetEnvironmentVariable($name,$savedFlyway[$name],'Process')}
  }
  $after=$audit | & (Join-Path $bin 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres
  if($LASTEXITCODE -or ($before -join '') -cne ($after -join '')){throw 'R005 changed existing source data'}
  @'
DO $$ BEGIN
 ASSERT (SELECT count(*)=0 FROM "Cash Ledger"),'no historical cash entries';
 ASSERT NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Ref Received By Cash Holder" IS NOT NULL),'no historical receiver assignment';
 ASSERT NOT EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Ref Paid By Cash Holder" IS NOT NULL),'no historical payer assignment';
 ASSERT (SELECT count(*) FROM r005_cash_cutover_sources)=(SELECT count(*) FROM "Payments")+(SELECT count(*) FROM "Loans")+(SELECT count(*) FROM "Business Expenses")+(SELECT count(*) FROM "Settlements" WHERE "Status"='Completed'),'all historical identities captured';
END $$;
'@ | & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres
  if($LASTEXITCODE){throw 'R005 cutover assertions failed'}
 }
 [pscustomobject]@{restoreSucceeded=$true;normalizedSchemaMatches=$true;backupSha256=(Get-FileHash (Join-Path $private "$Label.dump")).Hash;scope='public and assessment_lab including Flyway history; Cloud SQL cron extension/settings excluded';r005MigrationRehearsed=[bool]$RehearseMigration;existingSourceDataUnchanged=if($RehearseMigration){$true}else{$null}} | ConvertTo-Json
}finally{if($started){& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}}
