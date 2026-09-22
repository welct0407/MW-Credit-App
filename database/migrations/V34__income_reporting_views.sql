-- R016: owner requested heavy reporting logic in PostgreSQL views.
-- Additive, read-only definitions. No source rows, existing views or functions change.

CREATE VIEW public.reporting_expenses AS
SELECT "Row ID" AS "Expense ID", "Expense Date", "Expense Category", "Amount"::numeric AS "Expense Amount",
       -"Amount"::numeric AS "Statement Expense",
       date_trunc('month',"Expense Date")::date AS "Expense Month",
       "Expense Date" BETWEEN date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "In Current Month"
FROM public."Business Expenses"
WHERE "Expense Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;
COMMENT ON VIEW public.reporting_expenses IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';

CREATE VIEW public.reporting_cash_accounts AS
SELECT "Ref Cash Account" AS "Cash Account ID", "Ref Cash Holder" AS "Cash Holder ID",
       "Holder Name" AS "Cash Holder", "Account Label" AS "Account", "Current Balance",
       "Initialized", "Business Cash Held", "Reimbursement / Advance Due" AS "Advance Due",
       CASE WHEN bool_and("Initialized") OVER(PARTITION BY "Ref Cash Holder")
         THEN "Business Cash Held" END AS "Holder Cash Component",
       CASE WHEN "Initialized" THEN 'Known' ELSE 'Opening balance missing' END AS "Balance Status"
FROM public."Cash Account Balances";
COMMENT ON VIEW public.reporting_cash_accounts IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';

CREATE VIEW public.reporting_income_monthly AS
WITH income AS (
 SELECT date_trunc('month',"Payment Date")::date period_month,sum("Interest Paid") amount
 FROM (WITH context AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today)
SELECT r."Row ID" AS "Repayment ID", r."Ref Loans" AS "Loan ID",
       l."Borrower ID", l."Borrower", l."Hidden", l."Loan Type",
       r."Payment Date", r."Interest Paid"::numeric AS "Interest Paid",
       r."Principal Paid"::numeric AS "Principal Paid",
       CASE WHEN r."Payment Date" BETWEEN c.today-29 AND c.today THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest 30D",
       CASE WHEN r."Payment Date" BETWEEN c.today-6 AND c.today THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest Recent 7D",
       CASE WHEN r."Payment Date" BETWEEN c.today-14 AND c.today-8 THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest Prior 7D",
       (r."Payment Date" BETWEEN c.today-29 AND c.today) AS "In Last 30 Days"
FROM public.olap_repayments_analytics r
LEFT JOIN (SELECT l."Row ID" AS "Loan ID", l."Ref Borrowers" AS "Borrower ID",
       b."Borrower", b."Hidden", l."Loan Date",
       CASE l."Loan Type"
         WHEN 'กำหนดวันชำระ' THEN 'Fixed Due Date'
         WHEN 'ดอกเบี้ยรายวัน' THEN 'Daily Interest'
         WHEN 'ผ่อนชำระรายวัน' THEN 'Daily Installment'
         ELSE 'Unknown'
       END AS "Loan Type",
       l."Loan Type" AS "Loan Type Thai", l."Outstanding Principal",
       l."Principal Amount"::numeric AS "Principal Amount", l."Close Date", l."Due Date",
       CASE l."Loan Status" WHEN 'ปิดยอดแล้ว' THEN 'Closed' WHEN 'ยังไม่ปิดยอด' THEN 'Active' ELSE l."Loan Status" END AS "Loan Status",
       l."Current Daily Interest"::numeric AS "Current Daily Interest", l."Expected Interest This Month",
       l."Total Interest Received", l."Total Principal Received", l."Loan Age Days", l."Loan Age Bucket",
       l."Defaulted Flag", l."Default Loss Amount"::numeric AS "Default Loss Amount",
       date_trunc('week',l."Loan Date")::date AS "Loan Week"
FROM public.olap_loans_analytics l
LEFT JOIN (SELECT "Row ID" AS "Borrower ID", "Description" AS "Borrower",
       "Creation Date" AS "Created Date", "Hidden Flag" AS "Hidden",
       "Total Outstanding Principal" AS "Outstanding Principal",
       "Active Loan Count" AS "Active Loans", "Overdue Amount" AS "Overdue Amount",
       "Has Active Loan", "Total Interest Earned", "Total Number of Loans",
       "Return on Active Principal", "Profit Last 30 Days", "30D Average Outstanding Principal",
       "30D Return on Average Principal", "Daily Collection Status", "Todays Amount Due",
       "Todays Amount Collected", "Todays Amount Remaining", "Portfolio Exposure %",
       "Oldest Active Loan Age", "Historical Charge Count", "Lifetime On Time Rate",
       "Recent 30D On Time Rate", "Lifetime Late Payment Count", "Recent 30D Late Payment Count",
       "Maximum Days Late", "Last Late Payment Date", "Largest Successful Loan",
       "Average Successful Loan Size", "Default Count", "Lifetime Default Loss",
       "Portfolio Outstanding Principal", "Projected Monthly Profit Contribution",
       "Matrix Economic Contribution", "Matrix Recent Reliability Score",
       "Matrix Historical Reliability Score", "Matrix Delay Severity Score",
       "Matrix Current Condition Score", "Matrix History Sufficient", "Matrix Stability Score",
       "Matrix Quadrant", "Matrix Scaled Economic Contribution",
       "Description" || ' · ' || coalesce("Matrix Quadrant", 'Unclassified') AS "Matrix Label",
       row_number() OVER (ORDER BY "Total Outstanding Principal" DESC NULLS LAST,"Row ID") AS "Principal Rank",
       EXISTS(SELECT 1 FROM public.olap_loans_analytics l
              WHERE l."Ref Borrowers"=b."Row ID" AND l."Loan Status"='ปิดยอดแล้ว') AS "Has Closed Loan"
FROM public.olap_borrowers_analytics b) b ON b."Borrower ID"=l."Ref Borrowers") l ON l."Loan ID"=r."Ref Loans"
CROSS JOIN context c)
 WHERE "Payment Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), expenses AS (
 SELECT "Expense Month" period_month,sum("Expense Amount") amount FROM (SELECT "Row ID" AS "Expense ID", "Expense Date", "Expense Category", "Amount"::numeric AS "Expense Amount",
       -"Amount"::numeric AS "Statement Expense",
       date_trunc('month',"Expense Date")::date AS "Expense Month",
       "Expense Date" BETWEEN date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "In Current Month"
FROM public."Business Expenses"
WHERE "Expense Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) GROUP BY 1
), bounds AS (
 SELECT min(period_month) first_month FROM (SELECT period_month FROM income UNION ALL SELECT period_month FROM expenses) dates
), months AS (
 SELECT generate_series(coalesce(first_month,date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date),
   date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 month')::date period_month FROM bounds
)
SELECT m.period_month AS "Month",coalesce(i.amount,0) AS "Operating Income",coalesce(e.amount,0) AS "Expenses",
       -coalesce(e.amount,0) AS "Signed Expenses",coalesce(i.amount,0)-coalesce(e.amount,0) AS "Net Profit",
       (coalesce(i.amount,0)-coalesce(e.amount,0))/NULLIF(i.amount,0) AS "Net Margin",
       m.period_month=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "Is Current Month",
       CASE WHEN m.period_month=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         THEN 'Month to date' ELSE 'Full month' END AS "Period Coverage",
       m.period_month>=(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '11 months')::date AS "In Last 12 Months"
FROM months m LEFT JOIN income i USING(period_month) LEFT JOIN expenses e USING(period_month);
COMMENT ON VIEW public.reporting_income_monthly IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';

CREATE VIEW public.reporting_income_statement AS
SELECT s."Row ID" AS "Statement ID",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "As Of Date",
       date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "Month Start",
       to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok','FMMonth YYYY') AS "Statement Month",
       s."Operating Income MTD",s."Expenses MTD",s."Net Profit MTD",
       s."Tommy Withdrawn MTD",s."Lisa Withdrawn MTD",s."Unsettled Profit MTD",
       s."Cash Pool Remaining",s."Business Cash Held",
       s."Net Profit MTD"/NULLIF(s."Operating Income MTD",0) AS "Net Margin",
       -(s."Tommy Withdrawn MTD"+s."Lisa Withdrawn MTD") AS "Partner Draws MTD",
       s."Business Cash Held"-s."Cash Pool Remaining"-s."Unsettled Profit MTD" AS "Cash Reconciliation Difference",
       (SELECT coalesce(sum("Net Profit"),0) FROM (WITH income AS (
 SELECT date_trunc('month',"Payment Date")::date period_month,sum("Interest Paid") amount
 FROM (WITH context AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today)
SELECT r."Row ID" AS "Repayment ID", r."Ref Loans" AS "Loan ID",
       l."Borrower ID", l."Borrower", l."Hidden", l."Loan Type",
       r."Payment Date", r."Interest Paid"::numeric AS "Interest Paid",
       r."Principal Paid"::numeric AS "Principal Paid",
       CASE WHEN r."Payment Date" BETWEEN c.today-29 AND c.today THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest 30D",
       CASE WHEN r."Payment Date" BETWEEN c.today-6 AND c.today THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest Recent 7D",
       CASE WHEN r."Payment Date" BETWEEN c.today-14 AND c.today-8 THEN r."Interest Paid"::numeric ELSE 0 END AS "Interest Prior 7D",
       (r."Payment Date" BETWEEN c.today-29 AND c.today) AS "In Last 30 Days"
FROM public.olap_repayments_analytics r
LEFT JOIN (SELECT l."Row ID" AS "Loan ID", l."Ref Borrowers" AS "Borrower ID",
       b."Borrower", b."Hidden", l."Loan Date",
       CASE l."Loan Type"
         WHEN 'กำหนดวันชำระ' THEN 'Fixed Due Date'
         WHEN 'ดอกเบี้ยรายวัน' THEN 'Daily Interest'
         WHEN 'ผ่อนชำระรายวัน' THEN 'Daily Installment'
         ELSE 'Unknown'
       END AS "Loan Type",
       l."Loan Type" AS "Loan Type Thai", l."Outstanding Principal",
       l."Principal Amount"::numeric AS "Principal Amount", l."Close Date", l."Due Date",
       CASE l."Loan Status" WHEN 'ปิดยอดแล้ว' THEN 'Closed' WHEN 'ยังไม่ปิดยอด' THEN 'Active' ELSE l."Loan Status" END AS "Loan Status",
       l."Current Daily Interest"::numeric AS "Current Daily Interest", l."Expected Interest This Month",
       l."Total Interest Received", l."Total Principal Received", l."Loan Age Days", l."Loan Age Bucket",
       l."Defaulted Flag", l."Default Loss Amount"::numeric AS "Default Loss Amount",
       date_trunc('week',l."Loan Date")::date AS "Loan Week"
FROM public.olap_loans_analytics l
LEFT JOIN (SELECT "Row ID" AS "Borrower ID", "Description" AS "Borrower",
       "Creation Date" AS "Created Date", "Hidden Flag" AS "Hidden",
       "Total Outstanding Principal" AS "Outstanding Principal",
       "Active Loan Count" AS "Active Loans", "Overdue Amount" AS "Overdue Amount",
       "Has Active Loan", "Total Interest Earned", "Total Number of Loans",
       "Return on Active Principal", "Profit Last 30 Days", "30D Average Outstanding Principal",
       "30D Return on Average Principal", "Daily Collection Status", "Todays Amount Due",
       "Todays Amount Collected", "Todays Amount Remaining", "Portfolio Exposure %",
       "Oldest Active Loan Age", "Historical Charge Count", "Lifetime On Time Rate",
       "Recent 30D On Time Rate", "Lifetime Late Payment Count", "Recent 30D Late Payment Count",
       "Maximum Days Late", "Last Late Payment Date", "Largest Successful Loan",
       "Average Successful Loan Size", "Default Count", "Lifetime Default Loss",
       "Portfolio Outstanding Principal", "Projected Monthly Profit Contribution",
       "Matrix Economic Contribution", "Matrix Recent Reliability Score",
       "Matrix Historical Reliability Score", "Matrix Delay Severity Score",
       "Matrix Current Condition Score", "Matrix History Sufficient", "Matrix Stability Score",
       "Matrix Quadrant", "Matrix Scaled Economic Contribution",
       "Description" || ' · ' || coalesce("Matrix Quadrant", 'Unclassified') AS "Matrix Label",
       row_number() OVER (ORDER BY "Total Outstanding Principal" DESC NULLS LAST,"Row ID") AS "Principal Rank",
       EXISTS(SELECT 1 FROM public.olap_loans_analytics l
              WHERE l."Ref Borrowers"=b."Row ID" AND l."Loan Status"='ปิดยอดแล้ว') AS "Has Closed Loan"
FROM public.olap_borrowers_analytics b) b ON b."Borrower ID"=l."Ref Borrowers") l ON l."Loan ID"=r."Ref Loans"
CROSS JOIN context c)
 WHERE "Payment Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), expenses AS (
 SELECT "Expense Month" period_month,sum("Expense Amount") amount FROM (SELECT "Row ID" AS "Expense ID", "Expense Date", "Expense Category", "Amount"::numeric AS "Expense Amount",
       -"Amount"::numeric AS "Statement Expense",
       date_trunc('month',"Expense Date")::date AS "Expense Month",
       "Expense Date" BETWEEN date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "In Current Month"
FROM public."Business Expenses"
WHERE "Expense Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) GROUP BY 1
), bounds AS (
 SELECT min(period_month) first_month FROM (SELECT period_month FROM income UNION ALL SELECT period_month FROM expenses) dates
), months AS (
 SELECT generate_series(coalesce(first_month,date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date),
   date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 month')::date period_month FROM bounds
)
SELECT m.period_month AS "Month",coalesce(i.amount,0) AS "Operating Income",coalesce(e.amount,0) AS "Expenses",
       -coalesce(e.amount,0) AS "Signed Expenses",coalesce(i.amount,0)-coalesce(e.amount,0) AS "Net Profit",
       (coalesce(i.amount,0)-coalesce(e.amount,0))/NULLIF(i.amount,0) AS "Net Margin",
       m.period_month=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS "Is Current Month",
       CASE WHEN m.period_month=date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
         THEN 'Month to date' ELSE 'Full month' END AS "Period Coverage",
       m.period_month>=(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '11 months')::date AS "In Last 12 Months"
FROM months m LEFT JOIN income i USING(period_month) LEFT JOIN expenses e USING(period_month))) AS "Net Profit Since Inception",
       (SELECT count(*) FROM (SELECT "Ref Cash Account" AS "Cash Account ID", "Ref Cash Holder" AS "Cash Holder ID",
       "Holder Name" AS "Cash Holder", "Account Label" AS "Account", "Current Balance",
       "Initialized", "Business Cash Held", "Reimbursement / Advance Due" AS "Advance Due",
       CASE WHEN bool_and("Initialized") OVER(PARTITION BY "Ref Cash Holder")
         THEN "Business Cash Held" END AS "Holder Cash Component",
       CASE WHEN "Initialized" THEN 'Known' ELSE 'Opening balance missing' END AS "Balance Status"
FROM public."Cash Account Balances") WHERE NOT "Initialized") AS "Uninitialized Accounts",
       CASE WHEN s."Business Cash Held" IS NULL THEN 'Account opening balance missing'
         WHEN abs(s."Business Cash Held"-s."Cash Pool Remaining"-s."Unsettled Profit MTD")<0.005 THEN 'Reconciled'
         ELSE 'Review difference' END AS "Cash Reconciliation Status"
FROM public."Cash Dashboard" s;
COMMENT ON VIEW public.reporting_income_statement IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';

CREATE VIEW public.reporting_settlements AS
SELECT s."Row ID" AS "Settlement ID",s."Ref Partner" AS "Partner ID",p."Partner Name" AS "Partner",
       p."Partner Role",s."Transfer Date",s."Amount"::numeric AS "Amount",s."Status"
FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
WHERE s."Transfer Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;
COMMENT ON VIEW public.reporting_settlements IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';

CREATE VIEW public.reporting_income_daily AS
WITH income AS (
 SELECT "Payment Date" d,sum("Interest Paid"::numeric) income,
  sum("Partner A Profit") pa,sum("Partner B Profit") pb
 FROM public.olap_repayments_analytics
 WHERE "Payment Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), expenses AS (
 SELECT "Expense Date" d,sum("Amount"::numeric) expense,
  sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
 FROM public."Business Expenses"
 WHERE "Expense Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY 1
), settled AS (
 SELECT "Transfer Date" d,coalesce(sum("Amount") FILTER(WHERE "Partner Role"='A'),0) pa,
  coalesce(sum("Amount") FILTER(WHERE "Partner Role"='B'),0) pb
 FROM (SELECT s."Row ID" AS "Settlement ID",s."Ref Partner" AS "Partner ID",p."Partner Name" AS "Partner",
       p."Partner Role",s."Transfer Date",s."Amount"::numeric AS "Amount",s."Status"
FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
WHERE s."Transfer Date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) WHERE "Status"='Completed' GROUP BY 1
), bounds AS (
 SELECT min(d) first_date FROM (SELECT d FROM income UNION ALL SELECT d FROM expenses UNION ALL SELECT d FROM settled) dates
), calendar AS (
 SELECT generate_series(date_trunc('month',coalesce(first_date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date))::date,
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 day')::date d FROM bounds
), daily AS (
 SELECT c.d,coalesce(i.income,0) income,coalesce(e.expense,0) expense,
  coalesce(i.pa,0)-coalesce(e.pa,0) pa_net,coalesce(i.pb,0)-coalesce(e.pb,0) pb_net,
  coalesce(s.pa,0) pa_settled,coalesce(s.pb,0) pb_settled
 FROM calendar c LEFT JOIN income i USING(d) LEFT JOIN expenses e USING(d) LEFT JOIN settled s USING(d)
)
SELECT d AS "Date",date_trunc('month',d)::date AS "Month",income AS "Operating Income",
 expense AS "Expenses",-expense AS "Signed Expenses",income-expense AS "Net Profit",
 pa_net AS "Partner A Net Profit",pb_net AS "Partner B Net Profit",
 coalesce(sum(pa_net) OVER(ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner A Net",
 coalesce(sum(pb_net) OVER(ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner B Net",
 sum(pa_settled) OVER(ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner A Settled Through Date",
 sum(pb_settled) OVER(ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner B Settled Through Date",
 sum(income-expense) OVER(ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Net Profit Through Date"
FROM daily;
COMMENT ON VIEW public.reporting_income_daily IS 'R016: database-owned Income Statement source. Live Bangkok dates; original model grain and financial semantics preserved.';
