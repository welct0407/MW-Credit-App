-- Disposable test-server prerequisite ONLY. Production owner setup is separate.
CREATE ROLE mw_business_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_business_audit_owner TO CURRENT_USER WITH INHERIT TRUE;
