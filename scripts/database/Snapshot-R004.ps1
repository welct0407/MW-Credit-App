[CmdletBinding()]
param([ValidateSet('development','production')][string]$Environment='development')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r004-20260917'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$dump=Join-Path $private "$Environment-before.dump"
if(Test-Path $dump){throw 'R004 snapshot already exists; do not overwrite'}
$schema=& "$PSScriptRoot/Export-Schema.ps1" -Environment $Environment
& "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $schema -OutputFile (Join-Path $private "$Environment-before.normalized.sql")
& "$PSScriptRoot/Get-R004State.ps1" -Environment $Environment | Set-Content (Join-Path $private "$Environment-before.jsonl") -Encoding utf8
$saved=@{}; foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content $target.passwordFile -Raw).Trim(); $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
 & (Join-Path (Get-PgBin) 'pg_dump.exe') -h $target.host -U $target.user -d $target.database -Fc -f $dump
 if($LASTEXITCODE){throw 'R004 backup failed'}
 & (Join-Path (Get-PgBin) 'pg_restore.exe') --list $dump | Out-Null
 if($LASTEXITCODE){throw 'R004 backup listing failed'}
 [pscustomobject]@{environment=$Environment;backup=$dump;sha256=(Get-FileHash $dump).Hash}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
