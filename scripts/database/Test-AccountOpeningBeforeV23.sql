\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('HIST72-A','A'),('HIST72-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('HIST72-CA','HIST72-A',current_date-3,'Contribution',1000::money),('HIST72-CB','HIST72-B',current_date-3,'Contribution',1000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('HIST72-BOR','Synthetic pre-account source');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('HIST72-L','HIST72-BOR',current_date-2,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('HIST72-C','HIST72-L',current_date,100::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status","Ref Received By Cash Holder")
 VALUES('HIST72-P','HIST72-BOR','HIST72-C',current_date,10::money,'Single Partial','Processing','ch:dad');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Holder")
 VALUES('HIST72-E',current_date,'Other',5::money,'ch:lisa');
