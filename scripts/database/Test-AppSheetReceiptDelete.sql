-- Disposable regression fixture only. Never execute its synthetic funding on DEV.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.del65_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Delete request: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.del65_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN;
 END; RAISE EXCEPTION 'Expected rejection: %',expected; END $$;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('DEL65-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('DEL65-FUND','DEL65-A',current_date-30,'Contribution',10000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('DEL65-B','Synthetic delete'),('DEL65-CLOSE','Synthetic closing'),('DEL65-REF','Synthetic referrer');
UPDATE "Borrowers" SET "Ref Referrer"='DEL65-REF' WHERE "Row ID"='DEL65-CLOSE';
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account") VALUES
 ('DEL65-L','DEL65-B',current_date-2,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'CI-LISA'),
 ('DEL65-LC','DEL65-CLOSE',current_date-2,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('DEL65-C','DEL65-L',current_date-1,100::money,10::money),('DEL65-CC','DEL65-LC',current_date-1,100::money,100::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('DEL65-P','DEL65-B',current_date,20::money,'Single Partial','Processing','DEL65-C','CI-DAD');
INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('DEL65-LATER','DEL65-B',current_date,5::money,'Single Partial','Processing','DEL65-C','CI-DAD'),
 ('DEL65-CLOSING','DEL65-CLOSE',current_date,200::money,'Single Full','Processing','DEL65-CC','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT public.refresh_daily_analytics(current_date-2,current_date);
CREATE TEMP TABLE del65_later AS SELECT to_jsonb(p) source FROM "Payments" p WHERE "Row ID"='DEL65-LATER';
CREATE TEMP TABLE del65_children AS SELECT to_jsonb(r) row FROM "Repayments" r WHERE "Ref Payment"='DEL65-P';
SELECT pg_temp.del65_reject($q$INSERT INTO "Payments"("Row ID","Delete Requested") VALUES('DEL65-INVALID',true)$q$,'Create a receipt');
SELECT pg_temp.del65_reject($q$UPDATE "Payments" SET "Delete Requested"=true,"Notes"='mixed' WHERE "Row ID"='DEL65-P'$q$,'separate action');
SELECT pg_temp.del65_reject($q$UPDATE "Payments" SET "Delete Requested"=true,"Amount Received"=1::money WHERE "Row ID"='DEL65-P'$q$,'separate action');
SELECT pg_temp.del65_reject($q$DELETE FROM "Payment Allocations" WHERE "Ref Payment"='DEL65-P'$q$,'immutable');
SELECT pg_temp.del65_reject($q$DELETE FROM "Repayments" WHERE "Ref Payment"='DEL65-P'$q$,'immutable');
UPDATE "Payments" SET "Notes"='normal metadata' WHERE "Row ID"='DEL65-P';
UPDATE "Payments" SET "Delete Requested"=false WHERE "Row ID"='DEL65-P';
SELECT pg_temp.del65_assert((SELECT row=to_jsonb(r) FROM del65_children CROSS JOIN "Repayments" r WHERE r."Ref Payment"='DEL65-P'),'ordinary metadata/no-op preserves child');
-- AFTER trigger deletes source while UPDATE RETURNING still acknowledges one row.
CREATE TEMP TABLE del65_returned AS WITH changed AS (
 UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='DEL65-P' RETURNING "Row ID","Delete Requested") SELECT * FROM changed;
SELECT pg_temp.del65_assert((SELECT count(*)=1 AND bool_and("Delete Requested") FROM del65_returned),'UPDATE RETURNING acknowledges source command');
SELECT pg_temp.del65_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='DEL65-P'),'parent deleted');
SELECT pg_temp.del65_assert(NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='DEL65-P') AND NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Payment"='DEL65-P') AND NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='DEL65-P'),'all owned effects removed');
SELECT pg_temp.del65_assert((SELECT "Outstanding Principal"=95 FROM "Loans" WHERE "Row ID"='DEL65-L'),'later independent principal preserved');
SELECT pg_temp.del65_assert((SELECT source=to_jsonb(p) FROM del65_later CROSS JOIN "Payments" p WHERE p."Row ID"='DEL65-LATER'),'intervening source unchanged');
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='DEL65-P';
SELECT pg_temp.del65_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='DEL65-P'),'missing-row SQL retry does not recreate');
SELECT pg_temp.del65_assert(EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Ref Related Loan"='DEL65-LC'),'closing referral exists before request');
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='DEL65-CLOSING';
SELECT pg_temp.del65_assert((SELECT "Outstanding Principal"=100 AND "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='DEL65-LC'),'closing request reopens');
SELECT pg_temp.del65_assert(NOT EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Ref Related Loan"='DEL65-LC'),'own referral removed');
-- Later default remains a precise source dependency; the request flag rolls back.
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='DEL65-L';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic-del65' WHERE "Row ID"='DEL65-L';
SELECT pg_temp.del65_reject($q$UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='DEL65-LATER'$q$,'later loan default');
SELECT pg_temp.del65_assert((SELECT NOT "Delete Requested" FROM "Payments" WHERE "Row ID"='DEL65-LATER'),'dependency failure resets request');
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='DEL65-L';
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='DEL65-L';
-- A failure after the source DELETE proves statement and multirow atomicity.
INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('DEL65-M1','DEL65-B',current_date,5::money,'Single Partial','Processing','DEL65-C','CI-DAD');
INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('DEL65-M2','DEL65-B',current_date,5::money,'Single Partial','Processing','DEL65-C','CI-DAD');
CREATE FUNCTION pg_temp.del65_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."Row ID"='DEL65-M2' THEN RAISE EXCEPTION 'synthetic last delete failure'; END IF; RETURN NULL; END $$;
CREATE TRIGGER zzzzz_del65_fail AFTER DELETE ON "Payments" FOR EACH ROW EXECUTE FUNCTION pg_temp.del65_fail();
SELECT pg_temp.del65_reject($q$UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID" IN ('DEL65-M1','DEL65-M2')$q$,'synthetic last delete failure');
SELECT pg_temp.del65_assert((SELECT count(*)=2 AND NOT bool_or("Delete Requested") FROM "Payments" WHERE "Row ID" IN ('DEL65-M1','DEL65-M2')),'failed batch restores both source flags');
SELECT pg_temp.del65_assert((SELECT count(*)=2 FROM "Cash Ledger" WHERE "Ref Payment" IN ('DEL65-M1','DEL65-M2')),'failed batch restores cash');
DROP TRIGGER zzzzz_del65_fail ON "Payments";
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID" IN ('DEL65-M1','DEL65-M2');
SELECT pg_temp.del65_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID" IN ('DEL65-M1','DEL65-M2')),'valid multirow command');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.del65_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Delete Requested"),'no surviving pending command');
CREATE TEMP TABLE del65_history AS SELECT jsonb_build_object(
 'daily',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Daily Analytics" x WHERE "Snapshot Date">=current_date-2),
 'accounts',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date">=current_date-2)) value;
SELECT public.refresh_daily_analytics(current_date-2,current_date);
SELECT pg_temp.del65_assert((SELECT value=jsonb_build_object(
 'daily',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Daily Analytics" x WHERE "Snapshot Date">=current_date-2),
 'accounts',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date">=current_date-2)) FROM del65_history),'deferred final daily/account history matches canonical');
SELECT 'AppSheet receipt delete request functional checks passed' AS result;
ROLLBACK;
