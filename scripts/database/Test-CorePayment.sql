\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.reject(sql text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean:=false;
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
    IF position(expected in SQLERRM)=0 THEN RAISE; END IF;
    failed:=true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Expected rejection: %',expected; END IF;
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('CP6-B','Synthetic core payment'),('CP6-OTHER','Synthetic unrelated');
-- The R002 safeguard requires contributed capital before synthetic loans can be
-- created. Keep this fixture inside the surrounding transaction so the test
-- remains isolated and rolls back with the rest of the synthetic data.
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('CP6-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES ('CP6-CAPITAL','CP6-PARTNER',current_date,'Contribution',10000::money);
-- Missing accounts must still fail: fixtures satisfy the guard, never bypass it.
SELECT pg_temp.reject($q$INSERT INTO "Loans"("Row ID","Ref Borrowers","Principal Amount","Auto Charge Enabled") VALUES('CP6-NOACCOUNT','CP6-B',100::money,false)$q$,'A cash account is required');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Allocation Method") VALUES('CP6-NOACCOUNT','CP6-B','Processing',1::money,'Lump Sum')$q$,'A cash account is required');
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA','CP6-L1','CP6-B',current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
('CI-LISA','CP6-L2','CP6-B',current_date-10,200::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
('CI-LISA','CP6-L3','CP6-OTHER',current_date-10,50::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('CP6-A','CP6-L1',current_date-2,100::money,10::money),
('CP6-B','CP6-L2',current_date-1,100::money,20::money),
('CP6-C','CP6-L2',current_date-1,100::money,30::money),
('CP6-F','CP6-L2',current_date+1,0::money,50::money),
('CP6-X','CP6-L3',current_date,50::money,5::money);
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-BAD','Posted','CP6-B',1::money,current_date,'Lump Sum')$q$,'must start in Processing');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-BAD','Processing','CP6-B',0::money,current_date,'Lump Sum')$q$,'positive whole-baht');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-BAD','Processing','CP6-B',1.5::money,current_date,'Lump Sum')$q$,'positive whole-baht');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-BAD','Processing','CP6-B',1::money,current_date+1,'Lump Sum')$q$,'no later than today');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-BAD','Processing','CP6-B',361::money,current_date,'Lump Sum')$q$,'current eligible balance');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-BAD','Processing','CP6-B',359::money,current_date,'Receive All')$q$,'current eligible balance');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge") VALUES ('CI-DAD','CP6-BAD','Processing','CP6-B',55::money,current_date,'Single Full','CP6-X')$q$,'must belong');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='CP6-BAD'),'rejected receipts leave no rows');

INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-P1','Processing','CP6-B',150::money,current_date,'Lump Sum');
SELECT pg_temp.assert((SELECT "Status"='Posted' AND "Processed At" IS NOT NULL FROM "Payments" WHERE "Row ID"='CP6-P1'),'atomic Posted');
SELECT pg_temp.assert((SELECT count(*)=2 FROM "Payment Allocations" WHERE "Ref Payment"='CP6-P1'),'only positive allocations');
SELECT pg_temp.assert((SELECT "Allocated Interest"::numeric=30 AND "Allocated Principal"::numeric=100 AND "Allocation Order"=1 AND "Charge Row Number Snapshot"=-1 FROM "Payment Allocations" WHERE "Ref Payment"='CP6-P1' AND "Ref Charge"='CP6-C'),'newest stable key first');
SELECT pg_temp.assert((SELECT "Allocated Interest"::numeric=20 AND "Allocated Principal"::numeric=0 FROM "Payment Allocations" WHERE "Ref Payment"='CP6-P1' AND "Ref Charge"='CP6-B'),'interest before principal');
UPDATE "Payments" SET "Notes"='Synthetic metadata retry',"Status"='Processing',"Processed At"=NULL WHERE "Row ID"='CP6-P1';
SELECT public.post_payment('CP6-P1');
SELECT pg_temp.assert((SELECT "Status"='Posted' FROM "Payments" WHERE "Row ID"='CP6-P1'),'stale status protected');
SELECT pg_temp.assert((SELECT count(*)=2 FROM "Repayments" WHERE "Ref Payment"='CP6-P1'),'retry no duplicates');
SAVEPOINT receipt_crud_regression;
UPDATE "Payments" SET "Amount Received"=151::money WHERE "Row ID"='CP6-P1';
SELECT pg_temp.assert((SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=151 FROM "Repayments" WHERE "Ref Payment"='CP6-P1'),'source UPDATE reconciles');
ROLLBACK TO receipt_crud_regression;
SAVEPOINT receipt_delete_regression;
DELETE FROM "Payments" WHERE "Row ID"='CP6-P1';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Payment"='CP6-P1'),'source DELETE removes owned children');
ROLLBACK TO receipt_delete_regression;
SELECT pg_temp.reject($q$UPDATE "Repayments" SET "Interest Paid"=1::money WHERE "Ref Payment"='CP6-P1'$q$,'immutable');

INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge") VALUES ('CI-DAD','CP6-P2','Processing','CP6-B',10::money,current_date,'Single Partial','CP6-A');
SELECT pg_temp.assert((SELECT "Interest Paid"::numeric=10 AND "Principal Paid"::numeric=0 FROM "Repayments" WHERE "Ref Payment"='CP6-P2'),'single partial interest');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge") VALUES ('CI-DAD','CP6-P3','Processing','CP6-B',100::money,current_date,'Single Full','CP6-A');
SELECT pg_temp.assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='CP6-P3' FROM "Loans" WHERE "Row ID"='CP6-L1'),'causal closure');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD','CP6-P4','Processing','CP6-B',100::money,current_date,'Receive All');
SELECT pg_temp.assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='CP6-L2'),'future interest prevents closure');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge") VALUES ('CI-DAD','CP6-P5','Processing','CP6-B',50::money,current_date,'Loan Close','CP6-F');
SELECT pg_temp.assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='CP6-P5' FROM "Loans" WHERE "Row ID"='CP6-L2'),'Loan Close includes future charge');
SELECT pg_temp.assert((SELECT sum("Principal Paid"::numeric)=300 AND sum("Interest Paid"::numeric)=110 FROM "Repayments" WHERE "Ref Payment" LIKE 'CP6-P%'),'component conservation');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Repayments" r FULL JOIN "Payment Allocations" a ON a."Row ID"=r."Ref Payment Allocation" WHERE (r."Ref Payment" LIKE 'CP6-%' OR a."Ref Payment" LIKE 'CP6-%') AND (r."Row ID" IS NULL OR a."Row ID" IS NULL OR r."Principal Paid" IS DISTINCT FROM a."Allocated Principal" OR r."Interest Paid" IS DISTINCT FROM a."Allocated Interest" OR r."Ref Charges" IS DISTINCT FROM a."Ref Charge")),'one-to-one ledger');

-- Daily first-day interest + fee; installment inclusive day-one rounding + fee.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Transfer Fee","Daily Payment Amount","Created By") VALUES ('CI-LISA','CP6-DAY','CP6-B',current_date,current_date+9,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',true,30::money,5::money,0::money,'synthetic@example.invalid'),
('CI-LISA','CP6-INST','CP6-B',current_date,current_date+2,100::money,'ยังไม่ปิดยอด','ผ่อนชำระรายวัน',true,0::money,5::money,40::money,'synthetic@example.invalid'),
('CI-LISA','CP6-OFF','CP6-B',current_date,current_date+2,100::money,'ยังไม่ปิดยอด','ผ่อนชำระรายวัน',false,0::money,5::money,40::money,'synthetic@example.invalid'),
('CI-LISA','CP6-FIX','CP6-B',current_date,current_date+2,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',true,0::money,5::money,40::money,'synthetic@example.invalid');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=0 AND "Interest Due"::numeric=35 FROM "Charges" WHERE "Row ID"='fd6:CP6-DAY'),'daily first charge');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=34 AND "Interest Due"::numeric=11 FROM "Charges" WHERE "Row ID"='fd6:CP6-INST'),'installment first charge rounding');
SELECT pg_temp.assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=45 AND "Payment Method"='Net-off at Disbursement' FROM "Payments" WHERE "Row ID"='fd6:fd6:CP6-INST'),'first-day net-off posted');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans" IN ('CP6-OFF','CP6-FIX')),'disabled/fixed no automatic charge');
SELECT public.create_first_day_charge('CP6-INST');
SELECT public.first_day_receipt('fd6:CP6-INST');
SELECT pg_temp.assert((SELECT count(*)=1 FROM "Payments" WHERE "Ref Target Charge"='fd6:CP6-INST'),'first-day idempotency');
SELECT pg_temp.reject($q$INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Daily Payment Amount") VALUES ('CI-LISA','CP6-BADLOAN','CP6-B',current_date,current_date,100::money,'ยังไม่ปิดยอด','ผ่อนชำระรายวัน',true,50::money)$q$,'Invalid first-day interest');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Loans" WHERE "Row ID"='CP6-BADLOAN') AND NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='CP6-BADLOAN'),'loan/charge rollback');

-- A one-day installment closes within the originating loan transaction.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Daily Payment Amount") VALUES ('CI-LISA','CP6-ONEDAY','CP6-B',current_date,current_date,100::money,'ยังไม่ปิดยอด','ผ่อนชำระรายวัน',true,110::money);
SELECT pg_temp.assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='fd6:fd6:CP6-ONEDAY' FROM "Loans" WHERE "Row ID"='CP6-ONEDAY'),'atomic first-day closure');
SELECT 'Core payment regressions passed' AS result;
ROLLBACK;
