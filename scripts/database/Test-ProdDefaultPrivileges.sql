-- PROD default privileges for the disposable migration test (Test-MigrationsCloud.py), so migration self-checks
-- run against PROD-like defaults instead of a clean cluster's. Recorded history only, never read from live PROD:
-- * apply (PROD at V101): the R085 statements of 21 October 2026 for mw_integration_agent, verbatim in
--   integration-agent/Change Logs/CHANGE_NOTES_CONVERSATION_SPEED_2026-10-21.md (postgres: SELECT on tables and
--   sequences in public, agent_audit, assessment_lab, monitoring; EXECUTE on routines in the first three;
--   mw_business_audit_owner: the same three, all schemas).
-- * pause / resume (around V103): the owner-approved pause of the public routines default in the R089 PROD
--   promotion of 22 October 2026 (Environment Inventory, PROD row), which V103's ACL self-check needed.
-- * remove (after the migrations): drops the fixture so later test SQL sees the usual synthetic roles.
-- Run as postgres with -v step=apply|pause|resume|remove. A schema the chain has not created yet (monitoring is
-- conditional in V93) is skipped, as an ALTER DEFAULT PRIVILEGES IN SCHEMA needs the schema.
\set ON_ERROR_STOP on
SELECT set_config('mw.default_privileges_step', :'step', false);
DO $defaults$
DECLARE step text:=current_setting('mw.default_privileges_step'); s text; verb text;
BEGIN
 IF current_database()<>'loan_manager_dev' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Disposable test cluster only'; END IF;
 IF step NOT IN ('apply','pause','resume','remove') THEN RAISE EXCEPTION 'Unknown step %', step; END IF;
 IF step='apply' THEN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN RAISE EXCEPTION 'mw_integration_agent already exists'; END IF;
  CREATE ROLE mw_integration_agent NOLOGIN NOINHERIT;
  COMMENT ON ROLE mw_integration_agent IS 'Test-ProdDefaultPrivileges.sql fixture';
 ELSIF NOT EXISTS(SELECT 1 FROM pg_roles r JOIN pg_shdescription d ON d.objoid=r.oid AND d.classoid='pg_authid'::regclass
   WHERE r.rolname='mw_integration_agent' AND d.description='Test-ProdDefaultPrivileges.sql fixture') THEN
  RAISE EXCEPTION 'mw_integration_agent is not this fixture''s role';
 END IF;
 IF step='pause' THEN
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM mw_integration_agent;
 ELSIF step='resume' THEN
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO mw_integration_agent;
 ELSE
  verb:=CASE step WHEN 'apply' THEN 'GRANT %s TO' ELSE 'REVOKE %s FROM' END;
  FOR s IN SELECT n FROM unnest(ARRAY['public','agent_audit','assessment_lab','monitoring']) n WHERE to_regnamespace(n) IS NOT NULL LOOP
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '||format(verb,'SELECT ON TABLES')||' mw_integration_agent',s);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '||format(verb,'SELECT ON SEQUENCES')||' mw_integration_agent',s);
   IF s<>'monitoring' THEN
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '||format(verb,'EXECUTE ON ROUTINES')||' mw_integration_agent',s);
   END IF;
  END LOOP;
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner '||format(verb,'SELECT ON TABLES')||' mw_integration_agent';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner '||format(verb,'SELECT ON SEQUENCES')||' mw_integration_agent';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner '||format(verb,'EXECUTE ON ROUTINES')||' mw_integration_agent';
 END IF;
 IF step='remove' THEN
  -- Grants that migrations without an ACL self-check inherited from the defaults (intended in PROD) go with the role.
  DROP OWNED BY mw_integration_agent;
  DROP ROLE mw_integration_agent;
 ELSIF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='f'
   AND a.grantee='mw_integration_agent'::regrole AND a.privilege_type='EXECUTE')=(step='pause') THEN
  RAISE EXCEPTION 'PROD default privilege fixture: public routines default not in the % state', step;
 END IF;
END $defaults$;
