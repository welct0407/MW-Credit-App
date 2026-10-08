# R052 checkpoint 4A — local Selected Charges design and rehearsal

8 October 2026. Agent A, Astra High. Owner accepted checkpoint 2G and authorized the next bounded checkpoint. This is design plus local synthetic implementation/rehearsal, not live Phase 4 activation or full Phase 2 acceptance. Phase 1 parity and native offline/update acceptance remain separately tracked. Phase 7 stays after go-live.

## Scope and isolation

B owns a physically separate local prototype, command adapter and disposable runner; no imports into live-dev frontend or read API. C independently verifies against a complete fresh V1–V77 migration chain. D owns documentation, local-preview assistance, required CI and publication. A owns this design.

The runner creates its own loopback PostgreSQL cluster/database using the maintained full-history setup and synthetic fixture prerequisites, then shuts it down. Reject remote/non-owned database targets; never consume DEV environment configuration, Cloud SQL credentials or real data. The prior lightweight Collection test schema is insufficient. The inspected Invoke-CorePaymentLab.ps1 is a live DEV tool and MUST NOT be used. Existing Test-Migrations/Test-CashAccountFixtures patterns are suitable starting references, not authority to replay other live scripts.

Serve the prototype on loopback only with same-origin local requests and runner-owned database access. No Firebase sign-in or claims of verified live identity. Trusted synthetic identity is explicit; IDs accepted by this harness belong to its fixture set. No cloud deployment, live database financial writes, new grants, migration, AppSheet edits, notifications, receipt uploads or production work.

## Reviewable flow

Collection -> select charge(s) -> select receiving account -> review immutable command -> explicit online Confirm -> committed result, rejection or unknown outcome -> Check status / retry the SAME command.

Use accepted bilingual terminology/readable layout where practical, but display a persistent concise “Local synthetic rehearsal — no live payments” marker. Do not add payment actions to the real Collection view. Explain that the request journal is memory-only simulation and that restarting the rehearsal loses request history.

Review shows borrower, selected charge dates/amounts, receiving account, payment date and exact total. No automatic posting or automatic retry. After submission begins, freeze payload/request ID. A lost response or timeout is UNKNOWN, never proof of rejection or posting; disable creating a replacement command until resolved. Check status before retry; retry reuses identical ID/payload. An absent status is “not found / outcome not established”, not evidence that a prior request cannot still commit. A later fresh command requires explicit return to refreshed selection.

Deterministic test scenarios: successful commit, eligibility rejection, concurrent balance change, committed response deliberately dropped, uncommitted rollback, duplicate request, payload conflict and unavailable status lookup. Fault simulation is available only in this isolated harness, never live code.

## Exact candidate command contract

Canonical payload has exactly these fields: schemaVersion=1, requestId(UUIDv4), borrowerId, selectedChargeIds, cashAccountId, paymentDate, amountReceived, paymentMethod='Bank Transfer', allocationMethod='Selected Charges'. Reject unknown fields, especially client actor/status/holder/derived allocations.

- Selected IDs: 1–100 nonempty unique immutable fixture IDs; reject comma/whitespace encoding and unsupported IDs. Server sorts using stable C-compatible ordering before producing SQL's canonical comma-separated Selected Charge IDs. Reordering the same set is the same canonical payload.
- Money: positive whole-baht decimal string, no sign/decimal/exponent/leading zero; bounded within PostgreSQL money capacity. Use string/BigInt-safe comparison, never floating point. These are existing Selected Charges whole-baht semantics; no rounding financial inputs.
- Payment date: real YYYY-MM-DD equal to the server's current Bangkok business date for this first rehearsal. This intentionally bounds the prototype; it does not remove existing engine support for legitimate historical dates.
- Actor: server-derived synthetic verified-identity stand-in, e.g. 4A-owner@example.invalid, mapped uniquely to a synthetic Partner Login Email; separate from delivery Email. Require configured actor mapping before command execution. Store the actor identity in Created By; prove propagation to Repayments. Caller cannot impersonate another actor.
- Cash account: active eligible synthetic account selected explicitly. Existing cash_account_holder/account guards determine holder and reject inactive/mismatched inputs; never trust a caller-supplied holder.
- Payload identity includes actor and every canonical business field, excluding requestId itself from the payload hash. Same requestId + same canonical payload/actor returns the same outcome; changed selection/account/amount/date/method/borrower/actor conflicts. Never update an existing receipt to implement retry.

Prototype quote data must be identified as synthetic. Final authority remains the existing SQL engine under locks; browser totals do not authorize posting. If B implements a database quote, match existing V51 component residual semantics and prove it independently; never substitute the earlier Collection daily amount.

## Database adapter and fixture

Actual submit inserts a stable request-derived Payments Row ID with Status Processing and canonical input columns, letting the full trigger chain allocate, repay, reconcile and post. No handwritten financial posting engine, disabled trigger, direct child editing or alternate status shortcut. Confirm success only after COMMIT succeeds and a fresh read observes Posted and reconciled children. If COMMIT/network outcome is uncertain, preserve UNKNOWN until lookup resolves it.

The local in-memory journal models intended request lifecycle and canonical payload conflict only; it is NOT durable evidence. It may serialize same-request calls, but actual independent-connection contention tests must also prove the database behavior. A surviving Payment row can help status lookup; current mutable fields cannot reconstruct immutable original request history after a correction.

Default synthetic review fixture: one borrower, two eligible charges across two loans: principal100 + interest10 and principal200 + interest20; select both for330 baht. Include an unselected charge50 +5, a foreign-borrower charge30 +3, and a future-dated charge. Use synthetic eligible cash-account fixtures and sufficient synthetic opening/contribution setup required by the canonical guards. B/C may adapt fixture mechanics to the actual schema without changing these scenario expectations; never bypass an opening/account guard. Use server Bangkok date D, charge dates D-2 and D-1, synthetic actor above.

## C acceptance

1. Verify full migration history through V77 and normal triggers/constraints, not hand-picked function copies. Reuse required schema roles/prerequisites from maintained disposable tooling. Report a dependency barrier rather than silently weakening the chain.
2. Valid330 command becomes one Posted receipt; exactly selected allocations/repayments total330, correct principal/interest, actor and receiving account/cash effects; unselected/foreign/future charges unaffected. Existing engine ordering remains governed by charge date/key, interest before principal.
3. Reject zero/fractional/overlimit amount, invalid duplicate/foreign/future/paid selection, changed residual, wrong/inactive account, missing actor mapping and stale day; transaction rollback leaves no receipt/children/cash effects.
4. SameID/samepayload once; sameID/differentpayload or actor conflicts. Same request concurrently, two IDs targeting the same residual, and an AppSheet-style direct source INSERT contender use separate connections. At most one full receipt posts for the same available residual; contention never fabricates success.
5. Response dropped AFTER commit -> UNKNOWN UI -> lookup returns existing Posted -> no duplicate; failure BEFORE commit -> no effects, same-key retry as explicitly simulated protocol; unavailable lookup remains UNKNOWN.
6. Execute ordinary allowed source correction and deletion in separate disposable scenarios. Show that comparing the current receipt cannot prove original payload, and deleting it removes PK-based deduplication. This is expected gap evidence, not a test to suppress.
7. Browser mobile/desktop EN/Thai: selection/account/review, frozen command, disabled duplicate confirmation, explicit status/retry, conflict, offline confirmation blocked, no completion-based jump. Check prototype isolation from live bundles and absence of network calls outside loopback. No persistent business data or real credentials.

Database runner/test changes trigger the maintained Test-CI procedure; coordinate B/C/D ownership to avoid duplicate full runs. Distinguish actual database evidence, simulated protocol evidence and untested live event/identity behavior.

## Source basis and future durable design gap

Current source basis: V51 Selected Charges key/scope/balances; V59 post_payment and ordinary source correction; V60 account guard; V63/V73 history recalculation; V65/V67 deletion request; V72 historical openings. V23/V24 quick tokens are a legacy command interface, not a complete API payload-conflict guarantee. V25 Login Email owns identity. V33 agent_audit has an operation record but belongs to another audited workflow; do not assume its roles or semantics can be reused.

The simplest receipt-only approach works only while the original receipt remains unchanged/present. Approved AppSheet correction/deletion makes that assumption invalid for durable financial commands. Rehearsal evidence should settle this precisely.

Minimal FUTURE proposal if no compatible existing journal ownership is established: an immutable command identity record keyed by request UUID, with actor binding, canonical payload/version/hash, resulting payment identity and committed initial result, plus a retained tombstone when the source payment is corrected/deleted. Insert it atomically with posting, protect original identity from source edits, and reconcile unknown outcomes via it. Define rejection/pending semantics and transaction fencing separately; do not claim an uncommitted “pending” row is durable. Event delivery may require its own durable committed-event ownership; do not casually combine an outbox into the command record or duplicate existing channels.

This is a design proposal, not an approved new table or migration. First check whether an existing governed journal can satisfy ownership/retention/conflict requirements without repurposing agent_audit. Any new table/column needs justified owner approval and cross-AppSheet dependency analysis; any runtime writer grants need exact scoped review.

SQL posting does not prove AppSheet bots execute. For 4A, events are explicitly not delivered. Before live activation, settle committed-event publication/deduplication/actor-recipient routing and owner-only DEV delivery, account/read privileges, receipt evidence behavior and offline draft recovery. Retain no live payment endpoint until those bounded design and authority questions are resolved.

## Stop point

Publish source and sanitized local transaction/browser evidence, show the owner the synthetic flow and unknown-outcome recovery, report the concrete durability/event gaps and update overall progress. Stop for review. Do not call this a completed financial workflow or Phase 2 closure. The next proposed checkpoint can implement/rehearse the approved durable command boundary; actual DEV financial activation is a separate scoped decision.
