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

## Not run
Skipped and not verified, so not a pass:
- Thai wording on a real iPhone, and WebKit.
- The COL-2 caption in PROD: it appears only after the PROD reader contract grants are applied.
- The DEV deployment and test of items 1, 2 and 5, and anything in PROD, until the owner's promotion.

## Recovery
Before release: revert the pull request (Git baseline R113 `05562375` plus later main commits). The dictionary entries are documents only; Git keeps history.

## Open questions
None for the owner.

## Remaining work
- Forge: DEV deployment of items 1, 2 and 5 with the read-role grants (DEV script); then PROD promotion with the reader contract grants. Items 3 and 6 need no deploy (item 6 is done on DEV).
- The "Thai wording on a real iPhone" check from R113 stays open.
