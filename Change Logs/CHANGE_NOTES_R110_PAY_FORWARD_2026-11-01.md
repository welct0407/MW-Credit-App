# Change notes — R110 Pay Forward, Release 1, 2026-11-01

## Purpose
Money that arrives before its charge exists today needs the Partner to book future charges by hand (Upcoming Charges "Record charge", R104) before recording the payment, and R101 "Pay ahead" covers one next charge per loan only. R110 lets the payment command create the charges itself and lets the Partner choose what the remainder does. Design record: the owner-approved [plan artifact](https://claude.ai/artifact/6iCRmdeKsroNkf6NxKrZBj) (Pay Forward Design, revision 6, 1 November 2026); no new design document.

## Changes
Scope: Release 1 (core) only. Release 2 (rebate offset, needs a new column) and Release 3 (agent) are later releases and are not part of R110.

Owner authority (1 November 2026): "Engage the 6 members team and implement release 1 from the repayment handling solution session." This authorizes building Release 1 as R110 and delegating to the team. It does not authorize merging, live financial writes or any new table or column (Release 1 needs none).

Second owner instruction (1 November 2026): "When done, open the PR and test it in Dev". It covers opening the pull request and the DEV deployment and test. PROD, merging and Releases 2 and 3 are not covered.

Owner decisions (plan revision 6):
| Id | Decision |
| --- | --- |
| D1 | Fixed Due Date loans join the forecast: their single Due Date charge can be booked and paid early |
| D4 | Deleting a pay-forward payment leaves the booked charges, which reopen; today's raised or booked principal stays unpaid |
| D6 | Identical future rows collapse into one row with a count, expandable |
| D8 | Daily Installment: pay forward only in Release 1, no principal option |
| D9 | Non-schedule day: book today's charge with accrued interest plus the principal; the interval anchor resets to today |
| D2 | New column "Ref Offset Payment" on Business Expenses and payment method "Referral Rebate Offset": both authorized; Release 2, not used in R110 |
| D3 | Rebate choice at Loan Close when the referrer has an open loan: offset preselected, the Partner can switch to pay out; Release 2 |
| D5 | Money beyond what is due has no default purpose: the Partner chooses Pay forward, Repay principal or Split every time; Review is disabled until then |
| D7 | Agent slips with money beyond what is due have no default: the agent replies with numbered options and posts only the path the reply names; Release 3 |

Design rules (owner): one charge per loan per day; no default purpose, so when money exceeds what is due the Partner chooses Pay forward, Repay principal or Split before Review. Booked charges are ordinary charges afterwards.

Changed (code commit `751530f`, 18 files; further test files uncommitted at this writing):
- Database: `database/migrations/V121__pay_forward_plan_and_principal.sql` (functions only: `pwa_pay_forward_plan_v1(borrower, amount, day, purpose jsonb)` granted to `mw_app_<env>`, command v10), `database/current/public-functions.sql`, `database/README.md` (V121 paragraph), `scripts/database/Test-AccessMatrix.sql` (new grant row).
- Command v10: `services/contracts/payment-command.mjs` (v8 keys plus `materialize`, 0 to 200 entries, several per loan, and `principal`, 0 to 20 `{kind raise|book}`; book key `pf121:<len>:<loan>:<date>`), `services/payment-command/handler.mjs`, `store.mjs`. Principal moves the schedule anchor to today; forward charges are priced at the new daily interest with Interest Due overwritten server-side from the locked plan; Current Daily Interest after posting must equal the plan or the payment rolls back as `selection_unavailable`. No trigger is disabled.
- API: `POST /api/payment-drafts/:borrower/plan`; Auto-assign returns a `remainder` object; Review returns 409 `plan_changed`; `services/api/borrower-read-store.mjs`, `collection-read-contract.mjs` (`prepaidPaymentDate`), `loan-read-contract.mjs` (`paidThrough`).
- PWA: `apps/pwa/src/SelectedCharges.tsx` (Remainder block replaces Pay ahead), `CollectionRecords.tsx`, `LoanRecords.tsx`, `live-style.css`, `offline-sync.ts` (accepts v10). Chat schema digest rebuilt at 121 (`services/chat/assets/schema-digest.json`); the chat still builds v8 and v9.
- Tests: `tests/unit/contract-surface.test.mjs`, `payment-allocation-contract.test.mjs`, `payment-command-contract.test.mjs`; uncommitted at this writing: `scripts/database/Test-PayForward.sql` (new), `Test-StatementBatch.sql`, `tests/e2e/pay-forward-independent.spec.ts` (new), `collection-read.spec.ts`, `loan-read.spec.ts`, `tests/integration/projected-charge-payment-independent.test.mjs`.
- Records (Dewey): this note, the Release tracker R110 scope paragraph, the Development Changes R110 row, PWA Data Model Overview (Payments row), Solution Design R110 paragraph, `database/README.md`, `docs/Development_Read_Service.md` (payment draft plan), `services/chat/assets/conversation-business-rules.md` (the Pay ahead sentence and v10).
- Data Dictionary: entries for V121-affected routines are regenerated by the PROD capture after V121 reaches PROD, not hand-edited. Due at promotion.

Team (six-agent process, this session): Archie designed, Byte built the code, Chase verified on a disposable cluster, Echo reviewed the built UI, Dewey kept records, Forge has no code work: the accepted schemaVersions are hard-coded in `services/contracts/payment-command.mjs` and grants live in the migration, so there is no Terraform, IAM or secret change. Forge runs the DEV deployment later.

## Checks
| Command | Result |
| --- | --- |
| Biome lint (Byte, `751530f`) | Clean |
| Typecheck (Byte, `751530f`) | Exit 0 |
| Unit tests (Byte, `751530f`) | 1070 passed, 0 failed |
| `Test-MigrationsCloud.py` (Byte, `751530f`) | Head 121, self-check passed, rerun a no-op, checksum tamper rejected |
| `Test-ProjectedChargePayment.sql`, `Test-AccessMatrix.sql` (Byte, `751530f`) | Pass |
| Lint, typecheck, unit (Byte, `3317e97`, Echo's UI fixes RP-5, RP-8, RP-9, RP-10) | Clean, exit 0, 1070 passed, 0 failed |
| Typecheck, unit, migrations, integration (Byte, `a6ab1d1`, Chase's defect fixes) | Exit 0; 1071 passed, 0 failed; migrations to 121; integration 15/15 |
| `Test-StatementBatch.sql` including the new `Test-PayForward.sql` (Chase, `2ea59f9`) | Pass at head 121 |
| Integration `projected-charge-payment-independent` (Chase, `2ea59f9`) | 15/15 |
| e2e `pay-forward-independent`, `projected-charge-payment-independent`, `receiving-ux-independent` (Chase, `2ea59f9`) | 36/36, desktop and phone |
| e2e `collection-read`, `loan-read` (Chase, `3317e97`) | Passed (18 and 14 with the others) |
| Echo, built UI at 390x844 Chromium (`751530f`) | RP-1 to RP-4, RP-6, COL-1, BD-1 fixed; RP-5 must-fix, fixed in `3317e97` |
| Wide suite | The pull request's `Development checks` run (pending) |

Defects found and fixed:
- Auto-assign remainder unwrapping (`services/payment-command/store.mjs`).
- Orchestrator decision: a v10 command with forward or principal entries must be dated the business day (22023); a due-only payment keeps the slip date.
- Race window assessed: every charge insert takes the borrower lock, so no change. There is no concurrency `.ps1` script; the race is covered in the integration test.
- The Pay ahead e2e tests are retired and replaced by `pay-forward-independent`.

## Not run
Skipped and not verified, so not a pass:
- WebKit and a real iPhone pass (Echo checked Chromium only).
- Thai wording on screen.
- Any DEV deployment test (Forge, pending) and anything in PROD.

## Recovery
Before release: revert the pull request (Git baseline R109 `8ced324` plus later main commits). Schema: V121 is functions only; rollback is a later migration that restores the replaced bodies. To be completed at hand-off.

## Open questions
None for the owner at this point.

## Remaining work
- Pull request `Development checks` (the one broad run).
- Forge: DEV deployment and test (authorized, after the PR is open); PROD promotion and merge need a separate scoped owner instruction.
- Releases 2 and 3 of the plan.
