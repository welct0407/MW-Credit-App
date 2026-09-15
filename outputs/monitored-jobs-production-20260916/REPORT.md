# Production promotion of monitored jobs and phase 7

Status: implemented and verified on 16 September 2026. Owner post-promotion device acceptance remains pending. Production is Flyway V11, OLTP 3.000098 and OLAP 1.100081.

## Scope and result

- OLTP `Generate Daily Charges` is enabled daily at 00:05 Bangkok. It retains the reviewed eligibility filter and writes the existing SQL request. The production `loan-daily-charges` pg_cron job is paused.
- OLAP `Refresh Daily Analytics Daily` is enabled hourly at :00 Bangkok. It writes a Recent request to the Statistics singleton. Manual Recent and confirmed Full actions use the same request trigger.
- The duplicate Calendar analytics bot, Calendar binding, Calendar views and obsolete delete/create actions were removed. Daily Analytics is read only. Historical SQL Calendar objects remain for recovery.
- V11 added the approved nullable `Statistics.Analytics Refresh Request`, a unique snapshot-date index, atomic SQL upsert and request trigger. No production financial rows were inserted for testing.

## Rollback evidence

- AppSheet rollback: OLTP 3.000094 and OLAP 1.100062.
- Database rollback: production V10 normalized hash `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`.
- Private dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-production-20260916/production-before.dump`; SHA256 `9c193e5ee7161d793a604e4a51cac8a2bdbdf5a29ffa2e9466bca76286b37224`.
- The dump lists 146 entries. An isolated local restore passed for the normalized schema and all 14 business tables. Only Cloud SQL-owned pg_cron extension metadata was excluded because the workstation PostgreSQL build does not provide pg_cron.

## Verification

- Flyway migrated V10 to V11 in 84 ms and validated all 12 migrations.
- A clean local V1–V11 rebuild, second-run no-op and checksum-tamper rejection passed. Core payment, atomic close, charge generation, default and analytics functional/concurrency regressions passed.
- Both production apps regenerated the shared Statistics schema, saved, loaded and synced in the current GUI. OLAP loaded its Dashboard after Calendar dependency cleanup.
- Manual Recent and Full requests completed in Automation Monitor. The first natural hourly run completed at 01:00:04 Bangkok.
- Independent reconciliation matched 43/43 snapshot dates against the former AppSheet Model 2 expressions. Existing 42 row IDs retained hash `fd38dfada9606e1764d8982e8a417763`; all 43 IDs hash to `9b8b2ad7ce1c518d4541e61810f01f16`.
- Production contains one Statistics row, 43 analytics rows, no duplicate/null snapshot dates and no duplicate generated loan/date charges. The 22 charges for 16 September were created by the previously scheduled pg_cron run before cutover; no additional charge-generation test was submitted.
- The first natural 00:05 production charge run under AppSheet remains pending. Error-email delivery and Looker/offline behavior were not tested.

## Recovery

Disable and verify the affected AppSheet schedules before any rollback. Restore OLTP 3.000094 and OLAP 1.100062 together. V11 is additive and may remain dormant; removing or correcting it requires V12+. If a database restore is necessary, reconcile every production write after the backup timestamp before restoring. Never enable pg_cron while the corresponding AppSheet schedule is active.

Aggregate SQL, Flyway, restore, spreadsheet and monitoring evidence is retained in this directory. Credentials, private backup contents and unrestricted production data are excluded.
