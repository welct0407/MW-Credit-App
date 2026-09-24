# R025 — 8R Collection Monitor review tab

Status: **Implemented for owner review; R025 remains Open. Original tab retained.**

Open [8R with one-minute refresh and fullscreen controls](https://reports.mw-credit.com/dashboard/3?tab=19#refresh=60&fullscreen), or [8R in the normal dashboard](https://reports.mw-credit.com/dashboard/3?tab=19).

## Delivered

Dashboard 3 now has **12 tabs / 210 placements**. New tab **19**, **8R · Collection Monitor**, sits immediately after original **8 · Daily Collection** (tab 9). All 189 original placements, their questions, existing filters and original tab names/order are preserved. The empty Tab 11 remains untouched.

Four simultaneous borrower groups use red, orange, blue and green cues: **Overdue / Not paid / Partially paid / Fully paid**. Stable alphabetical rows show **Borrower / Received / Left**, with full baht amounts and an immutable hidden borrower key. Zero groups remain visible. The table's native pale formatting emphasizes remaining balances and colors the row lightly; colored heading symbols remain visible even when a group is empty.

The four top cards show, left to right: receipts today, left to collect, percentage of people fully paid, and paid percentage of today’s charges. People on board was removed from the dashboard; its saved question remains for recovery. A visible Bangkok date/query-time helper supports monitoring. A full detail table, separate today-charge summary and unclassified-status counter follow the board. New borrower/status selectors filter **only the detail table**. The borrower picker uses display names with Borrower ID values.

No changes to PostgreSQL schema/data, source models, grants, AppSheet definitions, financial workflows, schedules, notifications or collection permissions. This is an additive report review implementation, not replacement of the canonical collection tab. Owner visual acceptance and final cutover remain separate.

## Exact implementation

| Element | Saved question IDs |
| --- | --- |
| Receipts / remaining / people completion / today-charge paid % | 237 / 238 / 239 / 252 |
| Retained, no dashboard placement: people count | 236 |
| Overdue count / list | 240 / 241 |
| Not paid count / list | 242 / 243 |
| Partially paid count / list | 244 / 245 |
| Fully paid count / list | 246 / 247 |
| Full detail / today-charge summary | 248 / 249 |
| Date and query time / unclassified count | 250 / 251 |

All 17 questions use the query builder over existing models. The exact saved specification, placement IDs, formatting and new parameter mappings are in [plan.json](plan.json); assigned IDs and private rollback location are in [state.json](state.json). Source definitions remain governed by models 69, 71, 73, 77 and 162. The live borrower-view definition was read privately to confirm status precedence.

Implementation: [CollectionMonitor.mjs](../../scripts/metabase/CollectionMonitor.mjs). Verification: [Verify-CollectionMonitor.mjs](../../scripts/metabase/Verify-CollectionMonitor.mjs). Do not replay either install/refine path over later owner changes without a new scoped baseline; refinements apply only to this review tab's questions and placements.

## Meaning of the numbers

- Board population = current model 77 rows with a collection status. No additional Hidden/active-loan filter.
- **Received** = posted principal + interest receipts dated Bangkok today for each board participant. Signed corrections are retained.
- **Left** = governed collection-set remaining amount, including older dues. Overdue balance is already included; never add it again.
- **Fully paid %** = count of Fully Paid people / all board people. An empty board returns an unavailable percentage; sums/counts return zero. Unexpected statuses remain in the denominator and detail and are counted by the separate exception card.
- Overdue takes priority over a partial payment today. A payer with an older unpaid charge stays in Overdue while their received amount remains visible.
- **Charges dated today** has a different scope: dues, Total Paid and remaining for charges whose charge date is today. Its percentage is unavailable when there are no dues. It is not reconciled by forcing `Due = today's receipts + Left`.

## Verification

[38 checks passed](verification.json), covering preservation, permissions, source models, actual dashboard-query execution, exact borrower coverage, group partition, amounts, immutable-key filters, no-match filters, independent governed-view reconciliation, a live overdue payer, today-charge scope, synthetic status cases, Bangkok midnight boundaries and empty-board zero/null behavior. Financial results and borrower identifiers were not published in evidence.

The initial 16 saved queries completed sequentially in **3.6 seconds** in the final API verification pass. This is an observed test duration, not a load benchmark or guaranteed refresh latency. [Preflight](preflight.json) records the earlier read-only query checks.

Chrome checks: four status columns visible together on the owner's desktop; names and both monetary columns readable without horizontal table scrolling; no blank-lane substitution; the zero Partially Paid lane retained; the native fullscreen and one-minute refresh controls active. The helper clock advanced through Bangkok **18:41, 18:42, 18:43 and 18:44** while monitoring; the intermediate 18:43 value was observed during the filter check. No additional browser refresh script was installed. A Partially Paid detail filter returned no rows while the main population card stayed unchanged. Clicking a borrower opened the correct Borrower Insight filter by immutable key. Returning/loading the monitor restored live queries.

Layout was inspected at the normal desktop viewport and with a 1920 × 1080 override. The 390 × 844 browser override scaled the desktop canvas rather than providing a trustworthy physical-phone rendering; physical mobile acceptance remains unverified. The override was reset. This page's primary target is desktop monitoring.

## Deliberate native limitations

- Borrower drill-through uses the same browser tab in this installed version. Keep the monitor open separately if investigating a borrower while monitoring; the report does not promise a new-tab click behavior.
- Tables retain native scrolling/overflow. The monitor shows all four groups together, but a larger group can require scrolling. No top-N filter hides people.
- Query time describes the helper query only, not an atomic timestamp for every card. Separate card queries can briefly straddle a concurrent payment.
- Automatic refresh was observed on the active tab. Inactive-tab query scheduling, source-level load, long browser suspension/session expiry and injected network failure were not instrumented. Native query errors remain visible; no synthetic green health badge is shown.
- Ordinary partner access inherits the unchanged collection permissions. A fresh sign-in on another partner's physical device was not performed.
- Controlled Bangkok midnight fixtures passed. A natural midnight rollover and live borrower status transition were not forced or observed; no production payment was posted for testing.
- The design's exact palette/colored panels were implemented using native pale table formatting and colored symbols; no CSS injection, per-borrower cards or custom application was introduced.

These limitations do not change the existing operational tab. Review the new board's readability, colors, layout and refresh experience before requesting cutover.

## Recovery and scope

Private pre-change dashboard, collection permissions and source-model metadata: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r025-collection-monitor/`. Later scoped refinement baselines are retained alongside it. Starting Git commit: `f4b8ffd86a73667b0d30c429a7b6d85da6151a5b`.

To abandon 8R, remove only tab 19, its 21 placements and the two `collection-detail-*` parameters, then check dependencies before recoverably archiving its exclusive questions 236–252. Do not restore the entire old dashboard over unrelated later work. Original tab 9 remains the working fallback throughout review.

R025 stays Open through review. No R026 handoff, release-scope freeze, final R025 tag, original-tab deletion or final cutover occurred. The owner's instruction to implement 8R authorizes this parallel review surface; subsequent canonical replacement remains deferred. See the [design handoff](../collection-monitor-design-20260924/DESIGN.md), [change log](../../Change%20Logs/CHANGE_NOTES_R025_2026-09-24.md) and [release checklist](promotion-checklist.md).

## Top-row refinement — 24 September 2026

At owner request, removed the People on board placement, shifted the other three cards left and added scalar question 252, **Today’s charges · paid %**, at the right. The formula is unchanged from the lower today-charge table: Total Paid against charges dated Bangkok today / amount due on those charges; zero due returns unavailable. The lower breakdown remains. Six targeted checks passed: matching percentage, saved-query execution, exact order, and preservation of all other placements, tabs and filters. See [refinement evidence](top-card-refinement.json). No database changes. Recovery: restore question 236 in the first position and shift 237–239 right using the private pre-refinement snapshot. The earlier 38-check result remains initial implementation evidence.
