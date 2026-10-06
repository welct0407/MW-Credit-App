\ir Test-ChargeGeneration.sql
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; RETURN;
  END;
  RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
SET LOCAL TIME ZONE 'Asia/Bangkok';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DF10-B','SYNTHETIC DEFAULT');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DF10-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('DF10-CAPITAL','DF10-PARTNER',current_date,'Contribution',5000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
SELECT 'CI-LISA','DF10-'||n,'DF10-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money FROM generate_series(1,5) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
('DF10-unpaid','DF10-1',current_date-3,20::money,10::money,'Preserve note'),
('DF10-partial','DF10-1',current_date-2,50::money,20::money,NULL),
('DF10-paidtoday','DF10-2',current_date,0::money,10::money,NULL),
('DF10-a-good','DF10-3',current_date-2,10::money,5::money,'Rollback this write-off'),
('DF10-bad','DF10-3',current_date-1,(-1)::money,10::money,NULL);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','DF10-pay','DF10-B','DF10-partial',30::money,current_date,'Single Partial','Processing');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','DF10-paytoday','DF10-B','DF10-paidtoday',10::money,current_date,'Single Full','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'DF10-%' AND "Row ID"<>'DF10-5';
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date-1,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-1'$q$,'confirmation date');
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-1';
SELECT pg_temp.assert((SELECT "Default Loss Amount"::numeric=90 AND "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='DF10-1'),'default records remaining principal loss without receipt reference');
SELECT pg_temp.assert((SELECT count(*)=3 FROM "Charges" WHERE "Ref Loans"='DF10-1'),'unpaid and partial charge keys preserved plus one loss charge');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=0 AND "Interest Due"::numeric=0 AND "Notes" LIKE 'Preserve note%' AND "Notes" LIKE '%original_principal%' FROM "Charges" WHERE "Row ID"='DF10-unpaid'),'unpaid charge written off with audit');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=10 AND "Interest Due"::numeric=20 FROM "Charges" WHERE "Row ID"='DF10-partial'),'partial paid components preserved');
SELECT pg_temp.assert((SELECT sum("Principal Paid"::numeric)=100 AND sum("Principal Paid"::numeric+"Interest Paid"::numeric)=30 FROM "Repayments" WHERE "Ref Loans"='DF10-1'),'principal extinguished and actual cash unchanged');
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-1';
SELECT pg_temp.assert((SELECT count(*)=1 FROM "Repayments" WHERE "Ref Loans"='DF10-1' AND "Row ID" LIKE 'df10:%'),'duplicate command no-op');
-- V69 protects the original write-off evidence as well as generated loss rows.
SELECT pg_temp.reject($q$DELETE FROM "Charges" WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Principal Due"=1::money WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Interest Due"=1::money WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Notes"='erase evidence' WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Charge Date"=current_date WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Ref Loans"='DF10-5' WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Ref Loans"='DF10-1' WHERE "Row ID"='DF10-a-good'$q$,'Undo Default');
SELECT set_config('business_crud.default','DF10-1',true);
SELECT pg_temp.reject($q$DELETE FROM "Charges" WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Notes"='forged context' WHERE "Row ID"='DF10-unpaid'$q$,'Undo Default');
SELECT set_config('business_crud.default','',true);
UPDATE "Charges" SET "Total Paid"=999,"Amount Remaining"=999 WHERE "Row ID"='DF10-unpaid';
SELECT pg_temp.assert((SELECT "Total Paid"=0 AND "Amount Remaining"=0 FROM "Charges" WHERE "Row ID"='DF10-unpaid'),'derived-only update recomputes authoritative cache');
SELECT pg_temp.reject($q$UPDATE "Repayments" SET "Notes"='change loss' WHERE "Row ID"='df10:6:DF10-1'$q$,'immutable');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Notes"='change loss' WHERE "Row ID"='df10:6:DF10-1'$q$,'immutable');
SELECT pg_temp.reject($q$DELETE FROM "Charges" WHERE "Row ID"='df10:6:DF10-1'$q$,'receipts');
SAVEPOINT default_inverse;
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DF10-1';
SELECT pg_temp.assert((SELECT "Outstanding Principal"=90 AND "Loan Status"='ยังไม่ปิดยอด' AND "Default Loss Amount" IS NULL FROM "Loans" WHERE "Row ID"='DF10-1'),'default undo restores remaining principal');
SELECT pg_temp.assert((SELECT "Principal Due"=20::money AND "Interest Due"=10::money AND "Notes"='Preserve note' FROM "Charges" WHERE "Row ID"='DF10-unpaid'),'default undo restores booked amounts and original note');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Row ID"='df10:6:DF10-1'),'default undo removes only loss posting');
UPDATE "Charges" SET "Notes"='ordinary edit after undo' WHERE "Row ID" IN ('DF10-unpaid','DF10-partial');
DELETE FROM "Charges" WHERE "Row ID"='DF10-unpaid';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Row ID"='DF10-unpaid'),'ordinary unpaid charge delete after undo');
ROLLBACK TO default_inverse;
SELECT pg_temp.reject($q$DELETE FROM "Repayments" WHERE "Ref Loans"='DF10-1' AND "Row ID" LIKE 'df10:%'$q$,'immutable');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-2'$q$,'paid charge today');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-3'$q$,'reconciliation');
SELECT pg_temp.assert((SELECT NOT coalesce("Defaulted",false) AND "Close Date" IS NULL FROM "Loans" WHERE "Row ID"='DF10-3'),'failed default rolls back loan');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=10 AND "Interest Due"::numeric=5 AND "Notes"='Rollback this write-off' FROM "Charges" WHERE "Row ID"='DF10-a-good'),'later invalid charge rolls back earlier write-off');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-5'$q$,'auto-enabled');
UPDATE "Loans" SET "Loan Date"=current_date WHERE "Row ID"='DF10-4';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='DF10-4';
SELECT pg_temp.assert((SELECT "Default Loss Amount"::numeric=100 FROM "Loans" WHERE "Row ID"='DF10-4'),'no prior charge required');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Ref Target Charge"='df10:6:DF10-4'),'same-day loss never produces first-day cash receipt');
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','DF10-after-default','DF10-B','DF10-partial',1::money,current_date,'Single Partial','Processing')$q$,'current eligible balance');
SELECT pg_temp.assert(public.generate_due_charges(current_date,ARRAY['DF10-1','DF10-4'])=0,'defaulted loans never generate new charges');
-- Current defaults protect even fully paid charge evidence. Legacy no-note
-- compatibility is tested by the separate committed V68 -> V69 upgrade fixture.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
 VALUES('CI-LISA','DF10-LEGACY','DF10-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('DF10-LEGACY-PAID','DF10-LEGACY',current_date-4,0::money,10::money),('DF10-LEGACY-DUE','DF10-LEGACY',current_date-3,100::money,10::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid")
 VALUES('DF10-LEGACY-R','DF10-LEGACY','DF10-LEGACY-PAID',current_date-4,0::money,10::money);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DF10-LEGACY';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic' WHERE "Row ID"='DF10-LEGACY';
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Notes"=NULL WHERE "Row ID"='DF10-LEGACY-PAID'$q$,'Undo Default');
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DF10-LEGACY';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert((SELECT "Interest Due"=10::money AND "Notes" IS NULL FROM "Charges" WHERE "Row ID"='DF10-LEGACY-PAID'),'untouched paid charge remains unchanged');
SELECT pg_temp.assert((SELECT "Principal Due"=100::money AND "Interest Due"=10::money FROM "Charges" WHERE "Row ID"='DF10-LEGACY-DUE'),'default restores due charge');
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic' WHERE "Row ID"='DF10-LEGACY';
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DF10-LEGACY';
SELECT pg_temp.assert((SELECT count(*)=1 FROM "Repayments" WHERE "Ref Loans"='DF10-LEGACY'),'repeated default/undo preserves only independent payment');
SELECT 'Atomic Default Loan regressions passed' AS result;
ROLLBACK;
