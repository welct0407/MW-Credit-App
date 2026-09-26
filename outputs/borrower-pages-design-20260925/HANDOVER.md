# Borrower Portfolio and Borrower Detail — implementation handover

**R039 correction:** Both original amount-ranking bars are restored alongside the two pies and two lifetime ratio charts. [Six-chart layout](../r039-restore-borrower-bars/README.md).


**R038 refinement:** The right-hand bar now uses lifetime interest / total original principal lent, including active and closed loans. [Current formula](../r038-lifetime-return/README.md).


**26 September refinement:** Portfolio contribution/rate visuals now follow the [R037 lifetime-rate handover](../r037-borrower-contribution/README.md). Original period sections and Detail remain as documented below.


Date: 25 September 2026. Owner subsequently approved implementation **as two new tabs**, superseding the original in-place replacement proposal below. R035 implements Portfolio (104) and Detail (105); original tabs 6/10 remain unchanged. [Implementation, verification and recovery](../r035-borrower-pages/README.md). Remaining references to replacing the existing tabs describe the original proposal, not the delivered cutover.

## 1. Summary and scope

Enhance two existing Metabase tabs on [Loan Reports, dashboard 3](https://reports.mw-credit.com/dashboard/3): tab **6**, currently `6 · Borrowers`, becomes **6 · Borrower Portfolio**; tab **10**, currently `9 · Borrower Insight`, becomes **9 · Borrower Detail**. Preserve tab IDs, order and existing inbound links. Borrower Health Review (tab 31) remains the authority for the portfolio matrix, payment-health methodology and automatic schedule categories.

| Page | Purpose | Main content |
| --- | --- | --- |
| Borrower Portfolio | Understand who holds capital, contributes interest and uses lending services | Current portfolio size/exposure; selected-period interest and lending; borrower rankings; new versus repeat borrowing; comparison table with links to Detail |
| Borrower Detail | Understand one borrower's current position, activity and payment evidence | Identity and current balances; current authoritative health summary; period activity; loan history; charge/repayment evidence; optional existing exposure scenario |
| Existing Borrower Health Review | Review health and categories across the portfolio | Existing matrix, category groups, confidence, schedule restrictions and methodology; unchanged |

Expected implementation footprint: Metabase questions/layout/filter mappings and possibly additive read-only PostgreSQL reporting views. **No AppSheet change is proposed or necessary for this design.** No operational table/column, financial write, notification, new collection workflow, credit decision or custom chart service is proposed. If implementation discovers an AppSheet dependency, stop that part and obtain owner approval describing the exact app/object change, reason, effects and rollback. The current request authorizes design documentation, not live implementation/publication.

Do not remove Risks, alter Health Review, change Collection Monitor, or reorganize other tabs as part of this handover. Retirement of other pages is a separate owner decision.

## 2. Evidence and current baseline

Starting Git commit: `a6f4fd8fe418d5dc242c3bd589816bc182ff203c`. Existing unrelated untracked risks/R026 work was preserved.

On 25 September, read-only GET requests through the maintained `scripts/metabase/ReportingApi.mjs` inspected dashboard 3, the two tabs' placements/filters, models 69–72, health questions 253/254/267–272/275 and existing Detail questions 143/158. The source identity check confirmed Metabase database 2 uses `loan_manager_prod`, `metabase_borrower_reader`, and the established loopback proxy host. No queries returning borrower records, writes or browser actions were needed for this design pass. These observations establish saved configuration, not fresh financial reconciliation or visual QA.

Relevant implementation references:

- [Solution design](../../Documents/Solution_Design.md): reporting ownership and Health Review responsibilities.
- [R027 payment-health contract](../r027-payment-health/README.md), [R028 schedule contract](../r028-schedule-health/README.md), [R034 accepted layout](../r034-matrix-order/README.md).
- [V41 health providers](../../database/migrations/V41__borrower_payment_health.sql), [V42 schedule/category providers](../../database/migrations/V42__automatic_schedule_categories.sql). These immutable migrations are reference definitions, not files to edit.
- [Dashboard dictionary](../../Documents/Data%20Dictionary/systems/metabase/dashboards/loan-reports.yaml) and [Metabase tools](../../scripts/metabase/README.md).

Findings that affect the design:

1. Portfolio has no period parameter mappings. It combines current exposure, lifetime measures, fixed rolling metrics and legacy stability charts.
2. Detail uses the existing single borrower parameter `insight-borrower` / URL slug `borrower`, plus `proposed-amount` / `proposed_amount`. Its ordinary aggregate cards have borrower mappings, but mappings alone do not establish safe behavior when the parameter is empty.
3. Borrowers model **69** still exposes legacy `Matrix*`, overdue and timing fields. Reusing a model does not make those fields equivalent to the new Health Review providers.
4. Repayment Ledger **71** exposes dated signed principal/interest and immutable keys. Its `Interest 30D` helper covers today−29 through today. Health Review contribution covers today−30 through yesterday. Use explicit dates, not that helper, for the new default period.
5. Borrower Performance **72** groups by borrower display name and does not return an immutable borrower key. Do not use it as the identity/join/navigation source for this redesign. Its live ranking differs from the older checked-in SQL, reinforcing the need for current readback before implementation.
6. The legacy monthly payment chart **143** uses Charge History model 75. Its checked-in `Payment Timing` expression treats anything not explicitly late as on time. Replace this chart's classification using V41 eligibility/timing; do not migrate that fallback into the new design.
7. Health Review saved questions expose selected presentation fields, often without `borrower_id`. They are examples of the authoritative source queries, not automatically suitable sources for filtered Detail cards.

## 3. Shared interaction and date contract

### Population and identity

- All joins, aggregation grains, selection values and links use immutable `Borrower ID` / `borrower_id`; names are labels only. Keep the key in result metadata even when it is hidden visually. Disambiguate duplicate labels using a short stable ID suffix.
- Portfolio default population: **all permitted borrowers with loan history**, including closed/inactive and hidden records. `Hidden Flag` is an operational visibility flag, not a new reporting security rule. Preserve the dashboard/source access controls. Provide `All with loan history`, `Currently active`, and `Currently inactive` population choices. Show the selected population in the page header; changing it scopes every Portfolio measure consistently.
- This is a current-status population filter, not historical active-as-of reconstruction. A closed borrower with period payments remains in the default population. Do not discard such receipts.
- Detail picker includes permitted borrowers, including those without loan history. No selection, an unknown ID, or an inaccessible ID produces an empty prompt/state, **never all-borrower totals or the first borrower**. No-record borrowers get explicit no-loan/no-payment states, not invented scores.
- Portfolio table search is a table-only convenience. It must not silently redefine the denominator of page totals/shares. Label any independent table search accordingly.

### Dates and filters

- All dates are Bangkok dates. Default activity period is **previous 30 completed dates**, today−30 through yesterday. Display resolved start/end dates. Allow one continuous custom range ending today or earlier; today is explicitly provisional.
- Add a dedicated Portfolio activity-period parameter and a separate Detail activity-period parameter. Do not bind these to Overview/Performance/Income/Cashflow/Health Review questions.
- On Portfolio, current cards/rankings use current balances/status; period cards/charts use the selected activity period. On Detail, borrower selection affects every data block, but activity dates affect only the period activity and transaction/obligation history blocks listed below.
- Loans issued use `Loan Date`; receipts use `Payment Date`; payment behavior uses `due_date` of eligible obligations, not payment month. Date ranges are inclusive calendar dates, implemented consistently with an exclusive next-day endpoint where timestamps are used.
- Health score, confidence, category, schedule status and Health Review's contribution multiple always use the existing providers' current/fixed windows. They do not recalculate from the page activity filter. Label them **Current health · governed rolling window**.
- No historical health/category chart is included: ordinary views do not provide stored rating history. Historical payment records may be restated after corrections; they are not evidence of what the system knew at that past time.
- Current panels show reporting date/query time. Period panels show the resolved period and query time. Query time does not prove source payments have synced. Do not label all cards an atomic snapshot when separate queries can run at different times.

### Presentation

Use native Metabase cards, horizontal bars, simple time-series charts and tables. Financial amounts display baht with zero decimals, while calculations retain full precision; percentages use one decimal and scores one decimal, contribution multiples two decimals. Use full amounts in tables and tooltips. Negative corrections stay signed and visible. Unknown values show `Unavailable` with the reason, rather than zero.

Desktop: short summary row, paired charts, full-width comparison/history tables. Mobile: stack cards and charts; put name/status/amount columns first in wide tables, with horizontal scrolling for supporting evidence. Avoid pies with many borrower slices, a second matrix, or a second custom visual service.

## 4. Borrower Portfolio layout

```text
Borrower Portfolio                 [Population] [Activity period]
Current position · today            [Active borrowers] [Active loans] [Principal outstanding]
Activity · selected dates          [Interest received] [Principal issued] [Loans issued]
[Principal by borrower · current]   [Interest by borrower · period]
[Interest over time · top 5 + other][New vs repeat loans · weekly]
[Borrower comparison table · click borrower for Detail]
Source/date note · link to Borrower Health Review
```

| Block | Design and exact behavior | Source / implementation note |
| --- | --- | --- |
| P1 Current position | Distinct borrowers with at least one active loan; active-loan count; outstanding principal across all loans of the selected population. Three cards. Current inactive selection may still show debt; do not force it to zero. | Model 70 active status and principal, at loan grain; model 69 identity. Reconcile active status with health provider and flag real differences before acceptance. |
| P2 Period activity | Signed interest received; original principal issued once per loan issued in range; count of those loans. Three cards. Interest includes receipts from older loans and closed borrowers in the selected population. | 71 by payment date; 70 by loan date. These are gross interest and lending measures, not net profit. |
| P3 Capital distribution | Horizontal bars, top 10 borrowers by current principal; separate `Others` amount when more than 10. Show principal share in tooltip/table. Clicking an individual opens Detail. | Aggregate by borrower ID, then rank; deterministic tie order by ID. `Others` is not a borrower link. |
| P4 Interest contribution | Horizontal bars for top 10 by selected-period signed interest, plus `Others`. Table retains zero/negative contributors; show negative bars. Share is shown only when cohort total interest is positive. | Do not use the fixed `Interest 30D` helper or Health Review's relative multiple as the selected-period share. |
| P5 Interest trend | Daily for ranges up to 60 days, weekly above 60. Top five borrowers selected by whole-period interest, plus `Others`, consistently across the range. Keep negative corrections visible. Use unstacked lines if signed stacking is unclear. | One borrower/date aggregate, densified only where valid zero-activity dates are established. Never interpret a failed/missing source as zero. Top five membership is fixed for the selected range. |
| P6 New/repeat lending | Weekly stacked loan counts: first-ever loan versus subsequent loans. Tooltip shows principal issued and distinct borrowing customers in the week. | Loan history ordered by loan date then immutable Loan ID. A repeat loan need not follow a fully repaid loan. No inferred customer-retention rate. |
| P7 Comparison table | Borrower; current active loans; current principal; current portfolio share; period interest; period principal issued; period loans issued; current health label. Default principal descending, then ID. Offer a secondary column set for principal returned, loan history count and last payment date. | One row per ID. Health label only from V41, with `Unavailable` preserved. Keep score/category analysis on Health Review. Individual rows navigate to Detail with the ID and period. |

P7 is the main exploration surface. Do not add full legacy stability/components tables below it. A compact link to Health Review supplies the health-analysis path. Do not change Health Review to accept a borrower filter as part of this scope.

### Metric rules for Portfolio

- **Principal share:** borrower current outstanding principal / current outstanding principal of the selected population. Null if denominator is nonpositive. Label `Share of selected population` if filtered.
- **Interest share:** borrower signed interest in range / selected-population signed interest in range, only when total >0. A negative share or share above 100% can result from reversals; preserve and explain it. Do not clamp.
- **First loan:** earliest loan by `(Loan Date, Loan ID)` over complete eligible loan history, before the date filter. Missing loan dates produce unclassified activity and a data-quality count, not a guessed first loan. Each in-range loan is counted exactly once as first, repeat or unavailable classification.
- **Distinct customers borrowing:** count distinct borrower IDs with loans issued in range; optional table/footer statistic, not sum of daily distinct counts.
- **Activity amounts:** preserve approved reversals/adjustments. Do not count repayment rows as payment punctuality or as unique receipt events: one receipt can have multiple allocations.
- **Population totals:** rows and charts reconcile over the same ID set. A failed attribution or material null input must surface as incomplete coverage, not disappear in an inner join.
- Omit the legacy return-on-average-capital and capital-versus-interest scatter from the first implementation. Arbitrary-period borrower average daily capital needs a verified borrower-level history provider; portfolio-level snapshots do not establish it. No new snapshots/storage are required by this design.

## 5. Borrower Detail layout

```text
Borrower Detail                    [Required borrower] [Activity period]
Name · active/inactive · hidden flag where relevant · first loan date
Current position                   [Principal] [Active loans] [Overdue] [Portfolio share]
Current health                     Status · score/status · confidence · category · schedule
Activity · selected dates          [Interest] [Principal issued] [Principal returned] [Loans issued]
[Principal issued/returned trend]  [Interest received trend]
[Current active loans]            [Recent obligation behavior]
[Loan history · lifetime]
[Payment and obligation evidence · selected period]
[Loan exposure scenario · optional, existing capability moved below evidence]
Source/date notes · Health Review link
```

| Block | Required information and behavior |
| --- | --- |
| D1 Identity | Display borrower name, stable ID in secondary detail, active/inactive state, first loan date and operational hidden flag when true. No phone/address/bank/document fields are needed. Selected identity is prominent and persists while scrolling through evidence. |
| D2 Current position | Current outstanding principal; active loans; authoritative current overdue amount; current principal share of **all permitted borrowers with loan history**. Portfolio's optional current-status filter must not change this denominator on navigation. Show overdue principal/interest and oldest overdue days beneath the amount. Due today is not overdue. |
| D3 Current health | `current_health_status`, `rating_status`, `reliability_score`, `confidence`, `reason_text`; current V3 `quadrant`, `arrangement_status`, `classification_reason`. Show score unavailable/status explicitly. Inactive borrowers without a matrix row show `Outside active cohort`, not an inferred category. Explain modified schedule separately from payment score; a schedule restriction never substitutes a lower score. Link to Health Review for the full matrix/methodology. |
| D4 Period activity | Signed interest received; principal issued once per loan; signed principal returned; loan count. Same date definitions as P2. Additional compact lifetime line: cumulative interest received, number of loans, recorded default count/loss, each clearly labeled lifetime. No net-profit or return claim. |
| D5 Cash activity trends | Paired charts: dated principal issued and principal returned; dated interest received. Use daily/weekly rule from Portfolio. Principal returned can relate to loans issued before the period. Do not imply their difference equals current principal. |
| D6 Active loans | Loan ID, loan date, type, original principal, current principal, due date where meaningful, current daily interest where meaningful, schedule status. Next recorded plan due date/principal/interest may be joined from the existing loan schedule provider, labeled `Recorded next plan`. Null plans mean no recorded supported plan, not no future obligation. |
| D7 Payment behavior | Eligible obligations grouped by due week/month in selected period: on time vs not paid on time, with denominator/count and excluded/unavailable count. Use V41 `history_eligible`, `on_time`, `exclusion_reason`. Title must say `Obligations by due date`; one charge is one observation, not one customer/payment. Today/future obligations are not eligible timing observations. |
| D8 Loan history | Lifetime list, active first then latest loan date: ID, type, issue/close dates, status, original/current principal, lifetime principal/interest received, default flag/loss. Date filter does not hide an older active loan. Clearly label lifetime scope. |
| D9 Payment evidence | Dated repayment allocation lines in range: Payment Date, Loan ID, Repayment ID, signed principal and interest. Label as allocations, not unique receipts. Paginate and preserve corrections; no financial mutation controls. |
| D10 Obligation evidence | Charges with due dates in selected period: Loan/Charge IDs, due date, principal/interest due, remaining principal/interest now, current days overdue, historical on-time result and exclusion/data-quality reason. Add a separate short **All current overdue obligations** table unaffected by period, so a short history filter cannot hide older arrears. |
| D11 Exposure scenario | Retain the existing hypothetical capability at the bottom, default proposed additional principal 0. Replace two pies with compact current/proposed principal and share comparison. Borrower current principal B, all-population principal T, proposed new principal A: proposed principal B+A; share (B+A)/(T+A), denominator >0. A must be numeric and nonnegative. This assumes new lending increases portfolio principal; it does not reserve cash, save a loan, forecast repayment, alter health or approve eligibility. |

On Detail, current health is a read-only reuse of Health Review logic. Do not copy its matrix or all-borrower category tables. Supporting score components may be a drill-through saved question if later requested; they are not required in this first design.

## 6. Source mapping and implementation dependencies

| Requirement | Existing source and confirmed fields | Treatment |
| --- | --- | --- |
| Identity/current borrower facts | Metabase 69, `Borrower ID`, `Borrower`, `Hidden`, `Has Active Loan`; underlying `olap_borrowers_analytics` | Reuse identity; do not reuse legacy Matrix/timing/overdue fields as the new health contract. |
| Loan grain/history | Model 70, `Loan ID`, `Borrower ID`, `Loan Date`, `Loan Status`, `Principal Amount`, `Outstanding Principal`, `Close Date`, `Due Date`, `Total Principal Received`, `Total Interest Received`, default fields | Read-only source. Confirm signed/void semantics and key uniqueness at implementation. |
| Dated actual receipts | Model 71, `Repayment ID`, `Loan ID`, `Borrower ID`, `Payment Date`, `Interest Paid`, `Principal Paid` | Filter raw dates explicitly; prove parity with authoritative health contribution for the same active cohort and fixed completed-day range. |
| Current overdue/score/confidence | `reporting_borrower_payment_health_v1`, fields named in D2/D3 plus `overdue_principal`, `overdue_interest`, `oldest_unpaid_days`, `reporting_date`, `calculated_at` | Existing all-borrower provider; one row per borrower. No new score computation. |
| Authoritative categories | `reporting_borrower_matrix_v3`, `borrower_id`, `quadrant`, `relative_contribution`, `classification_reason`, `arrangement_status` | Left join to identity/health. Do not filter the matrix cohort before its score/contribution calculation. |
| Charge evidence/timing | `reporting_charge_payment_health_v1`, fields named in D7/D10 plus `is_overdue`, `current_days_overdue`, `final_settlement_date` | Existing source; current remaining and historical timing have different cutoffs. Retain both meanings. |
| Schedule/recorded next plan | `reporting_borrower_schedule_health_v1` and `reporting_loan_schedule_health_v1`; existing question 272 demonstrates next-plan date/principal/interest fields | Join by borrower/loan key, retain supported/invalid/insufficient-observation states. Do not interpret counterfactual expected interest as collectible debt. |
| Portfolio comparison/first vs repeat | Existing identity, loans and receipts above, aggregated independently before joins | May need additive read-only reporting views/functions to own reusable aggregation and first-loan classification. Object names and migrations are intentionally unallocated until implementation. |

Do not join raw loans × repayments × charges and then sum. Pre-aggregate each fact to borrower or loan grain before combining. A borrower with three loans and many payments must not multiply original principal, outstanding balances or health rows.

Reuse existing source grants where sufficient. Confirm actual reader access for each proposed provider; unavailable access is an explicit implementation dependency, not permission to broaden grants automatically. Any new grant should be limited to the approved reporting object. No new physical tables/columns are anticipated; if proposed, provide need/dependency analysis for owner approval first.

All reusable heavy joins/running logic remain in PostgreSQL; Metabase models provide thin field metadata and questions perform selection, filtering, simple aggregation and presentation. New SQL work follows immutable higher Flyway migrations under the current release at execution time. Never alter V41–V43 or globally change shared legacy models as an incidental fix.

## 7. Placement migration and preservation plan

| Current object | Proposed action when implementation is authorized |
| --- | --- |
| Portfolio 78/48/59/81 headline placements | Replace/reuse compatible measures with explicit current/period scopes; largest borrower and lifetime interest leave the headline row. Shared question 81 is also used in Detail: do not rewrite its semantics globally. |
| 82/84 share pies, 83/85 rankings | Consolidate into two ranked horizontal charts plus table shares. Reuse only if population, dates and key handling match exactly. |
| 86/87 return/coverage and 92 capital-interest scatter | Remove from redesigned tab's first version; retain saved questions for recovery/other consumers. Do not label lifetime interest/principal as principal repayment. |
| 88/89/90 lifetime interest/loan count/interest trend | Consolidate into selected-period trend, first/repeat chart and comparison table. Remove positive-interest-only filtering so reversals remain visible. |
| 91/93 legacy matrix and stability components | Remove placements from Portfolio; point to authoritative Health Review. Do not modify tab 31 or archive shared dependencies. |
| Detail 139/140/141/81 | Reuse safe identity/principal/count/lifetime semantics; replace overdue with V41 and enforce required borrower behavior. |
| Detail 143/145/146 legacy timing/assessment/risk | Replace timing with V41 observations and health summary with V41/V3; retain relevant verified historical/default facts. No legacy category beside an authoritative category. |
| Detail 144 history and 158–160 scenario | Retain loan-history purpose, expand verified fields; simplify scenario and move below evidence. Preserve snippet consumers until dependency review. |
| Existing borrower parameter and Collection Monitor links | Preserve `insight-borrower` and `borrower` where compatible. Verify existing Collection Monitor → tab 10 links still resolve. A Portfolio click maps its activity period to Detail's separate period parameter; Collection Monitor links with no period use Detail's default. |

The current health saved questions do not all expose the key; new thin key-bearing questions/models are preferable to changing shared question outputs blindly. Keep the existing Health Review custom iframe and its credential/private metadata out of public design artifacts and rollback exports.

## 8. Implementation sequence and approval boundary

1. Obtain owner direction to implement the reviewed design. Read the current Open release then; R035 was Open during this design pass, but this documentation does not reserve it or its successor.
2. Re-read affected live tabs, source definitions/grants and inbound link consumers. Capture private dashboard **and affected question/snippet definitions** before a coherent edit batch. A dashboard copy alone shares questions and is not enough if questions change.
3. Reconcile source grains/date/sign semantics with targeted read-only checks. Resolve legacy/provider mismatches rather than silently choosing a value. Identify any genuinely missing reporting provider.
4. Build/review/test any needed SQL in DEV using the database procedure; obtain scoped production authorization before applying to PROD. No physical table/column or AppSheet change without the owner's required approval.
5. Implement the two pages in an isolated report review copy with the same intended access boundary. Preserve other tab definitions and avoid shared-question mutations. Demonstrate the exact layout/filter behavior; do not publish an in-place replacement before scoped authorization.
6. On authorized publication, update only the accepted tabs, necessary questions/models and parameter mappings. Reuse unchanged Health Review logic and existing access.
7. Complete tests below; update owning dictionary objects, release log, applicable model/design references and publication evidence under the execution release. This proposal is not itself a live dictionary/configuration change.
8. Preserve recovery questions until dependency checks establish safe retirement. Do not delete Health Review, legacy Risks or blank tabs under this scope.

AppSheet approval contingency: no app edits, regeneration, adapters, new Refs, workflows or version saves are required. If any is suggested, submit the exact proposal for owner approval and continue independent reporting work. Do not revive the removed R027 AppSheet integration.

## 9. Acceptance tests for implementation handover

| Test | Required result |
| --- | --- |
| Identity | Duplicate names remain separate; every chart/table click opens the intended immutable borrower key. |
| Missing selection | Empty/invalid/inaccessible Detail selection yields no borrower totals, transactions or scenario results. Switching borrowers does not retain stale rows. |
| Financial grain | Multiple loans/charges/repayment allocations do not multiply principal or receipts. Table totals reconcile with independently aggregated sources for the same population/period. |
| Signed corrections | Reversal, negative-interest and zero-activity cases remain visible; shares are unavailable when their denominator is nonpositive. Unknown input is not coalesced to a valid zero. |
| Date boundaries | Default range is exactly 30 completed Bangkok dates. Test one-day, month boundary, today-inclusive and historical ranges. Portfolio period maps correctly into Detail; unrelated tabs stay unchanged. |
| Current vs period | Changing activity dates leaves current balances/health and lifetime loan history unchanged, while period figures/evidence change. Older arrears remain visible in the all-current-overdue table. |
| Health parity | Selected borrower score/category/confidence/schedule/reasons match authoritative providers at equivalent query time. Provisional, Data review, Unclassified and outside-active-cohort cases display distinctly. |
| Timing | Due today is not overdue; no recent obligations is unavailable, not 100% on time; a cure today changes current debt without rewriting historical lateness. Default accounting and invalid observations remain excluded/labeled. |
| First/repeat | Complete pre-period loan history is considered; same-date ties use immutable ID. Counts reconcile first + repeat + unavailable to all loans in range. |
| Inactive/hidden | Closed borrower with in-range payment remains in default totals; hidden flag does not silently remove financial activity; permitted borrower without loans has a clear Detail empty state. |
| Scenario | A=0 reproduces current position; positive A updates numerator and denominator; negative/invalid input is rejected; no financial record or score changes. |
| Query/access | Queries execute through the actual reporting role without truncation or errors; preserve partner dashboard access and existing field/data permissions. Measure relevant query latency; optimize only observed problems. |
| GUI | Current Metabase desktop/mobile rendering has readable names, labels, negative values, status reasons and table columns; required picker works; Collection Monitor inbound links remain valid. |
| Preservation/recovery | Unrelated tab/card/filter/permission definitions are unchanged; question dependencies checked; scoped rollback evidence can restore affected definitions without overwriting intervening work. |

This pass verified saved metadata and design/source consistency only. No live metric reconciliation, query execution of the proposed design, rendering test or implementation acceptance is claimed.

## 10. Recommended first-delivery boundary

Deliver P1–P7 and D1–D11 using existing authoritative facts, with the existing scenario simplified rather than expanded. No new rating, return metric, rating-history storage, borrower financial editing, lending recommendation, or contact workflow. If a desired secondary field lacks a verified source, expose a clear availability gap and resolve it before adding that field; do not invent a value or widen the project.

The owner can review page contents and the all-history default population before implementation. The principal design decision is already explicit: **Portfolio explains borrower contribution and activity; Detail explains one borrower; Health Review continues to own health analysis.**


R040 D7 implementation supersedes the original two-way timing display: chart304 splits Paid on time / Paid late / Still overdue; summary316 supplies rate, assessed count and exclusions above the monthly chart. Both use selected borrower and due-date range. [Exact definitions and recovery](../r040-borrower-punctuality/README.md).
