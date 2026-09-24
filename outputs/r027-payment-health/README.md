# R027 borrower payment health — DEV implementation checkpoint

## Status

SQL implementation is applied and verified in DEV. AppSheet implementation remains incomplete and is not ready for promotion. Production and existing reporting providers are unchanged. R027 remains Open. The current browser connection times out before returning tabs; no new GUI mutation was attempted during this checkpoint.

## Implemented SQL and validation

V41 adds charge-grain facts, borrower-grain health, independently classified BCG output, and two read-only OLTP adapters. Signed posted repayments determine principal and interest coverage separately; today’s dues are not overdue. Historical observations use completed Bangkok dates. The descriptive reliability score weights recent punctuality 45%, older punctuality 15%, average delay 15%, and current health 25%, renormalizing unavailable components. Missing recent history is Unclassified; default-altered history is Data review with no published score. Current debt remains available independently.

High reliability starts at 80; high contribution starts at one times equal active-borrower share. Thresholds are independent; there is no category quota. Fixed production-snapshot comparison matched all 22 borrowers' score, category, value and arrears: 5 Stars, 10 Cash Cows, 3 Question Marks and 4 Dogs. Current DEV data differs and is not forced to match that snapshot.

- [Detailed approved design](../borrower-matrix-simulation-20260924/IMPLEMENTATION_HANDOVER.md)
- [Simulation parity](sql-simulation-parity.json)
- [Full SQL CI](database-ci.txt): passed, including 22 health assertions and existing financial/concurrency tests.
- [DEV checks](dev-verification.json): ten assertions passed, including coverage, unique keys, totals and unavailable-score policy.
- [Flyway apply](dev-migrate.json) and [validation](dev-validate.json): V41, 42 validated entries.
- [Exact saved definitions](sql-definitions.json), mirrored in the R027 dictionary overlays.
- [Verified restored DEV backup](development-backup.json): 26 matching table fingerprints; private dump remains outside Git.

SQL query measurements are not AppSheet sync benchmarks. No production financial rows or production definitions were changed.

## AppSheet saved progress and remaining work

DEV OLTP has imported Borrower Payment Health and Charge Payment Health as READ_ONLY, with stable Row ID keys and borrower/loan/charge Refs. A Payment Health Detail reference view was being edited; its last layout was unsaved and must be inspected before continuing. Saved version after table imports has not yet been captured.

Remaining: finish and save the three reference views; baht currency and explicit timestamp timezone; compact borrower detail section; borrower-filtered overdue and component navigation; accessible text/color warnings; generated Ref-column reconciliation; both-app editor diagnostics; representative read-only GUI navigation and sync tests; exact saved AppSheet dictionary capture. Four DEV OLAP generated Daily Analytics slice warnings were reported by the prior task; inspect and reconcile only affected configuration. Do not resume its closed R026 promotion.

## Recovery and continuation

DEV OLTP pre-change restorable version: 1.000075; DEV OLAP pre-change version: 1.000033. Use the recorded verified V40 DEV backup only through the recovery procedure; do not restore over intervening work. V41 is additive and already applied, so it is immutable. Any SQL correction needs the next available migration after checking shared reservations. Existing legacy providers remain compatible. No release tag or production deployment is claimed.

Continue with the current DEV editor and complete the remaining UI work when browser access is restored. Follow the detailed handover rather than recreating the SQL. Preserve unrelated Risks drafts and other sessions' work. This checkpoint is not feature completion or owner acceptance.
