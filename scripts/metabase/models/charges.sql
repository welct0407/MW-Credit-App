SELECT c."Row ID" AS "Charge ID", c."Ref Loans" AS "Loan ID",
       l."Borrower ID", l."Borrower", l."Hidden", l."Loan Type",
       c."Charge Date",date_trunc('month',c."Charge Date")::date AS "Charge Month",
       c."Amount Due",c."Amount Remaining",c."Total Paid",c."Payment Status",
       c."Payment Date",c."Days Late",c."Historical On Time",c."Historical Late",
       CASE WHEN c."Historical Late" IS TRUE THEN 'Late' ELSE 'On time' END AS "Payment Timing",
       CASE WHEN c."Charge Date"<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         AND c."Amount Remaining">0 THEN c."Amount Remaining" ELSE 0 END AS "Past Due Amount"
FROM public.olap_charges_analytics c
LEFT JOIN {{model:loans}} l ON l."Loan ID"=c."Ref Loans"
