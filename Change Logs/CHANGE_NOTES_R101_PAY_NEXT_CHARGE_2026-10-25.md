# Change notes — pay the next charge early (R101), 25 October 2026

## Purpose
Let a Partner record an early payment in Receive payment without booking the charge by hand first. The app books the loan's next scheduled charge and pays it in one step, as the owner approved on 25 October 2026.

## Changes
- `database/migrations/V112__pay_next_projected_charge.sql` and `database/current/public-functions.sql`: new read function `pwa_next_projected_charge_v1` (runs with the caller's rights; V112 grants `mw_app_<env>` EXECUTE on it and on `forecast_schedule_v1`; next date and Exception/Notice gate from the forecast, amounts from the generator's arithmetic; no row for Fixed Due Date loans, for a daily-interest loan with unpaid principal on a charge dated today or earlier, or when a recorded charge is dated after today). `pwa_submit_selected_charges_v1` accepts schemaVersion 9 (adds `materialize`, an array of `{loanId, chargeId, chargeDate, principalDue, interestDue}`, at most one per loan), books each entry with `generate_loan_charge` under the existing lock order, and fails with `selection_unavailable` when the booked row differs. `pwa_effective_payment_plan_v2` accepts 9.
- `services/contracts/payment-command.mjs`, `services/payment-command/draft.mjs`, `services/payment-command/store.mjs`: canonical v9 command, `upcoming` rows on first-page `scope=all` and review reads, `plan_changed` when a projected entry moved, booking errors mapped to `selection_unavailable`.
- `apps/pwa/src/SelectedCharges.tsx` and the offline queue: group "Pay ahead / ชำระล่วงหน้า", badge "Next charge · not yet due / งวดถัดไป · ยังไม่ครบกำหนด", help "Not yet due: confirming creates this charge and pays it."; v9 with `materialize` only when such a line is allocated; Auto-assign stays due-only; the queue accepts v9; `selection_unavailable` shows the generic offline-sync message "The charges changed since review. Start a new payment."
- Tests and tooling: `scripts/database/Test-ProjectedChargePayment.sql`, `scripts/database/Test-AccessMatrix.sql` (access matrix for the two new EXECUTE grants), `scripts/rehearsal/payment-command.mjs` (accepts the migration head), `tests/integration/Run-UnifiedReceiving.ps1` (new stage migrates to the head), the v9 race in `scripts/database/Test-ChargeGenerationConcurrency.ps1`, `tests/integration/projected-charge-payment-independent.test.mjs`, `tests/unit/payment-allocation-contract.test.mjs`, `tests/unit/payment-command-contract.test.mjs`, `tests/unit/contract-surface.test.mjs` and `tests/e2e/projected-charge-payment-independent.spec.ts`.
- Maintenance note: `pwa_next_projected_charge_v1` mirrors the arithmetic of `generate_loan_charge`, so any later change to the generator must update it too. The SQL parity test guards this, and submit fails safe if they drift.
- Chat: `services/chat/assets/schema-digest.json` rebuilt at migration 112; after the chat redeploy each chat thread starts a new history epoch.
- Records: `project/Documents/Development_Changes.md`, `database/README.md` (V112 paragraph), `project/Documents/PWA_Data_Model_Overview.md`, and the chat rules asset `services/chat/assets/conversation-business-rules.md` (sections 4, 5, 9, 15; the chat image needs a redeploy to pick it up).

## Checks
| Command | Result |
| --- | --- |
| `python3 scripts/database/Test-MigrationsCloud.py` (as postgres: full chain to V112, statement batch with `Test-ProjectedChargePayment.sql`, access matrix, all concurrency scripts including the v9 race, public-functions match) | Pass; SQL unchanged after it, cited for `a240016` (Byte) |
| `npx biome lint` | Pass, 565 files, clean tree of `cf2ba8b` (Byte) |
| `npm run typecheck` | Pass, clean tree of `cf2ba8b` (Byte) |
| `node --test tests/unit/*.test.mjs` | Pass, 918 pass, 1 skipped, `36faabf` (Byte); later commit changed PWA files only |
| `tests/integration/Run-UnifiedReceiving.ps1` (CI=true) | Pass, 20/20 existing and 4/4 new at migration head, `36faabf` (Byte) |
| `npx playwright test tests/e2e/projected-charge-payment-independent.spec.ts` | Pass, 10 (5 cases on desktop and mobile), clean tree of `cf2ba8b` (Byte) |
| Focused receiving Playwright specs (unified-receiving, receiving-ux, payment-command, payment-offline-sdk, receipt-recognition, w5-ux) | Pass, 66 and 56 with 2 skipped, working tree before `a240016` (Byte) |
| Adversarial diff review `0b26e41..cf2ba8b`, V111 vs V112 submit body diff (additive only), snapshot vs live bodies, Loan Close with an unpaid booked charge, multi-byte and quoted loan ids posted through Node canonical text | Done; findings D-1 (Open questions), D-2 (fixed in `cf2ba8b`), D-3 (Recovery) (Chase, disposable cluster) |
| Visual check, Pixel 7, edit, ticked, review and stale states in English and Thai | Two layout findings, fixed in `cf2ba8b` (Echo) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |

## Not run
A correction that re-posts in SQL (a separate operation command) and a defaulted-loan case (the database refuses that state) are not tested. Collection's "paid in advance" display is covered by the existing R096 tests.

Dictionary routine files under `project/Documents/Data Dictionary/systems/postgresql/routines/` are production captures (`project/scripts/dictionary/capture_postgresql.py`, run on a Windows host against a live database); they are not edited by hand and are refreshed by a capture after V112 reaches PROD.

## Recovery
Git baseline `0b26e41`. V112 is additive `CREATE OR REPLACE`; rollback is a later migration that restores the V111 function bodies of the submit function and `pwa_next_projected_charge_v1` only. Once any schemaVersion 9 payment exists, that migration must keep `'9'` in the provenance filter of `pwa_effective_payment_plan_v2`; otherwise corrections and deletes of those payments would go through the legacy engine. No data changes except charges booked by early payments, which are ordinary charges.

## Open questions
Owner decision on Loan Close. Scenario: an early payment is deleted or only partly paid, and the loan is then closed before the booked charge's date. Effect: Loan Close (`loan_close_calculation_v83`) bills interest up to that future date instead of up to today. Example: 1070 instead of 1030 on a loan at 10 a day, with the charge booked 4 days ahead and the last charge 3 days ago. No money is wrong when the early payment stands. Options: accept it, or have Loan Close ignore unpaid interest on charges dated after the close date (a separate change).

Also owner acceptance. Excluding Fixed Due Date loans and one charge ahead per loan were owner defaults.

## Remaining work
Verification, the DEV deploy and owner acceptance; PROD promotion on the owner's instruction.
