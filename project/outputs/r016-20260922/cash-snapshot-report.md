# R016 part 2 — Cash Position report

23 September 2026. Owner resumed the held 2R report work using the part-1 handoff. Dashboard 3, tab 14 is updated in the existing partner-only report. Starting Git: `04624908fa23fc61215ec15000fbe1d3305e613c`, clean. Database remains DEV/PROD V37; no new migration, financial write, grant, AppSheet change or deployment candidate.

Current continuation: the page is now **2 · Cash Position**; original cash tabs are retired. Its routing and nine placements remain unchanged. The [canonical statement contract](statement-cleanup/README.md) supersedes old report counts and installer guidance below.

## Saved behavior

| Visual | Source and date rule |
| --- | --- |
| Total cash pool, principal outstanding, utilization gauge | Existing live Portfolio Overview model and shared questions 47, 48, 68. Always today, independent of the position selector. |
| Remaining lending capital | Selected today: live Portfolio Overview Available Cash. Past: selected Daily Cash Snapshots Remaining Lending Capital. |
| Net cash balance | Selected today: signed live account balances, unavailable if an account opening is missing. Past: stored portfolio Cash Balance EOD. |
| Position & freshness | Selected date, Live on refresh / Hourly snapshot, query time / stored Generated At, availability. Bangkok dates and times. |
| Net cash by holder | Sum signed account balances after selecting the date. A holder with any unknown balance has an unknown total. |
| Account balances | Signed balance and availability for each account at the selected position. Current account labels; no fabricated historical labels. |
| Daily closing positions | Completed dates only, directly from stored portfolio snapshots. Separate trend filter, default previous 30 days. Remaining lending capital and net cash are separate lines. |

The position selector defaults to Today. A range selects its latest calendar date within the available reporting range through Bangkok today, never a sum of closing balances. A cleared selector uses today. A completely out-of-range selection returns unavailable, not zero or a fallback to another date. A missing stored date is flagged; it is not replaced by an older snapshot. Current account/portfolio queries do not use today's hourly snapshot balances.

Historical cash is unknown before verified openings (currently consolidated coverage starts 18 September 2026). Later corrections can restate snapshots through the existing rebuild routine. Hourly refresh is the configured schedule, not a claim of a closed immutable audit archive; the displayed generation time identifies actual freshness. Live means queried when the report refreshes, not streaming updates.

Removed the separate Partner advances, Business cash held and retained-profit/reconciliation bridge placements from 2R. Negative balances stay in net cash and account/holder detail. Existing questions 200/201 and shared older models remain available for recovery and other report definitions. No shared card was changed except question 202, which is used only by 2R and now reads stored completed-day history. The other twelve tabs, their placements, existing filter definitions, twenty old models, three old snippets and partner permissions are preserved.

## Implementation

- Thin models 205 **Daily Cash Snapshots** (15 fields) and 206 **Account Cash Snapshots** (17 fields), collection 8; immutable Snapshot ID keys and explicit account/holder identity fields. Source views are the already-granted V37 snapshot views. No metadata sync or broader access required.
- Shared snippet 4 **Cash position source routing** chooses the live/past branch and applies the date selector. It performs selection and simple account sums, with no transaction-history reconstruction or retained-profit calculation.
- Questions 207–211 supply selected lending capital, net cash, freshness, holder totals and account detail. Question 202 is the stored trend. Nine visual placements in 2R; overall report has 157 placements, 124 distinct questions, 22 models / 319 fields, four snippets and thirteen tabs.
- Maintained installer: `scripts/metabase/CashSnapshotReport.mjs --install`. Inspection/backup: `Inspect-CashSnapshotReport.mjs`; it refuses to overwrite the baseline. Verifier: `Verify-CashSnapshotReport.mjs`. The old three-page installer is guarded against reinstating the superseded 2R design.
- Exact models and layout: [plan](cash-snapshot-report-plan.json), [state](cash-snapshot-report-state.json), [model inventory](models.json). Database refresh/rebuild contract stays in [part 1](daily-snapshots/README.md).

## Verification and recovery

[49 focused checks](cash-snapshot-report-verification.json) pass: live today, yesterday, opening day, pre-opening day, past/current ranges, empty/future dates, source reconciliation for all displayed account/holder balances, timestamp provenance, trend parity and exclusion of today, model grains/metadata, all nine default queries, and preservation of other tabs/shared definitions/permissions. Four read-only synthetic cases additionally verify negative and unknown balances through the real live/past routing logic without source writes. No financial values are published in the evidence.

Desktop and 390 × 844 viewport review passed. Exercised Yesterday through the current date-selector UI and verified the source/timestamp switch. Shortened clipped notes, transposed freshness into a two-column table and increased its desktop height so all four rows are visible. Normal account/freshness tables and page fit the mobile viewport. Restored Today and the normal desktop viewport. This is viewport QA, not a physical-device test. The existing custom-range picker limitation remains outside this change.

Private exact rollback definitions, permission graph, snippets and dictionary before-image are under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/cash-snapshot-report-before`. Restore only tab 14 placements and question 202 from that baseline, preserving any later changes elsewhere; remove/archive the new questions/snippet/models only after removing their dependencies. Existing financial data and V37 snapshot engine are unaffected. The dictionary edit preserves every workbook part except the two affected worksheet XML parts.

Status: part 2 implemented and verified for owner review. Full R016 acceptance, remaining review decisions, migration-key retirement and final unique release tag remain pending. Repository publication is a checked completion checkpoint, not full R016 acceptance.
