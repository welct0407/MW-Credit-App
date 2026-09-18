param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
# Deliberately loopback-only; called by the disposable migration runner.
function Invoke-LocalSql([string]$Sql){
 $Sql | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
 if($LASTEXITCODE){throw 'R008 local fixture/assertion failed'}
}
function Test-R008Race([string]$Name,[string]$First,[string]$Second,[string]$Expected,[string]$Check){
 $file=Join-Path $OutputDirectory "r008-$Name.sql"
 [IO.File]::WriteAllText($file,"BEGIN;`n$First;`n\echo R008_LOCK_READY`nSELECT pg_sleep(3);`nCOMMIT;",[Text.UTF8Encoding]::new($false))
 $out=Join-Path $OutputDirectory "r008-$Name.out"; $err=Join-Path $OutputDirectory "r008-$Name.err"
 $proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 try{
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'R008_LOCK_READY')){
   if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw "R008 $Name barrier failed"}
   Start-Sleep -Milliseconds 50
  }
  $timer=[Diagnostics.Stopwatch]::StartNew()
  $result=("SET statement_timeout='8s';`n"+$Second) | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
  $timer.Stop()
  if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch $Expected){throw "R008 $Name did not reject competing write as expected: $result"}
  $proc.WaitForExit();if($proc.ExitCode){throw "R008 $Name first transaction failed"}
  Invoke-LocalSql $Check
  [pscustomobject]@{test=$Name;competingWriteRejected=$true;reconciliationPassed=$true;elapsedMs=[math]::Round($timer.Elapsed.TotalMilliseconds)}
 }finally{if(-not $proc.HasExited){$proc.WaitForExit(10000)|Out-Null}}
}
Invoke-LocalSql @'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('R008-CON-B','Synthetic concurrency');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('R008-CON-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R008-CON-CAP','R008-CON-A',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Auto Charge Enabled","Ref Disbursed From Cash Account") VALUES('R008-CON-L','R008-CON-B',current_date,100::money,false,'R008-L1');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R008-CON-C','R008-CON-L',current_date,0::money,100::money);
'@
Test-R008Race 'default' 'UPDATE "Cash Accounts" SET "Default Account"=true WHERE "Row ID"=''R008-D2''' 'INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Default Account") VALUES(''R008-D3'',''ch:dad'',''Synthetic concurrent'',''Synthetic'',true);' 'busy' @'
DO $$ BEGIN ASSERT (SELECT count(*)=1 FROM "Cash Accounts" WHERE "Ref Cash Holder"='ch:dad' AND "Default Account"),'one concurrent default'; END $$;
'@
Test-R008Race 'duplicate-receipt' 'UPDATE "Borrowers" SET "Payment Request Cash Account"=''R008-D1'',"Payment Request Token"=(statement_timestamp() AT TIME ZONE ''Asia/Bangkok'')::date||''|concurrent01'' WHERE "Row ID"=''R008-CON-B''' 'UPDATE "Borrowers" SET "Payment Request Cash Account"=''R008-D2'',"Payment Request Token"=(statement_timestamp() AT TIME ZONE ''Asia/Bangkok'')::date||''|concurrent02'' WHERE "Row ID"=''R008-CON-B'';' 'No eligible balance' @'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND sum("Amount Received"::numeric)=100 FROM "Payments" WHERE "Ref Borrower"='R008-CON-B'),'one posted receipt';
 ASSERT (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=100 FROM "Repayments" WHERE "Ref Charges"='R008-CON-C'),'no duplicated repayment';
 ASSERT (SELECT count(*)=1 FROM "Cash Ledger" l JOIN "Payments" p ON p."Row ID"=l."Ref Payment" WHERE p."Ref Borrower"='R008-CON-B'),'one cash receipt';
END $$;
'@
