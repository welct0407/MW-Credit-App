[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupFile,[Parameter(Mandatory)][string]$AgentRepository,[Parameter(Mandatory)][string]$EvidenceFile,[string]$CentralBackupFile)
. "$PSScriptRoot/Common.ps1"
$bin=Get-PgBin
$root=Join-Path $DbToolRoot ('receipt-evidence-lab-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root | Out-Null
$data=Join-Path $root data
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
& (Join-Path $bin initdb.exe) -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
if($LASTEXITCODE){throw 'initdb failed'}
$started=$false
try {
 $process=Start-Process -FilePath (Join-Path $bin pg_ctl.exe) -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $root postgres.log)+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root start.out) -RedirectStandardError (Join-Path $root start.err)
 $process.WaitForExit()
 if($process.ExitCode){throw 'Lab start failed'}
 $started=$true
 & (Join-Path $bin createdb.exe) -h 127.0.0.1 -p $port -U postgres loan_manager_dev
 & (Join-Path $bin pg_restore.exe) -h 127.0.0.1 -p $port -U postgres -d loan_manager_dev --no-owner --no-privileges --exit-on-error $BackupFile 2> (Join-Path $root restore.err)
 if($LASTEXITCODE){throw 'Private backup restore failed; inspect private lab log'}
 $restored=& (Join-Path $bin psql.exe) -X -At -h 127.0.0.1 -p $port -U postgres -d loan_manager_dev -c 'SELECT max(version::integer) FROM public.flyway_schema_history WHERE success'
 if($LASTEXITCODE -or $restored -ne '48'){throw 'Unexpected backup schema version'}
 if($CentralBackupFile){
  & (Join-Path $bin createdb.exe) -h 127.0.0.1 -p $port -U postgres central_restore_check
  & (Join-Path $bin pg_restore.exe) -h 127.0.0.1 -p $port -U postgres -d central_restore_check --no-owner --no-privileges --exit-on-error $CentralBackupFile 2> (Join-Path $root central-restore.err)
  if($LASTEXITCODE){throw 'Private central backup restore failed; inspect private lab log'}
  $centralTables=& (Join-Path $bin psql.exe) -X -At -h 127.0.0.1 -p $port -U postgres -d central_restore_check -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"
  if($LASTEXITCODE -or $centralTables -ne '30'){throw 'Unexpected central backup table count'}
 }
 $env:PYTHONPATH=(Join-Path $AgentRepository src)+';'+(Join-Path $DbToolRoot python-deps)
 $result=& 'C:/Users/MWCredit/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' (Join-Path $AgentRepository scripts/test-receipt-postgres.py) --port $port --root $root
 if($LASTEXITCODE){throw 'Central receipt integration test failed'}
 @{privateBackupRestore='passed';restoredVersion=$restored;centralBackupRestored=[bool]$CentralBackupFile;centralTests=($result|ConvertFrom-Json);lab=$root;noLiveEffects=$true} | ConvertTo-Json -Depth 5 | Set-Content $EvidenceFile
 Get-Content $EvidenceFile
} finally {
 if($started){& (Join-Path $bin pg_ctl.exe) -D $data -m fast -w stop | Out-Null}
}
