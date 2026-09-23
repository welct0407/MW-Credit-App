param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
if($target.instance -ne 'appsheet-pg-prod-20260914' -or $target.host -ne '34.21.174.215' -or $target.database -ne $(if($Environment -eq 'development'){'loan_manager_dev'}else{'loan_manager_prod'})){throw 'Target mismatch'}
$old=$env:PGPASSWORD;$ssl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $a=@('-X','-q','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @a -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne $target.database){throw 'Database mismatch'}
 & "$(Get-PgBin)/psql.exe" @a -f "$PSScriptRoot/Test-FocusedStatements.sql"
 if($LASTEXITCODE){throw 'Statement reconciliation failed'}
 $version=& "$(Get-PgBin)/psql.exe" @a -c 'SELECT max(version::int) FROM flyway_schema_history WHERE success'
 @{verified_at=[DateTimeOffset]::UtcNow.ToString('o');environment=$Environment;database=$identity;version=[int]$version;period_detail_parity=$true;income_parity=$true;transfers=$true;equation=$true;future_guard=$true;financial_values_published=$false}|ConvertTo-Json |Set-Content "$DbRepoRoot/outputs/r016-20260922/statement-cleanup/$Environment-verification.json"
} finally {$env:PGPASSWORD=$old;$env:PGSSLMODE=$ssl}
