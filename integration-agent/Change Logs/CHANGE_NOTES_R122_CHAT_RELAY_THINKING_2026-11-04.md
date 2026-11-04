# Change notes — chat relay optional thinking key, 4 November 2026

## Purpose
R122 romanizes Thai names quickly with Claude Sonnet 5.5, which needs thinking turned off. Owner instruction, 4 November 2026: "Change relay, so thinking can be an option. Use a reasonable effort but fast choice without thinking. Chat continue to use thinking."

## Changes
- `src/mw_integration_agent/chat_relay_api.py`: the request-key allowlist gains an optional `thinking` key, strictly validated to absent, `{type:adaptive}` or `{type:between_tools}`; anything else is rejected as before. It is forwarded unchanged.
- No service is added, removed or switched; `chat_messages_relay` keeps its identities, federation rules and limits. A request without `thinking` behaves exactly as before, so the chat is unchanged.
- [SERVICE_CATALOGUE.md](../SERVICE_CATALOGUE.md): the `chat_messages_relay` row lists the optional `thinking` key. The catalogue revision stays 35 (Forge), and the JSON manifest is unchanged because no service definition or default switch changed.
- Main change note: [R122](https://github.com/welct0407/MW-Credit-App/blob/2d4dd30/Change%20Logs/CHANGE_NOTES_R122_BORROWER_DISPLAY_TRANSLATE_2026-11-04.md).

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | 742 OK, 70 skipped (Byte; 1b9931d + transliterate edit) |
| `ruff check` on `chat_relay_api.py` and `test_chat_relay.py` | Pass (Byte; 1b9931d + transliterate edit) |
| Diff review | `thinking` validation exact-match; rejects `disabled`, `budget_tokens` and extra keys (Chase) |

## Not run
No VM-01 install yet. A skipped check is not a pass.

## Recovery
Reinstall the previous runtime package with the deploy helper, or revert the commit; the key was optional, so callers need no change.

## Open questions
None.

## Remaining work
Install on VM-01 with the DEV deploy; the relay is shared by DEV and PROD callers.

## DEV deploy
Forge, 4 November 2026 (UTC), on `vm-mw-credit-agent`. Authority: owner instruction "Change relay, so thinking can be an option", relayed by the orchestrator after green CI on PR #234 (Agent tests run 41854555800).

| Step | Evidence |
| --- | --- |
| Baseline | `/ready` true, `code_version` `0a8a8cd`; relay and recognizer `/healthz` ok; no failed units; config sha256 `30229389…19a8`, catalogue `400f4a3c…dd6` (revision 35, unchanged) |
| Checkout | `git fetch origin refs/pull/234/head`, detached at `74a57059e22036b4d7281f89be541825854ad704` (not merged; `update-from-github.sh` is main-only and was not used) |
| Dry run | Schema through V11, no missing or drift; one module changed (`chat_relay_api.py`); units unchanged; ancestry `ancestor` |
| Freeze | 15:22:57Z, backup `runtime-20261104T152257442522Z` (metadata sha256 `dbf80f37…67ca`) |
| Install | No removed files, no unit changes; `check` as `mwagent` passes |
| Activate | 15:23:57Z to 15:24:01Z, probe `51fe63de-c883-45d5-ae30-d2474a0229b5`; `/ready` true with `74a5705`; six timers and paths resumed |
| Relay | `deploy-runtime.py` does not restart `mw-chat-relay`, so it was restarted by hand at 15:24:11Z (InvocationID `1abe6ef9…`); `/healthz` ok; installed module carries `thinking_not_allowed`; no failed units |
| Smoke (DEV caller only) | Through the DEV chat service: a chat turn with no `thinking` key (the PROD chat shape) relayed 200 on `claude-opus-5-5`; transliterate with `thinking:{type:between_tools}` relayed 200 on `claude-sonnet-5-5`. No PROD call was made |
| Deviation | The schema check needs an `mw_agent` owner connection; a temporary root-only file (as `postgres`, password from Secret Manager, value never printed) was used and shredded afterwards, as in R113, R118 and R119 |

**PROD chat now runs through this relay at unmerged `74a5705`.** After merge, the VM checkout goes back to `main` with the next agent deploy. Not run: the invalid-`thinking` 400 against the live relay, because `codex-cloud` cannot mint a DEV chat caller token; unit tests cover it. Rollback: `deploy-runtime.py rollback --commit 74a57059e22036b4d7281f89be541825854ad704`, then `systemctl restart mw-chat-relay` (restores `0a8a8cd`).
