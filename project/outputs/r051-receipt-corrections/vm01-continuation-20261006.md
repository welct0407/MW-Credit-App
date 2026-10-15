# R051 — local VM-01 continuation, 6 October 2026

Status: DEV implementation and bounded acceptance complete. [Final versions, tests, cleanup and recovery](vm01-completion-20261006.md). The baseline and candidate sections below retain the continuation history.

## Baseline and preservation

- Starting task pin: `04e3f2713ac0d81c831d0d5fb44f5b101e85e8b1`, branch `codex/r051-receipt-corrections`, existing draft PR15.
- Main checkout remains on master `9ded8599f411a749748ea8659553472187b84573`. Existing Metabase source changes and untracked R026/R048/risks artifacts are untouched. A separate `C:\GitHub\AppSheet-Loan-Project-r051` worktree tracks the existing task branch.
- Existing Chrome work profile `mw-credit.com`; AppSheet Account visibly confirms `welct0407@mw-credit.com`.
- Canonical DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` is Deployed, saved/restorable **1.000186**. History identifies 186 as System / Editor refresh / Automatic consistency check at `2026-10-06T10:34:09.6115378Z`; previous user save is185 at09:20:29. History does not enumerate its individual changes. Save/Undo initially disabled; saved indicator says No issues found. This is the rollback version for this batch, not a claim of complete GUI acceptance.
- Canonical DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393` is saved/restorable **1.000054**, initially Save/Undo disabled and No issues found. This is its rollback point.
- Old cloud tabs are not part of this local session. The appendix preserves their exact unsaved changes. Saved OLTP Loan Delete still has the old allocation-only condition. OLAP Loan Assessment uses `Loan Assessment SQL Lab View`; its Ref Borrower is optional and IsAPartOf is false. No assessment client cascade is enabled.
- Fresh read-only SQL connection verifies instance configuration `appsheet-pg-prod-20260914`, actual host `34.21.174.215`, database `loan_manager_dev`, transaction_read_only=on, latest V70/checksum124258995/success. No other active/open transaction. V70 was not reapplied.
- All four DEV partners have zero nonblank delivery-email violations against owner-only `welct0407@mw-credit.com`. This SQL check is not complete bot-route or delivery evidence.

## Owner decisions in this continuation

- Keep an existing Lisa→Tommy reimbursement transfer after deleting its expense; record any actual return of cash separately. Do not invent a refund or duplicate reversal.
- Missing historical cash attribution belongs to Lisa. Read-only account inspection finds exactly one active default Lisa account, label `Lisa`, ID `7d587fc5-483b-4bd8-9bd7-facf5baab2b3`; other listed Lisa accounts are labeled synthetic and nondefault.
- Optional assessment history must survive borrower deletion. Historical opening corrections must follow changed sources. No restrictive dependency views, PROD changes, merge, credential/access changes or real-record test deletion.

## Candidate and checks

- V71 retains independent reimbursements with a nullable expense link and source-ID note, and makes optional assessment references nullable on borrower deletion while preserving the last SQL assessment snapshot. V72 automatically records R005 source deltas and adjusts R008 openings once for previously unassigned ledger entries. Original baseline flows/timestamps remain; prior opening values are appended to Notes.
- Former-profile initdb restrictions were resolved by copying the existing PostgreSQL/Flyway tools to the current user's normal tools directory, without changing credentials/access. Full Windows `Test-CI.ps1` passed: all72 migrations, repeat/checksum checks, nine concurrency suites, V19/V22/V68/V69 upgrades. Focused relaxed-policy and both historical-opening suites passed.
- Fresh private dump SHA256 `7bfe8889a3393a4ef79ad4a7a13e1ed16c4c9ef0be5c05583d370cd2ff82cf5c` restored26 matching tables; migration rehearsal changed no rows. Restore cluster stopped. See [backup evidence](vm01-development-backup.json).
- At11:07 UTC the maintained runner applied only71/72 to verified DEV. Checksums1702601106/-1995290851, validation successful, no warnings. All25 non-history table fingerprints still matched the backup afterward. See [application](vm01-migrate-v72.json) and [validation](vm01-v72-validation.json).
- OLTP saved Loan Delete/principal appendix drafts; added the previously unapplied Loan Type validator/error and outer-IF Charge Ref Loans validator. A later repayment batch adds independent `df10:` immutability to five editable fields and Edit/Delete. Exact version and final readback are pending. OLAP remains54 so far.

Final OLTP194 / OLAP56 / V72; appendix drafts reconciled, GUI workflows tested, fixtures removed and dictionary updated. See the completion record for exact evidence and publication status.
