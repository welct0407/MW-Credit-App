# R036 — Collection status colors (25 September 2026)

Purpose: align the canonical Metabase Collection Monitor's four payment-status colors with the OLTP borrower formatting. The owner requested Not Paid red, Partially Paid orange, Overdue purple and Paid green.

Changed live objects: Metabase questions 240–248, limited to eight lane titles, four lane-table highlights and four detail-table highlights. Their queries, dashboard 3/tab 19 placements, tabs and parameters remain unchanged. No DB, AppSheet, access, job or financial-data changes.

Changed repository files: `scripts/metabase/CollectionMonitor.mjs`, `scripts/metabase/AlignCollectionStatusColors.mjs`, the owning Metabase dashboard dictionary, three core release/environment records and `outputs/r036-collection-status-colors/`. Starting Git commit: `a7eb42fabf6eae9671e4bc19147d8cbfb6c9e903`. Preserve pre-existing unrelated untracked work.

Rollback: a private snapshot under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-colors/before.json` holds the pre-change dashboard and affected question metadata. Restore just the prior names and visualization settings after checking later edits.

Checks: four targeted saved-state checks passed; Chrome reload confirmed the updated labels and visible row colors. Dictionary validation passed. The visual check used the Metabase Chrome profile; no separate partner device check was performed. [Evidence](../outputs/r036-collection-status-colors/README.md). Status: live visual refinement, R036 Open; no release freeze or tag.

## Owner-requested order refinement — 25 September 2026

Reordered the two four-column rows and the detail status choices to Not Paid, Partially Paid, Overdue, Fully Paid. Moved existing placements for questions 240–247 by column only; reordered the static-list parameter values and the four visual color rules on question 248. Saved queries, other placements, tabs and filters remain unchanged. Four targeted checks passed, and Chrome showed the new left-to-right order and selector choices. [Order evidence](../outputs/r036-collection-status-colors/order-verification.json).

The pre-reorder dashboard and detail question are privately preserved at `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-order/before.json`; starting commit `e5b24679c0c04bd7774c5e646601d8df58877f0e`. The owning dashboard dictionary, runner, core records and implementation note were updated. R036 remains Open; no DB/AppSheet changes, freeze or tag.
