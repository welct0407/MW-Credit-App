WITH income AS (
 SELECT "Payment Date" d,sum("Interest Paid"::numeric) income,
  sum("Partner A Profit") pa,sum("Partner B Profit") pb
 FROM public.olap_repayments_analytics
 WHERE "Payment Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), expenses AS (
 SELECT "Expense Date" d,sum("Amount"::numeric) expense,
  sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
 FROM public."Business Expenses"
 WHERE "Expense Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), settled AS (
 SELECT "Transfer Date" d,coalesce(sum("Amount") FILTER(WHERE "Partner Role"='A'),0) pa,
  coalesce(sum("Amount") FILTER(WHERE "Partner Role"='B'),0) pb
 FROM {{model:settlements}} WHERE "Status"='Completed' GROUP BY 1
), bounds AS (
 SELECT min(d) first_date FROM (SELECT d FROM income UNION ALL SELECT d FROM expenses UNION ALL SELECT d FROM settled) dates
), calendar AS (
 SELECT generate_series(date_trunc('month',coalesce(first_date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date))::date,
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 day')::date d FROM bounds
), daily AS (
 SELECT c.d,coalesce(i.income,0) income,coalesce(e.expense,0) expense,
  coalesce(i.pa,0)-coalesce(e.pa,0) pa_net,coalesce(i.pb,0)-coalesce(e.pb,0) pb_net,
  coalesce(s.pa,0) pa_settled,coalesce(s.pb,0) pb_settled
 FROM calendar c LEFT JOIN income i USING(d) LEFT JOIN expenses e USING(d) LEFT JOIN settled s USING(d)
)
SELECT d AS "Date",date_trunc('month',d)::date AS "Month",income AS "Operating Income",
 expense AS "Expenses",-expense AS "Signed Expenses",income-expense AS "Net Profit",
 pa_net AS "Partner A Net Profit",pb_net AS "Partner B Net Profit",
 coalesce(sum(pa_net) OVER(ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner A Net",
 coalesce(sum(pb_net) OVER(ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner B Net",
 sum(pa_settled) OVER(ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner A Settled Through Date",
 sum(pb_settled) OVER(ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner B Settled Through Date",
 sum(income-expense) OVER(ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Net Profit Through Date"
FROM daily
