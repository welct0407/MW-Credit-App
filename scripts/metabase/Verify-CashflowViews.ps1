param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment $Environment
$old=$env:PGPASSWORD;$ssl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $args=@('-X','-q','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne $target.database){throw 'Database mismatch'}
 $raw=& "$(Get-PgBin)/psql.exe" @args -f "$PSScriptRoot/cashflow-checks.sql"
 if($LASTEXITCODE){throw 'Cashflow checks failed'}
 $checks=($raw -join "`n")|ConvertFrom-Json
 if(@($checks|Where-Object {-not $_.passed}).Count){$checks|Where-Object {-not $_.passed}|Select-Object name;throw 'Cashflow reconciliation failed'}
 @{verified_at=[DateTimeOffset]::UtcNow.ToString('o');environment=$Environment;database=$identity;checks=$checks;financial_values_published=$false}|ConvertTo-Json -Depth 5|Set-Content "$DbRepoRoot/outputs/r016-20260922/cashflow-$Environment.json"
 Write-Output "$Environment thirteen cashflow reconciliation checks passed."
} finally {$env:PGPASSWORD=$old;$env:PGSSLMODE=$ssl}
