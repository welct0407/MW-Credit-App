# R051 CRUD evidence

**DEV V65 is applied, validated and passes rollback-only receipt-command acceptance.** Parent reports OLTP1.000167 / OLAP1.000049 runnable, deployable and free of editor issues after GUI corrections. Receipt amount/account/target/metadata and bidirectional interest edits passed bounded GUI/audit checks and independent SQL readback. Native receipt Delete failed because AppSheet cascaded a protected allocation DELETE first; P1 and its financial effects remain intact. GUI writes are paused pending queue reconciliation and the source-command fix. Overall acceptance and cleanup remain incomplete.

[The V65 plan](receipt-delete-v65-plan.json) adds one hidden Payments Boolean and a detail-only confirmed source action, preserving every Ref/IsAPartOf and existing child guard. A last AFTER UPDATE trigger invokes ordinary DELETE atomically with existing permissions. Full local Test-CI passes 65 migrations, eight concurrency suites, SQL/history/rollback checks and the seeded historical-opening route. The exact candidate SHA256 is `72743f3848aaafbaefde7fa15921733ae332bd9209c8da45638fb836aeb3e60b`. Fresh V64 recovery restored all26 fingerprints; V65 checksum `-2087638333` validates, existing business rows are preserved (Payments normalized without its new false flag), and rollback-only actual DEV acceptance preserves all26 post-migration fingerprints. See `recovery-v64.json`, `dev-migration-v65.json` and `dev-receipt-delete-v65.json`. Connector save/full-sync proof remains pending.

[Additional fixtures](additional-ui-fixtures.md) are executable and locally rehearsed but uncreated. [Source-account UI proposals](source-account-ui-proposals.json) cover expense, loan and settlement corrections, retaining current authorization and dependency rules. Applied V65 still lacks source-side reimbursement revalidation. The separate [V66 candidate](expense-reimbursement-v66.md) addresses that invariant and concurrency locally; it remains unapplied and blocks broad expense account unlocking.

The task branch is `codex/r051-receipt-corrections`, based on `02c7f2d1926bc06ecbbc785446d70d91459dd2b1`, published in [draft PR15](https://github.com/welct0407/AppSheet-Loan-Project/pull/15). DEV target: `clever-oasis-508610-n7 / appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev`; existing `postgres` route with pinned IAP/proxy transport. PROD, instance settings, role grants and deployed integration runtimes are untouched. R051 remains Open.

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

`ui-handoff.json` contains the Astra High-authored field/action/slice proposals, source ownership, retained Ref/IsAPartOf requirements and current backend gate. `ui-progress-parent.json` records current sanitized saved formulas/versions and bounded audit results, retaining the earlier failure checkpoint. The old browser-access/runnable failure is resolved; native receipt deletion remains failed. Final editor diagnostics, runnable/load checks, form validation, actual save/sync/cascade ordering and notification/no-double-send assertions remain required in both apps.

Initial exact fixtures were committed/read back under reviewed owner-only/no-borrower containment and have since been edited by the GUI. Their initial baseline is historical, not current: `ui-fixture-state.json` / `ui-fixture-readback.json`. `dev-recipient-containment.json` records sanitized DB delivery checks; the parent separately verified bot routing. Additional batches in `ui-fixtures.json` are **not created**. Capture every GUI-generated key with synthetic parent/account references before exact cleanup; the static seed cleanup alone does not prove zero residue after GUI Add operations.

Two PR-description updates were initially rejected by automatic approval using the superseded design-only scope. After the parent explicitly renewed that exact instruction, the same connector update succeeded with the authored body. That blocker is resolved; PR15 remains open, draft and unmerged. No production promotion, merge, release freeze, real-source hard deletion or real money movement is authorized by this task.
