# Agent PostgreSQL governance and execution design — 22 September 2026

Status: **design complete; implementation/deployment pending**. The owner requested a governance framework, schema/table DDL and handover for another model to execute. No runtime/database/service changes were authorized for this design task or performed.

## Scope and decisions

- Dedicated proposed `mw_agent` database on the existing Cloud SQL instance; central append-only operation/event audit and application-owned SQLite state migration, with no AppSheet audit-table exposure.
- AppSheet API first; generic Codex-selected operations with current AI Reviewer authority for conversational mutations. Approved exact-key DELETE is included; DDL and integrity-trigger bypass remain excluded.
- Same-business-transaction marker and actual row-change capture, followed by idempotent relay to central audit. Explicit API observation limits and uncertain-outcome reconciliation.
- Preserve conversation memory, exact serialized state, review expiry, sender provenance, cutoffs, fingerprints and send reservations. No historical replay or automatic return to stale SQLite.
- No local emergency SQLite queue; fail-closed webhook storage with explicit upstream retry limitations. Bounded pools and measurable performance targets, not a performance claim.

## Artifacts and evidence

Entry point: [HANDOVER.md](../docs/design/agent-postgresql-20260922/HANDOVER.md). The package includes governance, schema/transaction design, a machine-readable SQLite mapping, five guarded `.proposed.sql` candidates, execution sequence, recovery rules and T01–T16 acceptance requirements. README now links this proposal separately from current runtime status.

Starting source commit: `acbc0eb1c3544ec14ddf597ab59b614de8c3814d`, clean `main`, upstream `origin/main`. Read affected source and current catalogue/instructions. A read-only Debian SQLite schema/count inventory observed six production application journal files, 18 present table instances and 351 rows; three source-defined lazy tables were absent. No private record contents were exported. These are dated counts, not a final cutover manifest.

Validation evidence: [design-validation.json](../docs/design/agent-postgresql-20260922/design-validation.json). Offline checks cover mapping totals/targets, source-to-candidate column coverage, local document links, required execution guards and file digests. Git whitespace and intended-file review are part of publication. These checks do **not** parse or execute PostgreSQL DDL, verify Cloud SQL privileges, benchmark latency or test runtime behavior. Official PostgreSQL/Cloud SQL references supporting technical choices are linked in the schema document.

## Rollback, publication and remaining work

Rollback for this batch is a normal Git revert of these design documents/SQL candidates and the README pointer. No live rollback is necessary. No product release or Flyway number is reserved; source catalogue and all runtime code/configuration remain unchanged.

The checked design is published by normal commit/push to the configured upstream. The publication commit is discoverable through this file's Git history; no recursive commit-hash edits are needed.

The future executor must implement adapters and audit instrumentation, register/test migrations, rehearse import and restore, verify permissions/authorization/DELETE/dependencies, measure performance, perform the authorized cutover and document production verification. SQL candidates have not been applied anywhere by this task. No live operational request was processed or replayed.
