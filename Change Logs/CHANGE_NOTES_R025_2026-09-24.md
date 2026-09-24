# R025 — Collection Monitor review implementation

Date: 24 September 2026, Asia/Bangkok. Status: **Open; additive 8R implemented for owner review.**

## Scope and authorization

Owner requested implementation of the previously designed 8R review page while retaining the current collection page until final cutover. Dashboard 3 gained tab 19 immediately after original tab 9, with 16 isolated query-builder questions, 21 placements and two detail-only filters. No database change is required or performed.

[Implementation, definitions, evidence and limitations](../outputs/r025-20260924/README.md). [Exact saved plan](../outputs/r025-20260924/plan.json).

## Changes and refinements

- Four simultaneous colored status groups; named people, today's receipts and remaining balances; stable alphabetical order.
- Four summary cards; truthful Bangkok query-time helper; separate today-charge summary; full detail and unexpected-status counter.
- Compact aligned layout, colored symbols and native pale table formatting. The initial mixed-height heading row caused uneven packing and was corrected before review.
- Empty-board sums explicitly return zero; people completion remains unavailable with no people, and its denominator includes unexpected statuses.
- Borrower filter displays names but filters by immutable key. Borrower links route to the existing Insight tab with that key. Status and borrower detail filters leave the main board unchanged.
- All 189 original placements, saved queries/formatting, original tabs/filter definitions, five shared source models and collection permissions preserved.

## Checks

38 saved-state/source/query checks passed, including actual dashboard filter endpoints, independent read-only PostgreSQL view reconciliation, a current overdue payer, synthetic status/midnight cases and empty-board behavior. Chrome verified simultaneous status columns, no-results group, native refresh clock advances, detail-only filtering and borrower drill-through. Final 16-query sequential check: approximately 3.6 seconds. Sanitized verification contains no financial rows.

No production financial writes, AppSheet changes, database DDL, grants, scheduled jobs or notifications. The live source-view definition was read privately. Physical partner/mobile sessions, natural midnight rollover, inactive-tab scheduling and injected failure/suspension tests remain explicitly unverified; see implementation limits.

## Rollback and documentation

Starting commit `f4b8ffd86a73667b0d30c429a7b6d85da6151a5b`; existing unrelated dictionary reconciliation work preserved and excluded from this task's publication. Private rollback metadata resides outside Git under `Documents/ChatGPT/AppSheet-Loan-Project/r025-collection-monitor`.

Rollback removes only the added review tab/placements/filters and archives exclusive questions after dependency checks. Original tab remains available. Owning dashboard dictionary, tracker, inventory, development differences, tooling guide and review design link updated with the final batch.

No final cutover, successor-number allocation, release freeze or release tag. Keep R025 Open while the owner evaluates 8R. Repository publication covers the sanitized implementation artifacts, not private backups.

## Owner top-row refinement — 24 September 2026

Replaced the People on board placement with question 252 (Today’s charges · paid %), ordered 237 / 238 / 239 / 252. Preserved question 236 for recovery and retained the lower today-charge breakdown. Updated the maintained layout/specification, plan, dictionary and implementation notes. Six targeted API checks passed; formula matches question 249. Private dashboard snapshot captured before writes at baseline 487cada. No DB/source/filter changes. R025 remains Open; no cutover. Visual acceptance remains with owner. Evidence: `outputs/r025-20260924/top-card-refinement.json`.

## Authorized canonical replacement — 24 September 2026

Owner accepted 8R and requested replacing tab8. Scope frozen at the timestamp in outputs/r025-20260924/freeze.json, pinned to 3a5c93e; handoff published in b2e3efe, opening R026. Backed up the actual dashboard before cutover. Renamed tab19 to 8 · Collection Monitor and removed tab9 with 26 placements. All remaining placements, filters, question definitions and old saved questions preserved. Six cutover checks passed; Chrome reload confirms canonical tab and summary order. An initial verifier compared server update timestamps; corrected it to compare tab identity/name/order and reran verification without repeating publication. No runtime defect or DB/AppSheet change.

Updated dictionary, core records, manifest, README and single checklist. Recovery uses the private pre-cutover snapshot to recreate old tab/placements without overwriting later work. R025 Released, final tag R025; R026 Open. Native monitoring limitations in README remain.
