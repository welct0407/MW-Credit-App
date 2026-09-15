[CmdletBinding()]
param(
 [ValidateSet('development','production')][string]$Environment='development'
)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$reviewedHosts=@{development='34.158.38.171';production='34.21.174.215'}
if($target.host -ne $reviewedHosts[$Environment]){throw "Reviewed $Environment host required"}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on -c timezone=Asia/Bangkok'
 $result=& (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database -f "$PSScriptRoot/Verify-AnalyticsSnapshots.sql"
 if($LASTEXITCODE){throw 'Snapshot reconciliation failed'}
 $result
 if(($result|ConvertFrom-Json).mismatches -ne 0){throw 'Snapshot metrics differ from original formulas'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
