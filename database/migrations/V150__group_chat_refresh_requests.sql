-- R165 Group chat summary refresh (owner decision and authorization of 16 November 2026 for the table
-- public.pwa_group_chat_refresh_requests, its two functions, triggers and grants; Archie's design, orchestrator-accepted).
-- V149 is applied and stays.
-- A signed-in user taps Refresh on a borrower's group chat summary card: the command service records one open request per
-- borrower (POST /api/collection/{borrowerId}/chat-refresh); the integration agent reads the open requests
-- (GET /internal/agent/group-chat-refreshes), runs that borrower's group at once and posts the outcome
-- (POST /internal/agent/group-chat-refreshes). The PWA shows the request's state from the collection detail. A display
-- hint: no chat text is stored, and nothing financial, no notification and no other agent action reads it.
-- Objects:
--  1. Table pwa_group_chat_refresh_requests (owner: the migration runner, postgres): primary key borrower_id (one current
--     request per borrower), foreign keys to "Borrowers" ("Row ID") and "Partners" ("Row ID"), both ON DELETE CASCADE;
--     request_id unique; outcome stored, unchanged, cleared, no_group or failed; completed_at and outcome set together.
--  2. pwa_request_group_chat_refresh_v1(actor jsonb, p_borrower_id text) RETURNS jsonb: invoker rights, owner postgres.
--     The actor's login email must map to exactly its Partner (42501 otherwise, as V147). A missing borrower raises
--     unknown_borrower (P0002). Under a per-borrower advisory lock: an open request younger than 10 minutes answers
--     pending with its request id (a repeat tap is harmless); a request completed less than 60 seconds ago answers recent;
--     otherwise (none, completed earlier, or open for 10 minutes or more) a new request replaces the row: accepted.
--     Result {kind, requestId, requestedAt, completedAt, outcome}.
--  3. pwa_complete_group_chat_refresh_v1(canonical_json text) RETURNS jsonb: invoker rights, owner postgres. Input is the
--     agent's request body {"command":{schemaVersion,environment,requestId,outcome}} as the endpoint canonicalised it.
--     The open request with that id is completed (completed); a request already completed is left as it is (replayed); an
--     id no row carries (replaced by a newer request, or the borrower is gone) changes nothing (unknown_request). A
--     malformed command or an outcome outside the five raises invalid_request (22023).
--  4. The V97 change-log triggers zzzzzzz_pwa_row_change('borrower_id') and zzzzzzz_pwa_row_truncate, ENABLE ALWAYS, so
--     every device's offline dataset sees a request start and complete under its borrower.
--  5. Grants: mw_app_<env> gets SELECT, INSERT, UPDATE, DELETE on the table and EXECUTE on both functions. PUBLIC and
--     every other grantee, including PROD's default-privilege grantee mw_integration_agent, are revoked (the agent reaches
--     the table only through the command service). V150 grants the reader login nothing: its SELECT on borrower_id,
--     requested_at, completed_at and outcome is the operator's column grant (reader-capability-contract.json,
--     configure-dev-read-role.py); request_id and requested_by are never read on the reader path.
-- Preflight: as V147. On Cloud SQL the runner needs the owner window for mw_changes_owner_<env> to attach
-- pwa_track_row_change() (owner-authority-cli.mjs prepare, then restore).
-- Rollback: the agent's refresh switch stops completions and the PWA hides the button when the command answers 503; the
-- table can stay or be dropped by a later migration.

DO $preflight$
DECLARE problems text[]:='{}'; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; r text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 FOREACH r IN ARRAY ARRAY['mw_app_'||suffix,'mw_changes_owner_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN problems:=problems||format('V150 needs the role %s',r); END IF;
 END LOOP;
 IF to_regclass('public.pwa_group_chat_refresh_requests') IS NOT NULL
   OR to_regprocedure('public.pwa_request_group_chat_refresh_v1(jsonb,text)') IS NOT NULL
   OR to_regprocedure('public.pwa_complete_group_chat_refresh_v1(text)') IS NOT NULL THEN
  problems:=problems||'V150: a new object already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public."Borrowers"'::regclass AND k.contype='p' AND cardinality(k.conkey)=1
   AND (SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])='Row ID') THEN problems:=problems||'V150: "Borrowers" primary key is not ("Row ID")'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public."Partners"'::regclass AND k.contype='p' AND cardinality(k.conkey)=1
   AND (SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])='Row ID') THEN problems:=problems||'V150: "Partners" primary key is not ("Row ID")'::text; END IF;
 IF to_regclass('public.pwa_group_chat_summaries') IS NULL THEN problems:=problems||'V150 needs pwa_group_chat_summaries (V146)'::text; END IF;
 IF to_regprocedure('public.pwa_track_row_change()') IS NULL OR to_regprocedure('public.pwa_lock_key_v1(text,text)') IS NULL THEN
  problems:=problems||'V150 needs pwa_track_row_change() (V97) and pwa_lock_key_v1(text,text) (V93)'::text;
 ELSIF NOT has_function_privilege(current_user,'public.pwa_track_row_change()','EXECUTE') THEN
  -- CREATE TRIGGER needs EXECUTE on the trigger function; only its owner holds it (V97).
  problems:=problems||format('%s cannot attach pwa_track_row_change() (owner window required: owner-authority-cli.mjs prepare --owner mw_changes_owner_%s)',current_user,suffix);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND NOT has_schema_privilege(current_user,'public','CREATE') THEN
  problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V150 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- 1. The table: the current refresh request of each borrower.
CREATE TABLE public.pwa_group_chat_refresh_requests (
 borrower_id text PRIMARY KEY REFERENCES public."Borrowers"("Row ID") ON DELETE CASCADE,
 request_id uuid NOT NULL UNIQUE,
 requested_by text NOT NULL REFERENCES public."Partners"("Row ID") ON DELETE CASCADE,
 requested_at timestamptz NOT NULL,
 completed_at timestamptz,
 outcome text CHECK (outcome IN ('stored','unchanged','cleared','no_group','failed')),
 CONSTRAINT pwa_group_chat_refresh_completed CHECK ((completed_at IS NULL)=(outcome IS NULL)),
 CONSTRAINT pwa_group_chat_refresh_order CHECK (completed_at IS NULL OR completed_at>=requested_at)
);
CREATE INDEX pwa_group_chat_refresh_requests_requested_by ON public.pwa_group_chat_refresh_requests(requested_by);
COMMENT ON TABLE public.pwa_group_chat_refresh_requests IS 'R165: the current group chat summary refresh request of each borrower: a user asked for the summary to be refreshed now, the integration agent completes it with an outcome. Written only by pwa_request_group_chat_refresh_v1 and pwa_complete_group_chat_refresh_v1. Display hint: nothing financial reads it; holds no chat text.';
COMMENT ON COLUMN public.pwa_group_chat_refresh_requests.borrower_id IS 'R165: the borrower whose summary is to be refreshed; one current request per borrower; the row goes with the borrower.';
COMMENT ON COLUMN public.pwa_group_chat_refresh_requests.request_id IS 'R165: the request id the agent completes; a new request (none open, the last completed 60 seconds or more ago, or open for 10 minutes or more) gets a new one.';
COMMENT ON COLUMN public.pwa_group_chat_refresh_requests.requested_by IS 'R165: the user (Partner row of the signed-in login) who asked for the request; the row goes with the Partner.';
COMMENT ON COLUMN public.pwa_group_chat_refresh_requests.requested_at IS 'R165: when the request was recorded; the agent takes open requests younger than 10 minutes.';
COMMENT ON COLUMN public.pwa_group_chat_refresh_requests.completed_at IS 'R165: when the agent reported the outcome; null while the request is open.';
COMMENT ON COLUMN public.pwa_group_chat_refresh_requests.outcome IS 'R165: stored (a new summary), unchanged (no new messages), cleared (the summary was removed), no_group (no group known for the borrower) or failed; null while open.';

-- 2. The request path (command service, signed-in user). Invoker rights: mw_app_<env> holds the table DML itself.
CREATE FUNCTION public.pwa_request_group_chat_refresh_v1(actor jsonb, p_borrower_id text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE matches integer; partner text; existing public.pwa_group_chat_refresh_requests%ROWTYPE; now_at timestamptz; kind text;
 iso text:='YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
BEGIN
 -- The actor: exactly {issuer, loginEmail, partnerId, subject}, and the login email maps to exactly that Partner.
 IF actor IS NULL OR jsonb_typeof(actor) IS DISTINCT FROM 'object'
  OR (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR coalesce(length(actor->>'issuer'),0) NOT BETWEEN 1 AND 1024 OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128
  OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256 OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320
  OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail')) THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF p_borrower_id IS NULL OR octet_length(p_borrower_id) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=p_borrower_id) THEN
  RAISE EXCEPTION 'unknown_borrower' USING ERRCODE='P0002'; END IF;
 -- One decision per borrower at a time: two taps on two devices never both insert.
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('group-chat-refresh',p_borrower_id));
 now_at:=clock_timestamp();
 SELECT * INTO existing FROM public.pwa_group_chat_refresh_requests t WHERE t.borrower_id=p_borrower_id FOR UPDATE;
 IF FOUND AND existing.completed_at IS NULL AND existing.requested_at>now_at-interval '10 minutes' THEN
  kind:='pending';
 ELSIF FOUND AND existing.completed_at IS NOT NULL AND existing.completed_at>now_at-interval '60 seconds' THEN
  kind:='recent';
 ELSE
  -- None, completed earlier, or open for 10 minutes or more (stale): a new request replaces the row.
  INSERT INTO public.pwa_group_chat_refresh_requests AS t(borrower_id,request_id,requested_by,requested_at,completed_at,outcome)
   VALUES(p_borrower_id,gen_random_uuid(),partner,now_at,NULL,NULL)
   ON CONFLICT (borrower_id) DO UPDATE SET request_id=EXCLUDED.request_id,requested_by=EXCLUDED.requested_by,requested_at=EXCLUDED.requested_at,
    completed_at=NULL,outcome=NULL
   RETURNING * INTO existing;
  kind:='accepted';
 END IF;
 RETURN jsonb_build_object('kind',kind,'requestId',existing.request_id::text,
  'requestedAt',to_char(existing.requested_at AT TIME ZONE 'UTC',iso),
  'completedAt',CASE WHEN existing.completed_at IS NULL THEN NULL ELSE to_char(existing.completed_at AT TIME ZONE 'UTC',iso) END,
  'outcome',existing.outcome);
END $function$;
COMMENT ON FUNCTION public.pwa_request_group_chat_refresh_v1(jsonb,text) IS 'R165: records that the actor (its login email must map to exactly its Partner, 42501 otherwise) asks for the borrower''s group chat summary to be refreshed. Returns {kind: accepted (a new request) | pending (an open request younger than 10 minutes, same requestId) | recent (completed less than 60 seconds ago), requestId, requestedAt, completedAt, outcome}. Raises unknown_borrower (P0002) or invalid_request (22023). Invoker rights.';

-- 3. The completion path (command service, integration agent route). Invoker rights.
CREATE FUNCTION public.pwa_complete_group_chat_refresh_v1(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE root jsonb; c jsonb; request uuid; result text; existing public.pwa_group_chat_refresh_requests%ROWTYPE;
BEGIN
 -- Shape. Every rule is a positive condition that must be true (a NULL fails); a failure raises invalid_request (22023).
 BEGIN
  root:=canonical_json::jsonb;
  IF (jsonb_typeof(root)='object' AND ARRAY(SELECT jsonb_object_keys(root))=ARRAY['command'] AND jsonb_typeof(root->'command')='object') IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  c:=root->'command';
  IF (ARRAY(SELECT k FROM jsonb_object_keys(c) k ORDER BY k COLLATE "C")=ARRAY['environment','outcome','requestId','schemaVersion']
    AND jsonb_typeof(c->'schemaVersion')='number' AND c->>'schemaVersion'='1'
    AND jsonb_typeof(c->'requestId')='string' AND c->>'requestId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND jsonb_typeof(c->'environment')='string' AND c->>'environment'=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END
    AND jsonb_typeof(c->'outcome')='string' AND c->>'outcome' IN ('stored','unchanged','cleared','no_group','failed')) IS NOT TRUE THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  request:=(c->>'requestId')::uuid; result:=c->>'outcome';
 EXCEPTION WHEN data_exception THEN
  -- Class 22 only: malformed JSON and the rules above. Any other error is a real one and propagates.
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
 END;
 SELECT * INTO existing FROM public.pwa_group_chat_refresh_requests t WHERE t.request_id=request FOR UPDATE;
 -- Replaced by a newer request, or the borrower is gone: nothing to complete.
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unknown_request'); END IF;
 -- A replay (or a second report) leaves the first outcome as it is and writes no change-log row.
 IF existing.completed_at IS NOT NULL THEN RETURN jsonb_build_object('kind','replayed'); END IF;
 UPDATE public.pwa_group_chat_refresh_requests t SET completed_at=greatest(clock_timestamp(),t.requested_at),outcome=result WHERE t.request_id=request;
 RETURN jsonb_build_object('kind','completed');
END $function$;
COMMENT ON FUNCTION public.pwa_complete_group_chat_refresh_v1(text) IS 'R165: completes the open group chat summary refresh request named by the integration agent''s command {"command":{schemaVersion,environment,requestId,outcome}} (outcome stored, unchanged, cleared, no_group or failed). Returns {kind: completed | replayed (already completed; unchanged) | unknown_request (no row carries the id; nothing changes)}. Raises invalid_request (22023). Invoker rights.';

-- 4. Change log (V97): the offline dataset sees every request that starts, completes or is removed, under its borrower.
CREATE TRIGGER zzzzzzz_pwa_row_change AFTER INSERT OR UPDATE OR DELETE ON public.pwa_group_chat_refresh_requests FOR EACH ROW EXECUTE FUNCTION public.pwa_track_row_change('borrower_id');
CREATE TRIGGER zzzzzzz_pwa_row_truncate AFTER TRUNCATE ON public.pwa_group_chat_refresh_requests FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_track_row_change('borrower_id');
ALTER TABLE public.pwa_group_chat_refresh_requests ENABLE ALWAYS TRIGGER zzzzzzz_pwa_row_change;
ALTER TABLE public.pwa_group_chat_refresh_requests ENABLE ALWAYS TRIGGER zzzzzzz_pwa_row_truncate;

-- 5. Grants. PROD's default privileges may add grantees to an object postgres creates (mw_integration_agent, R085): every
-- grantee other than the owner is removed before the application role's own grants.
DO $grants$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END; grantee text; fn regprocedure;
BEGIN
 REVOKE ALL ON TABLE public.pwa_group_chat_refresh_requests FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_group_chat_refresh_requests'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.pwa_group_chat_refresh_requests FROM %I',grantee);
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['public.pwa_request_group_chat_refresh_v1(jsonb,text)'::regprocedure,'public.pwa_complete_group_chat_refresh_v1(text)'::regprocedure] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
  FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid=fn AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,grantee);
  END LOOP;
  IF to_regrole('mw_integration_agent') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM mw_integration_agent',fn); END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',fn,app);
 END LOOP;
 IF to_regrole('mw_integration_agent') IS NOT NULL THEN
  REVOKE ALL ON TABLE public.pwa_group_chat_refresh_requests FROM mw_integration_agent;
 END IF;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.pwa_group_chat_refresh_requests TO %I',app);
END $grants$;

-- Self-check: ownership, invoker rights, exact ACLs, both ALWAYS triggers and the change-log trigger firing last.
DO $selfcheck$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END; got text[]; fn regprocedure;
BEGIN
 IF (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid='public.pwa_group_chat_refresh_requests'::regclass)<>current_user THEN
  RAISE EXCEPTION 'V150: the table must be owned by the migration runner'; END IF;
 SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type ORDER BY a.privilege_type COLLATE "C") INTO got
  FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.pwa_group_chat_refresh_requests'::regclass AND a.grantee<>c.relowner;
 IF got IS DISTINCT FROM ARRAY[app||':DELETE',app||':INSERT',app||':SELECT',app||':UPDATE'] THEN RAISE EXCEPTION 'V150: table grants are %',got; END IF;
 FOREACH fn IN ARRAY ARRAY['public.pwa_request_group_chat_refresh_v1(jsonb,text)'::regprocedure,'public.pwa_complete_group_chat_refresh_v1(text)'::regprocedure] LOOP
  IF (SELECT p.proowner FROM pg_proc p WHERE p.oid=fn) IS DISTINCT FROM (SELECT c.relowner FROM pg_class c WHERE c.oid='public.pwa_group_chat_refresh_requests'::regclass) THEN
   RAISE EXCEPTION 'V150: % must be owned by the migration runner',fn; END IF;
  IF (SELECT p.prosecdef OR p.provolatile<>'v' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] FROM pg_proc p WHERE p.oid=fn) THEN
   RAISE EXCEPTION 'V150: % must be a volatile invoker-rights function with a pinned search_path',fn; END IF;
  SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) INTO got
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee<>p.proowner;
  IF got IS DISTINCT FROM ARRAY[app||':EXECUTE'] THEN RAISE EXCEPTION 'V150: grants of % are %',fn,got; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.pwa_group_chat_refresh_requests'::regclass AND NOT t.tgisinternal AND t.tgenabled='A'
   AND t.tgfoid='public.pwa_track_row_change()'::regprocedure AND t.tgnargs=1 AND t.tgargs=decode('626f72726f7765725f696400','hex')
   AND ((t.tgname='zzzzzzz_pwa_row_change' AND t.tgtype=29) OR (t.tgname='zzzzzzz_pwa_row_truncate' AND t.tgtype=32)))<>2
  OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.pwa_group_chat_refresh_requests'::regclass AND NOT t.tgisinternal)<>2 THEN
  RAISE EXCEPTION 'V150: the change-log triggers on pwa_group_chat_refresh_requests differ'; END IF;
END $selfcheck$;
