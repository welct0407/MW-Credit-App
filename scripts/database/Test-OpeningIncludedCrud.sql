\set ON_ERROR_STOP on
-- Disposable pre-V20 fixture upgraded through the current immutable chain.
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.reject(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF position('historical cash opening' in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Opening-included correction was not rejected'; END $$;
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Ref Received By Cash Account"='CI-DAD' WHERE "Row ID"='R005-OLD-P'$q$);
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='R005-OLD-P'$q$);
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Amount Received"=16000::money WHERE "Row ID"='R005-OLD-P'$q$);
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Principal Amount"=11000::money WHERE "Row ID"='R005-OLD-L'$q$);
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Loan Date"="Loan Date"-1 WHERE "Row ID"='R005-OLD-L'$q$);
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Ref Disbursed From Cash Account"='CI-LISA' WHERE "Row ID"='R005-OLD-L'$q$);
SELECT pg_temp.reject($q$UPDATE "Business Expenses" SET "Amount"=11::money WHERE "Row ID"='R005-OLD-E'$q$);
SELECT pg_temp.reject($q$UPDATE "Business Expenses" SET "Expense Date"="Expense Date"-1 WHERE "Row ID"='R005-OLD-E'$q$);
SELECT pg_temp.reject($q$UPDATE "Business Expenses" SET "Ref Paid By Cash Account"='CI-LISA' WHERE "Row ID"='R005-OLD-E'$q$);
SELECT pg_temp.reject($q$UPDATE "Settlements" SET "Amount"=101::money WHERE "Row ID"='R005-OLD-S'$q$);
SELECT pg_temp.reject($q$UPDATE "Settlements" SET "Transfer Date"="Transfer Date"-1 WHERE "Row ID"='R005-OLD-S'$q$);
SELECT pg_temp.reject($q$UPDATE "Settlements" SET "Status"='Cancelled' WHERE "Row ID"='R005-OLD-S'$q$);
SELECT pg_temp.reject($q$UPDATE "Settlements" SET "Ref Paid From Cash Account"='CI-LISA' WHERE "Row ID"='R005-OLD-S'$q$);
UPDATE "Payments" SET "Notes"='Synthetic metadata remains editable' WHERE "Row ID"='R005-OLD-P';
UPDATE "Loans" SET "Loan Arrangement"='Synthetic metadata remains editable' WHERE "Row ID"='R005-OLD-L';
UPDATE "Business Expenses" SET "Notes"='Synthetic metadata remains editable' WHERE "Row ID"='R005-OLD-E';
UPDATE "Settlements" SET "Notes"='Synthetic metadata remains editable' WHERE "Row ID"='R005-OLD-S';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN ASSERT NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Source Type" IN ('Payment','Loan','Business Expense','Settlement')),'metadata fabricated historic cash'; END $$;
SELECT 'Opening-included CRUD safeguards passed' result;
ROLLBACK;
