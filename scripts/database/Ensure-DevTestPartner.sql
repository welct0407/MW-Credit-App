-- R095 Part B (owner decisions of 24 October 2026: a real Google test account with a stored refresh token; Partner
-- rights except settlements): the DEV-only Partner row of the Claude Code test account. Idempotent: the row
-- "claude-dev-test" is inserted, or brought back to exactly these values; a second run changes nothing (no write, so
-- no business history row). Its "Partner Role" "Test" is neither A nor B, so the command service refuses it every
-- settlement operation (services/payment-command/store.mjs) and the A/B expense and settlement splits ignore it.
-- Refuses any database but loan_manager_dev (DEV and PROD share one instance; the database name is the target).
--   psql -X -v ON_ERROR_STOP=1 -v login_email=<test account sign-in email> -d loan_manager_dev -f scripts/database/Ensure-DevTestPartner.sql
-- Run as postgres. One DO block, so a refusal or failure changes nothing; the notice says written or unchanged.
\if :{?login_email}
\else
\set login_email ''
\endif
SELECT set_config('mw.dev_test_login_email', :'login_email', false);
DO $ensure$
DECLARE email text:=lower(btrim(current_setting('mw.dev_test_login_email'))); other text; changed integer;
BEGIN
 IF current_database()<>'loan_manager_dev' THEN RAISE EXCEPTION 'Ensure-DevTestPartner: loan_manager_dev only, not %',current_database(); END IF;
 IF email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' OR length(email)>320 THEN RAISE EXCEPTION 'Ensure-DevTestPartner: -v login_email=<address> required'; END IF;
 SELECT p."Row ID" INTO other FROM public."Partners" p WHERE lower(btrim(p."Login Email"))=email AND p."Row ID"<>'claude-dev-test';
 IF other IS NOT NULL THEN RAISE EXCEPTION 'Ensure-DevTestPartner: % already signs in as Partner %',email,other; END IF;
 INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Email","Instagram Username","Language Preference","IG Integration Enabled","AI Reviewer")
 VALUES ('claude-dev-test','Claude Code (DEV test)','Test',email,NULL,NULL,'English',false,false)
 ON CONFLICT ("Row ID") DO UPDATE SET "Partner Name"=EXCLUDED."Partner Name","Partner Role"=EXCLUDED."Partner Role","Login Email"=EXCLUDED."Login Email",
  "Email"=NULL,"Instagram Username"=NULL,"Language Preference"=EXCLUDED."Language Preference","IG Integration Enabled"=false,"AI Reviewer"=false
 WHERE ("Partners"."Partner Name","Partners"."Partner Role","Partners"."Login Email","Partners"."Email","Partners"."Instagram Username",
   "Partners"."Language Preference","Partners"."IG Integration Enabled","Partners"."AI Reviewer")
  IS DISTINCT FROM (EXCLUDED."Partner Name",EXCLUDED."Partner Role",EXCLUDED."Login Email",NULL::text,NULL::text,EXCLUDED."Language Preference",false,false);
 GET DIAGNOSTICS changed = ROW_COUNT;
 RAISE NOTICE 'Ensure-DevTestPartner: claude-dev-test %',CASE WHEN changed>0 THEN 'written' ELSE 'unchanged' END;
END $ensure$;
