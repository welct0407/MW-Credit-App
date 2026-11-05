-- R128 V136 Loan Close slip facts (disposable cluster only; synthetic rows; everything rolls back).
-- loan.close runs as the DEV command IAM user through pwa_submit_operation_v2, as the shared command service submits it for the
-- PWA (Firebase actor) and for the agent's Instagram-approved close (the agent's Google actor, its own request id); setup and
-- checks run as postgres. Covered:
--  * a close without the new keys (an older PWA bundle) is applied as before: no bank reference, no Created At;
--  * a close with bankReference and transferTime writes "Bank Reference" and "Created At" = paymentDate + transferTime, posts
--    the full amount as Loan Close of the loan, replays idempotently, and another payload under the same id is a conflict;
--  * attach_payment_receipt_evidence links the receipt image to the agent's closing payment (date, clock, reference, account,
--    amount, repayments including the late charge), once;
--  * invalid slip facts (non-Bank Transfer, blank or multi-line reference, a bad time, a non-canonical key order) are refused;
--  * a stale plan hash is rejected (plan_changed) and posts nothing.
-- The close command text must equal the server's canonical JSON byte for byte (services/contracts/operation-command.mjs).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.lc_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE lc_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON lc_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('LC-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES
 ('LC-PWA','Synthetic close owner','A','lc-owner@example.invalid','English'),('LC-REV','Synthetic close reviewer','B','lc-reviewer@example.invalid','ไทย');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('LC-CAP','LC-FUND',(SELECT d FROM lc_day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('LC-B1','SYNTHETIC CLOSE PWA'),('LC-B2','SYNTHETIC CLOSE AGENT'),('LC-B3','SYNTHETIC CLOSE STALE');
-- 1000 principal at 100 a day; today's charge carries 100 interest (LC-L2: 60 interest and a 40 late charge), so each closes for 1100.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM lc_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,100::money,1,false
 FROM (VALUES ('LC-L1','LC-B1'),('LC-L2','LC-B2'),('LC-L3','LC-B3')) v(id,b);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM lc_day),0::money,v.i::money FROM (VALUES ('LC-C1','LC-L1',100),('LC-C2','LC-L2',60),('LC-C3','LC-L3',100)) v(id,loan,i);
UPDATE public."Charges" SET "Late Charge Due"=40 WHERE "Row ID"='LC-C2';
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'LC-L%';
DO $$ BEGIN
 PERFORM pg_temp.lc_assert((SELECT bool_and(public.loan_close_calculation_v83(id,(SELECT d FROM lc_day))->>'amount'='1100') FROM unnest(ARRAY['LC-L1','LC-L2','LC-L3']) id),
  'fixture: each loan closes for 1100 (LC-L2 with its late charge)');
END $$;

-- loan.close as the canonical operation text. slip NULL builds the command without the R128 keys; otherwise slip is the text
-- of the keys after the plan hash (bankReference, then transferTime), method Bank Transfer.
CREATE FUNCTION pg_temp.lc_close(request text,loan text,issuer text,subject text,partner text,email text,notes text,slip text,hash text DEFAULT NULL) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":'||to_json(issuer)::text||',"subject":'||to_json(subject)::text||',"partnerId":'||to_json(partner)::text||',"loginEmail":'||to_json(email)::text||'},"command":{"schemaVersion":1,"operation":"loan.close","targetType":"loan","targetId":'
  ||to_json(loan)::text||',"expectedVersion":'||to_json(public.pwa_loan_version_v2(loan))::text||',"predecessorRequestId":null,"inputs":{"paymentDate":'||to_json(to_char((SELECT d FROM lc_day),'YYYY-MM-DD'))::text
  ||',"cashAccountId":"CI-DAD","paymentMethod":"Bank Transfer","notes":'||coalesce(to_json(notes)::text,'null')||',"expectedAmount":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM lc_day))->>'amount')::text
  ||',"expectedPlanHash":'||to_json(coalesce(hash,public.loan_close_calculation_v83(loan,(SELECT d FROM lc_day))->>'planHash'))::text
  ||coalesce(slip,'')||'}},"receipt":null}' $f$;

SELECT set_config('lc.pwa',pg_temp.lc_close('e1111111-1111-4111-8111-111111111111','LC-L1','https://securetoken.google.com/clever-oasis-508610-n7','lc-owner','LC-PWA','lc-owner@example.invalid',NULL,NULL),true),
 set_config('lc.agent',pg_temp.lc_close('e2222222-2222-4222-8222-222222222222','LC-L2','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',
  'Approved Instagram receipt review igr:'||repeat('f',48),',"bankReference":"SLIP REF 0001","transferTime":"09:05"'),true),
 set_config('lc.stale',pg_temp.lc_close('e3333333-3333-4333-8333-333333333333','LC-L3','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',NULL,',"bankReference":"STALE01"',repeat('0',64)),true),
 -- refused slip facts: Cash with a reference, a blank or two-line reference, a time out of range, transferTime before bankReference
 set_config('lc.cash',replace(pg_temp.lc_close('e4444444-4444-4444-8444-444444444441','LC-L3','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',NULL,',"bankReference":"CASHREF"'),'"Bank Transfer"','"Cash"'),true),
 set_config('lc.blank',pg_temp.lc_close('e4444444-4444-4444-8444-444444444442','LC-L3','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',NULL,',"bankReference":"  "'),true),
 set_config('lc.lines',pg_temp.lc_close('e4444444-4444-4444-8444-444444444443','LC-L3','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',NULL,',"bankReference":"A\nB"'),true),
 set_config('lc.time',pg_temp.lc_close('e4444444-4444-4444-8444-444444444444','LC-L3','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',NULL,',"transferTime":"24:00"'),true),
 set_config('lc.order',pg_temp.lc_close('e4444444-4444-4444-8444-444444444445','LC-L3','https://accounts.google.com','737787224638','LC-REV','lc-reviewer@example.invalid',NULL,',"transferTime":"09:05","bankReference":"ORDER01"'),true);
-- Another payload under the agent close's request id (another transfer time): a conflict, never a second close.
SELECT set_config('lc.agent_other',replace(current_setting('lc.agent'),'"09:05"','"09:06"'),true);

-- Operator grants, emulated and rolled back (as Test-RebateOffset.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_operation_status_v2(uuid,text,text) TO mw_app_dev;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['lc.pwa','lc.agent'] LOOP
  r:=public.pwa_submit_operation_v2(current_setting(k));
  IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: % must apply: %',k,r; END IF;
 END LOOP;
 r:=public.pwa_submit_operation_v2(current_setting('lc.agent'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'applied' OR r#>>'{originalOutcome,result,paymentId}' IS DISTINCT FROM 'pwa:e2222222-2222-4222-8222-222222222222' THEN RAISE EXCEPTION 'FAILED: replay %',r; END IF;
 IF public.pwa_submit_operation_v2(current_setting('lc.agent_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'FAILED: another payload under the same id must conflict'; END IF;
 r:=public.pwa_operation_status_v2('e2222222-2222-4222-8222-222222222222','https://accounts.google.com','737787224638');
 IF r#>>'{originalOutcome,result,operation}' IS DISTINCT FROM 'loan.close' OR r#>>'{originalOutcome,result,targetId}' IS DISTINCT FROM 'LC-L2' THEN RAISE EXCEPTION 'FAILED: status of the agent close %',r; END IF;
 IF public.pwa_operation_status_v2('e2222222-2222-4222-8222-222222222222','https://securetoken.google.com/clever-oasis-508610-n7','737787224638')->>'kind'<>'unresolved' THEN RAISE EXCEPTION 'FAILED: the status is the actor''s own'; END IF;
 r:=public.pwa_submit_operation_v2(current_setting('lc.stale'));
 IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'rejected' OR r->'originalOutcome'->>'code' IS DISTINCT FROM 'plan_changed' THEN RAISE EXCEPTION 'FAILED: a stale plan hash must be plan_changed: %',r; END IF;
 FOREACH k IN ARRAY ARRAY['lc.cash','lc.blank','lc.lines','lc.time','lc.order'] LOOP
  BEGIN
   PERFORM public.pwa_submit_operation_v2(current_setting(k));
   RAISE EXCEPTION 'FAILED: % was accepted',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
DECLARE day date:=(SELECT d FROM lc_day);
BEGIN
 PERFORM pg_temp.lc_assert((SELECT "Bank Reference" IS NULL AND "Created At" IS NULL AND "Allocation Method"='Loan Close' AND "Status"='Posted' FROM public."Payments" WHERE "Row ID"='pwa:e1111111-1111-4111-8111-111111111111'),
  'a close without the slip keys posts as before (no reference, no Created At)');
 PERFORM pg_temp.lc_assert((SELECT "Bank Reference"='SLIP REF 0001' AND "Created At"=day+time '09:05' AND "Payment Date"=day AND "Allocation Method"='Loan Close' AND "Ref Target Loan"='LC-L2'
   AND "Status"='Posted' AND "Amount Received"::numeric=1100 AND "Payment Method"='Bank Transfer' AND "Notes"='Approved Instagram receipt review igr:'||repeat('f',48) AND "Created By"='lc-reviewer@example.invalid'
   FROM public."Payments" WHERE "Row ID"='pwa:e2222222-2222-4222-8222-222222222222'),'the agent close carries the slip reference, transfer time, note and reviewer');
 PERFORM pg_temp.lc_assert((SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric)=1100 AND sum("Late Charge Paid"::numeric)=40 FROM public."Repayments" WHERE "Ref Payment"='pwa:e2222222-2222-4222-8222-222222222222'),
  'the agent close repays the full amount including the late charge');
 PERFORM pg_temp.lc_assert((SELECT count(*) FROM public."Loans" WHERE "Row ID" IN ('LC-L1','LC-L2') AND "Loan Status"='ปิดยอดแล้ว')=2,'both loans are closed');
 PERFORM pg_temp.lc_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='LC-L3') AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID" LIKE 'pwa:e3333333%' OR "Row ID" LIKE 'pwa:e4444444%'),
  'the stale and refused closes post nothing');
 PERFORM pg_temp.lc_assert((SELECT count(*) FROM public.pwa_payment_commands WHERE request_id='e2222222-2222-4222-8222-222222222222')=1
   AND (SELECT actor_issuer='https://accounts.google.com' AND actor_subject='737787224638' AND actor_partner_id='LC-REV' FROM public.pwa_payment_commands WHERE request_id='e2222222-2222-4222-8222-222222222222'),
  'one journal row under the agent actor');
END $$;

-- The receipt image links to the agent's closing payment (the agent receipt projector's verification facts).
GRANT EXECUTE ON FUNCTION public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text) TO mw_receipt_projector;
SELECT set_config('lc.facts',jsonb_build_object('borrower','LC-B2','amount','1100.00','date',(SELECT d FROM lc_day)::text,'clock',(SELECT d FROM lc_day)::text||' 09:05','reference','SLIP REF 0001','account','CI-DAD')::text,true),
 set_config('lc.receipt',repeat('c',64),true),set_config('lc.key','receipts/dev/'||to_char((SELECT d FROM lc_day),'YYYY/MM/DD')||'/'||repeat('c',64)||'/'||repeat('d',64)||'.jpg',true);
SET SESSION AUTHORIZATION mw_receipt_projector;
DO $$
DECLARE attach text:='SELECT public.attach_payment_receipt_evidence($1,$2,$3,now(),$4::jsonb,''12800000-0000-4000-8000-000000000001'',''synthetic-r128'')';r text;
BEGIN
 EXECUTE attach INTO r USING 'pwa:e2222222-2222-4222-8222-222222222222',current_setting('lc.receipt'),current_setting('lc.key'),current_setting('lc.facts');
 IF r IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'FAILED: attach to the agent close: %',r; END IF;
 EXECUTE attach INTO r USING 'pwa:e2222222-2222-4222-8222-222222222222',current_setting('lc.receipt'),current_setting('lc.key'),current_setting('lc.facts');
 IF r IS DISTINCT FROM 'already_applied' THEN RAISE EXCEPTION 'FAILED: attach replay: %',r; END IF;
 -- The PWA close without the slip facts cannot take an agent receipt (no clock, no reference).
 BEGIN
  EXECUTE attach INTO r USING 'pwa:e1111111-1111-4111-8111-111111111111',repeat('e',64),replace(current_setting('lc.key'),repeat('c',64),repeat('e',64)),
   jsonb_set(jsonb_set(current_setting('lc.facts')::jsonb,'{borrower}','"LC-B1"'),'{reference}','null')::text;
  RAISE EXCEPTION 'FAILED: a close without slip facts took a receipt';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'Receipt payment verification conflict' THEN RAISE; END IF;
 END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 PERFORM pg_temp.lc_assert((SELECT "IG Receipt ID"=repeat('c',64) AND "Bank Reference"='SLIP REF 0001' AND "Created At"=(SELECT d FROM lc_day)+time '09:05'
   FROM public."Payments" WHERE "Row ID"='pwa:e2222222-2222-4222-8222-222222222222'),'the receipt is linked and no business value changed');
END $$;
SELECT 'Agent loan close regressions passed' AS result;
ROLLBACK;
