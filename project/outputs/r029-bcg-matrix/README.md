# R029 — equal-quadrant borrower matrix

## Scope and current state

SQL/report-only implementation authorized by the owner on 25 September. **DEV and PROD V43 applied and validated; the matrix is live on dashboard 3/tab 31.** Both AppSheet apps, all source bindings, workflows, existing ratings and categories remain unchanged. No operational table/column or financial write. R029 captured SQL pin `de0a72a45e64051b5c816c5bce66522c4a33e4ea`; R030 is now the sole Open development release.

[Accepted design](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/outputs/bcg-matrix-chart-design-20260925/HANDOVER.md). Additive `reporting_borrower_matrix_plot_v1` projects the existing V3 source into display coordinates: stronger health left, higher contribution above; boundaries at50 in a fixed0–100 frame. Modified schedules use x75 as categorical placement, preserving measured score. Invalid/unclassified rows are explicit, never forced into Dog.

## Native rendering refinement

Installed Metabase v0.63.18.1 native scatter cannot configure the whole centered cross. A synthetic prototype (question 273, private collection4) proved that its native line renderer can draw isolated points with missing-values=None, alongside two marker-free interpolated reference series. Four category series carry only real borrower points. Three display rows per borrower (one point and two null guards) prevent connecting lines. Four reference rows establish boundaries and fixed extent; these are never borrowers or financial values. The native legend is displayed; reference lines are explicitly named and are not borrower categories. Standard legend toggling is reversible; use a report refresh to restore the saved view.

The displayed x is rounded to 0.001 and offset deterministically within 0.0001 to prevent the native pivot from aggregating identical x positions. This is below 0.01pixel at normal screen widths, preserves category membership, is not random, and does not change stored mathematical coordinates. Reference vertical line spans50±0.000001: visually vertical, centered to far below1pixel. Companion details retain every borrower, including overlapping points. Raw metrics are additional tooltip columns. No edition upgrade, plugin, hosting or custom application is introduced.

The native chart adapts its overall aspect ratio to the dashboard viewport; the centered cross guarantees four equal rectangles. A permanently square plot at every viewport is a native-layout limitation, not a reason to change metrics. Quadrant names are placed immediately above/below the plot rather than injected into a custom renderer. The original independent scatter question 266 remains restorable.

## Evidence

- `migration-chain.txt`: full 43-migration rebuild, no-op second application, checksum tampering rejected.
- `development-backup.json` and `production-backup.json`: private dumps restored; all 26 table fingerprints match.
- `development-rehearsal.json`, `production-rehearsal.json`: actual V43 tested on restored copies, 186 synthetic inputs including invalid/boundary cases, no source-row changes.
- `development-verification.json`: live DEV coordinate/source parity. `dependency-preflight.json`: five existing source definitions match DEV/PROD; identities verified.
- `prototype.json`: synthetic native feasibility configuration; no financial data.
- `metabase-state.json`: dashboard 6 backup and private before-question/layout evidence. `metabase-plan.json`: intended new questions.

## Recovery and limits

Restore the saved review-tab placement/layout, reconnecting original question 266. Old question and source V3 are unchanged. Retain unused additive V43 if reverting; financial DB restoration is not required for chart rollback. Private backup/question definitions are outside Git. Dashboard copy shares original questions; full private definition is retained too.

No AppSheet readiness/upgrade is claimed. Existing R026 app issues remain outside this SQL/report scope and owner-deferred; unchanged app contract evidence from R028 is reused. No RC required. Mobile uses the same equal-area cross plus a full borrower list; exact duplicate/nearby points can overlap, but no borrower is dropped from details or counts.

## Verified production result

[Live source/coordinate parity](production-verification.json): 23 borrowers, 4 Stars  / 8 Cash Cows  / 5 Question Marks  / 6 Dogs; zero changes to original source fields and zero quadrant mismatches. [Actual Metabase reader](metabase-verification.json) executes both saved questions:274 matrix and275 complete details. Display query has 73 rows: 23 points, 46 null guards and 4 explicit line vertices; the governed SQL view stays one row per borrower.

[Visual checks](visual-verification.json): desktop and 390 px mobile dividers are centered within 0.001 CSS pixel. All23 mobile marker nodes match category counts. Point interaction shows the actual unchanged payment score and original metrics. Native tooltips also expose normalized positions; those are not ratings. Labels explicitly identify each quadrant location. The browser's normal viewport was restored after testing.

[Final saved layout](metabase-saved.json), [saved definitions](saved-question-definitions.json), [closure checks](closure-verification.json): 33 review-tab placements, 12 tabs/217 placements total. Other tabs and all dashboard filters unchanged. Existing four category count/list pairs were rearranged to match the classic orientation; queries are unchanged. Original question 266 is retained, synthetic private question 273 recoverably archived. No additional app or RC was created.

[Dictionary catalog](dictionary-catalog.json) and [validation](dictionary-validation.txt): exact new view in DEV/PROD, both questions and dashboard metadata documented; zero validation errors. Core records and release log updated. Final evidence tag: `R029`.
