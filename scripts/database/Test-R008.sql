\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
-- Local isolated test database only. Supply explicit fixture defaults while
-- exercising unchanged legacy financial suites, then remove those defaults.
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('R008-D1','ch:dad','Synthetic Dad 1','Synthetic'),('R008-D2','ch:dad','Synthetic Dad 2','Synthetic'),
 ('R008-L1','ch:lisa','Synthetic Lisa 1','Synthetic'),('R008-T1','ch:tommy','Synthetic Tommy 1','Synthetic');
ALTER TABLE "Loans" ALTER COLUMN "Ref Disbursed From Cash Account" SET DEFAULT 'R008-L1';
ALTER TABLE "Payments" ALTER COLUMN "Ref Received By Cash Account" SET DEFAULT 'R008-D1';
ALTER TABLE "Business Expenses" ALTER COLUMN "Ref Paid By Cash Account" SET DEFAULT 'R008-L1';
\ir Test-AtomicLoanClose.sql
ALTER TABLE "Loans" ALTER COLUMN "Ref Disbursed From Cash Account" DROP DEFAULT;
ALTER TABLE "Payments" ALTER COLUMN "Ref Received By Cash Account" DROP DEFAULT;
ALTER TABLE "Business Expenses" ALTER COLUMN "Ref Paid By Cash Account" DROP DEFAULT;

BEGIN;
CREATE FUNCTION pg_temp.check8(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R008 failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject8(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
  IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'R008 expected rejection: %',expected;
END $$;
SELECT pg_temp.check8(public.default_cash_account('ch:dad')='R008-D1','first account defaults');
UPDATE "Cash Accounts" SET "Default Account"=true WHERE "Row ID"='R008-D2';
SELECT pg_temp.check8(public.default_cash_account('ch:dad')='R008-D2','atomic default replacement');
SELECT pg_temp.check8((SELECT count(*)=1 FROM "Cash Accounts" WHERE "Ref Cash Holder"='ch:dad' AND "Default Account"),'one default');
SELECT pg_temp.reject8($q$UPDATE "Cash Accounts" SET "Active"=false WHERE "Row ID"='R008-D2'$q$,'inactive');
SELECT pg_temp.reject8($q$UPDATE "Cash Accounts" SET "Active"=false,"Default Account"=false WHERE "Row ID"='R008-D2'$q$,'replacement default');
SELECT pg_temp.reject8($q$DELETE FROM "Cash Accounts" WHERE "Row ID"='R008-D2'$q$,'deactivate');
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Preferred Receiving Cash Account") VALUES
 ('R008-B1','Synthetic R008 one','R008-D1'),('R008-B2','Synthetic R008 two','R008-D2'),('R008-B3','Synthetic R008 default',NULL);
SELECT pg_temp.check8(public.receiving_cash_account('R008-B1')='R008-D1' AND public.receiving_cash_account('R008-B2')='R008-D2' AND public.receiving_cash_account('R008-B3')='R008-D2','preference and fallback');
UPDATE "Cash Accounts" SET "Active"=false WHERE "Row ID"='R008-D1';
SELECT pg_temp.check8(public.receiving_cash_account('R008-B1')='R008-D2','inactive preference falls back');
UPDATE "Cash Accounts" SET "Active"=true,"Default Account"=true WHERE "Row ID"='R008-D1';
SELECT pg_temp.check8(public.receiving_cash_account('R008-B3')='R008-D1','changed default without borrower edit');
SELECT pg_temp.check8((SELECT bool_and(NOT "Initialized" AND "Current Balance" IS NULL) FROM "Cash Account Balances"),'uninitialized balances are unknown');
SELECT pg_temp.reject8($q$SELECT initialize_cash_accounts('ch:dad','{"R008-D1":1,"R008-D2":0}','synthetic','bad total')$q$,'sum exactly');
SELECT initialize_cash_accounts('ch:dad','{"R008-D1":0,"R008-D2":0}','synthetic','Approved synthetic zero baseline');
SELECT initialize_cash_accounts('ch:lisa','{"R008-L1":0}','synthetic','Approved synthetic zero baseline');
SELECT initialize_cash_accounts('ch:tommy','{"R008-T1":0}','synthetic','Approved synthetic zero baseline');
SELECT pg_temp.reject8($q$UPDATE r008_cash_account_cutover SET "Opening Balance"=1$q$,'immutable');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('R008-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('R008-CAPITAL','R008-A',current_date,'Contribution',10000::money);
SELECT pg_temp.reject8($q$INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Auto Charge Enabled") VALUES('R008-BAD','R008-B1',current_date,100::money,false)$q$,'cash account is required');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account") VALUES
 ('R008-LA','R008-B1',current_date-2,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,'R008-L1'),
 ('R008-LB','R008-B2',current_date-2,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,'R008-L1'),
 ('R008-LC','R008-B3',current_date-2,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,'R008-L1');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R008-C1','R008-LA',current_date-1,0::money,100::money),('R008-C2','R008-LA',current_date,0::money,50::money),
 ('R008-C3','R008-LB',current_date,0::money,100::money),('R008-C4','R008-LC',current_date,0::money,100::money);
UPDATE "Borrowers" SET "Payment Request Cash Account"='R008-D2',"Payment Request Token"=current_date||'|receiveall01' WHERE "Row ID"='R008-B1';
SELECT pg_temp.check8((SELECT count(*)=1 AND sum("Amount Received"::numeric)=150 AND bool_and("Status"='Posted' AND "Ref Received By Cash Account"='R008-D2' AND "Ref Received By Cash Holder"='ch:dad') FROM "Payments" WHERE "Ref Borrower"='R008-B1'),'Receive All SQL exact amount/account/holder');
SELECT pg_temp.check8(EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='r008:Borrowers|7:R008-B1|'||current_date||'|receiveall01'),'exact AppSheet notification receipt lookup');
UPDATE "Borrowers" SET "Payment Request Token"=current_date||'|receiveall01' WHERE "Row ID"='R008-B1';
SELECT pg_temp.check8((SELECT count(*)=1 FROM "Payments" WHERE "Ref Borrower"='R008-B1'),'same token retry');
SELECT pg_temp.reject8($q$UPDATE "Borrowers" SET "Payment Request Token"=current_date||'|receiveall02' WHERE "Row ID"='R008-B1'$q$,'No eligible balance');
SELECT pg_temp.reject8($q$UPDATE "Borrowers" SET "Payment Request Token"=(current_date-1)||'|receiveall03' WHERE "Row ID"='R008-B1'$q$,'stale');
UPDATE "Charges" SET "Payment Request Cash Account"='R008-D1',"Payment Request Token"=current_date||'|singlefull01' WHERE "Row ID"='R008-C3';
SELECT pg_temp.check8((SELECT "Amount Received"::numeric=100 AND "Ref Received By Cash Account"='R008-D1' FROM "Payments" WHERE "Ref Borrower"='R008-B2'),'Single Full exact amount');
SELECT pg_temp.reject8($q$INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge") VALUES('R008-BAD','Processing','R008-B3',10::money,current_date,'Single Partial','R008-C4')$q$,'cash account is required');
SELECT pg_temp.reject8($q$INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account","Ref Received By Cash Holder") VALUES('R008-BAD','Processing','R008-B3',10::money,current_date,'Single Partial','R008-C4','R008-D1','ch:lisa')$q$,'disagree');
INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES('R008-PART','Processing','R008-B3',30::money,current_date,'Single Partial','R008-C4','R008-D2');
INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account") VALUES('R008-LUMP','Processing','R008-B3',20::money,current_date,'Lump Sum','R008-D1');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.check8((SELECT "Amount Remaining"::numeric=50 FROM "Charges" WHERE "Row ID"='R008-C4'),'partial and lump sum unchanged');
SELECT pg_temp.reject8($q$UPDATE "Payments" SET "Ref Received By Cash Account"='R008-D1' WHERE "Row ID"='R008-PART'$q$,'audit note');
UPDATE "Payments" SET "Ref Received By Cash Account"='R008-D1',"Notes"='Synthetic correction from D2 to D1' WHERE "Row ID"='R008-PART';
SELECT pg_temp.check8((SELECT count(*)=1 AND sum("Amount")=30 AND bool_and("Ref To Cash Account"='R008-D1') FROM "Cash Ledger" WHERE "Ref Payment"='R008-PART'),'custody correction changes one ledger');
SELECT pg_temp.check8((SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=30 FROM "Repayments" WHERE "Ref Payment"='R008-PART'),'custody correction does not repost');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R008-LC';
UPDATE "Loans" SET "Payment Request Cash Account"='R008-D2',"Payment Request Token"=current_date||'|loanclose01' WHERE "Row ID"='R008-LC';
SELECT pg_temp.check8((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment" IS NOT NULL FROM "Loans" WHERE "Row ID"='R008-LC'),'atomic Loan Close');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account") VALUES('R008-AUTO','R008-B1',current_date,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',true,10::money,'R008-L1');
SELECT pg_temp.check8((SELECT "Ref Received By Cash Account"='R008-L1' AND "Ref Received By Cash Holder"='ch:lisa' FROM "Payments" WHERE "Row ID"='fd6:fd6:R008-AUTO'),'first-day inherits disbursement');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account") VALUES('R008-EXP',current_date,'Other',10::money,'R008-T1');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Notes") VALUES('R008-ADJUST',current_date,'Other',(-1)::money,'Synthetic accounting-only adjustment');
SELECT pg_temp.check8(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Business Expense"='R008-ADJUST'),'accounting-only no cash');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account") VALUES
 ('R008-TRANSFER',current_date,'Cash Handover',25,'ch:dad','ch:dad','R008-D1','R008-D2'),
 ('R008-HANDOVER',current_date,'Cash Handover',20,'ch:dad','ch:lisa','R008-D2','R008-L1'),
 ('R008-REIMBURSE',current_date,'Expense Reimbursement',10,'ch:lisa','ch:tommy','R008-L1','R008-T1');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Transfer Date","Ref Paid From Cash Account","Notes") VALUES('R008-S','R008-A',10::money,'Completed',current_date,current_date,'R008-L1','Synthetic original');
UPDATE "Cash Accounts" SET "Active"=false,"Default Account"=false WHERE "Row ID"='R008-L1';
UPDATE "Settlements" SET "Status"='Cancelled',"Notes"='Synthetic original | reversed' WHERE "Row ID"='R008-S';
SELECT pg_temp.check8(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Settlement"='R008-S'),'reversal removes original inactive account outflow');
SELECT pg_temp.check8(NOT EXISTS(SELECT 1 FROM "Cash Holder Balances" h LEFT JOIN (SELECT "Ref Cash Holder",sum("Current Balance") b FROM "Cash Account Balances" GROUP BY "Ref Cash Holder") a USING("Ref Cash Holder") WHERE h."Current Balance" IS DISTINCT FROM a.b),'account/holder totals reconcile');
SELECT 'R008 account and six-method integration tests passed' result;
ROLLBACK;
