-- R146 Group chat summary (owner authorization of 12 and 13 November 2026 for the table public.pwa_group_chat_summaries,
-- its function, triggers and grants; agreed design section 8). V145 is applied and stays.
-- The integration agent summarises the last three days of a borrower's Instagram group chat and posts the result to the
-- command service (POST /internal/agent/group-chat-summaries), which calls pwa_put_group_chat_summary_v1. Only the summary
-- is stored: one current row per borrower. No chat text, Instagram id or username is stored; nothing financial reads it.
-- Objects:
--  1. Table pwa_group_chat_summaries (owner: the migration runner, postgres): primary key borrower_id, foreign key to
--     "Borrowers" ("Row ID") ON DELETE CASCADE; conversation_key is the hashed group key (32 hex), indexed.
--  2. pwa_put_group_chat_summary_v1(canonical_json text) RETURNS jsonb: invoker rights, owner postgres. Input is the exact
--     request body {"command":{...}} as the endpoint canonicalised it. Result {kind,stored,unchanged,superseded,skipped,
--     pruned}; kind is stored, unchanged, superseded or cleared. A malformed command raises invalid_request (22023, the
--     endpoint's 400); a listed borrower that does not exist raises unknown_borrower (P0002, the endpoint's 422).
--  3. The V97 change-log triggers zzzzzzz_pwa_row_change('borrower_id') and zzzzzzz_pwa_row_truncate, both ENABLE ALWAYS,
--     so the offline dataset sees a stored, replaced or removed summary. An unchanged post touches no row and logs nothing.
--  4. Grants: mw_app_<env> gets SELECT, INSERT, UPDATE, DELETE on the table and EXECUTE on the function (the operator
--     policy's ordinary classification, app-role-policy.mjs). PUBLIC and every other grantee, including PROD's
--     default-privilege grantee mw_integration_agent, are revoked. The reader login (mw-credit-app-read-<env>) is no member
--     of mw_app_<env>: its SELECT is the operator's column grant (scripts/production/reader-capability-contract.json in
--     PROD, scripts/configure-dev-read-role.py in DEV). The chat SQL role gets nothing.
-- Preflight: the application role and the change-log owner exist, no new object exists, and the runner may attach the
-- change-log trigger function. On Cloud SQL the runner is no superuser and pwa_track_row_change() belongs to
-- mw_changes_owner_<env> with no PUBLIC execution, so the migration needs the owner window for that owner
-- (owner-authority-cli.mjs prepare --owner mw_changes_owner_<env>, then restore), as V97 did.
-- Rollback: the agent's switch stops new summaries; the table can stay empty or be dropped by a later migration.

DO $preflight$
DECLARE problems text[]:='{}'; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; r text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 FOREACH r IN ARRAY ARRAY['mw_app_'||suffix,'mw_changes_owner_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN problems:=problems||format('V146 needs the role %s',r); END IF;
 END LOOP;
 IF to_regclass('public.pwa_group_chat_summaries') IS NOT NULL OR to_regprocedure('public.pwa_put_group_chat_summary_v1(text)') IS NOT NULL THEN
  problems:=problems||'V146: a new object already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public."Borrowers"'::regclass AND k.contype='p' AND cardinality(k.conkey)=1
   AND (SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])='Row ID') THEN problems:=problems||'V146: "Borrowers" primary key is not ("Row ID")'::text; END IF;
 IF to_regprocedure('public.pwa_track_row_change()') IS NULL OR to_regprocedure('public.pwa_lock_key_v1(text,text)') IS NULL THEN
  problems:=problems||'V146 needs pwa_track_row_change() (V97) and pwa_lock_key_v1(text,text) (V93)'::text;
 ELSIF NOT has_function_privilege(current_user,'public.pwa_track_row_change()','EXECUTE') THEN
  -- CREATE TRIGGER needs EXECUTE on the trigger function; only its owner holds it (V97).
  problems:=problems||format('%s cannot attach pwa_track_row_change() (owner window required: owner-authority-cli.mjs prepare --owner mw_changes_owner_%s)',current_user,suffix);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND NOT has_schema_privilege(current_user,'public','CREATE') THEN
  problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V146 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- 1. The table: one current summary per borrower.
CREATE TABLE public.pwa_group_chat_summaries (
 borrower_id text PRIMARY KEY REFERENCES public."Borrowers"("Row ID") ON DELETE CASCADE,
 conversation_key text NOT NULL CHECK (conversation_key ~ '^[0-9a-f]{32}$'),
 shared_group boolean NOT NULL,
 headline_th text NOT NULL CHECK (char_length(headline_th) BETWEEN 1 AND 160),
 headline_en text NOT NULL CHECK (char_length(headline_en) BETWEEN 1 AND 160),
 points jsonb NOT NULL CHECK (jsonb_typeof(points)='array' AND jsonb_array_length(points)<=4),
 last_speaker_role text NOT NULL CHECK (last_speaker_role IN ('borrower','partner','referrer','business','other')),
 last_speaker_borrower_id text CHECK ((last_speaker_borrower_id IS NOT NULL)=(last_speaker_role IN ('borrower','referrer'))),
 message_count integer NOT NULL CHECK (message_count BETWEEN 1 AND 100),
 window_from timestamptz NOT NULL,
 last_message_at timestamptz NOT NULL,
 generated_at timestamptz NOT NULL,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
 model text NOT NULL CHECK (model ~ '^[a-z0-9][a-z0-9.-]{0,63}$'),
 request_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX pwa_group_chat_summaries_conversation ON public.pwa_group_chat_summaries(conversation_key);
COMMENT ON TABLE public.pwa_group_chat_summaries IS 'R146: the current summary of a borrower''s Instagram group chat (last three days), one row per borrower. Written only by pwa_put_group_chat_summary_v1 from the integration agent''s command; display only: no charge, status, payment or notification reads it. Holds no chat text, Instagram id or username.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.borrower_id IS 'R146: the subject borrower (an AI-collection borrower of the group who is not its referrer); the row goes with the borrower.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.conversation_key IS 'R146: the hashed group key (SHA-256 of the Instagram conversation id, first 32 hex); never the Instagram id.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.shared_group IS 'R146: true when the group had two or more subject borrowers, who all carry the same summary.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.headline_th IS 'R146: one headline sentence in Thai, 1 to 160 characters, plain text.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.headline_en IS 'R146: the same headline in English, 1 to 160 characters, plain text.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.points IS 'R146: 0 to 4 items {speaker:{role,borrowerId?},th,en}; role is borrower, partner, referrer, business or other; th and en 1 to 200 characters; shape-checked by pwa_put_group_chat_summary_v1.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.last_speaker_role IS 'R146: who sent the newest substantive message (borrower, partner, referrer, business, other), computed by the agent, not by the model.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.last_speaker_borrower_id IS 'R146: that speaker''s borrower id when the role is borrower or referrer, otherwise null (no foreign key: a label, not a link).';
COMMENT ON COLUMN public.pwa_group_chat_summaries.message_count IS 'R146: messages in the summarised window, 1 to 100, routine ones included.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.window_from IS 'R146: start of the summarised window (three days before the run).';
COMMENT ON COLUMN public.pwa_group_chat_summaries.last_message_at IS 'R146: time of the newest substantive message; the app decides freshness and the list mark from it.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.generated_at IS 'R146: when the agent generated the summary.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.source_sha256 IS 'R146: digest of the summarised input (ordered sender, time and kind tuples, subject ids, prompt version, model); an equal digest leaves the row untouched.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.model IS 'R146: the model id that wrote the summary.';
COMMENT ON COLUMN public.pwa_group_chat_summaries.request_id IS 'R146: the agent command''s derived request id (provenance; a shared group stores it on each subject).';
COMMENT ON COLUMN public.pwa_group_chat_summaries.updated_at IS 'R146: when this row was last stored.';

-- 2. The write path. Invoker rights: the caller (mw_app_<env> through the command service) holds the table DML itself.
-- One advisory lock serialises every put, so the cross-group "superseded" rule reads a settled row.
CREATE FUNCTION public.pwa_put_group_chat_summary_v1(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE
 root jsonb; c jsonb; s jsonb; speaker jsonb; ids text[]; key text; sha text; request uuid;
 w_from timestamptz; last_at timestamptz; made_at timestamptz; n_messages integer; last_role text; last_borrower text;
 stamp text:='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$';
 control text:='[\u0001-\u001F\u007F]';
 roles text[]:=ARRAY['borrower','partner','referrer','business','other'];
 existing public.pwa_group_chat_summaries%ROWTYPE; id text; enabled boolean;
 n_stored integer:=0; n_unchanged integer:=0; n_superseded integer:=0; n_skipped integer:=0; n_pruned integer:=0; many boolean;
BEGIN
 -- Shape. Every rule is a positive condition that must be true (a NULL fails); a failure raises invalid_request (22023).
 BEGIN
  root:=canonical_json::jsonb;
  IF (jsonb_typeof(root)='object' AND ARRAY(SELECT jsonb_object_keys(root))=ARRAY['command'] AND jsonb_typeof(root->'command')='object') IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  c:=root->'command';
  IF (ARRAY(SELECT k FROM jsonb_object_keys(c) k ORDER BY k COLLATE "C")=ARRAY['borrowerIds','conversationKey','environment','requestId','schemaVersion','sourceSha256','summary']
    AND jsonb_typeof(c->'schemaVersion')='number' AND c->>'schemaVersion'='1'
    AND jsonb_typeof(c->'requestId')='string' AND c->>'requestId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND jsonb_typeof(c->'environment')='string' AND c->>'environment'=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END
    AND jsonb_typeof(c->'conversationKey')='string' AND c->>'conversationKey' ~ '^[0-9a-f]{32}$'
    AND jsonb_typeof(c->'sourceSha256')='string' AND c->>'sourceSha256' ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof(c->'borrowerIds')='array' AND jsonb_array_length(c->'borrowerIds')<=20
    AND jsonb_typeof(c->'summary') IN ('object','null')) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  request:=(c->>'requestId')::uuid; key:=c->>'conversationKey'; sha:=c->>'sourceSha256';
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'borrowerIds') e
    WHERE (jsonb_typeof(e)='string' AND char_length(e#>>'{}') BETWEEN 1 AND 256 AND e#>>'{}' !~ control) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  ids:=ARRAY(SELECT e#>>'{}' FROM jsonb_array_elements(c->'borrowerIds') WITH ORDINALITY x(e,o) ORDER BY o);
  -- Sorted and unique, by code point.
  IF ids<>ARRAY(SELECT d.v FROM (SELECT DISTINCT v FROM unnest(ids) v) d ORDER BY d.v COLLATE "C") THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  s:=c->'summary';
  IF jsonb_typeof(s)='object' THEN
   IF (ARRAY(SELECT k FROM jsonb_object_keys(s) k ORDER BY k COLLATE "C")=ARRAY['generatedAt','headline','lastMessageAt','lastSpeaker','messageCount','model','points','windowFrom']
     AND jsonb_typeof(s->'windowFrom')='string' AND s->>'windowFrom' ~ stamp
     AND jsonb_typeof(s->'lastMessageAt')='string' AND s->>'lastMessageAt' ~ stamp
     AND jsonb_typeof(s->'generatedAt')='string' AND s->>'generatedAt' ~ stamp
     AND jsonb_typeof(s->'messageCount')='number' AND s->>'messageCount' ~ '^[1-9][0-9]{0,2}$' AND (s->>'messageCount')::integer<=100
     AND jsonb_typeof(s->'model')='string' AND s->>'model' ~ '^[a-z0-9][a-z0-9.-]{0,63}$'
     AND jsonb_typeof(s->'headline')='object' AND ARRAY(SELECT k FROM jsonb_object_keys(s->'headline') k ORDER BY k COLLATE "C")=ARRAY['en','th']
     AND jsonb_typeof(s->'lastSpeaker')='object'
     AND jsonb_typeof(s->'points')='array' AND jsonb_array_length(s->'points')<=4) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   w_from:=(s->>'windowFrom')::timestamptz; last_at:=(s->>'lastMessageAt')::timestamptz; made_at:=(s->>'generatedAt')::timestamptz;
   IF (last_at>=w_from) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   n_messages:=(s->>'messageCount')::integer;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'points') e
     WHERE (jsonb_typeof(e)='object' AND ARRAY(SELECT k FROM jsonb_object_keys(e) k ORDER BY k COLLATE "C")=ARRAY['en','speaker','th']) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   -- Every text is a string of 1 to 160 (headline) or 200 (point) characters, not blank, with no control character.
   IF EXISTS(SELECT 1 FROM (SELECT s#>'{headline,th}',160 UNION ALL SELECT s#>'{headline,en}',160
      UNION ALL SELECT e->'th',200 FROM jsonb_array_elements(s->'points') e UNION ALL SELECT e->'en',200 FROM jsonb_array_elements(s->'points') e) v(t,most)
     WHERE (jsonb_typeof(v.t)='string' AND char_length(v.t#>>'{}') BETWEEN 1 AND v.most AND btrim(v.t#>>'{}')<>'' AND v.t#>>'{}' !~ control) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   -- Every speaker (each point's and lastSpeaker): a known role; borrowerId with borrower and referrer, and only with them.
   FOR speaker IN SELECT e->'speaker' FROM jsonb_array_elements(s->'points') e UNION ALL SELECT s->'lastSpeaker' LOOP
    IF (jsonb_typeof(speaker)='object' AND jsonb_typeof(speaker->'role')='string' AND speaker->>'role'=ANY(roles)
      AND CASE WHEN speaker->>'role' IN ('borrower','referrer')
       THEN ARRAY(SELECT k FROM jsonb_object_keys(speaker) k ORDER BY k COLLATE "C")=ARRAY['borrowerId','role'] AND jsonb_typeof(speaker->'borrowerId')='string'
        AND char_length(speaker->>'borrowerId') BETWEEN 1 AND 256 AND speaker->>'borrowerId' !~ control
       ELSE ARRAY(SELECT jsonb_object_keys(speaker))=ARRAY['role'] END) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   END LOOP;
   last_role:=s#>>'{lastSpeaker,role}'; last_borrower:=s#>>'{lastSpeaker,borrowerId}';
  END IF;
 EXCEPTION WHEN data_exception THEN
  -- Class 22 only: malformed JSON, a bad timestamp or number, and the rules above. Any other error is a real one and propagates.
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
 END;

 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('group-chat-summary','*'));
 -- Every listed borrower must exist (the endpoint answers 422); nothing is written before this check.
 IF EXISTS(SELECT 1 FROM unnest(ids) v WHERE NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=v)) THEN
  RAISE EXCEPTION 'unknown_borrower' USING ERRCODE='P0002';
 END IF;
 -- Prune: rows of this group whose borrower is no longer one of its subjects.
 DELETE FROM public.pwa_group_chat_summaries t WHERE t.conversation_key=key AND NOT (t.borrower_id=ANY(ids));
 GET DIAGNOSTICS n_pruned=ROW_COUNT;
 IF jsonb_typeof(s)='object' THEN
  many:=cardinality(ids)>=2;
  FOREACH id IN ARRAY ids LOOP
   SELECT b."AI Collection Enabled" IS TRUE INTO enabled FROM public."Borrowers" b WHERE b."Row ID"=id;
   IF enabled IS NOT TRUE THEN n_skipped:=n_skipped+1; CONTINUE; END IF;
   SELECT * INTO existing FROM public.pwa_group_chat_summaries t WHERE t.borrower_id=id FOR UPDATE;
   IF FOUND AND existing.conversation_key<>key AND existing.last_message_at>last_at THEN n_superseded:=n_superseded+1; CONTINUE; END IF;
   IF FOUND AND existing.conversation_key=key AND existing.source_sha256=sha THEN n_unchanged:=n_unchanged+1; CONTINUE; END IF;
   INSERT INTO public.pwa_group_chat_summaries AS t(borrower_id,conversation_key,shared_group,headline_th,headline_en,points,last_speaker_role,
     last_speaker_borrower_id,message_count,window_from,last_message_at,generated_at,source_sha256,model,request_id,updated_at)
    VALUES(id,key,many,s#>>'{headline,th}',s#>>'{headline,en}',s->'points',last_role,last_borrower,n_messages,w_from,last_at,made_at,sha,s->>'model',request,clock_timestamp())
    ON CONFLICT (borrower_id) DO UPDATE SET conversation_key=EXCLUDED.conversation_key,shared_group=EXCLUDED.shared_group,headline_th=EXCLUDED.headline_th,
     headline_en=EXCLUDED.headline_en,points=EXCLUDED.points,last_speaker_role=EXCLUDED.last_speaker_role,last_speaker_borrower_id=EXCLUDED.last_speaker_borrower_id,
     message_count=EXCLUDED.message_count,window_from=EXCLUDED.window_from,last_message_at=EXCLUDED.last_message_at,generated_at=EXCLUDED.generated_at,
     source_sha256=EXCLUDED.source_sha256,model=EXCLUDED.model,request_id=EXCLUDED.request_id,updated_at=EXCLUDED.updated_at;
   n_stored:=n_stored+1;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('kind',CASE WHEN n_stored>0 THEN 'stored' WHEN n_unchanged>0 THEN 'unchanged' WHEN n_superseded>0 THEN 'superseded' ELSE 'cleared' END,
  'stored',n_stored,'unchanged',n_unchanged,'superseded',n_superseded,'skipped',n_skipped,'pruned',n_pruned);
END $function$;
COMMENT ON FUNCTION public.pwa_put_group_chat_summary_v1(text) IS 'R146: stores the integration agent''s group chat summary command {"command":{schemaVersion,requestId,environment,conversationKey,borrowerIds,sourceSha256,summary}}. Removes this group''s rows whose borrower is not listed; with a null summary stops there. For each listed AI-collection borrower: keeps a row of another group with a newer last message (superseded), leaves a row with the same source digest untouched (unchanged), otherwise upserts (stored). Raises invalid_request (22023) or unknown_borrower (P0002). Invoker rights.';

-- 3. Change log (V97): the offline dataset sees every stored, replaced or removed summary.
CREATE TRIGGER zzzzzzz_pwa_row_change AFTER INSERT OR UPDATE OR DELETE ON public.pwa_group_chat_summaries FOR EACH ROW EXECUTE FUNCTION public.pwa_track_row_change('borrower_id');
CREATE TRIGGER zzzzzzz_pwa_row_truncate AFTER TRUNCATE ON public.pwa_group_chat_summaries FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_track_row_change('borrower_id');
ALTER TABLE public.pwa_group_chat_summaries ENABLE ALWAYS TRIGGER zzzzzzz_pwa_row_change;
ALTER TABLE public.pwa_group_chat_summaries ENABLE ALWAYS TRIGGER zzzzzzz_pwa_row_truncate;

-- 4. Grants. PROD's default privileges may add grantees to an object postgres creates (mw_integration_agent, R085): every
-- grantee other than the owner is removed before the application role's own grants.
DO $grants$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END; grantee text;
BEGIN
 REVOKE ALL ON TABLE public.pwa_group_chat_summaries FROM PUBLIC;
 REVOKE ALL ON FUNCTION public.pwa_put_group_chat_summary_v1(text) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_group_chat_summaries'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.pwa_group_chat_summaries FROM %I',grantee);
 END LOOP;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_put_group_chat_summary_v1(text)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_put_group_chat_summary_v1(text) FROM %I',grantee);
 END LOOP;
 IF to_regrole('mw_integration_agent') IS NOT NULL THEN
  REVOKE ALL ON TABLE public.pwa_group_chat_summaries FROM mw_integration_agent;
  REVOKE ALL ON FUNCTION public.pwa_put_group_chat_summary_v1(text) FROM mw_integration_agent;
 END IF;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.pwa_group_chat_summaries TO %I',app);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_put_group_chat_summary_v1(text) TO %I',app);
END $grants$;

-- Self-check: ownership, invoker rights, exact ACLs, both ALWAYS triggers and the change-log trigger firing last.
DO $selfcheck$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END; got text[];
BEGIN
 IF (SELECT c.relowner FROM pg_class c WHERE c.oid='public.pwa_group_chat_summaries'::regclass)
   IS DISTINCT FROM (SELECT p.proowner FROM pg_proc p WHERE p.oid='public.pwa_put_group_chat_summary_v1(text)'::regprocedure)
  OR (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid='public.pwa_group_chat_summaries'::regclass)<>current_user THEN
  RAISE EXCEPTION 'V146: the table and the function must be owned by the migration runner'; END IF;
 IF (SELECT p.prosecdef OR p.provolatile<>'v' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] FROM pg_proc p WHERE p.oid='public.pwa_put_group_chat_summary_v1(text)'::regprocedure) THEN
  RAISE EXCEPTION 'V146: pwa_put_group_chat_summary_v1 must be a volatile invoker-rights function with a pinned search_path'; END IF;
 SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type ORDER BY a.privilege_type COLLATE "C") INTO got
  FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.pwa_group_chat_summaries'::regclass AND a.grantee<>c.relowner;
 IF got IS DISTINCT FROM ARRAY[app||':DELETE',app||':INSERT',app||':SELECT',app||':UPDATE'] THEN RAISE EXCEPTION 'V146: table grants are %',got; END IF;
 SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) INTO got
  FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_put_group_chat_summary_v1(text)'::regprocedure AND a.grantee<>p.proowner;
 IF got IS DISTINCT FROM ARRAY[app||':EXECUTE'] THEN RAISE EXCEPTION 'V146: function grants are %',got; END IF;
 IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.pwa_group_chat_summaries'::regclass AND NOT t.tgisinternal AND t.tgenabled='A'
   AND t.tgfoid='public.pwa_track_row_change()'::regprocedure AND t.tgnargs=1 AND t.tgargs=decode('626f72726f7765725f696400','hex')
   AND ((t.tgname='zzzzzzz_pwa_row_change' AND t.tgtype=29) OR (t.tgname='zzzzzzz_pwa_row_truncate' AND t.tgtype=32)))<>2
  OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.pwa_group_chat_summaries'::regclass AND NOT t.tgisinternal)<>2 THEN
  RAISE EXCEPTION 'V146: the change-log triggers on pwa_group_chat_summaries differ'; END IF;
END $selfcheck$;
