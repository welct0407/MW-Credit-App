\ir Test-BorrowerRollups.sql
\ir Test-CashAccountFixtures.sql
BEGIN;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('VC14-FUND','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('VC14-CAP','VC14-FUND',current_date-400,'Contribution',1000000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('VC14-B','SYNTHETIC RECEIPT');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Ref Disbursed From Cash Account","Current Daily Interest")
 VALUES('VC14-L','VC14-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,'CI-LISA',2::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES('VC14-C','VC14-L',current_date-1,100::money,20::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Ref Received By Cash Account")
 VALUES('VC14-P','VC14-B','VC14-C',30::money,current_date,'Single Partial','Processing','CI-LISA');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT (SELECT "Status"='Posted' AND "Planned Allocation Amount"=30 AND "Posted Amount"=30 FROM "Payments" WHERE "Row ID"='VC14-P'),'posted payment caches';
 ASSERT (SELECT "Total Interest Earned"=20 AND "Total Outstanding Principal"=90 FROM "Borrowers" WHERE "Row ID"='VC14-B'),'complete chain';
END $$;
UPDATE "Payments" SET "Posted Amount"=999,"Planned Allocation Amount"=999 WHERE "Row ID"='VC14-P';
DO $$ BEGIN ASSERT (SELECT "Posted Amount"=30 AND "Planned Allocation Amount"=30 FROM "Payments" WHERE "Row ID"='VC14-P'),'forged payment caches ignored'; END $$;
UPDATE "Payments" SET "Status"='Processing' WHERE "Row ID"='VC14-P';
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM "Repayments" WHERE "Ref Payment"='VC14-P'),'retry does not duplicate';
 ASSERT (SELECT "Status"='Posted' AND "Posted Amount"=30 FROM "Payments" WHERE "Row ID"='VC14-P'),'posted retry immutable';
END $$;
SELECT 'Payment rollup regression passed' AS result;
ROLLBACK;
