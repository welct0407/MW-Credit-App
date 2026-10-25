param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory,[ValidateSet('postgres','loan_manager_dev','payment_rehearsal')][string]$Database='postgres')
& (Join-Path $PgBin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -f "$PSScriptRoot/Test-CashAccountFixtures.sql"
if($LASTEXITCODE){throw 'Cash-account fixture failed'}
$ErrorActionPreference='Stop';$psql=Join-Path $PgBin 'psql.exe'
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('CG8-CON','SYNTHETIC GENERATION CONCURRENCY');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('CG8-CON-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('CG8-CON-CAPITAL','CG8-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Interest Payment Interval") VALUES ('CI-LISA','CG8-CON-L','CG8-CON',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,1);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='CG8-CON-L';
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database
if($LASTEXITCODE){throw 'Generation concurrency setup failed'}
$first=@'
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
SELECT "Row ID" FROM "Borrowers" WHERE "Row ID"='CG8-CON' FOR UPDATE;
\echo GENERATION_LOCK_READY
SELECT pg_sleep(3);
SELECT public.generate_loan_charge('CG8-CON-L',current_date);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'generation-first.sql';[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'generation-first.out';$err=Join-Path $OutputDirectory 'generation-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d',$Database,'-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'GENERATION_LOCK_READY')){if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Generation lock barrier failed'};Start-Sleep -Milliseconds 50}
$manual=@'
SET TIME ZONE 'Asia/Bangkok';
UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|concurrent' WHERE "Row ID"='CG8-CON-L';
'@
$watch=[Diagnostics.Stopwatch]::StartNew()
$result=$manual | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'Loan is busy'){throw 'Manual generation did not fail safely behind a borrower lock'}
$watch.Stop();if($watch.Elapsed.TotalSeconds -ge 2){throw 'Manual generation waited instead of using NOWAIT'}
$proc.WaitForExit();if($proc.ExitCode){throw 'Concurrent scheduled generation failed'}
@'
SET TIME ZONE 'Asia/Bangkok';
UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|retry' WHERE "Row ID"='CG8-CON-L';
DO $$ BEGIN
ASSERT public.generate_due_charges(current_date,ARRAY['CG8-CON-L'])=0,'scheduled retry is no-op';
ASSERT (SELECT count(*)=1 AND sum("Interest Due"::numeric)=20 FROM "Charges" WHERE "Ref Loans"='CG8-CON-L'),'one generated charge';
ASSERT (SELECT "Charge Generation Request"=current_date::text||'|retry' FROM "Loans" WHERE "Row ID"='CG8-CON-L'),'manual retry succeeds';
END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database
if($LASTEXITCODE){throw 'Generation concurrency assertions failed'}
# R101 (V112): two v9 payments that book the same next projected charge. The second waits on the borrower lock, then
# finds the charge recorded and is rejected as selection_unavailable: one charge row, no duplicate, no deadlock.
# The DEV capability grants (app-role-policy.mjs) are emulated for the run and removed afterwards; the migration-owned
# grants (pwa_row_changes SELECT, V112's forecast_schedule_v1 and pwa_next_projected_charge_v1 EXECUTE) are left as they were.
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('CG8-PCP','SYNTHETIC PROJECTED CONCURRENCY');
INSERT INTO "Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('CG8-PCP-ACT','Synthetic projected actor','A','cg8-pcp@example.invalid');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('CG8-PCP-CAPITAL','CG8-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Interest Payment Interval") VALUES ('CI-LISA','CG8-PCP-L','CG8-PCP',current_date-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,7);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='CG8-PCP-L';
DO $$DECLARE t text;BEGIN
 GRANT USAGE ON SCHEMA public TO mw_app_dev;
 FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m') AND c.relname NOT IN ('Cash Ledger','pwa_payment_commands','r005_cash_cutover_sources','r008_cash_account_cutover','pwa_row_changes') LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO mw_app_dev',t);END LOOP;
 FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='S' AND c.relname<>'pwa_row_changes_seq_seq' LOOP
  EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE public.%I TO mw_app_dev',t);END LOOP;
 GRANT SELECT ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover TO mw_app_dev;
 GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;
END $$;
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND min(charge_id)='cg8:9:CG8-PCP-L:'||to_char(current_date+4,'YYYY-MM-DD') AND min(interest_due)=70 FROM public.pwa_next_projected_charge_v1('CG8-PCP',current_date)),'one projected charge offered';
END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database
if($LASTEXITCODE){throw 'Projected charge concurrency setup failed'}
# The canonical v9 command (services/contracts/payment-command.mjs) for one request id, as a SQL expression.
$command=@'
'{"contractVersion":1,"command":{"schemaVersion":9,"requestId":"REQUEST","borrowerId":"CG8-PCP","allocations":[{"chargeId":"cg8:9:CG8-PCP-L:'||to_char(current_date+4,'YYYY-MM-DD')||'","principal":"0","interest":"70","expectedPrincipalRemaining":"0","expectedInterestRemaining":"70","chargeDate":"'||to_char(current_date+4,'YYYY-MM-DD')||'"}],"cashAccountId":"CI-LISA","paymentDate":"'||to_char(current_date,'YYYY-MM-DD')||'","amountReceived":"70","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null,"payerLines":null,"materialize":[{"loanId":"CG8-PCP-L","chargeId":"cg8:9:CG8-PCP-L:'||to_char(current_date+4,'YYYY-MM-DD')||'","chargeDate":"'||to_char(current_date+4,'YYYY-MM-DD')||'","principalDue":"0","interestDue":"70"}]},"actor":{"issuer":"https://cg8-pcp.invalid","subject":"cg8-pcp","partnerId":"CG8-PCP-ACT","loginEmail":"cg8-pcp@example.invalid"},"receipt":null}'
'@
$firstPaying=@'
SET TIME ZONE 'Asia/Bangkok';
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
BEGIN;
SELECT public.pwa_submit_selected_charges_v1(COMMAND)->'originalOutcome'->>'status' AS first_status;
\echo PROJECTED_LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@.Replace('COMMAND',$command.Trim().Replace('REQUEST','c1111111-1111-4111-8111-111111111111'))
$file=Join-Path $OutputDirectory 'projected-first.sql';[IO.File]::WriteAllText($file,$firstPaying,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'projected-first.out';$err=Join-Path $OutputDirectory 'projected-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d',$Database,'-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'PROJECTED_LOCK_READY')){if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Projected charge lock barrier failed'};Start-Sleep -Milliseconds 50}
$second=@'
SET TIME ZONE 'Asia/Bangkok';
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
SELECT (public.pwa_submit_selected_charges_v1(COMMAND)->'originalOutcome')::text AS second_outcome;
'@.Replace('COMMAND',$command.Trim().Replace('REQUEST','c1111111-1111-4111-8111-111111111112'))
$projectedWatch=[Diagnostics.Stopwatch]::StartNew()
$secondResult=($second | & $psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database 2>&1) -join "`n"
if($LASTEXITCODE){throw "Second projected payment failed: $secondResult"}
$projectedWatch.Stop()
$proc.WaitForExit();if($proc.ExitCode){throw 'First projected payment failed'}
if(-not((Get-Content $out -Raw)-match 'posted')){throw 'First projected payment did not post'}
if($secondResult -notmatch '"status": "rejected"' -or $secondResult -notmatch '"code": "selection_unavailable"'){throw "Second projected payment must be selection_unavailable: $secondResult"}
if($projectedWatch.Elapsed.TotalSeconds -lt 1){throw 'Second projected payment did not wait for the borrower lock'}
@'
SET TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
ASSERT (SELECT count(*)=1 FROM "Charges" WHERE "Ref Loans"='CG8-PCP-L' AND "Charge Date"=current_date+4),'one booked charge';
ASSERT (SELECT "Amount Remaining"::numeric=0 FROM "Charges" WHERE "Row ID"='cg8:9:CG8-PCP-L:'||to_char(current_date+4,'YYYY-MM-DD')),'booked charge paid once';
ASSERT (SELECT count(*)=1 FROM "Payments" WHERE "Ref Borrower"='CG8-PCP'),'one payment';
ASSERT public.generate_due_charges(current_date+4,ARRAY['CG8-PCP-L'])=0,'schedule adds no duplicate';
END $$;
DO $$DECLARE t text;BEGIN
 FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S') AND c.relname NOT IN ('pwa_row_changes','pwa_row_changes_seq_seq') LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM mw_app_dev',t);END LOOP;
 REVOKE EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM mw_app_dev;
END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database
if($LASTEXITCODE){throw 'Projected charge concurrency assertions failed'}
[pscustomobject]@{manualBusyRequestRejectedWithoutDeadlock=$true;retryProducesNoDuplicate=$true;busyMilliseconds=$watch.Elapsed.TotalMilliseconds;projectedSecondPaymentRejected=$true;projectedWaitMilliseconds=$projectedWatch.Elapsed.TotalMilliseconds}
