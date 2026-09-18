# Development differences

## R008 DEV candidate — 18 September 2026

DEV **SQL V24 / OLTP 1.000176 / OLAP 1.000169**, both Prototype; PROD remains released R007. Cash Accounts/defaults, 13 source/request account fields, compact quick-payment command forms, custody propagation, account balances and SQL-only controlled opening allocation are implemented. Three exact-receipt notification bots deliver only to the owner in DEV. R007 analytics providers append the new dimensions without changing metric semantics.

The [R008 report](../outputs/r008-20260918/REPORT.md) links the complete target delta, saved readbacks, SQL/GUI checks, rollback and remaining acceptance. The overview and workbook retain the PROD baseline with labeled R008 DEV differences. No R008 production change is authorized. Recommendation is subject to owner acceptance of the design 9.3 form fallback/mobile UX, explicit opening allocations and promotion recipient-context review. Live openings remain uninitialized; no real bank account numbers are in repository evidence. The two existing Prototype scheduling execution limitations remain visible and excluded under the previously recorded specific owner decision; no other editor issues were found.

## R007 promoted and differences closed — 18 September 2026

DEV completed **SQL V22 / OLAP 1.000142 / unchanged OLTP 1.000134** and the owner authorized promotion. PROD is now **SQL V22 / OLAP 1.100131 / unchanged OLTP 3.000173**. Five SQL analytics views replace 82 analytical VCs across the four existing read-only OLAP tables; a new read-only Portfolio Summary supplies 40 Statistics dereferences. The collection list now uses a hidden reverse Ref. Base financial tables, original slices, views, actions and format rules retain their contracts.

Exact targets and environment substitutions: [R007 revision 1 delta](../outputs/r007-20260918/release-delta.json). All 293 targets match the independent saved PROD readback. All-row parity, synthetic SQL boundaries, GUI navigation, Recent/Full refresh and focused OLTP checks pass; median measured sync improves from 14.641 to 4.608 seconds. The owner excludes both existing DEV Prototype scheduling execution warnings (OLAP Every Hour; OLTP Daily 00:05); preserve schedules and Prototype mode. [Production evidence, limitations and coordinated recovery](../outputs/r007-20260918/REPORT.md); [release log](../Change%20Logs/CHANGE_NOTES_R007_2026-09-18.md). R007 differences are **closed** after PROD editor diagnostics, runtime smoke and read-only SQL checks.

Record each release's DEV checkpoint here and close its release-owned differences after promotion using the [documentation checklist](Promotion_Documentation_Checklist.md). Current closure entries supersede historical checkpoints below; historical deployment-check blockers do not reinstate requirements excluded by the current release workflow.

## R006 promoted and differences closed — 18 September 2026

Retrospective documentation repair from recorded R006 evidence; no new live verification. DEV OLTP **1.000134** staged four virtual-column App formula changes: Payments **Eligible Charges**, **Eligible Outstanding**, **Visible Allocations**, and Borrowers **Daily Collection Status**. Exact before/DEV/PROD targets are in the [R006 delta](../outputs/r006-20260918/release-delta.json); DEV tests, acceptance and recovery are in the [release log](../Change%20Logs/CHANGE_NOTES_R006_2026-09-18.md).

All four differences were promoted to PROD OLTP **3.000173** on 18 September 2026 and are **closed**, supported by the [independent PROD comparison](../outputs/r006-20260918/prod-comparison-r1.json), [saved observations](../outputs/r006-20260918/prod-saved-observations.json) and closure checks in the log. Implementation **dad1b79**, production-evidence checkpoint **7683fd8**, package revision **1**; rollback PROD OLTP **3.000172**. SQL remains **V21**; OLAP was not changed by R006. Synthetic DEV data and environment-specific configuration remain DEV-only; this closes neither later work nor whole-environment differences. The absent fresh Deployment Check for the already-Deployed PROD app is not an outstanding difference or blocker under the current owner rule.

## R005 released — 18 September 2026

PROD **OLTP 3.000172 / OLAP 1.100122 / SQL V21**, pinned implementation **2054384**, package R005-P1. Owner acceptance and production authorization are recorded; the latest instruction excludes deployment-check advisories and keeps DEV Prototype. All 2,408 core properties and 20 dashboard items match independent saved PROD readback. Both final PROD editors show No issues found; focused GUI and read-only SQL checks passed. No history backfill or DEV opening/test data was promoted. See [production verification and recovery](../outputs/r005-20260917/PRODUCTION_REPORT.md). Earlier readiness/authorization statements below are dated historical checkpoints, superseded by this release.

## Historical R005 DEV checkpoints — 18 September 2026

Latest dashboard refinement: **OLTP 1.000125 / OLAP 1.000123 / SQL V21**. Reuses Cash Holder Balances SQL view read-only in OLTP; nonzero cash deck follows KPIs/Income Statement MTD. Total Cash Pool uses the existing one-row capital limit, orange before principal. Collection due is collected plus remaining. Owner-authorized DEV openings 18,000/30,000 give current Dad/Lisa balances 17,890/29,109; Tommy zero is omitted. Saved readback and focused current-GUI checks passed in both apps. [Exact delta and test report](../outputs/r005-20260917/DASHBOARD_REPORT.md). No new SQL migration or PROD write. Old export-coverage gates are superseded by current methodology; unavailable deployment-check rerun still leaves R005 **Not ready**. The paragraphs below retain prior checkpoint history.

Current refinement: **DEV V21 / OLTP 1.000120 / OLAP 1.000123**. Delete now reverses completed and pending settlements and retains source history; no separate Cancel Settlement action. Current-GUI tests plus SQL readback passed. Both new synthetic tests are reversed; the owner's settlement was left unchanged. [Exact configuration, tests, limitations and coordinated recovery](../outputs/r005-20260917/REVERSAL_REPORT.md). Both editors show No issues found; full R005 remains **Not ready**, with deployment-check rerun and delivery verification open. The V20 paragraph below records the prior checkpoint.

DEV V20 / OLTP 1.000120 / OLAP 1.000120 implement cash custody with no historical backfill. Cash Holders is read-only in both apps. OLAP owns Cash Ledger, manual Record Cash Transfer and Cash Position; OLTP owns receipt receiver and expense payer entry. Four existing owner-only notification bots were enabled to match the released baseline; obsolete financial-processing bots remain disabled. [Current-GUI tests and exact configuration evidence](../outputs/r005-20260917/GUI_TEST_REPORT.md) cover source receipts, corrections, expenses/rebate, transfers, both settlements and default. Both editors show No issues found; unavailable deployment-check rerun and notification delivery verification keep R005 **Not ready**. Owner acceptance and production authorization remain pending. PROD remains R004/V19. Both synthetic loans are closed; 14 synthetic cash movements remain DEV-only. See the [R005 change log](../Change%20Logs/CHANGE_NOTES_R005_2026-09-17.md) for coverage exception and rollback.

## R004 promoted — 17 September 2026

R004's tested category rule and V19 migration are promoted: DEV OLTP 1.000110 / OLAP 1.000096; PROD OLTP 3.000156 / OLAP 1.100106, V19 in both. No R004 category-rule difference remains. DEV synthetic fixtures stay DEV-only. Existing unrelated environment/UI differences are preserved. See [R004 exact scope, tests, export-coverage exception and recovery](../Change%20Logs/CHANGE_NOTES_R004_2026-09-17.md). Older dated sections below are historical checkpoints, not the current production/development version declaration.

Updated 16 September 2026 for development OLTP **1.000088**, development OLAP **1.000090**, production OLTP **3.000108**, production OLAP **1.100090**. DEV is Flyway **V16**; production remains **V14**. Maintain this difference register alongside the single [production model](AppSheet_Data_Model_Overview.md); do not maintain a second independently edited full dictionary.

The later [expense/dashboard refinement](../Change%20Logs/CHANGE_NOTES_EXPENSE_DASHBOARD_REFINEMENT_2026-09-16.md) preserves the owner's OLTP deck, adds bilingual manual categories and optional-reference labels, colors signed amounts, and uses Total Net Profit plus a three-line Income Statement MTD in both dashboards. OLAP Cash Pool has four fields again, using net unsettled profit and net expected balance. Both partner cards reconcile with SQL net values. SQL stays V16; rollback for this UI-only follow-up is OLTP 1.000083 / OLAP 1.000084. Owner/mobile acceptance remains pending.

Business expenses/referral rebates are implemented in DEV and pending owner acceptance. The ledger, borrower referrer, dynamic contribution-date allocations, net partner settlements/statistics and extended Daily Analytics are DEV only. All gross formulas remain; partner presentation retains its layout. The workbook contains the exact development inventory. See [business expenses report](../outputs/business-expenses-20260916/REPORT.md) and [change log](../Change%20Logs/CHANGE_NOTES_BUSINESS_EXPENSES_2026-09-16.md) for GUI/SQL coverage, retained synthetic data and coordinated rollback. Looker phase is deferred until acceptance.

See [VC phases 1–4 implementation, benchmarks and rollback](../outputs/vc-materialization-20260916/REPORT.md). Current-GUI synthetic workflows and SQL parity/concurrency passed. The owner authorized production promotion on 16 September; see [production VC release](../outputs/vc-production-20260916/REPORT.md). Mobile/offline feedback remains unverified. Further performance opportunities are on hold.

## Historical differences — 16 September checkpoint

| Area | Production | Development | Status |
| --- | --- | --- | --- |
| Database instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Isolation retained |
| AppSheet source | database-2 | database-3 | Never promote the development host |
| SQL schema | Flyway V14 | Flyway V16 | Expenses/referrals/net settlement DEV only; owner acceptance pending |
| Financial VCs | 24 physical SQL-owned fields; four obsolete allocation VCs deleted | Same implementation | Both apps reconciled in each environment; Amount Due remains VC |
| Core payments, final close, first day, default | Atomic SQL | Same SQL | Phases 1–6 promoted with owner approval |
| Manual generation | Hidden dated Loans request | Same request | Same common SQL rules |
| Nightly generation | AppSheet bot 00:05 Bangkok; pg_cron paused | AppSheet bot 00:05 Bangkok; pg_cron paused | Same SQL generator; first natural production AppSheet run pending |
| New fields | Closing-payment Ref, target-loan Ref, hidden generation request | Same model | Both consumers reconciled; no backfill |
| Notification recipients | Existing Partners emails, excluding acting user | Four bots disabled; prior owner-only destinations retained | Current task isolation rule; no notification testing |
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

**Standing preparation gate, revised 16 September 2026:** follow [Development Environment Preparation](Development_Environment_Preparation.md) after copies, refreshes, replacements, restores and automation changes. DEV follows released PROD automation/schedules with DEV-only effects and all notifications exclusively to `welct0407@mw-credit.com`; record release-owned differences. Earlier blanket-disable instructions and three-bot exceptions in this document are historical. Current states must be verified and parity gaps resolved under AGENTS.md; this policy update did not enable or test any bot.

The earlier isolation checks confirmed transactional development OLTP bots retained, daily generation/notifications disabled, and all three development OLAP schedule/export bots disabled. Production OLAP performance settings were recaptured during promotion: server caching, delta, Quick Sync and delayed sync off; sync on start and automatic updates on. See Environment Inventory for dated values. Recheck development isolation before future write testing.

For a new change, record its migration/version, consumers, exact expressions, tests, measured results, owner decision and rollback. After an approved production deployment, update the production overview and dictionary and close the corresponding difference. Preserve earlier decisions in Change Logs. App rollback versions that restore database-2 would reconnect development apps to production; do not use them casually.


### Monitored jobs acceptance — 16 September 2026

Owner accepted development V11 / OLTP 1.000048 / OLAP 1.000050 after syncing and checking both apps. Natural hourly analytics at 00:00:05 and all 24 daily charge runs at 00:05:03 Bangkok completed. Error-email delivery remains unverified. This supersedes the earlier development scheduler pending status; the production promotion is recorded below. [Evidence and rollback](../outputs/monitored-jobs-20260915/REPORT.md).

Production caught up on 16 September at V11 / OLTP 3.000098 / OLAP 1.100081. Its Calendar dependency and duplicate bot are removed, Daily Analytics is read only, and AppSheet owns both monitored schedules while production pg_cron remains paused. Manual Recent/Full requests and the first natural 01:00 analytics run completed; 43/43 dates reconcile. The first natural production 00:05 charge run remains pending. [Production evidence and rollback](../outputs/monitored-jobs-production-20260916/REPORT.md).
## R002 — 16 September 2026

Dev V18 / OLTP 1.000108 / OLAP 1.000096 adds a database new-loan cashpool guard (contributed capital minus outstanding principal), inline borrower navigation while preserving Row ID keys, and owner-only Dev notification policy. SQL regression/boundary/concurrency and saved app configuration comparisons passed. One-row Loan Form Context powers the OLTP pre-save warning and bracketed amount in the original principal title. Owner refinement replaces the Collection duplicate VC with Borrower Name TE while preserving Collection status colors and pink formatting elsewhere; the unused VC is removed. Refinement rollback OLTP 1.000098; OLAP/SQL unchanged. Both-app borrower links and form boundaries verified in the current GUI; red/purple Collection colors and pink outside checked, green/orange saved rules verified without visible fixtures. Owner rejected the custom Collection button/row override; these are removed. Original Collection detail navigation is restored, and an explicitly approved read-only Ref displayed as Borrower Name TE inside the detail opens the borrower page. Owner acceptance remains pending. No production changes. [Scope, evidence, limitations and recovery](../Change%20Logs/CHANGE_NOTES_R002_2026-09-16.md).

## R002 production promotion — 16 September 2026

Accepted Dev definitions remain OLTP 1.000108 / OLAP 1.000096 / Flyway V18. The pinned R002-P1 package was applied after the verified production backup and R003 prerequisite. Released production now runs OLTP 3.000135 / OLAP 1.100106 / Flyway V18. No Dev financial data moved to production. Repository test fixtures were updated to seed contributed capital under the new V17 guard; the full local migration/concurrency workflow passes. The retired duplicate VC was deleted after owner confirmation and live Collection/detail/Ref navigation passed. See the [release checklist](../outputs/r002-20260916/PROMOTION_CHECKLIST.md) and [production report](../outputs/r002-production-20260916/REPORT.md).
