-- R181 V153 agent receipt command schemaVersion 11: a Reviewer's close choice (disposable cluster only; synthetic rows;
-- everything rolls back). pwa_submit_agent_receipt_v1 runs as the DEV command IAM user; setup and checks run as postgres.
-- Behaviour asserted:
--  * v11 with two settle entries (Kathy's case: the slip is both loans' payoff): one Posted payment of the slip amount,
--    Selected Charges, both loans closed by it, repayments sum to the amount, one journal row, financialMatch true, and the
--    referral rebate of each closed referred loan offset to the referrer's open loan (the default path, V124/V131);
--  * v11 with one settle entry and the rest paid forward on the other loan;
--  * refusals with nothing written: a settle planHash that is not the quote's, settles that differ from the command's
--    settle entries, a slip dated yesterday (invalid_date), automatic mode, a v11 without a settle entry, a v10 with one;
--  * a replay is the recorded outcome, a different purpose under the same request id conflicts;
--  * the status function reads v11 (Selected Charges, financialMatch).
-- Versions 7 to 10 keep their behaviour: Test-AgentReceiptPayForward.sql (v7, v9, the v9 settle refusal) and
-- Test-LateCharges.sql (agent v10) run unchanged.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.sv_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE sv_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON sv_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('SV-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","AI Reviewer","IG Integration Enabled") VALUES('SV-ACT','Synthetic AI reviewer','A','sv-actor@example.invalid',true,true);
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('SV-CAP','SV-FUND',(SELECT d FROM sv_day)-400,'Contribution',1000000::money);
-- Kathy: referred by SV-RF (an open loan with 10 due today); two daily-interest loans, interest 100 and 200 due today.
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('SV-RF','SYNTHETIC SETTLE REFERRER'),('SV-B2','SYNTHETIC SETTLE ONE'),('SV-B3','SYNTHETIC SETTLE REFUSALS');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('SV-K','SYNTHETIC SETTLE KATHY','SV-RF');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM sv_day)-v.age,v.pa::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,1,false FROM (VALUES
  ('SV-RFL','SV-RF',1000,10,3),('SV-KA','SV-K',1000,100,6),('SV-KB','SV-K',2000,200,12),('SV-C','SV-B2',1000,100,3),('SV-D','SV-B2',1000,10,3),
  ('SV-E','SV-B3',1000,100,3),('SV-F','SV-B3',2000,200,3)) v(id,b,pa,cdi,age);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM sv_day),0::money,v.i::money FROM (VALUES
  ('SV-RFL-today','SV-RFL',10),('SV-KA-today','SV-KA',100),('SV-KB-today','SV-KB',200),('SV-C-today','SV-C',100),('SV-D-today','SV-D',10),
  ('SV-E-today','SV-E',100),('SV-F-today','SV-F',200)) v(id,loan,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'SV-%';

CREATE FUNCTION pg_temp.sv_rid(review text) RETURNS text LANGUAGE sql AS $f$
 WITH h AS (SELECT sha256(convert_to('["mw-credit-agent-receipt-v1","dev",'||to_json(review)::text||']','UTF8')) b)
 SELECT encode(set_byte(set_byte(substring(h.b FROM 1 FOR 16),6,(get_byte(h.b,6)&15)|64),8,(get_byte(h.b,8)&63)|128),'hex') FROM h $f$;
CREATE FUNCTION pg_temp.sv_uuid(hex text) RETURNS text LANGUAGE sql AS $f$ SELECT (substr(hex,1,8)||'-'||substr(hex,9,4)||'-'||substr(hex,13,4)||'-'||substr(hex,17,4)||'-'||substr(hex,21,12)) $f$;
-- The payoff remainder of a loan today (what a close choice requests for it).
CREATE FUNCTION pg_temp.sv_payoff(borrower text,loan text) RETURNS text LANGUAGE sql AS $f$
 SELECT o->>'payoffRemainder' FROM jsonb_array_elements(public.pwa_pay_forward_plan_v1(borrower,100000::numeric,(SELECT d FROM sv_day),'{"forward":true,"principal":[],"loans":null}')->'options') o
 WHERE o->>'loanId'=loan $f$;
-- The v11 command as canonical text, built from the server's plan for the purpose (8-key lines, settle entries with planHash).
-- version 10 builds the same lists without planHash (a v10 with a settle entry). mode and dayoff vary the refusals.
CREATE FUNCTION pg_temp.sv_cmd(review text,borrower text,amount int,purpose jsonb,version int DEFAULT 11,mode text DEFAULT 'reviewed',dayoff int DEFAULT 0) RETURNS text LANGUAGE sql AS $f$
 WITH p AS (SELECT public.pwa_pay_forward_plan_v1(borrower,amount::numeric,(SELECT d FROM sv_day),purpose) plan),
  t AS (SELECT extract(epoch FROM (((SELECT d FROM sv_day)+dayoff)::timestamp+interval '5 hours'))::bigint cap,encode(sha256(convert_to('receipt:'||review,'UTF8')),'hex') rid,encode(sha256(convert_to('raw:'||review,'UTF8')),'hex') raw)
 SELECT '{"contractVersion":1,"command":{"schemaVersion":'||version||',"requestId":"'||pg_temp.sv_uuid(pg_temp.sv_rid(review))||'","environment":"dev","reviewId":'||to_json(review)::text
  ||',"mode":"'||mode||'","borrowerId":'||to_json(borrower)::text||',"cashAccountId":"CI-DAD","amountReceived":"'||amount||'","paymentDate":"'||to_char((SELECT d FROM sv_day)+dayoff,'YYYY-MM-DD')
  ||'","transferTime":"16:29","bankReference":"SVREF'||upper(substr(md5(review),1,8))||'","payerLines":null'
  ||',"purpose":{"forward":'||(purpose->>'forward')||',"principal":['||coalesce((SELECT string_agg('{"loanId":'||to_json(q->>'loanId')::text||',"amount":'||to_json(q->>'amount')::text||'}',',' ORDER BY q->>'loanId' COLLATE "C") FROM jsonb_array_elements(purpose->'principal') q),'')||'],"loans":null}'
  ||',"allocations":['||coalesce((SELECT string_agg('{"chargeId":'||to_json(l->>'chargeId')::text||',"principal":'||to_json(l->>'principal')::text||',"interest":'||to_json(l->>'interest')::text||',"lateCharge":'||to_json(l->>'lateCharge')::text
     ||',"expectedPrincipalRemaining":'||to_json(l->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(l->>'expectedInterestRemaining')::text||',"expectedLateChargeRemaining":'||to_json(l->>'expectedLateChargeRemaining')::text
     ||',"chargeDate":'||to_json(l->>'chargeDate')::text||'}',',' ORDER BY l->>'chargeId' COLLATE "C") FROM jsonb_array_elements(p.plan->'allocations') l),'')
  ||'],"materialize":['||coalesce((SELECT string_agg('{"loanId":'||to_json(e->>'loanId')::text||',"chargeId":'||to_json(e->>'chargeId')::text||',"chargeDate":'||to_json(e->>'chargeDate')::text||',"principalDue":'||to_json(e->>'principalDue')::text||',"interestDue":'||to_json(e->>'interestDue')::text||'}',',' ORDER BY e->>'chargeId' COLLATE "C") FROM jsonb_array_elements(p.plan->'materialize') e),'')
  ||'],"principal":['||coalesce((SELECT string_agg('{"loanId":'||to_json(x->>'loanId')::text||',"kind":'||to_json(x->>'kind')::text||',"chargeId":'||to_json(x->>'chargeId')::text||',"chargeDate":'||to_json(x->>'chargeDate')::text
     ||',"amount":'||to_json(x->>'amount')::text||',"accruedInterest":'||to_json(x->>'accruedInterest')::text||',"principalDue":'||to_json(x->>'principalDue')::text
     ||CASE WHEN version=11 AND x->>'kind'='settle' THEN ',"planHash":'||to_json(x->>'planHash')::text ELSE '' END||'}',',' ORDER BY x->>'loanId' COLLATE "C") FROM jsonb_array_elements(p.plan->'principal') x),'')||']'
  ||',"proposalSha256":"'||repeat('c',64)||'","archiveEvidence":{"receiptId":"'||t.rid||'","objectKey":"receipts/dev/'||to_char(to_timestamp(t.cap) AT TIME ZONE 'UTC','YYYY/MM/DD')||'/'||t.rid||'/'||t.raw||'.png","generation":"1","rawSha256":"'||t.raw||'","mimeType":"image/png","sizeBytes":100,"capturedAt":"'||t.cap||'"}'
  ||'},"actor":{"issuer":"https://accounts.google.com","subject":"737787224638","partnerId":"SV-ACT","loginEmail":"sv-actor@example.invalid"},"receipt":null}'
 FROM t,p $f$;

-- The payoff remainders the options read, then every command built before any submit (each plan sees the untouched fixture).
SELECT set_config('sv.ka',pg_temp.sv_payoff('SV-K','SV-KA'),true),set_config('sv.kb',pg_temp.sv_payoff('SV-K','SV-KB'),true),
 set_config('sv.c',pg_temp.sv_payoff('SV-B2','SV-C'),true),set_config('sv.e',pg_temp.sv_payoff('SV-B3','SV-E'),true),set_config('sv.f',pg_temp.sv_payoff('SV-B3','SV-F'),true);
SELECT pg_temp.sv_assert(current_setting('sv.ka')='1000' AND current_setting('sv.kb')='2000','the payoff remainders are the principals (interest due today is paid first)');
SELECT set_config('sv.both',pg_temp.sv_cmd('sv-review-both','SV-K',3300,jsonb_build_object('forward',false,'loans',null,'principal',jsonb_build_array(
   jsonb_build_object('loanId','SV-KA','amount',current_setting('sv.ka')),jsonb_build_object('loanId','SV-KB','amount',current_setting('sv.kb'))))),true),
 set_config('sv.both_other',pg_temp.sv_cmd('sv-review-both','SV-K',3300,'{"forward":true,"principal":[],"loans":null}',10),true),
 set_config('sv.one',pg_temp.sv_cmd('sv-review-one','SV-B2',1130,jsonb_build_object('forward',true,'loans',null,'principal',jsonb_build_array(jsonb_build_object('loanId','SV-C','amount',current_setting('sv.c'))))),true),
 set_config('sv.hash',regexp_replace(pg_temp.sv_cmd('sv-review-hash','SV-B3',1300,jsonb_build_object('forward',false,'loans',null,'principal',jsonb_build_array(jsonb_build_object('loanId','SV-E','amount',current_setting('sv.e'))))),
   '"planHash":"[0-9a-f]{64}"','"planHash":"'||repeat('0',64)||'"'),true),
 set_config('sv.yday',pg_temp.sv_cmd('sv-review-yday','SV-B3',1300,jsonb_build_object('forward',false,'loans',null,'principal',jsonb_build_array(jsonb_build_object('loanId','SV-E','amount',current_setting('sv.e')))),11,'reviewed',-1),true),
 set_config('sv.auto',pg_temp.sv_cmd('sv-review-auto','SV-B3',1300,jsonb_build_object('forward',false,'loans',null,'principal',jsonb_build_array(jsonb_build_object('loanId','SV-E','amount',current_setting('sv.e')))),11,'automatic'),true),
 set_config('sv.nosettle',pg_temp.sv_cmd('sv-review-nosettle','SV-B3',400,'{"forward":true,"principal":[],"loans":null}',11),true),
 set_config('sv.v10',pg_temp.sv_cmd('sv-review-v10','SV-B3',1300,jsonb_build_object('forward',false,'loans',null,'principal',jsonb_build_array(jsonb_build_object('loanId','SV-E','amount',current_setting('sv.e')))),10),true),
 -- Built for both loans of SV-B3, then F's entry dropped: the plan still settles both, the command only E.
 set_config('sv.subset',pg_temp.sv_cmd('sv-review-subset','SV-B3',3300,jsonb_build_object('forward',false,'loans',null,'principal',jsonb_build_array(
   jsonb_build_object('loanId','SV-E','amount',current_setting('sv.e')),jsonb_build_object('loanId','SV-F','amount',current_setting('sv.f'))))),true);
SELECT pg_temp.sv_assert(position('"planHash":"'||repeat('0',64)||'"' IN current_setting('sv.hash'))>0,'the hash command carries a changed planHash');
SELECT pg_temp.sv_assert(position('"kind":"settle"' IN current_setting('sv.yday'))>0 AND position('"kind":"settle"' IN current_setting('sv.v10'))>0,'the E-only commands carry a settle entry');
-- The subset command: drop SV-F's settle entry (the command keeps its shape; the server's plan still settles both loans).
SELECT set_config('sv.subset',regexp_replace(current_setting('sv.subset'),',\{"loanId":"SV-F","kind":"settle"[^}]*\}',''),true);
SELECT pg_temp.sv_assert(position('"loanId":"SV-F","kind":"settle"' IN current_setting('sv.subset'))=0,'the subset command lists only SV-E as settled');

GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_agent_receipt_v1(text) TO mw_app_dev;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 -- Refusals that reach the plan: selection_unavailable or invalid_date, journalled, nothing posted.
 FOR k,r IN SELECT x,public.pwa_submit_agent_receipt_v1(current_setting(x)) FROM unnest(ARRAY['sv.hash','sv.subset']) x LOOP
  IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION '% must be selection_unavailable: %',k,r; END IF;
 END LOOP;
 r:=public.pwa_submit_agent_receipt_v1(current_setting('sv.yday'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'invalid_date' THEN RAISE EXCEPTION 'v11 dated yesterday: %',r; END IF;
 -- Invalid commands (22023, nothing journalled): automatic mode, a v11 without a settle entry, a v10 with one.
 FOREACH k IN ARRAY ARRAY['sv.auto','sv.nosettle','sv.v10'] LOOP
  BEGIN
   r:=public.pwa_submit_agent_receipt_v1(current_setting(k));
   RAISE EXCEPTION '% must be an invalid command: %',k,r;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
 -- Kathy: both loans closed by one payment; the one-loan close with the rest forward.
 FOREACH k IN ARRAY ARRAY['sv.both','sv.one'] LOOP
  r:=public.pwa_submit_agent_receipt_v1(current_setting(k));
  IF r->>'kind'<>'recorded' OR r->'originalOutcome'->>'status'<>'posted' OR r->'financialMatch'<>'true'::jsonb THEN RAISE EXCEPTION '% must post: %',k,r; END IF;
 END LOOP;
 -- Replay: the recorded outcome; a different purpose under the same request id conflicts.
 IF public.pwa_submit_agent_receipt_v1(current_setting('sv.both'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'replay'; END IF;
 IF public.pwa_submit_agent_receipt_v1(current_setting('sv.both_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'a different purpose for the same slip must conflict'; END IF;
END $$;
RESET SESSION AUTHORIZATION;

SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM sv_day);pay text:='pwa:'||pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-both'));one text:='pwa:'||pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-one'));loan text;
BEGIN
 PERFORM pg_temp.sv_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=3300 AND "Allocation Method"='Selected Charges' AND "Ref Received By Cash Account"='CI-DAD' FROM public."Payments" WHERE "Row ID"=pay),'Kathy: one Posted payment of 3300, Selected Charges');
 PERFORM pg_temp.sv_assert((SELECT count(*)=2 AND bool_and("Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day AND "Ref Closing Payment"=pay) FROM public."Loans" WHERE "Row ID" IN ('SV-KA','SV-KB')),'Kathy: both loans closed by that payment');
 PERFORM pg_temp.sv_assert((SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric)=3300 FROM public."Repayments" WHERE "Ref Payment"=pay),'Kathy: repayments sum to the slip');
 PERFORM pg_temp.sv_assert((SELECT count(*)=1 AND bool_and(outcome='posted' AND canonical_json::jsonb#>>'{command,schemaVersion}'='11') FROM public.pwa_payment_commands WHERE payment_id=pay),'Kathy: one v11 journal row (the replay added none)');
 PERFORM pg_temp.sv_assert((SELECT count(*)=1 AND sum("Amount"::numeric)=3300 FROM public."Cash Ledger" WHERE "Ref Payment"=pay),'Kathy: one cash receipt row');
 PERFORM pg_temp.sv_assert((SELECT coalesce(sum((l->>'principal')::numeric+(l->>'interest')::numeric+coalesce(l->>'lateCharge','0')::numeric),0)=3300 FROM jsonb_array_elements(public.pwa_effective_payment_plan_v2(pay)#>'{plan,allocations}') l),'Kathy: the explicit plan resolves for the posted payment');
 -- The referral rebate of each closed referred loan: the default path (the referrer has an open loan: offset), V124/V131.
 FOREACH loan IN ARRAY ARRAY['SV-KA','SV-KB'] LOOP
  PERFORM pg_temp.sv_assert((SELECT "Status"='Posted' AND "Payment Method"='Referral Rebate Offset' AND "Amount Received"::numeric>0 FROM public."Payments" WHERE "Row ID"='ro122:'||pay||':'||loan)
   AND (SELECT "Ref Offset Payment"='ro122:'||pay||':'||loan FROM public."Business Expenses" WHERE "Row ID"='rr1:'||loan),'Kathy: '||loan||' rebate offset to the referrer''s loan');
 END LOOP;
 -- One loan closed, the rest paid forward on the other loan.
 PERFORM pg_temp.sv_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=1130 FROM public."Payments" WHERE "Row ID"=one),'one: posted 1130');
 PERFORM pg_temp.sv_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"=one FROM public."Loans" WHERE "Row ID"='SV-C') AND (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='SV-D'),'one: SV-C closed, SV-D open');
 PERFORM pg_temp.sv_assert((SELECT count(*)>=1 AND bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='SV-D' AND "Charge Date">day),'one: the rest paid SV-D forward');
 -- Refusals posted nothing and closed nothing.
 PERFORM pg_temp.sv_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"='SV-B3') AND (SELECT bool_and("Loan Status"='ยังไม่ปิดยอด') FROM public."Loans" WHERE "Ref Borrowers"='SV-B3'),'refusals: nothing posted or closed');
 PERFORM pg_temp.sv_assert((SELECT count(*)=2 FROM public.pwa_payment_commands WHERE outcome='rejected' AND rejection_code='selection_unavailable' AND request_id::text IN (pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-hash')),pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-subset')))),'refusals journalled as selection_unavailable');
 PERFORM pg_temp.sv_assert(NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id::text IN (pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-auto')),pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-nosettle')),pg_temp.sv_uuid(pg_temp.sv_rid('sv-review-v10')))),'invalid commands journal nothing');
END $$;
SELECT 'Agent receipt settle regressions passed' AS result;
ROLLBACK;
