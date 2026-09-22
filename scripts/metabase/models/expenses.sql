SELECT "Row ID" AS "Expense ID", "Expense Date", "Expense Category", "Amount"::numeric AS "Expense Amount",
       -"Amount"::numeric AS "Statement Expense",
       date_trunc('month',"Expense Date")::date AS "Expense Month",
       "Expense Date" BETWEEN date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "In Current Month"
FROM public."Business Expenses"
WHERE "Expense Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
