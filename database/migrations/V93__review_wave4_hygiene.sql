-- R064 W4 hygiene: DB-ACCESS-08 (ledger definer), DB-AGENTDB-02 (agent grants in history),
-- DB-SCHEMA-02 (blank-ref normalizer fires first), DB-SCHEMA-03 (four FK indexes),
-- DB-LOCK-03 (shared advisory key), DB-PERF-04 (pg_stat_statements). Additive; every
-- statement is transactional and re-runnable (a second apply only reports "already exists").
-- Operator provisions mw_ledger_owner_<env> before this migration (CI: Test-AppRolePrerequisites.sql);
-- no LOGIN, no membership, no runtime activation here. On Cloud SQL the runner is not a
-- superuser: the preflight below names every missing authority instead of failing midway
-- (A-design §9: temporary SET/INHERIT membership and CREATE on public for the ledger owner).

-- 1. Preflight. Fails closed with the complete list of missing roles/authorities.
DO $preflight$
DECLARE suffix text; ledger_owner text; app_role text; journal_owner text; problems text[]:='{}'; sync_owner oid;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 ledger_owner:='mw_ledger_owner_'||suffix; app_role:='mw_app_'||suffix; journal_owner:='mw_app_'||suffix||'_journal_owner';
 -- The ledger owner exists, is NOLOGIN/unprivileged and inherits nothing (V88 pattern).
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=ledger_owner AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
  problems:=problems||format('role %s is missing or unsafe (expected NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS)',ledger_owner);
 ELSE
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=ledger_owner::regrole) THEN problems:=problems||format('%s must be a member of no role',ledger_owner); END IF;
  -- Only the migration runner may hold membership in the ledger owner (Cloud SQL records the creator's
  -- implicit ADMIN grant; temporary maintenance authority is granted to the runner and removed afterwards).
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=ledger_owner::regrole AND member NOT IN (session_user::regrole,current_user::regrole)) THEN
   problems:=problems||format('%s must be granted to no role other than the migration runner',ledger_owner); END IF;
 END IF;
 FOREACH app_role IN ARRAY ARRAY['mw_app_'||suffix,journal_owner,'mw_business_audit_owner'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN problems:=problems||format('role %s is missing',app_role); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- ALTER FUNCTION ... OWNER needs: current ownership, SET ROLE to the new owner, CREATE on the schema for the new owner.
  SELECT proowner INTO sync_owner FROM pg_proc WHERE oid=to_regprocedure('public.sync_cash_ledger(text,text)');
  IF sync_owner IS NULL THEN problems:=problems||'public.sync_cash_ledger(text,text) is missing';
  ELSIF NOT pg_has_role(current_user,sync_owner,'USAGE') THEN problems:=problems||format('%s lacks the privileges of %s, the current owner of sync_cash_ledger',current_user,pg_get_userbyid(sync_owner)); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=ledger_owner) THEN
   IF NOT pg_has_role(current_user,ledger_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,ledger_owner); END IF;
   IF NOT has_schema_privilege(ledger_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',ledger_owner); END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_business_audit_owner') AND NOT (pg_has_role(current_user,'mw_business_audit_owner','USAGE') OR pg_has_role(current_user,'mw_business_audit_owner','SET')) THEN
   problems:=problems||format('%s holds neither inherited nor SET authority on mw_business_audit_owner (agent_audit grants)',current_user); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V93 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. DB-ACCESS-08: the ledger projection runs as its owner. Body = V23 byte-for-byte except the
-- header and the four row locks (the AFTER ROW trigger already holds the source row lock in this
-- transaction, and a definer without UPDATE on the sources could not take FOR UPDATE).
CREATE OR REPLACE FUNCTION public.sync_cash_ledger(p_type text,p_id text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d date; amount numeric; from_holder text; to_holder text; movement text; source_key text; actor text;
 payment_id text; loan_id text; expense_id text; settlement_id text; from_account text; to_account text;
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Cash synchronization requires a source trigger'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=p_type AND source_row_id=p_id) THEN RETURN; END IF;
 CASE p_type
 WHEN 'Payment' THEN
  SELECT "Payment Date","Amount Received"::numeric,"Ref Received By Cash Holder","Created By","Ref Received By Cash Account"
   INTO d,amount,to_holder,actor,to_account FROM public."Payments" WHERE "Row ID"=p_id AND "Status"='Posted';
  movement:='Payment Receipt'; source_key:='PAYMENT:'||p_id; payment_id:=p_id;
 WHEN 'Loan' THEN
  SELECT "Loan Date","Principal Amount"::numeric,"Ref Disbursed From Cash Account" INTO d,amount,from_account FROM public."Loans" WHERE "Row ID"=p_id;
  movement:='Loan Disbursement'; source_key:='LOAN:'||p_id; loan_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Business Expense' THEN
  SELECT "Expense Date",abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,
   CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Holder" END,"Created By",
   CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Account" END, CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Account" END INTO d,amount,from_holder,to_holder,actor,from_account,to_account FROM public."Business Expenses" WHERE "Row ID"=p_id;
  IF coalesce(from_holder,to_holder) IS NULL THEN amount:=NULL; END IF;
  movement:='Business Expense'; source_key:='EXPENSE:'||p_id; expense_id:=p_id;
 WHEN 'Settlement' THEN
  SELECT "Transfer Date","Amount"::numeric,"Ref Paid From Cash Account" INTO d,amount,from_account FROM public."Settlements" WHERE "Row ID"=p_id AND "Status"='Completed';
  movement:='Partner Settlement'; source_key:='SETTLEMENT:'||p_id; settlement_id:=p_id; from_holder:='ch:lisa';
 ELSE RAISE EXCEPTION 'Unsupported cash source';
 END CASE;
 IF amount IS NULL THEN
  -- Derived projection follows source qualification, never a manual deletion path.
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=p_type AND "Source Key"=source_key;
  RETURN;
 END IF;
 IF d IS NULL THEN RAISE EXCEPTION 'Qualifying cash source requires its effective movement date'; END IF;
 INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder",
  "Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement","Entry Origin","Source Type","Source Key","Created By","Ref From Cash Account","Ref To Cash Account")
 VALUES('cash:'||source_key,d,movement,amount,from_holder,to_holder,payment_id,loan_id,expense_id,settlement_id,'System',p_type,source_key,coalesce(nullif(actor,''),'SQL'),from_account,to_account)
 ON CONFLICT ("Source Type","Source Key") WHERE "Entry Origin"='System' DO UPDATE SET
  "Movement Date"=EXCLUDED."Movement Date","Amount"=EXCLUDED."Amount",
  "Ref From Cash Holder"=EXCLUDED."Ref From Cash Holder","Ref To Cash Holder"=EXCLUDED."Ref To Cash Holder","Ref From Cash Account"=EXCLUDED."Ref From Cash Account","Ref To Cash Account"=EXCLUDED."Ref To Cash Account"
 WHERE ("Cash Ledger"."Movement Date","Cash Ledger"."Amount","Cash Ledger"."Ref From Cash Holder","Cash Ledger"."Ref To Cash Holder","Cash Ledger"."Ref From Cash Account","Cash Ledger"."Ref To Cash Account")
  IS DISTINCT FROM (EXCLUDED."Movement Date",EXCLUDED."Amount",EXCLUDED."Ref From Cash Holder",EXCLUDED."Ref To Cash Holder",EXCLUDED."Ref From Cash Account",EXCLUDED."Ref To Cash Account");
END $$;

DO $ledger$ DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; ledger_owner text; app_role text; journal_owner text; r text; BEGIN
 ledger_owner:='mw_ledger_owner_'||suffix; app_role:='mw_app_'||suffix; journal_owner:='mw_app_'||suffix||'_journal_owner';
 -- EXECUTE ACL first, while the runner still owns the function (the ACL survives the owner change).
 -- Callers are the roles that write cash sources: the application capability (journal owner and the
 -- command IAM user inherit it), the reviewer DML roles and the migration runner itself (operator
 -- restatements run as the runner, which is not a superuser on Cloud SQL). Direct calls stay blocked
 -- by pg_trigger_depth.
 REVOKE ALL ON FUNCTION public.sync_cash_ledger(text,text) FROM PUBLIC;
 FOREACH r IN ARRAY ARRAY[app_role,'mw_reviewer_dml','mw_reviewer_dml_dev',current_user::text] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.sync_cash_ledger(text,text) TO %I',r); END IF;
 END LOOP;
 -- Non-superuser runner (Cloud SQL postgres): needs SET on the ledger owner, and the ledger owner needs
 -- CREATE on public for this statement only (temporary authority opened/restored by the operator path).
 EXECUTE format('ALTER FUNCTION public.sync_cash_ledger(text,text) OWNER TO %I',ledger_owner);
 -- What the definer body and the Cash Ledger BEFORE/AFTER row triggers touch at depth>=2.
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',ledger_owner);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public."Cash Ledger" TO %I',ledger_owner);
 EXECUTE format('GRANT SELECT ON public."Payments",public."Loans",public."Business Expenses",public."Settlements",public."Cash Accounts",public."Cash Holders",public.r005_cash_cutover_sources,public.r008_cash_account_cutover TO %I',ledger_owner);
 -- guard_ledger_cash_accounts -> cash_account_holder() takes FOR SHARE on both tables, which needs UPDATE on
 -- one column; labels confer no routing authority (same lock-only pattern as the reviewer role).
 EXECUTE format('GRANT UPDATE ("Account Label") ON public."Cash Accounts" TO %I',ledger_owner);
 EXECUTE format('GRANT UPDATE ("Holder Name") ON public."Cash Holders" TO %I',ledger_owner);
 -- a000_r051_history_account (V72) restates an account's opening when a historical system entry
 -- (no explicit account) is updated or deleted through the projection; it runs at depth>=2 as the
 -- definer, so the owner needs exactly those two columns. The capability keeps r008 read-only.
 EXECUTE format('GRANT UPDATE ("Notes","Opening Balance") ON public.r008_cash_account_cutover TO %I',ledger_owner);
 -- Governed commands keep writing the ledger as the journal owner (V85 cash movements, V83 payment
 -- corrections); until now that came through the capability's operator grants, which V93 removes.
 EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public."Cash Ledger" TO %I',journal_owner);
 -- No direct ledger writes for the runtime capability or the reviewer roles.
 FOREACH r IN ARRAY ARRAY[app_role,'mw_reviewer_dml','mw_reviewer_dml_dev'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."Cash Ledger" FROM %I',r); END IF;
 END LOOP;
 -- REVOKE removes only privileges this runner (the table owner) granted; a grant recorded under another
 -- grantor would survive with a WARNING, so assert the result instead of trusting the statement.
 FOREACH r IN ARRAY ARRAY[app_role,'mw_reviewer_dml','mw_reviewer_dml_dev'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) AND EXISTS(SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(r,'public."Cash Ledger"',p)) THEN
   RAISE EXCEPTION 'Direct Cash Ledger write privilege remains for % (foreign grantor?)',r; END IF;
 END LOOP;
 -- Reviewer payment edits run payment_crud_prepare_core_v83, which row-locks the payment's ledger
 -- rows (FOR UPDATE NOWAIT needs UPDATE on one column). "Created At" is immutable in guard_cash_ledger,
 -- so this is a lock-only privilege (same pattern as the reviewer's Cash Accounts/Cash Holders grants).
 FOREACH r IN ARRAY ARRAY['mw_reviewer_dml','mw_reviewer_dml_dev'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('GRANT UPDATE ("Created At") ON public."Cash Ledger" TO %I',r); END IF;
 END LOOP;
END $ledger$;

-- 3. DB-AGENTDB-02: the business-side agent grants formerly in integration-agent/database/setup/business-grants.sql.
DO $agent$ DECLARE r text; BEGIN
 -- Objects are owned by mw_business_audit_owner (V33). The runner grants as an inheriting member, or
 -- switches role when it only holds SET; anything else is a provisioning gap, not something to work around.
 IF pg_has_role(current_user,'mw_business_audit_owner','USAGE') THEN NULL;
 ELSIF pg_has_role(current_user,'mw_business_audit_owner','SET') THEN SET LOCAL ROLE mw_business_audit_owner;
 ELSE RAISE EXCEPTION 'Runner needs inherited or SET authority on mw_business_audit_owner'; END IF;
 FOREACH r IN ARRAY ARRAY['mw_reviewer_dml','mw_reviewer_dml_dev'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT USAGE ON SCHEMA agent_audit TO %I',r);
   EXECUTE format('GRANT EXECUTE ON FUNCTION agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text) TO %I',r);
   EXECUTE format('GRANT SELECT ON agent_audit.commits,agent_audit.row_changes TO %I',r);
  END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['mw_agent_relay','mw_agent_auditor'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT USAGE ON SCHEMA agent_audit TO %I',r);
   EXECUTE format('GRANT SELECT ON agent_audit.commits,agent_audit.row_changes,agent_audit.exports TO %I',r);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_agent_relay') THEN GRANT INSERT ON agent_audit.exports TO mw_agent_relay; END IF;
END $agent$;
RESET ROLE;

-- 4. DB-SCHEMA-02: the blank-ref normalizer precedes every BEFORE ROW guard (name order is the firing order).
DO $rename$ DECLARE t regclass; BEGIN
 FOR t IN SELECT tgrelid FROM pg_trigger WHERE tgname='appsheet_blank_refs' AND NOT tgisinternal ORDER BY tgrelid::regclass::text LOOP
  EXECUTE format('ALTER TRIGGER appsheet_blank_refs ON %s RENAME TO a000_blank_refs',t);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='appsheet_blank_refs') THEN RAISE EXCEPTION 'Blank-ref trigger rename incomplete'; END IF;
END $rename$;

-- 5. DB-SCHEMA-03: leading-column indexes for the four FK columns that parent updates/deletes scan.
CREATE INDEX IF NOT EXISTS allocations_charge_idx ON public."Payment Allocations" ("Ref Charge");
CREATE INDEX IF NOT EXISTS repayments_allocation_idx ON public."Repayments" ("Ref Payment Allocation");
CREATE INDEX IF NOT EXISTS cash_ledger_payment ON public."Cash Ledger" ("Ref Payment");
CREATE INDEX IF NOT EXISTS settlements_partner_idx ON public."Settlements" ("Ref Partner");

-- 6. DB-LOCK-03: one derivation of the per-database advisory key for SQL and Node.
-- Identical to the inline form hashtextextended(kind||':'||target,0); STRICT keeps the NULL behaviour.
CREATE OR REPLACE FUNCTION public.pwa_lock_key_v1(kind text, target text) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT pg_catalog.hashtextextended(kind OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) target, 0)
$$;
COMMENT ON FUNCTION public.pwa_lock_key_v1(text,text) IS 'Advisory lock key: hashtextextended(kind||'':''||target,0). Shared by SQL and services/business/borrowers.mjs.';

-- SQL bodies keep the proven-identical inline expression for now (A-design §9.2): rewriting the
-- journal-owned pwa_submit_operation_v2 would need journal-owner authority in every environment.

-- 7. DB-PERF-04: query telemetry. CREATE EXTENSION succeeds without the preload; the view only
-- reads once shared_preload_libraries includes it (Cloud SQL preloads it by default). A schema of
-- its own keeps the generated public-functions dump, the dictionary and the capability policy clean.
DO $stats$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_stat_statements') THEN
  BEGIN
   CREATE SCHEMA IF NOT EXISTS monitoring;
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA monitoring;
  EXCEPTION WHEN insufficient_privilege THEN
   -- Cloud SQL postgres (cloudsqlsuperuser) and the CI superuser may create it; a plain rehearsal operator may not.
   RAISE NOTICE 'pg_stat_statements not created: %',SQLERRM;
  END;
 ELSE RAISE NOTICE 'pg_stat_statements is not available on this server; skipped'; END IF;
END $stats$;
