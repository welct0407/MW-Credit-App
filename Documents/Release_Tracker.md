# Release tracker

Established 16 September 2026. **Current recorded production baseline: R001. Next available release number: R004.**

## Numbering and chat names

- Use one project-wide sequence: **R001, R002, R003…** across OLTP, OLAP, SQL and related reporting. A release groups one coherent change, even when it affects multiple components or spans several chats.
- Suggested chat title: **R002 — Short feature name**. A continuation keeps the same number. Independent work reserves a different number.
- Before starting a new release, read this tracker, reserve the next number with its actual scope and status, and advance the next-available number. Commit/push the reservation before parallel sessions depend on it. Re-read the latest tracker before allocation to avoid duplicate numbers.
- Never reuse or renumber a reserved release, including cancelled releases. Use the highest allocated number plus one; minimum three digits. Production deployment order may differ from allocation order, so record deployment dates explicitly.
- Use statuses **Planned**, **In development**, **Ready for review**, **Approved**, **Released**, **Rolled back**, or **Cancelled**. Record user acceptance separately from test completion. A release number or Git push is not production approval.
- AppSheet versions, Flyway versions and Git commits remain independent technical identifiers. Record them under the release; do not rename existing migrations or infer that R002 means Flyway V2.
- Update the summary, scope, status, tests, approval reference, deployed versions/commit and rollback links as the release progresses. Link detailed Markdown change logs rather than duplicating all evidence here. Include the release number in future change logs and completion messages.
- Documentation-only maintenance of this tracker stays outside the product release sequence. Do not allocate R002 merely for setting up numbering. Do not rename a chat automatically unless requested.

## Releases

| Release | Title and content summary | Status | Date | Technical versions / evidence |
| --- | --- | --- | --- | --- |
| **R001** | **Existing production baseline.** PostgreSQL-backed OLTP/OLAP; SQL loan assessment; atomic payment, loan-close/default and charge processing; monitored schedules and SQL Daily Analytics without AppSheet Calendar; materialized operational balances; business expenses, referral rebates, net partner reporting and income-statement dashboards. | **Released — AppSheet reconciliation failed; corrective release required** | Recorded 2026-09-16; post-release audit 2026-09-16 | Production remains OLTP **3.000118**, OLAP **1.100098**, Flyway **V16**. Earlier AppSheet scopes reconcile; business-expense/referral/net-reporting configuration does not. [Audit](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md). |
| **R002** | **Development loan cashpool safeguard, owner-only Dev notification policy, and borrower-name navigation.** Row ID keys preserved; short bracketed principal limit and Collection label/color cleanup included. | **Ready for review** | Reserved 2026-09-16 by owner request | Dev OLTP **1.000108**, OLAP **1.000096**, Flyway **V18**, initial implementation **b040cb8**, native Ref correction **f3a0d66** (supersedes rejected **81706ae**); one-row form context and immediate warning implemented; SQL and current-GUI checks passed; owner acceptance pending. [Change log](../Change%20Logs/CHANGE_NOTES_R002_2026-09-16.md). Owner acceptance and production approval pending. |
| **R003** | **Correct R001 production AppSheet reconciliation gaps.** Repair borrower Referrer metadata/views, Business Expenses keys/Refs/types/formatting, expense and settlement validation, Daily Analytics expense metadata, referral reverse lists/VCs/slices, partner net presentation and Analytics Data fields. | **In development** | Reserved 2026-09-16; owner authorized production correction | Rollback: production OLTP **3.000118**, OLAP **1.100098**. No database migration. [Change log](../Change%20Logs/CHANGE_NOTES_R003_PRODUCTION_APPSHEET_RECONCILIATION_2026-09-16.md). |

R002 is reserved for the owner's requested development scope. Earlier work did not carry these release numbers; R001 groups the existing state rather than inventing historical release IDs. The baseline inventory is based on checked-in deployment records, not a fresh live audit.

## R001 evidence and recovery

- [Environment inventory](Environment_Inventory.md): identities, bindings and recorded versions.
- [Assessment promotion](../Change%20Logs/CHANGE_NOTES_ASSESSMENT_PROMOTION_2026-09-15.md): SQL assessment and input/readback verification.
- [Database workflow and deployment history](../database/README.md): atomic financial workflows and Flyway history.
- [Monitored jobs and Calendar removal](../outputs/monitored-jobs-production-20260916/REPORT.md): AppSheet schedules and SQL date-range analytics.
- [Materialized balances](../outputs/vc-materialization-20260916/REPORT.md): operational derived fields and measured performance.
- [Business expense production promotion](../Change%20Logs/CHANGE_NOTES_BUSINESS_EXPENSES_PRODUCTION_2026-09-16.md): latest deployment, checks and recovery instructions.
- [Post-release AppSheet reconciliation](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md): live object checklist; failed business-expense/referral/net-reporting parity and required corrective release.

R001 is a composite baseline, not a single deployable migration or universal restore point. Use the relevant change's coordinated app/database recovery instructions. The latest expense release records pre-release app versions OLTP 3.000108 and OLAP 1.100090 plus its verified private database backup. Do not use an older component's app rollback independently over newer SQL.

## New release entry checklist

When reserving R002 (or the next available number), add a row with a concise title, included components, status and reservation date. Link its change log and record development versions, tests/performance where relevant, owner decision, exact release commit/database manifest, production versions/date, known limitations and rollback reference as they become available. Use “pending” for unknown evidence; never label a planned release as deployed.
