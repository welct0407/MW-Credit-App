# Historical receipt backfill — 27 September 2026

Owner explicitly authorized historical receipt recovery, GCS upload and PROD receipt metadata updates after R046 backend delivery. This is a one-time operational backfill using the deployed V50/V4 archive and attachment functions; no app promotion, migration, financial posting, extraction, review replay or notification was invoked.

## Result

- Inspected all 81 existing agent journal entries before the archive activation cutoff. Official Instagram message reads identified 38 recoverable original images, 42 entries without image attachments, and one unavailable message.
- All 27 POSTED review receipts were recovered, matched to saved pixel hashes, archived and attached to their existing PROD Payments through the guarded projector. No pending/conflicting links remain. A repeat reconciliation applied zero changes.
- The remaining 11 recovered images are retained without automatic Payment association.
- One EXPIRED, unposted review remains unrecoverable: official API returned HTTP 400 on two attempts, with no retained image bytes or ingress source. Its private job identity is retained in the private plan for any later owner-supplied original. No Payment attachment was guessed.
- Every archived object's exact generation, byte count and SHA-256 passed independent download verification. All Payment columns excluding the three receipt fields, all repayment rows and the Payment row count have identical before/after fingerprints.
- No historical conversations beyond the existing agent journal were discovered or interpreted. This covers previously processed agent receipts, not arbitrary earlier manual Payments or inaccessible Instagram history.

## Execution and recovery

Targets: `vm-mw-credit-agent`, project `clever-oasis-508610-n7`; existing loopback proxy to `appsheet-pg-prod-20260914`, business `loan_manager_prod`, private state `mw_agent`; bucket `mw-payment-receipts-prod-508610-n7`.

The standalone agent repository helper `scripts/backfill-receipt-evidence.py` has explicit plan/apply phases. It fixes the population to pre-cutoff journal jobs, checks message/sender/attachment identity and existing pixel hashes, and retains original bytes privately before applying. Apply holds the normal receipt worker lock, conditionally archives bytes, preserves job decisions and uses only the existing receipt projection. The runtime package and service activation were unchanged. API errors are recorded without signed URLs or customer information in public evidence.

Private plan, recovered bytes, financial baseline and detailed results are under the configured agent state directory in `receipt-backfill-20260927/`. The temporary execution script is under `/tmp`; maintained source is in the agent repository. Private originals are intentionally retained as recovery evidence; no automatic cleanup was performed.

Fresh private dumps of both databases passed full local restores before changes: [backup hashes and locations](backups.json). The backup helper starts an isolated local PostgreSQL instance; it does not restore onto PROD. Recovery must preserve subsequent financial activity: keep the additive archive and audit trail, investigate an individual wrong link with an explicitly approved forward correction, and never restore the full pre-backfill database over newer transactions. No link clearing/reassignment or deletion is authorized by this run.

The activation cutoff remains `2026-09-27T05:43:10.226553+00:00`. Receipt, polling and partner-conversation timers remain active. [Aggregate verification](verification.json). AppSheet remains DEV; PROD UI promotion is still pending separately. No new product release number or runtime deployment is required for this operational data batch.

Starting repository pins: AppSheet `89ccabcdfca390a5b57f82833a5c768233231f09`; agent `9dedb2856b43b5831a23443fe5dc363fa86e620a`. Unrelated local work was preserved. Independent/off-device credential and dump recovery coverage is unchanged by this run.
