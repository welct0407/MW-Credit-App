# R051 restart checkpoint — 6 October 2026

Owner instruction at **07:45 UTC**: finish work outside the browser, preserve the current app/data state, then reboot Dots. Backend implementation and required local tests are complete; no additional backend change is needed for this checkpoint. Browser approval remains unresolved. Do not bypass the denial through another browser, API, VM or app-access route.

## Repository and completed backend

- Continue `codex/r051-receipt-corrections` in [draft PR15](https://github.com/welct0407/AppSheet-Loan-Project/pull/15), base `master`; do not merge or create another implementation thread. R051 remains Open; R052 is unchanged.
- Applied execution pin: **`837d50e03345047a0a935b51b1bdeecbb97b5265`**. Published backend evidence pin: **`f9a0268e83c96f0a368e74e1a40bebe220b85835`**. This checkpoint is a later documentation-only continuation; use the PR's current head for its publication revision.
- DEV is **V70 / checksum `124258995`**, database `loan_manager_dev`, instance `appsheet-pg-prod-20260914`, host `34.21.174.215`. V70 SHA-256: `7a7cd48b1973976ffe957794e82cdfb3964106a046a1861401af3d3c04d08a55`. **Do not reapply V70**, replay acceptance, edit applied migrations or reset fixtures merely to restart.
- PROD remains V58 and was not accessed or changed by this work. No frontend change, new schema exposure, grant, scheduler change or notification action accompanies this restart checkpoint.

[Actual V70 evidence](default-repayment-v70-actual-summary.json) records one migration invocation, validation and all 25 non-history tables preserved. [Fresh V69 recovery](recovery-v69.json) restored all 26 table fingerprints; dump SHA-256 is `b3547542177adca0dbbee9731d7e208a664b6f7a8ed4cb706dfc610e25a5ddbf`. The private recovery artifact is `r051-dev-recovery-fvuq29st`; its local path is not guaranteed to survive workspace replacement. Never restore the shared database as routine fixture cleanup.

| Completed proof | Durable evidence |
|---|---|
| Full 70-migration build, nine concurrency suites, seeded V19/V68/V69 upgrades, checksum/repeat-run checks | [Execution validation](deployment-validation-v70.json) |
| Historical independently committed V69 child deletion and fixed V70 separate-request preservation; exact Undo and post-Undo CRUD | [Local guard validation](local-validation-v70.json) |
| Compatible posted Selected Charges replacement/roundtrip; incompatible replacement preserves source, children and cash | `scripts/database/Test-SelectedCharges.sql`, [execution validation](deployment-validation-v70.json) |
| Strict V70 identity/checksum gates; all seven additional and original fixture workflows rehearsed locally | [Helper rehearsal](local-fixture-helpers-v70.json) |
| Actual DEV rollback-only acceptance, 55.339 seconds; all26/original-six unchanged; zero synthetic residue | [Acceptance](dev-default-repayment-v70.json) |
| Independent final read-only comparison at **07:05:17.385325 UTC** | [Final readback](dev-default-repayment-preflight-v70.json) |
| Backend evidence commit Windows checks passed | [Push37427855818](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/37427855818), [PR37427862404](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/37427862404) |

## App state: saved is not runtime acceptance

| Layer | Recorded state | Remaining work |
|---|---|---|
| DEV OLTP | **1.000177**, app `500b27b6-884a-41e8-a9ec-df801b0110ad`; parent-reported saved configuration | Current browser readback, invalid-input explanations, save/full-sync and workflow acceptance remain pending |
| DEV OLAP | **1.000052**, app `9f3422be-bc87-4a5a-a42a-67528ee80393`; parent-reported retained configuration | Current diagnostics/load and affected workflow acceptance remain pending |
| Database safeguards | Applied/validated V70 | Retain as authoritative protection for direct writers, stale clients and races |
| Frontend guards/messages | [Main contract](r051-frontend-guard-mapping.md) and [all19 supplemental groups](frontend-supplement-review-20261006.md), **unapplied, uncompiled and runtime-untested** | Implement only source-aligned proposals after approved browser access; then verify current GUI behavior |

The [sanitized saved checkpoint](ui-saved-checkpoint-20261006.json) records OLTP177's four action conditions, ten EditableIf properties and ten automatic process-schema copies, verified04:52:34 UTC, plus16 dated GUI summaries. Runnable/deployable status does not prove complete workflow behavior or visible explanations. Historical OLTP160 failure,170 receipt passes and173 restoration remain dated evidence.

The [19-group review](frontend-supplement-review-20261006.md) covers all supplied IDs:

- **OLTP (13):** PAY_AMOUNT, PAY_TARGET, PAY_PROCESSING, PAY_NOTES, DEFAULT_CHILD, GENERATED_CHILD, BORROWER_DELETE, LOAN_DELETE, LOAN_CORRECTION, CHARGE_CORRECTION, LEGACY_REPAYMENT, EXPENSE_REIMBURSE, EXPENSE_SYSTEM.
- **OLAP (6):** REIMBURSE_ACCOUNT, SETTLEMENT_COMPLETE, SETTLEMENT_AMOUNT, CONTRIBUTION, CASH_ACCOUNT, READONLY_MIRRORS.

Known frontend gaps: the existing-row receipt amount bypass; dependency-aware capacity for edits; linked expense reimbursement visibility absent from OLTP; old/new-parent checks; and visible bilingual correction guidance where controls are hidden/locked. Posted Selected Charges selection replacement **is supported** through normal teardown, validation and reposting. Do not impose a blanket lock or reference the absent OLTP Cash Ledger table. New dependency exposure remains a separately reviewed design/security issue, not an instruction to add broad schema or permissions now.

Source reconciliation is complete for the checkpoint: settlement reservations exclude Cancelled/current rows and preserve the unchanged-reservation exception; reimbursement links are optional; no general future-balance contribution lock was found; default-parent INSERT is outside V69/V70's UPDATE/DELETE scope. Proposed wording has been qualified accordingly. This does not create a new financial policy or claim untested app coverage.

## Preserved test data

These are facts from the **07:05 UTC verified evidence**, not a fresh live audit at restart. Original fixture and six-batch fingerprints were preserved exactly. Keep DAILY, DEFAULT, LEGACY, CLOSE, PREPARED and PARTNER-A for remaining GUI acceptance; do not reseed them.

- `SYN-R051-UI-DEFAULT`: open, auto-charge **false**, interval1, outstanding principal100/current daily10; original charge100P/10I remains110, no Default loss pair. The failed earlier setup rolled back; do not replay its retired private runner.
- `SYN-R051-UI-DAILY-P` remains absent after the prior GUI deletion. Do not recreate it to match a seed script.
- Seventh **REIMBURSE remains unseeded**, verified across all26 tables. Local rehearsal is not live seeding or GUI acceptance.
- Original GUI-created receipt `Bx59mH6SCh4OMcWXvOpo6Y` and other captured generated IDs require fresh exact inventory before cleanup. Static original cleanup is not current-live cleanup ready.

Use [six-batch recorded state](six-ui-seed-readback.json), [dated expense GUI proof](gui-expense-edit-delete-evidence.json), and the [fixture/remaining acceptance guide](additional-ui-fixtures.md#remaining-gui-acceptance). Preserve all independent records, source-owned children/cash and existing notification containment.

The **15 pending acceptance groups** are GUARD, ADD, LEGACY, CLOSE, PREPARED, LOAN, EXPENSE, REIMBURSE, CONTRIBUTION, SETTLEMENT, BORROWER, LOAN_DELETE, CREATE, NAV and CLEANUP. Their concise expected outcomes are in the [saved checkpoint](ui-saved-checkpoint-20261006.json). The helper assertion repair and V70 child-deletion proof are already complete; do not treat the supplement's older V69 engineering notes as new work. Default-owned control visibility needs separately coordinated temporary setup; the earlier full Default/Undo GUI cycle already passed.

## Safe resume order

1. Read current `AGENTS.md`, model/workflow routing, this note and its supplemental GUI checkpoint. Confirm the existing branch/PR head and clean working tree. Reconcile intervening work instead of overwriting it.
2. Restore approved browser capability through the normal permission path. A Dots reboot alone does not waive the unresolved denial. Confirm the canonical DEV app IDs, signed-in account, saved versions, diagnostics/runnable state and current affected configuration before edits.
3. Reconcile the proposed frontend predicates/messages against that saved state. Prefer built-in validation and visible correction guidance; preserve role rules and Ref/IsAPartOf. Resolve trustworthy dependency-data gaps before promising client prevention. No frontend patch has been applied by this checkpoint.
4. Obtain a fresh coordinated window for any later data mutation. Recheck the exact DEV V70 target, strict helper gates, current Bangkok dates, fixture state and notification containment. All old window references are expired; the V70 window was released after final readback. No fixture seed/cleanup or approval retry is authorized just by reopening this note.
5. Complete remaining current-GUI positive/negative cases, record generated IDs, await full sync, then perform scoped independent readback/audit. Include every initiator and allowed correction path; do not label an expected database error as successful frontend prevention. Unknown submission outcomes require reconciliation before another submission.
6. Only after acceptance, perform separately coordinated exact-inventory cleanup with source/child/cash and other-fixture preservation checks. Do not use shared-database restore. Keep R051 Open/draft until the separate acceptance/promotion conditions are met.

No task-owned backend writer or test server should remain active at handoff. This continuation performs no live database reads/writes, browser actions, PROD changes, merge, credentials/access changes or fixture seed/cleanup.
