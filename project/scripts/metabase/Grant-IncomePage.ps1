param([Parameter(Mandatory)][string]$ApprovalReference)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../database/Common.ps1')
$target=Get-DbEnvironment production -Admin
$out=Join-Path $DbRepoRoot 'outputs/r016-20260922'
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922'
if(Test-Path "$out/income-grants-applied.json"){throw 'Income grant batch already applied; preserve rollback evidence.'}
$backup=Get-Content "$out/backup-verification.json" -Raw|ConvertFrom-Json
if(-not $backup.restored -or (Get-FileHash "$private/production-before-reporting-grants.dump").Hash -ne $backup.sha256){throw 'Verified restore backup unavailable'}
$sql=Get-Content "$out/income-proposed-grants.sql" -Raw
if(([regex]::Matches($sql,'GRANT SELECT')).Count -ne 3){throw 'Unexpected grant proposal'}
$env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
try {
 $args=@('-X','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -At -c 'SELECT current_database()'
 if($LASTEXITCODE -ne 0 -or $identity -ne 'loan_manager_prod'){throw 'PROD identity mismatch'}
 $before=& "$(Get-PgBin)/psql.exe" @args --csv -c "SELECT table_schema,table_name,column_name,privilege_type FROM information_schema.column_privileges WHERE grantee='metabase_borrower_reader' ORDER BY 1,2,3,4"
 if($LASTEXITCODE -ne 0){throw 'ACL backup failed'}
 $before|Set-Content "$private/income-before/column-grants.csv"
 & "$(Get-PgBin)/psql.exe" @args --single-transaction -f "$out/income-proposed-grants.sql"
 if($LASTEXITCODE -ne 0){throw 'Grant transaction failed'}
 @{applied_at=[DateTimeOffset]::UtcNow.ToString('o');approval=$ApprovalReference;database=$target.database;instance=$target.instance;role='metabase_borrower_reader';columns=21;relations=3;sql_sha256=(Get-FileHash "$out/income-proposed-grants.sql").Hash;schema_changed=$false;data_changed=$false;backup_reused='backup-verification.json'}|ConvertTo-Json|Set-Content "$out/income-grants-applied.json"
} finally {Remove-Item Env:PGPASSWORD;Remove-Item Env:PGSSLMODE}
