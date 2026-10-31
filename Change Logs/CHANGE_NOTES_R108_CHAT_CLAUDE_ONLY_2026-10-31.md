# Change notes — R108 chat is Claude-only (Gemini removed from the chat model menu), 2026-10-31

## Purpose
The owner said on 31 October 2026: "remove Gemini from the chat model menu". The chat becomes Claude-only. Gemini stays only for receipt OCR (Debian agent `gemini-3.5-flash-lite`; PWA receiving page, command service, VM recognizer). The cost review found Gemini 4 Argon charges on 21, 26, 28 and 30 October (S$7.55, 1.07, 0.40, 7.52) while the owner uses Claude; OCR costs about S$1.15 a month.

## Changes
Cost context (31 October 2026):
- A three-model independent cost assessment (Fable high and medium, Opus high) converged on about S$96 a month gross (range S$85 to 120) after R107.
- With a Claude-only chat the estimate is about S$88 gross and about S$82 billable.

Design (Archie): configuration, a PWA fallback and a runner kind.
- The service's `CHAT_MODELS_JSON` lists only `claude-opus-5-5`.
- An old thread whose model is a Gemini model switches to the default Claude model with the existing model-changed note. The PWA sends the override in the turn body and the service validates it server-side.
- The chat makes no other Vertex call (the token is fetched lazily), so `roles/aiplatform.user` on the chat identities is deferred (not removed in this release).

Implemented (one writer per path):
- Forge, `infrastructure/dev/chat-service.tf` and `infrastructure/production/chat-service.tf`: defaults are Claude-only; turning the relay off now fails the plan by design. Tftests: DEV 37/37, PROD 24/24. The DEV activation was edited (rollback copy kept). DEV plan 0 add, 1 change, 0 destroy (`CHAT_MODELS_JSON` only), saved, not applied; it applies together with the PWA fallback.
- Byte, `apps/pwa/src/chat/chat-protocol.ts` (`listedDefault`, `threadModel`) and `apps/pwa/src/chat/ChatWorkspace.tsx` (fallback): a thread on an unlisted model shows and sends the default Claude model.
- Byte, `scripts/promotion/deploy-business-hosting.mjs`: a hand-written R108 kind (schemaVersion 39, baseline `1befbb8`, two-file infrastructure allow-list, plan exactly 0 add, 1 change, 0 destroy: chat image and `chat.modelsJson` exactly `[claude-opus-5-5]`). The generic kind is Claude-only from R108; R102 to R107 keep their own rule. `scripts/promotion/README.md` has the R108 section. Decision: the chat image is rebuilt from R108 source (runner precedent).
- Dewey, records: this note, the Release tracker R108 scope line, the Solution Design chat lines.

Not changed: the database constraint on `pwa_chat_threads.model` (it still permits `gemini-*` ids so old threads stay valid), so there is no SQL and no dictionary change; receipt OCR; the VM relay.

## Test plan
- Unit: the model list holds only Claude; a thread on a Gemini or unlisted model resolves to the default Claude model in the PWA; the turn body override is validated server-side and a model outside the list is refused; the Claude relay path is unchanged; the chat makes no Vertex call.
- Terraform: DEV and PROD tftests (Claude-only defaults; relay off fails the plan); DEV plan 0/1/0.
- Runner: the R108 kind `--check` and the plan guard (exactly 0/1/0).
- DEV proofs: the model menu shows Claude only; an old Gemini thread continues on Claude with the note; receipt OCR is unchanged.
- Echo: wording check of the model-changed note and the menu.

## Checks
| Command | Result |
| --- | --- |
| Byte: `npm run lint`, `npm run typecheck` | Pass, exit 0 |
| Byte: focused unit tests | Pass, 196/196 |
| Byte: `npm test` | Pass, 1058 pass, 0 fail, 1 skip |
| Byte: `npm run check:docs` | Pass, 0 |
| Forge: `terraform test` DEV and PROD | Pass, 37/37 and 24/24 |
| Forge: DEV plan | 0 add, 1 change, 0 destroy (`CHAT_MODELS_JSON` only), saved, not applied |
| Chase review | To fill |
| PR CI (after PR #195 merges) | To fill |
| DEV deploy (image, activation, Hosting) | To fill |
| DEV proofs: Claude-only menu; old Gemini thread continues on Claude; OCR unchanged | To fill |
| Echo wording check | To fill |
| PROD promotion and readback | To fill |

## Not run
- PROD apply and readback: not yet run. The owner's request covers removing Gemini from the live menu; it follows Chase's review, CI and the DEV proofs.

## Recovery
- Git: revert the batch commit; baseline R107 `1befbb8` (tag `R107`).
- DEV: restore the DEV activation rollback copy and apply, then redeploy the previous Hosting.
- PROD: restore the PROD activation copy taken at promotion (`CHAT_MODELS_JSON` and the previous chat image) and redeploy the previous Hosting. Old Gemini threads stay valid because the constraint was not changed.

## Open questions
- None.

## Remaining work
- Chase review, push (after PR #195 merges), PR CI, DEV deploy (image, activation, Hosting), DEV proofs, Echo wording check, then the PROD promotion.
- Deferred: remove `roles/aiplatform.user` from the chat identities.
- Carried from R107: the owner's device check and the 48 h billing readback (about 2026-11-02T09:45Z).
