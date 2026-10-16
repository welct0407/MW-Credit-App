param([Parameter(Mandatory)][string]$ApprovalReference)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment production -Admin
$out="$DbRepoRoot/outputs/r016-20260922"
$plan=Get-Content "$out/income-db-views-plan.json" -Raw|ConvertFrom-Json
if(Test-Path "$out/income-db-views-grants.json"){throw 'Grant evidence exists; inspect instead of replaying'}
$backup=Get-Content "$out/backup-verification.json" -Raw|ConvertFrom-Json
if(-not $backup.restored -or (Get-FileHash "$($backup.privateDirectory)/production-before-reporting-grants.dump").Hash -ne $backup.sha256){throw 'Verified recovery dump unavailable'}
$oldPassword=$env:PGPASSWORD;$oldSsl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $args=@('-X','-q','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne 'loan_manager_prod'){throw 'PROD identity mismatch'}
 $names=@($plan.views.PSObject.Properties.Value)
 if($names.Count -ne 6 -or @($names|Where-Object {$_ -notmatch '^reporting_[a-z_]+$'}).Count){throw 'Unexpected view names'}
 $sources=($names|ForEach-Object {'public.'+$_}) -join ','
 & "$(Get-PgBin)/psql.exe" @args -c "GRANT SELECT ON $sources TO metabase_borrower_reader"
 if($LASTEXITCODE){throw 'View grant failed'}
 $checks=@()
 foreach($name in $names){
  $ok=& "$(Get-PgBin)/psql.exe" @args -c "SELECT has_table_privilege('metabase_borrower_reader','public.$name','SELECT') AND NOT has_table_privilege('metabase_borrower_reader','public.$name','INSERT,UPDATE,DELETE,TRUNCATE')"
  if($LASTEXITCODE -or $ok -ne 't'){throw 'Read-only verification failed'}
  $checks+=@{view=$name;select_only=$true}
 }
 @{applied_at=[DateTimeOffset]::UtcNow.ToString('o');approval=$ApprovalReference;database=$identity;views=$checks;backup='backup-verification.json'}|ConvertTo-Json -Depth 5|Set-Content "$out/income-db-views-grants.json"
}finally{$env:PGPASSWORD=$oldPassword;$env:PGSSLMODE=$oldSsl}
