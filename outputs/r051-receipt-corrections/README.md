# R051 CRUD evidence

**Backend SQL validation passed on DEV V64; overall release remains incomplete.** Receipt tests, eight workflows on one reused connection and the original combined-transaction reproduction pass with all 26 table fingerprints and the GUI baseline preserved. OLTP1.000160 is confirmed not runnable and browser permission is blocked; OLAP1.000047 remains unchanged. Both-app save/sync/cascades, notification behavior and fixture cleanup remain pending.

The task branch is `codex/r051-receipt-corrections`, based on `02c7f2d1926bc06ecbbc785446d70d91459dd2b1`, published in [draft PR15](https://github.com/welct0407/AppSheet-Loan-Project/pull/15). DEV target: `clever-oasis-508610-n7 / appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev`; existing `postgres` route with pinned IAP/proxy transport. PROD, instance settings, role grants and deployed integration runtimes are untouched. R051 remains Open.

## Current package and checks

- `dev-migration-v64.json` pins applied V64 checksum `1504057228`, SHA256 `2f84f8ea27f0c035a89d0d3e551b1ce2cc8c60e8fa35e1c87ee496ad9623140d`, validated Flyway history and every migration hash. All earlier applied bytes remain unchanged. Migration source was published at `1afb4489df67a9afd5e59367cc9c8e072f5622a1`.
- `local-validation.json` records the maintained `Test-CI.ps1` pass: 64 migrations, repeat no-op, full SQL, seven concurrency suites, schema export/normalization and checksum rejection. The second maintained route upgrades seeded V19 opening data through V64 and verifies 12 financial-edit rejections plus permitted metadata edits. Private logs: `r051-migration-test-_bdu_8ps` / `r051-migration-test-0xmfsr22`.
- `history-aggregate-validation.json` records complete original/new daily and account snapshot parity over restored history, partial/date/null/zero cases and signed default losses/undo. V64 only replaces repeated correlated charge-payment scans with one aggregate per snapshot date and a join. Formulas/date bounds and V62 function-scoped custom planning remain intact. Restored-data eight-workflow replay improved from38.776s to1.719s; the separate read-only DEV calculation comparison was1471.585ms to53.198ms with identical rows. These are distinct measured scopes, not estimates or server-wide speed claims.
- Windows CI exposed a CRLF-sensitive match in the test reference reconstruction, after the business SQL passed. Test-only carriage-return normalization preserves the exact reference assertion and full parity. Actual CRLF-input restored-data rehearsal passed in6.532s (`r051-profile-tf90l936`). Applied V64 was not edited. Exact published-head Windows CI remains the publication gate.

## Actual DEV acceptance

`dev-tests.json` records receipt/history validation and eight complete source workflows in fresh rollback transactions on **one reused backend**. `dev-business-monolithic-tests.json` closes the original long-transaction failure reproduction. `dev-acceptance-v64.json` consolidates the exact package, preservation and timings.

| Scope | Statements | Summed client elapsed | Slowest client statement |
|---|---:|---:|---:|
| Receipts and canonical consolidated/account snapshots | 102 | 26.790s | 438ms |
| Eight reused-session business workflows | 244 | 61.609s | 454ms |
| Original combined-transaction reproduction | 103 | 29.239s | 488ms |

These are psql client timings, including network round trips. The formerly failing daily-loan insert completed in324ms. Every test transaction rolled back; all 26 table fingerprints and the reserved GUI fixture baseline matched. Backend write window is released and no owned test sessions remain.

Coverage includes source update/delete, both parents, cash, later receipts, closure/referrals, current daily rates with booked charges retained, default undo, expenses/contributions/settlements/manual movements, unpaid loans/charges, master records, invalid dependencies/capacity, no-op/retry, final-step failure and dedicated multirow/concurrency tests. SQL atomicity does not imply atomicity of separately synced AppSheet rows. See the [scenario matrix](../../Documents/R051_CRUD_Scenarios.md) for exact supported operations and restrictions.

## Recovery and earlier attempts

`recovery.json` records a private pre-R051 V58 logical dump and an isolated restore matching all 26 fingerprints. Raw data/backups remain outside Git. The logical dump does not cover instance configuration or roles. The harmless trailing empty line in applied V60 is preserved for checksum integrity; whitespace checks exclude only that EOF category.

Earlier failures remain recorded: `timeout-reconciliation.json`, `dev-v61-test-attempt.json`, `dev-partial-tests-v63.json`, `dev-normal-monolithic-attempt.json` and `dev-grouped-v63-attempt.json`. Their rollback/session reconciliation passed; none is labeled a functional pass. `contribution-diagnostic.json` separates fresh/late and normal/forced-generic observations. Normal pooled-session failures were real, not dismissed as stress-only. V64 subsequently passes both pooled and combined-transaction reproductions. Resource/cache contribution to the earlier slowdown was not independently established; no instance tuning was performed. Prior local package pins remain in `local-validation-v60.json` and `local-validation-v63.json`.

## Remaining GUI work

`ui-handoff.json` contains the Astra High-authored field/action/slice proposals, source ownership, retained Ref/IsAPartOf requirements and current backend gate. `ui-progress-parent.json` records the confirmed OLTP1.000160 failure email and browser-access block. Final editor diagnostics, runnable/load checks, form validation, actual save/sync/cascade ordering and notification/no-double-send assertions remain required in both apps.

Initial exact fixtures were committed/read back under reviewed owner-only/no-borrower containment and remain reserved: `ui-fixture-state.json` / `ui-fixture-readback.json`. `dev-recipient-containment.json` records sanitized DB delivery checks; the parent separately verified bot routing. Additional batches in `ui-fixtures.json` are **not created**. Capture every GUI-generated key with synthetic parent/account references before exact cleanup; the static seed cleanup alone does not prove zero residue after GUI Add operations.

Two PR-description updates were initially rejected by automatic approval using the superseded design-only scope. After the parent explicitly renewed that exact instruction, the same connector update succeeded with the authored body. That blocker is resolved; PR15 remains open, draft and unmerged. No production promotion, merge, release freeze, real-source hard deletion or real money movement is authorized by this task.
