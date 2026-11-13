-- V147 (R149): the group chat seen table and pwa_mark_group_chat_seen_v1 under the real roles, at the migration head,
-- in a disposable cluster. One rolled-back transaction; every name is invented.
-- Covers: migration-owned grants, first write, forward move, equal and older values (row and change log untouched), the
-- clamp to the summary, a borrower without a summary (ignored), an unknown borrower, actor mismatches (42501), another
-- user's row left alone, both cascades and the change-log rows.
\set ON_ERROR_STOP on
BEGIN;
-- A. Grants as the migration leaves them (before the operator-policy emulation below).
DO $$ DECLARE r text; BEGIN
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE NOT has_table_privilege('mw_app_dev','public.pwa_group_chat_seen',p))
  OR has_table_privilege('mw_app_dev','public.pwa_group_chat_seen','TRUNCATE')
  OR NOT has_function_privilege('mw_app_dev','public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'mw_app_dev grants on the group chat seen table differ'; END IF;
 IF NOT has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)','EXECUTE')
  OR NOT has_table_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_group_chat_seen','INSERT') THEN RAISE EXCEPTION 'command login must record group chat seen values'; END IF;
 FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname NOT LIKE 'pg\_%' AND rolname NOT IN ('mw_app_dev','mw_app_dev_journal_owner','mw-credit-app-command-dev@clever-oasis-508610-n7.iam') LOOP
  IF has_function_privilege(r,'public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)','EXECUTE') OR has_any_column_privilege(r,'public.pwa_group_chat_seen','SELECT')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(r,'public.pwa_group_chat_seen',p)) THEN
   RAISE EXCEPTION 'unexpected group chat seen access for %',r; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)'::regprocedure AND a.grantee=0)
  OR (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)'::regprocedure) THEN RAISE EXCEPTION 'pwa_mark_group_chat_seen_v1 must be invoker rights without PUBLIC execution'; END IF;
 -- borrower_id is the first primary-key column (the change-log trigger argument).
 IF (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
   WHERE c.conrelid='public.pwa_group_chat_seen'::regclass AND c.contype='p') IS DISTINCT FROM ARRAY['borrower_id','partner_id'] THEN RAISE EXCEPTION 'pwa_group_chat_seen primary key differs'; END IF;
END $$;

-- The DEV capability grants the operator policy provides live (app-role-policy.mjs), as Test-RowChanges.sql emulates them.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
INSERT INTO "Partners"("Row ID","Partner Role","Login Email") VALUES('GS-P1','A','gs-one@example.invalid'),('GS-P2','B','GS-Two@Example.invalid '),('GS-P3','B',NULL);
INSERT INTO "Borrowers"("Row ID","Borrower Name","AI Collection Enabled") VALUES('GS-A','Synthetic seen A',true),('GS-B','Synthetic seen B',true),('GS-N','Synthetic seen none',true);
INSERT INTO public.pwa_group_chat_summaries(borrower_id,conversation_key,shared_group,headline_th,headline_en,points,last_speaker_role,message_count,window_from,last_message_at,generated_at,source_sha256,model,request_id)
 SELECT b,repeat('d',32),false,'สรุปสังเคราะห์','Synthetic summary','[]','partner',3,'2026-11-09T07:32:00Z','2026-11-12T07:05:00Z','2026-11-12T07:32:00Z',repeat('0',64),'synthetic-model','0c970c97-0c97-4c97-8c97-0c970c970c99'
 FROM unnest(ARRAY['GS-A','GS-B']) b;
CREATE TEMP TABLE gs_mark ON COMMIT DROP AS SELECT coalesce(max(seq),0) AS seq FROM public.pwa_row_changes;
GRANT SELECT,UPDATE ON gs_mark TO PUBLIC;
CREATE FUNCTION pg_temp.gs_since() RETURNS text LANGUAGE sql AS
 $$SELECT coalesce(string_agg(table_name||':'||row_key,' ' ORDER BY seq),'') FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM gs_mark) AND table_name='pwa_group_chat_seen'$$;
CREATE FUNCTION pg_temp.gs_actor(partner text, email text) RETURNS jsonb LANGUAGE sql AS
 $$SELECT jsonb_build_object('issuer','https://issuer.example.invalid','subject','synthetic-subject','partnerId',partner,'loginEmail',email)$$;
GRANT EXECUTE ON FUNCTION pg_temp.gs_since(),pg_temp.gs_actor(text,text) TO PUBLIC;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE one jsonb:=pg_temp.gs_actor('GS-P1','gs-one@example.invalid'); two jsonb:=pg_temp.gs_actor('GS-P2','gs-two@example.invalid');
 got jsonb; stamp timestamptz; version xid; code text; message text; bad jsonb;
BEGIN
 -- B. First write: the caller's own row, one change-log row under the borrower.
 got:=public.pwa_mark_group_chat_seen_v1(one,'GS-A','2026-11-12T06:00:00Z');
 IF got IS DISTINCT FROM '{"kind":"stored","seenAt":"2026-11-12T06:00:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'first write result %',got; END IF;
 IF (SELECT count(*) FROM public.pwa_group_chat_seen)<>1 OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_seen WHERE borrower_id='GS-A' AND partner_id='GS-P1'
   AND seen_last_message_at='2026-11-12T06:00:00Z'::timestamptz AND updated_at IS NOT NULL) THEN RAISE EXCEPTION 'first write row differs'; END IF;
 IF pg_temp.gs_since()<>'pwa_group_chat_seen:GS-A' THEN RAISE EXCEPTION 'first write change log: %',pg_temp.gs_since(); END IF;

 -- C. Forward move: the row follows (one more change-log row).
 got:=public.pwa_mark_group_chat_seen_v1(one,'GS-A','2026-11-12T07:00:00Z');
 IF got IS DISTINCT FROM '{"kind":"stored","seenAt":"2026-11-12T07:00:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'forward result %',got; END IF;
 IF pg_temp.gs_since()<>'pwa_group_chat_seen:GS-A pwa_group_chat_seen:GS-A' THEN RAISE EXCEPTION 'forward change log: %',pg_temp.gs_since(); END IF;

 -- D. Equal and older values: unchanged, the row (xmin, updated_at) and the change log untouched.
 SELECT updated_at,xmin INTO stamp,version FROM public.pwa_group_chat_seen WHERE borrower_id='GS-A' AND partner_id='GS-P1';
 FOR message IN SELECT * FROM unnest(ARRAY['2026-11-12T07:00:00Z','2026-11-12T06:59:59.999Z','2026-11-01T00:00:00Z','2026-11-12T14:00:00+07:00']) LOOP
  got:=public.pwa_mark_group_chat_seen_v1(one,'GS-A',message::timestamptz);
  IF got IS DISTINCT FROM '{"kind":"unchanged","seenAt":"2026-11-12T07:00:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'unchanged result for % is %',message,got; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_seen WHERE borrower_id='GS-A' AND partner_id='GS-P1' AND updated_at=stamp AND xmin=version) THEN RAISE EXCEPTION 'an equal or older value touched the row'; END IF;
 IF pg_temp.gs_since()<>'pwa_group_chat_seen:GS-A pwa_group_chat_seen:GS-A' THEN RAISE EXCEPTION 'an equal or older value wrote the change log: %',pg_temp.gs_since(); END IF;

 -- E. Clamp: a value beyond the summary's last message is stored as the summary's; then the same again is unchanged.
 got:=public.pwa_mark_group_chat_seen_v1(one,'GS-A','2027-01-01T00:00:00Z');
 IF got IS DISTINCT FROM '{"kind":"stored","seenAt":"2026-11-12T07:05:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'clamp result %',got; END IF;
 got:=public.pwa_mark_group_chat_seen_v1(one,'GS-A','2099-01-01T00:00:00Z');
 IF got->>'kind'<>'unchanged' THEN RAISE EXCEPTION 'clamped repeat result %',got; END IF;

 -- F. Another user: own row only; the first user's row is left exactly as it was. The email mapping ignores case and
 -- padding on the Partner side (the actor's email is already lower case and trimmed).
 SELECT updated_at,xmin INTO stamp,version FROM public.pwa_group_chat_seen WHERE borrower_id='GS-A' AND partner_id='GS-P1';
 got:=public.pwa_mark_group_chat_seen_v1(two,'GS-A','2026-11-12T06:30:00Z');
 IF got IS DISTINCT FROM '{"kind":"stored","seenAt":"2026-11-12T06:30:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'second user result %',got; END IF;
 got:=public.pwa_mark_group_chat_seen_v1(two,'GS-B','2026-11-12T07:05:00Z');
 IF (SELECT string_agg(borrower_id||'/'||partner_id||'/'||to_char(seen_last_message_at AT TIME ZONE 'UTC','HH24:MI'),' ' ORDER BY borrower_id,partner_id) FROM public.pwa_group_chat_seen)
   <>'GS-A/GS-P1/07:05 GS-A/GS-P2/06:30 GS-B/GS-P2/07:05' THEN RAISE EXCEPTION 'rows per user differ'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_seen WHERE borrower_id='GS-A' AND partner_id='GS-P1' AND updated_at=stamp AND xmin=version) THEN RAISE EXCEPTION 'another user''s write touched the first user''s row'; END IF;

 -- G. No summary: ignored, nothing written. Unknown borrower: P0002 unknown_borrower.
 UPDATE gs_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
 got:=public.pwa_mark_group_chat_seen_v1(one,'GS-N','2026-11-12T07:05:00Z');
 IF got IS DISTINCT FROM '{"kind":"ignored","seenAt":null}'::jsonb OR EXISTS(SELECT 1 FROM public.pwa_group_chat_seen WHERE borrower_id='GS-N') THEN RAISE EXCEPTION 'ignored result %',got; END IF;
 BEGIN PERFORM public.pwa_mark_group_chat_seen_v1(one,'GS-MISSING','2026-11-12T07:05:00Z'); RAISE EXCEPTION 'unknown borrower accepted';
 EXCEPTION WHEN no_data_found THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF code<>'P0002' OR message<>'unknown_borrower' THEN RAISE EXCEPTION 'unknown borrower signalled % %',code,message; END IF; END;

 -- H. Actor: the login email must map to exactly the named Partner; any other shape is refused. 42501, nothing written.
 FOR bad IN SELECT * FROM (VALUES
   (pg_temp.gs_actor('GS-P2','gs-one@example.invalid')),          -- another user's partner id
   (pg_temp.gs_actor('GS-P1','gs-two@example.invalid')),          -- another user's email
   (pg_temp.gs_actor('GS-P1','GS-One@example.invalid')),          -- not lower case
   (pg_temp.gs_actor('GS-P1','unknown@example.invalid')),         -- no Partner
   (pg_temp.gs_actor('GS-P3','gs-one@example.invalid')),          -- a Partner without a login email
   (pg_temp.gs_actor('GS-MISSING','gs-one@example.invalid')),
   (one-'subject'),(one||'{"extra":"x"}'),(jsonb_set(one,'{partnerId}','1')),(jsonb_set(one,'{partnerId}','""')),('[]'::jsonb),('"text"'::jsonb),('null'::jsonb),(NULL::jsonb)) v(a) LOOP
  BEGIN PERFORM public.pwa_mark_group_chat_seen_v1(bad,'GS-B','2026-11-12T07:05:00Z'); RAISE EXCEPTION 'actor accepted: %',bad;
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; IF message<>'access_denied' THEN RAISE EXCEPTION 'actor refusal signalled %',message; END IF; END;
 END LOOP;
 -- Invalid arguments: 22023 invalid_request.
 BEGIN PERFORM public.pwa_mark_group_chat_seen_v1(one,NULL,'2026-11-12T07:05:00Z'); RAISE EXCEPTION 'null borrower accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.pwa_mark_group_chat_seen_v1(one,'','2026-11-12T07:05:00Z'); RAISE EXCEPTION 'empty borrower accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.pwa_mark_group_chat_seen_v1(one,'GS-B',NULL); RAISE EXCEPTION 'null time accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.pwa_mark_group_chat_seen_v1(one,'GS-B','infinity'); RAISE EXCEPTION 'infinite time accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF pg_temp.gs_since()<>'' OR (SELECT count(*) FROM public.pwa_group_chat_seen)<>3 THEN RAISE EXCEPTION 'a refused or ignored call wrote something: %',pg_temp.gs_since(); END IF;

 -- I. A newer summary: the old seen value stays behind it (the mark relights on the device), and can move up to it.
 UPDATE public.pwa_group_chat_summaries SET last_message_at='2026-11-12T09:00:00Z',generated_at='2026-11-12T09:20:00Z' WHERE borrower_id='GS-A';
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_seen t JOIN public.pwa_group_chat_summaries s USING(borrower_id) WHERE t.borrower_id='GS-A' AND t.partner_id='GS-P1' AND t.seen_last_message_at<s.last_message_at) THEN
  RAISE EXCEPTION 'a newer summary must be ahead of the seen value'; END IF;
 got:=public.pwa_mark_group_chat_seen_v1(one,'GS-A','2026-11-12T09:00:00Z');
 IF got IS DISTINCT FROM '{"kind":"stored","seenAt":"2026-11-12T09:00:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'newer summary result %',got; END IF;

 -- J. The table's own protections against a direct write by the application role.
 BEGIN INSERT INTO public.pwa_group_chat_seen(borrower_id,partner_id,seen_last_message_at) VALUES('GS-MISSING','GS-P1',now()); RAISE EXCEPTION 'seen row for a missing borrower stored'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN INSERT INTO public.pwa_group_chat_seen(borrower_id,partner_id,seen_last_message_at) VALUES('GS-B','GS-MISSING',now()); RAISE EXCEPTION 'seen row for a missing partner stored'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN TRUNCATE public.pwa_group_chat_seen; RAISE EXCEPTION 'application truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- K. The reader login without the operator's column grant cannot read the table or call the function.
SET SESSION AUTHORIZATION "mw-credit-app-read-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 IF has_any_column_privilege('public.pwa_group_chat_seen','SELECT') THEN RAISE EXCEPTION 'reader holds a migration-owned grant'; END IF;
 BEGIN PERFORM public.pwa_mark_group_chat_seen_v1('{}'::jsonb,'GS-A',now()); RAISE EXCEPTION 'reader may record a seen value'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- L. Cascades: a deleted borrower takes every user's row for it; a deleted Partner takes that user's rows. Both are logged
-- under the borrower.
UPDATE gs_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
DELETE FROM "Borrowers" WHERE "Row ID"='GS-A';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pwa_group_chat_seen WHERE borrower_id='GS-A') OR (SELECT count(*) FROM public.pwa_group_chat_seen)<>1 THEN RAISE EXCEPTION 'seen rows survived their borrower'; END IF;
 IF pg_temp.gs_since()<>'pwa_group_chat_seen:GS-A pwa_group_chat_seen:GS-A' THEN RAISE EXCEPTION 'borrower cascade change log: %',pg_temp.gs_since(); END IF;
END $$;
UPDATE gs_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
DELETE FROM "Cash Statement Context" WHERE "Ref Partner"='GS-P2';
DELETE FROM "Partners" WHERE "Row ID"='GS-P2';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pwa_group_chat_seen) THEN RAISE EXCEPTION 'seen rows survived their partner'; END IF;
 IF pg_temp.gs_since()<>'pwa_group_chat_seen:GS-B' THEN RAISE EXCEPTION 'partner cascade change log: %',pg_temp.gs_since(); END IF;
END $$;
SELECT 'Group chat seen regression passed' AS result;
ROLLBACK;
