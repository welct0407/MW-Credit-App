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
 IF (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'mw-credit-app-%-dev@clever-oasis-508610-n7.iam')<>5 THEN
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
  ('mw_chat_owner_dev','public.pwa_chat_history','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_chat_owner_dev','public.pwa_chat_messages','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_chat_owner_dev','public.pwa_chat_proposals','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_chat_owner_dev','public.pwa_chat_threads','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
  ('mw_chat_owner_dev','public.pwa_chat_tool_calls','DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'),
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
  ('mw_app_dev','apply_loan_close_calculation_v83(text,date,text)'),
  ('mw_app_dev','payment_crud_finish_core_v83("Payments","Payments",text)'),
  ('mw_app_dev','payment_crud_prepare_core_v83("Payments","Payments",text)'),
  ('mw_app_dev','pwa_cash_opening_basis_v2(text)'),
  ('mw_app_dev','pwa_expense_version_v2(text)'),
  ('mw_app_dev','pwa_native_inverse_permitted_v2(text)'),
  ('mw_app_dev','pwa_payment_correction_text_v2(jsonb)'),
  ('mw_app_dev','pwa_payment_head_v2(text)'),
  ('mw_app_dev','forecast_schedule_v1(jsonb,jsonb,date,date)'),
  ('mw_app_dev','pwa_next_projected_charge_v1(text,date)'),
  ('mw_app_dev','pwa_next_bookable_charge_v1(text,date)'),
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
  ('mw_app_dev_journal_owner','pwa_submit_agent_receipt_v1(text)'),
  ('mw_app_dev_journal_owner','pwa_submit_operation_v2(text)'),
  ('mw_app_dev_journal_owner','pwa_submit_selected_charges_v1(text)'),
  ('mw_business_audit_owner','agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)'),
  ('mw_business_audit_owner','agent_audit.capture_change()'),
  ('mw_business_audit_owner','agent_audit.reject_rewrite()'),
  ('mw_changes_owner_dev','pwa_row_changes_prune_v1()'),
  ('mw_chat_api_dev','pwa_chat_message_v1(jsonb,uuid,uuid)'),
  ('mw_chat_api_dev','pwa_chat_thread_v1(jsonb,uuid)'),
  ('mw_chat_api_dev','pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)'),
  ('mw_chat_read_dev','pwa_job_status_v1(integer)'),
  ('mw_chat_api_dev','pwa_chat_messages_v1(jsonb,uuid,integer,integer)'),
  ('mw_chat_api_dev','pwa_chat_models_default_v1(jsonb)'),
  ('mw_chat_api_dev','pwa_chat_proposal_cancel_v1(jsonb,uuid,uuid,text)'),
  ('mw_chat_api_dev','pwa_chat_proposal_claim_v1(jsonb,uuid,uuid)'),
  ('mw_chat_api_dev','pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'),
  ('mw_chat_api_dev','pwa_chat_proposal_settle_v1(jsonb,uuid,uuid,jsonb)'),
  ('mw_chat_api_dev','pwa_chat_proposals_v1(jsonb,uuid,uuid,integer)'),
  ('mw_chat_api_dev','pwa_chat_thread_create_v1(jsonb,jsonb)'),
  ('mw_chat_api_dev','pwa_chat_thread_update_v1(jsonb,uuid,jsonb)'),
  ('mw_chat_api_dev','pwa_chat_threads_v1(jsonb,text,timestamp with time zone,integer)'),
  ('mw_chat_api_dev','pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)'),
  ('mw_chat_api_dev','pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)'),
  ('mw_chat_api_dev','pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)'),
  ('mw_chat_owner_dev','pwa_chat_actor_v1(jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_immutable_v1()'),
  ('mw_chat_owner_dev','pwa_chat_iso_v1(timestamp with time zone)'),
  ('mw_chat_owner_dev','pwa_chat_message_json_v1(pwa_chat_messages)'),
  ('mw_chat_owner_dev','pwa_chat_message_v1(jsonb,uuid,uuid)'),
  ('mw_chat_owner_dev','pwa_chat_messages_v1(jsonb,uuid,integer,integer)'),
  ('mw_chat_owner_dev','pwa_chat_models_default_v1(jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_proposal_cancel_v1(jsonb,uuid,uuid,text)'),
  ('mw_chat_owner_dev','pwa_chat_proposal_claim_v1(jsonb,uuid,uuid)'),
  ('mw_chat_owner_dev','pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_proposal_guard_v1()'),
  ('mw_chat_owner_dev','pwa_chat_proposal_json_v1(pwa_chat_proposals)'),
  ('mw_chat_owner_dev','pwa_chat_proposal_settle_v1(jsonb,uuid,uuid,jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_proposals_v1(jsonb,uuid,uuid,integer)'),
  ('mw_chat_owner_dev','pwa_chat_thread_create_v1(jsonb,jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_thread_json_v1(pwa_chat_threads)'),
  ('mw_chat_owner_dev','pwa_chat_thread_update_v1(jsonb,uuid,jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_thread_v1(jsonb,uuid)'),
  ('mw_chat_owner_dev','pwa_chat_threads_v1(jsonb,text,timestamp with time zone,integer)'),
  ('mw_chat_owner_dev','pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)'),
  ('mw_chat_owner_dev','pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)'),
  ('mw_changes_owner_dev','pwa_track_row_change()'),
  ('mw_jobs_dev','pwa_job_run_v1(text,date,text)'),
  ('mw_jobs_owner_dev','pwa_job_run_v1(text,date,text)'),
  ('mw_jobs_owner_dev','pwa_job_status_v1(integer)'),
  ('mw_jobs_owner_dev','pwa_row_changes_prune_v1()'),
  ('mw_jobs_owner_dev','pwa_worker_guard_v1(text)'),
  ('mw_ledger_owner_dev','sync_cash_ledger(text,text)'),
  ('mw_notify_api_dev','pwa_notify_history_content_v1(jsonb,uuid[])'),
  ('mw_notify_api_dev','pwa_notify_history_v1(jsonb,timestamp with time zone,uuid)'),
  ('mw_notify_api_dev','pwa_notify_preference_v1(jsonb,boolean)'),
  ('mw_notify_api_dev','pwa_notify_revoke_v1(jsonb,uuid)'),
  ('mw_notify_api_dev','pwa_notify_status_v1(jsonb,text)'),
  ('mw_notify_api_dev','pwa_notify_subscribe_v1(jsonb,jsonb)'),
  ('mw_notify_api_dev','pwa_notify_target_v1(jsonb,uuid)'),
  ('mw_notify_dispatch_dev','pwa_claim_notifications_v1(integer,integer)'),
  ('mw_notify_dispatch_dev','pwa_notify_candidates_v1(integer)'),
  ('mw_notify_dispatch_dev','pwa_notify_complete_v1(uuid,bigint,text)'),
  ('mw_notify_dispatch_dev','pwa_notify_content_v1(uuid,bigint)'),
  ('mw_notify_dispatch_dev','pwa_notify_enqueue_v1(uuid,uuid,bigint,boolean)'),
  ('mw_notify_dispatch_dev','pwa_notify_prepare_send_v1(uuid,bigint)'),
  ('mw_notify_dispatch_dev','pwa_notify_start_send_v1(uuid,bigint,bigint)'),
  ('mw_notify_owner_dev','pwa_capture_notification_v1()'),
  ('mw_notify_owner_dev','pwa_claim_notifications_v1(integer,integer)'),
  ('mw_notify_owner_dev','pwa_notify_actor_v1(jsonb)'),
  ('mw_notify_owner_dev','pwa_notify_candidates_v1(integer)'),
  ('mw_notify_owner_dev','pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)'),
  ('mw_notify_owner_dev','pwa_notify_complete_v1(uuid,bigint,text)'),
  ('mw_notify_owner_dev','pwa_notify_content_v1(uuid,bigint)'),
  ('mw_notify_owner_dev','pwa_notify_eligible_v1(uuid,uuid)'),
  ('mw_notify_owner_dev','pwa_notify_enqueue_v1(uuid,uuid,bigint,boolean)'),
  ('mw_notify_owner_dev','pwa_notify_history_content_v1(jsonb,uuid[])'),
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
  ('mw-credit-app-chat-dev@clever-oasis-508610-n7.iam','mw_chat_api_dev',true,false),
  ('mw-credit-app-chat-dev@clever-oasis-508610-n7.iam','mw_chat_read_dev',false,true),
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
 -- V99 (R080): the content facts RPC is the notify owner's pinned definer, executable only by the dispatch
 -- capability; the owner reads exactly the source columns it needs (column grants, attacl), no whole table.
 -- V100 (R081) adds "Borrowers" "Description", the English name for English-preference recipients.
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure) THEN RAISE EXCEPTION 'pwa_notify_content_v1 must be the notify owner''s pinned definer'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('Partners','Language Preference'),('Payments','Row ID'),('Payments','Ref Borrower'),('Payments','Amount Received'),
   ('Loans','Row ID'),('Loans','Ref Borrowers'),('Loans','Principal Amount'),('Borrowers','Row ID'),('Borrowers','Borrower Name'),('Borrowers','Description')) v(t,c) WHERE NOT has_column_privilege('mw_notify_owner_dev',format('public.%I',t),c,'SELECT'))
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['Partners','Payments','Loans','Borrowers']) t WHERE has_table_privilege('mw_notify_owner_dev',format('public.%I',t),'SELECT'))
  OR has_column_privilege('mw_notify_owner_dev','public."Partners"','Partner Name','SELECT')
  OR has_column_privilege('mw_notify_owner_dev','public."Payments"','Notes','SELECT') OR has_column_privilege('mw_notify_owner_dev','public."Borrowers"','Borrower Note','SELECT') THEN RAISE EXCEPTION 'notify owner source column grants differ'; END IF;
 -- V103 (R089): the history content RPC is the notify owner's pinned definer over the same column grants (no new grant).
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure) THEN RAISE EXCEPTION 'pwa_notify_history_content_v1 must be the notify owner''s pinned definer'; END IF;
 -- V104 (R090): the chat owner owns the four tables and every pwa_chat_* routine and is NOLOGIN with no membership;
 -- the API role executes the eight RPCs and reads no table; the SQL-tool role (operator grants outside Git) holds
 -- nothing on a chat table or RPC; the PROD default-privilege role gets no chat EXECUTE; the definer reads its columns.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('mw_chat_owner_dev','mw_chat_api_dev','mw_chat_read_dev') AND (rolcanlogin OR rolsuper OR rolbypassrls))
  OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='mw_chat_owner_dev'::regrole OR roleid='mw_chat_owner_dev'::regrole) THEN RAISE EXCEPTION 'chat owner must be closed, holding and granting no membership'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['mw_chat_api_dev','mw_chat_read_dev','mw-credit-app-chat-dev@clever-oasis-508610-n7.iam']) r
   CROSS JOIN unnest(ARRAY['public.pwa_chat_threads','public.pwa_chat_messages','public.pwa_chat_history','public.pwa_chat_tool_calls','public.pwa_chat_proposals']) t
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p WHERE has_table_privilege(r,t,p)) THEN RAISE EXCEPTION 'no direct chat table privilege outside the chat owner'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%' AND (has_function_privilege('mw_chat_read_dev',p.oid,'EXECUTE')
   OR (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') AND has_function_privilege('mw_integration_agent',p.oid,'EXECUTE')))) THEN RAISE EXCEPTION 'the SQL-tool and agent roles must not execute a chat routine'; END IF;
 IF NOT has_function_privilege('mw-credit-app-chat-dev@clever-oasis-508610-n7.iam','public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'only the chat user executes the chat RPCs'; END IF;
 -- V105 (R090 batch 2): the notify owner reads exactly four thread columns by column grant (the only cross-owner grant);
 -- the API role executes exactly ten routines (nine chat RPCs and the reply event), the SQL-tool role only the job
 -- status from the migration chain; the agent role executes neither new routine and reads no job run.
 IF (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_chat_threads'::regclass AND x.grantee='mw_notify_owner_dev'::regrole AND x.privilege_type='SELECT')
   IS DISTINCT FROM ARRAY['id','partner_id','status','title'] OR has_table_privilege('mw_notify_owner_dev','public.pwa_chat_threads','SELECT')
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_chat_threads'::regclass AND x.grantee<>'mw_notify_owner_dev'::regrole) THEN
  RAISE EXCEPTION 'pwa_chat_threads column grants must be the notify owner''s four columns only'; END IF;
 -- V118 (R106): five proposal RPCs more (16); the SQL-tool role still only the job status.
 IF (SELECT count(*) FROM am_actual_routines WHERE grantee='mw_chat_api_dev')<>16 OR (SELECT count(*) FROM am_actual_routines WHERE grantee='mw_chat_read_dev')<>1 THEN
  RAISE EXCEPTION 'chat API role must execute 16 routines and the SQL-tool role 1 from the migration chain'; END IF;
 -- V118: the chat owner reads Partners by column grant only ("AI Reviewer" added for the reviewer gate).
 IF NOT (SELECT bool_and(has_column_privilege('mw_chat_owner_dev','public."Partners"',c,'SELECT')) FROM unnest(ARRAY['Row ID','Login Email','Language Preference','AI Reviewer']) c)
  OR has_table_privilege('mw_chat_owner_dev','public."Partners"','SELECT') OR has_column_privilege('mw_chat_owner_dev','public."Partners"','Partner Role','SELECT') THEN
  RAISE EXCEPTION 'the chat owner must read exactly its Partners columns'; END IF;
 IF (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_chat_messages'::regclass AND x.grantee='mw_notify_owner_dev'::regrole AND x.privilege_type='SELECT')
   IS DISTINCT FROM ARRAY['id','thread_id'] OR has_table_privilege('mw_notify_owner_dev','public.pwa_chat_messages','SELECT') THEN
  RAISE EXCEPTION 'the notify owner must read exactly pwa_chat_messages (id, thread_id) by column grant'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') AND (has_function_privilege('mw_integration_agent','public.pwa_job_status_v1(integer)','EXECUTE')
   OR has_function_privilege('mw_integration_agent','public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)','EXECUTE')) THEN RAISE EXCEPTION 'the agent role must not execute the V105 routines'; END IF;
 IF NOT has_column_privilege('postgres','public.pwa_chat_messages','text','SELECT') OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid='public.pwa_chat_messages'::regclass AND x.grantee='postgres'::regrole) THEN
  RAISE EXCEPTION 'the Cost page definer reads its chat columns by column grant only'; END IF;
END $$;
-- R091 V107: the agent native command route is retired; its V90 function is gone and the command journal stays.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='pwa_submit_agent_operation_v1') THEN RAISE EXCEPTION 'V107: pwa_submit_agent_operation_v1 must not exist'; END IF;
 IF to_regprocedure('public.pwa_submit_operation_v2(text)') IS NULL OR to_regclass('public.pwa_payment_commands') IS NULL THEN RAISE EXCEPTION 'V107 must leave the command submit route and its journal'; END IF;
END $$;
-- V109 (R094): the agent's SELECT on the notification, push and jobs tables is revoked by their owners. The disposable
-- chain never grants it (the tables predate the CI default-privilege fixture), so the PROD state is seeded here: the
-- role (when absent) and SELECT granted by each owner, as the pre-R085 public default left it after the owner change,
-- plus the same grant on pwa_row_changes, which V109 must keep. V109 then runs again (it is re-runnable) and must
-- leave exactly the five revoked and everything else, default privileges included, unchanged.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN CREATE ROLE mw_integration_agent NOLOGIN NOINHERIT; END IF;
END $$;
CREATE TEMP TABLE am_v109_defaults ON COMMIT DROP AS SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl::text AS acl FROM pg_default_acl;
SET LOCAL ROLE mw_notify_owner_dev;
GRANT SELECT ON public.pwa_notification_events,public.pwa_notification_preferences,public.pwa_notification_deliveries,public.pwa_push_subscriptions TO mw_integration_agent;
RESET ROLE;
SET LOCAL ROLE mw_jobs_owner_dev;
GRANT SELECT ON public.pwa_job_runs TO mw_integration_agent;
RESET ROLE;
DO $$
DECLARE owner text:=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_row_changes'::regclass);
BEGIN
 EXECUTE format('SET LOCAL ROLE %I',owner);
 GRANT SELECT ON public.pwa_row_changes TO mw_integration_agent;
 RESET ROLE;
 IF NOT (has_table_privilege('mw_integration_agent','public.pwa_notification_events','SELECT') AND has_table_privilege('mw_integration_agent','public.pwa_job_runs','SELECT')) THEN
  RAISE EXCEPTION 'V109 fixture: the seeded owner grants are missing'; END IF;
END $$;
\ir ../../database/migrations/V109__revoke_agent_select_pwa_state.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['pwa_notification_events','pwa_notification_preferences','pwa_notification_deliveries','pwa_push_subscriptions','pwa_job_runs']) n
   WHERE has_table_privilege('mw_integration_agent',format('public.%I',n),'SELECT') OR has_any_column_privilege('mw_integration_agent',format('public.%I',n),'SELECT')) THEN
  RAISE EXCEPTION 'V109: mw_integration_agent must not read the notification, push and jobs tables'; END IF;
 IF NOT has_table_privilege('mw_integration_agent','public.pwa_row_changes','SELECT') THEN RAISE EXCEPTION 'V109 must not touch pwa_row_changes'; END IF;
 IF EXISTS(SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl EXCEPT SELECT * FROM am_v109_defaults)
  OR EXISTS(SELECT * FROM am_v109_defaults EXCEPT SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl) THEN
  RAISE EXCEPTION 'V109 must not change default privileges'; END IF;
END $$;
-- V110 (R095): the agent's SELECT on pwa_row_changes (still seeded above) and postgres's public SELECT ON TABLES default
-- for it go; the public EXECUTE default, other roles' defaults and the cash statement's reads stay. Seeded as PROD has
-- them after R091, then V110 runs again (re-runnable).
GRANT SELECT ON public."Partners",public."Cash Accounts",public."Borrowers",public.cash_statement_account_effects,public.r008_cash_account_cutover TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO mw_app_dev;
\ir ../../database/migrations/V110__revoke_agent_default_select.sql
DO $$
DECLARE agent_defaults text;
BEGIN
 IF has_table_privilege('mw_integration_agent','public.pwa_row_changes','SELECT') THEN RAISE EXCEPTION 'V110: the agent must not read pwa_row_changes'; END IF;
 SELECT string_agg(d.defaclobjtype::text||':'||a.privilege_type,',' ORDER BY d.defaclobjtype,a.privilege_type) INTO agent_defaults
 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND a.grantee='mw_integration_agent'::regrole;
 IF agent_defaults IS DISTINCT FROM 'f:EXECUTE' THEN RAISE EXCEPTION 'V110: the agent''s public defaults must be the EXECUTE one only, got %',agent_defaults; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='postgres'::regrole
   AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='r' AND a.grantee='mw_app_dev'::regrole AND a.privilege_type='SELECT') THEN
  RAISE EXCEPTION 'V110 must keep other roles'' table defaults'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['public."Partners"','public."Cash Accounts"','public."Borrowers"','public.cash_statement_account_effects','public.r008_cash_account_cutover']) r
   WHERE NOT has_table_privilege('mw_integration_agent',r::regclass,'SELECT')) THEN RAISE EXCEPTION 'V110 must keep the cash statement''s reads'; END IF;
END $$;
-- A table postgres creates now is not readable by the agent.
CREATE TABLE public.v110_probe(id integer);
DO $$ BEGIN
 IF has_table_privilege('mw_integration_agent','public.v110_probe','SELECT') THEN RAISE EXCEPTION 'V110: a new public table must not reach the agent by default'; END IF;
END $$;
-- V111 (R095): the agent reads the borrower payer name ("Communication Name") through its kept whole-table SELECT and
-- writes nothing; the two command functions keep their journal owner and no PUBLIC EXECUTE.
DO $$ BEGIN
 IF NOT has_column_privilege('mw_integration_agent','public."Borrowers"','Communication Name','SELECT') THEN RAISE EXCEPTION 'V111: the agent must read the payer name'; END IF;
 IF has_table_privilege('mw_integration_agent','public."Borrowers"','INSERT,UPDATE,DELETE,TRUNCATE')
  OR has_any_column_privilege('mw_integration_agent','public."Borrowers"','INSERT,UPDATE') THEN RAISE EXCEPTION 'V111: the agent must not write borrowers'; END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_submit_agent_receipt_v1(text)'::regprocedure)<>'mw_app_dev_journal_owner'
  OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_submit_selected_charges_v1(text)'::regprocedure)<>'mw_app_dev_journal_owner'
  OR has_function_privilege('public','public.pwa_submit_agent_receipt_v1(text)','EXECUTE') OR has_function_privilege('public','public.pwa_submit_selected_charges_v1(text)','EXECUTE') THEN
  RAISE EXCEPTION 'V111 changed a command function owner or PUBLIC access'; END IF;
END $$;
SELECT 'Access matrix regression passed' AS result;
ROLLBACK;
