# Change notes — R130 offline records sync hotfix, 5 November 2026

## Purpose
Owner report, 5 November 2026: "I keep getting this error", with the header "Borrowers not updated" and an encrypted PROD troubleshooting file. The offline records refresh failed in R129 (PROD and DEV), so Borrowers and the other records data stopped updating on the phone. Status: Released to DEV and PROD on 5 November 2026 (package `e770115`, PR #253, tag `R130`) under the owner's "Promote to prod and get everything done" plus this defect report (a corrective deploy); owner acceptance is pending. Financial data and writes are unaffected: only the offline records refresh failed.

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
| PR #253 `Development checks` run 42063263996 | `check` and `lint` green; e2e skipped because no frontend input changed |
| PR #253 Database migrations run 42063234318 | `guards` and the 4 rebuild groups green |
| GitGuardian | Green |
| `npm run check:docs` (Dewey) | Pass at this record (final run after any later edit) |

## Not run
The wide Playwright suite locally (the pull request CI is the broad run); the fix on a phone with the real PROD report (the DEV and PROD smoke after deploy covers `domain=records`). A skipped check is not a pass.

## Recovery
The previous images stay available: PROD settings generation `1793893237750654` (all five services on the R129 image `babc7480…`) with Hosting `3bca0392e607f70a`; DEV settings generation `1793891067776814` with Hosting `a0e8f49c48c2877f`. Pins are in the [Environment Inventory](../project/Documents/Environment_Inventory.md). The fix needs no migration, so there is nothing else to undo. Rolling back brings the records refresh failure back.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: the owner's first records sync on the new revision (the "Borrowers not updated" header gone). Not yet observed; Forge's watch is running.
- Noted, not investigated: one pre-existing read 503 "Cannot read properties of null (reading 'kind')" surfaced by the new logging in the receiving run.
- The R129 items stay open in the [R129 change note](CHANGE_NOTES_R129_REFERRAL_REBATE_SETTLEMENT_2026-11-05.md#remaining-work): PROD acceptance of the first settlement, the first pending-rebate close and the first agent "pending to" DM; the chat read-role grant; the Data Dictionary entries; the CI en_US collation follow-up.

## DEV promotion record (Forge, 5 November 2026, UTC)
Authority: the owner's 5 November 2026 instruction to build and deploy fixes to DEV first; DEV only here. No SQL, no backup. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Item | Result |
| --- | --- |
| Package | `e770115` (merge of PR #253; tree `f50a2e61` equal to the tested head `33ea4d9`) |
| Scope | All five services (runner rule: `services/lib/log.mjs` reaches the workers) and DEV Hosting labelled R130 |
| Image | Cloud Build `2bfa61aa-5efe-4ac0-af8a-5ced952d8f81`, 16:29:14Z to 16:29:41Z, digest `sha256:d35efe83c3a9695fecebf96b3980c4897eb8e8c768362a022e0d4d3acfe4af1d` |
| Terraform | Plan 0 add, 5 change, 0 destroy (image only); applied 16:30:49Z to 16:31:27Z; re-plan clean; settings generation `1793896324320340` (previous `1793891067776814`) |
| Revisions | read `00074-tf5`, command `00091-zlp`, chat `00043-fwb`, notify `00031-mmn`, jobs `00031-v8v` |
| Hosting | Nine settings including `VITE_NOTIFICATIONS=enabled`; build-version R130 `49f02e1a784c49b44ca4bc34`, embeds `e770115`; `--check` 17 files; version `9dad7533660115e2`, release `1793896380073000`, 16:32:53Z to 16:33:00Z |
| Smoke | Records protocol 2 full walk 24 pages 200; protocol 3 POST walk 11 pages 200; delta 200 and complete; `/health`; unauthenticated 401; CORS 204; three origins serve R130; `sw.js` no-store; no ERROR or `command_*_unavailable` logs 16:30:40Z to 16:35:07Z |
| Rollback | Settings generation `1793891067776814`, then Hosting `a0e8f49c48c2877f` |

## PROD promotion record (Forge, 5 November 2026, UTC)
Authority: the owner's "Promote to prod and get everything done" (5 November 2026) plus the defect report (a corrective deploy). No SQL, backup or owner window; no PROD write, forced notification or financial correction. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in `gs://mw-credit-operator-private-737787224638/promotion-packages/r130/`.

| Step | Result |
| --- | --- |
| Freeze (16:28:42Z) | `main` at `e7701157f80f753ff43956bbf9160bcf41cd13a2` (merge of PR #253) |
| Image | Cloud Build `38538f89-17da-4c4e-b7a8-bbc9e65cc7a3` (`mw-credit-app-build-prod`, `cloudbuild-business.yaml`), 16:35:27Z to 16:35:58Z, digest `sha256:f8cb243b7faf8e454765c03b03ac4c2a5808b9e0964b2041fbd729baa9b07d36` |
| Terraform | Plan 0 add, 5 change, 0 destroy (plan sha256 `82b2b8cd…8676`, JSON `db639330…0369`); applied 16:37:22Z to 16:38:00Z; re-plan clean; settings generation `1793896707803895` (previous `1793893237750654`) |
| Revisions | read `00048-qkv`, command `00053-2bh`, chat `00032-fbd`, notify `00029-2nb`, jobs `00029-9dp` |
| Database | Flyway 137 verified at 16:39:45Z; no change |
| Hosting | Generic runner, R130 package (schema 36, `generic-v1`, `runtime-workers-frontend`): `--check` 18 files, `--apply` 16:41:02Z to 16:41:48Z; version `f30d46ce330f69e3`, release `1793896902555000`, build-version R130 `87517f0726045b82c8e579be`, entry `/assets/index-CAtEx3z7.js`, package sha256 `a778eb70…1a21` |
| CI receipts | `check` 42063263996, e2e 42047433837 (reused), Database migrations 42063234318, Terraform 41203206026 |
| Smoke (read-only) | `/health` 200; notify and jobs Ready; unauthenticated 401 including the agent route; CORS 204; three origins serve R130 `87517f07`; `sw.js` no-store; no ERROR or `command_*_unavailable` logs 16:37:20Z to 16:54:46Z |
| Agent | Unchanged at `0f342036` |
| Rollback | Settings generation `1793893237750654` (all five on `babc7480…`), then Hosting `3bca0392e607f70a` |

### Limitations
- The owner's own records sync on the new revision has not been observed (acceptance pending; Forge's watch is running).
- No authenticated PROD read was made by this record.

### Tag record
Tag `R130` on `e7701157f80f753ff43956bbf9160bcf41cd13a2` (annotated tag object `33d722278248c61526c53108bb92ce2a98816c98`) through Release tag workflow run 42069452420 (16:55:29Z to 16:55:53Z, success), which also published the [GitHub Release](https://github.com/welct0407/MW-Credit-App/releases/tag/R130).

### Closure and prune record
Closure pull request, records only: tracker (R130 Released, R131 opened, next unused number R132), Development Changes, Environment Inventory and this note.
- Deleted: `integration-agent/Change Logs/CHANGE_NOTES_R127_REVIEW_THREE_OPTIONS_2026-11-05.md` (R127 left the three-release window of R128, R129 and R130). Its inbound links in the tracker, Development Changes and the Environment Inventory were first repointed to the permalink at `e770115`.
- Kept: the R128, R129 and R130 notes (inside the window).
