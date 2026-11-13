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
-- when its Close Date is today: one ro122:<closing payment>:<loan> payment (R117 V131: one per closed loan) through the pay-forward plan, a journal row with the operation
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
-- R117 V131: one payment closes two referred loans of one borrower (1000+300 and 1000+200, rebates 30 and 20); the referrer has
-- one open daily loan with 10 due today. Before V131 both default offsets took the id ro122:<closing payment> and the payment failed (23505).
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('RO-RXM','SYNTHETIC REFERRER AUTO TWO CLOSED');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('RO-BXM','SYNTHETIC REFERRED AUTO TWO LOANS','RO-RXM');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM ro_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,1,false FROM (VALUES
  ('RO-RXM-L','RO-RXM',10),('RO-LXM1','RO-BXM',100),('RO-LXM2','RO-BXM',100)) v(id,b,cdi);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM ro_day),v.p::money,v.i::money FROM (VALUES
  ('RO-RXM-today','RO-RXM-L',0,10),('RO-LXM1-today','RO-LXM1',1000,300),('RO-LXM2-today','RO-LXM2',1000,200)) v(id,loan,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RO-RXM-L';
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
-- R117 V131: the same v7 command with two lines (both charges in full, the lines in charge id order).
SELECT set_config('ro.x_m','{"contractVersion":1,"command":{"schemaVersion":7,"requestId":"e7777777-7777-4777-8777-777777777771","borrowerId":"RO-BXM","allocations":['
 ||'{"chargeId":"RO-LXM1-today","principal":"1000","interest":"300","expectedPrincipalRemaining":"1000","expectedInterestRemaining":"300","chargeDate":"'||to_char((SELECT d FROM ro_day),'YYYY-MM-DD')||'"},'
 ||'{"chargeId":"RO-LXM2-today","principal":"1000","interest":"200","expectedPrincipalRemaining":"1000","expectedInterestRemaining":"200","chargeDate":"'||to_char((SELECT d FROM ro_day),'YYYY-MM-DD')||'"}],'
 ||'"cashAccountId":"CI-DAD","paymentDate":"'||to_char((SELECT d FROM ro_day),'YYYY-MM-DD')||'","amountReceived":"2500","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null},'
 ||'"actor":{"issuer":"https://ro.invalid","subject":"ro-owner","partnerId":"RO-ACT","loginEmail":"ro-actor@example.invalid"},"receipt":null}',true);

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
 -- R129 (V137): the rebate is pending payment (REFERRAL_REBATE_V3): no cash moves at the close; a settlement pays it later.
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:RO-LB') AND public.pwa_rebate_pending_v1('rr1:RO-LB')=30,'B: no cash row at the close, 30 pending (R129)');
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
   =0 FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RO-LE')
  AND public.pwa_rebate_pending_v1('rr1:RO-LE')=1000-(SELECT "Amount Received"::numeric FROM public."Payments" WHERE "Row ID"=off),'E: Lisa cash nets to zero; the remainder is pending (R129)');
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
 PERFORM pg_temp.ro_assert(off='ro122:pwa:e1111111-1111-4111-8111-111111111112:RO-LXA' AND (SELECT count(*)=1 FROM public."Payments" WHERE "Ref Borrower"='RO-RXA' AND "Payment Method"='Referral Rebate Offset'),'auto re-close: one offset payment under the new closing payment key');
 PERFORM pg_temp.ro_assert((SELECT "Ref Offset Payment"=off AND "Amount"::numeric=30 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LXA') AND (SELECT count(*)=2 FROM public."Charges" WHERE "Ref Loans"='RO-RXA-L' AND "Charge Date">day),'auto re-close: the expense is back and the booked charges are reused');
END $$;

-- 3c. R117 V131: one Receive payment closes two referred loans of one borrower: one default offset per closed loan
-- (ro122:<closing payment>:<loan>), each with its own journal row and expense link; a replay adds none; deleting the payment removes both.
-- The earlier SET CONSTRAINTS ALL IMMEDIATE would refresh charge balances at once; a real command transaction defers them,
-- so the second offset must plan on balances the first one just paid (V131 refreshes them).
SET CONSTRAINTS ALL DEFERRED;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_submit_selected_charges_v1(current_setting('ro.x_m'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'posted' THEN RAISE EXCEPTION 'FAILED: two-loan close must post: %',r; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('ro.x_m'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'posted' THEN RAISE EXCEPTION 'FAILED: two-loan close replay returns the recorded status: %',r; END IF;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);closing text:='pwa:e7777777-7777-4777-8777-777777777771';loan text;amt numeric;off text;
BEGIN
 PERFORM pg_temp.ro_assert((SELECT count(*)=2 AND bool_and("Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day AND "Ref Closing Payment"=closing) FROM public."Loans" WHERE "Row ID" IN ('RO-LXM1','RO-LXM2')),'two-loan close: the one payment closes both loans today');
 PERFORM pg_temp.ro_assert((SELECT count(*)=2 AND count(DISTINCT "Row ID")=2 FROM public."Payments" WHERE "Ref Borrower"='RO-RXM' AND "Payment Method"='Referral Rebate Offset'),'two-loan close: two distinct offset payments (the replay added none)');
 FOR loan,amt IN SELECT * FROM (VALUES ('RO-LXM1',30),('RO-LXM2',20)) v(l,a) LOOP
  off:='ro122:'||closing||':'||loan;
  PERFORM pg_temp.ro_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=amt AND "Payment Date"=day AND "Ref Received By Cash Holder"='ch:lisa' FROM public."Payments" WHERE "Row ID"=off),'two-loan close: '||loan||' has its own offset '||off||' of '||amt);
  PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=amt AND "Ref Offset Payment"=off FROM public."Business Expenses" WHERE "Row ID"='rr1:'||loan),'two-loan close: rr1:'||loan||' links its own offset');
  PERFORM pg_temp.ro_assert((SELECT sum("Allocated Amount"::numeric)=amt FROM public."Payment Allocations" WHERE "Ref Payment"=off),'two-loan close: '||loan||' offset allocations reconcile');
  PERFORM pg_temp.ro_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)=0 AND count(*)=2
    FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:'||loan),'two-loan close: '||loan||' Lisa cash nets to zero');
  PERFORM pg_temp.ro_assert((SELECT count(*)=1 FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='system.rebate-offset'
    AND j.canonical_json::jsonb#>>'{command,targetId}'=loan AND j.result_json->>'paymentId'=off),'two-loan close: '||loan||' one system.rebate-offset journal row');
  PERFORM pg_temp.ro_assert((SELECT coalesce(sum((l->>'principal')::numeric+(l->>'interest')::numeric),0)=amt FROM jsonb_array_elements(public.pwa_effective_payment_plan_v2(off)#>'{plan,allocations}') l),'two-loan close: '||loan||' the effective plan resolves');
 END LOOP;
 PERFORM pg_temp.ro_assert((SELECT count(DISTINCT j.request_id)=2 FROM public.pwa_payment_commands j WHERE j.canonical_json::jsonb#>>'{command,operation}'='system.rebate-offset' AND j.canonical_json::jsonb#>>'{command,targetId}' IN ('RO-LXM1','RO-LXM2')),'two-loan close: two distinct journal request ids');
 PERFORM pg_temp.ro_assert((SELECT count(*)=5 AND bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='RO-RXM-L'),'two-loan close: 50 pays the referrer due 10 and four booked charges');
END $$;
-- R119 (V134): the closing payment's push facts. v4 `rebates` names both rebates (30 then 20, expense "Row ID" order, both
-- fully offset: payable 0) with the v3 payee; its other columns equal v3, whose scalars stay the first rebate.
INSERT INTO public."Partners"("Row ID","Partner Role","Partner Name","Login Email","Email","Language Preference") VALUES('RO-XM-LISA','B','Synthetic Lisa two-loan recipient','ro-xm-lisa@example.invalid','ro-xm-lisa@example.invalid','English');
CREATE TEMP TABLE ro_xm_notice(delivery uuid,generation bigint,v3 jsonb,v4 jsonb) ON COMMIT DROP;
GRANT ALL ON ro_xm_notice TO PUBLIC;
DO $$
DECLARE e uuid; s uuid; d uuid;
BEGIN
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES('RO-xm-close','payment.posted','payment','pwa:e7777777-7777-4777-8777-777777777771','v1',NULL,NULL) RETURNING event_id INTO e;
 INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth)
 VALUES('https://securetoken.google.com/clever-oasis-508610-n7','ro-xm-close','RO-XM-LISA',encode(sha256(convert_to('ro-xm-close','UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/ro-xm-close','synthetic','synthetic') RETURNING subscription_id INTO s;
 INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at)
 VALUES(e,'web-push',encode(sha256(convert_to('ro-xm-close','UTF8')),'hex'),'RO-XM-LISA',s,1,'leased',3,clock_timestamp()+interval '60 seconds') RETURNING delivery_id INTO d;
 INSERT INTO ro_xm_notice(delivery,generation) VALUES(d,3);
END $$;
CREATE ROLE ro_xm_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_dispatch_dev TO ro_xm_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO ro_xm_dispatch;
SET SESSION AUTHORIZATION ro_xm_dispatch;
UPDATE ro_xm_notice k SET v3=(SELECT to_jsonb(x) FROM public.pwa_notify_content_v3(k.delivery,k.generation) x),v4=(SELECT to_jsonb(x) FROM public.pwa_notify_content_v4(k.delivery,k.generation) x);
RESET SESSION AUTHORIZATION;
DO $$
DECLARE k record; payee text:=(SELECT coalesce(nullif(btrim("Description"),''),"Borrower Name") FROM public."Borrowers" WHERE "Row ID"='RO-RXM');
BEGIN
 SELECT * INTO k FROM ro_xm_notice;
 PERFORM pg_temp.ro_assert(k.v4-'rebates'=k.v3,'v4: two-loan close, every column but rebates equals v3: '||k.v4::text||' vs '||k.v3::text);
 PERFORM pg_temp.ro_assert((k.v3->>'rebate_amount')::numeric=30 AND (k.v3->>'rebate_payable')::numeric=0 AND k.v3->>'rebate_payee'=payee,'v3 unchanged: the first rebate only (30, fully offset)');
 PERFORM pg_temp.ro_assert(k.v4->'rebates'=jsonb_build_array(jsonb_build_object('amount',30,'payee',payee,'payable',0),jsonb_build_object('amount',20,'payee',payee,'payable',0)),
  'v4 rebates: both rebates (30, 20) in expense order with the v3 payee and nothing payable: '||(k.v4->'rebates')::text);
END $$;
DROP OWNED BY ro_xm_dispatch;
DROP ROLE ro_xm_dispatch;
DELETE FROM public."Payments" WHERE "Row ID"='pwa:e7777777-7777-4777-8777-777777777771';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"='RO-RXM' AND "Payment Method"='Referral Rebate Offset') AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID" IN ('rr1:RO-LXM1','rr1:RO-LXM2')),'two-loan delete: both offsets and both expenses go with the closing payment');
 PERFORM pg_temp.ro_assert((SELECT count(*)=5 AND bool_and("Amount Remaining"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='RO-RXM-L'),'two-loan delete: the referrer charges reopen and stay booked (D4)');
 PERFORM pg_temp.ro_assert((SELECT count(*)=2 AND bool_and("Loan Status"='ยังไม่ปิดยอด') FROM public."Loans" WHERE "Row ID" IN ('RO-LXM1','RO-LXM2')),'two-loan delete: both referred loans reopen');
END $$;

-- 3d. R117 V131 edges (one payment closing two referred loans; which loan's trigger runs first is not fixed, so the checks
-- are order-free): A partial cover (rebates 300+300, referrer 5 a day: the schedule takes 470 in all, the rest stays payable),
-- B the second uncovered (rebates 1000+300: 470 in all), C both offsets on the same referrer due charge (100 due, 30+20).
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('RO-RQA','SYNTHETIC REFERRER V131 PARTIAL'),('RO-RQB','SYNTHETIC REFERRER V131 UNCOVERED'),('RO-RQC','SYNTHETIC REFERRER V131 SAME CHARGE');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('RO-BQA','SYNTHETIC REFERRED V131 PARTIAL','RO-RQA'),('RO-BQB','SYNTHETIC REFERRED V131 UNCOVERED','RO-RQB'),('RO-BQC','SYNTHETIC REFERRED V131 SAME CHARGE','RO-RQC');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM ro_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,1,false FROM (VALUES
  ('RO-RQA-L','RO-RQA',5),('RO-RQB-L','RO-RQB',5),('RO-RQC-L','RO-RQC',10),
  ('RO-LQA1','RO-BQA',100),('RO-LQA2','RO-BQA',100),('RO-LQB1','RO-BQB',100),('RO-LQB2','RO-BQB',100),('RO-LQC1','RO-BQC',100),('RO-LQC2','RO-BQC',100)) v(id,b,cdi);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM ro_day),v.p::money,v.i::money FROM (VALUES
  ('RO-RQA-today','RO-RQA-L',0,5),('RO-RQB-today','RO-RQB-L',0,5),('RO-RQC-today','RO-RQC-L',0,100),
  ('RO-LQA1-today','RO-LQA1',1000,3000),('RO-LQA2-today','RO-LQA2',1000,3000),('RO-LQB1-today','RO-LQB1',1000,10000),('RO-LQB2-today','RO-LQB2',1000,3000),
  ('RO-LQC1-today','RO-LQC1',1000,300),('RO-LQC2-today','RO-LQC2',1000,200)) v(id,loan,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('RO-RQA-L','RO-RQB-L','RO-RQC-L');
CREATE FUNCTION pg_temp.ro_pay2(request text,borrower text,c1 text,i1 int,c2 text,i2 int) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":1,"command":{"schemaVersion":7,"requestId":'||to_json(request)::text||',"borrowerId":'||to_json(borrower)::text||',"allocations":['
  ||(SELECT string_agg('{"chargeId":'||to_json(c)::text||',"principal":"1000","interest":"'||i||'","expectedPrincipalRemaining":"1000","expectedInterestRemaining":"'||i||'","chargeDate":"'||to_char((SELECT d FROM ro_day),'YYYY-MM-DD')||'"}',',' ORDER BY c COLLATE "C") FROM (VALUES (c1,i1),(c2,i2)) v(c,i))
  ||'],"cashAccountId":"CI-DAD","paymentDate":"'||to_char((SELECT d FROM ro_day),'YYYY-MM-DD')||'","amountReceived":"'||(2000+i1+i2)||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null},'
  ||'"actor":{"issuer":"https://ro.invalid","subject":"ro-owner","partnerId":"RO-ACT","loginEmail":"ro-actor@example.invalid"},"receipt":null}' $f$;
SELECT set_config('ro.q_a',pg_temp.ro_pay2('e8888888-8888-4888-8888-888888888881','RO-BQA','RO-LQA1-today',3000,'RO-LQA2-today',3000),true),
 set_config('ro.q_b',pg_temp.ro_pay2('e8888888-8888-4888-8888-888888888882','RO-BQB','RO-LQB1-today',10000,'RO-LQB2-today',3000),true),
 set_config('ro.q_c',pg_temp.ro_pay2('e8888888-8888-4888-8888-888888888883','RO-BQC','RO-LQC1-today',300,'RO-LQC2-today',200),true);
-- Each payment in its own deferred window, as each command is its own transaction.
SET CONSTRAINTS ALL DEFERRED;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN IF public.pwa_submit_selected_charges_v1(current_setting('ro.q_a'))->'originalOutcome'->>'status' IS DISTINCT FROM 'posted' THEN RAISE EXCEPTION 'FAILED: V131 A must post'; END IF; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN IF public.pwa_submit_selected_charges_v1(current_setting('ro.q_b'))->'originalOutcome'->>'status' IS DISTINCT FROM 'posted' THEN RAISE EXCEPTION 'FAILED: V131 B must post'; END IF; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN IF public.pwa_submit_selected_charges_v1(current_setting('ro.q_c'))->'originalOutcome'->>'status' IS DISTINCT FROM 'posted' THEN RAISE EXCEPTION 'FAILED: V131 C must post'; END IF; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ro_day);sc text;
BEGIN
 FOREACH sc IN ARRAY ARRAY['A','B','C'] LOOP
  PERFORM pg_temp.ro_assert((SELECT count(*)=2 AND bool_and("Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day) FROM public."Loans" WHERE "Row ID" IN ('RO-LQ'||sc||'1','RO-LQ'||sc||'2')),'V131 '||sc||': the payment closes both loans');
  -- Every offset payment of the referrer is one expense's own ro122:<closing payment>:<loan> link, posted and reconciled.
  PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Ref Borrower"='RO-RQ'||sc AND p."Payment Method"='Referral Rebate Offset'
    AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" x JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan" WHERE x."Ref Offset Payment"=p."Row ID" AND p."Row ID"='ro122:'||l."Ref Closing Payment"||':'||l."Row ID")),'V131 '||sc||': each offset is its own loan''s ro122:<payment>:<loan>');
  PERFORM pg_temp.ro_assert((SELECT bool_and(p."Status"='Posted' AND p."Amount Received"::numeric=(SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" a WHERE a."Ref Payment"=p."Row ID") AND p."Amount Received"::numeric<=x."Amount"::numeric)
    FROM public."Business Expenses" x JOIN public."Payments" p ON p."Row ID"=x."Ref Offset Payment" WHERE x."Ref Related Loan" IN ('RO-LQ'||sc||'1','RO-LQ'||sc||'2')),'V131 '||sc||': offsets posted, reconciled and within their rebate');
 END LOOP;
 -- A: 300 + 300 against a 470 schedule: one offset in full, the other partial (170); Lisa pays the 130 rest.
 PERFORM pg_temp.ro_assert((SELECT array_agg(p."Amount Received"::numeric ORDER BY p."Amount Received") FROM public."Payments" p WHERE p."Ref Borrower"='RO-RQA' AND p."Payment Method"='Referral Rebate Offset')=ARRAY[170,300]::numeric[],'V131 A: offsets of 300 and 170 (partial cover)');
 PERFORM pg_temp.ro_assert((SELECT bool_and("Amount Remaining"::numeric=0) AND max("Charge Date")<=day+93 FROM public."Charges" WHERE "Ref Loans"='RO-RQA-L'),'V131 A: the referrer schedule is paid up to the horizon, nothing beyond');
 PERFORM pg_temp.ro_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)=0
   FROM public."Cash Ledger" WHERE "Ref Business Expense" IN ('rr1:RO-LQA1','rr1:RO-LQA2') OR "Ref Payment" IN (SELECT "Row ID" FROM public."Payments" WHERE "Ref Borrower"='RO-RQA' AND "Payment Method"='Referral Rebate Offset'))
  AND public.pwa_rebates_owed_v1('RO-RQA')=130,'V131 A: Lisa cash nets to zero; 130 pending (R129)');
 -- B: 1000 + 300 against 470: 470 offset in all; the rest stays payable, the payment posted.
 PERFORM pg_temp.ro_assert((SELECT sum(p."Amount Received"::numeric)=470 FROM public."Payments" p WHERE p."Ref Borrower"='RO-RQB' AND p."Payment Method"='Referral Rebate Offset') AND (SELECT sum("Amount"::numeric)=1300 FROM public."Business Expenses" WHERE "Row ID" IN ('rr1:RO-LQB1','rr1:RO-LQB2')),'V131 B: 470 offset, 830 payable (second uncovered when the first takes the schedule)');
 PERFORM pg_temp.ro_assert((SELECT bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='RO-RQB-L'),'V131 B: the referrer schedule is paid up to the horizon');
 -- C: both offsets pay the same due charge (100): 30 + 20, 50 left, nothing booked forward.
 PERFORM pg_temp.ro_assert((SELECT array_agg(p."Amount Received"::numeric ORDER BY p."Amount Received") FROM public."Payments" p WHERE p."Ref Borrower"='RO-RQC' AND p."Payment Method"='Referral Rebate Offset')=ARRAY[20,30]::numeric[],'V131 C: offsets of 30 and 20');
 PERFORM pg_temp.ro_assert((SELECT count(*)=1 AND bool_and("Row ID"='RO-RQC-today' AND "Amount Remaining"::numeric=50) FROM public."Charges" WHERE "Ref Loans"='RO-RQC-L'),'V131 C: both pay the one due charge (50 left), nothing booked');
 PERFORM pg_temp.ro_assert((SELECT count(*)=2 FROM public."Repayments" r JOIN public."Payments" p ON p."Row ID"=r."Ref Payment" WHERE r."Ref Charges"='RO-RQC-today' AND p."Payment Method"='Referral Rebate Offset'),'V131 C: two repayments on the same charge, one per offset');
END $$;

-- 4. pwa_notify_content_v2: access like v1, and the rebate facts of a closed loan.
DO $$ BEGIN
 -- R119 (V134): v4 has the v3 owner, definer, search path, comment and ACL (the owner and the dispatch capability only).
 PERFORM pg_temp.ro_assert((SELECT p4.proowner=p3.proowner AND p4.prosecdef AND p3.prosecdef AND p4.proconfig=p3.proconfig AND obj_description(p4.oid,'pg_proc')=obj_description(p3.oid,'pg_proc')
   FROM pg_proc p3,pg_proc p4 WHERE p3.oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure AND p4.oid='public.pwa_notify_content_v4(uuid,bigint)'::regprocedure),'v4 has the v3 owner, definer header, search path and comment');
 PERFORM pg_temp.ro_assert((SELECT array_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type ORDER BY 1) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v4(uuid,bigint)'::regprocedure)
   =(SELECT array_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type ORDER BY 1) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure),'v4 ACL equals the v3 ACL');
 PERFORM pg_temp.ro_assert(has_function_privilege('mw_notify_dispatch_dev','public.pwa_notify_content_v4(uuid,bigint)','EXECUTE') AND NOT has_function_privilege('mw_app_dev','public.pwa_notify_content_v4(uuid,bigint)','EXECUTE') AND NOT has_function_privilege('public','public.pwa_notify_content_v4(uuid,bigint)','EXECUTE'),'v4: only notify dispatch executes');
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

-- 5. R120 V135: referral rebate terms per referrer (RO-T*). Each referred loan has profit 2,400 (one charge today, 1,000
-- principal and 2,400 interest), closed by the Loan Close command as the command user. Terms: D default, R rate 15 (set by the
-- borrower command), C cap 150, B rate 50 and cap 1,500, Z rate 0, O rate 15 with an open referrer loan (offset path), X the
-- drift guard (the terms change between the quote and the trigger).
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('RO-RTD','SYNTHETIC REFERRER TERMS DEFAULT'),('RO-RTR','SYNTHETIC REFERRER TERMS RATE'),('RO-RTC','SYNTHETIC REFERRER TERMS CAP'),
 ('RO-RTB','SYNTHETIC REFERRER TERMS BOTH'),('RO-RTZ','SYNTHETIC REFERRER TERMS ZERO'),('RO-RTO','SYNTHETIC REFERRER TERMS OFFSET'),('RO-RTX','SYNTHETIC REFERRER TERMS DRIFT');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES
 ('RO-BTD','SYNTHETIC REFERRED TERMS DEFAULT','RO-RTD'),('RO-BTR','SYNTHETIC REFERRED TERMS RATE','RO-RTR'),('RO-BTC','SYNTHETIC REFERRED TERMS CAP','RO-RTC'),
 ('RO-BTB','SYNTHETIC REFERRED TERMS BOTH','RO-RTB'),('RO-BTZ','SYNTHETIC REFERRED TERMS ZERO','RO-RTZ'),('RO-BTO','SYNTHETIC REFERRED TERMS OFFSET','RO-RTO'),('RO-BTX','SYNTHETIC REFERRED TERMS DRIFT','RO-RTX');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM ro_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,1,false FROM (VALUES
  ('RO-RTO-L','RO-RTO',10),('RO-RTX-L','RO-RTX',10),
  ('RO-LTD','RO-BTD',100),('RO-LTR','RO-BTR',100),('RO-LTC','RO-BTC',100),('RO-LTB','RO-BTB',100),('RO-LTZ','RO-BTZ',100),('RO-LTO','RO-BTO',100),('RO-LTX','RO-BTX',100)) v(id,b,cdi);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM ro_day),0::money,v.i::money FROM (VALUES
  ('RO-RTO-today','RO-RTO-L',10),('RO-RTX-today','RO-RTX-L',10),
  ('RO-LTD-today','RO-LTD',2400),('RO-LTR-today','RO-LTR',2400),('RO-LTC-today','RO-LTC',2400),('RO-LTB-today','RO-LTB',2400),('RO-LTZ-today','RO-LTZ',2400),('RO-LTO-today','RO-LTO',2400),('RO-LTX-today','RO-LTX',2400)) v(id,loan,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'RO-%T%' AND "Row ID" ~ '^RO-(RT.-L|LT.)$';
-- The borrower update as the canonical operation text (the stored fields, then the optional terms in `extra`).
CREATE FUNCTION pg_temp.ro_borrower(request text,id text,extra text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://ro.invalid","subject":"ro-owner","partnerId":"RO-ACT","loginEmail":"ro-actor@example.invalid"},"command":{"schemaVersion":1,"operation":"borrower.update","targetType":"borrower","targetId":'
  ||to_json(id)::text||',"expectedVersion":'||to_json(public.pwa_borrower_version_v2(id))::text||',"predecessorRequestId":null,"inputs":{"name":'||coalesce(to_json(b."Borrower Name")::text,'null')
  ||',"description":'||coalesce(to_json(b."Description")::text,'null')||',"communicationName":'||coalesce(to_json(b."Communication Name")::text,'null')
  ||',"instagramUsername":'||coalesce(to_json(b."Instagram Username")::text,'null')||',"city":'||coalesce(to_json(b."City")::text,'null')||',"workingLocation":'||coalesce(to_json(b."Working Location")::text,'null')
  ||',"address":'||coalesce(to_json(b."Address")::text,'null')||',"hidden":'||coalesce(to_json(b."Hidden Flag")::text,'null')||',"referrerId":'||coalesce(to_json(b."Ref Referrer")::text,'null')
  ||',"preferredReceivingAccountId":'||coalesce(to_json(b."Ref Preferred Receiving Cash Account")::text,'null')||',"note":'||coalesce(to_json(b."Borrower Note")::text,'null')||extra||'}},"receipt":null}'
 FROM public."Borrowers" b WHERE b."Row ID"=id $f$;
-- Built before any submit: the rate through the command; a stale edit with the version before it; invalid term inputs.
SELECT set_config('ro.t_rate',pg_temp.ro_borrower('f1111111-1111-4111-8111-111111111111','RO-RTR',',"referralRebateRate":15,"referralRebateCap":null'),true),
 set_config('ro.t_stale',pg_temp.ro_borrower('f1111111-1111-4111-8111-111111111112','RO-RTR',''),true),
 set_config('ro.t_plain',pg_temp.ro_borrower('f1111111-1111-4111-8111-111111111113','RO-RTD',''),true),
 set_config('ro.t_bad',(SELECT string_agg(pg_temp.ro_borrower('f2222222-2222-4222-8222-22222222222'||n,'RO-RTD',x),E'\x1f' ORDER BY n) FROM (VALUES
   (1,',"referralRebateRate":"15"'),(2,',"referralRebateRate":12.5'),(3,',"referralRebateRate":101'),(4,',"referralRebateRate":-1'),(5,',"referralRebateCap":0'),
   (6,',"referralRebateRate":15.0'),(7,',"referralRebateRate":1e1'),(8,',"referralRebateCap":true'),(9,',"referralRebateCap":1500,"referralRebateRate":15')) v(n,x)),true);
SELECT set_config('ro.t_v0',public.pwa_borrower_version_v2('RO-RTR'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;c text;
BEGIN
 r:=public.pwa_submit_operation_v2(current_setting('ro.t_rate'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: terms through borrower.update must apply: %',r; END IF;
 r:=public.pwa_submit_operation_v2(current_setting('ro.t_stale'));
 IF r->'originalOutcome'->>'code' IS DISTINCT FROM 'source_conflict' THEN RAISE EXCEPTION 'FAILED: an edit on the version before the terms change is a source_conflict: %',r; END IF;
 r:=public.pwa_submit_operation_v2(current_setting('ro.t_plain'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: a borrower.update without the terms keeps working: %',r; END IF;
 FOREACH c IN ARRAY string_to_array(current_setting('ro.t_bad'),E'\x1f') LOOP
  BEGIN PERFORM public.pwa_submit_operation_v2(c); RAISE EXCEPTION 'FAILED: invalid terms accepted: %',c;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "Referral Rebate Rate"=15 AND "Referral Rebate Cap" IS NULL FROM public."Borrowers" WHERE "Row ID"='RO-RTR'),'T: borrower.update writes the rate (15) and the null cap');
 PERFORM pg_temp.ro_assert((SELECT canonical_json LIKE '%"note":null,"referralRebateRate":15,"referralRebateCap":null}%' FROM public.pwa_payment_commands WHERE request_id='f1111111-1111-4111-8111-111111111111'),'T: the canonical text keeps the JSON numbers after note');
 PERFORM pg_temp.ro_assert(public.pwa_borrower_version_v2('RO-RTR') IS DISTINCT FROM current_setting('ro.t_v0'),'T: the terms are part of the borrower version');
 PERFORM pg_temp.ro_assert((SELECT "Referral Rebate Rate" IS NULL AND "Referral Rebate Cap" IS NULL FROM public."Borrowers" WHERE "Row ID"='RO-RTD'),'T: an update without the keys leaves the terms as they are');
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id::text LIKE 'f2222222-%'),'T: invalid term inputs record nothing');
 -- The column checks refuse a rate above 100, a fraction and a cap of 0.
 BEGIN UPDATE public."Borrowers" SET "Referral Rebate Rate"=101 WHERE "Row ID"='RO-RTD'; RAISE EXCEPTION 'FAILED: rate 101 stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public."Borrowers" SET "Referral Rebate Rate"=12.5 WHERE "Row ID"='RO-RTD'; RAISE EXCEPTION 'FAILED: rate 12.5 stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public."Borrowers" SET "Referral Rebate Cap"=0 WHERE "Row ID"='RO-RTD'; RAISE EXCEPTION 'FAILED: cap 0 stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM pg_temp.ro_assert(public.referral_rebate_terms('RO-RTD')='{"rate":10,"cap":1000,"custom":false}'::jsonb AND public.referral_rebate_terms('RO-NO-SUCH')='{"rate":10,"cap":1000,"custom":false}'::jsonb
   AND public.referral_rebate_terms('RO-RTR')='{"rate":15,"cap":1000,"custom":true}'::jsonb,'T: the terms with their defaults (unknown id: the defaults)');
END $$;
UPDATE public."Borrowers" SET "Referral Rebate Cap"=150 WHERE "Row ID"='RO-RTC';
UPDATE public."Borrowers" SET "Referral Rebate Rate"=50,"Referral Rebate Cap"=1500 WHERE "Row ID"='RO-RTB';
UPDATE public."Borrowers" SET "Referral Rebate Rate"=0 WHERE "Row ID"='RO-RTZ';
UPDATE public."Borrowers" SET "Referral Rebate Rate"=15 WHERE "Row ID"='RO-RTO';
-- The projection (the Loan Close preview) before each close equals what the trigger books.
CREATE TEMP TABLE ro_terms(loan text PRIMARY KEY,amount numeric,rate numeric,cap numeric,custom boolean) ON COMMIT DROP;
INSERT INTO ro_terms VALUES('RO-LTD',240,10,1000,false),('RO-LTR',360,15,1000,true),('RO-LTC',150,10,150,true),('RO-LTB',1200,50,1500,true),('RO-LTO',360,15,1000,true);
DO $$
DECLARE t record;p jsonb;
BEGIN
 FOR t IN SELECT * FROM ro_terms LOOP
  p:=public.pwa_referral_rebate_projection_v1(t.loan,public.loan_close_calculation_v83(t.loan,(SELECT d FROM ro_day)));
  PERFORM pg_temp.ro_assert(p->>'amount'=t.amount::text AND p->>'profit'='2400' AND p->'rate'=to_jsonb(t.rate) AND p->'cap'=to_jsonb(t.cap) AND p->'custom'=to_jsonb(t.custom)
    AND p ?& ARRAY['referrerId','referrerName','referrerDescription','selfReferral','hasOpenLoan'],'T projection '||t.loan||': '||p::text);
 END LOOP;
 PERFORM pg_temp.ro_assert(public.pwa_referral_rebate_projection_v1('RO-LTZ',public.loan_close_calculation_v83('RO-LTZ',(SELECT d FROM ro_day))) IS NULL,'T projection: rate 0 shows no rebate');
END $$;
SELECT set_config('ro.t_d',pg_temp.ro_close('f3333333-3333-4333-8333-333333333331','RO-LTD','expense'),true),
 set_config('ro.t_r',pg_temp.ro_close('f3333333-3333-4333-8333-333333333332','RO-LTR','expense'),true),
 set_config('ro.t_c',pg_temp.ro_close('f3333333-3333-4333-8333-333333333333','RO-LTC','expense'),true),
 set_config('ro.t_b',pg_temp.ro_close('f3333333-3333-4333-8333-333333333334','RO-LTB','expense'),true),
 set_config('ro.t_z',pg_temp.ro_close('f3333333-3333-4333-8333-333333333335','RO-LTZ','offset'),true),
 set_config('ro.t_o',pg_temp.ro_close('f3333333-3333-4333-8333-333333333336','RO-LTO','offset'),true),
 set_config('ro.t_x',pg_temp.ro_close('f3333333-3333-4333-8333-333333333337','RO-LTX','offset'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['ro.t_d','ro.t_r','ro.t_c','ro.t_b','ro.t_z','ro.t_o'] LOOP
  r:=public.pwa_submit_operation_v2(current_setting(k));
  IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: % must apply: %',k,r; END IF;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE t record;off text;
BEGIN
 FOR t IN SELECT * FROM ro_terms LOOP
  PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=t.amount AND "Rebate Rate"=t.rate AND "Rebate Cap"=t.cap AND "Rule Version"='REFERRAL_REBATE_V3' AND "Gross Profit Basis"::numeric=2400
    FROM public."Business Expenses" WHERE "Row ID"='rr1:'||t.loan),'T '||t.loan||': expense '||t.amount||' with rate '||t.rate||', cap '||t.cap||', REFERRAL_REBATE_V3 (R129)');
  PERFORM pg_temp.ro_assert((SELECT (result_json#>>'{rebate,amount}')::numeric=t.amount FROM public.pwa_payment_commands WHERE canonical_json::jsonb#>>'{command,targetId}'=t.loan AND canonical_json::jsonb#>>'{command,operation}'='loan.close'),'T '||t.loan||': the stored quote equals the booked rebate');
 END LOOP;
 PERFORM pg_temp.ro_assert((SELECT "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"='RO-LTZ') AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Ref Related Loan"='RO-LTZ')
   AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"='RO-RTZ'),'T rate 0: the loan closes, no expense and no offset');
 PERFORM pg_temp.ro_assert((SELECT result_json->'rebate' IS NULL FROM public.pwa_payment_commands WHERE request_id='f3333333-3333-4333-8333-333333333335'),'T rate 0: the close stores no rebate');
 -- Offset path: the custom rebate (360) is settled on the referrer's open loan (10 due, then the next 35 charges of 10).
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='RO-RTO' AND "Payment Method"='Referral Rebate Offset';
 PERFORM pg_temp.ro_assert(off IS NOT NULL AND (SELECT "Amount Received"::numeric=360 AND "Status"='Posted' FROM public."Payments" WHERE "Row ID"=off)
   AND (SELECT "Ref Offset Payment"=off FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LTO'),'T offset: one offset payment of the custom 360, linked from the expense');
 PERFORM pg_temp.ro_assert((SELECT sum("Allocated Amount"::numeric)=360 FROM public."Payment Allocations" WHERE "Ref Payment"=off),'T offset: allocations reconcile to the custom rebate');
END $$;
-- A later change of the referrer's terms never restates a booked rebate.
UPDATE public."Borrowers" SET "Referral Rebate Rate"=20 WHERE "Row ID"='RO-RTR';
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=360 AND "Rebate Rate"=15 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LTR'),'T: the booked rebate keeps its terms after the referrer changes them');
END $$;
-- Re-close after deleting the closing payment uses the terms current then (cap 150 -> 200: min(240, 200)).
DELETE FROM public."Payments" WHERE "Row ID"=(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RO-LTC');
SET CONSTRAINTS ALL IMMEDIATE;
UPDATE public."Borrowers" SET "Referral Rebate Cap"=200 WHERE "Row ID"='RO-RTC';
DO $$ BEGIN
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LTC') AND (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RO-LTC'),'T re-close: the old expense went with the closing payment');
END $$;
SELECT set_config('ro.t_c2',pg_temp.ro_close('f3333333-3333-4333-8333-333333333338','RO-LTC','expense'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb:=public.pwa_submit_operation_v2(current_setting('ro.t_c2'));
BEGIN IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: terms re-close must apply: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "Amount"::numeric=200 AND "Rebate Rate"=10 AND "Rebate Cap"=200 FROM public."Business Expenses" WHERE "Row ID"='rr1:RO-LTC'),'T re-close: the new expense uses the new cap (200)');
END $$;
-- Drift guard: the referrer's terms change after the command quoted the rebate and before the trigger books it (here inside
-- the command, by a test-only trigger on the applied journal insert): the offset check refuses (P4C05, which the Loan Close
-- maps to plan_changed), the close and the terms change roll back and the command is recorded as rejected.
CREATE FUNCTION public.ro_terms_drift() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN IF NEW.outcome='applied' AND NEW.canonical_json::jsonb#>>'{command,targetId}'='RO-LTX' THEN UPDATE public."Borrowers" SET "Referral Rebate Rate"=20 WHERE "Row ID"='RO-RTX'; END IF; RETURN NEW; END $f$;
CREATE TRIGGER ro_terms_drift AFTER INSERT ON public.pwa_payment_commands FOR EACH ROW EXECUTE FUNCTION public.ro_terms_drift();
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb:=public.pwa_submit_operation_v2(current_setting('ro.t_x'));
BEGIN IF r->'originalOutcome'->>'code' IS DISTINCT FROM 'plan_changed' THEN RAISE EXCEPTION 'FAILED: a close whose rebate terms changed after the quote must be plan_changed: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;
DROP TRIGGER ro_terms_drift ON public.pwa_payment_commands;
DROP FUNCTION public.ro_terms_drift();
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RO-LTX') AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Ref Related Loan"='RO-LTX')
   AND (SELECT outcome='rejected' FROM public.pwa_payment_commands WHERE request_id='f3333333-3333-4333-8333-333333333337') AND (SELECT "Referral Rebate Rate" IS NULL FROM public."Borrowers" WHERE "Row ID"='RO-RTX'),'T drift: the close and the terms change rolled back together');
END $$;
-- 6. R153 V148: the borrower's Instagram group chat link ("IG Group URL", input igGroupUrl after referralRebateCap). Invented
-- thread ids and links only. Through borrower.update and borrower.create as the command user: set, kept by an update without
-- the key, set after the terms, cleared by null; invalid values and a wrong key order are invalid canonical operations that
-- record nothing; the column check refuses a bad value written directly; the version hashes the link and equals the Node
-- mirror (services/business/borrowers.mjs versionSql, pasted below).
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES ('RO-IGU','SYNTHETIC IG GROUP LINK');
CREATE FUNCTION pg_temp.ro_ig_mirror(id text) RETURNS text LANGUAGE sql AS $f$ SELECT encode(sha256(convert_to((jsonb_build_object('id',b."Row ID",'createdDate',b."Creation Date",'aiCollectionEnabled',b."AI Collection Enabled",'name',b."Borrower Name",'description',b."Description",'communicationName',b."Communication Name",'instagramUsername',b."Instagram Username",'city',b."City",'workingLocation',b."Working Location",'address',b."Address",'hidden',b."Hidden Flag",'referrerId',b."Ref Referrer",'preferredReceivingAccountId',b."Ref Preferred Receiving Cash Account",'note',b."Borrower Note")||CASE WHEN to_jsonb(b)?'Referral Rebate Rate' THEN jsonb_build_object('referralRebateRate',to_jsonb(b)->'Referral Rebate Rate','referralRebateCap',to_jsonb(b)->'Referral Rebate Cap') ELSE '{}'::jsonb END||CASE WHEN to_jsonb(b)?'IG Group URL' THEN jsonb_build_object('igGroupUrl',to_jsonb(b)->'IG Group URL') ELSE '{}'::jsonb END)::text,'UTF8')),'hex') FROM public."Borrowers" b WHERE b."Row ID"=id $f$;
SELECT set_config('ro.ig_v0',public.pwa_borrower_version_v2('RO-IGU'),true),
 set_config('ro.ig_set',pg_temp.ro_borrower('f4444444-4444-4444-8444-444444444441','RO-IGU',',"igGroupUrl":"https://www.instagram.com/direct/t/100000000000001/"'),true),
 set_config('ro.ig_bad',(SELECT string_agg(pg_temp.ro_borrower('f5555555-5555-4555-8555-5555555555'||lpad(n::text,2,'0'),'RO-IGU',x),E'\x1f' ORDER BY n) FROM (VALUES
   (1,',"igGroupUrl":"http://www.instagram.com/direct/t/100000000000001/"'),(2,',"igGroupUrl":"https://www.example.invalid/direct/t/1/"'),
   (3,',"igGroupUrl":"https://user@www.instagram.com/direct/t/1/"'),(4,',"igGroupUrl":"https://www.instagram.com/direct/t/1 2/"'),
   (5,',"igGroupUrl":"https://ig.me/'||repeat('a',256)||'"'),(6,',"igGroupUrl":""'),(7,',"igGroupUrl":1'),(8,',"igGroupUrl":true'),
   (9,',"igGroupUrl":"https://www.instagram.com/invented_user/"'),(10,',"igGroupUrl":"https://www.instagram.com.example.invalid/direct/t/1/"'),
   (11,',"igGroupUrl":"https://www.instagram.com/direct/t/100000000000001/","referralRebateCap":null'),(12,',"igGroupUrl":"https://www.instagram.com/direct/t/1#x"')) v(n,x)),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;c text;
BEGIN
 r:=public.pwa_submit_operation_v2(current_setting('ro.ig_set'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: the link through borrower.update must apply: %',r; END IF;
 FOREACH c IN ARRAY string_to_array(current_setting('ro.ig_bad'),E'\x1f') LOOP
  BEGIN PERFORM public.pwa_submit_operation_v2(c); RAISE EXCEPTION 'FAILED: invalid link input accepted: %',c;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "IG Group URL"='https://www.instagram.com/direct/t/100000000000001/' FROM public."Borrowers" WHERE "Row ID"='RO-IGU'),'IG: borrower.update writes the link');
 PERFORM pg_temp.ro_assert((SELECT canonical_json LIKE '%"note":null,"igGroupUrl":"https://www.instagram.com/direct/t/100000000000001/"}}%' FROM public.pwa_payment_commands WHERE request_id='f4444444-4444-4444-8444-444444444441'),'IG: the canonical text has the link last, as a JSON string');
 PERFORM pg_temp.ro_assert(public.pwa_borrower_version_v2('RO-IGU') IS DISTINCT FROM current_setting('ro.ig_v0'),'IG: the link is part of the borrower version');
 PERFORM pg_temp.ro_assert(NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id::text LIKE 'f5555555-%'),'IG: invalid link inputs record nothing');
END $$;
-- An update without the key keeps the link; then the terms and an ig.me link in canonical order.
SELECT set_config('ro.ig_plain',pg_temp.ro_borrower('f4444444-4444-4444-8444-444444444442','RO-IGU',''),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ DECLARE r jsonb:=public.pwa_submit_operation_v2(current_setting('ro.ig_plain'));
BEGIN IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: an update without the link must apply: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN PERFORM pg_temp.ro_assert((SELECT "IG Group URL"='https://www.instagram.com/direct/t/100000000000001/' FROM public."Borrowers" WHERE "Row ID"='RO-IGU'),'IG: an update without the key keeps the link'); END $$;
SELECT set_config('ro.ig_terms',pg_temp.ro_borrower('f4444444-4444-4444-8444-444444444443','RO-IGU',',"referralRebateRate":15,"referralRebateCap":null,"igGroupUrl":"https://ig.me/j/InventedLink01/"'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ DECLARE r jsonb:=public.pwa_submit_operation_v2(current_setting('ro.ig_terms'));
BEGIN IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: terms then the link must apply: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "IG Group URL"='https://ig.me/j/InventedLink01/' AND "Referral Rebate Rate"=15 FROM public."Borrowers" WHERE "Row ID"='RO-IGU'),'IG: the link after the terms is written with them');
 PERFORM pg_temp.ro_assert(public.pwa_borrower_version_v2('RO-IGU')=pg_temp.ro_ig_mirror('RO-IGU'),'IG: the Node mirror equals pwa_borrower_version_v2 (link and terms set)');
END $$;
-- null clears; a create carries the link; both versions equal the mirror.
SELECT set_config('ro.ig_clear',pg_temp.ro_borrower('f4444444-4444-4444-8444-444444444444','RO-IGU',',"igGroupUrl":null'),true),
 set_config('ro.ig_create','{"contractVersion":2,"requestId":"f4444444-4444-4444-8444-444444444445","actor":{"issuer":"https://ro.invalid","subject":"ro-owner","partnerId":"RO-ACT","loginEmail":"ro-actor@example.invalid"},"command":{"schemaVersion":1,"operation":"borrower.create","targetType":"borrower","targetId":"f6666666-6666-4666-8666-666666666661","expectedVersion":null,"predecessorRequestId":null,"inputs":{"name":"SYNTHETIC IG CREATE","description":null,"communicationName":null,"instagramUsername":null,"city":null,"workingLocation":null,"address":null,"hidden":false,"referrerId":null,"preferredReceivingAccountId":null,"note":null,"igGroupUrl":"https://instagram.com/direct/t/100000000000002"}},"receipt":null}',true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_submit_operation_v2(current_setting('ro.ig_clear'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: null must clear the link: %',r; END IF;
 r:=public.pwa_submit_operation_v2(current_setting('ro.ig_create'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: borrower.create with the link must apply: %',r; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.ro_assert((SELECT "IG Group URL" IS NULL FROM public."Borrowers" WHERE "Row ID"='RO-IGU'),'IG: null clears the link');
 PERFORM pg_temp.ro_assert((SELECT "IG Group URL"='https://instagram.com/direct/t/100000000000002' FROM public."Borrowers" WHERE "Row ID"='f6666666-6666-4666-8666-666666666661'),'IG: borrower.create writes the link');
 PERFORM pg_temp.ro_assert((SELECT bool_and(public.pwa_borrower_version_v2(id)=pg_temp.ro_ig_mirror(id)) FROM unnest(ARRAY['RO-IGU','f6666666-6666-4666-8666-666666666661','RO-RTR','RO-RTD']) id),'IG: the Node mirror equals pwa_borrower_version_v2 (cleared, created, terms, defaults)');
 -- The column check refuses a bad value written directly (blank included); a valid one is stored.
 BEGIN UPDATE public."Borrowers" SET "IG Group URL"='http://www.instagram.com/direct/t/100000000000001/' WHERE "Row ID"='RO-IGU'; RAISE EXCEPTION 'FAILED: an http link stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public."Borrowers" SET "IG Group URL"='' WHERE "Row ID"='RO-IGU'; RAISE EXCEPTION 'FAILED: a blank link stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public."Borrowers" SET "IG Group URL"='https://ig.me/'||repeat('a',256) WHERE "Row ID"='RO-IGU'; RAISE EXCEPTION 'FAILED: a 256-character tail stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public."Borrowers" SET "IG Group URL"='https://ig.me/'||repeat('a',255) WHERE "Row ID"='RO-IGU';
END $$;
SELECT 'Rebate offset regressions passed' AS result;
ROLLBACK;
