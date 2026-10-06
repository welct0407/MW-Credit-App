\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('REIM66-PA','A'),('REIM66-PB','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('REIM66-CA','REIM66-PA',current_date-2,'Contribution',100::money),
 ('REIM66-CB','REIM66-PB',current_date-2,'Contribution',100::money);
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('REIM66-T1','ch:tommy','Synthetic Tommy one','Synthetic'),
 ('REIM66-T2','ch:tommy','Synthetic Tommy two','Synthetic');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder")
 VALUES('REIM66-E',current_date,'Other / อื่น ๆ',20::money,'REIM66-T1','ch:tommy'),
 ('REIM66-E2',current_date,'Other / อื่น ๆ',10::money,'REIM66-T2','ch:tommy');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE reim_expense_before AS SELECT to_jsonb(e) value FROM "Business Expenses" e WHERE "Row ID"='REIM66-E';
CREATE TEMP TABLE reim_cash_before AS SELECT to_jsonb(l) value FROM "Cash Ledger" l WHERE "Ref Business Expense"='REIM66-E';
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense")
 VALUES('REIM66-R',current_date,'Expense Reimbursement',5,'ch:lisa','ch:tommy','CI-LISA','REIM66-T1','REIM66-E');
-- CONCURRENCY FIXTURE END
CREATE FUNCTION pg_temp.reject_reimbursement(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected reimbursement rejection: %',expected; END $$;
DO $$ BEGIN
 ASSERT (SELECT to_jsonb(e)=b.value FROM "Business Expenses" e CROSS JOIN reim_expense_before b WHERE "Row ID"='REIM66-E'),'reimbursement does not change any expense field';
 ASSERT (SELECT to_jsonb(l)=b.value FROM "Cash Ledger" l CROSS JOIN reim_cash_before b WHERE "Ref Business Expense"='REIM66-E' AND "Entry Origin"='System'),'reimbursement does not rewrite source cash';
END $$;
SELECT public.refresh_daily_analytics(current_date-1,current_date);
CREATE TEMP TABLE reim_history_before AS
 SELECT 'daily' kind,to_jsonb(d) value FROM "Daily Analytics" d
 UNION ALL SELECT 'account',to_jsonb(a) FROM "Cash Account Daily Analytics" a;
UPDATE "Cash Ledger" SET "Notes"='Synthetic metadata correction' WHERE "Row ID"='REIM66-R';
DO $$ BEGIN
 ASSERT NOT EXISTS((SELECT * FROM reim_history_before EXCEPT (SELECT 'daily',to_jsonb(d) FROM "Daily Analytics" d UNION ALL SELECT 'account',to_jsonb(a) FROM "Cash Account Daily Analytics" a))
 UNION ALL ((SELECT 'daily',to_jsonb(d) FROM "Daily Analytics" d UNION ALL SELECT 'account',to_jsonb(a) FROM "Cash Account Daily Analytics" a) EXCEPT SELECT * FROM reim_history_before)),'metadata validation/version touch does not refresh history';
END $$;
SELECT pg_temp.reject_reimbursement($q$UPDATE "Business Expenses" SET "Ref Paid By Cash Account"='CI-LISA',"Ref Paid By Cash Holder"='ch:lisa' WHERE "Row ID"='REIM66-E'$q$,'Correct linked reimbursement');
SELECT pg_temp.reject_reimbursement($q$UPDATE "Business Expenses" SET "Amount"=0::money WHERE "Row ID"='REIM66-E'$q$,'Correct linked reimbursement');
SELECT pg_temp.reject_reimbursement($q$UPDATE "Business Expenses" SET "Amount"=(-1)::money,"Notes"='Synthetic adjustment' WHERE "Row ID"='REIM66-E'$q$,'Correct linked reimbursement');
-- R051 now permits expense deletion and retains/unlinks its independent transfer;
-- the dedicated relaxed-policy suite checks that path and accounting effects.
UPDATE "Business Expenses" SET "Ref Paid By Cash Account"='REIM66-T2',"Amount"=3::money,"Expense Date"=current_date-1 WHERE "Row ID"='REIM66-E';
DO $$ BEGIN
 ASSERT (SELECT "Ref Paid By Cash Holder"='ch:tommy' AND "Amount"=3::money FROM "Business Expenses" WHERE "Row ID"='REIM66-E'),'same payer and positive amount remain editable; no invented reimbursement cap';
 ASSERT (SELECT count(*)=1 AND min("Amount")=3 AND min("Ref From Cash Account")='REIM66-T2' FROM "Cash Ledger" WHERE "Ref Business Expense"='REIM66-E' AND "Entry Origin"='System'),'owned cash follows expense';
 ASSERT (SELECT "Amount"=5 AND "Ref To Cash Account"='REIM66-T1' FROM "Cash Ledger" WHERE "Row ID"='REIM66-R'),'independent reimbursement unchanged';
END $$;
UPDATE "Cash Ledger" SET "Ref Business Expense"='REIM66-E2' WHERE "Row ID"='REIM66-R';
UPDATE "Business Expenses" SET "Ref Paid By Cash Account"='CI-LISA',"Ref Paid By Cash Holder"='ch:lisa' WHERE "Row ID"='REIM66-E';
SELECT pg_temp.reject_reimbursement($q$UPDATE "Business Expenses" SET "Amount"=0::money WHERE "Row ID"='REIM66-E2'$q$,'Correct linked reimbursement');
SELECT pg_temp.reject_reimbursement($q$UPDATE "Cash Ledger" SET "Ref Business Expense"='REIM66-E' WHERE "Row ID"='REIM66-R'$q$,'must have been paid by Tommy');
DELETE FROM "Cash Ledger" WHERE "Row ID"='REIM66-R';
UPDATE "Business Expenses" SET "Ref Paid By Cash Account"='CI-LISA',"Ref Paid By Cash Holder"='ch:lisa' WHERE "Row ID"='REIM66-E';
SELECT pg_temp.reject_reimbursement($q$INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense") VALUES('REIM66-BAD',current_date,'Expense Reimbursement',1,'ch:lisa','ch:tommy','CI-LISA','REIM66-T1','REIM66-E')$q$,'must have been paid by Tommy');
DELETE FROM "Business Expenses" WHERE "Row ID"='REIM66-E';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'Linked reimbursement consistency passed' AS result;
ROLLBACK;
