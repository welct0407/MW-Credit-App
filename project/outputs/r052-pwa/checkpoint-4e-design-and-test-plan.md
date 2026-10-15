# R052 checkpoint 4E — authenticated command API candidate and executable test plan

8 October 2026. Starting app `30b9ddc`, PM `fd0f5146`. Agent A: GPT-6 Astra High, design and executable test plan. B: Astra Medium, implementation. C: `agent_c_testing_sol`, GPT-6.1 Sol Medium, independent execution and gap reporting. D: `agent_d_infrastructure_sol`, GPT-6.1 Sol Medium, tooling/authority proposal/publication. R052 remains Open.

## Authorized deliverable and boundaries

Build an isolated local HTTP candidate on the approved/tested V78 journal. Live DEV and PROD remain V77. No migration/schema change, runtime role/grant, Firebase/Cloud Run/Hosting deployment, GCS write, notification or financial endpoint activation. Preserve the accepted4B preview and all existing read/PWA entrypoints. The seven receiving paths remain required; this candidate exposes only the first Selected Charges command.

B owns new `services/payment-command/{principal,store,handler}.mjs`, focused tests and `tests/integration/Run-PaymentCommandApi.ps1`. Equivalent clearly named files in this isolated folder are acceptable if recorded in the handoff. There is no production launcher, ambient DSN, emulator/mock-auth runtime switch or import from the live read service/PWA. The API store accepts only the runner-owned disposable V78 target with mandatory expected data directory. Factories are reusable candidate code, not a live deployment.

## HTTP and authentication contract

- POST `/api/payment-commands`: exact existing pure v3 command body, including optional Notes and receiptId. No actor, Partner key, issuer, hash, raw receipt reference or status may be supplied. GET `/api/payment-commands/:requestUUID` reads status only. No query parameters or alternate verbs/routes. No financial GET side effects.
- Reuse `createFirebasePrincipalVerifier` with identityMode fixed to uid-pinned and an explicitly required owner UID. Retain exact DEV project/issuer, Google provider, verified owner email, expiry/time/tenant checks and `verifyIdToken(token,true)` revocation request. No email-bootstrap fallback. Tests inject only the cryptographic-verifier seam; no deployed fake authentication or real owner credentials are used.
- Fresh verification on every submit/status. Construct issuer from the verified project's fixed Firebase issuer; subject/email only from the verified principal. Resolve the current unique normalized Partners.Login Email to its Row ID within the guarded transaction. Actor in canonical identity is entirely server-derived. Missing/ambiguous mapping denies without financial SQL. SQL's own actor check remains in place.
- Strict disposable configuration: exact loopback browser origin(s), no wildcard/suffix/reflection. Unknown supplied Origin is403; absent Origin is allowed for authenticated non-browser callers. OPTIONS permits only GET/POST and Authorization/Content-Type for an allowed origin. No credentialed cookies. The local test server binds127.0.0.1 only.
- Authenticate before reading command bodies or accessing the DB. Require application/json, allowing explicit UTF-8 charset; reject unsupported content encodings. Stream actual bytes, cap512KiB, fatal UTF-8 decode once after collection, body timeout5s. Aborted/invalid/oversize bodies never reach SQL. Unknown keys and domain rules use the existing pure canonicalizer, preserving exact Notes.
- Responses carry no-store, nosniff, Vary:Origin and a server-generated X-Request-ID, exposed through CORS. This diagnostic reference is distinct from the business command UUID. Use the existing small sanitized completion-event pattern: route enum, method enum, status, sanitized code, duration and diagnostic reference only. Never log path/query, command/borrower/Partner IDs, Notes, image references, actor/email, token or raw SQL/stack. Logger failure cannot change the outcome.

## Transaction and response semantics

Each store call connects only to the explicitly supplied runner-owned pool and rechecks database `payment_rehearsal`, session/current user postgres, loopback address, exact owned real data path and complete V78 history. No fallback to Cloud SQL. Use BEGIN for submit and a read-only transaction for status; set local statement timeout10s and lock timeout3s. These are candidate budgets, not a live SLA. Existing V78 owns serialization, savepoint rejection and atomic journal/payment semantics.

| Result | HTTP / body meaning |
| --- | --- |
| Recorded original Posted on submit | 200, ok:true, kind:recorded, originalOutcome |
| Recorded typed rejection on submit | 422, ok:false, code:command_rejected, kind:recorded, originalOutcome |
| Status found | 200, ok:true, kind:recorded, originalOutcome, regardless of recorded posted/rejected |
| Status absent/scoped out | 200, ok:true, kind:unresolved; absence does not authorize a replacement ID |
| Changed known command identity | 409 command_conflict, without original private payload |
| Invalid body/path/type | 400 invalid_request; oversize413; unsupported media415 |
| Invalid/denied authentication | Existing401/403 sanitized verifier code |
| New unsupported receipt | 422 receipt_unsupported; no financial attempt |
| Failure before financial submit | 503 command_unavailable (or receipt_unavailable for that scoped adapter failure) |
| Technical error once financial submit attempted / COMMIT uncertain | 503 command_outcome_unknown; never claim rejected solely from transport failure |

Only return a recorded success/rejection after COMMIT acknowledges. On failure attempt rollback and release safely; a failure after COMMIT started is still uncertain even if rollback returns. No automatic retry/new UUID. A disconnect after financial submission may leave a committed transaction; later status must reconcile the same request. GET never invokes submit. Raw PG error text stays internal and is not logged by the candidate.

## Receipt boundary and retained replay

Manual GCS reference mapping is still unverified. A new nonnull receiptId therefore fails closed by default; never discard it and silently post without the image. This preserves optional-field parity as an explicit missing integration, not an optional implementation task.

After authentication/current actor mapping, look up a retained journal only under request UUID plus issuer/subject. For a known request with matching receiptId, use its original stored descriptor to rebuild the incoming identity with the current server actor. Exact identity calls V78 for replay; a changed body/actor/receipt identity conflicts. Do not invoke a current receipt resolver merely to replay already committed money. This survives replacement/deletion/unavailable current image metadata without reposting or relabelling Posted.

For a genuinely new request with receiptId, the injected trusted adapter receives `{receiptId,requestId,actor}` and returns strict `{descriptor,requestId,actor}`. Store validates exact canonical binding and the pure descriptor/receipt ID, then submits its immutable descriptor. The adapter is responsible for actual ownership/bytes verification; matching metadata alone does not prove storage authority. Independent tests use a synthetic in-memory descriptor map with explicit owner/request binding. No live storage SDK, path conversion, bucket-root guessing or image upload route is added.

Original outcome and current source state remain separate concepts. This candidate returns the journal's original outcome. It does not assert that a corrected/deleted current Payment or receipt still matches it. Notes and original receipt identity stay immutable in retries. Future manual attachment CAS remains separate from financial submission.

## Concrete future deployment proposal, prepared by D

D supplies grounded named-resource/ACL prerequisites without applying them. Existing reader identity and permissions remain unchanged. A distinct command runtime/service and Cloud SQL IAM identity are the candidate direction, with the established pinned owner UID and exact browser origins. Firebase revocation verification requires only the exact supported permission/dependency, not a broad administrative role. No new public-access policy exception is inferred.

**V78 uses SECURITY INVOKER.** EXECUTE-only permission is therefore insufficient for a live writer. Do not describe it as a completed least-privilege interface or solve this by granting unrestricted business DML to the reader. A future reviewed definer/owner boundary or another explicitly reviewed privilege design is required, with every source table/column, trigger dependency, function EXECUTE and allowed session/database enumerated. Such SQL hardening is a proposal only in4E; no V78 rewrite or new migration is authorized here.

Manual receipts require current DEV AppSheet folder/reference binding proof, generated collision-safe object names, immutable upload ownership and create/get-only scope in the existing private bucket. The current infrastructure health prefix and agent V50 projector are not permission or compatibility substitutes. Exact IAM/path plan and a future synthetic AppSheet image roundtrip require review before writes. HEIC/iPhone camera handling remains explicit pending compatibility work.

Direct SQL does not prove AppSheet bots run. Before live payment activation, choose a single committed-event delivery owner, reconcile existing event conditions and actor-to-Partner recipient rules, require stable journal request identity for deduplication, prove retry/restart delivery behaviour and owner-only DEV recipients, and avoid double delivery between AppSheet and PWA. The journal is not a delivery outbox/acknowledgement store; no dispatcher or notification is added now.

## Executable test plan for C

### Preconditions and ownership

1. Read this contract and B's final changed-file handoff. Confirm no modifications to V78, existing live entrypoints or4B preview. D supplies baseline/hash/branch evidence; C need not repeat a broad audit.
2. Run only in `C:/GitHub/MW-Credit-App` with maintained `scripts/Enter-Dev.ps1` tooling. No live DSN, Firebase token, borrower record, GCS object or external credential is needed. `Run-PaymentCommandApi.ps1` must create a new random owned loopback cluster, migrate complete V1–V78, export only its guarded local connection metadata, run tests and stop it. Reuse existing disposable guard/runtime; no dependency installs or alternate database baseline.
3. Fixture uses existing `seedPaymentFixture` with a distinct4E prefix, synthetic330-baht two-charge selection/account/borrower, and synthetic UID. Inside disposable DB only, set the fixture Partner Login Email to the verifier's configured owner email so mapping is exercised. This is synthetic identity data, not a read of the real owner/Partner record. Fixed project/issuer claims exercise validation; injected verifyIdToken must record that revocation=true was requested.
4. B owns primary `tests/integration/payment-command-api.test.mjs`; C owns `payment-command-api-independent.test.mjs` plus focused independent unit tests if useful. Do not duplicate the full13+restart V78 suite unless the migration/contract is changed or a new failure invalidates its evidence. D owns required Test-CI for runner/tooling changes after freeze.

### Commands

From the app repository in PowerShell:

```powershell
. ./scripts/Enter-Dev.ps1
node --test tests/unit/payment-command-contract.test.mjs
./tests/integration/Run-PaymentCommandApi.ps1
```

The runner must execute both B and C API test files against its fresh cluster. If actual filenames differ, C records the final exact command before execution. Do not hand-run tests against an arbitrary port/DSN. D subsequently runs `./scripts/database/Test-CI.ps1` once after the focused package freezes.

### Cases and pass criteria

| Case | Steps / fixture action | Required observation |
| --- | --- | --- |
| Fresh owner command | POST canonical body with valid synthetic verified claims and allowed origin; GET its status | HTTP200 only after commit; one Payment and journal,330 posted, server-resolved Created By/Partner identity; status originalOutcome agrees |
| Authentication negatives | Missing/malformed token; wrong issuer/audience/provider/tenant/UID/email; expired/revoked/unverified claims; missing pinned UID configuration | 401/403 or startup rejection; verifier called with revocation=true; zero body/store/financial calls where auth fails |
| Actor injection/mapping | Add actor/hash/reference keys; remove the current mapping; assert the existing unique index rejects a duplicate normalized Login Email; inject only a two-row mapping-query result to exercise defensive ambiguity denial; legally reassign owner email to a distinct synthetic Partner | 400 for body injection;403 for missing/injected ambiguous mapping on submit/status; real duplicate attempt23505 leaves original mapping unchanged; valid remap changes immutable actor identity: same-command POST409 and retained status GET403; no new financial effects |
| HTTP/privacy | Exact allowed/denied/missing Origin; preflight invalid method/header; wrong verbs/path/query/UUID/media/encoding; invalid UTF-8; streamed overlimit; aborted or stalled body | Bounded sanitized responses; no SQL for rejected body/auth; no-store/CORS correct; diagnostic UUID independent of business ID; no sensitive fields in captured logs/errors; throwing logger does not change committed outcome |
| Notes | Thai, whitespace/newline, quotes/HTML-looking text and empty/null | Canonical text/DB Notes remain exact; no trim/truncation; changed Notes with same key conflicts |
| Duplicate/concurrent submit | Send identical POSTs concurrently, then changed amount/selection/actor under the same ID; two IDs compete for the same charges | Identical requests yield one financial effect; changed known identity409; existingV78 governs competing amounts without duplicates; technical engine failure is not represented as durable rejection |
| Durable rejection | New command with invalid date or inactive/missing account | POST422 includes original recorded rejection; GET200 reports that same outcome; no Payment; unchanged retry does not post |
| Receipt default and binding | New receiptId with default resolver; synthetic adapter wrong owner/request/id; valid matching descriptor; adapter unavailable after successful initial post | Unsupported/bad binding fails before financial submit; valid synthetic descriptor retained; exact known replay invokes no resolver and remains Posted; changed receiptId409; no silently null image |
| Unknown outcome | Inject a transport/pool seam that loses COMMIT acknowledgement after real commit; separately fail before commit | Caller sees503 command_outcome_unknown for uncertain submit; fresh authenticated GET finds the committed original in after-commit case; before-commit case has no partial money/journal. This is injected acknowledgement loss, not a claim of physical network failure |
| Disconnect and recovery | Abort HTTP after financial execution begins, await bounded completion, then GET using the same ID | No automatic retry/new key; status accurately reports recorded/unresolved; no duplicate effect. Abort before complete body causes zero submit calls |
| Retained source change | Correct/delete the synthetic Payment through governed SQL after successful POST; repeat exact authenticated POST and GET | Original journal result retained; no source recreation or financial repost; test/report do not call it the current source state |
| Target guard | Construct with missing/incorrect directory, version/user/DB metadata, non-loopback target mock or invalid candidate mode | Fail closed before command SQL; no fallback/live connection attempted |

### Evidence, limits and retest rules

Save concise sanitized JSON/text evidence under the owning4E output directory: exact commands, test counts, migration hash/baseline, response status/code summaries, verifier-call/no-SQL assertions, transaction counts and negative/privacy results. No tokens, raw request bodies, actor email, receipt paths/bytes or business IDs in published diagnostics. Synthetic IDs may remain only in the test source where required, not unrestricted logs.

C reports failed assertions and missing coverage to A/B; do not weaken expected semantics to obtain a pass. Rerun only changed/failed relevant tests after fixes, then the final combined API runner once the batch is frozen. D runs mandatory CI separately; no duplicate broad CI. If V78 changes unexpectedly, stop that path and report scope drift.

Tests establish local HTTP/auth-boundary logic with an injected cryptographic-verifier seam and actual disposable V78 transactions. They do not establish real Firebase token verification, live least privilege, GCS/AppSheet receipt rendering, notifications, OS/browser readiness or production safety. Stop after the tested candidate and concrete authority/receipt/event proposal are reviewable; parent reports progress and obtains only the remaining exact authorization.

### C04 fixture refinement — current schema evidence, 8 October 2026

The first combined run passed20/21; the remaining failure was fixture setup, not an API assertion: V78's inherited normalized Partners.Login Email unique index rejects duplicate mapping with23505. Preserve this production constraint. C must assert that real duplicate prevention, then separately inject only the mapping SELECT result as two rows over the actual guarded V78 client to cover the store's defensive403 branch. Label this as a query-result seam, not evidence that duplicate rows can be created in the actual schema. No schema/index bypass.

The distinct-Partner reassignment case uses a legal unique mapping: move the old Partner's email away, assign the configured owner email to another synthetic Partner, then verify same-command POST409 because the server-derived Partner identity changed and retained status GET403 because V78 requires the original actor mapping. Restore fixture mapping in finally. The existing missing-mapping case continues to verify403 for both submit/status. Transaction/journal counts and all other original assertions remain unchanged; rerun the affected case and then the frozen combined runner.

Final access-error classification: a V78 SQLSTATE42501 is403 access_denied only when COMMIT has not started and rollback completed successfully. A COMMIT uncertainty or failed rollback retains503/unavailable-or-unknown and quarantines the client. This is a narrow HTTP classification correction, not a SQL/access expansion. The earlier suggestion to leave remapped status as generic503 is superseded; C04's single expected result is POST409 plus GET403 for a legal Partner remap.
