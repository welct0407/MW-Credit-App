\set ON_ERROR_STOP on
-- V114 (R102), V140 (R137): "Long Overdue" in olap_borrowers_analytics."Daily Collection Status" and the appended
-- olap_portfolio_summary."Borrowers with Long Overdue Payment". Synthetic borrowers with one unpaid charge at
-- d-1, d-7, d-8 and d-30 (d = olap_reporting_date()) give Overdue, Overdue, Long Overdue, Long Overdue; the
-- five status counts partition the Collection borrowers; column lists stay compatible. Rolled back.
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.check_long(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Long overdue assertion: %',msg; END IF; END $$;
-- Counts before the fixture (other suites may leave committed rows; every assertion is a delta). The summary
-- has one row per Statistics row; an empty rebuild has none.
INSERT INTO public."Statistics"("Row ID") SELECT 'LO-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
CREATE TEMP TABLE lo_before AS SELECT "Borrowers Not Paid Today" n,"Borrowers Partially Paid Today" p,"Borrowers with Overdue Payment" o,
 "Borrowers with Long Overdue Payment" l,"Borrowers Fully Paid Today" f FROM public.olap_portfolio_summary LIMIT 1;
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('LO-1','SYNTHETIC LO 1'),('LO-7','SYNTHETIC LO 7'),('LO-8','SYNTHETIC LO 8'),('LO-30','SYNTHETIC LO 30'),
 ('LO-MIX','SYNTHETIC LO MIX'),('LO-TODAY','SYNTHETIC LO TODAY');
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES ('LO-PARTNER','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('LO-CAPITAL','LO-PARTNER',public.olap_reporting_date()-41,'Contribution',100000::money);
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
SELECT 'CI-LISA','LO-L-'||id,id,public.olap_reporting_date()-40,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false
FROM unnest(ARRAY['LO-1','LO-7','LO-8','LO-30','LO-MIX','LO-TODAY']) id;
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('LO-C1','LO-L-LO-1',public.olap_reporting_date()-1,0::money,100::money),
 ('LO-C7','LO-L-LO-7',public.olap_reporting_date()-7,0::money,100::money),
 ('LO-C8','LO-L-LO-8',public.olap_reporting_date()-8,0::money,100::money),
 ('LO-C30','LO-L-LO-30',public.olap_reporting_date()-30,0::money,100::money),
 ('LO-CMIX-OLD','LO-L-LO-MIX',public.olap_reporting_date()-9,0::money,100::money),
 ('LO-CMIX-NEW','LO-L-LO-MIX',public.olap_reporting_date()-2,0::money,100::money),
 ('LO-CMIX-TODAY','LO-L-LO-MIX',public.olap_reporting_date(),0::money,100::money),
 ('LO-CTODAY','LO-L-LO-TODAY',public.olap_reporting_date(),0::money,100::money);
SELECT pg_temp.check_long((SELECT array_agg("Daily Collection Status" ORDER BY "Row ID")=ARRAY['Overdue','Long Overdue','Overdue','Long Overdue','Long Overdue','Not Paid']
 FROM public.olap_borrowers_analytics WHERE "Row ID" IN ('LO-1','LO-30','LO-7','LO-8','LO-MIX','LO-TODAY')),
 'd-1 and d-7 are Overdue, d-8, d-30 and a borrower with a d-9 charge are Long Overdue, today only is Not Paid');
SELECT pg_temp.check_long((SELECT "Overdue Charge Count"=2 AND "Overdue Amount"=200 FROM public.olap_borrowers_analytics WHERE "Row ID"='LO-MIX'),
 'existing overdue metrics are unchanged (both overdue charges counted)');
SELECT pg_temp.check_long((SELECT s."Borrowers Not Paid Today"-b.n=1 AND s."Borrowers with Overdue Payment"-b.o=2 AND s."Borrowers with Long Overdue Payment"-b.l=3
 AND s."Borrowers Partially Paid Today"=b.p AND s."Borrowers Fully Paid Today"=b.f FROM public.olap_portfolio_summary s CROSS JOIN lo_before b),
 'portfolio counts: 1-7 days in Overdue, 8+ days in Long Overdue, one Not Paid');
SELECT pg_temp.check_long((SELECT s."Borrowers Not Paid Today"+s."Borrowers Partially Paid Today"+s."Borrowers with Overdue Payment"
 +s."Borrowers with Long Overdue Payment"+s."Borrowers Fully Paid Today"
 =(SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status" IS NOT NULL) FROM public.olap_portfolio_summary s),
 'the five status counts partition the Collection borrowers');
-- Column contract: the borrower view keeps 71 columns in place; V114 appended the long overdue count at the end of the
-- summary (position 43), V120 (R109) appended "Total Principal Loss" after it (44) and V128 (R116) "Principal Write-offs MTD"
-- after that (Test-WriteOffSegregation.sql checks the last column).
SELECT pg_temp.check_long((SELECT count(*)=71 AND max(attnum)=71 FROM pg_attribute WHERE attrelid='public.olap_borrowers_analytics'::regclass AND attnum>0 AND NOT attisdropped),
 'olap_borrowers_analytics column count unchanged');
SELECT pg_temp.check_long((SELECT attname='Borrowers with Long Overdue Payment' AND format_type(atttypid,atttypmod)='bigint'
 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attnum=43),
 'olap_portfolio_summary keeps the long overdue count after the V114 columns');
SELECT pg_temp.check_long((SELECT attname='Total Principal Loss' AND format_type(atttypid,atttypmod)='numeric'
 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attnum=44),
 'olap_portfolio_summary keeps the principal loss after the long overdue count (V120)');
SELECT pg_temp.check_long((SELECT attnum=29 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Borrowers with Overdue Payment'),
 'existing summary columns keep their position');
SELECT pg_temp.check_long((SELECT "Ref Preferred Receiving Cash Account" IS NULL AND "Payment Request Token" IS NULL FROM public.olap_borrowers_analytics WHERE "Row ID"='LO-8'),
 'V23 appended Borrowers dimensions are kept');
-- Dependent reporting views (V34, V44) still read the replaced view.
SELECT count(*) FROM public.reporting_borrower_directory_v1;
SELECT count(*) FROM public.reporting_income_daily;
-- V140 (R137, owner decision of 9 November 2026): Long Overdue = an unpaid past-due charge and 8 or more days since the
-- borrower's last payment (never paid: since the first charge, df10: rows ignored). The never-paid cases above still hold:
-- first charge d-7 is Overdue (LO-7), d-8, d-9 and d-30 are Long Overdue (LO-8, LO-MIX, LO-30). Each borrower below has an
-- unpaid charge at d-20 unless noted; payments are posted receipts (Status Processing posts Repayments with "Ref Payment").
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('LP-3','SYNTHETIC LP PAID D-3'),('LP-10','SYNTHETIC LP PAID D-10'),('LP-CLEAR','SYNTHETIC LP NOTHING UNPAID'),
 ('LP-TOKEN','SYNTHETIC LP TOKEN D-1'),('LP-TWO','SYNTHETIC LP OTHER LOAN D-2'),('LP-REBATE','SYNTHETIC LP REBATE OFFSET'),
 ('LP-NETOFF','SYNTHETIC LP NET-OFF'),('LP-DF10','SYNTHETIC LP DF10 FIRST');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
SELECT 'CI-LISA','LP-L-'||id,regexp_replace(id,'-B$',''),public.olap_reporting_date()-40,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false
FROM unnest(ARRAY['LP-3','LP-10','LP-CLEAR','LP-TOKEN','LP-TWO','LP-REBATE','LP-NETOFF','LP-DF10','LP-TWO-B']) id;
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('LP-3-20','LP-L-LP-3',public.olap_reporting_date()-20,0::money,100::money),('LP-3-3','LP-L-LP-3',public.olap_reporting_date()-3,0::money,100::money),
 ('LP-10-20','LP-L-LP-10',public.olap_reporting_date()-20,0::money,100::money),('LP-10-10','LP-L-LP-10',public.olap_reporting_date()-10,0::money,100::money),
 ('LP-CLEAR-10','LP-L-LP-CLEAR',public.olap_reporting_date()-10,0::money,100::money),
 ('LP-TOKEN-20','LP-L-LP-TOKEN',public.olap_reporting_date()-20,0::money,100::money),
 ('LP-TWO-20','LP-L-LP-TWO',public.olap_reporting_date()-20,0::money,100::money),('LP-TWO-B-2','LP-L-LP-TWO-B',public.olap_reporting_date()-2,0::money,100::money),
 ('LP-REBATE-20','LP-L-LP-REBATE',public.olap_reporting_date()-20,0::money,100::money),('LP-REBATE-2','LP-L-LP-REBATE',public.olap_reporting_date()-2,0::money,100::money),
 ('LP-NETOFF-20','LP-L-LP-NETOFF',public.olap_reporting_date()-20,0::money,100::money),('LP-NETOFF-2','LP-L-LP-NETOFF',public.olap_reporting_date()-2,0::money,100::money),
 ('df10:LP-DF10','LP-L-LP-DF10',public.olap_reporting_date()-30,0::money,100::money),('LP-DF10-5','LP-L-LP-DF10',public.olap_reporting_date()-5,0::money,100::money);
-- One receipt per statement (a second Processing receipt of the same borrower in one statement needs reconciliation).
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-P3','LP-3','LP-3-3',100::money,public.olap_reporting_date()-3,'Single Full','Processing','Bank Transfer');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-P10','LP-10','LP-10-10',100::money,public.olap_reporting_date()-10,'Single Full','Processing','Cash');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-PCLEAR','LP-CLEAR','LP-CLEAR-10',100::money,public.olap_reporting_date()-10,'Single Full','Processing','Cash');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-PTOKEN','LP-TOKEN','LP-TOKEN-20',1::money,public.olap_reporting_date()-1,'Single Partial','Processing','Cash');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-PTWO','LP-TWO','LP-TWO-B-2',100::money,public.olap_reporting_date()-2,'Single Full','Processing','Bank Transfer');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-PREBATE','LP-REBATE','LP-REBATE-2',100::money,public.olap_reporting_date()-2,'Single Full','Processing','Referral Rebate Offset');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Payment Method")
 VALUES('CI-DAD','LP-PNETOFF','LP-NETOFF','LP-NETOFF-2',100::money,public.olap_reporting_date()-2,'Single Full','Processing','Net-off at Disbursement');
-- The charges' paid state is settled by deferred triggers; settle it now, inside the rolled-back transaction.
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.check_long((SELECT count(*)=7 FROM public."Repayments" WHERE "Ref Payment" LIKE 'LP-P%'),'each fixture receipt posted one repayment');
SELECT pg_temp.check_long((SELECT array_agg("Row ID"||'='||coalesce("Daily Collection Status",'-') ORDER BY "Row ID")
 =ARRAY['LP-10=Long Overdue','LP-3=Overdue','LP-CLEAR=-','LP-DF10=Overdue','LP-NETOFF=Long Overdue','LP-REBATE=Long Overdue','LP-TOKEN=Overdue','LP-TWO=Overdue']
 FROM public.olap_borrowers_analytics WHERE "Row ID" LIKE 'LP-%'),
 'paid d-3 Overdue; paid d-10 Long Overdue; nothing unpaid is neither; a 1-baht payment d-1 and a payment on another loan d-2 '
 'keep Overdue; rebate-offset and net-off receipts are not payments; a df10: row is not the first charge');
SELECT pg_temp.check_long((SELECT s."Borrowers Not Paid Today"+s."Borrowers Partially Paid Today"+s."Borrowers with Overdue Payment"
 +s."Borrowers with Long Overdue Payment"+s."Borrowers Fully Paid Today"
 =(SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status" IS NOT NULL) FROM public.olap_portfolio_summary s),
 'the five status counts still partition the Collection borrowers');
ROLLBACK;
\echo Long overdue collection status checks passed
