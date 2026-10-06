\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.reject(sql text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean:=false;
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
  IF position(expected in SQLERRM)=0 THEN RAISE; END IF; failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Expected rejection: %',expected; END IF;
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('SC-B','SYNTHETIC SELECTED'),('SC-X','SYNTHETIC OTHER');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('SC-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES ('SC-CAPITAL','SC-PARTNER',current_date,'Contribution',10000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES
('CI-LISA','SC-L1','SC-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
('CI-LISA','SC-L2','SC-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
('CI-LISA','SC-LX','SC-X',current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('SC-A','SC-L1',current_date-4,300::money,100::money),
('SC-B','SC-L1',current_date-3,100::money,100::money),
('SC-C','SC-L1',current_date-2,100::money,100::money),
('SC-D','SC-L2',current_date-1,200::money,100::money),
('SC-E','SC-L2',current_date,150::money,100::money),
('SC-F','SC-L2',current_date+1,0::money,30::money),
('SC-X','SC-LX',current_date,0::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge")
VALUES('SC-PART','SC-B','CI-DAD','Processing',50::money,current_date,'Single Partial','SC-C');
CREATE FUNCTION pg_temp.receive(id text, ids text, amount numeric) RETURNS void LANGUAGE sql AS $$
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Selected Charge IDs")
 VALUES(id,'SC-B','CI-DAD','Processing',amount::money,current_date,'Selected Charges',ids);
$$;
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD',NULL,1)$q$,'Select at least');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,SC-B',200)$q$,'must be unique');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,,SC-C',350)$q$,'key encoding');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC- B',200)$q$,'key encoding');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,missing',200)$q$,'not eligible');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,SC-X',210)$q$,'not eligible');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,SC-F',230)$q$,'not eligible');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,SC-C,SC-D',649)$q$,'current eligible balance');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B,SC-C,SC-D',651)$q$,'current eligible balance');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B',0)$q$,'positive whole-baht');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-BAD','SC-B',1.5)$q$,'positive whole-baht');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Selected Charge IDs") VALUES('SC-BAD','SC-B','CI-DAD','Processing',200::money,current_date,'Lump Sum','SC-B')$q$,'require the Selected Charges');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Selected Charge IDs","Ref Target Charge") VALUES('SC-BAD','SC-B','CI-DAD','Processing',200::money,current_date,'Selected Charges','SC-B','SC-B')$q$,'cannot also target');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Selected Charge IDs") VALUES('SC-BAD','SC-B','CI-DAD','Processing',200::money,current_date-4,'Selected Charges','SC-B')$q$,'not eligible');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='SC-BAD'),'failed inserts leave no receipt');
-- A late failure after the plan has been inserted must unwind every child effect.
CREATE FUNCTION pg_temp.fail_selected_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."Ref Payment"='SC-FAIL' THEN RAISE EXCEPTION 'Injected selected posting failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER sc_failure BEFORE INSERT ON "Repayments" FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_selected_repayment();
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-FAIL','SC-B,SC-C,SC-D',650)$q$,'Injected selected posting failure');
DROP TRIGGER sc_failure ON "Repayments";
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='SC-FAIL') AND NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='SC-FAIL'),'late failure rollback');
SELECT pg_temp.receive('SC-P1','SC-D , SC-C , SC-B',650);
SELECT pg_temp.assert((SELECT "Status"='Posted' AND "Selected Charge IDs"='SC-B , SC-C , SC-D' AND "Posted Amount"=650 FROM "Payments" WHERE "Row ID"='SC-P1'),'one posted canonical receipt');
SELECT pg_temp.assert((SELECT array_agg("Ref Charge" ORDER BY "Ref Charge")=ARRAY['SC-B','SC-C','SC-D'] FROM "Payment Allocations" WHERE "Ref Payment"='SC-P1'),'exact set no spillover');
SELECT pg_temp.assert((SELECT count(*)=3 AND sum("Principal Paid"::numeric)=400 AND sum("Interest Paid"::numeric)=250 FROM "Repayments" WHERE "Ref Payment"='SC-P1'),'component conservation');
SELECT pg_temp.assert((SELECT "Amount Remaining"=400 FROM "Charges" WHERE "Row ID"='SC-A'),'unselected older charge untouched');
SELECT pg_temp.assert((SELECT count(*)=1 AND sum("Amount"::numeric)=650 FROM "Cash Ledger" WHERE "Ref Payment"='SC-P1'),'one receipt cash effect');
SELECT pg_temp.assert((SELECT count(*)=2 FROM "Loans" WHERE "Row ID" IN ('SC-L1','SC-L2') AND "Loan Status"='ยังไม่ปิดยอด'),'subset payment does not close outstanding loans');
SELECT public.post_payment('SC-P1');
UPDATE "Payments" SET "Status"='Processing',"Notes"='Synthetic retry metadata' WHERE "Row ID"='SC-P1';
SELECT pg_temp.assert((SELECT count(*)=3 FROM "Repayments" WHERE "Ref Payment"='SC-P1'),'retry no duplicate');
-- V59 posted selection replacement is supported when the new scope has the
-- exact receipt capacity. Teardown must release only this receipt's children.
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE sc_other_receipt AS SELECT to_jsonb(t) r FROM "Payments" t WHERE "Row ID"='SC-PART';
CREATE TEMP TABLE sc_other_children AS SELECT to_jsonb(t) r FROM "Repayments" t WHERE "Ref Payment"='SC-PART';
CREATE TEMP TABLE sc_receipt_cash AS SELECT "Row ID" FROM "Cash Ledger" WHERE "Ref Payment"='SC-P1';
UPDATE "Payments" SET "Selected Charge IDs"='SC-E , SC-A' WHERE "Row ID"='SC-P1';
SELECT pg_temp.assert((SELECT "Status"='Posted' AND "Selected Charge IDs"='SC-A , SC-E' AND "Amount Received"=650::money AND "Posted Amount"=650 FROM "Payments" WHERE "Row ID"='SC-P1'),'compatible posted selection replacement');
SELECT pg_temp.assert((SELECT array_agg("Ref Charge" ORDER BY "Ref Charge")=ARRAY['SC-A','SC-E'] AND sum("Allocated Principal"::numeric+"Allocated Interest"::numeric)=650 FROM "Payment Allocations" WHERE "Ref Payment"='SC-P1'),'new selection exact children');
SELECT pg_temp.assert((SELECT count(*)=2 AND sum("Principal Paid"::numeric)=450 AND sum("Interest Paid"::numeric)=200 FROM "Repayments" WHERE "Ref Payment"='SC-P1'),'replacement component conservation');
SELECT pg_temp.assert((SELECT array_agg("Amount Remaining" ORDER BY "Row ID")=ARRAY[200,150,300]::numeric[] FROM "Charges" WHERE "Row ID" IN ('SC-B','SC-C','SC-D')),'old selection released except other receipt');
SELECT pg_temp.assert((SELECT count(*)=1 AND min("Row ID")=(SELECT "Row ID" FROM sc_receipt_cash) AND sum("Amount"::numeric)=650 FROM "Cash Ledger" WHERE "Ref Payment"='SC-P1'),'same unique cash key/value');
SELECT pg_temp.assert((SELECT to_jsonb(t) FROM "Payments" t WHERE "Row ID"='SC-PART')=(SELECT r FROM sc_other_receipt) AND NOT EXISTS((SELECT r FROM sc_other_children EXCEPT SELECT to_jsonb(t) FROM "Repayments" t WHERE "Ref Payment"='SC-PART') UNION ALL (SELECT to_jsonb(t) FROM "Repayments" t WHERE "Ref Payment"='SC-PART' EXCEPT SELECT r FROM sc_other_children)),'unrelated partial source/repayment unchanged');
UPDATE "Payments" SET "Selected Charge IDs"='SC-B , SC-C , SC-D' WHERE "Row ID"='SC-P1';
SELECT pg_temp.assert((SELECT count(*)=3 AND sum("Principal Paid"::numeric)=400 AND sum("Interest Paid"::numeric)=250 FROM "Repayments" WHERE "Ref Payment"='SC-P1'),'reverse compatible selection restores components');
SELECT pg_temp.assert((SELECT array_agg("Amount Remaining" ORDER BY "Row ID")=ARRAY[400,250]::numeric[] FROM "Charges" WHERE "Row ID" IN ('SC-A','SC-E')),'replacement target balances restored');
CREATE TEMP TABLE sc_before_rejected_replacement AS
SELECT 'source' kind,to_jsonb(t) r FROM "Payments" t WHERE "Row ID"='SC-P1'
UNION ALL SELECT 'allocation',to_jsonb(t) FROM "Payment Allocations" t WHERE "Ref Payment"='SC-P1'
UNION ALL SELECT 'repayment',to_jsonb(t) FROM "Repayments" t WHERE "Ref Payment"='SC-P1'
UNION ALL SELECT 'cash',to_jsonb(t) FROM "Cash Ledger" t WHERE "Ref Payment"='SC-P1';
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Selected Charge IDs"='SC-A' WHERE "Row ID"='SC-P1'$q$,'Payment does not match');
CREATE TEMP TABLE sc_after_rejected_replacement AS
SELECT 'source' kind,to_jsonb(t) r FROM "Payments" t WHERE "Row ID"='SC-P1'
UNION ALL SELECT 'allocation',to_jsonb(t) FROM "Payment Allocations" t WHERE "Ref Payment"='SC-P1'
UNION ALL SELECT 'repayment',to_jsonb(t) FROM "Repayments" t WHERE "Ref Payment"='SC-P1'
UNION ALL SELECT 'cash',to_jsonb(t) FROM "Cash Ledger" t WHERE "Ref Payment"='SC-P1';
SELECT pg_temp.assert(NOT EXISTS((SELECT * FROM sc_before_rejected_replacement EXCEPT SELECT * FROM sc_after_rejected_replacement) UNION ALL (SELECT * FROM sc_after_rejected_replacement EXCEPT SELECT * FROM sc_before_rejected_replacement)),'incompatible replacement preserves exact source/children/cash');

SELECT pg_temp.reject($q$UPDATE "Payments" SET "Amount Received"=651::money WHERE "Row ID"='SC-P1'$q$,'Payment does not match');
SELECT pg_temp.reject($q$SELECT pg_temp.receive('SC-STALE','SC-B,SC-C,SC-D',650)$q$,'not eligible');
SELECT pg_temp.receive('SC-SINGLE','SC-A',400);
SELECT pg_temp.assert((SELECT count(*)=1 FROM "Payment Allocations" WHERE "Ref Payment"='SC-SINGLE'),'single selection supported');
SELECT 'Selected Charges regressions passed' AS result;
ROLLBACK;
