# R052 checkpoint 2G — traceable read failures and recovery

8 October 2026. Agent A (Astra High). Approved bounded scope; app baseline 0236ca2, PM baseline 794fb3a5. Phase 1/2 remain incomplete. The owner accepted the missing-borrower correction and authorized continuing to this checkpoint. No financial writes, schema, grants, production operations or AppSheet changes.

## Purpose and implementation contract

Phase 2 explicitly requires request tracing and error/status handling. Current read responses contain sanitized error codes but no matching application log reference. Add a support reference to failed reads and retain deliberate, scoped recovery. Use the existing runtime stdout logging path; no analytics service, new logging client or IAM grant.

API (B: dev-read-handler.mjs, dev-read-server.mjs and small helper if useful):
- Generate a fresh crypto.randomUUID for every handled request. Ignore incoming request-reference headers. Set X-Request-ID before all response branches, including denied/malformed requests and health/preflight.
- Expose X-Request-ID to the browser only through the existing exact allowed-origin CORS response. Preserve allowed origins/methods/Authorization request-header policy, auth before business SQL, no-store and all response/status contracts. Existing clients ignore the additive header.
- Register one response finish listener: emit exactly one application completion record after the response finishes. Inject logger (default no-op) into the handler for tests; server writes one JSON stdout line. Logger failure must not change HTTP behavior or trigger an unhandled exception. Aborted requests need not emit a completed record.
- Exact log keys: event, requestId, operation, method, status, code, durationMs. event is read_request; method is GET, OPTIONS or OTHER; status is the HTTP status; code is allowlisted or a generic fallback; durationMs is finite and nonnegative. Exact operation enum: session, borrowers_list, borrower_detail, loans_list, loan_detail, collection_list, collection_charges, upcoming_summary, upcoming_date, health, preflight, unknown. Match known route shapes; never retain raw path fragments.
- Never log URL/path/query/search text/cursor, business IDs, user names/email/UID, tokens/headers/bodies, SQL or raw exceptions/stacks. This statement covers the new explicit application event; Cloud Run's independent platform request logs are not rewritten or certified by this slice. A support UUID is correlation, not an authorization token or durable financial idempotency key.

UI (B: shared ReadFailure/ErrorReference plus affected live read components):
- Strictly validate the response header as UUIDv4 before retaining it: case-insensitive ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$. Header only; successful and error body shapes remain unchanged. Existing errors carry code plus optional reference. Invalid/missing references and network/SDK failures show no invented server reference.
- Show localized Reference / Copy reference only alongside existing root/loan/Collection/Upcoming error messages; no normal-state banner, timestamp row or new header height. Copy only the UUID; announce success only after clipboard write succeeds. On clipboard failure retain selectable text and truthful fallback.
- Keep references scoped to their error/request. Clear on retry/success/route/auth/offline or scope dismissal. A late or aborted response cannot attach a reference to another selection. A failed request remains distinguishable from empty results.
- Preserve current 401 expiry/sign-out, 403 denial/data clearing and 409 business-date reset. No automatic retry/reload. Transient root retry must preserve intended view and applied search, rather than route Collection to Borrowers or drop the query. Child errors preserve authorized parent where existing policy permits.
- Existing loan recovery may explicitly say Retry loan list. Upcoming recovery may explicitly refresh its summary; if offering Retry this date, retain that failed dueDate and retry that exact scope. Do not promise detail retry while silently reloading another scope. No new retry framework is required.
- Preserve typeahead/IME, request generations, no-completion-scroll behavior, neutral compact UI, mobile bottom bar and in-memory-only business state.

## Independent acceptance and delivery

C: unit and actual HTTP checks for fresh unique UUIDs, client-ID spoof resistance, deny/error branches, exact CORS exposure, once-only completion, logger failure isolation and complete log redaction using hostile URLs/headers/error strings. Test records must contain no raw inputs. Existing auth/SQL boundaries remain.

C browser: synthetic root and child 503 -> visible reference -> copy -> explicitly successful retry removes reference. Network failure, absent/malformed header and clipboard failure remain accurate. Check delayed stale errors, view/query preservation, child parent isolation, 401/403/409 and mobile EN/Thai layout. Show the owner deterministic synthetic failure/recovery evidence; do not add a production fault switch or disrupt DEV to manufacture screenshots.

D: existing platform stdout collection needs no new permissions. Deploy compatible API before UI; both versions tolerate absent/additive header, so rollback remains compatible. Verify normal unsigned boundary plus one benign request UUID-to-sanitized-application-event correlation using existing operator access if available; report lack of access rather than granting more. Update current progress and source/runtime pins. Stop for owner review after publication and evidence.

## Phase 2 exit-gap assessment

| Requirement | Evidence position / next action |
| --- | --- |
| Owner identity, Partner mapping, API record gates and environment guards | Delivered bounded owner-only read scope; broader users/actions remain future policy, not a reason to widen this slice. |
| Read navigation, paging/search and first related workflows | Borrowers/Collection/charges/Upcoming delivered; owner missing-record correction accepted. Full contact/documents/CRUD and complete parity remain Phase 1/5 work. |
| Request tracing and error recovery | This checkpoint closes the identified implementation gap if C/D checks pass. |
| PWA install/update and offline design | Public-only fallback and explicit update delivered; owner iPhone install confirmed. Actual owner offline/update acceptance is distinct from synthetic browser tests. Business offline records/drafts stay a separately designed Phase 4/5 dependency. |
| Representative devices/access recovery | Preserve real owner iPhone sign-in/read evidence and synthetic SDK revocation/cross-tab evidence separately. Confirm the intended bounded foundation acceptance; do not claim every browser/physical-device combination. |
| Full Phase 1 parity and Phase 2 acceptance | Remain open; orchestrator presents explicit remaining gaps and asks at the meaningful review stop before starting Phase 3/4 implementation. |

Phase 3 preparation may next produce a concrete isolated production infrastructure plan, but production mutations require scoped authorization. Phase 7 remains after go-live.

## Bounded first-receiving investigation (design evidence only)

This is source inspection of the canonical V1–V77 package, not a new live catalog audit or financial test. Do not implement a payment endpoint or broaden the read runtime role in 2G.

| Question | Grounded finding |
| --- | --- |
| Canonical posting path | V59__ordinary_payment_corrections.sql defines post_payment(text), superseding V51's implementation; process_lump_sum trigger invokes it for Processing Payments. V51 payment_charge_balances/selected_charge_ids define Selected Charges scope. The current engine validates positive whole-baht amount, payment date no later than Bangkok today, borrower ownership, nonnegative/nonmissing components and exact full selected residual. It locks borrower/payment and ordered loans/charges, creates allocations/repayments, reconciles totals and marks Posted in the transaction. Never reproduce these financial calculations in React. |
| Source correction dependencies | V59 source correction/derived-row rules, V60 account guard, V63/V73 history refresh changes, V65/V67 delete request and V72 historical opening changes are part of the retained V77 chain. A future command must use existing triggers; do not disable them or judge current behavior from V51 alone. This bounded inspection is not exhaustive dependency proof. |
| Existing quick-command retry | V23 quick_payment_request updates a source token, derives a receipt key, checks current Bangkok date/account and returns for an already Posted identity; V24 modifies the key while preserving older MD5 identities. This is a concrete legacy command mechanism, not proof of an API payload-conflict contract. The same posted key can return before comparing all requested fields. Do not expose the source-token update as a complete HTTP idempotency implementation. |
| Actor | V25 separates unique normalized Partners.Login Email from delivery Email. post_payment copies Payments.Created By into generated Repayments. The API must derive actor from verified identity/mapping, not caller-provided actor text or shared delivery email. Exact future audit attribution and privilege path remain to design. |
| Existing audit | V33 agent_audit.commits has an operation UUID, transaction ID and plan hash, visible after commit; source comments explicitly say it does not prove AppSheet bot effects. It belongs to the existing agent audit design. No authority to reuse its roles/schema for the PWA is inferred. |
| Events | Recorded Payments - Process Receipt bot is disabled; recorded Notification - Charge Received is an AppSheet event on Payments. R051_CRUD_Scenarios says SQL recalculation sends no outbound messages. Direct SQL posting must not assume AppSheet notifications fire. Exact committed-event delivery, deduplication and owner-only DEV route need proof before a live first payment. No replacement scheduler or notification framework is authorized here. |

Recommendation for the next financial design checkpoint: retain the baseline candidate Collection -> explicitly selected charge(s) -> receiving account -> review -> online confirmation, using Selected Charges rather than inventing new allocation behavior. It has an explicit bounded charge set and governed exact-total validation. The owner has not yet selected the final first channel; Single Full is a narrower alternative if preferred. Neither is activated now.

Before implementation, complete a disposable V77 transaction rehearsal and a precise API contract: canonical payload (charge IDs/account/date/amount/method), stable request identity and payload-conflict semantics, auth/actor binding, status lookup after lost response, concurrency with AppSheet, committed result/allocations and event ownership. Existing Payment identity may support a minimal design, but source corrections/deletion and actor/account/method fields mean identity alone is not yet proven durable replay protection. Investigate whether the existing schema suffices before proposing any addition; new table/column requires justified owner approval.

Future decision/authority points: owner agrees first receiving channel and reviewed DEV financial test scope; exact command runtime/least-privilege grants and event route are reviewed; any justified schema change is explicitly approved; production financial activity remains separate. Read-only source analysis and local disposable tests can proceed when assigned without consuming live financial authority. First subsequent review should show a concrete synthetic confirmation/retry/unknown-outcome flow plus passing V77 transaction evidence before asking to activate a live command.
