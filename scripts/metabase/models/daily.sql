SELECT "Row ID" AS "Snapshot ID", "Snapshot Date" AS "Date", "Generated At", "Model Version",
       "Outstanding Principal EOD"::numeric AS "Outstanding Principal", "Interest Received"::numeric AS "Profit",
       "Pending Charges EOD"::numeric AS "Overdue Charges", "Principal Issued"::numeric AS "Principal Issued", "Principal Returned"::numeric AS "Principal Returned",
       NULLIF("Principal Issued"::numeric,0) AS "Issued Chart Amount",
       -NULLIF("Principal Returned"::numeric,0) AS "Returned Chart Amount",
       ("Snapshot Date" <> (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) AS "Include Overdue Trend"
FROM public."Daily Analytics"
