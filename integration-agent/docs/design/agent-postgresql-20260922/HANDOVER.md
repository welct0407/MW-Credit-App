# PostgreSQL agent state and audit — execution handover

**Implemented 22 September 2026; historical design.** Current operation is in [PostgreSQL operations](../../POSTGRESQL_OPERATIONS.md). The text below is the original design v1 and is kept as dated evidence. Prepared at the owner's request for a different model to execute later. The present task changes repository documentation and proposed SQL only. It does not authorize this author to create databases, change grants, migrate data, restart services or enable DELETE. No existing runtime authority has been changed.

## Start here

Read [GOVERNANCE.md](GOVERNANCE.md) for the rules, [SCHEMA.md](SCHEMA.md) for table relationships and transaction protocols, and [sqlite-mapping.json](sqlite-mapping.json) for the migration inventory. The five [DDL candidates](ddl/) are deliberately outside executable migration directories. They are a concrete starting design, **not PostgreSQL-tested migrations**. Validate them against PostgreSQL 18 and the current deployed schema before promotion.

The intended result is a dedicated `mw_agent` PostgreSQL database on the existing Cloud SQL instance, containing generic append-only agent audit and the application-owned runtime state currently in SQLite. Conversations retain their existing memory. Codex continues choosing operations through generic tools; it does not receive arbitrary SQL or credentials. AppSheet API is the preferred business route. Current AI Reviewers can approve INSERT/UPDATE/DELETE, with direct SQL as an audited fallback. Audit tables remain outside AppSheet.

The owner has chosen that direction. The next execution instruction should authorize implementation/deployment of this package; it need not reopen the same design decisions. Actual changes beyond these boundaries still need scoped authority. Preserve the user's chosen model/settings.

Suggested message for the executing model:

> Implement the design in `integration-agent/docs/design/agent-postgresql-20260922/HANDOVER.md`, following its governance and acceptance criteria. Read the current repository instructions and catalogue first. Preserve current data, conversation sessions, approvals, cutoffs and unknown-outcome protection. Complete laboratory/DEV validation and required recovery preparation before the scoped production rollout. Do not replay historical requests or perform unrelated production financial tests. Report deployment and verification separately, update the governing documents, and publish the checked implementation and evidence.

This suggested message is a handover aid, not an instruction issued by this document to execute itself.

## Established baseline and boundaries

| Item | Observation / execution implication |
|---|---|
| Canonical repository | repository `welct0407/MW-Credit-App` (then the archived MW-Integration-Agent repository), branch `main`; design starting commit `acbc0eb1c3544ec14ddf597ab59b614de8c3814d` |
| Governing instructions | Repository `AGENTS.md`, `SERVICE_CATALOGUE.md` and matching JSON; existing revision 14 describes the current runtime, not this proposal |
| Business repository | root `AGENTS.md` and `project/` (then the archived AppSheet-Loan-Project repository); its instructions and `database/README.md` govern business schema migrations |
| VM | Debian 13, `vm-mw-credit-agent`; installed source `/opt/mw-integration-agent-src`, Python environment `/opt/mw-integration-agent/.venv` |
| Protected configuration/state | `/etc/mw-integration-agent/`; `/var/lib/mw-integration-agent/`, including `state/` and conversation/session directories |
| Business target | GCP project `clever-oasis-508610-n7`, Cloud SQL instance `appsheet-pg-prod-20260914`, databases `loan_manager_prod` and `loan_manager_dev`; PostgreSQL 18.6 observed |
| Existing Debian connection | Auth Proxy on `127.0.0.1:5432`; verify the complete project/instance/database tuple, not just this shared loopback endpoint |
| Proposed central target | New database `mw_agent` on that same instance; no tier/network/restart changes |
| Existing DB identities | `mw_integration_agent` reporting role and separate `mw_reviewer_dml` mutation login; never substitute an administrative login |
| Current DML activation boundary | `2026-09-22T04:48:59.453352+00:00`; preserve this and all other actual deployed service cutoffs, re-reading them at execution |
| Dated state inventory | Six SQLite files, 18 present table instances, 351 rows; three additional lazy table definitions currently absent. No record contents exported for this design |
| Current tool boundary | Generic AppSheet Add/Edit and reviewer SQL INSERT/UPDATE; DELETE and PostgreSQL state storage require implementation |

Reconfirm only facts relevant to execution. Do not replay earlier deployment scripts, inspect unrestricted production rows, or assume this dated inventory is a frozen migration manifest. No R-number or Flyway version has been reserved by this design task. Reserve the next available business release/migration at implementation time; the agent database has its own migration history.

## Work packages and sequence

### A. Prepare an isolated implementation and recovery plan

Record current commits, preserve unrelated work, and inspect the affected modules listed below. Recheck source/table drift against the mapping. Establish private recovery copies for source journals, statement snapshots/PNGs, retained receipt candidates, credentials/configuration/systemd files, conversation binding/session directories and business DB assets. Use existing protected storage; no copies of private records, dumps or secrets in Git.

Use a disposable PostgreSQL 18 laboratory with the same database names and synthetic business fixtures. A private restored business backup may additionally be used in a contained laboratory when necessary for trigger parity; it must have no live notification or provider routes. The design has no production test-state database and does not make `mw_agent` a shared DEV queue. DEV agents must point at isolated test state and delivery fakes.

Verify Cloud SQL backup/PITR coverage and logical restore procedures. Prove restore of the relevant database and private runtime files, including role/grant recreation. Do not infer recovery coverage from VM snapshots or from centralizing data. The shared instance remains a shared failure domain.

### B. Register and test the schema

1. Validate [00](ddl/00_instance_bootstrap.proposed.sql) in the lab using the actual class of Cloud SQL administrative privileges. It creates restricted role identities and the central database; CREATE DATABASE is not transaction-wrapped. Collision means inspect, never silently adopt or drop an existing object. Roles start NOLOGIN; install credentials privately and enable LOGIN only for the required runtime identities once their grants are verified. Owner roles stay NOLOGIN and are never granted to runtime principals.
2. Establish a dedicated immutable central migration history, then adapt [01](ddl/01_audit_and_control.proposed.sql) and [02](ddl/02_runtime_compatibility.proposed.sql). Pin checksums and record applied versions. The `migration` schema's import evidence is not a substitute for schema migration history. Application startup must not silently create/alter tables.
3. Inspect live affected business FK actions, row keys, deferred triggers and trigger dependencies. Adapt [03](ddl/03_business_outbox.proposed.sql) into the next AppSheet Flyway migration. Its ten capture targets are the starting coverage, not proof that all current indirect effects are covered. Add capture for any further persistent effect table within approved scope or reject operations reaching it. Test in DEV and promote the identical tested migration under the business repository procedure. Keep existing integrity/calculation triggers enabled.
4. Apply/test [04](ddl/04_business_privileges.proposed.sql) as a separate reviewed grant change, retaining current INSERT/UPDATE dependencies. Validate effective privileges and inherited memberships, not only the GRANT text. Keep reviewer DML paused from before production capture-trigger installation until the compatible host is active.

The SQL session acknowledgement guards prevent casual execution but neither identify the Cloud SQL instance nor establish permission. Verify identity externally. Enable stop-on-error in the runner. For the nontransactional bootstrap, record partial progress and recover deliberately rather than rerunning CREATE statements blindly. Follow the existing Flyway transaction convention when extracting the business candidate; do not blindly nest its BEGIN/COMMIT wrapper.

### C. Implement domain storage adapters and audit

| Area | Existing source to inspect | Required result |
|---|---|---|
| Inbox and receipt processing | `journal.py`, `receipt_journal.py`, `receipt_run.py`, `server.py` | Transactional inbox + durable work queue; preserve job IDs and duplicate detection; 200 only after durable commit |
| Reviews/polling/reconsideration | `partner_review.py`, `conversation_poll.py`, `receipt_reconsider.py`, `review_cycle.py`, `review_execution.py` | Same review correlation/expiry, poll provenance, decisions and reserved payment keys |
| Notice delivery | `partner_notice.py`, its receipt/conversation callers | Mandatory stream discriminator in every query; preserve recipient snapshot and sent/unknown channels |
| Statement delivery | `statement_delivery.py`, `statement_run.py` | Preserve delivery reservations, exact snapshot/image hashes and retry semantics |
| Conversation memory/tools | `conversation_store.py`, `partner_conversation.py`, `conversation_tools.py`, `codex_conversation.py` | Same thread binding and session folders; persistent tool history and actor isolation |
| API/SQL mutations | `conversation_write.py`, `conversation_dml.py`, `conversation_schema.py`, `conversation_reviewer.py`, `appsheet.py` | Reviewer gate on every conversational mutation, API-first decision evidence, typed DELETE and immutable intent/outcomes |
| Configuration/entry points | `config.py`, `cli.py`, deployment/service scripts | Explicit backend/generation and role-specific connection configuration; no new embedded secrets or automatic migration on startup |

Search all remaining `sqlite3`, `.db`, direct cursor/connection SQL and journal construction sites after this pass. A connection-string substitution is insufficient: adapt `?` placeholders, `INSERT OR IGNORE`, PRAGMAs, implicit transactions, tuple/dict row handling, explicit column lists and SQLite-specific SQL. Keep existing SQLite support only for controlled migration/rollback tooling or tests, never an automatic production fallback.

Keep domain journals as the owning state for their existing queues. Generic `operation_state` is an audited projection and reconciliation control, not a second queue that independently re-executes the same work. Link each new operation deterministically to its legacy domain ID. Update central audit and domain/projection state in the same PostgreSQL transaction. Check both imported legacy UNKNOWN reservations and new generic unknown states before allowing writes.

The relay owns outbox export and generic COMMITTED projection only. The worker reconciliation path, using its domain-table grants, must update the associated legacy API/DML journal after verifying the marker and business outcome; otherwise an imported or new legacy UNKNOWN would remain blocked forever. Never let relay replay business DML or mark an unverified outcome COMPLETED.

Implement the transaction protocols in SCHEMA.md, including stable conflict-checked IDs, marker-before-DML, actual cascade comparison, pre-commit verification and idempotent central relay followed by business acknowledgement. Parse numeric row images without binary-float conversion; canonicalize monetary values as exact decimal strings for central payload hashing. Do not hash database JSON pretty-printing or include retry-generated timestamps in immutable comparisons.

Audit all service paths in G13, not just database mutations. Scheduled services retain their own scoped authority. Keep health/empty-poll events summarized and avoid recursive audit logging. For declined or blocked requests, record the actual reason and state without turning an audit failure into permission to perform the operation.

Implement generic API DELETE, capability-aware SQL fallback and exact-key parameterized SQL DELETE. Preserve current field/resource restrictions and SQL integrity guards. Test the typed API-DELETE compatibility alias described in SCHEMA.md in an actually resumed synthetic Codex session; installed App Server 0.155.1 cannot replace dynamic tool schemas through thread/resume. Do not reset production conversation threads to obtain a new tool schema. The model selects the operation and payload; host safeguards are shared primitives, not per-business-task scripts.

### D. Build and rehearse the importer

The importer must support inspection/dry-run and import into an empty isolated target, with no business execution or message delivery. Import under an operator/migration principal, not the worker. Record an immutable batch identifier and private source-backup manifest, then persist verification into `migration.batches/table_checks`.

- Freeze all production journal writers for the final capture. Use SQLite's backup API and integrity checks to include WAL content; copying a live `.db` alone is insufficient. Record file digests and source table schemas. The final manifest replaces dated counts without rewriting this historical baseline.
- Preserve each original column value, NULL/empty distinctions, Unicode and serialized text exactly. Canonical row comparisons must encode column name/type, length and value; use exact IEEE-754 representations for epoch floats and byte digests for BLOBs. Sort by stable source keys. Reconstruct target rows back into the source shape, excluding new generated columns, before comparing hashes.
- Preserve hidden `messages.rowid` as `legacy_rowid` and import the original cursor without resetting it. Preserve reconsideration IDs and advance its identity sequence beyond the imported maximum, handling an empty table correctly. Identity/sequence allocation never becomes a commit-order watermark.
- Verify every source table instance separately, including zero-row tables and absent lazy tables. The two notice streams share one target but require separate filtered counts/hashes. Any new or unknown production journal/table is a migration exception to resolve, not an omission. Explicitly classify synthetic verification databases and Codex-managed internals as excluded.
- Keep source status strings and history exact. Add `legacy_imported` provenance events with deterministic IDs and source references, not invented earlier approvals, timestamps or before-images. Re-running an import must compare identical content or fail; it cannot reset state or create new work.
- Import frozen statement JSON snapshots where used, preserving exact payload digest and period metadata; retain original image/evidence files privately. Re-querying current balances is not a valid replacement for a sent statement snapshot.

An import passes only when all mapped data and boundary classifications reconcile; matching total row count alone is insufficient. Private verification may read real values, but published evidence contains only schema, counts, digests and status summaries.

### E. Freeze, classify, import and activate once

1. Complete laboratory/DEV acceptance and publish the checked code/migration artifacts. Back up current live assets. Record current flags, timers, cutoffs, locks and provider-dispatch state. Install the new code/configuration without starting a second owner.
2. Pause scheduled/conversation/receipt workers and receiver intake coherently. Drain active model/provider work; if dispatch completion cannot be established, preserve it as held UNKNOWN. Do not force an ambiguous operation into a retryable status. Stop and disable old units so generation fencing is not relied on against old binaries. New requests during the bounded intake pause receive 503 rather than an unpersisted 200.
3. Capture the final SQLite backup and a UTC backend cutover boundary. Preserve the original service activation cutoffs separately; a storage migration does not reactivate old instructions. Record all active/pending/terminal/unknown work and import/verify.
4. Bootstrap ingress work only for source messages genuinely unconsumed at the frozen source cursor, applying their existing service cutoffs and eligibility. Preserve existing queued jobs/reviews and original expiry; they do not become new messages merely because the backend changed. Keep terminal/sent/ignored history terminal. RUNNING or uncertain interrupted work stays held for reconciliation, not automatically replayed.
5. Signed webhook messages first arriving after cutover whose event time predates the backend boundary and which have no imported record go to `REVIEW`, with provenance, rather than automatic processing. This conservative delayed-delivery rule avoids historical replay; it can hold legitimate messages sent during the outage. An operator must resolve eligibility explicitly. Post-boundary messages still obey normal service cutoffs, signature, identity, dedup and age checks. Poll-only data never becomes signed reviewer authority.
6. Set the new backend/generation in deployment-controlled `runtime.service_control` and matching configuration; workers may read but not change it. Verify all imported unknown blocks, resume receiver, then resume services one at a time with a single owner. Restore only previously authorized flags plus the specifically approved new capability. Do not bulk-release review-held historical items.
7. Read back storage health, queue ownership and audit correlation. Observe legitimate new traffic; do not manufacture production borrower writes or notifications as a deployment test. Reconcile relay backlog and held operations. Retain private frozen SQLite backups; never reopen them as writable production state.

Central outage before an external action prevents that action. If SQL committed but central finalization failed, the business outbox provides the recovery evidence and relay catches up. Webhook availability now depends on Cloud SQL; there is no local emergency queue in v1. Upstream retry retention is finite and not established by this design—monitor failures and reconcile the pause interval rather than claiming zero possible message loss.

## Required acceptance evidence

These are tests for the executing model, **not results obtained by the design author**. Use synthetic fixtures/fake delivery unless a separately scoped live test is authorized.

| ID | Test | Required outcome |
|---|---|---|
| T01 | Apply full DDL on PostgreSQL 18; Cloud SQL privilege compatibility; exact business migration in DEV | Correct schema/constraints/grants; normal application and existing business-trigger behavior retained; no audit sources in apps |
| T02 | Effective worker/relay/auditor/reviewer privileges; malicious tool session/DDL/function inputs | No ownership, DDL, TRUNCATE, audit rewrite or unrestricted SQL; wrong principal/absent transaction marker fails |
| T03 | Ordinary Partner, revoked/stale reviewer, unmapped actor, expired receipt approval | No unauthorized mutation; current reviewer and distinct scheduled/receipt authority retained and audited |
| T04 | API-supported read/create/update/delete; unsupported semantics; 401/403/validation/timeout | API preferred; explained authorized fallback only; ambiguous API outcomes never replay through SQL |
| T05 | Approved DELETE with parent/child effects; unexpected cascade; guarded financial row | Exact approved deletion set or rollback/clear guard refusal; before-images captured; no disabled triggers |
| T06 | Multi-row SQL, concurrent edits, deferred rollups, exact decimals, 0 rows and effect budgets | Stale/over-budget/unexpected effects roll back; marker and actual changes commit together; final values correct |
| T07 | Duplicate message/operation, altered payload under same key, concurrent identical requests | One effect; content mismatch stops; no automatic splitting/retry to evade limits |
| T08 | Central/business disconnect before dispatch, during SQL and after COMMIT send | No unaudited dispatch; uncertain outcomes stay blocked until evidenced reconciliation; no double mutation |
| T09 | Relay crash before central commit or after central commit before outbox ack | Deterministic replay produces one event set; no skipped out-of-order commits; legacy and generic states reconcile |
| T10 | Import all files/tables, both notice streams, absent tables, BLOBs, Thai text and frozen statements | Per-instance keys/counts/canonical hashes/statuses match; imports create no delivery or business effects |
| T11 | Concurrent ingress allocation/commit order, duplicate webhook and old delayed delivery | No watermark gap; inbox/work/audit atomic; no 200 on failed persistence; historical items held as specified |
| T12 | Worker restart, stale generation/lease, imported RUNNING/UNKNOWN, preserved cutoff/expiry | One owner; no blind replay; review/payment fingerprints and terminal sends remain effective |
| T13 | Two separate resumed synthetic conversation processes, new DELETE alias, partner isolation | Prior memory and bindings retained; alias maps only to Delete; no cross-partner state or bypass |
| T14 | Receipt, reviewer response, statement, IG/email fallback, model/tool/read paths | Meaningful operations correlated centrally, including denial/failure and existing IG-unknown/email duplicate-risk semantics |
| T15 | Baseline versus new storage at observed peak and synthetic 5x burst | G24 pool ceiling and G25 latency targets met or actual shortfall reported; existing business latency not materially harmed |
| T16 | Restore drill; pre-activation rollback; simulated post-activation failure | Data/session recovery works; stale SQLite cannot be selected after new accepted work; compatible DML instrumentation retained |

Include event/state transition checks, `last_event_id` ownership, final outcome verification, idempotent import mismatch handling, and complete trigger dependency coverage in the relevant cases. Test timeouts/backpressure without changing shared Cloud SQL connection limits. Report median/p95/p99 and sample sizes; do not present unmeasured performance promises.

## Recovery and completion

Before any PostgreSQL-authoritative event, a checked rollback may restore the frozen SQLite backend with its original compatible runtime. Once PostgreSQL has accepted new work, pause effects and prefer fixing forward. Returning to SQLite then requires a separately verified reverse export of every new state, reservation, event/outcome and private artifact. Merely switching the configuration back would lose deduplication and risk duplicate payments/messages.

Leave additive audit objects and their history intact during ordinary rollback. The business capture triggers intentionally reject old uninstrumented DML; keep that capability disabled until compatible host code is installed. Do not drop audit to make old code work, rewrite Flyway history, or reverse financial transactions under the guise of software rollback. Cloud SQL instance-wide restoration affects both business databases and needs its own recovery decision.

The execution deliverable must update the current service catalogue JSON/Markdown together, agent operating/conversation/reviewer guides, configuration examples, deployment/recovery procedures and a coherent change log. In the AppSheet repository, record the internal-schema release/migration and affected model/architecture/recovery documentation without adding audit tables as app data sources. Apply its release checklist and affected workflow checks; app definitions remain unchanged unless an independently identified change is authorized.

Publish checked source and sanitized evidence to each affected repository's current upstream under its instructions. Record exact commits/migration hashes, verified backup references, source/target reconciliation, final backend/generation/flags/cutoffs and unresolved held work. Distinguish implementation complete, DEV verified, production applied and production verified. Missing required checks remain unfinished; no automatic replay is a substitute for closure.

For this design task only, see [design validation](design-validation.json) and [change log](../../../Change%20Logs/CHANGE_NOTES_AGENT_POSTGRESQL_DESIGN_2026-09-22.md). SQL execution, runtime implementation, migration rehearsals and all T01–T16 execution evidence remain pending.
