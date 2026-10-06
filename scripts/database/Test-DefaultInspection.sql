\set ON_ERROR_STOP on
-- Disposable/local only: correct actor semantics and the normal atomic setup path.
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.inspect_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Default inspection: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.inspect_reject(q text,expected text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected default inspection rejection: %',expected; END $$;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('INSPECT69-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('INSPECT69-CAP','INSPECT69-A',current_date,'Contribution',1000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('INSPECT69-B','Synthetic default inspection');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account","Defaulted") VALUES
 ('INSPECT69-L','INSPECT69-B',current_date-1,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES('INSPECT69-C','INSPECT69-L',current_date,100::money,10::money,'Preserve exact original');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE inspect_loan AS SELECT to_jsonb(l) row FROM "Loans" l WHERE "Row ID"='INSPECT69-L';
CREATE TEMP TABLE inspect_charge AS SELECT to_jsonb(c) row FROM "Charges" c WHERE "Row ID"='INSPECT69-C';
CREATE TEMP TABLE inspect_cash AS SELECT to_jsonb(c) row FROM "Cash Ledger" c ORDER BY "Row ID";
SELECT pg_temp.inspect_reject($q$UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='INSPECT69-L'$q$,'open auto-enabled');
SELECT pg_temp.inspect_assert((SELECT to_jsonb(l) FROM "Loans" l WHERE "Row ID"='INSPECT69-L')=(SELECT row FROM inspect_loan),'all-false rejection restores source');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='INSPECT69-L';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='INSPECT69-L';
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='INSPECT69-L';
SELECT pg_temp.inspect_assert((SELECT "Defaulted" AND NOT "Auto Charge Enabled" AND "Default Loss Amount"=100::money AND "Outstanding Principal"=0 AND "Closed By"='synthetic@example.invalid' AND "Close Date"=current_date FROM "Loans" WHERE "Row ID"='INSPECT69-L'),'defaulted auto-false state/actor/date');
SELECT pg_temp.inspect_assert((SELECT (substring("Notes" from 'Default write-off (\{[^\n]*\})$')::jsonb->>'actor')='synthetic@example.invalid' AND "Principal Due"=0::money AND "Interest Due"=0::money FROM "Charges" WHERE "Row ID"='INSPECT69-C'),'original restoration evidence carries actor');
SELECT pg_temp.inspect_assert((SELECT "Principal Due"=100::money AND "Interest Due"=(-100)::money AND "Charge Date"=current_date AND "Notes"='Loan default - outstanding principal recorded as loss; zero cash' FROM "Charges" WHERE "Row ID"='df10:11:INSPECT69-L'),'loss charge generic note is not an actor field');
SELECT pg_temp.inspect_assert((SELECT "Principal Paid"=100::money AND "Interest Paid"=(-100)::money AND "Created By"='synthetic@example.invalid' AND "Payment Date"=current_date FROM "Repayments" WHERE "Row ID"='df10:11:INSPECT69-L'),'loss repayment carries actor/date');
SELECT pg_temp.inspect_reject($q$DELETE FROM "Loans" WHERE "Row ID"='INSPECT69-L'$q$,'Undo Default');
SELECT pg_temp.inspect_reject($q$DELETE FROM "Charges" WHERE "Row ID"='INSPECT69-C'$q$,'Undo Default');
SELECT pg_temp.inspect_reject($q$DELETE FROM "Repayments" WHERE "Row ID"='df10:11:INSPECT69-L'$q$,'immutable');
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='INSPECT69-L';
SELECT pg_temp.inspect_assert((SELECT to_jsonb(l) FROM "Loans" l WHERE "Row ID"='INSPECT69-L')=(SELECT row FROM inspect_loan),'Undo exactly restores auto-false source');
SELECT pg_temp.inspect_assert((SELECT to_jsonb(c) FROM "Charges" c WHERE "Row ID"='INSPECT69-C')=(SELECT row FROM inspect_charge),'Undo exactly restores original charge');
SELECT pg_temp.inspect_assert(NOT EXISTS((SELECT to_jsonb(c) FROM "Cash Ledger" c EXCEPT SELECT row FROM inspect_cash) UNION ALL (SELECT row FROM inspect_cash EXCEPT SELECT to_jsonb(c) FROM "Cash Ledger" c)),'setup/Undo cash unchanged');
DELETE FROM "Loans" WHERE "Row ID"='INSPECT69-L';
SELECT pg_temp.inspect_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Row ID"='INSPECT69-C') AND NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Loan"='INSPECT69-L'),'post-Undo unpaid parent deletion retains legitimate owned cleanup');
SELECT 'Default inspection actor and source transitions passed' AS result;
ROLLBACK;
