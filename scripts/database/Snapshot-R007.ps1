[CmdletBinding()]
param([ValidateSet('development','production')][string]$Environment='development',[ValidatePattern('^[a-z0-9-]+$')][string]$Label='development-before')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$dump=Join-Path $private "$Label.dump"
if(Test-Path -LiteralPath $dump){throw 'R007 snapshot exists; do not overwrite'}
$schema=& "$PSScriptRoot/Export-Schema.ps1" -Environment $Environment
& "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $schema -OutputFile (Join-Path $private "$Label.normalized.sql")
$saved=@{}; foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim(); $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
 & (Join-Path (Get-PgBin) 'pg_dump.exe') -h $target.host -p $target.port -U $target.user -d $target.database -Fc -f $dump
 if($LASTEXITCODE){throw 'R007 backup failed'}
 & (Join-Path (Get-PgBin) 'pg_restore.exe') --list $dump | Out-Null
 if($LASTEXITCODE){throw 'R007 backup listing failed'}
 [pscustomobject]@{environment=$Environment;backup=$dump;sha256=(Get-FileHash $dump).Hash;restoreTest='Pending'} | ConvertTo-Json
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
