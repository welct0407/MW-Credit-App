-- R149 Group chat summary: the "new summary" list mark follows the user across devices (owner request and authorization
-- of 13 November 2026 for the table public.pwa_group_chat_seen and PROD; Archie's design, orchestrator-accepted).
-- V146 is applied and stays.
-- A device records which summary version it has shown to its user; until now only in that device's localStorage. This
-- table is the shared value per user (Partner) and borrower: the last_message_at of the summary that user has seen.
-- It is a display hint. Nothing financial, no notification and no agent action reads it.
-- Objects:
--  1. Table pwa_group_chat_seen (owner: the migration runner, postgres): primary key (borrower_id, partner_id), both
--     foreign keys ON DELETE CASCADE. borrower_id is the first key column: the change-log trigger argument and the key the
--     offline dataset maps to a borrower.
--  2. pwa_mark_group_chat_seen_v1(actor jsonb, p_borrower_id text, p_seen timestamptz) RETURNS jsonb: invoker rights,
--     owner postgres. Not a journalled command (a row per view would be a records delta, a version and a pending entry):
--     an idempotent, forward-only upsert of the caller's own row. The actor's login email must map to exactly its Partner
--     (42501 otherwise, as the other actor-bound routines check). A missing borrower raises unknown_borrower (P0002); a
--     borrower without a summary is ignored; the value is clamped to the summary's last_message_at; an equal or older
--     value touches no row (no change-log row). Result {kind: stored | unchanged | ignored, seenAt}.
--  3. The V97 change-log triggers zzzzzzz_pwa_row_change('borrower_id') and zzzzzzz_pwa_row_truncate, ENABLE ALWAYS.
--  4. Grants: mw_app_<env> gets SELECT, INSERT, UPDATE, DELETE on the table and EXECUTE on the function. PUBLIC and
--     every other grantee, including PROD's default-privilege grantee mw_integration_agent, are revoked. The reader
--     login's SELECT is the operator's column grant (reader-capability-contract.json, configure-dev-read-role.py).
-- Preflight: as V146, plus pwa_group_chat_summaries must exist. On Cloud SQL the runner needs the owner window for
-- mw_changes_owner_<env> to attach pwa_track_row_change() (owner-authority-cli.mjs prepare, then restore).
-- Rollback: the app ignores an empty table (devices fall back to their own storage); a later migration may drop it.

DO $preflight$
DECLARE problems text[]:='{}'; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; r text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 FOREACH r IN ARRAY ARRAY['mw_app_'||suffix,'mw_changes_owner_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN problems:=problems||format('V147 needs the role %s',r); END IF;
 END LOOP;
 IF to_regclass('public.pwa_group_chat_seen') IS NOT NULL OR to_regprocedure('public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)') IS NOT NULL THEN
  problems:=problems||'V147: a new object already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public."Borrowers"'::regclass AND k.contype='p' AND cardinality(k.conkey)=1
   AND (SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])='Row ID') THEN problems:=problems||'V147: "Borrowers" primary key is not ("Row ID")'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid='public."Partners"'::regclass AND k.contype='p' AND cardinality(k.conkey)=1
   AND (SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])='Row ID') THEN problems:=problems||'V147: "Partners" primary key is not ("Row ID")'::text; END IF;
 IF to_regclass('public.pwa_group_chat_summaries') IS NULL THEN problems:=problems||'V147 needs pwa_group_chat_summaries (V146)'::text; END IF;
 IF to_regprocedure('public.pwa_track_row_change()') IS NULL THEN
  problems:=problems||'V147 needs pwa_track_row_change() (V97)'::text;
 ELSIF NOT has_function_privilege(current_user,'public.pwa_track_row_change()','EXECUTE') THEN
  -- CREATE TRIGGER needs EXECUTE on the trigger function; only its owner holds it (V97).
  problems:=problems||format('%s cannot attach pwa_track_row_change() (owner window required: owner-authority-cli.mjs prepare --owner mw_changes_owner_%s)',current_user,suffix);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND NOT has_schema_privilege(current_user,'public','CREATE') THEN
  problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V147 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- 1. The table: what each user has seen, per borrower.
CREATE TABLE public.pwa_group_chat_seen (
 borrower_id text NOT NULL REFERENCES public."Borrowers"("Row ID") ON DELETE CASCADE,
 partner_id text NOT NULL REFERENCES public."Partners"("Row ID") ON DELETE CASCADE,
 seen_last_message_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (borrower_id, partner_id)
);
CREATE INDEX pwa_group_chat_seen_partner ON public.pwa_group_chat_seen(partner_id);
COMMENT ON TABLE public.pwa_group_chat_seen IS 'R149: per user (Partner) and borrower, the last_message_at of the group chat summary that user has seen on any device; the list mark compares it with the current summary. Written only by pwa_mark_group_chat_seen_v1 (forward only). Display hint: nothing financial reads it.';
COMMENT ON COLUMN public.pwa_group_chat_seen.borrower_id IS 'R149: the borrower whose summary was shown; the row goes with the borrower.';
COMMENT ON COLUMN public.pwa_group_chat_seen.partner_id IS 'R149: the user (Partner row of the signed-in login) who saw it; the row goes with the Partner.';
COMMENT ON COLUMN public.pwa_group_chat_seen.seen_last_message_at IS 'R149: last_message_at of the newest summary version this user has seen for the borrower; only ever moves forward, never beyond the stored summary.';
COMMENT ON COLUMN public.pwa_group_chat_seen.updated_at IS 'R149: when this row last moved.';

-- 2. The write path. Invoker rights: the caller (mw_app_<env> through the command service) holds the table DML itself.
CREATE FUNCTION public.pwa_mark_group_chat_seen_v1(actor jsonb, p_borrower_id text, p_seen timestamptz) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
DECLARE matches integer; partner text; current_last timestamptz; target timestamptz; moved integer; kept timestamptz;
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
 IF p_borrower_id IS NULL OR octet_length(p_borrower_id) NOT BETWEEN 1 AND 256 OR p_seen IS NULL OR NOT isfinite(p_seen) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=p_borrower_id) THEN
  RAISE EXCEPTION 'unknown_borrower' USING ERRCODE='P0002'; END IF;
 -- Nothing to have seen without a summary; never beyond the stored summary (a clock ahead cannot hide a later one).
 SELECT s.last_message_at INTO current_last FROM public.pwa_group_chat_summaries s WHERE s.borrower_id=p_borrower_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','ignored','seenAt',NULL); END IF;
 target:=LEAST(p_seen,current_last);
 -- Forward only: an equal or older value updates no row, so it writes no change-log row and no device refreshes.
 INSERT INTO public.pwa_group_chat_seen AS t(borrower_id,partner_id,seen_last_message_at,updated_at) VALUES(p_borrower_id,partner,target,clock_timestamp())
  ON CONFLICT (borrower_id,partner_id) DO UPDATE SET seen_last_message_at=EXCLUDED.seen_last_message_at,updated_at=EXCLUDED.updated_at
  WHERE t.seen_last_message_at<EXCLUDED.seen_last_message_at;
 GET DIAGNOSTICS moved=ROW_COUNT;
 SELECT t.seen_last_message_at INTO kept FROM public.pwa_group_chat_seen t WHERE t.borrower_id=p_borrower_id AND t.partner_id=partner;
 RETURN jsonb_build_object('kind',CASE WHEN moved>0 THEN 'stored' ELSE 'unchanged' END,
  'seenAt',to_char(kept AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $function$;
COMMENT ON FUNCTION public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz) IS 'R149: records that the actor (its login email must map to exactly its Partner, 42501 otherwise) has seen the borrower''s group chat summary up to p_seen. Forward only and clamped to the summary''s last_message_at; an equal or older value touches no row. Returns {kind: stored | unchanged | ignored (no summary), seenAt}. Raises unknown_borrower (P0002) or invalid_request (22023). Invoker rights.';

-- 3. Change log (V97): the offline dataset sees every seen value that moved or was removed, under its borrower.
CREATE TRIGGER zzzzzzz_pwa_row_change AFTER INSERT OR UPDATE OR DELETE ON public.pwa_group_chat_seen FOR EACH ROW EXECUTE FUNCTION public.pwa_track_row_change('borrower_id');
CREATE TRIGGER zzzzzzz_pwa_row_truncate AFTER TRUNCATE ON public.pwa_group_chat_seen FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_track_row_change('borrower_id');
ALTER TABLE public.pwa_group_chat_seen ENABLE ALWAYS TRIGGER zzzzzzz_pwa_row_change;
ALTER TABLE public.pwa_group_chat_seen ENABLE ALWAYS TRIGGER zzzzzzz_pwa_row_truncate;

-- 4. Grants. PROD's default privileges may add grantees to an object postgres creates (mw_integration_agent, R085): every
-- grantee other than the owner is removed before the application role's own grants.
DO $grants$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END; grantee text;
BEGIN
 REVOKE ALL ON TABLE public.pwa_group_chat_seen FROM PUBLIC;
 REVOKE ALL ON FUNCTION public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_group_chat_seen'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.pwa_group_chat_seen FROM %I',grantee);
 END LOOP;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz) FROM %I',grantee);
 END LOOP;
 IF to_regrole('mw_integration_agent') IS NOT NULL THEN
  REVOKE ALL ON TABLE public.pwa_group_chat_seen FROM mw_integration_agent;
  REVOKE ALL ON FUNCTION public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz) FROM mw_integration_agent;
 END IF;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.pwa_group_chat_seen TO %I',app);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz) TO %I',app);
END $grants$;

-- Self-check: ownership, invoker rights, exact ACLs, both ALWAYS triggers and the change-log trigger firing last.
DO $selfcheck$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END; got text[];
BEGIN
 IF (SELECT c.relowner FROM pg_class c WHERE c.oid='public.pwa_group_chat_seen'::regclass)
   IS DISTINCT FROM (SELECT p.proowner FROM pg_proc p WHERE p.oid='public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)'::regprocedure)
  OR (SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid='public.pwa_group_chat_seen'::regclass)<>current_user THEN
  RAISE EXCEPTION 'V147: the table and the function must be owned by the migration runner'; END IF;
 IF (SELECT p.prosecdef OR p.provolatile<>'v' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] FROM pg_proc p WHERE p.oid='public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)'::regprocedure) THEN
  RAISE EXCEPTION 'V147: pwa_mark_group_chat_seen_v1 must be a volatile invoker-rights function with a pinned search_path'; END IF;
 SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type ORDER BY a.privilege_type COLLATE "C") INTO got
  FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.pwa_group_chat_seen'::regclass AND a.grantee<>c.relowner;
 IF got IS DISTINCT FROM ARRAY[app||':DELETE',app||':INSERT',app||':SELECT',app||':UPDATE'] THEN RAISE EXCEPTION 'V147: table grants are %',got; END IF;
 SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) INTO got
  FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)'::regprocedure AND a.grantee<>p.proowner;
 IF got IS DISTINCT FROM ARRAY[app||':EXECUTE'] THEN RAISE EXCEPTION 'V147: function grants are %',got; END IF;
 IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.pwa_group_chat_seen'::regclass AND NOT t.tgisinternal AND t.tgenabled='A'
   AND t.tgfoid='public.pwa_track_row_change()'::regprocedure AND t.tgnargs=1 AND t.tgargs=decode('626f72726f7765725f696400','hex')
   AND ((t.tgname='zzzzzzz_pwa_row_change' AND t.tgtype=29) OR (t.tgname='zzzzzzz_pwa_row_truncate' AND t.tgtype=32)))<>2
  OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.pwa_group_chat_seen'::regclass AND NOT t.tgisinternal)<>2 THEN
  RAISE EXCEPTION 'V147: the change-log triggers on pwa_group_chat_seen differ'; END IF;
END $selfcheck$;
