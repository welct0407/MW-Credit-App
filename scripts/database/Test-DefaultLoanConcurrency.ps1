param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$psql=Join-Path $PgBin 'psql.exe'
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DF10-CON','SYNTHETIC DEFAULT CONCURRENCY');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DF10-CON-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('DF10-CON-CAPITAL','DF10-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Interest Payment Interval")
VALUES('DF10-CON-L','DF10-CON',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,1);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DF10-CON-L';
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Default concurrency setup failed'}
$first=@'
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
SELECT "Row ID" FROM "Borrowers" WHERE "Row ID"='DF10-CON' FOR UPDATE;
\echo DEFAULT_LOCK_READY
SELECT pg_sleep(3);
SELECT public.generate_loan_charge('DF10-CON-L',current_date);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'default-first.sql';[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'default-first.out';$err=Join-Path $OutputDirectory 'default-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'DEFAULT_LOCK_READY')){if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Generation lock barrier failed'};Start-Sleep -Milliseconds 50}
$manual=@'
SET TIME ZONE 'Asia/Bangkok';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-CON-L';
'@
$watch=[Diagnostics.Stopwatch]::StartNew()
$result=$manual | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'Borrower is busy'){throw 'Default did not fail safely behind a borrower lock'}
$watch.Stop();if($watch.Elapsed.TotalSeconds -ge 2){throw 'Default waited instead of using NOWAIT'}
$proc.WaitForExit();if($proc.ExitCode){throw 'Concurrent scheduled generation failed'}
@'
SET TIME ZONE 'Asia/Bangkok';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-CON-L';
DO $$ BEGIN
ASSERT public.generate_due_charges(current_date,ARRAY['DF10-CON-L'])=0,'scheduled retry is no-op';
ASSERT (SELECT count(*)=2 AND sum("Principal Due"::numeric+"Interest Due"::numeric)=0 FROM "Charges" WHERE "Ref Loans"='DF10-CON-L'),'generated charge written off plus one loss charge';
ASSERT (SELECT "Defaulted" AND "Default Loss Amount"::numeric=100 FROM "Loans" WHERE "Row ID"='DF10-CON-L'),'default retry succeeds';
END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Default concurrency assertions failed'}
[pscustomobject]@{manualBusyRequestRejectedWithoutDeadlock=$true;retryProducesNoDuplicate=$true;busyMilliseconds=$watch.Elapsed.TotalMilliseconds}
