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
- Functions only, in the journal-owner window. No table, column, grant, data or image change beyond what the runner derives.

Known limitation, recorded and not fixed: the closing payment's `closeRebate` and its `payment.posted` push show only one rebate line (`LIMIT 1`) when two loans close. The postings themselves are correct.

Files (Byte builds database/, scripts/database/, tests/ and services/chat/assets/; Dewey the records):
- `database/migrations/` V131 `rebate_offset_per_loan` (Byte; exact filename in the pull request).
- `database/README.md`, tests and the chat rule asset (Byte).
- `project/Documents/PWA_Data_Model_Overview.md`: Expenses row now names the id shape `ro122:<closing payment>[:<loan>]`.
- `project/Documents/Solution_Design.md`: R117 paragraph.
- `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`: R117 scope (Open).
- `project/Documents/Data Dictionary/systems/postgresql/routines/public-create-referral-rebate-p-loan-text-dc831aa4.yaml`: not edited by hand. The entry is a PROD capture, so it is refreshed after the PROD apply (see Remaining work).
- This note.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (tests), Forge (promotion).

## Checks
| Command | Result |
| --- | --- |
| | |

## Not run
To be filled when the checks run.

## Recovery
Git baseline: the R116 package `3ef969f` plus the merged R116 records. V131 is a function redefinition: undo it by applying a forward migration that restores the V124 body of `create_referral_rebate`; shared migrations are never edited or removed. Rows posted under the new id shape stay valid. The PROD apply needs a verified restorable backup at V130, recorded in the promotion record.

## Open questions
None.

## Remaining work
- Chase verification and PR CI; Byte's disposable-database run.
- DEV apply and synthetic smoke (Forge), then PROD apply after a verified backup (Forge).
- After the PROD apply, refresh the `create_referral_rebate` Data Dictionary entry from a PROD capture with `reconcile_captures.py --only routine:public.create_referral_rebate(p_loan text)`, and update `database/README.md` for the PROD apply.
- The owner's stuck payment is retried by the app from the phone once the command path is healthy; reconcile before any manual retry (Forge and the owner).
- Known limitation above (one rebate line in `closeRebate` and the push) stays open.

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
