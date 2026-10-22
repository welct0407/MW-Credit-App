-- R089: each Notifications history row shows the message the device was supposed to receive (push title and body).
-- One additive read RPC for the notification API: the V100 content facts (event type, recipient language, borrower
-- name in that language, amount) for a page of history events, with the calling partner as the recipient. No table,
-- column, data or trigger change; pwa_notify_history_v1, pwa_notify_content_v1 and every other routine stay untouched.
-- The API renders the wording with services/notifications/content.mjs (the same renderer the dispatcher uses).
-- Same boundary as V88/V99: SECURITY DEFINER owned by the closed role mw_notify_owner_<env>, pinned search_path, the
-- caller resolved by pwa_notify_actor_v1 (pwa_worker_guard_v1('api')), EXECUTE only for mw_notify_api_<env>. The
-- owner already holds every source column it reads (V88, V99, V100); the preflight asserts them and nothing is granted
-- on a table. On Cloud SQL the runner is not a superuser: ALTER FUNCTION ... OWNER needs temporary SET membership of
-- mw_notify_owner_<env> and CREATE on public for it (owner-authority-cli.mjs prepare --owner mw_notify_owner_<env>,
-- then restore); the preflight names every missing authority first.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; notify_owner text; api text; role_name text; problems text[]:='{}'; source record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported worker database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 notify_owner:='mw_notify_owner_'||suffix; api:='mw_notify_api_'||suffix;
 -- V88 role rules: closed, unprivileged, inheriting from no role.
 FOREACH role_name IN ARRAY ARRAY[notify_owner,api] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
   problems:=problems||format('role %s is missing or unsafe',role_name);
  ELSIF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_name::regrole) THEN problems:=problems||format('%s must inherit no role',role_name); END IF;
 END LOOP;
 IF to_regprocedure('public.pwa_notify_actor_v1(jsonb)') IS NULL OR to_regprocedure('public.pwa_notify_history_v1(jsonb,timestamptz,uuid)') IS NULL THEN problems:=problems||'V88 notification boundary is missing'::text;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) AND EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.pwa_notify_actor_v1(jsonb)'::regprocedure,'public.pwa_notify_history_v1(jsonb,timestamptz,uuid)'::regprocedure) AND pg_get_userbyid(proowner)<>notify_owner) THEN
  problems:=problems||format('pwa_notify_actor_v1 and pwa_notify_history_v1 must be owned by %s',notify_owner); END IF;
 IF to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND prosrc LIKE '%b."Description"%') THEN
  problems:=problems||'V100 content rule (pwa_notify_content_v1 with the English name) is missing'::text; END IF;
 IF to_regprocedure('public.pwa_notify_history_content_v1(jsonb,uuid[])') IS NOT NULL THEN problems:=problems||'public.pwa_notify_history_content_v1(jsonb,uuid[]) already exists'::text; END IF;
 -- The definer reads exactly these source columns; V88/V99/V100 granted them to the owner. Nothing new is granted.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) THEN
  FOR source IN SELECT * FROM (VALUES ('Partners','Row ID'),('Partners','Language Preference'),('Payments','Row ID'),('Payments','Ref Borrower'),('Payments','Amount Received'),
    ('Loans','Row ID'),('Loans','Ref Borrowers'),('Loans','Principal Amount'),('Borrowers','Row ID'),('Borrowers','Borrower Name'),('Borrowers','Description')) v(t,c) LOOP
   IF NOT has_column_privilege(notify_owner,format('public.%I',source.t),source.c,'SELECT') THEN problems:=problems||format('%s lacks SELECT on %s.%s (V99/V100 column grant)',notify_owner,source.t,source.c); END IF;
  END LOOP;
  IF to_regclass('public.pwa_notification_events') IS NULL OR to_regclass('public.pwa_notification_deliveries') IS NULL
   OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.pwa_notification_events'::regclass,'public.pwa_notification_deliveries'::regclass) AND pg_get_userbyid(relowner)<>notify_owner) THEN
   problems:=problems||format('notification events and deliveries must be owned by %s',notify_owner); END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  -- ALTER FUNCTION ... OWNER needs SET ROLE to the new owner and CREATE on public for it (V97/V99 pattern).
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) THEN
   IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,notify_owner); END IF;
   IF NOT has_schema_privilege(notify_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',notify_owner); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V102 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The content facts of up to 26 history events (one history page) for the calling partner. One row per distinct
-- requested event that has a delivery to that partner; other events are silently absent (the API renders them as
-- generic text). found=false: the event's source row no longer exists. Language, borrower name and amount are the
-- V100 expressions with the caller as the recipient: 'ไทย' is Thai ("Borrower Name"), anything else (including none)
-- English (the trimmed "Description", none when blank).
CREATE FUNCTION public.pwa_notify_history_content_v1(actor jsonb,events uuid[])
RETURNS TABLE("eventId" uuid,found boolean,"eventType" text,language text,"borrowerName" text,amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF events IS NULL OR cardinality(events)>26 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,src.source_found,e.event_type,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  CASE WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount
 FROM public.pwa_notification_events e
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=partner
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE e.event_id=ANY(events) AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $$;

-- 3. V88 ACL pattern, then the ownership change (grants and comment while the runner still owns the function).
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; api text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; api:='mw_notify_api_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_notify_history_content_v1(jsonb,uuid[]) FROM PUBLIC;
 COMMENT ON FUNCTION public.pwa_notify_history_content_v1(jsonb,uuid[]) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_history_content_v1(jsonb,uuid[]) TO %I',api);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_history_content_v1(jsonb,uuid[]) OWNER TO %I',notify_owner);
END $ownership$;

-- 4. Self-check: the owner's pinned definer with the boundary comment, executable only by the API capability.
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; api text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; api:='mw_notify_api_'||suffix;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,api::regrole))
  OR NOT has_function_privilege(api,'public.pwa_notify_history_content_v1(jsonb,uuid[])','EXECUTE')
  OR obj_description('public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed notification boundary; explicit capability only' THEN
  RAISE EXCEPTION 'V102: pwa_notify_history_content_v1 must be the notify owner''s pinned definer executable only by %',api; END IF;
END $check$;
