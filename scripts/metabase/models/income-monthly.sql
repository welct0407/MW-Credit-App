WITH income AS (
 SELECT date_trunc('month',"Payment Date")::date period_month,sum("Interest Paid") amount
 FROM {{model:repayments}}
 WHERE "Payment Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), expenses AS (
 SELECT "Expense Month" period_month,sum("Expense Amount") amount FROM {{model:expenses}} GROUP BY 1
), bounds AS (
 SELECT min(period_month) first_month FROM (SELECT period_month FROM income UNION ALL SELECT period_month FROM expenses) dates
), months AS (
 SELECT generate_series(coalesce(first_month,date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date),
   date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 month')::date period_month FROM bounds
)
SELECT m.period_month AS "Month",coalesce(i.amount,0) AS "Operating Income",coalesce(e.amount,0) AS "Expenses",
       -coalesce(e.amount,0) AS "Signed Expenses",coalesce(i.amount,0)-coalesce(e.amount,0) AS "Net Profit",
       (coalesce(i.amount,0)-coalesce(e.amount,0))/NULLIF(i.amount,0) AS "Net Margin",
       m.period_month=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "Is Current Month",
       CASE WHEN m.period_month=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         THEN 'Month to date' ELSE 'Full month' END AS "Period Coverage",
       m.period_month>=(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '11 months')::date AS "In Last 12 Months"
FROM months m LEFT JOIN income i USING(period_month) LEFT JOIN expenses e USING(period_month)
