# R036 — Collection status colors (25 September 2026)

Purpose: align the canonical Metabase Collection Monitor's four payment-status colors with the OLTP borrower formatting. The owner requested Not Paid red, Partially Paid orange, Overdue purple and Paid green.

Changed live objects: Metabase questions 240–248, limited to eight lane titles, four lane-table highlights and four detail-table highlights. Their queries, dashboard 3/tab 19 placements, tabs and parameters remain unchanged. No DB, AppSheet, access, job or financial-data changes.

Changed repository files: `scripts/metabase/CollectionMonitor.mjs`, `scripts/metabase/AlignCollectionStatusColors.mjs`, the owning Metabase dashboard dictionary, three core release/environment records and `outputs/r036-collection-status-colors/`. Starting Git commit: `a7eb42fabf6eae9671e4bc19147d8cbfb6c9e903`. Preserve pre-existing unrelated untracked work.

Rollback: a private snapshot under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-colors/before.json` holds the pre-change dashboard and affected question metadata. Restore just the prior names and visualization settings after checking later edits.

Checks: four targeted saved-state checks passed; Chrome reload confirmed the updated labels and visible row colors. Dictionary validation passed. The visual check used the Metabase Chrome profile; no separate partner device check was performed. [Evidence](../outputs/r036-collection-status-colors/README.md). Status: live visual refinement, R036 Open; no release freeze or tag.
