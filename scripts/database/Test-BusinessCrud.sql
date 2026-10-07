\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
-- Ordinary CRUD uses PostgreSQL's normal automatic planning.
-- Forced generic planning is isolated below as a separate compatibility check.
SET LOCAL plan_cache_mode='auto';
DO $$ BEGIN ASSERT (SELECT 'plan_cache_mode=force_custom_plan'=ANY(proconfig) FROM pg_proc WHERE oid='public.refresh_daily_analytics(date,date)'::regprocedure),'bounded date-specific refresh plan'; END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Business CRUD: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.reject(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END; RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('CRUD60-B','Synthetic business'),('CRUD60-X','Synthetic independent');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('CRUD60-A','A'),('CRUD60-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('CRUD60-CA','CRUD60-A',current_date-30,'Contribution',10000::money),('CRUD60-CB','CRUD60-B',current_date-30,'Contribution',10000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('CI-LISA','CRUD60-L','CRUD60-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','CRUD60-X','CRUD60-X',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('CRUD60-C','CRUD60-L',current_date-5,1000::money,1000::money),('CRUD60-MOVE','CRUD60-L',current_date-4,0::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES('CRUD60-P','CRUD60-B','Processing',1000::money,current_date,'Single Partial','CRUD60-C','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE unrelated_receipt AS SELECT to_jsonb(p) p FROM "Payments" p WHERE "Row ID"='CRUD60-P';
-- Source charge edit updates both parents and cannot undercut a received component.
UPDATE "Charges" SET "Ref Loans"='CRUD60-X',"Interest Due"=20::money WHERE "Row ID"='CRUD60-MOVE';
SELECT pg_temp.assert((SELECT "Ref Loans"='CRUD60-X' AND "Amount Remaining"=20 FROM "Charges" WHERE "Row ID"='CRUD60-MOVE'),'unpaid charge moves');
SELECT pg_temp.reject($q$UPDATE "Charges" SET "Interest Due"=999::money WHERE "Row ID"='CRUD60-C'$q$,'less than');
SELECT pg_temp.reject($q$DELETE FROM "Charges" WHERE "Row ID"='CRUD60-C'$q$,'has receipts');
SELECT pg_temp.reject($q$DELETE FROM "Loans" WHERE "Row ID"='CRUD60-L'$q$,'has receipts');
DELETE FROM "Charges" WHERE "Row ID"='CRUD60-MOVE';
-- Manual expense changes its own cash and ratios; deletion removes both.
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Ref Related Loan","Ref Related Borrower")
 VALUES('CRUD60-E',current_date-1,'Other',20::money,'CI-LISA','ch:lisa','CRUD60-X','CRUD60-X');
SELECT pg_temp.reject($q$UPDATE "Loans" SET "Ref Borrowers"='CRUD60-B' WHERE "Row ID"='CRUD60-X'$q$,'Related expense borrower');
SELECT public.refresh_daily_analytics(current_date-2,current_date);
SAVEPOINT bounded_history;
CREATE TEMP TABLE history_before AS SELECT "Generated At" generated FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-2;
UPDATE "Payments" SET "Amount Received"=999::money WHERE "Row ID"='CRUD60-P';
SELECT pg_temp.assert((SELECT d."Generated At"=b.generated FROM "Daily Analytics" d CROSS JOIN history_before b WHERE d."Snapshot Date"=current_date-2),'current payment does not rerender history from original loan/charge dates');
ROLLBACK TO bounded_history;
UPDATE "Business Expenses" SET "Amount"=30::money,"Expense Date"=current_date-2 WHERE "Row ID"='CRUD60-E';
SELECT pg_temp.assert((SELECT "Amount"=30 AND "Movement Date"=current_date-2 FROM "Cash Ledger" WHERE "Ref Business Expense"='CRUD60-E'),'expense source cash update');
SELECT pg_temp.assert((SELECT "Business Expenses"=(SELECT coalesce(sum("Amount"),0::money) FROM "Business Expenses" WHERE "Expense Date"=current_date-2) FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-2),'expense old/new snapshot refresh');
UPDATE "Cash Pool Contributions" SET "Amount"=30000::money WHERE "Row ID"='CRUD60-CA';
SELECT pg_temp.assert((SELECT "Partner A Expense"=round(30*public.partner_pool_share_at_date(current_date-2,'A'))::money AND "Partner A Expense"+"Partner B Expense"="Amount" FROM "Business Expenses" WHERE "Row ID"='CRUD60-E'),'contribution correction reallocates booked expense');
DELETE FROM "Business Expenses" WHERE "Row ID"='CRUD60-E';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Business Expense"='CRUD60-E'),'expense deletion removes cash');
SELECT pg_temp.assert((SELECT "Business Expenses"=(SELECT coalesce(sum("Amount"),0::money) FROM "Business Expenses" WHERE "Expense Date"=current_date-2) FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-2),'expense delete refreshes snapshot');
-- Manual movement amounts/date/endpoints support update and delete; system rows do not.
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account")
 VALUES('CRUD60-H',current_date,'Cash Handover',10,'ch:dad','ch:lisa','CI-DAD','CI-LISA');
UPDATE "Cash Ledger" SET "Amount"=15,"Movement Date"=current_date-1 WHERE "Row ID"='CRUD60-H';
SELECT pg_temp.assert((SELECT "Amount"=15 AND "Movement Date"=current_date-1 FROM "Cash Ledger" WHERE "Row ID"='CRUD60-H'),'manual cash correction');
DELETE FROM "Cash Ledger" WHERE "Row ID"='CRUD60-H';
SELECT pg_temp.reject($q$DELETE FROM "Cash Ledger" WHERE "Ref Payment"='CRUD60-P'$q$,'retained');
-- Settlement uses the existing shared allocation lock; cancellation remains supported.
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Ref Paid From Cash Account")
 VALUES('CRUD60-S','CRUD60-A',10::money,'Pending',current_date,'CI-LISA');
UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='CRUD60-S';
UPDATE "Settlements" SET "Amount"=15::money,"Transfer Date"=current_date-1 WHERE "Row ID"='CRUD60-S';
SELECT pg_temp.assert((SELECT "Amount"=15 AND "Movement Date"=current_date-1 FROM "Cash Ledger" WHERE "Ref Settlement"='CRUD60-S'),'settlement correction');
UPDATE "Settlements" SET "Status"='Cancelled' WHERE "Row ID"='CRUD60-S';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Settlement"='CRUD60-S'),'cancel removes payout projection');
UPDATE "Settlements" SET "Status"='Completed' WHERE "Row ID"='CRUD60-S';
DELETE FROM "Settlements" WHERE "Row ID"='CRUD60-S';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Settlement"='CRUD60-S'),'delete removes payout projection');
-- Loan principal/current daily rate, deletion and isolated master data.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
 VALUES('CI-LISA','CRUD60-D','CRUD60-X',current_date-2,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,100::money);
SAVEPOINT reassign_history;
CREATE TEMP TABLE borrowers_before AS SELECT "Active Borrowers EOD" n FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-2;
UPDATE "Loans" SET "Ref Borrowers"='CRUD60-B' WHERE "Row ID" IN ('CRUD60-X','CRUD60-D');
SELECT pg_temp.assert((SELECT "Active Borrowers EOD"=b.n-1 FROM "Daily Analytics" CROSS JOIN borrowers_before b WHERE "Snapshot Date"=current_date-2),'unpaid loan reassignment refreshes borrower history');
ROLLBACK TO reassign_history;
UPDATE "Loans" SET "Principal Amount"=1200::money WHERE "Row ID"='CRUD60-D';
SELECT pg_temp.assert((SELECT "Outstanding Principal"=1200 AND "Current Daily Interest"=120::money FROM "Loans" WHERE "Row ID"='CRUD60-D'),'principal correction updates outstanding before rate');
SELECT pg_temp.assert((SELECT "Amount"=1200 FROM "Cash Ledger" WHERE "Ref Loan"='CRUD60-D'),'principal disbursement correction');
DELETE FROM "Loans" WHERE "Row ID"='CRUD60-D';
DELETE FROM "Loans" WHERE "Row ID"='CRUD60-X';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Loan" IN ('CRUD60-D','CRUD60-X')),'unpaid loan deletion removes disbursement');
INSERT INTO "Loan Assessment"("Row ID","Ref Borrower","Proposed Loan Amount") VALUES('CRUD60-AS','CRUD60-X',100::money);
UPDATE "Loan Assessment" SET "Proposed Loan Amount"=120::money WHERE "Row ID"='CRUD60-AS';
DELETE FROM "Loan Assessment" WHERE "Row ID"='CRUD60-AS';
UPDATE "Borrowers" SET "Borrower Name"='Synthetic changed' WHERE "Row ID"='CRUD60-X';
DELETE FROM "Borrowers" WHERE "Row ID"='CRUD60-X';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('CRUD60-UNUSED','A');
DELETE FROM "Partners" WHERE "Row ID"='CRUD60-UNUSED';
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES('CRUD60-AC','ch:dad','Synthetic unused','Synthetic');
UPDATE "Cash Accounts" SET "Account Label"='Synthetic edited' WHERE "Row ID"='CRUD60-AC';
DELETE FROM "Cash Accounts" WHERE "Row ID"='CRUD60-AC';
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('CRUD60-EXTRA','CRUD60-A',current_date-15,'Contribution',100::money);
UPDATE "Cash Pool Contributions" SET "Contribution Date"=current_date-20 WHERE "Row ID"='CRUD60-EXTRA';
DELETE FROM "Cash Pool Contributions" WHERE "Row ID"='CRUD60-EXTRA';
SELECT pg_temp.assert((SELECT p=to_jsonb(x) FROM unrelated_receipt CROSS JOIN "Payments" x WHERE x."Row ID"='CRUD60-P'),'all broad operations preserve unrelated receipt');
-- Default and prepared Loan Close both have ordinary source inverses.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
 VALUES('CI-LISA','CRUD60-DEF','CRUD60-B',current_date-5,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money),
 ('CI-LISA','CRUD60-CLOSE','CRUD60-B',current_date-2,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('CRUD60-DEF-PAID','CRUD60-DEF',current_date-3,0::money,10::money),('CRUD60-DEF-DUE','CRUD60-DEF',current_date-2,100::money,20::money),
 ('CRUD60-CLOSE-C','CRUD60-CLOSE',current_date,0::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('CRUD60-DEF-P','CRUD60-B','Processing',10::money,current_date-3,'Single Full','CRUD60-DEF-PAID','CI-DAD');
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES
 ('CRUD60-CLOSE-FIRST','CRUD60-B','Processing',10::money,current_date,'Single Full','CRUD60-CLOSE-C','CI-DAD');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('CRUD60-DEF','CRUD60-CLOSE');
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic-r051' WHERE "Row ID"='CRUD60-DEF';
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='CRUD60-DEF';
SELECT pg_temp.assert((SELECT "Outstanding Principal"=100 AND NOT "Defaulted" FROM "Loans" WHERE "Row ID"='CRUD60-DEF'),'default inverse restores principal');
SELECT pg_temp.assert((SELECT "Principal Due"=100::money AND "Interest Due"=20::money FROM "Charges" WHERE "Row ID"='CRUD60-DEF-DUE'),'default inverse restores obligations');
SELECT pg_temp.assert((SELECT "Posted Amount"=10 FROM "Payments" WHERE "Row ID"='CRUD60-DEF-P'),'default inverse preserves independent receipt');
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Loan","Ref Received By Cash Account")
 VALUES('CRUD60-CLOSE-P','CRUD60-B','Processing',1::money,current_date,'Loan Close','CRUD60-CLOSE','CI-DAD');
DELETE FROM "Payments" WHERE "Row ID"='CRUD60-CLOSE-P';
SELECT pg_temp.assert((SELECT "Outstanding Principal"=100 AND "Loan Status"='ยังไม่ปิดยอด' FROM "Loans" WHERE "Row ID"='CRUD60-CLOSE'),'Loan Close delete reopens');
SELECT pg_temp.assert((SELECT "Principal Due"=100::money AND "Interest Due"=10::money FROM "Charges" WHERE "Row ID"='CRUD60-CLOSE-C'),'augmented charge retained for explicit correction');
UPDATE "Charges" SET "Principal Due"=0::money WHERE "Row ID"='CRUD60-CLOSE-C';
SELECT pg_temp.assert((SELECT "Posted Amount"=10 FROM "Payments" WHERE "Row ID"='CRUD60-CLOSE-FIRST'),'charge correction preserves earlier receipt');
SAVEPOINT generic_planning;
SET LOCAL plan_cache_mode='force_generic_plan';
SELECT public.refresh_daily_analytics(current_date-1,current_date);
SELECT pg_temp.assert(current_setting('plan_cache_mode')='force_generic_plan','history refresh restores caller planning setting');
ROLLBACK TO generic_planning;
SELECT 'Business source CRUD passed' AS result;
ROLLBACK;
