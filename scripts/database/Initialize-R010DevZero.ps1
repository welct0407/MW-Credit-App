[CmdletBinding()]
param([switch]$Apply)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'development'
if($target.host -ne '34.158.38.171' -or $target.instance -ne 'appsheet-pg-dev-20260915'){throw 'Reviewed DEV host/instance required'}
if(-not $Apply){throw 'Requires explicit -Apply; owner authorization is recorded in R010 log. Do not replay after success.'}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 & (Join-Path (Get-PgBin) 'psql.exe') -X -q -1 -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database -f "$PSScriptRoot/Initialize-R010DevZero.sql"
 if($LASTEXITCODE){throw 'DEV zero initialization failed; transaction rolled back'}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
