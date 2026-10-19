-- DB-CI-05 / DB-ACCESS-02: the migration-owned access matrix at the migration
-- head, in a disposable cluster created with Test-AgentAuditPrerequisites.sql,
-- Test-AppRolePrerequisites.sql and Test-IamRolePrerequisites.sql (the DEV IAM
-- database users exist before migrations, as in Cloud SQL). Operator-provisioned
-- DEV table grants to mw_app_dev are not migration-owned and are recorded live in
-- Environment_Inventory.md instead. A new migration that changes a grant must
-- update the expected lists below in the same change.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.am_diff(label text, unexpected text[], missing text[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF cardinality(unexpected)>0 OR cardinality(missing)>0 THEN
  RAISE EXCEPTION 'Access matrix % differs; unexpected: %; missing: %',label,coalesce(unexpected,'{}'),coalesce(missing,'{}');
 END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'mw-credit-app-%-dev@clever-oasis-508610-n7.iam')<>4 THEN
  RAISE EXCEPTION 'Access matrix needs Test-IamRolePrerequisites.sql before migrations';
 END IF;
END $$;

-- 1. Table/view privileges held by any role other than the migration owner.
CREATE TEMP TABLE am_expected_tables(grantee text, relation text, privileges text) ON COMMIT DROP;
INSERT INTO am_expected_tables VALUES
  ('mw_agent_auditor','agent_audit.commits','SELECT'),
  ('mw_agent_auditor','agent_audit.exports','SELECT'),
  ('mw_agent_auditor','agent_audit.row_changes','SELECT'),
  ('mw_agent_relay','agent_audit.commits','SELECT'),
  ('mw_agent_relay','agent_audit.exports','INSERT,SELECT'),
  ('mw_agent_relay','agent_audit.row_changes','SELECT'),
  ('mw_app_dev_journal_owner','public.Cash Ledger','DELETE,INSERT,UPDATE'),
  ('mw_app_dev_journal_owner','public.pwa_payment_commands','INSERT,SELECT'),
  ('mw_app_dev_journal_owner','public.r008_cash_account_cutover','INSERT'),
  ('mw_business_audit_owner','agent_audit.commits','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_changes_owner_dev','public.pwa_row_changes','DELETE,INSERT,SELECT'),
  ('mw_app_dev','public.pwa_row_changes','SELECT'),
  ('mw_business_audit_owner','agent_audit.exports','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_business_audit_owner','agent_audit.row_changes','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_jobs_owner_dev','public.pwa_job_runs','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_ledger_owner_dev','public.Business Expenses','SELECT'),
  ('mw_ledger_owner_dev','public.Cash Accounts','SELECT'),
  ('mw_ledger_owner_dev','public.Cash Holders','SELECT'),
  ('mw_ledger_owner_dev','public.Cash Ledger','DELETE,INSERT,SELECT,UPDATE'),
  ('mw_ledger_owner_dev','public.Loans','SELECT'),
  ('mw_ledger_owner_dev','public.Payments','SELECT'),
  ('mw_ledger_owner_dev','public.Settlements','SELECT'),
  ('mw_ledger_owner_dev','public.r005_cash_cutover_sources','SELECT'),
  ('mw_ledger_owner_dev','public.r008_cash_account_cutover','SELECT'),
  ('mw_notify_owner_dev','public.pwa_notification_deliveries','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_notify_owner_dev','public.pwa_notification_events','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_notify_owner_dev','public.pwa_notification_preferences','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_notify_owner_dev','public.pwa_push_subscriptions','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_reviewer_dml','agent_audit.commits','SELECT'),
  ('mw_reviewer_dml','agent_audit.row_changes','SELECT');
CREATE TEMP VIEW am_actual_tables AS
 SELECT g.rolname::text AS grantee, n.nspname||'.'||c.relname AS relation, string_agg(a.privilege_type,',' ORDER BY a.privilege_type) AS privileges
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a JOIN pg_roles g ON g.oid=a.grantee
 WHERE n.nspname IN ('public','agent_audit','assessment_lab') AND c.relkind IN ('r','v','m','p','f') AND g.rolname<>'postgres'
 GROUP BY g.rolname,n.nspname,c.relname;
SELECT pg_temp.am_diff('table grants',
 ARRAY(SELECT format('%s %s %s',grantee,relation,privileges) FROM (SELECT * FROM am_actual_tables EXCEPT SELECT * FROM am_expected_tables) x ORDER BY 1),
 ARRAY(SELECT format('%s %s %s',grantee,relation,privileges) FROM (SELECT * FROM am_expected_tables EXCEPT SELECT * FROM am_actual_tables) x ORDER BY 1));

-- 2. EXECUTE: every non-owner grant, plus PUBLIC on pwa_* (other PUBLIC helpers
--    are PostgreSQL's default for trigger/internal functions and are not listed).
CREATE TEMP TABLE am_expected_routines(grantee text, routine text) ON COMMIT DROP;
INSERT INTO am_expected_routines VALUES
  ('PUBLIC','pwa_borrower_version_v2(text)'),
  ('PUBLIC','pwa_charge_version_v2(text)'),
  ('PUBLIC','pwa_effective_payment_plan_v2(text)'),
  ('PUBLIC','pwa_loan_version_v2(text)'),
  ('PUBLIC','pwa_lock_key_v1(text,text)'),
  ('PUBLIC','pwa_plan_effects_v83(jsonb)'),
  ('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','pwa_submit_agent_operation_v1(text)'),
  ('mw_app_dev','apply_loan_close_calculation_v83(text,date,text)'),
  ('mw_app_dev','payment_crud_finish_core_v83("Payments","Payments",text)'),
  ('mw_app_dev','payment_crud_prepare_core_v83("Payments","Payments",text)'),
  ('mw_app_dev','pwa_cash_opening_basis_v2(text)'),
  ('mw_app_dev','pwa_expense_version_v2(text)'),
  ('mw_app_dev','pwa_native_inverse_permitted_v2(text)'),
  ('mw_app_dev','pwa_payment_correction_text_v2(jsonb)'),
  ('mw_app_dev','pwa_payment_head_v2(text)'),
  ('mw_app_dev','pwa_payment_version_v2(text)'),
  ('mw_app_dev','pwa_preference_version_v2(text)'),
  ('mw_app_dev','sync_cash_ledger(text,text)'),
  ('mw_app_dev_journal_owner','pwa_agent_receipt_status_v1(uuid,text,text)'),
  ('mw_app_dev_journal_owner','pwa_apply_analytics_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_assessment_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_cash_opening_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_charge_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_expense_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_loan_close_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_loan_create_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_loan_source_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_management_financial_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_management_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_payment_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_apply_preference_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_assessment_refresh_window_v2(date,date,date)'),
  ('mw_app_dev_journal_owner','pwa_cash_opening_basis_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_command_status_v1(uuid,text,text)'),
  ('mw_app_dev_journal_owner','pwa_management_financial_text_v2(text,jsonb)'),
  ('mw_app_dev_journal_owner','pwa_management_input_text_v2(text,jsonb)'),
  ('mw_app_dev_journal_owner','pwa_management_tools_text_v2(text,jsonb)'),
  ('mw_app_dev_journal_owner','pwa_operation_status_v2(uuid,text,text)'),
  ('mw_app_dev_journal_owner','pwa_submit_agent_operation_v1(text)'),
  ('mw_app_dev_journal_owner','pwa_submit_agent_receipt_v1(text)'),
  ('mw_app_dev_journal_owner','pwa_submit_operation_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_submit_selected_charges_v1(text)'),
  ('mw_business_audit_owner','agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)'),
  ('mw_business_audit_owner','agent_audit.capture_change()'),
  ('mw_business_audit_owner','agent_audit.reject_rewrite()'),
  ('mw_changes_owner_dev','pwa_row_changes_prune_v1()'),
  ('mw_changes_owner_dev','pwa_track_row_change()'),
  ('mw_jobs_dev','pwa_job_run_v1(text,date,text)'),
  ('mw_jobs_owner_dev','pwa_job_run_v1(text,date,text)'),
  ('mw_jobs_owner_dev','pwa_row_changes_prune_v1()'),
  ('mw_jobs_owner_dev','pwa_worker_guard_v1(text)'),
  ('mw_ledger_owner_dev','sync_cash_ledger(text,text)'),
  ('mw_notify_api_dev','pwa_notify_history_v1(jsonb,timestamp with time zone,uuid)'),
  ('mw_notify_api_dev','pwa_notify_preference_v1(jsonb,boolean)'),
  ('mw_notify_api_dev','pwa_notify_revoke_v1(jsonb,uuid)'),
  ('mw_notify_api_dev','pwa_notify_status_v1(jsonb,text)'),
  ('mw_notify_api_dev','pwa_notify_subscribe_v1(jsonb,jsonb)'),
  ('mw_notify_api_dev','pwa_notify_target_v1(jsonb,uuid)'),
  ('mw_notify_dispatch_dev','pwa_claim_notifications_v1(integer,integer)'),
  ('mw_notify_dispatch_dev','pwa_notify_candidates_v1(integer)'),
  ('mw_notify_dispatch_dev','pwa_notify_complete_v1(uuid,bigint,text)'),
  ('mw_notify_dispatch_dev','pwa_notify_enqueue_v1(uuid,uuid,bigint,boolean)'),
  ('mw_notify_dispatch_dev','pwa_notify_prepare_send_v1(uuid,bigint)'),
  ('mw_notify_dispatch_dev','pwa_notify_start_send_v1(uuid,bigint,bigint)'),
  ('mw_notify_owner_dev','pwa_capture_notification_v1()'),
  ('mw_notify_owner_dev','pwa_claim_notifications_v1(integer,integer)'),
  ('mw_notify_owner_dev','pwa_notify_actor_v1(jsonb)'),
  ('mw_notify_owner_dev','pwa_notify_candidates_v1(integer)'),
  ('mw_notify_owner_dev','pwa_notify_complete_v1(uuid,bigint,text)'),
  ('mw_notify_owner_dev','pwa_notify_eligible_v1(uuid,uuid)'),
  ('mw_notify_owner_dev','pwa_notify_enqueue_v1(uuid,uuid,bigint,boolean)'),
  ('mw_notify_owner_dev','pwa_notify_history_v1(jsonb,timestamp with time zone,uuid)'),
  ('mw_notify_owner_dev','pwa_notify_preference_v1(jsonb,boolean)'),
  ('mw_notify_owner_dev','pwa_notify_prepare_send_v1(uuid,bigint)'),
  ('mw_notify_owner_dev','pwa_notify_revoke_v1(jsonb,uuid)'),
  ('mw_notify_owner_dev','pwa_notify_start_send_v1(uuid,bigint,bigint)'),
  ('mw_notify_owner_dev','pwa_notify_status_v1(jsonb,text)'),
  ('mw_notify_owner_dev','pwa_notify_subscribe_v1(jsonb,jsonb)'),
  ('mw_notify_owner_dev','pwa_notify_target_v1(jsonb,uuid)'),
  ('mw_notify_owner_dev','pwa_worker_guard_v1(text)'),
  ('mw_reviewer_dml','agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)'),
  ('mw_reviewer_dml','sync_cash_ledger(text,text)');
CREATE TEMP VIEW am_actual_routines AS
 SELECT coalesce(g.rolname::text,'PUBLIC') AS grantee, p.oid::regprocedure::text AS routine
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles g ON g.oid=a.grantee
 WHERE n.nspname IN ('public','agent_audit') AND a.privilege_type='EXECUTE'
   AND coalesce(g.rolname::text,'PUBLIC')<>'postgres' AND (a.grantee<>0 OR p.proname LIKE 'pwa\_%');
SELECT pg_temp.am_diff('routine grants',
 ARRAY(SELECT format('%s %s',grantee,routine) FROM (SELECT * FROM am_actual_routines EXCEPT SELECT * FROM am_expected_routines) x ORDER BY 1),
 ARRAY(SELECT format('%s %s',grantee,routine) FROM (SELECT * FROM am_expected_routines EXCEPT SELECT * FROM am_actual_routines) x ORDER BY 1));

-- 3. Role memberships among application roles.
CREATE TEMP TABLE am_expected_members(member text, granted text, inherit_option boolean, set_option boolean) ON COMMIT DROP;
INSERT INTO am_expected_members VALUES
  ('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','mw_app_dev',true,false),
  ('mw_app_dev_journal_owner','mw_app_dev',true,true),
  ('postgres','mw_business_audit_owner',true,true);
CREATE TEMP VIEW am_actual_members AS
 SELECT r.rolname::text AS member, g.rolname::text AS granted, m.inherit_option, m.set_option
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid
 WHERE r.rolname NOT LIKE 'pg\_%';
SELECT pg_temp.am_diff('memberships',
 ARRAY(SELECT format('%s>%s %s/%s',member,granted,inherit_option,set_option) FROM (SELECT * FROM am_actual_members EXCEPT SELECT * FROM am_expected_members) x ORDER BY 1),
 ARRAY(SELECT format('%s>%s %s/%s',member,granted,inherit_option,set_option) FROM (SELECT * FROM am_expected_members EXCEPT SELECT * FROM am_actual_members) x ORDER BY 1));

-- 4. Effective-privilege spot checks for the rules the review relied on.
DO $$ BEGIN
 -- The disposable postgres is a superuser; in Cloud SQL it is not, so check its ACL entry.
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='public.pwa_notification_events'::regclass AND a.grantee='postgres'::regrole) THEN
  RAISE EXCEPTION 'postgres must not hold a direct grant on notification events'; END IF;
 IF has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_claim_notifications_v1(integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'command user must not claim notifications'; END IF;
 IF NOT has_function_privilege('mw_jobs_dev','public.pwa_job_run_v1(text,date,text)','EXECUTE') THEN RAISE EXCEPTION 'jobs role must run jobs'; END IF;
 IF has_function_privilege('mw-credit-app-read-dev@clever-oasis-508610-n7.iam','public.pwa_submit_operation_v2(text)','EXECUTE') THEN RAISE EXCEPTION 'read user must not submit operations'; END IF;
 -- V93 (DB-ACCESS-08): the ledger projection is the ledger owner's pinned definer; lock-only column
 -- grants (attacl, not listed in section 1) exist exactly where the design needs them; no
 -- migration-owned direct ledger write for the capability or the reviewer.
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='mw_ledger_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.sync_cash_ledger(text,text)'::regprocedure) THEN RAISE EXCEPTION 'sync_cash_ledger must be the ledger owner''s pinned definer'; END IF;
 IF has_function_privilege('mw-credit-app-read-dev@clever-oasis-508610-n7.iam','public.sync_cash_ledger(text,text)','EXECUTE') THEN RAISE EXCEPTION 'read user must not execute the ledger definer'; END IF;
 IF NOT has_column_privilege('mw_ledger_owner_dev','public."Cash Accounts"','Account Label','UPDATE') OR has_table_privilege('mw_ledger_owner_dev','public."Cash Accounts"','UPDATE')
  OR NOT has_column_privilege('mw_ledger_owner_dev','public."Cash Holders"','Holder Name','UPDATE') OR has_table_privilege('mw_ledger_owner_dev','public."Cash Holders"','UPDATE') THEN RAISE EXCEPTION 'ledger owner lock-only column grants differ'; END IF;
 IF NOT has_column_privilege('mw_ledger_owner_dev','public.r008_cash_account_cutover','Opening Balance','UPDATE') OR NOT has_column_privilege('mw_ledger_owner_dev','public.r008_cash_account_cutover','Notes','UPDATE')
  OR has_table_privilege('mw_ledger_owner_dev','public.r008_cash_account_cutover','UPDATE') OR has_any_column_privilege('mw_ledger_owner_dev','public.r008_cash_account_cutover','INSERT') THEN RAISE EXCEPTION 'ledger owner r008 opening restatement must be the two-column UPDATE only'; END IF;
 IF NOT has_column_privilege('mw_reviewer_dml','public."Cash Ledger"','Created At','UPDATE') OR has_table_privilege('mw_reviewer_dml','public."Cash Ledger"','UPDATE') THEN RAISE EXCEPTION 'reviewer must hold the lock-only Created At column grant and no table UPDATE'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['mw_app_dev','mw_reviewer_dml']) r CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE']) p WHERE has_table_privilege(r,'public."Cash Ledger"',p)) THEN RAISE EXCEPTION 'no migration-owned direct Cash Ledger write for the capability or the reviewer'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member='mw_ledger_owner_dev'::regrole OR roleid='mw_ledger_owner_dev'::regrole) THEN RAISE EXCEPTION 'ledger owner must hold and grant no membership'; END IF;
 -- V97 (R078): both change-log functions are the change owner's pinned definers; only the definer writes the log.
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.pwa_track_row_change()'::regprocedure,'public.pwa_row_changes_prune_v1()'::regprocedure)
   AND NOT (prosecdef AND pg_get_userbyid(proowner)='mw_changes_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig))) THEN RAISE EXCEPTION 'change-log functions must be the change owner''s pinned definers'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member='mw_changes_owner_dev'::regrole OR roleid='mw_changes_owner_dev'::regrole) THEN RAISE EXCEPTION 'change owner must hold and grant no membership'; END IF;
 -- V98: the capability (and the command user through it) reads the log and its sequence, SELECT only.
 IF NOT has_table_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_row_changes','SELECT') OR NOT has_sequence_privilege('mw_app_dev','public.pwa_row_changes_seq_seq','SELECT')
   OR has_sequence_privilege('mw_app_dev','public.pwa_row_changes_seq_seq','USAGE') OR has_sequence_privilege('mw_app_dev','public.pwa_row_changes_seq_seq','UPDATE') THEN RAISE EXCEPTION 'mw_app_dev must read pwa_row_changes and its sequence with SELECT only'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['mw_app_dev','mw_app_dev_journal_owner','mw_reviewer_dml','mw_jobs_owner_dev','mw_jobs_dev','mw_ledger_owner_dev','mw-credit-app-command-dev@clever-oasis-508610-n7.iam','mw-credit-app-read-dev@clever-oasis-508610-n7.iam']) r
   CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) p WHERE has_table_privilege(r,'public.pwa_row_changes',p)) THEN RAISE EXCEPTION 'no migration-owned direct pwa_row_changes write outside the change owner'; END IF;
END $$;
SELECT 'Access matrix regression passed' AS result;
ROLLBACK;
