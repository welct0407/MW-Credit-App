-- R095 Part B: Ensure-DevTestPartner.sql in the disposable cluster. Run twice it writes the DEV test Partner once and
-- then changes nothing; it repairs drift; it refuses a login email that another Partner already signs in with and a
-- missing email; and it refuses a database named loan_manager_prod (created empty here for the check, then dropped).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Email","Language Preference","IG Integration Enabled")
 VALUES ('DTP-A','Partner A','A','dtp-a@example.invalid','dtp-a@example.invalid','English',false);
\set login_email ' Claude-Test@Example.invalid '
\ir Ensure-DevTestPartner.sql
CREATE TEMP TABLE dtp_first ON COMMIT DROP AS SELECT (SELECT count(*) FROM public.pwa_row_changes WHERE table_name='Partners') AS changes;
\ir Ensure-DevTestPartner.sql
DO $$ BEGIN
 IF (SELECT to_jsonb(p)-'Row ID' FROM public."Partners" p WHERE "Row ID"='claude-dev-test') IS DISTINCT FROM
   '{"Partner Name":"Claude Code (DEV test)","Partner Role":"Test","Login Email":"claude-test@example.invalid","Email":null,"Instagram Username":null,
     "Language Preference":"English","IG Integration Enabled":false,"AI Reviewer":false}'::jsonb THEN RAISE EXCEPTION 'DEV test Partner values'; END IF;
 IF (SELECT count(*) FROM public."Partners" WHERE "Row ID"='claude-dev-test')<>1 THEN RAISE EXCEPTION 'one DEV test Partner'; END IF;
 IF (SELECT count(*) FROM public.pwa_row_changes WHERE table_name='Partners')<>(SELECT changes FROM dtp_first) THEN RAISE EXCEPTION 'a second run must write nothing'; END IF;
END $$;
-- Drift is brought back.
UPDATE public."Partners" SET "AI Reviewer"=true,"Partner Role"='A',"Email"='x@example.invalid' WHERE "Row ID"='claude-dev-test';
\ir Ensure-DevTestPartner.sql
DO $$ BEGIN
 IF (SELECT ("Partner Role","AI Reviewer","Email") IS DISTINCT FROM ('Test',false,NULL::text) FROM public."Partners" WHERE "Row ID"='claude-dev-test') THEN RAISE EXCEPTION 'drift kept'; END IF;
END $$;
-- Refusals, each leaving the row as it is.
\set ON_ERROR_STOP off
SAVEPOINT dtp_refusal;
\set login_email 'dtp-a@example.invalid'
\ir Ensure-DevTestPartner.sql
ROLLBACK TO SAVEPOINT dtp_refusal;
SELECT :'LAST_ERROR_MESSAGE' = 'Ensure-DevTestPartner: dtp-a@example.invalid already signs in as Partner DTP-A' AS dtp_taken \gset
\set login_email ''
\ir Ensure-DevTestPartner.sql
ROLLBACK TO SAVEPOINT dtp_refusal;
SELECT :'LAST_ERROR_MESSAGE' = 'Ensure-DevTestPartner: -v login_email=<address> required' AS dtp_missing \gset
\set ON_ERROR_STOP on
\if :dtp_taken
\else
SELECT 1/0 AS "a login email of another Partner must be refused";
\endif
\if :dtp_missing
\else
SELECT 1/0 AS "a missing login email must be refused";
\endif
DO $$ BEGIN
 IF (SELECT "Login Email" FROM public."Partners" WHERE "Row ID"='claude-dev-test')<>'claude-test@example.invalid' THEN RAISE EXCEPTION 'a refusal changed the row'; END IF;
END $$;
ROLLBACK;
-- A database named loan_manager_prod is refused before anything is read (it is empty here).
CREATE DATABASE loan_manager_prod;
\c loan_manager_prod
\set login_email 'claude-test@example.invalid'
\set ON_ERROR_STOP off
\ir Ensure-DevTestPartner.sql
\set ON_ERROR_STOP on
SELECT :'LAST_ERROR_MESSAGE' = 'Ensure-DevTestPartner: loan_manager_dev only, not loan_manager_prod' AS dtp_prod \gset
\c loan_manager_dev
DROP DATABASE loan_manager_prod;
\if :dtp_prod
SELECT 'DEV test Partner regression passed' AS result;
\else
SELECT 1/0 AS "loan_manager_prod must be refused";
\endif
