[CmdletBinding()]
param([ValidateSet('seed','verify')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'DEV host mismatch'}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=if($Mode -eq 'seed') {@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT (SELECT bool_and("Email"='welct0407@mw-credit.com') FROM "Partners"),'DEV recipient isolation missing';
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID" LIKE 'R009IDENT-%'),'Already seeded';
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R009IDENT-F','R009 Shared Email Full Closure','r008gui:dad2'),
 ('R009IDENT-G','R009 Shared Email No Closure','r008gui:dad2');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
SELECT 'R009IDENT-L'||code,'R009IDENT-'||code,current_date-1,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,'r008gui:lisa'
FROM (VALUES ('F'),('G')) v(code);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'R009IDENT-C'||code,'R009IDENT-L'||code,current_date,(CASE WHEN code='F' THEN 100 ELSE 0 END)::money,10::money
FROM (VALUES ('F'),('G')) v(code);
COMMIT;
'@}else{@'
BEGIN READ ONLY;
SELECT json_build_object('partnerCount',count(*),'uniqueLoginCount',count(DISTINCT lower(btrim("Login Email"))),
 'ownerOnlyDelivery',bool_and("Email"='welct0407@mw-credit.com')) FROM "Partners";
SELECT json_build_object('actorRole',actor."Partner Role",'eligiblePartners',count(recipient.*),
 'uniqueDeliveryAddresses',count(DISTINCT recipient."Email"),'ownerOnly',bool_and(recipient."Email"='welct0407@mw-credit.com'))
 FROM "Partners" actor JOIN "Partners" recipient ON recipient."Row ID"<>actor."Row ID" AND nullif(btrim(recipient."Email"),'') IS NOT NULL
 GROUP BY actor."Partner Role" ORDER BY actor."Partner Role";
SELECT json_build_object('receipt',p."Row ID",'status',p."Status",'ownerActor',p."Created By"='welct0407@mw-credit.com',
 'mappedActor',EXISTS(SELECT 1 FROM "Partners" WHERE lower(btrim("Login Email"))=lower(btrim(p."Created By"))),
 'closureCount',(SELECT count(*) FROM "Loans" l WHERE l."Ref Closing Payment"=p."Row ID"))
 FROM "Payments" p WHERE p."Ref Borrower" LIKE 'R009IDENT-%' ORDER BY p."Row ID";
COMMIT;
'@}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Identity lab failed'}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
