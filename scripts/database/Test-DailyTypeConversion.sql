\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.type_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Daily conversion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.type_reject(q text,expected text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected conversion rejection: %',expected; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('TYPE-B','Synthetic conversion');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('TYPE-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('TYPE-CAP','TYPE-A',current_date-4,'Contribution',10000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Fixed Interest","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES
 ('TYPE-F','TYPE-B',current_date-2,current_date+3,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,30::money,1,'CI-LISA'),
 ('TYPE-ZERO','TYPE-B',current_date-2,current_date+3,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,1::money,1,'CI-LISA'),
 ('TYPE-MISSING','TYPE-B',current_date-2,NULL,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,30::money,1,'CI-LISA'),
 ('TYPE-VALID','TYPE-B',current_date-2,current_date+3,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,30::money,1,'CI-LISA');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Daily Payment Amount","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES
 ('TYPE-I','TYPE-B',current_date-2,current_date+2,100::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,30::money,1,'CI-LISA');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Ref Disbursed From Cash Account") VALUES
 ('TYPE-ROUND','TYPE-B',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,1,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('TYPE-F-C','TYPE-F',current_date-2,40::money,10::money),('TYPE-ROUND-C','TYPE-ROUND',current_date-2,50::money,0::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('TYPE-F-P','TYPE-B','Processing',30::money,current_date-1,'Single Partial','TYPE-F-C','CI-DAD');
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('TYPE-ROUND-P','TYPE-B','Processing',50::money,current_date-1,'Single Full','TYPE-ROUND-C','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE type_booked AS SELECT to_jsonb(c) row FROM "Charges" c WHERE "Row ID" LIKE 'TYPE-%';
CREATE TEMP TABLE type_receipts AS SELECT to_jsonb(p) row FROM "Payments" p WHERE "Row ID" LIKE 'TYPE-%';
CREATE TEMP TABLE type_cash AS SELECT to_jsonb(c) row FROM "Cash Ledger" c WHERE "Row ID" LIKE '%TYPE-%';
-- Revised fixed terms do not replace the frozen original5%; paid principal20 leaves80.
UPDATE "Loans" SET "Fixed Interest"=60::money WHERE "Row ID"='TYPE-F';
UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Current Daily Interest"=999::money WHERE "Row ID"='TYPE-F';
SELECT pg_temp.type_assert((SELECT "Original Daily Interest Rate"=5 AND "Outstanding Principal"=80 AND "Current Daily Interest"=4::money FROM "Loans" WHERE "Row ID"='TYPE-F'),'fixed to daily uses original5 on remaining80, ignores stale submitted amount');
UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน' WHERE "Row ID"='TYPE-I';
SELECT pg_temp.type_assert((SELECT "Original Daily Interest Rate"=10 AND "Current Daily Interest"=10::money FROM "Loans" WHERE "Row ID"='TYPE-I'),'installment to daily uses original rounded10');
UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Auto Charge Enabled"=true WHERE "Row ID"='TYPE-ZERO';
SELECT pg_temp.type_assert((SELECT "Original Daily Interest Rate"=0 AND "Current Daily Interest"=0::money FROM "Loans" WHERE "Row ID"='TYPE-ZERO'),'zero frozen basis remains valid zero amount');
SELECT pg_temp.type_assert(public.generate_loan_charge('TYPE-ZERO',current_date) IS NULL,'zero rate intentionally produces no interest charge');
UPDATE "Loans" SET "Current Daily Interest"=999::money,"Original Daily Interest Rate"=NULL WHERE "Row ID"='TYPE-F';
SELECT pg_temp.type_assert((SELECT "Original Daily Interest Rate"=5 AND "Current Daily Interest"=4::money FROM "Loans" WHERE "Row ID"='TYPE-F'),'same daily stale/null fields retain authoritative values');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Original Daily Interest Rate"=6 WHERE "Row ID"='TYPE-F'$q$,'read-only');
SELECT pg_temp.type_assert(NOT EXISTS(SELECT row FROM type_booked EXCEPT SELECT to_jsonb(c) FROM "Charges" c),'conversions do not rewrite booked charges');
SELECT pg_temp.type_assert(NOT EXISTS(SELECT row FROM type_receipts EXCEPT SELECT to_jsonb(p) FROM "Payments" p),'conversions do not rewrite receipts');
SELECT pg_temp.type_assert(NOT EXISTS(SELECT row FROM type_cash EXCEPT SELECT to_jsonb(c) FROM "Cash Ledger" c) AND (SELECT count(*) FROM type_cash)=(SELECT count(*) FROM "Cash Ledger" WHERE "Row ID" LIKE '%TYPE-%'),'conversion preserves complete owned cash projections');
-- Daily -> fixed -> daily recomputes current amount after principal changed in other mode.
UPDATE "Loans" SET "Loan Type"='กำหนดวันชำระ',"Fixed Interest"=60::money,"Due Date"=current_date+3 WHERE "Row ID"='TYPE-ROUND';
UPDATE "Loans" SET "Principal Amount"=90::money WHERE "Row ID"='TYPE-ROUND';
SELECT pg_temp.type_assert((SELECT "Outstanding Principal"=40 AND "Current Daily Interest"=5::money FROM "Loans" WHERE "Row ID"='TYPE-ROUND'),'other mode keeps inactive prior current amount');
UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Current Daily Interest"=888::money WHERE "Row ID"='TYPE-ROUND';
SELECT pg_temp.type_assert((SELECT "Original Daily Interest Rate"=10 AND "Current Daily Interest"=4::money FROM "Loans" WHERE "Row ID"='TYPE-ROUND'),'return to daily recomputes on current outstanding');
-- Missing inputs fail without pretending that new terms prove unknown original terms.
CREATE TEMP TABLE type_before_failure AS SELECT "Row ID" id,to_jsonb(l) row FROM "Loans" l WHERE "Row ID" IN ('TYPE-VALID','TYPE-MISSING');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Due Date"=current_date+3 WHERE "Row ID"='TYPE-MISSING'$q$,'before daily conversion');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Auto Charge Enabled"=true,"Interest Payment Interval"=NULL WHERE "Row ID"='TYPE-VALID'$q$,'positive interest payment interval');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Auto Charge Enabled"=true,"Interest Payment Interval"=0 WHERE "Row ID"='TYPE-VALID'$q$,'positive interest payment interval');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Auto Charge Enabled"=true,"Loan Date"=NULL WHERE "Row ID"='TYPE-VALID'$q$,'loan date');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Original Daily Interest Rate"=99 WHERE "Row ID"='TYPE-VALID'$q$,'read-only');
SELECT pg_temp.type_reject($q$UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน' WHERE "Row ID" IN ('TYPE-VALID','TYPE-MISSING')$q$,'before daily conversion');
SELECT pg_temp.type_assert(NOT EXISTS(SELECT 1 FROM type_before_failure b JOIN "Loans" l ON l."Row ID"=b.id WHERE b.row<>to_jsonb(l)),'failed single/multirow conversion preserves both source rows');
-- Manual daily mode does not need an automatic-generation interval.
UPDATE "Loans" SET "Loan Type"='ดอกเบี้ยรายวัน',"Interest Payment Interval"=NULL WHERE "Row ID"='TYPE-VALID';
SELECT pg_temp.type_assert((SELECT "Current Daily Interest"=5::money AND NOT "Auto Charge Enabled" FROM "Loans" WHERE "Row ID"='TYPE-VALID'),'manual daily conversion does not impose automatic schedule inputs');
UPDATE "Loans" SET "Loan Type"='กำหนดวันชำระ',"Interest Payment Interval"=1 WHERE "Row ID"='TYPE-VALID';
-- Existing NULL stored rate can use the established previous-term reconstruction only.
DO $$ DECLARE p public."Loans"; old public."Loans"; BEGIN
 SELECT * INTO old FROM "Loans" WHERE "Row ID"='TYPE-VALID';old."Original Daily Interest Rate":=NULL;p:=old;p."Loan Type":='ดอกเบี้ยรายวัน';p."Original Daily Interest Rate":=99;
 p:=public.apply_principal_daily_interest(p,old);
 PERFORM pg_temp.type_assert(p."Original Daily Interest Rate"=5 AND p."Current Daily Interest"=5::money,'legacy null basis derives from previous valid source terms, not supplied replacement rate');
 END $$;
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='TYPE-F';
SELECT pg_temp.type_assert(public.generate_loan_charge('TYPE-F',current_date) IS NOT NULL,'converted positive daily mode generates eligible charge');
SELECT pg_temp.type_assert((SELECT "Principal Due"=0::money AND "Interest Due"=8::money FROM "Charges" WHERE "Ref Loans"='TYPE-F' AND "Charge Date"=current_date),'future generation uses4 per day since prior charge');
SELECT pg_temp.type_assert(NOT EXISTS(SELECT row FROM type_booked EXCEPT SELECT to_jsonb(c) FROM "Charges" c),'new generation retains previous booked amounts');
SELECT 'Daily type conversion focused cases passed' AS result;
ROLLBACK;
