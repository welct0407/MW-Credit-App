# R016 — Eight-page Loan Reports review

[Open the dashboard](https://reports.mw-credit.com/dashboard/3). All eight tabs are implemented for review: 109 business visual placements from 105 questions, ten reusable models and one shared scenario snippet. Pages 1–2 retain their accepted layouts and metric definitions. The borrower POC remains at dashboard 2. Full migration acceptance remains pending.

## Shared reporting models

[Reporting Models](https://reports.mw-credit.com/collection/8) is inside the partner-only Loan Reports collection. PostgreSQL remains the owner of financial posting and source balances. Metabase's reusable SQL models centralize reporting joins, time windows, labels, signed values and rankings; 102 visual questions contain no SQL, joins or business expressions. Three proposed-loan visuals reference one shared parameterized snippet, because model definitions cannot contain input variables.

| Model / ID | Grain and reusable responsibility |
| --- | --- |
| Borrowers / 69 | One Borrower ID, including hidden borrowers; common borrower identity and measures. |
| Loan Book / 70 | One Loan ID; borrower join and readable loan types. |
| Repayment Ledger / 71 | One Repayment ID; loan/borrower relationships and Bangkok 30-day / seven-day windows. |
| Borrower Performance / 72 | One visible borrower display name, preserving source grouping; separately aggregate loan and repayment totals before joining, then rank top four plus Others. Do not use display names as transactional keys. |
| Portfolio Overview / 73 | One current portfolio row; available cash, utilization, gross-interest KPIs and top borrower. |
| Daily Performance / 74 | One stored snapshot per Date; signed flow amounts and overdue date exclusion. |
| Charge History / 75 | One Charge ID; loan/borrower joins, historical payment timing and past-due remaining amounts. |
| Partner Outlook / 76 | One role A/B Partner ID; current shares from the existing Loan Form Context view. |
| Collection Worklist / 77 | One borrower with a current collection status; posted receipts aggregated before joining. |
| Collection Status Summary / 162 | Four governed statuses, including zero counts/amounts for empty statuses. |

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
- [Model verification](model-verification.json): the original six grains are unique/non-null; every question reads its owning model, with zero visual SQL/joins/business expressions; FK metadata and partner-only permissions pass. Filter checks run through the dashboard endpoint and saved mappings.
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

## Remaining pages implemented on 22 September

Inspection used recovery report `e599bb99-b9fe-417f-8708-a0d49220b15d`, preserving the original report. Several legacy blends/data sources in that copy were already blank or errored. The migration uses existing governed fields and clearly named measures, rather than claiming numerical parity with broken visuals.

| Page / source page ID | Implemented information |
| --- | --- |
| 3 Borrowers / `gre6F` | 16 visuals: four KPIs, principal/30-day interest shares and rankings, return/coverage, lifetime interest, loan counts, daily contribution, value/stability bubbles, capital/profit scatter and score-component detail. Return uses 30D Return on Average Principal; coverage uses Return on Active Principal, as in the source. |
| 4 Performance / `p_9cb4yu8p6d` | 14 visuals: four KPIs, daily/cumulative gross interest, issued principal/counts, capital yield, interest by loan type, weekly average loan size, 30-day active-loan/borrower trends and daily period detail. Yield divides interest by closing principal plus principal returned, with zero for a nonpositive denominator. |
| 5 Risks / `p_4qw5e58q6d` | 11 visuals: balances, lifetime interest, top-three concentration, past-due charges, borrower concentration, status, active loan age counts/principal, risk bubbles excluding largest exposure, default losses and borrower risk detail. |
| 6 Daily Collection / `p_ja4vkalv6d` | 20 visuals: eight headline counts/amounts, then borrower count, amount and worklist for each of Fully Paid, Partially Paid, Not Paid and Overdue. Grouping uses governed borrower status to avoid blended row multiplication. Posted receipts today may settle older charges and remain distinct from due/collected/remaining measures. |
| 7 Borrower Insight / `p_b41wmvnx6d` | 11 visuals plus the history limitation: four borrower KPIs, current/proposed exposure and shares, monthly timing, loan history, credit-history inputs and risk detail. One selector passes an immutable Borrower ID to all relevant questions. Source timing remains Historical Late true = Late, otherwise On time. No credit decision or loan write is performed. |
| 8 Forecast & Partners / `p_aidfjya16d` | 11 visuals: four forecast KPIs, realized/remaining comparison, loan-type expected interest, borrower daily/monthly interest shares, current partner shares, forecast detail and interest history. Loan expected-interest totals are not a reconciliation of the differently defined portfolio forecast. |

Current borrower/risk/collection pages show current measures without the source's incidental Last Late Payment Date filter. Performance filters use payment, loan or snapshot date. Weekly averages group Monday-start weeks; cumulative interest includes earlier stored dates when the displayed date range is shortened. Forecast measures are current-month values. Cash retains its earlier source date behavior.

Metabase models cannot accept SQL input variables, so the three scenario charts reference one **Borrower loan scenario** snippet and Borrowers model. No join/formula is duplicated in visual SQL. The proposed amount increases selected exposure and total portfolio equally; other borrowers stay unchanged. Blank selection gives no scenario, zero gives no proposed-share donut (source behavior), and negative amounts give no scenario. See [Metabase model guidance](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/models) and [shared snippets](https://www.metabase.com/docs/latest/questions/native-editor/snippets).

**Unavailable source information:** continuous borrower outstanding-principal history has no borrower/date snapshot provider. Page 7 explains this; current balances and loan issue dates are not presented as that history. No new history table, view or collection job was introduced.

The owner approved exactly [73 additional SELECT column grants](remaining-proposed-grants.sql), applied to `loan_manager_prod` for `metabase_borrower_reader` after verified backup reuse and fresh ACL capture. [Execution](remaining-grants-applied.json) and [restricted SELECT checks](remaining-grants-verified.json) are recorded separately from the earlier proposal. No DDL, data writes, blanket table grants or new identity were introduced.

[Remaining checks](remaining-verification.json) cover independent source reconciliation, ten unique grains, 80 model-only questions, scenario boundaries, dashboard parameter mappings, first-two-page preservation and partner permissions. The earlier 31 parity cases pass after model expansion. [New dashboard inventory](remaining-dashboard-verification.json) and [question definitions](remaining-questions.json) provide sanitized recovery metadata. These checks establish this implementation, not exact parity with broken legacy source bindings.

To reverse this batch, restore private `remaining-pages-before` dashboard/card definitions, archive new dependent questions/models, then revoke only the 73 added column privileges using the preserved prior ACL. The accepted POC and earlier grants stay intact. Current definitions are exported privately at completion. Owner acceptance and final migration closure remain pending.
