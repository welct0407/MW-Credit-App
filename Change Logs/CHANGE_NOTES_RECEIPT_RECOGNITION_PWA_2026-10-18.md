# Change notes — receipt recognition for manual payments (R075), 18 October 2026

## Purpose
Reads a manual payment slip with the shared recognizer and pre-fills the payment form, so the person checks and saves instead of typing. Source, merged to main (PR #69, `85273a4`), and rolled out to DEV, then promoted to PROD on 18 October 2026 as R075 (source `96b0a0b`, delivery tool commit `6b58f00`). Recognition is enabled for the DEV and PROD callers. Owner design: [Claude Doc](https://claude.ai/artifact/KP7KKQnNy1QDnXqEiRsgRx). The agent stage has its own [change note](../integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_RECOGNITION_2026-10-18.md); it is not repeated here.

## Changes
- Agent (`integration-agent/`): provider abstraction (Codex default, Gemini on Vertex AI), recognizer service `mw-receipt-recognition` on `10.148.0.2:8790`, catalogue revision 29 `receipt_recognition_api` implemented and disabled.
- Infrastructure: Vertex AI API (`infrastructure/dev/main.tf`); `receipt-recognizer.tf` in `infrastructure/dev`, `infrastructure/production` and `infrastructure/ecosystem-debian` (role `roles/aiplatform.user` for `mw-integration-agent`, firewall `allow-receipt-recognizer-run-egress` TCP 8790 from `10.148.0.0/20` to the VM identity, Direct VPC egress and `DEV_`/`PROD_RECEIPT_RECOGNITION` plus `_URL` variables on the command services); new `receipt_recognizer` variable, default off; READMEs of production and ecosystem-debian; `business-runtime.tftest.hcl` and `receipt-recognizer.tftest.hcl`.
- API: route `POST /api/payment-commands/{requestId}/receipts/{receiptId}/recognition` (`services/payment-command/handler.mjs`, `result.mjs`, `store.mjs`, `services/production/business-config.mjs`, `business-runtime.mjs`); `services/receipts/recognizer-client.mjs` and `recognizer-rules.mjs`.
- Contract: manual payment command v7 adds `bankReference` and `transferTime` (`services/contracts/payment-command.mjs`, `scripts/rehearsal/payment-command.mjs`); v6 is still accepted.
- SQL: `database/migrations/V96__manual_payment_command_v7_bank_reference.sql` (mirrored in `database/current/public-functions.sql`) writes Payments "Bank Reference", writes "Created At" from slip date and time (Bangkok) when both are present, accepts today or yesterday for v7, and widens the plan-provenance filter to v7 only when the command carries an allocation plan, so agent v7 receipts are unaffected. No new table or column.
- PWA (`apps/pwa/src/SelectedCharges.tsx`, `live-style.css`, `offline-sync.ts`): fill-and-warn form flow per Echo RR-UX-01..12.
- Tests: `tests/unit/receipt-recognition-route.test.mjs`, `receipt-recognition-rules.test.mjs`, `payment-allocation-contract.test.mjs`; `tests/integration/phase5-v7-payment-independent.test.mjs` and updates to the Phase 5 suites and `Run-Phase5.ps1`.
- Records: [Release tracker](../project/Documents/Release_Tracker.md), [Development changes](../project/Documents/Development_Changes.md), [Solution design](../project/Documents/Solution_Design.md), [Environment inventory](../project/Documents/Environment_Inventory.md) (planned entries only), dictionary `systems/pwa/receipts.yaml` (recognition and the v7 contract). The PostgreSQL routine definition in the dictionary stays at the live V95 capture until V96 is applied.
- Closure pruning (release workflow): deleted the change notes `CHANGE_NOTES_W4_APP_2026-10-16.md`, `CHANGE_NOTES_W4_DATABASE_2026-10-16.md` and `CHANGE_NOTES_W6_DOCUMENTATION_2026-10-17.md` (outside the retention window, no current link), the Development Changes rows for R075 activation and promotion, and the evidence they kept alive: 200 files under `project/outputs/` in these folders: dictionary-reconciliation-20260924, metabase-poc-20260922, r017-20260924, r018-20260924, r019-20260924, r020-20260924, r021-20260924, r022-20260924, r023-20260924, r024-20260924, r027-payment-health, r028-schedule-health, r029-bcg-matrix, r035-borrower-pages, r040-borrower-punctuality, r041-borrower-detail, r042-borrower-payments, r043-borrower-navigation, r044-partners, r047-production, r048-loan-interest-production, r048-production, r048-upcoming-charges, r049-production, r050-borrower-detail-category, r050-borrower-lifetime, r051-payment-performance, r051-production, r051-receipt-corrections, r051-trigger-performance, r052-promotion-readiness. Git keeps all of them. Kept because current records still link them: `r033-matrix-cutover`, `r038-lifetime-return`, `r039-restore-borrower-bars`, `r045-forecast-planning`, `r049-upcoming-summary` (linked from kept evidence READMEs), `r055-grafana`, `r016-20260922` and `grafana-callback-approval-20261003` (unfinished R055 and R016 work); `check:docs` still warns about these.
- Forge decisions: pinned ephemeral VM internal IP `10.148.0.2`; one shared URL and token audience; DEV and PROD separated by caller identity, not by address.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | 0 errors (Byte) |
| `npm run typecheck` | Pass (Byte) |
| `npm test` | 655 of 655 (Byte) |
| `vite build` (synthetic) | Pass (Byte) |
| `Run-Phase5.ps1` | 85/85 and 10/10 (Byte) |
| `Test-MigrationsCloud.py` | 96 migrations pass (Byte) |
| `python -m unittest discover -s tests` in `integration-agent/` | 561 OK, 82 skipped (agent, after the key-fetch backoff fix) |
| `ruff check` | Pass (agent) |
| `terraform fmt` and `terraform validate` | Pass (Forge) |
| `terraform test` | DEV 20/20, PROD 17/17 (Forge) |
| DEV and `ecosystem-debian` `terraform apply` | Applied; both re-plans No changes; DEV command service Ready and `/health` 200 (Forge, details in the inventory) |
| `playwright test receipt-recognition-independent.spec.ts` (desktop-chromium) | 4/4 (Chase) |
| `playwright test payment-command.spec.ts phase5-final-ui-independent.spec.ts` (desktop-chromium) | 48 passed after the receipt-mock fix for the recognition POST (Byte); Chase's earlier run found the G07 mock regression |
| Echo phone-viewport check (Chromium iPhone emulation, mocked recognition) | No blockers; RR-UX-13 to 16 applied |
| Adversarial review (Chase) | No blockers; Google key-fetch backoff added |
| `npm run check:docs` | 0 failures, 0 warnings (Dewey) |
| DEV owner upload, first try (18:17Z) | `Slip not read`: recognizer audit write rejected (route `gemini` not in the audit CHECK); fixed in PR #70, agent redeployed |
| DEV owner upload, retry (18:35Z) | Form filled; recognizer journal `recognized` from the DEV caller in 11.7 s |
| Owner DEV review fixes (Byte) | Transfer time removed from the form and review (slip time still posted as `transferTime` into Created At); sticky summary re-measures the full header height (gap under the header); receiving page clips horizontal overflow and overscroll; banner says when Auto-assign finds no charges due. Lint 0 errors, typecheck, `npm test` 655/655, affected e2e 130 passed on desktop and mobile Chromium |

## Not run
- A PROD check with a real slip by the owner.
- Real Vertex AI or Codex calls, the recognizer on the VM, and any live PWA recognition: nothing is deployed.
- PROD `terraform apply`, V96 in PROD, the PROD backup and guarded runner: owner-gated, below. The DEV and VM steps are done; hashes, revisions and generations are in the [environment inventory](../project/Documents/Environment_Inventory.md).
- Chase's DEV app smoke result: not yet received.
- Promotion tooling: `deploy-business-hosting.mjs` and its tests are unchanged; they cover only a frontend-only R075 on V95.

## Recovery
Revert the commit. DEV is live: set `DEV_RECEIPT_RECOGNITION` back to `disabled` through the previous DEV activation tfvars generation (inventory) and re-apply, disable the recognizer in the live catalogue by editing the live file (never copy the repository template), and `systemctl disable --now mw-receipt-recognition.service`; the form continues manually. The previous command image and revision are in the inventory. V96 stays (v6 still works). After activation: set `receipt_recognizer.activation = "disabled"` (or `enabled = false`) and re-apply, and set `receipt_recognition_enabled=false` on the VM, then `systemctl disable --now mw-receipt-recognition.service`; the form continues manually. V96 follows the usual restorable-backup rule; v6 commands keep working, so the PWA can fall back to v6.

## Promotion authority
Owner instruction, 18 October 2026: "coordinate with session_01QcLEzV9QEhHt7HqJi8ngVa to include [the 23-receipt audit-route fix] in the current release. When all are incorporated, merge it and push to production." This is the scoped production approval for R075 under the release workflow: V96 on PROD with a verified backup, PROD command image and Hosting, PROD infrastructure (recognizer egress and `PROD_RECEIPT_RECOGNITION`), agent redeploy with the PROD caller and recognition enabled, and the append-only audit closure of the 23 stuck `receipt_payment` operations after a `mw_agent` backup. R075 was frozen at source `96b0a0b` (PRs #69 to #72) and R076 opened in the same tracker update. No unrelated financial correction or forced notification is implied.

## Open questions
None blocking. The owner has not yet checked PROD recognition with a real slip.

## Remaining work
- Owner check of PROD recognition with a real slip; Gemini latency watch.
- Pre-existing agent receipt job from 16:57Z in `RECEIPT_ARCHIVE_PENDING`: check the next runs. The 18:17:35Z `receipt_recognition_api` operation stays as is.
- Chase's DEV smoke result was not received as a separate record.
- Tooling gaps from the DEV rollout stay listed in [Development changes](../project/Documents/Development_Changes.md).
