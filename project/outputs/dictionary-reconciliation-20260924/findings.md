# Reconciliation findings — 24 September 2026

## Settings needing interpretation

**Locale:** all 18 OLTP plus 19 OLAP PROD business-table Locale controls were blank; every corresponding DEV control was explicit `en-US`. AppDoc represents the PROD omission differently from the populated DEV property. Exact representations are retained. Blank does not establish the effective inherited locale. Intent is unresolved; no live change was made. See table editor fields and DEV overlays in [coverage](coverage.json).

**Disabled export template:** both OLAP apps reference Drive file `1g4xHHsTVvRR5ek4u3DslZAb_UerH05E5`, `Loan_Daily_Analysis_Template.xlsx`, modified 31 August 2026. `Manifest!C2:E2` contains literal `Asia/Singapore`, `Loan Business Insights`, and the PROD OLAP UUID. A future DEV export could label itself as PROD. The timezone label is not proof of execution timezone. `Daily Loan Analysis Export` is disabled in both apps. All 119 checked literal references resolve per app. No export was generated or template edited. See [cells](export-template-observations.json) and [checks](template-validation.json).

**Access:** all four apps require Google sign-in and do not allow all signed-in users. DEV apps show the owner only. Each PROD app additionally shows one personal-account user with Use app/User/Default access. The personal identity is private/redacted; this audit neither approves nor changes access. Owner access is Admin/Latest. Blank source-account username inputs do not establish an empty underlying connection user.

## Environment differences

App UUID/internal name, version, default folder, theme/color, database aliases and companion-app navigation differ by environment. Account settings independently confirm `database-2` → `loan_manager_prod` and `database-3` → `loan_manager_dev`, on the shared inventoried host with Require SSL selected. No Test/Authorize/Save operation was invoked.

PROD themes are White/#d81b60/Color (OLTP) and White/#0abab5/Color (OLAP). DEV uses White/#e8710a/Color and White/#1e88e5/Color. View control values/choices and named reusable task fields match between environments (73 OLTP and 67 OLAP comparisons). Supporting UI text or embedded links can differ; these are retained without calling them behavior changes.

Both databases validated through V39. PROD-only `pg_cron` accounts for its additional namespace, two relations, two sequences, seven routines and captured database job. ACLs, role/default privileges, column ordinals and internal integrity-trigger identifiers differ and remain observed differences, not automatically approved security policies. Six common routine bodies differ only in CR line endings: `agent_audit.begin_operation`, `capture_change`, `reject_rewrite`, and `public.analytics_history_start`, `analytics_refresh_request`, `refresh_daily_analytics`. Stored bodies were not normalized. See [semantic review](semantic-review.json).

All four apps have server caching, delta sync, quick sync and delayed sync off; sync on start and automatic updates on. These are settings, not performance measurements. Canonical-app guard expressions and placement before scheduled business steps are retained; definitions do not prove runtime guard execution. Actor and delivery-address expressions are preserved; Partner delivery rows were not read and no notification was sent.

## Workflow and dependency review

OLTP remains the operational entry/workflow owner. PostgreSQL owns posting, integrity and heavy calculations. OLAP binds reporting/analytics views and owns analytics/assessment/export surfaces. No business rule is invented by this dictionary refresh.

Captured definitions establish these source-text paths:

- Quick-payment requests lead to `quick_payment_request` and Payments. Posting follows `process_lump_sum` → `post_payment`, with `payment_charge_balances` and `close_payment_loans`. Full bodies retain allocation/repayment writes and status handling.
- Charge generation follows `charge_generation_request` → `generate_loan_charge`; first-day generation follows `first_day_loan_trigger` → `create_first_day_charge`.
- Analytics requests follow `analytics_refresh_request` → `refresh_daily_analytics`, using `olap_reporting_date`. Snapshot tables retain their grain, keys and exact definitions.
- Cash-source changes follow `cash_source_changed` → `sync_cash_ledger`. Settlement validation/reversal and reporting functions remain separate definitions.
- Assessments use `assessment_lab.calculate_row` with `assessment_lab.inputs` and `assessment_lab.forecast`. OLAP `Loan Assessment` binds `public."Loan Assessment SQL Lab View"`. The namespace contains five routines, not an empty placeholder.

[Semantic review](semantic-review.json) records specifically checked symbol edges; [dependency validation](dependency-validation.json) checks every captured user-trigger routine link and view relation/column edge. Neither executes SQL or proves every procedural branch.

The retained `Payments.Payment - Process Receipt` grouped action has five ordered members: Create Snapshots, Freeze Plan, Post Plan, Reconcile, Close Paid Loans. Its condition is `=FALSE` and its legacy bot is disabled. It must not be mistaken for the current primary posting path. The other disabled OLTP bot, Create First-Day Charge, is also retained. All grouped/reference actions and assigned-column identities resolve.

## Historical and scope decisions

Imports remain dated evidence; current definitions take precedence only within verified target/scope. R016 reporting routine declarations retain their content with historical scope and links to current signatures. Imported DEV Borrowers/Business Expenses labels retain source content and point to current canonical relations/DEV overlays.

No captured identity/value mismatch remains. Locale intent/inheritance is an interpretation gap; private identities/signatures are property exclusions. Runtime/delivery/financial tests and unrelated Metabase/Grafana/Looker/AI Collection inventories were excluded by the execution plan, not silently marked passing. No live fixes, deployments or financial writes were attempted.
