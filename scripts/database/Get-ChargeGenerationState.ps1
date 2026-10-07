[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on'
 @'
SELECT json_build_object('database',current_database(),'timezone',current_setting('TimeZone'),
 'pg_cron_enabled',current_setting('cloudsql.enable_pg_cron',true),
 'cron_database',current_setting('cron.database_name',true),'cron_timezone',current_setting('cron.timezone',true),
 'cron_max_running_jobs',current_setting('cron.max_running_jobs',true),
 'background_workers',current_setting('cron.use_background_workers',true),
 'max_connections',current_setting('max_connections'),
 'extension',(SELECT extversion FROM pg_extension WHERE extname='pg_cron'),
 'migration_version',(SELECT max(version::int) FROM flyway_schema_history WHERE success));
SELECT 'SELECT row_to_json(j) FROM (SELECT jobid,jobname,schedule,command,database,active FROM cron.job WHERE jobname IN (''loan-daily-charges'',''loan-charge-generation-test'')) j;'
WHERE to_regclass('cron.job') IS NOT NULL
\gexec
'@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Generation state read failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
