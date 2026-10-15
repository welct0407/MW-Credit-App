-- Run once against verified loan_manager_prod, after backup and owner approval.
-- Supply METABASE_REPORTING_PASSWORD privately; never pass it on the command line.
\set ON_ERROR_STOP on
\getenv reporting_password METABASE_REPORTING_PASSWORD
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'loan_manager_prod' THEN
    RAISE EXCEPTION 'Expected loan_manager_prod';
  END IF;
END $$;
CREATE ROLE metabase_borrower_reader LOGIN PASSWORD :'reporting_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 8;
ALTER ROLE metabase_borrower_reader SET default_transaction_read_only = on;
ALTER ROLE metabase_borrower_reader SET statement_timeout = '30s';
ALTER ROLE metabase_borrower_reader SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE metabase_borrower_reader SET search_path = pg_catalog, public;
GRANT CONNECT ON DATABASE loan_manager_prod TO metabase_borrower_reader;
GRANT USAGE ON SCHEMA public TO metabase_borrower_reader;
GRANT SELECT (
  "Row ID", "Borrower Name", "Creation Date", "Hidden Flag", "Has Active Loan",
  "Total Outstanding Principal", "Overdue Amount", "Active Loan Count",
  "Profit Last 30 Days"
) ON public.olap_borrowers_analytics TO metabase_borrower_reader;
COMMIT;
