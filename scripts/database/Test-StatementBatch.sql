\ir Test-DailyCashSnapshots.sql
\ir Test-FocusedStatements.sql
\ir Test-PaymentHealth.sql
\ir Test-ScheduleHealth.sql
\ir Test-BorrowerPages.sql
\ir Test-PrincipalDailyInterest.sql
\ir Test-OriginalDailyInterest.sql
\ir Test-Forecast.sql
\ir Test-SelectedCharges.sql
\ir Test-ReceiptUpload.sql
\ir Test-UpcomingCharges.sql
\ir Test-InterestReallocation.sql
\ir Test-PaymentCrud.sql
\ir Test-AppSheetReceiptDelete.sql
\ir Test-BusinessCrud.sql
\ir Test-HistoryAggregateParity.sql
\ir Test-ExpenseReimbursement.sql
\ir Test-ReceiptDeleteFlagMetadata.sql
\ir Test-LoanCorrections.sql
\ir Test-DailyTypeConversion.sql

-- Original GUI fixture seed/cleanup remains compatible with current derived snapshots.
\ir Test-UiFixtures.sql

\ir Test-DefaultInspection.sql
\ir Test-DefaultRepayment.sql
\ir Test-R051RelaxedPolicy.sql
\ir Test-TriggerPerformance.sql
-- V77 retires the rejected AppSheet experiment; native reverse Refs remain.
DO $$ BEGIN
 IF to_regclass('public.oltp_payment_related_ids_v1') IS NOT NULL THEN
  RAISE EXCEPTION 'Retired experimental related-ID view still exists';
 END IF;
END $$;
\ir Test-ApplePushEndpoints.sql
-- R063 W3 (DB-CI-02): previously unreachable regressions, fixtures updated to the
-- current cash-account and capital rules. Test-PaymentRollups chains
-- Test-BorrowerRollups -> Test-MaterializedBalances -> Test-AnalyticsRefresh.
\ir Test-LumpSum.sql
\ir Test-InterestScheduleAnchor.sql
\ir Test-PaymentRollups.sql
\ir Test-Partners.sql
\ir Test-BusinessExpenses.sql
-- R064 W4 (V93) hygiene assertions.
DO $$ BEGIN
 -- DB-SCHEMA-04: money text output is what the views and Node casts expect (C lc_monetary, "$" format).
 IF current_setting('lc_monetary')<>'C' OR 1234.5::money::text<>'$1,234.50' OR (-7)::money::numeric<>-7 OR 10::money::numeric::text<>'10.00' THEN
  RAISE EXCEPTION 'lc_monetary/money formatting changed: % %',current_setting('lc_monetary'),1234.5::money::text; END IF;
 -- DB-SCHEMA-03: the four FK indexes lead with the FK column.
 IF (SELECT count(*) FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
     WHERE (i.indexrelid::regclass::text,i.indrelid::regclass::text,a.attname) IN
      (('allocations_charge_idx','"Payment Allocations"','Ref Charge'),('repayments_allocation_idx','"Repayments"','Ref Payment Allocation'),
       ('cash_ledger_payment','"Cash Ledger"','Ref Payment'),('settlements_partner_idx','"Settlements"','Ref Partner')))<>4 THEN
  RAISE EXCEPTION 'V93 FK indexes missing'; END IF;
 -- DB-LOCK-03: pwa_lock_key_v1 equals the inline form used by the SQL bodies and by Node today.
 IF pwa_lock_key_v1('borrower','B-1')<>hashtextextended('borrower:'||'B-1',0)
  OR pwa_lock_key_v1('borrower-name',lower(btrim(' Ann ไทย ')))<>hashtextextended('borrower-name:'||lower(btrim(' Ann ไทย ')),0)
  OR pwa_lock_key_v1('cash-account','CI-LISA')<>hashtextextended('cash-account:'||'CI-LISA',0)
  OR pwa_lock_key_v1('borrower',NULL) IS NOT NULL OR pwa_lock_key_v1('borrower','B1')<>4085604855717338414 THEN
  RAISE EXCEPTION 'pwa_lock_key_v1 differs from the inline advisory-key form'; END IF;
 IF NOT (SELECT provolatile='i' AND proisstrict AND NOT prosecdef FROM pg_proc WHERE oid='public.pwa_lock_key_v1(text,text)'::regprocedure) THEN
  RAISE EXCEPTION 'pwa_lock_key_v1 must stay IMMUTABLE STRICT invoker'; END IF;
 -- DB-PERF-04: pg_stat_statements lives in schema monitoring wherever the module is installed; nothing of it in public.
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_stat_statements')
  AND NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_stat_statements' AND n.nspname='monitoring') THEN
  RAISE EXCEPTION 'pg_stat_statements is available but not created in schema monitoring'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pg_stat_statements%') THEN
  RAISE EXCEPTION 'pg_stat_statements objects leaked into public'; END IF;
END $$;
-- R067 (V94) contract assertions.
DO $$ DECLARE leaked text; BEGIN
 -- DB-LOCK-03: pwa_lock_key_v1 is the only public function that still spells the inline advisory key.
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO leaked FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosrc LIKE '%hashtextextended(%' AND p.oid<>'public.pwa_lock_key_v1(text,text)'::regprocedure;
 IF leaked IS NOT NULL THEN RAISE EXCEPTION 'inline advisory key still used by %',leaked; END IF;
 IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosrc LIKE '%pwa_lock_key_v1(%' AND p.oid<>'public.pwa_lock_key_v1(text,text)'::regprocedure)<>10 THEN
  RAISE EXCEPTION 'expected ten public functions to take their advisory key from pwa_lock_key_v1'; END IF;
 -- DB-LOCK-02: the job journal is pending/completed only; the lease columns are gone.
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.pwa_job_runs'::regclass AND NOT attisdropped AND attname IN ('lease_expires_at','lease_generation','error_code')) THEN
  RAISE EXCEPTION 'pwa_job_runs lease columns survived V94'; END IF;
 IF (SELECT string_agg(attname,',' ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.pwa_job_runs'::regclass AND attnum>0 AND NOT attisdropped)<>'run_id,job_name,business_date,scope_key,state,checkpoint,started_at,completed_at,result_count' THEN
  RAISE EXCEPTION 'pwa_job_runs column list changed'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_job_runs'::regclass AND conname='pwa_job_runs_state_check')<>$c$CHECK ((state = ANY (ARRAY['pending'::text, 'completed'::text])))$c$ THEN
  RAISE EXCEPTION 'pwa_job_runs state check must allow only pending and completed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pwa_job_runs'::regclass AND pg_get_constraintdef(oid) ~ 'lease|error_code|leased|uncertain|failed') THEN
  RAISE EXCEPTION 'lease-era constraint survived on pwa_job_runs'; END IF;
 IF position('leased' in (SELECT prosrc FROM pg_proc WHERE oid='public.pwa_job_run_v1(text,date,text)'::regprocedure))>0 THEN RAISE EXCEPTION 'pwa_job_run_v1 still leases'; END IF;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner) LIKE 'mw_jobs_owner_%' AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_job_run_v1(text,date,text)'::regprocedure) THEN
  RAISE EXCEPTION 'pwa_job_run_v1 lost its owner, definer mode or search_path'; END IF;
 -- Owner decision: the reviewer roles cannot execute the correction core; the capability still can.
 IF has_function_privilege('mw_reviewer_dml','public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)','EXECUTE') OR NOT has_function_privilege('mw_app_dev','public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)','EXECUTE') THEN
  RAISE EXCEPTION 'payment_crud_prepare_core_v83 EXECUTE changed'; END IF;
END $$;
-- DB-LOCK-02 behaviour at the head, rolled back: first run completes, second run replays the same row, a failing
-- run leaves no journal row, and the journal refuses every other state. Synthetic jobs login; the owner's table
-- reads are granted broadly here only because the operator policy provides the exact manifest live.
BEGIN;
CREATE ROLE ci_jobs_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_jobs_dev TO ci_jobs_login WITH INHERIT TRUE, SET FALSE;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO mw_jobs_owner_dev;
SET SESSION AUTHORIZATION ci_jobs_login;
DO $$ DECLARE d date:=(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date; scope text:='hour:'||to_char(clock_timestamp() AT TIME ZONE 'Asia/Bangkok','HH24'); first jsonb; second jsonb; failed boolean:=false; BEGIN
 first:=public.pwa_job_run_v1('daily-charges',d,'daily');
 IF first-'resultCount'<>jsonb_build_object('enabled',true,'state','completed','replayed',false) OR jsonb_typeof(first->'resultCount')<>'number' THEN RAISE EXCEPTION 'first job run result %',first; END IF;
 second:=public.pwa_job_run_v1('daily-charges',d,'daily');
 IF second<>first||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'replay result % after %',second,first; END IF;
 BEGIN PERFORM public.pwa_job_run_v1('recent-analytics',d,CASE WHEN scope='hour:00' THEN 'hour:23' ELSE 'hour:00' END); EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='job_boundary_changed'; END;
 IF NOT failed THEN RAISE EXCEPTION 'boundary guard missing'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ DECLARE j record; failed boolean:=false; BEGIN
 SELECT * INTO STRICT j FROM public.pwa_job_runs WHERE job_name='daily-charges';
 IF j.state<>'completed' OR j.started_at IS NULL OR j.completed_at<j.started_at OR j.checkpoint<>j.business_date::text||'|daily' OR j.result_count IS NULL THEN RAISE EXCEPTION 'completed journal row %',to_jsonb(j); END IF;
 FOREACH j.state IN ARRAY ARRAY['leased','uncertain','failed'] LOOP
  failed:=false;
  BEGIN INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state) VALUES('recent-analytics',j.business_date,j.state,j.state); EXCEPTION WHEN check_violation THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'journal accepted state %',j.state; END IF;
 END LOOP;
END $$;
-- A failing run (synthetic trigger) rolls back with the financial work: no journal row remains.
CREATE FUNCTION pg_temp.ci_job_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_job_failure'; END $$;
CREATE TRIGGER ci_job_failure BEFORE INSERT ON public."Daily Analytics" FOR EACH ROW EXECUTE FUNCTION pg_temp.ci_job_failure();
SET SESSION AUTHORIZATION ci_jobs_login;
DO $$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM public.pwa_job_run_v1('recent-analytics',(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date,'hour:'||to_char(clock_timestamp() AT TIME ZONE 'Asia/Bangkok','HH24')); EXCEPTION WHEN raise_exception THEN failed:=SQLERRM='synthetic_job_failure'; END;
 IF NOT failed THEN RAISE EXCEPTION 'synthetic failure did not surface'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.pwa_job_runs WHERE job_name='recent-analytics') THEN RAISE EXCEPTION 'failed run left a journal row'; END IF; END $$;
ROLLBACK;
-- R068 (V95) ALL-ARCH-03 and the DB-LOCK-03 Node follow-up.
DO $$ DECLARE raw text:=E'\tÉmile '; key_service bigint; key_submit bigint; submit_src text; sig text; src text; default_expr text;
 pair text:=$e$CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END$e$;
 -- The statement services/business/borrowers.mjs sends (tests/unit/borrower-lock-key.test.mjs pins the same text).
 node_sql text:=$n$SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,lower(btrim($2)))) WHERE nullif(btrim($2),'') IS NOT NULL$n$;
BEGIN
 -- Node computes the borrower-name key with the SQL text pwa_submit_operation_v2 uses, on the raw input: padded
 -- and non-ASCII names give the same key, and a blank name takes no lock on either side.
 EXECUTE $q$SELECT public.pwa_lock_key_v1($1,lower(btrim($2)))$q$ INTO key_service USING 'borrower-name',raw;
 EXECUTE $q$SELECT public.pwa_lock_key_v1('borrower-name',lower(btrim($1->>'name')))$q$ INTO key_submit USING jsonb_build_object('name',raw);
 IF key_service IS DISTINCT FROM key_submit OR key_service IS NULL THEN RAISE EXCEPTION 'Node and SQL borrower-name keys differ for %: % vs %',raw,key_service,key_submit; END IF;
 SELECT prosrc INTO submit_src FROM pg_proc WHERE oid='public.pwa_submit_operation_v2(text)'::regprocedure;
 IF position(replace(replace(node_sql,'$1',$l$'borrower-name'$l$),'$2',$l$i->>'name'$l$) in
   $s$SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower-name',lower(btrim(i->>'name')))) WHERE nullif(btrim(i->>'name'),'') IS NOT NULL$s$)<>1
  OR position($s$IF nullif(btrim(i->>'name'),'') IS NOT NULL THEN$s$ in submit_src)=0
  OR position($s$PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower-name',lower(btrim(i->>'name'))));$s$ in submit_src)=0 THEN
  RAISE EXCEPTION 'pwa_submit_operation_v2 borrower-name guard/key text differs from the Node statement'; END IF;
 IF (SELECT count(*) FROM (SELECT 1 WHERE nullif(btrim('   '),'') IS NOT NULL) x)<>0 THEN RAISE EXCEPTION 'blank-name guard must skip the lock'; END IF;
 -- ALL-ARCH-03: the three definers carry the role/session pair and no bare session_user check; the marker default is the effective role.
 FOREACH sig IN ARRAY ARRAY['agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)','agent_audit.capture_change()','public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)'] LOOP
  SELECT prosrc INTO src FROM pg_proc WHERE oid=sig::regprocedure;
  IF src LIKE '%session_user<>%' OR position(pair in src)=0 OR position('mw-integration-agent@clever-oasis-508610-n7.iam' in src)=0 THEN RAISE EXCEPTION '% lacks the V95 role/session pair',sig; END IF;
  IF NOT (SELECT prosecdef AND 'search_path=pg_catalog'=ANY(proconfig) FROM pg_proc WHERE oid=sig::regprocedure) THEN RAISE EXCEPTION '% lost its definer header',sig; END IF;
 END LOOP;
 IF position($s$effective_role='mw_reviewer_dml_dev' AND current_database()<>'loan_manager_prod'$s$ in (SELECT prosrc FROM pg_proc WHERE oid='agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'begin_operation must accept mw_reviewer_dml_dev outside PROD only'; END IF;
 SELECT regexp_replace(pg_get_expr(d.adbin,d.adrelid),'\s+',' ','g') INTO default_expr FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid='agent_audit.commits'::regclass AND a.attname='database_session_role';
 IF default_expr IS DISTINCT FROM $d$( CASE WHEN (current_setting('role'::text, true) = ANY (ARRAY['none'::text, ''::text])) THEN (SESSION_USER)::text ELSE current_setting('role'::text, true) END)::name$d$ THEN
  RAISE EXCEPTION 'commits.database_session_role default is %',default_expr; END IF;
 -- No grant or membership came with V95 (operator steps): the IAM user holds nothing in the chain.
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='mw-integration-agent@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION 'V95 must not grant memberships'; END IF;
END $$;
-- DB-SCHEMA-02: firing-order snapshot; DB-ACCESS-08: the ledger definer under the real roles.
\ir Test-TriggerOrder.sql
\ir Test-LedgerAccess.sql
-- V97 (R078): the PWA change log under the real roles (DML kinds, writer denial, retention).
\ir Test-RowChanges.sql
-- Last: the migration-owned grant matrix (DB-CI-05 / DB-ACCESS-02).
\ir Test-AccessMatrix.sql
