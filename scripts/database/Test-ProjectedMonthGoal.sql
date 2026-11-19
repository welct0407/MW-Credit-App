-- R176 V152 projected monthly goal counts this month's charges only (disposable cluster only; synthetic rows; everything
-- rolls back). Deltas against the rows already present, at d = olap_reporting_date() and ms = the first of its month, so
-- any calendar day works (ms-1 is always last month, d+1 always after the reporting date).
-- Two borrowers, one daily loan each with Auto Charge Enabled off, unpaid interest charges only:
--   A: ms-1 = 100 (last month), ms = 40;  B: d = 25, d+1 = 60 (future).
-- Proves: "Projected Monthly Profit" rises by 65 (40 + 25) plus the two loans' own forecast; "Today's Outstanding Interest"
-- and "Pending Payment Amount" still count every unpaid charge up to today (+165); each borrower's "Projected Monthly
-- Profit Contribution" is its month interest plus its forecast and the two add up to the portfolio delta; paying last
-- month's charge today adds 100 to "Realized Profit MTD" and to the goal and takes 100 off today's outstanding interest.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.pmg_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE pmg_day ON COMMIT DROP AS
 SELECT public.olap_reporting_date() AS d,date_trunc('month',public.olap_reporting_date())::date AS ms;
INSERT INTO public."Statistics"("Row ID") SELECT 'PMG-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
CREATE TEMP TABLE pmg_before ON COMMIT DROP AS
 SELECT "Projected Monthly Profit" AS projected,"Today's Outstanding Interest" AS outstanding,"Pending Payment Amount" AS pending,
  "Realized Profit MTD" AS realized FROM public.olap_portfolio_summary;
SELECT pg_temp.pmg_assert((SELECT count(*)=1 FROM pmg_before),'one portfolio row');

INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PMG-FUND','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 SELECT 'PMG-CAP','PMG-FUND',ms-400,'Contribution',1000000::money FROM pmg_day;
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('PMG-A','SYNTHETIC GOAL LAST MONTH'),('PMG-B','SYNTHETIC GOAL FUTURE');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,ms-10,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,false
 FROM pmg_day,(VALUES('PMG-LA','PMG-A'),('PMG-LB','PMG-B')) v(id,b);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,v.day,0::money,v.i::money FROM pmg_day,LATERAL (VALUES
  ('PMG-A-LAST','PMG-LA',ms-1,100),('PMG-A-FIRST','PMG-LA',ms,40),('PMG-B-TODAY','PMG-LB',d,25),('PMG-B-NEXT','PMG-LB',d+1,60)) v(id,loan,day,i);
SET CONSTRAINTS ALL IMMEDIATE;

CREATE FUNCTION pg_temp.pmg_delta() RETURNS TABLE(projected numeric,outstanding numeric,pending numeric,realized numeric) LANGUAGE sql AS $f$
 SELECT s."Projected Monthly Profit"-b.projected,s."Today's Outstanding Interest"-b.outstanding,s."Pending Payment Amount"-b.pending,
  s."Realized Profit MTD"-b.realized FROM public.olap_portfolio_summary s CROSS JOIN pmg_before b $f$;
CREATE FUNCTION pg_temp.pmg_forecast(loan text) RETURNS numeric LANGUAGE sql AS $f$
 SELECT coalesce("Expected Interest This Month",0) FROM public.olap_loans_analytics WHERE "Row ID"=loan $f$;
CREATE FUNCTION pg_temp.pmg_contribution(borrower text) RETURNS numeric LANGUAGE sql AS $f$
 SELECT "Projected Monthly Profit Contribution" FROM public.olap_borrowers_analytics WHERE "Row ID"=borrower $f$;

-- 1. The goal counts the month's unpaid interest (40 + 25), not last month's 100 or tomorrow's 60.
DO $$
DECLARE fa numeric:=pg_temp.pmg_forecast('PMG-LA');fb numeric:=pg_temp.pmg_forecast('PMG-LB');r record;
BEGIN
 SELECT * INTO r FROM pg_temp.pmg_delta();
 PERFORM pg_temp.pmg_assert(r.projected=round(65+fa+fb),format('projected delta %s, expected 65 + forecast %s + %s',r.projected,fa,fb));
 PERFORM pg_temp.pmg_assert(r.outstanding=165,format('today''s outstanding interest delta %s',r.outstanding));
 PERFORM pg_temp.pmg_assert(r.pending=165,format('pending payment delta %s',r.pending));
 PERFORM pg_temp.pmg_assert(r.realized=0,format('realized delta %s',r.realized));
 PERFORM pg_temp.pmg_assert(pg_temp.pmg_contribution('PMG-A')=round(40+fa),format('contribution A %s, forecast %s',pg_temp.pmg_contribution('PMG-A'),fa));
 PERFORM pg_temp.pmg_assert(pg_temp.pmg_contribution('PMG-B')=round(25+fb),format('contribution B %s, forecast %s',pg_temp.pmg_contribution('PMG-B'),fb));
 PERFORM pg_temp.pmg_assert(pg_temp.pmg_contribution('PMG-A')+pg_temp.pmg_contribution('PMG-B')=r.projected,'contributions add up to the portfolio delta');
END $$;

-- 2. Paying last month's charge today is realized this month: Realized Profit MTD and the goal each +100.
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Status")
 SELECT 'CI-DAD','PMG-P1','PMG-A',100::money,d,'Single Full','PMG-A-LAST','Processing' FROM pmg_day;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE fa numeric:=pg_temp.pmg_forecast('PMG-LA');fb numeric:=pg_temp.pmg_forecast('PMG-LB');r record;
BEGIN
 PERFORM pg_temp.pmg_assert((SELECT "Status"='Posted' FROM public."Payments" WHERE "Row ID"='PMG-P1'),'payment posted');
 PERFORM pg_temp.pmg_assert((SELECT "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='PMG-A-LAST')
  AND (SELECT "Amount Remaining"::numeric=40 FROM public."Charges" WHERE "Row ID"='PMG-A-FIRST'),'the payment settled last month''s charge');
 SELECT * INTO r FROM pg_temp.pmg_delta();
 PERFORM pg_temp.pmg_assert(r.realized=100,format('realized delta after payment %s',r.realized));
 PERFORM pg_temp.pmg_assert(r.projected=round(165+fa+fb),format('projected delta after payment %s, forecast %s + %s',r.projected,fa,fb));
 PERFORM pg_temp.pmg_assert(r.outstanding=65 AND r.pending=65,format('outstanding %s and pending %s after payment',r.outstanding,r.pending));
 PERFORM pg_temp.pmg_assert(pg_temp.pmg_contribution('PMG-A')=round(140+fa),format('contribution A after payment %s',pg_temp.pmg_contribution('PMG-A')));
 PERFORM pg_temp.pmg_assert(pg_temp.pmg_contribution('PMG-A')+pg_temp.pmg_contribution('PMG-B')=r.projected,'contributions still add up after payment');
END $$;
SELECT 'Projected month goal regressions passed' AS result;
ROLLBACK;
