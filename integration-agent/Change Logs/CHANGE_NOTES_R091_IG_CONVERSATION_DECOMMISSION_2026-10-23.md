# Change notes — R091 Instagram Partner conversation decommission (agent), 23 October 2026

## Purpose
The in-app chat replaced the Instagram Partner conversation in R090, and the owner instructed "decommission ig conversation" on 23 October 2026 (scoped authorization for phase 3 of the [R090 design](../../project/outputs/r090-pwa-chatbot/DESIGN.md#12-phase-3-decommission-checklist)), with two decisions: destroy the policy secrets and the DEV test identity now, and delete the conversation journal from `mw_agent`. This is the agent side; the whole plan, the Cloud Run, database and monitoring parts and the order are in the [root note](../../Change%20Logs/CHANGE_NOTES_R091_IG_CONVERSATION_DECOMMISSION_2026-10-23.md). Phase 0 (stopped since 23 October 2026) is the [earlier record](CHANGE_NOTES_R090_PWA_CHATBOT_PHASE0_2026-10-23.md).

## Changes
- Removed from the package: 16 modules (`partner_conversation`, `conversation_session`, `gemini_conversation`, `claude_conversation`, `codex_conversation`, `conversation_tools`, `conversation_sql`, `conversation_grounding`, `conversation_store`, `conversation_write`, `conversation_dml`, `conversation_api`, `conversation_schema`, `conversation_commands`, `conversation_defaults`, `conversation_reviewer`), 15 tests, 2 assets (the business rules text and the schema digest; the chat keeps its own copies under `services/chat/assets/`), 11 scripts (including the digest and schema builders, `conversation-timing.py` and `configure-reviewer-dml.py`) and 3 systemd units (`mw-partner-conversation.service` and `.timer`, `mw-conversation-wake.path`). Kept: `conversation_poll`, `partner_notice`, `instagram`, `outbox`, `state`, `state_migration` and the conversation poll unit and timer.
- Cleaned: `cli.py` (`partner-conversation-cycle` and `native-api-probe` removed; `status` loses the two conversation fields; `audit-relay` loses the `reconciliation` key), `outbox.py` (`reconcile()` of legacy `conversation_dml` rows removed with the table), `server.py` (no `conversation_api` preload), `receipt_wake.py`, `state.py` and `state_migration.py` (no `partner-conversations.db` or conversation table mappings), `partner_notice.py`.
- Configuration: `config.py` refuses every retired key (`partner_conversations_enabled`, `conversation_writes_enabled`, `reviewer_dml_enabled`, `reviewer_delete_enabled`, `native_delete_enabled`, `conversation_provider`, `conversation_sql_read_enabled`, `conversation_grounding`, `conversation_timeout_seconds`, `partner_conversation_cutoff`, `reviewer_dml_cutoff`, `conversation_api_*`, `database_dml_*`, every `claude_*` and `gemini_conversation_*` key), so the live file must be cleaned deliberately; `config.example.json` loses them. `codex_executable` and `codex_home` stay (the Codex receipt providers use them).
- Catalogue revision 32 (`service-catalogue.json`, [SERVICE_CATALOGUE.md](../SERVICE_CATALOGUE.md)) retires seven services: `persistent_codex_conversation`, `gemini_partner_conversation`, `claude_partner_conversation`, `conversation_sql_read`, `operational_data_api`, `reviewer_database_dml` and, a deviation from the plan's six, `operational_data_read` (its only caller was the conversation's native read probe).
- Database: agent migration `V11__drop_conversation_journal.sql` drops the seven conversation tables, deletes the `stream='conversation'` notice rows and narrows the stream CHECK, drops `monitoring.recent_questions_v1` and the `monitoring` schema, and revokes `mw_agent_dashboard`'s CONNECT on `mw_agent` (details: [PostgreSQL operations](../docs/POSTGRESQL_OPERATIONS.md#conversation-journal-retired-agent-v11-r091)).
- Deploy tools: `scripts/deploy-runtime.py` gains an R091 mode that accepts the live revision 31 to revision 32 change only when it drops exactly the retired services and removes exactly the retired configuration keys (the dated freeze copy is the rollback), and its probe is the receipt-status GET only; `scripts/deploy-shared-receipt-api.py` drops `mw-partner-conversation` from the worker list and `mw-conversation-wake.path` from the path units, and freezes, removes and (on rollback) restores the retired unit files. `generate-business-process.py`, `tests/lab/setup.sh` (no reviewer DML role or `mw_dml_test_ci` database) and `.github/workflows/agent-tests.yml` follow.
- Docs: deleted `docs/PARTNER_CONVERSATIONS.md`, `docs/REVIEWER_DML.md` and `docs/CONVERSATION_BUSINESS_RULES.md` (inbound links repointed to the permalink of `feca47b2`, the last commit where they exist; the business rules live on in `services/chat/assets/`); edited [OPERATIONS.md](../docs/OPERATIONS.md), [POSTGRESQL_OPERATIONS.md](../docs/POSTGRESQL_OPERATIONS.md), [README.md](../README.md), [SERVICE_CATALOGUE.md](../SERVICE_CATALOGUE.md) and `tests/lab/README.md`.
- Live monitoring part (already live, Forge, commit `feca47b2`): the host collector no longer reads the conversation (see the root note).

## Checks
| Command | Result |
| --- | --- |
| Agent unit tests (Byte, uncommitted tree on the R090 closure) | 574 OK, 68 skipped |
| PostgreSQL lab suites (Byte, `tests/lab`) | 77 OK |
| `ruff check` (Byte) | Clean |
| `mw-integration-agent check` with the cleaned example configuration (Byte) | ok |
| `node scripts/check-docs.mjs` (Dewey, final run on this tree) | Pass, 0 failures, 0 warnings |

## Not run
- The VM deploy (freeze, `mw_agent` backup and row counts, V11, install, activate), the config cleaning on `vm-mw-credit-agent`, the R085 grant rollback, and the secret destruction: not run; they are the root note's E7 steps 5 to 9 and are recorded there when done.
- Agent tests against the live host: none; the live host still runs the old package.

## Recovery
Git baseline: the R090 closure merge. Before the VM deploy: Git revert. At and after the deploy (before V11): `deploy-runtime.py rollback --commit <previous>` plus the dated configuration backup restores the previous checkout, configuration and unit files (disabled, as frozen). After V11 a package rollback is not enough: the previous audit relay reads `runtime.conversation_dml`, which V11 drops, so the verified `mw_agent` backup taken before V11 must be restored first (it is also the only way back for the deleted journal; there is no partial undo). Install-to-activate window caveat: the new validator refuses the retired configuration keys until `activate` writes the cleaned file, so only a receiver crash inside that window would fail; keep the window short.

## Open questions
None.

## Remaining work
The R091 VM deploy, V11 and the grant rollback (root note E7 steps 5 to 7); Byte is adding a V11 self-check for the `mw_agent_dashboard` CONNECT revoke, then update the Environment inventory rows and this note with the evidence.
