[CmdletBinding()]
param([ValidateSet('backup','seed','verify')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'R009 lab is restricted to verified DEV'}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r009-20260919'
 $dump=Join-Path $private 'dev-before-fixtures.dump'
 if($Mode -eq 'backup'){
  New-Item -ItemType Directory -Force -Path $private | Out-Null
  if(Test-Path -LiteralPath $dump){throw 'Backup exists; never overwrite'}
  & (Join-Path (Get-PgBin) 'pg_dump.exe') -h $target.host -p $target.port -U $target.user -d $target.database -Fc -f $dump
  if($LASTEXITCODE){throw 'Backup failed'}
  & (Join-Path (Get-PgBin) 'pg_restore.exe') --list $dump | Out-Null
  if($LASTEXITCODE){throw 'Backup archive listing failed'}
  [pscustomobject]@{environment='development';host=$target.host;backup=$dump;sha256=(Get-FileHash $dump).Hash;archiveListing='passed';restoreTest='not performed'} | ConvertTo-Json
  return
 }
 if($Mode -eq 'seed' -and -not(Test-Path -LiteralPath $dump)){throw 'Run backup before seeding'}
 $sql=if($Mode -eq 'seed'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID" LIKE 'R009GUI-%'),'Fixtures already exist';
 ASSERT EXISTS(SELECT 1 FROM "Cash Accounts" WHERE "Row ID"='r008gui:dad2' AND "Active"),'Expected DEV synthetic account missing';
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R009GUI-A','R009 Receive All Zero Closure','r008gui:dad2'),
 ('R009GUI-B','R009 Receive All One Closure','r008gui:dad2'),
 ('R009GUI-C','R009 Single Full Zero Closure','r008gui:dad2'),
 ('R009GUI-D','R009 Single Full One Closure','r008gui:dad2'),
 ('R009GUI-E','R009 Loan Close One Closure','r008gui:dad2');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
SELECT 'R009GUI-L'||code,'R009GUI-'||code,current_date-1,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,'r008gui:lisa'
FROM (VALUES ('A'),('B'),('C'),('D'),('E')) v(code);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'R009GUI-C'||code,'R009GUI-L'||code,current_date,(CASE WHEN code IN ('B','D') THEN 100 ELSE 0 END)::money,10::money
FROM (VALUES ('A'),('B'),('C'),('D'),('E')) v(code);
COMMIT;
SELECT 'Five R009 synthetic notification fixtures seeded; auto-charge disabled' result;
'@}else{@'
BEGIN READ ONLY;
WITH commands AS (
 SELECT 'Borrowers' kind,"Row ID" id,"Payment Request Token" token FROM "Borrowers" WHERE "Row ID" IN ('R009GUI-A','R009GUI-B')
 UNION ALL SELECT 'Charges',"Row ID","Payment Request Token" FROM "Charges" WHERE "Row ID" IN ('R009GUI-CC','R009GUI-CD')
 UNION ALL SELECT 'Loans',"Row ID","Payment Request Token" FROM "Loans" WHERE "Row ID"='R009GUI-LE'
), resolved AS (
 SELECT c.*,p."Row ID" receipt,p."Created By" actor FROM commands c LEFT JOIN "Payments" p
 ON p."Row ID"='r008:'||c.kind||'|'||length(c.id)||':'||c.id||'|'||c.token
)
SELECT json_build_object('check','origin row receipt identity and recipient exclusion SQL cross-check',
 'commandCount',count(*),'resolvedCount',count(receipt),
 'allActorsOwner',bool_and(actor='welct0407@mw-credit.com'),
 'creatorWouldBeExcluded',bool_and(NOT EXISTS(SELECT 1 FROM "Partners" p WHERE coalesce(p."Email",'')<>'' AND p."Email"<>r.actor AND p."Email"=r.actor)),
 'otherPartnerWouldRemain',bool_and(EXISTS(SELECT 1 FROM "Partners" p WHERE coalesce(p."Email",'')<>'' AND p."Email"<>r.actor))) FROM resolved r;
SELECT json_build_object('flyway',(SELECT max(version::int) FROM flyway_schema_history WHERE success),
 'payments',(SELECT coalesce(json_agg(x),'[]'::json) FROM (
 SELECT p."Ref Borrower" borrower,p."Row ID" receipt,p."Status" status,p."Posted Amount"::numeric amount,
 (p."Created By"='welct0407@mw-credit.com') owner_actor,
 (SELECT count(*) FROM "Loans" l WHERE l."Ref Closing Payment"=p."Row ID") closures
 FROM "Payments" p WHERE p."Ref Borrower" LIKE 'R009GUI-%' ORDER BY p."Ref Borrower") x));
COMMIT;
'@}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw "R009 $Mode failed"}
} finally {foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
