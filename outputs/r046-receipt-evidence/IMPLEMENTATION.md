# R046 receipt evidence — implementation handover

27 September 2026. PROD SQL/agent backend is deployed and verified; DEV AppSheet is validated. The actual outcome is maintained in the [release log](../../Change%20Logs/CHANGE_NOTES_R046_2026-09-27.md) and [single checklist](promotion-checklist.md). PROD AppSheet definitions remain unchanged until the owner reviews an integrated app release containing the next feature.

Historical follow-up: the owner subsequently authorized a one-time backfill on 27 September. **38 originals archived; all 27 posted historical receipts attached in PROD.** One expired unposted review remains unrecoverable. See the [backfill handover](../receipt-backfill-20260927/HANDOVER.md) for scope, verification and recovery. Statements below about no backfill describe the original R046 deployment, not this subsequent operational batch.

## Scope and flow

One private GCS bucket, the existing Debian agent, the existing `mw_agent` database, and three lightweight fields on the existing Payment. There is no DEV VM/agent, second bucket or routine display copy. Existing financial posting/approval, duplicate and notification policies retain their current owners.

Signed ingress or authorized polling freezes message/attachment/sender/capture provenance. Before extraction, duplicate exits or terminal cleanup, the receipt worker preserves the exact original JPEG/PNG/WEBP in a private fsynced spool and conditionally creates GCS evidence. Exact-generation download verifies byte length and SHA-256 before ARCHIVED and spool deletion. Normalized RGB PNG bytes remain only the extractor/deduplication input.

After the existing review record becomes POSTED, the attachment worker freezes expected facts and a stable operation UUID, reads back the payment and calls the dedicated database function. It never calls Payments Add. Native AppSheet then shows the same original in the existing Payment detail. Duplicates, rejected candidates and nonreceipts keep their archive without automatic Payment linkage.

Detailed agent state machines, source semantics, retry limits, configuration and operator recovery are documented in [the agent implementation](https://github.com/welct0407/MW-Integration-Agent/blob/main/docs/RECEIPT_EVIDENCE.md). The actual source commit is pinned in deployment evidence; use that pin for recovery rather than a moving branch.

## Targets and storage contract

| Component | Target |
| --- | --- |
| Bucket | `gs://mw-payment-receipts-prod-508610-n7`, `clever-oasis-508610-n7`, Singapore Standard |
| VM | `vm-mw-credit-agent`, `asia-southeast1-a`, Debian13 |
| Cloud SQL | `appsheet-pg-prod-20260914` / `34.21.174.215:5432` |
| Business | `loan_manager_dev` / `loan_manager_prod`; Flyway V49/V50 |
| Private agent state | `mw_agent`; independent migration V4 |
| DEV OLTP | `500b27b6-884a-41e8-a9ec-df801b0110ad`, `1.000095`; rollback `1.000092` |
| DEV OLAP | `9f3422be-bc87-4a5a-a42a-67528ee80393`, `1.000035`; rollback `1.000033` |

Object key: `receipts/{dev|prod}/YYYY/MM/DD/{receipt_id}/{raw_sha256}.{jpg|png|webp}`. Date uses durable capture time in UTC. The asset ID hashes canonical `["receipt-v1", environment, instagram_account_id, job_id]`; the existing job ID hashes message ID plus attachment index. No borrower name, bank reference, account number or signed URL appears in object names.

The private catalogue keeps the plain key, generation (text), CRC32C, MIME, byte count, raw hash and pixel hash. **Payments.Receipt Image is `//` plus the key.** Native AppSheet root lookup was proven with the synthetic GUI test: a relative path failed; the rooted reference loaded at 720×960. The diagnostic alternate copy was removed. AppSheet reads the same original by key; it does not pin the generation. The immutable generation/hash remains verification and recovery evidence.

Bucket settings: uniform IAM, public access prevented, seven-day soft delete, Google-managed encryption, no retention lock/versioning/lifecycle purge. This is not WORM storage. Code uses `ifGenerationMatch=0` and reconciles uncertain uploads by exact bytes rather than overwriting. One primary receipt per Payment and one Payment per receipt are supported. Secondary evidence/reassignment UI, automatic history backfill, PDF support, bank authenticity verification and automatic purge are outside scope.

## Authentication

The VM's attached `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com` obtains short-lived OAuth tokens from the Compute Engine metadata server with its existing cloud-platform scope. Storage Object User plus Storage Bucket Viewer on the bucket authorize access. Being in the same Google Cloud project is not sufficient by itself. No exported GCS key is installed on Debian.

AppSheet uses separate DEV/PROD connector service accounts and saved stores `MW Receipt Images DEV` / `MW Receipt Images PROD`, with the same bucket-wide roles. DEV/PROD prefixes organize objects; they are not IAM isolation. Keys stay outside Git. A PROD connector credential exposed in diagnostic output was disabled/deleted and replaced; the replacement native connection test and save succeeded. [Connection details](../receipt-storage-design-20260927/APPSHEET_CONNECTION.md).

## Business database and audit

| Field | SQL / AppSheet type | Meaning |
| --- | --- | --- |
| IG Receipt ID | text / Text | Private asset identifier; not an AppSheet Ref |
| Receipt Image | text / Image | Bucket-root native image reference |
| Receipt Received At | timestamp without time zone / DateTime | Capture time in Asia/Bangkok, distinct from bank transfer time |

All three are null for manual/older Payments, or all are populated. No backfill is performed. Ordinary client insertion, substitution and clearing are rejected by a before-row guard. Generic agent model API/DML tools also deny the fields.

`public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)` is SECURITY DEFINER with pinned search path and PUBLIC EXECUTE revoked. Login `mw_receipt_projector` has only CONNECT/USAGE/function EXECUTE, no direct Payments UPDATE. Its password is installed under `/etc/mw-integration-agent/secrets/receipt-projector-password.txt`, root:mwagent0640. Existing loopback Cloud SQL proxy routing is reused.

The function verifies database/environment/key shape, locks the exact Posted Payment and checks borrower, received amount/repayment sum, date, transfer minute, receiving account and bank reference. It updates only the triplet, asserts all other persisted Payment fields remain identical, and appends metadata-only `agent_audit.commits` / `row_changes` in the same transaction. Identical retry returns `already_applied`; a conflicting primary association fails. No financial trigger is disabled. V49 establishes the schema/guard/function; V50 adds the GUI-proven `//` display prefix. Input remains the plain GCS key.

## Private state and failure behavior

V4 adds `runtime.receipt_jobs.source`, `runtime.receipt_assets`, and `runtime.receipt_payment_links`; none is added to AppSheet. Source, captured locator and verified generation/hash are immutable. Link identity and expected facts cannot be edited. Epoch timestamps follow existing journal conventions.

Capture: SOURCE_PENDING → LOCAL_READY → UPLOADING → ARCHIVED, with SOURCE_UNAVAILABLE and INTEGRITY_CONFLICT operator states. Source acquisition stops after twelve failures; retained-spool upload retries back off up to six hours. Spool budget defaults to512MiB and never evicts evidence. Archive outages preserve URL and extraction attempt budget. New dispatch waits for ARCHIVED, while prior UNKNOWN financial reconciliation continues.

Projection: PENDING/UNKNOWN retry only the same deterministic attachment operation; APPLIED stops; CONFLICT requires investigation. There is no automatic repost. Operator-selected preparation may archive evidence without financial writes/notices; reconsideration can use the saved original after Meta URLs expire.

## DEV AppSheet configuration

Both DEV Payments schemas were regenerated. All three fields are non-key, non-label, non-required, read-only and non-searchable, with empty App formulas/initial values. Regeneration's inferred `NOW()` was removed. Receipt Image is PII. Both table storage bindings select `MW Receipt Images DEV`. Offline content caching is disabled; offline startup is unchanged.

OLTP hides IG Receipt ID. The image/timestamp Show_If is `AND(CONTEXT("View") = "Payments_Detail", ISNOTBLANK([Receipt Image]))`. They follow Ref Received By Cash Account and precede related lists in `Payments_Detail`. Bilingual names use the signed-in Partner's Language Preference: English Receipt Image / Receipt Received At; Thai รูปหลักฐานการชำระเงิน / เวลารับหลักฐาน. Existing financial fields and quick edits remain. Evidence controls are absent from the Payment edit form. OLAP hides all three fields.

Later integrated PROD-mapped RCs must include these fields/view settings and select `MW Receipt Images PROD`. No PROD app definition was changed during backend deployment. Capture can accumulate originals and links before the PROD UI is promoted.

## Tests and recovery

- SQL chain through V50, no-op rerun and checksum rejection passed. Tests cover exact attach/retry, role boundaries, bad URL/incomplete facts, Bangkok midnight, rooted image path, one audit and unchanged Payment financial values/repayments/allocations/ledger. Existing database CI completed successfully.
- Final agent suite:259 tests;34 environment-dependent skips on Windows and30 on Debian. Separate real PostgreSQL V4/adapter tests passed, including source/locator immutability, audit and terminal original retention. Archive tests cover lost acknowledgement/restart, corruption, quota, outage and attachment timeout without reposting.
- DEV synthetic `R046-payment` renders and expands the original; the edit form excludes receipt controls. Both saved editors report No issues found. [Full-size image proof](dev-receipt-expanded.png), [Payment detail](dev-payment-review.png).
- Private PROD business and central logical backups passed local restores. [Hashes](prod-backups.json), [restore tests](prod-restore-tests.json). Private dumps/credentials are not published to Git.

Use the clean pinned checkout, existing Flyway manifest/runner and explicit owner/backup references for PROD SQL. Apply compatible business V49/V50 and central V4 before runtime activation. The reviewed deployment script pauses/drains the five existing business timers, verifies a private package/config/catalogue copy, installs the exact commit without dependency changes, runs tests, and checks schema plus metadata-identity GCS upload/readback. Activation sets a new archive cutoff and resumes only previously active timers; ingress/audit relay and prior cutoffs/model settings are preserved.

Rollback pauses/drains workers, restores that verified runtime package/config/catalogue, and resumes recorded timers. Keep additive SQL and all captured originals. Do not restore an old business database over later financial writes. AppSheet rollback does not undo backend data. Unknown outcomes require readback, not reposting. Private credential/dump independent recovery coverage is separate from repository publication. No real customer receipt or PROD financial write was fabricated for testing; first natural post-cutoff processing remains an operational observation.

Delivered: business DEV/PROD V50, central V4 and Debian `817c9b47a574227874cbfb407aaa08794cb50dac`. Archive activation is `2026-09-27T05:43:10.226553+00:00` (12:43 Bangkok), preserved during the recovery-path correction. VM GCS upload/readback and projector connectivity passed; all timers are healthy. [Exact final manifest](release-manifest.json).
