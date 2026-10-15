# Checkpoint 4G — DEV command activation and selected-charge receiving

R052 Open. Delta from [4F](checkpoint-4f-design-and-test-plan.md), [4E](checkpoint-4e-design-and-test-plan.md) and the accepted 4A/4B receiving prototype. Follow [orchestration](../../Documents/Rules/PWA_Orchestration.md). D maintains the single [4G batch record](checkpoint-4g-batch.md), exact source/config/artifact pins, live action/recovery plan and results. A owns this design/test plan; B application code; C independent verification; D infrastructure/tooling/publication. Preserve concurrent CI/process edits and unrelated planning work.

## Outcome and authority

Deploy an owner-visible DEV Selected Charges flow from Collection using real pinned Firebase identity, a separate IAM SQL command runtime, the immutable command journal and proven manual-receipt GCS mapping. First activation is server-enforced synthetic-only: explicit reviewed borrower, account and charge IDs. No arbitrary real DEV payment, PROD, notification, scheduler, agent activation, new schema, or other receiving channel. V78/V79 are the existing tested schema package; do not edit them or allocate another migration for this slice.

Stop after disposable/CI checks, controlled DEV deployment, authenticated synthetic posting/receipt/replay proof and a mobile/desktop visual review. The owner then decides subsequent widening. This is neither full Phase 2/4 acceptance nor seven-channel parity. Post-Posted receipt replacement/removal remains a later metadata API; preserve the existing local 4B prototype. Notes and optional receipt before posting are included now.

## Runtime and deployment boundary

Create a separate command server/config entry, not a new mode in the current read server. Use the existing Firebase Admin verifier with revocation check and UID-pinned owner only; no email-bootstrap, emulator or unverified-claims runtime path. Server derives issuer/subject, current unique Partners.Login Email mapping and Partner ID. Browser actor/hash/storage reference inputs are rejected.

Pin DEV project clever-oasis-508610-n7, instance clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914, database loan_manager_dev and command IAM DB user mw-credit-app-command-dev@clever-oasis-508610-n7.iam. Use the maintained Cloud SQL IAM connector. Exact HTTPS origins are the existing web.app fallback and https://dev-lm.mw-credit.com; no wildcard/reflection or arbitrary origin environment input. Preserve explicit loopback factories for tests without enabling a production mock switch. Reject ambient DB routing overrides.

Startup and each transaction verify actual database and session_user=current_user expected command login, nonadministrative flags, mw_app_dev membership and absence of journal-owner/registered-migration-creator memberships. The connector pins the actual instance; do not assume inet_server_addr equals its public address without D's verified observation. Runtime cannot read Flyway history/data_directory. D independently verifies exact schema history and live effective rights before launch. Legacy disposable-only imports must not become required runtime filesystem dependencies.

D's pre-mutation plan includes private rollback/backup references, complete target identity, exact tested V78/V79 pin, role prerequisites, operator authority for ownership transfers on Cloud SQL, policy reconciliation and runtime membership, separate Terraform command identity/service, owner-secret version, ingress/invoker setting, exact GCS prefix and synthetic fixture side-effect checks. Cloud SQL postgres authority is not proved by disposable superuser tests. Honor any tool-specific review rejection. No automatic instance/PROD settings changes. Existing read service and AppSheet remain available.

Use the broad stable 4F capability and its migration hook; no renewed per-feature ACL inventory. Keep journal immutability and governance carveouts. Service health is static /health, without financial SQL. Bound SQL/body/request times and pool size; close connector/pool on shutdown. Image validation must fit the deployed resources. D records the actual resource settings and delivery sequence.

## API and source delta

Retain POST /api/payment-commands and GET /api/payment-commands/:requestId, canonical schemaVersion3, current actor validation, journal locking, 4E HTTP statuses, failure redaction and quarantined failed-COMMIT/ROLLBACK clients. New-command fixture checks occur before financial SQL. Known retained journal replay/status remains authorized and recoverable after fixture configuration changes; configuration removal must not erase history. Never silently generate a replacement UUID or retry SQL after uncertain commit.

Add only these flow support routes:

| Route | Contract |
| --- | --- |
| GET /api/payment-drafts/:borrowerId | Authenticated current mapping plus guarded read-only transaction. Exact configured synthetic borrower or deny; one transaction Bangkok business date/asOf. Return borrower display, eligible charges and configured active receiving accounts. No financial effect. |
| POST /api/payment-commands/:requestId/receipts/:receiptId | Raw PNG/JPEG, exact UUIDs, bearer auth/current actor and exact X-Borrower-ID fixture check before storage. Bounded stream <=5 MiB with timeout; no multipart filename/path or client actor. Return verified descriptor identity, not a public URL. |
| GET same receipt path | Revalidate current mapped actor and exact request/receipt binding; verify stored bytes/metadata then return image bytes with no-store/nosniff. No bucket listing, arbitrary path, URL, redirect or public object. |

Draft source: Charges joined through Loans.Ref Borrowers to the exact borrower; only configured charge IDs, Charge Date <= Bangkok day, Payment Status recognized unpaid/partial, positive whole-baht Amount Remaining. Reuse existing bilingual borrower/loan display formatter. Zero/paid rows are not selectable; null/invalid required dates/status/amounts or fractional positive amount produce an explicit unavailable state, never rounded or false-paid output. This is the bounded Collection receiving entry, not a claim to cover every selected-charge entry point. Configure at most 100 charge IDs; never silently truncate additional eligible rows. Sort Charge Date ascending then Row ID C for stable selection. DTO charge fields: id, chargeDate, loanDisplayKey, amountRemaining decimal-integer string. Total is exact BigInt sum of selected supplied amounts; no new accrual/allocation formula.

Receiving account source: Cash Accounts Row ID, Account Label joined Ref Cash Holder to Cash Holders Row ID, both Active true, limited to configured synthetic accounts; order Sort Order then Row ID C. Do not expose account numbers. V78/V77 still revalidate accounts, charge ownership and financial balances when posting. A stale draft cannot bypass governed concurrency checks. Payment date is the draft's Bangkok day; a midnight transition requires a fresh draft/new unsubmitted review, while an already submitted request retains its original identity for recovery.

## Receipt transport

Wrap the 4F adapter in the existing Google Cloud Storage SDK, Application Default Credentials and exact generation-match-0 create/get transport. Reuse actual AppSheet generated-path evidence in receipt-compatibility-4f.json. Preserve fixed DEV bucket/prefix, UUID-hex suffix and canonical metadata binding to request, receipt and server actor. No new path normalization, native arbitrary-reference conversion, overwrite/list/delete privilege or agent Receipt Image writes.

Use a pinned sharp decoder in the Node command image: check signature/MIME, nonempty <=5 MiB before decoding, failOn warning, 20MP input bound, actual full decode and single-image PNG/JPEG format verification. Preserve uploaded original bytes. HEIC/other formats explicitly unsupported in this batch; instruct conversion/choosing JPEG or PNG, never silently discard the receipt. See [official sharp constructor options](https://sharp.pixelplumbing.com/api-constructor/). Retain 4B Pillow behavior/tests separately.

An acknowledged upload succeeds only after exact verified readback. On create precondition conflict/lost acknowledgement, compare the existing exact-key object with current request/actor/MIME/size/hash; identical is a safe upload replay, differing bytes/binding is conflict. No overwrite. Storage failure stays a receipt error; it never triggers a payment POST or removes a selected receipt silently. Same receipt ID with changed bytes must not mutate a submitted command. Abandoned unreferenced objects are recorded for separate operator cleanup, not automatically deleted by the runtime. Existing create/get-only IAM remains sufficient.

## UI and recovery

Integrate a separate receiving component into Collection; preserve compact theme header, bottom navigation, independent scrolling, bilingual controls, pinned persistent auth and existing preview behavior. Nonfixture borrowers remain read-only. The synthetic flow is clearly labelled as a DEV test. Initial capability denial can hide/disable receiving without affecting ordinary read data.

Show selected-charge exact total above an embedded bounded accessible charge list. Checkbox updates preserve scroll, focus, Notes and receipt state. Provide receiving account, exact optional Notes, optional upload/preview with pre-confirm replace/remove, then a full immutable review of borrower, each charge/date/amount, total, account, Bangkok date, Notes and receipt. Submit is explicit and online only. No business offline drafts, service-worker caching, token storage change or background payment sync.

Create one UUID per draft; freeze its canonical command at first Confirm. Disable duplicate confirms. Full-response timeout/connection failure after dispatch is Unknown, not cancellation or rejection. Preserve original request identity and exact payload in memory. Offer explicit Check status GET and, only while the exact immutable payload remains available, explicit Retry same command. Unresolved status does not prove noncommit. Conflict is terminal for that payload/reference; do not offer an ID-only action that can confuse another command's outcome.

For refresh recovery, sessionStorage may hold ONLY the opaque pending UUID; no amount, borrower, account, Notes, image or token. Treat stored input as untrusted and always authorize status. After reload, offer status only; do not reconstruct a POST from changed input. If storage is unavailable, retain in-memory behavior and show copyable reference with truthful recovery limitation. Sign-out/auth loss clears business state; no automatic write resumes at sign-in. Route changes suppress stale UI callbacks but do not claim a dispatched POST was safely cancelled. An explicit status request may discover the recorded original Posted/rejected outcome; it is not a current source-correction audit.

After Posted, retain result/Notes/receipt presentation while refreshing relevant read views separately. A failed refresh or receipt read does not turn Posted into failed payment. Post-Posted receipt editing is absent rather than routed through payment retry. Preserve error request references and compact accessible errors; no restored wide status chrome.

## Executable verification plan for C

Preconditions: read final B handoff; use only owned full V1-V79 disposable PostgreSQL, true non-superuser LOGIN and synthetic fixtures. No C live mutation except a separately root/D-coordinated browser synthetic verification. Existing V78/V79 bytes and 4F role tests remain evidence where unchanged. D owns live backups, IAM, migration, fixture provisioning and actual GCS cleanup. B owns implementation, C new independent tests; routine failures go directly to B, semantic questions to A.

Expected focused commands from C:/GitHub/MW-Credit-App (B may provide equivalent maintained filenames before execution, record actual command):

```powershell
. ./scripts/Enter-Dev.ps1
./tests/integration/Run-DevCommandActivation.ps1
npm run build:live-dev
npx playwright test tests/e2e/selected-charge-receiving.spec.ts --project=chromium
```

The integration runner reuses the owned full79 harness and exercises real HTTP/store/SQL under the application LOGIN; injected Firebase verifier and synthetic storage remain labelled test seams. Add actual sharp decoding tests and transport condition assertions. D runs applicable mandatory database CI if runner/DB tooling changed and full remote Development checks before sensitive deployment; do not repeat unchanged broad suites merely for an evidence commit.

| Case | Steps and expected result |
| --- | --- |
| G01 config/authority | Wrong project/DB/IAM login/origin/UID mode, missing allowlist, emulator and ambient DSN fail closed; forged/plain target config cannot bypass live guard. Real LOGIN is nonadmin and not creator/owner. Unauthenticated/forged actor requests cause no SQL posting/storage access. |
| G02 draft and boundary | Configure synthetic fixture with two integer remaining charges, paid/zero/future/nonfixture/null/fractional cases and active/inactive accounts. Verify exact returned selection and total, strict borrower/charge/account scope and failure semantics. Tampered submission with another borrower/charge/account is denied before posting. |
| G03 real posting/replay | Submit synthetic full selected total with Thai/multiline Notes and optional valid receipt. Assert one Posted payment, exact Notes/reference, V52 timestamp, expected governed allocations/repayments/cash effects and one journal result. Same request repeats once-effect; altered notes/selection/actor/receipt conflicts. Concurrent different requests and AppSheet-style contender remain governed. |
| G04 unknown recovery | Inject response loss after real COMMIT, failed COMMIT acknowledgement, precommit technical failure and failed rollback. API returns truthful Unknown/unavailable and quarantines broken client. Status recovers journal result; no automatic retry/new UUID. Known replay survives fixture config removal and current receipt outage; current actor remap still denies. |
| G05 real image/transport | Valid PNG/JPEG full decode; spoofed MIME, corrupt/truncated, >5MiB, >20MP and unsupported HEIC rejected. GCS fake transport records generation0/exact-key reads only; byte mutation, ownership/hash/generation mismatch and conflicting upload retry fail. Exact upload replay succeeds. Actual IAM/GCS proof is D's live step, not this test. |
| G06 UI normal | Desktop and 320/390px mobile EN/Thai: Collection→fixture receiving→scroll/select→total→account→Notes→receipt→review→confirm→Posted. Selection preserves list scroll/focus/Notes/upload. Header/bottomnav do not cover controls. Read refresh/receipt failure leaves financial Posted intact. |
| G07 UI races/recovery | Delayed upload, parent/route/auth change, double tap, offline before submit, network loss after dispatch, status unresolved/posted/rejected/conflict, refresh with pending UUID and storage blocked. No stale response replaces another scope, no automatic financial POST, no duplicate effect or false safe-cancel. Verify no sensitive sessionStorage/service-worker cache and retained immutable retry payload. |
| G08 regression/integration | Existing Borrowers/Collection read, persistent auth, search and compact navigation smoke; original4B preview untouched. Build runtime container and confirm actual sharp import/decoder plus startup failure sanitization. Exact HTTPS CORS/preflight including X-Borrower-ID only where needed; successful/error images and JSON no-store. |

Evidence: concise sanitized results/command/source pin; actual SQL counts/roles and reused evidence; representative synthetic desktop/mobile review/result screenshots; no credentials, real records/images, private recovery files or unrestricted logs. Label simulated verifier/storage/network seams honestly. After a fix rerun affected tests, then one frozen focused pass; D applies the orchestration validation matrix.

## D live verification and stopping point

Before mutation D supplies root one concrete plan: verified V77 DEV identity and backup/restore basis; V78/V79 operator ownership prerequisite and exact pin; role/ACL snapshot and reversible membership; Terraform identity/service ingress/config; synthetic fixture recovery/retention and analysis of database triggers, scheduled bots and external notifications. No real borrower/account effects are allowed. If safe existing fixture cannot cover the path, propose exact synthetic fixture creation and dependencies rather than modifying real balances or bypassing triggers.

After required checks: apply prerequisites/migrations/reconcile to DEV only, validate history/rights, deploy command API before the PWA reference, then deploy UI. Browser authentication uses the real owner; do not retain/print tokens. Verify one explicitly identified synthetic submission through the deployed authenticated flow, exact server identity and journal/financial effects, receipt image through PWA and current DEV AppSheet where relevant, then same-UUID replay/status with no duplicate. Verify nonfixture denial via safe synthetic/nonexistent request rather than attempting real posting. Reuse current AppSheet mapping evidence; this step proves the new runtime principal/transport.

Event delivery remains unimplemented/unactivated: a PostgreSQL write is not proof of AppSheet bot/webhook/notification parity. Do not fabricate success events or invoke agents. Root must resolve any unavoidable live test notification effect before the test. Keep journal/source test records traceable; no cleanup by deleting immutable journal or disabling integrity triggers. D records any bounded intentional synthetic residue and owned object cleanup.

Rollback stops command traffic/fixture authorization and restores prior command/PWA revision/config while retaining compatible V78/V79 and journal outcomes. It does not undo posted money or silently restore an entire shared database over intervening work. Separate scoped data correction is needed for material financial recovery. Receipt objects referenced by retained payments are not deleted. Existing read/AppSheet operation remains available. Close with actual deployed evidence, pending event/other-channel/post-Posted metadata scope and owner visual stop; update progress once at batch closeout.
