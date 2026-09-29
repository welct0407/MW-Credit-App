# R050 — Borrower lifetime summary — 29 September 2026

Owner requested seven horizontal charge-status lights and the screenshot's active/closed-loan metrics in the date-independent section of Detail105. Confirmed: exclude charges due today/future; closed-loan totals use genuinely Closed loans only.

Starting commit c0a0c755e63563aa880813b9e66fda1542726a73. Existing Partner script edits and untracked Partner/Risks/R026 work are preserved. R050 remains Open, alongside its already-published tab retirement.

Implementation: nine additive Metabase questions over existing restricted reporting sources; 13 new placements before selected-period activity. Existing questions unchanged; shift later Detail rows24. No AppSheet, PostgreSQL, chart-service, financial or permission changes.

Rollback: private dashboard definition captured before development; report copy recorded in outputs/r050-borrower-lifetime/state.json before publication. Restore only the affected placements after checking later changes; new saved questions may remain unused.

Published and verified: questions369–377, 13 placements; recovery dashboard27. Two borrowers across two date ranges were identical; empty selection returned no rows; unaffected placements were preserved. Independent reconciliation passed21 metric and21 charge comparisons. Desktop GUI confirmed seven complete circles with all three statuses and clean unavailable values. Mobile was not tested.

[Implementation/formulas/recovery](../outputs/r050-borrower-lifetime/README.md). Dictionary question definitions and dashboard contract updated; environment/development/design references aligned. No AppSheet or SQL changes. R050 remains Open. Repository publication follows relevant validation.
