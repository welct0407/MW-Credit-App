# Loan Reports redesign — detailed design

26 October 2026. Detailed design for the proposed Loan Reports pages, to be built as a **parallel dashboard** beside the live `Loan Reports` (dashboard 3) for owner review and comparison. The review that led here is in [REVIEW.md](REVIEW.md); the execution plan is in [PLAN.md](PLAN.md); the machine-readable layout is [layout.json](layout.json), generated together with the tables below by [build_design.py](build_design.py). Prototype boards: [Loan Reports Redesign canvas](https://claude.ai/artifact/Tc1u8rq11FLfhiAb2rbvut) (illustrative figures).

## Principles

1. **Reuse first.** Every card that exists on dashboard 3 is placed again by `card_id` with, at most, a title override on the placement. The 25 governed models, the four snippets and the saved questions are unchanged. New questions are added only where the page needs a view no saved question gives (ten, listed below), and each is a thin query on an existing model or an existing snippet pattern.
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

Allowed on a placement: `card.title`, `card.description`, column visibility/order (`table.columns`), sort, series colours, goal lines (`graph.goal_value`, `graph.goal_label`), progress goal. Not allowed: changing a saved question's query, display type or name. Where a page needs the same query with another display (`cashflow.by-type-row`, `partners.capital-share-row`), a new question is saved in the proposed collection with the copied query and a description that names its origin.

## Custom matrix

The BCG matrix on Borrower Health is live dashcard 1501 (an iframe with a bearer-key fragment). The installer copies that dashcard's `visualization_settings` from the live API at install time and never from Git; the key stays outside the repository as today.

## Generated specification

The tables below are generated from `build_design.py`. Positions are grid row/column on Metabase's 24-column grid; sizes are width × height in grid units. "reuse qNNN" is an existing saved question; "new `key`" is defined in the New questions table.

<!-- GENERATED:START -->
12 tabs, 240 placements, 22 filters, 171 reused saved questions, 10 new questions.

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

| Key | Name | Display | Basis | Filters | Definition |
| --- | --- | --- | --- | --- | --- |
| `today.principal-smart` | Principal at work · change over the period | smartscalar | model 74 Daily Performance | period | MBQL on model 74: Outstanding Principal (max) by Date, filtered by Period on Date. Smart scalar shows the latest completed-day value and the change against the first date in the period. Whole baht. |
| `today.realization` | Interest this month · share of projection | progress | model 73 Portfolio Overview | none | MBQL on model 73: field Forecast Realization (Realized Profit MTD ÷ Projected Monthly Profit). Progress goal 1 shows the share of the projected month collected so far; the card description names the projected amount source. |
| `today.collection-rate` | Collected today · share of amount due | progress | model 73 Portfolio Overview | none | MBQL on model 73: field Amount Collection Rate Today (Amount Collected Today ÷ Amount Due Today). Progress goal 1. Reused on Today and Collection. |
| `cash.pool-selected` | Total cash pool · selected date | scalar | snippet 4 Cash position source routing (models 205, 206, 164, 73) | position-date | Native, same routing as question 207: today reads model 73 Total Cash Pool, a past date reads model 205 Total Cash Pool for that date; blank when no snapshot exists. |
| `cash.principal-selected` | Principal outstanding · selected date | scalar | snippet 4 Cash position source routing (models 205, 73) | position-date | Native, same routing as question 207, selecting Outstanding Principal. |
| `income.vs-previous` | This period and the previous period | table | snippet 2 Income statement period (model 186 Income Events) | statement-period | Native: for the selected statement period and the immediately preceding period of equal length, Income, Expenses, Net profit, Days and Net per day, plus change % of each. Two rows (This period, Previous period) and one Change row. Whole baht, one-decimal percent. |
| `income.monthly` | Monthly income, expenses and net profit | bar | model 186 Income Events | none | MBQL on model 186: sum Income, sum Expenses and sum (Income − Expenses) by Date month, filtered to the previous five complete months plus the current month. Current month is partial and labelled "to date" in the card description. |
| `cashflow.by-type-row` | Cash movement by transaction type · chart | row | snippet 3 Cashflow statement period (same query as question 203) | statement-period, account | Native: question 203's query unchanged, displayed as a horizontal bar of Money in and Money out per transaction type. Question 203 stays the table beside it. |
| `perf.vs-previous` | This period and the previous period | table | models 71 Repayment Ledger and 70 Loan Book (pattern of questions 217–219) | period | Native: for the selected Period and the preceding period of equal length, Gross interest, Principal issued, Loans issued and Principal returned, with change %. Same date rules as questions 217–219 (loan dates and payment dates both use the filter). |
| `partners.capital-share-row` | Capital share · full pool | row | model 318 Partners · position source (same query as question 331) | partner | Native: question 331's query unchanged, displayed as a horizontal bar with the share percent as the value label. Replaces the two-slice pie. |

### 1 · Today (`today`)

Replaces: 1 · Overview (tab 4). Filters: `period`. Height 27 grid rows, 21 placements (18 visuals).

The first page every day: cash available, principal at work, interest this month against the projection, collection progress, what needs attention, and the two trends that explain the month.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 18×2 | text card | **Today** · live figures on refresh, Bangkok dates; trends from completed-day snapshots. Gross interest before… |  |
| 0/18 | 6×2 | reuse q257 | As of · Bangkok |  |
| 2/0 | 6×3 | reuse q49 | Cash available |  |
| 2/6 | 6×3 | new `today.principal-smart` | Principal at work |  |
| 2/12 | 6×3 | reuse q51 | Interest this month · realized |  |
| 2/18 | 6×3 | reuse q237 | Collected today |  |
| 5/0 | 8×4 | reuse q68 | Capital deployed · live |  |
| 5/8 | 8×4 | new `today.realization` | Interest this month · share of projection |  |
| 5/16 | 8×4 | new `today.collection-rate` | Collected today · share of amount due |  |
| 9/0 | 24×1 | heading card | Needs attention · chips open Collection and Borrower Health |  |
| 10/0 | 4×2 | reuse q240 | 🟣 Overdue · people |  |
| 10/4 | 4×2 | reuse q254 | Overdue ฿ |  |
| 10/8 | 4×2 | reuse q242 | 🔴 Not paid today |  |
| 10/12 | 4×2 | reuse q244 | 🟠 Partially paid |  |
| 10/16 | 4×2 | reuse q270 | Modified plans |  |
| 10/20 | 4×2 | reuse q251 | Unclassified · expect 0 |  |
| 12/0 | 12×7 | reuse q62 | Principal at work · daily close | goal line = principal reference 120,000 |
| 12/12 | 12×7 | reuse q222 | Daily gross interest · 7-day average | goal line = daily interest goal 10,000 |
| 19/0 | 12×7 | reuse q60 | Principal by borrower · top four + others |  |
| 19/12 | 12×7 | reuse q61 | Interest · past 30 days by borrower |  |
| 26/0 | 24×1 | text card | Card descriptions hold the exact definitions. Profit means gross interest before expenses. |  |

Dropped from dashboard 3: q47, q50, q52, q54, q55, q56, q57, q58, q59, q63, q64 (the saved questions are kept; nothing is deleted).

Phone: Headline cards stack in the order shown; the attention chips wrap two per row; charts stack.


### 2 · Cash Position (`cash-position`)

Replaces: 2 · Cash Position (tab 14). Filters: `position-date`, `period`. Height 26 grid rows, 10 placements (8 visuals).

Where the money is on a chosen date: pool, principal, lending capital and net cash, by holder and account, with the completed-day trend.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Cash position** · Date selects the position (today = live, past dates = hourly snapshot). Lending capital is… |  |
| 2/0 | 6×3 | new `cash.pool-selected` | Total cash pool |  |
| 2/6 | 6×3 | new `cash.principal-selected` | Principal outstanding |  |
| 2/12 | 6×3 | reuse q207 | Remaining lending capital |  |
| 2/18 | 6×3 | reuse q208 | Net cash balance |  |
| 5/0 | 8×6 | reuse q68 | Capital deployed · live |  |
| 5/8 | 16×6 | reuse q210 | Net cash by holder · selected date |  |
| 11/0 | 24×7 | reuse q211 | Account balances · selected date (signed) |  |
| 18/0 | 24×7 | reuse q202 | Daily closing positions · completed days |  |
| 25/0 | 24×1 | text card | Unknown openings stay blank rather than showing current values. Source and freshness: Data health tab. |  |

Dropped from dashboard 3: q47, q48, q209 (the saved questions are kept; nothing is deleted).

Phone: Four numbers stack; holder chart above the account table; trend last.


### 3 · Income (`income`)

Replaces: 3 · Income Statement (tab 16). Filters: `statement-period`. Height 32 grid rows, 11 placements (9 visuals).

Income − expenses = net profit for the statement period, compared with the previous period and the previous months, with expense categories and detail.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Income statement** · live, includes later corrections · daily chart from completed-day snapshots. Net profit… |  |
| 2/0 | 8×3 | reuse q168 | Income · gross interest |  |
| 2/8 | 8×3 | reuse q169 | − Expenses |  |
| 2/16 | 8×3 | reuse q170 | = Net profit |  |
| 5/0 | 16×4 | new `income.vs-previous` | This period and the previous period |  |
| 5/16 | 8×4 | reuse q171 | Net profit per day · calendar days |  |
| 9/0 | 16×8 | new `income.monthly` | Monthly income, expenses and net profit |  |
| 9/16 | 8×8 | reuse q178 | Expenses by category · this period |  |
| 17/0 | 24×7 | reuse q213 | Daily income and expenses · completed days |  |
| 24/0 | 24×7 | reuse q212 | Expense detail · this period |  |
| 31/0 | 24×1 | text card | Per-day average uses calendar days in the period. Period freshness and snapshot coverage: Data health tab. |  |

Dropped from dashboard 3: q184, q204, q214 (the saved questions are kept; nothing is deleted).

Phone: Equation band stacks vertically with the − and = in the titles; tables scroll sideways.


### 4 · Cashflow (`cashflow`)

Replaces: 4 · Cashflow Statement (tab 15). Filters: `statement-period`, `account`. Height 36 grid rows, 11 placements (9 visuals).

Opening + money in − money out = closing for the period and account, movement by type, the daily movement and the transaction list.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Cashflow statement** · live · All accounts nets transfers to zero. Unknown openings show Unavailable. |  |
| 2/0 | 6×3 | reuse q195 | Opening cash |  |
| 2/6 | 6×3 | reuse q192 | + Money in |  |
| 2/12 | 6×3 | reuse q193 | − Money out |  |
| 2/18 | 6×3 | reuse q197 | = Closing cash |  |
| 5/0 | 6×3 | reuse q194 | Net cash movement |  |
| 5/6 | 18×7 | new `cashflow.by-type-row` | Cash movement by transaction type |  |
| 12/0 | 24×6 | reuse q203 | Cash movement by transaction type · table |  |
| 18/0 | 24×7 | reuse q215 | Daily cash movement · completed days |  |
| 25/0 | 24×10 | reuse q196 | Transactions · chronological |  |
| 35/0 | 24×1 | text card | Statement date plus posting time. Repayments keep their recorded type. Freshness: Data health tab. |  |

Dropped from dashboard 3: q198, q216 (the saved questions are kept; nothing is deleted).

Phone: Equation band stacks; the transaction table keeps date, type, amount and account, the rest scroll.


### 5 · Performance (`performance`)

Replaces: 5 · Performance (tab 18). Filters: `period`. Height 45 grid rows, 20 placements (16 visuals).

Lending results for the period: interest, principal issued and returned, loans issued, cohort return, with the daily and weekly trends.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Performance** · totals live · trends from completed-day snapshots · loan dates and interest dates both use P… |  |
| 2/0 | 5×3 | reuse q217 | Gross interest |  |
| 2/5 | 5×3 | reuse q218 | Principal issued |  |
| 2/10 | 4×3 | reuse q219 | Loans issued |  |
| 2/14 | 5×3 | reuse q234 | Net principal deployed |  |
| 2/19 | 5×3 | reuse q235 | Loan-cohort return |  |
| 5/0 | 24×4 | new `perf.vs-previous` | This period and the previous period |  |
| 9/0 | 12×7 | reuse q223 | Principal issued and returned · daily |  |
| 9/12 | 12×7 | reuse q222 | Daily gross interest · 7-day average |  |
| 16/0 | 24×1 | heading card | Lending volume |  |
| 17/0 | 8×6 | reuse q220 | Gross interest by loan type |  |
| 17/8 | 8×6 | reuse q224 | Loans issued per day |  |
| 17/16 | 8×6 | reuse q225 | Average loan size · per week |  |
| 23/0 | 24×1 | heading card | Returns |  |
| 24/0 | 12×6 | reuse q232 | Daily capital yield |  |
| 24/12 | 12×6 | reuse q233 | Weekly loan-cohort return |  |
| 30/0 | 12×6 | reuse q230 | Cumulative gross interest · 7-day average |  |
| 30/12 | 12×6 | reuse q226 | Active loans and borrowers · end of day |  |
| 36/0 | 24×8 | reuse q227 | Daily performance · snapshots |  |
| 44/0 | 24×1 | text card | Principal counts once per loan. Snapshot coverage and rolling-average rules: Data health tab. |  |

Dropped from dashboard 3: q221, q228, q231 (the saved questions are kept; nothing is deleted).

Phone: Five headline numbers become two columns; chart pairs stack.


### 6 · Borrowers (`borrowers`)

Replaces: 6 · Borrowers (tab 104) and 9 · Risks (tab 8). Filters: `period`, `population`. Height 46 grid rows, 20 placements (16 visuals).

Who holds the principal and who pays the interest, lifetime returns, concentration and ageing (from the former Risks tab), and the comparison table that opens Borrower Detail.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Borrowers** · live · current positions ignore Period; activity uses it. Population applies everywhere. |  |
| 2/0 | 6×3 | reuse q278 | Active borrowers |  |
| 2/6 | 6×3 | reuse q279 | Active loans |  |
| 2/12 | 6×3 | reuse q280 | Principal outstanding |  |
| 2/18 | 6×3 | reuse q281 | Interest received · period |  |
| 5/0 | 8×8 | reuse q285 | Principal outstanding by borrower |  |
| 5/8 | 8×8 | reuse q286 | Interest received · period by borrower |  |
| 5/16 | 8×8 | reuse q314 | Lifetime interest return on principal lent · top 8 |  |
| 13/0 | 24×1 | heading card | Concentration & ageing |  |
| 14/0 | 6×3 | reuse q110 | Top three concentration |  |
| 14/6 | 6×3 | reuse q111 | Past-due amount |  |
| 14/12 | 12×6 | reuse q117 | Default loss over time |  |
| 20/0 | 8×6 | reuse q114 | Active loan count by age |  |
| 20/8 | 8×6 | reuse q115 | Active principal by age |  |
| 20/16 | 8×6 | reuse q116 | Borrower risk · excluding largest exposure |  |
| 26/0 | 24×11 | reuse q289 | Borrower comparison · click a name for Detail |  |
| 37/0 | 24×1 | heading card | Activity over time |  |
| 38/0 | 12×7 | reuse q287 | Interest received over time · top 5 + others |  |
| 38/12 | 12×7 | reuse q288 | First and repeat loans · weekly |  |
| 45/0 | 24×1 | text card | Gross interest before expenses. Categories come from Borrower Health. Lifetime daily rate (question 313) and t… |  |

Dropped from dashboard 3: q282, q283, q284, q311, q312, q313, q315, q48, q81, q112, q113, q118 (the saved questions are kept; nothing is deleted).

Phone: Headline two per row; ranked bars stack; the comparison table keeps borrower, category, principal and overdue.


### 7 · Borrower Health (`health`)

Replaces: 7 · Borrower Health Review (tab 31). Filters: none. Height 83 grid rows, 20 placements (17 visuals).

The payment-behaviour × contribution matrix and the category lists, with the rating detail below.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 12×2 | text card | **Borrower Health** · current portfolio, refreshed on load · click a name to open Borrower Detail. |  |
| 0/12 | 6×2 | reuse q270 | Modified plans |  |
| 0/18 | 6×2 | reuse q257 | As of · Bangkok |  |
| 2/0 | 6×3 | reuse q253 | Active borrowers |  |
| 2/6 | 6×3 | reuse q254 | Overdue ฿ · all borrowers |  |
| 2/12 | 6×3 | reuse q255 | Provisional · active |  |
| 2/18 | 6×3 | reuse q256 | Unclassified · active |  |
| 5/0 | 24×22 | live dashcard 1501 (iframe, copied verbatim) | Custom BCG matrix |  |
| 27/0 | 6×2 | reuse q260 | Star |  |
| 27/6 | 6×2 | reuse q258 | Cash Cow |  |
| 27/12 | 6×2 | reuse q264 | Question Mark |  |
| 27/18 | 6×2 | reuse q262 | Dog |  |
| 29/0 | 24×9 | reuse q275 | Borrowers by category · scores, schedule and contribution | column order: Category, Borrower, Score, Contribution, Schedule, then detail; sorted by category |
| 38/0 | 24×1 | heading card | Rating detail |  |
| 39/0 | 24×10 | reuse q267 | Payment health · all borrowers |  |
| 49/0 | 24×6 | reuse q269 | Unavailable ratings and default context |  |
| 55/0 | 24×10 | reuse q268 | Reliability components and effective weights · active borrowers |  |
| 65/0 | 24×8 | reuse q271 | Automatic schedule assessment · active borrowers |  |
| 73/0 | 24×8 | reuse q272 | Modified schedules · loan and next-plan detail |  |
| 81/0 | 24×2 | text card | Rating: recent punctuality 45% · older punctuality 15% · average delay 15% · current payment health 25%; thres… |  |

Dropped from dashboard 3: q259, q261, q263, q265 (the saved questions are kept; nothing is deleted).

Phone: The matrix scales to width; category counts two per row; detail tables scroll.


### 8 · Borrower Detail (`borrower-detail`)

Replaces: 8 · Borrower Detail (tab 105). Filters: `borrower`, `period`, `scenario-amount`. Height 99 grid rows, 37 placements (30 visuals).

One borrower: profile, current and lifetime position, charge lights, activity in the period, the three working tables, the evidence tables and the lending scenario.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Borrower Detail** · select one borrower. Lifetime and current sections ignore Period; activity uses it. |  |
| 2/0 | 24×4 | reuse q290 | Profile · current position |  |
| 6/0 | 6×3 | reuse q378 | Category · BCG matrix |  |
| 6/6 | 6×3 | reuse q293 | Overdue ฿ |  |
| 6/12 | 6×3 | reuse q294 | Portfolio share |  |
| 6/18 | 6×3 | reuse q292 | Active loans |  |
| 9/0 | 24×1 | heading card | Active loans · lifetime receipts / current principal |  |
| 10/0 | 4×3 | reuse q291 | Current principal ฿ |  |
| 10/4 | 4×3 | reuse q370 | Outstanding ฿ |  |
| 10/8 | 4×3 | reuse q371 | Interest earned ฿ |  |
| 10/12 | 4×3 | reuse q372 | After coverage ฿ |  |
| 10/16 | 4×3 | reuse q373 | Return % |  |
| 10/20 | 4×3 | reuse q374 | Coverage date |  |
| 13/0 | 24×1 | heading card | Closed loans · lifetime |  |
| 14/0 | 8×3 | reuse q375 | Original principal ฿ |  |
| 14/8 | 8×3 | reuse q376 | Interest earned ฿ |  |
| 14/16 | 8×3 | reuse q377 | Return on closed loans |  |
| 17/0 | 24×5 | reuse q369 | Most recent seven charge dates · red overdue, orange paid late, green on time |  |
| 22/0 | 24×1 | heading card | Activity · selected period |  |
| 23/0 | 6×3 | reuse q296 | Interest received ฿ |  |
| 23/6 | 6×3 | reuse q297 | Principal issued ฿ |  |
| 23/12 | 6×3 | reuse q298 | Principal returned ฿ |  |
| 23/18 | 6×3 | reuse q299 | Loans issued |  |
| 26/0 | 12×7 | reuse q301 | Principal issued and returned |  |
| 26/12 | 12×7 | reuse q302 | Interest received over time |  |
| 33/0 | 24×8 | reuse q303 | Active loans and recorded next plan |  |
| 41/0 | 24×7 | reuse q308 | All current overdue obligations |  |
| 48/0 | 24×8 | reuse q305 | Loan history · lifetime |  |
| 56/0 | 24×4 | reuse q316 | Payment punctuality · selected due dates |  |
| 60/0 | 24×7 | reuse q304 | Payment punctuality over time · due month |  |
| 67/0 | 24×1 | heading card | Records · selected period |  |
| 68/0 | 24×8 | reuse q307 | Obligation evidence · selected due dates |  |
| 76/0 | 24×8 | reuse q317 | Payments · selected payment dates |  |
| 84/0 | 24×8 | reuse q306 | Repayment allocations · selected payment dates |  |
| 92/0 | 24×1 | heading card | Additional lending scenario · hypothetical only |  |
| 93/0 | 24×5 | reuse q309 | Additional lending · hypothetical only |  |
| 98/0 | 24×1 | text card | All amounts are baht. Allocations are not unique receipts; corrections remain signed. Context and dates: Data … |  |

Dropped from dashboard 3: q300 (the saved questions are kept; nothing is deleted).

Phone: Profile first, then the number rows two per row; charge lights full width; tables scroll.


### 9 · Collection (`collection`)

Replaces: 10 · Collection Monitor (tab 19). Filters: `collection-borrower`, `collection-status`. Height 40 grid rows, 20 placements (18 visuals).

Today's collection board: progress, the four status lanes, the detail table and today's charges.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 12×2 | text card | **Collection · Bangkok today** · live · refresh every minute · payments appear after sync. Filters apply to th… |  |
| 0/12 | 12×2 | reuse q250 | As of · query time |  |
| 2/0 | 6×3 | reuse q237 | Collected today |  |
| 2/6 | 6×3 | reuse q238 | Left to collect |  |
| 2/12 | 6×3 | reuse q239 | People fully paid |  |
| 2/18 | 6×3 | reuse q252 | Today's charges · paid % |  |
| 5/0 | 24×2 | new `today.collection-rate` | Collected today · share of amount due |  |
| 7/0 | 6×2 | reuse q242 | 🔴 Not paid · people |  |
| 7/6 | 6×2 | reuse q244 | 🟠 Partially paid · people |  |
| 7/12 | 6×2 | reuse q240 | 🟣 Overdue · people |  |
| 7/18 | 6×2 | reuse q246 | 🟢 Fully paid · people |  |
| 9/0 | 6×9 | reuse q243 | 🔴 Not paid | sort by amount left desc |
| 9/6 | 6×9 | reuse q245 | 🟠 Partially paid | sort by amount left desc |
| 9/12 | 6×9 | reuse q241 | 🟣 Overdue | sort by overdue amount desc |
| 9/18 | 6×9 | reuse q247 | 🟢 Fully paid | sort by received desc |
| 18/0 | 6×6 | reuse q251 | Unclassified · expect 0 |  |
| 18/6 | 18×6 | reuse q64 | Overdue charges · completed days |  |
| 24/0 | 24×10 | reuse q248 | Collection detail · filters above apply here |  |
| 34/0 | 24×5 | reuse q249 | Charges dated today · separate from board balances |  |
| 39/0 | 24×1 | text card | Received = receipts today. Left includes older dues. A payment today can still leave someone Overdue; people m… |  |

Dropped from dashboard 3: none (the saved questions are kept; nothing is deleted).

Phone: Lanes stack in the order Not paid, Partially paid, Overdue, Fully paid; the detail table keeps borrower, status, left.


### 10 · Partners (`partners`)

Replaces: 11 · Partners (tab 249). Filters: `partner`, `statement-period`, `settlement-status`. Height 56 grid rows, 21 placements (17 visuals).

Each partner's capital, earnings, payouts, pending settlements and net available, the activity in the period and the ledgers.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Partners** · current balances stay current when the period changes · baht · net available is an entitlement … |  |
| 2/0 | 5×3 | reuse q325 | Net capital ฿ |  |
| 2/5 | 5×3 | reuse q326 | Net earned to date ฿ |  |
| 2/10 | 5×3 | reuse q327 | Completed payouts ฿ |  |
| 2/15 | 5×3 | reuse q328 | Pending settlements ฿ |  |
| 2/20 | 4×3 | reuse q329 | Net available ฿ |  |
| 5/0 | 16×7 | reuse q330 | Partner positions · current |  |
| 5/16 | 8×7 | new `partners.capital-share-row` | Capital share · full pool |  |
| 12/0 | 24×6 | reuse q340 | Pending settlements · all dates |  |
| 18/0 | 24×1 | heading card | Activity · statement period |  |
| 19/0 | 6×3 | reuse q333 | Allocated interest ฿ |  |
| 19/6 | 6×3 | reuse q334 | Allocated expenses ฿ |  |
| 19/12 | 6×3 | reuse q335 | Net earned ฿ |  |
| 19/18 | 6×3 | reuse q336 | Payouts in period ฿ |  |
| 22/0 | 12×8 | reuse q337 | Monthly net earned versus paid |  |
| 22/12 | 12×8 | reuse q338 | Capital contributions and withdrawals |  |
| 30/0 | 24×8 | reuse q339 | Net contributed capital over time |  |
| 38/0 | 24×1 | heading card | Ledgers · statement period |  |
| 39/0 | 24×8 | reuse q341 | Capital transaction ledger |  |
| 47/0 | 24×8 | reuse q342 | Settlement transaction ledger |  |
| 55/0 | 24×1 | text card | Capital withdrawals and profit payouts are separate. Calculation and source checks: Data health tab. |  |

Dropped from dashboard 3: q331, q332, q343 (the saved questions are kept; nothing is deleted).

Phone: Five numbers two per row; the positions table keeps partner, capital, available.


### 11 · Forecast & Plan (`forecast`)

Replaces: 12 · Forecast & Planning (tab 262). Filters: `scenario`, `interest-collected`, `principal-collected`, `overdue-recovered`, `loan-kind`, `target`, `plan-lending`, `plan-expenses`, `plan-withdrawals`, `plan-inflows`, `plan-reserve`. Height 60 grid rows, 22 placements (18 visuals).

Interest outlook for the current month under one scenario, the drivers and the watchlist, then the cash plan with its inputs checklist and month-end bridge.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Forecast & Plan · current Bangkok month** · existing loan book · scenarios are assumptions, not promised col… |  |
| 2/0 | 24×4 | reuse q353 | Scenario and assumptions in force |  |
| 6/0 | 24×1 | heading card | Interest outlook |  |
| 7/0 | 6×3 | reuse q348 | Interest received · month to date |  |
| 7/6 | 6×3 | reuse q349 | Remaining · scenario |  |
| 7/12 | 6×3 | reuse q350 | Month-end outlook |  |
| 7/18 | 6×3 | reuse q351 | Target gap |  |
| 10/0 | 16×9 | reuse q356 | Cumulative interest · actual and projected |  |
| 10/16 | 8×9 | reuse q355 | Month-end by scenario |  |
| 19/0 | 12×8 | reuse q357 | Upcoming dues · remaining weeks |  |
| 19/12 | 12×8 | reuse q360 | Watchlist · dues at risk |  |
| 27/0 | 12×7 | reuse q354 | Interest outlook bridge |  |
| 27/12 | 12×7 | reuse q358 | Borrower forecast contribution |  |
| 34/0 | 12×6 | reuse q359 | Interest by loan type |  |
| 34/12 | 12×6 | reuse q352 | Principal receipts · scenario |  |
| 40/0 | 24×1 | heading card | Cash plan · whole portfolio |  |
| 41/0 | 8×3 | reuse q365 | Business cash now ฿ |  |
| 41/8 | 8×3 | reuse q366 | Month-end cash ฿ |  |
| 41/16 | 8×3 | reuse q367 | Reserve shortfall ฿ |  |
| 44/0 | 24×6 | reuse q364 | Plan inputs and status | Plan not ready until all five inputs are set; blank results until then |
| 50/0 | 24×8 | reuse q368 | Month-end cash bridge |  |
| 58/0 | 24×2 | text card | Recorded obligations come before simulated ones. Planned new lending adds no forecast income. Month-end cash i… |  |

Dropped from dashboard 3: q361, q362, q363 (the saved questions are kept; nothing is deleted).

Phone: Headline numbers two per row; the cumulative chart first among charts; plan inputs above the bridge.


### 12 · Data health (`data-health`)

Replaces: new tab; cards moved from tabs 14, 16, 15, 18, 104, 105, 249 and 262. Filters: `statement-period`, `account`, `period`, `position-date`, `population`, `borrower`, `partner`, `scenario`, `interest-collected`, `principal-collected`, `overdue-recovered`, `loan-kind`, `target`. Height 86 grid rows, 27 placements (19 visuals).

Freshness, coverage, source and calculation checks for every page, in page order, so the business pages stay clean and the checks stay one click away.

| Row/col | Size | Source | Title on the page | Notes |
| --- | --- | --- | --- | --- |
| 0/0 | 24×2 | text card | **Data health** · every page's freshness, coverage and source checks. Filters here mirror the pages they belon… |  |
| 2/0 | 8×3 | reuse q276 | Reporting connection · SELECT 1 |  |
| 2/8 | 8×3 | reuse q257 | Queried at · Bangkok |  |
| 2/16 | 8×3 | reuse q250 | Bangkok date and query time |  |
| 5/0 | 24×1 | heading card | Cash Position |  |
| 6/0 | 24×6 | reuse q209 | Cash position · source and freshness |  |
| 12/0 | 24×1 | heading card | Income |  |
| 13/0 | 12×6 | reuse q184 | Income period and freshness |  |
| 13/12 | 12×6 | reuse q214 | Profit trend snapshot freshness |  |
| 19/0 | 24×1 | heading card | Cashflow |  |
| 20/0 | 12×8 | reuse q198 | Cashflow period and freshness |  |
| 20/12 | 12×8 | reuse q216 | Cash trend snapshot freshness |  |
| 28/0 | 24×1 | heading card | Performance |  |
| 29/0 | 8×7 | reuse q221 | Live period and source |  |
| 29/8 | 16×7 | reuse q228 | Snapshot coverage and generation times |  |
| 36/0 | 24×4 | reuse q231 | Rolling-average coverage · selected completed dates |  |
| 40/0 | 24×1 | heading card | Borrowers and Borrower Detail |  |
| 41/0 | 12×4 | reuse q284 | Period, population and source |  |
| 41/12 | 12×4 | reuse q315 | Overall charts · dates and data availability |  |
| 45/0 | 24×5 | reuse q300 | Activity dates and lifetime context · selected borrower |  |
| 50/0 | 24×1 | heading card | Partners |  |
| 51/0 | 12×7 | reuse q332 | How net available is calculated |  |
| 51/12 | 12×7 | reuse q343 | Source and balance checks |  |
| 58/0 | 24×1 | heading card | Forecast |  |
| 59/0 | 24×7 | reuse q363 | Forecast coverage and exceptions |  |
| 66/0 | 24×10 | reuse q361 | Loan forecast detail |  |
| 76/0 | 24×10 | reuse q362 | Recorded and simulated obligations |  |

Dropped from dashboard 3: none (the saved questions are kept; nothing is deleted).

Phone: Reference only; tables scroll.

<!-- GENERATED:END -->

## Phone behaviour

Metabase stacks dashboard cards to one column below about 760 px, in placement order. The row order above is therefore the phone order: header, headline numbers, meters, then charts, then tables. Tables get a phone column set through `table.columns` on the placement where the design says "keeps …"; the full column set remains in the saved question.

## Out of scope

- No model, snippet, view or migration change. If a new question cannot be expressed on an existing model, the design is wrong, not the model.
- No change to dashboard 3, its questions or its filters.
- No chart service change; the matrix iframe is reused.
- Cutover (renaming, retiring tabs on dashboard 3, redirecting links) is decided after the comparison and is not part of this build.
