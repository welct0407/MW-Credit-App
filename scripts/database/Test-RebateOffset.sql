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
   ('payplain','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LA'))) v(name,kind,source_kind,source_id) LOOP
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
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM pg_proc p,unnest(p.proargnames) n WHERE p.oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND n LIKE 'rebate%'),'v1 keeps its columns');
END $$;
DROP OWNED BY ro_content_dispatch;
DROP ROLE ro_content_dispatch;
SELECT 'Rebate offset regressions passed' AS result;
ROLLBACK;
