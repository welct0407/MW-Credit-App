# Development differences

Updated 15 September 2026 against production OLTP 3.000070 / OLAP 1.100046. Development versions are OLTP 1.000011 / OLAP 1.000025. Maintain this difference register alongside the single [production model](AppSheet_Data_Model_Overview.md); do not maintain a second independently edited full dictionary.

## Current differences

| Area | Production | Development | Promotion status |
| --- | --- | --- | --- |
| Database instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Isolation is intentional; never promote the development host |
| AppSheet source | database-2 | database-3 | All copied app SQL sources isolated |
| Loan Assessment | Original table and AppSheet forecast VCs | Loan Assessment SQL Lab View over Loan Assessment SQL Lab | Prototype; owner acceptance and production app rollout pending |
| Calendar | Calendar Help Table / Sheet1 | OLAP Calendar SQL Lab generated view | Prototype replacement; fixed 153-day horizon |
| Assessment outputs | Original AppSheet calculations | Stored SQL outputs read through guarded VCs | Input update fires calculation/stamp triggers; sync retrieves results |
| Navigation | Production companion app | Other development copy | Keep environments isolated |
| SQL schema | Flyway baseline 1 | Identical Flyway baseline 1 | No schema drift at current capture; schema equality does not mean equal app behavior or data |
| Connections | 100 limit | 50 limit | Environment configuration; not a migration |

The workbook's **Dev Differences** sheet contains the exact current table, business-column, slice, action and view differences. Full definitions are in the captured app-model.json. AppSheet-generated internal process schemas may differ when disabled processes are omitted; they are not PostgreSQL business tables. Captured differences are observed configuration, not automatic promotion instructions.

## Assessment prototype design

The lab assessment table retains five input fields and adds 18 result/metadata fields. Its view adds SQL Source Current. Including the provider row ordinal, AppSheet exposes 25 provider fields and 16 VCs; nine result VCs read stored outputs with input/fingerprint/date freshness guards. Calendar retains its Date key and ten descriptive VCs over generated dates from 2026-08-01 through 2026-12-31.

The assessment_calculate and assessment_stamp BEFORE-row triggers calculate and stamp an inserted/updated assessment row. Refresh Assessment action was removed at the owner's request; its unused hidden token remains for reversible schema preservation. An ordinary sync reads results but does not recalculate an unchanged row. Unsynced/mismatched inputs show the bilingual waiting-for-results message; stale source data/as-of dates show an out-of-date message. Offline clients cannot detect unseen database changes.

Production physically contains the same lab objects, but its app remains on the original sources/formulas. This distinction is verified in the source bindings. SQL functions/trigger bodies are versioned in Flyway V1 and fresh development/production schemas match exactly.

## Test evidence and open work

The [assessment report](../outputs/assessment-sql-20260915/REPORT.md) records prior independent correctness comparisons and five interleaved sync pairs: median 6.734 to 5.613 seconds, **16.6% faster**, with 15.072 ms median SQL refresh over ten runs. These are historical prototype measurements, not a new production benchmark.

The [development verification](../outputs/development-instance-20260915/verification.json) records isolated bindings, new-GUI sync, a restored assessment input test, and prior constraint/normalizer rejection checks. Development is a snapshot, not a continuously synchronized replica; Daily Analytics differed in contents at that test. Current schema capture does not certify data equality.

Before promotion: review the fixed forecast horizon, the shared MAIN input row versus per-user workflow, automatic recalculation expectations when source data changes, current sync settings, and owner acceptance. Run affected OLAP and OLTP workflows in the new GUI and remeasure against current production capacity. Do not migrate development financial data into production.

## Automation isolation and maintenance

Fresh current-editor checks confirm transactional OLTP bots retained, daily generation/notifications disabled, and all three OLAP schedule/export bots disabled. Production server caching is on while development server caching is off. Other observed sync toggles match: Delta off; Quick Sync, sync on start, delayed sync and automatic updates on. See Environment Inventory for all current values. Recheck isolation before future write testing; this read-only review did not execute bots.

For a new change, record its migration/version, consumers, exact expressions, tests, measured results, owner decision and rollback. After an approved production deployment, update the production overview and dictionary and close the corresponding difference. Preserve earlier decisions in Change Logs. App rollback versions that restore database-2 would reconnect development apps to production; do not use them casually.
