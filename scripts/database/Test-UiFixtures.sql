\set ON_ERROR_STOP on
-- Disposable test only. The actual GUI runner never adds this funding fixture.
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('UI-R051-LOCAL','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('UI-R051-LOCAL','UI-R051-LOCAL',current_date-30,'Contribution',10000::money);
\ir R051-UiFixtures.sql
DO $$ BEGIN
 ASSERT (SELECT count(*)=2 FROM "Payments" WHERE "Row ID" IN ('SYN-R051-UI-P1','SYN-R051-UI-P2') AND "Status"='Posted'),'GUI receipts posted';
 ASSERT (SELECT "Ref Charge"='SYN-R051-UI-C2' FROM "Payment Allocations" WHERE "Ref Payment"='SYN-R051-UI-P2'),'GUI initial allocation';
END $$;
\ir R051-UiCleanup.sql
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID"='SYN-R051-UI-B'),'GUI source cleanup';
 ASSERT NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment" IN ('SYN-R051-UI-P1','SYN-R051-UI-P2') OR "Ref Loan" IN ('SYN-R051-UI-L1','SYN-R051-UI-L2') OR "Ref Business Expense"='SYN-R051-UI-E'),'GUI owned cash cleanup';
END $$;
ROLLBACK;
