# Change notes — chat relay optional thinking key, 4 November 2026

## Purpose
R122 romanizes Thai names quickly with Claude Sonnet 5.5, which needs thinking turned off. Owner instruction, 4 November 2026: "Change relay, so thinking can be an option. Use a reasonable effort but fast choice without thinking. Chat continue to use thinking."

## Changes
- `src/mw_integration_agent/chat_relay_api.py`: the request-key allowlist gains an optional `thinking` key, strictly validated to absent, `{type:adaptive}` or `{type:between_tools}`; anything else is rejected as before. It is forwarded unchanged.
- No service is added, removed or switched; `chat_messages_relay` keeps its identities, federation rules and limits. A request without `thinking` behaves exactly as before, so the chat is unchanged.
- [SERVICE_CATALOGUE.md](../SERVICE_CATALOGUE.md): the `chat_messages_relay` row lists the optional `thinking` key. The catalogue revision stays 35 (Forge), and the JSON manifest is unchanged because no service definition or default switch changed.
- Main change note: [R122](../../Change%20Logs/CHANGE_NOTES_R122_BORROWER_DISPLAY_TRANSLATE_2026-11-04.md).

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
