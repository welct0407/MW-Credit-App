SELECT p."Row ID" AS "Partner ID",p."Partner Name" AS "Partner",p."Partner Role",
       CASE p."Partner Role" WHEN 'A' THEN c."Partner A Profit Share"
         WHEN 'B' THEN c."Partner B Profit Share" END AS "Current Pool Share"
FROM public."Partners" p CROSS JOIN public."Loan Form Context" c
WHERE p."Partner Role" IN ('A','B')
