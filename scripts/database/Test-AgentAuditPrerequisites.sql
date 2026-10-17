-- Disposable test-server prerequisite ONLY. Production owner setup is separate.
CREATE ROLE mw_business_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_business_audit_owner TO CURRENT_USER WITH INHERIT TRUE;
-- Agent-side business roles that V93 grants conditionally (operator-provisioned live: the
-- reviewer by configure-reviewer-dml.py, relay/auditor by the agent bootstrap). Present here
-- so the grant matrix records those grants; NOLOGIN, no membership, no credential.
CREATE ROLE mw_reviewer_dml NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_relay NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_auditor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- ALL-ARCH-03 (V95): the receipt projector task role (live: Prepare-ReceiptProjector.py, a password login
-- until the agent moves to SET ROLE from its IAM user). No credential here; a fixture that needs to sign in
-- as it (r053-agent-receipt-independent) adds LOGIN itself. Conditional: receipt fixtures may create it first.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_receipt_projector') THEN
  CREATE ROLE mw_receipt_projector NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END $$;
