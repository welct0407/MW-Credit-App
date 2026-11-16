-- V150 (R165): the group chat summary refresh table, pwa_request_group_chat_refresh_v1 and
-- pwa_complete_group_chat_refresh_v1 under the real roles, at the migration head, in a disposable cluster. One rolled-back
-- transaction; every name is invented.
-- Covers: migration-owned grants (the reader holds none), accepted, pending (same request id, row untouched), recent,
-- a completion followed by a new request, a stale open request replaced, unknown borrower (P0002), actor mismatches
-- (42501), invalid arguments (22023); completion of the matching id, a replay, an unknown or replaced id, malformed
-- commands and outcomes (22023); the table's own checks; the cascades and the change-log rows.
\set ON_ERROR_STOP on
BEGIN;
-- A. Grants as the migration leaves them (before the operator-policy emulation below).
DO $$ DECLARE r text; fn text; BEGIN
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE NOT has_table_privilege('mw_app_dev','public.pwa_group_chat_refresh_requests',p))
  OR has_table_privilege('mw_app_dev','public.pwa_group_chat_refresh_requests','TRUNCATE') THEN RAISE EXCEPTION 'mw_app_dev grants on the refresh table differ'; END IF;
 FOREACH fn IN ARRAY ARRAY['public.pwa_request_group_chat_refresh_v1(jsonb,text)','public.pwa_complete_group_chat_refresh_v1(text)'] LOOP
  IF NOT has_function_privilege('mw_app_dev',fn,'EXECUTE') OR NOT has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam',fn,'EXECUTE') THEN
   RAISE EXCEPTION 'the application role and the command login must execute %',fn; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn::regprocedure AND a.grantee=0)
   OR (SELECT prosecdef FROM pg_proc WHERE oid=fn::regprocedure) THEN RAISE EXCEPTION '% must be invoker rights without PUBLIC execution',fn; END IF;
 END LOOP;
 IF NOT has_table_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_group_chat_refresh_requests','INSERT') THEN RAISE EXCEPTION 'command login must record refresh requests'; END IF;
 FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname NOT LIKE 'pg\_%' AND rolname NOT IN ('mw_app_dev','mw_app_dev_journal_owner','mw-credit-app-command-dev@clever-oasis-508610-n7.iam') LOOP
  IF has_function_privilege(r,'public.pwa_request_group_chat_refresh_v1(jsonb,text)','EXECUTE') OR has_function_privilege(r,'public.pwa_complete_group_chat_refresh_v1(text)','EXECUTE')
   OR has_any_column_privilege(r,'public.pwa_group_chat_refresh_requests','SELECT')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(r,'public.pwa_group_chat_refresh_requests',p)) THEN
   RAISE EXCEPTION 'unexpected refresh table access for %',r; END IF;
 END LOOP;
END $$;

-- The DEV capability grants the operator policy provides live (app-role-policy.mjs), as Test-RowChanges.sql emulates them.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
INSERT INTO "Partners"("Row ID","Partner Role","Login Email") VALUES('GR-P1','A','gr-one@example.invalid'),('GR-P2','B','GR-Two@Example.invalid '),('GR-P3','B',NULL);
INSERT INTO "Borrowers"("Row ID","Borrower Name","AI Collection Enabled") VALUES('GR-A','Synthetic refresh A',true),('GR-B','Synthetic refresh B',true);
CREATE TEMP TABLE gr_mark ON COMMIT DROP AS SELECT coalesce(max(seq),0) AS seq FROM public.pwa_row_changes;
GRANT SELECT,UPDATE ON gr_mark TO PUBLIC;
CREATE FUNCTION pg_temp.gr_since() RETURNS text LANGUAGE sql AS
 $$SELECT coalesce(string_agg(table_name||':'||row_key,' ' ORDER BY seq),'') FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM gr_mark) AND table_name='pwa_group_chat_refresh_requests'$$;
CREATE FUNCTION pg_temp.gr_actor(partner text, email text) RETURNS jsonb LANGUAGE sql AS
 $$SELECT jsonb_build_object('issuer','https://issuer.example.invalid','subject','synthetic-subject','partnerId',partner,'loginEmail',email)$$;
CREATE FUNCTION pg_temp.gr_done(request text, outcome text) RETURNS text LANGUAGE sql AS
 $$SELECT jsonb_build_object('command',jsonb_build_object('schemaVersion',1,'environment','dev','requestId',request,'outcome',outcome))::text$$;
GRANT EXECUTE ON FUNCTION pg_temp.gr_since(),pg_temp.gr_actor(text,text),pg_temp.gr_done(text,text) TO PUBLIC;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE one jsonb:=pg_temp.gr_actor('GR-P1','gr-one@example.invalid'); two jsonb:=pg_temp.gr_actor('GR-P2','gr-two@example.invalid');
 got jsonb; opened jsonb; request text; version xid; code text; message text; bad jsonb; body text;
BEGIN
 -- B. Accepted: a new open request under the caller, one change-log row under the borrower.
 opened:=public.pwa_request_group_chat_refresh_v1(one,'GR-A');
 IF opened->>'kind'<>'accepted' OR opened->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR opened->>'requestedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' OR opened->'completedAt'<>'null'::jsonb OR opened->'outcome'<>'null'::jsonb
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(opened) k)<>ARRAY['completedAt','kind','outcome','requestId','requestedAt'] THEN RAISE EXCEPTION 'accepted result %',opened; END IF;
 request:=opened->>'requestId';
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A' AND request_id=request::uuid AND requested_by='GR-P1' AND completed_at IS NULL AND outcome IS NULL)
  OR (SELECT count(*) FROM public.pwa_group_chat_refresh_requests)<>1 THEN RAISE EXCEPTION 'accepted row differs'; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'accepted change log: %',pg_temp.gr_since(); END IF;

 -- C. Pending: a repeat tap (by anyone) within 10 minutes answers the same request; the row and the change log are untouched.
 SELECT xmin INTO version FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A';
 FOREACH bad IN ARRAY ARRAY[one,two] LOOP
  got:=public.pwa_request_group_chat_refresh_v1(bad,'GR-A');
  IF got IS DISTINCT FROM jsonb_set(opened,'{kind}','"pending"') THEN RAISE EXCEPTION 'pending result %',got; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A' AND xmin=version AND requested_by='GR-P1') THEN RAISE EXCEPTION 'a pending repeat touched the row'; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'a pending repeat wrote the change log: %',pg_temp.gr_since(); END IF;
 -- Still pending at 9 minutes 59 seconds.
 UPDATE public.pwa_group_chat_refresh_requests SET requested_at=clock_timestamp()-interval '9 minutes 59 seconds' WHERE borrower_id='GR-A';
 IF public.pwa_request_group_chat_refresh_v1(one,'GR-A')->>'kind'<>'pending' THEN RAISE EXCEPTION 'pending must last 10 minutes'; END IF;

 -- D. Completion of the matching id: completed, outcome and time set, one change-log row.
 UPDATE gr_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
 got:=public.pwa_complete_group_chat_refresh_v1(pg_temp.gr_done(request,'unchanged'));
 IF got IS DISTINCT FROM '{"kind":"completed"}'::jsonb THEN RAISE EXCEPTION 'completion result %',got; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A' AND outcome='unchanged' AND completed_at IS NOT NULL AND completed_at>=requested_at) THEN RAISE EXCEPTION 'completed row differs'; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'completion change log: %',pg_temp.gr_since(); END IF;
 -- A replay, or a second report with another outcome, keeps the first outcome and writes nothing.
 SELECT xmin INTO version FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A';
 FOREACH body IN ARRAY ARRAY[pg_temp.gr_done(request,'unchanged'),pg_temp.gr_done(request,'failed')] LOOP
  got:=public.pwa_complete_group_chat_refresh_v1(body);
  IF got IS DISTINCT FROM '{"kind":"replayed"}'::jsonb THEN RAISE EXCEPTION 'replay result %',got; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A' AND xmin=version AND outcome='unchanged') THEN RAISE EXCEPTION 'a replay touched the row'; END IF;
 -- An id no row carries changes nothing.
 got:=public.pwa_complete_group_chat_refresh_v1(pg_temp.gr_done('0c970c97-0c97-4c97-8c97-0c970c970c97','stored'));
 IF got IS DISTINCT FROM '{"kind":"unknown_request"}'::jsonb THEN RAISE EXCEPTION 'unknown id result %',got; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'a replay or unknown id wrote the change log: %',pg_temp.gr_since(); END IF;

 -- E. Recent: a tap within 60 seconds of the completion answers it (with its outcome); nothing is written.
 got:=public.pwa_request_group_chat_refresh_v1(two,'GR-A');
 IF got->>'kind'<>'recent' OR got->>'requestId'<>request OR got->>'outcome'<>'unchanged' OR got->>'completedAt' !~ 'Z$' THEN RAISE EXCEPTION 'recent result %',got; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'a recent answer wrote the change log'; END IF;
 -- 60 seconds after the completion a tap is a new request, under the new caller; the old id is now unknown.
 UPDATE public.pwa_group_chat_refresh_requests SET requested_at=clock_timestamp()-interval '2 minutes',completed_at=clock_timestamp()-interval '60 seconds' WHERE borrower_id='GR-A';
 UPDATE gr_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
 got:=public.pwa_request_group_chat_refresh_v1(two,'GR-A');
 IF got->>'kind'<>'accepted' OR got->>'requestId'=request OR got->'completedAt'<>'null'::jsonb OR got->'outcome'<>'null'::jsonb THEN RAISE EXCEPTION 'new request after completion %',got; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A' AND request_id=(got->>'requestId')::uuid AND requested_by='GR-P2' AND completed_at IS NULL AND outcome IS NULL) THEN RAISE EXCEPTION 'replaced row differs'; END IF;
 IF public.pwa_complete_group_chat_refresh_v1(pg_temp.gr_done(request,'stored'))<>'{"kind":"unknown_request"}'::jsonb THEN RAISE EXCEPTION 'a replaced id completed the new request'; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'new request change log: %',pg_temp.gr_since(); END IF;
 request:=got->>'requestId';

 -- F. Stale: an open request of 10 minutes or more is replaced by the next tap (a new id); the stale id is then unknown.
 UPDATE public.pwa_group_chat_refresh_requests SET requested_at=clock_timestamp()-interval '10 minutes' WHERE borrower_id='GR-A';
 got:=public.pwa_request_group_chat_refresh_v1(one,'GR-A');
 IF got->>'kind'<>'accepted' OR got->>'requestId'=request THEN RAISE EXCEPTION 'stale request not replaced: %',got; END IF;
 IF public.pwa_complete_group_chat_refresh_v1(pg_temp.gr_done(request,'failed'))<>'{"kind":"unknown_request"}'::jsonb THEN RAISE EXCEPTION 'a stale id completed the new request'; END IF;
 -- Every outcome is accepted (each on its own new request).
 FOREACH message IN ARRAY ARRAY['stored','cleared','no_group','failed'] LOOP
  UPDATE public.pwa_group_chat_refresh_requests SET requested_at=clock_timestamp()-interval '10 minutes',completed_at=NULL,outcome=NULL WHERE borrower_id='GR-A';
  got:=public.pwa_request_group_chat_refresh_v1(one,'GR-A');
  -- Two statements: the check must see the completion (one statement reads the snapshot taken before it).
  IF public.pwa_complete_group_chat_refresh_v1(pg_temp.gr_done(got->>'requestId',message))<>'{"kind":"completed"}'::jsonb THEN RAISE EXCEPTION 'outcome % not completed',message; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A' AND outcome=message) THEN RAISE EXCEPTION 'outcome % not stored',message; END IF;
 END LOOP;
 -- One request per borrower: another borrower has its own row.
 IF public.pwa_request_group_chat_refresh_v1(one,'GR-B')->>'kind'<>'accepted' THEN RAISE EXCEPTION 'another borrower was not accepted'; END IF;
 IF (SELECT count(*) FROM public.pwa_group_chat_refresh_requests)<>2 THEN RAISE EXCEPTION 'per-borrower rows differ'; END IF;

 -- G. Refusals of the request: unknown borrower P0002; actor mismatch 42501; invalid arguments 22023. Nothing written.
 UPDATE gr_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
 BEGIN PERFORM public.pwa_request_group_chat_refresh_v1(one,'GR-MISSING'); RAISE EXCEPTION 'unknown borrower accepted';
 EXCEPTION WHEN no_data_found THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF code<>'P0002' OR message<>'unknown_borrower' THEN RAISE EXCEPTION 'unknown borrower signalled % %',code,message; END IF; END;
 FOR bad IN SELECT * FROM (VALUES
   (pg_temp.gr_actor('GR-P2','gr-one@example.invalid')),(pg_temp.gr_actor('GR-P1','gr-two@example.invalid')),(pg_temp.gr_actor('GR-P1','GR-One@example.invalid')),
   (pg_temp.gr_actor('GR-P1','unknown@example.invalid')),(pg_temp.gr_actor('GR-P3','gr-one@example.invalid')),(pg_temp.gr_actor('GR-MISSING','gr-one@example.invalid')),
   (one-'subject'),(one||'{"extra":"x"}'),(jsonb_set(one,'{partnerId}','1')),('[]'::jsonb),('null'::jsonb),(NULL::jsonb)) v(a) LOOP
  BEGIN PERFORM public.pwa_request_group_chat_refresh_v1(bad,'GR-B'); RAISE EXCEPTION 'actor accepted: %',bad;
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; IF message<>'access_denied' THEN RAISE EXCEPTION 'actor refusal signalled %',message; END IF; END;
 END LOOP;
 BEGIN PERFORM public.pwa_request_group_chat_refresh_v1(one,NULL); RAISE EXCEPTION 'null borrower accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.pwa_request_group_chat_refresh_v1(one,''); RAISE EXCEPTION 'empty borrower accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 -- H. Refusals of the completion: 22023 invalid_request for every malformed command or outcome.
 request:=(SELECT request_id::text FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-B');
 FOREACH body IN ARRAY ARRAY['not json','[]','{}','{"command":null}',
   pg_temp.gr_done(request,'pending'),pg_temp.gr_done(request,'STORED'),pg_temp.gr_done(request,''),pg_temp.gr_done(upper(request),'stored'),pg_temp.gr_done('not-a-uuid','stored'),
   jsonb_set(pg_temp.gr_done(request,'stored')::jsonb,'{command,outcome}','null')::text,
   jsonb_set(pg_temp.gr_done(request,'stored')::jsonb,'{command,environment}','"prod"')::text,
   jsonb_set(pg_temp.gr_done(request,'stored')::jsonb,'{command,schemaVersion}','2')::text,
   jsonb_set(pg_temp.gr_done(request,'stored')::jsonb,'{command,schemaVersion}','"1"')::text,
   jsonb_set(pg_temp.gr_done(request,'stored')::jsonb,'{command,borrowerId}','"GR-B"')::text,
   ((pg_temp.gr_done(request,'stored')::jsonb)#-'{command,environment}')::text,
   (pg_temp.gr_done(request,'stored')::jsonb||'{"extra":1}')::text,NULL] LOOP
  BEGIN PERFORM public.pwa_complete_group_chat_refresh_v1(body); RAISE EXCEPTION 'completion accepted: %',body;
  EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; IF message<>'invalid_request' THEN RAISE EXCEPTION 'completion refusal signalled %',message; END IF; END;
 END LOOP;
 IF pg_temp.gr_since()<>'' OR EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-B' AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'a refused call wrote something: %',pg_temp.gr_since(); END IF;

 -- I. The table's own checks against a direct write by the application role.
 BEGIN UPDATE public.pwa_group_chat_refresh_requests SET outcome='stored' WHERE borrower_id='GR-B'; RAISE EXCEPTION 'outcome without completion stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.pwa_group_chat_refresh_requests SET completed_at=requested_at-interval '1 second',outcome='stored' WHERE borrower_id='GR-B'; RAISE EXCEPTION 'completion before the request stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.pwa_group_chat_refresh_requests SET completed_at=clock_timestamp(),outcome='done' WHERE borrower_id='GR-B'; RAISE EXCEPTION 'unknown outcome stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.pwa_group_chat_refresh_requests SET request_id=(SELECT request_id FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A') WHERE borrower_id='GR-B'; RAISE EXCEPTION 'duplicate request id stored'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN INSERT INTO public.pwa_group_chat_refresh_requests(borrower_id,request_id,requested_by,requested_at) VALUES('GR-MISSING',gen_random_uuid(),'GR-P1',now()); RAISE EXCEPTION 'request for a missing borrower stored'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN TRUNCATE public.pwa_group_chat_refresh_requests; RAISE EXCEPTION 'application truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- J. The reader login without the operator's column grant cannot read the table or call either function.
SET SESSION AUTHORIZATION "mw-credit-app-read-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 IF has_any_column_privilege('public.pwa_group_chat_refresh_requests','SELECT') THEN RAISE EXCEPTION 'reader holds a migration-owned grant'; END IF;
 BEGIN PERFORM public.pwa_request_group_chat_refresh_v1('{}'::jsonb,'GR-A'); RAISE EXCEPTION 'reader may request a refresh'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pwa_complete_group_chat_refresh_v1('{}'); RAISE EXCEPTION 'reader may complete a refresh'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- K. Cascades: a deleted borrower takes its request; a deleted Partner takes the requests it made. Both logged under the borrower.
UPDATE gr_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
DELETE FROM "Borrowers" WHERE "Row ID"='GR-A';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests WHERE borrower_id='GR-A') OR (SELECT count(*) FROM public.pwa_group_chat_refresh_requests)<>1 THEN RAISE EXCEPTION 'a request survived its borrower'; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-A' THEN RAISE EXCEPTION 'borrower cascade change log: %',pg_temp.gr_since(); END IF;
END $$;
UPDATE gr_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
DELETE FROM "Cash Statement Context" WHERE "Ref Partner"='GR-P1';
DELETE FROM "Partners" WHERE "Row ID"='GR-P1';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pwa_group_chat_refresh_requests) THEN RAISE EXCEPTION 'a request survived its partner'; END IF;
 IF pg_temp.gr_since()<>'pwa_group_chat_refresh_requests:GR-B' THEN RAISE EXCEPTION 'partner cascade change log: %',pg_temp.gr_since(); END IF;
END $$;
SELECT 'Group chat refresh regression passed' AS result;
ROLLBACK;
