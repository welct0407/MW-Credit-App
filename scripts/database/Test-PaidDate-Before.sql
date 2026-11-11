\set ON_ERROR_STOP on
-- R140 V144 upgrade route, state at V143 (disposable cluster only; synthetic rows): paid, pending, negative and
-- reimbursement-free manual expenses with their cash rows, then a snapshot of "Cash Ledger" that Test-PaidDate.sql compares
-- after V144 (the new "Paid Date" column moves no cash row and is null everywhere).
SET TIME ZONE 'Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('PDB-A','A'),('PDB-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('PDB-CA','PDB-A',current_date-30,'Contribution',60000::money),('PDB-CB','PDB-B',current_date-30,'Contribution',40000::money);
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account") VALUES
 ('PDB-PAID-1',current_date-5,'Other',120::money,'CI-DAD'),('PDB-PAID-2',current_date-2,'Other',80::money,'CI-LISA'),('PDB-PENDING',current_date-1,'Other',50::money,NULL);
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Notes") VALUES('PDB-NEG',current_date-1,'Other',(-10)::money,'Synthetic adjustment');
CREATE SCHEMA pd_before;
CREATE TABLE pd_before.ledger AS SELECT count(*) AS n,md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) AS digest,
 count(*) FILTER (WHERE c."Ref Business Expense" LIKE 'PDB-%') AS expense_rows FROM "Cash Ledger" c;
DO $$ BEGIN IF (SELECT expense_rows FROM pd_before.ledger)<>2 THEN RAISE EXCEPTION 'Paid date fixture: expected two expense cash rows'; END IF; END $$;
