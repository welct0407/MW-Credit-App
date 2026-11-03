# Change notes — receipts alert from an unreachable Instagram image, 4 November 2026

## Purpose
Clear the Grafana `receipts` Degraded alert, which had been firing since 14:21 Bangkok on 3 November 2026. One PROD receipt job could never archive its image. The owner approved closing it ahead of the automatic limit.

## Changes
- Diagnosis: `receipt_pipeline` showed `status=2`, `stalled_jobs=1`, `pending_images=1`. Receipt job `54fd41a3…` sat in `PENDING` / `RECEIPT_ARCHIVE_PENDING`. Its evidence asset was `SOURCE_PENDING` with 7 failed attempts, `last_error_code=RECEIPT_DOWNLOAD_FAILED` and no spool file. The Instagram attachment URL returns HTTP 404, so the image is gone. The reviewers' archive-pending notice had already been accepted on Instagram.
- Without intervention, `Archive.capture` stops only after the 12th attempt, about 01:40 Bangkok on 5 November, because of the six-hour backoff.
- PROD `mw_agent` runtime write, owner-approved: one guarded `UPDATE receipt_assets SET archive_state='SOURCE_UNAVAILABLE'` for receipt `03ee34b2…`. It was guarded on the expected job, `SOURCE_PENDING`, no `raw_sha256`, no spool file and a fresh 404. It ran as `mwagent` through the agent's journal adapter inside an `audit.activity('receipt_evidence', action='UPDATE')` operation. This is the same terminal state the code sets itself.
- On its next run the worker moves the job to `REVIEW` / `RECEIPT_ARCHIVE_UNAVAILABLE`, clears its URL and sends the standard hold alert asking the borrower to resend. No payment, review or notice row was changed by hand.
- No code or configuration change.

## Checks
| Command | Result |
| --- | --- |
| Cloud Monitoring `receipt_pipeline` read | Before: `status=2`, `stalled_jobs=1`, `oldest_pending_seconds=36638` |
| Read-only `receipt_jobs` / `receipt_assets` read on the host as `mwagent` | Job and asset state as above |
| HEAD request to the attachment URL | 404 |
| Guarded update | 1 row, now `SOURCE_UNAVAILABLE` |
| Post-check, Cloud Monitoring at 17:37:40 UTC | `status=1`, `stalled_jobs=0` |
| Post-check, host read | Job ended with `detail=RECEIPT_ARCHIVE_UNAVAILABLE` and its URL cleared (now `REJECTED`); the `receipt-held` notice was accepted on Instagram |

## Not run
No tests: there was no code change.

## Recovery
None needed: the job reached the state the code would have reached on its own. If the borrower resends the image, the new message creates a new job.

## Open questions
None.

## Remaining work
None. The download failure is not counted under `stalled_jobs` until the attempt limit, so an expired Instagram link keeps the alert up for about a day. Making a 404 terminal on the first attempt would be a separate code change for the owner to request.
