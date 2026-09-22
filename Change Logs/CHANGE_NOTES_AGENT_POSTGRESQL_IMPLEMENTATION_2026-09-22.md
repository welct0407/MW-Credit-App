# Agent PostgreSQL implementation — 22 September 2026

Owner authorized implementation and scoped rollout of `docs/design/agent-postgresql-20260922/HANDOVER.md`. Starting commit `2ab6253ecd1faea93efe3a4cbc6e074dc5210708`, clean main. The design remains dated evidence; this log records implementation and actual verification.

Scope: central PostgreSQL state/audit, migration of application-owned SQLite journals, reviewer-only generic API-first operations including DELETE, transaction capture/relay, recovery and operational documentation. Business schema tracked as R015 in the AppSheet repository. No historical request replay or unrelated production financial test is authorized.

Status: implementation in progress; running system unchanged. Laboratory tests, private backup/restore, DEV validation, cutover and production verification pending. Source rollback starts at the recorded commit. Live rollback follows the handover; no automatic fallback to stale SQLite after new PostgreSQL work.

## Checked implementation checkpoint

Central V1–V3 installed in the new Cloud SQL `mw_agent` database on 22 September; 29 application/audit/migration tables plus independent deployment history. Worker and relay have separate private credentials; owner roles remain NOLOGIN. Backend activation is still pending. No business records changed by provisioning.

Implemented PostgreSQL adapters for six journals, atomic ingress queue, preserved thread binding/snapshots, immutable intent/events, provider/job/tool audit, reviewer-only approved DELETE, API-first fallback reason, V33 transaction capture, idempotent outbox relay and unknown-commit reconciliation. Raw SQL/DDL are not model tools. See `docs/POSTGRESQL_OPERATIONS.md`.

Verification: 166 local tests passed (17 Linux/optional tests skipped; all 12 PostgreSQL integration tests ran). Synthetic full journal import verifies bytes/Thai text/epochs/status/memory/sequence; repeat import and changed migration hashes rejected. Approved DELETE captures before-image, stale reviewer denies/rolls back, audit tampering denied, and simulated lost central acknowledgement reconciles without repeating the business write. Full business migration/financial/concurrency CI passed; private DEV/PROD backups restored with all 22 table fingerprints matching. V33 applied successfully to DEV. Cloud SQL backup/PITR is enabled. No outbound or production financial fixture test was performed.

Pending: final Debian tests, frozen private recovery archive, real journal import, production V33 promotion and grants, backend generation activation, performance/GUI checks and publication closure. Old state remains authoritative until cutover.
