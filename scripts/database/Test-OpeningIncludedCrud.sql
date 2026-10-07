\set ON_ERROR_STOP on
-- Disposable pre-V20 sources; never run against DEV/PROD.
BEGIN;
\ir Test-CashAccountFixtures.sql
UPDATE "Cash Accounts" SET "Default Account"=true WHERE "Row ID" IN ('CI-LISA','CI-DAD');
CREATE TEMP TABLE opening_membership_before AS TABLE r005_cash_cutover_sources;
CREATE FUNCTION pg_temp.source_delta(k text) RETURNS numeric LANGUAGE sql AS $$
 SELECT coalesce(sum(CASE WHEN "Ref To Cash Account" IS NOT NULL THEN "Amount" ELSE -"Amount" END),0)
 FROM "Cash Ledger" WHERE "Row ID" LIKE 'r051:opening:%' AND "Notes" LIKE '%"source_id": "'||k||'"%'
$$;
UPDATE "Business Expenses" SET "Amount"=11::money WHERE "Row ID"='R005-OLD-E';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-E')=-1,'expense increases opening outflow only by delta'; END $$;
UPDATE "Business Expenses" SET "Amount"=11::money WHERE "Row ID"='R005-OLD-E';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-E')=-1,'no duplicate on repeated save'; END $$;
UPDATE "Business Expenses" SET "Expense Date"="Expense Date"-1 WHERE "Row ID"='R005-OLD-E';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-E')=-1,'date changes restate timing without changing total'; END $$;
DELETE FROM "Business Expenses" WHERE "Row ID"='R005-OLD-E';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-E')=10,'expense deletion removes original effect exactly once'; END $$;

UPDATE "Settlements" SET "Status"='Cancelled' WHERE "Row ID"='R005-OLD-S';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-S')=100,'cancel captured completed settlement'; END $$;
UPDATE "Settlements" SET "Status"='Completed' WHERE "Row ID"='R005-OLD-S';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-S')=0,'reinstatement nets to original'; END $$;
DELETE FROM "Settlements" WHERE "Row ID"='R005-OLD-S';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-S')=100,'delete captured settlement'; END $$;

UPDATE "Loans" SET "Principal Amount"=11000::money WHERE "Row ID"='R005-OLD-L';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-L')=-1000,'loan only contributes changed principal'; END $$;
UPDATE "Payments" SET "Allocation Method"='Single Partial',"Amount Received"=16000::money WHERE "Row ID"='R005-OLD-P';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-P')=-600,'receipt teardown/repost counted once'; END $$;
UPDATE "Payments" SET "Ref Received By Cash Account"='CI-DAD',"Ref Received By Cash Holder"='ch:dad' WHERE "Row ID"='R005-OLD-P';
DO $$ BEGIN
 ASSERT pg_temp.source_delta('R005-OLD-P')=-600,'account reassignment keeps consolidated total';
 ASSERT (SELECT coalesce(sum(CASE WHEN "Ref To Cash Account"='CI-DAD' THEN "Amount" WHEN "Ref From Cash Account"='CI-DAD' THEN -"Amount" ELSE 0 END),0)=16000 FROM "Cash Ledger" WHERE "Row ID" LIKE 'r051:opening:%' AND "Notes" LIKE '%"source_id": "R005-OLD-P"%'),'new account gets current corrected receipt';
END $$;
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='R005-OLD-P';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-P')=-16600,'atomic receipt delete removes captured original receipt once'; END $$;
DELETE FROM "Loans" WHERE "Row ID"='R005-OLD-L';
DO $$ BEGIN ASSERT pg_temp.source_delta('R005-OLD-L')=10000,'loan delete removes original principal cash effect'; END $$;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT NOT EXISTS((TABLE opening_membership_before EXCEPT TABLE r005_cash_cutover_sources) UNION ALL (TABLE r005_cash_cutover_sources EXCEPT TABLE opening_membership_before)),'original cutover evidence preserved';
 ASSERT NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Source Type" IN ('Payment','Loan','Business Expense','Settlement')),'no full historical cash reprojection';
END $$;
SELECT 'Historical opening CRUD restatement passed' result;
ROLLBACK;
