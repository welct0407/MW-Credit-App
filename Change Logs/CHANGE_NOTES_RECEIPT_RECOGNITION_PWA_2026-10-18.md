# Change notes — receipt recognition for manual payments (R075), 18 October 2026

## Purpose
Reads a manual payment slip with the shared recognizer and pre-fills the payment form, so the person checks and saves instead of typing. Source only: nothing is deployed, applied or enabled. Owner design: [Claude Doc](https://claude.ai/artifact/KP7KKQnNy1QDnXqEiRsgRx). The agent stage has its own [change note](../integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_RECOGNITION_2026-10-18.md); it is not repeated here.

## Changes
- Agent (`integration-agent/`): provider abstraction (Codex default, Gemini on Vertex AI), recognizer service `mw-receipt-recognition` on `10.148.0.2:8790`, catalogue revision 29 `receipt_recognition_api` implemented and disabled.
- Infrastructure: Vertex AI API (`infrastructure/dev/main.tf`); `receipt-recognizer.tf` in `infrastructure/dev`, `infrastructure/production` and `infrastructure/ecosystem-debian` (role `roles/aiplatform.user` for `mw-integration-agent`, firewall `allow-receipt-recognizer-run-egress` TCP 8790 from `10.148.0.0/20` to the VM identity, Direct VPC egress and `DEV_`/`PROD_RECEIPT_RECOGNITION` plus `_URL` variables on the command services); new `receipt_recognizer` variable, default off; READMEs of production and ecosystem-debian; `business-runtime.tftest.hcl` and `receipt-recognizer.tftest.hcl`.
- API: route `POST /api/payment-commands/{requestId}/receipts/{receiptId}/recognition` (`services/payment-command/handler.mjs`, `result.mjs`, `store.mjs`, `services/production/business-config.mjs`, `business-runtime.mjs`); `services/receipts/recognizer-client.mjs` and `recognizer-rules.mjs`.
- Contract: manual payment command v7 adds `bankReference` and `transferTime` (`services/contracts/payment-command.mjs`, `scripts/rehearsal/payment-command.mjs`); v6 is still accepted.
- SQL: `database/migrations/V96__manual_payment_command_v7_bank_reference.sql` (mirrored in `database/current/public-functions.sql`) writes Payments "Bank Reference", writes "Created At" from slip date and time (Bangkok) when both are present, accepts today or yesterday for v7, and widens the plan-provenance filter to v7 only when the command carries an allocation plan, so agent v7 receipts are unaffected. No new table or column.
- PWA (`apps/pwa/src/SelectedCharges.tsx`, `live-style.css`, `offline-sync.ts`): fill-and-warn form flow per Echo RR-UX-01..12.
- Tests: `tests/unit/receipt-recognition-route.test.mjs`, `receipt-recognition-rules.test.mjs`, `payment-allocation-contract.test.mjs`; `tests/integration/phase5-v7-payment-independent.test.mjs` and updates to the Phase 5 suites and `Run-Phase5.ps1`.
- Records: [Release tracker](../project/Documents/Release_Tracker.md), [Development changes](../project/Documents/Development_Changes.md), [Solution design](../project/Documents/Solution_Design.md), [Environment inventory](../project/Documents/Environment_Inventory.md) (planned entries only), dictionary `systems/pwa/receipts.yaml` (recognition and the v7 contract). The PostgreSQL routine definition in the dictionary stays at the live V95 capture until V96 is applied.
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
| `playwright test receipt-recognition-independent.spec.ts` (desktop-chromium) | 4/4 (Chase) |
| `playwright test payment-command.spec.ts phase5-final-ui-independent.spec.ts` (desktop-chromium) | 48 passed after the receipt-mock fix for the recognition POST (Byte); Chase's earlier run found the G07 mock regression |
| Echo phone-viewport check (Chromium iPhone emulation, mocked recognition) | No blockers; RR-UX-13 to 16 applied |
| Adversarial review (Chase) | No blockers; Google key-fetch backoff added |
| `npm run check:docs` | 0 failures, 0 warnings (Dewey) |

## Not run
- Real Vertex AI or Codex calls, the recognizer on the VM, and any live PWA recognition: nothing is deployed.
- `terraform plan` and `apply` in DEV and PROD, V96 in DEV or PROD, the PROD backup and guarded runner: owner-gated, below.
- Promotion tooling: `deploy-business-hosting.mjs` and its tests are unchanged; they cover only a frontend-only R075 on V95.

## Recovery
Revert the commit. Nothing is live. After activation: set `receipt_recognizer.activation = "disabled"` (or `enabled = false`) and re-apply, and set `receipt_recognition_enabled=false` on the VM, then `systemctl disable --now mw-receipt-recognition.service`; the form continues manually. V96 follows the usual restorable-backup rule; v6 commands keep working, so the PWA can fall back to v6.

## Open questions
Owner-gated activation, in this order. None is authorized by this batch.
1. Apply V96 to DEV, then PROD, with the guarded runner, the exact tested commit and manifest, and a verified restorable PROD backup.
2. Forge apply order: DEV Vertex API and the `ecosystem-debian` role and firewall; then the DEV and PROD `receipt_recognizer` blocks with `enabled = true` and `activation = "disabled"`; enable recognition last.
3. Agent catalogue revision 29, two steps as for revision 28 (see `integration-agent/docs/RECEIPTS.md`): install code that knows `receipt_recognition_api` while the live catalogue stays at revision 28, then add the disabled key through the config-only route; the service stays disabled until the owner switches it on.
4. Replace the placeholder numeric subjects for the DEV and PROD command-service callers in the VM configuration with the real service-account subjects.
5. Choose the model after the synthetic timing run (`--time codex,gemini`), for example `gemini-2.5-flash`; Pro by configuration.
6. A promotion contract for R075 with runtime, SQL (V96) and infrastructure inputs.

## Remaining work
The pull request's Development checks, then the owner-gated steps; the Environment inventory entries become verified pins at apply time.
