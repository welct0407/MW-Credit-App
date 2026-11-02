\set ON_ERROR_STOP on
-- R116 Chase: V128 edge cases beyond Test-WriteOffSegregation.sql. Loss pairs are inserted directly (the V10 guard only
-- blocks UPDATE/DELETE) so they can sit in earlier months and carry the legacy undated Row ID:
--   * write-offs in the previous month and two months ago and this month, plus a legacy pair ('df10:' + loan, no date);
--   * monthly net per month = that month's gross - expenses - write-off; the sum of every month = portfolio "Net Profit";
--   * daily "Net Profit Through Date" on the last date = portfolio "Net Profit" (same lifetime net, other relation);
--   * events: a df10: row has Income 0 and the write-off on its own date; the sum over events = lifetime figures;
--   * lifetime gross "Total Profit" excludes the pairs. ("Total Principal Loss" comes from the Loans column, not the ledger, so
--     direct ledger inserts do not move it; Test-WriteOffSegregation.sql covers it through the real default path.)
-- Every figure is a delta from the state before the fixture. Rolled back.
BEGIN;
\ir Test-CashAccountFixtures.sql
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.e_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Write-off edge assertion: %',label; END IF; END $$;
INSERT INTO public."Statistics"("Row ID") SELECT 'WE-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
CREATE FUNCTION pg_temp.e_snap() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'ps_total',p."Total Profit",'ps_net',p."Net Profit",'ps_loss',p."Total Principal Loss",'ps_wo_mtd',p."Principal Write-offs MTD",'ps_net_mtd',p."Net Profit MTD",
  'ps_mtd',p."Realized Profit MTD",
  'cd_wo',c."Principal Write-offs MTD",'cd_net',c."Net Profit MTD",'cd_income',c."Operating Income MTD",
  'mo_gross',(SELECT coalesce(sum("Operating Income"),0) FROM public.reporting_income_monthly),
  'mo_wo',(SELECT coalesce(sum("Principal Write-offs"),0) FROM public.reporting_income_monthly),
  'mo_exp',(SELECT coalesce(sum("Expenses"),0) FROM public.reporting_income_monthly),
  'mo_net',(SELECT coalesce(sum("Net Profit"),0) FROM public.reporting_income_monthly),
  'da_through',(SELECT "Net Profit Through Date" FROM public.reporting_income_daily ORDER BY "Date" DESC LIMIT 1),
  'da_wo',(SELECT coalesce(sum("Principal Write-offs"),0) FROM public.reporting_income_daily),
  'da_gross',(SELECT coalesce(sum("Operating Income"),0) FROM public.reporting_income_daily),
  'ev_income',(SELECT coalesce(sum("Income"),0) FROM public.reporting_income_events),
  'ev_wo',(SELECT coalesce(sum("Principal Write-offs"),0) FROM public.reporting_income_events),
  'ev_exp',(SELECT coalesce(sum("Expenses"),0) FROM public.reporting_income_events))
 FROM public."Cash Dashboard" c CROSS JOIN (SELECT * FROM public.olap_portfolio_summary LIMIT 1) p
$$;
CREATE TEMP TABLE e_base ON COMMIT DROP AS SELECT pg_temp.e_snap() v;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('WE-B','SYNTHETIC EDGE');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('WE-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('WE-CAPITAL','WE-PARTNER',current_date-100,'Contribution',5000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
VALUES('CI-LISA','WE-1','WE-B',current_date-90,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,0::money);
-- gross interest: 20 two months ago, 30 last month, 7 this month. Write-offs: 11 two months ago (dated pair), 13 last month
-- (legacy undated id, dated last month), 17 this month (dated pair). Expenses: 3 last month, 2 today.
INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Ref Loans") VALUES
 ('WE-i2',(date_trunc('month',current_date)-interval '2 months')::date+3,0::money,20::money,'WE-1'),
 ('WE-i1',(date_trunc('month',current_date)-interval '1 month')::date+3,0::money,30::money,'WE-1'),
 ('WE-i0',current_date,0::money,7::money,'WE-1'),
 ('df10:4:WE-1:2000-01-01',(date_trunc('month',current_date)-interval '2 months')::date+4,11::money,(-11)::money,'WE-1'),
 ('df10:4:WE-1',(date_trunc('month',current_date)-interval '1 month')::date+5,13::money,(-13)::money,'WE-1'),
 ('df10:4:WE-1:today',current_date,17::money,(-17)::money,'WE-1');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder") VALUES
 ('WE-X1',(date_trunc('month',current_date)-interval '1 month')::date+6,'Other',3::money,'CI-DAD','ch:dad'),
 ('WE-X0',current_date,'Other',2::money,'CI-DAD','ch:dad');
DO $t$
DECLARE b jsonb:=(SELECT v FROM e_base); s jsonb:=pg_temp.e_snap(); d text; m record;
 function_gross numeric:=57; wo numeric:=41; ex numeric:=5;
BEGIN
 d:='';
 -- lifetime gross excludes the pairs; lifetime net = gross - expenses - write-offs
 IF (s->>'ps_total')::numeric-(b->>'ps_total')::numeric<>57 THEN d:=d||' ps_total'; END IF;
 IF (s->>'ps_net')::numeric-(b->>'ps_net')::numeric<>57-5-41 THEN d:=d||' ps_net'; END IF;
 IF (s->>'ps_wo_mtd')::numeric-(b->>'ps_wo_mtd')::numeric<>17 OR (s->>'cd_wo')::numeric-(b->>'cd_wo')::numeric<>17 THEN d:=d||' wo_mtd(17)'; END IF;
 IF (s->>'ps_mtd')::numeric-(b->>'ps_mtd')::numeric<>7 OR (s->>'cd_income')::numeric-(b->>'cd_income')::numeric<>7 THEN d:=d||' gross_mtd(7)'; END IF;
 IF (s->>'ps_net_mtd')::numeric-(b->>'ps_net_mtd')::numeric<>7-2-17 OR (s->>'cd_net')::numeric-(b->>'cd_net')::numeric<>7-2-17 THEN d:=d||' net_mtd'; END IF;
 -- monthly: sums over all months
 IF (s->>'mo_gross')::numeric-(b->>'mo_gross')::numeric<>57 THEN d:=d||' mo_gross'; END IF;
 IF (s->>'mo_wo')::numeric-(b->>'mo_wo')::numeric<>41 THEN d:=d||' mo_wo'; END IF;
 IF (s->>'mo_exp')::numeric-(b->>'mo_exp')::numeric<>5 THEN d:=d||' mo_exp'; END IF;
 IF (s->>'mo_net')::numeric-(b->>'mo_net')::numeric<>57-5-41 THEN d:=d||' mo_net'; END IF;
 IF (s->>'da_wo')::numeric-(b->>'da_wo')::numeric<>41 OR (s->>'da_gross')::numeric-(b->>'da_gross')::numeric<>57 THEN d:=d||' daily sums'; END IF;
 IF (s->>'da_through')::numeric-(b->>'da_through')::numeric<>57-5-41 THEN d:=d||' da_through'; END IF;
 IF (s->>'ev_income')::numeric-(b->>'ev_income')::numeric<>57 OR (s->>'ev_wo')::numeric-(b->>'ev_wo')::numeric<>41 OR (s->>'ev_exp')::numeric-(b->>'ev_exp')::numeric<>5 THEN d:=d||' events'; END IF;
 -- identity across relations: lifetime portfolio net = daily through date = monthly net sum
 IF (s->>'ps_net')::numeric<>(s->>'da_through')::numeric THEN d:=d||' ps_net<>da_through(snapshot-wide)'; END IF;
 IF d<>'' THEN RAISE EXCEPTION 'Write-off edges:%',d; END IF;
END $t$;
-- Per-month rows of the fixture months: gross / write-off / net per month.
SELECT pg_temp.e_assert((SELECT "Operating Income"=30 AND "Principal Write-offs"=13 AND "Expenses"=3 AND "Net Profit"=30-3-13
  FROM public.reporting_income_monthly WHERE "Month"=(date_trunc('month',current_date)-interval '1 month')::date),'last month: legacy undated pair 13 lands in its Payment Date month');
SELECT pg_temp.e_assert((SELECT "Operating Income"=20 AND "Principal Write-offs"=11 AND "Expenses"=0 AND "Net Profit"=20-11
  FROM public.reporting_income_monthly WHERE "Month"=(date_trunc('month',current_date)-interval '2 months')::date),'two months ago');
SELECT pg_temp.e_assert((SELECT (SELECT count(*) FROM public.reporting_income_events WHERE starts_with("Event ID",'repayment:df10:') AND "Income"<>0)=0
  AND (SELECT sum("Principal Write-offs") FROM public.reporting_income_events WHERE "Event ID" LIKE 'repayment:df10:4:WE-1%')=41
  AND (SELECT count(*) FROM public.reporting_income_events WHERE "Event ID" LIKE 'repayment:WE-i%' AND "Principal Write-offs"<>0)=0),'events: df10 rows Income 0, write-off on the row; others write-off 0');
-- A write-off alone in a month still produces that month (no gross => Net Margin NULL, not an error).
SELECT pg_temp.e_assert((SELECT count(*)=0 FROM public.reporting_income_monthly WHERE "Operating Income"=0 AND "Principal Write-offs">0 AND "Net Margin" IS NOT NULL),'write-off-only month has NULL margin');
-- Past-month restatement: the old pair's month was previously net of the loss inside interest; now gross is the interest only.
SELECT pg_temp.e_assert((SELECT "Net Margin"=(30-3-13)::numeric/30 FROM public.reporting_income_monthly WHERE "Month"=(date_trunc('month',current_date)-interval '1 month')::date),'net margin = net / gross');
-- Undated pair (Payment Date NULL): lifetime figures include/exclude consistently, dated windows ignore it.
SAVEPOINT undated;
INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Ref Loans") VALUES ('df10:4:WE-1:undated',NULL,19::money,(-19)::money,'WE-1');
SELECT pg_temp.e_assert((SELECT (s->>'ps_wo_mtd')::numeric-(b.v->>'ps_wo_mtd')::numeric=17 FROM e_base b,pg_temp.e_snap() s),'undated pair: MTD write-off ignores it');
SELECT 'undated: ps_net delta '||((s->>'ps_net')::numeric-(b.v->>'ps_net')::numeric)||' (gross-exp-wo) vs daily through '||((s->>'da_through')::numeric-(b.v->>'da_through')::numeric)||' vs monthly '||((s->>'mo_net')::numeric-(b.v->>'mo_net')::numeric) AS note FROM e_base b,pg_temp.e_snap() s;
ROLLBACK TO undated;
SELECT 'Write-off edge regressions passed' AS result;
ROLLBACK;
