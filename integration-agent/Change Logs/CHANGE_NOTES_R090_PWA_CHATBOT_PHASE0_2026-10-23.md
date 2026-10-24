# Change notes — R090 phase 0, Partner conversation stopped, 23 October 2026

## Purpose
The in-app chat (R090, [root change note](../../Change%20Logs/CHANGE_NOTES_R090_PWA_CHATBOT_2026-10-23.md)) replaces the Instagram Partner conversation, so two Partners must not get answers from both. Phase 0 stops the conversation on the Debian host with a config-only change; nothing is removed yet (decommission is phase 3 of the [design](../../project/outputs/r090-pwa-chatbot/DESIGN.md#12-phase-3-decommission-checklist), after the owner's PROD test).

## Changes
- Config, `vm-mw-credit-agent`, owner decision in the session to switch four flags together because the agent's `check` refuses `partner_conversations_enabled=false` alone ("conversation writes require conversations"): `partner_conversations_enabled`, `conversation_writes_enabled`, `native_delete_enabled` and `reviewer_dml_enabled` set to `false` at 09:58:42Z. Config sha256 `42a4fc2bc2571bdc15764e6f681723e97515c40294dcf9bb480e813773ed209f` became `85e23eb0c15ee223ab95c297a9b4fa27c4f4cc23a1c4a5aa64421a427df899f5`. Unchanged: provider `gemini` (`gemini-4-argon`, thinking `MEDIUM`), `conversation_sql_read_enabled=true`, code `fbc6b18`. 0 conversation replies were pending.
- First attempt, 09:50:42Z to 09:51:00Z: only `partner_conversations_enabled=false`; `check` refused it, the file was restored, workers were paused about 18 s.
- Units: `mw-partner-conversation.timer` and `mw-conversation-wake.path` stopped at 09:59:45Z and disabled at 10:01:03Z (the design assumed the timers would no-op when the switch was off; instead the unit failed every 15 s, so the failed state was reset). The stop survives a reboot, and the deploy helper resumes only units that were active at `freeze`.
- Host monitor 10:00:35Z: success. Conversation check reads 3 (disabled); `timer_ok` and `wake_path_active` read 0, which is expected now. Receipts are unaffected.
- Docs: [Operations](../docs/OPERATIONS.md) (Current state paragraph, restart steps in the provider section) and [Partner conversations](https://github.com/welct0407/MW-Credit-App/blob/feca47b2849dbdc881ac881cb58ce7ff91862c9f/integration-agent/docs/PARTNER_CONVERSATIONS.md) (stopped banner). Five of the six worker timers stay active.
- Tooling: `scripts/build-schema-digest.py` leaves the `pwa_chat_*` relations (V104, closed to the agent role) out of the agent's schema digest, so the committed digest is unchanged; `tests/test_schema_digest.py` expects that exclusion. The data dictionary now records the four chat tables.

## Checks
| Command | Result |
| --- | --- |
| `mw-integration-agent check` after the change (Forge, VM) | Pass at 09:58:42Z; the first attempt was refused as described |
| Host monitor run (Forge, VM) | Success at 10:00:35Z |
| `python integration-agent/scripts/build-schema-digest.py --check` (Dewey, uncommitted tree on base 0c4325c) | Pass (digest unchanged) |
| `PYTHONPATH=src python -m unittest discover -s tests -p test_schema_digest.py` in `integration-agent/` (Dewey, same tree) | Pass, 8 tests |

## Not run
The full agent test suite: only the digest builder and its test changed.

## Recovery
Restore `/root/config.json.pre-r090-phase0b-20261023` (root 0600) to `/etc/mw-integration-agent/config.json` (0640 root:mwagent), run `mw-integration-agent check`, restart `mw-instagram-webhook` and `mw-receipt-recognition`, run `receiver-ready --wait 30`, then `systemctl enable --now mw-partner-conversation.timer mw-conversation-wake.path`. The builder and test changes revert with Git (baseline `0c4325c`).

## Open questions
None.

## Remaining work
Phase 3 decommission after the owner's PROD test, with its own change note and scoped owner authorization.
