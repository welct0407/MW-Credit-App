[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment production
if($target.host -ne '34.21.174.215'){throw 'Reviewed production host required'}
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-expenses-production-20260916'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$dump=Join-Path $private 'production-before.dump'
if(Test-Path -LiteralPath $dump){throw 'Do not overwrite the production rollback snapshot'}
& "$PSScriptRoot/Get-DatabaseAudit.ps1" -Environment production | Set-Content (Join-Path $private 'database-before.jsonl') -Encoding utf8
$schema=& "$PSScriptRoot/Export-Schema.ps1" -Environment production
$normalized=Join-Path $private 'schema-before.normalized.sql'
& "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $schema -OutputFile $normalized
$reviewed='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-expenses-20260916/schema-before.normalized.sql'
if(-not(Test-Path -LiteralPath $reviewed)){throw 'Reviewed development V14 schema is unavailable'}
if((Get-FileHash $normalized).Hash -ne (Get-FileHash $reviewed).Hash){throw 'Production schema drifted from the reviewed V14 pre-release schema'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 & (Join-Path (Get-PgBin) 'pg_dump.exe') -h $target.host -U $target.user -d $target.database -Fc -f $dump
 if($LASTEXITCODE){throw 'Production backup failed'}
 & (Join-Path (Get-PgBin) 'pg_restore.exe') --list $dump | Out-Null
 if($LASTEXITCODE){throw 'Production backup listing failed'}
 [pscustomobject]@{dump=$dump;backupSha256=(Get-FileHash $dump).Hash;schemaSha256=(Get-FileHash $normalized).Hash;reviewedV14SchemaMatches=$true} | ConvertTo-Json
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
