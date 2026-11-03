# Change notes — R117 PROD hotfix V131, referral rebate offset id per loan, 3 November 2026

## Purpose
A PROD Receive payment that paid off two loans of one borrower stayed at "Waiting to sync" and nothing was posted. V131 gives each closed loan its own default rebate offset id so a multi-loan close posts. The owner authorized the PROD hotfix on 3 November 2026 ("go ahead with the V131 hotfix to production") and reminded that DEV must not be skipped. R117 stays Open.

## Changes
Outcome: a payment that closes two or more referred loans of one borrower posts, with one rebate offset per closed loan, instead of rolling back.

Trigger (owner report, 3 November 2026 14:13 Bangkok): a PROD Receive payment of 2,200 baht by bank transfer stuck at "Waiting to sync". It paid off two loans of one borrower.

Root cause, with evidence (no borrower data):
- The encrypted troubleshooting file was decrypted outside the repository and deleted after reading.
- PROD command logs, revision `mw-credit-app-command-prod-00045-c67`: every `POST /api/payment-commands` returned 503 `command_unavailable` from 07:11:38Z.
- Cloud SQL log: SQLSTATE 23505 on `pwa_payment_commands_pkey`, raised in `create_referral_rebate`.
- That is the V124 default-offset branch. It derives the offset payment id `ro122:<closing payment>` and the system request id from it, then inserts a `system.rebate-offset` row in `pwa_payment_commands`. It is reached through `referral_loan_closed` from `pwa_submit_selected_charges_v1`.
- When one payment closes two referred loans (possible since R113), both loans derive the same offset id and request id. The second insert hits the primary key and the whole payment rolls back. Nothing was posted.
- The agent receipt command takes the same path and has the same exposure.

Design (Archie, accepted):
- V131 `rebate_offset_per_loan` redefines `create_referral_rebate`. The default-offset id becomes `ro122:<closing payment>:<loan>`; the request id is derived from that id by the existing documented md5 rule, so it is unique per loan.
- The Loan Close command path (`loan.close`, `offsetPaymentId` stored in its result) is unchanged and still uses `ro122:<closing payment>`. Rows already posted stay valid. Nothing else in the function changes.
- Second part of V131: before planning, it runs `PERFORM public.r051_flush_parents('charge'); PERFORM public.r051_flush_parents('loan');`, the deferred `vc_repayment_changed` work run early. Charge balances otherwise refresh only at commit. Without the flush, the second offset planned against stale balances, posted a 0.00 allocation, was refused (P4C05), and that rebate fell back to payable. Found by the two-loan test after the id change alone.
- V131 is functions only, with no owner window (`ownerWindows` is empty). The migration preflight requires `current_user` to be a superuser or to inherit the function's owner (`postgres`); lab proof: a non-superuser owner passes and a non-owner is refused with exit 3. No table, column, grant or data change. The schema digest moves to 131, which changes the read, command and chat images, so R117 is a generic runtime-workers-frontend release (see the promotion records).

Known limitation, recorded and not fixed: both `closeRebate` in `services/business/payments.mjs` and `pwa_notify_content_v2` use `LIMIT 1`, so the closing payment's record and its `payment.posted` push show only the first rebate line when two loans close. The postings themselves are correct.

Files (Byte builds database/, scripts/database/, tests/ and services/chat/assets/; Dewey the records):
- `database/migrations/` V131 `rebate_offset_per_loan` (Byte; exact filename in the pull request).
- Tests (Byte): `Test-RebateOffset.sql` has a new two-loan case (borrower RO-BXM, loans RO-LXM1 and RO-LXM2) under `SET CONSTRAINTS ALL DEFERRED`; `Test-AgentReceiptPayForward.sql` has an agent receipt two-loan case; `rebate-offset-independent.test.mjs` has a two-loan test and a test-only date fix to the existing agent receipt test (its objectKey now uses the capture date; it hard-coded 2026/11/02). `Test-RebateOffset.sql` section 3d adds Chase's scenarios: A partial cover (300 + 170), B second uncovered (470 offset, the rest payable), C same charge (30 + 20).
- Chat schema digest rebuilt at 131; `database/README.md` and the chat rule asset (Byte).
- `project/Documents/PWA_Data_Model_Overview.md`: Expenses row now names the id shape `ro122:<closing payment>[:<loan>]`.
- `project/Documents/Solution_Design.md`: R117 paragraph.
- `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`: R117 scope (Open).
- `project/Documents/Data Dictionary/systems/postgresql/routines/public-create-referral-rebate-p-loan-text-dc831aa4.yaml`: not edited by hand. The entry is a PROD capture, so it is refreshed after the PROD apply (see Remaining work).
- This note.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (tests), Forge (promotion).

## Checks
| Command | Result |
| --- | --- |
| `pwsh scripts/database/Test-CI.ps1 -Group migrations` | Pass, exit 0, working tree on 41f50527, rerun after Archie's changes (Byte) |
| `pwsh tests/integration/Run-UnifiedReceiving.ps1` | Pass, exit 0, rebate-offset 14/14, working tree on 41f50527, rerun after Archie's changes (Byte) |
| Schema digest rebuilt at 131, `--check` | Pass, exit 0, rerun (Byte) |
| `node --test tests/unit/chat-schema-digest.test.mjs` | 3 pass, 1 skipped, rerun (Byte) |
| Chat and hosting unit tests | 311 pass (Byte) |
| Typecheck | Pass, exit 0 (Byte) |
| V130 reproduction | 23505, then 503 `command_unavailable`; with the id change only, 1 offset instead of 2 (Byte) |
| Chase independent review | All cases PASS: V131 applied cleanly on V130 with existing single-loan rows identical, plus the partial, uncovered and same-charge cases (Chase) |
| Archie review | Approved after the flush and preflight changes (Archie) |
| PR CI | Pending |

## Not run
To be filled when the checks run.

## Recovery
Git baseline: the R116 package `3ef969f` plus the merged R116 records. The read, command and chat images return to the R116 revisions. V131 is a function redefinition: undo it by applying a forward migration that restores the V124 body of `create_referral_rebate`; shared migrations are never edited or removed. Rows posted under the new id shape stay valid. The PROD apply needs a verified restorable backup at V130, recorded in the promotion record.

## Open questions
None.

## Remaining work
- PR CI.
- Forge, DEV first: backup, V130 reproduction, V131 apply, synthetic smoke; then PROD after a verified backup. Order: SQL, then read, command and chat images, then Hosting. Notify and jobs are unchanged.
- After the PROD apply, refresh the `create_referral_rebate` Data Dictionary entry from a PROD capture with `reconcile_captures.py --only routine:public.create_referral_rebate(p_loan text)`, and update `database/README.md` for the PROD apply.
- The owner's stuck payment is retried by the app from the phone once the command path is healthy; reconcile before any manual retry (Forge and the owner).
- Known limitation above (`LIMIT 1` in `closeRebate` and `pwa_notify_content_v2`) stays open.

## DEV promotion record (Forge, fill in)
| Item | Result |
| --- | --- |
| Scope and authority | |
| Baseline before | |
| Package commit and manifest | |
| Apply result (V131 checksum, time, head) | |
| Synthetic smoke (two referred loans closed by one payment, agent receipt path) | |
| Verification | |

## PROD promotion record (Forge, fill in)
| Item | Result |
| --- | --- |
| Scope and authority | |
| Target verified (project, instance, database, service) | |
| Backup at V130 (verified, restorable) | |
| Apply result (V131 checksum, time, head) | |
| Image or revision change, if any | |
| Verification (read-only) | |
| Owner's stuck payment outcome | |
