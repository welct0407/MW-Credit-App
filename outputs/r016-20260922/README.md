# R016 — Overview and Cash review

[Open the dashboard](https://reports.mw-credit.com/dashboard/3). The revised Overview and Cash tabs contain 26 business visuals backed by 22 query-builder questions and six reusable models. Compact grouped metrics, teal capital charts, purple interest charts and muted coral overdue charts replace the initial oversized cards. Section headings and phone-readable notes organize the information. The borrower POC remains at dashboard 2. Later source pages and full migration acceptance remain pending.

## Shared reporting models

[Reporting Models](https://reports.mw-credit.com/collection/8) is inside the partner-only Loan Reports collection. PostgreSQL remains the owner of financial posting and source balances. Metabase's reusable SQL models centralize reporting joins, time windows, labels, signed values and rankings; individual visual questions contain no SQL, joins or business expressions.

| Model / ID | Grain and reusable responsibility |
| --- | --- |
| Borrowers / 69 | One Borrower ID, including hidden borrowers; common borrower identity and measures. |
| Loan Book / 70 | One Loan ID; borrower join and readable loan types. |
| Repayment Ledger / 71 | One Repayment ID; loan/borrower relationships and Bangkok 30-day / seven-day windows. |
| Borrower Performance / 72 | One visible borrower display name, preserving source grouping; separately aggregate loan and repayment totals before joining, then rank top four plus Others. Do not use display names as transactional keys. |
| Portfolio Overview / 73 | One current portfolio row; available cash, utilization, gross-interest KPIs and top borrower. |
| Daily Performance / 74 | One stored snapshot per Date; signed flow amounts and overdue date exclusion. |

Metabase maps the corresponding database columns and declares Loans.Ref Borrowers → Borrowers.Row ID and Repayments.Ref Loans → Loans.Row ID as foreign keys. These are semantic metadata settings over the existing views, not new PostgreSQL constraints. Exact columns/IDs are in [models.json](models.json), the dictionary's **Metabase Models** sheet, and maintained [model SQL](../../scripts/metabase/models). Current visuals are defined by [model-questions.json](model-questions.json). Extend the owning model when future pages need reusable logic; do not copy joins into a visual.

## Source and metric contract

Source: Workspace Data Studio report `52954065-a261-4b97-8d19-df84126bbdc6`, pages `p_80zev5uo6d` and `p_1w9y6sjk6d`. [Original question SQL](questions.json) is retained solely as the independent source-parity oracle. [Dashboard inventory](dashboard-verification.json) maps stable question keys to saved IDs and tabs.

| Page / visuals | Governed source and behavior |
| --- | --- |
| Overview: cash pool, principal, available cash, utilization, expected daily interest, MTD profit, projected monthly profit, active loans | Existing `olap_portfolio_summary`; available cash = pool − principal; utilization = principal / pool. Profit retains the original gross-interest meaning. |
| Overview: 7-day growth | Repayment interest, Bangkok days 0–6 versus 8–14. The source skips day 7; preserved explicitly for review. Zero prior period returns no value. |
| Overview: profit in past 30 days; interest paid | Repayment interest during Bangkok dates today−29 through today, and all-time, respectively. |
| Overview: top borrower | Borrower Description with largest current outstanding principal, excluding hidden borrowers. |
| Overview: two borrower horizontal bars | Borrowers → Loans using Row ID / Ref Borrowers; repayment interest aggregated per loan before Loans → Borrowers join. Four named borrowers plus Others. No charge fan-out. |
| Overview: daily principal, profit and overdue area charts | Stored Daily Analytics snapshots by Snapshot Date. Overdue uses Pending Charges EOD and excludes today. Original fixed references of THB 120,000 principal and THB 10,000 daily profit are preserved. Axis ranges adapt so points remain visible. |
| Cash: pool, principal, available cash, loan account balance; utilization gauge | Existing portfolio summary. Gauge scale 0–100%, boundaries 60%, 85%, 95%. |
| Cash: balance composition | Horizontal 100% stacked bar: available cash plus unsettled gross profit. |
| Cash: principal by loan type | Current loan outstanding principal, grouped by short English labels for phone readability; the Thai source type remains available in Loan Book. |
| Cash: daily principal; issued versus returned | Daily snapshots; issued positive and returned negative, as in the source. Zero bars have no labels. |

Overview shows all-time/current metrics with each question's intrinsic date rule. The Cash date control binds portfolio visuals to **Peak Cash Pool Date 30D**, loan type to **Loan Date**, and daily charts to **Snapshot Date**, preserving the source's unusual mixed semantics. It is not a historical as-of balance control. All dates are selected by default. Source cache timing and ongoing PROD activity can cause transient differences; no totals are hardcoded.

## Verification and review limits

- [SQL reconciliation](query-reconciliation.json): every value in all 22 questions and nine filtered Cash cases matches direct SQL using the restricted reporting login.
- [Model verification](model-verification.json): all six grains are unique/non-null; every question reads its owning model, with zero visual SQL/joins/business expressions; FK metadata and partner-only permissions pass. Filter checks run through the dashboard endpoint and saved mappings.
- [Relationship checks](relationship-verification.json): required keys are unique and loan/borrower and repayment/loan references resolve; snapshot dates are unique.
- [Backup proof](backup-verification.json): PROD recovery established before column-grant changes. [Infrastructure evidence](infrastructure-verification.json) records application restore, region and resource caps.
- Partner desktop and 390 px responsive browser checks are recorded in the change log. The owner previously accepted the POC on a physical PC and phone; that is distinct from accepting these new pages. Lisa's personal Google sign-in remains unconfirmed.

Review the copied gross-profit definitions, skipped comparison day, fixed principal reference and Cash date semantics before changing them. These are preserved source behaviors, not newly approved business rules.

## Runtime and recovery

Railway Hobby: one Metabase/proxy replica capped at 2 GB / 2 vCPU; Java heap 768 MB, six query threads, 25 Jetty threads, three warehouse connections. One PostgreSQL 16.15 application replica capped at 0.5 GB / 1 vCPU. Both use Singapore `asia-southeast1-eqsg3a`, alongside the existing Singapore Cloud SQL source. Memory caps are ceilings, not pre-purchased RAM. Initial loaded operation used about 1.3 GB active Metabase memory plus reclaimable file cache; the short measurement is not a monthly forecast. Budget roughly US$20–25/month initially and reassess actual Railway usage. Hobby includes US$5 of usage; [official rates](https://docs.railway.com/pricing/plans) bill actual consumption above it.

Automatic volume migration failed. A fresh Singapore volume was initialized and the small application configuration dump restored: 67 pre-gauge questions, three dashboards and one retained migration key. The subsequent gauge adds one question. Private backups, encryption key and credentials remain under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project`; none are in Git. Restoring the application dump requires the existing encryption key and current database password. Loan data stays in Cloud SQL and was not copied into Railway as part of this rebuild.

To undo the page batch, archive dashboard 3 and its R016 questions, preserving the accepted POC. Revoke only R016's added column grants after dependent questions are removed; `grants-before.csv` records the earlier ACL. Container rollback must retain current secrets. No AppSheet rollback or Flyway migration is involved. Keep the migration API key until all pages are complete, then revoke it per owner instruction.

Before this refinement, exact dashboard, 22 card definitions, source metadata and collection permissions were exported privately to `r016-20260922/models-redesign-before/`, alongside the original dictionary. Restore those saved definitions and affected field metadata to undo only this refinement, then archive models 69–74 and collection 8 after no question depends on them. No reporting grant or infrastructure changes were needed. The retained key's display name is now **Report development** to keep report history readable; its credential, permissions and agreed revocation point are unchanged.

## Maintained tooling

`Install-ReportingModels.ps1` installs shared model SQL and metadata. `Build-ModelPages.mjs` generates model-backed visual definitions, and `Install-ModelPages.mjs` applies the questions/layout. The compatibility `Install-ReportingPages.ps1` delegates to those two scripts. `Verify-ReportingModels.mjs` checks reusable sources, grains and relationships; `Verify-ReportingPages.ps1` compares results to the retained source SQL without publishing private values. See the [maintained runbook](../../scripts/metabase/README.md). The repository is not yet connected for Railway auto-deploy; the owner asked for advice, and keeping reporting code with the loan project was recommended.
