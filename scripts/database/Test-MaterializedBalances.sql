\ir Test-AnalyticsRefresh.sql
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.vc_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('VC12-B','SYNTHETIC VC');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
 SELECT 'VC12-L'||n,'VC12-B',current_date-10,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money FROM generate_series(1,3) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('VC12-C1','VC12-L1',current_date-5,100::money,10::money),('VC12-C2','VC12-L2',current_date-5,100::money,10::money);
SELECT pg_temp.vc_assert((SELECT "Amount Remaining"=110 AND "Payment Count"=0 AND "Payment Status"='รอชำระ' AND "Payment Date" IS NULL FROM "Charges" WHERE "Row ID"='VC12-C1'),'empty charge');
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES('VC12-R','VC12-L1','VC12-C1',current_date-2,20::money,10::money);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.vc_assert((SELECT "Principal Paid"=20 AND "Interest Paid"=10 AND "Amount Remaining"=80 AND "Payment Status"='ชำระบางส่วน' AND "Payment Date" IS NULL AND "Payment Count"=1 FROM "Charges" WHERE "Row ID"='VC12-C1'),'partial child aggregate');
SELECT pg_temp.vc_assert((SELECT "Total Amount Received"=30 AND "Outstanding Principal"=80 FROM "Loans" WHERE "Row ID"='VC12-L1'),'loan aggregate');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Repayments" SET "Ref Loans"='VC12-L2',"Ref Charges"='VC12-C2' WHERE "Row ID"='VC12-R';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.vc_assert((SELECT "Payment Count"=0 AND "Total Paid"=0 FROM "Charges" WHERE "Row ID"='VC12-C1'),'old charge refreshed');
SELECT pg_temp.vc_assert((SELECT "Payment Count"=1 AND "Total Paid"=30 FROM "Charges" WHERE "Row ID"='VC12-C2'),'new charge refreshed');
SELECT pg_temp.vc_assert((SELECT "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"='VC12-L1'),'old loan refreshed');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Repayments" SET "Principal Paid"=120::money,"Interest Paid"=(-10)::money WHERE "Row ID"='VC12-R';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.vc_assert((SELECT "Amount Remaining"=0 AND "Principal Remaining"=-20 AND "Interest Remaining"=20 AND "Payment Status"='ชำระแล้ว' AND "Payment Date"=current_date-2 FROM "Charges" WHERE "Row ID"='VC12-C2'),'signed components and paid date');
SELECT pg_temp.vc_assert((SELECT "Outstanding Principal"=-20 FROM "Loans" WHERE "Row ID"='VC12-L2'),'unclamped loan outstanding');
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM "Repayments" WHERE "Row ID"='VC12-R';
UPDATE "Loans" SET "Loan Status"='ปิดยอดแล้ว' WHERE "Row ID"='VC12-L2';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.vc_assert((SELECT "Payment Count"=0 AND "Total Paid"=0 AND "Payment Status"='ชำระแล้ว' AND "Payment Date" IS NULL FROM "Charges" WHERE "Row ID"='VC12-C2'),'delete and closed loan override');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Loans" SET "Loan Status"='ยังไม่ปิดยอด' WHERE "Row ID"='VC12-L2';
UPDATE "Charges" SET "Ref Loans"='VC12-L1',"Principal Due"=50::money,"Principal Paid"=999 WHERE "Row ID"='VC12-C2';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.vc_assert((SELECT "Payment Status"='รอชำระ' AND "Amount Remaining"=60 AND "Principal Paid"=0 FROM "Charges" WHERE "Row ID"='VC12-C2'),'charge terms and forged cache overwritten');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('VC12-P','VC12-B','VC12-C1',30::money,current_date,'Single Partial','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='VC12-L1';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='VC12-L1';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.vc_assert((SELECT "Total Principal Received"=100 AND "Total Interest Received"=-70 AND "Total Amount Received"=30 AND "Outstanding Principal"=0 FROM "Loans" WHERE "Row ID"='VC12-L1'),'default nested posting flush preserves zero cash loss');
SELECT pg_temp.vc_assert((SELECT bool_and("Payment Status"='ชำระแล้ว' AND "Amount Remaining"=0) FROM "Charges" WHERE "Ref Loans"='VC12-L1'),'all defaulted charges refreshed');
DO $$ BEGIN
 BEGIN UPDATE "Charges" SET "Interest Due"=0::money WHERE "Row ID" LIKE 'df10:%VC12-L1'; RAISE EXCEPTION 'guard did not reject';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%immutable%' THEN RAISE; END IF; END;
END $$;
SELECT 'Materialized balance regression passed' AS result;
ROLLBACK;
