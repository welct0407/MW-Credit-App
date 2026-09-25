# R035 — additive borrower pages

Owner instruction: implement the approved Portfolio and Detail design as two **new** Metabase tabs. Existing tabs/cards, AppSheet definitions and financial records remain unchanged.

Implementation in progress. DEV V44 and restored-PROD rehearsal passed. Production remains V43 until the pinned promotion below. The maintained implementation is `scripts/metabase/BorrowerPages.mjs`; design contract is [handover](../borrower-pages-design-20260925/HANDOVER.md).

V44 adds three reporting views and one read-only period function, separating loan and receipt grains before aggregation. Borrower ID controls identity; duplicate labels remain distinguishable. Current positions and governed health ignore the activity period. Period amounts retain signed corrections and default to the previous 30 completed Bangkok days. Detail fails empty without one borrower. The additional-principal scenario is hypothetical.

## Verification and recovery

- Full disposable SQL CI passed, including 17 focused synthetic assertions.
- DEV verification: 18 independent checks and 33 compiled report queries.
- PROD snapshot restored with 26 table fingerprints reconciled; candidate rehearsal passed the same 18 checks and 33 queries.
- Private recovery dump and hash: [backup metadata](production-backup.json). No private rows or credentials are published.
- Metabase dashboard 10 is the recovery copy of dashboard 3 before this batch; the private baseline contains the exact original 12 tabs and 212 placements. Recovery should remove only this batch's new tabs/filters/cards, preserving intervening unrelated work. Compatible V44 providers may remain; no operational restore is needed for dashboard rollback.
- Starting work commit `0aa3b25f0b98f6e95f62c538258a053423ed9590`; monitoring refinement `e81d296` is preserved in R035. Unrelated risk design and R026 output are excluded.

Production SQL, saved-card filter tests, browser verification, dictionary closure and final publication are pending. AppSheet readiness/diagnostics are not asserted by this report-only package; prior R026 limitations remain recorded separately.
