\set ON_ERROR_STOP on
-- R116 V130 pre-fixture, applied at V9 (before V10's dated default postings existed): a loan defaulted in the AppSheet era,
-- closed with "Defaulted" and a "Default Loss Amount" but no df10: ledger pair, as the two legacy loans in DEV and PROD.
-- It closes two calendar months ago (the 26th, or the month's last day if earlier), after 70 interest paid in that month.
-- Synthetic data only; Test-LegacyWriteoffReconcile.sql runs at the head.
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('LWR-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('LWR-CAPITAL','LWR-A',(date_trunc('month',current_date)-interval '3 months')::date,'Contribution',100000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('LWR-B','SYNTHETIC LEGACY DEFAULT');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('LWR-LEGACY','LWR-B',(date_trunc('month',current_date)-interval '2 months')::date+1,500::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES('LWR-LEGACY-C','LWR-LEGACY',(date_trunc('month',current_date)-interval '2 months')::date+5,0::money,70::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('LWR-LEGACY-P','LWR-B','LWR-LEGACY-C',(date_trunc('month',current_date)-interval '2 months')::date+5,70::money,'Single Full','Processing');
UPDATE "Loans" SET "Defaulted"=true,"Default Loss Amount"=500::money,"Loan Status"='ปิดยอดแล้ว',
 "Close Date"=least((date_trunc('month',current_date)-interval '2 months')::date+25,(date_trunc('month',current_date)-interval '1 month')::date-1),
 "Closed By"='synthetic@example.invalid' WHERE "Row ID"='LWR-LEGACY';
SELECT 'Legacy default pre-fixture loaded' AS result;
