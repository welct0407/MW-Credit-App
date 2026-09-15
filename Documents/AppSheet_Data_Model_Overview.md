# AppSheet production data model

Reconciled 15 September 2026. This is the current production architecture reference. [Development differences](Development_Changes.md), [environment inventory](Environment_Inventory.md), and [documentation index](README.md) are maintained separately. The detailed inventory is in [AppSheet_Data_Dictionary.xlsx](AppSheet_Data_Dictionary.xlsx).

## Verification basis

Production is **OLTP 3.000094 / OLAP 1.100062 / Flyway V10** after the owner-authorized phases 1–6 promotion on 15 September 2026. Rollback app versions were freshly recorded as **3.000080 / 1.100056**. At that release, production and development normalized schemas matched SHA256 `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`. Development subsequently advanced to V11 for monitored jobs below. The exact tested V6–V10 files were promoted from commit `33ed313f585311dcd0caffb1488ea8ac574bfb6e`.

The dictionary contains **569 production business-column entries** (202 OLTP, 367 OLAP), including the three new physical fields and two generated reverse-reference columns per app. Source bindings, existing business-table permissions, manual form/detail orders and unrelated formulas are preserved. Reporting Loans adds Ref Closing Payment, Charge Generation Request and Related Payments while remaining READ_ONLY. AppSheet internal process metadata is listed separately and is not a PostgreSQL business table.

Both current production apps loaded and synced; the unsaved payment form was inspected and cancelled. No production financial test transaction or forced push was submitted. Core historical records match their pre-release fingerprints. The pre-existing hourly OLAP process refreshed Daily Analytics during the window, so that snapshot is not byte-identical. First natural production nightly execution, ordinary device push feedback, offline/multiple-device recovery and Looker remain unverified. See [production release](../outputs/core-promotion-20260915/REPORT.md) for precise checks and rollback.

## Architecture and ownership

### Development phase 7 and monitored schedules — 15–16 September 2026

Development now uses **Flyway V11 / OLTP 1.000048 / OLAP 1.000050**, with rollback app versions **1.000042 / 1.000040** and the private V10 database snapshot. This task does not alter production. [Monitored jobs evidence](../outputs/monitored-jobs-20260915/REPORT.md) supersedes historical development scheduling statements below.

The owner-approved nullable `Statistics.Analytics Refresh Request` Text column has no default, backfill, formula, key, label or Ref. Both apps hide it and exclude it from search. OLAP owns command writes, with `Editable_If = FALSE` and static Read-Only No; OLTP uses static Read-Only Yes. Existing Statistics keys, formulas, defaults and display settings remain intact. Regeneration changes only internal Row ID fixed-definition/initial-value-editability metadata; Row ID remains hidden, read-only and `UNIQUEID("PackedUUID")`. Provider/virtual counts become **4 / 23 OLTP** and **4 / 36 OLAP**. Reporting Statistics excludes the command; all 12 OLAP slice definitions match their previous versions.

OLAP's existing prominent Refresh Daily Analytics and confirmed Full Rebuild Daily Analytics actions now write `YYYY-MM-DD|Recent or Full|UNIQUEID()` to that field. The SQL AFTER trigger validates Bangkok today and refreshes yesterday/today or first-loan-date through today. `refresh_daily_analytics(date,date)` uses one consistent source statement and an advisory transaction lock, upserting on a unique Snapshot Date index. Existing snapshot Row IDs survive; new dates use `da11:YYYY-MM-DD`. Repeated unchanged tokens do nothing; invalid commands or refresh failures roll back the request and snapshots together. Daily Analytics is READ_ONLY in OLAP; its 23 existing columns and chart/slice formulas are unchanged. OLTP does not load Daily Analytics.

The development **Calendar binding, its 12 columns, Calendar Detail View, generated Sheet1_Detail and three Calendar actions are removed**. SQL generates the required dates without a fixed year cutoff. Obsolete Delete Analytics Row and generated Daily Analytics edit/add/delete/form entries disappear under READ_ONLY. The historical SQL Calendar table and OLAP Calendar SQL Lab view remain for reversible recovery; neither is loaded or referenced by the development app or V11 refresh. Production Calendar remains unchanged. Native AppSheet process state/output tables are generated automation metadata, not new PostgreSQL business tables.

Model Version **2** is retained: loan issuance by Loan Date, repayment components by Payment Date, lifecycle by Close Date, cash-pool contributions by Contribution Date, completed settlements by Transfer Date, and role A/B profit shares at each repayment date. Existing prototype limitations are intentional migration parity: Pending Charges EOD excludes a whole charge after its first repayment, including partial receipts; default postings preserve positive principal/equal negative interest with zero new cash. These snapshots do not redefine operational balances or accounting treatment. Full refresh is required after changes affecting dates earlier than yesterday. All 42 existing dates reconciled against an independent translation of the prior AppSheet expressions; row IDs remained unchanged.

AppSheet now orchestrates development **Generate Daily Charges at 00:05 Bangkok**, using its existing eligibility filter and SQL request action, and **Refresh Daily Analytics Daily hourly at :00 Bangkok**, using one Statistics row and an inline Recent request. Both development apps are in deployed state solely to permit schedules. The development pg_cron job is paused, the duplicate Calendar analytics bot is removed, and Daily Loan Analysis Export remains disabled. Existing owner-only development notification routes are retained. Automation Monitor recorded charge failure/rollback and successful retry, plus analytics success. Audit History Alerts are enabled in both apps; the owner reports no error email received, so email delivery is not verified. Owner accepted both development apps on 16 September 2026. Natural hourly analytics at 00:00:05 and all 24 daily charge runs at 00:05:03 completed successfully; details are in the report. Looker was not edited; curated slice definitions are unchanged.

### Core payment phases 1–6 — live in both environments

At the phases 1–6 release, production used V10 / OLTP 3.000094 / OLAP 1.100062 and development used V10 / OLTP 1.000042 / OLAP 1.000040. The V11 development additions above preserve the same core transactional behavior. Production notifications select existing partner recipients, excluding the acting user; development routes only to its approved owner account. The production catalog and exact column rules are updated in the dictionary. Development test checkpoints below are historical evidence, not additional production test claims.

SQL owns all six payment methods, allocations, repayment components, Posted status and eligible loan closure in one transaction. First-day creation additionally commits the loan, charge and net-off receipt together. Charge balances/status continue to derive from repayments. V7 also prepares Close Loan's final charge in the receipt transaction. V8/V9 move manual and scheduled charge generation into a common SQL engine. V10 moves Default Loan financial posting into SQL; phase 7 analytics remains outside this migration.

**Phase 6 — Default Loan:** OLTP's existing confirmed action now sets `Defaulted = TRUE`, `Close Date = TODAY()`, `Closed By = USEREMAIL()` and closed `Loan Status` in one Loans update. The `default_loan_transition` BEFORE trigger calls `post_loan_default` and derives `Default Loss Amount` from principal less posted principal repayments. No new physical column, table, key or Ref is required. SQL checks the existing open/auto-enabled/outstanding/paid-today/pending-receipt restrictions and the Bangkok confirmation date. Borrower NOWAIT avoids deadlock with the originating loan lock; charge locks follow deterministic order. A repeated identical request does not post twice, and recorded default financial state is immutable.

The prototype's loss entry is preserved: one `df10:` charge and repayment with positive outstanding principal and equal negative interest, **zero new cash**, and no Payments/Payment Allocations row or `Ref Closing Payment`. Earlier receipts and allocation links remain intact. Unpaid and partial charges are retained instead of deleted: amounts due become their paid components, and Notes appends original component amounts, write-off amounts, date, actor and posting reference. Paid charges remain unchanged. Loan/charge/repayment grain is unchanged, but retained charge rows can change count-based reports relative to legacy deletion. This is the existing prototype loss convention, not a new accounting model.

Seven legacy Default sub-actions are hidden and FALSE. The existing closure bot uses a default-specific loss/no-cash message via current-row LOOKUP, with production partner destinations and the separately approved owner-only development destination. OLAP Loans and Reporting Loans remain READ_ONLY; its existing Default Loss Amount display is corrected from `$`/2 decimals to `฿`/0. All other column settings, formulas, references and slices match the starting definitions. Current-GUI losses 100/90/110/92, preserved cash 0/30/0/15 and zero outstanding principal reconcile in both apps. The owner accepted the implementation through the explicit phases 1–6 production promotion request; separate phase-6 device delivery was not explicitly confirmed. Rollback versions are OLTP/OLAP 1.000039 and development V9; [verification and coordinated rollback](../outputs/default-loan-20260915/REPORT.md).

**Phases 4–5:** approved nullable `Loans.Charge Generation Request` is hidden Text, no default/backfill/key/Ref. OLTP writes a dated nonce through Generate Today's Charge, with Editable_If FALSE blocking user edits; OLAP is statically read-only. Reporting Loans includes the hidden column and remains READ_ONLY. Existing keys, defaults, formulas, forms/details and references are preserved; generated OLAP View Ref (Ref Target Loan) visibility is now ALWAYS with the same navigation and no edit permission. `manual_charge_generation` calls `charge_generation_request`, then `generate_loan_charge`. `generate_due_charges` uses the same generator for the nightly batch. No charge/repayment grain changed.

The generator retains interval/anchor, daily accrual, fixed-date and installment remainder rules, locks against concurrent payment/generation and skips existing loan/date charges. Manual lock contention fails promptly with a sync/retry message; a bad eligible loan rolls back the nightly batch. Production and development pg_cron job `loan-daily-charges` is owner-approved and active at **00:05 Asia/Bangkok**. Session TimeZone stays UTC; SQL derives Bangkok business date explicitly. Cron metadata is not an AppSheet table. Superseded AppSheet generation stays disabled; notification routes are unchanged. Current-GUI manual results (50, 130, 30) and actual scheduler result (20) reconcile; original rows in 14 tables match the pre-task fingerprints. Both-app rollback versions are 1.000036. Owner accepted phases 4–5 on 15 September 2026; the first natural nightly run remains pending. [Phase 4–5 verification and recovery](../outputs/charge-generation-20260915/REPORT.md).

Owner-approved **Loans.Ref Closing Payment** is nullable text in SQL and read-only Ref to **Payments.Row ID** in both apps; it is not a key, label or IsPartOf relationship. It has no default/app formula/backfill and is set only when a SQL payment closes the loan. SQL guards protect it and a partial index supports closure lookups. Generated **Payments.Related Loans** is a read-only List of Ref with `REF_ROWS("Loans", "Ref Closing Payment")`. OLAP **Reporting Loans** slice includes the new field, retaining its filter and read-only permission. Existing manually ordered forms/details remain unchanged. Production retains database-2 and development database-3, with existing keys and financial calculations; OLAP exposes no financial editing.

Owner-approved **Payments.Ref Target Loan** is nullable text / Ref to **Loans.Row ID**, with no default/app formula/backfill, Key/Label/IsPartOf false. Only Close Loan commands populate it. OLTP uses **Editable_If FALSE** with static Read-Only No so the action can assign it while forms prevent user editing; OLAP uses Read-Only Yes. Generated **Loans.Related Payments** is read-only List Ref with `REF_ROWS("Payments", "Ref Target Loan")`; OLAP **Reporting Loans** includes this VC without changing its filter/actions/READ_ONLY. Both apps generate inline target-loan navigation. Regeneration changes Payments.Row ID metadata to Fixed definition No / Editable Initial Value Yes, while Key Yes, Read-Only Yes and UNIQUEID() remain intact. Existing manual form/detail orders are unchanged.

`prepare_loan_close` runs before the payment guard. It locks the borrower, loan and charges, adds only unscheduled outstanding principal, calculates elapsed interest when today's charge is absent, sets the target charge and actual receipt amount, then lets the existing AFTER processor post and close. A reserved `lc7:` final charge does not trigger first-day net-off. Bangkok-stale dates, duplicate-today charges, invalid components and conflicting requests fail atomically. The Close wrapper now contains only **Receive All Remaining Charges**; three superseded charge-preparation actions are hidden with FALSE conditions. Two OLTP validation expressions support a target loan without an existing target charge. See [exact configuration](../outputs/atomic-close-20260915/appsheet-configuration.md).

V7 current-GUI close tests passed for an old charge (130), no charge (150), same-day loan (100) and partial payment followed by close (50 then 70). SQL and read-only OLAP balances reconcile to principal 400 / interest 100. Owner confirmed all tested push amounts. Original records across 14 tables remain unchanged; fixture borrowers are hidden and auto-charge flags off. SQL rollback/concurrency tests passed; offline multi-device GUI recovery remains untested. [V7 verification and rollback](../outputs/atomic-close-20260915/REPORT.md) supersede the prior final-charge boundary. These were development tests; the subsequent production release is recorded above. Looker was not edited.

AppSheet handles originating-entry notifications with one summary per payment for matching closed loans. Four reviewed development notification-only bots route exclusively to the owner; superseded financial bots/actions are disabled. All six payment methods passed current OLTP GUI and SQL reconciliation; OLAP synced matching balances, status and first-day detail. Owner confirmed receipt/closure/first-day push amounts. Original records across 14 tables are unchanged. Offline/multiple-device recovery, separate manual-first-day-charge push delivery remain untested; overall implementation acceptance was provided through the production request. Looker/export behavior was not tested; no report edit or financial-grain change. See [verification and rollback](../outputs/core-payment-20260915/REPORT.md) and [change log](../Change%20Logs/CHANGE_NOTES_CORE_PAYMENT_SQL_2026-09-15.md).

Production OLTP and OLAP share Cloud SQL PostgreSQL database **loan_manager_prod** on **appsheet-pg-prod-20260914**, through AppSheet connection **database-2**. The original Money AppSheet database is historical migration reference. Production OLAP now reads Calendar from **OLAP Calendar SQL Lab**, a PostgreSQL generated-date view. AppSheet internal user/process tables remain native.

OLTP owns borrowers, loan operations, charges, receipts and allocation posting. OLAP owns partner management, contributions, settlement, portfolio analysis and loan assessment. Looker Studio is downstream presentation over governed feeds. Its source configuration has not been freshly reconciled in this task. External collection software remains governed in its separate repository; the presence of collection-related borrower fields here does not authorize changes to that system.

### Interest schedule anchor — promoted 15 September 2026

Flyway **V5** in both environments adds optional `Loans.Interest Schedule Anchor Date` (Date, no default/backfill; blank or on/after Loan Date). Production OLTP **3.000080** owns editing and scheduling; production OLAP **1.100055** displays the field read-only. Tested development versions remain OLTP **1.000025**, OLAP **1.000031**. The field appears after Interest Payment Interval in OLTP Loans_Form and both Loans_Detail views, only for daily-interest loans. It is neither a key nor a Ref and does not alter existing relationships, slices or accrual calculations.

Individual/bulk daily-interest eligibility and the daily schedule filter use the explicit anchor or fall back to Loan Date. Subsequent dates are anchor plus interval multiples: 14 September + 3 days gives 17 September. Users enter an agreed anchor when rescheduling; payments do not reset it automatically. At the historical V5 checkpoint the production AppSheet schedule remained enabled. V9 promotion supersedes it: both AppSheet daily bots are disabled and each database runs its own 00:05 Bangkok job. The owner authorized promotion of tested commit b816d7f. Both production schemas were regenerated and reconciled, and both current apps loaded/synced; the unsaved daily-interest form displayed a blank anchor. No existing loan anchor or financial record was changed. Actual future scheduled execution remains untested. Exact field settings are in Prod Columns/Column Rules, with expression/view comparisons in Dev Differences and [release notes](../Change%20Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md).

### Lump-sum release — 15 September 2026 (historical release snapshot)

Production OLTP **3.000074**, Dev OLTP **1.000019**, both databases **Flyway V4**. OLAP versions remain production **1.100051** and development **1.000027**. The [release report](../outputs/lumpsum-promotion-20260915/REPORT.md) supersedes the historical V3 design and notification limitation.

PostgreSQL prepares positive allocations and matching repayments atomically, newest eligible charge first with immutable-key ties and interest before principal. Existing AppSheet actions finalize the receipt and close paid loans, producing the existing notification events. Processing remains visible if finalization fails; prepared receipts cannot allocate twice and block another lump-sum receipt until reconciled. SQL validates the final Posted transition. Seven indexes, three functions and four triggers reuse existing tables and columns; no queue or new business field exists. New ls2: children retain negative Allocation Order in Charge Row Number Snapshot. Historical rows retain their prior interpretation.

The receipt event and group both use `[Status] = "Processing"`. Three allocation actions skip Lump Sum; two reconcile assignments select Posted/NOW() for Lump Sum and preserve original other-method expressions. [Exact action expressions](../outputs/lumpsum-promotion-20260915/action-expressions.json) are promotion evidence. Both apps read the same ledger, sources remain isolated (production database-2, Dev database-3), and no schema regeneration, Ref, slice or business-column change is required.

Production notification events, templates and recipient expressions are retained. The owner explicitly authorized the three Dev push bots with `LIST("welct0407@mw-credit.com")` as their sole recipient expression. Other Dev scheduled/export bots remain disabled. Dev Payment Received and Loan Closed runs completed in AppSheet; device receipt is not independently confirmed. New-GUI Dev receipt allocation, finalization, closure and OLAP readback passed. V4 SQL regression and concurrency passed. Earlier V3 speed measurements remain historical; no new V4/production speed percentage is claimed. Offline multi-device recovery, scheduled exports and Looker remain unverified.

Rollback points: Dev OLTP **1.000014**, production OLTP **3.000071**, OLAP unchanged. Production logical backup was restored successfully with all 14 business tables matching. Reconcile prepared receipts before fallback; use a higher migration to disable the processor and restore original action expressions, retaining ledger history and guards. App rollback alone does not undo SQL changes.

## Production table catalog

Counts below are provider/physical fields followed by virtual columns. Provider counts include AppSheet's _RowNumber where present; they must not be treated as SQL column counts. Exact PostgreSQL types/defaults/nullability are in the workbook's DB Columns sheet.

| Table | Consumers | Source | OLTP provider / VC | OLAP provider / VC | Purpose |
| --- | --- | --- | --- | --- | --- |
| Borrowers | OLTP + OLAP | PostgreSQL | 12 / 26 | 12 / 64 | Borrower master; operational and reporting indicators |
| Loans | OLTP + OLAP | PostgreSQL | 20 / 21 | 20 / 31 | Loan terms, lifecycle and balances |
| Repayments | OLTP + OLAP | PostgreSQL | 11 / 5 | 11 / 13 | Posted principal/interest entries and receipt/allocation trace |
| Statistics | OLTP + OLAP | PostgreSQL | 3 / 23 | 3 / 36 | Control row and app-level KPI virtual columns |
| Charges | OLTP + OLAP | PostgreSQL | 7 / 18 | 7 / 20 | Amounts due and charge-level collection state |
| Partners | OLTP + OLAP | PostgreSQL | 8 / 0 | 8 / 12 | Partner master; management owned by OLAP |
| Payment Allocations | OLTP + OLAP | PostgreSQL | 14 / 5 | 14 / 1 | Receipt-to-charge allocation snapshots; workflow owned by OLTP |
| Payments | OLTP + OLAP | PostgreSQL | 14 / 9 | 14 / 2 | Receipt and processing state; workflow owned by OLTP |
| Calendar | OLAP | PostgreSQL view | — | 2 / 10 | Generated date spine and descriptive date fields |
| Loan Assessment | OLAP | PostgreSQL view | — | 25 / 16 | Inputs and stored SQL results with guarded presentation VCs |
| Cash Pool Contributions | OLAP | PostgreSQL | — | 7 / 2 | Partner capital contributions |
| Settlements | OLAP | PostgreSQL | — | 8 / 0 | Partner settlement records |
| Daily Analytics | OLAP | PostgreSQL | — | 17 / 6 | Persisted daily portfolio snapshots |

## Keys and relationships

Preserve existing text **Row ID** keys byte-for-byte, including case. Do not cast imported AppSheet identifiers to PostgreSQL UUID or use _RowNumber as a stable key. Calendar uses its Date key. AppSheet Ref behavior and database foreign keys are separate controls: an AppSheet part-of relationship does not imply PostgreSQL ON DELETE CASCADE.

| App | Child table | Ref column | Parent table | Parent key | Part of parent |
| --- | --- | --- | --- | --- | --- |
| OLTP | Loans | Ref Borrowers | Borrowers | Row ID | Yes |
| OLTP | Repayments | Ref Loans | Loans | Row ID | No |
| OLTP | Repayments | Ref Charges | Charges | Row ID | Yes |
| OLTP | Repayments | Ref Payment | Payments | Row ID | No |
| OLTP | Repayments | Ref Payment Allocation | Payment Allocations | Row ID | No |
| OLTP | Charges | Ref Loans | Loans | Row ID | Yes |
| OLTP | Payment Allocations | Ref Payment | Payments | Row ID | Yes |
| OLTP | Payment Allocations | Ref Charge | Charges | Row ID | No |
| OLTP | Payments | Ref Borrower | Borrowers | Row ID | Yes |
| OLTP | Payments | Ref Target Charge | Charges | Row ID | No |
| OLAP | Loans | Ref Borrowers | Borrowers | Row ID | Yes |
| OLAP | Repayments | Ref Loans | Loans | Row ID | No |
| OLAP | Repayments | Ref Charges | Charges | Row ID | Yes |
| OLAP | Repayments | Ref Payment | Payments | Row ID | No |
| OLAP | Repayments | Ref Payment Allocation | Payment Allocations | Row ID | No |
| OLAP | Charges | Ref Loans | Loans | Row ID | Yes |
| OLAP | Loan Assessment | Ref Borrower | Borrowers | Row ID | No |
| OLAP | Cash Pool Contributions | Ref Partner | Partners | Row ID | No |
| OLAP | Settlements | Ref Partner | Partners | Row ID | No |
| OLAP | Payment Allocations | Ref Payment | Payments | Row ID | No |
| OLAP | Payment Allocations | Ref Charge | Charges | Row ID | No |
| OLAP | Payments | Ref Borrower | Borrowers | Row ID | No |
| OLAP | Payments | Ref Target Charge | Charges | Row ID | No |

PostgreSQL currently has **13 validated foreign keys**. The workbook records exact constraints, including update/delete behavior. Eight BEFORE-row blank-reference triggers call public.appsheet_normalize_blank_refs to convert optional empty-string references to NULL before constraint checking. This includes payment-related optional references and other shared tables. Historical missing payment links have not been fabricated by this documentation task. Normalizers remain in place by the owner's instruction to retain the constraints as they stand.

## Current calculations and workflow boundaries

Loans[Borrower Name] is a **Name virtual column** in both production apps, with expression **[Ref Borrowers].[Borrower Name]**. Borrowers[Borrower Name] remains physical. The obsolete Loans name column and its two maintenance triggers are absent from the live database baseline. Charges and Repayments use their existing loan-name dereferences.

Payments represent receipts; Payment Allocations represent receipt-to-charge processing snapshots; Repayments record posted principal/interest and optional payment/allocation trace. The existing OLTP action definitions and guards are captured exactly in app-model.json. Operational correctness depends on posted amounts and processing state, not merely the existence of a row. Read-only configuration capture does not establish atomicity across separate AppSheet writes.

Production OLAP **1.100051** uses logical **Loan Assessment** bound to **Loan Assessment SQL Lab View**, over the stored **Loan Assessment SQL Lab** table. Saving inputs fires the existing SQL calculation/stamp triggers. Nineteen added provider fields expose results and freshness metadata; eleven presentation VCs were changed to read these results or show waiting/out-of-date messages. Statistics remains a KPI/control table and does not own the assessment outputs. No Refresh Assessment action is used. Normal sync retrieves outputs but does not recalculate an unchanged row. The shared input row and forecast horizon through **31 December 2026** remain existing design limits.

The owner authorized promotion on 15 September. All 41 assessment and 12 Calendar column definitions match development 1.000027 exactly. Production keeps database-2. Sixteen obsolete Calendar calculation VCs, Borrowers[Related Calendars], its two slice memberships and generated Calendar_Inline/View Ref dependencies were removed. Original production assessment inputs were preserved. A new-interface amount edit, automatic trigger/readback and restoration passed; pending status was observed. Rollback is production OLAP **1.100047**. See the [promotion record](../Change%20Logs/CHANGE_NOTES_ASSESSMENT_PROMOTION_2026-09-15.md) and [current OLAP snapshot](../outputs/assessment-promotion-20260915/app-model.json). Other app captures retain their earlier dates.

The existing three loan types, whole-baht daily-installment allocation, first-day receipt behavior, duplicate-charge guards, early-closure/default guards and receipt retry/reconciliation rules are preserved. Detailed rule history and prior tests are retained in [model history](AppSheet_Data_Model_History.md) and the dated Change Logs. The fresh dictionary is authoritative for current exact expressions; historical narrative is not a new test result.

## SQL objects and change management

Both instances contain 14 business/lab base tables, two public views, six application functions and ten enabled application triggers. public.flyway_schema_history is an additional metadata table, excluded from both apps and the business-column inventory. The same baseline includes indexes and constraints. Source SQL is [V1__existing_schema.sql](../database/migrations/V1__existing_schema.sql); later changes require immutable higher-version migrations under [database/README.md](../database/README.md).

Changes must be tested in development, with affected OLTP/OLAP consumers checked in the new GUI. Promote the exact tested commit/migration hashes after backup, drift review, rollback planning and explicit owner release approval. Never copy development financial data into production during schema promotion. AppSheet versions/bindings and Cloud SQL capacity/network settings are recorded separately from Flyway.

## Maintenance and remaining checks

Update this overview and the dictionary together with the applicable Markdown change log. Keep one production baseline and a development difference register. On promotion, update production documentation and close the promoted development differences. Re-export app definitions and database catalogs after model changes; a Flyway checksum validation alone is not a live drift check.

For acceptance of the assessment promotion, open/sync OLAP, change an assessment input and confirm the waiting message becomes a timestamped result. Confirm ordinary dashboard/partner navigation. No new loan or payment transaction is needed for this check. Scheduled execution, report/export delivery and sustained capacity behavior were not retested. See [verification coverage](Environment_Inventory.md#verification-coverage). Historical source notes remain preserved and explicitly dated.
