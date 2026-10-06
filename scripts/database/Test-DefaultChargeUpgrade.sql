-- No guard bypass: seed committed under V68, then verify after V69 migration.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
DO $$ BEGIN
 ASSERT (SELECT "Defaulted" FROM "Loans" WHERE "Row ID"='DF69-OLD-L');
 ASSERT (SELECT "Notes" IS NULL FROM "Charges" WHERE "Row ID"='DF69-OLD-PAID');
 BEGIN
  UPDATE "Charges" SET "Notes"='now forbidden' WHERE "Row ID"='DF69-OLD-PAID';
  RAISE EXCEPTION 'Expected original charge protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Undo Default%' THEN RAISE; END IF; END;
END $$;
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DF69-OLD-L';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT (SELECT "Outstanding Principal"=100 AND "Current Daily Interest"=10::money AND NOT "Defaulted" FROM "Loans" WHERE "Row ID"='DF69-OLD-L');
 ASSERT (SELECT "Interest Due"=10::money AND "Principal Due"=0::money AND "Notes" IS NULL FROM "Charges" WHERE "Row ID"='DF69-OLD-PAID');
 ASSERT (SELECT "Principal Due"=100::money AND "Interest Due"=10::money AND "Notes" IS NULL FROM "Charges" WHERE "Row ID"='DF69-OLD-DUE');
 ASSERT (SELECT count(*)=1 FROM "Repayments" WHERE "Ref Loans"='DF69-OLD-L');
 ASSERT (SELECT count(*)=1 FROM "Cash Ledger" WHERE "Ref Loan"='DF69-OLD-L');
END $$;
ROLLBACK;
SELECT 'V68 to V69 legacy default undo passed' AS result;
