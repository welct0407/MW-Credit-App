# Change notes — receipts alert from an unreachable Instagram image: manual close and 404/410 code change, 4 November 2026

## Purpose
Clear the Grafana `receipts` Degraded alert, which had been firing since 14:21 Bangkok on 3 November 2026. One PROD receipt job could never archive its image. The owner approved closing it ahead of the automatic limit. The same change also makes a confirmed gone image (HTTP 404 or 410) end the archive after two attempts, so this alert does not recur.

## Changes
- Diagnosis: `receipt_pipeline` showed `status=2`, `stalled_jobs=1`, `pending_images=1`. Receipt job `54fd41a3…` sat in `PENDING` / `RECEIPT_ARCHIVE_PENDING`. Its evidence asset was `SOURCE_PENDING` with 7 failed attempts, `last_error_code=RECEIPT_DOWNLOAD_FAILED` and no spool file. The Instagram attachment URL returns HTTP 404, so the image is gone. The reviewers' archive-pending notice had already been accepted on Instagram.
- Without intervention, `Archive.capture` stops only after the 12th attempt, about 01:40 Bangkok on 5 November, because of the six-hour backoff.
- PROD `mw_agent` runtime write, owner-approved: one guarded `UPDATE receipt_assets SET archive_state='SOURCE_UNAVAILABLE'` for receipt `03ee34b2…`. It was guarded on the expected job, `SOURCE_PENDING`, no `raw_sha256`, no spool file and a fresh 404. It ran as `mwagent` through the agent's journal adapter inside an `audit.activity('receipt_evidence', action='UPDATE')` operation. This is the same terminal state the code sets itself.
- On its next run the worker moves the job to `REVIEW` / `RECEIPT_ARCHIVE_UNAVAILABLE`, clears its URL and sends the standard hold alert asking the borrower to resend. No payment, review or notice row was changed by hand.
- Code: `receipt_image.download_original` turns HTTP 404 and 410 into the new code `RECEIPT_SOURCE_GONE`; other errors stay `RECEIPT_DOWNLOAD_FAILED`, and 403 stays retryable. In `Archive.capture`, a second consecutive `RECEIPT_SOURCE_GONE`, with no spool file and no `raw_sha256`, sets the asset to `SOURCE_UNAVAILABLE`. The first attempt backs off 300 s, so the worker holds the job (REVIEW / `RECEIPT_ARCHIVE_UNAVAILABLE`, URL cleared, standard hold notice) about five minutes after the first failure, before the 600 s `stalled_jobs` threshold. The 12-attempt limit for other errors and the non-archive `download()` path are unchanged. No schema, configuration or infrastructure change.
- Team: Archie design, Byte code, Chase verification, Dewey records. Echo and Forge not applicable (no UI or infrastructure).
- Documents updated: `docs/RECEIPTS.md` (Archive exit) and `docs/RECEIPT_EVIDENCE.md` (State and retries).

## Checks
| Command | Result |
| --- | --- |
| Cloud Monitoring `receipt_pipeline` read | Before: `status=2`, `stalled_jobs=1`, `oldest_pending_seconds=36638` |
| Read-only `receipt_jobs` / `receipt_assets` read on the host as `mwagent` | Job and asset state as above |
| HEAD request to the attachment URL | 404 |
| Guarded update | 1 row, now `SOURCE_UNAVAILABLE` |
| Post-check, Cloud Monitoring at 17:37:40 UTC | `status=1`, `stalled_jobs=0` |
| Post-check, host read | Job ended with `detail=RECEIPT_ARCHIVE_UNAVAILABLE` and its URL cleared (now `REJECTED`); the `receipt-held` notice was accepted on Instagram |
| Byte fast checks | pending |
| Chase review | pending |

## Not run
The manual close needed no tests. Code checks are in the Checks table.

## Recovery
Manual close: none needed. The job reached the state the code would have reached on its own. If the borrower resends the image, the new message creates a new job.

## Open questions
Should HTTP 403 also count as gone? It stays retryable for now.

## Remaining work
Deploying the code change to the PROD agent VM needs owner authorization.
