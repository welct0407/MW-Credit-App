# Change notes — R122 borrower display and Thai name romanization, 4 November 2026

## Purpose
R122 fixes two display issues the owner raised and adds a Thai-to-English name helper on the new-borrower form. The owner wants DEV deployment and testing before review; no PROD in this scope.

## Changes
Owner scope (4 November 2026): (1) the small numbers under open loans on the Borrower page show outstanding principal, not total principal; (2) the Cash page From/To field shows the borrower name in the viewer's preferred language; (3) the New borrower form gets a button beside the English name that romanizes the Thai name with Claude Sonnet 5.5 at low effort through the Claude API (owner change of 4 November 2026 for speed; first scoped as Opus 5.5 at medium). Team: Archie design, Byte build, Chase verification, Dewey records, Echo tests, Forge DEV deploy. No SQL schema, table, column or Terraform change.

- `apps/pwa/src/LoanRecords.tsx`: open loan rows show outstanding principal, with per-group legends.
- `services/business/cash.mjs`: the cash statement adds `b."Description" AS "borrowerDescription"`. `apps/pwa/src/CashWorkspace.tsx`: From/To uses `borrowerNameFor` with the viewer's language.
- `services/chat/transliterate.mjs` (new), `services/chat/handler.mjs`, `services/chat/store.mjs`: `POST /api/chat/transliterate` `{text}` returns `{english}`. Same Firebase token, origins and `read` capability as the other chat routes. One tool-less request through the existing VM chat relay to `claude-sonnet-5-5`, effort low, `max_tokens` 512, RTGS romanization, nothing stored, the name is never logged. The reply must be JSON `{"romanized":"…"}` and match `^[A-Za-z][A-Za-z .'-]{0,119}$`. Errors: 400 invalid input, 401, 403 `access_denied`, 502 `transliteration_invalid`, 503 `model_unavailable`.
- `apps/pwa/src/BorrowerRecord.tsx`, `chat/chat-client.ts`, `live-main.tsx`, `live-style.css`: a Translate button on the New borrower form only.
- `tests/unit/chat-transliterate.test.mjs` (new).

Design decisions and Byte's deviations from the design:
- Relay auth is keyless federation; no Anthropic key exists in Secret Manager and none is added.
- Model change on the owner's instruction of 4 November 2026: Sonnet 5.5 at effort low with `max_tokens` 512, replacing Opus 5.5 at medium and `max_tokens` 1024, for speed. Thinking cannot be fully disabled through the relay: Sonnet 5.5 needs `thinking:{type:'between_tools'}`, which the relay's request-key allowlist rejects, and a relay change would touch VM-01, shared with PROD, so it is out of scope. Thinking still counts toward `max_tokens`; a cut reply answers 503.
- An optional ```json fence around the reply is tolerated before validation.
- Access failures answer 403 `access_denied` (origin or capability), matching the other chat routes.

DEV deploy scope: the chat image and Hosting. `services/business/cash.mjs` is imported by the offline dataset chunks and by the payment-command store, so the read and command images likely also carry it; Forge confirms which images to roll.

## Checks
| Command | Result |
| --- | --- |
| typecheck | Pass (Byte; HEAD 65b2fc3 plus the uncommitted R122 tree) |
| lint | Pass (Byte; same tree) |
| focused `node --test` | Pass: 243 pass, 1 skip (Byte; same tree) |
| `npm run check:docs` | Pass (Dewey, documentation batch) |
| Development checks (CI) | pending, after the push |

## Not run
No PROD action and no SQL test (no SQL change). Live romanization against the relay is not run until the DEV deploy. A skipped check is not a pass.

## Recovery
Git baseline is R121 `f6622c5` (tag `R121`). Revert the R122 commit and redeploy the prior DEV images and Hosting; no schema change to undo.

## Open questions
None for the owner at present.

## Remaining work
Commit and push, CI, Forge DEV deploy and live test of the three items, then owner review. PROD promotion is not in scope.

## DEV deploy
Pending. Forge records the DEV evidence here; deployment pins live only in the Environment Inventory.
