[CmdletBinding()]
param([Parameter(Mandatory)][string]$SqlFile)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
$saved=@{}
foreach($n in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
 $sql="BEGIN READ ONLY;`n"+[IO.File]::ReadAllText((Resolve-Path -LiteralPath $SqlFile))+"`nCOMMIT;"
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R014 DEV read failed'}
} finally {foreach($n in $saved.Keys){[Environment]::SetEnvironmentVariable($n,$saved[$n],'Process')}}
