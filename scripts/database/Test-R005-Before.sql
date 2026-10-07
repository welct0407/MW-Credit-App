\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('R005-A','A'),('R005-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('R005-CA','R005-A',current_date-100,'Contribution',600000::money),('R005-CB','R005-B',current_date-100,'Contribution',400000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('R005-REF','SYNTHETIC REFERRER');
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('R005-BOR','SYNTHETIC R005','R005-REF');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('R005-OLD-L','R005-BOR',current_date-5,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R005-OLD-C','R005-OLD-L',current_date,10000::money,6600::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('R005-OLD-P','R005-BOR','R005-OLD-C',current_date,16600::money,'Single Full','Processing');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Created By")
 VALUES('R005-OLD-E',current_date,'Other',10::money,'synthetic@example.invalid');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Transfer Date") VALUES
 ('R005-OLD-S','R005-A',100::money,'Completed',current_date,current_date),
 ('R005-PENDING-S','R005-A',100::money,'Pending',current_date,NULL);
