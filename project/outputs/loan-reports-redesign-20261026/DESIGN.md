# Loan Reports redesign — detailed design

26 October 2026. Detailed design for the proposed Loan Reports pages, to be built as a **parallel dashboard** beside the live `Loan Reports` (dashboard 3) for owner review and comparison. The review that led here is in [REVIEW.md](REVIEW.md); the execution plan is in [PLAN.md](PLAN.md); the machine-readable layout is [layout.json](layout.json), generated together with the tables below by [build_design.py](build_design.py). Prototype boards: [Loan Reports Redesign canvas](https://claude.ai/artifact/Tc1u8rq11FLfhiAb2rbvut) (illustrative figures).

## Principles

1. **Reuse first.** Every card that exists on dashboard 3 is placed again by `card_id` with, at most, a title override on the placement. The 25 governed models, the four snippets and the saved questions are unchanged. New questions are added only where the page needs a view no saved question gives or where a placement setting cannot reach the plan (a sort, a top-N + others, a strip or statement shape), and each is a thin query on an existing model or a copy of an existing question's query with the stated change; the origin question is named so the mapping contract and the reconciliation follow from it.
2. **Parallel, additive, reversible.** The new dashboard lives in its own sub-collection under `Loan Reports`; dashboard 3, its tabs and its questions are never edited. Comparing the two side by side is the review; cutover is a later, separate decision.
3. **One template per page.** Header text with the page's As-of statement, a headline band of at most five numbers, one primary chart above the fold, breakdowns, then tables. Method notes become card descriptions; each page keeps one footer line.
4. **Diagnostics move to Data health.** Freshness, coverage, source and calculation tables are placed once on the last tab, mapped to the same filters as the page they belong to.
5. **One filter vocabulary.** 22 filters instead of 28: one `Period` (past 30 days) shared by every trend and activity page, one `Statement period` (this month) shared by Income, Cashflow and Partners, and the page-specific selectors. A reused card keeps the template tag or model dimension it already maps; the installer copies the mapping from dashboard 3 and substitutes the new filter id.
6. **Status language.** The Collection Monitor colours and emoji (🔴 not paid, 🟠 partially paid, 🟣 overdue, 🟢 fully paid) are the only status cues. Whole baht; one-decimal rates.
7. **Reference lines.** The Today charts carry Metabase goal lines for the principal reference (120,000) and the daily interest goal (10,000), the two values the owner already uses in the Overview note.

## Filter semantics the installer must keep

- `period` replaces five dashboard-3 filters. On a reused native card it maps to the same template tag the old filter mapped (`performance_period`, `period`, `position_trend`); on the MBQL model cards (62, 222 family) it maps the same `Date` dimension the old filter mapped. Default past 30 days.
- `statement-period` replaces `review-income`, `review-flow` and `pt-period`; same tag substitution (`statement_period`, `cashflow_period`, `period` on Partners cards). Default this month.
- `borrower` keeps question 277 as its value source so the Borrowers comparison click-through (`bd_borrower`) keeps working; the click target becomes the new dashboard's Borrower Detail tab with the same `period` carried over.
- `collection-borrower` and `collection-status` map only to question 248, as today.
- Forecast filters keep their defaults and their mappings; only ids and display names change.
- Value lists marked "copy static list" are copied from the dashboard-3 parameter definition.

## Reuse policy for presentation

Allowed on a placement: `card.title`, `card.description`, column visibility/order (`table.columns`, from the `columns` option), any visualization setting merged through the `vs` option (series colours, goal lines, value labels, axis split, category grouping), and `card.hide_empty`. A sort cannot be set on a placement in Metabase. Not allowed: changing a saved question's query, display type or name. Where a page needs the same query with another display, sort, column set or shape, a new question is saved in the proposed collection with the copied query and a description that names its origin; the new question maps the same template tags or model dimensions as its origin under the new filter ids.

## Custom matrix

The BCG matrix on Borrower Health is live dashcard 1501 (an iframe with a bearer-key fragment). The installer copies that dashcard's `visualization_settings` from the live API at install time and never from Git; the key stays outside the repository as today.

## Generated specification

The tables below are generated from `build_design.py`. Positions are grid row/column on Metabase's 24-column grid; sizes are width × height in grid units. "reuse qNNN" is an existing saved question; "new `key`" is defined in the New questions table.

<!-- GENERATED:START -->
12 tabs, 225 placements, 22 filters, 152 reused saved questions, 23 new questions.

Metabase renders one column below about 760 px: every card full width, in grid order (row, then column), with a fixed height per display type (numbers and text about 4 units, tables, charts and iframes 6). There is no per-device layout, no side-by-side pair and no phone column set; the design therefore reduces card counts on the daily pages (Today, Collection) and keeps the desktop order as the phone order.


### Filters

| Id | Name | Type | Default | Replaces on dashboard 3 | Values |
| --- | --- | --- | --- | --- | --- |
| `period` | Period | date/all-options | past30days | overview-trend-period, review-position-trend, review-performance, bp-period, bd-period |  |
| `statement-period` | Statement period | date/all-options | thismonth | review-income, review-flow, pt-period |  |
| `position-date` | Date | date/all-options | today | review-position |  |
| `account` | Account | string/= | ['__ALL__'] | review-account | card 199 |
| `population` | Population | string/= | ['All with loan history'] | bp-population | copy static list |
| `borrower` | Borrower | string/= | None | bd-borrower | card 277 |
| `scenario-amount` | Scenario · additional principal | number/= | [0] | bd-amount |  |
| `collection-borrower` | Collection · borrower | string/= | None | collection-detail-borrower | card 77 |
| `collection-status` | Collection · status | string/= | None | collection-detail-status | copy static list |
| `partner` | Partner | string/= | None | pt-partner | card 324 |
| `settlement-status` | Settlement status | string/= | None | pt-status | copy static list |
| `scenario` | Scenario | string/= | ['Planning'] | fp-scenario | copy static list |
| `interest-collected` | Interest collected % | number/= | [100] | fp-ci |  |
| `principal-collected` | Principal collected % | number/= | [100] | fp-cp |  |
| `overdue-recovered` | Overdue recovered % | number/= | [0] | fp-rr |  |
| `loan-kind` | Loan type | string/= | ['All'] | fp-kind | copy static list |
| `target` | Interest target ฿ | number/= | None | fp-target |  |
| `plan-lending` | Plan · new lending ฿ | number/= | None | fp-lending |  |
| `plan-expenses` | Plan · cash expenses ฿ | number/= | None | fp-expenses |  |
| `plan-withdrawals` | Plan · payouts & withdrawals ฿ | number/= | None | fp-withdrawals |  |
| `plan-inflows` | Plan · external inflows ฿ | number/= | None | fp-inflows |  |
| `plan-reserve` | Plan · cash reserve ฿ | number/= | None | fp-reserve |  |

### New questions

| Key | Name | Display | Origin | Basis | Filters | Definition | Reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `today.principal-smart` | Principal at work · change over the period | smartscalar | q62 | model 74 Daily Performance | period | MBQL on model 74: Outstanding Principal (max) by Date, filtered by Period on Date. Smart scalar shows the latest completed-day value and the change against the first date in the period (29 periods ago on the default 30-day Period). Whole baht. | Latest value equals question 62's last completed day; first value equals its first day (built, verified). |
| `today.realization` | Interest this month · share of projection | progress | q52 | model 73 Portfolio Overview | none | MBQL on model 73: field Forecast Realization (Realized Profit MTD ÷ Projected Monthly Profit). Progress goal 1 shows the share of the projected month collected so far. | Equals question 51 ÷ question 52 (built, verified). |
| `today.collection-rate` | Today's charges · paid share | progress | q252 | model 73 Portfolio Overview | none | MBQL on model 73: field Amount Collection Rate Today (Amount Collected Today ÷ Amount Due Today): the share of the charges dated today that is paid, not receipts. Progress goal 1. Placed on Today only; Collection shows the same share as question 252. | Equals model 73 Amount Collection Rate Today and question 252 (built, verified). |
| `today.attention` | Needs attention · strip | table | q240 | models 162 Collection Status Summary and 77 Collection Worklist; views of questions 254 and 270 | none | One row per attention item with people and baht: 🟣 Overdue (count from model 162 as question 240, amount as question 254), 🔴 Not paid (model 162 count as 242, amount left), 🟠 Partially paid (model 162 as 244, amount left), Modified plans (question 270). Columns Item, People, Amount ฿, Opens, Tab and Tint (both hidden; Tint drives an even row tint). The installer substitutes __TAB_COLLECTION__ and __TAB_HEALTH__ with the proposed tab ids and sets the Item column click behaviour to the link template https://reports.mw-credit.com/dashboard/<dashboard>?tab={{Tab}}. Replaces six chips with one card. | People: rows 1–3 equal questions 240, 242, 244; row 4 equals 270. Amount: row 1 equals 254; rows 2–3 equal model 162 Amount Remaining for the status (also the sum of the lane's Left column). |
| `today.principal-top4` | Principal by borrower · top four + others | row | q60 | model 72 Borrower Performance | none | Native on model 72: borrowers with Principal Rank ≤ 4 named, the rest summed as "Others (n)" (n counts borrowers with principal above zero). Same total as question 60, four bars instead of ten. | Sum of the five bars equals the sum of question 60's bars; the four named bars equal question 60's first four. |
| `today.interest-top4` | Interest · past 30 days by borrower · top four + others | row | q61 | model 72 Borrower Performance | none | Native on model 72 with question 61's filter (Payments 30D > 0): Profit Rank ≤ 4 named, the rest summed as "Others (n)". Same total as question 61. | Sum of the five bars equals the sum of question 61's bars; the four named bars equal question 61's first four. |
| `cash.pool-selected` | Total cash pool · selected date | scalar | q207 | snippet 4 Cash position source routing (models 205, 73) | position-date | Native, same routing as question 207: today reads model 73 Total Cash Pool, a past date reads model 205 Total Cash Pool for that date; blank when no snapshot exists. | Today equals question 47; a past date equals model 205 (built, verified). |
| `cash.principal-selected` | Principal outstanding · selected date | scalar | q207 | snippet 4 Cash position source routing (models 205, 73) | position-date | Native, same routing as question 207, selecting Outstanding Principal. | Today equals question 48; a past date equals model 205 (built, verified). |
| `income.expenses` | Expenses · statement period (positive) | scalar | q169 | snippet 2 Income statement period | statement-period | Question 169's query with the sign flipped, so the equation band reads "Income − Expenses = Net profit" with the minus in the title and a positive magnitude in the card. Copies 169's template tags (statement_period, #186, snippet 2) and mapping. | Equals −(question 169) for the same Statement period. |
| `income.vs-previous` | This period and the previous period | table | q168 | snippet 2 Income statement period (model 186 Income Events) | statement-period | Native: for the selected statement period and the immediately preceding period of equal length, one row per measure (Income, Expenses, Net profit, Net profit per day) with This period, Previous period, Change and Change %. Previous period blank before the reporting calendar. Whole baht, one-decimal percent. | This period equals 168–171; previous equals them with the preceding range (built, verified). |
| `income.monthly` | Monthly income, expenses and net profit | bar | q213 | model 186 Income Events | none | MBQL on model 186: sum Income, sum Expenses and sum (Income − Expenses) by Date month, the previous five complete months plus the current month (partial). One shared y-axis so expenses read at true scale. | Each month equals the model 186 month sums (built, verified). |
| `cashflow.by-type-row` | Cash movement by transaction type · chart | row | q203 | snippet 3 Cashflow statement period (same query as question 203) | statement-period, account | Question 203's query wrapped: TOTAL row and rows with no movement removed, ordered by Money In + Money Out descending. Horizontal bars of Money In (green) and Money Out (red), stacked (stackable.stack_type = stacked): on this version Metabase folds unstacked row-chart categories into "Other (n)" regardless of graph.max_categories_enabled; each type moves money one way, so stacking changes nothing visually. | Row set equals question 203 without TOTAL and zero rows, for three period/account cases. |
| `perf.vs-previous` | This period and the previous period | table | q217 | models 71 Repayment Ledger and 70 Loan Book (pattern of questions 217–219) | period | Native: for the selected Period and the preceding period of equal length, one row per measure: Gross interest, Principal issued, Loans issued, Principal returned and Net principal deployed (issued − returned), with This period, Previous period, Change and Change %. Same date rules as questions 217–219. | Rows 1–3 equal 217–219 (built, verified); row 5 equals question 234 for the same Period; previous equals the preceding range. |
| `borrowers.principal-top5` | Principal outstanding by borrower · top five + others | row | q285 | view reporting_borrower_directory_v1 (same query as question 285) | population | Question 285's query with rank<=10 changed to rank<=5 (both occurrences) and the label 'Others' replaced by 'Others ('\|\|(SELECT count(*) FROM ranked WHERE rank>5 AND coalesce(outstanding_principal,0)<>0)\|\|')' (n counts only borrowers with a non-zero amount). Template tag population copied verbatim; maps `population` as 285 maps bp-population. | Sum of bars equals the sum of question 285's bars; the five named bars equal 285's first five, for two Population values. |
| `borrowers.interest-top5` | Interest received · period by borrower · top five + others | row | q286 | function reporting_borrower_period_v1 (same query as question 286) | period, population | Question 286's query with the same two edits as borrowers.principal-top5, the count being (SELECT count(*) FROM ranked WHERE rank>5 AND coalesce(interest_received,0)<>0). Template tags period and population copied verbatim; maps `period` and `population` as 286 maps bp-period and bp-population. | Sum of bars equals the sum of question 286's bars; named bars equal 286's first five, for two Periods. |
| `collection.people` | People paid today · x of n | scalar | q239 | model 162 Collection Status Summary | none | Text scalar "<fully paid> of <people with a status today> paid" from model 162 Borrower Count. Replaces the percent card 239 with the prototype's wording. | First number equals question 246; first ÷ second equals question 239. |
| `collection.board` | Collection board · lanes summary | table | q242 | model 162 Collection Status Summary | none | One row per lane in board order (🔴 Not paid, 🟠 Partially paid, 🟣 Overdue, 🟢 Fully paid; all four always present, zero when empty) plus one row per unexpected status (⚪), with People, Left ฿ and Received ฿ from model 162, plus a hidden Tint column that drives an even row tint. Replaces the four count chips and the Unclassified card. | People per lane equal questions 242, 244, 240, 246; the ⚪ rows' People sum equals question 251; Left ฿ per lane equals the sum of that lane table's Left column. |
| `collection.lane-not-paid` | 🔴 Not paid · lane | table | q243 | model 77 Collection Worklist | none | MBQL on model 77 filtered Daily Collection Status = 'Not Paid'; fields ['Borrower', 'Amount Due', 'Amount Remaining', 'Borrower ID', 'Daily Collection Status']; ORDER BY Amount Remaining desc, Borrower asc. Same rows as question 243, resorted. Column titles Name / Due / Left; widths [80, 76, 76] px for the three visible columns. | Same Borrower set and the same values per borrower as question 243 (order differs). |
| `collection.lane-partial` | 🟠 Partially paid · lane | table | q245 | model 77 Collection Worklist | none | MBQL on model 77 filtered Daily Collection Status = 'Partially Paid'; fields ['Borrower', 'Receipts Today', 'Amount Remaining', 'Borrower ID', 'Daily Collection Status']; ORDER BY Amount Remaining desc, Borrower asc. Same rows as question 245, resorted. Column titles Name / Paid / Left; widths [80, 76, 76] px for the three visible columns. | Same Borrower set and the same values per borrower as question 245 (order differs). |
| `collection.lane-overdue` | 🟣 Overdue · lane | table | q241 | model 77 Collection Worklist | none | MBQL on model 77 filtered Daily Collection Status = 'Overdue'; fields ['Borrower', 'Overdue Amount', 'Amount Remaining', 'Borrower ID', 'Daily Collection Status']; ORDER BY Overdue Amount desc, Borrower asc. Same rows as question 241, resorted. Column titles Name / Overdue / Left; widths [72, 90, 70] px for the three visible columns. | Same Borrower set and the same values per borrower as question 241 (order differs). |
| `collection.lane-paid` | 🟢 Fully paid · lane | table | q247 | model 77 Collection Worklist | none | MBQL on model 77 filtered Daily Collection Status = 'Fully Paid'; fields ['Borrower', 'Receipts Today', 'Amount Due', 'Borrower ID', 'Daily Collection Status']; ORDER BY Receipts Today desc, Borrower asc. Same rows as question 247, resorted. Column titles Name / Paid / Due; widths [80, 76, 76] px for the three visible columns. | Same Borrower set and the same values per borrower as question 247 (order differs). |
| `partners.statement` | Partner positions · statement | table | q330 | model 318 Partners · position source (same query as question 330) | partner | Question 330's query as a CTE, unpivoted to (Measure, Partner, Amount ฿) for the five statement measures Net capital, Net earned to date, Completed payouts, Pending settlements, Net available; shown pivoted (measures as rows, partners as columns) with table.pivot. Template tags partner and #318 copied; maps `partner` as 330 maps pt-partner. If table.pivot does not render for a native result on this version, the fallback is question 330 reused with columns limited to Partner and the five measures. | Every (Measure, Partner) cell equals the matching column of question 330 for the same Partner filter. |
| `partners.capital-share-row` | Capital share · full pool | row | q331 | model 318 Partners · position source (same query as question 331) | partner | Question 331's query with Capital share % (each row's share of the rows) as the plotted value. | Rows equal question 331 (built, verified). |

### 1 · Today (`today`)

Replaces: 1 · Overview (tab 4). Filters: `period`. Height 30 grid rows, 14 placements (12 visuals).

The first page every day: cash available, principal at work, interest this month against the projection, collection progress, what needs attention, and the two trends that explain the month.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 18×2 | text card | **Today** · live on refresh · trends from completed-day snapshots. | vs text.align_vertical=top |  |
| 0/18 | 6×2 | reuse q257 | As of · Bangkok |  |  |
| 2/0 | 6×3 | reuse q49 | Cash available |  |  |
| 2/6 | 6×3 | new `today.principal-smart` | Principal at work |  |  |
| 2/12 | 6×3 | reuse q51 | Interest this month |  |  |
| 2/18 | 6×3 | reuse q237 | Collected today |  |  |
| 5/0 | 12×3 | new `today.realization` | Interest this month · of projection |  |  |
| 5/12 | 12×3 | new `today.collection-rate` | Today's charges · paid |  |  |
| 8/0 | 24×6 | new `today.attention` | Needs attention · rows open pages |  |  |
| 14/0 | 12×7 | reuse q62 | Principal at work · daily close | vs graph.show_goal=True, graph.goal_value=120000, graph.goal_label=Principal reference 120,000, graph.show_values=False, graph.colors=['#509EE3'] | goal line = principal reference 120,000; series blue (red is a status colour) |
| 14/12 | 12×7 | reuse q222 | Daily gross interest · 7-day average | vs graph.show_goal=True, graph.goal_value=10000, graph.goal_label=Daily interest goal 10,000, graph.show_values=False | goal line = daily interest goal 10,000; value labels off so they do not collide with the goal label |
| 21/0 | 12×7 | new `today.principal-top4` | Principal by borrower · top 4 + others |  |  |
| 21/12 | 12×7 | new `today.interest-top4` | Interest 30d by borrower · top 4 + rest |  |  |
| 28/0 | 24×2 | text card | Profit = gross interest before expenses · definitions in card descriptions. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q47, q50, q52, q54, q55, q56, q57, q58, q59, q63, q64, q68, q60, q61, q240, q254, q242, q244, q270, q251 (the saved questions are kept; nothing is deleted).

Phone: Eleven cards instead of eighteen: header, As of, four numbers, two meters, the attention strip (one card), then the four charts, in this order. Metabase stacks one card per row below about 760 px, in grid order, with fixed heights by display type; the prototype's phone order (Collected today first) and its side-by-side pairs cannot be expressed, so the desktop order is the phone order.


### 2 · Cash Position (`cash-position`)

Replaces: 2 · Cash Position (tab 14). Filters: `position-date`, `period`. Height 26 grid rows, 10 placements (8 visuals).

Where the money is on a chosen date: pool, principal, lending capital and net cash, by holder and account, with the completed-day trend.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Cash position** · Date = today is live, a past date is the snapshot. | vs text.align_vertical=top |  |
| 2/0 | 6×3 | new `cash.pool-selected` | Total cash pool |  |  |
| 2/6 | 6×3 | new `cash.principal-selected` | Principal outstanding |  |  |
| 2/12 | 6×3 | reuse q207 | Remaining lending capital |  |  |
| 2/18 | 6×3 | reuse q208 | Net cash balance |  |  |
| 5/0 | 8×6 | reuse q68 | Capital deployed · live |  |  |
| 5/8 | 16×6 | reuse q210 | Net cash by holder · selected date |  |  |
| 11/0 | 24×6 | reuse q211 | Account balances · selected date |  |  |
| 17/0 | 24×7 | reuse q202 | Daily closing positions · completed days | filters period |  |
| 24/0 | 24×2 | text card | Unknown openings stay blank · source and freshness: Data health tab. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q47, q48, q209 (the saved questions are kept; nothing is deleted).

Phone: Four numbers, gauge, holder chart, account table, trend, in that order; nothing to merge.


### 3 · Income (`income`)

Replaces: 3 · Income Statement (tab 16). Filters: `statement-period`. Height 35 grid rows, 11 placements (9 visuals).

Income − expenses = net profit for the statement period, compared with the previous period and the previous months, with expense categories and detail.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Income statement** · live · net profit = gross interest − expenses. | vs text.align_vertical=top |  |
| 2/0 | 8×3 | reuse q168 | Income · gross interest |  |  |
| 2/8 | 8×3 | new `income.expenses` | − Expenses |  |  |
| 2/16 | 8×3 | reuse q170 | = Net profit |  |  |
| 5/0 | 16×6 | new `income.vs-previous` | This period and the previous period |  | height fits the four measure rows |
| 5/16 | 8×6 | reuse q171 | Net profit per day · calendar days |  |  |
| 11/0 | 16×8 | new `income.monthly` | Monthly income, expenses and net profit |  |  |
| 11/16 | 8×8 | reuse q178 | Expenses by category · this period |  |  |
| 19/0 | 24×7 | reuse q213 | Daily income and expenses · snapshots |  |  |
| 26/0 | 24×7 | reuse q212 | Expense detail · this period |  |  |
| 33/0 | 24×2 | text card | Per-day average uses calendar days · freshness: Data health tab. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q184, q204, q214, q169 (the saved questions are kept; nothing is deleted).

Phone: Equation band stacks vertically with the − and = in the titles; comparison table, per-day number, charts, tables.


### 4 · Cashflow (`cashflow`)

Replaces: 4 · Cashflow Statement (tab 15). Filters: `statement-period`, `account`. Height 41 grid rows, 11 placements (9 visuals).

Opening + money in − money out = closing for the period and account, movement by type, the daily movement and the transaction list.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Cashflow statement** · live · All accounts nets transfers to zero. | vs text.align_vertical=top |  |
| 2/0 | 6×3 | reuse q195 | Opening cash |  |  |
| 2/6 | 6×3 | reuse q192 | + Money in |  |  |
| 2/12 | 6×3 | reuse q193 | − Money out |  |  |
| 2/18 | 6×3 | reuse q197 | = Closing cash |  |  |
| 5/0 | 6×3 | reuse q194 | Net cash movement |  |  |
| 5/6 | 18×7 | new `cashflow.by-type-row` | Cash movement by transaction type |  |  |
| 12/0 | 24×10 | reuse q203 | Movement by transaction type · table |  | height fits all nine type rows |
| 22/0 | 24×7 | reuse q215 | Daily cash movement · completed days | vs graph.show_values=False | value labels off: they overlapped |
| 29/0 | 24×10 | reuse q196 | Transactions · chronological |  |  |
| 39/0 | 24×2 | text card | Repayments keep their recorded type · freshness: Data health tab. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q198, q216 (the saved questions are kept; nothing is deleted).

Phone: Equation band stacks; chart, type table, daily chart, transactions; tables scroll sideways (no phone column set exists in Metabase).


### 5 · Performance (`performance`)

Replaces: 5 · Performance (tab 18). Filters: `period`. Height 49 grid rows, 19 placements (15 visuals).

Lending results for the period: interest, principal issued and returned, loans issued, cohort return, with the daily and weekly trends.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Performance** · totals live · trends from snapshots · Period sets dates. | vs text.align_vertical=top |  |
| 2/0 | 6×3 | reuse q217 | Gross interest |  |  |
| 2/6 | 6×3 | reuse q218 | Principal issued |  |  |
| 2/12 | 6×3 | reuse q219 | Loans issued |  |  |
| 2/18 | 6×3 | reuse q235 | Loan-cohort return |  |  |
| 5/0 | 24×7 | new `perf.vs-previous` | This period and the previous period |  | five measure rows incl. Net principal deployed (formerly card 234) |
| 12/0 | 12×7 | reuse q223 | Principal issued and returned · daily |  |  |
| 12/12 | 12×7 | reuse q222 | Daily gross interest · 7-day average | vs graph.show_goal=True, graph.goal_value=10000, graph.goal_label=Daily interest goal 10,000, graph.show_values=False |  |
| 19/0 | 24×1 | heading card | Lending volume |  |  |
| 20/0 | 8×6 | reuse q220 | Gross interest by loan type |  |  |
| 20/8 | 8×6 | reuse q224 | Loans issued per day |  |  |
| 20/16 | 8×6 | reuse q225 | Average loan size · per week |  |  |
| 26/0 | 24×1 | heading card | Returns |  |  |
| 27/0 | 12×6 | reuse q232 | Daily capital yield |  |  |
| 27/12 | 12×6 | reuse q233 | Weekly loan-cohort return |  |  |
| 33/0 | 12×6 | reuse q230 | Cumulative gross interest · 7-day avg |  |  |
| 33/12 | 12×6 | reuse q226 | Active loans and borrowers · end of day |  |  |
| 39/0 | 24×8 | reuse q227 | Daily performance · snapshots |  |  |
| 47/0 | 24×2 | text card | Principal counts once per loan · coverage rules: Data health tab. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q221, q228, q231, q234 (the saved questions are kept; nothing is deleted).

Phone: Four numbers (six columns each, so they stay uncompacted), the comparison table, then the charts in pairs order.


### 6 · Borrowers (`borrowers`)

Replaces: 6 · Borrowers (tab 104) and 9 · Risks (tab 8). Filters: `period`, `population`. Height 47 grid rows, 20 placements (16 visuals).

Who holds the principal and who pays the interest, lifetime returns, concentration and ageing (from the former Risks tab), and the comparison table that opens Borrower Detail.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Borrowers** · live · positions ignore Period, activity uses it. | vs text.align_vertical=top |  |
| 2/0 | 6×3 | reuse q278 | Active borrowers |  |  |
| 2/6 | 6×3 | reuse q279 | Active loans |  |  |
| 2/12 | 6×3 | reuse q280 | Principal outstanding |  |  |
| 2/18 | 6×3 | reuse q281 | Interest received · period |  |  |
| 5/0 | 8×8 | new `borrowers.principal-top5` | Principal outstanding · top 5 + others | filters population |  |
| 5/8 | 8×8 | new `borrowers.interest-top5` | Interest · period · top 5 + others |  |  |
| 5/16 | 8×8 | reuse q314 | Lifetime return · top 8 |  |  |
| 13/0 | 24×1 | heading card | Concentration & ageing |  |  |
| 14/0 | 6×3 | reuse q110 | Top three concentration |  |  |
| 17/0 | 6×3 | reuse q111 | Past-due amount |  |  |
| 14/6 | 9×6 | reuse q115 | Active principal by age |  |  |
| 14/15 | 9×6 | reuse q117 | Default loss over time |  |  |
| 20/0 | 12×6 | reuse q114 | Active loan count by age |  |  |
| 20/12 | 12×6 | reuse q116 | Borrower risk · excl. largest exposure |  |  |
| 26/0 | 24×11 | reuse q289 | Borrower comparison · names open Detail | vs table.column_widths=[104, 150], column_settings={'["name", "BCG Matrix category"]': {'column_title': 'Category'}}; columns Borrower › BCG Matrix category › Current health › Active loans › Principal ฿ › Interest ฿ › Lifetime interest return › Last payment; hide Borrower ID, Period start, Period end, Principal share | category and health columns first; Principal share hidden so the eight leading columns fit at 1440 px; sorted by principal (saved order) |
| 37/0 | 24×1 | heading card | Activity over time |  |  |
| 38/0 | 12×7 | reuse q287 | Interest over time · top 5 + others |  |  |
| 38/12 | 12×7 | reuse q288 | First and repeat loans · weekly | vs  | short legend labels so the phone legend is not clipped; keys are the series names (COLUMN_n if the placement is visualizer-format) |
| 45/0 | 24×2 | text card | Gross interest before expenses · categories from Borrower Health. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q282, q283, q284, q311, q312, q313, q315, q48, q81, q112, q113, q118, q285, q286 (the saved questions are kept; nothing is deleted).

Phone: Four numbers, three ranked bars, concentration numbers and charts, comparison table (scrolls), activity charts.


### 7 · Borrower Health (`health`)

Replaces: 7 · Borrower Health Review (tab 31). Filters: none. Height 81 grid rows, 20 placements (17 visuals).

The payment-behaviour × contribution matrix and the category lists, with the rating detail below.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 12×2 | text card | **Borrower Health** · current portfolio · names open Borrower Detail. | vs text.align_vertical=top |  |
| 0/12 | 6×2 | reuse q270 | Modified plans |  |  |
| 0/18 | 6×2 | reuse q257 | As of · Bangkok |  |  |
| 2/0 | 6×3 | reuse q253 | Active borrowers |  |  |
| 2/6 | 6×3 | reuse q254 | Overdue ฿ · all borrowers |  |  |
| 2/12 | 6×3 | reuse q255 | Provisional · active |  |  |
| 2/18 | 6×3 | reuse q256 | Unclassified · active |  |  |
| 5/0 | 24×20 | live dashcard 1501 (iframe, copied verbatim) | Custom BCG matrix |  |  |
| 25/0 | 6×2 | reuse q260 | Star |  |  |
| 25/6 | 6×2 | reuse q258 | Cash Cow |  |  |
| 25/12 | 6×2 | reuse q264 | Question Mark |  |  |
| 25/18 | 6×2 | reuse q262 | Dog |  |  |
| 27/0 | 24×9 | reuse q275 | Borrowers by category · scores | vs table.column_widths=[168]; columns Category › Borrower › Payment score /100 › Contribution × › Schedule; hide Borrower ID | column order: Category, Borrower, Score, Contribution, Schedule, then detail; sorted by category |
| 36/0 | 24×1 | heading card | Rating detail |  |  |
| 37/0 | 24×10 | reuse q267 | Payment health · all borrowers | vs table.column_widths=[0, 0, 0, 0, 0, 0, 0, 0, 0, 148] | Category column (10th) wide enough for "Outside active cohort"; 0 = auto |
| 47/0 | 24×6 | reuse q269 | Unavailable ratings and default context | hide when empty |  |
| 53/0 | 24×10 | reuse q268 | Reliability components and weights |  |  |
| 63/0 | 24×8 | reuse q271 | Schedule assessment · active borrowers |  |  |
| 71/0 | 24×8 | reuse q272 | Modified schedules · loan and next plan | hide when empty |  |
| 79/0 | 24×2 | text card | Rating weights 45 / 15 / 15 / 25 · threshold 80 · boundary 1× · dictionary. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q259, q261, q263, q265 (the saved questions are kept; nothing is deleted).

Phone: Header, numbers, matrix, category counts, tables. Metabase gives the matrix iframe a fixed 6-unit height on a phone, so it is small there; the chart service page it embeds stays the full-size view (impossible to change from the dashboard).


### 8 · Borrower Detail (`borrower-detail`)

Replaces: 8 · Borrower Detail (tab 105). Filters: `borrower`, `period`, `scenario-amount`. Height 103 grid rows, 37 placements (30 visuals).

One borrower: profile, current and lifetime position, charge lights, activity in the period, the three working tables, the evidence tables and the lending scenario.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Borrower Detail** · select one borrower · Period applies to activity. | vs text.align_vertical=top |  |
| 2/0 | 24×4 | reuse q290 | Profile · current position |  |  |
| 6/0 | 6×3 | reuse q378 | Category · BCG matrix |  |  |
| 6/6 | 6×3 | reuse q293 | Overdue ฿ |  |  |
| 6/12 | 6×3 | reuse q294 | Portfolio share |  |  |
| 6/18 | 6×3 | reuse q292 | Active loans |  |  |
| 9/0 | 24×1 | heading card | Active loans · lifetime receipts / current principal |  |  |
| 10/0 | 8×3 | reuse q291 | Current principal ฿ |  |  |
| 10/8 | 8×3 | reuse q370 | Outstanding ฿ |  |  |
| 10/16 | 8×3 | reuse q371 | Interest earned ฿ |  |  |
| 13/0 | 8×3 | reuse q372 | After coverage ฿ |  |  |
| 13/8 | 8×3 | reuse q373 | Return % |  |  |
| 13/16 | 8×3 | reuse q374 | Coverage date |  |  |
| 16/0 | 24×1 | heading card | Closed loans · lifetime |  |  |
| 17/0 | 8×3 | reuse q375 | Original principal ฿ |  |  |
| 17/8 | 8×3 | reuse q376 | Interest earned ฿ |  |  |
| 17/16 | 8×3 | reuse q377 | Return on closed loans |  |  |
| 20/0 | 24×5 | reuse q369 | Last seven charge dates |  |  |
| 25/0 | 24×1 | heading card | Activity · selected period |  |  |
| 26/0 | 6×3 | reuse q296 | Interest received ฿ |  |  |
| 26/6 | 6×3 | reuse q297 | Principal issued ฿ |  |  |
| 26/12 | 6×3 | reuse q298 | Principal returned ฿ |  |  |
| 26/18 | 6×3 | reuse q299 | Loans issued |  |  |
| 29/0 | 12×7 | reuse q301 | Principal issued and returned |  |  |
| 29/12 | 12×7 | reuse q302 | Interest received over time |  |  |
| 36/0 | 24×8 | reuse q303 | Active loans and recorded next plan |  |  |
| 44/0 | 24×7 | reuse q308 | All current overdue obligations |  |  |
| 51/0 | 24×8 | reuse q305 | Loan history · lifetime |  |  |
| 59/0 | 24×4 | reuse q316 | Payment punctuality · selected due dates |  |  |
| 63/0 | 24×7 | reuse q304 | Punctuality over time · due month |  |  |
| 70/0 | 24×1 | heading card | Records · selected period |  |  |
| 71/0 | 24×8 | reuse q307 | Obligation evidence · selected due dates |  |  |
| 79/0 | 24×8 | reuse q317 | Payments · selected payment dates |  |  |
| 87/0 | 24×8 | reuse q306 | Repayment allocations · payment dates |  |  |
| 95/0 | 24×1 | heading card | Additional lending scenario · hypothetical only |  |  |
| 96/0 | 24×5 | reuse q309 | Additional lending · hypothetical only |  |  |
| 101/0 | 24×2 | text card | Allocations are not unique receipts · corrections stay signed. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q300 (the saved questions are kept; nothing is deleted).

Phone: Profile first, then every number card one per row (30 visuals; Metabase cannot pair them), charge lights, tables that scroll. Select a borrower first; all cards are empty until then.


### 9 · Collection (`collection`)

Replaces: 10 · Collection Monitor (tab 19). Filters: `collection-borrower`, `collection-status`. Height 41 grid rows, 15 placements (13 visuals).

Today's collection board: progress, the four status lanes, the detail table and today's charges.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 18×2 | text card | **Collection · today** · live · filters apply to the detail table only. | vs text.align_vertical=top |  |
| 0/18 | 6×2 | reuse q257 | As of · Bangkok |  |  |
| 2/0 | 6×3 | reuse q237 | Collected today |  |  |
| 2/6 | 6×3 | reuse q238 | Left to collect |  |  |
| 2/12 | 6×3 | new `collection.people` | People paid today |  |  |
| 2/18 | 6×3 | reuse q252 | Today's charges · paid % |  |  |
| 5/0 | 24×6 | new `collection.board` | Board · people and baht per lane |  |  |
| 11/0 | 6×9 | new `collection.lane-not-paid` | 🔴 Not paid |  | Due ฿ · Left ฿, sorted by amount left |
| 11/6 | 6×9 | new `collection.lane-partial` | 🟠 Partially paid |  | Received ฿ · Left ฿, sorted by amount left |
| 11/12 | 6×9 | new `collection.lane-overdue` | 🟣 Overdue |  | Overdue ฿ · Left ฿, sorted by overdue amount |
| 11/18 | 6×9 | new `collection.lane-paid` | 🟢 Fully paid |  | Received ฿ · Due ฿, sorted by received |
| 20/0 | 24×10 | reuse q248 | Collection detail · filters apply here | columns Borrower › Daily Collection Status › Amount Remaining › Amount Due › Amount Collected › Receipts Today › Overdue Amount; hide Borrower ID |  |
| 30/0 | 24×3 | reuse q249 | Charges dated today · not board balances |  |  |
| 33/0 | 24×6 | reuse q64 | Overdue charges · completed days | filters none |  |
| 39/0 | 24×2 | text card | Received = receipts today · Left includes older dues · refresh moves lanes. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q250, q239, q242, q244, q240, q246, q251, q243, q245, q241, q247 (the saved questions are kept; nothing is deleted).

Phone: Thirteen cards instead of eighteen: As of, four numbers, the board strip, the four lanes in the order Not paid, Partially paid, Overdue, Fully paid, the detail table, charges today, the overdue trend. The lane tables carry three visible columns so they fit a phone without a phone-specific column set.


### 10 · Partners (`partners`)

Replaces: 11 · Partners (tab 249). Filters: `partner`, `statement-period`, `settlement-status`. Height 57 grid rows, 20 placements (16 visuals).

Each partner's capital, earnings, payouts, pending settlements and net available, the activity in the period and the ledgers.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Partners** · balances stay current · net available is not cash on hand. | vs text.align_vertical=top |  |
| 2/0 | 6×3 | reuse q325 | Net capital ฿ |  |  |
| 2/6 | 6×3 | reuse q326 | Net earned to date ฿ |  |  |
| 2/12 | 6×3 | reuse q327 | Completed payouts ฿ |  |  |
| 2/18 | 6×3 | reuse q329 | Net available ฿ |  |  |
| 5/0 | 16×7 | new `partners.statement` | Partner positions · statement |  | pending settlements per partner sit here and in the table below |
| 5/16 | 8×7 | new `partners.capital-share-row` | Capital share · full pool |  |  |
| 12/0 | 24×6 | reuse q340 | Pending settlements · all dates | hide when empty |  |
| 18/0 | 24×1 | heading card | Activity · statement period |  |  |
| 19/0 | 6×3 | reuse q333 | Allocated interest ฿ |  |  |
| 19/6 | 6×3 | reuse q334 | Allocated expenses ฿ |  |  |
| 19/12 | 6×3 | reuse q335 | Net earned ฿ |  |  |
| 19/18 | 6×3 | reuse q336 | Payouts in period ฿ |  |  |
| 22/0 | 12×8 | reuse q337 | Monthly net earned versus paid |  |  |
| 22/12 | 12×8 | reuse q338 | Capital contributions and withdrawals |  |  |
| 30/0 | 24×8 | reuse q339 | Net contributed capital over time |  |  |
| 38/0 | 24×1 | heading card | Ledgers · statement period |  |  |
| 39/0 | 24×8 | reuse q341 | Capital transaction ledger | hide when empty |  |
| 47/0 | 24×8 | reuse q342 | Settlement transaction ledger | hide when empty |  |
| 55/0 | 24×2 | text card | Withdrawals and payouts are separate · checks: Data health tab. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q331, q332, q343, q328, q330 (the saved questions are kept; nothing is deleted).

Phone: Four numbers (six columns each so 7-digit baht stay uncompacted), the statement table, share chart, then activity; empty ledgers are hidden.


### 11 · Forecast & Plan (`forecast`)

Replaces: 12 · Forecast & Planning (tab 262). Filters: `scenario`, `interest-collected`, `principal-collected`, `overdue-recovered`, `loan-kind`, `target`, `plan-lending`, `plan-expenses`, `plan-withdrawals`, `plan-inflows`, `plan-reserve`. Height 59 grid rows, 22 placements (18 visuals).

Interest outlook for the current month under one scenario, the drivers and the watchlist, then the cash plan with its inputs checklist and month-end bridge.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Forecast & Plan · this month** · scenarios are assumptions, not promises. | vs text.align_vertical=top |  |
| 2/0 | 24×3 | reuse q353 | Scenario and assumptions in force | columns ; hide Calculated at |  |
| 5/0 | 24×1 | heading card | Interest outlook |  |  |
| 6/0 | 6×3 | reuse q348 | Interest · month to date |  |  |
| 6/6 | 6×3 | reuse q349 | Remaining · scenario |  |  |
| 6/12 | 6×3 | reuse q350 | Month-end outlook |  |  |
| 6/18 | 6×3 | reuse q351 | Target gap |  |  |
| 9/0 | 16×9 | reuse q356 | Cumulative interest · actual + projected |  |  |
| 9/16 | 8×9 | reuse q355 | Month-end by scenario |  |  |
| 18/0 | 24×8 | reuse q360 | Watchlist · dues at risk |  |  |
| 26/0 | 12×8 | reuse q357 | Upcoming dues · remaining weeks |  |  |
| 26/12 | 12×8 | reuse q354 | Interest outlook bridge |  |  |
| 34/0 | 12×7 | reuse q358 | Borrower forecast contribution |  |  |
| 34/12 | 12×7 | reuse q359 | Interest by loan type |  |  |
| 41/0 | 24×1 | heading card | Cash plan · whole portfolio |  |  |
| 42/0 | 6×3 | reuse q365 | Business cash now ฿ |  |  |
| 42/6 | 6×3 | reuse q352 | Principal receipts |  |  |
| 42/12 | 6×3 | reuse q366 | Month-end cash ฿ |  |  |
| 42/18 | 6×3 | reuse q367 | Reserve shortfall ฿ |  |  |
| 45/0 | 24×4 | reuse q364 | Plan inputs and status |  | Plan not ready until all five inputs are set; blank results until then |
| 49/0 | 24×8 | reuse q368 | Month-end cash bridge |  |  |
| 57/0 | 24×2 | text card | Recorded before simulated · planned lending adds no income · not a minimum. | vs text.align_vertical=top |  |

Dropped from dashboard 3 (or replaced by a new question): q361, q362, q363 (the saved questions are kept; nothing is deleted).

Phone: Assumptions, four numbers, cumulative chart first among charts, watchlist, plan numbers, inputs above the bridge; one card per row.


### 12 · Data health (`data-health`)

Replaces: new tab; cards moved from tabs 14, 16, 15, 18, 104, 105, 249 and 262. Filters: `statement-period`, `account`, `period`, `position-date`, `population`, `borrower`, `partner`, `scenario`, `interest-collected`, `principal-collected`, `overdue-recovered`, `loan-kind`, `target`. Height 86 grid rows, 26 placements (18 visuals).

Freshness, coverage, source and calculation checks for every page, in page order, so the business pages stay clean and the checks stay one click away.

| Row/col | Size | Source | Title on the page | Placement settings | Notes |
| --- | --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Data health** · freshness, coverage and source checks per page. | vs text.align_vertical=top |  |
| 2/0 | 12×3 | reuse q276 | Reporting connection · SELECT 1 |  |  |
| 2/12 | 12×3 | reuse q257 | Queried at · Bangkok |  |  |
| 5/0 | 24×1 | heading card | Cash Position |  |  |
| 6/0 | 24×6 | reuse q209 | Cash position · source and freshness |  |  |
| 12/0 | 24×1 | heading card | Income |  |  |
| 13/0 | 12×6 | reuse q184 | Income period and freshness |  |  |
| 13/12 | 12×6 | reuse q214 | Profit trend snapshot freshness |  |  |
| 19/0 | 24×1 | heading card | Cashflow |  |  |
| 20/0 | 12×8 | reuse q198 | Cashflow period and freshness |  |  |
| 20/12 | 12×8 | reuse q216 | Cash trend snapshot freshness |  |  |
| 28/0 | 24×1 | heading card | Performance |  |  |
| 29/0 | 8×7 | reuse q221 | Live period and source |  |  |
| 29/8 | 16×7 | reuse q228 | Snapshot coverage and generation times |  |  |
| 36/0 | 24×4 | reuse q231 | Rolling-average coverage |  |  |
| 40/0 | 24×1 | heading card | Borrowers and Borrower Detail |  |  |
| 41/0 | 12×4 | reuse q284 | Period, population and source |  |  |
| 41/12 | 12×4 | reuse q315 | Overall charts · dates and availability |  |  |
| 45/0 | 24×5 | reuse q300 | Activity dates and lifetime context |  |  |
| 50/0 | 24×1 | heading card | Partners |  |  |
| 51/0 | 12×7 | reuse q332 | How net available is calculated |  |  |
| 51/12 | 12×7 | reuse q343 | Source and balance checks |  |  |
| 58/0 | 24×1 | heading card | Forecast |  |  |
| 59/0 | 24×7 | reuse q363 | Forecast coverage and exceptions |  |  |
| 66/0 | 24×10 | reuse q361 | Loan forecast detail |  |  |
| 76/0 | 24×10 | reuse q362 | Recorded and simulated obligations |  |  |

Dropped from dashboard 3 (or replaced by a new question): q250 (the saved questions are kept; nothing is deleted).

Phone: Reference only; tables scroll.

<!-- GENERATED:END -->

## Phone behaviour

Metabase stacks dashboard cards to one column below about 760 px, in placement order, with a fixed height per display type; there is no phone-specific layout, pairing or column set. The row order above is therefore the phone order, and the daily pages (Today, Collection) are built with fewer cards (strips and board tables instead of chips) so that a phone reaches the charts and lanes within a few screens. Tables show the saved question's visible columns on every device; the lane tables carry three columns for that reason.

## Out of scope

- No model, snippet, view or migration change. If a new question cannot be expressed on an existing model, the design is wrong, not the model.
- No change to dashboard 3, its questions or its filters.
- No chart service change; the matrix iframe is reused.
- Cutover (renaming, retiring tabs on dashboard 3, redirecting links) is decided after the comparison and is not part of this build.
