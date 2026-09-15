# Development differences

Updated 15 September 2026 for production OLAP **1.100051**, development OLAP **1.000027**, and the lump-sum replacement in development OLTP **1.000014**. Production OLTP retains its earlier **3.000070** capture. Maintain this difference register alongside the single [production model](AppSheet_Data_Model_Overview.md); do not maintain a second independently edited full dictionary.

## Current differences

| Area | Production | Development | Promotion status |
| --- | --- | --- | --- |
| Database instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Isolation is intentional; never promote the development host |
| AppSheet source | database-2 | database-3 | All copied app SQL sources isolated |
| Loan Assessment | Loan Assessment SQL Lab View over Loan Assessment SQL Lab | Same logical design on isolated DB | Promoted by owner authorization in production 1.100051 |
| Calendar | OLAP Calendar SQL Lab generated view | Same generated view | Promoted; fixed 153-day horizon retained |
| Assessment outputs | Stored SQL outputs read through guarded VCs | Same column definitions | All 53 assessment/Calendar columns match; automatic production edit/readback/restoration passed |
| Navigation | Production companion app | Other development copy | Keep environments isolated |
| SQL schema | Flyway baseline 1 | Flyway V3 | Intentional V2/V3 lump-sum functions, triggers and indexes; exact hashes in the review evidence |
| Lump-sum receipt processing | Five AppSheet stages | Atomic SQL allocation/posting/closure; AppSheet conditions exclude Lump Sum | Implemented and tested in Dev; owner review pending |
| Allocation snapshots | Includes unfunded eligible charges; row-ordinal ties | Funded rows only; charge-key ties; negative allocation order in row-number snapshot | Intentional documented semantics for new SQL receipts only |
| Connections | 100 limit | 50 limit | Environment configuration; not a migration |

The workbook's **Dev Differences** sheet contains the exact current table, business-column, slice, action and view differences. Full definitions are in the captured app-model.json. AppSheet-generated internal process schemas may differ when disabled processes are omitted; they are not PostgreSQL business tables. Captured differences are observed configuration, not automatic promotion instructions.

## Lump-sum development candidate

[Review report](../outputs/lumpsum-db-20260915/REPORT.md), [authoritative change log](../Change%20Logs/CHANGE_NOTES_DB_LUMPSUM_2026-09-15.md), and workbook Dev Differences record the exact configuration, migrations, consumer checks and rollback. Dev OLTP rollback is **1.000013**; Dev OLAP **1.000027** was not edited. Both remain on database-3. The receipt event and grouped action now use `AND([Status] = "Processing", [Allocation Method] <> "Lump Sum")`. No physical-field regeneration was needed.

Measured server Add median fell from **14.438 to 5.370 seconds (62.8%)** in today's six-charge test; the historical original median was 15.582 seconds. Successful Save-to-ready/sync-complete median fell from **14.567 to 12.165 seconds (16.5%)**. Small sequential samples and differing historical environment limit the claim; see raw evidence and exclusions. Original Dev records are unchanged; synthetic LS26 fixtures remain for review. Current-GUI OLTP allocation/closure and OLAP readback passed, with local SQL regression/concurrency tests as supplements.

Before production release, obtain owner acceptance/explicit deployment approval, review notification events bypassed by direct SQL child writes, and test multi-device stale/offline rejection recovery. Existing Closed Loan Principle labeling and component currency-display issues are documented separately; no report redesign was included. Never migrate synthetic financial data.

## Assessment prototype design

The lab assessment table retains five input fields and adds 18 result/metadata fields. Its view adds SQL Source Current. Including the provider row ordinal, AppSheet exposes 25 provider fields and 16 VCs; nine result VCs read stored outputs with input/fingerprint/date freshness guards. Calendar retains its Date key and ten descriptive VCs over generated dates from 2026-08-01 through 2026-12-31.

The assessment_calculate and assessment_stamp BEFORE-row triggers calculate and stamp an inserted/updated assessment row. Refresh Assessment action was removed at the owner's request; its unused hidden token remains for reversible schema preservation. An ordinary sync reads results but does not recalculate an unchanged row. Unsynced/mismatched inputs show the bilingual waiting-for-results message; stale source data/as-of dates show an out-of-date message. Offline clients cannot detect unseen database changes.

Production OLAP 1.100051 now uses the enhanced sources/formulas. Development reference was freshly captured at 1.000027. SQL functions/trigger bodies were already present in Flyway V1 on both instances, so this promotion required no DDL. The source binding remains database-2 in production and database-3 in development. The current promotion snapshot and detailed dictionary supersede the earlier OLAP comparison.

## Test evidence and open work

The [assessment report](../outputs/assessment-sql-20260915/REPORT.md) records prior independent correctness comparisons and five interleaved sync pairs: median 6.734 to 5.613 seconds, **16.6% faster**, with 15.072 ms median SQL refresh over ten runs. These are historical prototype measurements, not a new production benchmark.

The [development verification](../outputs/development-instance-20260915/verification.json) records isolated bindings, new-GUI sync, a restored assessment input test, and prior constraint/normalizer rejection checks. Development is a snapshot, not a continuously synchronized replica; Daily Analytics differed in contents at that test. Current schema capture does not certify data equality.

Promotion completed under owner authorization. The fixed horizon, shared MAIN input and unchanged-row recalculation limits remain documented. Production testing covered load, pending message, automatic input write/trigger/readback and restoration. No new production speed percentage was measured. The historical benchmark above must not be presented as a current production benchmark. No development financial data was migrated.

## Automation isolation and maintenance

**Standing preparation gate:** follow [Development Environment Preparation](Development_Environment_Preparation.md) for every future copy, refresh, replacement or version restore. Nonessential or confusing bots, especially notifications, must remain disabled. Review all new bots and embedded tasks before test writes; enable only essential processing confined to development. The rule is mandatory in AGENTS.md and is not limited to today's app copies.

The earlier isolation checks confirmed transactional development OLTP bots retained, daily generation/notifications disabled, and all three development OLAP schedule/export bots disabled. Production OLAP performance settings were recaptured during promotion: server caching, delta, Quick Sync and delayed sync off; sync on start and automatic updates on. See Environment Inventory for dated values. Recheck development isolation before future write testing.

For a new change, record its migration/version, consumers, exact expressions, tests, measured results, owner decision and rollback. After an approved production deployment, update the production overview and dictionary and close the corresponding difference. Preserve earlier decisions in Change Logs. App rollback versions that restore database-2 would reconnect development apps to production; do not use them casually.
