\set ON_ERROR_STOP on
-- R187 Dashboard "Last month Realized Profit (before write-offs)" (disposable cluster only; synthetic rows; everything rolls
-- back). The read in services/business/dashboard.mjs (LAST_MONTH_REALIZED_PROFIT_SQL, copied verbatim into pg_temp.lm_inline
-- below; tests/unit/dashboard-read.test.mjs checks the copy) is olap_portfolio_summary's rr.mtd over the previous Bangkok
-- month of olap_reporting_date(). The reporting clock is pinned by replacing olap_reporting_date() for this transaction with
-- the same body over a fixed instant (pg_temp.lm_clock) instead of CURRENT_TIMESTAMP, so the view and the inline read move
-- together. Every figure is a delta from the same clock before the fixture.
-- Rows (interest, late charge) on one loan: 2026-07-31 70 (before last month), 2026-08-01 20 (first day of last month),
-- 2026-08-31 100 + late 5 (last day of last month), 2026-09-01 40 (first of this month), 2025-12-31 8 (year boundary); a df10:
-- loss pair on 2026-08-10 (13/-13) and a zero-cash loss pair on 2026-08-12 (9/-9 on its own 9/-9 charge), both excluded.
-- Proves: at 2026-09-15 last month is August (125); it equals the view's "Realized Profit MTD" with the clock one month back
-- (2026-08-15); at 2026-08-31 17:30 UTC (00:30 on 1 September in Bangkok) last month is August, at 16:59 UTC (23:59 on 31
-- August in Bangkok) it is July (70); at 2026-01-05 it is December 2025 (8); the 1st of this month never counts.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.lm_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE lm_clock(t timestamptz NOT NULL) ON COMMIT DROP;
INSERT INTO lm_clock VALUES('2026-09-15 05:00:00+00');
CREATE OR REPLACE FUNCTION public.olap_reporting_date() RETURNS date LANGUAGE sql STABLE AS $$
 SELECT (t AT TIME ZONE 'Asia/Bangkok')::date FROM pg_temp.lm_clock $$;
-- The Dashboard read, verbatim.
CREATE FUNCTION pg_temp.lm_inline() RETURNS numeric LANGUAGE sql STABLE AS $q$
SELECT "lastMonthRealizedProfit"::numeric FROM (
WITH ctx AS (SELECT date_trunc('month',d)::date ms FROM (SELECT public.olap_reporting_date() d) q)
SELECT coalesce(sum(r."Interest Paid"::numeric+r."Late Charge Paid"::numeric) FILTER(WHERE NOT r.loss_pair),0)::text AS "lastMonthRealizedProfit"
FROM (SELECT wx."Interest Paid",wx."Late Charge Paid",public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair
 FROM public."Repayments" wx CROSS JOIN ctx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true
 WHERE wx."Payment Date" BETWEEN (ctx.ms-interval '1 month')::date AND ctx.ms-1) r
) q $q$;
-- One reading at a pinned instant: the inline figure and the view's this-month figure.
CREATE FUNCTION pg_temp.lm_at(at timestamptz,OUT d date,OUT inline numeric,OUT view_mtd numeric) LANGUAGE plpgsql AS $$
BEGIN
 UPDATE pg_temp.lm_clock SET t=at;
 SELECT public.olap_reporting_date() INTO d;
 SELECT pg_temp.lm_inline() INTO inline;
 SELECT "Realized Profit MTD" INTO view_mtd FROM public.olap_portfolio_summary;
END $$;
INSERT INTO public."Statistics"("Row ID") SELECT 'LM-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
CREATE TEMP TABLE lm_points(name text PRIMARY KEY,at timestamptz NOT NULL) ON COMMIT DROP;
INSERT INTO lm_points VALUES
 ('sep15','2026-09-15 05:00:00+00'),('aug15','2026-08-15 05:00:00+00'),
 ('bkk_sep1_0030','2026-08-31 17:30:00+00'),('bkk_aug31_2359','2026-08-31 16:59:00+00'),('jul15','2026-07-15 05:00:00+00'),
 ('jan05','2026-01-05 05:00:00+00'),('dec15','2025-12-15 05:00:00+00');
CREATE TEMP TABLE lm_before ON COMMIT DROP AS SELECT p.name,r.* FROM lm_points p CROSS JOIN LATERAL pg_temp.lm_at(p.at) r;

INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('LM-FUND','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('LM-CAP','LM-FUND','2025-01-01','Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('LM-B','SYNTHETIC LAST MONTH PROFIT');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
 VALUES('CI-LISA','LM-L','LM-B','2025-06-01',10000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,0::money);
-- The zero-cash pair's own charge (principal 9, interest -9, its only repayment) and the late-charge row's charge.
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('LM-C-PAIR','LM-L','2026-08-12',9::money,(-9)::money),('LM-C-LATE','LM-L','2026-08-31',0::money,100::money);
UPDATE public."Charges" SET "Late Charge Due"=5::money WHERE "Row ID"='LM-C-LATE';
INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Ref Loans","Ref Charges") VALUES
 ('LM-R-JUL31','2026-07-31',0::money,70::money,'LM-L',NULL),
 ('LM-R-AUG01','2026-08-01',0::money,20::money,'LM-L',NULL),
 ('LM-R-AUG31','2026-08-31',0::money,100::money,'LM-L','LM-C-LATE'),
 ('LM-R-SEP01','2026-09-01',0::money,40::money,'LM-L',NULL),
 ('LM-R-DEC31','2025-12-31',0::money,8::money,'LM-L',NULL),
 ('df10:4:LM-L','2026-08-10',13::money,(-13)::money,'LM-L',NULL),
 ('LM-R-PAIR','2026-08-12',9::money,(-9)::money,'LM-L','LM-C-PAIR');
UPDATE public."Repayments" SET "Late Charge Paid"=5::money WHERE "Row ID"='LM-R-AUG31';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.lm_assert((SELECT "Late Charge Paid"::numeric=5 FROM public."Repayments" WHERE "Row ID"='LM-R-AUG31'),'the late charge row carries 5');

CREATE TEMP TABLE lm_after ON COMMIT DROP AS SELECT p.name,r.* FROM lm_points p CROSS JOIN LATERAL pg_temp.lm_at(p.at) r;
CREATE TEMP VIEW lm_delta AS SELECT a.name,a.d,a.inline-b.inline AS inline,a.view_mtd-b.view_mtd AS view_mtd,a.inline AS inline_abs,a.view_mtd AS view_abs
 FROM lm_after a JOIN lm_before b USING(name);
\echo R187 last-month realized profit (delta per pinned instant):
SELECT name,d,inline,view_mtd FROM lm_delta ORDER BY name;

SELECT pg_temp.lm_assert((SELECT d='2026-09-15' AND inline=125 FROM lm_delta WHERE name='sep15'),
 'at 2026-09-15 last month is August: 20 + 100 + late 5; the 1 September row, July, the df10: pair and the zero-cash pair do not count');
SELECT pg_temp.lm_assert((SELECT s.inline_abs=a.view_abs AND s.inline=a.view_mtd FROM lm_delta s,lm_delta a WHERE s.name='sep15' AND a.name='aug15'),
 'the inline figure equals the view''s Realized Profit MTD with the clock one month back (absolute and delta)');
SELECT pg_temp.lm_assert((SELECT d='2026-09-01' AND inline=125 FROM lm_delta WHERE name='bkk_sep1_0030'),
 '00:30 on 1 September in Bangkok (17:30 UTC on 31 August): last month is the August just ended');
SELECT pg_temp.lm_assert((SELECT d='2026-08-31' AND inline=70 FROM lm_delta WHERE name='bkk_aug31_2359'),
 '23:59 on 31 August in Bangkok: last month is July');
SELECT pg_temp.lm_assert((SELECT s.inline_abs=a.view_abs FROM lm_delta s,lm_delta a WHERE s.name='bkk_aug31_2359' AND a.name='jul15'),
 'July: the inline figure equals the view''s July Realized Profit MTD');
SELECT pg_temp.lm_assert((SELECT d='2026-01-05' AND inline=8 FROM lm_delta WHERE name='jan05'),'January 2026: last month is December 2025');
SELECT pg_temp.lm_assert((SELECT s.inline_abs=a.view_abs FROM lm_delta s,lm_delta a WHERE s.name='jan05' AND a.name='dec15'),
 'across the year boundary the inline figure equals the view''s December Realized Profit MTD');
SELECT pg_temp.lm_assert((SELECT view_mtd=125 FROM lm_delta WHERE name='aug15'),'the view''s August Realized Profit MTD excludes both loss pairs too');
\echo R187 last-month realized profit: all assertions passed
ROLLBACK;
