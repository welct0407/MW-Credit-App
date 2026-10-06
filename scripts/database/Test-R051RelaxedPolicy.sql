\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('REL71-A','A'),('REL71-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('REL71-CA','REL71-A',current_date-2,'Contribution',100::money),
 ('REL71-CB','REL71-B',current_date-2,'Contribution',100::money);
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name")
 VALUES('REL71-T','ch:tommy','Synthetic R051 Tommy','Synthetic');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder")
 VALUES('REL71-E',current_date,'Other / อื่น ๆ',20::money,'REL71-T','ch:tommy');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense","Notes")
 VALUES('REL71-R',current_date,'Expense Reimbursement',5,'ch:lisa','ch:tommy','CI-LISA','REL71-T','REL71-E','Keep this original note');
CREATE TEMP TABLE rel71_transfer AS SELECT to_jsonb(l) value FROM "Cash Ledger" l WHERE "Row ID"='REL71-R';
CREATE TEMP TABLE rel71_cash AS SELECT * FROM "Cash Holder Balances" WHERE "Ref Cash Holder" IN ('ch:lisa','ch:tommy');
DELETE FROM "Business Expenses" WHERE "Row ID"='REL71-E';
DELETE FROM "Business Expenses" WHERE "Row ID"='REL71-E'; -- retry is a no-op
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Row ID"='REL71-E');
 ASSERT NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Entry Origin"='System' AND "Source Key"='EXPENSE:REL71-E');
 ASSERT (SELECT (to_jsonb(l)-ARRAY['Ref Business Expense','Notes','Updated At'])=(b.value-ARRAY['Ref Business Expense','Notes','Updated At'])
  AND l."Ref Business Expense" IS NULL AND l."Notes" LIKE 'Keep this original note%' AND l."Notes" LIKE '%REL71-E%'
  FROM "Cash Ledger" l CROSS JOIN rel71_transfer b WHERE "Row ID"='REL71-R'),'transfer amount/accounts/date/audit remain; source ID recoverable';
 ASSERT (SELECT n."Current Balance"=o."Current Balance" FROM "Cash Holder Balances" n JOIN rel71_cash o USING("Ref Cash Holder") WHERE n."Ref Cash Holder"='ch:lisa'),'no invented Lisa refund';
 ASSERT (SELECT n."Current Balance"=o."Current Balance"+20 FROM "Cash Holder Balances" n JOIN rel71_cash o USING("Ref Cash Holder") WHERE n."Ref Cash Holder"='ch:tommy'),'expense cash effect removed exactly once';
END $$;

INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('REL71-BOR','Synthetic optional assessment');
INSERT INTO "Loan Assessment"("Row ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate")
 VALUES('REL71-OLD','REL71-BOR',100::money,0.1);
INSERT INTO "Loan Assessment SQL Lab"("Row ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate","SQL Forecast Start","SQL Forecast End")
 VALUES('REL71-LAB','REL71-BOR',100::money,0.1,current_date,current_date+30);
CREATE TEMP TABLE rel71_assessments AS SELECT 'legacy' kind,to_jsonb(a) value FROM "Loan Assessment" a WHERE "Row ID"='REL71-OLD'
 UNION ALL SELECT 'lab',to_jsonb(a) FROM "Loan Assessment SQL Lab" a WHERE "Row ID"='REL71-LAB';
DELETE FROM "Borrowers" WHERE "Row ID"='REL71-BOR';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT (SELECT a."Ref Borrower" IS NULL AND (to_jsonb(a)-'Ref Borrower')=(b.value-'Ref Borrower') FROM "Loan Assessment" a JOIN rel71_assessments b ON b.kind='legacy' WHERE a."Row ID"='REL71-OLD'),'legacy assessment retained';
 ASSERT (SELECT a."Ref Borrower" IS NULL AND (to_jsonb(a)-'Ref Borrower')=(b.value-'Ref Borrower') FROM "Loan Assessment SQL Lab" a JOIN rel71_assessments b ON b.kind='lab' WHERE a."Row ID"='REL71-LAB'),'SQL assessment snapshot and original input identity retained';
END $$;
SELECT 'R051 retained reimbursement and optional assessment history passed' result;
ROLLBACK;
