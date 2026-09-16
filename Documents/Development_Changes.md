# Development differences

Updated 16 September 2026 for development OLTP **1.000061**, development OLAP **1.000064**, production OLTP **3.000098**, production OLAP **1.100081**. Production is Flyway **V11**; development is **V14**. Maintain this difference register alongside the single [production model](AppSheet_Data_Model_Overview.md); do not maintain a second independently edited full dictionary.

See [VC phases 1–4 implementation, benchmarks and rollback](../outputs/vc-materialization-20260916/REPORT.md). Current-GUI synthetic workflows and SQL parity/concurrency passed; owner mobile/offline acceptance is pending. Production was only inspected read-only for performance recommendations.

## Current differences

| Area | Production | Development | Status |
| --- | --- | --- | --- |
| Database instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Isolation retained |
| AppSheet source | database-2 | database-3 | Never promote the development host |
| SQL schema | Flyway V11 | Flyway V14 | DEV-only VC materialization; owner acceptance pending |
| Financial VCs | Existing AppSheet expressions | 24 physical SQL-owned fields; four obsolete allocation VCs deleted | Both DEV apps reconciled; Amount Due remains VC |
| Core payments, final close, first day, default | Atomic SQL | Same SQL | Phases 1–6 promoted with owner approval |
| Manual generation | Hidden dated Loans request | Same request | Same common SQL rules |
| Nightly generation | AppSheet bot 00:05 Bangkok; pg_cron paused | AppSheet bot 00:05 Bangkok; pg_cron paused | Same SQL generator; first natural production AppSheet run pending |
| New fields | Closing-payment Ref, target-loan Ref, hidden generation request | Same model | Both consumers reconciled; no backfill |
| Notification recipients | Existing Partners emails, excluding acting user | Approved owner account only | Intentional environment difference |
| OLAP hourly analytics | Hourly :00 Bangkok Statistics request → SQL | Hourly :00 Bangkok Statistics request → SQL | Production natural 01:00 run Complete; development natural 00:00 run Complete |
| Statistics request | Hidden nullable Analytics Refresh Request | Hidden nullable Analytics Refresh Request | Both apps reconciled in each environment; excluded from reporting slice |
| Calendar | Removed from app | Removed from app | No app references; historical SQL objects retained |
| Daily Analytics writes | SQL upsert; app READ_ONLY | SQL upsert; app READ_ONLY | Production 43/43 dates reconcile; existing keys preserved |
| Connections | 100 | 50 | Capacity/settings remain separate |
| Companion navigation | Production app | Development app | Isolation retained |

Owner acceptance of the implementation was provided through the explicit request to promote phases 1–6. Production rollback versions are OLTP 3.000080 / OLAP 1.100056, with a coordinated SQL forward-fix or approved database recovery. See [production release](../outputs/core-promotion-20260915/REPORT.md). The workbook records current production columns/rules and the earlier development comparison history with promoted production values. The sections below retain development test checkpoints and their rollback versions; they do not supersede this current release status.

### Atomic Default Loan — development phase 6

OLTP 1.000042 and OLAP 1.000040, rollback both 1.000039. V10 posts defaults atomically from one confirmed Loans update, without new columns/tables. Loss is SQL-calculated outstanding principal; positive-principal/negative-interest repayment preserves the zero-cash prototype convention. All earlier payment/allocation links survive. Unpaid charges are retained and reduced to paid components with an audit note; seven old Default sub-actions are FALSE. Default notifications show loss/no new cash, with the approved owner-only recipient. OLAP's Default Loss Amount now displays baht with zero decimals; read-only access and all other model settings are unchanged.

Current-GUI losses 100/90/110/92 and preserved cash 0/30/0/15 reconcile in both apps. Original records in 14 tables were unchanged at that development checkpoint. The owner subsequently authorized production promotion; separate phase-6 device push confirmation was not recorded. Retained charge rows may affect count-based downstream reports; Looker was not edited. [Phase 6 evidence and recovery](../outputs/default-loan-20260915/REPORT.md).

### Common generation — development phases 4–5

Both-app definitions reconciled at 1.000039, rollback 1.000036. V8/V9 implement the common generator and database schedule; four notification-only routes are unchanged. Current-GUI manual charges 50/130/30 and actual scheduler charge 20 reconcile; the off-interval loan was skipped and original rows across 14 tables preserved. Owner approved nightly development activation, now active at 00:05 Bangkok; owner accepted phases 4–5 on 15 September 2026; the first natural overnight run remains pending. [Phase 4–5 report and rollback](../outputs/charge-generation-20260915/REPORT.md).

### Interval anchor — promoted 15 September 2026

The core payment release supersedes development parity below: four notification-only bots route to the owner, Create First-Day Charge and Payments - Process Receipt bots are disabled, and the two obsolete payment processing/closure actions are hidden with FALSE conditions. All six methods passed current-GUI OLTP and SQL checks; OLAP loaded matching read-only balances. Owner confirmed tested push amounts. Five V6 synthetic borrowers are hidden and all ten fixture loans' auto-charge flags are off. See [V6 evidence](../outputs/core-payment-20260915/REPORT.md).

V7 moves daily Close Loan final-charge preparation into the same SQL transaction. New Payments.Ref Target Loan is Ref Loans.Row ID in both apps; user-read-only via Editable_If FALSE in OLTP, Read-Only Yes in OLAP. Generated Loans.Related Payments is included in OLAP Reporting Loans. The wrapper now submits only Receive All Remaining Charges, with the three obsolete preparation actions hidden/FALSE. Two OLTP payment validation expressions support the target-loan command. Forms/details, sources and other financial methods are preserved. Regenerated Payments.Row ID metadata changed, while key/read-only/UNIQUEID remain intact. Four further synthetic loans passed GUI/ledger/OLAP checks and their borrowers are hidden/auto-charge disabled. Owner confirmed all five new receipt/closure push amounts. See [V7 evidence, limits and rollback](../outputs/atomic-close-20260915/REPORT.md). No production data or app was changed.

`Loans.Interest Schedule Anchor Date` is an optional stored Date, without default, reset or formula. Its SQL check and AppSheet Valid_If require blank or a date on/after Loan Date. It is shown for daily-interest loans, editable in OLTP Loans_Form and displayed in both Loans_Detail views after Interest Payment Interval. OLAP remains read-only. Keys, Refs, slices and existing calculations are unchanged.

Individual charge eligibility, bulk referenced rows/visibility and the disabled Daily 00:05 scheduled filter now use the explicit anchor, falling back to Loan Date. With anchor 14 September and interval 3, subsequent scheduled dates are 17, 20 and 23 September. Enter the agreed anchor explicitly when changing an existing schedule; changing the interval alone retains its existing origin. Payments do not automatically reset the anchor. The original loan date, daily accrual and existing charges remain unchanged.

New-GUI synthetic tests passed for a future anchor, a due anchor, blank fallback, automatic charging off, repeat execution without duplicates, invalid anchor rejection and OLAP readback. Moving a synthetic anchor through the form changed eligibility while charging only interest since the previous charge. Scheduled midnight execution and actual 17 September execution were not run; the bot remains disabled. Synthetic records are retained, hidden at borrower level, with all four Auto Charge Enabled flags off. Production financial records are untouched.

The owner accepted promotion of tested commit b816d7f. Production now uses the same field/rules in OLTP **3.000080**, OLAP **1.100055**, Flyway **V5**. Production current-GUI loading/sync and an unsaved daily-interest form check passed. Existing production anchors remain blank; no existing loan or charge correction was performed. See [change notes](../Change%20Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md), [exact expressions](../outputs/interval-anchor-20260915/expressions.json) and the dictionary's reconciled field/rule inventory. Production rollback versions are OLTP **3.000075**, OLAP **1.100051**; development rollback remains OLTP **1.000021**, OLAP **1.000028**. Retain the additive nullable SQL column when reverting app configuration.

### Lump-sum release — 15 September 2026 (historical release snapshot)

Production OLTP **3.000074**, Dev OLTP **1.000019**, both databases **Flyway V4**. OLAP versions remain production **1.100051** and development **1.000027**. The [release report](../outputs/lumpsum-promotion-20260915/REPORT.md) supersedes the historical V3 design and notification limitation.

PostgreSQL prepares positive allocations and matching repayments atomically, newest eligible charge first with immutable-key ties and interest before principal. Existing AppSheet actions finalize the receipt and close paid loans, producing the existing notification events. Processing remains visible if finalization fails; prepared receipts cannot allocate twice and block another lump-sum receipt until reconciled. SQL validates the final Posted transition. Seven indexes, three functions and four triggers reuse existing tables and columns; no queue or new business field exists. New ls2: children retain negative Allocation Order in Charge Row Number Snapshot. Historical rows retain their prior interpretation.

The receipt event and group both use `[Status] = "Processing"`. Three allocation actions skip Lump Sum; two reconcile assignments select Posted/NOW() for Lump Sum and preserve original other-method expressions. [Exact action expressions](../outputs/lumpsum-promotion-20260915/action-expressions.json) are promotion evidence. Both apps read the same ledger, sources remain isolated (production database-2, Dev database-3), and no schema regeneration, Ref, slice or business-column change is required.

Production notification events, templates and recipient expressions are retained. The owner explicitly authorized the three Dev push bots with `LIST("welct0407@mw-credit.com")` as their sole recipient expression. Other Dev scheduled/export bots remain disabled. Dev Payment Received and Loan Closed runs completed in AppSheet; device receipt is not independently confirmed. New-GUI Dev receipt allocation, finalization, closure and OLAP readback passed. V4 SQL regression and concurrency passed. Earlier V3 speed measurements remain historical; no new V4/production speed percentage is claimed. Offline multi-device recovery, scheduled exports and Looker remain unverified.

Rollback points: Dev OLTP **1.000014**, production OLTP **3.000071**, OLAP unchanged. Production logical backup was restored successfully with all 14 business tables matching. Reconcile prepared receipts before fallback; use a higher migration to disable the processor and restore original action expressions, retaining ledger history and guards. App rollback alone does not undo SQL changes.

## Assessment prototype design

The lab assessment table retains five input fields and adds 18 result/metadata fields. Its view adds SQL Source Current. Including the provider row ordinal, AppSheet exposes 25 provider fields and 16 VCs; nine result VCs read stored outputs with input/fingerprint/date freshness guards. Calendar retains its Date key and ten descriptive VCs over generated dates from 2026-08-01 through 2026-12-31.

The assessment_calculate and assessment_stamp BEFORE-row triggers calculate and stamp an inserted/updated assessment row. Refresh Assessment action was removed at the owner's request; its unused hidden token remains for reversible schema preservation. An ordinary sync reads results but does not recalculate an unchanged row. Unsynced/mismatched inputs show the bilingual waiting-for-results message; stale source data/as-of dates show an out-of-date message. Offline clients cannot detect unseen database changes.

Production OLAP 1.100051 now uses the enhanced sources/formulas. Development reference was freshly captured at 1.000027. SQL functions/trigger bodies were already present in Flyway V1 on both instances, so this promotion required no DDL. The source binding remains database-2 in production and database-3 in development. The current promotion snapshot and detailed dictionary supersede the earlier OLAP comparison.

## Test evidence and open work

The [assessment report](../outputs/assessment-sql-20260915/REPORT.md) records prior independent correctness comparisons and five interleaved sync pairs: median 6.734 to 5.613 seconds, **16.6% faster**, with 15.072 ms median SQL refresh over ten runs. These are historical prototype measurements, not a new production benchmark.

The [development verification](../outputs/development-instance-20260915/verification.json) records isolated bindings, new-GUI sync, a restored assessment input test, and prior constraint/normalizer rejection checks. Development is a snapshot, not a continuously synchronized replica; Daily Analytics differed in contents at that test. Current schema capture does not certify data equality.

Promotion completed under owner authorization. The fixed horizon, shared MAIN input and unchanged-row recalculation limits remain documented. Production testing covered load, pending message, automatic input write/trigger/readback and restoration. No new production speed percentage was measured. The historical benchmark above must not be presented as a current production benchmark. No development financial data was migrated.

## Automation isolation and maintenance

**Standing preparation gate:** follow [Development Environment Preparation](Development_Environment_Preparation.md) for every future copy, refresh, replacement or version restore. Nonessential or confusing bots remain disabled, except the owner-authorized three Dev push bots routed exclusively to the owner account as documented above. Review all new bots and embedded tasks before test writes; enable only essential processing confined to development. The rule is mandatory in AGENTS.md and is not limited to today's app copies.

The earlier isolation checks confirmed transactional development OLTP bots retained, daily generation/notifications disabled, and all three development OLAP schedule/export bots disabled. Production OLAP performance settings were recaptured during promotion: server caching, delta, Quick Sync and delayed sync off; sync on start and automatic updates on. See Environment Inventory for dated values. Recheck development isolation before future write testing.

For a new change, record its migration/version, consumers, exact expressions, tests, measured results, owner decision and rollback. After an approved production deployment, update the production overview and dictionary and close the corresponding difference. Preserve earlier decisions in Change Logs. App rollback versions that restore database-2 would reconnect development apps to production; do not use them casually.


### Monitored jobs acceptance — 16 September 2026

Owner accepted development V11 / OLTP 1.000048 / OLAP 1.000050 after syncing and checking both apps. Natural hourly analytics at 00:00:05 and all 24 daily charge runs at 00:05:03 Bangkok completed. Error-email delivery remains unverified. This supersedes the earlier development scheduler pending status; the production promotion is recorded below. [Evidence and rollback](../outputs/monitored-jobs-20260915/REPORT.md).

Production caught up on 16 September at V11 / OLTP 3.000098 / OLAP 1.100081. Its Calendar dependency and duplicate bot are removed, Daily Analytics is read only, and AppSheet owns both monitored schedules while production pg_cron remains paused. Manual Recent/Full requests and the first natural 01:00 analytics run completed; 43/43 dates reconcile. The first natural production 00:05 charge run remains pending. [Production evidence and rollback](../outputs/monitored-jobs-production-20260916/REPORT.md).
