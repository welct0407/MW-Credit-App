\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
SELECT public.refresh_daily_analytics(current_date-10,current_date);
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.reject(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean:=false;
BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; failed:=true;
 END; IF NOT failed THEN RAISE EXCEPTION 'Expected rejection: %',expected; END IF;
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('CRUD59-B','Synthetic CRUD'),('CRUD59-X','Synthetic other'),('CRUD59-REF','Synthetic referrer');
UPDATE "Borrowers" SET "Ref Referrer"='CRUD59-REF' WHERE "Row ID"='CRUD59-B';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('CRUD59-PA','A'),('CRUD59-PB','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES ('CRUD59-CA','CRUD59-PA',current_date-100,'Contribution',100000::money),('CRUD59-CB','CRUD59-PB',current_date-100,'Contribution',100000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES ('CI-LISA','CRUD59-L1','CRUD59-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','CRUD59-L2','CRUD59-X',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES ('CRUD59-C1','CRUD59-L1',current_date-2,1000::money,100::money),('CRUD59-C0','CRUD59-L1',current_date-3,0::money,100::money),
 ('CRUD59-C2','CRUD59-L2',current_date-2,1000::money,100::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES ('CRUD59-P','CRUD59-B','Processing',100::money,current_date,'Lump Sum',NULL,'CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
-- Compare incremental history with the canonical full calculation after deferred
-- effects, independent statements, savepoint rollback and multirow source edits.
CREATE FUNCTION pg_temp.assert_history(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d date; until_day date; before_rows jsonb; after_rows jsonb;
BEGIN
 SELECT min("Snapshot Date"),max("Snapshot Date") INTO d,until_day FROM "Daily Analytics" WHERE "Snapshot Date">=current_date-10;
 IF d IS NULL THEN RETURN; END IF;
 SELECT jsonb_build_object('daily',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Daily Analytics" x WHERE "Snapshot Date" BETWEEN d AND until_day),'accounts',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date" BETWEEN d AND until_day)) INTO before_rows;
 PERFORM public.refresh_daily_analytics(d,until_day);
 SELECT jsonb_build_object('daily',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Daily Analytics" x WHERE "Snapshot Date" BETWEEN d AND until_day),'accounts',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date" BETWEEN d AND until_day)) INTO after_rows;
 PERFORM pg_temp.assert(before_rows IS NOT DISTINCT FROM after_rows,'final history: '||label);
 PERFORM pg_temp.assert(nullif(current_setting('business_history.from',true),'') IS NULL,'no unflushed source date: '||label);
END $$;
SELECT pg_temp.assert_history('deferred initial posting');
CREATE TEMP TABLE crud59_initial AS SELECT to_jsonb(p) receipt FROM "Payments" p WHERE "Row ID"='CRUD59-P';
-- Ordinary allocation UPDATE moves earlier and later without an actor/session approval ritual.
UPDATE "Payment Allocations" SET "Ref Charge"='CRUD59-C0' WHERE "Ref Payment"='CRUD59-P';
SELECT pg_temp.assert((SELECT "Ref Charges"='CRUD59-C0' FROM "Repayments" WHERE "Ref Payment"='CRUD59-P'),'earlier move');
UPDATE "Payment Allocations" SET "Ref Charge"='CRUD59-C1' WHERE "Ref Payment"='CRUD59-P';
SELECT pg_temp.assert((SELECT "Ref Charges"='CRUD59-C1' FROM "Repayments" WHERE "Ref Payment"='CRUD59-P'),'later undo');
SELECT pg_temp.assert((SELECT receipt=to_jsonb(p) FROM crud59_initial CROSS JOIN "Payments" p WHERE p."Row ID"='CRUD59-P'),'move leaves receipt unchanged');
-- Edit source amount/date/borrower/target/account; both parents and cash reconcile.
UPDATE "Payments" SET "Amount Received"=150::money WHERE "Row ID"='CRUD59-P';
SELECT pg_temp.assert((SELECT "Posted Amount"=150 AND "Planned Allocation Amount"=150 FROM "Payments" WHERE "Row ID"='CRUD59-P'),'updated receipt totals');
SELECT pg_temp.assert((SELECT "Amount"=150 FROM "Cash Ledger" WHERE "Ref Payment"='CRUD59-P'),'updated cash');
UPDATE "Payments" SET "Ref Borrower"='CRUD59-X',"Allocation Method"='Single Partial',"Ref Target Charge"='CRUD59-C2' WHERE "Row ID"='CRUD59-P';
SELECT pg_temp.assert((SELECT "Total Paid"=0 AND "Payment Count"=0 FROM "Charges" WHERE "Row ID"='CRUD59-C1'),'old charge cleared');
SELECT pg_temp.assert((SELECT "Total Paid"=150 FROM "Charges" WHERE "Row ID"='CRUD59-C2'),'new charge populated');
UPDATE "Payments" SET "Ref Received By Cash Account"='CI-LISA',"Ref Received By Cash Holder"='ch:lisa' WHERE "Row ID"='CRUD59-P';
SELECT pg_temp.assert_history('account-only correction');
SELECT pg_temp.assert((SELECT "Ref To Cash Account"='CI-LISA' FROM "Cash Ledger" WHERE "Ref Payment"='CRUD59-P'),'account edit without audit-note ritual');
-- No-op and metadata updates must not reallocate, recreate cash or rerun posting.
CREATE TEMP TABLE crud59_children AS SELECT to_jsonb(r) r FROM "Repayments" r WHERE "Ref Payment"='CRUD59-P';
UPDATE "Payments" SET "Amount Received"="Amount Received","Notes"='metadata only' WHERE "Row ID"='CRUD59-P';
SELECT pg_temp.assert((SELECT r=to_jsonb(x) FROM crud59_children CROSS JOIN "Repayments" x WHERE x."Ref Payment"='CRUD59-P'),'metadata preserves children');
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Amount Received"=99999::money WHERE "Row ID"='CRUD59-P'$q$,'Payment does not match');
SELECT pg_temp.assert((SELECT "Posted Amount"=150 FROM "Payments" WHERE "Row ID"='CRUD59-P'),'failed update rolls back');
DELETE FROM "Payments" WHERE "Row ID"='CRUD59-P';
DELETE FROM "Payments" WHERE "Row ID"='CRUD59-P';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Payment"='CRUD59-P') AND
 NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='CRUD59-P') AND
 NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='CRUD59-P'),'delete removes own effects; repeated delete is empty');
SELECT pg_temp.assert((SELECT "Outstanding Principal"=1000 FROM "Loans" WHERE "Row ID"='CRUD59-L2'),'delete restores principal');
-- Two receipts: the later receipt closes and creates exactly one referral.
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account","Created By")
 VALUES ('CRUD59-A','CRUD59-B','Processing',100::money,current_date,'Single Full','CRUD59-C0','CI-DAD','synthetic-A');
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account","Created By")
 VALUES ('CRUD59-BP','CRUD59-B','Processing',1100::money,current_date,'Single Full','CRUD59-C1','CI-DAD','synthetic-B');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert((SELECT "Ref Closing Payment"='CRUD59-BP' FROM "Loans" WHERE "Row ID"='CRUD59-L1'),'later receipt owns closure');
SELECT pg_temp.assert((SELECT count(*)=1 FROM "Business Expenses" WHERE "Ref Related Loan"='CRUD59-L1' AND "Source Type"='Referral Rebate'),'one referral');
SAVEPOINT closing_date;
UPDATE "Payments" SET "Payment Date"=current_date-1 WHERE "Row ID"='CRUD59-BP';
SELECT pg_temp.assert((SELECT "Close Date"=current_date-1 FROM "Loans" WHERE "Row ID"='CRUD59-L1'),'closing receipt date correction follows source');
SELECT pg_temp.assert((SELECT "Expense Date"=current_date-1 FROM "Business Expenses" WHERE "Ref Related Loan"='CRUD59-L1' AND "Source Type"='Referral Rebate'),'referral date follows closing receipt correction');
ROLLBACK TO closing_date;
SELECT pg_temp.assert_history('closing savepoint rollback');
CREATE TEMP TABLE crud59_later AS SELECT to_jsonb(p) p FROM "Payments" p WHERE "Row ID"='CRUD59-BP';
UPDATE "Payments" SET "Payment Date"=current_date-1 WHERE "Row ID"='CRUD59-A';
SELECT pg_temp.assert((SELECT "Ref Closing Payment"='CRUD59-BP' AND "Closed By"='synthetic-B' FROM "Loans" WHERE "Row ID"='CRUD59-L1'),'earlier correction preserves later closure actor');
SELECT pg_temp.assert((SELECT p=to_jsonb(x) FROM crud59_later CROSS JOIN "Payments" x WHERE x."Row ID"='CRUD59-BP'),'later receipt unchanged');
DELETE FROM "Payments" WHERE "Row ID"='CRUD59-A';
SELECT pg_temp.assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='CRUD59-L1'),'earlier deletion reopens only when debt remains');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Ref Related Loan"='CRUD59-L1' AND "Source Type"='Referral Rebate'),'referral removed on reopen');
SELECT pg_temp.assert((SELECT p=to_jsonb(x) FROM crud59_later CROSS JOIN "Payments" x WHERE x."Row ID"='CRUD59-BP'),'later receipt still unchanged after deletion');

SELECT pg_temp.assert_history('earlier receipt deletion and referral reopen');
-- Valid multirow redistribution, then a last-row failure must roll everything back.
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES ('CRUD59-M1','CRUD59-X','Processing',400::money,current_date,'Single Partial','CRUD59-C2','CI-DAD');
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES ('CRUD59-M2','CRUD59-X','Processing',300::money,current_date,'Single Partial','CRUD59-C2','CI-DAD');
UPDATE "Payments" SET "Amount Received"=(CASE "Row ID" WHEN 'CRUD59-M1' THEN 500 ELSE 200 END)::money
 WHERE "Row ID" IN ('CRUD59-M1','CRUD59-M2');
SELECT pg_temp.assert((SELECT sum("Posted Amount")=700 FROM "Payments" WHERE "Row ID" IN ('CRUD59-M1','CRUD59-M2')),'valid multirow redistribution');
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Amount Received"=(CASE "Row ID" WHEN 'CRUD59-M1' THEN 501 ELSE 5000 END)::money
 WHERE "Row ID" IN ('CRUD59-M1','CRUD59-M2')$q$,'Payment does not match');
SELECT pg_temp.assert((SELECT "Posted Amount"=500 FROM "Payments" WHERE "Row ID"='CRUD59-M1'),'last-row failure rolls first row back');
SELECT pg_temp.assert_history('multirow success and failure rollback');
CREATE FUNCTION pg_temp.crud59_late_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."Ref Payment"='CRUD59-M1' AND NEW."Amount"=501 THEN RAISE EXCEPTION 'synthetic final cash failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER zzzz_crud59_failure AFTER INSERT OR UPDATE ON "Cash Ledger" FOR EACH ROW EXECUTE FUNCTION pg_temp.crud59_late_failure();
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Amount Received"=501::money WHERE "Row ID"='CRUD59-M1'$q$,'synthetic final cash failure');
SELECT pg_temp.assert((SELECT "Posted Amount"=500 FROM "Payments" WHERE "Row ID"='CRUD59-M1') AND
 (SELECT "Amount"=500 FROM "Cash Ledger" WHERE "Ref Payment"='CRUD59-M1'),'last-step failure restores receipt and cash');
DROP TRIGGER zzzz_crud59_failure ON "Cash Ledger";
-- Optional optimistic concurrency is ordinary SQL WHERE, without a new version column.
DO $$ DECLARE affected integer; BEGIN
 UPDATE "Payments" SET "Amount Received"=450::money WHERE "Row ID"='CRUD59-M1' AND "Amount Received"=499::money;
 GET DIAGNOSTICS affected=ROW_COUNT; PERFORM pg_temp.assert(affected=0,'stale expected amount updates no row');
END $$;
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Amount Received"=0::money WHERE "Row ID"='CRUD59-M1'$q$,'positive whole-baht');
SELECT pg_temp.reject($q$UPDATE "Payments" SET "Row ID"='CRUD59-RENAMED' WHERE "Row ID"='CRUD59-M1'$q$,'key cannot');
SELECT set_config('payment_crud.id','CRUD59-M1',true);
SELECT pg_temp.reject($q$DELETE FROM "Repayments" WHERE "Ref Payment"='CRUD59-M1'$q$,'immutable');
SELECT set_config('payment_crud.id','',true);
-- Current-day daily principal correction is supported; booked later charges are
-- not guessed/repriced when a backdated principal amount changes.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
 VALUES ('CI-LISA','CRUD59-DAILY','CRUD59-X',current_date-10,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,100::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES ('CRUD59-DC','CRUD59-DAILY',current_date-2,500::money,0::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES ('CRUD59-DP','CRUD59-X','Processing',100::money,current_date-2,'Single Partial','CRUD59-DC','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert((SELECT "Current Daily Interest"::numeric=90 FROM "Loans" WHERE "Row ID"='CRUD59-DAILY'),'daily rate after posting');
UPDATE "Payments" SET "Amount Received"=200::money WHERE "Row ID"='CRUD59-DP';
SELECT pg_temp.assert((SELECT "Current Daily Interest"::numeric=80 FROM "Loans" WHERE "Row ID"='CRUD59-DAILY'),'daily rate after correction');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES ('CRUD59-DF','CRUD59-DAILY',current_date-1,0::money,80::money);
UPDATE "Payments" SET "Amount Received"=150::money WHERE "Row ID"='CRUD59-DP';
SELECT pg_temp.assert((SELECT "Current Daily Interest"::numeric=85 AND "Outstanding Principal"=850 FROM "Loans" WHERE "Row ID"='CRUD59-DAILY'),'older principal edit updates current rate');
SELECT pg_temp.assert((SELECT "Interest Due"=80::money FROM "Charges" WHERE "Row ID"='CRUD59-DF'),'later booked interest remains unchanged');
DELETE FROM "Payments" WHERE "Row ID"='CRUD59-DP';
SELECT pg_temp.assert((SELECT "Current Daily Interest"::numeric=100 AND "Outstanding Principal"=1000 FROM "Loans" WHERE "Row ID"='CRUD59-DAILY'),'older principal deletion restores rate and principal');
SELECT pg_temp.assert((SELECT "Interest Due"=80::money FROM "Charges" WHERE "Row ID"='CRUD59-DF'),'deletion does not retrospectively reprice booked interest');
UPDATE "Charges" SET "Interest Due"=100::money WHERE "Row ID"='CRUD59-DF';
SELECT pg_temp.assert((SELECT "Interest Due"=100::money FROM "Charges" WHERE "Row ID"='CRUD59-DF'),'later unpaid charge separately editable');
-- Snapshot refresh uses actual booked dates, while unrelated source rows stay unchanged.
SELECT pg_temp.assert((SELECT p=to_jsonb(x) FROM crud59_later CROSS JOIN "Payments" x WHERE x."Row ID"='CRUD59-BP'),'unrelated receipt survives all later CRUD');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM agent_audit.commits WHERE code_version='CRUD59'),'ordinary CRUD creates no fake operator intent/outbox marker');
SELECT pg_temp.assert_history('daily correction preserves booked charges');
SELECT 'Payment CRUD functional cases passed' result;
ROLLBACK;
