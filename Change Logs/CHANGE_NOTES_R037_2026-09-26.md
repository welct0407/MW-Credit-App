# R037 — borrower contribution charts

26 September 2026. Owner requests two contribution pies and two overall horizontal bars on the new Portfolio tab; selected lifetime achieved daily rate. [Detailed contract, changed objects and rollback](../outputs/r037-borrower-contribution/README.md).

Status: implementation and independent data/preflight tests passed; report publication and browser verification pending. Current Open release R037. No AppSheet/SQL schema/data/permissions changes. Original tabs and Detail preserved. Negative recent borrower interest is disclosed separately from positive contribution pie shares.

Changed implementation: BorrowerContributionCharts.mjs, borrower-lifetime-economics.sql, verify_borrower_lifetime.py. Test evidence:30 borrower reconciliations,4 synthetic exposure cases,6 query preflights. Unrelated risk/R026 untracked work preserved. Starting Git400049e.
