# Change notes — R102 Long/Aged overdue status and Claude Opus 5.5 chat model, 27 October 2026

## Purpose
R102 adds a Collection status "Long/Aged overdue" (oldest overdue charge older than about one week, dark grey, between Overdue and Fully paid) and a Claude Opus 5.5 chat model reached through a Debian-VM relay to the Anthropic API (Medium effort, default when it works).

## Changes
- Collection status `long_overdue` ("Long overdue" / "เกินกำหนดนาน", colour `#37474f`): an unpaid charge 8 or more days past due on the Bangkok business date; Overdue is now 1 to 7 days. Group order is not_paid, partially_paid, overdue, long_overdue, fully_paid. Rows carry `overdueDays`; the tile line reads "Long overdue · N days". `services/api/collection-read-contract.mjs` (cursor version 4, so a pre-deploy cursor is rejected as `Invalid cursor`), `services/api/synthetic-read-adapter.mjs`, `services/business/dashboard.mjs` (metric `longOverdue`), `apps/pwa/src/CollectionRecords.tsx`, `Dashboard.tsx`, `live-style.css`, `main.tsx`, `preview-session.ts`. The offline dataset reuses the same read, with no cache schema change.
- V114 `database/migrations/V114__long_overdue_collection_status.sql` replaces the two V22 OLAP views (`olap_borrowers_analytics` status 'Long Overdue'; `olap_portfolio_summary` gains the appended column "Borrowers with Long Overdue Payment", and "Borrowers with Overdue Payment" now counts 1 to 7 days). No table, column, trigger or grant change. Test: `scripts/database/Test-LongOverdue.sql`.
- Metabase: lane model `models/collection-summary.sql`, `CollectionMonitor.mjs`, `Build-RemainingPages.mjs`, `ReorderCollectionStatusLanes.mjs`, `Verify-CollectionMonitor.mjs`, and the new guarded `AddLongOverdueLane.mjs`. It is applied at PROD promotion, right after V114, then verified.
- Chat model Claude Opus 5.5 (`claude-opus-5-5`, fixed Medium effort) through the relay service `mw-chat-relay` on the Debian VM (port 8791). `services/chat/claude.mjs` (Anthropic dialect), `config.mjs`, `engine.mjs`, `gemini.mjs`, `handler.mjs`, `prompt.mjs`, `runtime.mjs`, `server.mjs`, `tools.mjs`, `assets/schema-digest.json`. Picker order: Claude Opus 5.5, then the three Gemini models. A failed relay turn shows the existing "model unavailable" text; there is no silent fallback.
- V115 `database/migrations/V115__chat_claude_model_ids.sql` widens chat model ids to allow `claude-*`: one CHECK constraint and two functions, no table or column. It needs the chat owner window.
- Keyless access to the Anthropic API: workload identity federation from the VM identity `mw-integration-agent@`, one workspace, service account and federation rule per environment (`mw-credit-chat-dev`, `mw-credit-chat-prod`). The relay requests a fresh Google ID token per exchange and keeps the access token in memory only. No Anthropic API key or Secret Manager secret exists. Relay code and tests: `integration-agent` (see its [change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R102_CHAT_RELAY_2026-10-27.md)).
- Infrastructure: `infrastructure/ecosystem-debian/chat-relay.tf` (firewall `allow-chat-relay-run-egress`, applied 27 October 2026 19:04Z, plan sha `20f2fe5c…4275`, 1 add); `infrastructure/dev` and `infrastructure/production` `chat-service.tf` (the `chat_relay.enabled` switch, off; Direct VPC egress, `CHAT_RELAY_URL`, model list). Gemini stays the default until the DEV proof of Claude passes.
- Adversarial review fixes (Chase's four findings, fixed by Byte): `Verify-RemainingPages.mjs` counts 'Long Overdue' as `Build-RemainingPages.mjs` does; `services/agent-conversations/virtuals.mjs` orders '4 - เกินกำหนดนาน Long Overdue' before Fully Paid (now 5); the relay ends a stream cut at its 110 s deadline with an SSE `timeout_error` (upstream break `api_error`) and `claude.mjs` maps it, or a started stream without `stop_reason`, to `MODEL_TIMEOUT`; the Dashboard hides the Long Overdue row when a cached response has no `longOverdue` value.
- Documents: Development Changes, Release Tracker, Solution Design, `database/README.md`, Metabase README, chat design `project/outputs/r090-pwa-chatbot/DESIGN.md`, Environment Inventory.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` (Byte, tree) | Pass |
| `npm run typecheck` (Byte) | Pass |
| `npm run check:docs` (Byte) | 0 failures |
| `node --test` (Byte) | 380 pass, 1 skip on 26 files; 174/174 on 12 files after the fixes |
| Agent unittest (Byte) | 637 OK |
| `test_chat_relay` (Byte) | 18 OK |
| ruff (Byte) | Pass |
| Disposable PostgreSQL chain to V115 with `Test-LongOverdue`, `Test-Chat`, `Test-AccessMatrix` (Byte) | Pass |
| `collection-postgres.test.mjs` (Byte) | 23/23 |
| `AddLongOverdueLane.mjs` dry run (Byte) | OK |
| Playwright R102 Dashboard and Page7 Dashboard (Byte) | 4/4 |
| `terraform fmt` and `validate`, 3 stacks (Forge) | Pass |
| `terraform test` (Forge) | DEV 33, PROD 22 |
| `ecosystem-debian` apply (Forge) | 1 add, sha `20f2fe5c…4275`, read-back OK, re-plan no changes |
| Playwright `collection-read` (Chase) | 2/2 |
| Playwright borrower-search, collection-loading-shift, upcoming-read, live-search-timer (Chase) | 18/18 |
| Playwright `phase5-final-ui-independent` and `chat.spec.ts` (Chase) | 95 pass, 1 flaky: P6 T9 management unsent draft (closed-page route callback under load; 3/3 in isolation, unrelated to R102) |
| Adversarial review (Chase) | 4 findings, all fixed by Byte |
| Pull request `Development checks` | pending (PR run) |

## Not run
The DEV device pass (Echo), the DEV chat proof, the Data Dictionary regeneration after the DEV apply, and the Metabase apply (at PROD promotion). A skipped check is not a pass.

Deploy order: apply V114 and V115 before the app images in each environment, because `dashboard.mjs` selects the V114 column.

## Recovery
- Git baseline: the commit before the R102 package. Product code, Terraform and documents revert with the pull request.
- V114 and V115 are forward migrations, not edited in place once applied. Roll back by a later migration that restores the V113 view bodies (V114) and the V114 CHECK and function bodies (V115). Both are definition-only, so a PROD backup stays the safety net.
- Chat: set `chat_relay.enabled` to false (a config-only Cloud Run revision) and keep or restore the Gemini default; stop `mw-chat-relay` on the VM. Archive the federation rule in the Anthropic Console to revoke access.
- Firewall: remove `allow-chat-relay-run-egress` through the `ecosystem-debian` stack.
- Metabase: `AddLongOverdueLane.mjs` writes a private baseline before `--apply`; restore from it.

## Open questions
- Owner Console setup is pending: create the two workspaces, service accounts and federation rules listed above with their spend limits, then give the ids to the VM configuration.
- Confirm that V114 (view replacement) and V115 (CHECK constraint and two functions) are within the scoped approval; neither adds a table or column.
- Confirm the Metabase apply order: right after V114 on PROD.

## Remaining work
Checks and the DEV proof of Claude Opus 5.5 (tool call, streaming, grounding, deadline, usage, plus one unavailable-model proof) before the default flips. Regenerate the data dictionary entries for the two OLAP views and the chat model constraint after V114 and V115 are applied to DEV. Fill the Checks table from Chase's evidence.
