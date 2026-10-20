-- R079: push notifications describe the event (activity, amount, borrower) in the recipient's language
-- instead of the generic "An update is available." text. One additive read RPC for the dispatcher; no table,
-- column, data or trigger change, and pwa_notify_prepare_send_v1 and every other V88 routine stay untouched.
-- pwa_notify_content_v1 returns the facts of one currently leased delivery (V88 lease fence); the worker renders
-- the wording (services/notifications/content.mjs) and falls back to generic text on any failure, so a worker
-- deployed before this migration keeps sending. Owner decision: borrower name and amount may show on the lock screen.
-- Same boundary as V88: SECURITY DEFINER owned by the closed role mw_notify_owner_<env>, pinned search_path,
-- pwa_worker_guard_v1('dispatch'), EXECUTE only for mw_notify_dispatch_<env>. The owner gains column-level SELECT
-- on exactly the source columns read below. On Cloud SQL the runner is not a superuser: ALTER FUNCTION ... OWNER
-- needs temporary SET membership of mw_notify_owner_<env> and CREATE on public for it (owner-authority-cli.mjs
-- prepare --owner mw_notify_owner_<env>, then restore); the preflight names every missing authority first.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; notify_owner text; dispatcher text; role_name text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported worker database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 -- V88 role rules: closed, unprivileged, inheriting from no role.
 FOREACH role_name IN ARRAY ARRAY[notify_owner,dispatcher] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
   problems:=problems||format('role %s is missing or unsafe',role_name);
  ELSIF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_name::regrole) THEN problems:=problems||format('%s must inherit no role',role_name); END IF;
 END LOOP;
 IF to_regprocedure('public.pwa_worker_guard_v1(text)') IS NULL OR to_regprocedure('public.pwa_notify_prepare_send_v1(uuid,bigint)') IS NULL THEN problems:=problems||'V88 notification boundary is missing'::text;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) AND (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_notify_prepare_send_v1(uuid,bigint)'::regprocedure)<>notify_owner THEN
  problems:=problems||format('pwa_notify_prepare_send_v1 is not owned by %s',notify_owner); END IF;
 IF to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)') IS NOT NULL THEN problems:=problems||'public.pwa_notify_content_v1(uuid,bigint) already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  -- ALTER FUNCTION ... OWNER needs SET ROLE to the new owner and CREATE on public for it (V97 pattern).
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) THEN
   IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,notify_owner); END IF;
   IF NOT has_schema_privilege(notify_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',notify_owner); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V99 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The content facts of one leased delivery. No row: the delivery is not currently leased under this generation
-- (the dispatcher then sends generic text). found=false: the event's source row no longer exists. Language is the
-- recipient's "Language Preference": 'ไทย' is Thai, anything else (including none) English.
CREATE FUNCTION public.pwa_notify_content_v1(delivery uuid,generation bigint)
RETURNS TABLE(found boolean,event_type text,language text,borrower_name text,amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,e.event_type,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  b."Borrower Name",src.source_amount
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $$;

-- 3. V88 ACL pattern, then the ownership change (grants and comment while the runner still owns the function).
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; dispatcher text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_notify_content_v1(uuid,bigint) FROM PUBLIC;
 COMMENT ON FUNCTION public.pwa_notify_content_v1(uuid,bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_content_v1(uuid,bigint) TO %I',dispatcher);
 -- Exactly the source columns the definer reads (V88 already grants "Partners" "Row ID").
 EXECUTE format('GRANT SELECT ("Language Preference") ON public."Partners" TO %I',notify_owner);
 EXECUTE format('GRANT SELECT ("Row ID","Ref Borrower","Amount Received") ON public."Payments" TO %I',notify_owner);
 EXECUTE format('GRANT SELECT ("Row ID","Ref Borrowers","Principal Amount") ON public."Loans" TO %I',notify_owner);
 EXECUTE format('GRANT SELECT ("Row ID","Borrower Name") ON public."Borrowers" TO %I',notify_owner);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_content_v1(uuid,bigint) OWNER TO %I',notify_owner);
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,dispatcher::regrole))
  OR NOT has_function_privilege(dispatcher,'public.pwa_notify_content_v1(uuid,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'V99: pwa_notify_content_v1 must be the notify owner''s pinned definer executable only by %',dispatcher; END IF;
END $ownership$;
