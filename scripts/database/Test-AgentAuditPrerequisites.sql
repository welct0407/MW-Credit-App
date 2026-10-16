-- Disposable test-server prerequisite ONLY. Production owner setup is separate.
CREATE ROLE mw_business_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_business_audit_owner TO CURRENT_USER WITH INHERIT TRUE;
-- Agent-side business roles that V93 grants conditionally (operator-provisioned live: the
-- reviewer by configure-reviewer-dml.py, relay/auditor by the agent bootstrap). Present here
-- so the grant matrix records those grants; NOLOGIN, no membership, no credential.
CREATE ROLE mw_reviewer_dml NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_relay NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_auditor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
