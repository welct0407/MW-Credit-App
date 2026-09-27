# Original receipt evidence

Owner scope, 27 September 2026: deploy the receipt archive and SQL backend to the existing PROD Debian VM; keep AppSheet definition changes in DEV until the next integrated app review. There is one bucket and no DEV agent. Deployment results are recorded in the [change log](../Change%20Logs/CHANGE_NOTES_RECEIPT_EVIDENCE_2026-09-27.md).

## Data flow and identity

The existing signed ingress/polling paths freeze source message, attachment index, sender, sent/captured timestamps and available conversation/attachment IDs in `runtime.receipt_jobs.source`. The receipt worker archives every admitted new image before extraction, duplicate exits or terminal cleanup. Existing intake, borrower eligibility, financial rules, review, notification and UNKNOWN-posting policies remain in force.

`receipt_archive.py` derives a stable SHA-256 asset ID from environment, Instagram account and job ID. It downloads bounded original JPEG/PNG/WEBP bytes, validates the image, writes a private fsynced spool file, then conditionally creates:

`gs://mw-payment-receipts-prod-508610-n7/receipts/{dev|prod}/YYYY/MM/DD/{receipt_id}/{raw_sha256}.{jpg|png|webp}`

The date is durable capture time in UTC. Original bytes are preserved; normalized RGB PNG bytes remain only the extractor/deduplication input. `receipt_storage.py` requests a short-lived access token from the VM metadata server for its attached service account. Bucket-level Storage Object User and Storage Bucket Viewer authorize GCS access; being in the same project is insufficient. No exported GCS service-account key is installed on Debian.

Uploads use `ifGenerationMatch=0`. An uncertain acknowledgement reconciles the existing object; exact-generation download, byte length and SHA-256 must match. Only a durable ARCHIVED record permits spool deletion. AppSheet and archive reference the same object; no regular display derivative is created.

## State and retries

Independent immutable migration V4 adds `runtime.receipt_assets`, `runtime.receipt_payment_links` and the source column. These remain private to `mw_agent`, outside AppSheet. Source, captured locator/hash/generation and Payment association are immutable. State timestamps use Unix seconds consistently with the existing journal adapter; generation is text to avoid integer precision loss.

Capture states: SOURCE_PENDING → LOCAL_READY → UPLOADING → ARCHIVED. Source acquisition stops after 12 failed attempts with SOURCE_UNAVAILABLE. Retained-spool upload failures retry with exponential delay up to six hours. Integrity conflicts stop for operator investigation. The default spool budget is 512 MiB; no existing evidence is evicted to make room. Archive failures preserve the source URL and do not consume extraction attempts. New financial dispatch waits for ARCHIVED; reconciliation of already-dispatched payments continues.

The current implementation supports one primary receipt per Payment and one Payment per receipt. Duplicates/rejected/nonreceipt candidates retain their archive but are not automatically linked. There is no automatic historical backfill, secondary-evidence UI, reassignment or purge. Operator `receipt-prepare` can archive an explicitly selected candidate without posting or notification; `receipt-reconsider` can reuse an archived original when its Meta URL has expired.

## Payment projection

After the existing review record becomes POSTED, `receipt_projection.py` saves immutable expected facts and a deterministic operation UUID, performs fresh payment readback, and calls only `public.attach_payment_receipt_evidence` through `mw_receipt_projector`. The projector has function EXECUTE, not direct Payment DML. It connects to PROD through the existing loopback Cloud SQL proxy; its password is `/etc/mw-integration-agent/secrets/receipt-projector-password.txt`, root:mwagent 0640.

Business Flyway V49/V50 lock the exact Posted Payment and verify borrower, amount/repayment total, date, transfer minute, account and bank reference. Only `IG Receipt ID`, `Receipt Image`, and `Receipt Received At` change. Other persisted Payment values must remain identical, or the whole attachment rolls back. Audit rows contain only evidence metadata. Repeating the same triplet is a no-op. Conflicting attachments fail closed.

`Receipt Image` is `//` plus the GCS object key: the prefix is required by native AppSheet bucket-root lookup, verified in the DEV GUI. `Receipt Received At` is capture time converted to Bangkok wall time, not the bank transfer time. Generic model API/DML tools cannot edit these fields. A projection timeout retries only the attachment with the same operation ID; it never repeats Payments Add. States PENDING/UNKNOWN retry, APPLIED is done, CONFLICT requires review.

## Deployment and recovery

Use reviewed `scripts/deploy-receipt-evidence.py` phases on the exact VM. `freeze` stops the five existing business timers, drains running workers, and verifies a private package/config/catalogue copy under `/var/lib/mw-integration-agent/rollback`. Ingress and audit relay remain active. Apply the pinned additive business and central migrations before package activation. Install the private projector credential separately; never include it in source or shell command text.

`install --commit SHA` requires the paused checkout at that SHA, installs without dependency changes, and runs the suite. `activate --commit SHA` checks schema/identity, proves metadata-token GCS upload/readback with a synthetic object, enables catalogue revision 23 and archive configuration with a fresh UTC cutoff on first activation (preserving an existing active cutoff on updates), and resumes only the previously active timers. Existing receipt/reply/notification cutoffs and model settings are preserved. Do not reset the archive cutoff on ordinary updates.

For rollback, pause/drain the same workers, restore the verified private package/config/catalogue, and resume the recorded timers. Keep additive V49/V50/V4 and all captured evidence; do not restore an old database over later financial writes. Resolve UNKNOWN payment/projection outcomes by readback, never by reposting. Restoring GCS soft-deleted evidence or correcting an immutable association needs explicit operator investigation. Re-enable only after relevant checks pass.

## Verification boundaries

Automated checks cover lost upload acknowledgement/restart, exact-byte preservation, corrupt spool, quota/source conflicts, archive outage without extraction/URL loss, attachment timeout without financial replay, and model-tool protection. A disposable PostgreSQL integration test exercises V4 with the actual adapter, audit and immutability guards. Business SQL tests verify idempotency, least-privilege projection, Bangkok midnight, rooted image paths and unchanged financial rows. DEV native image viewing is separately verified. No real customer receipt or production financial transaction is fabricated for deployment verification.
