# Reviewer database operations

Active on Debian from **22 September 2026, 11:48:59 Bangkok**. Signed event and capture times must both follow `2026-09-22T04:48:59.453352+00:00`. Existing conversation/receipt cutoffs and full conversation history are retained.

Owner scope, 22 September 2026: allow operational corrections and DML, only for current AI Reviewers, with a database connection. Codex chooses the operations; there are no scripts per business operation. Deployment evidence is in [the change log](../Change%20Logs/CHANGE_NOTES_REVIEWER_DML_2026-09-22.md).

## Authority and tools

Both conversational API writes and database writes require current `Partners.AI Reviewer=true` for the authenticated immutable Partner ID and a mapped Login Email. Sender-supplied role claims and remembered permission cannot authorize writes. Ordinary opted-in Partners retain questions and follow-up memory. The existing receipt coordinator remains independent. Authorization is rechecked at dispatch and before DML commit; role revocation prevents a later tool call/commit when observed. It cannot cancel a transaction already committed.

`database_catalogue` discovers real database columns, defaults, constraints, trigger definitions and writable fields. `database_read` accepts bounded equality filters with scalar values and returns at most 100 full rows. `database_transaction` accepts a model-selected plan of 1–10 INSERT/UPDATE/DELETE rows. Each has an exact key, current observation, supplied values and expected final fields. A current instruction quote and audit reason are mandatory. Parameterized values and quoted identifiers prevent input from becoming executable SQL. The model never receives a connection string or password.

The nine exposed resources are Borrowers, Loans, Charges, Repayments, Payments, Business Expenses, Settlements, Cash Ledger and Cash Pool Contributions. This list bounds data access; it does not enumerate business operations. App metadata excludes derived/identity fields; database constraints and triggers enforce their own rules. Keys and creation actors cannot be rewritten. Inserts stamp supported creation-actor fields using the authenticated reviewer. Dates/timestamps use PostgreSQL values, preferably ISO format; Native command defaults are not applied by direct DML.

One SERIALIZABLE transaction per turn locks target rows, compares their full observed state, applies all steps, checks deferred constraints and final row values, then commits after fresh authorization. Do not mix API writes and DML in the same turn. Timeouts bound statements/locks. A statement failure or stale row rolls back all steps. A commit acknowledgement plus final in-transaction readback proves the recorded states at commit; Codex must still inspect related workflow results. Direct SQL does not execute native command orchestration or notification dispatch. Prefer the native API for workflows that depend on them.

No raw SQL, DDL, function calls, role changes, session settings or trigger disabling is exposed. Approved exact-key DELETE retains all existing financial-history guards and requires PostgreSQL audit. Existing posted-payment/repayment immutability remains authoritative: this feature does **not** make the previously refused closing-payment amount overwrite valid. That needs a supported auditable adjustment/reversal design. The existing controlled cash-adjustment session flag is not exposed. No old request is automatically reprocessed.

## Connection and setup

The new `mw_reviewer_dml` role uses the existing Cloud SQL Auth Proxy at `127.0.0.1:5432`, database `loan_manager_prod`, project `clever-oasis-508610-n7`, instance `appsheet-pg-prod-20260914`. The `mw_integration_agent` reporting role remains read-only. Both default to read-only transactions; only the fixed DML transport starts READ WRITE.

Operator-only `scripts/configure-reviewer-dml.py` verifies the production tuple, creates a separate NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS/NOINHERIT role and explicit current grants. It refuses an existing role rather than silently replacing credentials/grants. Secrets remain outside Git and are installed as root:mwagent 0640 at `/etc/mw-integration-agent/secrets/reviewer-dml-password.txt`. Role/grant setup is separate from Flyway; no business schema, triggers, AppSheet definitions or application rows are changed by provisioning.

Existing invoker-rights triggers need supporting privileges: INSERT/UPDATE on Payment Allocations; DELETE on Cash Ledger for trigger-controlled system-entry synchronization; one label-column UPDATE privilege on each of Cash Accounts/Cash Holders because PostgreSQL `FOR SHARE` requires an UPDATE privilege. Model tools cannot mutate these protected resources or delete these protected resources. Direct cash-history deletion is additionally rejected by the existing database trigger. Public database TEMP and public function grants are inherited PostgreSQL privileges, not model tool capabilities; no shared PUBLIC grants were changed. This is a host-enforced DML interface with a restricted service login, not a claim that every possible SQL statement under that login is DML-only.

Configuration:

- `reviewer_dml_enabled`: independent kill switch, false by default.
- `reviewer_dml_cutoff`: timezone-aware activation time; both signed event and capture timestamps must be newer.
- `database_dml_user`: exactly `mw_reviewer_dml`.
- `database_dml_password_file`: protected secret path.
- Catalogue `reviewer_database_dml`: enabled and implemented before activation.

Stop the conversation timer and let a running turn finish before installation/activation. Use the reviewed updater to back up package/config/schema and integrity-check all SQLite journals. Verify connection identity, grants, reviewer/non-reviewer checks and schema discovery without printing business records. Enable only after checks; preserve existing conversation/receipt cutoffs and journals. No outbound test messages or production financial fixtures are required.

## Audit, uncertainty and recovery

Production state moves to `mw_agent.runtime`; the original six SQLite journals are retained as private pre-cutover recovery evidence. Immutable `audit.operations` and append-only `audit.events` hold current intents and events. Actual SQL row effects and the commit marker are written in the same business transaction, then relayed idempotently. AppSheet effects have observed-before/after coverage. UNKNOWN blocks later writes until evidence-based reconciliation; never automatically resubmit. See [PostgreSQL governance and recovery](POSTGRESQL_OPERATIONS.md) for permissions, exact-key DELETE/cascade limits, API-first routing, migration and recovery.

Rollback capability: disable `reviewer_dml_enabled`, stop the conversation worker before restoring a compatible package/configuration, retain all journals and accepted changes. Revoke the DML role's LOGIN/connection capability if disabling the connection is necessary. Keep reviewer checks on API writes unless the owner changes that policy. Do not restore a historical database over subsequent accepted financial events; a financial reversal is a separate operation.

Verification runners: `scripts/test-reviewer-dml.ps1` uses a disposable local PostgreSQL database for atomicity, stale values, role revocation, audit, injection, duplicate reservation and unknown-commit recovery. `scripts/verify-reviewer-dml-restored.ps1` privately backs up production, restores public/assessment_lab to a loopback-only lab and rehearses supporting role grants and existing payment guards using rolled-back synthetic fixtures. Neither creates production financial test rows. The transaction implementation follows [Psycopg transaction control](https://www.psycopg.org/psycopg3/docs/basic/transactions.html); PostgreSQL documents the [locking privilege requirement](https://www.postgresql.org/docs/18/sql-select.html).


The installed App Server 0.155.1 protocol persists dynamic tools at thread creation and does not expose `dynamicTools` on `thread/resume`. Existing sessions therefore use typed `app="database"` aliases through their already-persisted discovery/read/write tools; the new instructions describe the exact shapes. All aliases invoke the same reviewer/DML validators and journal. This preserves thread IDs and full history without rewriting Codex session files. `scripts/verify-reviewer-conversation.py` checks a real two-process Codex resume with synthetic metadata and a simulated database transaction. [Official App Server documentation](https://learn.chatgpt.com/docs/app-server) describes tool persistence; the installed generated protocol is the version-specific contract.

R015 supersedes the old updater/SQLite cutover instructions above. Use the PostgreSQL procedure; never resume an old writer against stale SQLite after activation. DELETE configuration additionally requires `reviewer_delete_enabled=true`, PostgreSQL backend and the existing reviewer DML switch.
