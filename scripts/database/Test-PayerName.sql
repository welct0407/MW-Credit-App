-- R095 V111 payer name (disposable cluster only; synthetic rows; everything rolls back).
-- The agent receipt command v8 (and v7) and the manual receiving command v8 (and v7) run as the DEV command IAM
-- user (SET SESSION AUTHORIZATION, as both functions check session_user); the checks run as postgres.
-- Proves (revision 2, payerLines {before, after}): learning fills an empty column, appends a payer line and replaces a
-- more-masked line; drift since `before` was read skips the learning but still posts; a replay writes nothing again;
-- another payerLines under the same requestId is a conflict; a rejected outcome leaves the column; v7 (and v3-v7 manual)
-- stay accepted; payerLines is Bank Transfer only and validated (5-line cap, display-form lines, after<>before); the change
-- is visible to the PWA (row change, borrower version); v8 keeps the explicit plan provenance.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;

-- The V111 clean-up, when the pre-target route (Test-PayerName-Before.sql at V110) seeded old values.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID" LIKE 'PN-BEFORE-%') THEN
  IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID" LIKE 'PN-BEFORE-%' AND "Communication Name" IS NOT NULL) THEN RAISE EXCEPTION 'V111 must clear every old value'; END IF;
  IF (SELECT count(DISTINCT row_key) FROM public.pwa_row_changes WHERE table_name='Borrowers' AND row_key IN ('PN-BEFORE-1','PN-BEFORE-2'))<>2 THEN
   RAISE EXCEPTION 'V111 clean-up must reach the PWA change log'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Communication Name" IS NOT NULL) THEN RAISE EXCEPTION 'V111 left a stored value'; END IF;
END $$;

\ir Test-CashAccountFixtures.sql
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PN-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('PN-AUTO','Synthetic automatic actor','A','pn-auto@example.invalid');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('PN-CAP','PN-FUND',current_date-400,'Contribution',1000000::money);
CREATE TEMP TABLE pn_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Communication Name") VALUES
 ('PN-B1','SYNTHETIC PAYER 1',NULL),('PN-B2','SYNTHETIC PAYER 2','Existing Payer'),('PN-B3','SYNTHETIC PAYER 3',E'สมชาย ใ***\nAlice Aaa'),
 ('PN-B4','SYNTHETIC PAYER 4',NULL),('PN-B5','SYNTHETIC PAYER 5',NULL),('PN-B6','SYNTHETIC PAYER 6',NULL),
 ('PN-B7','SYNTHETIC PAYER 7',NULL);
INSERT INTO public."Loans"("Row ID","Ref Borrowers","Principal Amount","Loan Status","Ref Disbursed From Cash Account","Loan Date")
 SELECT 'PN-L'||n,'PN-B'||n,1000::money,'ยังไม่ปิดยอด','CI-LISA',(SELECT d FROM pn_day)-30 FROM generate_series(1,7) n;
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due")
 SELECT 'PN-C'||n,'PN-L'||n,(SELECT d FROM pn_day)-1,100::money,900::money FROM generate_series(1,7) n;

-- The payerLines value as the command services canonicalize it ({before, after}).
CREATE FUNCTION pg_temp.pn_lines(before text,after text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"before":'||coalesce(to_json(before)::text,'null')||',"after":'||to_json(after)::text||'}' $f$;
-- Canonical agent receipt command (contract 1), built as the command service does (services/agent-receipts/contract.mjs).
CREATE FUNCTION pg_temp.pn_agent(review text,borrower text,amount text,reference text,version integer,payer text,day date) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE derived bytea;
BEGIN
 derived:=substring(sha256(convert_to('["mw-credit-agent-receipt-v1","dev",'||to_json(review)::text||']','UTF8')) FROM 1 FOR 16);
 derived:=set_byte(derived,6,(get_byte(derived,6)&15)|64);derived:=set_byte(derived,8,(get_byte(derived,8)&63)|128);
 RETURN '{"contractVersion":1,"command":{"schemaVersion":'||version||',"requestId":'||to_json(encode(derived,'hex')::uuid::text)::text
  ||',"environment":"dev","reviewId":'||to_json(review)::text||',"mode":"automatic","borrowerId":'||to_json(borrower)::text
  ||',"cashAccountId":"CI-LISA","amountReceived":'||to_json(amount)::text||',"paymentDate":'||to_json(day::text)::text
  ||',"transferTime":"09:41","bankReference":'||to_json(reference)::text||CASE WHEN version=8 THEN ',"payerLines":'||payer ELSE '' END
  ||',"proposalSha256":"'||repeat('c',64)||'","archiveEvidence":{"receiptId":"'||repeat('a',64)||'","objectKey":"receipts/dev/'
  ||to_char(to_timestamp(1791766800) AT TIME ZONE 'UTC','YYYY/MM/DD')||'/'||repeat('a',64)||'/'||repeat('b',64)||'.jpg","generation":"1234","rawSha256":"'
  ||repeat('b',64)||'","mimeType":"image/jpeg","sizeBytes":123,"capturedAt":"1791766800"}},"actor":{"issuer":"https://accounts.google.com","subject":"424242","partnerId":"PN-AUTO","loginEmail":"pn-auto@example.invalid"},"receipt":null}';
END $f$;
-- Canonical manual receiving command v7/v8 (services/contracts/payment-command.mjs): one interest-only allocation.
CREATE FUNCTION pg_temp.pn_manual(request text,borrower text,version integer,method text,reference text,payer text,day date) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
 RETURN '{"contractVersion":1,"command":{"schemaVersion":'||version||',"requestId":'||to_json(request)::text||',"borrowerId":'||to_json(borrower)::text
  ||',"allocations":[{"chargeId":'||to_json('PN-C'||right(borrower,1))::text||',"principal":"0","interest":"10","expectedPrincipalRemaining":"900","expectedInterestRemaining":"100","chargeDate":'
  ||to_json(((SELECT d FROM pn_day)-1)::text)::text||'}],"cashAccountId":"CI-LISA","paymentDate":'||to_json(day::text)::text||',"amountReceived":"10","paymentMethod":'||to_json(method)::text
  ||',"notes":null,"receiptId":null,"bankReference":'||coalesce(to_json(reference)::text,'null')||',"transferTime":null'
  ||CASE WHEN version=8 THEN ',"payerLines":'||payer ELSE '' END
  ||'},"actor":{"issuer":"https://pn.invalid","subject":"pn-owner","partnerId":"PN-AUTO","loginEmail":"pn-auto@example.invalid"},"receipt":null}';
END $f$;

SELECT set_config('pn.version_b1',public.pwa_borrower_version_v2('PN-B1'),true),
       set_config('pn.changes',(SELECT coalesce(max(seq),0) FROM public.pwa_row_changes)::text,true) \gset pn_unused_
SELECT set_config('pn.a1',pg_temp.pn_agent('pn-review-1','PN-B1','50','PNREF0001',8,pg_temp.pn_lines(NULL,'นาย สมชาย ใจดี'),d),true),
       set_config('pn.a1_other',pg_temp.pn_agent('pn-review-1','PN-B1','50','PNREF0001',8,pg_temp.pn_lines(NULL,'Other Payer'),d),true),
       set_config('pn.a2',pg_temp.pn_agent('pn-review-2','PN-B2','50','PNREF0002',8,pg_temp.pn_lines('Existing Payer',E'Existing Payer\nน.ส. สมฤดี เ'),d),true),
       set_config('pn.a2_drift',pg_temp.pn_agent('pn-review-2b','PN-B2','50','PNREF0012',8,pg_temp.pn_lines('Existing Payer',E'Existing Payer\nOther Payer'),d),true),
       set_config('pn.a3_late',pg_temp.pn_agent('pn-review-3','PN-B3','50','PNREF0003',8,pg_temp.pn_lines(E'สมชาย ใ***\nAlice Aaa',E'นาย สมชาย ใจดี\nAlice Aaa'),d-2),true),
       set_config('pn.a3',pg_temp.pn_agent('pn-review-4','PN-B3','50','PNREF0004',8,pg_temp.pn_lines(E'สมชาย ใ***\nAlice Aaa',E'นาย สมชาย ใจดี\nAlice Aaa'),d-1),true),
       set_config('pn.a4_v7',pg_temp.pn_agent('pn-review-5','PN-B4','50','PNREF0005',7,NULL,d),true),
       set_config('pn.a4_null',pg_temp.pn_agent('pn-review-6','PN-B4','50','PNREF0006',8,'null',d),true),
       set_config('pn.a_bad1',pg_temp.pn_agent('pn-review-7','PN-B4','50','PNREF0007',8,pg_temp.pn_lines(NULL,' padded'),d),true),
       set_config('pn.a_bad2',pg_temp.pn_agent('pn-review-8','PN-B4','50','PNREF0008',8,pg_temp.pn_lines(NULL,E'ก กกก\nข ขขข\nค คคค\nง งงง\nจ จจจ\nฉ ฉฉฉ'),d),true),
       set_config('pn.a_bad3',pg_temp.pn_agent('pn-review-9','PN-B4','50','PNREF0009',8,pg_temp.pn_lines(NULL,E'line\u0007mali'),d),true),
       set_config('pn.a_bad4',pg_temp.pn_agent('pn-review-10','PN-B4','50','PNREF0010',8,pg_temp.pn_lines(NULL,E'émile durand'),d),true),
       set_config('pn.a_bad5',pg_temp.pn_agent('pn-review-11','PN-B4','50','PNREF0011',8,'"Alice Aaa"',d),true),
       set_config('pn.a_bad6',pg_temp.pn_agent('pn-review-12','PN-B4','50','PNREF0013',8,pg_temp.pn_lines('Alice Aaa','Alice Aaa'),d),true),
       set_config('pn.a_bad7',pg_temp.pn_agent('pn-review-13','PN-B4','50','PNREF0014',8,pg_temp.pn_lines(NULL,E'Alice Aaa\n\nBob Bbb'),d),true),
       set_config('pn.a_bad8',pg_temp.pn_agent('pn-review-14','PN-B4','50','PNREF0015',8,pg_temp.pn_lines(NULL,'Alice  Aaa'),d),true),
       set_config('pn.m5',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555551','PN-B5',8,'Bank Transfer','PNM00001',pg_temp.pn_lines(NULL,'Somchai Jaidee'),d),true),
       set_config('pn.m5_other',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555551','PN-B5',8,'Bank Transfer','PNM00001',pg_temp.pn_lines(NULL,'Somchai Other'),d),true),
       set_config('pn.m5_late',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555552','PN-B6',8,'Bank Transfer',NULL,pg_temp.pn_lines(NULL,'Somchai Jaidee'),d-2),true),
       set_config('pn.m6_v7',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555553','PN-B6',7,'Bank Transfer','PNM00003',NULL,d),true),
       set_config('pn.m6_cash',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555554','PN-B7',8,'Cash',NULL,'null',d),true),
       set_config('pn.m_bad_cash',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555555','PN-B6',8,'Cash',NULL,pg_temp.pn_lines(NULL,'Somchai Jaidee'),d),true),
       set_config('pn.m_bad_name',pg_temp.pn_manual('a5555555-5555-4555-8555-555555555556','PN-B6',8,'Bank Transfer',NULL,pg_temp.pn_lines(NULL,'Somchai Jaidee '),d),true)
FROM pn_day \gset pn_unused_

-- Operator grants, emulated and rolled back: the DEV capability policy (app-role-policy.mjs, as Test-RowChanges.sql emulates it)
-- and the agent receipt EXECUTE grant (as r053-agent-receipt-independent grants it).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_agent_receipt_v1(text),public.pwa_agent_receipt_status_v1(uuid,text,text) TO "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;
BEGIN
 -- Agent v8 fills an empty column; a replay returns the recorded status; another payerLines under the same requestId conflicts.
 r:=public.pwa_submit_agent_receipt_v1(current_setting('pn.a1'));
 IF r->'originalOutcome'->>'status'<>'posted' OR r->'financialMatch'<>'true'::jsonb THEN RAISE EXCEPTION 'agent v8 must post: %',r; END IF;
 PERFORM set_config('pn.after_a1',(SELECT coalesce(max(seq),0) FROM public.pwa_row_changes)::text,true);
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a1'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'agent replay'; END IF;
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a1_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'another payerLines under the same requestId must conflict'; END IF;
 -- Appends a payer line; then a stale `before` (drift) posts without writing the column.
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a2'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'agent v8 append'; END IF;
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a2_drift'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'drift must still post'; END IF;
 -- A rejected outcome (two days ago) leaves the column; the same change yesterday replaces the more-masked line.
 r:=public.pwa_submit_agent_receipt_v1(current_setting('pn.a3_late'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'invalid_date' THEN RAISE EXCEPTION 'late agent receipt: %',r; END IF;
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a3'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'agent v8 replace'; END IF;
 -- v7 stays accepted; v8 with payerLines null posts and learns nothing.
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a4_v7'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'agent v7'; END IF;
 IF public.pwa_submit_agent_receipt_v1(current_setting('pn.a4_null'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'agent v8 null payerLines'; END IF;
END $$;
-- Malformed payer lines are refused as invalid commands (nothing journalled).
DO $$
DECLARE k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['pn.a_bad1','pn.a_bad2','pn.a_bad3','pn.a_bad4','pn.a_bad5','pn.a_bad6','pn.a_bad7','pn.a_bad8'] LOOP
  BEGIN
   PERFORM public.pwa_submit_agent_receipt_v1(current_setting(k));
   RAISE EXCEPTION 'accepted %',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
END $$;
-- Manual receiving v8: fills on Bank Transfer, conflict on another value, rejection leaves the column, v7 and Cash without
-- payerLines post, Cash with payerLines and an untrimmed line are invalid.
DO $$
DECLARE r jsonb;k text;
BEGIN
 r:=public.pwa_submit_selected_charges_v1(current_setting('pn.m5'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'manual v8 must post: %',r; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pn.m5'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'manual replay'; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pn.m5_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'manual conflict'; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('pn.m5_late'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'invalid_date' THEN RAISE EXCEPTION 'late manual: %',r; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pn.m6_v7'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'manual v7'; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pn.m6_cash'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'manual v8 cash'; END IF;
 FOREACH k IN ARRAY ARRAY['pn.m_bad_cash','pn.m_bad_name'] LOOP
  BEGIN
   PERFORM public.pwa_submit_selected_charges_v1(current_setting(k));
   RAISE EXCEPTION 'accepted %',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;

DO $$
DECLARE names jsonb;
BEGIN
 SELECT jsonb_object_agg("Row ID",coalesce(to_jsonb("Communication Name"),'null'::jsonb)) INTO names FROM public."Borrowers" WHERE "Row ID" LIKE 'PN-B_';
 IF names<>jsonb_build_object('PN-B1','นาย สมชาย ใจดี','PN-B2',E'Existing Payer\nน.ส. สมฤดี เ','PN-B3',E'นาย สมชาย ใจดี\nAlice Aaa','PN-B4',NULL,
   'PN-B5','Somchai Jaidee','PN-B6',NULL,'PN-B7',NULL) THEN
  RAISE EXCEPTION 'payer lines after the commands: %',names; END IF;
 -- The learning is a normal borrower change for the PWA: change log row and a new borrower version.
 IF public.pwa_borrower_version_v2('PN-B1')=current_setting('pn.version_b1') THEN RAISE EXCEPTION 'the borrower version must change'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_row_changes WHERE table_name='Borrowers' AND row_key='PN-B1' AND seq>current_setting('pn.changes')::bigint) THEN
  RAISE EXCEPTION 'the learning must reach the PWA change log'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_row_changes WHERE table_name='Borrowers' AND row_key='PN-B1' AND seq>current_setting('pn.after_a1')::bigint) THEN
  RAISE EXCEPTION 'a replay or conflict must not write the borrower again'; END IF;
 -- Journal: the agent v8 row carries the change; the invalid commands left no row; v8 manual keeps its explicit plan.
 IF (SELECT canonical_json::jsonb#>'{command,payerLines}' FROM public.pwa_payment_commands WHERE canonical_json::jsonb#>>'{command,reviewId}'='pn-review-1')
   <>'{"before":null,"after":"นาย สมชาย ใจดี"}'::jsonb THEN RAISE EXCEPTION 'agent journal payer lines'; END IF;
 IF (SELECT "Status" FROM public."Payments" WHERE "Bank Reference"='PNREF0012')<>'Posted' THEN RAISE EXCEPTION 'the drifted receipt must be posted'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE canonical_json::jsonb#>>'{command,reviewId}' IN ('pn-review-7','pn-review-8','pn-review-9','pn-review-10','pn-review-11','pn-review-12','pn-review-13','pn-review-14'))
  OR EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id IN ('a5555555-5555-4555-8555-555555555555','a5555555-5555-4555-8555-555555555556')) THEN
  RAISE EXCEPTION 'an invalid command was journalled'; END IF;
 IF public.pwa_effective_payment_plan_v2('pwa:a5555555-5555-4555-8555-555555555551') IS NULL
  OR public.pwa_effective_payment_plan_v2('pwa:a5555555-5555-4555-8555-555555555551')#>>'{plan,allocations,0,chargeId}'<>'PN-C5' THEN
  RAISE EXCEPTION 'v8 manual payments keep the explicit plan provenance'; END IF;
 IF (SELECT "Status" FROM public."Payments" WHERE "Row ID"='pwa:a5555555-5555-4555-8555-555555555551')<>'Posted' THEN RAISE EXCEPTION 'manual v8 payment status'; END IF;
END $$;
ROLLBACK;
