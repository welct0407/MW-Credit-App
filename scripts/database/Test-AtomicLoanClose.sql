-- Keep fixture dates consistent with the business date on CI hosts in any zone.
SET TIME ZONE 'Asia/Bangkok';
\ir Test-CorePayment.sql
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.close_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.close_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; RETURN;
  END;
  RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('AC7-B','SYNTHETIC ATOMIC CLOSE'),('AC7-OTHER','SYNTHETIC OTHER');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('AC7-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('AC7-CAPITAL','AC7-PARTNER',current_date,'Contribution',5000::money);
-- Seed with auto false so fixture setup does not create first-day receipts.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
SELECT 'CI-LISA','AC7-'||n,'AC7-B',current_date-5,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,(CASE WHEN n='FRACTION' THEN 0.1 ELSE 10 END)::money
FROM unnest(ARRAY['NONE','OLD','PART','PAID','SAME','FUTURE','ROLLBACK','DUP','STALE','WRONG','FRACTION']) n;
UPDATE "Loans" SET "Loan Date"=current_date WHERE "Row ID"='AC7-SAME';
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('AC7-OLD-C','AC7-OLD',current_date-1,0::money,20::money),
('AC7-PART-C','AC7-PART',current_date,100::money,20::money),
('AC7-PAID-C','AC7-PAID',current_date,0::money,20::money),
('AC7-FUTURE-C','AC7-FUTURE',current_date+2,100::money,20::money),
('AC7-DUP-C1','AC7-DUP',current_date,0::money,20::money),
('AC7-DUP-C2','AC7-DUP',current_date,0::money,20::money);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-PART-FIRST','AC7-B','AC7-PART-C',current_date,50::money,'Single Partial','Processing');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-PAID-FIRST','AC7-B','AC7-PAID-C',current_date,20::money,'Single Full','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'AC7-%';
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['NONE','OLD','PART','PAID','SAME','FUTURE'] LOOP
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-P-'||n,'AC7-B','AC7-'||n,current_date,1::money,'Loan Close','Processing');
END LOOP; END $$;
SELECT pg_temp.close_assert((SELECT bool_and("Status"='Posted') FROM "Payments" WHERE "Row ID" LIKE 'AC7-P-%'),'all close requests posted');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=150 FROM "Payments" WHERE "Row ID"='AC7-P-NONE'),'no existing charge accrual');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=130 FROM "Payments" WHERE "Row ID"='AC7-P-OLD'),'elapsed interest and principal');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=70 FROM "Payments" WHERE "Row ID"='AC7-P-PART'),'partial principal not added twice');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=100 FROM "Payments" WHERE "Row ID"='AC7-P-PAID'),'paid-today interest retained; principal added');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=100 FROM "Payments" WHERE "Row ID"='AC7-P-SAME'),'same-day principal-only closure');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Allocation Method"='First-day Auto' AND "Ref Borrower"='AC7-B'),'no first-day auto receipt from final charge');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=120 FROM "Payments" WHERE "Row ID"='AC7-P-FUTURE'),'future principal already scheduled; no double charge');
SELECT pg_temp.close_assert((SELECT count(*)=1 FROM "Charges" WHERE "Ref Loans"='AC7-FUTURE'),'no unnecessary today charge');
SELECT pg_temp.close_assert((SELECT bool_and("Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='AC7-P-'||substring("Row ID" from 5)) FROM "Loans" WHERE "Row ID" IN ('AC7-NONE','AC7-OLD','AC7-PART','AC7-PAID','AC7-SAME','AC7-FUTURE')),'all requested loans close causally');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Payments" p WHERE p."Row ID" LIKE 'AC7-P-%' AND p."Amount Received"::numeric IS DISTINCT FROM (SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID")),'ledger conservation');
UPDATE "Payments" SET "Status"='Processing',"Amount Received"="Amount Received" WHERE "Row ID"='AC7-P-NONE';
SELECT pg_temp.close_assert((SELECT "Status"='Posted' FROM "Payments" WHERE "Row ID"='AC7-P-NONE'),'stale retry no-op');
SELECT pg_temp.close_reject($q$UPDATE "Payments" SET "Ref Target Loan"='AC7-OLD' WHERE "Row ID"='AC7-P-NONE'$q$,'open auto-enabled');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-DOUBLE','AC7-B','AC7-NONE',current_date,'Loan Close','Processing')$q$,'open auto-enabled');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-WRONG-P','AC7-OTHER','AC7-WRONG',current_date,'Loan Close','Processing')$q$,'must belong');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-DUP-P','AC7-B','AC7-DUP',current_date,'Loan Close','Processing')$q$,'Multiple charges today');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-STALE-P','AC7-B','AC7-STALE',current_date-1,'Loan Close','Processing')$q$,'date is stale');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-FRACTION-P','AC7-B','AC7-FRACTION',current_date,'Loan Close','Processing')$q$,'whole-baht');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-FRACTION'),'fractional failure removes prepared charge');
-- Force an error after the ordinary posting trigger; every financial effect must roll back.
CREATE FUNCTION pg_temp.fail_close_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."Row ID"='AC7-FAIL-P' THEN RAISE EXCEPTION 'Synthetic downstream failure'; END IF; RETURN NULL; END $$;
CREATE TRIGGER zz_test_close_failure AFTER INSERT ON "Payments" FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_close_post();
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-FAIL-P','AC7-B','AC7-ROLLBACK',current_date,'Loan Close','Processing')$q$,'Synthetic downstream failure');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-ROLLBACK') AND NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='AC7-FAIL-P') AND NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Loans"='AC7-ROLLBACK') AND NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='AC7-FAIL-P'),'failure removes charge receipt and ledger');
SELECT pg_temp.close_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='AC7-ROLLBACK'),'failure restores loan state');
-- Owner's simple inverse: retain prepared/augmented charge, reverse receipt/cash.
SAVEPOINT close_delete;
CREATE TEMP TABLE close_charge_before AS SELECT "Row ID","Principal Due","Interest Due","Notes" FROM "Charges" WHERE "Ref Loans"='AC7-PAID';
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='AC7-P-PAID';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.close_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Outstanding Principal"=100 AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='AC7-PAID'),'delete closing receipt reopens');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='AC7-P-PAID'),'close cash removed');
SELECT pg_temp.close_assert(EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='AC7-PAID-FIRST'),'earlier receipt retained');
SELECT pg_temp.close_assert(NOT EXISTS((SELECT "Row ID","Principal Due","Interest Due","Notes" FROM "Charges" WHERE "Ref Loans"='AC7-PAID' EXCEPT TABLE close_charge_before) UNION ALL (TABLE close_charge_before EXCEPT SELECT "Row ID","Principal Due","Interest Due","Notes" FROM "Charges" WHERE "Ref Loans"='AC7-PAID')),'prepared amounts retained for explicit edit');
UPDATE "Charges" SET "Principal Due"=0::money WHERE "Row ID"='AC7-PAID-C';
DELETE FROM "Payments" WHERE "Row ID"='AC7-P-NONE';
DELETE FROM "Charges" WHERE "Ref Loans"='AC7-NONE';
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-NONE'),'unreceived generated final charge separately deletable');
ROLLBACK TO close_delete;
SELECT 'Atomic Loan Close regressions passed' AS result;
ROLLBACK;
