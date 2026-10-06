-- Disposable V69 upgrade fixture. Existing defaulted legacy repayment is retained.
\ir Test-CashAccountFixtures.sql
SET timezone='Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DR70-OLD-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('DR70-OLD-CAP','DR70-OLD-A',current_date,'Contribution',1000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DR70-OLD-B','Synthetic legacy upgrade');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account","Defaulted") VALUES('DR70-OLD-L','DR70-OLD-B',current_date-3,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES('DR70-OLD-C','DR70-OLD-L',current_date-2,100::money,10::money,'original');
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid","Created By") VALUES('DR70-OLD-R','DR70-OLD-L','DR70-OLD-C',current_date-1,10::money,2::money,'synthetic');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DR70-OLD-L';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic' WHERE "Row ID"='DR70-OLD-L';
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='DR70-OLD-L';
