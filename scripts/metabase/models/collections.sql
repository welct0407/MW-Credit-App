WITH receipts AS (
 SELECT "Borrower ID",sum("Principal Paid"+"Interest Paid") AS received
 FROM {{model:repayments}}
 WHERE "Payment Date"=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
)
SELECT b."Borrower ID",b."Borrower",b."Hidden",b."Daily Collection Status",
       b."Todays Amount Due" AS "Amount Due",b."Todays Amount Collected" AS "Amount Collected",
       b."Todays Amount Remaining" AS "Amount Remaining",b."Overdue Amount",
       coalesce(r.received,0) AS "Receipts Today"
FROM {{model:borrowers}} b LEFT JOIN receipts r ON r."Borrower ID"=b."Borrower ID"
WHERE b."Daily Collection Status" IS NOT NULL
