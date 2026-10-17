Current cash pages: [canonical statement contract](statement-cleanup/README.md). The 23 September cleanup replaces the original cash tabs and prior review-page design; old inventories below are dated checkpoints.

# R016 — Loan Reports review

## Current 2R snapshot integration — 23 September 2026

2R now uses live OLAP for today and V37 stored snapshots for past positions/completed-day trends, with explicit source/freshness. The retained-profit/advance bridge is removed while negative balances remain visible. The other twelve tabs are preserved. Current inventory: 157 placements, 124 questions, 22 models / 319 fields and four snippets. [Current contract, implementation and tests](cash-snapshot-report.md).

## Earlier additive cash-reporting checkpoint — 23 September 2026

2R now reuses utilization gauge question **68** instead of scalar **54**, with the two capital figures stacked beside it. Shared gauge settings and all other tabs remain unchanged. [Scoped verification](cash-review-gauge-verification.json). At that earlier checkpoint, the label “Partner advances” represented negative account balances, not an independently recorded partner liability; see the [metric clarification](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Change%20Logs/CHANGE_NOTES_R016_2026-09-22.md#2r-utilization-gauge-and-metric-explanation--23-september-2026).

The ten original pages remain unchanged. Three appended tabs offer an alternative design for owner review:

| Tab | Purpose and filters | Reuse |
| --- | --- | --- |
| [2R · Cash Position](https://reports.mw-credit.com/dashboard/3?tab=14) | Today's capital summary; cash/remaining capital/custody at the selected date or period end; all-period retained-profit reconciliation; separately filtered cash-position trend. Default position Today, trend previous 30 completed days. | Nine existing placements plus advance scalar, reconciliation table and trend. |
| [10R · Cashflow Statement](https://reports.mw-credit.com/dashboard/3?tab=15) | Opening/in/out/closing, net change, transaction-type summary and chronological ledger. Defaults This month / All accounts. | Seven existing questions plus one transaction-type aggregation. |
| [9R · Income Statement](https://reports.mw-credit.com/dashboard/3?tab=16) | Income, expenses, net profit, calendar-day average, expense detail; FIFO profit distribution separate below. Default This month. | Nine existing questions plus a two-movement waterfall whose Total is Net profit. |

Thirty new placements reuse questions 25 times; five missing projections are 200–204. No duplicate models or snippets and no edits to existing saved questions, models, snippets, permissions or original page/filter definitions. Total: 13 tabs, 160 placements, 121 questions, unchanged 20 models/287 fields/three snippets. Exact definitions and reuse rationale: [plan](cash-review-plan.json); IDs: [state](cash-review-state.json); [verification](cash-review-verification.json).

Cash position is reconstructed, with unavailable custody before known openings and intraday values for today. Its capital summary is explicitly current: the existing historical model does not expose a complete dated capital-utilization summary. Net cash = positive cash held − advances; remaining lending capital + cumulative retained net profit + reconciliation difference = net cash. The difference is diagnostic, not income. Combined repayments are not split into principal and interest in the transaction-type summary. Draw cards retain the existing FIFO allocation through period end, not transfer-date cash movements. Original pages and their older semantics remain available for comparison.

Rollback: exact pre-change dashboard, 124 existing question/model definitions, snippets and permissions are privately preserved under `r016-20260922/cash-review-before`; final metadata under `cash-review-complete`. Remove only review tabs/parameters/placements and recoverably archive 200–204 after dependency checks. Preserve any subsequent owner edits; do not blindly restore the full dashboard. No SQL/AppSheet rollback is needed. This is a published review checkpoint; design acceptance and final R016 closure remain pending.

## Earlier question-reuse checkpoint — 23 September 2026

The ten-page dashboard has 130 visual placements using 116 distinct questions, twenty models and 287 model fields. Ten redundant questions were replaced with existing canonical questions and recoverably archived. Page titles, number formats, layout and filter mappings stay on each placement; the query is owned by the shared question. Overview and Performance now both use question 56 for seven-day growth. [Mapping, comparisons and recovery](question-reuse-verification.json). The original POC and intentionally different chart types, populations and date contracts remain separate. Earlier counts below are dated checkpoints.

## Overview trend window and labels — 23 September 2026

The three Overview Portfolio trends use a shared **Portfolio trend period** dashboard filter, defaulting to Metabase's **Past 30 days** preset. This means the last 30 completed Bangkok dates (today−30 through yesterday). The filter is mapped only to the three Overview chart placements; the shared principal question on Cash Analysis retains its separate Cash date range. Headings, card titles, saved question names and the proposed-loan filter label no longer repeat THB. Chart axes, data fields and currency formatting still identify monetary units. [Saved-state and date verification](overview-trend-refinement.json).

The owner restored the principal trend's original fixed 120,000 reference after reviewing a current-cash-pool comparison. Question 62 is again a single-series area chart on both Overview and Cash Analysis. [Restoration checks](principal-reference-restore-verification.json).

## Income Statement checkpoint — V35, 23 September 2026

The cash waterfall was removed on 23 September. Separate + and = symbols now connect the three cash cards; a short footnote preserves the distinction between selected-period profit and cumulative cash. Native waterfall Total cannot be renamed in this Metabase version, so its chart title states **Total = Unsettled Profit**. Queries, models and date mappings are unchanged; eleven focused checks passed ([evidence](income-symbols-verification.json)).

[Open page 9](https://reports.mw-credit.com/dashboard/3?tab=12). Fourteen visuals now show earnings, average daily net profit, partner draws, retained profit, period-end pool/custody/holder/account balances and expense detail. Lifetime profit and monthly earnings are removed. Number cards share compact height and whole-baht formatting; the three cash cards have equal widths with separate + and = symbols; chart labels/axes show full numbers. Metabase still auto-fits scalar font size to available space. Notes are short enough for phone display, with cash before expenses. The full dashboard now has 123 placements, 119 distinct questions, eighteen models and 256 fields.

**Date semantics:** income/expenses/draw allocation use the selected continuous range. Average daily net profit divides selected net profit by calendar days through today, including zero-activity dates. Cash uses the selected **end date**, not the sum of daily balances. V35 derives pool from dated capital less dated loan principal plus principal repayments, and custody from dated ledger movements plus immutable opening-minus-baseline offsets. Full custody is available from 18 September 2026; earlier/missing account openings remain null. Later corrections restate history. This is reconstructed accounting history, not an immutable historical snapshot.

**Cash bridge:** pool + earlier retained profit + selected-period unsettled profit + advances + reconciliation difference = cash held. Differences remain explicitly diagnostic, not additional income. Individual account balances, positive cash held and advances remain distinct. Unknown total custody suppresses the cash bridge rather than displaying a partial total.

V35 was tested in DEV and promoted to PROD from `e7fd3af40b572ab644856e7cc95d6a243f49a870`; Metabase source 2 stays PROD. Two new thin models (187–188) read the two database views. Fourteen visual projections reuse the shared period snippet; expense categories use the expense model. The reporting login has SELECT-only on twenty named sources. No financial data, posting, existing source definitions, AppSheet or infrastructure changed.

Verification: disposable CI, DEV/PROD dated OLTP statement/current balance comparisons, source/grain/period/FIFO/cash-bridge checks and desktop/390px browser checks. See `income-verification.json`, `income-asof-production.json`, `income-refinement-complete.json` and `income-browser-verification.json`. The period selector was checked against historical cash, not just today's balance. On narrow phones, use presets or landscape/desktop for the native wide custom-date picker; account tables scroll within their cards.

Private recovery is in `income-refinement-before` and `income-refinement-complete`. Removed cards 176, 177 and 181 are recoverably archived after confirming no active dashboard uses them. Restore the prior snippet/cards/layout if rolling back presentation; compatible V35 views may remain unused. Dictionary and documentation record the current source mapping. Whole-R016 owner acceptance, key revocation and final release tag remain pending. The following sections retain earlier migration checkpoints where explicitly labelled.

## V34 migration checkpoint — 22 September 2026

The owner requested reusable heavy calculations in PostgreSQL views. V34 was tested in DEV, then the same commit `63836d4905f23d5cfd6e1cbd916ec4a5a6091523` was promoted to PROD. The live report never changed database: source 2 remains `loan_manager_prod`. Six models now contain only direct SELECTs from `public.reporting_expenses`, `reporting_cash_accounts`, `reporting_income_monthly`, `reporting_income_statement`, `reporting_settlements` and `reporting_income_daily`. Existing columns, grains and model IDs remain identical. The shared period snippet retains date filtering, sums, simple arithmetic and calls to the existing PostgreSQL FIFO function.

The earlier SQL also executed in PostgreSQL. This change centralizes ownership, reduces SQL expanded/submitted by Metabase and allows database consumers to reuse the definitions. Ordinary views do not cache results or eliminate repeated card queries. PROD single-run view execution timings were 0.6–11.5 ms; no measured need for materialization or larger Railway resources was found. These are diagnostic database execution timings, not end-to-end dashboard latency or a billing benchmark. Live source freshness and the current-cash/date-period distinction are unchanged.

Validation: disposable migration rebuild/no-op/checksum and analytics/concurrency checks passed; six complete result multisets match old SQL in DEV and PROD; 101 income/filter checks passed after the switch. All nine layouts/parameters, model metadata and partner permissions match the saved baseline. SELECT-only access now includes six new views plus the original twelve sources; financial data, existing source definitions, AppSheet and infrastructure were untouched. See `income-db-views-development.json`, `income-db-views-production.json`, `income-db-views-switch-verification.json` and `income-db-views-grants.json`.

Recovery: private `income-db-views-before` contains the six exact former model definitions/SQL, dashboard, permissions and dictionary. Restore those model queries if needed; leave the compatible additive views in place until an authorized forward migration. Fresh pre-promotion schema exports match; the verified-restored PROD dump hash was rechecked. The development API key remains retained under the owner's existing instruction. R016 final acceptance/key revocation/tag are still pending.

[Open the dashboard](https://reports.mw-credit.com/dashboard/3). Nine tabs are implemented for review: 123 business visual placements from 119 questions, eighteen reusable models and two shared parameterized snippets. Pages 1–2 retain their accepted layouts and metric definitions. The borrower POC remains at dashboard 2. Full migration acceptance remains pending.

## Shared reporting models

[Reporting Models](https://reports.mw-credit.com/collection/8) is inside the partner-only Loan Reports collection. PostgreSQL remains the owner of financial posting and source balances. Metabase's reusable SQL models centralize reporting joins, time windows, labels, signed values and rankings; 109 questions use the model query builder. Three proposed-loan visuals and ten Income Statement visuals reference their respective shared parameterized snippets, because model definitions cannot contain input variables.

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
| Business Expenses / 163 | Expense ID; signed amounts, category and Bangkok month boundaries. |
| Cash Account Positions / 164 | Cash Account ID; recorded holder, custody/advance balances and missing-opening status. |
| Monthly Income / 165 | Calendar month; separately aggregated live income and expenses. |
| Income Statement / 166 | Current OLTP Cash Dashboard row; MTD benchmark and current cash reconciliation. |
| Settlement Ledger / 185 | Settlement ID; immutable partner reference and existing completion/date semantics. |
| Daily Income Ledger / 186 | Calendar date; daily net profit, partner allocations and cumulative FIFO inputs calculated before period filtering. |

Metabase maps the corresponding database columns and declares Loans.Ref Borrowers → Borrowers.Row ID and Repayments.Ref Loans → Loans.Row ID as foreign keys. These are semantic metadata settings over the existing views, not new PostgreSQL constraints. Exact columns/IDs are in [models.json](models.json), the dictionary's **Metabase Models** sheet, and maintained [model SQL](../../scripts/metabase/models). Visual definitions are in `model-questions.json`, `remaining-questions.json` and `income-questions.json`. Extend the owning model when future pages need reusable logic; do not copy joins into a visual.

## Source and metric contract

Source: Workspace Data Studio report `52954065-a261-4b97-8d19-df84126bbdc6`, pages `p_80zev5uo6d` and `p_1w9y6sjk6d`. [Original question SQL](questions.json) is retained solely as the independent source-parity oracle. [Dashboard inventory](dashboard-verification.json) maps stable question keys to saved IDs and tabs.

| Page / visuals | Governed source and behavior |
| --- | --- |
| Overview: cash pool, principal, available cash, utilization, expected daily interest, MTD profit, projected monthly profit, active loans | Existing `olap_portfolio_summary`; available cash = pool − principal; utilization = principal / pool. Profit retains the original gross-interest meaning. |
| Overview: 7-day growth | Repayment interest over the last seven completed Bangkok dates (yesterday through seven days ago) versus the seven dates immediately before (eight through fourteen days ago). Today is excluded; the periods are contiguous. Zero prior period returns no value. |
| Overview: profit in past 30 days; interest paid | Repayment interest during Bangkok dates today−29 through today, and all-time, respectively. |
| Overview: top borrower | Borrower Description with largest current outstanding principal, excluding hidden borrowers. |
| Overview: two borrower horizontal bars | Borrowers → Loans using Row ID / Ref Borrowers; repayment interest aggregated per loan before Loans → Borrowers join. Four named borrowers plus Others. No charge fan-out. |
| Overview: daily principal, profit and overdue area charts | Stored Daily Analytics snapshots by Snapshot Date. The three placements default to the last 30 completed Bangkok dates and can be adjusted with Portfolio trend period. Overdue uses Pending Charges EOD and excludes today. Original fixed references of THB 120,000 principal and THB 10,000 daily profit are preserved. Axis ranges adapt so points remain visible. |
| Cash: pool, principal, available cash, loan account balance; utilization gauge | Existing portfolio summary. Gauge scale 0–100%, boundaries 60%, 85%, 95%. |
| Cash: balance composition | Horizontal 100% stacked bar: available cash plus unsettled gross profit. |
| Cash: principal by loan type | Current loan outstanding principal, grouped by short English labels for phone readability; the Thai source type remains available in Loan Book. |
| Cash: daily principal; issued versus returned | Daily snapshots; issued positive and returned negative, as in the source. Zero bars have no labels. |

Overview shows all-time/current metrics with each question's intrinsic date rule, except the three Portfolio trends that use the adjustable Portfolio trend period filter. The Cash date control binds portfolio visuals to **Peak Cash Pool Date 30D**, loan type to **Loan Date**, and daily charts to **Snapshot Date**, preserving the source's unusual mixed semantics. It is not a historical as-of balance control. Cash dates are selected by default. Source cache timing and ongoing PROD activity can cause transient differences; no totals are hardcoded.

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

## Initial Income Statement checkpoint — superseded by V35 above

[Open Income Statement](https://reports.mw-credit.com/dashboard/3?tab=12). The owner supplied the OLTP Income MTD screenshot and a shared **Business Money Breakdown Infographic** as conceptual references. Their example figures are not hardcoded. The page has 17 visuals: operating income, signed expenses, net profit/margin, a retained-profit waterfall, each partner's draw, unsettled profit, monthly earnings, expense categories, net profit through period end, and current cash/pool/check/holder/account information with statement dates.

**Statement period** defaults to **This month** and accepts relative periods or a custom date range. Clearing it selects all recorded dates. Twelve cards are mapped: ten native projections of one shared statement snippet, plus the monthly and expense-category model queries. Five current-cash cards remain deliberately unfiltered and clearly labelled. Monthly bars include only dates in the selected range. Activity ends at Bangkok today; the displayed date row shows the available date range intersecting the selection. Income comes from posted interest (including the existing negative default adjustment convention), and expenses from Business Expenses; no hourly snapshot delay is introduced.

The shared `income-period-snippet.sql` selects Daily Income Ledger after its running prior-profit and settlement amounts are calculated. For each partner, allocated draw = min(max(selected net profit,0), max(completed settlements through period end − max(prior net profit,0),0)), through the existing `fifo_current_month_settled` function. This is the OLTP's earlier-profit-first rule extended to any continuous date interval. It is **profit allocation as of the selected period end**, not simply settlements whose transfer date falls inside the interval. Expenses reduce net profit; draws reduce unsettled profit. The waterfall contains only the four signed movements, so its total does not double count profit subtotals.

Current business cash uses Cash Account Balances, with immutable holder/account grouping and missing openings left null. The separate current cash check is cash held minus current pool remaining minus current-month unsettled profit. It is a diagnostic, not an attribution of differences to additional income. Selecting a historical period does not fabricate historical cash custody. Ordinary account current balances, nonnegative cash held and advance due remain distinct in the detail table.

The owner initially approved 21 column grants, then explicitly chose **SELECT on all 12 existing sources used by Metabase** instead of column-by-column access. [Exact source list](../../scripts/metabase/reporting-sources-grants.sql) and [live grant/read-only verification](reporting-sources-grants-applied.json) supersede the unexecuted nine-column period proposal. Future columns in those objects are covered; future tables and unrelated sources are not. No write, CREATE, role-administration or default privileges were granted. Existing narrower column grants remain for recovery.

[101 income checks](income-verification.json) cover current-month parity with all eight OLTP figures; prior/partial/cross-month, single-day, empty and cleared selections; independent FIFO arithmetic; waterfall/month/category reconciliation; unchanged current cash; six new model grains; shared sources; preserved earlier-page layouts/filters and partner permissions. The six new models bring the dictionary to sixteen models and 236 fields; all 13 operational worksheets remain byte-identical. Existing 31/37 checks are retained as earlier checkpoints; their source logic and first eight pages were not edited.

Private rollback exports are under `income-before`, with completed objects exported after verification. Restore the pre-page dashboard, archive its 17 questions and six new models/snippet after dependency removal, then revoke the object-level grants and the 21 new column grants if reversing the entire batch. The original narrower ACLs are preserved. The superseded fixed-MTD bridge model 167 was archived after the date-selectable snippet replaced it. Full owner acceptance and development-key revocation remain pending.

Date-slicer edge-case verification: non-contiguous exclusion filters are rejected with selection guidance, avoiding incorrect FIFO allocation. Mobile preset selection is usable in portrait; Metabase’s native two-calendar custom range picker is wider than a narrow phone, so use landscape or desktop for custom dates. This is noted on the page; the report itself has no horizontal page overflow, and account tables scroll within their cards.


## Cashflow Statement — approved PROD deployment, 23 September 2026

Owner’s “go ahead” authorized the two PROD views and SELECT-only source grants. Promoted immutable V36 from exact commit `d9da07a89a39a732bb1d5fcf7994f04dafe56379`, after fresh matching PROD schema and verification of the retained restore-tested dump/hash. DEV and PROD are migrated/validated at V36. No financial writes, app definitions, existing OLTP views, infrastructure or authentication changes. Previous DEV-candidate paragraphs are dated evidence, superseded by this completion.

Published dashboard 3 tab 13 with models 190–191, questions 192–198, auxiliary account lookup 199 and shared snippet 3. Date/account filters control money in/out/net, period availability, opening, complete chronological transactions and closing. Opening/closing values remain numeric for reconciliation, with full-baht display or explicit Unavailable. All-account history starts 18 September 2026; individual scopes use their own opening dates. Internal transfers remain visible but cancel from consolidated money movement. Negative accounts are included in signed custody. Later corrections restate historical balances.

Verification: existing disposable CI and 42 DEV visual-query cases reused because V36 is unchanged; 13 PROD reconciliations and 72 live dashboard checks pass across five account scopes and month/known-opening/one-day/empty ranges. Previous nine tabs and partner permissions are unchanged. Desktop and 390px browser viewport checked; compact notes fit with no page horizontal overflow, full numbers are used, and transaction detail scrolls within its table. Date picker changed to This week and account picker applied Dad SCB via Update filter, then restored default This month / All accounts. This is viewport QA, not a physical-phone test.

Dictionary updated to 20 models/287 fields, rendering both new model sections and preserving the original 13 operational worksheet XML files byte-for-byte. Current dashboard counts: ten tabs, 130 visual placements, 126 distinct questions, 50 heading/note cards and three shared snippets. Auxiliary lookup 199 is excluded from visual-question counts. SELECT-only access covers 22 named sources; no future-object or write privileges.

Recovery: private `cashflow-before` dashboard/permissions/dictionary plus verified-restored database dump; restore affected metadata if needed, leaving compatible additive views unused. Evidence: `cashflow-production.json`, `cashflow-grants.json`, `cashflow-verification.json`, `cashflow-state.json`, `dictionary-verification.json`. AppSheet/RC steps are N/A. This cashflow batch is implemented and verified; full R016 owner review, retained development-key revocation and final tag remain pending.
