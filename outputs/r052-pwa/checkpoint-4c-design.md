# R052 checkpoint 4C — durable command approval package

8 October 2026. Agent A (Astra High). Starting app `b593299`, PM `9560c36e`. The owner accepted the local 4B total/scroll refinement and authorized continuing. This checkpoint supplies reusable pure code and a concrete design for review; it does not create a table, reserve a migration number, grant access, upload to GCS or activate financial commands. The accepted 4B preview remains unchanged.

## Scope and evidence

- Existing `Payments`/request-token records do not retain the original request after correction/deletion. The full V1–V77 4A/4B disposable evidence demonstrates this gap; a surviving Payment row or a process-memory map cannot establish durable replay safety.
- Canonical app migration `V33__agent_transaction_audit.sql` defines append-only `agent_audit.commits`, but its operation entry enforces `mw_reviewer_dml` session ownership and reviewer/audit semantics. The receipt projector is another narrowly governed actor. Do not repurpose that journal or assume its roles are PWA authority. D's bounded V1–V77 table-name scan found no other relevant command journal; this is source evidence, not a fresh live catalogue audit.
- V51 governs Selected Charges, its comma-separated immutable keys, C-collation ordering, trigger-driven posting and scope guards. V52 governs only the manual image reference/time. V49/V50 protect separate agent receipt fields/projector and do not establish manual-image bucket-root compatibility.
- Existing R047 synthetic evidence maps a native relative SQL reference to a normalized object under the AppSheet DEV folder. These particular examples do not define a safe general Unicode/path conversion. D owns the precise evidence and future storage permission plan.

All seven receiving paths remain in the [feature baseline](feature-baseline.md). This checkpoint covers the shared command identity foundation with Selected Charges as the first candidate only. Phase1 parity, Phase2 acceptance gaps, other channels, events and later production readiness remain open. Metabase enhancements remain after go-live.

## Reusable code now, without persistence

B owns `services/contracts/payment-command.mjs` and focused unit tests. No import into the live PWA/API or replacement of the guarded 4B prototype. No cloud SDK, file storage, database adapter or schema fixture is needed.

Exports: `canonicalCommand`, `canonicalActor`, `canonicalReceipt`, `commandIdentity`, `classifyReplay`. These validate data shapes; none verifies a Firebase token, grants business authority or proves storage ownership.

- Command strict fields: schemaVersion=3, requestId, borrowerId, selectedChargeIds, cashAccountId, paymentDate, amountReceived, paymentMethod, allocationMethod, notes, receiptId. Request/receipt IDs use canonical lowercase UUIDv4. Bank Transfer and Selected Charges are the only accepted methods in this version.
- Business IDs: 1–256 UTF-8 bytes, no NUL/CR/LF or surrounding whitespace. Selected keys additionally contain no commas or whitespace anywhere (V51 encoding restriction), are unique, number 1–100 and sort by UTF-8 byte order. Do not locale-sort or normalize stored keys.
- Payment date is a real canonical YYYY-MM-DD calendar date, minimum year0001. This pure parser does not impose today on a known retry. Amount is a canonical positive whole-baht decimal string no greater than92233720368547758, never a floating-point number. New-command business rules remain SQL-owned.
- Notes preserve exact Unicode/whitespace/newlines; only empty string becomes null. Reject NUL, malformed UTF-16 surrogates and more than64KiB UTF-8. Limits are transport/technical constraints, not newly asserted AppSheet business rules.
- Trusted actor strict fields: issuer, subject, partnerId, loginEmail. Issuer/subject nonblank and bounded1024/128 UTF-8 bytes; Partner key follows ID rules; loginEmail trim/lowercase then at most320 UTF-8 bytes (raw input at most1024). The future verified-token/current unique Partner mapping supplies these values. Do not accept them from the financial request body.
- Trusted receipt descriptor strict fields: receiptId, sha256 (lowercase64hex), mimeType (image/png or image/jpeg), sizeBytes (integer1..5242880), storageReference (opaque nonblank string <=2048 UTF-8 bytes, no NUL/CR/LF). Descriptor receiptId must match the command, or both are null. It is resolved by a future authorized storage adapter, never by trusting a client's reference/hash. This module intentionally does not convert AppSheet paths or infer bucket-root support.
- Reject unknown keys and unpaired UTF-16 surrogates in all strings. Return independent deeply frozen canonical values. Fixed ordered UTF-8 JSON is `{contractVersion:1,command,actor,receipt}`. `commandIdentity` returns requestId, canonicalJson and SHA-256. This v3 identity includes requestId; it does not silently reinterpret historical 4A/4B hashes.
- Stored pure replay input: requestId, canonicalJson, payloadSha256, outcome. Outcome strict fields: status, paymentId, code, recordedAt. Posted requires a payment key and null code; rejected requires null payment key and a nonblank bounded256-byte code. recordedAt is a valid UTC ISO timestamp with zero to three fractional digits. It records the transaction's timestamp, not a claim of the exact wall-clock commit instant.
- Null stored record means unresolved, never safe-to-resubmit with a new key. Corrupt stored shape/hash means invalid_stored_record, not missing. Different request/canonical identity means conflict. Exact identity returns an immutable copy of originalOutcome. Current Payment correction/deletion/receipt availability is deliberately outside this classifier and cannot rewrite the original outcome.

C independently tests exact Thai/whitespace preservation, malformed Unicode, literal IDs and C-order, byte boundaries, receipt/actor mutation, hash corruption and original-outcome retention with separately modelled changed/missing current sources. These tests establish contract behaviour only; no durable database/concurrency claim follows.

## Smallest proposed schema — approval required

Propose **one new table** `public.pwa_payment_commands`, no changes to existing tables and no new schema namespace. It is a final-outcome journal, not a mutable job queue or receipt catalogue. No migration number is allocated here.

| Column | Proposed type / constraint | Purpose |
| --- | --- | --- |
| request_id | uuid PRIMARY KEY; UUIDv4 contract | Environment-database-wide command identity |
| contract_version | smallint NOT NULL, initially CHECK=1 | Canonical envelope/hash version |
| actor_issuer | text NOT NULL | Immutable verified identity issuer |
| actor_subject | text NOT NULL | Immutable Firebase UID/subject |
| actor_partner_id | text NOT NULL | Partner snapshot resolved at execution |
| actor_login_email | text NOT NULL | Normalized original actor used for Created By |
| canonical_json | text NOT NULL | Exact ordered UTF-8 JSON identity including original Notes/receipt descriptor |
| payload_sha256 | text NOT NULL, lowercase64hex | Corruption/conflict check against canonical bytes |
| outcome | text NOT NULL CHECK IN ('posted','rejected') | Original final result, never current source status |
| payment_id | text NULL UNIQUE | Posted deterministic `pwa:` + request UUID; rejected NULL |
| rejection_code | text NULL | Rejected allowlisted sanitized business reason; posted NULL |
| recorded_at | timestamptz NOT NULL DEFAULT transaction_timestamp() | Durable row's transaction timestamp |

Proposed constraints also enforce coherent posted/rejected fields, canonical JSON object/contract/request/actor agreement, canonical JSON at most524288 UTF-8 bytes and bounded text fields, and SHA-256 agreement using the supported PostgreSQL byte digest primitive verified in the future disposable implementation. `canonical_json` is text so JSONB reserialization cannot silently change its digest. Reject invalid rows rather than attempt repair. No foreign key or cascade to mutable Payments/Partners: original identity/outcome must survive their subsequent correction or deletion. Execution validates their current existence/authority. Indexes: PK and unique nonnull payment_id are sufficient initially; no speculative reporting index.

No runtime UPDATE, DELETE or TRUNCATE. An append-only guard rejects those operations, including direct accidental DML; only the controlled migration owner can change the guard under normal governance. No routine TTL or cleanup job: deleting request identity can permit replay. Keep original canonical payload/hash/outcome together until a separately reviewed retention/minimization design preserves an equally strong tombstone. This is the proposed application retention behaviour, not a legal compliance claim. The table is not added to AppSheet or exposed to ordinary read APIs.

## Proposed transaction and replay boundary

The future authenticated command service re-verifies owner UID/issuer/email, current grant and unique Partners.Login Email mapping on every submit/status, including replay. Cross-actor request IDs reveal no historical body/result. No grant derives from possessing a UUID. Existing reader service/role remains unchanged.

1. In one database transaction, acquire a transaction-scoped advisory lock in a dedicated command namespace derived from the request UUID, before journal lookup. Every command writer uses the same routine. Hash collisions merely serialize unrelated commands; PK remains the uniqueness backstop. Bounded lock/statement timeout produces unavailable/unknown, not a fresh replacement command.
2. If a journal row exists, compare immutable canonical identity. Return conflict for changed identity or original outcome for an exact retry. Do not rerun posting, revalidate old receipt bytes or enforce today's date on this existing command. Current authorization is still mandatory. Read the current Payment/attachment separately and label it unchanged/changed/missing/unavailable; original Posted remains original Posted.
3. If absent, validate new-command Bangkok date, current actor/account, borrower/charge scope and trusted receipt descriptor. Reuse existing `cash_account_holder` and V51 command/trigger path; insert one Processing Payment with deterministic payment_id, server-derived Created By, exact Notes and optional manual reference. Never directly manufacture Repayments, allocations or balances. Existing financial locking/order owns AppSheet concurrency; the new outer command lock is not a substitute.
4. Read the trigger-completed initial Posted result, then insert the immutable posted journal row in the SAME transaction. Commit once. Before-commit failure rolls back both; after-COMMIT response loss is unknown to the browser until journal reconciliation. The journal and Payment cannot be committed in separate transactions.
5. An explicitly classified business rejection may use a savepoint: rollback all financial work to that savepoint, then insert a rejected journal row and commit the outer transaction. Only typed, reviewed deterministic rejection reasons qualify. Unknown SQL exceptions, deadlocks, serialization failures, connection loss and commit uncertainty must not be converted to durable rejection; abort and report unavailable/unknown. A changed/recovered intent after a recorded rejection requires a new explicit command from refreshed selection.

No durable pending row is needed for this first synchronous design. Uncommitted work is invisible. Status with no row remains outcome-not-established; an in-flight transaction can still commit. Safe explicit retry means the SAME UUID and canonical body enters the same lock boundary. It never means generate a new ID automatically. Browser financial commands remain online-only; no background sync or silent retries.

Proposed API after approval: authenticated POST command and scoped GET status with strict payload/response schemas and existing sanitized request references/no-store/CORS. Status exposes originalOutcome and a separate currentSource projection. Attachment replacement/removal remains a separate compare-and-set operation on Uploaded Receipt, V52-owned time, never a financial resubmit or journal rewrite. Absent image bytes are a receipt problem, not proof money failed.

## Receipt ownership and compatibility boundary

Reuse the existing private bucket `mw-payment-receipts-prod-508610-n7`. No new bucket, public ACL, reader-role expansion or delete/list permission is proposed. D's recorded current binding grants the original infrastructure runtime objectUser only under `mw-credit-app/dev/`; the read runtime has no receipt storage grant. Neither establishes manual upload authority.

Known native manual path evidence is relative SQL `manual-receipts/dev/...` with object storage under `appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/...` for the recorded examples. The proposed new path must be a verified subset of that existing DEV manual folder, using generated ASCII UUID components so normalization cannot introduce filenames/collisions. Candidate child `pwa/<requestUUID>/<receiptUUID>.png|jpg` is a proposal, not a verified binding. Do not use V50's agent-only `//` convention without manual-field proof. Reject unresolved legacy references rather than guess.

Before any live upload, verify the current DEV folder/binding and a scoped synthetic SQL-reference -> object -> AppSheet manual-image render -> PWA authorized-read roundtrip. That future test writes a synthetic image/reference and therefore requires the exact approved DEV scope; no such test occurs in4C. Preserve original AppSheet-native references and protected agent fields.

Future adapter requirements: server-generated immutable key, trusted owner/request binding, image decode/size/pixel policy, digest, MIME, actual bytes and immutable GCS generation. Create-only generation precondition; exact-key authorized get; no overwrite/list/delete. A server-owned object metadata envelope can retain receipt UUID/request/actor identity/digest for restart recovery, but must be verified against the object's generation and bytes and must not rely on caller-written metadata. A second receipt table is not proposed now. Client gets only scoped receipt IDs/preview responses, never raw bucket credentials or arbitrary key access. HEIC/iPhone camera conversion remains an explicit compatibility gap; PNG/JPEG rehearsal limits do not establish full AppSheet parity.

Upload precedes confirmation and succeeds independently. SQL cannot atomically commit a GCS write. Failed upload prevents attaching that receipt; successful orphan uploads remain private and are not automatically deleted. If the object becomes unavailable after validation or after posting, preserve financial outcome and report receipt unavailable. Original journal descriptor remains immutable after attachment replacement/removal. Future retention/cleanup requires its own reference-aware policy; no bucket cleanup job is implicit.

## Authority, event ownership and rollout

A future separate command runtime/DB identity is preferable to expanding `mw-credit-app-read-dev`. Proposed application grant is EXECUTE only on narrowly reviewed command/status/manual-attachment routines, with PUBLIC execution revoked; a non-login function owner receives only required underlying rights. SECURITY DEFINER code must pin search_path, qualify names, validate intended database and allowed session identity and derive business fields. Firebase verification remains the API's responsibility; merely passing actor strings to SQL is not authentication. Exact role/function ACLs, supported privileges and trigger dependencies must be enumerated by the approved implementation before any grant. No reuse of reviewer/projector roles.

Database triggers continue to own financial effects. Direct SQL does not establish delivery of AppSheet bots. The journal's posted request UUID can be a stable future event identity, but this table is NOT an outbox/delivery receipt and has no dispatch process. Before live payment activation, a separately reviewed event consumer/deduplication contract must preserve recorded actor -> Partner -> distinct delivery recipients, owner-only DEV routing, existing event conditions and no duplicate AppSheet/PWA delivery. No notifications/schedulers are enabled in4C. Receipt-only edits must not become financial events.

Approval proposal: authorize implementation of `public.pwa_payment_commands` with the fields/constraints above, its UPDATE/DELETE/TRUNCATE protection using `public.guard_pwa_payment_commands_immutable()` and triggers, plus `public.pwa_submit_selected_charges_v1(canonical_json text)` and `public.pwa_command_status_v1(request_id uuid, actor_issuer text, actor_subject text)` for full-history DISPOSABLE rehearsal first. The submit routine accepts only server-canonical bytes, checks the envelope and writes the final journal in its caller transaction; status is identity-scoped. These are proposed names/signatures, not existing objects. No live grants are part of this approval; deployment role/function ownership and exact ACLs will be a separate concrete plan. The manual-attachment routine, event delivery and live GCS mapping remain future scope, not unspecified additions bundled into the table approval. This approval would not authorize DEV schema application/financial endpoints, GCS IAM/uploads, AppSheet edits or production migration. Do not reserve a migration number until approval and coordinated current-history lookup.

Rollback/dependencies: additive table/routines leave AppSheet V77 interfaces unchanged. Application rollback disables the command route/identity but retains journal rows and existing Payments; dropping the journal would discard retry protection. No down-migration/financial delete is a rollback. Preserve the tested schema and command version support across service rollback, reconcile unknown in-flight requests, and use governed correction/reversal for real financial changes. Later schema removal would need a separate retention and replay-safe retirement plan.

## Next evidence and stop point

Current4C: B pure tests, C independent contract review, A source review, D scoped mapping/access evidence and publication. No durable schema or concurrency proof is claimed.

After explicit schema approval: full V1–V77 plus the approved new migration on a fresh disposable database; atomic commit/journal success, before/after-commit disconnect, concurrent identical/different payload, different actors, same charges with different keys and AppSheet contender, restart replay, midnight replay, correction/delete retention, savepoint rejection, corrupted journal rejection, receipt loss and metadata-only update. Verify append-only privileges and both-app compatibility; required database CI then applies. No live business records needed for these tests.

Owner review at4C is the concrete schema/access/receipt-compatibility proposal plus tested reusable identity/replay code. Report actual test evidence separately when complete. Do not describe4C as durable runtime delivery, all seven channels complete, Phase2 closed or production ready.
