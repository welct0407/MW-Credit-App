# Release tracker

Recorded PROD baseline: **R009**. Next available number: **R011**. R010 remains Ready for review, not accepted or authorized for production. Numbering/approval rules are in [AGENTS](../AGENTS.md#project-release-tracking--owner-rule-16-september-2026).

| Release | Scope / dependency | Status | Latest milestone | Evidence |
| --- | --- | --- | --- | --- |
| R010 | OLTP payment-entry validation; depends on R009 | Ready for review | 2026-09-20 DEV ready; acceptance/promotion pending | [Report](../outputs/r010-20260919/REPORT.md) · [change log](../Change%20Logs/CHANGE_NOTES_R010_2026-09-19.md) |
| R009 | Partner login/delivery, closure notifications, rate correction and owner GUI refinements | Released | 2026-09-19 | [Report](../outputs/r009-20260919/production/REPORT.md) · [manifest](../outputs/r009-20260919/release-manifest.json) |
| R008 | Cash accounts and account-aware payment commands | Released after correction audit | 2026-09-19 | [Correction audit](../outputs/r008-20260918/production-correction/REPORT.md) · [original production record](../outputs/r008-20260918/production/REPORT.md) |
| R007 | SQL analytical views for OLAP | Released | 2026-09-18 | [Flyway manifest](../outputs/r007-20260918/flyway-manifest-r1.json) · [the report](../outputs/r007-20260918/REPORT.md) |
| R006 | Four OLTP formula optimizations | Released | 2026-09-18 | [PROD comparison](../outputs/r006-20260918/prod-comparison-r1.json) · [PROD observations](../outputs/r006-20260918/prod-saved-observations.json) |
| R005 | Cash custody, reversals and dashboard refinements | Released | 2026-09-18 | [Evidence and rollback](../outputs/r005-20260917/PRODUCTION_REPORT.md) · [history](../Change%20Logs/CHANGE_NOTES_R005_2026-09-17.md) |
| R004 | Bilingual referral expense category | Released — owner-approved export-coverage exception | 2026-09-17 | [Checklist, manifest, exception and recovery](../Change%20Logs/CHANGE_NOTES_R004_2026-09-17.md) |
| R001 | Composite original production baseline; reconciled by R003 | Released — reconciled by R003 | 2026-09-16 | [Audit and resolution](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md) |
| R002 | Loan capacity safeguard and borrower navigation | Released | 2026-09-16 | [Checklist](../outputs/r002-20260916/PROMOTION_CHECKLIST.md) · [production evidence](../outputs/r002-production-20260916/REPORT.md) |
| R003 | Reconcile missing R001 AppSheet configuration | Released | 2026-09-16 | [Evidence](../outputs/r003-production-appsheet-reconciliation-20260916/REPORT.md) · [change log](../Change%20Logs/CHANGE_NOTES_R003_PRODUCTION_APPSHEET_RECONCILIATION_2026-09-16.md) |

R010 [promotion checklist](../outputs/r010-20260919/promotion-checklist.md) is the continuation record for its remaining promotion work. R009 RCs were retired with owner approval; their former app IDs are not live rollback sources.

Maintain one short row per release. Versions, tests, decisions and recovery belong in the linked manifest/log/checklist; current identities belong in [Environment Inventory](Environment_Inventory.md). Preserve reserved numbers and distinguish acceptance from production authorization. Detailed past entries are retained in the [dated archive](archive/2026-09-20/Release_Tracker.md).
