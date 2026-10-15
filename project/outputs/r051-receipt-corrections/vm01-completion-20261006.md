# R051 CRUD — DEV completion, 6 October 2026

DEV implementation and bounded acceptance are complete at OLTP1.000194 / OLAP1.000056 / SQL V72. Both canonical editors are saved, Deployed and show **No issues found**. R051 remains the sole Open release and PR15 remains draft; this does not approve production promotion or close the separate monitoring scope.

## Implemented behavior

- Reimbursed expense deletion removes its own expense cash and retains the independent Lisa-to-Tommy transfer. Its optional source link clears, with the original expense ID retained in Notes. Actual cash returns are separate entries.
- Optional legacy and SQLLab assessments no longer block an otherwise eligible borrower deletion. Their input/snapshot history remains unchanged except for the cleared borrower link.
- Historical opening sources reconcile consistently on correction/deletion. R005 uses signed deltas against captured source baselines; R008 removes old unassigned source cash from opening once when attributed/deleted. Recorded attribution takes precedence; otherwise use the owner's Lisa decision and her unique active default account. Baseline membership/flows/timestamps remain, and Notes retain opening adjustments. No historical full repost or duplicate accounting.
- Reconciled the saved185/54 and documented unsaved appendix changes before editing. Final OLTP guards cover loan dependencies/principal/type, paid-charge reassignment and default-generated repayments. Undo Default updates five closure fields together; receipt guidance distinguishes new rows from persisted Processing/Error states. OLAP account validation preserves unchanged inactive-account history, and withdrawals display negative Net Contribution.
- Existing source receipt deletion, settlement Complete/Reverse/Cancel, manual transfers and read-only OLAP-to-OLTP source navigation are retained. No restrictive dependency views or new business tables/columns were added in71/72.

## Verification and cleanup

[GUI evidence](vm01-gui-tests-20261006.md) records actual current-interface borrower/assessment unlink, receipt correction/deletion, prepared closure, direct loan conversion/correction, charge edit, independent legacy repayment, Default/Undo, expense/reimbursement, contribution/withdrawal and settlement workflows. Partial/full/loan-close/first-day receipt creation each produced one expected accounting projection. OLAP receipt and expense links reached the matching DEV OLTP source. Reused earlier DAILY evidence is labeled.

Full Windows `Test-CI.ps1` passed all72 migrations, repeat/checksum rejection, SQL regressions, nine concurrency suites and V19/V22/V68/V69 seeded upgrades. Focused reimbursement/assessment and both historical-opening suites passed. [Validation](vm01-v72-validation.json). SQL files were unchanged after this passing run.

Every R051 task fixture, GUI-created dependent and optional assessment was removed through exact captured source cleanup. [Final read-only preservation](vm01-final-preservation.json) proves22 nonfixture source/audit tables exactly equal the verified pre-change restore, zero task residue and zero non-owner delivery addresses. Derived Daily Analytics, Cash Account Daily Analytics and Statistics were recomputed; raw equality is not claimed for them. No real records were deleted for tests.

New Loan Created recipient/task routing was inspected; unchanged reviewed receipt/Default routing was reused. Synthetic borrowers had no delivery contacts/AI collection. Owner-only DEV Partner delivery remained contained; no independent delivery receipt or forced notification test is claimed. Historical opening edge cases were tested with isolated SQL fixtures rather than real historical GUI writes. Untouched reports and the dormant legacy first-day action were not re-audited/enabled.

## Exact definitions and recovery

- Canonical OLTP: `500b27b6-884a-41e8-a9ec-df801b0110ad`; canonical OLAP: `9f3422be-bc87-4a5a-a42a-67528ee80393`.
- Verified target: instance `appsheet-pg-prod-20260914`, host `34.21.174.215:5432`, database `loan_manager_dev`; PROD was not changed.
- Applied only V71/checksum1702601106 and V72/checksum-1995290851 at11:07 UTC; V70 was not replayed. [Runner result](vm01-migrate-v72.json). All25 non-history fingerprints matched immediately after migration.
- App rollback points: OLTP186 (automatic consistency refresh of saved185), OLAP54. Verified private V70 dump SHA256 `7bfe8889a3393a4ef79ad4a7a13e1ed16c4c9ef0be5c05583d370cd2ff82cf5c`, restored26 matching fingerprints before writes; [backup evidence](vm01-development-backup.json). The private restore is stopped. App restoration does not undo SQL; restore/forward-fix must coordinate shared DEV state, not blindly replace it after intervening work.
- [Selected saved AppSheet properties](vm01-app-properties-20261006.json), [live SQL definitions](vm01-sql-definitions-20261006.json) and81 DEV dictionary overlays cover27 app objects,44 routines and10 relations. This is explicit selected-property coverage, not a complete AppDoc export; PROD YAML is unchanged.
- Testing corrected unrunnable OLTP190 text quoting in191, missing-original-rate frontend validation in192, stale Undo client closure state in193, unsaved receipt guidance in194 and negative withdrawal display in OLAP56. One exact disposable stale-Undo recovery and all cleanup before/after states remain private.

## Publication

Task branch: `codex/r051-receipt-corrections`; [draft PR15](https://github.com/welct0407/AppSheet-Loan-Project/pull/15). Starting commit04e3f2713ac0d81c831d0d5fb44f5b101e85e8b1. Unrelated main-checkout work was preserved in place. Intended task files only are published; the PR's checks identify CI on the exact published head. No merge, tag, RC or PROD action is part of this completion.
