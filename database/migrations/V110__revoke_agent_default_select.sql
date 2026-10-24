-- R095 (owner, 24 October 2026: "if [the candidates are necessary], let's proceed"; Archie's decisions 3 and 4): the
-- last broad reads of mw_integration_agent on loan_manager_prod.
-- (a) Its SELECT on public.pwa_row_changes (V97, owned by postgres), inherited from the pre-R085 public default; no
--     kept agent path reads the change log.
-- (b) That default itself: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM
--     mw_integration_agent, so a table postgres creates later is no longer readable by the agent. Existing grants stay,
--     among them the cash statement's reads of "Partners", "Cash Accounts", "Borrowers",
--     cash_statement_account_effects and r008_cash_account_cutover (integration-agent cash_statement.py); a new public
--     relation the agent must read now needs an explicit grant in its migration.
-- Guarded by what exists, not by the database name: the revoke of (a) runs only while the agent holds the SELECT, and
-- (b) only while postgres's public default for the agent carries SELECT on tables. DEV and a fresh cluster have neither,
-- so V110 is a no-op there, and a second run finds nothing to do. Every other grant and default privilege (the agent's
-- EXECUTE default included, if present) stays exactly as it was. No table, column, routine, trigger or business row
-- changes. Run as postgres (the owner of pwa_row_changes and the grantor of the default); no owner window.

-- 1. Preflight.
DO $preflight$
DECLARE problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF current_user<>'postgres' THEN problems:=problems||format('run as postgres (owner of pwa_row_changes and grantor of its public default), not %s',current_user); END IF;
 IF to_regclass('public.pwa_row_changes') IS NULL THEN problems:=problems||'V97 table pwa_row_changes is missing'::text;
 ELSIF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_row_changes'::regclass)<>'postgres' THEN
  problems:=problems||'public.pwa_row_changes is not owned by postgres'::text; END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V110 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The revokes, with before-snapshots for the self-check (temporary, dropped at commit).
CREATE TEMP TABLE v110_defaults ON COMMIT DROP AS
 SELECT d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantee,a.privilege_type,a.is_grantable
 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE a.grantee<>d.defaclrole;
CREATE TEMP TABLE v110_reads ON COMMIT DROP AS
 SELECT r AS relation,(EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') AND has_table_privilege('mw_integration_agent',r::regclass,'SELECT')) AS reads
 FROM unnest(ARRAY['public."Partners"','public."Cash Accounts"','public."Borrowers"','public.cash_statement_account_effects','public.r008_cash_account_cutover']) r
 WHERE to_regclass(r) IS NOT NULL;
DO $revoke$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN RETURN; END IF;
 IF has_table_privilege('mw_integration_agent','public.pwa_row_changes','SELECT') THEN
  REVOKE SELECT ON public.pwa_row_changes FROM mw_integration_agent; END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='r'
   AND a.grantee='mw_integration_agent'::regrole AND a.privilege_type='SELECT') THEN
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM mw_integration_agent; END IF;
END $revoke$;

-- 3. Self-check: the agent reads no change log and gets no table by default; every other default privilege (grants to
-- other roles; a grantor's own entries are implicit) and the cash statement's reads are unchanged.
DO $check$
DECLARE bad text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN
  IF has_table_privilege('mw_integration_agent','public.pwa_row_changes','SELECT') OR has_any_column_privilege('mw_integration_agent','public.pwa_row_changes','SELECT') THEN
   RAISE EXCEPTION 'V110: mw_integration_agent still reads public.pwa_row_changes'; END IF;
  IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='r' AND a.grantee='mw_integration_agent'::regrole) THEN
   RAISE EXCEPTION 'V110: postgres''s public default still grants mw_integration_agent a table privilege'; END IF;
 END IF;
 SELECT string_agg(format('%s/%s/%s %s %s',pg_get_userbyid(x.defaclrole),x.defaclnamespace::regnamespace,x.defaclobjtype,
   CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type),', ') INTO bad
 FROM ((SELECT d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantee,a.privilege_type,a.is_grantable
   FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE a.grantee<>d.defaclrole
   EXCEPT SELECT * FROM v110_defaults)
  UNION ALL
  (SELECT * FROM v110_defaults
   WHERE NOT (defaclrole='postgres'::regrole AND defaclnamespace='public'::regnamespace AND defaclobjtype='r'
    AND pg_get_userbyid(grantee)='mw_integration_agent' AND privilege_type='SELECT')
   EXCEPT SELECT d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantee,a.privilege_type,a.is_grantable
   FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE a.grantee<>d.defaclrole)) x;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V110 changed other default privileges: %',bad; END IF;
 SELECT string_agg(relation,', ') INTO bad FROM v110_reads
 WHERE reads IS DISTINCT FROM (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') AND has_table_privilege('mw_integration_agent',relation::regclass,'SELECT'));
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V110 changed the cash statement''s reads: %',bad; END IF;
END $check$;
