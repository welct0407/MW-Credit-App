# Agent PostgreSQL implementation — 22 September 2026

Owner authorized implementation and scoped rollout of `docs/design/agent-postgresql-20260922/HANDOVER.md`. Starting commit `2ab6253ecd1faea93efe3a4cbc6e074dc5210708`, clean main. The design remains dated evidence; this log records implementation and actual verification.

Scope: central PostgreSQL state/audit, migration of application-owned SQLite journals, reviewer-only generic API-first operations including DELETE, transaction capture/relay, recovery and operational documentation. Business schema tracked as R015 in the AppSheet repository. No historical request replay or unrelated production financial test is authorized.

Status: implementation in progress; running system unchanged. Laboratory tests, private backup/restore, DEV validation, cutover and production verification pending. Source rollback starts at the recorded commit. Live rollback follows the handover; no automatic fallback to stale SQLite after new PostgreSQL work.

## Checked implementation checkpoint

Central V1–V3 installed in the new Cloud SQL `mw_agent` database on 22 September; 29 application/audit/migration tables plus independent deployment history. Worker and relay have separate private credentials; owner roles remain NOLOGIN. Backend activation is still pending. No business records changed by provisioning.

Implemented PostgreSQL adapters for six journals, atomic ingress queue, preserved thread binding/snapshots, immutable intent/events, provider/job/tool audit, reviewer-only approved DELETE, API-first fallback reason, V33 transaction capture, idempotent outbox relay and unknown-commit reconciliation. Raw SQL/DDL are not model tools. See `docs/POSTGRESQL_OPERATIONS.md`.

Verification: 166 local tests passed (17 Linux/optional tests skipped; all 12 PostgreSQL integration tests ran). Synthetic full journal import verifies bytes/Thai text/epochs/status/memory/sequence; repeat import and changed migration hashes rejected. Approved DELETE captures before-image, stale reviewer denies/rolls back, audit tampering denied, and simulated lost central acknowledgement reconciles without repeating the business write. Full business migration/financial/concurrency CI passed; private DEV/PROD backups restored with all 22 table fingerprints matching. V33 applied successfully to DEV. Cloud SQL backup/PITR is enabled. No outbound or production financial fixture test was performed.

Pending: final Debian tests, frozen private recovery archive, real journal import, production V33 promotion and grants, backend generation activation, performance/GUI checks and publication closure. Old state remains authoritative until cutover.

## Cutover applied

Debian writers drained, ingress paused at 06:49 UTC, and private recovery archive restored with 3,513 matching file hashes. Source deployed commit was acbc0eb (the later 2ab6253 checkpoint contained design documentation only). All six journals imported atomically: 351 rows across 21 source tables and three frozen snapshots; both conversation bindings preserved. All 30 central tables restored from a fresh private logical backup with matching fingerprints. Production business V33 promoted from exact tested commit a3b19c8 and validated successfully; restricted grants applied.

Generation 601f93f8-b73e-46bc-b495-af3ebc562154 is active. Existing cutoffs/model settings remain intact; backend cutoff is the recorded writer-stop time. Ingress and the five original timers resumed at 13:58 Bangkok; the new relay timer is active. Receipt, conversation and relay cycles completed successfully, with zero historical conversation turns attempted. Central VM warm read transactions: 30 samples, median 10.71 ms, p95 11.79 ms, max 17.88 ms. This is database-read overhead, not an end-to-end model response benchmark.

The systemd relay smoke test found an omitted CLI catalogue argument; corrected before enabling its timer. A compatibility review found the old-thread Delete alias omitted registration of the returned verification observation; corrected with tests for observation retention and rejected extra fields. These refinements do not change migrated data or the installed immutable schema.

Remaining closure: final live app/worker checks, real synthetic resumed-model Delete test, documentation and final publication. No business correction, production deletion or outbound test was submitted.

## Verified closure

Both production AppSheet editors remain Deployed, with Save disabled, no visible configuration issue badges, unchanged versions and loaded fresh previews. No app definitions or data sources changed. Normal PostgreSQL-backed receipt, conversation, polling, retry and relay jobs completed successfully; outbox backlog is zero. Real two-process Codex resume preserved its thread and memory and selected the old-schema Delete alias in a synthetic-only test (one simulated delete, zero production writes/messages).

All 18 PostgreSQL backend tests pass (15 live lab integration and three dialect checks), including unexpected trigger deletion rollback, late transaction commit queue visibility and audit-unavailable pre-dispatch denial. Final deployed code checkpoint is 477405f8f7b277d59578ec8d8a3788909fd23013; 168 Debian tests completed (142 passed, 26 optional database tests skipped on the production VM). Separate local PostgreSQL tests supply that database coverage. No instance resize/network/connection-limit change was required. The next daily cash-statement send follows its existing schedule; no live notification was forced for validation.

R015 business release records, dictionary and architecture record the deployed internal objects; generic state/audit schema and operations are owned here. Retain all private pre-cutover archives and the source SQLite files as dated recovery evidence. Do not reactivate stale SQLite or drop audit history. Work is implemented and verified; final Git publication records recovery coverage for source/evidence, not private runtime data.
