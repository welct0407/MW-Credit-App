[CmdletBinding()]
param([ValidateSet('development','production')][string]$Environment='production')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$private=Join-Path (Split-Path $DbPrivateRoot) 'forecast-review-20260921'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$saved=@{}
foreach($n in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
 $out=Join-Path $private "$Environment.json"
 & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database -f "$PSScriptRoot/Read-ForecastReview.sql" -o $out
 if($LASTEXITCODE){throw 'Read-only forecast snapshot failed'}
 Write-Output "Private snapshot saved: $out"
} finally {foreach($n in $saved.Keys){[Environment]::SetEnvironmentVariable($n,$saved[$n],'Process')}}
