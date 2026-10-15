**GOVERNED MODEL REFERENCE**

# **AppSheet Data Model Overview**

*Money database  |  Loan Manager ผู้จัดการสินเชื่อ  |  Loan Business Insights*

*Descriptive companion to [AppSheet_Data_Dictionary.xlsx](./AppSheet_Data_Dictionary.xlsx)*

| **Control** | **Value** |
| --- | --- |
| Document role | Architecture, governance, purposes, assumptions, and review guidance |
| Technical inventory | AppSheet_Data_Dictionary.xlsx |
| Historical baselines (before universal payments) | Production OLTP `Loan Manager ผู้จัดการสินเชื่อ` v2.300003 (`93844270-6aa5-420b-a960-bcdf08abd357`), today-only Collection amount rollback v2.300002, borrower principal-coverage rollback v2.200107, pending-collection reconciliation rollback v2.200101, borrower-visibility rollback v2.200095, full-feature rollback v2.200082, and Statistics-action correction rollback v2.200093; OLAP `Loan Business Insights` v1.000192 (`e74dd368-654f-44d7-bccf-83cf361d1cdb`), daily-collection-slice rollback v1.000191, borrower-matrix rollback v1.000173, projected-profit contribution rollback v1.000167, and daily-installment replication rollback v1.000160 |
| Daily-installment test baseline | Isolated OLTP clone `LoanMgr DailyPay TEST 0831` v1.000015 (`30b07f89-64a8-4648-9a68-0e3369803a2e`); deployed for automation testing with external-notification event conditions forced to `FALSE` |
| Conversion date | 30 August 2026 (Asia/Singapore) |
| Earlier reconciliation dates | 4 September 2026 for the three affected OLTP today-only Collection fields; 3 September 2026 for the OLAP `Todays Collection Board` slice and daily-collection message-review snapshot; 2 September 2026 for the OLAP borrower value/stability matrix fields, the Looker Studio Borrowers Analysis bubble chart, and the earlier projected-monthly-profit contribution change; 1 September 2026 for the production OLTP borrower principal-coverage metric, pending-collection reconciliation, daily-installment extension, and borrower-list visibility control; 31 August 2026 for prior OLTP financial-entry rules; 30 August 2026 for the remaining structural baseline (Asia/Singapore) |
| Earlier reconciliation status | Production OLTP v2.300003 adds `Repayments[Payment Amount Today]` and `Charges[Payment Received Today]`, then changes `Borrowers[Todays Amount Collected]` to sum the charge-level today-only value. The saved expressions and affected table counts were re-opened and verified in the live editor; the editor reported no issues. The user confirmed the Collection result was tested and working on 4 September 2026, so this change is accepted. OLAP remains v1.000192 and was not modified. Changes between the earlier documented OLTP v2.200115 baseline and the pre-change rollback v2.300002 that are unrelated to these three fields were not re-audited in this revision. |
| Current universal-payment baseline | Production OLTP **v3.000002**, 6 September 2026; app `93844270-6aa5-420b-a960-bcdf08abd357`, original Money database `9Y5vh3TFzZ4sIe2JgNh4l0`. Full backup and rollback v2.300005 recorded in the production change log. 187 OLTP column definitions and 133 documented behavior/view objects compared with accepted clone. |
| Current downstream boundary | OLAP **v1.100012** inspected; existing client and totals verified, recent Daily Analytics snapshots rebuilt after synthetic cleanup. New Payments/Payment Allocations tables and repayment trace columns are not loaded in OLAP. Its Repayments native-schema warning remains pending reconciliation. Looker Studio definition was not changed or fully re-tested. |
| Maintenance model | Excel is authoritative for row-level technical inventory; Markdown explains context and governance |
| Universal-payment test clone | `LoanMgr Payments TEST 20260905`, app `1b901dff-2e47-477c-8d2c-28aad5556102`, cloned database `Money Payments TEST 20260905` (`eEwpmrK1Zr4_ao2UcQzF42`). Model checkpoint v1.000065 confirmed in Manage > Versions on 6 September 2026; pre-edit rollback v1.000002. Targeted payment tests pass after fixes; broader testing remains incomplete. See the workbook's separate `Payments Clone` inventory. |

> **Historical reconciliation boundary (4 September)**  The 4 September 2026 review is intentionally limited to the three affected OLTP virtual columns, their saved formulas, and the live Borrowers/Charges/Repayments column counts. It did not re-audit unrelated changes made after the earlier OLTP v2.200115 documentation baseline. No physical database column, slice, view, action, automation, security filter, production financial row, OLAP object, or Looker Studio object changed in this revision. Earlier reconciliations covered the wider loaded-table, column, relationship, slice, view, format-rule, and Collection/Pending Payment surfaces described below. The borrower-matrix change added eleven hidden OLAP-only Borrowers VCs, added those fields to read-only `Reporting Borrowers`, refreshed the Looker borrower data source, and added one bubble chart plus active-borrower filter on the existing Borrowers Analysis page. The projected-profit contribution change added one OLAP-only borrower VC and one reference chart, then added that chart to Analytics. The current OLAP schema also loads the pre-existing `Hidden Flag` without using it in reporting.

## 1. Purpose, authority, and maintenance

This overview explains how the shared database, the OLTP Operations app, and the OLAP Reporting app fit together. Detailed tables, columns, expressions, application variances, slices, and slice-column membership are maintained in the companion Excel workbook.

### 1.1 Authority and status

**System authority:** The AppSheet database and live app editors remain authoritative.

**Reference authority:** The universal-payment model and production migration are reconciled through OLTP v3.000002 on 6 September 2026. The workbook main inventory now includes the 54 changed definitions, six native/app References and exact two-slice memberships. Historical OLAP definitions retain their dated reconciliation unless the current downstream boundary explicitly says otherwise. The app editors remain authoritative if later drift occurs.

**Earlier Collection reconciliation:** The today-only Collection dependency chain is reconciled and user-accepted through production OLTP v2.300003 with rollback v2.300002. The two new helper VCs are OLTP-only, and the shared-name `Borrowers[Todays Amount Collected]` now intentionally has different formulas in OLTP and OLAP. The OLAP `Todays Collection Board` slice remains reconciled through v1.000192 with rollback v1.000191. Separate Looker Studio acceptance work remains pending.

**Sensitive data:** The reference describes configuration only and contains no production records, borrower documents, bank details, or credentials.

### 1.2 Division of responsibility

| **Artifact** | **Role** | **Contents** | **Update trigger** |
| --- | --- | --- | --- |
| Markdown overview | Narrative | Architecture, ownership, purposes, assumptions, risks, and maintenance workflow | Update when meaning, ownership, architecture, or governance changes |
| Excel dictionary | Technical inventory | Tables, columns, expressions, relationships, slices, slice columns, and app variances | Update for every data-model or slice change |
| Markdown change logs | Audit trail | What changed, when, why, and whether it was reconciled with AppSheet | Create or update one dated file in `Change Logs/` for every accepted model revision |

### 1.3 Maintenance procedure

1. **Inspect:** Review the affected source table and both app definitions before changing the reference.
1. **Update Excel:** Edit the affected inventory rows first and preserve stable object names and column order.
1. **Update Markdown:** Revise this overview only when architecture, purpose, ownership, assumptions, risk, or validation guidance changes.
1. **Record:** Create or update a dated Markdown file in `Change Logs/`, including reconciliation status and source baseline.
1. **Verify:** Check filters, formulas as text, relationships, slice membership, and cross-document consistency before accepting the revision.

> **Maintenance rule**  Do not duplicate the full technical dictionary in Markdown. Excel is the row-level source of truth for this reference pair; Markdown supplies context.

## 2. Architecture overview

| **Component** | **Named asset** | **Current scope** | **Ownership / purpose** |
| --- | --- | --- | --- |
| Money database | Operational system of record | 12 AppSheet Database tables | Physical keys, stored fields, and referential integrity |
| OLTP Operations | Loan Manager ผู้จัดการสินเชื่อ | 8 loaded tables; 2 slices | Data entry, validation, collection workflow, and lightweight operational indicators |
| OLAP Reporting | Loan Business Insights | 11 loaded tables; 12 slices | Historical analytics, partner analysis, loan assessment, and curated reporting feeds |
| External helper | Calendar Help Table / Sheet1 | 1 Google Sheets table | Date-spine calculations for the OLAP loan-assessment model |

The OLTP and OLAP apps share the same Money database. Application-specific variance is primarily expressed through loaded tables, virtual columns, and curated slices. The Calendar helper remains an external Google Sheets-backed input to the OLAP model.

### 2.1 Earlier reconciliation summary (before universal payments)

| **Inventory area** | **Live result** | **Documentation action** |
| --- | --- | --- |
| Tables | 11 loaded-table definitions across the two apps: 6 in OLTP and 11 in OLAP | No table catalog changes required |
| Columns | Production OLTP Loans has 40 columns: 20 physical and 20 VCs. Production OLAP Loans has 50 columns: 20 physical and 30 VCs. OLAP Calendar has 28 columns: 2 physical and 26 VCs. Production OLTP Borrowers has 32 columns: 7 physical and 25 VCs. Production OLAP Borrowers has 69 columns: 7 physical and 62 VCs. Production OLTP Charges has 23 columns: 7 physical and 16 VCs. Production OLTP Repayments has 14 columns: 9 physical and 5 VCs. The Excel union inventory contains 50 Loans rows, 72 Borrowers rows, 28 Charges rows, and 23 Repayments rows. | Added the two OLTP-only today-payment helpers and documented the intended Borrowers formula variance. Earlier matrix, projected-profit, daily-installment, principal-coverage, and visibility reconciliation remains in force. |
| Relationships | 8 direct Ref relationships; every target and Is a part of? setting matched. `Charges[Ref Loans]` is now required in production OLTP. | Marked the Charges-to-Loans relationship as OLTP-required and confirmed all inspected Charge-creation actions populate it |
| Slices | 14 live slices: 2 OLTP and 12 OLAP | Added the read-only OLAP `Todays Collection Board` with filter `ISNOTBLANK([Daily Collection Status])`; the OLTP slice remains unchanged, `Visible Borrowers` remains editable, and the obsolete documented `Payment Collection` slice remains retired |

The workbook uses a unioned column order: shared rows follow the OLAP order and OLTP-only columns are appended where necessary. A different live display order between the two apps is therefore not, by itself, model drift.

### 2.2 Accepted isolated universal-payment implementation — historical test record

The isolated test work used a separate OLTP app and native database. This section records that test implementation and its limits; statements about production being unchanged refer to that historical test phase. The user accepted the results and authorized production migration on 6 September 2026. Section 2.3 and the production change log supersede the earlier deployment-pending status. The final test configuration is v1.000068, with data-model checkpoint v1.000065.

The clone contains the ten copied native tables plus **Payments** and **Payment Allocations**, with eight tables loaded in the test OLTP app. All six original OLTP tables were marked Connected in the cloned database picker. External notification bots for New Loan Created, Loan Closed, and Charge Received are disabled in the test app. File attachments were not copied.

Payments represents one actual receipt. Payment Allocations holds the eligible-charge snapshots and the frozen interest/principal allocation planned for that receipt. Generated Repayments continue to feed the existing charge, loan, and Collection formulas. Processing actions, a receipt bot, and full/partial/Receive All/lump-sum/loan-close/first-day entry actions are configured. Bot linkage was reconciled, a Payments menu and seven-field receipt form were configured, and synthetic runtime testing has begun. UX completion and regression testing remain incomplete.

All six new relationship columns are **native database Reference** and **app Ref**, with stable native Row ID keys preserved:

| Child | Reference column | Parent | Required in clone app | IsPartOf |
| --- | --- | --- | --- | --- |
| Payments | Ref Borrower | Borrowers | Yes | Yes |
| Payments | Ref Target Charge | Charges | Single Full, Single Partial, First-day Auto, Loan Close only | No |
| Payment Allocations | Ref Payment | Payments | Yes | Yes |
| Payment Allocations | Ref Charge | Charges | Yes | No |
| Repayments | Ref Payment | Payments | No | No |
| Repayments | Ref Payment Allocation | Payment Allocations | No | No |

The new ownership branch is **Borrower → Payment → Payment Allocation**. The existing **Borrower → Loan → Charge → Repayment** ownership chain is retained. Together these support the user's intended deletion of a disposable test borrower and its dependent records; the disposable Borrower B cascade completed across both branches after sync (T034). A check during sync briefly showed the receipts and allocations before their queued deletion finished. Historical/default Repayments may keep blank payment trace links. Routine financial correction behavior remains outside borrower cleanup.

The native labels for the new tables are Payment Date and Allocation Order. Those labels were selected so the initial label columns could be converted from temporary Text into native Reference. Production migration should create native References directly. App-level IsPartOf is configured separately from the native database type.

The workbook's `Payments Clone` sheet records 54 inspected new or changed column definitions at v1.000065, including processing-time Bank Reference/Notes locks. Payments has 23 app columns (14 physical including the source ordinal, nine VCs); Payment Allocations has 19 (14 physical including the ordinal, five VCs). Repayments Created By is confirmed at position 9. Five existing repayment-entry fields now use Editable_If ISBLANK([Ref Payment]). Borrowers position 33 Related Payments and Charges positions 24 Related Payment Allocations / 25 Related Payments have been reconciled, with their exact REF_ROWS formulas in the workbook. Borrowers, Loans, Charges, Statistics and Partners were regenerated after confirming each Source Id points to the clone. Captured grid metadata was unchanged except for two unwanted Loans date defaults, which were cleared back to blank; Close Date and Due Date blank initial values were read back at v1.000065. The clone-only Interest Due validation exception described below is the 54th definition.

Payments[Related Payment Allocations] remains the complete ownership list but is hidden and unsearchable. The new Visible Allocations VC selects positive allocated amounts for display. It does not remove zero-allocation snapshots. Runtime review found two-decimal displays on Planned Allocation Amount and Allocation Difference, and a dollar symbol/two decimals on Posting Difference; these were corrected to baht with zero decimals and read back in the editor. Whole-baht display was subsequently verified in the client.

Status is a required Enum with Processing/Posted/Error values and initial Processing. Managed fields use `Editable_If = FALSE`, which blocks user edits while permitting processing actions. A plain unchecked Editable setting excluded new trace columns from the action picker during inspection; the expression setting resolved that. Receipt amount must be a positive whole-baht value within eligible outstanding, with an exact match for full-payment methods. Payment Date cannot be later than today. Financial receipt inputs are locked after creation, while Bank Reference and Notes use `OR(NOT(IN([Row ID], Payments[Row ID])), [Status] <> "Processing")`: new form entry and Posted/Error metadata edits are allowed, but existing Processing receipts are locked. The system Edit action also requires Status other than Processing. Created By defaults to USEREMAIL(), Created At to NOW(), and Processed At now starts blank.

On creation, the target charge must be outstanding and belong to the payment's borrower. Validation now permits an existing receipt to retain its original paid target and amount when editing notes/bank reference, while creation-only edit locks retain the financial inputs. Single Full, Single Partial and First-day Auto target one charge; Receive All and Lump Sum include outstanding borrower charges through Payment Date. An internal **Loan Close** mode was added after inspecting the existing Close Loan action: it includes all remaining charges of the target charge's loan, retaining the original loan-specific scope without an extra physical column. Amount eligibility is computed as a hidden charge-reference list and outstanding total, displayed in the amount-entry description. Planned/posted sums and differences are shown for reconciliation.

The borrower form constraint rejects a new receipt while another receipt for that borrower is Processing or Error. This does not establish an atomic concurrency lock. Native Row ID is unavailable in the inspected create-repayment action's writable-column picker, so deterministic payment/allocation keys have not been implemented. Stable native keys and references remain intact. Snapshot creation selects the single Processing receipt for the borrower and evaluates target-charge/loan/date eligibility directly in the charge context; the earlier cross-context LOOKUP was removed after multi-charge tests saved only the oldest snapshot. Duplicate charge allocations and additions to an already frozen plan are guarded. Freeze actions require the complete eligible population, order charges by descending snapshot date and row ordinal, and split each charge interest first. Price calculations explicitly convert list elements to Decimal after editor type errors were found.

Posting actions skip zero allocations, check existing repayment links and current charge balances, and carry both receipt/allocation references and the original receipt creator. Tests found that processing steps did not consistently observe newly created related rows. Post-checkpoint debugging changed critical row selections and completeness/reconciliation checks to direct SELECT counts and sums over stored allocation and repayment fields. Freeze and posting row selectors require snapshot coverage before invoking child actions. Posting subtracts already-posted allocation keys. Reconciliation also requires no currently eligible charge missing from the snapshots, matching receipt/plan/posted amounts, complete frozen allocation components, one unique repayment per positive allocation, matching receipt/charge links and matching principal/interest components. It sets Posted and Processed At on success, otherwise Error. Retry changes Error to Processing only when no competing Processing receipt exists for the borrower. A successful receipt invokes the existing Set Loan Closed rule. These remain configured guards with limited runtime evidence, not atomic guarantees. Allocation Add/Edit/Delete are hidden and FALSE; generated repayment Edit/Delete are blocked, and ordinary repayment Add is hidden/FALSE. Payments Delete permits only unposted receipts without repayments. Borrower cascade passed after completed sync in T034. Loan/charge delete guards were configured to retain referenced allocation targets; further deletion edge cases remain in the coverage matrix.

Full and partial payment buttons now create/open Payments instead of writing ordinary Repayments directly. Receive All creates one borrower receipt through today; Lump Sum is a separate action. Collection retains its manual action bar and now includes Receive All Charges followed by Receive Lump Sum; the slice was not manually edited; its automatic Related Payments membership is documented below. Loan Close retains all outstanding charges of the selected loan and defers closure until posting. First-day receipts use Loan Date and Net-off at Disbursement. The two first-day bots have Trigger other bots and Wait for execution to complete enabled. The receipt bot was verified to link the five-action Payment - Process Receipt group directly; the unused Payment - Automation Entry helper was deleted and must not be migrated. Initial before/after event conditions failed to start new-receipt processing in two synthetic tests; the current debugging condition is [Status] = "Processing" for Adds/Updates, with Trigger other bots and Wait for execution to complete true on the receipt bot. All three external notification bots remain disabled. A subsequent fresh daily-installment first-day receipt and fresh lump-sum, partial and Receive All receipts automatically reached Posted in the recorded tests. Default writeoff now retains charges referenced by allocation snapshots; unreferenced unpaid charges retain the prior deletion path. Direct Loan/Charge Delete actions are hidden when allocations reference them; full borrower cascade remains supported. The default entry action additionally blocks Processing/Error receipts for that borrower. Source financial rollup formulas remain unchanged.

**Validation boundary:** Initial posting and multi-charge failures are retained in the execution report. After fixes, fresh first-day processing, lump sum100 (three snapshots, one interest repayment), lump sum205 (three snapshots, P200/I5 across two repayments), cash partial2, Receive All23 and daily-interest Loan Close500 passed in synthetic fixtures. Collection reconciled to355 collected today and zero remaining before the closure receipt. Unposted receipt deletion removed its owned allocation. Posted metadata editing preserved receipt totals and row counts. These are bounded runtime tests; borrower cascade passed after completed sync and the sequential pending-receipt guard passed. Broader regressions, simultaneous submissions, permissions and offline behavior remain pending. No full-testing or acceptance claim is made. See [the execution report](../outputs/universal-payments-20260905/functional-test-results.md) for exact cases and interventions.


**Default validation:** Charges Interest Due allows a zero/zero written-off charge only when Total Paid is zero, at least one allocation references it, and every allocation has Allocated Amount0 and a Posted parent receipt. The exact expression is in the dictionary and APP-047. An initial default test exposed partial group commits after validation failure; the repaired fixture and a fresh end-to-end zero-allocation default are separately documented. Groups are not treated as database transactions.

**Clone slices:** Visible Borrowers retains source Borrowers, filter `NOT([Hidden Flag])`, all CRUD and Auto assign actions; Related Payments is appended at position33 (previous32 columns). Todays Collection Board retains source Borrowers, filter `ISNOTBLANK([Daily Collection Status])`, read-only mode and Auto assign actions; Related Payments is appended at position12 (previous11). These automatic membership changes are inventoried in the workbook's `Payments Clone Slices` sheet, with all45 positions. No production slice was changed.

**Notification draft:** The disabled Notification - Charge Received bot now listens to a Payments update becoming Posted. Its body aggregates principal/interest across that receipt's Repayments and links to Payments_Detail. Recipients/title are retained. No messages or delivery tests were sent. The clone remains undeployed; the editor's sole warning is that scheduled Daily 00:05 requires deployment.

**Test data and limits:** Four empty starter records from each new table were deleted. Sixteen synthetic receipts and25 allocations remain as evidence, including the initially wrong LS25 result. Borrower B and its owned records were removed by the app cascade; unused diagnostic borrower C was also deleted. Fresh first-day, same/cross-date lump splits, Cash partial, Receive All, early future-charge payments, loan close, final-installment rounding, pending-receipt rejection/retry and default cases have bounded recorded results. T037 subsequently passed a controlled partial-posting failure: Retry preserved two frozen allocations and the original repayment and added only the missing5. T038 verified an interest-only5 receipt against five displayed KPI deltas. Offline/simultaneous use, scheduled execution, access roles, broader failures and downstream reconciliation still require coverage; user acceptance remains pending.

**Final configuration checkpoint:** v1.000068 confirmed in Manage > Versions. The data-model definitions remain the verified v1.000065 inventory. A temporary receipt-specific posting guard was fully restored at v1.000067; v1.000068 changed the Payments deck action selection to Manual with Delete, Edit, Payment - Retry. A synced Posted card shows only Edit. The editor reports no configuration errors and only the undeployed Daily00:05 warning. See the [migration runbook and acceptance matrix](Universal_Payments_Clone_Migration_Runbook.md). No production configuration or financial record was changed.

**Rollback:** Clone app v1.000002 is the app-definition rollback. App-version restoration does not remove physical schema changes; a clean database rollback requires a fresh isolated copy of source OLTP v2.300005 with a new database ID verified before use. The authoritative object-by-object history is [the universal-payment change log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md).

### 2.3 Production universal payments — deployed 6 September 2026

Production remains **Loan Manager ผู้จัดการสินเชื่อ**, app `93844270-6aa5-420b-a960-bcdf08abd357`, using the original Money database `9Y5vh3TFzZ4sIe2JgNh4l0`. Current saved version is **3.000002**. The user confirmed all clients were synced and data entry was paused before cutover. A full app/data/file-copy backup was completed before schema changes: app **LoanMgr FULL BACKUP 20260906** (`243eb391-5f6d-4720-a7e2-f0dc67151e78`, v1.000002), database **Money FULL BACKUP 20260906** (`SAYscSVuS847EarNTaAiwc`). App rollback baseline is **v2.300005**. Backup copies regenerate native Row IDs; retain the backup app and database as a pair. Restoring an app version alone does not restore physical data.

The original database now has twelve tables. New native tables are **Payments** (`O5PsoZ45Pa4-UiwXmMUzq8`) and **Payment Allocations** (`o9bAh2SCbt4umWWbdwabH9`). All six new relationship fields listed in section 2.2 are native Reference and OLTP Ref with the same required/IsPartOf rules. Both ownership branches are preserved. Historical/default repayments retain blank optional payment links. New tables were created empty; no clone business or synthetic data was migrated.

| OLTP table | Physical including ordinal | VCs | Total |
| --- | ---: | ---: | ---: |
| Borrowers | 7 | 26 | 33 |
| Loans | 20 | 20 | 40 |
| Charges | 7 | 18 | 25 |
| Repayments | 11 | 5 | 16 |
| Statistics | 3 | 23 | 26 |
| Partners | 5 | 0 | 5 |
| Payments | 14 | 9 | 23 |
| Payment Allocations | 14 | 5 | 19 |

The workbook **Columns**, **Tables**, **Relationships**, **Slices**, **Slice Columns** and **App Variances** now reflect this production model. The historical clone sheets remain test evidence. Production new-table app ordinals differ from the clone after native schema regeneration; the workbook records the actual production order. The two borrower slices are Visible Borrowers (33 columns, `NOT([Hidden Flag])`, adds/updates/deletes) and Todays Collection Board (12 columns, `ISNOTBLANK([Daily Collection Status])`, read-only). Their 45 ordered memberships match the accepted clone.

Payments owns receipt processing, snapshots, interest-first allocation, posting, reconciliation and retry. Existing charge/loan/Collection rollups continue to consume Repayments at the same grain. Full, partial, Receive All, lump sum, first-day and loan-close entry points use the universal engine. The narrowly scoped default validation and allocation-retention guards are included. No new general reversal engine was introduced.

The accepted definition was copied into a release candidate, remapped to all eight original production sources, regenerated and reconciled, then transferred using App Upgrade. The candidate is now a prototype with its daily scheduler and notifications disabled. Production's seven bots are enabled: the original six plus Payments - Process Receipt. The Charge Received notification now observes the single Payment Posted transition. Original Google sign-in, owner/one-user access, app identity and default app folder are preserved.

**Validation:** production definition/source checks passed. A fresh comparison found zero differences across 187 OLTP column definitions and 133 compared behavior/view objects relative to the accepted clone. Synthetic first-day10, invalid21 against20, valid lump sum15 and closure105 were exercised. Valid receipts automatically posted and reconciled; closure split100 principal/5 interest. Synthetic borrower cascade removed both branches and left both new tables empty. All ten operational dashboard amounts returned exactly to baseline. Notifications were suppressed during tests, then restored.

**Downstream:** OLAP retains its eleven loaded tables and previous Repayments schema (22 columns). It shows a source-schema warning for the added native trace fields, but a fresh client loaded and its existing totals reconciled. The new trace fields and payment tables remain **not loaded in OLAP; schema reconciliation pending**. The normal hourly reporting refresh captured temporary fixtures; its existing yesterday/today rebuild was run once after cleanup. Today's stored interest6486 and outstanding principal96176 then matched the cleaned operational source. The Looker definition was unchanged; its connector freshness and visual reconciliation remain manual checks.

Offline/concurrent clients, alternate roles/devices, scheduled first-day/date-boundary behavior, notification delivery and the complete Looker surface were not established by these bounded tests. Do not interpret deployment as proof of every possible scenario or external accounting compliance. Detailed object changes, intermediate corrections, results, rollback and the remaining manual checklist are in [the production change log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md).


## 3. Table catalog

The companion workbook contains the complete column-level dictionary. This table remains in the overview because source ownership and table purpose are architectural facts.

| **Table** | **Source** | **Loaded in** | **Physical** | **OLTP VCs** | **OLAP VCs** | **Purpose** |
| --- | --- | --- | --- | --- | --- | --- |
| Borrowers | Money database | OLTP + OLAP | 7 | 26 | 62 | Borrower master records and borrower-level operational or portfolio indicators. `Projected Monthly Profit Contribution` and the eleven borrower-matrix fields are OLAP-only; `Active Profit After Principal Coverage` is OLTP-only. `Hidden Flag` is loaded in both apps but filters only the OLTP primary Borrowers view. |
| Calendar | Calendar Help Table / Sheet1 | OLAP only | 2 | 0 | 26 | Google Sheets-backed date spine used by OLAP loan-assessment projections, including declining daily-installment principal and interest schedules; not part of Money database. |
| Cash Pool Contributions | Money database | OLAP only | 7 | 0 | 2 | Partner capital-contribution movements that build the lendable cash pool. |
| Charges | Money database | OLTP + OLAP | 7 | 18 | 18 | Scheduled amounts due and collection state at charge level, including principal and interest allocation and the OLTP-only today-payment rollup used by Collection. |
| Daily Analytics | Money database | OLAP only | 17 | 0 | 6 | Persisted daily portfolio snapshot fact table for historical reporting and governed feeds. |
| Loan Assessment | Money database | OLAP only | 6 | 0 | 16 | Input/control record for evaluating a proposed loan against projected coverage and return. |
| Loans | Money database | OLTP + OLAP | 20 | 20 | 30 | Loan contracts, commercial terms, lifecycle state, balances, daily-installment reporting, and loan-level risk metrics. OLAP adds one hidden whole-baht allocation helper for Calendar projections. |
| Partners | Money database | OLTP + OLAP | 5 | 0 | 12 | Partner master records used for capital participation and settlement reporting. |
| Repayments | Money database | OLTP + OLAP | 11 | 5 | 13 | Posted payment transactions and their allocation to loans and charges. Two new optional native trace References are loaded in OLTP; OLAP still loads nine physical columns and thirteen VCs, pending schema reconciliation. |
| Settlements | Money database | OLAP only | 8 | 0 | 0 | Auditable partner settlement records and settlement status. |
| Statistics | Money database | OLTP + OLAP | 3 | 23 | 36 | Small KPI/control table used to expose app-level operational and reporting aggregates. |
| Payments | Money database | OLTP only | 14 | 9 | 0 | Universal receipt state, amount, method, borrower, reconciliation and retry. |
| Payment Allocations | Money database | OLTP only | 14 | 5 | 0 | Frozen charge snapshots and interest/principal allocation; generated Repayments retain existing reporting grain. |

*Physical count includes the AppSheet or Sheets row ordinal where exposed. Row ID is the documented stable key for AppSheet Database tables; Calendar uses Date as its key.*

## 4. Relationship model

The detailed workbook records the same direct Ref links in a filterable table. Reverse-reference virtual columns remain part of the Columns sheet.

| **Child table** | **Ref column** | **Parent table** | **Cardinality** | **Is a part of?** |
| --- | --- | --- | --- | --- |
| Calendar | Assessment Borrower | Borrowers | Borrowers 1 -> many Calendar | Independent child lifecycle |
| Cash Pool Contributions | Ref Partner | Partners | Partners 1 -> many Cash Pool Contributions | Independent child lifecycle |
| Charges | Ref Loans | Loans | Loans 1 -> many Charges | Child rows are marked part-of parent; the Ref is required in production OLTP |
| Loan Assessment | Ref Borrower | Borrowers | Borrowers 1 -> many Loan Assessment | Independent child lifecycle |
| Loans | Ref Borrowers | Borrowers | Borrowers 1 -> many Loans | Child rows are marked part-of parent |
| Repayments | Ref Loans | Loans | Loans 1 -> many Repayments | Independent child lifecycle |
| Repayments | Ref Charges | Charges | Charges 1 -> many Repayments | Child rows are marked part-of parent |
| Settlements | Ref Partner | Partners | Partners 1 -> many Settlements | Independent child lifecycle |
| Payments | Ref Borrower | Borrowers | Borrowers 1 -> many Payments | OLTP part-of; required; native Reference |
| Payments | Ref Target Charge | Charges | Charges 1 -> many Payments | OLTP independent; conditionally required; native Reference |
| Payment Allocations | Ref Payment | Payments | Payments 1 -> many Payment Allocations | OLTP part-of; required; native Reference |
| Payment Allocations | Ref Charge | Charges | Charges 1 -> many Payment Allocations | OLTP independent; required; native Reference |
| Repayments | Ref Payment | Payments | Payments 1 -> many Repayments | OLTP independent; optional; native Reference, not loaded in OLAP |
| Repayments | Ref Payment Allocation | Payment Allocations | Payment Allocations 1 -> many Repayments | OLTP independent; optional; native Reference, not loaded in OLAP |

> **Cascade caution**  Rows marked Is a part of? may follow the referenced parent lifecycle. Financially material corrections should remain auditable and should not rely on routine physical deletion.

## 5. Slice catalog

| **App** | **Slice** | **Source** | **Row filter** | **Mode** | **Cols** | **Purpose** |
| --- | --- | --- | --- | --- | --- | --- |
| OLTP | Todays Collection Board | Borrowers | ISNOTBLANK([Daily Collection Status]) | Read-only | 12 | Read-only borrower workboard restricted to borrowers with a current collection status. |
| OLTP | Visible Borrowers | Borrowers | NOT([Hidden Flag]) | Adds, updates, deletes | 33 | Editable primary borrower-list slice that excludes only borrowers explicitly marked hidden and includes the active principal-coverage metric. Base-table relationships, loans, collections, and other calculations remain unchanged. |
| OLAP | Todays Collection Board | Borrowers | ISNOTBLANK([Daily Collection Status]) | Read-only | 11 | Read-only daily collection export and message-review slice. It uses OLAP-native current-status, amount, charge-list, hidden-flag, and overdue fields instead of adding the two OLTP-only presentation helpers. |
| OLAP | Borrowers with Outstanding Loans | Borrowers | [Total Outstanding Principal] > 0 | Read-only | 56 | Read-only OLAP subset of borrowers whose outstanding principal is greater than zero. |
| OLAP | Profit Contribution 30D | Borrowers | [Profit Last 30 Days] > 0 | Read-only | 56 | Read-only OLAP subset of borrowers contributing positive interest profit in the last 30 days. |
| OLAP | Reporting Borrowers | Borrowers | TRUE | Read-only | 51 | Curated, read-only borrower feed for downstream reporting and dashboard reconciliation, including all eleven value/stability matrix fields. |
| OLAP | Reporting Charges | Charges | TRUE | Read-only | 20 | Curated, read-only charge feed with due, paid, remaining, lateness, and borrower fields. |
| OLAP | Daily Analytics 7 Days | Daily Analytics | [Snapshot Date] >= NOW() - 7 | Read-only | 23 | Rolling seven-day daily-analytics window for recent trend analysis. |
| OLAP | Daily Analytics 30 Days | Daily Analytics | [Snapshot Date] >= NOW() - 30 | Read-only | 23 | Rolling 30-day daily-analytics window for monthly and near-term trend analysis. |
| OLAP | Daily Analytics 90 Days | Daily Analytics | [Snapshot Date] >= NOW() - 90 | Read-only | 23 | Rolling 90-day daily-analytics window for medium-term portfolio trends. |
| OLAP | Reporting Daily Analytics | Daily Analytics | TRUE | Read-only | 13 | Curated, read-only daily snapshot feed for governed downstream reporting. |
| OLAP | Reporting Loans | Loans | TRUE | Read-only | 32 | Curated, read-only loan feed containing contract, balance, `Daily Payment Amount`, `Expected Daily Interest Amount`, rate, age, and default fields. |
| OLAP | Reporting Repayments | Repayments | TRUE | Read-only | 8 | Curated, read-only posted-payment feed with loan and charge references. |
| OLAP | Reporting Statistics | Statistics | TRUE | Read-only | 17 | Curated, read-only KPI feed for governed dashboard totals. |

*Exact slice-column membership and order are maintained only in the workbook's Slice Columns sheet.*

## 6. Financial-model assumptions and shared-VC baseline

Shared VC formulas were aligned to the OLTP baseline beginning in OLAP version 1.000149. Version 1.000151 completed the original dependency chain; version 1.000164 added the daily-installment dependencies and restored full three-type formula parity; version 1.000171 added borrower-level attribution for the existing monthly projection KPI; version 1.000175 adds the borrower value/stability reporting layer. Interpret the monthly forecast using the following assumptions:

- Projected Monthly Profit equals Realized Profit MTD plus Today's Outstanding Interest plus Forecast Remaining Interest.
- Realized Profit MTD is based on Repayments[Interest Paid] whose Payment Date falls in the current calendar month. Under the current classification, first-day transfer fees recorded through Charge interest and negative default adjustments recorded through Interest Paid flow into this amount.
- Today's Outstanding Interest is not limited to today or the current month. It sums Charges[Interest Remaining] across all open Charges and may therefore include arrears originating before the current month.
- Expected Interest This Month includes accrued but uncharged daily interest since the latest Charge plus interest for days after today through month-end. For daily-installment loans it includes only scheduled interest for uncharged contract days after the latest posted Charge through the earlier of Due Date and month-end.
- The projection assumes all outstanding interest is collectible; it does not apply delinquency, default-probability, or collection-probability weighting.
- Daily-interest accuracy assumes Current Daily Interest is maintained in accordance with the loan contract, including after any principal change; the payment workflow does not automatically recalculate that stored value.
- For fixed-term loans, interest due later in the current month remains forecast until the due date, when the 00:05 bot is expected to create the Charge. A delayed or failed due-date bot can temporarily omit that fixed interest from both forecast and outstanding Charge interest.
- `Borrowers[Projected Monthly Profit Contribution]` applies the same three components at borrower grain: current-month `Repayments[Interest Paid]`, all matching `Charges[Interest Remaining]`, and matching `Loans[Expected Interest This Month]`. The chart uses the full Borrowers table so realized MTD profit from a borrower whose loan has since closed is not excluded.

### 6.1 OLTP-to-OLAP shared VC alignment and dependency repair

| **Table / column** | **Aligned OLAP configuration** |
| --- | --- |
| Borrowers / Projected Monthly Profit Contribution | Added as an OLAP-only Price VC with 0 decimals; allocates the three `Projected Monthly Profit` components to each borrower and supplies the fourth Analytics pie chart |
| Borrowers / Return on Active Principal | Uses Active Loan Interest Earned divided by Total Outstanding Principal, with a zero guard |
| Borrowers / Daily Collection Status | Uses the OLTP list-membership classification after the overdue test |
| Charges / Payment Date | Display name aligned to `วันที่ชำระครบ / Paid in Full Date` |
| Loans / Expected Interest This Month | Includes Accrued Interest plus the remaining daily-interest forecast |
| Loans / Last Interest Charge Date | Added to OLAP; supplies the latest related Charge Date used as the accrual boundary |
| Loans / Accrued Interest Days | Added to OLAP; calculates elapsed days from the latest interest charge, or Loan Date when no charge exists |
| Loans / Accrued Interest | Added to OLAP; supplies the accrued but uncharged interest referenced by Expected Interest This Month |
| Loans / Daily Payment Amount | Regenerated into OLAP as a whole-baht Price field; read-only reporting metadata uses the bilingual display name and interval-charge description without copying OLTP form rules |
| Loans / Expected Daily Interest Amount | Added to OLAP as a hidden Price VC; returns open daily-interest amount or average daily-installment contract interest and excludes Transfer Fee |
| Loans / Daily Installment Base Principal | Added as an OLAP-only hidden Number VC; supplies `FLOOR(Principal Amount / inclusive term days)` to Calendar's whole-baht schedule |
| Calendar / four installment schedule VCs | Added as hidden OLAP-only Price VCs for contract principal due, future principal due after the latest posted Charge, future interest due, and nonnegative contract outstanding |
| Calendar / Projected Outstanding Principal and Projected Interest | Added daily-installment branches while retaining the existing daily-interest and fixed-date branches |
| Calendar / Assessment Principal Base and Assessment Principal Start Weight | Added declining installment principal-day treatment used by Minimum Required Profit |
| Loans / Loan Duration | Uses Close Date, floors elapsed 24-hour periods, and adds one inclusive day |
| Statistics / Net Principal Days MTD | Hidden helper VC (`Show? = FALSE`) |
| Statistics / Forecast Remaining Principal Days | Hidden helper VC (`Show? = FALSE`) |
| Statistics / Forecast Average Daily Outstanding Principal | Hidden helper VC (`Show? = FALSE`) |
| Statistics / Profit Coverage of Outstanding Principal | Uses the OLTP zero guard before division |
| Statistics / Borrowers Fully Paid Today | Shown only when the corresponding count is positive; included in search |
| Statistics / Borrowers Partially Paid Today | Shown only when the corresponding count is positive; included in search |
| Statistics / Borrowers with Overdue Payment | Shown only when the corresponding count is positive; included in search |
| Statistics / Borrowers Not Paid Today | Shown only when the corresponding count is positive; included in search |

The exact formulas and configuration notes are maintained in the workbook's Columns sheet. The initial comparison considered only the 78 VCs that already existed in both apps and therefore missed the three-column dependency chain. The original repair produced 81 shared VCs; loading `Expected Daily Interest Amount` into OLAP increases the shared baseline to 82. The two new today-payment helpers are intentionally OLTP-only, so the shared-name baseline remains 82 even though `Borrowers[Todays Amount Collected]` now has an intentional formula variance. `Daily Installment Base Principal` and the four Calendar schedule VCs remain intentionally OLAP-only because they support reporting projections rather than operational entry.

> **Historical Collection validation (4 September)**  The three affected OLTP fields were saved and re-opened at v2.300003, and the editor reported no issues. The app has 32 Borrowers columns, 23 Charges columns, and 14 Repayments columns. The user confirmed the Collection behavior was tested and working on 4 September 2026. All five daily-installment shared-formula variances remain resolved. The OLAP editor remains at v1.000192 with the eleven-field read-only `Todays Collection Board` slice; no OLAP object was changed. The matrix fields and `Projected Monthly Profit Contribution` remain intentionally OLAP-only; `Borrowers[Active Profit After Principal Coverage]`, `Charges[Payment Received Today]`, and `Repayments[Payment Amount Today]` are intentionally OLTP-only.

### 6.2 Daily-installment loan extension

Production OLTP and OLAP now recognize the third Thai loan type, `ผ่อนชำระรายวัน` (Daily Installment). OLTP still uses no allocation-helper VC for its charge actions; OLAP uses a minimal hidden projection layer because AppSheet cannot aggregate a per-loan whole-baht allocation expression directly inside `SUM(SELECT(...))`. The contract and operational allocation rules were validated first in the isolated clone and then replayed into production:

- `Loans[Daily Payment Amount]` is a physical whole-baht Price field in the production AppSheet Database `Money database` / `Loans` table. It is required and shown only for `ผ่อนชำระรายวัน`.
- The production AppSheet Database `Loans[Loan Type]` Enum and the OLTP app column both contain the three governed options `กำหนดวันชำระ`, `ดอกเบี้ยรายวัน`, and `ผ่อนชำระรายวัน`.
- Loan Date through Due Date is counted inclusively. A same-day loan therefore has one scheduled day.
- Principal and Daily Payment Amount must be whole baht. The scheduled total, `Daily Payment Amount × inclusive term days`, must be greater than Principal Amount.
- Daily principal uses `FLOOR(Principal Amount / term days)`. The remainder is distributed one baht at a time to the earliest scheduled days, so every charge remains whole baht and total scheduled principal equals the original principal exactly.
- Each scheduled day's interest is `Daily Payment Amount - allocated daily principal`.
- The first-day Charge is created on loan creation and automatically received because the net principal disbursement is made after deducting the first payment. Existing Transfer Fee behavior is preserved by adding the fee to first-day Charge interest.
- Later Charges are generated by the existing recurring action. When Payment Interval is greater than one, one Charge combines all elapsed scheduled days since the latest Charge. Due Date forces a final Charge even when the remaining tail is shorter than the configured interval.
- The Statistics action `Generate All Today's Charges` selects the same eligible three loan types and is visible when at least one qualifying row exists. Its daily-installment branch applies the interval test, due-date tail rule, first-charge existence guard, and duplicate same-date guard used by the loan-level action.
- Duplicate same-date Charges are blocked by the existing date/loan guard.
- The manual early-closure action is unavailable for this type. Full repayment of the final principal-bearing Charge closes the loan automatically. The existing default workflow remains available and records remaining principal as Default Loss Amount.
- `Loans[Loan Type TE]`, `Loans[Expected Interest This Month]`, and `Loans[Effective Daily Interest Rate]` use explicit three-way `SWITCH`/`IFS` logic in production.
- One additional hidden, lightweight row-level VC, `Loans[Expected Daily Interest Amount]`, standardizes the open-loan amount used by operational daily-interest forecasts. It returns `[Current Daily Interest]` for open `ดอกเบี้ยรายวัน` loans, the average contract interest per inclusive day for open `ผ่อนชำระรายวัน` loans, and zero for closed or fixed-date loans. The daily-installment branch is `((Daily Payment Amount × inclusive term days) - Principal Amount) ÷ inclusive term days`; Transfer Fee is excluded.
- `Statistics[Expected Daily Interest]` sums `Loans[Expected Daily Interest Amount]`. `Borrowers[Active Daily Interest]` sums the same VC for the current borrower. This avoids storing a derived estimate in the physical `Current Daily Interest` field and keeps one reusable calculation instead of duplicating the expression in multiple aggregates.
- OLAP v1.000164 loads the same physical `Daily Payment Amount` and hidden `Expected Daily Interest Amount`, aligns the three loan formulas plus the Statistics and Borrowers aggregates, and exposes both fields in read-only `Reporting Loans` at positions 31 and 32.
- OLAP-only `Loans[Daily Installment Base Principal]` stores the deterministic FLOOR allocation used by Calendar. The one-baht remainder is not stored; Calendar applies it only to the earliest contract days by comparing each day index with `MOD(Principal Amount, inclusive term days)`.
- Hidden Calendar VCs calculate contract principal due, principal due after the latest posted Charge, corresponding future interest, and nonnegative contract outstanding. `Projected Outstanding Principal` starts from current Outstanding Principal and subtracts only future scheduled principal through the candidate date/Due Date. `Projected Interest` adds actual interest received plus only future uncharged installment interest; Transfer Fee is not projected again.
- `Assessment Principal Base` and `Assessment Principal Start Weight` algebraically preserve declining daily-installment principal-days in `Minimum Required Profit`, while the daily-interest and fixed-date branches remain unchanged.

The test clone remains deployed solely as retained test evidence; its three external notification event conditions remain `FALSE`. Production notification bots were not modified. The daily-installment configuration was verified at v2.200094, with v2.200082 recorded as the full-feature rollback point and v2.200093 as the immediate rollback for the Statistics-action correction; the current production OLTP editor baseline has since advanced to v2.200109 after the borrower-visibility, pending-collection, and borrower principal-coverage revisions. The actual production `Loans_Form` was opened, the third option was selected, and Due Date, Daily Payment Amount, and Payment Interval were confirmed visible; the form was cancelled without saving a row. The production dashboard was then opened and `Generate All Today's Charges` was confirmed visible. Subsequent production runtime review confirmed correct generation and P294/I206 allocation for the designated loan's 1 September Charge. Seven earlier Charge/Repayment pairs dated 25–31 August were then reallocated to matching whole-baht principal/interest pairs totaling P2,060/I1,440, while all paid statuses and the ฿3,500 combined total remained unchanged. OLAP replication used v1.000160 as its rollback point and completed at v1.000164 without changing transaction or assessment-control rows. Live OLAP checks confirmed the designated 17-day, ฿5,000 loan at ฿500/day reports ฿205.88 expected daily interest, ฿1,854 remaining current-month interest after the latest posted Charge, 4.12% effective daily interest, and `ผ่อนชำระรายวัน / Daily Installment`; OLTP and OLAP expected-daily-interest totals both reconciled to ฿6,906. Detailed formulas, clone tests, production changes, OLAP replication, correction history, and rollback instructions are in `Change Logs/CHANGE_NOTES_DAILY_INSTALLMENT_LOAN_TEST_2026-08-31.md`.

### 6.3 Borrower-list visibility control

Production OLTP v2.200099 introduces an intentionally narrow presentation control for the primary Borrowers view:

- `Borrowers[Hidden Flag]` is a physical AppSheet Database Yes/No field with initial value `FALSE`. Existing source rows were created as unchecked/false when the field was added.
- The field is shown and editable in `Borrowers_Form` with the bilingual display name `ซ่อนจากรายชื่อผู้กู้ / Hide from Borrowers List` and a description that explains its view-only effect.
- Editable slice `Visible Borrowers` uses source table `Borrowers`, includes all 32 production OLTP Borrowers columns, allows adds, updates, and deletes, and filters rows with `NOT([Hidden Flag])`.
- Only the primary `Borrowers` deck view changed source, from base table `Borrowers` to slice `Visible Borrowers`. Its sort, card fields, and actions were preserved.
- `Collection` remains sourced from `Todays Collection Board`; `Loans` remains sourced from base table `Loans`. No Ref relationship, security filter, action, automation, calculation, OLAP object, or Looker Studio object was changed.
- Hidden borrowers therefore remain in the shared base table, remain reachable through their loans and references, and remain included in every total and portfolio calculation. The setting is not a deletion, exclusion from reporting, or default-state change.
- No borrower record was marked hidden during implementation. Record-level behavior remains pending the user's manual test. To reverse a flag after a borrower disappears from the main list, open the borrower through an associated loan/reference and edit `Hidden Flag` back to `FALSE`, or update the source field directly with appropriate access.

Detailed production objects, checks, rollback steps, and the manual test matrix are recorded in `Change Logs/CHANGE_NOTES_BORROWER_VISIBILITY_2026-09-01.md`.

### 6.4 Pending-collection reconciliation

Production OLTP v2.200105 contains two correctly implemented preventive/display controls:

- The `Collection` view's Overdue/Not Paid group aggregate is `SUM :: Todays Amount Remaining`. This uses the same borrower-level remaining amount displayed on each Collection row, so the verified groups reconcile arithmetically.
- `Charges[Ref Loans]` is shown, editable, and required in production OLTP. `Generate Today's Charge`, `New Loan Payment - Create First-Day Charge`, `Create Final Charge`, and `Default - Create Final Charge` all explicitly assign `Ref Loans = [Row ID]` when creating a Charge.
- At the 1 September 2026 verification cutoff, the Collection view showed ฿300 Not Paid and ฿8,800 Overdue, composed of ฿4,300 and ฿4,500 borrower-level remaining amounts. The resulting ฿9,100 matched the dashboard Pending Payment KPI.
- The live Charges preview contained 319 rows, including 20 rows with `Amount Remaining > 0`, a ฿9,100 pending total, and no pending row with blank `Ref Loans`.

The reconciliation is not fully hardened. `Statistics[Pending Payment Amount]` remains `SUM(Charges[Amount Remaining])`, with no explicit `Ref Loans`, due-date, or operational-population filter. The current match therefore relies on complete Charge ownership and compatible date scope. Three previously identified orphan Charge rows totaling ฿5,450 were no longer present; no void/reversal record was visible, so their identifiers and amounts are retained in the dated change log as limited audit evidence. A future KPI-formula change or formal correction ledger requires a separate reviewed implementation.

Detailed evidence, open items, rollback steps, and the manual test checklist are recorded in `Change Logs/CHANGE_NOTES_PENDING_COLLECTION_RECONCILIATION_2026-09-01.md`.

### 6.5 Borrower active principal-coverage amount

Production OLTP v2.200109 adds one lightweight, row-level Borrowers VC:

```appsheet
[Active Loan Interest Earned] - [Total Outstanding Principal]
```

- Internal column name: `Active Profit After Principal Coverage`.
- Type: Price, shown with whole-baht precision.
- Display name: `กำไรหลังครอบคลุมเงินต้น / Profit After Principal Coverage`.
- Visibility: `[Has Active Loan]`; borrowers without an active loan do not show the metric.
- Interpretation: the active-loan interest already earned after subtracting current outstanding principal. It is a hypothetical immediate-default coverage amount, not accounting profit, expected loss, or a probability-weighted risk measure.
- `Visible Borrowers` includes the VC as column 32. `Visible Borrowers_Detail` places it immediately after `Active Loan Interest Earned` and before `Return on Active Principal`.
- Format rule `Borrowers - Principal Coverage - Positive` colors values greater than zero green. `Borrowers - Principal Coverage - Negative (Orange)` colors values below zero orange. Zero is intentionally unformatted.
- The implementation changed no physical source column or row, Ref relationship, form, action, bot, security filter, OLAP object, or Looker Studio object.

The editor reported no issues after save. A redacted live sample evaluated as `฿180 - ฿2,000 = ฿-1,820` and rendered orange in the requested position. The positive rule was re-opened and verified as green; record-level positive and zero scenarios remain in the manual acceptance checklist. Detailed rollback and test notes are in `Change Logs/CHANGE_NOTES_BORROWER_PRINCIPAL_COVERAGE_2026-09-01.md`.

### 6.6 Borrower value and stability matrix

OLAP v1.000175 adds a borrower-grain reporting layer for the Looker Studio `Borrower Value & Stability Matrix`. All eleven fields are hidden in the AppSheet UX and exposed through the read-only `Reporting Borrowers` slice:

- Economic contribution is `Profit Last 30 Days` divided by the active-borrower total of the same measure. The high-value threshold is `1 / active borrower count`; equality belongs to the high-value side.
- Stability is a 0–100 weighted score: recent 30-day reliability 45%, historical 180-day reliability 20%, 90-day delay severity 20%, and current condition 15%. Missing historical components are omitted and the available weights are renormalized.
- A borrower is flagged as having sufficient history only after at least three obligations with charge dates before today and a span of at least 30 days. The chart label identifies insufficient-history classifications as provisional.
- Current condition treats a charge due today as current, not late. It becomes late only when its charge date is before `TODAY()` and an amount remains.
- Quadrants use stability `80` and the dynamic equal-share contribution threshold: Star (high/high), Cash Cow (low/high), Question Mark (high/low), and Dog (low/low).
- Looker Studio filters the chart to active borrowers and uses `Total Outstanding Principal` as bubble size. Native Looker scatter charts cannot use a second dimension for color without aggregating borrowers into quadrant-level bubbles, so the delivered chart keeps one bubble per borrower and includes the quadrant in `Matrix Bubble Label`.

The formula text, exact types, purpose, availability, and 51-field slice order are maintained in the companion workbook. This is a prototype segmentation aid, not a credit score, accounting measure, or regulatory risk classification.

### 6.7 Today-only Collection payment amount

Production OLTP v2.300003 changes only the right-side amount displayed by the existing Collection workflow. It introduces a lightweight related-row dependency chain:

```appsheet
Repayments[Payment Amount Today]
IF([Payment Date] = TODAY(), [Amount Received], 0)

Charges[Payment Received Today]
SUM([Related Repayments][Payment Amount Today])

Borrowers[Todays Amount Collected]
SUM([Todays Collection Charges][Payment Received Today])
```

- The repayment helper evaluates each posted Repayment at row grain and returns only the amount whose `Payment Date` equals the app's `TODAY()`.
- The charge helper uses the existing `Related Repayments` reverse-reference list. This avoids a new full-table `SELECT()` for every Charge while keeping the date rule traceable at payment grain.
- The borrower total still uses the existing `Todays Collection Charges` population, so collection grouping, status, due, and remaining calculations are unchanged.
- The two helper VCs are OLTP-only. OLAP remains unchanged, and its `Borrowers[Todays Amount Collected]` continues to sum `Total Paid`; this is an intentional documented formula variance until a separate OLAP review is requested.
- No physical column, database row, slice, view, action, automation, security filter, or Looker Studio object changed.

The editor reported no issues after save, and the three expressions persisted after navigation and re-open. The user subsequently tested the Collection result and confirmed it was working on 4 September 2026; the change is accepted.

## 7. Known implications and follow-up checks

| **Area** | **Implication** |
| --- | --- |
| OLTP/OLAP variance | Shared physical tables have materially different VC layers. Changes to a shared field must be reviewed in both app dictionaries even when only one app appears to use it. |
| Reporting ownership | OLAP-only VCs and Reporting * slices are the preferred governed feed surface. Do not move their heavy aggregation into OLTP without a performance assessment. |
| Calendar source | Calendar is not in Money database. Its key/date population and refresh behavior depend on Calendar Help Table / Sheet1 and must be checked separately. |
| Slice comments | `Visible Borrowers` has a descriptive comment explaining its narrow view-only scope. Previously inspected slices had blank comments; future changes should populate them where practical. |
| Retired slice | `Payment Collection` was present in the prior documentation but not in the live OLTP app at reconciliation. Reintroducing it would be a model change requiring both documents and a Markdown change log update. |
| Shared-VC alignment | OLTP is the governing baseline for VCs used by both apps. Future shared-VC changes must be reviewed in OLAP and documented in the same revision. |
| Dependency closure | Before copying a formula between apps, recursively confirm that every referenced physical column, VC, reverse-reference column, and table exists in the target app. A shared-name comparison alone is insufficient. |
| Dashboard reconciliation | Reporting slice totals should be reconciled to their governed base grains and refresh cutoff before Looker Studio changes are accepted. |
| Borrower matrix interpretation | The contribution axis is relative to the current active-borrower population, so both borrower exits/entries and 30-day profit changes move the benchmark. Stability is a prototype behavioral score and must not be treated as an approved credit rating. |
| Borrower matrix performance | The eleven OLAP-only VCs use multiple cross-table `SELECT()` calculations. Keep them out of OLTP and review OLAP sync/refresh time as borrower, loan, and charge volumes grow. |
| Daily-installment downstream alignment | Production OLTP and OLAP are implemented. Read-only `Reporting Loans` now exposes `Daily Payment Amount` and `Expected Daily Interest Amount`; the Daily Loan Analysis export template and Looker Studio governed metrics were intentionally not changed and still require a separate downstream review. |
| Loan Assessment projection cost | The five hidden OLAP-only helpers are the minimum mapping layer needed to preserve per-loan whole-baht remainder allocation across Calendar dates. Review OLAP sync performance if portfolio or Calendar row counts grow materially; do not move these helpers into OLTP. |
| Borrower visibility scope | `Hidden Flag` must never be added to global calculation filters or reporting/security filters merely because it hides a name from the OLTP Borrowers list. OLAP currently loads the physical field, but no OLAP metric, slice, or chart filters on it; any future reporting use requires a separate reviewed change. |
| Projected-profit contribution scope | The fourth Analytics pie chart is a borrower allocation of the existing prototype projection, not an additional profit total. Its borrower values should sum to `Statistics[Projected Monthly Profit]` at the same sync cutoff; zero or negative contributions may affect pie-chart presentation and require manual review. |
| Daily collection export scope | The OLAP `Todays Collection Board` is a read-only review/export surface, not a transaction or messaging system. Snapshot amounts must be refreshed and reconciled immediately before use; overdue means a charge date before the defined snapshot date, and no reminder should be sent without a human wording and amount check. |
| Borrower principal-coverage scope | `Active Profit After Principal Coverage` is an OLTP operational indicator based on current active-loan VCs. It must not be described as realized accounting profit or a probability-weighted default-loss measure, and it should be reviewed separately before reuse in OLAP or Looker Studio. |
| Pending-payment KPI scope | `Statistics[Pending Payment Amount]` is still an unfiltered sum across all Charges. Required `Ref Loans` prevents new normal-form or action-created orphans, but it does not itself exclude future-dated or exceptional source rows; reconcile the KPI to Collection at a defined cutoff until the formula is explicitly hardened. |
| Orphan cleanup auditability | Three invalid orphan Charge rows totaling ฿5,450 were physically absent at verification and no void/reversal records were visible. Preserve the dated change-log evidence and use an auditable void/reversal/adjustment workflow for future financially material corrections. |
| Today-only Collection date basis | The displayed amount depends on `Repayments[Payment Date] = TODAY()` in the OLTP app. Confirm the app's Asia/Singapore date boundary and sync cutoff, especially around midnight, corrections, reversals, and offline entries. Payments dated before today intentionally contribute zero even when their Charges remain in `Todays Collection Charges`. |

### 7.1 Manual validation checklist

**Schema:** Confirm the Money database still reports 10 tables, the external Calendar helper remains available, and each physical field matches the detailed dictionary.

**Relationships:** Open every listed Ref Type Details panel and confirm source table plus Is a part of? state.

**App variance:** Confirm the OLTP and OLAP column counts shown at each table heading match this document.

**Slices:** Confirm row filters, included-column order, and update mode for all 14 slices.

**Permissions:** Verify reporting slices remain read-only and operational update access matches intended roles.

**Financial logic:** Sample posted, partial, fully paid, overdue, reversed/adjusted, and defaulted scenarios against the documented VC dependencies.

**Daily installment:** Re-run whole-baht validation, uneven-principal allocation, interval batching, due-date tail generation, first-day auto-receipt, duplicate prevention, automatic final closure, and default scenarios before production acceptance. In OLAP, select a controlled borrower with an active installment loan in Loan Assessment and verify today, the next uncharged date, Due Date, and one day after Due Date against the documented principal/interest schedule; confirm Transfer Fee is not projected again and compare Reporting Loans/Statistics with OLTP at the same cutoff.

**Borrower visibility:** Mark a controlled borrower `Hidden Flag = TRUE`; confirm only the primary Borrowers view hides the row, while Loans, Collection where applicable, borrower references, and totals remain unchanged. Then restore the flag to `FALSE` and confirm the borrower returns.

**Borrower principal coverage:** In desktop and mobile detail views, test one borrower each with a positive, negative, zero, and no-active-loan result. Confirm the formula equals `Active Loan Interest Earned - Total Outstanding Principal`, the field order is correct, positive is green, negative is orange, zero is unformatted, and the field is hidden when `[Has Active Loan]` is false. Sync again and confirm no material performance regression.

**Projected monthly profit contribution:** At one recorded sync cutoff, sum `Borrowers[Projected Monthly Profit Contribution]` and confirm it equals `Statistics[Projected Monthly Profit]`. Spot-check one borrower for each component—realized current-month interest, open-charge interest remaining, and forecast remaining interest—and confirm the fourth Analytics pie chart follows `Daily Interest Contribution`, uses percent labels, and retains the full Borrowers population even when a contributing loan has closed.

**Borrower value/stability matrix:** At one recorded sync cutoff, confirm the chart contains exactly the active-borrower population; the X shares sum to 100% when the active population has positive 30-day profit; the X reference line equals `1 / active borrower count`; and the Y reference line equals 80. Spot-check one borrower in each populated quadrant against the four stability components, confirm equality follows the high-side rule, verify due-today charges are not late, and confirm borrowers with fewer than three past obligations or less than 30 days of history are labeled provisional. Compare bubble-size ordering with `Total Outstanding Principal` and confirm the retained `Capital vs Profit Scatter Plot` is unchanged.

**Pending collection:** Sync to the current production version; confirm Not Paid plus Overdue group totals equal the displayed borrower remaining amounts and the Pending Payment KPI. Create one controlled Charge through each permitted workflow and confirm `Ref Loans` is populated and cannot be saved blank. Also test a future-dated Charge and an approved adjustment/reversal scenario to expose the still-open KPI population rule.

**Daily collection message review:** In OLAP v1.000192, confirm `Todays Collection Board` is read-only, uses `ISNOTBLANK([Daily Collection Status])`, and exposes the eleven documented fields in order. At one fresh sync cutoff, compare each actionable borrower against the OLTP Collection detail, confirm `Outstanding Now = Today Outstanding + Overdue Outstanding`, review the Thai wording and 16.00 deadline with the user's friend, and verify no fully paid borrower is included. Do not automate or send until the friend approves the tone and the user explicitly scopes the next step.

**Today-only Collection amount:** User acceptance was recorded on 4 September 2026 after the Collection result was tested and confirmed working in OLTP v2.300003. For future regression testing, use an overdue Charge with one repayment before today and one today; the right-side amount must include only today's repayment. Also test multiple payments today on the same and different Charges, a Charge with prior-day payments only, and a Charge fully paid today. Confirm Collection groups and `Todays Amount Remaining` totals are unchanged, verify behavior across the Asia/Singapore midnight boundary and after sync, compare sync time with v2.300002, and confirm OLAP remains unchanged.

**Reconciliation:** Reconcile OLAP Reporting slice totals to Money database at a defined as-of time before dashboard use.

### 7.2 OLTP financial-entry validation baseline

The production OLTP app uses the following validated input policy as of version `2.200079`:

- `Charges[Principal Due]` must be nonnegative: `[_THIS] >= 0`.
- `Charges[Interest Due]` may be negative for the accepted default-loan workflow, but the charge row cannot have both principal and interest equal to zero: `OR([Principal Due] <> 0, [_THIS] <> 0)`.
- `Repayments[Principal Paid]` remains nonnegative and cannot exceed the charge's remaining principal after excluding the current row from the prior-payment sum.
- `Repayments[Interest Paid]` may be negative for the accepted default-loan workflow and retains the existing remaining-interest overpayment guard; the repayment row cannot have both principal and interest equal to zero.
- `Charges[Payment Status]` remains a settlement state rather than an overdue state. Lateness continues to be represented through the existing overdue/days-late fields and collection indicators.
- Early payment of a future-due charge remains allowed by design.

These are OLTP form-validity rules. The shared physical columns and stored data grain are unchanged, and the OLAP app was not modified by this validation revision.

## 8. Companion workbook map

| **Worksheet** | **Purpose** |
| --- | --- |
| README | Status, maintenance rules, scope, and formula-driven inventory counts |
| Tables | One row per source table with app loading, physical/VC counts, and purpose |
| Columns | One row per unioned column definition, including type, availability, flags, purpose, and expression |
| Relationships | One row per direct Ref relationship and part-of behavior |
| Slices | One row per OLTP/OLAP slice with filter, update mode, purpose, and column count |
| Slice Columns | One row per included slice column, preserving display order |
| App Variances | Tables and columns present in only one app |
| Change Log | Reserved worksheet; authoritative change history is maintained in `Change Logs/*.md` |
| Payments Clone | 54 inspected column definitions for the isolated universal-payment clone at v1.000065; separate from the production inventory |
| Payments Clone Slices | Complete ordered membership of the two affected borrower slices, 45 rows at v1.000065 |

> **Ongoing control**  After every model change, update the workbook, this overview, and a dated Markdown file in `Change Logs/`, then reconcile the affected objects against both app editors.
