[CmdletBinding()]
param([ValidateSet('Seed','Read','AuditOriginal')][string]$Mode='Read')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'development'
if ($target.host -ne '34.158.38.171' -or $target.instance -ne 'appsheet-pg-dev-20260915') { throw 'Re-review fixture destination after an environment replacement' }
$saved=@{PGPASSWORD=$env:PGPASSWORD;PGSSLMODE=$env:PGSSLMODE;PGCONNECT_TIMEOUT=$env:PGCONNECT_TIMEOUT;PGCLIENTENCODING=$env:PGCLIENTENCODING}
try {
  $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
  $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGCLIENTENCODING='UTF8'
  if ($Mode -eq 'Seed') {
    # Synthetic setup only. Payment submissions and measurements use the new GUI.
    $sql=@'
BEGIN;
INSERT INTO "Borrowers" ("Row ID","Borrower Name","Description","Creation Date","Hidden Flag","AI Collection Enabled") VALUES
('LS26-BENCH','LS26 BENCHMARK SYNTHETIC','Lump-sum Dev benchmark; no contact details',current_date,false,false),
('LS26-CHECK','LS26 CORRECTNESS SYNTHETIC','Lump-sum Dev review; no contact details',current_date,false,false);
INSERT INTO "Loans" ("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Current Daily Interest","Fixed Interest","Transfer Fee","Daily Payment Amount","Interest Payment Interval","Auto Charge Enabled","Defaulted") VALUES
('LS26-LB','LS26-BENCH',current_date-10,100000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',0::money,0::money,0::money,0::money,1,false,false),
('LS26-L1','LS26-CHECK',current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',0::money,0::money,0::money,0::money,1,false,false),
('LS26-L2','LS26-CHECK',current_date-10,200::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',0::money,0::money,0::money,0::money,1,false,false);
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due","Notes")
SELECT 'LS26-B'||n,'LS26-LB',current_date-n,CASE WHEN n=0 THEN 100000 ELSE 100 END::money,CASE WHEN n=0 THEN 100000 ELSE 0 END::money,'LS26 synthetic six-charge benchmark' FROM generate_series(0,5) n;
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due","Notes") VALUES
('LS26-A','LS26-L1',current_date-2,10::money,100::money,'LS26 oldest'),
('LS26-B','LS26-L2',current_date-1,20::money,100::money,'LS26 same-date lower key'),
('LS26-C','LS26-L2',current_date-1,30::money,100::money,'LS26 same-date higher key'),
('LS26-F','LS26-L2',current_date+1,50::money,0::money,'LS26 future excluded');
COMMIT;
'@
  } elseif ($Mode -eq 'AuditOriginal') {
    $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format('SELECT json_build_object(''table'',%L,''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),''''))) FROM %I.%I t WHERE %s;',tablename,schemaname,tablename,
CASE WHEN tablename IN ('Borrowers','Loans','Charges') THEN 't."Row ID" NOT LIKE ''LS26-%'''
WHEN tablename='Payments' THEN 't."Ref Borrower" IS NULL OR t."Ref Borrower" NOT IN (''LS26-BENCH'',''LS26-CHECK'')'
WHEN tablename IN ('Payment Allocations','Repayments') THEN 'NOT EXISTS (SELECT 1 FROM "Payments" p WHERE p."Row ID"=t."Ref Payment" AND p."Ref Borrower" IN (''LS26-BENCH'',''LS26-CHECK''))'
ELSE 'true' END)
FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename
\gexec
COMMIT;
'@
  } else {
    $sql=@'
BEGIN READ ONLY;
SELECT json_build_object('receipt',p."Row ID",'borrower',p."Ref Borrower",'note',p."Notes",'status',p."Status",'amount',p."Amount Received"::numeric,
'allocations',(SELECT count(*) FROM "Payment Allocations" a WHERE a."Ref Payment"=p."Row ID"),
'allocated',(SELECT sum(a."Allocated Amount"::numeric) FROM "Payment Allocations" a WHERE a."Ref Payment"=p."Row ID"),
'repayments',(SELECT count(*) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID"),
'posted',(SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID"))
FROM "Payments" p WHERE p."Ref Borrower" IN ('LS26-BENCH','LS26-CHECK') ORDER BY p."Created At",p."Row ID";
SELECT json_build_object('charge',c."Row ID",'interest_remaining',c."Interest Due"::numeric-coalesce(sum(r."Interest Paid"::numeric),0),'principal_remaining',c."Principal Due"::numeric-coalesce(sum(r."Principal Paid"::numeric),0))
FROM "Charges" c LEFT JOIN "Repayments" r ON r."Ref Charges"=c."Row ID" WHERE c."Row ID" LIKE 'LS26-%' GROUP BY c."Row ID" ORDER BY c."Row ID";
SELECT json_build_object('loan',"Row ID",'status',"Loan Status",'close_date',"Close Date") FROM "Loans" WHERE "Row ID" LIKE 'LS26-%';
SELECT json_build_object('receipt_note',p."Notes",'charge',a."Ref Charge",'order',a."Allocation Order",'snapshot_order',a."Charge Row Number Snapshot",'interest',a."Allocated Interest"::numeric,'principal',a."Allocated Principal"::numeric,'amount',a."Allocated Amount"::numeric,'ledger_matches',r."Interest Paid"=a."Allocated Interest" AND r."Principal Paid"=a."Allocated Principal" AND r."Ref Charges"=a."Ref Charge" AND r."Ref Payment"=a."Ref Payment")
FROM "Payments" p JOIN "Payment Allocations" a ON a."Ref Payment"=p."Row ID" LEFT JOIN "Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
WHERE p."Ref Borrower"='LS26-CHECK' ORDER BY p."Created At",a."Allocation Order";
COMMIT;
'@
  }
  $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database)
  if ($LASTEXITCODE) { throw 'Development lump-sum lab command failed; inspect before retry' }
} finally { foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')} }
