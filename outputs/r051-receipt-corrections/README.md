# R051 CRUD evidence

**DEV V67 is validated. Parent-confirmed OLTP1.000170 / OLAP1.000052 are validated; one confirmed detail-only receipt delete and one new receipt Add pass GUI audit, full sync and independent SQL readback. P1 and both old/current owned keys are absent, P2 is preserved, and generated receipt Bx59mH6SCh4OMcWXvOpo6Y is Posted1 with one allocation/repayment/cash. No replay or duplicate was observed in the bounded evidence. Broad lifecycle tests, all creation-action paths, app-role reimbursement proof and exact cleanup remain pending. Additional batches are prepared only, not created. PROD is untouched.**

[The V65 plan](receipt-delete-v65-plan.json) adds one hidden Payments Boolean and a detail-only confirmed source action, preserving every Ref/IsAPartOf and existing child guard. A last AFTER UPDATE trigger invokes ordinary DELETE atomically with existing permissions. Full local Test-CI passes 65 migrations, eight concurrency suites, SQL/history/rollback checks and the seeded historical-opening route. The exact candidate SHA256 is `72743f3848aaafbaefde7fa15921733ae332bd9209c8da45638fb836aeb3e60b`. Fresh V64 recovery restored all26 fingerprints; V65 checksum `-2087638333` validates, existing business rows are preserved (Payments normalized without its new false flag), and rollback-only actual DEV acceptance preserves all26 post-migration fingerprints. See `recovery-v64.json`, `dev-migration-v65.json` and `dev-receipt-delete-v65.json`. One synthetic detail source-delete now passes connector save/full-sync and exact SQL anti-join checks; broader cases remain pending.

[Additional fixtures](additional-ui-fixtures.md) are executable and locally rehearsed but uncreated. [Source-account UI proposals](source-account-ui-proposals.json) cover expense, loan and settlement corrections, retaining current authorization and dependency rules. Applied [V66](expense-reimbursement-v66.md) validates both sides of linked reimbursements. Actual GUI account/holder defaults and app-role capability remain to prove before expense unlocking.

The separate [V67 metadata candidate](receipt-flag-v67-plan.md) preserves non-null stored values with a validated CHECK while exposing nullable column metadata, to test the confirmed OLTP schema/action bootstrap cycle. It is applied and passes rollback-only DEV NULL/default/delete acceptance; the parent now reports validated OLTP170/OLAP52 and successful source-command delete/normal receipt Add.

The task branch is `codex/r051-receipt-corrections`, based on `02c7f2d1926bc06ecbbc785446d70d91459dd2b1`, published in [draft PR15](https://github.com/welct0407/AppSheet-Loan-Project/pull/15). DEV target: `clever-oasis-508610-n7 / appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev`; existing `postgres` route with pinned IAP/proxy transport. PROD, instance settings, role grants and deployed integration runtimes are untouched. R051 remains Open.

## V66/V67 actual DEV checkpoint

Fresh `recovery-v65.json` pins SHA56200ffa454bd54294d84fc78683420332ab21310a0de29b5fb37a32112d5e55 and all26 restored fingerprints. `dev-migration-v66.json` / `dev-migration-v67.json` record checksums1095016248 /1721477385 and all25 non-history tables unchanged across each migration. `dev-receipt-delete-v67.json` passes four receipt workflows, direct/bulk/COPY NULL/default checks and linked reimbursement invariants/cash preservation; all26 fingerprints match after rollback. `ui-readback-after-v67.json` records original fixtures separately. No new persistent fixtures, grants, instance changes or PROD writes.

Exact migration candidate fdedfa28f96e008c491492c7b4c87b6bea3c133d passed [CI37366812688 attempt2](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/37366812688). The initial zero-step runner cancellation is distinct from a test failure; GitHub reported [hosted-runner delays](https://www.githubstatus.com/incidents/3q1yb5m7ltvb). Evidence/harness publication after this checkpoint has its own exact-head CI. AppSheet bootstrap/cascade/permission acceptance remains pending.

## Bounded GUI receipt proof

[Combined sanitized evidence](gui-receipt-delete-create-evidence.json) records Delete request82342184, bot Conditionfalse, successful sync, exact old/current child/cash-key absence and real source anti-joins; P2 is unchanged. Add request38946218 created exactly one receipt, posted1 with one child pair/cash; one owner-routed task ran, then full sync displayed Posted. The initial Processing display was stale. Add-generated ID Bx59mH6SCh4OMcWXvOpo6Y is now in the reviewed fixture manifest and must be reconciled before cleanup. This is not proof of every creation action, bulk atomicity or broader parent cascade.

## Current package and checks

- `dev-migration-v64.json` pins applied V64 checksum `1504057228`, SHA256 `2f84f8ea27f0c035a89d0d3e551b1ce2cc8c60e8fa35e1c87ee496ad9623140d`, validated Flyway history and every migration hash. All earlier applied bytes remain unchanged. Migration source was published at `1afb4489df67a9afd5e59367cc9c8e072f5622a1`.
- `local-validation-v64.json` records the applied V64 maintained `Test-CI.ps1` pass: 64 migrations, repeat no-op, full SQL, seven concurrency suites, schema export/normalization and checksum rejection. The second maintained route upgrades seeded V19 opening data through V64 and verifies 12 financial-edit rejections plus permitted metadata edits. Private logs: `r051-migration-test-_bdu_8ps` / `r051-migration-test-0xmfsr22`.
- `history-aggregate-validation.json` records complete original/new daily and account snapshot parity over restored history, partial/date/null/zero cases and signed default losses/undo. V64 only replaces repeated correlated charge-payment scans with one aggregate per snapshot date and a join. Formulas/date bounds and V62 function-scoped custom planning remain intact. Restored-data eight-workflow replay improved from38.776s to1.719s; the separate read-only DEV calculation comparison was1471.585ms to53.198ms with identical rows. These are distinct measured scopes, not estimates or server-wide speed claims.
- Windows CI exposed a CRLF-sensitive match in the test reference reconstruction, after the business SQL passed. Test-only carriage-return normalization preserves the exact reference assertion and full parity. Actual CRLF-input restored-data rehearsal passed in6.532s (`r051-profile-tf90l936`). Applied V64 was not edited. The published V64 head `ca7ae742a59e80b0903cc6da6d84bbfb02953cc9` passed Windows CI run37347977079. V65 candidate head b69cde88 passed exact-head Windows CI [run37361404801](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/37361404801).

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

`ui-handoff.json` contains the Astra High-authored field/action/slice proposals, source ownership, retained Ref/IsAPartOf requirements and current backend gate. `ui-progress-parent.json` records current sanitized saved formulas/versions and bounded audit results, retaining the earlier failure checkpoint. The old browser-access/runnable failure is resolved; the historical native receipt deletion failed; the confirmed source-command path now passes for P1. Final editor diagnostics, runnable/load checks, form validation, actual save/sync/cascade ordering and notification/no-double-send assertions remain required in both apps.

Initial exact fixtures were committed/read back under reviewed owner-only/no-borrower containment and have since been edited by the GUI. Their initial baseline is historical, not current: `ui-fixture-state.json` / `ui-fixture-readback.json`. `dev-recipient-containment.json` records sanitized DB delivery checks; the parent separately verified bot routing. Additional batches in `ui-fixtures.json` are **not created**. Capture every GUI-generated key with synthetic parent/account references before exact cleanup; the static seed cleanup alone does not prove zero residue after GUI Add operations.

Earlier PR-description approval rejections were resolved after an explicit renewed instruction. More recent status-body updates were again denied as disclosure to an unverified destination; no alternate route or further retry was attempted. The published branch evidence is authoritative; PR15 remains open, draft and unmerged. No production promotion, merge, release freeze, real-source hard deletion or real money movement is authorized by this task.
