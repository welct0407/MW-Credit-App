\set ON_ERROR_STOP on
BEGIN;
\ir Test-CoverageParity.sql
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.check_upcoming(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Upcoming charge assertion: %',msg; END IF; END $$;
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('UF-B','SYNTHETIC UPCOMING'),('UF-EMPTY','SYNTHETIC EMPTY'),('UF-AUTO','SYNTHETIC AUTOMATIC');
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES ('UF-PARTNER','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('UF-CAPITAL','UF-PARTNER',public.olap_reporting_date(),'Contribution',100000::money);
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES
('CI-LISA','UF-L1','UF-B',public.olap_reporting_date()-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
('CI-LISA','UF-L2','UF-B',public.olap_reporting_date()-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'UF-C'||n,'UF-L1',public.olap_reporting_date()+n,0::money,100::money FROM generate_series(0,8) n;
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('UF-TIE','UF-L2',public.olap_reporting_date()+5,0::money,200::money),
('UF-DUP','UF-L1',public.olap_reporting_date()+5,0::money,20::money),
('UF-END','UF-L2',(public.olap_reporting_date()+interval '3 months')::date,0::money,10::money),
('UF-OUT','UF-L2',(public.olap_reporting_date()+interval '3 months')::date+1,0::money,10::money);
SELECT pg_temp.check_upcoming((SELECT count(*)=8 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Borrower"='UF-B'),'seven-day union retains seven dates plus loan tie');
SELECT pg_temp.check_upcoming((SELECT count(*)=6 AND count(DISTINCT "Due Date")=5 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Borrower"='UF-B' AND "Borrower Due Date Rank"<=5),'five dates includes every fifth-date loan');
SELECT pg_temp.check_upcoming((SELECT sum("Amount Remaining")=320 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Borrower"='UF-B' AND "Due Date"=public.olap_reporting_date()+5),'same loan/date components aggregate without losing other loan');
SELECT pg_temp.check_upcoming((SELECT "Displayed Dates"=0 AND "Review Loans"=0 FROM public.oltp_upcoming_charge_coverage_v1 WHERE "Row ID"='UF-EMPTY'),'empty borrower has valid coverage row');
SELECT pg_temp.check_upcoming((SELECT "Recorded Only Loans"=2 FROM public.oltp_upcoming_charge_coverage_v1 WHERE "Row ID"='UF-B'),'manual-only coverage');
SELECT pg_temp.check_upcoming(NOT EXISTS(SELECT 1 FROM public.oltp_upcoming_charge_events_v1 WHERE "Due Date"<="As Of Date" OR "Due Date">"Horizon End"),'future and horizon hard bounds');
SELECT pg_temp.check_upcoming((SELECT count(*)=count(DISTINCT "Row ID") FROM public.oltp_upcoming_charge_events_v1),'keys unique');
SELECT pg_temp.check_upcoming((SELECT count(*)=5 AND count(DISTINCT "Row ID")=5 FROM public.oltp_upcoming_charge_summary_v1 WHERE "Ref Borrower"='UF-B'),'summary one row per capped date');
SELECT pg_temp.check_upcoming((SELECT "Total Charge"=320 FROM public.oltp_upcoming_charge_summary_v1 WHERE "Ref Borrower"='UF-B' AND "Due Date"=public.olap_reporting_date()+5),'summary includes every loan/component on fifth date');
SELECT pg_temp.check_upcoming(NOT EXISTS(SELECT 1 FROM public.oltp_upcoming_charge_summary_v1 WHERE "Ref Borrower"='UF-EMPTY'),'empty forecast has no summary rows');
-- R049 preserves V1's five-date contract while V2 also includes days six/seven.
SELECT pg_temp.check_upcoming((SELECT count(*)=7 AND count(DISTINCT "Row ID")=7 AND sum("Total Charge")=920 FROM public.oltp_upcoming_charge_summary_v2 WHERE "Ref Borrower"='UF-B'),'V2 seven-day borrower summaries include days six and seven');
SELECT pg_temp.check_upcoming(NOT EXISTS(
 SELECT 1 FROM public.oltp_upcoming_charge_summary_v2 s
 WHERE s."Total Charge" IS DISTINCT FROM (
  SELECT sum(e."Amount Remaining") FROM public.oltp_upcoming_charge_events_v1 e
  WHERE e."Ref Borrower"=s."Ref Borrower" AND e."Due Date"=s."Due Date" AND e."As Of Date"=s."As Of Date"
 )), 'every summary equals its borrower/date/as-of drilldown');
SELECT pg_temp.check_upcoming((SELECT count(*)=5 AND sum(s."Total Charge")=720
 FROM public.oltp_upcoming_charge_summary_v2 s WHERE s."Ref Borrower"='UF-B' AND EXISTS (
 SELECT 1 FROM public.oltp_upcoming_charge_events_v1 e WHERE e."Ref Borrower"=s."Ref Borrower"
 AND e."Due Date"=s."Due Date" AND e."As Of Date"=s."As Of Date" AND e."Borrower Due Date Rank"<=5
 )), 'borrower-summary slice preserves five distinct dates and all fifth-date loans');
SELECT pg_temp.check_coverage_parity();
-- Actual posted prepayment removes the row and shifts date rank; amounts are never subtracted twice.
INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge")
VALUES('UF-PART','UF-B','CI-DAD','Processing',50::money,public.olap_reporting_date(),'Single Partial','UF-C1');
SELECT pg_temp.check_upcoming((SELECT "Amount Remaining"=50 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Loan"='UF-L1' AND "Due Date"=public.olap_reporting_date()+1),'posted partial payment residual');
INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge")
VALUES('UF-FULL','UF-B','CI-DAD','Processing',50::money,public.olap_reporting_date(),'Single Full','UF-C1');
SELECT pg_temp.check_upcoming(NOT EXISTS(SELECT 1 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Loan"='UF-L1' AND "Due Date"=public.olap_reporting_date()+1),'fully paid future charge removed');
SELECT pg_temp.check_upcoming((SELECT "Borrower Due Date Rank"=1 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Loan"='UF-L1' AND "Due Date"=public.olap_reporting_date()+2),'rank shifts after full prepayment');
SELECT pg_temp.check_upcoming(NOT EXISTS(SELECT 1 FROM public.oltp_upcoming_charge_summary_v1 WHERE "Ref Borrower"='UF-B' AND "Due Date"=public.olap_reporting_date()+1),'paid date removed from summary');
SELECT pg_temp.check_upcoming(NOT EXISTS(SELECT 1 FROM public.oltp_upcoming_charge_summary_v2 WHERE "Ref Borrower"='UF-B' AND "Due Date"=public.olap_reporting_date()+1),'paid date also removed from V2 summary');
SELECT pg_temp.check_coverage_parity();
-- Isolate horizon boundary after retaining only two future recorded dates on a separate borrower.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
VALUES('CI-LISA','UF-L3','UF-EMPTY',public.olap_reporting_date()-1,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('UF-H1','UF-L3',(public.olap_reporting_date()+interval '3 months')::date,0::money,7::money),
('UF-H2','UF-L3',(public.olap_reporting_date()+interval '3 months')::date+1,0::money,9::money);
SELECT pg_temp.check_upcoming((SELECT count(*)=1 AND sum("Amount Remaining")=7 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Borrower"='UF-EMPTY'),'horizon includes last day excludes next even when fewer than five');
SELECT pg_temp.check_upcoming((SELECT "Displayed Dates"=1 FROM public.oltp_upcoming_charge_coverage_v1 WHERE "Row ID"='UF-EMPTY'),'capped count honest');
SELECT pg_temp.check_upcoming((SELECT count(*)=1 AND sum("Total Charge")=7 FROM public.oltp_upcoming_charge_summary_v2 WHERE "Ref Borrower"='UF-EMPTY'),'V2 preserves inclusive three-month boundary');
SELECT pg_temp.check_upcoming((SELECT bool_and((d+interval '3 months')::date-d::date<=93) FROM generate_series('2024-01-01'::date,'2028-12-31'::date,interval '1 day') d),'calendar cap fits existing guard including leap years');
SELECT pg_temp.check_upcoming((SELECT count(*)=1 AND min("From Date")=public.olap_reporting_date()+1 AND min("Through Date")=public.olap_reporting_date()+7 FROM public.oltp_upcoming_charge_context_v1),'singleton context dates');
SELECT pg_temp.check_coverage_parity();
ROLLBACK;
\echo Upcoming charge adapter integration checks passed
