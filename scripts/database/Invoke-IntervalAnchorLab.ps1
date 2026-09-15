[CmdletBinding()]
param([ValidateSet('inspect','seed','verify','close')][string]$Mode='inspect')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=@'
SELECT column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='Loans' AND column_name='Interest Schedule Anchor Date';
SELECT count(*) AS other_potential_charge_candidates FROM "Loans" l WHERE l."Auto Charge Enabled" AND l."Loan Status"='ยังไม่ปิดยอด' AND l."Ref Borrowers"<>'ANCHOR26' AND NOT EXISTS(SELECT 1 FROM "Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"=current_date) AND (l."Loan Type"<>'ดอกเบี้ยรายวัน' OR (l."Current Daily Interest"::numeric>0 AND current_date>coalesce(l."Interest Schedule Anchor Date",l."Loan Date") AND mod(current_date-coalesce(l."Interest Schedule Anchor Date",l."Loan Date"),nullif(l."Interest Payment Interval",0))=0));
'@
if($Mode -eq 'seed'){
$sql=@'
BEGIN;
INSERT INTO "Borrowers" ("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled") VALUES
('ANCHOR26','DEV Interval Anchor','Synthetic interval regression','DEV Interval Anchor',current_date,false,false);
INSERT INTO "Loans" ("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Current Daily Interest","Fixed Interest","Transfer Fee","Daily Payment Amount","Interest Payment Interval","Auto Charge Enabled","Defaulted","Interest Schedule Anchor Date") VALUES
('ANCHOR26-FUTURE','ANCHOR26',current_date-12,1000,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',10,0,0,0,3,true,false,current_date-1),
('ANCHOR26-DUE','ANCHOR26',current_date-11,1000,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',20,0,0,0,3,true,false,current_date-3),
('ANCHOR26-LEGACY','ANCHOR26',current_date-6,1000,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',30,0,0,0,3,true,false,NULL),
('ANCHOR26-OFF','ANCHOR26',current_date-6,1000,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',40,0,0,0,3,false,false,current_date-3);
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due","Notes") VALUES
('ANCHOR26-FUTURE-BASE','ANCHOR26-FUTURE',current_date-1,10,0,'Synthetic history before interval change'),
('ANCHOR26-DUE-BASE','ANCHOR26-DUE',current_date-3,20,0,'Synthetic history before interval change'),
('ANCHOR26-LEGACY-BASE','ANCHOR26-LEGACY',current_date-3,30,0,'Synthetic original schedule'),
('ANCHOR26-OFF-BASE','ANCHOR26-OFF',current_date-3,40,0,'Synthetic disabled auto-charge');
COMMIT;
'@
}
if($Mode -eq 'verify'){
$sql=@'
SELECT l."Row ID",l."Loan Date",l."Interest Schedule Anchor Date",l."Interest Payment Interval",l."Auto Charge Enabled",c."Charge Date",c."Interest Due"::numeric,c."Principal Due"::numeric FROM "Loans" l LEFT JOIN "Charges" c ON c."Ref Loans"=l."Row ID" WHERE l."Ref Borrowers"='ANCHOR26' ORDER BY l."Row ID",c."Charge Date";
SELECT count(*) AS duplicate_groups FROM (SELECT "Ref Loans","Charge Date" FROM "Charges" WHERE "Ref Loans" LIKE 'ANCHOR26-%' GROUP BY 1,2 HAVING count(*)>1) q;
'@
}
if($Mode -eq 'close'){
$sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers"='ANCHOR26' AND "Row ID" IN ('ANCHOR26-FUTURE','ANCHOR26-DUE','ANCHOR26-LEGACY','ANCHOR26-OFF');
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID"='ANCHOR26';
COMMIT;
'@
}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 if($Mode -in @('inspect','verify')){$env:PGOPTIONS='-c default_transaction_read_only=on'}else{$env:PGOPTIONS=''}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -h $target.host -U $target.user -d $target.database -v ON_ERROR_STOP=1
 if($LASTEXITCODE){throw 'Development interval lab SQL failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
