\ir Test-AtomicLoanClose.sql
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
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('CG8-B','SYNTHETIC GENERATION');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('CG8-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('CG8-CAPITAL','CG8-PARTNER',current_date,'Contribution',5000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Interest Schedule Anchor Date") VALUES ('CI-LISA','CG8-D','CG8-B',current_date-6,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,0::money,0::money,3,NULL,current_date-3),
('CI-LISA','CG8-OffDay','CG8-B',current_date-6,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,0::money,0::money,3,NULL,current_date-2),
('CI-LISA','CG8-Future','CG8-B',current_date-4,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,0::money,0::money,2,NULL,NULL),
('CI-LISA','CG8-Fixed','CG8-B',current_date-4,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,0::money,30::money,0::money,1,current_date,NULL),
('CI-LISA','CG8-I','CG8-B',current_date-2,103::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,0::money,0::money,15::money,2,current_date+7,NULL),
('CI-LISA','CG8-Due','CG8-B',current_date-5,103::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,0::money,0::money,20::money,4,current_date,NULL),
('CI-LISA','CG8-NoPrior','CG8-B',current_date-2,103::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,0::money,0::money,15::money,2,current_date+7,NULL),
('CI-LISA','CG8-Manual','CG8-B',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,0::money,0::money,1,NULL,NULL),
('CI-LISA','CG8-Disabled','CG8-B',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,0::money,0::money,1,NULL,NULL),
('CI-LISA','CG8-Closed','CG8-B',current_date-2,100::money,'ดอกเบี้ยรายวัน','ปิดยอดแล้ว',false,10::money,0::money,0::money,1,NULL,NULL),
('CI-LISA','CG8-ZBad','CG8-B',current_date-2,103::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,0::money,0::money,1::money,2,current_date+7,NULL);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('CG8-D-old','CG8-D',current_date-5,0::money,10::money),
('CG8-Future-old','CG8-Future',current_date-2,0::money,20::money),
('CG8-Future-new','CG8-Future',current_date+4,0::money,40::money),
('CG8-Fixed-old','CG8-Fixed',current_date-1,20::money,0::money),
('CG8-I-old','CG8-I',current_date-2,11::money,4::money),
('CG8-Due-old','CG8-Due',current_date-2,69::money,11::money),
('CG8-ZBad-old','CG8-ZBad',current_date-2,11::money,0::money);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','CG8-P','CG8-B','CG8-Fixed-old',20::money,current_date,'Single Full','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'CG8-%' AND "Row ID"<>'CG8-Disabled';
SELECT pg_temp.assert(public.generate_due_charges(current_date,ARRAY['CG8-D','CG8-OffDay','CG8-Future','CG8-Fixed','CG8-I','CG8-Due','CG8-NoPrior','CG8-Disabled','CG8-Closed'])=5,'five due charges');
SELECT pg_temp.assert((SELECT "Interest Due"::numeric=50 FROM "Charges" WHERE "Ref Loans"='CG8-D' AND "Charge Date"=current_date),'anchor changes schedule, not accrual');
SELECT pg_temp.assert((SELECT "Interest Due"::numeric=20 FROM "Charges" WHERE "Ref Loans"='CG8-Future' AND "Charge Date"=current_date),'daily accrual ignores future charges');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=80 AND "Interest Due"::numeric=30 FROM "Charges" WHERE "Ref Loans"='CG8-Fixed' AND "Charge Date"=current_date),'fixed due date uses outstanding principal');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=22 AND "Interest Due"::numeric=8 FROM "Charges" WHERE "Ref Loans"='CG8-I' AND "Charge Date"=current_date),'installment remainder distribution');
SELECT pg_temp.assert((SELECT "Principal Due"::numeric=34 AND "Interest Due"::numeric=6 FROM "Charges" WHERE "Ref Loans"='CG8-Due' AND "Charge Date"=current_date),'last due date overrides interval boundary');
SELECT pg_temp.assert(public.generate_due_charges(current_date,ARRAY['CG8-D','CG8-OffDay','CG8-Future','CG8-Fixed','CG8-I','CG8-Due','CG8-NoPrior','CG8-Disabled','CG8-Closed'])=0,'batch retry no-op');
UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|test1' WHERE "Row ID"='CG8-Manual';
UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|test1' WHERE "Row ID"='CG8-Manual';
UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|test2' WHERE "Row ID"='CG8-Manual';
SELECT pg_temp.assert((SELECT count(*)=1 AND sum("Interest Due"::numeric)=20 FROM "Charges" WHERE "Ref Loans"='CG8-Manual'),'manual commands share generator and are idempotent');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Charge Generation Request"=(current_date-1)::text||'|stale' WHERE "Row ID"='CG8-Manual'$q$,'stale');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Charge Generation Request"='bad' WHERE "Row ID"='CG8-Manual'$q$,'Invalid charge generation request');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Charge Generation Request"=current_date::text||'|bad' WHERE "Row ID"='CG8-ZBad'$q$,'nonnegative');
SELECT pg_temp.assert((SELECT "Charge Generation Request" IS NULL FROM "Loans" WHERE "Row ID"='CG8-ZBad'),'failed generation rolls back request');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='CG8-ZBad' AND "Charge Date"=current_date),'failed generation leaves no charge');
-- A later failing row rolls back earlier generated rows in the same batch.
SELECT pg_temp.reject($q$SELECT public.generate_due_charges(current_date+2,ARRAY['CG8-I','CG8-ZBad'])$q$,'nonnegative');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans" IN ('CG8-I','CG8-ZBad') AND "Charge Date"=current_date+2),'batch failure is atomic');
SELECT 'Common charge generation regressions passed' AS result;
ROLLBACK;
