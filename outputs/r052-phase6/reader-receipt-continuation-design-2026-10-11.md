# Reader recovery and native receipt continuation

Agent A read-only diagnosis/design, 11 October 2026 (Asia/Bangkok). Starting application commit supplied by the coordinator: `a9e7da96`; existing dirty files are preserved. No CI, deployment, infrastructure change, financial write or PROD operation was performed by A. B/F own the subsequently agreed implementation/configuration.

## Observed reader failures

Existing operator access queried Cloud Logging with field allowlists; raw request URLs, SQL, error messages, credentials and business values were not emitted or saved.

- Last-two-day completion-error query returned ten `borrowers_list` / `read_unavailable` / HTTP503 records on old revision `mw-credit-app-read-dev-00014-bmw`, from 2026-10-10T15:35:32.366482Z through 15:59:57.011926Z. Durations were 5259–5310ms. The final request ID was `78cb8a19-f43a-4667-b003-929b71ef6df0`.
- Within the bounded 15:25–16:01Z historical window, all ten failures and five successful reads shared instance prefix `0010dd860741`. Platform request latency agreed with application completion duration. No startup, stderr or system event appeared in that window. The preceding system events were 15:20:16.842484Z and 15:20:21.028248Z. This was an application-generated failure on an existing instance, not a platform no-instance/startup503.
- Nearby successful Borrowers reads took2756ms (15:35:55.082650Z) and539ms (15:36:51.585009Z); Collection took4554ms (15:36:44.090083Z) and942ms (15:36:54.084250Z). These do not prove why other requests failed.
- Current revision `00015-22g` returned47 completion records in the bounded query, all HTTP200, maximum1621ms, spanning2026-10-10T16:15:14.711085Z through2026-10-11T00:35:38.666040Z. Its new stage/category diagnostics have not captured a failure.
- Database error/timeout records in the historical window contained no identifiable reader timeout at the failure timestamps. Other database statement-timeout records existed, but attribution to this reader was not established and they are not evidence of the reader's cause. The reader-identity-only query returned one NOTICE with no text payload.

**Conclusion:** the historical connection-versus-query cause remains unproven. Existing five-second connection/statement bounds are relevant, not authority or evidence to raise limits. No timeout, concurrency, CPU, instance, pool-size, query/index or IAM change is justified by these observations. A successful current read is not proof of incident resolution.

## B implementation and C independent test contract

The source has a separate demonstrable recovery defect: failed ROLLBACK was swallowed and the client was always released for reuse. Correct only that bounded failure handling. Destroy/discard the client after failed rollback or a transport/fatal connection error; successful rollback after an ordinary statement cancellation may reuse it. Apply equivalent failure disposal to the startup identity check. Do not retry business requests automatically or alter response/access semantics.

Installed `pg-pool` emits code-less exact messages for checkout and connection timeouts. Map only the known exact literals to fixed diagnostic categories (`pool_checkout_timeout`, `connection_timeout`); never emit raw messages/causes. The existing nonenumerable `diagnostic` property is correctly read by explicit destructuring in the handler; it is not lost by the rest-body construction.

C must independently verify:

1. Failed read plus failed ROLLBACK discards the client; the next explicit request acquires a fresh client and succeeds. Include mapping-denial rollback failure.
2. Transport/fatal error discards even if a rollback stub appears successful. Ordinary57014 with successful rollback remains reusable; every acquired client is released exactly once.
3. Both code-less installed driver timeout variants produce only fixed stage/category logs; unknown/private error text remains unclassified and absent from logs/body.
4. Public503 body, request-ID correlation, auth rejection, source identity/mapping protections and existing read semantics stay unchanged. No increased limits or automatic retry.

Run affected reader boundary/stage/loan/collection tests and syntax/type checks appropriate to changed files. Do not run CI or a global financial/database suite for this batch. Label synthetic recovery proof separately from the historical incident.

## Current native receipt inventory

A fresh bounded read of `loan_manager_dev` on `34.21.174.215`, instance `appsheet-pg-prod-20260914`, verified current_database/server address before reading. It used REPEATABLE READ READ ONLY, a5000ms statement timeout, at most257 distinct references with a256-reference rejection bound, and an explicit rollback. It emitted counts only:

| Distinct nonblank Uploaded Receipt references | Count |
| --- | ---: |
| Total | 6 |
| Generated PWA references | 4 |
| Native references matching the two existing verified hashes | 2 |
| Unmapped native references | 0 |
| Other unsupported references | 0 |

There is no additional current native reference to reconcile. Do not manufacture a new receipt or alter a financial row for proof. Preserve live coverage of the known two; prove future arbitrary exact-key onboarding with independent synthetic inputs.

The owning inventory identifies DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`, internal `MW-OLTP-DEV-20260919-578763613`. Existing native evidence is `../r052-phase5-completion/native-receipt-mapping.json`. Those two entries bind reference/key hashes, generation, MIME, size and bytes hash, but establish no general name conversion rule.

## Private exact-key catalog

Use a private, version-pinned Secret Manager JSON catalog exposed only to the existing command runtime through `RECEIPT_NATIVE_CATALOG_JSON`. Terraform owns the container, command-SA accessor binding and numeric version reference; payload/version creation stays outside Terraform so raw object names never enter state, plans or Git. No storage list permission, broader prefix, database schema or PROD change is needed. Root/F review the concrete DEV plan before execution.

Catalog contract: schemaVersion1, environment `dev`, exact existing bucket/native object root, entries containing `referenceSha256`, exact private `key`, `keySha256`, `generation`, `mimeType`, `sizeBytes`, `sha256`. Strict field/size/count bounds (64KiB/256 entries), fixed DEV root, no traversal/control characters, positive generation and decoder-supported5MiB media bounds. Duplicate/conflicting entries fail closed; conflicts with the retained two descriptors fail startup. Missing optional catalog retains old behavior; configured-invalid catalog must never be ignored silently. New mappings use the stored exact key, not normalized filenames.

Runtime input remains a reference from an authorized Payment row. Match its hash to the catalog, read exact generation metadata and bytes, verify hash/size/MIME/decode before serving. Unknown reference, wrong generation or changed object stays unavailable. Preserve generated/agent routes and all owner/row authorization.

## Trusted reconciliation procedure and minimum private inputs

The maintained tool accepts private source capture inputs and emits a private runtime catalog plus a sanitized hash-only report. Reject raw input/media/catalog locations within either repository; credentials remain in established external stores. A local file hash alone does not authenticate its provenance.

For a future new reference, the operator supplies:

1. Exact current DEV Payment row and stored `Uploaded Receipt`, captured through the existing private database connection in an identity-checked READ ONLY transaction. Select only the row ID/reference needed; never print names or other fields. Verify the selected row still has that exact reference when reconciling. The existing `database/environments.json` development entry selects the established external password path; no new credentials are needed.
2. Authenticated current DEV AppSheet Payment attachment read for that exact row/reference. Capture actual media bytes privately and provenance tying the verified DEV app/table/row/reference to that response. Follow an observed application attachment link; never construct a filename or substitute a visually similar image. Signed URLs, if present, stay private and are not catalog fields.
3. Exact candidate object key and generation from bounded operator metadata inspection under the fixed native DEV root; generation-pinned bytes must have the same SHA256, size and decoded media type as the authoritative AppSheet capture. A unique lossy basename match alone is insufficient evidence.

The tool validates identity/reference/provenance bindings, hashes the actual bytes itself, rejects absent/ambiguous/mismatched proof, and deterministically generates the private closed catalog. An already established exact descriptor may bootstrap the known two only after its reference/key/generation/content pins are reverified. Any supplied capture trust boundary must be explicit; a tool cannot retroactively prove that arbitrary input files came from AppSheet.

C independent tests: arbitrary exact key differing from underscore conversion; basename collisions; duplicate reference/key conflicts; unknown reference; changed generation/bytes/MIME/size; unsupported/PROD/traversal paths; invalid or oversized catalog; authorization denial causing zero storage access; private strings absent from reports/errors; unchanged generated/agent behavior. Test CLI refusal of repository paths and deterministic sanitized output. Real additional-reference coverage is not claimed when none exists.

## Remaining Phase5/6 closure

The baseline manifest already records implemented/deployed DEV85 management and prior exact SQL/browser proofs. Reuse only valid unchanged-input boundaries. New reader/catalog work needs its own focused independent tests, changed-component DEV delivery/readback and rollback pins. Owner/physical iPhone/iPad/Safari acceptance remains separate; emulation and source inspection do not close it. Do not claim Phase3 production readiness, launch readiness, notification delivery or PROD authorization from this DEV checkpoint. No new business feature gap was established by this bounded review.
