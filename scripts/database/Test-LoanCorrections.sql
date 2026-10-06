\set ON_ERROR_STOP on
-- Disposable/local database only. All source and generated effects roll back.
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.loan_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Loan corrections: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.loan_reject(q text,expected text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected loan rejection: %',expected; END $$;
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES('TERM-LISA2','ch:lisa','Synthetic term second Lisa','Synthetic');
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('TERM-B','Synthetic term'),('TERM-X','Synthetic new parent');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('TERM-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('TERM-CAP','TERM-A',current_date-5,'Contribution',10000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES
 ('TERM-D','TERM-B',current_date-3,NULL,200::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,20::money,NULL,1,'CI-LISA'),
 ('TERM-F','TERM-B',current_date-3,current_date+2,500::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,NULL,30::money,1,'CI-LISA'),
 ('TERM-X','TERM-X',current_date-3,current_date+2,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,NULL,30::money,1,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('TERM-D-C','TERM-D',current_date-3,100::money,0::money),('TERM-F-C','TERM-F',current_date-2,0::money,7::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES('TERM-P','TERM-B','Processing',30::money,current_date-2,'Single Partial','TERM-D-C','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE term_booked AS SELECT to_jsonb(c) row FROM "Charges" c WHERE "Row ID" IN ('TERM-D-C','TERM-F-C');
CREATE TEMP TABLE term_cash_key AS SELECT "Row ID" id FROM "Cash Ledger" WHERE "Ref Loan"='TERM-D';
CREATE TEMP TABLE term_receipt AS SELECT to_jsonb(p) row FROM "Payments" p WHERE "Row ID"='TERM-P';
UPDATE "Loans" SET "Principal Amount"=150::money WHERE "Row ID"='TERM-D';
SELECT pg_temp.loan_assert((SELECT "Outstanding Principal"=120 AND "Current Daily Interest"=12::money AND "Original Daily Interest Rate"=10 FROM "Loans" WHERE "Row ID"='TERM-D'),'positive decrease recalculates balance/rate from frozen original');
SELECT pg_temp.loan_assert((SELECT count(*)=1 AND bool_and("Amount"=150) FROM "Cash Ledger" WHERE "Ref Loan"='TERM-D'),'same disbursement amount corrected');
SELECT pg_temp.loan_reject($q$UPDATE "Loans" SET "Principal Amount"=90::money WHERE "Row ID"='TERM-D'$q$,'recorded principal charges');
SELECT pg_temp.loan_reject($q$UPDATE "Loans" SET "Principal Amount"=20::money WHERE "Row ID"='TERM-D'$q$,'posted principal');
SELECT pg_temp.loan_reject($q$UPDATE "Loans" SET "Original Daily Interest Rate"=11 WHERE "Row ID"='TERM-D'$q$,'read-only');
SELECT pg_temp.loan_reject($q$UPDATE "Loans" SET "Ref Borrowers"='TERM-X' WHERE "Row ID"='TERM-D'$q$,'original borrower');
UPDATE "Loans" SET "Interest Payment Interval"=2,"Interest Schedule Anchor Date"=current_date-2,"Auto Charge Enabled"=true WHERE "Row ID"='TERM-D';
SELECT pg_temp.loan_assert(public.generate_loan_charge('TERM-D',current_date-1) IS NULL,'new interval excludes off-cycle day');
SELECT pg_temp.loan_assert(public.generate_loan_charge('TERM-D',current_date) IS NOT NULL,'new anchor/interval generates eligible charge');
SELECT pg_temp.loan_assert((SELECT "Interest Due"=36::money AND "Principal Due"=0::money FROM "Charges" WHERE "Ref Loans"='TERM-D' AND "Charge Date"=current_date),'schedule anchor does not reset accrual since prior charge');
UPDATE "Loans" SET "Auto Charge Enabled"=false,"Loan Date"=current_date-4,"Ref Disbursed From Cash Account"='TERM-LISA2' WHERE "Row ID"='TERM-D';
SELECT pg_temp.loan_assert((SELECT count(*)=1 AND bool_and("Movement Date"=current_date-4 AND "Ref From Cash Account"='TERM-LISA2' AND "Amount"=150) FROM "Cash Ledger" WHERE "Ref Loan"='TERM-D'),'date/account edit moves same disbursement');
SELECT pg_temp.loan_assert((SELECT array_agg("Row ID" ORDER BY "Row ID") FROM "Cash Ledger" WHERE "Ref Loan"='TERM-D')=(SELECT array_agg(id ORDER BY id) FROM term_cash_key),'disbursement key exactly preserved across principal/date/account changes');
SELECT pg_temp.loan_reject($q$UPDATE "Loans" SET "Interest Schedule Anchor Date"=current_date-5 WHERE "Row ID"='TERM-D'$q$,'loans_interest_schedule_anchor');
UPDATE "Loans" SET "Fixed Interest"=45::money,"Due Date"=current_date+1,"Auto Charge Enabled"=true WHERE "Row ID"='TERM-F';
SELECT pg_temp.loan_assert(public.generate_loan_charge('TERM-F',current_date) IS NULL,'fixed term does not generate before corrected due');
SELECT pg_temp.loan_assert(public.generate_loan_charge('TERM-F',current_date+1) IS NOT NULL,'fixed term generates on corrected due');
SELECT pg_temp.loan_assert((SELECT "Principal Due"=500::money AND "Interest Due"=45::money FROM "Charges" WHERE "Ref Loans"='TERM-F' AND "Charge Date"=current_date+1),'new fixed interest drives future charge');
SELECT pg_temp.loan_assert(NOT EXISTS(SELECT row FROM term_booked EXCEPT SELECT to_jsonb(c) FROM "Charges" c),'term edits preserve already-booked charges');
SELECT pg_temp.loan_assert((SELECT row=to_jsonb(p) FROM term_receipt CROSS JOIN "Payments" p WHERE "Row ID"='TERM-P'),'term edits preserve receipt facts');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Ref Related Loan","Ref Related Borrower")
 VALUES('TERM-E',current_date,'Other / อื่น ๆ',1::money,'CI-LISA','ch:lisa','TERM-X','TERM-X');
SELECT pg_temp.loan_reject($q$UPDATE "Loans" SET "Ref Borrowers"='TERM-B' WHERE "Row ID"='TERM-X'$q$,'Related expense borrower');
DELETE FROM "Business Expenses" WHERE "Row ID"='TERM-E';
UPDATE "Loans" SET "Ref Borrowers"='TERM-B' WHERE "Row ID"='TERM-X';
SELECT pg_temp.loan_assert((SELECT "Ref Borrowers"='TERM-B' FROM "Loans" WHERE "Row ID"='TERM-X'),'unreferenced unpaid loan parent correction');
-- Entering daily mode derives a usable amount from the frozen original rate.
UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Auto Charge Enabled"=true,"Interest Payment Interval"=1 WHERE "Row ID"='TERM-X';
SELECT pg_temp.loan_assert((SELECT "Current Daily Interest"=5::money AND "Original Daily Interest Rate"=5 FROM "Loans" WHERE "Row ID"='TERM-X'),'fixed-to-daily derives current amount without rewriting frozen original basis');
SELECT pg_temp.loan_assert(public.generate_loan_charge('TERM-X',current_date) IS NOT NULL,'converted daily loan has a usable generation amount');
-- Opening-included source guards are exercised by Test-OpeningIncludedCrud.sql in the seeded route.
-- Parent DELETE is a single atomic SQL statement; it cannot delete referenced children.
SELECT pg_temp.loan_reject($q$DELETE FROM "Borrowers" WHERE "Row ID"='TERM-B'$q$,'foreign key');
SELECT pg_temp.loan_assert((SELECT count(*)=3 FROM "Loans" WHERE "Row ID" IN ('TERM-D','TERM-F','TERM-X')),'failed parent SQL delete preserves all children');
SELECT 'Loan correction positives, guards and daily conversion passed' AS result;
ROLLBACK;
