\set ON_ERROR_STOP on
-- V130 (R116): the AppSheet-era loss pair of Test-WriteOffLegacyPair-Before.sql (run at V9) after the upgrade to the head.
-- The loan is Defaulted with "Default Loss Amount" 500 and its pair has random Row IDs, not df10:. The database holds only
-- this fixture, so the figures are absolute: lifetime "Total Principal Loss" = "Principal Write-offs" = 500; gross "Total
-- Profit" 70 leaves the pair out; "Total Profit" - "Total Business Expenses" - "Principal Write-offs" = "Net Profit" = -430;
-- its close month shows gross 70, write-offs 500 and net -430; daily and events agree on its date. Rolled back.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.wlp_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Legacy loss pair assertion: %',label; END IF; END $$;
INSERT INTO "Statistics"("Row ID") SELECT 'WLP-ST' WHERE NOT EXISTS (SELECT 1 FROM "Statistics");
SELECT pg_temp.wlp_assert((SELECT coalesce("Defaulted",false) AND "Default Loss Amount"=500::money FROM "Loans" WHERE "Row ID"='WLP-LOAN')
 AND NOT EXISTS(SELECT 1 FROM "Repayments" WHERE starts_with("Row ID",'df10:')),'fixture: a recorded loss whose pair has random ids, no df10: row');
SELECT pg_temp.wlp_assert((SELECT "Total Principal Loss"=500 AND "Principal Write-offs"=500 AND "Total Profit"=70 AND "Net Profit"=-430
  AND "Total Profit"-"Total Business Expenses"-"Principal Write-offs"="Net Profit" FROM public.olap_portfolio_summary LIMIT 1),
 'Total Principal Loss = lifetime Principal Write-offs; gross leaves the pair out; the lifetime identity holds');
SELECT pg_temp.wlp_assert((SELECT "Operating Income"=70 AND "Principal Write-offs"=500 AND "Net Profit"=-430 FROM public.reporting_income_monthly
  WHERE "Month"=(date_trunc('month',current_date)-interval '2 months')::date),'close month: gross 70, write-offs 500, net -430');
SELECT pg_temp.wlp_assert((SELECT "Operating Income"=0 AND "Principal Write-offs"=500 AND "Net Profit"=-500 FROM public.reporting_income_daily
  WHERE "Date"=(date_trunc('month',current_date)-interval '2 months')::date+20)
 AND (SELECT "Income"=0 AND "Principal Write-offs"=500 FROM public.reporting_income_events WHERE "Event ID"='repayment:knT1lRfUhfa80J7TXgnDhZ')
 AND (SELECT "Net Profit Through Date"=-430 FROM public.reporting_income_daily ORDER BY "Date" DESC LIMIT 1),
 'daily and events: the write-off on its date, no income; the running net equals the lifetime net');
SELECT 'Legacy loss pair checks passed' AS result;
ROLLBACK;
