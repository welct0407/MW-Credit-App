**GOVERNED MODEL REFERENCE**

# **AppSheet Data Model Overview**

*Money database  |  Loan Manager ผู้จัดการสินเชื่อ  |  Loan Business Insights*

*Descriptive companion to [AppSheet_Data_Dictionary.xlsx](./AppSheet_Data_Dictionary.xlsx)*

| **Control** | **Value** |
| --- | --- |
| Document role | Architecture, governance, purposes, assumptions, and review guidance |
| Technical inventory | AppSheet_Data_Dictionary.xlsx |
| Live baselines | OLTP `Loan Manager ผู้จัดการสินเชื่อ` v2.200079 (`93844270-6aa5-420b-a960-bcdf08abd357`); OLAP `Loan Business Insights` v1.000151 (`e74dd368-654f-44d7-bccf-83cf361d1cdb`) |
| Conversion date | 30 August 2026 (Asia/Singapore) |
| Reconciliation date | 31 August 2026 for the OLTP financial-entry validation rules; 30 August 2026 for the remaining structural baseline (Asia/Singapore) |
| Reconciliation status | Reconciled with both live AppSheet app editors |
| Maintenance model | Excel is authoritative for row-level technical inventory; Markdown explains context and governance |

> **Reconciliation boundary**  The reconciliation covered loaded tables, physical and virtual columns, formula text, the four documented OLTP financial-entry `Valid_If` rules, shared-VC dependency closure, visibility and search settings, display names, key/label/required/PII flags, direct Ref targets, Is a part of? settings, slices, row filters, update modes, and slice-column order. The OLAP editor reported no issues and its embedded Analytics preview loaded after the dependency repair. The OLTP validation changes were runtime-tested only in the isolated clone; no production transaction row was created or edited during production verification.

## 1. Purpose, authority, and maintenance

This overview explains how the shared database, the OLTP Operations app, and the OLAP Reporting app fit together. Detailed tables, columns, expressions, application variances, slices, and slice-column membership are maintained in the companion Excel workbook.

### 1.1 Authority and status

**System authority:** The AppSheet database and live app editors remain authoritative.

**Reference authority:** This pair was reconciled directly against both live AppSheet app editors on 30 August 2026. The app editors remain authoritative if later drift occurs.

**Reconciliation status:** Complete for the structural scope stated above. Runtime workflows, bots, security behavior, and row-level financial results require separate testing.

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
| OLTP Operations | Loan Manager ผู้จัดการสินเชื่อ | 6 loaded tables; 1 slice | Data entry, validation, collection workflow, and lightweight operational indicators |
| OLAP Reporting | Loan Business Insights | 11 loaded tables; 11 slices | Historical analytics, partner analysis, loan assessment, and curated reporting feeds |
| External helper | Calendar Help Table / Sheet1 | 1 Google Sheets table | Date-spine calculations for the OLAP loan-assessment model |

The OLTP and OLAP apps share the same Money database. Application-specific variance is primarily expressed through loaded tables, virtual columns, and curated slices. The Calendar helper remains an external Google Sheets-backed input to the OLAP model.

### 2.1 Reconciliation summary

| **Inventory area** | **Live result** | **Documentation action** |
| --- | --- | --- |
| Tables | 11 loaded-table definitions across the two apps: 6 in OLTP and 11 in OLAP | No table catalog changes required |
| Columns | 296 unioned columns, including 81 VCs used by both apps | Aligned 13 differing shared VCs and added the 3-column accrued-interest dependency chain to OLAP; no compared shared-VC differences remain |
| Relationships | 8 direct Ref relationships; every target and Is a part of? setting matched | Marked relationship inventory reconciled |
| Slices | 12 live slices: 1 OLTP and 11 OLAP | Removed the obsolete documented OLTP `Payment Collection` slice and its 22 slice-column rows |

The workbook uses a unioned column order: shared rows follow the OLAP order and OLTP-only columns are appended where necessary. A different live display order between the two apps is therefore not, by itself, model drift.

## 3. Table catalog

The companion workbook contains the complete column-level dictionary. This table remains in the overview because source ownership and table purpose are architectural facts.

| **Table** | **Source** | **Loaded in** | **Physical** | **OLTP VCs** | **OLAP VCs** | **Purpose** |
| --- | --- | --- | --- | --- | --- | --- |
| Borrowers | Money database | OLTP + OLAP | 6 | 24 | 50 | Borrower master records and borrower-level operational or portfolio indicators. |
| Calendar | Calendar Help Table / Sheet1 | OLAP only | 2 | 0 | 22 | Google Sheets-backed date spine used by OLAP loan-assessment projections; not part of Money database. |
| Cash Pool Contributions | Money database | OLAP only | 7 | 0 | 2 | Partner capital-contribution movements that build the lendable cash pool. |
| Charges | Money database | OLTP + OLAP | 7 | 15 | 18 | Scheduled amounts due and collection state at charge level, including principal and interest allocation. |
| Daily Analytics | Money database | OLAP only | 17 | 0 | 6 | Persisted daily portfolio snapshot fact table for historical reporting and governed feeds. |
| Loan Assessment | Money database | OLAP only | 6 | 0 | 16 | Input/control record for evaluating a proposed loan against projected coverage and return. |
| Loans | Money database | OLTP + OLAP | 19 | 19 | 28 | Loan contracts, commercial terms, lifecycle state, balances, and loan-level risk metrics. |
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
| OLAP | Borrowers with Outstanding Loans | Borrowers | [Total Outstanding Principal] > 0 | Read-only | 56 | Read-only OLAP subset of borrowers whose outstanding principal is greater than zero. |
| OLAP | Profit Contribution 30D | Borrowers | [Profit Last 30 Days] > 0 | Read-only | 56 | Read-only OLAP subset of borrowers contributing positive interest profit in the last 30 days. |
| OLAP | Reporting Borrowers | Borrowers | TRUE | Read-only | 40 | Curated, read-only borrower feed for downstream reporting and dashboard reconciliation. |
| OLAP | Reporting Charges | Charges | TRUE | Read-only | 20 | Curated, read-only charge feed with due, paid, remaining, lateness, and borrower fields. |
| OLAP | Daily Analytics 7 Days | Daily Analytics | [Snapshot Date] >= NOW() - 7 | Read-only | 23 | Rolling seven-day daily-analytics window for recent trend analysis. |
| OLAP | Daily Analytics 30 Days | Daily Analytics | [Snapshot Date] >= NOW() - 30 | Read-only | 23 | Rolling 30-day daily-analytics window for monthly and near-term trend analysis. |
| OLAP | Daily Analytics 90 Days | Daily Analytics | [Snapshot Date] >= NOW() - 90 | Read-only | 23 | Rolling 90-day daily-analytics window for medium-term portfolio trends. |
| OLAP | Reporting Daily Analytics | Daily Analytics | TRUE | Read-only | 13 | Curated, read-only daily snapshot feed for governed downstream reporting. |
| OLAP | Reporting Loans | Loans | TRUE | Read-only | 30 | Curated, read-only loan feed containing contract, balance, rate, age, and default fields. |
| OLAP | Reporting Repayments | Repayments | TRUE | Read-only | 8 | Curated, read-only posted-payment feed with loan and charge references. |
| OLAP | Reporting Statistics | Statistics | TRUE | Read-only | 17 | Curated, read-only KPI feed for governed dashboard totals. |

*Exact slice-column membership and order are maintained only in the workbook's Slice Columns sheet.*

## 6. Financial-model assumptions and shared-VC baseline

Shared VC formulas were aligned to the OLTP baseline beginning in OLAP version 1.000149. Version 1.000151 completed the required dependency chain and restored a runnable OLAP definition. Interpret the monthly forecast using the following assumptions:

- Projected Monthly Profit equals Realized Profit MTD plus Today's Outstanding Interest plus Forecast Remaining Interest.
- Realized Profit MTD is based on Repayments[Interest Paid] whose Payment Date falls in the current calendar month. Under the current classification, first-day transfer fees recorded through Charge interest and negative default adjustments recorded through Interest Paid flow into this amount.
- Today's Outstanding Interest is not limited to today or the current month. It sums Charges[Interest Remaining] across all open Charges and may therefore include arrears originating before the current month.
- Expected Interest This Month includes accrued but uncharged interest since the latest Charge plus interest for days after today through month-end in both apps.
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
| Loans / Loan Duration | Uses Close Date, floors elapsed 24-hour periods, and adds one inclusive day |
| Statistics / Net Principal Days MTD | Hidden helper VC (`Show? = FALSE`) |
| Statistics / Forecast Remaining Principal Days | Hidden helper VC (`Show? = FALSE`) |
| Statistics / Forecast Average Daily Outstanding Principal | Hidden helper VC (`Show? = FALSE`) |
| Statistics / Profit Coverage of Outstanding Principal | Uses the OLTP zero guard before division |
| Statistics / Borrowers Fully Paid Today | Shown only when the corresponding count is positive; included in search |
| Statistics / Borrowers Partially Paid Today | Shown only when the corresponding count is positive; included in search |
| Statistics / Borrowers with Overdue Payment | Shown only when the corresponding count is positive; included in search |
| Statistics / Borrowers Not Paid Today | Shown only when the corresponding count is positive; included in search |

The exact formulas and configuration notes are maintained in the workbook's Columns sheet. The initial comparison considered only the 78 VCs that already existed in both apps and therefore missed the three-column dependency chain. The repaired comparison includes all 81 VCs now shared by both apps.

> **Validation status**  All 81 shared VCs match across the compared live settings after save. AppSheet reports no issues and the embedded OLAP Analytics preview loads. Business outcomes, scheduled-bot timing, and representative financial scenarios remain subject to runtime testing.

## 7. Known implications and follow-up checks

| **Area** | **Implication** |
| --- | --- |
| OLTP/OLAP variance | Shared physical tables have materially different VC layers. Changes to a shared field must be reviewed in both app dictionaries even when only one app appears to use it. |
| Reporting ownership | OLAP-only VCs and Reporting * slices are the preferred governed feed surface. Do not move their heavy aggregation into OLTP without a performance assessment. |
| Calendar source | Calendar is not in Money database. Its key/date population and refresh behavior depend on Calendar Help Table / Sheet1 and must be checked separately. |
| Slice comments | All inspected slice descriptive-comment fields were blank. This document supplies purposes, but future changes should also populate AppSheet descriptive comments where practical. |
| Retired slice | `Payment Collection` was present in the prior documentation but not in the live OLTP app at reconciliation. Reintroducing it would be a model change requiring both documents and a Markdown change log update. |
| Shared-VC alignment | OLTP is the governing baseline for VCs used by both apps. Future shared-VC changes must be reviewed in OLAP and documented in the same revision. |
| Dependency closure | Before copying a formula between apps, recursively confirm that every referenced physical column, VC, reverse-reference column, and table exists in the target app. A shared-name comparison alone is insufficient. |
| Dashboard reconciliation | Reporting slice totals should be reconciled to their governed base grains and refresh cutoff before Looker Studio changes are accepted. |

### 7.1 Manual validation checklist

**Schema:** Confirm the Money database still reports 10 tables, the external Calendar helper remains available, and each physical field matches the detailed dictionary.

**Relationships:** Open every listed Ref Type Details panel and confirm source table plus Is a part of? state.

**App variance:** Confirm the OLTP and OLAP column counts shown at each table heading match this document.

**Slices:** Confirm row filters, included-column order, and update mode for all 12 slices.

**Permissions:** Verify reporting slices remain read-only and operational update access matches intended roles.

**Financial logic:** Sample posted, partial, fully paid, overdue, reversed/adjusted, and defaulted scenarios against the documented VC dependencies.

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
