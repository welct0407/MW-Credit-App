-- Disposable upgrade fixture: reproduce an already-existing default whose fully
-- paid charge has no write-off suffix. V68 permits that historical state.
\ir Test-CashAccountFixtures.sql
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DF69-OLD-B','SYNTHETIC LEGACY DEFAULT');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DF69-OLD-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('DF69-OLD-CAP','DF69-OLD-P',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES('DF69-OLD-L','DF69-OLD-B',current_date-3,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('DF69-OLD-PAID','DF69-OLD-L',current_date-2,0::money,10::money),('DF69-OLD-DUE','DF69-OLD-L',current_date-1,100::money,10::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES('DF69-OLD-R','DF69-OLD-L','DF69-OLD-PAID',current_date-2,0::money,10::money);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DF69-OLD-L';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic' WHERE "Row ID"='DF69-OLD-L';
UPDATE "Charges" SET "Notes"=NULL WHERE "Row ID"='DF69-OLD-PAID';
