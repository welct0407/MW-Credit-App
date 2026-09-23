SELECT "Row ID" AS "Snapshot ID", "Snapshot Date" AS "Date", "Generated At", "Model Version",
       "Outstanding Principal EOD"::numeric AS "Outstanding Principal", "Interest Received"::numeric AS "Profit",
       "Pending Charges EOD"::numeric AS "Overdue Charges", "Principal Issued"::numeric AS "Principal Issued", "Principal Returned"::numeric AS "Principal Returned",
       NULLIF("Principal Issued"::numeric,0) AS "Issued Chart Amount",
       -NULLIF("Principal Returned"::numeric,0) AS "Returned Chart Amount",
       ("Snapshot Date" <> (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) AS "Include Overdue Trend",
       "Loans Issued", "Active Loans EOD", "Active Borrowers EOD",
       sum("Interest Received"::numeric) OVER (ORDER BY "Snapshot Date" ROWS UNBOUNDED PRECEDING) AS "Cumulative Profit",
       CASE WHEN "Outstanding Principal EOD"::numeric+"Principal Returned"::numeric>0
         THEN "Interest Received"::numeric/("Outstanding Principal EOD"::numeric+"Principal Returned"::numeric)
         ELSE 0 END AS "Daily Capital Yield",
       ("Snapshot Date" BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-29
        AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) AS "In Last 30 Days"
FROM public."Daily Analytics"
