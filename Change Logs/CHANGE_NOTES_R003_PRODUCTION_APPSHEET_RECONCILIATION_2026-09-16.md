# R003 — Production AppSheet reconciliation correction — 16 September 2026

Status: **In development.** The owner explicitly instructed: “fix all the gaps in prod”. This authorizes the listed production AppSheet corrections, but no database, Looker, notification-recipient or financial-record change.

## Scope

Correct every failed object in the [R001 AppSheet reconciliation report](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md): borrower Referrer metadata and views; OLAP referral VCs and reverse relationships; Business Expenses key, Refs, types, validation, formatting and deck settings; Daily Analytics expense/net metadata; partner net detail fields and labels; settlement edit-safe validation; affected slices; and Analytics Data net fields.

R002 changes remain outside this release and must not be copied to production.

## Rollback points and gate

- Production OLTP `93844270-6aa5-420b-a960-bcdf08abd357`: **3.000118**.
- Production OLAP `e74dd368-654f-44d7-bccf-83cf361d1cdb`: **1.100098**.
- Both apps were runnable/deployable on `database-2` when the failed reconciliation was recorded.
- No database migration or data write is required. Existing R001 database state remains Flyway V16.
- Preserve production bots, destinations, sources and cross-app links. Do not trigger test notifications or save test financial records.

## Planned verification

- Re-read saved production app documentation and compare each R003 object with the intended R001 definition.
- Confirm production versions and editor issue state after every save.
- Reopen the production OLTP borrower form and Business Expenses form without saving.
- Reopen production OLAP borrower and partner details plus Dashboard/Analytics entry points.
- Confirm scheduled bot states are unchanged.
- Update this log and the release tracker with saved versions, checklist results and remaining limitations.

## Rollback

Restore OLTP 3.000118 and/or OLAP 1.100098 only if the corresponding corrective save introduces an AppSheet problem. Because this release has no database change, do not restore the R001 V14 database backup as part of ordinary R003 rollback.
