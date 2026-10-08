-- Disposable cluster prerequisites only. No live account, LOGIN or credential.
CREATE ROLE mw_app_dev NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_app_dev_journal_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_app_dev TO mw_app_dev_journal_owner;
