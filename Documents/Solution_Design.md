# Solution design rules

Read the affected section when designing or changing app workflows, the model or reporting. [AGENTS.md](../AGENTS.md) contains standing execution rules. This document describes ownership and design constraints, not live versions; use the environment inventory and affected model records for actual configuration.

## Scope

**Reporting computation rule, owner revision 22 September 2026:** reusable heavy reporting joins, financial aggregates and running calculations belong in governed PostgreSQL views/functions. Metabase models should provide thin source/field metadata, with visuals limited to selection, filters, simple aggregation/arithmetic and presentation. SQL authored in Metabase also executes in PostgreSQL, so moving it to an ordinary view improves ownership/reuse but does not by itself reduce database computation. Use measured query costs to justify any later materialization and its refresh policy. R016's eight Income Statement source models now follow this rule through V34/V35 reporting views; the earlier ten models remain SQL-backed pending any separately scoped refinement.

Prototype boundaries and execution rules are defined in [AGENTS](../AGENTS.md#3-essential-implementation-rules). This file owns application responsibility and reporting design decisions.

## OLTP Operations app

Name: **Loan Manager ผู้จัดการสินเชื่อ**. Owns day-to-day operational workflows and transaction entry: reliable forms/navigation, clear status/ownership, entry validation, safe actions/approvals/automation, and relevant offline/sync behavior. Use the fewest calculations needed for operational work.

Small operational totals, alerts and record indicators are acceptable. Broad historical aggregation and management reporting belong in OLAP. Keep validation at the point of entry without duplicating expensive analytics.

**R010 production:** the Cash Statement is a bounded operational exception: OLTP loads 15 Bangkok dates of SQL-calculated account statements and daily summaries, with a private per-Partner account/date preference. SQL computes balances before applying the recent window; full historical review and cash administration stay in OLAP. This adds no financial editing workflow. See [model overview](AppSheet_Data_Model_Overview.md#current-r010-behavior).

## OLAP Reporting app

Name: **Loan Business Insights**. Owns historical/cross-entity analytics, management and partner reporting, partner management/allocation/settlement, loan assessment, portfolio analysis, reporting review and curated downstream feeds.

Prefer read-only or tightly controlled interactions. Do not duplicate operational editing for convenience, or let heavy expressions degrade OLTP sync/form performance. Shared-table design must identify the workflow owner and reconcile affected consumers in both apps.

## Model ownership

Business behavior and relationships are explained in the [Model Overview](AppSheet_Data_Model_Overview.md); exact values belong in the dictionary. Integrity, auditability and correction rules follow AGENTS.

## Looker Studio dashboard

Name: **Loan Reports - Mobile**. Presentation/exploration over governed metrics, not an alternate transaction system or the sole location for critical business rules. Each metric needs a documented source, grain, date basis, filter population and refresh cutoff; totals must reconcile with the governed source.

Preserve the page order unless the owner requests a change:

1. Overview
2. Cash Analysis
3. Borrowers Analysis
4. Business Performance
5. Portfolio / Risk
6. Daily Collection Tracking
7. Borrower Insight
8. Profit Forecast & Partner Outlook
9. Income Statement (Metabase addition)

App workflows take priority. Review direct downstream impacts, but test/edit reports only when explicitly in scope or directly affected; record limitations rather than auditing unrelated reports. Back up the affected report before editing, including when a task also changes AppSheet.

## Metabase migration

R016 implements the eight source pages plus an Income Statement for owner review. Metabase reads restricted PROD OLAP views, stored Daily Analytics and the existing partner/Loan Form Context sources through eighteen reusable models: Borrowers, Loan Book, Repayment Ledger, Borrower Performance, Portfolio Overview, Daily Performance, Charge History, Partner Outlook, Collection Worklist, Collection Status Summary, Business Expenses, Cash Account Positions, Monthly Income, Income Statement, Settlement Ledger, Daily Income Ledger, Cash Accounts by Date and Cash Position by Date. Database keys join Borrowers → Loans → Repayments once in that model layer. Borrower Performance aggregates loan and repayment amounts independently before combining them, preventing fan-out. Shared reporting windows, labels, signed amounts, rankings and portfolio calculations belong in these models; 103 dashboard questions select, summarize, filter and format model fields. Three borrower scenario questions use one shared parameterized snippet referencing Borrowers; no joins or scenario formulas are duplicated in those visuals. Fourteen Income Statement questions reuse one date-parameterized snippet over Daily Income Ledger and the existing FIFO function. This month is the default; selected-period income/expenses/draws and category detail follow the slicer. Cash custody and the pool are reconstructed at the selected period end, with pre-opening balances unavailable. Average daily profit uses selected calendar days, including zero-activity dates; the cash bridge separates earlier retained profit, advances and reconciliation differences. Declare Metabase primary/foreign-key metadata against the corresponding database columns for reusable exploration. No operational editing belongs in Metabase.

The [page metric contract](../outputs/r016-20260922/README.md) records source/date behavior, including legacy gross-interest profit, the source's skipped comparison day and fixed chart references. Preserve those during the copy and identify them for owner review instead of silently substituting newer net-profit metrics. Saved questions and layout definitions live beside the database project; the encrypted Metabase application database remains the authority for users, permissions and live dashboard state. Its private backups are separate from Git publication.

## Business and ecosystem diagrams

- [OLTP lifecycle diagram](OLTP_Business_Processes.drawio): three editable pages cover loan lifecycle, payment processing and controls/ownership. Update only depicted behavior, not version numbers, formula refinements or presentation-only changes. Its synthesis baseline is 12 September; current business explanations/verified release evidence take precedence. It does not claim fresh lifecycle or delivery acceptance.
- [Ecosystem diagram](Loan_Business_Ecosystem.drawio): the app/database pair, partner assistant services, access/recovery and public-site context. As confirmed on 16 September, Azure hosts the partner worker; Tailscale provides private RDP; Outlook fallback and Looker are in use. Borrower-location sheets are a historical import, not a live feed. The privacy site is published; custom-domain mapping is not inferred. AI Collection was excluded from this drawing by owner request; this does not alter that separate project's authority. Dormant facilities are not active release dependencies.

Generation/asset instructions are in [scripts guide](../scripts/README.md#diagram-maintenance). Original provenance and interpretation are preserved in the archive: [OLTP](archive/2026-09-20/OLTP_Business_Processes.md), [ecosystem](archive/2026-09-20/Loan_Business_Ecosystem.md). These archived companions are no longer maintained in parallel.


### R016 Cashflow Statement — current extension, 23 September 2026

Cashflow Statement page 10 is deployed for owner review. DEV and PROD are V36; two additive reporting views and SELECT-only grants are verified. Seven visuals use two shared models and one date/account snippet. All 13 PROD reconciliations and 72 live dashboard checks pass. Previous nine pages and partner permissions are preserved; no AppSheet or financial-data changes. The tenth page follows key figures → period/availability → opening balance → chronological ledger → closing balance. Date and account selectors apply throughout. PostgreSQL owns running balances and account relationships through V36; thin Metabase models expose the results. Internal transfers have zero consolidated inflow/outflow but remain visible with their transaction amount. Individual account statements include their own transfer side. Signed net custody includes negative accounts and differs from positive-only Business Cash Held. Unknown pre-opening balances stay unavailable. All accounts historical coverage begins 18 September 2026. Ten database-owned reporting views (V34–V36), 20 models and three snippets centralize this reporting scope. Existing Income Statement owner layout is preserved.
