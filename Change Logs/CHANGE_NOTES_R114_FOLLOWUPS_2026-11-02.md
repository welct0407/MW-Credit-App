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
