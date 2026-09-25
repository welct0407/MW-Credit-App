# R029 — equal-quadrant borrower matrix

## Scope and current state

SQL/report-only implementation authorized by the owner on 25 September. DEV V43 applied and validated; production promotion pending. Both AppSheet apps, all source bindings, workflows, existing ratings and categories remain unchanged. No operational table/column or financial write. R029 remains Open until the exact tested SQL package is captured at promotion start.

[Accepted design](../bcg-matrix-chart-design-20260925/HANDOVER.md). Additive `reporting_borrower_matrix_plot_v1` projects the existing V3 source into display coordinates: stronger health left, higher contribution above; boundaries at50 in a fixed0–100 frame. Modified schedules use x75 as categorical placement, preserving measured score. Invalid/unclassified rows are explicit, never forced into Dog.

## Native rendering refinement

Installed Metabase v0.63.18.1 native scatter cannot configure the whole centered cross. A synthetic prototype (question273, private collection4) proved that its native line renderer can draw isolated points with missing-values=None, alongside two marker-free interpolated reference series. Four category series carry only real borrower points. Three display rows per borrower (one point and two null guards) prevent connecting lines. Four reference rows establish boundaries and fixed extent; these are never borrowers or financial values. Legend is hidden so users cannot hide the axis-anchor series accidentally.

The displayed x is rounded to0.001 and offset deterministically within0.0001 to prevent the native pivot from aggregating identical x positions. This is below0.01pixel at normal screen widths, preserves category membership, is not random, and does not change stored mathematical coordinates. Reference vertical line spans50±0.000001: visually vertical, centered to far below1pixel. Companion details retain every borrower, including overlapping points. Raw metrics are additional tooltip columns. No edition upgrade, plugin, hosting or custom application is introduced.

The native chart adapts its overall aspect ratio to the dashboard viewport; the centered cross guarantees four equal rectangles. A permanently square plot at every viewport is a native-layout limitation, not a reason to change metrics. Quadrant names are placed immediately above/below the plot rather than injected into a custom renderer. The original independent scatter question266 remains restorable.

## Evidence

- `migration-chain.txt`: full43-migration rebuild, no-op second application, checksum tampering rejected.
- `development-backup.json` and `production-backup.json`: private dumps restored; all26 table fingerprints match.
- `development-rehearsal.json`, `production-rehearsal.json`: actual V43 tested on restored copies, 186 synthetic inputs including invalid/boundary cases, no source-row changes.
- `development-verification.json`: live DEV coordinate/source parity. `dependency-preflight.json`: five existing source definitions match DEV/PROD; identities verified.
- `prototype.json`: synthetic native feasibility configuration; no financial data.
- `metabase-state.json`: dashboard6 backup and private before-question/layout evidence. `metabase-plan.json`: intended new questions.

## Recovery and limits

Restore the saved review-tab placement/layout, reconnecting original question266. Old question and source V3 are unchanged. Retain unused additive V43 if reverting; financial DB restoration is not required for chart rollback. Private backup/question definitions are outside Git. Dashboard copy shares original questions; full private definition is retained too.

No AppSheet readiness/upgrade is claimed. Existing R026 app issues remain outside this SQL/report scope and owner-deferred; unchanged app contract evidence from R028 is reused. No RC required. Mobile uses the same equal-area cross plus a full borrower list; exact duplicate/nearby points can overlap, but no borrower is dropped from details or counts.
