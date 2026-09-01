**GOVERNED MODEL REFERENCE**

# **AppSheet Data Model Overview**

*Money database  |  Loan Manager ผู้จัดการสินเชื่อ  |  Loan Business Insights*

*Descriptive companion to [AppSheet_Data_Dictionary.xlsx](./AppSheet_Data_Dictionary.xlsx)*

| **Control** | **Value** |
| --- | --- |
| Document role | Architecture, governance, purposes, assumptions, and review guidance |
| Technical inventory | AppSheet_Data_Dictionary.xlsx |
| Live baselines | Production OLTP `Loan Manager ผู้จัดการสินเชื่อ` v2.200099 (`93844270-6aa5-420b-a960-bcdf08abd357`), borrower-visibility rollback v2.200095, full-feature rollback v2.200082, and Statistics-action correction rollback v2.200093; OLAP `Loan Business Insights` v1.000164 (`e74dd368-654f-44d7-bccf-83cf361d1cdb`), daily-installment replication rollback v1.000160 |
| Daily-installment test baseline | Isolated OLTP clone `LoanMgr DailyPay TEST 0831` v1.000015 (`30b07f89-64a8-4648-9a68-0e3369803a2e`); deployed for automation testing with external-notification event conditions forced to `FALSE` |
| Conversion date | 30 August 2026 (Asia/Singapore) |
| Reconciliation date | 1 September 2026 for the production OLTP daily-installment extension and borrower-list visibility control; 31 August 2026 for prior OLTP financial-entry rules; 30 August 2026 for the remaining structural baseline (Asia/Singapore) |
| Reconciliation status | The current production baselines are OLTP v2.200099 and OLAP v1.000164. The daily-installment extension is implemented in both apps: OLTP owns the operational charge/payment workflow, while OLAP now loads `Daily Payment Amount`, aligns the five shared formulas, calculates declining whole-baht installment projections in Calendar/Loan Assessment, and exposes the two governed installment fields through read-only `Reporting Loans`. Production OLTP also loads physical `Borrowers[Hidden Flag]`, exposes it in `Borrowers_Form`, and uses editable slice `Visible Borrowers` only for the primary Borrowers view. No borrower was marked hidden during implementation. OLAP deliberately did not regenerate Borrowers, so `Hidden Flag` remains OLTP-only and the pre-existing Borrowers schema-drift warning remains. Looker Studio and the Daily Loan Analysis export were not changed. |
| Maintenance model | Excel is authoritative for row-level technical inventory; Markdown explains context and governance |

> **Reconciliation boundary**  The production reconciliation covered loaded tables, physical and virtual columns, formula text, the documented OLTP financial-entry `Valid_If` rules, shared-VC dependency closure, visibility and search settings, display names, key/label/required/PII flags, direct Ref targets, Is a part of? settings, slices, row filters, update modes, and slice-column order. The daily-installment workflow was first tested with synthetic records in an isolated clone, then its reviewed configuration was replayed into production OLTP. A later user-approved record-level correction changed only principal/interest allocation fields on seven existing production Charge/Repayment pairs; it did not change the data model, statuses, dates, row counts, or total collections. The OLAP replication changed only the reporting app definition: it regenerated Loans, added reporting VCs and slice membership, and changed no Loan, Charge, Repayment, Loan Assessment, Calendar-source, or notification row. The borrower-visibility revision changed the shared Borrowers source schema and OLTP configuration only; OLAP Borrowers was deliberately not regenerated, no borrower was marked hidden, and Looker Studio was not edited.

## 1. Purpose, authority, and maintenance

This overview explains how the shared database, the OLTP Operations app, and the OLAP Reporting app fit together. Detailed tables, columns, expressions, application variances, slices, and slice-column membership are maintained in the companion Excel workbook.

### 1.1 Authority and status

**System authority:** The AppSheet database and live app editors remain authoritative.

**Reference authority:** This pair was reconciled directly against both live AppSheet app editors on 30 August 2026. The app editors remain authoritative if later drift occurs.

**Reconciliation status:** Production OLTP is reconciled through v2.200099 for the daily-installment and borrower-list visibility scopes, and OLAP is reconciled through v1.000164 for daily-installment reporting and Loan Assessment. Charge generation and principal/interest allocation were accepted for one designated production loan, including reconciliation of its seven historical Charge/Repayment pairs. OLAP live-data checks confirmed Benz's ฿5,000, 17-day contract at ฿500/day produces ฿205.88 average expected daily interest, ฿1,854 uncharged current-month interest after the latest posted Charge, a 4.12% effective daily rate, and the bilingual type label; OLTP and OLAP `Expected Daily Interest` both reconciled to ฿6,906 at the same cutoff. The selected Loan Assessment control row did not reference an active installment borrower, so boundary-date projection behavior still requires a controlled manual selection test. The borrower visibility configuration remains editor-verified but awaits the user's record-level manual test because implementation deliberately changed no borrower flag.

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
| Money database | Operational system of record | 10 AppSheet Database tables | Physical keys, stored fields, and referential integrity |
| OLTP Operations | Loan Manager ผู้จัดการสินเชื่อ | 6 loaded tables; 2 slices | Data entry, validation, collection workflow, and lightweight operational indicators |
| OLAP Reporting | Loan Business Insights | 11 loaded tables; 11 slices | Historical analytics, partner analysis, loan assessment, and curated reporting feeds |
| External helper | Calendar Help Table / Sheet1 | 1 Google Sheets table | Date-spine calculations for the OLAP loan-assessment model |

The OLTP and OLAP apps share the same Money database. Application-specific variance is primarily expressed through loaded tables, virtual columns, and curated slices. The Calendar helper remains an external Google Sheets-backed input to the OLAP model.

### 2.1 Reconciliation summary

| **Inventory area** | **Live result** | **Documentation action** |
| --- | --- | --- |
| Tables | 11 loaded-table definitions across the two apps: 6 in OLTP and 11 in OLAP | No table catalog changes required |
| Columns | Production OLTP Loans has 40 columns: 20 physical and 20 VCs. Production OLAP Loans has 50 columns: 20 physical and 30 VCs. OLAP Calendar has 28 columns: 2 physical and 26 VCs. Production OLTP Borrowers has 31 columns: 7 physical and 24 VCs. The Excel union inventory contains 50 Loans rows and 59 Borrowers rows. | Reconciled `Daily Payment Amount`, `Expected Daily Interest Amount`, the five shared formulas, one OLAP-only Loans allocation helper, and four OLAP-only Calendar schedule helpers. `Borrowers[Hidden Flag]` remains intentionally OLTP-only. |
| Relationships | 8 direct Ref relationships; every target and Is a part of? setting matched | Marked relationship inventory reconciled |
| Slices | 13 live slices: 2 OLTP and 11 OLAP | Retained `Todays Collection Board`; added editable OLTP `Visible Borrowers` with 31 columns and filter `NOT([Hidden Flag])`; the obsolete documented `Payment Collection` slice remains retired |

The workbook uses a unioned column order: shared rows follow the OLAP order and OLTP-only columns are appended where necessary. A different live display order between the two apps is therefore not, by itself, model drift.

## 3. Table catalog

The companion workbook contains the complete column-level dictionary. This table remains in the overview because source ownership and table purpose are architectural facts.

| **Table** | **Source** | **Loaded in** | **Physical** | **OLTP VCs** | **OLAP VCs** | **Purpose** |
| --- | --- | --- | --- | --- | --- | --- |
| Borrowers | Money database | OLTP + OLAP | 7 | 24 | 50 | Borrower master records and borrower-level operational or portfolio indicators. The seventh physical field, `Hidden Flag`, is loaded only in production OLTP pending any separate OLAP schema regeneration. |
| Calendar | Calendar Help Table / Sheet1 | OLAP only | 2 | 0 | 26 | Google Sheets-backed date spine used by OLAP loan-assessment projections, including declining daily-installment principal and interest schedules; not part of Money database. |
| Cash Pool Contributions | Money database | OLAP only | 7 | 0 | 2 | Partner capital-contribution movements that build the lendable cash pool. |
| Charges | Money database | OLTP + OLAP | 7 | 15 | 18 | Scheduled amounts due and collection state at charge level, including principal and interest allocation. |
| Daily Analytics | Money database | OLAP only | 17 | 0 | 6 | Persisted daily portfolio snapshot fact table for historical reporting and governed feeds. |
| Loan Assessment | Money database | OLAP only | 6 | 0 | 16 | Input/control record for evaluating a proposed loan against projected coverage and return. |
| Loans | Money database | OLTP + OLAP | 20 | 20 | 30 | Loan contracts, commercial terms, lifecycle state, balances, daily-installment reporting, and loan-level risk metrics. OLAP adds one hidden whole-baht allocation helper for Calendar projections. |
| Partners | Money database | OLTP + OLAP | 5 | 0 | 12 | Partner master records used for capital participation and settlement reporting. |
| Repayments | Money database | OLTP + OLAP | 9 | 4 | 13 | Posted payment transactions and their allocation to loans and charges. |
| Settlements | Money database | OLAP only | 8 | 0 | 0 | Auditable partner settlement records and settlement status. |
| Statistics | Money database | OLTP + OLAP | 3 | 23 | 36 | Small KPI/control table used to expose app-level operational and reporting aggregates. |

*Physical count includes the AppSheet or Sheets row ordinal where exposed. Row ID is the documented stable key for AppSheet Database tables; Calendar uses Date as its key.*

## 4. Relationship model

The detailed workbook records the same direct Ref links in a filterable table. Reverse-reference virtual columns remain part of the Columns sheet.

| **Child table** | **Ref column** | **Parent table** | **Cardinality** | **Is a part of?** |
| --- | --- | --- | --- | --- |
| Calendar | Assessment Borrower | Borrowers | Borrowers 1 -> many Calendar | Independent child lifecycle |
| Cash Pool Contributions | Ref Partner | Partners | Partners 1 -> many Cash Pool Contributions | Independent child lifecycle |
| Charges | Ref Loans | Loans | Loans 1 -> many Charges | Child rows are marked part-of parent |
| Loan Assessment | Ref Borrower | Borrowers | Borrowers 1 -> many Loan Assessment | Independent child lifecycle |
| Loans | Ref Borrowers | Borrowers | Borrowers 1 -> many Loans | Child rows are marked part-of parent |
| Repayments | Ref Loans | Loans | Loans 1 -> many Repayments | Independent child lifecycle |
| Repayments | Ref Charges | Charges | Charges 1 -> many Repayments | Child rows are marked part-of parent |
| Settlements | Ref Partner | Partners | Partners 1 -> many Settlements | Independent child lifecycle |

> **Cascade caution**  Rows marked Is a part of? may follow the referenced parent lifecycle. Financially material corrections should remain auditable and should not rely on routine physical deletion.

## 5. Slice catalog

| **App** | **Slice** | **Source** | **Row filter** | **Mode** | **Cols** | **Purpose** |
| --- | --- | --- | --- | --- | --- | --- |
| OLTP | Todays Collection Board | Borrowers | ISNOTBLANK([Daily Collection Status]) | Read-only | 10 | Read-only borrower workboard restricted to borrowers with a current collection status. |
| OLTP | Visible Borrowers | Borrowers | NOT([Hidden Flag]) | Adds, updates, deletes | 31 | Editable primary borrower-list slice that excludes only borrowers explicitly marked hidden. Base-table relationships, loans, collections, and calculations remain unchanged. |
| OLAP | Borrowers with Outstanding Loans | Borrowers | [Total Outstanding Principal] > 0 | Read-only | 56 | Read-only OLAP subset of borrowers whose outstanding principal is greater than zero. |
| OLAP | Profit Contribution 30D | Borrowers | [Profit Last 30 Days] > 0 | Read-only | 56 | Read-only OLAP subset of borrowers contributing positive interest profit in the last 30 days. |
| OLAP | Reporting Borrowers | Borrowers | TRUE | Read-only | 40 | Curated, read-only borrower feed for downstream reporting and dashboard reconciliation. |
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

Shared VC formulas were aligned to the OLTP baseline beginning in OLAP version 1.000149. Version 1.000151 completed the original dependency chain; version 1.000164 added the daily-installment dependencies and restored full three-type formula parity. Interpret the monthly forecast using the following assumptions:

- Projected Monthly Profit equals Realized Profit MTD plus Today's Outstanding Interest plus Forecast Remaining Interest.
- Realized Profit MTD is based on Repayments[Interest Paid] whose Payment Date falls in the current calendar month. Under the current classification, first-day transfer fees recorded through Charge interest and negative default adjustments recorded through Interest Paid flow into this amount.
- Today's Outstanding Interest is not limited to today or the current month. It sums Charges[Interest Remaining] across all open Charges and may therefore include arrears originating before the current month.
- Expected Interest This Month includes accrued but uncharged daily interest since the latest Charge plus interest for days after today through month-end. For daily-installment loans it includes only scheduled interest for uncharged contract days after the latest posted Charge through the earlier of Due Date and month-end.
- The projection assumes all outstanding interest is collectible; it does not apply delinquency, default-probability, or collection-probability weighting.
- Daily-interest accuracy assumes Current Daily Interest is maintained in accordance with the loan contract, including after any principal change; the payment workflow does not automatically recalculate that stored value.
- For fixed-term loans, interest due later in the current month remains forecast until the due date, when the 00:05 bot is expected to create the Charge. A delayed or failed due-date bot can temporarily omit that fixed interest from both forecast and outstanding Charge interest.

### 6.1 OLTP-to-OLAP shared VC alignment and dependency repair

| **Table / column** | **Aligned OLAP configuration** |
| --- | --- |
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

The exact formulas and configuration notes are maintained in the workbook's Columns sheet. The initial comparison considered only the 78 VCs that already existed in both apps and therefore missed the three-column dependency chain. The original repair produced 81 shared VCs; loading `Expected Daily Interest Amount` into OLAP increases the shared baseline to 82. `Daily Installment Base Principal` and the four Calendar schedule VCs remain intentionally OLAP-only because they support reporting projections rather than operational entry.

> **Validation status**  All five daily-installment shared-formula variances are resolved and the embedded OLAP Analytics preview loads at v1.000164. AppSheet reports no new formula or schema errors. One pre-existing warning remains because shared-source `Borrowers[Hidden Flag]` is intentionally not loaded into OLAP. Reporting Loans is read-only with 32 columns, Reporting Statistics remains read-only with 17, and Reporting Borrowers remains read-only with 40.

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

The test clone remains deployed solely as retained test evidence; its three external notification event conditions remain `FALSE`. Production notification bots were not modified. The daily-installment configuration was verified at v2.200094, with v2.200082 recorded as the full-feature rollback point and v2.200093 as the immediate rollback for the Statistics-action correction; the current production OLTP editor baseline has since advanced to v2.200099 for the separate borrower-visibility revision. The actual production `Loans_Form` was opened, the third option was selected, and Due Date, Daily Payment Amount, and Payment Interval were confirmed visible; the form was cancelled without saving a row. The production dashboard was then opened and `Generate All Today's Charges` was confirmed visible. Subsequent production runtime review confirmed correct generation and P294/I206 allocation for the designated loan's 1 September Charge. Seven earlier Charge/Repayment pairs dated 25–31 August were then reallocated to matching whole-baht principal/interest pairs totaling P2,060/I1,440, while all paid statuses and the ฿3,500 combined total remained unchanged. OLAP replication used v1.000160 as its rollback point and completed at v1.000164 without changing transaction or assessment-control rows. Live OLAP checks confirmed the designated 17-day, ฿5,000 loan at ฿500/day reports ฿205.88 expected daily interest, ฿1,854 remaining current-month interest after the latest posted Charge, 4.12% effective daily interest, and `ผ่อนชำระรายวัน / Daily Installment`; OLTP and OLAP expected-daily-interest totals both reconciled to ฿6,906. Detailed formulas, clone tests, production changes, OLAP replication, correction history, and rollback instructions are in `Change Logs/CHANGE_NOTES_DAILY_INSTALLMENT_LOAN_TEST_2026-08-31.md`.

### 6.3 Borrower-list visibility control

Production OLTP v2.200099 introduces an intentionally narrow presentation control for the primary Borrowers view:

- `Borrowers[Hidden Flag]` is a physical AppSheet Database Yes/No field with initial value `FALSE`. Existing source rows were created as unchecked/false when the field was added.
- The field is shown and editable in `Borrowers_Form` with the bilingual display name `ซ่อนจากรายชื่อผู้กู้ / Hide from Borrowers List` and a description that explains its view-only effect.
- Editable slice `Visible Borrowers` uses source table `Borrowers`, includes all 31 production OLTP Borrowers columns, allows adds, updates, and deletes, and filters rows with `NOT([Hidden Flag])`.
- Only the primary `Borrowers` deck view changed source, from base table `Borrowers` to slice `Visible Borrowers`. Its sort, card fields, and actions were preserved.
- `Collection` remains sourced from `Todays Collection Board`; `Loans` remains sourced from base table `Loans`. No Ref relationship, security filter, action, automation, calculation, OLAP object, or Looker Studio object was changed.
- Hidden borrowers therefore remain in the shared base table, remain reachable through their loans and references, and remain included in every total and portfolio calculation. The setting is not a deletion, exclusion from reporting, or default-state change.
- No borrower record was marked hidden during implementation. Record-level behavior remains pending the user's manual test. To reverse a flag after a borrower disappears from the main list, open the borrower through an associated loan/reference and edit `Hidden Flag` back to `FALSE`, or update the source field directly with appropriate access.

Detailed production objects, checks, rollback steps, and the manual test matrix are recorded in `Change Logs/CHANGE_NOTES_BORROWER_VISIBILITY_2026-09-01.md`.

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
| Daily-installment downstream alignment | Production OLTP and OLAP are implemented. Read-only `Reporting Loans` now exposes `Daily Payment Amount` and `Expected Daily Interest Amount`; the Daily Loan Analysis export template and Looker Studio governed metrics were intentionally not changed and still require a separate downstream review. |
| Loan Assessment projection cost | The five hidden OLAP-only helpers are the minimum mapping layer needed to preserve per-loan whole-baht remainder allocation across Calendar dates. Review OLAP sync performance if portfolio or Calendar row counts grow materially; do not move these helpers into OLTP. |
| Borrower visibility scope | `Hidden Flag` must never be added to global calculation filters or reporting/security filters merely because it hides a name from the OLTP Borrowers list. OLAP has not loaded the physical field and should do so only under a separate reviewed change if reporting needs it. |

### 7.1 Manual validation checklist

**Schema:** Confirm the Money database still reports 10 tables, the external Calendar helper remains available, and each physical field matches the detailed dictionary.

**Relationships:** Open every listed Ref Type Details panel and confirm source table plus Is a part of? state.

**App variance:** Confirm the OLTP and OLAP column counts shown at each table heading match this document.

**Slices:** Confirm row filters, included-column order, and update mode for all 13 slices.

**Permissions:** Verify reporting slices remain read-only and operational update access matches intended roles.

**Financial logic:** Sample posted, partial, fully paid, overdue, reversed/adjusted, and defaulted scenarios against the documented VC dependencies.

**Daily installment:** Re-run whole-baht validation, uneven-principal allocation, interval batching, due-date tail generation, first-day auto-receipt, duplicate prevention, automatic final closure, and default scenarios before production acceptance. In OLAP, select a controlled borrower with an active installment loan in Loan Assessment and verify today, the next uncharged date, Due Date, and one day after Due Date against the documented principal/interest schedule; confirm Transfer Fee is not projected again and compare Reporting Loans/Statistics with OLTP at the same cutoff.

**Borrower visibility:** Mark a controlled borrower `Hidden Flag = TRUE`; confirm only the primary Borrowers view hides the row, while Loans, Collection where applicable, borrower references, and totals remain unchanged. Then restore the flag to `FALSE` and confirm the borrower returns.

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

> **Ongoing control**  After every model change, update the workbook, this overview, and a dated Markdown file in `Change Logs/`, then reconcile the affected objects against both app editors.
