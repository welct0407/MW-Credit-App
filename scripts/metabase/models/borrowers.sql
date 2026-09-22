SELECT "Row ID" AS "Borrower ID", "Description" AS "Borrower",
       "Creation Date" AS "Created Date", "Hidden Flag" AS "Hidden",
       "Total Outstanding Principal" AS "Outstanding Principal",
       "Active Loan Count" AS "Active Loans", "Overdue Amount" AS "Overdue Amount"
FROM public.olap_borrowers_analytics
