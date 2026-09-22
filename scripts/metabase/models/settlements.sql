SELECT s."Row ID" AS "Settlement ID",s."Ref Partner" AS "Partner ID",p."Partner Name" AS "Partner",
       p."Partner Role",s."Transfer Date",s."Amount"::numeric AS "Amount",s."Status"
FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
WHERE s."Transfer Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
