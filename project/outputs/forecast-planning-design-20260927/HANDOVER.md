# Forecast & Planning — implementation handover

Delivered in R045 on 27 September 2026. This document retains the approved design; see the [implementation handover](../r045-forecast-planning/IMPLEMENTATION.md) for actual object IDs, verification, native-layout adaptations and recovery.

Date: 27 September 2026. Status: **Design proposal for owner review; not implemented, live-verified or published to Metabase.**

## 1. Intended outcome and scope

Create a decision-oriented Forecast & Planning page for the current Bangkok month. Answer:

1. What interest has actually been received, and what additional interest could be collected by month-end?
2. How much principal could return separately from interest?
3. Which borrowers, loan types and payment arrangements drive the outlook?
4. How sensitive is the outlook to lower collections?
5. After explicit planned cash movements, is projected month-end cash above the desired reserve?

This is a reporting and scenario feature. It creates no loans, charges, payments, reservations, settlement instructions or notifications. OLTP remains the operational owner; OLAP retains assessments and partner settlement entry. No new stored financial table/column, AppSheet change, AI Collection integration, new scoring method or automated lending decision is proposed.

Core V1: sections F01–F10 and F14–F15 below. Conditional V1: funding sections F11–F13, activated only when their data and input contract passes. A delivery without funding must explicitly report that omission; it must not claim the complete funding design implemented.

## 2. Evidence and navigation baseline

This design uses maintained repository definitions and release evidence inspected on 27 September, not a fresh live audit. Starting Git commit: `b5efd78be9f047b2ec8f5bb6350dbb3bd268c5b9`.

| Evidence | Implication for implementation |
| --- | --- |
| [Solution Design](../../Documents/Solution_Design.md), [R043 navigation](../r043-borrower-navigation/README.md) | Dashboard 3; Forecast & Partners tab ID 11 follows Collection Monitor. Borrower Detail is tab 105; use immutable borrower keys for links. Verify current IDs before mutation. |
| [R044 Partners](../r044-partners/README.md) | A separate actual-only Partners tab 249 now exists. Do not duplicate partner capital shares or forecast partner distributions here. The old empty tab 17 is not available. |
| [Environment inventory](../../Documents/Environment_Inventory.md) | Recorded baseline: DEV/PROD V47; Metabase source 2 targets loan_manager_prod. Verify complete live target identities before implementation. |
| [Portfolio model](../../scripts/metabase/models/portfolio.sql), [V22](../../../database/migrations/V22__olap_analytics_views.sql) | Legacy “Projected Monthly Profit” adds MTD interest receipts, outstanding interest charges dated through today, and expected loan interest. It is gross interest, and the components have different populations/date behavior. |
| [Loan model](../../scripts/metabase/models/loans.sql), [R016 contract](../r016-20260922/README.md) | Existing loan-type forecast totals are documented as not reconciling to the portfolio forecast. Do not reuse them as a reconciled chart breakdown. |
| [V8 generator](../../../database/migrations/V8__common_charge_generation.sql), [V6 first-day rules](../../../database/migrations/V6__core_payment_transaction.sql) | Governed loan types, schedule anchors, intervals, installment allocation and charge precedence are available. Their write functions must never be called to calculate a report. |
| [V41 health](../../../database/migrations/V41__borrower_payment_health.sql), [V42 schedules](../../../database/migrations/V42__automatic_schedule_categories.sql) | Current charge balances, source quality, arrears and modified-schedule context are available. Historical payment health is not a probability of future payment. |
| [V45 interest basis](../../../database/migrations/V45__automatic_daily_interest_after_principal_payment.sql) | Daily interest can change with principal. A fixed rate multiplied blindly across the remaining month can be wrong when principal changes. |
| [V38 statements](../../../database/migrations/V38__focused_live_statements.sql), [canonical cash contract](../r016-20260922/statement-cleanup/README.md) | Current cash must come from the canonical cash providers, preserving unknown opening balances and signed amounts. |
| [Income Events definition](../../Documents/Data%20Dictionary/systems/metabase/models/income-events.yaml), [V46 receipt reporting](../../../database/migrations/V46__borrower_payment_receipt_reporting.sql) | Posted interest and expenses support actual results; a Payments receipt row may be unposted and must not be added to Repayments income. |

Re-inspect only affected live sources/definitions during implementation. Older imported-unreconciled dictionary entries are evidence of recorded fields, not a guarantee of current live metadata. Confirm later migrations have not superseded the inspected functions.

Recommended first deployment is an additive **Forecast & Planning · Review** tab, with independent questions and tab-specific filters. After owner acceptance and scoped publication authorization, replace/rename the old forecast page at its existing navigation position. Remove its partner-share placement only as part of that explicit cutover, retaining shared saved questions. Preserve Partners 249 and all unrelated tabs. Assign new object IDs through Metabase; no IDs or migration numbers are reserved here.

## 3. Time, population and controls

### 3.1 Time contract

- `T` is the Bangkok reporting date from the governed reporting clock, `Q` the query timestamp, `M` its month start, `E` its month end. Render all four as relevant in the context strip.
- Actual MTD is posted, signed activity with effective payment dates from M through T, known at Q. Today is partial. Future-dated rows are excluded from actuals and disclosed if they affect source balances.
- Remaining receipts consist of unpaid posted obligations plus eligible simulated obligations. Separate `overdue` (due < T), `today unpaid` (due = T) and `future` (T < due <= E).
- Existing future obligations are reduced by payments already posted through T, including prepayments. Never count the same payment in actuals and again in remaining receipts.
- For a due-today charge already partly paid, only its unpaid balance is forecast. Do not synthesize a missing obligation for today or a past day: report it as a schedule gap requiring review.
- V1 is a current-month outlook, not a forecast made at an arbitrary historical date. Backdated corrections restate actuals. A historical forecast requires a saved knowledge-time baseline that does not presently exist in this design.
- All cards in a render must use one T and consistent assumptions. SQL evaluation should use a consistent statement/transaction snapshot for related output; display Q and refresh the page together. Re-query if the page spans midnight.

### 3.2 Population

Use all recorded business loans for posted actual receipts, including loans closed during the month and borrowers marked Hidden. Hidden is a display attribute, not authority to remove business amounts. Identify excluded/invalid source amounts and unmapped borrower IDs explicitly. Do not drop an orphan row silently because a display join failed.

Future simulation applies only to valid, active, non-defaulted loans originated on/before T with no effective closure. Posted unpaid charges on closed/defaulted loans are visible in a separate recovery-only category; they receive no assumed recovery by default. Unknown status or invalid configuration is an exception, not a zero forecast. Future-originated loans and hypothetical new loans are excluded from V1 income.

Loan type filter (All default) affects the interest/receipt and driver sections, including actuals. It does not narrow portfolio cash. Funding always uses an all-portfolio forecast and displays that scope explicitly. Borrower filtering is unnecessary in V1; borrower drill-through provides detail without fragmenting the funding view.

### 3.3 Inputs and defaults

| Control | Proposed behavior |
| --- | --- |
| View scenario | Planning default; Schedule / Planning / Stress. A comparison always shows all three. |
| Planning interest collection % `cI` | 0–100; initial 100. Fraction of eligible today/future interest expected to be received by E. Not an observed probability. |
| Planning principal collection % `cP` | 0–100; initial 100, independent of cI. |
| Overdue recovery % `r` | 0–100; initial 0. Applies only to valid non-defaulted active-loan overdue balances; today's dues are not arrears. Closed/defaulted recovery remains excluded. |
| Interest target `G` | Optional nonnegative whole-baht amount. Blank means no target/gap/reference line. No invented business target. |
| Funding inputs | Remaining new-lending cash outflow `L`; remaining operating cash expenses `O`; remaining partner payouts/capital withdrawals/advance repayments `W`; remaining external cash inflow `K`; desired minimum cash reserve `B`. Nonnegative numeric values; distinguish blank from explicitly entered zero. |

Funding starts inactive until L/O/W/K/B are explicitly entered, even if zero. Inputs describe movements after Q through E only. W must include pending obligations the owner actually plans to pay, once; do not automatically subtract the Partners pending balance and W again. K excludes borrower principal/interest and transfers between included business accounts. L is planned cash leaving the business; no speculative interest from that lending is added.

Use native tab-specific numeric parameters where supported. Implement SQL-side range/null validation; URL inputs receive the same checks. Do not silently clamp invalid user inputs. Percentage inputs are displayed on a 0–100 scale and converted to fractions once in SQL. These are temporary report scenarios, not persisted financial plans. If exact native numeric controls cannot be supported, deliver core forecasts with visible fixed assumptions for review and explicitly defer editable planning; do not build a new service implicitly.

## 4. Forecast engine and metric contract

### 4.1 One reconciled set of obligation facts

Create a proposed read-only provider at **loan × obligation date × component × origin** grain. Origin is Recorded or Simulated. Principal and interest are separate amounts. Immutable loan/charge IDs and a deterministic simulation key preserve identity; borrower names are labels only.

1. Aggregate signed Repayments by charge/component through T before joining charges. Preserve signed actual interest and principal, including reversals.
2. Read valid posted charges with their current unpaid components. Outstanding = max(due minus signed posted payment, 0), with overpayment separately flagged. Negative/correction charges use the governed operational rules; an unresolved negative/correction case is excluded with an exception, never turned into positive projected income.
3. Aggregate existing charges by loan/date for collision detection. Multiple valid existing charges on a date remain in recorded totals, but no simulated charge is added on that date. Flag duplicates for review rather than assuming one is disposable.
4. Generate missing future obligations only for eligible automatic schedules and only through E. Recorded obligations take precedence. Process dates sequentially so each simulated event updates the last-charge date and scheduled principal for the next event.
5. Preserve the generator's treatment of existing future rows, including the installment MAX(charge date) rule. Do not fill a gap contrary to that rule. Surface unforecastable gaps.
6. Expose overdue, today and future components separately. Missing/invalid coverage produces a visible known subtotal and an Incomplete status; the headline total is unavailable when materially relevant required inputs are unknown.

The data provider must return actual receipt aggregates independently; never join raw receipts × raw charges × raw loans before aggregation. Source validation must distinguish an empty eligible book (a valid zero) from missing/invalid data.

### 4.2 Schedule rules by loan type

| Type / condition | Proposed V1 treatment |
| --- | --- |
| Recorded future charge | Use unpaid principal/interest after posted payments through T. Keep its contractual date and original charge reference. It overrides a simulation for the same loan/date. |
| Daily Interest, Auto Charge Enabled | Reproduce V8 anchor/interval and accrued-days calculation in a read-only simulator. First simulated due date must be after T; uncharged accrual may enter that future charge according to the governed last-charge rule, never a separate duplicate accrued-interest amount. Principal is not assumed to return without a recorded obligation. |
| Daily Interest with scheduled principal reduction | Use verified V45 basis and rounding for simulated interest after the scheduled reduction. Preserve already-posted future charge amounts. Define within-day order as charge calculation, then assumed scheduled principal receipt, then next-day rate; label this schedule assumption. If source basis/order cannot be reconciled, suppress the affected simulated tail and flag it rather than invent a new rate. |
| Fixed Due Date | Simulate the missing charge only on a valid due date T < date <= E, under the actual automatic-generation eligibility rules. Derive remaining principal through T and fixed interest using the existing generator; exclude duplicate/prepaid components and reconcile future-dated records. |
| Daily Installment | Reproduce V8 inclusive term, interval/final-date behavior, floor/remainder principal allocation and last-charge handling. Include V6 first-day allocation only as existing recorded history; do not generate a new first-day charge for an existing loan. Interest equals scheduled payment less scheduled principal under the governed formula. Invalid/missing initial charge is an exception. |
| Auto Charge disabled / modified arrangements | Use recorded future obligations only. No hypothetical daily accrual based solely on Current Daily Interest. Clearly state that unrecorded commitments are not covered. |
| Closed/defaulted | No new automatic forecast; posted outstanding amounts appear as recovery-only context, excluded from all scenario receipt totals in V1. |
| Unknown type/date/interval or negative computed component | Explicit exception and excluded amount/loan count. Do not silently substitute a daily schedule. |

Principal forecast must reconcile to the loan balance and posted obligation allocation. Report over-scheduling or contradictory sources; do not silently cap the portfolio total to make it fit. A principal reduction already reflected in the cutoff balance must not be applied again during simulation.

Never execute `generate_loan_charge`, `generate_due_charges`, payment/default/close functions or trigger-writing helpers to obtain a forecast. Inspect their definitions and reproduce the approved calculation read-only. Existing assessment-lab forecast functions are not an assumed portfolio source or authorized runtime dependency.

### 4.3 Scenario arithmetic

For the chosen population define:

- `A`: signed posted interest from M through T.
- `UI`, `UP`: valid active/non-defaulted unpaid interest/principal due today or after today through E, recorded plus simulated.
- `OI`, `OP`: valid active/non-defaulted interest/principal overdue before T, including earlier months. This is a stock balance, not MTD income.
- `XI`, `XP`: closed/defaulted recovery-only balances, disclosed but excluded from projected receipts.

| Scenario | Remaining interest `RI` | Remaining principal `RP` |
| --- | --- | --- |
| Schedule | UI | UP |
| Planning | cI × UI + r × OI | cP × UP + r × OP |
| Stress (illustrative) | max(cI − 0.20, 0) × UI | max(cP − 0.20, 0) × UP |

Schedule means 100% of eligible today/future dues with no arrears recovery, not a best estimate or guaranteed maximum. Planning can exceed Schedule if it includes recovery of old arrears. Stress is a sensitivity illustration, not a statistical confidence interval. The initial Planning 100/100/0 equals Schedule intentionally; label “Unadjusted schedule assumptions” until changed.

Receipt percentages scale how much of the fixed schedule is collected **by month-end**. They do not simulate later re-lending, delinquency feedback, a new amortization schedule or extra interest on unpaid principal. All three scenarios use the same generated schedule; the principal-dependent interest assumption in section 4.2 is the Schedule basis. Explain this limitation next to the scenario comparison rather than presenting it as a behavioral prediction.

### 4.4 Metric definitions

| Metric | Formula / semantics |
| --- | --- |
| Interest received MTD | A. Signed, posted, by Payment Date. Retain source interest classification, including any recorded fees already included in interest; do not relabel as pure coupon income. |
| Remaining interest | Selected scenario RI. Excludes amounts already received. |
| Projected month-end interest | A + RI. Gross interest receipts; not net profit or partner entitlement. |
| Gap to target | max(G − (A + RI), 0), only if G entered and projection valid. Show surplus separately in tooltip if projection > G. |
| Principal receipts remaining | Selected scenario RP. Never included in interest or profit. |
| Total remaining receipts | RI + RP. Used in funding, with all-portfolio scope. |
| Scenario reduction | Planning projected interest minus Stress projected interest; show baht and percentage of Planning remaining interest when positive. Null ratio if denominator <= 0. |
| Overdue recovery component | r × OI and r × OP separately. Show underlying stock OI/OP; do not rename the entire stock “expected recovery.” |
| Largest forecast contributors | Loan/borrower RI contribution, sum before ranking. Percentage denominator is total positive remaining interest; no absolute-value pie shares. |
| Watchlist forecast exposure | Eligible scheduled interest linked to any current overdue, modified-schedule or default flag, deduplicated by loan. Defaulted items are shown separately as excluded; this is exposure context, not expected loss. |
| Forecast coverage | Counts of eligible active loans with complete schedules / eligible active loans, plus their share of positive outstanding principal. Show both counts and denominator; this is data coverage, not forecast accuracy. |
| Current business cash `C` | Canonical current cash custody total at the same cutoff. Preserve negatives and unknown account openings. Do not substitute cash-pool contribution less principal, partner entitlement, or retained profit. |
| Projected closing cash | C + RI(all) + RP(all) + K − L − O − W. Available only when all inputs/sources are valid. Starting C already includes recorded payments through Q; do not add A again. |
| Funding shortfall | max(B − projected closing cash, 0). A month-end scenario gap, not a recommendation to borrow or approve lending. |
| Cash above reserve | projected closing cash − B; signed. Positive value does not establish that all cash is accessible or unrestricted for lending. |

No Forecast Realization gauge in V1: A / (A + remaining) is progress against a changing estimate, not forecast accuracy. No projected net profit until a separately specified complete expense forecast exists. Cash expense inputs are not automatically a profit-and-loss forecast.

## 5. Page and chart specification

Use this reading order. Proposed chart IDs F01–F15 are design identifiers, not Metabase object IDs.

| ID / section | Visual and encoding | Filters, interactions and empty states |
| --- | --- | --- |
| F01 Context and status | Compact text: current month, Bangkok cutoff/Q, scenario percentages, scope, coverage and refresh/source status. Today marked partial. | Always visible. “Calculated at” is not upstream-sync freshness. Show last source sync separately only if verified available. |
| F02 Summary cards | Five cards: A; RI; A+RI; target gap; RP. Short labels and subtitle “Gross interest” for the first three. | Loan type + selected scenario; A ignores scenario. Blank target shows “Target not set,” not 0. Incomplete forecast shows unavailable plus known subtotal in detail. |
| F03 Interest trajectory | Full-width cumulative line: solid blue actuals M…T; dashed teal Planning extension; optional dashed orange Stress; optional horizontal target. Mark T as partial. | Cumulative starts at M, never at chart-visible crop. Projection starts at cumulative A. Today-unpaid appears as a separately labelled remaining-today increment; future increments follow obligation due dates under an on-due-date collection assumption. Arrears recovery is an explicitly labelled month-end scenario increment, not a fabricated daily recovery schedule. |
| F04 Forecast bridge | Half-width waterfall: Actual A + Today/Future RI component + assumed arrears recovery = Projected interest. | A labelled bridge table is the fallback if native waterfall totals are ambiguous. Preserve negative actual adjustments and signed total. No stacked positive-only chart that hides reversals. |
| F05 Scenario comparison | Half-width grouped bars or table: Schedule, Planning, Stress; columns/series remaining interest, remaining principal, projected interest total. | Use separate interest/principal bars; actual A is common and not duplicated into remaining bars. Always show all scenarios and assumptions. |
| F06 Upcoming scheduled receipts | Full-width weekly stacked columns, interest versus principal, for T…E. Label first/last partial Monday-start weeks. | Show raw valid scheduled balances, independent of scenario rates; today remaining is explicit. Overdue stock is a separate badge/table, never silently assigned to this week's due dates. Tooltip separates Recorded/Simulated. No dual axis. |
| F07 Borrower drivers | Half-width horizontal bars: top eight borrowers by selected RI plus Others. | Rank after type filtering, tie-break by immutable ID. Tooltip provides recorded/simulated and recovery portions. Named borrower opens Detail105 by verified ID mapping. Others opens grouped detail, never one borrower. |
| F08 Loan-type composition | Half-width grouped bars by loan type: actual interest MTD versus remaining scenario interest. | Type filter applies; preserve negative actuals. Both sums reconcile to F02. No old Expected Interest This Month aggregate mixed into this chart. |
| F09 Forecast watchlist | Compact table of flagged loans: borrower, loan label, current health, arrangement, remaining forecast contribution, reason/exception. | One loan per row; multiple flags in one cell to prevent double-counting. No conversion of payment-health scores to collection %. |
| F10 Coverage and excluded balances | Small status table: loans fully forecastable, source-review loans, manual schedules without future plan, missing today charges, recovery-only balances, invalid dates and unknown amounts. | Unknown amounts shown as unknown with record counts. Do not claim full monetary coverage when values are unknown. Place a short warning at F01 if totals incomplete. |
| F11 Funding assumptions | Clearly bounded input group with full-portfolio scope and explicit L/O/W/K/B values. | Blank inputs leave the funding section uncalculated. Validate values before evaluating any cash card. No date or borrower detail filter leaks into funding. |
| F12 Funding cards | Current business cash; projected closing cash; cash above reserve / shortfall. | All portfolio, selected scenario. Unknown cash opening or source mismatch suppresses projections. Distinguish a real negative balance from unavailable. |
| F13 Cash bridge | Full-width waterfall or labelled bridge table: C, remaining interest, remaining principal, K, −L, −O, −W, closing cash; reserve shown as comparison. | Each input used once. Transfers within the consolidated scope cancel. State “Month-end balance; intra-month shortages are not assessed.” |
| F14 Loan forecast detail | Full-width paginated table: borrower/loan, type, current principal, next forecast due, today/future interest and principal, overdue components, scenario RI/RP, Recorded/Simulated, health/coverage reason. | One loan summary row plus obligation drill-through. A separate recovery-only grouping retains closed/defaulted exceptions. Raw note/bank/contact data excluded. Exact component amounts available in governed detail. |
| F15 Method and source | Brief plain-language explanation of scope, three scenarios, current schedule basis, expense/cash limits and source links. | Keep engineering definitions in saved descriptions/handover; end users see meaningful assumptions and limitations. |

Visual order on desktop: context → cards → trajectory → bridge/scenarios → receipts → borrower/type drivers → watchlist/coverage → funding → detail/method. On mobile stack in the same order; put borrower/loan, date and amount columns first, with horizontal scroll for supporting fields. Use native Metabase charts initially; no new iframe or custom server is needed by this design.

Formatting: baht totals display as whole baht, percentages one decimal; retain full numeric precision for aggregation and verification. Calculate totals before rounding. Actual blue, Planning teal, Schedule grey, Stress orange; overdue warning red only for status. Distinguish forecasts with dashes and labels as well as color. Avoid dense pie charts and chart labels on every daily point.

## 6. Data architecture and implementation boundaries

All reusable schedule generation, deduplication, balance reconstruction and aggregation belongs in governed PostgreSQL providers. Metabase models remain thin, typed metadata; cards perform presentation/filtering and simple aggregation. Do not move a schedule engine into custom expressions.

Proposed logical outputs (names are design placeholders, not claims of existing objects):

| Output | Grain and minimum contract |
| --- | --- |
| Forecast obligations | Loan/obligation-date/component/origin; borrower ID, charge/simulation key, due date, remaining amount, bucket, eligibility, source-quality flag, T/Q/method version. |
| Forecast actuals | Loan/payment-date/component; signed posted actuals aggregated from immutable repayment IDs, plus unmatched-source exception totals. |
| Forecast loan summary | One loan for T/E; UI/UP/OI/OP/XI/XP, recorded/simulated subtotals, next date, status and coverage. |
| Forecast calendar | One Bangkok date M…E with actual interest, due principal/interest and cumulative series; distinguish no activity = zero from incomplete source = null. |
| Scenario result | Scope/scenario; rates, actuals, remaining receipts, projection and completeness. Type-filtered results and all-portfolio funding results must be distinguishable. |
| Funding result | One all-portfolio scenario with canonical C, explicit planning inputs, calculated cash/gap and readiness reasons. |

Prefer a bounded read-only function or views over existing tables; no materialization or new scheduled refresh is assumed. Current-month bounds keep generation small. Parameterize SQL; no string interpolation of free text. Query the shared providers rather than independently recomputing schedules for every visual. Benchmark actual compiled Metabase queries before deciding caching is needed; cache behavior must not mislabel today's figures as live.

Use the existing restricted reporting identity. Grant only SELECT/EXECUTE on the new read-only providers as needed, with no write/financial function privileges. Review function security and search_path. Financial/borrower rows, full credentials, authentication exports and unrestricted metadata remain outside Git. Sanitize publication evidence to definitions, counts, checks and synthetic values.

Read the current database procedure before coding a migration. Assign the next available immutable migration only during implementation. Read the tracker again then: R045 was Open at design time, but this document neither reserves it nor opens/freezes any release.

## 7. Verification and acceptance

The following are required implementation cases, **not tests already run**. Use synthetic fixtures with expected exact amounts, and restricted live reconciliation without publishing private values.

| Case | Acceptance result |
| --- | --- |
| Basic bridge | Synthetic A=1,000; UI=600; UP=1,200; OI=100; OP=200; cI=80%, cP=75%, r=25% gives Planning RI=505, RP=950, projected interest=1,505. Schedule projected interest=1,600; Stress rates 60%/55% give RI=360, RP=660. |
| Cash bridge | With C=2,000, K=100, L=1,000, O=200, W=300, B=2,500, the preceding Planning receipts yield closing cash 2,055 and shortfall 445. Actual A is not added a second time. |
| Receipt identity | One Payments receipt allocated to multiple Repayments contributes only signed posted repayment components; receipt totals are not added again. Reversal reduces actuals and reopens unpaid balance appropriately. |
| Partial/prepayment | Due-today payment and prepayment of a future charge reduce remaining receipts exactly once while increasing actual interest only by its interest component. |
| Posted/simulated collision | Existing future charge on a simulated due date suppresses the simulation; multiple source charges are reported as recorded/flagged, not deleted. |
| Accrual and month boundary | Interval charge that includes uncharged earlier days is counted once on its future due date; accrual whose next due date falls after E is outside month-end receipt forecast. |
| Daily-interest rate | Scheduled principal reduction uses verified V45 basis/rounding for later simulated charges; posted future amounts remain unchanged. Already-applied principal is not subtracted twice. |
| Installment | First-day, final-day, irregular interval and remainder allocation reconcile to V6/V8 on synthetic schedules. Existing future MAX(date) behavior is retained. Invalid negative interest produces an exception. |
| Manual/modified schedule | Auto Charge off projects recorded dates only. An empty future plan is disclosed, with no invented daily income. |
| Default/closed | No automatic new forecast; recovery-only balances remain visible and excluded. Posted actual receipts during MTD remain included. |
| Status/data faults | Unknown type/status, null date, inconsistent allocation, over-scheduled principal and unknown amounts cause explicit coverage errors, never a false zero/full forecast. |
| Cutoff | Future-dated repayments excluded from actuals; balance components rebuilt consistently. Today included once; overdue means before today. Tests cover first/last month day, leap February and Bangkok midnight. |
| Scenario inputs | 0/100% boundaries and Stress flooring work; negative/out-of-range/NaN inputs rejected. Blank target/input differs from zero. Planning may exceed Schedule only through explicitly shown recovery. |
| Reconciliation | Sum loans = sum borrowers = sum loan types = cards for identical scope/scenario. Bridge endpoint = projected interest. Weekly raw dues = UI/UP (not scaled receipts). Cumulative endpoint = scenario total including labelled arrears increment. |
| Scope | Loan-type filter changes core actual/forecast sections while funding remains explicitly all portfolio. Hidden borrowers remain in business totals; unmatched joins do not disappear. |
| Unknown cash | One unknown required account opening suppresses projected cash/gap. Negative known cash remains signed. Internal transfers do not increase consolidated receipts. |
| Presentation | Current saved desktop/mobile GUI shows all assumptions, partial today, unavailable states, long names and empty book correctly; no truncated essential card titles or misleading stacked negatives. |
| Drill-through | Duplicate borrower labels open the correct immutable ID in Detail105 using current parameter mapping; Others does not open a single borrower. |
| Preservation | Existing questions, tabs, filters, permissions, financial records, AppSheet versions, jobs and Partners249 unchanged during additive review delivery. |
| Performance | Capture query timings and query plans for the actual bounded providers/cards. Agree an acceptable response time using observed load; do not invent a performance guarantee. |

No forecast accuracy percentage or historical backtest claim until genuinely frozen forecast vintages exist. Reconstructed current schedules against past payments are not a substitute for forecasts known at the time.

## 8. Implementation sequence, recovery and handoff

1. Read this document, current tracker, affected inventory and owning source definitions. Verify exact source database/app/report identities. For GUI work follow the service-account/browser mapping and verify the selected service account; this design task performed no browser access.
2. Confirm the owner-approved implementation scope covers the scenario defaults, additive review tab and conditional funding inputs. Existing authorization should be reused; this design-only request does not authorize live publication or schema execution.
3. Establish rollback once for the coherent batch: starting Git commit, preserve unrelated changes, private dashboard definition snapshot and recovery copy. Database writes use the mandated database recovery procedure; no app version backup is needed when apps are unchanged.
4. Inspect the current charge-generation/payment/close/default functions and relevant later migrations. Resolve source/date inconsistencies with tests before writing a new provider. Do not alter operational financial logic to make the forecast easier.
5. Build read-only providers and synthetic assertions in DEV using the then-current Open release. No stored schema additions are needed by default; any later proposed table/column requires the owner's schema approval.
6. Build thin models, parameter validation and tab-specific draft/review definitions through maintained tooling. Preserve the shared dashboard and question dependencies. Assign real IDs only at creation and record them.
7. Verify SQL cases, compiled queries, source reconciliation, filters and current GUI layout. SQL checks complement visual verification; a saved definition alone is not visual acceptance.
8. Seek/reuse scoped production SQL and dashboard publication authorization after the concrete reviewed result exists. Use the release's single applicable promotion checklist. No AppSheet RC is required for report-only work unless later approved scope actually changes apps.
9. Publish additive review content, verify saved state and source bindings, then perform a separately authorized canonical cutover. Do not retire the original forecast or its partner-share placement prematurely. Preserve recovery questions and dependencies.
10. Update the owning dictionary objects, release log/manifest, relevant solution/inventory/development records and this handover's delivered-status pointer. Commit/push intended sanitized files, verify publication, and complete release tags/checklist only as applicable to the authorized release.

Dashboard rollback removes only the new owned placements/parameters/tab or restores scoped prior definitions; do not restore the entire old dashboard over subsequent owner edits. Recoverably archive newly unused questions only after checking dependencies. Additive read-only SQL providers can remain for compatible rollback; no financial-data restore is implied by a report rollback. Record actual recovery IDs privately/with sanitized evidence at implementation time, not guessed here.

## 9. Decisions and later extensions

Proposed defaults awaiting implementation acceptance: current-month horizon; additive review before cutover; 100/100/0 initial Planning settings; illustrative Stress reduction of 20 percentage points; no implicit closed/defaulted recovery; explicit funding assumptions; no speculative new-loan income. These are design choices, not conclusions about borrower behavior.

Before activating funding, verify canonical business cash reconciles to the same posting cutoff and that planned cash movement categories cover the intended business scope. If this fails, continue the independent core forecast implementation and label funding incomplete.

Later, separately scoped extensions may include next 30/60/90 days, dated planned outflows and daily lowest-cash analysis, calibrated collection timing, scheduled principal feedback under each scenario, complete net-profit forecasts, and forecast-vintage accuracy tracking. Daily cash low points require dates for spending and recovery; horizon totals alone cannot support them. Forecast history storage would require justified schema design and owner approval. None is a hidden prerequisite or an implemented feature of V1.
