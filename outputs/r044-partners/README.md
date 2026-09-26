# R044 — Partners tab

Owner-approved implementation of the [Partners design](../partners-tab-design-20260926/HANDOVER.md). New additive actual-only tab; AppSheet changes require owner review and none are necessary. No source financial records, operational tables/columns, allocation rules or existing dashboard pages change.

## Delivered

DEV and PROD are migrated and validated at V47. [12 · Partners](https://reports.mw-credit.com/dashboard/3?tab=249) is published: six thin models318–323 and twenty questions324–343 (nineteen visible plus one picker). All eleven existing tabs and223 placements are preserved. Dashboard3 now has12 tabs and247 placements. No AppSheet change or RC app was required. [Single promotion checklist](promotion-checklist.md).

Checks: [DEV source parity](development-verification.json), [DEV report queries](development-queries.json), [schema preflight](schema-preflight.json), [synthetic cases and migration chain](partner-tests.txt), [mandatory CI](database-ci.txt). Source baselines DEV/PROD match. All existing public objects remain unchanged in DEV. Backup/restore fingerprints match for all 26 tables: [DEV](development-backup.json), [PROD](production-backup.json). Backups and full dashboard metadata are private, outside Git.

The design's waterfall uses its allowed labelled bridge-table fallback to keep net-earned/available subtotals unambiguous. Current values use all recorded operational balances; period values use actual Bangkok event dates. Capital shares retain the full-pool denominator. Future/undated Pending entries remain reserved. Unknown statuses remain in reservation arithmetic and suppress safe availability. No forecast, cash-custody inference or settlement action is included.

## Recovery

Starting Git: `9550cb1d3df76494bebc494db75ce5db639bbce5`. Before publication the installer captures a dashboard recovery copy, while private `dashboard-before.json` retains the original layout. Existing questions are not modified. Remove only this release's new placements/parameters/tab to restore the dashboard, preserving later edits. Newly added unused models/questions can be recoverably archived after dependency checks. SQL V47 may remain for compatible rollback; source data and all existing functions/views are unchanged.

Recovery dashboard21 preserves the pre-change dashboard. Exact [saved definitions](saved.json), [object IDs](state.json), [PROD reconciliation](production-verification.json), [saved query checks](verification.json) and [filter checks](filter-verification.json) record the delivered state. Nineteen visuals passed all-date, current-month and historical single-partner queries; current metrics ignore activity dates, shares retain the full-pool denominator, multi-selection matches all partners and all three ledger statuses work independently.

Chrome profile Wel / Metabase welct0407@gmail.com verified the desktop cards, comparison, actual activity charts, capital lines, pending empty state and ledgers. A390px viewport confirmed native stacked cards; wide tables scroll horizontally and long note cards may scroll vertically. There are currently no pending settlements; synthetic tests cover that workflow. Screenshots remain private outside Git. Query time indicates report execution, not the last upstream sync.

One candidate correction added required Metabase model-reference template tags to the new questions; no SQL or financial logic changed. Final definitions were read back and exercised after correction. SQL remains the immutable V47 pinned in [frozen package](frozen-package.json); final report definitions/scripts are pinned by the R044 evidence tag. The dictionary records production definitions and the DEV ACL difference inherited from existing default grants. No new integration-agent grant was executed.

Core records, exact dictionary objects and design handover are updated. Publication target is the current upstream with unique tag R044; R045 remains the sole Open development release. See [release manifest](release-manifest.json) for the package and recovery contract.

Published field metadata omits Metabase data fingerprints (aggregate source statistics); full definitions remain private. SQL and visualization configuration is retained exactly.
