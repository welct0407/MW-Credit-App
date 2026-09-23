[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment,
 [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$From,
 [switch]$Full,
 [string]$ApprovalReference,
 [string]$BackupReference
)
. "$PSScriptRoot/Common.ps1"
if (([bool]$From) -eq ([bool]$Full)) { throw 'Specify either -From YYYY-MM-DD or -Full' }
if ($Environment -eq 'production' -and (-not $ApprovalReference -or -not $BackupReference)) {
 throw 'Production snapshot rebuild requires scoped authorization and verified backup references'
}
$target=Get-DbEnvironment $Environment
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $arguments=@('-X','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-p',$target.port,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @arguments -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne $target.database){throw 'Database identity mismatch'}
 $start=if($Full){'public.analytics_history_start()'}else{"DATE '$From'"}
 $sql="SELECT json_build_object('database',current_database(),'from',$start,'through',public.olap_reporting_date(),'days_refreshed',public.refresh_daily_analytics($start,public.olap_reporting_date()));"
 $result=& "$(Get-PgBin)/psql.exe" @arguments -c $sql
 if($LASTEXITCODE){throw 'Analytics rebuild failed; transaction rolled back'}
 $result
} finally {foreach($name in $saved.Keys){
 if([string]::IsNullOrEmpty($saved[$name])){Remove-Item "Env:$name" -ErrorAction SilentlyContinue}
 else{[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
}}
