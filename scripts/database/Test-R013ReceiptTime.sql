\set ON_ERROR_STOP on
-- Synthetic, rolled-back source payments; usable on disposable PostgreSQL and DEV.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
CREATE FUNCTION pg_temp.check13(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R013 failed: %',label; END IF; END $$;
CREATE TEMP TABLE receipt_clock AS SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-1 d;
INSERT INTO "Partners"("Row ID","Partner Name","Partner Role","Login Email")
 VALUES('R013-TEST-PARTNER','Synthetic R013','A','r013@example.invalid');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 SELECT 'R013-TEST-CAPITAL','R013-TEST-PARTNER',d,'Contribution',10000::money FROM receipt_clock;
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('R013-TEST-DAD','ch:dad','Synthetic R013 Dad','Synthetic'),
 ('R013-TEST-LISA','ch:lisa','Synthetic R013 Lisa','Synthetic');
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description") VALUES('R013-TEST-BORROWER','Synthetic R013','Synthetic R013');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
 SELECT 'R013-TEST-LOAN','R013-TEST-BORROWER',d-1,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,'R013-TEST-LISA' FROM receipt_clock;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT 'R013-TEST-CHARGE','R013-TEST-LOAN',d,0::money,100::money FROM receipt_clock;
INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Created At","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 SELECT 'R013-TEST-TIMED','Processing','R013-TEST-BORROWER',25::money,d,d+time '18:23:12','Single Partial','R013-TEST-CHARGE','R013-TEST-DAD' FROM receipt_clock;
SELECT pg_temp.check13((SELECT p."Status"='Posted' AND p."Created At"=c.d+time '18:23:12'
 AND l."Created At"=p."Created At" AND l."Movement Date"=p."Payment Date"
 FROM "Payments" p JOIN "Cash Ledger" l ON l."Ref Payment"=p."Row ID" CROSS JOIN receipt_clock c
 WHERE p."Row ID"='R013-TEST-TIMED'),'exact source and ledger timestamp');
SELECT pg_temp.check13((SELECT "Statement Time"=time '18:23:12' AND "Sort Timestamp"=c.d+time '18:23:12'
 AND "Statement Date"=c.d FROM "Cash Account Statement Recent" CROSS JOIN receipt_clock c
 WHERE "Ref Payment"='R013-TEST-TIMED'),'OLTP existing statement fields');
SELECT pg_temp.check13((SELECT "Sort Timestamp">=c.d::timestamp AND "Sort Timestamp"<(c.d+1)::timestamp
 FROM cash_statement_account_effects CROSS JOIN receipt_clock c WHERE "Ref Payment"='R013-TEST-TIMED'),
 'agent midnight cutoff uses receipt day, not processing day');
UPDATE "Payments" SET "Status"='Processing' WHERE "Row ID"='R013-TEST-TIMED';
SELECT pg_temp.check13((SELECT count(*)=1 AND min("Created At")=c.d+time '18:23:12'
 FROM "Cash Ledger" CROSS JOIN receipt_clock c WHERE "Ref Payment"='R013-TEST-TIMED' GROUP BY c.d),
 'retry preserves one receipt and exact timestamp');
INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 SELECT 'R013-TEST-LEGACY','Processing','R013-TEST-BORROWER',25::money,d,'Single Partial','R013-TEST-CHARGE','R013-TEST-DAD' FROM receipt_clock;
SELECT pg_temp.check13((SELECT "Created At"=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'
 FROM "Cash Ledger" WHERE "Ref Payment"='R013-TEST-LEGACY'),'missing source timestamp retains old server-time fallback');
SELECT pg_temp.check13((SELECT "Created At"=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'
 FROM "Cash Ledger" WHERE "Ref Loan"='R013-TEST-LOAN'),'non-payment timestamp behavior unchanged');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
SELECT 'R013 receipt timestamp checks passed; all fixture writes rolled back' result;
