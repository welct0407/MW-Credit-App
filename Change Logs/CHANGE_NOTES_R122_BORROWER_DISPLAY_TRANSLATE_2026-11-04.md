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

Speed benchmark (owner asked on 4 November 2026 to try faster models; Forge, VM-01, direct Messages API with the relay's DEV credentials, 10 synthetic names, 3 runs each):
- Sonnet 5.5, thinking off: medium median 1380 ms (p90 1704); low 1384 ms (p90 1658), no gain.
- Haiku 5.5, thinking off: low 822 ms (p90 985); medium 824 ms (p90 1251); weaker RTGS (for example ฤกษ์ดี gave "Rksdi", กฤษณ์ gave "Kritsanan", and the conventional spelling is Jaidee).
- Haiku adaptive thinking: low 830 ms (p90 2573) with 3 of 30 replies not JSON; medium 1960 ms (p90 3227) with 7 of 30.
- DEV end to end: model 1.3 to 1.8 s, chat and relay overhead 0.1 to 0.4 s, about 1.2 s network from the cloud test client (a phone in Bangkok was not measured), no cold start.
- Owner decision: "Keep Sonnet". No code change.

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
| DEV acceptance (read-only; DEV test Partner, iPhone 13 viewport, Chromium, deployed 74a5705) | Pass. Related loans: open loan `Mint-฿2,500` shows outstanding ฿2,143 (not ฿2,500), an open fully repaid loan shows ฿0, closed loans show original principal, each group has its own legend. Cash statement From/To for a borrower shows `บลู` in Thai and `Blue` in English. New borrower: Translate disabled when blank; `สมชาย ใจดี` filled `Somchai Chaidi` in 3.8 s; replace-confirm dismissed kept the typed name, accepted replaced it; nothing saved (no borrower or financial write). The language switch wrote the test Partner's `preference.update` (Thai, then back to English; verified English). Screenshots outside the repo (Chase) |
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
Forge, 4 November 2026 (UTC), from PR #234 head `74a5705` (unmerged; Development checks run 41854555684 and Agent tests run 41854555800 green). Authority: owner instructions "Push everything to dev and test it" and "Change relay, so thinking can be an option". No SQL, no schema change, notify and jobs unchanged. No secret value or borrower data appears here.

| Step | Evidence |
| --- | --- |
| VM-01 relay | Runtime `0a8a8cd` to `74a5705` (detached checkout of `refs/pull/234/head`); see the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R122_CHAT_RELAY_THINKING_2026-11-04.md#dev-deploy). **PROD chat now also runs through the relay at unmerged `74a5705`** (one shared relay; requests without `thinking` are unchanged) |
| Image | Cloud Build `fba84fb2-3614-4a3a-8b2c-83e5b034d0c6` (`cloudbuild-command.yaml`, builder `mw-credit-app-build`, exact `git archive` of `74a5705`), 15:25:10Z to 15:25:46Z, digest `sha256:c6609e5c88663dbb9b8ec685619b2f047536f09377253ffe2e0307ac819f17b8`, tag `keep-dev-20261104-c6609e5c`. `services/business/cash.mjs` reaches read and command (`business-runtime.mjs`) and chat (`proposals.mjs`), so all three take it |
| Terraform | Activation generation `1793785264889957` to `1793806096697744` (read, command and chat image pins only). Plan 0 add, 3 change, 0 destroy, image attribute only (plan sha256 `1324cee9…0d74`); applied 15:27:30Z to 15:28:09Z; re-plan no changes |
| Readback | `mw-credit-app-read-dev-00070-trf`, `mw-credit-app-command-dev-00087-zkb`, `mw-credit-app-chat-dev-00039-k2k`, each 100% on `c6609e5c`; `cpu_idle` true; command and chat keep private-ranges VPC egress; `/health` 200 on all three; unauthenticated `POST /api/chat/transliterate` 401; no ERROR logs since 15:27Z |
| Hosting | `build:live-dev` from a detached worktree of `74a5705` (release R122, build-version `5105f5fb620c2d3267c239c1`, entry `/assets/index-CMctkZAU.js`), `deploy-hosting.mjs --live-dev --check` then deploy: version `5ab8b076a340d42e`, release `1793806255298000`; public `build-version.json` reads R122 |
| Smoke (DEV test Partner) | `POST /api/chat/transliterate` with a synthetic Thai name: 200 `{"english":"Somchai Chaidi"}` in 3.9 s (relay: `claude-sonnet-5-5`, caller `mw-credit-app-chat-dev@`, 200 `relayed`). Latin-only input: 400 `invalid_request`. One chat turn on `claude-opus-5-5` (no `thinking` key, the PROD chat shape): 200, reply "OK", relay 200 `relayed`; the smoke thread was archived |

Rollback: activation generation `1793785264889957` (images `3556d8ec…ddde8`) and Hosting `f321bf286e369835` (R121); the relay as in the agent note.
