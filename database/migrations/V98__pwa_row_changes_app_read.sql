-- R078 follow-up (orchestrator decision 19 October 2026, within the owner's "move to production" for R078): the
-- application capability mw_app_<env> reads the V97 change log. This is exactly what the capability policy
-- (scripts/database/app-role-policy.mjs) declares for the read-only relations pwa_row_changes and its identity
-- sequence: SELECT only, no write, no sequence USAGE. In DEV the post-migrate reconciliation already holds this grant,
-- so the statements are no-ops there; PROD has no reconciliation hook and gets the grant here. The runtime command
-- user reaches it through its mw_app_<env> membership (INHERIT, no SET). No table, column, data or owner change; the
-- runner owns both objects, so no temporary owner authority is needed.
DO $grant$
DECLARE suffix text; app_role text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 app_role:='mw_app_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN RAISE EXCEPTION 'V98 preflight: role % is missing',app_role; END IF;
 IF to_regclass('public.pwa_row_changes') IS NULL OR to_regclass('public.pwa_row_changes_seq_seq') IS NULL THEN RAISE EXCEPTION 'V98 preflight: V97 change log is missing'; END IF;
 EXECUTE format('GRANT SELECT ON TABLE public.pwa_row_changes TO %I',app_role);
 EXECUTE format('GRANT SELECT ON SEQUENCE public.pwa_row_changes_seq_seq TO %I',app_role);
 -- The capability stays read-only on the log (V97: only mw_changes_owner_<env>'s definer writes it).
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege(app_role,'public.pwa_row_changes',p))
  OR has_sequence_privilege(app_role,'public.pwa_row_changes_seq_seq','USAGE') OR has_sequence_privilege(app_role,'public.pwa_row_changes_seq_seq','UPDATE') THEN
  RAISE EXCEPTION 'V98: % must hold SELECT only on the change log and its sequence',app_role; END IF;
 IF NOT has_table_privilege(app_role,'public.pwa_row_changes','SELECT') THEN RAISE EXCEPTION 'V98: % cannot read the change log',app_role; END IF;
END $grant$;
