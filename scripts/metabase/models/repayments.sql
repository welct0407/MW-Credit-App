WITH context AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today)
SELECT r."Row ID" AS "Repayment ID", r."Ref Loans" AS "Loan ID",
       l."Borrower ID", l."Borrower", l."Hidden", l."Loan Type",
       r."Payment Date", r."Interest Paid"::numeric AS "Interest Paid",
       r."Principal Paid"::numeric AS "Principal Paid",
       CASE WHEN r."Payment Date" BETWEEN c.today-29 AND c.today THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest 30D",
       CASE WHEN r."Payment Date" BETWEEN c.today-6 AND c.today THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest Recent 7D",
       CASE WHEN r."Payment Date" BETWEEN c.today-14 AND c.today-8 THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest Prior 7D",
       (r."Payment Date" BETWEEN c.today-29 AND c.today) AS "In Last 30 Days"
FROM public.olap_repayments_analytics r
LEFT JOIN {{model:loans}} l ON l."Loan ID"=r."Ref Loans"
CROSS JOIN context c
