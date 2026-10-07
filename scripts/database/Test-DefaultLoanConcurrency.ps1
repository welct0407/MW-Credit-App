param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
& (Join-Path $PgBin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f "$PSScriptRoot/Test-CashAccountFixtures.sql"
if($LASTEXITCODE){throw 'Cash-account fixture failed'}
$ErrorActionPreference='Stop';$psql=Join-Path $PgBin 'psql.exe'
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DF10-CON','SYNTHETIC DEFAULT CONCURRENCY');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DF10-CON-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('DF10-CON-CAPITAL','DF10-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Interest Payment Interval") VALUES ('CI-LISA','DF10-CON-L','DF10-CON',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,1);
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

# V69 original-charge corrections serialize with Default/Undo in both orders.
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DF69-CON-B','SYNTHETIC ORIGINAL CHARGE CONCURRENCY');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES('DF69-CON-L','DF69-CON-B',current_date-3,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES('DF69-CON-C','DF69-CON-L',current_date-1,100::money,10::money,'original');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DF69-CON-L';
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Original-charge concurrency setup failed'}
function Invoke-OriginalChargeRace([string]$Label,[string]$First,[string]$Second,[string]$SecondError,[string]$FirstError='') {
 $file=Join-Path $OutputDirectory "$Label.sql";$out=Join-Path $OutputDirectory "$Label.out";$err=Join-Path $OutputDirectory "$Label.err"
 [IO.File]::WriteAllText($file,$First,[Text.UTF8Encoding]::new($false))
 $proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'ORIGINAL_READY')){if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw "$Label barrier failed"};Start-Sleep -Milliseconds 50}
 $result=("SET TIME ZONE 'Asia/Bangkok'; SET statement_timeout='5s';`n"+$Second) | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
 if($SecondError){if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch $SecondError){throw "$Label contender did not reject as expected: $result"}}
 elseif($LASTEXITCODE){throw "$Label contender failed: $result"}
 if(-not $proc.WaitForExit(10000)){throw "$Label holder deadline exceeded"}
 if($FirstError){if($proc.ExitCode -eq 0 -or (Get-Content $err -Raw) -notmatch $FirstError){throw "$Label stale holder did not reject"}}
 elseif($proc.ExitCode){throw "$Label holder failed: $(Get-Content $err -Raw)"}
}
$default="UPDATE `"Loans`" SET `"Defaulted`"=true,`"Close Date`"=current_date,`"Closed By`"='synthetic' WHERE `"Row ID`"='DF69-CON-L';"
$undo="UPDATE `"Loans`" SET `"Defaulted`"=false WHERE `"Row ID`"='DF69-CON-L';"
Invoke-OriginalChargeRace 'original-edit-first' @'
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
UPDATE "Charges" SET "Notes"='edited before default',"Interest Due"=12::money WHERE "Row ID"='DF69-CON-C';
\echo ORIGINAL_READY
SELECT pg_sleep(2);
COMMIT;
'@ $default ''
("SET TIME ZONE 'Asia/Bangkok';`n"+$undo+@'

DO $$ BEGIN
 ASSERT (SELECT "Notes"='edited before default' AND "Interest Due"=12::money FROM "Charges" WHERE "Row ID"='DF69-CON-C'),'Default serialized after edit and Undo restored its committed components';
END $$;
'@) | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Edit-first serialized default restoration failed'}
Invoke-OriginalChargeRace 'original-default-first'  ("SET TIME ZONE 'Asia/Bangkok'; BEGIN;`n"+$default+"`n\echo ORIGINAL_READY`nSELECT pg_sleep(2); COMMIT;") 'UPDATE "Charges" SET "Notes"=''forbidden correction'' WHERE "Row ID"=''DF69-CON-C'';' 'Undo Default'
Invoke-OriginalChargeRace 'original-undo-first' ("SET TIME ZONE 'Asia/Bangkok'; BEGIN;`n"+$undo+"`n\echo ORIGINAL_READY`nSELECT pg_sleep(2); COMMIT;") @'
UPDATE "Charges" SET "Notes"='ordinary edit after concurrent undo' WHERE "Row ID"='DF69-CON-C';
DO $$ BEGIN
 ASSERT (SELECT "Interest Due"=12::money AND "Principal Due"=100::money FROM "Charges" WHERE "Row ID"='DF69-CON-C'),'undo restored committed pre-default correction';
 ASSERT NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Row ID"='df10:10:DF69-CON-L'),'no loss residue';
END $$;
'@ ''
Invoke-OriginalChargeRace 'original-stale-repeatable-read' @'
SET TIME ZONE 'Asia/Bangkok';
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT "Defaulted" FROM "Loans" WHERE "Row ID"='DF69-CON-L';
\echo ORIGINAL_READY
SELECT pg_sleep(2);
UPDATE "Charges" SET "Notes"='stale edit' WHERE "Row ID"='DF69-CON-C';
COMMIT;
'@ $default '' 'could not serialize access'
("SET TIME ZONE 'Asia/Bangkok';`n"+$undo+@'

DO $$ BEGIN
 ASSERT (SELECT "Notes"='ordinary edit after concurrent undo' AND "Interest Due"=12::money FROM "Charges" WHERE "Row ID"='DF69-CON-C');
 ASSERT (SELECT NOT "Defaulted" AND "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"='DF69-CON-L');
END $$;
DELETE FROM "Charges" WHERE "Row ID"='DF69-CON-C';
'@) | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Original-charge concurrency final preservation failed'}
[pscustomobject]@{originalEditFirstDefaultSerializes=$true;defaultFirstRejectsCorrection=$true;undoFirstAllowsOrdinaryCorrection=$true;staleRepeatableReadRejected=$true;ordinaryDeleteAfterUndo=$true}

# V70 independent repayments retain ordinary statement advisory/borrower locks.
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DR70-CON-B','Synthetic legacy repayment concurrency');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES('DR70-CON-L','DR70-CON-B',current_date-3,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES('DR70-CON-C','DR70-CON-L',current_date-2,100::money,10::money,'original');
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid","Notes") VALUES('DR70-CON-R','DR70-CON-L','DR70-CON-C',current_date-1,10::money,2::money,'original repayment');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DR70-CON-L';
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Legacy repayment concurrency setup failed'}
$drDefault="UPDATE `"Loans`" SET `"Defaulted`"=true,`"Close Date`"=current_date,`"Closed By`"='synthetic' WHERE `"Row ID`"='DR70-CON-L';"
$drUndo="UPDATE `"Loans`" SET `"Defaulted`"=false WHERE `"Row ID`"='DR70-CON-L';"
$drDelete='DELETE FROM "Repayments" WHERE "Row ID"=''DR70-CON-R'';'
Invoke-OriginalChargeRace 'repayment-edit-first' @'
SET TIME ZONE 'Asia/Bangkok'; BEGIN;
UPDATE "Repayments" SET "Principal Paid"=11::money,"Notes"='committed correction' WHERE "Row ID"='DR70-CON-R';
\echo ORIGINAL_READY
SELECT pg_sleep(2); COMMIT;
'@ $drDefault 'Cashpool is busy'
("SET TIME ZONE 'Asia/Bangkok';`n"+$drDefault+@'

DO $$ BEGIN
 ASSERT (SELECT "Default Loss Amount"=89::money AND "Outstanding Principal"=0 FROM "Loans" WHERE "Row ID"='DR70-CON-L');
END $$;
'@+$drUndo+@'

DO $$ BEGIN
 ASSERT (SELECT "Outstanding Principal"=89 FROM "Loans" WHERE "Row ID"='DR70-CON-L');
 ASSERT (SELECT "Principal Paid"=11::money AND "Notes"='committed correction' FROM "Repayments" WHERE "Row ID"='DR70-CON-R');
END $$;
'@) | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Repayment edit-first default retry/restoration failed'}
Invoke-OriginalChargeRace 'repayment-default-first' ("SET TIME ZONE 'Asia/Bangkok'; BEGIN;`n"+$drDefault+"`n\echo ORIGINAL_READY`nSELECT pg_sleep(2); COMMIT;") $drDelete 'Cashpool is busy'
@'
DO $$ BEGIN
 BEGIN
  DELETE FROM "Repayments" WHERE "Row ID"='DR70-CON-R';
  RAISE EXCEPTION 'Expected default repayment protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Undo Default%' THEN RAISE; END IF; END;
 ASSERT (SELECT "Principal Paid"=11::money FROM "Repayments" WHERE "Row ID"='DR70-CON-R');
END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Repayment delete retry did not reject while defaulted'}
Invoke-OriginalChargeRace 'repayment-undo-first' ("SET TIME ZONE 'Asia/Bangkok'; BEGIN;`n"+$drUndo+"`n\echo ORIGINAL_READY`nSELECT pg_sleep(2); COMMIT;") 'UPDATE "Repayments" SET "Notes"=''after undo'' WHERE "Row ID"=''DR70-CON-R'';' 'Cashpool is busy'
@'
UPDATE "Repayments" SET "Notes"='after undo' WHERE "Row ID"='DR70-CON-R';
DO $$ BEGIN ASSERT (SELECT "Outstanding Principal"=89 AND NOT "Defaulted" FROM "Loans" WHERE "Row ID"='DR70-CON-L'); END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Repayment edit retry after Undo failed'}
Invoke-OriginalChargeRace 'repayment-stale-repeatable-read' @'
SET TIME ZONE 'Asia/Bangkok';
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT "Defaulted" FROM "Loans" WHERE "Row ID"='DR70-CON-L';
\echo ORIGINAL_READY
SELECT pg_sleep(2);
DELETE FROM "Repayments" WHERE "Row ID"='DR70-CON-R';
COMMIT;
'@ $drDefault '' 'could not serialize access'
# A pure parent lock exercises the new NOWAIT check without disabling other guards.
("SET TIME ZONE 'Asia/Bangkok';`n"+$drUndo) | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Repayment stale test Undo failed'}
Invoke-OriginalChargeRace 'repayment-parent-row-lock' @'
BEGIN;
SELECT "Row ID" FROM "Loans" WHERE "Row ID"='DR70-CON-L' FOR UPDATE;
\echo ORIGINAL_READY
SELECT pg_sleep(2); COMMIT;
'@ $drDelete 'Loan is busy'
@'
DO $$ BEGIN
 ASSERT (SELECT "Principal Paid"=11::money AND "Notes"='after undo' FROM "Repayments" WHERE "Row ID"='DR70-CON-R');
 ASSERT NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Row ID"='df10:10:DR70-CON-L');
END $$;
DELETE FROM "Repayments" WHERE "Row ID"='DR70-CON-R';
DO $$ BEGIN ASSERT (SELECT "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"='DR70-CON-L'); END $$;
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Repayment concurrent preservation/final ordinary deletion failed'}
[pscustomobject]@{repaymentEditFirstDefaultBusyThenRetry=$true;defaultFirstDeleteBusyThenGuarded=$true;undoFirstEditBusyThenAllowed=$true;repaymentStaleRepeatableReadRejected=$true;repaymentParentLockNowait=$true}
