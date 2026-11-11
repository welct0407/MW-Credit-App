# Change notes — receipt reader Claude Opus 5.5 and slip QR reference (R142), 11 November 2026

## Purpose
A borrower slip on 11 November 2026 was held as PAYER_UNRESOLVED because the current reader (Gemini 3.5 Flash-Lite, thinking low) misread the payer name. R142 moves the receipt reader to Claude Opus 5.5 and adds the slip QR reference, DEV first. Owner instruction (11 November 2026, Bangkok): "include the QR reference and build it in DEV, follow your recommendation plan. engage 6 members team." Authority is DEV build and DEV activation only. PROD activation (the PROD caller and the Instagram receipt cycle) stays on Gemini until a separate owner approval. No PROD data write; no new tables or columns expected.

## Scope
- New receipt provider Claude Opus 5.5 (`claude-opus-5-5`), adaptive thinking, effort low, the shared `SCHEMA` and `PROMPT`, the same 1600 px prepared image.
- Keyless Anthropic workload identity federation, as the chat relay does.
- Gemini stays the automatic fallback when Claude is unavailable (timeout, 5xx, refusal, invalid shape).
- Invisible format characters (Unicode category Cf, for example U+200B) are stripped from model text fields before the shape check, opt-in per route (`clean_text` on the caller entry, `receipt_cycle_clean_text` for the cycle; default off; a Claude route does not enable it by itself).
- The reference is read from the slip QR when present and CRC-valid; precedence against the OCR reference and any recognizer contract change are Archie's decisions.
- DEV caller routed to the new reader; PROD caller and the Instagram receipt cycle unchanged.
- Out of scope unless Archie finds it necessary: I/l folding in duplicate checks, a bank verification API, payer-name data fixes.

## Evidence
Aggregate results only; no slip images, names, accounts or references are kept in Git.
- Bake-off on 318 posted slips of the last 30 days, with the production prompt, schema and 1600 px preparation. Truth is the unanimous readings plus image adjudication of 106 disputed slips.
- Current reader: 23 reference errors, 37 payer errors, 258 of 318 slips fully correct.
- Haiku 5.5 adaptive low: 6 and 4, 308 correct. Gemini 3.8 Flash low: 16 and 16, 289 correct with 3 failed calls. Sonnet 5.5: 55 to 56 reference errors, 252 to 254 correct (zero-width spaces and digit errors).
- Opus 5.5 adaptive low: 7 reference errors, 1 payer error, 309 correct; about 0.0146 USD per slip; latency p50 2.8 s, p90 3.5 s.
- No model error in amount, date or receiving account. Remaining reference errors are mostly SCB mixed-case references where printed `l` and `I` look the same.
- Slip QR decoded locally on 304 of 319 slips, all CRC16-valid. It carries a sending bank code and the transaction reference only. The QR reference equals the printed reference on 300 of 304; 4 SCB slips differed and are not investigated. The QR does not prove authenticity.
- Cost of the evaluation: about 10.80 USD Anthropic (DEV federated route) and about 0.40 USD Gemini.
- Decision: keep `MAX_SIDE` 1600 and the current preparation. A full-resolution test on 61 larger slips gave no material gain.

## Changes
Built in source on branch `claude/compassionate-heisenberg-ras6py`, code commit `64c23d8`.
- Design (Archie): the recognizer result contract stays unchanged (no rolling-compatibility step). The QR reference replaces the model's reference only for allowlisted banks (default 002, 004, 006, 014, 030; 025 TrueMoney excluded because its QR carries a different identifier). Federation reuses the chat relay rule of the caller's environment. Routing is per caller, off by default, so PROD and the cycle are unchanged.
- Implementation (Byte), integration agent: `receipt_provider_claude.py` (Opus 5.5, adaptive thinking, effort low, keyless, one attempt); `receipt_image.py` (provider list, 15 s Claude phase inside the 40 s deadline, Gemini fallback, opt-in invisible-character stripping `checked(value, clean=False)`, QR hook); `receipt_qr.py` (zxing-cpp 3.1.1, strict validation); `receipt_recognition_api.py` (caller route keys `provider`, `fallback`, `qr_reference`, `clean_text`; cycle `claude`; audit `observed` gains `served_provider`, `served_model`, `fallback_cause`, `reference_source`, `qr`); `config.example.json` (`receipt_claude_model`, `receipt_claude_effort`, `receipt_cycle_fallback`, `receipt_cycle_qr_reference`, `receipt_cycle_clean_text`, `receipt_qr_reference_banks`); `pyproject.toml` and `requirements.lock`; catalogue revision 37 (services unchanged) and a `deploy-runtime.py` 36 to 37 clause.
- Implementation (Byte, Echo), PWA: slip upload progress messages (R142-UX-05..10; copy in `recognition-timing.ts` and the five forms; "Preparing receipt..." stays only in the picker).
- Tests: `tests/test_receipt_qr.py`, `tests/test_receipt_recognition.py`, `tests/test_config.py`, `tests/test_deploy_runtime.py`, `tests/unit/receipt-recognition-timing.test.mjs`.
- Records (Dewey): this note, `Release_Tracker.md`, `Development_Changes.md`, `integration-agent/docs/RECEIPTS.md`, `integration-agent/README.md`, `Environment_Inventory.md` (planned state only).

## Performance (DEV measurement, 11 November 2026 UTC)
Read-only, on `vm-mw-credit-agent`; aggregate figures only.
- Run A: 100 random real slips, sequential, `nice` 19.

| Route | Median | p90 | Notes |
| --- | --- | --- | --- |
| PROD route (gemini) | 9.1 s | 18.6 s | |
| DEV route (claude + QR) | 10.0 s | 31.7 s | 82 served by Claude, 16 Gemini fallbacks (`claude_timeout`), 1 timeout |

  QR valid on 98 of 98 decoded: same as the model on 93, replaced on 5. Peak memory 120 MB; both routes used about 7 s CPU per slip.
- Run B: 30 slips at normal priority, per-stage medians (p90 in brackets): `canonical_image` 1.5 s (3.0); `downscaled` 7.0 s (13.8), CPU-bound because of the `optimize=True` PNG attempt; Claude API 3.2 s (7.1); Gemini API 1.4 s (2.9); QR 0.2 s (0.5).
- Conclusion: the model change adds about 1.9 s at the median and 4 s at p90. The fallbacks were caused by the preparation step running inside the 15 s Claude phase. The live PROD baseline (last 30 days, 139 requests) is median 4.0 s, p90 6.4 s, max 25.3 s, with 2 provider timeouts; app uploads are pre-shrunk on the phone, so these runs on full-size slips overstate real latency.
- Cost: about 0.015 USD per Claude slip; the measurement runs used about 2 USD.

## Follow-up fix (Byte, uncommitted)
The Claude route prepares the image once with the new `prepared()` (Lanczos, 1600 px, JPEG quality 85 only) before the phase timer starts, and a fallback to Gemini reuses those bytes. PROD and Gemini-only routes are unchanged. The audit gains `prepare_ms` and `model_ms` on the Claude route. Local timing on a 1290x2017 synthetic image: 0.077 s against 0.431 s for `downscaled`. Files: `receipt_image.py`, `receipt_provider_claude.py`, `receipt_provider_gemini.py`, `receipt_recognition_api.py`, `tests/test_receipt_recognition.py`.

## DEV device check (Echo, iPhone WebKit)
Items 1 to 4 pass: "Uploading" at 0.2 s, "Reading" at 1.6 s, "From slip (Claude)" at 4.7 s; the slow messages at 8 s and 10 s; the offline message; one polite status element with focus kept. Item 5 (loan close and manual receipt) was not checked live; those screens share the same helpers.
- R142-UX-11: in WebKit the app's service worker hides requests from Playwright route blocks, so the write guard in the DEV sign-in recipe (`docs/Development.md`, step 4) did not stop writes on iPhone WebKit. One synthetic orphan receipt was uploaded to DEV (no payment). `docs/Development.md` step 4 now installs the guard with an init script and requires a probe request first.
- Chase's DEV end-to-end results: pending.

## Owner deploy decision
11 November 2026: gate the invisible-character stripping, then merge PR #288 and deploy. There is no DEV agent, so the code goes to the one live VM; DEV is switched by configuration while PROD and the Instagram receipt cycle read exactly as today.

## Pre-deploy baseline (Forge, captured 2026-11-11T17:49:39Z)
Rollback baseline: agent `code_version` `246bcb93`, catalogue revision 36, DEV Hosting version `a3d0594cc8f5511f`, recognizer and chat relay healthy, `mw-integration-agent check` exit 0.

## DEV deployment record (Forge, 11 November 2026, UTC)
PR #288 merged into main as `d2de3330`. There is no DEV agent: the code is on the one live VM and DEV is switched by configuration.
- Agent code: `d2de3330` deployed to `vm-mw-credit-agent` through `update-from-github.sh` (`246bcb93` to `d2de3330`), the hash-checked lock install (zxing-cpp 3.1.1) and `deploy-runtime.py`: freeze 18:25:51Z (rollback directory `runtime-20261111T182551434202Z`), install 18:25:56Z, activate 18:26:00Z to 18:26:05Z; catalogue revision 36 to 37. The temporary operator file was shredded. `check` exit 0, `/ready` `code_version` `d2de3330`, recognizer `/healthz` 200; the chat relay was not restarted by this step. Rollback: `deploy-runtime.py rollback --commit d2de3330` (the full hash is in the deploy log).
- DEV activation: `config-only-change.py` tag `r142-dev-reader`, 18:26:48Z to 18:26:53Z. Only `receipt_claude_model`, `receipt_claude_effort`, `receipt_qr_reference_banks` and the `command-dev` caller entry changed (`provider` claude, `fallback` gemini, `qr_reference` true, `clean_text` true). The `command-prod` entry and `receipt_extraction_provider` (gemini) are unchanged and there are no `receipt_cycle_*` keys. `check` ok; recognizer and relay `/healthz` 200 (the relay restart is by design). Rollback: `config-only-change.py restore --tag r142-dev-reader`.
- DEV Hosting: version `5554bf9a8655f648`, release `1794421701781000`, build-version R142 `4ec5fa9b7689cff209d71b2a`, entry `/assets/index-C7e6ViiP.js`, from PR head `29a7ba0` (tree equal to merge `d2de3330`; the bundle embeds `29a7ba0`); `--check` passed with 17 files; deployed 18:28:11Z to 18:28:22Z. Rollback: `a3d0594cc8f5511f`.
- Pending: the first PROD-caller request after the deploy, which must be served by gemini; Chase's and Echo's DEV checks; the performance measurement.

## DEV activation
Applied 11 November 2026 18:26:48Z to 18:26:53Z (see the DEV deployment record): the `command-dev` caller on Claude with Gemini fallback, QR reference and text cleaning; `receipt_claude_model` `claude-opus-5-5`, effort `low`, default QR bank list. The `command-prod` caller and the cycle are unchanged. Not yet measured: latency and VM load.

## PROD
Pending owner approval. Not requested; the PROD caller and the Instagram receipt cycle stay on Gemini.

## Checks
| Command | Result |
| --- | --- |
| `uv pip compile pyproject.toml --generate-hashes --python-version 3.13` (Byte, `c7f6488` plus the diff that became `64c23d8`, byte-identical) | Pass: adds only zxing-cpp 3.1.1 (hash equals the bake-off wheel) |
| `ruff check --no-cache integration-agent` 0.16.8 (Byte, same tree) | Pass |
| Agent `python -m unittest discover -s tests` on a pinned-lock, non-editable install (Byte, same tree) | Pass: 866 passed, 70 skipped (PostgreSQL lab suites) |
| `mw-integration-agent check --config config.example.json --catalogue service-catalogue.json` (Byte, same tree) | Pass: ok |
| PWA `npm run typecheck`, `npm run lint`, `npm test` (Byte, same tree) | Pass: 1299 passed, 1 skipped |
| QR gate on real slips of the last 30 days, zxing-cpp 3.1.1 with `canonical_image` at `c7f6488` (Chase, local scratchpad, deleted afterwards) | Pass: 318 of 319 decoded and valid against the gate of 304 or more (OpenCV's count); the one failure is an MPO image `canonical_image` already rejects. Decode time per slip p50 0.20 s, p90 0.38 s. QR reference equals the checked printed reference on 314 of 318: 3 SCB l/I cases where the QR is right and 1 bank-code 025 (TrueMoney) slip whose QR carries a different identifier, which is why the allowlist excludes 025 |
| Dewey, `node --test tests/unit/receipt-recognition-timing.test.mjs` (working tree on `c7f6488`) | Pass, 7 of 7 |
| Dewey, agent unit tests in this cloud session | Environment limitation, not a failure: `psycopg` and `zxingcpp` are not installed here, so one config test and `test_receipt_qr` could not load; Byte's full run above covers them |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, working tree) |
| CI, PR #288 | Pass: `Development checks` run 43075377547 (check, lint, 6 e2e shards) on the head `29a7ba0`; `Agent tests` run 43072193508 on `9c1f5329`. Earlier runs failed on a browser timer defect (`Illegal invocation` in `watchSlow`), fixed in `29a7ba08` |
| DEV deployment | Pass: `check` exit 0 and ok, `/ready` `code_version` `d2de3330`, recognizer and relay `/healthz` 200, Hosting `--check` 17 files |
| DEV performance measurement (Run A 100 slips, Run B 30 slips) | Done: see Performance; Claude route median 10.0 s and p90 31.7 s before the follow-up fix |
| Follow-up fix: ruff, agent tests (146), `mw-integration-agent check` (Byte, uncommitted tree) | Pass: ruff clean, 146 tests, `check` ok |
| Echo's DEV iPhone check, items 1 to 4 | Pass; item 5 not checked live |
| Chase's DEV end-to-end results, first PROD-caller request (must be gemini) | Pending |

## Not run
The follow-up fix is not yet measured on the VM, and item 5 of Echo's check (loan close and manual receipt) was not checked live; the 70 PostgreSQL lab suites skipped in Byte's run. A skipped check is not a pass.

## Recovery
Git baseline `c7f6488` (code), agent `246bcb93` and catalogue revision 36 on the VM, Hosting `a3d0594cc8f5511f`. Rollback: `deploy-runtime.py rollback --commit d2de3330` for the code; `config-only-change.py restore --tag r142-dev-reader` for the configuration; redeploy the previous Hosting version. Or remove the route keys from the `command-dev` caller (or set its provider to `gemini`) by the config-only route; nothing in PROD changes.

## Open questions
- PROD activation of the new reader, when the owner has reviewed DEV.
- Bank or third-party slip verification is a later owner decision.

## Remaining work
Chase's DEV end-to-end results, the first PROD-caller request after the deploy, deploying and re-measuring the follow-up fix, and the PROD decision. Then update, as affected: `integration-agent/docs/RECEIPTS.md`, `integration-agent/README.md` Current state, `integration-agent/SERVICE_CATALOGUE.md` and `service-catalogue.json`, `integration-agent/config.example.json` notes, `project/Documents/Environment_Inventory.md` (federation rule, DEV caller routing, VM version), `project/Documents/Solution_Design.md` Current state if receipt reading is described there, `project/Documents/Development_Changes.md` (active scope), the Data Dictionary only if the recognizer contract changes, and `project/Documents/Service_Account_Browser_Mapping.md` only if an identity changes.
