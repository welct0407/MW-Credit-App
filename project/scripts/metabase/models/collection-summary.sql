SELECT s.status AS "Collection Status",count(c."Borrower ID") AS "Borrower Count",
       coalesce(sum(c."Receipts Today"),0) AS "Receipts Today",
       coalesce(sum(c."Amount Remaining"),0) AS "Amount Remaining"
FROM (VALUES ('Fully Paid'),('Partially Paid'),('Not Paid'),('Overdue')) s(status)
LEFT JOIN {{model:collections}} c ON c."Daily Collection Status"=s.status
GROUP BY s.status
