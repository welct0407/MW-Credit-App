# Loan Reports (Metabase dashboard 3) — review and enhancement plan

26 October 2026. Review of the live dashboard `reports.mw-credit.com/dashboard/3`: 12 tabs, 272 card placements (190 visuals, 82 text or iframe cards), 28 filters. The page-by-page findings were first reconstructed from the dashboard dictionary export and the release evidence, then verified against the live layout read through the Metabase API on the same day; no page needed a change. Figures in the prototype are illustrative, not live data.

## What the review found (cross-page)

1. **Diagnostics sit on the business pages.** Nine "freshness", "coverage", "source" and "assumptions" tables take prime space (Income 16×6 at the top, Cashflow 16×8, Performance three tables, Partners, Forecast two). They answer "is the data right?", which the two users need once, not on every visit.
2. **Too many headline numbers, no hierarchy.** Overview shows 12 number cards in three equal rows; Borrower Detail shows 17. Nothing says which number matters today.
3. **Long explanatory text cards.** About 55 text cards, many five to eight lines. Metabase card descriptions (the "i" tooltip) can carry most of this.
4. **Nine differently named date filters** (Portfolio trend period, Position date, Position trend period, Statement period, Cashflow period, Performance period, Portfolio activity dates, Detail activity dates, Partner activity period) with mixed defaults (today, this month, past 30 days).
5. **Duplicated content.** Cash pool, principal and utilization appear on Overview and Cash Position; principal by borrower appears on Overview, Borrowers and Risks; Risks is the unfiltered legacy page.
6. **Tab names carry numbers** ("1 · Overview" to "12 · Forecast & Planning") that churn on every reorder (renumbered three times already) and add nothing on a tab strip.
7. **Phone usability is unverified or weak** (release notes for Collection Monitor, Borrower pages, Forecast). The daily pages (Overview, Collection Monitor) are the ones read on a phone.
8. **Good foundations to keep:** the shared model layer, live vs snapshot separation, the Collection Monitor lanes and status colours, the custom BCG matrix, the Borrowers comparison table as a hub with links to Detail, and the Forecast scenario logic.

## Conventions proposed for every page

- **Page header line**: title, one "As of 26 Oct 14:05 · live" or "· snapshots to 25 Oct" line, and the page's filters. This replaces the freshness tables.
- **Headline band**: at most five numbers, each with a comparison (vs previous period, vs goal) where one exists.
- **One primary chart** above the fold, detail tables last.
- **Notes become card descriptions**; one short footer per page at most.
- **Filter vocabulary**: "Period", "Date", "Account", "Borrower", "Partner", "Scenario". Trend pages default to past 30 days, statements to this month.
- **Tab names without numbers**; Risks merged into Borrowers; a last tab "Data health" holds the diagnostics.
- **Status colours** unchanged from Collection Monitor (red not paid, orange partial, purple overdue, green paid) and reused everywhere a status appears.
- **Phone**: headline band first, lanes and card pairs stack, tables cut to the columns that matter.

## Page by page

### 1 Overview → "Today"
Now: 12 number cards, two concentration bars, three snapshot trend charts, a fixed-reference note; nothing about today's collection.
Plan: open with four numbers that answer "how are we today": cash available, principal at work, interest this month vs projected, collected today vs due. Add a "needs attention" strip (overdue, not paid today, unclassified, data freshness) linking to Collection Monitor and Health. Keep two trend charts (principal vs reference, daily interest vs goal with 7-day average) and one concentration chart (top four + others). Drop all-time interest, "largest borrower" text card and the duplicate principal bar.

### 2 Cash Position
Now: live pool/principal/gauge, two selected-date numbers, a 24×6 freshness table, holder and account tables, trend; eight text cards for nine visuals.
Plan: one headline band at the selected date (cash pool, principal, lending capital, net cash, utilization gauge) with a live/snapshot badge; one holder × account balance table; the trend chart; two text cards at most.

### 3 Income Statement
Now: three numbers, a freshness table on the first screen, average per day, waterfall, expenses by category, expense detail, daily snapshot bars, snapshot freshness table.
Plan: equation band "Income − Expenses = Net profit" with per-day average and change vs previous period; monthly comparison chart (this month vs the previous three); expenses by category as a ranked bar; daily income and expenses chart; expense detail last. Freshness tables leave the page.

### 4 Cashflow Statement
Now: opening/in/out/closing, a 16×8 freshness table, movement by type, daily bars, freshness table, a 24×12 transactions table, account picker that needs "Update filter".
Plan: equation band "Opening + In − Out = Closing"; account selector as a single dropdown with "All accounts" default; movement by type as bars with the table; transactions last, six columns on phone.

### 5 Performance
Now: five numbers, interest by loan type, "live period & source" table, two coverage tables, eight charts in pairs, two method notes, a daily table. 25 placements.
Plan: headline with change vs previous period; two charts above the fold (principal issued vs returned, daily interest with 7-day average); the remaining charts under "Lending volume" and "Returns"; loan-type split as a stacked bar; coverage tables moved to Data health; daily table last.

### 6 Borrowers (absorbs 9 Risks)
Now: six numbers, period table, two 10-slice pies, two bars, two lifetime bars, availability table, long notes, two trends, comparison table. Risks duplicates principal by borrower and adds status, ageing, scatter, default loss, risk monitor.
Plan: four headline numbers; ranked bars instead of pies; a "Concentration & ageing" section taken from Risks (principal by borrower, loan age, default loss); the comparison table as the hub with a category column and default sort by principal.

### 7 Borrower Health Review
Now: the matrix hero (good), four count + table blocks, scatter, three all-borrower tables, schedule assessment tables, long method notes. About 29 placements.
Plan: keep the matrix; replace the four blocks with one category strip (counts as chips) and one categorized table; move scoring components and schedule assessment to a "Rating detail" section at the end; one footer linking to the dictionary.

### 8 Borrower Detail
Now: 39 placements, 130 grid rows tall, 17 number cards, eight tables.
Plan: a profile card (name, category, health score, overdue flag) at the top; numbers in two rows (current, lifetime); charge-date lights kept; three primary tables (active loans and next plan, overdue obligations, loan history); the evidence tables (obligations, payments, allocations) under a "Records" heading last; scenario input kept.

### 9 Risks → merged into Borrowers
Legacy page with no filters; its useful charts move into Borrowers, its numbers already exist on Today.

### 10 Collection Monitor
Now: four numbers, four lanes with counts and lists, detail table, charges today, unclassified, query-time table. Good structure.
Plan: add a collection progress meter (received vs due today); lanes sorted by amount left; unclassified shown only when above zero; query time becomes the header "As of" line with the 60-second refresh; on phone the lanes stack in priority order. Backlog item to carry: the Daily Collection Status rule in the OLAP view (V22) still follows the old rule.

### 11 Partners
Now: five numbers, positions table, capital share, "how net available is calculated", period numbers, two bars, a line, pending table, two ledgers, source checks.
Plan: two partner columns (capital, earned, paid, pending, available) in statement style; pending settlements near the top; activity charts kept; calculation and source-check tables to Data health.

### 12 Forecast & Planning
Now: 13 filter widgets, 27 placements, three scenarios, cumulative chart, bridge, watchlist, coverage, funding plan with five mandatory inputs, two 24×10 detail tables.
Plan: two halves, "Interest outlook" and "Cash plan"; a single Scenario selector with the three percentages shown as read-only assumptions unless Planning is chosen; the plan inputs as a visible checklist with a "Plan not ready" state; watchlist near the top; coverage and the two detail tables to the end or Data health.

### New: Data health (last tab)
Freshness, snapshot coverage, source checks, query times, forecast coverage and exceptions, the "how it is calculated" tables.

## Rollout (high level)

1. Conventions, Today and Collection Monitor (the daily pages).
2. Cash Position, Income, Cashflow, Performance.
3. Borrowers (with Risks), Health, Detail.
4. Partners, Forecast, Data health.

Each step follows the existing additive-tab and guarded-installer practice: build the new tab beside the old one, verify, then cut over, so every step is reversible.
