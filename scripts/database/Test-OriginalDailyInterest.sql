\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.rate_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Original daily rate: %',label; END IF; END $$;
DO $$
DECLARE p public."Loans"; previous public."Loans";
BEGIN
 p."Principal Amount":=10000::money; p."Loan Date":=DATE '2026-01-01'; p."Due Date":=DATE '2026-01-10';
 p."Loan Type":='ดอกเบี้ยรายวัน';p."Current Daily Interest":=50::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p)=1,'0.5% rounds to 1%');
 p."Current Daily Interest":=49::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p)=0,'0.49% rounds to 0%');
 p."Current Daily Interest":=149::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p)=1,'1.49% rounds to 1%');
 p."Current Daily Interest":=150::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p)=2,'1.5% rounds to 2%');
 p."Loan Type":='กำหนดวันชำระ';p."Fixed Interest":=1500::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p)=2,'fixed interest uses inclusive ten-day average');
 p."Loan Type":='ผ่อนชำระรายวัน';p."Daily Payment Amount":=1150::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p)=2,'installment deducts original principal then averages');
 p."Due Date":=NULL;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p) IS NULL,'missing terms remain unavailable');
 p."Principal Amount":=0::money;
 PERFORM pg_temp.rate_assert(original_daily_interest_rate(p) IS NULL,'zero denominator is unavailable');
 p."Row ID":='R048-unit';p."Loan Type":='ดอกเบี้ยรายวัน';p."Principal Amount":=10000::money;
 p."Current Daily Interest":=50::money;p."Original Daily Interest Rate":=99;
 p:=apply_principal_daily_interest(p,NULL::public."Loans");
 PERFORM pg_temp.rate_assert(p."Original Daily Interest Rate"=1 AND p."Current Daily Interest"::numeric=50,'creation stores authoritative rounded rate without changing entry amount');
 p."Outstanding Principal":=10000;p."Total Principal Received":=0;previous:=p;
 p."Outstanding Principal":=8000;p."Total Principal Received":=2000;
 p:=apply_principal_daily_interest(p,previous);
 PERFORM pg_temp.rate_assert(p."Current Daily Interest"::numeric=80,'partial repayment uses rounded 1% even when original amount was 50');
 previous:=p;p."Original Daily Interest Rate":=NULL;p."Current Daily Interest":=50::money;
 p:=apply_principal_daily_interest(p,previous);
 PERFORM pg_temp.rate_assert(p."Original Daily Interest Rate"=1 AND p."Current Daily Interest"::numeric=80,'stale client cannot erase rate or restore earlier amount');
 p."Original Daily Interest Rate":=2;
 BEGIN
  p:=apply_principal_daily_interest(p,previous);
  RAISE EXCEPTION 'Expected immutable rate rejection';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Original daily interest rate is read-only' THEN RAISE; END IF;
 END;
 previous."Original Daily Interest Rate":=0;p:=previous;p."Total Principal Received":=3000;p."Outstanding Principal":=7000;
 p:=apply_principal_daily_interest(p,previous);
 PERFORM pg_temp.rate_assert(p."Current Daily Interest"::numeric=0,'rounded zero rate gives zero after principal repayment');
END $$;
-- Verify the existing loan trigger persists the rate for both non-daily loan types.
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Creation Date")
 VALUES('R048-RATE-B','R048 synthetic rate test',current_date);
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('R048-RATE-P','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('R048-RATE-CAP','R048-RATE-P',current_date-1,'Contribution',10000::money);
INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount",
 "Loan Type","Loan Status","Auto Charge Enabled","Fixed Interest","Daily Payment Amount",
 "Interest Payment Interval","Transfer Fee","Ref Disbursed From Cash Account")
 VALUES
 ('R048-RATE-F','R048-RATE-B',current_date,current_date+9,1000::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,150::money,NULL,1,0::money,'CI-LISA'),
 ('R048-RATE-I','R048-RATE-B',current_date,current_date+9,1000::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,NULL,115::money,1,0::money,'CI-LISA');
SELECT pg_temp.rate_assert((SELECT count(*)=2 AND bool_and("Original Daily Interest Rate"=2)
 FROM public."Loans" WHERE "Row ID" IN ('R048-RATE-F','R048-RATE-I')),
 'fixed and installment loan inserts both persist rounded 2 percent');
SELECT 'R048 original daily rate regression passed' AS result;
ROLLBACK;
