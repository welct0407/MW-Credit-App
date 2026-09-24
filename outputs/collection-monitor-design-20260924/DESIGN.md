# Daily Collection Monitor — design and implementation handoff

Date: 24 September 2026 (Asia/Bangkok). **Design only; no live changes made.**

## Summary for the owner

Create **8R · Collection Monitor**, immediately after the existing **8 · Daily Collection**, and keep the existing tab intact until a later owner-approved cutover.

The new page is an all-day borrower status board. Keep Data Studio's four side-by-side groups, make names and amounts easy to scan, and use a consistent color and symbol for each status. Put the groups in attention-first order:

**🚨 Overdue → ○ Not paid → ◐ Partially paid → ✓ Fully paid**

Use red, orange, blue and green respectively. A borrower appears in exactly one group. An overdue borrower who has paid something today stays red but has their received amount clearly visible. That distinction is essential: payment activity does not necessarily mean their overdue balance is cleared.

Above the board, show just four useful figures: people on the board, receipts today, remaining to collect, and the percentage of people fully paid. Below it, provide a full detail table for investigation. Keep long explanations and accounting breakdowns below the monitoring area.

Default monitoring is **Bangkok today**, with a proposed **one-minute automatic refresh** and a visible query timestamp. This is periodic refresh, not an instant payment feed. Verify refresh performance before adopting that interval; use five minutes if one minute causes overlapping/slow loads, and tell the owner the measured result.

This replaces the earlier discussion's single-worklist recommendation: the owner's priority is recognizing people in different statuses at a glance, so **four visible groups are the primary interface**. One combined table remains secondary.

## 1. References and verified starting point

### Data Studio reference

Inspected the owner's personal Chrome tab, [Loan Reports - Mobile / Daily Collection](https://datastudio.google.com/reporting/c62727aa-a0fc-4c2a-9295-b46ebe1f82fc/page/p_ja4vkalv6d).

Observed structure:

- A blue page heading and two rows of four summary cards.
- Four simultaneous vertical groups: **✔️ Paid**, **🌓 Partial**, **❌ Not Paid**, **🚨 Overdue**.
- A count/amount area above each borrower table.
- The groups share a consistent top alignment and table height.

Reuse the simultaneous status-group layout and recognizable symbols. Improve it with stronger color differentiation, less empty space, attention-first order, compact borrower rows and explicit freshness. Several reference amount cards showed errors and the group tables showed **No data** during inspection. This is layout evidence, not validation of its financial values. Repairing Data Studio is outside this task.

### Metabase baseline

Inspected the [live Loan Reports dashboard](https://reports.mw-credit.com/dashboard/3) in Chrome and fetched saved dashboard/model metadata read-only on 24 September.

| Object | Verified identity / relevant observation |
| --- | --- |
| Dashboard | Loan Reports, ID **3**; 11 tabs at inspection |
| Existing collection tab | **8 · Daily Collection**, internal tab ID **9** |
| Existing borrower detail destination | **9 · Borrower Insight**, tab ID **10**; borrower parameter already exists |
| Empty unrelated tab | **Tab 11**, internal ID **17**; leave untouched |
| Reporting source | Database ID **2**, `loan_manager_prod`, restricted `metabase_borrower_reader`, local proxy host `127.0.0.1` verified by existing API helper |
| Current collection layout | 20 data placements plus headings/notes; four status sections stacked vertically |
| Existing questions | 119–126 headline measures; 128/131 receipts; 133/136 status counts; 134/137 remaining amounts; 129/132/135/138 status worklists. Questions 120/121 are reused in more than one placement. |
| Source models | **69 Borrowers**, **71 Repayment Ledger**, **73 Portfolio Overview**, **77 Collection Worklist**, **162 Collection Status Summary** |

The current collection page takes substantial vertical scrolling to compare people in different statuses. Its top amount cards and borrower worklists also have different populations/date meanings. Preserve these definitions on the original tab; make the new page's labels and scope explicit.

Starting Git commit: `dd22d81112d6496f28ac8fb8768405bdfa813621`, branch `master`, upstream `origin/master`. Unrelated dictionary work was already uncommitted and must be preserved. This design adds documentation only. R025 was the sole Open development release at inspection; **re-read the tracker when implementation starts and use the then-current Open release**. This document neither freezes a release nor authorizes final cutover.

## 2. Page layout

### Desktop monitoring area

Use the native dashboard grid with four equally wide lanes. Target a wide desktop display, while checking ordinary 1366 × 768 browser use as well as 1920 × 1080. Hide the navigation sidebar during monitoring; offer the native fullscreen link/control. Do not change dashboard-wide width/theme settings if they would change existing tabs without review.

```text
COLLECTION MONITOR · Bangkok today [actual date]
Live on refresh · queried [time] · refresh interval [native control]

 PEOPLE ON BOARD     RECEIPTS TODAY     LEFT TO COLLECT     PEOPLE FULLY PAID
       18                ฿7,200             ฿5,900               7 / 18
                                                               38.9%

 🚨 OVERDUE          ○ NOT PAID         ◐ PARTIALLY PAID     ✓ FULLY PAID
     4 people           5 people           2 people            7 people
 ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
 │Name Received Left│ │Name Received Left│ │Name Received Left│ │Name Received Left│
 │A01      200  900│ │B01        0 500│ │C01      200 300│ │D01      500   0│
 │A02        0 800│ │B02        0 400│ │C02      100 100│ │D02      350   0│
 │...             │ │...             │ │                │ │...             │
 └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
 All monetary values in baht. Received = receipts dated today;
 Left = remaining collection balance, including older dues.

 BELOW THE MONITORING AREA
 Borrower details [borrower search] [status filter]
 Full collection table + compact today-only charge summary
```

All names, counts and amounts in this wireframe are **independent synthetic illustrations**, not a reconciled financial example or live results.

### Visual rules

| Group / exact source value | Display treatment | Meaning |
| --- | --- | --- |
| `Overdue` | 🚨 **OVERDUE**; dark red `#B42318`, pale red `#FEE4E2` | Older unpaid charge exists; may also have paid today |
| `Not Paid` | ○ **NOT PAID**; burnt orange `#B54708`, pale orange `#FFF1D6` | Governed Not Paid status; do not automatically call it overdue |
| `Partially Paid` | ◐ **PARTIALLY PAID**; blue `#175CD3`, pale blue `#EAF2FF` | Some governed collection obligations paid, some remain |
| `Fully Paid` | ✓ **FULLY PAID**; dark green `#067647`, pale green `#ECFDF3` | Governed collection set is fully paid; not a statement that the whole loan is closed |

- Use readable dark text with pale table-cell backgrounds, plus explicit words and symbols. Color alone must never carry status.
- Keep each lane's heading, count, table and conditional formatting consistent. Use the same status colors in the secondary table.
- Names come first; make them the widest column. Amounts align right and use full baht values with separators, not `k` abbreviations. Preserve source precision where present; do not round monetary arithmetic before classification.
- Use **Received / Left** as short visible headers, with the exact definitions in the adjacent note and question descriptions. Received is not limited to today's scheduled charge.
- Avoid rainbow heatmaps, flashing animations, large donuts, borrower photos and decorative gauges. The most important visual is the named person in their status group.
- Sort each lane alphabetically by borrower display name, then immutable Borrower ID. Stable order makes returning to a name easier after refresh. The full detail table can sort by remaining amount when investigating priority.
- An empty lane stays in place with count **0** and the native empty-table state. Explain that zero means no people in that group. Never hide the lane or substitute a fake borrower row.
- Give all four tables the same generous fixed height; target roughly 10–12 readable rows on a 1080p monitor. Preserve native pagination/scroll indicators and total row counts. No silent top-N truncation and no claim that every person is visible when there is overflow.

### Native layout fallback

Try four columns first, matching the reference. If the installed Metabase version cannot fit readable names and both amounts at the owner's normal screen width, use a **two-by-two** native arrangement in this order: Overdue / Not Paid, then Partially Paid / Fully Paid. Keep all four counts near the top. Record the tested size and layout choice. Do not promise an automatic four-to-two-column breakpoint unless observed in the installed version, and do not inject custom CSS or introduce a custom app to force it.

On phones, use native stacking and verify each heading/count remains associated with its borrower table. Mobile is a usable fallback; the primary acceptance target is the continuously open desktop page.

## 3. Data and calculation contract

### One authoritative borrower population

The board uses **Collection Worklist model 77**, one row per Borrower ID with a non-null `Daily Collection Status`. Preserve its existing population, including the current treatment of `Hidden`; do not add a hidden/active-loan-only filter. People with no collection status do not appear, even if they have an active loan.

Use Borrower ID for identity, counting and navigation; display names may be duplicated. The four groups must be mutually exclusive and together cover the source population. Unexpected non-null statuses must be reported as an exception, not silently dropped into a familiar group. Validate before saving; if encountered later, expose a clearly labeled unclassified count/detail rather than a false all-clear.

Reuse the saved status as supplied. The recorded SQL in [V22](../../database/migrations/V22__olap_analytics_views.sql) establishes precedence: no collection charges → null; older unpaid collection charge → Overdue; all collection charges paid → Fully Paid; partial payment or a mixture of paid/pending charges → Partially Paid; otherwise Not Paid. Reconcile the current database definition before implementation; this task inspected maintained SQL and live Metabase model definitions, not a fresh database-view definition export.

The underlying collection set includes unpaid charges due through today and relevant charges paid/touched today. Therefore **People on board** is a better label than **Borrowers due today**: it is not simply the count of people with a charge dated today.

### Primary visuals

| Visual | Definition / source | Empty/error behavior |
| --- | --- | --- |
| People on board | Distinct Borrower ID count from 77; sum of four status counts must reconcile | Successful empty population = 0; failed query remains an error |
| Receipts today | Sum of `Receipts Today` from 77, for board participants | Retain signed corrections; not total business cash inflow |
| Left to collect | Sum of `Amount Remaining` from 77 | Includes older unpaid collection amounts; do not add Overdue Amount again |
| People fully paid | Fully Paid distinct borrower count / total board count; show fraction and percent where native display supports it | Denominator 0 → N/A, not 100%; fallback percent card plus adjacent count context |
| Four lane counts | Exact status counts; reuse 162 or existing equivalent questions where semantics match | Keep explicit zero for empty groups |
| Four lane tables | Model 77 filtered by exact status; Borrower, Receipts Today, Amount Remaining | Retain Borrower ID in result/navigation metadata; do not show raw IDs unless needed to disambiguate names |
| Full collection detail | Model 77; columns below | Full coverage, searchable/filterable |

The completion percentage measures **people**, not money. It is a current position and can decrease when new dues arise, corrections post or the date changes. Do not present it as monotonic achievement.

### Two different meanings of “collected” — keep them distinct

| Existing measure | Meaning to preserve |
| --- | --- |
| Model 77 `Receipts Today` | Principal Paid + Interest Paid from Repayment Ledger 71 where Payment Date is Bangkok today, aggregated by borrower before joining |
| Model 77 `Amount Collected` | Existing governed borrower collection-linked amount received today; preserve separately in detail |
| Model 77 `Amount Due` / `Amount Remaining` | Existing collection-set dues / remaining balances through today, not just charges dated today |
| Model 73 `Amount Due Today`, `Amount Collected Today`, `Amount Outstanding Today` | Existing portfolio measures over **charges dated today**; the collected measure is those charges' `Total Paid` |

Do not infer **Due = Receipts Today + Left**. Prior payments and receipts for older charges make that generally invalid. Do not divide Receipts Today by today's charge dues and call it collection completion. Do not infer payment status from the existence of a repayment row.

Keep the original four amount cards' information in a compact secondary **Charges dated today** table: Due / Paid against those charges / Remaining / Paid percentage. Reuse model 73 fields; when Due = 0, the displayed percentage is N/A even though the legacy field may return zero. This report-only display guard must not change the shared model. Preserve signed values and investigate anomalous ratios rather than clamping them silently.

### Secondary detail and navigation

Full table columns: **Borrower, Status, Collection due, Collection received today, Left to collect, Receipts today, Overdue balance**. Use the exact model 77 fields above; keep the two receipt concepts explicitly labeled. Overdue balance is context and must not be added to Left to collect.

Provide new **Collection borrower** and **Collection status** filters connected only to this secondary table. Keep the main monitoring board and its totals unfiltered so a forgotten filter cannot hide people. Label the controls/section **Detail filters only**. No date picker: the source is a current collection view and cannot reconstruct a selected past day's board.

Clicking a borrower should open the existing Borrower Insight destination with the immutable ID mapped to its current borrower parameter. Verify the actual saved mapping and generated URL. Prefer a separate browser tab where supported so the monitor stays open. Do not reuse or modify a global borrower parameter in a way that changes other dashboard tabs. If native navigation cannot provide this safely, use a normal read-only detail link; do not add payment/contact actions.

## 4. Monitoring and freshness

- Bind all current-date logic to **Asia/Bangkok**, not the browser's timezone. Display the actual business date. No hardcoded date or timestamp text.
- Propose native one-minute auto refresh for active monitoring; provide a verified URL/control recipe that opens **the new tab**, with its correct saved ID and refresh interval. Do not configure an automation, notification subscription or browser script.
- Verify how the installed version refreshes tabbed dashboards and whether inactive tabs also run. Measure actual refresh-cycle duration and source load before settling on one minute. Reusing a model does not itself guarantee one database query per refresh.
- Read-only queries may run at slightly different instants. A borrower can briefly appear missing/duplicated across independent lane requests during a concurrent payment. Reconcile on the next completed refresh before reporting a source issue; the page is not an atomic event stream.
- Prefer a compact new helper question with query-builder current time over an existing one-row source for **Queried at**. Confirm timezone and cache behavior. This is the time that helper ran, not proof that every card succeeded or that AppSheet has synced.
- Do not invent a global green “all data fresh” indicator. Keep native card errors visible. If a query timestamp cannot be implemented honestly with supported features, use the native refresh indication plus a short explicit freshness note and document the limitation.
- Unsynced AppSheet payments are not visible. A stale network/session, sleeping browser or query failure must not be represented as zero collections or a completed day. Verify behavior on resume and a manual refresh.
- At Bangkok midnight, the next successful query must change the displayed date and recalculate the current board. Verify date expressions using controlled synthetic cases; record a natural rollover check as pending if not observed. Do not change the workstation clock or production data.
- Do not claim “just paid,” display last-payment times, flash moved rows, show promises-to-pay or build an hourly progress history from model 77. It has no payment timestamp/event-history fields. A date-only repayment field is insufficient. These are separate possible enhancements, not execution prerequisites.

Official capability references, checked for this design: [dashboard auto refresh and fullscreen](https://www.metabase.com/docs/latest/dashboards/introduction), [table conditional formatting](https://www.metabase.com/docs/latest/questions/visualizations/table), and [dashboard filter mapping](https://www.metabase.com/docs/latest/dashboards/filters). These describe native options; the executor must verify them in the installed version. Use text/symbol headings and conditional cell colors if colored panel backgrounds are unavailable. Do not revive decorative scalar ranges that were removed in the earlier scalar-hover cleanup.

## 5. Safe additive implementation

This is the execution plan for the model the owner hands this design to. **Do not execute it as part of the design task.**

1. Read the current tracker, applicable repository rules and current dashboard metadata. Confirm dashboard 3, original tab 9, reporting source identity and the current Open release. Reconcile intervening edits; never replay a stale full-dashboard payload.
2. Capture scoped private rollback metadata: current dashboard, affected/reused questions and relevant filter mappings. Keep secrets, financial results and original screenshots outside Git. Existing unrelated tabs/questions/models remain unchanged.
3. Create a genuinely new tab named **8R · Collection Monitor** directly after tab 9. Record its assigned ID; do not guess it, renumber existing tabs or repurpose empty tab 17.
4. Build new query-builder questions over existing models for the lane tables, new metrics and detail. Reuse an unchanged equivalent question only when presentation can be safely overridden on the new placement. Never edit a shared saved question merely to change the new tab's color, fields or sorting; clone/create the distinct variant instead.
5. Use native table formatting, heading cards, counts, percentage display and filter mapping. No per-borrower manually maintained cards. No new schema, view, physical column, snapshot, grant, schedule, source/model rewrite or data backfill is required by this design.
6. Prototype one lane and the refresh presentation first. Check names/amount readability at the target desktop sizes, then replicate consistently. Use the specified native fallbacks without adding custom infrastructure.
7. Verify the full board, secondary filters, borrower links, errors, overflow and refresh. Capture sanitized evidence and private screenshots as appropriate. Do not post a payment, modify a borrower or send a collection message to test it.
8. Complete applicable exact Metabase dictionary entries, release log/manifest and required report-publication records under the current project process. Keep this document as proposed design; record actual implementation and deviations separately. Do not mark the original collection tab retired or the new design owner-accepted without the corresponding decision.

The master promotion checklist applies when authorized report publication begins; use the report-only applicable rows, not an AppSheet/SQL deployment routine. The request here is a design handoff, and final replacement of the old tab remains deferred.

### Rollback and later cutover

During review, the original tab remains the working fallback. To undo the additive implementation, remove only the new tab/placements and its exclusive filters, and recoverably archive newly created questions only after checking dependencies. Preserve intervening dashboard work; do not restore a whole old dashboard over other changes.

After explicit owner cutover approval, replace the old tab's navigation position/name using the tested new tab, then retire old placements and only genuinely unused questions. Do not include that cutover in the initial review-tab execution. No final release tag, original-tab removal or shared-model cleanup is part of this design-only task.

## 6. Acceptance checks for the executor

| Check | Expected result |
| --- | --- |
| Preservation | Original tab 9, all its placements/question definitions, other tabs, source, permissions and existing filters unchanged |
| Borrower coverage | Unique Borrower IDs; sum of four counts equals total; no silent exclusions or duplicate names treated as one person |
| Status precedence | Older unpaid charge plus a receipt today stays Overdue; received amount remains visible |
| Partial and completed | Partially paid stays distinct; Fully Paid does not imply closed loan or zero total principal |
| Null/zero cases | Zero-count groups stay visible; no-status borrower excluded; empty board does not show 100% completion |
| Monetary reconciliation | Lane/detail/board totals agree at a consistent read point; receipts and remaining use their stated scopes |
| Today-only charge summary | Reconciles independently to model 73; no forced equality with collection-set receipts/balances |
| Corrections/multi-loan cases | Signed corrections retained; one borrower across several loans is counted once; no repayment/charge join multiplication |
| Navigation and filters | Correct Borrower ID opens existing detail; secondary filters affect only detail; clear returns all detail rows |
| Visual recognition | All four headings/counts and several borrower rows visible together on primary desktop; clear color + word + symbol; no mandatory horizontal table scrolling |
| Overflow | Full population accessible; visible count/pagination; refresh does not silently hide lower rows |
| Refresh | At least three consecutive cycles measured; no accumulating requests; displayed timestamp meaning truthful; inactive-tab behavior and browser resume checked |
| Error/empty distinction | Failed queries are visible errors; successful zero/empty states stay distinct; no fabricated live/healthy badge |
| Date boundary | Bangkok date used consistently; controlled rollover cases pass; any unobserved natural midnight test explicitly pending |
| Ordinary viewer | Intended existing partner/viewer access can use the page and links without extra permissions |

Use isolated synthetic query fixtures for edge cases and read-only live reconciliation for current data. No production financial test writes. Record actual findings, not blanket “passed” claims. Owner review should specifically judge name readability, lane ordering, colors and whether the board is comfortable to leave open throughout the day.

## 7. Supporting repository references

- [Collection Worklist SQL](../../scripts/metabase/models/collections.sql) and [status summary SQL](../../scripts/metabase/models/collection-summary.sql).
- [Borrower model SQL](../../scripts/metabase/models/borrowers.sql), [repayment model SQL](../../scripts/metabase/models/repayments.sql), [portfolio model SQL](../../scripts/metabase/models/portfolio.sql).
- [R016 page/source contract](../r016-20260922/README.md), especially Daily Collection and its separate receipt meanings.
- [Current solution ownership](../../Documents/Solution_Design.md), [release tracker](../../Documents/Release_Tracker.md), [Metabase tooling guide](../../scripts/metabase/README.md).

Design validation completed: live reference layout inspection; current Metabase GUI and metadata inspection; maintained status/amount SQL review; native-capability documentation review; Markdown/link checks. Implementation, refresh measurements, borrower transitions and owner visual acceptance remain for execution.

## Implementation follow-up

The owner subsequently authorized implementation. [R025 implementation and verification](../r025-20260924/README.md) records tab 19, native presentation refinements and actual test limits. The original collection tab remains unchanged; this document remains the design baseline.
