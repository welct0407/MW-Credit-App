# Production and development documentation reconciliation — 2026-09-15

## Scope and authorization

Owner approved the proposed documentation setup and requested the latest documentation. This task changes documentation and supporting read-only inventory/build/check scripts. No AppSheet Save, schema regeneration, bot execution/enablement change, database DDL, financial write, migration, notification or production deployment was performed.

## Rollback point

- Repository baseline: `0a151318a0ddb2d6d3719eadc3979adb78446281`.
- Original workbook preserved byte-for-byte as `Documents/history/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx`; its Git blob hash equals the original: `091b8ff068f671409cd77605c6c6b2c30b249c25`.
- Former overview preserved in `Documents/AppSheet_Data_Model_History.md`, with an explicit historical-status header. Relative links retain their original Documents/ root.
- Raw current app definitions and editor snapshots remain privately under `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\documentation-reconciliation-20260915`. Schema exports are in the established private Flyway folder. Credential/snapshot backup coverage is not established by this task.

## Documentation setup

- `Documents/README.md` is the entry point and update procedure.
- `AppSheet_Data_Model_Overview.md` is the current production architecture reference.
- `AppSheet_Data_Dictionary.xlsx` is rebuilt as the current row-level production inventory, with separate development differences and observed app settings. Historical experiment sheets remain in the archived workbook rather than mixed with current inventory.
- `Development_Changes.md` records unpromoted differences, tests, limitations and promotion criteria; no duplicate independently maintained full development model.
- `Environment_Inventory.md` records identities, bindings, settings, timestamps and verification limits.
- Process/automation/runbook documents have current status annotations. The September 12 process diagram remains a historical workflow synthesis, and the old native migration runbook is explicitly historical.
- Supporting scripts: `scripts/reconcile-documentation.mjs`, `scripts/write-documentation-reference.mjs`, `scripts/check-documentation.mjs`, and read-only `scripts/database/Get-DocumentationInventory.ps1`.

## Fresh evidence

Read-only rendered AppSheet documentation captured 15 September 12:17–12:20 Bangkok:

| App | Version |
| --- | --- |
| Production OLTP | 3.000070 |
| Production OLAP | 1.100046 |
| Development OLTP | 1.000011 |
| Development OLAP | 1.000025 |

The current editor was then inspected for all four apps: 24 sync toggles and 20 bot enabled-states. Production caching is on, development caching is off. All four have Delta Sync off and Quick Sync, sync on start, delayed sync and automatic updates on. These are observed values, not a new recommendation or behavior change. All seven production OLTP bots are enabled. Development retains three transactional bots and disables generation/notifications. Production OLAP's Refresh Daily Analytics Daily 2 is enabled, while its predecessor and export bot are disabled; all three development OLAP bots are disabled.

Fresh direct SSL PostgreSQL reads confirm version 18.6; max_connections production 100 and development 50. Both normalized schema exports exactly equal Flyway V1 SHA256 `0edda94ee69bbcfe1e2b8bf5bad16f7dbbd46af7289a9700bff280b49ea20d38`. Each database contains 14 business/lab base tables, two views, six application functions, ten enabled application triggers and 13 validated foreign keys, plus successful Flyway baseline metadata. Lab objects are physically present in both databases, but production AppSheet still uses its original assessment table/Calendar path.

## Checks performed

- All 41 SQL bindings across four apps checked against expected production/development source and live SQL relation names.
- Every mapped nonvirtual business field checked against SQL columns, excluding the provider-only row ordinal.
- All 28 slices across four apps checked for valid source-column membership.
- Borrower Name VC and exact dereference checked in all four apps.
- Current workbook: 555 production business-column rows, 8,769 detailed property rows, 24 app Ref rows, 14 production slices and 440 membership rows, 164 SQL column rows including views, 41 constraint rows, 16 trigger/function rows, 113 app-definition differences, 44 sync/bot setting rows.
- Literal expressions remain text: zero Excel formula cells. App version displayed as v3.000070 to preserve identifier precision.
- Workbook exported, re-imported and values compared; every current worksheet visually reviewed in representative ranges. Very long expressions retain exact cell values and are available in the formula bar and app-model.json.
- 27 current documentation links checked; no missing links in the four primary documents.
- Original workbook hash verified; no unrelated live configuration changed.
- `scripts/check-documentation.mjs` completed with no issues. `git diff --check` passed.

Evidence: `outputs/documentation-reconciliation-20260915/` contains sanitized app definitions, SQL catalogs, editor settings, verification results and workbook previews. Full private snapshots and credentials are excluded from Git.

## Limitations, review and rollback

No financial lifecycle, scheduled execution, export/notification delivery, Looker audit or sustained capacity load test was run. Current Cloud SQL tier/storage/network/backup settings use their latest dated change logs rather than a new Console audit. Codex analysis scheduler state and first-run acceptance remain unverified. These limits are explicit in the documents; this is not a claim that every operational integration has been retested.

Owner review: confirm the production/development identities and assessment prototype boundary, and review the documentation index/dictionary layout. No financial test transaction is required to accept these documentation changes. Model/design inventory reconciliation is complete; operational acceptance of existing prototypes remains separate.

Rollback: restore only this task's documentation and scripts from the recorded baseline, or revert this task's commit after checking for later edits. No live rollback is necessary because no app/database behavior changed. Do not use historical test-app rollback versions that reconnect to production as part of documentation rollback.

Status: documentation and consistency checks complete. Repository publication follows the owner's standing commit/push authorization; the actual commit and remote state are recorded in Git. Owner review of the documentation remains pending.
