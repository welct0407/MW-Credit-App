# Change notes — R114 follow-ups after the Pay Forward releases, 2026-11-02

## Purpose
After R110 to R113 the team listed six follow-ups. The owner answered "Do all 1-6". R114 does them in one release: two Receive payment form fixes, a Linux fix for a test script, the missing Data Dictionary entries, the Collection rebate-offset caption and the DEV test Partner as an AI Reviewer.

## Changes
Owner authority (2 November 2026): "Do all 1-6", in answer to the coordinator's list. It also covers building, DEV test and PROD promotion of the tested scope.

The six items:
1. The stale "Paid through" summary on a blocked Split (R113 observation).
2. Offer "X more closes" for loans a slip cannot fully settle (R113 observation: such a loan is not offered at all).
3. Fix `Run-ProductionAgentReceiptsIndependent.ps1` on Linux (a Windows cleanup that fails there).
4. Data Dictionary entries for `pwa_pay_forward_plan_v1`, `pwa_apply_pay_forward_v1`, `pwa_notify_content_v2`, `pwa_referral_rebate_projection_v1` and the Business Expenses column "Ref Offset Payment".
5. The COL-2 Collection "rebate offset" caption, with its read-role grant (deferred in R111).
6. The DEV test Partner as an AI Reviewer, so the chat purpose card and settle card can be exercised on DEV.

Done so far (item 4, Dewey): owner approval for the new dictionary entries is given by "Do all 1-6" (item 4), as the workflow requires for optional new dictionary documents. Read-only PROD capture at flyway head 126 (225 routines, 99 relations) through the Auth Proxy tunnel as `codex-cloud-read`, output under a private root outside the repository. The targeted reconciliation with `--only` created four new routine entries: `pwa_pay_forward_plan_v1`, `pwa_apply_pay_forward_v1`, `pwa_notify_content_v2` and `pwa_referral_rebate_projection_v1`. The column "Ref Offset Payment" is already in the regenerated "Business Expenses" relation entry (R111 closure), so it needed no new file. `dictionary.py index` and `validate` pass (476 documents, 0 errors). Evidence: [plan](../project/outputs/dictionary-r114-20261102/plan.json), [coverage](../project/outputs/dictionary-r114-20261102/coverage.json) and [observations](../project/outputs/dictionary-r114-20261102/production-postgresql-observations.json).

Item 6 (Forge, DEV, 2 November 2026 13:30:42Z, UTC): `Ensure-DevTestPartner.sql -v ai_reviewer=true` ran on `loan_manager_dev`. `claude-dev-test` now has AI Reviewer true and role `Test` (`pwa_row_changes` row 3885); the chat reviewer and command checks pass (404 `not_found`, not 403). The Development Refresh Runbook step 7a now passes `-v ai_reviewer=true` so a refresh keeps it (also noted in `database/README.md`, `docs/Development.md` and the Environment Inventory). DEV only; never PROD.

Echo's must-fix SP-1: the two-loan Split has been unusable on phones since R113; fixed in R114.

Changed (code commits `a92a56a4`, `16ac3441`, `c5f48830`, tests `95b7be41`):
- Items 1 and 2 (Receive payment form): `apps/pwa/src/SelectedCharges.tsx` (no stale "Paid through" on a blocked Split; the "X more closes" and short-amount hints), `apps/pwa/src/live-style.css`; Echo's SP-1 and the Thai "จะปิด" wording fixed in `c5f48830`.
- Item 3: `tests/integration/Run-ProductionAgentReceiptsIndependent.ps1` (runs on Linux under `pwsh` and leaves no temporary directories), `tests/integration/Run-UnifiedReceiving.ps1`.
- Item 5 (COL-2): `apps/pwa/src/CollectionRecords.tsx` and `services/api/collection-read-contract.mjs` (the "Paid in advance" source caption reads "rebate offset" when the paying payment is an offset, and falls back to the date alone when the read role lacks the grants); read-role SELECT on `Repayments."Ref Payment"` and `Payments("Row ID","Payment Method")` in `scripts/configure-dev-read-role.py` (DEV) and `scripts/production/reader-capability-contract.json` (PROD contract).
- Item 6: `scripts/database/Ensure-DevTestPartner.sql` (`-v ai_reviewer=true`), `Test-DevTestPartner.sql`.
- Tests: `tests/unit/collection-read.test.mjs`, `tests/integration/collection-prepaid-source-independent.test.mjs` (new), `tests/e2e/pay-forward-independent.spec.ts`.
- Records (Dewey): this note, the Development Refresh Runbook step 7a, `database/README.md`, `docs/Development.md`, the Environment Inventory DEV test account row, the Release tracker and Development Changes R114 lines, and four new Data Dictionary entries.
- Decisions: the COL-2 caption needs read-role grants, so the read contract degrades to the date alone without them (no 42501 or 503); the grants must reach DEV (script) and PROD (contract) before the caption shows.

Team (six-agent process, this session): Archie designs, Byte builds, Chase verifies, Echo reviews, Dewey keeps records, Forge deploys DEV and later PROD.

## Checks
| Command | Result |
| --- | --- |
| `capture_postgresql.py production` at flyway head 126, then `reconcile_captures.py plan` and `apply` with `--only` (Dewey) | 4 new routine entries planned and applied |
| `dictionary.py index` and `validate` (Dewey) | Pass: 476 documents, 0 errors |
| Biome, typecheck, unit, docs (Byte, `16ac3441` and `c5f48830`) | Clean; exit 0; 1092 passed, 0 failed; pass |
| `Test-DevTestPartner.sql`; the `Run-ProductionAgentReceiptsIndependent.ps1` under `pwsh` (Byte) | Pass; pass |
| Reader contract test (Forge, `a92a56a4`) | 3/3 |
| Integration `collection-prepaid-source-independent` (Chase, `c5f48830` + `79a7fa3c`, tests at `95b7be41`) | 4/4: with the grants the caption shows `rebate_offset`; without them the date only and no 42501 or 503, with all three grants revoked and with each one alone; the mutation check fails without the guard |
| e2e (Chase, same) | 63 passed, 1 skipped (a phone-only case on desktop) |
| SP-1 (Chase) | Reproduced at `16ac3441` (653 px against a 412 px viewport), fixed at `c5f48830` |
| The ps1 under `pwsh` (Chase) | Leaves no temporary directories; no defects |
| Echo, built UI (`16ac3441`) | Items 1, 2 and 5 fixed; the SP-1 must-fix and the Thai "จะปิด" fixed in `c5f48830` |
| DEV item 6 (Forge, 13:30:42Z) | AI Reviewer true on `claude-dev-test`; chat reviewer and command checks pass |
| Wide suite | The pull request's `Development checks` run (pending) |

## DEV deployment record

Forge, 2 November 2026, UTC. Owner instruction of 2 November 2026: "Do all 1-6". DEV only: no PROD action and the agent VM not touched (no `integration-agent/` change). No SQL migration.

| Item | Result |
| --- | --- |
| Source | `72ab0310` (PR #211 head, branch `claude/r114-followups`). Development checks run 41455135121, database run 41455129592 passed. The image from a `git archive` of the same commit |
| Item 6 (earlier, 13:30:42Z) | `Ensure-DevTestPartner.sql -v ai_reviewer=true` as `postgres` on `loan_manager_dev` only ("written"): `claude-dev-test` "AI Reviewer" true, role `Test`, every other field unchanged (row hash without that column identical); `pwa_row_changes` 3885. Read-only check: `GET /api/chat/threads/<random>/proposals/<random>` with the test token answered 404 `not_found`, so the reviewer and `command` gates pass (without them it answers 403). Note: the DEV refresh runs the script with the default false, so the runbook needs `-v ai_reviewer=true` |
| 1. Reader grants (before the image) | `configure-dev-read-role.py` plan: exactly `GRANT SELECT ("Ref Payment") ON TABLE public."Repayments"` and `GRANT SELECT ("Row ID", "Payment Method") ON TABLE public."Payments"` to `mw-credit-app-read-dev@clever-oasis-508610-n7.iam`; `--apply` 13:52:05Z to 13:52:15Z (pre-change record `read-role-before-20261102T135210914840Z.json`, outside Git); re-plan empty. Readback: the three column privileges true, no table-level SELECT on Payments, other Payments columns still closed |
| 2. Image | Cloud Build `fb8dd5f1-1393-4213-9dfe-74c95b982429` (`cloudbuild-command.yaml`) as `mw-credit-app-build`, SUCCESS 13:52:40Z to 13:53:07Z, `api@sha256:6ee162f287cd61fd13c6758a0fe7157d0f5776cad1cee9a0e5a50f2c7d2003e5`. The generic runner derives read, command and chat (`services/api/collection-read-contract.mjs`); plan 0 add, 3 change, 0 destroy (image only), applied 13:54:23Z to 13:55:01Z, re-plan no changes; settings generation `1793627707990461` (previous `1793622428455043`); read `00061-v27`, command `00078-jgz`, chat `00030-nhq`; notify `00027-2xq` and jobs `00027-x99` stay on `87bfaa6f…` (R113) |
| 3. Hosting | `npm run build:live-dev` (labelled R114 from the tracker), settings identical to the previous bundle, env file deleted; `--check` passed; deployed 13:56:07Z to 13:56:15Z; version `c375e3ecf74fd8a3`, release `1793627775286000`; build-version R114 `9dca277ab8e8749525445387`, entry `/assets/index-C7uGX93-.js` embeds `72ab031`, on both origins |
| 4. Smoke | `/health` 200 on read, command and chat; unauthenticated 401; preflight 204; no ERROR logs from 13:54Z. Authenticated `GET /api/collection` with the test token: 200, 25 items. No item carries `prepaidSource`, which is correct for today's DEV data: the field is added only to borrowers whose latest advance toward today's charges was a Referral Rebate Offset, and the same SQL run read-only for 2 November 2026 finds 0 such borrowers (6 offset expenses exist, none prepaying a charge dated today). The new SQL runs without a privilege error (the read service logs none); "field present" needs such a borrower on the test day, which would take a DEV write |
| Credentials | Temporary admin, read and test-token files deleted; no secret value printed |
| Rollback | Settings generation `1793622428455043` (read, command and chat back to `87bfaa6f…`) with Hosting `1e83829414dadf0c` (release `1793622493570000`); the grants may stay (the R113 image does not read them), or `REVOKE` the three column grants with the pre-change record |

## DEV end-to-end record

Chase, 2 November 2026, on R114 as deployed (72ab0310: read, command and chat `6ee162f2`, Hosting `c375e3ecf74fd8a3`, reader grants applied first). `claude-dev-test` (now an AI Reviewer on DEV), synthetic borrowers only ("R114 SYNTHETIC SPLIT S", "R114 SYNTHETIC CHAT K", and R113's "SHORT E"), DEV PWA at 390 px, token file deleted. Loans stay small because the DEV cash pool is nearly exhausted (see the R113 record).

| Case | Result |
| --- | --- |
| (a) Two-loan Split (loans 20 and 30, slip 60: 20 settles the first, 15 on the second, the rest pays forward) | The two Split parts are stacked (both inputs at x 20, width 350; Apply at x 24, width 342) inside the 390 px viewport, no page overflow, Apply in view and clicked normally. Plan: "Closes <first> · payoff ฿22" and the second loan's outstanding 30 → 15; Review enabled; Confirm posted 60.00, the first loan closed, the second open at 15.00 (payment record reads back) |
| (a) Blocked Split (loan of 50 with 50 gap interest plus a 20 loan, slip 102, part 60 on the first) | Only the hint "฿40 more closes <loan>."; no "Paid through", no "Closes" lines; Review disabled |
| (b) "more closes" (same borrower, slip 72) | Repay principal option reads "฿30 more closes <loan>"; the Split part of that loan reads "฿30 more closes <loan>" and the other part "฿20 closes this loan" |
| (c) Chat purpose card (item 6) | Asked the DEV chat to record 20 baht for K (due 3). The card showed Remainder ฿17 with Pay forward, Repay principal and Split, none selected, Confirm disabled with "Choose how to use the remainder before review." Chose Pay forward (card collapsed to the choice, the forward rows with the Partial badge), Confirm armed and posted: state done, one payment `pwa:<proposal id>` of 20.00 (Selected Charges; due 3 plus 17 forward through 8 Nov). A second Confirm to the same proposal returned 200 with the recorded item (state done), as did one with a different purpose; still one payment. This closes the R112 DEV gap for the chat card |
| (d) COL-2 prepaid source | Not shown on DEV (no borrower paid in advance by a rebate offset is visible today); covered by `collection-prepaid-source-independent.test.mjs` with and without the reader grants |

DEV left in place: the synthetic borrowers above, S's reopened-free loans (first closed, second open at 15), K's open loan with forward charges to 8 Nov, and an unconfirmed earlier chat card for K (expires). Auto-charge was not switched off.

## Promotion record (Forge, 2 November 2026, UTC)
Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value, token or borrower data appears here.

**Scope and authority**
- **Scope:** R114 to PROD: the two reader column grants of the PROD contract, the R114 image on read, command and chat (images only, as the runner derives), Hosting. No SQL migration; no agent deploy (no `integration-agent/` change). No PROD payment, close, DM or chat write.
- **Authority:** the owner's instruction of 2 November 2026: "Do all 1-6" (build, DEV test, PROD promotion). PR #211 was merged under it.
- **Freeze:** 2026-11-02T14:08:48Z. Package `52f56a49` (PR #211 merge on `main`; tree identical to `75191eab`; code inputs identical to the DEV-tested `72ab0310`); generic release kind (schemaVersion 36, `generic-v1`, no runner edit); baseline R113 `05562375`. Next unused number R115.
- **Backup:** none taken. There is no migration and no data change; the only database change is two column grants to the reader login, whose rollback is a `REVOKE` (a dump restore would not replay ACLs anyway). The pre-change column ACLs are recorded below.

| Item | Result |
| --- | --- |
| Baseline (PROD, before) | all five services on `f73e5c36…` (R113): read `00037-sfz`, command `00042-bcd`, chat `00021-d2b`, notify `00025-8ks`, jobs `00025-g78`; settings generation `1793624146293112`; Hosting `6d79f8bbb36543e7` (release `1793624233266000`); `loan_manager_prod` head 126 (126 rows, 0 failed) on `mw-credit-pg-20261017`, project `clever-oasis-508610-n7`, site `mw-credit-prod-737787224638`. Column ACLs before: `Payments`."Row ID" and "Payment Method" `{mw_notify_owner_prod=r/postgres}`; `Repayments`."Ref Payment" none; the reader had no table SELECT on Payments |
| Reader grants (before the image) | One transaction as `postgres` with guards (database `loan_manager_prod`, head 126, grant absent), committed 14:09:23Z to 14:09:26Z: `GRANT SELECT ("Ref Payment") ON TABLE public."Repayments"` and `GRANT SELECT ("Row ID", "Payment Method") ON TABLE public."Payments"` to `mw-credit-app-read-prod@clever-oasis-508610-n7.iam`. Readback: the three column privileges true, no table-level SELECT on Payments, `Payments`."Amount Received" still closed; the notify owner's grants unchanged |
| Image | Cloud Build `2388934d-b53c-4149-a64f-a47a8bbaf9a3` (`cloudbuild-business.yaml`, PROD builder `mw-credit-app-build-prod`, `git archive` of `52f56a49`), SUCCESS 14:09:45Z to 14:10:12Z, `mw-credit-app-prod/api@sha256:03b9735a7e5b9a5085ff23f43d3a64b072aa3cdbb27cd29dcfed718042aa3341`, tag `keep-r114-runtime` |
| Terraform | Settings generation `1793628794840417` (previous `1793624146293112`): `runtime_image_overrides` read, command and chat. Plan 0 add, 3 change, 0 destroy (images only; the runner derives read, command and chat from `services/api/collection-read-contract.mjs`), plan sha256 `ddaf5050…7685`, JSON `e125c911…02bb`; runner `--check` passed; applied 14:12:31Z to 14:13:08Z; re-plan no changes |
| Revisions | read `00038-ng2`, command `00043-94k`, chat `00022-bvm` on `03b9735a…`; notify `00025-8ks` and jobs `00025-g78` unchanged on `f73e5c36…`; each Ready at 100% |
| Runner | Generic kind `--check` passed before and after the apply (no migration: `sql` is the read-only V126 readback, verified 14:12:00Z; no owner window). CI cited per job: check and e2e run 41455135121 (`72ab0310`), terraform run 41203206026 (`cb875ea`), database guards and rebuilds run 41455129592 (`72ab0310`), each input-equivalent to `52f56a49`. `--apply` 14:14:05Z to 14:14:49Z, live readback passed on the first attempt |
| Hosting | Version `2a181935875f10ba`, release `1793628882509000`, 16 files; `lm.mw-credit.com` build-version R114 (version `9176901f1d55984cf38a00cc`), entry `/assets/index-CRsiljdF.js`, bundle embeds `52f56a4`; public config input identical to R113's |
| Smoke (read-only) | `/health` 200 on read, command and chat; `/api/session`, `/api/chat/models` and `/api/collection` 401 without a token; preflight from `https://lm.mw-credit.com` 204; notify and jobs Ready; `sw.js` `no-store`; no ERROR logs from 14:12Z; About reads R114. Not run: an authenticated Collection read in PROD (no PROD Partner token for the operator); the owner's first Collection view covers it |
| Tag | Release tag workflow run 41460227747 (success): annotated `R114` (object `fcd30b959426469f86adb976400dc184c23d38d6`) peels to `52f56a49b8e09668461b85c495fffac4b1fa89e7`; GitHub Release R114 published |
| Private records | Package sha256 `f7abdacb…69f3`; receipt `gs://mw-credit-operator-private-737787224638/promotion-receipts/R114-HOSTING-RECEIPT.json`; package, plan and the rollback activation copy under `.../promotion-packages/r114/`, outside Git |
| Credentials | Temporary admin and read credential files deleted; no secret value printed |
| Rollback | PROD: restore `production.activation.before-r114-1793624146293112.tfvars` (read, command and chat to `f73e5c36…`), plan 0/3/0, apply, publish, together with Hosting `6d79f8bbb36543e7` (release `1793624233266000`). The grants may stay (the R113 image does not read the columns) or be revoked: `REVOKE SELECT ("Ref Payment") ON public."Repayments" FROM` and `REVOKE SELECT ("Row ID", "Payment Method") ON public."Payments" FROM` the reader login |

Applied and verified. Not owner-accepted in PROD: the first Collection view with a rebate-offset advance is pending.

## Not run
Skipped and not verified, so not a pass:
- Thai wording on a real iPhone, and WebKit.
- The COL-2 caption live: it can only be seen a day after a rebate offset and no such borrower exists yet on DEV or PROD; it is covered by the integration test with and without the grants.
- An authenticated Collection read in PROD (no PROD Partner token for the operator): the promotion smoke is unauthenticated.

## Recovery
Before release: revert the pull request (Git baseline R113 `05562375` plus later main commits). Released: the PROD rollback is in the promotion record (activation `production.activation.before-r114-1793624146293112.tfvars` for read, command and chat with Hosting `6d79f8bbb36543e7`). The reader column grants may stay (the R113 image does not read them) or be revoked with the two `REVOKE` statements in the record. The dictionary entries are documents only; Git keeps history.

## Open questions
None for the owner.

## Remaining work
- Owner: PROD acceptance: the first authenticated Collection view, a two-loan Split on the phone and the chat purpose card.
- Open: COL-2 can only be seen a day after a rebate offset and has not been seen live; an authenticated PROD Collection read is untested; Thai wording on a real iPhone, and WebKit.
- R115 is open with no scope yet.
- Done: DEV deployment and test, merge and PROD promotion. The Data Dictionary entries (item 4) were added before the release.

## Closure (2 November 2026)
Owner instruction "Do all 1-6": PR #211 was merged and promoted under it (promotion record above); DEV proof preceded PROD.

Tag record: the annotated tag `R114` (object `fcd30b959426469f86adb976400dc184c23d38d6`) points at the package commit `52f56a49b8e09668461b85c495fffac4b1fa89e7` (PR #211 on `main`), created by the Release tag workflow run 41460227747 (GitHub Release R114 published). Freeze 2026-11-02T14:08:48Z, baseline R113 `05562375`. R115 is opened in this closure and R116 is the next unused number.

Technical access recorded in the Environment inventory: the reader login's column SELECT on `Repayments."Ref Payment"` and `Payments("Row ID","Payment Method")` in PROD (14:09:23Z) and DEV (13:52:05Z), and the DEV test Partner as an AI Reviewer.

Data Dictionary: no PROD capture this closure, because R114 changed no schema, routine or view (only the reader's column grants, recorded in the inventory). Item 4 already added the four routine entries before the release (see Changes); none is due.

Prune (this closure): deleted `Change Logs/CHANGE_NOTES_R111_REBATE_OFFSET_2026-11-02.md` (R111 left the retention window: R115 Open; R114, R113, R112 Released) and its uncited evidence `project/outputs/dictionary-r111-20261102/`. Its links in the Release tracker, Development Changes, the Environment inventory, the Solution Design and `database/README.md` now point to the commit permalink `52f56a49`, the last commit where it exists. No other change note or evidence file is outside the window or uncited.
