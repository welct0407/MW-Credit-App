# Change notes — R122 borrower display and Thai name romanization, 4 November 2026

## Purpose
R122 fixes two display issues the owner raised and adds a Thai-to-English name helper on the new-borrower form. The owner wants DEV deployment and testing before review; no PROD in this scope.

## Changes
Owner scope (4 November 2026): (1) the small numbers under open loans on the Borrower page show outstanding principal, not total principal; (2) the Cash page From/To field shows the borrower name in the viewer's preferred language; (3) the New borrower form gets a button beside the English name that romanizes the Thai name through the Claude API with Claude Sonnet 5.5 at medium effort and thinking off (owner changes of 4 November 2026 for speed; first scoped as Opus 5.5 at medium, then Sonnet 5.5 at low). The owner also instructed: "Change relay, so thinking can be an option. Use a reasonable effort but fast choice without thinking. Chat continue to use thinking." Team: Archie design, Byte build, Chase verification, Dewey records, Echo tests, Forge DEV deploy. The scope now includes a VM-01 chat relay change. No SQL schema, table, column or Terraform change.

- `apps/pwa/src/LoanRecords.tsx`: open loan rows show outstanding principal, with per-group legends.
- `services/business/cash.mjs`: the cash statement adds `b."Description" AS "borrowerDescription"`. `apps/pwa/src/CashWorkspace.tsx`: From/To uses `borrowerNameFor` with the viewer's language.
- `services/chat/transliterate.mjs` (new), `services/chat/handler.mjs`, `services/chat/store.mjs`: `POST /api/chat/transliterate` `{text}` returns `{english}`. Same Firebase token, origins and `read` capability as the other chat routes. One tool-less request through the existing VM chat relay to `claude-sonnet-5-5`, effort medium, `thinking:{type:'between_tools'}` (off), `max_tokens` 512, RTGS romanization, nothing stored, the name is never logged. The reply must be JSON `{"romanized":"…"}` and match `^[A-Za-z][A-Za-z .'-]{0,119}$`. Errors: 400 invalid input, 401, 403 `access_denied`, 502 `transliteration_invalid`, 503 `model_unavailable`.
- `apps/pwa/src/BorrowerRecord.tsx`, `chat/chat-client.ts`, `live-main.tsx`, `live-style.css`: a Translate button on the New borrower form only.
- `integration-agent/src/mw_integration_agent/chat_relay_api.py`: the relay accepts an optional `thinking` key, strictly validated to absent, `{type:adaptive}` or `{type:between_tools}`; the chat service sends adaptive as before, so chat behaviour is unchanged. Records: [integration-agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R122_CHAT_RELAY_THINKING_2026-11-04.md) and the `chat_messages_relay` catalogue row.
- `tests/unit/chat-transliterate.test.mjs` (new).

Design decisions and Byte's deviations from the design:
- Relay auth is keyless federation; no Anthropic key exists in Secret Manager and none is added.
- Model and thinking change on the owner's instructions of 4 November 2026: Sonnet 5.5 with thinking off, effort medium and `max_tokens` 512, replacing Opus 5.5 at medium and `max_tokens` 1024. Sonnet 5.5 needs `thinking:{type:'between_tools'}` to run without thinking, which the relay's request-key allowlist rejected, so the owner approved changing the relay.
- An optional ```json fence around the reply is tolerated before validation.
- Access failures answer 403 `access_denied` (origin or capability), matching the other chat routes.

DEV deploy scope: the VM-01 chat relay (installed by the integration-agent deploy helper; one relay serves DEV and PROD callers, so the change reaches PROD callers too; it is backward compatible, a request without `thinking` behaves as before), the chat image and Hosting. `services/business/cash.mjs` is imported by the offline dataset chunks and by the payment-command store, so the read and command images likely also carry it; Forge confirms which images to roll.

## Checks
| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass (Byte; 1b9931d + transliterate edit) |
| `npm run lint` | 0 errors (Byte; 1b9931d + transliterate edit) |
| focused `node --test` | 209 tests, 208 pass, 1 skip (`MW_CHAT_DIGEST_PORT`) (Byte; 1b9931d + transliterate edit) |
| integration-agent `PYTHONPATH=src python3 -m unittest discover -s tests` | 742 OK, 70 skipped (Byte; 1b9931d + transliterate edit) |
| `ruff check` on `chat_relay_api.py` and `test_chat_relay.py` | Pass (Byte; 1b9931d + transliterate edit) |
| Playwright desktop-chromium `loan-read.spec.ts` | 2 passed (Chase; 1b9931d + transliterate edit) |
| Playwright desktop-chromium `phase5-final-ui-independent.spec.ts -g R122` | 3 passed (Chase; 1b9931d + transliterate edit) |
| Playwright desktop-chromium `chat.spec.ts -g "R122: (Translate|the New)"` | 3 passed, including 320 and 390 px in English and Thai and targets of 44 px or more (Chase; 1b9931d + transliterate edit) |
| Diff review | No defects; relay `thinking` validation is exact-match and rejects `disabled`, `budget_tokens` and extra keys (Chase) |
| `npm run check:docs` | Pass (Dewey) |
| Development checks (CI) | pending, after the push |

## Not run
No PROD action. `services/business/cash.mjs` SQL was not run on a disposable PostgreSQL. iPhone/WebKit and the wide browser suite are left to the pull request CI. Live romanization against the relay is not run until the DEV deploy. A skipped check is not a pass.

## Recovery
Git baseline is R121 `f6622c5` (tag `R121`). Revert the R122 commit and redeploy the prior DEV images, Hosting and the prior relay package on VM-01; no schema change to undo.

## Open questions
None for the owner at present.

## Remaining work
Commit and push, CI, Forge DEV deploy and live test of the three items, then owner review. PROD promotion is not in scope.

## DEV deploy
Pending. Forge records the DEV evidence here; deployment pins live only in the Environment Inventory.
