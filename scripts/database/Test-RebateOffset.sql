-- R111 V122 referral rebate offset (disposable cluster only; synthetic rows; everything rolls back).
-- loan.close runs as the DEV command IAM user through pwa_submit_operation_v2 (the journal checks session_user); setup and
-- checks run as postgres. Assertions are on behaviour, not on result field order:
--  * offset path: the referrer's due charge is paid first, then the plan's next charges; one payment of the rebate, received by
--    Lisa in cash on the close date, method Referral Rebate Offset, notes "Rebate from loan <key>", linked from the expense;
--  * Lisa's cash nets to zero for the day (expense out, receipt in), both in the cash ledger;
--  * the chosen path is stored on the closing command; a re-close after deleting the closing payment repeats it;
--  * deleting the closing payment removes the expense and the offset payment and leaves the booked charges open (D4);
--    deleting the offset payment alone is refused ("Remove through the closing payment");
--  * a rebate beyond the referrer's 93-day schedule offsets up to the horizon and the rest stays payable; several open loans
--    take the earliest date first (smaller key on a tie);
--  * unchanged paths: pay out as expense, no open loan (offset requested), a pre-R111 close without rebatePath;
--  * pwa_notify_content_v2: executable like v1 (notify dispatch only), carries rebate amount, payee and payable.
-- R111 extension (V124): a loan closed by any other path (here the real Receive payment command v7: a daily-interest loan, the
-- last installment of an installment loan and a Fixed Due Date loan paid on its due date) offsets the rebate automatically
-- when its Close Date is today: one ro122:<closing payment> payment through the pay-forward plan, a journal row with the operation
-- system.rebate-offset that resolves the explicit plan, cash net zero, the same corrections; a historical close, a referrer without
-- an open loan and a referrer whose schedule cannot take it stay expense only and never fail the borrower's own payment.
-- The close command text must equal the server's canonical JSON byte for byte, as Test-ProjectedChargePayment.sql builds v9.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.ro_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE ro_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON ro_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('RO-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('RO-ACT','Synthetic rebate actor','A','ro-actor@example.invalid','English');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('RO-CAP','RO-FUND',(SELECT d FROM ro_day)-400,'Contribution',1000000::money);
-- Referrers (R*) and referred borrowers (B*), one pair per scenario.
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('RO-RA','SYNTHETIC REFERRER OFFSET'),('RO-RB','SYNTHETIC REFERRER EXPENSE'),('RO-RC','SYNTHETIC REFERRER LEGACY'),('RO-RD','SYNTHETIC REFERRER NO LOAN'),
 ('RO-RE','SYNTHETIC REFERRER HORIZON'),('RO-RF','SYNTHETIC REFERRER TWO LOANS'),('RO-RG','SYNTHETIC REFERRER LONE DELETE');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES
 ('RO-BA','SYNTHETIC REFERRED OFFSET','RO-RA'),('RO-BB','SYNTHETIC REFERRED EXPENSE','RO-RB'),('RO-BC','SYNTHETIC REFERRED LEGACY','RO-RC'),
 ('RO-BD','SYNTHETIC REFERRED NO LOAN','RO-RD'),('RO-BE','SYNTHETIC REFERRED HORIZON','RO-RE'),('RO-BF','SYNTHETIC REFERRED TWO LOANS','RO-RF'),
 ('RO-BG','SYNTHETIC REFERRED LONE DELETE','RO-RG');
-- The expense-path referrer has an English name (Description): an English recipient's push names it, else the Thai name.
UPDATE public."Borrowers" SET "Description"='Referrer Expense English' WHERE "Row ID"='RO-RB';
-- Loans are inserted with Auto Charge Enabled off, then switched on (as Test-PayForward.sql). Referrer loans: 1000 at 10 a day (RE: 5 a day), one charge a day.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM ro_day)-3,1000::money,'ดอกเบี้ยรายวัน',v.status,false,v.cdi::money,1,false
 FROM (VALUES
  ('RO-RA-L','RO-RA','ยังไม่ปิดยอด',10),('RO-RB-L','RO-RB','ยังไม่ปิดยอด',10),('RO-RC-L','RO-RC','ยังไม่ปิดยอด',10),
  ('RO-RD-OLD','RO-RD','ปิดยอดแล้ว',10),('RO-RE-L','RO-RE','ยังไม่ปิดยอด',5),
  ('RO-RF-L1','RO-RF','ยังไม่ปิดยอด',10),('RO-RF-L2','RO-RF','ยังไม่ปิดยอด',10),('RO-RG-L','RO-RG','ยังไม่ปิดยอด',10),
  -- the referred loans (closed by the tests): 1000 principal, charges below carry the interest
  ('RO-LA','RO-BA','ยังไม่ปิดยอด',100),('RO-LB','RO-BB','ยังไม่ปิดยอด',100),('RO-LC','RO-BC','ยังไม่ปิดยอด',100),('RO-LD','RO-BD','ยังไม่ปิดยอด',100),
  ('RO-LE','RO-BE','ยังไม่ปิดยอด',100),('RO-LF','RO-BF','ยังไม่ปิดยอด',100),('RO-LG','RO-BG','ยังไม่ปิดยอด',100)
 ) v(id,b,status,cdi);
-- Referrer's due charge today (10, RE 5); referred loans: interest 300 today (rebate 30), LE 10000 (rebate 1000, the cap).
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM ro_day),0::money,v.i::money FROM (VALUES
  ('RO-RA-today','RO-RA-L',10),('RO-RB-today','RO-RB-L',10),('RO-RC-today','RO-RC-L',10),('RO-RE-today','RO-RE-L',5),
  ('RO-RF1-today','RO-RF-L1',10),('RO-RF2-today','RO-RF-L2',10),('RO-RG-today','RO-RG-L',10),
  ('RO-LA-today','RO-LA',300),('RO-LB-today','RO-LB',300),('RO-LC-today','RO-LC',300),('RO-LD-today','RO-LD',300),
  ('RO-LE-today','RO-LE',10000),('RO-LF-today','RO-LF',300),('RO-LG-today','RO-LG',300)
 ) v(id,loan,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'RO-%' AND "Loan Status"='ยังไม่ปิดยอด';

-- R111 extension fixtures (closed by a Receive payment, not by Loan Close). Referrers: XA daily (also deleted and re-paid), XI, XF, XH open loans
-- with 10 due today; XG's loan has unpaid principal on a charge (no future charge is offered); XD has no open loan. Referred loans: principal paid
-- in full by the one payment (the rebate is 10% of the interest).
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('RO-RXA','SYNTHETIC REFERRER AUTO'),('RO-RXI','SYNTHETIC REFERRER AUTO INST'),('RO-RXF','SYNTHETIC REFERRER AUTO FIXED'),('RO-RXH','SYNTHETIC REFERRER AUTO HISTORIC'),
 ('RO-RXD','SYNTHETIC REFERRER AUTO NO LOAN'),('RO-RXG','SYNTHETIC REFERRER AUTO GATED');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES
 ('RO-BXA','SYNTHETIC REFERRED AUTO','RO-RXA'),('RO-BXI','SYNTHETIC REFERRED AUTO INST','RO-RXI'),('RO-BXF','SYNTHETIC REFERRED AUTO FIXED','RO-RXF'),
 ('RO-BXH','SYNTHETIC REFERRED AUTO HISTORIC','RO-RXH'),('RO-BXD','SYNTHETIC REFERRED AUTO NO LOAN','RO-RXD'),('RO-BXG','SYNTHETIC REFERRED AUTO GATED','RO-RXG');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM ro_day)-3,1000::money,'ดอกเบี้ยรายวัน',v.status,false,v.cdi::money,1,false FROM (VALUES
  ('RO-RXA-L','RO-RXA','ยังไม่ปิดยอด',10),('RO-RXI-L','RO-RXI','ยังไม่ปิดยอด',10),('RO-RXF-L','RO-RXF','ยังไม่ปิดยอด',10),('RO-RXH-L','RO-RXH','ยังไม่ปิดยอด',10),
  ('RO-RXG-L','RO-RXG','ยังไม่ปิดยอด',10),('RO-RXD-OLD','RO-RXD','ปิดยอดแล้ว',10),
  ('RO-LXA','RO-BXA','ยังไม่ปิดยอด',100),('RO-LXH','RO-BXH','ยังไม่ปิดยอด',100),('RO-LXD','RO-BXD','ยังไม่ปิดยอด',100),('RO-LXG','RO-BXG','ยังไม่ปิดยอด',100)
 ) v(id,b,status,cdi);
-- An installment loan whose last installment (100 principal, 40 interest) closes it, and a Fixed Due Date loan paid on its due date.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Defaulted")
 VALUES('CI-LISA','RO-LXI','RO-BXI',(SELECT d FROM ro_day)-3,100::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,0::money,140::money,1,(SELECT d FROM ro_day)+7,false);
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Interest Payment Interval","Due Date","Defaulted")
 VALUES('CI-LISA','RO-LXF','RO-BXF',(SELECT d FROM ro_day)-3,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,0::money,30::money,1,(SELECT d FROM ro_day),false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM ro_day)+v.day,v.p::money,v.i::money FROM (VALUES
  ('RO-RXA-today','RO-RXA-L',0,0,10),('RO-RXI-today','RO-RXI-L',0,0,10),('RO-RXF-today','RO-RXF-L',0,0,10),('RO-RXH-today','RO-RXH-L',0,0,10),
  ('RO-LXA-today','RO-LXA',0,1000,300),('RO-LXI-today','RO-LXI',0,100,40),('RO-LXF-today','RO-LXF',0,100,30),('RO-LXD-today','RO-LXD',0,1000,300),('RO-LXG-today','RO-LXG',0,1000,300),
  ('RO-LXH-old','RO-LXH',-1,1000,300)
 ) v(id,loan,day,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('RO-RXA-L','RO-RXI-L','RO-RXF-L','RO-RXH-L');
-- The real Receive payment command v7 (a due-only payment of the charge in full), as the canonical text.
CREATE FUNCTION pg_temp.ro_pay(request text,borrower text,charge text,p int,i int,off int) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":1,"command":{"schemaVersion":7,"requestId":'||to_json(request)::text||',"borrowerId":'||to_json(borrower)::text||',"allocations":[{"chargeId":'||to_json(charge)::text
  ||',"principal":"'||p||'","interest":"'||i||'","expectedPrincipalRemaining":"'||p||'","expectedInterestRemaining":"'||i||'","chargeDate":"'||to_char((SELECT d FROM ro_day)+least(off,0),'YYYY-MM-DD')
  ||'"}],"cashAccountId":"CI-DAD","paymentDate":"'||to_char((SELECT d FROM ro_day)+off,'YYYY-MM-DD')||'","amountReceived":"'||(p+i)||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null},'
  ||'"actor":{"issuer":"https://ro.invalid","subject":"ro-owner","partnerId":"RO-ACT","loginEmail":"ro-actor@example.invalid"},"receipt":null}' $f$;
SELECT set_config('ro.x_a',pg_temp.ro_pay('e1111111-1111-4111-8111-111111111111','RO-BXA','RO-LXA-today',1000,300,0),true),
 set_config('ro.x_a2',pg_temp.ro_pay('e1111111-1111-4111-8111-111111111112','RO-BXA','RO-LXA-today',1000,300,0),true),
 set_config('ro.x_i',pg_temp.ro_pay('e2222222-2222-4222-8222-222222222221','RO-BXI','RO-LXI-today',100,40,0),true),
 set_config('ro.x_f',pg_temp.ro_pay('e3333333-3333-4333-8333-333333333331','RO-BXF','RO-LXF-today',100,30,0),true),
 set_config('ro.x_h',pg_temp.ro_pay('e4444444-4444-4444-8444-444444444441','RO-BXH','RO-LXH-old',1000,300,-1),true),
 set_config('ro.x_d',pg_temp.ro_pay('e5555555-5555-4555-8555-555555555551','RO-BXD','RO-LXD-today',1000,300,0),true),
 set_config('ro.x_g',pg_temp.ro_pay('e6666666-6666-4666-8666-666666666661','RO-BXG','RO-LXG-today',1000,300,0),true);

-- loan.close as the canonical operation text. path NULL builds the pre-R111 command (no rebatePath key); otherwise rebatePath is
-- the last input key. Amount and plan hash come from the same calculation the preview and the command check.
CREATE FUNCTION pg_temp.ro_close(request text,loan text,path text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://ro.invalid","subject":"ro-owner","partnerId":"RO-ACT","loginEmail":"ro-actor@example.invalid"},"command":{"schemaVersion":1,"operation":"loan.close","targetType":"loan","targetId":'
  ||to_json(loan)::text||',"expectedVersion":'||to_json(public.pwa_loan_version_v2(loan))::text||',"predecessorRequestId":null,"inputs":{"paymentDate":'||to_json(to_char((SELECT d FROM ro_day),'YYYY-MM-DD'))::text
  ||',"cashAccountId":"CI-DAD","paymentMethod":"Cash","notes":null,"expectedAmount":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM ro_day))->>'amount')::text
  ||',"expectedPlanHash":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM ro_day))->>'planHash')::text
  ||CASE WHEN path IS NULL THEN '' ELSE ',"rebatePath":'||to_json(path)::text END||'}},"receipt":null}' $f$;
-- delete payment as the canonical operation is not needed: payments are deleted at SQL level below (as Test-ProjectedChargePayment.sql).

-- Commands, built before any submit so each close sees the untouched fixture.
SELECT set_config('ro.a',pg_temp.ro_close('d1111111-1111-4111-8111-111111111111','RO-LA','offset'),true),
 set_config('ro.b',pg_temp.ro_close('d2222222-2222-4222-8222-222222222221','RO-LB','expense'),true),
 set_config('ro.c',pg_temp.ro_close('d3333333-3333-4333-8333-333333333331','RO-LC',NULL),true),
 set_config('ro.d',pg_temp.ro_close('d4444444-4444-4444-8444-444444444441','RO-LD','offset'),true),
 set_config('ro.e',pg_temp.ro_close('d5555555-5555-4555-8555-555555555551','RO-LE','offset'),true),
 set_config('ro.f',pg_temp.ro_close('d6666666-6666-4666-8666-666666666661','RO-LF','offset'),true),
 set_config('ro.g',pg_temp.ro_close('d7777777-7777-4777-8777-777777777771','RO-LG','offset'),true),
 -- the offset method is posted by SQL only: a form command cannot name it
 set_config('ro.badmethod',replace(pg_temp.ro_close('d9999999-9999-4999-8999-999999999991','RO-LA','offset'),'"paymentMethod":"Cash"','"paymentMethod":"Referral Rebate Offset"'),true),
 -- an unknown path is an invalid command
 set_config('ro.bad',replace(pg_temp.ro_close('d8888888-8888-4888-8888-888888888881','RO-LA','offset'),'"rebatePath":"offset"','"rebatePath":"x"'),true);

-- Operator grants, emulated and rolled back (as Test-ProjectedChargePayment.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;

-- 1. Closes as the DEV command user.
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['ro.a','ro.b','ro.c','ro.d','ro.e','ro.f','ro.g'] LOOP
  r:=public.pwa_submit_operation_v2(current_setting(k));
  IF r->'originalOutcome'->>'status'<>'applied' THEN RAISE EXCEPTION '% must apply: %',k,r; END IF;
 END LOOP;
 -- Replay is idempotent: the same canonical command returns the recorded outcome.
 IF public.pwa_submit_operation_v2(current_setting('ro.a'))->'originalOutcome'->>'status'<>'applied' THEN RAISE EXCEPTION 'replay'; END IF;
 BEGIN
  PERFORM public.pwa_submit_operation_v2(current_setting('ro.bad'));
  RAISE EXCEPTION 'an unknown rebate path was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  PERFORM public.pwa_submit_operation_v2(current_setting('ro.badmethod'));
  RAISE EXCEPTION 'Loan Close accepted the Referral Rebate Offset method';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;

-- 2. Results.
DO $$
DECLARE day date:=(SELECT d FROM ro_day);off text;exp text;
BEGIN
 -- A: offset. Referrer due 10 paid first, then forward charges; 30 in all.
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='RO-RA' AND "Payment Method"='Referral Rebate Offset';
 PERFORM pg_temp.ro_assert(off IS NOT NULL,'A: an offset payment exists on the referrer');
 PERFORM pg_temp.ro_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=30 AND "Payment Date"=day AND "Ref Received By Cash Holder"='ch:lisa' AND "Notes" LIKE 'Rebate from loan SYNTHETIC REFERRED OFFSET - -฿1,000-'||to_char(day-3,'DD/MM')||'-%' AND "Notes" NOT LIKE '%RO-LA%' FROM public."Payments" WHERE "Row ID"=off),'A: posted 30, dated the close date, received by Lisa, notes name the loan by its app key (V123)');
 PERFORM pg_temp.ro_assert((SELECT count(*)=1 FROM public."Payments" WHERE "Payment Method"='Referral Rebate Offset' AND "Ref Borrower"='RO-RA'),'A: one offset payment (replay added none)');
 PERFORM pg_temp.ro_assert((SELECT "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='RO-RA-today'),'A: the referrer due charge is paid first');
 PERFORM pg_temp.ro_assert((SELECT count(*)=2 AND bool_and("Amount Remaining"::numeric=0 AND "Interest Due"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='RO-RA-L' AND "Charge Date">day),'A: two next charges of 10 booked and paid');
 PERFORM pg_temp.ro_assert((SELECT sum("Allocated Amount"::numeric)=30 FROM public."Payment Allocations" WHERE "Ref Payment"=off) AND (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=30 FROM public."Repayments" WHERE "Ref Payment"=off),'A: allocations and repayments reconcile to the rebate');
 PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=30 AND "Ref Offset Payment"=off AND "Source Key"='REFERRAL_REBATE:RO-LA' FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LA'),'A: the rebate expense is 30 and links the offset payment');
 -- Cash nets to zero on Lisa's account: expense out, receipt in, same day.
 PERFORM pg_temp.ro_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)=0
   AND count(*)=2 FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RO-LA'),'A: Lisa cash nets to zero (one expense row out, one receipt row in)');
 PERFORM pg_temp.ro_assert((SELECT bool_and("Movement Date"=day) FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RO-LA'),'A: both cash rows are on the close date');
 -- The receipt and the expense use the same account (Lisa's default), so the account balance nets to zero too.
 PERFORM pg_temp.ro_assert((SELECT count(DISTINCT coalesce("Ref To Cash Account","Ref From Cash Account"))=1 FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RO-LA'),'A: expense and receipt are on one cash account');
 -- The chosen path is stored on the closing command.
 PERFORM pg_temp.ro_assert((SELECT canonical_json LIKE '%"rebatePath":"offset"%' FROM public.pwa_payment_commands WHERE request_id='d1111111-1111-4111-8111-111111111111'),'A: the closing command stores rebatePath offset');
 -- B: pay out as expense, offset not used although the referrer has an open loan.
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"='RO-RB' AND "Payment Method"='Referral Rebate Offset'),'B: expense path posts no offset payment');
 PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=30 AND "Ref Offset Payment" IS NULL AND "Ref Paid By Cash Holder"='ch:lisa' FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LB'),'B: expense 30 paid by Lisa as today, no offset link');
 PERFORM pg_temp.ro_assert((SELECT "Amount Remaining"::numeric=10 FROM public."Charges" WHERE "Row ID"='RO-RB-today') AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RO-RB-L' AND "Charge Date">day),'B: the referrer loan is untouched');
 PERFORM pg_temp.ro_assert((SELECT count(*)=1 FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:RO-LB' AND "Ref From Cash Holder"='ch:lisa'),'B: one cash row out, as before R111');
 -- C: a pre-R111 command (no rebatePath) closes as before: expense path.
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"='RO-RC' AND "Payment Method"='Referral Rebate Offset') AND (SELECT "Ref Offset Payment" IS NULL AND "Amount"::numeric=30 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LC'),'C: a close without rebatePath still works and is the expense path');
 PERFORM pg_temp.ro_assert((SELECT canonical_json NOT LIKE '%rebatePath%' FROM public.pwa_payment_commands WHERE request_id='d3333333-3333-4333-8333-333333333331'),'C: the legacy command is stored as sent');
 -- D: offset requested but the referrer has no open loan: unchanged expense.
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Payment Method"='Referral Rebate Offset' AND "Ref Borrower"='RO-RD') AND (SELECT "Ref Offset Payment" IS NULL AND "Amount"::numeric=30 AND "Ref Paid By Cash Holder"='ch:lisa' FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LD'),'D: no open loan, the expense is unchanged and nothing is offset');
 -- E: horizon. The rebate is 1000, the referrer schedule (5 a day, 93 days) takes less; the rest stays payable.
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='RO-RE' AND "Payment Method"='Referral Rebate Offset';
 PERFORM pg_temp.ro_assert(off IS NOT NULL,'E: a partial offset payment exists');
 PERFORM pg_temp.ro_assert((SELECT "Amount Received"::numeric>0 AND "Amount Received"::numeric<1000 FROM public."Payments" WHERE "Row ID"=off),'E: the offset is below the rebate (horizon)');
 PERFORM pg_temp.ro_assert((SELECT max("Charge Date")<=day+93 FROM public."Charges" WHERE "Ref Loans"='RO-RE-L'),'E: no charge booked beyond day+93');
 PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=1000 AND "Ref Offset Payment"=off FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LE'),'E: the expense stays the full 1000 and links the partial offset');
 PERFORM pg_temp.ro_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)
   =-(1000-(SELECT "Amount Received"::numeric FROM public."Payments" WHERE "Row ID"=off)) FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RO-LE'),'E: Lisa cash nets to minus the payable remainder');
 -- F: several open loans: due of both first (20), then the earliest next date, the smaller key on a tie.
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='RO-RF' AND "Payment Method"='Referral Rebate Offset';
 PERFORM pg_temp.ro_assert(off IS NOT NULL AND (SELECT "Amount Received"::numeric=30 FROM public."Payments" WHERE "Row ID"=off),'F: one offset payment of 30 across two loans');
 PERFORM pg_temp.ro_assert((SELECT bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Row ID" IN ('RO-RF1-today','RO-RF2-today')),'F: both due charges are paid first');
 PERFORM pg_temp.ro_assert(EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RO-RF-L1' AND "Charge Date"=day+1 AND "Amount Remaining"::numeric=0) AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RO-RF-L2' AND "Charge Date">day),'F: the remaining 10 pays the smaller loan key on the earliest date');

 -- 3. Linked delete (A). The booked charges stay and reopen (D4); the expense goes with the closing payment.
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='RO-RA' AND "Payment Method"='Referral Rebate Offset';
 PERFORM set_config('ro.off_a',off,true);
END $$;
-- Direct input changes are refused too: the offset payment and a closing payment that has an offset (Notes-only edits are not
-- payment inputs, as for every payment). Either refusal (the explicit-scope guard or the closing-payment guard) is a pass.
DO $$
DECLARE off text:=current_setting('ro.off_a');closing text:=(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LA');
BEGIN
 BEGIN UPDATE public."Payments" SET "Amount Received"="Amount Received"+1::money WHERE "Row ID"=off; RAISE EXCEPTION 'the offset payment was updated';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Remove through the closing payment%' AND SQLERRM NOT LIKE 'Immutable explicit allocation scope%' THEN RAISE; END IF; END;
 BEGIN UPDATE public."Payments" SET "Amount Received"="Amount Received"+1::money WHERE "Row ID"=closing; RAISE EXCEPTION 'a closing payment with an offset was corrected';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Remove through the closing payment%' AND SQLERRM NOT LIKE 'Immutable explicit allocation scope%' THEN RAISE; END IF; END;
END $$;
-- Lone delete of an offset payment is refused (G: a separate close so A stays for the linked case).
DO $$
DECLARE off text:=(SELECT "Row ID" FROM public."Payments" WHERE "Ref Borrower"='RO-RG' AND "Payment Method"='Referral Rebate Offset');
BEGIN
 PERFORM pg_temp.ro_assert(off IS NOT NULL,'G: an offset payment exists');
 BEGIN
  DELETE FROM public."Payments" WHERE "Row ID"=off;
  RAISE EXCEPTION 'a lone delete of the offset payment was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%Remove through the closing payment%' THEN RAISE; END IF;
 END;
 PERFORM pg_temp.ro_assert(EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=off AND "Status"='Posted') AND EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LG' AND "Ref Offset Payment"=off),'G: the offset payment and the expense are unchanged after the refusal');
END $$;
-- Linked delete: remove the closing payment of A.
DELETE FROM public."Payments" WHERE "Row ID"=(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LA');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);off text:=current_setting('ro.off_a');
BEGIN
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=off) AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LA'),'A delete: the offset payment and the rebate expense go with the closing payment');
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RO-LA'),'A delete: both cash rows are gone');
 PERFORM pg_temp.ro_assert((SELECT "Amount Remaining"::numeric=10 FROM public."Charges" WHERE "Row ID"='RO-RA-today') AND (SELECT count(*)=2 AND bool_and("Amount Remaining"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='RO-RA-L' AND "Charge Date">day),'A delete: the referrer due charge and the two booked charges reopen, and stay booked (D4)');
 PERFORM pg_temp.ro_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RO-LA'),'A delete: the referred loan reopens');
 -- The closing command row still carries the choice, so the re-close repeats it.
 PERFORM pg_temp.ro_assert((SELECT canonical_json LIKE '%"rebatePath":"offset"%' FROM public.pwa_payment_commands WHERE request_id='d1111111-1111-4111-8111-111111111111'),'A delete: the journal keeps the chosen path');
END $$;
-- Re-close with the same choice (a new request): the offset repeats on the same referrer loan.
SELECT set_config('ro.a2',pg_temp.ro_close('d1111111-1111-4111-8111-111111111112','RO-LA','offset'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb:=public.pwa_submit_operation_v2(current_setting('ro.a2'));
BEGIN IF r->'originalOutcome'->>'status'<>'applied' THEN RAISE EXCEPTION 're-close must apply: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);
BEGIN
 PERFORM pg_temp.ro_assert((SELECT count(*)=1 AND bool_and("Amount Received"::numeric=30 AND "Status"='Posted') FROM public."Payments" WHERE "Ref Borrower"='RO-RA' AND "Payment Method"='Referral Rebate Offset'),'re-close: one new offset payment of 30');
 PERFORM pg_temp.ro_assert((SELECT "Ref Offset Payment" IS NOT NULL AND "Amount"::numeric=30 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LA'),'re-close: the expense is back and linked');
 PERFORM pg_temp.ro_assert((SELECT count(*)=2 FROM public."Charges" WHERE "Ref Loans"='RO-RA-L' AND "Charge Date">day) AND (SELECT bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='RO-RA-L'),'re-close: the booked charges are reused, not duplicated, and are paid again');
END $$;

-- 3b. R111 extension: the same rebate rule when the loan is closed by a Receive payment (real v7 command, as the command user).
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['ro.x_a','ro.x_i','ro.x_f','ro.x_h','ro.x_d','ro.x_g'] LOOP
  r:=public.pwa_submit_selected_charges_v1(current_setting(k));
  IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION '% must post (the borrower payment never fails for its referrer): %',k,r; END IF;
 END LOOP;
 IF public.pwa_submit_selected_charges_v1(current_setting('ro.x_a'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'replay of the closing payment'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);off text;loan text;amt numeric;n int;
BEGIN
 -- (RO-LXH: a payment dated yesterday still closes the loan today, so the offset applies.)
 FOR loan,amt IN SELECT * FROM (VALUES ('RO-LXA',30),('RO-LXI',4),('RO-LXF',3),('RO-LXH',30)) v(l,a) LOOP
  PERFORM pg_temp.ro_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day FROM public."Loans" WHERE "Row ID"=loan),loan||': the payment closes the loan today');
  SELECT "Row ID" INTO off FROM public."Payments" p WHERE p."Payment Method"='Referral Rebate Offset' AND p."Notes" LIKE 'Rebate from loan %' AND EXISTS(SELECT 1 FROM public."Business Expenses" x WHERE x."Ref Offset Payment"=p."Row ID" AND x."Ref Related Loan"=loan);
  PERFORM pg_temp.ro_assert(off IS NOT NULL AND off LIKE 'ro122:pwa:%','auto offset: '||loan||' posts an ro122: offset payment');
  PERFORM pg_temp.ro_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=amt AND "Payment Date"=day AND "Ref Received By Cash Holder"='ch:lisa' FROM public."Payments" WHERE "Row ID"=off),'auto offset: '||loan||' payment of the rebate, received by Lisa today');
  PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=amt AND "Ref Offset Payment"=off FROM public."Business Expenses" WHERE "Row ID"='rr1:'||loan),'auto offset: '||loan||' expense links the offset payment');
  PERFORM pg_temp.ro_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)=0 AND count(*)=2
    FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:'||loan),'auto offset: '||loan||' Lisa cash nets to zero');
  PERFORM pg_temp.ro_assert((SELECT sum("Allocated Amount"::numeric)=amt FROM public."Payment Allocations" WHERE "Ref Payment"=off),'auto offset: '||loan||' allocations reconcile');
  -- Provenance: a journal row of the operation system.rebate-offset resolves the explicit plan the allocations equal.
  PERFORM pg_temp.ro_assert(EXISTS(SELECT 1 FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='system.rebate-offset'
    AND j.canonical_json::jsonb#>>'{command,targetId}'=loan AND j.result_json->>'paymentId'=off),'auto offset: '||loan||' a system.rebate-offset journal row names the offset payment');
  PERFORM pg_temp.ro_assert((SELECT coalesce(sum((l->>'principal')::numeric+(l->>'interest')::numeric),0)=amt FROM jsonb_array_elements(public.pwa_effective_payment_plan_v2(off)#>'{plan,allocations}') l)
    AND (SELECT array_agg(l->>'chargeId' ORDER BY l->>'chargeId' COLLATE "C") FROM jsonb_array_elements(public.pwa_effective_payment_plan_v2(off)#>'{plan,allocations}') l)
      =(SELECT array_agg("Ref Charge" ORDER BY "Ref Charge" COLLATE "C") FROM public."Payment Allocations" WHERE "Ref Payment"=off),'auto offset: '||loan||' the effective plan equals the allocations');
 END LOOP;
 -- The offset booked the referrers'' next charges (daily referrer: 10 due today first, then 20 more).
 PERFORM pg_temp.ro_assert((SELECT "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='RO-RXA-today') AND (SELECT count(*)=2 AND bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='RO-RXA-L' AND "Charge Date">day),'auto offset: due first, then two next charges (daily referrer)');
 PERFORM pg_temp.ro_assert((SELECT "Amount Remaining"::numeric=6 FROM public."Charges" WHERE "Row ID"='RO-RXI-today'),'auto offset: the installment rebate of 4 part-pays the referrer due charge');
 -- A referrer without an open loan and one whose open loan offers neither a due nor a future charge: expense only, the payment posted.
 FOREACH loan IN ARRAY ARRAY['RO-LXD','RO-LXG'] LOOP
  PERFORM pg_temp.ro_assert((SELECT "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"=loan),loan||': closed by its payment');
  PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=30 AND "Ref Offset Payment" IS NULL AND "Ref Paid By Cash Holder"='ch:lisa' FROM public."Business Expenses" WHERE "Row ID"='rr1:'||loan),loan||': expense only, paid by Lisa as before');
  PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands j WHERE j.canonical_json::jsonb#>>'{command,operation}'='system.rebate-offset' AND j.canonical_json::jsonb#>>'{command,targetId}'=loan),loan||': no offset journal row');
 END LOOP;
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Payment Method"='Referral Rebate Offset' AND "Ref Borrower" IN ('RO-RXD','RO-RXG')),'no offset payment for the no-loan and the unbookable referrers');
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RO-RXG-L'),'unbookable referrer schedule (auto charge off, nothing due): nothing booked');
 PERFORM pg_temp.ro_assert((SELECT count(*)=3 FROM public."Payments" WHERE "Row ID" IN ('pwa:e4444444-4444-4444-8444-444444444441','pwa:e5555555-5555-4555-8555-555555555551','pwa:e6666666-6666-4666-8666-666666666661') AND "Status"='Posted'),'the borrower payments posted although the offset was impossible');
 -- Corrections: the closing payment (with an offset) goes with its offset; the booked charges stay open; the re-pay makes a new offset under a new key.
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='RO-RXA' AND "Payment Method"='Referral Rebate Offset';
 PERFORM set_config('ro.x_off',off,true);
END $$;
DO $$
DECLARE off text:=current_setting('ro.x_off');
BEGIN
 BEGIN DELETE FROM public."Payments" WHERE "Row ID"=off; RAISE EXCEPTION 'a lone delete of the automatic offset payment was accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Remove through the closing payment%' THEN RAISE; END IF; END;
END $$;
DELETE FROM public."Payments" WHERE "Row ID"='pwa:e1111111-1111-4111-8111-111111111111';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);
BEGIN
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=current_setting('ro.x_off')) AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LXA'),'auto delete: the offset payment and the expense go with the closing payment');
 PERFORM pg_temp.ro_assert((SELECT "Amount Remaining"::numeric=10 FROM public."Charges" WHERE "Row ID"='RO-RXA-today') AND (SELECT count(*)=2 AND bool_and("Amount Remaining"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='RO-RXA-L' AND "Charge Date">day),'auto delete: the referrer charges reopen and stay booked (D4)');
 PERFORM pg_temp.ro_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RO-LXA'),'auto delete: the referred loan reopens');
END $$;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb:=public.pwa_submit_selected_charges_v1(current_setting('ro.x_a2'));
BEGIN IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 're-pay must post: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);off text:=(SELECT "Row ID" FROM public."Payments" WHERE "Ref Borrower"='RO-RXA' AND "Payment Method"='Referral Rebate Offset');
BEGIN
 PERFORM pg_temp.ro_assert(off='ro122:pwa:e1111111-1111-4111-8111-111111111112' AND (SELECT count(*)=1 FROM public."Payments" WHERE "Ref Borrower"='RO-RXA' AND "Payment Method"='Referral Rebate Offset'),'auto re-close: one offset payment under the new closing payment key');
 PERFORM pg_temp.ro_assert((SELECT "Ref Offset Payment"=off AND "Amount"::numeric=30 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LXA') AND (SELECT count(*)=2 FROM public."Charges" WHERE "Ref Loans"='RO-RXA-L' AND "Charge Date">day),'auto re-close: the expense is back and the booked charges are reused');
END $$;

-- 4. pwa_notify_content_v2: access like v1, and the rebate facts of a closed loan.
DO $$ BEGIN
 PERFORM pg_temp.ro_assert(EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_content_v2(uuid,bigint)'::regprocedure AND prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig)),'v2 has the v1 owner, definer header and pinned search path');
 PERFORM pg_temp.ro_assert(has_function_privilege('mw_notify_dispatch_dev','public.pwa_notify_content_v2(uuid,bigint)','EXECUTE'),'v2: notify dispatch executes');
 PERFORM pg_temp.ro_assert(NOT has_function_privilege('mw_app_dev','public.pwa_notify_content_v2(uuid,bigint)','EXECUTE') AND NOT has_function_privilege('public','public.pwa_notify_content_v2(uuid,bigint)','EXECUTE'),'v2: neither the application role nor PUBLIC executes');
 PERFORM pg_temp.ro_assert(EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure),'v1 stays (a rolling deploy can still call it)');
 PERFORM pg_temp.ro_assert((SELECT array_agg(u.n ORDER BY u.o) @> ARRAY['rebate_amount','rebate_payee','rebate_payable'] FROM pg_proc p,unnest(p.proargnames,p.proargmodes) WITH ORDINALITY u(n,m,o) WHERE p.oid='public.pwa_notify_content_v2(uuid,bigint)'::regprocedure AND u.m='t'),'v2 returns the rebate columns');
END $$;
INSERT INTO public."Partners"("Row ID","Partner Role","Partner Name","Login Email","Email","Language Preference") VALUES('RO-LISA','B','Synthetic Lisa recipient','ro-lisa@example.invalid','ro-lisa@example.invalid','English');
CREATE TEMP TABLE ro_notice(name text PRIMARY KEY,delivery uuid,generation bigint) ON COMMIT DROP;
GRANT SELECT ON ro_notice TO PUBLIC;
DO $$
DECLARE c record; e uuid; s uuid; d uuid;
BEGIN
 -- loan.closed events of three closes: the expense path (30 payable), the full offset (nothing payable) and the horizon (the remainder).
 FOR c IN SELECT * FROM (VALUES ('expense','loan.closed','loan','RO-LB'),('offset','loan.closed','loan','RO-LA'),('horizon','loan.closed','loan','RO-LE'),('none','loan.closed','loan','RO-LD'),
   ('payoff','payment.posted','payment',(SELECT "Row ID" FROM public."Payments" WHERE "Ref Borrower"='RO-RA' AND "Payment Method"='Referral Rebate Offset')),
   ('payplain','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LA')),
   -- R111 extension: the closing payment's push (fully offset: no rebate line; paid out because the referrer has no open loan: the line)
   ('closeoff','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LXA')),
   ('closepay','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LXD'))) v(name,kind,source_kind,source_id) LOOP
  INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
  VALUES('RO-'||c.name,c.kind,c.source_kind,c.source_id,'v1',NULL,NULL) RETURNING event_id INTO e;
  INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth)
  VALUES('https://securetoken.google.com/clever-oasis-508610-n7','ro-'||c.name,'RO-LISA',encode(sha256(convert_to('ro-'||c.name,'UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/ro-'||c.name,'synthetic','synthetic') RETURNING subscription_id INTO s;
  INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at)
  VALUES(e,'web-push',encode(sha256(convert_to('ro-'||c.name,'UTF8')),'hex'),'RO-LISA',s,1,'leased',3,clock_timestamp()+interval '60 seconds') RETURNING delivery_id INTO d;
  INSERT INTO ro_notice VALUES(c.name,d,3);
 END LOOP;
END $$;
CREATE ROLE ro_content_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_dispatch_dev TO ro_content_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO ro_content_dispatch;
-- The facts as the dispatch capability, the only role that executes v2.
SET SESSION AUTHORIZATION ro_content_dispatch;
DO $$
DECLARE r record;
BEGIN
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='expense';
 IF NOT (r.found AND r.event_type='loan.closed' AND r.rebate_amount=30 AND r.rebate_payable=30 AND r.rebate_payee='Referrer Expense English') THEN RAISE EXCEPTION 'FAILED: %','v2 expense path (English recipient): rebate 30, payable 30, payee the referrer English name'; END IF;
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='offset';
 IF NOT (r.found AND r.rebate_amount=30 AND coalesce(r.rebate_payable,0)=0) THEN RAISE EXCEPTION 'FAILED: %','v2 full offset: rebate 30, nothing payable (no push line)'; END IF;
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='horizon';
 IF NOT (r.found AND r.rebate_amount=1000 AND r.rebate_payable>0 AND r.rebate_payable<1000) THEN RAISE EXCEPTION 'FAILED: %','v2 horizon: the payable remainder only'; END IF;
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='none';
 IF NOT (r.found AND r.rebate_amount=30 AND r.rebate_payable=30) THEN RAISE EXCEPTION 'FAILED: %','v2 no open loan: payable as before'; END IF;
 -- The push of the offset payment reads as a rebate offset: its method and the closed loan whose rebate it is.
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='payoff';
 IF NOT (r.found AND r.event_type='payment.posted' AND r.payment_method='Referral Rebate Offset' AND r.rebate_loan='RO-LA' AND r.amount=30) THEN RAISE EXCEPTION 'FAILED: %','v2 offset payment: method Referral Rebate Offset and the closed loan'; END IF;
 -- An ordinary payment (the closing payment) carries its method and no rebate loan.
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='payplain';
 IF NOT (r.found AND r.payment_method='Cash' AND r.rebate_loan IS NULL) THEN RAISE EXCEPTION 'FAILED: %','v2 ordinary payment: its method, no rebate loan'; END IF;
 -- R111 extension: the closing payment's own push carries the rebate facts of the loan it closed.
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='closeoff';
 IF NOT (r.found AND r.event_type='payment.posted' AND coalesce(r.rebate_payable,0)=0) THEN RAISE EXCEPTION 'FAILED: %','v2 closing payment, rebate fully offset: nothing payable (no transfer line)'; END IF;
 SELECT x.* INTO r FROM ro_notice k,LATERAL public.pwa_notify_content_v2(k.delivery,k.generation) x WHERE k.name='closepay';
 IF NOT (r.found AND r.event_type='payment.posted' AND r.rebate_amount=30 AND r.rebate_payable=30 AND r.rebate_payee='SYNTHETIC REFERRER AUTO NO LOAN') THEN RAISE EXCEPTION 'FAILED: %','v2 closing payment, rebate paid out: the payable amount and the referrer'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM pg_proc p,unnest(p.proargnames) n WHERE p.oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND n LIKE 'rebate%'),'v1 keeps its columns');
END $$;
DROP OWNED BY ro_content_dispatch;
DROP ROLE ro_content_dispatch;
SELECT 'Rebate offset regressions passed' AS result;
ROLLBACK;
