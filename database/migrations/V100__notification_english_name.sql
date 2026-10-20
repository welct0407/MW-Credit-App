-- R081 (owner rule, 20 October 2026): an English-preference recipient's push shows the borrower's English name only,
-- public."Borrowers"."Description" (the borrower form's "English name"), never the Thai name or the combined label;
-- with no English name (null, empty or whitespace) the English push has no name. Thai recipients keep "Borrower Name".
-- pwa_notify_content_v1(uuid,bigint) is replaced in place: same signature and result columns, same owner
-- (mw_notify_owner_<env>), SECURITY DEFINER, pinned search_path, guard, comment and ACL (EXECUTE only for
-- mw_notify_dispatch_<env>); only the borrower_name expression changes. The notify owner gains column-level SELECT on
-- "Borrowers" "Description". No table, column, data or trigger change. On Cloud SQL the runner replaces the function as
-- an inheriting member of the notify owner or under SET ROLE to it, which needs CREATE on public for the owner
-- (owner-authority-cli.mjs prepare --owner mw_notify_owner_<env>, then restore); the preflight names what is missing.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; notify_owner text; dispatcher text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported worker database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 IF to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)') IS NULL THEN problems:=problems||'V99 public.pwa_notify_content_v1(uuid,bigint) is missing'::text;
 ELSIF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure) THEN
  problems:=problems||format('pwa_notify_content_v1 is not the pinned definer of %s',notify_owner); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=dispatcher) THEN problems:=problems||format('role %s is missing',dispatcher); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner)
  AND NOT pg_has_role(current_user,notify_owner,'USAGE') THEN
  -- Replaced under SET ROLE to the owner (V94/V97 pattern): CREATE OR REPLACE needs CREATE on public for it.
  IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s holds neither inherited nor SET authority on %s (temporary maintenance membership required)',current_user,notify_owner);
  ELSIF NOT has_schema_privilege(notify_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by CREATE OR REPLACE FUNCTION under SET ROLE; grant temporarily)',notify_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V100 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The column the English name comes from (granted by the runner, which owns "Borrowers").
DO $grant$
DECLARE notify_owner text:='mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 EXECUTE format('GRANT SELECT ("Description") ON public."Borrowers" TO %I',notify_owner);
END $grant$;

-- 3. Replace the body as the owner, so owner, ACL and comment are preserved.
DO $replace$
DECLARE notify_owner text:='mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
BEGIN
 IF NOT pg_has_role(current_user,notify_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',notify_owner); switched:=true; END IF;
 EXECUTE $create$
CREATE OR REPLACE FUNCTION public.pwa_notify_content_v1(delivery uuid,generation bigint)
RETURNS TABLE(found boolean,event_type text,language text,borrower_name text,amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,e.event_type,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount
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
END $$
$create$;
 IF switched THEN RESET ROLE; END IF;
END $replace$;
RESET ROLE;

-- 4. Self-check (V99 style): still the owner's pinned definer, executable only by the dispatch capability, reading
-- "Borrowers" through column grants only.
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; dispatcher text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,dispatcher::regrole))
  OR NOT has_function_privilege(dispatcher,'public.pwa_notify_content_v1(uuid,bigint)','EXECUTE')
  OR obj_description('public.pwa_notify_content_v1(uuid,bigint)'::regprocedure,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed notification boundary; explicit capability only' THEN
  RAISE EXCEPTION 'V100: pwa_notify_content_v1 must stay the notify owner''s pinned definer executable only by %',dispatcher; END IF;
 IF NOT has_column_privilege(notify_owner,'public."Borrowers"','Description','SELECT') OR has_table_privilege(notify_owner,'public."Borrowers"','SELECT') THEN
  RAISE EXCEPTION 'V100: % must read "Borrowers" "Description" through a column grant only',notify_owner; END IF;
END $check$;
