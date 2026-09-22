SELECT l."Row ID" AS "Loan ID", l."Ref Borrowers" AS "Borrower ID",
       b."Borrower", b."Hidden", l."Loan Date",
       CASE l."Loan Type"
         WHEN 'กำหนดวันชำระ' THEN 'Fixed Due Date'
         WHEN 'ดอกเบี้ยรายวัน' THEN 'Daily Interest'
         WHEN 'ผ่อนชำระรายวัน' THEN 'Daily Installment'
         ELSE 'Unknown'
       END AS "Loan Type",
       l."Loan Type" AS "Loan Type Thai", l."Outstanding Principal"
FROM public.olap_loans_analytics l
LEFT JOIN {{model:borrowers}} b ON b."Borrower ID"=l."Ref Borrowers"
