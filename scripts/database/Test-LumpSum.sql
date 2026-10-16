-- Disposable local database only. This supplements, never substitutes for,
-- current AppSheet GUI verification. Everything rolls back.
BEGIN;
\ir Test-CashAccountFixtures.sql
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('LS-FUND','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('LS-CAP','LS-FUND',current_date-400,'Contribution',1000000::money);
INSERT INTO "Borrowers" ("Row ID","Borrower Name") VALUES ('LS-TEST','SYNTHETIC LUMP SUM'),('LS-OTHER','SYNTHETIC OTHER');
INSERT INTO "Loans" ("Row ID","Ref Borrowers","Principal Amount","Loan Status","Ref Disbursed From Cash Account","Loan Date") VALUES
('LS-L1','LS-TEST',100::money,'ยังไม่ปิดยอด','CI-LISA',current_date-30),('LS-L2','LS-TEST',200::money,'ยังไม่ปิดยอด','CI-LISA',current_date-30),('LS-LO','LS-OTHER',100::money,'ยังไม่ปิดยอด','CI-LISA',current_date-30);
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due") VALUES
('LS-A','LS-L1',current_date-2,10::money,100::money),
('LS-B','LS-L2',current_date-1,20::money,100::money),
('LS-C','LS-L2',current_date-1,30::money,100::money),
('LS-F','LS-L2',current_date+1,50::money,0::money),
('LS-O','LS-LO',current_date,100::money,100::money);
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account")
VALUES ('LS-P1','LS-TEST',150::money,current_date,'Processing','Lump Sum','CI-LISA');
DO $$ BEGIN
  ASSERT (SELECT "Status"='Posted' FROM "Payments" WHERE "Row ID"='LS-P1'), 'receipt posted';
  ASSERT (SELECT count(*)=2 FROM "Payment Allocations" WHERE "Ref Payment"='LS-P1'), 'positive allocations only';
  ASSERT (SELECT "Allocated Amount"::numeric=130 AND "Allocated Interest"::numeric=30 AND "Allocated Principal"::numeric=100 AND "Allocation Order"=1 FROM "Payment Allocations" WHERE "Ref Payment"='LS-P1' AND "Ref Charge"='LS-C'), 'newest and stable same-date key';
  ASSERT (SELECT "Allocated Amount"::numeric=20 AND "Allocated Interest"::numeric=20 AND "Allocated Principal"::numeric=0 FROM "Payment Allocations" WHERE "Ref Payment"='LS-P1' AND "Ref Charge"='LS-B'), 'interest first partial';
  ASSERT (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=150 FROM "Repayments" WHERE "Ref Payment"='LS-P1'), 'ledger reconciles';
  ASSERT NOT EXISTS (SELECT 1 FROM "Repayments" WHERE "Ref Charges" IN ('LS-F','LS-O')), 'date and borrower isolation';
END $$;
-- A stale retry is idempotent, metadata does not reallocate.
UPDATE "Payments" SET "Status"='Processing',"Notes"='synthetic metadata edit' WHERE "Row ID"='LS-P1';
DO $$ BEGIN
  ASSERT (SELECT "Status"='Posted' FROM "Payments" WHERE "Row ID"='LS-P1'), 'retry stays Posted';
  ASSERT (SELECT count(*)=2 FROM "Repayments" WHERE "Ref Payment"='LS-P1'), 'retry no duplicate';
END $$;
-- Independent negative cases must fail and leave no partial receipt or ledger.
DO $$ DECLARE a numeric; rejected boolean; BEGIN
  FOREACH a IN ARRAY ARRAY[0,-1,0.5,10000] LOOP
    rejected:=false;
    BEGIN
      INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-BAD','LS-TEST',a::money,current_date,'Processing','Lump Sum','CI-LISA');
    EXCEPTION WHEN raise_exception THEN rejected:=true;
    END;
    ASSERT rejected,'invalid amount rejected';
    ASSERT NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='LS-BAD'),'failed command rolled back';
    ASSERT NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='LS-BAD'),'failed plan rolled back';
  END LOOP;
  -- V59 made posted receipt amounts ordinary-CRUD correctable (Test-PaymentCrud.sql).
  rejected:=false;
  BEGIN UPDATE "Repayments" SET "Principal Paid"=0::money WHERE "Ref Payment"='LS-P1'; EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected,'ledger immutable';
  rejected:=false;
  BEGIN INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-BAD','LS-TEST',1::money,current_date+1,'Processing','Lump Sum','CI-LISA'); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected,'future date rejected';
  rejected:=false;
  BEGIN INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-BAD','LS-TEST',1::money,current_date,'Posted','Lump Sum','CI-LISA'); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected,'caller cannot forge Posted';
  rejected:=false;
  BEGIN INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-BAD','LS-TEST',NULL,current_date,'Processing','Lump Sum','CI-LISA'); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected,'missing amount rejected';
  rejected:=false;
  BEGIN INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-BAD','LS-TEST',1::money,current_date-30,'Processing','Lump Sum','CI-LISA'); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
  ASSERT rejected,'no eligible charge rejected';
END $$;
-- The AppSheet-era manual-Repayment and pending-bot sections were retired with AppSheet (R057);
-- receipts now post synchronously, so those paths are unreachable.
-- Exact remaining amount spans two loans, closes only loan without future dues.
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-P2','LS-TEST',210::money,current_date,'Processing','Lump Sum','CI-LISA');
DO $$ BEGIN
  ASSERT (SELECT "Loan Status"='ปิดยอดแล้ว' FROM "Loans" WHERE "Row ID"='LS-L1'),'fully paid loan closed';
  ASSERT (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM "Loans" WHERE "Row ID"='LS-L2'),'future due prevents closure';
  ASSERT (SELECT sum("Principal Paid"::numeric)=300 FROM "Repayments" WHERE "Ref Payment" IN ('LS-P1','LS-P2')),'principal reconciles';
  ASSERT (SELECT sum("Interest Paid"::numeric)=60 FROM "Repayments" WHERE "Ref Payment" IN ('LS-P1','LS-P2')),'interest reconciles';
END $$;
-- Scale and conservation: 1,000 eligible charges, small receipt funds one only.
INSERT INTO "Borrowers" ("Row ID","Borrower Name") VALUES ('LS-SCALE','SYNTHETIC SCALE');
INSERT INTO "Loans" ("Row ID","Ref Borrowers","Principal Amount","Loan Status","Ref Disbursed From Cash Account","Loan Date") VALUES ('LS-SCALE-L','LS-SCALE',100000::money,'ยังไม่ปิดยอด','CI-LISA',current_date-30);
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'LS-SCALE-'||lpad(n::text,4,'0'),'LS-SCALE-L',current_date-(n%30),100::money,10::money FROM generate_series(1,1000) n;
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Ref Received By Cash Account") VALUES ('LS-SCALE-P','LS-SCALE',7::money,current_date,'Processing','Lump Sum','CI-LISA');
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM "Payment Allocations" WHERE "Ref Payment"='LS-SCALE-P'),'1000 candidates create one funded allocation';
 ASSERT (SELECT sum("Principal Paid"::numeric)=0 AND sum("Interest Paid"::numeric)=7 FROM "Repayments" WHERE "Ref Payment"='LS-SCALE-P'),'scale interest-first conservation';
END $$;
ROLLBACK;
SELECT 'lump-sum supplemental regression passed' AS result;
