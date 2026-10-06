# V70 candidate — preserve legacy repayments during Default

Local candidate only; actual DEV remains V69/checksum245428688 and PROD remains V58. No live access or application is part of this preparation. R051 stays Open.

V69 permits an independent legacy repayment to be deleted while its loan is defaulted. A child-first sequence of independently committed requests can therefore remove that payment before later protected charge/loan deletion rejects. Undo cannot recreate an independently deleted payment. The [V69 proof](loans-delete-default-safety.md) records this boundary without claiming an observed AppSheet request order.

[V70](../../database/migrations/V70__protect_defaulted_legacy_repayments.sql) replaces only the existing `default_posting_guard` function. For non-generated Repayments UPDATE/DELETE it resolves both OLD/NEW `Ref Loans` and the loans reached through OLD/NEW `Ref Charges`, locks the distinct loans in deterministic order with `FOR SHARE NOWAIT`, and rejects if any is defaulted. Both reference routes matter: SQL does not derive `Ref Loans` from a changed charge. Metadata, key changes and reference clearing receive the same protection; repayment rows have no derived cache fields requiring an exception.

Existing statement cash-pool advisory locking and `aa_vc_lock` borrower NOWAIT locking remain first. Competing ordinary source operations can reject as busy before reaching this guard; after retry they see the committed default state. A parent-only row lock exercises the new NOWAIT path, and a stale repeatable-read writer must fail rather than remove a payment from an older snapshot.

V69 original-charge handling and generated `df10:` immutability are unchanged. Default INSERTs remain unchanged; Undo may still delete its exact generated loss pair through the existing nested, loan-scoped exception. No ordinary repayment bypass, new INSERT restriction, fields, grants, attachment or relationship changes are introduced. Normal manual corrections/reassignment/deletion after Undo and legitimate unpaid cascades remain supported.

## Verification scope

- `Test-DefaultRepayment.sql`: legacy amount/metadata/key edits, reference clearing, old/new direct and charge-derived parents, single-reference historical rows, a deterministic late failure rollback, exact Default/Undo source restoration, cash preservation, and ordinary post-Undo reassignment/delete.
- `Test-DefaultLoanConcurrency.ps1`: existing Default/Undo tests plus repayment-first/Default-first/Undo-first busy/retry behavior, stale repeatable-read rejection, and a parent-row NOWAIT conflict. No trigger bypasses.
- V69→V70 seeded upgrade: an already-defaulted loan retains its legacy repayment; deletion rejects after upgrade, Undo restores outstanding90/current interest9 and original charge components, and normal edits/deletion then work. The maintained Linux and Windows CI routes include this upgrade.
- `Test-DefaultInspectionLocal.py --expected-version 69` retains the historical unsafe proof; `--expected-version 70` (the new default) proves independently failed child requests leave all26 fingerprints unchanged and Undo restores the exact source state. The runner uses a verified localhost temporary copy only, never a DEV transport. It is a separate local check, not automatically part of Windows CI.

[Local validation](local-validation-v70.json) passed all four maintained CI routes, including nine concurrency suites and the V69→V70 seeded upgrade, plus both historical and fixed separate-request proofs. It pins exact candidate bytes and outcomes. [PR15 checks](https://github.com/welct0407/AppSheet-Loan-Project/pull/15/checks) is the source for the exact published revision's remote results. A future DEV application still requires coordinated authorization, a fresh recovery/preflight and rollback-contained acceptance; existing live fixture helpers deliberately remain pinned to V69.

## Frontend contract

The owner requires database safeguards to be reflected before Save through bilingual explanations and supported built-in validation, with database checks retained for stale/concurrent/bypass requests. The [R051 frontend guard mapping](r051-frontend-guard-mapping.md) distinguishes proposed from applied/verified rules. The minimal Loan Delete `NOT([Defaulted] = TRUE)` addition remains appropriate; repayment Edit/Delete must also explain that Default must first be undone. Hiding controls alone is not complete frontend acceptance. No app definition was changed or compiled by this task.
