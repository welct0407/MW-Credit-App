\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.di_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Daily interest: %',label; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DI45-B','SYNTHETIC DAILY INTEREST');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DI45-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('DI45-CAP','DI45-P',current_date-20,'Contribution',1000000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status",
 "Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Transfer Fee","Loan Arrangement","Ref Disbursed From Cash Account")
 VALUES('DI45-L','DI45-B',current_date-10,10000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,100::money,1,20::money,'Original borrower agreement','CI-LISA'),
 ('DI45-F','DI45-B',current_date-10,300::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,0::money,NULL,'CI-LISA'),
 ('DI45-O','DI45-B',current_date-10,10000::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,100::money,1,0::money,'Fixed terms','CI-LISA');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.di_assert((SELECT "Loan Arrangement" LIKE 'Original borrower agreement%' AND "Original Daily Interest Rate"=1 FROM "Loans" WHERE "Row ID"='DI45-L'),'new loan retains text and rounded original percentage');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('DI45-L','DI45-F');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES('DI45-C','DI45-L',current_date-1,5000::money,100::money);
-- Exercise the actual posting engine, which creates the principal repayment.
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Ref Received By Cash Account")
 VALUES('DI45-PAY','DI45-B','DI45-C',2100::money,current_date,'Single Partial','Processing','CI-LISA');
SELECT pg_temp.di_assert((SELECT "Outstanding Principal"=8000 AND "Current Daily Interest"::numeric=80 AND "Expected Daily Interest Amount"=80 FROM "Loans" WHERE "Row ID"='DI45-L'),'posted payment reduces daily amount in same transaction');
SELECT pg_temp.di_assert((SELECT "Active Daily Interest"=90 FROM "Borrowers" WHERE "Row ID"='DI45-B'),'borrower daily rollup follows adjusted amount');
UPDATE "Payments" SET "Status"='Processing' WHERE "Row ID"='DI45-PAY';
SELECT pg_temp.di_assert((SELECT "Outstanding Principal"=8000 AND "Current Daily Interest"::numeric=80 FROM "Loans" WHERE "Row ID"='DI45-L'),'posted retry does not double reduce');
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid")
 VALUES('DI45-I','DI45-L',current_date,0::money,40::money);
SELECT pg_temp.di_assert((SELECT "Current Daily Interest"::numeric=80 FROM "Loans" WHERE "Row ID"='DI45-L'),'interest-only payment leaves rate and amount');
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid")
 VALUES('DI45-P2','DI45-L',current_date,3000::money,0::money);
SELECT pg_temp.di_assert((SELECT "Outstanding Principal"=5000 AND "Current Daily Interest"::numeric=50 FROM "Loans" WHERE "Row ID"='DI45-L'),'second principal payment uses original rate');
UPDATE "Loans" SET "Loan Arrangement"='Original borrower agreement; additional note',"Current Daily Interest"=100::money WHERE "Row ID"='DI45-L';
SELECT pg_temp.di_assert((SELECT "Current Daily Interest"::numeric=50 AND "Loan Arrangement" LIKE 'Original borrower agreement; additional note%' AND "Original Daily Interest Rate"=1 FROM "Loans" WHERE "Row ID"='DI45-L'),'stale save preserves notes, frozen rate and computed amount');
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid")
 VALUES('DI45-REV','DI45-L',current_date,(-1000)::money,0::money);
SELECT pg_temp.di_assert((SELECT "Outstanding Principal"=6000 AND "Current Daily Interest"::numeric=60 FROM "Loans" WHERE "Row ID"='DI45-L'),'signed principal correction restores daily amount');
-- Existing manual convention: all uncharged days use the updated daily amount.
SELECT public.generate_loan_charge('DI45-L',current_date);
SELECT pg_temp.di_assert((SELECT "Interest Due"::numeric=60 FROM "Charges" WHERE "Ref Loans"='DI45-L' AND "Charge Date"=current_date),'charge generator consumes new current amount');
SELECT pg_temp.di_assert((SELECT "Interest Due"::numeric=100 FROM "Charges" WHERE "Row ID"='DI45-C'),'existing charge amount preserved');
-- Rounded 3% rate must not be reconstructed from successive rounded daily amounts.
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid")
 VALUES('DI45-F1','DI45-F',current_date,100::money,0::money),('DI45-F2','DI45-F',current_date,100::money,0::money);
SELECT pg_temp.di_assert((SELECT "Current Daily Interest"::numeric=3 AND "Original Daily Interest Rate"=3 FROM "Loans" WHERE "Row ID"='DI45-F'),'multiple fractional repayments do not compound rounding');
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid")
 VALUES('DI45-F3','DI45-F',current_date,100::money,0::money);
SELECT pg_temp.di_assert((SELECT "Outstanding Principal"=0 AND "Current Daily Interest"::numeric=0 FROM "Loans" WHERE "Row ID"='DI45-F'),'full repayment reduces daily amount to zero');
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid")
 VALUES('DI45-FR','DI45-F',current_date,(-100)::money,0::money),('DI45-OP','DI45-O',current_date,1000::money,0::money);
SELECT pg_temp.di_assert((SELECT "Current Daily Interest"::numeric=3 FROM "Loans" WHERE "Row ID"='DI45-F'),'correction after zero recovers original rate');
SELECT pg_temp.di_assert((SELECT "Current Daily Interest"::numeric=100 AND "Loan Arrangement"='Fixed terms' FROM "Loans" WHERE "Row ID"='DI45-O'),'fixed loan remains unchanged');
-- The helper accepts old/current row composites, enabling a pre-existing-loan
-- test without disabling triggers or changing any live database fixture.
DO $$
DECLARE oldrow public."Loans"; newrow public."Loans";
BEGIN
 SELECT * INTO oldrow FROM "Loans" WHERE "Row ID"='DI45-L';
 oldrow."Original Daily Interest Rate":=NULL; oldrow."Loan Arrangement":='Legacy agreement'; oldrow."Total Principal Received":=2000;
 oldrow."Outstanding Principal":=8000; oldrow."Current Daily Interest":=100::money;
 newrow:=oldrow;
 newrow:=apply_principal_daily_interest(newrow,oldrow);
 ASSERT newrow."Loan Arrangement"='Legacy agreement' AND newrow."Current Daily Interest"::numeric=100,'no lazy backlog rewrite on ordinary update';
 INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('DI45-FIRST','DI45-L',oldrow."Loan Date",0::money,120::money);
 newrow."Outstanding Principal":=7000; newrow."Total Principal Received":=3000;
 newrow:=apply_principal_daily_interest(newrow,oldrow);
 ASSERT newrow."Current Daily Interest"::numeric=70,'legacy first-day reconstruction excludes transfer fee, not inflated current rate';
 ASSERT newrow."Original Daily Interest Rate"=1,'historical rounded rate retained';
 oldrow."Loan Date":=current_date-19;
 oldrow."Current Daily Interest":=80::money;
 newrow:=oldrow; newrow."Outstanding Principal":=7000;newrow."Total Principal Received":=3000;
 BEGIN
  newrow:=apply_principal_daily_interest(newrow,oldrow);
  RAISE EXCEPTION 'Expected missing original terms rejection';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Original daily interest rate unavailable%' THEN RAISE; END IF;
 END;
END $$;
SELECT 'R036 principal daily interest regression passed' AS result;
ROLLBACK;
