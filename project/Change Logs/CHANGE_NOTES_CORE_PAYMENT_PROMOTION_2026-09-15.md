# Production promotion of transactional phases 1–6

15 September 2026. **Status: live in production; safe app/schema checks complete.** First natural nightly run and ordinary production device feedback remain unobserved. Owner explicitly requested promotion of the tested phases 1–6.

## Scope and purpose

Promoted exact Flyway V6–V10 from clean tested commit `33ed313f585311dcd0caffb1488ea8ac574bfb6e`. Unified receipt posting, first-day processing, final-charge preparation, manual/nightly generation and Default Loan posting now run in production SQL. AppSheet submits commands and sends SQL-aware partner notifications. OLAP shared-column references, reporting slice, permissions and baht loss display are reconciled.

## Rollback point

- Production OLTP **3.000080**, OLAP **1.100056**, database V5.
- Fresh logical backup restored successfully, with V5 schema and all 14 original table fingerprints matching. Private backup hash `031c7015f17f66c22e1ac7beffd758890e46e052fc9b6cb121bb96fcf3a64b2b`.
- Cloud backup completed 21:46:22 Bangkok; PITR and deletion protection enabled.

## Changes and checks

- Production migrated V6–V10 at 22:07:33; Flyway validate passed. Final normalized schema matches development/rebuild: `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`.
- Final production app versions **3.000094 / 1.100062**, no editor errors, both current GUIs synced. Unsaved payment form cancelled. No production financial test transaction or forced push.
- Original core records unchanged; no historical backfill and zero Processing/Error receipts. Existing hourly OLAP analytics refreshed its snapshot; its changed fields are explicitly recorded in the report.
- Four notification-only production bots enabled; three financial bots disabled. Twelve obsolete sub-actions disabled; close/default/manual-generation commands updated.
- Production pg_cron flags configured, existing IAM/max_connections preserved. Nightly job enabled 22:50:48 at 00:05 Bangkok; first due 16 September. Development scheduling unchanged.
- Data-model overview and XLSX dictionary updated together, plus environment inventory, development differences, database README and phase-6 acceptance cross-reference. Dictionary round-trip and native-feature checks completed.
- Maintained production schedule/audit runners and documentation builders added. Evidence is in `outputs/core-promotion-20260915/`; private backup and credentials stay outside Git.

## Follow-up and downstream scope

Sync both production apps before use. Review the next required real receipt/close/default and its partner alert; after 00:05 check cron success and one charge per eligible loan/date. Do not post synthetic production records. Retained default charge rows can affect count-based reports. Looker/export delivery, offline/multiple-device recovery and app-speed improvements were not verified here.

## Recovery

Pause entry and nightly generation, reconcile pending commands, then apply a tested coordinated SQL/AppSheet forward-fix (V11+) or explicitly approved recovery. Never restore old financial bots against the new SQL processors. Retain posted history and nullable references. A pre-release database restore would lose later activity and requires a reconciliation plan. See [full release report](../outputs/core-promotion-20260915/REPORT.md) for exact backup location, manifest, settings, limitations and rollback steps.

Repository publication: completed by the task commit containing this log and release evidence; verify the configured upstream before claiming GitHub recovery coverage. Repository publication does not back up private credentials or the private logical dump.
