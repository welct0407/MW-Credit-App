# Change notes — receipt cycle Gemini bounds and provider audit plan (R077), 19 October 2026

## Purpose
The owner's first switch of the Instagram receipt cycle to Gemini (18 October 2026, 20:34Z) was rolled back after 1 of 6 synthetic slips timed out: the cycle used the recognizer's interactive bounds (12 s per attempt, about 24 s in total). The owner approved giving the cycle its own longer bounds and recording the provider in its audit plan ([recognition change note](CHANGE_NOTES_RECEIPT_RECOGNITION_2026-10-18.md)).

## Changes
- `src/mw_integration_agent/receipt_provider_gemini.py`: `extract` takes `attempt_timeout` (default the recognizer's 12 s); new `cycle_timeouts(config)` reads `receipt_cycle_gemini_attempt_seconds` (default 25, 5..60) and `receipt_cycle_gemini_total_seconds` (default 60, attempt..120).
- `src/mw_integration_agent/receipt_image.py`: the cycle's Gemini extraction runs with those bounds (one retry while at least 4 s remain); `recognize` passes an attempt timeout only when given, so the recognizer's 18/17/12 s and the Codex path are unchanged. Both cycle extractions record `{"provider", "model"}` in the `receipt_image_extraction` audit plan.
- `src/mw_integration_agent/audit.py`: `audited(..., plan=None)` takes an optional function that builds the operation plan from the call's arguments.
- `src/mw_integration_agent/receipt_recognition_api.py`: configuration validation checks the cycle bounds when the cycle uses Gemini or the keys are set.
- `tests/test_receipt_recognition.py`: cycle bounds (defaults, overrides, recognizer and Codex unchanged), retry within the cycle deadline, bound validation, audit plan for both providers.
- `docs/RECEIPTS.md`: settings row and "Cycle audit" paragraph.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | 577 tests OK, 85 skipped (lab suites) |
| `python -m unittest tests.test_receipt_recognition` | 42 tests OK |
| `ruff check --no-cache integration-agent` | All checks passed |
| `npm run check:docs` | 0 failures; 37 warnings, the same count without this change (none in `integration-agent/`) |

## Not run
- Lab suites (no SQL or state change); CI runs them.
- Live: deploy, the six synthetic slips with the cycle bounds and the provider switch follow after merge, under the owner's approval of 19 October 2026.

## Recovery
Revert this commit. Live: restore `/root/config.json.pre-gemini-cycle-2` by the config-only route (the cycle returns to Codex), then `deploy-runtime.py rollback` to the previous pin if the package must go back.

## Open questions
None.

## Remaining work
- Deploy at the merge commit, run the six synthetic slips with Gemini under the cycle bounds, switch `receipt_extraction_provider` to `gemini` only if all six pass, then watch the next runs.
