# R001 AppSheet production reconciliation — 16 September 2026

Status: **audit complete; reconciliation failed; corrective release required**.

## Scope and purpose

Performed the mandatory object-by-object development-to-production comparison for every AppSheet change grouped under R001. The audit used the recorded R001 definitions as the target because the development apps now include R002 work. Production OLTP 3.000118 and OLAP 1.100098 were inspected through live app documentation, the current editor and current app runtime.

## Result

Assessment, payment/close/default processing, interval-anchor configuration, scheduled automation, Calendar removal and all 24 materialized balance fields reconcile. The Business Expenses, borrower-referral and net-reporting portion does not.

Confirmed production gaps include incorrect LongText Referrer columns, missing borrower form/detail fields, missing OLAP referral VCs and expense reverse references, wrong OLAP Business Expenses key and Ref metadata, missing expense format rules, incorrect money/share formats, a wrong Daily Analytics Business Expenses Ref, the old partner-detail fields, the old settlement validation and missing Analytics Data net fields.

The detailed checklist and object evidence are in [the R001 reconciliation report](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md).

## Rollback point

This task made no AppSheet or database change, so no new rollback point was required. The inspected production versions remain OLTP 3.000118 and OLAP 1.100098. The historical R001 business-expense rollback remains OLTP 3.000108 / OLAP 1.100090 plus the recorded private V14 database backup; it is not authorization to roll back current production.

## Checks performed

- Compared live production and development app documents for the R001 tables, columns, types, Refs, keys, expressions, actions, slices, views and format rules.
- Inspected production bots in the current editor and confirmed the R001 enabled/disabled schedules.
- Synced both production runtimes and opened the affected dashboards, borrower entry/detail paths and Business Expenses form.
- Cancelled every opened form without saving and triggered no bot, notification or financial write.
- Excluded known R002-only differences from the R001 result.

## Documentation changed

- Added the detailed reconciliation report.
- Corrected the R001 release tracker and production business-expense release record.
- Corrected the environment inventory statements that had claimed both AppSheet consumers were reconciled.

## Follow-up and rollback

Create a new corrective release before changing production. Capture current OLTP and OLAP versions, preserve production sources/bots/routes, implement the listed AppSheet metadata and presentation corrections in development first, repeat the object checklist and runtime checks, then request explicit production approval. Documentation-only rollback is Git revert of this audit commit; no application rollback applies to this audit.
