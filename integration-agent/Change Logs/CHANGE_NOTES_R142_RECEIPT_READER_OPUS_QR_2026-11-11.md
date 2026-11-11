# Change notes — receipt reader Claude Opus 5.5 and slip QR reference (R142), 11 November 2026

## Purpose
A borrower slip on 11 November 2026 was held as PAYER_UNRESOLVED because the current reader (Gemini 3.5 Flash-Lite, thinking low) misread the payer name. R142 moves the receipt reader to Claude Opus 5.5 and adds the slip QR reference, DEV first. Owner instruction (11 November 2026, Bangkok): "include the QR reference and build it in DEV, follow your recommendation plan. engage 6 members team." Authority is DEV build and DEV activation only. PROD activation (the PROD caller and the Instagram receipt cycle) stays on Gemini until a separate owner approval. No PROD data write; no new tables or columns expected.

## Scope
- New receipt provider Claude Opus 5.5 (`claude-opus-5-5`), adaptive thinking, effort low, the shared `SCHEMA` and `PROMPT`, the same 1600 px prepared image.
- Keyless Anthropic workload identity federation, as the chat relay does.
- Gemini stays the automatic fallback when Claude is unavailable (timeout, 5xx, refusal, invalid shape).
- Invisible format characters (Unicode category Cf, for example U+200B) are stripped from model text fields before the shape check.
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
- Implementation (Byte), integration agent: `receipt_provider_claude.py` (Opus 5.5, adaptive thinking, effort low, keyless, one attempt); `receipt_image.py` (provider list, 15 s Claude phase inside the 40 s deadline, Gemini fallback, invisible-character stripping, QR hook); `receipt_qr.py` (zxing-cpp 3.1.1, strict validation); `receipt_recognition_api.py` (caller route keys `provider`, `fallback`, `qr_reference`; cycle `claude`; audit `observed` gains `served_provider`, `served_model`, `fallback_cause`, `reference_source`, `qr`); `config.example.json` (`receipt_claude_model`, `receipt_claude_effort`, `receipt_cycle_fallback`, `receipt_cycle_qr_reference`, `receipt_qr_reference_banks`); `pyproject.toml` and `requirements.lock`; catalogue revision 37 (services unchanged) and a `deploy-runtime.py` 36 to 37 clause.
- Implementation (Byte, Echo), PWA: slip upload progress messages (R142-UX-05..10; copy in `recognition-timing.ts` and the five forms; "Preparing receipt..." stays only in the picker).
- Tests: `tests/test_receipt_qr.py`, `tests/test_receipt_recognition.py`, `tests/test_config.py`, `tests/test_deploy_runtime.py`, `tests/unit/receipt-recognition-timing.test.mjs`.
- Records (Dewey): this note, `Release_Tracker.md`, `Development_Changes.md`, `integration-agent/docs/RECEIPTS.md`, `integration-agent/README.md`, `Environment_Inventory.md` (planned state only).

## DEV activation
Pending: not deployed or activated; CI, DEV deploy, DEV activation and the performance measurement are not done.

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
| CI on the pull request | Pending |

## Not run
CI, DEV deploy, DEV activation and the performance measurement (latency and VM load with the QR decoder); the 70 PostgreSQL lab suites skipped in Byte's run. A skipped check is not a pass.

## Recovery
Git baseline `c7f6488`. After activation, remove the route keys from the `command-dev` caller (or set its provider to `gemini`) by the config-only route; nothing in PROD changes.

## Open questions
- PROD activation of the new reader, when the owner has reviewed DEV.
- Bank or third-party slip verification is a later owner decision.

## Remaining work
Implementation, DEV activation and checks. Then update, as affected: `integration-agent/docs/RECEIPTS.md`, `integration-agent/README.md` Current state, `integration-agent/SERVICE_CATALOGUE.md` and `service-catalogue.json`, `integration-agent/config.example.json` notes, `project/Documents/Environment_Inventory.md` (federation rule, DEV caller routing, VM version), `project/Documents/Solution_Design.md` Current state if receipt reading is described there, `project/Documents/Development_Changes.md` (active scope), the Data Dictionary only if the recognizer contract changes, and `project/Documents/Service_Account_Browser_Mapping.md` only if an identity changes.
