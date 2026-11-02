-- R115 V127 daily cash withdrawal (disposable cluster only; synthetic rows; everything rolls back).
-- cash-withdrawal.create runs as the DEV command IAM user through pwa_submit_operation_v2 (the journal checks session_user);
-- setup and checks run as postgres. Cases:
--  * the guard: a Manual INSERT keeps server time without r115.cash_movement_time (even with an explicit Created At),
--    keeps the explicit past time with it, refuses a future time with it, and Created At stays immutable on UPDATE;
--  * a back-dated withdrawal may not turn a later balance negative: SCB is 950 as of 10:00 (the 10:00 entry counts, the
--    10:20 outflow of 300 does not) but its lowest later balance is 650, so 950 is insufficient_funds with zero rows;
--  * applied: 650 + 200 become two Manual Cash Handovers (ids target and wd115:target:2), Movement Date = date,
--    Created At = date + time (Bangkok), notes "Daily cash withdrawal", Dad on both ends; every later balance stays >= 0;
--  * replay returns the recorded outcome with no second write; the same request id with other details is a conflict;
--  * an overdraw (one line of two) is insufficient_funds with zero rows; one line writes exactly one row;
--  * rejects: a non-Dad account (invalid_reference), a future time or a date before the 15-day window (invalid_date),
--    an uninitialized Dad account (account_unavailable); amount 0, duplicate source, source equal to destination,
--    a minute that is not a multiple of 10 and no lines are invalid commands (22023).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.wd_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE wd_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON wd_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('WD-ACT','Synthetic withdrawal actor','A','wd-actor@example.invalid','English');
-- Dad's synthetic accounts: two banks and on-hand cash, initialized (opening 1000, 500, 0); CI-DAD stays uninitialized.
INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('WD-SCB','ch:dad','Synthetic Dad SCB','Synthetic'),('WD-TTB','ch:dad','Synthetic Dad TTB','Synthetic'),('WD-CASH','ch:dad','Synthetic Dad Cash','Synthetic');
SELECT set_config('r008.initializing','on',true);
INSERT INTO public.r008_cash_account_cutover("Ref Cash Account","Cutover At","Opening Balance","Baseline Cash In","Baseline Cash Out","Created By","Notes")
 VALUES('WD-SCB',clock_timestamp()-interval '3 days',1000,0,0,'synthetic','Synthetic R115 opening'),('WD-TTB',clock_timestamp()-interval '3 days',500,0,0,'synthetic','Synthetic R115 opening'),
 ('WD-CASH',clock_timestamp()-interval '3 days',0,0,0,'synthetic','Synthetic R115 opening');
SELECT set_config('r008.initializing','',true);

-- 1. The guard. Without the setting an explicit Created At is replaced by server time.
INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Entry Origin","Created At")
 VALUES('WD-G0',(SELECT d FROM wd_day)-1,'Cash Handover',1,'ch:dad','ch:dad','WD-TTB','WD-CASH','Manual',((SELECT d FROM wd_day)-1)+time '08:00');
SELECT pg_temp.wd_assert((SELECT "Created At" FROM public."Cash Ledger" WHERE "Row ID"='WD-G0')=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'),'no setting: server time');
-- With the setting the explicit past time stays: yesterday's SCB entries at 09:00 (out 100), 10:00 (in 50, the tie) and 10:20 (out 300).
SELECT set_config('r115.cash_movement_time','on',true);
INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Entry Origin","Created At") VALUES
 ('WD-E1',(SELECT d FROM wd_day)-1,'Cash Handover',100,'ch:dad','ch:dad','WD-SCB','WD-CASH','Manual',((SELECT d FROM wd_day)-1)+time '09:00'),
 ('WD-E2',(SELECT d FROM wd_day)-1,'Cash Handover',50,'ch:dad','ch:dad','WD-CASH','WD-SCB','Manual',((SELECT d FROM wd_day)-1)+time '10:00'),
 ('WD-E3',(SELECT d FROM wd_day)-1,'Cash Handover',300,'ch:dad','ch:dad','WD-SCB','WD-CASH','Manual',((SELECT d FROM wd_day)-1)+time '10:20');
SELECT pg_temp.wd_assert((SELECT "Created At" FROM public."Cash Ledger" WHERE "Row ID"='WD-E2')=((SELECT d FROM wd_day)-1)+time '10:00','setting: explicit time kept');
DO $$ BEGIN
 BEGIN
  INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Entry Origin","Created At")
   VALUES('WD-GF',(SELECT d FROM wd_day),'Cash Handover',1,'ch:dad','ch:dad','WD-TTB','WD-CASH','Manual',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')+interval '1 hour');
  RAISE EXCEPTION 'FAILED: a future time was accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Cash movement time must not be in the future' THEN RAISE; END IF;
 END;
END $$;
SELECT set_config('r115.cash_movement_time','',true);
DO $$ BEGIN
 BEGIN
  UPDATE public."Cash Ledger" SET "Created At"="Created At"-interval '1 minute' WHERE "Row ID"='WD-E1';
  RAISE EXCEPTION 'FAILED: Created At was updated';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Cash identity, source and creation audit are immutable' THEN RAISE; END IF;
 END;
END $$;
-- The as-of reading the read service uses: SCB at yesterday 10:00 = 1000 - 100 + 50 (tie included, 10:20 excluded).
SELECT pg_temp.wd_assert((SELECT d."Opening Balance"+coalesce((SELECT sum(s."Signed Amount") FROM public."Cash Account Statement Recent" s WHERE s."Ref Cash Account"='WD-SCB' AND s."Statement Date"=d."Statement Date" AND s."Sort Timestamp"<=((SELECT d FROM wd_day)-1)+time '10:00'),0)
 FROM public."Cash Account Daily Summary Recent" d WHERE d."Ref Cash Account"='WD-SCB' AND d."Statement Date"=(SELECT d FROM wd_day)-1)=950,'as-of SCB 950');
-- The lowest later running balance (after 10:00): 1000 - 100 + 50 - 300 = 650 after the 10:20 outflow.
SELECT pg_temp.wd_assert((SELECT min(s."Balance After") FROM public."Cash Account Statement Recent" s WHERE s."Ref Cash Account"='WD-SCB' AND (s."Statement Date">(SELECT d FROM wd_day)-1 OR (s."Statement Date"=(SELECT d FROM wd_day)-1 AND s."Sort Timestamp">((SELECT d FROM wd_day)-1)+time '10:00')))=650,'later minimum SCB 650');

-- Canonical command text, as the command service builds it. lines is a JSON array text of {fromAccountId, amount}.
CREATE FUNCTION pg_temp.wd_cmd(request text,target text,day date,at text,dest text,lines text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://wd.invalid","subject":"wd-owner","partnerId":"WD-ACT","loginEmail":"wd-actor@example.invalid"},"command":{"schemaVersion":1,"operation":"cash-withdrawal.create","targetType":"cash-withdrawal","targetId":'
  ||to_json(target)::text||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{"movementDate":'||to_json(to_char(day,'YYYY-MM-DD'))::text||',"movementTime":'||to_json(at)::text||',"toAccountId":'||to_json(dest)::text||',"lines":'||lines||'}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.wd_lines(VARIADIC v text[]) RETURNS text LANGUAGE sql AS $f$
 SELECT '['||string_agg('{"fromAccountId":'||to_json(v[k])::text||',"amount":'||to_json(v[k+1])::text||'}',',' ORDER BY k)||']' FROM generate_series(1,array_length(v,1),2) k $f$;
SELECT set_config('wd.later',pg_temp.wd_cmd('a9999999-9999-4999-8999-999999999999','b9999999-9999-4999-8999-999999999999',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-SCB','950','WD-TTB','200')),true),
 set_config('wd.ok',pg_temp.wd_cmd('a1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-SCB','650','WD-TTB','200')),true),
 set_config('wd.other',pg_temp.wd_cmd('a1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-SCB','649','WD-TTB','200')),true),
 set_config('wd.over',pg_temp.wd_cmd('a2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-TTB','100','WD-SCB','1')),true),
 set_config('wd.one',pg_temp.wd_cmd('a3333333-3333-4333-8333-333333333333','b3333333-3333-4333-8333-333333333333',(SELECT d FROM wd_day)-1,'10:20','WD-CASH',pg_temp.wd_lines('WD-TTB','299')),true),
 set_config('wd.lisa',pg_temp.wd_cmd('a4444444-4444-4444-8444-444444444444','b4444444-4444-4444-8444-444444444444',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('CI-LISA','1')),true),
 set_config('wd.future',pg_temp.wd_cmd('a5555555-5555-4555-8555-555555555555','b5555555-5555-4555-8555-555555555555',(SELECT d FROM wd_day)+1,'00:00','WD-CASH',pg_temp.wd_lines('WD-TTB','1')),true),
 set_config('wd.old',pg_temp.wd_cmd('a6666666-6666-4666-8666-666666666666','b6666666-6666-4666-8666-666666666666',(SELECT d FROM wd_day)-15,'10:00','WD-CASH',pg_temp.wd_lines('WD-TTB','1')),true),
 set_config('wd.uninit',pg_temp.wd_cmd('a7777777-7777-4777-8777-777777777777','b7777777-7777-4777-8777-777777777777',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('CI-DAD','1')),true),
 set_config('wd.zero',pg_temp.wd_cmd('a8888888-8888-4888-8888-888888888881','b8888888-8888-4888-8888-888888888881',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-TTB','0')),true),
 set_config('wd.dup',pg_temp.wd_cmd('a8888888-8888-4888-8888-888888888882','b8888888-8888-4888-8888-888888888882',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-TTB','1','WD-TTB','2')),true),
 set_config('wd.same',pg_temp.wd_cmd('a8888888-8888-4888-8888-888888888883','b8888888-8888-4888-8888-888888888883',(SELECT d FROM wd_day)-1,'10:00','WD-CASH',pg_temp.wd_lines('WD-CASH','1')),true),
 set_config('wd.minute',pg_temp.wd_cmd('a8888888-8888-4888-8888-888888888884','b8888888-8888-4888-8888-888888888884',(SELECT d FROM wd_day)-1,'10:05','WD-CASH',pg_temp.wd_lines('WD-TTB','1')),true),
 set_config('wd.empty',pg_temp.wd_cmd('a8888888-8888-4888-8888-888888888885','b8888888-8888-4888-8888-888888888885',(SELECT d FROM wd_day)-1,'10:00','WD-CASH','[]'),true);

-- Operator grants, emulated and rolled back (as Test-RebateOffset.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;expected text[][]:=ARRAY[['wd.over','insufficient_funds'],['wd.lisa','invalid_reference'],['wd.future','invalid_date'],['wd.old','invalid_date'],['wd.uninit','account_unavailable']];
BEGIN
 -- 2. 950 from SCB is within the as-of balance but would turn the 10:20 balance negative: rejected, nothing written.
 r:=public.pwa_submit_operation_v2(current_setting('wd.later'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'insufficient_funds' THEN RAISE EXCEPTION 'FAILED: a later negative balance must be insufficient_funds: %',r; END IF;
 -- Applied within the later minimum, then replayed; other details under the same request id are a conflict.
 r:=public.pwa_submit_operation_v2(current_setting('wd.ok'));
 IF r->'originalOutcome'->>'status'<>'applied' OR r#>>'{originalOutcome,result,targetType}'<>'cash-withdrawal' THEN RAISE EXCEPTION 'FAILED: the withdrawal must apply: %',r; END IF;
 IF public.pwa_submit_operation_v2(current_setting('wd.ok'))->'originalOutcome'->>'status'<>'applied' THEN RAISE EXCEPTION 'FAILED: replay'; END IF;
 IF public.pwa_submit_operation_v2(current_setting('wd.other'))->>'kind'<>'conflict' THEN RAISE EXCEPTION 'FAILED: other details under the same request id'; END IF;
 -- 3. Recorded rejections (nothing written).
 FOR k IN 1..array_length(expected,1) LOOP
  r:=public.pwa_submit_operation_v2(current_setting(expected[k][1]));
  IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>expected[k][2] THEN RAISE EXCEPTION 'FAILED: % must be %: %',expected[k][1],expected[k][2],r; END IF;
 END LOOP;
 -- 4. One line, one row.
 IF public.pwa_submit_operation_v2(current_setting('wd.one'))->'originalOutcome'->>'status'<>'applied' THEN RAISE EXCEPTION 'FAILED: one line'; END IF;
 -- 5. Invalid commands.
 FOREACH k IN ARRAY ARRAY['wd.zero','wd.dup','wd.same','wd.minute','wd.empty'] LOOP
  BEGIN
   PERFORM public.pwa_submit_operation_v2(current_setting(k));
   RAISE EXCEPTION 'FAILED: % was accepted',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;

DO $$
DECLARE y date:=(SELECT d FROM wd_day)-1;
BEGIN
 PERFORM pg_temp.wd_assert((SELECT count(*) FROM public."Cash Ledger" WHERE "Row ID" IN ('b1111111-1111-4111-8111-111111111111','wd115:b1111111-1111-4111-8111-111111111111:2'))=2,'two rows');
 PERFORM pg_temp.wd_assert(NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Row ID" LIKE 'wd115:b1111111-1111-4111-8111-111111111111:%' AND "Row ID"<>'wd115:b1111111-1111-4111-8111-111111111111:2'),'no third row');
 PERFORM pg_temp.wd_assert((SELECT bool_and("Movement Date"=y AND "Created At"=y+time '10:00' AND "Movement Type"='Cash Handover' AND "Entry Origin"='Manual' AND "Source Type"='Manual' AND "Source Key"='MANUAL:'||"Row ID"
  AND "Ref From Cash Holder"='ch:dad' AND "Ref To Cash Holder"='ch:dad' AND "Ref To Cash Account"='WD-CASH' AND "Notes"='Daily cash withdrawal' AND "Created By"='wd-actor@example.invalid')
  FROM public."Cash Ledger" WHERE "Row ID" IN ('b1111111-1111-4111-8111-111111111111','wd115:b1111111-1111-4111-8111-111111111111:2')),'row fields');
 PERFORM pg_temp.wd_assert((SELECT "Ref From Cash Account"||':'||"Amount"::numeric FROM public."Cash Ledger" WHERE "Row ID"='b1111111-1111-4111-8111-111111111111')='WD-SCB:650','line 1 is the target');
 PERFORM pg_temp.wd_assert((SELECT "Ref From Cash Account"||':'||"Amount"::numeric FROM public."Cash Ledger" WHERE "Row ID"='wd115:b1111111-1111-4111-8111-111111111111:2')='WD-TTB:200','line 2');
 PERFORM pg_temp.wd_assert((SELECT count(*) FROM public.pwa_payment_commands WHERE request_id='a1111111-1111-4111-8111-111111111111')=1,'one journal row');
 -- The overdraw wrote neither line; the other rejections wrote nothing.
 PERFORM pg_temp.wd_assert(NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Row ID" LIKE '%b2222222-2222-4222-8222-222222222222%' OR "Row ID" LIKE '%b4444444%' OR "Row ID" LIKE '%b5555555%' OR "Row ID" LIKE '%b6666666%' OR "Row ID" LIKE '%b7777777%' OR "Row ID" LIKE '%b8888888%' OR "Row ID" LIKE '%b9999999%'),'rejections wrote nothing');
 PERFORM pg_temp.wd_assert((SELECT count(*) FROM public."Cash Ledger" WHERE "Row ID" LIKE '%b3333333-3333-4333-8333-333333333333%')=1,'one line one row');
 PERFORM pg_temp.wd_assert((SELECT "Created At" FROM public."Cash Ledger" WHERE "Row ID"='b3333333-3333-4333-8333-333333333333')=y+time '10:20','one line time');
 -- The setting does not outlive the command.
 PERFORM pg_temp.wd_assert(coalesce(current_setting('r115.cash_movement_time',true),'')='','setting reset');
 -- Statement order: SCB ends the day at 0 (the 10:20 outflow takes the last 300).
 PERFORM pg_temp.wd_assert((SELECT "Closing Balance" FROM public."Cash Account Daily Summary Recent" WHERE "Ref Cash Account"='WD-SCB' AND "Statement Date"=y)=0,'SCB closing');
 -- No balance of either source account went negative at any point of the day (statement order).
 PERFORM pg_temp.wd_assert((SELECT min("Balance After") FROM public."Cash Account Statement Recent" WHERE "Ref Cash Account" IN ('WD-SCB','WD-TTB'))>=0,'later balances stay non-negative');
 PERFORM pg_temp.wd_assert((SELECT "Closing Balance" FROM public."Cash Account Daily Summary Recent" WHERE "Ref Cash Account"='WD-CASH' AND "Statement Date"=y)=100-50+300+650+200+299+1,'cash closing');
END $$;
SELECT 'Daily cash withdrawal regressions passed' AS result;
ROLLBACK;
