# Change notes — R130 offline records sync hotfix, 5 November 2026

## Purpose
Owner report, 5 November 2026: "I keep getting this error", with the header "Borrowers not updated" and an encrypted PROD troubleshooting file. The offline records refresh failed in R129 (PROD and DEV), so Borrowers and the other records data stopped updating on the phone. Status: fix built and tested; DEV and PROD deployment pending. Financial data and writes are unaffected: only the offline records refresh failed.

## Changes
Diagnosis:
- The decrypted report shows app R129 `0f34203` on PROD, offline preparation `updateFailed`, `failedDomains` `["records"]`.
- Logs show `/api/offline-dataset?domain=records&protocol=3` on command-prod answering 503 `command_unavailable` since 15:57:56Z (DEV since 15:08:41Z). Cloud SQL logged no error.
- Root cause: three R129 queries passed a JavaScript array as `$1::text[]`. The offline walk's `bulkReadClient` (`services/business/offline-dataset.mjs`) accepts only string, boolean and number parameters and throws "Invalid internal bulk read"; the store `run()` and the handler catch mapped that to 503 without logging.
  - `settlementDates` in `services/business/referrers.mjs`: after an expense links a settlement.
  - `owedTotal` in `readPaymentRecord`, `services/business/payments.mjs`: after a closing payment has a V3 rebate. On PROD this was triggered by the owner-authorized legacy conversion at promotion.
  - The settlement payee in `readCashStatement`, `services/business/cash.mjs`: it would have broken cash at the first PROD settlement.

Fix:
- The ids are sent as one JSON text parameter (`IN (SELECT jsonb_array_elements_text($1::jsonb))`) in the three places.
- New `logUnavailable` in `services/lib/log.mjs` logs one ERROR line per 503 (error class, SQLSTATE and the first 200 characters of the message; no stack, parameters or values) as `command_store_unavailable` (store `run()`, `services/payment-command/store.mjs`) and `command_handler_unavailable` (`services/payment-command/handler.mjs`).
- No migration and no data change.
- Files: `services/business/cash.mjs`, `payments.mjs`, `referrers.mjs`, `services/lib/log.mjs`, `services/payment-command/handler.mjs` and `store.mjs`, `tests/integration/rebate-settlement-independent.test.mjs`, `tests/unit/rebate-settlement.test.mjs`.
- Deploy plan: DEV then PROD, the images for the services the runner rule selects; no Hosting or SQL change.

## Checks
| Command | Result |
| --- | --- |
| Reproduction on a disposable V137 lab (Byte, `b4cc9f1`) | Records delta 503 right after a close with a pending V3 rebate |
| Integration regression "PROD defect: …" (full walk and delta after a close, a settlement, a delete, a legacy row, a conversion and a second settlement; plus a cash walk) | Fails without the fix, passes with it |
| Unit regression | Fails without the fix, passes with it |
| biome; `npm run typecheck` | 0 errors; pass |
| `npm test` | 1191 tests, 1190 pass, 1 skipped (digest rebuild needs `MW_CHAT_DIGEST_PORT`) |
| `mw-db-ci` receiving group | Exit 0 |
| Pull request `Development checks` and the other CI jobs | Pending |
| `npm run check:docs` (Dewey) | Pending final run |

## Not run
The wide Playwright suite locally (the pull request CI is the broad run); the fix on a phone with the real PROD report (the DEV and PROD smoke after deploy covers `domain=records`). A skipped check is not a pass.

## Recovery
The previous images stay available: roll back to the R129 settings generation in the [Environment Inventory](../project/Documents/Environment_Inventory.md). The fix needs no migration, so there is nothing else to undo. Rolling back brings the records refresh failure back.

## Open questions
None.

## Remaining work
- DEV record, PROD record and tag: Pending (this note gets them when Forge reports).
- Noted, not investigated: one pre-existing read 503 "Cannot read properties of null (reading 'kind')" surfaced by the new logging in the receiving run.
- After PROD: confirm "Borrowers not updated" no longer appears on the owner's phone.
- Record in the R129 change note: the [post-release defect](CHANGE_NOTES_R129_REFERRAL_REBATE_SETTLEMENT_2026-11-05.md#post-release-defect).

## DEV promotion record (Forge, UTC)
Pending.

## PROD promotion record (Forge, UTC)
Pending.
