\set ON_ERROR_STOP on
-- Disposable only. No trigger bypasses; keep INSERT behavior unchanged.
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.dr_reject(q text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Undo Default%' THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected default repayment protection'; END $$;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DR70-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('DR70-CAP','DR70-A',current_date,'Contribution',1000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DR70-B','Synthetic default repayment');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account","Defaulted")
SELECT 'DR70-'||x,'DR70-B',current_date-3,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA',false FROM unnest(ARRAY['L','OTHER']) x;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
SELECT 'DR70-'||x||'-C','DR70-'||x,current_date-2,100::money,10::money,'original' FROM unnest(ARRAY['L','OTHER']) x;
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid","Notes") VALUES
('DR70-R','DR70-L','DR70-L-C',current_date-1,10::money,2::money,'legacy'),
('DR70-OTHER-R','DR70-OTHER','DR70-OTHER-C',current_date-1,0::money,1::money,'other'),
-- Historical independent rows can have only one of the two parent references.
('DR70-LOAN-ONLY','DR70-L',NULL,current_date-1,0::money,0::money,'loan-only'),
('DR70-CHARGE-ONLY',NULL,'DR70-L-C',current_date-1,0::money,0::money,'charge-only');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE dr_loan AS SELECT to_jsonb(t) r FROM "Loans" t WHERE "Row ID"='DR70-L';
CREATE TEMP TABLE dr_charge AS SELECT to_jsonb(t) r FROM "Charges" t WHERE "Row ID"='DR70-L-C';
CREATE TEMP TABLE dr_repayment AS SELECT to_jsonb(t) r FROM "Repayments" t WHERE "Row ID" LIKE 'DR70-%';
CREATE TEMP TABLE dr_cash AS SELECT to_jsonb(t) r FROM "Cash Ledger" t;
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DR70-L';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DR70-L';
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='DR70-L';
DO $$ BEGIN ASSERT (SELECT "Default Loss Amount"=90::money AND "Outstanding Principal"=0 FROM "Loans" WHERE "Row ID"='DR70-L'); END $$;
CREATE TEMP TABLE dr_closed AS SELECT to_jsonb(t) r FROM "Loans" t WHERE "Row ID"='DR70-L';
SELECT pg_temp.dr_reject($q$DELETE FROM "Repayments" WHERE "Row ID"='DR70-R'$q$);
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Principal Paid"=9::money WHERE "Row ID"='DR70-R'$q$);
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Notes"='changed' WHERE "Row ID"='DR70-R'$q$);
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Row ID"='DR70-RENAMED' WHERE "Row ID"='DR70-R'$q$);
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Ref Loans"='DR70-OTHER',"Ref Charges"='DR70-OTHER-C' WHERE "Row ID"='DR70-R'$q$);
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Ref Loans"=NULL,"Ref Charges"=NULL WHERE "Row ID"='DR70-R'$q$);
SELECT pg_temp.dr_reject($q$DELETE FROM "Repayments" WHERE "Row ID"='DR70-LOAN-ONLY'$q$);
SELECT pg_temp.dr_reject($q$DELETE FROM "Repayments" WHERE "Row ID"='DR70-CHARGE-ONLY'$q$);
-- Target via either reference alone must reject, even with a stale other ref.
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Ref Loans"='DR70-L' WHERE "Row ID"='DR70-OTHER-R'$q$);
SELECT pg_temp.dr_reject($q$UPDATE "Repayments" SET "Ref Charges"='DR70-L-C' WHERE "Row ID"='DR70-OTHER-R'$q$);
-- Deterministic last-statement failure rolls back the earlier ordinary edit.
DO $$ BEGIN
 BEGIN
  UPDATE "Repayments" SET "Notes"='must roll back' WHERE "Row ID"='DR70-OTHER-R';
  DELETE FROM "Repayments" WHERE "Row ID"='DR70-R';
  RAISE EXCEPTION 'Expected default repayment protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Undo Default%' THEN RAISE; END IF; END;
 ASSERT (SELECT "Notes"='other' FROM "Repayments" WHERE "Row ID"='DR70-OTHER-R');
 ASSERT (SELECT to_jsonb(t) FROM "Loans" t WHERE "Row ID"='DR70-L')=(SELECT r FROM dr_closed);
 ASSERT NOT EXISTS((SELECT r FROM dr_repayment EXCEPT SELECT to_jsonb(t) FROM "Repayments" t WHERE "Row ID" LIKE 'DR70-%') UNION ALL (SELECT to_jsonb(t) FROM "Repayments" t WHERE "Row ID" LIKE 'DR70-%' EXCEPT SELECT r FROM dr_repayment));
END $$;
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DR70-L';
DO $$ BEGIN
 ASSERT (SELECT to_jsonb(t) FROM "Loans" t WHERE "Row ID"='DR70-L')=(SELECT r FROM dr_loan),'Undo restores paid outstanding90';
 ASSERT (SELECT to_jsonb(t) FROM "Charges" t WHERE "Row ID"='DR70-L-C')=(SELECT r FROM dr_charge);
 ASSERT NOT EXISTS((SELECT r FROM dr_cash EXCEPT SELECT to_jsonb(t) FROM "Cash Ledger" t) UNION ALL (SELECT to_jsonb(t) FROM "Cash Ledger" t EXCEPT SELECT r FROM dr_cash));
 ASSERT NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Row ID"='df10:6:DR70-L');
END $$;
UPDATE "Repayments" SET "Notes"='ordinary after Undo',"Principal Paid"=11::money WHERE "Row ID"='DR70-R';
UPDATE "Repayments" SET "Ref Loans"='DR70-OTHER',"Ref Charges"='DR70-OTHER-C' WHERE "Row ID"='DR70-R';
DO $$ BEGIN
 ASSERT (SELECT "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"='DR70-L');
 ASSERT (SELECT "Outstanding Principal"=89 FROM "Loans" WHERE "Row ID"='DR70-OTHER');
END $$;
DELETE FROM "Repayments" WHERE "Row ID" IN ('DR70-R','DR70-LOAN-ONLY','DR70-CHARGE-ONLY');
DELETE FROM "Charges" WHERE "Row ID"='DR70-L-C';
DELETE FROM "Loans" WHERE "Row ID"='DR70-L';
ROLLBACK;
SELECT 'Default repayment guard and post-Undo CRUD passed' AS result;
