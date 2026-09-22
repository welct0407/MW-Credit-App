SELECT "Ref Cash Account" AS "Cash Account ID", "Ref Cash Holder" AS "Cash Holder ID",
       "Holder Name" AS "Cash Holder", "Account Label" AS "Account", "Current Balance",
       "Initialized", "Business Cash Held", "Reimbursement / Advance Due" AS "Advance Due",
       CASE WHEN bool_and("Initialized") OVER(PARTITION BY "Ref Cash Holder")
         THEN "Business Cash Held" END AS "Holder Cash Component",
       CASE WHEN "Initialized" THEN 'Known' ELSE 'Opening balance missing' END AS "Balance Status"
FROM public."Cash Account Balances"
