param([Parameter(Mandatory)][string]$ApprovalReference)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../database/Common.ps1')
$target=Get-DbEnvironment production -Admin
$out=Join-Path $DbRepoRoot 'outputs/r016-20260922'
if(Test-Path "$out/remaining-grants-applied.json"){throw 'This approved grant batch was already applied. Verify instead of overwriting its rollback evidence.'}
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922'
$backup=Get-Content "$out/backup-verification.json" -Raw|ConvertFrom-Json
if(-not $backup.restored -or (Get-FileHash "$private/production-before-reporting-grants.dump").Hash -ne $backup.sha256){throw 'Verified restore backup unavailable'}
$proposal=Get-Content "$out/remaining-proposed-grants.json" -Raw|ConvertFrom-Json
if($proposal.database -ne $target.database -or $proposal.role -ne 'metabase_borrower_reader' -or ($proposal.grants.columns|Measure-Object).Count -ne 73){throw 'Unexpected approved grant scope'}
$env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
try {
 $args=@('-X','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -At -c 'SELECT current_database()'
 if($LASTEXITCODE -ne 0 -or $identity -ne 'loan_manager_prod'){throw 'Live PROD identity mismatch'}
 $before=& "$(Get-PgBin)/psql.exe" @args --csv -c "SELECT table_schema,table_name,column_name,privilege_type FROM information_schema.column_privileges WHERE grantee='metabase_borrower_reader' ORDER BY 1,2,3,4"
 if($LASTEXITCODE -ne 0){throw 'Privilege backup failed'}
 $before|Set-Content "$private/remaining-pages-before/column-grants.csv"
 & "$(Get-PgBin)/psql.exe" @args --single-transaction -f "$out/remaining-proposed-grants.sql"
 if($LASTEXITCODE -ne 0){throw 'Grant transaction failed'}
 @{applied_at=[DateTimeOffset]::UtcNow.ToString('o');approval=$ApprovalReference;database=$target.database;instance=$target.instance;role=$proposal.role;columns=73;relations=7;sql_sha256=(Get-FileHash "$out/remaining-proposed-grants.sql").Hash;schema_changed=$false;data_changed=$false;backup_reused='backup-verification.json';privilege_rollback='remaining-pages-before/column-grants.csv'}|ConvertTo-Json|Set-Content "$out/remaining-grants-applied.json"
} finally {Remove-Item Env:PGPASSWORD;Remove-Item Env:PGSSLMODE}
