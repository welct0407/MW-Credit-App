[CmdletBinding()]
param([ValidateSet('development','production')][string]$Environment='production')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$saved=@{PGPASSWORD=$env:PGPASSWORD;PGSSLMODE=$env:PGSSLMODE;PGCONNECT_TIMEOUT=$env:PGCONNECT_TIMEOUT}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=@'
BEGIN READ ONLY;
SELECT json_build_object('environment_host',inet_server_addr(),'checked_at',clock_timestamp(),
 'payments',count(*),'processing',count(*) FILTER (WHERE "Status"='Processing'),'error',count(*) FILTER (WHERE "Status"='Error'),
 'synthetic_receipts',count(*) FILTER (WHERE "Ref Borrower" IN ('LS26-BENCH','LS26-CHECK'))) FROM public."Payments";
SELECT json_build_object('other_active_sessions',count(*)) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active';
COMMIT;
'@
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database)
 if($LASTEXITCODE){throw 'Cutover read failed'}
} finally {foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
