# R052 checkpoint 4B — optional Notes and local manual receipt rehearsal

8 October 2026. Agent A (Astra High). Starting app21eab17 / PM147d2618. Owner accepted the 4A synthetic interaction and requested continuing after seven-channel clarification. This checkpoint extends only the local Selected Charges rehearsal; all seven operational paths remain required per [feature baseline](feature-baseline.md). No financial command is activated in DEV/PROD.

## Deliverable and ownership

B extends only scripts/rehearsal and apps/payment-rehearsal plus necessary disposable tests. C independently checks local HTTP/browser and complete V1–V77 SQL effects. D owns runner support, one coordinated required Test-CI pass, progress/docs/publication. A owns design/review. Preserve the runner-owned loopback/database guard and separation from live-dev bundles. No migrations, grants, Firebase/GCS calls, cloud resources, AppSheet edits, notifications or real financial data.

Owner review: select charges/account, enter optional Notes, select/upload/preview an optional synthetic image, review, confirm, see exact Notes and current attachment, replace/remove image after posting, and observe a receipt-only failure with payment still Posted. Continue demonstrating unknown financial outcomes with the original frozen request.

## Notes and canonical command

New local schemaVersion2 adds exactly notes:string|null and receiptId:UUIDv4|null to the existing strict command. Upgrade local fixture clients; no live backward-compatibility rollout is needed. Existing nine command fields and validations remain. Do not silently ignore unknown fields.

Notes preserve exact Unicode, whitespace and newlines; only empty string becomes null. Do not trim or truncate. Reject NUL (PostgreSQL text cannot contain it). Bound at64KiB UTF-8 for this rehearsal's transport/memory budget, clearly technical rather than an AppSheet business limit; the recorded optional LongText defines no maximum. Size the JSON request limit to safely contain this plus existing payload. Render text escaped, never as HTML; show exact Notes in review/result and persist Payments.Notes. SQL owns generated Repayment Notes behavior. No separate posted Notes-edit operation in4B.

Initial Notes and receipt identity are part of canonical replay identity along with actor and all financial fields. Same request with changed Notes/image conflicts. A known request still reconciles after midnight; all4A retry/unknown/conflict protections remain. Display the local memory journal limitation; no durable-idempotency claim.

## Local upload and reference contract

Allocate/stabilize the candidate payment request UUID before upload. Upload is separate from financial confirmation.

- Accept only PNG/JPEG, at most5MiB actual streamed bytes (not just declared length), matching declared MIME and signature and a successful maintained image decoder check. Apply a bounded decoded-pixel limit (e.g.20megapixels) to the technical rehearsal and disclose it if encountered. Unsupported/oversize/malformed images produce a bounded error; noSVG/HTML/PDF. No claim of malware scanning or production upload readiness.
- Store only under a newly created receipts subdirectory of the runner's verified random temporary root, outside PostgreSQL's data directory and outside repositories. Resolve/check that directory before operations; reject reparse/symlink escape where applicable. Never derive a path from the uploaded filename or accept a filesystem path/object URL from the client.
- Server assigns UUID filename/extension and immutable descriptor: receiptId, SHA-256, MIME, byte size, actor and candidate payment request binding. File bytes cannot be overwritten through that ID. Descriptor ownership is checked on attachment and retrieval. The active local server has only its trusted synthetic actor.
- Database image reference is generated as local-rehearsal/<uuid>.<ext>, not a client path. This intentionally exercises V52 with a LOCAL stand-in; it is not claimed to render through AppSheet or map to GCS. Never print absolute storage paths in browser responses.
- Local retrieval accepts only an existing UUID lookup, enforces same-origin/loopback Host and scope, no-store and nosniff, and sends the validated image MIME. Original filenames may be omitted; do not persist unnecessary names.
- Upload success does not post money or create Payment rows. Upload errors block confirm until the owner explicitly retries or removes the selected receipt and proceeds without it. Do not silently drop a failed image. Preview comes from the successfully accepted descriptor; explain “local rehearsal receipt, not uploaded to GCS”.
- Include original receiptId and resolved immutable hash/reference in the server's command identity. Resolve/validate it before posting; unavailable/wrong-actor/wrong-request reference rejects before any financial effect. SQL inserts Notes and Uploaded Receipt with the existing Processing Payment; V52 supplies Uploaded Receipt At. No client timestamp.
- Abort/unmount/object-preview replacement must release browser resources. No browser disk business cache; local files are temporary runner-owned artifacts. Retain replaced/removed files until controlled runner cleanup; no automatic live-style object deletion is inferred.

Using a maintained image decoder may require a bounded local dependency/tooling addition; B should report actual availability and C verify malformed inputs rather than accepting only an extension or inventing validation evidence.

## Posted attachment edits are a separate operation

After a known Posted receipt, replace/remove its current manual image through a dedicated local metadata operation. New uploaded image is bound to the same payment request. Validate synthetic actor/payment ownership and known posted scope. Never expose arbitrary Payment field edits.

Use compare-and-set expectedReceiptId with newReceiptId|null. Update ONLY Payments.Uploaded Receipt; V52 updates its timestamp. Same current target is a successful no-op with timestamp unchanged; stale expected reference conflicts. Parameterized SQL and row locking/conditional update prevent overwriting a concurrent replacement. Metadata response reports current reference/time separately from financial status.

Keep the ORIGINAL submitted receipt/Notes identity in the memory journal; replacement cannot rewrite it. Financial reconciliation checks the original financial fields and unchanged Notes, while returning CURRENT attachment separately. A receipt-only failure must not relabel a known committed payment failed, unknown or unpaid. Refresh attachment state after lost response; never call financial confirm to retry an upload/edit. Do not imply the original image remains current after replacement.

Protected agent fields Receipt Image, Receipt Received At and IG Receipt ID are untouched. Manual upload neither invokes OCR/agent intake nor creates a second payment. One current manual image only; no multi-image/history product.

## Independent acceptance

C uses fullV77 disposable SQL, synthetic files and browser fixtures:

- Notes absent/empty/Thai/whitespace/newline/HTML-looking text roundtrip exactly; NUL and technical overlimit fail without truncation. Review and posted result display the same value, child Notes propagation governed by SQL. Changed Notes with same requestID conflicts.
- Valid PNG/JPEG upload/preview/retrieval; wrong MIME, corrupted decode, oversize streamed body, pixel limit, traversal/absolute path/unknown ID, wrong actor/request and external origins rejected. Files stay in owned temporary directory; no outbound calls or path disclosure.
- Initial uploaded reference gets V52 server Bangkok stamp; unchanged reference keeps stamp, replacement advances, removal clears reference and time. Use deterministic checks avoiding same-clock assumptions. Same-target retry is a no-op; stale CAS cannot overwrite.
- Every replace/remove/retry preserves financial receipt status/amount, allocations/repayments/cash-ledger identities and amounts, and protected agent evidence. Test with existing synthetic agent evidence using the maintained guarded fixture procedure, never disable protection triggers.
- Initial receipt changed on same command conflicts. Upload failure before confirm creates zero financial effects; owner can explicitly remove/retry. Attachment failure after successful payment leaves Posted and the prior current image. Lost attachment response resolves by refreshing metadata without financial re-post.
- Mobile/desktop EN/Thai: optional inputs, preview, full review, exact Notes/result, replace/remove, offline/timeout, clear error recovery and4A financial unknown/conflict regression. Show bounded local synthetic label throughout.
- Maintain actual DB versus local file/protocol simulation evidence distinctions. Run the required database CI once after the coherent runner/test changes; no cloud deployment.

## Future durable-command and GCS contract (design only)

These gaps prevent a live-complete financial feature; do not implement an unapproved table or reuse another workflow's grants in4B.

A durable command record must preserve request UUID, schema version, immutable canonical payload/hash (including submitted Notes and initial attachment identity), actor binding and payment identity plus initial committed outcome. Write it atomically with financial posting. Retain identity/tombstone through allowed Payment correction/deletion. Current evidence changes are separate revisioned/CAS metadata operations, not mutations of the original financial command. Request lookup must distinguish pending/committed/rejected/unknown; no uncommitted pending state is durable. First investigate compatible existing governed journal ownership; if absent, propose the minimal new schema with retention/privacy and cross-AppSheet effects for explicit owner approval. Memory journal/files do not establish crash recovery.

Future storage reuses private mw-payment-receipts-prod-508610-n7. DEV and PROD object/reference bindings remain isolated; the bucket's name conveys no PROD authority. Preserve manual versus agent ownership, one-current-image behavior and existing V52 timestamps. The AppSheet relative SQL image reference differs from normalized GCS object key; before live access, pin a reversible mapping adapter and prove PWA-upload/AppSheet-display and AppSheet-upload/PWA-display in an authorized synthetic DEV test. Do not substitute raw keys or public URLs into existing fields.

Server-generated immutable object identity and verified bytes/generation must be bound to actor/environment/payment request. No bearer credential or unrestricted client path. Exact authenticated upload/read mechanism, limits and IAM scope are future reviewed choices; no new bucket/public ACL or assumed permission inheritance. Object upload and SQL attachment cannot be one atomic transaction: use explicit uploaded-but-unattached/attached/failure states, safe retries and bounded orphan recovery without posting again. Do not delete replaced objects or agent originals under an invented cleanup policy.

Manual receipt and Notes support are required capabilities with OPTIONAL individual input. Complete the first Selected Charges field/evidence flow in Phase4; remaining six entry/lifecycle paths reuse it in Phase5, with First-day Auto event dependencies in Phase8. Phase1/fullparity and Phase2 native acceptance gaps remain open; Phase7 stays post-go-live.

## Stop

Publish local source, synthetic evidence and updated progress, present the local4B preview, and wait for owner validation. No live upload, durable journal migration, financial grants or all-channel implementation follows automatically from this checkpoint.


### Local format and restart limitations

PNG/JPEG,5MiB and20megapixel limits are explicit technical bounds of this local rehearsal, not recorded AppSheet restrictions. HEIC/HEIF and direct iPhone camera selection/conversion remain future compatibility tests; unsupported input must receive a clear message, never be silently omitted or claimed covered by desktop PNG evidence. No new format implementation is required in4B.

Bind each upload response to its active candidate request and selection generation. Late upload success after removal/reselection/navigation cannot restore an old image or permit the wrong attachment. Pending upload must settle or be explicitly removed before confirmation. Local receipt ownership/descriptors and command journal are memory-only; a server restart invalidates their lookup even if temporary file bytes remain for controlled cleanup. Do not promise restart recovery, persist business data in browser storage or adopt an orphaned file through a user-provided path.
