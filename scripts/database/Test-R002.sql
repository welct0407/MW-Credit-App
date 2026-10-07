\set ON_ERROR_STOP on
\ir Test-BusinessExpenses.sql
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
CREATE FUNCTION pg_temp.r002_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R002 failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.r002_loan(k text,n numeric) RETURNS void LANGUAGE sql AS $$
INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
VALUES(k,'R002-B',current_date,n::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
$$;
CREATE FUNCTION pg_temp.r002_reject(k text,n numeric,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM pg_temp.r002_loan(k,n); EXCEPTION WHEN check_violation THEN
  IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'Expected cashpool rejection: %',k;
END $$;
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Hidden Flag") VALUES('R002-B','SYNTHETIC R002',true);
SELECT pg_temp.r002_reject('R002-NOPOOL',1,'exceeds available cashpool');
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('R002-A','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('R002-C','R002-A',current_date,'Contribution',1100::money),
 ('R002-W','R002-A',current_date,'Withdrawal',100::money);
SELECT pg_temp.r002_reject('R002-ZERO',0,'greater than zero');
SELECT pg_temp.r002_reject('R002-NEG',-1,'greater than zero');
SELECT pg_temp.r002_loan('R002-FIRST',400);
SELECT pg_temp.r002_reject('R002-OVER',600.01,'exceeds available cashpool');
SELECT pg_temp.r002_loan('R002-EXACT',600);
SELECT pg_temp.r002_reject('R002-EMPTY',0.01,'exceeds available cashpool');
SELECT pg_temp.r002_assert((SELECT count(*)=2 FROM public."Loans"),'only accepted loans persist');
-- Existing-record edits are deliberately outside the new-loan cap.
UPDATE public."Loans" SET "Principal Amount"=500::money WHERE "Row ID"='R002-FIRST';
SELECT pg_temp.r002_reject('R002-DEFICIT',1,'exceeds available cashpool');
UPDATE public."Loans" SET "Principal Amount"=300::money WHERE "Row ID"='R002-FIRST';
SAVEPOINT batch;
DO $$ BEGIN
 BEGIN
  INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
  SELECT 'R002-BATCH-'||n,'R002-B',current_date,60::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false FROM generate_series(1,2) n;
 EXCEPTION WHEN check_violation THEN RETURN; END;
 RAISE EXCEPTION 'Multi-row overspend was not rejected';
END $$;
SELECT pg_temp.r002_assert((SELECT count(*)=2 FROM public."Loans"),'multi-row rejection atomic');
ROLLBACK TO batch;
SELECT pg_temp.r002_loan('R002-REMAINING',100);
SELECT pg_temp.r002_assert((SELECT sum("Outstanding Principal")=1000 FROM public."Loans"),'capital boundary and hidden borrower inclusion');
SELECT pg_temp.r002_assert((SELECT count(*)=1 FROM public."Loan Form Context"),'context has exactly one row');
SELECT pg_temp.r002_assert((SELECT "Row ID"='cashpool' AND "Contributed Capital"::numeric=1000 AND "Outstanding Principal"::numeric=1000 AND "Available Cashpool"::numeric=0 AND "Partner A Profit Share"=1 AND "Partner B Profit Share"=0 FROM public."Loan Form Context"),'summary view reconciles capital, principal and shares');
ROLLBACK;
DO $$ BEGIN IF NOT (SELECT "Available Cashpool"::numeric=0 AND "Partner A Profit Share"=0 AND "Partner B Profit Share"=0 FROM public."Loan Form Context") THEN RAISE EXCEPTION 'Empty context defaults failed'; END IF; END $$;
SELECT 'R002 boundary, zero/negative, withdrawal, existing-edit, multi-row atomicity and hidden borrower tests passed' AS result;
