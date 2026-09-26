# Solution design rules

## Custom borrower matrix extension — R030

Metabase dashboard3/tab31 now includes the accepted Debian-hosted custom matrix; R033 removed the native plot placement while preserving its saved question for recovery. R034 places the chart ahead of category tables and presents baht amounts without decimals on this page; scores, ratios, percentages and stored values retain their original precision. SQL V43 remains the authority for categories and coordinates; the chart joins borrower names through a dedicated read-only role. Four equal quadrants with muted category symbols, nearby name labels without connector lines and a name-first/single-category tooltip improve identification without changing the model. A shared bearer secret protects the fixed-query endpoint; dashboard readers are its intended audience. No OLTP/OLAP AppSheet fields, workflows or app versions change. [R030 evidence](../outputs/r030-custom-matrix/README.md) describes refresh, access, mobile scrolling and rollback.


## R029 equal-quadrant borrower matrix

The accepted V3 categories and payment scores remain authoritative. `reporting_borrower_matrix_plot_v1` adds display-only coordinates: stronger health left, contribution>=1× above, with both boundaries centered. Modified schedules use a categorical right-half position, not a reduced payment score. Native Metabase point/reference series render four equal regions; the complete companion list exposes original metrics. The display scale is not a credit probability or new rating. [Exact implementation and limits](../outputs/r029-bcg-matrix/README.md).

## R028 automatic schedule-aware categories

The shared SQL matrix V3 retains the measured payment score and adds an automatic schedule restriction: an active daily-interest loan with auto-charge disabled, >=7 observed days and >=2 expected dates, and <80% of expected interest amount OR interest-bearing charge dates prevents Star/Cash Cow. Any affected active loan restricts its borrower; contribution selects Question Mark versus Dog. No manual labels or approval queue. The 30 completed-day comparison respects later schedule anchors; amounts are not extra debt. The report labels modified schedules separately from payment compliance, including on the scatter plot. [Exact rule and delivery](../outputs/r028-schedule-health/README.md).

## R027 shared payment health and Borrowers review

PostgreSQL owns charge and borrower health. Current overdue status, historical reliability and history confidence are independent concepts. Metabase review tab 31 uses the new providers; original Borrowers and Risks remain unchanged for comparison and later cutover. The borrower payment-health summary is delivered in Metabase. OLTP integration is explicitly future scope; this task's DEV AppSheet detour was removed. [Detailed design and delivered report](../outputs/r027-payment-health/README.md).

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

R035 adds **Borrower Portfolio** (tab104) and **Borrower Detail** (tab105) alongside the original borrower pages, following the owner's revised additive implementation instruction. Portfolio separates current exposure from selected-period signed receipts and lending, ranks borrowers and supports ID-based drill-through with preserved dates. Detail requires one borrower, combines current authoritative V41/V42 health with period activity and loan/obligation evidence, and provides a non-persistent additional-principal scenario. V44 SQL providers aggregate loans and receipts independently before joining; previous 30 completed Bangkok days is the default. No AppSheet changes, new stored financial fields or duplicate rating method. [Detailed handover](../outputs/borrower-pages-design-20260925/HANDOVER.md) · [implementation](../outputs/r035-borrower-pages/README.md).

R037 refines Portfolio104 with current principal and fixed30-day positive-interest contribution pies, a lifetime achieved daily rate (signed interest / end-of-day principal-days through yesterday), and lifetime interest return on total original principal lent (R038), including active and closed loans through today. These four visuals ignore the activity slicer but respect population. Negative recent borrower totals are disclosed separately from positive pie shares; ratios use top8 with no mobile overflow aggregation. [Exact contract and handover](../outputs/r037-borrower-contribution/README.md).

24 September earlier reporting checkpoint (before R023 replacement): **Weekly loan-cohort return · live** (233) replaces the R018 period ratio. It groups loans issued within the selected period by Monday issuance week, using only those loans' interest received within the same period and counting principal once per loan. Existing live models 70/71 retain Loan ID attribution; the chart includes today when selected and is placed at half width beside EOD activity among the trend charts, with explicit live labeling. Unpaid loans stay in the denominator; zero principal/unknown inputs remain unavailable. The 100% reference and capital-yield chart 232 are retained. Dashboard 3 now has 207 placements, including R021 live summary cards 234 (Net Principal Deployed) and 235 (Loan-Cohort Return). Other questions, source models, database/AppSheet, permissions and jobs are unchanged. [R019 corrected contract and verification](../outputs/r019-20260924/README.md).


The owner-authorized **6R · Performance** (tab 18) sits after original **6 · Performance** (7), which remains unchanged pending the owner's decision. Its independent period filter drives live lending/interest summaries and separately labeled completed-day Daily Analytics trends, weighted weekly loan size and EOD counts. By explicit owner choice, the two gross-interest trend charts calculate strict seven-day averages in Metabase query-builder Offset expressions over existing daily snapshots/calendar, before the displayed-date filter; no new DB object or handwritten SQL. This scoped presentation calculation reuses model 74's cumulative baseline and preserves null/missing-day coverage. It is an explicit refinement of the reporting computation rule above, not authority to move transaction reconstruction into visuals. Existing models and unified hourly/history refresh remain unchanged. [Implementation and source contract](../outputs/r016-20260922/performance-redesign/ROLLING_IMPLEMENTATION.md).

R016 established ten canonical pages, 129 visual placements, 117 distinct questions, 15 active models / 228 fields and four snippets. Original tabs 2/9/10 are replaced by Cash Position (14), Income Statement (16) and Cashflow Statement (15), now ordered as pages 2/3/4, with later tabs shifted back. Fourteen unused questions and seven models are recoverably archived after dependency checks. DEV/PROD are V39; AppSheet and financial rows are unchanged.

Cash Position keeps today/live and past/snapshot routing. Income and Cashflow statement totals and detail remain live for every selected period. Their separately labeled completed-day trends use stored portfolio/account snapshots, with missing-day counts and actual refresh times. Income excludes principal, capital movements and partner payments; no FIFO distributions or retained-profit bridge appears. Cashflow uses a fresh source opening seed and selected-period running balances. Transfers cancel only in All accounts; unknown balances remain unavailable. The database retains superseded providers for compatible rollback under expand/contract. [canonical cash statements](../outputs/r016-20260922/statement-cleanup/README.md).

Reusable heavy logic belongs in PostgreSQL; thin models carry source metadata. Canonical questions are reused across pages, with placement-specific titles/formatting and filters. Snapshot refresh/rebuild ownership stays with the existing hourly bot and unified date-range engine.

The [page metric contract](../outputs/r016-20260922/README.md) records source/date behavior, including legacy gross-interest profit, the corrected contiguous seven-day comparison excluding today and fixed chart references. Preserve those during the copy and identify them for owner review instead of silently substituting newer net-profit metrics. Saved questions and layout definitions live beside the database project; the encrypted Metabase application database remains the authority for users, permissions and live dashboard state. Its private backups are separate from Git publication.

### R016 daily snapshots — part 1

Owner-approved historical materialization uses Daily Analytics at portfolio/date grain and Cash Account Daily Analytics at account/date grain. Existing hourly Recent refresh and arbitrary-history rebuild share one atomic SQL engine. Snapshots serve historical trends and past-date positions; current cards use live providers. Today is provisional. Unknown/pre-opening cash stays unavailable, transfers cancel at consolidated grain, and negative account balances remain signed. No additional retained-profit/advance storage is required. Part 2 is implemented: 2R uses live OLAP for today, stored past positions and completed-day trends, with source/freshness and negative/unknown balances preserved. The canonical page replacement and cleanup are recorded in the current Metabase section above. [2R contract](../outputs/r016-20260922/cash-snapshot-report.md). [Exact fields, date rules, reconstruction limits and next-task contract](../outputs/r016-20260922/daily-snapshots/README.md).

## Business and ecosystem diagrams

- [OLTP lifecycle diagram](OLTP_Business_Processes.drawio): three editable pages cover loan lifecycle, payment processing and controls/ownership. Update only depicted behavior, not version numbers, formula refinements or presentation-only changes. Its synthesis baseline is 12 September; current business explanations/verified release evidence take precedence. It does not claim fresh lifecycle or delivery acceptance.
- [Ecosystem diagram](Loan_Business_Ecosystem.drawio): the app/database pair, partner assistant services, access/recovery and public-site context. As confirmed on 16 September, Azure hosts the partner worker; Tailscale provides private RDP; Outlook fallback and Looker are in use. Borrower-location sheets are a historical import, not a live feed. The privacy site is published; custom-domain mapping is not inferred. AI Collection was excluded from this drawing by owner request; this does not alter that separate project's authority. Dormant facilities are not active release dependencies.

Generation/asset instructions are in [scripts guide](../scripts/README.md#diagram-maintenance). Original provenance and interpretation are preserved in the archive: [OLTP](archive/2026-09-20/OLTP_Business_Processes.md), [ecosystem](archive/2026-09-20/Loan_Business_Ecosystem.md). These archived companions are no longer maintained in parallel.


### Cashflow statement ownership

V38/V39 provide bounded live statements for page 10; the current Metabase section above owns its design. The V36 providers remain compatible rollback references. No AppSheet or financial-data behavior changed.

R021 summary row: five cards across on 6R. Net deployed = selected-period principal issued minus principal returned across all loans. Cohort return = selected-period interest from loans issued in that same period divided by original cohort principal, counted once; ratio of totals. Both use live models 70/71 and the shared date filter, including today when selected. Dashboard labels are shortened to fit; full saved-question names/descriptions retain definitions. [R021 evidence](../outputs/r021-20260924/README.md).

R022: all eight 6R Performance trend charts use selective value labels (Show values on data points = on; Values to show = Some/fit). Metabase fits labels to available space; calculations, filters and layout unchanged. [Evidence](../outputs/r022-20260924/README.md).

R038 borrower return formula and recovery: [handover](../outputs/r038-lifetime-return/README.md). This supersedes R037 active-loan interest/current-principal coverage; the lifetime achieved daily rate keeps its completed-day exposure basis.

R039 Portfolio layout correction: both original amount-ranking bars285/286 coexist with pies311/312 and lifetime ratio bars313/314. Amount interest follows activity dates; current principal and the other four charts retain their documented date rules. [Current six-chart layout](../outputs/r039-restore-borrower-bars/README.md).

R040 presents the achieved daily-rate bar to one decimal and adds both lifetime ratios, each as a one-decimal percentage, to the Portfolio comparison table. The added values reuse model310 by borrower ID, retain the R037/R038 formulas and ignore the activity slicer; table membership and other columns retain their selected-period behavior. [Saved display contract](../outputs/r040-borrower-lifetime-display/README.md).

The R040 comparison table also displays the current governed V3 BCG Matrix category by borrower ID, alongside Current health. Active borrowers receive the same category as Borrower Health Review/Detail; inactive borrowers are labeled Outside active cohort. Activity dates do not recalculate the category. [Refinement evidence](../outputs/r040-borrower-lifetime-display/README.md#bcg-matrix-category-refinement).

R040 makes Portfolio tab104 the canonical sixth Metabase tab, named **6 · Borrowers**, after Performance and before Borrower Health Review. The original Borrowers tab6 and empty Tab 11 ID17 were removed from the dashboard; their saved questions were retained. Borrower Detail tab105 and all other tabs/filters remain. [Cutover and recovery](../outputs/r040-borrower-lifetime-display/README.md#borrower-tab-cutover).


R040 Detail punctuality now presents on-time, subsequently paid-late and still-overdue obligation counts by due month, plus the on-time rate and denominator above the chart. Existing V41 charge-grain eligibility/timing remains authoritative; excluded observations are counted separately. [Contract](../outputs/r040-borrower-punctuality/README.md).


R041 Detail presentation: grouped principal-issued/returned bars; existing OLAP-style Loan Key in loan/charge/repayment tables; internal IDs omitted from displayed results. Selected-date charges precede repayments, with current-overdue table unchanged. [Contract](../outputs/r041-borrower-detail/README.md).
