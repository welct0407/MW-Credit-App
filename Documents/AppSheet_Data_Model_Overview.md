**GOVERNED MODEL REFERENCE**

# **AppSheet Data Model Overview**

*Money database  |  Loan Manager ผู้จัดการสินเชื่อ  |  Loan Business Insights*

*Descriptive companion to [AppSheet_Data_Dictionary.xlsx](./AppSheet_Data_Dictionary.xlsx)*

| **Control** | **Value** |
| --- | --- |
| Document role | Architecture, governance, purposes, assumptions, and review guidance |
| Technical inventory | AppSheet_Data_Dictionary.xlsx |
| Source baseline | AppSheet_Data_Model_Reference.docx - configuration dated 2026-08-29 |
| Conversion date | 30 August 2026 (Asia/Singapore) |
| Reconciliation status | Pending user reconciliation with live AppSheet configuration |
| Maintenance model | Excel is authoritative for row-level technical inventory; Markdown explains context and governance |

> **Conversion boundary**  This split reproduces the existing Word baseline. It does not assert that the baseline still matches the live AppSheet database or either app as of the conversion date.

## 1. Purpose, authority, and maintenance

This overview explains how the shared database, the OLTP Operations app, and the OLAP Reporting app fit together. Detailed tables, columns, expressions, application variances, slices, and slice-column membership are maintained in the companion Excel workbook.

### 1.1 Authority and status

**System authority:** The AppSheet database and live app editors remain authoritative.

**Conversion authority:** The content in this pair was converted from the existing Word baseline only.

**Reconciliation status:** Pending user reconciliation; no AppSheet setup was opened or compared during this conversion.

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
| Loans | Money database | OLTP + OLAP | 19 | 19 | 25 | Loan contracts, commercial terms, lifecycle state, balances, and loan-level risk metrics. |
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
| OLTP | Payment Collection | Charges | OR(  [Payment Status] = "รอชำระ",  [Payment Status] = "ชำระบางส่วน",  AND(    [Payment Status] = "ชำระแล้ว",    [Payment Date] = TODAY()  )) | Updates, Adds, Deletes | 22 | Operational charge queue containing pending or partially paid items plus items completed today. |
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

## 6. Financial-model assumptions retained from the baseline

The following notes are carried forward verbatim in substance from the existing Word baseline. They have not been re-tested during this conversion.

The existing KPI names are retained. Interpret the monthly forecast using the following assumptions:

- Projected Monthly Profit equals Realized Profit MTD plus Today's Outstanding Interest plus Forecast Remaining Interest.
- Realized Profit MTD is based on Repayments[Interest Paid] whose Payment Date falls in the current calendar month. Under the current classification, first-day transfer fees recorded through Charge interest and negative default adjustments recorded through Interest Paid flow into this amount.
- Today's Outstanding Interest is not limited to today or the current month. It sums Charges[Interest Remaining] across all open Charges and may therefore include arrears originating before the current month.
- For daily-interest loans, Forecast Remaining Interest includes accrued but uncharged interest since the latest Charge plus interest for days after today through month-end. When a Charge is generated or paid, the amount should move between uncharged accrual, Charge interest remaining, and realized interest without intentional double counting.
- The projection assumes all outstanding interest is collectible; it does not apply delinquency, default-probability, or collection-probability weighting.
- Daily-interest accuracy assumes Current Daily Interest is maintained in accordance with the loan contract, including after any principal change; the payment workflow does not automatically recalculate that stored value.
- For fixed-term loans, interest due later in the current month remains forecast until the due date, when the 00:05 bot is expected to create the Charge. A delayed or failed due-date bot can temporarily omit that fixed interest from both forecast and outstanding Charge interest.

> **Validation status**  Treat these assumptions as pending confirmation until the user reconciles the converted reference with the current AppSheet formulas, bots, and business rules.

## 7. Known implications and follow-up checks

| **Area** | **Implication** |
| --- | --- |
| OLTP/OLAP variance | Shared physical tables have materially different VC layers. Changes to a shared field must be reviewed in both app dictionaries even when only one app appears to use it. |
| Reporting ownership | OLAP-only VCs and Reporting * slices are the preferred governed feed surface. Do not move their heavy aggregation into OLTP without a performance assessment. |
| Calendar source | Calendar is not in Money database. Its key/date population and refresh behavior depend on Calendar Help Table / Sheet1 and must be checked separately. |
| Slice comments | All inspected slice descriptive-comment fields were blank. This document supplies purposes, but future changes should also populate AppSheet descriptive comments where practical. |
| Delete permissions | OLTP Payment Collection currently permits updates, adds, and deletes. Any production correction to financial rows should remain auditable and avoid routine physical deletion. |
| Dashboard reconciliation | Reporting slice totals should be reconciled to their governed base grains and refresh cutoff before Looker Studio changes are accepted. |

### 7.1 Manual validation checklist

**Schema:** Confirm the Money database still reports 10 tables and that each physical field matches the detailed dictionary.

**Relationships:** Open every listed Ref Type Details panel and confirm source table plus Is a part of? state.

**App variance:** Confirm the OLTP and OLAP column counts shown at each table heading match this document.

**Slices:** Confirm row filters, included-column order, and update mode for all 13 slices.

**Permissions:** Verify reporting slices remain read-only and operational update access matches intended roles.

**Financial logic:** Sample posted, partial, fully paid, overdue, reversed/adjusted, and defaulted scenarios against the documented VC dependencies.

**Reconciliation:** Reconcile OLAP Reporting slice totals to Money database at a defined as-of time before dashboard use.

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

> **Next action**  Reconcile the workbook against the live AppSheet database and app editors, then record the reconciliation result in the relevant Markdown change log.

