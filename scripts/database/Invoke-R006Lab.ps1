[CmdletBinding()]
param([ValidateSet('inspect','seed','verify','hide')][string]$Mode='inspect')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171' -or $target.instance -ne 'appsheet-pg-dev-20260915'){throw 'DEV identity mismatch'}
$sql=@'
SELECT json_build_object('host',inet_server_addr(),'database',current_database(),'version',(SELECT max(version::integer) FROM flyway_schema_history WHERE success),'date',current_date);
SELECT column_name,data_type FROM information_schema.columns WHERE table_name IN ('Borrowers','Charges','Payments','Loans') AND column_name IN ('Payment Status','Amount Remaining','Payment Date','Loan Arrangement','Ref Loans','Ref Borrowers','Hidden Flag') ORDER BY table_name,column_name;
'@
if($Mode -eq 'seed'){
 if(-not(Test-Path 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/r006-dev-before-fixtures.dump')){throw 'Required DEV snapshot missing'}
 $sql=@'
BEGIN;
INSERT INTO "Borrowers" ("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
SELECT 'R006-'||n,'DEV R006 '||n,'Synthetic R006 regression only','DEV R006 '||n,current_date,false,false FROM unnest(ARRAY['Single','All','Lump','Close','FirstDay','Blank']) n;
INSERT INTO "Loans" ("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Current Daily Interest","Fixed Interest","Transfer Fee","Daily Payment Amount","Interest Payment Interval","Auto Charge Enabled","Defaulted","Created By","Loan Arrangement")
SELECT 'R006-'||n||'-L'||i,'R006-'||n,current_date-5,100,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',10,0,0,0,1,n='Close',false,'welct0407@mw-credit.com','R006 synthetic test; no real loan'
FROM unnest(ARRAY['Single','All','Lump','Close']) n CROSS JOIN generate_series(1,2) i WHERE n IN ('All','Lump') OR i=1;
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due","Notes")
SELECT 'R006-'||n||'-C'||i,'R006-'||n||'-L'||i,CASE WHEN n IN ('Lump','Close') THEN current_date-i ELSE current_date END,20,CASE WHEN n='Close' THEN 0 ELSE 100 END,'R006 synthetic test; no real charge'
FROM unnest(ARRAY['Single','All','Lump','Close']) n CROSS JOIN generate_series(1,2) i WHERE n IN ('All','Lump') OR i=1;
COMMIT;
'@
}
if($Mode -eq 'verify'){
 $sql=@'
SELECT json_build_object('date',current_date,'version',(SELECT max(version::integer) FROM flyway_schema_history WHERE success));
SELECT row_to_json(t) FROM (SELECT p."Row ID",p."Ref Borrower",p."Allocation Method",p."Amount Received"::numeric,p."Status",p."Planned Allocation Amount"::numeric,p."Posted Amount"::numeric,(SELECT count(*) FROM "Payment Allocations" a WHERE a."Ref Payment"=p."Row ID") allocations,(SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID") repayments FROM "Payments" p WHERE p."Ref Borrower" LIKE 'R006-%' ORDER BY p."Created At") t;
SELECT row_to_json(t) FROM (SELECT "Row ID","Loan Status","Ref Closing Payment","Principal Amount"::numeric FROM "Loans" WHERE "Ref Borrowers" LIKE 'R006-%' ORDER BY "Row ID") t;
SELECT row_to_json(t) FROM (SELECT c."Row ID",c."Ref Loans",c."Charge Date",c."Amount Remaining"::numeric,c."Payment Status" FROM "Charges" c JOIN "Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Ref Borrowers" LIKE 'R006-%' ORDER BY c."Row ID") t;
SELECT row_to_json(t) FROM (SELECT a."Row ID",a."Ref Payment",a."Ref Charge",a."Allocation Order",a."Allocated Amount"::numeric FROM "Payment Allocations" a JOIN "Payments" p ON p."Row ID"=a."Ref Payment" WHERE p."Ref Borrower" LIKE 'R006-%' OR p."Row ID"='RwHV5kZ0QSZfOXPr6pesPj' ORDER BY a."Ref Payment",a."Allocation Order") t;
SELECT json_build_object('blankBorrowerCharges',count(*)) FROM "Charges" c JOIN "Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Ref Borrowers"='R006-Blank';
SELECT json_build_object('fixtureBorrowers',count(*),'hidden',count(*) FILTER (WHERE "Hidden Flag")) FROM "Borrowers" WHERE "Row ID" LIKE 'R006-%';
SELECT json_build_object('fixtureLoans',count(*),'autoChargeEnabled',count(*) FILTER (WHERE "Auto Charge Enabled")) FROM "Loans" WHERE "Ref Borrowers" LIKE 'R006-%';
SELECT row_to_json(t) FROM (SELECT p."Row ID",p."Status",p."Allocation Method",count(a."Row ID") AS allocations,count(a."Row ID") FILTER(WHERE a."Allocated Amount"::numeric<=0) AS nonpositive FROM "Payments" p JOIN "Borrowers" b ON b."Row ID"=p."Ref Borrower" LEFT JOIN "Payment Allocations" a ON a."Ref Payment"=p."Row ID" WHERE b."Borrower Name" LIKE 'DEV %' GROUP BY p."Row ID" HAVING count(a."Row ID")=0 OR count(a."Row ID") FILTER(WHERE a."Allocated Amount"::numeric<=0)>0 ORDER BY p."Row ID" LIMIT 12) t;
'@
}
if($Mode -eq 'hide'){
 $sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers" LIKE 'R006-%';
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID" LIKE 'R006-%';
COMMIT;
'@
}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT','PGCLIENTENCODING')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGCLIENTENCODING='UTF8'
 $env:PGOPTIONS='-c timezone=Asia/Bangkok'
 if($Mode -in @('inspect','verify')){$env:PGOPTIONS+=' -c default_transaction_read_only=on'}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R006 lab failed'}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
