[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r004-20260917'
$bin=Get-PgBin
$root=Join-Path $DbToolRoot ('r004-restore-'+[guid]::NewGuid().ToString('N'))
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
 & (Join-Path $bin 'pg_restore.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --no-owner --no-privileges --exit-on-error --schema=public --schema=assessment_lab (Join-Path $private 'production-before.dump') 2> (Join-Path $root 'restore.err')
 if($LASTEXITCODE){throw "Restore failed; private diagnostic $root"}
 $dump=Join-Path $root 'restored.sql'
 & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$dump
 if($LASTEXITCODE){throw 'Restored schema export failed'}
 & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile "$dump.normalized"
 if((Get-FileHash "$dump.normalized").Hash -ne (Get-FileHash (Join-Path $private 'production-before.normalized.sql')).Hash){throw 'Restored production schema differs'}
 $sql=@'
CREATE TEMP TABLE r004_before AS SELECT "Row ID",to_jsonb(e)-'Expense Category' AS rest FROM public."Business Expenses" e;
\ir ../../database/migrations/V19__bilingual_referral_rebate_category.sql
DO $$ BEGIN
 IF (SELECT count(*) FROM public."Business Expenses" WHERE "Expense Category"='Referral Rebate / เงินคืนค่าแนะนำลูกค้า' AND "Source Type"='Manual')<>1 THEN RAISE EXCEPTION 'Expected one backlog correction'; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" e FULL JOIN r004_before b USING("Row ID") WHERE (to_jsonb(e)-'Expense Category') IS DISTINCT FROM b.rest) THEN RAISE EXCEPTION 'Noncategory data changed'; END IF;
END $$;
'@
 # psql resolves the relative migration include from this reviewed script directory.
 Push-Location $PSScriptRoot
 try {$sql | & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres;if($LASTEXITCODE){throw 'Restored-data migration check failed'}}finally{Pop-Location}
 [pscustomobject]@{restoreSucceeded=$true;normalizedSchemaMatches=$true;backlogMigrationPassed=$true;noncategoryFieldsPreserved=$true;backupSha256=(Get-FileHash (Join-Path $private 'production-before.dump')).Hash;scope='public and assessment_lab; Cloud SQL cron extension/settings excluded'} | ConvertTo-Json
}finally{if($started){& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}}
