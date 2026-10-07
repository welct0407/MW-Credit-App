param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
& (Join-Path $PgBin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f "$PSScriptRoot/Test-CashAccountFixtures.sql"
if($LASTEXITCODE){throw 'Cash-account fixture failed'}
$ErrorActionPreference='Stop';$psql=Join-Path $PgBin 'psql.exe'
@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('CG8-CON','SYNTHETIC GENERATION CONCURRENCY');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('CG8-CON-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('CG8-CON-CAPITAL','CG8-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Interest Payment Interval") VALUES ('CI-LISA','CG8-CON-L','CG8-CON',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,1);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='CG8-CON-L';
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
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
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'GENERATION_LOCK_READY')){if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Generation lock barrier failed'};Start-Sleep -Milliseconds 50}
$manual=@'
SET TIME ZONE 'Asia/Bangkok';
UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|concurrent' WHERE "Row ID"='CG8-CON-L';
'@
$watch=[Diagnostics.Stopwatch]::StartNew()
$result=$manual | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
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
'@ | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Generation concurrency assertions failed'}
[pscustomobject]@{manualBusyRequestRejectedWithoutDeadlock=$true;retryProducesNoDuplicate=$true;busyMilliseconds=$watch.Elapsed.TotalMilliseconds}
