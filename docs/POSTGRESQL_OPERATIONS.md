# PostgreSQL state and audit

The owner-approved R015 implementation uses `mw_agent` on the existing Cloud SQL instance `clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914`. It contains 29 audit/runtime/migration tables plus the independent deployment history. These are internal agent records, never AppSheet data sources. Business data stays in `loan_manager_prod`; DEV stays in `loan_manager_dev`. Instance/network settings are unchanged.

## Governance

AppSheet is the preferred operational API for Find/Add/Edit/Delete. Codex chooses calls from current metadata and the current request; there are no scripts for individual business operations. Conversational mutations require the current authenticated Partner's AI Reviewer role, a current instruction quote, exact keys and fresh observations. Partner membership alone grants no editing authority. Receipt approval retains its separate existing policy.

SQL is a fallback: `api_gap:` requires a verified missing app/field/action capability; `atomic:` must explain the required transaction guarantee. SQL metadata and full canonical before-images support this fallback. Fixed reporting and authorization queries are separately authorized read-only database services. They are not model SQL tools.

Approved DELETE is supported. Every deleted key, including dependent children, must be an explicit step, children first. A plan has at most 10 direct steps, 1,000 captured row effects and 10 MiB of captured images. Unexpected cascades roll back. AppSheet Delete is routed to SQL when delete triggers/cascades require atomic effect verification. Existing financial immutability, reference and cash-ledger guards continue to apply; approval does not bypass them. No DDL, arbitrary SQL, code, permissions or trigger settings are model-accessible.

`audit.operations` stores immutable intent; `audit.events` stores append-only events. Mutable status, queue ownership and journals live in `runtime`. All host/provider calls and journal mutations are recorded; sensitive image bytes, credentials and hidden reasoning are excluded. API audit coverage is observed before/after, not a claim of atomic capture of every API automation. SQL `agent_audit` triggers capture actual before/after rows and a commit marker in the business transaction. The relay copies events idempotently then acknowledges the source marker. It never uses a sequence high-water mark as a commit boundary.

Owner roles are NOLOGIN. Worker, relay and reporting/DML logins are separate, with explicit grants. Worker cannot change the generation control, schema or audit history. Relay cannot mutate business rows. Model inputs cannot select credentials or connection targets. Audit is append-only for runtime roles; the database administrator remains a trusted recovery authority. Retention/purge is not automated.

## Cutover and recovery

1. Verify backups and restore the affected business databases privately. Apply the tested business Flyway migration in DEV, then pin the clean tested commit for PROD.
2. Provision the separate database with `scripts/provision-agent-database.py`; run central immutable migrations explicitly. No startup migration or automatic adoption.
3. Use `scripts/freeze-postgresql-cutover.py` as root on the verified VM. Stop timers, let workers finish, stop ingress, archive credentials/configuration/state/Codex sessions/package/systemd, restore privately and compare hashes. Keep the tunnel unchanged. During ingress pause, the origin is unavailable; no false successful acknowledgement is emitted.
4. Back up all six journals with `scripts/agent-state-admin.py backup --writers-stopped`, including immutable statement snapshots. Import one batch atomically and compare every source row, hidden ingress row ID, binary value, epoch, status and conversation binding. Do not import Codex-owned session/auth databases: retain their original files and private recovery copies.
5. Preserve existing service cutoffs and thread IDs. Establish a new backend generation and ingress cutover time. Newly arriving pre-cutover messages are quarantined; migration is not replay authorization. UNKNOWN, pending delivery and expiry history remain intact.
6. Install credentials as root:mwagent 0640, deploy the tested package/catalogue, verify configuration, apply business grants, then activate the generation and resume one owner for each timer/ingress. Install the relay timer. Record actual completion in the implementation log.

After PostgreSQL accepts new work, never switch back to stale SQLite. Stop affected workers, keep audit/commit evidence and repair forward or perform an explicitly reconciled recovery. A business commit with central acknowledgement failure stays UNKNOWN until the outbox marker, matching intent and final state prove it. Absence of a marker alone is not permission to retry. API UNKNOWN requires deliberate evidence-based reconciliation; no automatic resend.

The five worker timers, receiver and relay use at most eight central connections with the current process topology; each process has a one-connection pool. Connections are not held across model/provider calls. Short SQL/lock timeouts and generation fencing fail closed. Cloud SQL latency adds overhead to journal actions; measure the actual VM path at rollout. No instance resize or connection-limit change is included.

Schema sources: `database/migrations/` (central immutable history), business R015 V33 in AppSheet-Loan-Project, and `database/setup/` for separately managed roles/grants. The original design in `docs/design/agent-postgresql-20260922/` remains dated evidence.
