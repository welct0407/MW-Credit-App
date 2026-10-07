param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
# Requires the R005 pre-migration synthetic fixture; never accepts a remote host.
$setup=@'
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('R005-CON-L','R005-BOR',current_date,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R005-CON-C','R005-CON-L',current_date,1000::money,100::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('R005-CON-P','R005-BOR','R005-CON-C',current_date,50::money,'Single Partial','Processing');
CREATE TABLE public.r005_test_repayments AS SELECT * FROM "Repayments" WHERE "Ref Payment"='R005-CON-P';
CREATE TABLE public.r005_test_allocations AS SELECT * FROM "Payment Allocations" WHERE "Ref Payment"='R005-CON-P';
'@
$setup | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'R005 concurrency fixture failed'}
$first=@'
BEGIN;
UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:lisa' WHERE "Row ID"='R005-CON-P';
\echo R005_LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'r005-concurrent-first.sql'
[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'r005-concurrent-first.out'; $err=Join-Path $OutputDirectory 'r005-concurrent-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(15)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'R005_LOCK_READY')) {
 if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'R005 lock barrier failed'}
 Start-Sleep -Milliseconds 50
}
$second=@'
SET statement_timeout='10s';
UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:dad' WHERE "Row ID"='R005-CON-P';
UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:dad' WHERE "Row ID"='R005-CON-P';
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND bool_and("Ref To Cash Holder"='ch:dad' AND "Amount"=50) FROM "Cash Ledger" WHERE "Ref Payment"='R005-CON-P'),'one ledger agrees with final serialized receiver';
 ASSERT NOT EXISTS((SELECT * FROM "Repayments" WHERE "Ref Payment"='R005-CON-P' EXCEPT TABLE r005_test_repayments) UNION ALL (TABLE r005_test_repayments EXCEPT SELECT * FROM "Repayments" WHERE "Ref Payment"='R005-CON-P')),'concurrent receiver changes preserve repayments';
 ASSERT NOT EXISTS((SELECT * FROM "Payment Allocations" WHERE "Ref Payment"='R005-CON-P' EXCEPT TABLE r005_test_allocations) UNION ALL (TABLE r005_test_allocations EXCEPT SELECT * FROM "Payment Allocations" WHERE "Ref Payment"='R005-CON-P')),'concurrent receiver changes preserve allocations';
END $$;
DROP TABLE public.r005_test_repayments,public.r005_test_allocations;
'@
$timer=[Diagnostics.Stopwatch]::StartNew()
$second | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
$timer.Stop()
if($LASTEXITCODE){throw 'R005 concurrent receiver assertions failed'}
$proc.WaitForExit(); if($proc.ExitCode){throw 'R005 first receiver update failed'}
[pscustomobject]@{simultaneousReceiverUpdates=$true;retryIdempotent=$true;allocationAndRepaymentsUnchanged=$true;elapsedMilliseconds=$timer.Elapsed.TotalMilliseconds}

function Test-SerializedCashSource([string]$Name,[string]$FirstCommand,[string]$RetryCommand,[string]$Assertions){
 $file=Join-Path $OutputDirectory ("r005-$Name-first.sql")
 $first="BEGIN;`n"+$FirstCommand+";`n\echo R005_SOURCE_LOCK_READY`nSELECT pg_sleep(3);`nCOMMIT;"
 [IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
 $out=Join-Path $OutputDirectory ("r005-$Name-first.out");$err=Join-Path $OutputDirectory ("r005-$Name-first.err")
 $proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'R005_SOURCE_LOCK_READY')){
  if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw "R005 $Name lock barrier failed"}
  Start-Sleep -Milliseconds 50
 }
 $timer=[Diagnostics.Stopwatch]::StartNew()
 $result=$RetryCommand | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
 $timer.Stop()
 if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'Partner allocation is busy'){throw "R005 $Name concurrent write did not fail safely"}
 if($timer.Elapsed.TotalSeconds -ge 2){throw "R005 $Name concurrent write did not fail promptly"}
 $proc.WaitForExit();if($proc.ExitCode){throw "R005 $Name first source change failed"}
 ($RetryCommand+";`n"+$RetryCommand+";`n"+$Assertions) | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
 if($LASTEXITCODE){throw "R005 $Name retry/reconciliation failed"}
 [pscustomobject]@{source=$Name;busyWriteRejected=$true;repeatedRetryReconciled=$true;busyMilliseconds=$timer.Elapsed.TotalMilliseconds}
}
$setup=@'
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Holder") VALUES('R005-CON-E',current_date,'Other',100::money,'ch:dad');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date") VALUES('R005-CON-S','R005-A',100::money,'Pending',current_date);
'@
$setup | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'R005 additional concurrency fixture failed'}
Test-SerializedCashSource -Name 'expense' -FirstCommand 'UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"=''ch:lisa'' WHERE "Row ID"=''R005-CON-E''' -RetryCommand 'UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"=''ch:tommy'' WHERE "Row ID"=''R005-CON-E''' -Assertions @'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND bool_and("Amount"=100 AND "Ref From Cash Holder"='ch:tommy') FROM "Cash Ledger" WHERE "Ref Business Expense"='R005-CON-E'),'expense retry updates one movement';
 ASSERT (SELECT "Partner A Expense"::numeric=60 AND "Partner B Expense"::numeric=40 FROM "Business Expenses" WHERE "Row ID"='R005-CON-E'),'payer concurrency preserves allocation';
END $$;
'@
Test-SerializedCashSource -Name 'settlement' -FirstCommand 'UPDATE "Settlements" SET "Status"=''Completed'',"Transfer Date"=current_date WHERE "Row ID"=''R005-CON-S''' -RetryCommand 'UPDATE "Settlements" SET "Status"=''Completed'',"Transfer Date"=current_date WHERE "Row ID"=''R005-CON-S''' -Assertions @'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND bool_and("Amount"=100 AND "Ref From Cash Holder"='ch:lisa' AND "Ref To Cash Holder" IS NULL) FROM "Cash Ledger" WHERE "Ref Settlement"='R005-CON-S'),'repeated concurrent completion cannot double-post';
END $$;
'@
