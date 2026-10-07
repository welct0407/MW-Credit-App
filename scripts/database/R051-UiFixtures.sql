-- DEV GUI-only synthetic fixture manifest. Runner verifies exact DEV identity,
-- notifications containment and an empty reserved namespace before committing.
-- No borrower contact or referrer: these receipts must not notify real people.
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('SYN-R051-UI-DAD','ch:dad','SYNTHETIC R051 UI Dad','Synthetic'),
 ('SYN-R051-UI-LISA','ch:lisa','SYNTHETIC R051 UI Lisa','Synthetic');
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES
 ('SYN-R051-UI-B','SYNTHETIC R051 CRUD TEST');
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES
 ('SYN-R051-UI-LISA','SYN-R051-UI-L1','SYN-R051-UI-B',current_date-2,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('SYN-R051-UI-LISA','SYN-R051-UI-L2','SYN-R051-UI-B',current_date-2,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('SYN-R051-UI-C1','SYN-R051-UI-L1',current_date-1,100::money,10::money),
 ('SYN-R051-UI-C2','SYN-R051-UI-L2',current_date-1,100::money,10::money),
 ('SYN-R051-UI-C0','SYN-R051-UI-L2',current_date-2,0::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account","Notes") VALUES
 ('SYN-R051-UI-P1','SYN-R051-UI-B','Processing',20::money,current_date,'Single Partial','SYN-R051-UI-C1','SYN-R051-UI-DAD','Synthetic UI correction/delete test');
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account","Notes") VALUES
 ('SYN-R051-UI-P2','SYN-R051-UI-B','Processing',5::money,current_date,'Lump Sum',NULL,'SYN-R051-UI-DAD','Synthetic whole-interest move test');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Notes") VALUES
 ('SYN-R051-UI-E',current_date,'Other',1::money,'SYN-R051-UI-LISA','ch:lisa','Synthetic UI expense edit/delete');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Notes") VALUES
 ('SYN-R051-UI-H',current_date,'Cash Handover',1,'ch:dad','ch:lisa','SYN-R051-UI-DAD','SYN-R051-UI-LISA','Synthetic UI movement edit/delete');
SET CONSTRAINTS ALL IMMEDIATE;
