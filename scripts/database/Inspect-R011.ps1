[CmdletBinding()]
param([switch]$Backup)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
$bin=Get-PgBin
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r011-20260920'
$saved=@{}; foreach($n in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=@'
SELECT current_database(),inet_server_addr(),version();
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='Borrowers' ORDER BY ordinal_position;
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public."Borrowers"'::regclass AND NOT tgisinternal;
SELECT count(*) AS borrowers,count(*) FILTER(WHERE nullif(btrim("Description"),'') IS NULL) AS missing_english_names FROM public."Borrowers";
SELECT table_name FROM information_schema.view_table_usage WHERE table_schema='public' AND table_name='Borrowers';
SELECT version,success FROM public.flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
SELECT view_name FROM information_schema.view_table_usage WHERE table_schema='public' AND table_name='Borrowers';
'@
 $sql | & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Read-only inspection failed'}
 if(-not $Backup){
  $verify=@'
SELECT count(*) FILTER(WHERE nullif("Borrower Note",'') IS NOT NULL) AS nonblank_notes,
 count(*) FILTER(WHERE nullif(btrim("Description"),'') IS NULL) AS missing_english_names FROM public."Borrowers";
'@
  $verify | & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
  if($LASTEXITCODE){throw 'Post-test check failed'}
 }
 if($Backup){
  New-Item -ItemType Directory -Force -Path $private | Out-Null
  $dump=Join-Path $private 'before-r011.dump'
  if(Test-Path $dump){throw 'Preserve existing backup; do not overwrite'}
  & (Join-Path $bin 'pg_dump.exe') -h $target.host -p $target.port -U $target.user -d $target.database -Fc --file=$dump
  if($LASTEXITCODE){throw 'Backup failed'}
  & (Join-Path $bin 'pg_restore.exe') --list $dump | Out-Null
  if($LASTEXITCODE){throw 'Backup catalogue verification failed'}
  Get-FileHash $dump -Algorithm SHA256
 }
} finally {foreach($n in $saved.Keys){[Environment]::SetEnvironmentVariable($n,$saved[$n],'Process')}}
