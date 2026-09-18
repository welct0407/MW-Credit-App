[CmdletBinding()]
param([ValidateSet('seed','seed2','seed3','seed4','seed5','verify')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'R008 lab must use verified DEV host'}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=if($Mode -eq 'seed'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Cash Accounts"),'Seed only an empty R008 account master';
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID" LIKE 'R008GUI-%'),'R008 GUI fixtures already exist';
END $$;
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Sort Order") VALUES
 ('r008gui:dad1','ch:dad','DEV Dad Account 1','Synthetic Bank',1),('r008gui:dad2','ch:dad','DEV Dad Account 2','Synthetic Bank',2),
 ('r008gui:lisa','ch:lisa','DEV Lisa Account','Synthetic Bank',1),('r008gui:tommy','ch:tommy','DEV Tommy Account','Synthetic Bank',1);
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R008GUI-A','R008 Synthetic Preferred 1','r008gui:dad1'),('R008GUI-B','R008 Synthetic Preferred 2','r008gui:dad2'),('R008GUI-C','R008 Synthetic Default',NULL);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account") VALUES
 ('R008GUI-LA','R008GUI-A',current_date-2,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,'r008gui:lisa'),
 ('R008GUI-LB','R008GUI-B',current_date-2,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,'r008gui:lisa'),
 ('R008GUI-LC','R008GUI-C',current_date-2,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,'r008gui:lisa');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R008GUI-CA1','R008GUI-LA',current_date-1,0::money,30::money),('R008GUI-CA2','R008GUI-LA',current_date,0::money,20::money),
 ('R008GUI-CB1','R008GUI-LB',current_date,0::money,40::money),('R008GUI-CC1','R008GUI-LC',current_date,0::money,50::money);
COMMIT;
SELECT 'Synthetic R008 accounts and three GUI borrowers seeded; no account openings inferred' result;
'@}elseif($Mode -eq 'seed2'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID" IN ('R008GUI-D','R008GUI-E','R008GUI-F','R008GUI-G','R008GUI-H')),'Second GUI fixture batch already exists';
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R008GUI-D','R008 Synthetic Single Full','r008gui:dad2'),
 ('R008GUI-E','R008 Synthetic Partial','r008gui:dad1'),
 ('R008GUI-F','R008 Synthetic Lump Sum',NULL),
 ('R008GUI-G','R008 Synthetic First Day',NULL),
 ('R008GUI-H','R008 Synthetic Loan Close','r008gui:dad2');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
SELECT 'R008GUI-L'||v.code,'R008GUI-'||v.code,current_date-2,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',v.code='H',10::money,'r008gui:lisa'
FROM (VALUES ('D'),('E'),('F'),('H')) v(code);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'R008GUI-C'||v.code||'1','R008GUI-L'||v.code,current_date,0::money,30::money
FROM (VALUES ('D'),('E'),('F'),('H')) v(code);
COMMIT;
SELECT 'Second synthetic GUI batch seeded; no historical financial rows changed' result;
'@}elseif($Mode -eq 'seed3'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID" IN ('R008GUI-I','R008GUI-J','R008GUI-K')),'Final notification fixtures already exist';
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R008GUI-I','R008 Notify Receive All','r008gui:dad1'),
 ('R008GUI-J','R008 Notify Single Full','r008gui:dad2'),
 ('R008GUI-K','R008 Notify Loan Close',NULL);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
SELECT 'R008GUI-L'||v.code,'R008GUI-'||v.code,current_date-1,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',v.code='K',10::money,'r008gui:lisa'
FROM (VALUES ('I'),('J'),('K')) v(code);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'R008GUI-C'||v.code||'1','R008GUI-L'||v.code,current_date,0::money,30::money FROM (VALUES ('I'),('J'),('K')) v(code);
COMMIT;
SELECT 'Final synthetic quick-command notification fixtures seeded' result;
'@}elseif($Mode -eq 'seed4'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID"='R008GUI-L'),'Loan-close notification retest fixture already exists';
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R008GUI-L','R008 Notify Close Final','r008gui:dad2');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account") VALUES
 ('R008GUI-LL','R008GUI-L',current_date-1,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',true,10::money,'r008gui:lisa');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R008GUI-CL1','R008GUI-LL',current_date,0::money,30::money);
COMMIT;
SELECT 'Loan-close notification retest fixture seeded' result;
'@}elseif($Mode -eq 'seed5'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID"='R008GUI-M'),'Default/performance fixture already exists';
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('R008GUI-M','R008 Final Default UX');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account") VALUES
 ('R008GUI-LM','R008GUI-M',current_date-1,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,'r008gui:lisa');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R008GUI-CM1','R008GUI-LM',current_date,0::money,25::money);
COMMIT;
SELECT 'Final default/performance fixture seeded' result;
'@}else{@'
BEGIN READ ONLY;
SELECT json_build_object('custodyCorrectionReceipt',p."Row ID",'amount',p."Amount Received"::numeric,'account',p."Ref Received By Cash Account",'holder',p."Ref Received By Cash Holder",'notes',p."Notes",
 'repaymentCount',(SELECT count(*) FROM "Repayments" WHERE "Ref Payment"=p."Row ID"),
 'repaid',(SELECT sum("Interest Paid"::numeric+"Principal Paid"::numeric) FROM "Repayments" WHERE "Ref Payment"=p."Row ID"),
 'ledger',(SELECT json_agg(json_build_object('amount',"Amount"::numeric,'account',"Ref To Cash Account",'holder',"Ref To Cash Holder")) FROM "Cash Ledger" WHERE "Ref Payment"=p."Row ID"))
 FROM "Payments" p WHERE p."Row ID"='3vDYFamdywqPlAWH5aWhIv';
SELECT json_build_object('schemaVersion',(SELECT max(version::int) FROM flyway_schema_history WHERE success),
 'syntheticAccounts',(SELECT count(*) FROM "Cash Accounts" WHERE "Row ID" LIKE 'r008gui:%'),
 'syntheticBorrowers',(SELECT count(*) FROM "Borrowers" WHERE "Row ID" LIKE 'R008GUI-%'),
 'postedSyntheticPayments',(SELECT count(*) FROM "Payments" WHERE "Ref Borrower" LIKE 'R008GUI-%' AND "Status"='Posted'),
 'holderAccountMismatch',(SELECT count(*) FROM "Payments" p JOIN "Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account" WHERE p."Ref Received By Cash Holder" IS DISTINCT FROM a."Ref Cash Holder"));
SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT "Row ID", "Ref Borrower", "Allocation Method", "Status", "Amount Received"::numeric,
 "Ref Received By Cash Account", "Ref Received By Cash Holder"
 FROM "Payments" WHERE "Ref Borrower" LIKE 'R008GUI-%' ORDER BY "Created At", "Row ID"
) x;
SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT "Row ID", "Account Label", "Ref Cash Holder", "Default Account", "Active"
 FROM "Cash Accounts" WHERE "Bank Name"='Synthetic Bank' ORDER BY "Account Label"
) x;
SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT "Row ID", "Ref Borrowers", "Loan Status", "Principal Amount"::numeric,
 "Ref Disbursed From Cash Account", "Auto Charge Enabled", "Close Date", "Ref Closing Payment"
 FROM "Loans" WHERE "Ref Borrowers" LIKE 'R008GUI-%' ORDER BY "Row ID"
) x;
SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT "Row ID", "Movement Type", "Amount"::numeric, "Ref From Cash Holder", "Ref To Cash Holder",
 "Ref From Cash Account", "Ref To Cash Account", "Notes"
 FROM "Cash Ledger" WHERE "Notes" LIKE 'R008 GUI synthetic%' ORDER BY "Row ID"
) x;
SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT "Row ID", "Status", "Amount"::numeric, "Ref Paid From Cash Account", "Transfer Date"
 FROM "Settlements" WHERE "Notes" LIKE 'R008 GUI synthetic%'
) x;
SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT "Row ID", "Movement Type", "Amount"::numeric, "Ref From Cash Account", "Ref To Cash Account"
 FROM "Cash Ledger" WHERE "Ref Settlement" IN (SELECT "Row ID" FROM "Settlements" WHERE "Notes" LIKE 'R008 GUI synthetic%')
) x;
COMMIT;
'@}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw "R008 DEV lab $Mode failed"}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
