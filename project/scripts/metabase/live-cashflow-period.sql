WITH selected AS (
 SELECT d."Date" FROM public.reporting_statement_calendar d WHERE true [[AND {{cashflow_period}}]]
), bounds AS (
 SELECT min("Date") starts,max("Date") ends,count(*) days FROM selected
)
SELECT b.starts AS "Period Start",b.ends AS "Period End",s."Account",s."Available From",
 s."Opening Balance",s."Money In",s."Money Out",s."Net Movement",s."Closing Balance",s."Transaction Count",
 b.days=b.ends-b.starts+1 AS "Continuous Period",
 CASE WHEN b.days=0 THEN 'No dates in reporting range' WHEN b.days<>b.ends-b.starts+1 THEN 'Choose one continuous date range'
 ELSE coalesce(s."Statement Status",'Account unavailable') END AS "Statement Status",
 CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok' AS "Queried At"
FROM bounds b LEFT JOIN LATERAL public.reporting_cash_period(b.starts,b.ends,{{cash_account}}) s
 ON b.days=b.ends-b.starts+1
