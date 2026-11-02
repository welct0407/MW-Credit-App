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

## DEV end-to-end record

Chase, 2 November 2026 (business day 2026-11-02), on R113 as deployed above (head 126, image `87bfaa6f` on all five services, Hosting `1e83829414dadf0c`). Partner `claude-dev-test` through `scripts/dev/claude-test-token.mjs` (token file deleted afterwards, no secret printed); synthetic borrowers only ("R113 SYNTHETIC T3 YING A / REFERRED C / SHORT E", plus R112's synthetic G as the split borrower and H as the referrer). The form was driven in the DEV PWA at 390 px (Collection, Receive payment, Auto-assign). Loan sizes are small (30 to 50) because the DEV cash pool was exhausted by earlier synthetic loans: new loans of 300 or more failed as `command_unavailable` (503) until one old synthetic loan (R112 "REGRESSION R", 1,000) was closed with Loan Close to free cash. Loan Close quotes were read with `close-preview` before each payment.

| Case | Result |
| --- | --- |
| (a) Ying-like, two daily-interest loans (30 and 50, today's charges 6 + 10), slip 96, Repay principal | Radio text "Closes <both loans>"; lines "Closes <loan> · payoff ฿36" and "… payoff ฿60" (quotes 36 and 60); summary "Closes 2 loans · outstanding ฿0"; Review enabled; review shows principal 30 + interest 6 and 50 + 10. Confirm: one payment of 96.00 ("Selected Charges", Bank Transfer), both loans closed today with outstanding 0.00; the payment record reads back (amount, posted 96.00, method, allocation). 36 + 60 = 96 equals the two quotes |
| (b) Split, one loan settled (G's 1,000 loan and a 20 loan), slip 1,034, principal part 1,000 on the first | "฿1,000 closes this loan" and "฿20 closes this loan" hints; one Closes line (payoff ฿1,010 = quote); the rest pays forward on the other loan (3–12 Nov, "Not yet due: confirming creates this charge and pays it"). Posted 1,034.00; the 1,000 loan closed, the 20 loan stays open (outstanding 20.00) with its forward charges paid |
| (c) Referred settled loan (30 at 30 a day, referrer H with an open loan), slip 90 | Closes line with "Rebate ฿9 to <referrer> — offset to their loan"; posted 90.00 and the loan closed. The referrer got `ro122:pwa:…` for 9.00; the rebate expense 9.00 shows offset 9.00, payable 0; the payment record's `closeRebate` carries the offset payment and loan |
| (d) Delete the Ying payment (96.00) | `payment.delete` applied; both loans reopen (open, outstanding 30.00 and 50.00, no close date) and the Loan Close quotes return to 36 and 60 |
| (e) Short amount (loan of 50 with 50 gap interest, plus a 20 loan with 2 due), slip 102, Split with 60 on the first | Hints "฿100 closes this loan" and "฿20 closes this loan"; "฿40 more closes <loan>." and Review disabled |

Observations, none blocking:
- A loan whose payoff remainder the slip cannot reach is not offered at all (a slip of 52 offered only the 20 loan), so "more closes" shows only once the slip reaches its payoff remainder; with a single such loan and a short slip the form gives the ordinary choices.
- While Split is blocked ("more closes"), the plan summary line still shows the forward "Paid through …" text of the blocked plan; Review is correctly disabled.
- The Closes line shows only the payoff; the "(gap interest …, charges …)" part did not appear for these loans (today's due charges are paid as ordinary due lines).

DEV left in place: the synthetic borrowers above, the closed referred loan, the referrer's offset payment, the reopened Ying loans (open, outstanding 30 and 50), the split borrower's open 20 loan, E's two open loans; auto-charge was not switched off, so the daily jobs may add charges. The R112 "REGRESSION R" loan was closed to free cash.

## Promotion record (Forge, 2 November 2026, UTC)
Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value, token or borrower data appears here.

**Scope and authority**
- **Scope:** R113 to PROD: V126 (functions only), the R113 image on all five services (images only, as the runner derives), Hosting, then the agent VM deploy of the merged commit with the live configuration untouched (`pay_forward_options_enabled` stays true). No PROD payment, close, DM or chat write.
- **Authority:** the owner's instruction of 2 November 2026: "Yes, build it, test in dev and promote to prod". PR #209 was merged under it.
- **Freeze:** 2026-11-02T12:44:53Z. Package `05562375` (PR #209 merge on `main`; tree identical to `957de9b5`; code inputs identical to the DEV-tested `63b40a4c`); generic release kind (schemaVersion 36, `generic-v1`, no runner edit); baseline R112 `adcf610b`. Next unused number R114.

| Item | Result |
| --- | --- |
| Baseline (PROD, before) | read `00036-6bk`, command `00041-gqr`, chat `00020-g9g` on `913fa731…` (R112); notify `00024-ssq` and jobs `00024-fdp` on `b1e36704…` (R111); settings generation `1793617518810095`; Hosting `2e5f470454e4fd11` (release `1793617605071000`); `loan_manager_prod` head 125 (125 rows, 0 failed), no active sessions; agent VM `a0cfabca`, catalogue 34, `pay_forward_options_enabled` true |
| Backup at V125 | 12:45:14Z to 12:47:37Z, `prod-promotion-187b8a3354794b6a9a4a1dcceb89458e`, dump sha256 `07444ff65e48b4f9b3eacf1c56ee69b3466144ecdcb690d30c6eb9d41efca398`; listing and restore passed; 38 table fingerprints match |
| SQL package | `release-r113-v126-05562375.json` sha256 `132b189d…b5c1` (prepared from DEV at 126; `database/` identical at `63b40a4c` and `05562375`); connect preflight 125 to 126 sha256 `8779fa9d…93d8`; `check` 0 writes, pending 126 |
| Owner window | `mw_app_prod_journal_owner` only (4 statements; V126 replaces its `pwa_submit_selected_charges_v1`, and names no other owner; the PROD runner runs no role reconcile, so the DEV 5-owner set was not needed), opened 12:49:06Z, restored 12:51:44Z (the first restore call at 12:51:27Z was refused by the CLI before any statement, because a wrong argument list passed an owner; rerun with the record only); readback closed (inherit, set false; no CREATE on `public`) |
| Flyway | `Invoke-CloudFlyway.py apply`, one grouped transaction (12:49:13Z to 12:51:27Z): V126 62.7 s, installed 12:49:52Z, checksum 166581229 (as DEV); head 126 (126 rows, 0 failed); `verify --target prod` clean (12:52:16Z) |
| Readback | `pwa_submit_selected_charges_v1` keeps owner `mw_app_prod_journal_owner`, SECURITY DEFINER and its ACL; `pwa_pay_forward_plan_v1` keeps `{postgres, mw_app_prod, mw_integration_agent}` EXECUTE; `pwa_apply_pay_forward_v1` `{postgres=X/postgres,mw_app_prod_journal_owner=X/postgres}` |
| Image | Cloud Build `551c2309-1483-4b0b-b0e8-26e4cacd93b6` (`cloudbuild-business.yaml`, PROD builder `mw-credit-app-build-prod`, `git archive` of `05562375`), SUCCESS 12:52:30Z to 12:53:06Z, `mw-credit-app-prod/api@sha256:f73e5c36e4960923c24233e858ded015970d39a46eccd432001a557f719edac1`, tag `keep-r113-runtime` |
| Terraform | Settings generation `1793624146293112` (previous `1793617518810095`): `runtime_image_overrides` read, command, chat and `workers.image`. Plan 0 add, 5 change, 0 destroy (images only; the runner derives all five because `services/contracts/payment-command.mjs` reaches the workers), plan sha256 `0c06be54…5940`, JSON `1174555f…a75d`; runner `--check` passed; applied 12:55:04Z to 12:55:40Z; re-plan no changes |
| Revisions | read `00037-sfz`, command `00042-bcd`, notify `00025-8ks`, jobs `00025-g78`, chat `00021-d2b`, each Ready at 100% |
| Runner | Generic kind `--check` passed before and after the apply. CI cited per job: check and e2e run 41441501439 (`63b40a4c`), terraform run 41203206026 (`cb875ea`), database guards and rebuilds run 41441475372 (`63b40a4c`), each input-equivalent to `05562375`; agent run 41441501488 (`63b40a4c`). `--apply` 12:56:35Z to 12:57:20Z, live readback passed on the first attempt |
| Hosting | Version `6d79f8bbb36543e7`, release `1793624233266000`, 16 files; `lm.mw-credit.com` build-version R113 (version `35903627e0a486f0972f4455`), entry `/assets/index-CQr_goKa.js`, bundle embeds `0556237`; public config input identical to R112's |
| Smoke (read-only) | `/health` 200 on read, command and chat; `/api/session` and `/api/chat/models` 401 without a token; preflight from `https://lm.mw-credit.com` 204; notify and jobs Ready; scheduled notify dispatches on `00025-8ks` at 12:56:02Z and 12:57:02Z 200 (observed, not triggered); `sw.js` `no-store`; no ERROR logs from 12:55Z; About reads R113 |
| Tag | Release tag workflow run 41448964237 (success): annotated `R113` (object `9deba76d76e51c2acb827fcc9afe4369a3608664`) peels to `0556237589bde00df2a3d1aea9ab62ebc04dbf1a`; GitHub Release R113 published |
| Agent VM | `update-from-github.sh`: `a0cfabca` to `05562375` (clean). Dry-run: `partner_review.py` and `review_proposal.py` changed, units unchanged, agent schema through V11, catalogue stays 34. Freeze 12:58:37Z (rollback `/var/lib/mw-integration-agent/rollback/runtime-20261102T125837278039Z`); install 12:58:37Z to 12:58:42Z (no removed files, no unit change); `check` with the new package ok, `pay_forward_options` true; activate 12:58:43Z to 12:58:47Z (probe `2a59ee9b-a6e3-4c80-abf8-8ea48fc3b6b3`). Readback: `/ready` true on `05562375`, configuration 90 keys unchanged with `pay_forward_options_enabled` true, catalogue 34 with the same 14 services enabled, `check` ok with `activation.pay_forward_options` true, receiver, recognizer, chat relay and every trigger active, no failed units. The schema check used a temporary root-only `postgres` operator file on the VM (password over stdin, never printed), deleted at 12:58:47Z |
| Private records | Package sha256 `75a0fd04…3788`; receipt `gs://mw-credit-operator-private-737787224638/promotion-receipts/R113-HOSTING-RECEIPT.json`; package, release manifest, preflight, owner-window record, plan and the rollback activation copy under `.../promotion-packages/r113/`, outside Git |
| Credentials | The temporary admin and read credential files (session and VM) are deleted; no secret value was printed |
| Rollback | PROD: restore `production.activation.before-r113-1793617518810095.tfvars` (read, command and chat to `913fa731…`, notify and jobs to `b1e36704…`), plan 0/5/0, apply, publish, together with Hosting `2e5f470454e4fd11` (release `1793617605071000`). Agent: `deploy-runtime.py rollback` to the 12:58:37Z freeze directory (`a0cfabca`). Database: V126 stays on a service rollback (functions only), or the V125 backup above |

Applied and verified, including the agent VM. Not owner-accepted in PROD: the first live settle case is pending.

## Not run
Skipped and not verified, so not a pass:
- Thai wording on screen, WebKit and a real iPhone.
- The agent settling a loan: the agent keeps the guard by design.
- An authenticated PROD payment (no PROD Partner token for the operator; none made by rule): the promotion smoke is unauthenticated.

## Recovery
Before release: revert the pull request (Git baseline R112 `adcf610b` plus later main commits). Released: the PROD rollback is in the promotion record (activation `production.activation.before-r113-1793617518810095.tfvars` for all five services with Hosting `2e5f470454e4fd11`; the agent by `deploy-runtime.py rollback` to the 12:58:37Z freeze). Schema: V126 is functions only; rollback is a later migration (V127 or higher) restoring the V125 bodies of `pwa_pay_forward_plan_v1`, `pwa_submit_selected_charges_v1` and `pwa_apply_pay_forward_v1` (the guard returns), or the V125 backup in the promotion record. Loans already closed by a settling payment are ordinary closed loans; deleting the payment reopens them.

## Open questions
None for the owner.

## Remaining work
- Owner: PROD acceptance, the first real settle-and-close payment.
- Open: a blocked Split still shows a stale "Paid through" summary (minor); a loan the slip cannot fully reach is not offered for settle, so "more closes" shows only once the slip reaches its payoff remainder; the DEV cash pool ran low during testing and Chase closed one old synthetic loan (R112 "REGRESSION R"); Thai wording on a real iPhone.
- Data Dictionary, due with owner approval: new entries for the routines `pwa_pay_forward_plan_v1` (since R110), `pwa_apply_pay_forward_v1`, `pwa_notify_content_v2` and `pwa_referral_rebate_projection_v1` (R111).
- R114 is open with no scope yet.
- Done: DEV deployment and test, merge, PROD promotion, the agent deploy and the Data Dictionary PROD capture (closure below).

## Closure (2 November 2026)
Owner instruction "Yes, build it, test in dev and promote to prod": PR #209 was merged and promoted under it (promotion record above); DEV proof preceded PROD.

Tag record: the annotated tag `R113` (object `9deba76d76e51c2acb827fcc9afe4369a3608664`) points at the package commit `0556237589bde00df2a3d1aea9ab62ebc04dbf1a` (PR #209 on `main`), created by the Release tag workflow run 41448964237 (GitHub Release R113 published). Freeze 2026-11-02T12:44:53Z, baseline R112 `adcf610b`. R114 is opened in this closure and R115 is the next unused number.

Technical access recorded in the Environment inventory: V126 applied to PROD (functions only, no new grant); the owner window was `mw_app_prod_journal_owner` only, because V126 replaces only its function; the agent VM runs `05562375` with `pay_forward_options_enabled` still true.

Data Dictionary (R103 procedure, read-only): `capture_postgresql.py production` as `codex-cloud-read` through the Auth Proxy tunnel on `loan_manager_prod` (flyway head 126, 225 routines, 99 relations), output under a private root outside the repository. Targeted reconciliation with `--only` regenerated one existing entry: the routine `pwa_submit_selected_charges_v1`. V126 also replaced `pwa_pay_forward_plan_v1` and `pwa_apply_pay_forward_v1`, which have no dictionary entry; new entries need owner approval and stay due (see Remaining work). `dictionary.py index` and `validate` pass. Evidence: [plan](../project/outputs/dictionary-r113-20261102/plan.json), [coverage](../project/outputs/dictionary-r113-20261102/coverage.json) and [observations](../project/outputs/dictionary-r113-20261102/production-postgresql-observations.json).

Prune (this closure): deleted `Change Logs/CHANGE_NOTES_R110_PAY_FORWARD_2026-11-01.md` (R110 left the retention window: R114 Open; R113, R112, R111 Released) and its uncited evidence `project/outputs/dictionary-r110-20261102/`. Its links in the Release tracker, Development Changes, the Environment inventory and Solution Design now point to the commit permalink `05562375`, the last commit where it exists. No other change note or evidence file is outside the window or uncited.
