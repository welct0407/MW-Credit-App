-- R067 contract migration: DB-LOCK-02 (pwa_job_runs lease state retired; pwa_job_run_v1 is pending ->
-- completed, atomic, replay unchanged), DB-LOCK-03 (every SQL advisory key now comes from
-- pwa_lock_key_v1, V93), and the owner decision on reviewer payment-input edits (SQLSTATE 42501 with
-- a named reason instead of the bare function ACL error). Transactional; re-runnable (a second apply
-- only re-asserts the same state). On Cloud SQL the runner is not a superuser: the preflight names every
-- missing authority first, and each owner-held object is replaced either as an inheriting member or
-- under a temporary SET ROLE (V93 pattern; opened/restored by owner-authority-cli.mjs).

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; jobs_owner text; journal_owner text; app_role text; problems text[]:='{}'; r record; role_name text;
 signature text; manifest text[]:=ARRAY['public.pwa_job_run_v1(text,date,text)','public.guard_cash_account()','public.pwa_submit_operation_v2(text)',
  'public.pwa_apply_loan_create_v2(text)','public.pwa_apply_charge_v2(text)','public.pwa_apply_expense_v2(text)','public.pwa_apply_management_v2(text)',
  'public.pwa_apply_management_financial_v2(text)','public.pwa_apply_assessment_v2(text)','public.pwa_apply_analytics_v2(text)',
  'public.pwa_submit_agent_operation_v1(text)','public.payment_crud_prepare()','public.pwa_lock_key_v1(text,text)'];
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 jobs_owner:='mw_jobs_owner_'||suffix; journal_owner:='mw_app_'||suffix||'_journal_owner'; app_role:='mw_app_'||suffix;
 FOREACH role_name IN ARRAY ARRAY[jobs_owner,journal_owner,app_role] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN problems:=problems||format('role %s is missing',role_name); END IF;
 END LOOP;
 FOREACH signature IN ARRAY manifest LOOP
  IF to_regprocedure(signature) IS NULL THEN problems:=problems||format('%s is missing',signature); END IF;
 END LOOP;
 IF to_regclass('public.pwa_job_runs') IS NULL THEN problems:=problems||'public.pwa_job_runs is missing'; END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V94 preflight: %', array_to_string(problems,'; '); END IF;
 -- Expected ownership (V88: jobs owner holds the table and its RPC; V83/V90: the journal owner holds the two definer submits).
 IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_job_runs'::regclass)<>jobs_owner THEN problems:=problems||format('public.pwa_job_runs is not owned by %s',jobs_owner); END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_job_run_v1(text,date,text)'::regprocedure)<>jobs_owner THEN problems:=problems||format('pwa_job_run_v1 is not owned by %s',jobs_owner); END IF;
 FOREACH signature IN ARRAY ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_submit_agent_operation_v1(text)'] LOOP
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=signature::regprocedure)<>journal_owner THEN problems:=problems||format('%s is not owned by %s',signature,journal_owner); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Each replaced object is written as an inheriting member of its owner, or under SET ROLE to the owner;
  -- CREATE OR REPLACE FUNCTION always needs CREATE on public for the role that runs it.
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by CREATE OR REPLACE FUNCTION)',current_user); END IF;
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN (SELECT unnest(manifest[1:12])::regprocedure)
   UNION SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_job_runs'::regclass LOOP
   IF pg_has_role(current_user,r.owner,'USAGE') THEN CONTINUE; END IF;
   IF NOT pg_has_role(current_user,r.owner,'SET') THEN problems:=problems||format('%s holds neither inherited nor SET authority on %s (temporary maintenance membership required)',current_user,r.owner);
   ELSIF NOT has_schema_privilege(r.owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by CREATE OR REPLACE FUNCTION under SET ROLE; grant temporarily)',r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V94 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. DB-LOCK-02: the job journal keeps only the two states the atomic RPC can leave behind.
DO $jobs$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; jobs_owner text; runner text:=current_user; switched boolean:=false; bad bigint; leftover text;
BEGIN
 jobs_owner:='mw_jobs_owner_'||suffix;
 IF NOT pg_has_role(runner,jobs_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',jobs_owner); switched:=true; END IF;
 -- Data guard: every row must already be in the contract; anything else is reconciled by the operator first, never rewritten here.
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.pwa_job_runs'::regclass AND NOT attisdropped AND attname='lease_expires_at') THEN
  EXECUTE $guard$SELECT count(*) FROM public.pwa_job_runs WHERE state NOT IN ('pending','completed') OR lease_expires_at IS NOT NULL OR error_code IS NOT NULL$guard$ INTO bad;
 ELSE SELECT count(*) INTO bad FROM public.pwa_job_runs WHERE state NOT IN ('pending','completed'); END IF; -- re-run after the contract
 IF bad>0 THEN RAISE EXCEPTION 'V94 data guard: % pwa_job_runs row(s) outside the pending/completed contract (leased, uncertain or failed state, an open lease or an error code); reconcile them before this migration',bad; END IF;
 ALTER TABLE public.pwa_job_runs DROP CONSTRAINT IF EXISTS pwa_job_runs_check;
 ALTER TABLE public.pwa_job_runs DROP CONSTRAINT IF EXISTS pwa_job_runs_state_check;
 ALTER TABLE public.pwa_job_runs ADD CONSTRAINT pwa_job_runs_state_check CHECK(state IN ('pending','completed'));
 ALTER TABLE public.pwa_job_runs DROP COLUMN IF EXISTS lease_expires_at, DROP COLUMN IF EXISTS lease_generation, DROP COLUMN IF EXISTS error_code;
 SELECT string_agg(conname,', ') INTO leftover FROM pg_constraint WHERE conrelid='public.pwa_job_runs'::regclass AND pg_get_constraintdef(oid) ~ 'lease_|error_code|leased|uncertain|failed';
 IF leftover IS NOT NULL OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.pwa_job_runs'::regclass AND NOT attisdropped AND attname IN ('lease_expires_at','lease_generation','error_code')) THEN
  RAISE EXCEPTION 'V94: lease state survived on pwa_job_runs (%)',coalesce(leftover,'columns'); END IF;
 -- Same header, guards, owner (CREATE OR REPLACE keeps owner, ACL and comment), SECURITY DEFINER and search_path as V88;
 -- the leased step is gone: a run is pending until its single completing UPDATE commits, and a failure rolls the
 -- INSERT back with the financial work. Replay of a completed row is unchanged. Return shape unchanged (services/jobs/runner.mjs).
 EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.pwa_job_run_v1(job text,business_date date,scope text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE boundary timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'; r public.pwa_job_runs; affected bigint; started timestamptz;
BEGIN
 PERFORM public.pwa_worker_guard_v1('jobs');
 IF job IS NULL OR job NOT IN ('daily-charges','recent-analytics') OR business_date IS NULL OR NOT isfinite(business_date) OR scope IS NULL
 OR (job='daily-charges' AND scope<>'daily') OR (job='recent-analytics' AND scope !~ '^hour:(0[0-9]|1[0-9]|2[0-3])$') THEN RAISE EXCEPTION 'invalid_job'; END IF;
 IF business_date<>boundary::date OR (job='recent-analytics' AND scope<>'hour:'||to_char(boundary,'HH24')) THEN RAISE EXCEPTION 'job_boundary_changed'; END IF;
 INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state) VALUES(job,$2,scope,'pending') ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT r FROM public.pwa_job_runs j WHERE j.job_name=job AND j.business_date=$2 AND j.scope_key=scope FOR UPDATE;
 IF r.state='completed' THEN RETURN jsonb_build_object('enabled',true,'state','completed','replayed',true,'resultCount',r.result_count); END IF;
 IF r.state<>'pending' THEN RAISE EXCEPTION 'job_requires_reconciliation'; END IF;
 started:=clock_timestamp();
 IF job='daily-charges' THEN affected:=public.generate_due_charges($2); ELSE affected:=public.refresh_daily_analytics($2-1,$2); END IF;
 UPDATE public.pwa_job_runs SET state='completed',started_at=started,completed_at=clock_timestamp(),checkpoint=$2::text||'|'||scope,result_count=affected WHERE run_id=r.run_id;
 RETURN jsonb_build_object('enabled',true,'state','completed','replayed',false,'resultCount',affected);
END $$;
 $fn$;
 IF switched THEN RESET ROLE; END IF;
END $jobs$;
RESET ROLE;

-- 3. DB-LOCK-03: the inline advisory key hashtextextended(kind||':'||target,0) becomes pwa_lock_key_v1(kind,target)
-- (bit-identical, Test-StatementBatch.sql). Current text via pg_get_functiondef + exact-count replace (V84/V87/V92
-- pattern), so owner, SECURITY mode, search_path, ACL and comment are preserved. The two-integer request-id
-- advisory locks are a different key space and stay as they are.
DO $locks$
DECLARE runner text:=current_user; owner_role text; switched boolean; definition text; found integer; leaked text;
 site record;
 sites jsonb:=jsonb_build_array(
  jsonb_build_object('f','public.guard_cash_account()','n',1,'o',$t$hashtextextended('cash-account:'||OLD."Ref Cash Holder",0)$t$,'r',$t$public.pwa_lock_key_v1('cash-account',OLD."Ref Cash Holder")$t$),
  jsonb_build_object('f','public.guard_cash_account()','n',1,'o',$t$hashtextextended('cash-account:'||NEW."Ref Cash Holder",0)$t$,'r',$t$public.pwa_lock_key_v1('cash-account',NEW."Ref Cash Holder")$t$),
  jsonb_build_object('f','public.pwa_submit_operation_v2(text)','n',1,'o',$t$hashtextextended('borrower:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('borrower',target)$t$),
  jsonb_build_object('f','public.pwa_submit_operation_v2(text)','n',1,'o',$t$hashtextextended('borrower-name:'||lower(btrim(i->>'name')),0)$t$,'r',$t$public.pwa_lock_key_v1('borrower-name',lower(btrim(i->>'name')))$t$),
  jsonb_build_object('f','public.pwa_apply_loan_create_v2(text)','n',1,'o',$t$hashtextextended('loan:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('loan',target)$t$),
  jsonb_build_object('f','public.pwa_apply_charge_v2(text)','n',1,'o',$t$hashtextextended('charge:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('charge',target)$t$),
  jsonb_build_object('f','public.pwa_apply_expense_v2(text)','n',1,'o',$t$hashtextextended('expense:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('expense',target)$t$),
  jsonb_build_object('f','public.pwa_apply_management_v2(text)','n',1,'o',$t$hashtextextended('management:'||kind||':'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('management:'||kind,target)$t$),
  jsonb_build_object('f','public.pwa_apply_management_financial_v2(text)','n',1,'o',$t$hashtextextended('management:'||kind||':'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('management:'||kind,target)$t$),
  jsonb_build_object('f','public.pwa_apply_assessment_v2(text)','n',1,'o',$t$hashtextextended('management:assessment:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('management:assessment',target)$t$),
  jsonb_build_object('f','public.pwa_apply_analytics_v2(text)','n',1,'o',$t$hashtextextended('management:analytics:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('management:analytics',target)$t$),
  jsonb_build_object('f','public.pwa_submit_agent_operation_v1(text)','n',1,'o',$t$hashtextextended('allocation:'||target,0)$t$,'r',$t$public.pwa_lock_key_v1('allocation',target)$t$));
BEGIN
 FOR site IN SELECT value->>'f' AS f,(value->>'n')::integer AS n,value->>'o' AS o,value->>'r' AS r FROM jsonb_array_elements(sites) LOOP
  SELECT pg_get_functiondef(site.f::regprocedure),pg_get_userbyid(proowner) INTO STRICT definition,owner_role FROM pg_proc WHERE oid=site.f::regprocedure;
  found:=(length(definition)-length(replace(definition,site.o,'')))/length(site.o);
  IF found=0 AND strpos(definition,site.r)>0 THEN CONTINUE; END IF; -- already replaced (re-run)
  IF found<>site.n THEN RAISE EXCEPTION 'V94: % occurrence(s) of the advisory-key expression in %, expected %',found,site.f,site.n; END IF;
  switched:=false;
  IF NOT pg_has_role(runner,owner_role,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',owner_role); switched:=true; END IF;
  EXECUTE replace(definition,site.o,site.r);
  IF switched THEN RESET ROLE; END IF;
 END LOOP;
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO leaked FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosrc LIKE '%hashtextextended(%' AND p.oid<>'public.pwa_lock_key_v1(text,text)'::regprocedure;
 IF leaked IS NOT NULL THEN RAISE EXCEPTION 'V94: inline advisory key still present in %',leaked; END IF;
END $locks$;
RESET ROLE;

-- 4. Owner decision (R067): a payment-input correction by a role that cannot execute the correction core
-- (the reviewer DML roles) fails closed with a named reason, SQLSTATE 42501, and nothing is written. The
-- capability (mw_app_<env>, V83 grant) and the governed command path keep their behaviour; no grant changes.
-- Metadata-only updates (unchanged payment_inputs) still pass through. Body = V83 plus the one check.
CREATE OR REPLACE FUNCTION public.payment_crud_prepare() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Payment key cannot be changed';END IF;
 IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD) THEN RETURN NEW;END IF;
 IF NOT has_function_privilege(current_user,'public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)','EXECUTE') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payment input corrections require the native payment command';END IF;
 RETURN public.payment_crud_prepare_core_v83(OLD,CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END,TG_OP);
END $$;
