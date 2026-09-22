SELECT s."Row ID" AS "Statement ID",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "As Of Date",
       date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "Month Start",
       to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok','FMMonth YYYY') AS "Statement Month",
       s."Operating Income MTD",s."Expenses MTD",s."Net Profit MTD",
       s."Tommy Withdrawn MTD",s."Lisa Withdrawn MTD",s."Unsettled Profit MTD",
       s."Cash Pool Remaining",s."Business Cash Held",
       s."Net Profit MTD"/NULLIF(s."Operating Income MTD",0) AS "Net Margin",
       -(s."Tommy Withdrawn MTD"+s."Lisa Withdrawn MTD") AS "Partner Draws MTD",
       s."Business Cash Held"-s."Cash Pool Remaining"-s."Unsettled Profit MTD" AS "Cash Reconciliation Difference",
       (SELECT coalesce(sum("Net Profit"),0) FROM {{model:income-monthly}}) AS "Net Profit Since Inception",
       (SELECT count(*) FROM {{model:cash-accounts}} WHERE NOT "Initialized") AS "Uninitialized Accounts",
       CASE WHEN s."Business Cash Held" IS NULL THEN 'Account opening balance missing'
         WHEN abs(s."Business Cash Held"-s."Cash Pool Remaining"-s."Unsettled Profit MTD")<0.005 THEN 'Reconciled'
         ELSE 'Review difference' END AS "Cash Reconciliation Status"
FROM public."Cash Dashboard" s
