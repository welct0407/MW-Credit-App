\set ON_ERROR_STOP on
-- R116 V130 pre-fixture, applied at V9 (before V10's df10: postings existed): a loan defaulted in the AppSheet era, closed
-- with "Defaulted" and a "Default Loss Amount" of 500, and its loss pair recorded the AppSheet way under random 22-character
-- Row IDs (charge 500/-500, one zero-cash repayment 500/-500 with no payment), as the two legacy loans in DEV and PROD carry.
-- 70 interest is paid in the same month, the close month two months ago. Synthetic data only; Test-WriteOffLegacyPair.sql
-- runs at the head.
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('WLP-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('WLP-CAPITAL','WLP-A',(date_trunc('month',current_date)-interval '3 months')::date,'Contribution',100000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('WLP-B','SYNTHETIC LEGACY PAIR');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('WLP-LOAN','WLP-B',(date_trunc('month',current_date)-interval '2 months')::date+1,500::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('WLP-INTEREST','WLP-LOAN',(date_trunc('month',current_date)-interval '2 months')::date+5,0::money,70::money),
 ('7wiQ8eBhaXC3beVmECDjQZ','WLP-LOAN',(date_trunc('month',current_date)-interval '2 months')::date+20,500::money,(-500)::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('WLP-PAY','WLP-B','WLP-INTEREST',(date_trunc('month',current_date)-interval '2 months')::date+5,70::money,'Single Full','Processing');
INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By")
 VALUES('knT1lRfUhfa80J7TXgnDhZ',(date_trunc('month',current_date)-interval '2 months')::date+20,500::money,(-500)::money,
  'Loan default - outstanding principal recorded as loss; zero cash','WLP-LOAN','7wiQ8eBhaXC3beVmECDjQZ','synthetic@example.invalid');
UPDATE "Loans" SET "Defaulted"=true,"Default Loss Amount"=500::money,"Loan Status"='ปิดยอดแล้ว',
 "Close Date"=(date_trunc('month',current_date)-interval '2 months')::date+20,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='WLP-LOAN';
SELECT 'Legacy loss pair pre-fixture loaded' AS result;
