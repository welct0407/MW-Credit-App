-- R078 item 7 (owner decision 19 October 2026: "Authorize DEV"; PROD needs its own promotion approval):
-- PWA row-change tracking for the offline dataset protocol v4. One additive table public.pwa_row_changes,
-- one generic AFTER INSERT OR UPDATE OR DELETE row trigger zzzzzzz_pwa_row_change on 17 source tables
-- (fires after every existing non-deferred AFTER ROW trigger; no existing trigger is touched), and a
-- 7-day retention run by the hourly recent-analytics job. Both functions are SECURITY DEFINER, owned by
-- the closed NOLOGIN role mw_changes_owner_<env> with a pinned search_path (V93 sync_cash_ledger
-- pattern), so writers of the source tables need no privilege on the change table. The capability
-- (mw_app_<env>) reads it through the operator policy (app-role-policy.mjs: read-only relation).
-- Operator provisions mw_changes_owner_<env> before this migration (owner-authority-cli.mjs role; CI:
-- Test-AppRolePrerequisites.sql). On Cloud SQL the runner is not a superuser: the preflight names every
-- missing authority first (temporary SET membership and CREATE on public for mw_changes_owner_<env> and
-- mw_jobs_owner_<env>, opened and restored by owner-authority-cli.mjs prepare/restore).

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; changes_owner text; jobs_owner text; role_name text; problems text[]:='{}'; t record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 changes_owner:='mw_changes_owner_'||suffix; jobs_owner:='mw_jobs_owner_'||suffix;
 -- The change owner exists, is NOLOGIN/unprivileged and is a member of nothing (V93 ledger-owner rules).
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=changes_owner AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
  problems:=problems||format('role %s is missing or unsafe (expected NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS)',changes_owner);
 ELSE
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=changes_owner::regrole) THEN problems:=problems||format('%s must be a member of no role',changes_owner); END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=changes_owner::regrole AND member NOT IN (session_user::regrole,current_user::regrole)) THEN
   problems:=problems||format('%s must be granted to no role other than the migration runner',changes_owner); END IF;
 END IF;
 FOREACH role_name IN ARRAY ARRAY['mw_app_'||suffix,jobs_owner] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN problems:=problems||format('role %s is missing',role_name); END IF;
 END LOOP;
 IF to_regprocedure('public.pwa_job_run_v1(text,date,text)') IS NULL THEN problems:=problems||'public.pwa_job_run_v1(text,date,text) is missing';
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=jobs_owner) AND (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_job_run_v1(text,date,text)'::regprocedure)<>jobs_owner THEN
  problems:=problems||format('pwa_job_run_v1 is not owned by %s',jobs_owner); END IF;
 -- Every tracked table exists with the expected single-column primary key (the trigger argument).
 FOR t IN SELECT * FROM (VALUES ('Borrowers','Row ID'),('Loans','Row ID'),('Charges','Row ID'),('Payments','Row ID'),('Payment Allocations','Row ID'),('Repayments','Row ID'),
   ('Business Expenses','Row ID'),('Cash Accounts','Row ID'),('Cash Holders','Row ID'),('Cash Ledger','Row ID'),('Cash Pool Contributions','Row ID'),('Settlements','Row ID'),
   ('Partners','Row ID'),('r008_cash_account_cutover','Ref Cash Account'),('pwa_payment_commands','request_id'),('Daily Analytics','Row ID'),('Statistics','Row ID')) v(relation,key_column) LOOP
  IF to_regclass(format('public.%I',t.relation)) IS NULL THEN problems:=problems||format('public.%I is missing',t.relation);
  ELSIF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=format('public.%I',t.relation)::regclass AND k.contype='p' AND cardinality(k.conkey)=1
    AND (SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])=t.key_column) THEN
   problems:=problems||format('public.%I primary key is not (%I)',t.relation,t.key_column); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  -- ALTER FUNCTION ... OWNER needs SET ROLE to the new owner and CREATE on public for it.
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=changes_owner) THEN
   IF NOT pg_has_role(current_user,changes_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,changes_owner); END IF;
   IF NOT has_schema_privilege(changes_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',changes_owner); END IF;
  END IF;
  -- pwa_job_run_v1 is replaced as an inheriting member of the jobs owner or under SET ROLE to it (V94 pattern).
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=jobs_owner) AND NOT pg_has_role(current_user,jobs_owner,'USAGE') THEN
   IF NOT pg_has_role(current_user,jobs_owner,'SET') THEN problems:=problems||format('%s holds neither inherited nor SET authority on %s (temporary maintenance membership required)',current_user,jobs_owner);
   ELSIF NOT has_schema_privilege(jobs_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by CREATE OR REPLACE FUNCTION under SET ROLE; grant temporarily)',jobs_owner); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V97 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The change table. seq is assigned at insert time (not commit order); txid lets a reader treat rows of
-- transactions still in progress at its snapshot as "next time" (protocol v4 cursor rule).
CREATE TABLE IF NOT EXISTS public.pwa_row_changes(
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_name text NOT NULL,
 row_key text NOT NULL,
 txid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX IF NOT EXISTS pwa_row_changes_table_seq ON public.pwa_row_changes(table_name,seq);
COMMENT ON TABLE public.pwa_row_changes IS 'R078 offline dataset change log: one row per changed source row (table_name = relation name, row_key = primary key text); written only by pwa_track_row_change(), pruned after 7 days by pwa_row_changes_prune_v1()';
REVOKE ALL ON TABLE public.pwa_row_changes FROM PUBLIC;

-- 3. Generic row trigger function. TG_ARGV[0] names the primary-key column. An UPDATE that leaves the row
-- identical records nothing; an UPDATE that changes the key records the old and the new key.
CREATE OR REPLACE FUNCTION public.pwa_track_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_key text; new_key text;
BEGIN
 IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_NARGS<>1 OR TG_TABLE_SCHEMA<>'public' THEN RAISE EXCEPTION 'pwa_track_row_change requires a public AFTER ROW trigger with one key column'; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN old_key:=to_jsonb(OLD)->>TG_ARGV[0]; END IF;
 IF TG_OP<>'DELETE' THEN new_key:=to_jsonb(NEW)->>TG_ARGV[0]; END IF;
 IF old_key IS NOT NULL AND old_key IS DISTINCT FROM new_key THEN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES(TG_TABLE_NAME,old_key); END IF;
 IF new_key IS NOT NULL THEN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES(TG_TABLE_NAME,new_key); END IF;
 RETURN NULL;
END $$;

-- 4. Retention: delete rows older than 7 days, always keeping the newest row so max(seq) stays a cursor.
-- Called by pwa_job_run_v1 on every hourly recent-analytics run. Returns the number of rows removed.
CREATE OR REPLACE FUNCTION public.pwa_row_changes_prune_v1() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cutoff bigint; newest bigint; removed bigint;
BEGIN
 SELECT max(seq) INTO newest FROM public.pwa_row_changes;
 IF newest IS NULL THEN RETURN 0; END IF;
 SELECT seq INTO cutoff FROM public.pwa_row_changes WHERE changed_at>=clock_timestamp()-interval '7 days' ORDER BY seq LIMIT 1;
 cutoff:=least(coalesce(cutoff,newest),newest);
 DELETE FROM public.pwa_row_changes WHERE seq<cutoff;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;

-- 5. Triggers (created while the runner still owns the function), grants, then the ownership change.
DO $changes$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; changes_owner text; jobs_owner text; t record; r text;
BEGIN
 changes_owner:='mw_changes_owner_'||suffix; jobs_owner:='mw_jobs_owner_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_track_row_change() FROM PUBLIC;
 REVOKE ALL ON FUNCTION public.pwa_row_changes_prune_v1() FROM PUBLIC;
 FOR t IN SELECT * FROM (VALUES ('Borrowers','Row ID'),('Loans','Row ID'),('Charges','Row ID'),('Payments','Row ID'),('Payment Allocations','Row ID'),('Repayments','Row ID'),
   ('Business Expenses','Row ID'),('Cash Accounts','Row ID'),('Cash Holders','Row ID'),('Cash Ledger','Row ID'),('Cash Pool Contributions','Row ID'),('Settlements','Row ID'),
   ('Partners','Row ID'),('r008_cash_account_cutover','Ref Cash Account'),('pwa_payment_commands','request_id'),('Daily Analytics','Row ID'),('Statistics','Row ID')) v(relation,key_column) LOOP
  EXECUTE format('CREATE OR REPLACE TRIGGER zzzzzzz_pwa_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pwa_track_row_change(%L)',t.relation,t.key_column);
 END LOOP;
 -- The hourly job's owner runs the retention; nobody else executes either function.
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_row_changes_prune_v1() TO %I',jobs_owner);
 EXECUTE format('ALTER FUNCTION public.pwa_track_row_change() OWNER TO %I',changes_owner);
 EXECUTE format('ALTER FUNCTION public.pwa_row_changes_prune_v1() OWNER TO %I',changes_owner);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',changes_owner);
 EXECUTE format('GRANT SELECT,INSERT,DELETE ON public.pwa_row_changes TO %I',changes_owner);
 -- No direct write for anyone else: assert, since a grant under another grantor would survive a REVOKE.
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname<>changes_owner AND NOT rolsuper AND rolname NOT LIKE 'pg\_%' AND rolname<>'cloudsqlsuperuser' LOOP
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) p WHERE has_table_privilege(r,'public.pwa_row_changes',p))
   AND NOT pg_has_role(r,(SELECT relowner FROM pg_class WHERE oid='public.pwa_row_changes'::regclass),'USAGE') THEN
   RAISE EXCEPTION 'Direct pwa_row_changes write privilege for %',r; END IF;
 END LOOP;
END $changes$;

-- 6. Retention hook in the hourly job: pwa_job_run_v1's recent-analytics branch also prunes the change log
-- (same transaction as the refresh). Current text via pg_get_functiondef + exact-count replace (V94
-- pattern), so owner, SECURITY mode, search_path, ACL and comment are preserved.
DO $jobs$
DECLARE runner text:=current_user; owner_role text; switched boolean:=false; definition text; found integer;
 o text:=$t$ELSE affected:=public.refresh_daily_analytics($2-1,$2); END IF;$t$;
 n text:=$t$ELSE affected:=public.refresh_daily_analytics($2-1,$2); PERFORM public.pwa_row_changes_prune_v1(); END IF;$t$;
BEGIN
 SELECT pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner) INTO STRICT definition,owner_role FROM pg_proc p WHERE p.oid='public.pwa_job_run_v1(text,date,text)'::regprocedure;
 IF strpos(definition,n)>0 THEN RETURN; END IF; -- already hooked (re-run)
 found:=(length(definition)-length(replace(definition,o,'')))/length(o);
 IF found<>1 THEN RAISE EXCEPTION 'V97: % occurrence(s) of the recent-analytics branch in pwa_job_run_v1, expected 1',found; END IF;
 IF NOT pg_has_role(runner,owner_role,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',owner_role); switched:=true; END IF;
 EXECUTE replace(definition,o,n);
 IF switched THEN RESET ROLE; END IF;
END $jobs$;
RESET ROLE;
