# R052 checkpoint 4D — approved durable journal, disposable implementation

8 October 2026. Starting app `2c66bdd5`, PM `b00d437d`. Owner approved the [4C proposal](checkpoint-4c-design.md) after the API/journal explanation. This authorizes the named table and three routines for disposable implementation/rehearsal only. It does not authorize DEV/PROD application, live grants, GCS uploads or a financial endpoint. The 4B preview remains available and unchanged.

D checked the canonical migration source at V77, found no pending file and coordinated **V78 exclusively to B** for this scope. This is not a new live-history audit; retained deployed V77 evidence is unchanged. No edits to V1–V77.

## Exact implementation boundary

Implement only the twelve-column `public.pwa_payment_commands` and constraints from4C, `public.guard_pwa_payment_commands_immutable()` with UPDATE/DELETE/TRUNCATE protection, `public.pwa_submit_selected_charges_v1(canonical_json text) RETURNS jsonb`, and `public.pwa_command_status_v1(request_id uuid, actor_issuer text, actor_subject text) RETURNS jsonb`. No second journal/outbox/receipt table, unrelated helper function, payment engine modification or runtime integration.

For this disposable package the routines are SECURITY INVOKER, with fixed search_path and qualified objects. Revoke PUBLIC access to the new table/routines; add no runtime roles or grants. The disposable database owner runs the tests. This proves neither Firebase verification nor production least privilege. A future deployment ownership/ACL plan remains a distinct concrete review.

## Canonical input and actor boundary

Reuse `services/contracts/payment-command.mjs` v3 as the fixture producer, without changing its accepted command or the old4B prototype. SQL must independently validate the strict envelope and domain constraints, not trust a caller's hash or JSON types.

- Cap canonical input at524288 UTF-8 bytes before parsing. Check exact envelope/command/actor/receipt keys and types, valid canonical UUID/date/amount, exact Notes, selection cardinality/uniqueness/encoding/C order, matching receipt ID and coherent descriptor/null. Enforce the4C technical byte limits. Invalid or noncanonical input raises22023 before a journal write.
- Reconstruct the canonical string in fixed field order using correctly JSON-escaped scalar strings and delimiter-joined arrays. Do not remove spaces globally or hash jsonb::text. Require byte equality to the input; this also rejects duplicate keys, extra keys and alternative JSON encodings/order. Verify parity with JS for Thai, non-BMP Unicode, quotes, backslashes, control escapes/newlines and nulls.
- Store original canonical text and SHA-256 of its UTF-8 bytes; constraints must tie hash/request/actor/outcome to their recorded values. No update/repair of corrupt identity.
- Actor issuer/subject in this SQL interface are assertions from the future trusted server, not authentication. Tests use synthetic assertions. Require current unique normalized Partners.Login Email and matching Partner Row ID before replay or new execution. Missing/ambiguous mapping is an access failure42501 with no new journal record. Status uses the stored actor mapping plus the supplied matching issuer/subject; wrong identity receives unresolved without historical disclosure.
- No GCS lookup occurs. Any optional descriptor used by a fixture is explicitly synthetic trusted-adapter input. Shape validation does not prove ownership, bytes, storage mapping or AppSheet image display.

## Serialization, outcomes and typed rejection

The caller starts and commits one transaction. The submit function never commits. Acquire a dedicated namespace transaction-scoped advisory lock derived from request UUID before journal lookup. Use the same boundary for every submit, including a retry. A hash collision may serialize unrelated commands but cannot change identity. Caller/test timeouts remain bounded; lock/deadlock failures are technical unknown/unavailable outcomes.

After current actor validation and lock, an existing identical canonical identity returns its original outcome. A changed identity returns conflict. Replay occurs before new-command date/account/selection/receipt checks, so midnight, source correction/deletion or a missing current image cannot turn an already posted command into a new payment.

A new command uses a PL/pgSQL inner exception block (savepoint) for financial work. Only wrapper-owned deterministic guards have typed rejection codes:

| Internal SQLSTATE | Recorded sanitized code | Meaning |
| --- | --- | --- |
| P4C01 | invalid_date | New command is not for the current Bangkok date |
| P4C02 | borrower_unavailable | Requested borrower no longer exists |
| P4C03 | account_unavailable | Explicit account/holder is missing or inactive |
| P4C04, if implemented | selection_unavailable | Nonfinancial selected-key ownership/date membership is unavailable |

The optional fourth guard must not copy balance/allocation calculations. Catch only implemented listed SQLSTATEs, rollback all inner work, then insert a rejected journal row in the outer transaction. Current actor denial and malformed input remain access/validation failures without journal insertion.

Existing V77 engine errors generally use untyped P0001. Do not classify them by message text or catch all as rejection. Amount/remaining-balance changes, unrecognized engine errors, connection/serialization/deadlock/timeout failures escape and rollback the transaction with **no durable result**. The client must reconcile and may explicitly retry only the unchanged request ID/body; absence is not proof no transaction can still commit. This intentionally conservative first boundary avoids inventing financial exception semantics.

Reuse `cash_account_holder(...,true)` and the ordinary Processing Payments INSERT path. The actual V77 post_payment definition includes V59 refinements; do not restore an older V51 definition. Existing borrower/loan/charge locks and calculation triggers remain the authority for competing AppSheet-style writes. No direct writes to allocations/repayments/balances and no direct post_payment shortcut.

Set deterministic Payment key `pwa:` plus UUID, server-derived Created By, exact Notes and optional synthetic manual reference. Verify successful trigger-completed Posted result before inserting the posted journal. Payment and final journal commit atomically. A failure between either insert and commit leaves neither committed. An uncertain COMMIT acknowledgement remains unknown until a fresh connection observes the journal.

Return `{kind:'recorded',originalOutcome}` for a recorded matching command, `{kind:'conflict'}` for changed identity and `{kind:'unresolved'}` for absent/scoped-out status. originalOutcome has status, paymentId, code and UTC-millisecond recordedAt as in4C. It is original transaction evidence, not a current Payment status or exact commit-clock reading. Do not add a new source reconciliation product in this checkpoint: tests query current Payment state independently to prove correction/deletion can coexist with retained original Posted. The future API must keep those meanings separate.

## Required disposable evidence

B implements/first-checks; C independently tests; D runs the maintained required database CI once after the package is stable. Use a complete fresh V1–V78 migration chain and only synthetic records. Preserve the runner-owned loopback/path/database guards and do not reuse the live DEV lab.

1. JS/SQL canonical parity and invalid-input rejection, exact Notes/receipt identity; malformed duplicate keys/types/amount/date/keys and altered payload/actor cannot silently alias.
2. Successful same-key replay has one financial effect and immutable original outcome. Different body/actor conflicts. Two keys contending for the same charges and a direct AppSheet-style contender preserve V77 allocation/account consistency.
3. Durable rejection savepoint leaves no financial effect; an unrecognized engine exception leaves no journal and no partial money. Account/date/membership guards do not substitute calculations.
4. Before-commit failure rolls back both objects; deliberately lost COMMIT acknowledgement resolves by fresh journal status. A client request timeout is not labelled rejected solely because it timed out.
5. Restart the owned disposable PostgreSQL cluster with its same data directory, then read/replay with fresh process/connection state. If tooling instead proves only connection/process restart, label that narrower evidence rather than calling it database restart.
6. Actual ordinary source correction and deletion retain the original journal outcome and never cause a same-key reinsert. Replay after the Bangkok day changes bypasses new-command date restrictions. Current mapping denial remains effective.
7. Append-only UPDATE/DELETE/TRUNCATE failure, PK/unique/hash/envelope/outcome constraints, PUBLIC execution denial and no unintended grants. No protection claim against a database superuser deliberately disabling guards.

Use deterministic test barriers for contention/failure windows where possible; report actual proof rather than timing-only assumptions. No receipt bytes, live financial records, notifications or cloud permissions are part of these tests.

## Stop and remaining scope

Publish sanitized migration/contract/disposable evidence and show the owner what now survives restart, correction and deletion. Keep R052 Open and all seven receiving channels tracked. Do not call this live payment readiness: API authentication/writer authority, manual GCS mapping/roundtrip, event ownership/deduplication, full channel parity and live DEV application remain separate steps. Application rollback must retain the journal and Payment history; dropping it is not recovery.
