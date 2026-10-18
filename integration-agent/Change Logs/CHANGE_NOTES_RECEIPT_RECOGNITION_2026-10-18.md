# Change notes — receipt recognition API (agent stage 1), 18 October 2026

## Purpose
Stage 1 of the owner's Receipt Recognition design (18 October 2026, Bangkok): one recognizer in the Debian agent that the PWA command services and the Instagram receipt cycle share, with Gemini on Vertex AI as a swappable provider. Source only; nothing is deployed or enabled.

## Changes
- `src/mw_integration_agent/receipt_image.py`: keeps the shared prompt, schema, canonicalisation and a shared shape check (exact keys and JSON types). `extract(config, image_data)` keeps its signature and result; it dispatches on the new `receipt_extraction_provider` (default `codex`) and keeps the `receipt_image_extraction` audit with route `codex` or `gemini`. New `recognize()` returns the result with provider name and pinned model. `RecognitionUnavailable` keeps the message `RECEIPT_EXTRACTION_UNAVAILABLE`.
- `src/mw_integration_agent/receipt_provider_codex.py`: the unchanged `codex exec` call moved out of `receipt_image.py`; model reported as `default`.
- `src/mw_integration_agent/receipt_provider_gemini.py`: Vertex AI `generateContent` (regional or global host), inline PNG, temperature 0, JSON mode, schema translated to Vertex's dialect, thinking config by model generation (Gemini 3 and later `thinkingLevel` LOW; Gemini 2.x Flash and Flash-Lite `thinkingBudget` 0; Gemini 2.x Pro none), 20 s per attempt, one retry on 429/5xx/timeout/connection error within the caller's deadline. VM access token from the metadata server through `http.py`; no API key, no new dependency. Fixed model versions only (orchestrator decision, 18 October 2026): `gemini-<n>-flash|flash-lite|pro` with an optional `-NNN` suffix; ids containing `latest`, `preview` or `exp` are rejected.
- `src/mw_integration_agent/receipt_recognition_api.py`: the recognizer: `POST /v1/receipt-recognition` and `GET /healthz` per the fixed contract; Google ID-token verification (RS256 against Google's keys, pinned issuer, audience, verified email, email and numeric subject per allowed caller); PNG/JPEG, 5 MB, SHA-256 header; two concurrent extractions; 30 s bound; switch and catalogue read per request; one audit operation per authenticated request; private VPC IPv4 bind only. Configuration validation for all new fields. Google key fetches back off for 60 s after any attempt (failed, or without the requested key id), so unknown key ids or a key outage cannot stall every request on the 5 s download (review finding, Chase).
- `src/mw_integration_agent/config.py`: calls the recognizer validation; the catalogue validator knows `receipt_recognition_api`.
- `src/mw_integration_agent/cli.py`: `serve-receipt-recognition` (outside job audit, like `serve-webhook`); `check` reports the provider and recognizer switch.
- `systemd/mw-receipt-recognition.service`: new unit, same hardening as the webhook receiver; install disabled.
- `service-catalogue.json` revision 29: `receipt_recognition_api` implemented, disabled. `SERVICE_CATALOGUE.md` row and revision note.
- `config.example.json`: `receipt_extraction_provider`, `receipt_recognition_*` (bind `10.148.0.2:8790`, audience `http://10.148.0.2:8790/v1/receipt-recognition` as pinned in Terraform, DEV and PROD command-service callers with their numeric subjects), `gemini_*` with the owner's model `gemini-3.8-flash` on location `global` (not offered in `asia-southeast1`); the recognizer stays disabled.
- `scripts/verify-receipt-extraction.py`: `--time codex,gemini` times a real run per provider on six synthetic slips (VM only, explicit). The default proof run is kept; its time assertion now expects `HH:MM`, which `validate_receipt` has returned since it began truncating seconds.
- Tests: new `tests/test_receipt_recognition.py` (33 tests: provider default, shape check, Gemini request, parsing, retry, schema translation, model pinning, configuration, token claims and signature, every contract status, busy and timeout slots, audit content); `test_receipts.py` patch target, `test_cli.py` and `test_systemd_units.py` updated for the new module, command and unit.
- Docs: `docs/RECEIPTS.md` (new section "Receipt recognition API", including the revision 29 two-step rollout), `docs/OPERATIONS.md` (activation boundary).

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements in a fresh venv) | 562 tests, OK, 82 skipped (lab suites); baseline before the batch 529 OK |
| `python -m unittest tests.test_receipt_recognition` | 33 tests, OK |
| `ruff check --no-cache integration-agent` | All checks passed |
| `mw-integration-agent check --config config.example.json` (repository catalogue revision 29) | ok; `receipt_extraction_provider` codex, `receipt_recognition` false |
| `npm run check:docs` (repository root) | Pass, 0 failures |

## Not run
- Real Vertex AI or Codex runs and the `--time` timing: no live calls in this stage; run on the VM after the infrastructure stage.
- PostgreSQL lab suites (82 skipped): no change to SQL or state code; CI runs them.
- No deployment, unit installation or catalogue change on the host.

## Recovery
Revert this batch's commit. Nothing is live. When deployed later, recovery is `receipt_recognition_enabled=false` (or the catalogue entry off) and `systemctl disable --now mw-receipt-recognition.service`; the Instagram cycle stays on Codex unless `receipt_extraction_provider` was changed.

## Open questions
- Deployment route for revision 29 (two steps, as for revision 28): the owner chooses it at activation; see `docs/RECEIPTS.md`.

## Remaining work
- Infrastructure stage (Forge): Vertex AI API, `roles/aiplatform.user` on the VM identity, direct VPC egress for the DEV and PROD command services, firewall rule to the VM's service account on port 8790, Vertex egress check.
- On the VM after that stage: `scripts/verify-receipt-extraction.py --time codex,gemini` with the chosen model, then owner activation (DEV first).
