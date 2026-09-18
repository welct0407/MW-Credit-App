# R005 settlement Delete refinement — 18 September 2026

Implemented in **DEV SQL V21 / OLAP 1.000123**. OLTP remains **1.000120**. Completed and Pending settlement Delete workflows passed through the current AppSheet desktop interface with SQL readback. No production changes or owner acceptance are recorded. Overall recommendation remains **Not ready** because the release's deployment-check rerun and notification-delivery checks remain open.

## Behavior and diagnosis

The owner requested that Delete restore the position before creating a settlement, with no separate Cancel Settlement action. The forwarded device-change email showed a physical `DeleteTableRow` request for a completed settlement. Read-only SQL inspection confirmed its derived ledger row and the restrictive `Cash Ledger_Ref Settlement_fkey`. The email contained the queued operation, not an explicit PostgreSQL error string. Raw email/session material was not copied into Git.

The visible trash button is **Delete**. AppSheet's generated physical-delete action cannot be retargeted, so a replacement action internally named `Delete Settlement` uses the same visible label and trash icon. The table now permits adds and updates; its generated physical Delete is absent. There is no new Cancel Settlement action. Existing Complete Transfer and Reverse Transfer are unchanged.

Delete writes `Status = "Cancelled"` and appends the user/time to Notes. SQL retains the original Row ID, amount, partner and dates, removes the derived current cash effect through V20, excludes the reversed row from settlement reservations, and refreshes existing historical analytics snapshots when reversing a completed settlement. All holder balances and the partner's available amount return to their pre-creation values. A pending reversal only releases its reservation. Repeated requests are harmless, and reopening/changing reversed source facts or physically deleting settlements is rejected.

OLAP's Settlements security filter is `[Status] <> "Cancelled"`. The partner Total Settlement Created formula also excludes Cancelled, so its amount changes immediately in the client. The form continues to offer Pending/Completed. After sync, the reversed row disappears from normal lists. An already-open detail may remain until sync and then show no selected item; cash totals are SQL-derived and also require sync. Audit history remains in SQL, without adding a separate history UI.

## Evidence and consumers

- [Executed test results](reversal-test-results.json): completed 1-baht create/Delete restores all cash balances, available amount and related-row count exactly; pending 1-baht create/Delete leaves cash unchanged and releases the reservation. Original facts and appended audit notes verified. Both new synthetic records remain in SQL with Cancelled status and no cash rows. The owner's reported settlement was not changed.
- Isolated migration tests: `scripts/database/Test-R005Reversal.sql`, using the existing migration runner with V19 fixtures, passed historical three-day snapshot restoration, exact cash restoration, source retention, retry, forbidden reopen/physical delete, over-settlement rejection and reservation reuse. Existing global allocation lock is unchanged; no new concurrency test is claimed. Private execution log: `r005-20260917/reversal-sql-tests-r2.log` under the established external credential/artifact folder. The seeded test mode intentionally does not report a baseline schema-match result.
- [DEV migration](reversal-migrate.json) and [Flyway validation](reversal-validate.json) passed. V21 SHA-256 `E0D8F1215D14F5985470D0476E6FC34F469D3C722D286005432B613BF3EF080B`.
- [Full current configuration checklist](reversal-configuration-checklist.json) supersedes the previous V20 candidate checklist. It reconciles both apps' complete exported baseline-to-candidate differences, with zero unmapped exported properties. [Coherent-save history](reversal-save-reconciliation.json) retains the intermediate assignment correction. Saved 1.000121 had the second assignment targeting Status; 1.000123 correctly targets Notes. No test Delete used 1.000121. AppSheet's intermediate 1.000122 definition was not separately captured; do not claim that version's coverage verified.
- OLAP owns Settlements, partner totals, cash position and ledger. OLTP has no Settlements table or settlement action; its export is unchanged ([zero diff](dev-oltp-reversal-final-diff.json)). Shared SQL Daily Analytics retains its grain and existing columns; the affected historical settlement totals were verified in isolated SQL tests. No Looker edit or unrelated report audit was performed.
- Both final current editors show No issues found: [OLAP](reversal-final-olap-editor.txt), [OLTP](reversal-final-oltp-editor.txt). Their deployed-state Deployment Check sections expose no rerun button. No mode change was made merely to obtain diagnostics. Existing export omissions remain under the owner's limited R005 exception. The entire release is not an accepted/frozen production package.

## Recovery and owner check

Tested implementation commit: **770e2bee8d35c086471bb3286914fcbb9dd4e20a**. [V21 manifest](reversal-sql-candidate-manifest.json) captured from the clean tested commit; the later documentation commit does not change this pin. No production authorization.

Immediate app rollback reference: **OLAP 1.000120**; OLTP **1.000120** unchanged. A coordinated rollback must also account for V21 and retained Cancelled rows: reverting only the app would reintroduce counting/physical-delete behavior. Prefer a higher Flyway forward-fix migration. Do not edit applied V21 or blindly restore pre-V21 data over subsequent DEV work.

Pre-V21 DEV backup: [path and hash record](reversal-backup.json), `development-before-v21.dump`, SHA-256 `01652F50F75BBFB093E20F873BADB6E4CDFB1D64F32A781077C12C146BC20ED6`. Archive listing verified; this new snapshot was not restore-rehearsed. The earlier R005 backup restore rehearsal remains separately recorded.

Owner check: refresh/sync DEV OLAP, open the intended settlement and use **Delete**, then sync and confirm the restored cash/partner totals. This release cannot rewrite a physical-delete request already queued on another device. If that old error remains, review and discard only the failed old operation before retrying; do not clear unrelated unsynced changes.
