[CmdletBinding()]
param([ValidateSet('seed','verify')][string]$Mode='verify')
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
'@}else{@'
BEGIN READ ONLY;
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
COMMIT;
'@}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw "R008 DEV lab $Mode failed"}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
