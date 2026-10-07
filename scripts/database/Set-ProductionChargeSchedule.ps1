[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('status','enable-nightly','pause-nightly')][string]$Mode,
 [string]$ApprovalReference,
 [string]$ReleaseManifest
)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment production
if($target.host -ne '34.21.174.215' -or $target.database -ne 'loan_manager_prod'){throw 'Reviewed production target required'}
if($Mode -ne 'status'){
 if([string]::IsNullOrWhiteSpace($ApprovalReference)){throw 'Explicit owner approval reference required; this parameter does not grant approval'}
 if(-not $ReleaseManifest){throw 'Tested release manifest required'}
 $release=Get-Content -LiteralPath $ReleaseManifest -Raw | ConvertFrom-Json
 $head=(& git -C $DbRepoRoot rev-parse HEAD).Trim()
 if($release.commit -ne $head -or $release.environment -ne 'development' -or -not $release.validationReference){throw 'Current tested development release required'}
 if((Get-MigrationManifest | ConvertTo-Json -Compress) -ne ($release.migrations | ConvertTo-Json -Compress)){throw 'Migration hashes differ from tested release'}
}
$sql=@'
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_prod' OR current_setting('cron.timezone')<>'Asia/Bangkok' THEN RAISE EXCEPTION 'Unexpected scheduler target'; END IF;
 IF NOT EXISTS(SELECT FROM public.flyway_schema_history WHERE version='__REQUIRED_VERSION__' AND success) THEN RAISE EXCEPTION 'Required production migration is missing'; END IF;
 IF (SELECT count(*) FROM cron.job WHERE jobname='loan-daily-charges')<>1 THEN RAISE EXCEPTION 'Expected exactly one nightly job'; END IF;
 IF NOT EXISTS(SELECT FROM cron.job WHERE jobname='loan-daily-charges' AND schedule='5 0 * * *' AND database=current_database()
 AND command=$command$SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date);$command$) THEN RAISE EXCEPTION 'Unexpected nightly command'; END IF;
END $$;
'@
$sql=$sql.Replace('__REQUIRED_VERSION__',$(if($Mode -eq 'status'){'10'}else{'11'}))
if($Mode -eq 'enable-nightly'){$sql+="`nSELECT cron.alter_job(jobid,active:=true) FROM cron.job WHERE jobname='loan-daily-charges';"}
if($Mode -eq 'pause-nightly'){$sql+="`nSELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='loan-daily-charges';"}
$sql+=@'

SELECT row_to_json(j) FROM (SELECT jobid,jobname,schedule,command,database,active FROM cron.job WHERE jobname='loan-daily-charges') j;
SELECT json_build_object('as_of_bangkok',statement_timestamp() AT TIME ZONE 'Asia/Bangkok','cron_timezone',current_setting('cron.timezone'),'max_running_jobs',current_setting('cron.max_running_jobs'));
COMMIT;
'@
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'status'){'-c default_transaction_read_only=on'}else{''}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Production schedule operation failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
