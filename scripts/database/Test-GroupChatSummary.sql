-- V146 (R146): the group chat summary table and pwa_put_group_chat_summary_v1 under the real roles, at the migration
-- head, in a disposable cluster. One rolled-back transaction; every name and sentence is invented.
-- Covers: migration-owned grants, store, unchanged (row and change log untouched), replace, superseded, shared group,
-- prune with a null summary, a disabled borrower skipped, an unknown borrower refused (nothing written), invalid commands,
-- cascade on borrower delete and the change-log rows.
\set ON_ERROR_STOP on
BEGIN;
-- A. Grants as the migration leaves them (before the operator-policy emulation below).
DO $$ DECLARE r text; BEGIN
 IF NOT has_table_privilege('mw_app_dev','public.pwa_group_chat_summaries','SELECT,INSERT,UPDATE,DELETE')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE NOT has_table_privilege('mw_app_dev','public.pwa_group_chat_summaries',p))
  OR has_table_privilege('mw_app_dev','public.pwa_group_chat_summaries','TRUNCATE')
  OR NOT has_function_privilege('mw_app_dev','public.pwa_put_group_chat_summary_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'mw_app_dev grants on the group chat summary differ'; END IF;
 -- The command login reaches both through its membership; nobody else does.
 IF NOT has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_put_group_chat_summary_v1(text)','EXECUTE')
  OR NOT has_table_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_group_chat_summaries','SELECT') THEN RAISE EXCEPTION 'command login must write group chat summaries'; END IF;
 FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname NOT LIKE 'pg\_%' AND rolname NOT IN ('mw_app_dev','mw_app_dev_journal_owner','mw-credit-app-command-dev@clever-oasis-508610-n7.iam') LOOP
  IF has_function_privilege(r,'public.pwa_put_group_chat_summary_v1(text)','EXECUTE') OR has_any_column_privilege(r,'public.pwa_group_chat_summaries','SELECT')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(r,'public.pwa_group_chat_summaries',p)) THEN
   RAISE EXCEPTION 'unexpected group chat summary access for %',r; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_put_group_chat_summary_v1(text)'::regprocedure AND a.grantee=0)
  OR (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_put_group_chat_summary_v1(text)'::regprocedure) THEN RAISE EXCEPTION 'pwa_put_group_chat_summary_v1 must be invoker rights without PUBLIC execution'; END IF;
END $$;

-- The DEV capability grants the operator policy provides live (app-role-policy.mjs), as Test-RowChanges.sql emulates them.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
INSERT INTO "Borrowers"("Row ID","Borrower Name","AI Collection Enabled") VALUES
 ('GC-A','Synthetic chat A',true),('GC-C','Synthetic chat C',true),('GC-D','Synthetic chat disabled',false),('GC-N','Synthetic chat unset',NULL),('GC-X','Synthetic referrer',true);
CREATE TEMP TABLE gc_mark ON COMMIT DROP AS SELECT coalesce(max(seq),0) AS seq FROM public.pwa_row_changes;
GRANT SELECT,UPDATE ON gc_mark TO PUBLIC;
CREATE FUNCTION pg_temp.gc_since() RETURNS text LANGUAGE sql AS
 $$SELECT coalesce(string_agg(table_name||':'||row_key,' ' ORDER BY seq),'') FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM gc_mark) AND table_name='pwa_group_chat_summaries'$$;
-- One command: group key, subject ids, source digest, last message time and headline; summary NULL when last_at is NULL.
CREATE FUNCTION pg_temp.gc_command(key text, ids text[], sha text, last_at text, headline text, generated text DEFAULT '2026-11-12T07:32:00Z') RETURNS text LANGUAGE sql AS $$
 SELECT jsonb_build_object('command',jsonb_build_object('schemaVersion',1,'requestId','3f0c1a52-7d4e-4b61-9a2f-0e5d6c7b8a90','environment','dev','conversationKey',key,
  'borrowerIds',to_jsonb(ids),'sourceSha256',sha,'summary',CASE WHEN last_at IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(
   'windowFrom','2026-11-09T07:32:00Z','lastMessageAt',last_at,'generatedAt',generated,'messageCount',12,'model','claude-opus-5-5',
   'lastSpeaker',jsonb_build_object('role','borrower','borrowerId',coalesce(ids[1],'GC-A')),
   'headline',jsonb_build_object('th','ผู้กู้ขอเลื่อนจ่ายเป็นวันศุกร์ '||headline,'en','Borrower asks to pay on Friday '||headline),
   'points',jsonb_build_array(
    jsonb_build_object('speaker',jsonb_build_object('role','borrower','borrowerId',coalesce(ids[1],'GC-A')),'th','เงินเดือนออกช้า จะโอนวันศุกร์','en','Salary is late, will transfer on Friday.'),
    jsonb_build_object('speaker',jsonb_build_object('role','partner'),'th','ตกลง','en','Agreed.'),
    jsonb_build_object('speaker',jsonb_build_object('role','referrer','borrowerId','GC-X'),'th','จะไปตามเอง','en','Will follow up in person.'))) END))::text $$;
GRANT EXECUTE ON FUNCTION pg_temp.gc_since(),pg_temp.gc_command(text,text[],text,text,text,text) TO PUBLIC;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE k1 text:=repeat('a',32); k2 text:=repeat('b',32); s1 text:=repeat('1',64); s2 text:=repeat('2',64); s3 text:=repeat('3',64);
 got jsonb; r public.pwa_group_chat_summaries%ROWTYPE; stamp timestamptz; version xid; code text; message text; bad text; base jsonb;
BEGIN
 -- B. Store: one row, every column from the command, one change-log row.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A'],s1,'2026-11-12T07:05:00Z','one'));
 IF got IS DISTINCT FROM '{"kind":"stored","stored":1,"unchanged":0,"superseded":0,"skipped":0,"pruned":0}'::jsonb THEN RAISE EXCEPTION 'store result %',got; END IF;
 SELECT * INTO STRICT r FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A';
 IF r.conversation_key<>k1 OR r.shared_group OR r.headline_en<>'Borrower asks to pay on Friday one' OR r.headline_th<>'ผู้กู้ขอเลื่อนจ่ายเป็นวันศุกร์ one'
  OR jsonb_array_length(r.points)<>3 OR r.points#>>'{0,speaker,borrowerId}'<>'GC-A' OR r.points#>>'{1,speaker,role}'<>'partner' OR r.points#>'{1,speaker}' ? 'borrowerId'
  OR r.last_speaker_role<>'borrower' OR r.last_speaker_borrower_id<>'GC-A' OR r.message_count<>12
  OR r.window_from<>'2026-11-09T07:32:00Z'::timestamptz OR r.last_message_at<>'2026-11-12T07:05:00Z'::timestamptz OR r.generated_at<>'2026-11-12T07:32:00Z'::timestamptz
  OR r.source_sha256<>s1 OR r.model<>'claude-opus-5-5' OR r.request_id<>'3f0c1a52-7d4e-4b61-9a2f-0e5d6c7b8a90'::uuid OR r.updated_at IS NULL THEN RAISE EXCEPTION 'stored row differs: %',to_jsonb(r); END IF;
 IF pg_temp.gc_since()<>'pwa_group_chat_summaries:GC-A' THEN RAISE EXCEPTION 'store change log: %',pg_temp.gc_since(); END IF;

 -- C. Unchanged: the same source digest (even with a later generatedAt and other wording) leaves the row and the log untouched.
 SELECT updated_at,xmin INTO stamp,version FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A';
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A'],s1,'2026-11-12T07:05:00Z','reworded','2026-11-12T08:00:00Z'));
 IF got->>'kind'<>'unchanged' OR (got->>'unchanged')::int<>1 OR (got->>'stored')::int<>0 THEN RAISE EXCEPTION 'unchanged result %',got; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A' AND updated_at=stamp AND xmin=version AND headline_en LIKE '% one' AND generated_at='2026-11-12T07:32:00Z'::timestamptz) THEN
  RAISE EXCEPTION 'an unchanged post touched the row'; END IF;
 IF pg_temp.gc_since()<>'pwa_group_chat_summaries:GC-A' THEN RAISE EXCEPTION 'an unchanged post wrote the change log: %',pg_temp.gc_since(); END IF;

 -- D. A new digest replaces the row (one more change-log row).
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A'],s2,'2026-11-12T09:00:00Z','two'));
 IF got->>'kind'<>'stored' OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A' AND source_sha256=s2 AND headline_en LIKE '% two' AND updated_at>stamp) THEN RAISE EXCEPTION 'replace result %',got; END IF;
 IF pg_temp.gc_since()<>'pwa_group_chat_summaries:GC-A pwa_group_chat_summaries:GC-A' THEN RAISE EXCEPTION 'replace change log: %',pg_temp.gc_since(); END IF;

 -- E. Superseded: another group with an older last message leaves the row (no log row); an equal digest from another
 -- group is not "unchanged"; a newer last message from the other group takes the borrower's page.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k2,ARRAY['GC-A'],s2,'2026-11-12T08:59:59Z','other group'));
 IF got IS DISTINCT FROM '{"kind":"superseded","stored":0,"unchanged":0,"superseded":1,"skipped":0,"pruned":0}'::jsonb
  OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A' AND conversation_key=k1 AND headline_en LIKE '% two') THEN RAISE EXCEPTION 'superseded result %',got; END IF;
 IF pg_temp.gc_since()<>'pwa_group_chat_summaries:GC-A pwa_group_chat_summaries:GC-A' THEN RAISE EXCEPTION 'a superseded post wrote the change log'; END IF;
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k2,ARRAY['GC-A'],s2,'2026-11-12T10:00:00Z','other group'));
 IF got->>'kind'<>'stored' OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A' AND conversation_key=k2 AND headline_en LIKE '% other group') THEN RAISE EXCEPTION 'newer group result %',got; END IF;
 -- The first group, now older, is superseded in turn; back to it with a newer message.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A'],s3,'2026-11-12T09:30:00Z','late'));
 IF got->>'kind'<>'superseded' THEN RAISE EXCEPTION 'older first group result %',got; END IF;

 -- F. Shared group: two subjects carry the same summary; the borrower moves back to this group; counts are per borrower.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A','GC-C'],s3,'2026-11-12T11:00:00Z','shared'));
 IF got IS DISTINCT FROM '{"kind":"stored","stored":2,"unchanged":0,"superseded":0,"skipped":0,"pruned":0}'::jsonb
  OR (SELECT count(*) FROM public.pwa_group_chat_summaries WHERE conversation_key=k1 AND shared_group AND headline_en LIKE '% shared' AND borrower_id IN ('GC-A','GC-C'))<>2 THEN RAISE EXCEPTION 'shared result %',got; END IF;

 -- G. Disabled or unset borrowers are skipped (no row); listed borrowers are never pruned.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k2,ARRAY['GC-D','GC-N'],s1,'2026-11-12T12:00:00Z','disabled'));
 IF got IS DISTINCT FROM '{"kind":"cleared","stored":0,"unchanged":0,"superseded":0,"skipped":2,"pruned":0}'::jsonb
  OR EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id IN ('GC-D','GC-N')) THEN RAISE EXCEPTION 'disabled result %',got; END IF;

 -- H. Unknown borrower: refused with P0002 unknown_borrower and nothing written, the prune included.
 UPDATE gc_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
 BEGIN
  PERFORM public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A','GC-MISSING'],s1,'2026-11-12T13:00:00Z','unknown'));
  RAISE EXCEPTION 'unknown borrower accepted';
 EXCEPTION WHEN no_data_found THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF code<>'P0002' OR message<>'unknown_borrower' THEN RAISE EXCEPTION 'unknown borrower signalled % %',code,message; END IF;
 END;
 BEGIN
  PERFORM public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-MISSING'],s1,NULL,''));
  RAISE EXCEPTION 'unknown borrower accepted by a prune';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 IF (SELECT count(*) FROM public.pwa_group_chat_summaries WHERE conversation_key=k1 AND headline_en LIKE '% shared')<>2 OR pg_temp.gc_since()<>'' THEN RAISE EXCEPTION 'a refused command wrote something'; END IF;

 -- I. Prune with a null summary: the group's rows whose borrower is no longer listed go; the listed row is untouched.
 SELECT updated_at INTO stamp FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-C';
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-C'],s1,NULL,''));
 IF got IS DISTINCT FROM '{"kind":"cleared","stored":0,"unchanged":0,"superseded":0,"skipped":0,"pruned":1}'::jsonb
  OR EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A')
  OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-C' AND updated_at=stamp AND source_sha256=s3) THEN RAISE EXCEPTION 'prune result %',got; END IF;
 IF pg_temp.gc_since()<>'pwa_group_chat_summaries:GC-A' THEN RAISE EXCEPTION 'prune change log: %',pg_temp.gc_since(); END IF;
 -- A prune of one group never removes another group's row; an empty list clears the group; a second prune is a no-op.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k2,ARRAY[]::text[],s1,NULL,''));
 IF (got->>'pruned')::int<>0 OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-C') THEN RAISE EXCEPTION 'a prune crossed groups: %',got; END IF;
 -- A summary with a changed subject list prunes and stores in one command.
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY['GC-A'],s2,'2026-11-12T14:00:00Z','swap'));
 IF got IS DISTINCT FROM '{"kind":"stored","stored":1,"unchanged":0,"superseded":0,"skipped":0,"pruned":1}'::jsonb
  OR (SELECT string_agg(borrower_id,',' ORDER BY borrower_id) FROM public.pwa_group_chat_summaries WHERE conversation_key=k1)<>'GC-A'
  OR (SELECT shared_group FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A') THEN RAISE EXCEPTION 'swap result %',got; END IF;
 got:=public.pwa_put_group_chat_summary_v1(pg_temp.gc_command(k1,ARRAY[]::text[],s2,NULL,''));
 IF got->>'kind'<>'cleared' OR (got->>'pruned')::int<>1 OR EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries) THEN RAISE EXCEPTION 'empty-list prune result %',got; END IF;

 -- J. Invalid commands: 22023 invalid_request, nothing written.
 base:=pg_temp.gc_command(k1,ARRAY['GC-A'],s1,'2026-11-12T07:05:00Z','x')::jsonb;
 FOR bad IN SELECT * FROM (VALUES
   ('not json'),('[]'),('{}'),((base->'command')::text),
   ((base||'{"extra":1}')::text),
   (jsonb_set(base,'{command,extra}','1')::text),
   ((base#-'{command,sourceSha256}')::text),
   (jsonb_set(base,'{command,schemaVersion}','2')::text),
   (jsonb_set(base,'{command,schemaVersion}','"1"')::text),
   (jsonb_set(base,'{command,environment}','"prod"')::text),
   (jsonb_set(base,'{command,requestId}','"3F0C1A52-7D4E-4B61-9A2F-0E5D6C7B8A90"')::text),
   (jsonb_set(base,'{command,conversationKey}',to_jsonb(repeat('a',31)))::text),
   (jsonb_set(base,'{command,conversationKey}',to_jsonb(repeat('A',32)))::text),
   (jsonb_set(base,'{command,sourceSha256}',to_jsonb(repeat('1',63)))::text),
   (jsonb_set(base,'{command,borrowerIds}','["GC-C","GC-A"]')::text),
   (jsonb_set(base,'{command,borrowerIds}','["GC-A","GC-A"]')::text),
   (jsonb_set(base,'{command,borrowerIds}','[""]')::text),
   (jsonb_set(base,'{command,borrowerIds}','[1]')::text),
   (jsonb_set(base,'{command,borrowerIds}','"GC-A"')::text),
   (jsonb_set(base,'{command,borrowerIds}',(SELECT jsonb_agg('GC-'||lpad(i::text,2,'0')) FROM generate_series(1,21) i))::text),
   (jsonb_set(base,'{command,summary}','[]')::text),
   (jsonb_set(base,'{command,summary,extra}','1')::text),
   ((base#-'{command,summary,model}')::text),
   (jsonb_set(base,'{command,summary,windowFrom}','"2026-11-09 07:32:00"')::text),
   (jsonb_set(base,'{command,summary,lastMessageAt}','"2026-13-40T07:05:00Z"')::text),
   (jsonb_set(base,'{command,summary,lastMessageAt}','"2026-11-08T07:05:00Z"')::text),
   (jsonb_set(base,'{command,summary,generatedAt}','1')::text),
   (jsonb_set(base,'{command,summary,messageCount}','0')::text),
   (jsonb_set(base,'{command,summary,messageCount}','101')::text),
   (jsonb_set(base,'{command,summary,messageCount}','1.5')::text),
   (jsonb_set(base,'{command,summary,messageCount}','"12"')::text),
   (jsonb_set(base,'{command,summary,model}','"Claude Opus"')::text),
   (jsonb_set(base,'{command,summary,headline,th}','""')::text),
   (jsonb_set(base,'{command,summary,headline,en}','"   "')::text),
   (jsonb_set(base,'{command,summary,headline,en}',to_jsonb(repeat('x',161)))::text),
   (jsonb_set(base,'{command,summary,headline,en}',to_jsonb(E'two\nlines'::text))::text),
   (jsonb_set(base,'{command,summary,headline,en}','7')::text),
   ((base#-'{command,summary,headline,th}')::text),
   (jsonb_set(base,'{command,summary,headline,fr}','"x"')::text),
   (jsonb_set(base,'{command,summary,points}','{}')::text),
   (jsonb_set(base,'{command,summary,points}',(SELECT jsonb_agg(base#>'{command,summary,points,1}') FROM generate_series(1,5)))::text),
   (jsonb_set(base,'{command,summary,points,0}','"text"')::text),
   (jsonb_set(base,'{command,summary,points,0,en}',to_jsonb(repeat('x',201)))::text),
   (jsonb_set(base,'{command,summary,points,0,th}','null')::text),
   (jsonb_set(base,'{command,summary,points,0,extra}','1')::text),
   ((base#-'{command,summary,points,0,speaker}')::text),
   (jsonb_set(base,'{command,summary,points,0,speaker}','"borrower"')::text),
   (jsonb_set(base,'{command,summary,points,0,speaker,role}','"owner"')::text),
   ((base#-'{command,summary,points,0,speaker,borrowerId}')::text),
   (jsonb_set(base,'{command,summary,points,0,speaker,borrowerId}','""')::text),
   (jsonb_set(base,'{command,summary,points,1,speaker,borrowerId}','"GC-A"')::text),
   (jsonb_set(base,'{command,summary,points,1,speaker,name}','"x"')::text),
   (jsonb_set(base,'{command,summary,lastSpeaker}','{"role":"partner","borrowerId":"GC-A"}')::text),
   (jsonb_set(base,'{command,summary,lastSpeaker}','{"role":"borrower"}')::text),
   (jsonb_set(base,'{command,summary,lastSpeaker}','null')::text)) v(t) LOOP
  BEGIN
   PERFORM public.pwa_put_group_chat_summary_v1(bad);
   RAISE EXCEPTION 'invalid command accepted: %',left(bad,160);
  EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message<>'invalid_request' THEN RAISE EXCEPTION 'invalid command signalled %',message; END IF;
  END;
 END LOOP;
 BEGIN PERFORM public.pwa_put_group_chat_summary_v1(NULL); RAISE EXCEPTION 'null command accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries) THEN RAISE EXCEPTION 'an invalid command wrote a row'; END IF;
 -- Accepted edges: no points, four points, 160 and 200 characters, the business and other roles, fractional seconds.
 got:=public.pwa_put_group_chat_summary_v1(jsonb_set(jsonb_set(jsonb_set(jsonb_set(base,'{command,summary,points}','[]'),'{command,summary,headline,th}',to_jsonb(repeat('ก',160))),
  '{command,summary,lastSpeaker}','{"role":"business"}'),'{command,summary,lastMessageAt}','"2026-11-12T07:05:00.250Z"')::text);
 IF got->>'kind'<>'stored' OR NOT EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A' AND points='[]'::jsonb AND char_length(headline_th)=160
   AND last_speaker_role='business' AND last_speaker_borrower_id IS NULL AND last_message_at='2026-11-12T07:05:00.25Z'::timestamptz) THEN RAISE EXCEPTION 'edge result %',got; END IF;
 got:=public.pwa_put_group_chat_summary_v1(jsonb_set(jsonb_set(jsonb_set(base,'{command,sourceSha256}',to_jsonb(s2)),'{command,summary,points}',
  (SELECT jsonb_agg(jsonb_build_object('speaker',jsonb_build_object('role','other'),'th',repeat('ข',200),'en',repeat('y',200))) FROM generate_series(1,4))),'{command,summary,messageCount}','100')::text);
 IF got->>'kind'<>'stored' OR (SELECT jsonb_array_length(points) FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A')<>4 THEN RAISE EXCEPTION 'four-point result %',got; END IF;

 -- K. The table's own checks hold against a direct write by the application role.
 BEGIN UPDATE public.pwa_group_chat_summaries SET headline_en='' WHERE borrower_id='GC-A'; RAISE EXCEPTION 'empty headline stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.pwa_group_chat_summaries SET last_speaker_role='partner' WHERE borrower_id='GC-A'; RAISE EXCEPTION 'partner speaker with a borrower id stored'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN INSERT INTO public.pwa_group_chat_summaries SELECT (jsonb_populate_record(t,'{"borrower_id":"GC-MISSING"}')).* FROM public.pwa_group_chat_summaries t; RAISE EXCEPTION 'summary for a missing borrower stored';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN TRUNCATE public.pwa_group_chat_summaries; RAISE EXCEPTION 'application truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- L. The reader login without the operator's column grant cannot read the table (the read path answers null then);
-- the write function is closed to it.
SET SESSION AUTHORIZATION "mw-credit-app-read-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 IF has_any_column_privilege('public.pwa_group_chat_summaries','SELECT') THEN RAISE EXCEPTION 'reader holds a migration-owned grant'; END IF;
 BEGIN PERFORM public.pwa_put_group_chat_summary_v1('{}'); RAISE EXCEPTION 'reader may execute the put'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- M. Cascade: deleting the borrower removes the summary and logs the removal.
UPDATE gc_mark SET seq=(SELECT max(seq) FROM public.pwa_row_changes);
DELETE FROM "Borrowers" WHERE "Row ID"='GC-A';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pwa_group_chat_summaries WHERE borrower_id='GC-A') THEN RAISE EXCEPTION 'summary survived its borrower'; END IF;
 IF pg_temp.gc_since()<>'pwa_group_chat_summaries:GC-A' THEN RAISE EXCEPTION 'cascade change log: %',pg_temp.gc_since(); END IF;
END $$;
SELECT 'Group chat summary regression passed' AS result;
ROLLBACK;
