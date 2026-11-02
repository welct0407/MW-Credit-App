# Change notes — R113 settle and close loans from Receive payment, 2026-11-02

## Purpose
Today, when the money left after the due charges reaches a loan's payoff, Receive payment shows only a guard line that sends the Partner to the Loan Close page. The owner expects the payment itself to close the loan. R113 lets Receive payment and the chat settle and close one or more loans in one payment, with the same money as the Loan Close quote. Design record: Archie's R113 design (orchestrator-accepted) on top of the owner-approved Pay Forward plan ([plan artifact](https://claude.ai/artifact/6iCRmdeKsroNkf6NxKrZBj)); no new design document.

## Changes
Owner authority (2 November 2026): "I expect it will close the loan by receiving the payment, not just a line redirecting me to close loan page" and "Yes, build it, test in dev and promote to prod". It authorizes building R113, the pull request, DEV deployment and test, and the merge and PROD promotion of the tested scope. Case that drove it: Ying, two daily-interest loans (1,000 from 27 October at 10%, 2,000 from 31 October at 10%), today's charges 20 and 200, a slip of 3,220: the remainder 3,000 equals both principals, so both loans close.

Scope:
- The pay-forward plan gains a principal kind `settle` instead of the guard. For an open, auto-enabled, daily-interest loan whose request amount reaches its payoff remainder, the plan calls `loan_close_calculation_v83` and emits the settle entry with the same amount and `planHash` as the Loan Close quote (due charges, gap interest, unpaid charges and the V113 lowering of future-charge interest).
- The payment command (`pwa_submit_selected_charges_v1`, schemaVersion 10) drops the refusal of settle entries and applies each through `apply_loan_close_calculation_v83` (re-lock, re-hash; `P5B09` maps to `selection_unavailable`), then posts. The ordinary "payment closes the loan" path closes the loan (`close_payment_loans`), and the V124 default rebate offset fires. No Loan Close method or target is set.
- Several loans in one payment: "Repay principal" takes loans in Row ID order; when the remainder equals the sum of the payoff remainders all settle; a loan whose payoff remainder fits settles and the rest flows on or stays uncovered (Review blocked). Split takes a per-loan amount; an amount equal to the payoff remainder settles, an amount between outstanding and the payoff remainder is blocked `needs_gap_interest`, above it `exceeds`.
- A settle needs the payment date to be today (a yesterday slip is blocked `date`); a non-daily loan is blocked `type` ("record manually").
- PWA Receive payment: the guard line is replaced by "Closes <loan key> · payoff X (gap interest g, charges c)" per settled loan, the rebate line from `pwa_referral_rebate_projection_v1` ("offset to their loan" or "transfer from Lisa"), and a summary such as "Closes 2 loans · outstanding 0"; Thai copy alongside.
- Chat: the card adds the existing `loan_close_payoff` consequence and the "Closes <loan key>" lines under the settling choice; the command is built as v10 at the Confirm claim.
- Agent schemaVersion 9 keeps the guard: a settling remainder is refused, and the options message says "Remainder settles <loan key>: record in the app" (see the [integration-agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R113_SETTLE_TEXT_2026-11-02.md)). `pwa_apply_pay_forward_v1` refuses settle entries unless called by the manual command (a transaction-local setting, as in V123).
- V126 is functions only (`pwa_pay_forward_plan_v1`, `pwa_submit_selected_charges_v1`, `pwa_apply_pay_forward_v1`) with an ACL self-check; `close_payment_loans`, `loan_close_calculation_v83` and the V59 deletion are unchanged: deleting the payment reopens the loans and keeps the `lc7:` charges, as Loan Close does.

Decisions recorded in the build:
- A principal equal to the outstanding with gap interest pending is blocked, so no open loan is left at zero outstanding.
- The rebate is the V124 default and is shown, not asked.
- Two differences Byte reported: the chat shows the "Closes ..." lines under the settling choice (the PWA shows them in the Remainder block), and the date block applies to the agent only (the app computes the plan for the payment date it submits).
- Alternative rejected: `pwa_apply_loan_close_v2` (one loan and one receipt per command, no room for other loans' due charges or the pay-forward remainder, two cash rows).

Changed (code commits `79e9c73f` and `589c7aeb`, plus Byte's two copy fixes in progress):
- Database: `database/migrations/V126__pay_forward_settle.sql`, `database/current/public-functions.sql`, `database/README.md` (V126), `services/chat/assets/schema-digest.json` (rebuilt at 126).
- Command and chat: `services/contracts/payment-command.mjs`, `services/payment-command/store.mjs`, `services/chat/payment-plan.mjs`, `apps/pwa/src/chat/ChatProposalCard.tsx`, `chat-protocol.ts`.
- PWA: `apps/pwa/src/SelectedCharges.tsx`.
- Agent: `review_proposal.py`, `partner_review.py`, `docs/PARTNER_REVIEW.md` and tests (integration-agent note).
- Tests: `scripts/database/Test-PayForwardSettle.sql` (new), `Test-PayForward.sql` (PF-S1 updated), `Test-AgentReceiptPayForward.sql`, `Test-StatementBatch.sql`, `tests/unit/chat-payment-plan.test.mjs`, `payment-allocation-contract.test.mjs`, `tests/integration/chat-payment-plan-independent.test.mjs`, `projected-charge-payment-independent.test.mjs`, `tests/e2e/pay-forward-independent.spec.ts`.
- Records (Dewey): this note, `database/README.md`, `services/chat/assets/conversation-business-rules.md`, Solution Design R113 paragraph, PWA Data Model Overview (Payments row), Development Changes R113 row. The integration-agent R112 note needs no edit (the options text change is in the R113 agent note).
- Data Dictionary: entries for V126-affected routines are regenerated by the PROD capture after V126 reaches PROD, not hand-edited. Due at promotion.

Team (six-agent process, this session): Archie designed, Byte builds the code, Chase verifies on a disposable cluster and on DEV, Echo reviews the built UI, Dewey keeps records, Forge deploys DEV and later PROD.

## Checks
| Command | Result |
| --- | --- |
| Migration chain to V126 with the replay; `Test-ProjectedChargePayment`, `Test-RebateOffset`, `Test-NotifyContent`, `Test-AgentReceiptPayForward`, `Test-AccessMatrix` (Byte, `79e9c73f`) | Pass; reconcile 0 violations |
| Biome lint, typecheck, unit, ruff (Byte, `79e9c73f`) | Clean; exit 0; 1091 passed, 0 failed; clean |
| Full `Test-StatementBatch.sql` including the new `Test-PayForwardSettle.sql` and the updated PF-S1 at V126 (Chase, `589c7aeb`) | Pass |
| Integration `chat-payment-plan`, `projected-charge-payment`, `rebate-offset`, `agent-receipt-pay-forward` (Chase, `589c7aeb`) | 6/6, 15/15, 13/13, 7/7 |
| e2e (Chase, `589c7aeb`) | 60/60, desktop and phone |
| Python agent tests (Chase, `589c7aeb`) | 40 OK |
| Agent lab discover (Chase, `589c7aeb`) | 698 tests, 8 environment errors in untouched modules; no defects |
| Echo, built UI (`79e9c73f`) | Nothing blocking; CL-1 and CH-6 being fixed |
| Wide suite | The pull request's `Development checks` run (pending) |

## DEV deployment record

Forge, 2 November 2026, UTC. Owner instruction of 2 November 2026: "Yes, build it, test in dev and promote to prod". DEV only: no PROD action and the agent VM not touched.

| Item | Result |
| --- | --- |
| Source | `63b40a4c` (PR #209 head, branch `claude/r113-settle-close`). Development checks run 41441501439, database run 41441475372, agent run 41441501488 passed. Clean checkout for the migration; the image from a `git archive` of the same commit |
| Target check | `loan_manager_dev` on `mw-credit-pg-20261017`, head 125 (125 rows, 0 failed), no active sessions; all five DEV services on `bd9d94a3…` (R112 `e6e147a1`) |
| Backup at V125, 12:13:49Z to 12:16:09Z | Dump sha256 `faf3830963b91cf0f70935922a80f08ec0d7f7e720063c56e4a91b5de5836e12`; archive listing and restore passed; 38 table fingerprints match; `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-c2dcc0b52e8d46289bb083b18e0db4b3/` |
| Owner window | 5 owners (`mw_chat_owner_dev`, `mw_notify_owner_dev`, `mw_jobs_owner_dev`, `mw_changes_owner_dev`, `mw_app_dev_journal_owner`), 20 statements, opened 12:16:16Z, restored 12:24:19Z; readback all closed |
| V126 | `Invoke-Flyway.ps1 -Environment development migrate`: installed 12:16:37Z (62.7 s, checksum 166581229, self-check passed), head 126 (126 rows, 0 failed); role check 540 statements, 0 violations |
| Readback | `pwa_submit_selected_charges_v1` keeps owner `mw_app_dev_journal_owner`, SECURITY DEFINER, its ACL; `pwa_pay_forward_plan_v1` keeps `{postgres, mw_integration_agent, mw_app_dev}` EXECUTE; `pwa_apply_pay_forward_v1` still journal-owner only after the reconcile |
| Image | Cloud Build `89f93c35-c663-412f-abe8-14eb94ca118a` (`cloudbuild-command.yaml`) as `mw-credit-app-build`, SUCCESS 12:24:40Z to 12:25:16Z, `api@sha256:87bfaa6fc6c647ff3479117a951796f525f58d672a22ba6b71dbd6b7f468e0af`; all five services, as the generic runner derives (`services/contracts/payment-command.mjs` reaches the workers) |
| Terraform DEV | Plan 0 add, 5 change, 0 destroy (image attribute only); applied 12:26:25Z to 12:27:02Z; re-plan no changes; settings generation `1793622428455043` (previous `1793615711898709`); read `00060-62f`, command `00077-m8f`, chat `00029-xdn`, notify `00027-2xq`, jobs `00027-x99`, 100% traffic |
| Hosting | `npm run build:live-dev` with `MW_RELEASE_NUMBER` unset (labelled R113 from the tracker); settings identical to the previous bundle, env file deleted; `--check` passed; deployed 12:28:07Z to 12:28:14Z; version `1e83829414dadf0c`, release `1793622493570000`; build-version R113 `a28e2bb2ac9bb9cc4754ef43`, entry `/assets/index-D2WPeYMq.js` embeds `63b40a4`, on both origins |
| Smoke | `/health` 200 on read, command and chat; unauthenticated 401; preflight 204; notify and jobs Ready; scheduled notify dispatches on `00027-2xq` at 12:27:03Z and 12:28:03Z 200 (observed, not triggered); no ERROR logs from 12:26Z |
| Credentials | Temporary admin and read credential files deleted; no secret value printed |
| Rollback | Settings generation `1793615711898709` (image `bd9d94a3…`, R112 `e6e147a1`) with Hosting `ad6947853a378bf9` (release `1793615783076000`), plus the V125 backup above |

## Not run
Skipped and not verified, so not a pass:
- Thai wording on screen, WebKit and a real iPhone.
- The agent settling a loan: the agent keeps the guard by design.
- The DEV deployment and test (Forge and Chase, pending).
- Anything in PROD until the owner's promotion.

## Recovery
Before release: revert the pull request (Git baseline R112 `adcf610b`/`a0cfabca` plus later main commits). Schema: V126 is functions only; rollback is a later migration restoring the V125 bodies of `pwa_pay_forward_plan_v1`, `pwa_submit_selected_charges_v1` and `pwa_apply_pay_forward_v1` (the guard returns). Loans already closed by a settling payment are ordinary closed loans; deleting the payment reopens them.

## Open questions
None for the owner.

## Remaining work
- Byte's two copy fixes (CL-1, CH-6); Chase and Echo re-check.
- Forge: DEV deployment of V126 and the images; PROD promotion under the owner's instruction after DEV proof.
