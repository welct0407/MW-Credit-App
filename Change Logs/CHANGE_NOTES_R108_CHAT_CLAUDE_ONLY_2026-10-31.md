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
| Chase review | Pass, 5/5, plus an R108 e2e case; the advisory to pin the other `CHAT_MODELS_JSON` fields was done. Minor gaps recorded, not fixed: a thread opened before the model list loads (model empty) or on a stale cached list may fail `MODEL_UNAVAILABLE` once on the first send; a retry works |
| PR #196 CI | Pass on `cb875ea` (run 41203206026) and on `3ce8b99` (run 41204618059) |
| DEV deploy (Forge, 31 October 2026) | Pass: build from `cb875ea` (SUCCESS 13:04:50Z to 13:05:27Z); read, command and chat images set; plan 0 add, 3 change, 0 destroy, applied 13:07:16Z to 13:07:53Z; Hosting twice (first with the apply, then from `16b8f5a` at 13:25:17Z to 13:25:24Z, build-version R108). Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md) |
| DEV proofs (Chase) | Pass. The models API lists exactly `claude-opus-5-5`; an old `gemini-4-argon` thread continued on Claude with its context and the thread model was updated; a Gemini model in the request body gets 400; with no body model the result is `MODEL_UNAVAILABLE` (expected); recognizer health 1 after the deploy and the DEV receipt recognition environment unchanged; no ERROR logs. The browser check on `dev-lm` was not run (no sign-in path for the test identity); CI e2e covers it |
| Echo wording check | Pass. UX-R108-01 done: the note reads "Gemini is no longer available. Your next message uses {label}." and in Thai "Gemini ไม่มีให้ใช้แล้ว ข้อความถัดไปจะใช้ {label}" (a manual pick keeps "Applies to your next message"). UX-R108-02 one-item picker OK, no change. UX-R108-03 raw model id badge for old threads: later, low. UX-R108-04 no change |
| PROD promotion and readback | Pass, see the promotion record below |

## Not run
- Browser check on `dev-lm` (no sign-in path for the test identity); covered by CI e2e.
- No PROD chat, save or notification was made.

## Recovery
- Git: revert the batch commit; baseline R107 `1befbb8` (tag `R107`).
- DEV: restore the DEV activation rollback copy and apply, then redeploy the previous Hosting.
- PROD: restore the PROD activation copy taken at promotion (`CHAT_MODELS_JSON` and the previous chat image) and redeploy the previous Hosting. Old Gemini threads stay valid because the constraint was not changed.

## Open questions
- None.

## Remaining work
- Owner device check of an old Gemini thread on the installed PWA.
- Deferred: remove `roles/aiplatform.user` from the chat identities; UX-R108-03 (raw model id badge for old threads, low).
- Carried from R107: the owner's device check, the 48 h billing readback (about 2026-11-02T09:45Z), and redeploying notify and jobs in a later release.

## Promotion record (Forge, 31 October 2026, UTC)
Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value, token or borrower data appears here.

**Scope and authority**
- **Scope:** R108 to DEV and PROD: the chat image, `CHAT_MODELS_JSON` (Claude-only) and Hosting. No SQL, no VM; read and command change only in DEV (images), notify and jobs unchanged.
- **Authority:** the owner's instructions of 31 October 2026: "remove Gemini from the chat model menu", then "ok go ahead all the way to prod". PRs #195 and #196 were merged under it.
- **Freeze:** the PROD build (start 13:24:44Z) on `16b8f5a` (PR #196 merge on `main`; R108 commits `cb875ea` and `3ce8b99`); delivery tool: the R108 hand-written kind in `scripts/promotion/deploy-business-hosting.mjs` (schemaVersion 39); baseline R107 `1befbb8`. Next unused number R109.

| Item | Result |
| --- | --- |
| Baseline (PROD, before) | read `00032-4rw`, command `00037-qns`, chat `00015-vmr` on `b45cb7c9…`; notify and jobs `00022-*` on `50953149…`; settings generation `1793447075020076`; Hosting `6477338972a89aae` |
| SQL | None. V119 readback only (read-only, 14:13:01Z): 119 history rows |
| Image | Cloud Build `4b4f6168-6d65-4194-953e-4cd7865052c4`, SUCCESS 13:24:44Z to 13:25:38Z, PROD builder `mw-credit-app-build-prod`, `git archive` of `16b8f5a`, tag `keep-r108-runtime` |
| Terraform | The activation changed only the chat image override and the Claude-only `chat_models` (generation `1793456070015817`). Plan 0 add, 1 change, 0 destroy (chat image and `CHAT_MODELS_JSON`), plan sha256 `efcec283…`, JSON `793b2c4f…`; applied 14:13:46Z to 14:14:24Z; re-plan no changes |
| Runner | The R108 kind (schema 39) `--check` passed before and after. CI cited per job: check and e2e run 41204618059 (`3ce8b99`); terraform run 41203206026 (`cb875ea`); guards and rebuilds run 41185896777 (`aea6a7c`, same stage hash). `--apply` 14:15:17Z to 14:16:00Z, live readback passed |
| Hosting | Version `cf2b76bb37fc1862`, release `1793456154215000`, 16 files; `lm.mw-credit.com` build-version R108 (version `0b3e609b71822fc1b4037e7d`) |
| Revisions after | chat `00016-9rj` (new); read, command, notify and jobs unchanged |
| Smoke (read-only) | `/health` 200 on the three services; `/api/session` 401; `/api/chat/models` 401; no ERROR logs from 14:13:46Z to 14:16:43Z. No PROD chat, save or notification was made |
| Private records | Receipt `gs://mw-credit-operator-private-737787224638/promotion-receipts/R108-HOSTING-RECEIPT.json`; package under `.../promotion-packages/r108/` (records include both rollback copies), outside Git |
| Rollback | PROD: restore `production.activation.before-r108-1793447075020076.tfvars` (chat back to `b45cb7c9…` and the four models), plan 0/1/0, apply, publish; chat `00015-vmr` can take traffic; the runner readback needs a manual check or the R107 rule. Hosting: redeploy `6477338972a89aae`. DEV: restore `dev.activation.before-r108-1793439264574932.tfvars`; DEV Hosting previous `9f1185a1f2d358e6`, R106 `9884ad3ab5d37a16` |

Applied and verified. Not owner-accepted: the device check of an old Gemini thread is open.

## Closure (31 October 2026)
Tag record: the annotated tag `R108` (object `0bd211c1756d9608f80ac1cf03496d82ad27530a`) points at the package commit `16b8f5ab33c949db094dc64da4677d42325c3abf` (PR #196 on `main`), created by the Release tag workflow (checked with `git ls-remote origin refs/tags/R108`, peeled to the package commit). Baseline R107 `1befbb8`. R109 is opened in this closure and R110 is the next unused number.

Open follow-ups (visible, not blocking Released: DEV proofs and the PROD readback are clean):
- Owner device check of an old Gemini thread on the installed PWA.
- R107 open items: device check, 48 h billing readback, notify and jobs redeploy.
- Removing `roles/aiplatform.user` from the chat identities; UX-R108-03.
- Minor gap: the first send on a thread opened before the model list loads may fail `MODEL_UNAVAILABLE` once; a retry works.

Prune (this closure): deleted `Change Logs/CHANGE_NOTES_R105_GENERIC_PROMOTION_KIND_2026-10-28.md` and `Change Logs/CHANGE_NOTES_R105_WHOLE_NUMBER_INPUTS_2026-10-29.md` (R105 left the retention window: R109 Open; R108, R107, R106 Released). Their links in the Release tracker (two), Development Changes (two) and the Environment inventory now point to the commit permalink `16b8f5a`, the last commit where they exist. No other change note or evidence file is outside the window or uncited.
