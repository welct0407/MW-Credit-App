# Solution design rules

R024 current order: **5 · Performance** (tab18) precedes **6 · Borrowers** (tab6) on dashboard3. Their identities, cards and filter mappings are unchanged. [Evidence](../outputs/r024-20260924/README.md).

R023 current Performance: owner accepted 6R as the replacement. Tab18 is now **6 · Performance**, sixth in order; old tab7 and its 18 placements are removed. The unused performance-date filter is removed, while Performance period remains. Dashboard3 has **11 tabs / 189 placements**. Saved questions retained, including shared question56. All retained chart definitions/layouts and other tab order preserved. [Evidence](../outputs/r023-20260924/README.md).

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
