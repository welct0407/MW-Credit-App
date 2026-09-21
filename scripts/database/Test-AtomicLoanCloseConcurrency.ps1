param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
& (Join-Path $PgBin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f "$PSScriptRoot/Test-CashAccountFixtures.sql"
if($LASTEXITCODE){throw 'Cash-account fixture failed'}
$ErrorActionPreference='Stop';$psql=Join-Path $PgBin 'psql.exe'
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('AC7-CON','SYNTHETIC CLOSE CONCURRENCY');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('AC7-CON-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('AC7-CON-CAPITAL','AC7-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled") VALUES ('CI-LISA','AC7-CON-L','AC7-CON',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='AC7-CON-L';
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Atomic close concurrency setup failed'}
$first=@'
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Allocation Method","Payment Date","Status") VALUES ('CI-DAD','AC7-CON-P1','AC7-CON','AC7-CON-L','Loan Close',current_date,'Processing');
\echo CLOSE_LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'close-concurrent-first.sql';[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'close-concurrent-first.out';$err=Join-Path $OutputDirectory 'close-concurrent-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'CLOSE_LOCK_READY')){if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Close lock barrier failed'};Start-Sleep -Milliseconds 50}
$second=@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Allocation Method","Payment Date","Status") VALUES ('CI-DAD','AC7-CON-P2','AC7-CON','AC7-CON-L','Loan Close',current_date,'Processing');
'@
$result=$second | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'open auto-enabled'){throw 'Concurrent duplicate close was not rejected'}
$proc.WaitForExit();if($proc.ExitCode){throw 'First close failed'}
@'
DO $$ BEGIN
ASSERT (SELECT count(*)=1 FROM "Charges" WHERE "Ref Loans"='AC7-CON-L'),'one final charge';
ASSERT (SELECT count(*)=1 FROM "Payments" WHERE "Ref Borrower"='AC7-CON'),'one final receipt';
ASSERT (SELECT sum("Principal Paid"::numeric)=100 AND sum("Interest Paid"::numeric)=20 FROM "Repayments" WHERE "Ref Loans"='AC7-CON-L'),'one final ledger';
ASSERT (SELECT "Ref Closing Payment"='AC7-CON-P1' FROM "Loans" WHERE "Row ID"='AC7-CON-L'),'correct winning close reference';
END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Atomic close concurrency assertions failed'}
[pscustomobject]@{concurrentDuplicateCloseRejected=$true;oneFinalChargeAndReceipt=$true}
