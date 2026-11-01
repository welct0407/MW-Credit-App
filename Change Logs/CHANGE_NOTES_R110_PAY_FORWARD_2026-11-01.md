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

## DEV deployment record

Forge, 1 November 2026, UTC. Owner instruction of 1 November 2026: "When done, open the PR and test it in Dev". DEV only; no PROD action of any kind, reads included; no merge.

| Item | Result |
| --- | --- |
| Source | `d8380f4` (PR #202 head, branch `claude/r110-pay-forward`). Development checks run 41350125802 and database rebuild run 41350100319 passed. Clean checkout for the migration; the image from a `git archive` of the same commit |
| Target check | `loan_manager_dev` on `mw-credit-pg-20261017`, head 120 (120 rows, 0 failed), no active sessions; services `mw-credit-app-{read,command,chat}-dev` in `clever-oasis-508610-n7`, `asia-southeast1`, on the R109 baseline (read `00054-b7k`, command `00071-2c4`, chat `00023-bdg`, image `2e759963…`) |
| Backup at V120, 21:16:02Z to 21:18:30Z | Dump sha256 `a9c1cf6afc8dd723a84989c7250311a279a982f07c018372c9e753efd2422b38`; archive listing and restore passed; 38 table fingerprints match; `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-f3184c9e277c45b7b923fd5fb88a3db3/` |
| Owner window | 5 owners (`mw_chat_owner_dev`, `mw_notify_owner_dev`, `mw_jobs_owner_dev`, `mw_changes_owner_dev`, `mw_app_dev_journal_owner`; the journal owner owns `pwa_submit_selected_charges_v1`, the others for the post-migrate reconcile), 20 statements, opened 21:18:47Z, restored 21:27:14Z; readback all closed (inherit, set and admin false, no CREATE on `public`) |
| V121 | `Invoke-Flyway.ps1 -Environment development migrate`: installed 21:19:14Z (63.6 s, checksum 1044840148), head 121 (121 rows, 0 failed); role check 536 statements, 0 violations |
| Readback | `pwa_submit_selected_charges_v1` keeps owner `mw_app_dev_journal_owner`, its ACL and SECURITY DEFINER; `pwa_effective_payment_plan_v2` keeps owner `postgres` and its ACL; new `pwa_pay_forward_plan_v1(text,numeric,date,jsonb)` owned by `postgres`, ACL `{postgres=X/postgres,mw_app_dev=X/postgres}`: `mw_app_dev` can execute, PUBLIC cannot |
| Image | Cloud Build `8c65f9bb-d703-47da-8541-b77395c83957` (`cloudbuild-command.yaml`) as `mw-credit-app-build`, SUCCESS 21:28:03Z to 21:28:40Z, `api@sha256:7c4064c79f23274549eb8e9c77d8cecad36da8536ed3ba42def194b8cb158db6` |
| Terraform DEV | Plan 0 add, 3 change, 0 destroy, image attribute only on `read_api`, `command_api`, `chat_api`; applied 21:30:18Z to 21:30:54Z; re-plan no changes; settings generation `1793568660802353` (previous `1793515690898680`); read `00055-5gq`, command `00072-rsw`, chat `00024-wvq`, 100% traffic; notify `00022-mjg` and jobs `00022-c97` unchanged on `ef7beb4b…` |
| Smoke | `/health` 200 on read, command and chat; unauthenticated 401 (`/api/session` on read and command, `/api/chat/models` on chat, `POST /api/payment-drafts/x/plan` on command); preflight from `https://dev-lm.mw-credit.com` 204; no ERROR logs from 21:30Z |
| Hosting | `MW_RELEASE_NUMBER=R110 npm run build:live-dev` with `.env.live-dev` written from Secret Manager and the R109 bundle's settings (9 settings; the built settings object is identical to R109's), deleted after the build; `deploy-hosting.mjs --live-dev --check` passed; deployed 21:33:10Z to 21:33:18Z; version `f81a4d9275bfd59e`, release `1793568797384000`; build-version R110 `b84f517bc15245040b7668f8`, entry `/assets/index-D_xhGMXA.js` embeds `d8380f4`; `build-version.json` identical on `dev-lm.mw-credit.com` and `web.app`; `sw.js` `no-store`; CSP `connect-src` unchanged |
| Credentials | The temporary admin and read credential files are deleted; no secret value was printed |
| Rollback | Settings generation `1793515690898680` (image `2e759963…`, R109) with Hosting `7edb5522c9789e82` (release `1793515830213000`), plus the V120 backup above. V121 is functions only and the R109 image does not call `pwa_pay_forward_plan_v1`, so a service rollback can stay on V121; a schema rollback is a later migration (see Recovery) |

Proof of behavior: Chase's DEV business smoke follows. The Environment Inventory DEV rows carry the pins.

## DEV end-to-end record

Chase, 1 and 2 November 2026 (Bangkok business day 2026-11-02), on R110 as deployed above (command `00072-rsw`, Hosting `f81a4d9275bfd59e`). Owner instruction: "test it in Dev". Partner `claude-dev-test` through `scripts/dev/claude-test-token.mjs` (ID token in a 0700 directory, deleted afterwards; no secret printed). Synthetic borrowers only, all named "R110 SYNTHETIC PAY FORWARD A to G" and funded from the synthetic account `R052-4G-ACCOUNT`; no real DEV borrower was changed. As in the R109 record, payments were posted normally; no notification delivery was checked or forced.

Setup: `POST /api/borrower-records`, `loan.create` (daily interest, principal 1,000, 10 a day, original rate 1%) and `loan.generate-charge` for today where a due charge was needed.

| Case | Result |
| --- | --- |
| (a) Loan A (`895e0cdb`): due 10, amount 55, Pay forward | Auto-assign returned `remainder` 45 with 5 forward rows and one principal option. `POST .../plan` returned due 10, remainder 45, uncovered 0, paid through 6 Nov. Review 200, v10 submit `posted` (`ffa4d95b-…`). Charges booked 3 to 7 Nov at 10; the 7 Nov charge has 5 remaining (partial) and "paid through" stops at 6 Nov. Borrower detail read: "Paid through" 2026-11-06 |
| (b) Loan B (`1f70d112`): raise on a schedule day | A v7 payment of 6 on the due 10 posted as before (4 left). Plan for 104 with principal 100: `raise`, outstanding 1,000 to 900, daily interest 10 to 9, next charge 3 Nov for 9. Posted. Loan record after: outstanding 900, daily interest 9, schedule anchor 2026-11-02 (today); today's charge 100 principal and 10 interest, remaining 0; next offer 3 Nov for 9 |
| (c) Loan C (`ff195fe4`, interval 7, loan date three days ago, no charge today) | Auto-assign offered principal 100 as `book` with accrued interest 30. Plan: accrued 30, principal 100, outstanding 900, daily interest 9, next charge 9 Nov for 63. Posted. Today's charge `pf121:` 100 principal and 30 interest, paid; anchor today; one charge today; next offer 9 Nov for 63 |
| (d) At or below due | Auto-assign of 6 on a due 10 returned no `remainder`; the v7 payment posted as before (case b) |
| (e) Replay | The same v10 command for A returned `posted` with the same payment id; charges stayed 7 and payments 2 (first-day receipt and the payment) |
| Collection and Borrower detail, API and 390 px browser | Loan D, F and G tiles read "Fully paid" with the prepaid amount counted (D 60, F 40, G 70). Borrower detail of A shows "Paid through 6 Nov" on the loan line |
| Phone pass, 390 px, loan D (`3d907df3`, amount 60) | Auto-assign opened "Remainder ฿50" with Pay forward "3-7 Nov (10 x 5), paid through 7 Nov", Repay principal "1,000 to 950, new interest 10/day" and Split; nothing preselected, Review disabled with "Choose how to use the remainder before review." Pay forward collapsed to "Remainder ฿50: Pay forward" with Change, one run "3-7 Nov · 10 x 5", summary "Paid through 7 Nov"; Review showed the same summary; Confirm posted (D: 60 Posted, 7 charges). No horizontal scroll |

Findings, none blocking:
- The Collection tile of loan A read "Partially paid" with 0 remaining and 55 collected, because its future charge of 7 Nov is partly paid.
- Fixed in `4e3e632`, to be redeployed to DEV: the Collection status now counts only charges dated by today, so the loan A tile no longer reads "Partially paid" with 0 remaining (real-query case in `collection-postgres.test.mjs`: red on the old query, green on the new).
- After Confirm the phone form still read "Saved on this device. Will sync when connected." 4 s later although the server had already posted the payment (60 Posted). It looks like proxy latency in this session, but it was not repeated; worth a look on a real phone.
- "Paid in advance" with its payment date (`prepaidPaymentDate`) was not reached: the tile appears only for prepaid charges paid on an earlier day, so D, F and G (all prepaid today) show it from 3 November. The path is covered by the unit and Playwright tests only.

DEV left in place, as in R109: the seven synthetic loans A to G, their borrowers and payments (loan delete is refused once a receipt exists). Each loan's `autoChargeEnabled` was switched off with `loan.update` so the daily jobs add no charges; the loans keep their prepaid charges and the changed daily interest (B and C 9) and anchor. The token file was deleted.

## Not run
Skipped and not verified, so not a pass:
- WebKit and a real iPhone pass (Echo checked Chromium only).
- Thai wording on screen.
- Anything in PROD.
- A real iPhone or Safari run and Thai wording of the Remainder block on DEV.

## Recovery
Before release: revert the pull request (Git baseline R109 `8ced324` plus later main commits). Schema: V121 is functions only; rollback is a later migration that restores the replaced bodies. To be completed at hand-off.

## Open questions
None for the owner at this point.

## Remaining work
- Pull request `Development checks` (the one broad run).
- Forge: DEV deployment and test (authorized, after the PR is open); PROD promotion and merge need a separate scoped owner instruction.
- Releases 2 and 3 of the plan.
