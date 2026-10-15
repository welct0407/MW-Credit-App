# Monitored jobs and phase 7

Status: development accepted; production implemented and verified on 16 September 2026. Owner post-promotion device acceptance remains pending.

## Purpose and scope

Move daily charge scheduling from unmonitored pg_cron to AppSheet Automation Monitor, move Daily Analytics refresh into an atomic SQL request/upsert, and remove the external Calendar dependency. The SQL charge and analytics engines remain the business-rule owners; AppSheet supplies monitored schedule and manual commands.

## Production implementation — 16 September 2026

- Owner authorization: “move these changes into production.” The subsequent “Yes go ahead” authorized deletion of the obsolete production Calendar objects in AppSheet.
- Applied exact immutable Flyway V11 from reviewed commit `99839565b27744141417ddb9b4b504fecaeee540`. Production migrated V10→V11 and all 12 migrations validate.
- OLTP saved as 3.000098. Statistics includes hidden, read-only `Analytics Refresh Request`. `Generate Daily Charges` is enabled daily at 00:05 Bangkok; the old first-day/payment processing bots remain disabled and notification bots remain enabled.
- OLAP saved as 1.100081. Statistics includes the hidden request field; Recent/Full Dashboard actions write dated request tokens. Daily Analytics is read only. Hourly `Refresh Daily Analytics Daily` is enabled at :00 Bangkok with one inline request step.
- Removed duplicate `Refresh Daily Analytics Daily 2`, Calendar table binding, `Calendar Detail View`, `Sheet1_Detail`, and the three obsolete Calendar analytics actions. Historical SQL Calendar objects remain for recovery.
- Paused production pg_cron `loan-daily-charges`. No instance, network, credential, notification-recipient or Looker change was made.

## Rollback points

Before production editing: OLTP **3.000094**, OLAP **1.100062**, database **V10**. The normalized V10 schema hash was `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`.

Private dump `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-production-20260916/production-before.dump` has SHA256 `9c193e5ee7161d793a604e4a51cac8a2bdbdf5a29ffa2e9466bca76286b37224`. Its normalized schema and 14 business tables restored in an isolated local PostgreSQL instance; only unavailable Cloud SQL pg_cron extension metadata was excluded.

For rollback, first disable and verify both AppSheet schedules. Restore both app versions together. Additive V11 may remain dormant; SQL removal/correction requires V12+. Before a database restore, reconcile all later production writes. Never overlap the AppSheet and pg_cron schedules.

## Checks

- Flyway production migrate and validate passed; pg_cron reports inactive.
- Clean local V1–V11 rebuild, no-op/checksum controls, and core payment, atomic close, charge generation, default and analytics functional/concurrency regressions passed.
- Both production apps loaded and synced in the current AppSheet GUI after regeneration. Shared Statistics configuration reconciles. OLAP Dashboard loads and Calendar is absent.
- Manual Recent and confirmed Full analytics actions completed. The first natural hourly run completed at 01:00:04 Bangkok in Automation Monitor.
- Independent SQL comparison matched 43/43 dates and 12 stored metrics against the former Model 2 expressions. Existing 42 snapshot IDs remained stable. No duplicate/null dates exist.
- No production financial test transaction was submitted. The 22 daily charges for 16 September predate scheduler cutover and contain no duplicate loan/date pairs.
- The first natural production AppSheet daily-charge run at 00:05 remains pending. Error-email delivery, offline/multiple-device behavior and Looker were not tested.
- Data-model overview and dictionary, development difference register, environment inventory, database README, maintained audit scripts and aggregate release evidence were updated together.

## Development acceptance

Development remains V11 / OLTP 1.000048 / OLAP 1.000050. The owner accepted both apps after sync. Natural hourly analytics and 24 daily charge runs completed; 42 original dates reconciled with stable IDs. Error-email delivery was not observed. Full evidence remains in [the development report](../outputs/monitored-jobs-20260915/REPORT.md).

## Manual production acceptance

On the owner's device, sync both production apps, confirm Calendar is absent and OLAP Dashboard charts load, confirm Recent/Full actions remain visible only on Dashboard, and review the next natural OLTP 00:05 and OLAP hourly run in Automation Monitor. Report any push, sync or metric discrepancy before marking the release accepted.
