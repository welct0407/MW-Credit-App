WITH selected AS (
 SELECT d."Date" FROM public.reporting_statement_calendar d WHERE true [[AND {{statement_period}}]]
), bounds AS (
 SELECT min("Date") starts,max("Date") ends,count(*) days FROM selected
), totals AS (
 SELECT b.*,coalesce((SELECT sum(e."Income") FROM {{#186}} e WHERE e."Date" BETWEEN b.starts AND b.ends),0) income,
 coalesce((SELECT sum(e."Expenses") FROM {{#186}} e WHERE e."Date" BETWEEN b.starts AND b.ends),0) expenses,
 coalesce((SELECT sum(e."Principal Write-offs") FROM {{#186}} e WHERE e."Date" BETWEEN b.starts AND b.ends),0) writeoffs,
 coalesce((SELECT sum(e."Late Charges Received") FROM {{#186}} e WHERE e."Date" BETWEEN b.starts AND b.ends),0) latecharges FROM bounds b
)
SELECT starts AS "Period Start",ends AS "Period End",
 CASE WHEN days=ends-starts+1 THEN income END AS "Operating Income",
 CASE WHEN days=ends-starts+1 THEN -expenses END AS "Operating Expenses",
 CASE WHEN days=ends-starts+1 THEN income-expenses-writeoffs END AS "Net Profit",
 CASE WHEN days=ends-starts+1 THEN (income-expenses-writeoffs)/nullif(days,0) END AS "Average Daily Net Profit",
 days=ends-starts+1 AS "Continuous Period",
 CASE WHEN days=0 THEN 'No dates in reporting range' WHEN days<>ends-starts+1 THEN 'Choose one continuous date range' ELSE 'Ready' END AS "Selection Status",
 CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok' AS "Queried At",
 CASE WHEN days=ends-starts+1 THEN -writeoffs END AS "Principal Write-offs",
 CASE WHEN days=ends-starts+1 THEN latecharges END AS "Late Charges Received"
FROM totals
