SELECT l."Row ID" AS "Loan ID", l."Ref Borrowers" AS "Borrower ID",
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
LEFT JOIN {{model:borrowers}} b ON b."Borrower ID"=l."Ref Borrowers"
