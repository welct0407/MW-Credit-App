# R037 — borrower contribution charts

26 September 2026. Owner requests two contribution pies and two overall horizontal bars on the new Portfolio tab; selected lifetime achieved daily rate. [Detailed contract, changed objects and rollback](../outputs/r037-borrower-contribution/README.md).

Status: Released after scoped report publication, data/filter checks and desktop/mobile verification. R038 sole Open. No AppSheet/SQL schema/data/permissions changes. Original tabs and Detail preserved. Negative recent borrower interest is disclosed separately from positive contribution pie shares.

Changed implementation: BorrowerContributionCharts.mjs, borrower-lifetime-economics.sql, verify_borrower_lifetime.py. Test evidence:30 borrower reconciliations,4 synthetic exposure cases,6 query preflights. Unrelated risk/R026 untracked work preserved. Starting Git400049e.

Publication sequencing deviation: local tracker freeze script failed due to Windows text decoding; the shell continued to report publication. R037/R038 handoff was immediately repaired after publication and recorded honestly in the manifest; no concurrent release scope or app state was overwritten.

Final refinements: repaired UTF-8 chart labels, enlarged methodology note, percentage-only pie labels, and top8 native bars to prevent mobile automatic summation of overflow ratios. Four new chart definitions, context and model recorded in exact dictionary; 1220 documents validate without structural errors. Eight population/reconciliation checks plus two date-invariance checks passed. Rollback dashboard11; original tabs, filters, permissions and Detail preserved. Final evidence tagR037.
