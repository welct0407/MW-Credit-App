\set ON_ERROR_STOP on
-- V114 (R102): "Long Overdue" in olap_borrowers_analytics."Daily Collection Status" and the appended
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
-- Column contract: the borrower view keeps 71 columns in place; the summary appends exactly one at the end.
SELECT pg_temp.check_long((SELECT count(*)=71 AND max(attnum)=71 FROM pg_attribute WHERE attrelid='public.olap_borrowers_analytics'::regclass AND attnum>0 AND NOT attisdropped),
 'olap_borrowers_analytics column count unchanged');
SELECT pg_temp.check_long((SELECT attname='Borrowers with Long Overdue Payment' AND format_type(atttypid,atttypmod)='bigint'
 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attnum=(SELECT max(attnum) FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attnum>0)),
 'olap_portfolio_summary appends the long overdue count last');
SELECT pg_temp.check_long((SELECT attnum=29 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Borrowers with Overdue Payment'),
 'existing summary columns keep their position');
SELECT pg_temp.check_long((SELECT "Ref Preferred Receiving Cash Account" IS NULL AND "Payment Request Token" IS NULL FROM public.olap_borrowers_analytics WHERE "Row ID"='LO-8'),
 'V23 appended Borrowers dimensions are kept');
-- Dependent reporting views (V34, V44) still read the replaced view.
SELECT count(*) FROM public.reporting_borrower_directory_v1;
SELECT count(*) FROM public.reporting_income_daily;
ROLLBACK;
\echo Long overdue collection status checks passed
