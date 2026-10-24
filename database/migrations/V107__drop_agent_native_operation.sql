-- R091 (owner instruction of 23 October 2026, "decommission ig conversation"; Archie's plan E4.1): the Instagram
-- Partner conversation is retired, and with it the agent's native command route. V90 created one function for it,
-- public.pwa_submit_agent_operation_v1(text) (no table); its only caller, the command service's nativeOperation(), is
-- removed from the image that runs before this migration (expand/contract). Rows the route wrote to
-- pwa_payment_commands stay: they are the ordinary payment command journal, read by pwa_operation_status_v2 and
-- pwa_payment_head_v2 like every other command.
-- The function is owned by mw_app_<env>_journal_owner (V90). On Cloud SQL the runner is not a superuser: the drop runs
-- as an inheriting member of that owner or under a temporary SET ROLE (owner-authority-cli.mjs prepare --owner
-- mw_app_<env>_journal_owner, then restore); the preflight names a missing authority first. Re-runnable: a second apply
-- finds the function absent and only re-asserts that.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE journal_owner text; owner_role text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 journal_owner:='mw_app_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END||'_journal_owner';
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=journal_owner) THEN problems:=problems||format('role %s is missing',journal_owner); END IF;
 IF to_regprocedure('public.pwa_submit_agent_operation_v1(text)') IS NOT NULL THEN
  owner_role:=(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_submit_agent_operation_v1(text)'::regprocedure);
  IF owner_role<>journal_owner THEN problems:=problems||format('pwa_submit_agent_operation_v1 is owned by %s, not %s',owner_role,journal_owner);
  ELSIF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
   AND NOT pg_has_role(current_user,journal_owner,'USAGE') AND NOT pg_has_role(current_user,journal_owner,'SET') THEN
   problems:=problems||format('%s holds neither inherited nor SET authority on %s (temporary maintenance membership required)',current_user,journal_owner);
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V107 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The drop, as the owner (its EXECUTE grants, including the command role's and any agent read grant, go with it).
DO $drop$
DECLARE journal_owner text:='mw_app_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END||'_journal_owner'; switched boolean:=false;
BEGIN
 IF to_regprocedure('public.pwa_submit_agent_operation_v1(text)') IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND NOT pg_has_role(current_user,journal_owner,'USAGE') THEN
  EXECUTE format('SET LOCAL ROLE %I',journal_owner); switched:=true;
 END IF;
 DROP FUNCTION public.pwa_submit_agent_operation_v1(text);
 IF switched THEN RESET ROLE; END IF;
END $drop$;
RESET ROLE;

-- 3. Self-check: the function is gone and the payment command journal it wrote to is intact.
DO $check$
BEGIN
 IF to_regprocedure('public.pwa_submit_agent_operation_v1(text)') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE proname='pwa_submit_agent_operation_v1') THEN
  RAISE EXCEPTION 'V107: pwa_submit_agent_operation_v1 must be dropped'; END IF;
 IF to_regclass('public.pwa_payment_commands') IS NULL OR to_regprocedure('public.pwa_operation_status_v2(uuid,text,text)') IS NULL OR to_regprocedure('public.pwa_payment_head_v2(text)') IS NULL THEN
  RAISE EXCEPTION 'V107: the payment command journal and its readers must stay'; END IF;
END $check$;
