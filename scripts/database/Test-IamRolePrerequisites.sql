-- Disposable cluster prerequisites only: the DEV Cloud Run IAM database users
-- exist before migrations in the live instance (Terraform google_sql_user), so
-- conditional migration grants (V90) and the grant-matrix test see the same
-- roles. No password or credential; IAM authentication is not involved here.
CREATE ROLE "mw-credit-app-command-dev@clever-oasis-508610-n7.iam" LOGIN;
CREATE ROLE "mw-credit-app-read-dev@clever-oasis-508610-n7.iam" LOGIN;
CREATE ROLE "mw-credit-app-notify-dev@clever-oasis-508610-n7.iam" LOGIN;
CREATE ROLE "mw-credit-app-jobs-dev@clever-oasis-508610-n7.iam" LOGIN;
-- Operator-provisioned DEV capability membership (application-role-cli.mjs).
GRANT mw_app_dev TO "mw-credit-app-command-dev@clever-oasis-508610-n7.iam" WITH INHERIT TRUE, SET FALSE;
-- ALL-ARCH-03 (V95): the integration agent's IAM database user (Terraform google_sql_user on the Debian
-- host). NOINHERIT; its SET-only task-role memberships are operator steps and are granted only inside
-- the rolled-back Test-LedgerAccess.sql sections. Conditional: other fixtures may create it first.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw-integration-agent@clever-oasis-508610-n7.iam') THEN
  CREATE ROLE "mw-integration-agent@clever-oasis-508610-n7.iam" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END $$;
