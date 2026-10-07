[CmdletBinding()]
param([ValidateSet(1,3,4)][int]$Phase=1,[ValidateSet('development','production')][string]$Environment='development')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on'
 $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH x AS (
 SELECT c.*,coalesce(a.p,0) p,coalesce(a.i,0) i,coalesce(a.n,0) n,a.d,l."Loan Status" ls
 FROM public."Charges" c LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
 LEFT JOIN (SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,count(*) n,max("Payment Date") d FROM public."Repayments" GROUP BY "Ref Charges") a ON a.id=c."Row ID"
), y AS (
 SELECT x.*,coalesce("Principal Due"::numeric,0)-p pr,coalesce("Interest Due"::numeric,0)-i ir,
 CASE WHEN ls='ปิดยอดแล้ว' THEN 'ชำระแล้ว' WHEN p+i=0 THEN 'รอชำระ' WHEN coalesce("Principal Due"::numeric,0)+coalesce("Interest Due"::numeric,0)-p-i>0 THEN 'ชำระบางส่วน' ELSE 'ชำระแล้ว' END s FROM x
)
SELECT json_build_object('check','charge_parity','rows',count(*),'mismatches',count(*) FILTER (WHERE
 ROW("Principal Paid","Interest Paid","Total Paid","Principal Remaining","Interest Remaining","Amount Remaining","Payment Count","Payment Status","Payment Date")
 IS DISTINCT FROM ROW(p,i,p+i,pr,ir,pr+ir,n,s,CASE WHEN s='ชำระแล้ว' THEN d END))) FROM y;
WITH x AS (
 SELECT l.*,coalesce(a.p,0) p,coalesce(a.i,0) i,coalesce(a.a,0) a FROM public."Loans" l
 LEFT JOIN (SELECT "Ref Loans" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)) a FROM public."Repayments" GROUP BY "Ref Loans") a ON a.id=l."Row ID"
)
SELECT json_build_object('check','loan_parity','rows',count(*),'mismatches',count(*) FILTER (WHERE
 ROW("Total Principal Received","Total Interest Received","Total Amount Received","Outstanding Principal") IS DISTINCT FROM ROW(p,i,a,coalesce("Principal Amount"::numeric,0)-p))) FROM x;
SELECT format('SELECT json_build_object(''table'',%L,''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(md5((to_jsonb(t)-%L::text[])::text),'''' ORDER BY md5((to_jsonb(t)-%L::text[])::text)),''''))) FROM %I.%I t;',tablename,
 CASE tablename WHEN 'Charges' THEN '{Principal Paid,Interest Paid,Total Paid,Principal Remaining,Interest Remaining,Amount Remaining,Payment Count,Payment Status,Payment Date}' WHEN 'Loans' THEN '{Total Interest Received,Total Principal Received,Outstanding Principal,Total Amount Received}' ELSE '{}' END,
 CASE tablename WHEN 'Charges' THEN '{Principal Paid,Interest Paid,Total Paid,Principal Remaining,Interest Remaining,Amount Remaining,Payment Count,Payment Status,Payment Date}' WHEN 'Loans' THEN '{Total Interest Received,Total Principal Received,Outstanding Principal,Total Amount Received}' ELSE '{}' END,schemaname,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename
\gexec
SELECT json_build_object('check','vc_column','table',table_name,'name',column_name,'position',ordinal_position,'type',data_type)
FROM information_schema.columns WHERE table_schema='public' AND table_name IN('Charges','Loans','Borrowers','Payments') AND column_name IN
('Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date',
'Total Interest Received','Total Principal Received','Outstanding Principal','Total Amount Received','Expected Daily Interest Amount',
'Total Interest Earned','Total Amount Loaned','Total Number of Loans','Total Outstanding Principal','Active Loan Interest Earned','Active Daily Interest','Has Closed Loan','Has Active Loan',
'Planned Allocation Amount','Posted Amount') ORDER BY table_name,ordinal_position;
COMMIT;
'@
 if($Phase -ge 3){
 $extra=@'
WITH loans AS (
 SELECT l.*,coalesce(r.i,0) i,coalesce(r.p,0) p,
 CASE WHEN "Auto Charge Enabled" IS TRUE AND "Loan Status"='ยังไม่ปิดยอด' THEN
 CASE WHEN "Loan Type"='ดอกเบี้ยรายวัน' THEN coalesce("Current Daily Interest"::numeric,0)
 WHEN "Loan Type"='ผ่อนชำระรายวัน' AND "Loan Date" IS NOT NULL AND "Due Date">="Loan Date" AND "Daily Payment Amount"::numeric>0
 THEN "Daily Payment Amount"::numeric-coalesce("Principal Amount"::numeric,0)/("Due Date"-"Loan Date"+1) ELSE 0 END ELSE 0 END d
 FROM "Loans" l LEFT JOIN (SELECT "Ref Loans" id,sum("Interest Paid"::numeric) i,sum("Principal Paid"::numeric) p FROM "Repayments" GROUP BY "Ref Loans") r ON r.id=l."Row ID"
), expected AS (
 SELECT "Ref Borrowers" id,sum(i) i,sum("Principal Amount"::numeric) p,count(*) n,
 sum(coalesce("Principal Amount"::numeric,0)-p) o,sum(i) FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด') ai,
 sum(d) d,bool_or("Loan Status"='ปิดยอดแล้ว') c,bool_or("Loan Status"='ยังไม่ปิดยอด') a FROM loans GROUP BY "Ref Borrowers"
)
SELECT json_build_object('check','borrower_parity','rows',count(*),'mismatches',count(*) FILTER(WHERE
 ROW(b."Total Interest Earned",b."Total Amount Loaned",b."Total Number of Loans",b."Total Outstanding Principal",b."Active Loan Interest Earned",b."Has Closed Loan",b."Has Active Loan")
 IS DISTINCT FROM ROW(coalesce(e.i,0),coalesce(e.p,0),coalesce(e.n,0),coalesce(e.o,0),coalesce(e.ai,0),coalesce(e.c,false),coalesce(e.a,false))
 OR b."Active Daily Interest" IS NULL OR abs(b."Active Daily Interest"-coalesce(e.d,0))>0.00000001)) FROM "Borrowers" b LEFT JOIN expected e ON e.id=b."Row ID"
UNION ALL SELECT json_build_object('check','daily_helper_parity','rows',count(*),'mismatches',count(*) FILTER(WHERE "Expected Daily Interest Amount" IS NULL OR abs("Expected Daily Interest Amount"-d)>0.00000001)) FROM loans;
'@
 $sql=$sql.Replace('SELECT format(', $extra+"`nSELECT format(")
 $sql=$sql.Replace('Outstanding Principal,Total Amount Received}', 'Outstanding Principal,Total Amount Received,Expected Daily Interest Amount}')
 $sql=$sql.Replace("ELSE '{}' END", "WHEN 'Borrowers' THEN '{Total Interest Earned,Total Amount Loaned,Total Number of Loans,Total Outstanding Principal,Active Loan Interest Earned,Active Daily Interest,Has Closed Loan,Has Active Loan}' ELSE '{}' END")
 }
 if($Phase -ge 4){
 $extra=@'
SELECT json_build_object('check','payment_parity','rows',count(*),'mismatches',count(*) FILTER(WHERE
 p."Planned Allocation Amount" IS DISTINCT FROM coalesce(a.v,0) OR p."Posted Amount" IS DISTINCT FROM coalesce(r.v,0)))
 FROM "Payments" p LEFT JOIN (SELECT "Ref Payment" id,sum("Allocated Amount"::numeric) v FROM "Payment Allocations" GROUP BY "Ref Payment") a ON a.id=p."Row ID"
 LEFT JOIN (SELECT "Ref Payment" id,sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)) v FROM "Repayments" GROUP BY "Ref Payment") r ON r.id=p."Row ID";
'@
 $sql=$sql.Replace('SELECT format(', $extra+"`nSELECT format(")
 $sql=$sql.Replace("ELSE '{}' END", "WHEN 'Payments' THEN '{Planned Allocation Amount,Posted Amount}' ELSE '{}' END")
 }
 $result=$sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Balance verification failed'}
 $parsed=@($result|ForEach-Object {$_|ConvertFrom-Json})
 if(@($parsed|Where-Object {($_.PSObject.Properties.Name -contains 'mismatches') -and $_.mismatches -ne 0}).Count){throw 'Stored balance parity failed'}
 $result
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
