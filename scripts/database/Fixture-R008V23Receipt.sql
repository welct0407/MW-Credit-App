\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
-- Isolated migration runner only; never replay against a live environment.
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('R008-OLD-D','ch:dad','Synthetic legacy Dad','Synthetic'),('R008-OLD-L','ch:lisa','Synthetic legacy Lisa','Synthetic');
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('R008-OLD-B','Synthetic V23 receipt');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('R008-OLD-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ('R008-OLD-CAP','R008-OLD-P',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
VALUES ('R008-OLD-LOAN','R008-OLD-B',current_date,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,'R008-OLD-L');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R008-OLD-C1','R008-OLD-LOAN',current_date,0::money,10::money);
UPDATE "Borrowers" SET "Payment Request Cash Account"='R008-OLD-D',"Payment Request Token"=current_date||'|legacy001' WHERE "Row ID"='R008-OLD-B';
DO $$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='r008:'||md5('Borrowers|10:R008-OLD-B|'||current_date||'|legacy001')), 'V23 fixture must have original hashed identity';
END $$;
