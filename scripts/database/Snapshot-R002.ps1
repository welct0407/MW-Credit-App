[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r002-20260916'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$dump=Join-Path $private 'development-before.dump'
if(Test-Path -LiteralPath $dump){throw 'Do not overwrite the rollback snapshot'}
& "$PSScriptRoot/Get-DatabaseAudit.ps1" -Environment development | Set-Content (Join-Path $private 'database-before.jsonl') -Encoding utf8
$schema=& "$PSScriptRoot/Export-Schema.ps1" -Environment development
& "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $schema -OutputFile (Join-Path $private 'schema-before.normalized.sql')
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 & (Join-Path (Get-PgBin) 'pg_dump.exe') -h $target.host -U $target.user -d $target.database -Fc -f $dump
 if($LASTEXITCODE){throw 'Development backup failed'}
 & (Join-Path (Get-PgBin) 'pg_restore.exe') --list $dump | Out-Null
 if($LASTEXITCODE){throw 'Development backup listing failed'}
 Get-FileHash $dump,(Join-Path $private 'schema-before.normalized.sql')
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
