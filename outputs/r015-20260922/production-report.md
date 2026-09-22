# R015 production verification

Released 22 September 2026. The owner authorized execution of the approved PostgreSQL handover. V33 was tested in DEV, pinned at `a3b19c839820d70da9ecfe7129468e32b46b8f30`, promoted through the existing Flyway runner and validated in PROD. Initial validation identified only the expected pending V33; migrate and final validation succeeded. Both apps are unchanged: PROD OLTP 3.000245 / OLAP 1.100194; DEV OLTP 1.000075 / OLAP 1.000031.

## Result

- Separate `mw_agent` database on the existing Cloud SQL instance, central schema V1–V3. All six application journals migrated: 351 rows across 21 source tables, three immutable statement snapshots and two preserved conversation bindings. Codex-owned session/auth files remain on Debian.
- Internal `agent_audit` commit, row-change and export tables with ten capture triggers in each business database. Reviewer SQL writes and actual row effects are recorded atomically; a restricted relay copies them idempotently to central append-only audit. Audit tables are excluded from AppSheet. Owner roles are NOLOGIN; worker, relay and reviewer credentials are separate.
- Current AI Reviewers can request generic API-first create/update/delete. Codex chooses structured calls from current metadata, without per-business-operation scripts. SQL fallback requires a capability or atomicity reason. DELETE needs exact keys, including every approved child key; unexpected dependent deletion rolls back. Existing financial guards remain; raw SQL/DDL are not model tools.
- PostgreSQL-backed Debian processing resumed at 13:58 Bangkok. Original cutoffs, model settings and memory retained. Generation fencing and delayed-event quarantine prevent accidental replay. All original timers/ingress and the new 30-second relay are active; normal worker cycles complete successfully and outbox backlog is zero.

## Verification and recovery

Full PostgreSQL 18.6 migration/financial/concurrency CI passed. All 18 agent PostgreSQL backend tests passed (15 live lab integration and three dialect checks), including approved DELETE, unexpected trigger deletion rollback, reviewer revocation, immutable audit, uncertain-commit reconciliation without replay, late-commit queue visibility and audit-unavailable dispatch denial. The deployed Debian suite completed 168 tests: 142 passed and 26 optional database tests skipped; separate disposable PostgreSQL tests provide that coverage. A real two-process Codex resume preserved memory and selected the Delete compatibility route using synthetic transports only.

Current DEV and PROD editors are Deployed, Save disabled, with no configuration issue badges. All four fresh app previews loaded. Sources, forms, API keys, recipients, schedules and guards are unchanged; existing configuration evidence remains applicable. No RC or App Upgrade was required.

Private DEV/PROD V32 dumps restored with all 22 table fingerprints matching. The stopped Debian package/configuration/state/session archive restored with 3,513 matching file hashes. All 30 central database tables restored with matching fingerprints. Cloud SQL automated backups/PITR are enabled. Recovery artifacts remain outside Git. After new central work, never restore stale SQLite or run the old uninstrumented reviewer writer against V33; stop affected workers and reconcile/repair forward while preserving later events and audit.

VM warm central reads: 30 samples, median 10.71 ms, p95 11.79 ms, max 17.88 ms. This measures storage overhead, not full model response time. No instance sizing/network changes were needed. No production financial fixture, delete or forced notification was used; the daily statement follows its existing schedule.

Dictionary DB sheets gained 24 columns, 38 constraints and 17 logic/reference rows. All prior values/formulas/styles, panes, validations and merges were preserved. Architecture, inventory, development register and operations were updated. Concurrent Metabase work remains outside R015.

Evidence: [SQL verification](production-sql.json), [DEV verification](development-validation.json), [Flyway manifest](flyway-manifest.json), [backup](production-backup.json), [dictionary checks](dictionary-verification.json), and the [single checklist](promotion-checklist.md). Agent implementation/governance: [MW-Integration-Agent](https://github.com/welct0407/MW-Integration-Agent), deployed code `477405f8f7b277d59578ec8d8a3788909fd23013`. Final business evidence tag: `R015`.
