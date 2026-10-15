WITH interest AS (
 SELECT coalesce(sum("Interest Paid"),0) all_time,
        coalesce(sum("Interest 30D"),0) last_30d,
        coalesce(sum("Interest Recent 7D"),0) recent_7d,
        coalesce(sum("Interest Prior 7D"),0) prior_7d
 FROM {{model:repayments}} r
)
SELECT s."Row ID" AS "Portfolio ID",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "As Of Date",
       s."Peak Cash Pool Date 30D",s."Total Cash Pool",s."Outstanding Principal",
       s."Total Cash Pool"-s."Outstanding Principal" AS "Available Cash",
       s."Outstanding Principal"/NULLIF(s."Total Cash Pool",0) AS "Cash Pool Utilization",
       s."Expected Daily Interest",s."Realized Profit MTD",s."Projected Monthly Profit",s."Active Loans",
       s."Expected Loan Account Balance" AS "Loan Account Balance",s."Total Unsettled Profit" AS "Unsettled Profit",
       'Loan account'::text AS "Account",i.all_time AS "Interest Paid",i.last_30d AS "Profit in Past 30 Days",
       (i.recent_7d-i.prior_7d)/NULLIF(i.prior_7d,0) AS "7-Day Profit Growth %",
       (SELECT "Borrower" FROM {{model:borrowers}} b WHERE b."Hidden" IS NOT TRUE
        ORDER BY b."Outstanding Principal" DESC NULLS LAST,b."Borrower ID" LIMIT 1) AS "Top Borrower",
       s."Top 3 Borrower Concentration", s."Borrowers Fully Paid Today", s."Borrowers Partially Paid Today",
       s."Borrowers with Overdue Payment", s."Borrowers Not Paid Today", s."Amount Due Today",
       s."Amount Collected Today", s."Amount Outstanding Today", s."Amount Collection Rate Today",
       s."Projected Monthly Profit"-s."Realized Profit MTD" AS "Remaining Forecast Profit",
       s."Realized Profit MTD"/NULLIF(s."Projected Monthly Profit",0) AS "Forecast Realization",
       (SELECT count(*) FROM {{model:borrowers}} WHERE "Daily Collection Status" IS NOT NULL) AS "Borrowers Due Today"
FROM public.olap_portfolio_summary s CROSS JOIN interest i
