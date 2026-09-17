\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
CREATE FUNCTION pg_temp.cash_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R005 test failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.cash_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
SELECT pg_temp.cash_assert((SELECT count(*)=3 FROM "Cash Holders"),'three holders');
SELECT pg_temp.cash_assert((SELECT count(*)=0 FROM "Cash Ledger"),'no historical backfill');
SELECT pg_temp.cash_assert((SELECT bool_and("Ref Received By Cash Holder" IS NULL) FROM "Payments"),'old receivers NULL');
SELECT pg_temp.cash_assert((SELECT bool_and("Ref Paid By Cash Holder" IS NULL) FROM "Business Expenses"),'old payers including automatic rebate NULL');
UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:lisa' WHERE "Row ID"='R005-OLD-P';
UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"='ch:tommy' WHERE "Row ID"='R005-OLD-E';
UPDATE "Loans" SET "Principal Amount"="Principal Amount" WHERE "Row ID"='R005-OLD-L';
UPDATE "Settlements" SET "Transfer Date"=current_date-1 WHERE "Row ID"='R005-OLD-S';
SELECT pg_temp.cash_assert((SELECT count(*)=0 FROM "Cash Ledger"),'old corrections do not fabricate history');
UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='R005-PENDING-S';
SELECT pg_temp.cash_assert((SELECT "Amount"=100 AND "Ref From Cash Holder"='ch:lisa' AND "Ref To Cash Holder" IS NULL FROM "Cash Ledger" WHERE "Ref Settlement"='R005-PENDING-S'),'old pending completes after cutover');

-- Backdated new loan and posted receipt still qualify; closure produces Lisa rebate.
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('R005-NEW-L','R005-BOR',current_date-10,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R005-NEW-C','R005-NEW-L',current_date,10000::money,6600::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('R005-NEW-P','R005-BOR','R005-NEW-C',current_date,16600::money,'Single Full','Processing');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.cash_assert((SELECT "Ref To Cash Holder"='ch:dad' AND "Amount"=16600 FROM "Cash Ledger" WHERE "Ref Payment"='R005-NEW-P'),'new ordinary payment defaults Dad and posts once');
SELECT pg_temp.cash_assert((SELECT "Amount"=10000 AND "Ref From Cash Holder"='ch:lisa' AND "Movement Date"=current_date-10 FROM "Cash Ledger" WHERE "Ref Loan"='R005-NEW-L'),'new backdated gross loan disbursement');
SELECT pg_temp.cash_assert((SELECT "Amount"=660 AND "Ref From Cash Holder"='ch:lisa' FROM "Cash Ledger" WHERE "Ref Business Expense"='rr1:R005-NEW-L'),'automatic rebate paid Lisa');
CREATE TEMP TABLE receipt_before AS SELECT * FROM "Cash Ledger" WHERE "Ref Payment"='R005-NEW-P';
CREATE TEMP TABLE repayments_before AS SELECT * FROM "Repayments" WHERE "Ref Payment"='R005-NEW-P';
CREATE TEMP TABLE allocations_before AS SELECT * FROM "Payment Allocations" WHERE "Ref Payment"='R005-NEW-P';
UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:lisa' WHERE "Row ID"='R005-NEW-P';
SELECT pg_temp.cash_assert((SELECT count(*)=1 AND bool_and(l."Row ID"=b."Row ID" AND l."Created At"=b."Created At" AND l."Ref To Cash Holder"='ch:lisa') FROM "Cash Ledger" l JOIN receipt_before b ON l."Ref Payment"=b."Ref Payment"),'receiver correction updates same identity');
SELECT pg_temp.cash_assert(NOT EXISTS((SELECT * FROM "Repayments" WHERE "Ref Payment"='R005-NEW-P' EXCEPT TABLE repayments_before) UNION ALL (TABLE repayments_before EXCEPT SELECT * FROM "Repayments" WHERE "Ref Payment"='R005-NEW-P')),'receiver correction preserves repayments exactly');
SELECT pg_temp.cash_assert(NOT EXISTS((SELECT * FROM "Payment Allocations" WHERE "Ref Payment"='R005-NEW-P' EXCEPT TABLE allocations_before) UNION ALL (TABLE allocations_before EXCEPT SELECT * FROM "Payment Allocations" WHERE "Ref Payment"='R005-NEW-P')),'receiver correction preserves allocations exactly');
UPDATE "Payments" SET "Status"='Processing' WHERE "Row ID"='R005-NEW-P';
SELECT pg_temp.cash_assert((SELECT count(*)=1 FROM "Cash Ledger" WHERE "Ref Payment"='R005-NEW-P'),'receipt retry no duplicate');

INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Transfer Fee","Created By")
 VALUES('R005-DAY','R005-BOR',current_date,current_date+9,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',true,30::money,5::money,'synthetic@example.invalid');
SELECT pg_temp.cash_assert((SELECT "Ref Received By Cash Holder"='ch:lisa' AND "Status"='Posted' FROM "Payments" WHERE "Row ID"='fd6:fd6:R005-DAY'),'automatic first-day receiver fixed Lisa');
SELECT pg_temp.cash_assert((SELECT sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount" ELSE -"Amount" END)=-965 FROM "Cash Ledger" WHERE "Ref Loan"='R005-DAY' OR "Ref Payment"='fd6:fd6:R005-DAY'),'first-day net cash 1000 less 35 equals 965 outflow');
SELECT pg_temp.cash_reject($q$UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:dad' WHERE "Row ID"='fd6:fd6:R005-DAY'$q$,'fixed to Lisa');
SELECT public.create_first_day_charge('R005-DAY');
SELECT public.first_day_receipt('fd6:R005-DAY');
SELECT pg_temp.cash_assert((SELECT count(*)=2 FROM "Cash Ledger" WHERE "Ref Loan"='R005-DAY' OR "Ref Payment"='fd6:fd6:R005-DAY'),'first-day retry has one disbursement and one receipt');
SELECT pg_temp.cash_reject($q$INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Daily Payment Amount") VALUES('R005-BAD-L','R005-BOR',current_date,current_date,100::money,'ยังไม่ปิดยอด','ผ่อนชำระรายวัน',true,50::money)$q$,'Invalid first-day interest');
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Loan"='R005-BAD-L' OR "Ref Payment"='fd6:fd6:R005-BAD-L'),'invalid first-day rolls back both cash movements');

SELECT pg_temp.cash_reject($q$INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount") VALUES('R005-NO-PAYER',current_date,'Other',100::money)$q$,'explicit cash payer');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Holder")
 SELECT 'R005-E-'||n,current_date,'Other',100::money,'ch:'||n FROM unnest(ARRAY['dad','lisa','tommy']) n;
SELECT pg_temp.cash_assert((SELECT count(*)=3 AND sum("Amount")=300 FROM "Cash Ledger" WHERE "Ref Business Expense" LIKE 'R005-E-%'),'three payers generate outflows');
SELECT pg_temp.cash_assert((SELECT bool_and("Partner A Expense"::numeric=60 AND "Partner B Expense"::numeric=40) FROM "Business Expenses" WHERE "Row ID" LIKE 'R005-E-%'),'custody does not change expense allocations');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Notes") VALUES('R005-NEG',current_date-20,'Other',(-20)::money,'Synthetic accounting-only correction');
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Business Expense"='R005-NEG'),'negative without payer has no cash');
UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"='ch:tommy' WHERE "Row ID"='R005-NEG';
SELECT pg_temp.cash_assert((SELECT "Amount"=20 AND "Ref To Cash Holder"='ch:tommy' AND "Ref From Cash Holder" IS NULL FROM "Cash Ledger" WHERE "Ref Business Expense"='R005-NEG'),'negative refund inflow');
UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"=NULL WHERE "Row ID"='R005-NEG';
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Business Expense"='R005-NEG'),'accounting-only correction removes derived movement');
UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"='ch:lisa' WHERE "Row ID"='R005-E-dad';
SELECT pg_temp.cash_assert((SELECT "Ref From Cash Holder"='ch:lisa' FROM "Cash Ledger" WHERE "Ref Business Expense"='R005-E-dad'),'expense payer correction');

INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref Business Expense","Notes") VALUES
 ('R005-H',current_date,'Cash Handover',50,'ch:dad','ch:lisa',NULL,'Synthetic handover'),
 ('R005-R',current_date,'Expense Reimbursement',100,'ch:lisa','ch:tommy','R005-E-tommy','Synthetic reimbursement');
SELECT pg_temp.cash_reject($q$INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder") VALUES('R005-BAD',current_date,'Expense Reimbursement',10,'ch:dad','ch:tommy')$q$,'Lisa to Tommy');
SELECT pg_temp.cash_reject($q$UPDATE "Cash Ledger" SET "Amount"=1 WHERE "Ref Payment"='R005-NEW-P'$q$,'through their source');
SELECT pg_temp.cash_reject($q$DELETE FROM "Cash Ledger" WHERE "Ref Payment"='R005-NEW-P'$q$,'retained');
SELECT pg_temp.cash_reject($q$UPDATE "Cash Ledger" SET "Amount"=-1 WHERE "Row ID"='R005-H'$q$,'check constraint');
SELECT pg_temp.cash_reject($q$UPDATE "Cash Ledger" SET "Amount"=1.5 WHERE "Row ID"='R005-H'$q$,'check constraint');
SELECT pg_temp.cash_reject($q$UPDATE "Cash Ledger" SET "Amount"='NaN'::numeric WHERE "Row ID"='R005-H'$q$,'check constraint');
SELECT pg_temp.cash_reject($q$INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder") VALUES('R005-OPEN',current_date,'Opening Balance',100,'ch:dad')$q$,'controlled SQL');
SELECT pg_temp.cash_reject($q$DELETE FROM r005_cash_cutover_sources$q$,'immutable');
SELECT pg_temp.cash_reject($q$UPDATE "Loans" SET "Row ID"='R005-RENAMED' WHERE "Row ID"='R005-OLD-L'$q$,'immutable');
SELECT pg_temp.cash_reject($q$UPDATE "Cash Holders" SET "Row ID"='ch:renamed' WHERE "Row ID"='ch:dad'$q$,'immutable');
SELECT pg_temp.cash_reject($q$UPDATE "Payments" SET "Ref Received By Cash Holder"='ch:tommy' WHERE "Row ID"='R005-NEW-P'$q$,'Dad or Lisa');
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" l JOIN "Payments" p ON p."Row ID"=l."Ref Payment" WHERE p."Status" IS DISTINCT FROM 'Posted'),'no Processing or Error cash receipts');

INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date") VALUES('R005-SB','R005-B',50::money,'Pending',current_date);
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Settlement"='R005-SB'),'pending has no movement');
SELECT pg_temp.cash_reject($q$UPDATE "Settlements" SET "Status"='Completed' WHERE "Row ID"='R005-SB'$q$,'effective movement date');
UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='R005-SB';
UPDATE "Settlements" SET "Amount"=60::money,"Transfer Date"=current_date-1 WHERE "Row ID"='R005-SB';
SELECT pg_temp.cash_assert((SELECT "Amount"=60 AND "Ref From Cash Holder"='ch:lisa' AND "Ref To Cash Holder" IS NULL AND "Movement Date"=current_date-1 FROM "Cash Ledger" WHERE "Ref Settlement"='R005-SB'),'partner B completion and correction remain Lisa outflow');
SELECT pg_temp.cash_assert((SELECT count(*)=2 AND bool_and("Ref To Cash Holder" IS NULL) FROM "Cash Ledger" WHERE "Source Type"='Settlement'),'neither partner settlement inflows to Tommy');

SAVEPOINT atomic_cash;
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Holder") VALUES('R005-ROLLBACK',current_date,'Other',1::money,'ch:lisa');
ROLLBACK TO atomic_cash;
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Business Expense"='R005-ROLLBACK'),'source and cash roll back together');
SELECT pg_temp.cash_assert(NOT EXISTS(SELECT 1 FROM "Cash Holder Balances" b WHERE b."Current Balance" IS DISTINCT FROM
 coalesce((SELECT sum("Amount") FROM "Cash Ledger" WHERE "Ref To Cash Holder"=b."Ref Cash Holder"),0)-coalesce((SELECT sum("Amount") FROM "Cash Ledger" WHERE "Ref From Cash Holder"=b."Ref Cash Holder"),0)
 OR b."Business Cash Held"<>greatest(b."Current Balance",0) OR b."Reimbursement / Advance Due"<>greatest(-b."Current Balance",0)),'independent holder reconciliation');
SELECT pg_temp.cash_assert((SELECT "Current Balance"=0 FROM "Cash Holder Balances" WHERE "Ref Cash Holder"='ch:tommy'),'Tommy expense reimbursed to zero');
SELECT 'R005 custody regression passed' AS result;
ROLLBACK;
