# R031 — custom matrix presentation

Starting commit a876a53. User requested muted category symbols, local name labels without leader lines, and constant-size dots. Scope: chart.js, chart.css, index.html only; no SQL/API/authentication/Metabase definition/AppSheet change. Unrelated untracked work preserved. Rollback: R030 source plus private VM static-file backup.

Syntax and synthetic preview passed; three-file rollback verified against R030.

Frozen 2026-09-25T05:34:02.780910+00:00, independent source pin `adba25c306a7bbf2a26d1aa7c7af00b195e5e727`. R032 opened at promotion start; three-file VM rollback copy verified against R030.

Deployed and verified:23 names,4 grey icons,0 leader lines and uniform radius5.5. Desktop/mobile current-data name overlaps:0. A mobile collision was corrected by placing boundary-constrained names first; desktop retains vertical ordering. Name-first tooltip verified. No source data, SQL/API/authentication/Metabase definition or AppSheet changes. Dictionary, design, environment/development records and single checklist updated. Static files read on request; no service restart needed. Final source/evidence published with R031 tag.
