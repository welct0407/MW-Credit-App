# R024 — Swap Performance and Borrowers tab order

Owner requested Performance as tab 5 and Borrowers as tab 6. Dashboard 3 retains tab IDs 18 and 6; change only their displayed names and positions. All 189 placements, saved questions, query settings and dashboard filters remain as captured.

The exact before-image is private at C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r024-tab-order/dashboard.json. Rollback restores its two tab names and positions while preserving any later work. Starting Git commit: dffa437c29a762f5b87a10b14a32063da8df07aa. Exact intended order is in plan.json; maintained publisher is scripts/metabase/SwapPerformanceBorrowersTabs.mjs.

No database or AppSheet change. Verification pending.

## Completion

Metabase derives tab positions from the order of the submitted tabs array. The first save changed names but left the old order; the corrected save submitted the tabs in the desired sequence. Final API readback passed three checks: tab names/order, all 189 placements and tab memberships, and dashboard parameters. Chrome confirmed both tabs and Borrower content. Dictionary validation passed with zero errors.

Released R024; R025 remains Open. The unrelated untracked dictionary-reconciliation output was preserved. No remaining manual test for this tab-order change.
