-- R112 V125 agent receipt command schemaVersion 9 (disposable cluster only; synthetic rows; everything rolls back).
-- pwa_submit_agent_receipt_v1 runs as the DEV command IAM user (it checks session_user); setup and checks run as postgres.
-- Behaviour asserted, not field order:
--  * v9 posts a slip above what is due through the pay-forward plan: forward, principal (raise) and split, as the R110 v10 command does
--    (Selected Charges, reconciled allocations, repayments and one cash row), booking the charges the plan named;
--  * the server recomputes the plan under the borrower -> loans -> charges locks and rejects drift or tampering as selection_unavailable
--    with nothing booked and no payment;
--  * one slip, one request id: a replay is the recorded outcome, a different purpose under the same id conflicts;
--  * v7 (a slip that is due, Lump Sum) is unchanged; only the AI Reviewer's Partner may post a reviewed slip;
--  * the plan provenance resolves for the posted payment; the agent reporting role may read the plan (and nothing else new);
--  * a v9 slip that closes a referred loan offsets the rebate to the referrer's open loan exactly as V124 does.
-- The canonical text is the server's compact JSON (no spaces), byte for byte.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.aa_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE aa_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON aa_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('AA-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","AI Reviewer","IG Integration Enabled") VALUES('AA-ACT','Synthetic AI reviewer','A','aa-actor@example.invalid',true,true);
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","AI Reviewer","IG Integration Enabled") VALUES('AA-PLAIN','Synthetic plain partner','A','aa-plain@example.invalid',false,false);
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('AA-CAP','AA-FUND',(SELECT d FROM aa_day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('AA-RF','SYNTHETIC AGENT REFERRER');
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('AA-B1','SYNTHETIC AGENT FORWARD'),('AA-B2','SYNTHETIC AGENT PRINCIPAL'),('AA-B3','SYNTHETIC AGENT SPLIT'),('AA-B4','SYNTHETIC AGENT DRIFT'),('AA-B5','SYNTHETIC AGENT DUE'),('AA-B6','SYNTHETIC AGENT TAMPER'),('AA-B8','SYNTHETIC AGENT YESTERDAY');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('AA-B7','SYNTHETIC AGENT CLOSES','AA-RF');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM aa_day)-3,v.pa::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,v.n,false FROM (VALUES
  ('AA-L1','AA-B1',1000,10,1),('AA-L2','AA-B2',1000,10,7),('AA-L3','AA-B3',1000,10,1),('AA-L4','AA-B4',1000,10,1),('AA-L5','AA-B5',1000,10,1),('AA-L6','AA-B6',1000,10,1),('AA-L8','AA-B8',1000,10,1),
  ('AA-RFL','AA-RF',1000,10,1),('AA-L7','AA-B7',1000,100,1),('AA-L0B','AA-B7',1000,10,1)) v(id,b,pa,cdi,n);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM aa_day),v.p::money,v.i::money FROM (VALUES
  ('AA-L1-today','AA-L1',0,10),('AA-L2-today','AA-L2',0,70),('AA-L3-today','AA-L3',0,10),('AA-L4-today','AA-L4',0,10),('AA-L5-today','AA-L5',0,10),('AA-L6-today','AA-L6',0,10),('AA-L8-today','AA-L8',0,10),
  ('AA-RFL-today','AA-RFL',0,10),('AA-L0B-today','AA-L0B',0,10)) v(id,loan,p,i);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('AA-L7-today','AA-L7',(SELECT d FROM aa_day),1000::money,300::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'AA-%';

CREATE FUNCTION pg_temp.aa_rid(review text) RETURNS text LANGUAGE sql AS $f$
 WITH h AS (SELECT sha256(convert_to('["mw-credit-agent-receipt-v1","dev",'||to_json(review)::text||']','UTF8')) b)
 SELECT encode(set_byte(set_byte(substring(h.b FROM 1 FOR 16),6,(get_byte(h.b,6)&15)|64),8,(get_byte(h.b,8)&63)|128),'hex') FROM h $f$;
CREATE FUNCTION pg_temp.aa_uuid(hex text) RETURNS text LANGUAGE sql AS $f$ SELECT (substr(hex,1,8)||'-'||substr(hex,9,4)||'-'||substr(hex,13,4)||'-'||substr(hex,17,4)||'-'||substr(hex,21,12)) $f$;
CREATE FUNCTION pg_temp.aa_plan(borrower text,amount int,purpose jsonb) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT public.pwa_pay_forward_plan_v1(borrower,amount::numeric,(SELECT d FROM aa_day),purpose) $f$;
-- The agent command as canonical text (V125: compact JSON.stringify form, no spaces; key order schemaVersion, requestId, environment,
-- reviewId, mode, borrowerId, cashAccountId, amountReceived, paymentDate, transferTime, bankReference, payerLines, purpose, allocations,
-- materialize, principal, proposalSha256, archiveEvidence). version 7: the v7 keys without the plan; version 9: the purpose and the
-- plan's three lists exactly as the server computes them, each ordered (allocations and materialize by chargeId, principal by loanId, C).
CREATE FUNCTION pg_temp.aa_cmd(review text,borrower text,amount int,version int,purpose jsonb,actor text DEFAULT 'aa-actor@example.invalid',partner text DEFAULT 'AA-ACT',dayoff int DEFAULT 0) RETURNS text LANGUAGE sql AS $f$
 WITH p AS (SELECT CASE WHEN version=9 THEN pg_temp.aa_plan(borrower,amount,purpose) END plan),
  t AS (SELECT extract(epoch FROM (((SELECT d FROM aa_day)+dayoff)::timestamp+interval '5 hours'))::bigint cap,encode(sha256(convert_to('receipt:'||review,'UTF8')),'hex') rid,encode(sha256(convert_to('raw:'||review,'UTF8')),'hex') raw)
 SELECT '{"contractVersion":1,"command":{"schemaVersion":'||CASE WHEN version=9 THEN 9 ELSE 7 END||',"requestId":"'||pg_temp.aa_uuid(pg_temp.aa_rid(review))||'","environment":"dev","reviewId":'||to_json(review)::text
  ||',"mode":"reviewed","borrowerId":'||to_json(borrower)::text||',"cashAccountId":"CI-DAD","amountReceived":"'||amount||'","paymentDate":"'||to_char((SELECT d FROM aa_day)+dayoff,'YYYY-MM-DD')
  ||'","transferTime":"12:10","bankReference":"AAREF'||upper(substr(md5(review),1,8))||'"'||CASE WHEN version=9 THEN ',"payerLines":null' ELSE '' END
  ||CASE WHEN version=9 THEN ',"purpose":{"forward":'||(purpose->>'forward')||',"principal":['||coalesce((SELECT string_agg('{"loanId":'||to_json(q->>'loanId')::text||',"amount":'||to_json(q->>'amount')::text||'}',',' ORDER BY q->>'loanId' COLLATE "C") FROM jsonb_array_elements(purpose->'principal') q),'')||'],"loans":null}'
   ||',"allocations":['||coalesce((SELECT string_agg('{"chargeId":'||to_json(l->>'chargeId')::text||',"principal":'||to_json(l->>'principal')::text||',"interest":'||to_json(l->>'interest')::text||',"expectedPrincipalRemaining":'||to_json(l->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(l->>'expectedInterestRemaining')::text||',"chargeDate":'||to_json(l->>'chargeDate')::text||'}',',' ORDER BY l->>'chargeId' COLLATE "C") FROM jsonb_array_elements(p.plan->'allocations') l),'')
   ||'],"materialize":['||coalesce((SELECT string_agg('{"loanId":'||to_json(e->>'loanId')::text||',"chargeId":'||to_json(e->>'chargeId')::text||',"chargeDate":'||to_json(e->>'chargeDate')::text||',"principalDue":'||to_json(e->>'principalDue')::text||',"interestDue":'||to_json(e->>'interestDue')::text||'}',',' ORDER BY e->>'chargeId' COLLATE "C") FROM jsonb_array_elements(p.plan->'materialize') e),'')
   ||'],"principal":['||coalesce((SELECT string_agg('{"loanId":'||to_json(x->>'loanId')::text||',"kind":'||to_json(x->>'kind')::text||',"chargeId":'||to_json(x->>'chargeId')::text||',"chargeDate":'||to_json(x->>'chargeDate')::text||',"amount":'||to_json(req->>'amount')::text||',"accruedInterest":'||to_json(x->>'accruedInterest')::text||',"principalDue":'||to_json(x->>'principalDue')::text||'}',',' ORDER BY x->>'loanId' COLLATE "C")
      FROM jsonb_array_elements(p.plan->'principal') x,jsonb_array_elements(purpose->'principal') req WHERE req->>'loanId'=x->>'loanId'),'')||']' ELSE '' END
  ||',"proposalSha256":"'||repeat('c',64)||'","archiveEvidence":{"receiptId":"'||t.rid||'","objectKey":"receipts/dev/'||to_char(to_timestamp(t.cap) AT TIME ZONE 'UTC','YYYY/MM/DD')||'/'||t.rid||'/'||t.raw||'.png","generation":"1","rawSha256":"'||t.raw||'","mimeType":"image/png","sizeBytes":100,"capturedAt":"'||t.cap||'"}'
  ||'},"actor":{"issuer":"https://accounts.google.com","subject":"737787224638","partnerId":"'||partner||'","loginEmail":"'||actor||'"},"receipt":null}'
 FROM t,p $f$;
-- Commands, all built before any submit so every plan sees the untouched fixture.
SELECT set_config('aa.fwd',pg_temp.aa_cmd('aa-review-fwd','AA-B1',60,9,'{"forward":true,"principal":[],"loans":null}'),true),
 set_config('aa.fwd_other',pg_temp.aa_cmd('aa-review-fwd','AA-B1',60,9,'{"forward":false,"principal":[{"loanId":"AA-L1","amount":"50"}],"loans":null}'),true),
 set_config('aa.prin',pg_temp.aa_cmd('aa-review-prin','AA-B2',270,9,'{"forward":false,"principal":[{"loanId":"AA-L2","amount":"200"}],"loans":null}'),true),
 set_config('aa.split',pg_temp.aa_cmd('aa-review-split','AA-B3',128,9,'{"forward":true,"principal":[{"loanId":"AA-L3","amount":"100"}],"loans":null}'),true),
 set_config('aa.drift',pg_temp.aa_cmd('aa-review-drift','AA-B4',30,9,'{"forward":true,"principal":[],"loans":null}'),true),
 set_config('aa.tamper',replace(pg_temp.aa_cmd('aa-review-tamper','AA-B6',30,9,'{"forward":true,"principal":[],"loans":null}'),'"interestDue":"10"','"interestDue":"9"'),true),
 set_config('aa.due',pg_temp.aa_cmd('aa-review-due','AA-B5',10,7,NULL),true),
 set_config('aa.nonreviewer',pg_temp.aa_cmd('aa-review-plain','AA-B5',10,7,NULL,'aa-plain@example.invalid','AA-PLAIN'),true),
 -- a v9 dated yesterday is invalid_date
 set_config('aa.yday',pg_temp.aa_cmd('aa-review-yday','AA-B8',30,9,'{"forward":true,"principal":[],"loans":null}','aa-actor@example.invalid','AA-ACT',-1),true),
 -- the slip closes a referred loan (1300 due on AA-L7) and pays 10 forward on its other loan
 set_config('aa.closes',pg_temp.aa_cmd('aa-review-closes','AA-B7',1320,9,'{"forward":true,"principal":[],"loans":null}'),true);

GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_agent_receipt_v1(text) TO mw_app_dev;

-- 0. Access: the plan (and the forecast it calls) are readable by the application role and the agent reporting role, never PUBLIC.
DO $$ BEGIN
 PERFORM pg_temp.aa_assert(NOT has_function_privilege('public','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE'),'no PUBLIC execute on the plan');
 PERFORM pg_temp.aa_assert(has_function_privilege('mw_app_dev','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE'),'the application role still executes the plan');
 PERFORM pg_temp.aa_assert(NOT has_function_privilege('public','public.forecast_schedule_v1(jsonb,jsonb,date,date)','EXECUTE'),'no PUBLIC execute on the forecast');
 -- V125: EXECUTE on the plan and the forecast goes to mw_integration_agent (the agent's reporting role) when that role exists.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN
  PERFORM pg_temp.aa_assert(has_function_privilege('mw_integration_agent','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE'),'the agent role reads the plan');
  PERFORM pg_temp.aa_assert(has_function_privilege('mw_integration_agent','public.forecast_schedule_v1(jsonb,jsonb,date,date)','EXECUTE'),'the agent role reads the forecast');
  PERFORM pg_temp.aa_assert(NOT has_function_privilege('mw_integration_agent','public.pwa_submit_agent_receipt_v1(text)','EXECUTE') AND NOT has_function_privilege('mw_integration_agent','public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','EXECUTE'),'the agent role cannot post or book through SQL');
 END IF;
END $$;

-- 1. Submits as the DEV command user.
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['aa.fwd','aa.prin','aa.split','aa.due','aa.closes'] LOOP
  r:=public.pwa_submit_agent_receipt_v1(current_setting(k));
  IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION '% must post: %',k,r; END IF;
 END LOOP;
 -- One slip, one request id: the replay is the recorded outcome; another purpose under the same id conflicts.
 IF public.pwa_submit_agent_receipt_v1(current_setting('aa.fwd'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'replay'; END IF;
 IF public.pwa_submit_agent_receipt_v1(current_setting('aa.fwd_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'a different purpose for the same slip must conflict'; END IF;
 -- A v9 dated yesterday is refused as invalid_date (the plan is today's).
 r:=public.pwa_submit_agent_receipt_v1(current_setting('aa.yday'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'invalid_date' THEN RAISE EXCEPTION 'v9 dated yesterday: %',r; END IF;
 -- Tampered plan lines: selection_unavailable.
 r:=public.pwa_submit_agent_receipt_v1(current_setting('aa.tamper'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'tampered plan: %',r; END IF;
 -- Only the AI Reviewer's Partner posts a reviewed slip.
 BEGIN
  PERFORM public.pwa_submit_agent_receipt_v1(current_setting('aa.nonreviewer'));
  RAISE EXCEPTION 'a non-reviewer partner posted a reviewed slip';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $$;
RESET SESSION AUTHORIZATION;
-- Drift: the forecast moved after the options were shown (booked meanwhile, as the jobs worker would).
SELECT pg_temp.aa_assert(public.generate_loan_charge('AA-L4',d+1)='cg8:5:AA-L4:'||to_char(d+1,'YYYY-MM-DD'),'booked meanwhile') FROM aa_day;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb:=public.pwa_submit_agent_receipt_v1(current_setting('aa.drift'));
BEGIN IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'drift: %',r; END IF; END $$;
RESET SESSION AUTHORIZATION;

-- 2. Results.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM aa_day);pay text:='pwa:'||pg_temp.aa_uuid(pg_temp.aa_rid('aa-review-fwd'));off text;
BEGIN
 -- Forward: due 10 first, then five booked charges of 10, all paid, one cash row, plan allocations reconcile.
 PERFORM pg_temp.aa_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=60 AND "Allocation Method"='Selected Charges' AND "Ref Received By Cash Account"='CI-DAD' FROM public."Payments" WHERE "Row ID"=pay),'forward slip posted as Selected Charges to the slip account');
 PERFORM pg_temp.aa_assert((SELECT count(*)=5 AND bool_and("Amount Remaining"::numeric=0 AND "Interest Due"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='AA-L1' AND "Charge Date">day),'forward: five next charges booked and paid');
 PERFORM pg_temp.aa_assert((SELECT "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='AA-L1-today'),'forward: the due charge is paid first');
 PERFORM pg_temp.aa_assert((SELECT sum("Allocated Amount"::numeric)=60 AND count(*)=6 FROM public."Payment Allocations" WHERE "Ref Payment"=pay) AND (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=60 FROM public."Repayments" WHERE "Ref Payment"=pay),'forward: allocations and repayments reconcile');
 PERFORM pg_temp.aa_assert((SELECT count(*)=1 AND sum("Amount"::numeric)=60 FROM public."Cash Ledger" WHERE "Ref Payment"=pay),'forward: one cash receipt row');
 PERFORM pg_temp.aa_assert((SELECT count(*)=1 FROM public.pwa_payment_commands WHERE payment_id=pay AND outcome='posted'),'forward: one journal row (the replay added none)');
 -- Provenance: the explicit plan resolves for the posted payment.
 PERFORM pg_temp.aa_assert((SELECT coalesce(sum((l->>'principal')::numeric+(l->>'interest')::numeric),0)=60 FROM jsonb_array_elements(public.pwa_effective_payment_plan_v2(pay)#>'{plan,allocations}') l),'forward: pwa_effective_payment_plan_v2 resolves the agent v9 plan');
 -- Principal (raise): today's charge carries 200 principal, daily interest 10 -> 8, anchor today.
 PERFORM pg_temp.aa_assert((SELECT "Principal Due"::numeric=200 AND "Interest Due"::numeric=70 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='AA-L2-today'),'principal: today charge raised to 200 and paid');
 PERFORM pg_temp.aa_assert((SELECT "Interest Schedule Anchor Date"=day AND "Outstanding Principal"::numeric=800 AND "Current Daily Interest"::numeric=8 FROM public."Loans" WHERE "Row ID"='AA-L2'),'principal: anchor today, outstanding 800, daily interest 8');
 -- Split: due, principal 100, then forward charges at the recomputed daily amount 9.
 PERFORM pg_temp.aa_assert((SELECT "Principal Due"::numeric=100 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='AA-L3-today') AND (SELECT count(*)=2 AND bool_and("Interest Due"::numeric=9 AND "Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='AA-L3' AND "Charge Date">day),'split: principal 100 then two forward charges at 9');
 -- Drift and tampering: nothing posted, nothing booked besides the charge booked meanwhile.
 PERFORM pg_temp.aa_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower" IN ('AA-B4','AA-B6')) AND (SELECT count(*)=1 FROM public."Charges" WHERE "Ref Loans"='AA-L4' AND "Charge Date">day) AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='AA-L6' AND "Charge Date">day),'rejected slips posted and booked nothing');
 PERFORM pg_temp.aa_assert((SELECT count(*)=2 FROM public.pwa_payment_commands WHERE outcome='rejected' AND rejection_code='selection_unavailable' AND request_id::text IN (pg_temp.aa_uuid(pg_temp.aa_rid('aa-review-drift')),pg_temp.aa_uuid(pg_temp.aa_rid('aa-review-tamper')))),'drift and tampering are journalled as selection_unavailable');
 -- v7 unchanged: a slip that is due is a Lump Sum, as before.
 PERFORM pg_temp.aa_assert((SELECT "Allocation Method"='Lump Sum' AND "Amount Received"::numeric=10 AND "Status"='Posted' FROM public."Payments" WHERE "Row ID"='pwa:'||pg_temp.aa_uuid(pg_temp.aa_rid('aa-review-due'))),'v7: the due slip posts as a Lump Sum');
 PERFORM pg_temp.aa_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='pwa:'||pg_temp.aa_uuid(pg_temp.aa_rid('aa-review-plain'))),'the non-reviewer slip posted nothing');
 -- A v9 slip that closes a referred loan offsets the rebate as V124 does.
 PERFORM pg_temp.aa_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day FROM public."Loans" WHERE "Row ID"='AA-L7'),'the v9 slip closes the referred loan');
 SELECT "Row ID" INTO off FROM public."Payments" WHERE "Ref Borrower"='AA-RF' AND "Payment Method"='Referral Rebate Offset';
 PERFORM pg_temp.aa_assert(off LIKE 'ro122:pwa:%' AND (SELECT "Amount Received"::numeric=30 FROM public."Payments" WHERE "Row ID"=off) AND (SELECT "Ref Offset Payment"=off AND "Amount"::numeric=30 FROM public."Business Expenses" WHERE "Row ID"='rr1:AA-L7'),'the closing agent slip offsets the rebate (V124): ro122 payment of 30 linked to the expense');
 PERFORM pg_temp.aa_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)=0 FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:AA-L7'),'the offset nets Lisa cash to zero');
 PERFORM pg_temp.aa_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=1320 FROM public."Payments" WHERE "Row ID"='pwa:'||pg_temp.aa_uuid(pg_temp.aa_rid('aa-review-closes'))) AND (SELECT count(*)=1 AND bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='AA-L0B' AND "Charge Date">day),'the closing slip paid its due 1300, the due 10 of its other loan and 10 forward');
END $$;
SELECT 'Agent receipt pay forward regressions passed' AS result;
ROLLBACK;
