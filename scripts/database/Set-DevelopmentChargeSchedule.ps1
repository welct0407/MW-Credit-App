[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('start-test','status','finish-test','enable-nightly','pause-nightly')][string]$Mode)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=switch($Mode){
 'start-test' {@'
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM "Loans" WHERE "Row ID"='CG8GUI-Cron-L' AND "Ref Borrowers"='CG8GUI-Cron') THEN RAISE EXCEPTION 'Synthetic fixture missing'; END IF;
 IF EXISTS(SELECT FROM cron.job WHERE jobname='loan-charge-generation-test') THEN RAISE EXCEPTION 'Test job already exists; inspect status'; END IF;
END $$;
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='CG8GUI-Cron-L';
SELECT cron.schedule('loan-charge-generation-test','* * * * *',$job$SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date,ARRAY['CG8GUI-Cron-L']);$job$);
COMMIT;
'@}
 'finish-test' {@'
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM cron.job_run_details d JOIN cron.job j USING(jobid) WHERE j.jobname='loan-charge-generation-test' AND d.status='succeeded') THEN RAISE EXCEPTION 'No successful scheduled test'; END IF;
 IF (SELECT count(*) FROM "Charges" WHERE "Ref Loans"='CG8GUI-Cron-L' AND "Charge Date"=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND "Principal Due"=0::money AND "Interest Due"=20::money)<>1 THEN RAISE EXCEPTION 'Scheduled charge did not reconcile'; END IF;
END $$;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='loan-charge-generation-test';
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='CG8GUI-Cron-L';
COMMIT;
'@}
 'enable-nightly' {@'
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT FROM cron.job WHERE jobname='loan-charge-generation-test') THEN RAISE EXCEPTION 'Finish synthetic scheduler test first'; END IF;
 IF NOT EXISTS(SELECT FROM cron.job_run_details WHERE command LIKE '%CG8GUI-Cron-L%' AND status='succeeded') THEN RAISE EXCEPTION 'Successful scheduled test evidence required'; END IF;
 IF NOT EXISTS(SELECT FROM cron.job WHERE jobname='loan-daily-charges' AND schedule='5 0 * * *' AND database=current_database()) OR current_setting('cron.timezone')<>'Asia/Bangkok' THEN RAISE EXCEPTION 'Unexpected nightly schedule'; END IF;
END $$;
SELECT cron.alter_job(jobid,active:=true) FROM cron.job WHERE jobname='loan-daily-charges';
COMMIT;
'@}
 'pause-nightly' {"SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='loan-daily-charges';"}
 'status' {''}
}
$sql+=@'

SELECT row_to_json(j) FROM (SELECT jobid,jobname,schedule,command,database,active FROM cron.job WHERE jobname IN ('loan-daily-charges','loan-charge-generation-test')) j;
SELECT row_to_json(d) FROM (SELECT jobid,runid,status,return_message,start_time,end_time FROM cron.job_run_details WHERE command LIKE '%CG8GUI-Cron-L%' ORDER BY runid DESC LIMIT 5) d;
'@
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'status'){'-c default_transaction_read_only=on'}else{''}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Development scheduler operation failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
