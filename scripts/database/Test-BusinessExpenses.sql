\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
CREATE FUNCTION pg_temp.exp_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Expense test failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.exp_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('EX15-A','A'),('EX15-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('EX15-CA','EX15-A',current_date-20,'Contribution',60000::money),('EX15-CB','EX15-B',current_date-20,'Contribution',40000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('EX15-REF','SYNTHETIC REFERRER'),('EX15-OTHER','SYNTHETIC OTHER'),('EX15-NONE','SYNTHETIC NO REFERRER');
INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('EX15-B','SYNTHETIC REFERRED','EX15-REF');
SELECT pg_temp.exp_reject($q$UPDATE "Borrowers" SET "Ref Referrer"="Row ID" WHERE "Row ID"='EX15-B'$q$,'borrower_not_own_referrer');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 SELECT 'EX15-'||n,CASE WHEN n='NONE' THEN 'EX15-NONE' ELSE 'EX15-B' END,current_date-5,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false
 FROM unnest(ARRAY['NORMAL','CAP','NONE','ZERO','DEFAULT','PARTIAL']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT 'EX15-C-'||n,'EX15-'||n,current_date,10000::money,(CASE WHEN n='CAP' THEN 15000 WHEN n='ZERO' THEN 0 ELSE 6600 END)::money
 FROM unnest(ARRAY['NORMAL','CAP','NONE','ZERO','DEFAULT','PARTIAL']) n;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['NORMAL','CAP','NONE','ZERO'] LOOP
 INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('EX15-P-'||n,CASE WHEN n='NONE' THEN 'EX15-NONE' ELSE 'EX15-B' END,'EX15-C-'||n,current_date,
 (CASE WHEN n='CAP' THEN 25000 WHEN n='ZERO' THEN 10000 ELSE 16600 END)::money,'Single Full','Processing');
END LOOP; END $$;
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status")
 VALUES('EX15-P-PARTIAL','EX15-B','EX15-C-PARTIAL',current_date,7000::money,'Single Partial','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='EX15-DEFAULT';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid',"Loan Status"='ปิดยอดแล้ว' WHERE "Row ID"='EX15-DEFAULT';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.exp_assert((SELECT count(*)=2 FROM "Business Expenses"),'only normal and cap eligible');
SELECT pg_temp.exp_assert((SELECT bool_and("Expense Category"='Referral Rebate / เงินคืนค่าแนะนำลูกค้า' AND "Source Type"='Referral Rebate') FROM "Business Expenses"),'R004 bilingual category and stable source');
SELECT pg_temp.exp_assert((SELECT "Amount"::numeric=660 AND "Partner A Expense"::numeric=396 AND "Partner B Expense"::numeric=264
 AND "Ref Payee Borrower"='EX15-REF' AND "Ref Related Borrower"='EX15-B' AND "Gross Profit Basis"::numeric=6600
 FROM "Business Expenses" WHERE "Ref Related Loan"='EX15-NORMAL'),'normal 660 and 396/264');
SELECT pg_temp.exp_assert((SELECT "Amount"::numeric=1000 AND "Partner A Expense"::numeric=600 AND "Partner B Expense"::numeric=400 FROM "Business Expenses" WHERE "Ref Related Loan"='EX15-CAP'),'cap 1000 and 600/400');
UPDATE "Payments" SET "Status"='Processing' WHERE "Row ID"='EX15-P-NORMAL';
UPDATE "Loans" SET "Loan Status"='ยังไม่ปิดยอด' WHERE "Row ID"='EX15-NORMAL';
UPDATE "Loans" SET "Loan Status"='ปิดยอดแล้ว' WHERE "Row ID"='EX15-NORMAL';
SELECT pg_temp.exp_assert((SELECT count(*)=2 FROM "Business Expenses"),'retry/reclose idempotent');
UPDATE "Borrowers" SET "Ref Referrer"='EX15-OTHER' WHERE "Row ID"='EX15-B';
SELECT pg_temp.exp_assert((SELECT bool_and("Ref Payee Borrower"='EX15-REF') FROM "Business Expenses"),'referrer identity retained');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Cash Pool Contributions" SET "Amount"=55000::money WHERE "Row ID"='EX15-CA';
UPDATE "Cash Pool Contributions" SET "Amount"=45000::money WHERE "Row ID"='EX15-CB';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.exp_assert((SELECT "Amount"::numeric=1000 AND "Partner A Expense"::numeric=550 AND "Partner B Expense"::numeric=450 FROM "Business Expenses" WHERE "Ref Related Loan"='EX15-CAP'),'historical 55/45 correction');
SELECT pg_temp.exp_reject($q$UPDATE "Business Expenses" SET "Amount"=1::money WHERE "Ref Related Loan"='EX15-CAP'$q$,'system-managed');
SELECT pg_temp.exp_reject($q$DELETE FROM "Business Expenses" WHERE "Ref Related Loan"='EX15-CAP'$q$,'retained');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Cash Pool Contributions" SET "Amount"=60000::money WHERE "Row ID"='EX15-CA';
UPDATE "Cash Pool Contributions" SET "Amount"=40000::money WHERE "Row ID"='EX15-CB';
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Created By")
 VALUES('EX15-M',current_date-2,'Transportation',500::money,'synthetic@example.invalid');
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=300 AND "Partner B Expense"::numeric=200 FROM "Business Expenses" WHERE "Row ID"='EX15-M'),'manual 300/200');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Cash Pool Contributions" SET "Amount"=70000::money WHERE "Row ID"='EX15-CA';
UPDATE "Cash Pool Contributions" SET "Amount"=30000::money WHERE "Row ID"='EX15-CB';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=350 AND "Partner B Expense"::numeric=150 FROM "Business Expenses" WHERE "Row ID"='EX15-M'),'manual correction 350/150');
SELECT pg_temp.exp_reject($q$INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount") VALUES('EX15-BAD',current_date-30,'Other',500::money)$q$,'positive A/B contribution pool');
UPDATE "Business Expenses" SET "Amount"=501::money,"Partner A Expense"=999::money WHERE "Row ID"='EX15-M';
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=351 AND "Partner B Expense"::numeric=150 FROM "Business Expenses" WHERE "Row ID"='EX15-M'),'whole baht and forged cache replaced');
-- Price(0) in the current GUI rounds each repayment's partner profit before SUM.
DO $$ DECLARE a numeric:=public.partner_net_profit('EX15-A'); b numeric:=public.partner_net_profit('EX15-B'); BEGIN
 INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES('EX15-ROUND','EX15-NONE',current_date,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
 INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('EX15-C-ROUND','EX15-ROUND',current_date,10000::money,1::money);
 INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES('EX15-P-ROUND','EX15-NONE','EX15-C-ROUND',current_date,10001::money,'Single Full','Processing');
 PERFORM pg_temp.exp_assert(public.partner_net_profit('EX15-A')-a=1 AND public.partner_net_profit('EX15-B')-b=0,'Price(0) rounds each repayment partner profit');
END $$;
SELECT public.refresh_daily_analytics(current_date-5,current_date);
SELECT pg_temp.exp_assert(NOT EXISTS(SELECT 1 FROM "Daily Analytics" d WHERE "Net Profit" IS DISTINCT FROM "Interest Received"-"Business Expenses"
 OR "Net Unsettled Profit EOD" IS DISTINCT FROM "Unsettled Profit EOD"-coalesce((SELECT sum("Amount") FROM "Business Expenses" e WHERE e."Expense Date"<=d."Snapshot Date"),0::money)),'daily net reconciliation');
-- Reserve all except 1000, then prove pending reservation and exact remaining limit.
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date")
 VALUES('EX15-S1','EX15-A',(public.partner_net_profit('EX15-A')-1000)::money,'Pending',current_date);
SELECT pg_temp.exp_reject($q$INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status") VALUES('EX15-BAD','EX15-A',1200::money,'Pending')$q$,'exceeds net');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status") VALUES('EX15-S2','EX15-A',1000::money,'Pending');
SELECT pg_temp.exp_reject($q$INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status") VALUES('EX15-BAD','EX15-A',1::money,'Pending')$q$,'exceeds net');
UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='EX15-S2';
SELECT pg_temp.exp_assert((SELECT bool_and("Partner A Expense"+"Partner B Expense"="Amount") FROM "Business Expenses"),'expense conservation');
SELECT 'Business expense regression passed' AS result;
ROLLBACK;
