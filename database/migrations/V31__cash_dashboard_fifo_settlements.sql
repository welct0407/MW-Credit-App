-- R014: read-only dashboard. No financial rows, base columns or posting rules change.
-- Completed settlements consume each partner's cumulative prior-month net profit
-- before the current month's profit. Pending reservations are not withdrawals.
CREATE FUNCTION public.fifo_current_month_settled(prior_net numeric, month_net numeric, completed numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path=pg_catalog AS $$
 SELECT least(greatest(month_net,0), greatest(completed-greatest(prior_net,0),0))
$$;

CREATE VIEW public."Cash Dashboard" AS
WITH ctx AS (SELECT d,date_trunc('month',d)::date ms FROM (SELECT public.olap_reporting_date() d) q),
profit AS (
 SELECT coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date">=ms),0) income,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_b,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date">=ms),0) month_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date">=ms),0) month_b
 FROM public.olap_repayments_analytics r CROSS JOIN ctx WHERE r."Payment Date"<=d
), expense AS (
 SELECT coalesce(sum(e."Amount"::numeric) FILTER(WHERE e."Expense Date">=ms),0) amount,
 coalesce(sum(e."Partner A Expense"::numeric) FILTER(WHERE e."Expense Date"<ms),0) prior_a,
 coalesce(sum(e."Partner B Expense"::numeric) FILTER(WHERE e."Expense Date"<ms),0) prior_b,
 coalesce(sum(e."Partner A Expense"::numeric) FILTER(WHERE e."Expense Date">=ms),0) month_a,
 coalesce(sum(e."Partner B Expense"::numeric) FILTER(WHERE e."Expense Date">=ms),0) month_b
 FROM public."Business Expenses" e CROSS JOIN ctx WHERE e."Expense Date"<=d
), settled AS (
 SELECT coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='A'),0) a,
 coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='B'),0) b
 FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
 CROSS JOIN ctx WHERE s."Status"='Completed' AND s."Transfer Date"<=d
), allocated AS (
 SELECT profit.income,expense.amount,
 public.fifo_current_month_settled(profit.prior_a-expense.prior_a,profit.month_a-expense.month_a,settled.a) a,
 public.fifo_current_month_settled(profit.prior_b-expense.prior_b,profit.month_b-expense.month_b,settled.b) b
 FROM profit CROSS JOIN expense CROSS JOIN settled
), cash AS (
 SELECT CASE WHEN bool_and("Initialized") THEN sum("Business Cash Held") END held
 FROM public."Cash Account Balances"
)
SELECT 'cash-dashboard'::text AS "Row ID",
 allocated.income AS "Operating Income MTD",
 -allocated.amount AS "Expenses MTD",
 allocated.income-allocated.amount AS "Net Profit MTD",
 -allocated.a AS "Tommy Withdrawn MTD",
 -allocated.b AS "Lisa Withdrawn MTD",
 allocated.income-allocated.amount-allocated.a-allocated.b AS "Unsettled Profit MTD",
 pool."Available Cashpool"::numeric AS "Cash Pool Remaining",
 cash.held AS "Business Cash Held"
FROM allocated CROSS JOIN public."Loan Form Context" pool CROSS JOIN cash;

COMMENT ON VIEW public."Cash Dashboard" IS
'R014 read-only Bangkok MTD: signed income/expenses, completed per-partner FIFO withdrawals from inception, net unsettled profit, available contributed capital and positive initialized account custody. Role A=Tommy, B=Lisa. Unknown account openings keep business cash unavailable. No base-data writes.';
