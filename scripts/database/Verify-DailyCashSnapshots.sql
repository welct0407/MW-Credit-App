-- Read-only checks; returns labels/booleans only, never borrower or financial values.
WITH checks AS (
 SELECT 'Complete portfolio calendar through Bangkok today' name,
  count(*)=public.olap_reporting_date()-public.analytics_history_start()+1
  AND min("Snapshot Date")=public.analytics_history_start() AND max("Snapshot Date")=public.olap_reporting_date() passed
 FROM public."Daily Analytics"
 UNION ALL SELECT 'One account row per portfolio date',
  (SELECT count(*) FROM public."Cash Account Daily Analytics")=(SELECT count(*) FROM public."Daily Analytics")*(SELECT count(*) FROM public."Cash Accounts")
 UNION ALL SELECT 'All snapshots use model 3',NOT EXISTS(SELECT 1 FROM public."Daily Analytics" WHERE "Model Version" IS DISTINCT FROM 3)
 UNION ALL SELECT 'Account snapshots match independent cashflow history',NOT EXISTS(
  SELECT 1 FROM public."Cash Account Daily Analytics" a JOIN public.reporting_cashflow_daily v
   ON a."Ref Cash Account"=v."Scope ID" AND a."Snapshot Date"=v."Date"
  WHERE ROW(a."Money In",a."Money Out",a."Opening Balance",a."Closing Balance",a."Transaction Count",a."Available From",a."Balance Status")
   IS DISTINCT FROM ROW(v."Money In",v."Money Out",v."Opening Balance",v."Closing Balance",v."Transaction Count",v."Available From",v."Balance Status"))
 UNION ALL SELECT 'Portfolio cash matches independent consolidated history',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a JOIN public.reporting_cashflow_daily v ON a."Snapshot Date"=v."Date" AND v."Scope ID"='__ALL__'
  WHERE ROW(a."Cash Money In",a."Cash Money Out",a."Cash Opening Balance",a."Cash Balance EOD",a."Cash Available From",a."Cash Balance Status")
   IS DISTINCT FROM ROW(v."Money In",v."Money Out",v."Opening Balance",v."Closing Balance",v."Available From",v."Balance Status"))
 UNION ALL SELECT 'Current account balances match live custody',NOT EXISTS(
  SELECT 1 FROM public."Cash Account Daily Analytics" a JOIN public."Cash Account Balances" v ON a."Ref Cash Account"=v."Ref Cash Account"
  WHERE a."Snapshot Date"=public.olap_reporting_date() AND a."Closing Balance" IS DISTINCT FROM v."Current Balance")
 UNION ALL SELECT 'Cash opening plus movement equals closing',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" WHERE "Cash Opening Balance"+"Cash Money In"-"Cash Money Out" IS DISTINCT FROM "Cash Balance EOD")
 UNION ALL SELECT 'Consecutive known account balances roll forward',NOT EXISTS(
  SELECT 1 FROM public."Cash Account Daily Analytics" a JOIN public."Cash Account Daily Analytics" b
   ON a."Ref Cash Account"=b."Ref Cash Account" AND a."Snapshot Date"=b."Snapshot Date"+1
  WHERE a."Opening Balance" IS NOT NULL AND b."Closing Balance" IS NOT NULL AND a."Opening Balance"<>b."Closing Balance")
 UNION ALL SELECT 'Unknown and pre-opening balances remain NULL',NOT EXISTS(
  SELECT 1 FROM public."Cash Account Daily Analytics" WHERE ("Available From" IS NULL OR "Snapshot Date"<"Available From") AND "Closing Balance" IS NOT NULL)
 UNION ALL SELECT 'Partner daily inputs match existing governed allocation',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a JOIN public.reporting_income_daily v ON a."Snapshot Date"=v."Date"
  WHERE a."Partner A Net Profit" IS DISTINCT FROM v."Partner A Net Profit" OR a."Partner B Net Profit" IS DISTINCT FROM v."Partner B Net Profit")
 UNION ALL SELECT 'Daily net profit equals interest less dated expenses',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a WHERE a."Net Profit" IS DISTINCT FROM a."Interest Received"-a."Business Expenses"
   OR a."Business Expenses"::numeric IS DISTINCT FROM coalesce((SELECT sum(e."Amount"::numeric) FROM public."Business Expenses" e WHERE e."Expense Date"=a."Snapshot Date"),0))
 UNION ALL SELECT 'Capital movements match dated source',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a WHERE
   a."Capital Contributed" IS DISTINCT FROM coalesce((SELECT sum(c."Amount"::numeric) FROM public."Cash Pool Contributions" c WHERE c."Contribution Date"=a."Snapshot Date" AND c."Transaction Type"='Contribution'),0)
   OR a."Capital Withdrawn" IS DISTINCT FROM coalesce((SELECT sum(c."Amount"::numeric) FROM public."Cash Pool Contributions" c WHERE c."Contribution Date"=a."Snapshot Date" AND c."Transaction Type" IS DISTINCT FROM 'Contribution'),0))
 UNION ALL SELECT 'Only completed settlements enter daily payments',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a WHERE a."Partner Settlements" IS DISTINCT FROM coalesce((SELECT sum(s."Amount"::numeric) FROM public."Settlements" s WHERE s."Transfer Date"=a."Snapshot Date" AND s."Status"='Completed'),0))
 UNION ALL SELECT 'Stored per-role payments match completed source',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a CROSS JOIN (VALUES('A'),('B')) role(r)
  WHERE CASE WHEN role.r='A' THEN a."Partner A Settlements" ELSE a."Partner B Settlements" END IS DISTINCT FROM coalesce((
   SELECT sum(s."Amount"::numeric) FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
   WHERE s."Transfer Date"=a."Snapshot Date" AND s."Status"='Completed' AND p."Partner Role"=role.r),0))
 UNION ALL SELECT 'Portfolio and account generations are atomic',NOT EXISTS(
  SELECT 1 FROM public."Daily Analytics" a JOIN public."Cash Account Daily Analytics" c USING("Snapshot Date") WHERE a."Generated At" IS DISTINCT FROM c."Generated At")
 UNION ALL SELECT 'Snapshot views label today provisional',NOT EXISTS(
  SELECT 1 FROM public.reporting_daily_snapshot WHERE "Provisional" IS DISTINCT FROM ("Snapshot Date"=public.olap_reporting_date()) OR "Freshness Basis"<>'Hourly snapshot')
 UNION ALL SELECT 'No undated historical source facts',
 NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Loan Date" IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Payment Date" IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Charge Date" IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public."Cash Pool Contributions" WHERE "Contribution Date" IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Expense Date" IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public."Settlements" WHERE "Status"='Completed' AND "Transfer Date" IS NULL)
)
SELECT json_agg(checks) FROM checks;
