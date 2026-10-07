BEGIN;
SET LOCAL timezone='Asia/Bangkok';
CREATE TEMP TABLE dr_upgrade_cash AS SELECT to_jsonb(t) r FROM "Cash Ledger" t;
DO $$ BEGIN
 ASSERT (SELECT "Defaulted" AND NOT "Auto Charge Enabled" AND "Default Loss Amount"=90::money FROM "Loans" WHERE "Row ID"='DR70-OLD-L');
 BEGIN
  DELETE FROM "Repayments" WHERE "Row ID"='DR70-OLD-R';
  RAISE EXCEPTION 'Expected legacy repayment protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Undo Default%' THEN RAISE; END IF; END;
 ASSERT (SELECT "Principal Paid"=10::money AND "Interest Paid"=2::money AND "Created By"='synthetic' FROM "Repayments" WHERE "Row ID"='DR70-OLD-R');
END $$;
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DR70-OLD-L';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT (SELECT NOT "Defaulted" AND NOT "Auto Charge Enabled" AND "Outstanding Principal"=90 AND "Current Daily Interest"=9::money FROM "Loans" WHERE "Row ID"='DR70-OLD-L');
 ASSERT (SELECT "Principal Due"=100::money AND "Interest Due"=10::money AND "Notes"='original' FROM "Charges" WHERE "Row ID"='DR70-OLD-C');
 ASSERT (SELECT count(*)=1 FROM "Repayments" WHERE "Ref Loans"='DR70-OLD-L');
 ASSERT NOT EXISTS((SELECT r FROM dr_upgrade_cash EXCEPT SELECT to_jsonb(t) FROM "Cash Ledger" t) UNION ALL (SELECT to_jsonb(t) FROM "Cash Ledger" t EXCEPT SELECT r FROM dr_upgrade_cash));
END $$;
UPDATE "Repayments" SET "Notes"='ordinary after upgrade Undo' WHERE "Row ID"='DR70-OLD-R';
DELETE FROM "Repayments" WHERE "Row ID"='DR70-OLD-R';
ROLLBACK;
SELECT 'V69 to V70 existing legacy repayment preservation passed' AS result;
