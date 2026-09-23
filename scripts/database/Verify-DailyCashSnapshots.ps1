param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$oldPassword=$env:PGPASSWORD;$oldSsl=$env:PGSSLMODE;$oldTimeout=$env:PGCONNECT_TIMEOUT
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $arguments=@('-X','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $result=& "$(Get-PgBin)/psql.exe" @arguments -f "$PSScriptRoot/Verify-DailyCashSnapshots.sql"
 if($LASTEXITCODE){throw 'Snapshot verification query failed'}
 $checks=($result -join "`n")|ConvertFrom-Json
 $legacy=& "$(Get-PgBin)/psql.exe" @arguments -f "$PSScriptRoot/Verify-AnalyticsSnapshots.sql"
 if($LASTEXITCODE){throw 'Portfolio verification query failed'}
 $legacy=($legacy -join "`n")|ConvertFrom-Json
 $coverage=& "$(Get-PgBin)/psql.exe" @arguments -c 'SELECT json_build_object(''first_date'',min("Snapshot Date"),''last_date'',max("Snapshot Date"),''portfolio_rows'',count(*),''account_rows'',(SELECT count(*) FROM "Cash Account Daily Analytics"),''cash_available_from'',min("Snapshot Date") FILTER(WHERE "Cash Balance EOD" IS NOT NULL),''latest_generation'',max("Generated At")) FROM "Daily Analytics"'
 if($LASTEXITCODE){throw 'Coverage query failed'}
 $evidence=@{environment=$Environment;database=$target.database;verified_at=[DateTimeOffset]::UtcNow.ToString('o');checks=$checks;portfolio=$legacy;coverage=(($coverage -join "`n")|ConvertFrom-Json);financial_values_published=$false}
 $output="$DbRepoRoot/outputs/r016-20260922/daily-snapshots/$Environment-verification.json"
 $evidence|ConvertTo-Json -Depth 8|Set-Content $output
 $failures=@($checks|Where-Object {-not $_.passed})
 if($failures.Count -or $legacy.mismatches -ne 0){throw "Snapshot verification failed: $($failures.name -join ', '); portfolio mismatches $($legacy.mismatches)"}
 "${Environment}: $($checks.Count) cash checks and $($legacy.matched) daily portfolio reconciliations passed"
} finally {
 $env:PGPASSWORD=$oldPassword;$env:PGSSLMODE=$oldSsl
 if([string]::IsNullOrEmpty($oldTimeout)){Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue}else{$env:PGCONNECT_TIMEOUT=$oldTimeout}
}
