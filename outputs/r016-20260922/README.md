# R016 — Overview and Cash review

[Open the dashboard](https://reports.mw-credit.com/dashboard/3). Two tabs contain 26 visuals backed by 22 saved questions in collection 5. The borrower POC remains at dashboard 2. This is the first review batch; later source pages and full migration acceptance remain pending.

## Source and metric contract

Source: Workspace Data Studio report `52954065-a261-4b97-8d19-df84126bbdc6`, pages `p_80zev5uo6d` and `p_1w9y6sjk6d`. Read [question definitions](questions.json) for the exact SQL, description, visual settings and date-field bindings. [Dashboard inventory](dashboard-verification.json) maps stable question keys to saved IDs and tabs.

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
| Cash: principal by loan type | Current loan outstanding principal, grouped by existing type with Thai/English labels. |
| Cash: daily principal; issued versus returned | Daily snapshots; issued positive and returned negative, as in the source. Zero bars have no labels. |

Overview shows all-time/current metrics with each question's intrinsic date rule. The Cash date control binds portfolio visuals to **Peak Cash Pool Date 30D**, loan type to **Loan Date**, and daily charts to **Snapshot Date**, preserving the source's unusual mixed semantics. It is not a historical as-of balance control. All dates are selected by default. Source cache timing and ongoing PROD activity can cause transient differences; no totals are hardcoded.

## Verification and review limits

- [SQL reconciliation](query-reconciliation.json): every value in all 22 questions and nine filtered Cash cases matches direct SQL using the restricted reporting login.
- [Relationship checks](relationship-verification.json): required keys are unique and loan/borrower and repayment/loan references resolve; snapshot dates are unique.
- [Backup proof](backup-verification.json): PROD recovery established before column-grant changes. [Infrastructure evidence](infrastructure-verification.json) records application restore, region and resource caps.
- Partner desktop and 390 px responsive browser checks are recorded in the change log. The owner previously accepted the POC on a physical PC and phone; that is distinct from accepting these new pages. Lisa's personal Google sign-in remains unconfirmed.

Review the copied gross-profit definitions, skipped comparison day, fixed principal reference and Cash date semantics before changing them. These are preserved source behaviors, not newly approved business rules.

## Runtime and recovery

Railway Hobby: one Metabase/proxy replica capped at 2 GB / 2 vCPU; Java heap 768 MB, six query threads, 25 Jetty threads, three warehouse connections. One PostgreSQL 16.15 application replica capped at 0.5 GB / 1 vCPU. Both use Singapore `asia-southeast1-eqsg3a`, alongside the existing Singapore Cloud SQL source. Memory caps are ceilings, not pre-purchased RAM. Initial loaded operation used about 1.3 GB active Metabase memory plus reclaimable file cache; the short measurement is not a monthly forecast. Budget roughly US$20–25/month initially and reassess actual Railway usage. Hobby includes US$5 of usage; [official rates](https://docs.railway.com/pricing/plans) bill actual consumption above it.

Automatic volume migration failed. A fresh Singapore volume was initialized and the small application configuration dump restored: 67 pre-gauge questions, three dashboards and one retained migration key. The subsequent gauge adds one question. Private backups, encryption key and credentials remain under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project`; none are in Git. Restoring the application dump requires the existing encryption key and current database password. Loan data stays in Cloud SQL and was not copied into Railway as part of this rebuild.

To undo the page batch, archive dashboard 3 and its R016 questions, preserving the accepted POC. Revoke only R016's added column grants after dependent questions are removed; `grants-before.csv` records the earlier ACL. Container rollback must retain current secrets. No AppSheet rollback or Flyway migration is involved. Keep the migration API key until all pages are complete, then revoke it per owner instruction.

## Maintained tooling

`Build-ReportingPages.ps1` emits sanitized SQL/visual definitions. `Install-ReportingPages.ps1` creates missing objects, preserving existing layout; `-UpdateExisting` explicitly reapplies the owned definitions and replaces the Cash scalar with the gauge. `Verify-ReportingPages.ps1` compares result sets without publishing private values. Inputs are the existing private credential files. The repository is not yet connected for Railway auto-deploy; the owner asked for advice, and keeping this reporting code with the loan project was recommended.
