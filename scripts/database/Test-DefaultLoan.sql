\ir Test-ChargeGeneration.sql
BEGIN;
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
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
SELECT 'DF10-'||n,'DF10-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money FROM generate_series(1,5) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
('DF10-unpaid','DF10-1',current_date-3,20::money,10::money,'Preserve note'),
('DF10-partial','DF10-1',current_date-2,50::money,20::money,NULL),
('DF10-paidtoday','DF10-2',current_date,0::money,10::money,NULL),
('DF10-a-good','DF10-3',current_date-2,10::money,5::money,'Rollback this write-off'),
('DF10-bad','DF10-3',current_date-1,(-1)::money,10::money,NULL);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES
('DF10-pay','DF10-B','DF10-partial',30::money,current_date,'Single Partial','Processing');
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES
('DF10-paytoday','DF10-B','DF10-paidtoday',10::money,current_date,'Single Full','Processing');
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
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DF10-1'$q$,'immutable');
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
SELECT pg_temp.reject($q$INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES('DF10-after-default','DF10-B','DF10-partial',1::money,current_date,'Single Partial','Processing')$q$,'current eligible balance');
SELECT pg_temp.assert(public.generate_due_charges(current_date,ARRAY['DF10-1','DF10-4'])=0,'defaulted loans never generate new charges');
SELECT 'Atomic Default Loan regressions passed' AS result;
ROLLBACK;
