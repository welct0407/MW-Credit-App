# Change notes — recognizer image downscale and longer time limits (R077), 19 October 2026

## Purpose
Two PROD uploads of a real phone slip on the receiving page (19 October 2026, 07:44:13Z and 07:44:53Z) got no suggestion: Gemini did not answer within the recognizer's 12 s attempt (`vertex_timeout` after about 17 s), and the command route gave up at 15 s (504). The owner chose both fixes: send a smaller image and triple the time limits. Byte sets the command route (45 s) and PWA client (60 s) limits in the same batch.

## Changes
- `src/mw_integration_agent/receipt_provider_gemini.py`: new `downscaled()` sends Gemini an image whose long side is at most 1600 px (Lanczos, aspect kept, never upscaled), as JPEG quality 85 or PNG, whichever is smaller; used by the recognizer and the receipt cycle. The canonical PNG, its digest, the `X-Content-SHA256` check and the shape check are unchanged. A failure to prepare the image has cause `image_prepare_failed`. `ATTEMPT_TIMEOUT` 36 s (was 12).
- `src/mw_integration_agent/receipt_recognition_api.py`: `REQUEST_BOUND` 42 s (was 18), provider deadline 40 s (was 17); a retry still needs at least 4 s left, so in practice one attempt plus a fast retry after a quick 429 or 5xx. Chain: recognizer 42 s < command route 45 s < PWA client 60 s.
- Receipt cycle bounds unchanged (25 s per attempt, 60 s in total).
- `tests/test_receipt_recognition.py`: a 4000×3000 image is sent as 1600×1200 (and 1200×3000 as 640×1600, small images untouched); new bounds; request-shape tests use real images.
- Docs: `docs/RECEIPTS.md`, `SERVICE_CATALOGUE.md` row.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | 578 tests OK, 85 skipped (lab suites); `tests.test_receipt_recognition` 43 OK |
| `ruff check --no-cache integration-agent` | All checks passed |
| `npm run check:docs` | 0 failures |
| Deploy at `683cfce` (PR #79), 08:16:21Z, 19 October 2026 | Activated after the command route and Cloud Run timeout; freeze backup `runtime-20261019T081613805861Z`; recognizer 42/40/36 s, images at most 1600 px; the cycle stays on Gemini at 25 s and 60 s. Synthetic cycle slip 4000 px became 1600 by 1440 JPEG, 88 KB, valid in 7.07 s |

## Not run
- A real slip through the recognizer after the deploy: the owner's retry is pending.

## Recovery
Revert this commit; live, `deploy-runtime.py rollback` to the previous pin and restart `mw-receipt-recognition.service`.

## Open questions
None.

## Remaining work
- Deployed; the owner's retry of a real slip is pending. Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host).
