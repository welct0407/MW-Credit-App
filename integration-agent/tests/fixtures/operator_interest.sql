-- Synthetic-only fixture for the isolated two-database integration test.
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('IR57-B','Synthetic reallocation'),('IR57-OTHER','Synthetic unrelated');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('IR57-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES ('IR57-CAPITAL','IR57-PARTNER',current_date,'Contribution',10000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES ('CI-LISA','IR57-L1','IR57-B',current_date-10,2000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','IR57-L2','IR57-B',current_date-10,1500::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','IR57-L3','IR57-B',current_date-10,2500::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','IR57-LX','IR57-OTHER',current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT 'IR57-C'||n||'-'||d,'IR57-L'||n,current_date-5+d,0::money,
  (CASE n WHEN 1 THEN 200 WHEN 2 THEN 150 ELSE 250 END)::money
 FROM generate_series(1,3) n CROSS JOIN generate_series(1,3) d;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES ('IR57-X','IR57-LX',current_date-4,0::money,200::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account")
 VALUES ('IR57-P','IR57-B','Processing',1200::money,current_date-2,'Lump Sum','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE ir57_request AS
 SELECT to_jsonb(p) receipt,(SELECT jsonb_agg(jsonb_build_object('allocation_id',a."Row ID",'target_charge',t."Row ID",
  'expected_allocation',to_jsonb(a),'expected_repayment',to_jsonb(r),'expected_source_charge',to_jsonb(s),
  'expected_target_charge',to_jsonb(t),'expected_loan',to_jsonb(l)) ORDER BY a."Row ID")
 FROM "Payment Allocations" a JOIN "Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
 JOIN "Charges" s ON s."Row ID"=a."Ref Charge" JOIN "Loans" l ON l."Row ID"=s."Ref Loans"
 JOIN "Charges" t ON t."Ref Loans"=s."Ref Loans" AND t."Charge Date"=current_date-4
 WHERE a."Ref Payment"='IR57-P' AND s."Charge Date"=current_date-2) moves FROM "Payments" p WHERE p."Row ID"='IR57-P';
