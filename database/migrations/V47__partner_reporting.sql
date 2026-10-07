-- R044: read-only partner reporting. No source rows, operational objects or apps change.
CREATE VIEW public.reporting_partner_capital_v1 AS
SELECT c."Row ID" capital_id,c."Ref Partner" partner_id,p."Partner Name" partner_name,
 p."Partner Role" partner_role,c."Contribution Date" activity_date,c."Transaction Type" transaction_type,
 c."Amount"::numeric amount,
 CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END net_movement,
 (p."Partner Role" IN ('A','B') AND c."Amount" IS NOT NULL AND c."Contribution Date" IS NOT NULL
  AND c."Transaction Type" IN ('Contribution','Withdrawal')) IS TRUE valid
FROM public."Cash Pool Contributions" c LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner";

CREATE VIEW public.reporting_partner_earnings_v1 AS
WITH mapping AS (
 SELECT "Partner Role" role,min("Row ID") partner_id FROM public."Partners"
 WHERE "Partner Role" IN ('A','B') GROUP BY 1 HAVING count(*)=1
), events AS (
 SELECT 'Interest'::text event_type,r."Row ID" event_id,r."Payment Date" activity_date,v.role,
 v.amount allocated_interest,0::numeric allocated_expense,r."Interest Paid" IS NOT NULL amount_known
 FROM public.olap_repayments_analytics r CROSS JOIN LATERAL
 (VALUES ('A',r."Partner A Profit"::numeric),('B',r."Partner B Profit"::numeric)) v(role,amount)
 UNION ALL
 SELECT 'Expense',e."Row ID",e."Expense Date",v.role,0::numeric,v.amount,e."Amount" IS NOT NULL
 FROM public."Business Expenses" e CROSS JOIN LATERAL
 (VALUES ('A',e."Partner A Expense"::numeric),('B',e."Partner B Expense"::numeric)) v(role,amount)
)
SELECT e.*,m.partner_id,p."Partner Name" partner_name,
 e.allocated_interest-e.allocated_expense net_earned,
 (m.partner_id IS NOT NULL AND e.activity_date IS NOT NULL AND e.amount_known
  AND e.allocated_interest IS NOT NULL AND e.allocated_expense IS NOT NULL) valid
FROM events e LEFT JOIN mapping m ON m.role=e.role LEFT JOIN public."Partners" p ON p."Row ID"=m.partner_id;

CREATE VIEW public.reporting_partner_settlements_v1 AS
SELECT s."Row ID" settlement_id,s."Ref Partner" partner_id,p."Partner Name" partner_name,
 p."Partner Role" partner_role,s."Transfer Date" activity_date,s."Amount"::numeric amount,s."Status" status,
 CASE WHEN s."Status"='Completed' THEN s."Amount"::numeric ELSE 0 END completed_amount,
 CASE WHEN s."Status"='Pending' THEN s."Amount"::numeric ELSE 0 END pending_amount,
 CASE WHEN s."Status" IS DISTINCT FROM 'Cancelled' THEN s."Amount"::numeric ELSE 0 END reserved_amount,
 (p."Partner Role" IN ('A','B') AND s."Amount" IS NOT NULL AND s."Amount"::numeric>0
  AND s."Status" IN ('Completed','Pending','Cancelled')) IS TRUE valid,
 CASE WHEN s."Transfer Date" IS NULL THEN 'Date missing'
 WHEN s."Transfer Date">public.olap_reporting_date() THEN 'Future transfer date' ELSE 'Dated' END date_status
FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner";

CREATE VIEW public.reporting_partner_position_v1 AS
WITH partners AS (
 SELECT "Row ID" partner_id,"Partner Name" partner_name,"Partner Role" partner_role,
 count(*) OVER(PARTITION BY "Partner Role") role_count
 FROM public."Partners" WHERE "Partner Role" IN ('A','B')
), capital AS (
 SELECT partner_id,sum(net_movement) net_capital,count(*) FILTER(WHERE NOT valid) invalid_count
 FROM public.reporting_partner_capital_v1 GROUP BY 1
), earnings AS (
 SELECT partner_id,sum(allocated_interest) interest_earned,sum(allocated_expense) expenses,
 count(*) FILTER(WHERE NOT valid OR activity_date>public.olap_reporting_date()) invalid_count
 FROM public.reporting_partner_earnings_v1 GROUP BY 1
), settlements AS (
 SELECT partner_id,sum(completed_amount) completed,sum(pending_amount) pending,sum(reserved_amount) reserved,
 count(*) FILTER(WHERE status='Pending') pending_count,
 count(*) FILTER(WHERE NOT valid OR status='Completed' AND (activity_date IS NULL OR activity_date>public.olap_reporting_date())) invalid_count
 FROM public.reporting_partner_settlements_v1 GROUP BY 1
), quality AS (
 SELECT
 (SELECT count(*) FROM public.reporting_partner_capital_v1 WHERE NOT valid OR activity_date>public.olap_reporting_date()) capital_exceptions,
 (SELECT count(*) FROM public.reporting_partner_earnings_v1 WHERE NOT valid OR activity_date>public.olap_reporting_date()) earnings_exceptions,
 (SELECT count(*) FROM public.reporting_partner_settlements_v1 WHERE NOT valid OR status='Completed' AND (activity_date IS NULL OR activity_date>public.olap_reporting_date())) settlement_exceptions,
 (SELECT count(*) FROM public.reporting_partner_settlements_v1 WHERE status='Pending' AND activity_date IS NULL) undated_pending,
 (SELECT coalesce(sum(net_movement),0) FROM public.reporting_partner_capital_v1) pool,
 (SELECT coalesce(sum("Partner A Profit"+"Partner B Profit"-"Interest Paid"::numeric),0) FROM public.olap_repayments_analytics) allocation_residual
), amounts AS (
 SELECT p.*,coalesce(c.net_capital,0) net_capital,
 CASE WHEN p.role_count=1 AND q.earnings_exceptions=0 AND q.capital_exceptions=0 THEN coalesce(e.interest_earned,0) END interest_earned,
 CASE WHEN p.role_count=1 AND q.earnings_exceptions=0 AND q.capital_exceptions=0 THEN coalesce(e.expenses,0) END expenses,
 coalesce(s.completed,0) completed,coalesce(s.pending,0) pending,coalesce(s.reserved,0) reserved,
 coalesce(s.pending_count,0) pending_count,q.*
 FROM partners p LEFT JOIN capital c USING(partner_id) LEFT JOIN earnings e USING(partner_id)
 LEFT JOIN settlements s USING(partner_id) CROSS JOIN quality q
), final AS (
 SELECT a.*,interest_earned-expenses net_earned,
 CASE WHEN pool>0 AND capital_exceptions=0 AND NOT EXISTS(SELECT 1 FROM amounts WHERE net_capital<0)
 THEN net_capital/pool END capital_share,
 (role_count=1 AND capital_exceptions=0 AND earnings_exceptions=0 AND settlement_exceptions=0) ready
 FROM amounts a
)
SELECT f.*,net_earned-completed unpaid,
 CASE WHEN ready THEN net_earned-reserved END available,
 reserved-completed-pending other_reserved,
 CASE WHEN ready THEN 'Ready' ELSE 'Needs review' END quality_status,
 CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok' queried_at
FROM final f;

-- Dense calendar permits period filters without losing earlier capital. Past values
-- are restated from current effective records, never historical status snapshots.
CREATE VIEW public.reporting_partner_daily_v1 AS
WITH bounds AS (
 SELECT least(coalesce(min(d),public.olap_reporting_date()),public.olap_reporting_date()) starts
 FROM (SELECT activity_date d FROM public.reporting_partner_capital_v1
 UNION ALL SELECT activity_date FROM public.reporting_partner_earnings_v1
 UNION ALL SELECT activity_date FROM public.reporting_partner_settlements_v1) x
), dates AS (
 SELECT generate_series(starts,public.olap_reporting_date(),interval '1 day')::date activity_date FROM bounds
), capital AS (
 SELECT partner_id,activity_date,
 sum(amount) FILTER(WHERE transaction_type='Contribution') contributed,
 sum(amount) FILTER(WHERE transaction_type='Withdrawal') withdrawn,sum(net_movement) movement
 FROM public.reporting_partner_capital_v1 GROUP BY 1,2
), earnings AS (
 SELECT partner_id,activity_date,sum(allocated_interest) interest,sum(allocated_expense) expense
 FROM public.reporting_partner_earnings_v1 GROUP BY 1,2
), settled AS (
 SELECT partner_id,activity_date,sum(completed_amount) completed FROM public.reporting_partner_settlements_v1 GROUP BY 1,2
), daily AS (
 SELECT p.partner_id,p.partner_name,d.activity_date,p.ready,p.capital_exceptions,p.earnings_exceptions,p.settlement_exceptions,
 CASE WHEN p.capital_exceptions=0 AND p.earnings_exceptions=0 AND p.role_count=1 THEN coalesce(e.interest,0) END allocated_interest,
 CASE WHEN p.capital_exceptions=0 AND p.earnings_exceptions=0 AND p.role_count=1 THEN coalesce(e.expense,0) END allocated_expense,
 CASE WHEN p.settlement_exceptions=0 THEN coalesce(s.completed,0) END completed_payouts,
 CASE WHEN p.capital_exceptions=0 THEN coalesce(c.contributed,0) END capital_contributed,
 CASE WHEN p.capital_exceptions=0 THEN coalesce(c.withdrawn,0) END capital_withdrawn,
 CASE WHEN p.capital_exceptions=0 THEN coalesce(c.movement,0) END capital_movement
 FROM public.reporting_partner_position_v1 p CROSS JOIN dates d
 LEFT JOIN capital c USING(partner_id,activity_date) LEFT JOIN earnings e USING(partner_id,activity_date)
 LEFT JOIN settled s USING(partner_id,activity_date)
)
SELECT d.*,allocated_interest-allocated_expense net_earned,
 CASE WHEN capital_exceptions=0 THEN sum(capital_movement) OVER(PARTITION BY partner_id ORDER BY activity_date ROWS UNBOUNDED PRECEDING) END capital_eod
FROM daily d;

CREATE VIEW public.reporting_partner_capital_ledger_v1 AS
WITH dated AS (
 SELECT partner_id,activity_date,sum(net_movement) movement FROM public.reporting_partner_capital_v1
 WHERE activity_date IS NOT NULL GROUP BY 1,2
), balances AS (
 SELECT partner_id,activity_date,sum(movement) OVER(PARTITION BY partner_id ORDER BY activity_date ROWS UNBOUNDED PRECEDING) date_end_capital
 FROM dated
)
SELECT c.*,b.date_end_capital FROM public.reporting_partner_capital_v1 c LEFT JOIN balances b USING(partner_id,activity_date);

COMMENT ON VIEW public.reporting_partner_position_v1 IS 'R044 current all-record partner entitlement. Net earned less all non-Cancelled reservations. Nullable safe availability, full-pool denominator, role uniqueness and global data-quality checks. Not cash liquidity.';
COMMENT ON VIEW public.reporting_partner_daily_v1 IS 'R044 actual daily allocated earnings, expenses, completed transfer-date payouts and capital. Historical allocations and opening capital precede display filters. Current records restate history; no forecasts or historic pending reconstruction.';
COMMENT ON VIEW public.reporting_partner_settlements_v1 IS 'R044 complete read-only settlement projection including future/undated Pending reservations and retained Cancelled audit rows. No contact or bank details.';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='metabase_borrower_reader') THEN
  GRANT SELECT ON public.reporting_partner_capital_v1,public.reporting_partner_earnings_v1,
   public.reporting_partner_settlements_v1,public.reporting_partner_position_v1,
   public.reporting_partner_daily_v1,public.reporting_partner_capital_ledger_v1 TO metabase_borrower_reader;
 END IF;
END $$;
