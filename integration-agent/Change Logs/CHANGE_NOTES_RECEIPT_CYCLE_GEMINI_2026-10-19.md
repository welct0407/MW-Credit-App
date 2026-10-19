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
| First switch, 18 October 2026 20:34:56Z | Synthetic check 5 of 6: the injected-instruction slip timed out at about 25 s under the recognizer's 12 s per attempt; rolled back 20:36:51Z, config byte-identical; no real receipt affected |
| Deploy at `a57fc7e` (PR #76), 02:01:29Z, 19 October 2026 | Activated; freeze backup `runtime-20261019T020122284096Z` |
| Six synthetic slips with Gemini under the cycle bounds, 02:01:47Z to 02:02:29Z | All 6 pass; median 6.29 s, max 13.59 s |
| Provider switch 02:02:42Z to 02:02:44Z | `receipt_extraction_provider` codex to gemini; 11 receipt runs clean to 02:07Z |
| `npm run check:docs` | 0 failures; 37 warnings, the same count without this change (none in `integration-agent/`) |

## Not run
- Lab suites (no SQL or state change); CI runs them.

## Follow-up check 19 Oct 13:00Z
Read-only, on the VM as `mwagent` with the live config (`mw_agent`), at 13:01Z. Window from the Gemini cycle switch (02:02:42Z).

| Item | Result |
| --- | --- |
| Cycle extractions (`receipt_image_extraction`), all real Instagram receipts (verification runs are not audited) | 3, all provider `gemini`, model `gemini-3.8-flash` (all before the 09:13:43Z Flash-Lite switch, as expected), route `internal`, parent `receipt-cycle`. 07:13:39Z FAILED (`RecognitionUnavailable`, a Gemini timeout); its retry at 07:19:21Z COMPLETED; 08:00:07Z COMPLETED. Non-effect operations end COMPLETED, not COMMITTED |
| Cycle extractions on `gemini-3.5-flash-lite` | None yet: no real Instagram receipt has reached extraction since 09:13:43Z |
| Receiving-page recognitions since 09:13:43Z | 2, both from the PROD command service, model `gemini-3.5-flash-lite`, `recognized`: 09:37:57Z in 2.94 s, 10:53:22Z in 3.73 s |
| Receipt jobs created since 02:02:42Z | 11: 2 `REVIEW_REQUESTED` with posted reviews (2 POSTED), 9 `IGNORED` (4 of them `BORROWER_NOT_UNIQUELY_ENABLED`, before extraction). No new job in a stuck state |
| Receipt runs since 02:02:42Z | 1,589, all `failures: []`; no failed run |
| Job created 18 Oct 16:57:47Z | Not cleared: still `PENDING`, `RECEIPT_ARCHIVE_PENDING`, 0 extraction attempts, next retry rescheduled every cycle (13:01:31Z). Unrelated to Gemini; its archive step keeps deferring |

## Recovery
Revert this commit. Live: restore `/root/config.json.pre-gemini-cycle-2` by the config-only route (the cycle returns to Codex), then `deploy-runtime.py rollback` to the previous pin if the package must go back.

## Open questions
None.

## Remaining work
- First real receipt on `gemini-3.5-flash-lite` through the cycle: confirm its audit row (provider `gemini`, model `gemini-3.5-flash-lite`, route `internal`) and that the job progresses.
- Find out why the 18 October 16:57:47Z job stays `RECEIPT_ARCHIVE_PENDING`.
- Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host).
