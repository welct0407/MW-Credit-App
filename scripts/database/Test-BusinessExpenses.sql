\set ON_ERROR_STOP on
\ir Test-CashAccountFixtures.sql
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
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
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account")
 SELECT 'EX15-'||n,CASE WHEN n='NONE' THEN 'EX15-NONE' ELSE 'EX15-B' END,current_date-5,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'CI-LISA'
 FROM unnest(ARRAY['NORMAL','CAP','NONE','ZERO','DEFAULT','PARTIAL']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT 'EX15-C-'||n,'EX15-'||n,current_date,10000::money,(CASE WHEN n='CAP' THEN 15000 WHEN n='ZERO' THEN 0 ELSE 6600 END)::money
 FROM unnest(ARRAY['NORMAL','CAP','NONE','ZERO','DEFAULT','PARTIAL']) n;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['NORMAL','CAP','NONE','ZERO'] LOOP
 INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status","Ref Received By Cash Account")
 VALUES('EX15-P-'||n,CASE WHEN n='NONE' THEN 'EX15-NONE' ELSE 'EX15-B' END,'EX15-C-'||n,current_date,
 (CASE WHEN n='CAP' THEN 25000 WHEN n='ZERO' THEN 10000 ELSE 16600 END)::money,'Single Full','Processing','CI-LISA');
END LOOP; END $$;
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status","Ref Received By Cash Account")
 VALUES('EX15-P-PARTIAL','EX15-B','EX15-C-PARTIAL',current_date,7000::money,'Single Partial','Processing','CI-LISA');
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
SELECT pg_temp.exp_reject($q$DELETE FROM "Business Expenses" WHERE "Ref Related Loan"='EX15-CAP'$q$,'follows its loan/receipt');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Cash Pool Contributions" SET "Amount"=60000::money WHERE "Row ID"='EX15-CA';
UPDATE "Cash Pool Contributions" SET "Amount"=40000::money WHERE "Row ID"='EX15-CB';
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Created By","Ref Paid By Cash Account")
 VALUES('EX15-M',current_date-2,'Transportation',500::money,'synthetic@example.invalid','CI-LISA');
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=300 AND "Partner B Expense"::numeric=200 FROM "Business Expenses" WHERE "Row ID"='EX15-M'),'manual 300/200');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Cash Pool Contributions" SET "Amount"=70000::money WHERE "Row ID"='EX15-CA';
UPDATE "Cash Pool Contributions" SET "Amount"=30000::money WHERE "Row ID"='EX15-CB';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=350 AND "Partner B Expense"::numeric=150 FROM "Business Expenses" WHERE "Row ID"='EX15-M'),'manual correction 350/150');
-- R140 V144: a date before the first contribution uses the earliest valid A/B pool (70/30 here) instead of refusing.
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account") VALUES('EX15-EARLY',current_date-30,'Other',500::money,'CI-LISA');
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=350 AND "Partner B Expense"::numeric=150 FROM "Business Expenses" WHERE "Row ID"='EX15-EARLY'),'R140 V144 before the first contribution: the earliest pool');
DELETE FROM "Business Expenses" WHERE "Row ID"='EX15-EARLY';
UPDATE "Business Expenses" SET "Amount"=501::money,"Partner A Expense"=999::money WHERE "Row ID"='EX15-M';
SELECT pg_temp.exp_assert((SELECT "Partner A Expense"::numeric=351 AND "Partner B Expense"::numeric=150 FROM "Business Expenses" WHERE "Row ID"='EX15-M'),'whole baht and forged cache replaced');
-- Price(0) in the current GUI rounds each repayment's partner profit before SUM.
DO $$ DECLARE a numeric:=public.partner_net_profit('EX15-A'); b numeric:=public.partner_net_profit('EX15-B'); BEGIN
 INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account") VALUES('EX15-ROUND','EX15-NONE',current_date,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'CI-LISA');
 INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('EX15-C-ROUND','EX15-ROUND',current_date,10000::money,1::money);
 INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status","Ref Received By Cash Account") VALUES('EX15-P-ROUND','EX15-NONE','EX15-C-ROUND',current_date,10001::money,'Single Full','Processing','CI-LISA');
 PERFORM pg_temp.exp_assert(public.partner_net_profit('EX15-A')-a=1 AND public.partner_net_profit('EX15-B')-b=0,'Price(0) rounds each repayment partner profit');
END $$;
SELECT public.refresh_daily_analytics(current_date-5,current_date);
SELECT pg_temp.exp_assert(NOT EXISTS(SELECT 1 FROM "Daily Analytics" d WHERE "Net Profit" IS DISTINCT FROM "Interest Received"-"Business Expenses"
 OR "Net Unsettled Profit EOD" IS DISTINCT FROM "Unsettled Profit EOD"-coalesce((SELECT sum("Amount") FROM "Business Expenses" e WHERE e."Expense Date"<=d."Snapshot Date"),0::money)),'daily net reconciliation');
-- Reserve all except 1000, then prove pending reservation and exact remaining limit.
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Ref Paid From Cash Account")
 VALUES('EX15-S1','EX15-A',(public.partner_net_profit('EX15-A')-1000)::money,'Pending',current_date,'CI-LISA');
SELECT pg_temp.exp_reject($q$INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Ref Paid From Cash Account") VALUES('EX15-BAD','EX15-A',1200::money,'Pending','CI-LISA')$q$,'exceeds net');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Ref Paid From Cash Account") VALUES('EX15-S2','EX15-A',1000::money,'Pending','CI-LISA');
SELECT pg_temp.exp_reject($q$INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Ref Paid From Cash Account") VALUES('EX15-BAD','EX15-A',1::money,'Pending','CI-LISA')$q$,'exceeds net');
UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='EX15-S2';
SELECT pg_temp.exp_assert((SELECT bool_and("Partner A Expense"+"Partner B Expense"="Amount") FROM "Business Expenses"),'expense conservation');
-- R140 V142: an automatic referral rebate keeps its fixed payer (Lisa); only Manual rows may be pending payment.
SELECT pg_temp.exp_assert((SELECT bool_and("Ref Paid By Cash Holder"='ch:lisa') FROM "Business Expenses" WHERE "Source Type"='Referral Rebate'),'R140 referral rebates keep Lisa as payer');
SELECT pg_temp.exp_reject($q$UPDATE "Business Expenses" SET "Ref Paid By Cash Holder"=NULL,"Ref Paid By Cash Account"=NULL WHERE "Ref Related Loan"='EX15-CAP'$q$,'A cash account is required');
-- R140 V143: a payee borrower on an expense.update of a referral rebate is the existing P5B05 (Manual rows only).
INSERT INTO "Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('EX15-ACT','Synthetic expense actor','A','ex15-actor@example.invalid');
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
SELECT set_config('ex.rebate_payee','{"contractVersion":2,"requestId":"b1430000-0000-4000-8000-0000000000e1","actor":{"issuer":"https://ex.invalid","subject":"ex-owner","partnerId":"EX15-ACT","loginEmail":"ex15-actor@example.invalid"},'
 ||'"command":{"schemaVersion":1,"operation":"expense.update","targetType":"expense","targetId":'||to_json(x."Row ID")::text||',"expectedVersion":'||to_json(public.pwa_expense_version_v2(x."Row ID"))::text
 ||',"predecessorRequestId":null,"inputs":{"expenseDate":'||to_json(x."Expense Date"::text)::text||',"category":'||to_json(x."Expense Category")::text||',"amount":"660","payeeName":null,"relatedBorrowerId":null,"relatedLoanId":null,"notes":null,"paidByAccountId":null,"payeeBorrowerId":"EX15-OTHER"}},"receipt":null}',true)
 FROM "Business Expenses" x WHERE x."Ref Related Loan"='EX15-NORMAL';
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('ex.out_rebate_payee',public.pwa_submit_operation_v2(current_setting('ex.rebate_payee'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.exp_assert(current_setting('ex.out_rebate_payee')::jsonb#>>'{originalOutcome,code}'='dependency_conflict','R140 V143 a referral rebate takes no payee borrower (P5B05)');
SELECT pg_temp.exp_assert((SELECT "Ref Payee Borrower"='EX15-REF' FROM "Business Expenses" WHERE "Ref Related Loan"='EX15-NORMAL'),'R140 V143 the rebate keeps its payee');
-- R140 V144: a referral rebate never carries a paid date.
SELECT pg_temp.exp_reject($q$UPDATE "Business Expenses" SET "Paid Date"=current_date WHERE "Ref Related Loan"='EX15-CAP'$q$,'system-managed');
SELECT 'Business expense regression passed' AS result;
ROLLBACK;

-- R140 V142: a manual expense pending payment through the governed command (expense.create and expense.update as the DEV
-- command IAM user; setup and checks as postgres; synthetic rows; everything rolls back). Pending: Manual, Amount > 0, no
-- payer holder or account, not a cutover source (Test-OpeningIncludedCrud.sql keeps the cutover fill).
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.pe_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Pending expense test failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.pe_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
CREATE TEMP TABLE pe_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON pe_day TO PUBLIC;
-- Lisa has a default account, so an edit that filled one in (the V61 opening fill) would pay the pending row: it must not.
UPDATE public."Cash Accounts" SET "Default Account"=true WHERE "Row ID"='CI-LISA' AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"='ch:lisa' AND "Default Account" AND "Row ID"<>'CI-LISA');
INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES('PE-TOMMY','ch:tommy','Synthetic Tommy','Synthetic');
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PE-A','A'),('PE-B','B');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('PE-ACT','Synthetic expense actor','A','pe-actor@example.invalid','English');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('PE-CA','PE-A',(SELECT d FROM pe_day)-30,'Contribution',60000::money),('PE-CB','PE-B',(SELECT d FROM pe_day)-30,'Contribution',40000::money);
-- Operator grants, emulated and rolled back (Test-RebateSettlement.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
-- The canonical expense command (operation-command.mjs key order); version NULL for a create, account NULL for pending.
CREATE FUNCTION pg_temp.pe_cmd(request text,op text,target text,day date,amount text,account text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://pe.invalid","subject":"pe-owner","partnerId":"PE-ACT","loginEmail":"pe-actor@example.invalid"},'
  ||'"command":{"schemaVersion":1,"operation":'||to_json(op)::text||',"targetType":"expense","targetId":'||to_json(target)::text
  ||',"expectedVersion":'||CASE WHEN op='expense.create' THEN 'null' ELSE coalesce(to_json(public.pwa_expense_version_v2(target))::text,'null') END
  ||',"predecessorRequestId":null,"inputs":{"expenseDate":'||to_json(to_char(day,'YYYY-MM-DD'))::text||',"category":"Other / อื่น ๆ","amount":'||to_json(amount)::text
  ||',"payeeName":"Synthetic payee","relatedBorrowerId":null,"relatedLoanId":null,"notes":null,"paidByAccountId":'||coalesce(to_json(account)::text,'null')||'}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.pe_status(name text) RETURNS text LANGUAGE sql AS $f$ SELECT current_setting('pe.out_'||name)::jsonb#>>'{originalOutcome,status}' $f$;
CREATE FUNCTION pg_temp.pe_code(name text) RETURNS text LANGUAGE sql AS $f$ SELECT current_setting('pe.out_'||name)::jsonb#>>'{originalOutcome,code}' $f$;
CREATE FUNCTION pg_temp.pe_ledger(id text) RETURNS bigint LANGUAGE sql AS $f$ SELECT count(*) FROM public."Cash Ledger" WHERE "Ref Business Expense"=id $f$;
CREATE FUNCTION pg_temp.pe_pending(id text) RETURNS boolean LANGUAGE sql AS $f$
 SELECT "Source Type"='Manual' AND "Amount"::numeric>0 AND "Ref Paid By Cash Holder" IS NULL AND "Ref Paid By Cash Account" IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id="Row ID") FROM public."Business Expenses" WHERE "Row ID"=id $f$;

-- 1. Create pending: applied, no payer, no cash row, the Partner split computed (60/40); a replay returns the same outcome.
SELECT set_config('pe.create',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000001','expense.create','c1400000-0000-4000-8000-000000000001',(SELECT d FROM pe_day)-1,'500',NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pe.out_create',public.pwa_submit_operation_v2(current_setting('pe.create'))::text,false);
 PERFORM set_config('pe.out_replay',public.pwa_submit_operation_v2(current_setting('pe.create'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_status('create')='applied','1: pending create applied');
SELECT pg_temp.pe_assert(current_setting('pe.out_replay')::jsonb->'originalOutcome'=current_setting('pe.out_create')::jsonb->'originalOutcome','1: replay returns the recorded outcome');
SELECT pg_temp.pe_assert(pg_temp.pe_pending('c1400000-0000-4000-8000-000000000001'),'1: the row is pending');
SELECT pg_temp.pe_assert(pg_temp.pe_ledger('c1400000-0000-4000-8000-000000000001')=0,'1: no cash row');
SELECT pg_temp.pe_assert((SELECT "Partner A Expense"::numeric=300 AND "Partner B Expense"::numeric=200 AND "Source Type"='Manual' FROM "Business Expenses" WHERE "Row ID"='c1400000-0000-4000-8000-000000000001'),'1: Partner split 300/200');
SELECT pg_temp.pe_assert((SELECT count(*)=1 FROM "Business Expenses" WHERE "Row ID"='c1400000-0000-4000-8000-000000000001'),'1: one row after the replay');

-- 2. Edit amount and date while pending: still pending, no cash row (Lisa's default account is not filled in).
SELECT set_config('pe.edit',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000002','expense.update','c1400000-0000-4000-8000-000000000001',(SELECT d FROM pe_day)-2,'700',NULL),true);
-- 3. The version of before the edit, used again after it: stale.
SELECT set_config('pe.stale',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000003','expense.update','c1400000-0000-4000-8000-000000000001',(SELECT d FROM pe_day)-2,'800',NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pe.out_edit',public.pwa_submit_operation_v2(current_setting('pe.edit'))::text,false);
 PERFORM set_config('pe.out_stale',public.pwa_submit_operation_v2(current_setting('pe.stale'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_status('edit')='applied','2: pending edit applied');
SELECT pg_temp.pe_assert(pg_temp.pe_pending('c1400000-0000-4000-8000-000000000001'),'2: still pending after the edit');
SELECT pg_temp.pe_assert((SELECT "Amount"::numeric=700 AND "Expense Date"=(SELECT d FROM pe_day)-2 AND "Partner A Expense"::numeric=420 FROM "Business Expenses" WHERE "Row ID"='c1400000-0000-4000-8000-000000000001'),'2: amount, date and split changed');
SELECT pg_temp.pe_assert(pg_temp.pe_ledger('c1400000-0000-4000-8000-000000000001')=0,'2: no cash row');
SELECT pg_temp.pe_assert(pg_temp.pe_status('stale')='rejected' AND pg_temp.pe_code('stale')='source_conflict','3: stale version (P5B01)');

-- 4. An unknown account is still refused (P5B07); 5. paying it: one System cash row from the chosen account on the Expense Date.
SELECT set_config('pe.bad',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000004','expense.update','c1400000-0000-4000-8000-000000000001',(SELECT d FROM pe_day)-2,'700','PE-NOPE'),true),
 set_config('pe.badnew',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000005','expense.create','c1400000-0000-4000-8000-000000000005',(SELECT d FROM pe_day),'10','PE-NOPE'),true),
 set_config('pe.pay',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000006','expense.update','c1400000-0000-4000-8000-000000000001',(SELECT d FROM pe_day)-2,'700','CI-DAD'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pe.out_bad',public.pwa_submit_operation_v2(current_setting('pe.bad'))::text,false);
 PERFORM set_config('pe.out_badnew',public.pwa_submit_operation_v2(current_setting('pe.badnew'))::text,false);
 PERFORM set_config('pe.out_pay',public.pwa_submit_operation_v2(current_setting('pe.pay'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_status('bad')='rejected' AND pg_temp.pe_code('bad')='account_unavailable','4: unknown account on update (P5B07)');
SELECT pg_temp.pe_assert(pg_temp.pe_status('badnew')='rejected' AND pg_temp.pe_code('badnew')='account_unavailable','4: unknown account on create (P5B07)');
SELECT pg_temp.pe_assert(pg_temp.pe_status('pay')='applied','5: pay applied');
SELECT pg_temp.pe_assert(NOT pg_temp.pe_pending('c1400000-0000-4000-8000-000000000001') AND (SELECT "Ref Paid By Cash Holder"='ch:dad' AND "Ref Paid By Cash Account"='CI-DAD' FROM "Business Expenses" WHERE "Row ID"='c1400000-0000-4000-8000-000000000001'),'5: paid by Dad');
SELECT pg_temp.pe_assert((SELECT count(*)=1 AND bool_and("Entry Origin"='System' AND "Source Key"='EXPENSE:c1400000-0000-4000-8000-000000000001' AND "Movement Type"='Business Expense' AND "Amount"=700
  AND "Movement Date"=(SELECT d FROM pe_day)-2 AND "Ref From Cash Account"='CI-DAD' AND "Ref From Cash Holder"='ch:dad' AND "Ref To Cash Account" IS NULL)
 FROM "Cash Ledger" WHERE "Ref Business Expense"='c1400000-0000-4000-8000-000000000001'),'5: one System cash row from CI-DAD on the expense date');

-- 6. Paid back to pending: the System cash row goes.
SELECT set_config('pe.unpay',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000007','expense.update','c1400000-0000-4000-8000-000000000001',(SELECT d FROM pe_day)-2,'700',NULL),true);
-- 7. A Tommy-paid expense with a linked reimbursement cannot go back to pending (the existing P5B05).
SELECT set_config('pe.tommy',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000008','expense.create','c1400000-0000-4000-8000-000000000008',(SELECT d FROM pe_day)-1,'50','PE-TOMMY'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pe.out_unpay',public.pwa_submit_operation_v2(current_setting('pe.unpay'))::text,false);
 PERFORM set_config('pe.out_tommy',public.pwa_submit_operation_v2(current_setting('pe.tommy'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_status('unpay')='applied','6: back to pending applied');
SELECT pg_temp.pe_assert(pg_temp.pe_pending('c1400000-0000-4000-8000-000000000001') AND pg_temp.pe_ledger('c1400000-0000-4000-8000-000000000001')=0,'6: pending again, the cash row removed');
SELECT pg_temp.pe_assert(pg_temp.pe_status('tommy')='applied' AND pg_temp.pe_ledger('c1400000-0000-4000-8000-000000000008')=1,'7: Tommy-paid expense applied');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense")
 VALUES('PE-REIM',(SELECT d FROM pe_day),'Expense Reimbursement',20,'ch:lisa','ch:tommy','CI-LISA','PE-TOMMY','c1400000-0000-4000-8000-000000000008');
SELECT set_config('pe.tommy_unpay',pg_temp.pe_cmd('b1400000-0000-4000-8000-000000000009','expense.update','c1400000-0000-4000-8000-000000000008',(SELECT d FROM pe_day)-1,'50',NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pe.out_tommy_unpay',public.pwa_submit_operation_v2(current_setting('pe.tommy_unpay'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_status('tommy_unpay')='rejected' AND pg_temp.pe_code('tommy_unpay')='dependency_conflict','7: reimbursed Tommy expense to pending (P5B05)');
SELECT pg_temp.pe_assert((SELECT "Ref Paid By Cash Account"='PE-TOMMY' FROM "Business Expenses" WHERE "Row ID"='c1400000-0000-4000-8000-000000000008'),'7: unchanged');

-- 8. The guards directly: a holder without an account is still refused; a negative adjustment needs no payer; a pending row
-- edited by SQL stays pending; the explicit payer rule still binds non-Manual rows (a referral rebate keeps Lisa, section 1).
SELECT pg_temp.pe_reject($q$INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Holder") VALUES('PE-HOLDER',current_date,'Other',10::money,'ch:dad')$q$,'A cash account is required');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Notes") VALUES('PE-NEG',current_date,'Other',(-10)::money,'Synthetic adjustment');
SELECT pg_temp.pe_assert(NOT pg_temp.pe_pending('PE-NEG') AND pg_temp.pe_ledger('PE-NEG')=0,'8: a negative adjustment is never pending and moves no cash');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount") VALUES('PE-SQL',current_date,'Other',10::money);
UPDATE "Business Expenses" SET "Amount"=12::money,"Expense Date"=current_date-1 WHERE "Row ID"='PE-SQL';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_pending('PE-SQL') AND pg_temp.pe_ledger('PE-SQL')=0,'8: a pending row edited by SQL stays pending');
UPDATE "Business Expenses" SET "Ref Paid By Cash Account"='CI-LISA' WHERE "Row ID"='PE-SQL';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert((SELECT "Ref Paid By Cash Holder"='ch:lisa' FROM "Business Expenses" WHERE "Row ID"='PE-SQL') AND pg_temp.pe_ledger('PE-SQL')=1,'8: setting the account derives the holder and moves cash');
SELECT pg_temp.pe_reject($q$UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=NULL WHERE "Row ID"='PE-SQL'$q$,'A cash account is required');

-- R140 V143: the payee borrower (optional last input payeeBorrowerId). The 9-key command; payee 'absent' leaves the key out.
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description") VALUES('PE-BOR','SYNTHETIC PE PAYEE','Payee');
CREATE FUNCTION pg_temp.pe_cmdp(request text,op text,target text,amount text,payee_name text,payee text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://pe.invalid","subject":"pe-owner","partnerId":"PE-ACT","loginEmail":"pe-actor@example.invalid"},'
  ||'"command":{"schemaVersion":1,"operation":'||to_json(op)::text||',"targetType":"expense","targetId":'||to_json(target)::text
  ||',"expectedVersion":'||CASE WHEN op='expense.create' THEN 'null' ELSE coalesce(to_json(public.pwa_expense_version_v2(target))::text,'null') END
  ||',"predecessorRequestId":null,"inputs":{"expenseDate":'||to_json(to_char((SELECT d FROM pe_day)-1,'YYYY-MM-DD'))::text||',"category":"Other / อื่น ๆ","amount":'||to_json(amount)::text
  ||',"payeeName":'||coalesce(to_json(payee_name)::text,'null')||',"relatedBorrowerId":null,"relatedLoanId":null,"notes":null,"paidByAccountId":null'
  ||CASE WHEN payee='absent' THEN '' ELSE ',"payeeBorrowerId":'||coalesce(to_json(payee)::text,'null') END||'}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.pe_payee(id text) RETURNS text LANGUAGE sql AS $f$ SELECT coalesce("Ref Payee Borrower",'-')||'|'||coalesce("Payee Name",'-') FROM "Business Expenses" WHERE "Row ID"=id $f$;
-- 9. Create pending with a borrower payee: the link and the borrower's name as a snapshot; a replay; an unknown borrower;
-- a borrower together with a typed name is not a canonical command.
SELECT set_config('pe.p_create',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000001','expense.create','c1430000-0000-4000-8000-000000000001','90',NULL,'PE-BOR'),true),
 set_config('pe.p_unknown',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000002','expense.create','c1430000-0000-4000-8000-000000000002','90',NULL,'PE-NOBODY'),true),
 set_config('pe.p_both',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000003','expense.create','c1430000-0000-4000-8000-000000000003','90','Typed','PE-BOR'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pe.out_p_create',public.pwa_submit_operation_v2(current_setting('pe.p_create'))::text,false);
 PERFORM set_config('pe.out_p_replay',public.pwa_submit_operation_v2(current_setting('pe.p_create'))::text,false);
 PERFORM set_config('pe.out_p_unknown',public.pwa_submit_operation_v2(current_setting('pe.p_unknown'))::text,false);
 BEGIN PERFORM public.pwa_submit_operation_v2(current_setting('pe.p_both'));PERFORM set_config('pe.out_p_both','accepted',false);
 EXCEPTION WHEN SQLSTATE '22023' THEN PERFORM set_config('pe.out_p_both','invalid',false); END;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_create')='applied','9: create with a payee borrower applied');
SELECT pg_temp.pe_assert(pg_temp.pe_payee('c1430000-0000-4000-8000-000000000001')='PE-BOR|SYNTHETIC PE PAYEE','9: the link and the name snapshot');
SELECT pg_temp.pe_assert(pg_temp.pe_pending('c1430000-0000-4000-8000-000000000001'),'9: pending payment');
SELECT pg_temp.pe_assert(current_setting('pe.out_p_replay')::jsonb->'originalOutcome'=current_setting('pe.out_p_create')::jsonb->'originalOutcome','9: a 9-key replay returns the recorded outcome');
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_unknown')='rejected' AND pg_temp.pe_code('p_unknown')='invalid_reference','9: an unknown payee borrower (P5B04)');
SELECT pg_temp.pe_assert(current_setting('pe.out_p_both')='invalid' AND NOT EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Row ID"='c1430000-0000-4000-8000-000000000003'),'9: a borrower and a typed name is refused');
-- 10. The rebates owed reads ignore a manual expense owed to a borrower.
SELECT pg_temp.pe_assert(public.pwa_rebates_owed_v1('PE-BOR')=0 AND public.pwa_rebate_pending_v1('c1430000-0000-4000-8000-000000000001') IS NULL,'10: rebates owed unchanged');
-- 11. An 8-key edit with the stored name keeps the link; 12. an 8-key edit with another name clears it.
SELECT set_config('pe.p_keep',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000011','expense.update','c1430000-0000-4000-8000-000000000001','95','SYNTHETIC PE PAYEE','absent'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pe.out_p_keep',public.pwa_submit_operation_v2(current_setting('pe.p_keep'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_keep')='applied' AND pg_temp.pe_payee('c1430000-0000-4000-8000-000000000001')='PE-BOR|SYNTHETIC PE PAYEE','11: an 8-key edit keeps the link');
SELECT set_config('pe.p_rename',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000012','expense.update','c1430000-0000-4000-8000-000000000001','95','Dad','absent'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pe.out_p_rename',public.pwa_submit_operation_v2(current_setting('pe.p_rename'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_rename')='applied' AND pg_temp.pe_payee('c1430000-0000-4000-8000-000000000001')='-|Dad','12: an 8-key edit with another name clears the link');
-- 13. Link again (9 keys), then null with a typed name clears it.
SELECT set_config('pe.p_link',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000013','expense.update','c1430000-0000-4000-8000-000000000001','95',NULL,'PE-BOR'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pe.out_p_link',public.pwa_submit_operation_v2(current_setting('pe.p_link'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_link')='applied' AND pg_temp.pe_payee('c1430000-0000-4000-8000-000000000001')='PE-BOR|SYNTHETIC PE PAYEE','13: linked again');
-- 14. Deleting the payee borrower is the clean dependency_conflict (P5B05), not a raw foreign key error.
SELECT set_config('pe.p_delete','{"contractVersion":2,"requestId":"b1430000-0000-4000-8000-000000000014","actor":{"issuer":"https://pe.invalid","subject":"pe-owner","partnerId":"PE-ACT","loginEmail":"pe-actor@example.invalid"},'
 ||'"command":{"schemaVersion":1,"operation":"borrower.delete","targetType":"borrower","targetId":"PE-BOR","expectedVersion":'||to_json(public.pwa_borrower_version_v2('PE-BOR'))::text||',"predecessorRequestId":null,"inputs":{}},"receipt":null}',true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pe.out_p_delete',public.pwa_submit_operation_v2(current_setting('pe.p_delete'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_delete')='rejected' AND pg_temp.pe_code('p_delete')='dependency_conflict' AND EXISTS(SELECT 1 FROM "Borrowers" WHERE "Row ID"='PE-BOR'),'14: a payee borrower cannot be deleted (P5B05)');
SELECT set_config('pe.p_clear',pg_temp.pe_cmdp('b1430000-0000-4000-8000-000000000015','expense.update','c1430000-0000-4000-8000-000000000001','95','Lisa',NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pe.out_p_clear',public.pwa_submit_operation_v2(current_setting('pe.p_clear'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.pe_assert(pg_temp.pe_status('p_clear')='applied' AND pg_temp.pe_payee('c1430000-0000-4000-8000-000000000001')='-|Lisa','13: payeeBorrowerId null with a typed name clears the link');
SELECT 'Pending manual expense regression passed' AS result;
ROLLBACK;

-- R140 V144: the allocation pool (A/B partners only, nearest valid pool) and the paid date of a manual expense, through
-- SQL and the governed commands (the DEV command IAM user); synthetic rows; everything rolls back.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.pd_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'V144 test failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.pd_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
 IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
CREATE TEMP TABLE pd_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON pd_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PD-A','A'),('PD-B','B'),('PD-T','Test');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('PD-ACT','Synthetic V144 actor','A','pd-actor@example.invalid');
-- 1. Pool. With only a non-A/B contribution there is no A/B pool on any date: refused.
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('PD-CT','PD-T',(SELECT d FROM pd_day)-60,'Contribution',99000::money);
SELECT pg_temp.pd_assert(NOT EXISTS(SELECT 1 FROM "Cash Pool Contributions" c JOIN "Partners" p ON p."Row ID"=c."Ref Partner" WHERE p."Partner Role" IN ('A','B')),'1: no A/B contribution in the fixture');
SELECT pg_temp.pd_reject($q$SELECT public.partner_pool_share_at_date(current_date,'A')$q$,'positive A/B contribution pool');
-- A 60/40 pool from day-40; A withdraws everything on day-20 (pool 40000, A 0: valid, 0/100); B withdraws everything on
-- day-10 (pool 0: invalid, falls back to day-20's 0/100); A contributes again on day-5 (A 10000, B 0: 100/0).
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('PD-CA','PD-A',(SELECT d FROM pd_day)-40,'Contribution',60000::money),('PD-CB','PD-B',(SELECT d FROM pd_day)-40,'Contribution',40000::money);
SELECT pg_temp.pd_assert(public.partner_pool_share_at_date((SELECT d FROM pd_day)-30,'A')=0.6,'1: the non-A/B contribution is ignored (60/40)');
SELECT pg_temp.pd_assert(public.partner_pool_share_at_date((SELECT d FROM pd_day)-50,'A')=0.6 AND public.partner_pool_share_at_date((SELECT d FROM pd_day)-50,'B')=0.4,'1: before the first contribution: the earliest pool');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('PD-WA','PD-A',(SELECT d FROM pd_day)-20,'Withdrawal',60000::money),('PD-WB','PD-B',(SELECT d FROM pd_day)-10,'Withdrawal',40000::money),
 ('PD-CA2','PD-A',(SELECT d FROM pd_day)-5,'Contribution',10000::money);
SELECT pg_temp.pd_assert(public.partner_pool_share_at_date((SELECT d FROM pd_day)-15,'A')=0,'1: A withdrew: 0/100');
SELECT pg_temp.pd_assert(public.partner_pool_share_at_date((SELECT d FROM pd_day)-8,'A')=0 AND public.partner_pool_share_at_date((SELECT d FROM pd_day)-8,'B')=1,'1: zero pool falls back to the latest earlier valid pool');
SELECT pg_temp.pd_assert(public.partner_pool_share_at_date((SELECT d FROM pd_day),'A')=1,'1: a later valid pool');
-- The V143 formula on every valid date equals the new one (normal splits unchanged).
SELECT pg_temp.pd_assert(NOT EXISTS(SELECT 1 FROM generate_series((SELECT d FROM pd_day)-45,(SELECT d FROM pd_day),'1 day') g(day) CROSS JOIN LATERAL (
  SELECT sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role" IN ('A','B')) pool,
   coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role"='A'),0) a,
   coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role"='B'),0) b
  FROM "Cash Pool Contributions" c JOIN "Partners" p ON p."Row ID"=c."Ref Partner" WHERE c."Contribution Date"<=g.day::date) o
  WHERE o.pool>0 AND o.a>=0 AND o.b>=0 AND public.partner_pool_share_at_date(g.day::date,'A')<>o.a/o.pool),'1: valid dates keep the V143 share');
-- 2. The contribution command: Partner A or B only (P5B04); A is accepted.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
CREATE FUNCTION pg_temp.pd_actor() RETURNS text LANGUAGE sql AS $f$ SELECT '{"issuer":"https://pd.invalid","subject":"pd-owner","partnerId":"PD-ACT","loginEmail":"pd-actor@example.invalid"}' $f$;
CREATE FUNCTION pg_temp.pd_contribution(request text,target text,partner text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.pd_actor()||',"command":{"schemaVersion":1,"operation":"capital-contribution.create","targetType":"capital-contribution","targetId":'||to_json(target)::text
  ||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{"partnerId":'||to_json(partner)::text||',"contributionDate":'||to_json(to_char((SELECT d FROM pd_day),'YYYY-MM-DD'))::text||',"transactionType":"Contribution","amount":"100","notes":null}},"receipt":null}' $f$;
-- The canonical expense command; payee absent; paid 'absent' leaves the paidDate key out.
CREATE FUNCTION pg_temp.pd_cmd(request text,op text,target text,day date,account text,paid text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.pd_actor()||',"command":{"schemaVersion":1,"operation":'||to_json(op)::text||',"targetType":"expense","targetId":'||to_json(target)::text
  ||',"expectedVersion":'||CASE WHEN op='expense.create' THEN 'null' ELSE coalesce(to_json(public.pwa_expense_version_v2(target))::text,'null') END
  ||',"predecessorRequestId":null,"inputs":{"expenseDate":'||to_json(to_char(day,'YYYY-MM-DD'))::text||',"category":"Other / อื่น ๆ","amount":"70","payeeName":null,"relatedBorrowerId":null,"relatedLoanId":null,"notes":null,"paidByAccountId":'||coalesce(to_json(account)::text,'null')
  ||CASE WHEN paid='absent' THEN '' ELSE ',"paidDate":'||coalesce(to_json(paid)::text,'null') END||'}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.pd_status(name text) RETURNS text LANGUAGE sql AS $f$ SELECT current_setting('pd.out_'||name)::jsonb#>>'{originalOutcome,status}' $f$;
CREATE FUNCTION pg_temp.pd_code(name text) RETURNS text LANGUAGE sql AS $f$ SELECT current_setting('pd.out_'||name)::jsonb#>>'{originalOutcome,code}' $f$;
CREATE FUNCTION pg_temp.pd_cash(id text) RETURNS text LANGUAGE sql AS $f$ SELECT coalesce(string_agg("Movement Date"::text||'|'||"Amount"::numeric::bigint::text||'|'||"Ref From Cash Account",',' ORDER BY "Row ID"),'none') FROM "Cash Ledger" WHERE "Ref Business Expense"=id $f$;
CREATE FUNCTION pg_temp.pd_paid(id text) RETURNS text LANGUAGE sql AS $f$ SELECT coalesce("Paid Date"::text,'null') FROM "Business Expenses" WHERE "Row ID"=id $f$;
SELECT set_config('pd.contrib_t',pg_temp.pd_contribution('b1440000-0000-4000-8000-000000000001','c1440000-0000-4000-8000-000000000001','PD-T'),true),
 set_config('pd.contrib_a',pg_temp.pd_contribution('b1440000-0000-4000-8000-000000000002','c1440000-0000-4000-8000-000000000002','PD-A'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pd.out_contrib_t',public.pwa_submit_operation_v2(current_setting('pd.contrib_t'))::text,false);
 PERFORM set_config('pd.out_contrib_a',public.pwa_submit_operation_v2(current_setting('pd.contrib_a'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_status('contrib_t')='rejected' AND pg_temp.pd_code('contrib_t')='invalid_reference' AND NOT EXISTS(SELECT 1 FROM "Cash Pool Contributions" WHERE "Row ID"='c1440000-0000-4000-8000-000000000001'),'2: a non-A/B partner contribution is refused (P5B04)');
SELECT pg_temp.pd_assert(pg_temp.pd_status('contrib_a')='applied','2: a Partner A contribution is accepted');
-- 3. Paid date. A pending expense (day-3) paid with paidDate day-1: one ledger row on day-1; a paid-now create: the Expense
-- Date; a future paid date: P5B08; a paid date without an account: not a canonical command; an 8-key edit keeps the date;
-- back to pending clears it and removes the row; a direct SQL paid date on a pending row is refused.
SELECT set_config('pd.pending',pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000011','expense.create','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-3,NULL,'absent'),true),
 set_config('pd.now',pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000012','expense.create','c1440000-0000-4000-8000-000000000012',(SELECT d FROM pd_day)-3,'CI-DAD','absent'),true),
 set_config('pd.nodate',pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000013','expense.create','c1440000-0000-4000-8000-000000000013',(SELECT d FROM pd_day)-3,NULL,to_char((SELECT d FROM pd_day),'YYYY-MM-DD')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pd.out_pending',public.pwa_submit_operation_v2(current_setting('pd.pending'))::text,false);
 PERFORM set_config('pd.out_now',public.pwa_submit_operation_v2(current_setting('pd.now'))::text,false);
 BEGIN PERFORM public.pwa_submit_operation_v2(current_setting('pd.nodate'));PERFORM set_config('pd.out_nodate','accepted',false);
 EXCEPTION WHEN SQLSTATE '22023' THEN PERFORM set_config('pd.out_nodate','invalid',false); END;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_status('pending')='applied' AND pg_temp.pd_cash('c1440000-0000-4000-8000-000000000011')='none' AND pg_temp.pd_paid('c1440000-0000-4000-8000-000000000011')='null','3: pending, no cash, no paid date');
SELECT pg_temp.pd_assert(pg_temp.pd_status('now')='applied' AND pg_temp.pd_cash('c1440000-0000-4000-8000-000000000012')=((SELECT d FROM pd_day)-3)::text||'|70|CI-DAD' AND pg_temp.pd_paid('c1440000-0000-4000-8000-000000000012')='null','3: paid now: cash on the Expense Date');
SELECT pg_temp.pd_assert(current_setting('pd.out_nodate')='invalid','3: a paid date without an account is refused');
SELECT pg_temp.pd_reject($q$UPDATE "Business Expenses" SET "Paid Date"=current_date WHERE "Row ID"='c1440000-0000-4000-8000-000000000011'$q$,'A paid date belongs to a paid manual expense');
SELECT set_config('pd.future',pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000014','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-3,'CI-DAD',to_char((SELECT d FROM pd_day)+1,'YYYY-MM-DD')),true),
 set_config('pd.pay',pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000015','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-3,'CI-DAD',to_char((SELECT d FROM pd_day)-1,'YYYY-MM-DD')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('pd.out_future',public.pwa_submit_operation_v2(current_setting('pd.future'))::text,false);
 PERFORM set_config('pd.out_pay',public.pwa_submit_operation_v2(current_setting('pd.pay'))::text,false);
 PERFORM set_config('pd.out_pay_replay',public.pwa_submit_operation_v2(current_setting('pd.pay'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_status('future')='rejected' AND pg_temp.pd_code('future')='invalid_date','3: a future paid date (P5B08)');
SELECT pg_temp.pd_assert(pg_temp.pd_status('pay')='applied' AND pg_temp.pd_paid('c1440000-0000-4000-8000-000000000011')=((SELECT d FROM pd_day)-1)::text
 AND pg_temp.pd_cash('c1440000-0000-4000-8000-000000000011')=((SELECT d FROM pd_day)-1)::text||'|70|CI-DAD','3: paid with a date: the cash on that date');
SELECT pg_temp.pd_assert(current_setting('pd.out_pay_replay')::jsonb->'originalOutcome'=current_setting('pd.out_pay')::jsonb->'originalOutcome','3: a replay returns the recorded outcome');
SELECT set_config('pd.keep',replace(pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000016','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-4,'CI-DAD','absent'),'"notes":null','"notes":"edited"'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pd.out_keep',public.pwa_submit_operation_v2(current_setting('pd.keep'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_status('keep')='applied' AND pg_temp.pd_paid('c1440000-0000-4000-8000-000000000011')=((SELECT d FROM pd_day)-1)::text
 AND pg_temp.pd_cash('c1440000-0000-4000-8000-000000000011')=((SELECT d FROM pd_day)-1)::text||'|70|CI-DAD','3: an 8-key edit (expense date moved) keeps the paid date and its cash day');
SELECT set_config('pd.unpay',pg_temp.pd_cmd('b1440000-0000-4000-8000-000000000017','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-4,NULL,'absent'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pd.out_unpay',public.pwa_submit_operation_v2(current_setting('pd.unpay'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_status('unpay')='applied' AND pg_temp.pd_paid('c1440000-0000-4000-8000-000000000011')='null' AND pg_temp.pd_cash('c1440000-0000-4000-8000-000000000011')='none','3: back to pending clears the date and removes the cash row');
-- A direct SQL paid date on a paid row moves its cash (the trigger fires on "Paid Date").
UPDATE "Business Expenses" SET "Paid Date"=(SELECT d FROM pd_day)-2 WHERE "Row ID"='c1440000-0000-4000-8000-000000000012';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_cash('c1440000-0000-4000-8000-000000000012')=((SELECT d FROM pd_day)-2)::text||'|70|CI-DAD','3: a paid date set by SQL moves the cash row');
-- 4. R140 V145: a paid date is never before the expense date. In the command itself: not canonical; an 8-key edit that moves
-- the expense date after the stored paid date: P5B08; the same date: accepted.
SELECT set_config('pd.before',pg_temp.pd_cmd('b1450000-0000-4000-8000-000000000001','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-4,'CI-DAD',to_char((SELECT d FROM pd_day)-5,'YYYY-MM-DD')),true),
 set_config('pd.same',pg_temp.pd_cmd('b1450000-0000-4000-8000-000000000002','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-4,'CI-DAD',to_char((SELECT d FROM pd_day)-4,'YYYY-MM-DD')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 BEGIN PERFORM public.pwa_submit_operation_v2(current_setting('pd.before'));PERFORM set_config('pd.out_before','accepted',false);
 EXCEPTION WHEN SQLSTATE '22023' THEN PERFORM set_config('pd.out_before','invalid',false); END;
 PERFORM set_config('pd.out_same',public.pwa_submit_operation_v2(current_setting('pd.same'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(current_setting('pd.out_before')='invalid','4: a paid date before the expense date in the command is refused');
SELECT pg_temp.pd_assert(pg_temp.pd_status('same')='applied' AND pg_temp.pd_paid('c1440000-0000-4000-8000-000000000011')=((SELECT d FROM pd_day)-4)::text,'4: the same date is accepted');
SELECT set_config('pd.move',replace(pg_temp.pd_cmd('b1450000-0000-4000-8000-000000000003','expense.update','c1440000-0000-4000-8000-000000000011',(SELECT d FROM pd_day)-2,'CI-DAD','absent'),'"notes":null','"notes":"moved"'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('pd.out_move',public.pwa_submit_operation_v2(current_setting('pd.move'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.pd_assert(pg_temp.pd_status('move')='rejected' AND pg_temp.pd_code('move')='invalid_date' AND (SELECT "Expense Date"=(SELECT d FROM pd_day)-4 FROM "Business Expenses" WHERE "Row ID"='c1440000-0000-4000-8000-000000000011'),'4: moving the expense date after the paid date is refused (P5B08)');
SELECT pg_temp.pd_reject($q$UPDATE "Business Expenses" SET "Paid Date"="Expense Date"-1 WHERE "Row ID"='c1440000-0000-4000-8000-000000000012'$q$,'A paid date cannot be before the expense date');
SELECT 'Pool fallback and paid date regression passed' AS result;
ROLLBACK;
